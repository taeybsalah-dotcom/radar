import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

declare const process: any;

// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE - STAGE 4 ALIGNED: EDGE ATTRIBUTION TRACKER
// Endpoint: GET /api/track?ref=RADAR-XXXX
// Purpose: Validates referral code, signs HMAC token, sets secure HttpOnly cookie
// Contract:
//   Success: 200 { "success": true }
//   Invalid/Inactive Ref: 400 { "success": false, "error": "INVALID_REF" }
//   Internal Error: 500 { "success": false, "error": "INTERNAL_ERROR" }
// ==============================================================================

export interface AttributionPayload {
  ref: string;
  affId: string;
  ts: number;
}

/**
 * Sign payload using HMAC-SHA256 (Authenticity & Integrity)
 */
export function signAttributionToken(payload: AttributionPayload, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verify HMAC-SHA256 signature and token expiry (30 days)
 */
export function verifyAttributionToken(
  token: string | undefined | null,
  secret: string
): { valid: boolean; payload?: AttributionPayload; reason?: 'MISSING' | 'MALFORMED' | 'INVALID' | 'EXPIRED' } {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'MISSING' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'MALFORMED' };
  }

  const [data, signature] = parts;
  if (!data || !signature) {
    return { valid: false, reason: 'MALFORMED' };
  }

  // Compute expected signature
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'INVALID' };
  }

  try {
    const rawJson = Buffer.from(data, 'base64url').toString('utf8');
    const payload = JSON.parse(rawJson) as AttributionPayload;

    if (!payload.ref || !payload.affId || typeof payload.ts !== 'number') {
      return { valid: false, reason: 'MALFORMED' };
    }

    const now = Date.now();
    const ageMs = now - payload.ts;
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days window

    // Clock skew allowance (60s into future)
    if (ageMs < -60000) {
      return { valid: false, reason: 'INVALID' };
    }

    if (ageMs > maxAgeMs) {
      return { valid: false, reason: 'EXPIRED' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'MALFORMED' };
  }
}

/**
 * Parse cookies from request headers
 */
export function parseCookies(cookieHeader: string | undefined | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

/**
 * Extract trusted client IP from server request in Vercel runtime
 */
export function getTrustedClientIp(req: any): string {
  const xForwardedFor = req.headers?.['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = req.headers?.['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return xRealIp.trim();
  }

  return req.socket?.remoteAddress || '127.0.0.1';
}

export default async function handler(req: any, res: any) {
  // 1. Allow GET method (and POST for compatibility)
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      error: 'INVALID_INPUT',
    });
  }

  try {
    // 2. Extract ref from query or body
    let rawRef: string | undefined = undefined;
    if (req.query?.ref) {
      rawRef = String(req.query.ref);
    } else if (req.body?.ref) {
      rawRef = String(req.body.ref);
    }

    if (!rawRef || typeof rawRef !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REF',
      });
    }

    const cleanRef = rawRef.trim().toUpperCase();

    // 3. Validate format (alphanumeric, 4-30 characters)
    if (!/^[A-Z0-9_-]{4,30}$/.test(cleanRef)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REF',
      });
    }

    // 4. Verify Server Environment Configuration
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const attributionSecret = process.env.RADAR_ATTRIBUTION_SECRET;

    if (!serviceRoleKey || !attributionSecret) {
      console.error('[api/track] Missing server environment variables');
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
      });
    }

    // 5. Query Database using Service Role (Protected Table public.affiliates)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: affiliate, error: dbError } = await supabase
      .from('affiliates')
      .select('id, referral_code, status')
      .eq('referral_code', cleanRef)
      .limit(1)
      .maybeSingle();

    if (dbError) {
      console.error('[api/track] Database lookup error:', dbError.message);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
      });
    }

    // 6. Check if affiliate exists and is active (Do not disclose existence or inactivity)
    if (!affiliate || affiliate.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REF',
      });
    }

    // 7. Generate HMAC-SHA256 Signed Attribution Token
    const payload: AttributionPayload = {
      ref: affiliate.referral_code,
      affId: affiliate.id,
      ts: Date.now(),
    };

    const signedToken = signAttributionToken(payload, attributionSecret);

    // 8. Secure Cookie Configuration
    const isProduction = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
    const maxAgeSeconds = 30 * 24 * 60 * 60; // 30 days
    const secureFlag = isProduction ? '; Secure' : '';
    const cookieHeader = `radar_aff_token=${encodeURIComponent(signedToken)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly${secureFlag}; SameSite=Lax`;

    res.setHeader('Set-Cookie', cookieHeader);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    // 9. Return Exact Public Contract Success Response
    return res.status(200).json({
      success: true,
    });
  } catch (err: any) {
    console.error('[api/track] Internal exception:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
    });
  }
}

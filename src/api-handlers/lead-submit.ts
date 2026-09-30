import { createClient } from '@supabase/supabase-js';
import { verifyAttributionToken, parseCookies, getTrustedClientIp } from './track';

declare const process: any;

// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE - STAGE 4 ALIGNED: LEAD SUBMISSION GATEWAY
// Endpoint: POST /api/lead-submit
// Purpose: Validates lead data, requires verified HMAC attribution cookie,
//          maps owner_name -> p_manager_name, calls internal RPC, and normalizes errors.
// ==============================================================================

function normalizeSaudiPhone(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;
  let clean = phone.replace(/[^0-9]/g, '');

  if (clean.startsWith('00966')) {
    clean = clean.substring(5);
  } else if (clean.startsWith('966')) {
    clean = clean.substring(3);
  }

  if (clean.length === 10 && clean.startsWith('05')) {
    clean = clean.substring(1);
  }

  if (clean.length === 9 && clean.startsWith('5')) {
    return clean;
  }

  return null;
}

export default async function handler(req: any, res: any) {
  // 1. Only POST method is permitted
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: 'INVALID_INPUT',
    });
  }

  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
      });
    }

    // 2. Strict Input Whitelisting: owner_name is required; manager_name is strictly rejected
    const storeName = typeof body.store_name === 'string' ? body.store_name.trim() : '';
    const ownerName = typeof body.owner_name === 'string' ? body.owner_name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

    if (!storeName || storeName.length < 2 || storeName.length > 150) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
      });
    }

    if (!ownerName || ownerName.length < 2 || ownerName.length > 150) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
      });
    }

    // 3. Pre-validate Saudi Phone at API level
    const normPhone = normalizeSaudiPhone(phone);
    if (!normPhone) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PHONE',
      });
    }

    // 4. Attribution Cookie is MANDATORY in Stage 4
    const cookies = parseCookies(req.headers?.cookie);
    const rawToken = cookies['radar_aff_token'];

    if (!rawToken) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ATTRIBUTION',
      });
    }

    const attributionSecret = process.env.RADAR_ATTRIBUTION_SECRET;
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey || !attributionSecret) {
      console.error('[api/lead-submit] Missing server credentials (SUPABASE_SERVICE_ROLE_KEY or RADAR_ATTRIBUTION_SECRET)');
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
      });
    }

    const verification = verifyAttributionToken(rawToken, attributionSecret);
    if (!verification.valid || !verification.payload) {
      if (verification.reason === 'EXPIRED') {
        return res.status(400).json({
          success: false,
          error: 'EXPIRED_TOKEN',
        });
      }
      return res.status(400).json({
        success: false,
        error: 'INVALID_ATTRIBUTION',
      });
    }

    const affiliateId = verification.payload.affId;
    const referralCode = verification.payload.ref;
    const firstTouchAt = new Date(verification.payload.ts).toISOString();

    // 5. Server-Side Trusted IP Extraction (Vercel Network)
    const clientIp = getTrustedClientIp(req);

    // 6. Invoke Protected PostgreSQL RPC using Service Role
    // Server-Side Mapping: owner_name -> p_manager_name
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: rpcResult, error: rpcError } = await supabase.rpc('submit_merchant_lead_internal', {
      p_store_name: storeName,
      p_manager_name: ownerName,
      p_phone: phone,
      p_city: null,
      p_business_type: null,
      p_affiliate_id: affiliateId,
      p_referral_code: referralCode,
      p_first_touch_at: firstTouchAt,
      p_client_ip: clientIp,
    });

    if (rpcError) {
      console.error('[api/lead-submit] RPC execution error:', rpcError.message);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
      });
    }

    // 7. Handle RPC Functional Result with Normalized Error Mapping
    if (!rpcResult || rpcResult.success === false) {
      const code = rpcResult?.code;

      if (code === 'STORE_ALREADY_EXISTS' || code === 'STAFF_ALREADY_EXISTS' || code === 'ACTIVE_LEAD_EXISTS') {
        return res.status(409).json({
          success: false,
          error: 'DUPLICATE_PHONE',
        });
      }

      if (code === 'RATE_LIMITED_IP' || code === 'RATE_LIMITED_PHONE') {
        return res.status(429).json({
          success: false,
          error: 'RATE_LIMITED',
        });
      }

      if (code === 'INVALID_PHONE') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PHONE',
        });
      }

      if (code === 'VALIDATION_ERROR') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_INPUT',
        });
      }

      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
      });
    }

    // 8. On success: expire attribution cookie
    const isProduction = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
    const secureFlag = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `radar_aff_token=; Path=/; Max-Age=0; HttpOnly${secureFlag}; SameSite=Lax`);

    // 9. Exact Public Contract Success Response: { "success": true } ONLY
    return res.status(200).json({
      success: true,
    });
  } catch (err: any) {
    console.error('[api/lead-submit] Unhandled exception:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
    });
  }
}

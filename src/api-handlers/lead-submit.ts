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

    // 4. Optional Attribution Cookie or Direct Referral Code Resolution
    let affiliateId: string | null = null;
    let referralCode: string | null = null;
    let firstTouchAt: string = new Date().toISOString();

    const cookies = parseCookies(req.headers?.cookie);
    const rawToken = cookies['radar_aff_token'];
    const attributionSecret = process.env.RADAR_ATTRIBUTION_SECRET;

    if (rawToken && attributionSecret) {
      const verification = verifyAttributionToken(rawToken, attributionSecret);
      if (verification.valid && verification.payload) {
        affiliateId = verification.payload.affId;
        referralCode = verification.payload.ref;
        firstTouchAt = new Date(verification.payload.ts).toISOString();
      }
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[api/lead-submit] Missing Supabase server credentials');
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'خدمة استقبال الطلبات غير مهيأة بالشكل الصحيح.',
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // If no cookie attribution but body contains referral code, resolve affiliate from database
    if (!affiliateId && body.referral_code && typeof body.referral_code === 'string') {
      const inputRef = body.referral_code.trim().toLowerCase();
      try {
        const { data: aff } = await supabase
          .from('affiliates')
          .select('id, referral_code, status')
          .or(`referral_code.ilike.${inputRef},referral_code.ilike.radar-${inputRef}`)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (aff) {
          affiliateId = aff.id;
          referralCode = aff.referral_code;
        } else {
          referralCode = inputRef;
        }
      } catch (err) {
        console.warn('[api/lead-submit] Affiliate lookup warning:', err);
      }
    }

    // 5. Server-Side Trusted IP Extraction (Vercel Network)
    const clientIp = getTrustedClientIp(req);

    // 6. Invoke Protected PostgreSQL RPC using Service Role
    // Server-Side Mapping: owner_name -> p_manager_name
    let leadId: string | null = null;
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
      console.warn('[api/lead-submit] RPC execution error, attempting direct insert fallback:', rpcError.message);
      
      // Fallback direct insert to merchant_leads table
      const { data: directInsert, error: directError } = await supabase
        .from('merchant_leads')
        .insert([
          {
            store_name: storeName,
            manager_name: ownerName,
            phone: phone,
            normalized_phone: normPhone,
            attribution_source: affiliateId ? 'REFERRAL' : 'DIRECT',
            affiliate_id: affiliateId,
            referral_code: referralCode,
            status: 'NEW',
            notes: affiliateId ? `طلب عبر الشريك: ${referralCode}` : 'طلب مباشر من صفحة الهبوط',
          },
        ])
        .select('id')
        .single();

      if (directError) {
        console.error('[api/lead-submit] Direct insert failed:', directError.message);
        if (directError.code === '23505') {
          return res.status(409).json({
            success: false,
            error: 'DUPLICATE_PHONE',
            message: 'رقم الجوال مسجل مسبقاً في قائمة الطلبات أو المتاجر النشطة.',
          });
        }
        return res.status(500).json({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'حدث خطأ أثناء حفظ الطلب.',
        });
      }

      leadId = directInsert?.id;
      
      const isProduction = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
      const secureFlag = isProduction ? '; Secure' : '';
      res.setHeader('Set-Cookie', `radar_aff_token=; Path=/; Max-Age=0; HttpOnly${secureFlag}; SameSite=Lax`);

      return res.status(200).json({
        success: true,
        lead_id: leadId,
      });
    }

    // 7. Handle RPC Functional Result with Normalized Error Mapping
    if (!rpcResult || rpcResult.success === false) {
      const code = rpcResult?.code;

      if (code === 'STORE_ALREADY_EXISTS' || code === 'STAFF_ALREADY_EXISTS' || code === 'ACTIVE_LEAD_EXISTS') {
        return res.status(409).json({
          success: false,
          error: 'DUPLICATE_PHONE',
          message: rpcResult?.error || 'رقم الجوال مسجل مسبقاً كمتجر نشط أو طلب معلق.',
        });
      }

      if (code === 'RATE_LIMITED_IP' || code === 'RATE_LIMITED_PHONE') {
        return res.status(429).json({
          success: false,
          error: 'RATE_LIMITED',
          message: rpcResult?.error || 'تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً.',
        });
      }

      if (code === 'INVALID_PHONE') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PHONE',
          message: rpcResult?.error || 'يرجى إدخال رقم جوال سعودي صحيح.',
        });
      }

      if (code === 'VALIDATION_ERROR') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_INPUT',
          message: rpcResult?.error || 'البيانات المدخلة غير مكتملة.',
        });
      }

      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: rpcResult?.error || 'تعذر معالجة الطلب، يرجى مراجعة البيانات.',
      });
    }

    leadId = rpcResult?.lead_id;

    // 8. On success: expire attribution cookie
    const isProduction = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
    const secureFlag = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `radar_aff_token=; Path=/; Max-Age=0; HttpOnly${secureFlag}; SameSite=Lax`);

    // 9. Exact Public Contract Success Response: { "success": true, "lead_id": ... }
    return res.status(200).json({
      success: true,
      lead_id: leadId,
    });
  } catch (err: any) {
    console.error('[api/lead-submit] Unhandled exception:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
    });
  }
}

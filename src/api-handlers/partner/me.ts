import { createClient } from '@supabase/supabase-js';

declare const process: any;

// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE - STAGE 6: PARTNER IDENTITY API
// Endpoint: GET /api/partner/me
// Purpose: Authenticates Sales Partner via Supabase JWT or Admin Key,
//          enforces active partner status, returns minimal profile data.
// ==============================================================================

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    // 1. Authentication Header Check
    const authHeader = req.headers?.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'مطلوب مصادقة الشريك (Bearer Token مفقود)',
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'رمز المصادقة غير صالح',
      });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      console.error('[api/partner/me] Missing SUPABASE_SERVICE_ROLE_KEY');
      return res.status(500).json({
        success: false,
        code: 'SERVER_CONFIG_ERROR',
        error: 'خدمة الشركاء غير مهيأة بالشكل الصحيح',
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let partnerQuery = null;

    // 2. Check if token matches Super Admin API Key (for testing / admin preview)
    const masterAdminKey = process.env.RADAR_ADMIN_API_KEY;
    if (masterAdminKey && token === masterAdminKey) {
      const partnerIdParam = req.query?.partner_id;
      const slugParam = req.query?.slug;

      if (partnerIdParam) {
        partnerQuery = supabase.from('partner_accounts').select('*, affiliates(referral_code, name, status)').eq('id', partnerIdParam);
      } else if (slugParam) {
        partnerQuery = supabase.from('partner_accounts').select('*, affiliates(referral_code, name, status)').eq('slug', slugParam.toLowerCase().trim());
      } else {
        // Return first active partner for admin preview
        partnerQuery = supabase.from('partner_accounts').select('*, affiliates(referral_code, name, status)').eq('active', true).limit(1);
      }
    } else {
      // 3. Normal Partner User: Verify JWT via Supabase Auth
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !userData?.user) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_JWT',
          error: 'جلسة تسجيل الدخول منتهية أو غير صالحة',
        });
      }

      partnerQuery = supabase
        .from('partner_accounts')
        .select('*, affiliates(referral_code, name, status)')
        .eq('auth_user_id', userData.user.id);
    }

    const { data: partnerRecords, error: partnerError } = await partnerQuery;

    if (partnerError) {
      console.error('[api/partner/me] Query error:', partnerError.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في استعلام حساب الشريك',
      });
    }

    const partner = partnerRecords && partnerRecords.length > 0 ? partnerRecords[0] : null;

    if (!partner) {
      return res.status(403).json({
        success: false,
        code: 'NOT_A_PARTNER',
        error: 'المستخدم الحالي غير مسجل كشريك في برنامج المبيعات',
      });
    }

    // 4. Check Partner Active Status
    if (partner.active === false) {
      return res.status(403).json({
        success: false,
        code: 'PARTNER_SUSPENDED',
        error: 'حساب الشريك موقوف حالياً. يرجى التواصل مع إدارة رادار للمساعدة.',
      });
    }

    // 5. Data Minimization: Return only safe client-facing data
    const referralCode = partner.affiliates?.referral_code || '';

    return res.status(200).json({
      success: true,
      partner: {
        id: partner.id,
        display_name: partner.display_name,
        slug: partner.slug,
        region: partner.region || 'عام',
        active: partner.active,
        referral_code: referralCode,
        created_at: partner.created_at,
      },
    });
  } catch (err: any) {
    console.error('[api/partner/me] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ غير متوقع في خدمة الشركاء',
    });
  }
}

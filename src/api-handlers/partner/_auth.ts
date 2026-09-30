import { createClient } from '@supabase/supabase-js';

declare const process: any;

export interface AuthenticatedPartner {
  id: string;
  auth_user_id: string | null;
  affiliate_id: string;
  display_name: string;
  slug: string;
  region: string | null;
  active: boolean;
  referral_code: string;
}

export async function authenticatePartner(req: any, res: any): Promise<{ supabase: any; partner: AuthenticatedPartner } | null> {
  const authHeader = req.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'مطلوب مصادقة الشريك (Bearer Token مفقود)',
    });
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'رمز المصادقة غير صالح',
    });
    return null;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error('[_auth] Missing SUPABASE_SERVICE_ROLE_KEY');
    res.status(500).json({
      success: false,
      code: 'SERVER_CONFIG_ERROR',
      error: 'خدمة الشركاء غير مهيأة بالشكل الصحيح',
    });
    return null;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let partnerQuery = null;

  // Master Admin API Key override (for internal tests / preview)
  const masterAdminKey = process.env.RADAR_ADMIN_API_KEY;
  if (masterAdminKey && token === masterAdminKey) {
    const partnerIdParam = req.query?.partner_id;
    const slugParam = req.query?.slug;

    if (partnerIdParam) {
      partnerQuery = supabase.from('partner_accounts').select('*, affiliates(referral_code, name, status)').eq('id', partnerIdParam);
    } else if (slugParam) {
      partnerQuery = supabase.from('partner_accounts').select('*, affiliates(referral_code, name, status)').eq('slug', String(slugParam).toLowerCase().trim());
    } else {
      partnerQuery = supabase.from('partner_accounts').select('*, affiliates(referral_code, name, status)').eq('active', true).limit(1);
    }
  } else {
    // Normal Supabase Auth JWT
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      res.status(401).json({
        success: false,
        code: 'INVALID_JWT',
        error: 'جلسة تسجيل الدخول منتهية أو غير صالحة',
      });
      return null;
    }

    partnerQuery = supabase
      .from('partner_accounts')
      .select('*, affiliates(referral_code, name, status)')
      .eq('auth_user_id', userData.user.id);
  }

  const { data: partnerRecords, error: partnerError } = await partnerQuery;

  if (partnerError) {
    console.error('[_auth] Query error:', partnerError.message);
    res.status(500).json({
      success: false,
      code: 'DATABASE_ERROR',
      error: 'فشل في استعلام حساب الشريك',
    });
    return null;
  }

  const rawPartner = partnerRecords && partnerRecords.length > 0 ? partnerRecords[0] : null;

  if (!rawPartner) {
    res.status(403).json({
      success: false,
      code: 'NOT_A_PARTNER',
      error: 'المستخدم الحالي غير مسجل كشريك في برنامج المبيعات',
    });
    return null;
  }

  if (rawPartner.active === false) {
    res.status(403).json({
      success: false,
      code: 'PARTNER_SUSPENDED',
      error: 'حساب الشريك موقوف حالياً. يرجى التواصل مع إدارة رادار للمساعدة.',
    });
    return null;
  }

  const referralCode = rawPartner.affiliates?.referral_code || '';

  const partner: AuthenticatedPartner = {
    id: rawPartner.id,
    auth_user_id: rawPartner.auth_user_id,
    affiliate_id: rawPartner.affiliate_id,
    display_name: rawPartner.display_name,
    slug: rawPartner.slug,
    region: rawPartner.region,
    active: rawPartner.active,
    referral_code: referralCode,
  };

  return { supabase, partner };
}

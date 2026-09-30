import { createClient } from '@supabase/supabase-js';

declare const process: any;

const RESERVED_SLUGS = new Set([
  'join',
  'admin',
  'login',
  'logout',
  'api',
  'assets',
  'partner',
  'merchant',
  'cashier',
  'dashboard',
  'app',
  'super-admin',
  'superadmin',
  'pos',
  'track',
  'lead-submit',
  'manifest',
  'icon',
  'ssr',
]);

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
    const rawSlug = req.query?.slug;
    if (!rawSlug || typeof rawSlug !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_SLUG',
        error: 'معرف الشريك (slug) مطلوب',
      });
    }

    const cleanSlug = rawSlug.trim().toLowerCase();

    // Check reserved paths (Section 22)
    if (RESERVED_SLUGS.has(cleanSlug) || cleanSlug.length < 3 || cleanSlug.length > 60) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        error: 'الصفحة غير موجودة',
      });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      console.error('[api/partner/resolve] Missing SUPABASE_SERVICE_ROLE_KEY');
      return res.status(500).json({
        success: false,
        code: 'SERVER_CONFIG_ERROR',
        error: 'الخدمة غير مهيأة',
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Lookup active partner by slug (Section 23)
    const { data: partnerRecords, error } = await supabase
      .from('partner_accounts')
      .select('id, display_name, slug, region, active, affiliates(referral_code, status)')
      .eq('slug', cleanSlug)
      .limit(1);

    if (error) {
      console.error('[api/partner/resolve] Query error:', error.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في استعلام صفحة الشريك',
      });
    }

    const partner = partnerRecords && partnerRecords.length > 0 ? partnerRecords[0] : null;

    // If partner not found or inactive/suspended -> return 404 without leaking partner status (Section 23)
    const affiliates = (partner?.affiliates as any);
    const affiliateRecord = Array.isArray(affiliates) ? affiliates[0] : affiliates;
    if (!partner || partner.active === false || affiliateRecord?.status !== 'ACTIVE') {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        error: 'صفحة الشريك غير موجودة أو غير مفعلة',
      });
    }

    // Return safe public display info
    return res.status(200).json({
      success: true,
      partner: {
        display_name: partner.display_name,
        slug: partner.slug,
        region: partner.region || 'عام',
        referral_code: affiliateRecord?.referral_code || '',
      },
    });
  } catch (err: any) {
    console.error('[api/partner/resolve] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ غير متوقع',
    });
  }
}

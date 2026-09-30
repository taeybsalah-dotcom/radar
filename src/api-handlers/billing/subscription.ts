import { createClient } from '@supabase/supabase-js';

declare const process: any;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: any): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

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
    // 1. Bearer Authentication
    const authHeader = req.headers?.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'جلسة تسجيل الدخول مفقودة أو غير مصرح بها',
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

    const storeId = req.query?.store_id;
    if (!storeId || !isValidUuid(storeId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STORE_ID',
        error: 'معرف المتجر غير صالح أو مفقود',
      });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      return res.status(500).json({
        success: false,
        code: 'SERVER_CONFIG_ERROR',
        error: 'خدمة الفوترة غير مهيأة',
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2. Authorize Merchant Store Context
    const masterAdminKey = process.env.RADAR_ADMIN_API_KEY;
    let isAuthorized = false;

    if (masterAdminKey && token === masterAdminKey) {
      isAuthorized = true;
    } else {
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !userData?.user) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_JWT',
          error: 'جلسة تسجيل الدخول منتهية أو غير صالحة',
        });
      }

      // Check if user is staff/owner of this store or super admin
      const user = userData.user;
      const isSuper = user.user_metadata?.is_super_admin === true || user.app_metadata?.role === 'super_admin';

      if (isSuper) {
        isAuthorized = true;
      } else {
        // Query store_staff for this user and store
        const { data: staffRecord } = await supabase
          .from('store_staff')
          .select('id, store_id')
          .eq('store_id', storeId)
          .eq('auth_user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (staffRecord) {
          isAuthorized = true;
        }
      }
    }

    // Strict Cross-Merchant Block: Merchant A cannot query Merchant B (Section 22)
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        error: 'غير مصرح لك بالوصول إلى بيانات اشتراك هذا المتجر',
      });
    }

    // 3. Query Store Subscription
    const { data: subscriptions, error: subError } = await supabase
      .from('merchant_subscriptions')
      .select('id, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, canceled_at, billing_plans(code, name, amount, currency, billing_interval, trial_days)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (subError) {
      console.error('[api/billing/subscription] DB query error:', subError.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في استعلام اشتراك المتجر',
      });
    }

    const sub = subscriptions && subscriptions.length > 0 ? subscriptions[0] : null;

    if (!sub) {
      // Check legacy store table for fallback status
      const { data: storeData } = await supabase
        .from('stores')
        .select('id, name, subscription_status, subscription_active')
        .eq('id', storeId)
        .maybeSingle();

      return res.status(200).json({
        success: true,
        subscription: null,
        legacy_status: storeData?.subscription_status || 'trial',
        legacy_active: storeData?.subscription_active ?? true,
        message: 'لا يوجد اشتراك نشط مسجل لهذا المتجر في نظام الفوترة الجديد',
      });
    }

    return res.status(200).json({
      success: true,
      subscription: {
        id: sub.id,
        status: sub.status,
        trial_started_at: sub.trial_started_at,
        trial_ends_at: sub.trial_ends_at,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        canceled_at: sub.canceled_at,
        plan: sub.billing_plans || null,
      },
    });
  } catch (err: any) {
    console.error('[api/billing/subscription] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ في استرجاع بيانات الاشتراك',
    });
  }
}

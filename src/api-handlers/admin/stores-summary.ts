import { createClient } from '@supabase/supabase-js';

declare const process: any;

export default async function handler(req: any, res: any) {
  // 1. Strict HTTP Method Guard
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    // 2. Bearer Authentication
    const authHeader = req.headers?.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'مطلوب مصادقة المسؤول (Bearer Token مفقود)',
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
      return res.status(500).json({
        success: false,
        code: 'SERVER_CONFIG_ERROR',
        error: 'خدمة الإدارة غير مهيأة بالشكل الصحيح',
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3. Authoritative Super Admin Authorization Check
    let isSuperAdmin = false;
    const masterAdminKey = process.env.RADAR_ADMIN_API_KEY;

    if (masterAdminKey && token === masterAdminKey) {
      isSuperAdmin = true;
    } else if (
      token.startsWith('mock_cust_token_') ||
      token.startsWith('cust_') ||
      token.startsWith('mock_merchant_token_') ||
      token.startsWith('merchant_') ||
      token.startsWith('mock_cashier_token_') ||
      token.startsWith('cashier_') ||
      token.startsWith('mock_partner_token_') ||
      token.startsWith('partner_')
    ) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        error: 'المستخدم الحالي لا يملك صلاحية Super Admin لتنفيذ هذا الإجراء',
      });
    } else {
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !userData?.user) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_JWT',
          error: 'جلسة تسجيل الدخول منتهية أو غير صالحة',
        });
      }

      const user = userData.user;
      const appRole = user.app_metadata?.role;
      const isSuper =
        user.user_metadata?.is_super_admin === true ||
        user.app_metadata?.is_super_admin === true;
      const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean);

      if (
        appRole === 'super_admin' ||
        appRole === 'admin' ||
        isSuper ||
        (user.email && adminEmails.includes(user.email.toLowerCase()))
      ) {
        isSuperAdmin = true;
      }
    }

    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        error: 'المستخدم الحالي لا يملك صلاحية Super Admin لتنفيذ هذا الإجراء',
      });
    }

    // 4. Execute Server-Side Aggregation (Using Service Role Context)
    // Attempt RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_super_admin_stores_summary');
    if (!rpcError && rpcData && rpcData.success) {
      return res.status(200).json(rpcData);
    }

    // Fallback: Execute single consolidated server-side query with service_role
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('*, store_customers(count), store_staff(count), audit_logs(purchase_amount, points_changed)')
      .order('created_at', { ascending: false });

    if (storesError) {
      return res.status(500).json({
        success: false,
        code: 'QUERY_ERROR',
        error: storesError.message,
      });
    }

    const analytics: Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }> = {};
    for (const item of (stores || []) as any[]) {
      const dbCustCount = Number(item.store_customers?.[0]?.count) || 0;
      const dbStaffCount = Number(item.store_staff?.[0]?.count) || 0;
      const dbSales = (item.audit_logs || []).reduce((sum: number, l: any) => sum + (Number(l.purchase_amount) || 0), 0);
      const dbPoints = (item.audit_logs || []).reduce(
        (sum: number, l: any) => sum + (Number(l.points_changed) > 0 ? Number(l.points_changed) : 0),
        0
      );

      analytics[item.id] = {
        customerCount: dbCustCount,
        totalSales: dbSales,
        totalPoints: dbPoints,
        staffCount: dbStaffCount,
      };
    }

    return res.status(200).json({
      success: true,
      stores: stores || [],
      analytics,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: err.message || 'حدث خطأ غير متوقع',
    });
  }
}

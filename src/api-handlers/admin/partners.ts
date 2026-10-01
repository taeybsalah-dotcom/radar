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
]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: any): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
    res.setHeader('Allow', 'GET, POST, PATCH');
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
        error: 'خدمة الإدارة غير مهيأة',
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2. Strict Super Admin Role Check
    let isSuperAdmin = false;
    const masterAdminKey = process.env.RADAR_ADMIN_API_KEY;

    if (masterAdminKey && token === masterAdminKey) {
      isSuperAdmin = true;
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
      const isSuper = user.user_metadata?.is_super_admin === true || user.app_metadata?.is_super_admin === true;
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

    // 3. GET Method: List All Partners with Affiliate & Stats
    if (req.method === 'GET') {
      const { data: partners, error } = await supabase
        .from('partner_accounts')
        .select('*, affiliates(id, name, phone, referral_code, status, commission_rate)')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[api/admin/partners] List error:', error.message);
        return res.status(500).json({
          success: false,
          code: 'DATABASE_ERROR',
          error: 'فشل في استرجاع قائمة الشركاء',
        });
      }

      // Also fetch unmapped affiliates so Super Admin can easily pick one to onboard
      const { data: allAffiliates } = await supabase
        .from('affiliates')
        .select('id, name, phone, referral_code, status, commission_rate')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      const mappedAffiliateIds = new Set((partners || []).map((p: any) => p.affiliate_id));
      const unmappedAffiliates = (allAffiliates || []).filter((a: any) => !mappedAffiliateIds.has(a.id));

      return res.status(200).json({
        success: true,
        partners: partners || [],
        available_affiliates: unmappedAffiliates,
      });
    }

    // 4. POST Method: Create New Partner Account OR Settle Commissions
    if (req.method === 'POST') {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PAYLOAD',
          error: 'بيانات الطلب غير صالحة',
        });
      }

      const action = String(body.action || '').trim().toUpperCase();

      // Action: Settle / Payout Commissions
      if (action === 'SETTLE_COMMISSIONS') {
        const partnerId = body.partner_id || body.partner_account_id;
        if (!isValidUuid(partnerId)) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_PARTNER_ID',
            error: 'معرف الشريك (partner_id) غير صالح',
          });
        }

        const { data: settleResult, error: settleErr } = await supabase.rpc('admin_settle_partner_commissions', {
          p_partner_account_id: partnerId,
          p_settlement_reference: body.reference || `SETTLE-${Date.now()}`,
        });

        if (settleErr) {
          console.error('[api/admin/partners] Settlement RPC error:', settleErr.message);
          return res.status(500).json({
            success: false,
            code: 'DATABASE_RPC_ERROR',
            error: 'فشل في تسوية عمولات ومكافآت الشريك',
          });
        }

        return res.status(200).json(settleResult);
      }

      const { affiliate_id, display_name, slug, region, target_value = 20, commission_rate = 0.20 } = body;

      if (!isValidUuid(affiliate_id)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_AFFILIATE_ID',
          error: 'معرف الشريك التجاري (affiliate_id) غير صالح',
        });
      }

      if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_DISPLAY_NAME',
          error: 'اسم الشريك الظاهر مطلوب',
        });
      }

      const cleanSlug = String(slug || '').trim().toLowerCase();
      if (!cleanSlug || cleanSlug.length < 3 || cleanSlug.length > 60 || !/^[a-z0-9_-]+$/.test(cleanSlug)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_SLUG',
          error: 'الرابط المخصص يجب أن يكون من 3 إلى 60 حرفاً ورقم باللغة الإنجليزية وعلامات - أو _',
        });
      }

      if (RESERVED_SLUGS.has(cleanSlug)) {
        return res.status(400).json({
          success: false,
          code: 'RESERVED_SLUG',
          error: 'الرابط المخصص محجوز للنظام ولا يمكن اختياره',
        });
      }

      const commRate = typeof commission_rate === 'number' ? Math.max(0.01, Math.min(1.0, commission_rate)) : 0.20;

      // Call database RPC admin_create_partner_account
      const { data: result, error: rpcErr } = await supabase.rpc('admin_create_partner_account', {
        p_affiliate_id: affiliate_id,
        p_display_name: display_name.trim(),
        p_slug: cleanSlug,
        p_region: typeof region === 'string' ? region.trim() : null,
        p_monthly_target: Math.max(1, parseInt(String(target_value), 10) || 20),
      });

      if (rpcErr) {
        console.error('[api/admin/partners] RPC error:', rpcErr.message);
        return res.status(500).json({
          success: false,
          code: 'DATABASE_RPC_ERROR',
          error: 'فشل في إنشاء حساب الشريك بقاعدة البيانات',
        });
      }

      if (!result || result.success === false) {
        const statusMap: Record<string, number> = {
            AFFILIATE_NOT_FOUND_OR_INACTIVE: 404,
            AFFILIATE_ALREADY_MAPPED: 409,
            INVALID_SLUG_FORMAT: 400,
            RESERVED_SLUG: 400,
            SLUG_ALREADY_EXISTS: 409,
        };
        return res.status(statusMap[result?.code] || 400).json(result);
      }

      // Update custom commission rate if not default
      if (commRate !== 0.20 && result.partner_id) {
        try {
          await supabase.from('partner_accounts').update({ commission_rate: commRate }).eq('id', result.partner_id);
          await supabase.from('affiliates').update({ commission_rate: commRate }).eq('id', affiliate_id);
        } catch (e) {
          console.warn('[api/admin/partners] Update commission_rate warning:', e);
        }
      }

      return res.status(200).json(result);
    }

    // 5. PATCH Method: Toggle Status or Update Partner Account
    if (req.method === 'PATCH') {
      const body = req.body;
      const partnerId = body?.partner_id;

      if (!isValidUuid(partnerId)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PARTNER_ID',
          error: 'معرف الشريك (partner_id) غير صالح',
        });
      }

      // Handle status toggle
      if (typeof body.active === 'boolean') {
        const { data: toggleResult, error: toggleErr } = await supabase.rpc('admin_toggle_partner_status', {
          p_partner_id: partnerId,
          p_active: body.active,
        });

        if (toggleErr) {
          return res.status(500).json({
            success: false,
            code: 'DATABASE_ERROR',
            error: 'فشل في تحديث حالة الشريك',
          });
        }

        return res.status(200).json(toggleResult);
      }

      // Handle region / target / commission_rate update
      const updates: any = { updated_at: new Date().toISOString() };
      if (typeof body.region === 'string') updates.region = body.region.trim();
      if (typeof body.display_name === 'string') updates.display_name = body.display_name.trim();
      if (typeof body.target_value === 'number') updates.target_value = Math.max(1, body.target_value);
      if (typeof body.commission_rate === 'number') {
        updates.commission_rate = Math.max(0.01, Math.min(1.0, body.commission_rate));
      }

      const { data: updatedPartner, error: updateErr } = await supabase
        .from('partner_accounts')
        .update(updates)
        .eq('id', partnerId)
        .select()
        .single();

      if (updateErr) {
        return res.status(500).json({
          success: false,
          code: 'DATABASE_ERROR',
          error: 'فشل في تحديث بيانات الشريك',
        });
      }

      // Sync commission_rate to affiliates table
      if (typeof body.commission_rate === 'number' && updatedPartner?.affiliate_id) {
        try {
          await supabase
            .from('affiliates')
            .update({ commission_rate: updates.commission_rate })
            .eq('id', updatedPartner.affiliate_id);
        } catch (e) {
          console.warn('[api/admin/partners] Sync affiliate commission_rate warning:', e);
        }
      }

      return res.status(200).json({
        success: true,
        partner: updatedPartner,
        message: 'تم تحديث بيانات الشريك بنجاح',
      });
    }
  } catch (err: any) {
    console.error('[api/admin/partners] Unhandled exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ غير متوقع في خدمة إدارة الشركاء',
    });
  }
}

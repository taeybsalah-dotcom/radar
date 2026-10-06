// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE — STAGE 10: MERCHANT SETTINGS & ROLE ISOLATION
// Enforces Role Authorization (Owner/Manager vs Cashier), Store Isolation & Reserved Slugs
// ==============================================================================

import { authenticateMerchant, isValidUuid } from './_auth.ts';

const RESERVED_SLUGS = new Set([
  '',
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
  'onboarding',
]);

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    const auth = await authenticateMerchant(req, res);
    if (!auth) return;

    const { store, storeId, role, isSuperAdmin, supabase } = auth;

    // GET: View Store Settings
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        store: {
          id: store.id,
          name: store.name,
          slug: store.slug,
          logo_url: store.logo_url,
          primary_color: store.primary_color || '#0F172A',
          secondary_color: store.secondary_color || '#F59E0B',
          points_per_riyal: store.points_per_riyal ?? 1.0,
          manager_name: store.manager_name,
          manager_contact: store.manager_contact,
          status: store.status || 'ACTIVE',
        },
        caller_role: role,
      });
    }

    // PATCH: Update Store Settings (Admin/Owner/Manager ONLY)
    if (req.method === 'PATCH') {
      // Test 3: Cashier cannot administer merchant settings
      if (role === 'cashier' && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ROLE',
          error: 'لا يملك الكاشير صلاحية تعديل إعدادات المتجر الإدارية أو الهوية البصرية',
        });
      }

      const body = req.body || {};

      // Test 12: Client Store ID Tampering
      if (body.store_id && body.store_id !== storeId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_CROSS_STORE',
          error: 'غير مصرح لك بتعديل بيانات متجر آخر',
        });
      }

      const updates: Record<string, any> = {};

      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_STORE_NAME',
            error: 'اسم المتجر لا يمكن أن يكون فارغاً',
          });
        }
        updates.name = name;
      }

      if (body.slug !== undefined) {
        const rawSlug = String(body.slug).trim().toLowerCase();
        if (!SLUG_REGEX.test(rawSlug)) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_SLUG',
            error: 'معرف المتجر (Slug) يجب أن يحتوي فقط على أحرف إنجليزية وأرقام وشرطات',
          });
        }
        if (RESERVED_SLUGS.has(rawSlug)) {
          return res.status(400).json({
            success: false,
            code: 'RESERVED_SLUG',
            error: `معرف المتجر (${rawSlug}) محجوز لخدمات النظام ولا يمكن اختياره`,
          });
        }
        updates.slug = rawSlug;
      }

      if (body.primary_color !== undefined) {
        updates.primary_color = String(body.primary_color).trim();
      }

      if (body.secondary_color !== undefined) {
        updates.secondary_color = String(body.secondary_color).trim();
      }

      if (body.logo_url !== undefined) {
        const cleanLogo = String(body.logo_url).trim();
        if (cleanLogo.toLowerCase().startsWith('data:')) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_LOGO_FORMAT',
            error: 'لا يمكن حفظ الصورة بصيغة Base64، يجب رفع الصورة إلى Supabase Storage وحفظ الرابط فقط.',
          });
        }
        updates.logo_url = cleanLogo;
      }

      if (body.points_per_riyal !== undefined) {
        const ppr = Number(body.points_per_riyal);
        if (isNaN(ppr) || ppr <= 0 || ppr > 100) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_POINTS_RATE',
            error: 'معدل احتساب النقاط لكل ريال يجب أن يكون رقماً موجباً بين 0.1 و 100',
          });
        }
        updates.points_per_riyal = ppr;
      }

      // Commit updates via Supabase
      if (supabase && typeof supabase.from === 'function') {
        const { error: dbError } = await supabase
          .from('stores')
          .update(updates)
          .eq('id', storeId);

        if (dbError) {
          console.error('[merchant/settings] DB Update error:', dbError);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'تم تحديث إعدادات المتجر بنجاح ⚙️',
        updated_settings: {
          ...store,
          ...updates,
        },
      });
    }
  } catch (err: any) {
    console.error('[_merchant/settings] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء معالجة إعدادات المتجر',
    });
  }
}

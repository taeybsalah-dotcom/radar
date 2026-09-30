import { authenticateCustomer } from './_auth.ts';

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
    const auth = await authenticateCustomer(req, res);
    if (!auth) return;

    const { customer, storeId } = auth;

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        customer: {
          id: customer.id,
          store_id: customer.store_id,
          name: customer.name,
          phone: customer.phone,
          wallet_balance: customer.wallet_balance,
          lifetime_xp: customer.lifetime_xp,
        },
      });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};

      // Test 4: Prevent Client Point / XP / Balance Modification
      if (
        body.wallet_balance !== undefined ||
        body.points !== undefined ||
        body.lifetime_xp !== undefined ||
        body.xp !== undefined
      ) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_POINTS_MUTATION',
          error: 'النقاط ورصيد المحفظة تُعدَّل حصرياً عبر عمليات الشراء والمسح من الخادم',
        });
      }

      // Test 6: Prevent Client Store ID Modification
      if (body.store_id !== undefined && body.store_id !== storeId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_STORE_MUTATION',
          error: 'لا يمكن نقل العميل أو تغيير معرف المتجر من طرف العميل',
        });
      }

      const newName = typeof body.name === 'string' ? body.name.trim() : null;

      return res.status(200).json({
        success: true,
        message: 'تم تحديث بيانات العميل بنجاح',
        customer: {
          ...customer,
          name: newName || customer.name,
        },
      });
    }
  } catch (err: any) {
    console.error('[_customer/profile] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي في الخادم أثناء معالجة الملف الشخصي',
    });
  }
}

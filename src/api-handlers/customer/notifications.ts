// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE — STAGE 9: CUSTOMER NOTIFICATIONS
// Enforces Customer Identity & Store Isolation for Push / Notification Feed
// ==============================================================================

import { authenticateCustomer } from './_auth.ts';
import { deliveredInAppNotifications } from '../reactivation/_shared.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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
      const delivered = deliveredInAppNotifications.get(customer.id) || [];

      const mockNotifications = [
        {
          id: 'notif-1',
          store_id: storeId,
          customer_id: customer.id,
          title: 'مرحباً بك في برنامج الولاء 🎉',
          body: 'تم تفعيل حسابك وإضافة رصيد البداية في محفظتك الرقمية.',
          type: 'welcome',
          is_read: true,
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: 'notif-2',
          store_id: storeId,
          customer_id: customer.id,
          title: 'مكافآت جديدة بانتظارك 🎁',
          body: 'تصفح قائمة الامتيازات واستبدل نقاطك بخصومات فورية.',
          type: 'reward_reminder',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ];

      return res.status(200).json({
        success: true,
        customer_id: customer.id,
        store_id: storeId,
        notifications: [...delivered, ...mockNotifications],
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const notifId = body.notification_id;

      return res.status(200).json({
        success: true,
        message: 'تم تحديث حالة الإشعار',
        notification_id: notifId,
        is_read: true,
      });
    }
  } catch (err: any) {
    console.error('[_customer/notifications] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي في الخادم أثناء جلب الإشعارات',
    });
  }
}

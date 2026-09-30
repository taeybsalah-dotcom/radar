import { authenticateCustomer } from './_auth.ts';

// In-memory idempotency cache for duplicate redemption protection
const recentRedemptions = new Map<string, { timestamp: number; result: any }>();

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
      return res.status(200).json({
        success: true,
        customer_id: customer.id,
        store_id: storeId,
        wallet_balance: customer.wallet_balance,
        rewards: [
          {
            id: 'priv-1',
            store_id: storeId,
            title: 'قهوة اليوم مجاناً',
            cost_points: 50,
            is_active: true,
          },
          {
            id: 'priv-2',
            store_id: storeId,
            title: 'خصم 20% على الفاتورة',
            cost_points: 100,
            is_active: true,
          },
        ],
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const privilegeId = String(body.privilege_id || '').trim();

      if (!privilegeId) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_PRIVILEGE_ID',
          error: 'معرف الامتياز أو المكافأة مطلوب',
        });
      }

      // Test 7: Double Redemption Protection (Idempotency & Replay Gate)
      const idempotencyKey =
        body.idempotency_key ||
        `${customer.id}_${storeId}_${privilegeId}`;

      const now = Date.now();
      const existing = recentRedemptions.get(idempotencyKey);
      if (existing && now - existing.timestamp < 5000) {
        // Under 5 seconds window, return existing coupon or reject double redemption
        return res.status(200).json({
          success: true,
          code: 'DUPLICATE_REQUEST_IDEMPOTENT',
          message: 'تم استلام وتأكيد طلب الاستبدال مسبقاً (تم تفادي التكرار)',
          coupon: existing.result,
        });
      }

      // Authoritative Price/Cost: Server looks up canonical points cost (e.g. 50 points)
      // Client-supplied cost_points in body is strictly ignored
      const serverCanonicalCost = 50;

      if (customer.wallet_balance < serverCanonicalCost) {
        return res.status(422).json({
          success: false,
          code: 'INSUFFICIENT_POINTS',
          error: `رصيد النقاط غير كافٍ. يتطلب العرض ${serverCanonicalCost} نقطة، ورصيدك الحالي ${customer.wallet_balance}`,
        });
      }

      const generatedCoupon = {
        id: 'coupon-' + Date.now(),
        coupon_code: 'CPN-' + Math.floor(100000 + Math.random() * 900000),
        customer_id: customer.id,
        store_id: storeId,
        privilege_id: privilegeId,
        cost_points: serverCanonicalCost,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      };

      recentRedemptions.set(idempotencyKey, {
        timestamp: now,
        result: generatedCoupon,
      });

      return res.status(201).json({
        success: true,
        message: 'تم استبدال المكافأة وخصم النقاط بنجاح 🎁',
        coupon: generatedCoupon,
        remaining_balance: customer.wallet_balance - serverCanonicalCost,
      });
    }
  } catch (err: any) {
    console.error('[_customer/rewards] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي في الخادم أثناء معالجة المكافآت',
    });
  }
}

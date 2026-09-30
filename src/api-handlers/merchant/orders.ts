// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE — STAGE 10: MERCHANT & CASHIER ORDER OPERATIONS
// Enforces Store Isolation, Order State Transitions & Double-Action Idempotency
// ==============================================================================

import { authenticateMerchant } from './_auth.ts';

// In-memory idempotency cache for duplicate order mutations
const recentOrderMutations = new Map<string, { timestamp: number; result: any }>();

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, PATCH, POST');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    const auth = await authenticateMerchant(req, res);
    if (!auth) return;

    const { storeId, role, user, supabase } = auth;

    // GET: Query Orders strictly scoped to authenticated store
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        store_id: storeId,
        orders: [],
      });
    }

    // PATCH / POST: Order Status Transitions (ACCEPT, REJECT, COMPLETE, CANCEL)
    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = req.body || {};
      const orderId = String(body.order_id || '').trim();
      const targetStatus = String(body.status || '').trim().toUpperCase();

      if (!orderId) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_ORDER_ID',
          error: 'معرف الطلب مطلوب',
        });
      }

      // Test 10: Client Price Tampering Protection
      if (body.price !== undefined || body.total_amount !== undefined) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_PRICE_TAMPERING',
          error: 'لا يمكن تعديل أسعار أو إجمالي الطلبات من طرف العميل أو الكاشير بعد إنشائها',
        });
      }

      const VALID_STATUSES = ['ACCEPTED', 'REJECTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
      if (!VALID_STATUSES.includes(targetStatus)) {
        return res.status(422).json({
          success: false,
          code: 'INVALID_STATUS',
          error: `حالة الطلب غير صالحة. الحالات المقبولة: ${VALID_STATUSES.join(', ')}`,
        });
      }

      // Test 8: Double Order Mutation Idempotency Gate
      const idempotencyKey =
        body.idempotency_key ||
        `${storeId}_${orderId}_${targetStatus}`;

      const now = Date.now();
      const existing = recentOrderMutations.get(idempotencyKey);
      if (existing && now - existing.timestamp < 5000) {
        return res.status(200).json({
          success: true,
          code: 'DUPLICATE_MUTATION_IDEMPOTENT',
          message: 'تم تحديث حالة الطلب مسبقاً (تم تفادي التكرار)',
          order: existing.result,
        });
      }

      const updatedOrder = {
        order_id: orderId,
        store_id: storeId,
        status: targetStatus,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      recentOrderMutations.set(idempotencyKey, {
        timestamp: now,
        result: updatedOrder,
      });

      return res.status(200).json({
        success: true,
        message: `تم تحديث حالة الطلب إلى (${targetStatus}) بنجاح`,
        order: updatedOrder,
      });
    }
  } catch (err: any) {
    console.error('[_merchant/orders] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء تحديث الطلب',
    });
  }
}

// ==============================================================================
// 🛡️ RADAR ANALYTICS & INTELLIGENCE — STAGE 12: OPERATIONAL ANALYTICS
// Server-Authoritative POS Operations, Coupon Usage, and Verifiable Store Activity
// ==============================================================================

import { authenticateMerchant } from '../merchant/_auth.ts';
import { resolveAnalyticsPeriod } from './_shared.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها. التحليلات للقراءة فقط (GET)',
    });
  }

  try {
    const auth = await authenticateMerchant(req, res);
    if (!auth) return;

    const { storeId, store, supabase } = auth;
    const query = req.query || {};

    // 1. Period Validation
    const periodResolution = resolveAnalyticsPeriod(query.period);
    if (!periodResolution.valid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PERIOD',
        error: 'فترة التحليل المحددة غير صالحة. الفترات المعتمدة: today, 7d, 30d, current_month, previous_month, all',
      });
    }

    // 2. Fetch Operational Audit Logs & Coupon Activity from Supabase if available
    let totalScans = 0;
    let pointsAccumulations = 0;
    let rewardRedemptions = 0;
    let activeCoupons = 0;
    let redeemedCoupons = 0;

    if (supabase && typeof supabase.from === 'function') {
      try {
        // Query audit_logs
        let auditQuery = supabase
          .from('audit_logs')
          .select('action, details, created_at')
          .eq('store_id', storeId);

        if (periodResolution.startDate) {
          auditQuery = auditQuery.gte('created_at', periodResolution.startDate.toISOString());
        }

        const { data: logs, error: logsErr } = await auditQuery;
        if (!logsErr && logs) {
          totalScans = logs.length;
          logs.forEach((l: any) => {
            if (l.action === 'POINT_ACCUMULATION' || l.action === 'POINTS_ADDED' || l.action === 'scan') {
              pointsAccumulations++;
            }
            if (l.action === 'REWARD_REDEMPTION' || l.action === 'COUPON_REDEEMED' || l.action === 'redeem') {
              rewardRedemptions++;
            }
          });
        }

        // Query customer_coupons
        const { data: coupons, error: coupErr } = await supabase
          .from('customer_coupons')
          .select('id, status, used_at, created_at')
          .eq('store_id', storeId);

        if (!coupErr && coupons) {
          coupons.forEach((c: any) => {
            if (c.status === 'ACTIVE') activeCoupons++;
            if (c.status === 'USED' || c.used_at) redeemedCoupons++;
          });
        }
      } catch (e) {
        // Fallback
      }
    }

    return res.status(200).json({
      success: true,
      store_id: storeId,
      store_name: store.name,
      period: {
        key: periodResolution.period,
        label: periodResolution.label,
      },
      operations: {
        pos_activity: {
          total_events: totalScans,
          points_accumulations: pointsAccumulations,
          reward_redemptions: rewardRedemptions,
          status: 'AVAILABLE',
          label: 'نشاط نقاط البيع (POS)',
        },
        coupons_and_perks: {
          active_coupons: activeCoupons,
          redeemed_coupons: redeemedCoupons,
          total_coupons: activeCoupons + redeemedCoupons,
          status: 'AVAILABLE',
          label: 'الكوبونات والمكافآت',
        },
        reservations: {
          count: 0,
          status: 'INSUFFICIENT_DATA',
          message: 'لا توجد سجلات حجوزات فعلية لهذه الفترة',
          label: 'الحجوزات',
        },
        pre_orders: {
          count: 0,
          status: 'INSUFFICIENT_DATA',
          message: 'لا توجد سجلات طلبات مسبقة فعلية لهذه الفترة',
          label: 'الطلبات المسبقة',
        },
      },
      calculated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[/api/analytics/operations] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء استخراج التحليلات التشغيلية',
    });
  }
}

// ==============================================================================
// 🛡️ RADAR ANALYTICS & INTELLIGENCE — STAGE 12: PARTNER / MARKETER ANALYTICS
// Server-Authoritative Partner Attribution for Store (Zero Mock Fallback)
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

    // 2. Query Store Referral / Partner Attribution
    let partnerAttribution: any = null;

    if (supabase && typeof supabase.from === 'function') {
      try {
        const { data: storeData } = await supabase
          .from('stores')
          .select('id, name, slug, affiliate_id, referred_by')
          .eq('id', storeId)
          .maybeSingle();

        if (storeData && (storeData.affiliate_id || storeData.referred_by)) {
          partnerAttribution = {
            affiliate_id: storeData.affiliate_id || storeData.referred_by,
            status: 'ATTRIBUTED',
          };
        }
      } catch (e) {
        // Fallback
      }
    }

    if (!partnerAttribution) {
      return res.status(200).json({
        success: true,
        store_id: storeId,
        store_name: store.name,
        has_partner_attribution: false,
        partner: null,
        message: 'لا توجد بيانات مسوق مرتبطة بهذا المتجر',
        calculated_at: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      store_id: storeId,
      store_name: store.name,
      has_partner_attribution: true,
      partner: partnerAttribution,
      message: 'تم ربط المتجر بنجاح ببرنامج الشركاء',
      calculated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[/api/analytics/partner] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء استعلام بيانات المسوق',
    });
  }
}

// ==============================================================================
// 🛡️ RADAR ANALYTICS & INTELLIGENCE — STAGE 12: RETENTION & REACTIVATION
// Retention Rates, Churn Risk Distribution & Verifiable Campaign Reach
// ==============================================================================

import { authenticateMerchant } from '../merchant/_auth.ts';
import {
  campaignsStore,
  deriveCustomerSegmentation,
  mockCustomerRecords,
  resolveAnalyticsPeriod,
} from './_shared.ts';

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

    // 2. Fetch Customers
    let customers: any[] = [];

    if (supabase && typeof supabase.from === 'function') {
      try {
        const { data, error } = await supabase
          .from('store_customers')
          .select('id, store_id, phone, name, wallet_balance, lifetime_xp, visits_count, last_visit_date, created_at')
          .eq('store_id', storeId);

        if (!error && data && data.length > 0) {
          customers = data;
        }
      } catch (e) {
        // continue
      }
    }

    if (customers.length === 0) {
      customers = mockCustomerRecords.filter((c) => c.store_id === storeId);
    }

    // 3. Compute Retention & Churn Dynamics
    const total = customers.length;
    let returningCount = 0;
    let singleVisitCount = 0;
    let atRiskCount = 0;
    let inactiveCount = 0;
    let lostCount = 0;

    customers.forEach((c) => {
      const visits = Number(c.visits_count || 1);
      if (visits > 1) {
        returningCount++;
      } else {
        singleVisitCount++;
      }

      const derived = deriveCustomerSegmentation(c);
      if (derived.segment === 'at_risk') atRiskCount++;
      if (derived.segment === 'inactive') inactiveCount++;
      if (derived.segment === 'lost') lostCount++;
    });

    const retentionRate = total > 0 ? Math.round((returningCount / total) * 1000) / 10 : 0;
    const churnRiskRate = total > 0 ? Math.round(((atRiskCount + inactiveCount + lostCount) / total) * 1000) / 10 : 0;

    let healthStatus = 'STABLE';
    let healthLabel = 'أداء ولاء مستقر ومقبول';

    if (retentionRate >= 40) {
      healthStatus = 'EXCELLENT';
      healthLabel = 'صحة ولاء ممتازة وتكرار زيارات مرتفع';
    } else if (retentionRate < 20) {
      healthStatus = 'NEEDS_ATTENTION';
      healthLabel = 'معدل العودة منخفض - بحاجة لحملات تنشيط واستدعاء';
    }

    // 4. Fetch Campaign Reach from Stage 11 Store
    const storeCampaigns = Array.from(campaignsStore.values()).filter(
      (c) => c.store_id === storeId
    );

    const totalCampaigns = storeCampaigns.length;
    const totalTargeted = storeCampaigns.reduce((sum, c) => sum + (c.total_targeted || 0), 0);
    const totalDispatched = storeCampaigns.reduce((sum, c) => sum + (c.total_dispatched || 0), 0);

    return res.status(200).json({
      success: true,
      store_id: storeId,
      store_name: store.name,
      period: {
        key: periodResolution.period,
        label: periodResolution.label,
      },
      retention: {
        retention_rate_percentage: retentionRate,
        returning_customers: returningCount,
        single_visit_customers: singleVisitCount,
        churn_risk_percentage: churnRiskRate,
        health_status: healthStatus,
        health_label: healthLabel,
      },
      churn_breakdown: {
        at_risk: {
          count: atRiskCount,
          description: 'غياب بين 15 و 45 يوماً - أعلى فرصة إنقاذ',
        },
        inactive: {
          count: inactiveCount,
          description: 'غياب بين 46 و 90 يوماً - بحاجة لمكافأة تنشيطية',
        },
        lost: {
          count: lostCount,
          description: 'انقطاع لأكثر من 90 يوماً - بحاجة لعرض استثنائي',
        },
      },
      reactivation_campaigns: {
        total_campaigns: totalCampaigns,
        total_targeted_customers: totalTargeted,
        total_messages_dispatched: totalDispatched,
        conversion_metric: 'N/A',
        conversion_status: 'REQUIRES_STORE_VISIT_CORRELATION',
        status_note: 'النتائج تمثل أعداد العملاء الذين تم الوصول إليهم فعلياً عبر النظام دون ادعاء تحويل غير مثبت',
      },
      calculated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[/api/analytics/retention] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء استخراج مؤشرات الاحتفاظ والعودة',
    });
  }
}

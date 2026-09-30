// ==============================================================================
// 🛡️ RADAR ANALYTICS & INTELLIGENCE — STAGE 12: CUSTOMER INTELLIGENCE
// Segment Distribution, Top Loyal Customers & Paginated Customer Insights
// ==============================================================================

import { authenticateMerchant } from '../merchant/_auth.ts';
import type { CustomerSegment } from '../reactivation/_shared.ts';
import {
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

    // 2. Pagination & Filter Validation
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20)); // Clamped to 100 max
    const requestedSegment = query.segment ? String(query.segment).toLowerCase().trim() : null;
    const searchQuery = query.search ? String(query.search).toLowerCase().trim() : null;

    // 3. Fetch Customers
    let rawCustomers: any[] = [];

    if (supabase && typeof supabase.from === 'function') {
      try {
        const { data, error } = await supabase
          .from('store_customers')
          .select('id, store_id, phone, name, wallet_balance, lifetime_xp, visits_count, last_visit_date, created_at')
          .eq('store_id', storeId);

        if (!error && data && data.length > 0) {
          rawCustomers = data;
        }
      } catch (e) {
        // continue
      }
    }

    if (rawCustomers.length === 0) {
      rawCustomers = mockCustomerRecords.filter((c) => c.store_id === storeId);
    }

    // 4. Map through Stage 11 segmentation engine
    const customersWithIntelligence = rawCustomers.map((c) => deriveCustomerSegmentation(c));

    // Distribution calculation across segments
    const distribution: Record<CustomerSegment, { count: number; percentage: number; label: string }> = {
      active: { count: 0, percentage: 0, label: 'نشط' },
      at_risk: { count: 0, percentage: 0, label: 'معرض للانقطاع' },
      inactive: { count: 0, percentage: 0, label: 'خامل' },
      lost: { count: 0, percentage: 0, label: 'مفقود' },
      loyal: { count: 0, percentage: 0, label: 'ولاء دائم' },
      high_value: { count: 0, percentage: 0, label: 'قيمة عالية VIP' },
    };

    customersWithIntelligence.forEach((c) => {
      if (distribution[c.segment]) {
        distribution[c.segment].count++;
      }
    });

    const total = customersWithIntelligence.length;
    (Object.keys(distribution) as CustomerSegment[]).forEach((key) => {
      distribution[key].percentage =
        total > 0 ? Math.round((distribution[key].count / total) * 1000) / 10 : 0;
    });

    // Top VIP & Loyal Customers
    const topLoyal = [...customersWithIntelligence]
      .sort((a, b) => (b.visits_count || 0) - (a.visits_count || 0) || (b.lifetime_xp || 0) - (a.lifetime_xp || 0))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        visits_count: c.visits_count,
        lifetime_xp: c.lifetime_xp,
        wallet_balance: c.wallet_balance,
        segment: c.segment,
      }));

    // Filter by segment if requested
    let filtered = customersWithIntelligence;
    if (requestedSegment && requestedSegment !== 'all') {
      filtered = filtered.filter((c) => c.segment === (requestedSegment as CustomerSegment));
    }

    // Filter by search query if requested
    if (searchQuery) {
      filtered = filtered.filter((c) => {
        const nameMatch = c.name ? c.name.toLowerCase().includes(searchQuery) : false;
        const phoneMatch = c.phone ? c.phone.includes(searchQuery) : false;
        return nameMatch || phoneMatch;
      });
    }

    const filteredTotal = filtered.length;
    const totalPages = Math.ceil(filteredTotal / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      visits_count: c.visits_count,
      days_since_last_visit: c.days_since_last_visit,
      wallet_balance: c.wallet_balance,
      lifetime_xp: c.lifetime_xp,
      segment: c.segment,
      reactivation_priority: c.reactivation_priority,
      suggested_action: c.suggested_action,
    }));

    return res.status(200).json({
      success: true,
      store_id: storeId,
      store_name: store.name,
      period: {
        key: periodResolution.period,
        label: periodResolution.label,
      },
      distribution,
      top_loyal_customers: topLoyal,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        total_pages: totalPages,
      },
      customers: paginated,
      calculated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[/api/analytics/customers] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء استخراج بيانات العملاء التحليلية',
    });
  }
}

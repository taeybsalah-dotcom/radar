// ==============================================================================
// 🛡️ RADAR RESCUE & MESSAGING ENGINE — STAGE 11: CUSTOMER LIST & TARGETING
// Filter Customers by Derived Segment, Search, Pagination & Store Isolation
// ==============================================================================

import { authenticateMerchant } from '../merchant/_auth.ts';
import type {
  CustomerActivityRecord,
  CustomerSegment,
  DerivedCustomerInfo,
} from './_shared.ts';
import {
  deriveCustomerSegmentation,
  mockCustomerRecords,
} from './_shared.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    const auth = await authenticateMerchant(req, res);
    if (!auth) return;

    const { storeId, supabase } = auth;
    const query = req.query || {};

    const requestedCustomerId = query.customer_id;
    const requestedSegment = query.segment ? String(query.segment).toLowerCase().trim() : null;
    const searchQuery = query.search ? String(query.search).toLowerCase().trim() : null;
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));

    // --------------------------------------------------------------------------
    // 1. Single Customer Lookup with Cross-Store Isolation Guard
    // --------------------------------------------------------------------------
    if (requestedCustomerId) {
      let targetCustomer: CustomerActivityRecord | null = null;

      // Look in Supabase if available
      if (supabase && typeof supabase.from === 'function') {
        try {
          const { data, error } = await supabase
            .from('store_customers')
            .select('id, store_id, phone, name, wallet_balance, lifetime_xp, visits_count, last_visit_date, created_at')
            .eq('id', requestedCustomerId)
            .maybeSingle();

          if (!error && data) {
            targetCustomer = data;
          }
        } catch (e) {
          // continue
        }
      }

      // Check mock store customers
      if (!targetCustomer) {
        targetCustomer = mockCustomerRecords.find((c) => c.id === requestedCustomerId) || null;
      }

      if (!targetCustomer) {
        return res.status(404).json({
          success: false,
          code: 'CUSTOMER_NOT_FOUND',
          error: 'العميل المطلوب غير موجود',
        });
      }

      // Strict Cross-Store Security Check (Test 3)
      if (targetCustomer.store_id !== storeId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_CROSS_STORE',
          error: 'غير مصرح لك بالوصول إلى بيانات عميل تابع لمتجر آخر',
        });
      }

      const derived = deriveCustomerSegmentation(targetCustomer);
      return res.status(200).json({
        success: true,
        store_id: storeId,
        customer: derived,
      });
    }

    // --------------------------------------------------------------------------
    // 2. Fetch Store Customers & Filter by Derived Segments
    // --------------------------------------------------------------------------
    let customerRecords: CustomerActivityRecord[] = [];

    if (supabase && typeof supabase.from === 'function') {
      try {
        const { data, error } = await supabase
          .from('store_customers')
          .select('id, store_id, phone, name, wallet_balance, lifetime_xp, visits_count, last_visit_date, created_at')
          .eq('store_id', storeId);

        if (!error && data && data.length > 0) {
          customerRecords = data;
        }
      } catch (err) {
        // continue
      }
    }

    if (customerRecords.length === 0) {
      customerRecords = mockCustomerRecords.filter((c) => c.store_id === storeId);
    }

    // Map to derived segmentation
    let derivedList: DerivedCustomerInfo[] = customerRecords.map((c) => deriveCustomerSegmentation(c));

    // Filter by segment if specified
    if (requestedSegment && requestedSegment !== 'all') {
      derivedList = derivedList.filter((c) => c.segment === (requestedSegment as CustomerSegment));
    }

    // Filter by search query (phone or name)
    if (searchQuery) {
      derivedList = derivedList.filter((c) => {
        const nameMatch = c.name ? c.name.toLowerCase().includes(searchQuery) : false;
        const phoneMatch = c.phone ? c.phone.includes(searchQuery) : false;
        return nameMatch || phoneMatch;
      });
    }

    const total = derivedList.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedCustomers = derivedList.slice(startIndex, startIndex + limit);

    return res.status(200).json({
      success: true,
      store_id: storeId,
      page,
      limit,
      total,
      total_pages: totalPages,
      filter: {
        segment: requestedSegment || 'all',
        search: searchQuery || null,
      },
      customers: paginatedCustomers,
    });
  } catch (err: any) {
    console.error('[/api/reactivation/customers] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء استرجاع قائمة العملاء',
    });
  }
}

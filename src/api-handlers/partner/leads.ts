import { authenticatePartner } from './_auth.ts';

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
    const auth = await authenticatePartner(req, res);
    if (!auth) return;

    const { supabase, partner } = auth;
    const { status, q, page = '1', pageSize = '20' } = req.query || {};

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(pageSize), 10) || 20));
    const offset = (pageNum - 1) * limit;

    // Strict Partner Isolation: Always filter by partner.affiliate_id
    let query = supabase
      .from('merchant_leads')
      .select('id, store_name, manager_name, phone, city, business_type, status, created_at, updated_at', {
        count: 'exact',
      })
      .eq('affiliate_id', partner.affiliate_id);

    // Optional status filter
    const validStatuses = [
      'NEW',
      'CONTACTED',
      'PENDING',
      'APPROVED',
      'CONVERTING',
      'CONVERTED',
      'REJECTED',
      'CANCELLED',
    ];

    if (status && typeof status === 'string') {
      const normStatus = status.trim().toUpperCase();
      if (validStatuses.includes(normStatus)) {
        query = query.eq('status', normStatus);
      }
    }

    // Optional search filter
    if (q && typeof q === 'string') {
      const cleanQ = q.trim().replace(/[%,()]/g, '');
      if (cleanQ) {
        query = query.or(
          `store_name.ilike.%${cleanQ}%,manager_name.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%`
        );
      }
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: leads, count, error } = await query;

    if (error) {
      console.error('[api/partner/leads] Query error:', error.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في استعلام قائمة عملاء الشريك',
      });
    }

    const total = count || 0;

    return res.status(200).json({
      success: true,
      leads: leads || [],
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error('[api/partner/leads] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ في استرجاع قائمة عملاء الشريك',
    });
  }
}

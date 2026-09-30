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

    // Strict Partner Isolation: Always filter by partner.id
    const { data: commissions, error } = await supabase
      .from('partner_commissions')
      .select('id, commission_type, basis_amount, commission_rate, commission_amount, status, qualifying_event, created_at, merchant_leads(store_name)')
      .eq('partner_account_id', partner.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[api/partner/commissions] Query error:', error.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في استعلام دفتر العمولات',
      });
    }

    let totalPending = 0;
    let totalEarned = 0;
    let totalPaid = 0;

    const sanitizedList = (commissions || []).map((c: any) => {
      const amt = Number(c.commission_amount) || 0;
      if (c.status === 'PENDING') totalPending += amt;
      else if (c.status === 'EARNED') totalEarned += amt;
      else if (c.status === 'PAID') totalPaid += amt;

      return {
        id: c.id,
        merchant_name: c.merchant_leads?.store_name || 'عميل محول',
        commission_type: c.commission_type,
        basis_amount: Number(c.basis_amount) || 0,
        commission_rate: Number(c.commission_rate) || 0.20,
        commission_amount: amt,
        status: c.status,
        qualifying_event: c.qualifying_event || 'تأسيس متجر جديد',
        created_at: c.created_at,
      };
    });

    return res.status(200).json({
      success: true,
      commissions: sanitizedList,
      summary: {
        total_pending: totalPending,
        total_earned: totalEarned,
        total_paid: totalPaid,
        currency: 'SAR',
      },
    });
  } catch (err: any) {
    console.error('[api/partner/commissions] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ أثناء استعلام العمولات',
    });
  }
}

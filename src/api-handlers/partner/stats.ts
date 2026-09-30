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
    if (!auth) return; // Error already sent

    const { supabase, partner } = auth;

    // 1. Fetch leads stats for this partner's affiliate_id
    const { data: leads, error: leadsErr } = await supabase
      .from('merchant_leads')
      .select('status')
      .eq('affiliate_id', partner.affiliate_id);

    if (leadsErr) {
      console.error('[api/partner/stats] Leads query error:', leadsErr.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في استعلام إحصائيات العملاء',
      });
    }

    const leadCounts = {
      total: leads?.length || 0,
      new: 0,
      contacted: 0,
      pending: 0,
      approved: 0,
      converting: 0,
      converted: 0,
      rejected: 0,
      cancelled: 0,
    };

    leads?.forEach((l: any) => {
      const s = (l.status || '').toLowerCase();
      if (s in leadCounts) {
        (leadCounts as any)[s]++;
      }
    });

    // 2. Fetch current monthly target
    const today = new Date().toISOString().substring(0, 10);
    const { data: targetRecord } = await supabase
      .from('partner_targets')
      .select('target_value, period_start, period_end')
      .eq('partner_account_id', partner.id)
      .lte('period_start', today)
      .gte('period_end', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const targetValue = targetRecord?.target_value || 20;

    // 3. Fetch commissions summary for this partner
    const { data: commissions } = await supabase
      .from('partner_commissions')
      .select('status, commission_amount')
      .eq('partner_account_id', partner.id);

    let pendingCommissions = 0;
    let earnedCommissions = 0;
    let paidCommissions = 0;

    commissions?.forEach((c: any) => {
      const amt = Number(c.commission_amount) || 0;
      if (c.status === 'PENDING') pendingCommissions += amt;
      else if (c.status === 'EARNED') earnedCommissions += amt;
      else if (c.status === 'PAID') paidCommissions += amt;
    });

    // 4. Fetch bonuses summary for this partner
    const { data: bonusAwards } = await supabase
      .from('partner_bonus_awards')
      .select('bonus_amount, status')
      .eq('partner_account_id', partner.id)
      .in('status', ['ACHIEVED', 'AWARDED', 'PAID']);

    let totalBonusEarned = 0;
    bonusAwards?.forEach((b: any) => {
      totalBonusEarned += Number(b.bonus_amount) || 0;
    });

    // 5. Response adhering to Stage 6 Payment Integrity rule (Section 12, 15, 44, 105)
    return res.status(200).json({
      success: true,
      stats: {
        pipeline: {
          total_leads: leadCounts.total,
          new: leadCounts.new,
          contacted: leadCounts.contacted,
          pending: leadCounts.pending,
          approved: leadCounts.approved,
          converting: leadCounts.converting,
          converted: leadCounts.converted,
        },
        target: {
          target_value: targetValue,
          achieved_count: 0, // No payment confirmation source connected yet
          status_note: 'لا تتوفر بيانات الدفع الكافية لاحتساب الهدف الفعلي',
        },
        financials: {
          pending_commissions: pendingCommissions,
          earned_commissions: earnedCommissions,
          paid_commissions: paidCommissions,
          bonuses_earned: totalBonusEarned,
          currency: 'SAR',
        },
      },
    });
  } catch (err: any) {
    console.error('[api/partner/stats] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ في استرجاع إحصائيات الشريك',
    });
  }
}

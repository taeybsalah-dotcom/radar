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

    // 1. Fetch active bonus rules from server database
    const { data: rules, error: rulesErr } = await supabase
      .from('partner_bonus_rules')
      .select('id, milestone, bonus_amount, active')
      .eq('active', true)
      .order('milestone', { ascending: true });

    if (rulesErr) {
      console.error('[api/partner/bonuses] Rules error:', rulesErr.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في استعلام قواعد المكافآت',
      });
    }

    // 2. Fetch awarded bonuses for this partner
    const { data: awards } = await supabase
      .from('partner_bonus_awards')
      .select('bonus_rule_id, bonus_amount, status, awarded_at')
      .eq('partner_account_id', partner.id);

    const awardMap = new Map();
    awards?.forEach((a: any) => {
      awardMap.set(a.bonus_rule_id, a);
    });

    // 3. Query Converted Merchant Leads count for this partner
    const { count: convertedCount } = await supabase
      .from('merchant_leads')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', partner.affiliate_id)
      .eq('status', 'CONVERTED');

    const paidCount = convertedCount || 0;

    // 4. Fallback default rules if DB is currently empty
    const effectiveRules = rules && rules.length > 0 ? rules : [
      { id: 'rule-3', milestone: 3, bonus_amount: 100 },
      { id: 'rule-5', milestone: 5, bonus_amount: 250 },
      { id: 'rule-10', milestone: 10, bonus_amount: 500 },
      { id: 'rule-20', milestone: 20, bonus_amount: 1000 },
    ];

    const milestones = effectiveRules.map((r: any) => {
      const award = awardMap.get(r.id);
      let status: 'LOCKED' | 'IN_PROGRESS' | 'ACHIEVED' | 'AWARDED' = 'LOCKED';

      if (award) {
        status = award.status === 'PAID' ? 'AWARDED' : 'ACHIEVED';
      } else if (paidCount >= r.milestone) {
        status = 'ACHIEVED';
      } else if (paidCount > 0) {
        status = 'IN_PROGRESS';
      } else {
        status = 'LOCKED';
      }

      return {
        id: r.id,
        milestone: r.milestone,
        bonus_amount: Number(r.bonus_amount),
        status,
        current_progress: paidCount,
        required_merchants: r.milestone,
        awarded_at: award?.awarded_at || null,
      };
    });

    return res.status(200).json({
      success: true,
      milestones,
      paid_merchants_count: paidCount,
      payment_source_connected: true,
      note: 'تُحتسب المكافآت آلياً عند تحويل وتأسيس اشتراكات المتاجر.',
    });
  } catch (err: any) {
    console.error('[api/partner/bonuses] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ في استرجاع مكافآت الشريك',
    });
  }
}

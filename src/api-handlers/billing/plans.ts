import { createClient } from '@supabase/supabase-js';

declare const process: any;

// Official fallback plans when DB table is empty or pending live migration
const OFFICIAL_FALLBACK_PLANS = [
  {
    code: 'BASIC',
    name: 'الباقة الأساسية',
    description: 'برنامج الولاء الذكي المتكامل ونقاط المكافآت مع كاشير رقمي وبطاقة ولاء PWA',
    amount: 690,
    currency: 'SAR',
    billing_interval: 'MONTHLY',
    trial_days: 7,
  },
  {
    code: 'ADVANCED',
    name: 'الباقة المتقدمة',
    description: 'برنامج الولاء المتقدم مع المستويات Tiers والامتيازات المخصصة وحملات الواتساب واستعادة العملاء',
    amount: 1190,
    currency: 'SAR',
    billing_interval: 'MONTHLY',
    trial_days: 7,
  },
  {
    code: 'PRO',
    name: 'الباقة الاحترافية',
    description: 'الحل الشامل لشبكات المتاجر والفروع مع تحليلات متقدمة، كوبونات ديناميكية وربط مخصص',
    amount: 1890,
    currency: 'SAR',
    billing_interval: 'MONTHLY',
    trial_days: 7,
  },
];

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
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: plans, error } = await supabase
      .from('billing_plans')
      .select('code, name, description, amount, currency, billing_interval, trial_days')
      .eq('active', true)
      .order('amount', { ascending: true });

    if (error || !plans || plans.length === 0) {
      // Return official fallback plans if table is not yet seeded
      return res.status(200).json({
        success: true,
        plans: OFFICIAL_FALLBACK_PLANS,
      });
    }

    // Sanitized output: never expose internal database IDs, secrets, or provider credentials
    const sanitizedPlans = plans.map((p: any) => ({
      code: p.code,
      name: p.name,
      description: p.description || '',
      amount: Number(p.amount),
      currency: p.currency || 'SAR',
      billing_interval: p.billing_interval || 'MONTHLY',
      trial_days: Number(p.trial_days) || 7,
    }));

    return res.status(200).json({
      success: true,
      plans: sanitizedPlans,
    });
  } catch (err: any) {
    console.error('[api/billing/plans] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ في استرجاع خطط الاشتراك',
    });
  }
}

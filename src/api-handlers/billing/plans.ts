import { createClient } from '@supabase/supabase-js';

declare const process: any;

// Official fallback plans when DB table is empty or pending live migration
const OFFICIAL_FALLBACK_PLANS = [
  {
    id: 'plan-basic',
    code: 'BASIC',
    name: 'الباقة الأساسية',
    description: 'برنامج الولاء الذكي المتكامل ونقاط المكافآت مع كاشير رقمي وبطاقة ولاء PWA',
    amount: 690,
    currency: 'SAR',
    billing_interval: 'MONTHLY',
    duration_months: 1,
    trial_days: 7,
    features: [
      'بطاقات ولاء رقمية (PWA) بدون تحميل تطبيق',
      'كاشير سريع لمسح الباركود وتجميع النقاط',
      'نظام الرتب والمستويات الذكي (Tiers)',
      'سجل العمليات والفواتير الفورية',
    ],
    active: true,
  },
  {
    id: 'plan-advanced',
    code: 'ADVANCED',
    name: 'الباقة المتقدمة',
    description: 'برنامج الولاء المتقدم مع المستويات Tiers والامتيازات المخصصة وحملات الواتساب واستعادة العملاء',
    amount: 1190,
    currency: 'SAR',
    billing_interval: 'MONTHLY',
    duration_months: 1,
    trial_days: 7,
    features: [
      'كافة مميزات الباقة الأساسية',
      'حملات إعادة التنشيط الذكية واستعادة العملاء المنقطعين',
      'إدارة الامتيازات والعروض الترويجية الحصرية',
      'دعم فني أولوية عبر الواتساب',
    ],
    active: true,
  },
  {
    id: 'plan-pro',
    code: 'PRO',
    name: 'الباقة الاحترافية',
    description: 'الحل الشامل لشبكات المتاجر والفروع مع تحليلات متقدمة، كوبونات ديناميكية وربط مخصص',
    amount: 1890,
    currency: 'SAR',
    billing_interval: 'MONTHLY',
    duration_months: 1,
    trial_days: 7,
    features: [
      'كافة مميزات الباقة المتقدمة',
      'دعم الفروع المتعددة والموظفين غير المحدود',
      'إدارة الكوبونات والهدايا التسويقية المتقدمة',
      'تخصيص كامل للهوية البصرية والدومين الخاص',
    ],
    active: true,
  },
];

export default async function handler(req: any, res: any) {
  const method = req.method ? req.method.toUpperCase() : 'GET';

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1️⃣ GET: جلب جميع خطط الاشتراك
    if (method === 'GET') {
      const { data: plans, error } = await supabase
        .from('billing_plans')
        .select('*')
        .order('amount', { ascending: true });

      if (error || !plans || plans.length === 0) {
        return res.status(200).json({
          success: true,
          plans: OFFICIAL_FALLBACK_PLANS,
        });
      }

      const sanitizedPlans = plans.map((p: any) => {
        const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
        const features = Array.isArray(p.features)
          ? p.features
          : Array.isArray(meta.features)
          ? meta.features
          : typeof p.features === 'string'
          ? JSON.parse(p.features)
          : [];

        const durationMonths = p.duration_months
          ? Number(p.duration_months)
          : meta.duration_months
          ? Number(meta.duration_months)
          : (p.billing_interval === 'YEARLY' ? 12 : 1);

        return {
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description || '',
          amount: Number(p.amount) || 0,
          currency: p.currency || 'SAR',
          duration_months: durationMonths,
          billing_interval: p.billing_interval || (durationMonths === 12 ? 'YEARLY' : 'MONTHLY'),
          trial_days: Number(p.trial_days) ?? 7,
          features,
          active: p.active !== false,
          created_at: p.created_at,
        };
      });

      return res.status(200).json({
        success: true,
        plans: sanitizedPlans,
      });
    }

    // 2️⃣ POST: إنشاء خطة اشتراك جديدة
    if (method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const name = (body.name || '').trim();
      const amount = Number(body.amount) || 0;
      const durationMonths = Number(body.duration_months) || (body.billing_interval === 'YEARLY' ? 12 : 1);
      const interval = durationMonths === 12 ? 'YEARLY' : 'MONTHLY';
      const cleanCode = (body.code || `PLAN_${Date.now()}`).toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 48);

      const metadata = {
        features: Array.isArray(body.features) ? body.features : [],
        duration_months: durationMonths,
      };

      const insertPayload: any = {
        code: cleanCode,
        name,
        description: body.description || '',
        amount,
        currency: body.currency || 'SAR',
        billing_interval: interval,
        trial_days: Number(body.trial_days) ?? 7,
        active: body.active !== false,
        metadata,
      };

      const { data, error } = await supabase
        .from('billing_plans')
        .insert([insertPayload])
        .select()
        .single();

      if (error) {
        console.error('[api/billing/plans] Insert Error:', error);
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.status(200).json({
        success: true,
        plan: {
          id: data.id,
          code: data.code,
          name: data.name,
          description: data.description,
          amount: Number(data.amount),
          currency: data.currency,
          duration_months: durationMonths,
          billing_interval: data.billing_interval,
          trial_days: data.trial_days,
          features: metadata.features,
          active: data.active,
          created_at: data.created_at,
        },
      });
    }

    // 3️⃣ PUT: تحديث خطة اشتراك قائمة
    if (method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const planId = body.id || body.code;
      if (!planId) {
        return res.status(400).json({ success: false, error: 'معرف الخطة مطلوب' });
      }

      const updates: any = { updated_at: new Date().toISOString() };
      if (body.name) updates.name = body.name.trim();
      if (body.description !== undefined) updates.description = body.description;
      if (body.amount !== undefined) updates.amount = Number(body.amount);
      if (body.currency) updates.currency = body.currency;
      if (body.trial_days !== undefined) updates.trial_days = Number(body.trial_days);
      if (body.active !== undefined) updates.active = Boolean(body.active);

      const durationMonths = body.duration_months
        ? Number(body.duration_months)
        : (body.billing_interval === 'YEARLY' ? 12 : undefined);

      if (durationMonths) {
        updates.billing_interval = durationMonths === 12 ? 'YEARLY' : 'MONTHLY';
      }

      if (body.features !== undefined || durationMonths !== undefined) {
        updates.metadata = {
          features: Array.isArray(body.features) ? body.features : [],
          duration_months: durationMonths || 1,
        };
      }

      let query = supabase.from('billing_plans').update(updates);
      if (planId.includes('-') && planId.length > 30) {
        query = query.eq('id', planId);
      } else {
        query = query.eq('code', planId);
      }

      const { data, error } = await query.select().maybeSingle();

      if (error) {
        console.error('[api/billing/plans] Update Error:', error);
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, plan: data });
    }

    // 4️⃣ DELETE: حذف خطة اشتراك
    if (method === 'DELETE') {
      const planId = req.query?.id || req.body?.id;
      if (!planId) {
        return res.status(400).json({ success: false, error: 'معرف الخطة مطلوب للحذف' });
      }

      let query = supabase.from('billing_plans').delete();
      if (planId.includes('-') && planId.length > 30) {
        query = query.eq('id', planId);
      } else {
        query = query.eq('code', planId);
      }

      const { error } = await query;
      if (error) {
        console.error('[api/billing/plans] Delete Error:', error);
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  } catch (err: any) {
    console.error('[api/billing/plans] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ في معالجة طلب خطط الاشتراك',
    });
  }
}

-- ==============================================================================
-- 🏛️ AL-ATHAR CORE: MODERN RAKEEN-STYLE SUBSCRIPTION PLANS & PRORATION ENGINE
-- Migration: 20261102_modern_rakeen_subscription_plans_and_proration.sql
-- ==============================================================================

-- 1️⃣ Add New Flexible Monthly & Annual Pricing Columns to billing_plans
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS monthly_amount NUMERIC NOT NULL DEFAULT 99.00,
  ADD COLUMN IF NOT EXISTS yearly_amount NUMERIC NOT NULL DEFAULT 990.00,
  ADD COLUMN IF NOT EXISTS extra_branch_price NUMERIC NOT NULL DEFAULT 49.00,
  ADD COLUMN IF NOT EXISTS extra_branch_yearly_price NUMERIC NOT NULL DEFAULT 490.00,
  ADD COLUMN IF NOT EXISTS tier_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS badge_text TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cumulative_note TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS features_list JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2️⃣ Populate Standard 3-Tier Data for Radar & Sadeem (Zero Leaks, 100% Tenant Isolation)

-- 🟢 TIER 1: الأساسية (أساس)
UPDATE public.billing_plans
SET
  tier_level = 1,
  name = 'الباقة الأساسية',
  description = 'تبيع، وتطبع، وتقفّل يومك - كاشير سريع وفاتورة ضريبية متوافقة',
  monthly_amount = 99.00,
  yearly_amount = 990.00,
  extra_branch_price = 49.00,
  extra_branch_yearly_price = 490.00,
  trial_days = 14,
  badge_text = NULL,
  cumulative_note = NULL,
  features_list = jsonb_build_array(
    'كاشير سحابي سريع (POS) متوافق 100% مع هيئة الزكاة',
    'فواتير ضريبية مبسطة مع رمز الاستجابة السريع QR',
    'العمل عند انقطاع الإنترنت (Offline Mode)',
    'إغلاق الورديات وتقفيل الصندوق واليوميات',
    'إدارة المنيو والتصنيفات والمنتجات غير المحدودة',
    'إدارة الطلبات والاسترجاع وسجل العمليات',
    'تقارير المبيعات اليومية والشهرية',
    'إدارة الموظفين وصلاحيات الكاشير',
    'يشمل فرع واحد رئيسي'
  ),
  updated_at = NOW()
WHERE code = 'BASIC';

-- 🟡 TIER 2: النمو (عماد - الأكثر طلباً ⭐)
UPDATE public.billing_plans
SET
  tier_level = 2,
  name = 'باقة النمو (عماد)',
  description = 'تعرف وش تكسب، والعميل يرجع لك - تشغيل كامل وبرنامج ولاء ذكي',
  monthly_amount = 179.00,
  yearly_amount = 1790.00,
  extra_branch_price = 89.00,
  extra_branch_yearly_price = 890.00,
  trial_days = 14,
  badge_text = 'الأكثر طلباً ⭐',
  cumulative_note = 'كل اللي في الأساسية، وفوقها:',
  features_list = jsonb_build_array(
    'شاشة المطبخ KDS المباشرة وطباعة البونات التلقائية',
    'شاشة العميل الذكية بالرمز السريع',
    'برنامج الولاء ومحفظة البطاقات الرسمية (Apple Wallet & Google Wallet)',
    'إدارة المخزون والوصفات وحساب التكاليف ونواقص المواد',
    'قراءة فواتير الموردين بالتصوير الذكي',
    'حساب تكلفة الأطباق وهامش صافي الربح في كل عملية',
    'إدارة الطاولات والحجوزات والطلبات الداخلية',
    'ربط تطبيقات التوصيل وتطبيق كابتن التوصيل 🛵',
    'حملات إعادة استهداف العملاء عبر الواتساب',
    'تصدير التقارير المالية التفصيلية Excel',
    'يشمل فرع واحد رئيسي'
  ),
  updated_at = NOW()
WHERE code = 'ADVANCED';

-- 🟣 TIER 3: الاحترافية (صرح - الأشمل 👑)
UPDATE public.billing_plans
SET
  tier_level = 3,
  name = 'الباقة الاحترافية (صرح)',
  description = 'يطلبون منك مباشرة، وتكبر لأكثر من فرع - توسع وهوية سيادية بدون عمولات',
  monthly_amount = 279.00,
  yearly_amount = 2790.00,
  extra_branch_price = 139.00,
  extra_branch_yearly_price = 1390.00,
  trial_days = 14,
  badge_text = 'الأشمل 👑',
  cumulative_note = 'كل اللي في باقة النمو، وفوقها:',
  features_list = jsonb_build_array(
    'متجر إلكتروني ذكي للطلب والاستلام المباشر (صفر عمولة مبيعات)',
    'صفحة حجز المواعيد والخدمات والطاولات أونلاين',
    'تعدد الفروع مع تقارير مركزية موحدة لكل فروعك',
    'ربط دومين مخصص خاص بمتجرك (Custom Domain)',
    'بوابات دفع إلكترونية تابعة للتاجر (ميسر / تاب / تابي)',
    'أولوية قصوى ودعم فني مخصص على مدار الساعة',
    'يشمل فرعين مجاناً'
  ),
  updated_at = NOW()
WHERE code = 'PRO';

-- 3️⃣ Update get_public_billing_plans to Order by tier_level ASC
CREATE OR REPLACE FUNCTION public.get_public_billing_plans(p_host TEXT)
RETURNS SETOF public.billing_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_host TEXT;
    v_tenant_id TEXT;
BEGIN
    IF p_host IS NULL OR TRIM(p_host) = '' THEN
        RETURN;
    END IF;

    v_clean_host := LOWER(TRIM(p_host));
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
    v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

    SELECT id INTO v_tenant_id 
    FROM public.tenants 
    WHERE LOWER(custom_domain) = v_clean_host 
       OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
       OR LOWER(slug) = v_clean_host
    LIMIT 1;

    -- إرجاع باقات هذا الوكيل حصراً مرتبة بحسب المستوى
    IF v_tenant_id IS NOT NULL THEN
        RETURN QUERY
        SELECT * FROM public.billing_plans
        WHERE active = true AND tenant_id = v_tenant_id
        ORDER BY tier_level ASC, monthly_amount ASC;
    END IF;

    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_billing_plans(TEXT) TO anon, authenticated, service_role;

-- 4️⃣ Central Security-Definer RPC: calculate_subscription_upgrade
-- حساب الترقية وخصم الفرق بدقة متناهية مع حماية التجربة المجانية ومنع الرصيد السالب
CREATE OR REPLACE FUNCTION public.calculate_subscription_upgrade(
    p_store_id UUID,
    p_target_plan_id UUID,
    p_target_cycle TEXT DEFAULT 'MONTHLY'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_store RECORD;
    v_target_plan RECORD;
    v_current_plan RECORD;
    v_has_current_plan BOOLEAN := false;
    v_current_plan_json JSONB := NULL;
    v_target_plan_json JSONB := NULL;
    v_last_invoice RECORD;
    v_target_cycle TEXT;
    v_current_cycle TEXT := 'MONTHLY';
    v_target_price NUMERIC := 0.00;
    v_target_duration_months INTEGER := 1;
    v_paid_amount NUMERIC := 0.00;
    v_total_days NUMERIC := 30;
    v_remaining_days NUMERIC := 0;
    v_daily_rate NUMERIC := 0;
    v_unused_credit NUMERIC := 0.00;
    v_net_amount NUMERIC := 0.00;
    v_vat_rate NUMERIC := 0.1500;
    v_net_before_vat NUMERIC := 0.00;
    v_vat_amount NUMERIC := 0.00;
    v_is_trial BOOLEAN := true;
BEGIN
    -- 1. التحقق من وجود المتجر
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;

    -- 2. التحقق من وجود الباقة المستهدفة ونشاطها
    SELECT * INTO v_target_plan FROM public.billing_plans WHERE id = p_target_plan_id AND active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'الباقة المطلوبة غير موجودة أو غير نشطة');
    END IF;

    -- 3. عزل الوكلاء الصارم: منع الاشتراك في باقة تخص وكيلاً آخر
    IF v_target_plan.tenant_id <> v_store.tenant_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن الاشتراك في باقة تابعة لمنظومة أخرى');
    END IF;

    -- 4. تحديد دورة وسعر الباقة المستهدفة
    v_target_cycle := UPPER(COALESCE(NULLIF(TRIM(p_target_cycle), ''), 'MONTHLY'));
    IF v_target_cycle = 'YEARLY' THEN
        v_target_price := v_target_plan.yearly_amount;
        v_target_duration_months := 12;
    ELSE
        v_target_cycle := 'MONTHLY';
        v_target_price := v_target_plan.monthly_amount;
        v_target_duration_months := 1;
    END IF;

    -- 5. جلب بيانات الباقة الحالية إن وجدت
    IF v_store.subscription_plan_id IS NOT NULL THEN
        SELECT * INTO v_current_plan FROM public.billing_plans WHERE id = v_store.subscription_plan_id;
        IF FOUND THEN v_has_current_plan := true; END IF;
    ELSIF v_store.plan_code IS NOT NULL THEN
        SELECT * INTO v_current_plan FROM public.billing_plans WHERE code = v_store.plan_code AND tenant_id = v_store.tenant_id LIMIT 1;
        IF FOUND THEN v_has_current_plan := true; END IF;
    END IF;

    -- 6. فحص الفاتورة السابقة والتحقق من حالة الدفع الفعلي (حماية التجربة المجانية)
    SELECT * INTO v_last_invoice
    FROM public.store_invoices
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND invoice_type IN ('setup', 'renewal', 'upgrade')
    ORDER BY paid_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    -- إذا كان التاجر دافعاً فعلياً واشتراكه نشط ولم ينته بعد:
    IF v_last_invoice.id IS NOT NULL 
       AND COALESCE(v_store.setup_fee_paid, false) = true 
       AND v_store.subscription_end_date IS NOT NULL 
       AND v_store.subscription_end_date > v_now THEN
       
        v_is_trial := false;
        v_paid_amount := GREATEST(0.00, COALESCE(v_last_invoice.amount, 0.00));
        
        -- استنتاج الدورة السابقة (شهري أو سنوي)
        IF v_paid_amount >= 900.00 
           OR COALESCE(v_last_invoice.metadata->>'billing_cycle', '') = 'YEARLY'
           OR (v_has_current_plan AND v_current_plan.billing_interval = 'YEARLY') THEN
            v_current_cycle := 'YEARLY';
        ELSE
            v_current_cycle := 'MONTHLY';
        END IF;

        -- 🛡️ منع تقاطع الدورات: المشترك السنوي لا يُسمح له بالتحويل لشهري كترقية
        IF v_current_cycle = 'YEARLY' AND v_target_cycle = 'MONTHLY' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'حسابك في باقة سنوية حالياً. الترقية متاحة للباقات السنوية الأعلى فقط.'
            );
        END IF;

        -- 🛡️ منع الترقية العكسية (لنفس الباقة أو باقة أقل في نفس الدورة)
        IF v_target_cycle = v_current_cycle 
           AND v_has_current_plan 
           AND v_target_plan.tier_level <= COALESCE(v_current_plan.tier_level, 1) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'الباقة المحددة مساوية لبقاتك الحالية أو أقل منها. الترقية تكون للباقات الأعلى فقط.'
            );
        END IF;

        -- حساب إجمالي الأيام والأيام المتبقية
        v_total_days := GREATEST(1.0, EXTRACT(EPOCH FROM (v_store.subscription_end_date - COALESCE(v_store.subscription_start_date, v_last_invoice.paid_at, v_now - INTERVAL '1 day'))) / 86400.0);
        v_remaining_days := GREATEST(0.0, EXTRACT(EPOCH FROM (v_store.subscription_end_date - v_now)) / 86400.0);

        -- حساب الرصيد المتبقي (Credit)
        v_daily_rate := v_paid_amount / v_total_days;
        v_unused_credit := ROUND(LEAST(v_paid_amount, v_daily_rate * v_remaining_days), 2);
    ELSE
        -- في التجربة المجانية أو بعد انتهاء الاشتراك: رصيد الخصم = صفر
        v_is_trial := true;
        v_unused_credit := 0.00;
        v_remaining_days := 0.0;
        v_current_cycle := 'TRIAL';
    END IF;

    -- 🛡️ حساب المبلغ الصافي مع منع الرصيد السالب نهائياً (GREATEST)
    v_net_amount := GREATEST(0.00, ROUND(v_target_price - v_unused_credit, 2));

    -- حساب تفاصيل الضريبة لـ ZATCA
    IF v_net_amount > 0 THEN
        v_net_before_vat := ROUND(v_net_amount / (1.0000 + v_vat_rate), 2);
        v_vat_amount := ROUND(v_net_amount - v_net_before_vat, 2);
    ELSE
        v_net_before_vat := 0.00;
        v_vat_amount := 0.00;
    END IF;

    -- إعداد كائن الباقة الحالية إذا وجدت بأمان لتفادي أخطاء السجلات غير المعينة
    IF v_has_current_plan THEN
        v_current_plan_json := jsonb_build_object(
            'id', v_current_plan.id,
            'code', v_current_plan.code,
            'name', v_current_plan.name,
            'tier_level', v_current_plan.tier_level,
            'cycle', v_current_cycle,
            'paid_amount', v_paid_amount
        );
    ELSE
        v_current_plan_json := NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', p_store_id,
        'target_plan', jsonb_build_object(
            'id', v_target_plan.id,
            'code', v_target_plan.code,
            'name', v_target_plan.name,
            'tier_level', v_target_plan.tier_level,
            'cycle', v_target_cycle,
            'original_price', v_target_price,
            'duration_months', v_target_duration_months
        ),
        'current_plan', v_current_plan_json,
        'is_trial', v_is_trial,
        'remaining_days', ROUND(v_remaining_days, 1),
        'unused_credit', v_unused_credit,
        'net_amount', v_net_amount,
        'net_before_vat', v_net_before_vat,
        'vat_amount', v_vat_amount,
        'currency', 'SAR',
        'has_discount', (v_unused_credit > 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_subscription_upgrade(UUID, UUID, TEXT) TO anon, authenticated, service_role;

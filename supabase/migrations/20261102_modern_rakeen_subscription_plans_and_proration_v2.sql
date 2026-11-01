-- ==============================================================================
-- 🏛️ AL-ATHAR CORE: MODERN RAKEEN-STYLE PRORATION ENGINE & TENANT SEEDING (V2)
-- Migration: 20261102_modern_rakeen_subscription_plans_and_proration_v2.sql
-- ==============================================================================

-- 1️⃣ إدراج وتحديث الباقات الثلاثة (BASIC, ADVANCED, PRO) لكل وكيل حالي ومستقبلي
DO $$
DECLARE
    r_tenant RECORD;
BEGIN
    FOR r_tenant IN SELECT id FROM public.tenants LOOP
        -- 🟢 TIER 1: الأساسية (أساس)
        INSERT INTO public.billing_plans (
            tenant_id, code, name, description, amount, monthly_amount, yearly_amount,
            extra_branch_price, extra_branch_yearly_price, tier_level, badge_text, cumulative_note,
            features_list, metadata, currency, billing_interval, trial_days, active, updated_at
        ) VALUES (
            r_tenant.id, 'BASIC', 'الباقة الأساسية',
            'تبيع، وتطبع، وتقفّل يومك - كاشير سريع وفاتورة ضريبية متوافقة',
            99.00, 99.00, 990.00, 49.00, 490.00, 1, NULL, NULL,
            jsonb_build_array(
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
            jsonb_build_object('features', jsonb_build_array(
                'كاشير سحابي سريع (POS) متوافق 100% مع هيئة الزكاة',
                'فواتير ضريبية مبسطة مع رمز الاستجابة السريع QR',
                'العمل عند انقطاع الإنترنت (Offline Mode)',
                'إغلاق الورديات وتقفيل الصندوق واليوميات',
                'إدارة المنيو والتصنيفات والمنتجات غير المحدودة'
            )),
            'ر.س', 'MONTHLY', 14, true, NOW()
        )
        ON CONFLICT (tenant_id, code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            monthly_amount = EXCLUDED.monthly_amount,
            yearly_amount = EXCLUDED.yearly_amount,
            extra_branch_price = EXCLUDED.extra_branch_price,
            extra_branch_yearly_price = EXCLUDED.extra_branch_yearly_price,
            tier_level = EXCLUDED.tier_level,
            badge_text = EXCLUDED.badge_text,
            cumulative_note = EXCLUDED.cumulative_note,
            features_list = EXCLUDED.features_list,
            metadata = EXCLUDED.metadata,
            trial_days = EXCLUDED.trial_days,
            active = true,
            updated_at = NOW();

        -- 🟡 TIER 2: النمو (عماد - الأكثر طلباً ⭐)
        INSERT INTO public.billing_plans (
            tenant_id, code, name, description, amount, monthly_amount, yearly_amount,
            extra_branch_price, extra_branch_yearly_price, tier_level, badge_text, cumulative_note,
            features_list, metadata, currency, billing_interval, trial_days, active, updated_at
        ) VALUES (
            r_tenant.id, 'ADVANCED', 'باقة النمو (عماد)',
            'تعرف وش تكسب، والعميل يرجع لك - تشغيل كامل وبرنامج ولاء ذكي',
            179.00, 179.00, 1790.00, 89.00, 890.00, 2, 'الأكثر طلباً ⭐', 'كل اللي في الأساسية، وفوقها:',
            jsonb_build_array(
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
            jsonb_build_object('features', jsonb_build_array(
                'شاشة المطبخ KDS المباشرة وطباعة البونات التلقائية',
                'شاشة العميل الذكية بالرمز السريع',
                'برنامج الولاء ومحفظة البطاقات الرسمية (Apple Wallet & Google Wallet)',
                'إدارة المخزون والوصفات وحساب التكاليف ونواقص المواد'
            )),
            'ر.س', 'MONTHLY', 14, true, NOW()
        )
        ON CONFLICT (tenant_id, code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            monthly_amount = EXCLUDED.monthly_amount,
            yearly_amount = EXCLUDED.yearly_amount,
            extra_branch_price = EXCLUDED.extra_branch_price,
            extra_branch_yearly_price = EXCLUDED.extra_branch_yearly_price,
            tier_level = EXCLUDED.tier_level,
            badge_text = EXCLUDED.badge_text,
            cumulative_note = EXCLUDED.cumulative_note,
            features_list = EXCLUDED.features_list,
            metadata = EXCLUDED.metadata,
            trial_days = EXCLUDED.trial_days,
            active = true,
            updated_at = NOW();

        -- 🟣 TIER 3: الاحترافية (صرح - الأشمل 👑)
        INSERT INTO public.billing_plans (
            tenant_id, code, name, description, amount, monthly_amount, yearly_amount,
            extra_branch_price, extra_branch_yearly_price, tier_level, badge_text, cumulative_note,
            features_list, metadata, currency, billing_interval, trial_days, active, updated_at
        ) VALUES (
            r_tenant.id, 'PRO', 'الباقة الاحترافية (صرح)',
            'يطلبون منك مباشرة، وتكبر لأكثر من فرع - توسع وهوية سيادية بدون عمولات',
            279.00, 279.00, 2790.00, 139.00, 1390.00, 3, 'الأشمل 👑', 'كل اللي في باقة النمو، وفوقها:',
            jsonb_build_array(
                'متجر إلكتروني ذكي للطلب والاستلام المباشر (صفر عمولة مبيعات)',
                'صفحة حجز المواعيد والخدمات والطاولات أونلاين',
                'تعدد الفروع مع تقارير مركزية موحدة لكل فروعك',
                'ربط دومين مخصص خاص بمتجرك (Custom Domain)',
                'بوابات دفع إلكترونية تابعة للتاجر (ميسر / تاب / تابي)',
                'أولوية قصوى ودعم فني مخصص على مدار الساعة',
                'يشمل فرعين مجاناً'
            ),
            jsonb_build_object('features', jsonb_build_array(
                'متجر إلكتروني ذكي للطلب والاستلام المباشر (صفر عمولة مبيعات)',
                'صفحة حجز المواعيد والخدمات والطاولات أونلاين',
                'تعدد الفروع مع تقارير مركزية موحدة لكل فروعك'
            )),
            'ر.س', 'MONTHLY', 14, true, NOW()
        )
        ON CONFLICT (tenant_id, code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            monthly_amount = EXCLUDED.monthly_amount,
            yearly_amount = EXCLUDED.yearly_amount,
            extra_branch_price = EXCLUDED.extra_branch_price,
            extra_branch_yearly_price = EXCLUDED.extra_branch_yearly_price,
            tier_level = EXCLUDED.tier_level,
            badge_text = EXCLUDED.badge_text,
            cumulative_note = EXCLUDED.cumulative_note,
            features_list = EXCLUDED.features_list,
            metadata = EXCLUDED.metadata,
            trial_days = EXCLUDED.trial_days,
            active = true,
            updated_at = NOW();
    END LOOP;
END;
$$;

-- 2️⃣ تفعيل التوليد التلقائي للباقات لكل وكيل جديد ينشأ في المنصة
CREATE OR REPLACE FUNCTION public.trg_fn_seed_tenant_billing_plans()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    -- إنشاء الباقات الافتراضية الثلاث للوكيل الجديد تلقائياً
    INSERT INTO public.billing_plans (
        tenant_id, code, name, description, amount, monthly_amount, yearly_amount,
        extra_branch_price, extra_branch_yearly_price, tier_level, badge_text, cumulative_note,
        features_list, currency, billing_interval, trial_days, active
    ) VALUES 
    (
        NEW.id, 'BASIC', 'الباقة الأساسية',
        'تبيع، وتطبع، وتقفّل يومك - كاشير سريع وفاتورة ضريبية متوافقة',
        99.00, 99.00, 990.00, 49.00, 490.00, 1, NULL, NULL,
        jsonb_build_array(
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
        'ر.س', 'MONTHLY', 14, true
    ),
    (
        NEW.id, 'ADVANCED', 'باقة النمو (عماد)',
        'تعرف وش تكسب، والعميل يرجع لك - تشغيل كامل وبرنامج ولاء ذكي',
        179.00, 179.00, 1790.00, 89.00, 890.00, 2, 'الأكثر طلباً ⭐', 'كل اللي في الأساسية، وفوقها:',
        jsonb_build_array(
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
        'ر.س', 'MONTHLY', 14, true
    ),
    (
        NEW.id, 'PRO', 'الباقة الاحترافية (صرح)',
        'يطلبون منك مباشرة، وتكبر لأكثر من فرع - توسع وهوية سيادية بدون عمولات',
        279.00, 279.00, 2790.00, 139.00, 1390.00, 3, 'الأشمل 👑', 'كل اللي في باقة النمو، وفوقها:',
        jsonb_build_array(
            'متجر إلكتروني ذكي للطلب والاستلام المباشر (صفر عمولة مبيعات)',
            'صفحة حجز المواعيد والخدمات والطاولات أونلاين',
            'تعدد الفروع مع تقارير مركزية موحدة لكل فروعك',
            'ربط دومين مخصص خاص بمتجرك (Custom Domain)',
            'بوابات دفع إلكترونية تابعة للتاجر (ميسر / تاب / تابي)',
            'أولوية قصوى ودعم فني مخصص على مدار الساعة',
            'يشمل فرعين مجاناً'
        ),
        'ر.س', 'MONTHLY', 14, true
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_seed_billing_plans ON public.tenants;
CREATE TRIGGER trg_tenants_seed_billing_plans
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_seed_tenant_billing_plans();

-- 3️⃣ دالة calculate_subscription_upgrade المحصنة بالكامل (إغلاق ثغرة النزول وتصحيح التواريخ)
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
    v_last_invoice RECORD;
    v_target_cycle TEXT;
    v_current_cycle TEXT := 'MONTHLY';
    v_target_price NUMERIC := 0.00;
    v_target_duration_months INTEGER := 1;
    v_paid_amount NUMERIC := 0.00;
    v_cycle_start TIMESTAMPTZ;
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

    -- 2. التحقق من وجود الباقة المطلوبة ونشاطها
    SELECT * INTO v_target_plan FROM public.billing_plans WHERE id = p_target_plan_id AND active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'الباقة المطلوبة غير موجودة أو غير نشطة');
    END IF;

    -- 3. عزل الوكلاء: منع الاشتراك في باقة تخص وكيلاً آخر
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
        
        -- استنتاج الدورة السابقة بدقة متناهية بدون افتراضات عشوائية
        IF COALESCE(v_last_invoice.metadata->>'billing_cycle', '') <> '' THEN
            v_current_cycle := UPPER(v_last_invoice.metadata->>'billing_cycle');
        ELSIF ((v_store.subscription_end_date - COALESCE(v_last_invoice.paid_at, v_now)) > INTERVAL '60 days') THEN
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

        -- 🛡️ إغلاق ثغرة النزول لمستوى مميزات أقل (Downgrade Block):
        -- يرفض دائماً الانتقال لباقة ذات tier_level أقل، مهما كانت الدورة المستهدفة
        IF v_has_current_plan AND v_target_plan.tier_level < v_current_plan.tier_level THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'لا يمكن الانتقال لباقة ذات مميزات أقل (المستوى ' || v_target_plan.tier_level || ' أقل من مستواك الحالي ' || v_current_plan.tier_level || '). الترقية تكون للباقات الأعلى فقط.'
            );
        END IF;

        -- 🛡️ منع الترقية العكسية أو المتطابقة في نفس دورة الفوترة
        IF v_target_cycle = v_current_cycle 
           AND v_has_current_plan 
           AND v_target_plan.tier_level <= v_current_plan.tier_level THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'الباقة المحددة مساوية لباقتك الحالية أو أقل منها في نفس الدورة. الترقية تكون للباقات الأعلى فقط.'
            );
        END IF;

        -- 🛡️ تصحيح حساب v_total_days: تقديم تاريخ دفع الفاتورة الأخيرة على تاريخ بدء المتجر القديم
        v_cycle_start := COALESCE(v_last_invoice.paid_at, v_store.subscription_start_date, v_now - INTERVAL '30 days');
        v_total_days := GREATEST(1.0, EXTRACT(EPOCH FROM (v_store.subscription_end_date - v_cycle_start)) / 86400.0);

        -- ضبط إجمالي الأيام وفق دورة الفوترة المنطقية لمنع أي شذوذ تواريخ
        IF v_current_cycle = 'YEARLY' AND (v_total_days < 300 OR v_total_days > 400) THEN
            v_total_days := 365.0;
        ELSIF v_current_cycle = 'MONTHLY' AND (v_total_days < 25 OR v_total_days > 35) THEN
            v_total_days := 30.0;
        END IF;

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

-- 4️⃣ تحديث دالة التنفيذ الفعلي للدفع السحابي (process_store_payment_atomic)
-- لضمان التحقق السيرفري الصارم عند الترقية (عدم الوثوق بالمبلغ من الواجهة) واحتساب عمولة المسوق على الصافي فقط
CREATE OR REPLACE FUNCTION public.process_store_payment_atomic(
    p_store_id uuid,
    p_invoice_type text,
    p_amount numeric,
    p_payment_method text DEFAULT 'mada'::text,
    p_gateway text DEFAULT 'moyasar'::text,
    p_gateway_payment_id text DEFAULT NULL::text,
    p_plan_id text DEFAULT NULL::text,
    p_plan_code text DEFAULT NULL::text,
    p_plan_name text DEFAULT NULL::text,
    p_duration_months integer DEFAULT 1,
    p_vat_rate numeric DEFAULT 0.15,
    p_gateway_fee numeric DEFAULT NULL::numeric,
    p_webhook_event_id text DEFAULT NULL::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_store RECORD;
    v_lead_id UUID := NULL;
    v_lead_status TEXT := NULL;
    v_lead_affiliate_id UUID := NULL;
    v_lead_ref_code TEXT := NULL;
    v_partner_active BOOLEAN := false;
    v_partner_acq_rate NUMERIC(5, 4) := NULL;
    v_partner_comm_rate NUMERIC(5, 4) := NULL;
    v_partner_rec_rate NUMERIC(5, 4) := NULL;
    v_store_ref_code TEXT := NULL;
    v_existing_inv_id UUID;
    v_existing_inv_num TEXT;
    v_existing_ledg_id UUID;
    v_existing_wh_id UUID;

    v_is_sandbox BOOLEAN;
    v_clean_gateway TEXT;
    v_clean_method TEXT;
    v_gw_payment_id TEXT;
    v_tx_id TEXT;
    v_webhook_event_id TEXT;
    v_invoice_num TEXT;
    v_invoice_id UUID;
    v_ledger_id UUID;

    v_gross NUMERIC(12, 2);
    v_vat_rate NUMERIC(5, 4);
    v_net_before_vat NUMERIC(12, 2);
    v_vat_amount NUMERIC(12, 2);
    v_gw_fee NUMERIC(12, 2);
    v_comm_rate NUMERIC(5, 4) := 0.0000;
    v_comm_amount NUMERIC(12, 2) := 0.00;
    v_net_platform NUMERIC(12, 2);

    v_is_acquisition BOOLEAN;
    v_comm_type VARCHAR(50);
    v_partner_id UUID := NULL;
    v_partner_name TEXT := NULL;

    v_duration_days INTEGER;
    v_base_end TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_comm_id UUID := NULL;
    v_idempotency_key TEXT;
    v_gw_rate NUMERIC(5, 4);
    v_gw_fixed NUMERIC(12, 2);
    v_sub_plan_uuid UUID := NULL;
BEGIN
    -- 0. Strict Server Authority Guard
    IF NOT (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
    ) THEN
        RAISE EXCEPTION 'permission denied for function process_store_payment_atomic' USING ERRCODE = '42501';
    END IF;

    -- 1. Validate Store
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'STORE_NOT_FOUND: المتجر غير موجود (%).', p_store_id;
    END IF;

    -- 2. Validate Invoice Type
    IF p_invoice_type NOT IN ('setup', 'renewal', 'upgrade', 'extra_cashier') THEN
        RAISE EXCEPTION 'INVALID_INVOICE_TYPE: نوع الفاتورة غير صالح (%).', p_invoice_type;
    END IF;

    v_gross := ROUND(COALESCE(p_amount, 0.00), 2);

    -- 🛡️ التحقق السيرفري الصارم عند الترقية (عدم قبول السعر من الفرونت إند إطلاقاً):
    IF p_invoice_type = 'upgrade' AND (p_plan_id IS NOT NULL OR p_plan_code IS NOT NULL) THEN
        DECLARE
            v_calc_plan_id UUID := NULL;
            v_calc_res JSONB;
            v_calc_net NUMERIC;
            v_calc_cycle TEXT := CASE WHEN COALESCE(p_duration_months, 1) >= 12 THEN 'YEARLY' ELSE 'MONTHLY' END;
        BEGIN
            IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                v_calc_plan_id := p_plan_id::uuid;
            ELSE
                SELECT id INTO v_calc_plan_id FROM public.billing_plans 
                WHERE code = UPPER(COALESCE(p_plan_code, p_plan_id)) 
                  AND tenant_id = v_store.tenant_id 
                LIMIT 1;
            END IF;

            IF v_calc_plan_id IS NOT NULL THEN
                v_calc_res := public.calculate_subscription_upgrade(p_store_id, v_calc_plan_id, v_calc_cycle);
                IF (v_calc_res->>'success')::boolean IS TRUE THEN
                    v_calc_net := (v_calc_res->>'net_amount')::numeric;
                    -- فرض السعر السيرفري المحسوب آلياً بعد خصم الرصيد
                    v_gross := v_calc_net;
                ELSE
                    RAISE EXCEPTION 'UPGRADE_CALCULATION_FAILED: %', (v_calc_res->>'error');
                END IF;
            END IF;
        END;
    END IF;

    IF v_gross < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: المبلغ لا يمكن أن يكون سالباً (%).', v_gross;
    END IF;

    -- 3. Identify Sandbox vs Live
    v_clean_gateway := lower(BTRIM(COALESCE(p_gateway, 'moyasar')));
    v_clean_method := lower(BTRIM(COALESCE(p_payment_method, 'mada')));
    v_is_sandbox := (v_clean_gateway LIKE '%sandbox%' OR v_clean_method = 'sandbox');

    v_gw_payment_id := COALESCE(NULLIF(BTRIM(p_gateway_payment_id), ''), 'pay_' || v_clean_gateway || '_' || replace(gen_random_uuid()::text, '-', ''));
    IF v_is_sandbox AND v_gw_payment_id NOT LIKE 'SANDBOX_%' THEN
        v_gw_payment_id := 'SANDBOX_' || v_gw_payment_id;
    END IF;

    v_tx_id := CASE WHEN v_is_sandbox THEN 'SANDBOX_tx_' || v_gw_payment_id ELSE 'tx_' || v_gw_payment_id END;
    v_webhook_event_id := COALESCE(NULLIF(BTRIM(p_webhook_event_id), ''), 'evt_' || v_gw_payment_id);

    -- 4. Idempotency Check
    SELECT id INTO v_existing_wh_id FROM public.billing_webhook_events WHERE provider = UPPER(v_clean_gateway) AND event_id = v_webhook_event_id AND processed = true LIMIT 1;
    SELECT id, invoice_number INTO v_existing_inv_id, v_existing_inv_num FROM public.store_invoices WHERE gateway_payment_id = v_gw_payment_id LIMIT 1;
    SELECT id INTO v_existing_ledg_id FROM public.financial_ledger WHERE transaction_id = v_tx_id OR (payment_id = v_gw_payment_id AND transaction_type = 'PAYMENT') LIMIT 1;

    IF v_existing_inv_id IS NOT NULL OR v_existing_ledg_id IS NOT NULL OR v_existing_wh_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'is_sandbox', v_is_sandbox,
            'message', 'تمت معالجة هذه العملية مسبقاً (عملية مكررة آمنة)',
            'invoice_id', v_existing_inv_id,
            'invoice_number', v_existing_inv_num,
            'ledger_id', v_existing_ledg_id,
            'transaction_id', v_tx_id,
            'gateway_payment_id', v_gw_payment_id,
            'webhook_event_id', v_webhook_event_id,
            'store_id', p_store_id
        );
    END IF;

    -- 5. Record Webhook Event
    INSERT INTO public.billing_webhook_events (
        tenant_id, provider, event_id, event_type, signature_verified, payload_hash, processed, processed_at, created_at, metadata
    ) VALUES (
        v_store.tenant_id, UPPER(v_clean_gateway), v_webhook_event_id, 'PAYMENT_' || UPPER(p_invoice_type), true,
        md5(v_gw_payment_id || ':' || p_store_id::text || ':' || v_gross::text), true, v_now, v_now,
        jsonb_build_object('store_id', p_store_id, 'gateway_payment_id', v_gw_payment_id, 'amount', v_gross, 'invoice_type', p_invoice_type, 'is_sandbox', v_is_sandbox)
    )
    ON CONFLICT (provider, event_id) DO UPDATE SET processed = true, processed_at = v_now, signature_verified = true;

    -- 6. VAT & Net Amounts
    v_vat_rate := GREATEST(0.0000, COALESCE(p_vat_rate, 0.1500));
    IF v_vat_rate > 0 THEN
        v_net_before_vat := ROUND(v_gross / (1.0000 + v_vat_rate), 2);
        v_vat_amount := ROUND(v_gross - v_net_before_vat, 2);
    ELSE
        v_net_before_vat := v_gross;
        v_vat_amount := 0.00;
    END IF;

    -- 7. Gateway Fee
    IF p_gateway_fee IS NOT NULL AND p_gateway_fee >= 0 THEN
        v_gw_fee := ROUND(p_gateway_fee, 2);
    ELSE
        IF v_is_sandbox OR v_clean_gateway = 'manual' THEN
            v_gw_rate := 0.0000; v_gw_fixed := 0.00;
        ELSIF v_clean_method = 'mada' THEN
            v_gw_rate := 0.0100; v_gw_fixed := 1.00;
        ELSIF v_clean_method IN ('credit_card', 'visa', 'mastercard') THEN
            v_gw_rate := 0.0275; v_gw_fixed := 1.00;
        ELSIF v_clean_method = 'apple_pay' THEN
            v_gw_rate := 0.0220; v_gw_fixed := 1.00;
        ELSE
            v_gw_rate := 0.0150; v_gw_fixed := 1.00;
        END IF;

        IF v_gross > 0 AND NOT v_is_sandbox AND v_clean_gateway <> 'manual' THEN
            v_gw_fee := ROUND((v_gross * v_gw_rate) + v_gw_fixed, 2);
        ELSE
            v_gw_fee := 0.00;
        END IF;
    END IF;

    -- 8. Partner & Commission Identification (Match via merchant_leads)
    SELECT id, status, affiliate_id, referral_code
    INTO v_lead_id, v_lead_status, v_lead_affiliate_id, v_lead_ref_code
    FROM public.merchant_leads
    WHERE converted_store_id = p_store_id
       OR (v_store.manager_contact IS NOT NULL AND phone = v_store.manager_contact)
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_lead_id IS NOT NULL THEN
        IF v_lead_affiliate_id IS NOT NULL THEN
            SELECT id, display_name, active, acquisition_commission_rate, commission_rate, recurring_commission_rate
            INTO v_partner_id, v_partner_name, v_partner_active, v_partner_acq_rate, v_partner_comm_rate, v_partner_rec_rate
            FROM public.partner_accounts
            WHERE id = v_lead_affiliate_id OR affiliate_id = v_lead_affiliate_id
            LIMIT 1;
        ELSIF v_lead_ref_code IS NOT NULL AND BTRIM(v_lead_ref_code) <> '' THEN
            SELECT id, display_name, active, acquisition_commission_rate, commission_rate, recurring_commission_rate
            INTO v_partner_id, v_partner_name, v_partner_active, v_partner_acq_rate, v_partner_comm_rate, v_partner_rec_rate
            FROM public.partner_accounts
            WHERE lower(referral_code) = lower(BTRIM(v_lead_ref_code))
               OR lower(slug) = lower(BTRIM(v_lead_ref_code))
            LIMIT 1;
        END IF;
    END IF;

    v_is_acquisition := (p_invoice_type = 'setup' OR v_store.setup_fee_paid IS NOT TRUE);

    IF v_partner_id IS NOT NULL AND v_partner_active IS NOT FALSE THEN
        IF v_is_acquisition THEN
            v_comm_rate := COALESCE(v_partner_acq_rate, v_partner_comm_rate, 0.2000);
            v_comm_type := 'STORE_ACQUISITION';
        ELSE
            v_comm_rate := COALESCE(v_partner_rec_rate, 0.1000);
            v_comm_type := CASE WHEN p_invoice_type = 'upgrade' THEN 'SUBSCRIPTION_UPGRADE' ELSE 'SUBSCRIPTION_RENEWAL' END;
        END IF;

        -- 🛡️ عمولة المسوق تُحسب حصراً على الصافي الفعلي المدفوع (الفرق)
        v_comm_amount := ROUND(v_net_before_vat * v_comm_rate, 2);
    ELSE
        v_comm_rate := 0.0000;
        v_comm_amount := 0.00;
        v_comm_type := 'NONE';
    END IF;

    -- 9. Net Platform
    v_net_platform := ROUND(v_gross - v_vat_amount - v_gw_fee - v_comm_amount, 2);

    -- 10. Compute Duration & Dates
    v_duration_days := GREATEST(1, COALESCE(p_duration_months, 1) * 30);
    IF p_invoice_type = 'renewal' AND v_store.subscription_end_date IS NOT NULL AND v_store.subscription_end_date > v_now THEN
        v_base_end := v_store.subscription_end_date;
    ELSE
        v_base_end := v_now;
    END IF;
    v_new_end := v_base_end + (v_duration_days || ' days')::INTERVAL;

    -- 11. Invoice Number
    v_invoice_num := (CASE WHEN v_is_sandbox THEN 'INV-SBX-' ELSE 'INV-' END)
                     || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(v_gw_payment_id || random()::text), 1, 6));

    -- 12. Resolve Plan UUID
    v_sub_plan_uuid := NULL;
    IF p_plan_id IS NOT NULL AND BTRIM(p_plan_id) <> '' THEN
        IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_sub_plan_uuid := p_plan_id::uuid;
        ELSE
            SELECT id INTO v_sub_plan_uuid FROM public.billing_plans WHERE code = UPPER(p_plan_id) AND tenant_id = v_store.tenant_id LIMIT 1;
        END IF;
    ELSIF p_plan_code IS NOT NULL AND BTRIM(p_plan_code) <> '' THEN
        SELECT id INTO v_sub_plan_uuid FROM public.billing_plans WHERE code = UPPER(p_plan_code) AND tenant_id = v_store.tenant_id LIMIT 1;
    END IF;

    -- 13. Insert Invoice
    INSERT INTO public.store_invoices (
        store_id, tenant_id, invoice_number, invoice_type, plan_id, plan_name,
        amount, vat_amount, net_amount, currency, status,
        payment_method, gateway, gateway_payment_id, paid_at,
        created_at, updated_at, metadata
    ) VALUES (
        p_store_id, v_store.tenant_id, v_invoice_num, p_invoice_type, v_sub_plan_uuid,
        COALESCE(p_plan_name, 'اشتراك منصة الأثر'),
        v_gross, v_vat_amount, v_net_before_vat, 'SAR', 'paid',
        v_clean_method, v_clean_gateway, v_gw_payment_id, v_now,
        v_now, v_now,
        jsonb_build_object(
            'is_sandbox', v_is_sandbox,
            'plan_code', p_plan_code,
            'duration_months', p_duration_months,
            'billing_cycle', CASE WHEN p_duration_months >= 12 THEN 'YEARLY' ELSE 'MONTHLY' END,
            'net_before_vat', v_net_before_vat,
            'gateway_fee', v_gw_fee,
            'partner_commission', v_comm_amount,
            'affiliate_id', v_partner_id
        )
    )
    RETURNING id INTO v_invoice_id;

    -- 14. Financial Ledger Entry
    INSERT INTO public.financial_ledger (
        transaction_id, invoice_id, store_id, tenant_id, affiliate_id, payment_id,
        transaction_type, gross_amount, vat_amount, gateway_fee,
        affiliate_commission, net_platform_amount, status,
        effective_at, created_at, created_by, metadata
    ) VALUES (
        v_tx_id, v_invoice_id, p_store_id, v_store.tenant_id, v_partner_id, v_gw_payment_id,
        'PAYMENT', v_gross, v_vat_amount, v_gw_fee,
        v_comm_amount, v_net_platform, 'SETTLED',
        v_now, v_now, 'system_payment_processor',
        jsonb_build_object(
            'invoice_number', v_invoice_num,
            'invoice_type', p_invoice_type,
            'gateway', v_clean_gateway,
            'payment_method', v_clean_method,
            'comm_type', v_comm_type,
            'comm_rate', v_comm_rate,
            'is_sandbox', v_is_sandbox
        )
    )
    RETURNING id INTO v_ledger_id;

    -- 15. Partner Commission Ledger
    IF v_partner_id IS NOT NULL AND v_comm_amount > 0 THEN
        INSERT INTO public.partner_commissions (
            tenant_id, partner_id, store_id, invoice_id,
            commission_type, amount, status, effective_date,
            created_at, updated_at
        ) VALUES (
            v_store.tenant_id, v_partner_id, p_store_id, v_invoice_id,
            v_comm_type, v_comm_amount, 'PENDING', v_now,
            v_now, v_now
        )
        RETURNING id INTO v_comm_id;
    END IF;

    -- 16. Update Store Subscription State
    UPDATE public.stores
    SET setup_fee_paid = true,
        subscription_status = 'active',
        subscription_plan = COALESCE(p_plan_name, stores.subscription_plan),
        plan_code = COALESCE(p_plan_code, stores.plan_code),
        subscription_plan_id = COALESCE(v_sub_plan_uuid, stores.subscription_plan_id),
        subscription_start_date = CASE WHEN p_invoice_type = 'setup' OR stores.subscription_start_date IS NULL THEN v_now ELSE stores.subscription_start_date END,
        subscription_end_date = v_new_end,
        renewal_amount = v_gross,
        updated_at = v_now
    WHERE id = p_store_id;

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'ledger_id', v_ledger_id,
        'commission_id', v_comm_id,
        'commission_amount', v_comm_amount,
        'gross_amount', v_gross,
        'net_platform_amount', v_net_platform,
        'subscription_end_date', v_new_end,
        'is_sandbox', v_is_sandbox
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

const SQL_MIGRATION = `
-- ==============================================================================
-- 🚀 AL-ATHAR CORE: STRICT ONBOARDING PIPELINE & TRIAL INTEGRITY V4
-- ==============================================================================

-- 1. Rebuild create_store_concierge_onboarding with strict trial defaults
CREATE OR REPLACE FUNCTION public.create_store_concierge_onboarding(
    p_name text, 
    p_slug text, 
    p_logo_url text DEFAULT NULL::text, 
    p_primary_color text DEFAULT '#0F172A'::text, 
    p_secondary_color text DEFAULT '#F59E0B'::text, 
    p_points_per_riyal numeric DEFAULT 1.0, 
    p_manager_name text DEFAULT 'المدير العام'::text, 
    p_manager_contact text DEFAULT '0500000000'::text, 
    p_manager_pin text DEFAULT '9999'::text, 
    p_tenant_id text DEFAULT NULL::text, 
    p_custom_domain text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_tenant_id text;
    v_clean_slug text;
    v_store RECORD;
    v_staff RECORD;
    v_points numeric;
    v_now timestamptz := now();
    v_trial_end timestamptz := now() + interval '14 days';
BEGIN
    -- 1. Validate Tenant
    IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin' THEN
        v_tenant_id := COALESCE(
            NULLIF(TRIM(auth.jwt() -> 'app_metadata' ->> 'tenant_id'), ''),
            NULLIF(TRIM(auth.jwt() -> 'user_metadata' ->> 'tenant_id'), ''),
            'radar'
        );
    ELSE
        IF p_tenant_id IS NOT NULL AND TRIM(p_tenant_id) <> '' THEN
            SELECT id INTO v_tenant_id FROM public.tenants WHERE id = TRIM(p_tenant_id) AND status = 'active';
        END IF;

        IF v_tenant_id IS NULL THEN
            v_tenant_id := public.current_tenant_id();
        END IF;

        IF v_tenant_id IS NULL OR TRIM(v_tenant_id) = '' THEN
            v_tenant_id := 'radar';
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
        v_tenant_id := 'radar';
    END IF;

    v_points := COALESCE(p_points_per_riyal, 1.0);
    IF v_points < 1 THEN
        RAISE EXCEPTION 'معامل النقاط يجب أن يكون 1 أو أكثر (القيمة المدخلة: %)', v_points;
    END IF;

    v_clean_slug := LOWER(TRIM(p_slug));

    -- 2. Insert into stores WITH STRICT TRIAL DEFAULTS (Never paid on creation!)
    INSERT INTO public.stores (
        tenant_id,
        name,
        slug,
        custom_domain,
        logo_url,
        primary_color,
        secondary_color,
        points_per_riyal,
        manager_name,
        manager_contact,
        subscription_active,
        status,
        subscription_status,
        setup_fee_paid,
        subscription_plan,
        subscription_plan_id,
        plan_code,
        renewal_amount,
        trial_start_date,
        trial_end_date,
        subscription_end_date,
        lifecycle_stage,
        is_active
    )
    VALUES (
        v_tenant_id,
        p_name,
        v_clean_slug,
        p_custom_domain,
        p_logo_url,
        COALESCE(p_primary_color, '#0F172A'),
        COALESCE(p_secondary_color, '#F59E0B'),
        v_points,
        p_manager_name,
        p_manager_contact,
        true,
        'trial',                          -- 🛡️ STRICT TRIAL
        'trial',                          -- 🛡️ STRICT TRIAL
        false,                            -- 🛡️ UNPAID (zero paid invoices)
        'trial',                          -- 🛡️ NOT a paid plan name
        NULL,                             -- 🛡️ No paid plan ID
        NULL,                             -- 🛡️ No plan code
        0.00,
        v_now,
        v_trial_end,
        v_trial_end,
        'تم التأسيس',                      -- 🛡️ Established / In Trial
        true
    )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        tenant_id = v_tenant_id,
        custom_domain = COALESCE(EXCLUDED.custom_domain, stores.custom_domain),
        logo_url = COALESCE(EXCLUDED.logo_url, stores.logo_url),
        manager_name = EXCLUDED.manager_name,
        manager_contact = EXCLUDED.manager_contact,
        primary_color = EXCLUDED.primary_color,
        secondary_color = EXCLUDED.secondary_color,
        points_per_riyal = EXCLUDED.points_per_riyal,
        updated_at = now()
    RETURNING * INTO v_store;

    -- 3. Insert Store Staff
    INSERT INTO public.store_staff (
        tenant_id,
        store_id,
        name,
        phone,
        role,
        pin_code,
        is_active,
        can_manual_input_phone
    )
    VALUES (
        v_tenant_id,
        v_store.id,
        COALESCE(p_manager_name, 'المدير العام'),
        COALESCE(p_manager_contact, '0500000000'),
        'admin',
        COALESCE(p_manager_pin, '9999'),
        true,
        true
    )
    RETURNING * INTO v_staff;

    -- 4. Insert Store Wallets
    INSERT INTO public.store_wallets (
        tenant_id,
        store_id,
        sms_quota,
        wa_quota,
        cashier_limit
    )
    VALUES (
        v_tenant_id,
        v_store.id,
        500,
        200,
        2
    )
    ON CONFLICT (store_id) DO UPDATE SET
        tenant_id = v_tenant_id;

    -- 5. Insert Default Tiers
    INSERT INTO public.tiers (
        tenant_id,
        store_id,
        tier_name,
        required_xp,
        badge_color
    )
    VALUES 
        (v_tenant_id, v_store.id, 'ضيف (Guest)', 0, '#94A3B8'),
        (v_tenant_id, v_store.id, 'Insider مميز', 150, '#3B82F6'),
        (v_tenant_id, v_store.id, 'VIP Gold', 500, '#F59E0B'),
        (v_tenant_id, v_store.id, 'Black Elite 👑', 1200, '#10B981')
    ON CONFLICT (store_id, tier_name) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'store', row_to_json(v_store),
        'manager', row_to_json(v_staff),
        'portal_url', '/?store=' || v_store.slug
    );
END;
$function$;

-- 2. Rebuild calculate_subscription_upgrade with absolute trial protection
CREATE OR REPLACE FUNCTION public.calculate_subscription_upgrade(
    p_store_id uuid, 
    p_target_plan_id text, 
    p_target_cycle text DEFAULT 'MONTHLY'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_store RECORD;
    v_target_plan RECORD;
    v_current_plan public.billing_plans%ROWTYPE;
    v_has_current_plan BOOLEAN := false;
    v_current_plan_json JSONB := NULL;
    v_last_invoice public.store_invoices%ROWTYPE;
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
    IF p_target_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_target_plan FROM public.billing_plans WHERE id = p_target_plan_id::uuid AND active = true;
    ELSE
        SELECT * INTO v_target_plan FROM public.billing_plans 
        WHERE UPPER(code) = UPPER(TRIM(p_target_plan_id)) 
          AND tenant_id = v_store.tenant_id 
          AND active = true 
        LIMIT 1;
    END IF;

    IF v_target_plan.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'الباقة المطلوبة غير موجودة أو غير نشطة');
    END IF;

    -- 3. عزل الوكلاء
    IF v_target_plan.tenant_id <> v_store.tenant_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن الاشتراك في باقة تابعة لمنظومة أخرى');
    END IF;

    -- 4. تحديد دورة وسعر الباقة المستهدفة
    v_target_cycle := UPPER(COALESCE(NULLIF(TRIM(p_target_cycle), ''), 'MONTHLY'));
    IF v_target_cycle IN ('YEARLY', 'ANNUAL', 'ANNUALLY') THEN
        v_target_cycle := 'YEARLY';
        v_target_price := v_target_plan.yearly_amount;
        v_target_duration_months := 12;
    ELSE
        v_target_cycle := 'MONTHLY';
        v_target_price := v_target_plan.monthly_amount;
        v_target_duration_months := 1;
    END IF;

    -- 5. فحص الفاتورة السابقة المدفوعة فعلياً (حماية التجربة المجانية الصارمة)
    SELECT * INTO v_last_invoice
    FROM public.store_invoices
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND amount > 0
      AND invoice_type IN ('setup', 'renewal', 'upgrade')
    ORDER BY paid_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    -- 🛡️ التحقق الصارم: هل التاجر مشترك مدفوع حقيقي؟
    -- يُشترط وجود فاتورة سابقة مدفوعة فعلياً بمبلغ > 0 و setup_fee_paid = true و subscription_status <> 'trial'
    IF v_last_invoice.id IS NOT NULL 
       AND COALESCE(v_store.setup_fee_paid, false) = true 
       AND COALESCE(v_store.subscription_status, 'trial') <> 'trial'
       AND v_store.subscription_end_date IS NOT NULL 
       AND v_store.subscription_end_date > v_now THEN
       
        v_is_trial := false;
        v_paid_amount := GREATEST(0.00, COALESCE(v_last_invoice.amount, 0.00));
        
        -- جلب بيانات الباقة الحالية المدفوعة فقط
        IF v_store.subscription_plan_id IS NOT NULL THEN
            SELECT * INTO v_current_plan FROM public.billing_plans WHERE id = v_store.subscription_plan_id;
            IF FOUND THEN v_has_current_plan := true; END IF;
        ELSIF v_store.plan_code IS NOT NULL THEN
            SELECT * INTO v_current_plan FROM public.billing_plans WHERE code = v_store.plan_code AND tenant_id = v_store.tenant_id LIMIT 1;
            IF FOUND THEN v_has_current_plan := true; END IF;
        END IF;

        -- استنتاج الدورة السابقة
        IF COALESCE(v_last_invoice.metadata->>'billing_cycle', '') <> '' THEN
            v_current_cycle := UPPER(v_last_invoice.metadata->>'billing_cycle');
        ELSIF ((v_store.subscription_end_date - COALESCE(v_last_invoice.paid_at, v_now)) > INTERVAL '60 days') THEN
            v_current_cycle := 'YEARLY';
        ELSE
            v_current_cycle := 'MONTHLY';
        END IF;

        -- منع تقاطع الدورات: السنوي لا ينزل لشهري
        IF v_current_cycle = 'YEARLY' AND v_target_cycle = 'MONTHLY' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'حسابك في باقة سنوية حالياً. الترقية متاحة للباقات السنوية الأعلى فقط.'
            );
        END IF;

        -- إغلاق ثغرة النزول لمستوى مميزات أقل
        IF v_has_current_plan AND v_target_plan.tier_level < v_current_plan.tier_level THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'لا يمكن الانتقال لباقة ذات مميزات أقل (المستوى ' || v_target_plan.tier_level || ' أقل من مستواك الحالي ' || v_current_plan.tier_level || '). الترقية تكون للباقات الأعلى فقط.'
            );
        END IF;

        -- منع الترقية العكسية أو المتطابقة في نفس دورة الفوترة
        IF v_target_cycle = v_current_cycle 
           AND v_has_current_plan 
           AND v_target_plan.tier_level <= v_current_plan.tier_level THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'الباقة المحددة مساوية لباقتك الحالية أو أقل منها في نفس الدورة. الترقية تكون للباقات الأعلى فقط.'
            );
        END IF;

        -- حساب الأيام
        v_cycle_start := COALESCE(v_last_invoice.paid_at, v_store.subscription_start_date, v_now - INTERVAL '30 days');
        v_total_days := GREATEST(1.0, EXTRACT(EPOCH FROM (v_store.subscription_end_date - v_cycle_start)) / 86400.0);

        IF v_current_cycle = 'YEARLY' AND (v_total_days < 300 OR v_total_days > 400) THEN
            v_total_days := 365.0;
        ELSIF v_current_cycle = 'MONTHLY' AND (v_total_days < 25 OR v_total_days > 35) THEN
            v_total_days := 30.0;
        END IF;

        v_remaining_days := LEAST(v_total_days, GREATEST(0.0, CEIL(EXTRACT(EPOCH FROM (v_store.subscription_end_date - v_now)) / 86400.0)));

        -- حساب الرصيد المتبقي
        v_daily_rate := v_paid_amount / v_total_days;
        v_unused_credit := ROUND(LEAST(v_paid_amount, v_daily_rate * v_remaining_days), 0);
    ELSE
        -- 🛡️ في التجربة المجانية أو بدون فواتير سابقة: رصيد الخصم = صفر قطعي!
        v_is_trial := true;
        v_unused_credit := 0.00;
        v_remaining_days := 0.0;
        v_current_cycle := 'TRIAL';
        v_has_current_plan := false;
        v_current_plan_json := NULL;
    END IF;

    -- حساب المبلغ الصافي
    v_net_amount := GREATEST(0.00, ROUND(v_target_price - v_unused_credit, 0));

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
        'remaining_days', CEIL(v_remaining_days),
        'unused_credit', v_unused_credit,
        'net_amount', v_net_amount,
        'net_before_vat', v_net_before_vat,
        'vat_amount', v_vat_amount,
        'currency', 'SAR',
        'has_discount', (v_unused_credit > 0)
    );
END;
$function$;

-- 3. Correct store "شواية" to strict trial status
UPDATE public.stores
SET setup_fee_paid = false,
    subscription_status = 'trial',
    status = 'trial',
    subscription_plan = 'trial',
    subscription_plan_id = NULL,
    plan_code = NULL,
    renewal_amount = 0.00,
    lifecycle_stage = 'تم التأسيس',
    trial_start_date = NOW(),
    trial_end_date = NOW() + INTERVAL '14 days',
    subscription_end_date = NOW() + INTERVAL '14 days'
WHERE slug = 'shwaya' OR name = 'شواية';

-- 4. Correct merchant lead for "شواية"
UPDATE public.merchant_leads
SET status = 'CONVERTED'
WHERE phone = '0550477150' OR store_name = 'شواية';
`;

async function run() {
  await client.connect();
  console.log('⚡ Connected to PostgreSQL Database');
  await client.query(SQL_MIGRATION);
  console.log('✅ SQL MIGRATION EXECUTED SUCCESSFULLY!');

  const store = await client.query(`
    SELECT id, name, slug, status, subscription_status, setup_fee_paid, subscription_plan, lifecycle_stage, trial_start_date, trial_end_date 
    FROM public.stores 
    WHERE slug = 'shwaya';
  `);
  console.log('Updated store:', store.rows[0]);

  // Test upgrade calculation for shwaya to ensure credit is 0!
  const upgradeTest1 = await client.query(`
    SELECT calculate_subscription_upgrade($1, 'ADVANCED', 'MONTHLY') as res;
  `, [store.rows[0].id]);
  console.log('Upgrade to ADVANCED Monthly:', JSON.stringify(upgradeTest1.rows[0].res, null, 2));

  const upgradeTest2 = await client.query(`
    SELECT calculate_subscription_upgrade($1, 'PRO', 'MONTHLY') as res;
  `, [store.rows[0].id]);
  console.log('Upgrade to PRO Monthly:', JSON.stringify(upgradeTest2.rows[0].res, null, 2));

  const upgradeTest3 = await client.query(`
    SELECT calculate_subscription_upgrade($1, 'BASIC', 'MONTHLY') as res;
  `, [store.rows[0].id]);
  console.log('Upgrade to BASIC Monthly:', JSON.stringify(upgradeTest3.rows[0].res, null, 2));

  await client.end();
}

run().catch(console.error);

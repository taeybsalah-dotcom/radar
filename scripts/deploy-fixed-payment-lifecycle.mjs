import pg from 'pg';
const { Client } = pg;
const PG_CONNECTION_STRING = 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';

const SQL_MIGRATION = `
-- ==============================================================================
-- 🚀 AL-ATHAR CORE: DEFINITIVE ATOMIC PAYMENT & PRORATION ENGINE
-- 100% Strict Type Safety (No unassigned record errors, No column mismatch)
-- ==============================================================================

-- 1. CALCULATE_SUBSCRIPTION_UPGRADE
CREATE OR REPLACE FUNCTION public.calculate_subscription_upgrade(
    p_store_id uuid,
    p_target_plan_id text,
    p_target_cycle text DEFAULT 'MONTHLY'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $func_upgrade$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_store public.stores%ROWTYPE;
    v_target_plan public.billing_plans%ROWTYPE;
    v_current_plan public.billing_plans%ROWTYPE;
    v_last_invoice public.store_invoices%ROWTYPE;
    v_has_current_plan BOOLEAN := false;
    v_has_last_invoice BOOLEAN := false;
    v_current_plan_json JSONB := NULL;
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

    -- 2. جلب الباقة المطلوبة مع عزل الوكلاء
    SELECT * INTO v_target_plan
    FROM public.billing_plans
    WHERE active = true
      AND tenant_id = v_store.tenant_id
      AND (id::text = TRIM(p_target_plan_id) OR UPPER(code) = UPPER(TRIM(p_target_plan_id)))
    LIMIT 1;

    IF v_target_plan.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'الباقة المطلوبة غير موجودة أو غير مصرح بها');
    END IF;

    -- 3. تحديد دورة وسعر الباقة المستهدفة
    v_target_cycle := UPPER(COALESCE(NULLIF(TRIM(p_target_cycle), ''), 'MONTHLY'));
    IF v_target_cycle IN ('YEARLY', 'ANNUAL', 'ANNUALLY') THEN
        v_target_cycle := 'YEARLY';
        v_target_price := COALESCE(v_target_plan.yearly_amount, v_target_plan.amount * 12, 790.00);
        v_target_duration_months := 12;
    ELSE
        v_target_cycle := 'MONTHLY';
        v_target_price := COALESCE(v_target_plan.monthly_amount, v_target_plan.amount, 79.00);
        v_target_duration_months := 1;
    END IF;

    -- 4. جلب بيانات الباقة الحالية إن وجدت
    IF v_store.subscription_plan_id IS NOT NULL THEN
        SELECT * INTO v_current_plan FROM public.billing_plans WHERE id = v_store.subscription_plan_id;
        IF FOUND THEN v_has_current_plan := true; END IF;
    ELSIF v_store.plan_code IS NOT NULL THEN
        SELECT * INTO v_current_plan FROM public.billing_plans WHERE code = v_store.plan_code AND tenant_id = v_store.tenant_id LIMIT 1;
        IF FOUND THEN v_has_current_plan := true; END IF;
    END IF;

    -- 5. فحص الفاتورة السابقة والتحقق الصارم من الدفع الفعلي
    SELECT * INTO v_last_invoice
    FROM public.store_invoices
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND COALESCE(amount, 0) > 0
      AND invoice_type IN ('setup', 'renewal', 'upgrade')
    ORDER BY paid_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF FOUND THEN
        v_has_last_invoice := true;
    END IF;

    IF v_has_last_invoice
       AND COALESCE(v_store.setup_fee_paid, false) = true
       AND v_store.subscription_end_date IS NOT NULL
       AND v_store.subscription_end_date > v_now THEN

        v_is_trial := false;
        v_paid_amount := GREATEST(0.00, COALESCE(v_last_invoice.amount, 0.00));

        -- تحديد الدورة الفعلية
        v_total_days := GREATEST(1.0, ROUND(EXTRACT(EPOCH FROM (v_store.subscription_end_date - COALESCE(v_last_invoice.paid_at, v_store.subscription_start_date, v_now - INTERVAL '30 days'))) / 86400.0));

        IF COALESCE(v_last_invoice.metadata->>'billing_cycle', '') = 'YEARLY' OR v_total_days > 60 THEN
            v_current_cycle := 'YEARLY';
        ELSE
            v_current_cycle := 'MONTHLY';
        END IF;

        -- منع النزول لمستوى مميزات أقل نهائياً
        IF v_has_current_plan AND v_target_plan.tier_level < COALESCE(v_current_plan.tier_level, 1) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'لا يمكن الانتقال لباقة ذات مميزات أقل من مستواك الحالي.'
            );
        END IF;

        -- منع التحويل من سنوي إلى شهري
        IF v_current_cycle = 'YEARLY' AND v_target_cycle = 'MONTHLY' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'حسابك في باقة سنوية حالياً. الترقية متاحة للباقات السنوية الأعلى فقط.'
            );
        END IF;

        -- منع الترقية لنفس الباقة في نفس الدورة
        IF v_target_cycle = v_current_cycle
           AND v_has_current_plan
           AND v_target_plan.tier_level <= COALESCE(v_current_plan.tier_level, 1) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'أنت مشترك بالفعل في هذه الباقة.'
            );
        END IF;

        -- حساب الأيام المتبقية والرصيد (مقرب لأقرب ريال صحيح)
        v_remaining_days := LEAST(v_total_days, GREATEST(0.0, CEIL(EXTRACT(EPOCH FROM (v_store.subscription_end_date - v_now)) / 86400.0)));
        v_daily_rate := v_paid_amount / v_total_days;
        v_unused_credit := ROUND(LEAST(v_paid_amount, v_daily_rate * v_remaining_days), 0);
    ELSE
        v_is_trial := true;
        v_unused_credit := 0.00;
        v_remaining_days := 0.0;
        v_current_cycle := 'TRIAL';
    END IF;

    -- حساب الصافي بدون كسور عشرية
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
        'remaining_days', v_remaining_days,
        'unused_credit', v_unused_credit,
        'net_amount', v_net_amount,
        'net_before_vat', v_net_before_vat,
        'vat_amount', v_vat_amount,
        'currency', 'SAR',
        'has_discount', (v_unused_credit > 0)
    );
END;
$func_upgrade$;


-- 2. PROCESS_STORE_PAYMENT_ATOMIC
CREATE OR REPLACE FUNCTION public.process_store_payment_atomic(
    p_store_id uuid,
    p_invoice_type text,
    p_amount numeric DEFAULT NULL::numeric,
    p_payment_method text DEFAULT 'mada'::text,
    p_gateway text DEFAULT 'moyasar'::text,
    p_gateway_payment_id text DEFAULT NULL::text,
    p_plan_id text DEFAULT NULL::text,
    p_plan_code text DEFAULT NULL::text,
    p_plan_name text DEFAULT NULL::text,
    p_duration_months integer DEFAULT NULL::integer,
    p_vat_rate numeric DEFAULT 0.15,
    p_gateway_fee numeric DEFAULT NULL::numeric,
    p_billing_cycle text DEFAULT NULL::text,
    p_webhook_event_id text DEFAULT NULL::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_store public.stores%ROWTYPE;
    v_target_plan public.billing_plans%ROWTYPE;
    v_has_target_plan BOOLEAN := false;
    v_lead public.merchant_leads%ROWTYPE;
    v_partner public.partner_accounts%ROWTYPE;
    v_parent_partner public.partner_accounts%ROWTYPE;
    v_updated_store public.stores%ROWTYPE;
    v_upgrade_calc JSONB;

    v_gw_payment_id TEXT;
    v_invoice_num TEXT;
    v_invoice_id UUID;
    v_ledger_id UUID;
    v_comm_id UUID := NULL;
    v_parent_comm_id UUID := NULL;

    v_lead_id UUID := NULL;
    v_partner_id UUID := NULL;
    v_partner_affiliate_id UUID := NULL;
    v_partner_name TEXT := NULL;
    v_parent_partner_id UUID := NULL;
    v_parent_affiliate_id UUID := NULL;
    v_parent_partner_name TEXT := NULL;

    v_cycle TEXT;
    v_duration_months INTEGER;
    v_duration_days INTEGER;
    v_cycle_desc TEXT;
    v_ledger_desc TEXT;

    v_gross NUMERIC(12, 2);
    v_vat_rate NUMERIC(5, 4);
    v_net_before_vat NUMERIC(12, 2);
    v_vat_amount NUMERIC(12, 2);
    v_unused_credit NUMERIC(12, 2) := 0.00;
    v_original_plan_price NUMERIC(12, 2) := 0.00;

    v_gw_fee NUMERIC(12, 2);
    v_gw_rate NUMERIC(5, 4);
    v_gw_fixed NUMERIC(12, 2);

    v_comm_rate NUMERIC(5, 4) := 0.0000;
    v_comm_amount NUMERIC(12, 2) := 0.00;
    v_comm_type VARCHAR(50) := 'NONE';

    v_parent_rate NUMERIC(5, 4) := 0.0000;
    v_parent_comm_amount NUMERIC(12, 2) := 0.00;

    v_net_platform NUMERIC(12, 2);

    v_new_end TIMESTAMPTZ;
    v_is_acquisition BOOLEAN;
    v_is_sandbox BOOLEAN;
BEGIN
    -- 1. Validate Store with Exclusive Lock
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;

    -- 2. Resolve Target Plan
    IF p_plan_id IS NOT NULL AND BTRIM(p_plan_id) <> '' THEN
        IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            SELECT * INTO v_target_plan FROM public.billing_plans WHERE id = p_plan_id::uuid AND tenant_id = v_store.tenant_id;
            IF FOUND THEN v_has_target_plan := true; END IF;
        ELSE
            SELECT * INTO v_target_plan FROM public.billing_plans 
            WHERE UPPER(code) = UPPER(TRIM(p_plan_id)) AND tenant_id = v_store.tenant_id AND active = true LIMIT 1;
            IF FOUND THEN v_has_target_plan := true; END IF;
        END IF;
    END IF;

    IF NOT v_has_target_plan AND p_plan_code IS NOT NULL AND BTRIM(p_plan_code) <> '' THEN
        SELECT * INTO v_target_plan FROM public.billing_plans 
        WHERE UPPER(code) = UPPER(TRIM(p_plan_code)) AND tenant_id = v_store.tenant_id AND active = true LIMIT 1;
        IF FOUND THEN v_has_target_plan := true; END IF;
    END IF;

    IF NOT v_has_target_plan AND v_store.subscription_plan_id IS NOT NULL THEN
        SELECT * INTO v_target_plan FROM public.billing_plans WHERE id = v_store.subscription_plan_id AND tenant_id = v_store.tenant_id;
        IF FOUND THEN v_has_target_plan := true; END IF;
    END IF;

    IF NOT v_has_target_plan THEN
        SELECT * INTO v_target_plan FROM public.billing_plans WHERE tenant_id = v_store.tenant_id AND active = true ORDER BY tier_level ASC LIMIT 1;
        IF FOUND THEN v_has_target_plan := true; END IF;
    END IF;

    IF NOT v_has_target_plan THEN
        RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على باقة اشتراك معتمدة لهذا الوكيل');
    END IF;

    -- 3. Determine Exact Billing Cycle & Duration
    IF p_billing_cycle IS NOT NULL AND UPPER(TRIM(p_billing_cycle)) IN ('YEARLY', 'ANNUAL', 'ANNUALLY') THEN
        v_cycle := 'YEARLY';
        v_duration_months := 12;
        v_duration_days := 365;
    ELSIF p_billing_cycle IS NOT NULL AND UPPER(TRIM(p_billing_cycle)) IN ('MONTHLY', 'MONTH') THEN
        v_cycle := 'MONTHLY';
        v_duration_months := 1;
        v_duration_days := 30;
    ELSIF COALESCE(p_duration_months, 1) >= 12 THEN
        v_cycle := 'YEARLY';
        v_duration_months := 12;
        v_duration_days := 365;
    ELSE
        v_cycle := 'MONTHLY';
        v_duration_months := 1;
        v_duration_days := 30;
    END IF;

    -- 4. Server-Authoritative Price & Upgrade Calculation via calculate_subscription_upgrade
    SELECT * INTO v_upgrade_calc FROM public.calculate_subscription_upgrade(p_store_id, v_target_plan.id::text, v_cycle);

    IF v_upgrade_calc IS NOT NULL AND (v_upgrade_calc->>'success')::boolean = true THEN
        v_gross := ROUND(COALESCE((v_upgrade_calc->>'net_amount')::numeric, 0.00), 0);
        v_net_before_vat := ROUND(COALESCE((v_upgrade_calc->>'net_before_vat')::numeric, 0.00), 2);
        v_vat_amount := ROUND(COALESCE((v_upgrade_calc->>'vat_amount')::numeric, 0.00), 2);
        v_unused_credit := ROUND(COALESCE((v_upgrade_calc->>'unused_credit')::numeric, 0.00), 0);
        v_original_plan_price := ROUND(COALESCE((v_upgrade_calc->'target_plan'->>'original_price')::numeric, 0.00), 0);
    ELSE
        IF v_cycle = 'YEARLY' THEN
            v_gross := ROUND(COALESCE(v_target_plan.yearly_amount, v_target_plan.amount * 12, 790.00), 0);
        ELSE
            v_gross := ROUND(COALESCE(v_target_plan.monthly_amount, v_target_plan.amount, 79.00), 0);
        END IF;

        IF p_amount IS NOT NULL AND p_amount > 0 THEN
            v_gross := ROUND(p_amount, 0);
        END IF;

        v_vat_rate := COALESCE(p_vat_rate, 0.1500);
        v_net_before_vat := ROUND(v_gross / (1.0 + v_vat_rate), 2);
        v_vat_amount := v_gross - v_net_before_vat;
    END IF;

    v_vat_rate := COALESCE(p_vat_rate, 0.1500);

    -- 5. Calculate Subscription Dates (Always 365 days for YEARLY, 30 days for MONTHLY)
    IF v_store.subscription_end_date IS NOT NULL AND v_store.subscription_end_date > v_now THEN
        v_new_end := v_store.subscription_end_date + (v_duration_days || ' days')::interval;
    ELSE
        v_new_end := v_now + (v_duration_days || ' days')::interval;
    END IF;

    -- 6. Resolve Associated Partner & Commission Rates (Strict: NO v_store.affiliate_id or v_store.phone)
    -- A. Match via stores.partner_id
    IF v_store.partner_id IS NOT NULL THEN
        SELECT * INTO v_partner FROM public.partner_accounts WHERE (id = v_store.partner_id OR affiliate_id = v_store.partner_id) LIMIT 1;
    END IF;

    -- B. Match via stores.referral_code
    IF v_partner.id IS NULL AND v_store.referral_code IS NOT NULL AND BTRIM(v_store.referral_code) <> '' THEN
        SELECT * INTO v_partner FROM public.partner_accounts 
        WHERE LOWER(referral_code) = LOWER(TRIM(v_store.referral_code)) OR LOWER(slug) = LOWER(TRIM(v_store.referral_code)) 
        LIMIT 1;
    END IF;

    -- C. Match via merchant_leads
    IF v_partner.id IS NULL THEN
        SELECT * INTO v_lead FROM public.merchant_leads 
        WHERE converted_store_id = p_store_id 
           OR (v_store.manager_contact IS NOT NULL AND (phone = v_store.manager_contact OR normalized_phone = v_store.manager_contact))
        ORDER BY created_at DESC 
        LIMIT 1;

        IF FOUND THEN
            v_lead_id := v_lead.id;
            IF v_lead.affiliate_id IS NOT NULL THEN
                SELECT * INTO v_partner FROM public.partner_accounts WHERE (id = v_lead.affiliate_id OR affiliate_id = v_lead.affiliate_id) LIMIT 1;
            ELSIF v_lead.referral_code IS NOT NULL AND BTRIM(v_lead.referral_code) <> '' THEN
                SELECT * INTO v_partner FROM public.partner_accounts 
                WHERE LOWER(referral_code) = LOWER(TRIM(v_lead.referral_code)) OR LOWER(slug) = LOWER(TRIM(v_lead.referral_code)) 
                LIMIT 1;
            END IF;
        END IF;
    ELSE
        -- Lead link if exists
        SELECT id INTO v_lead_id FROM public.merchant_leads 
        WHERE converted_store_id = p_store_id 
           OR (v_store.manager_contact IS NOT NULL AND (phone = v_store.manager_contact OR normalized_phone = v_store.manager_contact))
        ORDER BY created_at DESC 
        LIMIT 1;
    END IF;

    -- 7. Determine Commission Rate & Type
    v_is_acquisition := (
        COALESCE(v_store.setup_fee_paid, false) = false OR 
        COALESCE(v_store.lifecycle_stage, '') IN ('طلب جديد', 'جاري التأسيس', 'تم التأسيس') OR
        NOT EXISTS (
            SELECT 1 FROM public.financial_ledger 
            WHERE store_id = p_store_id::text AND transaction_type = 'PAYMENT' AND status = 'SETTLED'
        )
    );

    IF v_partner.id IS NOT NULL AND v_partner.active IS NOT FALSE THEN
        v_partner_id := v_partner.id;
        v_partner_affiliate_id := v_partner.affiliate_id;
        v_partner_name := v_partner.display_name;

        IF v_is_acquisition THEN
            v_comm_type := 'STORE_ACQUISITION';
            v_comm_rate := COALESCE(v_partner.acquisition_commission_rate, v_partner.commission_rate, 0.2000);
        ELSIF UPPER(TRIM(p_invoice_type)) = 'UPGRADE' OR v_unused_credit > 0 THEN
            v_comm_type := 'SUBSCRIPTION_UPGRADE';
            v_comm_rate := COALESCE(v_partner.commission_rate, 0.2000);
        ELSE
            v_comm_type := 'RECURRING_RENEWAL';
            v_comm_rate := COALESCE(v_partner.recurring_commission_rate, 0.1000);
        END IF;

        v_comm_amount := ROUND(v_net_before_vat * v_comm_rate, 2);

        -- 👥 Two-Tier Override: Check if this partner was recruited by a parent partner (capped at 10 stores)
        IF v_partner.recruited_by_partner_id IS NOT NULL AND v_is_acquisition THEN
            SELECT * INTO v_parent_partner FROM public.partner_accounts WHERE id = v_partner.recruited_by_partner_id;
            
            IF FOUND AND v_parent_partner.id IS NOT NULL AND COALESCE(v_partner.sub_partner_conversions_count, 0) < COALESCE(v_partner.sub_partner_conversions_limit, 10) THEN
                v_parent_partner_id := v_parent_partner.id;
                v_parent_affiliate_id := v_parent_partner.affiliate_id;
                v_parent_partner_name := v_parent_partner.display_name;
                v_parent_rate := COALESCE(v_parent_partner.sub_partner_commission_rate, 0.0500);
                v_parent_comm_amount := ROUND(v_net_before_vat * v_parent_rate, 2);
            END IF;
        END IF;
    END IF;

    -- 8. Compute Gateway Fee
    IF p_gateway_fee IS NOT NULL AND p_gateway_fee >= 0 THEN
        v_gw_fee := ROUND(p_gateway_fee, 2);
    ELSE
        IF LOWER(TRIM(p_payment_method)) IN ('mada', 'card') THEN
            v_gw_rate := 0.0100;
            v_gw_fixed := 1.00;
        ELSIF LOWER(TRIM(p_payment_method)) IN ('applepay', 'apple_pay', 'visa', 'mastercard') THEN
            v_gw_rate := 0.0220;
            v_gw_fixed := 1.00;
        ELSE
            v_gw_rate := 0.0100;
            v_gw_fixed := 1.00;
        END IF;
        v_gw_fee := ROUND((v_gross * v_gw_rate) + v_gw_fixed, 2);
    END IF;

    -- 9. Calculate Net Platform Amount
    v_net_platform := v_gross - v_vat_amount - v_gw_fee - v_comm_amount - v_parent_comm_amount;

    -- 10. Generate Identifiers
    v_is_sandbox := (p_gateway_payment_id IS NOT NULL AND p_gateway_payment_id LIKE 'pay_sandbox_%');
    v_invoice_num := 'INV-' || to_char(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));
    IF v_is_sandbox THEN
        v_invoice_num := 'INV-SBX-' || to_char(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));
    END IF;

    v_gw_payment_id := COALESCE(p_gateway_payment_id, 'gw_' || to_char(v_now, 'YYYYMMDDHH24MISS') || '_' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6)));

    v_cycle_desc := CASE WHEN v_cycle = 'YEARLY' THEN 'سنوي (12 شهر)' ELSE 'شهري (30 يوم)' END;
    v_ledger_desc := 'سداد اشتراك ' || v_target_plan.name || ' (' || v_cycle_desc || ') لمتجر ' || v_store.name;

    -- 11. Insert Store Invoice
    INSERT INTO public.store_invoices (
        store_id,
        tenant_id,
        invoice_number,
        invoice_type,
        amount,
        vat_amount,
        net_amount,
        currency,
        status,
        payment_method,
        gateway,
        gateway_payment_id,
        plan_id,
        plan_name,
        paid_at,
        metadata,
        created_at,
        updated_at
    ) VALUES (
        p_store_id,
        v_store.tenant_id,
        v_invoice_num,
        p_invoice_type,
        v_gross,
        v_vat_amount,
        v_net_before_vat,
        'SAR',
        'paid',
        p_payment_method,
        p_gateway,
        v_gw_payment_id,
        v_target_plan.id::text,
        v_target_plan.name,
        v_now,
        jsonb_build_object(
            'billing_cycle', v_cycle,
            'duration_months', v_duration_months,
            'duration_days', v_duration_days,
            'unused_credit', v_unused_credit,
            'original_plan_price', v_original_plan_price,
            'net_before_vat', v_net_before_vat,
            'vat_amount', v_vat_amount,
            'vat_rate', v_vat_rate,
            'gateway_fee', v_gw_fee,
            'partner_commission', v_comm_amount,
            'parent_commission', v_parent_comm_amount,
            'affiliate_id', v_partner_id,
            'is_sandbox', v_is_sandbox
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_invoice_id;

    -- 12. Record Master Financial Ledger Entry
    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
        tenant_id,
        affiliate_id,
        payment_id,
        transaction_type,
        gross_amount,
        vat_amount,
        gateway_fee,
        affiliate_commission,
        net_platform_amount,
        status,
        created_by,
        metadata,
        effective_at,
        created_at
    ) VALUES (
        'tx_' || v_gw_payment_id,
        v_invoice_num,
        p_store_id::text,
        v_store.tenant_id,
        v_partner_id::text,
        v_gw_payment_id,
        'PAYMENT',
        v_gross,
        v_vat_amount,
        v_gw_fee,
        (v_comm_amount + v_parent_comm_amount),
        v_net_platform,
        'SETTLED',
        'GATEWAY_ATOMIC_RPC',
        jsonb_build_object(
            'description', v_ledger_desc,
            'store_name', v_store.name,
            'plan_name', v_target_plan.name,
            'plan_code', v_target_plan.code,
            'billing_cycle', v_cycle,
            'duration_months', v_duration_months,
            'duration_days', v_duration_days,
            'unused_credit', v_unused_credit,
            'affiliate_name', v_partner_name,
            'invoice_id', v_invoice_id,
            'payment_method', p_payment_method,
            'gateway', p_gateway,
            'comm_type', v_comm_type,
            'comm_rate', v_comm_rate,
            'parent_partner_id', v_parent_partner_id,
            'parent_partner_name', v_parent_partner_name,
            'parent_rate', v_parent_rate,
            'parent_comm_amount', v_parent_comm_amount,
            'vat_rate', v_vat_rate,
            'base_amount', v_net_before_vat
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 13. Record Direct Partner Commission
    IF v_partner_id IS NOT NULL AND v_comm_amount > 0 THEN
        INSERT INTO public.partner_commissions (
            partner_account_id,
            affiliate_id,
            merchant_lead_id,
            store_id,
            tenant_id,
            commission_type,
            basis_amount,
            commission_rate,
            commission_amount,
            status,
            qualifying_event,
            idempotency_key,
            invoice_id,
            invoice_number,
            created_at,
            updated_at
        ) VALUES (
            v_partner_id,
            v_partner_affiliate_id,
            v_lead_id,
            p_store_id,
            v_store.tenant_id,
            v_comm_type,
            v_net_before_vat,
            v_comm_rate,
            v_comm_amount,
            'EARNED',
            CASE 
                WHEN v_comm_type = 'STORE_ACQUISITION' THEN 'سداد اشتراك متجر جديد (' || v_cycle_desc || ')'
                WHEN v_comm_type = 'SUBSCRIPTION_UPGRADE' THEN 'ترقية باقة المتجر (' || v_cycle_desc || ')'
                ELSE 'تجديد اشتراك المتجر (' || v_cycle_desc || ')'
            END,
            'comm_inv_' || v_invoice_num,
            v_invoice_id::text,
            v_invoice_num,
            v_now,
            v_now
        )
        ON CONFLICT (idempotency_key) DO UPDATE
        SET 
            basis_amount = EXCLUDED.basis_amount,
            commission_amount = EXCLUDED.commission_amount,
            status = 'EARNED',
            updated_at = v_now
        RETURNING id INTO v_comm_id;
    END IF;

    -- 14. Record Two-Tier Parent Partner Commission (If applicable)
    IF v_parent_partner_id IS NOT NULL AND v_parent_comm_amount > 0 THEN
        INSERT INTO public.partner_commissions (
            partner_account_id,
            affiliate_id,
            merchant_lead_id,
            store_id,
            tenant_id,
            commission_type,
            basis_amount,
            commission_rate,
            commission_amount,
            status,
            qualifying_event,
            idempotency_key,
            invoice_id,
            invoice_number,
            created_at,
            updated_at
        ) VALUES (
            v_parent_partner_id,
            v_parent_affiliate_id,
            v_lead_id,
            p_store_id,
            v_store.tenant_id,
            'SUB_PARTNER_OVERRIDE',
            v_net_before_vat,
            v_parent_rate,
            v_parent_comm_amount,
            'EARNED',
            'عمولة إشراف وتدريب (' || (v_parent_rate * 100)::int || '%) على متجر الشريك المستقطب: ' || v_partner_name,
            'sub_comm_inv_' || v_invoice_num,
            v_invoice_id::text,
            v_invoice_num,
            v_now,
            v_now
        )
        ON CONFLICT (idempotency_key) DO UPDATE
        SET 
            basis_amount = EXCLUDED.basis_amount,
            commission_amount = EXCLUDED.commission_amount,
            status = 'EARNED',
            updated_at = v_now
        RETURNING id INTO v_parent_comm_id;

        -- Increment conversion counter on sub-partner
        UPDATE public.partner_accounts
        SET sub_partner_conversions_count = COALESCE(sub_partner_conversions_count, 0) + 1,
            updated_at = v_now
        WHERE id = v_partner_id;
    END IF;

    -- 15. Definitive Store Activation in stores Table
    UPDATE public.stores
    SET 
        status = 'active',
        is_active = true,
        subscription_status = 'active',
        subscription_active = true,
        setup_fee_paid = true,
        lifecycle_stage = 'مشترك مدفوع',
        subscription_plan_id = v_target_plan.id,
        plan_code = v_target_plan.code,
        subscription_plan = v_target_plan.name,
        subscription_start_date = COALESCE(subscription_start_date, v_now),
        subscription_end_date = v_new_end,
        renewal_amount = v_gross,
        updated_at = v_now
    WHERE id = p_store_id;

    -- 16. Convert Lead if applicable
    IF v_lead_id IS NOT NULL THEN
        UPDATE public.merchant_leads
        SET 
            status = 'CONVERTED',
            converted_store_id = p_store_id,
            updated_at = v_now
        WHERE id = v_lead_id AND status <> 'CONVERTED';
    END IF;

    -- 17. Fetch Freshly Activated Store Record
    SELECT * INTO v_updated_store FROM public.stores WHERE id = p_store_id;

    -- 18. Return Unified Result
    RETURN jsonb_build_object(
        'success', true,
        'message', 'تم تفعيل المتجر وتسجيل الاشتراك بنجاح تام وفق ضوابط ZATCA',
        'store', row_to_json(v_updated_store),
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'ledger_id', v_ledger_id,
        'store_id', p_store_id,
        'billing_cycle', v_cycle,
        'duration_months', v_duration_months,
        'duration_days', v_duration_days,
        'gross_amount', v_gross,
        'vat_amount', v_vat_amount,
        'net_amount', v_net_before_vat,
        'unused_credit', v_unused_credit,
        'gateway_fee', v_gw_fee,
        'commission_amount', v_comm_amount,
        'commission_id', v_comm_id,
        'parent_commission_amount', v_parent_comm_amount,
        'parent_commission_id', v_parent_comm_id,
        'partner_id', v_partner_id,
        'subscription_start_date', v_now,
        'subscription_end_date', v_new_end
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'خطأ في معالجة المعاملة الذرية بالسيرفر: ' || SQLERRM
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calculate_subscription_upgrade(uuid, text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic(
    uuid, text, numeric, text, text, text, text, text, text, integer, numeric, numeric, text, text, text
) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
`;

async function applyBoth() {
  const client = new Client({ connectionString: PG_CONNECTION_STRING });
  await client.connect();
  console.log('Applying both calculate_subscription_upgrade and process_store_payment_atomic...');
  await client.query(SQL_MIGRATION);
  console.log('✅ Both functions migrated successfully!');
  await client.end();
}
applyBoth().catch(console.error);

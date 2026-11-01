import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

const SQL_MIGRATION = `
-- ==============================================================================
-- 🚀 AL-ATHAR CORE: END-TO-END FINANCIAL LIFECYCLE & ATOMIC ACTIVATION V3
-- ==============================================================================

-- 1. Ensure columns exist on stores table
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partner_accounts(id);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS referral_code TEXT;

-- 2. Drop existing functions to allow clean signature redefinition
DROP FUNCTION IF EXISTS public.calculate_subscription_upgrade(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.calculate_subscription_upgrade(uuid, text, text);

-- 3. Rebuild calculate_subscription_upgrade (Accepts text for target_plan to allow UUID or Code)
CREATE OR REPLACE FUNCTION public.calculate_subscription_upgrade(
    p_store_id uuid,
    p_target_plan_id text,
    p_target_cycle text DEFAULT 'MONTHLY'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $func$
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

    -- 2. التحقق من وجود الباقة المطلوبة ونشاطها (UUID أو Code)
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

    -- 3. عزل الوكلاء: منع الاشتراك في باقة تخص وكيلاً آخر
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
        
        -- استنتاج الدورة السابقة بدقة متناهية
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

        -- 🛡️ إغلاق ثغرة النزول لمستوى مميزات أقل (Downgrade Block)
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

        -- 🛡️ تصحيح حساب v_total_days
        v_cycle_start := COALESCE(v_last_invoice.paid_at, v_store.subscription_start_date, v_now - INTERVAL '30 days');
        v_total_days := GREATEST(1.0, EXTRACT(EPOCH FROM (v_store.subscription_end_date - v_cycle_start)) / 86400.0);

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
$func$;

GRANT EXECUTE ON FUNCTION public.calculate_subscription_upgrade(uuid, text, text) TO authenticated, service_role, anon;

-- Also create helper wrapper for uuid callers
CREATE OR REPLACE FUNCTION public.calculate_subscription_upgrade(
    p_store_id uuid,
    p_target_plan_id uuid,
    p_target_cycle text DEFAULT 'MONTHLY'::text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT public.calculate_subscription_upgrade(p_store_id, p_target_plan_id::text, p_target_cycle);
$$;

GRANT EXECUTE ON FUNCTION public.calculate_subscription_upgrade(uuid, uuid, text) TO authenticated, service_role, anon;


-- 4. Rebuild process_store_payment_atomic (Single Atomic Transaction covering Store + Invoice + Ledger + Commission)
DROP FUNCTION IF EXISTS public.process_store_payment_atomic(uuid, text, numeric, text, text, text, text, text, text, integer, numeric, numeric);
DROP FUNCTION IF EXISTS public.process_store_payment_atomic(uuid, text, numeric, text, text, text, text, text, text, integer, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.process_store_payment_atomic(uuid, text, numeric, text, text, text, text, text, text, integer, numeric, numeric, text, text);

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
    v_store RECORD;
    v_target_plan RECORD;
    v_lead public.merchant_leads%ROWTYPE;
    v_partner public.partner_accounts%ROWTYPE;
    v_updated_store RECORD;
    v_upgrade_calc JSONB;

    v_existing_inv_id UUID;
    v_existing_inv_num TEXT;
    v_gw_payment_id TEXT;
    v_invoice_num TEXT;
    v_invoice_id UUID;
    v_ledger_id UUID;
    v_comm_id UUID := NULL;

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
    v_partner_id UUID := NULL;
    v_partner_name TEXT := NULL;
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
    v_target_plan := NULL;
    IF p_plan_id IS NOT NULL AND BTRIM(p_plan_id) <> '' THEN
        IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            SELECT * INTO v_target_plan FROM public.billing_plans WHERE id = p_plan_id::uuid AND tenant_id = v_store.tenant_id;
        ELSE
            SELECT * INTO v_target_plan FROM public.billing_plans 
            WHERE UPPER(code) = UPPER(TRIM(p_plan_id)) AND tenant_id = v_store.tenant_id AND active = true LIMIT 1;
        END IF;
    END IF;

    IF v_target_plan.id IS NULL AND p_plan_code IS NOT NULL AND BTRIM(p_plan_code) <> '' THEN
        SELECT * INTO v_target_plan FROM public.billing_plans 
        WHERE UPPER(code) = UPPER(TRIM(p_plan_code)) AND tenant_id = v_store.tenant_id AND active = true LIMIT 1;
    END IF;

    IF v_target_plan.id IS NULL AND v_store.subscription_plan_id IS NOT NULL THEN
        SELECT * INTO v_target_plan FROM public.billing_plans WHERE id = v_store.subscription_plan_id AND tenant_id = v_store.tenant_id;
    END IF;

    IF v_target_plan.id IS NULL THEN
        SELECT * INTO v_target_plan FROM public.billing_plans WHERE tenant_id = v_store.tenant_id AND active = true ORDER BY tier_level ASC LIMIT 1;
    END IF;

    IF v_target_plan.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على باقة اشتراك معتمدة لهذا الوكيل');
    END IF;

    -- 3. Determine Exact Billing Cycle & Duration (Priority to explicit p_billing_cycle)
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
        v_gross := ROUND(COALESCE((v_upgrade_calc->>'net_amount')::numeric, 0.00), 2);
        v_net_before_vat := ROUND(COALESCE((v_upgrade_calc->>'net_before_vat')::numeric, 0.00), 2);
        v_vat_amount := ROUND(COALESCE((v_upgrade_calc->>'vat_amount')::numeric, 0.00), 2);
        v_unused_credit := ROUND(COALESCE((v_upgrade_calc->>'unused_credit')::numeric, 0.00), 2);
        v_original_plan_price := ROUND(COALESCE((v_upgrade_calc->'target_plan'->>'original_price')::numeric, v_gross), 2);
    ELSE
        -- If calculation returned an error (e.g. downgrade blocked), reject transaction
        IF v_upgrade_calc IS NOT NULL AND (v_upgrade_calc->>'error') IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'error', v_upgrade_calc->>'error');
        END IF;

        -- Fallback calculation
        v_original_plan_price := CASE WHEN v_cycle = 'YEARLY' THEN v_target_plan.yearly_amount ELSE v_target_plan.monthly_amount END;
        v_unused_credit := 0.00;
        v_gross := GREATEST(0.00, COALESCE(p_amount, v_original_plan_price));
        v_vat_rate := GREATEST(0.0000, COALESCE(p_vat_rate, 0.1500));
        v_net_before_vat := ROUND(v_gross / (1.0000 + v_vat_rate), 2);
        v_vat_amount := ROUND(v_gross - v_net_before_vat, 2);
    END IF;

    -- Absolute financial guard: Never allow negative gross
    v_gross := GREATEST(0.00, v_gross);

    -- 5. Idempotency Check
    v_is_sandbox := (lower(p_gateway) = 'sandbox' OR lower(p_payment_method) = 'sandbox');
    v_gw_payment_id := COALESCE(NULLIF(TRIM(p_gateway_payment_id), ''), 'pay_' || p_gateway || '_' || replace(gen_random_uuid()::text, '-', ''));

    SELECT id, invoice_number INTO v_existing_inv_id, v_existing_inv_num
    FROM public.store_invoices 
    WHERE gateway_payment_id = v_gw_payment_id 
    LIMIT 1;

    IF v_existing_inv_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'تمت معالجة هذه العملية مسبقاً بنجاح (عملية مكررة آمنة)',
            'invoice_id', v_existing_inv_id,
            'invoice_number', v_existing_inv_num,
            'store_id', p_store_id
        );
    END IF;

    -- 6. Gateway Fee Calculation
    IF p_gateway_fee IS NOT NULL AND p_gateway_fee >= 0 THEN
        v_gw_fee := ROUND(p_gateway_fee, 2);
    ELSE
        IF lower(p_payment_method) = 'mada' THEN
            v_gw_rate := 0.0100; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) IN ('credit_card', 'visa', 'mastercard') THEN
            v_gw_rate := 0.0275; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'apple_pay' THEN
            v_gw_rate := 0.0220; v_gw_fixed := 1.00;
        ELSIF v_is_sandbox THEN
            v_gw_rate := 0.0000; v_gw_fixed := 0.00;
        ELSE
            v_gw_rate := 0.0150; v_gw_fixed := 1.00;
        END IF;

        IF v_gross > 0 AND NOT v_is_sandbox THEN
            v_gw_fee := ROUND((v_gross * v_gw_rate) + v_gw_fixed, 2);
        ELSE
            v_gw_fee := 0.00;
        END IF;
    END IF;

    -- 7. Partner & Commission Identification
    -- A. Match via merchant_leads
    SELECT * INTO v_lead 
    FROM public.merchant_leads 
    WHERE converted_store_id = p_store_id 
       OR (v_store.manager_contact IS NOT NULL AND phone = v_store.manager_contact)
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_lead.id IS NOT NULL THEN
        IF v_lead.affiliate_id IS NOT NULL THEN
            SELECT * INTO v_partner FROM public.partner_accounts WHERE id = v_lead.affiliate_id;
        ELSIF v_lead.referral_code IS NOT NULL AND TRIM(v_lead.referral_code) <> '' THEN
            SELECT * INTO v_partner FROM public.partner_accounts 
            WHERE lower(referral_code) = lower(trim(v_lead.referral_code)) OR lower(slug) = lower(trim(v_lead.referral_code)) 
            LIMIT 1;
        END IF;
    END IF;

    -- B. Match via stores table
    IF v_partner.id IS NULL THEN
        IF v_store.partner_id IS NOT NULL THEN
            SELECT * INTO v_partner FROM public.partner_accounts WHERE id = v_store.partner_id LIMIT 1;
        ELSIF v_store.referral_code IS NOT NULL AND TRIM(v_store.referral_code) <> '' THEN
            SELECT * INTO v_partner FROM public.partner_accounts 
            WHERE lower(referral_code) = lower(trim(v_store.referral_code)) OR lower(slug) = lower(trim(v_store.referral_code)) 
            LIMIT 1;
        END IF;
    END IF;

    -- Commission calculation on Net Before VAT (Only on actual paid difference upon upgrade)
    v_is_acquisition := (p_invoice_type = 'setup' OR COALESCE(v_store.setup_fee_paid, false) IS NOT TRUE);

    IF v_partner.id IS NOT NULL AND v_partner.active IS NOT FALSE THEN
        v_partner_id := v_partner.id;
        v_partner_name := v_partner.display_name;

        IF v_is_acquisition THEN
            v_comm_rate := COALESCE(v_partner.acquisition_commission_rate, v_partner.commission_rate, 0.2000);
            v_comm_type := 'STORE_ACQUISITION';
        ELSE
            v_comm_rate := COALESCE(v_partner.recurring_commission_rate, 0.1000);
            v_comm_type := CASE WHEN p_invoice_type = 'upgrade' THEN 'SUBSCRIPTION_UPGRADE' ELSE 'SUBSCRIPTION_RENEWAL' END;
        END IF;

        v_comm_amount := ROUND(v_net_before_vat * v_comm_rate, 2);
    ELSE
        v_comm_rate := 0.0000;
        v_comm_amount := 0.00;
        v_comm_type := 'NONE';
    END IF;

    v_net_platform := ROUND(v_gross - v_vat_amount - v_gw_fee - v_comm_amount, 2);

    -- 8. Compute Exact New Expiry Date
    v_new_end := v_now + (v_duration_days || ' days')::INTERVAL;

    -- 9. Generate Invoice Number
    v_invoice_num := (CASE WHEN v_is_sandbox THEN 'INV-SBX-' ELSE 'INV-' END)
                     || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(v_gw_payment_id || random()::text), 1, 6));

    -- 10. Insert Store Invoice (Status: paid, complete metadata)
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
            'affiliate_id', v_partner_id,
            'is_sandbox', v_is_sandbox
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_invoice_id;

    -- 11. Insert Financial Ledger Entry (Status: SETTLED, accurate description & metadata)
    v_cycle_desc := CASE WHEN v_cycle = 'YEARLY' THEN 'اشتراك سنوي (12 شهر)' ELSE 'اشتراك شهري (شهر واحد)' END;
    v_ledger_desc := v_cycle_desc || ' - باقة ' || v_target_plan.name || ' للمتجر [' || v_store.name || ']';

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
        v_comm_amount,
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
            'vat_rate', v_vat_rate,
            'base_amount', v_net_before_vat
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 12. Record Partner Commission
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
            v_partner.id,
            v_partner.affiliate_id,
            v_lead.id,
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

    -- 13. Definitive Store Activation in stores Table (All indicators activated)
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
        subscription_start_date = v_now,
        subscription_end_date = v_new_end,
        renewal_amount = v_gross,
        updated_at = v_now
    WHERE id = p_store_id;

    -- 14. Convert Lead if applicable
    IF v_lead.id IS NOT NULL AND v_lead.status <> 'CONVERTED' THEN
        UPDATE public.merchant_leads
        SET 
            status = 'CONVERTED',
            converted_store_id = p_store_id,
            updated_at = v_now
        WHERE id = v_lead.id;
    END IF;

    -- 15. Fetch Freshly Activated Store Record
    SELECT * INTO v_updated_store FROM public.stores WHERE id = p_store_id;

    -- 16. Return Unified Result
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

GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic(uuid, text, numeric, text, text, text, text, text, text, integer, numeric, numeric, text, text, text) TO authenticated, service_role, anon;
`;

async function main() {
  await client.connect();
  console.log('Applying Atomic Payment Lifecycle V3 migration...');
  await client.query(SQL_MIGRATION);
  console.log('✅ Migration applied successfully!');
  await client.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

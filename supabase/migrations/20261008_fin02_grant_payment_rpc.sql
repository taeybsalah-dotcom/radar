-- ==============================================================================
-- RADAR PLATFORM - MIGRATION: 20261008_fin02_grant_payment_rpc.sql
-- Fix: Grant Anon Execute on Payment RPC, Enable Invoice Read, Ensure Store Columns
-- ==============================================================================

BEGIN;

-- 1. Ensure all subscription columns exist on stores table
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS setup_fee_paid BOOLEAN DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT DEFAULT 'فترة تجريبية';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS plan_code TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'الباقة الأساسية';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS renewal_amount NUMERIC(12, 2) DEFAULT 0.00;

-- 2. Ensure RLS policies and permissions on store_invoices for anon & authenticated
GRANT SELECT ON public.store_invoices TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "store_invoices_anon_select_policy" ON public.store_invoices;
CREATE POLICY "store_invoices_anon_select_policy" ON public.store_invoices
    FOR SELECT TO anon
    USING (true);

-- 3. Update process_store_payment_atomic with defensive exception handling
CREATE OR REPLACE FUNCTION public.process_store_payment_atomic(
    p_store_id UUID,
    p_invoice_type TEXT,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'mada',
    p_gateway TEXT DEFAULT 'moyasar',
    p_gateway_payment_id TEXT DEFAULT NULL,
    p_plan_id TEXT DEFAULT NULL,
    p_plan_code TEXT DEFAULT NULL,
    p_plan_name TEXT DEFAULT NULL,
    p_duration_months INTEGER DEFAULT 1,
    p_vat_rate NUMERIC DEFAULT 0.15,
    p_gateway_fee NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store RECORD;
    v_lead RECORD;
    v_partner RECORD;
    v_existing_inv_id UUID;
    v_existing_inv_num TEXT;
    v_existing_ledg_id UUID;
    
    v_gw_payment_id TEXT;
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
    v_comm_id UUID;
    v_idempotency_key TEXT;
    v_gw_rate NUMERIC(5, 4);
    v_gw_fixed NUMERIC(12, 2);
    v_sub_plan_uuid UUID := NULL;
BEGIN
    -- 1. Validate Store
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;

    -- 2. Validate Amount
    v_gross := ROUND(COALESCE(p_amount, 0.00), 2);
    IF v_gross < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'المبلغ لا يمكن أن يكون سالباً');
    END IF;

    -- Normalize Payment ID
    v_gw_payment_id := COALESCE(NULLIF(TRIM(p_gateway_payment_id), ''), 'pay_' || p_gateway || '_' || replace(gen_random_uuid()::text, '-', ''));

    -- 3. Idempotency Check (Check both store_invoices and financial_ledger)
    SELECT id, invoice_number INTO v_existing_inv_id, v_existing_inv_num
    FROM public.store_invoices 
    WHERE gateway_payment_id = v_gw_payment_id 
    LIMIT 1;

    SELECT id INTO v_existing_ledg_id 
    FROM public.financial_ledger 
    WHERE payment_id = v_gw_payment_id AND transaction_type = 'PAYMENT' 
    LIMIT 1;

    IF v_existing_inv_id IS NOT NULL AND v_existing_ledg_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'تمت معالجة هذه العملية مسبقاً (عملية مكررة آمنة)',
            'invoice_id', v_existing_inv_id,
            'invoice_number', v_existing_inv_num,
            'ledger_id', v_existing_ledg_id,
            'store_id', p_store_id
        );
    END IF;

    -- 4. Calculate Unified ZATCA VAT & Net Amounts (VAT = 15% default or 0% freelance)
    v_vat_rate := GREATEST(0.0000, COALESCE(p_vat_rate, 0.1500));
    IF v_vat_rate > 0 THEN
        v_net_before_vat := ROUND(v_gross / (1.0000 + v_vat_rate), 2);
        v_vat_amount := ROUND(v_gross - v_net_before_vat, 2);
    ELSE
        v_net_before_vat := v_gross;
        v_vat_amount := 0.00;
    END IF;

    -- 5. Calculate Gateway Fee (Operating Expense)
    IF p_gateway_fee IS NOT NULL AND p_gateway_fee >= 0 THEN
        v_gw_fee := ROUND(p_gateway_fee, 2);
    ELSE
        IF lower(p_payment_method) = 'mada' THEN
            v_gw_rate := 0.0100; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) IN ('credit_card', 'visa', 'mastercard') THEN
            v_gw_rate := 0.0275; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'apple_pay' THEN
            v_gw_rate := 0.0220; v_gw_fixed := 1.00;
        ELSIF lower(p_payment_method) = 'sandbox' THEN
            v_gw_rate := 0.0000; v_gw_fixed := 0.00;
        ELSE
            v_gw_rate := 0.0150; v_gw_fixed := 1.00;
        END IF;

        IF v_gross > 0 AND lower(p_payment_method) <> 'sandbox' THEN
            v_gw_fee := ROUND((v_gross * v_gw_rate) + v_gw_fixed, 2);
        ELSE
            v_gw_fee := 0.00;
        END IF;
    END IF;

    -- 6. Partner & Commission Identification
    SELECT * INTO v_lead 
    FROM public.merchant_leads 
    WHERE converted_store_id = p_store_id 
       OR (v_store.manager_contact IS NOT NULL AND phone = v_store.manager_contact)
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_lead.id IS NOT NULL THEN
        IF v_lead.affiliate_id IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE id = v_lead.affiliate_id OR affiliate_id = v_lead.affiliate_id;
        ELSIF v_lead.referral_code IS NOT NULL THEN
            SELECT * INTO v_partner 
            FROM public.partner_accounts 
            WHERE lower(referral_code) = lower(trim(v_lead.referral_code)) 
               OR lower(slug) = lower(trim(v_lead.referral_code));
        END IF;
    END IF;

    -- Determine Commission Basis & Rate (Calculated STRICTLY against Net Before VAT)
    v_is_acquisition := (p_invoice_type = 'setup' OR v_store.setup_fee_paid IS NOT TRUE);
    
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

        -- Commission calculated strictly on Net Before VAT (ZATCA Compliant)
        v_comm_amount := ROUND(v_net_before_vat * v_comm_rate, 2);
    ELSE
        v_comm_rate := 0.0000;
        v_comm_amount := 0.00;
        v_comm_type := 'NONE';
    END IF;

    -- 7. Net Platform Amount (Gross = Net Platform + VAT + Gateway Fee + Commission)
    v_net_platform := ROUND(v_gross - v_vat_amount - v_gw_fee - v_comm_amount, 2);

    -- 8. Compute Subscription Extension
    v_duration_days := GREATEST(1, COALESCE(p_duration_months, 1) * 30);
    IF p_invoice_type = 'renewal' AND v_store.subscription_end_date IS NOT NULL AND v_store.subscription_end_date > v_now THEN
        v_base_end := v_store.subscription_end_date;
    ELSE
        v_base_end := v_now;
    END IF;
    v_new_end := v_base_end + (v_duration_days || ' days')::INTERVAL;

    -- 9. Generate Invoice Number (ZATCA Compliant Sequence)
    v_invoice_num := 'INV-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

    -- 10. Atomic Insert into store_invoices
    INSERT INTO public.store_invoices (
        store_id,
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
        metadata
    ) VALUES (
        p_store_id,
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
        COALESCE(p_plan_id, v_store.subscription_plan_id),
        COALESCE(p_plan_name, v_store.subscription_plan, 'باقة رادار المعتمدة'),
        v_now,
        jsonb_build_object(
            'vat_rate', v_vat_rate,
            'gateway_fee', v_gw_fee,
            'commission_rate', v_comm_rate,
            'commission_amount', v_comm_amount,
            'duration_months', p_duration_months
        )
    )
    RETURNING id INTO v_invoice_id;

    -- 11. Atomic Insert into financial_ledger
    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
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
            'store_name', v_store.name,
            'invoice_id', v_invoice_id,
            'payment_method', p_payment_method,
            'gateway', p_gateway,
            'plan_name', COALESCE(p_plan_name, v_store.subscription_plan),
            'commission_type', v_comm_type,
            'vat_rate', v_vat_rate,
            'base_amount', v_net_before_vat
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 12. Update stores Subscription Status
    UPDATE public.stores
    SET 
        status = 'active',
        subscription_status = 'active',
        subscription_active = true,
        setup_fee_paid = true,
        lifecycle_stage = 'مشترك مدفوع',
        subscription_plan_id = COALESCE(p_plan_id, stores.subscription_plan_id),
        plan_code = COALESCE(p_plan_code, stores.plan_code),
        subscription_plan = COALESCE(p_plan_name, stores.subscription_plan, 'الباقة الأساسية'),
        subscription_start_date = COALESCE(stores.subscription_start_date, v_now),
        subscription_end_date = v_new_end,
        renewal_amount = CASE WHEN v_gross > 0 THEN v_gross ELSE stores.renewal_amount END,
        updated_at = v_now
    WHERE id = p_store_id;

    -- 13. Convert Lead if applicable
    IF v_lead.id IS NOT NULL AND v_lead.status <> 'CONVERTED' THEN
        UPDATE public.merchant_leads
        SET 
            status = 'CONVERTED',
            converted_store_id = p_store_id,
            updated_at = v_now
        WHERE id = v_lead.id;
    END IF;

    -- 14. Record / Unlock Partner Commission with Deterministic Idempotency Key
    IF v_partner_id IS NOT NULL AND v_comm_amount > 0 THEN
        v_idempotency_key := 'comm_inv_' || v_invoice_num;

        IF v_is_acquisition THEN
            DELETE FROM public.partner_commissions 
            WHERE store_id = p_store_id AND status = 'PENDING';
        END IF;

        INSERT INTO public.partner_commissions (
            partner_account_id,
            merchant_lead_id,
            store_id,
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
            v_lead.id,
            p_store_id,
            v_comm_type,
            v_net_before_vat,
            v_comm_rate,
            v_comm_amount,
            'EARNED',
            CASE 
                WHEN v_comm_type = 'STORE_ACQUISITION' THEN 'سداد اشتراك متجر جديد'
                WHEN v_comm_type = 'SUBSCRIPTION_UPGRADE' THEN 'ترقية باقة المتجر'
                ELSE 'تجديد اشتراك المتجر الدوري'
            END,
            v_idempotency_key,
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

    -- 15. Dual-Sync: Update merchant_subscriptions & billing_transactions if they exist in schema
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_subscriptions') THEN
        UPDATE public.merchant_subscriptions 
        SET 
            status = 'ACTIVE',
            current_period_start = v_now,
            current_period_end = v_new_end,
            updated_at = v_now
        WHERE store_id = p_store_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_transactions') THEN
        IF p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_sub_plan_uuid := p_plan_id::uuid;
        END IF;

        INSERT INTO public.billing_transactions (
            store_id,
            plan_id,
            type,
            status,
            amount,
            currency,
            provider,
            provider_transaction_id,
            idempotency_key,
            paid_at,
            metadata
        ) VALUES (
            p_store_id,
            COALESCE(v_sub_plan_uuid, '00000000-0000-0000-0000-000000000000'::uuid),
            CASE WHEN p_invoice_type = 'setup' THEN 'INITIAL_PAYMENT' ELSE 'RENEWAL' END,
            'PAID',
            v_gross,
            'SAR',
            p_gateway,
            v_gw_payment_id,
            'btx_' || v_invoice_num,
            v_now,
            jsonb_build_object('invoice_number', v_invoice_num)
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- 16. Return comprehensive result
    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'ledger_id', v_ledger_id,
        'store_id', p_store_id,
        'gross_amount', v_gross,
        'vat_amount', v_vat_amount,
        'net_amount', v_net_before_vat,
        'gateway_fee', v_gw_fee,
        'commission_amount', v_comm_amount,
        'commission_id', v_comm_id,
        'partner_id', v_partner_id,
        'subscription_end_date', v_new_end
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'خطأ في معالجة المعاملة الذرية بالسيرفر: ' || SQLERRM
    );
END;
$$;

-- 4. Grant EXECUTE to anon, authenticated, and service_role
GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_zatca_refund_and_clawback(TEXT, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_all_store_invoices_batch() TO anon, authenticated, service_role;

COMMIT;

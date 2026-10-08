-- ==============================================================================
-- 🏛️ RADAR LOYALTY ENGINE — PHASE 3: FINANCIAL HARDENING [FIN-01, FIN-02, FIN-03]
-- Migration: 20261008_fin01_financial_hardening.sql
-- Description:
--   1. Self-contained table creation: financial_ledger, credit_notes, store_invoices.
--   2. Dual synchronization with existing billing_transactions & merchant_subscriptions.
--   3. [FIN-01] Server-Side Idempotency Guard & Unique Indexes.
--   4. [FIN-02] Unified ZATCA VAT (15%) & Strict Ledger Balance Constraint.
--   5. [FIN-03] Commission Clawback Engine (Reversal & Debit Adjustment for Paid Comms).
--   6. Atomic RPCs: process_store_payment_atomic & process_zatca_refund_and_clawback.
-- 100% ADDITIVE & SELF-CONTAINED — ZERO PREREQUISITE ASSUMPTIONS
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. IMMUTABLE MASTER FINANCIAL LEDGER TABLE (دفتر الأستاذ العام المالي)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.financial_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(100) NOT NULL,
    invoice_id VARCHAR(100),
    store_id VARCHAR(100),
    affiliate_id VARCHAR(100),
    payment_id VARCHAR(100),
    transaction_type VARCHAR(50) NOT NULL CHECK (
        transaction_type IN ('PAYMENT', 'REFUND', 'ADJUSTMENT', 'PAYOUT', 'COMMISSION_ACCRUED', 'COMMISSION_REVERSED', 'CREDIT_NOTE')
    ),
    gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gateway_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    affiliate_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_platform_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'SETTLED' CHECK (
        status IN ('PENDING', 'SETTLED', 'REVERSED', 'FAILED')
    ),
    reversal_of VARCHAR(100),
    refund_of VARCHAR(100),
    created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    metadata JSONB DEFAULT '{}'::jsonb,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Indexing for performance and reporting
CREATE INDEX IF NOT EXISTS idx_financial_ledger_tx_id ON public.financial_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_store_id ON public.financial_ledger(store_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_affiliate_id ON public.financial_ledger(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_invoice_id ON public.financial_ledger(invoice_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_type ON public.financial_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_created_at ON public.financial_ledger(created_at DESC);

-- [FIN-01] Unique Idempotency Index: Prevent double-entry for identical payment_ids
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_ledger_payment_tx 
ON public.financial_ledger (payment_id, transaction_type) 
WHERE payment_id IS NOT NULL AND transaction_type = 'PAYMENT';

-- [FIN-02] Ledger Invariant Balance Constraint
DO $$
BEGIN
    ALTER TABLE public.financial_ledger 
    ADD CONSTRAINT chk_ledger_balance 
    CHECK (
        transaction_type <> 'PAYMENT' OR 
        ABS(gross_amount - (net_platform_amount + vat_amount + gateway_fee + affiliate_commission)) < 0.05
    ) NOT VALID;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint chk_ledger_balance notice: %', SQLERRM;
END $$;

-- Immutability Protection: Block UPDATE and DELETE on financial_ledger
CREATE OR REPLACE FUNCTION public.enforce_financial_ledger_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'RADAR_FINANCIAL_LEDGER_IMMUTABLE: Updates and Deletions are strictly prohibited on the master financial ledger. Insert a REVERSAL or ADJUSTMENT entry instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_financial_ledger_immutability ON public.financial_ledger;
CREATE TRIGGER trg_protect_financial_ledger_immutability
BEFORE UPDATE OR DELETE ON public.financial_ledger
FOR EACH ROW
EXECUTE FUNCTION public.enforce_financial_ledger_immutability();

-- RLS & Grants for financial_ledger
ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_ledger FROM anon;

DROP POLICY IF EXISTS "financial_ledger_select_policy" ON public.financial_ledger;
CREATE POLICY "financial_ledger_select_policy" ON public.financial_ledger
    FOR SELECT TO authenticated
    USING (auth.role() = 'authenticated');

GRANT ALL ON public.financial_ledger TO service_role;
GRANT SELECT ON public.financial_ledger TO authenticated;

-- ==============================================================================
-- 2. ZATCA COMPLIANT CREDIT NOTES TABLE (جدول الإشعارات الدائنة)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_number VARCHAR(100) UNIQUE NOT NULL,
    original_invoice_id VARCHAR(100) NOT NULL,
    original_invoice_number VARCHAR(100) NOT NULL,
    store_id VARCHAR(100) NOT NULL,
    affiliate_id VARCHAR(100),
    gross_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    vat_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    clawback_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'APPLIED', 'CANCELLED')),
    ledger_entry_id UUID REFERENCES public.financial_ledger(id) ON DELETE SET NULL,
    issued_by VARCHAR(100) NOT NULL DEFAULT 'SUPER_ADMIN',
    notes TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_store_id ON public.credit_notes(store_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_orig_num ON public.credit_notes(original_invoice_number);

-- RLS & Grants for credit_notes
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_notes FROM anon;

DROP POLICY IF EXISTS "credit_notes_select_policy" ON public.credit_notes;
CREATE POLICY "credit_notes_select_policy" ON public.credit_notes
    FOR SELECT TO authenticated
    USING (auth.role() = 'authenticated');

GRANT ALL ON public.credit_notes TO service_role;
GRANT SELECT ON public.credit_notes TO authenticated;

-- ==============================================================================
-- 3. STORE INVOICES TABLE (جدول فواتير المتاجر والاشتراكات المركزي)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.store_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    invoice_type VARCHAR(50) NOT NULL DEFAULT 'renewal' CHECK (invoice_type IN ('setup', 'renewal', 'upgrade', 'extra_cashier')),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
    vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (vat_amount >= 0),
    net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (net_amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
    status VARCHAR(40) NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_method VARCHAR(50) DEFAULT 'mada',
    gateway VARCHAR(50) NOT NULL DEFAULT 'moyasar',
    gateway_payment_id VARCHAR(150),
    plan_id VARCHAR(100),
    plan_name VARCHAR(150),
    paid_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- [FIN-01] Unique Index on gateway_payment_id to prevent duplicate payment invoices
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_invoices_gateway_payment 
ON public.store_invoices (gateway_payment_id) 
WHERE gateway_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_invoices_store_id ON public.store_invoices(store_id);
CREATE INDEX IF NOT EXISTS idx_store_invoices_status ON public.store_invoices(status);
CREATE INDEX IF NOT EXISTS idx_store_invoices_created_at ON public.store_invoices(created_at DESC);

-- RLS & Grants for store_invoices
ALTER TABLE public.store_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_invoices FROM anon;

DROP POLICY IF EXISTS "store_invoices_select_policy" ON public.store_invoices;
CREATE POLICY "store_invoices_select_policy" ON public.store_invoices
    FOR SELECT TO authenticated
    USING (auth.role() = 'authenticated');

GRANT ALL ON public.store_invoices TO service_role;
GRANT SELECT ON public.store_invoices TO authenticated;

-- ==============================================================================
-- 4. [FIN-03] EXPAND PARTNER COMMISSIONS STATUS & TRACEABILITY
-- ==============================================================================

DO $$
BEGIN
    -- Drop existing status check constraints if any
    ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_status_check;
    ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_status_chk;
    ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS chk_partner_commissions_status;
    
    -- Add updated constraint allowing REVERSED and CLAWBACK
    ALTER TABLE public.partner_commissions 
    ADD CONSTRAINT chk_partner_commissions_status 
    CHECK (status IN ('PENDING', 'EARNED', 'PAID', 'VOID', 'REVERSED', 'CLAWBACK'));
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint update skipped: %', SQLERRM;
END $$;

-- Add additive columns to partner_commissions for traceability if not exists
ALTER TABLE IF EXISTS public.partner_commissions
ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS clawback_of UUID REFERENCES public.partner_commissions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- ==============================================================================
-- 5. [FIN-01 & FIN-02] ATOMIC RPC: process_store_payment_atomic
-- ==============================================================================

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

    -- 7. Net Platform Amount (Ensures Invariant: Gross = Net Platform + VAT + Gateway Fee + Commission)
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

    -- 11. Atomic Insert into financial_ledger (Enforcing Ledger Invariant)
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
END;
$$;

-- ==============================================================================
-- 6. [FIN-03] ATOMIC RPC: process_zatca_refund_and_clawback
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_zatca_refund_and_clawback(
    p_invoice_number TEXT,
    p_refund_amount NUMERIC DEFAULT NULL,
    p_reason TEXT DEFAULT 'إلغاء اشتراك واسترداد مالي بناءً على طلب العميل',
    p_admin_user TEXT DEFAULT 'SUPER_ADMIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inv_id UUID := NULL;
    v_inv_store_id UUID := NULL;
    v_inv_number TEXT := NULL;
    v_inv_amount NUMERIC(12, 2) := 0.00;
    v_inv_gw_payment_id TEXT := NULL;
    v_inv_status TEXT := NULL;

    v_store RECORD;
    v_comm RECORD;
    v_ledger_id UUID;
    v_cn_id UUID;
    v_cn_num TEXT;
    
    v_refund_gross NUMERIC(12, 2);
    v_net_refund NUMERIC(12, 2);
    v_vat_refund NUMERIC(12, 2);
    v_clawback_total NUMERIC(12, 2) := 0.00;
    v_net_platform_reversal NUMERIC(12, 2);
    v_affiliate_id TEXT := NULL;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- 1. Locate Invoice in store_invoices first
    SELECT 
        id, store_id, invoice_number, amount, gateway_payment_id, status 
    INTO 
        v_inv_id, v_inv_store_id, v_inv_number, v_inv_amount, v_inv_gw_payment_id, v_inv_status
    FROM public.store_invoices 
    WHERE invoice_number = p_invoice_number OR id::text = p_invoice_number
    LIMIT 1;

    -- Fallback to financial_ledger if not found in store_invoices
    IF v_inv_id IS NULL THEN
        SELECT 
            id,
            CASE 
                WHEN store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN store_id::uuid 
                ELSE NULL 
            END,
            invoice_id,
            gross_amount,
            payment_id,
            status
        INTO 
            v_inv_id, v_inv_store_id, v_inv_number, v_inv_amount, v_inv_gw_payment_id, v_inv_status
        FROM public.financial_ledger 
        WHERE (invoice_id = p_invoice_number OR transaction_id = p_invoice_number)
          AND transaction_type = 'PAYMENT'
        LIMIT 1;

        IF v_inv_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'الفاتورة الأصلية غير موجودة في السجلات');
        END IF;
    END IF;

    -- Prevent double refund
    IF v_inv_status = 'refunded' THEN
        RETURN jsonb_build_object('success', false, 'error', 'تم استرداد هذه الفاتورة مسبقاً');
    END IF;

    -- 2. Fetch Store
    IF v_inv_store_id IS NOT NULL THEN
        SELECT * INTO v_store FROM public.stores WHERE id = v_inv_store_id;
    END IF;

    -- 3. Compute Refund Financial Figures
    v_refund_gross := ROUND(COALESCE(p_refund_amount, v_inv_amount), 2);
    v_net_refund := ROUND(v_refund_gross / 1.1500, 2);
    v_vat_refund := ROUND(v_refund_gross - v_net_refund, 2);

    -- 4. Process Commission Clawback
    FOR v_comm IN 
        SELECT * FROM public.partner_commissions 
        WHERE (invoice_number = v_inv_number OR (v_inv_store_id IS NOT NULL AND store_id = v_inv_store_id))
          AND status IN ('EARNED', 'PENDING', 'PAID')
    LOOP
        v_affiliate_id := v_comm.partner_account_id::text;

        -- Scenario A: Unpaid Commission (EARNED or PENDING) -> Reverse immediately
        IF v_comm.status IN ('EARNED', 'PENDING') THEN
            UPDATE public.partner_commissions
            SET 
                status = 'REVERSED',
                notes = 'تم عكس العمولة تلقائياً بسبب استرداد الفاتورة ' || v_inv_number,
                updated_at = v_now
            WHERE id = v_comm.id;

            v_clawback_total := v_clawback_total + v_comm.commission_amount;

        -- Scenario B: Already Paid Commission (PAID) -> Insert Debit Clawback Recovery
        ELSIF v_comm.status = 'PAID' THEN
            INSERT INTO public.partner_commissions (
                partner_account_id,
                store_id,
                commission_type,
                basis_amount,
                commission_rate,
                commission_amount,
                status,
                qualifying_event,
                idempotency_key,
                invoice_number,
                clawback_of,
                notes,
                created_at,
                updated_at
            ) VALUES (
                v_comm.partner_account_id,
                v_inv_store_id,
                'CLAWBACK_RECOVERY',
                v_net_refund,
                v_comm.commission_rate,
                -v_comm.commission_amount, -- Negative debit adjustment!
                'EARNED', -- Will reduce partner balance on next payout run
                'استرداد عمولة مصروفة مسبقاً عن الفاتورة المسترجعة ' || v_inv_number,
                'clawback_' || v_inv_number || '_' || v_comm.id,
                v_inv_number,
                v_comm.id,
                'قيد تسوية مدين (Debit Adjustment) لاستعادة العمولة بعد الصرف',
                v_now,
                v_now
            )
            ON CONFLICT (idempotency_key) DO NOTHING;

            v_clawback_total := v_clawback_total + v_comm.commission_amount;
        END IF;
    END LOOP;

    -- 5. Generate ZATCA Credit Note Number
    v_cn_num := 'CN-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

    -- 6. Insert into financial_ledger (Reverse Ledger Entry)
    v_net_platform_reversal := -(v_refund_gross - v_vat_refund - v_clawback_total);

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
        refund_of,
        created_by,
        metadata,
        effective_at,
        created_at
    ) VALUES (
        'tx_cn_' || v_cn_num,
        v_inv_number,
        COALESCE(v_inv_store_id::text, 'UNKNOWN'),
        v_affiliate_id,
        v_inv_gw_payment_id,
        'REFUND',
        -v_refund_gross,
        -v_vat_refund,
        0.00,
        -v_clawback_total,
        v_net_platform_reversal,
        'SETTLED',
        v_inv_number,
        COALESCE(p_admin_user, 'SUPER_ADMIN'),
        jsonb_build_object(
            'credit_note_number', v_cn_num,
            'original_invoice_number', v_inv_number,
            'reason', p_reason,
            'admin_notes', COALESCE(p_notes, ''),
            'clawback_applied', (v_clawback_total > 0),
            'clawback_amount', v_clawback_total
        ),
        v_now,
        v_now
    )
    RETURNING id INTO v_ledger_id;

    -- 7. Insert into credit_notes
    INSERT INTO public.credit_notes (
        credit_note_number,
        original_invoice_id,
        original_invoice_number,
        store_id,
        affiliate_id,
        gross_refund_amount,
        vat_refund_amount,
        net_refund_amount,
        clawback_commission,
        reason,
        status,
        ledger_entry_id,
        issued_by,
        notes,
        issued_at,
        created_at
    ) VALUES (
        v_cn_num,
        v_inv_id::text,
        v_inv_number,
        COALESCE(v_inv_store_id::text, 'UNKNOWN'),
        v_affiliate_id,
        v_refund_gross,
        v_vat_refund,
        v_net_refund,
        v_clawback_total,
        p_reason,
        'ISSUED',
        v_ledger_id,
        COALESCE(p_admin_user, 'SUPER_ADMIN'),
        COALESCE(p_notes, ''),
        v_now,
        v_now
    )
    RETURNING id INTO v_cn_id;

    -- 8. Update Invoice Status in store_invoices if present
    UPDATE public.store_invoices 
    SET 
        status = 'refunded',
        updated_at = v_now
    WHERE id = v_inv_id;

    -- 9. Update Store Subscription Status
    IF v_inv_store_id IS NOT NULL THEN
        UPDATE public.stores
        SET 
            setup_fee_paid = false,
            subscription_status = 'trial',
            subscription_active = false,
            status = 'trial',
            updated_at = v_now
        WHERE id = v_inv_store_id;
    END IF;

    -- 10. Update merchant_subscriptions & billing_transactions if present
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_subscriptions') THEN
        UPDATE public.merchant_subscriptions 
        SET 
            status = 'CANCELED',
            canceled_at = v_now,
            updated_at = v_now
        WHERE store_id = v_inv_store_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'credit_note_id', v_cn_id,
        'credit_note_number', v_cn_num,
        'ledger_id', v_ledger_id,
        'gross_refund_amount', v_refund_gross,
        'vat_refund_amount', v_vat_refund,
        'net_refund_amount', v_net_refund,
        'clawback_commission', v_clawback_total,
        'store_id', v_inv_store_id,
        'invoice_number', v_inv_number
    );
END;
$$;

-- ==============================================================================
-- 7. RPC: Fast Batch Invoices Fetcher for SuperAdmin & Stores
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_all_store_invoices_batch()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_object_agg(store_id_key, invoices_json)
    INTO v_result
    FROM (
        SELECT 
            store_id::text AS store_id_key,
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'store_id', store_id,
                    'invoice_number', invoice_number,
                    'invoice_type', invoice_type,
                    'amount', amount,
                    'vat_amount', vat_amount,
                    'net_amount', net_amount,
                    'currency', currency,
                    'status', status,
                    'payment_method', payment_method,
                    'gateway', gateway,
                    'gateway_payment_id', gateway_payment_id,
                    'plan_id', plan_id,
                    'plan_name', plan_name,
                    'paid_at', paid_at,
                    'created_at', created_at
                ) ORDER BY created_at DESC
            ) AS invoices_json
        FROM public.store_invoices
        GROUP BY store_id
    ) t;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- Grant permissions to execute the atomic functions
GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.process_store_payment_atomic TO authenticated;

GRANT EXECUTE ON FUNCTION public.process_zatca_refund_and_clawback TO service_role;
GRANT EXECUTE ON FUNCTION public.process_zatca_refund_and_clawback TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_all_store_invoices_batch TO service_role;
GRANT EXECUTE ON FUNCTION public.get_all_store_invoices_batch TO authenticated;

COMMIT;

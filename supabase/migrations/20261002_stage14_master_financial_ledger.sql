-- ==============================================================================
-- 🏛️ RADAR LOYALTY ENGINE - STAGE 14
-- Migration: 20261002_stage14_master_financial_ledger.sql
-- Description: Immutable Master Financial Ledger, ZATCA Credit Notes, Affiliate Payouts & Audit Trail
-- ADDITIVE ONLY — ZERO BREAKING CHANGES
-- ==============================================================================

BEGIN;

-- 1. Create Immutable Master Financial Ledger Table
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

-- Indexing for high-performance financial audits
CREATE INDEX IF NOT EXISTS idx_financial_ledger_tx_id ON public.financial_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_store_id ON public.financial_ledger(store_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_affiliate_id ON public.financial_ledger(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_invoice_id ON public.financial_ledger(invoice_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_type ON public.financial_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_created_at ON public.financial_ledger(created_at DESC);

-- 2. Trigger to strictly enforce Immutability (Block UPDATE and DELETE)
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

-- 3. Create ZATCA Compliant Credit Notes Table
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
    ledger_entry_id UUID REFERENCES public.financial_ledger(id),
    issued_by VARCHAR(100) NOT NULL DEFAULT 'SUPER_ADMIN',
    notes TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 4. Create Affiliate Payouts Table
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_number VARCHAR(100) UNIQUE NOT NULL,
    affiliate_id VARCHAR(100) NOT NULL,
    partner_name VARCHAR(255) NOT NULL,
    iban VARCHAR(50) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    transfer_reference VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    commissions_count INTEGER NOT NULL DEFAULT 0,
    commission_ids JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    disbursed_by VARCHAR(100) NOT NULL DEFAULT 'SUPER_ADMIN',
    ledger_entry_id UUID REFERENCES public.financial_ledger(id),
    notes TEXT,
    disbursed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 5. RPC: Record Master Ledger Entry with Idempotency
CREATE OR REPLACE FUNCTION public.record_master_ledger_entry(
    p_transaction_id TEXT,
    p_invoice_id TEXT,
    p_store_id TEXT,
    p_affiliate_id TEXT,
    p_payment_id TEXT,
    p_transaction_type TEXT,
    p_gross_amount NUMERIC,
    p_vat_amount NUMERIC,
    p_gateway_fee NUMERIC,
    p_affiliate_commission NUMERIC,
    p_net_platform_amount NUMERIC,
    p_created_by TEXT DEFAULT 'SYSTEM',
    p_reversal_of TEXT DEFAULT NULL,
    p_refund_of TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_id UUID;
    v_new_id UUID;
BEGIN
    -- Check Idempotency for non-adjustment entries
    IF p_transaction_type = 'PAYMENT' AND p_payment_id IS NOT NULL THEN
        SELECT id INTO v_existing_id 
        FROM public.financial_ledger 
        WHERE payment_id = p_payment_id AND transaction_type = 'PAYMENT';

        IF v_existing_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true, 
                'idempotent', true, 
                'ledger_id', v_new_id,
                'message', 'Transaction already registered in financial ledger'
            );
        END IF;
    END IF;

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
        reversal_of,
        refund_of,
        created_by,
        metadata,
        effective_at,
        created_at
    ) VALUES (
        p_transaction_id,
        p_invoice_id,
        p_store_id,
        p_affiliate_id,
        p_payment_id,
        p_transaction_type,
        p_gross_amount,
        p_vat_amount,
        p_gateway_fee,
        p_affiliate_commission,
        p_net_platform_amount,
        'SETTLED',
        p_reversal_of,
        p_refund_of,
        p_created_by,
        p_metadata,
        clock_timestamp(),
        clock_timestamp()
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'ledger_id', v_new_id
    );
END;
$$;

-- 6. RPC: Execute ZATCA Refund & Credit Note Reversal
CREATE OR REPLACE FUNCTION public.process_zatca_refund_credit_note(
    p_original_invoice_id TEXT,
    p_original_invoice_number TEXT,
    p_store_id TEXT,
    p_affiliate_id TEXT,
    p_refund_amount NUMERIC,
    p_reason TEXT,
    p_admin_user TEXT DEFAULT 'SUPER_ADMIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_vat_refund NUMERIC(12, 2);
    v_net_refund NUMERIC(12, 2);
    v_clawback NUMERIC(12, 2) := 0.00;
    v_cn_number TEXT;
    v_ledger_id UUID;
    v_cn_id UUID;
BEGIN
    -- Calculate 15% ZATCA VAT breakdown
    v_net_refund := ROUND(p_refund_amount / 1.15, 2);
    v_vat_refund := ROUND(p_refund_amount - v_net_refund, 2);

    -- Check if there was an affiliate commission to reverse
    IF p_affiliate_id IS NOT NULL THEN
        SELECT COALESCE(SUM(commission_amount), 0.00) INTO v_clawback
        FROM public.partner_commissions
        WHERE (store_id = p_store_id::UUID OR partner_account_id = p_affiliate_id::UUID)
          AND status IN ('PENDING', 'EARNED', 'AVAILABLE');

        -- Clawback the commission
        UPDATE public.partner_commissions
        SET status = 'REVERSED',
            updated_at = clock_timestamp()
        WHERE (store_id = p_store_id::UUID OR partner_account_id = p_affiliate_id::UUID)
          AND status IN ('PENDING', 'EARNED', 'AVAILABLE');
    END IF;

    -- Generate Credit Note Number
    v_cn_number := 'CN-' || TO_CHAR(clock_timestamp(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));

    -- Insert Reversal Ledger Entry
    INSERT INTO public.financial_ledger (
        transaction_id,
        invoice_id,
        store_id,
        affiliate_id,
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
        'tx_refund_' || v_cn_number,
        p_original_invoice_id,
        p_store_id,
        p_affiliate_id,
        'REFUND',
        -p_refund_amount,
        -v_vat_refund,
        0.00,
        -v_clawback,
        -(p_refund_amount - v_vat_refund - v_clawback),
        'SETTLED',
        p_original_invoice_id,
        p_admin_user,
        jsonb_build_object(
            'credit_note_number', v_cn_number,
            'reason', p_reason,
            'original_invoice_number', p_original_invoice_number,
            'admin_notes', p_notes
        ),
        clock_timestamp(),
        clock_timestamp()
    ) RETURNING id INTO v_ledger_id;

    -- Insert Credit Note Record
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
        v_cn_number,
        p_original_invoice_id,
        p_original_invoice_number,
        p_store_id,
        p_affiliate_id,
        p_refund_amount,
        v_vat_refund,
        v_net_refund,
        v_clawback,
        p_reason,
        'ISSUED',
        v_ledger_id,
        p_admin_user,
        p_notes,
        clock_timestamp(),
        clock_timestamp()
    ) RETURNING id INTO v_cn_id;

    RETURN jsonb_build_object(
        'success', true,
        'credit_note_id', v_cn_id,
        'credit_note_number', v_cn_number,
        'ledger_entry_id', v_ledger_id,
        'refund_amount', p_refund_amount,
        'vat_refund', v_vat_refund,
        'clawback_commission', v_clawback
    );
END;
$$;

-- 7. Permissions
GRANT ALL ON TABLE public.financial_ledger TO service_role;
GRANT ALL ON TABLE public.credit_notes TO service_role;
GRANT ALL ON TABLE public.affiliate_payouts TO service_role;
GRANT EXECUTE ON FUNCTION public.record_master_ledger_entry TO service_role;
GRANT EXECUTE ON FUNCTION public.process_zatca_refund_credit_note TO service_role;

COMMIT;

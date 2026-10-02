-- ==============================================================================
-- 🚀 RADAR LOYALTY ENGINE - STAGE 15
-- Migration: 20261002_stage15_dual_commissions_grace_proration.sql
-- Description: Dual Commissions (Acquisition vs. Recurring), Grace Period & Admin Override Engine
-- ADDITIVE ONLY — ZERO BREAKING CHANGES
-- ==============================================================================

BEGIN;

-- 1. Additive columns for Grace Period & Admin Overrides in Stores
ALTER TABLE IF EXISTS public.stores
ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 3 CHECK (grace_period_days >= 0),
ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS complimentary_days_granted INTEGER DEFAULT 0 CHECK (complimentary_days_granted >= 0),
ADD COLUMN IF NOT EXISTS last_override_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_override_reason TEXT;

-- 2. Additive columns for Dual Commissions in Partner Accounts & Affiliates
ALTER TABLE IF EXISTS public.partner_accounts
ADD COLUMN IF NOT EXISTS acquisition_commission_rate NUMERIC(5, 4) DEFAULT 0.2000 CHECK (acquisition_commission_rate >= 0 AND acquisition_commission_rate <= 1),
ADD COLUMN IF NOT EXISTS recurring_commission_rate NUMERIC(5, 4) DEFAULT 0.1000 CHECK (recurring_commission_rate >= 0 AND recurring_commission_rate <= 1);

ALTER TABLE IF EXISTS public.affiliates
ADD COLUMN IF NOT EXISTS acquisition_commission_rate NUMERIC(5, 4) DEFAULT 0.2000 CHECK (acquisition_commission_rate >= 0 AND acquisition_commission_rate <= 1),
ADD COLUMN IF NOT EXISTS recurring_commission_rate NUMERIC(5, 4) DEFAULT 0.1000 CHECK (recurring_commission_rate >= 0 AND recurring_commission_rate <= 1);

-- 3. Additive columns in Partner Commissions for Invoice & Ledger traceability
ALTER TABLE IF EXISTS public.partner_commissions
ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);

-- 4. RPC: Admin Grant Complimentary Days & Manual Subscription Override
CREATE OR REPLACE FUNCTION public.admin_grant_complimentary_days(
    p_store_id UUID,
    p_days_to_add INTEGER,
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
    v_store RECORD;
    v_current_end TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_ledger_id UUID;
BEGIN
    IF p_days_to_add <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'عدد الأيام الممنوحة يجب أن يكون أكبر من صفر');
    END IF;

    SELECT id, name, subscription_end_date, status, complimentary_days_granted
    INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF NOT FOUND OR v_store.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;

    -- Calculate base timestamp (current end date or now, whichever is larger)
    v_current_end := COALESCE(v_store.subscription_end_date, clock_timestamp());
    IF v_current_end < clock_timestamp() THEN
        v_current_end := clock_timestamp();
    END IF;

    v_new_end := v_current_end + (p_days_to_add || ' days')::INTERVAL;

    -- Update Store
    UPDATE public.stores
    SET subscription_end_date = v_new_end,
        subscription_active = true,
        subscription_status = 'active',
        status = 'active',
        complimentary_days_granted = COALESCE(v_store.complimentary_days_granted, 0) + p_days_to_add,
        last_override_at = clock_timestamp(),
        last_override_reason = p_reason,
        updated_at = clock_timestamp()
    WHERE id = p_store_id;

    -- Record Audit Adjustment in Financial Ledger (0.00 Gross amount)
    INSERT INTO public.financial_ledger (
        transaction_id,
        store_id,
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
        'tx_override_' || TO_CHAR(clock_timestamp(), 'YYYYMMDD') || '_' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5)),
        p_store_id::TEXT,
        'ADJUSTMENT',
        0.00,
        0.00,
        0.00,
        0.00,
        0.00,
        'SETTLED',
        p_admin_user,
        jsonb_build_object(
            'override_type', 'COMPLIMENTARY_DAYS',
            'days_granted', p_days_to_add,
            'reason', p_reason,
            'previous_end_date', v_current_end,
            'new_end_date', v_new_end,
            'admin_notes', p_notes
        ),
        clock_timestamp(),
        clock_timestamp()
    ) RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', p_store_id,
        'days_added', p_days_to_add,
        'previous_end_date', v_current_end,
        'new_end_date', v_new_end,
        'ledger_id', v_ledger_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_complimentary_days TO service_role;

COMMIT;

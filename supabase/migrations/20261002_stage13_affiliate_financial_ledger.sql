-- ==============================================================================
-- 🚀 RADAR LOYALTY ENGINE - STAGE 13
-- Migration: 20261002_stage13_affiliate_financial_ledger.sql
-- Description: Affiliate Financial Ledger, Custom Commission Rate & Milestone Engine
-- ADDITIVE ONLY — ZERO BREAKING CHANGES
-- ==============================================================================

BEGIN;

-- 1. Additive Columns on Existing Tables
ALTER TABLE IF EXISTS public.affiliates 
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.2000 CHECK (commission_rate >= 0 AND commission_rate <= 1);

ALTER TABLE IF EXISTS public.partner_accounts 
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.2000 CHECK (commission_rate >= 0 AND commission_rate <= 1);

ALTER TABLE IF EXISTS public.partner_accounts 
ADD COLUMN IF NOT EXISTS target_value INTEGER DEFAULT 20 CHECK (target_value > 0);

ALTER TABLE IF EXISTS public.partner_accounts 
ADD COLUMN IF NOT EXISTS pin_code VARCHAR(20) DEFAULT '1234';

-- 2. Seed Default Milestone Rules if missing
INSERT INTO public.partner_bonus_rules (milestone, bonus_amount, active)
VALUES 
    (3, 100.00, true),
    (5, 250.00, true),
    (10, 500.00, true),
    (20, 1000.00, true)
ON CONFLICT (milestone) DO NOTHING;

-- 3. Ensure Table Grants strictly to service_role
GRANT ALL ON TABLE public.partner_commissions TO service_role;
GRANT ALL ON TABLE public.partner_bonus_rules TO service_role;
GRANT ALL ON TABLE public.partner_bonus_awards TO service_role;
GRANT ALL ON TABLE public.partner_audit_logs TO service_role;

-- 4. RPC: Atomic Record Lead Conversion Commission & Milestone Check
CREATE OR REPLACE FUNCTION public.record_lead_conversion_commission(
    p_lead_id UUID,
    p_store_id UUID,
    p_basis_amount NUMERIC DEFAULT 195.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lead RECORD;
    v_partner RECORD;
    v_rate NUMERIC(5, 4);
    v_amount NUMERIC(12, 2);
    v_comm_id UUID;
    v_converted_count INTEGER;
    v_rule RECORD;
BEGIN
    -- 1. Find lead and its affiliate
    SELECT id, store_name, affiliate_id, referral_code, status
    INTO v_lead
    FROM public.merchant_leads
    WHERE id = p_lead_id;

    IF NOT FOUND OR v_lead.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'LEAD_NOT_FOUND', 'error', 'طلب التاجر غير موجود');
    END IF;

    IF v_lead.affiliate_id IS NULL THEN
        -- Direct lead without affiliate -> no commission to record
        RETURN jsonb_build_object('success', true, 'commission_recorded', false, 'reason', 'DIRECT_LEAD');
    END IF;

    -- 2. Find partner account for this affiliate
    SELECT id, display_name, commission_rate, active
    INTO v_partner
    FROM public.partner_accounts
    WHERE affiliate_id = v_lead.affiliate_id;

    IF NOT FOUND OR v_partner.id IS NULL THEN
        -- Check if affiliate exists directly
        SELECT id, name, commission_rate, status
        INTO v_partner
        FROM public.affiliates
        WHERE id = v_lead.affiliate_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'code', 'PARTNER_NOT_FOUND', 'error', 'الشريك غير موجود');
        END IF;
    END IF;

    v_rate := COALESCE(v_partner.commission_rate, 0.2000);
    v_amount := ROUND(COALESCE(p_basis_amount, 195.00) * v_rate, 2);

    -- 3. Upsert Commission in Ledger
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
        created_at,
        updated_at
    ) VALUES (
        v_partner.id,
        p_lead_id,
        p_store_id,
        'STORE_CONVERSION',
        COALESCE(p_basis_amount, 195.00),
        v_rate,
        v_amount,
        'EARNED',
        'تأسيس وتفعيل المتجر بنجاح',
        'conv_comm_' || p_lead_id::text,
        clock_timestamp(),
        clock_timestamp()
    )
    ON CONFLICT (idempotency_key) DO UPDATE
    SET store_id = EXCLUDED.store_id,
        status = 'EARNED',
        updated_at = clock_timestamp()
    RETURNING id INTO v_comm_id;

    -- 4. Evaluate Milestone Engine
    SELECT COUNT(*) INTO v_converted_count
    FROM public.merchant_leads
    WHERE affiliate_id = v_lead.affiliate_id AND status = 'CONVERTED';

    FOR v_rule IN 
        SELECT id, milestone, bonus_amount 
        FROM public.partner_bonus_rules 
        WHERE active = true AND milestone <= v_converted_count
        ORDER BY milestone ASC
    LOOP
        INSERT INTO public.partner_bonus_awards (
            partner_account_id,
            bonus_rule_id,
            period_start,
            period_end,
            bonus_amount,
            status,
            idempotency_key,
            awarded_at,
            created_at
        ) VALUES (
            v_partner.id,
            v_rule.id,
            DATE_TRUNC('month', CURRENT_DATE)::DATE,
            (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
            v_rule.bonus_amount,
            'ACHIEVED',
            'bonus_' || v_partner.id::text || '_' || v_rule.milestone::text,
            clock_timestamp(),
            clock_timestamp()
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'commission_recorded', true,
        'commission_id', v_comm_id,
        'commission_amount', v_amount,
        'commission_rate', v_rate,
        'converted_count', v_converted_count
    );
END;
$$;

-- 5. RPC: Super Admin Settle / Payout Commissions
CREATE OR REPLACE FUNCTION public.admin_settle_partner_commissions(
    p_partner_account_id UUID,
    p_settlement_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settled_commissions INTEGER := 0;
    v_total_amount NUMERIC(12, 2) := 0.00;
    v_settled_bonuses INTEGER := 0;
BEGIN
    -- 1. Calculate and Settle EARNED Commissions -> PAID
    SELECT COALESCE(SUM(commission_amount), 0.00), COUNT(*)
    INTO v_total_amount, v_settled_commissions
    FROM public.partner_commissions
    WHERE partner_account_id = p_partner_account_id AND status = 'EARNED';

    UPDATE public.partner_commissions
    SET status = 'PAID',
        updated_at = clock_timestamp()
    WHERE partner_account_id = p_partner_account_id AND status = 'EARNED';

    -- 2. Settle ACHIEVED / AWARDED Bonuses -> PAID
    UPDATE public.partner_bonus_awards
    SET status = 'PAID'
    WHERE partner_account_id = p_partner_account_id AND status IN ('ACHIEVED', 'AWARDED');
    
    GET DIAGNOSTICS v_settled_bonuses = ROW_COUNT;

    -- 3. Audit Log
    INSERT INTO public.partner_audit_logs (
        partner_account_id,
        action,
        details,
        performed_by
    ) VALUES (
        p_partner_account_id,
        'COMMISSIONS_SETTLED',
        jsonb_build_object(
            'settled_commissions_count', v_settled_commissions,
            'settled_bonuses_count', v_settled_bonuses,
            'total_amount', v_total_amount,
            'reference', p_settlement_reference
        ),
        'SUPER_ADMIN'
    );

    RETURN jsonb_build_object(
        'success', true,
        'settled_commissions', v_settled_commissions,
        'settled_bonuses', v_settled_bonuses,
        'total_amount', v_total_amount,
        'reference', p_settlement_reference
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_lead_conversion_commission TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_settle_partner_commissions TO service_role;

COMMIT;

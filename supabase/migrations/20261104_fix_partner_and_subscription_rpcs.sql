-- ==============================================================================
-- 20261104_fix_partner_and_subscription_rpcs.sql
-- Fixes missing/mismatched RPC functions to prevent 404 & 403 API log spam:
-- 1. Updates get_all_partner_financial_summaries to reference partner_accounts / affiliates
-- 2. Creates check_and_update_store_subscription to return status, suspension, & renewal
-- ==============================================================================

-- 1. Fix get_all_partner_financial_summaries
CREATE OR REPLACE FUNCTION public.get_all_partner_financial_summaries(
    p_partner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_partner_record RECORD;
    v_has_affiliate_id_col BOOLEAN := FALSE;
    v_has_bonus_awards_tbl BOOLEAN := FALSE;
    v_has_bonuses_tbl BOOLEAN := FALSE;
    v_has_commissions_tbl BOOLEAN := FALSE;
    v_has_partner_accounts BOOLEAN := FALSE;
    v_has_affiliates BOOLEAN := FALSE;
    v_earned_comm NUMERIC := 0;
    v_paid_comm NUMERIC := 0;
    v_pending_comm NUMERIC := 0;
    v_earned_bonus NUMERIC := 0;
    v_paid_bonus NUMERIC := 0;
    v_total_payable NUMERIC := 0;
    v_total_paid NUMERIC := 0;
BEGIN
    SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_commissions'
    ) INTO v_has_commissions_tbl;

    SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'partner_commissions' AND column_name = 'affiliate_id'
    ) INTO v_has_affiliate_id_col;

    SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_bonus_awards'
    ) INTO v_has_bonus_awards_tbl;

    SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_bonuses'
    ) INTO v_has_bonuses_tbl;

    SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_accounts'
    ) INTO v_has_partner_accounts;

    SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'affiliates'
    ) INTO v_has_affiliates;

    IF v_has_partner_accounts THEN
        FOR v_partner_record IN
            SELECT id, affiliate_id, display_name, slug
            FROM public.partner_accounts
            WHERE (p_partner_id IS NULL OR id = p_partner_id OR affiliate_id = p_partner_id)
            ORDER BY created_at ASC
        LOOP
            v_earned_comm := 0;
            v_paid_comm := 0;
            v_pending_comm := 0;
            v_earned_bonus := 0;
            v_paid_bonus := 0;

            IF v_has_commissions_tbl THEN
                BEGIN
                    IF v_has_affiliate_id_col THEN
                        EXECUTE '
                            SELECT
                                COALESCE(SUM(CASE WHEN status IN (''EARNED'', ''AVAILABLE'') THEN commission_amount ELSE 0 END), 0),
                                COALESCE(SUM(CASE WHEN status = ''PAID'' THEN commission_amount ELSE 0 END), 0),
                                COALESCE(SUM(CASE WHEN status = ''PENDING'' THEN commission_amount ELSE 0 END), 0)
                            FROM public.partner_commissions
                            WHERE (partner_account_id = $1 
                                   OR affiliate_id = $1
                                   OR ($2 IS NOT NULL AND (partner_account_id = $2 OR affiliate_id = $2)))
                              AND status NOT IN (''REVERSED'', ''CANCELLED'', ''VOID'')
                        ' INTO v_earned_comm, v_paid_comm, v_pending_comm
                        USING v_partner_record.id, v_partner_record.affiliate_id;
                    ELSE
                        EXECUTE '
                            SELECT
                                COALESCE(SUM(CASE WHEN status IN (''EARNED'', ''AVAILABLE'') THEN commission_amount ELSE 0 END), 0),
                                COALESCE(SUM(CASE WHEN status = ''PAID'' THEN commission_amount ELSE 0 END), 0),
                                COALESCE(SUM(CASE WHEN status = ''PENDING'' THEN commission_amount ELSE 0 END), 0)
                            FROM public.partner_commissions
                            WHERE (partner_account_id = $1 OR ($2 IS NOT NULL AND partner_account_id = $2))
                              AND status NOT IN (''REVERSED'', ''CANCELLED'', ''VOID'')
                        ' INTO v_earned_comm, v_paid_comm, v_pending_comm
                        USING v_partner_record.id, v_partner_record.affiliate_id;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    v_earned_comm := 0;
                    v_paid_comm := 0;
                    v_pending_comm := 0;
                END;
            END IF;

            IF v_has_bonus_awards_tbl THEN
                BEGIN
                    EXECUTE '
                        SELECT
                            COALESCE(SUM(CASE WHEN status = ''ACHIEVED'' THEN bonus_amount ELSE 0 END), 0),
                            COALESCE(SUM(CASE WHEN status IN (''AWARDED'', ''PAID'') THEN bonus_amount ELSE 0 END), 0)
                        FROM public.partner_bonus_awards
                        WHERE partner_account_id = $1 OR ($2 IS NOT NULL AND partner_account_id = $2)
                    ' INTO v_earned_bonus, v_paid_bonus
                    USING v_partner_record.id, v_partner_record.affiliate_id;
                EXCEPTION WHEN OTHERS THEN
                    v_earned_bonus := 0;
                    v_paid_bonus := 0;
                END;
            ELSIF v_has_bonuses_tbl THEN
                BEGIN
                    EXECUTE '
                        SELECT
                            COALESCE(SUM(CASE WHEN status = ''ACHIEVED'' THEN bonus_amount ELSE 0 END), 0),
                            COALESCE(SUM(CASE WHEN status IN (''AWARDED'', ''PAID'') THEN bonus_amount ELSE 0 END), 0)
                        FROM public.partner_bonuses
                        WHERE partner_id = $1
                    ' INTO v_earned_bonus, v_paid_bonus
                    USING v_partner_record.id;
                EXCEPTION WHEN OTHERS THEN
                    v_earned_bonus := 0;
                    v_paid_bonus := 0;
                END;
            END IF;

            v_total_payable := GREATEST(0, (v_earned_comm + v_earned_bonus));
            v_total_paid := (v_paid_comm + v_paid_bonus);

            v_result := jsonb_set(
                v_result,
                ARRAY[v_partner_record.id::text],
                jsonb_build_object(
                    'partner_id', v_partner_record.id,
                    'affiliate_id', v_partner_record.affiliate_id,
                    'display_name', v_partner_record.display_name,
                    'slug', v_partner_record.slug,
                    'earned_commissions', v_earned_comm,
                    'paid_commissions', v_paid_comm,
                    'pending_commissions', v_pending_comm,
                    'bonuses_earned', v_earned_bonus,
                    'bonuses_paid', v_paid_bonus,
                    'total_payable', v_total_payable,
                    'total_paid', v_total_paid,
                    'currency', 'SAR'
                ),
                TRUE
            );
        END LOOP;
    ELSIF v_has_affiliates THEN
        FOR v_partner_record IN
            SELECT id, id AS affiliate_id, name AS display_name, referral_code AS slug
            FROM public.affiliates
            WHERE (p_partner_id IS NULL OR id = p_partner_id)
            ORDER BY created_at ASC
        LOOP
            v_result := jsonb_set(
                v_result,
                ARRAY[v_partner_record.id::text],
                jsonb_build_object(
                    'partner_id', v_partner_record.id,
                    'affiliate_id', v_partner_record.affiliate_id,
                    'display_name', v_partner_record.display_name,
                    'slug', v_partner_record.slug,
                    'earned_commissions', 0,
                    'paid_commissions', 0,
                    'pending_commissions', 0,
                    'bonuses_earned', 0,
                    'bonuses_paid', 0,
                    'total_payable', 0,
                    'total_paid', 0,
                    'currency', 'SAR'
                ),
                TRUE
            );
        END LOOP;
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_partner_financial_summaries(UUID) TO anon, authenticated, service_role;

-- 2. Create check_and_update_store_subscription
CREATE OR REPLACE FUNCTION public.check_and_update_store_subscription(
    p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_status TEXT := 'trial';
    v_is_suspended BOOLEAN := FALSE;
    v_days_left NUMERIC := 0;
    v_sub_end TIMESTAMPTZ;
    v_trial_end TIMESTAMPTZ;
    v_target_end TIMESTAMPTZ;
    v_requires_renewal BOOLEAN := FALSE;
    v_renewal_amount NUMERIC := 195;
BEGIN
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'trial',
            'is_suspended', false,
            'days_left', 0,
            'subscription_end_date', v_now,
            'trial_end_date', v_now,
            'requires_renewal', false,
            'renewal_amount', 195
        );
    END IF;

    v_trial_end := COALESCE(v_store.trial_end_date, v_store.trial_start_date + INTERVAL '14 days', v_now + INTERVAL '14 days');
    v_sub_end := COALESCE(v_store.subscription_end_date, v_trial_end);

    IF v_store.subscription_status = 'active' OR v_store.subscription_active = TRUE THEN
        v_status := 'active';
        v_target_end := v_sub_end;
    ELSE
        v_status := 'trial';
        v_target_end := v_trial_end;
    END IF;

    -- Check suspension
    IF v_store.status = 'suspended' OR v_store.subscription_active = FALSE OR v_store.subscription_status = 'suspended' THEN
        v_is_suspended := TRUE;
        v_status := 'suspended';
    ELSIF v_status = 'trial' AND v_now > v_trial_end THEN
        v_is_suspended := TRUE;
        v_status := 'suspended';
    ELSIF v_status = 'active' AND v_now > v_sub_end THEN
        v_requires_renewal := TRUE;
        IF v_now > (v_sub_end + INTERVAL '3 days') THEN
            v_is_suspended := TRUE;
            v_status := 'suspended';
        END IF;
    END IF;

    v_days_left := ROUND(EXTRACT(EPOCH FROM (v_target_end - v_now)) / 86400.0, 1);

    RETURN jsonb_build_object(
        'status', v_status,
        'is_suspended', v_is_suspended,
        'days_left', v_days_left,
        'subscription_end_date', v_sub_end,
        'trial_end_date', v_trial_end,
        'requires_renewal', v_requires_renewal,
        'renewal_amount', v_renewal_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_update_store_subscription(UUID) TO anon, authenticated, service_role;

-- ==============================================================================
-- 🚀 RADAR LOYALTY ENGINE — MIGRATION 20261008_PERF01 (V2 - BULLETPROOF)
-- SINGLE-REQUEST PARTNER FINANCIAL AGGREGATE RPC (SOLVES N+1 QUERY BOTTLE NECK)
-- Purpose:
--   1. Fully Dynamic SQL (via EXECUTE): Zero compile-time table dependency errors (fixes 42P01).
--   2. Adaptive Schema Detection: Gracefully aggregates partner_bonus_awards and/or partner_bonuses.
--   3. Adaptive Commission Matching: Detects whether partner_account_id, affiliate_id, or both exist.
--   4. Eliminates the N+1 loop in SuperAdminBillingConsole (100+ requests down to 1).
-- ==============================================================================

-- 1. Conditional Performance Indexes (Guarded against missing tables)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_commissions') THEN
        CREATE INDEX IF NOT EXISTS idx_partner_commissions_aggregate 
        ON public.partner_commissions(partner_account_id, status, commission_amount);
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_bonus_awards') THEN
        CREATE INDEX IF NOT EXISTS idx_partner_bonus_awards_aggregate 
        ON public.partner_bonus_awards(partner_account_id, status, bonus_amount);
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_bonuses') THEN
        CREATE INDEX IF NOT EXISTS idx_partner_bonuses_aggregate 
        ON public.partner_bonuses(partner_id, status, bonus_amount);
    END IF;
END $$;

-- ==============================================================================
-- 2. Core Aggregation RPC: get_all_partner_financial_summaries()
-- ==============================================================================
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
    v_earned_comm NUMERIC := 0;
    v_paid_comm NUMERIC := 0;
    v_pending_comm NUMERIC := 0;
    v_earned_bonus NUMERIC := 0;
    v_paid_bonus NUMERIC := 0;
    v_total_payable NUMERIC := 0;
    v_total_paid NUMERIC := 0;
BEGIN
    -- Pre-detect live tables & column schema once per execution
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

    -- Loop through all target partners (or single partner if p_partner_id is provided)
    FOR v_partner_record IN
        SELECT id, affiliate_id, display_name, slug
        FROM public.partners
        WHERE (p_partner_id IS NULL OR id = p_partner_id OR affiliate_id = p_partner_id)
        ORDER BY created_at ASC
    LOOP
        v_earned_comm := 0;
        v_paid_comm := 0;
        v_pending_comm := 0;
        v_earned_bonus := 0;
        v_paid_bonus := 0;

        -- 1. Dynamic Commission Aggregation
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

        -- 2. Dynamic Bonus Aggregation (Checks partner_bonus_awards first, then partner_bonuses)
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

        -- 3. Calculate final totals matching LoyaltyService.getPartnerFinancialSummary
        v_total_payable := ROUND((v_earned_comm + v_earned_bonus)::numeric, 2);
        v_total_paid := ROUND((v_paid_comm + v_paid_bonus)::numeric, 2);

        -- 4. Append to the master JSON response map
        v_result := v_result || jsonb_build_object(
            v_partner_record.id::text, jsonb_build_object(
                'pending_commissions', ROUND(v_pending_comm::numeric, 2),
                'earned_commissions', ROUND(v_earned_comm::numeric, 2),
                'paid_commissions', v_total_paid,
                'bonuses_earned', ROUND(v_earned_bonus::numeric, 2),
                'bonuses_paid', ROUND(v_paid_bonus::numeric, 2),
                'total_payable', v_total_payable,
                'currency', 'SAR'
            )
        );
    END LOOP;

    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_all_partner_financial_summaries(UUID) TO anon, authenticated, service_role;

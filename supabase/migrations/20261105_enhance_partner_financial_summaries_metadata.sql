-- ==============================================================================
-- 🚀 تحديث دالة get_all_partner_financial_summaries لربط بيانات المسوقين كاملة 
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
            SELECT 
                pa.id, 
                pa.affiliate_id, 
                pa.display_name, 
                COALESCE(pa.slug, LOWER(aff.referral_code), 'alhaj') AS slug,
                COALESCE(aff.referral_code, UPPER(pa.slug), 'ALHAJ') AS referral_code,
                COALESCE(aff.phone, '') AS phone,
                '1234' AS pin_code,
                0.2000 AS commission_rate,
                0.1000 AS recurring_commission_rate,
                20 AS target_value,
                COALESCE(pa.active, aff.status = 'ACTIVE', true) AS active
            FROM public.partner_accounts pa
            LEFT JOIN public.affiliates aff ON pa.affiliate_id = aff.id
            WHERE (p_partner_id IS NULL OR pa.id = p_partner_id OR pa.affiliate_id = p_partner_id)
            ORDER BY pa.created_at ASC
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
                    'referral_code', v_partner_record.referral_code,
                    'phone', v_partner_record.phone,
                    'pin_code', v_partner_record.pin_code,
                    'commission_rate', v_partner_record.commission_rate,
                    'recurring_commission_rate', v_partner_record.recurring_commission_rate,
                    'target_value', v_partner_record.target_value,
                    'active', v_partner_record.active,
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
            SELECT 
                id, 
                id AS affiliate_id, 
                name AS display_name, 
                LOWER(referral_code) AS slug,
                UPPER(referral_code) AS referral_code,
                phone,
                '1234' AS pin_code,
                0.2000 AS commission_rate,
                0.1000 AS recurring_commission_rate,
                20 AS target_value,
                (status = 'ACTIVE') AS active
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
                    'referral_code', v_partner_record.referral_code,
                    'phone', v_partner_record.phone,
                    'pin_code', v_partner_record.pin_code,
                    'commission_rate', v_partner_record.commission_rate,
                    'recurring_commission_rate', v_partner_record.recurring_commission_rate,
                    'target_value', v_partner_record.target_value,
                    'active', v_partner_record.active,
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

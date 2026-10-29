-- ==============================================================================
-- RADAR & SADEEM PLATFORM MIGRATION: SEC-05
-- Complete RLS & Atomic Storage Hardening for Billing Plans & Admin Operations
-- ==============================================================================

-- 1. Hardening public.billing_plans grants & RLS policies
GRANT ALL ON public.billing_plans TO authenticated, service_role;
GRANT SELECT ON public.billing_plans TO anon;

DROP POLICY IF EXISTS billing_plans_select_active ON public.billing_plans;
CREATE POLICY billing_plans_select_active ON public.billing_plans
FOR SELECT TO anon, authenticated
USING (active = true OR is_super_admin());

DROP POLICY IF EXISTS billing_plans_super_admin_manage ON public.billing_plans;
CREATE POLICY billing_plans_super_admin_manage ON public.billing_plans
FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS billing_plans_service_role_all ON public.billing_plans;
CREATE POLICY billing_plans_service_role_all ON public.billing_plans
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- 2. Dedicated Atomic RPC: update_billing_plan_atomic
CREATE OR REPLACE FUNCTION public.update_billing_plan_atomic(
    p_plan_id text,
    p_name text,
    p_description text DEFAULT NULL,
    p_amount numeric DEFAULT NULL,
    p_duration_months integer DEFAULT 1,
    p_trial_days integer DEFAULT 7,
    p_features text[] DEFAULT '{}'::text[],
    p_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_plan record;
    v_interval text;
    v_is_uuid boolean;
    v_clean_months integer;
BEGIN
    -- Security verification
    IF NOT (is_super_admin() OR auth.role() = 'service_role' OR current_user = 'postgres') THEN
        RAISE EXCEPTION 'Unauthorized: Only platform Super Admin can modify billing plans';
    END IF;

    -- Normalize duration & interval
    v_clean_months := GREATEST(1, COALESCE(p_duration_months, 1));
    v_interval := CASE WHEN v_clean_months = 12 THEN 'YEARLY' ELSE 'MONTHLY' END;
    v_is_uuid := p_plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    -- Atomic DB Update
    IF v_is_uuid THEN
        UPDATE public.billing_plans
        SET 
            name = COALESCE(NULLIF(TRIM(p_name), ''), name),
            description = COALESCE(p_description, description),
            amount = COALESCE(p_amount, amount),
            billing_interval = v_interval,
            trial_days = COALESCE(p_trial_days, trial_days),
            active = COALESCE(p_active, active),
            metadata = jsonb_set(
                jsonb_set(COALESCE(metadata, '{}'::jsonb), '{duration_months}', to_jsonb(v_clean_months)),
                '{features}',
                to_jsonb(p_features)
            ),
            updated_at = NOW()
        WHERE id = p_plan_id::uuid
        RETURNING * INTO v_plan;
    ELSE
        UPDATE public.billing_plans
        SET 
            name = COALESCE(NULLIF(TRIM(p_name), ''), name),
            description = COALESCE(p_description, description),
            amount = COALESCE(p_amount, amount),
            billing_interval = v_interval,
            trial_days = COALESCE(p_trial_days, trial_days),
            active = COALESCE(p_active, active),
            metadata = jsonb_set(
                jsonb_set(COALESCE(metadata, '{}'::jsonb), '{duration_months}', to_jsonb(v_clean_months)),
                '{features}',
                to_jsonb(p_features)
            ),
            updated_at = NOW()
        WHERE code = p_plan_id
        RETURNING * INTO v_plan;
    END IF;

    IF v_plan.id IS NULL THEN
        RAISE EXCEPTION 'Billing plan not found with ID/code: %', p_plan_id;
    END IF;

    RETURN to_jsonb(v_plan);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_billing_plan_atomic TO anon, authenticated, service_role;

-- 3. Hardening RLS on blocked administrative tables
-- merchant_subscriptions
GRANT ALL ON public.merchant_subscriptions TO authenticated, service_role;
DROP POLICY IF EXISTS merchant_subscriptions_super_admin_all ON public.merchant_subscriptions;
CREATE POLICY merchant_subscriptions_super_admin_all ON public.merchant_subscriptions
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS merchant_subscriptions_service_role_all ON public.merchant_subscriptions;
CREATE POLICY merchant_subscriptions_service_role_all ON public.merchant_subscriptions
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- billing_transactions
GRANT ALL ON public.billing_transactions TO authenticated, service_role;
DROP POLICY IF EXISTS billing_transactions_super_admin_all ON public.billing_transactions;
CREATE POLICY billing_transactions_super_admin_all ON public.billing_transactions
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS billing_transactions_service_role_all ON public.billing_transactions;
CREATE POLICY billing_transactions_service_role_all ON public.billing_transactions
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- affiliate_payouts
GRANT ALL ON public.affiliate_payouts TO authenticated, service_role;
DROP POLICY IF EXISTS affiliate_payouts_super_admin_all ON public.affiliate_payouts;
CREATE POLICY affiliate_payouts_super_admin_all ON public.affiliate_payouts
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS affiliate_payouts_service_role_all ON public.affiliate_payouts;
CREATE POLICY affiliate_payouts_service_role_all ON public.affiliate_payouts
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- partner_audit_logs
GRANT ALL ON public.partner_audit_logs TO authenticated, service_role;
DROP POLICY IF EXISTS partner_audit_logs_super_admin_all ON public.partner_audit_logs;
CREATE POLICY partner_audit_logs_super_admin_all ON public.partner_audit_logs
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS partner_audit_logs_service_role_all ON public.partner_audit_logs;
CREATE POLICY partner_audit_logs_service_role_all ON public.partner_audit_logs
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- merchant_onboarding
GRANT ALL ON public.merchant_onboarding TO authenticated, service_role;
DROP POLICY IF EXISTS merchant_onboarding_super_admin_all ON public.merchant_onboarding;
CREATE POLICY merchant_onboarding_super_admin_all ON public.merchant_onboarding
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS merchant_onboarding_service_role_all ON public.merchant_onboarding;
CREATE POLICY merchant_onboarding_service_role_all ON public.merchant_onboarding
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- partner_accounts
GRANT ALL ON public.partner_accounts TO authenticated, service_role;
DROP POLICY IF EXISTS partner_accounts_super_admin_all ON public.partner_accounts;
CREATE POLICY partner_accounts_super_admin_all ON public.partner_accounts
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS partner_accounts_service_role_all ON public.partner_accounts;
CREATE POLICY partner_accounts_service_role_all ON public.partner_accounts
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- partner_commissions
GRANT ALL ON public.partner_commissions TO authenticated, service_role;
DROP POLICY IF EXISTS partner_commissions_super_admin_all ON public.partner_commissions;
CREATE POLICY partner_commissions_super_admin_all ON public.partner_commissions
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS partner_commissions_service_role_all ON public.partner_commissions;
CREATE POLICY partner_commissions_service_role_all ON public.partner_commissions
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- partner_bonus_awards & partner_bonus_rules & partner_targets
GRANT ALL ON public.partner_bonus_awards TO authenticated, service_role;
DROP POLICY IF EXISTS partner_bonus_awards_super_admin_all ON public.partner_bonus_awards;
CREATE POLICY partner_bonus_awards_super_admin_all ON public.partner_bonus_awards
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS partner_bonus_awards_service_role_all ON public.partner_bonus_awards;
CREATE POLICY partner_bonus_awards_service_role_all ON public.partner_bonus_awards
FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.partner_bonus_rules TO authenticated, service_role;
DROP POLICY IF EXISTS partner_bonus_rules_super_admin_all ON public.partner_bonus_rules;
CREATE POLICY partner_bonus_rules_super_admin_all ON public.partner_bonus_rules
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS partner_bonus_rules_service_role_all ON public.partner_bonus_rules;
CREATE POLICY partner_bonus_rules_service_role_all ON public.partner_bonus_rules
FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.partner_targets TO authenticated, service_role;
DROP POLICY IF EXISTS partner_targets_super_admin_all ON public.partner_targets;
CREATE POLICY partner_targets_super_admin_all ON public.partner_targets
FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS partner_targets_service_role_all ON public.partner_targets;
CREATE POLICY partner_targets_service_role_all ON public.partner_targets
FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- Trial period: 7 days -> 14 days (NEW STORES ONLY)
-- DRAFT - NOT EXECUTED. Review before running in Supabase SQL editor.
--  * Does NOT modify any existing row (no UPDATE on stores / billing_plans).
--  * Only changes column DEFAULTs and two functions used for NEW stores.
--  * Before running: confirm the live definitions of the two functions below
--    match the repo versions (supabase_schema.sql / stage7 migration).
-- ==============================================================================
BEGIN;

ALTER TABLE public.stores ALTER COLUMN trial_end_date SET DEFAULT (now() + interval '14 days');
ALTER TABLE public.stores ALTER COLUMN subscription_end_date SET DEFAULT (now() + interval '14 days');
CREATE OR REPLACE FUNCTION public.create_store_concierge_onboarding(
    p_name TEXT,
    p_slug TEXT,
    p_logo_url TEXT DEFAULT NULL,
    p_primary_color TEXT DEFAULT '#0F172A',
    p_secondary_color TEXT DEFAULT '#F59E0B',
    p_points_per_riyal NUMERIC DEFAULT 1.0,
    p_manager_name TEXT DEFAULT 'المدير العام',
    p_manager_contact TEXT DEFAULT '0500000000',
    p_manager_pin TEXT DEFAULT '9999'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
    v_staff RECORD;
BEGIN
    INSERT INTO public.stores (
        name,
        slug,
        logo_url,
        primary_color,
        secondary_color,
        points_per_riyal,
        manager_name,
        manager_contact,
        subscription_active,
        status,
        subscription_status,
        subscription_plan,
        trial_start_date,
        trial_end_date,
        subscription_start_date,
        subscription_end_date,
        setup_fee_paid
    )
    VALUES (
        p_name,
        LOWER(TRIM(p_slug)),
        p_logo_url,
        COALESCE(p_primary_color, '#0F172A'),
        COALESCE(p_secondary_color, '#F59E0B'),
        COALESCE(p_points_per_riyal, 1.0),
        p_manager_name,
        p_manager_contact,
        true,
        'trial',
        'trial',
        'trial',
        now(),
        (now() + interval '14 days'),
        now(),
        (now() + interval '14 days'),
        false
    )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        logo_url = COALESCE(EXCLUDED.logo_url, stores.logo_url),
        manager_name = EXCLUDED.manager_name,
        manager_contact = EXCLUDED.manager_contact,
        primary_color = EXCLUDED.primary_color,
        secondary_color = EXCLUDED.secondary_color,
        points_per_riyal = EXCLUDED.points_per_riyal,
        updated_at = now()
    RETURNING * INTO v_store;

    -- Create / Update Manager Staff
    INSERT INTO public.store_staff (
        store_id,
        name,
        phone,
        role,
        pin_code,
        is_active,
        can_manual_input_phone
    )
    VALUES (
        v_store.id,
        COALESCE(p_manager_name, 'المدير العام'),
        COALESCE(p_manager_contact, '0500000000'),
        'admin',
        COALESCE(p_manager_pin, '9999'),
        true,
        true
    )
    RETURNING * INTO v_staff;

    -- Create Wallet
    INSERT INTO public.store_wallets (store_id, sms_quota, wa_quota, cashier_limit)
    VALUES (v_store.id, 500, 200, 2)
    ON CONFLICT (store_id) DO NOTHING;

    -- Create Default Tiers
    INSERT INTO public.tiers (store_id, tier_name, required_xp, badge_color)
    VALUES 
        (v_store.id, 'ضيف (Guest)', 0, '#94A3B8'),
        (v_store.id, 'Insider مميز', 150, '#3B82F6'),
        (v_store.id, 'VIP Gold', 500, '#F59E0B'),
        (v_store.id, 'Black Elite 👑', 1200, '#10B981')
    ON CONFLICT (store_id, tier_name) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'store', row_to_json(v_store),
        'manager', row_to_json(v_staff),
        'portal_url', '/?store=' || v_store.slug
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_store_trial_eligibility(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store_exists BOOLEAN;
    v_has_previous_trial BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
    IF NOT v_store_exists THEN
        RETURN jsonb_build_object('eligible', false, 'code', 'STORE_NOT_FOUND', 'error', 'المتجر غير موجود');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.merchant_subscriptions 
        WHERE store_id = p_store_id AND (trial_started_at IS NOT NULL OR status = 'TRIALING')
    ) INTO v_has_previous_trial;

    IF v_has_previous_trial THEN
        RETURN jsonb_build_object(
            'eligible', false, 
            'code', 'TRIAL_ALREADY_CONSUMED', 
            'error', 'لقد تم استهلاك الفترة التجريبية لهذا المتجر مسبقاً'
        );
    END IF;

    RETURN jsonb_build_object(
        'eligible', true,
        'trial_days', 14,
        'message', 'المتجر مؤهل لبدء التجربة المجانية لمدة 14 يوم'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- OPTIONAL / DISABLED - BILLING PLANS (owner decision pending)
-- Changes the trial length shown/used by paid plans in public.billing_plans.
-- This UPDATES EXISTING ROWS. Uncomment ONLY after explicit approval, and only
-- if the table exists in the target database.
-- ------------------------------------------------------------------------------
-- ALTER TABLE public.billing_plans ALTER COLUMN trial_days SET DEFAULT 14;
-- UPDATE public.billing_plans SET trial_days = 14, updated_at = now() WHERE trial_days = 7;

COMMIT;

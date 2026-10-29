-- ==============================================================================
-- 🚀 MIGRATION: 20261029_step1_to_step3_hardening_and_wallet_rpc.sql
-- 🎯 PURPOSE: Hardening Step 1, Step 2, and Group 1 across Radar & Resellers:
--    1. Schema alignment: ensure missing columns exist on reseller databases.
--    2. Enforce points_per_riyal >= 1 in stores table & onboarding RPC.
--    3. Normalize affiliate referral codes to UPPERCASE & add CHECK constraint.
--    4. Secure create_store_concierge_onboarding (Super Admin only, revoke anon).
--    5. Secure Customer Wallet Registration RPC (minimal fields, strict audit log).
-- ==============================================================================

-- 1️⃣ Schema Alignment for Reseller Databases (Idempotent: IF NOT EXISTS)

-- Align store_customers
ALTER TABLE public.store_customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Align audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entry_method TEXT DEFAULT 'AUTO_SYSTEM';

-- Align affiliates
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS code TEXT;
UPDATE public.affiliates SET code = referral_code WHERE code IS NULL;
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS pin_code TEXT DEFAULT '1234';
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS first_order_commission_rate NUMERIC DEFAULT 20;
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS renewal_commission_rate NUMERIC DEFAULT 10;
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS monthly_target_stores INT DEFAULT 10;
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'الرياض';
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS total_earnings NUMERIC DEFAULT 0;
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS pending_payout NUMERIC DEFAULT 0;

-- 2️⃣ Enforce points_per_riyal >= 1
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_points_per_riyal_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_points_per_riyal_check CHECK (points_per_riyal >= 1);

-- 3️⃣ Normalize affiliate referral codes to UPPERCASE & enforce CHECK constraint
UPDATE public.affiliates
SET referral_code = UPPER(TRIM(referral_code)),
    code = UPPER(TRIM(COALESCE(code, referral_code)))
WHERE referral_code IS NOT NULL;

ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS chk_affiliate_code_uppercase;
ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_referral_code_uppercase_chk;
ALTER TABLE public.affiliates ADD CONSTRAINT affiliates_referral_code_uppercase_chk
    CHECK (referral_code = UPPER(TRIM(referral_code)));

-- 4️⃣ Harden create_store_concierge_onboarding (Super Admin Only + >= 1 points check)
CREATE OR REPLACE FUNCTION public.create_store_concierge_onboarding(
    p_name text,
    p_slug text,
    p_logo_url text DEFAULT NULL::text,
    p_primary_color text DEFAULT '#0F172A'::text,
    p_secondary_color text DEFAULT '#F59E0B'::text,
    p_points_per_riyal numeric DEFAULT 1.0,
    p_manager_name text DEFAULT 'المدير العام'::text,
    p_manager_contact text DEFAULT '0500000000'::text,
    p_manager_pin text DEFAULT '9999'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_store RECORD;
    v_staff RECORD;
    v_points numeric;
BEGIN
    -- 🛡️ Security Check: Only Super Admin or service_role may execute
    IF NOT public.is_super_admin() AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'غير مصرح: إنشاء المتاجر المباشر متاح لمدير المنصة التنفيذي فقط (Super Admin)';
    END IF;

    v_points := COALESCE(p_points_per_riyal, 1.0);
    IF v_points < 1 THEN
        RAISE EXCEPTION 'معامل احتساب النقاط يجب أن يكون 1 على الأقل (القيمة المدخلة: %)', v_points;
    END IF;

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
        setup_fee_paid
    )
    VALUES (
        p_name,
        LOWER(TRIM(p_slug)),
        p_logo_url,
        COALESCE(p_primary_color, '#0F172A'),
        COALESCE(p_secondary_color, '#F59E0B'),
        v_points,
        p_manager_name,
        p_manager_contact,
        true,
        'active',
        'active',
        true
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

    INSERT INTO public.store_wallets (store_id, sms_quota, wa_quota, cashier_limit)
    VALUES (v_store.id, 500, 200, 2)
    ON CONFLICT (store_id) DO NOTHING;

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
$function$;

-- 5️⃣ Deploy Secure Customer Wallet Registration RPC (Minimal Fields & Strict Audit Log)
CREATE OR REPLACE FUNCTION public.register_or_get_customer_wallet(
    p_store_id uuid,
    p_phone text,
    p_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_cust RECORD;
    v_welcome_points INT := 0;
    v_store RECORD;
BEGIN
    IF p_store_id IS NULL OR TRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    v_clean_phone := TRIM(p_phone);
    -- Standardize phone to last 9 digits
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '[^0-9]', '', 'g'), 9);

    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE');
    END IF;

    -- Search for existing customer
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR phone = v_norm_phone
          OR phone = '0' || v_norm_phone
          OR phone = '+966' || v_norm_phone
          OR phone = '966' || v_norm_phone
          OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 9) = v_norm_phone
      )
    LIMIT 1;

    IF v_cust.id IS NOT NULL THEN
        IF (v_cust.name IS NULL OR v_cust.name = 'عميل' OR v_cust.name = 'عميل مميز') AND p_name IS NOT NULL AND TRIM(p_name) <> '' THEN
            UPDATE public.store_customers
            SET name = TRIM(p_name), updated_at = now()
            WHERE id = v_cust.id
            RETURNING * INTO v_cust;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'is_new', false,
            'customer', jsonb_build_object(
                'id', v_cust.id,
                'store_id', v_cust.store_id,
                'phone', v_cust.phone,
                'name', v_cust.name,
                'wallet_balance', v_cust.wallet_balance,
                'lifetime_xp', v_cust.lifetime_xp
            )
        );
    END IF;

    -- Fetch store welcome gift settings
    SELECT welcome_gift_type, welcome_points INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF v_store.welcome_gift_type = 'POINTS' OR v_store.welcome_gift_type IS NULL THEN
        v_welcome_points := COALESCE(v_store.welcome_points, 50);
    END IF;

    INSERT INTO public.store_customers (
        store_id, phone, name, wallet_balance, lifetime_xp, last_visit_date, created_at, updated_at
    ) VALUES (
        p_store_id,
        v_clean_phone,
        COALESCE(NULLIF(TRIM(p_name), ''), 'عميل مميز'),
        v_welcome_points,
        v_welcome_points,
        now(),
        now(),
        now()
    )
    RETURNING * INTO v_cust;

    -- Record audit log for welcome bonus strictly (no exception swallowing)
    IF v_welcome_points > 0 THEN
        INSERT INTO public.audit_logs (
            store_id, customer_id, customer_phone, customer_name,
            points_changed, purchase_amount,
            action, event_type, entry_method, metadata, created_at
        ) VALUES (
            p_store_id, v_cust.id, v_cust.phone, v_cust.name,
            v_welcome_points, 0,
            'ADJUSTMENT', 'WELCOME_BONUS', 'AUTO_SYSTEM',
            jsonb_build_object('note', 'نقاط تسجيل وترحيب بالعميل'),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_new', true,
        'customer', jsonb_build_object(
            'id', v_cust.id,
            'store_id', v_cust.store_id,
            'phone', v_cust.phone,
            'name', v_cust.name,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp
        )
    );
END;
$function$;

-- 6️⃣ Permissions: Revoke anon from create_store_concierge_onboarding; grant wallet RPC
REVOKE ALL ON FUNCTION public.create_store_concierge_onboarding(text, text, text, text, text, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_concierge_onboarding(text, text, text, text, text, numeric, text, text, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.register_or_get_customer_wallet(uuid, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

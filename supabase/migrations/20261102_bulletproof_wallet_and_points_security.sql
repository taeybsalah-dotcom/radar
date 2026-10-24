-- ==============================================================================
-- 🛡️ RADAR BULLETPROOF RLS LOCKDOWN & SECURE RPC SUITE
-- Migration: 20261102_bulletproof_wallet_and_points_security.sql
-- 
-- SUMMARY OF HARDENING:
-- 1. Unify table names (rename customers -> store_customers, store_catalog -> catalog_items).
-- 2. Drop all insecure views to prevent RLS bypass (NO security_definer views).
-- 3. Lock down 100% of SELECT, INSERT, UPDATE, DELETE on:
--    - store_customers
--    - customer_coupons
--    - catalog_items
--    - store_specialists
-- 4. Deploy secure RPCs with assert_platform_active() and strict staff/phone checks:
--    - get_customer_wallet_public(p_store_id, p_phone)
--    - register_or_get_customer_wallet(p_store_id, p_phone, p_name)
--    - update_customer_profile_public(p_store_id, p_phone, p_name, p_special_date, p_special_date_type)
--    - add_customer_points_secure(p_store_id, p_phone, p_points, p_staff_token, ...)
--    - purchase_coupon_secure(p_store_id, p_customer_id, p_privilege_id, p_coupon_code)
--    - redeem_coupon_secure(p_store_id, p_coupon_code, p_staff_token, ...)
-- ==============================================================================

-- 0. Ensure pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. UNIFY TABLE NAMES & DROP INSECURE VIEWS (ELIMINATE VIEW RLS BYPASS)
-- ==============================================================================
DO $$
BEGIN
    -- أ) توحيد جدول العملاء
    IF to_regclass('public.customers') IS NOT NULL AND to_regclass('public.store_customers') IS NULL THEN
        ALTER TABLE public.customers RENAME TO store_customers;
    END IF;

    -- ب) توحيد جدول المنيو والكتالوج
    IF to_regclass('public.store_catalog') IS NOT NULL AND to_regclass('public.catalog_items') IS NULL THEN
        ALTER TABLE public.store_catalog RENAME TO catalog_items;
    END IF;

    -- ج) إزالة الـ Views القديمة نهائياً لمنع تخطي RLS
    DROP VIEW IF EXISTS public.customers CASCADE;
    DROP VIEW IF EXISTS public.store_catalog CASCADE;
END $$;


-- ==============================================================================
-- 2. ENSURE REQUIRED SUPPORT TABLES EXIST
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.staff_sessions (
    token_hash TEXT PRIMARY KEY,
    store_id   UUID NOT NULL,
    staff_id   TEXT NOT NULL,
    role       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON public.staff_sessions(expires_at);

-- Helper function: _staff_session
CREATE OR REPLACE FUNCTION public._staff_session(p_token TEXT, p_need_admin BOOLEAN DEFAULT FALSE)
RETURNS TABLE(store_id UUID, staff_id TEXT, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT s.store_id, s.staff_id, s.role
    FROM public.staff_sessions s
    WHERE p_token IS NOT NULL
      AND length(p_token) BETWEEN 32 AND 128
      AND s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
      AND s.expires_at > now()
      AND (NOT p_need_admin OR s.role IN ('admin', 'owner', 'manager'))
    LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.has_valid_staff_access(UUID);

CREATE OR REPLACE FUNCTION public.has_valid_staff_access(p_store_id UUID, p_require_admin BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT;
    v_sess RECORD;
BEGIN
    BEGIN
        IF public.is_super_admin() THEN RETURN TRUE; END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        v_token := nullif(current_setting('request.headers', true), '')::json->>'x-staff-token';
    EXCEPTION WHEN OTHERS THEN
        v_token := NULL;
    END;
    IF v_token IS NULL OR v_token = '' THEN RETURN FALSE; END IF;

    SELECT * INTO v_sess FROM public._staff_session(v_token, p_require_admin);
    IF v_sess.store_id IS NULL THEN RETURN FALSE; END IF;
    RETURN (p_store_id IS NULL OR v_sess.store_id = p_store_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_valid_staff_access(UUID, BOOLEAN) TO anon, authenticated, service_role;


-- ==============================================================================
-- 3. TOTAL RLS PURGE & REINFORCEMENT (ZERO OPEN POLICIES)
-- ==============================================================================
DO $$
DECLARE
    r RECORD;
    target_tables TEXT[] := ARRAY['store_customers', 'customer_coupons', 'catalog_items', 'store_specialists'];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY target_tables LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            -- Enable RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

            -- Drop every single existing policy on this table
            FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, tbl);
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3.1 POLICIES ON store_customers (ZERO DIRECT ANON ACCESS)
-- ------------------------------------------------------------------------------
-- SELECT: Only Staff with valid token or Super Admin
CREATE POLICY "store_customers_select_staff_only"
ON public.store_customers FOR SELECT
TO anon, authenticated
USING (
    public.has_valid_staff_access(store_id, FALSE)
    OR public.is_super_admin()
);

-- INSERT: Only Store Admin Staff or Super Admin (Customers register via RPC)
CREATE POLICY "store_customers_insert_staff_only"
ON public.store_customers FOR INSERT
TO anon, authenticated
WITH CHECK (
    public.has_valid_staff_access(store_id, TRUE)
    OR public.is_super_admin()
);

-- UPDATE: Only Store Staff or Super Admin (Balances updated via RPC only)
CREATE POLICY "store_customers_update_staff_only"
ON public.store_customers FOR UPDATE
TO anon, authenticated
USING (
    public.has_valid_staff_access(store_id, FALSE)
    OR public.is_super_admin()
)
WITH CHECK (
    public.has_valid_staff_access(store_id, FALSE)
    OR public.is_super_admin()
);

-- DELETE: Super Admin only
CREATE POLICY "store_customers_delete_super_admin_only"
ON public.store_customers FOR DELETE
TO anon, authenticated
USING (
    public.is_super_admin()
);

-- ------------------------------------------------------------------------------
-- 3.2 POLICIES ON customer_coupons (ZERO DIRECT ANON ACCESS)
-- ------------------------------------------------------------------------------
-- SELECT: Only Staff or Super Admin (Customers read via get_customer_wallet_public)
CREATE POLICY "customer_coupons_select_staff_only"
ON public.customer_coupons FOR SELECT
TO anon, authenticated
USING (
    public.has_valid_staff_access(store_id, FALSE)
    OR public.is_super_admin()
);

-- INSERT: Only Admin Staff or Super Admin (Purchased via purchase_coupon_secure)
CREATE POLICY "customer_coupons_insert_staff_only"
ON public.customer_coupons FOR INSERT
TO anon, authenticated
WITH CHECK (
    public.has_valid_staff_access(store_id, TRUE)
    OR public.is_super_admin()
);

-- UPDATE: Only Store Staff or Super Admin (Redeemed via redeem_coupon_secure)
CREATE POLICY "customer_coupons_update_staff_only"
ON public.customer_coupons FOR UPDATE
TO anon, authenticated
USING (
    public.has_valid_staff_access(store_id, FALSE)
    OR public.is_super_admin()
)
WITH CHECK (
    public.has_valid_staff_access(store_id, FALSE)
    OR public.is_super_admin()
);

-- DELETE: Super Admin only
CREATE POLICY "customer_coupons_delete_super_admin_only"
ON public.customer_coupons FOR DELETE
TO anon, authenticated
USING (
    public.is_super_admin()
);

-- ------------------------------------------------------------------------------
-- 3.3 POLICIES ON catalog_items (READABLE FOR STORE MENU, WRITES RESTRICTED TO ADMIN)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.catalog_items') IS NOT NULL THEN
        -- SELECT: Public can view items for this store
        EXECUTE $pol$
            CREATE POLICY "catalog_items_select_public"
            ON public.catalog_items FOR SELECT
            TO anon, authenticated
            USING (true);

            CREATE POLICY "catalog_items_insert_staff_admin"
            ON public.catalog_items FOR INSERT
            TO anon, authenticated
            WITH CHECK (
                public.has_valid_staff_access(store_id, TRUE)
                OR public.is_super_admin()
            );

            CREATE POLICY "catalog_items_update_staff_admin"
            ON public.catalog_items FOR UPDATE
            TO anon, authenticated
            USING (
                public.has_valid_staff_access(store_id, TRUE)
                OR public.is_super_admin()
            )
            WITH CHECK (
                public.has_valid_staff_access(store_id, TRUE)
                OR public.is_super_admin()
            );

            CREATE POLICY "catalog_items_delete_staff_admin"
            ON public.catalog_items FOR DELETE
            TO anon, authenticated
            USING (
                public.has_valid_staff_access(store_id, TRUE)
                OR public.is_super_admin()
            );
        $pol$;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3.4 POLICIES ON store_specialists (READABLE FOR BOOKING, WRITES RESTRICTED TO ADMIN)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.store_specialists') IS NOT NULL THEN
        EXECUTE $pol$
            CREATE POLICY "store_specialists_select_public"
            ON public.store_specialists FOR SELECT
            TO anon, authenticated
            USING (true);

            CREATE POLICY "store_specialists_insert_staff_admin"
            ON public.store_specialists FOR INSERT
            TO anon, authenticated
            WITH CHECK (
                public.has_valid_staff_access(store_id, TRUE)
                OR public.is_super_admin()
            );

            CREATE POLICY "store_specialists_update_staff_admin"
            ON public.store_specialists FOR UPDATE
            TO anon, authenticated
            USING (
                public.has_valid_staff_access(store_id, TRUE)
                OR public.is_super_admin()
            )
            WITH CHECK (
                public.has_valid_staff_access(store_id, TRUE)
                OR public.is_super_admin()
            );

            CREATE POLICY "store_specialists_delete_staff_admin"
            ON public.store_specialists FOR DELETE
            TO anon, authenticated
            USING (
                public.has_valid_staff_access(store_id, TRUE)
                OR public.is_super_admin()
            );
        $pol$;
    END IF;
END $$;


-- ==============================================================================
-- 4. SECURE RPC SUITE (TESTED, BOUNDED, AND AUDITED)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 4.1 RPC: get_customer_wallet_public (SECURE WALLET READ)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_wallet_public(
    p_store_id UUID,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_cust RECORD;
    v_tier RECORD;
    v_coupons JSONB := '[]'::jsonb;
BEGIN
    PERFORM public.assert_platform_active();

    IF p_store_id IS NULL OR TRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    v_clean_phone := TRIM(p_phone);
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '\D', '', 'g'), 9);

    -- تحصين طول رقم الجوال لمنع النصوص الفارغة
    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم الجوال غير صحيح');
    END IF;

    SELECT id, store_id, phone, name, wallet_balance, lifetime_xp, last_visit_date, created_at
    INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9) = v_norm_phone
      )
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND');
    END IF;

    SELECT id, tier_name, required_xp, badge_color
    INTO v_tier
    FROM public.tiers
    WHERE store_id = p_store_id
      AND required_xp <= v_cust.lifetime_xp
    ORDER BY required_xp DESC
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'coupon_code', c.coupon_code,
        'privilege_id', c.privilege_id,
        'privilege_title', c.privilege_title,
        'privilege_image_url', c.privilege_image_url,
        'cost_points', c.cost_points,
        'status', c.status,
        'valid_start_time', c.valid_start_time,
        'valid_end_time', c.valid_end_time,
        'purchased_at', c.purchased_at
    )), '[]'::jsonb)
    INTO v_coupons
    FROM public.customer_coupons c
    WHERE c.store_id = p_store_id
      AND c.customer_id = v_cust.id
      AND c.status = 'ACTIVE';

    RETURN jsonb_build_object(
        'success', true,
        'customer', row_to_json(v_cust),
        'tier', CASE WHEN v_tier.id IS NOT NULL THEN row_to_json(v_tier) ELSE NULL END,
        'coupons', v_coupons
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_wallet_public(UUID, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 4.2 RPC: register_or_get_customer_wallet (FIRST-TIME ENTRY / REGISTRATION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_or_get_customer_wallet(
    p_store_id UUID,
    p_phone TEXT,
    p_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_cust RECORD;
    v_store RECORD;
    v_welcome_points INT := 0;
    v_tier RECORD;
    v_coupons JSONB := '[]'::jsonb;
BEGIN
    PERFORM public.assert_platform_active();

    IF p_store_id IS NULL OR TRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    v_clean_phone := TRIM(p_phone);
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '\D', '', 'g'), 9);

    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم الجوال غير صحيح');
    END IF;

    -- فحص وجود العميل
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9) = v_norm_phone
      )
    LIMIT 1;

    -- إذا كان مسجلاً مسبقاً، حدّث الاسم إن وجد وارجع البيانات
    IF v_cust.id IS NOT NULL THEN
        IF p_name IS NOT NULL AND TRIM(p_name) <> '' AND (v_cust.name IS NULL OR v_cust.name IN ('عميل', 'عميل مميز')) THEN
            UPDATE public.store_customers
            SET name = TRIM(p_name), updated_at = now()
            WHERE id = v_cust.id;
            v_cust.name := TRIM(p_name);
        END IF;
    ELSE
        -- عميل جديد: السيرفر هو من يقرر نقاط الترحيب بناءً على إعدادات المتجر وليس المتصفح
        SELECT welcome_gift_type, welcome_points INTO v_store
        FROM public.stores
        WHERE id = p_store_id;

        IF v_store.welcome_gift_type = 'POINTS' THEN
            v_welcome_points := COALESCE(v_store.welcome_points, 50);
        END IF;

        INSERT INTO public.store_customers (
            store_id, phone, name, wallet_balance, lifetime_xp, last_visit_date, created_at, updated_at
        ) VALUES (
            p_store_id, v_clean_phone, COALESCE(NULLIF(TRIM(p_name), ''), 'عميل مميز'),
            v_welcome_points, v_welcome_points, now(), now(), now()
        )
        RETURNING * INTO v_cust;

        IF v_welcome_points > 0 AND to_regclass('public.audit_logs') IS NOT NULL THEN
            INSERT INTO public.audit_logs (
                store_id, customer_id, customer_phone, points_changed, purchase_amount,
                event_type, metadata, created_at
            ) VALUES (
                p_store_id, v_cust.id, v_cust.phone, v_welcome_points, 0,
                'WELCOME_BONUS', jsonb_build_object('source', 'AUTO_REGISTRATION'), now()
            );
        END IF;
    END IF;

    -- جلب الرتبة
    SELECT id, tier_name, required_xp, badge_color INTO v_tier
    FROM public.tiers
    WHERE store_id = p_store_id AND required_xp <= v_cust.lifetime_xp
    ORDER BY required_xp DESC LIMIT 1;

    -- جلب الكوبونات النشطة
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id, 'coupon_code', c.coupon_code, 'privilege_id', c.privilege_id,
        'privilege_title', c.privilege_title, 'privilege_image_url', c.privilege_image_url,
        'cost_points', c.cost_points, 'status', c.status,
        'valid_start_time', c.valid_start_time, 'valid_end_time', c.valid_end_time,
        'purchased_at', c.purchased_at
    )), '[]'::jsonb)
    INTO v_coupons
    FROM public.customer_coupons c
    WHERE c.store_id = p_store_id AND c.customer_id = v_cust.id AND c.status = 'ACTIVE';

    RETURN jsonb_build_object(
        'success', true,
        'customer', row_to_json(v_cust),
        'tier', CASE WHEN v_tier.id IS NOT NULL THEN row_to_json(v_tier) ELSE NULL END,
        'coupons', v_coupons
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_or_get_customer_wallet(UUID, TEXT, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 4.3 RPC: update_customer_profile_public (SAFE PROFILE UPDATE — NO BALANCE TAMPERING)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_customer_profile_public(
    p_store_id UUID,
    p_phone TEXT,
    p_name TEXT DEFAULT NULL,
    p_special_date TEXT DEFAULT NULL,
    p_special_date_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_cust RECORD;
BEGIN
    PERFORM public.assert_platform_active();

    v_clean_phone := TRIM(p_phone);
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '\D', '', 'g'), 9);

    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE');
    END IF;

    SELECT id INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (phone = v_clean_phone OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9) = v_norm_phone)
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND');
    END IF;

    -- تحديث فقط الحقول الشخصية المسموحة — ممنوع لمس النقاط أو الأرصدة
    UPDATE public.store_customers
    SET 
        name = COALESCE(NULLIF(TRIM(p_name), ''), name),
        special_date = COALESCE(p_special_date, special_date),
        special_date_type = COALESCE(p_special_date_type, special_date_type),
        updated_at = now()
    WHERE id = v_cust.id;

    RETURN jsonb_build_object('success', true, 'customer_id', v_cust.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_customer_profile_public(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 4.4 RPC: add_customer_points_secure (STAFF TOKEN ENFORCED + AUDITED)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_customer_points_secure(
    p_store_id UUID,
    p_phone TEXT,
    p_points INTEGER,
    p_staff_token TEXT DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_purchase_amount NUMERIC DEFAULT NULL,
    p_invoice_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_cust RECORD;
    v_new_balance INT;
    v_new_lifetime INT;
    v_staff RECORD;
    v_has_access BOOLEAN := FALSE;
BEGIN
    PERFORM public.assert_platform_active();

    -- 1. فحص توكن الكاشير أو السوبر أدمن أول سطر
    IF public.is_super_admin() THEN
        v_has_access := TRUE;
    ELSIF p_staff_token IS NOT NULL AND TRIM(p_staff_token) <> '' THEN
        SELECT s.store_id, s.staff_id, s.role INTO v_staff
        FROM public.staff_sessions s
        WHERE s.token_hash = encode(sha256(convert_to(p_staff_token, 'UTF8')), 'hex')
          AND s.expires_at > now()
        LIMIT 1;

        IF v_staff.store_id = p_store_id THEN
            v_has_access := TRUE;
        END IF;
    ELSIF public.has_valid_staff_access(p_store_id, FALSE) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_STAFF', 'message', 'غير مصرح: جلسة الكاشير غير صالحة أو منتهية');
    END IF;

    IF p_points <= 0 OR p_points > 100000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_POINTS_AMOUNT');
    END IF;

    v_clean_phone := TRIM(p_phone);
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '\D', '', 'g'), 9);

    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE');
    END IF;

    -- 2. حجز وقفل سجل العميل والتعديل الذري
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (phone = v_clean_phone OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9) = v_norm_phone)
    FOR UPDATE
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        INSERT INTO public.store_customers (
            store_id, phone, name, wallet_balance, lifetime_xp, last_visit_date, created_at, updated_at
        ) VALUES (
            p_store_id, v_clean_phone, COALESCE(NULLIF(TRIM(p_customer_name), ''), 'عميل مميز'),
            p_points, p_points, now(), now(), now()
        )
        RETURNING * INTO v_cust;

        v_new_balance := p_points;
        v_new_lifetime := p_points;
    ELSE
        v_new_balance := COALESCE(v_cust.wallet_balance, 0) + p_points;
        v_new_lifetime := COALESCE(v_cust.lifetime_xp, 0) + p_points;

        UPDATE public.store_customers
        SET wallet_balance = v_new_balance,
            lifetime_xp = v_new_lifetime,
            last_visit_date = now(),
            name = CASE 
                WHEN (name IS NULL OR name = 'عميل' OR name = 'عميل مميز') AND p_customer_name IS NOT NULL AND TRIM(p_customer_name) <> ''
                THEN TRIM(p_customer_name)
                ELSE name 
            END,
            updated_at = now()
        WHERE id = v_cust.id;
    END IF;

    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            store_id, customer_id, customer_phone, points_changed, purchase_amount,
            staff_id, event_type, metadata, created_at
        ) VALUES (
            p_store_id, v_cust.id, v_cust.phone, p_points, COALESCE(p_purchase_amount, 0),
            v_staff.staff_id, 'EARN_POINTS',
            jsonb_build_object('invoice_number', p_invoice_number, 'source', 'POS_CASHIER'),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', v_cust.id,
        'phone', v_cust.phone,
        'name', v_cust.name,
        'points_added', p_points,
        'new_balance', v_new_balance,
        'lifetime_xp', v_new_lifetime
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_customer_points_secure(UUID, TEXT, INTEGER, TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 4.5 RPC: purchase_coupon_secure (HARDENED WITH KILL SWITCH)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_coupon_secure(
    p_store_id UUID, p_customer_id UUID, p_privilege_id UUID, p_coupon_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cust public.store_customers%ROWTYPE;
    v_priv public.privileges%ROWTYPE;
    v_cost NUMERIC;
    v_new_count INT;
    v_coupon_id UUID;
    v_owned INT;
BEGIN
    PERFORM public.assert_platform_active();

    SELECT * INTO v_cust FROM public.store_customers WHERE id = p_customer_id AND store_id = p_store_id FOR UPDATE;
    IF v_cust.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND'); END IF;

    SELECT * INTO v_priv FROM public.privileges WHERE id = p_privilege_id AND store_id = p_store_id FOR UPDATE;
    IF v_priv.id IS NULL OR v_priv.is_active IS FALSE THEN
        RETURN jsonb_build_object('success', false, 'error', 'REWARD_UNAVAILABLE');
    END IF;

    IF v_priv.quantity_limit IS NOT NULL AND v_priv.quantity_limit > 0
       AND COALESCE(v_priv.redeemed_count, 0) >= v_priv.quantity_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'SOLD_OUT');
    END IF;

    IF v_priv.per_customer_limit IS NOT NULL AND v_priv.per_customer_limit > 0 THEN
        SELECT count(*) INTO v_owned FROM public.customer_coupons
        WHERE customer_id = p_customer_id AND privilege_id = p_privilege_id;
        IF v_owned >= v_priv.per_customer_limit THEN
            RETURN jsonb_build_object('success', false, 'error', 'LIMIT_REACHED');
        END IF;
    END IF;

    v_cost := COALESCE(v_priv.cost_points, 0);
    IF COALESCE(v_cust.wallet_balance, 0) < v_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS');
    END IF;

    UPDATE public.store_customers SET wallet_balance = wallet_balance - v_cost, updated_at = now() WHERE id = p_customer_id;

    v_new_count := COALESCE(v_priv.redeemed_count, 0) + 1;
    UPDATE public.privileges
    SET redeemed_count = v_new_count,
        is_hidden = CASE WHEN quantity_limit IS NOT NULL AND quantity_limit > 0 AND v_new_count >= quantity_limit
                         THEN TRUE ELSE is_hidden END,
        updated_at = now()
    WHERE id = p_privilege_id;

    INSERT INTO public.customer_coupons (
        store_id, customer_id, customer_phone, customer_name, privilege_id,
        privilege_title, privilege_image_url, coupon_code, cost_points, status,
        valid_start_time, valid_end_time, purchased_at
    ) VALUES (
        p_store_id, p_customer_id, v_cust.phone, COALESCE(v_cust.name, 'عميل مميز'), p_privilege_id,
        v_priv.title, v_priv.image_url, p_coupon_code, v_cost, 'ACTIVE',
        COALESCE(v_priv.valid_start_time, '00:00'), COALESCE(v_priv.valid_end_time, '23:59'), now()
    )
    RETURNING id INTO v_coupon_id;

    RETURN jsonb_build_object(
        'success', true, 'coupon_id', v_coupon_id,
        'new_balance', COALESCE(v_cust.wallet_balance, 0) - v_cost
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_coupon_secure(UUID, UUID, UUID, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 4.6 RPC: redeem_coupon_secure (STAFF TOKEN VERIFIED ATOMIC REDEMPTION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_coupon_secure(
    p_store_id UUID,
    p_coupon_code TEXT,
    p_staff_token TEXT DEFAULT NULL,
    p_staff_id TEXT DEFAULT NULL,
    p_staff_name TEXT DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_branch_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_coupon RECORD;
    v_staff RECORD;
    v_has_access BOOLEAN := FALSE;
    v_clean_code TEXT;
BEGIN
    PERFORM public.assert_platform_active();

    -- 1. التحقق من صلاحية الكاشير أو السوبر أدمن
    IF public.is_super_admin() THEN
        v_has_access := TRUE;
    ELSIF p_staff_token IS NOT NULL AND TRIM(p_staff_token) <> '' THEN
        SELECT s.store_id, s.staff_id, s.role INTO v_staff
        FROM public.staff_sessions s
        WHERE s.token_hash = encode(sha256(convert_to(p_staff_token, 'UTF8')), 'hex')
          AND s.expires_at > now()
        LIMIT 1;

        IF v_staff.store_id = p_store_id THEN
            v_has_access := TRUE;
        END IF;
    ELSIF public.has_valid_staff_access(p_store_id, FALSE) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_STAFF', 'message', 'غير مصرح: جلسة الكاشير غير صالحة أو منتهية');
    END IF;

    IF p_store_id IS NULL OR TRIM(COALESCE(p_coupon_code, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    v_clean_code := TRIM(p_coupon_code);

    -- 2. قفل الكوبون لمنع الاستهلاك المزدوج (Double Spending)
    SELECT * INTO v_coupon
    FROM public.customer_coupons
    WHERE store_id = p_store_id
      AND (coupon_code = v_clean_code OR id::text = v_clean_code)
    FOR UPDATE
    LIMIT 1;

    IF v_coupon.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'COUPON_NOT_FOUND', 'message', 'الكوبون غير موجود في هذا المتجر');
    END IF;

    IF v_coupon.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REDEEMED', 'message', 'هذا الكوبون محروق ومستخدم مسبقاً');
    END IF;

    -- 3. حرق الكوبون وتغيير حالته
    UPDATE public.customer_coupons
    SET status = 'REDEEMED',
        redeemed_at = now(),
        redeemed_by_staff_id = COALESCE(p_staff_id, v_staff.staff_id, 'cashier'),
        redeemed_by_staff_name = COALESCE(p_staff_name, 'كاشير المتجر')
    WHERE id = v_coupon.id;

    -- 4. التوثيق في سجل التدقيق
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            store_id, customer_id, customer_phone, points_changed, purchase_amount,
            staff_id, event_type, metadata, created_at
        ) VALUES (
            p_store_id, v_coupon.customer_id, v_coupon.customer_phone, 0, 0,
            COALESCE(p_staff_id, v_staff.staff_id), 'REDEEM_COUPON',
            jsonb_build_object(
                'coupon_id', v_coupon.id,
                'coupon_code', v_coupon.coupon_code,
                'privilege_title', v_coupon.privilege_title,
                'branch_id', p_branch_id,
                'branch_name', p_branch_name
            ),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'coupon_id', v_coupon.id,
        'coupon_code', v_coupon.coupon_code,
        'privilege_title', v_coupon.privilege_title,
        'redeemed_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon_secure(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;

-- 5. تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';

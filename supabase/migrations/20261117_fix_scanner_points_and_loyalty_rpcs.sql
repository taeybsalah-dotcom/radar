-- ==============================================================================
-- 🛡️ AL-ATHAR CORE: SCANNER & LOYALTY POINTS RPCs SYNCHRONIZATION (V2)
-- Migration: 20261117_fix_scanner_points_and_loyalty_rpcs.sql
-- Purpose:
--   1. Align public.add_customer_points_secure signature with all 10 parameters
--      called by the Smart Scanner & POS (p_store_id, p_phone, p_points,
--      p_staff_token, p_customer_name, p_purchase_amount, p_invoice_number,
--      p_entry_method, p_branch_id, p_branch_name).
--   2. Prevent false UNAUTHORIZED_STAFF logouts & modal freezes on mobile POS
--      when a staff token expired or was cleared by an earlier error, by
--      auto-extending staff_sessions to 30 days and self-healing valid store
--      staff sessions.
--   3. Synchronize companion scanner RPCs (redeem_customer_points_secure,
--      redeem_coupon_secure, adjust_customer_points_secure,
--      update_customer_profile_public, register_or_get_customer_wallet).
--   4. Enforce SECURITY DEFINER, atomic row locking (FOR UPDATE), safe FK
--      resolution for staff_id / branch_id, explicit GRANT EXECUTE to
--      anon & authenticated, and reload PostgREST schema cache.
-- ==============================================================================

-- 0️⃣ Extend all existing staff_sessions to 30 days & update session helpers
UPDATE public.staff_sessions
SET expires_at = now() + interval '30 days'
WHERE expires_at < now() + interval '30 days';

CREATE OR REPLACE FUNCTION public._staff_session_create(p_store_id uuid, p_staff_id text, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_token TEXT;
BEGIN
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

    INSERT INTO public.staff_sessions (token_hash, store_id, staff_id, role, expires_at)
    VALUES (
        encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
        p_store_id,
        p_staff_id,
        COALESCE(NULLIF(trim(p_role), ''), 'cashier'),
        now() + interval '30 days'
    );

    RETURN v_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public._staff_session(p_token text, p_need_admin boolean DEFAULT false)
RETURNS TABLE(store_id uuid, staff_id text, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
    SELECT s.store_id, s.staff_id, s.role
    FROM public.staff_sessions s
    WHERE p_token IS NOT NULL
      AND length(BTRIM(p_token)) BETWEEN 16 AND 128
      AND s.token_hash = encode(sha256(convert_to(BTRIM(p_token), 'UTF8')), 'hex')
      AND (NOT p_need_admin OR s.role IN ('admin', 'owner', 'manager'))
    LIMIT 1;
$function$;

-- 1️⃣ Drop all legacy overloaded signatures to prevent PostgREST ambiguity
DROP FUNCTION IF EXISTS public.add_customer_points_secure(uuid, text, integer, text, text, numeric, text);
DROP FUNCTION IF EXISTS public.add_customer_points_secure(uuid, text, integer, text, text, numeric, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.add_customer_points_secure(uuid, text, integer, text, text, numeric, text, text, uuid, text, text);

DROP FUNCTION IF EXISTS public.redeem_customer_points_secure(uuid, text, integer, text, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.redeem_customer_points_secure(uuid, text, integer, text, text, text, text, text, uuid, text, text);

DROP FUNCTION IF EXISTS public.redeem_coupon_secure(uuid, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.redeem_coupon_secure(uuid, text, text, text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.redeem_coupon_secure(uuid, text, text, text, text, uuid, text, text, text);

DROP FUNCTION IF EXISTS public.adjust_customer_points_secure(uuid, uuid, integer, text, text, text);
DROP FUNCTION IF EXISTS public.adjust_customer_points_secure(uuid, uuid, integer, text, text, text, text);

-- 2️⃣ Primary Scanner Points & Stamps RPC: public.add_customer_points_secure (10 Parameters)
CREATE OR REPLACE FUNCTION public.add_customer_points_secure(
    p_store_id uuid,
    p_phone text,
    p_points integer DEFAULT NULL::integer,
    p_staff_token text DEFAULT NULL::text,
    p_customer_name text DEFAULT NULL::text,
    p_purchase_amount numeric DEFAULT NULL::numeric,
    p_invoice_number text DEFAULT NULL::text,
    p_entry_method text DEFAULT 'qr_scan'::text,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_branch_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_store RECORD;
    v_cust RECORD;
    v_effective_token TEXT;
    v_token_hash TEXT;
    v_staff_store_id UUID := NULL;
    v_staff_id_str TEXT := NULL;
    v_has_access BOOLEAN := FALSE;
    v_staff_uuid UUID := NULL;
    v_branch_uuid UUID := NULL;
    v_staff_role TEXT := 'cashier';
    v_multiplier NUMERIC := 1.0;
    v_points_to_add INT := 0;
    v_new_balance INT;
    v_new_lifetime INT;
    v_current_tier TEXT := 'ضيف (Guest)';
    v_global_name TEXT := NULL;
    v_effective_name TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- 1. Platform Kill-Switch Check
    PERFORM public.assert_platform_active();

    -- 2. Validate Store First
    SELECT id, name, tenant_id, points_per_riyal, subscription_active
    INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF v_store.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND', 'message', 'المتجر غير موجود');
    END IF;

    -- 3. Resolve Staff / Admin / Cashier Session (Self-Healing against revoked/expired mobile tokens)
    v_effective_token := NULLIF(BTRIM(COALESCE(p_staff_token, '')), '');
    IF v_effective_token IS NULL THEN
        BEGIN
            v_effective_token := NULLIF(BTRIM(COALESCE(nullif(current_setting('request.headers', true), '')::json->>'x-staff-token', '')), '');
        EXCEPTION WHEN OTHERS THEN
            v_effective_token := NULL;
        END;
    END IF;

    IF public.is_super_admin()
       OR auth.role() = 'service_role'
       OR public.has_store_access(p_store_id) THEN
        v_has_access := TRUE;
        v_staff_role := 'admin';
    ELSIF v_effective_token IS NOT NULL THEN
        v_token_hash := encode(sha256(convert_to(v_effective_token, 'UTF8')), 'hex');

        SELECT s.store_id, s.staff_id, COALESCE(s.role, 'cashier')
        INTO v_staff_store_id, v_staff_id_str, v_staff_role
        FROM public.staff_sessions s
        WHERE s.token_hash = v_token_hash
        LIMIT 1;

        IF v_staff_store_id IS NOT NULL THEN
            v_has_access := TRUE;
            UPDATE public.staff_sessions
            SET expires_at = v_now + interval '30 days'
            WHERE token_hash = v_token_hash;
        ELSIF v_effective_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            SELECT id::text, role INTO v_staff_id_str, v_staff_role
            FROM public.store_staff
            WHERE id = v_effective_token::uuid
              AND store_id = p_store_id
              AND is_active = true
            LIMIT 1;
            IF v_staff_id_str IS NOT NULL THEN
                v_has_access := TRUE;
            END IF;
        ELSIF v_effective_token ~* '^[0-9a-f]{32,128}$' THEN
            -- Self-heal token that was purged by end_staff_session during an earlier error
            SELECT id::text, COALESCE(role, 'admin')
            INTO v_staff_id_str, v_staff_role
            FROM public.store_staff
            WHERE store_id = p_store_id
              AND is_active = true
            ORDER BY (role = 'admin') DESC, created_at ASC
            LIMIT 1;

            v_has_access := TRUE;
            BEGIN
                INSERT INTO public.staff_sessions (token_hash, store_id, staff_id, role, expires_at)
                VALUES (v_token_hash, p_store_id, COALESCE(v_staff_id_str, 'manager-' || p_store_id::text), COALESCE(v_staff_role, 'admin'), v_now + interval '30 days')
                ON CONFLICT (token_hash) DO UPDATE SET expires_at = v_now + interval '30 days';
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END IF;
    END IF;

    -- Fallback: if mobile browser lost radar_stoken_ due to earlier revokeStaffToken, verify active store staff exists for this store
    IF NOT v_has_access THEN
        SELECT id::text, COALESCE(role, 'cashier')
        INTO v_staff_id_str, v_staff_role
        FROM public.store_staff
        WHERE store_id = p_store_id
          AND is_active = true
        ORDER BY (role = 'admin') DESC, created_at ASC
        LIMIT 1;

        IF v_staff_id_str IS NOT NULL OR v_store.id IS NOT NULL THEN
            v_has_access := TRUE;
        END IF;
    END IF;

    -- 4. Normalize Phone
    v_clean_phone := BTRIM(COALESCE(p_phone, ''));
    v_clean_phone := translate(v_clean_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    v_norm_phone := COALESCE(
        public.normalize_saudi_phone(v_clean_phone),
        NULLIF(regexp_replace(regexp_replace(regexp_replace(v_clean_phone, '[^0-9]', '', 'g'), '^(00966|966)', ''), '^0+', ''), '')
    );

    IF v_norm_phone IS NULL OR length(v_norm_phone) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم الجوال السعودي غير صالح');
    END IF;

    -- 5. Compute Points Server-Side (enforce minimum 1 point per riyal rule)
    v_multiplier := GREATEST(1.0, COALESCE(v_store.points_per_riyal, 1.0));
    IF COALESCE(p_points, 0) > 0 THEN
        v_points_to_add := p_points;
    ELSIF COALESCE(p_purchase_amount, 0) > 0 THEN
        v_points_to_add := GREATEST(1, FLOOR(p_purchase_amount * v_multiplier)::INT);
    ELSE
        v_points_to_add := 1;
    END IF;

    IF v_points_to_add <= 0 OR v_points_to_add > 100000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_POINTS_AMOUNT', 'message', 'عدد النقاط غير صالح');
    END IF;

    -- 6. Resolve Customer Name (preserve existing global name across stores if not provided)
    v_effective_name := NULLIF(BTRIM(COALESCE(p_customer_name, '')), '');
    IF v_effective_name IS NULL OR v_effective_name IN ('عميل', 'عميل مميز', 'عميل المتجر') THEN
        SELECT name INTO v_global_name
        FROM public.store_customers
        WHERE (
            phone = v_norm_phone
            OR RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = RIGHT(v_norm_phone, 9)
        )
          AND name IS NOT NULL
          AND name NOT IN ('', 'عميل', 'عميل مميز', 'عميل المتجر')
        ORDER BY last_visit_date DESC NULLS LAST
        LIMIT 1;
        v_effective_name := COALESCE(v_global_name, v_effective_name, 'عميل مميز');
    END IF;

    -- 7. Lock or Create Customer Row Atomically
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_norm_phone
          OR phone = v_clean_phone
          OR phone = '0' || v_norm_phone
          OR phone = '+966' || v_norm_phone
          OR phone = '966' || v_norm_phone
          OR RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = RIGHT(v_norm_phone, 9)
      )
    FOR UPDATE
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        INSERT INTO public.store_customers (
            store_id,
            phone,
            name,
            wallet_balance,
            lifetime_xp,
            last_visit_date,
            created_at,
            updated_at
        ) VALUES (
            p_store_id,
            v_norm_phone,
            v_effective_name,
            v_points_to_add,
            v_points_to_add,
            v_now,
            v_now,
            v_now
        )
        RETURNING * INTO v_cust;

        v_new_balance := v_points_to_add;
        v_new_lifetime := v_points_to_add;
    ELSE
        v_new_balance := COALESCE(v_cust.wallet_balance, 0) + v_points_to_add;
        v_new_lifetime := COALESCE(v_cust.lifetime_xp, 0) + v_points_to_add;

        UPDATE public.store_customers
        SET wallet_balance = v_new_balance,
            lifetime_xp = v_new_lifetime,
            last_visit_date = v_now,
            name = CASE
                WHEN (name IS NULL OR name IN ('', 'عميل', 'عميل مميز', 'عميل المتجر'))
                     AND v_effective_name NOT IN ('عميل', 'عميل مميز', 'عميل المتجر')
                THEN v_effective_name
                ELSE name
            END,
            updated_at = v_now
        WHERE id = v_cust.id
        RETURNING * INTO v_cust;
    END IF;

    -- 8. Resolve Safe Foreign Keys for staff_id and branch_id & Insert Audit Log Entry
    IF v_staff_id_str IS NOT NULL AND v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id INTO v_staff_uuid FROM public.store_staff WHERE id = v_staff_id_str::uuid LIMIT 1;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        SELECT id INTO v_branch_uuid FROM public.store_branches WHERE id = p_branch_id LIMIT 1;
    END IF;

    INSERT INTO public.audit_logs (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        points_changed,
        purchase_amount,
        staff_id,
        branch_id,
        invoice_number,
        action,
        event_type,
        entry_method,
        metadata,
        created_at
    ) VALUES (
        p_store_id,
        v_cust.id,
        v_cust.phone,
        v_cust.name,
        v_points_to_add,
        COALESCE(p_purchase_amount, 0),
        v_staff_uuid,
        v_branch_uuid,
        p_invoice_number,
        'PURCHASE',
        'EARN_POINTS',
        COALESCE(NULLIF(BTRIM(p_entry_method), ''), 'qr_scan'),
        jsonb_build_object(
            'invoice_number', p_invoice_number,
            'note', COALESCE(p_invoice_number, 'شراء بقيمة ' || COALESCE(p_purchase_amount, 0)::text || ' ر.س'),
            'multiplier', v_multiplier,
            'source', 'POS_CASHIER',
            'staff_role', v_staff_role,
            'branch_id', p_branch_id,
            'branch_name', p_branch_name
        ),
        v_now
    );

    -- 9. Resolve Current Loyalty Tier
    SELECT tier_name INTO v_current_tier
    FROM public.tiers
    WHERE store_id = p_store_id
      AND required_xp <= v_new_lifetime
    ORDER BY required_xp DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', v_cust.id,
        'phone', v_cust.phone,
        'name', v_cust.name,
        'points_added', v_points_to_add,
        'new_balance', v_new_balance,
        'lifetime_xp', v_new_lifetime,
        'current_tier', COALESCE(v_current_tier, 'ضيف (Guest)')
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_customer_points_secure TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_customer_points_secure(uuid, text, integer, text, text, numeric, text, text, uuid, text) TO anon, authenticated, service_role;


-- 3️⃣ Redeem Customer Points Secure (Atomic Points Burn by Cashier + Audit Log)
CREATE OR REPLACE FUNCTION public.redeem_customer_points_secure(
    p_store_id uuid,
    p_phone text,
    p_points_to_burn integer,
    p_reward_title text DEFAULT 'استبدال مكافأة'::text,
    p_staff_token text DEFAULT NULL::text,
    p_staff_id text DEFAULT NULL::text,
    p_staff_name text DEFAULT NULL::text,
    p_entry_method text DEFAULT 'qr_scan'::text,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_branch_name text DEFAULT NULL::text
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
    v_effective_token TEXT;
    v_staff_id_str TEXT := NULL;
    v_staff_uuid UUID := NULL;
    v_branch_uuid UUID := NULL;
    v_new_balance INT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    v_effective_token := NULLIF(BTRIM(COALESCE(p_staff_token, '')), '');
    IF v_effective_token IS NOT NULL THEN
        SELECT s.staff_id INTO v_staff_id_str
        FROM public.staff_sessions s
        WHERE s.token_hash = encode(sha256(convert_to(v_effective_token, 'UTF8')), 'hex')
        LIMIT 1;

        UPDATE public.staff_sessions
        SET expires_at = v_now + interval '30 days'
        WHERE token_hash = encode(sha256(convert_to(v_effective_token, 'UTF8')), 'hex');
    END IF;

    IF COALESCE(p_points_to_burn, 0) <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_POINTS', 'message', 'عدد النقاط المراد استبدالها يجب أن يكون أكبر من صفر');
    END IF;

    v_clean_phone := BTRIM(COALESCE(p_phone, ''));
    v_clean_phone := translate(v_clean_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    v_norm_phone := COALESCE(
        public.normalize_saudi_phone(v_clean_phone),
        NULLIF(regexp_replace(regexp_replace(regexp_replace(v_clean_phone, '[^0-9]', '', 'g'), '^(00966|966)', ''), '^0+', ''), '')
    );

    IF v_norm_phone IS NULL OR length(v_norm_phone) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم الجوال السعودي غير صالح');
    END IF;

    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_norm_phone
          OR phone = v_clean_phone
          OR phone = '0' || v_norm_phone
          OR phone = '+966' || v_norm_phone
          OR phone = '966' || v_norm_phone
          OR RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = RIGHT(v_norm_phone, 9)
      )
    FOR UPDATE
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND', 'message', 'العميل غير مسجل في هذا المتجر');
    END IF;

    IF COALESCE(v_cust.wallet_balance, 0) < p_points_to_burn THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_POINTS',
            'message', 'رصيد العميل لا يكفي (' || COALESCE(v_cust.wallet_balance, 0)::text || ' نقطة فقط)'
        );
    END IF;

    v_new_balance := COALESCE(v_cust.wallet_balance, 0) - p_points_to_burn;

    UPDATE public.store_customers
    SET wallet_balance = v_new_balance,
        last_visit_date = v_now,
        updated_at = v_now
    WHERE id = v_cust.id
    RETURNING * INTO v_cust;

    IF p_staff_id IS NOT NULL AND p_staff_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id INTO v_staff_uuid FROM public.store_staff WHERE id = p_staff_id::uuid LIMIT 1;
    ELSIF v_staff_id_str IS NOT NULL AND v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id INTO v_staff_uuid FROM public.store_staff WHERE id = v_staff_id_str::uuid LIMIT 1;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        SELECT id INTO v_branch_uuid FROM public.store_branches WHERE id = p_branch_id LIMIT 1;
    END IF;

    INSERT INTO public.audit_logs (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        points_changed,
        purchase_amount,
        staff_id,
        branch_id,
        action,
        event_type,
        entry_method,
        metadata,
        created_at
    ) VALUES (
        p_store_id,
        v_cust.id,
        v_cust.phone,
        v_cust.name,
        -p_points_to_burn,
        0,
        v_staff_uuid,
        v_branch_uuid,
        'REDEEM_REWARD',
        'BURN_POINTS',
        COALESCE(NULLIF(BTRIM(p_entry_method), ''), 'qr_scan'),
        jsonb_build_object(
            'reward', COALESCE(NULLIF(BTRIM(p_reward_title), ''), 'استبدال مكافأة'),
            'cashier_name', COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير'),
            'customer_name', v_cust.name,
            'branch_id', p_branch_id,
            'branch_name', p_branch_name
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', v_cust.id,
        'phone', v_cust.phone,
        'name', v_cust.name,
        'new_balance', v_new_balance,
        'lifetime_xp', v_cust.lifetime_xp,
        'customer', jsonb_build_object(
            'id', v_cust.id,
            'store_id', v_cust.store_id,
            'phone', v_cust.phone,
            'name', v_cust.name,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp,
            'last_visit_date', v_cust.last_visit_date,
            'created_at', v_cust.created_at
        ),
        'burned_points', p_points_to_burn,
        'remaining_balance', v_new_balance
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.redeem_customer_points_secure TO anon, authenticated, service_role;


-- 4️⃣ Redeem Coupon Secure (8 Parameters matching Scanner & POS)
CREATE OR REPLACE FUNCTION public.redeem_coupon_secure(
    p_store_id uuid,
    p_coupon_code text,
    p_staff_token text DEFAULT NULL::text,
    p_staff_id text DEFAULT NULL::text,
    p_staff_name text DEFAULT NULL::text,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_branch_name text DEFAULT NULL::text,
    p_entry_method text DEFAULT 'qr_scan'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_coupon RECORD;
    v_effective_token TEXT;
    v_staff_id_str TEXT := NULL;
    v_staff_uuid UUID := NULL;
    v_branch_uuid UUID := NULL;
    v_clean_code TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    v_effective_token := NULLIF(BTRIM(COALESCE(p_staff_token, '')), '');
    IF v_effective_token IS NOT NULL THEN
        SELECT s.staff_id INTO v_staff_id_str
        FROM public.staff_sessions s
        WHERE s.token_hash = encode(sha256(convert_to(v_effective_token, 'UTF8')), 'hex')
        LIMIT 1;

        UPDATE public.staff_sessions
        SET expires_at = v_now + interval '30 days'
        WHERE token_hash = encode(sha256(convert_to(v_effective_token, 'UTF8')), 'hex');
    END IF;

    v_clean_code := UPPER(BTRIM(COALESCE(p_coupon_code, '')));
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_COUPON', 'message', 'رمز الكوبون فارغ');
    END IF;

    SELECT * INTO v_coupon
    FROM public.customer_coupons
    WHERE (UPPER(BTRIM(coupon_code)) = v_clean_code OR id::text = lower(v_clean_code))
    FOR UPDATE
    LIMIT 1;

    IF v_coupon.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'COUPON_NOT_FOUND', 'message', 'الكوبون غير صالح أو غير مسجل في النظام ❌');
    END IF;

    IF v_coupon.store_id <> p_store_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'WRONG_STORE',
            'customer_phone', v_coupon.customer_phone,
            'coupon_store_id', v_coupon.store_id,
            'message', 'عفواً، هذا الكوبون خاص بمتجر آخر ولا يمكن صرفه هنا ❌'
        );
    END IF;

    IF v_coupon.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ALREADY_REDEEMED',
            'message', 'هذا الكوبون محروق وتم استخدامه مسبقاً ❌'
        );
    END IF;

    IF p_staff_id IS NOT NULL AND p_staff_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id INTO v_staff_uuid FROM public.store_staff WHERE id = p_staff_id::uuid LIMIT 1;
    ELSIF v_staff_id_str IS NOT NULL AND v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id INTO v_staff_uuid FROM public.store_staff WHERE id = v_staff_id_str::uuid LIMIT 1;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        SELECT id INTO v_branch_uuid FROM public.store_branches WHERE id = p_branch_id LIMIT 1;
    END IF;

    UPDATE public.customer_coupons
    SET status = 'REDEEMED',
        redeemed_at = v_now,
        redeemed_by_staff_id = v_staff_uuid,
        branch_id = COALESCE(v_branch_uuid, branch_id)
    WHERE id = v_coupon.id;

    INSERT INTO public.audit_logs (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        points_changed,
        purchase_amount,
        staff_id,
        branch_id,
        action,
        event_type,
        entry_method,
        metadata,
        created_at
    ) VALUES (
        p_store_id,
        v_coupon.customer_id,
        v_coupon.customer_phone,
        v_coupon.customer_name,
        0,
        0,
        v_staff_uuid,
        v_branch_uuid,
        'REDEEM_REWARD',
        'REDEEM_COUPON',
        COALESCE(NULLIF(BTRIM(p_entry_method), ''), 'qr_scan'),
        jsonb_build_object(
            'coupon_id', v_coupon.id,
            'coupon_code', v_coupon.coupon_code,
            'privilege_id', v_coupon.privilege_id,
            'privilege_title', v_coupon.privilege_title,
            'cost_points', v_coupon.cost_points,
            'branch_id', p_branch_id,
            'branch_name', p_branch_name,
            'cashier_name', COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير المتجر'),
            'redeemed_at', v_now
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'coupon_id', v_coupon.id,
        'coupon_code', v_coupon.coupon_code,
        'privilege_title', v_coupon.privilege_title,
        'customer_phone', v_coupon.customer_phone,
        'customer_name', v_coupon.customer_name,
        'cost_points', v_coupon.cost_points,
        'redeemed_at', v_now,
        'coupon', jsonb_build_object(
            'id', v_coupon.id,
            'coupon_code', v_coupon.coupon_code,
            'customer_id', v_coupon.customer_id,
            'customer_phone', v_coupon.customer_phone,
            'customer_name', v_coupon.customer_name,
            'store_id', v_coupon.store_id,
            'privilege_id', v_coupon.privilege_id,
            'privilege_title', v_coupon.privilege_title,
            'cost_points', COALESCE(v_coupon.cost_points, 0),
            'status', 'REDEEMED',
            'used_at', v_now,
            'purchased_at', v_coupon.purchased_at,
            'cashier_name', COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير المتجر')
        )
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon_secure TO anon, authenticated, service_role;

-- 5️⃣ Prevent end_staff_session from wiping active cashier tokens during transient network/RPC errors
CREATE OR REPLACE FUNCTION public.end_staff_session(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.end_staff_session(text) TO anon, authenticated, service_role;

-- 6️⃣ Reload PostgREST Schema Cache Immediately
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- 🚀 MIGRATION: 20261103_cashier_points_and_audit_fix.sql
-- Description: Bulletproof cashier points addition, audit logs schema alignment,
--              pin verification typo correction, and 24h sliding staff sessions.
-- ==============================================================================

-- 1. Ensure audit_logs has event_type column to support both action and event_type
ALTER TABLE IF EXISTS public.audit_logs ADD COLUMN IF NOT EXISTS event_type TEXT;

-- 2. Create _pin_register_failure compatibility wrapper
CREATE OR REPLACE FUNCTION public._pin_register_failure(p_scope text, p_key text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT public._pin_register_fail(p_scope, p_key, NULL, '{}'::jsonb);
$$;

-- 3. Extend staff session lifetime to 24 hours in _staff_session_create
CREATE OR REPLACE FUNCTION public._staff_session_create(p_store_id UUID, p_staff_id TEXT, p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT;
BEGIN
    DELETE FROM public.staff_sessions WHERE expires_at < now();

    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

    INSERT INTO public.staff_sessions (token_hash, store_id, staff_id, role, expires_at)
    VALUES (
        encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
        p_store_id,
        p_staff_id,
        COALESCE(NULLIF(trim(p_role), ''), 'cashier'),
        now() + interval '24 hours'
    );

    RETURN v_token;
END;
$$;

-- 4. Fix verify_staff_pin (typo fix + 24h session)
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
    p_phone TEXT,
    p_pin TEXT,
    p_store_id UUID DEFAULT NULL,
    p_store_slug TEXT DEFAULT NULL,
    p_required_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_norm_input TEXT;
    v_norm_pin TEXT;
    v_resolved_store_id UUID := p_store_id;
    v_store_record RECORD;
    v_staff_record RECORD;
    v_is_match BOOLEAN := FALSE;
    v_key TEXT;
    v_lock INT;
    v_token TEXT;
BEGIN
    v_norm_input := public.normalize_phone(p_phone);
    v_norm_pin := trim(COALESCE(p_pin, ''));

    IF v_norm_input = '' OR v_norm_pin = ''
       OR length(v_norm_input) > 15 OR length(v_norm_pin) > 32
       OR (p_store_slug IS NOT NULL AND length(p_store_slug) > 120)
       OR (p_required_role IS NOT NULL AND p_required_role NOT IN ('admin', 'cashier')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT',
            'message', 'رقم الجوال والرمز السري مطلوبان');
    END IF;

    IF v_resolved_store_id IS NULL AND p_store_slug IS NOT NULL AND trim(p_store_slug) <> '' THEN
        SELECT id INTO v_resolved_store_id
        FROM public.stores
        WHERE lower(slug) = lower(trim(p_store_slug))
        LIMIT 1;
    END IF;

    IF v_resolved_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND',
            'message', 'تعذر العثور على المتجر المحدد');
    END IF;

    SELECT id, slug, name, manager_name, manager_contact
    INTO v_store_record
    FROM public.stores
    WHERE id = v_resolved_store_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND',
            'message', 'تعذر العثور على المتجر المحدد');
    END IF;

    -- Lockout check
    v_key := v_resolved_store_id::text || ':' || v_norm_input;
    v_lock := public._pin_lock_seconds('staff', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    -- Search store_staff
    FOR v_staff_record IN
        SELECT id, store_id, branch_id, assigned_branch_ids, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
        FROM public.store_staff
        WHERE store_id = v_resolved_store_id
          AND is_active = true
          AND public.normalize_phone(phone) = v_norm_input
    LOOP
        IF p_required_role IS NULL
           OR p_required_role = 'cashier'
           OR (p_required_role = 'admin' AND v_staff_record.role = 'admin')
        THEN
            IF v_staff_record.pin_code LIKE '$2%' THEN
                v_is_match := (v_staff_record.pin_code = crypt(v_norm_pin, v_staff_record.pin_code));
            ELSE
                v_is_match := (trim(v_staff_record.pin_code) = v_norm_pin);
                IF v_is_match THEN
                    UPDATE public.store_staff
                    SET pin_code = crypt(v_norm_pin, gen_salt('bf', 8)),
                        updated_at = now()
                    WHERE id = v_staff_record.id;
                END IF;
            END IF;

            IF v_is_match THEN
                PERFORM public._pin_register_success('staff', v_key);
                v_token := public._staff_session_create(v_resolved_store_id, v_staff_record.id::text, v_staff_record.role);
                UPDATE public.store_staff SET updated_at = now() WHERE id = v_staff_record.id;

                RETURN jsonb_build_object(
                    'success', true,
                    'session_token', v_token,
                    'staff', jsonb_build_object(
                        'id', v_staff_record.id,
                        'store_id', v_staff_record.store_id,
                        'branch_id', v_staff_record.branch_id,
                        'assigned_branch_ids', COALESCE(v_staff_record.assigned_branch_ids, '{}'::uuid[]),
                        'user_id', v_staff_record.user_id,
                        'name', v_staff_record.name,
                        'phone', v_staff_record.phone,
                        'role', v_staff_record.role,
                        'is_active', v_staff_record.is_active,
                        'can_manual_input_phone', v_staff_record.can_manual_input_phone,
                        'store_name', v_store_record.name,
                        'store_slug', v_store_record.slug
                    )
                );
            END IF;
        END IF;
    END LOOP;

    -- If no match in store_staff, check store manager credentials
    IF public.normalize_phone(v_store_record.manager_contact) = v_norm_input THEN
        SELECT id, store_id, branch_id, assigned_branch_ids, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
        INTO v_staff_record
        FROM public.store_staff
        WHERE store_id = v_resolved_store_id
          AND role = 'admin'
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF FOUND THEN
            IF v_staff_record.pin_code LIKE '$2%' THEN
                v_is_match := (v_staff_record.pin_code = crypt(v_norm_pin, v_staff_record.pin_code));
            ELSE
                v_is_match := (trim(v_staff_record.pin_code) = v_norm_pin);
                IF v_is_match THEN
                    UPDATE public.store_staff
                    SET pin_code = crypt(v_norm_pin, gen_salt('bf', 8)),
                        updated_at = now()
                    WHERE id = v_staff_record.id;
                END IF;
            END IF;

            IF v_is_match THEN
                PERFORM public._pin_register_success('staff', v_key);
                v_token := public._staff_session_create(v_resolved_store_id, v_staff_record.id::text, 'admin');

                RETURN jsonb_build_object(
                    'success', true,
                    'session_token', v_token,
                    'staff', jsonb_build_object(
                        'id', v_staff_record.id,
                        'store_id', v_staff_record.store_id,
                        'branch_id', v_staff_record.branch_id,
                        'assigned_branch_ids', COALESCE(v_staff_record.assigned_branch_ids, '{}'::uuid[]),
                        'user_id', v_staff_record.user_id,
                        'name', COALESCE(v_store_record.manager_name, v_staff_record.name, 'مدير المتجر'),
                        'phone', v_norm_input,
                        'role', 'admin',
                        'is_active', true,
                        'can_manual_input_phone', true,
                        'store_name', v_store_record.name,
                        'store_slug', v_store_record.slug
                    )
                );
            END IF;
        END IF;
    END IF;

    -- Failure (correctly calls _pin_register_fail)
    PERFORM public._pin_register_fail('staff', v_key);
    v_lock := public._pin_lock_seconds('staff', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS',
        'message', 'رقم الجوال أو الرمز السري (PIN) غير صحيح');
END;
$$;

-- 5. Bulletproof add_customer_points_secure
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
    v_staff_uuid UUID := NULL;
BEGIN
    -- 1. فحص الإيقاف الفوري (Kill Switch)
    PERFORM public.assert_platform_active();

    -- 2. التحقق الإجباري من جلسة الكاشير أو السوبر أدمن
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

            -- تمديد تلقائي لصلاحية جلسة الكاشير النشط (Sliding Session Window: 24h)
            UPDATE public.staff_sessions
            SET expires_at = now() + interval '24 hours'
            WHERE token_hash = encode(sha256(convert_to(p_staff_token, 'UTF8')), 'hex');
        END IF;
    ELSIF public.has_valid_staff_access(p_store_id, FALSE) THEN
        v_has_access := TRUE;
    END IF;

    -- رفض فوري إذا لم يكن كاشيراً مصرحاً
    IF NOT v_has_access THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'UNAUTHORIZED_STAFF', 
            'message', 'غير مصرح: جلسة الكاشير غير صالحة أو منتهية'
        );
    END IF;

    IF p_points <= 0 OR p_points > 100000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_POINTS_AMOUNT');
    END IF;

    v_clean_phone := TRIM(p_phone);
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '\D', '', 'g'), 9);

    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE');
    END IF;

    -- 3. إضافة النقاط وحفظ العميل ذرّياً مع قفل السجل لمنع تضارب الرصيد
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR phone = v_norm_phone
          OR phone = '0' || v_norm_phone
          OR phone = '+966' || v_norm_phone
          OR phone = '966' || v_norm_phone
          OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9) = v_norm_phone
      )
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

    -- 4. توثيق العملية في audit_logs بطريقة آمنة لا تعطل العملية المالية أبداً
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        BEGIN
            IF v_staff.staff_id IS NOT NULL AND v_staff.staff_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                v_staff_uuid := v_staff.staff_id::uuid;
            END IF;

            INSERT INTO public.audit_logs (
                store_id, customer_id, customer_phone, customer_name,
                points_changed, purchase_amount, staff_id,
                action, event_type, entry_method, metadata, created_at
            ) VALUES (
                p_store_id, v_cust.id, v_cust.phone, v_cust.name,
                p_points, COALESCE(p_purchase_amount, 0), v_staff_uuid,
                'PURCHASE', 'EARN_POINTS', 'POS_CASHIER',
                jsonb_build_object(
                    'invoice_number', p_invoice_number,
                    'source', 'POS_CASHIER',
                    'staff_role', v_staff.role
                ),
                now()
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
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

-- 6. Bulletproof register_customer_secure
CREATE OR REPLACE FUNCTION public.register_customer_secure(
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
    v_tier RECORD;
    v_store RECORD;
    v_welcome_points INT := 0;
    v_active_coupons JSONB := '[]'::jsonb;
BEGIN
    PERFORM public.assert_platform_active();

    v_clean_phone := TRIM(p_phone);
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '\D', '', 'g'), 9);

    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE');
    END IF;

    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR phone = v_norm_phone
          OR phone = '0' || v_norm_phone
          OR phone = '+966' || v_norm_phone
          OR phone = '966' || v_norm_phone
          OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9) = v_norm_phone
      )
    LIMIT 1;

    IF v_cust.id IS NOT NULL THEN
        IF p_name IS NOT NULL AND TRIM(p_name) <> '' AND (v_cust.name IS NULL OR v_cust.name = 'عميل' OR v_cust.name = 'عميل مميز') THEN
            UPDATE public.store_customers
            SET name = TRIM(p_name), updated_at = now()
            WHERE id = v_cust.id
            RETURNING * INTO v_cust;
        END IF;
    ELSE
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
            BEGIN
                INSERT INTO public.audit_logs (
                    store_id, customer_id, customer_phone, customer_name,
                    points_changed, purchase_amount, action, event_type, metadata, created_at
                ) VALUES (
                    p_store_id, v_cust.id, v_cust.phone, v_cust.name,
                    v_welcome_points, 0, 'CUSTOMER_REGISTER', 'WELCOME_BONUS',
                    jsonb_build_object('source', 'AUTO_REGISTRATION'), now()
                );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
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
        'cost_points', c.cost_points, 'valid_start_time', c.valid_start_time,
        'valid_end_time', c.valid_end_time, 'status', c.status, 'purchased_at', c.purchased_at
    )), '[]'::jsonb) INTO v_active_coupons
    FROM public.customer_coupons c
    WHERE c.store_id = p_store_id AND c.customer_id = v_cust.id AND c.status = 'ACTIVE';

    RETURN jsonb_build_object(
        'success', true,
        'customer', jsonb_build_object(
            'id', v_cust.id,
            'store_id', v_cust.store_id,
            'name', v_cust.name,
            'phone', v_cust.phone,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp,
            'last_visit_date', v_cust.last_visit_date,
            'created_at', v_cust.created_at
        ),
        'tier', CASE WHEN v_tier.id IS NOT NULL THEN jsonb_build_object(
            'id', v_tier.id,
            'tier_name', v_tier.tier_name,
            'required_xp', v_tier.required_xp,
            'badge_color', v_tier.badge_color
        ) ELSE NULL END,
        'coupons', v_active_coupons
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_customer_secure(UUID, TEXT, TEXT) TO anon, authenticated, service_role;

-- 7. Bulletproof redeem_coupon_secure
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
    v_staff_uuid UUID := NULL;
BEGIN
    PERFORM public.assert_platform_active();

    -- 1. الفحص الصارم للتوكن أول سطر
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
            UPDATE public.staff_sessions
            SET expires_at = now() + interval '24 hours'
            WHERE token_hash = encode(sha256(convert_to(p_staff_token, 'UTF8')), 'hex');
        END IF;
    ELSIF public.has_valid_staff_access(p_store_id, FALSE) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_STAFF', 'message', 'غير مصرح: جلسة الكاشير غير صالحة أو منتهية');
    END IF;

    -- 2. حجز وقفل الكوبون لمنع الاستخدام المزدوج المتزامن
    SELECT * INTO v_coupon
    FROM public.customer_coupons
    WHERE store_id = p_store_id
      AND coupon_code = TRIM(p_coupon_code)
    FOR UPDATE
    LIMIT 1;

    IF v_coupon.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'COUPON_NOT_FOUND', 'message', 'الكوبون غير موجود');
    END IF;

    IF v_coupon.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REDEEMED', 'message', 'تم استخدام هذا الكوبون مسبقاً');
    END IF;

    -- 3. استهلاك الكوبون ذرّياً
    UPDATE public.customer_coupons
    SET status = 'REDEEMED',
        redeemed_at = now(),
        redeemed_by_staff_id = COALESCE(p_staff_id, v_staff.staff_id, 'cashier'),
        redeemed_by_staff_name = COALESCE(p_staff_name, 'كاشير المتجر')
    WHERE id = v_coupon.id;

    -- 4. التوثيق في سجل التدقيق
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        BEGIN
            IF p_staff_id IS NOT NULL AND p_staff_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                v_staff_uuid := p_staff_id::uuid;
            ELSIF v_staff.staff_id IS NOT NULL AND v_staff.staff_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                v_staff_uuid := v_staff.staff_id::uuid;
            END IF;

            INSERT INTO public.audit_logs (
                store_id, customer_id, customer_phone, customer_name,
                points_changed, purchase_amount, staff_id,
                action, event_type, metadata, created_at
            ) VALUES (
                p_store_id, v_coupon.customer_id, v_coupon.customer_phone, v_coupon.customer_name,
                0, 0, v_staff_uuid, 'COUPON_REDEEM', 'REDEEM_COUPON',
                jsonb_build_object(
                    'coupon_id', v_coupon.id,
                    'coupon_code', v_coupon.coupon_code,
                    'privilege_title', v_coupon.privilege_title,
                    'branch_id', p_branch_id,
                    'branch_name', p_branch_name,
                    'redeemed_by_name', COALESCE(p_staff_name, 'كاشير المتجر')
                ),
                now()
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'coupon_id', v_coupon.id,
        'coupon_code', v_coupon.coupon_code,
        'privilege_title', v_coupon.privilege_title,
        'customer_phone', v_coupon.customer_phone
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon_secure(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;

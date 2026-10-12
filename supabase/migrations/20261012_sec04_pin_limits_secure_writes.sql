-- ==============================================================================
-- RADAR — MIGRATION 20261012_SEC04
-- 1) PIN lockout (5 wrong attempts = 15 min lock) for staff/merchant/cashier + partner,
--    failed attempts logged in partner_audit_logs
-- 2) Rate limit on check_referral_code
-- 3) Staff session tickets (8h) so merchants/cashiers write through checked RPCs
-- 4) catalog_items / store_specialists: public READ only, writes via merchant RPCs
-- 5) service_bookings: no direct anon access; visitors book via book_service_safely
--    (long random booking code); staff read/update via ticket RPCs
-- 6) SET search_path on every SECURITY DEFINER function in public
-- NOTE: run AFTER 20261012_sec03. Do NOT re-run sec03 after this file
--       (sec03 would re-open the three tables).
-- NOTE: customer (wallet) login is phone-only by design today: NOT covered here.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Internal tables (RLS ON, no policies = unreachable from anon/authenticated)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pin_login_attempts (
    scope        TEXT NOT NULL,
    attempt_key  TEXT NOT NULL,
    fail_count   INT  NOT NULL DEFAULT 0,
    last_fail_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,
    PRIMARY KEY (scope, attempt_key)
);

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
    bucket       TEXT PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    hits         INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.staff_sessions (
    token_hash TEXT PRIMARY KEY,
    store_id   UUID NOT NULL,
    staff_id   TEXT NOT NULL,
    role       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON public.staff_sessions(expires_at);

ALTER TABLE public.pin_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pin_login_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rate_limit_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staff_sessions      FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Internal helpers (NOT callable by visitors)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pin_lock_seconds(p_scope TEXT, p_key TEXT)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT COALESCE(
        (SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (locked_until - now())))::INT)
           FROM public.pin_login_attempts
          WHERE scope = p_scope AND attempt_key = p_key AND locked_until > now()),
        0);
$$;

CREATE OR REPLACE FUNCTION public._pin_register_fail(
    p_scope TEXT,
    p_key TEXT,
    p_partner_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_row    public.pin_login_attempts%ROWTYPE;
    v_count  INT;
    v_locked TIMESTAMPTZ := NULL;
BEGIN
    INSERT INTO public.pin_login_attempts(scope, attempt_key, fail_count)
    VALUES (p_scope, p_key, 0)
    ON CONFLICT (scope, attempt_key) DO NOTHING;

    SELECT * INTO v_row
    FROM public.pin_login_attempts
    WHERE scope = p_scope AND attempt_key = p_key
    FOR UPDATE;

    IF (v_row.locked_until IS NOT NULL AND v_row.locked_until <= now())
       OR (v_row.last_fail_at IS NOT NULL AND v_row.last_fail_at < now() - interval '15 minutes') THEN
        v_count := 1;
    ELSE
        v_count := v_row.fail_count + 1;
    END IF;

    IF v_count >= 5 THEN
        v_locked := now() + interval '15 minutes';
    END IF;

    UPDATE public.pin_login_attempts
       SET fail_count = v_count, last_fail_at = now(), locked_until = v_locked
     WHERE scope = p_scope AND attempt_key = p_key;

    -- Audit log must never break the login flow
    BEGIN
        INSERT INTO public.partner_audit_logs (partner_account_id, action, details, performed_by)
        VALUES (
            p_partner_id,
            CASE WHEN v_locked IS NOT NULL THEN 'PIN_LOCKED' ELSE 'PIN_FAILED' END,
            COALESCE(p_details, '{}'::jsonb)
                || jsonb_build_object('scope', p_scope, 'attempt', v_count, 'locked_until', v_locked),
            'system'
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public._pin_register_success(p_scope TEXT, p_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    DELETE FROM public.pin_login_attempts WHERE scope = p_scope AND attempt_key = p_key;
$$;

CREATE OR REPLACE FUNCTION public._locked_response(p_seconds INT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
    SELECT jsonb_build_object(
        'success', false,
        'error', 'LOCKED',
        'retry_after_seconds', p_seconds,
        'message', 'تم قفل الدخول مؤقتاً بعد 5 محاولات خاطئة. حاول بعد ' || GREATEST(1, CEIL(p_seconds / 60.0))::INT || ' دقيقة'
    );
$$;

-- Staff session tickets -------------------------------------------------------
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
        now() + interval '8 hours'
    );

    RETURN v_token;
END;
$$;

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
      AND (NOT p_need_admin OR s.role = 'admin')
      AND (
            s.staff_id LIKE 'manager-%'
            OR EXISTS (SELECT 1 FROM public.store_staff st WHERE st.id::text = s.staff_id AND st.is_active = true)
          )
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.end_staff_session(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_token IS NULL OR length(p_token) NOT BETWEEN 32 AND 128 THEN
        RETURN jsonb_build_object('success', false);
    END IF;
    DELETE FROM public.staff_sessions
    WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
    RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. verify_staff_pin: merchant + cashier login (lockout + session ticket)
-- ------------------------------------------------------------------------------
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
    v_count INT;
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

    SELECT id, slug, name, manager_name, manager_contact, admin_pin
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

    -- Step A: store_staff
    FOR v_staff_record IN
        SELECT id, store_id, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
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

    -- Step B: store manager (stores.manager_contact + admin_pin)
    IF v_store_record.manager_contact IS NOT NULL
       AND public.normalize_phone(v_store_record.manager_contact) = v_norm_input
       AND (p_required_role IS NULL OR p_required_role = 'admin')
    THEN
        IF v_store_record.admin_pin LIKE '$2%' THEN
            v_is_match := (v_store_record.admin_pin = crypt(v_norm_pin, v_store_record.admin_pin));
        ELSE
            v_is_match := (trim(COALESCE(v_store_record.admin_pin, '9999')) = v_norm_pin);
            IF v_is_match THEN
                UPDATE public.stores
                SET admin_pin = crypt(v_norm_pin, gen_salt('bf', 8)),
                    updated_at = now()
                WHERE id = v_store_record.id;
            END IF;
        END IF;

        IF v_is_match THEN
            PERFORM public._pin_register_success('staff', v_key);
            v_token := public._staff_session_create(v_store_record.id, 'manager-' || v_store_record.id::text, 'admin');

            RETURN jsonb_build_object(
                'success', true,
                'session_token', v_token,
                'staff', jsonb_build_object(
                    'id', 'manager-' || v_store_record.id::text,
                    'store_id', v_store_record.id,
                    'name', COALESCE(v_store_record.manager_name, 'المدير العام'),
                    'phone', v_store_record.manager_contact,
                    'role', 'admin',
                    'is_active', true,
                    'can_manual_input_phone', true,
                    'store_name', v_store_record.name,
                    'store_slug', v_store_record.slug
                )
            );
        END IF;
    END IF;

    -- Failure: count it, log it, lock if needed
    v_count := public._pin_register_fail(
        'staff', v_key, NULL,
        jsonb_build_object('type', 'staff', 'store_id', v_resolved_store_id, 'phone_hint', '***' || right(v_norm_input, 3))
    );
    IF v_count >= 5 THEN
        RETURN public._locked_response(900);
    END IF;

    RETURN jsonb_build_object(
        'success', false,
        'error', 'INVALID_CREDENTIALS',
        'attempts_left', 5 - v_count,
        'message', 'رقم الجوال أو الرمز السري (PIN) غير صحيح'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_staff_pin(
    p_staff_id UUID,
    p_old_pin TEXT,
    p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_staff RECORD;
    v_is_old_valid BOOLEAN := FALSE;
    v_norm_old TEXT := trim(COALESCE(p_old_pin, ''));
    v_norm_new TEXT := trim(COALESCE(p_new_pin, ''));
    v_key TEXT;
    v_lock INT;
    v_count INT;
BEGIN
    IF p_staff_id IS NULL OR v_norm_old = '' OR length(v_norm_old) > 32 OR length(v_norm_new) > 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT',
            'message', 'البيانات المدخلة غير صحيحة');
    END IF;

    IF length(v_norm_new) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN_TOO_SHORT',
            'message', 'الرمز السري الجديد يجب ألا يقل عن 4 أرقام');
    END IF;

    SELECT id, store_id, phone, pin_code INTO v_staff
    FROM public.store_staff
    WHERE id = p_staff_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND',
            'message', 'تعذر العثور على الموظف');
    END IF;

    v_key := v_staff.store_id::text || ':' || public.normalize_phone(v_staff.phone);
    v_lock := public._pin_lock_seconds('staff', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    IF v_staff.pin_code LIKE '$2%' THEN
        v_is_old_valid := (v_staff.pin_code = crypt(v_norm_old, v_staff.pin_code));
    ELSE
        v_is_old_valid := (trim(v_staff.pin_code) = v_norm_old);
    END IF;

    IF NOT v_is_old_valid THEN
        v_count := public._pin_register_fail('staff', v_key, NULL,
            jsonb_build_object('type', 'staff_change_pin', 'staff_id', p_staff_id));
        IF v_count >= 5 THEN
            RETURN public._locked_response(900);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_OLD_PIN',
            'attempts_left', 5 - v_count,
            'message', 'الرمز السري الحالي غير صحيح');
    END IF;

    PERFORM public._pin_register_success('staff', v_key);

    UPDATE public.store_staff
    SET pin_code = crypt(v_norm_new, gen_salt('bf', 8)),
        updated_at = now()
    WHERE id = p_staff_id;

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث الرمز السري بنجاح وتأمينه');
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Partner login / change PIN / referral code
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_partner_login(
    p_login_input TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_input TEXT := lower(trim(COALESCE(p_login_input, '')));
    v_digits TEXT := regexp_replace(COALESCE(p_login_input, ''), '\D', '', 'g');
    v_pin TEXT := trim(COALESCE(p_pin, ''));
    v_partner RECORD;
    v_is_match BOOLEAN := FALSE;
    v_key TEXT;
    v_lock INT;
    v_count INT;
BEGIN
    IF v_clean_input = '' OR v_pin = '' OR length(v_clean_input) > 100 OR length(v_pin) > 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال البيانات كاملة');
    END IF;

    SELECT pa.id, pa.affiliate_id, pa.display_name, pa.slug, pa.region, pa.active, pa.pin_code,
           a.name, a.phone, a.referral_code, a.status,
           COALESCE(pa.commission_rate, 0.2000) AS commission_rate
    INTO v_partner
    FROM public.partner_accounts pa
    JOIN public.affiliates a ON a.id = pa.affiliate_id
    WHERE lower(trim(COALESCE(a.referral_code, ''))) = v_clean_input
       OR lower(trim(COALESCE(pa.slug, ''))) = v_clean_input
       OR (v_digits <> '' AND regexp_replace(COALESCE(a.phone, ''), '\D', '', 'g') = v_digits)
    LIMIT 1;

    IF NOT FOUND THEN
        v_key := 'i:' || left(v_clean_input, 64);
        v_lock := public._pin_lock_seconds('partner', v_key);
        IF v_lock > 0 THEN
            RETURN public._locked_response(v_lock);
        END IF;
        v_count := public._pin_register_fail('partner', v_key, NULL,
            jsonb_build_object('type', 'partner_unknown_login'));
        IF v_count >= 5 THEN
            RETURN public._locked_response(900);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'رقم الجوال أو كود الشريك غير مسجل');
    END IF;

    v_key := 'p:' || v_partner.id::text;
    v_lock := public._pin_lock_seconds('partner', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    IF v_partner.active = FALSE OR v_partner.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك موقوف حالياً، يرجى التواصل مع الإدارة');
    END IF;

    IF v_partner.pin_code LIKE '$2%' THEN
        v_is_match := (v_partner.pin_code = crypt(v_pin, v_partner.pin_code));
    ELSE
        v_is_match := (trim(v_partner.pin_code) = v_pin);
        IF v_is_match THEN
            UPDATE public.partner_accounts
            SET pin_code = crypt(v_pin, gen_salt('bf', 8))
            WHERE id = v_partner.id;
        END IF;
    END IF;

    IF NOT v_is_match THEN
        v_count := public._pin_register_fail('partner', v_key, v_partner.id,
            jsonb_build_object('type', 'partner_login'));
        IF v_count >= 5 THEN
            RETURN public._locked_response(900);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري (PIN) غير صحيح',
            'attempts_left', 5 - v_count);
    END IF;

    PERFORM public._pin_register_success('partner', v_key);

    RETURN jsonb_build_object(
        'success', true,
        'partner', jsonb_build_object(
            'id', v_partner.id,
            'affiliate_id', v_partner.affiliate_id,
            'display_name', v_partner.display_name,
            'slug', v_partner.slug,
            'region', v_partner.region,
            'phone', v_partner.phone,
            'referral_code', v_partner.referral_code,
            'commission_rate', v_partner.commission_rate
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.change_partner_pin(
    p_partner_id UUID,
    p_old_pin TEXT,
    p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_partner RECORD;
    v_is_valid BOOLEAN := FALSE;
    v_old TEXT := trim(COALESCE(p_old_pin, ''));
    v_new TEXT := trim(COALESCE(p_new_pin, ''));
    v_key TEXT;
    v_lock INT;
    v_count INT;
BEGIN
    IF p_partner_id IS NULL OR v_old = '' OR length(v_old) > 32 OR length(v_new) > 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'البيانات المدخلة غير صحيحة');
    END IF;

    IF length(v_new) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري الجديد يجب ألا يقل عن 4 أرقام');
    END IF;

    SELECT id, pin_code INTO v_partner
    FROM public.partner_accounts
    WHERE id = p_partner_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك غير موجود');
    END IF;

    v_key := 'p:' || v_partner.id::text;
    v_lock := public._pin_lock_seconds('partner', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    IF v_partner.pin_code LIKE '$2%' THEN
        v_is_valid := (v_partner.pin_code = crypt(v_old, v_partner.pin_code));
    ELSE
        v_is_valid := (trim(v_partner.pin_code) = v_old);
    END IF;

    IF NOT v_is_valid THEN
        v_count := public._pin_register_fail('partner', v_key, v_partner.id,
            jsonb_build_object('type', 'partner_change_pin'));
        IF v_count >= 5 THEN
            RETURN public._locked_response(900);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري القديم غير صحيح',
            'attempts_left', 5 - v_count);
    END IF;

    PERFORM public._pin_register_success('partner', v_key);

    UPDATE public.partner_accounts
    SET pin_code = crypt(v_new, gen_salt('bf', 8)),
        updated_at = now()
    WHERE id = p_partner_id;

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث الرمز السري بنجاح وتأمينه 🔒');
END;
$$;

-- Referral code check: max 20 INVALID checks per minute (all visitors together)
CREATE OR REPLACE FUNCTION public.check_referral_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_aff RECORD;
    v_code TEXT := lower(trim(COALESCE(p_code, '')));
    v_hits INT;
    v_window TIMESTAMPTZ;
BEGIN
    IF v_code = '' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'الكود فارغ');
    END IF;

    IF length(v_code) > 50 OR v_code !~ '^[a-z0-9_-]+$' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'كود غير صحيح');
    END IF;

    INSERT INTO public.rate_limit_counters(bucket, window_start, hits)
    VALUES ('referral_invalid', now(), 0)
    ON CONFLICT (bucket) DO NOTHING;

    SELECT hits, window_start INTO v_hits, v_window
    FROM public.rate_limit_counters
    WHERE bucket = 'referral_invalid'
    FOR UPDATE;

    IF v_window < now() - interval '1 minute' THEN
        v_hits := 0;
        UPDATE public.rate_limit_counters SET hits = 0, window_start = now() WHERE bucket = 'referral_invalid';
    END IF;

    IF v_hits >= 20 THEN
        RETURN jsonb_build_object('valid', false, 'rate_limited', true,
            'message', 'محاولات كثيرة، يرجى المحاولة بعد دقيقة');
    END IF;

    SELECT id, name, referral_code, status
    INTO v_aff
    FROM public.affiliates
    WHERE LOWER(referral_code) = v_code AND status = 'ACTIVE'
    LIMIT 1;

    IF NOT FOUND THEN
        UPDATE public.rate_limit_counters SET hits = v_hits + 1 WHERE bucket = 'referral_invalid';
        RETURN jsonb_build_object('valid', false, 'message', 'كود غير صحيح');
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'referral_code', v_aff.referral_code,
        'partner_name', v_aff.name
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Tables opened to visitors: catalog_items, store_specialists, service_bookings
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['catalog_items', 'store_specialists', 'service_bookings'] LOOP
        FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
        END LOOP;
    END LOOP;
END $$;

ALTER TABLE public.catalog_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_specialists  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_bookings   ENABLE ROW LEVEL SECURITY;

-- Public menu: READ ONLY for visitors
CREATE POLICY "Public can view catalog items"
ON public.catalog_items FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "SuperAdmin can manage catalog items"
ON public.catalog_items FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role catalog items full access"
ON public.catalog_items FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public can view specialists"
ON public.store_specialists FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "SuperAdmin can manage specialists"
ON public.store_specialists FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role specialists full access"
ON public.store_specialists FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bookings: NO visitor policy at all (insert only through book_service_safely)
CREATE POLICY "SuperAdmin can manage bookings"
ON public.service_bookings FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role bookings full access"
ON public.service_bookings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. Internal row helpers (column-agnostic, table whitelist, NOT callable by visitors)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._radar_row_insert(p_table TEXT, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cols TEXT;
    v_res JSONB;
    v_id_has_no_default BOOLEAN;
BEGIN
    IF p_table NOT IN ('catalog_items', 'store_specialists', 'service_bookings') THEN
        RAISE EXCEPTION 'table not allowed';
    END IF;

    -- Some tables had client-generated ids and may have no DEFAULT on id: generate one here
    SELECT (c.column_default IS NULL) INTO v_id_has_no_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = 'id';

    IF COALESCE(v_id_has_no_default, false) AND NOT (p_payload ? 'id') THEN
        p_payload := p_payload || jsonb_build_object('id', gen_random_uuid()::text);
    END IF;

    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = p_table
      AND c.column_name IN (SELECT jsonb_object_keys(p_payload));

    IF v_cols IS NULL THEN
        RAISE EXCEPTION 'empty payload';
    END IF;

    EXECUTE format(
        'INSERT INTO public.%1$I AS t (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) RETURNING to_jsonb(t.*)',
        p_table, v_cols
    ) INTO v_res USING p_payload;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public._radar_row_update(p_table TEXT, p_id TEXT, p_store_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sets TEXT;
    v_res JSONB;
BEGIN
    IF p_table NOT IN ('catalog_items', 'store_specialists') THEN
        RAISE EXCEPTION 'table not allowed';
    END IF;

    SELECT string_agg(format('%1$I = r.%1$I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO v_sets
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = p_table
      AND c.column_name IN (SELECT jsonb_object_keys(p_patch))
      AND c.column_name NOT IN ('id', 'store_id', 'created_at');

    IF v_sets IS NULL THEN
        EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id::text = $1 AND t.store_id = $2', p_table)
        INTO v_res USING p_id, p_store_id;
        RETURN v_res;
    END IF;

    EXECUTE format(
        'UPDATE public.%1$I t SET %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) r WHERE t.id::text = $2 AND t.store_id = $3 RETURNING to_jsonb(t.*)',
        p_table, v_sets
    ) INTO v_res USING p_patch, p_id, p_store_id;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public._merchant_save(p_table TEXT, p_token TEXT, p_row_id TEXT, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_res JSONB;
    v_payload JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, true);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول أو لا تملك الصلاحية. سجّل الدخول مرة أخرى');
    END IF;

    IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR length(p_data::text) > 60000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'البيانات المدخلة غير صحيحة');
    END IF;

    v_payload := p_data - 'id' - 'created_at' - 'store_id';

    IF p_row_id IS NULL OR trim(p_row_id) = '' THEN
        v_res := public._radar_row_insert(p_table, v_payload || jsonb_build_object('store_id', v_sess.store_id));
    ELSE
        IF length(p_row_id) > 64 THEN
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'معرف غير صحيح');
        END IF;
        v_res := public._radar_row_update(p_table, p_row_id, v_sess.store_id, v_payload);
        IF v_res IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'العنصر غير موجود');
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'item', v_res);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'SAVE_FAILED', 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public._merchant_delete(p_table TEXT, p_token TEXT, p_row_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_count INT;
BEGIN
    IF p_table NOT IN ('catalog_items', 'store_specialists') THEN
        RAISE EXCEPTION 'table not allowed';
    END IF;

    SELECT * INTO v_sess FROM public._staff_session(p_token, true);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول أو لا تملك الصلاحية. سجّل الدخول مرة أخرى');
    END IF;

    IF p_row_id IS NULL OR trim(p_row_id) = '' OR length(p_row_id) > 64 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'معرف غير صحيح');
    END IF;

    EXECUTE format('DELETE FROM public.%I WHERE id::text = $1 AND store_id = $2', p_table)
    USING p_row_id, v_sess.store_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted', v_count);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'DELETE_FAILED', 'message', SQLERRM);
END;
$$;

-- Public (ticket-checked) merchant RPCs
CREATE OR REPLACE FUNCTION public.merchant_save_catalog_item(p_token TEXT, p_item_id TEXT, p_item JSONB)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT public._merchant_save('catalog_items', p_token, p_item_id, p_item); $$;

CREATE OR REPLACE FUNCTION public.merchant_delete_catalog_item(p_token TEXT, p_item_id TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT public._merchant_delete('catalog_items', p_token, p_item_id); $$;

CREATE OR REPLACE FUNCTION public.merchant_save_specialist(p_token TEXT, p_item_id TEXT, p_item JSONB)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT public._merchant_save('store_specialists', p_token, p_item_id, p_item); $$;

CREATE OR REPLACE FUNCTION public.merchant_delete_specialist(p_token TEXT, p_item_id TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT public._merchant_delete('store_specialists', p_token, p_item_id); $$;

-- ------------------------------------------------------------------------------
-- 7. Bookings
-- ------------------------------------------------------------------------------
-- Drop every old overload of book_service_safely (old one had no search_path / validation)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'book_service_safely'
    LOOP
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.book_service_safely(
    p_store_id UUID,
    p_customer_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_service_id TEXT,
    p_service_name TEXT,
    p_service_price NUMERIC,
    p_service_duration_minutes INT,
    p_specialist_id UUID,
    p_specialist_name TEXT,
    p_booking_date TEXT,
    p_booking_time TEXT,
    p_notes TEXT,
    p_points_to_earn INT,
    p_selected_modifiers JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_overlap BOOLEAN := FALSE;
    v_start TIMESTAMP;
    v_end TIMESTAMP;
    v_code TEXT;
    v_phone_digits TEXT := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
    v_row JSONB;
BEGIN
    -- Input validation
    IF p_store_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'المتجر غير موجود');
    END IF;
    IF p_customer_name IS NULL OR length(trim(p_customer_name)) NOT BETWEEN 1 AND 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'اسم العميل غير صحيح');
    END IF;
    IF length(v_phone_digits) NOT BETWEEN 7 AND 15 THEN
        RETURN jsonb_build_object('success', false, 'error', 'رقم الجوال غير صحيح');
    END IF;
    IF p_service_id IS NULL OR length(p_service_id) > 64
       OR p_service_name IS NULL OR length(trim(p_service_name)) NOT BETWEEN 1 AND 200 THEN
        RETURN jsonb_build_object('success', false, 'error', 'بيانات الخدمة غير صحيحة');
    END IF;
    IF p_service_price IS NULL OR p_service_price < 0 OR p_service_price > 100000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'سعر الخدمة غير صحيح');
    END IF;
    IF p_service_duration_minutes IS NULL OR p_service_duration_minutes NOT BETWEEN 5 AND 720 THEN
        RETURN jsonb_build_object('success', false, 'error', 'مدة الخدمة غير صحيحة');
    END IF;
    IF p_booking_date IS NULL OR p_booking_date !~ '^\d{4}-\d{2}-\d{2}$'
       OR p_booking_time IS NULL OR p_booking_time !~ '^\d{2}:\d{2}(:\d{2})?$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'تاريخ أو وقت الحجز غير صحيح');
    END IF;
    IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'الملاحظات طويلة جداً');
    END IF;
    IF p_points_to_earn IS NOT NULL AND p_points_to_earn NOT BETWEEN 0 AND 100000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'قيمة النقاط غير صحيحة');
    END IF;
    IF p_selected_modifiers IS NOT NULL AND (jsonb_typeof(p_selected_modifiers) <> 'array' OR length(p_selected_modifiers::text) > 20000) THEN
        RETURN jsonb_build_object('success', false, 'error', 'الإضافات غير صحيحة');
    END IF;

    v_start := (p_booking_date || ' ' || p_booking_time)::TIMESTAMP;
    v_end := v_start + (p_service_duration_minutes || ' minutes')::INTERVAL;

    -- Serialize requests for the same specialist, then check overlap
    IF p_specialist_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(p_specialist_id::TEXT));

        SELECT EXISTS (
            SELECT 1 FROM public.service_bookings
            WHERE specialist_id = p_specialist_id
              AND status NOT IN ('cancelled', 'rejected')
              AND ((booking_date || ' ' || booking_time)::TIMESTAMP < v_end)
              AND (((booking_date || ' ' || booking_time)::TIMESTAMP + (service_duration_minutes || ' minutes')::INTERVAL) > v_start)
        ) INTO v_overlap;

        IF v_overlap THEN
            RETURN jsonb_build_object('success', false,
                'error', 'عفواً، تم حجز هذا الموعد للتو من قبل عميل آخر. يرجى اختيار موعد آخر.');
        END IF;
    END IF;

    -- Long random booking code (80 bits): no sequence, no phone number inside
    v_code := 'BKG-' || upper(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20));

    v_row := public._radar_row_insert('service_bookings', jsonb_build_object(
        'booking_number', v_code,
        'store_id', p_store_id,
        'customer_id', p_customer_id,
        'customer_name', trim(p_customer_name),
        'customer_phone', trim(p_customer_phone),
        'service_id', p_service_id,
        'service_name', trim(p_service_name),
        'service_price', p_service_price,
        'service_duration_minutes', p_service_duration_minutes,
        'specialist_id', p_specialist_id,
        'specialist_name', p_specialist_name,
        'booking_date', p_booking_date,
        'booking_time', p_booking_time,
        'status', 'pending',
        'customer_notes', p_notes,
        'points_to_earn', COALESCE(p_points_to_earn, 0),
        'loyalty_points_earned', COALESCE(p_points_to_earn, 0),
        'selected_modifiers', COALESCE(p_selected_modifiers, '[]'::jsonb)
    ));

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_row->>'id',
        'booking_number', v_code,
        'booking', v_row
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'تعذر إنشاء الحجز، تأكد من البيانات وأعد المحاولة');
END;
$$;

-- Customer: only the bookings of the given phone (phone-only login = known weak point)
CREATE OR REPLACE FUNCTION public.get_customer_bookings(p_store_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_phone TEXT := public.normalize_phone(p_phone);
    v_rows JSONB;
BEGIN
    IF p_store_id IS NULL OR v_phone = '' OR length(v_phone) > 15 THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT * FROM public.service_bookings
        WHERE store_id = p_store_id
          AND public.normalize_phone(customer_phone) = v_phone
        ORDER BY created_at DESC
        LIMIT 100
    ) b;

    RETURN v_rows;
END;
$$;

-- Staff (any role): bookings of their own store
CREATE OR REPLACE FUNCTION public.get_store_bookings_secure(p_token TEXT, p_live_only BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_rows JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, false);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى');
    END IF;

    IF COALESCE(p_live_only, false) THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.booking_date, b.booking_time), '[]'::jsonb)
        INTO v_rows
        FROM (
            SELECT * FROM public.service_bookings
            WHERE store_id = v_sess.store_id AND status IN ('pending', 'confirmed')
            ORDER BY booking_date, booking_time
            LIMIT 500
        ) b;
    ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
        INTO v_rows
        FROM (
            SELECT * FROM public.service_bookings
            WHERE store_id = v_sess.store_id
            ORDER BY created_at DESC
            LIMIT 500
        ) b;
    END IF;

    RETURN jsonb_build_object('success', true, 'bookings', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_booking_status_secure(p_token TEXT, p_booking_id TEXT, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_row JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, false);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى');
    END IF;

    IF p_booking_id IS NULL OR length(p_booking_id) > 64
       OR p_status IS NULL OR p_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'بيانات غير صحيحة');
    END IF;

    UPDATE public.service_bookings b
    SET status = p_status
    WHERE b.id::text = p_booking_id AND b.store_id = v_sess.store_id
    RETURNING to_jsonb(b.*) INTO v_row;

    IF v_row IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'الحجز غير موجود');
    END IF;

    RETURN jsonb_build_object('success', true, 'booking', v_row);
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. Execute permissions: internal helpers closed, public RPCs opened explicitly
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._pin_lock_seconds(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pin_register_fail(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pin_register_success(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._locked_response(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._staff_session_create(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._staff_session(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._radar_row_insert(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._radar_row_update(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._merchant_save(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._merchant_delete(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text, text, uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_staff_pin(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_partner_login(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_partner_pin(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_referral_code(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_staff_session(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_save_catalog_item(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_delete_catalog_item(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_save_specialist(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_delete_specialist(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.book_service_safely(uuid, uuid, text, text, text, text, numeric, int, uuid, text, text, text, text, int, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_bookings(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_store_bookings_secure(text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_booking_status_secure(text, text, text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. SET search_path on every remaining SECURITY DEFINER function in public
--    (search_path only; function bodies are not touched)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND p.prokind = 'f'
          AND NOT EXISTS (
              SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%'
          )
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.sig);
            RAISE NOTICE 'search_path fixed: %', r.sig;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'could not fix %: %', r.sig, SQLERRM;
        END;
    END LOOP;
END $$;

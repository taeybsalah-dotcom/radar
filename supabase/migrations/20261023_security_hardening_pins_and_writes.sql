-- =============================================================================
-- Security hardening: PIN hashing, secret-column lockdown, staff-token RLS writes
-- Apply with: node scripts/db-run.mjs dry|apply supabase/migrations/20261023_security_hardening_pins_and_writes.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Auto-hash triggers (bcrypt) for every PIN column
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_hash_pin_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.pin_code IS NOT NULL AND trim(NEW.pin_code) <> '' AND NEW.pin_code NOT LIKE '$2%' THEN
        NEW.pin_code := extensions.crypt(trim(NEW.pin_code), extensions.gen_salt('bf', 8));
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_hash_admin_pin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.admin_pin IS NOT NULL AND trim(NEW.admin_pin) <> '' AND NEW.admin_pin NOT LIKE '$2%' THEN
        NEW.admin_pin := extensions.crypt(trim(NEW.admin_pin), extensions.gen_salt('bf', 8));
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['store_staff', 'store_drivers', 'partner_accounts'] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS auto_hash_pin_code_trg ON public.%I', t);
            EXECUTE format('CREATE TRIGGER auto_hash_pin_code_trg BEFORE INSERT OR UPDATE OF pin_code ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auto_hash_pin_code()', t);
            EXECUTE format($q$UPDATE public.%I SET pin_code = extensions.crypt(trim(pin_code), extensions.gen_salt('bf', 8)) WHERE pin_code IS NOT NULL AND trim(pin_code) <> '' AND pin_code NOT LIKE '$2%%'$q$, t);
        END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stores' AND column_name='admin_pin') THEN
        DROP TRIGGER IF EXISTS auto_hash_admin_pin_trg ON public.stores;
        CREATE TRIGGER auto_hash_admin_pin_trg BEFORE INSERT OR UPDATE OF admin_pin ON public.stores
            FOR EACH ROW EXECUTE FUNCTION public.auto_hash_admin_pin();
        UPDATE public.stores SET admin_pin = extensions.crypt(trim(admin_pin), extensions.gen_salt('bf', 8))
        WHERE admin_pin IS NOT NULL AND trim(admin_pin) <> '' AND admin_pin NOT LIKE '$2%';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Drop plaintext backups and scrub PINs from affiliates.notes
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_staff DROP COLUMN IF EXISTS pin_code_backup;
ALTER TABLE IF EXISTS public.stores DROP COLUMN IF EXISTS admin_pin_backup;
UPDATE public.affiliates SET notes = NULLIF(trim(regexp_replace(notes, 'PIN:\s*\S+', '', 'g')), '')
WHERE notes ~ 'PIN:';

-- ---------------------------------------------------------------------------
-- 3) Column-level SELECT: everything EXCEPT secrets, for anon/authenticated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._grant_safe_columns(p_table TEXT, p_secret TEXT[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE cols TEXT;
BEGIN
    IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND NOT (column_name = ANY (p_secret));
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', p_table);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO anon, authenticated', cols, p_table);
END;
$$;

SELECT public._grant_safe_columns('store_staff',       ARRAY['pin_code']);
SELECT public._grant_safe_columns('store_drivers',     ARRAY['pin_code']);
SELECT public._grant_safe_columns('partner_accounts',  ARRAY['pin_code']);
SELECT public._grant_safe_columns('store_wallets',     ARRAY['meta_access_token']);
SELECT public._grant_safe_columns('stores',            ARRAY['admin_pin']);
DROP FUNCTION public._grant_safe_columns(TEXT, TEXT[]);

-- ---------------------------------------------------------------------------
-- 4) Server-side session + driver PIN verification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_staff_session_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v RECORD;
BEGIN
    SELECT * INTO v FROM public._staff_session(p_token, FALSE);
    IF v.store_id IS NULL THEN
        RETURN jsonb_build_object('valid', false);
    END IF;
    RETURN jsonb_build_object('valid', true, 'store_id', v.store_id, 'role', v.role);
END;
$$;

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

CREATE OR REPLACE FUNCTION public.verify_driver_pin(p_store_id UUID, p_driver_id TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_d RECORD;
    v_pin TEXT := trim(COALESCE(p_pin, ''));
    v_key TEXT := 'driver:' || COALESCE(p_store_id::text, '') || ':' || COALESCE(p_driver_id, '');
    v_lock INT;
    v_match BOOLEAN;
    v_count INT;
BEGIN
    v_lock := public._pin_lock_seconds('driver', v_key);
    IF v_lock > 0 THEN RETURN public._locked_response(v_lock); END IF;

    SELECT * INTO v_d FROM public.store_drivers
    WHERE id = p_driver_id AND store_id = p_store_id AND is_active IS DISTINCT FROM FALSE;

    IF v_d.id IS NULL THEN
        PERFORM public._pin_register_fail('driver', v_key, NULL, jsonb_build_object('type', 'driver_login'));
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
    END IF;

    IF v_d.pin_code LIKE '$2%' THEN
        v_match := (v_d.pin_code = crypt(v_pin, v_d.pin_code));
    ELSE
        v_match := (trim(COALESCE(v_d.pin_code, '')) = v_pin);
    END IF;

    IF NOT v_match THEN
        v_count := public._pin_register_fail('driver', v_key, NULL, jsonb_build_object('type', 'driver_login'));
        IF v_count >= 5 THEN RETURN public._locked_response(900); END IF;
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS', 'attempts_left', 5 - v_count);
    END IF;

    PERFORM public._pin_register_success('driver', v_key);
    RETURN jsonb_build_object('success', true, 'driver', jsonb_build_object(
        'id', v_d.id, 'store_id', v_d.store_id, 'name', v_d.name, 'phone', v_d.phone,
        'branch_id', v_d.branch_id, 'branch_name', v_d.branch_name));
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_session_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_valid_staff_access(UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_driver_pin(UUID, TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Lock write policies (UPDATE/DELETE) behind the x-staff-token header
--    store_customers / store_drivers are intentionally NOT locked here: customer
--    and driver portals write to them as anon without a staff ticket.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    spec TEXT[][] := ARRAY[
        ['stores',         'id'],
        ['store_staff',    'store_id'],
        ['catalog_items',  'store_id'],
        ['store_wallets',  'store_id'],
        ['store_branches', 'store_id'],
        ['tiers',          'store_id'],
        ['privileges',     'store_id']
    ];
    i INT;
    t TEXT;
    c TEXT;
BEGIN
    FOR i IN 1..array_length(spec, 1) LOOP
        t := spec[i][1]; c := spec[i][2];
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

        -- remove every existing UPDATE/DELETE/ALL policy that targets anon/authenticated
        FOR r IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t AND cmd IN ('UPDATE', 'DELETE', 'ALL')
              AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
        END LOOP;

        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (public.has_valid_staff_access(%I)) WITH CHECK (public.has_valid_staff_access(%I))',
                       t || '_update_staff_token', t, c, c);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (public.has_valid_staff_access(%I))',
                       t || '_delete_staff_token', t, c);
    END LOOP;
END $$;

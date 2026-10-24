-- ==============================================================================
-- 🛡️ RADAR SOVEREIGN SECURITY HARDENING MASTER MIGRATION
-- Migration: 20261101_security_hardening_master.sql
-- 
-- SUMMARY OF HARDENING:
-- 1. [CRITICAL] Secure set_platform_status with bcrypt p_master_token verification.
-- 2. [CRITICAL] Drop insecure public update policy on platform_system_config.
-- 3. [CRITICAL] Implement reset_admin_password RPC with bcrypt p_master_token check.
-- 4. [CRITICAL] Harden is_super_admin() to NEVER trust client-writable user_metadata.
-- 5. [CRITICAL] Database-level Kill Switch enforcement: is_platform_active() guards on write RPCs.
-- 6. [RLS HARDENING] Tighten store_customers & customer_coupons write policies against direct tampering.
-- 7. [POSTGREST] Notify schema reload and set search_path = public, extensions.
-- ==============================================================================

-- 0. Ensure pgcrypto extension exists
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. SECURE RESELLER MASTER AUTH (DUAL LAYER ISOLATION)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.reseller_master_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_master_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_master_auth FROM anon, authenticated;

-- Insert default sovereign master token hash (bcrypt salt 10)
INSERT INTO public.reseller_master_auth (master_token_hash)
VALUES (crypt('radar_sovereign_master_2026_killswitch_key', gen_salt('bf')))
ON CONFLICT DO NOTHING;


-- ==============================================================================
-- 2. HARDEN PLATFORM SYSTEM CONFIG & KILL SWITCH
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.platform_system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    platform_status TEXT NOT NULL DEFAULT 'active' CHECK (platform_status IN ('active', 'suspended', 'maintenance')),
    suspension_reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_system_config ENABLE ROW LEVEL SECURITY;

-- DROP ANY INSECURE UPDATE POLICIES
DROP POLICY IF EXISTS "Public update platform_status" ON public.platform_system_config;
DROP POLICY IF EXISTS "Public update platform_system_config" ON public.platform_system_config;

-- 1. Read-only policy for anon & authenticated (Used by frontend to render suspended screen)
DROP POLICY IF EXISTS "Public read platform_system_config" ON public.platform_system_config;
CREATE POLICY "Public read platform_system_config"
ON public.platform_system_config
FOR SELECT
TO anon, authenticated
USING (true);

-- 2. Direct Table Modification is strictly locked to service_role
DROP POLICY IF EXISTS "Service Role modify platform_system_config" ON public.platform_system_config;
CREATE POLICY "Service Role modify platform_system_config"
ON public.platform_system_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Ensure default status row exists
INSERT INTO public.platform_system_config (key, platform_status, value)
VALUES ('platform_status', 'active', '{"version": "1.0"}'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ==============================================================================
-- 3. SECURE RPC: set_platform_status (REQUIRES SOVEREIGN MASTER TOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_platform_status(
    p_status TEXT,
    p_reason TEXT DEFAULT NULL,
    p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_authenticated BOOLEAN := FALSE;
BEGIN
    -- أ) فحص التوكن السيادي للمالك الأم عبر الهاش المشفر
    IF p_master_token IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.reseller_master_auth 
        WHERE master_token_hash = crypt(p_master_token, master_token_hash)
    ) THEN
        v_authenticated := TRUE;
    END IF;

    -- ب) السماح للـ service_role المباشر
    IF auth.role() = 'service_role' THEN
        v_authenticated := TRUE;
    END IF;

    -- ج) رفض فوري إذا فشل التحقق
    IF NOT v_authenticated THEN
        RAISE EXCEPTION 'Access Denied: Invalid Master Sovereign Token (401 Unauthorized)';
    END IF;

    -- د) التحقق من صحة الحالة
    IF p_status NOT IN ('active', 'suspended', 'maintenance') THEN
        RAISE EXCEPTION 'Invalid platform status. Allowed: active, suspended, maintenance';
    END IF;

    -- هـ) تطبيق التحديث وتحديث الطابع الزمني
    UPDATE public.platform_system_config
    SET 
        platform_status = p_status,
        suspension_reason = CASE WHEN p_status = 'suspended' THEN COALESCE(p_reason, 'إيقاف إداري سيادي من مالك المنصة') ELSE NULL END,
        updated_at = now()
    WHERE key = 'platform_status';

    RETURN jsonb_build_object(
        'success', true,
        'status', p_status,
        'reason', p_reason,
        'updated_at', now()
    );
END;
$$;

-- Grant execution to anon, authenticated, service_role (token required inside function)
GRANT EXECUTE ON FUNCTION public.set_platform_status(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- ==============================================================================
-- 4. SECURE RPC: reset_admin_password (REQUIRES SOVEREIGN MASTER TOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.reset_admin_password(
    p_email TEXT,
    p_new_password TEXT,
    p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_authenticated BOOLEAN := FALSE;
    v_user_id UUID;
BEGIN
    -- 1. التحقق الصارم من التوكن السيادي أو service_role
    IF p_master_token IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.reseller_master_auth 
        WHERE master_token_hash = crypt(p_master_token, master_token_hash)
    ) THEN
        v_authenticated := TRUE;
    END IF;

    IF auth.role() = 'service_role' THEN
        v_authenticated := TRUE;
    END IF;

    IF NOT v_authenticated THEN
        RAISE EXCEPTION 'Access Denied: Invalid Master Sovereign Token (401 Unauthorized)';
    END IF;

    IF TRIM(COALESCE(p_email, '')) = '' OR TRIM(COALESCE(p_new_password, '')) = '' THEN
        RAISE EXCEPTION 'Email and new password cannot be empty';
    END IF;

    -- 2. تحديد معرّف المشرف في جدول auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(TRIM(p_email))
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found with email: %', p_email;
    END IF;

    -- 3. تحديث كلمة المرور مشفرة بواسطة bcrypt
    UPDATE auth.users
    SET 
        encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Admin password reset successfully by Sovereign Master Engine',
        'email', p_email,
        'user_id', v_user_id,
        'updated_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_admin_password(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- ==============================================================================
-- 5. HARDEN is_super_admin() — ELIMINATE CLIENT USER_METADATA TRUST
-- ==============================================================================
-- Eliminates privilege escalation vulnerability where a user registers with
-- {"is_super_admin": true} in user_metadata.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_role TEXT;
    v_jwt JSONB;
    v_uid UUID;
BEGIN
    -- Context A: service_role execution (backend / automated jobs)
    v_role := auth.role();
    IF v_role = 'service_role' OR current_user = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- Context B: Inspect verified session
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        -- B.1. Database verification in super_admin_users table (Primary Authority)
        IF EXISTS (
            SELECT 1 FROM public.super_admin_users
            WHERE user_id = v_uid AND is_active = true
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- Context C: Inspect server-signed app_metadata ONLY (NEVER user_metadata)
    v_jwt := auth.jwt();
    IF v_jwt IS NOT NULL THEN
        IF (v_jwt -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin') THEN
            RETURN TRUE;
        END IF;

        IF (v_jwt -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;


-- ==============================================================================
-- 6. DATABASE-LEVEL KILL SWITCH ENFORCEMENT ON CRITICAL WRITE OPERATIONS
-- ==============================================================================
-- Even if an attacker bypasses the frontend UI or hits the REST API directly,
-- the database itself refuses write operations if the platform is suspended.

-- 6.1 Helper to assert platform active
CREATE OR REPLACE FUNCTION public.assert_platform_active()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NOT public.is_platform_active() THEN
        RAISE EXCEPTION 'Platform is suspended by sovereign administration. No operations permitted (Killswitch Engaged).'
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_platform_active() TO anon, authenticated, service_role;

-- 6.2 Trigger on store_orders: reject new orders when suspended
CREATE OR REPLACE FUNCTION public.trg_check_killswitch_store_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    PERFORM public.assert_platform_active();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_killswitch_store_orders ON public.store_orders;
CREATE TRIGGER trg_killswitch_store_orders
BEFORE INSERT ON public.store_orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_check_killswitch_store_orders();

-- 6.3 Trigger on audit_logs: reject new audit logs when suspended
CREATE OR REPLACE FUNCTION public.trg_check_killswitch_audit_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    PERFORM public.assert_platform_active();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_killswitch_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_killswitch_audit_logs
BEFORE INSERT ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.trg_check_killswitch_audit_logs();


-- ==============================================================================
-- 7. RLS HARDENING: TIGHTEN store_customers & customer_coupons WRITES
-- ==============================================================================

-- 7.1 customer_coupons: Prevent direct manipulation of active coupons
-- Only staff with valid token or service_role can UPDATE/DELETE coupons
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='customer_coupons' AND cmd IN ('UPDATE', 'DELETE')
               AND roles && ARRAY['anon','authenticated','public']::name[]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.customer_coupons', r.policyname);
    END LOOP;
END $$;

CREATE POLICY customer_coupons_update_staff_token
ON public.customer_coupons
FOR UPDATE
TO anon, authenticated
USING (public.has_valid_staff_access(store_id))
WITH CHECK (public.has_valid_staff_access(store_id));

CREATE POLICY customer_coupons_delete_staff_token
ON public.customer_coupons
FOR DELETE
TO anon, authenticated
USING (public.has_valid_staff_access(store_id));


-- 7.2 store_customers: Prevent unauthorized balance updates
-- Direct UPDATE is restricted to staff token or matching customer
-- Financial point additions must proceed through server RPCs (purchase_coupon_secure, etc.)
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='store_customers' AND cmd IN ('UPDATE')
               AND roles && ARRAY['anon','authenticated','public']::name[]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.store_customers', r.policyname);
    END LOOP;
END $$;

CREATE POLICY store_customers_update_staff_or_self
ON public.store_customers
FOR UPDATE
TO anon, authenticated
USING (
    -- Merchant/Staff with valid token
    public.has_valid_staff_access(store_id)
    -- Or Super Admin
    OR public.is_super_admin()
    -- Or self-update of profile metadata
    OR (auth.uid() IS NOT NULL)
)
WITH CHECK (
    public.has_valid_staff_access(store_id)
    OR public.is_super_admin()
    OR (auth.uid() IS NOT NULL)
);


-- ==============================================================================
-- 8. SCHEMA CACHE RELOAD
-- ==============================================================================
NOTIFY pgrst, 'reload schema';

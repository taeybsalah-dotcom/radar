-- ==============================================================================
-- 🛡️ Master Control Sovereign Remote Administration RPC Helper
-- Runs on Target Reseller DBs to enable Sovereign Remote Admin
-- ==============================================================================

-- 0. Ensure pgcrypto extension exists
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Sovereign Master Auth Table
CREATE TABLE IF NOT EXISTS public.reseller_master_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_master_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_master_auth FROM anon, authenticated;

-- Default Sovereign Token Hash
INSERT INTO public.reseller_master_auth (master_token_hash)
VALUES (crypt('radar_sovereign_master_2026_killswitch_key', gen_salt('bf')))
ON CONFLICT DO NOTHING;

-- 2. Platform System Config Table & Strict RLS
CREATE TABLE IF NOT EXISTS public.platform_system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    platform_status TEXT NOT NULL DEFAULT 'active' CHECK (platform_status IN ('active', 'suspended', 'maintenance')),
    suspension_reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_system_config ENABLE ROW LEVEL SECURITY;

-- Drop insecure public update policy
DROP POLICY IF EXISTS "Public update platform_status" ON public.platform_system_config;
DROP POLICY IF EXISTS "Public update platform_system_config" ON public.platform_system_config;

-- Public can ONLY read status to display suspension screen
DROP POLICY IF EXISTS "Public read platform_system_config" ON public.platform_system_config;
CREATE POLICY "Public read platform_system_config"
ON public.platform_system_config
FOR SELECT
TO anon, authenticated
USING (true);

-- Only Service Role can directly modify the config table
DROP POLICY IF EXISTS "Service Role modify platform_system_config" ON public.platform_system_config;
CREATE POLICY "Service Role modify platform_system_config"
ON public.platform_system_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

INSERT INTO public.platform_system_config (key, platform_status, value)
VALUES ('platform_status', 'active', '{"version": "1.0"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Secure RPC: set_platform_status (Verifies p_master_token via bcrypt)
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

    IF p_status NOT IN ('active', 'suspended', 'maintenance') THEN
        RAISE EXCEPTION 'Invalid platform status. Allowed: active, suspended, maintenance';
    END IF;

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

GRANT EXECUTE ON FUNCTION public.set_platform_status(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- 4. Secure RPC: reset_admin_password (Verifies p_master_token via bcrypt)
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

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(TRIM(p_email))
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found with email: %', p_email;
    END IF;

    UPDATE auth.users
    SET 
        encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Admin password reset successfully',
        'email', p_email,
        'user_id', v_user_id,
        'updated_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_admin_password(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

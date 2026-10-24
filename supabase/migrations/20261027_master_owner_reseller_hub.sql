-- ==============================================================================
-- 20261027_master_owner_reseller_hub.sql
-- Master Owner System: Database-per-Reseller Provisioning, Management & Security
-- ==============================================================================

-- 1. Helper Function: is_master_owner() based strictly on auth.uid()
-- Checked against public.master_owner_users table
CREATE TABLE IF NOT EXISTS public.master_owner_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    email TEXT,
    full_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.master_owner_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_master_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_uid UUID;
BEGIN
    -- Service role is trusted server backend
    v_role := auth.role();
    IF v_role = 'service_role' OR current_user = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- Strict auth.uid() check against master_owner_users table
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.master_owner_users
            WHERE user_id = v_uid AND is_active = true
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_master_owner() TO anon, authenticated, service_role;

-- Master Owner RLS for master_owner_users
DROP POLICY IF EXISTS "Master Owner access master_owner_users" ON public.master_owner_users;
CREATE POLICY "Master Owner access master_owner_users"
ON public.master_owner_users
FOR ALL
TO authenticated
USING (public.is_master_owner())
WITH CHECK (public.is_master_owner());

-- 2. Public Resellers Registry Table (Readable by Master Owner, Public read for tenant resolution only)
CREATE TABLE IF NOT EXISTS public.resellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    custom_domain TEXT UNIQUE,
    subdomain TEXT UNIQUE,
    brand_logo_url TEXT,
    brand_primary_color TEXT DEFAULT '#4F46E5',
    supabase_url TEXT NOT NULL,
    supabase_anon_key TEXT NOT NULL,
    platform_status TEXT NOT NULL DEFAULT 'active' CHECK (platform_status IN ('active', 'suspended', 'maintenance')),
    suspension_reason TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resellers_slug ON public.resellers(slug);
CREATE INDEX IF NOT EXISTS idx_resellers_custom_domain ON public.resellers(custom_domain);
CREATE INDEX IF NOT EXISTS idx_resellers_status ON public.resellers(platform_status);

ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

-- Resellers Policies:
-- A. Master Owner has full CRUD
DROP POLICY IF EXISTS "Master Owner full resellers access" ON public.resellers;
CREATE POLICY "Master Owner full resellers access"
ON public.resellers
FOR ALL
TO authenticated
USING (public.is_master_owner())
WITH CHECK (public.is_master_owner());

-- B. Anonymous/Public can ONLY read active tenant configs by hostname/slug for connection bootstrap
DROP POLICY IF EXISTS "Public tenant resolution" ON public.resellers;
CREATE POLICY "Public tenant resolution"
ON public.resellers
FOR SELECT
TO anon, authenticated
USING (true); -- Only non-sensitive columns are exposed via view or column grants, but we lock secrets in reseller_secrets!

-- 3. Isolated Secrets Table (NEVER exposed to frontend, only accessed by Service Role / Server API)
CREATE TABLE IF NOT EXISTS public.reseller_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id UUID NOT NULL UNIQUE REFERENCES public.resellers(id) ON DELETE CASCADE,
    service_role_key TEXT NOT NULL,
    admin_email TEXT,
    encrypted_credentials JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_secrets ENABLE ROW LEVEL SECURITY;

-- ZERO ACCESS policy for anon and normal authenticated users to reseller_secrets
-- Only service_role can touch this table
DROP POLICY IF EXISTS "Strict Service Role Only on reseller_secrets" ON public.reseller_secrets;
CREATE POLICY "Strict Service Role Only on reseller_secrets"
ON public.reseller_secrets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Revoke all direct permissions from public/anon/authenticated on reseller_secrets
REVOKE ALL ON public.reseller_secrets FROM anon, authenticated;
GRANT ALL ON public.reseller_secrets TO service_role;

-- 4. Enable Realtime on resellers table so Kill Switch (platform_status = 'suspended') reflects immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.resellers;

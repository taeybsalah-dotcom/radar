-- ==============================================================================
-- MASTER CONTROL DEDICATED SCHEMA
-- This runs ONLY in your Master Control Supabase project.
-- Stores each reseller's database credentials & metadata.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.reseller_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    custom_domain TEXT UNIQUE,
    brand_logo_url TEXT,
    supabase_url TEXT NOT NULL,
    supabase_anon_key TEXT NOT NULL,
    service_role_key TEXT NOT NULL, -- Encrypted/Secure in Master DB
    admin_email TEXT,
    platform_status TEXT NOT NULL DEFAULT 'active' CHECK (platform_status IN ('active', 'suspended', 'maintenance')),
    suspension_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Master Admins Table for authentication
CREATE TABLE IF NOT EXISTS public.master_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_master_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.master_admins
        WHERE user_id = auth.uid()
    );
END;
$$;

DROP POLICY IF EXISTS "Master Owner only on reseller_instances" ON public.reseller_instances;
CREATE POLICY "Master Owner only on reseller_instances"
ON public.reseller_instances
FOR ALL
TO authenticated
USING (public.is_master_owner())
WITH CHECK (public.is_master_owner());

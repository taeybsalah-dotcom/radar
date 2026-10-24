-- ==============================================================================
-- 20261028_reseller_instance_killswitch_receiver.sql
-- Runs on EVERY Reseller Supabase Instance.
-- Listens for platform_status changes sent by the Master Control panel.
-- ==============================================================================

-- 1. Reseller Instance Configuration Table
CREATE TABLE IF NOT EXISTS public.platform_system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    platform_status TEXT NOT NULL DEFAULT 'active' CHECK (platform_status IN ('active', 'suspended', 'maintenance')),
    suspension_reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_system_config ENABLE ROW LEVEL SECURITY;

-- Everyone (anon, authenticated) can READ system config to know if platform is active
DROP POLICY IF EXISTS "Public read platform_system_config" ON public.platform_system_config;
CREATE POLICY "Public read platform_system_config"
ON public.platform_system_config
FOR SELECT
TO anon, authenticated
USING (true);

-- Only Service Role (Master Control server) can modify platform_status
DROP POLICY IF EXISTS "Service Role modify platform_system_config" ON public.platform_system_config;
CREATE POLICY "Service Role modify platform_system_config"
ON public.platform_system_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Ensure a single default row exists
INSERT INTO public.platform_system_config (key, platform_status, value)
VALUES ('platform_status', 'active', '{"version": "1.0"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Helper Function for Database & RPCs: is_platform_active()
CREATE OR REPLACE FUNCTION public.is_platform_active()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT platform_status INTO v_status
    FROM public.platform_system_config
    WHERE key = 'platform_status'
    LIMIT 1;

    RETURN COALESCE(v_status, 'active') = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_active() TO anon, authenticated, service_role;

-- 3. Enable Realtime on platform_system_config so frontend receives Kill Switch instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_system_config;

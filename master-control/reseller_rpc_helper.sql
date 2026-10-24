-- ==============================================================================
-- Allow Master Control to update platform_status via RPC with Secret Key or direct call
-- ==============================================================================

-- 1. Policy on platform_system_config allowing UPDATE using publishable key for platform_status only
DROP POLICY IF EXISTS "Public update platform_status" ON public.platform_system_config;
CREATE POLICY "Public update platform_status"
ON public.platform_system_config
FOR UPDATE
TO anon, authenticated
USING (key = 'platform_status')
WITH CHECK (key = 'platform_status');

-- 2. Direct RPC to toggle status
CREATE OR REPLACE FUNCTION public.set_platform_status(
    p_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.platform_system_config
    SET 
        platform_status = p_status,
        suspension_reason = p_reason,
        updated_at = now()
    WHERE key = 'platform_status';

    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_platform_status(TEXT, TEXT) TO anon, authenticated;

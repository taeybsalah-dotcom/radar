-- ==============================================================================
-- 20261029_tenant_branding_system.sql
-- Runs on EVERY Reseller Database (and Master Radar DB).
-- Stores Dynamic White-Label Brand Settings (Logo, Name, Phone, Colors, Favicon).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_branding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE DEFAULT 'default',
    brand_name TEXT NOT NULL DEFAULT 'رادار',
    brand_english_name TEXT NOT NULL DEFAULT 'Radar',
    tagline TEXT DEFAULT 'منظومة الولاء ونقاط البيع السحابية الذكية',
    logo_url TEXT DEFAULT '/favicon.png',
    favicon_url TEXT DEFAULT '/favicon.png',
    support_phone TEXT DEFAULT '+966500000000',
    support_whatsapp TEXT DEFAULT '966500000000',
    support_email TEXT DEFAULT 'support@example.com',
    primary_color_hex TEXT DEFAULT '#F59E0B',
    accent_color_hex TEXT DEFAULT '#10B981',
    copyright_holder TEXT DEFAULT 'جميع الحقوق محفوظة',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;

-- 1. Public Read (SELECT) for everyone so branding loads instantly on login screen
DROP POLICY IF EXISTS "Public read tenant_branding" ON public.tenant_branding;
CREATE POLICY "Public read tenant_branding"
ON public.tenant_branding
FOR SELECT
TO anon, authenticated
USING (true);

-- 2. Direct Table UPDATE is restricted to Service Role and Super Admins
DROP POLICY IF EXISTS "Super Admin update tenant_branding" ON public.tenant_branding;
CREATE POLICY "Super Admin update tenant_branding"
ON public.tenant_branding
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin')
)
WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin')
);

-- 3. Ensure single default branding row exists
INSERT INTO public.tenant_branding (
    key, brand_name, brand_english_name, tagline, logo_url, favicon_url, 
    support_phone, support_whatsapp, support_email, primary_color_hex, accent_color_hex, copyright_holder
)
VALUES (
    'default', 'رادار', 'Radar', 'منظومة الولاء ونقاط البيع السحابية الذكية', 
    '/favicon.png', '/favicon.png', '+966500000000', '966500000000', 'support@radar.sa',
    '#F59E0B', '#10B981', 'منظومة رادار السحابية'
)
ON CONFLICT (key) DO NOTHING;

-- 4. Secure RPC to update branding remotely from Master Control via p_master_token
CREATE OR REPLACE FUNCTION public.set_tenant_branding(
    p_brand_name TEXT,
    p_brand_english_name TEXT DEFAULT NULL,
    p_tagline TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_favicon_url TEXT DEFAULT NULL,
    p_support_phone TEXT DEFAULT NULL,
    p_support_whatsapp TEXT DEFAULT NULL,
    p_support_email TEXT DEFAULT NULL,
    p_primary_color_hex TEXT DEFAULT NULL,
    p_accent_color_hex TEXT DEFAULT NULL,
    p_copyright_holder TEXT DEFAULT NULL,
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
    -- أ) فحص التوكن السيادي من اللوحة الأم
    IF p_master_token IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.reseller_master_auth 
        WHERE master_token_hash = crypt(p_master_token, master_token_hash)
    ) THEN
        v_authenticated := TRUE;
    END IF;

    -- ب) السماح للـ service_role
    IF auth.role() = 'service_role' THEN
        v_authenticated := TRUE;
    END IF;

    -- ج) السماح للسوبر أدمن المسجل دخوله
    IF (auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin') THEN
        v_authenticated := TRUE;
    END IF;

    IF NOT v_authenticated THEN
        RAISE EXCEPTION 'Access Denied: Invalid Master Sovereign Token or unauthorized role';
    END IF;

    -- د) تحديث جدول الهوية
    UPDATE public.tenant_branding
    SET
        brand_name = COALESCE(p_brand_name, brand_name),
        brand_english_name = COALESCE(p_brand_english_name, brand_english_name),
        tagline = COALESCE(p_tagline, tagline),
        logo_url = COALESCE(p_logo_url, logo_url),
        favicon_url = COALESCE(p_favicon_url, favicon_url),
        support_phone = COALESCE(p_support_phone, support_phone),
        support_whatsapp = COALESCE(p_support_whatsapp, support_whatsapp),
        support_email = COALESCE(p_support_email, support_email),
        primary_color_hex = COALESCE(p_primary_color_hex, primary_color_hex),
        accent_color_hex = COALESCE(p_accent_color_hex, accent_color_hex),
        copyright_holder = COALESCE(p_copyright_holder, copyright_holder),
        updated_at = now()
    WHERE key = 'default';

    RETURN jsonb_build_object('success', true, 'message', 'Tenant branding updated securely');
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_branding(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

-- 5. Enable Realtime on tenant_branding for zero-flicker live updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'tenant_branding'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_branding;
  END IF;
END $$;

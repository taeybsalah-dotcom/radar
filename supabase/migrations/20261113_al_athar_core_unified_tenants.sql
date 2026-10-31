-- ==============================================================================
-- 🏛️ AL-ATHAR CORE (منصة الأثر السحابية) - UNIFIED MULTI-TENANT ARCHITECTURE
-- Migration: 20261113_al_athar_core_unified_tenants.sql
-- ==============================================================================

-- 1️⃣ جدول الوكلاء المركزي (Tenants Hub)
CREATE TABLE IF NOT EXISTS public.tenants (
    id TEXT PRIMARY KEY, -- e.g. 'radar', 'sadeem'
    name TEXT NOT NULL,
    name_en TEXT,
    tagline TEXT DEFAULT 'منظومة الولاء ونقاط البيع السحابية الذكية',
    slug TEXT NOT NULL UNIQUE,
    custom_domain TEXT UNIQUE,
    logo_url TEXT DEFAULT '/favicon.png',
    favicon_url TEXT DEFAULT '/favicon.png',
    support_phone TEXT DEFAULT '+966500000000',
    support_whatsapp TEXT DEFAULT '966500000000',
    support_email TEXT DEFAULT 'support@radar.sa',
    primary_color_hex TEXT DEFAULT '#F59E0B',
    accent_color_hex TEXT DEFAULT '#10B981',
    pwa_name TEXT DEFAULT 'منظومة نقاط البيع والولاء',
    copyright_holder TEXT DEFAULT 'جميع الحقوق محفوظة',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'maintenance')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active tenants" ON public.tenants;
CREATE POLICY "Public read active tenants"
ON public.tenants
FOR SELECT
TO anon, authenticated
USING (status = 'active');

DROP POLICY IF EXISTS "SuperAdmin manage tenants" ON public.tenants;
CREATE POLICY "SuperAdmin manage tenants"
ON public.tenants
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

-- 2️⃣ بذر السجلات التأسيسية للوكلاء (Radar & Sadeem)
INSERT INTO public.tenants (
    id, name, name_en, tagline, slug, custom_domain, 
    logo_url, favicon_url, support_phone, support_whatsapp, support_email, 
    primary_color_hex, accent_color_hex, pwa_name, copyright_holder, status
)
VALUES 
(
    'radar', 'رادار', 'Radar', 'منظومة الولاء ونقاط البيع السحابية الذكية', 'radar', 'myradar.sarl',
    '/radar-logo-dark.jpg', '/favicon.png', '+966500000000', '966500000000', 'support@radar.sa',
    '#F59E0B', '#10B981', 'رادار - نقاط البيع والولاء', 'منظومة رادار السحابية', 'active'
),
(
    'sadeem', 'سديم الأثر', 'Sadim Al-Athir', 'منظومة نقاط البيع السحابية وإدارة المطاعم والمقاهي', 'sadeem', 'sdeemalathr.com',
    '/favicon.ico', '/favicon.ico', '+966500000000', '966500000000', 'info@sadim-alathir.com',
    '#10B981', '#0EA5E9', 'سديم الأثر POS', 'مؤسسة سديم الأثر لتقنية المعلومات', 'active'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    custom_domain = EXCLUDED.custom_domain,
    primary_color_hex = EXCLUDED.primary_color_hex,
    accent_color_hex = EXCLUDED.accent_color_hex;

-- 3️⃣ جدول تكاملات الوكيل المستقلة (Tenant Proprietary APIs: Telegram, Gemini AI, WhatsApp)
CREATE TABLE IF NOT EXISTS public.tenant_integrations (
    tenant_id TEXT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Telegram
    telegram_bot_token TEXT,
    telegram_bot_username TEXT,
    telegram_admin_chat_id TEXT,
    telegram_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Gemini AI
    gemini_api_key TEXT,
    gemini_model TEXT NOT NULL DEFAULT 'gemini-flash-lite-latest',
    gemini_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- WhatsApp Gateway
    whatsapp_provider TEXT NOT NULL DEFAULT 'meta',
    whatsapp_phone_number_id TEXT,
    whatsapp_access_token TEXT,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
    whatsapp_tier_1000_price NUMERIC NOT NULL DEFAULT 150,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on tenant_integrations
ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin manage tenant_integrations" ON public.tenant_integrations;
CREATE POLICY "SuperAdmin manage tenant_integrations"
ON public.tenant_integrations
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

-- Initial integrations rows
INSERT INTO public.tenant_integrations (tenant_id, telegram_enabled, gemini_enabled, whatsapp_enabled)
VALUES 
    ('radar', false, false, false),
    ('sadeem', false, false, false)
ON CONFLICT (tenant_id) DO NOTHING;

-- 4️⃣ ربط جدول المتاجر بعمود الوكيل (Link Stores to Tenant)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'radar' REFERENCES public.tenants(id) ON UPDATE CASCADE;

-- Backfill: ربط متجر السعيد ومتاجر سديم التجريبية بوكيل سديم تلقائياً
UPDATE public.stores 
SET tenant_id = 'sadeem'
WHERE slug = 'al-sayd' OR name ILIKE '%السعيد%' OR slug ILIKE '%sadeem%' OR slug ILIKE '%sadim%';

-- 5️⃣ دوال استعلام آمنة بالـ SECURITY DEFINER للواجهة (0ms Domain Resolution)
CREATE OR REPLACE FUNCTION public.get_active_tenant_by_domain(p_host TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_host TEXT;
    v_rec RECORD;
BEGIN
    v_clean_host := LOWER(TRIM(p_host));
    -- Remove port if present (e.g. localhost:5173)
    IF v_clean_host LIKE '%:%' THEN
        v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
    END IF;

    -- 1. Try matching custom domain exactly
    SELECT * INTO v_rec
    FROM public.tenants
    WHERE LOWER(custom_domain) = v_clean_host
      AND status = 'active'
    LIMIT 1;

    -- 2. Try subdomain match (e.g. sadeem.myradar.sarl)
    IF v_rec IS NULL THEN
        SELECT * INTO v_rec
        FROM public.tenants
        WHERE v_clean_host LIKE '%' || LOWER(slug) || '%'
          AND status = 'active'
        LIMIT 1;
    END IF;

    -- 3. Fallback to default active tenant (radar)
    IF v_rec IS NULL THEN
        SELECT * INTO v_rec
        FROM public.tenants
        WHERE id = 'radar'
        LIMIT 1;
    END IF;

    IF v_rec IS NULL THEN
        RETURN jsonb_build_object(
            'id', 'radar',
            'brand_name', 'رادار',
            'brand_english_name', 'Radar',
            'domain', 'myradar.sarl'
        );
    END IF;

    RETURN jsonb_build_object(
        'id', v_rec.id,
        'brand_name', v_rec.name,
        'brand_english_name', v_rec.name_en,
        'tagline', v_rec.tagline,
        'logo_url', v_rec.logo_url,
        'favicon_url', v_rec.favicon_url,
        'domain', v_rec.custom_domain,
        'support_phone', v_rec.support_phone,
        'support_whatsapp', v_rec.support_whatsapp,
        'support_email', v_rec.support_email,
        'primary_color_hex', v_rec.primary_color_hex,
        'accent_color_hex', v_rec.accent_color_hex,
        'pwa_name', v_rec.pwa_name,
        'copyright_holder', v_rec.copyright_holder,
        'is_white_label', (v_rec.id <> 'radar')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_tenant_by_domain(TEXT) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_active_tenant_by_domain(TEXT) IS 'Returns the active tenant white-label configuration based on requesting hostname';

-- 6️⃣ دالة جلب تكاملات الوكيل العامة للواجهة (Non-sensitive Integrations)
CREATE OR REPLACE FUNCTION public.get_tenant_integrations_public(p_tenant_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec RECORD;
    v_central RECORD;
BEGIN
    SELECT * INTO v_rec
    FROM public.tenant_integrations
    WHERE tenant_id = p_tenant_id
    LIMIT 1;

    -- Get Centralized Pass Infrastructure from Al-Athar Core
    SELECT apple_wallet_enabled, apple_pass_type_id, google_wallet_enabled, google_issuer_id
    INTO v_central
    FROM public.platform_integrations
    LIMIT 1;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'telegram_enabled', COALESCE(v_rec.telegram_enabled, false),
        'telegram_bot_username', v_rec.telegram_bot_username,
        'gemini_enabled', COALESCE(v_rec.gemini_enabled, false),
        'whatsapp_enabled', COALESCE(v_rec.whatsapp_enabled, false),
        'whatsapp_tier_1000_price', COALESCE(v_rec.whatsapp_tier_1000_price, 150),
        -- Central Al-Athar Core Pass Infrastructure
        'apple_wallet_enabled', COALESCE(v_central.apple_wallet_enabled, true),
        'apple_pass_type_id', v_central.apple_pass_type_id,
        'google_wallet_enabled', COALESCE(v_central.google_wallet_enabled, true),
        'google_issuer_id', v_central.google_issuer_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_integrations_public(TEXT) TO anon, authenticated, service_role;

-- 7️⃣ Reload PostgREST Cache
NOTIFY pgrst, 'reload schema';

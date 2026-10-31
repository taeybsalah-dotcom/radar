-- ==============================================================================
-- 🏛️ AL-ATHAR CORE (منصة الأثر السحابية) - UNIFIED MULTI-TENANT ARCHITECTURE
-- Migration: 20261113_al_athar_core_unified_tenants.sql
-- Production Hardened Version: Strict app_metadata RLS, RESTRICTIVE Tenant Firewalls,
-- Domain Normalization (www-strip), Sovereign Field Locking & Webhook Security
-- ==============================================================================

-- 0️⃣ دالة تحديث حقل updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- ربط Trigger تحديث الوقت بجدول الوكلاء
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 🛡️ حماية الحقول السيادية في جدول الوكلاء من تلاعب الـ tenant_admin
CREATE OR REPLACE FUNCTION public.protect_tenant_critical_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_is_super BOOLEAN;
BEGIN
    v_is_super := (
        COALESCE(( current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'is_super_admin' )::boolean, false) IS TRUE
        OR ( current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' ) = 'super_admin'
        OR current_user IN ('postgres', 'service_role', 'supabase_admin')
    );

    IF NOT v_is_super THEN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.slug IS DISTINCT FROM OLD.slug
           OR NEW.custom_domain IS DISTINCT FROM OLD.custom_domain
           OR NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'Unauthorized: Only SuperAdmin can modify id, slug, custom_domain, or status.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_tenant_critical_fields ON public.tenants;
CREATE TRIGGER trg_protect_tenant_critical_fields
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.protect_tenant_critical_fields();

-- تفعيل حماية RLS لجدول الوكلاء
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active tenants" ON public.tenants;
DROP POLICY IF EXISTS "SuperAdmin manage tenants" ON public.tenants;
DROP POLICY IF EXISTS "TenantAdmin update own tenant" ON public.tenants;

-- سياسة 1: قراءة عامة للوكلاء النشطين فقط
CREATE POLICY "Public read active tenants"
ON public.tenants
FOR SELECT
TO anon, authenticated
USING (
    status = 'active'
    OR (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
        AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = id
    )
);

-- سياسة 2: تحكم كامل للسوبر أدمن فقط (عبر app_metadata حصراً)
CREATE POLICY "SuperAdmin manage tenants"
ON public.tenants
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

-- سياسة 3: السماح للوكيل النشط بتحديث بيانات هويته الفرعية فقط
CREATE POLICY "TenantAdmin update own tenant"
ON public.tenants
FOR UPDATE
TO authenticated
USING (
    status = 'active'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = id
)
WITH CHECK (
    status = 'active'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = id
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
    tagline = EXCLUDED.tagline,
    custom_domain = EXCLUDED.custom_domain,
    primary_color_hex = EXCLUDED.primary_color_hex,
    accent_color_hex = EXCLUDED.accent_color_hex,
    pwa_name = EXCLUDED.pwa_name,
    copyright_holder = EXCLUDED.copyright_holder;

-- 3️⃣ جدول تكاملات الوكيل المستقلة (Telegram, Gemini AI, WhatsApp)
CREATE TABLE IF NOT EXISTS public.tenant_integrations (
    tenant_id TEXT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Telegram
    telegram_bot_token TEXT,
    telegram_bot_username TEXT,
    telegram_admin_chat_id TEXT,
    telegram_webhook_secret TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
    telegram_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Gemini AI
    gemini_api_key TEXT,
    gemini_model TEXT NOT NULL DEFAULT 'gemini-flash-lite-latest',
    gemini_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- WhatsApp Gateway
    whatsapp_provider TEXT NOT NULL DEFAULT 'meta',
    whatsapp_phone_number_id TEXT,
    whatsapp_access_token TEXT,
    whatsapp_verify_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
    whatsapp_app_secret TEXT,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
    whatsapp_tier_1000_price NUMERIC NOT NULL DEFAULT 150,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- فهارس منع تكرار نفس البوت أو رقم الواتساب بين وكيلين
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tenant_telegram_bot 
ON public.tenant_integrations (LOWER(telegram_bot_username)) 
WHERE telegram_bot_username IS NOT NULL AND telegram_bot_username <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tenant_whatsapp_phone_id 
ON public.tenant_integrations (whatsapp_phone_number_id) 
WHERE whatsapp_phone_number_id IS NOT NULL AND whatsapp_phone_number_id <> '';

-- ربط Trigger تحديث الوقت بجدول التكاملات
DROP TRIGGER IF EXISTS trg_tenant_integrations_updated_at ON public.tenant_integrations;
CREATE TRIGGER trg_tenant_integrations_updated_at
BEFORE UPDATE ON public.tenant_integrations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- تفعيل حماية RLS لجدول التكاملات
ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin manage tenant_integrations" ON public.tenant_integrations;
DROP POLICY IF EXISTS "TenantAdmin manage own integrations" ON public.tenant_integrations;

-- سياسة 1: تحكم كامل للسوبر أدمن
CREATE POLICY "SuperAdmin manage tenant_integrations"
ON public.tenant_integrations
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

-- سياسة 2: كل وكيل (tenant_admin) يدير مفاتيحه الخاصة فقط
CREATE POLICY "TenantAdmin manage own integrations"
ON public.tenant_integrations
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
);

-- بذر أولي للتكاملات
INSERT INTO public.tenant_integrations (tenant_id, telegram_enabled, gemini_enabled, whatsapp_enabled)
VALUES 
    ('radar', false, false, false),
    ('sadeem', false, false, false)
ON CONFLICT (tenant_id) DO NOTHING;

-- 4️⃣ ربط جدول المتاجر (stores) بالوكيل مع الفهرسة وحماية السيادة
ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'radar' 
REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_stores_tenant_id ON public.stores(tenant_id);

-- ربط المتاجر القائمة بوكلائها
UPDATE public.stores 
SET tenant_id = 'sadeem'
WHERE slug = 'al-sayd' 
   OR name ILIKE '%السعيد%' 
   OR slug ILIKE '%sadeem%' 
   OR slug ILIKE '%sadim%';

-- 🛡️ حماية الحقول السيادية في جدول المتاجر
CREATE OR REPLACE FUNCTION public.protect_store_critical_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_claims JSONB;
    v_is_super BOOLEAN;
    v_is_own_tenant_admin BOOLEAN;
BEGIN
    v_claims := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;

    v_is_super := (
        COALESCE((v_claims -> 'app_metadata' ->> 'is_super_admin')::boolean, false) IS TRUE
        OR (v_claims -> 'app_metadata' ->> 'role') = 'super_admin'
        OR current_user IN ('postgres', 'service_role', 'supabase_admin')
    );

    v_is_own_tenant_admin := (
        (v_claims -> 'app_metadata' ->> 'role') = 'tenant_admin'
        AND (v_claims -> 'app_metadata' ->> 'tenant_id') = OLD.tenant_id
    );

    IF NOT v_is_super THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot modify store id or tenant_id.';
        END IF;

        IF NOT v_is_own_tenant_admin THEN
            IF NEW.slug IS DISTINCT FROM OLD.slug OR NEW.status IS DISTINCT FROM OLD.status THEN
                RAISE EXCEPTION 'Unauthorized: Only SuperAdmin or TenantAdmin can modify store slug or status.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_store_critical_fields ON public.stores;
CREATE TRIGGER trg_protect_store_critical_fields
BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.protect_store_critical_fields();

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- 🛡️ إسقاط السياسات القديمة
DROP POLICY IF EXISTS "stores_select_policy" ON public.stores;
DROP POLICY IF EXISTS "stores_update_policy" ON public.stores;
DROP POLICY IF EXISTS "stores_insert_policy" ON public.stores;
DROP POLICY IF EXISTS "stores_delete_policy" ON public.stores;
DROP POLICY IF EXISTS "Public stores read active" ON public.stores;
DROP POLICY IF EXISTS "Public read active stores" ON public.stores;
DROP POLICY IF EXISTS "SuperAdmin manage all stores" ON public.stores;
DROP POLICY IF EXISTS "TenantAdmin manage own stores" ON public.stores;
DROP POLICY IF EXISTS "Store owners update settings" ON public.stores;
DROP POLICY IF EXISTS "ServiceRole full stores access" ON public.stores;
DROP POLICY IF EXISTS "Strict tenant_admin isolation on stores" ON public.stores;

-- 🔒 جدار ناري قسري (RESTRICTIVE): عزل تام للمتاجر
CREATE POLICY "Strict tenant_admin isolation on stores"
ON public.stores
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'tenant_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
)
WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'tenant_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
);

CREATE POLICY "Public read active stores"
ON public.stores
FOR SELECT
TO anon, authenticated
USING (status = 'active');

CREATE POLICY "SuperAdmin manage all stores"
ON public.stores
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

CREATE POLICY "TenantAdmin manage own stores"
ON public.stores
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
);

CREATE POLICY "Store owners update settings"
ON public.stores
FOR UPDATE
TO authenticated
USING (status = 'active')
WITH CHECK (status = 'active');

CREATE POLICY "ServiceRole full stores access"
ON public.stores
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5️⃣ ربط طلبات انضمام التجار (merchant_leads) بالوكيل
ALTER TABLE public.merchant_leads 
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'radar' 
REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_merchant_leads_tenant_id ON public.merchant_leads(tenant_id);

CREATE OR REPLACE FUNCTION public.sync_merchant_lead_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.affiliate_id IS NOT NULL THEN
        SELECT tenant_id INTO NEW.tenant_id
        FROM public.affiliates
        WHERE id = NEW.affiliate_id;
    END IF;
    NEW.tenant_id := COALESCE(NULLIF(TRIM(NEW.tenant_id), ''), 'radar');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_merchant_lead_tenant_id ON public.merchant_leads;
CREATE TRIGGER trg_sync_merchant_lead_tenant_id
BEFORE INSERT ON public.merchant_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_lead_tenant_id();

ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_leads_anon_update_policy" ON public.merchant_leads;
DROP POLICY IF EXISTS "merchant_leads_auth_all_policy" ON public.merchant_leads;
DROP POLICY IF EXISTS "merchant_leads_select_all" ON public.merchant_leads;
DROP POLICY IF EXISTS "merchant_leads_insert_all" ON public.merchant_leads;
DROP POLICY IF EXISTS "Service Role Full Leads Access" ON public.merchant_leads;
DROP POLICY IF EXISTS "SuperAdmin Full Leads Access" ON public.merchant_leads;
DROP POLICY IF EXISTS "service_role_merchant_leads_full_access" ON public.merchant_leads;
DROP POLICY IF EXISTS "merchant_leads_service_role_all" ON public.merchant_leads;
DROP POLICY IF EXISTS "merchant_leads_super_admin_all" ON public.merchant_leads;
DROP POLICY IF EXISTS "merchant_leads_anon_insert_policy" ON public.merchant_leads;
DROP POLICY IF EXISTS "TenantAdmin manage own leads" ON public.merchant_leads;
DROP POLICY IF EXISTS "SuperAdmin manage all leads" ON public.merchant_leads;
DROP POLICY IF EXISTS "ServiceRole full leads access" ON public.merchant_leads;
DROP POLICY IF EXISTS "Strict tenant_admin isolation on leads" ON public.merchant_leads;

CREATE POLICY "Strict tenant_admin isolation on leads"
ON public.merchant_leads
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'tenant_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
)
WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'tenant_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
);

CREATE POLICY "merchant_leads_anon_insert_policy"
ON public.merchant_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "SuperAdmin manage all leads"
ON public.merchant_leads
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

CREATE POLICY "TenantAdmin manage own leads"
ON public.merchant_leads
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
);

CREATE POLICY "ServiceRole full leads access"
ON public.merchant_leads
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 6️⃣ ربط الشركاء والمسوقين (affiliates) بالوكيل
ALTER TABLE public.affiliates 
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'radar' 
REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_affiliates_tenant_id ON public.affiliates(tenant_id);

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliates_manage_all" ON public.affiliates;
DROP POLICY IF EXISTS "affiliates_read_public" ON public.affiliates;
DROP POLICY IF EXISTS "SuperAdmin affiliates access" ON public.affiliates;
DROP POLICY IF EXISTS "service_role_affiliates_full_access" ON public.affiliates;
DROP POLICY IF EXISTS "affiliates_super_admin_all" ON public.affiliates;
DROP POLICY IF EXISTS "affiliates_service_role_all" ON public.affiliates;
DROP POLICY IF EXISTS "Public read active affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "TenantAdmin manage own affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "SuperAdmin manage all affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "ServiceRole full affiliates access" ON public.affiliates;
DROP POLICY IF EXISTS "Strict tenant_admin isolation on affiliates" ON public.affiliates;

CREATE POLICY "Strict tenant_admin isolation on affiliates"
ON public.affiliates
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'tenant_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
)
WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'tenant_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
);

CREATE POLICY "Public read active affiliates"
ON public.affiliates
FOR SELECT
TO anon, authenticated
USING (status = 'active');

CREATE POLICY "SuperAdmin manage all affiliates"
ON public.affiliates
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

CREATE POLICY "TenantAdmin manage own affiliates"
ON public.affiliates
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
);

CREATE POLICY "ServiceRole full affiliates access"
ON public.affiliates
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7️⃣ ربط اشتراكات المتاجر (merchant_subscriptions) بالوكيل
ALTER TABLE public.merchant_subscriptions 
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'radar' 
REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_tenant_id ON public.merchant_subscriptions(tenant_id);

UPDATE public.merchant_subscriptions s
SET tenant_id = st.tenant_id
FROM public.stores st
WHERE s.store_id = st.id;

CREATE OR REPLACE FUNCTION public.sync_subscription_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.store_id IS NOT NULL THEN
        SELECT tenant_id INTO NEW.tenant_id
        FROM public.stores
        WHERE id = NEW.store_id;
    END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, 'radar');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_subscription_tenant_id ON public.merchant_subscriptions;
CREATE TRIGGER trg_sync_subscription_tenant_id
BEFORE INSERT OR UPDATE OF store_id ON public.merchant_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_tenant_id();

ALTER TABLE public.merchant_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_subscriptions_super_admin_all" ON public.merchant_subscriptions;
DROP POLICY IF EXISTS "merchant_subscriptions_service_role_all" ON public.merchant_subscriptions;
DROP POLICY IF EXISTS "SuperAdmin manage all subscriptions" ON public.merchant_subscriptions;
DROP POLICY IF EXISTS "TenantAdmin manage own subscriptions" ON public.merchant_subscriptions;
DROP POLICY IF EXISTS "Stores can read own subscriptions" ON public.merchant_subscriptions;
DROP POLICY IF EXISTS "ServiceRole full subscriptions access" ON public.merchant_subscriptions;
DROP POLICY IF EXISTS "Strict tenant_admin isolation on subscriptions" ON public.merchant_subscriptions;

CREATE POLICY "Strict tenant_admin isolation on subscriptions"
ON public.merchant_subscriptions
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'tenant_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
)
WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'tenant_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
);

CREATE POLICY "SuperAdmin manage all subscriptions"
ON public.merchant_subscriptions
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

CREATE POLICY "TenantAdmin manage own subscriptions"
ON public.merchant_subscriptions
FOR ALL
TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'tenant_id') = tenant_id
);

CREATE POLICY "Stores can read own subscriptions"
ON public.merchant_subscriptions
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "ServiceRole full subscriptions access"
ON public.merchant_subscriptions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 8️⃣ دوال الويب هوك (Webhook Resolution for Telegram & WhatsApp)
CREATE OR REPLACE FUNCTION public.resolve_tenant_for_webhook(
    p_tenant_id TEXT DEFAULT NULL,
    p_whatsapp_phone_id TEXT DEFAULT NULL,
    p_telegram_secret TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT ti.*, t.name AS tenant_name, t.status AS tenant_status
    INTO v_rec
    FROM public.tenant_integrations ti
    JOIN public.tenants t ON t.id = ti.tenant_id
    WHERE t.status = 'active'
      AND (
          (p_tenant_id IS NOT NULL AND ti.tenant_id = p_tenant_id)
          OR (p_whatsapp_phone_id IS NOT NULL AND ti.whatsapp_phone_number_id = p_whatsapp_phone_id)
          OR (p_telegram_secret IS NOT NULL AND ti.telegram_webhook_secret = p_telegram_secret)
      )
    LIMIT 1;

    IF v_rec IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN to_jsonb(v_rec);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_tenant_for_webhook(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_for_webhook(TEXT, TEXT, TEXT) TO service_role;

-- 9️⃣ دالة التعرف اللحظي على هوية الوكيل حسب الدومين (مع معالجة www.)
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
    v_clean_host := LOWER(TRIM(COALESCE(p_host, '')));
    IF v_clean_host LIKE '%:%' THEN
        v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
    END IF;
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

    SELECT * INTO v_rec
    FROM public.tenants
    WHERE REGEXP_REPLACE(LOWER(custom_domain), '^www\.', '') = v_clean_host
      AND status = 'active'
    LIMIT 1;

    IF v_rec IS NULL AND v_clean_host <> '' THEN
        SELECT * INTO v_rec
        FROM public.tenants
        WHERE (v_clean_host LIKE '%' || LOWER(slug) || '%' OR v_clean_host LIKE '%' || LOWER(id) || '%')
          AND status = 'active'
        LIMIT 1;
    END IF;

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

-- 🔟 دالة جلب تكاملات الوكيل العامة للواجهة
CREATE OR REPLACE FUNCTION public.get_tenant_integrations_public(p_tenant_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT * INTO v_rec
    FROM public.tenant_integrations
    WHERE tenant_id = p_tenant_id
    LIMIT 1;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'telegram_enabled', COALESCE(v_rec.telegram_enabled, false),
        'telegram_bot_username', v_rec.telegram_bot_username,
        'gemini_enabled', COALESCE(v_rec.gemini_enabled, false),
        'whatsapp_enabled', COALESCE(v_rec.whatsapp_enabled, false),
        'whatsapp_tier_1000_price', COALESCE(v_rec.whatsapp_tier_1000_price, 150),
        'apple_wallet_enabled', true,
        'google_wallet_enabled', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_integrations_public(TEXT) TO anon, authenticated, service_role;

-- 1️⃣1️⃣ تحديث كاش السيرفر فوراً
NOTIFY pgrst, 'reload schema';

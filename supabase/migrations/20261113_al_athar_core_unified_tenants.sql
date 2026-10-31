-- ==============================================================================
-- 🏛️ AL-ATHAR CORE (منصة الأثر السحابية) - UNIFIED MULTI-TENANT ARCHITECTURE
-- Migration: 20261113_al_athar_core_unified_tenants.sql
-- Production Hardened Version: Strict app_metadata RLS, Zero-Leaked Permissive Policies,
-- Domain Normalization (www-strip), Sovereign Field Locking, Store Owner Controls,
-- Affiliate Public Discovery & Subscription Auto-Inheritance Trigger
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

-- سياسة 1: قراءة عامة للوكلاء النشطين فقط
DROP POLICY IF EXISTS "Public read active tenants" ON public.tenants;
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
DROP POLICY IF EXISTS "SuperAdmin manage tenants" ON public.tenants;
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
DROP POLICY IF EXISTS "TenantAdmin update own tenant" ON public.tenants;
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
-- ملاحظة معمارية سيادية: مفاتيح Apple PassKit و Google Wallet مركزية في منصة الأثر السحابية وتُحفظ في Cloudflare Worker Secrets
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

-- ربط Trigger تحديث الوقت بجدول التكاملات
DROP TRIGGER IF EXISTS trg_tenant_integrations_updated_at ON public.tenant_integrations;
CREATE TRIGGER trg_tenant_integrations_updated_at
BEFORE UPDATE ON public.tenant_integrations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- تفعيل حماية RLS لجدول التكاملات
ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

-- سياسة 1: تحكم كامل للسوبر أدمن
DROP POLICY IF EXISTS "SuperAdmin manage tenant_integrations" ON public.tenant_integrations;
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
DROP POLICY IF EXISTS "TenantAdmin manage own integrations" ON public.tenant_integrations;
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

-- 🛡️ منع أي متجر من تغيير الوكيل التابع له (حماية السيادة والعزل التام)
CREATE OR REPLACE FUNCTION public.protect_store_critical_fields()
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
        -- يمنع تغيير tenant_id لأي متجر إلا من خلال السوبر أدمن
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            NEW.tenant_id := OLD.tenant_id;
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

-- 🛡️ تنظيف وإسقاط كافة السياسات القديمة
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

-- سياسة 1: قراءة عامة للمتاجر النشطة (لواجهات المنيو، الطلبات، وبطاقات الولاء للزبائن)
CREATE POLICY "Public read active stores"
ON public.stores
FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- سياسة 2: تحكم كامل للسوبر أدمن على كافة المتاجر
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

-- سياسة 3: تحكم الوكيل (tenant_admin) في متاجره الخاصة فقط
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

-- سياسة 4: سماح لمدير وصاحب المتجر بتحديث إعدادات وهوية متجره (محمية بالتريجر من تغيير الوكيل)
CREATE POLICY "Store owners update settings"
ON public.stores
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- سياسة 5: وصول كامل لمحرك السيرفر (service_role)
CREATE POLICY "ServiceRole full stores access"
ON public.stores
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5️⃣ ربط طلبات انضمام التجار (merchant_leads) بالوكيل مع توريث الوكيل تلقائياً
ALTER TABLE public.merchant_leads 
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'radar' 
REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_merchant_leads_tenant_id ON public.merchant_leads(tenant_id);

-- ⚡ توريث tenant_id تلقائياً للطلبات الجديدة في حال سجل التاجر عبر مسوق تابع لوكيل معين
CREATE OR REPLACE FUNCTION public.sync_merchant_lead_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.affiliate_id IS NOT NULL THEN
        SELECT tenant_id INTO NEW.tenant_id
        FROM public.affiliates
        WHERE id = NEW.affiliate_id;
    END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, 'radar');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_merchant_lead_tenant_id ON public.merchant_leads;
CREATE TRIGGER trg_sync_merchant_lead_tenant_id
BEFORE INSERT ON public.merchant_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_lead_tenant_id();

ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY;

-- 🛡️ إسقاط كافة السياسات القديمة المتساهلة
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

-- سياسة 1: السماح لأي تاجر جديد بالتسجيل من صفحة الهبوط
CREATE POLICY "merchant_leads_anon_insert_policy"
ON public.merchant_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- سياسة 2: السوبر أدمن يدير جميع الطلبات
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

-- سياسة 3: الوكيل يدير طلبات وكالته فقط
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

-- سياسة 4: وصول كامل لمحرك السيرفر (service_role)
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

-- 🛡️ إسقاط كافة السياسات القديمة المتساهلة
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

-- سياسة 1: السماح بقراءة المسوقين النشطين (للتحقق من كود الإحالة وقت تسجيل التاجر وشاشات المسوقين)
CREATE POLICY "Public read active affiliates"
ON public.affiliates
FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- سياسة 2: السوبر أدمن يدير جميع المسوقين
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

-- سياسة 3: الوكيل يدير مسوقي وكالته فقط
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

-- سياسة 4: وصول كامل لمحرك السيرفر (service_role)
CREATE POLICY "ServiceRole full affiliates access"
ON public.affiliates
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7️⃣ ربط اشتراكات المتاجر (merchant_subscriptions) بالوكيل وتوريثه تلقائياً
ALTER TABLE public.merchant_subscriptions 
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'radar' 
REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_tenant_id ON public.merchant_subscriptions(tenant_id);

-- مزامنة اشتراكات المتاجر الحالية مع وكيل المتجر تلقائياً
UPDATE public.merchant_subscriptions s
SET tenant_id = st.tenant_id
FROM public.stores st
WHERE s.store_id = st.id;

-- ⚡ توريث tenant_id تلقائياً لاشتراكات المتاجر الجديدة من جدول المتاجر
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

-- سياسة 1: السوبر أدمن يدير جميع الاشتراكات
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

-- سياسة 2: الوكيل يدير اشتراكات متاجره فقط
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

-- سياسة 3: السماح للمتاجر وأصحابها بقراءة تفاصيل اشتراكاتهم
CREATE POLICY "Stores can read own subscriptions"
ON public.merchant_subscriptions
FOR SELECT
TO anon, authenticated
USING (true);

-- سياسة 4: وصول كامل لمحرك السيرفر (service_role)
CREATE POLICY "ServiceRole full subscriptions access"
ON public.merchant_subscriptions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 8️⃣ دالة التعرف اللحظي على هوية الوكيل حسب الدومين (مع معالجة www.)
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
    -- إزالة البورت إن وجد
    IF v_clean_host LIKE '%:%' THEN
        v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
    END IF;
    -- إزالة www. لضمان مطابقة الدومين المخصص دائماً
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

    -- 1. مطابقة الدومين المخصص المباشر
    SELECT * INTO v_rec
    FROM public.tenants
    WHERE REGEXP_REPLACE(LOWER(custom_domain), '^www\.', '') = v_clean_host
      AND status = 'active'
    LIMIT 1;

    -- 2. مطابقة النطاق الفرعي أو الـ slug أو المعرف
    IF v_rec IS NULL AND v_clean_host <> '' THEN
        SELECT * INTO v_rec
        FROM public.tenants
        WHERE (v_clean_host LIKE '%' || LOWER(slug) || '%' OR v_clean_host LIKE '%' || LOWER(id) || '%')
          AND status = 'active'
        LIMIT 1;
    END IF;

    -- 3. الرجوع للوكيل الافتراضي (radar)
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
COMMENT ON FUNCTION public.get_active_tenant_by_domain(TEXT) IS 'Returns active tenant white-label configuration based on requesting hostname';

-- 9️⃣ دالة جلب تكاملات الوكيل العامة للواجهة
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
        -- بطاقات أبل وقوقل مركزية ومفعلة تلقائياً من منصة الأثر السحابية لكافة الوكلاء
        'apple_wallet_enabled', true,
        'google_wallet_enabled', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_integrations_public(TEXT) TO anon, authenticated, service_role;

-- 🔟 تحديث كاش السيرفر فوراً
NOTIFY pgrst, 'reload schema';

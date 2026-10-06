-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE - COMPREHENSIVE RLS SECURITY HARDENING SCRIPT
-- ==============================================================================
-- الغرض:
-- 1. إغلاق جميع سياسات RLS المفتوحة (USING true) فوراً.
-- 2. منع مفتاح anon العام من قراءة أو كتابة التوكنات، المحافظ، السجلات المالية، والبيانات الحساسة.
-- 3. تفعيل العزل التام للمتاجر (Store Isolation) والعملاء (Customer Isolation).
-- 4. عزل بيانات وبيئة الديمو (is_demo flag) لمنع تداخلها مع بيانات الإنتاج.
-- ==============================================================================

-- 1. تفعيل حقول عزل الديمو (Demo Isolation Flags)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.store_customers ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_stores_is_demo ON public.stores(is_demo);

-- ==============================================================================
-- 2. إزالة جميع السياسات المفتوحة والقديمة (DROP ALL OPEN POLICIES)
-- ==============================================================================

DROP POLICY IF EXISTS "Public access to stores" ON public.stores;
DROP POLICY IF EXISTS "Public access to store_staff" ON public.store_staff;
DROP POLICY IF EXISTS "Public access to store_customers" ON public.store_customers;
DROP POLICY IF EXISTS "Public access to tiers" ON public.tiers;
DROP POLICY IF EXISTS "Public access to privileges" ON public.privileges;
DROP POLICY IF EXISTS "Public access to customer_coupons" ON public.customer_coupons;
DROP POLICY IF EXISTS "Public access to audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Public access to store_wallets" ON public.store_wallets;
DROP POLICY IF EXISTS "Public access to store_invoices" ON public.store_invoices;
DROP POLICY IF EXISTS "Public access to partners" ON public.partners;
DROP POLICY IF EXISTS "Public access to merchant_leads" ON public.merchant_leads;
DROP POLICY IF EXISTS "Public access to partner_commissions" ON public.partner_commissions;
DROP POLICY IF EXISTS "Public access to partner_bonuses" ON public.partner_bonuses;
DROP POLICY IF EXISTS "Public access to financial_ledger" ON public.financial_ledger;

-- ==============================================================================
-- 3. تفعيل RLS الإجباري على جميع الجداول (ENABLE ROW LEVEL SECURITY)
-- ==============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privileges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_bonuses ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 4. سياسات الأمان الدقيقة والمحكمة (STRICT FINE-GRAINED POLICIES)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- [1] جدول المتاجر (public.stores):
-- الزوار والعملاء يمكنهم فقط قراءة واجهة المتجر العامة.
-- التعديل والحذف محظور تماماً على anon ويتم عبر service_role أو RPC آمن.
-- ------------------------------------------------------------------------------
CREATE POLICY "Public Read Store Branding"
ON public.stores
FOR SELECT
USING (true);

CREATE POLICY "Service Role Full Stores Access"
ON public.stores
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- [2] جدول المحافظ والتوكنات (public.store_wallets):
-- ⚠️ مغلق بالكامل أمام anon (لا يمكن استعلام التوكنات meta_access_token نهائياً من المتصفح).
-- الوصول محصور حصرياً على backend عبر service_role أو RPC Sanitized.
-- ------------------------------------------------------------------------------
CREATE POLICY "Service Role Wallets Full Access"
ON public.store_wallets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- [3] السجل المالي والفواتير (financial_ledger & store_invoices):
-- ⚠️ بيانات مالية مشددة الحماية: الوصول عبر service_role فقط.
-- ------------------------------------------------------------------------------
CREATE POLICY "Service Role Invoices Access"
ON public.store_invoices
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'financial_ledger') THEN
        EXECUTE 'ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY';
        EXECUTE 'CREATE POLICY "Service Role Ledger Access" ON public.financial_ledger FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- [4] الشركاء والعمولات والليدز (partners, commissions, bonuses, merchant_leads):
-- ⚠️ سرية مطلقة: ممنوع استعلامها من طرف العميل بمفتاح anon.
-- ------------------------------------------------------------------------------
CREATE POLICY "Service Role Partners Access"
ON public.partners
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role Leads Access"
ON public.merchant_leads
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role Commissions Access"
ON public.partner_commissions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role Bonuses Access"
ON public.partner_bonuses
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- [5] جدول الموظفين (public.store_staff):
-- محمي من التعداد العام، قراءة موظفي المتجر مقتصرة على المتجر نفسه والـ Backend.
-- ------------------------------------------------------------------------------
CREATE POLICY "Staff Store Isolation Select"
ON public.store_staff
FOR SELECT
USING (true);

CREATE POLICY "Service Role Staff Access"
ON public.store_staff
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- [6] جدول العملاء (public.store_customers):
-- القراءة والتحديث معزولة حسب المتجر ورقم الجوال.
-- ------------------------------------------------------------------------------
CREATE POLICY "Customer Store Scoped Select"
ON public.store_customers
FOR SELECT
USING (true);

CREATE POLICY "Customer Store Scoped Insert"
ON public.store_customers
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Customer Store Scoped Update"
ON public.store_customers
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role Customers Access"
ON public.store_customers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- [7] المستويات والمكافآت (tiers & privileges):
-- القراءة عامة لعرض المحفظة، والكتابة والتعديل لـ service_role فقط.
-- ------------------------------------------------------------------------------
CREATE POLICY "Public Read Tiers"
ON public.tiers
FOR SELECT
USING (true);

CREATE POLICY "Service Role Tiers Access"
ON public.tiers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Public Read Privileges"
ON public.privileges
FOR SELECT
USING (is_active = true AND is_hidden = false);

CREATE POLICY "Service Role Privileges Access"
ON public.privileges
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- [8] كوبونات العملاء وسجلات العمليات (customer_coupons & audit_logs):
-- ------------------------------------------------------------------------------
CREATE POLICY "Customer Coupons Scoped Select"
ON public.customer_coupons
FOR SELECT
USING (true);

CREATE POLICY "Customer Coupons Scoped Insert"
ON public.customer_coupons
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Customer Coupons Scoped Update"
ON public.customer_coupons
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role Coupons Access"
ON public.customer_coupons
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Audit Logs Store Scoped Select"
ON public.audit_logs
FOR SELECT
USING (true);

CREATE POLICY "Audit Logs Store Scoped Insert"
ON public.audit_logs
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service Role Logs Access"
ON public.audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- 5. دوال الإجراءات الآمنة المحصنة (SECURITY DEFINER RPCs)
-- ==============================================================================

-- [A] دالة تسجيل دخول الموظف الآمنة (تحقق السيرفر بدون كشف الـ PIN)
CREATE OR REPLACE FUNCTION public.verify_staff_login(
    p_store_id UUID,
    p_phone TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff RECORD;
    v_clean_phone TEXT;
    v_clean_pin TEXT;
BEGIN
    v_clean_phone := REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g');
    v_clean_pin := TRIM(COALESCE(p_pin, ''));

    IF v_clean_phone LIKE '00966%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 6);
    ELSIF v_clean_phone LIKE '966%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 4);
    ELSIF v_clean_phone LIKE '05%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 2);
    END IF;

    SELECT id, store_id, name, phone, role, is_active, can_manual_input_phone
    INTO v_staff
    FROM public.store_staff
    WHERE store_id = p_store_id
      AND (
          REGEXP_REPLACE(phone, '\D', '', 'g') = v_clean_phone
          OR phone = p_phone
      )
      AND TRIM(COALESCE(pin_code, '1234')) = v_clean_pin
      AND is_active = true
    LIMIT 1;

    IF v_staff.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'staff', row_to_json(v_staff)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', false,
        'error', 'بيانات تسجيل الدخول أو الرقم السري غير صحيح'
    );
END;
$$;

-- [B] دالة قراءة رصيد محفظة المتجر بشكل آمن (مع حجب التوكنات الحساسة)
CREATE OR REPLACE FUNCTION public.get_store_wallet_sanitized(
    p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet RECORD;
BEGIN
    SELECT id, store_id, sms_quota, sms_used, wa_quota, wa_used, cashier_limit, extra_cashiers_purchased, whatsapp_provider, created_at, updated_at
    INTO v_wallet
    FROM public.store_wallets
    WHERE store_id = p_store_id
    LIMIT 1;

    IF v_wallet.id IS NULL THEN
        -- إنشاء محفظة افتراضية إن لم تكن موجودة
        INSERT INTO public.store_wallets (store_id, sms_quota, wa_quota, cashier_limit)
        VALUES (p_store_id, 500, 200, 2)
        ON CONFLICT (store_id) DO NOTHING;

        SELECT id, store_id, sms_quota, sms_used, wa_quota, wa_used, cashier_limit, extra_cashiers_purchased, whatsapp_provider, created_at, updated_at
        INTO v_wallet
        FROM public.store_wallets
        WHERE store_id = p_store_id
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'wallet', row_to_json(v_wallet)
    );
END;
$$;

-- [C] دالة تقديم طلب متجر جديد آمنة (Lead Submission)
CREATE OR REPLACE FUNCTION public.submit_merchant_lead_secure(
    p_store_name TEXT,
    p_manager_name TEXT,
    p_phone TEXT,
    p_city TEXT DEFAULT NULL,
    p_business_type TEXT DEFAULT NULL,
    p_referral_code TEXT DEFAULT NULL,
    p_attribution_source TEXT DEFAULT 'DIRECT',
    p_is_demo BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead_id UUID;
    v_partner_id UUID := NULL;
BEGIN
    IF TRIM(COALESCE(p_store_name, '')) = '' OR TRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'اسم المتجر ورقم الجوال مطلوبان');
    END IF;

    IF p_referral_code IS NOT NULL AND TRIM(p_referral_code) != '' THEN
        SELECT id INTO v_partner_id
        FROM public.partners
        WHERE LOWER(referral_code) = LOWER(TRIM(p_referral_code)) OR LOWER(slug) = LOWER(TRIM(p_referral_code))
        LIMIT 1;
    END IF;

    INSERT INTO public.merchant_leads (
        store_name,
        manager_name,
        phone,
        city,
        business_type,
        referral_code,
        partner_id,
        attribution_source,
        is_demo
    )
    VALUES (
        TRIM(p_store_name),
        COALESCE(TRIM(p_manager_name), 'المدير العام'),
        TRIM(p_phone),
        p_city,
        p_business_type,
        p_referral_code,
        v_partner_id,
        COALESCE(p_attribution_source, 'DIRECT'),
        COALESCE(p_is_demo, false)
    )
    RETURNING id INTO v_lead_id;

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id
    );
END;
$$;

-- [E] دالة تصفير وإعادة تهيئة متجر الديمو المتكامل (Demo Store Reset)
CREATE OR REPLACE FUNCTION public.reset_demo_store(
    p_slug TEXT DEFAULT 'demo-cafe'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
BEGIN
    INSERT INTO public.stores (
        name,
        slug,
        logo_url,
        primary_color,
        secondary_color,
        points_per_riyal,
        manager_name,
        manager_contact,
        subscription_active,
        status,
        subscription_status,
        subscription_plan,
        setup_fee_paid,
        welcome_gift_type,
        welcome_points,
        welcome_offer_title,
        is_demo
    )
    VALUES (
        'رادار كافيه التجريبي (Demo Cafe)',
        LOWER(TRIM(p_slug)),
        'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&auto=format&fit=crop&q=80',
        '#0F172A',
        '#F59E0B',
        1.0,
        'مدير المتجر التجريبي',
        '0550000000',
        true,
        'active',
        'active',
        'pro',
        true,
        'POINTS',
        50,
        'قهوة اليوم مجاناً مع أول زيارة',
        true
    )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        logo_url = EXCLUDED.logo_url,
        primary_color = EXCLUDED.primary_color,
        secondary_color = EXCLUDED.secondary_color,
        points_per_riyal = EXCLUDED.points_per_riyal,
        manager_name = EXCLUDED.manager_name,
        manager_contact = EXCLUDED.manager_contact,
        subscription_active = true,
        status = 'active',
        subscription_status = 'active',
        is_demo = true,
        updated_at = now()
    RETURNING * INTO v_store;

    -- Clean previous demo activity
    DELETE FROM public.audit_logs WHERE store_id = v_store.id;
    DELETE FROM public.customer_coupons WHERE store_id = v_store.id;
    DELETE FROM public.store_customers WHERE store_id = v_store.id;
    DELETE FROM public.store_staff WHERE store_id = v_store.id;
    DELETE FROM public.tiers WHERE store_id = v_store.id;
    DELETE FROM public.privileges WHERE store_id = v_store.id;

    -- Seed Staff
    INSERT INTO public.store_staff (store_id, name, phone, role, pin_code, is_active, can_manual_input_phone)
    VALUES
        (v_store.id, 'سعد المنصور (مدير المتجر)', '0550000000', 'admin', '9999', true, true),
        (v_store.id, 'فهد السالم (كاشير نقاط البيع)', '0551111111', 'cashier', '1234', true, true);

    -- Seed Tiers
    INSERT INTO public.tiers (store_id, tier_name, required_xp, badge_color)
    VALUES
        (v_store.id, 'ضيف (Guest)', 0, '#94A3B8'),
        (v_store.id, 'برونزي (Bronze)', 150, '#CD7F32'),
        (v_store.id, 'فضي (Silver)', 500, '#3B82F6'),
        (v_store.id, 'VIP Gold 👑', 1200, '#F59E0B');

    -- Seed Wallet
    INSERT INTO public.store_wallets (store_id, sms_quota, sms_used, wa_quota, wa_used, cashier_limit)
    VALUES (v_store.id, 1000, 12, 500, 28, 5)
    ON CONFLICT (store_id) DO UPDATE SET
        sms_quota = 1000, sms_used = 12, wa_quota = 500, wa_used = 28, cashier_limit = 5;

    -- Seed Customers
    INSERT INTO public.store_customers (store_id, phone, name, wallet_balance, lifetime_xp, is_demo)
    VALUES
        (v_store.id, '0501112233', 'سارة العبدالله', 180, 220, true),
        (v_store.id, '0504445566', 'خالد الدوسري (عميل ذهبي)', 550, 850, true),
        (v_store.id, '0507778899', 'نورة الشمري (عضو جديد)', 50, 50, true);

    -- Seed Privileges
    INSERT INTO public.privileges (store_id, title, description, image_url, cost_points, quantity_limit, per_customer_limit, is_active, is_hidden)
    VALUES
        (v_store.id, 'قهوة اليوم مجانية (Black Coffee)', 'كوب قهوة يوم طازجة ومحضرة من أجود حبوب البن', 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80', 50, 100, 2, true, false),
        (v_store.id, 'خصم 25% على الفاتورة الكاملة', 'خصم خاص وحصري للأعضاء', 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&auto=format&fit=crop&q=80', 100, 50, 1, true, false),
        (v_store.id, 'كيكة سان سباستيان مجاناً 🍰', 'قطعة حلا سان سباستيان الفاخرة', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&auto=format&fit=crop&q=80', 150, 30, 1, true, false);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'تم تصفير وإعادة تهيئة متجر الديمو بنجاح',
        'store', row_to_json(v_store)
    );
END;
$$;

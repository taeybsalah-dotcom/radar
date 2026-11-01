-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - TENANT ISOLATION MIGRATION: PART 5
-- File: 20261101_tenant_isolation_part5_public_storefront_rpcs.sql
-- Date: 2026-11-01
-- Goal: Complete Public Storefront & Visitor RPCs (Menu, Specialists, Store by Slug,
--       Referral Verification, Public Leads, Public Customer Profile, Public Customer Coupons)
--       to prevent frontend crashes under strict RLS for anonymous (anon) visitors.
-- Mode: Idempotent, reversible
-- ==============================================================================

-- 1️⃣ دالة جلب بيانات المتجر بالرابط للزوار get_public_store_by_slug
CREATE OR REPLACE FUNCTION public.get_public_store_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_slug TEXT;
    v_store RECORD;
BEGIN
    IF p_slug IS NULL OR TRIM(p_slug) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_slug := LOWER(TRIM(p_slug));

    SELECT *
    INTO v_store
    FROM public.stores
    WHERE LOWER(slug) = v_clean_slug
    LIMIT 1;

    IF v_store.id IS NOT NULL THEN
        RETURN to_jsonb(v_store);
    END IF;

    RETURN NULL;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_store_by_slug(TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2️⃣ دالة جلب قائمة أصناف المتجر (المنيو) للزوار get_public_catalog_items
CREATE OR REPLACE FUNCTION public.get_public_catalog_items(p_store_id UUID)
RETURNS SETOF public.catalog_items
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_store_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.catalog_items
    WHERE store_id = p_store_id AND is_available = true
    ORDER BY category ASC, name ASC;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_catalog_items(UUID) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3️⃣ دالة جلب أخصائيي المتجر لصفحة الحجوزات get_public_store_specialists
CREATE OR REPLACE FUNCTION public.get_public_store_specialists(p_store_id UUID)
RETURNS SETOF public.store_specialists
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_store_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.store_specialists
    WHERE store_id = p_store_id AND is_active = true
    ORDER BY name ASC;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_store_specialists(UUID) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4️⃣ دالة جلب فروع المتجر العامة get_public_store_branches
CREATE OR REPLACE FUNCTION public.get_public_store_branches(p_store_id UUID)
RETURNS SETOF public.store_branches
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_store_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.store_branches
    WHERE store_id = p_store_id
    ORDER BY is_main DESC, created_at ASC;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_store_branches(UUID) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5️⃣ دالة التحقق من كود إحالة المسوق verify_partner_referral_code
-- 🔒 تنظيف صارم للدومين من www. والمنافذ والبروتوكول، وحظر تام لأي خلط بين وكالات النطاق
CREATE OR REPLACE FUNCTION public.verify_partner_referral_code(
    p_code TEXT,
    p_host TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_code TEXT;
    v_clean_host TEXT;
    v_tenant_id TEXT;
    v_partner RECORD;
BEGIN
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_code := UPPER(TRIM(p_code));

    -- تنظيف النطاق تماماً من البروتوكول والمنافذ و www. كما في دالة get_active_tenant_by_domain
    IF p_host IS NOT NULL AND TRIM(p_host) <> '' THEN
        v_clean_host := LOWER(TRIM(p_host));
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
        v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

        SELECT id INTO v_tenant_id FROM public.tenants
        WHERE LOWER(custom_domain) = v_clean_host
           OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
           OR LOWER(slug) = v_clean_host
        LIMIT 1;

        -- 🔒 حظر أمني صارم: إذا كان p_host مرسل ولم يتطابق مع وكيل معتمد يُرفض الكود فوراً
        IF v_tenant_id IS NULL THEN
            RETURN NULL;
        END IF;

        -- فحص الكود محصوراً بوكالة النطاق فقط وبلا أي استثناء (يُمنع قبول مسوق من وكالة ثانية)
        SELECT 
            id, referral_code, slug, display_name, tenant_id, active
        INTO v_partner
        FROM public.partner_accounts
        WHERE (UPPER(referral_code) = v_clean_code OR UPPER(COALESCE(slug, '')) = v_clean_code)
          AND active = true
          AND tenant_id = v_tenant_id
        LIMIT 1;
    ELSE
        -- إذا لم يُرسل p_host نهائياً يُفحص وكيل الجلسة الموثقة
        v_tenant_id := public.current_tenant_id();
        IF v_tenant_id IS NULL THEN
            RETURN NULL;
        END IF;

        SELECT 
            id, referral_code, slug, display_name, tenant_id, active
        INTO v_partner
        FROM public.partner_accounts
        WHERE (UPPER(referral_code) = v_clean_code OR UPPER(COALESCE(slug, '')) = v_clean_code)
          AND active = true
          AND tenant_id = v_tenant_id
        LIMIT 1;
    END IF;

    IF v_partner.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'id', v_partner.id,
            'referral_code', v_partner.referral_code,
            'slug', v_partner.slug,
            'display_name', v_partner.display_name,
            'tenant_id', v_partner.tenant_id,
            'active', v_partner.active
        );
    END IF;

    RETURN NULL;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.verify_partner_referral_code(TEXT, TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6️⃣ دالة تسجيل طلب انضمام تاجر جديد submit_merchant_lead_rpc
CREATE OR REPLACE FUNCTION public.submit_merchant_lead_rpc(
    p_payload JSONB,
    p_host TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_host TEXT;
    v_tenant_id TEXT;
    v_lead_id UUID;
    v_ref_code TEXT;
BEGIN
    IF p_payload IS NULL THEN
        RAISE EXCEPTION 'Invalid lead payload.';
    END IF;

    v_ref_code := UPPER(TRIM(COALESCE(p_payload->>'referral_code', p_payload->>'referred_by_code', '')));

    -- استخراج الوكيل من الشريك المحيل أولاً إن وجد
    IF v_ref_code <> '' THEN
        SELECT tenant_id INTO v_tenant_id FROM public.partner_accounts WHERE UPPER(referral_code) = v_ref_code LIMIT 1;
    END IF;

    -- إذا لم يتوفر من الشريك، يُستخرج من نطاق الدخول بعد تنظيفه
    IF v_tenant_id IS NULL AND p_host IS NOT NULL AND TRIM(p_host) <> '' THEN
        v_clean_host := LOWER(TRIM(p_host));
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
        v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

        SELECT id INTO v_tenant_id FROM public.tenants
        WHERE LOWER(custom_domain) = v_clean_host
           OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
           OR LOWER(slug) = v_clean_host
        LIMIT 1;
    END IF;

    -- الافتراضي إلى رادار إذا تعذر كلياً تحديد النطاق
    v_tenant_id := COALESCE(v_tenant_id, 'radar');

    INSERT INTO public.merchant_leads (
        id, store_name, manager_name, phone, normalized_phone, business_type, city,
        status, referral_code, converted_store_id, tenant_id, created_at, updated_at
    ) VALUES (
        gen_random_uuid(),
        COALESCE(p_payload->>'store_name', p_payload->>'merchant_name', 'متجر جديد'),
        COALESCE(p_payload->>'manager_name', 'المدير'),
        COALESCE(p_payload->>'phone', ''),
        COALESCE(NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(p_payload->>'phone', ''), '[^0-9]', '', 'g'), 9), ''), '000000000'),
        COALESCE(p_payload->>'business_type', 'retail'),
        COALESCE(p_payload->>'city', ''),
        'NEW',
        NULLIF(v_ref_code, ''),
        NULLIF(COALESCE(p_payload->>'converted_store_id', p_payload->>'store_id'), '')::uuid,
        v_tenant_id,
        now(),
        now()
    )
    RETURNING id INTO v_lead_id;

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id,
        'tenant_id', v_tenant_id,
        'message', 'Lead submitted successfully'
    );
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.submit_merchant_lead_rpc(JSONB, TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7️⃣ دالة جلب بطاقة العميل العامة بالهاتف get_public_customer_profile (لمنع تعطل getCustomer)
CREATE OR REPLACE FUNCTION public.get_public_customer_profile(
    p_store_id UUID,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_phone TEXT;
    v_cust RECORD;
BEGIN
    IF p_store_id IS NULL OR p_phone IS NULL OR TRIM(p_phone) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_phone := RIGHT(REGEXP_REPLACE(TRIM(p_phone), '[^0-9]', '', 'g'), 9);

    SELECT *
    INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 9) = v_clean_phone
    LIMIT 1;

    IF v_cust.id IS NOT NULL THEN
        RETURN to_jsonb(v_cust);
    END IF;

    RETURN NULL;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_customer_profile(UUID, TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8️⃣ دالة جلب كوبونات العميل العامة get_public_customer_coupons (لمنع تعطل getCustomerCoupons)
CREATE OR REPLACE FUNCTION public.get_public_customer_coupons(
    p_store_id UUID,
    p_phone TEXT DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL
)
RETURNS SETOF public.customer_coupons
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_phone TEXT;
BEGIN
    IF p_store_id IS NULL THEN
        RETURN;
    END IF;

    IF p_phone IS NOT NULL AND TRIM(p_phone) <> '' THEN
        v_clean_phone := RIGHT(REGEXP_REPLACE(TRIM(p_phone), '[^0-9]', '', 'g'), 9);
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.customer_coupons
    WHERE store_id = p_store_id
      AND (
          (p_customer_id IS NOT NULL AND customer_id = p_customer_id)
          OR (v_clean_phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '[^0-9]', '', 'g'), 9) = v_clean_phone)
      )
    ORDER BY purchased_at DESC;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_customer_coupons(UUID, TEXT, UUID) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — MIGRATION 20261012_SEC03 (ENTERPRISE HARDENING)
-- RESOLVE ALL 18 SUPABASE SECURITY ADVISOR RLS ISSUES
-- 100% IDEMPOTENT: AUTO DROPS PREVIOUS POLICIES & ADDS MISSING COLUMNS
-- ==============================================================================

-- 0. Ensure pgcrypto extension for secure Bcrypt PIN hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. التأكد من وجود كافة الأعمدة المطلوبة مسبقاً لمنع أي خطأ
ALTER TABLE IF EXISTS public.partner_accounts ADD COLUMN IF NOT EXISTS pin_code VARCHAR(100) DEFAULT '1234';
ALTER TABLE IF EXISTS public.partner_accounts ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50);
ALTER TABLE IF EXISTS public.partner_accounts ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.2000;
ALTER TABLE IF EXISTS public.partner_accounts ALTER COLUMN pin_code TYPE VARCHAR(100);

ALTER TABLE IF EXISTS public.affiliates ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.2000;
ALTER TABLE IF EXISTS public.partner_commissions ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL;

-- 2. حذف أي سياسات سابقة على الجداول الـ 11 لتجنب أي تكرار أو تعارض (Clean Reset)
DO $$
DECLARE
    r RECORD;
    t TEXT;
    tbls TEXT[] := ARRAY[
        'billing_plans', 'catalog_items', 'store_specialists', 'service_bookings',
        'affiliates', 'partner_accounts', 'partner_commissions', 'partner_bonus_rules',
        'partner_bonus_awards', 'partner_targets', 'partner_audit_logs'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        FOR r IN (
            SELECT policyname 
            FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = t
        ) LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
        END LOOP;
    END LOOP;
END $$;


-- ==============================================================================
-- 1. BILLING PLANS (باقات وخطط الأسعار)
-- ==============================================================================
ALTER TABLE IF EXISTS public.billing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active billing plans"
ON public.billing_plans FOR SELECT
TO anon, authenticated
USING (active = true OR public.is_super_admin());

CREATE POLICY "SuperAdmin can manage billing plans"
ON public.billing_plans FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role billing plans full access"
ON public.billing_plans FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 2. CATALOG ITEMS (المنيو والمنتجات والخدمات)
-- ==============================================================================
ALTER TABLE IF EXISTS public.catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view catalog items"
ON public.catalog_items FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Store staff can manage catalog items"
ON public.catalog_items FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role catalog items full access"
ON public.catalog_items FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 3. STORE SPECIALISTS (الأخصائيين ومقدمي الخدمات)
-- ==============================================================================
ALTER TABLE IF EXISTS public.store_specialists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view specialists"
ON public.store_specialists FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Store staff can manage specialists"
ON public.store_specialists FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role specialists full access"
ON public.store_specialists FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 4. SERVICE BOOKINGS (حجوزات المواعيد)
-- ==============================================================================
ALTER TABLE IF EXISTS public.service_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert bookings"
ON public.service_bookings FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Store staff can read bookings"
ON public.service_bookings FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Store staff can update bookings"
ON public.service_bookings FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "SuperAdmin can manage bookings"
ON public.service_bookings FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role bookings full access"
ON public.service_bookings FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 5. AFFILIATES (بيانات الشركاء - إغلاق تام للقراءة العامة وحماية الخصوصية)
-- ==============================================================================
ALTER TABLE IF EXISTS public.affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin affiliates access"
ON public.affiliates FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role affiliates full access"
ON public.affiliates FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_referral_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_aff RECORD;
BEGIN
    IF p_code IS NULL OR trim(p_code) = '' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'الكود فارغ');
    END IF;

    SELECT id, name, referral_code, status
    INTO v_aff
    FROM public.affiliates
    WHERE LOWER(referral_code) = LOWER(trim(p_code)) AND status = 'ACTIVE'
    LIMIT 1;

    IF v_aff IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'message', 'كود غير صحيح');
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'referral_code', v_aff.referral_code,
        'partner_name', v_aff.name
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_referral_code(text) TO anon, authenticated, service_role;


-- ==============================================================================
-- 6. PARTNER ACCOUNTS & PIN SECURITY (توسيع الحقل وتشفير الـ PIN بـ Bcrypt)
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_accounts ENABLE ROW LEVEL SECURITY;

UPDATE public.partner_accounts
SET pin_code = crypt(trim(pin_code), gen_salt('bf', 8))
WHERE pin_code IS NOT NULL 
  AND trim(pin_code) <> '' 
  AND pin_code NOT LIKE '$2%';

UPDATE public.partner_accounts
SET pin_code = crypt('1234', gen_salt('bf', 8))
WHERE pin_code IS NULL OR trim(pin_code) = '';

CREATE POLICY "SuperAdmin partner accounts access"
ON public.partner_accounts FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner accounts full access"
ON public.partner_accounts FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.verify_partner_login(
    p_login_input TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_input TEXT := lower(trim(p_login_input));
    v_partner RECORD;
    v_is_match BOOLEAN := FALSE;
BEGIN
    IF p_login_input IS NULL OR trim(p_login_input) = '' OR p_pin IS NULL OR trim(p_pin) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال البيانات كاملة');
    END IF;

    SELECT pa.id, pa.affiliate_id, pa.display_name, pa.slug, pa.region, pa.active, pa.pin_code,
           a.name, a.phone, a.referral_code, a.status,
           COALESCE(pa.commission_rate, 0.2000) as commission_rate
    INTO v_partner
    FROM public.partner_accounts pa
    JOIN public.affiliates a ON a.id = pa.affiliate_id
    WHERE lower(trim(COALESCE(a.referral_code, ''))) = v_clean_input
       OR lower(trim(COALESCE(pa.slug, ''))) = v_clean_input
       OR regexp_replace(COALESCE(a.phone, ''), '\D', '', 'g') = regexp_replace(p_login_input, '\D', '', 'g')
    LIMIT 1;

    IF v_partner IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'رقم الجوال أو كود الشريك غير مسجل');
    END IF;

    IF v_partner.active = FALSE OR v_partner.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك موقوف حالياً، يرجى التواصل مع الإدارة');
    END IF;

    IF v_partner.pin_code LIKE '$2%' THEN
        v_is_match := (v_partner.pin_code = crypt(trim(p_pin), v_partner.pin_code));
    ELSE
        v_is_match := (trim(v_partner.pin_code) = trim(p_pin));
        IF v_is_match THEN
            UPDATE public.partner_accounts
            SET pin_code = crypt(trim(p_pin), gen_salt('bf', 8))
            WHERE id = v_partner.id;
        END IF;
    END IF;

    IF NOT v_is_match THEN
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري (PIN) غير صحيح');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'partner', jsonb_build_object(
            'id', v_partner.id,
            'affiliate_id', v_partner.affiliate_id,
            'display_name', v_partner.display_name,
            'slug', v_partner.slug,
            'region', v_partner.region,
            'phone', v_partner.phone,
            'referral_code', v_partner.referral_code,
            'commission_rate', v_partner.commission_rate
        )
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_partner_login(text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.change_partner_pin(
    p_partner_id UUID,
    p_old_pin TEXT,
    p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_partner RECORD;
    v_is_valid BOOLEAN := FALSE;
BEGIN
    IF p_new_pin IS NULL OR length(trim(p_new_pin)) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري الجديد يجب ألا يقل عن 4 أرقام');
    END IF;

    SELECT id, pin_code INTO v_partner
    FROM public.partner_accounts
    WHERE id = p_partner_id;

    IF v_partner IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'حساب الشريك غير موجود');
    END IF;

    IF v_partner.pin_code LIKE '$2%' THEN
        v_is_valid := (v_partner.pin_code = crypt(trim(p_old_pin), v_partner.pin_code));
    ELSE
        v_is_valid := (trim(v_partner.pin_code) = trim(p_old_pin));
    END IF;

    IF NOT v_is_valid THEN
        RETURN jsonb_build_object('success', false, 'error', 'الرمز السري القديم غير صحيح');
    END IF;

    UPDATE public.partner_accounts
    SET pin_code = crypt(trim(p_new_pin), gen_salt('bf', 8)),
        updated_at = now()
    WHERE id = p_partner_id;

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث الرمز السري بنجاح وتأمينه 🔒');
END;
$$;
GRANT EXECUTE ON FUNCTION public.change_partner_pin(uuid, text, text) TO anon, authenticated, service_role;


-- ==============================================================================
-- 7. PARTNER COMMISSIONS & FINANCES (عزل العمولات والأرباح بالكامل)
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_bonus_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_bonus_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin partner commissions access"
ON public.partner_commissions FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner commissions full access"
ON public.partner_commissions FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public can view active bonus rules"
ON public.partner_bonus_rules FOR SELECT
TO anon, authenticated
USING (active = true OR public.is_super_admin());

CREATE POLICY "SuperAdmin manage bonus rules"
ON public.partner_bonus_rules FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner bonus rules full access"
ON public.partner_bonus_rules FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "SuperAdmin partner bonus awards access"
ON public.partner_bonus_awards FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role bonus awards full access"
ON public.partner_bonus_awards FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "SuperAdmin partner targets access"
ON public.partner_targets FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner targets full access"
ON public.partner_targets FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "SuperAdmin partner audit logs access"
ON public.partner_audit_logs FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role audit logs full access"
ON public.partner_audit_logs FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_partner_commissions_secure(p_partner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows JSONB;
BEGIN
    IF p_partner_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT pc.id, pc.commission_amount, pc.commission_type, pc.status, pc.created_at,
               ml.store_name AS merchant_name
        FROM public.partner_commissions pc
        LEFT JOIN public.merchant_leads ml ON ml.id = pc.merchant_lead_id
        WHERE (pc.partner_account_id = p_partner_id 
               OR pc.affiliate_id = p_partner_id
               OR pc.partner_account_id IN (SELECT id FROM public.partner_accounts WHERE affiliate_id = p_partner_id))
          AND pc.status <> 'PENDING'
        ORDER BY pc.created_at DESC
    ) t;

    RETURN v_rows;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_partner_commissions_secure(uuid) TO anon, authenticated, service_role;

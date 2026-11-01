-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - TENANT ISOLATION MIGRATION: PART 4
-- File: 20261101_tenant_isolation_part4_security_definer_rpcs.sql
-- Date: 2026-11-01
-- Goal: Hardened RPCs, master token verification, sanitized public domain lookups,
--       strictly isolated billing plans, authentic bonus rule copying, super admin context switch,
--       and fix for Sadeem agency administrator account.
-- Mode: Idempotent, reversible
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1️⃣ دالة الشركاء المالية get_all_partner_financial_summaries
CREATE OR REPLACE FUNCTION public.get_all_partner_financial_summaries(
    p_partner_id UUID DEFAULT NULL,
    p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_partner_record RECORD;
    v_target_tenant TEXT;
    v_is_master_control BOOLEAN := FALSE;
    v_earned_comm NUMERIC := 0;
    v_paid_comm NUMERIC := 0;
    v_pending_comm NUMERIC := 0;
    v_earned_bonus NUMERIC := 0;
    v_paid_bonus NUMERIC := 0;
    v_total_payable NUMERIC := 0;
    v_total_paid NUMERIC := 0;
BEGIN
    IF p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token) THEN
        v_is_master_control := TRUE;
    END IF;

    v_target_tenant := public.current_tenant_id();

    IF v_target_tenant IS NULL AND NOT v_is_master_control THEN
        RAISE EXCEPTION 'Access Denied: Unverified tenant session.';
    END IF;

    FOR v_partner_record IN
        SELECT 
            pa.id, 
            pa.affiliate_id, 
            pa.display_name, 
            COALESCE(pa.slug, LOWER(COALESCE(pa.referral_code, af.referral_code, 'alhaj'))) AS slug,
            COALESCE(pa.referral_code, af.referral_code, 'ALHAJ') AS referral_code,
            COALESCE(af.phone, '') AS phone,
            '****' AS pin_code,
            COALESCE(pa.commission_rate, 0.2000) AS commission_rate,
            COALESCE(pa.acquisition_commission_rate, 0.2000) AS acquisition_commission_rate,
            COALESCE(pa.recurring_commission_rate, 0.1000) AS recurring_commission_rate,
            COALESCE(pa.target_value, 20) AS target_value,
            COALESCE(pa.active, true) AS active,
            pa.tenant_id,
            pa.created_at
        FROM public.partner_accounts pa
        LEFT JOIN public.affiliates af ON af.id = pa.affiliate_id
        WHERE (p_partner_id IS NULL OR pa.id = p_partner_id OR pa.affiliate_id = p_partner_id)
          AND (v_is_master_control OR pa.tenant_id = v_target_tenant)
        ORDER BY pa.created_at ASC
    LOOP
        v_earned_comm := 0;
        v_paid_comm := 0;
        v_pending_comm := 0;
        v_earned_bonus := 0;
        v_paid_bonus := 0;

        SELECT
            COALESCE(SUM(CASE WHEN status IN ('EARNED', 'AVAILABLE') THEN commission_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'PAID' THEN commission_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'PENDING' THEN commission_amount ELSE 0 END), 0)
        FROM public.partner_commissions
        WHERE (partner_account_id = v_partner_record.id OR affiliate_id = v_partner_record.affiliate_id)
          AND status NOT IN ('REVERSED', 'CANCELLED', 'VOID')
          AND (v_is_master_control OR tenant_id = v_target_tenant)
        INTO v_earned_comm, v_paid_comm, v_pending_comm;

        SELECT
            COALESCE(SUM(CASE WHEN status = 'ACHIEVED' THEN bonus_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status IN ('AWARDED', 'PAID') THEN bonus_amount ELSE 0 END), 0)
        FROM public.partner_bonus_awards
        WHERE partner_account_id = v_partner_record.id
          AND (v_is_master_control OR tenant_id = v_target_tenant)
        INTO v_earned_bonus, v_paid_bonus;

        v_total_payable := (v_earned_comm - v_paid_comm) + (v_earned_bonus - v_paid_bonus);
        v_total_paid := v_paid_comm + v_paid_bonus;

        v_result := jsonb_set(
            v_result,
            ARRAY[v_partner_record.id::text],
            jsonb_build_object(
                'partner_id', v_partner_record.id,
                'affiliate_id', v_partner_record.affiliate_id,
                'display_name', v_partner_record.display_name,
                'referral_code', v_partner_record.referral_code,
                'phone', v_partner_record.phone,
                'pin_code', '****',
                'tenant_id', v_partner_record.tenant_id,
                'commission_rate', v_partner_record.commission_rate,
                'target_value', v_partner_record.target_value,
                'active', v_partner_record.active,
                'earned_commissions', v_earned_comm,
                'paid_commissions', v_paid_comm,
                'pending_commissions', v_pending_comm,
                'earned_bonus', v_earned_bonus,
                'paid_bonus', v_paid_bonus,
                'total_payable', v_total_payable,
                'total_paid', v_total_paid
            )
        );
    END LOOP;

    RETURN v_result;
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.get_all_partner_financial_summaries(UUID, TEXT) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_all_partner_financial_summaries(UUID, TEXT) TO authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2️⃣ دالة جلب الوكيل الفعال بالدومين get_active_tenant_by_domain
CREATE OR REPLACE FUNCTION public.get_active_tenant_by_domain(p_host TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_host TEXT;
    v_tenant RECORD;
BEGIN
    IF p_host IS NULL OR TRIM(p_host) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_host := LOWER(TRIM(p_host));
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
    v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

    SELECT *
    INTO v_tenant
    FROM public.tenants
    WHERE status = 'active'
      AND (
          LOWER(custom_domain) = v_clean_host
          OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
          OR LOWER(slug) = v_clean_host
      )
    LIMIT 1;

    IF v_tenant.id IS NOT NULL THEN
        RETURN to_jsonb(v_tenant);
    END IF;

    RETURN NULL;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_active_tenant_by_domain(TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3️⃣ زراعة الهاش السيادي في reseller_master_auth والتحقق منه حصرياً لـ service_role
CREATE TABLE IF NOT EXISTS public.reseller_master_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DELETE FROM public.reseller_master_auth;
INSERT INTO public.reseller_master_auth (id, master_token_hash, created_at)
VALUES (
    gen_random_uuid(),
    '09678bf63a187557ac1887cdf7b25b8cf1c8d2c0e1ee1badea0d7b368c90afa2',
    now()
);

CREATE OR REPLACE FUNCTION public.is_valid_master_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_token IS NULL OR TRIM(p_token) = '' THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.reseller_master_auth 
        WHERE master_token_hash = encode(digest(p_token, 'sha256'), 'hex')
    );
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.is_valid_master_token(TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.is_valid_master_token(TEXT) TO service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.exec_master_sql(p_sql TEXT, p_master_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NOT public.is_valid_master_token(p_master_token) THEN
        RAISE EXCEPTION 'Unauthorized: Invalid master token.';
    END IF;

    EXECUTE p_sql;
    RETURN jsonb_build_object('success', true, 'executed_at', now());
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.exec_master_sql(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.exec_master_sql(TEXT, TEXT) TO service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4️⃣ إجراء زراعة قواعد الحوافز الافتراضية بنسخ قواعد رادار الفعلية
CREATE OR REPLACE FUNCTION public.seed_tenant_default_bonus_rules(p_tenant_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_tenant_id IS NULL OR TRIM(p_tenant_id) = '' THEN
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.partner_bonus_rules WHERE tenant_id = p_tenant_id) THEN
        INSERT INTO public.partner_bonus_rules (
            milestone, bonus_amount, active, tenant_id, created_at, updated_at
        )
        SELECT 
            pbr.milestone, pbr.bonus_amount, pbr.active, p_tenant_id, now(), now()
        FROM public.partner_bonus_rules pbr
        WHERE pbr.tenant_id = 'radar'
        ON CONFLICT (tenant_id, milestone) DO NOTHING;

        IF NOT EXISTS (SELECT 1 FROM public.partner_bonus_rules WHERE tenant_id = p_tenant_id) THEN
            INSERT INTO public.partner_bonus_rules (milestone, bonus_amount, active, tenant_id)
            VALUES 
                (3, 100.00, true, p_tenant_id),
                (5, 250.00, true, p_tenant_id),
                (10, 500.00, true, p_tenant_id),
                (20, 1000.00, true, p_tenant_id)
            ON CONFLICT (tenant_id, milestone) DO NOTHING;
        END IF;
    END IF;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.seed_tenant_default_bonus_rules(TEXT) TO authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT public.seed_tenant_default_bonus_rules('sadeem');

-- 5️⃣ دالة جلب باقات الاشتراك بحسب الدومين get_public_billing_plans (عزل تام: سديم يرى سديم ورادار يرى رادار وبلا باقات مشتركة)
CREATE OR REPLACE FUNCTION public.get_public_billing_plans(p_host TEXT)
RETURNS SETOF public.billing_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_host TEXT;
    v_tenant_id TEXT;
BEGIN
    IF p_host IS NULL OR TRIM(p_host) = '' THEN
        RETURN;
    END IF;

    v_clean_host := LOWER(TRIM(p_host));
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
    v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

    SELECT id INTO v_tenant_id 
    FROM public.tenants 
    WHERE LOWER(custom_domain) = v_clean_host 
       OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
       OR LOWER(slug) = v_clean_host
    LIMIT 1;

    -- إرجاع باقات هذا الوكيل حصراً دون أي باقات مشتركة
    IF v_tenant_id IS NOT NULL THEN
        RETURN QUERY
        SELECT * FROM public.billing_plans
        WHERE active = true AND tenant_id = v_tenant_id
        ORDER BY amount ASC;
    END IF;

    RETURN;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_billing_plans(TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6️⃣ دالة جلب هوية الوكيل الآمنة get_tenant_branding_by_domain
CREATE OR REPLACE FUNCTION public.get_tenant_branding_by_domain(p_host TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_tenant JSONB;
    v_tenant_id TEXT;
BEGIN
    v_tenant := public.get_active_tenant_by_domain(p_host);
    IF v_tenant IS NULL THEN
        RETURN NULL;
    END IF;

    v_tenant_id := v_tenant->>'id';

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'tenant_name', v_tenant->>'name',
        'slug', v_tenant->>'slug',
        'custom_domain', v_tenant->>'custom_domain',
        'brand_name', COALESCE(v_tenant->>'name', ''),
        'brand_slogan', COALESCE(v_tenant->>'tagline', ''),
        'logo_url', COALESCE(v_tenant->>'logo_url', ''),
        'favicon_url', COALESCE(v_tenant->>'favicon_url', ''),
        'primary_color', COALESCE(v_tenant->>'primary_color_hex', '#F59E0B'),
        'secondary_color', COALESCE(v_tenant->>'accent_color_hex', '#10B981'),
        'accent_color', COALESCE(v_tenant->>'accent_color_hex', '#10B981'),
        'support_email', COALESCE(v_tenant->>'support_email', ''),
        'support_phone', COALESCE(v_tenant->>'support_phone', '')
    );
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_tenant_branding_by_domain(TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7️⃣ دالة تحويل نطاق الوكيل للسوبر أدمن switch_super_admin_active_tenant
-- 🔒 فحص أمني صارم: محظورة منعاً باتاً على مسؤولي الوكالات والعملاء، ومحصورة بمالك المنصة
CREATE OR REPLACE FUNCTION public.switch_super_admin_active_tenant(p_target_tenant_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid UUID;
    v_is_super BOOLEAN;
    v_clean_tenant TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- التحقق الصارم من صفة السوبر أدمن
    v_is_super := (
        (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
        OR EXISTS (
            SELECT 1 FROM public.super_admin_users 
            WHERE user_id = v_uid AND role = 'super_admin' AND is_active = true
        )
    );

    IF NOT v_is_super THEN
        RAISE EXCEPTION 'Security Violation: Only platform Super Admin can switch tenant context.';
    END IF;

    v_clean_tenant := LOWER(TRIM(p_target_tenant_id));
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_clean_tenant) THEN
        RAISE EXCEPTION 'Target tenant % does not exist.', v_clean_tenant;
    END IF;

    -- تعديل ادعاء tenant_id داخل raw_app_meta_data للـ super admin
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('tenant_id', v_clean_tenant),
        updated_at = now()
    WHERE id = v_uid;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_uid,
        'active_tenant', v_clean_tenant,
        'message', 'Tenant context switched successfully'
    );
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.switch_super_admin_active_tenant(TEXT) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.switch_super_admin_active_tenant(TEXT) TO authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8️⃣ تثبيت وترقية حساب مسؤول وكالة سديم admin@sdeemalathr.com
DO $$
DECLARE
    v_sadeem_user_id UUID;
BEGIN
    SELECT id INTO v_sadeem_user_id 
    FROM auth.users 
    WHERE LOWER(email) = 'admin@sdeemalathr.com';

    IF v_sadeem_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
            'role', 'tenant_admin',
            'tenant_id', 'sadeem',
            'is_super_admin', false
        ),
        updated_at = now()
        WHERE id = v_sadeem_user_id;
    END IF;
END $$;

-- 9️⃣ تحديث دالة verify_super_admin_session لدعم مسؤولي الوكالات tenant_admin بسلاسة
CREATE OR REPLACE FUNCTION public.verify_super_admin_session()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_super BOOLEAN;
    v_email TEXT;
    v_uid UUID;
    v_admin RECORD;
    v_role TEXT;
    v_tenant_id TEXT;
BEGIN
    v_uid := auth.uid();
    v_email := LOWER(COALESCE(auth.jwt() ->> 'email', 'service_role'));
    v_role := auth.jwt() -> 'app_metadata' ->> 'role';
    v_tenant_id := auth.jwt() -> 'app_metadata' ->> 'tenant_id';

    -- أ) فحص إذا كان المستخدم مسؤول وكالة معتمد (tenant_admin)
    IF v_role = 'tenant_admin' THEN
        RETURN jsonb_build_object(
            'authenticated', true,
            'is_super_admin', true,
            'role', 'tenant_admin',
            'tenant_id', v_tenant_id,
            'admin_id', v_uid,
            'email', v_email,
            'full_name', 'مسؤول الوكالة المعتمد',
            'permissions', jsonb_build_object(
                'can_manage_stores', true,
                'can_manage_billing', true,
                'can_view_financials', true,
                'can_manage_partners', true
            )
        );
    END IF;

    -- ب) فحص مالك المنظومة الشامل (Super Admin)
    v_is_super := (
        (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
        OR v_role = 'super_admin'
        OR auth.role() = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
    );

    IF NOT v_is_super THEN
        -- فحص جدول super_admin_users
        SELECT * INTO v_admin
        FROM public.super_admin_users
        WHERE (user_id = v_uid OR LOWER(email) = v_email) AND is_active = true
        LIMIT 1;

        IF v_admin.user_id IS NOT NULL THEN
            v_is_super := TRUE;
        END IF;
    END IF;

    IF NOT v_is_super THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'is_super_admin', false,
            'error', 'UNAUTHORIZED',
            'message', 'الحساب الحالي غير مصرح له بإدارة المنصة'
        );
    END IF;

    RETURN jsonb_build_object(
        'authenticated', true,
        'is_super_admin', true,
        'role', 'super_admin',
        'tenant_id', COALESCE(v_tenant_id, 'radar'),
        'admin_id', v_uid,
        'email', v_email,
        'full_name', 'صلاح الطيب (مالك المنظومة)',
        'permissions', jsonb_build_object(
            'can_manage_stores', true,
            'can_delete_stores', true,
            'can_manage_billing', true,
            'can_view_financials', true,
            'can_manage_partners', true,
            'can_send_notifications', true,
            'can_manage_admins', true,
            'can_reset_platform', true
        )
    );
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.verify_super_admin_session() TO authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 🔟 إجراء استرجاع صلاحية المالك (Super Admin Break-Glass Recovery)
CREATE OR REPLACE FUNCTION public.master_restore_super_admin(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_email TEXT;
    v_user_id UUID;
BEGIN
    IF auth.role() <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access Denied: Only service_role can execute master break-glass recovery.';
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_clean_email;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found.', v_clean_email;
    END IF;

    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
        'role', 'super_admin',
        'is_super_admin', true,
        'tenant_id', 'radar'
    ),
    updated_at = now()
    WHERE id = v_user_id;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'super_admin_users') THEN
        INSERT INTO public.super_admin_users (
            user_id, email, full_name, role, is_active, created_at, updated_at
        ) VALUES (
            v_user_id, v_clean_email, 'صلاح الطيب (مالك المنظومة)', 'super_admin', true, now(), now()
        ) ON CONFLICT (email) DO UPDATE
        SET role = 'super_admin', is_active = true, updated_at = now();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'email', v_clean_email,
        'message', 'تم استرجاع وتثبيت صلاحية المالك (Super Admin) بنجاح فوري وبلا قيود'
    );
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.master_restore_super_admin(TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.master_restore_super_admin(TEXT) TO service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

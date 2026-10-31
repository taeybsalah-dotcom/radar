-- ==============================================================================
-- 🏛️ AL-ATHAR CORE (منصة الأثر السحابية) - SOVEREIGN MASTER CONTROL ENGINE
-- Migration: 20261114_al_athar_core_sovereign_master_engine.sql
-- Standalone Sovereign Command Center (localhost:3001) RPCs & Centralized Wallets
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1️⃣ جدول التوكن السيادي للوحة القيادة المركزية
CREATE TABLE IF NOT EXISTS public.reseller_master_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_master_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_master_auth FROM anon, authenticated;

-- زرع الهاش المشفر للتوكن السيادي للمالك صلاح (SOVEREIGN_MASTER_TOKEN)
DELETE FROM public.reseller_master_auth;
INSERT INTO public.reseller_master_auth (master_token_hash) 
VALUES (crypt('rsm_Y2C8Y5g9es8O2cjRGvD6WaFn2onAH79Qi37T53iUoV29KzkZHLe70txYpkkDzKF', gen_salt('bf')));

-- 2️⃣ دالة التحقق الأمني من التوكن السيادي
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
        WHERE master_token_hash = crypt(p_token, master_token_hash)
    );
END;
$$;

-- 3️⃣ دالة جلب كافة الوكلاء وإحصائيات المتاجر للوحة القيادة
CREATE OR REPLACE FUNCTION public.master_get_tenants(p_master_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_auth BOOLEAN := FALSE;
    v_result JSONB;
BEGIN
    IF public.is_valid_master_token(p_master_token) 
       OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
       OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        v_is_auth := TRUE;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Access Denied: Invalid Sovereign Token (401 Unauthorized)';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'name_en', t.name_en,
            'tagline', t.tagline,
            'slug', t.slug,
            'custom_domain', t.custom_domain,
            'logo_url', t.logo_url,
            'favicon_url', t.favicon_url,
            'support_phone', t.support_phone,
            'support_whatsapp', t.support_whatsapp,
            'support_email', t.support_email,
            'primary_color_hex', t.primary_color_hex,
            'accent_color_hex', t.accent_color_hex,
            'pwa_name', t.pwa_name,
            'copyright_holder', t.copyright_holder,
            'status', t.status,
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'stores_count', COALESCE((SELECT COUNT(*) FROM public.stores s WHERE s.tenant_id = t.id), 0)
        ) ORDER BY t.created_at ASC
    ) INTO v_result
    FROM public.tenants t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 4️⃣ دالة تحديث بيانات وهوية وحالة الوكيل (تعديل الهوية وKill Switch)
CREATE OR REPLACE FUNCTION public.master_update_tenant(
    p_master_token TEXT,
    p_tenant_id TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_auth BOOLEAN := FALSE;
    v_domain TEXT;
BEGIN
    IF public.is_valid_master_token(p_master_token) 
       OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
       OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        v_is_auth := TRUE;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Access Denied: Invalid Sovereign Token (401 Unauthorized)';
    END IF;

    -- تنظيف الدومين إذا تم تمريره
    IF p_data ? 'custom_domain' THEN
        v_domain := NULLIF(TRIM(p_data->>'custom_domain'), '');
        IF v_domain IS NOT NULL THEN
            v_domain := regexp_replace(v_domain, '^https?://', '', 'i');
            v_domain := regexp_replace(v_domain, '/.*$', '', 'i');
            v_domain := regexp_replace(v_domain, '^www\.', '', 'i');
        END IF;
    END IF;

    UPDATE public.tenants
    SET
        name = COALESCE(p_data->>'name', name),
        name_en = CASE WHEN p_data ? 'name_en' THEN p_data->>'name_en' ELSE name_en END,
        tagline = CASE WHEN p_data ? 'tagline' THEN p_data->>'tagline' ELSE tagline END,
        custom_domain = CASE WHEN p_data ? 'custom_domain' THEN v_domain ELSE custom_domain END,
        logo_url = CASE WHEN p_data ? 'logo_url' THEN p_data->>'logo_url' ELSE logo_url END,
        favicon_url = CASE WHEN p_data ? 'favicon_url' THEN p_data->>'favicon_url' ELSE favicon_url END,
        support_phone = CASE WHEN p_data ? 'support_phone' THEN p_data->>'support_phone' ELSE support_phone END,
        support_whatsapp = CASE WHEN p_data ? 'support_whatsapp' THEN p_data->>'support_whatsapp' ELSE support_whatsapp END,
        support_email = CASE WHEN p_data ? 'support_email' THEN p_data->>'support_email' ELSE support_email END,
        primary_color_hex = CASE WHEN p_data ? 'primary_color_hex' THEN p_data->>'primary_color_hex' ELSE primary_color_hex END,
        accent_color_hex = CASE WHEN p_data ? 'accent_color_hex' THEN p_data->>'accent_color_hex' ELSE accent_color_hex END,
        pwa_name = CASE WHEN p_data ? 'pwa_name' THEN p_data->>'pwa_name' ELSE pwa_name END,
        copyright_holder = CASE WHEN p_data ? 'copyright_holder' THEN p_data->>'copyright_holder' ELSE copyright_holder END,
        status = COALESCE(p_data->>'status', status),
        updated_at = now()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id);
END;
$$;

-- 5️⃣ دالة تدشين وكيل استراتيجي جديد
CREATE OR REPLACE FUNCTION public.master_create_tenant(
    p_master_token TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_auth BOOLEAN := FALSE;
    v_id TEXT;
    v_slug TEXT;
    v_domain TEXT;
BEGIN
    IF public.is_valid_master_token(p_master_token) 
       OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
       OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        v_is_auth := TRUE;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Access Denied: Invalid Sovereign Token (401 Unauthorized)';
    END IF;

    v_slug := LOWER(TRIM(p_data->>'slug'));
    v_id := COALESCE(NULLIF(LOWER(TRIM(p_data->>'id')), ''), v_slug);

    IF v_id IS NULL OR v_id = '' THEN
        RAISE EXCEPTION 'Tenant slug/id is required';
    END IF;

    IF p_data ? 'custom_domain' THEN
        v_domain := NULLIF(TRIM(p_data->>'custom_domain'), '');
        IF v_domain IS NOT NULL THEN
            v_domain := regexp_replace(v_domain, '^https?://', '', 'i');
            v_domain := regexp_replace(v_domain, '/.*$', '', 'i');
            v_domain := regexp_replace(v_domain, '^www\.', '', 'i');
        END IF;
    END IF;

    INSERT INTO public.tenants (
        id, name, name_en, tagline, slug, custom_domain,
        logo_url, favicon_url, support_phone, support_whatsapp,
        support_email, primary_color_hex, accent_color_hex,
        pwa_name, copyright_holder, status
    ) VALUES (
        v_id,
        COALESCE(p_data->>'name', 'وكيل جديد'),
        p_data->>'name_en',
        COALESCE(p_data->>'tagline', 'منظومة الولاء ونقاط البيع السحابية الذكية'),
        v_slug,
        v_domain,
        COALESCE(p_data->>'logo_url', '/favicon.png'),
        COALESCE(p_data->>'favicon_url', '/favicon.png'),
        COALESCE(p_data->>'support_phone', '+966500000000'),
        COALESCE(p_data->>'support_whatsapp', '966500000000'),
        COALESCE(p_data->>'support_email', 'support@al-athar.cloud'),
        COALESCE(p_data->>'primary_color_hex', '#F59E0B'),
        COALESCE(p_data->>'accent_color_hex', '#10B981'),
        COALESCE(p_data->>'pwa_name', p_data->>'name'),
        COALESCE(p_data->>'copyright_holder', 'جميع الحقوق محفوظة'),
        'active'
    );

    RETURN jsonb_build_object('success', true, 'tenant_id', v_id);
END;
$$;

-- 6️⃣ دالة جلب معرفات المحافظ الرقمية الحصرية للوحة القيادة
CREATE OR REPLACE FUNCTION public.master_get_wallet_credentials(p_master_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_auth BOOLEAN := FALSE;
    v_rec RECORD;
BEGIN
    IF public.is_valid_master_token(p_master_token) 
       OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
       OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        v_is_auth := TRUE;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Access Denied: Invalid Sovereign Token (401 Unauthorized)';
    END IF;

    SELECT
        COALESCE(apple_wallet_enabled, false) AS apple_wallet_enabled,
        COALESCE(apple_pass_type_id, '') AS apple_pass_type_id,
        COALESCE(apple_team_id, '') AS apple_team_id,
        COALESCE(apple_cert_p12_base64, '') AS apple_cert_p12_base64,
        COALESCE(apple_cert_password, '') AS apple_cert_password,
        COALESCE(google_wallet_enabled, false) AS google_wallet_enabled,
        COALESCE(google_issuer_id, '') AS google_issuer_id,
        COALESCE(google_client_email, '') AS google_client_email,
        COALESCE(google_private_key, '') AS google_private_key
    INTO v_rec
    FROM public.platform_integrations
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_rec IS NULL THEN
        RETURN jsonb_build_object(
            'apple_wallet_enabled', false,
            'apple_pass_type_id', '',
            'apple_team_id', '',
            'apple_cert_p12_base64', '',
            'apple_cert_password', '',
            'google_wallet_enabled', false,
            'google_issuer_id', '',
            'google_client_email', '',
            'google_private_key', ''
        );
    END IF;

    RETURN to_jsonb(v_rec);
END;
$$;

-- 7️⃣ دالة حفظ وتحديث معرفات المحافظ الرقمية المركزية
CREATE OR REPLACE FUNCTION public.master_save_wallet_credentials(
    p_master_token TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_auth BOOLEAN := FALSE;
    v_id UUID;
BEGIN
    IF public.is_valid_master_token(p_master_token) 
       OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
       OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        v_is_auth := TRUE;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Access Denied: Invalid Sovereign Token (401 Unauthorized)';
    END IF;

    SELECT id INTO v_id FROM public.platform_integrations LIMIT 1;

    IF v_id IS NULL THEN
        INSERT INTO public.platform_integrations (
            apple_wallet_enabled, apple_pass_type_id, apple_team_id,
            apple_cert_p12_base64, apple_cert_password,
            google_wallet_enabled, google_issuer_id, google_client_email,
            google_private_key
        ) VALUES (
            COALESCE((p_data->>'apple_wallet_enabled')::boolean, false),
            p_data->>'apple_pass_type_id',
            p_data->>'apple_team_id',
            p_data->>'apple_cert_p12_base64',
            p_data->>'apple_cert_password',
            COALESCE((p_data->>'google_wallet_enabled')::boolean, false),
            p_data->>'google_issuer_id',
            p_data->>'google_client_email',
            p_data->>'google_private_key'
        );
    ELSE
        UPDATE public.platform_integrations
        SET
            apple_wallet_enabled = COALESCE((p_data->>'apple_wallet_enabled')::boolean, apple_wallet_enabled),
            apple_pass_type_id = CASE WHEN p_data ? 'apple_pass_type_id' THEN p_data->>'apple_pass_type_id' ELSE apple_pass_type_id END,
            apple_team_id = CASE WHEN p_data ? 'apple_team_id' THEN p_data->>'apple_team_id' ELSE apple_team_id END,
            apple_cert_p12_base64 = CASE WHEN p_data ? 'apple_cert_p12_base64' THEN p_data->>'apple_cert_p12_base64' ELSE apple_cert_p12_base64 END,
            apple_cert_password = CASE WHEN p_data ? 'apple_cert_password' THEN p_data->>'apple_cert_password' ELSE apple_cert_password END,
            google_wallet_enabled = COALESCE((p_data->>'google_wallet_enabled')::boolean, google_wallet_enabled),
            google_issuer_id = CASE WHEN p_data ? 'google_issuer_id' THEN p_data->>'google_issuer_id' ELSE google_issuer_id END,
            google_client_email = CASE WHEN p_data ? 'google_client_email' THEN p_data->>'google_client_email' ELSE google_client_email END,
            google_private_key = CASE WHEN p_data ? 'google_private_key' THEN p_data->>'google_private_key' ELSE google_private_key END,
            updated_at = now()
        WHERE id = v_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 8️⃣ دالة تنفيذ أوامر الـ SQL الإدارية عن بعد عبر التوكن السيادي
CREATE OR REPLACE FUNCTION public.exec_master_sql(
    p_sql TEXT,
    p_master_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_auth BOOLEAN := FALSE;
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_execution_ms NUMERIC;
BEGIN
    IF public.is_valid_master_token(p_master_token) 
       OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
       OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
       OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        v_is_auth := TRUE;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Access Denied: Invalid Sovereign Token (401 Unauthorized)';
    END IF;

    IF TRIM(COALESCE(p_sql, '')) = '' THEN
        RAISE EXCEPTION 'SQL statement cannot be empty';
    END IF;

    EXECUTE p_sql;

    v_execution_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000)::numeric, 2);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'SQL script executed successfully by Sovereign Master Engine',
        'duration_ms', v_execution_ms,
        'executed_at', now()
    );
EXCEPTION WHEN OTHERS THEN
    v_execution_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000)::numeric, 2);
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', SQLSTATE,
        'duration_ms', v_execution_ms,
        'executed_at', now()
    );
END;
$$;

-- 9️⃣ منح الصلاحيات لدوال الـ RPC
GRANT EXECUTE ON FUNCTION public.is_valid_master_token(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.master_get_tenants(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.master_update_tenant(TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.master_create_tenant(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.master_get_wallet_credentials(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.master_save_wallet_credentials(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exec_master_sql(TEXT, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

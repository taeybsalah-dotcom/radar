-- ==============================================================================
-- 🛡️ RADAR PLATFORM ENGINE — MIGRATION 20261031_SUPER_ADMIN_ROLES_AND_PERMISSIONS
-- Purpose:
--   1. Add roles and granular permissions to super_admin_users.
--   2. Enable platform owner to invite/manage sub-admins with specific privileges.
--   3. Secure RPCs for team management and session verification.
-- ==============================================================================

-- 1. Ensure required extensions exist
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Extend super_admin_users table schema
ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'platform_manager';

ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.super_admin_users 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 3. Upgrade existing primary super admin records with full owner permissions
UPDATE public.super_admin_users
SET role = 'super_admin',
    permissions = jsonb_build_object(
        'can_manage_stores', true,
        'can_delete_stores', true,
        'can_manage_billing', true,
        'can_view_financials', true,
        'can_manage_partners', true,
        'can_send_notifications', true,
        'can_manage_admins', true,
        'can_reset_platform', true
    )
WHERE role IS NULL OR role = 'super_admin' OR permissions = '{}'::jsonb;

-- 4. Helper function to check granular super admin permissions
CREATE OR REPLACE FUNCTION public.has_super_admin_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid UUID;
    v_role TEXT;
    v_perms JSONB;
BEGIN
    -- Context A: service_role execution (backend tasks)
    IF auth.role() = 'service_role' OR current_user = 'service_role' THEN
        RETURN TRUE;
    END IF;

    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT role, permissions INTO v_role, v_perms
    FROM public.super_admin_users
    WHERE user_id = v_uid AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        -- Fallback: check JWT metadata
        IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' 
           OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE THEN
            RETURN TRUE;
        END IF;
        RETURN FALSE;
    END IF;

    -- Platform owner / super_admin always has all permissions
    IF v_role = 'super_admin' THEN
        RETURN TRUE;
    END IF;

    -- Check specific permission key
    IF v_perms IS NOT NULL AND (v_perms ->> p_permission)::boolean IS TRUE THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_super_admin_permission(TEXT) TO anon, authenticated, service_role;

-- 5. Updated session verification RPC returning role & permissions
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
    v_perms JSONB;
    v_role TEXT;
BEGIN
    v_is_super := public.is_super_admin();
    
    IF NOT v_is_super THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'is_super_admin', false,
            'error', 'UNAUTHORIZED',
            'message', 'الحساب الحالي غير مصرح له بإدارة المنصة'
        );
    END IF;

    v_uid := auth.uid();
    v_email := LOWER(COALESCE(auth.jwt() ->> 'email', 'service_role'));

    -- Find matching super_admin_users record
    SELECT * INTO v_admin
    FROM public.super_admin_users
    WHERE (user_id = v_uid OR LOWER(email) = v_email) AND is_active = true
    LIMIT 1;

    -- Update last login timestamp
    IF v_admin.id IS NOT NULL THEN
        UPDATE public.super_admin_users
        SET last_login_at = now()
        WHERE id = v_admin.id;
    END IF;

    v_role := COALESCE(v_admin.role, 'super_admin');

    -- Build permissions map
    IF v_role = 'super_admin' THEN
        v_perms := jsonb_build_object(
            'can_manage_stores', true,
            'can_delete_stores', true,
            'can_manage_billing', true,
            'can_view_financials', true,
            'can_manage_partners', true,
            'can_send_notifications', true,
            'can_manage_admins', true,
            'can_reset_platform', true
        );
    ELSE
        v_perms := jsonb_build_object(
            'can_manage_stores', COALESCE((v_admin.permissions ->> 'can_manage_stores')::boolean, true),
            'can_delete_stores', COALESCE((v_admin.permissions ->> 'can_delete_stores')::boolean, false),
            'can_manage_billing', COALESCE((v_admin.permissions ->> 'can_manage_billing')::boolean, false),
            'can_view_financials', COALESCE((v_admin.permissions ->> 'can_view_financials')::boolean, false),
            'can_manage_partners', COALESCE((v_admin.permissions ->> 'can_manage_partners')::boolean, false),
            'can_send_notifications', COALESCE((v_admin.permissions ->> 'can_send_notifications')::boolean, false),
            'can_manage_admins', COALESCE((v_admin.permissions ->> 'can_manage_admins')::boolean, false),
            'can_reset_platform', COALESCE((v_admin.permissions ->> 'can_reset_platform')::boolean, false)
        );
    END IF;

    RETURN jsonb_build_object(
        'authenticated', true,
        'is_super_admin', true,
        'user_id', v_uid,
        'admin_id', v_admin.id,
        'email', COALESCE(v_admin.email, v_email),
        'full_name', COALESCE(v_admin.full_name, 'مدير المنصة'),
        'phone', v_admin.phone,
        'role', v_role,
        'permissions', v_perms,
        'is_active', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_super_admin_session() TO anon, authenticated, service_role;

-- 6. RPC: Retrieve list of all platform admins
CREATE OR REPLACE FUNCTION public.get_super_admin_team()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    email TEXT,
    full_name TEXT,
    phone TEXT,
    role TEXT,
    permissions JSONB,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض فريق الإدارة';
    END IF;

    RETURN QUERY
    SELECT 
        s.id,
        s.user_id,
        s.email,
        s.full_name,
        s.phone,
        COALESCE(s.role, 'super_admin') as role,
        COALESCE(s.permissions, '{}'::jsonb) as permissions,
        s.is_active,
        s.created_at,
        s.last_login_at
    FROM public.super_admin_users s
    ORDER BY 
        CASE WHEN s.role = 'super_admin' THEN 1 ELSE 2 END,
        s.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_super_admin_team() TO authenticated, service_role;

-- 7. RPC: Create a new platform manager/sub-admin
CREATE OR REPLACE FUNCTION public.create_super_admin_manager(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_phone TEXT DEFAULT NULL,
    p_role TEXT DEFAULT 'platform_manager',
    p_permissions JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_new_uid UUID;
    v_encrypted_pw TEXT;
    v_target_email TEXT;
    v_clean_phone TEXT;
BEGIN
    -- Verify caller permission
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.super_admin_users WHERE user_id = v_caller_uid AND is_active = true;
        IF v_caller_role <> 'super_admin' AND NOT public.has_super_admin_permission('can_manage_admins') THEN
            RAISE EXCEPTION 'ليس لديك صلاحية لإضافة مدراء جدد';
        END IF;
    END IF;

    v_target_email := LOWER(TRIM(p_email));
    IF v_target_email IS NULL OR v_target_email = '' THEN
        RAISE EXCEPTION 'البريد الإلكتروني مطلوب';
    END IF;

    IF p_password IS NULL OR length(p_password) < 6 THEN
        RAISE EXCEPTION 'كلمة المرور يجب أن لا تقل عن 6 أحرف';
    END IF;

    v_clean_phone := NULLIF(TRIM(p_phone), '');

    -- Encrypt password using pgcrypto blowfish
    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    -- Check if user already exists in auth.users
    SELECT id INTO v_new_uid FROM auth.users WHERE LOWER(email) = v_target_email;

    IF v_new_uid IS NULL THEN
        v_new_uid := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_new_uid,
            'authenticated',
            'authenticated',
            v_target_email,
            v_encrypted_pw,
            now(),
            jsonb_build_object(
                'provider', 'email',
                'providers', array['email'],
                'role', 'super_admin',
                'is_super_admin', true
            ),
            jsonb_build_object(
                'full_name', p_full_name,
                'role', p_role,
                'phone', v_clean_phone
            ),
            now(),
            now()
        );
    ELSE
        -- Update password and metadata for existing auth user
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            raw_app_meta_data = raw_app_meta_data || '{"role": "super_admin", "is_super_admin": true}'::jsonb,
            raw_user_meta_data = raw_user_meta_data || jsonb_build_object('full_name', p_full_name, 'role', p_role, 'phone', v_clean_phone),
            updated_at = now()
        WHERE id = v_new_uid;
    END IF;

    -- Upsert in super_admin_users
    INSERT INTO public.super_admin_users (
        user_id,
        email,
        full_name,
        phone,
        role,
        permissions,
        is_active,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_new_uid,
        v_target_email,
        p_full_name,
        v_clean_phone,
        COALESCE(p_role, 'platform_manager'),
        COALESCE(p_permissions, '{}'::jsonb),
        true,
        v_caller_uid,
        now(),
        now()
    )
    ON CONFLICT (email) DO UPDATE
    SET user_id = v_new_uid,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        permissions = EXCLUDED.permissions,
        is_active = true,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_new_uid,
        'email', v_target_email,
        'message', 'تمت إضافة المدير بنجاح وتفعيل حسابه'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_super_admin_manager(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- 8. RPC: Update existing platform manager's permissions or profile
CREATE OR REPLACE FUNCTION public.update_super_admin_manager(
    p_admin_id UUID,
    p_full_name TEXT,
    p_phone TEXT,
    p_role TEXT,
    p_permissions JSONB,
    p_is_active BOOLEAN,
    p_new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_target RECORD;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.super_admin_users WHERE user_id = v_caller_uid AND is_active = true;
        IF v_caller_role <> 'super_admin' AND NOT public.has_super_admin_permission('can_manage_admins') THEN
            RAISE EXCEPTION 'ليس لديك صلاحية لتعديل بيانات المدراء';
        END IF;
    END IF;

    SELECT * INTO v_target FROM public.super_admin_users WHERE id = p_admin_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'المدير غير موجود';
    END IF;

    -- Protect primary super_admin from demotion or deactivation
    IF v_target.role = 'super_admin' AND p_role <> 'super_admin' THEN
        RAISE EXCEPTION 'لا يمكن تغيير رتبة مالك المنصة الأساسي';
    END IF;

    IF v_target.role = 'super_admin' AND p_is_active IS FALSE THEN
        RAISE EXCEPTION 'لا يمكن تجميد حساب مالك المنصة الأساسي';
    END IF;

    UPDATE public.super_admin_users
    SET full_name = COALESCE(p_full_name, full_name),
        phone = NULLIF(TRIM(p_phone), ''),
        role = COALESCE(p_role, role),
        permissions = COALESCE(p_permissions, permissions),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = now()
    WHERE id = p_admin_id;

    -- If password update requested
    IF p_new_password IS NOT NULL AND length(trim(p_new_password)) >= 6 THEN
        UPDATE auth.users
        SET encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
            updated_at = now()
        WHERE id = v_target.user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث بيانات وصلاحيات المدير بنجاح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_super_admin_manager(UUID, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT) TO authenticated, service_role;

-- 9. RPC: Delete a platform manager
CREATE OR REPLACE FUNCTION public.delete_super_admin_manager(p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_target RECORD;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.super_admin_users WHERE user_id = v_caller_uid AND is_active = true;
        IF v_caller_role <> 'super_admin' AND NOT public.has_super_admin_permission('can_manage_admins') THEN
            RAISE EXCEPTION 'ليس لديك صلاحية لحذف المدراء';
        END IF;
    END IF;

    SELECT * INTO v_target FROM public.super_admin_users WHERE id = p_admin_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'المدير غير موجود';
    END IF;

    -- Prevent self-deletion and super_admin deletion
    IF v_target.user_id = v_caller_uid THEN
        RAISE EXCEPTION 'لا يمكنك حذف حسابك الحالي';
    END IF;

    IF v_target.role = 'super_admin' THEN
        RAISE EXCEPTION 'لا يمكن حذف حساب مالك المنصة الأساسي';
    END IF;

    -- Delete from super_admin_users
    DELETE FROM public.super_admin_users WHERE id = p_admin_id;

    -- Delete from auth.users
    IF v_target.user_id IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = v_target.user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'تم حذف المدير وسحب صلاحياته بنجاح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_super_admin_manager(UUID) TO authenticated, service_role;

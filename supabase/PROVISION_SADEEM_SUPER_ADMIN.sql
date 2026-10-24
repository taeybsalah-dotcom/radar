-- ==============================================================================
-- 🔐 SADEEM AL-ATHAR: PROVISION SUPER ADMIN USER SECURELY IN SUPABASE
-- Run this script inside Supabase SQL Editor for project `sadim-alathir`
-- ==============================================================================

-- 1. Ensure extensions and admin tables exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.super_admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Verify Super Admin Functions
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() = 'service_role' OR current_user = 'service_role' THEN
        RETURN TRUE;
    END IF;
    IF (auth.jwt() -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin') THEN
        RETURN TRUE;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.super_admin_users
        WHERE user_id = auth.uid() AND is_active = true
    ) THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_super_admin_session()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RETURN jsonb_build_object('authenticated', false, 'is_super_admin', false);
    END IF;
    RETURN jsonb_build_object(
        'authenticated', true,
        'is_super_admin', true,
        'user_id', auth.uid(),
        'email', COALESCE(auth.jwt() ->> 'email', 'admin@sadim.com'),
        'role', 'super_admin'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_super_admin_session() TO anon, authenticated, service_role;

-- 3. Create or Update Super Admin Auth User Securely (Hashed with bcrypt, never plain text in logs)
DO $$
DECLARE
    v_user_id UUID;
    v_target_email TEXT := 'admin@sadim.com';
    v_target_pass TEXT := 'Sa544911944@Sa';
    v_encrypted_pw TEXT;
BEGIN
    v_encrypted_pw := crypt(v_target_pass, gen_salt('bf'));

    SELECT id INTO v_user_id FROM auth.users WHERE email = v_target_email;

    IF v_user_id IS NULL THEN
        -- Insert new user
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
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            v_target_email,
            v_encrypted_pw,
            now(),
            '{"provider": "email", "providers": ["email"], "role": "super_admin", "is_super_admin": true}'::jsonb,
            '{"full_name": "إدارة سديم الأثر", "role": "super_admin"}'::jsonb,
            now(),
            now()
        ) RETURNING id INTO v_user_id;
    ELSE
        -- Update existing user password and confirmed status
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            raw_app_meta_data = raw_app_meta_data || '{"role": "super_admin", "is_super_admin": true}'::jsonb,
            raw_user_meta_data = raw_user_meta_data || '{"role": "super_admin"}'::jsonb,
            updated_at = now()
        WHERE id = v_user_id;
    END IF;

    -- Add to super_admin_users registry
    INSERT INTO public.super_admin_users (user_id, email, full_name, is_active)
    VALUES (v_user_id, v_target_email, 'إدارة سديم الأثر', true)
    ON CONFLICT (email) DO UPDATE 
    SET user_id = v_user_id, is_active = true, updated_at = now();

END $$;

-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — MIGRATION 20261008_SEC01
-- SUPER ADMIN SERVER-SIDE AUTHENTICATION & RLS SECURITY HARDENING
-- Purpose:
--   1. Enforce Server-Side identity verification for Platform Owner / Super Admin.
--   2. Restrict access to sensitive tables (financial_ledger, merchant_leads, etc.)
--      via strict Row Level Security (RLS) bound to authenticated JWT claims.
--   3. Eliminate client-side master PIN bypass vulnerability.
-- ==============================================================================

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. Super Admin Registry Table
-- ==============================================================================
-- Keeps track of authorized Super Admin user accounts in Supabase Auth
CREATE TABLE IF NOT EXISTS public.super_admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for instant lookup by auth.uid()
CREATE INDEX IF NOT EXISTS idx_super_admin_users_uid ON public.super_admin_users(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_super_admin_users_email ON public.super_admin_users(email);

-- ==============================================================================
-- 3. Core Helper Function: is_super_admin()
-- ==============================================================================
-- Server-side evaluator that checks whether the current execution context
-- represents an authenticated Super Admin.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_jwt JSONB;
    v_uid UUID;
BEGIN
    -- Context A: service_role execution (Server backend / migrations / admin scripts)
    v_role := auth.role();
    IF v_role = 'service_role' OR current_user = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- Context B: Inspect JWT claims
    v_jwt := auth.jwt();
    IF v_jwt IS NOT NULL THEN
        -- B.1. Direct role in app_metadata
        IF (v_jwt -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin') THEN
            RETURN TRUE;
        END IF;

        -- B.2. Explicit boolean flags in metadata
        IF (v_jwt -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
           OR (v_jwt -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE THEN
            RETURN TRUE;
        END IF;

        -- B.3. Verified entry in super_admin_users table
        v_uid := auth.uid();
        IF v_uid IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.super_admin_users
                WHERE user_id = v_uid AND is_active = true
            ) THEN
                RETURN TRUE;
            END IF;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

-- Grant execution to authenticated & service_role
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;

-- ==============================================================================
-- 4. Session Verification RPC: verify_super_admin_session()
-- ==============================================================================
-- Called by the frontend on mount to verify that the active JWT session is
-- recognized as an authorized Super Admin by the backend.
CREATE OR REPLACE FUNCTION public.verify_super_admin_session()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_super BOOLEAN;
    v_email TEXT;
    v_uid UUID;
BEGIN
    v_is_super := public.is_super_admin();
    
    IF NOT v_is_super THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'is_super_admin', false,
            'error', 'UNAUTHORIZED',
            'message', 'الحساب الحالي غير مصرح له بصلاحيات مالك المنصة'
        );
    END IF;

    v_uid := auth.uid();
    v_email := COALESCE(auth.jwt() ->> 'email', 'service_role');

    RETURN jsonb_build_object(
        'authenticated', true,
        'is_super_admin', true,
        'user_id', v_uid,
        'email', v_email,
        'role', 'super_admin'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_super_admin_session() TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. Row Level Security (RLS) Hardening on Sensitive Tables
-- ==============================================================================

-- [A] super_admin_users Table
ALTER TABLE public.super_admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin Users Access" ON public.super_admin_users;
CREATE POLICY "SuperAdmin Users Access"
ON public.super_admin_users
FOR ALL
TO authenticated
USING (public.is_super_admin() OR user_id = auth.uid())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Service Role SuperAdmin Users Access" ON public.super_admin_users;
CREATE POLICY "Service Role SuperAdmin Users Access"
ON public.super_admin_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- [B] financial_ledger Table (Absolute Protection)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'financial_ledger') THEN
        EXECUTE 'ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "SuperAdmin Full Ledger Access" ON public.financial_ledger';
        EXECUTE 'CREATE POLICY "SuperAdmin Full Ledger Access" ON public.financial_ledger FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())';
        EXECUTE 'DROP POLICY IF EXISTS "Service Role Full Ledger Access" ON public.financial_ledger';
        EXECUTE 'CREATE POLICY "Service Role Full Ledger Access" ON public.financial_ledger FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- [C] merchant_leads Table (Marketing & Pipeline Protection)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'merchant_leads') THEN
        EXECUTE 'ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "SuperAdmin Full Leads Access" ON public.merchant_leads';
        EXECUTE 'CREATE POLICY "SuperAdmin Full Leads Access" ON public.merchant_leads FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())';
        EXECUTE 'DROP POLICY IF EXISTS "Service Role Full Leads Access" ON public.merchant_leads';
        EXECUTE 'CREATE POLICY "Service Role Full Leads Access" ON public.merchant_leads FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

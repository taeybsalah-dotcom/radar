-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - ROLLBACK: PART 3
-- File: 20261101_tenant_isolation_part3_rollback.sql
-- Date: 2026-11-01
-- Goal: Safely drop RLS policies created in part 3
-- ==============================================================================

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

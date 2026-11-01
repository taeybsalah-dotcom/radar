-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - ROLLBACK: PART 4
-- File: 20261101_tenant_isolation_part4_rollback.sql
-- Date: 2026-11-01
-- Goal: Safely drop RPCs created in part 4
-- ==============================================================================

DROP FUNCTION IF EXISTS public.master_restore_super_admin(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_tenant_branding_by_domain(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_billing_plans(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.seed_tenant_default_bonus_rules(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.exec_master_sql(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.is_valid_master_token(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_active_tenant_by_domain(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_all_partner_financial_summaries(UUID, TEXT) CASCADE;

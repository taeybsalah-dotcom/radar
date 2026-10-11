-- ==============================================================================
-- 🔄 ROLLBACK SCRIPT FOR MIGRATION 20261012_SEC03
-- Purpose:
--   Disables RLS on the 11 tables and restores previous state if needed.
-- ==============================================================================

-- 1. Disable RLS on all 11 tables
ALTER TABLE IF EXISTS public.billing_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.catalog_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_specialists DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.affiliates DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_commissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_bonus_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_bonus_awards DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_targets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_audit_logs DISABLE ROW LEVEL SECURITY;

-- 2. Drop any added helper RPC functions
DROP FUNCTION IF EXISTS public.check_referral_code(text);
DROP FUNCTION IF EXISTS public.change_partner_pin(uuid, text, text);
DROP FUNCTION IF EXISTS public.verify_partner_login(text, text);

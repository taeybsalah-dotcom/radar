-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - ROLLBACK: PART 5
-- File: 20261101_tenant_isolation_part5_rollback.sql
-- Date: 2026-11-01
-- Goal: Safely drop storefront RPCs created in part 5
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_public_customer_coupons(UUID, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_customer_profile(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.submit_merchant_lead_rpc(JSONB, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.verify_partner_referral_code(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_store_branches(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_store_specialists(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_catalog_items(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_store_by_slug(TEXT) CASCADE;

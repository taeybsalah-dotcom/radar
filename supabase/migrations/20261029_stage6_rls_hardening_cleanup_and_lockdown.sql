-- ==============================================================================
-- MIGRATION: Stage 6 - Full RLS Security Hardening, Sanitization & Lockdown
-- Platform: Sadim Al-Athir (kspfiijorengpckdlymx)
-- STRICT RED LINE: NEVER EXECUTE AGAINST RADAR MOTHER PLATFORM (zagpvflyizbmzsbmhnts)
-- ==============================================================================

-- ==============================================================================
-- 1. SECURING AUTH RATE LIMITS
-- ==============================================================================
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_rate_limits_service_role ON public.auth_rate_limits;
CREATE POLICY auth_rate_limits_service_role ON public.auth_rate_limits
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 2. SECURING STORE STAFF (ELIMINATING PIN & STAFF LEAK)
-- ==============================================================================
DROP POLICY IF EXISTS store_staff_lookup ON public.store_staff;
DROP POLICY IF EXISTS store_staff_select_policy ON public.store_staff;
DROP POLICY IF EXISTS store_staff_select_staff_token ON public.store_staff;

CREATE POLICY store_staff_select_staff_token ON public.store_staff
    FOR SELECT TO anon, authenticated
    USING (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    );

-- Revoke direct column reading of pin_code from anon and authenticated
REVOKE SELECT (pin_code) ON public.store_staff FROM anon, authenticated;

-- ==============================================================================
-- 3. SECURING STORE BRANCHES (CLOSING ANONYMOUS INSERTS & UPDATES)
-- ==============================================================================
DROP POLICY IF EXISTS store_branches_insert_policy ON public.store_branches;
DROP POLICY IF EXISTS store_branches_update_policy ON public.store_branches;
DROP POLICY IF EXISTS store_branches_insert_staff_token ON public.store_branches;

CREATE POLICY store_branches_insert_staff_token ON public.store_branches
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        public.has_valid_staff_access(store_id, true)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    );

-- Keep store_branches_select_policy active for public customer menu / branch discovery
DROP POLICY IF EXISTS store_branches_select_policy ON public.store_branches;
CREATE POLICY store_branches_select_policy ON public.store_branches
    FOR SELECT TO anon, authenticated
    USING (true);

-- ==============================================================================
-- 4. SECURING STORE TABLES (CLOSING WIDE-OPEN WRITE POLICY)
-- ==============================================================================
DROP POLICY IF EXISTS "Public read/write access" ON public.store_tables;
DROP POLICY IF EXISTS store_tables_select ON public.store_tables;
DROP POLICY IF EXISTS store_tables_staff_manage ON public.store_tables;

-- Allow public read for QR codes & menu ordering
CREATE POLICY store_tables_select ON public.store_tables
    FOR SELECT TO anon, authenticated
    USING (true);

-- Restrict write/manage to authenticated staff or super admin
CREATE POLICY store_tables_staff_manage ON public.store_tables
    FOR ALL TO anon, authenticated
    USING (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    )
    WITH CHECK (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    );

-- ==============================================================================
-- 5. SECURING WALLET PASS CONFIGS (CLOSING WIDE-OPEN WRITE POLICY)
-- ==============================================================================
DROP POLICY IF EXISTS "Store Staff Manage Pass Config" ON public.store_wallet_pass_configs;
DROP POLICY IF EXISTS store_wallet_pass_manage_staff ON public.store_wallet_pass_configs;

CREATE POLICY store_wallet_pass_manage_staff ON public.store_wallet_pass_configs
    FOR ALL TO anon, authenticated
    USING (
        public.has_valid_staff_access(store_id, true)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    )
    WITH CHECK (
        public.has_valid_staff_access(store_id, true)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    );

-- ==============================================================================
-- 6. SECURING DRIVER SETTLEMENTS & STORE DRIVERS
-- ==============================================================================
DROP POLICY IF EXISTS driver_settlements_insert_policy ON public.driver_settlements;
DROP POLICY IF EXISTS driver_settlements_update_policy ON public.driver_settlements;
DROP POLICY IF EXISTS driver_settlements_delete_policy ON public.driver_settlements;
DROP POLICY IF EXISTS driver_settlements_select_policy ON public.driver_settlements;

CREATE POLICY driver_settlements_staff_manage ON public.driver_settlements
    FOR ALL TO anon, authenticated
    USING (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    )
    WITH CHECK (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS store_drivers_insert_policy ON public.store_drivers;
DROP POLICY IF EXISTS store_drivers_update_policy ON public.store_drivers;
DROP POLICY IF EXISTS store_drivers_delete_policy ON public.store_drivers;
DROP POLICY IF EXISTS store_drivers_staff_manage ON public.store_drivers;

CREATE POLICY store_drivers_staff_manage ON public.store_drivers
    FOR ALL TO anon, authenticated
    USING (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    )
    WITH CHECK (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    );

-- ==============================================================================
-- 7. SECURING INVENTORY, RECIPES & SUPPLIER INVOICES
-- ==============================================================================
DROP POLICY IF EXISTS store_inventory_insert_policy ON public.store_inventory;
DROP POLICY IF EXISTS store_inventory_update_policy ON public.store_inventory;
DROP POLICY IF EXISTS store_inventory_delete_policy ON public.store_inventory;
DROP POLICY IF EXISTS store_inventory_staff_manage ON public.store_inventory;

CREATE POLICY store_inventory_staff_manage ON public.store_inventory
    FOR ALL TO anon, authenticated
    USING (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    )
    WITH CHECK (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS store_recipes_insert_policy ON public.store_recipes;
DROP POLICY IF EXISTS store_recipes_update_policy ON public.store_recipes;
DROP POLICY IF EXISTS store_recipes_delete_policy ON public.store_recipes;
DROP POLICY IF EXISTS store_recipes_staff_manage ON public.store_recipes;

CREATE POLICY store_recipes_staff_manage ON public.store_recipes
    FOR ALL TO anon, authenticated
    USING (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    )
    WITH CHECK (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS supplier_invoices_insert_policy ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_update_policy ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_delete_policy ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_staff_manage ON public.supplier_invoices;

CREATE POLICY supplier_invoices_staff_manage ON public.supplier_invoices
    FOR ALL TO anon, authenticated
    USING (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    )
    WITH CHECK (
        public.has_valid_staff_access(store_id, false)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
    );

-- ==============================================================================
-- 8. DATA SANITIZATION (CLEANING ARTIFACTS WHILE PRESERVING AUDIT LOGS)
-- ==============================================================================
-- Clean test orders and shifts from test stores
DELETE FROM public.store_orders WHERE store_id IN (
    SELECT id FROM public.stores WHERE name ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.pos_shifts WHERE store_id IN (
    SELECT id FROM public.stores WHERE name ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.pos_cash_movements WHERE store_id IN (
    SELECT id FROM public.stores WHERE name ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.pos_refunds WHERE store_id IN (
    SELECT id FROM public.stores WHERE name ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.store_staff WHERE store_id IN (
    SELECT id FROM public.stores WHERE name ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.store_branches WHERE store_id IN (
    SELECT id FROM public.stores WHERE name ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.store_tables WHERE store_id IN (
    SELECT id FROM public.stores WHERE name ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.catalog_items WHERE store_id IN (
    SELECT id FROM public.stores WHERE name ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.merchant_subscriptions WHERE store_id IN (
    SELECT id FROM public.stores WHERE name ILIKE '%test%' OR slug ILIKE '%test%'
);

-- Delete test stores (preserving dr-batatas and sadim-demo-store)
DELETE FROM public.stores 
WHERE (name ILIKE '%test%' OR slug ILIKE '%test%')
  AND slug NOT IN ('dr-batatas', 'sadim-demo-store');

-- Delete child references for test affiliates
DELETE FROM public.referrals WHERE affiliate_id IN (
    SELECT id FROM public.affiliates WHERE referral_code ILIKE '%test%' OR name ILIKE '%test%'
);
DELETE FROM public.partner_targets WHERE partner_account_id IN (
    SELECT id FROM public.partner_accounts WHERE referral_code ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.affiliate_payouts WHERE affiliate_id IN (
    SELECT id::text FROM public.affiliates WHERE referral_code ILIKE '%test%' OR name ILIKE '%test%'
);
DELETE FROM public.partner_commissions WHERE partner_account_id IN (
    SELECT id FROM public.partner_accounts WHERE referral_code ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.partner_bonus_awards WHERE partner_account_id IN (
    SELECT id FROM public.partner_accounts WHERE referral_code ILIKE '%test%' OR slug ILIKE '%test%'
);
DELETE FROM public.partner_accounts WHERE referral_code ILIKE '%test%' OR slug ILIKE '%test%';
DELETE FROM public.affiliates WHERE referral_code ILIKE '%test%' OR name ILIKE '%test%';

-- Delete test leads
DELETE FROM public.merchant_leads WHERE store_name ILIKE '%test%' OR phone LIKE '5000%' OR phone LIKE '5111%';

-- Delete test customers
DELETE FROM public.customer_coupons WHERE customer_id IN (
    SELECT id FROM public.store_customers WHERE name ILIKE '%test%' OR phone LIKE '5000%' OR phone LIKE '5111%' OR phone LIKE '5999%'
);
DELETE FROM public.store_customers WHERE name ILIKE '%test%' OR phone LIKE '5000%' OR phone LIKE '5111%' OR phone LIKE '5999%';

-- Drop test probe tables
DROP TABLE IF EXISTS public._test_probe CASCADE;
DROP TABLE IF EXISTS public._s5_probe CASCADE;

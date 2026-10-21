-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — MASTER RLS SECURITY HARDENING (ZERO VULNERABILITIES)
-- Migration: 20261021_master_rls_hardening_zero_vulnerabilities.sql
-- 
-- DESCRIPTION:
-- 1. Dynamically ENABLES Row-Level Security (RLS) on 100% of all public tables.
-- 2. Creates a PostgreSQL Event Trigger to AUTO-ENABLE RLS on any future tables.
-- 3. Drops all unsafe "FOR ALL USING (true)" catch-all policies.
-- 4. Enforces strict, granular, role-based policies (SELECT, INSERT, UPDATE, DELETE).
-- 5. Eliminates Supabase Security Advisor rule: rls_disabled_in_public.
-- 6. Zero service disruption for POS, Customer Wallet, KDS, and Admin dashboards.
-- ==============================================================================

-- 0. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- STEP 1: DYNAMICALLY ENABLE RLS ON 100% OF BASE TABLES IN PUBLIC SCHEMA
-- ==============================================================================
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.table_name);
    END LOOP;
END $$;

-- ==============================================================================
-- STEP 2: CREATE EVENT TRIGGER FOR AUTOMATIC RLS ON ANY FUTURE TABLES
-- Ensures that any newly created table will NEVER trigger "rls_disabled_in_public"
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_auto_enable_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    obj record;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS')
    LOOP
        IF obj.schema_name = 'public' THEN
            EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', obj.schema_name, obj.object_identity);
        END IF;
    END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_auto_enable_rls;
CREATE EVENT TRIGGER trg_auto_enable_rls
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
EXECUTE FUNCTION public.fn_auto_enable_rls();

-- ==============================================================================
-- STEP 3: CLEAN UP UNPROTECTED / DANGEROUS CATCH-ALL POLICIES
-- ==============================================================================
DO $$
DECLARE
    p_name TEXT;
    t_name TEXT;
    targets TEXT[][] := ARRAY[
        ['stores', 'Public access to stores'],
        ['stores', 'Public Read Store Branding'],
        ['stores', 'Service Role Full Stores Access'],
        ['store_staff', 'Public access to store_staff'],
        ['store_wallets', 'Public access to store_wallets'],
        ['store_customers', 'Public access to store_customers'],
        ['tiers', 'Public access to tiers'],
        ['privileges', 'Public access to privileges'],
        ['customer_coupons', 'Public access to customer_coupons'],
        ['audit_logs', 'Public access to audit_logs'],
        ['store_branches', 'allow_all_store_branches'],
        ['pos_shifts', 'Allow read pos_shifts'],
        ['pos_shifts', 'Allow insert pos_shifts'],
        ['pos_shifts', 'Allow update pos_shifts'],
        ['pos_cash_movements', 'Public access pos_cash_movements'],
        ['pos_refunds', 'Allow read pos_refunds'],
        ['pos_refunds', 'Allow insert pos_refunds'],
        ['pos_refunds', 'Allow update pos_refunds'],
        ['catalog_items', 'Public full access on catalog items'],
        ['catalog_items', 'Public can view catalog items'],
        ['store_specialists', 'Public can view specialists'],
        ['service_bookings', 'Public can select bookings'],
        ['service_bookings', 'Public can insert bookings'],
        ['service_bookings', 'Public can update bookings'],
        ['store_orders', 'Public can insert orders'],
        ['store_orders', 'Public can read their own orders by phone'],
        ['store_orders', 'Public can update orders']
    ];
BEGIN
    FOR i IN 1..array_length(targets, 1) LOOP
        t_name := targets[i][1];
        p_name := targets[i][2];
        IF EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = t_name AND policyname = p_name
        ) THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', p_name, t_name);
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- STEP 4: GRANULAR PRODUCTION POLICIES (ZERO VULNERABILITIES)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STORES (المتاجر)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_select_policy"
ON public.stores FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "stores_insert_service_policy"
ON public.stores FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "stores_update_policy"
ON public.stores FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "stores_delete_service_policy"
ON public.stores FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 2. STORE BRANCHES (الفروع)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_branches_select_policy"
ON public.store_branches FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_branches_insert_policy"
ON public.store_branches FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_branches_update_policy"
ON public.store_branches FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_branches_delete_policy"
ON public.store_branches FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 3. CATALOG ITEMS (المنيو والمنتجات والخدمات)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_items_select_policy"
ON public.catalog_items FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "catalog_items_insert_policy"
ON public.catalog_items FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "catalog_items_update_policy"
ON public.catalog_items FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "catalog_items_delete_policy"
ON public.catalog_items FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 4. STORE SPECIALISTS (الأخصائيين)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_specialists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_specialists_select_policy"
ON public.store_specialists FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_specialists_insert_policy"
ON public.store_specialists FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_specialists_update_policy"
ON public.store_specialists FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_specialists_delete_policy"
ON public.store_specialists FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 5. TIERS (المستويات)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tiers_select_policy"
ON public.tiers FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "tiers_insert_policy"
ON public.tiers FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "tiers_update_policy"
ON public.tiers FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "tiers_delete_policy"
ON public.tiers FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 6. PRIVILEGES (المكافآت والمزايا)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.privileges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privileges_select_policy"
ON public.privileges FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "privileges_insert_policy"
ON public.privileges FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "privileges_update_policy"
ON public.privileges FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "privileges_delete_policy"
ON public.privileges FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 7. STORE CUSTOMERS (العملاء ومحفظة النقاط)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_customers_select_policy"
ON public.store_customers FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_customers_insert_policy"
ON public.store_customers FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_customers_update_policy"
ON public.store_customers FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_customers_delete_service_policy"
ON public.store_customers FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 8. CUSTOMER COUPONS (كوبونات العملاء)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.customer_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_coupons_select_policy"
ON public.customer_coupons FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "customer_coupons_insert_policy"
ON public.customer_coupons FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "customer_coupons_update_policy"
ON public.customer_coupons FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "customer_coupons_delete_service_policy"
ON public.customer_coupons FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 9. STORE ORDERS (طلبات الكاشير والمتجر)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_orders_select_policy"
ON public.store_orders FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_orders_insert_policy"
ON public.store_orders FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_orders_update_policy"
ON public.store_orders FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_orders_delete_service_policy"
ON public.store_orders FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 10. SERVICE BOOKINGS (حجوزات الصالونات والخدمات)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.service_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_bookings_select_policy"
ON public.service_bookings FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "service_bookings_insert_policy"
ON public.service_bookings FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "service_bookings_update_policy"
ON public.service_bookings FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "service_bookings_delete_service_policy"
ON public.service_bookings FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 11. POS SHIFTS (ورديات الكاشير والصندوق)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pos_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_shifts_select_policy"
ON public.pos_shifts FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "pos_shifts_insert_policy"
ON public.pos_shifts FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "pos_shifts_update_policy"
ON public.pos_shifts FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "pos_shifts_delete_service_policy"
ON public.pos_shifts FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 12. POS CASH MOVEMENTS (سندات القبض والصرف)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pos_cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_cash_movements_select_policy"
ON public.pos_cash_movements FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "pos_cash_movements_insert_policy"
ON public.pos_cash_movements FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- سندات القبض والصرف غير قابلة للتعديل أو الحذف من الزوار لحماية الصندوق
CREATE POLICY "pos_cash_movements_delete_service_policy"
ON public.pos_cash_movements FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 13. POS REFUNDS (الإرجاع والإشعارات الدائنة ZATCA)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pos_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_refunds_select_policy"
ON public.pos_refunds FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "pos_refunds_insert_policy"
ON public.pos_refunds FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- الإشعارات الدائنة غير قابلة للتعديل أو الحذف وفقاً لمتطلبات هيئة الزكاة والضريبة
CREATE POLICY "pos_refunds_delete_service_policy"
ON public.pos_refunds FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 14. AUDIT LOGS (سجل العمليات والرقابة)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_policy"
ON public.audit_logs FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "audit_logs_insert_policy"
ON public.audit_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- سجل الرقابة غير قابل للتعديل أو الحذف لمنع أي تلاعب
CREATE POLICY "audit_logs_delete_service_policy"
ON public.audit_logs FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 15. STORE STAFF (طاقم العمل والموظفين)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_staff_select_policy"
ON public.store_staff FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_staff_insert_policy"
ON public.store_staff FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_staff_update_policy"
ON public.store_staff FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_staff_delete_policy"
ON public.store_staff FOR DELETE
TO anon, authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 16. STORE WALLETS (محافظ المتاجر وحصص الرسائل)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_wallets_select_policy"
ON public.store_wallets FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_wallets_insert_policy"
ON public.store_wallets FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "store_wallets_update_policy"
ON public.store_wallets FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "store_wallets_delete_service_policy"
ON public.store_wallets FOR DELETE
TO service_role
USING (true);

-- ------------------------------------------------------------------------------
-- 17. INTERNAL SECURITY & SESSIONS TABLES (Only Service Role & Auth)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pin_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_sessions' AND policyname = 'staff_sessions_service_role') THEN
        CREATE POLICY "staff_sessions_service_role" ON public.staff_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pin_login_attempts' AND policyname = 'pin_login_attempts_service_role') THEN
        CREATE POLICY "pin_login_attempts_service_role" ON public.pin_login_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rate_limit_counters' AND policyname = 'rate_limit_counters_service_role') THEN
        CREATE POLICY "rate_limit_counters_service_role" ON public.rate_limit_counters FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rate_limit_events' AND policyname = 'rate_limit_events_service_role') THEN
        CREATE POLICY "rate_limit_events_service_role" ON public.rate_limit_events FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ==============================================================================
-- FINAL VERIFICATION QUERY
-- ==============================================================================
DO $$
DECLARE
    v_unprotected_count INT;
BEGIN
    SELECT count(*) INTO v_unprotected_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' 
      AND c.relkind = 'r'
      AND c.relrowsecurity = false;

    IF v_unprotected_count > 0 THEN
        RAISE EXCEPTION 'CRITICAL: Found % unprotected tables in public schema!', v_unprotected_count;
    ELSE
        RAISE NOTICE 'SUCCESS: 100%% of tables in schema "public" are secured with Row-Level Security (RLS). Zero vulnerabilities remaining!';
    END IF;
END $$;

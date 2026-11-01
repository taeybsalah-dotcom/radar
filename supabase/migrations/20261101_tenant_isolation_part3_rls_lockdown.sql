-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - TENANT ISOLATION MIGRATION: PART 3
-- File: 20261101_tenant_isolation_part3_rls_lockdown.sql
-- Date: 2026-11-01
-- Goal: Purge existing policies on TARGET tables only, enable universal RLS,
--       enforce strict tenant isolation on operational tables (ZERO super admin bypass),
--       lock down sovereign tables to service_role, and provide verification audit query.
-- Mode: Idempotent, reversible
-- ==============================================================================

-- 1️⃣ جلب وحذف السياسات السابقة على مصفوفة الجداول المستهدفة فقط (منع الحذف العشوائي)
DO $$
DECLARE
    pol RECORD;
    target_tables TEXT[] := ARRAY[
        'stores', 'store_customers', 'tiers', 'privileges', 'catalog_items',
        'customer_coupons', 'pos_shifts', 'pos_cash_movements', 'pos_refunds',
        'credit_notes', 'service_bookings', 'audit_logs', 'store_staff',
        'staff_sessions', 'store_wallets', 'store_branches', 'store_specialists',
        'store_tables', 'store_inventory', 'store_drivers', 'store_orders',
        'store_invoices', 'store_recipes', 'store_wallet_pass_configs',
        'financial_ledger', 'billing_plans', 'billing_transactions',
        'billing_webhook_events', 'merchant_subscriptions', 'driver_settlements',
        'merchant_leads', 'merchant_onboarding', 'partner_accounts',
        'affiliates', 'referrals', 'partner_commissions',
        'partner_bonus_awards', 'partner_bonus_rules', 'partner_targets',
        'partner_audit_logs', 'affiliate_payouts', 'tenants',
        'tenant_branding', 'tenant_integrations', 'platform_system_config',
        'platform_integrations', 'reseller_master_auth', 'reseller_instances',
        'super_admin_users', 'master_admins', 'pin_login_attempts',
        'rate_limit_counters'
    ];
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = ANY(target_tables)
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- 2️⃣ تفعيل RLS إجبارياً على كافة جداول النظام المستهدفة
DO $$
DECLARE
    tbl TEXT;
    target_tables TEXT[] := ARRAY[
        'stores', 'store_customers', 'tiers', 'privileges', 'catalog_items',
        'customer_coupons', 'pos_shifts', 'pos_cash_movements', 'pos_refunds',
        'credit_notes', 'service_bookings', 'audit_logs', 'store_staff',
        'staff_sessions', 'store_wallets', 'store_branches', 'store_specialists',
        'store_tables', 'store_inventory', 'store_drivers', 'store_orders',
        'store_invoices', 'store_recipes', 'store_wallet_pass_configs',
        'financial_ledger', 'billing_plans', 'billing_transactions',
        'billing_webhook_events', 'merchant_subscriptions', 'driver_settlements',
        'merchant_leads', 'merchant_onboarding', 'partner_accounts',
        'affiliates', 'referrals', 'partner_commissions',
        'partner_bonus_awards', 'partner_bonus_rules', 'partner_targets',
        'partner_audit_logs', 'affiliate_payouts', 'tenants',
        'tenant_branding', 'tenant_integrations', 'platform_system_config',
        'platform_integrations', 'reseller_master_auth', 'reseller_instances',
        'super_admin_users', 'master_admins', 'pin_login_attempts',
        'rate_limit_counters'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        END IF;
    END LOOP;
END $$;

-- 3️⃣ سياسات العزل الصارمة للجداول التشغيلية (فلترة قسرية بوكيل الجلسة current_tenant_id وبلا أي تجاوز للسوبر أدمن)
DO $$
DECLARE
    tbl TEXT;
    op_tables TEXT[] := ARRAY[
        'stores', 'store_customers', 'tiers', 'privileges', 'catalog_items',
        'customer_coupons', 'pos_shifts', 'pos_cash_movements', 'pos_refunds',
        'credit_notes', 'service_bookings', 'audit_logs', 'store_staff',
        'staff_sessions', 'store_wallets', 'store_branches', 'store_specialists',
        'store_tables', 'store_inventory', 'store_drivers', 'store_orders',
        'store_invoices', 'store_recipes', 'store_wallet_pass_configs',
        'financial_ledger', 'billing_transactions', 'billing_webhook_events',
        'merchant_subscriptions', 'driver_settlements', 'merchant_leads',
        'merchant_onboarding', 'partner_accounts', 'affiliates', 'referrals',
        'partner_commissions', 'partner_bonus_awards', 'partner_bonus_rules',
        'partner_targets', 'partner_audit_logs', 'affiliate_payouts'
    ];
BEGIN
    FOREACH tbl IN ARRAY op_tables LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('
                CREATE POLICY "service_role_full_access" ON public.%I
                FOR ALL TO service_role USING (true) WITH CHECK (true);
            ', tbl);

            -- التأكد من وجود عمود tenant_id لتفادي أي خطأ
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
            ) THEN
                -- سياسة القراءة: يرى المستخدم فقط صفوف وكيله المطابقة لتوكنه حصراً
                EXECUTE format('
                    CREATE POLICY "tenant_isolation_select" ON public.%I
                    FOR SELECT TO authenticated
                    USING (tenant_id = public.current_tenant_id());
                ', tbl);

                -- سياسة الإدخال: يشترط تطابق tenant_id مع توكن المستخدم حصراً
                EXECUTE format('
                    CREATE POLICY "tenant_isolation_insert" ON public.%I
                    FOR INSERT TO authenticated
                    WITH CHECK (tenant_id = public.current_tenant_id());
                ', tbl);

                -- سياسة التعديل: تمنع تعديل أي صف خارج وكالة المستخدم
                EXECUTE format('
                    CREATE POLICY "tenant_isolation_update" ON public.%I
                    FOR UPDATE TO authenticated
                    USING (tenant_id = public.current_tenant_id())
                    WITH CHECK (tenant_id = public.current_tenant_id());
                ', tbl);

                -- سياسة الحذف: محصورة بوكالة المستخدم حصراً
                EXECUTE format('
                    CREATE POLICY "tenant_isolation_delete" ON public.%I
                    FOR DELETE TO authenticated
                    USING (tenant_id = public.current_tenant_id());
                ', tbl);
            END IF;
        END IF;
    END LOOP;
END $$;

-- 4️⃣ سياسات الجداول السيادية والخاصة
-- أ) جدول الوكلاء tenants
CREATE POLICY "tenants_service_role" ON public.tenants
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenants_select_own" ON public.tenants
FOR SELECT TO authenticated
USING (
    id = public.current_tenant_id()
    OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

CREATE POLICY "tenants_super_admin_modify" ON public.tenants
FOR ALL TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
)
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

-- ب) جدول باقات الاشتراك billing_plans: معزولة تماماً لكل وكيل (لا باقات مشتركة)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'billing_plans') THEN
        CREATE POLICY "billing_plans_service_role" ON public.billing_plans
        FOR ALL TO service_role USING (true) WITH CHECK (true);

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'billing_plans' AND column_name = 'tenant_id') THEN
            CREATE POLICY "billing_plans_select_tenant" ON public.billing_plans
            FOR SELECT TO authenticated
            USING (
                tenant_id = public.current_tenant_id()
                OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
            );

            CREATE POLICY "billing_plans_super_admin_manage" ON public.billing_plans
            FOR ALL TO authenticated
            USING (
                (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
                OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
            )
            WITH CHECK (
                (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
                OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
            );
        END IF;
    END IF;
END $$;

-- ج) جدول هوية الوكيل tenant_branding (بحماية ديناميكية في حال عدم وجود عمود tenant_id)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_branding') THEN
        CREATE POLICY "tenant_branding_service_role" ON public.tenant_branding
        FOR ALL TO service_role USING (true) WITH CHECK (true);

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_branding' AND column_name = 'tenant_id') THEN
            CREATE POLICY "tenant_branding_tenant_manage" ON public.tenant_branding
            FOR ALL TO authenticated
            USING (
                tenant_id = public.current_tenant_id()
                OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
            )
            WITH CHECK (
                tenant_id = public.current_tenant_id()
                OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
            );
        ELSE
            CREATE POLICY "tenant_branding_public_read" ON public.tenant_branding
            FOR SELECT TO anon, authenticated
            USING (true);

            CREATE POLICY "tenant_branding_super_admin_manage" ON public.tenant_branding
            FOR ALL TO authenticated
            USING (
                (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
                OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
            )
            WITH CHECK (
                (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
                OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
            );
        END IF;
    END IF;
END $$;

-- د) جدول تكاملات الوكيل tenant_integrations
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_integrations') THEN
        CREATE POLICY "tenant_integrations_service_role" ON public.tenant_integrations
        FOR ALL TO service_role USING (true) WITH CHECK (true);

        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'tenant_integrations' AND column_name = 'tenant_id'
        ) THEN
            CREATE POLICY "tenant_integrations_own_manage" ON public.tenant_integrations
            FOR ALL TO authenticated
            USING (
                tenant_id = public.current_tenant_id()
                OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
            )
            WITH CHECK (
                tenant_id = public.current_tenant_id()
                OR (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
            );
        END IF;
    END IF;
END $$;

-- هـ) الجداول السيادية المحمية: حصر تام بـ service_role
DO $$
DECLARE
    tbl TEXT;
    sov_tables TEXT[] := ARRAY[
        'platform_system_config', 'platform_integrations', 'reseller_master_auth',
        'reseller_instances', 'master_admins', 'pin_login_attempts', 'rate_limit_counters'
    ];
BEGIN
    FOREACH tbl IN ARRAY sov_tables LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('
                CREATE POLICY "sov_service_role_only" ON public.%I
                FOR ALL TO service_role USING (true) WITH CHECK (true);
            ', tbl);
        END IF;
    END LOOP;
END $$;

-- و) جدول مدراء النظام super_admin_users
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'super_admin_users') THEN
        CREATE POLICY "super_admin_users_service_role" ON public.super_admin_users
        FOR ALL TO service_role USING (true) WITH CHECK (true);

        CREATE POLICY "super_admin_users_self_read" ON public.super_admin_users
        FOR SELECT TO authenticated
        USING (user_id = auth.uid());
    END IF;
END $$;

-- 🔍 استعلام التحقق من السياسات بعد التطبيق
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

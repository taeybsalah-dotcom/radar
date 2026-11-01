-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - TENANT ISOLATION MIGRATION: PART 2
-- File: 20261101_tenant_isolation_part2_triggers_and_constraints.sql
-- Date: 2026-11-01
-- Goal: Context resolution, auto-injection triggers, immutability, and composite unique constraints
-- Mode: Idempotent, reversible
-- ==============================================================================

-- 1️⃣ دالة استخراج الوكيل الحصري من التوكن السيرفري المشفر (خالية تماماً من أي افتراضي radar)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_claim TEXT;
    v_req_tenant TEXT;
    v_headers JSONB;
BEGIN
    -- استخراج claim الوكيل من التوكن المشفر والموقع من GoTrue
    v_claim := NULLIF(TRIM(auth.jwt() -> 'app_metadata' ->> 'tenant_id'), '');

    -- إذا كان المستخدم سوبر أدمن، يُسمح بتحديد نطاق الوكيل بحسب الترويسة x-tenant-id
    IF (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE 
       OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' THEN
        BEGIN
            v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
            IF v_headers IS NOT NULL THEN
                v_req_tenant := NULLIF(TRIM(v_headers ->> 'x-tenant-id'), '');
                IF v_req_tenant IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants WHERE id = LOWER(v_req_tenant)) THEN
                    RETURN LOWER(v_req_tenant);
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- للمستخدمين العاديين، الاعتماد حصرياً على ادعاء التوكن
    IF v_claim IS NOT NULL THEN
        RETURN LOWER(v_claim);
    END IF;

    -- إذا لم يتوفر أي توكن أو ادعاء تعيد NULL قسراً لترفض العملية أمنياً
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO anon, authenticated, service_role;

-- 2️⃣ قادح التعبئة التلقائية لجداول المتاجر (يسحب tenant_id من المتجر التابع له ويتجاوز قيمة العميل)
CREATE OR REPLACE FUNCTION public.trg_auto_assign_tenant_from_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_store_tenant TEXT;
BEGIN
    IF NEW.store_id IS NOT NULL THEN
        SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id::text = NEW.store_id::text;
        IF v_store_tenant IS NOT NULL THEN
            NEW.tenant_id := v_store_tenant;
            RETURN NEW;
        END IF;
    END IF;

    -- في حال عدم توفر المتجر يستخرج من التوكن السيرفري
    NEW.tenant_id := COALESCE(public.current_tenant_id(), NEW.tenant_id);
    
    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'Security Violation: Cannot write to store-tied table without a valid store or tenant context.';
    END IF;

    RETURN NEW;
END;
$$;

-- 3️⃣ قادح التعبئة التلقائية لجداول الوكالة العامة (يسحب tenant_id من توكن الجلسة المشفر)
-- فحص أمني دقيق: يشمل session_user لـ postgres و supabase_admin وترويسة request.jwt.claim.role في PostgREST
CREATE OR REPLACE FUNCTION public.trg_auto_assign_tenant_from_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_jwt_tenant TEXT;
    v_is_privileged BOOLEAN := FALSE;
BEGIN
    -- إذا كانت القيمة محددة مسبقاً من دالة سيرفرية موثوقة SECURITY DEFINER يتم اعتمادها
    IF NEW.tenant_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_jwt_tenant := public.current_tenant_id();

    -- فحص صلاحيات التنفيذ السيرفرية العليا
    IF (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE 
       OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' 
       OR session_user IN ('postgres', 'supabase_admin')
       OR auth.role() = 'service_role'
       OR NULLIF(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
        v_is_privileged := TRUE;
    END IF;

    IF v_is_privileged THEN
        NEW.tenant_id := COALESCE(NEW.tenant_id, v_jwt_tenant);
    ELSE
        -- المستخدم العادي يفرض عليه توكنه قسراً وتُهمل أي قيمة أرسلها العميل
        NEW.tenant_id := v_jwt_tenant;
    END IF;

    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'Security Violation: Cannot insert record without verified tenant claim.';
    END IF;

    RETURN NEW;
END;
$$;

-- 4️⃣ قادح منع التعديل على tenant_id بعد الإدخال نهائياً (Immutability Enforcement)
CREATE OR REPLACE FUNCTION public.trg_prevent_tenant_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        IF NOT (
            (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE 
            OR session_user IN ('postgres', 'supabase_admin')
            OR auth.role() = 'service_role'
            OR NULLIF(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        ) THEN
            RAISE EXCEPTION 'Security Violation: tenant_id is immutable once assigned.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- 5️⃣ ربط الزنادات بجداول النظام
DO $$
DECLARE
    tbl TEXT;
    store_tables TEXT[] := ARRAY[
        'store_customers', 'tiers', 'privileges', 'catalog_items',
        'customer_coupons', 'pos_shifts', 'pos_cash_movements', 'pos_refunds',
        'service_bookings', 'audit_logs', 'store_staff', 'staff_sessions',
        'store_wallets', 'store_branches', 'store_specialists', 'store_tables',
        'store_inventory', 'store_drivers', 'store_orders', 'store_invoices',
        'store_recipes', 'store_wallet_pass_configs', 'financial_ledger',
        'merchant_subscriptions', 'billing_transactions', 'driver_settlements'
    ];
    tenant_jwt_tables TEXT[] := ARRAY[
        'stores', 'merchant_leads', 'merchant_onboarding', 'partner_accounts', 'affiliates',
        'partner_bonus_awards', 'partner_bonus_rules', 'partner_targets',
        'partner_commissions', 'partner_audit_logs', 'affiliate_payouts',
        'referrals'
    ];
BEGIN
    FOREACH tbl IN ARRAY store_tables LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_assign_tenant_store ON public.%I;', tbl);
            EXECUTE format('CREATE TRIGGER trg_assign_tenant_store BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_auto_assign_tenant_from_store();', tbl);
            
            EXECUTE format('DROP TRIGGER IF EXISTS trg_lock_tenant_mutation ON public.%I;', tbl);
            EXECUTE format('CREATE TRIGGER trg_lock_tenant_mutation BEFORE UPDATE OF tenant_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_tenant_mutation();', tbl);
        END IF;
    END LOOP;

    FOREACH tbl IN ARRAY tenant_jwt_tables LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_assign_tenant_jwt ON public.%I;', tbl);
            EXECUTE format('CREATE TRIGGER trg_assign_tenant_jwt BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_auto_assign_tenant_from_jwt();', tbl);

            EXECUTE format('DROP TRIGGER IF EXISTS trg_lock_tenant_mutation ON public.%I;', tbl);
            EXECUTE format('CREATE TRIGGER trg_lock_tenant_mutation BEFORE UPDATE OF tenant_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_tenant_mutation();', tbl);
        END IF;
    END LOOP;
END $$;

-- 6️⃣ ترقية القيود الفريدة لتكون مركبة (Composite Unique) تشمل tenant_id
DO $$
BEGIN
    -- كود الإحالة فريد على مستوى الوكيل حصراً في جدول الشركاء
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_accounts_referral_code_key') THEN
        ALTER TABLE public.partner_accounts DROP CONSTRAINT partner_accounts_referral_code_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_partner_accounts_tenant_referral') THEN
        ALTER TABLE public.partner_accounts ADD CONSTRAINT uq_partner_accounts_tenant_referral UNIQUE (tenant_id, referral_code);
    END IF;

    -- كود الإحالة فريد على مستوى الوكيل في جدول المسوقين affiliates
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'affiliates') THEN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'affiliates_referral_code_key') THEN
            ALTER TABLE public.affiliates DROP CONSTRAINT affiliates_referral_code_key;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_affiliates_tenant_referral') THEN
            ALTER TABLE public.affiliates ADD CONSTRAINT uq_affiliates_tenant_referral UNIQUE (tenant_id, referral_code);
        END IF;
    END IF;

    -- قواعد المكافآت فريدة لكل مرحلة داخل الوكيل الواحد
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_bonus_rules_milestone_key') THEN
        ALTER TABLE public.partner_bonus_rules DROP CONSTRAINT partner_bonus_rules_milestone_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_partner_bonus_rules_tenant_milestone') THEN
        ALTER TABLE public.partner_bonus_rules ADD CONSTRAINT uq_partner_bonus_rules_tenant_milestone UNIQUE (tenant_id, milestone);
    END IF;

    -- باقات الاشتراك: رمز الباقة فريد على مستوى الوكيل حصراً
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'billing_plans') THEN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_plans_code_key') THEN
            ALTER TABLE public.billing_plans DROP CONSTRAINT billing_plans_code_key;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_billing_plans_tenant_code') THEN
            ALTER TABLE public.billing_plans ADD CONSTRAINT uq_billing_plans_tenant_code UNIQUE (tenant_id, code);
        END IF;
    END IF;
END $$;

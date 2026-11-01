-- ==============================================================================
-- 🏛️ AL-ATHAR CORE (منصة الأثر السحابية) - COMPLETE TENANT ISOLATION BUNDLE
-- Master Unified Migration: Parts 1 through 5 (Production Hardened & Fully Reversible)
-- Date: 2026-11-01
-- Scope: All 41 Operational Tables Isolated, Sovereign Tables Hardened, RPCs & Public Storefronts
-- ==============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 📦 PART 1 OF 5: 20261101_tenant_isolation_part1_schema_and_backfill.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - TENANT ISOLATION MIGRATION: PART 1
-- File: 20261101_tenant_isolation_part1_schema_and_backfill.sql
-- Date: 2026-11-01
-- Goal: Add tenant_id column, backfill from store relations, zero arbitrary defaults,
--       clone billing plans independently per tenant, and fail migration if any orphan row exists.
-- Mode: Idempotent, reversible
-- ==============================================================================

-- 1️⃣ إضافة عمود tenant_id (nullable مبدئياً) لكافة الجداول التشغيلية بما فيها المتاجر
DO $$
DECLARE
    tbl TEXT;
    all_isolated TEXT[] := ARRAY[
        'stores', 'store_customers', 'tiers', 'privileges', 'catalog_items',
        'customer_coupons', 'pos_shifts', 'pos_cash_movements', 'pos_refunds',
        'credit_notes', 'service_bookings', 'audit_logs', 'store_staff',
        'staff_sessions', 'store_wallets', 'store_branches', 'store_specialists',
        'store_tables', 'store_inventory', 'store_drivers', 'store_orders',
        'store_invoices', 'store_recipes', 'store_wallet_pass_configs',
        'financial_ledger', 'billing_plans', 'billing_transactions',
        'billing_webhook_events', 'merchant_subscriptions', 'driver_settlements',
        'merchant_onboarding', 'merchant_leads', 'partner_accounts', 'affiliates',
        'partner_bonus_rules', 'partner_commissions', 'partner_bonus_awards',
        'partner_targets', 'partner_audit_logs', 'affiliate_payouts', 'referrals',
        'tenant_integrations'
    ];
BEGIN
    FOREACH tbl IN ARRAY all_isolated LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;', tbl);
        END IF;
    END LOOP;

    -- إضافة عمود tenant_id لجدول tenant_integrations وتعيينه وتغذيته برادار وسديم
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_integrations') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_integrations' AND column_name = 'tenant_id') THEN
            ALTER TABLE public.tenant_integrations ADD COLUMN tenant_id TEXT REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.tenant_integrations WHERE tenant_id = 'radar') THEN
            INSERT INTO public.tenant_integrations (tenant_id, telegram_enabled, gemini_enabled, whatsapp_enabled)
            VALUES ('radar', false, false, false);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.tenant_integrations WHERE tenant_id = 'sadeem') THEN
            INSERT INTO public.tenant_integrations (tenant_id, telegram_enabled, gemini_enabled, whatsapp_enabled)
            VALUES ('sadeem', false, false, false);
        END IF;
    END IF;

    -- تعبئة جدول المتاجر stores أولاً ليكون مصدراً لكافة الجداول التابعة
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stores') THEN
        UPDATE public.stores SET tenant_id = 'radar' WHERE tenant_id IS NULL;
        UPDATE public.stores 
        SET tenant_id = 'sadeem'
        WHERE slug = 'al-sayd' 
           OR name ILIKE '%السعيد%' 
           OR slug ILIKE '%sadeem%' 
           OR slug ILIKE '%sadim%';
    END IF;
END $$;

-- 2️⃣ تعبئة الجداول التابعة مباشرة لمتجر من stores.tenant_id
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
BEGIN
    FOREACH tbl IN ARRAY store_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'store_id'
        ) THEN
            EXECUTE format('
                UPDATE public.%I t
                SET tenant_id = s.tenant_id
                FROM public.stores s
                WHERE t.store_id::text = s.id::text AND t.tenant_id IS NULL;
            ', tbl);
        END IF;
    END LOOP;
END $$;

-- 3️⃣ تعبئة جدول الإشعارات الدائنة credit_notes (يحتوي store_id)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'credit_notes' AND column_name = 'store_id') THEN
        UPDATE public.credit_notes cn
        SET tenant_id = s.tenant_id
        FROM public.stores s
        WHERE cn.store_id::text = s.id::text AND cn.tenant_id IS NULL;
    END IF;
END $$;

-- 4️⃣ تعبئة جدول أحداث الويب هوك billing_webhook_events من بيانات metadata->>store_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'billing_webhook_events' AND column_name = 'metadata') THEN
        UPDATE public.billing_webhook_events bwe
        SET tenant_id = s.tenant_id
        FROM public.stores s
        WHERE (bwe.metadata->>'store_id')::text = s.id::text AND bwe.tenant_id IS NULL;
    END IF;
END $$;

-- 5️⃣ تعبئة جدول طلبات الانضمام merchant_leads بأمان ديناميكي
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'merchant_leads') THEN
        -- فحص الربط بالمتجر إن وجد converted_store_id أو store_id
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_leads' AND column_name = 'converted_store_id') THEN
            EXECUTE '
                UPDATE public.merchant_leads ml
                SET tenant_id = s.tenant_id
                FROM public.stores s
                WHERE ml.converted_store_id IS NOT NULL AND ml.converted_store_id::text = s.id::text AND ml.tenant_id IS NULL;
            ';
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_leads' AND column_name = 'store_id') THEN
            EXECUTE '
                UPDATE public.merchant_leads ml
                SET tenant_id = s.tenant_id
                FROM public.stores s
                WHERE ml.store_id IS NOT NULL AND ml.store_id::text = s.id::text AND ml.tenant_id IS NULL;
            ';
        END IF;

        -- فحص الربط بكود الإحالة إن وجد الحقل
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_leads' AND column_name = 'referral_code') THEN
            EXECUTE '
                UPDATE public.merchant_leads ml
                SET tenant_id = pa.tenant_id
                FROM public.partner_accounts pa
                WHERE ml.tenant_id IS NULL AND ml.referral_code IS NOT NULL AND UPPER(pa.referral_code) = UPPER(ml.referral_code);
            ';
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_leads' AND column_name = 'referred_by_code') THEN
            EXECUTE '
                UPDATE public.merchant_leads ml
                SET tenant_id = pa.tenant_id
                FROM public.partner_accounts pa
                WHERE ml.tenant_id IS NULL AND ml.referred_by_code IS NOT NULL AND UPPER(pa.referral_code) = UPPER(ml.referred_by_code);
            ';
        END IF;

        UPDATE public.merchant_leads SET tenant_id = 'radar' WHERE tenant_id IS NULL;
    END IF;
END $$;

-- 6️⃣ تعبئة باقات الاشتراك واستنساخها مستقلة لسديم (حظر الباقات المشتركة تماماً)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'billing_plans') THEN
        -- نسبة الباقات الحالية إلى رادار صراحة
        UPDATE public.billing_plans SET tenant_id = 'radar' WHERE tenant_id IS NULL;

        -- فك قيد unique القديم على code فقط إن وجد لتمكين وجود نفس الرمز بكل وكيل
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_plans_code_key') THEN
            ALTER TABLE public.billing_plans DROP CONSTRAINT billing_plans_code_key;
        END IF;

        -- استنساخ باقات رادار لسديم كصفوف مستقلة تماماً بـ tenant_id = 'sadeem'
        INSERT INTO public.billing_plans (
            id, code, name, description, amount, currency, billing_interval, trial_days, active, tenant_id, metadata, created_at, updated_at
        )
        SELECT 
            gen_random_uuid(), bp.code, bp.name, bp.description, bp.amount, bp.currency, bp.billing_interval, bp.trial_days, bp.active, 'sadeem', bp.metadata, now(), now()
        FROM public.billing_plans bp
        WHERE bp.tenant_id = 'radar'
          AND NOT EXISTS (
              SELECT 1 FROM public.billing_plans sbp 
              WHERE sbp.tenant_id = 'sadeem' AND sbp.code = bp.code
          );
    END IF;
END $$;

-- 7️⃣ تعبئة منظومة الشركاء التاريخية المعروفة (محمد الحاج) لرادار بالاسم الصريح بأمان ديناميكي
DO $$
DECLARE
    tbl TEXT;
    partner_tables TEXT[] := ARRAY[
        'partner_bonus_rules', 'partner_commissions', 'partner_bonus_awards',
        'partner_targets', 'partner_audit_logs', 'affiliate_payouts', 'referrals',
        'tenant_integrations'
    ];
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_accounts') THEN
        UPDATE public.partner_accounts SET tenant_id = 'radar' WHERE referral_code IN ('ALHAJ', 'r4775') AND tenant_id IS NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'affiliates') THEN
        UPDATE public.affiliates SET tenant_id = 'radar' WHERE tenant_id IS NULL;
    END IF;

    FOREACH tbl IN ARRAY partner_tables LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('UPDATE public.%I SET tenant_id = ''radar'' WHERE tenant_id IS NULL;', tbl);
        END IF;
    END LOOP;
END $$;

-- 8️⃣ فحص الحماية الصارم (Assertion Check): الفشل الإلزامي لو بقي صف واحد بدون وكيل في أي جدول
DO $$
DECLARE
    tbl TEXT;
    orphan_count BIGINT;
    all_mandatory TEXT[] := ARRAY[
        'stores', 'store_customers', 'tiers', 'privileges', 'catalog_items',
        'customer_coupons', 'pos_shifts', 'pos_cash_movements', 'pos_refunds',
        'credit_notes', 'service_bookings', 'audit_logs', 'store_staff',
        'staff_sessions', 'store_wallets', 'store_branches', 'store_specialists',
        'store_tables', 'store_inventory', 'store_drivers', 'store_orders',
        'store_invoices', 'store_recipes', 'store_wallet_pass_configs',
        'financial_ledger', 'billing_plans', 'billing_transactions',
        'billing_webhook_events', 'merchant_subscriptions', 'driver_settlements',
        'merchant_onboarding', 'merchant_leads', 'partner_accounts', 'affiliates',
        'partner_bonus_rules', 'partner_commissions', 'partner_bonus_awards',
        'partner_targets', 'partner_audit_logs', 'affiliate_payouts', 'referrals',
        'tenant_integrations'
    ];
BEGIN
    FOREACH tbl IN ARRAY all_mandatory LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NULL;', tbl) INTO orphan_count;
            IF orphan_count > 0 THEN
                RAISE EXCEPTION 'MIGRATION ABORTED: Table % has % rows with NULL tenant_id. Manual verification required.', tbl, orphan_count;
            END IF;
        END IF;
    END LOOP;
END $$;

-- 9️⃣ تطبيق قيد NOT NULL والفهارس بعد التأكد التام من خلو كافة الجداول من أي NULL
DO $$
DECLARE
    tbl TEXT;
    all_mandatory TEXT[] := ARRAY[
        'stores', 'store_customers', 'tiers', 'privileges', 'catalog_items',
        'customer_coupons', 'pos_shifts', 'pos_cash_movements', 'pos_refunds',
        'credit_notes', 'service_bookings', 'audit_logs', 'store_staff',
        'staff_sessions', 'store_wallets', 'store_branches', 'store_specialists',
        'store_tables', 'store_inventory', 'store_drivers', 'store_orders',
        'store_invoices', 'store_recipes', 'store_wallet_pass_configs',
        'financial_ledger', 'billing_plans', 'billing_transactions',
        'billing_webhook_events', 'merchant_subscriptions', 'driver_settlements',
        'merchant_onboarding', 'merchant_leads', 'partner_accounts', 'affiliates',
        'partner_bonus_rules', 'partner_commissions', 'partner_bonus_awards',
        'partner_targets', 'partner_audit_logs', 'affiliate_payouts', 'referrals',
        'tenant_integrations'
    ];
BEGIN
    FOREACH tbl IN ARRAY all_mandatory LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL;', tbl);
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tenant_id ON public.%I(tenant_id);', tbl, tbl);
        END IF;
    END LOOP;
END $$;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 📦 PART 2 OF 5: 20261101_tenant_isolation_part2_triggers_and_constraints.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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
        'merchant_leads', 'merchant_onboarding', 'partner_accounts', 'affiliates',
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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 📦 PART 3 OF 5: 20261101_tenant_isolation_part3_rls_lockdown.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 📦 PART 4 OF 5: 20261101_tenant_isolation_part4_security_definer_rpcs.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - TENANT ISOLATION MIGRATION: PART 4
-- File: 20261101_tenant_isolation_part4_security_definer_rpcs.sql
-- Date: 2026-11-01
-- Goal: Hardened RPCs, master token verification, sanitized public domain lookups,
--       strictly isolated billing plans, authentic bonus rule copying, super admin context switch,
--       and fix for Sadeem agency administrator account.
-- Mode: Idempotent, reversible
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1️⃣ دالة الشركاء المالية get_all_partner_financial_summaries
CREATE OR REPLACE FUNCTION public.get_all_partner_financial_summaries(
    p_partner_id UUID DEFAULT NULL,
    p_master_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_partner_record RECORD;
    v_target_tenant TEXT;
    v_is_master_control BOOLEAN := FALSE;
    v_earned_comm NUMERIC := 0;
    v_paid_comm NUMERIC := 0;
    v_pending_comm NUMERIC := 0;
    v_earned_bonus NUMERIC := 0;
    v_paid_bonus NUMERIC := 0;
    v_total_payable NUMERIC := 0;
    v_total_paid NUMERIC := 0;
BEGIN
    IF p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token) THEN
        v_is_master_control := TRUE;
    END IF;

    v_target_tenant := public.current_tenant_id();

    IF v_target_tenant IS NULL AND NOT v_is_master_control THEN
        RAISE EXCEPTION 'Access Denied: Unverified tenant session.';
    END IF;

    FOR v_partner_record IN
        SELECT 
            pa.id, 
            pa.affiliate_id, 
            pa.display_name, 
            COALESCE(pa.slug, LOWER(COALESCE(pa.referral_code, af.referral_code, 'alhaj'))) AS slug,
            COALESCE(pa.referral_code, af.referral_code, 'ALHAJ') AS referral_code,
            COALESCE(af.phone, '') AS phone,
            '****' AS pin_code,
            COALESCE(pa.commission_rate, 0.2000) AS commission_rate,
            COALESCE(pa.acquisition_commission_rate, 0.2000) AS acquisition_commission_rate,
            COALESCE(pa.recurring_commission_rate, 0.1000) AS recurring_commission_rate,
            COALESCE(pa.target_value, 20) AS target_value,
            COALESCE(pa.active, true) AS active,
            pa.tenant_id,
            pa.created_at
        FROM public.partner_accounts pa
        LEFT JOIN public.affiliates af ON af.id = pa.affiliate_id
        WHERE (p_partner_id IS NULL OR pa.id = p_partner_id OR pa.affiliate_id = p_partner_id)
          AND (v_is_master_control OR pa.tenant_id = v_target_tenant)
        ORDER BY pa.created_at ASC
    LOOP
        v_earned_comm := 0;
        v_paid_comm := 0;
        v_pending_comm := 0;
        v_earned_bonus := 0;
        v_paid_bonus := 0;

        SELECT
            COALESCE(SUM(CASE WHEN status IN ('EARNED', 'AVAILABLE') THEN commission_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'PAID' THEN commission_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'PENDING' THEN commission_amount ELSE 0 END), 0)
        FROM public.partner_commissions
        WHERE (partner_account_id = v_partner_record.id OR affiliate_id = v_partner_record.affiliate_id)
          AND status NOT IN ('REVERSED', 'CANCELLED', 'VOID')
          AND (v_is_master_control OR tenant_id = v_target_tenant)
        INTO v_earned_comm, v_paid_comm, v_pending_comm;

        SELECT
            COALESCE(SUM(CASE WHEN status = 'ACHIEVED' THEN bonus_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status IN ('AWARDED', 'PAID') THEN bonus_amount ELSE 0 END), 0)
        FROM public.partner_bonus_awards
        WHERE partner_account_id = v_partner_record.id
          AND (v_is_master_control OR tenant_id = v_target_tenant)
        INTO v_earned_bonus, v_paid_bonus;

        v_total_payable := (v_earned_comm - v_paid_comm) + (v_earned_bonus - v_paid_bonus);
        v_total_paid := v_paid_comm + v_paid_bonus;

        v_result := jsonb_set(
            v_result,
            ARRAY[v_partner_record.id::text],
            jsonb_build_object(
                'partner_id', v_partner_record.id,
                'affiliate_id', v_partner_record.affiliate_id,
                'display_name', v_partner_record.display_name,
                'referral_code', v_partner_record.referral_code,
                'phone', v_partner_record.phone,
                'pin_code', '****',
                'tenant_id', v_partner_record.tenant_id,
                'commission_rate', v_partner_record.commission_rate,
                'target_value', v_partner_record.target_value,
                'active', v_partner_record.active,
                'earned_commissions', v_earned_comm,
                'paid_commissions', v_paid_comm,
                'pending_commissions', v_pending_comm,
                'earned_bonus', v_earned_bonus,
                'paid_bonus', v_paid_bonus,
                'total_payable', v_total_payable,
                'total_paid', v_total_paid
            )
        );
    END LOOP;

    RETURN v_result;
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.get_all_partner_financial_summaries(UUID, TEXT) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_all_partner_financial_summaries(UUID, TEXT) TO authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2️⃣ دالة جلب الوكيل الفعال بالدومين get_active_tenant_by_domain
CREATE OR REPLACE FUNCTION public.get_active_tenant_by_domain(p_host TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_host TEXT;
    v_tenant RECORD;
BEGIN
    IF p_host IS NULL OR TRIM(p_host) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_host := LOWER(TRIM(p_host));
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
    v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

    SELECT *
    INTO v_tenant
    FROM public.tenants
    WHERE status = 'active'
      AND (
          LOWER(custom_domain) = v_clean_host
          OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
          OR LOWER(slug) = v_clean_host
      )
    LIMIT 1;

    IF v_tenant.id IS NOT NULL THEN
        RETURN to_jsonb(v_tenant);
    END IF;

    RETURN NULL;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_active_tenant_by_domain(TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3️⃣ زراعة الهاش السيادي في reseller_master_auth والتحقق منه حصرياً لـ service_role
CREATE TABLE IF NOT EXISTS public.reseller_master_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DELETE FROM public.reseller_master_auth;
INSERT INTO public.reseller_master_auth (id, master_token_hash, created_at)
VALUES (
    gen_random_uuid(),
    '09678bf63a187557ac1887cdf7b25b8cf1c8d2c0e1ee1badea0d7b368c90afa2',
    now()
);

CREATE OR REPLACE FUNCTION public.is_valid_master_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_token IS NULL OR TRIM(p_token) = '' THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.reseller_master_auth 
        WHERE master_token_hash = encode(digest(p_token, 'sha256'), 'hex')
    );
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.is_valid_master_token(TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.is_valid_master_token(TEXT) TO service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.exec_master_sql(p_sql TEXT, p_master_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NOT public.is_valid_master_token(p_master_token) THEN
        RAISE EXCEPTION 'Unauthorized: Invalid master token.';
    END IF;

    EXECUTE p_sql;
    RETURN jsonb_build_object('success', true, 'executed_at', now());
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.exec_master_sql(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.exec_master_sql(TEXT, TEXT) TO service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4️⃣ إجراء زراعة قواعد الحوافز الافتراضية بنسخ قواعد رادار الفعلية
CREATE OR REPLACE FUNCTION public.seed_tenant_default_bonus_rules(p_tenant_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_tenant_id IS NULL OR TRIM(p_tenant_id) = '' THEN
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.partner_bonus_rules WHERE tenant_id = p_tenant_id) THEN
        INSERT INTO public.partner_bonus_rules (
            milestone, bonus_amount, active, tenant_id, created_at, updated_at
        )
        SELECT 
            pbr.milestone, pbr.bonus_amount, pbr.active, p_tenant_id, now(), now()
        FROM public.partner_bonus_rules pbr
        WHERE pbr.tenant_id = 'radar'
        ON CONFLICT (tenant_id, milestone) DO NOTHING;

        IF NOT EXISTS (SELECT 1 FROM public.partner_bonus_rules WHERE tenant_id = p_tenant_id) THEN
            INSERT INTO public.partner_bonus_rules (milestone, bonus_amount, active, tenant_id)
            VALUES 
                (3, 100.00, true, p_tenant_id),
                (5, 250.00, true, p_tenant_id),
                (10, 500.00, true, p_tenant_id),
                (20, 1000.00, true, p_tenant_id)
            ON CONFLICT (tenant_id, milestone) DO NOTHING;
        END IF;
    END IF;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.seed_tenant_default_bonus_rules(TEXT) TO authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT public.seed_tenant_default_bonus_rules('sadeem');

-- 5️⃣ دالة جلب باقات الاشتراك بحسب الدومين get_public_billing_plans (عزل تام: سديم يرى سديم ورادار يرى رادار وبلا باقات مشتركة)
CREATE OR REPLACE FUNCTION public.get_public_billing_plans(p_host TEXT)
RETURNS SETOF public.billing_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_host TEXT;
    v_tenant_id TEXT;
BEGIN
    IF p_host IS NULL OR TRIM(p_host) = '' THEN
        RETURN;
    END IF;

    v_clean_host := LOWER(TRIM(p_host));
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
    v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

    SELECT id INTO v_tenant_id 
    FROM public.tenants 
    WHERE LOWER(custom_domain) = v_clean_host 
       OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
       OR LOWER(slug) = v_clean_host
    LIMIT 1;

    -- إرجاع باقات هذا الوكيل حصراً دون أي باقات مشتركة
    IF v_tenant_id IS NOT NULL THEN
        RETURN QUERY
        SELECT * FROM public.billing_plans
        WHERE active = true AND tenant_id = v_tenant_id
        ORDER BY amount ASC;
    END IF;

    RETURN;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_billing_plans(TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6️⃣ دالة جلب هوية الوكيل الآمنة get_tenant_branding_by_domain
CREATE OR REPLACE FUNCTION public.get_tenant_branding_by_domain(p_host TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_tenant JSONB;
    v_tenant_id TEXT;
BEGIN
    v_tenant := public.get_active_tenant_by_domain(p_host);
    IF v_tenant IS NULL THEN
        RETURN NULL;
    END IF;

    v_tenant_id := v_tenant->>'id';

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'tenant_name', v_tenant->>'name',
        'slug', v_tenant->>'slug',
        'custom_domain', v_tenant->>'custom_domain',
        'brand_name', COALESCE(v_tenant->>'name', ''),
        'brand_slogan', COALESCE(v_tenant->>'tagline', ''),
        'logo_url', COALESCE(v_tenant->>'logo_url', ''),
        'favicon_url', COALESCE(v_tenant->>'favicon_url', ''),
        'primary_color', COALESCE(v_tenant->>'primary_color_hex', '#F59E0B'),
        'secondary_color', COALESCE(v_tenant->>'accent_color_hex', '#10B981'),
        'accent_color', COALESCE(v_tenant->>'accent_color_hex', '#10B981'),
        'support_email', COALESCE(v_tenant->>'support_email', ''),
        'support_phone', COALESCE(v_tenant->>'support_phone', '')
    );
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_tenant_branding_by_domain(TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7️⃣ دالة تحويل نطاق الوكيل للسوبر أدمن switch_super_admin_active_tenant
-- 🔒 فحص أمني صارم: محظورة منعاً باتاً على مسؤولي الوكالات والعملاء، ومحصورة بمالك المنصة
CREATE OR REPLACE FUNCTION public.switch_super_admin_active_tenant(p_target_tenant_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid UUID;
    v_is_super BOOLEAN;
    v_clean_tenant TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- التحقق الصارم من صفة السوبر أدمن
    v_is_super := (
        (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
        OR EXISTS (
            SELECT 1 FROM public.super_admin_users 
            WHERE user_id = v_uid AND role = 'super_admin' AND is_active = true
        )
    );

    IF NOT v_is_super THEN
        RAISE EXCEPTION 'Security Violation: Only platform Super Admin can switch tenant context.';
    END IF;

    v_clean_tenant := LOWER(TRIM(p_target_tenant_id));
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_clean_tenant) THEN
        RAISE EXCEPTION 'Target tenant % does not exist.', v_clean_tenant;
    END IF;

    -- تعديل ادعاء tenant_id داخل raw_app_meta_data للـ super admin
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('tenant_id', v_clean_tenant),
        updated_at = now()
    WHERE id = v_uid;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_uid,
        'active_tenant', v_clean_tenant,
        'message', 'Tenant context switched successfully'
    );
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.switch_super_admin_active_tenant(TEXT) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.switch_super_admin_active_tenant(TEXT) TO authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8️⃣ تثبيت وترقية حساب مسؤول وكالة سديم admin@sdeemalathr.com
DO $$
DECLARE
    v_sadeem_user_id UUID;
BEGIN
    SELECT id INTO v_sadeem_user_id 
    FROM auth.users 
    WHERE LOWER(email) = 'admin@sdeemalathr.com';

    IF v_sadeem_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
            'role', 'tenant_admin',
            'tenant_id', 'sadeem',
            'is_super_admin', false
        ),
        updated_at = now()
        WHERE id = v_sadeem_user_id;
    END IF;
END $$;

-- 9️⃣ تحديث دالة verify_super_admin_session لدعم مسؤولي الوكالات tenant_admin بسلاسة
CREATE OR REPLACE FUNCTION public.verify_super_admin_session()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_super BOOLEAN;
    v_email TEXT;
    v_uid UUID;
    v_admin RECORD;
    v_role TEXT;
    v_tenant_id TEXT;
BEGIN
    v_uid := auth.uid();
    v_email := LOWER(COALESCE(auth.jwt() ->> 'email', 'service_role'));
    v_role := auth.jwt() -> 'app_metadata' ->> 'role';
    v_tenant_id := auth.jwt() -> 'app_metadata' ->> 'tenant_id';

    -- أ) فحص إذا كان المستخدم مسؤول وكالة معتمد (tenant_admin)
    IF v_role = 'tenant_admin' THEN
        RETURN jsonb_build_object(
            'authenticated', true,
            'is_super_admin', true,
            'role', 'tenant_admin',
            'tenant_id', v_tenant_id,
            'admin_id', v_uid,
            'email', v_email,
            'full_name', 'مسؤول الوكالة المعتمد',
            'permissions', jsonb_build_object(
                'can_manage_stores', true,
                'can_manage_billing', true,
                'can_view_financials', true,
                'can_manage_partners', true
            )
        );
    END IF;

    -- ب) فحص مالك المنظومة الشامل (Super Admin)
    v_is_super := (
        (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
        OR v_role = 'super_admin'
        OR auth.role() = 'service_role'
        OR session_user IN ('postgres', 'supabase_admin')
    );

    IF NOT v_is_super THEN
        -- فحص جدول super_admin_users
        SELECT * INTO v_admin
        FROM public.super_admin_users
        WHERE (user_id = v_uid OR LOWER(email) = v_email) AND is_active = true
        LIMIT 1;

        IF v_admin.user_id IS NOT NULL THEN
            v_is_super := TRUE;
        END IF;
    END IF;

    IF NOT v_is_super THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'is_super_admin', false,
            'error', 'UNAUTHORIZED',
            'message', 'الحساب الحالي غير مصرح له بإدارة المنصة'
        );
    END IF;

    RETURN jsonb_build_object(
        'authenticated', true,
        'is_super_admin', true,
        'role', 'super_admin',
        'tenant_id', COALESCE(v_tenant_id, 'radar'),
        'admin_id', v_uid,
        'email', v_email,
        'full_name', 'صلاح الطيب (مالك المنظومة)',
        'permissions', jsonb_build_object(
            'can_manage_stores', true,
            'can_delete_stores', true,
            'can_manage_billing', true,
            'can_view_financials', true,
            'can_manage_partners', true,
            'can_send_notifications', true,
            'can_manage_admins', true,
            'can_reset_platform', true
        )
    );
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.verify_super_admin_session() TO authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 🔟 إجراء استرجاع صلاحية المالك (Super Admin Break-Glass Recovery)
CREATE OR REPLACE FUNCTION public.master_restore_super_admin(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_email TEXT;
    v_user_id UUID;
BEGIN
    IF auth.role() <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access Denied: Only service_role can execute master break-glass recovery.';
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_clean_email;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found.', v_clean_email;
    END IF;

    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
        'role', 'super_admin',
        'is_super_admin', true,
        'tenant_id', 'radar'
    ),
    updated_at = now()
    WHERE id = v_user_id;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'super_admin_users') THEN
        INSERT INTO public.super_admin_users (
            user_id, email, full_name, role, is_active, created_at, updated_at
        ) VALUES (
            v_user_id, v_clean_email, 'صلاح الطيب (مالك المنظومة)', 'super_admin', true, now(), now()
        ) ON CONFLICT (email) DO UPDATE
        SET role = 'super_admin', is_active = true, updated_at = now();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'email', v_clean_email,
        'message', 'تم استرجاع وتثبيت صلاحية المالك (Super Admin) بنجاح فوري وبلا قيود'
    );
END;
$$;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.master_restore_super_admin(TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.master_restore_super_admin(TEXT) TO service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 📦 PART 5 OF 5: 20261101_tenant_isolation_part5_public_storefront_rpcs.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - TENANT ISOLATION MIGRATION: PART 5
-- File: 20261101_tenant_isolation_part5_public_storefront_rpcs.sql
-- Date: 2026-11-01
-- Goal: Complete Public Storefront & Visitor RPCs (Menu, Specialists, Store by Slug,
--       Referral Verification, Public Leads, Public Customer Profile, Public Customer Coupons)
--       to prevent frontend crashes under strict RLS for anonymous (anon) visitors.
-- Mode: Idempotent, reversible
-- ==============================================================================

-- 1️⃣ دالة جلب بيانات المتجر بالرابط للزوار get_public_store_by_slug
CREATE OR REPLACE FUNCTION public.get_public_store_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_slug TEXT;
    v_store RECORD;
BEGIN
    IF p_slug IS NULL OR TRIM(p_slug) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_slug := LOWER(TRIM(p_slug));

    SELECT *
    INTO v_store
    FROM public.stores
    WHERE LOWER(slug) = v_clean_slug
    LIMIT 1;

    IF v_store.id IS NOT NULL THEN
        RETURN to_jsonb(v_store);
    END IF;

    RETURN NULL;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_store_by_slug(TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2️⃣ دالة جلب قائمة أصناف المتجر (المنيو) للزوار get_public_catalog_items
CREATE OR REPLACE FUNCTION public.get_public_catalog_items(p_store_id UUID)
RETURNS SETOF public.catalog_items
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_store_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.catalog_items
    WHERE store_id = p_store_id AND is_available = true
    ORDER BY category ASC, name ASC;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_catalog_items(UUID) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3️⃣ دالة جلب أخصائيي المتجر لصفحة الحجوزات get_public_store_specialists
CREATE OR REPLACE FUNCTION public.get_public_store_specialists(p_store_id UUID)
RETURNS SETOF public.store_specialists
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_store_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.store_specialists
    WHERE store_id = p_store_id AND is_active = true
    ORDER BY name ASC;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_store_specialists(UUID) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4️⃣ دالة جلب فروع المتجر العامة get_public_store_branches
CREATE OR REPLACE FUNCTION public.get_public_store_branches(p_store_id UUID)
RETURNS SETOF public.store_branches
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_store_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.store_branches
    WHERE store_id = p_store_id
    ORDER BY is_main DESC, created_at ASC;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_store_branches(UUID) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5️⃣ دالة التحقق من كود إحالة المسوق verify_partner_referral_code
-- 🔒 تنظيف صارم للدومين من www. والمنافذ والبروتوكول، وحظر تام لأي خلط بين وكالات النطاق
CREATE OR REPLACE FUNCTION public.verify_partner_referral_code(
    p_code TEXT,
    p_host TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_code TEXT;
    v_clean_host TEXT;
    v_tenant_id TEXT;
    v_partner RECORD;
BEGIN
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_code := UPPER(TRIM(p_code));

    -- تنظيف النطاق تماماً من البروتوكول والمنافذ و www. كما في دالة get_active_tenant_by_domain
    IF p_host IS NOT NULL AND TRIM(p_host) <> '' THEN
        v_clean_host := LOWER(TRIM(p_host));
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
        v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

        SELECT id INTO v_tenant_id FROM public.tenants
        WHERE LOWER(custom_domain) = v_clean_host
           OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
           OR LOWER(slug) = v_clean_host
        LIMIT 1;

        -- 🔒 حظر أمني صارم: إذا كان p_host مرسل ولم يتطابق مع وكيل معتمد يُرفض الكود فوراً
        IF v_tenant_id IS NULL THEN
            RETURN NULL;
        END IF;

        -- فحص الكود محصوراً بوكالة النطاق فقط وبلا أي استثناء (يُمنع قبول مسوق من وكالة ثانية)
        SELECT 
            id, referral_code, slug, display_name, tenant_id, active
        INTO v_partner
        FROM public.partner_accounts
        WHERE (UPPER(referral_code) = v_clean_code OR UPPER(COALESCE(slug, '')) = v_clean_code)
          AND active = true
          AND tenant_id = v_tenant_id
        LIMIT 1;
    ELSE
        -- إذا لم يُرسل p_host نهائياً يُفحص وكيل الجلسة الموثقة
        v_tenant_id := public.current_tenant_id();
        IF v_tenant_id IS NULL THEN
            RETURN NULL;
        END IF;

        SELECT 
            id, referral_code, slug, display_name, tenant_id, active
        INTO v_partner
        FROM public.partner_accounts
        WHERE (UPPER(referral_code) = v_clean_code OR UPPER(COALESCE(slug, '')) = v_clean_code)
          AND active = true
          AND tenant_id = v_tenant_id
        LIMIT 1;
    END IF;

    IF v_partner.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'id', v_partner.id,
            'referral_code', v_partner.referral_code,
            'slug', v_partner.slug,
            'display_name', v_partner.display_name,
            'tenant_id', v_partner.tenant_id,
            'active', v_partner.active
        );
    END IF;

    RETURN NULL;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.verify_partner_referral_code(TEXT, TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6️⃣ دالة تسجيل طلب انضمام تاجر جديد submit_merchant_lead_rpc
CREATE OR REPLACE FUNCTION public.submit_merchant_lead_rpc(
    p_payload JSONB,
    p_host TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_host TEXT;
    v_tenant_id TEXT;
    v_lead_id UUID;
    v_ref_code TEXT;
BEGIN
    IF p_payload IS NULL THEN
        RAISE EXCEPTION 'Invalid lead payload.';
    END IF;

    v_ref_code := UPPER(TRIM(COALESCE(p_payload->>'referral_code', p_payload->>'referred_by_code', '')));

    -- استخراج الوكيل من الشريك المحيل أولاً إن وجد
    IF v_ref_code <> '' THEN
        SELECT tenant_id INTO v_tenant_id FROM public.partner_accounts WHERE UPPER(referral_code) = v_ref_code LIMIT 1;
    END IF;

    -- إذا لم يتوفر من الشريك، يُستخرج من نطاق الدخول بعد تنظيفه
    IF v_tenant_id IS NULL AND p_host IS NOT NULL AND TRIM(p_host) <> '' THEN
        v_clean_host := LOWER(TRIM(p_host));
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
        v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

        SELECT id INTO v_tenant_id FROM public.tenants
        WHERE LOWER(custom_domain) = v_clean_host
           OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
           OR LOWER(slug) = v_clean_host
        LIMIT 1;
    END IF;

    -- الافتراضي إلى رادار إذا تعذر كلياً تحديد النطاق
    v_tenant_id := COALESCE(v_tenant_id, 'radar');

    INSERT INTO public.merchant_leads (
        id, store_name, manager_name, phone, normalized_phone, business_type, city,
        status, referral_code, converted_store_id, tenant_id, created_at, updated_at
    ) VALUES (
        gen_random_uuid(),
        COALESCE(p_payload->>'store_name', p_payload->>'merchant_name', 'متجر جديد'),
        COALESCE(p_payload->>'manager_name', 'المدير'),
        COALESCE(p_payload->>'phone', ''),
        COALESCE(NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(p_payload->>'phone', ''), '[^0-9]', '', 'g'), 9), ''), '000000000'),
        COALESCE(p_payload->>'business_type', 'retail'),
        COALESCE(p_payload->>'city', ''),
        'NEW',
        NULLIF(v_ref_code, ''),
        NULLIF(COALESCE(p_payload->>'converted_store_id', p_payload->>'store_id'), '')::uuid,
        v_tenant_id,
        now(),
        now()
    )
    RETURNING id INTO v_lead_id;

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id,
        'tenant_id', v_tenant_id,
        'message', 'Lead submitted successfully'
    );
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.submit_merchant_lead_rpc(JSONB, TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7️⃣ دالة جلب بطاقة العميل العامة بالهاتف get_public_customer_profile (لمنع تعطل getCustomer)
CREATE OR REPLACE FUNCTION public.get_public_customer_profile(
    p_store_id UUID,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_phone TEXT;
    v_cust RECORD;
BEGIN
    IF p_store_id IS NULL OR p_phone IS NULL OR TRIM(p_phone) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_phone := RIGHT(REGEXP_REPLACE(TRIM(p_phone), '[^0-9]', '', 'g'), 9);

    SELECT *
    INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 9) = v_clean_phone
    LIMIT 1;

    IF v_cust.id IS NOT NULL THEN
        RETURN to_jsonb(v_cust);
    END IF;

    RETURN NULL;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_customer_profile(UUID, TEXT) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8️⃣ دالة جلب كوبونات العميل العامة get_public_customer_coupons (لمنع تعطل getCustomerCoupons)
CREATE OR REPLACE FUNCTION public.get_public_customer_coupons(
    p_store_id UUID,
    p_phone TEXT DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL
)
RETURNS SETOF public.customer_coupons
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_phone TEXT;
BEGIN
    IF p_store_id IS NULL THEN
        RETURN;
    END IF;

    IF p_phone IS NOT NULL AND TRIM(p_phone) <> '' THEN
        v_clean_phone := RIGHT(REGEXP_REPLACE(TRIM(p_phone), '[^0-9]', '', 'g'), 9);
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.customer_coupons
    WHERE store_id = p_store_id
      AND (
          (p_customer_id IS NOT NULL AND customer_id = p_customer_id)
          OR (v_clean_phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '[^0-9]', '', 'g'), 9) = v_clean_phone)
      )
    ORDER BY purchased_at DESC;
END;
$$;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION public.get_public_customer_coupons(UUID, TEXT, UUID) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;



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

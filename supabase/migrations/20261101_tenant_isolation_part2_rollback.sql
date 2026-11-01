-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - ROLLBACK: PART 2
-- File: 20261101_tenant_isolation_part2_rollback.sql
-- Date: 2026-11-01
-- Goal: Safely revert triggers and composite constraints introduced in part 2
-- ==============================================================================

DO $$
DECLARE
    tbl TEXT;
    all_tables TEXT[] := ARRAY[
        'store_customers', 'tiers', 'privileges', 'catalog_items',
        'customer_coupons', 'pos_shifts', 'pos_cash_movements', 'pos_refunds',
        'service_bookings', 'audit_logs', 'store_staff', 'staff_sessions',
        'store_wallets', 'store_branches', 'store_specialists', 'store_tables',
        'store_inventory', 'store_drivers', 'store_orders', 'store_invoices',
        'store_recipes', 'store_wallet_pass_configs', 'financial_ledger',
        'merchant_subscriptions', 'billing_transactions', 'driver_settlements',
        'merchant_leads', 'merchant_onboarding', 'partner_accounts',
        'partner_bonus_awards', 'partner_bonus_rules', 'partner_targets',
        'partner_commissions', 'partner_audit_logs', 'affiliate_payouts',
        'referrals'
    ];
BEGIN
    FOREACH tbl IN ARRAY all_tables LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_assign_tenant_store ON public.%I;', tbl);
            EXECUTE format('DROP TRIGGER IF EXISTS trg_assign_tenant_jwt ON public.%I;', tbl);
            EXECUTE format('DROP TRIGGER IF EXISTS trg_lock_tenant_mutation ON public.%I;', tbl);
        END IF;
    END LOOP;

    -- إعادة القيود الفريدة إلى حالتها السابقة
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_partner_accounts_tenant_referral') THEN
        ALTER TABLE public.partner_accounts DROP CONSTRAINT uq_partner_accounts_tenant_referral;
        ALTER TABLE public.partner_accounts ADD CONSTRAINT partner_accounts_referral_code_key UNIQUE (referral_code);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_partner_bonus_rules_tenant_milestone') THEN
        ALTER TABLE public.partner_bonus_rules DROP CONSTRAINT uq_partner_bonus_rules_tenant_milestone;
        ALTER TABLE public.partner_bonus_rules ADD CONSTRAINT partner_bonus_rules_milestone_key UNIQUE (milestone);
    END IF;

    -- حذف الدوال
    DROP FUNCTION IF EXISTS public.trg_prevent_tenant_mutation() CASCADE;
    DROP FUNCTION IF EXISTS public.trg_auto_assign_tenant_from_jwt() CASCADE;
    DROP FUNCTION IF EXISTS public.trg_auto_assign_tenant_from_store() CASCADE;
    DROP FUNCTION IF EXISTS public.current_tenant_id() CASCADE;
END $$;

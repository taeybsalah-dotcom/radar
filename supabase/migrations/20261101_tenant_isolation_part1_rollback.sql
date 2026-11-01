-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - ROLLBACK: PART 1
-- File: 20261101_tenant_isolation_part1_rollback.sql
-- Date: 2026-11-01
-- Goal: Safely revert schema changes introduced in part 1
-- ==============================================================================

DO $$
DECLARE
    tbl TEXT;
    all_isolated TEXT[] := ARRAY[
        'store_customers', 'tiers', 'privileges', 'catalog_items',
        'customer_coupons', 'pos_shifts', 'pos_cash_movements', 'pos_refunds',
        'credit_notes', 'service_bookings', 'audit_logs', 'store_staff',
        'staff_sessions', 'store_wallets', 'store_branches', 'store_specialists',
        'store_tables', 'store_inventory', 'store_drivers', 'store_orders',
        'store_invoices', 'store_recipes', 'store_wallet_pass_configs',
        'financial_ledger', 'billing_plans', 'billing_transactions',
        'billing_webhook_events', 'merchant_subscriptions', 'driver_settlements',
        'merchant_onboarding', 'merchant_leads', 'partner_accounts',
        'partner_bonus_rules', 'partner_commissions', 'partner_bonus_awards',
        'partner_targets', 'partner_audit_logs', 'affiliate_payouts', 'referrals'
    ];
BEGIN
    FOREACH tbl IN ARRAY all_isolated LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('DROP INDEX IF EXISTS public.idx_%I_tenant_id;', tbl);
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
            ) THEN
                EXECUTE format('ALTER TABLE public.%I DROP COLUMN tenant_id CASCADE;', tbl);
            END IF;
        END IF;
    END LOOP;
END $$;

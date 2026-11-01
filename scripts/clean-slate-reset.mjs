import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function runCleanSlate() {
  await client.connect();
  console.log('⚡ Connected to PostgreSQL Database');

  try {
    await client.query('BEGIN');

    // 1. Clear Audit & Security Logs FIRST (as they reference customers, stores, etc.)
    console.log('🧹 Clearing audit and security logs...');
    await client.query(`DELETE FROM public.audit_logs;`);
    await client.query(`DELETE FROM public.partner_audit_logs;`);
    await client.query(`DELETE FROM public.pin_login_attempts;`);
    await client.query(`DELETE FROM public.rate_limit_events;`);
    await client.query(`DELETE FROM public.rate_limit_counters;`);

    // 2. Disable immutability triggers temporarily on financial_ledger
    console.log('🔓 Disabling immutability triggers on financial_ledger...');
    await client.query(`
      ALTER TABLE public.financial_ledger DISABLE TRIGGER trg_protect_financial_ledger_immutability;
      ALTER TABLE public.financial_ledger DISABLE TRIGGER trg_lock_tenant_mutation;
    `);

    // 3. Clear Financial & Invoicing Records
    console.log('🧹 Clearing financial records...');
    await client.query(`DELETE FROM public.credit_notes;`);
    await client.query(`DELETE FROM public.billing_transactions;`);
    await client.query(`DELETE FROM public.billing_webhook_events;`);
    await client.query(`DELETE FROM public.partner_commissions;`);
    await client.query(`DELETE FROM public.partner_bonus_awards;`);
    await client.query(`DELETE FROM public.affiliate_payouts;`);
    await client.query(`DELETE FROM public.store_invoices;`);
    await client.query(`DELETE FROM public.financial_ledger;`);

    // Re-enable immutability triggers on financial_ledger
    console.log('🔒 Re-enabling immutability triggers on financial_ledger...');
    await client.query(`
      ALTER TABLE public.financial_ledger ENABLE TRIGGER trg_protect_financial_ledger_immutability;
      ALTER TABLE public.financial_ledger ENABLE TRIGGER trg_lock_tenant_mutation;
    `);

    // 4. Clear Leads & Onboarding
    console.log('🧹 Clearing leads and onboarding records...');
    await client.query(`DELETE FROM public.merchant_leads;`);
    await client.query(`DELETE FROM public.merchant_onboarding;`);
    await client.query(`DELETE FROM public.merchant_subscriptions;`);

    // 5. Clear Store Sub-entities & Operational Data
    console.log('🧹 Clearing store operational tables...');
    await client.query(`DELETE FROM public.customer_coupons;`);
    await client.query(`DELETE FROM public.store_wallets;`);
    await client.query(`DELETE FROM public.store_customers;`);
    await client.query(`DELETE FROM public.catalog_items;`);
    await client.query(`DELETE FROM public.pos_refunds;`);
    await client.query(`DELETE FROM public.pos_cash_movements;`);
    await client.query(`DELETE FROM public.pos_shifts;`);
    await client.query(`DELETE FROM public.store_orders;`);
    await client.query(`DELETE FROM public.service_bookings;`);
    await client.query(`DELETE FROM public.store_specialists;`);
    await client.query(`DELETE FROM public.driver_settlements;`);
    await client.query(`DELETE FROM public.store_drivers;`);
    await client.query(`DELETE FROM public.staff_sessions;`);
    await client.query(`DELETE FROM public.store_staff;`);
    await client.query(`DELETE FROM public.store_branches;`);
    await client.query(`DELETE FROM public.privileges;`);
    await client.query(`DELETE FROM public.tiers;`);

    // Nullify references from stores to partners
    await client.query(`UPDATE public.stores SET partner_id = NULL;`);

    // 6. Delete all stores
    console.log('🧹 Deleting all test stores...');
    await client.query(`DELETE FROM public.stores;`);

    // 7. Clear Partner & Affiliate Data
    console.log('🧹 Clearing partners and affiliates...');
    await client.query(`DELETE FROM public.partner_targets;`);
    await client.query(`DELETE FROM public.referrals;`);
    await client.query(`DELETE FROM public.partner_accounts;`);
    await client.query(`DELETE FROM public.affiliates;`);

    // 8. Clean test auth.users (strictly preserve super admin and platform accounts)
    console.log('🧹 Cleaning test users from auth.users...');
    const deletedAuth = await client.query(`
      DELETE FROM auth.users 
      WHERE email NOT IN (
        'taeybsalah@gmail.com', 
        'admin@radar.com', 
        'admin@sdeemalathr.com', 
        'owner@sdeemalathr.com'
      );
    `);
    console.log(`Deleted ${deletedAuth.rowCount} non-admin auth users.`);

    await client.query('COMMIT');
    console.log('✅ CLEAN SLATE RESET TRANSACTION COMMITTED SUCCESSFULLY!');

    // 9. Verification of Preserved Sovereign Assets
    console.log('\n--- 🛡️ VERIFYING PRESERVED SOVEREIGN ASSETS ---');
    const tenantsCheck = await client.query(`SELECT id, name, slug, custom_domain FROM public.tenants;`);
    console.log('Tenants preserved:', tenantsCheck.rows);

    const plansCheck = await client.query(`SELECT id, tenant_id, name, tier_level, monthly_amount, yearly_amount FROM public.billing_plans ORDER BY tenant_id, tier_level;`);
    console.log('Billing plans preserved (count: ' + plansCheck.rows.length + '):', plansCheck.rows);

    const superAdminCheck = await client.query(`SELECT email, full_name, role FROM public.super_admin_users;`);
    console.log('Super admins preserved:', superAdminCheck.rows);

    const masterAdminCheck = await client.query(`SELECT email FROM public.master_admins;`);
    console.log('Master admins preserved:', masterAdminCheck.rows);

    const authCheck = await client.query(`SELECT id, email FROM auth.users;`);
    console.log('Auth users preserved:', authCheck.rows);

    const storesCount = await client.query(`SELECT COUNT(*) FROM public.stores;`);
    console.log('Stores remaining count (should be 0):', storesCount.rows[0].count);

    const partnersCount = await client.query(`SELECT COUNT(*) FROM public.partner_accounts;`);
    console.log('Partners remaining count (should be 0):', partnersCount.rows[0].count);

    const invoicesCount = await client.query(`SELECT COUNT(*) FROM public.store_invoices;`);
    console.log('Invoices remaining count (should be 0):', invoicesCount.rows[0].count);

    const ledgerCount = await client.query(`SELECT COUNT(*) FROM public.financial_ledger;`);
    console.log('Ledger remaining count (should be 0):', ledgerCount.rows[0].count);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Clean slate failed, rolled back:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runCleanSlate().catch(err => {
  console.error(err);
  process.exit(1);
});

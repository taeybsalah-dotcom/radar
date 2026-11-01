/**
 * ==============================================================================
 * 🏛️ AL-ATHAR CORE (منصة الأثر السحابية) - AUTOMATED SENTINEL GUARD
 * File: scripts/sentinel.cjs
 * Goal: Continuous automated verification of multi-tenant database isolation,
 *       structural constraints, RLS policies, RPC security, and dual-session isolation.
 * Reference: docs/TENANT_ISOLATION_PLAN.md (Section 3 & 4)
 * ==============================================================================
 */

const pg = require('pg');
const { Client } = pg;
const { createClient } = require('@supabase/supabase-js');

const PG_CONNECTION_STRING =
  process.env.DATABASE_URL ||
  'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function logResult(status, name, details = '') {
  totalChecks++;
  if (status) {
    passedChecks++;
    console.log(`  [PASS] ${name}${details ? ' -> ' + details : ''}`);
  } else {
    failedChecks++;
    console.error(`  [FAIL] ${name}${details ? ' -> ' + details : ''}`);
  }
}

async function runSentinel() {
  console.log('\n================================================================');
  console.log('🏛️ AL-ATHAR CORE: SENTINEL AUTOMATED ISOLATION AUDIT');
  console.log('================================================================\n');

  const pgClient = new Client({ connectionString: PG_CONNECTION_STRING });
  await pgClient.connect();

  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // =========================================================================
    // 1️⃣ STRUCTURAL AUDIT (Direct PostgreSQL Inspection)
    // =========================================================================
    console.log('📋 PART 1: Operational Tables Structure & RLS Verification');

    // Discover all operational tables in public schema that should be isolated
    const tablesRes = await pgClient.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN (
          'schema_migrations', 'tenants', 'tenant_branding',
          'platform_system_config', 'platform_integrations', 'reseller_master_auth',
          'reseller_instances', 'master_admins', 'pin_login_attempts', 'rate_limit_counters',
          'rate_limit_events', 'super_admin_users'
        )
      ORDER BY table_name;
    `);

    const operationalTables = tablesRes.rows.map(r => r.table_name);
    console.log(`   Found ${operationalTables.length} operational tables to inspect in public schema.\n`);

    for (const table of operationalTables) {
      // 1. Column exists & type
      const colRes = await pgClient.query(`
        SELECT data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id'
      `, [table]);

      const col = colRes.rows[0];
      logResult(!!col && col.data_type === 'text', `Table [${table}] - tenant_id text column`, col ? col.data_type : 'MISSING');

      // 2. NOT NULL constraint
      logResult(col?.is_nullable === 'NO', `Table [${table}] - tenant_id NOT NULL constraint`, `is_nullable=${col?.is_nullable}`);

      // 3. No permanent default
      logResult(!col?.column_default, `Table [${table}] - Zero permanent default for tenant_id`, `default=${col?.column_default || 'NONE'}`);

      // 4. Index on tenant_id
      const idxRes = await pgClient.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1
          AND (indexdef LIKE '%(tenant_id)%' OR indexname = 'idx_' || $1 || '_tenant_id')
      `, [table]);
      logResult(idxRes.rows.length > 0, `Table [${table}] - Index on tenant_id`, idxRes.rows.map(r => r.indexname).join(', '));

      // 5. RLS Enabled
      const rlsRes = await pgClient.query(`
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = $1 AND relnamespace = 'public'::regnamespace
      `, [table]);
      const rls = rlsRes.rows[0]?.relrowsecurity;
      logResult(rls === true, `Table [${table}] - RLS enabled (relrowsecurity)`, `rls=${rls}`);

      // 6. RLS Policies
      const polRes = await pgClient.query(`
        SELECT policyname, qual
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = $1
      `, [table]);

      const policies = polRes.rows.map(r => r.policyname);
      const hasIsolationSelect = policies.includes('tenant_isolation_select') || policies.includes('billing_plans_select_tenant') || policies.includes('tenant_integrations_own_manage');
      const hasServiceRole = policies.some(p => p.includes('service_role'));

      logResult(hasIsolationSelect, `Table [${table}] - Tenant isolation select policy`, policies.join(', '));
      logResult(hasServiceRole, `Table [${table}] - Service role bypass policy`, `service_role policy present`);

      // 7. Immutability trigger
      if (!['billing_plans', 'billing_webhook_events', 'credit_notes', 'tenant_integrations'].includes(table)) {
        const trgRes = await pgClient.query(`
          SELECT trigger_name
          FROM information_schema.triggers
          WHERE trigger_schema = 'public' AND event_object_table = $1 AND trigger_name = 'trg_lock_tenant_mutation'
        `, [table]);
        logResult(trgRes.rows.length > 0, `Table [${table}] - Tenant immutability lock trigger`, trgRes.rows.map(r => r.trigger_name).join(', ') || 'MISSING');
      }
    }

    // =========================================================================
    // 2️⃣ SOVEREIGN & PLATFORM TABLES AUDIT
    // =========================================================================
    console.log('\n🔒 PART 2: Sovereign Tables Hardening Verification');

    const sovereignTables = [
      'platform_system_config', 'platform_integrations', 'reseller_master_auth',
      'reseller_instances', 'master_admins', 'pin_login_attempts', 'rate_limit_counters',
      'rate_limit_events'
    ];

    for (const st of sovereignTables) {
      const existsRes = await pgClient.query(`
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1
      `, [st]);

      if (existsRes.rows.length > 0) {
        const rlsRes = await pgClient.query(`
          SELECT relrowsecurity FROM pg_class WHERE relname = $1 AND relnamespace = 'public'::regnamespace
        `, [st]);
        logResult(rlsRes.rows[0]?.relrowsecurity === true, `Sovereign table [${st}] - RLS enabled`);

        const polRes = await pgClient.query(`
          SELECT policyname, roles FROM pg_policies WHERE schemaname = 'public' AND tablename = $1
        `, [st]);
        const nonService = polRes.rows.filter(p => !p.roles.includes('service_role'));
        logResult(nonService.length === 0, `Sovereign table [${st}] - Restricted strictly to service_role`, `policies=${polRes.rows.map(r => r.policyname).join(', ')}`);
      }
    }

    // =========================================================================
    // 3️⃣ FUNCTION PERMISSION & SECURITY DEFINER AUDIT
    // =========================================================================
    console.log('\n⚙️ PART 3: Function Security & Permission Lockdown');

    // exec_master_sql must NOT be executable by public or anon
    const masterSqlPermRes = await pgClient.query(`
      SELECT grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name = 'exec_master_sql';
    `);
    const masterGrantees = masterSqlPermRes.rows.map(r => r.grantee);
    const hasAnonMaster = masterGrantees.includes('anon') || masterGrantees.includes('PUBLIC');
    logResult(!hasAnonMaster, 'exec_master_sql locked against anon and PUBLIC access', `grantees: ${masterGrantees.join(', ')}`);

    // current_tenant_id function exists and is SECURITY DEFINER
    const fnRes = await pgClient.query(`
      SELECT prosecdef
      FROM pg_proc
      WHERE proname = 'current_tenant_id' AND pronamespace = 'public'::regnamespace;
    `);
    logResult(fnRes.rows[0]?.prosecdef === true, 'current_tenant_id is SECURITY DEFINER');

    // =========================================================================
    // 4️⃣ BEHAVIORAL DUAL-SESSION VERIFICATION (API Simulation)
    // =========================================================================
    console.log('\n🌐 PART 4: Behavioral Dual-Session Isolation (Radar vs Sadeem)');

    // 1. Radar Domain
    const { data: radarTenant } = await sbAnon.rpc('get_active_tenant_by_domain', { p_host: 'myradar.sarl' });
    logResult(radarTenant && radarTenant.id === 'radar', 'myradar.sarl maps to tenant_id=radar', `name=${radarTenant?.name}`);

    // 2. Sadeem Domain
    const { data: sadeemTenant } = await sbAnon.rpc('get_active_tenant_by_domain', { p_host: 'sdeemalathr.com' });
    logResult(sadeemTenant && sadeemTenant.id === 'sadeem', 'sdeemalathr.com maps to tenant_id=sadeem', `name=${sadeemTenant?.name}`);

    // 3. Radar Branding
    const { data: radarBrand } = await sbAnon.rpc('get_tenant_branding_by_domain', { p_host: 'myradar.sarl' });
    logResult(radarBrand && radarBrand.brand_name === 'رادار' && radarBrand.primary_color === '#F59E0B', 'Radar theme isolation (#F59E0B / رادار)');

    // 4. Sadeem Branding
    const { data: sadeemBrand } = await sbAnon.rpc('get_tenant_branding_by_domain', { p_host: 'sdeemalathr.com' });
    logResult(sadeemBrand && sadeemBrand.brand_name === 'سديم الأثر' && sadeemBrand.primary_color === '#10B981', 'Sadeem theme isolation (#10B981 / سديم الأثر)');

    // 5. Radar Billing Plans
    const { data: rPlans } = await sbAnon.rpc('get_public_billing_plans', { p_host: 'myradar.sarl' });
    logResult(rPlans && rPlans.length > 0 && rPlans.every(p => p.tenant_id === 'radar'), `Radar billing plans isolation (${rPlans?.length} plans, all tenant=radar)`);

    // 6. Sadeem Billing Plans
    const { data: sPlans } = await sbAnon.rpc('get_public_billing_plans', { p_host: 'sdeemalathr.com' });
    logResult(sPlans && sPlans.length > 0 && sPlans.every(p => p.tenant_id === 'sadeem'), `Sadeem billing plans isolation (${sPlans?.length} plans, all tenant=sadeem)`);

    // 7. Zero Shared Plan IDs
    const sharedPlans = (rPlans || []).filter(rp => (sPlans || []).some(sp => sp.id === rp.id));
    logResult(sharedPlans.length === 0, 'Zero shared plan IDs between Radar and Sadeem');

    // 8. Lead Ingestion via Radar
    const phoneR = '059' + Math.floor(1000000 + Math.random() * 9000000);
    const { data: rLead, error: rLeadErr } = await sbAnon.rpc('submit_merchant_lead_rpc', {
      p_payload: { store_name: 'فحص الحارس رادار', phone: phoneR },
      p_host: 'myradar.sarl'
    });
    logResult(rLead && rLead.success && rLead.tenant_id === 'radar', 'Lead submitted via myradar.sarl auto-tagged tenant=radar', rLeadErr ? rLeadErr.message : `tenant=${rLead?.tenant_id}`);

    // 9. Lead Ingestion via Sadeem
    const phoneS = '059' + Math.floor(1000000 + Math.random() * 9000000);
    const { data: sLead, error: sLeadErr } = await sbAnon.rpc('submit_merchant_lead_rpc', {
      p_payload: { store_name: 'فحص الحارس سديم', phone: phoneS },
      p_host: 'sdeemalathr.com'
    });
    logResult(sLead && sLead.success && sLead.tenant_id === 'sadeem', 'Lead submitted via sdeemalathr.com auto-tagged tenant=sadeem', sLeadErr ? sLeadErr.message : `tenant=${sLead?.tenant_id}`);

    // 10. Anon Table Lockdown
    const { data: anonStores } = await sbAnon.from('stores').select('*');
    logResult(!anonStores || anonStores.length === 0, 'Anon direct read on stores returns 0 rows');

    const { data: anonAffiliates } = await sbAnon.from('affiliates').select('*');
    logResult(!anonAffiliates || anonAffiliates.length === 0, 'Anon direct read on affiliates returns 0 rows');

    const { data: anonCust } = await sbAnon.from('store_customers').select('*');
    logResult(!anonCust || anonCust.length === 0, 'Anon direct read on store_customers returns 0 rows');

  } finally {
    await pgClient.end();
  }

  // =========================================================================
  // 🏁 FINAL SENTINEL AUDIT REPORT
  // =========================================================================
  console.log('\n================================================================');
  console.log(`🏁 SENTINEL AUDIT SUMMARY: ${passedChecks} PASSED, ${failedChecks} FAILED (TOTAL: ${totalChecks})`);
  console.log('================================================================\n');

  if (failedChecks === 0) {
    console.log('✨ [SUCCESS] ALL SENTINEL CHECKS PASSED: Zero leaks, 100% tenant isolation certified.');
    process.exit(0);
  } else {
    console.error(`🚨 [FAILURE] ${failedChecks} SENTINEL CHECKS FAILED: Review the log above immediately.`);
    process.exit(1);
  }
}

runSentinel().catch(err => {
  console.error('Fatal error running Sentinel:', err);
  process.exit(1);
});

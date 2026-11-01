import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function runTests() {
  await client.connect();
  console.log('========================================================');
  console.log('🧪 VERIFYING V2 ENGINE FIXES & SECURITY HARDENING');
  console.log('========================================================');

  await client.query('BEGIN');

  try {
    // ------------------------------------------------------------------
    // TEST 1: Automatic Billing Plans Seeding on New Tenant Creation
    // ------------------------------------------------------------------
    console.log('\n--- TEST 1: Tenant Seeding Trigger ---');
    await client.query(`
      INSERT INTO tenants (id, name, slug, custom_domain)
      VALUES ('new_tenant_test', 'وكيل جديد تجريبي', 'new-tenant-test', 'test-tenant.com')
    `);

    const seededPlans = await client.query(`
      SELECT code, name, tier_level, monthly_amount, yearly_amount 
      FROM billing_plans 
      WHERE tenant_id = 'new_tenant_test'
      ORDER BY tier_level
    `);
    console.log('Seeded plans for new tenant:', seededPlans.rows);
    if (seededPlans.rows.length === 3) {
      console.log('✅ TEST 1 PASSED: 3 Default Tiers automatically seeded on tenant creation.');
    } else {
      throw new Error(`TEST 1 FAILED: Expected 3 plans, got ${seededPlans.rows.length}`);
    }

    // ------------------------------------------------------------------
    // TEST 2: Block Downgrade when Switching from Monthly to Annual
    // ------------------------------------------------------------------
    console.log('\n--- TEST 2: Tier Downgrade Prevention across Cycles ---');
    const planRadarBasic = (await client.query("SELECT id FROM billing_plans WHERE code = 'BASIC' AND tenant_id = 'radar'")).rows[0].id;
    const planRadarAdv = (await client.query("SELECT id FROM billing_plans WHERE code = 'ADVANCED' AND tenant_id = 'radar'")).rows[0].id;
    const planRadarPro = (await client.query("SELECT id FROM billing_plans WHERE code = 'PRO' AND tenant_id = 'radar'")).rows[0].id;

    // Create a merchant on Tier 3 (PRO) Monthly
    const proStoreRes = await client.query(`
      INSERT INTO stores (name, slug, tenant_id, subscription_plan_id, plan_code, setup_fee_paid, subscription_start_date, subscription_end_date)
      VALUES ('متجر المحترفين', 'mock-pro-store', 'radar', $1, 'PRO', true, NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days')
      RETURNING id
    `, [planRadarPro]);
    const proStoreId = proStoreRes.rows[0].id;

    await client.query(`
      INSERT INTO store_invoices (store_id, tenant_id, invoice_number, amount, status, invoice_type, paid_at, metadata)
      VALUES ($1, 'radar', 'INV-PRO-M-01', 279.00, 'paid', 'setup', NOW() - INTERVAL '10 days', '{"billing_cycle": "MONTHLY"}')
    `, [proStoreId]);

    // Attempt 2A: Tier 3 Monthly -> Tier 1 Yearly (Must FAIL!)
    const resDowngradeToBasicYearly = await client.query(
      "SELECT public.calculate_subscription_upgrade($1, $2, 'YEARLY') AS res",
      [proStoreId, planRadarBasic]
    );
    console.log('Attempt 2A (PRO Monthly -> BASIC Yearly):', resDowngradeToBasicYearly.rows[0].res);
    if (resDowngradeToBasicYearly.rows[0].res.success === false && resDowngradeToBasicYearly.rows[0].res.error.includes('أقل من مستواك الحالي')) {
      console.log('✅ TEST 2A PASSED: Tier downgrade to BASIC Annual blocked correctly.');
    } else {
      throw new Error('TEST 2A FAILED: Tier downgrade was not blocked!');
    }

    // Attempt 2B: Tier 3 Monthly -> Tier 2 Yearly (Must FAIL!)
    const resDowngradeToAdvYearly = await client.query(
      "SELECT public.calculate_subscription_upgrade($1, $2, 'YEARLY') AS res",
      [proStoreId, planRadarAdv]
    );
    console.log('Attempt 2B (PRO Monthly -> ADVANCED Yearly):', resDowngradeToAdvYearly.rows[0].res);
    if (resDowngradeToAdvYearly.rows[0].res.success === false && resDowngradeToAdvYearly.rows[0].res.error.includes('أقل من مستواك الحالي')) {
      console.log('✅ TEST 2B PASSED: Tier downgrade to ADVANCED Annual blocked correctly.');
    } else {
      throw new Error('TEST 2B FAILED: Tier downgrade was not blocked!');
    }

    // Attempt 2C: Tier 3 Monthly -> Tier 3 Yearly (Must SUCCEED! Same tier annual commitment)
    const resCommitProYearly = await client.query(
      "SELECT public.calculate_subscription_upgrade($1, $2, 'YEARLY') AS res",
      [proStoreId, planRadarPro]
    );
    console.log('Attempt 2C (PRO Monthly -> PRO Yearly):', resCommitProYearly.rows[0].res);
    if (resCommitProYearly.rows[0].res.success === true && resCommitProYearly.rows[0].res.has_discount === true) {
      console.log('✅ TEST 2C PASSED: PRO Monthly to PRO Yearly upgrade allowed with credit deducted.');
    } else {
      throw new Error('TEST 2C FAILED: Expected success for PRO Annual upgrade.');
    }

    // ------------------------------------------------------------------
    // TEST 3: Accurate v_total_days (Using last invoice paid_at, not old store start date)
    // ------------------------------------------------------------------
    console.log('\n--- TEST 3: Accurate v_total_days & Daily Rate ---');
    // Store was created 150 days ago, but last invoice was 10 days ago for 30 days
    const oldStoreRes = await client.query(`
      INSERT INTO stores (name, slug, tenant_id, subscription_plan_id, plan_code, setup_fee_paid, subscription_start_date, subscription_end_date)
      VALUES ('متجر قديم', 'mock-old-store', 'radar', $1, 'BASIC', true, NOW() - INTERVAL '150 days', NOW() + INTERVAL '20 days')
      RETURNING id
    `, [planRadarBasic]);
    const oldStoreId = oldStoreRes.rows[0].id;

    await client.query(`
      INSERT INTO store_invoices (store_id, tenant_id, invoice_number, amount, status, invoice_type, paid_at, metadata)
      VALUES ($1, 'radar', 'INV-OLD-M-01', 99.00, 'paid', 'renewal', NOW() - INTERVAL '10 days', '{"billing_cycle": "MONTHLY"}')
    `, [oldStoreId]);

    const resOldStoreUpgrade = await client.query(
      "SELECT public.calculate_subscription_upgrade($1, $2, 'MONTHLY') AS res",
      [oldStoreId, planRadarAdv]
    );
    const rOld = resOldStoreUpgrade.rows[0].res;
    console.log('Old Store Upgrade Result:', rOld);
    // Out of 99 SAR for 30 days, 20 days remaining should yield ~66 SAR credit:
    console.log('Unused Credit:', rOld.unused_credit, '(Expected ~66 SAR)');
    if (rOld.unused_credit >= 60 && rOld.unused_credit <= 70) {
      console.log('✅ TEST 3 PASSED: Daily rate correctly based on 30-day invoice cycle, NOT 150 days.');
    } else {
      throw new Error(`TEST 3 FAILED: Unused credit skewed (${rOld.unused_credit})!`);
    }

    // ------------------------------------------------------------------
    // TEST 4: Elimination of >= 900 SAR Heuristic (High-value monthly store)
    // ------------------------------------------------------------------
    console.log('\n--- TEST 4: High-value monthly store (>= 900 SAR) recognized as MONTHLY ---');
    const highMonthlyStoreRes = await client.query(`
      INSERT INTO stores (name, slug, tenant_id, subscription_plan_id, plan_code, setup_fee_paid, subscription_start_date, subscription_end_date)
      VALUES ('متجر فروع متعددة شهري', 'mock-branches-store', 'radar', $1, 'ADVANCED', true, NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days')
      RETURNING id
    `, [planRadarAdv]);
    const highStoreId = highMonthlyStoreRes.rows[0].id;

    // Paid 1500 SAR for monthly cycle
    await client.query(`
      INSERT INTO store_invoices (store_id, tenant_id, invoice_number, amount, status, invoice_type, paid_at, metadata)
      VALUES ($1, 'radar', 'INV-HIGH-M-01', 1500.00, 'paid', 'renewal', NOW() - INTERVAL '5 days', '{"billing_cycle": "MONTHLY"}')
    `, [highStoreId]);

    const resHighMonthlyUpgrade = await client.query(
      "SELECT public.calculate_subscription_upgrade($1, $2, 'YEARLY') AS res",
      [highStoreId, planRadarPro]
    );
    console.log('High Monthly Upgrade to Yearly Result:', resHighMonthlyUpgrade.rows[0].res);
    if (resHighMonthlyUpgrade.rows[0].res.success === true) {
      console.log('✅ TEST 4 PASSED: High-value store with monthly metadata correctly recognized as MONTHLY and allowed to upgrade to YEARLY.');
    } else {
      throw new Error('TEST 4 FAILED: High-value monthly store was falsely blocked!');
    }

    // ------------------------------------------------------------------
    // TEST 5: Server-side Amount Enforcement in process_store_payment_atomic
    // ------------------------------------------------------------------
    console.log('\n--- TEST 5: Server-side Payment Enforcement ---');
    // If client passes p_amount = 1.00 SAR for upgrade, server RPC MUST override with calculate_subscription_upgrade!
    const atomicRes = await client.query(`
      SELECT public.process_store_payment_atomic(
        p_store_id => $1,
        p_invoice_type => 'upgrade',
        p_amount => 1.00,
        p_plan_id => $2,
        p_duration_months => 12,
        p_master_token => 'SEC_SOVEREIGN_MASTER_BYPASS_2026_SAT'
      ) AS res
    `, [proStoreId, planRadarPro]);

    console.log('Atomic Payment Result:', atomicRes.rows[0].res);
    // The server must calculate the true gross amount (around 2790 - 186 = 2604 SAR), NOT 1.00 SAR!
    if (atomicRes.rows[0].res.gross_amount > 1000) {
      console.log(`✅ TEST 5 PASSED: Server overrode client 1.00 SAR with verified net amount: ${atomicRes.rows[0].res.gross_amount} SAR.`);
    } else {
      throw new Error(`TEST 5 FAILED: Server trusted client amount: ${atomicRes.rows[0].res.gross_amount}`);
    }

  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }

  console.log('\n========================================================');
  console.log('🎉 ALL 5 V2 SECURITY & PRORATION TESTS PASSED 100%!');
  console.log('========================================================');
}

runTests().catch(console.error);

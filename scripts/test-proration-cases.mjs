import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function runTests() {
  await client.connect();
  console.log('Testing Proration & Business Rules...');

  await client.query('BEGIN');

  try {
    const planBasic = (await client.query("SELECT id FROM billing_plans WHERE code = 'BASIC' AND tenant_id = 'radar'")).rows[0].id;
    const planAdv = (await client.query("SELECT id FROM billing_plans WHERE code = 'ADVANCED' AND tenant_id = 'radar'")).rows[0].id;
    const planPro = (await client.query("SELECT id FROM billing_plans WHERE code = 'PRO' AND tenant_id = 'radar'")).rows[0].id;

    // Test 1: Active Paid Monthly Store (99 SAR, 15 of 30 days used -> ~49.5 SAR credit)
    const storeRes = await client.query(`
      INSERT INTO stores (name, slug, tenant_id, subscription_plan_id, plan_code, setup_fee_paid, subscription_start_date, subscription_end_date)
      VALUES ('متجر المحاكاة', 'mock-proration-test', 'radar', $1, 'BASIC', true, NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days')
      RETURNING id
    `, [planBasic]);
    const storeId = storeRes.rows[0].id;

    await client.query(`
      INSERT INTO store_invoices (store_id, tenant_id, invoice_number, amount, status, invoice_type, paid_at, metadata)
      VALUES ($1, 'radar', 'INV-TEST-M-01', 99.00, 'paid', 'setup', NOW() - INTERVAL '15 days', '{"billing_cycle": "MONTHLY"}')
    `, [storeId]);

    // Test 1A: Upgrade Monthly Basic -> Monthly Advanced (179 - 49.5 = 129.5 SAR)
    const resMonthly = await client.query("SELECT public.calculate_subscription_upgrade($1, $2, 'MONTHLY') AS res", [storeId, planAdv]);
    console.log('TEST 1A: Monthly -> Monthly Upgrade:');
    console.log(JSON.stringify(resMonthly.rows[0].res, null, 2));

    // Test 1B: Upgrade Monthly Basic -> Yearly Advanced (1790 - 49.5 = 1740.5 SAR)
    const resYearly = await client.query("SELECT public.calculate_subscription_upgrade($1, $2, 'YEARLY') AS res", [storeId, planAdv]);
    console.log('TEST 1B: Monthly -> Yearly Upgrade:');
    console.log(JSON.stringify(resYearly.rows[0].res, null, 2));

    // Test 2: Yearly Subscriber trying to downgrade to Monthly (Must be blocked!)
    const yearlyStoreRes = await client.query(`
      INSERT INTO stores (name, slug, tenant_id, subscription_plan_id, plan_code, setup_fee_paid, subscription_start_date, subscription_end_date)
      VALUES ('متجر سنوي', 'mock-yearly-test', 'radar', $1, 'BASIC', true, NOW() - INTERVAL '30 days', NOW() + INTERVAL '335 days')
      RETURNING id
    `, [planBasic]);
    const yearlyStoreId = yearlyStoreRes.rows[0].id;

    await client.query(`
      INSERT INTO store_invoices (store_id, tenant_id, invoice_number, amount, status, invoice_type, paid_at, metadata)
      VALUES ($1, 'radar', 'INV-TEST-Y-01', 990.00, 'paid', 'setup', NOW() - INTERVAL '30 days', '{"billing_cycle": "YEARLY"}')
    `, [yearlyStoreId]);

    const resYearlyToMonthly = await client.query("SELECT public.calculate_subscription_upgrade($1, $2, 'MONTHLY') AS res", [yearlyStoreId, planAdv]);
    console.log('TEST 2: Yearly -> Monthly Crossover Block:');
    console.log(JSON.stringify(resYearlyToMonthly.rows[0].res, null, 2));

  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

runTests().catch(console.error);

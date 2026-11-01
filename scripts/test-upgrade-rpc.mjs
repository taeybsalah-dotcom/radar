import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});
async function run() {
  await client.connect();

  // Find a store
  const storeRes = await client.query("SELECT id, name, tenant_id FROM stores LIMIT 1");
  const store = storeRes.rows[0];

  // Find a plan
  const planRes = await client.query("SELECT id, name, code FROM billing_plans WHERE tenant_id = $1 AND code = 'ADVANCED'", [store.tenant_id]);
  const plan = planRes.rows[0];

  // Call calculate_subscription_upgrade for MONTHLY
  const monthlyRes = await client.query("SELECT public.calculate_subscription_upgrade($1, $2, 'MONTHLY') AS res", [store.id, plan.id]);
  console.log('calculate_subscription_upgrade (MONTHLY):', JSON.stringify(monthlyRes.rows[0]?.res, null, 2));

  // Call calculate_subscription_upgrade for YEARLY
  const yearlyRes = await client.query("SELECT public.calculate_subscription_upgrade($1, $2, 'YEARLY') AS res", [store.id, plan.id]);
  console.log('calculate_subscription_upgrade (YEARLY):', JSON.stringify(yearlyRes.rows[0]?.res, null, 2));

  await client.end();
}
run().catch(console.error);

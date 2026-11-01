import fs from 'fs';
import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});
async function run() {
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/20261102_modern_rakeen_subscription_plans_and_proration.sql', 'utf8');
  console.log('Applying migration...');
  await client.query(sql);
  console.log('Migration applied successfully!');

  // Verify billing_plans
  const res = await client.query('SELECT id, code, name, tier_level, monthly_amount, yearly_amount, extra_branch_price, tenant_id FROM billing_plans ORDER BY tenant_id, tier_level');
  console.log('Updated billing_plans:', res.rows);

  await client.end();
}
run().catch(console.error);

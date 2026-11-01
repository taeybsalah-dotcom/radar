import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT proname, pg_get_functiondef(oid) as def
    FROM pg_proc 
    WHERE proname = 'update_billing_plan_atomic'
  `);
  for (const row of res.rows) {
    console.log('=== FUNCTION ===', row.proname);
    console.log(row.def);
  }

  const plans = await client.query(`
    SELECT id, tenant_id, name, code, tier_level, monthly_amount, yearly_amount, extra_branch_price, extra_branch_yearly_price, badge_text, cumulative_note, amount, updated_at
    FROM billing_plans
    ORDER BY tenant_id, tier_level
  `);
  console.log('\n=== CURRENT BILLING PLANS ===');
  console.table(plans.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

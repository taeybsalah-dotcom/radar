import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT id, tenant_id, name, tier_level, monthly_amount, yearly_amount, badge_text, cumulative_note, features_list 
    FROM public.billing_plans 
    ORDER BY tenant_id, tier_level;
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);

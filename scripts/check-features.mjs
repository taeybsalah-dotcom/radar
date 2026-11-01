import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT id, tenant_id, code, name, features_list
    FROM billing_plans
    ORDER BY tenant_id, tier_level
  `);
  for (const r of res.rows) {
    console.log(r.tenant_id, r.code, r.name, JSON.stringify(r.features_list));
  }
  await client.end();
}
main();

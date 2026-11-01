import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  console.log('Connected to DB');

  const res1 = await client.query('SELECT id, name, tier_level, monthly_amount, yearly_amount, tenant_id FROM get_public_billing_plans($1)', ['myradar.sarl']);
  console.log('Radar plans:', res1.rows);

  const res2 = await client.query('SELECT id, name, tier_level, monthly_amount, yearly_amount, tenant_id FROM get_public_billing_plans($1)', ['sdeemalathr.com']);
  console.log('Sadeem plans:', res2.rows);

  const res3 = await client.query('SELECT id, name, tier_level, monthly_amount, yearly_amount, tenant_id FROM get_public_billing_plans($1)', ['localhost']);
  console.log('Localhost plans:', res3.rows);

  await client.end();
}

main().catch(console.error);

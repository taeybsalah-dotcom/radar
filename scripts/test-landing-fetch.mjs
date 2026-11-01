import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT * FROM public.get_public_billing_plans('myradar.sarl');
  `);
  console.log('Result for myradar.sarl:');
  for (const r of res.rows) {
    console.log(r.name, 'monthly:', r.monthly_amount, 'yearly:', r.yearly_amount);
  }

  const res2 = await client.query(`
    SELECT * FROM public.get_public_billing_plans('localhost');
  `);
  console.log('Result for localhost:', res2.rows.length);

  const res3 = await client.query(`
    SELECT * FROM public.get_public_billing_plans('radar.taeybsalah.workers.dev');
  `);
  console.log('Result for radar.taeybsalah.workers.dev:', res3.rows.length);

  await client.end();
}
main();

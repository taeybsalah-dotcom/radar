import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();

  const oRes = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'store_orders'");
  console.log('store_orders columns:', oRes.rows.map(r => `${r.column_name} (${r.data_type})`));

  const bRes = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'service_bookings'");
  console.log('service_bookings columns:', bRes.rows.map(r => `${r.column_name} (${r.data_type})`));

  await client.end();
}

run().catch(console.error);

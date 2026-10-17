import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();

  console.log('=== STORES COLUMNS ===');
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'stores'");
  console.log(res.rows.map(r => `${r.column_name} (${r.data_type})`));

  console.log('=== CURRENT STORES ROWS ===');
  const stores = await client.query("SELECT id, name, slug FROM stores LIMIT 10");
  console.table(stores.rows);

  console.log('=== STORE_STAFF COLUMNS ===');
  const staffRes = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'store_staff'");
  console.log(staffRes.rows.map(r => `${r.column_name} (${r.data_type})`));

  await client.end();
}

run().catch(console.error);

import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();

  const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'catalog_items'");
  console.log('catalog_items columns:', cols.rows.map(r => `${r.column_name} (${r.data_type})`));

  const items = await client.query("SELECT id, store_id, name, item_type FROM catalog_items LIMIT 20");
  console.table(items.rows);

  const sess = await client.query("SELECT id, store_id, staff_id, role, created_at, expires_at FROM staff_sessions ORDER BY created_at DESC LIMIT 10");
  console.table(sess.rows);

  const fnIns = await client.query("SELECT prosrc FROM pg_proc WHERE proname = '_radar_row_insert'");
  console.log('_radar_row_insert source:');
  console.log(fnIns.rows[0]?.prosrc);

  await client.end();
}

run().catch(console.error);

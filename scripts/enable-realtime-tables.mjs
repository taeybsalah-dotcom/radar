import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to Postgres.');

  // 1. Add tables to supabase_realtime publication
  const tablesToAdd = [
    'store_customers',
    'stores',
    'customer_coupons',
    'store_branches',
    'store_specialists',
    'store_staff',
    'tiers'
  ];

  for (const table of tablesToAdd) {
    try {
      await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE ${table};`);
      console.log(`✅ Added ${table} to supabase_realtime`);
    } catch (e) {
      if (e.message.includes('already in publication')) {
        console.log(`ℹ️ ${table} is already in supabase_realtime`);
      } else {
        console.warn(`⚠️ Error adding ${table}:`, e.message);
      }
    }

    try {
      await client.query(`ALTER TABLE ${table} REPLICA IDENTITY FULL;`);
      console.log(`✅ Set REPLICA IDENTITY FULL on ${table}`);
    } catch (e) {
      console.warn(`⚠️ Error setting replica identity on ${table}:`, e.message);
    }
  }

  // Verify publication
  const res = await client.query("SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;");
  console.log('Current Realtime tables:', res.rows.map(r => r.tablename));

  await client.end();
}

run().catch(console.error);

import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();

  console.log('=== 1. STORES COLUMNS ===');
  const storeCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'stores' 
    ORDER BY ordinal_position
  `);
  console.log(storeCols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

  console.log('\n=== 2. PARTNER / AFFILIATE TABLES ===');
  const partTables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND (
      table_name LIKE '%partner%' OR 
      table_name LIKE '%affiliate%' OR 
      table_name LIKE '%referral%' OR 
      table_name LIKE '%commission%'
    )
  `);
  console.log('Tables:', partTables.rows.map(r => r.table_name));

  for (const t of partTables.rows) {
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = '${t.table_name}'
    `);
    console.log(`\nColumns of ${t.table_name}:`, cols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  }

  console.log('\n=== 3. FOREIGN KEYS IN PARTNER TABLES ===');
  const fkeys = await client.query(`
    SELECT
      tc.table_name, kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND (
      tc.table_name LIKE '%partner%' OR tc.table_name LIKE '%affiliate%' OR tc.table_name LIKE '%store%'
    );
  `);
  console.table(fkeys.rows);

  console.log('\n=== 4. CHECK store_id FORMAT ACROSS OPERATIONAL TABLES ===');
  const tablesWithStoreId = ['store_customers', 'customer_coupons', 'store_orders', 'service_bookings'];
  for (const tw of tablesWithStoreId) {
    try {
      const colInfo = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${tw}' AND column_name = 'store_id'
      `);
      const q = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE store_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as uuid_count,
          COUNT(*) FILTER (WHERE store_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as non_uuid_count
        FROM public.${tw}
      `);
      console.log(`${tw} (store_id type: ${colInfo.rows[0]?.data_type}):`, q.rows[0]);
    } catch (e) {
      console.log(`Error checking ${tw}:`, e.message);
    }
  }

  console.log('\n=== 5. CHECK SAMPLE ROWS IN PARTNERS / REFERRALS ===');
  for (const t of partTables.rows) {
    try {
      const sample = await client.query(`SELECT * FROM public.${t.table_name} LIMIT 2`);
      console.log(`Sample from ${t.table_name}:`, sample.rows);
    } catch (e) {
      console.log(`Error sampling ${t.table_name}:`, e.message);
    }
  }

  console.log('\n=== 6. CHECK STORES PARTNER COLUMNS ===');
  const storePartnerCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'stores' AND (
      column_name LIKE '%partner%' OR 
      column_name LIKE '%referral%' OR 
      column_name LIKE '%commission%' OR
      column_name LIKE '%affiliate%'
    )
  `);
  console.log('Partner cols in stores:', storePartnerCols.rows);

  await client.end();
}

run().catch(console.error);

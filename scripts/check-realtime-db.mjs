import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const tablesRes = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;");
  console.log('All public tables:', tablesRes.rows.map(r => r.tablename));
  const res = await client.query("SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;");
  console.log('Realtime tables in supabase_realtime publication:', res.rows.map(r => r.tablename));

  // Check RLS on these tables
  const custPol = await client.query(`
    SELECT tablename, policyname, roles, cmd, qual 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'store_customers';
  `);
  console.log('store_customers policies:');
  console.table(custPol.rows);

  // Check replica identity on these tables
  const repRes = await client.query(`
    SELECT c.relname, c.relreplident
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('customers', 'store_orders', 'service_bookings', 'stores', 'catalog_items', 'customer_coupons', 'store_staff', 'store_branches')
    ORDER BY c.relname;
  `);
  console.log('Replica identity (d=default, f=full, n=nothing, i=index):');
  console.table(repRes.rows);

  // Check SELECT policies on these tables for anon role
  const polRes = await client.query(`
    SELECT tablename, policyname, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN ('customers', 'store_orders', 'service_bookings', 'stores', 'catalog_items', 'customer_coupons', 'store_staff', 'store_branches')
    ORDER BY tablename, policyname;
  `);
  console.log('Policies:');
  console.table(polRes.rows.map(p => ({
    table: p.tablename,
    name: p.policyname,
    roles: p.roles,
    cmd: p.cmd,
    qual: p.qual ? p.qual.substring(0, 50) : ''
  })));

  await client.end();
}

run().catch(console.error);

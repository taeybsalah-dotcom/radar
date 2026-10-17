import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();

  console.log('1. Executing SQL commands...');
  await client.query('ALTER TABLE public.store_orders REPLICA IDENTITY FULL;');
  await client.query('ALTER TABLE public.service_bookings REPLICA IDENTITY FULL;');
  await client.query('ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;');
  await client.query('ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;');

  // Make sure RLS policies allow SELECT and UPDATE for public
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'store_orders'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.store_orders;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'service_bookings'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.service_bookings;
      END IF;
    END $$;
  `);

  console.log('2. Verifying Replica Identity & RLS:');
  const classRes = await client.query(`
    SELECT relname, relreplident, relrowsecurity 
    FROM pg_class 
    WHERE relname IN ('store_orders', 'service_bookings')
  `);
  console.log('pg_class results (relreplident "f" = FULL, relrowsecurity true = RLS enabled):');
  console.table(classRes.rows);

  console.log('3. Verifying Publication Membership:');
  const pubRes = await client.query(`
    SELECT pubname, schemaname, tablename 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename IN ('store_orders', 'service_bookings')
  `);
  console.table(pubRes.rows);

  console.log('4. Verifying Policies on store_orders and service_bookings:');
  const polRes = await client.query(`
    SELECT tablename, policyname, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename IN ('store_orders', 'service_bookings')
  `);
  console.table(polRes.rows);

  await client.end();
}

run().catch(console.error);

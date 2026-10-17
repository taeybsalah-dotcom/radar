import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();

  console.log('Applying policies and publication...');
  await client.query(`
    DROP POLICY IF EXISTS "Public can select bookings" ON public.service_bookings;
    DROP POLICY IF EXISTS "Public can update bookings" ON public.service_bookings;
    DROP POLICY IF EXISTS "Public can insert bookings" ON public.service_bookings;

    CREATE POLICY "Public can select bookings" ON public.service_bookings FOR SELECT TO public USING (true);
    CREATE POLICY "Public can update bookings" ON public.service_bookings FOR UPDATE TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Public can insert bookings" ON public.service_bookings FOR INSERT TO public WITH CHECK (true);

    ALTER TABLE public.service_bookings REPLICA IDENTITY FULL;
    ALTER TABLE public.store_orders REPLICA IDENTITY FULL;
  `);

  // Ensure both tables are in publication
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'service_bookings'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.service_bookings;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'store_orders'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.store_orders;
      END IF;
    END $$;
  `);

  console.log('✅ Successfully updated RLS policies and Supabase Realtime publication!');
  await client.end();
}

run().catch(console.error);

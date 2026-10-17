import pg from 'pg';
const { Client } = pg;

const DEMO_STORE_UUID = 'c0a80101-cafe-4000-8000-000000000001';
const DEMO_STORE_SLUG = 'demo-cafe';

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();
  console.log('Connected to PostgreSQL.');

  // 1. Seed or update demo-cafe in stores table
  console.log('--- 1. Ensuring demo-cafe exists in stores with valid UUID ---');
  await client.query(`
    INSERT INTO public.stores (
      id, name, slug, store_code, logo_url, primary_color, secondary_color,
      points_per_riyal, subscription_active, status, subscription_status,
      lifecycle_stage, subscription_plan, setup_fee_paid, manager_name, manager_contact,
      enable_orders, enable_bookings, enable_loyalty, owner_enable_orders, owner_enable_bookings, owner_enable_loyalty
    ) VALUES (
      $1, 'رادار كافيه التجريبي (Demo Cafe)', $2, 'RD-1000',
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&auto=format&fit=crop&q=80',
      '#0F172A', '#F59E0B', 1.0, true, 'active', 'active',
      'مشترك مدفوع', 'pro', true, 'مدير المتجر التجريبي', '0550000000',
      true, true, true, true, true, true
    )
    ON CONFLICT (id) DO UPDATE SET
      slug = EXCLUDED.slug,
      store_code = EXCLUDED.store_code,
      name = EXCLUDED.name,
      subscription_status = 'active',
      status = 'active',
      lifecycle_stage = 'مشترك مدفوع',
      enable_orders = true,
      enable_bookings = true,
      enable_loyalty = true;
  `, [DEMO_STORE_UUID, DEMO_STORE_SLUG]);

  // 2. Ensure main branch for demo-cafe
  console.log('--- 2. Ensuring main branch for demo-cafe ---');
  await client.query(`
    INSERT INTO public.store_branches (store_id, branch_code, name, is_main, status, is_open)
    VALUES ($1, 'BR-01', 'الفرع الرئيسي', true, 'active', true)
    ON CONFLICT (store_id, branch_code) DO NOTHING;
  `, [DEMO_STORE_UUID]);

  // 3. Ensure manager staff record for demo-cafe
  console.log('--- 3. Ensuring manager staff for demo-cafe ---');
  await client.query(`
    INSERT INTO public.store_staff (id, store_id, name, phone, role, pin_code, is_active)
    VALUES (
      gen_random_uuid(), $1, 'المدير العام', '0550000000', 'admin', '9999', true
    )
    ON CONFLICT DO NOTHING;
  `, [DEMO_STORE_UUID]);

  // 4. Update RLS policies on catalog_items so direct operations are allowed
  console.log('--- 4. Updating catalog_items RLS policies ---');
  await client.query(`
    DROP POLICY IF EXISTS "Public can view catalog items" ON public.catalog_items;
    DROP POLICY IF EXISTS "Public can manage catalog items" ON public.catalog_items;
    DROP POLICY IF EXISTS "Public full access on catalog items" ON public.catalog_items;

    CREATE POLICY "Public full access on catalog items" ON public.catalog_items
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true);
  `);

  // 5. Add catalog_items & privileges to supabase_realtime publication
  console.log('--- 5. Adding catalog_items and privileges to Supabase Realtime ---');
  await client.query(`
    ALTER TABLE public.catalog_items REPLICA IDENTITY FULL;
    ALTER TABLE public.privileges REPLICA IDENTITY FULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'catalog_items'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.catalog_items;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'privileges'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.privileges;
      END IF;
    END $$;
  `);

  // Verification
  console.log('--- 6. Verification ---');
  const storesRes = await client.query("SELECT id, name, slug, store_code FROM public.stores");
  console.table(storesRes.rows);

  const pubs = await client.query("SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'");
  console.log('Realtime tables:', pubs.rows.map(r => r.tablename));

  await client.end();
  console.log('=== Migration finished successfully! ===');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

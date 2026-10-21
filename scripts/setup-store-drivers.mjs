import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL!');

  // Fix fn_auto_enable_rls so it doesn't double-prefix schema
  await client.query(`
    CREATE OR REPLACE FUNCTION public.fn_auto_enable_rls()
     RETURNS event_trigger
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public', 'extensions'
    AS $function$
    DECLARE
        obj record;
    BEGIN
        FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS')
        LOOP
            IF obj.schema_name = 'public' THEN
                EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY;', obj.object_identity);
            END IF;
        END LOOP;
    END;
    $function$;
  `);
  console.log('Fixed fn_auto_enable_rls');

  // 1. Create store_drivers table
  await client.query(`
    CREATE TABLE IF NOT EXISTS store_drivers (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      branch_id TEXT,
      branch_name TEXT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      vehicle_type TEXT NOT NULL DEFAULT 'motorcycle',
      plate_number TEXT,
      pin_code TEXT DEFAULT '1234',
      is_active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'available',
      auto_break_after_delivery BOOLEAN DEFAULT false,
      current_trip_orders_count INT DEFAULT 0,
      current_trip_order_ids JSONB DEFAULT '[]'::jsonb,
      estimated_return_minutes INT DEFAULT 0,
      last_status_change_at TIMESTAMPTZ,
      commission_per_order NUMERIC(10,2) DEFAULT 0.00,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_store_drivers_store_id ON store_drivers(store_id);
    CREATE INDEX IF NOT EXISTS idx_store_drivers_branch_id ON store_drivers(branch_id);
    CREATE INDEX IF NOT EXISTS idx_store_drivers_status ON store_drivers(status);

    ALTER TABLE store_drivers ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'store_drivers' AND policyname = 'Public select store_drivers'
      ) THEN
        CREATE POLICY "Public select store_drivers" ON store_drivers FOR SELECT USING (true);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'store_drivers' AND policyname = 'Public insert store_drivers'
      ) THEN
        CREATE POLICY "Public insert store_drivers" ON store_drivers FOR INSERT WITH CHECK (true);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'store_drivers' AND policyname = 'Public update store_drivers'
      ) THEN
        CREATE POLICY "Public update store_drivers" ON store_drivers FOR UPDATE USING (true);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'store_drivers' AND policyname = 'Public delete store_drivers'
      ) THEN
        CREATE POLICY "Public delete store_drivers" ON store_drivers FOR DELETE USING (true);
      END IF;
    END
    $$;
  `);

  console.log('✅ store_drivers table created & RLS enabled');

  // 2. Create driver_settlements table
  await client.query(`
    CREATE TABLE IF NOT EXISTS driver_settlements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      driver_id TEXT NOT NULL,
      driver_name TEXT,
      branch_id TEXT,
      date TEXT NOT NULL,
      delivered_orders_count INT DEFAULT 0,
      total_cash_collected NUMERIC(10,2) DEFAULT 0.00,
      total_card_collected NUMERIC(10,2) DEFAULT 0.00,
      total_online_collected NUMERIC(10,2) DEFAULT 0.00,
      total_delivery_fees NUMERIC(10,2) DEFAULT 0.00,
      settled BOOLEAN DEFAULT false,
      settled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_driver_settlements_store_id ON driver_settlements(store_id);
    CREATE INDEX IF NOT EXISTS idx_driver_settlements_driver_id ON driver_settlements(driver_id);

    ALTER TABLE driver_settlements ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'driver_settlements' AND policyname = 'Public select driver_settlements'
      ) THEN
        CREATE POLICY "Public select driver_settlements" ON driver_settlements FOR SELECT USING (true);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'driver_settlements' AND policyname = 'Public insert driver_settlements'
      ) THEN
        CREATE POLICY "Public insert driver_settlements" ON driver_settlements FOR INSERT WITH CHECK (true);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'driver_settlements' AND policyname = 'Public update driver_settlements'
      ) THEN
        CREATE POLICY "Public update driver_settlements" ON driver_settlements FOR UPDATE USING (true);
      END IF;
    END
    $$;
  `);

  console.log('✅ driver_settlements table created & RLS enabled');

  // 3. Enable supabase realtime publication for store_drivers so updates sync instantly across screens!
  try {
    await client.query(`
      ALTER PUBLICATION supabase_realtime ADD TABLE store_drivers;
    `);
    console.log('✅ store_drivers added to supabase_realtime publication');
  } catch (err) {
    console.log('Publication notice:', err.message);
  }

  // 4. Verify columns
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'store_drivers'
  `);
  console.log('store_drivers columns in DB:', res.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

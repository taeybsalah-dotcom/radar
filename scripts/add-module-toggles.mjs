import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected to PostgreSQL database.');

  const sql = `
    ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS enable_orders BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS enable_bookings BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS enable_loyalty BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS owner_enable_orders BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS owner_enable_bookings BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS owner_enable_loyalty BOOLEAN NOT NULL DEFAULT true;

    UPDATE public.stores
    SET 
      enable_orders = COALESCE(enable_orders, true),
      enable_bookings = COALESCE(enable_bookings, true),
      enable_loyalty = COALESCE(enable_loyalty, true),
      owner_enable_orders = COALESCE(owner_enable_orders, true),
      owner_enable_bookings = COALESCE(owner_enable_bookings, true),
      owner_enable_loyalty = COALESCE(owner_enable_loyalty, true);
  `;

  await client.query(sql);
  console.log('Successfully added module toggles columns to public.stores.');

  const verify = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'stores' AND column_name LIKE '%enable_%'
    ORDER BY column_name;
  `);

  console.log('Verified columns:');
  console.table(verify.rows);

  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

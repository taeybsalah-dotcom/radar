import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();

  console.log('--- 1. Adding columns to store_orders & service_bookings ---');
  await client.query(`
    ALTER TABLE public.store_orders 
    ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT,
    ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

    ALTER TABLE public.service_bookings 
    ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT,
    ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
  `);

  console.log('--- 2. Verifying columns ---');
  const oCols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'store_orders' AND column_name IN ('telegram_message_id', 'telegram_chat_id')
  `);
  console.table(oCols.rows);

  const bCols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'service_bookings' AND column_name IN ('telegram_message_id', 'telegram_chat_id', 'updated_at')
  `);
  console.table(bCols.rows);

  await client.end();
  console.log('Done!');
}

run().catch(console.error);

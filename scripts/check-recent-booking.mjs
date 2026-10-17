import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT id, booking_number, status, customer_notes, created_at, telegram_message_id FROM service_bookings ORDER BY created_at DESC LIMIT 3");
  console.log(res.rows);
  await client.end();
}

run().catch(console.error);

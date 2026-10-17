import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'service_bookings'");
  console.log('Columns of service_bookings:', cols.rows.map(r => `${r.column_name} (${r.data_type})`));
  
  const recent = await client.query("SELECT * FROM service_bookings ORDER BY created_at DESC LIMIT 5");
  console.log('Recent bookings count:', recent.rows.length);
  for (const r of recent.rows) {
    console.log({
      booking_number: r.booking_number,
      service_name: r.service_name,
      service_price: r.service_price,
      loyalty_points_earned: r.loyalty_points_earned,
      status: r.status,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone
    });
  }

  // Also check public.book_service_safely definition
  const proc = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'book_service_safely'");
  console.log('book_service_safely function source:');
  console.log(proc.rows[0]?.prosrc);

  await client.end();
}

run().catch(console.error);

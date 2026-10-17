import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  const trigs = await client.query("SELECT trigger_name, action_statement, action_timing, event_manipulation FROM information_schema.triggers WHERE event_object_table = 'service_bookings'");
  console.log('Triggers on service_bookings:', trigs.rows);

  const webhookTrigs = await client.query("SELECT * FROM pg_trigger WHERE tgname LIKE '%telegram%' OR tgname LIKE '%booking%'");
  console.log('pg_trigger matches:', webhookTrigs.rows.map(r => r.tgname));

  await client.end();
}

run().catch(console.error);

import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const storeRes = await client.query("SELECT id, name, slug FROM stores WHERE slug = 'haf-mlywn';");
  console.log('Store:', storeRes.rows);
  if (storeRes.rows.length > 0) {
    const storeId = storeRes.rows[0].id;
    const branchesRes = await client.query("SELECT id, name, is_main FROM store_branches WHERE store_id = $1;", [storeId]);
    console.log('Branches:');
    console.table(branchesRes.rows);

    // Update recent 3 orders to 'preparing' so they show on KDS
    const upOrders = await client.query("UPDATE store_orders SET status = 'preparing' WHERE store_id = $1 AND id IN (SELECT id FROM store_orders WHERE store_id = $1 ORDER BY created_at DESC LIMIT 3) RETURNING id, order_number, status;", [storeId]);
    console.log('Updated orders to preparing:', upOrders.rows);

    // Update recent 3 bookings to 'confirmed' and today's date so they show on KDS
    const upBookings = await client.query("UPDATE service_bookings SET status = 'confirmed', booking_date = CURRENT_DATE WHERE store_id = $1 AND id IN (SELECT id FROM service_bookings WHERE store_id = $1 ORDER BY created_at DESC LIMIT 3) RETURNING id, booking_number, status, booking_date;", [storeId]);
    console.log('Updated bookings to confirmed:', upBookings.rows);
  }
  await client.end();
}

run().catch(console.error);

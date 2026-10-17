import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  
  // 1. Backfill audit_logs from staff
  const r1 = await client.query(`
    UPDATE audit_logs al
    SET branch_id = ss.branch_id
    FROM store_staff ss
    WHERE al.staff_id = ss.id AND al.branch_id IS NULL AND ss.branch_id IS NOT NULL;
  `);
  console.log('Backfilled audit_logs from staff:', r1.rowCount);

  // 2. Backfill audit_logs from main branch of store
  const r2 = await client.query(`
    UPDATE audit_logs al
    SET branch_id = sb.id
    FROM store_branches sb
    WHERE al.store_id = sb.store_id AND sb.is_main = true AND al.branch_id IS NULL;
  `);
  console.log('Backfilled audit_logs from main branch:', r2.rowCount);

  // 3. Backfill customer_coupons from main branch
  const r3 = await client.query(`
    UPDATE customer_coupons cc
    SET branch_id = sb.id
    FROM store_branches sb
    WHERE cc.store_id = sb.store_id AND sb.is_main = true AND cc.branch_id IS NULL;
  `);
  console.log('Backfilled customer_coupons from main branch:', r3.rowCount);

  // 4. Backfill service_bookings from main branch
  const r4 = await client.query(`
    UPDATE service_bookings srv
    SET branch_id = sb.id
    FROM store_branches sb
    WHERE srv.store_id = sb.store_id AND sb.is_main = true AND srv.branch_id IS NULL;
  `);
  console.log('Backfilled service_bookings from main branch:', r4.rowCount);

  await client.end();
}
run();

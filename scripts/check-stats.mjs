import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});
async function test() {
  await client.connect();
  const stores = await client.query('SELECT id, name, slug FROM stores');
  console.log('Stores:', stores.rows);
  const logsAgg = await client.query(`
    SELECT store_id, 
           COUNT(*) as total_logs,
           SUM(CASE WHEN action = 'PURCHASE' THEN COALESCE(purchase_amount, 0) ELSE 0 END) as total_sales,
           SUM(CASE WHEN points_changed > 0 THEN points_changed ELSE 0 END) as points_awarded,
           SUM(CASE WHEN points_changed < 0 THEN ABS(points_changed) ELSE 0 END) as points_burned,
           COUNT(CASE WHEN action IN ('REDEEM_COUPON', 'REDEEM_REWARD') THEN 1 END) as coupons_burned
    FROM audit_logs
    GROUP BY store_id;
  `);
  console.log('Logs Aggregation:', logsAgg.rows);
  const custAgg = await client.query(`
    SELECT store_id, COUNT(*) as cust_count
    FROM store_customers
    GROUP BY store_id;
  `);
  console.log('Customers count:', custAgg.rows);
  await client.end();
}
test().catch(console.error);

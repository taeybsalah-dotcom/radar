import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected to DB');

  try {
    await client.query(`
      ALTER TABLE audit_logs 
      ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES store_branches(id) ON DELETE SET NULL;
    `);
    console.log('Added branch_id to audit_logs');
  } catch (e) {
    console.warn('audit_logs branch_id alter error:', e.message);
  }

  try {
    await client.query(`
      ALTER TABLE customer_coupons 
      ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES store_branches(id) ON DELETE SET NULL;
    `);
    console.log('Added branch_id to customer_coupons');
  } catch (e) {
    console.warn('customer_coupons branch_id alter error:', e.message);
  }

  try {
    await client.query(`
      ALTER TABLE store_orders 
      ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES store_branches(id) ON DELETE SET NULL;
    `);
    console.log('Added branch_id to store_orders');
  } catch (e) {
    console.warn('store_orders branch_id alter error:', e.message);
  }

  // Create indexes for fast filtering by branch
  try {
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON audit_logs(branch_id);
      CREATE INDEX IF NOT EXISTS idx_customer_coupons_branch_id ON customer_coupons(branch_id);
      CREATE INDEX IF NOT EXISTS idx_service_bookings_branch_id ON service_bookings(branch_id);
    `);
    console.log('Created indexes for branch_id');
  } catch (e) {
    console.warn('indexes error:', e.message);
  }

  await client.end();
}
run();

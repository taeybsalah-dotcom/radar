import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL!');

    // 1. Add cash_in and cash_out columns to pos_shifts if not exist
    await client.query(`
      ALTER TABLE pos_shifts 
      ADD COLUMN IF NOT EXISTS total_cash_in NUMERIC(10,2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS total_cash_out NUMERIC(10,2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS cash_movements_count INT DEFAULT 0;
    `);
    console.log('Updated pos_shifts with cash_in and cash_out columns.');

    // 2. Create pos_cash_movements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pos_cash_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES store_branches(id) ON DELETE SET NULL,
        branch_name TEXT,
        shift_id UUID REFERENCES pos_shifts(id) ON DELETE SET NULL,
        staff_id TEXT NOT NULL,
        staff_name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('cash_in', 'cash_out')),
        amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        reason TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log('Created pos_cash_movements table.');

    // 3. Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pos_cash_movements_store_id ON pos_cash_movements(store_id);
      CREATE INDEX IF NOT EXISTS idx_pos_cash_movements_shift_id ON pos_cash_movements(shift_id);
      CREATE INDEX IF NOT EXISTS idx_pos_cash_movements_created_at ON pos_cash_movements(created_at);
    `);
    console.log('Created indexes for pos_cash_movements.');

    // 4. Enable RLS and add public permissive policy
    await client.query(`
      ALTER TABLE pos_cash_movements ENABLE ROW LEVEL SECURITY;
      
      DROP POLICY IF EXISTS "Public access pos_cash_movements" ON pos_cash_movements;
      CREATE POLICY "Public access pos_cash_movements" ON pos_cash_movements
        FOR ALL
        USING (true)
        WITH CHECK (true);
    `);
    console.log('Configured RLS for pos_cash_movements.');

    console.log('SUCCESS: All POS Cash Movements tables and columns established!');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await client.end();
  }
}

run();

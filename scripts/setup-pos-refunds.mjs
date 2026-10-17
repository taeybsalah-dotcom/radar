import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL!');

    // 1. Add refund columns to store_orders if not exist
    await client.query(`
      ALTER TABLE store_orders 
      ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS refund_history JSONB DEFAULT '[]'::jsonb;
    `);
    console.log('Updated store_orders with refund tracking columns.');

    // 2. Add refund columns to pos_shifts if not exist
    await client.query(`
      ALTER TABLE pos_shifts 
      ADD COLUMN IF NOT EXISTS total_refunds NUMERIC(10,2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS cash_refunds NUMERIC(10,2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS card_refunds NUMERIC(10,2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS refunds_count INT DEFAULT 0;
    `);
    console.log('Updated pos_shifts with refund metrics columns.');

    // 3. Create pos_refunds table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pos_refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES store_branches(id) ON DELETE SET NULL,
        branch_name TEXT,
        order_id UUID REFERENCES store_orders(id) ON DELETE SET NULL,
        order_number TEXT NOT NULL,
        credit_note_number TEXT NOT NULL UNIQUE,
        refund_type TEXT NOT NULL DEFAULT 'full',
        refund_reason TEXT NOT NULL,
        refund_method TEXT NOT NULL DEFAULT 'cash',
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        total_refunded NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        loyalty_points_deducted NUMERIC(10,2) DEFAULT 0.00,
        customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL,
        customer_name TEXT,
        customer_phone TEXT,
        cashier_id TEXT,
        cashier_name TEXT,
        shift_id UUID REFERENCES pos_shifts(id) ON DELETE SET NULL,
        zatca_qr TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_pos_refunds_store_id ON pos_refunds(store_id);
      CREATE INDEX IF NOT EXISTS idx_pos_refunds_order_id ON pos_refunds(order_id);
      CREATE INDEX IF NOT EXISTS idx_pos_refunds_shift_id ON pos_refunds(shift_id);
      CREATE INDEX IF NOT EXISTS idx_pos_refunds_credit_note ON pos_refunds(credit_note_number);
      CREATE INDEX IF NOT EXISTS idx_pos_refunds_created_at ON pos_refunds(created_at);

      ALTER TABLE pos_refunds ENABLE ROW LEVEL SECURITY;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'pos_refunds' AND policyname = 'Allow read pos_refunds'
        ) THEN
          CREATE POLICY "Allow read pos_refunds" ON pos_refunds FOR SELECT USING (true);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'pos_refunds' AND policyname = 'Allow insert pos_refunds'
        ) THEN
          CREATE POLICY "Allow insert pos_refunds" ON pos_refunds FOR INSERT WITH CHECK (true);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'pos_refunds' AND policyname = 'Allow update pos_refunds'
        ) THEN
          CREATE POLICY "Allow update pos_refunds" ON pos_refunds FOR UPDATE USING (true);
        END IF;
      END $$;
    `);
    console.log('pos_refunds table created and secured with RLS successfully!');

  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await client.end();
  }
}

run();

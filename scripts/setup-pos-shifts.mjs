import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL!');

  // 1. Create pos_shifts table if not exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS pos_shifts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      branch_id UUID REFERENCES store_branches(id) ON DELETE SET NULL,
      branch_name TEXT,
      staff_id UUID REFERENCES store_staff(id) ON DELETE SET NULL,
      staff_name TEXT NOT NULL,
      staff_phone TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at TIMESTAMPTZ,
      opening_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
      expected_cash NUMERIC(10,2) DEFAULT 0.00,
      actual_cash NUMERIC(10,2) DEFAULT 0.00,
      cash_difference NUMERIC(10,2) DEFAULT 0.00,
      total_sales NUMERIC(10,2) DEFAULT 0.00,
      cash_sales NUMERIC(10,2) DEFAULT 0.00,
      card_sales NUMERIC(10,2) DEFAULT 0.00,
      split_sales NUMERIC(10,2) DEFAULT 0.00,
      tax_amount NUMERIC(10,2) DEFAULT 0.00,
      discount_amount NUMERIC(10,2) DEFAULT 0.00,
      orders_count INT DEFAULT 0,
      notes TEXT,
      telegram_sent BOOLEAN DEFAULT false,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_pos_shifts_store_id ON pos_shifts(store_id);
    CREATE INDEX IF NOT EXISTS idx_pos_shifts_branch_id ON pos_shifts(branch_id);
    CREATE INDEX IF NOT EXISTS idx_pos_shifts_staff_id ON pos_shifts(staff_id);
    CREATE INDEX IF NOT EXISTS idx_pos_shifts_status ON pos_shifts(status);

    ALTER TABLE pos_shifts ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pos_shifts' AND policyname = 'Allow read pos_shifts'
      ) THEN
        CREATE POLICY "Allow read pos_shifts" ON pos_shifts FOR SELECT USING (true);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pos_shifts' AND policyname = 'Allow insert pos_shifts'
      ) THEN
        CREATE POLICY "Allow insert pos_shifts" ON pos_shifts FOR INSERT WITH CHECK (true);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pos_shifts' AND policyname = 'Allow update pos_shifts'
      ) THEN
        CREATE POLICY "Allow update pos_shifts" ON pos_shifts FOR UPDATE USING (true);
      END IF;
    END $$;

    -- Add enable_pos_whatsapp_receipt to stores if not exists
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS enable_pos_whatsapp_receipt BOOLEAN DEFAULT true;
  `);

  console.log('✅ pos_shifts table and enable_pos_whatsapp_receipt created successfully!');
  await client.end();
}

run().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});

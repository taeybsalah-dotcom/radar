import pg from 'pg';
const { Client } = pg;

const DEFAULT_WORKING_HOURS = JSON.stringify([
  { day: 'sunday', day_ar: 'الأحد', is_open: true, open_time: '09:00', close_time: '23:00' },
  { day: 'monday', day_ar: 'الاثنين', is_open: true, open_time: '09:00', close_time: '23:00' },
  { day: 'tuesday', day_ar: 'الثلاثاء', is_open: true, open_time: '09:00', close_time: '23:00' },
  { day: 'wednesday', day_ar: 'الأربعاء', is_open: true, open_time: '09:00', close_time: '23:00' },
  { day: 'thursday', day_ar: 'الخميس', is_open: true, open_time: '09:00', close_time: '00:00' },
  { day: 'friday', day_ar: 'الجمعة', is_open: true, open_time: '13:00', close_time: '00:00' },
  { day: 'saturday', day_ar: 'السبت', is_open: true, open_time: '09:00', close_time: '23:00' }
]);

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();

  console.log('--- 1. Updating store_branches schema with working hours and status ---');
  await client.query(`
    ALTER TABLE public.store_branches 
    ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS manual_override TEXT NOT NULL DEFAULT 'auto',
    ADD COLUMN IF NOT EXISTS working_hours JSONB NOT NULL DEFAULT '${DEFAULT_WORKING_HOURS}'::jsonb,
    ADD COLUMN IF NOT EXISTS busy_mode BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pickup_available BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS delivery_available BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS dine_in_available BOOLEAN NOT NULL DEFAULT true;

    -- Ensure branch_code is formatted properly (e.g., BR-01)
    UPDATE public.store_branches 
    SET working_hours = '${DEFAULT_WORKING_HOURS}'::jsonb 
    WHERE working_hours IS NULL OR working_hours = '[]'::jsonb;
  `);

  console.log('--- 2. Verifying store_branches columns ---');
  const cols = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'store_branches'
    ORDER BY ordinal_position
  `);
  console.table(cols.rows);

  const branches = await client.query(`SELECT id, store_id, branch_code, name, is_main, is_open, manual_override FROM public.store_branches`);
  console.table(branches.rows);

  await client.end();
  console.log('Migration completed successfully!');
}

run().catch(console.error);

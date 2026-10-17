import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();

  console.log('--- 1. Creating sequence and store_code column on stores ---');
  await client.query(`
    CREATE SEQUENCE IF NOT EXISTS store_code_seq START 1001;
    
    ALTER TABLE public.stores 
    ADD COLUMN IF NOT EXISTS store_code TEXT UNIQUE;
  `);

  console.log('--- 2. Setting store_code for existing stores without code ---');
  const unassigned = await client.query(`
    SELECT id, name FROM public.stores 
    WHERE store_code IS NULL 
    ORDER BY created_at ASC NULLS LAST, id ASC
  `);
  
  for (const s of unassigned.rows) {
    const codeRes = await client.query(`SELECT 'RD-' || nextval('store_code_seq')::text AS code;`);
    const code = codeRes.rows[0].code;
    await client.query(`UPDATE public.stores SET store_code = $1 WHERE id = $2`, [code, s.id]);
    console.log(`Assigned store_code ${code} to store "${s.name}" (${s.id})`);
  }

  console.log('--- 3. Creating trigger to auto-generate store_code on new store INSERT ---');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.fn_assign_store_code()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.store_code IS NULL OR TRIM(NEW.store_code) = '' THEN
        NEW.store_code := 'RD-' || nextval('store_code_seq')::text;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_assign_store_code ON public.stores;
    CREATE TRIGGER trg_assign_store_code
    BEFORE INSERT ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_assign_store_code();
  `);

  console.log('--- 4. Creating store_branches table ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.store_branches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
      branch_code TEXT NOT NULL DEFAULT 'BR-01',
      name TEXT NOT NULL DEFAULT 'الفرع الرئيسي',
      city TEXT,
      address TEXT,
      phone TEXT,
      is_main BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_store_branch_code UNIQUE (store_id, branch_code)
    );

    CREATE INDEX IF NOT EXISTS idx_store_branches_store_id ON public.store_branches(store_id);
    
    ALTER TABLE public.store_branches ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'store_branches' AND policyname = 'allow_all_store_branches'
      ) THEN
        CREATE POLICY allow_all_store_branches ON public.store_branches
          FOR ALL
          USING (true)
          WITH CHECK (true);
      END IF;
    END $$;
  `);

  console.log('--- 5. Seeding default main branch for existing stores ---');
  const seeded = await client.query(`
    INSERT INTO public.store_branches (store_id, branch_code, name, is_main, status)
    SELECT s.id, 'BR-01', 'الفرع الرئيسي', true, 'active'
    FROM public.stores s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.store_branches b WHERE b.store_id = s.id
    )
    RETURNING id, store_id, name, branch_code;
  `);
  console.log(`Seeded ${seeded.rowCount} main branches.`);

  console.log('--- 6. Adding nullable branch_id reference to operational tables ---');
  await client.query(`
    ALTER TABLE public.store_orders 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.store_branches(id) ON DELETE SET NULL;

    ALTER TABLE public.store_staff 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.store_branches(id) ON DELETE SET NULL;

    ALTER TABLE public.service_bookings 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.store_branches(id) ON DELETE SET NULL;
  `);

  console.log('--- 7. Verification of stores & branches ---');
  const verifyStores = await client.query(`SELECT id, name, slug, store_code FROM public.stores`);
  console.table(verifyStores.rows);

  const verifyBranches = await client.query(`SELECT id, store_id, branch_code, name, is_main, status FROM public.store_branches`);
  console.table(verifyBranches.rows);

  await client.end();
  console.log('=== Migration completed successfully! ===');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

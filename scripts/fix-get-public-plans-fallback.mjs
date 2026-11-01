import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();

  await client.query(`
    CREATE OR REPLACE FUNCTION public.get_public_billing_plans(p_host text)
    RETURNS SETOF billing_plans
    LANGUAGE plpgsql
    STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
    DECLARE
        v_clean_host TEXT;
        v_tenant_id TEXT;
    BEGIN
        IF p_host IS NOT NULL AND TRIM(p_host) <> '' THEN
            v_clean_host := LOWER(TRIM(p_host));
            v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
            v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
            v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

            SELECT id INTO v_tenant_id 
            FROM public.tenants 
            WHERE LOWER(custom_domain) = v_clean_host 
               OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
               OR LOWER(slug) = v_clean_host
            LIMIT 1;

            IF v_tenant_id IS NULL THEN
                IF v_clean_host LIKE '%sadeem%' OR v_clean_host LIKE '%sdeem%' THEN
                    v_tenant_id := 'sadeem';
                ELSIF v_clean_host LIKE '%radar%' THEN
                    v_tenant_id := 'radar';
                END IF;
            END IF;
        END IF;

        IF v_tenant_id IS NULL THEN
            v_tenant_id := 'radar';
        END IF;

        RETURN QUERY
        SELECT * FROM public.billing_plans
        WHERE active = true AND tenant_id = v_tenant_id
        ORDER BY tier_level ASC, monthly_amount ASC;
    END;
    $$;
  `);

  console.log('✅ Updated get_public_billing_plans with multi-tenant wildcard fallback');

  const t1 = await client.query(`SELECT count(*) FROM public.get_public_billing_plans('radar.taeybsalah.workers.dev')`);
  console.log('workers.dev count:', t1.rows[0].count);

  const t2 = await client.query(`SELECT count(*) FROM public.get_public_billing_plans('localhost')`);
  console.log('localhost count:', t2.rows[0].count);

  const t3 = await client.query(`SELECT count(*) FROM public.get_public_billing_plans('sdeemalathr.com')`);
  console.log('sdeemalathr.com count:', t3.rows[0].count);

  await client.end();
}
main();

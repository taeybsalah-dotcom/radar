import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();

  await client.query(`
    UPDATE public.billing_plans
    SET monthly_amount = 99,
        amount = 99,
        yearly_amount = 990,
        extra_branch_price = 49,
        extra_branch_yearly_price = 490
    WHERE tenant_id = 'radar' AND code = 'BASIC';
  `);

  const res = await client.query(`
    SELECT tenant_id, code, name, monthly_amount, yearly_amount, extra_branch_price, extra_branch_yearly_price
    FROM public.billing_plans
    ORDER BY tenant_id, tier_level;
  `);
  console.table(res.rows);
  await client.end();
}

main().catch(console.error);

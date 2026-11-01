import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();

  const stores = await client.query(`
    SELECT * FROM public.stores;
  `);
  console.log('Stores:', stores.rows);

  const leads = await client.query(`
    SELECT * FROM public.merchant_leads;
  `);
  console.log('Leads:', leads.rows);

  await client.end();
}

main().catch(console.error);

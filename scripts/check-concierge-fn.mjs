import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();

  const res = await client.query(`
    SELECT pg_get_functiondef(oid) 
    FROM pg_proc 
    WHERE proname = 'create_store_concierge_onboarding';
  `);
  if (res.rows.length > 0) {
    console.log(res.rows[0].pg_get_functiondef);
  } else {
    console.log('Function not found!');
  }

  await client.end();
}

main().catch(console.error);

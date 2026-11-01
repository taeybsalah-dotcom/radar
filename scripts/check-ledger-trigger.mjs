import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT trigger_name, event_manipulation, action_statement 
    FROM information_schema.triggers 
    WHERE event_object_table = 'financial_ledger';
  `);
  console.log('financial_ledger triggers:', res.rows);
  await client.end();
}

main().catch(console.error);

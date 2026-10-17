import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'stores' 
    ORDER BY ordinal_position;
  `);
  console.log('--- STORES COLUMNS ---');
  console.log(res.rows.map(r => `${r.column_name} (${r.data_type}) = ${r.column_default}`).join('\n'));

  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
  `);
  console.log('--- TABLES ---');
  console.log(tables.rows.map(r => r.table_name).join(', '));

  await client.end();
}

run().catch(console.error);

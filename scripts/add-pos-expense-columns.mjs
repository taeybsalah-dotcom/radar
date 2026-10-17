import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL!');

    await client.query(`
      ALTER TABLE pos_cash_movements 
      ADD COLUMN IF NOT EXISTS category TEXT,
      ADD COLUMN IF NOT EXISTS recipient_name TEXT,
      ADD COLUMN IF NOT EXISTS invoice_ref TEXT;
    `);
    console.log('Added category, recipient_name, and invoice_ref to pos_cash_movements.');

  } catch (err) {
    console.error('Error adding columns to pos_cash_movements:', err);
  } finally {
    await client.end();
  }
}

run();

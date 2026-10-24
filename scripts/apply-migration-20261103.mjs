import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const sqlFile = path.resolve('supabase/migrations/20261103_cashier_points_and_audit_fix.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');
  console.log('Executing migration 20261103_cashier_points_and_audit_fix.sql...');
  await client.query(sql);
  console.log('✅ Migration executed successfully!');
  await client.end();
}
main().catch(console.error);

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    UPDATE billing_plans
    SET features_list = (
      SELECT features_list FROM billing_plans WHERE tenant_id = 'sadeem' AND code = 'BASIC' LIMIT 1
    )
    WHERE tenant_id = 'radar' AND code = 'BASIC';
  `);
  console.log('Restored radar BASIC features');
  await client.end();
}
main();

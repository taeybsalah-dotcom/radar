import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const radarPlans = await client.query(`
    SELECT * FROM public.get_public_billing_plans('myradar.sarl');
  `);
  console.log('--- RADAR PUBLIC PLANS ---');
  console.table(radarPlans.rows.map(r => ({
    name: r.name,
    monthly: r.monthly_amount,
    yearly: r.yearly_amount,
    tier: r.tier_level,
    badge: r.badge_text,
    note: r.cumulative_note,
    features_count: r.features_list?.length
  })));

  const sadeemPlans = await client.query(`
    SELECT * FROM public.get_public_billing_plans('sdeemalathr.com');
  `);
  console.log('--- SADEEM PUBLIC PLANS ---');
  console.table(sadeemPlans.rows.map(r => ({
    name: r.name,
    monthly: r.monthly_amount,
    yearly: r.yearly_amount,
    tier: r.tier_level,
    badge: r.badge_text,
    note: r.cumulative_note,
    features_count: r.features_list?.length
  })));

  await client.end();
}
main();

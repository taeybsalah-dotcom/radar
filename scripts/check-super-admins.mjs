import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();

  const superAdmins = await client.query(`SELECT * FROM public.super_admin_users;`);
  console.log('super_admin_users:', superAdmins.rows);

  const masterAdmins = await client.query(`SELECT * FROM public.master_admins;`);
  console.log('master_admins:', masterAdmins.rows);

  const authUsers = await client.query(`SELECT id, email, role FROM auth.users;`);
  console.log('auth.users:', authUsers.rows);

  const partners = await client.query(`SELECT * FROM public.partner_accounts;`);
  console.log('partners count:', partners.rows.length);

  await client.end();
}

main().catch(console.error);

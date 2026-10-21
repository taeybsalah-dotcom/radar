import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();

  // 1. Insert "محمود حسن" for هاف مليون
  await client.query(`
    INSERT INTO store_drivers (
      id,
      store_id,
      branch_id,
      branch_name,
      name,
      phone,
      vehicle_type,
      plate_number,
      pin_code,
      is_active,
      status,
      commission_per_order,
      notes
    ) VALUES (
      'drv_mahmoud_hassan',
      'f79253cc-361f-40ec-b4ec-fc05cbd1b071'::uuid,
      '0fb897d6-76c4-4c99-8d00-cd7ab9e7e72a',
      'الفرع الرئيسي',
      'محمود حسن',
      '0501234567',
      'motorcycle',
      'د ب ب 1234',
      '1234',
      true,
      'available',
      10,
      'كابتن معتمد - دراجة نارية سريعة'
    ) ON CONFLICT (id) DO UPDATE SET 
      name = EXCLUDED.name,
      branch_id = EXCLUDED.branch_id,
      branch_name = EXCLUDED.branch_name,
      is_active = true,
      status = 'available';
  `);
  console.log('✅ Seeded Mahmoud Hassan for هاف مليون');

  // Also seed demo drivers for each store so POS & Customer app never show 0 drivers unless merchant deactivates them
  const stores = await client.query(`SELECT id, name FROM stores`);
  for (const s of stores.rows) {
    const branches = await client.query(`SELECT id, name FROM store_branches WHERE store_id = $1 ORDER BY is_main DESC`, [s.id]);
    if (branches.rows.length > 0) {
      const mainBranch = branches.rows[0];
      const secondBranch = branches.rows[1] || mainBranch;

      await client.query(`
        INSERT INTO store_drivers (
          id, store_id, branch_id, branch_name, name, phone, vehicle_type, plate_number, pin_code, is_active, status, commission_per_order
        ) VALUES 
        (
          'drv_' || $1 || '_1',
          $1::uuid,
          $2,
          $3,
          'سلطان العتيبي',
          '0501112233',
          'motorcycle',
          'أ ب د 1234',
          '1234',
          true,
          'available',
          10
        ),
        (
          'drv_' || $1 || '_2',
          $1::uuid,
          $2,
          $3,
          'فهد الدوسري',
          '0554445566',
          'car',
          'ر س م 5678',
          '2222',
          true,
          'available',
          15
        )
        ON CONFLICT (id) DO UPDATE SET
          branch_id = EXCLUDED.branch_id,
          branch_name = EXCLUDED.branch_name;
      `, [s.id, mainBranch.id, mainBranch.name]);

      if (branches.rows.length > 1) {
        await client.query(`
          INSERT INTO store_drivers (
            id, store_id, branch_id, branch_name, name, phone, vehicle_type, plate_number, pin_code, is_active, status, commission_per_order
          ) VALUES 
          (
            'drv_' || $1 || '_3',
            $1::uuid,
            $2,
            $3,
            'طارق الجابري',
            '0567778899',
            'motorcycle',
            'ط ل ق 9012',
            '3333',
            true,
            'available',
            10
          )
          ON CONFLICT (id) DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            branch_name = EXCLUDED.branch_name;
        `, [s.id, secondBranch.id, secondBranch.name]);
      }
    }
  }

  const all = await client.query(`SELECT id, name, store_id, branch_id, branch_name, status FROM store_drivers`);
  console.log('Total store_drivers in DB:', all.rows.length);
  console.log(all.rows);

  await client.end();
}

run().catch(console.error);

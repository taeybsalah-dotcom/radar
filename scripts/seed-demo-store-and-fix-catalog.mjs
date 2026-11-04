import pg from 'pg';
const { Client } = pg;

const DEMO_STORE_UUID = 'c0a80101-cafe-4000-8000-000000000001';
const DEMO_STORE_SLUG = 'demo-cafe';
const BRANCH_MAIN_ID = 'b0a80101-cafe-4000-8000-000000000001';
const BRANCH_SUB_ID = 'b0a80101-cafe-4000-8000-000000000002';
const STAFF_ADMIN_ID = 'a0a80101-cafe-4000-8000-000000000001';
const STAFF_CASHIER_ID = 'a0a80101-cafe-4000-8000-000000000002';

async function seed() {
  const client = new Client({
    connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  });
  await client.connect();
  console.log('Connected to Supabase PostgreSQL.');

  // 1. Dining tables for fulfillment_settings
  const diningTables = [
    { id: 'tbl-1', number: '1', name: 'طاولة 1', capacity: 2, zone: 'singles', status: 'available', is_active: true },
    { id: 'tbl-2', number: '2', name: 'طاولة 2', capacity: 2, zone: 'singles', status: 'available', is_active: true },
    { id: 'tbl-3', number: '3', name: 'طاولة 3', capacity: 4, zone: 'singles', status: 'available', is_active: true },
    { id: 'tbl-4', number: '4', name: 'طاولة 4', capacity: 4, zone: 'families', status: 'available', is_active: true },
    { id: 'tbl-5', number: '5', name: 'طاولة 5', capacity: 6, zone: 'families', status: 'available', is_active: true },
    { id: 'tbl-6', number: '6', name: 'طاولة 6', capacity: 6, zone: 'families', status: 'available', is_active: true },
    { id: 'tbl-7', number: '7', name: 'طاولة 7', capacity: 4, zone: 'outdoor', status: 'available', is_active: true },
    { id: 'tbl-8', number: '8', name: 'طاولة 8', capacity: 4, zone: 'outdoor', status: 'available', is_active: true }
  ];

  const fulfillmentSettings = {
    allow_dine_in: true,
    allow_takeaway: true,
    allow_delivery: true,
    delivery_fee: 12,
    online_payment_enabled: true,
    orders_payment_policy: 'both',
    cr_number: '1010892341',
    tax_number: '310198456200003',
    vat_number: '310198456200003',
    dining_tables: diningTables,
    theme_mode: 'warm_cream',
    background_color: '#FAF6F0',
    card_color: '#FFFFFF',
    theme_preset: 'cafe_warm',
    wallet_pass_config: {
      enabled: true,
      loyalty_mode: 'stamps',
      stamps_target: 6,
      stamps_reward_title: 'قهوة اليوم مجانية من اختيارك ☕',
      stamps_icon: '☕',
      enable_spin_wheel: true,
      enable_streaks: true,
      streak_target_days: 3,
      streak_reward_title: 'حلى مجاني عند إكمال السلسلة 🍰',
      background_color: '#1E1B18',
      foreground_color: '#FFFFFF',
      label_color: '#D97706'
    }
  };

  // 1. Insert/Update Store
  console.log('--- 1. Seeding Store: سديم كافيه ومخبوزات ---');
  await client.query(`
    INSERT INTO public.stores (
      id, name, slug, store_code, logo_url, primary_color, secondary_color,
      points_per_riyal, subscription_active, status, subscription_status,
      lifecycle_stage, subscription_plan, setup_fee_paid, manager_name, manager_contact,
      enable_orders, enable_bookings, enable_loyalty, owner_enable_orders, owner_enable_bookings, owner_enable_loyalty,
      fulfillment_settings, tenant_id, is_active
    ) VALUES (
      $1, 'سديم كافيه ومخبوزات', $2, 'SD-1001',
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&auto=format&fit=crop&q=80',
      '#1E1B18', '#D97706', 1.0, true, 'active', 'active',
      'مشترك مدفوع', 'pro', true, 'سعد المنصور', '0550000000',
      true, true, true, true, true, true,
      $3, 'sadeem', true
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      store_code = EXCLUDED.store_code,
      logo_url = EXCLUDED.logo_url,
      primary_color = EXCLUDED.primary_color,
      secondary_color = EXCLUDED.secondary_color,
      subscription_active = true,
      status = 'active',
      subscription_status = 'active',
      lifecycle_stage = 'مشترك مدفوع',
      enable_orders = true,
      enable_bookings = true,
      enable_loyalty = true,
      owner_enable_orders = true,
      owner_enable_bookings = true,
      owner_enable_loyalty = true,
      fulfillment_settings = EXCLUDED.fulfillment_settings,
      tenant_id = 'sadeem',
      is_active = true;
  `, [DEMO_STORE_UUID, DEMO_STORE_SLUG, JSON.stringify(fulfillmentSettings)]);

  // 2. Seed Branches (2 active branches)
  console.log('--- 2. Seeding Branches ---');
  await client.query(`
    INSERT INTO public.store_branches (
      id, store_id, branch_code, name, city, address, phone, is_main, status, is_open,
      dine_in_available, pickup_available, delivery_available, tenant_id
    ) VALUES 
    (
      $1, $2, 'BR-01', 'الفرع الرئيسي - الرياض (العليا)', 'الرياض', 'طريق الملك فهد، حي العليا', '0114001122',
      true, 'active', true, true, true, true, 'sadeem'
    ),
    (
      $3, $2, 'BR-02', 'فرع الكورنيش - الخبر', 'الخبر', 'طريق الكورنيش، حي الساحل', '0138002233',
      false, 'active', true, true, true, true, 'sadeem'
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      city = EXCLUDED.city,
      address = EXCLUDED.address,
      phone = EXCLUDED.phone,
      is_main = EXCLUDED.is_main,
      status = 'active',
      is_open = true,
      dine_in_available = true,
      pickup_available = true,
      delivery_available = true;
  `, [BRANCH_MAIN_ID, DEMO_STORE_UUID, BRANCH_SUB_ID]);

  // 3. Seed Staff (Manager PIN: 9999, Cashier PIN: 1234)
  console.log('--- 3. Seeding Staff with Verified PINs ---');
  await client.query(`
    INSERT INTO public.store_staff (
      id, store_id, name, phone, role, pin_code, is_active, can_manual_input_phone, branch_id, tenant_id
    ) VALUES 
    (
      $1, $2, 'سعد المنصور (المدير العام)', '0550000000', 'admin',
      crypt('9999', gen_salt('bf', 8)), true, true, $3, 'sadeem'
    ),
    (
      $4, $2, 'فهد السالم (كاشير الفترة الصباحية)', '0550000001', 'cashier',
      crypt('1234', gen_salt('bf', 8)), true, true, $3, 'sadeem'
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      role = EXCLUDED.role,
      pin_code = EXCLUDED.pin_code,
      is_active = true,
      can_manual_input_phone = true,
      branch_id = EXCLUDED.branch_id;
  `, [STAFF_ADMIN_ID, DEMO_STORE_UUID, BRANCH_MAIN_ID, STAFF_CASHIER_ID]);

  // 4. Seed Catalog Items (19 items across 4 categories)
  console.log('--- 4. Seeding 19 Catalog Items across 4 categories ---');
  await client.query('DELETE FROM public.catalog_items WHERE store_id = $1', [DEMO_STORE_UUID]);

  const catalogItems = [
    // ☕ مشروبات ساخنة
    {
      id: 'cat-h1', store_id: DEMO_STORE_UUID, category: 'مشروبات ساخنة', name: 'فلات وايت (Flat White)',
      description: 'دبل شوت إسبريسو مع حليب مبخر برغوة مخملية ناعمة', price: 18.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 1, tenant_id: 'sadeem'
    },
    {
      id: 'cat-h2', store_id: DEMO_STORE_UUID, category: 'مشروبات ساخنة', name: 'كابتشينو إيطالي (Cappuccino)',
      description: 'إسبريسو غني متوازن مع ثلث حليب وثلث رغوة غنية بودرة الكاكاو', price: 19.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 2, tenant_id: 'sadeem'
    },
    {
      id: 'cat-h3', store_id: DEMO_STORE_UUID, category: 'مشروبات ساخنة', name: 'قهوة اليوم مقطرة V60 كولومبيا',
      description: 'محصول كولومبي مختص بإيحاءات الفواكه المجففة والشوكولاتة الفاخرة', price: 20.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 3, tenant_id: 'sadeem'
    },
    {
      id: 'cat-h4', store_id: DEMO_STORE_UUID, category: 'مشروبات ساخنة', name: 'إسبريسو دوبيو (Double Espresso)',
      description: 'جرعتين مركزتين من خلاصة البن الإثيوبي الفاخر برغوة ذهبية متماسكة', price: 14.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 4, tenant_id: 'sadeem'
    },
    {
      id: 'cat-h5', store_id: DEMO_STORE_UUID, category: 'مشروبات ساخنة', name: 'كورتادو مختص (Cortado)',
      description: 'نسبة متساوية 1:1 من الإسبريسو والحليب المبخر بنعومة متناهية', price: 16.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 5, tenant_id: 'sadeem'
    },

    // 🧊 مشروبات باردة
    {
      id: 'cat-c1', store_id: DEMO_STORE_UUID, category: 'مشروبات باردة', name: 'آيس سبانش لاتيه (Iced Spanish)',
      description: 'المزيج الأكثر طلباً: قهوة غنية وحليب مكثف محلى مع الثلج المنعش', price: 23.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 6, tenant_id: 'sadeem'
    },
    {
      id: 'cat-c2', store_id: DEMO_STORE_UUID, category: 'مشروبات باردة', name: 'آيس دريب كينيا (Iced Drip Kenya)',
      description: 'قهوة مقطرة باردة على الثلج بإيحاءات التوت الأسود والحمضيات المنعشة', price: 22.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 7, tenant_id: 'sadeem'
    },
    {
      id: 'cat-c3', store_id: DEMO_STORE_UUID, category: 'مشروبات باردة', name: 'كولد برو كلاسيك (Classic Cold Brew)',
      description: 'قهوة منقوعة على البارد لمدة 18 ساعة لنكهة سلسة وخالية من المرارة', price: 24.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 8, tenant_id: 'sadeem'
    },
    {
      id: 'cat-c4', store_id: DEMO_STORE_UUID, category: 'مشروبات باردة', name: 'موهيتو التوت الأزرق المنعش',
      description: 'موهيتو الصودا الفوارة مع النعناع والليمون الطازج والتوت الأزرق الطبيعي', price: 21.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 9, tenant_id: 'sadeem'
    },
    {
      id: 'cat-c5', store_id: DEMO_STORE_UUID, category: 'مشروبات باردة', name: 'ماتشا لاتيه مثلج (Iced Matcha)',
      description: 'شاي ماتشا ياباني عضوي فاخر مع الحليب البارد ورغوة ناعمة', price: 25.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 10, tenant_id: 'sadeem'
    },

    // 🥐 مخبوزات
    {
      id: 'cat-b1', store_id: DEMO_STORE_UUID, category: 'مخبوزات', name: 'كرواسون زبدة فرنسي سادة طازج',
      description: 'كرواسون مورق ومخبوز يومياً بأجود أنواع الزبدة الفرنسية الطبيعية', price: 12.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 11, tenant_id: 'sadeem'
    },
    {
      id: 'cat-b2', store_id: DEMO_STORE_UUID, category: 'مخبوزات', name: 'كرواسون حلومي مشوي مع الزعتر البري',
      description: 'محشو بجبن الحلوم القبرصي المشوي، الطماطم المجففة والزعتر الفلسطيني', price: 19.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 12, tenant_id: 'sadeem'
    },
    {
      id: 'cat-b3', store_id: DEMO_STORE_UUID, category: 'مخبوزات', name: 'دانيش التوت البري والكريمة المخفوقة',
      description: 'عجينة البف بيستري المقرمشة بحشوة الكاسترد الفرنسي وحبات التوت الطازج', price: 16.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1509365465985-25d11c17e812?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 13, tenant_id: 'sadeem'
    },
    {
      id: 'cat-b4', store_id: DEMO_STORE_UUID, category: 'مخبوزات', name: 'بيجل السلمون المدخن والجبن الكريمي',
      description: 'خبز بيجل طازج مع شرائح السلمون النرويجي والجبن الكريمي والشبت', price: 28.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 14, tenant_id: 'sadeem'
    },
    {
      id: 'cat-b5', store_id: DEMO_STORE_UUID, category: 'مخبوزات', name: 'كوكيز الشوكولاتة البلجيكية المزدوجة',
      description: 'كوكيز مخبوز طازج غني بقطع الشوكولاتة البلجيكية الداكنة ورشة ملح البحر', price: 14.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 15, tenant_id: 'sadeem'
    },

    // 🍰 حلى
    {
      id: 'cat-s1', store_id: DEMO_STORE_UUID, category: 'حلى', name: 'كيكة سان سباستيان مع صوص الشوكولاتة',
      description: 'تشيز كيك الباسك المحروق بقوام كريمي ذائب وصوص شوكولاتة بلجيكية دافئة', price: 26.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 16, tenant_id: 'sadeem'
    },
    {
      id: 'cat-s2', store_id: DEMO_STORE_UUID, category: 'حلى', name: 'تيراميسو إيطالي كلاسيكي فاخر',
      description: 'بسكويت ليدي فينجر منقوع بالإسبريسو مع طبقات كريمة الماسكاربوني الغنية', price: 25.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 17, tenant_id: 'sadeem'
    },
    {
      id: 'cat-s3', store_id: DEMO_STORE_UUID, category: 'حلى', name: 'بودينغ التمر الدافئ مع التوفي والآيس كريم',
      description: 'حلى التمر الشعبي المحضر بلمسة عصرية مع صوص التوفي الغني وفانيليا مدغشقر', price: 24.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 18, tenant_id: 'sadeem'
    },
    {
      id: 'cat-s4', store_id: DEMO_STORE_UUID, category: 'حلى', name: 'كيكة العسل الروسية الملكية (Medovik)',
      description: 'ثماني طبقات رقيقة من البسكويت المعجون بالعسل الطبيعي وكريمة الحليب', price: 27.0, item_type: 'product',
      image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&auto=format&fit=crop&q=80',
      is_available: true, sort_order: 19, tenant_id: 'sadeem'
    }
  ];

  for (const item of catalogItems) {
    await client.query(`
      INSERT INTO public.catalog_items (
        id, store_id, name, description, price, category, item_type, image_url, is_available, sort_order, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        category = EXCLUDED.category,
        image_url = EXCLUDED.image_url,
        is_available = true,
        sort_order = EXCLUDED.sort_order;
    `, [
      item.id, item.store_id, item.name, item.description, item.price,
      item.category, item.item_type, item.image_url, item.is_available, item.sort_order, item.tenant_id
    ]);
  }

  // 5. Seed Customers
  console.log('--- 5. Seeding Customers ---');
  await client.query(`
    INSERT INTO public.store_customers (
      id, store_id, name, phone, wallet_balance, lifetime_xp, tenant_id
    ) VALUES 
    ('c0000000-0000-0000-0000-000000000001', $1, 'سارة العبدالله', '0501112233', 180, 220, 'sadeem'),
    ('c0000000-0000-0000-0000-000000000002', $1, 'خالد الدوسري (عميل ذهبي)', '0504445566', 550, 850, 'sadeem'),
    ('c0000000-0000-0000-0000-000000000003', $1, 'نورة الشمري', '0507778899', 50, 50, 'sadeem'),
    ('c0000000-0000-0000-0000-000000000004', $1, 'عبدالرحمن الشهري', '0509990011', 320, 480, 'sadeem')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      wallet_balance = EXCLUDED.wallet_balance,
      lifetime_xp = EXCLUDED.lifetime_xp;
  `, [DEMO_STORE_UUID]);

  // 6. Seed 18 Live Orders & Transactions in store_orders & audit_logs
  console.log('--- 6. Seeding 18 Live Sales Orders & Audit Logs ---');
  await client.query('DELETE FROM public.store_orders WHERE store_id = $1', [DEMO_STORE_UUID]);
  await client.query('DELETE FROM public.audit_logs WHERE store_id = $1', [DEMO_STORE_UUID]);

  const sampleOrders = [
    { num: 'ORD-101', custId: 'c0000000-0000-0000-0000-000000000001', cust: 'سارة العبدالله', phone: '0501112233', type: 'dine_in', tbl: '3', total: 44.0, pts: 44, method: 'mada', hoursAgo: 2, items: [{ name: 'فلات وايت', qty: 1, price: 18 }, { name: 'كيكة سان سباستيان', qty: 1, price: 26 }] },
    { num: 'ORD-102', custId: 'c0000000-0000-0000-0000-000000000002', cust: 'خالد الدوسري', phone: '0504445566', type: 'takeaway', tbl: null, total: 47.0, pts: 47, method: 'apple_pay', hoursAgo: 4, items: [{ name: 'كولد برو كلاسيك', qty: 1, price: 24 }, { name: 'آيس سبانش لاتيه', qty: 1, price: 23 }] },
    { num: 'ORD-103', custId: 'c0000000-0000-0000-0000-000000000003', cust: 'نورة الشمري', phone: '0507778899', type: 'dine_in', tbl: '1', total: 32.0, pts: 32, method: 'mada', hoursAgo: 6, items: [{ name: 'فلات وايت', qty: 1, price: 18 }, { name: 'كوكيز الشوكولاتة', qty: 1, price: 14 }] },
    { num: 'ORD-104', custId: 'c0000000-0000-0000-0000-000000000004', cust: 'عبدالرحمن الشهري', phone: '0509990011', type: 'dine_in', tbl: '5', total: 94.0, pts: 94, method: 'visa', hoursAgo: 8, items: [{ name: 'قهوة اليوم V60', qty: 2, price: 20 }, { name: 'كيكة العسل', qty: 2, price: 27 }] },
    { num: 'ORD-105', custId: 'c0000000-0000-0000-0000-000000000001', cust: 'سارة العبدالله', phone: '0501112233', type: 'takeaway', tbl: null, total: 37.0, pts: 37, method: 'mada', hoursAgo: 12, items: [{ name: 'كرواسون حلومي مشوي', qty: 1, price: 19 }, { name: 'فلات وايت', qty: 1, price: 18 }] },
    { num: 'ORD-106', custId: 'c0000000-0000-0000-0000-000000000002', cust: 'خالد الدوسري', phone: '0504445566', type: 'dine_in', tbl: '2', total: 53.0, pts: 53, method: 'apple_pay', hoursAgo: 16, items: [{ name: 'بيجل السلمون المدخن', qty: 1, price: 28 }, { name: 'تيراميسو كلاسيكي', qty: 1, price: 25 }] },
    { num: 'ORD-107', custId: 'c0000000-0000-0000-0000-000000000003', cust: 'عميل نقدي', phone: '0551234567', type: 'takeaway', tbl: null, total: 38.0, pts: 0, method: 'cash', hoursAgo: 20, items: [{ name: 'كابتشينو إيطالي', qty: 2, price: 19 }] },
    { num: 'ORD-108', custId: 'c0000000-0000-0000-0000-000000000003', cust: 'نورة الشمري', phone: '0507778899', type: 'dine_in', tbl: '7', total: 49.0, pts: 49, method: 'mada', hoursAgo: 24, items: [{ name: 'ماتشا لاتيه مثلج', qty: 1, price: 25 }, { name: 'بودينغ التمر الدافئ', qty: 1, price: 24 }] },
    { num: 'ORD-109', custId: 'c0000000-0000-0000-0000-000000000004', cust: 'عبدالرحمن الشهري', phone: '0509990011', type: 'takeaway', tbl: null, total: 42.0, pts: 42, method: 'apple_pay', hoursAgo: 28, items: [{ name: 'موهيتو التوت الأزرق', qty: 2, price: 21 }] },
    { num: 'ORD-110', custId: 'c0000000-0000-0000-0000-000000000001', cust: 'سارة العبدالله', phone: '0501112233', type: 'dine_in', tbl: '4', total: 68.0, pts: 68, method: 'mada', hoursAgo: 34, items: [{ name: 'آيس سبانش لاتيه', qty: 2, price: 23 }, { name: 'آيس دريب كينيا', qty: 1, price: 22 }] },
    { num: 'ORD-111', custId: 'c0000000-0000-0000-0000-000000000002', cust: 'خالد الدوسري', phone: '0504445566', type: 'takeaway', tbl: null, total: 75.0, pts: 75, method: 'apple_pay', hoursAgo: 42, items: [{ name: 'تيراميسو كلاسيكي', qty: 3, price: 25 }] },
    { num: 'ORD-112', custId: 'c0000000-0000-0000-0000-000000000003', cust: 'عميل نقدي', phone: '0559876543', type: 'takeaway', tbl: null, total: 26.0, pts: 0, method: 'cash', hoursAgo: 50, items: [{ name: 'كيكة سان سباستيان', qty: 1, price: 26 }] },
    { num: 'ORD-113', custId: 'c0000000-0000-0000-0000-000000000003', cust: 'نورة الشمري', phone: '0507778899', type: 'dine_in', tbl: '6', total: 58.0, pts: 58, method: 'mada', hoursAgo: 60, items: [{ name: 'كورتادو مختص', qty: 2, price: 16 }, { name: 'كيكة سان سباستيان', qty: 1, price: 26 }] },
    { num: 'ORD-114', custId: 'c0000000-0000-0000-0000-000000000004', cust: 'عبدالرحمن الشهري', phone: '0509990011', type: 'dine_in', tbl: '8', total: 84.0, pts: 84, method: 'visa', hoursAgo: 72, items: [{ name: 'إسبريسو دوبيو', qty: 2, price: 14 }, { name: 'بيجل السلمون المدخن', qty: 2, price: 28 }] },
    { num: 'ORD-115', custId: 'c0000000-0000-0000-0000-000000000001', cust: 'سارة العبدالله', phone: '0501112233', type: 'takeaway', tbl: null, total: 46.0, pts: 46, method: 'apple_pay', hoursAgo: 84, items: [{ name: 'آيس سبانش لاتيه', qty: 2, price: 23 }] },
    { num: 'ORD-116', custId: 'c0000000-0000-0000-0000-000000000002', cust: 'خالد الدوسري', phone: '0504445566', type: 'dine_in', tbl: '3', total: 64.0, pts: 64, method: 'mada', hoursAgo: 96, items: [{ name: 'قهوة اليوم V60', qty: 2, price: 20 }, { name: 'بودينغ التمر الدافئ', qty: 1, price: 24 }] },
    { num: 'ORD-117', custId: 'c0000000-0000-0000-0000-000000000003', cust: 'نورة الشمري', phone: '0507778899', type: 'takeaway', tbl: null, total: 38.0, pts: 38, method: 'mada', hoursAgo: 110, items: [{ name: 'كرواسون حلومي مشوي', qty: 2, price: 19 }] },
    { num: 'ORD-118', custId: 'c0000000-0000-0000-0000-000000000004', cust: 'عبدالرحمن الشهري', phone: '0509990011', type: 'dine_in', tbl: '4', total: 72.0, pts: 72, method: 'apple_pay', hoursAgo: 130, items: [{ name: 'كولد برو كلاسيك', qty: 2, price: 24 }, { name: 'بودينغ التمر الدافئ', qty: 1, price: 24 }] }
  ];

  for (const o of sampleOrders) {
    const createdAt = new Date(Date.now() - o.hoursAgo * 3600000).toISOString();
    await client.query(`
      INSERT INTO public.store_orders (
        id,
        store_id,
        order_number,
        customer_id,
        customer_name,
        customer_phone,
        order_type,
        table_number,
        items,
        total_price,
        loyalty_points_earned,
        status,
        payment_status,
        payment_method,
        branch_id,
        cashier_id,
        cashier_name,
        created_at,
        updated_at,
        tenant_id
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        'completed',
        'paid',
        $11,
        $12,
        $13,
        'فهد السالم',
        $14,
        $14,
        'sadeem'
      )
    `, [
      DEMO_STORE_UUID,
      o.num,
      o.custId,
      o.cust,
      o.phone,
      o.type,
      o.tbl,
      JSON.stringify(o.items),
      o.total,
      o.pts,
      o.method,
      BRANCH_MAIN_ID,
      STAFF_CASHIER_ID,
      createdAt
    ]);

    await client.query(`
      INSERT INTO public.audit_logs (
        id, store_id, staff_id, customer_id, customer_name, customer_phone,
        action, purchase_amount, points_changed, entry_method, metadata,
        branch_id, tenant_id, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5,
        'PURCHASE', $6, $7, 'qr_scan', $8,
        $9, 'sadeem', $10
      )
    `, [
      DEMO_STORE_UUID, STAFF_CASHIER_ID, o.custId, o.cust, o.phone,
      o.total, o.pts, JSON.stringify({ order_number: o.num, payment_method: o.method }),
      BRANCH_MAIN_ID, createdAt
    ]);
  }

  console.log('✅ Seed complete: Store, 2 Branches, Staff, 19 Products, Customers, and 18 Sales Invoices/Orders.');
  await client.end();
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

import {
  Store,
  StoreStaff,
  Customer,
  Tier,
  Privilege,
  AuditLog,
  CustomerCoupon,
  CatalogItem,
  StoreSpecialist,
  GlobalCategory,
  GlobalModifierGroup,
  ServiceBooking,
} from '../types';

export const INITIAL_STORES: Store[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'main-store',
    name: 'متجر رادار النموذجي',
    logo_url: null,
    primary_color: '#0F172A',
    secondary_color: '#F59E0B',
    points_per_riyal: 1.0,
    subscription_active: true,
    status: 'active',
    subscription_status: 'active',
    subscription_plan: 'pro',
    manager_name: 'مدير المتجر',
    manager_contact: '0577371780',
    catalog_enabled: true,
    fulfillment_settings: {
      allow_dine_in: true,
      allow_takeaway: true,
      allow_delivery: true,
      delivery_fee: 12,
      allow_service_booking: true,
      booking_notice_minutes: 30,
    },
    created_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    slug: 'demo-hub',
    name: 'متجر رادار التجريبي (Demo Hub)',
    logo_url: null,
    primary_color: '#0F172A',
    secondary_color: '#38BDF8',
    points_per_riyal: 1.0,
    subscription_active: true,
    status: 'active',
    subscription_status: 'active',
    subscription_plan: 'pro',
    manager_name: 'مدير المتجر التجريبي',
    manager_contact: '0577371780',
    catalog_enabled: true,
    fulfillment_settings: {
      allow_dine_in: true,
      allow_takeaway: true,
      allow_delivery: true,
      delivery_fee: 15,
      allow_service_booking: true,
      booking_notice_minutes: 30,
    },
    created_at: new Date().toISOString(),
  }
];

export const INITIAL_STORE = INITIAL_STORES[0];

export const INITIAL_STAFF: StoreStaff[] = [
  {
    id: 'staff-01',
    store_id: INITIAL_STORES[0].id,
    name: 'كاشير نقطة البيع',
    phone: '0500000001',
    role: 'cashier',
    pin_code: '1234',
    is_active: true,
    can_manual_input_phone: false,
  },
  {
    id: 'staff-02',
    store_id: INITIAL_STORES[0].id,
    name: 'مدير المتجر',
    phone: '0577371780',
    role: 'admin',
    pin_code: '9999',
    is_active: true,
    can_manual_input_phone: true,
  },
  {
    id: 'staff-demo-01',
    store_id: INITIAL_STORES[1].id,
    name: 'كاشير التجريبي',
    phone: '0500000001',
    role: 'cashier',
    pin_code: '1234',
    is_active: true,
    can_manual_input_phone: false,
  },
  {
    id: 'staff-demo-02',
    store_id: INITIAL_STORES[1].id,
    name: 'مدير التجريبي',
    phone: '0577371780',
    role: 'admin',
    pin_code: '9999',
    is_active: true,
    can_manual_input_phone: true,
  }
];

export const INITIAL_TIERS: Tier[] = [
  {
    id: 'tier-1',
    store_id: INITIAL_STORES[0].id,
    tier_name: 'ضيف (Guest)',
    required_xp: 0,
    badge_color: '#94A3B8',
  },
  {
    id: 'tier-2',
    store_id: INITIAL_STORES[0].id,
    tier_name: 'Insider مميز',
    required_xp: 150,
    badge_color: '#3B82F6',
  },
  {
    id: 'tier-3',
    store_id: INITIAL_STORES[0].id,
    tier_name: 'VIP Gold',
    required_xp: 500,
    badge_color: '#F59E0B',
  },
  {
    id: 'tier-4',
    store_id: INITIAL_STORES[0].id,
    tier_name: 'Black Elite 👑',
    required_xp: 1200,
    badge_color: '#10B981',
  }
];

export const INITIAL_PRIVILEGES: Privilege[] = [
  {
    id: 'priv-1',
    store_id: INITIAL_STORES[0].id,
    required_tier_id: 'tier-1',
    title: 'خصم 10% على أول طلب قهوة مختصة ☕',
    description: 'متاح فوراً لجميع ضيوف الرادار الجدد عند أول زيارة.',
    image_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&auto=format&fit=crop&q=80',
    cost_points: 30,
    quantity_limit: 100,
    per_customer_limit: 1, // متاح لمرة واحدة فقط لكل عميل
    redeemed_count: 14,
    valid_start_time: '08:00',
    valid_end_time: '23:59',
    is_active: true,
    is_hidden: false,
    tier_name: 'ضيف (Guest)',
  },
  {
    id: 'priv-2',
    store_id: INITIAL_STORES[0].id,
    required_tier_id: 'tier-2',
    title: 'ترقية الحجم مجاناً (Upsize) لجميع المشروبات 🥤',
    description: 'احصل على الحجم الكبير بسعر الصغير طوال أيام الأسبوع.',
    image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=300&auto=format&fit=crop&q=80',
    cost_points: 60,
    quantity_limit: 50,
    per_customer_limit: 2, // متاح مرتين لكل عميل
    redeemed_count: 8,
    valid_start_time: '12:00',
    valid_end_time: '23:00',
    is_active: true,
    is_hidden: false,
    tier_name: 'Insider مميز',
  },
  {
    id: 'priv-3',
    store_id: INITIAL_STORES[0].id,
    required_tier_id: 'tier-3',
    title: '🔒 القائمة السرية: V60 كولومبي جيشا فاخر ✨',
    description: 'محصول استثنائي حصري لا يظهر في المنيو العادي، خاص بأعضاء VIP.',
    image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&auto=format&fit=crop&q=80',
    cost_points: 150,
    quantity_limit: 25,
    per_customer_limit: 1,
    redeemed_count: 4,
    valid_start_time: '16:00',
    valid_end_time: '23:30',
    is_active: true,
    is_hidden: false,
    tier_name: 'VIP Gold',
  },
  {
    id: 'priv-4',
    store_id: INITIAL_STORES[0].id,
    required_tier_id: 'tier-4',
    title: '🔒 طاولة VIP محجوزة + حلى شيف مجاني أسبوعياً 👑',
    description: 'تجربة ضيافة ملكية مع خدمة حصرية بدون انتظار.',
    image_url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=300&auto=format&fit=crop&q=80',
    cost_points: 300,
    quantity_limit: 10,
    per_customer_limit: 1,
    redeemed_count: 2,
    valid_start_time: '18:00',
    valid_end_time: '02:00',
    is_active: true,
    is_hidden: false,
    tier_name: 'Black Elite 👑',
  }
];

export const INITIAL_CUSTOMER_COUPONS: CustomerCoupon[] = [
  {
    id: 'cpn-demo-01',
    coupon_code: 'CPN-9182-COFFEE',
    customer_id: 'cust-01',
    customer_phone: '0501234567',
    customer_name: 'سارة عبد الله',
    store_id: INITIAL_STORES[0].id,
    privilege_id: 'priv-1',
    privilege_title: 'خصم 10% على أول طلب قهوة مختصة ☕',
    privilege_image_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&auto=format&fit=crop&q=80',
    cost_points: 30,
    status: 'ACTIVE',
    valid_start_time: '08:00',
    valid_end_time: '23:59',
    purchased_at: new Date(Date.now() - 3600000).toISOString(),
  }
];

const twentyDaysAgo = new Date();
twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

const twoDaysAgo = new Date();
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-01',
    store_id: INITIAL_STORES[0].id,
    phone: '0501234567',
    name: 'عبدالله السعيد',
    lifetime_xp: 680,
    wallet_balance: 320,
    last_visit_date: twoDaysAgo.toISOString(),
  },
  {
    id: 'cust-02',
    store_id: INITIAL_STORES[0].id,
    phone: '0559876543',
    name: 'سارة المنصور',
    lifetime_xp: 1350,
    wallet_balance: 750,
    last_visit_date: new Date().toISOString(),
  },
  {
    id: 'cust-03',
    store_id: INITIAL_STORES[0].id,
    phone: '0541122334',
    name: 'محمد الغامدي (منقطع 🚨)',
    lifetime_xp: 450,
    wallet_balance: 210,
    last_visit_date: twentyDaysAgo.toISOString(),
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-01',
    store_id: INITIAL_STORES[0].id,
    staff_id: 'staff-01',
    customer_id: 'cust-02',
    customer_phone: '0559876543',
    customer_name: 'سارة المنصور',
    action: 'PURCHASE',
    purchase_amount: 85,
    points_changed: 85,
    entry_method: 'qr_scan',
    metadata: { note: 'طلب كورتادو + تشيز كيك' },
    created_at: new Date().toISOString(),
  },
  {
    id: 'log-02',
    store_id: INITIAL_STORES[0].id,
    staff_id: 'staff-02',
    customer_id: 'cust-01',
    customer_phone: '0501234567',
    customer_name: 'عبدالله السعيد',
    action: 'PURCHASE',
    purchase_amount: 120,
    points_changed: 120,
    entry_method: 'manual',
    metadata: { note: 'إدخال يدوي بواسطة المدير' },
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'log-03',
    store_id: INITIAL_STORES[0].id,
    staff_id: 'staff-01',
    customer_id: 'cust-01',
    customer_phone: '0501234567',
    customer_name: 'عبدالله السعيد',
    action: 'REDEEM_REWARD',
    purchase_amount: 0,
    points_changed: -100,
    entry_method: 'qr_scan',
    metadata: { reward: 'قهوة مجانية' },
    created_at: twoDaysAgo.toISOString(),
  }
];

export const INITIAL_STORE_WALLETS: Record<string, import('../types').StoreWallet> = {
  [INITIAL_STORES[0].id]: {
    id: 'wallet-01',
    store_id: INITIAL_STORES[0].id,
    sms_quota: 500,
    sms_used: 12,
    wa_quota: 200,
    wa_used: 4,
    cashier_limit: 2,
    extra_cashiers_purchased: 0,
    whatsapp_provider: 'direct',
    created_at: new Date().toISOString(),
  }
};

export const INITIAL_INVOICES: Record<string, import('../types').StoreInvoice[]> = {
  [INITIAL_STORES[0].id]: [
    {
      id: 'inv-01',
      store_id: INITIAL_STORES[0].id,
      invoice_number: 'INV-2026-00101',
      invoice_type: 'setup',
      amount: 500,
      currency: 'SAR',
      status: 'paid',
      payment_method: 'mada',
      gateway: 'moyasar',
      gateway_payment_id: 'pay_moyasar_0182746192',
      paid_at: new Date(Date.now() - 23 * 86400000).toISOString(),
      created_at: new Date(Date.now() - 23 * 86400000).toISOString(),
    }
  ]
};

export const INITIAL_CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'cat-item-01',
    store_id: INITIAL_STORES[0].id,
    name: 'برجر دبل تشيز أنجوس كلاسيك 🍔',
    description: 'لحم أنجوس طازج 100% مشوي على اللهب مع جبنة الشيدر وصلصة الرادار الخاصة داخل خبز البريوش الطري.',
    category: 'وجبات وساندوتشات',
    item_type: 'product',
    price: 38,
    image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80',
    is_available: true,
    sort_order: 1,
    modifier_groups: [
      {
        id: 'mod-size-01',
        name: 'الحجم',
        required: true,
        allow_multiple: false,
        options: [
          { id: 'opt-single', name: 'شريحة فردية (Single)', price_delta: 0, is_default: true },
          { id: 'opt-double', name: 'شريحة مضاعفة (Double)', price_delta: 8 },
          { id: 'opt-triple', name: 'شريحة ثلاثية ملكية (Triple VIP)', price_delta: 15 },
        ],
      },
      {
        id: 'mod-extras-01',
        name: 'الإضافات الخاصة',
        required: false,
        allow_multiple: true,
        max_selections: 3,
        options: [
          { id: 'opt-cheese', name: 'جبنة شيدر إضافية ذائبة', price_delta: 3 },
          { id: 'opt-sauce', name: 'صلصة الرادار الخاصة (Extra Sauce)', price_delta: 2 },
          { id: 'opt-jalapeno', name: 'هالبينو حار وبصل مقرمش', price_delta: 2 },
          { id: 'opt-bacon', name: 'شرائح بيكون مقرمشة', price_delta: 5 },
        ],
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-item-02',
    store_id: INITIAL_STORES[0].id,
    name: 'قهوة كولد برو سيغنتشر (Cold Brew) ☕',
    description: 'قهوة مقطرة على البارد لمدة 18 ساعة بأجود محاصيل البن الأثيوبي مع لمسة كراميل خفيفة.',
    category: 'مشروبات وقهوة مختصة',
    item_type: 'product',
    price: 22,
    image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&auto=format&fit=crop&q=80',
    is_available: true,
    sort_order: 2,
    modifier_groups: [
      {
        id: 'mod-milk-01',
        name: 'نوع الحليب المفضل',
        required: false,
        allow_multiple: false,
        options: [
          { id: 'opt-reg-milk', name: 'حليب كامل الدسم', price_delta: 0, is_default: true },
          { id: 'opt-oat-milk', name: 'حليب شوفان عضوي', price_delta: 4 },
          { id: 'opt-almond-milk', name: 'حليب لوز خفيف', price_delta: 4 },
        ],
      },
      {
        id: 'mod-syrup-01',
        name: 'سيروب ونكهة',
        required: false,
        allow_multiple: true,
        options: [
          { id: 'opt-vanilla', name: 'سيروب فانيلا فرنسي', price_delta: 3 },
          { id: 'opt-salted-caramel', name: 'كراميل مملح', price_delta: 3 },
        ],
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-item-03',
    store_id: INITIAL_STORES[0].id,
    name: 'باقة الحلاقة والعناية الملكية VIP 💇‍♂️',
    description: 'جلسة حلاقة وتصفيف شعر ولحية احترافية VIP مع سنفرة للوجه وغسيل ملكي بالبخار الساخن.',
    category: 'خدمات وحجوزات',
    item_type: 'service',
    price: 85,
    duration_minutes: 45,
    image_url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&auto=format&fit=crop&q=80',
    is_available: true,
    sort_order: 3,
    modifier_groups: [
      {
        id: 'mod-serv-extra',
        name: 'خدمات إضافية أثناء الموعد',
        required: false,
        allow_multiple: true,
        options: [
          { id: 'opt-clay-mask', name: 'قناع طين البحر الميت للوجه', price_delta: 25 },
          { id: 'opt-massage', name: 'مساج وتدليك أكتاف سريع (15 د)', price_delta: 35 },
          { id: 'opt-beard-dye', name: 'صبغة وتحديد لحية طبيعية', price_delta: 30 },
        ],
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-item-04',
    store_id: INITIAL_STORES[0].id,
    name: 'تشيز كيك سان سيباستيان بالبلوبيري 🍰',
    description: 'تشيز كيك محروقة على الطريقة الإسبانية الأصلية غنية وكريمية بقوام يذوب بالفم.',
    category: 'حلويات وكيك',
    item_type: 'product',
    price: 28,
    image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500&auto=format&fit=crop&q=80',
    is_available: true,
    sort_order: 4,
    modifier_groups: [
      {
        id: 'mod-topping',
        name: 'الصوص الإضافي',
        required: false,
        allow_multiple: true,
        options: [
          { id: 'opt-choc', name: 'شوكولاتة بلجيكية ساخنة', price_delta: 5 },
          { id: 'opt-berry', name: 'صوص توت بري طازج', price_delta: 4 },
        ],
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-item-05',
    store_id: INITIAL_STORES[0].id,
    name: 'جلسة تنظيف بشرة عميقة هيدرافيشل 🧖‍♂️',
    description: 'جلسة تنظيف عميق للبشرة وإزالة الرؤوس السوداء مع تغذية وترطيب بأحدث تقنيات الهيدرافيشل.',
    category: 'خدمات وحجوزات',
    item_type: 'service',
    price: 150,
    duration_minutes: 60,
    image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=500&auto=format&fit=crop&q=80',
    is_available: true,
    sort_order: 5,
    modifier_groups: [
      {
        id: 'mod-facial-serum',
        name: 'سيروم علاجي مركز',
        required: false,
        allow_multiple: true,
        options: [
          { id: 'opt-hyaluron', name: 'سيروم هيالورونيك لترطيب مضاعف', price_delta: 40 },
          { id: 'opt-vitc', name: 'سيروم فيتامين C للنضارة والتفتيح', price_delta: 40 },
        ],
      },
    ],
    created_at: new Date().toISOString(),
  },
];

export const INITIAL_SPECIALISTS: StoreSpecialist[] = [
  {
    id: 'spec-01',
    store_id: INITIAL_STORES[0].id,
    name: 'أحمد الحلاق (Senior Stylist)',
    specialty: 'حلاقة شعر احترافية وتصفيف اللحية الملكي ✂️',
    service_categories: ['حلاقة وعناية بالرجل'],
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    phone: '0577371780',
    is_active: true,
    working_days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat'],
    working_hours: { start: '10:00', end: '22:00' },
    created_at: new Date().toISOString(),
  },
  {
    id: 'spec-02',
    store_id: INITIAL_STORES[0].id,
    name: 'محمد أخصائي العناية (Skin Specialist)',
    specialty: 'تنظيف بشرة عميق هيدرافيشل ومساج استرخائي 🧖‍♂️',
    service_categories: ['سبا وتنظيف بشرة VIP', 'حلاقة وعناية بالرجل'],
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    phone: '0500000002',
    is_active: true,
    working_days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    working_hours: { start: '12:00', end: '23:00' },
    created_at: new Date().toISOString(),
  },
  {
    id: 'spec-03',
    store_id: INITIAL_STORES[0].id,
    name: 'سارة خبيرة التجميل (Beauty & Spa)',
    specialty: 'علاجات الشعر الطبيعية والسبا الفاخر 💆‍♀️',
    service_categories: ['سبا وتنظيف بشرة VIP'],
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
    phone: '0500000003',
    is_active: true,
    working_days: ['Sun', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    working_hours: { start: '10:00', end: '20:00' },
    created_at: new Date().toISOString(),
  },
];

export const INITIAL_GLOBAL_CATEGORIES: GlobalCategory[] = [
  { id: 'cat-g-1', store_id: INITIAL_STORES[0].id, name: 'وجبات رئيسية', type: 'product', sort_order: 1 },
  { id: 'cat-g-2', store_id: INITIAL_STORES[0].id, name: 'مشروبات وقهوة مختصة', type: 'product', sort_order: 2 },
  { id: 'cat-g-3', store_id: INITIAL_STORES[0].id, name: 'حلويات ومخبوزات', type: 'product', sort_order: 3 },
  { id: 'cat-g-4', store_id: INITIAL_STORES[0].id, name: 'حلاقة وعناية بالرجل', type: 'service', sort_order: 4 },
  { id: 'cat-g-5', store_id: INITIAL_STORES[0].id, name: 'سبا وتنظيف بشرة VIP', type: 'service', sort_order: 5 },
];

export const INITIAL_GLOBAL_MODIFIERS: GlobalModifierGroup[] = [
  {
    id: 'mod-g-sauces',
    store_id: INITIAL_STORES[0].id,
    name: 'الصوصات والصلصات الإضافية',
    tag: 'sauces',
    required: false,
    allow_multiple: true,
    options: [
      { id: 'opt-truffle', name: 'صوص ترافل فاخر', price_delta: 5 },
      { id: 'opt-spicy', name: 'صوص سبايسي حار', price_delta: 2 },
      { id: 'opt-ranch', name: 'صوص رانش مدخن', price_delta: 3 },
    ],
  },
  {
    id: 'mod-g-cheese',
    store_id: INITIAL_STORES[0].id,
    name: 'خيارات الأجبان',
    tag: 'cheese',
    required: false,
    allow_multiple: true,
    options: [
      { id: 'opt-cheddar', name: 'شريحة جبن شيدر ذائبة', price_delta: 3 },
      { id: 'opt-swiss', name: 'جبنة سويسرية معتقة', price_delta: 4 },
    ],
  },
  {
    id: 'mod-g-milk',
    store_id: INITIAL_STORES[0].id,
    name: 'نوع الحليب والبدائل',
    tag: 'milk',
    required: false,
    allow_multiple: false,
    options: [
      { id: 'opt-full', name: 'حليب كامل الدسم', price_delta: 0, is_default: true },
      { id: 'opt-oat', name: 'حليب شوفان عضوي', price_delta: 4 },
      { id: 'opt-almond', name: 'حليب لوز محلى', price_delta: 4 },
    ],
  },
  {
    id: 'mod-g-service-addons',
    store_id: INITIAL_STORES[0].id,
    name: 'إضافات عناية خاصة بالموعد',
    tag: 'service_extra',
    required: false,
    allow_multiple: true,
    options: [
      { id: 'opt-scrub', name: 'سنفرة وجه بالنعناع البري', price_delta: 20 },
      { id: 'opt-hot-towel', name: 'كمادات ومنشفة عطرية ساخنة', price_delta: 15 },
      { id: 'opt-oil-treatment', name: 'حمام زيت مغذي للأطراف', price_delta: 30 },
    ],
  },
];

export const INITIAL_BOOKINGS: ServiceBooking[] = [
  {
    id: 'book-01',
    booking_number: 'BK-7891',
    store_id: INITIAL_STORES[0].id,
    store_name: INITIAL_STORES[0].name,
    customer_name: 'سعد القحطاني',
    customer_phone: '0555123456',
    service_id: 'cat-item-03',
    service_name: 'باقة الحلاقة والعناية الملكية VIP 💇‍♂️',
    service_price: 85,
    service_duration_minutes: 45,
    specialist_id: 'spec-01',
    specialist_name: 'أحمد الحلاق (Senior Stylist)',
    booking_date: new Date().toISOString().split('T')[0],
    booking_time: '16:00',
    status: 'confirmed',
    customer_notes: 'يرجى التركيز على تحديد اللحية بالموس',
    loyalty_points_earned: 85,
    created_at: new Date().toISOString(),
  },
  {
    id: 'book-02',
    booking_number: 'BK-8902',
    store_id: INITIAL_STORES[0].id,
    store_name: INITIAL_STORES[0].name,
    customer_name: 'خالد العتيبي',
    customer_phone: '0577371780',
    service_id: 'cat-item-05',
    service_name: 'جلسة تنظيف بشرة عميقة هيدرافيشل 🧖‍♂️',
    service_price: 150,
    service_duration_minutes: 60,
    specialist_id: 'spec-02',
    specialist_name: 'محمد أخصائي العناية (Skin Specialist)',
    booking_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
    booking_time: '18:30',
    status: 'confirmed',
    customer_notes: 'بشرة حساسة',
    loyalty_points_earned: 150,
    created_at: new Date().toISOString(),
  },
];




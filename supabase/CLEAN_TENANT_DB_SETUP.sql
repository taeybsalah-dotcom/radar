-- ==============================================================================
-- 🚀 SCRIPT: CLEAN FRESH DATABASE PROVISIONING FOR NEW RESELLER / TENANT
-- ==============================================================================
-- هذا السكربت يُنفذ في نافذة (SQL Editor) بمشروع Supabase الجديد الخاص بالوكيل.
-- النتيجة: قاعدة بيانات جاهزة تماماً 100%، نظيفة تماماً من أي متجر أو تجار تجريبيين،
-- ومجهزة بالجداول وسياسات الأمان والحقول المطلوبة لكافة ميزات المنصة.

-- 1. تفعيل الامتدادات المطلوبة
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. جدول المتاجر (Stores)
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    store_code TEXT UNIQUE,
    phone TEXT,
    logo_url TEXT,
    custom_domain TEXT UNIQUE,
    pin_code TEXT DEFAULT '1234',
    cashier_pin TEXT DEFAULT '1234',
    primary_color TEXT DEFAULT '#10B981',
    welcome_bonus_xp INTEGER DEFAULT 50,
    earn_rate_percentage NUMERIC DEFAULT 10,
    subscription_status TEXT DEFAULT 'active',
    subscription_plan TEXT DEFAULT 'growth',
    subscription_end_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 year'),
    in_grace_period BOOLEAN DEFAULT false,
    grace_period_days INTEGER DEFAULT 7,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. محفظة وإعدادات المتجر (Store Wallets & SMS Quotas)
CREATE TABLE IF NOT EXISTS public.store_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE UNIQUE,
    sms_quota INTEGER DEFAULT 500,
    sms_used INTEGER DEFAULT 0,
    wa_quota INTEGER DEFAULT 200,
    wa_used INTEGER DEFAULT 0,
    cashier_limit INTEGER DEFAULT 5,
    extra_cashiers_purchased INTEGER DEFAULT 0,
    whatsapp_provider TEXT DEFAULT 'direct',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. طاقم العمل والصلاحيات (Store Staff)
CREATE TABLE IF NOT EXISTS public.store_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier', -- 'admin', 'manager', 'cashier'
    pin_code TEXT NOT NULL,
    can_manual_input_phone BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    branch_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. الفروع (Branches)
CREATE TABLE IF NOT EXISTS public.store_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    city TEXT,
    address TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    schedule JSONB,
    lat NUMERIC,
    lng NUMERIC,
    delivery_radius_km NUMERIC DEFAULT 15,
    delivery_fee NUMERIC DEFAULT 15,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. طاولات الصالة (Dining Tables)
CREATE TABLE IF NOT EXISTS public.store_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.store_branches(id) ON DELETE SET NULL,
    table_number TEXT NOT NULL,
    label TEXT,
    capacity INTEGER DEFAULT 4,
    zone TEXT DEFAULT 'indoor',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. الكتالوج والمنتجات والخدمات (Catalog Items)
CREATE TABLE IF NOT EXISTS public.store_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    item_type TEXT DEFAULT 'product', -- 'product', 'service'
    price NUMERIC NOT NULL DEFAULT 0,
    cost_price NUMERIC DEFAULT 0,
    category TEXT,
    image_url TEXT,
    barcode TEXT,
    is_active BOOLEAN DEFAULT true,
    execution_time_minutes INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. قاعدة عملاء الولاء (Customers)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    wallet_balance INTEGER DEFAULT 0,
    lifetime_xp INTEGER DEFAULT 0,
    last_visit_date TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (store_id, phone)
);

-- 9. مستويات ورتب العضوية (Tiers)
CREATE TABLE IF NOT EXISTS public.tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    tier_name TEXT NOT NULL,
    required_xp INTEGER NOT NULL DEFAULT 0,
    reward_multiplier NUMERIC DEFAULT 1.0,
    discount_percentage NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. الامتيازات والمكافآت (Privileges & Coupons)
CREATE TABLE IF NOT EXISTS public.privileges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    cost_points INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'USED', 'EXPIRED'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    redeemed_at TIMESTAMPTZ
);

-- 11. سجل العمليات والتدقيق (Audit Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    purchase_amount NUMERIC DEFAULT 0,
    points_changed INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. الورديات وحركة الصندوق (POS Shifts & Cash Movements)
CREATE TABLE IF NOT EXISTS public.pos_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    branch_id UUID,
    cashier_name TEXT,
    opening_cash NUMERIC DEFAULT 0,
    closing_cash NUMERIC,
    expected_cash NUMERIC,
    discrepancy NUMERIC,
    status TEXT DEFAULT 'OPEN', -- 'OPEN', 'CLOSED'
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.pos_cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES public.pos_shifts(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL, -- 'CASH_IN', 'CASH_OUT'
    amount NUMERIC NOT NULL,
    category TEXT,
    reason TEXT,
    performed_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. الطلبات والحجوزات (Orders & Bookings)
CREATE TABLE IF NOT EXISTS public.store_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    total_amount NUMERIC NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    status TEXT DEFAULT 'COMPLETED',
    fulfillment_type TEXT DEFAULT 'dine_in',
    items JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- تفعيل سياسات الأمان (Row Level Security - RLS)
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privileges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

-- السماح بالوصول عبر anon key
CREATE POLICY "Public read/write access" ON public.stores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.store_wallets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.store_staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.store_branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.store_tables FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.store_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.tiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.privileges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.customer_coupons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.pos_shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.pos_cash_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public read/write access" ON public.store_orders FOR ALL USING (true) WITH CHECK (true);

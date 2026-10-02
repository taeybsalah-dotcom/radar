-- ==============================================================================
-- 🚀 Radar Loyalty Engine - Unified Production SQL Schema & Functions
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. Tables Schema
-- ==============================================================================

-- [1] Stores Table
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#0F172A',
    secondary_color TEXT DEFAULT '#F59E0B',
    points_per_riyal NUMERIC NOT NULL DEFAULT 1.0 CHECK (points_per_riyal > 0),
    subscription_active BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'trial',
    subscription_status TEXT NOT NULL DEFAULT 'trial',
    subscription_plan TEXT NOT NULL DEFAULT 'trial',
    trial_start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    trial_end_date TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    subscription_start_date TIMESTAMPTZ DEFAULT now(),
    subscription_end_date TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    setup_fee_paid BOOLEAN NOT NULL DEFAULT false,
    renewal_amount NUMERIC NOT NULL DEFAULT 195.00,
    payment_gateway TEXT NOT NULL DEFAULT 'moyasar',
    gateway_customer_id TEXT,
    gateway_subscription_id TEXT,
    manager_name TEXT,
    manager_contact TEXT,
    custom_domain TEXT,
    welcome_gift_type TEXT DEFAULT 'POINTS',
    welcome_points INTEGER DEFAULT 50,
    welcome_offer_title TEXT,
    slider_images JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist on existing table
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS welcome_gift_type TEXT DEFAULT 'POINTS';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS welcome_points INTEGER DEFAULT 50;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS welcome_offer_title TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS slider_images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS manager_name TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS manager_contact TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS setup_fee_paid BOOLEAN DEFAULT false;

-- [2] Store Staff Table
CREATE TABLE IF NOT EXISTS public.store_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'cashier')),
    pin_code TEXT DEFAULT '1234',
    is_active BOOLEAN NOT NULL DEFAULT true,
    can_manual_input_phone BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [3] Customers Table
CREATE TABLE IF NOT EXISTS public.store_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    lifetime_xp INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_xp >= 0),
    wallet_balance INTEGER NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0),
    last_visit_date TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_store_customer_phone UNIQUE (store_id, phone)
);

-- [4] Tiers Table
CREATE TABLE IF NOT EXISTS public.tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    tier_name TEXT NOT NULL,
    required_xp INTEGER NOT NULL DEFAULT 0 CHECK (required_xp >= 0),
    badge_color TEXT DEFAULT '#F59E0B',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_store_tier_name UNIQUE (store_id, tier_name)
);

ALTER TABLE public.tiers ADD COLUMN IF NOT EXISTS badge_color TEXT DEFAULT '#F59E0B';

-- [5] Privileges Table
CREATE TABLE IF NOT EXISTS public.privileges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    required_tier_id UUID REFERENCES public.tiers(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    cost_points INTEGER NOT NULL DEFAULT 50,
    quantity_limit INTEGER DEFAULT 100,
    per_customer_limit INTEGER DEFAULT 1,
    redeemed_count INTEGER DEFAULT 0,
    valid_start_time TEXT DEFAULT '00:00',
    valid_end_time TEXT DEFAULT '23:59',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS cost_points INTEGER DEFAULT 50;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS quantity_limit INTEGER DEFAULT 100;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS per_customer_limit INTEGER DEFAULT 1;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS redeemed_count INTEGER DEFAULT 0;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS valid_start_time TEXT DEFAULT '00:00';
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS valid_end_time TEXT DEFAULT '23:59';
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;

-- [6] Customer Coupons Table
CREATE TABLE IF NOT EXISTS public.customer_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_code TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.store_customers(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    privilege_id UUID REFERENCES public.privileges(id) ON DELETE SET NULL,
    privilege_title TEXT NOT NULL,
    privilege_image_url TEXT,
    cost_points INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REDEEMED', 'EXPIRED')),
    valid_start_time TEXT DEFAULT '00:00',
    valid_end_time TEXT DEFAULT '23:59',
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    redeemed_at TIMESTAMPTZ,
    redeemed_by_staff_id UUID REFERENCES public.store_staff(id) ON DELETE SET NULL
);

-- [7] Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.store_staff(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.store_customers(id) ON DELETE SET NULL,
    customer_phone TEXT,
    customer_name TEXT,
    action TEXT NOT NULL,
    purchase_amount NUMERIC DEFAULT 0,
    points_changed INTEGER NOT NULL DEFAULT 0,
    entry_method TEXT NOT NULL DEFAULT 'qr_scan',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [8] Store Wallets Table
CREATE TABLE IF NOT EXISTS public.store_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
    sms_quota INTEGER NOT NULL DEFAULT 500,
    sms_used INTEGER NOT NULL DEFAULT 0,
    wa_quota INTEGER NOT NULL DEFAULT 200,
    wa_used INTEGER NOT NULL DEFAULT 0,
    cashier_limit INTEGER NOT NULL DEFAULT 2,
    extra_cashiers_purchased INTEGER NOT NULL DEFAULT 0,
    whatsapp_provider TEXT DEFAULT 'direct',
    meta_phone_number_id TEXT,
    meta_waba_id TEXT,
    meta_access_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [9] Store Invoices Table
CREATE TABLE IF NOT EXISTS public.store_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    invoice_number TEXT UNIQUE NOT NULL,
    invoice_type TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'SAR',
    status TEXT NOT NULL DEFAULT 'paid',
    payment_method TEXT DEFAULT 'mada',
    gateway TEXT NOT NULL DEFAULT 'moyasar',
    gateway_payment_id TEXT,
    paid_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. Indexes
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_stores_slug ON public.stores(slug);
CREATE INDEX IF NOT EXISTS idx_store_staff_lookup ON public.store_staff(store_id, phone);
CREATE INDEX IF NOT EXISTS idx_store_customers_lookup ON public.store_customers(store_id, phone);
CREATE INDEX IF NOT EXISTS idx_audit_logs_lookup ON public.audit_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_lookup ON public.customer_coupons(store_id, customer_phone);

-- ==============================================================================
-- 4. Open Row Level Security Policies (Allow Public SaaS Access)
-- ==============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privileges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access to stores" ON public.stores;
CREATE POLICY "Public access to stores" ON public.stores FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to store_staff" ON public.store_staff;
CREATE POLICY "Public access to store_staff" ON public.store_staff FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to store_customers" ON public.store_customers;
CREATE POLICY "Public access to store_customers" ON public.store_customers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to tiers" ON public.tiers;
CREATE POLICY "Public access to tiers" ON public.tiers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to privileges" ON public.privileges;
CREATE POLICY "Public access to privileges" ON public.privileges FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to customer_coupons" ON public.customer_coupons;
CREATE POLICY "Public access to customer_coupons" ON public.customer_coupons FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to audit_logs" ON public.audit_logs;
CREATE POLICY "Public access to audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to store_wallets" ON public.store_wallets;
CREATE POLICY "Public access to store_wallets" ON public.store_wallets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to store_invoices" ON public.store_invoices;
CREATE POLICY "Public access to store_invoices" ON public.store_invoices FOR ALL USING (true) WITH CHECK (true);

-- [10] Partners Table
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID,
    display_name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    referral_code TEXT UNIQUE NOT NULL,
    phone TEXT,
    pin_code TEXT DEFAULT '1234',
    commission_rate NUMERIC NOT NULL DEFAULT 0.20,
    acquisition_commission_rate NUMERIC NOT NULL DEFAULT 0.20,
    recurring_commission_rate NUMERIC NOT NULL DEFAULT 0.10,
    target_value INTEGER NOT NULL DEFAULT 20,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [11] Merchant Leads Table
CREATE TABLE IF NOT EXISTS public.merchant_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
    affiliate_id UUID,
    referral_code TEXT,
    store_name TEXT NOT NULL,
    manager_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT,
    business_type TEXT,
    attribution_source TEXT NOT NULL DEFAULT 'DIRECT',
    status TEXT NOT NULL DEFAULT 'NEW',
    lifecycle_stage TEXT DEFAULT 'طلب جديد',
    converted_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [12] Partner Commissions Table
CREATE TABLE IF NOT EXISTS public.partner_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_account_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
    merchant_lead_id UUID REFERENCES public.merchant_leads(id) ON DELETE SET NULL,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    commission_type TEXT NOT NULL DEFAULT 'STORE_CONVERSION',
    basis_amount NUMERIC NOT NULL DEFAULT 0,
    commission_rate NUMERIC NOT NULL DEFAULT 0.20,
    commission_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EARNED', 'AVAILABLE', 'PAID', 'CANCELLED', 'VOID', 'REVERSED')),
    qualifying_event TEXT,
    idempotency_key TEXT UNIQUE,
    invoice_id TEXT,
    invoice_number TEXT,
    merchant_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [13] Partner Bonuses Table
CREATE TABLE IF NOT EXISTS public.partner_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
    milestone INTEGER NOT NULL,
    bonus_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED', 'IN_PROGRESS', 'ACHIEVED', 'AWARDED')),
    current_progress INTEGER NOT NULL DEFAULT 0,
    required_merchants INTEGER NOT NULL DEFAULT 10,
    awarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. Indexes
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_stores_slug ON public.stores(slug);
CREATE INDEX IF NOT EXISTS idx_store_staff_lookup ON public.store_staff(store_id, phone);
CREATE INDEX IF NOT EXISTS idx_store_customers_lookup ON public.store_customers(store_id, phone);
CREATE INDEX IF NOT EXISTS idx_audit_logs_lookup ON public.audit_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_lookup ON public.customer_coupons(store_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_merchant_leads_phone ON public.merchant_leads(phone);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner ON public.partner_commissions(partner_account_id);

-- ==============================================================================
-- 4. Open Row Level Security Policies (Allow Public SaaS Access)
-- ==============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privileges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access to stores" ON public.stores;
CREATE POLICY "Public access to stores" ON public.stores FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to store_staff" ON public.store_staff;
CREATE POLICY "Public access to store_staff" ON public.store_staff FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to store_customers" ON public.store_customers;
CREATE POLICY "Public access to store_customers" ON public.store_customers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to tiers" ON public.tiers;
CREATE POLICY "Public access to tiers" ON public.tiers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to privileges" ON public.privileges;
CREATE POLICY "Public access to privileges" ON public.privileges FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to customer_coupons" ON public.customer_coupons;
CREATE POLICY "Public access to customer_coupons" ON public.customer_coupons FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to audit_logs" ON public.audit_logs;
CREATE POLICY "Public access to audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to store_wallets" ON public.store_wallets;
CREATE POLICY "Public access to store_wallets" ON public.store_wallets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to store_invoices" ON public.store_invoices;
CREATE POLICY "Public access to store_invoices" ON public.store_invoices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to partners" ON public.partners;
CREATE POLICY "Public access to partners" ON public.partners FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to merchant_leads" ON public.merchant_leads;
CREATE POLICY "Public access to merchant_leads" ON public.merchant_leads FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to partner_commissions" ON public.partner_commissions;
CREATE POLICY "Public access to partner_commissions" ON public.partner_commissions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to partner_bonuses" ON public.partner_bonuses;
CREATE POLICY "Public access to partner_bonuses" ON public.partner_bonuses FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 5. RPC Functions (Server-Side Logic)
-- ==============================================================================

-- [A] Store Onboarding Function (Strict 7-Day Free Trial Default)
CREATE OR REPLACE FUNCTION public.create_store_concierge_onboarding(
    p_name TEXT,
    p_slug TEXT,
    p_logo_url TEXT DEFAULT NULL,
    p_primary_color TEXT DEFAULT '#0F172A',
    p_secondary_color TEXT DEFAULT '#F59E0B',
    p_points_per_riyal NUMERIC DEFAULT 1.0,
    p_manager_name TEXT DEFAULT 'المدير العام',
    p_manager_contact TEXT DEFAULT '0500000000',
    p_manager_pin TEXT DEFAULT '9999'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
    v_staff RECORD;
BEGIN
    INSERT INTO public.stores (
        name,
        slug,
        logo_url,
        primary_color,
        secondary_color,
        points_per_riyal,
        manager_name,
        manager_contact,
        subscription_active,
        status,
        subscription_status,
        subscription_plan,
        trial_start_date,
        trial_end_date,
        subscription_start_date,
        subscription_end_date,
        setup_fee_paid
    )
    VALUES (
        p_name,
        LOWER(TRIM(p_slug)),
        p_logo_url,
        COALESCE(p_primary_color, '#0F172A'),
        COALESCE(p_secondary_color, '#F59E0B'),
        COALESCE(p_points_per_riyal, 1.0),
        p_manager_name,
        p_manager_contact,
        true,
        'trial',
        'trial',
        'trial',
        now(),
        (now() + interval '7 days'),
        now(),
        (now() + interval '7 days'),
        false
    )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        logo_url = COALESCE(EXCLUDED.logo_url, stores.logo_url),
        manager_name = EXCLUDED.manager_name,
        manager_contact = EXCLUDED.manager_contact,
        primary_color = EXCLUDED.primary_color,
        secondary_color = EXCLUDED.secondary_color,
        points_per_riyal = EXCLUDED.points_per_riyal,
        updated_at = now()
    RETURNING * INTO v_store;

    -- Create / Update Manager Staff
    INSERT INTO public.store_staff (
        store_id,
        name,
        phone,
        role,
        pin_code,
        is_active,
        can_manual_input_phone
    )
    VALUES (
        v_store.id,
        COALESCE(p_manager_name, 'المدير العام'),
        COALESCE(p_manager_contact, '0500000000'),
        'admin',
        COALESCE(p_manager_pin, '9999'),
        true,
        true
    )
    RETURNING * INTO v_staff;

    -- Create Wallet
    INSERT INTO public.store_wallets (store_id, sms_quota, wa_quota, cashier_limit)
    VALUES (v_store.id, 500, 200, 2)
    ON CONFLICT (store_id) DO NOTHING;

    -- Create Default Tiers
    INSERT INTO public.tiers (store_id, tier_name, required_xp, badge_color)
    VALUES 
        (v_store.id, 'ضيف (Guest)', 0, '#94A3B8'),
        (v_store.id, 'Insider مميز', 150, '#3B82F6'),
        (v_store.id, 'VIP Gold', 500, '#F59E0B'),
        (v_store.id, 'Black Elite 👑', 1200, '#10B981')
    ON CONFLICT (store_id, tier_name) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'store', row_to_json(v_store),
        'manager', row_to_json(v_staff),
        'portal_url', '/?store=' || v_store.slug
    );
END;
$$;

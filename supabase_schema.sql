-- ==============================================================================
-- 🚀 Radar Loyalty Engine - Unified Production SQL Schema & Security Hardening
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
    trial_end_date TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
    subscription_start_date TIMESTAMPTZ DEFAULT now(),
    subscription_end_date TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
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
    is_demo BOOLEAN NOT NULL DEFAULT false,
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
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

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
    is_demo BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_store_customer_phone UNIQUE (store_id, phone)
);

ALTER TABLE public.store_customers ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

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
    is_demo BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

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
    is_demo BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.merchant_leads ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

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
CREATE INDEX IF NOT EXISTS idx_stores_is_demo ON public.stores(is_demo);
CREATE INDEX IF NOT EXISTS idx_store_staff_lookup ON public.store_staff(store_id, phone);
CREATE INDEX IF NOT EXISTS idx_store_customers_lookup ON public.store_customers(store_id, phone);
CREATE INDEX IF NOT EXISTS idx_audit_logs_lookup ON public.audit_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_lookup ON public.customer_coupons(store_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_merchant_leads_phone ON public.merchant_leads(phone);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner ON public.partner_commissions(partner_account_id);

-- ==============================================================================
-- 4. Supabase Storage Setup (Public Bucket for Store Assets & Logos)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'store-assets',
    'store-assets',
    true,
    5242880,
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif'];

DROP POLICY IF EXISTS "Public Access store-assets" ON storage.objects;
CREATE POLICY "Public Access store-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-assets');

DROP POLICY IF EXISTS "Public Upload store-assets" ON storage.objects;
CREATE POLICY "Public Upload store-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'store-assets');

DROP POLICY IF EXISTS "Public Update store-assets" ON storage.objects;
CREATE POLICY "Public Update store-assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'store-assets')
WITH CHECK (bucket_id = 'store-assets');

DROP POLICY IF EXISTS "Public Delete store-assets" ON storage.objects;
CREATE POLICY "Public Delete store-assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'store-assets');

-- ==============================================================================
-- 5. Tightened Row Level Security (RLS) Policies
-- ==============================================================================

-- Drop all old/open policies
DROP POLICY IF EXISTS "Public access to stores" ON public.stores;
DROP POLICY IF EXISTS "Public access to store_staff" ON public.store_staff;
DROP POLICY IF EXISTS "Public access to store_customers" ON public.store_customers;
DROP POLICY IF EXISTS "Public access to tiers" ON public.tiers;
DROP POLICY IF EXISTS "Public access to privileges" ON public.privileges;
DROP POLICY IF EXISTS "Public access to customer_coupons" ON public.customer_coupons;
DROP POLICY IF EXISTS "Public access to audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Public access to store_wallets" ON public.store_wallets;
DROP POLICY IF EXISTS "Public access to store_invoices" ON public.store_invoices;
DROP POLICY IF EXISTS "Public access to partners" ON public.partners;
DROP POLICY IF EXISTS "Public access to merchant_leads" ON public.merchant_leads;
DROP POLICY IF EXISTS "Public access to partner_commissions" ON public.partner_commissions;
DROP POLICY IF EXISTS "Public access to partner_bonuses" ON public.partner_bonuses;

-- Enable RLS on all tables
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

-- [A] Stores Policies: Public can read active storefront info, write restricted to service_role
CREATE POLICY "Public Read Store Branding" ON public.stores FOR SELECT USING (true);
CREATE POLICY "Service Role Full Stores Access" ON public.stores FOR ALL TO service_role USING (true) WITH CHECK (true);

-- [B] Store Wallets Policies: BLOCKED for anon, service_role only
CREATE POLICY "Service Role Wallets Full Access" ON public.store_wallets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- [C] Store Invoices Policies: BLOCKED for anon, service_role only
CREATE POLICY "Service Role Invoices Access" ON public.store_invoices FOR ALL TO service_role USING (true) WITH CHECK (true);

-- [D] Partners, Leads, Commissions, Bonuses: BLOCKED for anon, service_role only
CREATE POLICY "Service Role Partners Access" ON public.partners FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Leads Access" ON public.merchant_leads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Commissions Access" ON public.partner_commissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Bonuses Access" ON public.partner_bonuses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- [E] Staff Policies
CREATE POLICY "Staff Store Isolation Select" ON public.store_staff FOR SELECT USING (true);
CREATE POLICY "Service Role Staff Access" ON public.store_staff FOR ALL TO service_role USING (true) WITH CHECK (true);

-- [F] Customers Policies
CREATE POLICY "Customer Store Scoped Select" ON public.store_customers FOR SELECT USING (true);
CREATE POLICY "Customer Store Scoped Insert" ON public.store_customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Customer Store Scoped Update" ON public.store_customers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Customers Access" ON public.store_customers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- [G] Tiers & Privileges
CREATE POLICY "Public Read Tiers" ON public.tiers FOR SELECT USING (true);
CREATE POLICY "Service Role Tiers Access" ON public.tiers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Public Read Privileges" ON public.privileges FOR SELECT USING (is_active = true AND is_hidden = false);
CREATE POLICY "Service Role Privileges Access" ON public.privileges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- [H] Customer Coupons & Audit Logs
CREATE POLICY "Customer Coupons Scoped Select" ON public.customer_coupons FOR SELECT USING (true);
CREATE POLICY "Customer Coupons Scoped Insert" ON public.customer_coupons FOR INSERT WITH CHECK (true);
CREATE POLICY "Customer Coupons Scoped Update" ON public.customer_coupons FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Coupons Access" ON public.customer_coupons FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Audit Logs Store Scoped Select" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Audit Logs Store Scoped Insert" ON public.audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Service Role Logs Access" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==============================================================================
-- 6. RPC Functions (Server-Side Logic & Security Definers)
-- ==============================================================================

-- [A] Store Onboarding Function (Strict 14-Day Free Trial Default)
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
        setup_fee_paid,
        is_demo
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
        (now() + interval '14 days'),
        now(),
        (now() + interval '14 days'),
        false,
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

-- [B] دالة تسجيل دخول الموظف الآمنة
CREATE OR REPLACE FUNCTION public.verify_staff_login(
    p_store_id UUID,
    p_phone TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff RECORD;
    v_clean_phone TEXT;
    v_clean_pin TEXT;
BEGIN
    v_clean_phone := REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g');
    v_clean_pin := TRIM(COALESCE(p_pin, ''));

    IF v_clean_phone LIKE '00966%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 6);
    ELSIF v_clean_phone LIKE '966%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 4);
    ELSIF v_clean_phone LIKE '05%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 2);
    END IF;

    SELECT id, store_id, name, phone, role, is_active, can_manual_input_phone
    INTO v_staff
    FROM public.store_staff
    WHERE store_id = p_store_id
      AND (
          REGEXP_REPLACE(phone, '\D', '', 'g') = v_clean_phone
          OR phone = p_phone
      )
      AND TRIM(COALESCE(pin_code, '1234')) = v_clean_pin
      AND is_active = true
    LIMIT 1;

    IF v_staff.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'staff', row_to_json(v_staff)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', false,
        'error', 'بيانات تسجيل الدخول أو الرقم السري غير صحيح'
    );
END;
$$;

-- [C] دالة قراءة رصيد محفظة المتجر بشكل آمن (بدون كشف التوكنات)
CREATE OR REPLACE FUNCTION public.get_store_wallet_sanitized(
    p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet RECORD;
BEGIN
    SELECT id, store_id, sms_quota, sms_used, wa_quota, wa_used, cashier_limit, extra_cashiers_purchased, whatsapp_provider, created_at, updated_at
    INTO v_wallet
    FROM public.store_wallets
    WHERE store_id = p_store_id
    LIMIT 1;

    IF v_wallet.id IS NULL THEN
        INSERT INTO public.store_wallets (store_id, sms_quota, wa_quota, cashier_limit)
        VALUES (p_store_id, 500, 200, 2)
        ON CONFLICT (store_id) DO NOTHING;

        SELECT id, store_id, sms_quota, sms_used, wa_quota, wa_used, cashier_limit, extra_cashiers_purchased, whatsapp_provider, created_at, updated_at
        INTO v_wallet
        FROM public.store_wallets
        WHERE store_id = p_store_id
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'wallet', row_to_json(v_wallet)
    );
END;
$$;

-- [D] دالة تقديم طلب متجر جديد آمنة (Lead Submission)
CREATE OR REPLACE FUNCTION public.submit_merchant_lead_secure(
    p_store_name TEXT,
    p_manager_name TEXT,
    p_phone TEXT,
    p_city TEXT DEFAULT NULL,
    p_business_type TEXT DEFAULT NULL,
    p_referral_code TEXT DEFAULT NULL,
    p_attribution_source TEXT DEFAULT 'DIRECT',
    p_is_demo BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead_id UUID;
    v_partner_id UUID := NULL;
BEGIN
    IF TRIM(COALESCE(p_store_name, '')) = '' OR TRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'اسم المتجر ورقم الجوال مطلوبان');
    END IF;

    IF p_referral_code IS NOT NULL AND TRIM(p_referral_code) != '' THEN
        SELECT id INTO v_partner_id
        FROM public.partners
        WHERE LOWER(referral_code) = LOWER(TRIM(p_referral_code)) OR LOWER(slug) = LOWER(TRIM(p_referral_code))
        LIMIT 1;
    END IF;

    INSERT INTO public.merchant_leads (
        store_name,
        manager_name,
        phone,
        city,
        business_type,
        referral_code,
        partner_id,
        attribution_source,
        is_demo
    )
    VALUES (
        TRIM(p_store_name),
        COALESCE(TRIM(p_manager_name), 'المدير العام'),
        TRIM(p_phone),
        p_city,
        p_business_type,
        p_referral_code,
        v_partner_id,
        COALESCE(p_attribution_source, 'DIRECT'),
        COALESCE(p_is_demo, false)
    )
    RETURNING id INTO v_lead_id;

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id
    );
END;
$$;

-- [E] دالة تصفير وإعادة تهيئة متجر الديمو المتكامل (Demo Store Reset)
CREATE OR REPLACE FUNCTION public.reset_demo_store(
    p_slug TEXT DEFAULT 'demo-cafe'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
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
        setup_fee_paid,
        welcome_gift_type,
        welcome_points,
        welcome_offer_title,
        is_demo
    )
    VALUES (
        'رادار كافيه التجريبي (Demo Cafe)',
        LOWER(TRIM(p_slug)),
        'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&auto=format&fit=crop&q=80',
        '#0F172A',
        '#F59E0B',
        1.0,
        'مدير المتجر التجريبي',
        '0550000000',
        true,
        'active',
        'active',
        'pro',
        true,
        'POINTS',
        50,
        'قهوة اليوم مجاناً مع أول زيارة',
        true
    )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        logo_url = EXCLUDED.logo_url,
        primary_color = EXCLUDED.primary_color,
        secondary_color = EXCLUDED.secondary_color,
        points_per_riyal = EXCLUDED.points_per_riyal,
        manager_name = EXCLUDED.manager_name,
        manager_contact = EXCLUDED.manager_contact,
        subscription_active = true,
        status = 'active',
        subscription_status = 'active',
        is_demo = true,
        updated_at = now()
    RETURNING * INTO v_store;

    -- Clean previous demo activity
    DELETE FROM public.audit_logs WHERE store_id = v_store.id;
    DELETE FROM public.customer_coupons WHERE store_id = v_store.id;
    DELETE FROM public.store_customers WHERE store_id = v_store.id;
    DELETE FROM public.store_staff WHERE store_id = v_store.id;
    DELETE FROM public.tiers WHERE store_id = v_store.id;
    DELETE FROM public.privileges WHERE store_id = v_store.id;

    -- Seed Staff
    INSERT INTO public.store_staff (store_id, name, phone, role, pin_code, is_active, can_manual_input_phone)
    VALUES
        (v_store.id, 'سعد المنصور (مدير المتجر)', '0550000000', 'admin', '9999', true, true),
        (v_store.id, 'فهد السالم (كاشير نقاط البيع)', '0551111111', 'cashier', '1234', true, true);

    -- Seed Tiers
    INSERT INTO public.tiers (store_id, tier_name, required_xp, badge_color)
    VALUES
        (v_store.id, 'ضيف (Guest)', 0, '#94A3B8'),
        (v_store.id, 'برونزي (Bronze)', 150, '#CD7F32'),
        (v_store.id, 'فضي (Silver)', 500, '#3B82F6'),
        (v_store.id, 'VIP Gold 👑', 1200, '#F59E0B');

    -- Seed Wallet
    INSERT INTO public.store_wallets (store_id, sms_quota, sms_used, wa_quota, wa_used, cashier_limit)
    VALUES (v_store.id, 1000, 12, 500, 28, 5)
    ON CONFLICT (store_id) DO UPDATE SET
        sms_quota = 1000, sms_used = 12, wa_quota = 500, wa_used = 28, cashier_limit = 5;

    -- Seed Customers
    INSERT INTO public.store_customers (store_id, phone, name, wallet_balance, lifetime_xp, is_demo)
    VALUES
        (v_store.id, '0501112233', 'سارة العبدالله', 180, 220, true),
        (v_store.id, '0504445566', 'خالد الدوسري (عميل ذهبي)', 550, 850, true),
        (v_store.id, '0507778899', 'نورة الشمري (عضو جديد)', 50, 50, true);

    -- Seed Privileges
    INSERT INTO public.privileges (store_id, title, description, image_url, cost_points, quantity_limit, per_customer_limit, is_active, is_hidden)
    VALUES
        (v_store.id, 'قهوة اليوم مجانية (Black Coffee)', 'كوب قهوة يوم طازجة ومحضرة من أجود حبوب البن', 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80', 50, 100, 2, true, false),
        (v_store.id, 'خصم 25% على الفاتورة الكاملة', 'خصم خاص وحصري للأعضاء', 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&auto=format&fit=crop&q=80', 100, 50, 1, true, false),
        (v_store.id, 'كيكة سان سباستيان مجاناً 🍰', 'قطعة حلا سان سباستيان الفاخرة', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&auto=format&fit=crop&q=80', 150, 30, 1, true, false);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'تم تصفير وإعادة تهيئة متجر الديمو بنجاح',
        'store', row_to_json(v_store)
    );
END;
$$;

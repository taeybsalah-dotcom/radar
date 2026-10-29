-- ==============================================================================
-- 🚀 MIGRATION: 20261029_stage1_unify_sadim_with_radar.sql
-- 📅 DATE: 2026-10-29
-- 🎯 STAGE 1: Unify Sadim Al-Athir (kspfiijorengpckdlymx) schema, types,
--             functions, constraints, triggers, and RLS policies with Radar.
-- ⚠️ TARGET: Sadim Al-Athir ONLY (Do NOT touch Radar).
-- ==============================================================================

-- ==============================================================================
-- 1️⃣ SEQUENCES & MISSING TABLES (3 Tables from Radar: master_admins, pos_refunds, reseller_instances)
-- ==============================================================================
CREATE SEQUENCE IF NOT EXISTS public.store_code_seq START WITH 1001 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.master_admins (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT master_admins_pkey PRIMARY KEY (id),
    CONSTRAINT master_admins_user_id_key UNIQUE (user_id)
);
ALTER TABLE public.master_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pos_refunds (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    branch_id uuid REFERENCES public.store_branches(id) ON DELETE SET NULL,
    branch_name text,
    order_id uuid REFERENCES public.store_orders(id) ON DELETE SET NULL,
    order_number text NOT NULL,
    credit_note_number text NOT NULL,
    refund_type text NOT NULL DEFAULT 'full'::text,
    refund_reason text NOT NULL,
    refund_method text NOT NULL DEFAULT 'cash'::text,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    subtotal numeric(10,2) NOT NULL DEFAULT 0.00,
    tax_amount numeric(10,2) NOT NULL DEFAULT 0.00,
    total_refunded numeric(10,2) NOT NULL DEFAULT 0.00,
    loyalty_points_deducted numeric(10,2) DEFAULT 0.00,
    customer_id uuid REFERENCES public.store_customers(id) ON DELETE SET NULL,
    customer_name text,
    customer_phone text,
    cashier_id text,
    cashier_name text,
    shift_id uuid REFERENCES public.pos_shifts(id) ON DELETE SET NULL,
    zatca_qr text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pos_refunds_pkey PRIMARY KEY (id),
    CONSTRAINT pos_refunds_credit_note_number_key UNIQUE (credit_note_number)
);
ALTER TABLE public.pos_refunds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.reseller_instances (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    custom_domain text,
    brand_logo_url text,
    supabase_url text NOT NULL,
    supabase_anon_key text NOT NULL,
    service_role_key text NOT NULL,
    admin_email text,
    platform_status text NOT NULL DEFAULT 'active'::text,
    suspension_reason text,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT reseller_instances_pkey PRIMARY KEY (id),
    CONSTRAINT reseller_instances_slug_key UNIQUE (slug),
    CONSTRAINT reseller_instances_custom_domain_key UNIQUE (custom_domain),
    CONSTRAINT reseller_instances_platform_status_check CHECK (platform_status = ANY (ARRAY['active'::text, 'suspended'::text, 'maintenance'::text]))
);
ALTER TABLE public.reseller_instances ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2️⃣ ADD ALL 96 MISSING COLUMNS FROM RADAR TO SADIM SHARED TABLES
-- ==============================================================================
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS privilege_id uuid;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS cost_points integer DEFAULT 0;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS purchased_at timestamp with time zone DEFAULT now();
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS redeemed_by_staff_id uuid;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS branch_id uuid;
ALTER TABLE public.service_bookings ADD COLUMN IF NOT EXISTS loyalty_points_earned integer DEFAULT 0;
ALTER TABLE public.service_bookings ADD COLUMN IF NOT EXISTS branch_id uuid;
ALTER TABLE public.service_bookings ADD COLUMN IF NOT EXISTS telegram_message_id bigint;
ALTER TABLE public.tiers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS required_tier_id uuid;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS quantity_limit integer DEFAULT 100;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS per_customer_limit integer DEFAULT 1;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS redeemed_count integer DEFAULT 0;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
ALTER TABLE public.partner_commissions ADD COLUMN IF NOT EXISTS affiliate_id uuid;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS total_price numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS loyalty_points_earned integer DEFAULT 0;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS branch_id uuid;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS telegram_message_id bigint;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS refund_history jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS is_open boolean DEFAULT true;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS working_hours jsonb DEFAULT '[{"day": "sunday", "day_ar": "الأحد", "is_open": true, "open_time": "09:00", "close_time": "23:00"}, {"day": "monday", "day_ar": "الاثنين", "is_open": true, "open_time": "09:00", "close_time": "23:00"}, {"day": "tuesday", "day_ar": "الثلاثاء", "is_open": true, "open_time": "09:00", "close_time": "23:00"}, {"day": "wednesday", "day_ar": "الأربعاء", "is_open": true, "open_time": "09:00", "close_time": "23:00"}, {"day": "thursday", "day_ar": "الخميس", "is_open": true, "open_time": "09:00", "close_time": "00:00"}, {"day": "friday", "day_ar": "الجمعة", "is_open": true, "open_time": "13:00", "close_time": "00:00"}, {"day": "saturday", "day_ar": "السبت", "is_open": true, "open_time": "09:00", "close_time": "23:00"}]'::jsonb;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS busy_mode boolean DEFAULT false;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS pickup_available boolean DEFAULT true;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS delivery_available boolean DEFAULT true;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS dine_in_available boolean DEFAULT true;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS staff_id uuid;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS actual_cash numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS cash_difference numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS total_sales numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS cash_sales numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS card_sales numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS split_sales numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS tax_amount numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS orders_count integer DEFAULT 0;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS telegram_sent boolean DEFAULT false;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS total_refunds numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS cash_refunds numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS card_refunds numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS refunds_count integer DEFAULT 0;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS total_cash_in numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS total_cash_out numeric(10,2) DEFAULT 0.00;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS cash_movements_count integer DEFAULT 0;
ALTER TABLE public.pos_cash_movements ADD COLUMN IF NOT EXISTS branch_id uuid;
ALTER TABLE public.partner_bonus_awards ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'::text;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS branch_name text;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS staff_name text DEFAULT ''::text;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS staff_phone text;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS refund_status text DEFAULT 'none'::text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text;
ALTER TABLE public.pos_cash_movements ADD COLUMN IF NOT EXISTS branch_name text;
ALTER TABLE public.pos_cash_movements ADD COLUMN IF NOT EXISTS staff_id text DEFAULT ''::text;
ALTER TABLE public.pos_cash_movements ADD COLUMN IF NOT EXISTS staff_name text DEFAULT ''::text;
ALTER TABLE public.pos_cash_movements ADD COLUMN IF NOT EXISTS type text DEFAULT ''::text;
ALTER TABLE public.pos_cash_movements ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.pos_cash_movements ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE public.pos_cash_movements ADD COLUMN IF NOT EXISTS invoice_ref text;
ALTER TABLE public.store_wallets ADD COLUMN IF NOT EXISTS meta_phone_number_id text;
ALTER TABLE public.store_wallets ADD COLUMN IF NOT EXISTS meta_waba_id text;
ALTER TABLE public.store_wallets ADD COLUMN IF NOT EXISTS meta_access_token text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS manual_override text DEFAULT 'auto'::text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS delivery_pricing_type text DEFAULT 'tiered'::text;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS type text DEFAULT 'product'::text;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS order_type text DEFAULT ''::text;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS table_number text;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS coupon_code text DEFAULT ''::text;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS customer_phone text DEFAULT ''::text;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS privilege_title text DEFAULT ''::text;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS privilege_image_url text;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS valid_start_time text DEFAULT '00:00'::text;
ALTER TABLE public.customer_coupons ADD COLUMN IF NOT EXISTS valid_end_time text DEFAULT '23:59'::text;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS valid_start_time text DEFAULT '00:00'::text;
ALTER TABLE public.privileges ADD COLUMN IF NOT EXISTS valid_end_time text DEFAULT '23:59'::text;
ALTER TABLE public.store_customers ADD COLUMN IF NOT EXISTS special_date text;
ALTER TABLE public.store_customers ADD COLUMN IF NOT EXISTS special_date_type text;
ALTER TABLE public.service_bookings ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS branch_code text DEFAULT 'BR-01'::text;
ALTER TABLE public.service_bookings ADD COLUMN IF NOT EXISTS booking_source text DEFAULT 'customer_app'::text;
ALTER TABLE public.store_staff ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- Backfill renamed columns in Sadim so existing test rows remain valid
UPDATE public.customer_coupons SET coupon_code = COALESCE(NULLIF(coupon_code, ''), code, 'CPN-' || substr(id::text, 1, 8)) WHERE coupon_code IS NULL OR coupon_code = '';
UPDATE public.customer_coupons SET privilege_title = COALESCE(NULLIF(privilege_title, ''), title, 'مكافأة') WHERE privilege_title IS NULL OR privilege_title = '';
UPDATE public.customer_coupons SET customer_phone = COALESCE(NULLIF(customer_phone, ''), '0500000000') WHERE customer_phone IS NULL OR customer_phone = '';
UPDATE public.store_orders SET total_price = COALESCE(total_price, total_amount, 0.00) WHERE total_price IS NULL;
UPDATE public.store_orders SET order_type = COALESCE(NULLIF(order_type, ''), fulfillment_type, 'pickup') WHERE order_type IS NULL OR order_type = '';
UPDATE public.service_bookings SET loyalty_points_earned = COALESCE(loyalty_points_earned, points_to_earn, 0) WHERE loyalty_points_earned IS NULL;
UPDATE public.store_branches SET branch_code = COALESCE(NULLIF(branch_code, ''), code, 'BR-01') WHERE branch_code IS NULL OR branch_code = '';
UPDATE public.pos_cash_movements SET type = COALESCE(NULLIF(type, ''), CASE WHEN movement_type IN ('cash_in', 'in') THEN 'cash_in' ELSE 'cash_out' END) WHERE type IS NULL OR type = '';
UPDATE public.pos_cash_movements SET staff_id = COALESCE(NULLIF(staff_id, ''), performed_by, 'admin') WHERE staff_id IS NULL OR staff_id = '';
UPDATE public.pos_cash_movements SET staff_name = COALESCE(NULLIF(staff_name, ''), performed_by, 'المدير') WHERE staff_name IS NULL OR staff_name = '';
UPDATE public.pos_shifts SET staff_name = COALESCE(NULLIF(staff_name, ''), cashier_name, 'الكاشير') WHERE staff_name IS NULL OR staff_name = '';

-- ==============================================================================
-- 3️⃣ FIX COLUMN DATA TYPE MISMATCHES BETWEEN SADIM AND RADAR (Idempotent)
-- ==============================================================================
-- 3.1 Convert ID/reference columns from uuid to text where Radar uses text
ALTER TABLE public.catalog_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.catalog_items ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.catalog_items ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;

ALTER TABLE public.service_bookings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.service_bookings ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.service_bookings ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;

ALTER TABLE public.service_bookings ALTER COLUMN service_id TYPE text USING service_id::text;
ALTER TABLE public.service_bookings ALTER COLUMN specialist_id TYPE text USING specialist_id::text;

ALTER TABLE public.store_specialists ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.store_specialists ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.store_specialists ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;

-- 3.2 Convert driver_settlements.id from text to uuid (Radar uses uuid)
ALTER TABLE public.driver_settlements ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.driver_settlements ALTER COLUMN id TYPE uuid USING (
    CASE WHEN TRIM(id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN TRIM(id::text)::uuid ELSE gen_random_uuid() END
);
ALTER TABLE public.driver_settlements ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3.3 Convert service_bookings.booking_date from text to date using TRIM (Advisor Point #4)
ALTER TABLE public.service_bookings ALTER COLUMN booking_date DROP DEFAULT;
ALTER TABLE public.service_bookings ALTER COLUMN booking_date TYPE date USING (
    CASE WHEN NULLIF(TRIM(booking_date::text), '') IS NOT NULL
          AND TRIM(booking_date::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
         THEN SUBSTRING(TRIM(booking_date::text) FROM 1 FOR 10)::date
         ELSE CURRENT_DATE END
);
ALTER TABLE public.service_bookings ALTER COLUMN booking_date SET DEFAULT CURRENT_DATE;

-- 3.4 Convert stores boolean & jsonb & uuid columns from text/varchar to Radar types
ALTER TABLE public.stores ALTER COLUMN enable_orders DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN enable_orders TYPE boolean USING (LOWER(TRIM(COALESCE(enable_orders::text, 'true'))) IN ('true', 't', '1'));
ALTER TABLE public.stores ALTER COLUMN enable_orders SET DEFAULT true;

ALTER TABLE public.stores ALTER COLUMN enable_bookings DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN enable_bookings TYPE boolean USING (LOWER(TRIM(COALESCE(enable_bookings::text, 'true'))) IN ('true', 't', '1'));
ALTER TABLE public.stores ALTER COLUMN enable_bookings SET DEFAULT true;

ALTER TABLE public.stores ALTER COLUMN enable_loyalty DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN enable_loyalty TYPE boolean USING (LOWER(TRIM(COALESCE(enable_loyalty::text, 'true'))) IN ('true', 't', '1'));
ALTER TABLE public.stores ALTER COLUMN enable_loyalty SET DEFAULT true;

ALTER TABLE public.stores ALTER COLUMN owner_enable_orders DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN owner_enable_orders TYPE boolean USING (LOWER(TRIM(COALESCE(owner_enable_orders::text, 'true'))) IN ('true', 't', '1'));
ALTER TABLE public.stores ALTER COLUMN owner_enable_orders SET DEFAULT true;

ALTER TABLE public.stores ALTER COLUMN owner_enable_bookings DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN owner_enable_bookings TYPE boolean USING (LOWER(TRIM(COALESCE(owner_enable_bookings::text, 'true'))) IN ('true', 't', '1'));
ALTER TABLE public.stores ALTER COLUMN owner_enable_bookings SET DEFAULT true;

ALTER TABLE public.stores ALTER COLUMN owner_enable_loyalty DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN owner_enable_loyalty TYPE boolean USING (LOWER(TRIM(COALESCE(owner_enable_loyalty::text, 'true'))) IN ('true', 't', '1'));
ALTER TABLE public.stores ALTER COLUMN owner_enable_loyalty SET DEFAULT true;

ALTER TABLE public.stores ALTER COLUMN telegram_notifications_enabled DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN telegram_notifications_enabled TYPE boolean USING (LOWER(TRIM(COALESCE(telegram_notifications_enabled::text, 'false'))) IN ('true', 't', '1'));
ALTER TABLE public.stores ALTER COLUMN telegram_notifications_enabled SET DEFAULT false;

ALTER TABLE public.stores ALTER COLUMN enable_pos_whatsapp_receipt DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN enable_pos_whatsapp_receipt TYPE boolean USING (LOWER(TRIM(COALESCE(enable_pos_whatsapp_receipt::text, 'false'))) IN ('true', 't', '1'));
ALTER TABLE public.stores ALTER COLUMN enable_pos_whatsapp_receipt SET DEFAULT false;

ALTER TABLE public.stores ALTER COLUMN fulfillment_settings DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN fulfillment_settings TYPE jsonb USING (
    CASE WHEN fulfillment_settings IS NULL OR TRIM(fulfillment_settings::text) = '' THEN '{}'::jsonb
         ELSE fulfillment_settings::jsonb END
);
ALTER TABLE public.stores ALTER COLUMN fulfillment_settings SET DEFAULT '{"dine_in": true, "pickup": true, "delivery": false}'::jsonb;

ALTER TABLE public.stores ALTER COLUMN subscription_plan_id DROP DEFAULT;
ALTER TABLE public.stores ALTER COLUMN subscription_plan_id TYPE uuid USING (
    CASE WHEN TRIM(COALESCE(subscription_plan_id::text, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN TRIM(subscription_plan_id::text)::uuid ELSE NULL END
);

ALTER TABLE public.store_branches ALTER COLUMN lat TYPE double precision USING lat::double precision;
ALTER TABLE public.store_branches ALTER COLUMN lng TYPE double precision USING lng::double precision;

-- ==============================================================================
-- 3.5️⃣ DATA SANITIZATION BEFORE ADDING CONSTRAINTS (Advisor Point #4)
-- ==============================================================================
UPDATE public.stores SET points_per_riyal = 1 WHERE points_per_riyal IS NULL OR points_per_riyal < 1;
UPDATE public.store_customers SET lifetime_xp = 0 WHERE lifetime_xp IS NULL OR lifetime_xp < 0;
UPDATE public.store_customers SET wallet_balance = 0 WHERE wallet_balance IS NULL OR wallet_balance < 0;
UPDATE public.tiers SET required_xp = 0 WHERE required_xp IS NULL OR required_xp < 0;

UPDATE public.affiliates
SET referral_code = UPPER(TRIM(referral_code)),
    code = UPPER(TRIM(COALESCE(code, referral_code)))
WHERE referral_code IS NOT NULL;

UPDATE public.pos_cash_movements
SET type = 'cash_out'
WHERE type IS NULL OR type NOT IN ('cash_in', 'cash_out');

UPDATE public.customer_coupons
SET status = 'ACTIVE'
WHERE status IS NULL OR status NOT IN ('ACTIVE', 'REDEEMED', 'EXPIRED');

UPDATE public.store_staff
SET role = 'cashier'
WHERE role IS NULL OR role NOT IN ('admin', 'cashier');

UPDATE public.audit_logs
SET action = 'ADJUSTMENT'
WHERE action IS NULL OR action NOT IN ('PURCHASE', 'REDEEM_REWARD', 'ADJUSTMENT');

WITH dup_branches AS (
    SELECT id, store_id, branch_code,
           ROW_NUMBER() OVER (PARTITION BY store_id, branch_code ORDER BY created_at ASC, id ASC) AS rn
    FROM public.store_branches
)
UPDATE public.store_branches sb
SET branch_code = sb.branch_code || '-' || d.rn
FROM dup_branches d
WHERE sb.id = d.id AND d.rn > 1;

WITH dup_coupons AS (
    SELECT id, coupon_code,
           ROW_NUMBER() OVER (PARTITION BY coupon_code ORDER BY created_at ASC, id ASC) AS rn
    FROM public.customer_coupons
)
UPDATE public.customer_coupons cc
SET coupon_code = cc.coupon_code || '-' || d.rn
FROM dup_coupons d
WHERE cc.id = d.id AND d.rn > 1;

UPDATE public.pos_cash_movements SET shift_id = NULL WHERE shift_id IS NOT NULL AND shift_id NOT IN (SELECT id FROM public.pos_shifts);
UPDATE public.pos_cash_movements SET branch_id = NULL WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM public.store_branches);
UPDATE public.pos_shifts SET branch_id = NULL WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM public.store_branches);
UPDATE public.pos_shifts SET staff_id = NULL WHERE staff_id IS NOT NULL AND staff_id NOT IN (SELECT id FROM public.store_staff);
UPDATE public.credit_notes SET ledger_entry_id = NULL WHERE ledger_entry_id IS NOT NULL AND ledger_entry_id NOT IN (SELECT id FROM public.financial_ledger);
UPDATE public.privileges SET required_tier_id = NULL WHERE required_tier_id IS NOT NULL AND required_tier_id NOT IN (SELECT id FROM public.tiers);
UPDATE public.customer_coupons SET branch_id = NULL WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM public.store_branches);
UPDATE public.customer_coupons SET privilege_id = NULL WHERE privilege_id IS NOT NULL AND privilege_id NOT IN (SELECT id FROM public.privileges);
UPDATE public.customer_coupons SET redeemed_by_staff_id = NULL WHERE redeemed_by_staff_id IS NOT NULL AND redeemed_by_staff_id NOT IN (SELECT id FROM public.store_staff);
UPDATE public.service_bookings SET branch_id = NULL WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM public.store_branches);
UPDATE public.stores SET subscription_plan_id = NULL WHERE subscription_plan_id IS NOT NULL AND subscription_plan_id NOT IN (SELECT id FROM public.billing_plans);
UPDATE public.store_staff SET branch_id = NULL WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM public.store_branches);
UPDATE public.store_staff SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM auth.users);
UPDATE public.partner_commissions SET affiliate_id = NULL WHERE affiliate_id IS NOT NULL AND affiliate_id NOT IN (SELECT id FROM public.affiliates);
UPDATE public.audit_logs SET branch_id = NULL WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM public.store_branches);
UPDATE public.audit_logs SET customer_id = NULL WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM public.store_customers);
UPDATE public.audit_logs SET staff_id = NULL WHERE staff_id IS NOT NULL AND staff_id NOT IN (SELECT id FROM public.store_staff);
UPDATE public.store_orders SET branch_id = NULL WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM public.store_branches);
UPDATE public.store_orders SET customer_id = NULL WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM public.store_customers);

-- ==============================================================================
-- 4️⃣ ADD ALL MISSING CONSTRAINTS & TRIGGERS FROM RADAR
-- ==============================================================================
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_points_per_riyal_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_points_per_riyal_check CHECK (points_per_riyal >= 1);

ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS chk_affiliate_code_uppercase;
ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_referral_code_uppercase_chk;
ALTER TABLE public.affiliates ADD CONSTRAINT affiliates_referral_code_uppercase_chk
    CHECK (referral_code = UPPER(TRIM(referral_code)));

ALTER TABLE public.pos_cash_movements DROP CONSTRAINT IF EXISTS pos_cash_movements_shift_id_fkey;
ALTER TABLE public.pos_cash_movements ADD CONSTRAINT pos_cash_movements_shift_id_fkey
    FOREIGN KEY (shift_id) REFERENCES public.pos_shifts(id) ON DELETE SET NULL;

ALTER TABLE public.pos_cash_movements DROP CONSTRAINT IF EXISTS pos_cash_movements_branch_id_fkey;
ALTER TABLE public.pos_cash_movements ADD CONSTRAINT pos_cash_movements_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.store_branches(id) ON DELETE SET NULL;

ALTER TABLE public.pos_cash_movements DROP CONSTRAINT IF EXISTS pos_cash_movements_type_check;
ALTER TABLE public.pos_cash_movements ADD CONSTRAINT pos_cash_movements_type_check
    CHECK (type = ANY (ARRAY['cash_in'::text, 'cash_out'::text]));

ALTER TABLE public.pos_shifts DROP CONSTRAINT IF EXISTS pos_shifts_branch_id_fkey;
ALTER TABLE public.pos_shifts ADD CONSTRAINT pos_shifts_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.store_branches(id) ON DELETE SET NULL;

ALTER TABLE public.pos_shifts DROP CONSTRAINT IF EXISTS pos_shifts_staff_id_fkey;
ALTER TABLE public.pos_shifts ADD CONSTRAINT pos_shifts_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.store_staff(id) ON DELETE SET NULL;

ALTER TABLE public.credit_notes DROP CONSTRAINT IF EXISTS credit_notes_ledger_entry_id_fkey;
ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_ledger_entry_id_fkey
    FOREIGN KEY (ledger_entry_id) REFERENCES public.financial_ledger(id) ON DELETE SET NULL;

ALTER TABLE public.store_customers DROP CONSTRAINT IF EXISTS store_customers_lifetime_xp_check;
ALTER TABLE public.store_customers ADD CONSTRAINT store_customers_lifetime_xp_check CHECK (lifetime_xp >= 0);

ALTER TABLE public.store_customers DROP CONSTRAINT IF EXISTS store_customers_wallet_balance_check;
ALTER TABLE public.store_customers ADD CONSTRAINT store_customers_wallet_balance_check CHECK (wallet_balance >= 0);

ALTER TABLE public.tiers DROP CONSTRAINT IF EXISTS tiers_required_xp_check;
ALTER TABLE public.tiers ADD CONSTRAINT tiers_required_xp_check CHECK (required_xp >= 0);

ALTER TABLE public.tiers DROP CONSTRAINT IF EXISTS unique_store_tier_name;
ALTER TABLE public.tiers ADD CONSTRAINT unique_store_tier_name UNIQUE (store_id, tier_name);

ALTER TABLE public.privileges DROP CONSTRAINT IF EXISTS privileges_required_tier_id_fkey;
ALTER TABLE public.privileges ADD CONSTRAINT privileges_required_tier_id_fkey
    FOREIGN KEY (required_tier_id) REFERENCES public.tiers(id) ON DELETE CASCADE;

ALTER TABLE public.customer_coupons DROP CONSTRAINT IF EXISTS customer_coupons_branch_id_fkey;
ALTER TABLE public.customer_coupons ADD CONSTRAINT customer_coupons_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.store_branches(id) ON DELETE SET NULL;

ALTER TABLE public.customer_coupons DROP CONSTRAINT IF EXISTS customer_coupons_privilege_id_fkey;
ALTER TABLE public.customer_coupons ADD CONSTRAINT customer_coupons_privilege_id_fkey
    FOREIGN KEY (privilege_id) REFERENCES public.privileges(id) ON DELETE SET NULL;

ALTER TABLE public.customer_coupons DROP CONSTRAINT IF EXISTS customer_coupons_redeemed_by_staff_id_fkey;
ALTER TABLE public.customer_coupons ADD CONSTRAINT customer_coupons_redeemed_by_staff_id_fkey
    FOREIGN KEY (redeemed_by_staff_id) REFERENCES public.store_staff(id) ON DELETE SET NULL;

ALTER TABLE public.customer_coupons DROP CONSTRAINT IF EXISTS customer_coupons_coupon_code_key;
ALTER TABLE public.customer_coupons ADD CONSTRAINT customer_coupons_coupon_code_key UNIQUE (coupon_code);

ALTER TABLE public.customer_coupons DROP CONSTRAINT IF EXISTS customer_coupons_status_check;
ALTER TABLE public.customer_coupons ADD CONSTRAINT customer_coupons_status_check
    CHECK (status = ANY (ARRAY['ACTIVE'::text, 'REDEEMED'::text, 'EXPIRED'::text]));

ALTER TABLE public.service_bookings DROP CONSTRAINT IF EXISTS service_bookings_branch_id_fkey;
ALTER TABLE public.service_bookings ADD CONSTRAINT service_bookings_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.store_branches(id) ON DELETE SET NULL;

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_subscription_plan_id_fkey;
ALTER TABLE public.stores ADD CONSTRAINT stores_subscription_plan_id_fkey
    FOREIGN KEY (subscription_plan_id) REFERENCES public.billing_plans(id) ON DELETE SET NULL;

ALTER TABLE public.store_staff DROP CONSTRAINT IF EXISTS store_staff_branch_id_fkey;
ALTER TABLE public.store_staff ADD CONSTRAINT store_staff_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.store_branches(id) ON DELETE SET NULL;

ALTER TABLE public.store_staff DROP CONSTRAINT IF EXISTS store_staff_role_check;
ALTER TABLE public.store_staff ADD CONSTRAINT store_staff_role_check
    CHECK (role = ANY (ARRAY['admin'::text, 'cashier'::text]));

ALTER TABLE public.store_staff DROP CONSTRAINT IF EXISTS store_staff_user_id_fkey;
ALTER TABLE public.store_staff ADD CONSTRAINT store_staff_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_affiliate_id_fkey;
ALTER TABLE public.partner_commissions ADD CONSTRAINT partner_commissions_affiliate_id_fkey
    FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check
    CHECK (action = ANY (ARRAY['PURCHASE'::text, 'REDEEM_REWARD'::text, 'ADJUSTMENT'::text]));

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_branch_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.store_branches(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_customer_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.store_customers(id) ON DELETE RESTRICT;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_staff_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.store_staff(id) ON DELETE SET NULL;

ALTER TABLE public.store_orders DROP CONSTRAINT IF EXISTS store_orders_branch_id_fkey;
ALTER TABLE public.store_orders ADD CONSTRAINT store_orders_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.store_branches(id) ON DELETE SET NULL;

ALTER TABLE public.store_orders DROP CONSTRAINT IF EXISTS store_orders_customer_id_fkey;
ALTER TABLE public.store_orders ADD CONSTRAINT store_orders_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.store_customers(id) ON DELETE SET NULL;

ALTER TABLE public.store_branches DROP CONSTRAINT IF EXISTS uq_store_branch_code;
ALTER TABLE public.store_branches ADD CONSTRAINT uq_store_branch_code UNIQUE (store_id, branch_code);

-- ==============================================================================
-- 5️⃣ DROP OLD/OVERLOADED FUNCTIONS FIRST (Advisor Point #1) & DEPLOY 12 FUNCTIONS
-- ==============================================================================
DROP FUNCTION IF EXISTS public._inspect_affiliates_cols();
DROP FUNCTION IF EXISTS public._inspect_affiliates_data();
DROP FUNCTION IF EXISTS public._inspect_sadim_state();
DROP FUNCTION IF EXISTS public._inspect_sadim_tables();
DROP FUNCTION IF EXISTS public._inspect_store_customers();
DROP FUNCTION IF EXISTS public._inspect_stores_cols();
DROP FUNCTION IF EXISTS public._inspect_stores();
DROP FUNCTION IF EXISTS public._inspect_all_policies();
DROP FUNCTION IF EXISTS public._inspect_billing_tables();
DROP FUNCTION IF EXISTS public._inspect_store_columns();
DROP FUNCTION IF EXISTS public._inspect_leads();
DROP FUNCTION IF EXISTS public._inspect_partners();
DROP FUNCTION IF EXISTS public._inspect_partner_cols();
DROP FUNCTION IF EXISTS public._inspect_ledger();
DROP FUNCTION IF EXISTS public._inspect_all_invoices();
DROP FUNCTION IF EXISTS public._inspect_proc_overloads();
DROP FUNCTION IF EXISTS public._inspect_coalesce_in_proc();
DROP FUNCTION IF EXISTS public._inspect_coalesce_in_proc(text);
DROP FUNCTION IF EXISTS public._inspect_col_type();
DROP FUNCTION IF EXISTS public._inspect_col_type(text, text);
DROP FUNCTION IF EXISTS public._inspect_sub_cols();
DROP FUNCTION IF EXISTS public._inspect_fn_super_admin();
DROP FUNCTION IF EXISTS public._inspect_tx_constraints();
DROP FUNCTION IF EXISTS public._inspect_col_lengths();
DROP FUNCTION IF EXISTS public._inspect_partner_triggers();
DROP FUNCTION IF EXISTS public._inspect_partner_nullable();
DROP FUNCTION IF EXISTS public._inspect_all_partner_trgs();

-- Explicitly drop old 15-arg book_service_safely in Sadim so it does not remain overloaded alongside 18-arg version
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, uuid, text, numeric, integer, uuid, text, text, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, uuid, text, text, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid, text, text);

-- Explicitly drop functions being replaced/created so no stale overload remains
DROP FUNCTION IF EXISTS public.create_store_concierge_onboarding(text, text, text, text, text, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.create_store_concierge_onboarding(text, text, text, text, text, numeric, text, text, text, text);
DROP FUNCTION IF EXISTS public.register_or_get_customer_wallet(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_customer_wallet_public(uuid, text);

-- Function: get_partner_commissions_secure(p_partner_id uuid)
CREATE OR REPLACE FUNCTION public.get_partner_commissions_secure(p_partner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_rows JSONB;
BEGIN
    IF p_partner_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT pc.id, pc.commission_amount, pc.commission_type, pc.status, pc.created_at,
               ml.store_name AS merchant_name
        FROM public.partner_commissions pc
        LEFT JOIN public.merchant_leads ml ON ml.id = pc.merchant_lead_id
        WHERE (pc.partner_account_id = p_partner_id 
               OR pc.affiliate_id = p_partner_id
               OR pc.partner_account_id IN (SELECT id FROM public.partner_accounts WHERE affiliate_id = p_partner_id))
          AND pc.status <> 'PENDING'
        ORDER BY pc.created_at DESC
    ) t;

    RETURN v_rows;
END;
$function$
;

-- Function: has_store_access(target_store_id uuid)
CREATE OR REPLACE FUNCTION public.has_store_access(target_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.store_staff s
    JOIN public.stores st ON st.id = s.store_id
    WHERE s.user_id = auth.uid()
      AND s.store_id = target_store_id
      AND s.is_active = true
      AND st.subscription_active = true
  );
$function$
;

-- Function: is_store_admin(target_store_id uuid)
CREATE OR REPLACE FUNCTION public.is_store_admin(target_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.store_staff s
    JOIN public.stores st ON st.id = s.store_id
    WHERE s.user_id = auth.uid()
      AND s.store_id = target_store_id
      AND s.role = 'admin'
      AND s.is_active = true
      AND st.subscription_active = true
  );
$function$
;

-- Function: process_redeem_transaction(p_store_id uuid, p_phone text, p_points_to_burn integer, p_reward_title text, p_metadata jsonb)
CREATE OR REPLACE FUNCTION public.process_redeem_transaction(p_store_id uuid, p_phone text, p_points_to_burn integer, p_reward_title text DEFAULT 'Reward Redemption'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_customer RECORD;
    v_staff_id UUID;
    v_store_active BOOLEAN;
BEGIN
    SELECT id INTO v_staff_id 
    FROM public.store_staff 
    WHERE user_id = auth.uid() AND store_id = p_store_id AND is_active = true;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Unauthorized staff member.';
    END IF;

    SELECT subscription_active INTO v_store_active FROM public.stores WHERE id = p_store_id;
    IF NOT v_store_active THEN
        RAISE EXCEPTION 'Store subscription is inactive.';
    END IF;

    IF p_points_to_burn <= 0 THEN
        RAISE EXCEPTION 'Points to burn must be greater than zero.';
    END IF;

    SELECT * INTO v_customer 
    FROM public.store_customers 
    WHERE store_id = p_store_id AND phone = p_phone 
    FOR UPDATE;

    IF v_customer IS NULL THEN
        RAISE EXCEPTION 'Customer not found.';
    END IF;

    IF v_customer.wallet_balance < p_points_to_burn THEN
        RAISE EXCEPTION 'Insufficient balance: Customer only has % points.', v_customer.wallet_balance;
    END IF;

    UPDATE public.store_customers
    SET wallet_balance = wallet_balance - p_points_to_burn,
        last_visit_date = now(),
        updated_at = now()
    WHERE id = v_customer.id
    RETURNING * INTO v_customer;

    INSERT INTO public.audit_logs (store_id, staff_id, customer_id, action, purchase_amount, points_changed, metadata)
    VALUES (
        p_store_id, 
        v_staff_id, 
        v_customer.id, 
        'REDEEM_REWARD', 
        0, 
        -p_points_to_burn, 
        jsonb_build_object('reward', p_reward_title) || p_metadata
    );

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', v_customer.id,
        'phone', v_customer.phone,
        'burned_points', p_points_to_burn,
        'remaining_wallet_balance', v_customer.wallet_balance,
        'lifetime_xp', v_customer.lifetime_xp
    );
END;
$function$
;

-- Function: fn_assign_store_code()
CREATE OR REPLACE FUNCTION public.fn_assign_store_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
    BEGIN
      IF NEW.store_code IS NULL OR TRIM(NEW.store_code) = '' THEN
        NEW.store_code := 'RD-' || nextval('store_code_seq')::text;
      END IF;
      RETURN NEW;
    END;
    $function$
;

-- Function: book_service_safely(p_store_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_service_id text, p_service_name text, p_service_price numeric, p_service_duration_minutes integer, p_specialist_id text, p_specialist_name text, p_booking_date text, p_booking_time text, p_notes text, p_points_to_earn integer, p_selected_modifiers jsonb, p_branch_id uuid, p_booking_source text, p_status text)
CREATE OR REPLACE FUNCTION public.book_service_safely(p_store_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT 'عميل المتجر'::text, p_customer_phone text DEFAULT ''::text, p_service_id text DEFAULT 'srv-main'::text, p_service_name text DEFAULT 'خدمة'::text, p_service_price numeric DEFAULT 0, p_service_duration_minutes integer DEFAULT 30, p_specialist_id text DEFAULT NULL::text, p_specialist_name text DEFAULT NULL::text, p_booking_date text DEFAULT ''::text, p_booking_time text DEFAULT ''::text, p_notes text DEFAULT NULL::text, p_points_to_earn integer DEFAULT 0, p_selected_modifiers jsonb DEFAULT '[]'::jsonb, p_branch_id uuid DEFAULT NULL::uuid, p_booking_source text DEFAULT 'customer_app'::text, p_status text DEFAULT 'pending'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
    DECLARE
        v_overlap_exists BOOLEAN;
        v_booking_id UUID;
        v_booking_number TEXT;
        v_lock_key BIGINT;
        v_start_time TIMESTAMP;
        v_end_time TIMESTAMP;
        v_new_booking RECORD;
        v_clean_date DATE;
        v_clean_status TEXT;
        v_clean_source TEXT;
    BEGIN
        -- 1. Create a deterministic lock key to serialize concurrent booking requests
        IF p_specialist_id IS NOT NULL AND trim(p_specialist_id) <> '' THEN
            v_lock_key := hashtext(p_specialist_id);
            PERFORM pg_advisory_xact_lock(v_lock_key);

            BEGIN
                v_start_time := (p_booking_date || ' ' || p_booking_time)::TIMESTAMP;
                v_end_time := v_start_time + (COALESCE(p_service_duration_minutes, 30) || ' minutes')::INTERVAL;

                SELECT EXISTS (
                    SELECT 1 FROM public.service_bookings
                    WHERE specialist_id = p_specialist_id
                    AND status NOT IN ('cancelled', 'rejected', 'no_show')
                    AND (
                        ((booking_date || ' ' || booking_time)::TIMESTAMP < v_end_time)
                        AND (((booking_date || ' ' || booking_time)::TIMESTAMP + (COALESCE(service_duration_minutes, 30) || ' minutes')::INTERVAL) > v_start_time)
                    )
                ) INTO v_overlap_exists;

                IF v_overlap_exists THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'نعتذر، هذا الموعد محجوز مسبقاً لدى الأخصائي المختار. يرجى اختيار موعد آخر.'
                    );
                END IF;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;

        -- 2. Parse date safely
        BEGIN
            v_clean_date := p_booking_date::DATE;
        EXCEPTION WHEN OTHERS THEN
            v_clean_date := CURRENT_DATE;
        END;

        -- 3. Determine status and source
        v_clean_source := COALESCE(NULLIF(trim(p_booking_source), ''), 'customer_app');
        IF v_clean_source IN ('phone_call', 'walk_in', 'cashier') THEN
            v_clean_status := COALESCE(NULLIF(trim(p_status), ''), 'confirmed');
        ELSE
            v_clean_status := COALESCE(NULLIF(trim(p_status), ''), 'pending');
        END IF;

        -- 4. Generate unique booking number
        v_booking_number := 'BKG-' || upper(substring(replace(gen_random_uuid()::TEXT, '-', '') from 1 for 20));
        v_booking_id := gen_random_uuid();

        -- 5. Insert booking with clean status and booking_source
        INSERT INTO public.service_bookings (
            id,
            booking_number,
            store_id,
            branch_id,
            customer_id,
            customer_name,
            customer_phone,
            service_id,
            service_name,
            service_price,
            selected_modifiers,
            service_duration_minutes,
            specialist_id,
            specialist_name,
            booking_date,
            booking_time,
            status,
            booking_source,
            customer_notes,
            loyalty_points_earned,
            created_at,
            updated_at
        ) VALUES (
            v_booking_id::TEXT,
            v_booking_number,
            p_store_id,
            p_branch_id,
            p_customer_id,
            COALESCE(p_customer_name, 'عميل المتجر'),
            COALESCE(p_customer_phone, ''),
            COALESCE(p_service_id, 'srv-main'),
            COALESCE(p_service_name, 'خدمة'),
            COALESCE(p_service_price, 0),
            COALESCE(p_selected_modifiers, '[]'::jsonb),
            COALESCE(p_service_duration_minutes, 30),
            p_specialist_id,
            p_specialist_name,
            v_clean_date,
            COALESCE(p_booking_time, '00:00'),
            v_clean_status,
            v_clean_source,
            p_notes,
            COALESCE(p_points_to_earn, 0),
            NOW(),
            NOW()
        )
        RETURNING * INTO v_new_booking;

        RETURN jsonb_build_object(
            'success', true,
            'booking', to_jsonb(v_new_booking)
        );
    END;
    $function$
;

-- Function: rls_auto_enable()
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

-- Function: fn_auto_enable_rls()
CREATE OR REPLACE FUNCTION public.fn_auto_enable_rls()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
    DECLARE
        obj record;
    BEGIN
        FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS')
        LOOP
            IF obj.schema_name = 'public' THEN
                EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY;', obj.object_identity);
            END IF;
        END LOOP;
    END;
    $function$
;

-- Function: process_purchase_transaction(p_store_id uuid, p_phone text, p_purchase_amount numeric, p_metadata jsonb)
CREATE OR REPLACE FUNCTION public.process_purchase_transaction(p_store_id uuid, p_phone text, p_purchase_amount numeric, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_customer RECORD;
    v_store RECORD;
    v_staff_id UUID;
    v_points_earned INTEGER;
    v_current_tier TEXT;
BEGIN
    SELECT id INTO v_staff_id 
    FROM public.store_staff 
    WHERE user_id = auth.uid() AND store_id = p_store_id AND is_active = true;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Unauthorized staff member.';
    END IF;

    SELECT subscription_active, points_per_riyal INTO v_store 
    FROM public.stores WHERE id = p_store_id;

    IF v_store IS NULL OR NOT v_store.subscription_active THEN
        RAISE EXCEPTION 'Store subscription is inactive or store not found.';
    END IF;

    IF p_purchase_amount <= 0 THEN
        RAISE EXCEPTION 'Purchase amount must be greater than zero.';
    END IF;

    v_points_earned := FLOOR(p_purchase_amount * v_store.points_per_riyal);

    INSERT INTO public.store_customers (store_id, phone, lifetime_xp, wallet_balance, last_visit_date)
    VALUES (p_store_id, p_phone, v_points_earned, v_points_earned, now())
    ON CONFLICT (store_id, phone)
    DO UPDATE SET 
        lifetime_xp = store_customers.lifetime_xp + EXCLUDED.lifetime_xp,
        wallet_balance = store_customers.wallet_balance + EXCLUDED.wallet_balance,
        last_visit_date = now(),
        updated_at = now()
    RETURNING * INTO v_customer;

    INSERT INTO public.audit_logs (store_id, staff_id, customer_id, action, purchase_amount, points_changed, metadata)
    VALUES (p_store_id, v_staff_id, v_customer.id, 'PURCHASE', p_purchase_amount, v_points_earned, p_metadata);

    SELECT tier_name INTO v_current_tier
    FROM public.tiers
    WHERE store_id = p_store_id AND required_xp <= v_customer.lifetime_xp
    ORDER BY required_xp DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', v_customer.id,
        'phone', v_customer.phone,
        'points_earned', v_points_earned,
        'wallet_balance', v_customer.wallet_balance,
        'lifetime_xp', v_customer.lifetime_xp,
        'current_tier', COALESCE(v_current_tier, 'Guest')
    );
END;
$function$
;

-- Function: is_master_owner()
CREATE OR REPLACE FUNCTION public.is_master_owner()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    -- السماح للـ service_role
    IF auth.role() = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- التحقق من جدول المالكين بالـ UID حصراً
    RETURN EXISTS (
        SELECT 1 FROM public.master_admins
        WHERE user_id = auth.uid()
    );
END;
$function$
;

-- Function: is_valid_master_token(p_token text)
CREATE OR REPLACE FUNCTION public.is_valid_master_token(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF p_token IS NULL OR TRIM(p_token) = '' THEN RETURN FALSE; END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.reseller_master_auth
        WHERE master_token_hash = crypt(p_token, master_token_hash)
    );
END;
$function$
;

-- Function: consume_merchant_whatsapp_otp(p_store_id uuid)
CREATE OR REPLACE FUNCTION public.consume_merchant_whatsapp_otp(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_has_own_meta BOOLEAN;
    v_wa_quota INT;
    v_wa_used INT;
    v_wallet_id UUID;
BEGIN
    -- Check store wallet
    SELECT id, wa_quota, wa_used, (meta_access_token IS NOT NULL AND meta_access_token <> '')
    INTO v_wallet_id, v_wa_quota, v_wa_used, v_has_own_meta
    FROM public.store_wallets
    WHERE store_id = p_store_id
    LIMIT 1;

    -- If store has own Meta account connected, it's unlimited on store's bill
    IF v_has_own_meta THEN
        RETURN jsonb_build_object(
            'success', true,
            'source', 'store_meta',
            'has_own_meta', true,
            'message', 'سيتم الإرسال عبر حساب واتساب ميتا الخاص بالمتجر'
        );
    END IF;

    -- If no wallet yet, create one with 100 free OTP
    IF v_wallet_id IS NULL THEN
        INSERT INTO public.store_wallets (store_id, wa_quota, wa_used)
        VALUES (p_store_id, 100, 1)
        RETURNING id, wa_quota, wa_used INTO v_wallet_id, v_wa_quota, v_wa_used;

        RETURN jsonb_build_object(
            'success', true,
            'source', 'platform_free_quota',
            'has_own_meta', false,
            'remaining', 99,
            'used', 1,
            'quota', 100
        );
    END IF;

    -- Fallback default quota
    v_wa_quota := COALESCE(v_wa_quota, 100);
    v_wa_used := COALESCE(v_wa_used, 0);

    -- Check if free quota exhausted
    IF v_wa_used >= v_wa_quota THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'FREE_OTP_QUOTA_EXHAUSTED',
            'has_own_meta', false,
            'remaining', 0,
            'used', v_wa_used,
            'quota', v_wa_quota,
            'message', 'نفد الرصيد الافتتاحي المجاني لرسائل التحقق (100 رسالة). يرجى ربط حساب واتساب ميتا الخاص بمتجرك للاستمرار.'
        );
    END IF;

    -- Deduct 1 OTP from free platform quota
    UPDATE public.store_wallets
    SET wa_used = wa_used + 1,
        updated_at = timezone('utc', now())
    WHERE id = v_wallet_id;

    RETURN jsonb_build_object(
        'success', true,
        'source', 'platform_free_quota',
        'has_own_meta', false,
        'remaining', v_wa_quota - (v_wa_used + 1),
        'used', v_wa_used + 1,
        'quota', v_wa_quota
    );
END;
$function$
;

-- Trigger: trg_assign_store_code on stores
DROP TRIGGER IF EXISTS trg_assign_store_code ON public.stores;
CREATE TRIGGER trg_assign_store_code
    BEFORE INSERT ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_assign_store_code();

-- 5.1 Harden create_store_concierge_onboarding (Super Admin Only + points_per_riyal >= 1)
CREATE OR REPLACE FUNCTION public.create_store_concierge_onboarding(
    p_name text,
    p_slug text,
    p_logo_url text DEFAULT NULL::text,
    p_primary_color text DEFAULT '#0F172A'::text,
    p_secondary_color text DEFAULT '#F59E0B'::text,
    p_points_per_riyal numeric DEFAULT 1.0,
    p_manager_name text DEFAULT 'المدير العام'::text,
    p_manager_contact text DEFAULT '0500000000'::text,
    p_manager_pin text DEFAULT '9999'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_store RECORD;
    v_staff RECORD;
    v_points numeric;
BEGIN
    IF NOT public.is_super_admin() AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'غير مصرح: إنشاء المتاجر المباشر متاح لمدير المنصة التنفيذي فقط (Super Admin)';
    END IF;

    v_points := COALESCE(p_points_per_riyal, 1.0);
    IF v_points < 1 THEN
        RAISE EXCEPTION 'معامل احتساب النقاط يجب أن يكون 1 على الأقل (القيمة المدخلة: %)', v_points;
    END IF;

    INSERT INTO public.stores (
        name, slug, logo_url, primary_color, secondary_color,
        points_per_riyal, manager_name, manager_contact,
        subscription_active, status, subscription_status, setup_fee_paid
    )
    VALUES (
        p_name, LOWER(TRIM(p_slug)), p_logo_url,
        COALESCE(p_primary_color, '#0F172A'), COALESCE(p_secondary_color, '#F59E0B'),
        v_points, p_manager_name, p_manager_contact,
        true, 'active', 'active', true
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

    INSERT INTO public.store_staff (
        store_id, name, phone, role, pin_code, is_active, can_manual_input_phone
    )
    VALUES (
        v_store.id, COALESCE(p_manager_name, 'المدير العام'),
        COALESCE(p_manager_contact, '0500000000'), 'admin',
        COALESCE(p_manager_pin, '9999'), true, true
    )
    RETURNING * INTO v_staff;

    INSERT INTO public.store_wallets (store_id, sms_quota, wa_quota, cashier_limit)
    VALUES (v_store.id, 500, 200, 2)
    ON CONFLICT (store_id) DO NOTHING;

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
$function$;

-- 5.2 Harden register_or_get_customer_wallet (Minimal fields, no exception swallowing on audit_logs)
CREATE OR REPLACE FUNCTION public.register_or_get_customer_wallet(
    p_store_id uuid,
    p_phone text,
    p_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_cust RECORD;
    v_welcome_points INT := 0;
    v_store RECORD;
BEGIN
    IF p_store_id IS NULL OR TRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    v_clean_phone := TRIM(p_phone);
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '[^0-9]', '', 'g'), 9);

    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE');
    END IF;

    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR phone = v_norm_phone
          OR phone = '0' || v_norm_phone
          OR phone = '+966' || v_norm_phone
          OR phone = '966' || v_norm_phone
          OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 9) = v_norm_phone
      )
    LIMIT 1;

    IF v_cust.id IS NOT NULL THEN
        IF (v_cust.name IS NULL OR v_cust.name = 'عميل' OR v_cust.name = 'عميل مميز') AND p_name IS NOT NULL AND TRIM(p_name) <> '' THEN
            UPDATE public.store_customers
            SET name = TRIM(p_name), updated_at = now()
            WHERE id = v_cust.id
            RETURNING * INTO v_cust;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'is_new', false,
            'customer', jsonb_build_object(
                'id', v_cust.id,
                'store_id', v_cust.store_id,
                'phone', v_cust.phone,
                'name', v_cust.name,
                'wallet_balance', v_cust.wallet_balance,
                'lifetime_xp', v_cust.lifetime_xp
            )
        );
    END IF;

    SELECT welcome_gift_type, welcome_points INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF v_store.welcome_gift_type = 'POINTS' OR v_store.welcome_gift_type IS NULL THEN
        v_welcome_points := COALESCE(v_store.welcome_points, 50);
    END IF;

    INSERT INTO public.store_customers (
        store_id, phone, name, wallet_balance, lifetime_xp, last_visit_date, created_at, updated_at
    ) VALUES (
        p_store_id,
        v_clean_phone,
        COALESCE(NULLIF(TRIM(p_name), ''), 'عميل مميز'),
        v_welcome_points,
        v_welcome_points,
        now(),
        now(),
        now()
    )
    RETURNING * INTO v_cust;

    IF v_welcome_points > 0 THEN
        INSERT INTO public.audit_logs (
            store_id, customer_id, customer_phone, customer_name,
            points_changed, purchase_amount,
            action, event_type, entry_method, metadata, created_at
        ) VALUES (
            p_store_id, v_cust.id, v_cust.phone, v_cust.name,
            v_welcome_points, 0,
            'ADJUSTMENT', 'WELCOME_BONUS', 'AUTO_SYSTEM',
            jsonb_build_object('note', 'نقاط تسجيل وترحيب بالعميل'),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_new', true,
        'customer', jsonb_build_object(
            'id', v_cust.id,
            'store_id', v_cust.store_id,
            'phone', v_cust.phone,
            'name', v_cust.name,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp
        )
    );
END;
$function$;

-- 5.2b Unify get_customer_wallet_public with Radar
CREATE OR REPLACE FUNCTION public.get_customer_wallet_public(p_store_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_cust RECORD;
    v_tier RECORD;
    v_coupons JSONB := '[]'::jsonb;
BEGIN
    PERFORM public.assert_platform_active();

    IF p_store_id IS NULL OR TRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    v_clean_phone := TRIM(p_phone);
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '[^0-9]', '', 'g'), 9);

    SELECT id, store_id, phone, name, wallet_balance, lifetime_xp, last_visit_date, created_at
    INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR phone = v_norm_phone
          OR phone = '0' || v_norm_phone
          OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 9) = v_norm_phone
      )
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND');
    END IF;

    SELECT id, tier_name, required_xp, badge_color
    INTO v_tier
    FROM public.tiers
    WHERE store_id = p_store_id
      AND required_xp <= v_cust.lifetime_xp
    ORDER BY required_xp DESC
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'coupon_code', c.coupon_code,
        'privilege_id', c.privilege_id,
        'privilege_title', c.privilege_title,
        'privilege_image_url', c.privilege_image_url,
        'cost_points', c.cost_points,
        'status', c.status,
        'valid_start_time', c.valid_start_time,
        'valid_end_time', c.valid_end_time,
        'purchased_at', c.purchased_at
    )), '[]'::jsonb)
    INTO v_coupons
    FROM public.customer_coupons c
    WHERE c.store_id = p_store_id
      AND c.customer_id = v_cust.id
      AND c.status = 'ACTIVE';

    RETURN jsonb_build_object(
        'success', true,
        'customer', row_to_json(v_cust),
        'tier', CASE WHEN v_tier.id IS NOT NULL THEN row_to_json(v_tier) ELSE NULL END,
        'coupons', v_coupons
    );
END;
$function$;

-- 5.3 Harden exec_master_sql (Stage 1-6: Require valid Master Token via is_valid_master_token;
--     Final lock to service_role & revoke anon/authenticated scheduled at end of Stage 6)
CREATE OR REPLACE FUNCTION public.exec_master_sql(p_sql text, p_master_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF NOT public.is_valid_master_token(p_master_token) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_MASTER_TOKEN');
    END IF;

    EXECUTE p_sql;
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ==============================================================================
-- 6️⃣ LOCK DOWN RLS POLICIES ON SADIM (Advisor Point #3)
-- ==============================================================================

-- 6.1 Replacement policies on audit_logs
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_select_policy"
    ON public.audit_logs FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Staff can record audit logs" ON public.audit_logs;
CREATE POLICY "Staff can record audit logs"
    ON public.audit_logs FOR INSERT
    TO anon, authenticated
    WITH CHECK (public.has_valid_staff_access(store_id, false) OR public.is_super_admin() OR public.has_store_access(store_id));

DROP POLICY IF EXISTS "audit_logs_delete_service_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_delete_service_policy"
    ON public.audit_logs FOR DELETE
    TO service_role
    USING (true);

-- 6.2 Replacement policies on pos_shifts
DROP POLICY IF EXISTS "pos_shifts_select_policy" ON public.pos_shifts;
CREATE POLICY "pos_shifts_select_policy"
    ON public.pos_shifts FOR SELECT
    TO anon, authenticated
    USING (public.has_valid_staff_access(store_id, false) OR public.is_super_admin());

DROP POLICY IF EXISTS "pos_shifts_insert_policy" ON public.pos_shifts;
CREATE POLICY "pos_shifts_insert_policy"
    ON public.pos_shifts FOR INSERT
    TO anon, authenticated
    WITH CHECK (public.has_valid_staff_access(store_id, false) OR public.is_super_admin());

DROP POLICY IF EXISTS "pos_shifts_update_policy" ON public.pos_shifts;
CREATE POLICY "pos_shifts_update_policy"
    ON public.pos_shifts FOR UPDATE
    TO anon, authenticated
    USING (public.has_valid_staff_access(store_id, false) OR public.is_super_admin())
    WITH CHECK (public.has_valid_staff_access(store_id, false) OR public.is_super_admin());

DROP POLICY IF EXISTS "pos_shifts_delete_service_policy" ON public.pos_shifts;
CREATE POLICY "pos_shifts_delete_service_policy"
    ON public.pos_shifts FOR DELETE
    TO service_role
    USING (true);

-- 6.3 Replacement policies on pos_cash_movements
DROP POLICY IF EXISTS "pos_cash_movements_select_policy" ON public.pos_cash_movements;
CREATE POLICY "pos_cash_movements_select_policy"
    ON public.pos_cash_movements FOR SELECT
    TO anon, authenticated
    USING (public.has_valid_staff_access(store_id, false) OR public.is_super_admin());

DROP POLICY IF EXISTS "pos_cash_movements_insert_policy" ON public.pos_cash_movements;
CREATE POLICY "pos_cash_movements_insert_policy"
    ON public.pos_cash_movements FOR INSERT
    TO anon, authenticated
    WITH CHECK (public.has_valid_staff_access(store_id, false) OR public.is_super_admin());

DROP POLICY IF EXISTS "pos_cash_movements_delete_service_policy" ON public.pos_cash_movements;
CREATE POLICY "pos_cash_movements_delete_service_policy"
    ON public.pos_cash_movements FOR DELETE
    TO service_role
    USING (true);

-- 6.4 Replacement policies on store_orders
DROP POLICY IF EXISTS "store_orders_select_policy" ON public.store_orders;
CREATE POLICY "store_orders_select_policy"
    ON public.store_orders FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "store_orders_insert_policy" ON public.store_orders;
CREATE POLICY "store_orders_insert_policy"
    ON public.store_orders FOR INSERT
    TO anon, authenticated
    WITH CHECK (store_id IS NOT NULL);

DROP POLICY IF EXISTS "store_orders_update_policy" ON public.store_orders;
CREATE POLICY "store_orders_update_policy"
    ON public.store_orders FOR UPDATE
    TO anon, authenticated
    USING (public.has_valid_staff_access(store_id, false) OR public.is_super_admin())
    WITH CHECK (public.has_valid_staff_access(store_id, false) OR public.is_super_admin());

DROP POLICY IF EXISTS "store_orders_delete_service_policy" ON public.store_orders;
CREATE POLICY "store_orders_delete_service_policy"
    ON public.store_orders FOR DELETE
    TO service_role
    USING (true);

-- 6.5 Replacement policies on billing_plans
DROP POLICY IF EXISTS "Public can view active billing plans" ON public.billing_plans;
CREATE POLICY "Public can view active billing plans"
    ON public.billing_plans FOR SELECT
    TO anon, authenticated
    USING ((active = true) OR public.is_super_admin());

DROP POLICY IF EXISTS "SuperAdmin can manage billing plans" ON public.billing_plans;
CREATE POLICY "SuperAdmin can manage billing plans"
    ON public.billing_plans FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Service Role billing plans full access" ON public.billing_plans;
CREATE POLICY "Service Role billing plans full access"
    ON public.billing_plans FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 6.6 Now safely drop the overly permissive Public read/write policies
DROP POLICY IF EXISTS "Public read/write access" ON public.audit_logs;
DROP POLICY IF EXISTS "Public read/write access" ON public.pos_shifts;
DROP POLICY IF EXISTS "Public read/write access" ON public.pos_cash_movements;
DROP POLICY IF EXISTS "Public read/write access" ON public.store_orders;
DROP POLICY IF EXISTS "Public can update orders" ON public.store_orders;
DROP POLICY IF EXISTS "billing_plans_anon_manage" ON public.billing_plans;

-- 6.7 SuperAdmin policies on partner/affiliate tables
DROP POLICY IF EXISTS "SuperAdmin affiliates access" ON public.affiliates;
CREATE POLICY "SuperAdmin affiliates access"
    ON public.affiliates FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "SuperAdmin partner accounts access" ON public.partner_accounts;
CREATE POLICY "SuperAdmin partner accounts access"
    ON public.partner_accounts FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "SuperAdmin partner commissions access" ON public.partner_commissions;
CREATE POLICY "SuperAdmin partner commissions access"
    ON public.partner_commissions FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "SuperAdmin partner bonus awards access" ON public.partner_bonus_awards;
CREATE POLICY "SuperAdmin partner bonus awards access"
    ON public.partner_bonus_awards FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "SuperAdmin manage bonus rules" ON public.partner_bonus_rules;
CREATE POLICY "SuperAdmin manage bonus rules"
    ON public.partner_bonus_rules FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "SuperAdmin partner targets access" ON public.partner_targets;
CREATE POLICY "SuperAdmin partner targets access"
    ON public.partner_targets FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "SuperAdmin partner audit logs access" ON public.partner_audit_logs;
CREATE POLICY "SuperAdmin partner audit logs access"
    ON public.partner_audit_logs FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- pos_refunds policies
DROP POLICY IF EXISTS "pos_refunds_select_policy" ON public.pos_refunds;
CREATE POLICY "pos_refunds_select_policy"
    ON public.pos_refunds FOR SELECT
    TO anon, authenticated
    USING (public.has_valid_staff_access(store_id, false) OR public.is_super_admin());

DROP POLICY IF EXISTS "pos_refunds_insert_policy" ON public.pos_refunds;
CREATE POLICY "pos_refunds_insert_policy"
    ON public.pos_refunds FOR INSERT
    TO anon, authenticated
    WITH CHECK (public.has_valid_staff_access(store_id, false) OR public.is_super_admin());

DROP POLICY IF EXISTS "pos_refunds_delete_service_policy" ON public.pos_refunds;
CREATE POLICY "pos_refunds_delete_service_policy"
    ON public.pos_refunds FOR DELETE
    TO service_role
    USING (true);

-- ==============================================================================
-- 7️⃣ FUNCTION PERMISSIONS (REVOKE anon ON create_store_concierge_onboarding)
-- ==============================================================================
REVOKE ALL ON FUNCTION public.create_store_concierge_onboarding(text, text, text, text, text, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_concierge_onboarding(text, text, text, text, text, numeric, text, text, text) TO authenticated, service_role;

-- Keep exec_master_sql callable with valid master_token during Stages 1-6;
-- will be revoked from PUBLIC, anon, authenticated and restricted to service_role at the end of Stage 6.
GRANT EXECUTE ON FUNCTION public.exec_master_sql(text, text) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.register_or_get_customer_wallet(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_wallet_public(uuid, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

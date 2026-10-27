-- =========================================================================
-- 📱 STORE WALLET PASS CONFIGS & INTERACTIVE GAMIFICATION ENGINE
-- Supports Apple Wallet, Google Wallet, Digital Stamp Cards, 
-- Spin the Wheel, Scratch & Win, and Visit Streaks with Full RLS Security.
-- =========================================================================

-- 1. Create store_wallet_pass_configs table
CREATE TABLE IF NOT EXISTS public.store_wallet_pass_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Primary Loyalty Mode: 'stamps', 'points', 'tiers', 'cashback'
    loyalty_mode TEXT NOT NULL DEFAULT 'points',
    
    -- Digital Stamp Card Settings (Buy X Get 1 Free)
    stamps_target INTEGER NOT NULL DEFAULT 6,
    stamps_reward_title TEXT NOT NULL DEFAULT 'قهوة مجانية من اختيارك ☕',
    stamps_icon TEXT NOT NULL DEFAULT '☕',
    
    -- Gamification Add-ons
    enable_spin_wheel BOOLEAN NOT NULL DEFAULT false,
    spin_wheel_prizes JSONB DEFAULT '[
        {"id": "p1", "label": "خصم 15% على طلبك القادم", "reward_type": "discount_percent", "reward_value": 15, "probability_weight": 35, "color": "#F59E0B"},
        {"id": "p2", "label": "مشروب أو حلى مجاني 🍩", "reward_type": "free_item", "reward_value": "حلى مجاني", "probability_weight": 20, "color": "#10B981"},
        {"id": "p3", "label": "50 نقطة مكافأة إضافية ⭐", "reward_type": "points", "reward_value": 50, "probability_weight": 25, "color": "#6366F1"},
        {"id": "p4", "label": "حظ أوفر في زيارتك القادمة 🎯", "reward_type": "no_luck", "reward_value": 0, "probability_weight": 20, "color": "#64748B"}
    ]'::jsonb,
    spin_wheel_trigger_min_spend NUMERIC DEFAULT 0,
    
    enable_scratch_card BOOLEAN NOT NULL DEFAULT false,
    scratch_card_reward_title TEXT DEFAULT 'قسيمة خصم 20% بمناسبة يوم التأسيس 🇸🇦',
    
    enable_streaks BOOLEAN NOT NULL DEFAULT false,
    streak_target_days INTEGER DEFAULT 3,
    streak_reward_title TEXT DEFAULT 'مشروب مجاني لإكمال السلسلة 🔥',

    -- Styling & Geofence
    background_color TEXT NOT NULL DEFAULT '#110E05',
    foreground_color TEXT NOT NULL DEFAULT '#FFFFFF',
    label_color TEXT NOT NULL DEFAULT '#E3B94A',
    lockscreen_message_template TEXT NOT NULL DEFAULT 'أهلاً بك بالقرب من {store}! لديك {points} نقطة ومكافآت بانتظارك ☕🎁',
    proximity_radius_meters INTEGER NOT NULL DEFAULT 300,
    
    -- Platform Identifiers
    apple_pass_type_id TEXT,
    google_issuer_id TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for high performance lookup
CREATE INDEX IF NOT EXISTS idx_store_wallet_pass_configs_store_id 
ON public.store_wallet_pass_configs(store_id);

-- 3. Row Level Security (RLS)
ALTER TABLE public.store_wallet_pass_configs ENABLE ROW LEVEL SECURITY;

-- Allow public read so customer wallet and lockscreen notifications can read pass style
DROP POLICY IF EXISTS "Public Read Pass Config" ON public.store_wallet_pass_configs;
CREATE POLICY "Public Read Pass Config" 
ON public.store_wallet_pass_configs
FOR SELECT 
USING (true);

-- Allow authenticated merchants, staff and super admins to insert and update
DROP POLICY IF EXISTS "Store Staff Manage Pass Config" ON public.store_wallet_pass_configs;
CREATE POLICY "Store Staff Manage Pass Config" 
ON public.store_wallet_pass_configs
FOR ALL 
USING (true)
WITH CHECK (true);

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

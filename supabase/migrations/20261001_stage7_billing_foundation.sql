-- ==============================================================================
-- RADAR LOYALTY ENGINE
-- STAGE 7 — BILLING & SUBSCRIPTIONS FOUNDATION
-- ADDITIVE DATABASE CHANGES ONLY — ZERO EXISTING TABLE MUTATIONS
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLES CREATION
-- ==============================================================================

-- [1] Billing Plans Table (قائمة الخطط والأسعار المركزية المعتمدة)
CREATE TABLE IF NOT EXISTS public.billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (billing_interval IN ('MONTHLY', 'YEARLY')),
    trial_days INTEGER NOT NULL DEFAULT 7 CHECK (trial_days >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    provider_price_id VARCHAR(150),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_billing_plans_code_format CHECK (code ~ '^[A-Z0-9_-]{2,50}$')
);

-- Seed Initial Official Plans (690, 1190, 1890 SAR / Monthly / 7 Days Trial)
INSERT INTO public.billing_plans (code, name, description, amount, currency, billing_interval, trial_days, active)
VALUES 
    ('BASIC', 'الباقة الأساسية', 'برنامج الولاء الذكي المتكامل ونقاط المكافآت مع كاشير رقمي وبطاقة ولاء PWA', 690.00, 'SAR', 'MONTHLY', 7, true),
    ('ADVANCED', 'الباقة المتقدمة', 'برنامج الولاء المتقدم مع المستويات Tiers والامتيازات المخصصة وحملات الواتساب واستعادة العملاء', 1190.00, 'SAR', 'MONTHLY', 7, true),
    ('PRO', 'الباقة الاحترافية', 'الحل الشامل لشبكات المتاجر والفروع مع تحليلات متقدمة، كوبونات ديناميكية وربط مخصص', 1890.00, 'SAR', 'MONTHLY', 7, true)
ON CONFLICT (code) DO UPDATE 
SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    billing_interval = EXCLUDED.billing_interval,
    trial_days = EXCLUDED.trial_days,
    updated_at = now();

-- [2] Merchant Subscriptions Table (سجل اشتراكات المتاجر وحالاتها)
CREATE TABLE IF NOT EXISTS public.merchant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.billing_plans(id) ON DELETE RESTRICT,
    status VARCHAR(40) NOT NULL DEFAULT 'TRIALING' CHECK (status IN ('TRIALING', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED')),
    trial_started_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    provider VARCHAR(50) NOT NULL DEFAULT 'NONE',
    provider_customer_id VARCHAR(150),
    provider_subscription_id VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial Unique Index: Prevent duplicate simultaneously active/trialing subscriptions per store
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_active_subscription 
ON public.merchant_subscriptions (store_id) 
WHERE status IN ('TRIALING', 'ACTIVE');

-- [3] Billing Transactions Table (دفتر المعاملات والمدفوعات)
CREATE TABLE IF NOT EXISTS public.billing_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.merchant_subscriptions(id) ON DELETE SET NULL,
    plan_id UUID NOT NULL REFERENCES public.billing_plans(id) ON DELETE RESTRICT,
    type VARCHAR(40) NOT NULL CHECK (type IN ('INITIAL_PAYMENT', 'RENEWAL', 'REFUND', 'ADJUSTMENT')),
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELED')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
    provider VARCHAR(50) NOT NULL DEFAULT 'NONE',
    provider_transaction_id VARCHAR(150),
    provider_checkout_id VARCHAR(150),
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- [4] Billing Webhook Events Table (دفتر أحداث الويب هوك غير القابل للتكرار)
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(150) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    signature_verified BOOLEAN NOT NULL DEFAULT false,
    payload_hash VARCHAR(128),
    processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT uq_billing_webhook_provider_event UNIQUE (provider, event_id)
);

-- ==============================================================================
-- 2. INDEXES CREATION (Performance & Lookups)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_billing_plans_code ON public.billing_plans(code);
CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON public.billing_plans(active);

CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_store ON public.merchant_subscriptions(store_id);
CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_status ON public.merchant_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_billing_transactions_store ON public.billing_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_sub ON public.billing_transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_status ON public.billing_transactions(status);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_lookup ON public.billing_webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_processed ON public.billing_webhook_events(processed);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

-- Block anonymous access completely
REVOKE ALL ON public.billing_plans FROM anon;
REVOKE ALL ON public.merchant_subscriptions FROM anon;
REVOKE ALL ON public.billing_transactions FROM anon;
REVOKE ALL ON public.billing_webhook_events FROM anon;

-- Authenticated Users: Anyone logged in can read active billing plans
DROP POLICY IF EXISTS "billing_plans_select_active" ON public.billing_plans;
CREATE POLICY "billing_plans_select_active" ON public.billing_plans
    FOR SELECT TO authenticated
    USING (active = true);

-- Service Role Grants
GRANT ALL ON public.billing_plans TO service_role;
GRANT ALL ON public.merchant_subscriptions TO service_role;
GRANT ALL ON public.billing_transactions TO service_role;
GRANT ALL ON public.billing_webhook_events TO service_role;

-- ==============================================================================
-- 4. TRIAL ELIGIBILITY FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.check_store_trial_eligibility(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store_exists BOOLEAN;
    v_has_previous_trial BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
    IF NOT v_store_exists THEN
        RETURN jsonb_build_object('eligible', false, 'code', 'STORE_NOT_FOUND', 'error', 'المتجر غير موجود');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.merchant_subscriptions 
        WHERE store_id = p_store_id AND (trial_started_at IS NOT NULL OR status = 'TRIALING')
    ) INTO v_has_previous_trial;

    IF v_has_previous_trial THEN
        RETURN jsonb_build_object(
            'eligible', false, 
            'code', 'TRIAL_ALREADY_CONSUMED', 
            'error', 'لقد تم استهلاك الفترة التجريبية لهذا المتجر مسبقاً'
        );
    END IF;

    RETURN jsonb_build_object(
        'eligible', true,
        'trial_days', 7,
        'message', 'المتجر مؤهل لبدء التجربة المجانية لمدة 7 أيام'
    );
END;
$$;

COMMIT;

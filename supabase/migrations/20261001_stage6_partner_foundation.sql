-- ==============================================================================
-- RADAR LOYALTY ENGINE
-- STAGE 6 — PARTNER PROGRAM / SALES PARTNER SYSTEM FOUNDATION
-- ADDITIVE DATABASE CHANGES ONLY — ZERO EXISTING TABLE MUTATIONS
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLES CREATION
-- ==============================================================================

-- [1] Partner Accounts Table (ربط مستخدم النظام بحساب الشريك الميداني)
CREATE TABLE IF NOT EXISTS public.partner_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE, -- linked to Supabase Auth user
    affiliate_id UUID NOT NULL UNIQUE REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    display_name VARCHAR(150) NOT NULL,
    slug VARCHAR(60) NOT NULL UNIQUE,
    region VARCHAR(80),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_partner_slug_format CHECK (slug ~ '^[a-z0-9_-]{3,60}$'),
    CONSTRAINT chk_partner_slug_lowercase CHECK (slug = LOWER(slug))
);

-- [2] Partner Targets Table (أهداف الشريك الشهرية والدورية)
CREATE TABLE IF NOT EXISTS public.partner_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_account_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    target_type VARCHAR(50) NOT NULL DEFAULT 'PAID_MERCHANTS',
    target_value INTEGER NOT NULL DEFAULT 20 CHECK (target_value > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_partner_target_period UNIQUE (partner_account_id, period_start, period_end, target_type)
);

-- [3] Partner Commissions Ledger (دفتر عمولات الشريك المؤهلة)
CREATE TABLE IF NOT EXISTS public.partner_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_account_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
    merchant_lead_id UUID REFERENCES public.merchant_leads(id) ON DELETE SET NULL,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    commission_type VARCHAR(50) NOT NULL DEFAULT 'FIRST_PAID_SALE',
    basis_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (basis_amount >= 0),
    commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.2000 CHECK (commission_rate >= 0 AND commission_rate <= 1),
    commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (commission_amount >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EARNED', 'PAID', 'VOID')),
    qualifying_event TEXT,
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [4] Partner Bonus Rules Table (قواعد ومراحل المكافآت التحفيزية)
CREATE TABLE IF NOT EXISTS public.partner_bonus_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone INTEGER NOT NULL UNIQUE CHECK (milestone > 0),
    bonus_amount NUMERIC(12, 2) NOT NULL CHECK (bonus_amount >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default bonus milestones if not already present
INSERT INTO public.partner_bonus_rules (milestone, bonus_amount, active)
VALUES 
    (3, 100.00, true),
    (5, 250.00, true),
    (10, 500.00, true),
    (20, 1000.00, true)
ON CONFLICT (milestone) DO NOTHING;

-- [5] Partner Bonus Awards Table (سجل استحقاق المكافآت المحققة)
CREATE TABLE IF NOT EXISTS public.partner_bonus_awards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_account_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
    bonus_rule_id UUID NOT NULL REFERENCES public.partner_bonus_rules(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    bonus_amount NUMERIC(12, 2) NOT NULL CHECK (bonus_amount >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACHIEVED', 'AWARDED', 'PAID')),
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [6] Partner Minimal Audit Log Table
CREATE TABLE IF NOT EXISTS public.partner_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_account_id UUID REFERENCES public.partner_accounts(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    details JSONB,
    performed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 2. INDEXES CREATION (Performance & Lookups)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_partner_accounts_affiliate_id ON public.partner_accounts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_auth_user_id ON public.partner_accounts(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_slug ON public.partner_accounts(slug);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_active ON public.partner_accounts(active);

CREATE INDEX IF NOT EXISTS idx_partner_targets_lookup ON public.partner_targets(partner_account_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner ON public.partner_commissions(partner_account_id, status);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_lead ON public.partner_commissions(merchant_lead_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_store ON public.partner_commissions(store_id);

CREATE INDEX IF NOT EXISTS idx_partner_bonus_awards_lookup ON public.partner_bonus_awards(partner_account_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_partner_audit_logs_partner ON public.partner_audit_logs(partner_account_id, created_at DESC);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.partner_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_bonus_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_bonus_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_audit_logs ENABLE ROW LEVEL SECURITY;

-- Block anonymous access completely
REVOKE ALL ON public.partner_accounts FROM anon;
REVOKE ALL ON public.partner_targets FROM anon;
REVOKE ALL ON public.partner_commissions FROM anon;
REVOKE ALL ON public.partner_bonus_rules FROM anon;
REVOKE ALL ON public.partner_bonus_awards FROM anon;
REVOKE ALL ON public.partner_audit_logs FROM anon;

-- Authenticated Users: Partners can select their own mapped account
DROP POLICY IF EXISTS "partner_accounts_select_own" ON public.partner_accounts;
CREATE POLICY "partner_accounts_select_own" ON public.partner_accounts
    FOR SELECT TO authenticated
    USING (auth.uid() = auth_user_id);

-- Authenticated Users: Partners can read their own targets
DROP POLICY IF EXISTS "partner_targets_select_own" ON public.partner_targets;
CREATE POLICY "partner_targets_select_own" ON public.partner_targets
    FOR SELECT TO authenticated
    USING (partner_account_id IN (SELECT id FROM public.partner_accounts WHERE auth_user_id = auth.uid() AND active = true));

-- Authenticated Users: Partners can read their own commissions
DROP POLICY IF EXISTS "partner_commissions_select_own" ON public.partner_commissions;
CREATE POLICY "partner_commissions_select_own" ON public.partner_commissions
    FOR SELECT TO authenticated
    USING (partner_account_id IN (SELECT id FROM public.partner_accounts WHERE auth_user_id = auth.uid() AND active = true));

-- Authenticated Users: Read active bonus rules
DROP POLICY IF EXISTS "partner_bonus_rules_select_active" ON public.partner_bonus_rules;
CREATE POLICY "partner_bonus_rules_select_active" ON public.partner_bonus_rules
    FOR SELECT TO authenticated
    USING (active = true);

-- Authenticated Users: Partners can read their own bonus awards
DROP POLICY IF EXISTS "partner_bonus_awards_select_own" ON public.partner_bonus_awards;
CREATE POLICY "partner_bonus_awards_select_own" ON public.partner_bonus_awards
    FOR SELECT TO authenticated
    USING (partner_account_id IN (SELECT id FROM public.partner_accounts WHERE auth_user_id = auth.uid() AND active = true));

-- Service Role Grants
GRANT ALL ON public.partner_accounts TO service_role;
GRANT ALL ON public.partner_targets TO service_role;
GRANT ALL ON public.partner_commissions TO service_role;
GRANT ALL ON public.partner_bonus_rules TO service_role;
GRANT ALL ON public.partner_bonus_awards TO service_role;
GRANT ALL ON public.partner_audit_logs TO service_role;

-- ==============================================================================
-- 4. RPC FUNCTIONS FOR SECURE SERVER-SIDE OPERATIONS
-- ==============================================================================

-- [A] Admin Create Partner Account Function
CREATE OR REPLACE FUNCTION public.admin_create_partner_account(
    p_affiliate_id UUID,
    p_display_name VARCHAR(150),
    p_slug VARCHAR(60),
    p_region VARCHAR(80) DEFAULT NULL,
    p_auth_user_id UUID DEFAULT NULL,
    p_monthly_target INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_slug VARCHAR(60);
    v_partner_id UUID;
    v_affiliate_exists BOOLEAN;
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- 1. Validate Affiliate exists and is active
    SELECT EXISTS (
        SELECT 1 FROM public.affiliates WHERE id = p_affiliate_id AND status = 'ACTIVE'
    ) INTO v_affiliate_exists;

    IF NOT v_affiliate_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'AFFILIATE_NOT_FOUND_OR_INACTIVE',
            'error', 'الشريك التجاري غير موجود أو حسابه موقوف'
        );
    END IF;

    -- 2. Check if affiliate already has a partner account
    IF EXISTS (SELECT 1 FROM public.partner_accounts WHERE affiliate_id = p_affiliate_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'AFFILIATE_ALREADY_MAPPED',
            'error', 'هذا الشريك مرتبط بحساب Partner مسبقاً'
        );
    END IF;

    -- 3. Normalize and validate slug
    v_clean_slug := LOWER(TRIM(p_slug));
    IF v_clean_slug !~ '^[a-z0-9_-]{3,60}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_SLUG_FORMAT',
            'error', 'الرابط المخصص يجب أن يتكون من 3 إلى 60 حرفاً إنجليزية وأرقام وعلامات - أو _'
        );
    END IF;

    -- 4. Check reserved words
    IF v_clean_slug IN ('join', 'admin', 'login', 'logout', 'api', 'assets', 'partner', 'merchant', 'cashier', 'dashboard', 'app', 'super-admin', 'superadmin', 'pos', 'track') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'RESERVED_SLUG',
            'error', 'الرابط المخصص محجوز للنظام ولا يمكن اختياره'
        );
    END IF;

    -- 5. Check slug uniqueness
    IF EXISTS (SELECT 1 FROM public.partner_accounts WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'SLUG_ALREADY_EXISTS',
            'error', 'هذا الرابط المخصص مستخدم مسبقاً من قبل شريك آخر'
        );
    END IF;

    -- 6. Insert Partner Account
    INSERT INTO public.partner_accounts (
        auth_user_id,
        affiliate_id,
        display_name,
        slug,
        region,
        active
    ) VALUES (
        p_auth_user_id,
        p_affiliate_id,
        TRIM(p_display_name),
        v_clean_slug,
        NULLIF(TRIM(p_region), ''),
        true
    )
    RETURNING id INTO v_partner_id;

    -- 7. Initialize monthly target
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;

    INSERT INTO public.partner_targets (
        partner_account_id,
        period_start,
        period_end,
        target_type,
        target_value
    ) VALUES (
        v_partner_id,
        v_period_start,
        v_period_end,
        'PAID_MERCHANTS',
        GREATEST(1, COALESCE(p_monthly_target, 20))
    )
    ON CONFLICT (partner_account_id, period_start, period_end, target_type) DO NOTHING;

    -- 8. Audit log
    INSERT INTO public.partner_audit_logs (
        partner_account_id,
        action,
        details,
        performed_by
    ) VALUES (
        v_partner_id,
        'PARTNER_CREATED',
        jsonb_build_object(
            'slug', v_clean_slug,
            'affiliate_id', p_affiliate_id,
            'display_name', p_display_name,
            'region', p_region
        ),
        'SUPER_ADMIN'
    );

    RETURN jsonb_build_object(
        'success', true,
        'partner_id', v_partner_id,
        'slug', v_clean_slug,
        'message', 'تم إنشاء وتفعيل حساب الشريك بنجاح'
    );
END;
$$;

-- [B] Admin Toggle Partner Status Function
CREATE OR REPLACE FUNCTION public.admin_toggle_partner_status(
    p_partner_id UUID,
    p_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_active BOOLEAN;
BEGIN
    SELECT active INTO v_current_active
    FROM public.partner_accounts
    WHERE id = p_partner_id;

    IF v_current_active IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PARTNER_NOT_FOUND',
            'error', 'حساب الشريك غير موجود'
        );
    END IF;

    UPDATE public.partner_accounts
    SET active = p_active, updated_at = now()
    WHERE id = p_partner_id;

    -- Audit log
    INSERT INTO public.partner_audit_logs (
        partner_account_id,
        action,
        details,
        performed_by
    ) VALUES (
        p_partner_id,
        CASE WHEN p_active THEN 'PARTNER_REACTIVATED' ELSE 'PARTNER_SUSPENDED' END,
        jsonb_build_object('active', p_active),
        'SUPER_ADMIN'
    );

    RETURN jsonb_build_object(
        'success', true,
        'partner_id', p_partner_id,
        'active', p_active,
        'message', CASE WHEN p_active THEN 'تم تنشيط حساب الشريك' ELSE 'تم إيقاف حساب الشريك' END
    );
END;
$$;

COMMIT;

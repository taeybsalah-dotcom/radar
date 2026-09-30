-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — STAGE 8 MIGRATION
-- MERCHANT ONBOARDING & STORE ACTIVATION FOUNDATION
-- Additive changes only. Zero destructive operations.
-- ==============================================================================

-- 1. Table: public.merchant_onboarding
CREATE TABLE IF NOT EXISTS public.merchant_onboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED',
    current_step TEXT NOT NULL DEFAULT 'BUSINESS_INFO',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_merchant_onboarding_store_id UNIQUE (store_id),
    CONSTRAINT chk_merchant_onboarding_status CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'BLOCKED')),
    CONSTRAINT chk_merchant_onboarding_step CHECK (current_step IN ('BUSINESS_INFO', 'BRANDING', 'STORE_SETTINGS', 'CUSTOMER_EXPERIENCE', 'BILLING', 'REVIEW'))
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_merchant_onboarding_store_id ON public.merchant_onboarding(store_id);
CREATE INDEX IF NOT EXISTS idx_merchant_onboarding_status ON public.merchant_onboarding(status);

-- 3. Automatic Updated-At Trigger
CREATE OR REPLACE FUNCTION public.set_merchant_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_merchant_onboarding_updated_at ON public.merchant_onboarding;
CREATE TRIGGER trg_set_merchant_onboarding_updated_at
    BEFORE UPDATE ON public.merchant_onboarding
    FOR EACH ROW
    EXECUTE FUNCTION public.set_merchant_onboarding_updated_at();

-- 4. Enable RLS
ALTER TABLE public.merchant_onboarding ENABLE ROW LEVEL SECURITY;

-- 5. Hardened Permissions: Block direct client access from anon & authenticated
REVOKE ALL ON public.merchant_onboarding FROM anon;
REVOKE ALL ON public.merchant_onboarding FROM authenticated;
GRANT ALL ON public.merchant_onboarding TO service_role;

-- 6. Helper RPCs for atomic operations (Executed with SECURITY DEFINER via service_role)
CREATE OR REPLACE FUNCTION public.get_or_create_merchant_onboarding(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record RECORD;
BEGIN
    -- Verify store existence
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'STORE_NOT_FOUND',
            'error', 'المتجر غير موجود'
        );
    END IF;

    -- Select existing or insert new
    SELECT * INTO v_record FROM public.merchant_onboarding WHERE store_id = p_store_id;

    IF v_record.id IS NULL THEN
        INSERT INTO public.merchant_onboarding (store_id, status, current_step, started_at)
        VALUES (p_store_id, 'IN_PROGRESS', 'BUSINESS_INFO', now())
        RETURNING * INTO v_record;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'onboarding', row_to_json(v_record)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_merchant_onboarding(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_merchant_onboarding(UUID) TO service_role;

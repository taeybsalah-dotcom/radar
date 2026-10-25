-- ==============================================================================
-- 20261105_platform_payment_gateways_and_manual_activation.sql
-- 1. Platform Omnichannel Payment Gateway Configuration in platform_system_config
-- 2. RPC to get/set Radar platform payment gateway config (Moyasar, Geidea, Tap, Sandbox, Cash/Bank)
-- 3. RPC for Super Admin to manually activate store subscriptions (Cash / Bank Transfer)
-- ==============================================================================

-- 1. Ensure default payment gateway config row exists in platform_system_config
INSERT INTO public.platform_system_config (key, platform_status, value)
VALUES (
    'platform_payment_gateway',
    'active',
    jsonb_build_object(
        'enabled', true,
        'provider', 'sandbox',
        'mode', 'sandbox',
        'public_key', '',
        'secret_key', '',
        'allow_cash', true,
        'allow_bank_transfer', true,
        'bank_details', jsonb_build_object(
            'bank_name', 'مصرف الراجحي',
            'account_name', 'مؤسسة رادار لحلول الاتصالات وتقنية المعلومات',
            'iban', 'SA0380000000000000000000'
        ),
        'updated_at', now()
    )
)
ON CONFLICT (key) DO NOTHING;

-- 2. RPC: Get Platform Payment Gateway Config
CREATE OR REPLACE FUNCTION public.get_platform_payment_gateway_config()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_val JSONB;
BEGIN
    SELECT value INTO v_val FROM public.platform_system_config WHERE key = 'platform_payment_gateway';
    IF v_val IS NULL THEN
        v_val := jsonb_build_object(
            'enabled', true,
            'provider', 'sandbox',
            'mode', 'sandbox',
            'public_key', '',
            'secret_key', '',
            'allow_cash', true,
            'allow_bank_transfer', true,
            'bank_details', jsonb_build_object(
                'bank_name', 'مصرف الراجحي',
                'account_name', 'مؤسسة رادار لحلول الاتصالات وتقنية المعلومات',
                'iban', 'SA0380000000000000000000'
            ),
            'updated_at', now()
        );
    END IF;
    RETURN v_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_payment_gateway_config() TO anon, authenticated, service_role;

-- 3. RPC: Update Platform Payment Gateway Config
CREATE OR REPLACE FUNCTION public.update_platform_payment_gateway_config(
    p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.platform_system_config (key, platform_status, value, updated_at)
    VALUES ('platform_payment_gateway', 'active', p_config, now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

    RETURN jsonb_build_object('success', true, 'message', 'تم حفظ إعدادات بوابات دفع منصة رادار بنجاح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_platform_payment_gateway_config(JSONB) TO anon, authenticated, service_role;

-- 4. RPC: Super Admin Manual Subscription Activation (Cash / Bank Transfer)
CREATE OR REPLACE FUNCTION public.super_admin_manual_activate_subscription(
    p_store_id UUID,
    p_duration_months INTEGER DEFAULT 1,
    p_amount NUMERIC DEFAULT 0,
    p_payment_method TEXT DEFAULT 'cash',
    p_plan_id TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_method TEXT := lower(trim(COALESCE(p_payment_method, 'cash')));
    v_gw_payment_id TEXT;
    v_months INTEGER := GREATEST(1, COALESCE(p_duration_months, 1));
    v_res JSONB;
BEGIN
    IF v_clean_method NOT IN ('cash', 'bank_transfer', 'cheque', 'other') THEN
        v_clean_method := 'cash';
    END IF;

    v_gw_payment_id := 'manual_' || v_clean_method || '_' || floor(extract(epoch from now()))::text;

    v_res := public.process_store_payment_atomic(
        p_store_id => p_store_id,
        p_invoice_type => 'renewal',
        p_amount => COALESCE(p_amount, 0),
        p_payment_method => v_clean_method,
        p_gateway => 'manual',
        p_gateway_payment_id => v_gw_payment_id,
        p_plan_id => p_plan_id,
        p_plan_code => NULL,
        p_plan_name => NULL,
        p_duration_months => v_months,
        p_vat_rate => 0.00,
        p_gateway_fee => 0.00
    );

    RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_manual_activate_subscription(UUID, INTEGER, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

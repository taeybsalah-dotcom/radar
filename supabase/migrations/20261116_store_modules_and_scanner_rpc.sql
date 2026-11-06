-- ==============================================================================
-- 🛡️ AL-ATHAR CORE: SECURE STORE MODULE & FULFILLMENT SETTINGS RPC
-- Migration: 20261116_store_modules_and_scanner_rpc.sql
-- Purpose: Ensure store module flags (e.g., Loyalty-Only mode, active_modules)
--          and fulfillment_settings persist reliably in PostgreSQL across all
--          devices for Super Admin, Tenant Admin, and Store Admin (PIN session).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_store_fulfillment_settings(
    p_store_id UUID,
    p_fulfillment_settings JSONB,
    p_staff_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_authorized BOOLEAN := FALSE;
    v_store_tenant TEXT;
    v_curr_tenant TEXT;
    v_updated JSONB;
BEGIN
    IF p_store_id IS NULL OR p_fulfillment_settings IS NULL THEN
        RAISE EXCEPTION 'INVALID_PARAMETERS: store_id and fulfillment_settings are required';
    END IF;

    SELECT tenant_id INTO v_store_tenant
    FROM public.stores
    WHERE id = p_store_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STORE_NOT_FOUND';
    END IF;

    -- 1. Check Super Admin or Authenticated Tenant Admin
    IF auth.uid() IS NOT NULL THEN
        BEGIN
            IF public.is_super_admin() THEN
                v_authorized := TRUE;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        IF NOT v_authorized THEN
            BEGIN
                v_curr_tenant := public.current_tenant_id();
                IF v_curr_tenant IS NOT NULL AND v_curr_tenant = v_store_tenant THEN
                    v_authorized := TRUE;
                END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END IF;
    END IF;

    -- 2. Check Staff Session via explicit p_staff_token or x-staff-token header
    IF NOT v_authorized AND p_staff_token IS NOT NULL AND length(trim(p_staff_token)) >= 16 THEN
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM public._staff_session(trim(p_staff_token), TRUE) s
                WHERE s.store_id = p_store_id
            ) THEN
                v_authorized := TRUE;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF NOT v_authorized THEN
        BEGIN
            IF public.has_valid_staff_access(p_store_id, TRUE) THEN
                v_authorized := TRUE;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Admin or Super Admin session required to update store settings';
    END IF;

    UPDATE public.stores
    SET
        fulfillment_settings = COALESCE(fulfillment_settings, '{}'::jsonb) || p_fulfillment_settings,
        updated_at = now()
    WHERE id = p_store_id
    RETURNING fulfillment_settings INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', p_store_id,
        'fulfillment_settings', v_updated
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_store_fulfillment_settings(UUID, JSONB, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

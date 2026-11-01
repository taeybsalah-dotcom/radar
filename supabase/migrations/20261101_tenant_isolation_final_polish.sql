-- ==============================================================================
-- 🏛️ AL-ATHAR CORE - FINAL RPC POLISH (Tenant Domain & Lead Normalization)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_active_tenant_by_domain(p_host TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_host TEXT;
    v_tenant RECORD;
BEGIN
    IF p_host IS NULL OR TRIM(p_host) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_host := LOWER(TRIM(p_host));
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
    v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
    v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

    SELECT *
    INTO v_tenant
    FROM public.tenants
    WHERE status = 'active'
      AND (
          LOWER(custom_domain) = v_clean_host
          OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
          OR LOWER(slug) = v_clean_host
      )
    LIMIT 1;

    IF v_tenant.id IS NOT NULL THEN
        RETURN to_jsonb(v_tenant);
    END IF;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_tenant_by_domain(TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_merchant_lead_rpc(
    p_payload JSONB,
    p_host TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_host TEXT;
    v_tenant_id TEXT;
    v_ref_code TEXT;
    v_lead_id UUID;
BEGIN
    IF p_payload IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payload is required');
    END IF;

    v_ref_code := UPPER(TRIM(COALESCE(p_payload->>'referral_code', p_payload->>'referred_by_code', '')));

    IF v_ref_code <> '' THEN
        SELECT tenant_id INTO v_tenant_id FROM public.partner_accounts WHERE UPPER(referral_code) = v_ref_code LIMIT 1;
        IF v_tenant_id IS NULL THEN
            SELECT tenant_id INTO v_tenant_id FROM public.affiliates WHERE UPPER(referral_code) = v_ref_code LIMIT 1;
        END IF;
    END IF;

    IF v_tenant_id IS NULL AND p_host IS NOT NULL AND TRIM(p_host) <> '' THEN
        v_clean_host := LOWER(TRIM(p_host));
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^https?://', '');
        v_clean_host := SPLIT_PART(v_clean_host, ':', 1);
        v_clean_host := REGEXP_REPLACE(v_clean_host, '^www\.', '');

        SELECT id INTO v_tenant_id FROM public.tenants
        WHERE LOWER(custom_domain) = v_clean_host
           OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(custom_domain, '^https?://', ''), '^www\.', '')) = v_clean_host
           OR LOWER(slug) = v_clean_host
        LIMIT 1;
    END IF;

    v_tenant_id := COALESCE(v_tenant_id, 'radar');

    INSERT INTO public.merchant_leads (
        id, store_name, manager_name, phone, normalized_phone, business_type, city,
        status, referral_code, converted_store_id, tenant_id, created_at, updated_at
    ) VALUES (
        gen_random_uuid(),
        COALESCE(p_payload->>'store_name', p_payload->>'merchant_name', 'متجر جديد'),
        COALESCE(p_payload->>'manager_name', 'المدير'),
        COALESCE(p_payload->>'phone', ''),
        COALESCE(NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(p_payload->>'phone', ''), '[^0-9]', '', 'g'), 9), ''), '000000000'),
        COALESCE(p_payload->>'business_type', 'retail'),
        COALESCE(p_payload->>'city', ''),
        'NEW',
        NULLIF(v_ref_code, ''),
        NULLIF(COALESCE(p_payload->>'converted_store_id', p_payload->>'store_id'), '')::uuid,
        v_tenant_id,
        now(),
        now()
    )
    RETURNING id INTO v_lead_id;

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id,
        'tenant_id', v_tenant_id,
        'message', 'Lead submitted successfully'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_merchant_lead_rpc(JSONB, TEXT) TO anon, authenticated, service_role;

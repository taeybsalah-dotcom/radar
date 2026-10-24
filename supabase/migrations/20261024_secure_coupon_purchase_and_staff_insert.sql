-- Secure coupon purchase (server decides balance/stock) + lock store_staff INSERT behind admin token

CREATE OR REPLACE FUNCTION public.purchase_coupon_secure(
    p_store_id UUID, p_customer_id UUID, p_privilege_id UUID, p_coupon_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cust public.store_customers%ROWTYPE;
    v_priv public.privileges%ROWTYPE;
    v_cost NUMERIC;
    v_new_count INT;
    v_coupon_id UUID;
    v_owned INT;
BEGIN
    SELECT * INTO v_cust FROM public.store_customers WHERE id = p_customer_id AND store_id = p_store_id FOR UPDATE;
    IF v_cust.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND'); END IF;

    SELECT * INTO v_priv FROM public.privileges WHERE id = p_privilege_id AND store_id = p_store_id FOR UPDATE;
    IF v_priv.id IS NULL OR v_priv.is_active IS FALSE THEN
        RETURN jsonb_build_object('success', false, 'error', 'REWARD_UNAVAILABLE');
    END IF;

    IF v_priv.quantity_limit IS NOT NULL AND v_priv.quantity_limit > 0
       AND COALESCE(v_priv.redeemed_count, 0) >= v_priv.quantity_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'SOLD_OUT');
    END IF;

    IF v_priv.per_customer_limit IS NOT NULL AND v_priv.per_customer_limit > 0 THEN
        SELECT count(*) INTO v_owned FROM public.customer_coupons
        WHERE customer_id = p_customer_id AND privilege_id = p_privilege_id;
        IF v_owned >= v_priv.per_customer_limit THEN
            RETURN jsonb_build_object('success', false, 'error', 'LIMIT_REACHED');
        END IF;
    END IF;

    v_cost := COALESCE(v_priv.cost_points, 0);
    IF COALESCE(v_cust.wallet_balance, 0) < v_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS');
    END IF;

    UPDATE public.store_customers SET wallet_balance = wallet_balance - v_cost WHERE id = p_customer_id;

    v_new_count := COALESCE(v_priv.redeemed_count, 0) + 1;
    UPDATE public.privileges
    SET redeemed_count = v_new_count,
        is_hidden = CASE WHEN quantity_limit IS NOT NULL AND quantity_limit > 0 AND v_new_count >= quantity_limit
                         THEN TRUE ELSE is_hidden END
    WHERE id = p_privilege_id;

    INSERT INTO public.customer_coupons (store_id, customer_id, customer_phone, customer_name, privilege_id,
        privilege_title, privilege_image_url, coupon_code, cost_points, status, valid_start_time, valid_end_time, purchased_at)
    VALUES (p_store_id, p_customer_id, v_cust.phone, COALESCE(v_cust.name, 'عميل مميز'), p_privilege_id,
        v_priv.title, v_priv.image_url, p_coupon_code, v_cost, 'ACTIVE',
        COALESCE(v_priv.valid_start_time, '00:00'), COALESCE(v_priv.valid_end_time, '23:59'), now())
    RETURNING id INTO v_coupon_id;

    RETURN jsonb_build_object('success', true, 'coupon_id', v_coupon_id,
                              'new_balance', COALESCE(v_cust.wallet_balance, 0) - v_cost);
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_coupon_secure(UUID, UUID, UUID, TEXT) TO anon, authenticated;

-- store_staff INSERT: only an admin ticket (or super admin). Merchant signup uses SECURITY DEFINER RPCs.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='store_staff' AND cmd IN ('INSERT')
               AND roles && ARRAY['anon','authenticated','public']::name[]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.store_staff', r.policyname);
    END LOOP;
    CREATE POLICY store_staff_insert_staff_token ON public.store_staff
        FOR INSERT TO anon, authenticated
        WITH CHECK (public.has_valid_staff_access(store_id, TRUE));
END $$;

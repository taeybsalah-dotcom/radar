-- Migration: 20261111_deduct_stamps_on_completion_coupon.sql
-- Description: Add p_deduct_stamps to issue_customer_coupon_secure to atomically reset/deduct stamps upon reward issuance

DROP FUNCTION IF EXISTS public.issue_customer_coupon_secure(uuid, text, text, text, uuid, text, uuid, integer, text);
DROP FUNCTION IF EXISTS public.issue_customer_coupon_secure(uuid, text, text, text, uuid, text, uuid, integer, text, integer);

CREATE OR REPLACE FUNCTION public.issue_customer_coupon_secure(
    p_store_id uuid,
    p_phone text,
    p_title text,
    p_coupon_code text DEFAULT NULL::text,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_name text DEFAULT NULL::text,
    p_privilege_id uuid DEFAULT NULL::uuid,
    p_cost_points integer DEFAULT 0,
    p_source text DEFAULT 'GAMIFICATION'::text,
    p_deduct_stamps integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_store RECORD;
    v_cust public.store_customers%ROWTYPE;
    v_priv public.privileges%ROWTYPE;
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_code TEXT;
    v_title TEXT;
    v_image_url TEXT := NULL;
    v_valid_start TEXT := '00:00';
    v_valid_end TEXT := '23:59';
    v_existing RECORD;
    v_created RECORD;
    v_priv_uuid UUID := NULL;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    SELECT id, name INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF v_store.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND', 'message', 'المتجر غير موجود');
    END IF;

    v_title := NULLIF(BTRIM(COALESCE(p_title, '')), '');
    IF v_title IS NULL THEN
        v_title := 'مكافأة حصرية 🎁';
    END IF;

    -- If a specific catalog privilege is linked, inherit its title, image, and Time-Lock hours
    IF p_privilege_id IS NOT NULL THEN
        SELECT * INTO v_priv
        FROM public.privileges
        WHERE id = p_privilege_id AND store_id = p_store_id
        LIMIT 1;

        IF v_priv.id IS NOT NULL THEN
            v_priv_uuid := v_priv.id;
            v_title := COALESCE(NULLIF(BTRIM(v_priv.title), ''), v_title);
            v_image_url := v_priv.image_url;
            v_valid_start := COALESCE(v_priv.valid_start_time, '00:00');
            v_valid_end := COALESCE(v_priv.valid_end_time, '23:59');
        END IF;
    END IF;

    -- Normalize phone
    v_clean_phone := BTRIM(COALESCE(p_phone, ''));
    v_clean_phone := translate(v_clean_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    v_norm_phone := COALESCE(
        public.normalize_saudi_phone(v_clean_phone),
        NULLIF(regexp_replace(regexp_replace(regexp_replace(v_clean_phone, '[^0-9]', '', 'g'), '^(00966|966)', ''), '^0+', ''), '')
    );

    -- 1. Resolve customer by ID if provided
    IF p_customer_id IS NOT NULL THEN
        SELECT * INTO v_cust
        FROM public.store_customers
        WHERE id = p_customer_id AND store_id = p_store_id
        FOR UPDATE
        LIMIT 1;
    END IF;

    -- 2. Resolve customer by Phone if not resolved by ID
    IF v_cust.id IS NULL AND v_norm_phone IS NOT NULL AND length(v_norm_phone) >= 8 THEN
        SELECT * INTO v_cust
        FROM public.store_customers
        WHERE store_id = p_store_id
          AND (
              phone = v_norm_phone
              OR phone = v_clean_phone
              OR phone = '0' || v_norm_phone
              OR RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = RIGHT(v_norm_phone, 9)
          )
        FOR UPDATE
        LIMIT 1;
    END IF;

    -- 3. Auto-create customer record if not yet registered in store_customers
    IF v_cust.id IS NULL THEN
        IF v_norm_phone IS NULL OR length(v_norm_phone) < 8 THEN
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم جوال العميل غير صالح لإصدار الكوبون');
        END IF;

        INSERT INTO public.store_customers (
            store_id,
            phone,
            name,
            wallet_balance,
            lifetime_xp,
            visits_count,
            last_visit_date,
            created_at,
            updated_at
        ) VALUES (
            p_store_id,
            '0' || RIGHT(v_norm_phone, 9),
            COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'عميل مميز'),
            0,
            0,
            1,
            v_now,
            v_now,
            v_now
        )
        RETURNING * INTO v_cust;
    END IF;

    -- 4. Atomically deduct stamps if completion reward is claimed
    IF COALESCE(p_deduct_stamps, 0) > 0 AND v_cust.id IS NOT NULL THEN
        UPDATE public.store_customers
        SET wallet_balance = GREATEST(0, wallet_balance - p_deduct_stamps),
            updated_at = v_now
        WHERE id = v_cust.id
        RETURNING * INTO v_cust;
    END IF;

    -- Prepare unique coupon code
    v_code := UPPER(BTRIM(COALESCE(p_coupon_code, '')));
    IF v_code = '' THEN
        v_code := 'GIFT-' || UPPER(SUBSTR(MD5(v_cust.id::text || v_now::text || random()::text), 1, 6));
    END IF;

    -- Idempotency check: if this exact coupon_code already exists in this store, return it
    SELECT * INTO v_existing
    FROM public.customer_coupons
    WHERE store_id = p_store_id
      AND UPPER(BTRIM(coupon_code)) = v_code
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'coupon_id', v_existing.id,
            'coupon_code', v_existing.coupon_code,
            'coupon', jsonb_build_object(
                'id', v_existing.id,
                'coupon_code', v_existing.coupon_code,
                'customer_id', v_existing.customer_id,
                'customer_phone', v_existing.customer_phone,
                'customer_name', v_existing.customer_name,
                'store_id', v_existing.store_id,
                'privilege_id', v_existing.privilege_id,
                'privilege_title', v_existing.privilege_title,
                'privilege_image_url', v_existing.privilege_image_url,
                'cost_points', COALESCE(v_existing.cost_points, 0),
                'status', v_existing.status,
                'valid_start_time', COALESCE(v_existing.valid_start_time, '00:00'),
                'valid_end_time', COALESCE(v_existing.valid_end_time, '23:59'),
                'purchased_at', v_existing.purchased_at
            ),
            'updated_customer', jsonb_build_object(
                'id', v_cust.id,
                'phone', v_cust.phone,
                'name', v_cust.name,
                'wallet_balance', v_cust.wallet_balance,
                'lifetime_xp', v_cust.lifetime_xp,
                'visits_count', COALESCE(v_cust.visits_count, 1)
            )
        );
    END IF;

    INSERT INTO public.customer_coupons (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        privilege_id,
        privilege_title,
        privilege_image_url,
        coupon_code,
        cost_points,
        status,
        valid_start_time,
        valid_end_time,
        purchased_at
    ) VALUES (
        p_store_id,
        v_cust.id,
        v_cust.phone,
        COALESCE(NULLIF(BTRIM(v_cust.name), ''), NULLIF(BTRIM(p_customer_name), ''), 'عميل مميز'),
        v_priv_uuid,
        v_title,
        v_image_url,
        v_code,
        GREATEST(0, COALESCE(p_cost_points, 0)),
        'ACTIVE',
        v_valid_start,
        v_valid_end,
        v_now
    )
    RETURNING * INTO v_created;

    INSERT INTO public.audit_logs (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        points_changed,
        purchase_amount,
        action,
        event_type,
        entry_method,
        metadata,
        created_at
    ) VALUES (
        p_store_id,
        v_cust.id,
        v_cust.phone,
        v_cust.name,
        CASE WHEN COALESCE(p_deduct_stamps, 0) > 0 THEN -p_deduct_stamps ELSE 0 END,
        0,
        'ADJUSTMENT',
        CASE WHEN COALESCE(p_deduct_stamps, 0) > 0 THEN 'STAMPS_REDEEMED' ELSE 'COUPON_ISSUED' END,
        COALESCE(NULLIF(BTRIM(p_source), ''), 'GAMIFICATION'),
        jsonb_build_object(
            'coupon_id', v_created.id,
            'coupon_code', v_created.coupon_code,
            'privilege_title', v_created.privilege_title,
            'privilege_id', v_created.privilege_id,
            'stamps_deducted', COALESCE(p_deduct_stamps, 0),
            'source', COALESCE(p_source, 'GAMIFICATION')
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'coupon_id', v_created.id,
        'coupon_code', v_created.coupon_code,
        'coupon', jsonb_build_object(
            'id', v_created.id,
            'coupon_code', v_created.coupon_code,
            'customer_id', v_created.customer_id,
            'customer_phone', v_created.customer_phone,
            'customer_name', v_created.customer_name,
            'store_id', v_created.store_id,
            'privilege_id', v_created.privilege_id,
            'privilege_title', v_created.privilege_title,
            'privilege_image_url', v_created.privilege_image_url,
            'cost_points', COALESCE(v_created.cost_points, 0),
            'status', v_created.status,
            'valid_start_time', v_created.valid_start_time,
            'valid_end_time', v_created.valid_end_time,
            'purchased_at', v_created.purchased_at
        ),
        'updated_customer', jsonb_build_object(
            'id', v_cust.id,
            'phone', v_cust.phone,
            'name', v_cust.name,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp,
            'visits_count', COALESCE(v_cust.visits_count, 1)
        )
    );
END;
$function$;

-- Overload alias for backward compatibility (9 parameters)
CREATE OR REPLACE FUNCTION public.issue_customer_coupon_secure(
    p_store_id uuid,
    p_phone text,
    p_title text,
    p_coupon_code text,
    p_customer_id uuid,
    p_customer_name text,
    p_privilege_id uuid,
    p_cost_points integer,
    p_source text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT public.issue_customer_coupon_secure(
        p_store_id, p_phone, p_title, p_coupon_code, p_customer_id,
        p_customer_name, p_privilege_id, p_cost_points, p_source, 0
    );
$$;

GRANT EXECUTE ON FUNCTION public.issue_customer_coupon_secure(uuid, text, text, text, uuid, text, uuid, integer, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_customer_coupon_secure(uuid, text, text, text, uuid, text, uuid, integer, text) TO anon, authenticated, service_role;

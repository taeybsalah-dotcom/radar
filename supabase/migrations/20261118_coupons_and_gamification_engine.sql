-- ==============================================================================
-- 🛡️ AL-ATHAR CORE: ATOMIC SINGLE-USE COUPONS & TARGETED GAMIFICATION ENGINE
-- Migration: 20261118_coupons_and_gamification_engine.sql
-- Purpose:
--   1. Fix "الكوبون غير موجود" (COUPON_NOT_FOUND) caused by RLS blocking direct
--      anon SELECTs on public.customer_coupons before redeem_coupon_secure.
--   2. Provide public.validate_coupon_secure & public.issue_customer_coupon_secure
--      (SECURITY DEFINER) so all coupons (Spin Wheel, Scratch & Win, Welcome
--      Gifts, and Privilege Coupons) are persisted in public.customer_coupons
--      and burned strictly ONCE (Single-Use).
--   3. Restore atomic Welcome Offer Coupon creation in
--      public.register_or_get_customer_wallet when welcome_gift_type = 'OFFER'.
--   4. Add targeted game dispatch (Spin Wheel / Scratch Card) for a single
--      customer, a selected group of customers, or all store customers via
--      store_customers.active_game_invites and SECURITY DEFINER RPCs.
-- ==============================================================================

-- 0️⃣ Add active_game_invites JSONB column to public.store_customers if not exists
ALTER TABLE public.store_customers
ADD COLUMN IF NOT EXISTS active_game_invites JSONB DEFAULT '[]'::jsonb;

-- 1️⃣ Validate Coupon Secure (Bypasses RLS safely for Scanner/POS validation)
CREATE OR REPLACE FUNCTION public.validate_coupon_secure(
    p_store_id uuid,
    p_coupon_code text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_clean_code TEXT;
    v_coupon RECORD;
BEGIN
    PERFORM public.assert_platform_active();

    v_clean_code := UPPER(BTRIM(COALESCE(p_coupon_code, '')));
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'INVALID_COUPON',
            'message', 'رمز الكوبون فارغ'
        );
    END IF;

    -- Match by exact coupon_code (case-insensitive) or UUID id, prioritizing current store
    SELECT * INTO v_coupon
    FROM public.customer_coupons
    WHERE (
        UPPER(BTRIM(coupon_code)) = v_clean_code
        OR id::text = lower(v_clean_code)
    )
    ORDER BY (store_id = p_store_id) DESC, purchased_at DESC NULLS LAST
    LIMIT 1;

    IF v_coupon.id IS NULL THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'COUPON_NOT_FOUND',
            'message', 'الكوبون غير صالح أو غير مسجل في النظام ❌'
        );
    END IF;

    IF v_coupon.store_id <> p_store_id THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'WRONG_STORE',
            'coupon_store_id', v_coupon.store_id,
            'customer_phone', v_coupon.customer_phone,
            'message', 'عفواً، هذا الكوبون خاص بمتجر آخر ولا يمكن صرفه هنا ❌'
        );
    END IF;

    IF v_coupon.status IN ('REDEEMED', 'USED') THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'ALREADY_REDEEMED',
            'message', 'هذا الكوبون محروق وتم استخدامه مسبقاً ❌',
            'coupon', jsonb_build_object(
                'id', v_coupon.id,
                'coupon_code', v_coupon.coupon_code,
                'customer_id', v_coupon.customer_id,
                'customer_phone', v_coupon.customer_phone,
                'customer_name', v_coupon.customer_name,
                'store_id', v_coupon.store_id,
                'privilege_id', v_coupon.privilege_id,
                'privilege_title', v_coupon.privilege_title,
                'cost_points', COALESCE(v_coupon.cost_points, 0),
                'status', v_coupon.status,
                'valid_start_time', v_coupon.valid_start_time,
                'valid_end_time', v_coupon.valid_end_time,
                'purchased_at', v_coupon.purchased_at,
                'used_at', v_coupon.redeemed_at
            )
        );
    END IF;

    IF v_coupon.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'INACTIVE_COUPON',
            'message', 'عفواً، حالة الكوبون غير صالحة للصرف (' || COALESCE(v_coupon.status, 'UNKNOWN') || ') ❌'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'coupon', jsonb_build_object(
            'id', v_coupon.id,
            'coupon_code', v_coupon.coupon_code,
            'customer_id', v_coupon.customer_id,
            'customer_phone', v_coupon.customer_phone,
            'customer_name', v_coupon.customer_name,
            'store_id', v_coupon.store_id,
            'privilege_id', v_coupon.privilege_id,
            'privilege_title', v_coupon.privilege_title,
            'cost_points', COALESCE(v_coupon.cost_points, 0),
            'status', v_coupon.status,
            'valid_start_time', v_coupon.valid_start_time,
            'valid_end_time', v_coupon.valid_end_time,
            'purchased_at', v_coupon.purchased_at,
            'used_at', v_coupon.redeemed_at
        )
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.validate_coupon_secure(uuid, text) TO anon, authenticated, service_role;


-- 2️⃣ Issue Customer Coupon Secure (Persists Spin Wheel, Scratch Card, Welcome & Gift Coupons in DB)
CREATE OR REPLACE FUNCTION public.issue_customer_coupon_secure(
    p_store_id uuid,
    p_phone text,
    p_title text,
    p_coupon_code text DEFAULT NULL::text,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_customer_name text DEFAULT NULL::text,
    p_privilege_id uuid DEFAULT NULL::uuid,
    p_cost_points integer DEFAULT 0,
    p_source text DEFAULT 'GAMIFICATION'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_store RECORD;
    v_cust RECORD;
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_code TEXT;
    v_title TEXT;
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

    -- Normalize phone
    v_clean_phone := BTRIM(COALESCE(p_phone, ''));
    v_clean_phone := translate(v_clean_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    v_norm_phone := COALESCE(
        public.normalize_saudi_phone(v_clean_phone),
        NULLIF(regexp_replace(regexp_replace(regexp_replace(v_clean_phone, '[^0-9]', '', 'g'), '^(00966|966)', ''), '^0+', ''), '')
    );

    -- Resolve customer by ID or Phone
    IF p_customer_id IS NOT NULL THEN
        SELECT * INTO v_cust
        FROM public.store_customers
        WHERE id = p_customer_id AND store_id = p_store_id
        LIMIT 1;
    END IF;

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
        LIMIT 1;
    END IF;

    -- Auto-create customer record if not yet registered in store_customers
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
            last_visit_date,
            created_at,
            updated_at
        ) VALUES (
            p_store_id,
            '0' || RIGHT(v_norm_phone, 9),
            COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'عميل مميز'),
            0,
            0,
            v_now,
            v_now,
            v_now
        )
        RETURNING * INTO v_cust;
    END IF;

    -- Prepare unique coupon code
    v_code := UPPER(BTRIM(COALESCE(p_coupon_code, '')));
    IF v_code = '' THEN
        v_code := 'WIN-' || UPPER(SUBSTR(MD5(v_cust.id::text || v_now::text || random()::text), 1, 6));
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
                'cost_points', COALESCE(v_existing.cost_points, 0),
                'status', v_existing.status,
                'valid_start_time', COALESCE(v_existing.valid_start_time, '00:00'),
                'valid_end_time', COALESCE(v_existing.valid_end_time, '23:59'),
                'purchased_at', v_existing.purchased_at
            )
        );
    END IF;

    -- Verify privilege FK if provided
    IF p_privilege_id IS NOT NULL THEN
        SELECT id INTO v_priv_uuid
        FROM public.privileges
        WHERE id = p_privilege_id AND store_id = p_store_id
        LIMIT 1;
    END IF;

    INSERT INTO public.customer_coupons (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        privilege_id,
        privilege_title,
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
        v_code,
        GREATEST(0, COALESCE(p_cost_points, 0)),
        'ACTIVE',
        '00:00',
        '23:59',
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
        0,
        0,
        'ISSUE_COUPON',
        'COUPON_ISSUED',
        COALESCE(NULLIF(BTRIM(p_source), ''), 'GAMIFICATION'),
        jsonb_build_object(
            'coupon_id', v_created.id,
            'coupon_code', v_created.coupon_code,
            'privilege_title', v_created.privilege_title,
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
            'cost_points', COALESCE(v_created.cost_points, 0),
            'status', v_created.status,
            'valid_start_time', COALESCE(v_created.valid_start_time, '00:00'),
            'valid_end_time', COALESCE(v_created.valid_end_time, '23:59'),
            'purchased_at', v_created.purchased_at
        )
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.issue_customer_coupon_secure(uuid, text, text, text, uuid, text, uuid, integer, text) TO anon, authenticated, service_role;


-- 3️⃣ Update register_or_get_customer_wallet to atomically issue WELCOME-XXXXXX coupon when welcome_gift_type = 'OFFER'
CREATE OR REPLACE FUNCTION public.register_or_get_customer_wallet(
    p_store_id UUID,
    p_phone TEXT,
    p_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_cust RECORD;
    v_store RECORD;
    v_welcome_points INT := 0;
    v_gift_type TEXT := 'POINTS';
    v_offer_title TEXT;
    v_welcome_code TEXT;
    v_tier RECORD;
    v_coupons JSONB := '[]'::jsonb;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    IF p_store_id IS NULL OR TRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    v_clean_phone := TRIM(p_phone);
    v_clean_phone := translate(v_clean_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '\D', '', 'g'), 9);

    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم الجوال غير صحيح');
    END IF;

    SELECT id, name, welcome_gift_type, welcome_points, welcome_offer_title
    INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF v_store.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND', 'message', 'المتجر غير موجود');
    END IF;

    v_gift_type := COALESCE(UPPER(BTRIM(v_store.welcome_gift_type)), 'POINTS');

    -- فحص وجود العميل
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9) = v_norm_phone
      )
    FOR UPDATE
    LIMIT 1;

    -- إذا كان مسجلاً مسبقاً، حدّث الاسم إن وجد
    IF v_cust.id IS NOT NULL THEN
        IF p_name IS NOT NULL AND TRIM(p_name) <> '' AND (v_cust.name IS NULL OR v_cust.name IN ('عميل', 'عميل مميز')) THEN
            UPDATE public.store_customers
            SET name = TRIM(p_name), updated_at = v_now
            WHERE id = v_cust.id;
            v_cust.name := TRIM(p_name);
        END IF;
    ELSE
        -- عميل جديد
        IF v_gift_type = 'POINTS' THEN
            v_welcome_points := GREATEST(0, COALESCE(v_store.welcome_points, 50));
        ELSE
            v_welcome_points := 0;
        END IF;

        INSERT INTO public.store_customers (
            store_id, phone, name, wallet_balance, lifetime_xp, last_visit_date, created_at, updated_at
        ) VALUES (
            p_store_id, '0' || v_norm_phone, COALESCE(NULLIF(TRIM(p_name), ''), 'عميل مميز'),
            v_welcome_points, v_welcome_points, v_now, v_now, v_now
        )
        RETURNING * INTO v_cust;

        IF v_welcome_points > 0 THEN
            INSERT INTO public.audit_logs (
                store_id, customer_id, customer_phone, customer_name, points_changed, purchase_amount,
                action, event_type, entry_method, metadata, created_at
            ) VALUES (
                p_store_id, v_cust.id, v_cust.phone, v_cust.name, v_welcome_points, 0,
                'ADJUSTMENT', 'WELCOME_BONUS', 'AUTO_SYSTEM',
                jsonb_build_object('source', 'AUTO_REGISTRATION', 'note', 'نقاط تسجيل وترحيب بالعميل'), v_now
            );
        END IF;

        -- إذا كانت هدية الترحيب كوبون عرض (OFFER)، نصدر الكوبون رسمياً في جدول customer_coupons لمرة واحدة
        IF v_gift_type = 'OFFER' THEN
            v_offer_title := COALESCE(NULLIF(BTRIM(v_store.welcome_offer_title), ''), 'هدية ترحيبية مجانية 🎁');
            v_welcome_code := 'WELCOME-' || UPPER(SUBSTR(MD5(v_cust.id::text || v_now::text || random()::text), 1, 6));

            INSERT INTO public.customer_coupons (
                store_id, customer_id, customer_phone, customer_name,
                privilege_id, privilege_title, coupon_code, cost_points,
                status, valid_start_time, valid_end_time, purchased_at
            ) VALUES (
                p_store_id, v_cust.id, v_cust.phone, COALESCE(v_cust.name, 'عميل مميز'),
                NULL, v_offer_title, v_welcome_code, 0,
                'ACTIVE', '00:00', '23:59', v_now
            );
        END IF;
    END IF;

    -- جلب الرتبة
    SELECT id, tier_name, required_xp, badge_color INTO v_tier
    FROM public.tiers
    WHERE store_id = p_store_id AND required_xp <= v_cust.lifetime_xp
    ORDER BY required_xp DESC LIMIT 1;

    -- جلب الكوبونات النشطة
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id, 'coupon_code', c.coupon_code, 'privilege_id', c.privilege_id,
        'privilege_title', c.privilege_title, 'privilege_image_url', c.privilege_image_url,
        'cost_points', c.cost_points, 'status', c.status,
        'valid_start_time', c.valid_start_time, 'valid_end_time', c.valid_end_time,
        'purchased_at', c.purchased_at
    )), '[]'::jsonb)
    INTO v_coupons
    FROM public.customer_coupons c
    WHERE c.store_id = p_store_id AND c.customer_id = v_cust.id AND c.status = 'ACTIVE';

    RETURN jsonb_build_object(
        'success', true,
        'customer', row_to_json(v_cust),
        'tier', CASE WHEN v_tier.id IS NOT NULL THEN row_to_json(v_tier) ELSE NULL END,
        'coupons', v_coupons
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_or_get_customer_wallet(UUID, TEXT, TEXT) TO anon, authenticated, service_role;


-- 4️⃣ Targeted Game Dispatch RPCs (Merchant -> Single Customer, Selected Group, or All Customers)
CREATE OR REPLACE FUNCTION public.dispatch_game_to_customers_secure(
    p_store_id uuid,
    p_game_type text,
    p_customer_ids uuid[] DEFAULT NULL::uuid[],
    p_phones text[] DEFAULT NULL::text[],
    p_campaign_title text DEFAULT NULL::text,
    p_reward_label text DEFAULT NULL::text,
    p_send_to_all boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_invite JSONB;
    v_invite_id TEXT;
    v_Affected INT := 0;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    IF p_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STORE', 'message', 'معرّف المتجر غير صالح');
    END IF;

    IF p_game_type NOT IN ('spin_wheel', 'scratch_card') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_GAME_TYPE', 'message', 'نوع اللعبة غير صالح');
    END IF;

    v_invite_id := 'GINV-' || UPPER(SUBSTR(MD5(p_store_id::text || v_now::text || random()::text), 1, 8));

    v_invite := jsonb_build_object(
        'id', v_invite_id,
        'game_type', p_game_type,
        'campaign_title', COALESCE(NULLIF(BTRIM(p_campaign_title), ''), CASE WHEN p_game_type = 'spin_wheel' THEN 'هدية خاصة من المتجر: جرب حظك الآن! 🎡' ELSE 'بطاقة اكشط واربح خاصة لك! 🪙' END),
        'reward_label', NULLIF(BTRIM(COALESCE(p_reward_label, '')), ''),
        'granted_at', v_now,
        'status', 'PENDING'
    );

    IF p_send_to_all THEN
        UPDATE public.store_customers
        SET active_game_invites = COALESCE(active_game_invites, '[]'::jsonb) || jsonb_build_array(v_invite),
            updated_at = v_now
        WHERE store_id = p_store_id;
        GET DIAGNOSTICS v_Affected = ROW_COUNT;
    ELSE
        UPDATE public.store_customers
        SET active_game_invites = COALESCE(active_game_invites, '[]'::jsonb) || jsonb_build_array(v_invite),
            updated_at = v_now
        WHERE store_id = p_store_id
          AND (
              (p_customer_ids IS NOT NULL AND id = ANY(p_customer_ids))
              OR (p_phones IS NOT NULL AND phone = ANY(p_phones))
          );
        GET DIAGNOSTICS v_Affected = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invite_id', v_invite_id,
        'invite', v_invite,
        'affected_count', v_Affected
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dispatch_game_to_customers_secure(uuid, text, uuid[], text[], text, text, boolean) TO anon, authenticated, service_role;


-- 5️⃣ Consume Customer Game Invite Secure (Marks a merchant-sent game invite as used once played)
CREATE OR REPLACE FUNCTION public.consume_customer_game_invite_secure(
    p_store_id uuid,
    p_phone text,
    p_invite_id text DEFAULT NULL::text,
    p_game_type text DEFAULT NULL::text
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
    v_invites JSONB;
    v_updated_invites JSONB := '[]'::jsonb;
    v_elem JSONB;
    v_consumed BOOLEAN := false;
BEGIN
    PERFORM public.assert_platform_active();

    v_clean_phone := BTRIM(COALESCE(p_phone, ''));
    v_clean_phone := translate(v_clean_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '\D', '', 'g'), 9);

    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9) = v_norm_phone
      )
    FOR UPDATE
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND');
    END IF;

    v_invites := COALESCE(v_cust.active_game_invites, '[]'::jsonb);

    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_invites)
    LOOP
        IF NOT v_consumed AND COALESCE(v_elem->>'status', 'PENDING') = 'PENDING'
           AND (
               (p_invite_id IS NOT NULL AND v_elem->>'id' = p_invite_id)
               OR (p_invite_id IS NULL AND p_game_type IS NOT NULL AND v_elem->>'game_type' = p_game_type)
               OR (p_invite_id IS NULL AND p_game_type IS NULL)
           )
        THEN
            v_consumed := true;
            -- Skip adding consumed invite back to active_game_invites so the array stays clean
        ELSE
            v_updated_invites := v_updated_invites || jsonb_build_array(v_elem);
        END IF;
    END LOOP;

    UPDATE public.store_customers
    SET active_game_invites = v_updated_invites,
        updated_at = clock_timestamp()
    WHERE id = v_cust.id;

    RETURN jsonb_build_object(
        'success', true,
        'consumed', v_consumed,
        'active_game_invites', v_updated_invites
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.consume_customer_game_invite_secure(uuid, text, text, text) TO anon, authenticated, service_role;

-- 6️⃣ Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';

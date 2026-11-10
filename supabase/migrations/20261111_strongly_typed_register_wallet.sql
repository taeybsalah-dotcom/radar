-- Migration: 20261111_strongly_typed_register_wallet.sql
-- Description: Strongly-type v_cust in register_or_get_customer_wallet to public.store_customers%ROWTYPE

CREATE OR REPLACE FUNCTION public.register_or_get_customer_wallet(
    p_store_id uuid, 
    p_phone text, 
    p_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_clean_phone TEXT;
    v_norm_phone TEXT;
    v_cust public.store_customers%ROWTYPE;
    v_store RECORD;
    v_welcome_points INT := 0;
    v_welcome_stamps INT := 0;
    v_gift_type TEXT := 'POINTS';
    v_offer_title TEXT;
    v_welcome_code TEXT;
    v_tier RECORD;
    v_coupons JSONB := '[]'::jsonb;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_wallet_cfg JSONB;
    v_loyalty_mode TEXT := 'points';
    v_stamps_target INT := 6;
BEGIN
    PERFORM public.assert_platform_active();

    IF p_store_id IS NULL OR TRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    v_clean_phone := TRIM(p_phone);
    v_clean_phone := translate(v_clean_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    v_norm_phone := RIGHT(REGEXP_REPLACE(v_clean_phone, '[^0-9]', '', 'g'), 9);

    IF length(v_norm_phone) < 9 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم الجوال غير صحيح');
    END IF;

    SELECT id, name, welcome_gift_type, welcome_points, welcome_offer_title, fulfillment_settings
    INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF v_store.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND', 'message', 'المتجر غير موجود');
    END IF;

    v_wallet_cfg := COALESCE(v_store.fulfillment_settings->'wallet_pass_config', '{}'::jsonb);
    v_loyalty_mode := LOWER(COALESCE(v_wallet_cfg->>'loyalty_mode', 'points'));
    v_stamps_target := GREATEST(2, COALESCE((v_wallet_cfg->>'stamps_target')::int, 6));

    v_gift_type := COALESCE(UPPER(BTRIM(v_store.welcome_gift_type)), 'POINTS');

    -- فحص وجود العميل
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND (
          phone = v_clean_phone
          OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 9) = v_norm_phone
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
        -- عميل جديد: احتساب الهدية الترحيبية بحسب النمط المعتمد للمتجر
        IF v_gift_type = 'STAMPS' OR (v_loyalty_mode = 'stamps' AND v_gift_type = 'POINTS') THEN
            v_welcome_stamps := GREATEST(1, COALESCE(v_store.welcome_points, 1));
            v_welcome_points := v_welcome_stamps;
        ELSIF v_gift_type = 'POINTS' THEN
            v_welcome_points := GREATEST(0, COALESCE(v_store.welcome_points, 50));
        ELSE
            v_welcome_points := 0;
        END IF;

        INSERT INTO public.store_customers (
            store_id, phone, name, wallet_balance, lifetime_xp, visits_count, last_visit_date, created_at, updated_at
        ) VALUES (
            p_store_id, '0' || v_norm_phone, COALESCE(NULLIF(TRIM(p_name), ''), 'عميل مميز'),
            v_welcome_points, v_welcome_points, 1, v_now, v_now, v_now
        )
        RETURNING * INTO v_cust;

        IF v_welcome_points > 0 THEN
            INSERT INTO public.audit_logs (
                store_id, customer_id, customer_phone, customer_name, points_changed, purchase_amount,
                action, event_type, entry_method, metadata, created_at
            ) VALUES (
                p_store_id, v_cust.id, v_cust.phone, v_cust.name, v_welcome_points, 0,
                'ADJUSTMENT', 
                CASE WHEN v_gift_type = 'STAMPS' OR v_loyalty_mode = 'stamps' THEN 'WELCOME_STAMPS' ELSE 'WELCOME_BONUS' END,
                'AUTO_SYSTEM',
                jsonb_build_object(
                    'source', 'AUTO_REGISTRATION', 
                    'loyalty_mode', v_loyalty_mode,
                    'note', CASE WHEN v_gift_type = 'STAMPS' OR v_loyalty_mode = 'stamps' 
                                 THEN 'ختم ترحيبي مجاني مضاف للبطاقة 💮' 
                                 ELSE 'نقاط تسجيل وترحيب بالعميل ⭐' END
                ), 
                v_now
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
    WHERE c.store_id = p_store_id
      AND c.customer_id = v_cust.id
      AND c.status = 'ACTIVE';

    RETURN jsonb_build_object(
        'success', true,
        'customer', jsonb_build_object(
            'id', v_cust.id,
            'store_id', v_cust.store_id,
            'phone', v_cust.phone,
            'name', v_cust.name,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp,
            'visits_count', COALESCE(v_cust.visits_count, 1),
            'last_visit_date', v_cust.last_visit_date,
            'active_game_invites', COALESCE(v_cust.active_game_invites, '[]'::jsonb),
            'tier_name', COALESCE(v_tier.tier_name, 'ضيف'),
            'badge_color', COALESCE(v_tier.badge_color, '#64748B'),
            'created_at', v_cust.created_at
        ),
        'coupons', v_coupons
    );
END;
$function$;

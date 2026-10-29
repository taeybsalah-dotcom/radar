-- ==============================================================================
-- 🛡️ RADAR & SADEEM AL-ATHIR — STAGE 3 MIGRATION
-- Customers, Points, Coupons, Smart Scan & Saudi Phone Normalization (normalize_saudi_phone)
-- Target: Sadim Al-Athir (kspfiijorengpckdlymx) & White-Label Resellers
-- ==============================================================================

-- ==============================================================================
-- SECTION 1: PHONE NORMALIZATION FUNCTIONS & DATA SANITIZATION / DEDUPLICATION
-- ==============================================================================

-- 1.1 Canonical Saudi Phone Normalizer (Always returns 9 digits '5XXXXXXXX' or NULL)
CREATE OR REPLACE FUNCTION public.normalize_saudi_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_clean TEXT;
BEGIN
    IF p_phone IS NULL OR BTRIM(p_phone) = '' THEN
        RETURN NULL;
    END IF;

    -- Convert Arabic-Indic and Eastern Arabic-Indic digits to ASCII digits first, then strip non-numeric characters
    v_clean := translate(p_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    v_clean := regexp_replace(v_clean, '[^0-9]', '', 'g');

    -- Strip GCC / Saudi international prefixes (00966 or 966)
    IF v_clean LIKE '00966%' THEN
        v_clean := substr(v_clean, 6);
    ELSIF v_clean LIKE '966%' AND length(v_clean) >= 12 THEN
        v_clean := substr(v_clean, 4);
    END IF;

    -- Strip leading national trunk zero (05XXXXXXXX -> 5XXXXXXXX)
    IF length(v_clean) = 10 AND v_clean LIKE '05%' THEN
        v_clean := substr(v_clean, 2);
    END IF;

    -- Validate canonical 9-digit Saudi mobile format (5XXXXXXXX)
    IF length(v_clean) = 9 AND v_clean LIKE '5%' THEN
        RETURN v_clean;
    END IF;

    RETURN NULL;
END;
$function$;

-- 1.2 Keep normalize_phone aligned with normalize_saudi_phone for Saudi numbers
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_saudi TEXT;
    v_cleaned TEXT;
BEGIN
    IF p_phone IS NULL OR BTRIM(p_phone) = '' THEN
        RETURN '';
    END IF;

    v_saudi := public.normalize_saudi_phone(p_phone);
    IF v_saudi IS NOT NULL THEN
        RETURN v_saudi;
    END IF;

    v_cleaned := regexp_replace(p_phone, '[^0-9]', '', 'g');
    IF v_cleaned LIKE '00966%' THEN
        v_cleaned := substring(v_cleaned from 6);
    ELSIF v_cleaned LIKE '966%' AND length(v_cleaned) >= 12 THEN
        v_cleaned := substring(v_cleaned from 4);
    END IF;

    IF v_cleaned LIKE '0%' THEN
        v_cleaned := substring(v_cleaned from 2);
    END IF;

    RETURN v_cleaned;
END;
$function$;

-- 1.3 Ensure customer_coupons has redeemed_by_staff_name & cashier_name, and relax legacy 'code'/'title' NOT NULL constraints if present
ALTER TABLE public.customer_coupons
  ADD COLUMN IF NOT EXISTS redeemed_by_staff_name text,
  ADD COLUMN IF NOT EXISTS cashier_name text,
  ADD COLUMN IF NOT EXISTS used_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_coupons' AND column_name = 'code'
  ) THEN
    EXECUTE 'ALTER TABLE public.customer_coupons ALTER COLUMN code DROP NOT NULL';
    EXECUTE 'UPDATE public.customer_coupons SET code = coupon_code WHERE code IS NULL AND coupon_code IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_coupons' AND column_name = 'title'
  ) THEN
    EXECUTE 'ALTER TABLE public.customer_coupons ALTER COLUMN title DROP NOT NULL';
    EXECUTE 'UPDATE public.customer_coupons SET title = privilege_title WHERE title IS NULL AND privilege_title IS NOT NULL';
  END IF;
END $$;

-- 1.4 Data Sanitization & Deduplication of store_customers before adding CHECK constraint
-- If a store has multiple customer rows that resolve to the same normalized phone
-- (e.g. '0551122334' and '551122334'), merge balances/XP and re-link FKs to the primary row.
DO $$
DECLARE
    v_grp RECORD;
    v_dup RECORD;
BEGIN
    -- Drop constraint temporarily if it already exists so sanitization can update freely
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_store_customers_normalized_saudi_phone'
          AND conrelid = 'public.store_customers'::regclass
    ) THEN
        ALTER TABLE public.store_customers
          DROP CONSTRAINT chk_store_customers_normalized_saudi_phone;
    END IF;

    -- Step A: Merge duplicate customer rows per (store_id, normalized_phone)
    FOR v_grp IN
        SELECT
            store_id,
            COALESCE(public.normalize_saudi_phone(phone), '5' || LPAD(RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 8), 8, '0')) AS norm_phone,
            (ARRAY_AGG(id ORDER BY created_at ASC, id ASC))[1] AS keep_id,
            SUM(COALESCE(wallet_balance, 0)) AS total_wallet,
            SUM(COALESCE(lifetime_xp, 0)) AS total_xp,
            MAX(last_visit_date) AS latest_visit,
            COUNT(*) AS cnt
        FROM public.store_customers
        GROUP BY store_id, COALESCE(public.normalize_saudi_phone(phone), '5' || LPAD(RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 8), 8, '0'))
        HAVING COUNT(*) > 1
    LOOP
        FOR v_dup IN
            SELECT id FROM public.store_customers
            WHERE store_id = v_grp.store_id
              AND COALESCE(public.normalize_saudi_phone(phone), '5' || LPAD(RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 8), 8, '0')) = v_grp.norm_phone
              AND id <> v_grp.keep_id
        LOOP
            -- Re-point all referencing foreign keys to the primary customer row (keep_id)
            UPDATE public.audit_logs SET customer_id = v_grp.keep_id WHERE customer_id = v_dup.id;
            UPDATE public.customer_coupons SET customer_id = v_grp.keep_id WHERE customer_id = v_dup.id;
            UPDATE public.pos_refunds SET customer_id = v_grp.keep_id WHERE customer_id = v_dup.id;
            UPDATE public.service_bookings SET customer_id = v_grp.keep_id WHERE customer_id = v_dup.id;
            UPDATE public.store_orders SET customer_id = v_grp.keep_id WHERE customer_id = v_dup.id;

            -- Delete duplicate customer row
            DELETE FROM public.store_customers WHERE id = v_dup.id;
        END LOOP;

        -- Update primary customer row with merged balances
        UPDATE public.store_customers
        SET wallet_balance = v_grp.total_wallet,
            lifetime_xp = v_grp.total_xp,
            last_visit_date = COALESCE(v_grp.latest_visit, last_visit_date),
            updated_at = now()
        WHERE id = v_grp.keep_id;
    END LOOP;

    -- Step B: Normalize all remaining phone numbers in store_customers to '5XXXXXXXX'
    UPDATE public.store_customers
    SET phone = COALESCE(
        public.normalize_saudi_phone(phone),
        '5' || LPAD(RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 8), 8, '0')
    )
    WHERE phone IS DISTINCT FROM COALESCE(
        public.normalize_saudi_phone(phone),
        '5' || LPAD(RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 8), 8, '0')
    );

    -- Step C: Normalize customer_phone in customer_coupons and audit_logs for consistency
    UPDATE public.customer_coupons
    SET customer_phone = public.normalize_saudi_phone(customer_phone)
    WHERE customer_phone IS NOT NULL
      AND public.normalize_saudi_phone(customer_phone) IS NOT NULL
      AND customer_phone <> public.normalize_saudi_phone(customer_phone);

    UPDATE public.audit_logs
    SET customer_phone = public.normalize_saudi_phone(customer_phone)
    WHERE customer_phone IS NOT NULL
      AND public.normalize_saudi_phone(customer_phone) IS NOT NULL
      AND customer_phone <> public.normalize_saudi_phone(customer_phone);
END $$;

-- 1.5 Add strict DB-level CHECK constraint on store_customers.phone
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_store_customers_normalized_saudi_phone'
          AND conrelid = 'public.store_customers'::regclass
    ) THEN
        ALTER TABLE public.store_customers
          ADD CONSTRAINT chk_store_customers_normalized_saudi_phone
          CHECK (phone = public.normalize_saudi_phone(phone));
    END IF;
END $$;


-- ==============================================================================
-- SECTION 2: EXPLICIT DROP OF OLD FUNCTION SIGNATURES (PREVENT OVERLOADING)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.register_or_get_customer_wallet(uuid, text, text);
DROP FUNCTION IF EXISTS public.register_customer_secure(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_customer_wallet_public(uuid, text);
DROP FUNCTION IF EXISTS public.update_customer_profile_public(uuid, text, text, text, text);

DROP FUNCTION IF EXISTS public.add_customer_points_secure(uuid, text, integer, text, text, numeric, text);
DROP FUNCTION IF EXISTS public.add_customer_points_secure(uuid, text, integer, text, text, numeric, text, text, uuid, text, text);

DROP FUNCTION IF EXISTS public.redeem_customer_points_secure(uuid, text, integer, text, text, text, text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.adjust_customer_points_secure(uuid, uuid, integer, text, text, text, text);

DROP FUNCTION IF EXISTS public.purchase_coupon_secure(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.redeem_coupon_secure(uuid, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.redeem_coupon_secure(uuid, text, text, text, text, uuid, text, text, text);


-- ==============================================================================
-- SECTION 3: ATOMIC CUSTOMER, POINTS & COUPON RPCs (NO EXCEPTION SWALLOWING)
-- ==============================================================================

-- 3.1 Register or Get Customer Wallet (Normalized Phone, Atomic Welcome Gift & Audit Log)
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
    v_norm_phone TEXT;
    v_cust RECORD;
    v_store RECORD;
    v_tier RECORD;
    v_welcome_points INT := 0;
    v_gift_type TEXT := 'POINTS';
    v_offer_title TEXT;
    v_coupon_code TEXT;
    v_coupon_id UUID;
    v_active_coupons JSONB := '[]'::jsonb;
    v_is_new BOOLEAN := false;
    v_clean_name TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    IF p_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STORE', 'message', 'معرّف المتجر غير صالح');
    END IF;

    v_norm_phone := public.normalize_saudi_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم الجوال السعودي غير صالح (يجب أن يبدأ بـ 05 أو 5 ويتكون من 9 أرقام بعد الصفر)');
    END IF;

    v_clean_name := NULLIF(BTRIM(COALESCE(p_name, '')), '');

    -- Verify store exists and fetch welcome gift configuration
    SELECT id, name, welcome_gift_type, welcome_points, welcome_offer_title
    INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF v_store.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND', 'message', 'المتجر غير موجود');
    END IF;

    -- Look up customer by normalized phone (serialized via unique index on store_id, phone)
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND phone = v_norm_phone
    FOR UPDATE
    LIMIT 1;

    IF v_cust.id IS NOT NULL THEN
        v_is_new := false;
        -- Update placeholder name if caller provided a real name
        IF v_clean_name IS NOT NULL
           AND v_clean_name NOT IN ('عميل', 'عميل مميز', 'عميل المتجر')
           AND (v_cust.name IS NULL OR v_cust.name IN ('', 'عميل', 'عميل مميز', 'عميل المتجر')) THEN
            UPDATE public.store_customers
            SET name = v_clean_name,
                updated_at = v_now
            WHERE id = v_cust.id
            RETURNING * INTO v_cust;
        END IF;
    ELSE
        v_is_new := true;
        v_gift_type := COALESCE(UPPER(BTRIM(v_store.welcome_gift_type)), 'POINTS');
        IF v_gift_type = 'POINTS' THEN
            v_welcome_points := GREATEST(0, COALESCE(v_store.welcome_points, 50));
        ELSE
            v_welcome_points := 0;
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
            v_norm_phone,
            COALESCE(v_clean_name, 'عميل مميز'),
            v_welcome_points,
            v_welcome_points,
            v_now,
            v_now,
            v_now
        )
        RETURNING * INTO v_cust;

        -- Atomic Audit Log for Welcome Points (NO EXCEPTION WHEN OTHERS swallow)
        IF v_welcome_points > 0 THEN
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
                v_welcome_points,
                0,
                'ADJUSTMENT',
                'WELCOME_BONUS',
                'AUTO_SYSTEM',
                jsonb_build_object('note', 'نقاط تسجيل وترحيب بالعميل'),
                v_now
            );
        END IF;

        -- Atomic Welcome Offer Coupon creation when store welcome_gift_type = 'OFFER'
        IF v_gift_type = 'OFFER' THEN
            v_offer_title := COALESCE(NULLIF(BTRIM(v_store.welcome_offer_title), ''), 'هدية ترحيبية مجانية');
            v_coupon_code := 'WELCOME-' || upper(substr(md5(v_cust.id::text || v_now::text || random()::text), 1, 6));

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
                v_cust.name,
                NULL,
                v_offer_title,
                NULL,
                v_coupon_code,
                0,
                'ACTIVE',
                '00:00',
                '23:59',
                v_now
            )
            RETURNING id INTO v_coupon_id;
        END IF;
    END IF;

    -- Compute current loyalty tier
    SELECT id, tier_name, required_xp, badge_color
    INTO v_tier
    FROM public.tiers
    WHERE store_id = p_store_id
      AND required_xp <= COALESCE(v_cust.lifetime_xp, 0)
    ORDER BY required_xp DESC
    LIMIT 1;

    -- Fetch active coupons for this customer
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'coupon_code', c.coupon_code,
        'privilege_id', c.privilege_id,
        'privilege_title', c.privilege_title,
        'privilege_image_url', c.privilege_image_url,
        'cost_points', c.cost_points,
        'status', c.status,
        'valid_start_time', c.valid_start_time,
        'valid_end_time', c.valid_end_time,
        'purchased_at', c.purchased_at
    ) ORDER BY c.purchased_at DESC), '[]'::jsonb)
    INTO v_active_coupons
    FROM public.customer_coupons c
    WHERE c.store_id = p_store_id
      AND c.customer_id = v_cust.id
      AND c.status = 'ACTIVE';

    -- Return only necessary fields (name, balance, tier, normalized phone, active coupons)
    RETURN jsonb_build_object(
        'success', true,
        'is_new', v_is_new,
        'customer', jsonb_build_object(
            'id', v_cust.id,
            'store_id', v_cust.store_id,
            'name', v_cust.name,
            'phone', v_cust.phone,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp,
            'current_tier', COALESCE(v_tier.tier_name, 'ضيف (Guest)'),
            'special_date', v_cust.special_date,
            'special_date_type', v_cust.special_date_type,
            'last_visit_date', v_cust.last_visit_date,
            'created_at', v_cust.created_at
        ),
        'tier', CASE WHEN v_tier.id IS NOT NULL THEN jsonb_build_object(
            'id', v_tier.id,
            'tier_name', v_tier.tier_name,
            'required_xp', v_tier.required_xp,
            'badge_color', v_tier.badge_color
        ) ELSE NULL END,
        'coupons', v_active_coupons
    );
END;
$function$;


-- 3.2 Alias register_customer_secure to register_or_get_customer_wallet so both behave identically
CREATE OR REPLACE FUNCTION public.register_customer_secure(
    p_store_id uuid,
    p_phone text,
    p_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN public.register_or_get_customer_wallet(p_store_id, p_phone, p_name);
END;
$function$;


-- 3.3 Get Customer Wallet Public (Normalized Phone Lookup & Minimal Safe Fields)
CREATE OR REPLACE FUNCTION public.get_customer_wallet_public(
    p_store_id uuid,
    p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_norm_phone TEXT;
    v_cust RECORD;
    v_tier RECORD;
    v_coupons JSONB := '[]'::jsonb;
BEGIN
    PERFORM public.assert_platform_active();

    IF p_store_id IS NULL OR BTRIM(COALESCE(p_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    v_norm_phone := public.normalize_saudi_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE');
    END IF;

    SELECT id, store_id, phone, name, wallet_balance, lifetime_xp, special_date, special_date_type, last_visit_date, created_at
    INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND phone = v_norm_phone
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND');
    END IF;

    SELECT id, tier_name, required_xp, badge_color
    INTO v_tier
    FROM public.tiers
    WHERE store_id = p_store_id
      AND required_xp <= COALESCE(v_cust.lifetime_xp, 0)
    ORDER BY required_xp DESC
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'coupon_code', c.coupon_code,
        'privilege_id', c.privilege_id,
        'privilege_title', c.privilege_title,
        'privilege_image_url', c.privilege_image_url,
        'cost_points', c.cost_points,
        'status', c.status,
        'valid_start_time', c.valid_start_time,
        'valid_end_time', c.valid_end_time,
        'purchased_at', c.purchased_at
    ) ORDER BY c.purchased_at DESC), '[]'::jsonb)
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
            'name', v_cust.name,
            'phone', v_cust.phone,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp,
            'current_tier', COALESCE(v_tier.tier_name, 'ضيف (Guest)'),
            'special_date', v_cust.special_date,
            'special_date_type', v_cust.special_date_type,
            'last_visit_date', v_cust.last_visit_date,
            'created_at', v_cust.created_at
        ),
        'tier', CASE WHEN v_tier.id IS NOT NULL THEN jsonb_build_object(
            'id', v_tier.id,
            'tier_name', v_tier.tier_name,
            'required_xp', v_tier.required_xp,
            'badge_color', v_tier.badge_color
        ) ELSE NULL END,
        'coupons', v_coupons
    );
END;
$function$;


-- 3.4 Update Customer Profile Public (Safe Name & Special Date Update Without Touching Points)
CREATE OR REPLACE FUNCTION public.update_customer_profile_public(
    p_store_id uuid,
    p_phone text,
    p_name text DEFAULT NULL::text,
    p_special_date text DEFAULT NULL::text,
    p_special_date_type text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_norm_phone TEXT;
    v_cust RECORD;
BEGIN
    PERFORM public.assert_platform_active();

    v_norm_phone := public.normalize_saudi_phone(p_phone);
    IF p_store_id IS NULL OR v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    UPDATE public.store_customers
    SET name = COALESCE(NULLIF(BTRIM(p_name), ''), name),
        special_date = COALESCE(NULLIF(BTRIM(p_special_date), ''), special_date),
        special_date_type = COALESCE(NULLIF(BTRIM(p_special_date_type), ''), special_date_type),
        updated_at = clock_timestamp()
    WHERE store_id = p_store_id
      AND phone = v_norm_phone
    RETURNING id, store_id, phone, name, wallet_balance, lifetime_xp, special_date, special_date_type, last_visit_date, created_at
    INTO v_cust;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'customer', row_to_json(v_cust)
    );
END;
$function$;


-- 3.5 Add Customer Points Secure (Atomic Purchase Points Calculation, Normalized Phone, Staff Guard & Audit Log)
CREATE OR REPLACE FUNCTION public.add_customer_points_secure(
    p_store_id uuid,
    p_phone text,
    p_points integer DEFAULT NULL::integer,
    p_staff_token text DEFAULT NULL::text,
    p_customer_name text DEFAULT NULL::text,
    p_purchase_amount numeric DEFAULT NULL::numeric,
    p_invoice_number text DEFAULT NULL::text,
    p_entry_method text DEFAULT 'qr_scan'::text,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_branch_name text DEFAULT NULL::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_norm_phone TEXT;
    v_store RECORD;
    v_cust RECORD;
    v_staff_store_id UUID := NULL;
    v_staff_id_str TEXT := NULL;
    v_has_access BOOLEAN := FALSE;
    v_staff_uuid UUID := NULL;
    v_staff_role TEXT := 'cashier';
    v_multiplier NUMERIC := 1.0;
    v_points_to_add INT := 0;
    v_new_balance INT;
    v_new_lifetime INT;
    v_current_tier TEXT := 'ضيف (Guest)';
    v_global_name TEXT := NULL;
    v_effective_name TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- 1. Platform Kill-Switch Check
    PERFORM public.assert_platform_active();

    -- 2. Strict Staff / Admin / Sovereign Authority Check
    IF public.is_super_admin()
       OR auth.role() = 'service_role'
       OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
       OR public.has_store_access(p_store_id) THEN
        v_has_access := TRUE;
        v_staff_role := 'admin';
    ELSIF p_staff_token IS NOT NULL AND BTRIM(p_staff_token) <> '' THEN
        SELECT s.store_id, s.staff_id, COALESCE(s.role, 'cashier')
        INTO v_staff_store_id, v_staff_id_str, v_staff_role
        FROM public.staff_sessions s
        WHERE s.token_hash = encode(sha256(convert_to(BTRIM(p_staff_token), 'UTF8')), 'hex')
          AND s.expires_at > v_now
        LIMIT 1;

        IF v_staff_store_id = p_store_id THEN
            v_has_access := TRUE;

            UPDATE public.staff_sessions
            SET expires_at = v_now + interval '24 hours'
            WHERE token_hash = encode(sha256(convert_to(BTRIM(p_staff_token), 'UTF8')), 'hex');
        END IF;
    ELSIF public.has_valid_staff_access(p_store_id, FALSE) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED_STAFF',
            'message', 'غير مصرح: جلسة الكاشير غير صالحة أو منتهية'
        );
    END IF;

    -- 3. Validate Store & Normalize Phone
    SELECT id, name, points_per_riyal, subscription_active
    INTO v_store
    FROM public.stores
    WHERE id = p_store_id;

    IF v_store.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND', 'message', 'المتجر غير موجود');
    END IF;

    v_norm_phone := public.normalize_saudi_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم الجوال السعودي غير صالح');
    END IF;

    -- 4. Compute Points Server-Side (from purchase_amount * points_per_riyal when purchase_amount > 0)
    v_multiplier := CASE WHEN COALESCE(v_store.points_per_riyal, 0) > 0 THEN v_store.points_per_riyal ELSE 1.0 END;
    IF COALESCE(p_purchase_amount, 0) > 0 THEN
        v_points_to_add := FLOOR(p_purchase_amount * v_multiplier)::INT;
    ELSE
        v_points_to_add := COALESCE(p_points, 0);
    END IF;

    IF v_points_to_add <= 0 OR v_points_to_add > 100000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_POINTS_AMOUNT', 'message', 'عدد النقاط غير صالح');
    END IF;

    -- 5. Resolve Customer Name (check existing global name across stores if not provided)
    v_effective_name := NULLIF(BTRIM(COALESCE(p_customer_name, '')), '');
    IF v_effective_name IS NULL OR v_effective_name IN ('عميل', 'عميل مميز', 'عميل المتجر') THEN
        SELECT name INTO v_global_name
        FROM public.store_customers
        WHERE phone = v_norm_phone
          AND name IS NOT NULL
          AND name NOT IN ('', 'عميل', 'عميل مميز', 'عميل المتجر')
        ORDER BY last_visit_date DESC NULLS LAST
        LIMIT 1;
        v_effective_name := COALESCE(v_global_name, v_effective_name, 'عميل مميز');
    END IF;

    -- 6. Lock or Create Customer Row Atomically using Normalized Phone
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND phone = v_norm_phone
    FOR UPDATE
    LIMIT 1;

    IF v_cust.id IS NULL THEN
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
            v_norm_phone,
            v_effective_name,
            v_points_to_add,
            v_points_to_add,
            v_now,
            v_now,
            v_now
        )
        RETURNING * INTO v_cust;

        v_new_balance := v_points_to_add;
        v_new_lifetime := v_points_to_add;
    ELSE
        v_new_balance := COALESCE(v_cust.wallet_balance, 0) + v_points_to_add;
        v_new_lifetime := COALESCE(v_cust.lifetime_xp, 0) + v_points_to_add;

        UPDATE public.store_customers
        SET wallet_balance = v_new_balance,
            lifetime_xp = v_new_lifetime,
            last_visit_date = v_now,
            name = CASE
                WHEN (name IS NULL OR name IN ('', 'عميل', 'عميل مميز', 'عميل المتجر'))
                     AND v_effective_name NOT IN ('عميل', 'عميل مميز', 'عميل المتجر')
                THEN v_effective_name
                ELSE name
            END,
            updated_at = v_now
        WHERE id = v_cust.id
        RETURNING * INTO v_cust;
    END IF;

    -- 7. Record Mandatory Audit Log Entry Atomically (NO EXCEPTION SWALLOWING)
    IF v_staff_id_str IS NOT NULL AND v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_staff_uuid := v_staff_id_str::uuid;
    END IF;

    INSERT INTO public.audit_logs (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        points_changed,
        purchase_amount,
        staff_id,
        branch_id,
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
        v_points_to_add,
        COALESCE(p_purchase_amount, 0),
        v_staff_uuid,
        p_branch_id,
        'PURCHASE',
        'EARN_POINTS',
        COALESCE(NULLIF(BTRIM(p_entry_method), ''), 'POS_CASHIER'),
        jsonb_build_object(
            'invoice_number', p_invoice_number,
            'note', COALESCE(p_invoice_number, 'شراء بقيمة ' || COALESCE(p_purchase_amount, 0)::text || ' ر.س'),
            'multiplier', v_multiplier,
            'source', 'POS_CASHIER',
            'staff_role', v_staff_role,
            'branch_id', p_branch_id,
            'branch_name', p_branch_name
        ),
        v_now
    );

    -- 8. Resolve Current Tier
    SELECT tier_name INTO v_current_tier
    FROM public.tiers
    WHERE store_id = p_store_id
      AND required_xp <= v_new_lifetime
    ORDER BY required_xp DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', v_cust.id,
        'phone', v_cust.phone,
        'name', v_cust.name,
        'points_added', v_points_to_add,
        'new_balance', v_new_balance,
        'lifetime_xp', v_new_lifetime,
        'current_tier', COALESCE(v_current_tier, 'ضيف (Guest)')
    );
END;
$function$;


-- 3.6 Redeem Customer Points Secure (Atomic Points Burn by Cashier + Audit Log)
CREATE OR REPLACE FUNCTION public.redeem_customer_points_secure(
    p_store_id uuid,
    p_phone text,
    p_points_to_burn integer,
    p_reward_title text DEFAULT 'استبدال مكافأة'::text,
    p_staff_token text DEFAULT NULL::text,
    p_staff_id text DEFAULT NULL::text,
    p_staff_name text DEFAULT NULL::text,
    p_entry_method text DEFAULT 'qr_scan'::text,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_branch_name text DEFAULT NULL::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_norm_phone TEXT;
    v_cust RECORD;
    v_staff_store_id UUID := NULL;
    v_staff_id_str TEXT := NULL;
    v_has_access BOOLEAN := FALSE;
    v_staff_uuid UUID := NULL;
    v_new_balance INT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    -- 1. Verify Cashier / Store Admin / Super Admin Session
    IF public.is_super_admin()
       OR auth.role() = 'service_role'
       OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
       OR public.has_store_access(p_store_id) THEN
        v_has_access := TRUE;
    ELSIF p_staff_token IS NOT NULL AND BTRIM(p_staff_token) <> '' THEN
        SELECT s.store_id, s.staff_id INTO v_staff_store_id, v_staff_id_str
        FROM public.staff_sessions s
        WHERE s.token_hash = encode(sha256(convert_to(BTRIM(p_staff_token), 'UTF8')), 'hex')
          AND s.expires_at > v_now
        LIMIT 1;

        IF v_staff_store_id = p_store_id THEN
            v_has_access := TRUE;
            UPDATE public.staff_sessions
            SET expires_at = v_now + interval '24 hours'
            WHERE token_hash = encode(sha256(convert_to(BTRIM(p_staff_token), 'UTF8')), 'hex');
        END IF;
    ELSIF public.has_valid_staff_access(p_store_id, FALSE) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED_STAFF',
            'message', 'غير مصرح: جلسة الكاشير غير صالحة أو منتهية'
        );
    END IF;

    IF COALESCE(p_points_to_burn, 0) <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_POINTS', 'message', 'عدد النقاط المراد استبدالها يجب أن يكون أكبر من صفر');
    END IF;

    v_norm_phone := public.normalize_saudi_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE', 'message', 'رقم الجوال السعودي غير صالح');
    END IF;

    -- 2. Lock Customer Row & Check Balance
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE store_id = p_store_id
      AND phone = v_norm_phone
    FOR UPDATE
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND', 'message', 'العميل غير مسجل في هذا المتجر');
    END IF;

    IF COALESCE(v_cust.wallet_balance, 0) < p_points_to_burn THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_POINTS',
            'message', 'رصيد العميل لا يكفي (' || COALESCE(v_cust.wallet_balance, 0)::text || ' نقطة فقط)'
        );
    END IF;

    v_new_balance := COALESCE(v_cust.wallet_balance, 0) - p_points_to_burn;

    -- 3. Deduct Points Atomically
    UPDATE public.store_customers
    SET wallet_balance = v_new_balance,
        last_visit_date = v_now,
        updated_at = v_now
    WHERE id = v_cust.id
    RETURNING * INTO v_cust;

    -- 4. Insert Audit Log Atomically (NO EXCEPTION SWALLOWING)
    IF p_staff_id IS NOT NULL AND p_staff_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_staff_uuid := p_staff_id::uuid;
    ELSIF v_staff_id_str IS NOT NULL AND v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_staff_uuid := v_staff_id_str::uuid;
    END IF;

    INSERT INTO public.audit_logs (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        points_changed,
        purchase_amount,
        staff_id,
        branch_id,
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
        -p_points_to_burn,
        0,
        v_staff_uuid,
        p_branch_id,
        'REDEEM_REWARD',
        'BURN_POINTS',
        COALESCE(NULLIF(BTRIM(p_entry_method), ''), 'qr_scan'),
        jsonb_build_object(
            'reward', COALESCE(NULLIF(BTRIM(p_reward_title), ''), 'استبدال مكافأة'),
            'cashier_name', COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير'),
            'customer_name', v_cust.name,
            'branch_id', p_branch_id,
            'branch_name', p_branch_name
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', v_cust.id,
        'phone', v_cust.phone,
        'name', v_cust.name,
        'new_balance', v_new_balance,
        'lifetime_xp', v_cust.lifetime_xp,
        'customer', jsonb_build_object(
            'id', v_cust.id,
            'store_id', v_cust.store_id,
            'phone', v_cust.phone,
            'name', v_cust.name,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp,
            'last_visit_date', v_cust.last_visit_date,
            'created_at', v_cust.created_at
        ),
        'burned_points', p_points_to_burn,
        'remaining_balance', v_new_balance
    );
END;
$function$;


-- 3.7 Adjust Customer Points Secure (Store Manager / Admin Manual Adjustment + Mandatory Audit Log)
CREATE OR REPLACE FUNCTION public.adjust_customer_points_secure(
    p_store_id uuid,
    p_customer_id uuid,
    p_points_delta integer,
    p_reason text,
    p_staff_token text DEFAULT NULL::text,
    p_staff_name text DEFAULT NULL::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_cust RECORD;
    v_staff_store_id UUID := NULL;
    v_staff_id_str TEXT := NULL;
    v_has_admin_access BOOLEAN := FALSE;
    v_staff_uuid UUID := NULL;
    v_new_balance INT;
    v_new_lifetime INT;
    v_actual_delta INT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    -- 1. Require Store Admin / Manager / Owner or Super Admin
    IF public.is_super_admin()
       OR auth.role() = 'service_role'
       OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
       OR public.is_store_admin(p_store_id) THEN
        v_has_admin_access := TRUE;
    ELSIF p_staff_token IS NOT NULL AND BTRIM(p_staff_token) <> '' THEN
        SELECT s.store_id, s.staff_id INTO v_staff_store_id, v_staff_id_str
        FROM public.staff_sessions s
        WHERE s.token_hash = encode(sha256(convert_to(BTRIM(p_staff_token), 'UTF8')), 'hex')
          AND s.expires_at > v_now
          AND s.role IN ('admin', 'owner', 'manager')
        LIMIT 1;

        IF v_staff_store_id = p_store_id THEN
            v_has_admin_access := TRUE;
        END IF;
    ELSIF public.has_valid_staff_access(p_store_id, TRUE) THEN
        v_has_admin_access := TRUE;
    END IF;

    IF NOT v_has_admin_access THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED_ADMIN',
            'message', 'غير مصرح: تعديل رصيد النقاط اليدوي متاح لمدير المتجر فقط'
        );
    END IF;

    IF COALESCE(p_points_delta, 0) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'ZERO_DELTA', 'message', 'قيمة التعديل يجب ألا تكون صفراً');
    END IF;

    IF p_reason IS NULL OR BTRIM(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'REASON_REQUIRED', 'message', 'سبب تعديل النقاط إلزامي للتوثيق في سجل الرقابة');
    END IF;

    -- 2. Lock Customer Row
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE id = p_customer_id
      AND store_id = p_store_id
    FOR UPDATE
    LIMIT 1;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND', 'message', 'العميل غير موجود في هذا المتجر');
    END IF;

    v_new_balance := GREATEST(0, COALESCE(v_cust.wallet_balance, 0) + p_points_delta);
    v_actual_delta := v_new_balance - COALESCE(v_cust.wallet_balance, 0);
    v_new_lifetime := CASE
        WHEN p_points_delta > 0 THEN COALESCE(v_cust.lifetime_xp, 0) + p_points_delta
        ELSE COALESCE(v_cust.lifetime_xp, 0)
    END;

    -- 3. Update Customer Balance Atomically
    UPDATE public.store_customers
    SET wallet_balance = v_new_balance,
        lifetime_xp = v_new_lifetime,
        last_visit_date = v_now,
        updated_at = v_now
    WHERE id = v_cust.id
    RETURNING * INTO v_cust;

    -- 4. Insert Mandatory Audit Log Entry Atomically
    IF v_staff_id_str IS NOT NULL AND v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_staff_uuid := v_staff_id_str::uuid;
    END IF;

    INSERT INTO public.audit_logs (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        points_changed,
        purchase_amount,
        staff_id,
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
        v_actual_delta,
        0,
        v_staff_uuid,
        'ADJUSTMENT',
        'MANUAL_POINTS_ADJUSTMENT',
        'ADMIN_CONSOLE',
        jsonb_build_object(
            'reason', BTRIM(p_reason),
            'requested_delta', p_points_delta,
            'applied_delta', v_actual_delta,
            'cashier_name', COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'مدير المتجر'),
            'customer_name', v_cust.name
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', v_cust.id,
        'phone', v_cust.phone,
        'name', v_cust.name,
        'customer', jsonb_build_object(
            'id', v_cust.id,
            'store_id', v_cust.store_id,
            'phone', v_cust.phone,
            'name', v_cust.name,
            'wallet_balance', v_cust.wallet_balance,
            'lifetime_xp', v_cust.lifetime_xp,
            'special_date', v_cust.special_date,
            'special_date_type', v_cust.special_date_type,
            'last_visit_date', v_cust.last_visit_date,
            'created_at', v_cust.created_at
        ),
        'new_balance', v_new_balance,
        'lifetime_xp', v_new_lifetime
    );
END;
$function$;


-- 3.8 Purchase Coupon Secure (Atomic Points Deduction, Quota & Tier Check, Coupon Issuance & Audit Log)
CREATE OR REPLACE FUNCTION public.purchase_coupon_secure(
    p_store_id uuid,
    p_customer_id uuid,
    p_privilege_id uuid,
    p_coupon_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_cust public.store_customers%ROWTYPE;
    v_priv public.privileges%ROWTYPE;
    v_req_tier public.tiers%ROWTYPE;
    v_cost INT;
    v_new_balance INT;
    v_new_count INT;
    v_coupon_id UUID;
    v_final_code TEXT;
    v_owned INT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    -- 1. Lock Customer Row
    SELECT * INTO v_cust
    FROM public.store_customers
    WHERE id = p_customer_id
      AND store_id = p_store_id
    FOR UPDATE;

    IF v_cust.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND', 'message', 'العميل غير موجود');
    END IF;

    -- 2. Lock Privilege Row
    SELECT * INTO v_priv
    FROM public.privileges
    WHERE id = p_privilege_id
      AND store_id = p_store_id
    FOR UPDATE;

    IF v_priv.id IS NULL OR v_priv.is_active IS FALSE THEN
        RETURN jsonb_build_object('success', false, 'error', 'REWARD_UNAVAILABLE', 'message', 'عذراً، هذا الامتياز غير متاح حالياً');
    END IF;

    -- 3. Check Total Stock Quota
    IF v_priv.quantity_limit IS NOT NULL AND v_priv.quantity_limit > 0
       AND COALESCE(v_priv.redeemed_count, 0) >= v_priv.quantity_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'SOLD_OUT', 'message', 'نفدت الكمية المتاحة من هذه المكافأة');
    END IF;

    -- 4. Check Per-Customer Quota
    IF v_priv.per_customer_limit IS NOT NULL AND v_priv.per_customer_limit > 0 THEN
        SELECT count(*) INTO v_owned
        FROM public.customer_coupons
        WHERE store_id = p_store_id
          AND customer_id = p_customer_id
          AND privilege_id = p_privilege_id;

        IF v_owned >= v_priv.per_customer_limit THEN
            RETURN jsonb_build_object('success', false, 'error', 'LIMIT_REACHED', 'message', 'وصلت للحد الأقصى المسموح به لهذه المكافأة');
        END IF;
    END IF;

    -- 5. Check Required Tier (if configured on privilege)
    IF v_priv.required_tier_id IS NOT NULL THEN
        SELECT * INTO v_req_tier
        FROM public.tiers
        WHERE id = v_priv.required_tier_id
          AND store_id = p_store_id;

        IF v_req_tier.id IS NOT NULL AND COALESCE(v_cust.lifetime_xp, 0) < COALESCE(v_req_tier.required_xp, 0) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'TIER_REQUIRED',
                'message', 'عذراً، يتطلب هذا العرض الوصول لرتبة "' || v_req_tier.tier_name || '" أولاً (' || v_req_tier.required_xp::text || ' XP)'
            );
        END IF;
    END IF;

    -- 6. Check Customer Points Balance
    v_cost := GREATEST(0, COALESCE(v_priv.cost_points, 0));
    IF COALESCE(v_cust.wallet_balance, 0) < v_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS', 'message', 'رصيد نقاطك غير كافٍ');
    END IF;

    v_new_balance := COALESCE(v_cust.wallet_balance, 0) - v_cost;

    -- 7. Deduct Points from Customer
    UPDATE public.store_customers
    SET wallet_balance = v_new_balance,
        updated_at = v_now
    WHERE id = p_customer_id;

    -- 8. Increment Privilege Redeemed Count & Auto-Hide if Sold Out
    v_new_count := COALESCE(v_priv.redeemed_count, 0) + 1;
    UPDATE public.privileges
    SET redeemed_count = v_new_count,
        is_hidden = CASE
            WHEN quantity_limit IS NOT NULL AND quantity_limit > 0 AND v_new_count >= quantity_limit
            THEN TRUE
            ELSE is_hidden
        END,
        updated_at = v_now
    WHERE id = p_privilege_id;

    -- 9. Issue Active Coupon in customer_coupons
    v_final_code := UPPER(COALESCE(
        NULLIF(BTRIM(p_coupon_code), ''),
        'CPN-' || floor(1000 + random() * 9000)::int::text || '-' || upper(substr(md5(random()::text || v_now::text), 1, 4))
    ));

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
        p_customer_id,
        v_cust.phone,
        COALESCE(v_cust.name, 'عميل مميز'),
        p_privilege_id,
        v_priv.title,
        v_priv.image_url,
        v_final_code,
        v_cost,
        'ACTIVE',
        COALESCE(NULLIF(BTRIM(v_priv.valid_start_time), ''), '00:00'),
        COALESCE(NULLIF(BTRIM(v_priv.valid_end_time), ''), '23:59'),
        v_now
    )
    RETURNING id INTO v_coupon_id;

    -- 10. Record Mandatory Audit Log Entry Atomically (NO EXCEPTION SWALLOWING)
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
        p_customer_id,
        v_cust.phone,
        COALESCE(v_cust.name, 'عميل مميز'),
        -v_cost,
        0,
        'REDEEM_REWARD',
        'PURCHASE_COUPON',
        'CUSTOMER_WALLET',
        jsonb_build_object(
            'coupon_id', v_coupon_id,
            'coupon_code', v_final_code,
            'privilege_id', p_privilege_id,
            'privilege_title', v_priv.title,
            'cost_points', v_cost
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'coupon_id', v_coupon_id,
        'coupon_code', v_final_code,
        'new_balance', v_new_balance,
        'redeemed_count', v_new_count,
        'coupon', jsonb_build_object(
            'id', v_coupon_id,
            'coupon_code', v_final_code,
            'customer_id', p_customer_id,
            'customer_phone', v_cust.phone,
            'customer_name', COALESCE(v_cust.name, 'عميل مميز'),
            'store_id', p_store_id,
            'privilege_id', p_privilege_id,
            'privilege_title', v_priv.title,
            'privilege_image_url', v_priv.image_url,
            'cost_points', v_cost,
            'status', 'ACTIVE',
            'valid_start_time', COALESCE(NULLIF(BTRIM(v_priv.valid_start_time), ''), '00:00'),
            'valid_end_time', COALESCE(NULLIF(BTRIM(v_priv.valid_end_time), ''), '23:59'),
            'purchased_at', v_now
        )
    );
END;
$function$;


-- 3.9 Redeem Coupon Secure (Atomic Single-Use Burn, Store Isolation, Staff Guard & Safe UUID Cast)
CREATE OR REPLACE FUNCTION public.redeem_coupon_secure(
    p_store_id uuid,
    p_coupon_code text,
    p_staff_token text DEFAULT NULL::text,
    p_staff_id text DEFAULT NULL::text,
    p_staff_name text DEFAULT NULL::text,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_branch_name text DEFAULT NULL::text,
    p_entry_method text DEFAULT 'qr_scan'::text,
    p_master_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_coupon RECORD;
    v_staff_store_id UUID := NULL;
    v_staff_id_str TEXT := NULL;
    v_has_access BOOLEAN := FALSE;
    v_staff_uuid UUID := NULL;
    v_clean_code TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM public.assert_platform_active();

    -- 1. Strict Cashier / Store Admin / Super Admin Session Guard
    IF public.is_super_admin()
       OR auth.role() = 'service_role'
       OR (p_master_token IS NOT NULL AND public.is_valid_master_token(p_master_token))
       OR public.has_store_access(p_store_id) THEN
        v_has_access := TRUE;
    ELSIF p_staff_token IS NOT NULL AND BTRIM(p_staff_token) <> '' THEN
        SELECT s.store_id, s.staff_id INTO v_staff_store_id, v_staff_id_str
        FROM public.staff_sessions s
        WHERE s.token_hash = encode(sha256(convert_to(BTRIM(p_staff_token), 'UTF8')), 'hex')
          AND s.expires_at > v_now
        LIMIT 1;

        IF v_staff_store_id = p_store_id THEN
            v_has_access := TRUE;
            UPDATE public.staff_sessions
            SET expires_at = v_now + interval '24 hours'
            WHERE token_hash = encode(sha256(convert_to(BTRIM(p_staff_token), 'UTF8')), 'hex');
        END IF;
    ELSIF public.has_valid_staff_access(p_store_id, FALSE) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED_STAFF',
            'message', 'غير مصرح: جلسة الكاشير غير صالحة أو منتهية'
        );
    END IF;

    v_clean_code := UPPER(BTRIM(COALESCE(p_coupon_code, '')));
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_COUPON', 'message', 'رمز الكوبون فارغ');
    END IF;

    -- 2. Locate and Lock Coupon Row (Check by coupon_code or UUID id)
    SELECT * INTO v_coupon
    FROM public.customer_coupons
    WHERE (UPPER(BTRIM(coupon_code)) = v_clean_code OR id::text = lower(v_clean_code))
    FOR UPDATE
    LIMIT 1;

    IF v_coupon.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'COUPON_NOT_FOUND', 'message', 'الكوبون غير صالح أو غير مسجل في النظام ❌');
    END IF;

    -- 3. Store Isolation Check
    IF v_coupon.store_id <> p_store_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'WRONG_STORE',
            'customer_phone', v_coupon.customer_phone,
            'coupon_store_id', v_coupon.store_id,
            'message', 'عفواً، هذا الكوبون خاص بمتجر آخر ولا يمكن صرفه هنا ❌'
        );
    END IF;

    -- 4. Single-Use Status Check
    IF v_coupon.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ALREADY_REDEEMED',
            'message', 'هذا الكوبون محروق وتم استخدامه مسبقاً ❌'
        );
    END IF;

    -- 5. Resolve Safe UUID for redeemed_by_staff_id (Never pass non-UUID string 'cashier' into UUID column!)
    IF p_staff_id IS NOT NULL AND p_staff_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_staff_uuid := p_staff_id::uuid;
    ELSIF v_staff_id_str IS NOT NULL AND v_staff_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_staff_uuid := v_staff_id_str::uuid;
    END IF;

    -- 6. Burn Coupon Atomically
    UPDATE public.customer_coupons
    SET status = 'REDEEMED',
        redeemed_at = v_now,
        used_at = v_now,
        redeemed_by_staff_id = v_staff_uuid,
        redeemed_by_staff_name = COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير المتجر'),
        cashier_name = COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير المتجر'),
        branch_id = COALESCE(p_branch_id, branch_id)
    WHERE id = v_coupon.id;

    -- 7. Record Mandatory Audit Log Entry Atomically (Valid action 'REDEEM_REWARD', NO EXCEPTION SWALLOWING)
    INSERT INTO public.audit_logs (
        store_id,
        customer_id,
        customer_phone,
        customer_name,
        points_changed,
        purchase_amount,
        staff_id,
        branch_id,
        action,
        event_type,
        entry_method,
        metadata,
        created_at
    ) VALUES (
        p_store_id,
        v_coupon.customer_id,
        v_coupon.customer_phone,
        v_coupon.customer_name,
        0,
        0,
        v_staff_uuid,
        p_branch_id,
        'REDEEM_REWARD',
        'REDEEM_COUPON',
        COALESCE(NULLIF(BTRIM(p_entry_method), ''), 'qr_scan'),
        jsonb_build_object(
            'coupon_id', v_coupon.id,
            'coupon_code', v_coupon.coupon_code,
            'privilege_id', v_coupon.privilege_id,
            'privilege_title', v_coupon.privilege_title,
            'cost_points', v_coupon.cost_points,
            'branch_id', p_branch_id,
            'branch_name', p_branch_name,
            'cashier_name', COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير المتجر'),
            'redeemed_at', v_now
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'coupon_id', v_coupon.id,
        'coupon_code', v_coupon.coupon_code,
        'privilege_title', v_coupon.privilege_title,
        'customer_phone', v_coupon.customer_phone,
        'customer_name', v_coupon.customer_name,
        'cost_points', v_coupon.cost_points,
        'redeemed_at', v_now,
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
            'status', 'REDEEMED',
            'used_at', v_now,
            'purchased_at', v_coupon.purchased_at,
            'cashier_name', COALESCE(NULLIF(BTRIM(p_staff_name), ''), 'كاشير المتجر')
        )
    );
END;
$function$;


-- ==============================================================================
-- SECTION 4: RLS POLICIES & FUNCTION GRANTS HARDENING (REPLACE BEFORE DROP)
-- ==============================================================================

-- 4.1 store_customers: Ensure scoped policies exist before dropping wide-open policies
DROP POLICY IF EXISTS "store_customers_scoped_select" ON public.store_customers;
CREATE POLICY "store_customers_scoped_select"
  ON public.store_customers
  FOR SELECT
  TO anon, authenticated
  USING (
    public.has_valid_staff_access(store_id, false)
    OR public.has_store_access(store_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "store_customers_scoped_update" ON public.store_customers;
CREATE POLICY "store_customers_scoped_update"
  ON public.store_customers
  FOR UPDATE
  TO anon, authenticated
  USING (
    public.has_valid_staff_access(store_id, true)
    OR public.is_store_admin(store_id)
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.has_valid_staff_access(store_id, true)
    OR public.is_store_admin(store_id)
    OR public.is_super_admin()
  );

-- Drop wide-open anon INSERT / UPDATE policies on store_customers (All customer registrations go through register_or_get_customer_wallet RPC)
DROP POLICY IF EXISTS "store_customers_insert_policy" ON public.store_customers;
DROP POLICY IF EXISTS "store_customers_update_staff_or_self" ON public.store_customers;
DROP POLICY IF EXISTS "store_customers_select_staff_only" ON public.store_customers;


-- 4.2 customer_coupons: Ensure scoped policies exist before dropping wide-open policies
DROP POLICY IF EXISTS "customer_coupons_scoped_select" ON public.customer_coupons;
CREATE POLICY "customer_coupons_scoped_select"
  ON public.customer_coupons
  FOR SELECT
  TO anon, authenticated
  USING (
    public.has_valid_staff_access(store_id, false)
    OR public.has_store_access(store_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "customer_coupons_scoped_update" ON public.customer_coupons;
CREATE POLICY "customer_coupons_scoped_update"
  ON public.customer_coupons
  FOR UPDATE
  TO anon, authenticated
  USING (
    public.has_valid_staff_access(store_id, false)
    OR public.has_store_access(store_id)
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.has_valid_staff_access(store_id, false)
    OR public.has_store_access(store_id)
    OR public.is_super_admin()
  );

-- Drop wide-open anon INSERT policy on customer_coupons (All coupon purchases go through purchase_coupon_secure RPC)
DROP POLICY IF EXISTS "customer_coupons_insert_policy" ON public.customer_coupons;
DROP POLICY IF EXISTS "customer_coupons_select_staff_only" ON public.customer_coupons;
DROP POLICY IF EXISTS "customer_coupons_update_staff_token" ON public.customer_coupons;


-- 4.3 audit_logs: Ensure scoped policies exist before dropping wide-open policies
DROP POLICY IF EXISTS "audit_logs_scoped_select" ON public.audit_logs;
CREATE POLICY "audit_logs_scoped_select"
  ON public.audit_logs
  FOR SELECT
  TO anon, authenticated
  USING (
    public.has_valid_staff_access(store_id, false)
    OR public.has_store_access(store_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "audit_logs_scoped_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_scoped_insert"
  ON public.audit_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    public.has_valid_staff_access(store_id, false)
    OR public.has_store_access(store_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;


-- 4.4 Explicit Function Grants
GRANT EXECUTE ON FUNCTION public.normalize_saudi_phone(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_or_get_customer_wallet(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_customer_secure(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_wallet_public(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_customer_profile_public(uuid, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_coupon_secure(uuid, uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_customer_points_secure(uuid, text, integer, text, text, numeric, text, text, uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_customer_points_secure(uuid, text, integer, text, text, text, text, text, uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_customer_points_secure(uuid, uuid, integer, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_secure(uuid, text, text, text, text, uuid, text, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

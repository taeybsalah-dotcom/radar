-- ==============================================================================
-- Migration: 20261016_fix_branches_cashier_multi_branch_and_bookings.sql
-- Description:
-- 1. Adds assigned_branch_ids to public.store_staff
-- 2. Updates verify_staff_pin to return branch_id and assigned_branch_ids
-- 3. Updates book_service_safely to accept p_branch_id and save it on INSERT
-- ==============================================================================

-- 1. Add assigned_branch_ids column to store_staff
ALTER TABLE public.store_staff
ADD COLUMN IF NOT EXISTS assigned_branch_ids UUID[] DEFAULT '{}';

-- Backfill assigned_branch_ids from existing branch_id
UPDATE public.store_staff
SET assigned_branch_ids = ARRAY[branch_id]
WHERE branch_id IS NOT NULL 
  AND (assigned_branch_ids IS NULL OR cardinality(assigned_branch_ids) = 0);

-- 2. Update verify_staff_pin to return branch_id and assigned_branch_ids
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
    p_phone TEXT,
    p_pin TEXT,
    p_store_id UUID DEFAULT NULL,
    p_store_slug TEXT DEFAULT NULL,
    p_required_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_norm_input TEXT;
    v_norm_pin TEXT;
    v_resolved_store_id UUID := p_store_id;
    v_store_record RECORD;
    v_staff_record RECORD;
    v_is_match BOOLEAN := FALSE;
    v_key TEXT;
    v_lock INT;
    v_token TEXT;
BEGIN
    v_norm_input := public.normalize_phone(p_phone);
    v_norm_pin := trim(COALESCE(p_pin, ''));

    IF v_norm_input = '' OR v_norm_pin = ''
       OR length(v_norm_input) > 15 OR length(v_norm_pin) > 32
       OR (p_store_slug IS NOT NULL AND length(p_store_slug) > 120)
       OR (p_required_role IS NOT NULL AND p_required_role NOT IN ('admin', 'cashier')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT',
            'message', 'رقم الجوال والرمز السري مطلوبان');
    END IF;

    IF v_resolved_store_id IS NULL AND p_store_slug IS NOT NULL AND trim(p_store_slug) <> '' THEN
        SELECT id INTO v_resolved_store_id
        FROM public.stores
        WHERE lower(slug) = lower(trim(p_store_slug))
        LIMIT 1;
    END IF;

    IF v_resolved_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND',
            'message', 'تعذر العثور على المتجر المحدد');
    END IF;

    SELECT id, slug, name, manager_name, manager_contact
    INTO v_store_record
    FROM public.stores
    WHERE id = v_resolved_store_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND',
            'message', 'تعذر العثور على المتجر المحدد');
    END IF;

    -- Lockout check
    v_key := v_resolved_store_id::text || ':' || v_norm_input;
    v_lock := public._pin_lock_seconds('staff', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    -- Search store_staff
    FOR v_staff_record IN
        SELECT id, store_id, branch_id, assigned_branch_ids, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
        FROM public.store_staff
        WHERE store_id = v_resolved_store_id
          AND is_active = true
          AND public.normalize_phone(phone) = v_norm_input
    LOOP
        IF p_required_role IS NULL
           OR p_required_role = 'cashier'
           OR (p_required_role = 'admin' AND v_staff_record.role = 'admin')
        THEN
            IF v_staff_record.pin_code LIKE '$2%' THEN
                v_is_match := (v_staff_record.pin_code = crypt(v_norm_pin, v_staff_record.pin_code));
            ELSE
                v_is_match := (trim(v_staff_record.pin_code) = v_norm_pin);
                IF v_is_match THEN
                    UPDATE public.store_staff
                    SET pin_code = crypt(v_norm_pin, gen_salt('bf', 8)),
                        updated_at = now()
                    WHERE id = v_staff_record.id;
                END IF;
            END IF;

            IF v_is_match THEN
                PERFORM public._pin_register_success('staff', v_key);
                v_token := public._staff_session_create(v_resolved_store_id, v_staff_record.id::text, v_staff_record.role);
                UPDATE public.store_staff SET updated_at = now() WHERE id = v_staff_record.id;

                RETURN jsonb_build_object(
                    'success', true,
                    'session_token', v_token,
                    'staff', jsonb_build_object(
                        'id', v_staff_record.id,
                        'store_id', v_staff_record.store_id,
                        'branch_id', v_staff_record.branch_id,
                        'assigned_branch_ids', COALESCE(v_staff_record.assigned_branch_ids, '{}'::uuid[]),
                        'user_id', v_staff_record.user_id,
                        'name', v_staff_record.name,
                        'phone', v_staff_record.phone,
                        'role', v_staff_record.role,
                        'is_active', v_staff_record.is_active,
                        'can_manual_input_phone', v_staff_record.can_manual_input_phone,
                        'store_name', v_store_record.name,
                        'store_slug', v_store_record.slug
                    )
                );
            END IF;
        END IF;
    END LOOP;

    -- If no match in store_staff, check store manager credentials
    IF public.normalize_phone(v_store_record.manager_contact) = v_norm_input THEN
        SELECT id, store_id, branch_id, assigned_branch_ids, user_id, name, phone, role, pin_code, is_active, can_manual_input_phone
        INTO v_staff_record
        FROM public.store_staff
        WHERE store_id = v_resolved_store_id
          AND role = 'admin'
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF FOUND THEN
            IF v_staff_record.pin_code LIKE '$2%' THEN
                v_is_match := (v_staff_record.pin_code = crypt(v_norm_pin, v_staff_record.pin_code));
            ELSE
                v_is_match := (trim(v_staff_record.pin_code) = v_norm_pin);
                IF v_is_match THEN
                    UPDATE public.store_staff
                    SET pin_code = crypt(v_norm_pin, gen_salt('bf', 8)),
                        updated_at = now()
                    WHERE id = v_staff_record.id;
                END IF;
            END IF;

            IF v_is_match THEN
                PERFORM public._pin_register_success('staff', v_key);
                v_token := public._staff_session_create(v_resolved_store_id, v_staff_record.id::text, 'admin');

                RETURN jsonb_build_object(
                    'success', true,
                    'session_token', v_token,
                    'staff', jsonb_build_object(
                        'id', v_staff_record.id,
                        'store_id', v_staff_record.store_id,
                        'branch_id', v_staff_record.branch_id,
                        'assigned_branch_ids', COALESCE(v_staff_record.assigned_branch_ids, '{}'::uuid[]),
                        'user_id', v_staff_record.user_id,
                        'name', COALESCE(v_store_record.manager_name, v_staff_record.name, 'مدير المتجر'),
                        'phone', v_norm_input,
                        'role', 'admin',
                        'is_active', true,
                        'can_manual_input_phone', true,
                        'store_name', v_store_record.name,
                        'store_slug', v_store_record.slug
                    )
                );
            END IF;
        END IF;
    END IF;

    -- Failure
    PERFORM public._pin_register_failure('staff', v_key);
    v_lock := public._pin_lock_seconds('staff', v_key);
    IF v_lock > 0 THEN
        RETURN public._locked_response(v_lock);
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS',
        'message', 'رقم الجوال أو الرمز السري (PIN) غير صحيح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated;

-- 3. Update book_service_safely to accept p_branch_id and save it on insert
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, uuid, text, text, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, uuid, text, numeric, integer, uuid, text, text, text, text, integer, jsonb, uuid);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.book_service_safely(
    p_store_id UUID,
    p_customer_id UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT 'عميل المتجر',
    p_customer_phone TEXT DEFAULT '',
    p_service_id TEXT DEFAULT 'srv-main',
    p_service_name TEXT DEFAULT 'خدمة',
    p_service_price NUMERIC DEFAULT 0,
    p_service_duration_minutes INT DEFAULT 30,
    p_specialist_id TEXT DEFAULT NULL,
    p_specialist_name TEXT DEFAULT NULL,
    p_booking_date TEXT DEFAULT '',
    p_booking_time TEXT DEFAULT '',
    p_notes TEXT DEFAULT NULL,
    p_points_to_earn INT DEFAULT 0,
    p_selected_modifiers JSONB DEFAULT '[]'::jsonb,
    p_branch_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_overlap_exists BOOLEAN;
    v_booking_id UUID;
    v_booking_number TEXT;
    v_lock_key BIGINT;
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_new_booking RECORD;
    v_clean_date DATE;
BEGIN
    -- 1. Create a deterministic lock key to serialize concurrent booking requests
    IF p_specialist_id IS NOT NULL AND trim(p_specialist_id) <> '' THEN
        v_lock_key := hashtext(p_specialist_id);
        PERFORM pg_advisory_xact_lock(v_lock_key);

        BEGIN
            v_start_time := (p_booking_date || ' ' || p_booking_time)::TIMESTAMP;
            v_end_time := v_start_time + (COALESCE(p_service_duration_minutes, 30) || ' minutes')::INTERVAL;

            SELECT EXISTS (
                SELECT 1 FROM public.service_bookings
                WHERE specialist_id = p_specialist_id
                AND status NOT IN ('cancelled', 'rejected', 'no_show')
                AND (
                    ((booking_date || ' ' || booking_time)::TIMESTAMP < v_end_time)
                    AND (((booking_date || ' ' || booking_time)::TIMESTAMP + (COALESCE(service_duration_minutes, 30) || ' minutes')::INTERVAL) > v_start_time)
                )
            ) INTO v_overlap_exists;

            IF v_overlap_exists THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'نعتذر، هذا الموعد محجوز مسبقاً لدى الأخصائي المختار. يرجى اختيار موعد آخر.'
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- 2. Parse date safely
    BEGIN
        v_clean_date := p_booking_date::DATE;
    EXCEPTION WHEN OTHERS THEN
        v_clean_date := CURRENT_DATE;
    END;

    -- 3. Generate unique booking number
    v_booking_number := 'BKG-' || upper(substring(replace(gen_random_uuid()::TEXT, '-', '') from 1 for 20));
    v_booking_id := gen_random_uuid();

    -- 4. Insert booking with branch_id populated right from creation
    INSERT INTO public.service_bookings (
        id,
        booking_number,
        store_id,
        branch_id,
        customer_id,
        customer_name,
        customer_phone,
        service_id,
        service_name,
        service_price,
        selected_modifiers,
        service_duration_minutes,
        specialist_id,
        specialist_name,
        booking_date,
        booking_time,
        status,
        customer_notes,
        loyalty_points_earned,
        created_at,
        updated_at
    ) VALUES (
        v_booking_id::TEXT,
        v_booking_number,
        p_store_id,
        p_branch_id,
        p_customer_id,
        COALESCE(p_customer_name, 'عميل المتجر'),
        COALESCE(p_customer_phone, ''),
        COALESCE(p_service_id, 'srv-main'),
        COALESCE(p_service_name, 'خدمة'),
        COALESCE(p_service_price, 0),
        COALESCE(p_selected_modifiers, '[]'::jsonb),
        COALESCE(p_service_duration_minutes, 30),
        p_specialist_id,
        p_specialist_name,
        v_clean_date,
        COALESCE(p_booking_time, '00:00'),
        'pending',
        p_notes,
        COALESCE(p_points_to_earn, 0),
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_booking;

    RETURN jsonb_build_object(
        'success', true,
        'booking', to_jsonb(v_new_booking)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.book_service_safely TO anon, authenticated;


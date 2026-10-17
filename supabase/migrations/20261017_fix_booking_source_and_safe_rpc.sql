-- Migration: Add booking_source column and update book_service_safely RPC
ALTER TABLE public.service_bookings
ADD COLUMN IF NOT EXISTS booking_source TEXT DEFAULT 'customer_app';

-- Backfill phone call bookings from cashier
UPDATE public.service_bookings
SET booking_source = 'phone_call'
WHERE customer_notes LIKE '%[حجز هاتف للكاشير%'
   OR customer_notes LIKE '%حجز هاتف%';

-- Drop old overloads
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid);
DROP FUNCTION IF EXISTS public.book_service_safely(uuid, uuid, text, text, text, text, numeric, integer, text, text, text, text, text, integer, jsonb, uuid, text, text);

-- Recreate with explicit p_booking_source and p_status
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
    p_branch_id UUID DEFAULT NULL,
    p_booking_source TEXT DEFAULT 'customer_app',
    p_status TEXT DEFAULT 'pending'
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
    v_clean_status TEXT;
    v_clean_source TEXT;
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

    -- 3. Determine status and source
    v_clean_source := COALESCE(NULLIF(trim(p_booking_source), ''), 'customer_app');
    IF v_clean_source IN ('phone_call', 'walk_in', 'cashier') THEN
        v_clean_status := COALESCE(NULLIF(trim(p_status), ''), 'confirmed');
    ELSE
        v_clean_status := COALESCE(NULLIF(trim(p_status), ''), 'pending');
    END IF;

    -- 4. Generate unique booking number
    v_booking_number := 'BKG-' || upper(substring(replace(gen_random_uuid()::TEXT, '-', '') from 1 for 20));
    v_booking_id := gen_random_uuid();

    -- 5. Insert booking with clean status and booking_source
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
        booking_source,
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
        v_clean_status,
        v_clean_source,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION public.book_service_safely TO anon, authenticated, service_role;

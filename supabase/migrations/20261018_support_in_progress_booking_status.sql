-- Migration: Support 'in_progress' status in service_bookings RPCs
-- Date: 2026-10-18

CREATE OR REPLACE FUNCTION public.update_booking_status_secure(p_token TEXT, p_booking_id TEXT, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_row JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, false);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى');
    END IF;

    IF p_booking_id IS NULL OR length(p_booking_id) > 64
       OR p_status IS NULL OR p_status NOT IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'بيانات غير صحيحة');
    END IF;

    UPDATE public.service_bookings b
    SET status = p_status, updated_at = NOW()
    WHERE (b.id::text = p_booking_id OR b.booking_number = p_booking_id) AND b.store_id = v_sess.store_id
    RETURNING to_jsonb(b.*) INTO v_row;

    IF v_row IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'الحجز غير موجود');
    END IF;

    RETURN jsonb_build_object('success', true, 'booking', v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_bookings_secure(p_token TEXT, p_live_only BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_rows JSONB;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, false);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى');
    END IF;

    IF COALESCE(p_live_only, false) THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.booking_date, b.booking_time), '[]'::jsonb)
        INTO v_rows
        FROM (
            SELECT * FROM public.service_bookings
            WHERE store_id = v_sess.store_id AND status IN ('pending', 'confirmed', 'in_progress')
            ORDER BY booking_date, booking_time
            LIMIT 500
        ) b;
    ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
        INTO v_rows
        FROM (
            SELECT * FROM public.service_bookings
            WHERE store_id = v_sess.store_id
            ORDER BY created_at DESC
            LIMIT 500
        ) b;
    END IF;

    RETURN jsonb_build_object('success', true, 'bookings', v_rows);
END;
$$;

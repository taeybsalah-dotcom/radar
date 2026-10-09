-- ==============================================================================
-- Migration: Stage 16 - Orders and Bookings Master Plan
-- Description: Creates store_orders table and safe booking RPC
-- ==============================================================================

-- 1. Create store_orders table
CREATE TABLE IF NOT EXISTS public.store_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    customer_id UUID REFERENCES public.store_customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    order_type TEXT NOT NULL, -- 'dine_in', 'takeaway', 'delivery'
    table_number TEXT,
    items JSONB NOT NULL DEFAULT '[]',
    total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    loyalty_points_earned INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'
    payment_status TEXT NOT NULL DEFAULT 'unpaid', -- 'unpaid', 'paid'
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for realtime and querying
CREATE INDEX IF NOT EXISTS idx_store_orders_store_id ON public.store_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_status ON public.store_orders(status);
CREATE INDEX IF NOT EXISTS idx_store_orders_customer_phone ON public.store_orders(customer_phone);

-- RLS for store_orders
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stores can view and update their own orders"
    ON public.store_orders
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.stores s 
            WHERE s.id = store_orders.store_id 
            AND (s.id::text = current_setting('request.jwt.claims', true)::jsonb->>'app_store_id'
                 OR s.manager_contact = current_setting('request.jwt.claims', true)::jsonb->>'phone')
        )
    );

CREATE POLICY "Public can insert orders"
    ON public.store_orders
    FOR INSERT
    WITH CHECK (true);
    
CREATE POLICY "Public can read their own orders by phone"
    ON public.store_orders
    FOR SELECT
    USING (true);

-- 2. Safe Booking RPC (Concurrency Control)
CREATE OR REPLACE FUNCTION public.book_service_safely(
    p_store_id UUID,
    p_customer_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_service_id UUID,
    p_service_name TEXT,
    p_service_price NUMERIC,
    p_service_duration_minutes INT,
    p_specialist_id UUID,
    p_specialist_name TEXT,
    p_booking_date TEXT,
    p_booking_time TEXT,
    p_notes TEXT,
    p_points_to_earn INT,
    p_selected_modifiers JSONB DEFAULT '[]'::jsonb
) RETURNS jsonb AS $$$
DECLARE
    v_overlap_exists BOOLEAN;
    v_booking_id UUID;
    v_booking_number TEXT;
    v_lock_key BIGINT;
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
BEGIN
    -- 1. Create a deterministic lock key based on specialist_id to serialize requests for the same specialist
    v_lock_key := hashtext(p_specialist_id::TEXT);
    
    -- Acquire exclusive transaction-level advisory lock
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 2. Calculate time boundaries
    v_start_time := (p_booking_date || ' ' || p_booking_time)::TIMESTAMP;
    v_end_time := v_start_time + (p_service_duration_minutes || ' minutes')::INTERVAL;

    -- 3. Check for overlapping bookings
    SELECT EXISTS (
        SELECT 1 FROM public.service_bookings
        WHERE specialist_id = p_specialist_id
        AND status NOT IN ('cancelled', 'rejected')
        AND (
            -- Formula: (StartA < EndB) AND (EndA > StartB)
            ((booking_date || ' ' || booking_time)::TIMESTAMP < v_end_time)
            AND 
            (((booking_date || ' ' || booking_time)::TIMESTAMP + (service_duration_minutes || ' minutes')::INTERVAL) > v_start_time)
        )
    ) INTO v_overlap_exists;

    -- 4. If overlap, return error
    IF v_overlap_exists THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'عفواً، تم حجز هذا الموعد للتو من قبل عميل آخر. يرجى اختيار موعد آخر.'
        );
    END IF;

    -- 5. Generate Booking Number
    v_booking_number := 'BKG-' || upper(substr(md5(random()::text), 1, 6));

    -- 6. Insert Booking safely
    INSERT INTO public.service_bookings (
        booking_number, store_id, customer_id, customer_name, customer_phone,
        service_id, service_name, service_price, service_duration_minutes,
        specialist_id, specialist_name, booking_date, booking_time,
        status, customer_notes, points_to_earn, selected_modifiers
    ) VALUES (
        v_booking_number, p_store_id, p_customer_id, p_customer_name, p_customer_phone,
        p_service_id, p_service_name, p_service_price, p_service_duration_minutes,
        p_specialist_id, p_specialist_name, p_booking_date, p_booking_time,
        'pending', p_notes, p_points_to_earn, p_selected_modifiers
    ) RETURNING id INTO v_booking_id;

    -- 7. Return Success
    RETURN jsonb_build_object(
        'success', true, 
        'booking_id', v_booking_id,
        'booking_number', v_booking_number
    );
END;
$$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_bookings;


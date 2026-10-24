-- ==============================================================================
-- Migration: 20261025_link_specialists_to_branches_and_booking_modes.sql
-- Description:
-- 1. Ensure store_specialists table exists with branch_id and branch_name columns.
-- 2. Explicitly alter store_specialists to support branch_id and branch_name as TEXT.
-- 3. Replace merchant_save_specialist RPC to explicitly persist and return branch_id
--    and branch_name directly in PostgreSQL, without stripping or dynamic schema lag.
-- 4. Set secure RLS policies on store_specialists for visitors, customers, and staff.
-- ==============================================================================

-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS public.store_specialists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    branch_id TEXT,
    branch_name TEXT,
    name TEXT NOT NULL,
    specialty TEXT,
    phone TEXT,
    avatar_url TEXT,
    service_categories JSONB DEFAULT '["ALL"]'::jsonb,
    service_ids JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    working_days JSONB DEFAULT '["Sun", "Mon", "Tue", "Wed", "Thu", "Sat"]'::jsonb,
    working_hours JSONB DEFAULT '{"start": "10:00", "end": "22:00"}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure columns exist and have the correct TEXT types
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'store_specialists' 
          AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE public.store_specialists ADD COLUMN branch_id TEXT;
    ELSE
        ALTER TABLE public.store_specialists ALTER COLUMN branch_id TYPE TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'store_specialists' 
          AND column_name = 'branch_name'
    ) THEN
        ALTER TABLE public.store_specialists ADD COLUMN branch_name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'store_specialists' 
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.store_specialists ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- 3. Fast lookup indices
CREATE INDEX IF NOT EXISTS idx_store_specialists_store_id ON public.store_specialists(store_id);
CREATE INDEX IF NOT EXISTS idx_store_specialists_branch_id ON public.store_specialists(branch_id);
CREATE INDEX IF NOT EXISTS idx_store_specialists_store_branch ON public.store_specialists(store_id, branch_id);

-- 4. Dedicated RPC function for saving specialists with explicit branch binding
CREATE OR REPLACE FUNCTION public.merchant_save_specialist(p_token TEXT, p_item_id TEXT, p_item JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_res JSONB;
    v_branch_id TEXT;
    v_branch_name TEXT;
BEGIN
    -- Validate staff authorization
    SELECT * INTO v_sess FROM public._staff_session(p_token, true);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
            'message', 'انتهت جلسة الدخول أو لا تملك الصلاحية. سجّل الدخول مرة أخرى');
    END IF;

    IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'البيانات المدخلة غير صحيحة');
    END IF;

    v_branch_id := NULLIF(trim(p_item->>'branch_id'), '');
    v_branch_name := NULLIF(trim(p_item->>'branch_name'), '');

    IF p_item_id IS NOT NULL AND trim(p_item_id) <> '' THEN
        -- UPDATE existing specialist with explicit branch_id & branch_name
        UPDATE public.store_specialists t
        SET
            name = COALESCE(NULLIF(trim(p_item->>'name'), ''), t.name),
            specialty = CASE WHEN p_item ? 'specialty' THEN NULLIF(trim(p_item->>'specialty'), '') ELSE t.specialty END,
            branch_id = CASE WHEN p_item ? 'branch_id' THEN v_branch_id ELSE t.branch_id END,
            branch_name = CASE WHEN p_item ? 'branch_name' THEN v_branch_name ELSE t.branch_name END,
            phone = CASE WHEN p_item ? 'phone' THEN NULLIF(trim(p_item->>'phone'), '') ELSE t.phone END,
            avatar_url = CASE WHEN p_item ? 'avatar_url' THEN NULLIF(trim(p_item->>'avatar_url'), '') ELSE t.avatar_url END,
            service_categories = CASE WHEN p_item ? 'service_categories' THEN p_item->'service_categories' ELSE t.service_categories END,
            service_ids = CASE WHEN p_item ? 'service_ids' THEN p_item->'service_ids' ELSE t.service_ids END,
            is_active = CASE WHEN p_item ? 'is_active' THEN (p_item->>'is_active')::boolean ELSE t.is_active END,
            working_days = CASE WHEN p_item ? 'working_days' THEN p_item->'working_days' ELSE t.working_days END,
            working_hours = CASE WHEN p_item ? 'working_hours' THEN p_item->'working_hours' ELSE t.working_hours END,
            updated_at = NOW()
        WHERE t.id::text = trim(p_item_id) AND t.store_id = v_sess.store_id
        RETURNING to_jsonb(t.*) INTO v_res;

        IF v_res IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'المختص غير موجود أو لا يتبع لهذا المتجر');
        END IF;
    ELSE
        -- INSERT new specialist with explicit branch_id & branch_name
        INSERT INTO public.store_specialists AS t (
            store_id,
            branch_id,
            branch_name,
            name,
            specialty,
            phone,
            avatar_url,
            service_categories,
            service_ids,
            is_active,
            working_days,
            working_hours,
            created_at,
            updated_at
        ) VALUES (
            v_sess.store_id,
            v_branch_id,
            v_branch_name,
            COALESCE(NULLIF(trim(p_item->>'name'), ''), 'مقدم خدمة جديد'),
            NULLIF(trim(p_item->>'specialty'), ''),
            NULLIF(trim(p_item->>'phone'), ''),
            NULLIF(trim(p_item->>'avatar_url'), ''),
            COALESCE(p_item->'service_categories', '["ALL"]'::jsonb),
            COALESCE(p_item->'service_ids', '[]'::jsonb),
            COALESCE((p_item->>'is_active')::boolean, true),
            COALESCE(p_item->'working_days', '["Sun", "Mon", "Tue", "Wed", "Thu", "Sat"]'::jsonb),
            COALESCE(p_item->'working_hours', '{"start": "10:00", "end": "22:00"}'::jsonb),
            NOW(),
            NOW()
        )
        RETURNING to_jsonb(t.*) INTO v_res;
    END IF;

    RETURN jsonb_build_object('success', true, 'item', v_res);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'SAVE_FAILED', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_save_specialist(text, text, jsonb) TO anon, authenticated, service_role;

-- 5. Dedicated RPC for deleting specialists
CREATE OR REPLACE FUNCTION public.merchant_delete_specialist(p_token TEXT, p_item_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sess RECORD;
    v_deleted INT;
BEGIN
    SELECT * INTO v_sess FROM public._staff_session(p_token, true);
    IF v_sess.store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'غير مصرح');
    END IF;

    DELETE FROM public.store_specialists
    WHERE id::text = trim(p_item_id) AND store_id = v_sess.store_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted', v_deleted > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_delete_specialist(text, text) TO anon, authenticated, service_role;

-- 6. Row Level Security Policies
ALTER TABLE public.store_specialists ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "store_specialists_select_policy" ON public.store_specialists;
    DROP POLICY IF EXISTS "store_specialists_insert_policy" ON public.store_specialists;
    DROP POLICY IF EXISTS "store_specialists_update_policy" ON public.store_specialists;
    DROP POLICY IF EXISTS "store_specialists_delete_policy" ON public.store_specialists;

    -- Allow customers, cashiers, and visitors to read specialists
    CREATE POLICY "store_specialists_select_policy"
    ON public.store_specialists FOR SELECT
    TO anon, authenticated, service_role
    USING (true);

    -- Allow service_role full control
    CREATE POLICY "store_specialists_insert_policy"
    ON public.store_specialists FOR INSERT
    TO service_role
    WITH CHECK (true);

    CREATE POLICY "store_specialists_update_policy"
    ON public.store_specialists FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

    CREATE POLICY "store_specialists_delete_policy"
    ON public.store_specialists FOR DELETE
    TO service_role
    USING (true);
END $$;

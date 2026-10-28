-- =========================================================================
-- 🔒 SUPABASE SECURITY ADVISOR FIX: ENABLE RLS ON public.staff_sessions
-- Eliminates the "RLS Disabled in Public" Error in Supabase Security Advisor.
-- =========================================================================

-- 1. Ensure table exists with proper schema
CREATE TABLE IF NOT EXISTS public.staff_sessions (
    token_hash TEXT PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create index on expires_at for fast session eviction
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON public.staff_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_store_staff ON public.staff_sessions(store_id, staff_id);

-- 3. ENABLE and FORCE Row Level Security (RLS)
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions FORCE ROW LEVEL SECURITY;

-- 4. Revoke direct table access from untrusted roles (Zero-Trust Security)
REVOKE ALL ON public.staff_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_sessions TO service_role;

-- 5. Strict RLS Policies: ONLY service_role can directly access
DROP POLICY IF EXISTS "staff_sessions_service_role" ON public.staff_sessions;
CREATE POLICY "staff_sessions_service_role" ON public.staff_sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Explicitly ensure anon/authenticated have zero read/write access via PostgREST
DROP POLICY IF EXISTS "staff_sessions_no_anon_read" ON public.staff_sessions;
DROP POLICY IF EXISTS "staff_sessions_no_anon_write" ON public.staff_sessions;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

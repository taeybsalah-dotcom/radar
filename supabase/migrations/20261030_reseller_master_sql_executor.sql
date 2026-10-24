-- ==============================================================================
-- 20261030_reseller_master_sql_executor.sql
-- Runs on EVERY Reseller Database.
-- Allows Master Control to securely execute batch SQL updates on reseller instances
-- remotely via PostgREST RPC, authenticated by the Sovereign Master Secret Token.
-- ==============================================================================

-- 1. Create or replace secure exec_master_sql RPC function
CREATE OR REPLACE FUNCTION public.exec_master_sql(
    p_sql TEXT,
    p_master_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_authenticated BOOLEAN := FALSE;
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_execution_ms NUMERIC;
BEGIN
    -- 1. التحقق الصارم من التوكن السيادي للمالك الأم عبر الهاش المشفر
    IF p_master_token IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.reseller_master_auth 
        WHERE master_token_hash = crypt(p_master_token, master_token_hash)
    ) THEN
        v_authenticated := TRUE;
    END IF;

    -- 2. السماح للـ service_role المباشر
    IF auth.role() = 'service_role' THEN
        v_authenticated := TRUE;
    END IF;

    -- 3. رفض فوري إذا فشل التحقق
    IF NOT v_authenticated THEN
        RAISE EXCEPTION 'Access Denied: Invalid Master Sovereign Token (401 Unauthorized)';
    END IF;

    -- 4. التحقق من سلامة نص الاستعلام
    IF TRIM(COALESCE(p_sql, '')) = '' THEN
        RAISE EXCEPTION 'SQL statement cannot be empty';
    END IF;

    -- 5. تنفيذ كود الـ SQL مباشرة
    EXECUTE p_sql;

    v_execution_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000)::numeric, 2);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'SQL script executed successfully by Sovereign Master Engine',
        'duration_ms', v_execution_ms,
        'executed_at', now()
    );

EXCEPTION WHEN OTHERS THEN
    v_execution_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000)::numeric, 2);
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', SQLSTATE,
        'duration_ms', v_execution_ms,
        'executed_at', now()
    );
END;
$$;

-- 2. Grant execution permissions so Master Control can call it via anon REST with token
GRANT EXECUTE ON FUNCTION public.exec_master_sql(TEXT, TEXT) TO anon, authenticated, service_role;

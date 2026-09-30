-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — STAGE 12C-HOTFIX MIGRATION
-- RPC SECURITY HARDENING: SUPER ADMIN SERVER-SIDE AUTHORIZATION GATE
-- Additive only. Zero table changes. Zero data mutations.
-- ==============================================================================

-- 1. Server-side single aggregation RPC for Super Admin with internal authorization
CREATE OR REPLACE FUNCTION public.get_super_admin_stores_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_jwt JSONB;
    v_is_super BOOLEAN := FALSE;
    v_result JSONB;
BEGIN
    -- 1. Determine caller identity from PostgreSQL / PostgREST session
    v_role := auth.role();

    -- Context A: service_role execution (Authorized backend / API / internal system context)
    IF v_role = 'service_role' OR current_user = 'service_role' THEN
        v_is_super := TRUE;
    ELSE
        -- Context B: Inspect Supabase Auth JWT claims
        v_jwt := auth.jwt();
        IF v_jwt IS NOT NULL THEN
            IF (v_jwt -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin')
               OR (v_jwt -> 'user_metadata' ->> 'is_super_admin')::boolean IS TRUE
               OR (v_jwt -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
            THEN
                v_is_super := TRUE;
            END IF;
        END IF;
    END IF;

    -- 2. Hard Security Gate: Reject all non-Super Admin callers
    IF NOT v_is_super THEN
        RAISE EXCEPTION 'Access denied: caller is not an authorized Super Admin'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Execute server-side aggregation ONLY for authorized Super Admin
    SELECT jsonb_build_object(
        'success', true,
        'stores', COALESCE(
            (
                SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
                FROM public.stores s
            ),
            '[]'::jsonb
        ),
        'analytics', COALESCE(
            (
                SELECT jsonb_object_agg(
                    agg.store_id,
                    jsonb_build_object(
                        'customerCount', agg.customer_count,
                        'totalSales', agg.total_sales,
                        'totalPoints', agg.total_points,
                        'staffCount', agg.staff_count
                    )
                )
                FROM (
                    SELECT 
                        s.id AS store_id,
                        COALESCE(c.cnt, 0)::int AS customer_count,
                        COALESCE(l.sales, 0)::numeric AS total_sales,
                        COALESCE(l.points, 0)::bigint AS total_points,
                        COALESCE(st.cnt, 0)::int AS staff_count
                    FROM public.stores s
                    LEFT JOIN (
                        SELECT store_id, COUNT(*) AS cnt 
                        FROM public.store_customers 
                        GROUP BY store_id
                    ) c ON c.store_id = s.id
                    LEFT JOIN (
                        SELECT 
                            store_id, 
                            SUM(purchase_amount) AS sales,
                            SUM(CASE WHEN points_changed > 0 THEN points_changed ELSE 0 END) AS points
                        FROM public.audit_logs 
                        GROUP BY store_id
                    ) l ON l.store_id = s.id
                    LEFT JOIN (
                        SELECT store_id, COUNT(*) AS cnt 
                        FROM public.store_staff 
                        GROUP BY store_id
                    ) st ON st.store_id = s.id
                ) agg
            ),
            '{}'::jsonb
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 4. HARDENED PERMISSIONS: Revoke execution from PUBLIC and anon
REVOKE ALL ON FUNCTION public.get_super_admin_stores_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_super_admin_stores_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_super_admin_stores_summary() FROM PUBLIC;

-- 5. Grant execution ONLY to authenticated callers (checked internally) and service_role
GRANT EXECUTE ON FUNCTION public.get_super_admin_stores_summary() TO authenticated, service_role;

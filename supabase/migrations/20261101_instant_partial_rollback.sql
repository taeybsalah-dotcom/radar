-- ==============================================================================
-- 🔄 AL-ATHAR CORE - BULLETPROOF ROLLBACK
-- File: 20261101_instant_partial_rollback.sql
-- Goal: 100% dynamic cleanup with ZERO static table references.
-- ==============================================================================

-- 1️⃣ حذف الدالة إن وُجدت
DROP FUNCTION IF EXISTS public.current_tenant_id() CASCADE;

-- 2️⃣ تنظيف ديناميكي شامل لكافة الفهارس والأعمدة
DO $$
DECLARE
    rec RECORD;
BEGIN
    -- أ) إسقاط كافة فهارس tenant_id الموجودة فعلياً
    FOR rec IN 
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' AND indexname LIKE 'idx_%_tenant_id'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I CASCADE;', rec.indexname);
    END LOOP;

    -- ب) إسقاط عمود tenant_id من أي جدول يوجد به هذا العمود فعلياً
    FOR rec IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND column_name = 'tenant_id'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS tenant_id CASCADE;', rec.table_name);
    END LOOP;
END $$;

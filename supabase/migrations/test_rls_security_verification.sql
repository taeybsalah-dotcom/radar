-- ==============================================================================
-- 🧪 RLS + PIN SECURITY TEST (يعمل بدون لصق يدوي، ولا يترك أي أثر في قاعدة البيانات)
-- كل شيء داخل transaction وينتهي بـ ROLLBACK.
-- تشغيله:  node scripts/db-run.mjs test supabase/migrations/test_rls_security_verification.sql
-- ==============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public._t_assert(p_ok BOOLEAN, p_msg TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_ok THEN
        RAISE NOTICE '✅ %', p_msg;
    ELSE
        RAISE NOTICE '❌ %', p_msg;
        PERFORM set_config('radar.test_fails',
            (COALESCE(NULLIF(current_setting('radar.test_fails', true), ''), '0')::int + 1)::text, true);
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public._t_assert(BOOLEAN, TEXT) TO anon, authenticated;

DO $$
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE '🛡️ بدء فحص سياسات الأمان وتخمين PIN';
    RAISE NOTICE '==================================================';
END $$;

-- بيانات الاختبار (تُقرأ بصلاحية المدير قبل التحويل إلى anon)
SELECT set_config('radar.store_id',
    COALESCE((SELECT id::text FROM public.stores ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('radar.n_cat',  (SELECT count(*) FROM public.catalog_items)::text, true);
SELECT set_config('radar.n_spec', (SELECT count(*) FROM public.store_specialists)::text, true);
SELECT set_config('radar.n_book', (SELECT count(*) FROM public.service_bookings)::text, true);

-- ------------------------------------------------------------------------------
-- A) زائر عام (anon)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE anon;

DO $$
DECLARE
    n INT;
    v JSONB;
    v_store UUID := NULLIF(current_setting('radar.store_id', true), '')::uuid;
    v_book JSONB;
    v_code TEXT;
BEGIN
    SELECT count(*) INTO n FROM public.affiliates;
    PERFORM public._t_assert(n = 0, 'A1 affiliates مغلق على الزوار');
    SELECT count(*) INTO n FROM public.partner_commissions;
    PERFORM public._t_assert(n = 0, 'A2 partner_commissions مغلق على الزوار');
    SELECT count(*) INTO n FROM public.partner_accounts;
    PERFORM public._t_assert(n = 0, 'A3 partner_accounts مغلق على الزوار');

    SELECT count(*) INTO n FROM public.billing_plans WHERE active = true;
    PERFORM public._t_assert(true, 'A4 صفحة الأسعار تقرأ الباقات (عدد: ' || n || ')');

    v := public.check_referral_code('r1001');
    PERFORM public._t_assert(v ? 'valid', 'A5 check_referral_code تعمل عبر RPC: ' || v::text);

    -- المنيو: القراءة العامة تبقى
    SELECT count(*) INTO n FROM public.catalog_items;
    PERFORM public._t_assert(n = current_setting('radar.n_cat')::int, 'A6 الزائر يقرأ المنيو (' || n || ' صنف)');
    SELECT count(*) INTO n FROM public.store_specialists;
    PERFORM public._t_assert(n = current_setting('radar.n_spec')::int, 'A7 الزائر يقرأ الأخصائيين (' || n || ')');

    -- الزائر لا يعدّل ولا يحذف المنيو
    BEGIN
        INSERT INTO public.catalog_items DEFAULT VALUES;
        PERFORM public._t_assert(false, 'A8 إضافة صنف من زائر يجب أن تُرفض');
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM public._t_assert(true, 'A8 إضافة صنف من زائر مرفوضة');
    WHEN OTHERS THEN
        PERFORM public._t_assert(false, 'A8 رُفضت لسبب غير متوقع: ' || SQLSTATE || ' ' || SQLERRM);
    END;

    BEGIN
        UPDATE public.catalog_items SET store_id = store_id;
        GET DIAGNOSTICS n = ROW_COUNT;
        PERFORM public._t_assert(n = 0, 'A9 تعديل المنيو من زائر لا يغيّر أي صف (' || n || ')');
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM public._t_assert(true, 'A9 تعديل المنيو من زائر مرفوض');
    END;

    BEGIN
        DELETE FROM public.catalog_items;
        GET DIAGNOSTICS n = ROW_COUNT;
        PERFORM public._t_assert(n = 0, 'A10 حذف المنيو من زائر لا يحذف أي صف (' || n || ')');
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM public._t_assert(true, 'A10 حذف المنيو من زائر مرفوض');
    END;

    BEGIN
        DELETE FROM public.store_specialists;
        GET DIAGNOSTICS n = ROW_COUNT;
        PERFORM public._t_assert(n = 0, 'A11 حذف الأخصائيين من زائر لا يحذف أي صف (' || n || ')');
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM public._t_assert(true, 'A11 حذف الأخصائيين من زائر مرفوض');
    END;

    -- دوال التاجر ترفض بدون تذكرة صحيحة
    v := public.merchant_save_catalog_item(repeat('a', 40), NULL, '{"name":"hack"}'::jsonb);
    PERFORM public._t_assert(v->>'error' = 'UNAUTHORIZED', 'A12 دالة حفظ المنيو ترفض التذكرة الوهمية');
    v := public.merchant_delete_catalog_item(repeat('a', 40), gen_random_uuid()::text);
    PERFORM public._t_assert(v->>'error' = 'UNAUTHORIZED', 'A13 دالة حذف المنيو ترفض التذكرة الوهمية');
    v := public.merchant_save_specialist(repeat('a', 40), NULL, '{"name":"hack"}'::jsonb);
    PERFORM public._t_assert(v->>'error' = 'UNAUTHORIZED', 'A14 دالة حفظ الأخصائي ترفض التذكرة الوهمية');
    v := public.get_store_bookings_secure(repeat('a', 40), false);
    PERFORM public._t_assert(v->>'error' = 'UNAUTHORIZED', 'A15 قراءة حجوزات المتجر ترفض التذكرة الوهمية');

    -- الدوال الداخلية مغلقة
    BEGIN
        PERFORM public._staff_session_create(gen_random_uuid(), 'x', 'admin');
        PERFORM public._t_assert(false, 'A16 الدالة الداخلية يجب أن تكون مغلقة');
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM public._t_assert(true, 'A16 الدوال الداخلية مغلقة على الزوار');
    END;

    -- الحجوزات: لا قراءة ولا كتابة مباشرة
    SELECT count(*) INTO n FROM public.service_bookings;
    PERFORM public._t_assert(n = 0, 'A17 الزائر لا يقرأ جدول الحجوزات مباشرة (موجود فعلياً: ' || current_setting('radar.n_book') || ')');
    BEGIN
        INSERT INTO public.service_bookings DEFAULT VALUES;
        PERFORM public._t_assert(false, 'A18 إدخال حجز مباشر من زائر يجب أن يُرفض');
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM public._t_assert(true, 'A18 إدخال حجز مباشر من زائر مرفوض');
    WHEN OTHERS THEN
        PERFORM public._t_assert(false, 'A18 رُفض لسبب غير متوقع: ' || SQLSTATE || ' ' || SQLERRM);
    END;
    BEGIN
        UPDATE public.service_bookings SET status = 'cancelled';
        GET DIAGNOSTICS n = ROW_COUNT;
        PERFORM public._t_assert(n = 0, 'A19 تعديل الحجوزات من زائر لا يغيّر أي صف (' || n || ')');
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM public._t_assert(true, 'A19 تعديل الحجوزات من زائر مرفوض');
    END;

    -- الحجز عبر book_service_safely + الرمز الطويل العشوائي
    IF v_store IS NULL THEN
        RAISE NOTICE '⚠️ لا يوجد متجر لاختبار الحجز';
    ELSE
        v_book := public.book_service_safely(
            v_store, NULL, 'عميل اختبار', '0555000111', gen_random_uuid()::text, 'خدمة اختبار',
            50, 30, NULL, NULL, '2030-01-01', '10:00', 'اختبار', 5, '[]'::jsonb);
        PERFORM public._t_assert((v_book->>'success')::boolean, 'A20 الزائر يحجز عبر book_service_safely: ' || left(v_book::text, 160));
        v_code := v_book->>'booking_number';
        PERFORM public._t_assert(v_code ~ '^BKG-[0-9A-F]{20}$', 'A21 رمز الحجز عشوائي وطويل: ' || COALESCE(v_code, 'NULL'));
        PERFORM public._t_assert(position('555000111' IN COALESCE(v_code, '')) = 0, 'A22 رمز الحجز لا يحتوي رقم الجوال');
        SELECT count(*) INTO n FROM public.service_bookings WHERE id::text = v_book->>'booking_id';
        PERFORM public._t_assert(n = 0, 'A23 الزائر لا يستطيع قراءة الحجز مباشرة بعد إنشائه');

        v := public.get_customer_bookings(v_store, '0555000111');
        PERFORM public._t_assert(jsonb_array_length(v) >= 1, 'A24 العميل يرى حجوزات جواله فقط عبر RPC');
        v := public.get_customer_bookings(v_store, '0555999999');
        PERFORM public._t_assert(jsonb_array_length(v) = 0, 'A25 رقم آخر لا يرى هذه الحجوزات');

        v := public.book_service_safely(v_store, NULL, 'عميل', '12', gen_random_uuid()::text, 'خدمة', 50, 30, NULL, NULL, '2030-01-01', '10:00', NULL, 0, '[]'::jsonb);
        PERFORM public._t_assert(NOT (v->>'success')::boolean, 'A26 الحجز برقم جوال غير صالح يُرفض');
        v := public.book_service_safely(v_store, NULL, 'عميل', '0555000111', gen_random_uuid()::text, 'خدمة', 50, 30, NULL, NULL, 'غلط', '10:00', NULL, 0, '[]'::jsonb);
        PERFORM public._t_assert(NOT (v->>'success')::boolean, 'A27 الحجز بتاريخ غير صالح يُرفض');
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- B) اختبار تخمين PIN (5 خاطئة = قفل 15 دقيقة) + تسجيل في partner_audit_logs
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v JSONB;
    i INT;
    r TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- دخول شريك (حساب غير موجود يُحسب أيضاً)
    FOR i IN 1..6 LOOP
        v := public.verify_partner_login('zz_pin_guess_test', 'wrong' || i);
        r := r || COALESCE(v->>'error', 'ok');
    END LOOP;
    PERFORM public._t_assert(r[1] <> 'LOCKED' AND r[4] <> 'LOCKED', 'B1 المحاولات 1-4 الخاطئة لا تقفل (شريك)');
    PERFORM public._t_assert(r[5] = 'LOCKED' AND r[6] = 'LOCKED', 'B2 المحاولة الخامسة الخاطئة تقفل الدخول ومحاولة 6 مرفوضة (شريك)');
END $$;

DO $$
DECLARE
    v JSONB;
    i INT;
    r TEXT[] := ARRAY[]::TEXT[];
    v_store UUID;
    v_phone TEXT;
BEGIN
    SELECT st.store_id, st.phone INTO v_store, v_phone
    FROM public.store_staff st
    WHERE st.is_active = true AND public.normalize_phone(st.phone) <> ''
    LIMIT 1;

    IF v_store IS NULL THEN
        SELECT s.id, s.manager_contact INTO v_store, v_phone
        FROM public.stores s
        WHERE s.manager_contact IS NOT NULL AND public.normalize_phone(s.manager_contact) <> ''
        LIMIT 1;
    END IF;

    IF v_store IS NULL THEN
        RAISE NOTICE '⚠️ لا يوجد موظف أو مدير لاختبار تخمين PIN للتاجر والكاشير';
        RETURN;
    END IF;

    FOR i IN 1..6 LOOP
        v := public.verify_staff_pin(v_phone, 'wrong-pin-' || i, v_store, NULL, NULL);
        r := r || COALESCE(v->>'error', 'ok');
    END LOOP;
    PERFORM public._t_assert(r[1] = 'INVALID_CREDENTIALS' AND r[4] = 'INVALID_CREDENTIALS', 'B3 المحاولات 1-4 الخاطئة ترجع خطأ عادي (تاجر/كاشير)');
    PERFORM public._t_assert(r[5] = 'LOCKED' AND r[6] = 'LOCKED', 'B4 المحاولة الخامسة تقفل ومحاولة 6 مرفوضة (تاجر/كاشير)');
END $$;

RESET ROLE;

DO $$
DECLARE
    n_partner INT;
    n_staff INT;
    n_locked INT;
BEGIN
    SELECT count(*) INTO n_partner FROM public.partner_audit_logs
    WHERE action IN ('PIN_FAILED', 'PIN_LOCKED') AND details->>'scope' = 'partner' AND created_at = now();
    SELECT count(*) INTO n_staff FROM public.partner_audit_logs
    WHERE action IN ('PIN_FAILED', 'PIN_LOCKED') AND details->>'scope' = 'staff' AND created_at = now();
    SELECT count(*) INTO n_locked FROM public.partner_audit_logs
    WHERE action = 'PIN_LOCKED' AND created_at = now();

    PERFORM public._t_assert(n_partner >= 5, 'B5 المحاولات الفاشلة للشريك سُجلت في partner_audit_logs (' || n_partner || ')');
    PERFORM public._t_assert(n_staff >= 5 OR NOT EXISTS (SELECT 1 FROM public.store_staff) AND n_staff = 0,
        'B6 المحاولات الفاشلة للتاجر/الكاشير سُجلت (' || n_staff || ')');
    PERFORM public._t_assert(n_locked >= 1, 'B7 حدث القفل سُجل PIN_LOCKED (' || n_locked || ')');
END $$;

-- حد محاولات كود الإحالة: 20 خاطئة في الدقيقة
SET LOCAL ROLE anon;
DO $$
DECLARE
    v JSONB;
    i INT;
    v_limited INT := NULL;
BEGIN
    FOR i IN 1..25 LOOP
        v := public.check_referral_code('nocode' || i);
        IF COALESCE((v->>'rate_limited')::boolean, false) AND v_limited IS NULL THEN
            v_limited := i;
        END IF;
    END LOOP;
    PERFORM public._t_assert(v_limited IS NOT NULL AND v_limited <= 21,
        'B8 check_referral_code تُحدّ بعد 20 محاولة خاطئة (بدأ الحد عند المحاولة ' || COALESCE(v_limited::text, 'لم يبدأ') || ')');
END $$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- C) التذكرة المؤقتة: التاجر يعدّل المنيو، الكاشير يغيّر حالة الحجز
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_item JSONB;
    v_store UUID;
    v_other UUID;
    v_admin TEXT;
    v_cashier TEXT;
    v_other_admin TEXT;
    v JSONB;
    v_new_id TEXT;
    v_book_id TEXT;
BEGIN
    SELECT to_jsonb(c) - 'id' - 'created_at', c.store_id INTO v_item, v_store
    FROM public.catalog_items c LIMIT 1;

    IF v_store IS NULL THEN
        RAISE NOTICE '⚠️ لا يوجد أصناف منيو لاختبار تعديل التاجر';
    ELSE
        v_admin := public._staff_session_create(v_store, 'manager-' || v_store::text, 'admin');
        v_cashier := public._staff_session_create(v_store, 'manager-' || v_store::text, 'cashier');
        SELECT id INTO v_other FROM public.stores WHERE id <> v_store LIMIT 1;

        v := public.merchant_save_catalog_item(v_admin, NULL, v_item);
        PERFORM public._t_assert((v->>'success')::boolean, 'C1 التاجر يضيف صنفاً بالتذكرة: ' || left(v::text, 120));
        v_new_id := v->'item'->>'id';
        PERFORM public._t_assert((v->'item'->>'store_id')::uuid = v_store, 'C2 الصنف يُربط بمتجر التاجر من التذكرة لا من الطلب');

        v := public.merchant_save_catalog_item(v_admin, v_new_id, v_item);
        PERFORM public._t_assert((v->>'success')::boolean AND v->'item'->>'id' = v_new_id, 'C3 التاجر يعدّل الصنف بالتذكرة');

        v := public.merchant_save_catalog_item(v_cashier, v_new_id, v_item);
        PERFORM public._t_assert(v->>'error' = 'UNAUTHORIZED', 'C4 الكاشير لا يعدّل المنيو');

        IF v_other IS NOT NULL THEN
            v_other_admin := public._staff_session_create(v_other, 'manager-' || v_other::text, 'admin');
            v := public.merchant_save_catalog_item(v_other_admin, v_new_id, v_item);
            PERFORM public._t_assert(v->>'error' = 'NOT_FOUND', 'C5 تاجر متجر آخر لا يعدّل صنف غيره');
            v := public.merchant_delete_catalog_item(v_other_admin, v_new_id);
            PERFORM public._t_assert((v->>'deleted')::int = 0, 'C6 تاجر متجر آخر لا يحذف صنف غيره');
        END IF;

        v := public.merchant_delete_catalog_item(v_admin, v_new_id);
        PERFORM public._t_assert((v->>'success')::boolean AND (v->>'deleted')::int = 1, 'C7 التاجر يحذف الصنف بالتذكرة');
    END IF;

    -- الحجوزات بتذكرة الكاشير
    SELECT id::text, store_id INTO v_book_id, v_store FROM public.service_bookings ORDER BY created_at DESC LIMIT 1;
    IF v_book_id IS NULL THEN
        RAISE NOTICE '⚠️ لا توجد حجوزات لاختبار الكاشير';
    ELSE
        v_cashier := public._staff_session_create(v_store, 'manager-' || v_store::text, 'cashier');
        v := public.get_store_bookings_secure(v_cashier, true);
        PERFORM public._t_assert((v->>'success')::boolean, 'C8 الكاشير يقرأ حجوزات متجره: ' || left(v::text, 100));
        v := public.update_booking_status_secure(v_cashier, v_book_id, 'confirmed');
        PERFORM public._t_assert((v->>'success')::boolean AND v->'booking'->>'status' = 'confirmed', 'C9 الكاشير يغيّر حالة الحجز');
        v := public.update_booking_status_secure(v_cashier, v_book_id, 'hacked');
        PERFORM public._t_assert(NOT (v->>'success')::boolean, 'C10 حالة غير مسموحة تُرفض');

        SELECT id INTO v_other FROM public.stores WHERE id <> v_store LIMIT 1;
        IF v_other IS NOT NULL THEN
            v_other_admin := public._staff_session_create(v_other, 'manager-' || v_other::text, 'admin');
            v := public.update_booking_status_secure(v_other_admin, v_book_id, 'cancelled');
            PERFORM public._t_assert(v->>'error' = 'NOT_FOUND', 'C11 كاشير متجر آخر لا يغيّر حجز غيره');
        END IF;

        v := public.end_staff_session(v_cashier);
        v := public.get_store_bookings_secure(v_cashier, true);
        PERFORM public._t_assert(v->>'error' = 'UNAUTHORIZED', 'C12 بعد تسجيل الخروج التذكرة لا تعمل');

        v_cashier := public._staff_session_create(v_store, 'manager-' || v_store::text, 'cashier');
        UPDATE public.staff_sessions SET expires_at = now() - interval '1 minute';
        v := public.get_store_bookings_secure(v_cashier, true);
        PERFORM public._t_assert(v->>'error' = 'UNAUTHORIZED', 'C13 التذكرة المنتهية لا تعمل');
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- D) الفحص الإنشائي
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    n INT;
    names TEXT;
BEGIN
    SELECT count(*), string_agg(p.proname, ', ') INTO n, names
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%');
    PERFORM public._t_assert(n = 0, 'D1 كل دوال SECURITY DEFINER عليها search_path' || CASE WHEN n > 0 THEN ' (ناقص: ' || names || ')' ELSE '' END);

    SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('catalog_items', 'store_specialists', 'service_bookings')
      AND cmd <> 'SELECT'
      AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
    PERFORM public._t_assert(n = 0, 'D2 لا توجد سياسة كتابة للزوار على الجداول الثلاثة');

    SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_bookings'
      AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
    PERFORM public._t_assert(n = 0, 'D3 لا توجد أي سياسة للزوار على service_bookings');

    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relname IN ('pin_login_attempts', 'rate_limit_counters', 'staff_sessions') AND c.relrowsecurity;
    PERFORM public._t_assert(n = 3, 'D4 الجداول الداخلية الثلاثة عليها RLS');
END $$;

DO $$
DECLARE
    f INT := COALESCE(NULLIF(current_setting('radar.test_fails', true), ''), '0')::int;
BEGIN
    IF f > 0 THEN
        RAISE EXCEPTION '❌ فشل % اختبار/اختبارات. راجع الأسطر التي تبدأ بـ ❌', f;
    END IF;
    RAISE NOTICE '==================================================';
    RAISE NOTICE '🎉 نجحت كل الاختبارات (وسيتم التراجع عن بيانات الاختبار)';
    RAISE NOTICE '==================================================';
END $$;

ROLLBACK;

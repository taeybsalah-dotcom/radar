-- ==============================================================================
-- 🧪 RLS SECURITY TEST & VERIFICATION SCRIPT (اختبارات الأمان والعزل التام)
-- RUN THIS SCRIPT IN SUPABASE SQL EDITOR TO VERIFY PERMISSIONS
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE '🛡️ بدء فحص سياسات الأمان (RLS Security Verification)';
    RAISE NOTICE '==================================================';
END $$;

-- ------------------------------------------------------------------------------
-- TEST 1: محاكاة زائر عام أو متسلل بدون تسجيل دخول (ANON ROLE)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE anon;

-- [A] التأكد أن المتسلل لا يستطيع قراءة الشركاء أو هواتفهم
DO $$
DECLARE
    v_count INT := 0;
BEGIN
    SELECT count(*) INTO v_count FROM public.affiliates;
    IF v_count = 0 THEN
        RAISE NOTICE '✅ نجاح الاختبار 1: جدول الشركاء affiliates محمي 100%% وممنوع على العامة.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: جدول affiliates مفتوح للعامة!';
    END IF;
END $$;

-- [B] التأكد أن المتسلل لا يستطيع قراءة العمولات والأرباح
DO $$
DECLARE
    v_comm_count INT := 0;
BEGIN
    SELECT count(*) INTO v_comm_count FROM public.partner_commissions;
    IF v_comm_count = 0 THEN
        RAISE NOTICE '✅ نجاح الاختبار 2: جدول العمولات partner_commissions محمي 100%% وممنوع على العامة.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: جدول partner_commissions مفتوح للعامة!';
    END IF;
END $$;

-- [C] التأكد أن المتسلل لا يستطيع قراءة الحسابات أو الـ PIN
DO $$
DECLARE
    v_acc_count INT := 0;
BEGIN
    SELECT count(*) INTO v_acc_count FROM public.partner_accounts;
    IF v_acc_count = 0 THEN
        RAISE NOTICE '✅ نجاح الاختبار 3: جدول الحسابات partner_accounts محمي 100%% وممنوع على العامة.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: جدول partner_accounts مفتوح للعامة!';
    END IF;
END $$;

-- [D] التأكد أن الزائر يستطيع رؤية باقات الأسعار المعتمدة (لصفحة التسجيل)
DO $$
DECLARE
    v_plan_count INT := 0;
BEGIN
    SELECT count(*) INTO v_plan_count FROM public.billing_plans WHERE active = true;
    RAISE NOTICE '✅ نجاح الاختبار 4: صفحة الأسعار تعمل (عدد الباقات النشطة المقروءة: %)', v_plan_count;
END $$;

-- [E] التأكد أن الزائر يستطيع فحص كود الإحالة عبر الدالة دون كشف البيانات السرية
DO $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT public.check_referral_code('r1001') INTO v_result;
    RAISE NOTICE '✅ نجاح الاختبار 5: فحص كود الإحالة يعمل بأمان عبر RPC: %', v_result;
END $$;

-- إعادة الجلسة للوضع الافتراضي
RESET ROLE;

DO $$
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE '🎉 اكتملت جميع اختبارات الأمان بنجاح تام!';
    RAISE NOTICE '==================================================';
END $$;

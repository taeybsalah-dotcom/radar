# 🛡️ وثيقة تسليم التأمين الشامل لمنصة رادار (Security Hardening Handover)

> **ملاحظة للموديل القادم:**
> صاحب المنصة (أبو صلاح) غير مبرمج. المطلوب منك تنفيذ خطة التقفيل الأمني أدناه بالكامل في قاعدة البيانات (`Supabase`) والكود (`Frontend`)، ثم رفع التعديلات لقاعدة البيانات عبر `scripts/db-run.mjs` (أو الـ SQL Migration) ونشر الموقع عبر `npm run build` و `npx wrangler deploy` دون كسر أي ميزة حالية في بوابات (العميل، الكاشير، التاجر، السائق، المطبخ، وشركاء النجاح).

---

## 🔍 1. نتائج الفحص الأمني الحي (ما تم اكتشافه فعلياً)

تم فحص قاعدة البيانات الحية (`https://zagpvflyizbmzsbmhnts.supabase.co`) باستخدام المفتاح العام `PROD_SUPABASE_ANON_KEY`، وتبين الآتي:

### أ) الأشياء المؤمّنة حالياً (لا تلمسها ولا تخربها):
1. **حساب مالك المنصة (`super_admin`)**: مؤمّن عبر Supabase Auth + دالة `verify_super_admin_session` في `src/context/AuthContext.tsx` (السطر 43-47).
2. **مفتاح الذكاء الاصطناعي (`GEMINI_API_KEY`)**: محفوظ بأمان في Cloudflare Worker Secrets (`worker/index.ts`).
3. **نظام قفل المحاولات الخاطئة (`pin_login_attempts`) وجلسات الموظفين (`staff_sessions`)**: موجود ويعمل في `supabase/migrations/20261012_sec04_pin_limits_secure_writes.sql`، والجداول نفسها محجوبة عن `anon` (تُرجع `401 permission denied`).

---

### ب) الثغرات المكتشفة المطلوب إغلاقها فوراً:

#### 🚨 الثغرة 1: كشف الأرقام السرية (PINs) والتوكنات عند الاستعلام المباشر عبر REST API (`anon`)
1. **جدول `public.store_staff`**:
   - السياسة الحالية في `supabase/migrations/20261021_master_rls_hardening_zero_vulnerabilities.sql` تسمح بـ `SELECT` للـ `anon` على كامل الأعمدة.
   - عند إضافة موظف جديد أو تعديله من لوحة التاجر (`createStoreStaff` / `updateStoreStaff` في `src/lib/supabase.ts`)، يتم حفظ `pin_code` كنص عادي (مثل `'9999'`) بدلاً من تشفيره بـ Bcrypt!
   - حتى الأرقام المشفرة بـ Bcrypt (`$2a$08$...`) تظهر للـ `anon` عند طلب `?select=pin_code`، وبما أنها 4 أرقام فقط فيمكن كسر الهاش خارجياً في أجزاء من الثانية.
   - يوجد أيضاً عمود قديم `pin_code_backup` في `store_staff` و `admin_pin_backup` في `stores`.

2. **جدول `public.store_drivers` (مناديب التوصيل)**:
   - في `supabase/migrations/20261022_inventory_and_drivers_cloud_sync.sql` و `src/lib/driverService.ts` (السطر 292)، يتم حفظ `pin_code` كنص صريح (`'1234'`, `'2222'`)، ويتم جلبه بـ `.from('store_drivers').select('*')` وفحصه داخل المتصفح.

3. **جدول `public.affiliates` و `public.partner_accounts` (شركاء النجاح)**:
   - في `src/lib/supabase.ts` (الأسطر 8803-8804، 8913، 9157)، يتم كتابة الـ PIN كنص صريح داخل حقل `affiliates.notes` بصيغة `"PIN: 1234"`، وحفظه في `localStorage` (`radar_partner_pins`).

4. **جدول `public.store_wallets`**:
   - العمود الحساس `meta_access_token` (توكن واتساب الرسمي) مكشوف للقراءة عبر `SELECT` لـ `anon`.

---

#### 🚨 الثغرة 2: صلاحيات التعديل والكتابة (`INSERT / UPDATE / DELETE`) المفتوحة لـ `anon`
- في `supabase/migrations/20261021_master_rls_hardening_zero_vulnerabilities.sql`، تم فتح سياسات `INSERT / UPDATE / DELETE` لـ `anon` بـ `USING (true) WITH CHECK (true)` على جداول حساسة مثل:
  - `stores`, `store_branches`, `catalog_items`, `tiers`, `privileges`, `store_customers`, `customer_coupons`, `store_staff`, `store_wallets`, `store_inventory`, `store_drivers`.
- هذا يسمح لأي شخص يسحب `PROD_SUPABASE_ANON_KEY` من المتصفح أن يرسل طلب REST مباشر لتعديل رصيد نقاط عميل (`wallet_balance`) أو تغيير أسعار المنيو أو حذف موظفين من خارج الشاشة.

#### 🚨 الثغرة 3: التحقق من جلسة التاجر والكاشير في `src/context/AuthContext.tsx`
- في `src/context/AuthContext.tsx` (الأسطر 39-48)، يتم التحقق من جلسة `super_admin` عبر السيرفر، بينما دور `admin` (التاجر) و `cashier` يثق مباشرة في الكائن المحفوظ في `localStorage.getItem('radar_unified_auth_user')`.

---

## 🛠️ 2. خطة الحل الجذري والذكي (بدون كسر أي شاشة في المنصة)

### الخطوة 1: تشفير جميع الأرقام السرية تلقائياً في قاعدة البيانات + حجب قراءتها عن `anon`
1. **إنشاء Trigger تلقائي للتشفير (`auto_hash_pin_code_trg`)**:
   - يعمل `BEFORE INSERT OR UPDATE OF pin_code` على الجداول: `public.store_staff`, `public.store_drivers`, `public.partner_accounts` (وكذلك `admin_pin` على `public.stores`).
   - إذا كان `NEW.pin_code IS NOT NULL AND NEW.pin_code <> '' AND NEW.pin_code NOT LIKE '$2%'`، يقوم تلقائياً بتحويله إلى `extensions.crypt(trim(NEW.pin_code), extensions.gen_salt('bf', 8))`.
   - تشغيل `UPDATE` لمرة واحدة لتشفير جميع الأرقام السرية الحالية غير المشفرة في `store_staff` و `store_drivers` و `partner_accounts`.
2. **حذف الأعمدة الاحتياطية القديمة وتنظيف الملاحظات**:
   - حذف `pin_code_backup` من `store_staff` و `admin_pin_backup` من `stores` (أو تفريغها `SET = NULL`).
   - تنظيف `affiliates.notes` من أي نص يحتوي على `PIN:`.
3. **منع قراءة أعمدة الباسوردات والتوكنات من الخارج (`Column-Level Security`)**:
   - في PostgreSQL، بدلاً من السماح لـ `anon` بقراءة كل الأعمدة (`SELECT *`) على `store_staff` و `store_drivers` و `partner_accounts` و `store_wallets`:
   - إما تنفيذ `REVOKE SELECT ON public.store_staff FROM anon, authenticated;` ثم `GRANT SELECT (id, store_id, user_id, name, role, is_active, created_at, updated_at, phone, can_manual_input_phone, telegram_chat_id, branch_id, assigned_branch_ids) ON public.store_staff TO anon, authenticated;` (استثناء `pin_code` و `pin_code_backup`!).
   - وبالمثل على `public.store_drivers`: منح `SELECT` لجميع الأعمدة **ما عدا `pin_code`**، وتحديث `src/lib/driverService.ts` ليحدد الأعمدة الآمنة بدلاً من `.select('*')`.
   - وبالمثل على `public.store_wallets`: منح `SELECT` لجميع الأعمدة **ما عدا `meta_access_token`**.
   - إنشاء دالة `public.verify_driver_pin(p_store_id UUID, p_driver_id TEXT, p_pin TEXT)` (`SECURITY DEFINER`) لفحص رقم السائق السري داخل السيرفر مع حماية قفل المحاولات (`_pin_lock_seconds`) بدلاً من فحصه في المتصفح داخل `src/lib/driverService.ts`.

### الخطوة 2: تأمين عمليات الكتابة والتعديل (`RLS Write Protection`) بطريقة ذكية وسلسة
بما أن التاجر والكاشير يسجلون الدخول عبر `verify_staff_pin` الذي يُرجع `session_token` محفوظ في `localStorage.getItem('radar_staff_session_token')`:
1. **في `src/lib/supabase.ts`**:
   - تخصيص `global.headers` أو `accessToken` / custom `fetch` في عميل `supabase` لإرسال الهيدر `x-staff-token: localStorage.getItem('radar_staff_session_token') || ''` تلقائياً مع كل طلب يخرج من المتصفح!
2. **في قاعدة البيانات (`PostgreSQL`)**:
   - إنشاء دالة مساعدة سريعة جداً:
     ```sql
     CREATE OR REPLACE FUNCTION public.has_valid_staff_access(p_store_id UUID, p_require_admin BOOLEAN DEFAULT FALSE)
     RETURNS BOOLEAN
     LANGUAGE plpgsql
     STABLE
     SECURITY DEFINER
     SET search_path = public, extensions
     AS $$
     DECLARE
         v_token TEXT;
         v_sess RECORD;
     BEGIN
         -- 1. السوبر أدمن مسموح له دائماً
         IF public.is_super_admin() THEN
             RETURN TRUE;
         END IF;

         -- 2. قراءة التوكن من الهيدر المرسل من المتصفح
         v_token := current_setting('request.headers', true)::json->>'x-staff-token';
         IF v_token IS NULL OR v_token = '' THEN
             RETURN FALSE;
         END IF;

         SELECT * INTO v_sess FROM public._staff_session(v_token, p_require_admin);
         IF v_sess.store_id IS NULL THEN
             RETURN FALSE;
         END IF;

         RETURN (p_store_id IS NULL OR v_sess.store_id = p_store_id);
     END;
     $$;
     ```
   - التأكد من أن `verify_staff_pin` يُصدر دائماً `session_token` عند دخول المدير (`admin`) أو الكاشير (`cashier`)، وأن `src/components/auth/UnifiedLogin.tsx` يحفظ `radar_staff_session_token` في `localStorage`.
   - إنشاء دالة `verify_staff_session_token(p_token TEXT)` لاستدعائها في `src/context/AuthContext.tsx` عند بداية تشغيل التطبيق للتحقق من أن جلسة التاجر أو الكاشير حقيقية وليست مزورة في `localStorage`.
   - ربط سياسات التعديل والحذف (`UPDATE / DELETE`) على الجداول الإدارية (`stores`, `store_staff`, `catalog_items`, `tiers`, `privileges`, `store_branches`) بشرط `public.has_valid_staff_access(store_id, false)`!

---

## 🚀 3. خطوات التحقق بعد التنفيذ
1. تشغيل فحص `anon` للتأكد من أن طلب `store_staff?select=pin_code` أو `store_drivers?select=pin_code` أو `store_wallets?select=meta_access_token` يُرفض فوراً (`401 / permission denied`).
2. التأكد من أن جميع الأرقام السرية في قاعدة البيانات مشفرة بـ `$2a$/$2b$`.
3. اختبار تسجيل دخول التاجر، الكاشير، السائق، والعميل، ثم تشغيل `npm run build` و `npx wrangler deploy`.

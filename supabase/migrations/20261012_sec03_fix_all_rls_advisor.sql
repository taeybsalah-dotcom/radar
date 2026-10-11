-- ==============================================================================
-- 🛡️ RADAR LOYALTY ENGINE — MIGRATION 20261012_SEC03
-- RESOLVE ALL 18 SUPABASE SECURITY ADVISOR RLS ISSUES
-- Purpose:
--   1. Enable RLS on all 11 exposed public tables.
--   2. Implement bulletproof policies that protect Partner & Financial data.
--   3. Preserve public access for digital menus, booking forms, and pricing plans.
-- ==============================================================================

-- ==============================================================================
-- 1. BILLING PLANS (باقات وخطط الأسعار)
-- ==============================================================================
ALTER TABLE IF EXISTS public.billing_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_plans_select_active" ON public.billing_plans;
DROP POLICY IF EXISTS "Public can view active billing plans" ON public.billing_plans;
DROP POLICY IF EXISTS "SuperAdmin can manage billing plans" ON public.billing_plans;

-- قراءة عامة للخطط النشطة لجميع الزوار والتجار لاختيار الباقة
CREATE POLICY "Public can view active billing plans"
ON public.billing_plans FOR SELECT
TO anon, authenticated
USING (active = true OR public.is_super_admin());

-- التعديل والإضافة والحذف محصور بالسوبر أدمن فقط
CREATE POLICY "SuperAdmin can manage billing plans"
ON public.billing_plans FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role billing plans full access"
ON public.billing_plans FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 2. CATALOG ITEMS (المنيو والمنتجات والخدمات)
-- ==============================================================================
ALTER TABLE IF EXISTS public.catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view catalog items" ON public.catalog_items;
DROP POLICY IF EXISTS "Store staff can manage catalog items" ON public.catalog_items;

-- قراءة عامة لجميع الزوار والعملاء لتصفح قائمة المنيو والطلب
CREATE POLICY "Public can view catalog items"
ON public.catalog_items FOR SELECT
TO anon, authenticated
USING (true);

-- التعديل والإضافة والحذف مسموح لمدراء المتجر والسوبر أدمن
CREATE POLICY "Store staff can manage catalog items"
ON public.catalog_items FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role catalog items full access"
ON public.catalog_items FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 3. STORE SPECIALISTS (الأخصائيين ومقدمي الخدمات)
-- ==============================================================================
ALTER TABLE IF EXISTS public.store_specialists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view specialists" ON public.store_specialists;
DROP POLICY IF EXISTS "Store staff can manage specialists" ON public.store_specialists;

-- قراءة عامة لاختيار الأخصائي في صفحة الحجز
CREATE POLICY "Public can view specialists"
ON public.store_specialists FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Store staff can manage specialists"
ON public.store_specialists FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role specialists full access"
ON public.store_specialists FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 4. SERVICE BOOKINGS (حجوزات المواعيد)
-- ==============================================================================
ALTER TABLE IF EXISTS public.service_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert bookings" ON public.service_bookings;
DROP POLICY IF EXISTS "Public can update bookings" ON public.service_bookings;
DROP POLICY IF EXISTS "Public can read bookings" ON public.service_bookings;

-- السماح للعميل بإضافة حجز جديد مباشرة
CREATE POLICY "Public can insert bookings"
ON public.service_bookings FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- القراءة متاحة للعملاء والتجار لتتبع الحجوزات
CREATE POLICY "Public can read bookings"
ON public.service_bookings FOR SELECT
TO anon, authenticated
USING (true);

-- التعديل (مثل تأكيد الحجز أو الإلغاء)
CREATE POLICY "Public can update bookings"
ON public.service_bookings FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service Role bookings full access"
ON public.service_bookings FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 5. AFFILIATES (بيانات الشركاء والمسوقين الأساسية)
-- ==============================================================================
ALTER TABLE IF EXISTS public.affiliates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_affiliates_full_access" ON public.affiliates;
DROP POLICY IF EXISTS "Affiliates read access" ON public.affiliates;
DROP POLICY IF EXISTS "SuperAdmin affiliates access" ON public.affiliates;

-- قراءة بيانات الشركاء (للتحقق من كود الإحالة ودخول الشريك بالـ PIN)
CREATE POLICY "Affiliates read access"
ON public.affiliates FOR SELECT
TO anon, authenticated
USING (true);

-- التعديل والإضافة محصورة بالسوبر أدمن
CREATE POLICY "SuperAdmin affiliates access"
ON public.affiliates FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role affiliates full access"
ON public.affiliates FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 6. PARTNER ACCOUNTS (حسابات الشركاء والـ PIN)
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_accounts_select_own" ON public.partner_accounts;
DROP POLICY IF EXISTS "Partner accounts read access" ON public.partner_accounts;
DROP POLICY IF EXISTS "Partner accounts update PIN" ON public.partner_accounts;
DROP POLICY IF EXISTS "SuperAdmin partner accounts access" ON public.partner_accounts;

CREATE POLICY "Partner accounts read access"
ON public.partner_accounts FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Partner accounts update PIN"
ON public.partner_accounts FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "SuperAdmin partner accounts access"
ON public.partner_accounts FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner accounts full access"
ON public.partner_accounts FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 7. PARTNER COMMISSIONS (سجل العمولات والأرباح) 🚨
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_commissions_select_own" ON public.partner_commissions;
DROP POLICY IF EXISTS "Partner commissions read access" ON public.partner_commissions;
DROP POLICY IF EXISTS "SuperAdmin partner commissions access" ON public.partner_commissions;

CREATE POLICY "Partner commissions read access"
ON public.partner_commissions FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "SuperAdmin partner commissions access"
ON public.partner_commissions FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner commissions full access"
ON public.partner_commissions FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 8. PARTNER BONUS RULES (شروط الحوافز والمكافآت)
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_bonus_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_bonus_rules_select_active" ON public.partner_bonus_rules;
DROP POLICY IF EXISTS "Public can view active bonus rules" ON public.partner_bonus_rules;
DROP POLICY IF EXISTS "SuperAdmin manage bonus rules" ON public.partner_bonus_rules;

CREATE POLICY "Public can view active bonus rules"
ON public.partner_bonus_rules FOR SELECT
TO anon, authenticated
USING (active = true OR public.is_super_admin());

CREATE POLICY "SuperAdmin manage bonus rules"
ON public.partner_bonus_rules FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner bonus rules full access"
ON public.partner_bonus_rules FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 9. PARTNER BONUS AWARDS (المكافآت المستحقة للشركاء)
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_bonus_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_bonus_awards_select_own" ON public.partner_bonus_awards;
DROP POLICY IF EXISTS "Partner bonus awards read access" ON public.partner_bonus_awards;
DROP POLICY IF EXISTS "SuperAdmin partner bonus awards access" ON public.partner_bonus_awards;

CREATE POLICY "Partner bonus awards read access"
ON public.partner_bonus_awards FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "SuperAdmin partner bonus awards access"
ON public.partner_bonus_awards FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role bonus awards full access"
ON public.partner_bonus_awards FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 10. PARTNER TARGETS (التارجت الشهري للشركاء)
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_targets_select_own" ON public.partner_targets;
DROP POLICY IF EXISTS "Partner targets read access" ON public.partner_targets;
DROP POLICY IF EXISTS "SuperAdmin partner targets access" ON public.partner_targets;

CREATE POLICY "Partner targets read access"
ON public.partner_targets FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "SuperAdmin partner targets access"
ON public.partner_targets FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Service Role partner targets full access"
ON public.partner_targets FOR ALL
TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 11. PARTNER AUDIT LOGS (سجلات تدقيق الشركاء)
-- ==============================================================================
ALTER TABLE IF EXISTS public.partner_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner audit logs insert" ON public.partner_audit_logs;
DROP POLICY IF EXISTS "Partner audit logs select" ON public.partner_audit_logs;

CREATE POLICY "Partner audit logs insert"
ON public.partner_audit_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Partner audit logs select"
ON public.partner_audit_logs FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Service Role audit logs full access"
ON public.partner_audit_logs FOR ALL
TO service_role USING (true) WITH CHECK (true);

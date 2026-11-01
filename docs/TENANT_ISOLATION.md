# دليل منظومة العزل السيادي للوكلاء (Al-Athar Core Tenant Isolation Guide)

> **المرجع الهندسي الدائم لمنصة الأثر السحابية (Al-Athar Core)**  
> **الإصدار:** 1.0 (معتمد بعد تدقيق الحارس الآلي Sentinel: 330/330 بنجاح تام 0 أخطاء)

---

## 🏛️ 1. المبادئ المعمارية الحاكمة
1. **قاعدة بيانات سحابية موحدة ومركزية واحدة** (`zagpvflyizbmzsbmhnts`) تخدم كافة الوكلاء (رادار، سديم الأثر، وأي وكيل قادم).
2. **عزل سيادي مشدد 100% (Row Level Security):** بيانات كل وكيل معزولة تماماً في كل جدول تشغيلي.
3. **منع التعديل والتحايل (Mutation Lock):** زناد `trg_lock_tenant_mutation` يمنع تعديل `tenant_id` لأي صف بعد إنشائه.
4. **صفر قيم افتراضية دائمة (Zero Permanent Defaults):** لا يوجد `DEFAULT 'radar'` أو غيره؛ أي إدخال بدون معرف وكيل محدد يفشل برمجياً فوراً.
5. **لوحة التحكم العليا السيادية (Master Control):** تعمل محلياً حصراً على `localhost:3001` وتتواصل عبر دوال `master_*` المحمية بالتوكن السيادي المشفر `SOVEREIGN_MASTER_TOKEN`.

---

## ➕ 2. كيف تضيف جدولاً تشغيلياً جديداً للمنصة؟
عند إضافة أي جدول تشغيلي جديد في ملفات الـ migrations، يجب تطبيق الخطوات الأربع التالية بالترتيب:

### الخطوة 1: تعريف العمود والقيد
```sql
ALTER TABLE public.new_operational_table 
ADD COLUMN tenant_id TEXT NOT NULL REFERENCES public.tenants(id);

CREATE INDEX idx_new_operational_table_tenant_id 
ON public.new_operational_table(tenant_id);
```

### الخطوة 2: تفعيل العزل الصارم (RLS)
```sql
ALTER TABLE public.new_operational_table ENABLE ROW LEVEL SECURITY;

-- قراءة وتعديل الوكيل لبياناته فقط
CREATE POLICY "tenant_isolation_select" ON public.new_operational_table
FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation_insert" ON public.new_operational_table
FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation_update" ON public.new_operational_table
FOR UPDATE TO authenticated
USING (tenant_id = public.current_tenant_id())
WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation_delete" ON public.new_operational_table
FOR DELETE TO authenticated
USING (tenant_id = public.current_tenant_id());

-- وصول service_role حصرياً للأعمال المركزية
CREATE POLICY "service_role_full_access" ON public.new_operational_table
FOR ALL TO service_role
USING (true)
WITH CHECK (true);
```

### الخطوة 3: تفعيل زناد قفل التلاعب
```sql
CREATE TRIGGER trg_lock_tenant_mutation
BEFORE UPDATE ON public.new_operational_table
FOR EACH ROW
EXECUTE FUNCTION public.lock_tenant_mutation();
```

### الخطوة 4: تسجيل الجدول في الحارس الآلي (`scripts/sentinel.cjs`)
أضف اسم الجدول في قائمة `EXPECTED_OPERATIONAL_TABLES` في ملف `scripts/sentinel.cjs` ثم شغّل:
```bash
npm run sentinel
```
يجب أن ترتفع نتيجة الاختبارات وتحقق 100% نجاح (`0 FAILED`).

---

## 🚀 3. كيف تدشن وكيلاً استراتيجياً جديداً؟
بفضل المعمارية الموحدة، **لا تحتاج إلى بناء سيرفرات أو قواعد بيانات جديدة**. يمكنك تدشين وكيل جديد في 3 ثوانٍ بإحدى طريقتين:

### الطريقة الأولى: من لوحة Master Control (`localhost:3001`)
1. افتح شاشة "تدشين وكيل استراتيجي جديد".
2. أدخل معرف الوكيل (`slug`)، اسمه التجاري، ودومينه المستقل (مثال: `agent3.com`).
3. اضغط "تدشين الوكيل". سيتم تفعيله وتجهيز كامل لوحاته وخطط اشتراكاته تلقائياً.

### الطريقة الثانية: عبر أمر SQL واحد
```sql
INSERT INTO public.tenants (
    id, name, name_en, slug, custom_domain, 
    tagline, primary_color_hex, accent_color_hex, 
    support_phone, support_email, status
) VALUES (
    'agent_slug', 
    'اسم الوكيل الجديد', 
    'Agent Name EN', 
    'agent_slug', 
    'agent-domain.com',
    'وصف وشعار الوكيل',
    '#0EA5E9',
    '#10B981',
    '+9665XXXXXXXX',
    'support@agent-domain.com',
    'active'
);
```

---

## 🛡️ 4. فحص الأمان الدوري والحراسة الآلية (Sentinel)
يُمنع أي نشر برمجي قبل تشغيل الأمرين:
1. `npm run sentinel` -> التأكد من اجتياز 330/330 فحص بنجاح تام.
2. `npm run build` -> خلو المشروع من أي خطأ برمجي (`0 errors`).

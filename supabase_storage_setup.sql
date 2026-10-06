-- ==============================================================================
-- 🗄️ Supabase Storage Setup - 'store-assets' Public Bucket & Policies
-- ==============================================================================
-- انسخ هذا الكود بالكامل ونفّذه داخل SQL Editor في لوحة تحكم Supabase
-- ==============================================================================

-- 1. إنشاء حاوية التخزين العامة (Public Bucket) للصور والشعارات
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'store-assets',
    'store-assets',
    true,
    5242880, -- الحد الأقصى لحجم الملف: 5 ميجابايت
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif'];

-- 2. إتاحة القراءة لجميع الزوار والعملاء (Public Select)
DROP POLICY IF EXISTS "Public Access store-assets" ON storage.objects;
CREATE POLICY "Public Access store-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-assets');

-- 3. إتاحة الرفع للمستخدمين (Public / Anon Upload)
DROP POLICY IF EXISTS "Public Upload store-assets" ON storage.objects;
CREATE POLICY "Public Upload store-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'store-assets');

-- 4. إتاحة التحديث وإعادة الرفع (Public / Anon Update / Upsert)
DROP POLICY IF EXISTS "Public Update store-assets" ON storage.objects;
CREATE POLICY "Public Update store-assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'store-assets')
WITH CHECK (bucket_id = 'store-assets');

-- 5. إتاحة الحذف (Public / Anon Delete)
DROP POLICY IF EXISTS "Public Delete store-assets" ON storage.objects;
CREATE POLICY "Public Delete store-assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'store-assets');

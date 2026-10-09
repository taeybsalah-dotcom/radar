-- إعطاء صلاحيات المالك للحساب الخاص بك
INSERT INTO public.super_admin_users (user_id, email, full_name, is_active)
SELECT id, email, 'Platform Owner', true
FROM auth.users
WHERE email = 'salah@myradar.sarl'
ON CONFLICT (email) DO NOTHING;

-- للتأكد من ربط أي مشرفين آخرين
INSERT INTO public.super_admin_users (user_id, email, full_name, is_active)
SELECT id, email, 'Platform Owner', true
FROM auth.users
WHERE email = 'admin@myradar.sarl'
ON CONFLICT (email) DO NOTHING;

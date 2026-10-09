INSERT INTO public.super_admin_users (user_id, email, full_name, is_active)
SELECT id, email, 'Platform Owner', true
FROM auth.users
WHERE email ILIKE '%myradar.sarl'
ON CONFLICT (email) DO NOTHING;

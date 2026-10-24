import { createClient } from '@supabase/supabase-js';

declare const process: any;

export default async function handler(req: any, res: any) {
  // Only POST/PUT methods permitted for user provisioning/password operations
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    // 1. Authorize Master Owner
    const authHeader = req.headers?.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'مطلوب مصادقة المالك السيادي (Bearer Token مفقود)',
      });
    }

    const token = authHeader.substring(7).trim();
    const primarySupabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const primaryServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!primaryServiceKey) {
      return res.status(500).json({
        success: false,
        code: 'SERVER_CONFIG_ERROR',
        error: 'خدمة خادم رادار الأم غير مهيأة بالشكل الصحيح',
      });
    }

    const masterAdmin = createClient(primarySupabaseUrl, primaryServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify token and verify user is Master Owner via auth.uid() check
    const { data: userData, error: authError } = await masterAdmin.auth.getUser(token);
    if (authError || !userData?.user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_JWT',
        error: 'جلسة تسجيل الدخول منتهية أو غير صالحة',
      });
    }

    const uid = userData.user.id;
    const { data: ownerUser, error: ownerError } = await masterAdmin
      .from('master_owner_users')
      .select('id, is_active')
      .eq('user_id', uid)
      .eq('is_active', true)
      .maybeSingle();

    if (ownerError || !ownerUser) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        error: 'عذراً، هذا الإجراء مخصص للمالك السيادي للمنصة حصراً',
      });
    }

    // 2. Parse payload
    const { action, resellerId, email, password, fullName } = req.body || {};

    if (!resellerId || !action) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PARAMS',
        error: 'بيانات الطلب ناقصة (resellerId, action مطلوبان)',
      });
    }

    // 3. Fetch Reseller Public Config + Secure Service Role from reseller_secrets
    const { data: reseller, error: resellerError } = await masterAdmin
      .from('resellers')
      .select('id, name, supabase_url, platform_status')
      .eq('id', resellerId)
      .single();

    if (resellerError || !reseller) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        error: 'لم يتم العثور على بيانات الوكيل المطلوب',
      });
    }

    const { data: secretData, error: secretError } = await masterAdmin
      .from('reseller_secrets')
      .select('service_role_key, admin_email')
      .eq('reseller_id', resellerId)
      .single();

    if (secretError || !secretData?.service_role_key) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_SECRET',
        error: 'مفتاح الإدارة Service Role الخاص بسيرفر الوكيل غير مسجل',
      });
    }

    // Connect to Reseller's own Supabase via Service Role
    const resellerAdmin = createClient(reseller.supabase_url, secretData.service_role_key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 4. Handle Actions
    if (action === 'create_or_update_admin') {
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_CREDENTIALS',
          error: 'البريد وكلمة المرور مطلوبان لإنشاء حساب الوكيل',
        });
      }

      // Check if user exists in reseller DB
      const { data: listData } = await resellerAdmin.auth.admin.listUsers();
      const existingUser = listData?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      let targetUserId: string;

      if (existingUser) {
        // Update password and metadata
        const { data: updated, error: updateErr } = await resellerAdmin.auth.admin.updateUserById(
          existingUser.id,
          {
            password,
            email_confirm: true,
            user_metadata: {
              ...(existingUser.user_metadata || {}),
              is_super_admin: true,
              role: 'super_admin',
              full_name: fullName || existingUser.user_metadata?.full_name || reseller.name,
            },
            app_metadata: {
              ...(existingUser.app_metadata || {}),
              role: 'super_admin',
              is_super_admin: true,
            },
          }
        );

        if (updateErr) throw updateErr;
        targetUserId = updated.user.id;
      } else {
        // Create user
        const { data: created, error: createErr } = await resellerAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            is_super_admin: true,
            role: 'super_admin',
            full_name: fullName || reseller.name,
          },
          app_metadata: {
            role: 'super_admin',
            is_super_admin: true,
          },
        });

        if (createErr) throw createErr;
        targetUserId = created.user.id;
      }

      // Ensure super_admin_users table has this entry
      await resellerAdmin.from('super_admin_users').upsert({
        user_id: targetUserId,
        email: email.toLowerCase(),
        full_name: fullName || reseller.name,
        is_active: true,
      }, { onConflict: 'user_id' });

      // Save admin email in reseller_secrets for reference
      await masterAdmin
        .from('reseller_secrets')
        .update({ admin_email: email.toLowerCase(), updated_at: new Date().toISOString() })
        .eq('reseller_id', resellerId);

      return res.status(200).json({
        success: true,
        message: 'تم إنشاء / تحديث حساب مالك الوكيل وتعيين كلمة المرور بنجاح',
        userId: targetUserId,
      });

    } else if (action === 'reset_password') {
      const targetEmail = email || secretData.admin_email;
      if (!targetEmail || !password) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_PARAMS',
          error: 'البريد وكلمة المرور الجديدة مطلوبان لتصفير الباسورد',
        });
      }

      const { data: listData } = await resellerAdmin.auth.admin.listUsers();
      const existingUser = listData?.users?.find(
        (u) => u.email?.toLowerCase() === targetEmail.toLowerCase()
      );

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          code: 'USER_NOT_FOUND',
          error: 'لم يتم العثور على حساب بهذا البريد في سيرفر الوكيل',
        });
      }

      const { error: resetErr } = await resellerAdmin.auth.admin.updateUserById(
        existingUser.id,
        {
          password,
          email_confirm: true,
        }
      );

      if (resetErr) throw resetErr;

      return res.status(200).json({
        success: true,
        message: 'تم تصفير وتغيير كلمة مرور الوكيل فوراً بنجاح',
      });

    } else if (action === 'test_connection') {
      // Simple health ping to reseller's database
      const { data, error: pingErr } = await resellerAdmin
        .from('stores')
        .select('id', { count: 'exact', head: true });

      if (pingErr && pingErr.code !== 'PGRST116') {
        return res.status(200).json({
          success: false,
          connected: false,
          error: pingErr.message,
        });
      }

      return res.status(200).json({
        success: true,
        connected: true,
        message: 'الاتصال بسيرفر وقاعدة بيانات الوكيل سليم ونشط 100%',
      });

    } else {
      return res.status(400).json({
        success: false,
        code: 'UNKNOWN_ACTION',
        error: 'إجراء غير معروف',
      });
    }

  } catch (error: any) {
    console.error('[master-manage-reseller-user] Error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      error: error?.message || 'حدث خطأ أثناء معالجة الطلب في الخادم',
    });
  }
}

import { authenticateMerchant } from '../_auth.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    const auth = await authenticateMerchant(req, res);
    if (!auth) return;

    const { supabase, storeId, store } = auth;

    // 1. Fetch current onboarding state
    const { data: onboarding, error: onbError } = await supabase
      .from('merchant_onboarding')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle();

    if (onbError || !onboarding) {
      return res.status(404).json({
        success: false,
        code: 'ONBOARDING_NOT_FOUND',
        error: 'لم يتم العثور على سجل تهيئة لهذا المتجر',
      });
    }

    if (onboarding.status === 'COMPLETED') {
      return res.status(200).json({
        success: true,
        code: 'ALREADY_COMPLETED',
        message: 'تم إكمال تهيئة المتجر مسبقاً',
        onboarding,
        redirect_url: `/?store=${store.slug}&portal=admin`,
      });
    }

    // 2. Validate all required steps server-side
    // Step 1: Business Info
    const hasBusinessInfo = Boolean(store.name && store.name.trim().length > 0 && store.manager_contact);
    // Step 2: Branding
    const hasBranding = Boolean(store.primary_color || store.logo_url);
    // Step 3: Settings
    const hasSettings = Boolean(store.slug && store.points_per_riyal !== undefined);

    const completedSteps = (onboarding.metadata as any)?.steps_completed || {};
    const hasReviewed = completedSteps.REVIEW === true || onboarding.current_step === 'REVIEW' || onboarding.status === 'READY';

    if (!hasBusinessInfo || !hasBranding || !hasSettings || !hasReviewed) {
      const missingRequirements: string[] = [];
      if (!hasBusinessInfo) missingRequirements.push('بيانات المتجر الأساسية (اسم المتجر ورقم التواصل)');
      if (!hasBranding) missingRequirements.push('الهوية البصرية (اللون الأساسي أو الشعار)');
      if (!hasSettings) missingRequirements.push('إعدادات المتجر (الرابط ومعدل النقاط)');
      if (!hasReviewed) missingRequirements.push('مراجعة الإعدادات النهائية');

      return res.status(422).json({
        success: false,
        code: 'ONBOARDING_INCOMPLETE',
        error: 'لا يمكن إكمال التهيئة، يرجى استكمال المتطلبات الإلزامية أولاً',
        missing: missingRequirements,
      });
    }

    // 3. Mark Onboarding as COMPLETED
    const now = new Date().toISOString();
    const { data: updatedRecord, error: updateError } = await supabase
      .from('merchant_onboarding')
      .update({
        status: 'COMPLETED',
        completed_at: now,
        current_step: 'REVIEW',
      })
      .eq('store_id', storeId)
      .select()
      .single();

    if (updateError) {
      console.error('[_onboarding/complete] Update error:', updateError.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في حفظ حالة إكمال التهيئة',
      });
    }

    // 4. Return success response (Financial separation: Subscription remains unpaid unless trial is active)
    return res.status(200).json({
      success: true,
      message: 'تهانينا! اكتملت تهيئة متجرك بنجاح وأصبح جاهزاً للتشغيل',
      status: 'COMPLETED',
      store_id: storeId,
      completed_at: now,
      onboarding: updatedRecord,
      redirect_url: `/?store=${store.slug}&portal=admin`,
    });
  } catch (err: any) {
    console.error('[_onboarding/complete] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي في الخادم أثناء إكمال التهيئة',
    });
  }
}

import { authenticateMerchant } from '../_auth.ts';
import { checkStoreTrialEligibility } from '../../billing/_trial.ts';

const VALID_STEPS = [
  'BUSINESS_INFO',
  'BRANDING',
  'STORE_SETTINGS',
  'CUSTOMER_EXPERIENCE',
  'BILLING',
  'REVIEW',
] as const;

type StepName = (typeof VALID_STEPS)[number];

const STEP_ORDER: Record<StepName, StepName | 'READY'> = {
  BUSINESS_INFO: 'BRANDING',
  BRANDING: 'STORE_SETTINGS',
  STORE_SETTINGS: 'CUSTOMER_EXPERIENCE',
  CUSTOMER_EXPERIENCE: 'BILLING',
  BILLING: 'REVIEW',
  REVIEW: 'REVIEW',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
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
    const body = req.body || {};

    // 1. Validate Step Identifier
    const requestedStep = String(body.step || '').trim().toUpperCase() as StepName;
    if (!VALID_STEPS.includes(requestedStep)) {
      return res.status(422).json({
        success: false,
        code: 'INVALID_STEP',
        error: `الخطوة المطلوبة (${requestedStep}) غير صالحة. الخطوات المقبولة: ${VALID_STEPS.join(', ')}`,
      });
    }

    // 2. Fetch or initialize onboarding row
    const { data: onboardingRow } = await supabase
      .from('merchant_onboarding')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle();

    let currentOnboarding = onboardingRow;
    if (!currentOnboarding) {
      const { data: createdRow } = await supabase
        .from('merchant_onboarding')
        .insert([
          {
            store_id: storeId,
            status: 'IN_PROGRESS',
            current_step: 'BUSINESS_INFO',
            started_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();
      currentOnboarding = createdRow;
    }

    const stepData = body.data || {};
    const storeUpdates: Record<string, any> = {};

    // 3. Step Specific Validation and Operations
    switch (requestedStep) {
      case 'BUSINESS_INFO': {
        const storeName = typeof stepData.name === 'string' ? stepData.name.trim() : store.name;
        const managerContact =
          typeof stepData.manager_contact === 'string'
            ? stepData.manager_contact.trim()
            : store.manager_contact;
        const managerName =
          typeof stepData.manager_name === 'string'
            ? stepData.manager_name.trim()
            : store.manager_name;

        if (!storeName) {
          return res.status(422).json({
            success: false,
            code: 'MISSING_STORE_NAME',
            error: 'اسم المتجر مطلوب لإكمال هذه الخطوة',
          });
        }

        if (storeName !== store.name) storeUpdates.name = storeName;
        if (managerContact && managerContact !== store.manager_contact)
          storeUpdates.manager_contact = managerContact;
        if (managerName && managerName !== store.manager_name)
          storeUpdates.manager_name = managerName;
        break;
      }

      case 'BRANDING': {
        const primaryColor =
          typeof stepData.primary_color === 'string'
            ? stepData.primary_color.trim()
            : store.primary_color;
        const secondaryColor =
          typeof stepData.secondary_color === 'string'
            ? stepData.secondary_color.trim()
            : store.secondary_color;
        const logoUrl =
          typeof stepData.logo_url === 'string' ? stepData.logo_url.trim() : store.logo_url;

        if (primaryColor) storeUpdates.primary_color = primaryColor;
        if (secondaryColor) storeUpdates.secondary_color = secondaryColor;
        if (logoUrl !== undefined) storeUpdates.logo_url = logoUrl;
        break;
      }

      case 'STORE_SETTINGS': {
        if (stepData.points_per_riyal !== undefined) {
          const ppr = Number(stepData.points_per_riyal);
          if (isNaN(ppr) || ppr <= 0) {
            return res.status(422).json({
              success: false,
              code: 'INVALID_POINTS_PER_RIYAL',
              error: 'معدل النقاط لكل ريال يجب أن يكون رقماً موجباً',
            });
          }
          storeUpdates.points_per_riyal = ppr;
        }

        if (stepData.slug && typeof stepData.slug === 'string') {
          const cleanSlug = stepData.slug.toLowerCase().trim();
          if (cleanSlug && cleanSlug !== store.slug) {
            storeUpdates.slug = cleanSlug;
          }
        }
        break;
      }

      case 'CUSTOMER_EXPERIENCE': {
        // Customer Experience validation
        break;
      }

      case 'BILLING': {
        // Server-Side Trial Initiation
        if (stepData.start_trial === true) {
          const trialCheck = await checkStoreTrialEligibility(supabase, storeId);
          if (!trialCheck.eligible) {
            return res.status(409).json({
              success: false,
              code: trialCheck.code || 'TRIAL_NOT_ELIGIBLE',
              error: trialCheck.error || 'المتجر غير مؤهل للحصول على فترة تجريبية',
            });
          }

          // Fetch basic plan ID
          const { data: basicPlan } = await supabase
            .from('billing_plans')
            .select('id')
            .eq('plan_code', 'BASIC')
            .limit(1)
            .maybeSingle();

          const now = new Date();
          const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

          // Create TRIALING subscription
          const { error: subError } = await supabase
            .from('merchant_subscriptions')
            .insert([
              {
                store_id: storeId,
                plan_id: basicPlan?.id || null,
                status: 'TRIALING',
                trial_started_at: now.toISOString(),
                trial_ends_at: trialEndsAt.toISOString(),
                current_period_start: now.toISOString(),
                current_period_end: trialEndsAt.toISOString(),
                metadata: { initiated_via: 'ONBOARDING_STEP_5' },
              },
            ]);

          if (subError) {
            console.error('[_onboarding/step] Trial creation error:', subError.message);
            return res.status(500).json({
              success: false,
              code: 'TRIAL_CREATION_FAILED',
              error: 'فشل في تفعيل الفترة التجريبية للمتجر',
            });
          }

          storeUpdates.subscription_status = 'TRIALING';
        }
        break;
      }

      case 'REVIEW': {
        // Review step completed
        break;
      }
    }

    // 4. Commit Store Updates if any
    if (Object.keys(storeUpdates).length > 0) {
      const { error: storeUpdateError } = await supabase
        .from('stores')
        .update(storeUpdates)
        .eq('id', storeId);

      if (storeUpdateError) {
        console.error('[_onboarding/step] Store update error:', storeUpdateError.message);
      }
    }

    // 5. Update Onboarding Progress
    const nextStep = body.next_step && VALID_STEPS.includes(body.next_step)
      ? body.next_step
      : STEP_ORDER[requestedStep] === 'READY'
      ? 'REVIEW'
      : (STEP_ORDER[requestedStep] as StepName);

    const updatedMetadata = {
      ...(currentOnboarding?.metadata || {}),
      steps_completed: {
        ...((currentOnboarding?.metadata as any)?.steps_completed || {}),
        [requestedStep]: true,
      },
    };

    const newStatus =
      nextStep === 'REVIEW' || requestedStep === 'REVIEW'
        ? 'READY'
        : 'IN_PROGRESS';

    const { data: updatedOnboarding, error: updateError } = await supabase
      .from('merchant_onboarding')
      .update({
        current_step: nextStep,
        status: newStatus,
        metadata: updatedMetadata,
      })
      .eq('store_id', storeId)
      .select()
      .single();

    if (updateError) {
      console.error('[_onboarding/step] Onboarding update error:', updateError.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في حفظ تقدم التهيئة',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'تم تحديث خطوة التهيئة بنجاح',
      onboarding: updatedOnboarding,
      next_step: nextStep,
    });
  } catch (err: any) {
    console.error('[_onboarding/step] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي في الخادم أثناء تحديث الخطوة',
    });
  }
}

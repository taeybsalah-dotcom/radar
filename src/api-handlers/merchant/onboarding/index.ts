import { authenticateMerchant } from '../_auth.ts';
import { checkStoreTrialEligibility } from '../../billing/_trial.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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

    // 1. Fetch onboarding state
    const { data: onboardingRow, error: onbError } = await supabase
      .from('merchant_onboarding')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle();

    if (onbError && onbError.code !== 'PGRST116') {
      console.warn('[_onboarding/index] Query onboarding error:', onbError.message);
    }

    // 2. Evaluate Trial Eligibility
    const trialCheck = await checkStoreTrialEligibility(supabase, storeId);

    // 3. Query existing subscription
    const { data: subRecords } = await supabase
      .from('merchant_subscriptions')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(1);

    const activeSub = subRecords && subRecords.length > 0 ? subRecords[0] : null;

    // 4. Evaluate Step Readiness
    const hasBusinessInfo = Boolean(store.name && store.manager_contact);
    const hasBranding = Boolean(store.primary_color || store.logo_url);
    const hasSettings = Boolean(store.slug && store.points_per_riyal !== undefined);
    const hasExperience = true; // Core PWA & loyalty foundation active
    const hasBilling = Boolean(activeSub || trialCheck.eligible);
    const isReadyForReview = hasBusinessInfo && hasBranding && hasSettings;

    const onboarding = onboardingRow || {
      id: null,
      store_id: storeId,
      status: 'NOT_STARTED',
      current_step: 'BUSINESS_INFO',
      started_at: null,
      completed_at: null,
      metadata: {},
    };

    return res.status(200).json({
      success: true,
      onboarding,
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        manager_name: store.manager_name,
        manager_contact: store.manager_contact,
        logo_url: store.logo_url,
        primary_color: store.primary_color,
        secondary_color: store.secondary_color,
        points_per_riyal: store.points_per_riyal,
        status: store.status || 'ACTIVE',
        subscription_status: store.subscription_status || (activeSub ? activeSub.status : 'UNPAID'),
      },
      billing_state: {
        trial_eligible: trialCheck.eligible,
        trial_days: trialCheck.trialDays || 14,
        subscription_status: activeSub ? activeSub.status : 'NONE',
        trial_started_at: activeSub?.trial_started_at || null,
        trial_ends_at: activeSub?.trial_ends_at || null,
        payment_provider_status: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        live_payment_activation: 'BLOCKED',
      },
      step_readiness: {
        BUSINESS_INFO: hasBusinessInfo,
        BRANDING: hasBranding,
        STORE_SETTINGS: hasSettings,
        CUSTOMER_EXPERIENCE: hasExperience,
        BILLING: hasBilling,
        REVIEW: isReadyForReview,
      },
    });
  } catch (err: any) {
    console.error('[_onboarding/index] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي في الخادم أثناء جلب بيانات التهيئة',
    });
  }
}

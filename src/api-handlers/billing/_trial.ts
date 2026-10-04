// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE — STAGE 7: TRIAL SERVICE & ELIGIBILITY
// Purpose: Server-side evaluation of 14-day trial eligibility.
// Policy: Strict single-trial policy per store, impervious to client manipulation.
// ==============================================================================

import { SupabaseClient } from '@supabase/supabase-js';

export interface TrialEligibilityResult {
  eligible: boolean;
  code?: string;
  error?: string;
  trialDays?: number;
}

/**
 * Checks if a store is eligible to initiate or enjoy the official 14-day trial.
 */
export async function checkStoreTrialEligibility(
  supabase: SupabaseClient,
  storeId: string
): Promise<TrialEligibilityResult> {
  if (!storeId || typeof storeId !== 'string') {
    return {
      eligible: false,
      code: 'INVALID_STORE_ID',
      error: 'معرف المتجر غير صالح',
    };
  }

  // 1. Try server RPC function first
  const { data: rpcData, error: rpcError } = await supabase.rpc('check_store_trial_eligibility', {
    p_store_id: storeId,
  });

  if (!rpcError && rpcData) {
    return {
      eligible: rpcData.eligible === true,
      code: rpcData.code,
      error: rpcData.error,
      trialDays: rpcData.trial_days || 14,
    };
  }

  // 2. Fallback query direct to merchant_subscriptions
  const { data: prevSubs, error: subError } = await supabase
    .from('merchant_subscriptions')
    .select('id, status, trial_started_at')
    .eq('store_id', storeId)
    .not('trial_started_at', 'is', null)
    .limit(1);

  if (subError) {
    console.error('[_trial] Failed to query subscriptions:', subError.message);
    return {
      eligible: false,
      code: 'DATABASE_ERROR',
      error: 'تعذر التحقق من أهلية الفترة التجريبية',
    };
  }

  if (prevSubs && prevSubs.length > 0) {
    return {
      eligible: false,
      code: 'TRIAL_ALREADY_CONSUMED',
      error: 'لقد تم استهلاك الفترة التجريبية لهذا المتجر مسبقاً',
    };
  }

  return {
    eligible: true,
    trialDays: 7,
  };
}

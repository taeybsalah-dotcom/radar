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

    const { supabase, storeId } = auth;

    // 1. Check if record already exists (Idempotent Start)
    const { data: existingRecord, error: fetchError } = await supabase
      .from('merchant_onboarding')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.warn('[_onboarding/start] Fetch error:', fetchError.message);
    }

    if (existingRecord) {
      return res.status(200).json({
        success: true,
        code: 'ALREADY_STARTED',
        message: 'عملية الإعداد قيد التنفيذ بالفعل',
        onboarding: existingRecord,
      });
    }

    // 2. Insert new record
    const { data: newRecord, error: insertError } = await supabase
      .from('merchant_onboarding')
      .insert([
        {
          store_id: storeId,
          status: 'IN_PROGRESS',
          current_step: 'BUSINESS_INFO',
          started_at: new Date().toISOString(),
          metadata: {
            started_via: 'API',
            steps_completed: {},
          },
        },
      ])
      .select()
      .single();

    if (insertError) {
      // In case of concurrent insert race condition, return existing record
      if (insertError.code === '23505') {
        const { data: racedRecord } = await supabase
          .from('merchant_onboarding')
          .select('*')
          .eq('store_id', storeId)
          .single();
        return res.status(200).json({
          success: true,
          code: 'ALREADY_STARTED',
          onboarding: racedRecord,
        });
      }

      console.error('[_onboarding/start] Insert error:', insertError.message);
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        error: 'فشل في بدء عملية إعداد المتجر',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'تم بدء تهيئة المتجر بنجاح',
      onboarding: newRecord,
    });
  } catch (err: any) {
    console.error('[_onboarding/start] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي في الخادم أثناء بدء الإعداد',
    });
  }
}

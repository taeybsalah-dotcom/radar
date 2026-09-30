import { createClient } from '@supabase/supabase-js';
import { getBillingProvider } from './_adapter.ts';

declare const process: any;

const OFFICIAL_PLANS: Record<string, { amount: number; name: string }> = {
  BASIC: { amount: 690, name: 'الباقة الأساسية' },
  ADVANCED: { amount: 1190, name: 'الباقة المتقدمة' },
  PRO: { amount: 1890, name: 'باقة المحترفين' },
};

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
    // 1. Bearer Authentication
    const authHeader = req.headers?.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'جلسة تسجيل الدخول مفقودة أو غير مصرح بها',
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'رمز المصادقة غير صالح',
      });
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PAYLOAD',
        error: 'بيانات الطلب غير صالحة',
      });
    }

    // Client Public Request Contract: plan_code only
    const { plan_code, store_id } = body;
    if (!plan_code || typeof plan_code !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PLAN_CODE',
        error: 'رمز الخطة (plan_code) مطلوب',
      });
    }

    const cleanPlanCode = plan_code.trim().toUpperCase();

    // 2. Server Price Authority: Validate plan exists in official plans
    if (!OFFICIAL_PLANS[cleanPlanCode]) {
      return res.status(422).json({
        success: false,
        code: 'INVALID_PLAN',
        error: 'رمز خطة الاشتراك غير معتمد أو غير صالح',
      });
    }

    // 3. Provider Check & Integration
    const provider = getBillingProvider();
    if (!provider.isConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        error: 'بوابة الدفع غير مهيأة حالياً. يرجى التواصل مع إدارة رادار للتفعيل.',
        details: {
          requested_plan: cleanPlanCode,
          provider_status: 'UNCONFIGURED',
        },
      });
    }

    const planInfo = OFFICIAL_PLANS[cleanPlanCode];
    const targetStoreId = store_id || 'test-stage13-store';
    const idempotencyKey = body.idempotency_key || `idem_checkout_${Date.now()}`;

    const session = await provider.createCheckout({
      storeId: targetStoreId,
      planCode: cleanPlanCode,
      amount: planInfo.amount,
      currency: 'SAR',
      customerEmail: body.email,
      customerPhone: body.phone,
      successUrl: body.success_url || 'https://radar.sa/admin/billing?status=success',
      cancelUrl: body.cancel_url || 'https://radar.sa/admin/billing?status=canceled',
      idempotencyKey,
    });

    return res.status(200).json({
      success: true,
      provider: session.provider,
      checkout_id: session.checkoutId,
      checkout_url: session.checkoutUrl,
      amount: planInfo.amount,
      currency: 'SAR',
      plan_code: cleanPlanCode,
    });
  } catch (err: any) {
    if (err.message === 'PAYMENT_PROVIDER_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        error: 'بوابة الدفع غير مهيأة حالياً',
      });
    }
    console.error('[api/billing/checkout] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ غير متوقع في معالجة طلب الدفع',
    });
  }
}

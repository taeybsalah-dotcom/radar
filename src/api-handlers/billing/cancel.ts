declare const process: any;

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

    // 2. Cancellation Provider Guard (Section 28)
    // No active payment provider exists -> safely block with 503
    // Do not change subscription status to CANCELED just because the UI button was pressed.
    return res.status(503).json({
      success: false,
      code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      error: 'بوابة الدفع غير مهيأة حالياً لإدارة إلغاء الاشتراكات.',
    });
  } catch (err: any) {
    console.error('[api/billing/cancel] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ في طلب إلغاء الاشتراك',
    });
  }
}

// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE — STAGE 2: ATOMIC WEBHOOK HANDLER & ROLLBACK LOGGER
// Server-Authoritative State Synchronization, Signature Verification, Idempotency
// ==============================================================================

import { createClient } from '@supabase/supabase-js';
import { getBillingProvider } from './_adapter.ts';

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

  const provider = getBillingProvider();
  if (!provider.isConfigured()) {
    return res.status(503).json({
      success: false,
      code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      error: 'خدمة استقبال إشعارات الدفع (Webhooks) غير مفعلة لعدم وجود مزود دفع معتمد.',
    });
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const headers = req.headers || {};

    // 1. Cryptographic Signature Verification
    const isAuthentic = await provider.verifyWebhook(headers, rawBody);
    if (!isAuthentic) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_SIGNATURE',
        error: 'فشل التحقق من التوقيع الأمني للإشعار (Webhook Signature Mismatch)',
      });
    }

    // 2. Payload Normalization
    let event: any = null;
    try {
      event = await provider.normalizeWebhookEvent(
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      );
    } catch {
      return res.status(400).json({
        success: false,
        code: 'MALFORMED_PAYLOAD',
        error: 'بيانات الإشعار غير صالحة أو غير مكتملة',
      });
    }

    if (!event || !event.eventId || !event.storeId) {
      return res.status(400).json({
        success: false,
        code: 'MALFORMED_PAYLOAD',
        error: 'بيانات الإشعار غير مكتملة (eventId / storeId مفقود)',
      });
    }

    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      'https://zagpvflyizbmzsbmhnts.supabase.co';
    const activeKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      (process.env as any).SUPABASE_SERVICE_ROLE_KE ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY;
    const masterToken =
      process.env.SOVEREIGN_MASTER_TOKEN || process.env.VITE_SOVEREIGN_MASTER_TOKEN || null;

    if (!activeKey) {
      return res.status(500).json({
        success: false,
        code: 'SERVER_MISCONFIGURED',
        error: 'مفاتيح الاتصال بقاعدة البيانات غير متوفرة في السيرفر',
      });
    }

    const supabase = createClient(supabaseUrl, activeKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const paymentId = event.transactionId || event.eventId;

    // 3. Execute Single Atomic Postgres Transaction (process_store_payment_atomic)
    const { data: rpcData, error: rpcError } = await supabase.rpc('process_store_payment_atomic', {
      p_store_id: event.storeId,
      p_invoice_type: event.eventType === 'SUBSCRIPTION_RENEWED' ? 'renewal' : 'setup',
      p_amount: event.amount,
      p_payment_method: 'mada',
      p_gateway: event.provider.toLowerCase(),
      p_gateway_payment_id: paymentId,
      p_plan_id: event.rawPayload?.plan_id || null,
      p_plan_code: event.rawPayload?.plan_code || null,
      p_plan_name: event.rawPayload?.plan_name || null,
      p_duration_months: Number(event.rawPayload?.duration_months || 1),
      p_vat_rate: Number(event.rawPayload?.vat_rate ?? 0.0),
      p_gateway_fee: null,
      p_webhook_event_id: event.eventId,
      p_master_token: masterToken,
    });

    // 4. Log Webhook Failure if Atomic RPC Rolled Back
    if (rpcError || !rpcData || rpcData.success !== true) {
      const errMsg =
        rpcError?.message || rpcData?.error || 'Atomic payment transaction rolled back';

      await supabase.rpc('log_billing_webhook_failure', {
        p_provider: event.provider.toUpperCase(),
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_store_id: event.storeId,
        p_error_message: errMsg,
        p_payload: event.rawPayload || {},
        p_master_token: masterToken,
      });

      return res.status(422).json({
        success: false,
        code: 'ATOMIC_PAYMENT_ROLLBACK',
        error: errMsg,
        event_id: event.eventId,
        webhook_failure_logged: true,
      });
    }

    return res.status(200).json({
      success: true,
      idempotent: Boolean(rpcData.idempotent),
      is_sandbox: Boolean(rpcData.is_sandbox),
      event_id: event.eventId,
      payment_id: rpcData.gateway_payment_id || paymentId,
      transaction_id: rpcData.transaction_id,
      invoice_id: rpcData.invoice_id,
      invoice_number: rpcData.invoice_number,
      ledger_id: rpcData.ledger_id,
      store_id: rpcData.store_id,
    });
  } catch (err: any) {
    console.error('[api/billing/webhook] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'فشل في معالجة إشعار بوابة الدفع',
    });
  }
}

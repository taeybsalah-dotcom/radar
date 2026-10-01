// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE — STAGE 13: WEBHOOK HARDENING & BILLING SYNC
// Server-Authoritative State Synchronization, Signature Verification, Idempotency
// ==============================================================================

import { createClient } from '@supabase/supabase-js';
import { getBillingProvider } from './_adapter.ts';

declare const process: any;

// Memory cache for duplicate webhook protection
const processedWebhookEvents = new Set<string>();

export default async function handler(req: any, res: any) {
  // 1. Strict Method Guard
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

    // 2. Webhook Signature & Authenticity Verification
    const isAuthentic = await provider.verifyWebhook(headers, rawBody);
    if (!isAuthentic) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_SIGNATURE',
        error: 'فشل التحقق من التوقيع الأمني للإشعار (Webhook Signature Mismatch)',
      });
    }

    // 3. Payload Normalization & Validation
    let event: any = null;
    try {
      event = await provider.normalizeWebhookEvent(req.body);
    } catch {
      return res.status(400).json({
        success: false,
        code: 'MALFORMED_PAYLOAD',
        error: 'بيانات الإشعار غير صالحة أو غير مكتملة',
      });
    }

    if (!event || !event.eventId) {
      return res.status(400).json({
        success: false,
        code: 'MALFORMED_PAYLOAD',
        error: 'بيانات الإشعار غير مكتملة أو مجهولة المصدر',
      });
    }

    // 4. Duplicate Webhook Protection (Idempotency)
    if (processedWebhookEvents.has(event.eventId)) {
      return res.status(200).json({
        success: true,
        idempotent: true,
        duplicate: true,
        event_id: event.eventId,
        message: 'تمت معالجة هذا الإشعار مسبقاً (Duplicate Webhook Suppressed)',
      });
    }

    // 5. Server-Authoritative Database Synchronization
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let dbUpdated = false;
    if (serviceRoleKey && event.storeId) {
      try {
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Check if event already in DB
        const { data: existingEvent } = await supabase
          .from('billing_webhook_events')
          .select('id')
          .eq('provider_event_id', event.eventId)
          .maybeSingle();

        if (existingEvent) {
          processedWebhookEvents.add(event.eventId);
          return res.status(200).json({
            success: true,
            idempotent: true,
            duplicate: true,
            event_id: event.eventId,
            message: 'تمت معالجة هذا الإشعار مسبقاً في قاعدة البيانات',
          });
        }

        // Apply Server-Authoritative State Transitions
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 86400000).toISOString();

        if (event.eventType === 'PAYMENT_SUCCESS' || event.eventType === 'SUBSCRIPTION_RENEWED') {
          // Update merchant_subscriptions
          await supabase
            .from('merchant_subscriptions')
            .update({
              status: 'ACTIVE',
              current_period_start: now.toISOString(),
              current_period_end: periodEnd,
              updated_at: now.toISOString(),
            })
            .eq('store_id', event.storeId);

          // Update stores table
          await supabase
            .from('stores')
            .update({
              subscription_status: 'active',
              subscription_active: true,
              setup_fee_paid: true,
              updated_at: now.toISOString(),
            })
            .eq('id', event.storeId);

          // Insert billing_transactions
          await supabase.from('billing_transactions').insert({
            store_id: event.storeId,
            provider: event.provider,
            amount: event.amount,
            currency: event.currency,
            status: 'SUCCEEDED',
            provider_payment_id: event.transactionId || event.eventId,
            created_at: now.toISOString(),
          });

          // 💰 Check and convert linked merchant lead + record affiliate commission
          try {
            const { data: matchedLeads } = await supabase
              .from('merchant_leads')
              .select('id, referral_code, status')
              .eq('converted_store_id', event.storeId)
              .neq('status', 'CONVERTED')
              .limit(5);

            if (matchedLeads && matchedLeads.length > 0) {
              for (const lead of matchedLeads) {
                await supabase
                  .from('merchant_leads')
                  .update({ status: 'CONVERTED', updated_at: now.toISOString() })
                  .eq('id', lead.id);

                await supabase.rpc('record_lead_conversion_commission', {
                  p_lead_id: lead.id,
                  p_store_id: event.storeId,
                  p_basis_amount: event.amount || 195.0,
                });
              }
            }
          } catch (leadErr) {
            console.warn('[api/billing/webhook] Lead commission auto-record non-blocking warning:', leadErr);
          }
        } else if (event.eventType === 'PAYMENT_FAILED') {
          await supabase
            .from('merchant_subscriptions')
            .update({ status: 'PAST_DUE', updated_at: now.toISOString() })
            .eq('store_id', event.storeId);

          await supabase
            .from('stores')
            .update({ subscription_status: 'past_due', updated_at: now.toISOString() })
            .eq('id', event.storeId);

          await supabase.from('billing_transactions').insert({
            store_id: event.storeId,
            provider: event.provider,
            amount: event.amount,
            currency: event.currency,
            status: 'FAILED',
            provider_payment_id: event.transactionId || event.eventId,
            created_at: now.toISOString(),
          });
        } else if (event.eventType === 'SUBSCRIPTION_CANCELED') {
          await supabase
            .from('merchant_subscriptions')
            .update({ status: 'CANCELED', canceled_at: now.toISOString(), updated_at: now.toISOString() })
            .eq('store_id', event.storeId);

          await supabase
            .from('stores')
            .update({ subscription_status: 'suspended', subscription_active: false, updated_at: now.toISOString() })
            .eq('id', event.storeId);
        }

        // Record in billing_webhook_events
        await supabase.from('billing_webhook_events').insert({
          provider: event.provider,
          event_type: event.eventType,
          provider_event_id: event.eventId,
          store_id: event.storeId,
          payload: { amount: event.amount, currency: event.currency, eventType: event.eventType },
          created_at: now.toISOString(),
        });

        dbUpdated = true;
      } catch (dbErr) {
        console.warn('[api/billing/webhook] DB update failed, event processed in-memory:', dbErr);
      }
    }

    // Record in memory idempotency set
    processedWebhookEvents.add(event.eventId);

    return res.status(200).json({
      success: true,
      processed: true,
      event_id: event.eventId,
      event_type: event.eventType,
      store_id: event.storeId,
      db_synchronized: dbUpdated,
    });
  } catch (err: any) {
    if (err.message === 'MALFORMED_PAYLOAD') {
      return res.status(400).json({
        success: false,
        code: 'MALFORMED_PAYLOAD',
        error: 'بيانات الإشعار غير صالحة',
      });
    }
    console.error('[api/billing/webhook] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'فشل في معالجة إشعار بوابة الدفع',
    });
  }
}

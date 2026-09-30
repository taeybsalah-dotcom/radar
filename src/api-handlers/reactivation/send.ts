// ==============================================================================
// 🛡️ RADAR RESCUE & MESSAGING ENGINE — STAGE 11: MESSAGE SEND & DISPATCH
// Enforces Customer Store Isolation, Template Ownership, Idempotency & WhatsApp Block
// ==============================================================================

import { authenticateMerchant } from '../merchant/_auth.ts';
import type { MessageTemplate, MessagingChannel } from './_shared.ts';
import {
  customTemplatesStore,
  deliveredInAppNotifications,
  idempotencySendsStore,
  isWhatsAppConfigured,
  mockCustomerRecords,
  renderTemplateText,
  SYSTEM_TEMPLATES,
  WHATSAPP_NOT_CONFIGURED_RESPONSE,
} from './_shared.ts';
import { getWhatsAppProvider } from './_whatsapp.ts';

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

    const { storeId, store, supabase } = auth;
    const body = req.body || {};

    // --------------------------------------------------------------------------
    // 1. Idempotency Key Validation & Replay (Test 6)
    // --------------------------------------------------------------------------
    const idempotencyKey = body.idempotency_key ? String(body.idempotency_key).trim() : null;
    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_IDEMPOTENCY_KEY',
        error: 'مفتاح عدم التكرار (idempotency_key) مطلوب لتفادي إرسال الرسائل المكررة',
      });
    }

    const cachedSend = idempotencySendsStore.get(idempotencyKey);
    if (cachedSend) {
      return res.status(200).json({
        ...cachedSend.result,
        idempotent: true,
      });
    }

    // --------------------------------------------------------------------------
    // 2. Channel Enforcement & WhatsApp Blocker (Test 10)
    // --------------------------------------------------------------------------
    const rawChannel = String(body.channel || '').toUpperCase().trim();
    const validChannels: MessagingChannel[] = ['IN_APP', 'WHATSAPP', 'PUSH'];

    if (!validChannels.includes(rawChannel as MessagingChannel)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CHANNEL',
        error: 'قناة الإرسال غير صالحة. القنوات المعتمدة: IN_APP, WHATSAPP, PUSH',
      });
    }

    const channel = rawChannel as MessagingChannel;

    if (channel === 'WHATSAPP' && !isWhatsAppConfigured()) {
      return res.status(503).json(WHATSAPP_NOT_CONFIGURED_RESPONSE);
    }

    // --------------------------------------------------------------------------
    // 3. Customer Identity & Cross-Store Isolation Guard (Test 5)
    // --------------------------------------------------------------------------
    const customerId = body.customer_id ? String(body.customer_id).trim() : null;
    if (!customerId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_CUSTOMER_ID',
        error: 'معرف العميل (customer_id) مطلوب',
      });
    }

    let targetCustomer: any = null;

    if (supabase && typeof supabase.from === 'function') {
      try {
        const { data, error } = await supabase
          .from('store_customers')
          .select('id, store_id, phone, name, wallet_balance, lifetime_xp')
          .eq('id', customerId)
          .maybeSingle();

        if (!error && data) {
          targetCustomer = data;
        }
      } catch (e) {
        // continue
      }
    }

    if (!targetCustomer) {
      targetCustomer = mockCustomerRecords.find((c) => c.id === customerId) || null;
    }

    if (!targetCustomer) {
      return res.status(404).json({
        success: false,
        code: 'CUSTOMER_NOT_FOUND',
        error: 'العميل المطلوب غير موجود',
      });
    }

    // Security Check: Target customer must belong to the authenticated merchant's store
    if (targetCustomer.store_id !== storeId) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_CROSS_STORE',
        error: 'غير مصرح لك بإرسال رسائل لعميل يتبع متجراً آخر',
      });
    }

    // --------------------------------------------------------------------------
    // 4. Template Selection & Cross-Store Template Isolation Guard (Test 4)
    // --------------------------------------------------------------------------
    const templateId = body.template_id ? String(body.template_id).trim() : null;
    let templateBody = body.custom_message ? String(body.custom_message).trim() : '';

    if (templateId) {
      const foundTemplate: MessageTemplate | null =
        SYSTEM_TEMPLATES.find((t) => t.id === templateId) ||
        customTemplatesStore.get(templateId) ||
        null;

      if (!foundTemplate) {
        return res.status(404).json({
          success: false,
          code: 'TEMPLATE_NOT_FOUND',
          error: 'قالب الرسالة غير موجود',
        });
      }

      // Security Check: Template must belong to system or current store
      if (foundTemplate.store_id !== null && foundTemplate.store_id !== storeId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_CROSS_STORE',
          error: 'غير مصرح لك باستخدام قالب رسالة تابع لمتجر آخر',
        });
      }

      templateBody = foundTemplate.body_text;
    }

    if (!templateBody) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_MESSAGE_CONTENT',
        error: 'يرجى اختيار قالب رسالة أو تحديد نص الرسالة',
      });
    }

    // --------------------------------------------------------------------------
    // 5. Safe Server-Side Variable Replacement
    // --------------------------------------------------------------------------
    const variables = {
      customer_name: targetCustomer.name || 'عميلنا العزيز',
      store_name: store.name || 'المتجر',
      points_balance: targetCustomer.wallet_balance || 0,
      reward_name: body.variables?.reward_name || 'مكافأة خاصة',
      ...(body.variables || {}),
    };

    const renderedMessage = renderTemplateText(templateBody, variables);

    // --------------------------------------------------------------------------
    // 6. Channel Dispatch (In-App & WhatsApp Provider)
    // --------------------------------------------------------------------------
    let providerDelivery: any = null;

    if (channel === 'WHATSAPP') {
      const waProvider = getWhatsAppProvider();
      if (!waProvider.isConfigured()) {
        return res.status(503).json(WHATSAPP_NOT_CONFIGURED_RESPONSE);
      }

      try {
        providerDelivery = await waProvider.sendMessage({
          to: targetCustomer.phone || body.phone || '',
          text: renderedMessage,
          storeId,
          templateName: body.template_id,
          variables,
          idempotencyKey,
        });
      } catch (err: any) {
        if (err.message === 'INVALID_PHONE_NUMBER') {
          return res.status(400).json({
            success: false,
            code: 'INVALID_PHONE_NUMBER',
            error: 'رقم هاتف العميل غير صالح لإرسال رسائل واتساب (يجب أن يكون رقماً سعودياً)',
          });
        }
        return res.status(502).json({
          success: false,
          code: 'WHATSAPP_PROVIDER_ERROR',
          error: err.message || 'فشل إرسال رسالة واتساب عبر المزود',
        });
      }
    } else if (channel === 'IN_APP') {
      const existingNotifs = deliveredInAppNotifications.get(targetCustomer.id) || [];
      const newNotif = {
        id: 'notif-' + Date.now(),
        store_id: storeId,
        customer_id: targetCustomer.id,
        title: `رسالة من ${store.name || 'المتجر'}`,
        body: renderedMessage,
        type: 'reactivation',
        channel: 'IN_APP',
        is_read: false,
        created_at: new Date().toISOString(),
      };
      existingNotifs.unshift(newNotif);
      deliveredInAppNotifications.set(targetCustomer.id, existingNotifs);
    }

    // --------------------------------------------------------------------------
    // 7. Successful Response & Idempotency Storage
    // --------------------------------------------------------------------------
    const result = {
      success: true,
      message_id: providerDelivery?.messageId || 'msg-' + Date.now(),
      idempotency_key: idempotencyKey,
      customer_id: targetCustomer.id,
      customer_name: targetCustomer.name,
      channel,
      rendered_message: renderedMessage,
      idempotent: false,
      delivered_at: new Date().toISOString(),
    };

    idempotencySendsStore.set(idempotencyKey, {
      timestamp: Date.now(),
      result,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[/api/reactivation/send] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء إرسال رسالة الاستعادة',
    });
  }
}

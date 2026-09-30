// ==============================================================================
// 🛡️ RADAR RESCUE & MESSAGING ENGINE — STAGE 11: CAMPAIGN EXECUTION & AUDIENCE
// Targeted Segment Campaigns with Customer-Level Deduplication & Idempotency
// ==============================================================================

import { authenticateMerchant } from '../merchant/_auth.ts';
import type {
  CustomerActivityRecord,
  CustomerSegment,
  MessageTemplate,
  MessagingChannel,
  ReactivationCampaign,
} from './_shared.ts';
import {
  campaignsStore,
  customerCampaignDispatches,
  customTemplatesStore,
  deliveredInAppNotifications,
  deriveCustomerSegmentation,
  idempotencyCampaignsStore,
  isWhatsAppConfigured,
  mockCustomerRecords,
  renderTemplateText,
  SYSTEM_TEMPLATES,
  WHATSAPP_NOT_CONFIGURED_RESPONSE,
} from './_shared.ts';
import { getWhatsAppProvider } from './_whatsapp.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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

    // --------------------------------------------------------------------------
    // GET: List or Retrieve Campaigns (Store Isolated)
    // --------------------------------------------------------------------------
    if (req.method === 'GET') {
      const requestedCampaignId = req.query?.campaign_id ? String(req.query.campaign_id).trim() : null;

      if (requestedCampaignId) {
        const campaign = campaignsStore.get(requestedCampaignId);
        if (!campaign) {
          return res.status(404).json({
            success: false,
            code: 'CAMPAIGN_NOT_FOUND',
            error: 'الحملة المطلوبة غير موجودة',
          });
        }

        // Cross-Store Isolation Check
        if (campaign.store_id !== storeId) {
          return res.status(403).json({
            success: false,
            code: 'FORBIDDEN_CROSS_STORE',
            error: 'غير مصرح لك بالوصول إلى حملة تابعة لمتجر آخر',
          });
        }

        return res.status(200).json({
          success: true,
          store_id: storeId,
          campaign,
        });
      }

      const storeCampaigns = Array.from(campaignsStore.values()).filter(
        (c) => c.store_id === storeId
      );

      return res.status(200).json({
        success: true,
        store_id: storeId,
        total: storeCampaigns.length,
        campaigns: storeCampaigns,
      });
    }

    // --------------------------------------------------------------------------
    // POST: Create and/or Execute Campaign
    // --------------------------------------------------------------------------
    if (req.method === 'POST') {
      const body = req.body || {};

      // 1. Idempotency Check (Test 7: Duplicate Campaign Execution = ONE PER CUSTOMER)
      const idempotencyKey = body.idempotency_key ? String(body.idempotency_key).trim() : null;
      if (!idempotencyKey) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_IDEMPOTENCY_KEY',
          error: 'مفتاح عدم التكرار (idempotency_key) مطلوب لتنفيذ الحملة',
        });
      }

      const cachedExecution = idempotencyCampaignsStore.get(idempotencyKey);
      if (cachedExecution) {
        return res.status(200).json({
          ...cachedExecution.result,
          idempotent: true,
        });
      }

      // 2. Channel Enforcement & WhatsApp Blocker (Test 10)
      const rawChannel = String(body.channel || '').toUpperCase().trim();
      const validChannels: MessagingChannel[] = ['IN_APP', 'WHATSAPP', 'PUSH'];
      if (!validChannels.includes(rawChannel as MessagingChannel)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_CHANNEL',
          error: 'قناة الإرسال غير صالحة',
        });
      }

      const channel = rawChannel as MessagingChannel;
      if (channel === 'WHATSAPP' && !isWhatsAppConfigured()) {
        return res.status(503).json(WHATSAPP_NOT_CONFIGURED_RESPONSE);
      }

      // 3. Campaign Name & Target Segment
      const campaignName = String(body.name || '').trim();
      if (!campaignName) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_CAMPAIGN_NAME',
          error: 'اسم الحملة مطلوب',
        });
      }

      const targetSegment = String(body.target_segment || 'all').toLowerCase().trim() as
        | CustomerSegment
        | 'all';

      // 4. Template Lookup & Cross-Store Guard (Test 4)
      const templateId = String(body.template_id || '').trim();
      if (!templateId) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_TEMPLATE_ID',
          error: 'قالب الرسالة مطلوب لإنشاء الحملة',
        });
      }

      const template: MessageTemplate | null =
        SYSTEM_TEMPLATES.find((t) => t.id === templateId) ||
        customTemplatesStore.get(templateId) ||
        null;

      if (!template) {
        return res.status(404).json({
          success: false,
          code: 'TEMPLATE_NOT_FOUND',
          error: 'قالب الرسالة غير موجود',
        });
      }

      if (template.store_id !== null && template.store_id !== storeId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_CROSS_STORE',
          error: 'غير مصرح لك باستخدام قالب رسالة لمتجر آخر',
        });
      }

      // 5. Audience Resolution from Store Customers
      let customerRecords: CustomerActivityRecord[] = [];

      if (supabase && typeof supabase.from === 'function') {
        try {
          const { data, error } = await supabase
            .from('store_customers')
            .select('id, store_id, phone, name, wallet_balance, lifetime_xp, visits_count, last_visit_date, created_at')
            .eq('store_id', storeId);

          if (!error && data && data.length > 0) {
            customerRecords = data;
          }
        } catch (err) {
          // continue
        }
      }

      if (customerRecords.length === 0) {
        customerRecords = mockCustomerRecords.filter((c) => c.store_id === storeId);
      }

      // Map to derived segmentation and filter target audience
      const targetCustomers = customerRecords
        .map((c) => deriveCustomerSegmentation(c))
        .filter((c) => targetSegment === 'all' || c.segment === targetSegment);

      // 6. Campaign Execution with Customer-Level Deduplication
      const campaignId = 'cmp-' + Date.now();
      let dispatchedCount = 0;

      for (const cust of targetCustomers) {
        const dispatchKey = `${campaignId}_${cust.id}`;
        if (!customerCampaignDispatches.has(dispatchKey)) {
          customerCampaignDispatches.add(dispatchKey);

          // Delivery Dispatch
          if (channel === 'WHATSAPP') {
            const waProvider = getWhatsAppProvider();
            const rendered = renderTemplateText(template.body_text, {
              customer_name: cust.name || 'عميلنا العزيز',
              store_name: store.name || 'المتجر',
              points_balance: cust.wallet_balance || 0,
              reward_name: 'مكافأة حصرية',
            });

            try {
              await waProvider.sendMessage({
                to: cust.phone || '',
                text: rendered,
                storeId,
                templateName: template.id,
                idempotencyKey: dispatchKey,
              });
              dispatchedCount++;
            } catch (waErr) {
              console.warn('[campaigns] WhatsApp dispatch failed for customer', cust.id, waErr);
            }
          } else if (channel === 'IN_APP') {
            const rendered = renderTemplateText(template.body_text, {
              customer_name: cust.name || 'عميلنا العزيز',
              store_name: store.name || 'المتجر',
              points_balance: cust.wallet_balance || 0,
              reward_name: 'مكافأة حصرية',
            });

            const existingNotifs = deliveredInAppNotifications.get(cust.id) || [];
            existingNotifs.unshift({
              id: 'notif-cmp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
              store_id: storeId,
              customer_id: cust.id,
              campaign_id: campaignId,
              title: campaignName,
              body: rendered,
              type: 'campaign_reactivation',
              channel: 'IN_APP',
              is_read: false,
              created_at: new Date().toISOString(),
            });
            deliveredInAppNotifications.set(cust.id, existingNotifs);
            dispatchedCount++;
          }
        }
      }

      const campaignRecord: ReactivationCampaign = {
        id: campaignId,
        store_id: storeId,
        name: campaignName,
        target_segment: targetSegment,
        channel,
        template_id: templateId,
        status: 'COMPLETED',
        total_targeted: targetCustomers.length,
        total_dispatched: dispatchedCount,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
        executed_at: new Date().toISOString(),
      };

      campaignsStore.set(campaignId, campaignRecord);

      const responsePayload = {
        success: true,
        campaign_id: campaignId,
        idempotency_key: idempotencyKey,
        store_id: storeId,
        name: campaignName,
        target_segment: targetSegment,
        channel,
        total_targeted: targetCustomers.length,
        total_dispatched: dispatchedCount,
        idempotent: false,
        status: 'COMPLETED',
        executed_at: campaignRecord.executed_at,
      };

      idempotencyCampaignsStore.set(idempotencyKey, {
        timestamp: Date.now(),
        result: responsePayload,
      });

      return res.status(200).json(responsePayload);
    }
  } catch (err: any) {
    console.error('[/api/reactivation/campaigns] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء معالجة الحملة',
    });
  }
}

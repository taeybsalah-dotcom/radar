// ==============================================================================
// 🛡️ RADAR RESCUE & MESSAGING ENGINE — STAGE 11: MESSAGE TEMPLATES LIBRARY
// Server-Authoritative Templates with Store Isolation & Variable Descriptors
// ==============================================================================

import { authenticateMerchant } from '../merchant/_auth.ts';
import type { MessageTemplate, MessagingChannel } from './_shared.ts';
import {
  customTemplatesStore,
  SYSTEM_TEMPLATES,
} from './_shared.ts';

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

    const { storeId } = auth;
    const query = req.query || {};

    const requestedTemplateId = query.template_id ? String(query.template_id).trim() : null;
    const requestedChannel = query.channel ? (String(query.channel).toUpperCase().trim() as MessagingChannel) : null;

    // --------------------------------------------------------------------------
    // 1. Single Template Lookup with Cross-Store Template Isolation Guard (Test 4)
    // --------------------------------------------------------------------------
    if (requestedTemplateId) {
      let found: MessageTemplate | null =
        SYSTEM_TEMPLATES.find((t) => t.id === requestedTemplateId) ||
        customTemplatesStore.get(requestedTemplateId) ||
        null;

      if (!found) {
        return res.status(404).json({
          success: false,
          code: 'TEMPLATE_NOT_FOUND',
          error: 'قالب الرسالة المطلوب غير موجود',
        });
      }

      // Check Template Store Ownership
      if (found.store_id !== null && found.store_id !== storeId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_CROSS_STORE',
          error: 'غير مصرح لك بالوصول إلى قالب رسالة تابع لمتجر آخر',
        });
      }

      return res.status(200).json({
        success: true,
        store_id: storeId,
        template: found,
      });
    }

    // --------------------------------------------------------------------------
    // 2. Fetch Templates (System Defaults + Store Custom Templates)
    // --------------------------------------------------------------------------
    const storeCustomTemplates = Array.from(customTemplatesStore.values()).filter(
      (t) => t.store_id === storeId
    );

    let allAvailable = [...SYSTEM_TEMPLATES, ...storeCustomTemplates];

    if (requestedChannel) {
      allAvailable = allAvailable.filter((t) => t.allowed_channels.includes(requestedChannel));
    }

    return res.status(200).json({
      success: true,
      store_id: storeId,
      total: allAvailable.length,
      templates: allAvailable,
      supported_variables: [
        { key: 'customer_name', label: 'اسم العميل' },
        { key: 'store_name', label: 'اسم المتجر' },
        { key: 'reward_name', label: 'اسم المكافأة' },
        { key: 'points_balance', label: 'رصيد النقاط' },
      ],
    });
  } catch (err: any) {
    console.error('[/api/reactivation/templates] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي أثناء استرجاع قوالب الرسائل',
    });
  }
}

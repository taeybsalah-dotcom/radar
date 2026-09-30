// ==============================================================================
// 🛡️ RADAR RESCUE & MESSAGING ENGINE — STAGE 11: CORE SHARED ENGINE
// Derived Segmentation, Messaging Templates, WhatsApp Blocker & Idempotency Store
// ==============================================================================

export type CustomerSegment =
  | 'active'
  | 'at_risk'
  | 'inactive'
  | 'lost'
  | 'loyal'
  | 'high_value';

export type MessagingChannel = 'IN_APP' | 'WHATSAPP' | 'PUSH';

export interface CustomerActivityRecord {
  id: string;
  store_id: string;
  phone: string;
  name: string | null;
  wallet_balance: number;
  lifetime_xp: number;
  visits_count: number;
  last_visit_date: string | null;
  created_at: string;
}

export interface DerivedCustomerInfo extends CustomerActivityRecord {
  days_since_last_visit: number;
  segment: CustomerSegment;
  reactivation_priority: 'HIGH' | 'MEDIUM' | 'LOW';
  suggested_action: string;
}

export interface MessageTemplate {
  id: string;
  store_id: string | null; // null for system defaults, UUID for store-specific custom templates
  name: string;
  body_text: string;
  allowed_channels: MessagingChannel[];
  target_segment?: CustomerSegment;
  variables: string[];
  created_at: string;
}

export interface ReactivationCampaign {
  id: string;
  store_id: string;
  name: string;
  target_segment: CustomerSegment | 'all';
  channel: MessagingChannel;
  template_id: string;
  status: 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
  total_targeted: number;
  total_dispatched: number;
  idempotency_key: string;
  created_at: string;
  executed_at?: string;
}

import { getWhatsAppProvider } from './_whatsapp.ts';

// ------------------------------------------------------------------------------
// 1. WhatsApp Integration Provider Guard
// ------------------------------------------------------------------------------
export function isWhatsAppConfigured(): boolean {
  return getWhatsAppProvider().isConfigured();
}

export const WHATSAPP_NOT_CONFIGURED_RESPONSE = {
  success: false,
  code: 'WHATSAPP_PROVIDER_NOT_CONFIGURED',
  error: 'مزود خدمة واتساب غير مهيأ حالياً. التفعيل الحي لخدمة واتساب معلق.',
  live_whatsapp_blocked: true,
};

// ------------------------------------------------------------------------------
// 2. Built-in Safe Message Library (System Defaults)
// ------------------------------------------------------------------------------
export const SYSTEM_TEMPLATES: MessageTemplate[] = [
  {
    id: 'tmpl_sys_welcome_back',
    store_id: null,
    name: 'ترحيب العودة',
    body_text: 'مرحباً {{customer_name}}، اشتقنا لك في {{store_name}}! تفضل بزيارتنا ولديك رصيد {{points_balance}} نقطة بانتظارك.',
    allowed_channels: ['IN_APP', 'WHATSAPP', 'PUSH'],
    target_segment: 'at_risk',
    variables: ['customer_name', 'store_name', 'points_balance'],
    created_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'tmpl_sys_at_risk_rescue',
    store_id: null,
    name: 'إنقاذ العميل المعرض للفقد',
    body_text: 'أهلاً {{customer_name}}، مر وقت منذ زيارتك الأخيرة لـ {{store_name}}. ننتظر زيارتك للاستفادة من مكافأة {{reward_name}}!',
    allowed_channels: ['IN_APP', 'WHATSAPP', 'PUSH'],
    target_segment: 'at_risk',
    variables: ['customer_name', 'store_name', 'reward_name'],
    created_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'tmpl_sys_inactive_wake',
    store_id: null,
    name: 'تنشيط العميل الخامل',
    body_text: 'عزيزنا {{customer_name}}، هدية خاصة من {{store_name}} تنتظرك اليوم! استبدل {{points_balance}} نقطة بمكافأتك المفضلة.',
    allowed_channels: ['IN_APP', 'WHATSAPP', 'PUSH'],
    target_segment: 'inactive',
    variables: ['customer_name', 'store_name', 'points_balance'],
    created_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'tmpl_sys_lost_reactivation',
    store_id: null,
    name: 'استعادة العميل المفقود',
    body_text: 'عرض استثنائي لك يا {{customer_name}} من {{store_name}}! يسعدنا عودتك بخصم خاص مضاعف على طلبك القادم.',
    allowed_channels: ['IN_APP', 'WHATSAPP', 'PUSH'],
    target_segment: 'lost',
    variables: ['customer_name', 'store_name'],
    created_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'tmpl_sys_loyal_vip',
    store_id: null,
    name: 'شكر وتقدير عملاء الولاء',
    body_text: 'شكراً لولائك الدائم يا {{customer_name}} في {{store_name}}! تم ترقية مزاياك الحصرية وإضافة مكافأة خاصة.',
    allowed_channels: ['IN_APP', 'WHATSAPP', 'PUSH'],
    target_segment: 'loyal',
    variables: ['customer_name', 'store_name'],
    created_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'tmpl_sys_high_value_exclusive',
    store_id: null,
    name: 'عرض كبار العملاء',
    body_text: 'عميلنا المميز {{customer_name}}، رصيدك في {{store_name}} هو {{points_balance}} نقطة. استبدل مكافأة {{reward_name}} الآن!',
    allowed_channels: ['IN_APP', 'WHATSAPP', 'PUSH'],
    target_segment: 'high_value',
    variables: ['customer_name', 'store_name', 'reward_name', 'points_balance'],
    created_at: '2026-10-01T00:00:00.000Z',
  },
];

// ------------------------------------------------------------------------------
// 3. In-Memory Stores for Custom Templates, Campaigns, Deliveries & Idempotency
// ------------------------------------------------------------------------------
export const customTemplatesStore = new Map<string, MessageTemplate>();
export const campaignsStore = new Map<string, ReactivationCampaign>();
export const idempotencySendsStore = new Map<string, { timestamp: number; result: any }>();
export const idempotencyCampaignsStore = new Map<string, { timestamp: number; result: any }>();
export const customerCampaignDispatches = new Set<string>(); // `${campaignId}_${customerId}`
export const deliveredInAppNotifications = new Map<string, any[]>(); // customerId -> array of notifications

// ------------------------------------------------------------------------------
// 4. Mock Customers for Deterministic Security Tests & Test Suites
// ------------------------------------------------------------------------------
const nowMs = Date.now();
const dayMs = 86400000;

export const mockCustomerRecords: CustomerActivityRecord[] = [
  // Store A Customers
  {
    id: 'cust-a-active-1',
    store_id: 'a0000000-0000-0000-0000-000000000001',
    phone: '0501111111',
    name: 'سالم أحمد (نشط)',
    wallet_balance: 45,
    lifetime_xp: 90,
    visits_count: 3,
    last_visit_date: new Date(nowMs - 2 * dayMs).toISOString(),
    created_at: new Date(nowMs - 30 * dayMs).toISOString(),
  },
  {
    id: 'cust-a-atrisk-2',
    store_id: 'a0000000-0000-0000-0000-000000000001',
    phone: '0502222222',
    name: 'فاطمة خالد (معرض للانقطاع)',
    wallet_balance: 60,
    lifetime_xp: 150,
    visits_count: 4,
    last_visit_date: new Date(nowMs - 25 * dayMs).toISOString(),
    created_at: new Date(nowMs - 90 * dayMs).toISOString(),
  },
  {
    id: 'cust-a-inactive-3',
    store_id: 'a0000000-0000-0000-0000-000000000001',
    phone: '0503333333',
    name: 'عبدالله محمد (خامل)',
    wallet_balance: 30,
    lifetime_xp: 120,
    visits_count: 2,
    last_visit_date: new Date(nowMs - 60 * dayMs).toISOString(),
    created_at: new Date(nowMs - 120 * dayMs).toISOString(),
  },
  {
    id: 'cust-a-lost-4',
    store_id: 'a0000000-0000-0000-0000-000000000001',
    phone: '0504444444',
    name: 'منى إبراهيم (مفقود)',
    wallet_balance: 10,
    lifetime_xp: 40,
    visits_count: 1,
    last_visit_date: new Date(nowMs - 110 * dayMs).toISOString(),
    created_at: new Date(nowMs - 180 * dayMs).toISOString(),
  },
  {
    id: 'cust-a-loyal-5',
    store_id: 'a0000000-0000-0000-0000-000000000001',
    phone: '0505555555',
    name: 'خالد يوسف (ولاء دائم)',
    wallet_balance: 80,
    lifetime_xp: 320,
    visits_count: 8,
    last_visit_date: new Date(nowMs - 5 * dayMs).toISOString(),
    created_at: new Date(nowMs - 150 * dayMs).toISOString(),
  },
  {
    id: 'cust-a-highval-6',
    store_id: 'a0000000-0000-0000-0000-000000000001',
    phone: '0506666666',
    name: 'ريم عبدالعزيز (قيمة عالية)',
    wallet_balance: 240,
    lifetime_xp: 650,
    visits_count: 15,
    last_visit_date: new Date(nowMs - 8 * dayMs).toISOString(),
    created_at: new Date(nowMs - 200 * dayMs).toISOString(),
  },
  // Store B Customer (Dedicated for Cross-Store Isolation Tests)
  {
    id: 'cust-b-target-1',
    store_id: 'b0000000-0000-0000-0000-000000000002',
    phone: '0507777777',
    name: 'طارق علي (متجر ب)',
    wallet_balance: 50,
    lifetime_xp: 100,
    visits_count: 3,
    last_visit_date: new Date(nowMs - 20 * dayMs).toISOString(),
    created_at: new Date(nowMs - 60 * dayMs).toISOString(),
  },
];

// Initialize a custom template belonging to Store B for Cross-Store Template Tests
customTemplatesStore.set('tmpl_custom_store_b_vip', {
  id: 'tmpl_custom_store_b_vip',
  store_id: 'b0000000-0000-0000-0000-000000000002',
  name: 'عرض حصري خاص بمتجر ب',
  body_text: 'مرحبا {{customer_name}} في متجر ب فقط!',
  allowed_channels: ['IN_APP'],
  variables: ['customer_name'],
  created_at: '2026-10-01T00:00:00.000Z',
});

// ------------------------------------------------------------------------------
// 5. Derived Segmentation & Action Logic
// ------------------------------------------------------------------------------
export function deriveCustomerSegmentation(
  customer: CustomerActivityRecord,
  referenceDate = new Date()
): DerivedCustomerInfo {
  const refTime = referenceDate.getTime();
  const lastVisit = customer.last_visit_date ? new Date(customer.last_visit_date).getTime() : null;
  const createdAt = new Date(customer.created_at || Date.now()).getTime();

  const daysSinceLastVisit = lastVisit
    ? Math.max(0, Math.floor((refTime - lastVisit) / (1000 * 60 * 60 * 24)))
    : Math.max(0, Math.floor((refTime - createdAt) / (1000 * 60 * 60 * 24)));

  let segment: CustomerSegment;
  let priority: 'HIGH' | 'MEDIUM' | 'LOW';
  let suggestedAction: string;

  // Evaluation criteria
  const isHighValue = (customer.wallet_balance || 0) >= 100 || (customer.lifetime_xp || 0) >= 500;
  const isLoyal = (customer.visits_count || 0) >= 5 || (customer.lifetime_xp || 0) >= 200;

  if (isHighValue && daysSinceLastVisit <= 30) {
    segment = 'high_value';
    priority = 'HIGH';
    suggestedAction = 'إرسال دعوة خاصة لكبار العملاء أو ترقية استثنائية';
  } else if (isLoyal && daysSinceLastVisit <= 30) {
    segment = 'loyal';
    priority = 'MEDIUM';
    suggestedAction = 'مكافأة تقديرية للحفاظ على استمرارية الزيارات';
  } else if (daysSinceLastVisit <= 14) {
    segment = 'active';
    priority = 'LOW';
    suggestedAction = 'المتابعة الدورية وإبراز المكافآت الجديدة';
  } else if (daysSinceLastVisit <= 45) {
    segment = 'at_risk';
    priority = 'HIGH';
    suggestedAction = 'إرسال رسالة تذكير فورية مع مكافأة زيارة قبل الانقطاع';
  } else if (daysSinceLastVisit <= 90) {
    segment = 'inactive';
    priority = 'HIGH';
    suggestedAction = 'عرض إعادة تنشيط جذاب مع نقاط مجانية أو خصم مباشر';
  } else {
    segment = 'lost';
    priority = 'MEDIUM';
    suggestedAction = 'حملة استعادة كبرى (Radar Rescue) بعرض استثنائي لا يُفوت';
  }

  return {
    ...customer,
    days_since_last_visit: daysSinceLastVisit,
    segment,
    reactivation_priority: priority,
    suggested_action: suggestedAction,
  };
}

// ------------------------------------------------------------------------------
// 6. Safe Server-Side Variable Replacement
// ------------------------------------------------------------------------------
export function renderTemplateText(templateText: string, variables: Record<string, any>): string {
  if (!templateText) return '';
  return templateText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const val = variables[key];
    if (val !== undefined && val !== null) {
      return String(val);
    }
    return match;
  });
}

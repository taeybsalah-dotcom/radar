import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Customer,
  Store,
  Tier,
  Privilege,
  AuditLog,
  DynamicQRToken,
  StoreStaff,
  StoreOnboardingPayload,
  CustomerCoupon,
  StoreBanner,
  StoreWallet,
  StoreInvoice,
  StoreSubscriptionStatus,
  CatalogItem,
  StoreFulfillmentSettings,
  CartItem,
  WhatsAppOrderPayload,
  StoreSpecialist,
  GlobalCategory,
  GlobalModifierGroup,
  ServiceBooking,
  BillingPlan,
  MerchantLead,
  LeadStatus,
  PartnerAccount,
  PartnerCommission,
  PartnerBonusMilestone,
  FinancialLedgerEntry,
  CreditNote,
  AffiliatePayoutRecord,
  ManualAdjustmentPayload,
  FinancialBreakdown,
  MasterFinancialMetrics,
  ProratedUpgradeCalculation,
  FinancialPlatformConfig,
  UnifiedLifecycleStage,
  UnifiedStageInfo,
  resolveUnifiedStage,
  getStoreUnifiedStage,
} from '../types';
import {
  INITIAL_STORES,
  INITIAL_STORE,
  INITIAL_CUSTOMERS,
  INITIAL_TIERS,
  INITIAL_PRIVILEGES,
  INITIAL_AUDIT_LOGS,
  INITIAL_STAFF,
  INITIAL_CUSTOMER_COUPONS,
  INITIAL_STORE_WALLETS,
  INITIAL_INVOICES,
  INITIAL_FINANCIAL_LEDGER,
  INITIAL_CATALOG_ITEMS,
  INITIAL_SPECIALISTS,
  INITIAL_GLOBAL_CATEGORIES,
  INITIAL_GLOBAL_MODIFIERS,
  INITIAL_BOOKINGS,
} from './demoData';
import { LoyaltyEvents } from './events';
import { isDemoStoreSlug, isDemoStore } from './slugUtils';
import {
  DEMO_STORE_ID,
  DEMO_STORE_SLUG,
  INITIAL_DEMO_STORE,
  INITIAL_DEMO_TIERS,
  INITIAL_DEMO_PRIVILEGES,
  INITIAL_DEMO_STAFF,
  INITIAL_DEMO_CUSTOMERS,
  INITIAL_DEMO_CATALOG_ITEMS,
  INITIAL_DEMO_SPECIALISTS,
  INITIAL_DEMO_WALLET,
  INITIAL_DEMO_COUPONS,
  INITIAL_DEMO_AUDIT_LOGS,
} from './demoStoreSeed';

const STORAGE_KEYS = {
  URL: 'radar_supabase_url',
  ANON_KEY: 'radar_supabase_anon_key',
  LOCAL_STORES: 'radar_local_stores',
  LOCAL_CUSTOMERS: 'radar_local_customers',
  LOCAL_LOGS: 'radar_local_logs',
  LOCAL_STAFF: 'radar_local_staff',
  LOCAL_TIERS: 'radar_local_tiers',
  LOCAL_PRIVILEGES: 'radar_local_privileges',
  LOCAL_COUPONS: 'radar_local_customer_coupons',
  LOCAL_WALLETS: 'radar_local_store_wallets',
  LOCAL_INVOICES: 'radar_local_invoices',
  LOCAL_CATALOG: 'radar_local_catalog_items',
  LOCAL_SPECIALISTS: 'radar_local_specialists',
  LOCAL_GLOBAL_CATEGORIES: 'radar_local_global_categories',
  LOCAL_GLOBAL_MODIFIERS: 'radar_local_global_modifiers',
  LOCAL_BOOKINGS: 'radar_local_service_bookings',
  LOCAL_ORDERS: 'radar_local_whatsapp_orders',
  LOCAL_PARTNERS: 'radar_local_partners',
  LOCAL_PARTNER_PINS: 'radar_partner_pins',
  LOCAL_LEADS: 'radar_local_merchant_leads',
  LOCAL_COMMISSIONS: 'radar_local_partner_commissions',
  LOCAL_BONUS_AWARDS: 'radar_local_partner_bonus_awards',
  LOCAL_BONUS_RULES: 'radar_local_partner_bonus_rules',
  LOCAL_BILLING_PLANS: 'radar_local_billing_plans',
  LOCAL_FINANCIAL_LEDGER: 'radar_financial_ledger',
  LOCAL_CREDIT_NOTES: 'radar_credit_notes',
  LOCAL_AFFILIATE_PAYOUTS: 'radar_affiliate_payouts',
  LOCAL_WEBHOOK_EVENTS: 'radar_webhook_events',
  CONSUMED_TOKENS: 'radar_consumed_tokens',
  LOCAL_FINANCIAL_CONFIG: 'radar_financial_config',
};

// Auto-purge any stale mock/demo data from client browser localStorage on startup
if (typeof window !== 'undefined') {
  try {
    const DATA_VERSION_KEY = 'radar_schema_version';
    const TARGET_VERSION = 'v3_zero_state_clean';
    if (localStorage.getItem(DATA_VERSION_KEY) !== TARGET_VERSION) {
      const keysToPurge = [
        'radar_local_stores',
        'radar_stores',
        'radar_local_customers',
        'radar_customers',
        'radar_financial_ledger',
        'radar_local_partners',
        'radar_partners',
        'radar_local_merchant_leads',
        'radar_local_leads',
        'radar_local_catalog_items',
        'radar_local_staff',
        'radar_local_invoices',
        'radar_local_store_wallets',
        'radar_local_service_bookings',
        'radar_local_tiers',
        'radar_local_privileges',
        'radar_local_customer_coupons',
        'radar_local_specialists',
        'radar_local_global_categories',
        'radar_local_global_modifiers',
        'radar_local_partner_commissions',
        'radar_local_partner_bonus_awards',
        'radar_credit_notes',
        'radar_affiliate_payouts',
        'radar_consumed_tokens',
        'radar_demo_mode',
      ];
      keysToPurge.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });
      // Clear demo session if lingering
      const partnerSession = localStorage.getItem('radar_partner_session');
      if (partnerSession && (partnerSession.includes('demo') || partnerSession.includes('partner-demo'))) {
        localStorage.removeItem('radar_partner_session');
      }
      localStorage.setItem(DATA_VERSION_KEY, TARGET_VERSION);
    }
  } catch {}
}

const PROD_SUPABASE_URL = 'https://zagpvflyizbmzsbmhnts.supabase.co';
const PROD_SUPABASE_ANON_KEY = 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';

const STAGING_SUPABASE_URL = 'https://jipqqhtgfpgrurkozccl.supabase.co';
const STAGING_SUPABASE_ANON_KEY = 'sb_publishable_NiNUdhILZLkMNGqpUUrfoA_eI_0-pSU';

export function getSupabaseCredentials() {
  return {
    url: PROD_SUPABASE_URL,
    anonKey: PROD_SUPABASE_ANON_KEY,
    isConfigured: true,
  };
}

export function saveSupabaseCredentials(url: string, anonKey: string) {
  localStorage.setItem(STORAGE_KEYS.URL, url.trim());
  localStorage.setItem(STORAGE_KEYS.ANON_KEY, anonKey.trim());
}

export function clearSupabaseCredentials() {
  localStorage.removeItem(STORAGE_KEYS.URL);
  localStorage.removeItem(STORAGE_KEYS.ANON_KEY);
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseCredentials();
  if (!isConfigured) return null;
  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, anonKey);
      LoyaltyEvents.initRealtime(supabaseInstance);
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
      return null;
    }
  }
  return supabaseInstance;
}

function withTimeout<T>(promise: PromiseLike<T> | Promise<T>, ms: number = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
    Promise.resolve(promise)
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function getLocalData<T>(key: string, defaultVal: T): T {
  try {
    let data = localStorage.getItem(key);
    if (!data) {
      const altKey = key.startsWith('radar_local_')
        ? key.replace('radar_local_', 'radar_')
        : key.replace('radar_', 'radar_local_');
      data = localStorage.getItem(altKey);
    }
    if (!data) return defaultVal;
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.filter(Boolean);
      return (cleaned.length > 0 ? cleaned : defaultVal) as unknown as T;
    }
    return (parsed || defaultVal) as T;
  } catch {
    return defaultVal;
  }
}

function saveLocalData<T>(key: string, data: T): void {
  // localStorage is treated as a best-effort cache only.
  // A QuotaExceededError (or any storage error) must NEVER propagate to callers,
  // because the source of truth is always Supabase — not the local cache.
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
    const altKey = key.startsWith('radar_local_')
      ? key.replace('radar_local_', 'radar_')
      : key.replace('radar_', 'radar_local_');
    try {
      localStorage.setItem(altKey, serialized);
    } catch {}
  } catch (err: any) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22);

    if (isQuota && Array.isArray(data)) {
      // Trim the array to the most recent 50 items and retry once.
      // This preserves recent data while freeing space.
      try {
        const trimmed = (data as unknown[]).slice(0, 50);
        localStorage.setItem(key, JSON.stringify(trimmed));
      } catch {
        // Still failing after trim — give up silently.
        // The app will fall back to Supabase on next read.
        console.warn(`[saveLocalData] localStorage still full after trim for key "${key}". Skipping local cache.`);
      }
    } else {
      // Non-quota error (e.g. private browsing restrictions) — skip silently.
      console.warn(`[saveLocalData] Could not write to localStorage for key "${key}":`, err?.name || err);
    }
  }
}

export function isUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export function toUUID(str?: string | null): string {
  if (str && isUUID(str)) return str;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizePhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  // 1. تحويل الأرقام المكتوبة بالصيغة العربية (٠-٩) والفارسية (۰-۹) إلى أرقام قياسية (0-9)
  const arabicNumerals = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
  let converted = String(rawPhone).replace(/[٠-٩۰۱۲۳۴۵۶۷۸۹]/g, (d) => {
    const idx = arabicNumerals.indexOf(d);
    return (idx % 10).toString();
  });

  // 2. إزالة كافة الرموز والمسافات والشرطات
  let digitsOnly = converted.replace(/\D/g, '');

  // 3. إزالة المفتاح الدولي (00966 أو 966)
  if (digitsOnly.startsWith('00966')) {
    digitsOnly = digitsOnly.substring(5);
  } else if (digitsOnly.startsWith('966')) {
    digitsOnly = digitsOnly.substring(3);
  }

  // 4. إزالة الصفر الأول لتوحيد المطابقة (مثل: 0556677889 تصبح 556677889)
  if (digitsOnly.startsWith('0')) {
    digitsOnly = digitsOnly.substring(1);
  }

  return digitsOnly;
}

// ==============================================================================
// خدمات النظام الموحدة (Unified Service Layer)
// ==============================================================================

export function normalizeStore(s: any): Store {
  if (!s || typeof s !== 'object') return s;
  let slider_images: StoreBanner[] = [];
  if (Array.isArray(s.slider_images)) {
    slider_images = s.slider_images;
  } else if (typeof s.slider_images === 'string') {
    try {
      const parsed = JSON.parse(s.slider_images);
      if (Array.isArray(parsed)) {
        slider_images = parsed;
      }
    } catch {
      slider_images = [];
    }
  }

  let manager_contact = s.manager_contact || null;

  // 1. التحقق من وجود فواتير مدفوعة للمتجر في سجل الفواتير المحلي
  let latestPaidInvoice: StoreInvoice | null = null;
  try {
    const allInvoices = getLocalData<Record<string, StoreInvoice[]>>(STORAGE_KEYS.LOCAL_INVOICES, {});
    const storeInvoices: StoreInvoice[] = (s.id && allInvoices[s.id]) || (s.slug && allInvoices[s.slug]) || [];
    const paidInvs = storeInvoices.filter((inv: StoreInvoice) => inv && inv.status === 'paid');
    if (paidInvs.length > 0) {
      latestPaidInvoice = paidInvs[0];
    }
  } catch {}

  const hasPaidInvoice = Boolean(latestPaidInvoice);

  // التحقق من وجود عمولة معتمدة أو قيد مالي يثبت سداد المتجر
  let hasCommissionProof = false;
  try {
    const allComms = getLocalData<PartnerCommission[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    const matchComm = allComms.find(
      (c) => c && (c.store_id === s.id || (s.id && isUUID(s.id) && c.store_id === s.id)) && (c.status === 'EARNED' || c.status === 'PAID')
    );
    if (matchComm) {
      hasCommissionProof = true;
    }
  } catch {}

  // 2. التحقق الحتمي من حالة الاشتراك المدفوع (Paid Active)
  // لا يمكن للمتجر أن يعامل كتجربة إذا سدد رسوم التأسيس (setup_fee_paid === true) أو كان اشتراكه مفعلاً
  const isSuspended = s.status === 'suspended' || s.subscription_status === 'suspended';
  const hasPaidPlan = Boolean(
    s.subscription_plan_id &&
      s.subscription_plan_id !== 'trial' &&
      s.subscription_plan_id !== 'plan-trial'
  );
  const hasPaidProof = Boolean(
    hasPaidInvoice ||
      hasCommissionProof ||
      hasPaidPlan ||
      (s.setup_fee_paid === true &&
        (s.lifecycle_stage === 'مشترك مدفوع' || s.status === 'مشترك مدفوع' || s.status === 'PAID_ACTIVE'))
  );

  const isExplicitTrial =
    s.status === 'trial' ||
    s.subscription_status === 'trial' ||
    s.setup_fee_paid === false ||
    !hasPaidProof;
  const isPaid = !isSuspended && !isExplicitTrial && hasPaidProof;

  // 3. استرجاع المتجر المخزن محلياً للحفاظ على بيانات الباقة وتاريخ الصلاحية
  let localExistingStore: Store | null = null;
  try {
    const allLocalStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, []);
    localExistingStore = allLocalStores.find((ls) => ls && (ls.id === s.id || (ls.slug && ls.slug === s.slug))) || null;
  } catch {}

  // 4. استخراج الخطة الحقيقية من المعرف الأساسي في قاعدة البيانات (subscription_plan_id)
  let computedPlanId = s.subscription_plan_id || localExistingStore?.subscription_plan_id || latestPaidInvoice?.plan_id;
  let computedPlanName = s.subscription_plan || localExistingStore?.subscription_plan || latestPaidInvoice?.plan_name;
  let computedPlanCode = s.plan_code || localExistingStore?.plan_code;

  if (computedPlanId) {
    if (computedPlanId === 'a418c6e7-5749-4186-92ce-c46d721fe9ba' || computedPlanId === 'plan-pro' || computedPlanId === 'PRO' || (computedPlanName && (computedPlanName.includes('الاحترافية') || computedPlanName.includes('PRO')))) {
      computedPlanId = 'a418c6e7-5749-4186-92ce-c46d721fe9ba';
      computedPlanName = 'الباقة الاحترافية';
      computedPlanCode = 'PRO';
    } else if (computedPlanId === 'fad2e3cf-141c-4e0e-9432-194615a3ef37' || computedPlanId === 'plan-advanced' || computedPlanId === 'ADVANCED' || (computedPlanName && (computedPlanName.includes('المتقدمة') || computedPlanName.includes('ADVANCED')))) {
      computedPlanId = 'fad2e3cf-141c-4e0e-9432-194615a3ef37';
      computedPlanName = 'الباقة المتقدمة';
      computedPlanCode = 'ADVANCED';
    } else if (computedPlanId === '8371f0bb-b52e-4198-a5e9-bc51390174f0' || computedPlanId === 'plan-basic' || computedPlanId === 'BASIC' || (computedPlanName && (computedPlanName.includes('الأساسية') || computedPlanName.includes('BASIC')))) {
      computedPlanId = '8371f0bb-b52e-4198-a5e9-bc51390174f0';
      computedPlanName = 'الباقة الأساسية';
      computedPlanCode = 'BASIC';
    } else {
      try {
        const allBillingPlans = getLocalData<BillingPlan[]>(STORAGE_KEYS.LOCAL_BILLING_PLANS, []);
        const matched = allBillingPlans.find((p) => p.id === computedPlanId || p.code === computedPlanId);
        if (matched) {
          computedPlanName = matched.name;
          computedPlanCode = matched.code;
        }
      } catch {}
    }
  } else if (computedPlanName) {
    if (computedPlanName.includes('الاحترافية') || computedPlanName.includes('PRO') || computedPlanName.includes('Pro')) {
      computedPlanId = 'a418c6e7-5749-4186-92ce-c46d721fe9ba';
      computedPlanName = 'الباقة الاحترافية';
      computedPlanCode = 'PRO';
    } else if (computedPlanName.includes('المتقدمة') || computedPlanName.includes('ADVANCED') || computedPlanName.includes('Advanced')) {
      computedPlanId = 'fad2e3cf-141c-4e0e-9432-194615a3ef37';
      computedPlanName = 'الباقة المتقدمة';
      computedPlanCode = 'ADVANCED';
    } else if (computedPlanName.includes('الأساسية') || computedPlanName.includes('BASIC') || computedPlanName.includes('Basic')) {
      computedPlanId = '8371f0bb-b52e-4198-a5e9-bc51390174f0';
      computedPlanName = 'الباقة الأساسية';
      computedPlanCode = 'BASIC';
    }
  }

  let computedRenewalAmount = Number(s.renewal_amount) || Number(localExistingStore?.renewal_amount);
  if (computedPlanCode === 'PRO' || computedPlanId === 'a418c6e7-5749-4186-92ce-c46d721fe9ba') {
    computedRenewalAmount = 1890;
  } else if (computedPlanCode === 'ADVANCED' || computedPlanId === 'fad2e3cf-141c-4e0e-9432-194615a3ef37') {
    computedRenewalAmount = 1190;
  } else if (computedPlanCode === 'BASIC' || computedPlanId === '8371f0bb-b52e-4198-a5e9-bc51390174f0') {
    computedRenewalAmount = 690;
  }

  let computedEndDate =
    s.subscription_end_date ||
    localExistingStore?.subscription_end_date;
  let computedStartDate =
    s.subscription_start_date ||
    localExistingStore?.subscription_start_date ||
    latestPaidInvoice?.paid_at ||
    s.created_at ||
    new Date().toISOString();

  if (latestPaidInvoice && !computedEndDate) {
    const invAmount = Number(latestPaidInvoice.amount) || 195;
    const startMs = new Date(computedStartDate).getTime();
    let durationDays = 30;
    if (invAmount >= 1000 || (computedPlanName && computedPlanName.includes('6'))) {
      durationDays = 180;
    } else if (invAmount >= 500 || (computedPlanName && (computedPlanName.includes('3') || computedPlanName.includes('الأساسية')))) {
      durationDays = 90;
    } else if (invAmount >= 1800 || (computedPlanName && (computedPlanName.includes('سنوي') || computedPlanName.includes('الاحترافية')))) {
      durationDays = 365;
    }
    computedEndDate = new Date(startMs + durationDays * 86400000).toISOString();
  }

  // ضبط ومواءمة تاريخ نهاية الاشتراك التلقائي ليتطابق مع مدة الباقة النشطة (الأساسية: 90 يوم، المتقدمة: 180 يوم، الاحترافية: 365 يوم)
  if (isPaid) {
    const startMs = new Date(computedStartDate).getTime();
    let expectedPlanDays = 90;
    if (computedPlanCode === 'PRO' || (computedPlanName && (computedPlanName.includes('الاحترافية') || computedPlanName.includes('سنوي') || computedPlanName.includes('12')))) {
      expectedPlanDays = 365;
    } else if (computedPlanCode === 'ADVANCED' || (computedPlanName && (computedPlanName.includes('المتقدمة') || computedPlanName.includes('6')))) {
      expectedPlanDays = 180;
    } else {
      expectedPlanDays = 90;
    }

    const minEndMs = startMs + expectedPlanDays * 86400000;
    const currentEndMs = computedEndDate ? new Date(computedEndDate).getTime() : 0;
    if (!computedEndDate || currentEndMs < minEndMs) {
      computedEndDate = new Date(minEndMs).toISOString();
    }
  }

  // إذا لم يكن مشتركاً مدفوعاً، فهو في فترة التجربة المجانية (14 يوم)
  const trialStart = s.trial_start_date || s.created_at || new Date().toISOString();
  const trialEnd = s.trial_end_date || new Date(new Date(trialStart).getTime() + 14 * 86400000).toISOString();

  const finalStage: UnifiedLifecycleStage = isPaid
    ? 'مشترك مدفوع'
    : isSuspended
    ? 'تحت المراجعة'
    : s.lifecycle_stage === 'جاري التأسيس'
    ? 'جاري التأسيس'
    : 'تم التأسيس';

  return {
    ...s,
    setup_fee_paid: isPaid || s.setup_fee_paid === true,
    status: isSuspended ? 'suspended' : isPaid ? 'active' : (s.status || 'trial'),
    subscription_status: isSuspended ? 'suspended' : isPaid ? 'active' : (s.subscription_status || 'trial'),
    lifecycle_stage: finalStage,
    subscription_plan: isPaid
      ? (computedPlanName && computedPlanName !== 'trial' && computedPlanName !== 'فترة تجربة مجانية (14 يوم)' ? computedPlanName : 'الباقة الأساسية')
      : (s.subscription_plan && s.subscription_plan !== 'trial' && s.subscription_plan !== 'الباقة الأساسية' && s.subscription_plan !== 'pro' ? s.subscription_plan : 'فترة تجربة مجانية (14 يوم)'),
    subscription_plan_id: computedPlanId || (isPaid ? 'plan-basic' : undefined),
    plan_code: computedPlanCode || (isPaid ? 'BASIC' : undefined),
    renewal_amount: computedRenewalAmount || 690,
    subscription_start_date: isPaid ? computedStartDate : trialStart,
    subscription_end_date: isPaid ? (computedEndDate || new Date(Date.now() + 90 * 86400000).toISOString()) : trialEnd,
    trial_start_date: trialStart,
    trial_end_date: trialEnd,
    manager_contact,
    slider_images: slider_images.filter((img) => img && typeof img === 'object' && Boolean(img.image_url)),
  };
}

export function normalizeLead(l: any): MerchantLead {
  if (!l || typeof l !== 'object') {
    return {
      id: `lead-${Date.now()}`,
      store_name: 'متجر جديد',
      manager_name: 'مدير المتجر',
      phone: '',
      attribution_source: 'DIRECT',
      status: 'NEW',
      lifecycle_stage: 'طلب جديد',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  let effectiveStatus = (l.status as LeadStatus) || 'NEW';
  let effectiveStage = l.lifecycle_stage;

  // فحص ما إذا كان المتجر المرتبط مسدداً أو لديه عمولة معتمدة
  let hasPaidStoreOrComm = effectiveStage === 'مشترك مدفوع';
  if (!hasPaidStoreOrComm && typeof window !== 'undefined') {
    try {
      const rawStores = localStorage.getItem('radar_local_stores');
      if (rawStores) {
        const parsed = JSON.parse(rawStores);
        if (Array.isArray(parsed)) {
          const mStore = parsed.find(
            (s: any) =>
              (s.id && (s.id === l.converted_store_id || s.id === l.id)) ||
              (s.manager_contact && l.phone && normalizePhone(s.manager_contact) === normalizePhone(l.phone)) ||
              (s.name && l.store_name && s.name.trim().toLowerCase() === l.store_name.trim().toLowerCase())
          );
          if (mStore && (mStore.setup_fee_paid === true || mStore.status === 'active')) {
            hasPaidStoreOrComm = true;
          }
        }
      }
      if (!hasPaidStoreOrComm) {
        const rawComms = localStorage.getItem('radar_local_partner_commissions');
        if (rawComms) {
          const comms = JSON.parse(rawComms);
          if (Array.isArray(comms)) {
            const mComm = comms.find(
              (c: any) =>
                (c.merchant_lead_id && c.merchant_lead_id === l.id) ||
                (c.store_id && c.store_id === l.converted_store_id) ||
                (c.merchant_name && l.store_name && c.merchant_name.trim().toLowerCase() === l.store_name.trim().toLowerCase())
            );
            if (mComm && (mComm.status === 'EARNED' || mComm.status === 'AVAILABLE' || mComm.status === 'PAID')) {
              hasPaidStoreOrComm = true;
            }
          }
        }
      }
    } catch {}
  }

  if (l.converted_store_id || l.status === 'CONVERTED' || l.status === 'APPROVED' || l.status === 'SETUP_COMPLETE' || l.status === 'تم التأسيس') {
    effectiveStatus = 'CONVERTED';
    effectiveStage = hasPaidStoreOrComm ? 'مشترك مدفوع' : 'تم التأسيس';
  } else if (hasPaidStoreOrComm) {
    effectiveStatus = 'CONVERTED';
    effectiveStage = 'مشترك مدفوع';
  }

  const stageInfo = resolveUnifiedStage({
    ...l,
    status: effectiveStatus,
    lifecycle_stage: effectiveStage,
  });

  return {
    id: String(l.id || `lead-${Date.now()}`),
    store_name: String(l.store_name || l.storeName || 'متجر جديد'),
    manager_name: String(l.manager_name || l.managerName || l.owner_name || l.ownerName || 'مدير المتجر'),
    phone: String(l.phone || ''),
    city: l.city || null,
    business_type: l.business_type || l.businessType || null,
    attribution_source: l.attribution_source === 'REFERRAL' ? 'REFERRAL' : 'DIRECT',
    referral_code: l.referral_code || l.referralCode || null,
    status: effectiveStatus,
    lifecycle_stage: stageInfo.label,
    conversion_started_at: l.conversion_started_at || null,
    conversion_error: l.conversion_error || null,
    converted_store_id: l.converted_store_id || null,
    notes: l.notes || null,
    created_at: l.created_at || new Date().toISOString(),
    updated_at: l.updated_at || new Date().toISOString(),
  };
}

const storeResolutionCache = new Map<string, { store: Store | null; timestamp: number }>();
const storeResolutionInFlight = new Map<string, Promise<Store | null>>();
const STORE_RESOLUTION_TTL = 30000; // 30s in-memory cache
const scanDebounceCache = new Map<string, { timestamp: number; promise: Promise<any> }>();

// ⚡ كاش ذاكرة فائق السرعة لعمليات منصة Radar (0ms Instant In-Memory Cache)
let adminStoresSummaryCache: {
  data: {
    stores: Store[];
    analytics: Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }>;
  };
  timestamp: number;
} | null = null;
let storesListCache: { data: Store[]; timestamp: number } | null = null;
let partnersListCache: { data: any[]; timestamp: number } | null = null;
let leadsListCache: { data: MerchantLead[]; timestamp: number } | null = null;
let ledgerListCache: { data: FinancialLedgerEntry[]; timestamp: number } | null = null;
const SERVICE_CACHE_TTL = 0; // ⚡ Server-First / No-Store Policy: All dashboards, commissions, and users fetch directly from backend

export const invalidateAdminStoresCache = () => {
  adminStoresSummaryCache = null;
  storesListCache = null;
};

export const invalidatePartnersCache = () => {
  partnersListCache = null;
};

export const invalidateLeadsCache = () => {
  leadsListCache = null;
};

export const invalidateLedgerCache = () => {
  ledgerListCache = null;
};

export const invalidateAllServiceCaches = () => {
  adminStoresSummaryCache = null;
  storesListCache = null;
  partnersListCache = null;
  leadsListCache = null;
  ledgerListCache = null;
};

// 🔄 ربط الإلغاء الفوري التلقائي للكاش مع أي حدث نظام لحظي (Auto-Invalidate on Any Event)
try {
  if (typeof window !== 'undefined') {
    LoyaltyEvents.listen((event) => {
      if (
        event.type === 'STORE_UPDATED' ||
        event.type === 'SUBSCRIPTION_UPDATED' ||
        event.type === 'PAYMENT_COMPLETED' ||
        event.type === 'LEAD_UPDATED' ||
        event.type === 'PARTNER_UPDATED' ||
        event.type === 'STAFF_UPDATED'
      ) {
        invalidateAllServiceCaches();
      }
    });
  }
} catch {}

// ==============================================================================
// 🛡️ EGRESS GUARD — explicit column lists (never select('*') on heavy tables)
// stores.logo_url / stores.slider_images and customer_coupons.privilege_image_url
// may hold base64 data URLs (hundreds of KB each). They are excluded from list /
// polling queries and fetched once per hour per client via attachStoreAssets().
// ==============================================================================
const STORE_SAFE_COLS =
  'id, slug, name, logo_url, slider_images, primary_color, secondary_color, points_per_riyal, subscription_active, status, subscription_status, setup_fee_paid, manager_name, manager_contact, custom_domain, welcome_gift_type, welcome_points, welcome_offer_title, telegram_chat_id, telegram_notifications_enabled, trial_start_date, trial_end_date, subscription_plan_id, subscription_start_date, subscription_end_date, created_at, updated_at';
const STORE_FULL_COLS = STORE_SAFE_COLS;
const CUSTOMER_SAFE_COLS = 'id, store_id, phone, name, lifetime_xp, wallet_balance, last_visit_date, is_demo, created_at, updated_at';
const CUSTOMER_FULL_COLS = CUSTOMER_SAFE_COLS;
const COUPON_SAFE_COLS =
  'id, coupon_code, store_id, customer_id, customer_phone, customer_name, privilege_id, privilege_title, cost_points, status, valid_start_time, valid_end_time, purchased_at';
const COUPON_FULL_COLS = COUPON_SAFE_COLS + ', used_at, cashier_name';

// Probe (zero-row query, no payload) once per table to learn which optional columns exist.
const colProbeCache = new Map<string, Promise<'*'>>();
function probeCols(supabase: any, table: string, full: string, safe: string): Promise<'*'> {
  let p = colProbeCache.get(table);
  if (!p) {
    p = (async () => {
      try {
        const r: any = await supabase.from(table).select(full).limit(0);
        if (!r.error) return full as unknown as '*';
        if (!/column|42703|PGRST204/i.test(String(r.error.code || '') + String(r.error.message || ''))) {
          colProbeCache.delete(table); // transient error — retry next time
        }
      } catch {
        colProbeCache.delete(table);
      }
      return safe as unknown as '*';
    })();
    colProbeCache.set(table, p);
  }
  return p;
}
const storeCols = (s: any) => probeCols(s, 'stores', STORE_FULL_COLS, STORE_SAFE_COLS);
const customerCols = (s: any) => probeCols(s, 'store_customers', CUSTOMER_FULL_COLS, CUSTOMER_SAFE_COLS);
const couponCols = (s: any) => probeCols(s, 'customer_coupons', COUPON_FULL_COLS, COUPON_SAFE_COLS);

// Heavy store assets (logo + slider) — fetched at most once per hour, persisted in sessionStorage.
const STORE_ASSET_TTL = 3600000;
const STORE_ASSET_SS_KEY = 'radar_store_assets_v1';
const storeAssetsCache = new Map<string, { logo_url: any; slider_images: any; ts: number }>();
try {
  if (typeof sessionStorage !== 'undefined') {
    const raw = sessionStorage.getItem(STORE_ASSET_SS_KEY);
    if (raw) Object.entries(JSON.parse(raw)).forEach(([k, v]: any) => storeAssetsCache.set(k, v));
  }
} catch {}
function persistStoreAssets() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORE_ASSET_SS_KEY, JSON.stringify(Object.fromEntries(storeAssetsCache)));
    }
  } catch {}
}
function mergeStoreAssets(row: any): any {
  const a = row && row.id ? storeAssetsCache.get(row.id) : undefined;
  return a ? { ...row, logo_url: a.logo_url, slider_images: a.slider_images } : row;
}
async function attachStoreAssets(supabase: any, row: any): Promise<any> {
  if (!row || !isUUID(row.id)) return row;
  const a = storeAssetsCache.get(row.id);
  if (!a || Date.now() - a.ts > STORE_ASSET_TTL) {
    try {
      const { data } = await supabase.from('stores').select('logo_url, slider_images').eq('id', row.id).maybeSingle();
      if (data) {
        storeAssetsCache.set(row.id, { logo_url: data.logo_url, slider_images: data.slider_images, ts: Date.now() });
        persistStoreAssets();
      }
    } catch {}
  }
  return mergeStoreAssets(row);
}

// Non-heavy tables: explicit list, falls back to '*' only if a listed column is missing in the live schema.
const WALLET_COLS = 'id, store_id, sms_quota, sms_used, wa_quota, wa_used, cashier_limit, extra_cashiers_purchased, whatsapp_provider, meta_phone_number_id, meta_waba_id, meta_access_token, created_at, updated_at';
const STAFF_COLS = 'id, store_id, user_id, name, phone, role, is_active, can_manual_input_phone, created_at, updated_at';
const TIER_COLS = 'id, store_id, tier_name, required_xp, badge_color, icon, created_at';
const PRIVILEGE_COLS = 'id, store_id, required_tier_id, title, description, image_url, cost_points, quantity_limit, per_customer_limit, redeemed_count, valid_start_time, valid_end_time, is_active, is_hidden, created_at';
const LEDGER_COLS = 'id, ledger_id, transaction_id, invoice_id, store_id, store_name, affiliate_id, affiliate_name, payment_id, transaction_type, gross_amount, vat_amount, gateway_fee, affiliate_commission, net_platform_amount, status, created_at, effective_at, reversal_of, refund_of, created_by, metadata';
const LEAD_COLS = 'id, store_name, manager_name, phone, normalized_phone, city, business_type, attribution_source, referral_code, affiliate_id, status, conversion_started_at, conversion_error, converted_store_id, notes, created_at, updated_at';
const PLAN_COLS = 'id, code, name, description, amount, currency, duration_months, billing_interval, trial_days, features, active, created_at';
const walletCols = (s: any) => probeCols(s, 'store_wallets', WALLET_COLS, '*');
const staffCols = (s: any) => probeCols(s, 'store_staff', STAFF_COLS, '*');
const tierCols = (s: any) => probeCols(s, 'tiers', TIER_COLS, '*');
const privilegeCols = (s: any) => probeCols(s, 'privileges', PRIVILEGE_COLS, '*');
const ledgerCols = (s: any) => probeCols(s, 'financial_ledger', LEDGER_COLS, '*');
const leadCols = (s: any) => probeCols(s, 'merchant_leads', LEAD_COLS, '*');
const planCols = (s: any) => probeCols(s, 'billing_plans', PLAN_COLS, '*');

// 🛡️ NEVER persist base64 data URLs in the database. Images must be uploaded to Storage first
// (see imageCompressor.ts) and only the public URL saved. Any data: value is dropped here as a last line of defence.
const IMAGE_URL_KEYS = ['logo_url', 'image_url', 'privilege_image_url', 'avatar_url'];
const isDataUrl = (v: any) => typeof v === 'string' && v.trim().toLowerCase().startsWith('data:');
function stripDataUrls<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  for (const k of IMAGE_URL_KEYS) {
    if (isDataUrl((obj as any)[k])) {
      console.warn('[egress-guard] dropped base64 value for', k);
      (obj as any)[k] = null;
    }
  }
  if (Array.isArray((obj as any).slider_images)) {
    (obj as any).slider_images = (obj as any).slider_images.filter((s: any) => !isDataUrl(s?.image_url));
  }
  return obj;
}

// Keep the asset cache coherent when a caller changes logo/slider (mutations no longer echo them back).
function pickStoreAssets(updates: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (updates && 'logo_url' in updates) out.logo_url = updates.logo_url;
  if (updates && 'slider_images' in updates) out.slider_images = updates.slider_images;
  return out;
}
function noteStoreAssetUpdates(storeId: string, updates: any) {
  const picked = pickStoreAssets(updates);
  if (!storeId || Object.keys(picked).length === 0) return;
  const prev = storeAssetsCache.get(storeId);
  storeAssetsCache.set(storeId, {
    logo_url: 'logo_url' in picked ? picked.logo_url : prev?.logo_url ?? null,
    slider_images: 'slider_images' in picked ? picked.slider_images : prev?.slider_images ?? [],
    ts: Date.now(),
  });
  persistStoreAssets();
}

const couponImageCache = new Map<string, string>(); // privilege_id -> image (loaded once per session)
const couponImagesLoaded = new Set<string>();

export const LoyaltyService = {
  // 1. جلب جميع المتاجر (من Supabase مباشرة Server-First)
  async getAllStores(forceFresh: boolean = true): Promise<Store[]> {
    if (!forceFresh && storesListCache && (Date.now() - storesListCache.timestamp < SERVICE_CACHE_TTL)) {
      return storesListCache.data;
    }

    const supabase = getSupabaseClient();
    const currentLocal = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, []);

    if (supabase) {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('stores')
            .select(await storeCols(supabase))
            .order('created_at', { ascending: false }),
          3500
        );
        if (!error && Array.isArray(data)) {
          const validStores = data.filter((s: any) => Boolean(s && s.id)).map((dbStore: any) => {
            return normalizeStore(mergeStoreAssets(dbStore));
          }) as Store[];
          saveLocalData(STORAGE_KEYS.LOCAL_STORES, validStores);
          storesListCache = { data: validStores, timestamp: Date.now() };
          return validStores;
        }
      } catch (e) {
        console.warn('Supabase getAllStores fallback to local:', e);
      }
    }

    // في حال عدم توفر اتصال بـ Supabase نستخدم الكاش المحلي
    if (currentLocal && Array.isArray(currentLocal)) {
      const valid = currentLocal.filter((s) => Boolean(s && s.id)).map(normalizeStore);
      storesListCache = { data: valid, timestamp: Date.now() };
      return valid;
    }
    return [];
  },

  // 1.1 مصادقة مالك المنصة الرسمية السحابية (Super Admin Official Authentication)
  async superAdminSignIn(email: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'تعذر الاتصال بخدمة المصادقة السحابية' };
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
      if (error || !data.session) {
        return { success: false, error: error?.message || 'فشل تسجيل الدخول: بيانات الاعتماد غير صحيحة' };
      }

      // التحقق من صلاحية المالك عبر السيرفر
      const verifyRes = await this.verifySuperAdminSession();
      if (!verifyRes.is_super_admin) {
        await supabase.auth.signOut();
        return { success: false, error: 'هذا الحساب لا يمتلك صلاحيات مالك المنصة (Super Admin)' };
      }

      return { success: true, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول' };
    }
  },

  async verifySuperAdminSession(): Promise<{ authenticated: boolean; is_super_admin: boolean; email?: string; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { authenticated: false, is_super_admin: false };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { authenticated: false, is_super_admin: false };

      // التحقق عبر الدالة السحابية المحمية
      const { data, error } = await supabase.rpc('verify_super_admin_session');
      if (!error && data && data.is_super_admin) {
        return {
          authenticated: true,
          is_super_admin: true,
          email: data.email || session.user.email,
        };
      }

      // فحص احتياطي للـ Claims في الـ Token
      const role = session.user.app_metadata?.role || (session.user.user_metadata as any)?.role;
      const isSuper = role === 'super_admin' || role === 'admin' || (session.user.app_metadata as any)?.is_super_admin === true;
      return {
        authenticated: Boolean(session),
        is_super_admin: Boolean(isSuper),
        email: session.user.email,
      };
    } catch (e: any) {
      console.warn('[LoyaltyService] verifySuperAdminSession error:', e);
      return { authenticated: false, is_super_admin: false, error: e.message };
    }
  },

  async superAdminSignOut(): Promise<void> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }
  },

  // 1.2 جلب جميع ملخصات الشركاء المالية المجمعة بالسيرفر بطلب واحد (Single Batch Aggregation RPC)
  async getAllPartnerFinancialSummaries(forceFresh: boolean = false): Promise<Record<string, {
    pending_commissions: number;
    earned_commissions: number;
    paid_commissions: number;
    bonuses_earned: number;
    bonuses_paid: number;
    total_payable: number;
    currency: string;
  }>> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('get_all_partner_financial_summaries');
        if (!error && data && typeof data === 'object') {
          return data;
        }
      } catch (err) {
        console.warn('[LoyaltyService] RPC get_all_partner_financial_summaries failed, falling back:', err);
      }
    }

    // Dynamic Fallback: Batch load commissions and bonuses in 2 bulk requests instead of N loops
    try {
      const allPartners = await this.getAllPartners();
      const summariesMap: Record<string, any> = {};

      let allComms: any[] = [];
      let allAwards: any[] = [];

      if (supabase) {
        const [cRes, aRes] = await Promise.all([
          supabase.from('partner_commissions').select('*').neq('status', 'PENDING'),
          Promise.resolve(supabase.from('partner_bonus_awards').select('*')).catch(() => ({ data: [] as any })),
        ]);
        if (cRes.data) allComms = cRes.data;
        if (aRes.data) allAwards = aRes.data;
      }

      if (allComms.length === 0) {
        allComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
      }
      if (allAwards.length === 0) {
        allAwards = getLocalData<any[]>(STORAGE_KEYS.LOCAL_BONUS_AWARDS, []);
      }

      allPartners.forEach((p) => {
        let earned_commissions = 0;
        let paid_commissions = 0;
        let bonuses_earned = 0;
        let bonuses_paid = 0;

        allComms.forEach((c) => {
          const match = c.partner_account_id === p.id || (p.affiliate_id && c.partner_account_id === p.affiliate_id);
          if (match) {
            const amt = Number(c.commission_amount) || 0;
            if (c.status === 'PAID') paid_commissions += amt;
            else if (c.status === 'EARNED' || c.status === 'AVAILABLE') earned_commissions += amt;
          }
        });

        allAwards.forEach((a) => {
          const match = a.partner_account_id === p.id || (p.affiliate_id && a.partner_account_id === p.affiliate_id);
          if (match) {
            const amt = Number(a.bonus_amount) || 0;
            if (a.status === 'ACHIEVED') bonuses_earned += amt;
            else if (a.status === 'AWARDED' || a.status === 'PAID') bonuses_paid += amt;
          }
        });

        const total_payable = Math.round((earned_commissions + bonuses_earned) * 100) / 100;
        const total_paid = Math.round((paid_commissions + bonuses_paid) * 100) / 100;

        summariesMap[p.id] = {
          pending_commissions: 0,
          earned_commissions: Math.round(earned_commissions * 100) / 100,
          paid_commissions: total_paid,
          bonuses_earned: Math.round(bonuses_earned * 100) / 100,
          bonuses_paid: Math.round(bonuses_paid * 100) / 100,
          total_payable,
          currency: 'SAR',
        };
      });

      return summariesMap;
    } catch (fallbackErr) {
      console.error('[LoyaltyService] getAllPartnerFinancialSummaries fallback error:', fallbackErr);
      return {};
    }
  },


  // 1.1 جلب ملخص المتاجر المجمّع للـ Super Admin في طلب خادم فائق السرعة Server-First
  async getSuperAdminStoresSummary(forceFresh: boolean = true): Promise<{
    stores: Store[];
    analytics: Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }>;
  }> {
    // 1. التحقق من كاش الذاكرة اللحظي للوحة المالك (0ms Response)
    if (!forceFresh && adminStoresSummaryCache && (Date.now() - adminStoresSummaryCache.timestamp < SERVICE_CACHE_TTL)) {
      return adminStoresSummaryCache.data;
    }

    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('stores')
            .select((`${await storeCols(supabase)}, store_customers(count), store_staff(count)`) as unknown as '*')
            .order('created_at', { ascending: false }),
          2000
        );

        if (!error && Array.isArray(data)) {
          const validStores = (data as any[])
            .filter((s) => Boolean(s && s.id))
            .map((dbStore) => normalizeStore(mergeStoreAssets(dbStore))) as Store[];
          saveLocalData(STORAGE_KEYS.LOCAL_STORES, validStores);

          const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, INITIAL_CUSTOMERS);
          const localLogs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, INITIAL_AUDIT_LOGS);
          const localStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);

          const analytics: Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }> = {};
          for (const item of data as any[]) {
            const storeId = item.id;
            const dbCustCount = Number(item.store_customers?.[0]?.count) || 0;
            const dbStaffCount = Number(item.store_staff?.[0]?.count) || 0;

            const sLocalCust = localCustomers.filter((c) => c.store_id === storeId).length;
            const sLocalStaff = localStaff.filter((st) => st.store_id === storeId).length;
            const sLocalLogs = localLogs.filter((l) => l.store_id === storeId);
            const sLocalSales = sLocalLogs.reduce((sum, l) => sum + (Number(l.purchase_amount) || 0), 0);
            const sLocalPoints = sLocalLogs.reduce((sum, l) => sum + (l.points_changed > 0 ? l.points_changed : 0), 0);

            analytics[storeId] = {
              customerCount: Math.max(dbCustCount, sLocalCust),
              totalSales: sLocalSales,
              totalPoints: sLocalPoints,
              staffCount: Math.max(dbStaffCount, sLocalStaff),
            };
          }

          const result = { stores: validStores, analytics };
          adminStoresSummaryCache = { data: result, timestamp: Date.now() };
          return result;
        }
      } catch (fallbackErr) {
        console.warn('Single consolidated stores query failed, using local fallback', fallbackErr);
      }
    }

    // 2. التخزين المحلي السريع في حالة انقطاع الاتصال (Instant Local Fallback)
    const localStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, []);
    const validStores = (localStores && Array.isArray(localStores) ? localStores : []).map(normalizeStore);
    const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, INITIAL_CUSTOMERS);
    const localLogs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, INITIAL_AUDIT_LOGS);
    const localStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);

    const analytics: Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }> = {};
    for (const s of validStores) {
      const sLocalCust = localCustomers.filter((c) => c.store_id === s.id).length;
      const sLocalStaff = localStaff.filter((st) => st.store_id === s.id).length;
      const sLocalLogs = localLogs.filter((l) => l.store_id === s.id);
      analytics[s.id] = {
        customerCount: sLocalCust,
        totalSales: sLocalLogs.reduce((sum, l) => sum + (Number(l.purchase_amount) || 0), 0),
        totalPoints: sLocalLogs.reduce((sum, l) => sum + (l.points_changed > 0 ? l.points_changed : 0), 0),
        staffCount: sLocalStaff,
      };
    }

    const result = { stores: validStores, analytics };
    adminStoresSummaryCache = { data: result, timestamp: Date.now() };
    return result;
  },

  // 🎯 تهيئة وضمان وجود متجر الديمو المتكامل (Demo Store Auto-Seed)
  async seedDemoStore(forceReset: boolean = false): Promise<Store> {
    const localStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, []);
    const existing = localStores.find((s) => s && (s.id === DEMO_STORE_ID || s.slug === DEMO_STORE_SLUG));

    if (existing && !forceReset) {
      return existing;
    }

    // 1. Store
    const updatedStores = [
      INITIAL_DEMO_STORE,
      ...localStores.filter((s) => s && s.id !== DEMO_STORE_ID && s.slug !== DEMO_STORE_SLUG),
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_STORES, updatedStores);

    // 2. Tiers
    const localTiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, []);
    const updatedTiers = [
      ...INITIAL_DEMO_TIERS,
      ...localTiers.filter((t) => t.store_id !== DEMO_STORE_ID),
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_TIERS, updatedTiers);

    // 3. Privileges
    const localPrivs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, []);
    const updatedPrivs = [
      ...INITIAL_DEMO_PRIVILEGES,
      ...localPrivs.filter((p) => p.store_id !== DEMO_STORE_ID),
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, updatedPrivs);

    // 4. Catalog Items
    const localCatalog = getLocalData<CatalogItem[]>(STORAGE_KEYS.LOCAL_CATALOG, []);
    const updatedCatalog = [
      ...INITIAL_DEMO_CATALOG_ITEMS,
      ...localCatalog.filter((c) => c.store_id !== DEMO_STORE_ID),
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_CATALOG, updatedCatalog);

    // 5. Specialists
    const localSpecs = getLocalData<StoreSpecialist[]>(STORAGE_KEYS.LOCAL_SPECIALISTS, []);
    const updatedSpecs = [
      ...INITIAL_DEMO_SPECIALISTS,
      ...localSpecs.filter((s) => s.store_id !== DEMO_STORE_ID),
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, updatedSpecs);

    // 6. Staff
    const localStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, []);
    const updatedStaff = [
      ...INITIAL_DEMO_STAFF,
      ...localStaff.filter((s) => s.store_id !== DEMO_STORE_ID),
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_STAFF, updatedStaff);

    // 7. Customers
    const localCusts = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
    const updatedCusts = [
      ...INITIAL_DEMO_CUSTOMERS,
      ...localCusts.filter((c) => c.store_id !== DEMO_STORE_ID),
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, updatedCusts);

    // 8. Wallet
    const localWallets = getLocalData<Record<string, StoreWallet>>(STORAGE_KEYS.LOCAL_WALLETS, {});
    localWallets[DEMO_STORE_ID] = INITIAL_DEMO_WALLET;
    saveLocalData(STORAGE_KEYS.LOCAL_WALLETS, localWallets);

    // 9. Coupons
    const localCoupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []);
    const updatedCoupons = [
      ...INITIAL_DEMO_COUPONS,
      ...localCoupons.filter((c) => c.store_id !== DEMO_STORE_ID),
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_COUPONS, updatedCoupons);

    // 10. Audit Logs
    const localLogs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, []);
    const updatedLogs = [
      ...INITIAL_DEMO_AUDIT_LOGS,
      ...localLogs.filter((l) => l.store_id !== DEMO_STORE_ID),
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_LOGS, updatedLogs);

    // Clear caches
    storesListCache = null;
    adminStoresSummaryCache = null;
    storeResolutionCache.delete(DEMO_STORE_SLUG);
    storeResolutionCache.delete(DEMO_STORE_ID);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.rpc('reset_demo_store', { p_slug: DEMO_STORE_SLUG });
      } catch (e) {
        // Fallback is saved locally
      }
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: DEMO_STORE_ID });
    return INITIAL_DEMO_STORE;
  },

  // 🔄 تصفير متجر الديمو وحركاته وإعادته لنقطة الصفر الأصلية
  async resetDemoStore(): Promise<{ success: boolean; message: string }> {
    await this.seedDemoStore(true);
    return {
      success: true,
      message: 'تم تصفير بيانات متجر الديمو وإعادة تهيئته لنقطة الصفر بنجاح! ☕',
    };
  },

  // 2. البحث والتحقق من المتجر (سواء برقم الـ UUID أو الاسم اللطيف Slug) مع كاش ذاكرة وتخزين فائق السرعة (0ms)
  async resolveStore(storeIdOrSlug?: string | null, forceFresh: boolean = false): Promise<Store | null> {
    if (!storeIdOrSlug) return await this.getStore();
    const clean = String(storeIdOrSlug).trim();
    const cleanLower = clean.toLowerCase();

    // 0. فحص واسترجاع المتجر التجريبي الفوري (Demo Store Instant Resolution)
    if (cleanLower === DEMO_STORE_SLUG || clean === DEMO_STORE_ID || isDemoStoreSlug(cleanLower)) {
      const demoStore = await this.seedDemoStore();
      return demoStore;
    }

    // 1. فحص كاش الذاكرة اللحظي (0ms Instant Memory Cache)
    if (!forceFresh) {
      const cached = storeResolutionCache.get(cleanLower) || storeResolutionCache.get(clean);
      if (cached && (Date.now() - cached.timestamp < STORE_RESOLUTION_TTL) && cached.store) {
        return cached.store;
      }

      // 2. فحص الطلبات أثناء الطيران لمنع تكرار الاتصال المتزامن (In-Flight Request Coalescing)
      const pending = storeResolutionInFlight.get(cleanLower) || storeResolutionInFlight.get(clean);
      if (pending) {
        return await pending;
      }
    }

    const resolutionPromise = (async () => {
      try {
        const localStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, []);

        // 3. استعلام Supabase مباشر ومفهرس سريع كمصدر أساسي للحقيقة (Fast Single Source of Truth)
        const supabase = getSupabaseClient();
        if (supabase) {
          try {
            let storeQuery = supabase.from('stores').select(await storeCols(supabase));
            if (isUUID(clean)) {
              storeQuery = storeQuery.eq('id', clean);
            } else {
              storeQuery = storeQuery.eq('slug', cleanLower);
            }

            let { data, error } = await storeQuery.maybeSingle();

            // بحث بديل مرن بالاسم أو الـ slug أو الدومين المخصص إن لم يتطابق الـ slug بدقة
            if (!data && !isUUID(clean)) {
              const rootSlug = cleanLower.replace(/[iy]$/, '');
              const fallbackRes = await supabase
                .from('stores')
                .select(await storeCols(supabase))
                .or(`slug.ilike.%${rootSlug}%,name.ilike.%${clean}%,custom_domain.ilike.%${clean}%`)
                .limit(1)
                .maybeSingle();
              if (fallbackRes.data) data = fallbackRes.data;
            }

            if (!error && data && data.id) {
              const resolved = normalizeStore(await attachStoreAssets(supabase, data)) as Store;

              storeResolutionCache.set(cleanLower, { store: resolved, timestamp: Date.now() });
              storeResolutionCache.set(resolved.id.toLowerCase(), { store: resolved, timestamp: Date.now() });
              if (resolved.slug) storeResolutionCache.set(resolved.slug.toLowerCase(), { store: resolved, timestamp: Date.now() });
              if (resolved.custom_domain) storeResolutionCache.set(resolved.custom_domain.toLowerCase(), { store: resolved, timestamp: Date.now() });

              // تحديث الكاش المحلي
              const existingIdx = localStores.findIndex((s) => s.id === resolved.id);
              if (existingIdx !== -1) {
                localStores[existingIdx] = resolved;
              } else {
                localStores.unshift(resolved);
              }
              saveLocalData(STORAGE_KEYS.LOCAL_STORES, localStores);
              return resolved;
            }
          } catch (e) {
            console.warn('Supabase resolveStore failed', e);
          }
        }

        const stores = await this.getAllStores();
        const found = (
          stores.find(
            (s) =>
              s &&
              (s.id === clean ||
                (s.slug && s.slug.toLowerCase() === cleanLower) ||
                (s.custom_domain && s.custom_domain.toLowerCase() === cleanLower) ||
                (s.slug && s.slug.toLowerCase().replace(/[-_]/g, '') === cleanLower.replace(/[-_]/g, '')))
          ) || null
        );

        if (found) {
          const normalizedFound = normalizeStore(found);
          storeResolutionCache.set(cleanLower, { store: normalizedFound, timestamp: Date.now() });
          if (normalizedFound.slug) storeResolutionCache.set(normalizedFound.slug.toLowerCase(), { store: normalizedFound, timestamp: Date.now() });
          if (normalizedFound.custom_domain) storeResolutionCache.set(normalizedFound.custom_domain.toLowerCase(), { store: normalizedFound, timestamp: Date.now() });
          return normalizedFound;
        }

        // فحص المتاجر النموذجية والتجريبية (Demo & Sandbox Stores)
        const demoFound = INITIAL_STORES.find(
          (s) =>
            s &&
            (s.id === clean ||
              s.slug?.toLowerCase() === clean.toLowerCase() ||
              s.slug?.toLowerCase().replace(/[-_]/g, '') === clean.toLowerCase().replace(/[-_]/g, ''))
        );
        if (demoFound) {
          const normalizedDemo = normalizeStore(demoFound);
          storeResolutionCache.set(clean.toLowerCase(), { store: normalizedDemo, timestamp: Date.now() });
          return normalizedDemo;
        }

        return null;
      } finally {
        storeResolutionInFlight.delete(cleanLower);
        storeResolutionInFlight.delete(clean);
      }
    })();

    storeResolutionInFlight.set(cleanLower, resolutionPromise);
    storeResolutionInFlight.set(clean, resolutionPromise);
    return await resolutionPromise;
  },

  // 2.1 جلب متجر محدد بالـ Slug
  async getStoreBySlug(slug: string): Promise<Store | null> {
    if (!slug) return await this.getStore();
    return await this.resolveStore(slug);
  },

  // 2.2 جلب متجر محدد بالـ ID
  async getStoreById(id: string): Promise<Store | null> {
    if (!id) return await this.getStore();
    return await this.resolveStore(id);
  },

  // 3. جلب المتجر الافتراضي / الأول
  async getStore(): Promise<Store | null> {
    const stores = await this.getAllStores();
    const valid = stores.filter((s) => Boolean(s && s.id));
    if (valid.length > 0 && valid[0]) return valid[0];
    return null;
  },

  // 3.1 حذف متجر بكامل بياناته
  async deleteStore(storeId: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, []);
    const foundStore = stores.find((s) => s.id === storeId || s.slug === storeId);
    const targetStoreId = foundStore?.id || storeId;
    const targetSlug = foundStore?.slug || storeId;

    if (supabase) {
      try {
        let resolvedId = targetStoreId;
        if (!isUUID(resolvedId)) {
          const { data } = await supabase
            .from('stores')
            .select('id')
            .or(`id.eq.${resolvedId},slug.eq.${targetSlug.toLowerCase()}`)
            .maybeSingle();
          if (data?.id) resolvedId = data.id;
        }

        const childTables = [
          'store_customers',
          'customer_coupons',
          'audit_logs',
          'privileges',
          'tiers',
          'store_staff',
          'store_wallets',
        ];

        for (const tbl of childTables) {
          try {
            await supabase.from(tbl).delete().eq('store_id', resolvedId);
          } catch (err) {
            console.warn(`Failed to delete from ${tbl}`, err);
          }
        }

        await supabase.from('stores').delete().eq('id', resolvedId);
      } catch (e) {
        console.warn('Supabase deleteStore exception:', e);
      }
    }

    // Clean localStorage
    const updatedStores = stores.filter((s) => s.id !== storeId && s.slug !== storeId && s.id !== targetStoreId);
    saveLocalData(STORAGE_KEYS.LOCAL_STORES, updatedStores);

    const matchStore = (itemStoreId?: string) =>
      itemStoreId !== storeId && itemStoreId !== targetStoreId && itemStoreId !== targetSlug;

    const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []).filter((c) => matchStore(c.store_id));
    saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);

    const staff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, []).filter((s) => matchStore(s.store_id));
    saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staff);

    const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, []).filter((t) => matchStore(t.store_id));
    saveLocalData(STORAGE_KEYS.LOCAL_TIERS, tiers);

    const privs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, []).filter((p) => matchStore(p.store_id));
    saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, privs);

    const logs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, []).filter((l) => matchStore(l.store_id));
    saveLocalData(STORAGE_KEYS.LOCAL_LOGS, logs);

    const coupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []).filter((c) => matchStore(c.store_id));
    saveLocalData(STORAGE_KEYS.LOCAL_COUPONS, coupons);

    const wallets = getLocalData<Record<string, StoreWallet>>(STORAGE_KEYS.LOCAL_WALLETS, {});
    delete wallets[storeId];
    delete wallets[targetStoreId];
    delete wallets[targetSlug];
    saveLocalData(STORAGE_KEYS.LOCAL_WALLETS, wallets);

    invalidateAdminStoresCache();
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    return true;
  },

  // 3.2 تفريغ وحذف جميع المتاجر والبيانات بالكامل (Hard Reset)
  async resetAllPlatformData(): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const childTables = [
          'store_customers',
          'customer_coupons',
          'audit_logs',
          'privileges',
          'tiers',
          'store_staff',
          'store_wallets',
          'merchant_leads',
          'partner_accounts',
          'financial_ledger',
          'credit_notes',
          'affiliate_payouts',
        ];
        for (const tbl of childTables) {
          try {
            await supabase.from(tbl).delete().neq('id', '00000000-0000-0000-0000-000000000000');
          } catch {}
        }
        await supabase.from('stores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (e) {
        console.warn('Supabase resetAllPlatformData exception:', e);
      }
    }

    saveLocalData(STORAGE_KEYS.LOCAL_STORES, []);
    saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_STAFF, []);
    saveLocalData(STORAGE_KEYS.LOCAL_TIERS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, []);
    saveLocalData(STORAGE_KEYS.LOCAL_LOGS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_COUPONS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_WALLETS, {});
    saveLocalData(STORAGE_KEYS.LOCAL_INVOICES, {});
    saveLocalData(STORAGE_KEYS.LOCAL_LEADS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_FINANCIAL_LEDGER, []);
    saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_CREDIT_NOTES, []);
    saveLocalData(STORAGE_KEYS.LOCAL_AFFILIATE_PAYOUTS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_CATALOG, []);
    saveLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, []);

    if (typeof window !== 'undefined') {
      localStorage.removeItem('radar_financial_ledger');
      localStorage.removeItem('radar_local_financial_ledger');
      localStorage.removeItem('radar_local_partners');
      localStorage.removeItem('radar_partners');
      localStorage.removeItem('radar_local_leads');
      localStorage.removeItem('radar_leads');
      localStorage.removeItem('radar_credit_notes');
      localStorage.removeItem('radar_local_credit_notes');
      localStorage.removeItem('radar_affiliate_payouts');
      localStorage.removeItem('radar_local_affiliate_payouts');
      localStorage.removeItem('radar_last_store_slug');
    }

    storeResolutionCache.clear();
    invalidateAllServiceCaches();
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'all' });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    return true;
  },

  // 4. تأسيس متجر جديد من بوابة الـ Super Admin
  async createStoreConcierge(payload: StoreOnboardingPayload): Promise<{
    success: boolean;
    store: Store;
    manager: StoreStaff;
    portalUrl: string;
  }> {
    const cleanSlug = payload.slug.toLowerCase().trim();
    let createdStore: Store | null = null;
    let createdManager: StoreStaff | null = null;

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('create_store_concierge_onboarding', {
          p_name: payload.name.trim(),
          p_slug: cleanSlug,
          p_logo_url: payload.logo_url || null,
          p_primary_color: payload.primary_color || '#0F172A',
          p_secondary_color: payload.secondary_color || '#F59E0B',
          p_points_per_riyal: payload.points_per_riyal || 1.0,
          p_manager_name: payload.manager_name.trim(),
          p_manager_contact: payload.manager_contact.trim(),
          p_manager_pin: payload.manager_pin || '9999',
        });

        const nowIso = new Date().toISOString();
        const trialEndIso = new Date(Date.now() + 14 * 86400000).toISOString();

        if (!error && data && data.success) {
          createdStore = data.store as Store;
          createdManager = data.manager as StoreStaff;
        } else {
          console.warn('RPC create_store_concierge_onboarding failed, trying direct table insert', error);
          const { data: storeData, error: sErr } = await supabase
            .from('stores')
            .insert([
              {
                name: payload.name.trim(),
                slug: cleanSlug,
                custom_domain: payload.custom_domain ? payload.custom_domain.replace(/^https?:\/\//, '').replace(/\/$/, '') : null,
                logo_url: payload.logo_url,
                primary_color: payload.primary_color || '#0F172A',
                secondary_color: payload.secondary_color || '#F59E0B',
                points_per_riyal: payload.points_per_riyal || 1.0,
                manager_name: payload.manager_name.trim(),
                manager_contact: payload.manager_contact.trim(),
                subscription_active: true,
                status: 'trial',
                subscription_status: 'trial',
                setup_fee_paid: false,
              },
            ])
            .select(await storeCols(supabase))
            .single();

          if (!sErr && storeData) {
            createdStore = storeData as Store;
            const { data: staffData } = await supabase
              .from('store_staff')
              .insert([
                {
                  store_id: storeData.id,
                  name: payload.manager_name.trim(),
                  phone: payload.manager_contact.trim(),
                  role: 'admin',
                  pin_code: payload.manager_pin || '9999',
                  is_active: true,
                  can_manual_input_phone: true,
                },
              ])
              .select()
              .single();

            createdManager = staffData as StoreStaff;

            // Default Tiers
            await supabase.from('tiers').insert([
              { store_id: storeData.id, tier_name: 'ضيف (Guest)', required_xp: 0 },
              { store_id: storeData.id, tier_name: 'Insider مميز', required_xp: 150 },
              { store_id: storeData.id, tier_name: 'VIP Gold', required_xp: 500 },
              { store_id: storeData.id, tier_name: 'Black Elite 👑', required_xp: 1200 },
            ]);
          }
        }

        // 🛡️ Always enforce strict trial subscription defaults on newly founded store
        if (createdStore) {
          createdStore = {
            ...createdStore,
            status: 'trial',
            subscription_status: 'trial',
            subscription_plan: 'trial',
            setup_fee_paid: false,
            subscription_active: true,
            trial_start_date: createdStore.trial_start_date || nowIso,
            trial_end_date: createdStore.trial_end_date || trialEndIso,
            subscription_end_date: createdStore.trial_end_date || trialEndIso,
          };

          if (supabase && isUUID(createdStore.id)) {
            try {
              await supabase
                .from('stores')
                .update({
                  status: 'trial',
                  subscription_status: 'trial',
                  setup_fee_paid: false,
                  subscription_plan_id: null,
                  subscription_start_date: null,
                  subscription_end_date: null,
                  trial_start_date: createdStore.trial_start_date || nowIso,
                  trial_end_date: createdStore.trial_end_date || trialEndIso,
                })
                .eq('id', createdStore.id);
            } catch (uErr) {
              console.warn('[createStoreConcierge] DB trial sync warning:', uErr);
            }
          }
        }
      } catch (e) {
        console.warn('Supabase createStoreConcierge exception', e);
      }
    }

    // Invalidate Super Admin stores summary cache
    invalidateAdminStoresCache();

    // Always ensure stored in local cache so it never gets lost!
    const localStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const newStore: Store = createdStore || {
      id: 'store-' + Date.now(),
      slug: cleanSlug,
      name: payload.name.trim(),
      custom_domain: payload.custom_domain || undefined,
      logo_url:
        payload.logo_url ||
        'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=150&auto=format&fit=crop&q=80',
      primary_color: payload.primary_color || '#0F172A',
      secondary_color: payload.secondary_color || '#F59E0B',
      points_per_riyal: payload.points_per_riyal || 1.0,
      subscription_active: true,
      status: 'trial',
      subscription_status: 'trial',
      subscription_plan: 'trial',
      trial_start_date: new Date().toISOString(),
      trial_end_date: new Date(Date.now() + 14 * 86400000).toISOString(),
      subscription_start_date: new Date().toISOString(),
      subscription_end_date: new Date(Date.now() + 14 * 86400000).toISOString(),
      setup_fee_paid: false,
      renewal_amount: 195,
      payment_gateway: 'moyasar',
      manager_name: payload.manager_name.trim(),
      manager_contact: payload.manager_contact.trim(),
      created_at: new Date().toISOString(),
    };

    const existingIdx = localStores.findIndex((s) => s.slug === cleanSlug || (createdStore && s.id === createdStore.id));
    if (existingIdx !== -1) {
      localStores[existingIdx] = newStore;
    } else {
      localStores.unshift(newStore);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_STORES, localStores);

    // Save manager staff locally without duplicating or overwriting unrelated store staff
    const staffList = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);
    const newManager: StoreStaff = createdManager || {
      id: 'staff-' + Date.now(),
      store_id: newStore.id,
      name: payload.manager_name.trim(),
      phone: payload.manager_contact.trim(),
      role: 'admin',
      pin_code: payload.manager_pin || '9999',
      is_active: true,
      can_manual_input_phone: true,
    };
    const staffIdx = staffList.findIndex((st) => st.store_id === newStore.id && (st.role === 'admin' || st.phone === newManager.phone));
    if (staffIdx !== -1) {
      staffList[staffIdx] = { ...staffList[staffIdx], ...newManager };
    } else {
      staffList.unshift(newManager);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staffList);

    // Save default tiers locally
    const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, INITIAL_TIERS);
    tiers.push(
      { id: 't1-' + Date.now(), store_id: newStore.id, tier_name: 'ضيف (Guest)', required_xp: 0 },
      { id: 't2-' + Date.now(), store_id: newStore.id, tier_name: 'Insider مميز', required_xp: 150 },
      { id: 't3-' + Date.now(), store_id: newStore.id, tier_name: 'VIP Gold', required_xp: 500 },
      { id: 't4-' + Date.now(), store_id: newStore.id, tier_name: 'Black Elite 👑', required_xp: 1200 }
    );
    saveLocalData(STORAGE_KEYS.LOCAL_TIERS, tiers);

    // 🎯 Auto-link with matching lead in merchant_leads if exists by phone or store name
    try {
      const allLeads = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
      const targetPhone = normalizePhone(payload.manager_contact);
      const matchingLead = allLeads.find(
        (l) =>
          (l.phone && normalizePhone(l.phone) === targetPhone) ||
          (l.store_name && l.store_name.trim().toLowerCase() === payload.name.trim().toLowerCase())
      );
      if (matchingLead) {
        matchingLead.status = 'CONVERTED';
        matchingLead.converted_store_id = newStore.id;
        matchingLead.lifecycle_stage = 'تم التأسيس';
        matchingLead.updated_at = new Date().toISOString();
        saveLocalData(STORAGE_KEYS.LOCAL_LEADS, allLeads);

        const supabase = getSupabaseClient();
        if (supabase) {
          Promise.resolve(
            supabase
              .from('merchant_leads')
              .update({
                status: 'CONVERTED',
                converted_store_id: newStore.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', matchingLead.id)
          ).catch(() => {});
        }

        // Note: Commissions are ONLY recorded upon actual subscription payment, never during onboarding/trial
        invalidateLeadsCache();
        invalidatePartnersCache();
        LoyaltyEvents.emit({ type: 'LEAD_UPDATED', storeId: newStore.id });
        LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
      }
    } catch (linkErr) {
      console.warn('[createStoreConcierge] Auto lead linking warning:', linkErr);
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: newStore.id });
    return {
      success: true,
      store: newStore,
      manager: newManager,
      portalUrl: `/app/${newStore.slug}`,
    };
  },

  // 4.1 جلب الإحصائيات الكاملة للمتجر (دليل المتاجر)
  async getStoreFullAnalytics(storeId: string): Promise<{
    customerCount: number;
    totalSales: number;
    totalPoints: number;
    staffCount: number;
  }> {
    const supabase = getSupabaseClient();
    let customerCount = 0;
    let totalSales = 0;
    let totalPoints = 0;
    let staffCount = 0;

    if (supabase) {
      try {
        const [custRes, logRes, staffRes] = await Promise.all([
          supabase.from('store_customers').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
          supabase.from('audit_logs').select('purchase_amount, points_changed').eq('store_id', storeId),
          supabase.from('store_staff').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
        ]);

        customerCount = custRes.count || 0;
        staffCount = staffRes.count || 0;
        if (logRes.data) {
          totalSales = logRes.data.reduce((sum, item: any) => sum + (Number(item.purchase_amount) || 0), 0);
          totalPoints = logRes.data.reduce((sum, item: any) => sum + (Number(item.points_changed) > 0 ? Number(item.points_changed) : 0), 0);
        }
      } catch (e) {
        console.warn('Supabase getStoreFullAnalytics failed, using local fallback', e);
      }
    }

    // Combine / fallback to local data
    const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, INITIAL_CUSTOMERS).filter((c) => c.store_id === storeId);
    const localLogs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, INITIAL_AUDIT_LOGS).filter((l) => l.store_id === storeId);
    const localStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF).filter((s) => s.store_id === storeId);

    const localSales = localLogs.reduce((sum, l) => sum + (Number(l.purchase_amount) || 0), 0);
    const localPoints = localLogs.reduce((sum, l) => sum + (l.points_changed > 0 ? l.points_changed : 0), 0);

    return {
      customerCount: Math.max(customerCount, localCustomers.length),
      totalSales: Math.max(totalSales, localSales),
      totalPoints: Math.max(totalPoints, localPoints),
      staffCount: Math.max(staffCount, localStaff.length),
    };
  },

  // 5. تفعيل / تعطيل تشغيل المتجر (إيقاف مؤقت / تنشيط إداري - منفصل تماماً عن مدة وانتهاء الاشتراك)
  async toggleStoreSubscription(storeId: string, currentStatus?: boolean): Promise<boolean> {
    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const idx = stores.findIndex((s) => s.id === storeId || s.slug === storeId);
    let targetStore: Store = idx !== -1 ? stores[idx] : { ...INITIAL_STORE, id: storeId };

    const isCurrentlyActive = currentStatus !== undefined
      ? currentStatus
      : (targetStore.subscription_active !== false && targetStore.status !== 'suspended');

    const newActive = !isCurrentlyActive;
    const newStatus: StoreSubscriptionStatus = newActive
      ? (targetStore.setup_fee_paid ? 'active' : 'trial')
      : 'suspended';

    targetStore.subscription_active = newActive;
    targetStore.status = newStatus;
    targetStore.subscription_status = newStatus;

    if (idx !== -1) {
      stores[idx] = targetStore;
    } else {
      stores.push(targetStore);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_STORES, stores);

    invalidateAdminStoresCache();
    storeResolutionCache.delete(targetStore.id.toLowerCase());
    if (targetStore.slug) storeResolutionCache.delete(targetStore.slug.toLowerCase());

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const updatePayload: any = {
          subscription_active: newActive,
          status: newStatus,
          subscription_status: newStatus,
        };

        const query = supabase.from('stores').update(updatePayload);
        if (isUUID(targetStore.id)) {
          await query.eq('id', targetStore.id);
        } else {
          await query.eq('slug', targetStore.slug);
        }
      } catch (e) {
        console.warn('Supabase toggleStoreSubscription failed', e);
      }
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: targetStore.id });
    LoyaltyEvents.emit({ type: 'SUBSCRIPTION_UPDATED', storeId: targetStore.id });

    return newActive;
  },

  // 6. تحديث إعدادات المتجر وهوية العلامة التجارية (Colors, Logo, Manager, Domain, Points)
  async updateStoreSettings(storeId: string, updates: Partial<Store>): Promise<Store> {
    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const idx = stores.findIndex((s) => s.id === storeId || s.slug === storeId);
    let currentStore: Store = idx !== -1 ? stores[idx] : { ...INITIAL_STORE, id: storeId };

    const supabase = getSupabaseClient();
    let updatedSupabaseStore: Store | null = null;
    if (supabase) {
      try {
        const { lifecycle_stage, plan, matchedStore, ...dbUpdates } = stripDataUrls({ ...(updates as any) });
        const query = supabase.from('stores').update(dbUpdates);
        const res = isUUID(currentStore.id)
          ? await query.eq('id', currentStore.id).select(await storeCols(supabase)).maybeSingle()
          : await query.eq('slug', currentStore.slug).select(await storeCols(supabase)).maybeSingle();

        if (!res.error && res.data) {
          updatedSupabaseStore = { ...(res.data as any), ...pickStoreAssets(dbUpdates) } as Store;
          noteStoreAssetUpdates(currentStore.id, dbUpdates);
        }
      } catch (e) {
        console.warn('Supabase updateStoreSettings failed', e);
      }
    }

    const merged: Store = normalizeStore({
      ...currentStore,
      ...(updatedSupabaseStore || updates),
      updated_at: new Date().toISOString(),
    });
    if (idx !== -1) {
      stores[idx] = merged;
    } else {
      stores.unshift(merged);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_STORES, stores);

    // تحديث كاش الذاكرة فوراً لضمان انعكاس التغييرات لحظياً
    storeResolutionCache.set(merged.id.toLowerCase(), { store: merged, timestamp: Date.now() });
    if (merged.slug) {
      storeResolutionCache.set(merged.slug.toLowerCase(), { store: merged, timestamp: Date.now() });
    }

    // مزامنة بيانات مدير المتجر في جدول الموظفين (إذا تم تعديل الاسم أو رقم الجوال أو الرمز السري)
    if (updates.manager_name || updates.manager_contact || updates.admin_pin) {
      const staffList = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);
      const adminStaffIdx = staffList.findIndex(
        (st) => (st.store_id === merged.id || st.store_id === storeId || (merged.slug && st.store_id === merged.slug)) && st.role === 'admin'
      );
      if (adminStaffIdx !== -1) {
        if (updates.manager_name) staffList[adminStaffIdx].name = updates.manager_name;
        if (updates.manager_contact) staffList[adminStaffIdx].phone = updates.manager_contact;
        if (updates.admin_pin) staffList[adminStaffIdx].pin_code = updates.admin_pin;
        saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staffList);

        if (supabase) {
          try {
            const staffUpdateObj: any = {};
            if (updates.manager_name) staffUpdateObj.name = updates.manager_name;
            if (updates.manager_contact) staffUpdateObj.phone = updates.manager_contact;
            if (updates.admin_pin) staffUpdateObj.pin_code = updates.admin_pin;
            await supabase
              .from('store_staff')
              .update(staffUpdateObj)
              .eq('id', staffList[adminStaffIdx].id);
          } catch (e) {
            console.warn('Supabase sync staff manager contact/pin failed', e);
          }
        }
      }
    }

    invalidateAdminStoresCache();
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: merged.id });
    return merged;
  },

  // 6.1 إدارة محفظة باقات المتجر والحدود (Store Wallet & Quotas)
  async getStoreWallet(storeId: string): Promise<StoreWallet> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('store_wallets')
          .select(await walletCols(supabase))
          .eq('store_id', storeId)
          .maybeSingle();
        if (!error && data) return data as StoreWallet;
      } catch (e) {
        console.warn('Supabase getStoreWallet failed', e);
      }
    }

    const localWallets = getLocalData<Record<string, StoreWallet>>(
      STORAGE_KEYS.LOCAL_WALLETS,
      INITIAL_STORE_WALLETS
    );
    if (localWallets[storeId]) return localWallets[storeId];

    // Default wallet for newly created store
    const defaultWallet: StoreWallet = {
      id: 'wallet-' + storeId,
      store_id: storeId,
      sms_quota: 500,
      sms_used: 0,
      wa_quota: 200,
      wa_used: 0,
      cashier_limit: 2,
      extra_cashiers_purchased: 0,
      whatsapp_provider: 'direct',
      created_at: new Date().toISOString(),
    };
    localWallets[storeId] = defaultWallet;
    saveLocalData(STORAGE_KEYS.LOCAL_WALLETS, localWallets);
    return defaultWallet;
  },

  async updateStoreWallet(storeId: string, updates: Partial<StoreWallet>): Promise<StoreWallet> {
    const supabase = getSupabaseClient();
    let updatedSupabaseWallet: StoreWallet | null = null;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('store_wallets')
          .upsert([{ store_id: storeId, ...updates, updated_at: new Date().toISOString() }], {
            onConflict: 'store_id',
          })
          .select()
          .single();
        if (!error && data) {
          updatedSupabaseWallet = data as StoreWallet;
        }
      } catch (e) {
        console.warn('Supabase updateStoreWallet failed', e);
      }
    }

    const localWallets = getLocalData<Record<string, StoreWallet>>(
      STORAGE_KEYS.LOCAL_WALLETS,
      INITIAL_STORE_WALLETS
    );
    const current = localWallets[storeId] || {
      id: 'wallet-' + storeId,
      store_id: storeId,
      sms_quota: 500,
      sms_used: 0,
      wa_quota: 200,
      wa_used: 0,
      cashier_limit: 2,
      extra_cashiers_purchased: 0,
      whatsapp_provider: 'direct',
      created_at: new Date().toISOString(),
    };

    const merged: StoreWallet = {
      ...current,
      ...(updatedSupabaseWallet || updates),
      updated_at: new Date().toISOString(),
    };
    localWallets[storeId] = merged;
    saveLocalData(STORAGE_KEYS.LOCAL_WALLETS, localWallets);
    LoyaltyEvents.emit({ type: 'WALLET_UPDATED', storeId });
    return merged;
  },

  async purchaseExtraCashier(storeId: string, count: number = 1): Promise<StoreWallet> {
    const currentWallet = await this.getStoreWallet(storeId);
    const newExtra = (currentWallet.extra_cashiers_purchased || 0) + count;
    const updated = await this.updateStoreWallet(storeId, {
      extra_cashiers_purchased: newExtra,
    });
    return updated;
  },

  async deductWhatsAppQuota(storeId: string, count: number = 1): Promise<{ success: boolean; remaining: number; error?: string }> {
    const wallet = await this.getStoreWallet(storeId);
    const remaining = wallet.wa_quota - wallet.wa_used;
    if (remaining < count) {
      return {
        success: false,
        remaining: Math.max(0, remaining),
        error: `رصيد رسائل الواتساب غير كافٍ (${remaining} متبقية من أصل ${wallet.wa_quota}). يرجى شحن الباقة لمتابعة الإرسال.`,
      };
    }
    const newUsed = wallet.wa_used + count;
    await this.updateStoreWallet(storeId, { wa_used: newUsed });
    return { success: true, remaining: wallet.wa_quota - newUsed };
  },

  async deductSMSQuota(storeId: string, count: number = 1): Promise<{ success: boolean; remaining: number; error?: string }> {
    const wallet = await this.getStoreWallet(storeId);
    const remaining = wallet.sms_quota - wallet.sms_used;
    if (remaining < count) {
      return {
        success: false,
        remaining: Math.max(0, remaining),
        error: `رصيد الرسائل النصية القصيرة غير كافٍ (${remaining} متبقية من أصل ${wallet.sms_quota}). يرجى شحن الباقة.`,
      };
    }
    const newUsed = wallet.sms_used + count;
    await this.updateStoreWallet(storeId, { sms_used: newUsed });
    return { success: true, remaining: wallet.sms_quota - newUsed };
  },

  // 7. إدارة طاقم العمل
  async getStoreStaff(storeId: string): Promise<StoreStaff[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('store_staff')
          .select(await staffCols(supabase))
          .eq('store_id', storeId)
          .order('created_at', { ascending: true });
        if (!error && data) return data as StoreStaff[];
      } catch (e) {
        console.warn('Supabase getStoreStaff failed', e);
      }
    }
    const rawStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, []);
    return rawStaff.filter((s) => s.store_id === storeId);
  },

  async addStoreStaff(staffData: Omit<StoreStaff, 'id'>): Promise<StoreStaff> {
    const supabase = getSupabaseClient();
    let createdStaff: StoreStaff | null = null;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('store_staff')
          .insert([staffData])
          .select()
          .single();
        if (!error && data) createdStaff = data as StoreStaff;
      } catch (e) {
        console.warn('Supabase addStoreStaff failed', e);
      }
    }

    const staffList = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);
    const newStaff: StoreStaff = createdStaff || {
      ...staffData,
      id: 'staff-' + Date.now(),
    };
    if (!createdStaff) {
      staffList.push(newStaff);
    } else if (!staffList.some((s) => s.id === newStaff.id)) {
      staffList.push(newStaff);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staffList);

    LoyaltyEvents.emit({ type: 'STAFF_UPDATED', storeId: newStaff.store_id, staffId: newStaff.id });
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: newStaff.store_id });

    return newStaff;
  },

  async updateStoreStaff(staffId: string, updates: Partial<StoreStaff>): Promise<StoreStaff> {
    const supabase = getSupabaseClient();
    let updatedStaff: StoreStaff | null = null;
    
    const isSyntheticManager = staffId.startsWith('manager-');
    const targetStoreId = isSyntheticManager ? staffId.replace('manager-', '') : '';

    if (supabase && !isSyntheticManager) {
      try {
        const { data, error } = await supabase
          .from('store_staff')
          .update(updates)
          .eq('id', staffId)
          .select()
          .single();
        if (!error && data) updatedStaff = data as StoreStaff;
      } catch (e) {
        console.warn('Supabase updateStoreStaff failed', e);
      }
    }

    const staffList = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);
    let index = staffList.findIndex((s) => s.id === staffId);

    if (index === -1 && isSyntheticManager) {
      index = staffList.findIndex((s) => (s.store_id === targetStoreId) && s.role === 'admin');
    }

    let finalStaff: StoreStaff;
    if (index !== -1) {
      staffList[index] = { ...staffList[index], ...(updatedStaff || updates) };
      finalStaff = staffList[index];
      saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staffList);
    } else if (updatedStaff) {
      finalStaff = updatedStaff;
      staffList.push(updatedStaff);
      saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staffList);
    } else if (isSyntheticManager) {
      const store = await this.resolveStore(targetStoreId);
      finalStaff = {
        id: staffId,
        store_id: store?.id || targetStoreId,
        name: updates.name || store?.manager_name || 'مدير المتجر',
        phone: updates.phone || store?.manager_contact || '',
        role: 'admin',
        pin_code: updates.pin_code || store?.admin_pin || '9999',
        is_active: updates.is_active !== undefined ? updates.is_active : true,
        can_manual_input_phone: updates.can_manual_input_phone !== undefined ? updates.can_manual_input_phone : true,
        created_at: new Date().toISOString(),
      };
      staffList.push(finalStaff);
      saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staffList);
    } else {
      throw new Error('الموظف غير موجود');
    }

    // If this is an admin staff and pin_code was updated, sync to store.admin_pin
    if (finalStaff.role === 'admin' && updates.pin_code) {
      await this.updateStoreSettings(finalStaff.store_id, { admin_pin: updates.pin_code });
    }

    // Sync active staff session in localStorage if logged in
    try {
      const cashierSession = this.getStaffSession(finalStaff.store_id, 'cashier');
      if (cashierSession && (cashierSession.id === finalStaff.id || cashierSession.phone === finalStaff.phone)) {
        this.saveStaffSession(finalStaff.store_id, finalStaff);
      }
      const adminSession = this.getStaffSession(finalStaff.store_id, 'admin');
      if (adminSession && (adminSession.id === finalStaff.id || adminSession.phone === finalStaff.phone)) {
        this.saveStaffSession(finalStaff.store_id, finalStaff);
      }
    } catch (e) {
      console.warn('Failed to update staff session cache', e);
    }

    LoyaltyEvents.emit({ type: 'STAFF_UPDATED', storeId: finalStaff.store_id, staffId: finalStaff.id });
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: finalStaff.store_id });

    return finalStaff;
  },

  async deleteStoreStaff(staffId: string): Promise<boolean> {
    const staffList = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);
    const targetStaff = staffList.find((s) => s.id === staffId);
    const storeId = targetStaff?.store_id || '';

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { error } = await supabase.from('store_staff').delete().eq('id', staffId);
        if (!error) {
          // Success in Supabase
        }
      } catch (e) {
        console.warn('Supabase deleteStoreStaff failed', e);
      }
    }

    const filtered = staffList.filter((s) => s.id !== staffId);
    saveLocalData(STORAGE_KEYS.LOCAL_STAFF, filtered);

    if (storeId) {
      LoyaltyEvents.emit({ type: 'STAFF_UPDATED', storeId, staffId });
      LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    }

    return true;
  },

  // 7.0 المصادقة العمياء المشفرة بالسيرفر (Server-Side Blind PIN Verification via RPC)
  async verifyStaffPin(
    phone: string,
    pin: string,
    storeId?: string,
    storeSlug?: string,
    requiredRole?: 'admin' | 'cashier'
  ): Promise<{ success: boolean; staff?: StoreStaff & { matchedStore?: Store }; error?: string; message?: string }> {
    const normPhone = normalizePhone(phone);
    const normPin = pin.trim();
    if (!normPhone || !normPin) {
      return { success: false, error: 'INVALID_INPUT', message: 'يرجى إدخال رقم الجوال والرمز السري' };
    }

    const currentStore = await this.resolveStore(storeId || storeSlug);
    const resolvedStoreId = currentStore?.id || storeId;
    const resolvedStoreSlug = currentStore?.slug || storeSlug;

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('verify_staff_pin', {
          p_phone: normPhone,
          p_pin: normPin,
          p_store_id: resolvedStoreId && isUUID(resolvedStoreId) ? resolvedStoreId : null,
          p_store_slug: resolvedStoreSlug || null,
          p_required_role: requiredRole || null,
        });

        if (!error && data) {
          if (data.success && data.staff) {
            const returnedStaff = data.staff;
            return {
              success: true,
              staff: {
                id: returnedStaff.id,
                store_id: returnedStaff.store_id || resolvedStoreId,
                name: returnedStaff.name,
                phone: returnedStaff.phone,
                role: returnedStaff.role,
                is_active: returnedStaff.is_active ?? true,
                can_manual_input_phone: returnedStaff.can_manual_input_phone ?? true,
                matchedStore: currentStore || undefined,
              } as StoreStaff & { matchedStore?: Store },
            };
          } else {
            return {
              success: false,
              error: data.error || 'INVALID_CREDENTIALS',
              message: data.message || 'رقم الجوال أو الرمز السري (PIN) غير صحيح',
            };
          }
        }
      } catch (rpcErr) {
        console.warn('[LoyaltyService] RPC verify_staff_pin failed:', rpcErr);
      }
    }

    // Fallback محلي فقط للبيئة التجريبية التجريبية (Demo/Local Offline Fallback)
    const localStaff = await this.findStaffByPhone(resolvedStoreId || '', phone, requiredRole, resolvedStoreSlug);
    if (localStaff) {
      const correctPin = (localStaff.pin_code || (localStaff.role === 'admin' ? '9999' : '1234')).trim();
      if (normPin === correctPin) {
        const sanitized = { ...localStaff };
        delete (sanitized as any).pin_code;
        return {
          success: true,
          staff: sanitized,
        };
      }
    }

    return {
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'رقم الجوال أو الرمز السري (PIN) غير صحيح',
    };
  },

  // 7.1 البحث عن موظف أو مدير برقم الجوال للتحقق الآمن والدخول (Strictly Scoped to Store)
  async findStaffByPhone(
    storeId?: string,
    phone: string = '',
    requiredRole?: 'admin' | 'cashier',
    storeSlug?: string
  ): Promise<(StoreStaff & { matchedStore?: Store }) | null> {
    const normInput = normalizePhone(phone);
    if (!normInput || normInput.length < 5) return null;

    // 0. التحقق من وجود المتجر المستهدف
    const currentStore = await this.resolveStore(storeId || storeSlug);
    const resolvedStoreId = currentStore?.id || storeId;
    const resolvedStoreSlug = currentStore?.slug || storeSlug;

    if (!resolvedStoreId && !resolvedStoreSlug) return null;

    const supabase = getSupabaseClient();

    // 1. فحص جدول الموظفين في Supabase للمتجر المستهدف حصراً
    if (supabase) {
      try {
        let staffQuery = supabase
          .from('store_staff')
          .select(await staffCols(supabase))
          .eq('is_active', true);

        if (resolvedStoreId) {
          staffQuery = staffQuery.eq('store_id', resolvedStoreId);
        }

        const { data: staffList, error: staffErr } = await staffQuery;

        if (!staffErr && staffList && staffList.length > 0) {
          const matchedStaff = staffList.find((s: any) => {
            const matchesPhone = normalizePhone(s.phone) === normInput;
            const matchesRole = !requiredRole || requiredRole === 'cashier' || s.role === 'admin';
            return matchesPhone && matchesRole;
          });
          if (matchedStaff) {
            const sanitized = { ...matchedStaff };
            delete (sanitized as any).pin_code;
            return {
              ...sanitized,
              matchedStore: currentStore || undefined,
            } as StoreStaff & { matchedStore?: Store };
          }
        }
      } catch (e) {
        console.warn('Supabase findStaffByPhone staff query failed', e);
      }

      // 2. فحص مدير المتجر في جدول المتاجر في Supabase للمتجر الحالي حصراً
      try {
        let storeQuery = supabase.from('stores').select(await storeCols(supabase));
        if (resolvedStoreId && isUUID(resolvedStoreId)) {
          storeQuery = storeQuery.eq('id', resolvedStoreId);
        } else if (resolvedStoreSlug) {
          storeQuery = storeQuery.eq('slug', resolvedStoreSlug.toLowerCase());
        }

        const { data: storeRow, error: storeErr } = await storeQuery.maybeSingle();

        if (!storeErr && storeRow && storeRow.manager_contact) {
          if (normalizePhone(storeRow.manager_contact) === normInput && (!requiredRole || requiredRole === 'admin')) {
            const normStore = normalizeStore(storeRow);
            return {
              id: 'manager-' + normStore.id,
              store_id: normStore.id,
              name: normStore.manager_name || 'المدير العام',
              phone: normStore.manager_contact || phone,
              role: 'admin',
              is_active: true,
              can_manual_input_phone: true,
              matchedStore: normStore,
            };
          }
        }
      } catch (e) {
        console.warn('Supabase findStaffByPhone store query failed', e);
      }
    }

    // 3. فحص التخزين المحلي للموظفين للمتجر المستهدف حصراً
    const localStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);
    const matchedLocalStaff = localStaff.find((s) => {
      if (!s.is_active) return false;
      const matchesStore = s.store_id === resolvedStoreId || (resolvedStoreSlug && s.store_id === resolvedStoreSlug);
      const matchesPhone = normalizePhone(s.phone) === normInput;
      const matchesRole = !requiredRole || requiredRole === 'cashier' || s.role === 'admin';
      return matchesStore && matchesPhone && matchesRole;
    });
    if (matchedLocalStaff) {
      return {
        ...matchedLocalStaff,
        matchedStore: currentStore || undefined,
      };
    }

    // 4. مطابقة مدير المتجر الحالي مباشرة من التخزين المحلي
    if (currentStore && currentStore.manager_contact) {
      const storeMgrNorm = normalizePhone(currentStore.manager_contact);
      if (storeMgrNorm === normInput && (!requiredRole || requiredRole === 'admin')) {
        return {
          id: 'manager-' + currentStore.id,
          store_id: currentStore.id,
          name: currentStore.manager_name || 'مدير المتجر',
          phone: currentStore.manager_contact,
          role: 'admin',
          pin_code: currentStore.admin_pin || '9999',
          is_active: true,
          can_manual_input_phone: true,
          matchedStore: currentStore,
        };
      }
    }

    const localStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const matchedLocalStore = localStores.find((s) => {
      const matchesStore = s.id === resolvedStoreId || (resolvedStoreSlug && s.slug === resolvedStoreSlug);
      const matchesPhone = normalizePhone(s.manager_contact) === normInput;
      return matchesStore && matchesPhone;
    });

    if (matchedLocalStore && (!requiredRole || requiredRole === 'admin')) {
      return {
        id: 'manager-' + matchedLocalStore.id,
        store_id: matchedLocalStore.id,
        name: matchedLocalStore.manager_name || 'المدير العام',
        phone: matchedLocalStore.manager_contact || phone,
        role: 'admin',
        pin_code: matchedLocalStore.admin_pin || '9999',
        is_active: true,
        can_manual_input_phone: true,
        matchedStore: matchedLocalStore,
      };
    }

    // 5. Fallback إلى INITIAL_STAFF و INITIAL_STORES فقط إذا لم يتم العثور على أي بيانات سابقة
    const matchedInitial = INITIAL_STAFF.find((s) => {
      if (!s.is_active) return false;
      const matchesStore =
        s.store_id === resolvedStoreId ||
        s.store_id === resolvedStoreSlug ||
        (resolvedStoreSlug && (s.store_id.includes('demo') && resolvedStoreSlug.includes('demo')));
      const matchesPhone = normalizePhone(s.phone) === normInput;
      const matchesRole = !requiredRole || requiredRole === 'cashier' || s.role === 'admin';
      return matchesStore && matchesPhone && matchesRole;
    });
    if (matchedInitial) {
      return {
        ...matchedInitial,
        matchedStore: currentStore || undefined,
      };
    }

    const matchedInitialStore = INITIAL_STORES.find(
      (s) => (s.id === resolvedStoreId || s.slug === resolvedStoreSlug) && normalizePhone(s.manager_contact) === normInput
    );
    if (matchedInitialStore && (!requiredRole || requiredRole === 'admin')) {
      return {
        id: 'manager-' + matchedInitialStore.id,
        store_id: matchedInitialStore.id,
        name: matchedInitialStore.manager_name || 'المدير العام',
        phone: matchedInitialStore.manager_contact || phone,
        role: 'admin',
        pin_code: matchedInitialStore.admin_pin || '9999',
        is_active: true,
        can_manual_input_phone: true,
        matchedStore: matchedInitialStore,
      };
    }

    return null;
  },

  // 7.2 إدارة جلسات الموظفين (Staff Session Storage)
  getStaffSession(storeId: string, role: 'admin' | 'cashier', storeSlug?: string): StoreStaff | null {
    try {
      let session = localStorage.getItem(`radar_session_${storeId}_${role}`);
      if (!session && storeSlug) {
        session = localStorage.getItem(`radar_session_${storeSlug}_${role}`);
      }
      return session ? JSON.parse(session) : null;
    } catch {
      return null;
    }
  },

  saveStaffSession(storeId: string, staff: StoreStaff, storeSlug?: string): void {
    localStorage.setItem(`radar_session_${storeId}_${staff.role}`, JSON.stringify(staff));
    if (storeSlug) {
      localStorage.setItem(`radar_session_${storeSlug}_${staff.role}`, JSON.stringify(staff));
    }
  },

  clearStaffSession(storeId: string, role: 'admin' | 'cashier', storeSlug?: string): void {
    localStorage.removeItem(`radar_session_${storeId}_${role}`);
    if (storeSlug) {
      localStorage.removeItem(`radar_session_${storeSlug}_${role}`);
    }
  },

  // 8. جلب جميع الرتب
  async getTiers(storeId: string): Promise<Tier[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('tiers')
          .select(await tierCols(supabase))
          .eq('store_id', storeId)
          .order('required_xp', { ascending: true });
        if (!error && data && data.length > 0) return data as Tier[];
      } catch (e) {
        console.warn('Supabase fetch tiers failed', e);
      }
    }
    const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, INITIAL_TIERS);
    const storeTiers = tiers.filter((t) => t.store_id === storeId);
    if (storeTiers.length > 0) {
      return storeTiers.sort((a, b) => a.required_xp - b.required_xp);
    }
    // Auto-seed default tiers for this store if none exist
    const defaultStoreTiers: Tier[] = [
      { id: `tier-1-${storeId}`, store_id: storeId, tier_name: 'ضيف (Guest)', required_xp: 0, badge_color: '#94A3B8' },
      { id: `tier-2-${storeId}`, store_id: storeId, tier_name: 'Insider مميز', required_xp: 150, badge_color: '#3B82F6' },
      { id: `tier-3-${storeId}`, store_id: storeId, tier_name: 'VIP Gold', required_xp: 500, badge_color: '#F59E0B' },
      { id: `tier-4-${storeId}`, store_id: storeId, tier_name: 'Black Elite 👑', required_xp: 1200, badge_color: '#10B981' },
    ];
    tiers.push(...defaultStoreTiers);
    saveLocalData(STORAGE_KEYS.LOCAL_TIERS, tiers);
    return defaultStoreTiers;
  },

  // 8.1 إضافة رتبة جديدة
  async addTier(tierData: Omit<Tier, 'id'>): Promise<Tier> {
    let result: Tier;
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('tiers')
          .insert([tierData])
          .select()
          .single();
        if (!error && data) {
          const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, INITIAL_TIERS);
          tiers.push(data as Tier);
          saveLocalData(STORAGE_KEYS.LOCAL_TIERS, tiers);
          result = data as Tier;
          LoyaltyEvents.emit({ type: 'TIERS_UPDATED', storeId: tierData.store_id });
          return result;
        }
      } catch (e) {
        console.warn('Supabase addTier failed', e);
      }
    }

    const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, INITIAL_TIERS);
    const newTier: Tier = {
      ...tierData,
      id: 'tier-' + Date.now(),
    };
    tiers.push(newTier);
    saveLocalData(STORAGE_KEYS.LOCAL_TIERS, tiers);
    LoyaltyEvents.emit({ type: 'TIERS_UPDATED', storeId: tierData.store_id });
    return newTier;
  },

  // 8.2 تعديل رتبة حالية (الاسم وقيمة النقاط/XP)
  async updateTier(tierId: string, updates: Partial<Tier>): Promise<Tier> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('tiers')
          .update(updates)
          .eq('id', tierId)
          .select()
          .single();
        if (!error && data) {
          const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, INITIAL_TIERS);
          const idx = tiers.findIndex((t) => t.id === tierId);
          if (idx !== -1) {
            tiers[idx] = data as Tier;
            saveLocalData(STORAGE_KEYS.LOCAL_TIERS, tiers);
          }
          LoyaltyEvents.emit({ type: 'TIERS_UPDATED', storeId: data.store_id });
          return data as Tier;
        }
      } catch (e) {
        console.warn('Supabase updateTier failed', e);
      }
    }

    const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, INITIAL_TIERS);
    const idx = tiers.findIndex((t) => t.id === tierId);
    if (idx !== -1) {
      tiers[idx] = { ...tiers[idx], ...updates };
      saveLocalData(STORAGE_KEYS.LOCAL_TIERS, tiers);
      LoyaltyEvents.emit({ type: 'TIERS_UPDATED', storeId: tiers[idx].store_id });
      return tiers[idx];
    }
    throw new Error('الرتبة غير موجودة');
  },

  // 8.3 حذف رتبة
  async deleteTier(tierId: string): Promise<boolean> {
    const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, INITIAL_TIERS);
    const found = tiers.find((t) => t.id === tierId);
    const storeId = found?.store_id || '';

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('tiers').delete().eq('id', tierId);
      } catch (e) {
        console.warn('Supabase deleteTier failed', e);
      }
    }

    const filtered = tiers.filter((t) => t.id !== tierId);
    saveLocalData(STORAGE_KEYS.LOCAL_TIERS, filtered);
    if (storeId) {
      LoyaltyEvents.emit({ type: 'TIERS_UPDATED', storeId });
    }
    return true;
  },

  // 9. جلب الامتيازات لمتجر محدد
  async getPrivileges(storeId: string): Promise<Privilege[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('privileges')
          .select(`${await privilegeCols(supabase)}, tiers(tier_name)` as unknown as '*')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false });
        if (!error && data) {
          return data.map((p: any) => ({
            ...p,
            tier_name: p.tiers?.tier_name,
          })) as Privilege[];
        }
      } catch (e) {
        console.warn('Supabase fetch privileges failed', e);
      }
    }
    const privs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, INITIAL_PRIVILEGES);
    // تنظيف أي امتيازات وهمية تم استنساخها تلقائياً للمتاجر الجديدة سابقاً
    const cleanedPrivs = privs.filter((p) => !p.id.startsWith(`priv-${storeId}-`));
    if (cleanedPrivs.length !== privs.length) {
      saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, cleanedPrivs);
    }
    const storePrivs = cleanedPrivs.filter((p) => p.store_id === storeId);
    return storePrivs;
  },

  // 9.1 إنشاء امتياز/كوبون جديد من لوحة التاجر
  async createPrivilege(privilegeData: Omit<Privilege, 'id'>): Promise<Privilege> {
    let result: Privilege;
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('privileges')
          .insert([stripDataUrls({ ...privilegeData })])
          .select(`${await privilegeCols(supabase)}, tiers(tier_name)` as unknown as '*')
          .single();
        if (!error && data) {
          result = { ...data, tier_name: (data as any).tiers?.tier_name } as Privilege;
          const privs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, INITIAL_PRIVILEGES);
          privs.unshift(result);
          saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, privs);
          LoyaltyEvents.emit({ type: 'PRIVILEGES_UPDATED', storeId: privilegeData.store_id });
          return result;
        }
      } catch (e) {
        console.warn('Supabase createPrivilege failed', e);
      }
    }

    const privs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, INITIAL_PRIVILEGES);
    const newPriv: Privilege = {
      ...privilegeData,
      id: 'priv-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    privs.unshift(newPriv);
    saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, privs);
    LoyaltyEvents.emit({ type: 'PRIVILEGES_UPDATED', storeId: privilegeData.store_id });
    return newPriv;
  },

  // 9.2 تعديل امتياز/كوبون
  async updatePrivilege(privilegeId: string, updates: Partial<Privilege>): Promise<Privilege> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('privileges')
          .update(stripDataUrls({ ...updates }))
          .eq('id', privilegeId)
          .select(`${await privilegeCols(supabase)}, tiers(tier_name)` as unknown as '*')
          .single();
        if (!error && data) {
          const updated = { ...data, tier_name: (data as any).tiers?.tier_name } as Privilege;
          const privs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, INITIAL_PRIVILEGES);
          const idx = privs.findIndex((p) => p.id === privilegeId);
          if (idx !== -1) {
            privs[idx] = updated;
            saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, privs);
          }
          LoyaltyEvents.emit({ type: 'PRIVILEGES_UPDATED', storeId: updated.store_id });
          return updated;
        }
      } catch (e) {
        console.warn('Supabase updatePrivilege failed', e);
      }
    }

    const privs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, INITIAL_PRIVILEGES);
    const idx = privs.findIndex((p) => p.id === privilegeId);
    if (idx !== -1) {
      privs[idx] = { ...privs[idx], ...updates };
      saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, privs);
      LoyaltyEvents.emit({ type: 'PRIVILEGES_UPDATED', storeId: privs[idx].store_id });
      return privs[idx];
    }
    throw new Error('الامتياز غير موجود');
  },

  // 9.3 حذف امتياز
  async deletePrivilege(privilegeId: string): Promise<boolean> {
    const privs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, INITIAL_PRIVILEGES);
    const found = privs.find((p) => p.id === privilegeId);
    const storeId = found?.store_id || '';

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('privileges').delete().eq('id', privilegeId);
      } catch (e) {
        console.warn('Supabase deletePrivilege failed', e);
      }
    }

    const filtered = privs.filter((p) => p.id !== privilegeId);
    saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, filtered);
    if (storeId) {
      LoyaltyEvents.emit({ type: 'PRIVILEGES_UPDATED', storeId });
    }
    return true;
  },

  // 9.4 تجميد / تفعيل امتياز يدوي
  async togglePrivilegeActive(privilegeId: string, currentStatus: boolean = true): Promise<boolean> {
    const newStatus = !currentStatus;
    await this.updatePrivilege(privilegeId, { is_active: newStatus });
    return newStatus;
  },

  // 9.5 إخفاء / إظهار امتياز
  async togglePrivilegeHidden(privilegeId: string, currentHidden: boolean = false): Promise<boolean> {
    const newHidden = !currentHidden;
    await this.updatePrivilege(privilegeId, { is_hidden: newHidden });
    return newHidden;
  },

  // 10. توليد باركود ديناميكي مشفر
  generateDynamicQR(
    storeId: string,
    customer: Customer,
    type: 'PASS' | 'REDEEM' | 'COUPON' = 'PASS',
    rewardTitle?: string,
    couponId?: string,
    couponCode?: string
  ): DynamicQRToken {
    const now = Date.now();
    const tokenId = 'qr_' + Math.random().toString(36).substring(2, 9) + '_' + now;
    return {
      token_id: tokenId,
      store_id: storeId,
      customer_id: customer.id,
      phone: customer.phone,
      type,
      reward_title: rewardTitle,
      coupon_id: couponId,
      coupon_code: couponCode,
      created_at: now,
      expires_at: now + 60 * 1000,
      is_used: false,
    };
  },

  // 11. التحقق من الباركود وحرقه
  validateAndConsumeQRToken(token: DynamicQRToken): { valid: boolean; error?: string } {
    const consumedTokens = getLocalData<string[]>(STORAGE_KEYS.CONSUMED_TOKENS, []);

    if (consumedTokens.includes(token.token_id)) {
      return { valid: false, error: '⚠️ هذا الباركود تم استخدامه وحرقه مسبقاً! (غير صالح للإعادة)' };
    }

    if (Date.now() > token.expires_at) {
      return { valid: false, error: '⚠️ انتهت صلاحية هذا الباركود! يرجى تحديث الشاشة بجوال العميل' };
    }

    consumedTokens.push(token.token_id);
    saveLocalData(STORAGE_KEYS.CONSUMED_TOKENS, consumedTokens);
    return { valid: true };
  },

  // 11.1 فحص النطاق الزمني لساعات الصرف (Time-Lock Helper)
  isWithinTimeRange(
    startTime?: string | null,
    endTime?: string | null
  ): { allowed: boolean; message?: string } {
    if (!startTime || !endTime) return { allowed: true };

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    let inRange = false;
    if (startMinutes <= endMinutes) {
      inRange = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Overnight range (e.g. 18:00 to 02:00)
      inRange = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    if (!inRange) {
      return {
        allowed: false,
        message: `عذراً، هذا الكوبون متاح للصرف فقط من الساعة ${startTime} إلى ${endTime} ⏰`,
      };
    }
    return { allowed: true };
  },

  // 11.2 جلب كوبونات العميل
  async getCustomerCoupons(customerId: string, storeId: string, customerPhone?: string): Promise<CustomerCoupon[]> {
    const supabase = getSupabaseClient();
    const currentStore = await this.resolveStore(storeId);
    const resolvedStoreId = currentStore?.id || storeId;

    if (supabase && isUUID(resolvedStoreId)) {
      try {
        const couponKey = `${resolvedStoreId}:${customerId}`;
        let query = supabase
          .from('customer_coupons')
          .select(couponImagesLoaded.has(couponKey) ? await couponCols(supabase) : '*' as '*')
          .eq('store_id', resolvedStoreId);

        if (isUUID(customerId)) {
          if (customerPhone) {
            query = query.or(`customer_id.eq.${customerId},customer_phone.eq.${normalizePhone(customerPhone)}`);
          } else {
            query = query.eq('customer_id', customerId);
          }
        } else if (customerPhone) {
          query = query.eq('customer_phone', normalizePhone(customerPhone));
        }

        const { data, error } = await query.order('purchased_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          if (!couponImagesLoaded.has(couponKey)) {
            data.forEach((c: any) => { if (c.privilege_id && c.privilege_image_url) couponImageCache.set(c.privilege_id, c.privilege_image_url); });
            couponImagesLoaded.add(couponKey);
          }
          return data.map((c: any) => ({
            id: c.id,
            coupon_code: c.coupon_code,
            customer_id: c.customer_id,
            customer_phone: c.customer_phone,
            customer_name: c.customer_name,
            store_id: c.store_id,
            privilege_id: c.privilege_id,
            privilege_title: c.privilege_title,
            privilege_image_url: c.privilege_image_url ?? couponImageCache.get(c.privilege_id) ?? null,
            cost_points: Number(c.cost_points) || 0,
            status: c.status,
            valid_start_time: c.valid_start_time,
            valid_end_time: c.valid_end_time,
            purchased_at: c.purchased_at,
            used_at: c.used_at,
            cashier_name: c.cashier_name,
          })) as CustomerCoupon[];
        }
      } catch (e) {
        console.warn('Supabase fetch customer coupons failed', e);
      }
    }
    const coupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []);
    return coupons.filter((c) =>
      (c.store_id === resolvedStoreId || c.store_id === storeId) &&
      (c.customer_id === customerId || (customerPhone && normalizePhone(c.customer_phone) === normalizePhone(customerPhone)))
    );
  },

  // 11.3 جلب جميع الكوبونات لمتجر (لجرد التاجر)
  async getAllStoreCoupons(storeId: string): Promise<CustomerCoupon[]> {
    const supabase = getSupabaseClient();
    const currentStore = await this.resolveStore(storeId);
    const resolvedStoreId = currentStore?.id || storeId;

    if (supabase && isUUID(resolvedStoreId)) {
      try {
        const { data, error } = await supabase
          .from('customer_coupons')
          .select(await couponCols(supabase))
          .eq('store_id', resolvedStoreId)
          .order('purchased_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          return data.map((c: any) => ({
            id: c.id,
            coupon_code: c.coupon_code,
            customer_id: c.customer_id,
            customer_phone: c.customer_phone,
            customer_name: c.customer_name,
            store_id: c.store_id,
            privilege_id: c.privilege_id,
            privilege_title: c.privilege_title,
            privilege_image_url: c.privilege_image_url,
            cost_points: Number(c.cost_points) || 0,
            status: c.status,
            valid_start_time: c.valid_start_time,
            valid_end_time: c.valid_end_time,
            purchased_at: c.purchased_at,
            used_at: c.used_at,
            cashier_name: c.cashier_name,
          })) as CustomerCoupon[];
        }
      } catch (e) {
        console.warn('Supabase fetch all store coupons failed', e);
      }
    }
    const coupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []);
    return coupons.filter((c) => c.store_id === resolvedStoreId || c.store_id === storeId);
  },

  // 11.4 شراء واستبدال كوبون بالنقاط (Customer Purchase with instant points deduction & stock update)
  async purchaseCoupon(
    storeId: string,
    customerId: string,
    privilegeId: string
  ): Promise<{ success: boolean; coupon: CustomerCoupon; updatedCustomer: Customer }> {
    const supabase = getSupabaseClient();
    const resolvedStoreId = isUUID(storeId)
      ? storeId
      : ((await this.resolveStore(storeId))?.id || storeId);

    // ─── 1. جلب العميل والمكافأة والكوتا بالتوازي التام (Promise.all - Fast Targeted Fetch) ───
    let customer: Customer | undefined;
    let privilege: Privilege | undefined;
    let userPurchasedCount = 0;

    if (supabase && isUUID(customerId) && isUUID(resolvedStoreId) && isUUID(privilegeId)) {
      try {
        const [custRes, privRes, quotaRes] = await Promise.all([
          supabase
            .from('store_customers')
            .select(await customerCols(supabase))
            .eq('id', customerId)
            .eq('store_id', resolvedStoreId)
            .maybeSingle(),
          supabase
            .from('privileges')
            .select(await privilegeCols(supabase))
            .eq('id', privilegeId)
            .eq('store_id', resolvedStoreId)
            .maybeSingle(),
          supabase
            .from('customer_coupons')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', resolvedStoreId)
            .eq('privilege_id', privilegeId)
            .eq('customer_id', customerId),
        ]);

        if (!custRes.error && custRes.data) {
          customer = {
            id: custRes.data.id,
            store_id: custRes.data.store_id,
            phone: custRes.data.phone,
            name: custRes.data.name || 'عميل مميز',
            wallet_balance: Number(custRes.data.wallet_balance) || 0,
            lifetime_xp: Number(custRes.data.lifetime_xp) || 0,
            last_visit_date: custRes.data.last_visit_date
              ? custRes.data.last_visit_date.split('T')[0]
              : new Date().toISOString().split('T')[0],
            is_active: custRes.data.is_active !== undefined ? custRes.data.is_active : true,
            visits_count: custRes.data.visits_count || 1,
            created_at: custRes.data.created_at,
          };
        }

        if (!privRes.error && privRes.data) {
          privilege = privRes.data as Privilege;
        }

        userPurchasedCount = quotaRes.count || 0;
      } catch (e) {
        console.warn('purchaseCoupon: targeted fetch failed, falling back to local', e);
      }
    }

    // Local Fallbacks
    if (!customer) {
      const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
      customer = localCustomers.find((c) => c.id === customerId);
    }
    if (!customer) throw new Error('العميل غير موجود');

    if (!privilege) {
      const privs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, INITIAL_PRIVILEGES);
      privilege = privs.find((p) => p.id === privilegeId);
    }
    if (!privilege) throw new Error('الامتياز غير موجود');

    // ─── 2. التحقق من الشروط والصلاحيات في الذاكرة (0ms Validation) ───
    if (!privilege.is_active) {
      throw new Error('عذراً، هذا الامتياز موقوف حالياً من قبل إدارة المتجر');
    }

    if (privilege.quantity_limit !== null && privilege.quantity_limit > 0) {
      if ((privilege.redeemed_count || 0) >= privilege.quantity_limit) {
        throw new Error('عذراً، نفدت كمية هذا الكوبون بالكامل! (Sold Out)');
      }
    }

    if (
      privilege.per_customer_limit !== null &&
      privilege.per_customer_limit !== undefined &&
      privilege.per_customer_limit > 0
    ) {
      if (userPurchasedCount === 0 && !supabase) {
        const localCoupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []);
        userPurchasedCount = localCoupons.filter(
          (c) =>
            c.privilege_id === privilegeId &&
            (c.customer_id === customerId ||
              normalizePhone(c.customer_phone) === normalizePhone(customer!.phone))
        ).length;
      }
      if (userPurchasedCount >= privilege.per_customer_limit) {
        throw new Error(
          `عذراً، لقد استنفدت الحد الأقصى المسموح لك من هذا الكوبون (${privilege.per_customer_limit} لكل عميل). يمكنك استكشاف الكوبونات والعروض الأخرى المتاحة! 🎁`
        );
      }
    }

    // فحص الرتبة إذا وُجدت
    if (privilege.required_tier_id) {
      const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, INITIAL_TIERS);
      const reqTier = tiers.find((t) => t.id === privilege!.required_tier_id);
      if (reqTier && (customer.lifetime_xp || 0) < reqTier.required_xp) {
        throw new Error(`عذراً، يتطلب هذا العرض الوصول لرتبة "${reqTier.tier_name}" أولاً (${reqTier.required_xp} XP)`);
      }
    }

    // فحص رصيد النقاط
    const cost = privilege.cost_points || 0;
    if ((customer.wallet_balance || 0) < cost) {
      throw new Error(`رصيد نقاطك غير كافٍ! تحتاج إلى ${cost} نقطة ورصيدك الحالي هو ${customer.wallet_balance} نقطة`);
    }

    // ─── 3. تجهيز بيانات الكوبون الجديد ───
    const code =
      'CPN-' +
      Math.floor(1000 + Math.random() * 9000) +
      '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase();
    const nowIso = new Date().toISOString();
    let couponId = 'cpn-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

    const nextRedeemedCount = (privilege.redeemed_count || 0) + 1;
    const isNowSoldOut =
      privilege.quantity_limit !== null &&
      privilege.quantity_limit > 0 &&
      nextRedeemedCount >= privilege.quantity_limit;

    const newBalance = customer.wallet_balance - cost;
    const updatedCustomer: Customer = {
      ...customer,
      wallet_balance: newBalance,
    };

    const newCoupon: CustomerCoupon = {
      id: couponId,
      coupon_code: code,
      customer_id: customerId,
      customer_phone: customer.phone,
      customer_name: customer.name || undefined,
      store_id: resolvedStoreId,
      privilege_id: privilegeId,
      privilege_title: privilege.title,
      privilege_image_url: privilege.image_url,
      cost_points: cost,
      status: 'ACTIVE',
      valid_start_time: privilege.valid_start_time,
      valid_end_time: privilege.valid_end_time,
      purchased_at: nowIso,
    };

    // ─── 4. تنفيذ عمليات الحفظ في Supabase بالتوازي التام (Promise.all - Fast Writes) ───
    if (supabase && isUUID(resolvedStoreId) && isUUID(customerId)) {
      try {
        const dbCouponPayload: any = {
          store_id: resolvedStoreId,
          customer_id: isUUID(customerId) ? customerId : null,
          customer_phone: customer.phone,
          customer_name: customer.name || 'عميل مميز',
          privilege_id: isUUID(privilegeId) ? privilegeId : null,
          privilege_title: privilege.title,
          privilege_image_url: privilege.image_url || null,
          coupon_code: code,
          cost_points: cost,
          status: 'ACTIVE',
          valid_start_time: privilege.valid_start_time || '00:00',
          valid_end_time: privilege.valid_end_time || '23:59',
          purchased_at: nowIso,
        };

        const [custUpRes, privUpRes, cpnInsRes] = await Promise.all([
          supabase
            .from('store_customers')
            .update({ wallet_balance: newBalance })
            .eq('id', customerId)
            .select()
            .maybeSingle(),
          supabase
            .from('privileges')
            .update({
              redeemed_count: nextRedeemedCount,
              is_hidden: isNowSoldOut ? true : privilege.is_hidden,
            })
            .eq('id', privilegeId),
          supabase
            .from('customer_coupons')
            .insert([dbCouponPayload])
            .select('id')
            .maybeSingle(),
        ]);

        if (cpnInsRes.data && cpnInsRes.data.id) {
          newCoupon.id = cpnInsRes.data.id;
        }
      } catch (e) {
        console.warn('purchaseCoupon: fast write failed', e);
      }
    }

    // ─── 5. تحديث الكاش المحلي فورياً ───
    try {
      // 5.1 تحديث العملاء محلياً
      const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
      const custIdx = localCustomers.findIndex((c) => c.id === customerId);
      if (custIdx !== -1) {
        localCustomers[custIdx] = updatedCustomer;
      } else {
        localCustomers.unshift(updatedCustomer);
      }
      saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, localCustomers);

      // 5.2 تحديث الامتياز محلياً
      const localPrivs = getLocalData<Privilege[]>(STORAGE_KEYS.LOCAL_PRIVILEGES, INITIAL_PRIVILEGES);
      const pIdx = localPrivs.findIndex((p) => p.id === privilegeId);
      if (pIdx !== -1) {
        localPrivs[pIdx] = {
          ...localPrivs[pIdx],
          redeemed_count: nextRedeemedCount,
          is_hidden: isNowSoldOut ? true : localPrivs[pIdx].is_hidden,
        };
        saveLocalData(STORAGE_KEYS.LOCAL_PRIVILEGES, localPrivs);
      }

      // 5.3 حفظ الكوبون محلياً
      const localCoupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []);
      localCoupons.unshift(newCoupon);
      saveLocalData(STORAGE_KEYS.LOCAL_COUPONS, localCoupons);
    } catch {
      // Local cache fallback
    }

    // ─── 6. سجل التدقيق Audit Log (Fire & Forget في الخلفية) ───
    if (supabase && isUUID(resolvedStoreId)) {
      Promise.resolve(
        supabase
          .from('audit_logs')
          .insert([
            {
              store_id: resolvedStoreId,
              staff_id: null,
              customer_id: isUUID(customerId) ? customerId : null,
              customer_phone: customer.phone,
              customer_name: customer.name || 'عميل مميز',
              action: 'REDEEM_REWARD',
              purchase_amount: 0,
              points_changed: -cost,
              metadata: {
                coupon_id: newCoupon.id,
                coupon_code: newCoupon.coupon_code,
                privilege_title: privilege.title,
                cost_points: cost,
              },
            },
          ])
      ).catch((e: any) => console.warn('Supabase purchaseCoupon audit log failed', e));
    }

    return { success: true, coupon: newCoupon, updatedCustomer };
  },

  // 11.5 التحقق الأمني الصارم من الكوبون (Store Isolation + Single-Use Validation + Time Window)
  async validateCoupon(
    storeId: string,
    couponCodeOrId: string
  ): Promise<{ valid: boolean; coupon?: CustomerCoupon; error?: string; isTimeLocked?: boolean }> {
    const currentStore = await this.resolveStore(storeId);
    const resolvedStoreId = currentStore?.id || storeId;
    const cleanCode = couponCodeOrId.trim().toUpperCase();

    const supabase = getSupabaseClient();
    let coupon: CustomerCoupon | undefined = undefined;

    // 1️⃣ البحث المباشر في Supabase أولاً إن أمكن
    if (supabase && isUUID(resolvedStoreId)) {
      try {
        let couponQuery = supabase
          .from('customer_coupons')
          .select('id, coupon_code, customer_id, customer_phone, customer_name, store_id, privilege_id, privilege_title, cost_points, status, valid_start_time, valid_end_time, purchased_at, redeemed_at, redeemed_by_staff_id')
          .eq('store_id', resolvedStoreId);

        if (isUUID(cleanCode)) {
          couponQuery = couponQuery.or(`id.eq.${cleanCode},coupon_code.eq.${cleanCode}`);
        } else {
          couponQuery = couponQuery.eq('coupon_code', cleanCode);
        }

        const { data, error } = await couponQuery.limit(1).maybeSingle();

        if (!error && data) {
          const d = data as any;
          coupon = {
            id: d.id,
            coupon_code: d.coupon_code,
            customer_id: d.customer_id,
            customer_phone: d.customer_phone,
            customer_name: d.customer_name,
            store_id: d.store_id,
            privilege_id: d.privilege_id,
            privilege_title: d.privilege_title,
            privilege_image_url: undefined,
            cost_points: d.cost_points || 0,
            status: d.status,
            valid_start_time: d.valid_start_time,
            valid_end_time: d.valid_end_time,
            purchased_at: d.purchased_at,
            used_at: d.redeemed_at,
            cashier_name: d.redeemed_by_staff_id,
          };
        }
      } catch (e) {
        console.warn('Direct Supabase coupon query error', e);
      }
    }

    // البحث في الذاكرة المحلية كـ Fallback
    if (!coupon) {
      const coupons = await this.getAllStoreCoupons(resolvedStoreId);
      coupon = coupons.find(
        (c) =>
          c.id === cleanCode ||
          c.coupon_code.trim().toUpperCase() === cleanCode.toUpperCase()
      );
    }

    if (!coupon) {
      return { valid: false, error: 'عفواً، لم يتم العثور على هذا الكوبون أو الرمز غير صحيح!' };
    }

    // 🔒 1. مطابقة المتجر (Store Isolation)
    if (coupon.store_id !== resolvedStoreId && coupon.store_id !== storeId) {
      return {
        valid: false,
        coupon,
        error: 'عفواً، هذا الكوبون خاص بمتجر آخر ولا يمكن صرفه هنا',
      };
    }

    // 🔒 2. منع الاستخدام المتكرر ولقطات الشاشة (Single-Use Validation)
    if (coupon.status === 'REDEEMED' || coupon.status === 'USED') {
      return {
        valid: false,
        coupon,
        error: 'هذا الكوبون محروق وتم استخدامه مسبقاً',
      };
    }

    if (coupon.status !== 'ACTIVE') {
      return { valid: false, coupon, error: `عفواً، حالة الكوبون غير صالحة للصرف: (${coupon.status})` };
    }

    // 🕒 3. التحقق من الساعات المحددة للصرف (Time-Lock)
    const timeCheck = this.isWithinTimeRange(coupon.valid_start_time, coupon.valid_end_time);
    if (!timeCheck.allowed) {
      return {
        valid: false,
        coupon,
        isTimeLocked: true,
        error: timeCheck.message,
      };
    }

    return { valid: true, coupon };
  },

  // 11.6 حرق الكوبون بواسطة الكاشير (Atomic Transaction & Single-Use Lock)
  async redeemCoupon(
    storeId: string,
    couponId: string,
    staffId?: string,
    staffName?: string,
    entryMethod: 'qr_scan' | 'manual' = 'qr_scan'
  ): Promise<{ success: boolean; coupon: CustomerCoupon }> {
    const currentStore = await this.resolveStore(storeId);
    const resolvedStoreId = currentStore?.id || storeId;

    const validation = await this.validateCoupon(resolvedStoreId, couponId);
    if (!validation.valid || !validation.coupon) {
      throw new Error(validation.error || 'الكوبون غير صالح للصرف');
    }

    const coupon = validation.coupon;
    const usedAt = new Date().toISOString();

    const supabase = getSupabaseClient();
    if (supabase && isUUID(resolvedStoreId)) {
      try {
        const updatePayload: any = {
          status: 'REDEEMED',
          redeemed_at: usedAt,
          redeemed_by_staff_id: isUUID(staffId) ? staffId : null,
        };

        // 🛡️ تنفيذ التحديث كـ Atomic Transaction بشرط أن تكون الحالة ACTIVE لمنع التكرار
        const { data: updatedRows, error: updateErr } = await supabase
          .from('customer_coupons')
          .update(updatePayload)
          .eq('id', coupon.id)
          .eq('status', 'ACTIVE')
          .select('id');

        if (updateErr) {
          console.error('Supabase atomic update customer_coupons error:', updateErr);
        }

        if (updatedRows && updatedRows.length === 0) {
          throw new Error('هذا الكوبون محروق وتم استخدامه مسبقاً');
        }

        await supabase.from('audit_logs').insert([
          {
            store_id: resolvedStoreId,
            staff_id: isUUID(staffId) ? staffId : null,
            customer_id: isUUID(coupon.customer_id) ? coupon.customer_id : null,
            customer_phone: coupon.customer_phone,
            customer_name: coupon.customer_name || 'عميل مميز',
            action: 'REDEEM_REWARD',
            purchase_amount: 0,
            points_changed: 0,
            entry_method: entryMethod,
            metadata: {
              coupon_id: coupon.id,
              coupon_code: coupon.coupon_code,
              privilege_id: coupon.privilege_id,
              privilege_title: coupon.privilege_title,
              cost_points: coupon.cost_points,
              cashier_name: staffName || 'كاشير المتجر',
              redeemed_at: usedAt,
            },
          },
        ]);
      } catch (e: any) {
        if (e.message?.includes('محروق')) {
          throw e;
        }
        console.warn('Supabase update coupon status warning', e);
      }
    }

    const localCoupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []);
    const idx = localCoupons.findIndex((c) => c.id === coupon.id || c.coupon_code === coupon.coupon_code);
    if (idx !== -1) {
      if (localCoupons[idx].status === 'REDEEMED' || localCoupons[idx].status === 'USED') {
        throw new Error('هذا الكوبون محروق وتم استخدامه مسبقاً');
      }
      localCoupons[idx].status = 'REDEEMED';
      localCoupons[idx].used_at = usedAt;
      localCoupons[idx].cashier_name = staffName || 'كاشير المتجر';
      saveLocalData(STORAGE_KEYS.LOCAL_COUPONS, localCoupons);
    }

    // تسجيل العملية في Audit Logs كـ REDEEM_COUPON لاعتمادها في جرد المخزون اليومي
    const logs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, []);
    logs.unshift({
      id: 'log-' + Date.now(),
      store_id: resolvedStoreId,
      staff_id: staffId || null,
      customer_id: coupon.customer_id,
      customer_phone: coupon.customer_phone,
      customer_name: coupon.customer_name,
      action: 'REDEEM_COUPON',
      purchase_amount: 0,
      points_changed: 0,
      entry_method: entryMethod,
      metadata: {
        coupon_id: coupon.id,
        coupon_code: coupon.coupon_code,
        privilege_id: coupon.privilege_id,
        privilege_title: coupon.privilege_title,
        cost_points: coupon.cost_points,
        cashier_name: staffName || 'كاشير المتجر',
        used_at: usedAt,
      },
      created_at: usedAt,
    });
    saveLocalData(STORAGE_KEYS.LOCAL_LOGS, logs);

    LoyaltyEvents.emit({
      type: 'COUPON_REDEEMED',
      storeId: resolvedStoreId,
      phone: coupon.customer_phone,
      couponId: coupon.id,
      couponCode: coupon.coupon_code,
      rewardTitle: coupon.privilege_title,
    });

    return { success: true, coupon: { ...coupon, status: 'REDEEMED', used_at: usedAt, cashier_name: staffName } };
  },

  // 11.7 ⚡ المحرك الأمني الموحد للمسح الذكي السريع (Guard Clauses & Single Database Query)
  async smartScanProcess(
    storeOrId: string | Store,
    rawCode: string,
    staffId?: string | null,
    staffName?: string | null,
    entryMethod: 'qr_scan' | 'manual' = 'qr_scan'
  ): Promise<{
    type: 'COUPON' | 'PASS' | 'REDEEM_POINTS';
    success: boolean;
    coupon?: CustomerCoupon;
    customerPhone?: string;
    customerName?: string;
    message?: string;
    error?: string;
  }> {
    const isStoreObj = typeof storeOrId === 'object' && storeOrId !== null;
    const storeId = isStoreObj ? (storeOrId as Store).id : String(storeOrId);
    const storeSlug = isStoreObj ? (storeOrId as Store).slug : undefined;

    const trimmed = rawCode.trim();
    if (!trimmed) {
      return { type: 'PASS', success: false, error: 'الرمز المدخل فارغ' };
    }

    // ⚡ Debounce / Duplicate Scan Suppression Gate (Section 15 & 51)
    const cacheKey = `${storeId}:${trimmed}`;
    const now = Date.now();
    const cached = scanDebounceCache.get(cacheKey);
    if (cached && now - cached.timestamp < 1500) {
      return cached.promise;
    }

    const execPromise: Promise<{
      type: 'COUPON' | 'PASS' | 'REDEEM_POINTS';
      success: boolean;
      coupon?: CustomerCoupon;
      customerPhone?: string;
      customerName?: string;
      message?: string;
      error?: string;
    }> = (async () => {
      // ⚡ Stage 12B: Reuse already-resolved active store context without redundant async DB round-trip
      const currentStore: Store | null = isStoreObj
        ? (storeOrId as Store)
        : (storeResolutionCache.get(storeId.toLowerCase())?.store || null);
      const resolvedStoreId = currentStore?.id || storeId;
      const effectiveSlug = currentStore?.slug || storeSlug;
      const supabase = getSupabaseClient();

    let scannedPhone = trimmed;
    let qrType: 'PASS' | 'REDEEM' | 'COUPON' | 'UNKNOWN' = 'UNKNOWN';
    let couponId: string | undefined = undefined;
    let couponCode: string | undefined = undefined;
    let qrTokenStoreId: string | undefined = undefined;
    let pointsCost = 100;
    let rewardTitle = 'Reward';

    // Parse JSON or plain string
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.phone || parsed.p) scannedPhone = parsed.phone || parsed.p;
      if (parsed.type || parsed.t) qrType = parsed.type || parsed.t;
      if (parsed.coupon_id || parsed.cid) couponId = parsed.coupon_id || parsed.cid;
      if (parsed.coupon_code || parsed.code) couponCode = parsed.coupon_code || parsed.code;
      if (parsed.store_id || parsed.storeId || parsed.s) qrTokenStoreId = parsed.store_id || parsed.storeId || parsed.s;
      if (parsed.reward_title || parsed.rewardTitle || parsed.rt) rewardTitle = parsed.reward_title || parsed.rewardTitle || parsed.rt;
      if (parsed.pointsCost || parsed.cost_points || parsed.cost) pointsCost = parsed.pointsCost || parsed.cost_points || parsed.cost;
    } catch {
      if (
        trimmed.toUpperCase().startsWith('CPN-') ||
        trimmed.toUpperCase().startsWith('WELCOME-') ||
        trimmed.toUpperCase().startsWith('COUPON-') ||
        (trimmed.includes('-') && !trimmed.startsWith('05') && !trimmed.startsWith('+'))
      ) {
        qrType = 'COUPON';
        couponCode = trimmed;
      }
    }

    // 🛑 Guard Clause 0: مطابقة المتجر لبطاقة الولاء والباركود المشفر (Store Isolation for Pass / Dynamic Token)
    if (qrTokenStoreId) {
      const isDirectMismatch =
        isUUID(qrTokenStoreId) && isUUID(storeId) && qrTokenStoreId.toLowerCase() !== storeId.toLowerCase();

      if (isDirectMismatch) {
        // 📡 Realtime Broadcast إشعار الرفض الفوري لجوال العميل (0ms)
        LoyaltyEvents.emit({
          type: 'SCAN_REJECTED',
          storeId: qrTokenStoreId,
          phone: scannedPhone,
          error: 'تم رفض العملية: بطاقة الولاء هذه تابعة لمتجر آخر ولا يمكن استخدامها هنا ❌',
        });

        return {
          type: 'PASS',
          success: false,
          error: 'عفواً، بطاقة الولاء هذه تابعة لمتجر آخر ولا يمكن استخدامها هنا ❌',
        };
      }

      const tokenStore = await this.resolveStore(qrTokenStoreId);
      const normalizedTokenStoreId = tokenStore?.id || qrTokenStoreId;
      if (
        normalizedTokenStoreId !== resolvedStoreId &&
        qrTokenStoreId !== resolvedStoreId &&
        qrTokenStoreId !== currentStore?.slug &&
        qrTokenStoreId !== effectiveSlug
      ) {
        // 📡 Realtime Broadcast إشعار الرفض الفوري لجوال العميل
        LoyaltyEvents.emit({
          type: 'SCAN_REJECTED',
          storeId: qrTokenStoreId,
          phone: scannedPhone,
          error: 'تم رفض العملية: بطاقة الولاء هذه تابعة لمتجر آخر ولا يمكن استخدامها هنا ❌',
        });

        return {
          type: 'PASS',
          success: false,
          error: 'عفواً، بطاقة الولاء هذه تابعة لمتجر آخر ولا يمكن استخدامها هنا ❌',
        };
      }
    }

    const potentialCouponCode = couponCode || couponId || (qrType === 'COUPON' ? trimmed : '');

    // =========================================================================
    // 🛡️ المسار الأول: إذا كان الكود المحتمل هو كوبون (Coupon Validation & Burn)
    // =========================================================================
    if (potentialCouponCode || qrType === 'COUPON') {
      const lookupKey = potentialCouponCode || trimmed;
      const cleanKey = lookupKey.trim().toUpperCase();

      let couponData: any = null;
      if (supabase && isUUID(resolvedStoreId)) {
        try {
          // ⚠️ استعلام فائق السرعة محدد النطاق بالمتجر (Store-Scoped) ومقتصر على الأعمدة التشغيلية المطلوبة فقط
          // استبعاد privilege_image_url الضخم من الاستعلام (يوفر ~1400ms من قراءة TOAST Blob)
          const COUPON_SELECT_FIELDS =
            'id, coupon_code, store_id, customer_id, customer_phone, customer_name, privilege_id, privilege_title, cost_points, status, valid_start_time, valid_end_time, purchased_at';

          let couponQuery = supabase
            .from('customer_coupons')
            .select(COUPON_SELECT_FIELDS)
            .eq('store_id', resolvedStoreId);

          if (isUUID(cleanKey)) {
            couponQuery = couponQuery.or(`coupon_code.eq.${cleanKey},id.eq.${cleanKey}`);
          } else {
            couponQuery = couponQuery.eq('coupon_code', cleanKey);
          }

          const { data, error } = await couponQuery.limit(1).maybeSingle();
          if (!error && data) {
            couponData = data;
          } else if (!data) {
            // فحص إضافي فقط عند عدم وجود الكوبون في المتجر الحالي للتأكد هل ينتمي لمتجر آخر
            const otherQuery = isUUID(cleanKey)
              ? supabase.from('customer_coupons').select('id, store_id, customer_phone').or(`coupon_code.eq.${cleanKey},id.eq.${cleanKey}`).limit(1).maybeSingle()
              : supabase.from('customer_coupons').select('id, store_id, customer_phone').eq('coupon_code', cleanKey).limit(1).maybeSingle();
            const { data: otherStoreCoupon } = await otherQuery;
            if (otherStoreCoupon && otherStoreCoupon.store_id !== resolvedStoreId) {
              couponData = otherStoreCoupon;
            }
          }
        } catch (e) {
          console.warn('smartScanProcess: coupon query error', e);
        }
      }

      // Local fallback if Supabase not used / offline
      if (!couponData) {
        const localCoupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []);
        couponData = localCoupons.find(
          (c) =>
            c.id === cleanKey ||
            c.coupon_code.trim().toUpperCase() === cleanKey
        );
      }

      // 🛑 Guard Clause 1: الكوبون غير موجود
      if (!couponData) {
        return {
          type: 'COUPON',
          success: false,
          error: 'الكوبون غير صالح أو غير مسجل في النظام ❌',
        };
      }

      // 🛑 Guard Clause 2: مطابقة المتجر أولاً وقبل أي إجراء (Store Isolation)
      if (couponData.store_id !== resolvedStoreId && couponData.store_id !== storeId) {
        // 📡 Realtime Broadcast إشعار الرفض الفوري لجوال العميل
        LoyaltyEvents.emit({
          type: 'SCAN_REJECTED',
          storeId: couponData.store_id,
          phone: couponData.customer_phone,
          error: 'تم رفض العملية: هذا الكوبون خاص بمتجر آخر ولا يمكن صرفه هنا ❌',
        });

        return {
          type: 'COUPON',
          success: false,
          error: 'عفواً، هذا الكوبون خاص بمتجر آخر ولا يمكن صرفه هنا ❌',
        };
      }

      // 🛑 Guard Clause 3: فحص الاستخدام المسبق (Single-Use Validation)
      if (couponData.status === 'REDEEMED' || couponData.status === 'USED') {
        return {
          type: 'COUPON',
          success: false,
          error: 'هذا الكوبون محروق وتم استخدامه مسبقاً ❌',
        };
      }

      // 🛑 Guard Clause 4: فحص حالة النشاط
      if (couponData.status !== 'ACTIVE') {
        return {
          type: 'COUPON',
          success: false,
          error: `عفواً، حالة الكوبون غير صالحة للصرف: (${couponData.status}) ❌`,
        };
      }

      // 🛑 Guard Clause 5: فحص النطاق الزمني (Time-Lock)
      const timeCheck = this.isWithinTimeRange(couponData.valid_start_time, couponData.valid_end_time);
      if (!timeCheck.allowed) {
        return {
          type: 'COUPON',
          success: false,
          error: timeCheck.message,
        };
      }

      // ⚡ حرق الكوبون الذري (Atomic Single-Use Redemption)
      const usedAt = new Date().toISOString();
      const burnedCoupon: CustomerCoupon = {
        id: couponData.id,
        coupon_code: couponData.coupon_code,
        customer_id: couponData.customer_id,
        customer_phone: couponData.customer_phone,
        customer_name: couponData.customer_name,
        store_id: couponData.store_id,
        privilege_id: couponData.privilege_id,
        privilege_title: couponData.privilege_title,
        cost_points: couponData.cost_points || 0,
        status: 'REDEEMED',
        used_at: usedAt,
        purchased_at: couponData.purchased_at || couponData.created_at,
        cashier_name: staffName || 'كاشير المتجر',
      };

      if (supabase && isUUID(resolvedStoreId)) {
        try {
          const { data: updatedRows, error: updateErr } = await supabase
            .from('customer_coupons')
            .update({
              status: 'REDEEMED',
              redeemed_at: usedAt,
              redeemed_by_staff_id: isUUID(staffId) ? staffId : null,
            })
            .eq('id', couponData.id)
            .eq('status', 'ACTIVE') // Atomic guard: ensures double-spend is blocked
            .select('id')
            .maybeSingle();

          if (updateErr || !updatedRows) {
            return {
              type: 'COUPON',
              success: false,
              error: 'هذا الكوبون محروق وتم استخدامه مسبقاً ❌',
            };
          }

          // تسجيل في سجل العمليات (Audit Logs) — Fire & Forget بلا أي تأخير للواجهة (0ms)
          Promise.resolve(
            supabase.from('audit_logs').insert([
              {
                store_id: resolvedStoreId,
                staff_id: isUUID(staffId) ? staffId : null,
                customer_id: isUUID(couponData.customer_id) ? couponData.customer_id : null,
                customer_phone: couponData.customer_phone,
                customer_name: couponData.customer_name || 'عميل مميز',
                action: 'REDEEM_REWARD',
                purchase_amount: 0,
                points_changed: 0,
                entry_method: entryMethod,
                metadata: {
                  coupon_id: couponData.id,
                  coupon_code: couponData.coupon_code,
                  privilege_title: couponData.privilege_title,
                  cost_points: couponData.cost_points,
                  cashier_name: staffName || 'كاشير المتجر',
                  redeemed_at: usedAt,
                },
              },
            ])
          ).catch((e: any) => console.warn('Supabase audit log warning', e));
        } catch (e: any) {
          console.warn('Supabase atomic burn coupon error', e);
        }
      }

      // Update local storage
      const localCoupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []);
      const idx = localCoupons.findIndex((c) => c.id === couponData.id || c.coupon_code === couponData.coupon_code);
      if (idx !== -1) {
        localCoupons[idx].status = 'REDEEMED';
        localCoupons[idx].used_at = usedAt;
        localCoupons[idx].cashier_name = staffName || 'كاشير المتجر';
        saveLocalData(STORAGE_KEYS.LOCAL_COUPONS, localCoupons);
      }

      LoyaltyEvents.emit({
        type: 'COUPON_REDEEMED',
        storeId: resolvedStoreId,
        couponId: couponData.id,
        couponCode: couponData.coupon_code,
        phone: couponData.customer_phone,
        rewardTitle: couponData.privilege_title,
      });

      return {
        type: 'COUPON',
        success: true,
        coupon: burnedCoupon,
        message: 'تم بنجاح حرق الكوبون وتسليم الطلب للعميل!',
      };
    }

    // =========================================================================
    // 🛡️ المسار الثاني: استبدال نقاط بمكافأة مباشرة (Direct Points Redeem)
    // =========================================================================
    if (qrType === 'REDEEM') {
      return {
        type: 'REDEEM_POINTS',
        success: true,
        customerPhone: scannedPhone,
        message: `استبدال ${pointsCost} نقطة لـ (${rewardTitle})`,
      };
    }

    // =========================================================================
    // 🛡️ المسار الثالث: باركود العميل (Customer Pass / User_ID / Phone)
    // =========================================================================
    const normPhone = normalizePhone(scannedPhone);
    let existingCustomerName = 'عميل المتجر';

    // Single Database Query - ONLY READ, NO INSERTS / WRITES AT SCAN TIME!
    if (supabase && isUUID(resolvedStoreId)) {
      try {
        const cleanPhone = scannedPhone.trim();
        const { data: custData } = await supabase
          .from('store_customers')
          .select('id, name, phone, wallet_balance, lifetime_xp')
          .eq('store_id', resolvedStoreId)
          .or(`phone.eq.${cleanPhone},phone.eq.${normPhone},phone.eq.0${normPhone},phone.eq.+966${normPhone},phone.eq.966${normPhone}`)
          .limit(1)
          .maybeSingle();

        if (custData && custData.name) {
          existingCustomerName = custData.name;
        }
      } catch (e) {
        console.warn('Customer lookup error', e);
      }
    } else {
      const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
      const matched = localCustomers.find(
        (c) => (c.store_id === resolvedStoreId || c.store_id === storeId) && normalizePhone(c.phone) === normPhone
      );
      if (matched && matched.name) {
        existingCustomerName = matched.name;
      }
    }

      // Return PASS for Cashier POS to open the Amount Modal
      return {
        type: 'PASS',
        success: true,
        customerPhone: normPhone,
        customerName: existingCustomerName,
      };
    })();

    scanDebounceCache.set(cacheKey, { timestamp: now, promise: execPromise });
    return execPromise;
  },

  // 11.7 البحث عن الاسم المسجل للعميل عبر أي متجر في المنصة (Cross-Store Customer Name Lookup)
  async findCustomerGlobalName(phone: string): Promise<string | null> {
    const normInput = normalizePhone(phone);
    if (!normInput || normInput.length < 5) return null;

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const cleanPhone = phone.trim();
        const { data, error } = await supabase
          .from('store_customers')
          .select('name, phone')
          .or(`phone.eq.${cleanPhone},phone.eq.${normInput},phone.eq.0${normInput},phone.eq.+966${normInput},phone.eq.966${normInput}`)
          .not('name', 'is', null)
          .neq('name', 'عميل')
          .neq('name', 'عميل مميز')
          .order('last_visit_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data && data.name && data.name.trim()) {
          return data.name.trim();
        }
      } catch (e) {
        console.warn('findCustomerGlobalName query failed', e);
      }
    }

    const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, INITIAL_CUSTOMERS);
    const matchedLocal = localCustomers.find(
      (c) =>
        normalizePhone(c.phone) === normInput &&
        c.name &&
        c.name.trim() &&
        c.name !== 'عميل' &&
        c.name !== 'عميل مميز'
    );
    return matchedLocal?.name?.trim() || null;
  },

  // 12. البحث عن عميل برقم الهاتف في متجر محدد
  async getCustomer(storeId: string, phone: string): Promise<Customer | null> {
    const normInput = normalizePhone(phone);
    if (!normInput || normInput.length < 5) return null;

    const currentStore = await this.resolveStore(storeId);
    const resolvedId = currentStore?.id || storeId;

    const supabase = getSupabaseClient();
    if (supabase && isUUID(resolvedId)) {
      try {
        const cleanPhone = phone.trim();
        const candidatePhones = Array.from(
          new Set([
            cleanPhone,
            normInput,
            `0${normInput}`,
            `966${normInput}`,
            `+966${normInput}`,
            `00966${normInput}`,
          ])
        ).filter(Boolean);

        const { data, error } = await supabase
          .from('store_customers')
          .select('id, store_id, phone, name, lifetime_xp, wallet_balance, last_visit_date, is_demo, created_at, updated_at')
          .eq('store_id', resolvedId)
          .in('phone', candidatePhones)
          .limit(1)
          .maybeSingle();

        if (!error && data && data.id) {
          return {
            id: data.id,
            store_id: data.store_id,
            phone: data.phone,
            name: data.name || 'عميل مميز',
            wallet_balance: Number(data.wallet_balance) || 0,
            lifetime_xp: Number(data.lifetime_xp) || 0,
            last_visit_date: data.last_visit_date ? data.last_visit_date.split('T')[0] : new Date().toISOString().split('T')[0],
            is_active: true,
            visits_count: 1,
            created_at: data.created_at,
          } as Customer;
        }
      } catch (e) {
        console.warn('Supabase getCustomer failed', e);
      }
    }
    const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
    return (
      customers.find(
        (c) =>
          (c.store_id === resolvedId || c.store_id === storeId) &&
          normalizePhone(c.phone) === normInput
      ) || null
    );
  },

  // 13. جلب جميع العملاء لمتجر محدد
  async getAllCustomers(storeId: string): Promise<Customer[]> {
    const currentStore = await this.resolveStore(storeId);
    const resolvedId = currentStore?.id || storeId;

    const supabase = getSupabaseClient();
    if (supabase && isUUID(resolvedId)) {
      try {
        const { data, error } = await supabase
          .from('store_customers')
          .select('id, store_id, phone, name, lifetime_xp, wallet_balance, last_visit_date, is_demo, created_at, updated_at')
          .eq('store_id', resolvedId)
          .order('last_visit_date', { ascending: false });
        if (!error && Array.isArray(data)) {
          const mapped: Customer[] = data.map((c: any) => ({
            id: c.id,
            store_id: c.store_id,
            phone: c.phone,
            name: c.name || 'عميل مميز',
            wallet_balance: Number(c.wallet_balance) || 0,
            lifetime_xp: Number(c.lifetime_xp) || 0,
            last_visit_date: c.last_visit_date ? c.last_visit_date.split('T')[0] : new Date().toISOString().split('T')[0],
            is_active: c.is_active !== undefined ? c.is_active : true,
            visits_count: c.visits_count || 1,
            created_at: c.created_at,
          }));
          saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, mapped);
          return mapped;
        }
      } catch (e) {
        console.warn('Supabase getAllCustomers failed', e);
      }
    }
    const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
    return customers.filter(
      (c) => c.store_id === resolvedId || c.store_id === storeId
    );
  },

  // 13.1 تحديث بيانات العميل (الاسم، الجوال، إلخ)
  async updateCustomer(customerId: string, updates: Partial<Customer>): Promise<Customer> {
    const supabase = getSupabaseClient();
    if (supabase && isUUID(customerId)) {
      try {
        const allowedCols = ['name', 'phone', 'wallet_balance', 'lifetime_xp', 'last_visit_date'];
        const dbUpdates: any = {};
        for (const k of allowedCols) {
          if ((updates as any)[k] !== undefined) {
            dbUpdates[k] = (updates as any)[k];
          }
        }
        if (Object.keys(dbUpdates).length > 0) {
          const { data, error } = await supabase
            .from('store_customers')
            .update(dbUpdates)
            .eq('id', customerId)
            .select()
            .single();
          if (!error && data) {
            const updated: Customer = {
              id: data.id,
              store_id: data.store_id,
              phone: data.phone,
              name: data.name || 'عميل مميز',
              wallet_balance: Number(data.wallet_balance) || 0,
              lifetime_xp: Number(data.lifetime_xp) || 0,
              last_visit_date: data.last_visit_date ? data.last_visit_date.split('T')[0] : new Date().toISOString().split('T')[0],
              is_active: updates.is_active !== undefined ? updates.is_active : true,
              visits_count: updates.visits_count || 1,
              created_at: data.created_at,
            };
            const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
            const idx = customers.findIndex((c) => c.id === customerId);
            if (idx !== -1) {
              customers[idx] = updated;
            } else {
              customers.unshift(updated);
            }
            saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);
            return updated;
          }
        }
      } catch (e) {
        console.warn('Supabase updateCustomer failed', e);
      }
    }

    const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
    const idx = customers.findIndex((c) => c.id === customerId);
    if (idx !== -1) {
      customers[idx] = { ...customers[idx], ...updates };
      saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);
      return customers[idx];
    }
    throw new Error('العميل غير موجود');
  },

  async updateCustomerName(customerId: string, name: string): Promise<Customer> {
    return this.updateCustomer(customerId, { name });
  },

  // 13.2 تفعيل / إيقاف حساب العميل (Kill Switch per Customer)
  async toggleCustomerActive(customerId: string, currentStatus: boolean = true): Promise<boolean> {
    const newStatus = !currentStatus;
    const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
    const idx = customers.findIndex((c) => c.id === customerId);
    if (idx !== -1) {
      customers[idx].is_active = newStatus;
      saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);
    }
    return newStatus;
  },

  // 13.3 تعديل رصيد العميل يدوياً (مكافأة خاصة أو تعديل مع قيد محاسبي)
  async adjustCustomerPoints(
    storeId: string,
    customerId: string,
    pointsDelta: number,
    reason: string,
    staffName?: string
  ): Promise<Customer> {
    // ─── 0. تهيئة مرة واحدة + جلب العميل مباشرة بالـ ID ────────────────────
    const supabase = getSupabaseClient();
    const currentStore = (await this.resolveStore(storeId)) || INITIAL_STORE;
    const resolvedStoreId = currentStore.id;

    let customer: Customer | undefined;
    if (supabase && isUUID(customerId) && isUUID(resolvedStoreId)) {
      try {
        const { data, error } = await supabase
          .from('store_customers')
          .select(await customerCols(supabase))
          .eq('id', customerId)
          .eq('store_id', resolvedStoreId)
          .maybeSingle();
        if (!error && data) {
          customer = {
            id: data.id,
            store_id: data.store_id,
            phone: data.phone,
            name: data.name || 'عميل مميز',
            wallet_balance: Number(data.wallet_balance) || 0,
            lifetime_xp: Number(data.lifetime_xp) || 0,
            last_visit_date: data.last_visit_date
              ? data.last_visit_date.split('T')[0]
              : new Date().toISOString().split('T')[0],
            is_active: data.is_active !== undefined ? data.is_active : true,
            visits_count: data.visits_count || 1,
            created_at: data.created_at,
          };
        }
      } catch (e) {
        console.warn('adjustCustomerPoints: direct customer fetch failed', e);
      }
    }
    if (!customer) {
      const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
      customer = localCustomers.find((c) => c.id === customerId);
    }
    if (!customer) throw new Error('العميل غير موجود');

    const newBalance = Math.max(0, (customer.wallet_balance || 0) + pointsDelta);
    const newLifetimeXP = pointsDelta > 0 ? (customer.lifetime_xp || 0) + pointsDelta : customer.lifetime_xp;

    const updated = await this.updateCustomer(customerId, {
      wallet_balance: newBalance,
      lifetime_xp: newLifetimeXP,
      last_visit_date: new Date().toISOString(),
    });

    // ─── Audit Log — Fire & Forget ────────────────────────────────────────────
    if (supabase && isUUID(resolvedStoreId)) {
      Promise.resolve(
        supabase.from('audit_logs').insert([
          {
            store_id: resolvedStoreId,
            customer_id: customerId,
            customer_phone: customer.phone,
            customer_name: customer.name || 'عميل',
            action: 'ADJUSTMENT',
            purchase_amount: 0,
            points_changed: pointsDelta,
            metadata: {
              reason,
              cashier_name: staffName || 'مدير المتجر',
              customer_name: customer.name || 'عميل',
            },
          },
        ])
      ).catch((e: any) => console.warn('Supabase adjustCustomerPoints audit log failed', e));
    }

    const logs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, []);
    logs.unshift({
      id: 'log-' + Date.now(),
      store_id: resolvedStoreId,
      staff_id: null,
      customer_id: customer.id,
      customer_phone: customer.phone,
      customer_name: customer.name || undefined,
      action: 'ADJUSTMENT',
      purchase_amount: 0,
      points_changed: pointsDelta,
      metadata: { reason, cashier_name: staffName || 'مدير المتجر', customer_name: customer.name || 'عميل' },
      created_at: new Date().toISOString(),
    });
    saveLocalData(STORAGE_KEYS.LOCAL_LOGS, logs);

    LoyaltyEvents.emit({ type: 'WALLET_UPDATED', storeId: resolvedStoreId });
    return updated;
  },

  // 13.4 تسجيل عميل جديد بالاسم ورقم الجوال مع معالجة الهدية الافتتاحية المحددة من التاجر
  async registerCustomer(
    storeId: string,
    phone: string,
    name: string,
    customWelcomePoints?: number
  ): Promise<Customer> {
    const normInput = normalizePhone(phone);
    const currentStore = (await this.resolveStore(storeId)) || INITIAL_STORE;
    const resolvedStoreId = currentStore.id;

    const existing = await this.getCustomer(resolvedStoreId, phone);
    if (existing) {
      if (name && name.trim() && name.trim() !== existing.name) {
        return await this.updateCustomer(existing.id, { name: name.trim() });
      }
      return existing;
    }

    const giftType = currentStore.welcome_gift_type || 'POINTS';
    let welcomePoints = 0;
    if (giftType === 'POINTS') {
      welcomePoints =
        customWelcomePoints !== undefined
          ? customWelcomePoints
          : (currentStore.welcome_points ?? 50);
    }

    const customerName = name.trim() || 'عميل مميز';

    const dbPayload = {
      store_id: resolvedStoreId,
      phone: normInput,
      name: customerName,
      wallet_balance: welcomePoints,
      lifetime_xp: welcomePoints,
      last_visit_date: new Date().toISOString(),
    };

    let createdCust: Customer;
    const supabase = getSupabaseClient();
    if (supabase && isUUID(resolvedStoreId)) {
      try {
        const { data, error } = await supabase
          .from('store_customers')
          .insert([dbPayload])
          .select('id, store_id, phone, name, lifetime_xp, wallet_balance, last_visit_date, is_demo, created_at, updated_at')
          .single();
        if (!error && data) {
          createdCust = {
            id: data.id,
            store_id: data.store_id,
            phone: data.phone,
            name: data.name || customerName,
            wallet_balance: Number(data.wallet_balance) || 0,
            lifetime_xp: Number(data.lifetime_xp) || 0,
            last_visit_date: data.last_visit_date ? data.last_visit_date.split('T')[0] : new Date().toISOString().split('T')[0],
            is_active: true,
            visits_count: 1,
            created_at: data.created_at,
          };
          const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
          saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, [createdCust, ...customers.filter((c) => c.id !== createdCust.id)]);
          LoyaltyEvents.emit({ type: 'CUSTOMER_UPDATED', storeId: resolvedStoreId, phone: data.phone });
        } else {
          console.warn('Supabase registerCustomer insert fallback:', error);
          createdCust = {
            ...dbPayload,
            id: 'cust-' + Date.now(),
            is_active: true,
            visits_count: 1,
          };
          const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
          saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, [createdCust, ...customers.filter((c) => c.id !== createdCust.id)]);
          LoyaltyEvents.emit({ type: 'CUSTOMER_UPDATED', storeId: resolvedStoreId, phone: createdCust.phone });
        }
      } catch (e) {
        console.warn('Supabase registerCustomer failed', e);
        createdCust = {
          ...dbPayload,
          id: 'cust-' + Date.now(),
          is_active: true,
          visits_count: 1,
        };
        const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
        saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, [createdCust, ...customers.filter((c) => c.id !== createdCust.id)]);
        LoyaltyEvents.emit({ type: 'CUSTOMER_UPDATED', storeId: resolvedStoreId, phone: createdCust.phone });
      }
    } else {
      createdCust = {
        ...dbPayload,
        id: 'cust-' + Date.now(),
        is_active: true,
        visits_count: 1,
      };
      const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
      saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, [createdCust, ...customers.filter((c) => c.id !== createdCust.id)]);
      LoyaltyEvents.emit({ type: 'CUSTOMER_UPDATED', storeId: resolvedStoreId, phone: createdCust.phone });
    }

    // إذا كانت الهدية الترحيبية عبارة عن عرض أو تجربة مجانية (OFFER) -> إنشاء وإيداع الكوبون في محفظة العميل فوراً
    if (giftType === 'OFFER') {
      const offerTitle = currentStore.welcome_offer_title?.trim() || 'عرض وتجربة ترحيبية مجانية';
      const code = 'WELCOME-' + Math.floor(1000 + Math.random() * 9000);
      const nowIso = new Date().toISOString();
      let couponId = 'cpn-welcome-' + Date.now();

      if (supabase && isUUID(resolvedStoreId)) {
        try {
          const dbCouponPayload: any = {
            store_id: resolvedStoreId,
            customer_id: isUUID(createdCust.id) ? createdCust.id : null,
            customer_phone: createdCust.phone,
            customer_name: createdCust.name || 'عميل مميز',
            privilege_id: null,
            privilege_title: offerTitle,
            privilege_image_url: null,
            coupon_code: code,
            cost_points: 0,
            status: 'ACTIVE',
            valid_start_time: '00:00',
            valid_end_time: '23:59',
            purchased_at: nowIso,
          };
          const { data: insertedCpn, error: cpnErr } = await supabase
            .from('customer_coupons')
            .insert([dbCouponPayload])
            .select('id')
            .single();
          if (!cpnErr && insertedCpn) {
            couponId = insertedCpn.id;
          } else {
            console.warn('Supabase insert welcome coupon failed:', cpnErr);
          }
        } catch (e) {
          console.warn('Supabase insert welcome coupon failed', e);
        }
      }

      const welcomeCoupon: CustomerCoupon = {
        id: couponId,
        store_id: resolvedStoreId,
        customer_id: createdCust.id,
        customer_phone: createdCust.phone,
        customer_name: createdCust.name || 'عميل مميز',
        privilege_id: null as any,
        privilege_title: offerTitle,
        coupon_code: code,
        cost_points: 0,
        status: 'ACTIVE',
        valid_start_time: '00:00',
        valid_end_time: '23:59',
        purchased_at: nowIso,
      };

      const localCoupons = getLocalData<CustomerCoupon[]>(STORAGE_KEYS.LOCAL_COUPONS, []);
      localCoupons.unshift(welcomeCoupon);
      saveLocalData(STORAGE_KEYS.LOCAL_COUPONS, localCoupons);

      LoyaltyEvents.emit({
        type: 'COUPON_PURCHASED',
        storeId: resolvedStoreId,
        phone: createdCust.phone,
        points: 0,
        newBalance: createdCust.wallet_balance,
        couponId: welcomeCoupon.id,
        couponCode: welcomeCoupon.coupon_code,
        rewardTitle: welcomeCoupon.privilege_title,
      });
    }

    LoyaltyEvents.emit({
      type: 'WALLET_UPDATED',
      storeId: resolvedStoreId,
    });
    LoyaltyEvents.emit({
      type: 'POINTS_ADDED',
      storeId: resolvedStoreId,
      phone: normInput,
      points: welcomePoints,
      newBalance: welcomePoints,
    });

    LoyaltyEvents.emit({
      type: 'CUSTOMER_UPDATED',
      storeId: resolvedStoreId,
      phone: normInput,
      newBalance: welcomePoints,
      newLifetimeXP: welcomePoints,
    });

    return createdCust;
  },

  // 13.5 إدارة وحفظ جلسة العميل
  saveCustomerSession(storeId: string, phone: string, storeSlug?: string): void {
    const normPhone = normalizePhone(phone);
    localStorage.setItem(`radar_cust_session_${storeId}`, normPhone);
    if (storeSlug) {
      localStorage.setItem(`radar_cust_session_${storeSlug}`, normPhone);
    }
  },

  getCustomerSession(storeId: string, storeSlug?: string): string | null {
    const direct = localStorage.getItem(`radar_cust_session_${storeId}`);
    if (direct) return direct;
    if (storeSlug) {
      return localStorage.getItem(`radar_cust_session_${storeSlug}`);
    }
    return null;
  },

  clearCustomerSession(storeId: string, storeSlug?: string): void {
    localStorage.removeItem(`radar_cust_session_${storeId}`);
    if (storeSlug) {
      localStorage.removeItem(`radar_cust_session_${storeSlug}`);
    }
  },

  // 14. تنفيذ عملية شراء واحتساب النقاط بناءً على معامل المتجر الفعلي (points_per_riyal)
  async processPurchase(
    storeId: string,
    phone: string,
    amount: number,
    note?: string,
    qrToken?: DynamicQRToken,
    staffId?: string,
    staffName?: string,
    entryMethod: 'qr_scan' | 'manual' = 'qr_scan'
  ): Promise<{ success: boolean; customer: Customer; pointsEarned: number; currentTier: string }> {
    if (qrToken) {
      const validation = this.validateAndConsumeQRToken(qrToken);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    // 1. استخراج المتجر الفعلي ومعامل النقاط
    const currentStore = (await this.resolveStore(storeId)) || INITIAL_STORE;
    const resolvedStoreId = currentStore.id;
    const multiplier = Number(currentStore.points_per_riyal) > 0 ? Number(currentStore.points_per_riyal) : 1.0;
    const pointsEarned = Math.floor(amount * multiplier);
    const normPhone = normalizePhone(phone);

    // البحث عن الاسم المسجل للعميل عبر المنصة للحفاظ على اسمه عند زيارته لمتجر جديد
    const globalName = (await this.findCustomerGlobalName(normPhone)) || 'عميل مميز';

    // 2. تحديث قاعدة بيانات Supabase الحية
    let supabaseUpdatedCust: Customer | null = null;
    let computedTier = 'ضيف (Guest)';
    const supabase = getSupabaseClient();

    if (supabase && isUUID(resolvedStoreId)) {
      try {
        // البحث عن العميل في هذا المتجر فورياً بالفهرس المباشر
        const cleanPhone = phone.trim();
        const { data: matchedCust } = await supabase
          .from('store_customers')
          .select(await customerCols(supabase))
          .eq('store_id', resolvedStoreId)
          .or(`phone.eq.${cleanPhone},phone.eq.${normPhone},phone.eq.0${normPhone},phone.eq.+966${normPhone},phone.eq.966${normPhone}`)
          .limit(1)
          .maybeSingle();

        if (matchedCust) {
          const newLifetime = (matchedCust.lifetime_xp || 0) + pointsEarned;
          const newBalance = (matchedCust.wallet_balance || 0) + pointsEarned;
          const updatePayload: any = {
            lifetime_xp: newLifetime,
            wallet_balance: newBalance,
            last_visit_date: new Date().toISOString(),
          };
          if (
            (!matchedCust.name || matchedCust.name === 'عميل' || matchedCust.name === 'عميل مميز') &&
            globalName &&
            globalName !== 'عميل مميز'
          ) {
            updatePayload.name = globalName;
          }

          const { data: updatedData } = await supabase
            .from('store_customers')
            .update(updatePayload)
            .eq('id', matchedCust.id)
            .select()
            .single();

          if (updatedData) supabaseUpdatedCust = updatedData as Customer;
        } else {
          // تسجيل العميل تلقائياً في هذا المتجر مع الحفاظ على اسمه المسجل
          const { data: insertedData } = await supabase
            .from('store_customers')
            .insert([
              {
                store_id: resolvedStoreId,
                phone: phone.trim(),
                name: globalName,
                lifetime_xp: pointsEarned,
                wallet_balance: pointsEarned,
                last_visit_date: new Date().toISOString(),
              },
            ])
            .select()
            .single();

          if (insertedData) {
            supabaseUpdatedCust = {
              id: insertedData.id,
              store_id: insertedData.store_id,
              phone: insertedData.phone,
              name: insertedData.name || globalName,
              wallet_balance: Number(insertedData.wallet_balance) || 0,
              lifetime_xp: Number(insertedData.lifetime_xp) || 0,
              last_visit_date: insertedData.last_visit_date,
              is_active: true,
              visits_count: 1,
              created_at: insertedData.created_at,
            };
          }
        }

        const effectiveCustomerName = supabaseUpdatedCust?.name || globalName;

        // تسجيل العملية في سجل التدقيق (Audit Logs)
        await supabase.from('audit_logs').insert([
          {
            store_id: resolvedStoreId,
            staff_id: staffId || null,
            customer_id: supabaseUpdatedCust?.id || null,
            customer_phone: phone.trim(),
            customer_name: effectiveCustomerName,
            action: 'PURCHASE',
            purchase_amount: amount,
            points_changed: pointsEarned,
            entry_method: entryMethod,
            metadata: {
              note: note || `شراء بقيمة ${amount} ر.س (معامل: ${multiplier} نقطة/ريال)`,
              cashier_name: staffName || 'كاشير',
              customer_name: effectiveCustomerName,
              multiplier: multiplier,
            },
          },
        ]);

        // جلب رتب المتجر لتحديد الرتبة الحالية
        const { data: storeTiers } = await supabase
          .from('tiers')
          .select(await tierCols(supabase))
          .eq('store_id', resolvedStoreId)
          .order('required_xp', { ascending: false });

        if (storeTiers && storeTiers.length > 0 && supabaseUpdatedCust) {
          computedTier =
            storeTiers.find((t: any) => t.required_xp <= supabaseUpdatedCust!.lifetime_xp)?.tier_name ||
            storeTiers[storeTiers.length - 1]?.tier_name ||
            'ضيف (Guest)';
        }
      } catch (e) {
        console.warn('Supabase processPurchase direct table operations failed', e);
      }
    }

    // 3. تحديث التخزين المحلي لضمان المزامنة التامة دائماً
    const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, INITIAL_CUSTOMERS);
    let localCust = customers.find(
      (c) => (c.store_id === resolvedStoreId || c.store_id === storeId) && normalizePhone(c.phone) === normPhone
    );

    if (localCust) {
      localCust.lifetime_xp += pointsEarned;
      localCust.wallet_balance += pointsEarned;
      localCust.last_visit_date = new Date().toISOString();
      if (
        (!localCust.name || localCust.name === 'عميل' || localCust.name === 'عميل مميز') &&
        globalName &&
        globalName !== 'عميل مميز'
      ) {
        localCust.name = globalName;
      }
      if (supabaseUpdatedCust) {
        localCust.id = supabaseUpdatedCust.id;
        localCust.lifetime_xp = supabaseUpdatedCust.lifetime_xp;
        localCust.wallet_balance = supabaseUpdatedCust.wallet_balance;
        localCust.name = supabaseUpdatedCust.name || localCust.name;
      }
    } else {
      localCust = supabaseUpdatedCust || {
        id: 'cust-' + Date.now(),
        store_id: resolvedStoreId,
        phone: phone.trim(),
        name: globalName,
        lifetime_xp: pointsEarned,
        wallet_balance: pointsEarned,
        last_visit_date: new Date().toISOString(),
        is_active: true,
        visits_count: 1,
      };
      customers.unshift(localCust);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);

    const effectiveCustName = localCust.name || globalName;

    // تحديث سجل العمليات محلياً
    const logs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, INITIAL_AUDIT_LOGS);
    logs.unshift({
      id: 'log-' + Date.now(),
      store_id: resolvedStoreId,
      staff_id: staffId || null,
      customer_id: localCust.id,
      customer_phone: localCust.phone,
      customer_name: effectiveCustName,
      action: 'PURCHASE',
      purchase_amount: amount,
      points_changed: pointsEarned,
      entry_method: entryMethod,
      metadata: {
        note: note || `شراء بقيمة ${amount} ر.س (معامل: ${multiplier} نقطة/ريال)`,
        cashier_name: staffName || 'كاشير',
        customer_name: effectiveCustName,
        multiplier: multiplier,
      },
      created_at: new Date().toISOString(),
    });
    saveLocalData(STORAGE_KEYS.LOCAL_LOGS, logs);

    // تحديد الرتبة محلياً إذا لم تأتِ من Supabase
    if (computedTier === 'ضيف (Guest)') {
      const tiers = getLocalData<Tier[]>(STORAGE_KEYS.LOCAL_TIERS, INITIAL_TIERS);
      const storeTiers = tiers.filter((t) => t.store_id === resolvedStoreId || t.store_id === storeId);
      computedTier =
        storeTiers
          .filter((t) => t.required_xp <= localCust!.lifetime_xp)
          .sort((a, b) => b.required_xp - a.required_xp)[0]?.tier_name || 'ضيف (Guest)';
    }

    return {
      success: true,
      customer: supabaseUpdatedCust || localCust,
      pointsEarned,
      currentTier: computedTier,
    };
  },

  // 15. حرق النقاط للمكافآت
  async processRedeem(
    storeId: string,
    phone: string,
    pointsToBurn: number,
    rewardTitle: string,
    qrToken?: DynamicQRToken,
    staffId?: string,
    staffName?: string,
    entryMethod: 'qr_scan' | 'manual' = 'qr_scan'
  ): Promise<{ success: boolean; customer: Customer; remainingBalance: number }> {
    if (qrToken) {
      const validation = this.validateAndConsumeQRToken(qrToken);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    const currentStore = (await this.resolveStore(storeId)) || INITIAL_STORE;
    const resolvedStoreId = currentStore.id;
    const normPhone = normalizePhone(phone);
    const supabase = getSupabaseClient();

    let updatedCustomer: Customer | null = null;

    if (supabase && isUUID(resolvedStoreId)) {
      try {
        const cleanPhone = phone.trim();
        const { data: matchedCust } = await supabase
          .from('store_customers')
          .select(await customerCols(supabase))
          .eq('store_id', resolvedStoreId)
          .or(`phone.eq.${cleanPhone},phone.eq.${normPhone},phone.eq.0${normPhone},phone.eq.+966${normPhone},phone.eq.966${normPhone}`)
          .limit(1)
          .maybeSingle();

        if (matchedCust) {
          if ((matchedCust.wallet_balance || 0) < pointsToBurn) {
            throw new Error(`رصيد العميل لا يكفي (${matchedCust.wallet_balance} نقطة فقط)`);
          }

          const newBalance = matchedCust.wallet_balance - pointsToBurn;
          const { data: updatedData } = await supabase
            .from('store_customers')
            .update({
              wallet_balance: newBalance,
              last_visit_date: new Date().toISOString(),
            })
            .eq('id', matchedCust.id)
            .select()
            .single();

          if (updatedData) updatedCustomer = updatedData as Customer;

          await supabase.from('audit_logs').insert([
            {
              store_id: resolvedStoreId,
              staff_id: staffId || null,
              customer_id: matchedCust.id,
              customer_phone: phone.trim(),
              customer_name: matchedCust.name || undefined,
              action: 'REDEEM_REWARD',
              purchase_amount: 0,
              points_changed: -pointsToBurn,
              entry_method: entryMethod,
              metadata: {
                reward: rewardTitle,
                cashier_name: staffName || 'كاشير',
                customer_name: matchedCust.name || undefined,
              },
            },
          ]);
        }
      } catch (e: any) {
        if (e.message && e.message.includes('رصيد العميل لا يكفي')) {
          throw e;
        }
        console.warn('Supabase processRedeem direct table operations failed', e);
      }
    }

    // التحديث في التخزين المحلي
    const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, INITIAL_CUSTOMERS);
    const customer = customers.find(
      (c) => (c.store_id === resolvedStoreId || c.store_id === storeId) && normalizePhone(c.phone) === normPhone
    );

    if (!customer && !updatedCustomer) {
      throw new Error('العميل غير مسجل في النظام');
    }

    const targetCust = customer || updatedCustomer!;

    if (targetCust.wallet_balance < pointsToBurn) {
      throw new Error(`رصيد العميل لا يكفي (${targetCust.wallet_balance} نقطة فقط)`);
    }

    targetCust.wallet_balance -= pointsToBurn;
    targetCust.last_visit_date = new Date().toISOString();
    saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);

    const logs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, INITIAL_AUDIT_LOGS);
    logs.unshift({
      id: 'log-' + Date.now(),
      store_id: resolvedStoreId,
      staff_id: staffId || null,
      customer_id: targetCust.id,
      customer_phone: targetCust.phone,
      customer_name: targetCust.name || undefined,
      action: 'REDEEM_REWARD',
      purchase_amount: 0,
      points_changed: -pointsToBurn,
      entry_method: entryMethod,
      metadata: { reward: rewardTitle, cashier_name: staffName || 'كاشير', customer_name: targetCust.name || undefined },
      created_at: new Date().toISOString(),
    });
    saveLocalData(STORAGE_KEYS.LOCAL_LOGS, logs);

    return {
      success: true,
      customer: updatedCustomer || targetCust,
      remainingBalance: (updatedCustomer || targetCust).wallet_balance,
    };
  },

  // 16. جلب سجل التدقيق المالي
  async getAuditLogs(storeId: string): Promise<AuditLog[]> {
    const currentStore = await this.resolveStore(storeId);
    const resolvedStoreId = currentStore?.id || storeId;

    const supabase = getSupabaseClient();
    if (supabase && isUUID(resolvedStoreId)) {
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*, store_customers(phone, name)')
          .eq('store_id', resolvedStoreId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (!error && data) {
          return data.map((l: any) => ({
            ...l,
            entry_method: l.entry_method || 'qr_scan',
            customer_phone: l.customer_phone || l.store_customers?.phone,
            customer_name: l.customer_name || l.metadata?.customer_name || l.store_customers?.name,
          })) as AuditLog[];
        }
      } catch (e) {
        console.warn('Supabase getAuditLogs failed', e);
      }
    }
    const logs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, INITIAL_AUDIT_LOGS);
    const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, INITIAL_CUSTOMERS);
    return logs
      .filter((l) => l.store_id === resolvedStoreId || l.store_id === storeId)
      .map((l) => {
        const cust = customers.find(
          (c) =>
            c.id === l.customer_id ||
            (l.customer_phone && normalizePhone(c.phone) === normalizePhone(l.customer_phone))
        );
        return {
          ...l,
          entry_method: l.entry_method || 'qr_scan',
          customer_name: l.customer_name || l.metadata?.customer_name || cust?.name || undefined,
        };
      });
  },

  // ==============================================================================
  // 17. إدارة الفواتير والسجل المالي العام (Immutable Master Financial Ledger & ZATCA)
  // ==============================================================================

  // جلب كافة الفواتير لجميع المتاجر (Server-First Batch via get_all_store_invoices_batch)
  async getAllInvoices(): Promise<Record<string, StoreInvoice[]>> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('get_all_store_invoices_batch');
        if (!error && data && typeof data === 'object') {
          saveLocalData(STORAGE_KEYS.LOCAL_INVOICES, data);
          return data as Record<string, StoreInvoice[]>;
        }
      } catch (e) {
        console.warn('[getAllInvoices] RPC get_all_store_invoices_batch error, trying direct query:', e);
      }

      try {
        const { data: invRows, error: invErr } = await supabase
          .from('store_invoices')
          .select('*')
          .order('created_at', { ascending: false });
        if (!invErr && invRows && invRows.length > 0) {
          const map: Record<string, StoreInvoice[]> = {};
          for (const inv of invRows) {
            const sId = inv.store_id;
            if (!map[sId]) map[sId] = [];
            map[sId].push(inv);
          }
          saveLocalData(STORAGE_KEYS.LOCAL_INVOICES, map);
          return map;
        }
      } catch (err) {
        console.warn('[getAllInvoices] direct store_invoices fallback error:', err);
      }
    }

    const localInvoices = getLocalData<Record<string, StoreInvoice[]>>(
      STORAGE_KEYS.LOCAL_INVOICES,
      INITIAL_INVOICES
    );
    return localInvoices || {};
  },

  // جلب فواتير المتجر (Server-First)
  async getStoreInvoices(storeId: string): Promise<StoreInvoice[]> {
    const supabase = getSupabaseClient();
    if (supabase && isUUID(storeId)) {
      try {
        const { data, error } = await supabase
          .from('store_invoices')
          .select('*')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          return data as StoreInvoice[];
        }
      } catch (e) {
        console.warn('[getStoreInvoices] store_invoices query error:', e);
      }
    }

    const localInvoices = getLocalData<Record<string, StoreInvoice[]>>(
      STORAGE_KEYS.LOCAL_INVOICES,
      INITIAL_INVOICES
    );
    return localInvoices[storeId] || [];
  },

  // ⚙️ إعدادات النموذج المالي والضريبي للمنصة (ZATCA & Freelance Document Config)
  getFinancialConfig(): FinancialPlatformConfig {
    const defaultCfg: FinancialPlatformConfig = {
      vat_enabled: false, // Default: 0% VAT for Freelance Document status (وثيقة عمل حر بدون رقم ضريبي)
      vat_rate: 0.00,
      default_commission_rate: 0.20,
      business_legal_status: 'FREELANCE_DOCUMENT',
      tax_number: '',
    };
    return getLocalData<FinancialPlatformConfig>(STORAGE_KEYS.LOCAL_FINANCIAL_CONFIG, defaultCfg);
  },

  updateFinancialConfig(patch: Partial<FinancialPlatformConfig>): FinancialPlatformConfig {
    const current = this.getFinancialConfig();
    const isVatEnabled = patch.vat_enabled !== undefined ? patch.vat_enabled : current.vat_enabled;
    const computedVatRate = isVatEnabled ? (patch.vat_rate || (current.vat_rate > 0 ? current.vat_rate : 0.15)) : 0.00;

    const updated: FinancialPlatformConfig = {
      ...current,
      ...patch,
      vat_enabled: isVatEnabled,
      vat_rate: computedVatRate,
    };
    saveLocalData(STORAGE_KEYS.LOCAL_FINANCIAL_CONFIG, updated);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global_financial_config' });
    return updated;
  },

  // حساب التفكيك المالي الدقيق والضريبة (Flexible VAT 0%-15%, Gateway Fee, Absolute Marketer Commission, Net Platform Revenue)
  calculateBreakdown(
    grossAmount: number,
    paymentMethod: string = 'mada',
    commissionRate: number = 0.20,
    customVatRate?: number
  ): FinancialBreakdown {
    const gross = Math.max(0, Number(grossAmount) || 0);
    const config = this.getFinancialConfig();

    // 🏛️ Flexible VAT Engine: 0% default for Freelance Document (or 15% when ZATCA mode is activated)
    const effectiveVatRate = typeof customVatRate === 'number'
      ? customVatRate
      : config.vat_enabled ? (config.vat_rate || 0.15) : 0.00;

    let netBeforeVat = gross;
    let vatAmount = 0.00;

    if (effectiveVatRate > 0) {
      netBeforeVat = Math.round((gross / (1 + effectiveVatRate)) * 100) / 100;
      vatAmount = Math.round((gross - netBeforeVat) * 100) / 100;
    }

    // 💳 Payment Gateway Fee (Independent platform operating expense)
    let gatewayRate = 0.010;
    let fixedFee = 1.0;
    const cleanMethod = (paymentMethod || '').toLowerCase();

    if (cleanMethod === 'mada') {
      gatewayRate = 0.010;
      fixedFee = 1.0;
    } else if (cleanMethod === 'credit_card' || cleanMethod === 'visa' || cleanMethod === 'mastercard') {
      gatewayRate = 0.0275;
      fixedFee = 1.0;
    } else if (cleanMethod === 'apple_pay') {
      gatewayRate = 0.022;
      fixedFee = 1.0;
    } else if (cleanMethod === 'sandbox') {
      gatewayRate = 0.00;
      fixedFee = 0.0;
    } else {
      gatewayRate = 0.015;
      fixedFee = 1.0;
    }

    const gatewayFee = (gross > 0 && cleanMethod !== 'sandbox')
      ? Math.round(((gross * gatewayRate) + fixedFee) * 100) / 100
      : 0;

    // 🌟 ZATCA-Compliant Marketer Commission Base: Calculated strictly against the Net Amount before VAT (Tax is non-commissionable)
    const cleanCommRate = Math.max(0, Math.min(1.0, Number(commissionRate) || 0.20));
    const affiliateCommission = Math.round((netBeforeVat * cleanCommRate) * 100) / 100;

    // 💰 Net Platform Revenue: Strictly balanced with Ledger Invariant
    const netPlatformAmount = Math.max(0, Math.round((gross - vatAmount - gatewayFee - affiliateCommission) * 100) / 100);

    return {
      grossAmount: gross,
      netBeforeVat,
      vatAmount,
      gatewayFee,
      affiliateCommission,
      netPlatformAmount,
      vatRate: effectiveVatRate,
      gatewayRate,
      commissionRate: cleanCommRate,
    };
  },

  // 🧮 حساب ترقية الباقات المباشرة وفروقات الأسعار (Tier Difference Upgrade Engine)
  calculateProratedUpgrade(
    store: Store,
    currentPlan: BillingPlan | null,
    newPlan: BillingPlan
  ): ProratedUpgradeCalculation {
    const now = Date.now();
    const currentEndMs = store.subscription_end_date ? new Date(store.subscription_end_date).getTime() : 0;
    const remainingMs = Math.max(0, currentEndMs - now);
    const remainingDays = Math.ceil(remainingMs / 86400000);

    let unusedCredit = 0;
    let dailyRateCurrent = 0;
    let netUpgradeAmount = newPlan.amount;

    // 🛡️ احتساب ترقية الباقة ودفع فرق الباقة (الصافي) حصراً عند الترقية لباقة أعلى سعراً
    if (store.setup_fee_paid && currentPlan && newPlan.amount > currentPlan.amount) {
      unusedCredit = currentPlan.amount;
      netUpgradeAmount = Math.max(0, Math.round((newPlan.amount - currentPlan.amount) * 100) / 100);
      dailyRateCurrent = Math.round((currentPlan.amount / 30) * 100) / 100;
    }

    return {
      currentPlan,
      newPlan,
      remainingDays,
      dailyRateCurrent,
      unusedCredit,
      newPlanAmount: newPlan.amount,
      netUpgradeAmount,
      hasProrationDiscount: unusedCredit > 0,
    };
  },

  // جلب السجل المالي العام غير القابل للتعديل (Master Financial Ledger - Server-First)
  async getFinancialLedger(filters?: {
    type?: string;
    storeId?: string;
    affiliateId?: string;
  }, forceFresh: boolean = true): Promise<FinancialLedgerEntry[]> {
    const isDefaultQuery = !filters || (!filters.type || filters.type === 'ALL') && !filters.storeId && !filters.affiliateId;
    if (!forceFresh && isDefaultQuery && ledgerListCache && (Date.now() - ledgerListCache.timestamp < SERVICE_CACHE_TTL)) {
      return ledgerListCache.data;
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        let query = supabase
          .from('financial_ledger')
          .select(await ledgerCols(supabase))
          .order('created_at', { ascending: false });

        if (filters?.type && filters.type !== 'ALL') {
          query = query.eq('transaction_type', filters.type);
        }
        if (filters?.storeId) {
          query = query.eq('store_id', filters.storeId);
        }
        if (filters?.affiliateId) {
          query = query.eq('affiliate_id', filters.affiliateId);
        }

        const { data, error } = await withTimeout(query, 3500);
        if (!error && data && data.length > 0) {
          const formatted: FinancialLedgerEntry[] = data.map((d: any) => ({
            id: d.id,
            transaction_id: d.transaction_id,
            invoice_id: d.invoice_id,
            store_id: d.store_id,
            affiliate_id: d.affiliate_id,
            payment_id: d.payment_id,
            transaction_type: d.transaction_type,
            gross_amount: Number(d.gross_amount) || 0,
            vat_amount: Number(d.vat_amount) || 0,
            gateway_fee: Number(d.gateway_fee) || 0,
            affiliate_commission: Number(d.affiliate_commission) || 0,
            net_platform_amount: Number(d.net_platform_amount) || 0,
            status: d.status || 'SETTLED',
            created_at: d.created_at,
            effective_at: d.effective_at || d.created_at,
            reversal_of: d.reversal_of,
            refund_of: d.refund_of,
            created_by: d.created_by || 'SYSTEM',
            metadata: d.metadata || {},
          }));
          saveLocalData(STORAGE_KEYS.LOCAL_FINANCIAL_LEDGER, formatted);
          if (isDefaultQuery) {
            ledgerListCache = { data: formatted, timestamp: Date.now() };
          }
          return formatted;
        }
        // 2. إذا لم يكن جدول financial_ledger موجوداً، يتم استخراج القيود الحقيقية مباشرة من المتاجر والعمولات المسجلة بالسيرفر
        const [storesRes, commsRes, leadsRes, pasRes] = await Promise.all([
          supabase.from('stores').select(await storeCols(supabase)).order('created_at', { ascending: false }),
          supabase.from('partner_commissions').select('*').order('created_at', { ascending: false }),
          supabase.from('merchant_leads').select('*'),
          supabase.from('partner_accounts').select('*'),
        ]);

        const dbStores = storesRes?.data || [];
        const dbComms = commsRes?.data || [];
        const dbLeads = leadsRes?.data || [];
        const dbPas = pasRes?.data || [];

        const localLedgerExisting = getLocalData<FinancialLedgerEntry[]>(
          STORAGE_KEYS.LOCAL_FINANCIAL_LEDGER,
          []
        );

        // تنظيف وحفظ القيود المحلية الأصلية مع منع التكرار تماماً واستبعاد القيود المصطنعة إذا وُجد قيد سداد حقيقي لنفس المتجر والمبلغ
        const cleanedExisting = localLedgerExisting.filter((loc) => {
          if (loc.id?.startsWith('tx_db_store_') || (loc.transaction_id && loc.transaction_id.startsWith('tx_pay_sandbox_' + (loc.store_id || '').slice(0, 8)))) {
            const hasReal = localLedgerExisting.some(
              (other) =>
                other !== loc &&
                other.store_id === loc.store_id &&
                other.gross_amount === loc.gross_amount &&
                !other.id?.startsWith('tx_db_store_')
            );
            if (hasReal) return false;
          }
          return true;
        });

        const uniqueLocalMap = new Map<string, FinancialLedgerEntry>();
        for (const loc of cleanedExisting) {
          const key = loc.transaction_id || loc.id || `${loc.store_id}_${loc.gross_amount}`;
          if (!uniqueLocalMap.has(key)) {
            uniqueLocalMap.set(key, loc);
          }
        }
        const combined: FinancialLedgerEntry[] = Array.from(uniqueLocalMap.values());

        // إضافة القيود المستخرجة فقط للمتاجر والعمليات التي ليس لها أي قيد مسبق في السجل (منع التدبيل والتكرار الحتمي)
        for (const s of dbStores) {
          if (s.setup_fee_paid === true || s.status === 'active' || s.subscription_status === 'active') {
            const hasEntry = combined.some((l) => l.store_id === s.id);
            if (!hasEntry) {
              const matchComm = dbComms.find((c: any) => c.store_id === s.id && (c.commission_type === 'STORE_ACQUISITION' || c.commission_type === 'STORE_CONVERSION'));
              const matchLead = dbLeads.find((l: any) => l.converted_store_id === s.id || (s.manager_contact && l.phone === s.manager_contact));
              let matchPa = matchComm ? dbPas.find((p: any) => p.id === matchComm.partner_account_id) : null;
              if (!matchPa && matchLead) {
                const leadAffId = matchLead.affiliate_id;
                const leadRef = (matchLead.referral_code || '').trim().toLowerCase();
                matchPa = dbPas.find((p: any) =>
                  (leadAffId && (p.id === leadAffId || p.affiliate_id === leadAffId)) ||
                  (leadRef && (p.slug?.toLowerCase() === leadRef || p.referral_code?.toLowerCase() === leadRef))
                );
              }

              const gross = matchComm ? Number(matchComm.basis_amount) : (Number(s.renewal_amount) || 690);
              const commAmt = matchComm
                ? Number(matchComm.commission_amount)
                : (matchPa ? Math.round(gross * (matchPa.acquisition_commission_rate ?? matchPa.commission_rate ?? 0.20) * 100) / 100 : 0);
              const gatewayFee = Math.round((gross * 0.01 + 1) * 100) / 100;
              const netPlatform = Math.round((gross - gatewayFee - commAmt) * 100) / 100;

              const shortId = (s.id || '').slice(0, 8);
              combined.push({
                id: 'tx_db_store_' + shortId,
                transaction_id: 'tx_pay_sandbox_' + shortId,
                invoice_id: 'inv_' + shortId,
                store_id: s.id,
                store_name: s.name,
                affiliate_id: matchPa?.id || matchComm?.partner_account_id || null,
                affiliate_name: matchPa?.display_name || (matchComm?.partner_account_id ? 'شريك رادار' : null),
                payment_id: 'pay_' + shortId,
                transaction_type: 'PAYMENT',
                gross_amount: gross,
                vat_amount: 0,
                gateway_fee: gatewayFee,
                affiliate_commission: commAmt,
                net_platform_amount: netPlatform,
                status: 'SETTLED',
                created_at: s.created_at || new Date().toISOString(),
                effective_at: s.created_at || new Date().toISOString(),
                created_by: 'GATEWAY_WEBHOOK',
                metadata: {
                  payment_method: 'mada',
                  gateway: 'sandbox',
                  plan_name: s.subscription_plan || (gross >= 1800 ? 'الباقة الاحترافية' : 'الباقة الأساسية'),
                  notes: `عملية سداد اشتراك متجر ${s.name} المعتمدة بالسيرفر`,
                },
              });
            }
          }
        }
        // 2.2 استخراج قيود ترقيات الباقات وتجديد الاشتراكات المسجلة بالسيرفر (بدون تكرار)
        for (const c of dbComms) {
          if (c.commission_type === 'SUBSCRIPTION_UPGRADE' || c.commission_type === 'SUBSCRIPTION_RENEWAL') {
            const hasUpgEntry = combined.some(
              (l) =>
                (l.metadata?.commission_id && l.metadata.commission_id === c.id) ||
                (l.invoice_id && l.invoice_id === c.invoice_id) ||
                (l.store_id === c.store_id && l.transaction_type === 'PAYMENT' && Math.abs(l.gross_amount - Number(c.basis_amount)) < 1)
            );
            if (!hasUpgEntry) {
              const matchStore = dbStores.find((s: any) => s.id === c.store_id);
              const matchPa = dbPas.find((p: any) => p.id === c.partner_account_id);
              const gross = Number(c.basis_amount) || 0;
              const commAmt = Number(c.commission_amount) || 0;
              const gatewayFee = Math.round((gross * 0.01 + 1) * 100) / 100;
              const netPlatform = Math.round((gross - gatewayFee - commAmt) * 100) / 100;
              const commShort = (c.id || '').slice(0, 8);

              combined.push({
                id: 'tx_comm_' + commShort,
                transaction_id: 'tx_pay_' + (c.commission_type === 'SUBSCRIPTION_UPGRADE' ? 'upg_' : 'rnw_') + commShort,
                invoice_id: 'inv_' + commShort,
                store_id: c.store_id,
                store_name: matchStore?.name || 'متجر معتمد',
                affiliate_id: c.partner_account_id,
                affiliate_name: matchPa?.display_name || (c.partner_account_id ? 'شريك رادار' : null),
                payment_id: 'pay_' + commShort,
                transaction_type: 'PAYMENT',
                gross_amount: gross,
                vat_amount: 0,
                gateway_fee: gatewayFee,
                affiliate_commission: commAmt,
                net_platform_amount: netPlatform,
                status: 'SETTLED',
                created_at: c.created_at || new Date().toISOString(),
                effective_at: c.created_at || new Date().toISOString(),
                created_by: 'GATEWAY_WEBHOOK',
                metadata: {
                  payment_method: 'mada',
                  gateway: 'sandbox',
                  commission_id: c.id,
                  plan_name: c.qualifying_event || (c.commission_type === 'SUBSCRIPTION_UPGRADE' ? 'ترقية باقة المتجر' : 'تجديد الاشتراك'),
                  commission_type: c.commission_type,
                  notes: c.qualifying_event ? `${c.qualifying_event} (${matchStore?.name || ''})` : `ترقية باقة ${matchStore?.name || ''}`,
                },
              });
            }
          }
        }

        saveLocalData(STORAGE_KEYS.LOCAL_FINANCIAL_LEDGER, combined);
        if (isDefaultQuery) {
          ledgerListCache = { data: combined, timestamp: Date.now() };
        }
        let filtered = [...combined];
        if (filters?.type && filters.type !== 'ALL') {
          filtered = filtered.filter((l) => l.transaction_type === filters.type);
        }
        if (filters?.storeId) {
          filtered = filtered.filter((l) => l.store_id === filters.storeId);
        }
        if (filters?.affiliateId) {
          filtered = filtered.filter((l) => l.affiliate_id === filters.affiliateId);
        }
        return filtered;
      } catch (e) {
        console.warn('Supabase getFinancialLedger fallback to local:', e);
      }
    }

    const localLedger = getLocalData<FinancialLedgerEntry[]>(
      STORAGE_KEYS.LOCAL_FINANCIAL_LEDGER,
      INITIAL_FINANCIAL_LEDGER
    );
    let filtered = [...localLedger];
    if (isDefaultQuery) {
      ledgerListCache = { data: filtered, timestamp: Date.now() };
    }
    if (filters?.type && filters.type !== 'ALL') {
      filtered = filtered.filter((l) => l.transaction_type === filters.type);
    }
    if (filters?.storeId) {
      filtered = filtered.filter((l) => l.store_id === filters.storeId);
    }
    if (filters?.affiliateId) {
      filtered = filtered.filter((l) => l.affiliate_id === filters.affiliateId);
    }
    return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  // تسجيل قيد جديد في السجل المالي العام (Immutable Insert Only)
  async recordFinancialLedgerEntry(entry: Partial<FinancialLedgerEntry>): Promise<FinancialLedgerEntry> {
    const nowIso = new Date().toISOString();
    const ledgerId = 'ledg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const txId = entry.transaction_id || `tx_${Date.now()}`;

    const newRecord: FinancialLedgerEntry = {
      id: ledgerId,
      transaction_id: txId,
      invoice_id: entry.invoice_id || null,
      store_id: entry.store_id || null,
      store_name: entry.store_name || null,
      affiliate_id: entry.affiliate_id || null,
      affiliate_name: entry.affiliate_name || null,
      payment_id: entry.payment_id || null,
      transaction_type: entry.transaction_type || 'PAYMENT',
      gross_amount: Number(entry.gross_amount) || 0,
      vat_amount: Number(entry.vat_amount) || 0,
      gateway_fee: Number(entry.gateway_fee) || 0,
      affiliate_commission: Number(entry.affiliate_commission) || 0,
      net_platform_amount: Number(entry.net_platform_amount) || 0,
      status: entry.status || 'SETTLED',
      created_at: nowIso,
      effective_at: entry.effective_at || nowIso,
      reversal_of: entry.reversal_of || null,
      refund_of: entry.refund_of || null,
      created_by: entry.created_by || 'SYSTEM',
      metadata: entry.metadata || {},
    };

    const currentLedger = getLocalData<FinancialLedgerEntry[]>(
      STORAGE_KEYS.LOCAL_FINANCIAL_LEDGER,
      INITIAL_FINANCIAL_LEDGER
    );
    const updatedLedger = [newRecord, ...currentLedger];
    saveLocalData(STORAGE_KEYS.LOCAL_FINANCIAL_LEDGER, updatedLedger);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('financial_ledger').insert([{
          transaction_id: newRecord.transaction_id,
          invoice_id: newRecord.invoice_id,
          store_id: newRecord.store_id,
          affiliate_id: newRecord.affiliate_id,
          payment_id: newRecord.payment_id,
          transaction_type: newRecord.transaction_type,
          gross_amount: newRecord.gross_amount,
          vat_amount: newRecord.vat_amount,
          gateway_fee: newRecord.gateway_fee,
          affiliate_commission: newRecord.affiliate_commission,
          net_platform_amount: newRecord.net_platform_amount,
          status: newRecord.status,
          reversal_of: newRecord.reversal_of,
          refund_of: newRecord.refund_of,
          created_by: newRecord.created_by,
          metadata: newRecord.metadata,
          effective_at: newRecord.effective_at,
          created_at: newRecord.created_at,
        }]);
      } catch (e) {
        console.warn('Supabase recordFinancialLedgerEntry error:', e);
      }
    }

    LoyaltyEvents.emit({ type: 'PAYMENT_COMPLETED', storeId: newRecord.store_id || 'global' });
    invalidateAllServiceCaches();
    return newRecord;
  },

  // معالجة الدفع والاشتراك مع تسجيل القيد المالي الدقيق والتحقق من التكرار (Idempotency - Server First [FIN-01, FIN-02])
  async processSubscriptionPayment(payload: {
    storeId: string;
    invoiceType: 'setup' | 'renewal' | 'upgrade' | 'extra_cashier';
    amount: number;
    paymentMethod?: string;
    gateway?: 'moyasar' | 'tap' | 'sandbox';
    gatewayPaymentId?: string;
    planId?: string;
  }): Promise<{ success: boolean; invoice: StoreInvoice; store: Store; ledgerEntry?: FinancialLedgerEntry }> {
    const paymentMethod = payload.paymentMethod || 'mada';
    const gateway = payload.gateway || 'moyasar';
    const gatewayPaymentId = payload.gatewayPaymentId || `pay_${gateway}_${Date.now()}`;
    const supabase = getSupabaseClient();
    const now = new Date();

    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const storeIdx = stores.findIndex((s) => s.id === payload.storeId);
    let currentStore = storeIdx !== -1 ? stores[storeIdx] : INITIAL_STORE;

    // استخراج الخطة لمعرفة مدة الاشتراك بالأشهر (duration_months)
    const allBillingPlans = this.getAllSubscriptionPlansSync();
    const targetPlan =
      (payload.planId
        ? allBillingPlans.find(
            (p) =>
              p.id === payload.planId ||
              p.code === payload.planId ||
              (p.code && p.code.toUpperCase() === String(payload.planId).toUpperCase()) ||
              (p.id && p.id.toUpperCase() === String(payload.planId).toUpperCase()) ||
              p.name === payload.planId
          )
        : null) ||
      allBillingPlans.find(
        (p) =>
          p.id === currentStore.subscription_plan_id ||
          p.code === currentStore.plan_code ||
          (p.name && currentStore.subscription_plan && (p.name === currentStore.subscription_plan || currentStore.subscription_plan.includes(p.name)))
      ) ||
      null;

    const planMonths = targetPlan?.duration_months ?? (targetPlan?.billing_interval === 'YEARLY' ? 12 : 1);
    const planTrialDays = targetPlan?.trial_days ? Number(targetPlan.trial_days) : 0;
    const durationDays = Math.max(1, planMonths * 30 + planTrialDays);
    const durationMs = durationDays * 86400000;
    const computedPlanName = targetPlan?.name || currentStore.subscription_plan || (payload.invoiceType === 'setup' ? 'باقة تأسيس المتجر' : 'تجديد الاشتراك');

    const breakdown = this.calculateBreakdown(payload.amount, paymentMethod);

    // 🚀 التحصين المالي بالسيرفر [FIN-01, FIN-02]: استدعاء المعاملة الذرية process_store_payment_atomic
    if (supabase && isUUID(payload.storeId)) {
      try {
        const { data: atomicRes, error: atomicErr } = await supabase.rpc('process_store_payment_atomic', {
          p_store_id: payload.storeId,
          p_invoice_type: payload.invoiceType,
          p_amount: payload.amount,
          p_payment_method: paymentMethod,
          p_gateway: gateway,
          p_gateway_payment_id: gatewayPaymentId,
          p_plan_id: targetPlan?.id || payload.planId || null,
          p_plan_code: targetPlan?.code || null,
          p_plan_name: computedPlanName,
          p_duration_months: planMonths,
          p_vat_rate: breakdown.vatRate,
          p_gateway_fee: breakdown.gatewayFee,
        });

        if (!atomicErr && atomicRes && atomicRes.success) {
          const freshStore = await this.resolveStore(payload.storeId, true) || currentStore;
          const serverInvoice: StoreInvoice = {
            id: atomicRes.invoice_id || ('inv-' + Date.now()),
            store_id: payload.storeId,
            invoice_number: atomicRes.invoice_number,
            invoice_type: payload.invoiceType,
            amount: payload.amount,
            vat_amount: atomicRes.vat_amount ?? breakdown.vatAmount,
            net_amount: atomicRes.net_amount ?? breakdown.netBeforeVat,
            currency: 'SAR',
            status: 'paid',
            payment_method: paymentMethod,
            gateway: gateway,
            gateway_payment_id: gatewayPaymentId,
            plan_id: targetPlan?.id || currentStore.subscription_plan_id,
            plan_name: computedPlanName,
            paid_at: now.toISOString(),
            created_at: now.toISOString(),
          };

          const atomicLedgerEntry: FinancialLedgerEntry = {
            id: atomicRes.ledger_id || ('ledg-' + Date.now()),
            transaction_id: `tx_${gatewayPaymentId}`,
            invoice_id: atomicRes.invoice_number,
            store_id: payload.storeId,
            affiliate_id: atomicRes.partner_id || null,
            payment_id: gatewayPaymentId,
            transaction_type: 'PAYMENT',
            gross_amount: atomicRes.gross_amount ?? breakdown.grossAmount,
            vat_amount: atomicRes.vat_amount ?? breakdown.vatAmount,
            gateway_fee: atomicRes.gateway_fee ?? breakdown.gatewayFee,
            affiliate_commission: atomicRes.commission_amount ?? breakdown.affiliateCommission,
            net_platform_amount: atomicRes.net_platform_amount ?? breakdown.netPlatformAmount,
            status: 'SETTLED',
            created_at: now.toISOString(),
            effective_at: now.toISOString(),
            created_by: 'GATEWAY_ATOMIC_RPC',
            metadata: {
              plan_name: computedPlanName,
              payment_method: paymentMethod,
              gateway,
            },
          };

          storeResolutionCache.set(freshStore.id.toLowerCase(), { store: freshStore, timestamp: Date.now() });
          if (freshStore.slug) storeResolutionCache.set(freshStore.slug.toLowerCase(), { store: freshStore, timestamp: Date.now() });

          LoyaltyEvents.emit({ type: 'PAYMENT_COMPLETED', storeId: payload.storeId });
          LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: payload.storeId });
          LoyaltyEvents.emit({ type: 'SUBSCRIPTION_UPDATED', storeId: payload.storeId });
          LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
          invalidateAllServiceCaches();

          return {
            success: true,
            invoice: serverInvoice,
            store: freshStore,
            ledgerEntry: atomicLedgerEntry,
          };
        } else if (atomicErr) {
          console.warn('[processSubscriptionPayment] Atomic RPC warning:', atomicErr);
        }
      } catch (atomicExc) {
        console.warn('[processSubscriptionPayment] Atomic RPC exception, using fallback:', atomicExc);
      }
    }

    // احتياط التنفيذ المباشر الآمن إذا لم تتوفر الدالة الذرية بالسيرفر
    const invoiceNum = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const currentEndMs = currentStore.subscription_end_date
      ? new Date(currentStore.subscription_end_date).getTime()
      : Date.now();
    const baseEndMs = payload.invoiceType === 'renewal' && currentStore.subscription_end_date
      ? Math.max(Date.now(), currentEndMs)
      : Date.now();
    const nextEndIso = new Date(baseEndMs + durationMs).toISOString();

    const createdInvoice: StoreInvoice = {
      id: 'inv-' + Date.now(),
      store_id: payload.storeId,
      invoice_number: invoiceNum,
      invoice_type: payload.invoiceType,
      amount: payload.amount,
      vat_amount: breakdown.vatAmount,
      net_amount: breakdown.netBeforeVat,
      currency: 'SAR',
      status: 'paid',
      payment_method: paymentMethod,
      gateway: gateway,
      gateway_payment_id: gatewayPaymentId,
      plan_id: targetPlan?.id || currentStore.subscription_plan_id,
      plan_name: computedPlanName,
      paid_at: now.toISOString(),
      created_at: now.toISOString(),
    };

    if (supabase && isUUID(payload.storeId)) {
      try {
        await supabase.from('store_invoices').insert([createdInvoice]);
        await supabase.from('stores').update({
          status: 'active',
          subscription_status: 'active',
          subscription_active: true,
          setup_fee_paid: true,
          subscription_end_date: nextEndIso,
          updated_at: now.toISOString(),
        }).eq('id', payload.storeId);
      } catch (dbErr) {
        console.warn('Fallback store_invoices insert error:', dbErr);
      }
    }

    const ledgerEntry = await this.recordFinancialLedgerEntry({
      transaction_id: `tx_${gatewayPaymentId}`,
      invoice_id: invoiceNum,
      store_id: payload.storeId,
      store_name: currentStore.name,
      payment_id: gatewayPaymentId,
      transaction_type: 'PAYMENT',
      gross_amount: breakdown.grossAmount,
      vat_amount: breakdown.vatAmount,
      gateway_fee: breakdown.gatewayFee,
      affiliate_commission: breakdown.affiliateCommission,
      net_platform_amount: breakdown.netPlatformAmount,
      status: 'SETTLED',
      created_by: 'GATEWAY_WEBHOOK',
      metadata: {
        payment_method: paymentMethod,
        gateway,
        plan_name: computedPlanName,
        tax_rate: breakdown.vatRate,
        base_amount: breakdown.netBeforeVat,
      },
    });

    LoyaltyEvents.emit({ type: 'PAYMENT_COMPLETED', storeId: payload.storeId });
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: payload.storeId });
    LoyaltyEvents.emit({ type: 'SUBSCRIPTION_UPDATED', storeId: payload.storeId });
    invalidateAllServiceCaches();

    return {
      success: true,
      invoice: createdInvoice,
      store: currentStore,
      ledgerEntry,
    };
  },

  // 8. معالجة الإشعار الدائن والاسترداد المالي واسترجاع العمولات المتوافق مع ZATCA [FIN-03]
  async processZatcaRefundAndCreditNote(payload: {
    invoiceId: string;
    storeId: string;
    refundAmount?: number;
    reason: string;
    adminUser: string;
    notes?: string;
  }): Promise<{ success: boolean; creditNote: CreditNote; ledgerEntry: FinancialLedgerEntry; error?: string }> {
    const supabase = getSupabaseClient();
    const now = new Date();

    // 🚀 التحصين المالي بالسيرفر [FIN-03]: استدعاء المعاملة الذرية للاسترداد وعكس العمولات بالسيرفر
    if (supabase) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('process_zatca_refund_and_clawback', {
          p_invoice_number: payload.invoiceId,
          p_refund_amount: payload.refundAmount || null,
          p_reason: payload.reason,
          p_admin_user: payload.adminUser || 'SUPER_ADMIN',
          p_notes: payload.notes || null,
        });

        if (!rpcErr && rpcRes && rpcRes.success) {
          const creditNote: CreditNote = {
            id: rpcRes.credit_note_id || ('cn-' + Date.now()),
            credit_note_number: rpcRes.credit_note_number,
            original_invoice_id: payload.invoiceId,
            original_invoice_number: rpcRes.invoice_number || payload.invoiceId,
            store_id: rpcRes.store_id || payload.storeId,
            store_name: payload.storeId,
            gross_refund_amount: rpcRes.gross_refund_amount,
            vat_refund_amount: rpcRes.vat_refund_amount,
            net_refund_amount: rpcRes.net_refund_amount,
            clawback_commission: rpcRes.clawback_commission,
            reason: payload.reason,
            status: 'ISSUED',
            issued_by: payload.adminUser || 'SUPER_ADMIN',
            issued_at: now.toISOString(),
            ledger_entry_id: rpcRes.ledger_id,
            notes: payload.notes || '',
          };

          const ledgerEntry: FinancialLedgerEntry = {
            id: rpcRes.ledger_id || ('ledg-' + Date.now()),
            transaction_id: `tx_cn_${rpcRes.credit_note_number}`,
            invoice_id: rpcRes.invoice_number || payload.invoiceId,
            store_id: rpcRes.store_id || payload.storeId,
            transaction_type: 'REFUND',
            gross_amount: -rpcRes.gross_refund_amount,
            vat_amount: -rpcRes.vat_refund_amount,
            gateway_fee: 0,
            affiliate_commission: -rpcRes.clawback_commission,
            net_platform_amount: -(rpcRes.gross_refund_amount - rpcRes.vat_refund_amount - rpcRes.clawback_commission),
            status: 'SETTLED',
            refund_of: rpcRes.invoice_number || payload.invoiceId,
            created_by: payload.adminUser || 'SUPER_ADMIN',
            created_at: now.toISOString(),
            effective_at: now.toISOString(),
          };

          invalidateAllServiceCaches();
          LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: rpcRes.store_id || payload.storeId });
          LoyaltyEvents.emit({ type: 'SUBSCRIPTION_UPDATED', storeId: rpcRes.store_id || payload.storeId });
          LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });

          return {
            success: true,
            creditNote,
            ledgerEntry,
          };
        } else if (rpcErr) {
          console.warn('[processZatcaRefundAndCreditNote] RPC warning:', rpcErr);
        }
      } catch (rpcExc) {
        console.warn('[processZatcaRefundAndCreditNote] RPC exception, fallback:', rpcExc);
      }
    }

    // احتياط التنفيذ المباشر إذا تعذر استدعاء الإجراء بالسيرفر
    const allInvoices = await this.getAllInvoices();
    let targetInvoice: StoreInvoice | null = null;
    let foundStoreId = payload.storeId;

    for (const [sId, invs] of Object.entries(allInvoices)) {
      const match = invs.find((i) => i.id === payload.invoiceId || i.invoice_number === payload.invoiceId);
      if (match) {
        targetInvoice = match;
        foundStoreId = sId;
        break;
      }
    }

    if (!targetInvoice) {
      return { success: false, error: 'الفاتورة الأصلية غير موجودة' } as any;
    }

    const refundGross = payload.refundAmount ? Number(payload.refundAmount) : targetInvoice.amount;
    const netRefund = Math.round((refundGross / 1.15) * 100) / 100;
    const vatRefund = Math.round((refundGross - netRefund) * 100) / 100;

    let clawbackAmount = 0;
    if (supabase) {
      try {
        const { data: comms } = await supabase
          .from('partner_commissions')
          .select('*')
          .or(`invoice_number.eq.${targetInvoice.invoice_number},store_id.eq.${foundStoreId}`);
        if (comms && comms.length > 0) {
          for (const c of comms) {
            if (c.status === 'EARNED' || c.status === 'PENDING') {
              await supabase.from('partner_commissions').update({ status: 'REVERSED', updated_at: now.toISOString() }).eq('id', c.id);
              clawbackAmount += Number(c.commission_amount) || 0;
            } else if (c.status === 'PAID') {
              await supabase.from('partner_commissions').insert([{
                partner_account_id: c.partner_account_id,
                store_id: foundStoreId,
                commission_type: 'CLAWBACK_RECOVERY',
                basis_amount: netRefund,
                commission_rate: c.commission_rate,
                commission_amount: -c.commission_amount,
                status: 'EARNED',
                idempotency_key: `clawback_${targetInvoice.invoice_number}_${c.id}`,
                invoice_number: targetInvoice.invoice_number,
                created_at: now.toISOString(),
              }]);
              clawbackAmount += Number(c.commission_amount) || 0;
            }
          }
        }
      } catch (cErr) {
        console.warn('Fallback clawback error:', cErr);
      }
    }

    const cnNumber = `CN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const netPlatformReversal = -(refundGross - vatRefund - clawbackAmount);
    const ledgerEntry = await this.recordFinancialLedgerEntry({
      transaction_id: `tx_cn_${cnNumber}`,
      invoice_id: targetInvoice.invoice_number || targetInvoice.id,
      store_id: foundStoreId,
      transaction_type: 'REFUND',
      gross_amount: -refundGross,
      vat_amount: -vatRefund,
      gateway_fee: 0.00,
      affiliate_commission: -clawbackAmount,
      net_platform_amount: Math.round(netPlatformReversal * 100) / 100,
      status: 'SETTLED',
      refund_of: targetInvoice.invoice_number,
      created_by: payload.adminUser || 'SUPER_ADMIN',
    });

    const creditNote: CreditNote = {
      id: 'cn-' + Date.now(),
      credit_note_number: cnNumber,
      original_invoice_id: targetInvoice.id,
      original_invoice_number: targetInvoice.invoice_number,
      store_id: foundStoreId,
      gross_refund_amount: refundGross,
      vat_refund_amount: vatRefund,
      net_refund_amount: netRefund,
      clawback_commission: clawbackAmount,
      reason: payload.reason,
      status: 'ISSUED',
      issued_by: payload.adminUser || 'SUPER_ADMIN',
      issued_at: now.toISOString(),
      ledger_entry_id: ledgerEntry.id,
      notes: payload.notes || '',
    };

    if (supabase) {
      try {
        await supabase.from('credit_notes').insert([creditNote]);
        await supabase.from('store_invoices').update({ status: 'refunded' }).eq('id', targetInvoice.id);
        await supabase.from('stores').update({ setup_fee_paid: false, subscription_status: 'trial', status: 'trial' }).eq('id', foundStoreId);
      } catch (err) {
        console.warn('Fallback credit_note insert error:', err);
      }
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: foundStoreId });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    invalidateAllServiceCaches();

    return {
      success: true,
      creditNote,
      ledgerEntry,
    };
  },

  // 9. تسجيل تسوية أو قيد يدوي من المشرف العام (Manual Ledger Adjustment)
  async recordManualLedgerAdjustment(payload: ManualAdjustmentPayload): Promise<{
    success: boolean;
    ledgerEntry: FinancialLedgerEntry;
    error?: string;
  }> {
    if (!payload.amount || Number(payload.amount) <= 0) {
      return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' } as any;
    }
    if (!payload.reference_number || !payload.admin_notes) {
      return { success: false, error: 'رقم المرجع وملاحظات المشرف إلزامية لتوثيق التسوية المحاسبية' } as any;
    }

    const sign = payload.adjustment_type === 'DEBIT' ? -1 : 1;
    const grossAdj = Math.round(Number(payload.amount) * sign * 100) / 100;
    const netAdj = Math.round((grossAdj / 1.15) * 100) / 100;
    const vatAdj = Math.round((grossAdj - netAdj) * 100) / 100;

    let storeName: string | null = null;
    if (payload.store_id) {
      const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
      const st = stores.find((s) => s.id === payload.store_id);
      storeName = st?.name || null;
    }

    let affiliateName: string | null = null;
    if (payload.affiliate_id) {
      const partners = getLocalData<PartnerAccount[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
      const pa = partners.find((p) => p.id === payload.affiliate_id || p.affiliate_id === payload.affiliate_id);
      affiliateName = pa?.display_name || null;
    }

    const ledgerEntry = await this.recordFinancialLedgerEntry({
      transaction_id: `tx_adj_${Date.now()}`,
      store_id: payload.store_id || null,
      store_name: storeName,
      affiliate_id: payload.affiliate_id || null,
      affiliate_name: affiliateName,
      transaction_type: 'ADJUSTMENT',
      gross_amount: grossAdj,
      vat_amount: vatAdj,
      gateway_fee: 0.00,
      affiliate_commission: 0.00,
      net_platform_amount: netAdj,
      status: 'SETTLED',
      created_by: payload.admin_user || 'SUPER_ADMIN',
      metadata: {
        adjustment_type: payload.adjustment_type,
        reason_category: payload.reason_category,
        reference_number: payload.reference_number,
        admin_user: payload.admin_user,
        admin_notes: payload.admin_notes,
      },
    });

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return { success: true, ledgerEntry };
  },

  // 10. تنفيذ صرف مستحقات المسوق/الشريك بالحوالة البنكية (Affiliate Payout Disbursement)
  async processAffiliatePayout(payload: {
    affiliateId: string;
    partnerName: string;
    iban: string;
    bankName: string;
    transferReference: string;
    adminUser: string;
    notes?: string;
  }): Promise<{ success: boolean; payout?: AffiliatePayoutRecord; ledgerEntry?: FinancialLedgerEntry; error?: string }> {
    if (!payload.iban || !payload.transferReference) {
      return { success: false, error: 'الآيبان ورقم مرجع الحوالة البنكية إلزاميان للصرف' };
    }

    const res = await this.settlePartnerCommissions(payload.affiliateId, payload.transferReference, {
      iban: payload.iban,
      bankName: payload.bankName,
      adminUser: payload.adminUser,
      notes: payload.notes,
    });

    if (!res.success) {
      return { success: false, error: res.error || 'فشلت عملية الصرف' };
    }

    return {
      success: true,
      payout: res.payout,
      ledgerEntry: res.ledgerEntry,
    };
  },

  // 11. جلب كافة الإشعارات الدائنة (Server-First)
  async getAllCreditNotes(): Promise<CreditNote[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('credit_notes')
          .select('*')
          .order('issued_at', { ascending: false });
        if (!error && data && data.length > 0) {
          saveLocalData(STORAGE_KEYS.LOCAL_CREDIT_NOTES, data);
          return data as CreditNote[];
        }
      } catch (err) {
        console.warn('[getAllCreditNotes] Supabase credit_notes query warning:', err);
      }
    }
    const local = getLocalData<CreditNote[]>(STORAGE_KEYS.LOCAL_CREDIT_NOTES, []);
    return local || [];
  },

  // 12. جلب كافة سجلات صرف مستحقات الشركاء
  async getAllAffiliatePayouts(): Promise<AffiliatePayoutRecord[]> {
    const local = getLocalData<AffiliatePayoutRecord[]>(STORAGE_KEYS.LOCAL_AFFILIATE_PAYOUTS, []);
    return local || [];
  },

  // حساب وتلخيص مؤشرات السجل المالي العام في الذاكرة بدون أي بطء أو تأخير (0ms)
  calculateMetricsFromLedger(ledger: FinancialLedgerEntry[], creditNotes: CreditNote[] = []): MasterFinancialMetrics {
    const comms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);

    let totalGrossVolume = 0;
    let totalVatPayable = 0;
    let totalGatewayFees = 0;
    let totalNetPlatformRevenue = 0;
    let totalRefundsVolume = 0;

    // 🛡️ استبعاد حركات ومعاملات متاجر الديمو من الحسابات المالية للإنتاج
    const realLedger = (ledger || []).filter((entry) => {
      if (!entry) return false;
      const sId = (entry.store_id || '').toLowerCase();
      const sName = (entry.store_name || '').toLowerCase();
      if (sId === DEMO_STORE_ID || sId.startsWith('demo-') || sId === 'demo') return false;
      if (sName.includes('demo') || sName.includes('تجريبي')) return false;
      if ((entry.metadata as any)?.is_demo === true) return false;
      return true;
    });

    for (const entry of realLedger) {
      if (entry.status !== 'SETTLED') continue;

      if (entry.transaction_type === 'PAYMENT' || entry.transaction_type === 'ADJUSTMENT') {
        totalGrossVolume += Number(entry.gross_amount) || 0;
        totalVatPayable += Number(entry.vat_amount) || 0;
        totalGatewayFees += Number(entry.gateway_fee) || 0;
        totalNetPlatformRevenue += Number(entry.net_platform_amount) || 0;
      } else if (entry.transaction_type === 'REFUND') {
        totalRefundsVolume += Math.abs(Number(entry.gross_amount) || 0);
        totalGrossVolume += Number(entry.gross_amount) || 0; // negative
        totalVatPayable += Number(entry.vat_amount) || 0; // negative
        totalNetPlatformRevenue += Number(entry.net_platform_amount) || 0; // negative
      }
    }

    let totalAffiliatePayable = 0;
    let totalAffiliatePaid = 0;
    let totalAffiliatePending = 0;
    let totalAffiliateReversed = 0;

    for (const comm of comms) {
      const amt = Number(comm.commission_amount) || 0;
      if (comm.status === 'AVAILABLE' || comm.status === 'EARNED') {
        totalAffiliatePayable += amt;
      } else if (comm.status === 'PAID') {
        totalAffiliatePaid += amt;
      } else if (comm.status === 'PENDING') {
        totalAffiliatePending += amt;
      } else if (comm.status === 'REVERSED') {
        totalAffiliateReversed += amt;
      }
    }

    const bonuses = getLocalData<any[]>(STORAGE_KEYS.LOCAL_BONUS_AWARDS, []);
    for (const b of bonuses) {
      const amt = Number(b.bonus_amount) || 0;
      if (b.status === 'ACHIEVED' || b.status === 'AWARDED') {
        totalAffiliatePayable += amt;
      } else if (b.status === 'PAID') {
        totalAffiliatePaid += amt;
      }
    }

    return {
      totalGrossVolume: Math.max(0, Math.round(totalGrossVolume * 100) / 100),
      totalVatPayable: Math.max(0, Math.round(totalVatPayable * 100) / 100),
      totalGatewayFees: Math.max(0, Math.round(totalGatewayFees * 100) / 100),
      totalAffiliatePayable: Math.max(0, Math.round(totalAffiliatePayable * 100) / 100),
      totalAffiliatePaid: Math.max(0, Math.round(totalAffiliatePaid * 100) / 100),
      totalAffiliatePending: Math.max(0, Math.round(totalAffiliatePending * 100) / 100),
      totalAffiliateReversed: Math.max(0, Math.round(totalAffiliateReversed * 100) / 100),
      totalNetPlatformRevenue: Math.max(0, Math.round(totalNetPlatformRevenue * 100) / 100),
      totalRefundsVolume: Math.max(0, Math.round(totalRefundsVolume * 100) / 100),
      totalCreditNotesCount: (creditNotes || []).length,
      totalTransactionsCount: (ledger || []).length,
    };
  },

  // 13. حساب وتلخيص كافة المؤشرات المالية للمنصة (Master Financial Metrics)
  async getMasterFinancialMetrics(): Promise<MasterFinancialMetrics> {
    const ledger = await this.getFinancialLedger();
    const creditNotes = await this.getAllCreditNotes();
    return this.calculateMetricsFromLedger(ledger, creditNotes);
  },

  // 14. معالج الويب هوك الحتمي لبوابات الدفع (Webhook Idempotency Handler)
  async processPaymentWebhook(event: {
    event_id: string;
    event_type: string;
    payment_id: string;
    amount: number;
    store_id: string;
    gateway: string;
    signature?: string;
    plan_id?: string;
    payment_method?: string;
  }): Promise<{ success: boolean; idempotent: boolean; invoice?: StoreInvoice; ledgerEntry?: FinancialLedgerEntry }> {
    const webhooks = getLocalData<any[]>(STORAGE_KEYS.LOCAL_WEBHOOK_EVENTS, []);
    const existing = webhooks.find((w) => w.event_id === event.event_id || (w.metadata?.payment_id === event.payment_id && w.processed));

    if (existing) {
      return { success: true, idempotent: true };
    }

    const webhookRecord = {
      id: 'wh_' + Date.now(),
      provider: event.gateway,
      event_id: event.event_id,
      event_type: event.event_type,
      signature_verified: Boolean(event.signature),
      processed: true,
      processed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      metadata: event,
    };
    saveLocalData(STORAGE_KEYS.LOCAL_WEBHOOK_EVENTS, [webhookRecord, ...webhooks]);

    const result = await this.processSubscriptionPayment({
      storeId: event.store_id,
      invoiceType: 'setup',
      amount: event.amount,
      paymentMethod: event.payment_method || 'mada',
      gateway: (event.gateway as any) || 'moyasar',
      gatewayPaymentId: event.payment_id,
      planId: event.plan_id,
    });

    return {
      success: result.success,
      idempotent: false,
      invoice: result.invoice,
      ledgerEntry: result.ledgerEntry,
    };
  },

  // فحص وتحديث دورة الاشتراك وحالات فترة السماح والإيقاف التلقائي
  async checkAndUpdateStoreSubscription(storeId: string, storeOverride?: Store): Promise<{
    status: StoreSubscriptionStatus;
    daysLeft: number;
    subscriptionEndDate: string;
    trialEndDate: string;
    isSuspended: boolean;
    requiresSetup: boolean;
    requiresRenewal: boolean;
    renewalAmount: number;
    inGracePeriod: boolean;
    graceDaysLeft: number;
    graceEndsAt?: string;
  }> {
    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const store = storeOverride || stores.find((s) => s.id === storeId || s.slug === storeId) || INITIAL_STORE;

    const isPaidActive = Boolean(
      store.setup_fee_paid === true ||
        store.subscription_status === 'active' ||
        store.status === 'active' ||
        (store as any).status === 'مشترك مدفوع' ||
        (store as any).lifecycle_stage === 'مشترك مدفوع'
    );

    const supabase = getSupabaseClient();
    if (supabase && isUUID(store.id)) {
      try {
        const { data, error } = await supabase.rpc('check_and_update_store_subscription', {
          p_store_id: store.id,
        });
        if (!error && data) {
          const isSuspendedFinal =
            store.subscription_active === false ||
            store.status === 'suspended' ||
            store.subscription_status === 'suspended'
              ? true
              : Boolean(data.is_suspended);

          const statusFinal: StoreSubscriptionStatus = isSuspendedFinal
            ? 'suspended'
            : isPaidActive || data.status === 'active'
            ? 'active'
            : 'trial';

          return {
            status: statusFinal,
            daysLeft: Number(data.days_left),
            subscriptionEndDate: data.subscription_end_date,
            trialEndDate: data.trial_end_date,
            isSuspended: isSuspendedFinal,
            requiresSetup: !isPaidActive,
            requiresRenewal: Boolean(data.requires_renewal),
            renewalAmount: Number(data.renewal_amount || 195),
            inGracePeriod: false,
            graceDaysLeft: 0,
          };
        }
      } catch (e) {
        console.warn('Supabase check_and_update_store_subscription failed', e);
      }
    }

    const now = Date.now();
    const trialEndMs = store.trial_end_date
      ? new Date(store.trial_end_date).getTime()
      : now + 14 * 86400000;
    const subEndMs = store.subscription_end_date
      ? new Date(store.subscription_end_date).getTime()
      : trialEndMs;

    const targetEndMs = isPaidActive ? subEndMs : trialEndMs;
    const daysLeft = Math.round(((targetEndMs - now) / 86400000) * 10) / 10;

    let status: StoreSubscriptionStatus = isPaidActive ? 'active' : 'trial';
    let isSuspended = false;
    let requiresSetup = !isPaidActive;
    let requiresRenewal = false;
    let inGracePeriod = false;
    let graceDaysLeft = 0;

    const graceDays = store.grace_period_days ?? 3;
    const graceEndMs = subEndMs + (graceDays * 86400000);
    const graceEndsAtIso = new Date(graceEndMs).toISOString();

    // 0. متجر معطل يدوياً من قبل إدارة المنصة (Kill Switch)
    if (
      store.subscription_active === false ||
      store.status === 'suspended' ||
      store.subscription_status === 'suspended'
    ) {
      status = 'suspended';
      isSuspended = true;
    }
    // 1. انتهاء التجربة المجانية دون سداد رسوم التأسيس 500 ريال (فقط للمتاجر غير المدفوعة)
    else if (!isPaidActive && now > trialEndMs) {
      status = 'suspended';
      isSuspended = true;
      requiresSetup = true;
    }
    // 2. انتهاء الاشتراك وفترة السماح التقنية (Grace Period) (للمشترك المدفوع)
    else if (isPaidActive && now > subEndMs) {
      if (now <= graceEndMs) {
        // في فترة السماح (3 إلى 5 أيام): المتجر والخدمات تظل نشطة مع التنبيه الإلزامي
        status = 'active';
        isSuspended = false;
        inGracePeriod = true;
        requiresRenewal = true;
        graceDaysLeft = Math.max(0, Math.round(((graceEndMs - now) / 86400000) * 10) / 10);
      } else {
        // انقضت فترة السماح بالكامل دون سداد
        status = 'suspended';
        isSuspended = true;
        inGracePeriod = false;
        requiresRenewal = true;
      }
    }
    // 3. تنبيه تجديد قبل 3 أيام
    else if (isPaidActive && daysLeft <= 3 && daysLeft >= 0) {
      requiresRenewal = true;
      status = 'active';
      isSuspended = false;
    } else {
      status = isPaidActive ? 'active' : 'trial';
      isSuspended = false;
    }

    // تحديث التخزين المحلي إن تغيرت الحالة
    if (
      store.subscription_status !== status ||
      store.subscription_active !== !isSuspended ||
      store.in_grace_period !== inGracePeriod ||
      (isPaidActive && !store.setup_fee_paid)
    ) {
      store.subscription_status = status;
      store.status = status;
      store.subscription_active = !isSuspended;
      store.in_grace_period = inGracePeriod;
      store.grace_period_ends_at = graceEndsAtIso;
      if (isPaidActive) {
        store.setup_fee_paid = true;
      }
      saveLocalData(STORAGE_KEYS.LOCAL_STORES, stores);
      LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: store.id });
    }

    return {
      status,
      daysLeft,
      subscriptionEndDate: store.subscription_end_date || new Date(subEndMs).toISOString(),
      trialEndDate: store.trial_end_date || new Date(trialEndMs).toISOString(),
      isSuspended,
      requiresSetup,
      requiresRenewal,
      renewalAmount: store.renewal_amount || 195,
      inGracePeriod,
      graceDaysLeft,
      graceEndsAt: graceEndsAtIso,
    };
  },

  // 👑 منح أيام إضافية وتمديد يدوي للاشتراك من المشرف العام (Super Admin Manual Override)
  async grantStoreComplimentaryDays(
    storeId: string,
    daysToAdd: number,
    reason: string,
    adminUser: string = 'SUPER_ADMIN',
    notes?: string
  ): Promise<{ success: boolean; store?: Store; ledgerEntry?: FinancialLedgerEntry; error?: string }> {
    if (daysToAdd <= 0) {
      return { success: false, error: 'عدد الأيام المضافة يجب أن يكون أكبر من صفر' };
    }

    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const storeIdx = stores.findIndex((s) => s.id === storeId);
    if (storeIdx === -1) {
      return { success: false, error: 'المتجر غير موجود' };
    }

    const store = stores[storeIdx];
    const now = Date.now();
    const currentEndMs = store.subscription_end_date ? new Date(store.subscription_end_date).getTime() : now;
    const baseMs = Math.max(now, currentEndMs);
    const newEndMs = baseMs + (daysToAdd * 86400000);
    const newEndIso = new Date(newEndMs).toISOString();

    const updatedStore: Store = {
      ...store,
      subscription_end_date: newEndIso,
      subscription_active: true,
      subscription_status: 'active',
      status: 'active',
      in_grace_period: false,
      complimentary_days_granted: (store.complimentary_days_granted || 0) + daysToAdd,
      last_override_at: new Date().toISOString(),
      last_override_reason: reason,
      updated_at: new Date().toISOString(),
    };

    stores[storeIdx] = updatedStore;
    saveLocalData(STORAGE_KEYS.LOCAL_STORES, stores);

    const supabase = getSupabaseClient();
    if (supabase && isUUID(storeId)) {
      try {
        await supabase.from('stores').update({
          subscription_active: true,
          subscription_status: 'active',
          status: 'active',
          updated_at: new Date().toISOString(),
        }).eq('id', storeId);
      } catch (e) {
        console.warn('Supabase grantStoreComplimentaryDays error:', e);
      }
    }

    // تسجيل قيد تسوية إدارية في السجل المالي لتوثيق التدخل
    const ledgerEntry = await this.recordFinancialLedgerEntry({
      transaction_id: `tx_override_${Date.now()}`,
      store_id: storeId,
      store_name: store.name,
      transaction_type: 'ADJUSTMENT',
      gross_amount: 0.00,
      vat_amount: 0.00,
      gateway_fee: 0.00,
      affiliate_commission: 0.00,
      net_platform_amount: 0.00,
      status: 'SETTLED',
      created_by: adminUser,
      metadata: {
        override_type: 'COMPLIMENTARY_DAYS',
        days_granted: daysToAdd,
        reason,
        previous_end_date: store.subscription_end_date,
        new_end_date: newEndIso,
        admin_notes: notes || '',
      },
    });

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    LoyaltyEvents.emit({ type: 'SUBSCRIPTION_UPDATED', storeId });

    return {
      success: true,
      store: updatedStore,
      ledgerEntry,
    };
  },

  // محاكي دورة حياة الاشتراكات للاختبار السريع (Testing & Simulation Switcher)
  async simulateSubscriptionState(
    storeId: string,
    state: 'trial_active' | 'trial_expired' | 'active_sub' | 'expiring_soon' | 'suspended'
  ): Promise<Store> {
    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const storeIdx = stores.findIndex((s) => s.id === storeId);
    let store = storeIdx !== -1 ? stores[storeIdx] : { ...INITIAL_STORE, id: storeId };

    const now = Date.now();

    if (state === 'trial_active') {
      // 1. تجربة مجانية نشطة (متبقي 5 أيام)
      store = {
        ...store,
        status: 'trial',
        subscription_status: 'trial',
        subscription_active: true,
        setup_fee_paid: false,
        trial_start_date: new Date(now - 2 * 86400000).toISOString(),
        trial_end_date: new Date(now + 5 * 86400000).toISOString(),
        subscription_end_date: new Date(now + 5 * 86400000).toISOString(),
      };
    } else if (state === 'trial_expired') {
      // 2. انتهت التجربة المجانية (تتطلب سداد 500 ريال تأسيس)
      store = {
        ...store,
        status: 'suspended',
        subscription_status: 'suspended',
        subscription_active: false,
        setup_fee_paid: false,
        trial_start_date: new Date(now - 8 * 86400000).toISOString(),
        trial_end_date: new Date(now - 1 * 86400000).toISOString(),
        subscription_end_date: new Date(now - 1 * 86400000).toISOString(),
      };
    } else if (state === 'active_sub') {
      // 3. اشتراك نشط ومدفوع (متبقي 20 يوماً)
      store = {
        ...store,
        status: 'active',
        subscription_status: 'active',
        subscription_active: true,
        setup_fee_paid: true,
        subscription_start_date: new Date(now - 10 * 86400000).toISOString(),
        subscription_end_date: new Date(now + 20 * 86400000).toISOString(),
      };
    } else if (state === 'expiring_soon') {
      // 4. اشتراك يقترب من الانتهاء (متبقي يومان - تنبيه تجديد 195 ر.س)
      store = {
        ...store,
        status: 'active',
        subscription_status: 'active',
        subscription_active: true,
        setup_fee_paid: true,
        subscription_start_date: new Date(now - 28 * 86400000).toISOString(),
        subscription_end_date: new Date(now + 2 * 86400000).toISOString(),
      };
    } else if (state === 'suspended') {
      // 5. متجر معلق لتجاوز تاريخ التجديد (يتطلب 195 ر.س للاستئناف)
      store = {
        ...store,
        status: 'suspended',
        subscription_status: 'suspended',
        subscription_active: false,
        setup_fee_paid: true,
        subscription_start_date: new Date(now - 35 * 86400000).toISOString(),
        subscription_end_date: new Date(now - 2 * 86400000).toISOString(),
      };
    }

    if (storeIdx !== -1) {
      stores[storeIdx] = store;
    } else {
      stores.unshift(store);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_STORES, stores);

    // مزامنة مع Supabase إن وجد
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('stores')
          .update({
            status: store.status,
            subscription_status: store.subscription_status,
            subscription_active: store.subscription_active,
            setup_fee_paid: store.setup_fee_paid,
            updated_at: new Date().toISOString(),
          })
          .eq('id', storeId);
      } catch (e) {
        console.warn('Supabase simulateSubscriptionState update failed', e);
      }
    }

    LoyaltyEvents.emit({ type: 'SUBSCRIPTION_UPDATED', storeId });
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });

    return store;
  },

  // استقبال ومعالجة Webhook من بوابات الدفع (Moyasar / Tap Payments)
  async handlePaymentWebhook(webhookPayload: {
    gateway: 'moyasar' | 'tap';
    eventType: string;
    paymentId: string;
    status: 'paid' | 'captured' | 'failed';
    amount: number; // بالهللة أو الريال
    storeId: string;
    invoiceType: 'setup' | 'renewal' | 'extra_cashier';
    paymentMethod?: string;
  }): Promise<{ success: boolean; message: string }> {
    if (webhookPayload.status === 'paid' || webhookPayload.status === 'captured') {
      const realAmount = webhookPayload.amount > 1000 ? webhookPayload.amount / 100 : webhookPayload.amount;
      await this.processSubscriptionPayment({
        storeId: webhookPayload.storeId,
        invoiceType: webhookPayload.invoiceType,
        amount: realAmount,
        paymentMethod: webhookPayload.paymentMethod || 'credit_card',
        gateway: webhookPayload.gateway,
        gatewayPaymentId: webhookPayload.paymentId,
      });
      return { success: true, message: `Webhook processed successfully for store ${webhookPayload.storeId}` };
    }
    return { success: false, message: `Payment status ${webhookPayload.status} not accepted` };
  },

  // ==========================================
  // 🛍️ Smart Catalog, Menu & Services Methods
  // ==========================================

  async getCatalogItems(storeId: string): Promise<CatalogItem[]> {
    const localList: CatalogItem[] = getLocalData(STORAGE_KEYS.LOCAL_CATALOG, []);
    return localList.filter((item) => item.store_id === storeId);
  },

  async addCatalogItem(item: Omit<CatalogItem, 'id' | 'created_at'>): Promise<CatalogItem> {
    const newItem: CatalogItem = {
      ...item,
      id: 'cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      created_at: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('catalog_items').insert([stripDataUrls({ ...newItem })]).select().single();
        if (!error && data) {
          // مزامنة محلياً أيضاً
          const localList: CatalogItem[] = getLocalData(STORAGE_KEYS.LOCAL_CATALOG, []);
          localList.unshift(data);
          saveLocalData(STORAGE_KEYS.LOCAL_CATALOG, localList);
          LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: item.store_id });
          return data;
        }
      } catch (e) {
        console.warn('Supabase addCatalogItem fallback to local', e);
      }
    }

    const localList: CatalogItem[] = getLocalData(STORAGE_KEYS.LOCAL_CATALOG, []);
    localList.unshift(newItem);
    saveLocalData(STORAGE_KEYS.LOCAL_CATALOG, localList);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: item.store_id });
    return newItem;
  },

  async updateCatalogItem(id: string, updates: Partial<CatalogItem>): Promise<CatalogItem> {
    const localList: CatalogItem[] = getLocalData(STORAGE_KEYS.LOCAL_CATALOG, []);
    const idx = localList.findIndex((item) => item.id === id);
    let updatedItem: CatalogItem | null = null;

    if (idx !== -1) {
      localList[idx] = { ...localList[idx], ...updates };
      updatedItem = localList[idx];
      saveLocalData(STORAGE_KEYS.LOCAL_CATALOG, localList);
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('catalog_items').update(stripDataUrls({ ...updates })).eq('id', id).select().single();
        if (!error && data) {
          updatedItem = data;
        }
      } catch (e) {
        console.warn('Supabase updateCatalogItem fallback', e);
      }
    }

    if (!updatedItem) {
      throw new Error(`Catalog item with id ${id} not found`);
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: updatedItem.store_id });
    return updatedItem;
  },

  async deleteCatalogItem(id: string): Promise<boolean> {
    const localList: CatalogItem[] = getLocalData(STORAGE_KEYS.LOCAL_CATALOG, []);
    const itemToDelete = localList.find((i) => i.id === id);
    const storeId = itemToDelete?.store_id;

    const filtered = localList.filter((item) => item.id !== id);
    saveLocalData(STORAGE_KEYS.LOCAL_CATALOG, filtered);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('catalog_items').delete().eq('id', id);
      } catch (e) {
        console.warn('Supabase deleteCatalogItem fallback', e);
      }
    }

    if (storeId) {
      LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    }
    return true;
  },

  // صياغة رسالة الواتساب فائقة الترتيب للطلب والحجز الموحد
  formatWhatsAppOrderMessage(payload: WhatsAppOrderPayload): string {
    const lines: string[] = [];

    const fulfillmentIcons: Record<string, string> = {
      dine_in: '🍽️ تناول محلي (طاولة)',
      takeaway: '🚗 استلام سفري / من الفرع',
      delivery: '🛵 توصيل للعنوان',
      service_booking: '💇‍♂️ حجز موعد خدمة',
    };

    lines.push(`*📋 طلب وحجز جديد - ${payload.store_name}*`);
    lines.push(`*رقم الطلب:* #${payload.order_id}`);
    lines.push(`*العميل:* ${payload.customer_name || 'عميل المتجر'} (${payload.customer_phone})`);
    if (payload.customer_tier) {
      lines.push(`*رتبة العميل:* 🌟 ${payload.customer_tier}`);
    }
    lines.push(`*نوع الطلب / الاستلام:* ${fulfillmentIcons[payload.fulfillment_type] || payload.fulfillment_type}`);

    // التفاصيل حسب نوع الاستلام
    const fd = payload.fulfillment_details;
    if (payload.fulfillment_type === 'dine_in') {
      if (fd.table_number) lines.push(`*رقم الطاولة:* #${fd.table_number}`);
      if (fd.party_size) lines.push(`*عدد الأفراد:* ${fd.party_size} أشخاص`);
      if (fd.arrival_time) lines.push(`*وقت الحضور:* ${fd.arrival_date || 'اليوم'} - ${fd.arrival_time}`);
    } else if (payload.fulfillment_type === 'takeaway') {
      if (fd.arrival_time) lines.push(`*وقت الاستلام المفضل:* ${fd.arrival_time}`);
      if (fd.car_model_and_plate) lines.push(`*بيانات السيارة:* ${fd.car_model_and_plate}`);
    } else if (payload.fulfillment_type === 'delivery') {
      if (fd.delivery_address) lines.push(`*العنوان:* ${fd.delivery_address}`);
      if (fd.delivery_gps_link) lines.push(`*رابط الموقع GPS:* ${fd.delivery_gps_link}`);
    } else if (payload.fulfillment_type === 'service_booking') {
      if (fd.arrival_date) lines.push(`*تاريخ الموعد:* ${fd.arrival_date}`);
      if (fd.arrival_time) lines.push(`*ساعة الحضور:* ${fd.arrival_time}`);
      if (fd.specialist_name) lines.push(`*المختص المطلوب:* ${fd.specialist_name}`);
    }

    if (fd.general_notes) {
      lines.push(`*ملاحظات خاصة:* "${fd.general_notes}"`);
    }

    lines.push(`\n━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`*🛒 تفاصيل الأصناف والخدمات:*`);

    payload.items.forEach((cartItem) => {
      const item = cartItem.catalog_item;
      lines.push(`▫️ *${cartItem.quantity}x ${item.name}* (${cartItem.total_price} ر.س)`);
      if (cartItem.selected_modifiers && cartItem.selected_modifiers.length > 0) {
        const modNames = cartItem.selected_modifiers
          .map((m) => `${m.name}${m.price_delta > 0 ? ` (+${m.price_delta} ر.س)` : ''}`)
          .join(', ');
        lines.push(`   └ إضافات: ${modNames}`);
      }
      if (cartItem.special_notes) {
        lines.push(`   └ ملاحظة: ${cartItem.special_notes}`);
      }
    });

    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`*المجموع الفرعي:* ${payload.subtotal} ر.س`);
    if (payload.delivery_fee > 0) {
      lines.push(`*رسوم التوصيل:* ${payload.delivery_fee} ر.س`);
    }
    lines.push(`*💰 الإجمالي المطلوب:* *${payload.total_amount} ر.س*`);
    if (payload.loyalty_points_earned > 0) {
      lines.push(`*🎁 نقاط الولاء المكتسبة:* +${payload.loyalty_points_earned} نقطة ولاء`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`⚡ *خيارات الرد السريع للتاجر (انسخ وأرسل للعميل):*`);
    if (payload.fulfillment_type === 'service_booking') {
      lines.push(`1️⃣ ✅ أهلاً بك! تم تأكيد وتثبيت حجز موعدك بنجاح 💇‍♂️`);
      lines.push(`2️⃣ ⏳ نعتذر منك، الوقت ممتلئ، نرجو اقتراح موعد بديل.`);
    } else {
      lines.push(`1️⃣ ✅ تم استلام طلبك وجاري التحضير والتجهيز فوراً.`);
      lines.push(`2️⃣ 🛵 طلبك جاهز / خرج مع المندوب للتوصيل.`);
      lines.push(`3️⃣ ⏳ نعتذر منك، يرجى التواصل معنا للتعديل.`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`_تم الإرسال عبر محرك الرادار الذكي (Radar Hub)_`);

    return lines.join('\n');
  },

  // توليد رابط الواتساب الجاهز للإرسال الفوري
  generateWhatsAppOrderUrl(merchantPhone: string, payload: WhatsAppOrderPayload): string {
    const rawText = this.formatWhatsAppOrderMessage(payload);
    const cleanPhone = (merchantPhone || '').replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;
    const encoded = encodeURIComponent(rawText);
    return `https://wa.me/${intlPhone}?text=${encoded}`;
  },

  // ==========================================
  // 💇‍♂️ Specialists & Staff Roster Methods
  // ==========================================

  async getStoreSpecialists(storeId: string): Promise<StoreSpecialist[]> {
    const localList: StoreSpecialist[] = getLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, []);
    return localList.filter((item) => item.store_id === storeId);
  },

  async addStoreSpecialist(data: Omit<StoreSpecialist, 'id' | 'created_at'>): Promise<StoreSpecialist> {
    const newSpec: StoreSpecialist = {
      ...data,
      id: 'spec-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      created_at: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: created, error } = await supabase.from('store_specialists').insert([stripDataUrls({ ...newSpec })]).select().single();
        if (!error && created) {
          const list: StoreSpecialist[] = getLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, []);
          list.unshift(created);
          saveLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, list);
          LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: data.store_id });
          return created;
        }
      } catch (e) {
        console.warn('Supabase addStoreSpecialist fallback', e);
      }
    }

    const list: StoreSpecialist[] = getLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, []);
    list.unshift(newSpec);
    saveLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, list);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: data.store_id });
    return newSpec;
  },

  async updateStoreSpecialist(id: string, updates: Partial<StoreSpecialist>): Promise<StoreSpecialist> {
    const list: StoreSpecialist[] = getLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, []);
    const idx = list.findIndex((s) => s.id === id);
    let updatedSpec: StoreSpecialist | null = null;

    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
      updatedSpec = list[idx];
      saveLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, list);
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: remoteUpdated } = await supabase.from('store_specialists').update(stripDataUrls({ ...updates })).eq('id', id).select().single();
        if (remoteUpdated) updatedSpec = remoteUpdated;
      } catch (e) {
        console.warn('Supabase updateStoreSpecialist fallback', e);
      }
    }

    if (!updatedSpec) throw new Error(`المختص غير موجود`);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: updatedSpec.store_id });
    return updatedSpec;
  },

  async deleteStoreSpecialist(id: string): Promise<boolean> {
    const list: StoreSpecialist[] = getLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, []);
    const target = list.find((s) => s.id === id);
    const storeId = target?.store_id;

    const filtered = list.filter((s) => s.id !== id);
    saveLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, filtered);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('store_specialists').delete().eq('id', id);
      } catch (e) {
        console.warn('Supabase deleteStoreSpecialist fallback', e);
      }
    }

    if (storeId) LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    return true;
  },

  // ==========================================
  // 🏷️ Global Categories & Modifiers Library
  // ==========================================

  async getGlobalCategories(storeId: string): Promise<GlobalCategory[]> {
    const list: GlobalCategory[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, []);
    return list.filter((c) => c.store_id === storeId);
  },

  async addGlobalCategory(category: Omit<GlobalCategory, 'id' | 'created_at'>): Promise<GlobalCategory> {
    const newCat: GlobalCategory = {
      ...category,
      id: 'cat-g-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      created_at: new Date().toISOString(),
    };

    const list: GlobalCategory[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, []);
    list.push(newCat);
    saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, list);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: category.store_id });
    return newCat;
  },

  async updateGlobalCategory(id: string, updates: Partial<GlobalCategory>): Promise<GlobalCategory> {
    const list: GlobalCategory[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, []);
    const idx = list.findIndex((c) => c.id === id);
    let updatedCat: GlobalCategory | null = null;

    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
      updatedCat = list[idx];
      saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, list);
    }

    if (!updatedCat) throw new Error(`القسم غير موجود`);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: updatedCat.store_id });
    return updatedCat;
  },

  async deleteGlobalCategory(id: string): Promise<boolean> {
    const list: GlobalCategory[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, []);
    const target = list.find((c) => c.id === id);
    const storeId = target?.store_id;

    const filtered = list.filter((c) => c.id !== id);
    saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, filtered);

    if (storeId) LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    return true;
  },

  async getGlobalModifierGroups(storeId: string): Promise<GlobalModifierGroup[]> {
    const list: GlobalModifierGroup[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, []);
    return list.filter((m) => m.store_id === storeId);
  },

  async addGlobalModifierGroup(group: Omit<GlobalModifierGroup, 'id' | 'created_at'>): Promise<GlobalModifierGroup> {
    const newGroup: GlobalModifierGroup = {
      ...group,
      id: 'mod-g-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      created_at: new Date().toISOString(),
    };

    const list: GlobalModifierGroup[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, []);
    list.unshift(newGroup);
    saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, list);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: group.store_id });
    return newGroup;
  },

  async updateGlobalModifierGroup(id: string, updates: Partial<GlobalModifierGroup>): Promise<GlobalModifierGroup> {
    const list: GlobalModifierGroup[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, []);
    const idx = list.findIndex((m) => m.id === id);
    let updatedGroup: GlobalModifierGroup | null = null;

    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
      updatedGroup = list[idx];
      saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, list);
    }

    if (!updatedGroup) throw new Error(`مجموعة الإضافات غير موجودة`);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: updatedGroup.store_id });
    return updatedGroup;
  },

  async deleteGlobalModifierGroup(id: string): Promise<boolean> {
    const list: GlobalModifierGroup[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, []);
    const target = list.find((m) => m.id === id);
    const storeId = target?.store_id;

    const filtered = list.filter((m) => m.id !== id);
    saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, filtered);

    if (storeId) LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    return true;
  },

  // ==========================================
  // 📅 Service Bookings & Appointments Methods
  // ==========================================

  async getStoreBookings(storeId: string): Promise<ServiceBooking[]> {
    const list: ServiceBooking[] = getLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, []);
    return list.filter((b) => b.store_id === storeId);
  },

  async createServiceBooking(
    booking: Omit<ServiceBooking, 'id' | 'booking_number' | 'created_at'>
  ): Promise<ServiceBooking> {
    const currentStore = await this.resolveStore(booking.store_id);
    const resolvedStoreId = currentStore?.id || booking.store_id;

    const bookingNumber = 'BK-' + Math.floor(1000 + Math.random() * 9000);
    const newBooking: ServiceBooking = {
      ...booking,
      service_id: booking.service_id || 'srv-main',
      store_id: resolvedStoreId,
      id: 'booking-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      booking_number: bookingNumber,
      created_at: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    if (supabase && isUUID(resolvedStoreId)) {
      try {
        const { data: created } = await supabase
          .from('service_bookings')
          .insert([newBooking])
          .select()
          .single();
        if (created) {
          const list: ServiceBooking[] = getLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, []);
          list.unshift(created);
          saveLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, list);
        }
      } catch (e) {
        console.warn('Supabase createServiceBooking fallback', e);
      }
    }

    const list: ServiceBooking[] = getLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, INITIAL_BOOKINGS);
    if (!list.some((b) => b.id === newBooking.id)) {
      list.unshift(newBooking);
      saveLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, list);
    }

    // 📝 تسجيل حركة الحجز تلقائياً في سجل العمليات والتدقيق المالي (Audit Logs)
    const usedAt = new Date().toISOString();
    const logEntry: AuditLog = {
      id: 'log-' + Date.now(),
      store_id: resolvedStoreId,
      staff_id: null,
      customer_id: newBooking.customer_id || 'guest',
      customer_phone: newBooking.customer_phone,
      customer_name: newBooking.customer_name,
      action: 'SERVICE_BOOKING',
      purchase_amount: newBooking.total_price || newBooking.service_price || 0,
      points_changed: newBooking.points_to_earn || 0,
      entry_method: 'manual',
      metadata: {
        booking_id: newBooking.id,
        booking_number: newBooking.booking_number,
        service_name: newBooking.service_name,
        specialist_name: newBooking.specialist_name || 'أي مختص متاح',
        booking_date: newBooking.booking_date,
        booking_time: newBooking.booking_time,
        duration_minutes: newBooking.duration_minutes || newBooking.service_duration_minutes || 30,
        notes: newBooking.notes,
        created_at: usedAt,
      },
      created_at: usedAt,
    };

    if (supabase && isUUID(resolvedStoreId)) {
      try {
        await supabase.from('audit_logs').insert([logEntry]);
      } catch (e) {
        console.warn('Supabase audit log insert for booking warning', e);
      }
    }

    const logs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, []);
    logs.unshift(logEntry);
    saveLocalData(STORAGE_KEYS.LOCAL_LOGS, logs);

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: resolvedStoreId });
    LoyaltyEvents.emit({ type: 'COUPON_PURCHASED', storeId: resolvedStoreId });

    return newBooking;
  },

  async updateServiceBookingStatus(
    bookingId: string,
    status: 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  ): Promise<ServiceBooking> {
    const list: ServiceBooking[] = getLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, INITIAL_BOOKINGS);
    const idx = list.findIndex((b) => b.id === bookingId);
    let updatedBooking: ServiceBooking | null = null;

    if (idx !== -1) {
      list[idx] = { ...list[idx], status };
      updatedBooking = list[idx];
      saveLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, list);
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: remoteUpdated } = await supabase
          .from('service_bookings')
          .update({ status })
          .eq('id', bookingId)
          .select()
          .single();
        if (remoteUpdated) updatedBooking = remoteUpdated;
      } catch (e) {
        console.warn('Supabase updateServiceBookingStatus fallback', e);
      }
    }

    if (!updatedBooking) throw new Error(`الحجز غير موجود`);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: updatedBooking.store_id });
    return updatedBooking;
  },

  // صياغة رسالة الواتساب المخصصة لحجز موعد خدمة
  formatWhatsAppBookingMessage(booking: ServiceBooking): string {
    const lines: string[] = [];
    lines.push(`*💇‍♂️ تأكيد حجز موعد جديد - ${booking.store_name || 'متجر رادار'}*`);
    lines.push(`*رقم الحجز:* #${booking.booking_number}`);
    lines.push(`*العميل:* ${booking.customer_name} (${booking.customer_phone})`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`*📌 الخدمة المطلوبة:* ${booking.service_name}`);
    if (booking.selected_modifiers && booking.selected_modifiers.length > 0) {
      const modNames = booking.selected_modifiers
        .map((m) => `${m.name}${m.price_delta > 0 ? ` (+${m.price_delta} ر.س)` : ''}`)
        .join('، ');
      lines.push(`*✨ الإضافات والترقيات:* ${modNames}`);
    }
    lines.push(`*⏱️ المدة المتوقعة:* ${booking.duration_minutes || booking.service_duration_minutes || 30} دقيقة`);
    lines.push(`*💰 السعر الإجمالي:* *${booking.total_price || booking.service_price || 0} ر.س*`);
    if (booking.specialist_name) {
      lines.push(`*✂️ المختص المفضل:* ${booking.specialist_name}`);
    } else {
      lines.push(`*✂️ المختص:* أي مختص متاح`);
    }
    lines.push(`*📅 تاريخ الموعد:* ${booking.booking_date}`);
    lines.push(`*⏰ ساعة الحضور:* ${booking.booking_time}`);
    const notes = booking.notes || booking.customer_notes;
    if (notes) {
      lines.push(`*📝 ملاحظات العميل:* "${notes}"`);
    }
    const points = booking.loyalty_points_earned || booking.points_to_earn;
    if (points && points > 0) {
      lines.push(`*🎁 نقاط الولاء المستحقة:* +${points} نقطة ولاء`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`⚡ *رد سريع لمدير المتجر (انسخ وأرسل للعميل):*`);
    lines.push(`1️⃣ ✅ أهلاً بك! تم تأكيد وتثبيت موعدك بنجاح ونحن بانتظارك 🌟`);
    lines.push(`2️⃣ ⏳ نعتذر منك، هذا الوقت ممتلئ، يرجى اختيار موعد بديل.`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`_تم الإرسال عبر محرك حجز الرادار الذكي (Radar Appointments)_`);
    return lines.join('\n');
  },

  generateWhatsAppBookingUrl(merchantPhone: string, booking: ServiceBooking): string {
    const rawText = this.formatWhatsAppBookingMessage(booking);
    const cleanPhone = (merchantPhone || '').replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;
    const encoded = encodeURIComponent(rawText);
    return `https://wa.me/${intlPhone}?text=${encoded}`;
  },

  // صياغة رسائل الواتساب الصادرة من التاجر للعميل بناءً على حالة الموعد (مؤكد / مكتمل / ملغي / لم يحضر)
  formatMerchantBookingStatusWhatsApp(
    booking: ServiceBooking,
    storeName: string,
    statusOverride?: 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  ): string {
    const status = statusOverride || booking.status || 'confirmed';
    const store = storeName || booking.store_name || 'متجر رادار';
    const lines: string[] = [];

    if (status === 'cancelled') {
      lines.push(`*❌ إشعار إلغاء الموعد - ${store}*`);
      lines.push(`أهلاً بك يا *${booking.customer_name}*،`);
      lines.push(`نود إبلاغك بأنه تم إلغاء حجز موعدك رقم *#${booking.booking_number}* لخدمة *(${booking.service_name})* المقرر بتاريخ *${booking.booking_date}* الساعة *${booking.booking_time}*.`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`💡 *إعادة الحجز:* يمكنك اختيار موعد بديل أو إعادة جدولة موعدك في أي وقت عبر محفظتك الرقمية.`);
      lines.push(`نعتذر عن أي إزعاج ونتشرف بخدمتك دائماً 🌟`);
    } else if (status === 'completed') {
      lines.push(`*🌟 شكراً لزيارتك لـ ${store} - #${booking.booking_number}*`);
      lines.push(`أهلاً بك يا *${booking.customer_name}*! ✨`);
      lines.push(`سعدنا جداً بخدمتك اليوم لخدمة: *${booking.service_name}*`);
      if (booking.specialist_name) {
        lines.push(`✂️ *مع المختص:* ${booking.specialist_name}`);
      }
      lines.push(`نتمنى أن تكون جلستك وتجربتك معنا قد نالت رضاك واستحسانك 🌟`);
      const points = booking.points_to_earn || booking.loyalty_points_earned || 0;
      if (points > 0) {
        lines.push(`🎁 *تمت إضافة نقاط الولاء إلى محفظتك بنجاح (+${points} نقطة).*`);
      }
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`نتطلع لرؤيتك مجدداً في ${store} قريباً 💎`);
    } else if (status === 'no_show') {
      lines.push(`*⏳ إشعار فوات الموعد - ${store}*`);
      lines.push(`أهلاً بك يا *${booking.customer_name}*،`);
      lines.push(`نفتقدك اليوم! لقد فاتك موعدك رقم *#${booking.booking_number}* لخدمة *(${booking.service_name})* بتاريخ *${booking.booking_date}* الساعة *${booking.booking_time}*.`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`💡 يمكنك إعادة حجز موعد جديد في أي وقت يناسبك عبر محفظتك الرقمية.`);
      lines.push(`حياك الله ونسعد بخدمتك دائماً ✨`);
    } else {
      // Confirmed
      lines.push(`*💇‍♂️ تأكيد موعدك في ${store} - #${booking.booking_number}*`);
      lines.push(`أهلاً بك يا *${booking.customer_name}*! 🌟`);
      lines.push(`يسعدنا تأكيد وتثبيت موعدك لخدمة: *${booking.service_name}* ✅`);
      if (booking.selected_modifiers && booking.selected_modifiers.length > 0) {
        const modNames = booking.selected_modifiers
          .map((m) => `${m.name}${m.price_delta > 0 ? ` (+${m.price_delta} ر.س)` : ''}`)
          .join('، ');
        lines.push(`✨ *الإضافات والترقيات:* ${modNames}`);
      }
      lines.push(`📅 *التاريخ:* ${booking.booking_date}`);
      lines.push(`⏰ *الساعة:* ${booking.booking_time}`);
      lines.push(`⏱️ *المدة المتوقعة:* ${booking.duration_minutes || booking.service_duration_minutes || 30} دقيقة`);
      lines.push(`✂️ *المختص:* ${booking.specialist_name || 'أي مختص متاح'}`);
      lines.push(`💰 *المبلغ الإجمالي:* ${booking.total_price || booking.service_price || 0} ر.س`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`نحن بانتظارك ونتشرف بخدمتك في ${store} ✨`);
    }

    return lines.join('\n');
  },

  generateMerchantBookingStatusWhatsAppUrl(
    booking: ServiceBooking,
    storeName: string,
    statusOverride?: 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  ): string {
    const rawText = this.formatMerchantBookingStatusWhatsApp(booking, storeName, statusOverride);
    const cleanPhone = (booking.customer_phone || '').replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;
    const encoded = encodeURIComponent(rawText);
    return `https://wa.me/${intlPhone}?text=${encoded}`;
  },

  async getAllPartners(forceFresh: boolean = true): Promise<any[]> {
    if (!forceFresh && partnersListCache && (Date.now() - partnersListCache.timestamp < SERVICE_CACHE_TTL)) {
      return partnersListCache.data;
    }

    const RESERVED_SLUGS = new Set(['partner', 'join', 'admin', 'customer', 'cashier', 'pos', 'superadmin', 'super-admin', '']);
    const pinOverrides = getLocalData<Record<string, string>>(STORAGE_KEYS.LOCAL_PARTNER_PINS, {});
    const existingLocal = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);

    const sanitizePartner = (p: any, localPartnerMatch?: any) => {
      let code = p.affiliates?.referral_code || p.referral_code || 'r1001';
      if (code.toLowerCase().startsWith('radar-')) {
        code = 'r' + (code.replace(/\D/g, '') || '1001');
      } else if (!code.toLowerCase().startsWith('r')) {
        code = 'r' + (code.replace(/\D/g, '') || '1001');
      }
      code = code.toLowerCase();

      let slug = (p.slug || '').toLowerCase().trim();
      if (RESERVED_SLUGS.has(slug) || slug.length < 2) {
        slug = code;
      }

      const pPhone = normalizePhone(p.affiliates?.phone || p.phone);
      const notes = p.affiliates?.notes || '';
      const parsedPinFromNotes = notes.match(/PIN:\s*(\S+)/)?.[1];

      // Priority of PIN:
      // 1. Explicit local PIN override (by ID, affiliate_id, normalized phone, or referral code)
      // 2. Explicit non-default DB pin_code if available
      // 3. Local partner pin_code
      // 4. Notes PIN
      // 5. DB pin_code (or default '1234')
      const overridePin =
        (p.id && pinOverrides[p.id]) ||
        (p.affiliate_id && pinOverrides[p.affiliate_id]) ||
        (pPhone && pinOverrides[pPhone]) ||
        (code && pinOverrides[code]) ||
        (slug && pinOverrides[slug]);

      const pinCode =
        overridePin ||
        (p.pin_code && p.pin_code !== '1234' ? p.pin_code : undefined) ||
        localPartnerMatch?.pin_code ||
        parsedPinFromNotes ||
        p.pin_code ||
        '1234';

      const commRate = typeof p.commission_rate === 'number'
        ? p.commission_rate
        : typeof p.affiliates?.commission_rate === 'number'
        ? p.affiliates.commission_rate
        : (localPartnerMatch?.commission_rate || 0.20);

      const recurringRate = typeof p.recurring_commission_rate === 'number'
        ? p.recurring_commission_rate
        : typeof p.affiliates?.recurring_commission_rate === 'number'
        ? p.affiliates.recurring_commission_rate
        : (localPartnerMatch?.recurring_commission_rate || 0.10);

      return {
        ...p,
        pin_code: String(pinCode).trim(),
        slug,
        referral_code: code,
        commission_rate: commRate,
        acquisition_commission_rate: commRate,
        recurring_commission_rate: recurringRate,
        target_value: p.target_value || localPartnerMatch?.target_value || 20,
        affiliates: p.affiliates
          ? {
              ...p.affiliates,
              referral_code: code,
              commission_rate: commRate,
              acquisition_commission_rate: commRate,
              recurring_commission_rate: recurringRate,
              notes: `PIN: ${String(pinCode).trim()}`,
            }
          : {
              id: p.affiliate_id || p.id,
              name: p.display_name,
              phone: p.phone,
              referral_code: code,
              commission_rate: commRate,
              acquisition_commission_rate: commRate,
              recurring_commission_rate: recurringRate,
              status: p.active !== false ? 'ACTIVE' : 'SUSPENDED',
              notes: `PIN: ${String(pinCode).trim()}`,
            },
      };
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const [affRes, paRes] = await Promise.all([
          withTimeout(supabase.from('affiliates').select('*').order('created_at', { ascending: false }), 2000),
          withTimeout(supabase.from('partner_accounts').select('*'), 2000).catch(() => ({ data: [] })),
        ]);

        const affList = affRes?.data || [];
        const paList = paRes?.data || [];

        if (!affRes?.error) {
          const combined = affList.map((aff: any) => {
            const pa = paList.find((p: any) => p.affiliate_id === aff.id);
            const rawNotes = aff.notes || '';
            const pinMatch = rawNotes.match(/PIN:\s*(\S+)/);
            const pinCode = pinMatch ? pinMatch[1] : (pa?.pin_code || '1234');
            const code = (aff.referral_code || 'r1001').toLowerCase();

            const partnerObj = {
              id: pa?.id || aff.id,
              affiliate_id: aff.id,
              display_name: aff.name,
              name: aff.name,
              slug: pa?.slug || code,
              region: pa?.region || '',
              phone: aff.phone,
              referral_code: code,
              pin_code: pinCode,
              active: aff.status !== 'SUSPENDED' && pa?.active !== false,
              created_at: aff.created_at,
              affiliates: aff,
            };

            return sanitizePartner(partnerObj);
          });

          saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, combined);
          partnersListCache = { data: combined, timestamp: Date.now() };
          return combined;
        }
      } catch (e) {
        console.warn('Supabase getAllPartners fallback to local:', e);
      }
    }

    const sanitizedLocal = existingLocal.map((lp) => sanitizePartner(lp));
    partnersListCache = { data: sanitizedLocal, timestamp: Date.now() };
    return sanitizedLocal;
  },

  async addPartner(payload: {
    name: string;
    phone: string;
    referral_code?: string;
    pin_code?: string;
    slug?: string;
    region?: string;
    target_value?: number;
    commission_rate?: number;
    recurring_commission_rate?: number;
  }): Promise<any> {
    const cleanName = payload.name.trim();
    const cleanPhone = payload.phone.trim();
    const normP = normalizePhone(cleanPhone);
    const commRate = typeof payload.commission_rate === 'number' ? Math.max(0.01, Math.min(1.0, payload.commission_rate)) : 0.20;
    const recurringRate = typeof payload.recurring_commission_rate === 'number' ? Math.max(0.01, Math.min(1.0, payload.recurring_commission_rate)) : 0.10;
    
    // Normalization: r + digits
    let cleanCode = (payload.referral_code || '').trim().toLowerCase();
    if (cleanCode.startsWith('radar-')) {
      cleanCode = 'r' + (cleanCode.replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000));
    } else if (!cleanCode.startsWith('r')) {
      const digits = cleanCode.replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000);
      cleanCode = `r${digits}`;
    }

    const RESERVED_SLUGS = new Set(['partner', 'join', 'admin', 'customer', 'cashier', 'pos', 'superadmin', 'super-admin', '']);
    let cleanSlug = (payload.slug || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (!cleanSlug || RESERVED_SLUGS.has(cleanSlug) || cleanSlug.length < 2) {
      cleanSlug = cleanCode;
    }
    const pinCode = (payload.pin_code || '1234').trim();

    // 🛡️ Pre-validation & Phone duplicate prevention:
    const existingPartners = await this.getAllPartners(true);
    const duplicatePhone = existingPartners.find(
      (p: any) => normalizePhone(p.affiliates?.phone || p.phone) === normP
    );
    if (duplicatePhone) {
      throw new Error(`رقم الجوال (${cleanPhone}) مسجل مسبقاً للشريك [${duplicatePhone.display_name || duplicatePhone.name}]، يرجى استخدام رقم آخر.`);
    }

    const duplicateCode = existingPartners.find(
      (p: any) => (p.affiliates?.referral_code || p.referral_code || '').toLowerCase().trim() === cleanCode
    );
    if (duplicateCode) {
      throw new Error(`كود الإحالة (${cleanCode}) مستخدم مسبقاً للشريك [${duplicateCode.display_name || duplicateCode.name}]، يرجى اختيار كود آخر.`);
    }

    let realAffId = 'aff-' + Date.now();
    let realPartnerId = 'partner-' + Date.now();

    // 1. Sync to Supabase first as source of truth
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: affData, error: affErr } = await supabase
          .from('affiliates')
          .insert([{
            name: cleanName,
            phone: cleanPhone,
            referral_code: cleanCode,
            status: 'ACTIVE',
            notes: `PIN: ${pinCode}`
          }])
          .select('id')
          .single();

        if (affErr) {
          if (affErr.code === '23505' || affErr.message.includes('unique') || affErr.message.includes('duplicate')) {
            throw new Error(`رقم الجوال (${cleanPhone}) أو كود الإحالة (${cleanCode}) مسجل مسبقاً في قاعدة البيانات.`);
          }
          console.warn('Supabase affiliates insert error:', affErr);
        }

        if (affData?.id) {
          realAffId = affData.id;
        }

        const { data: paData, error: paErr } = await supabase
          .from('partner_accounts')
          .insert([{
            affiliate_id: realAffId,
            display_name: cleanName,
            slug: cleanSlug,
            region: payload.region || null,
            active: true
          }])
          .select('id')
          .single();

        if (paData?.id) {
          realPartnerId = paData.id;
        }
      } catch (e: any) {
        if (e.message && e.message.includes('مسجل مسبقاً')) {
          throw e;
        }
        console.warn('Supabase sync partner error:', e);
      }
    }

    const newPartnerObj = {
      id: realPartnerId,
      affiliate_id: realAffId,
      display_name: cleanName,
      slug: cleanSlug,
      region: payload.region || '',
      target_value: payload.target_value || 20,
      commission_rate: commRate,
      acquisition_commission_rate: commRate,
      recurring_commission_rate: recurringRate,
      pin_code: pinCode,
      active: true,
      created_at: new Date().toISOString(),
      affiliates: {
        id: realAffId,
        name: cleanName,
        phone: cleanPhone,
        referral_code: cleanCode,
        commission_rate: commRate,
        acquisition_commission_rate: commRate,
        recurring_commission_rate: recurringRate,
        status: 'ACTIVE',
        notes: `PIN: ${pinCode}`,
      },
    };

    // 2. Save locally without duplicates
    const existing = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const updated = [
      newPartnerObj,
      ...existing.filter((p: any) => {
        const pPhone = normalizePhone(p.affiliates?.phone || p.phone);
        const pCode = (p.affiliates?.referral_code || p.referral_code || '').toLowerCase().trim();
        return pPhone !== normP && pCode !== cleanCode && p.id !== realPartnerId && p.affiliate_id !== realAffId;
      })
    ];
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, updated);

    // 3. Save PIN override map
    const pinOverrides = getLocalData<Record<string, string>>(STORAGE_KEYS.LOCAL_PARTNER_PINS, {});
    pinOverrides[realPartnerId] = pinCode;
    pinOverrides[realAffId] = pinCode;
    pinOverrides[cleanCode] = pinCode;
    pinOverrides[cleanSlug] = pinCode;
    if (normP) pinOverrides[normP] = pinCode;
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNER_PINS, pinOverrides);

    invalidatePartnersCache();
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    return newPartnerObj;
  },

  async togglePartnerStatus(partnerId: string, affiliateId: string, currentActive: boolean): Promise<boolean> {
    const nextActive = !currentActive;
    const nextStatus = nextActive ? 'ACTIVE' : 'SUSPENDED';

    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const updated = local.map((p: any) => {
      if (p.id === partnerId) {
        return {
          ...p,
          active: nextActive,
          affiliates: p.affiliates ? { ...p.affiliates, status: nextStatus } : p.affiliates,
        };
      }
      return p;
    });
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, updated);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('partner_accounts').update({ active: nextActive }).eq('id', partnerId);
        if (affiliateId) {
          await supabase.from('affiliates').update({ status: nextStatus }).eq('id', affiliateId);
        }
      } catch (e) {
        console.warn('Supabase toggle partner error:', e);
      }
    }
    invalidatePartnersCache();
    return nextActive;
  },

  async deletePartner(partnerId: string, affiliateId?: string): Promise<{ success: boolean; error?: string }> {
    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const updated = local.filter(
      (p: any) =>
        p.id !== partnerId &&
        p.affiliate_id !== partnerId &&
        (!affiliateId || p.affiliate_id !== affiliateId)
    );
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, updated);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('partner_commissions').delete().or(`partner_id.eq.${partnerId},partner_id.eq.${affiliateId || partnerId}`);
        await supabase.from('partner_accounts').delete().or(`id.eq.${partnerId},affiliate_id.eq.${partnerId}`);
        if (affiliateId) {
          await supabase.from('affiliates').delete().eq('id', affiliateId);
        }
      } catch (e) {
        console.warn('Supabase delete partner error:', e);
      }
    }
    invalidatePartnersCache();
    return { success: true };
  },

  async updatePartnerPin(partnerId: string, currentPin: string, newPin: string): Promise<{ success: boolean; error?: string; partner?: any }> {
    const cleanCurrent = (currentPin || '').trim();
    const cleanNew = (newPin || '').trim();

    if (!cleanNew || cleanNew.length < 4) {
      return { success: false, error: 'الرمز السري الجديد يجب أن يتكون من 4 أرقام على الأقل' };
    }

    // Fetch fresh partners list
    const allPartners = await this.getAllPartners(true);
    const targetNormId = normalizePhone(partnerId);
    const existingPartner = allPartners.find(
      (p: any) =>
        p.id === partnerId ||
        p.affiliate_id === partnerId ||
        p.slug === partnerId ||
        p.referral_code === partnerId ||
        (targetNormId && normalizePhone(p.affiliates?.phone || p.phone) === targetNormId)
    );
    if (!existingPartner) {
      return { success: false, error: 'لم يتم العثور على حساب الشريك' };
    }

    const pinOverrides = getLocalData<Record<string, string>>(STORAGE_KEYS.LOCAL_PARTNER_PINS, {});
    const pPhone = normalizePhone(existingPartner.affiliates?.phone || existingPartner.phone);
    const expectedPin = (
      pinOverrides[existingPartner.id] ||
      pinOverrides[existingPartner.affiliate_id] ||
      (pPhone && pinOverrides[pPhone]) ||
      pinOverrides[existingPartner.referral_code] ||
      pinOverrides[existingPartner.slug] ||
      existingPartner.pin_code ||
      '1234'
    ).trim();

    if (cleanCurrent !== expectedPin) {
      return { success: false, error: 'الرمز السري الحالي غير صحيح' };
    }

    // Save in persistent PIN overrides
    if (existingPartner.id) pinOverrides[existingPartner.id] = cleanNew;
    if (existingPartner.affiliate_id) pinOverrides[existingPartner.affiliate_id] = cleanNew;
    if (existingPartner.referral_code) pinOverrides[existingPartner.referral_code] = cleanNew;
    if (existingPartner.slug) pinOverrides[existingPartner.slug] = cleanNew;
    if (pPhone) pinOverrides[pPhone] = cleanNew;
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNER_PINS, pinOverrides);

    // Update local partner copy
    const updatedPartner = {
      ...existingPartner,
      pin_code: cleanNew,
      affiliates: existingPartner.affiliates ? {
        ...existingPartner.affiliates,
        notes: `PIN: ${cleanNew}`,
      } : {
        id: existingPartner.affiliate_id || existingPartner.id,
        name: existingPartner.display_name,
        phone: existingPartner.phone,
        referral_code: existingPartner.referral_code,
        notes: `PIN: ${cleanNew}`,
      },
    };

    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const updatedLocal = local.map((p: any) =>
      p.id === existingPartner.id || p.affiliate_id === existingPartner.affiliate_id ? updatedPartner : p
    );
    if (!updatedLocal.some((p: any) => p.id === existingPartner.id || p.affiliate_id === existingPartner.affiliate_id)) {
      updatedLocal.push(updatedPartner);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, updatedLocal);

    // Invalidate memory cache so next getAllPartners() returns fresh pin
    invalidatePartnersCache();

    // Update session storage
    try {
      localStorage.setItem('radar_partner_session', JSON.stringify(updatedPartner));
      const authRaw = localStorage.getItem('radar_unified_auth_user');
      if (authRaw) {
        const authParsed = JSON.parse(authRaw);
        if (authParsed.role === 'partner') {
          authParsed.metadata = updatedPartner;
          localStorage.setItem('radar_unified_auth_user', JSON.stringify(authParsed));
        }
      }
    } catch {}

    // Sync to Supabase
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        if (existingPartner.id) {
          await supabase
            .from('partner_accounts')
            .update({ pin_code: cleanNew })
            .eq('id', existingPartner.id);
        }
        if (existingPartner.affiliate_id) {
          await supabase
            .from('affiliates')
            .update({ notes: `PIN: ${cleanNew}` })
            .eq('id', existingPartner.affiliate_id);
        }
      } catch (e) {
        console.warn('Supabase updatePartnerPin sync warning', e);
      }
    }

    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    return { success: true, partner: updatedPartner };
  },

  async authenticatePartner(phoneOrCode: string, pin: string): Promise<{ success: boolean; partner?: any; error?: string }> {
    const cleanInput = (phoneOrCode || '').trim();
    const enteredPin = (pin || '').trim();

    if (!cleanInput) {
      return { success: false, error: 'يرجى إدخال رقم الجوال أو كود الشريك' };
    }
    if (!enteredPin) {
      return { success: false, error: 'يرجى إدخال الرمز السري (PIN)' };
    }

    const normPhone = normalizePhone(cleanInput);
    const cleanCode = cleanInput.toLowerCase();

    // Fetch fresh list
    const allPartners = await this.getAllPartners(true);
    const found = allPartners.find((p: any) => {
      const pPhone = normalizePhone(p.affiliates?.phone || p.phone);
      const pCode = (p.affiliates?.referral_code || p.referral_code || '').toLowerCase().trim();
      const pSlug = (p.slug || '').toLowerCase().trim();
      return (
        (normPhone && pPhone === normPhone) ||
        (cleanCode && pCode === cleanCode) ||
        (cleanCode && pSlug === cleanCode) ||
        (p.id === cleanInput) ||
        (p.affiliate_id === cleanInput)
      );
    });

    if (!found) {
      return { success: false, error: 'رقم الجوال أو كود الشريك غير مسجل كشريك مبيعات معتمد' };
    }

    if (found.active === false || found.affiliates?.status === 'SUSPENDED') {
      return { success: false, error: 'حساب الشريك موقوف حالياً، يرجى التواصل مع الإدارة' };
    }

    const pinOverrides = getLocalData<Record<string, string>>(STORAGE_KEYS.LOCAL_PARTNER_PINS, {});
    const pPhone = normalizePhone(found.affiliates?.phone || found.phone);
    const expectedPin = (
      pinOverrides[found.id] ||
      pinOverrides[found.affiliate_id] ||
      (pPhone && pinOverrides[pPhone]) ||
      pinOverrides[found.referral_code] ||
      pinOverrides[found.slug] ||
      found.pin_code ||
      '1234'
    ).trim();

    if (enteredPin !== expectedPin) {
      return { success: false, error: 'الرمز السري (PIN) غير صحيح' };
    }

    const authenticatedPartner = {
      ...found,
      pin_code: expectedPin,
    };

    // Save session
    try {
      localStorage.setItem('radar_partner_session', JSON.stringify(authenticatedPartner));
    } catch {}
    return { success: true, partner: authenticatedPartner };
  },

  getPartnerSession(): any | null {
    try {
      const raw = localStorage.getItem('radar_partner_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed) return null;

      const RESERVED_SLUGS = new Set(['partner', 'join', 'admin', 'customer', 'cashier', 'pos', 'superadmin', 'super-admin', '']);
      let code = parsed.affiliates?.referral_code || parsed.referral_code || 'r1001';
      if (code.toLowerCase().startsWith('radar-')) {
        code = 'r' + (code.replace(/\D/g, '') || '1001');
      } else if (!code.toLowerCase().startsWith('r')) {
        code = 'r' + (code.replace(/\D/g, '') || '1001');
      }
      code = code.toLowerCase();

      let slug = (parsed.slug || '').toLowerCase().trim();
      if (RESERVED_SLUGS.has(slug) || slug.length < 2) {
        slug = code;
      }

      parsed.slug = slug;
      parsed.referral_code = code;
      if (parsed.affiliates) parsed.affiliates.referral_code = code;

      return parsed;
    } catch {
      return null;
    }
  },

  clearPartnerSession(): void {
    try {
      localStorage.removeItem('radar_partner_session');
    } catch {}
  },

  // ==============================================================================
  // 📋 إدارة طلبات انضمام التجار (Merchant Leads Management - Server-First)
  // ==============================================================================
  async getAllLeads(forceFresh: boolean = true): Promise<MerchantLead[]> {
    if (!forceFresh && leadsListCache && (Date.now() - leadsListCache.timestamp < SERVICE_CACHE_TTL)) {
      return leadsListCache.data;
    }

    const supabase = getSupabaseClient();
    const localStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, []);
    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);

    const reconcileLead = (lead: any): MerchantLead => {
      const norm = normalizeLead(lead);
      const leadPhone = normalizePhone(norm.phone);
      const matchingStore = localStores.find(
        (s) =>
          (s.id && norm.converted_store_id === s.id) ||
          (s.manager_contact && normalizePhone(s.manager_contact) === leadPhone) ||
          (s.name && s.name.trim().toLowerCase() === norm.store_name.trim().toLowerCase())
      );
      const matchComm = localComms.find(
        (c) =>
          (c.merchant_lead_id && c.merchant_lead_id === norm.id) ||
          (c.store_id && (c.store_id === norm.converted_store_id || (matchingStore && c.store_id === matchingStore.id))) ||
          (c.merchant_name && norm.store_name && c.merchant_name.trim().toLowerCase() === norm.store_name.trim().toLowerCase())
      );
      const hasEarnedComm = matchComm && (matchComm.status === 'EARNED' || matchComm.status === 'AVAILABLE' || matchComm.status === 'PAID');
      const isPaidStore = hasEarnedComm || (matchingStore && (matchingStore.setup_fee_paid === true || matchingStore.status === 'active') && matchingStore.status !== 'trial');

      if (matchingStore || hasEarnedComm || norm.converted_store_id) {
        return {
          ...norm,
          converted_store_id: matchingStore?.id || norm.converted_store_id,
          status: 'CONVERTED',
          lifecycle_stage: isPaidStore ? 'مشترك مدفوع' : norm.lifecycle_stage === 'مشترك مدفوع' ? 'مشترك مدفوع' : 'تم التأسيس',
        };
      }
      return norm;
    };

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('merchant_leads')
          .select(await leadCols(supabase))
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          const validLeads = data.map(reconcileLead);
          saveLocalData(STORAGE_KEYS.LOCAL_LEADS, validLeads);
          leadsListCache = { data: validLeads, timestamp: Date.now() };
          return validLeads;
        }
      } catch (e) {
        console.warn('Supabase getAllLeads failed:', e);
      }
    }
    const local = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
    const validLocal = local.map(reconcileLead);
    leadsListCache = { data: validLocal, timestamp: Date.now() };
    return validLocal;
  },

  async submitLead(payload: {
    store_name: string;
    manager_name: string;
    phone: string;
    referral_code?: string;
    city?: string;
    business_type?: string;
    notes?: string;
  }): Promise<{ success: boolean; lead_id?: string; error?: string }> {
    const cleanStore = payload.store_name.trim();
    const cleanManager = payload.manager_name.trim();
    const cleanPhone = payload.phone.trim();
    const refCode = payload.referral_code?.trim() || null;

    const normalizeP = (p?: string | null) => {
      let c = (p || '').replace(/[^0-9]/g, '');
      if (c.startsWith('00966')) c = c.substring(5);
      else if (c.startsWith('966')) c = c.substring(3);
      if (c.length === 10 && c.startsWith('05')) c = c.substring(1);
      return c;
    };
    const normPhone = normalizeP(cleanPhone);

    // 🛡️ Pre-validation & Phone collision protection against active stores:
    const localStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const localStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);
    const hasActiveStore = localStores.some(
      (s) => normalizeP(s.manager_contact) === normPhone && (s.subscription_active || s.status === 'active' || s.status === 'trial')
    ) || localStaff.some((st) => normalizeP(st.phone) === normPhone && st.is_active);

    if (hasActiveStore) {
      return {
        success: false,
        error: 'رقم الجوال مسجل مسبقاً لمتجر نشط في المنصة، يرجى تسجيل الدخول أو استخدام رقم آخر.',
      };
    }

    const tempId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `lead-${Date.now()}`;
    const newLead: MerchantLead = {
      id: tempId,
      store_name: cleanStore,
      manager_name: cleanManager,
      phone: cleanPhone,
      city: payload.city || null,
      business_type: payload.business_type || null,
      attribution_source: refCode ? 'REFERRAL' : 'DIRECT',
      referral_code: refCode,
      status: 'NEW',
      conversion_started_at: null,
      conversion_error: null,
      converted_store_id: null,
      notes: payload.notes || (refCode ? `إحالة شريك: ${refCode}` : 'طلب انضمام مباشر من صفحة الهبوط'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 1. Direct Supabase Client (Pure Single Source of Truth)
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        let affiliateId: string | null = null;
        if (refCode) {
          try {
            const { data: aData } = await supabase
              .from('affiliates')
              .select('id')
              .ilike('referral_code', refCode)
              .limit(1)
              .maybeSingle();
            if (aData?.id) {
              affiliateId = aData.id;
            }
          } catch {}
        }

        const { data, error } = await supabase
          .from('merchant_leads')
          .insert([
            {
              store_name: cleanStore,
              manager_name: cleanManager,
              phone: cleanPhone,
              normalized_phone: normPhone,
              city: payload.city || null,
              business_type: payload.business_type || null,
              attribution_source: refCode ? 'REFERRAL' : 'DIRECT',
              referral_code: refCode,
              affiliate_id: affiliateId,
              status: 'NEW',
              notes: newLead.notes,
            },
          ])
          .select('id')
          .single();

        if (!error && data?.id) {
          newLead.id = data.id;
          newLead.partner_id = affiliateId;
          const current = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
          saveLocalData(STORAGE_KEYS.LOCAL_LEADS, [newLead, ...current.filter((l) => l.id !== newLead.id)]);
          invalidateLeadsCache();
          invalidatePartnersCache();
          LoyaltyEvents.emit({ type: 'LEAD_UPDATED', storeId: 'global' });
          LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
          return { success: true, lead_id: data.id };
        } else if (error) {
          console.warn('Supabase direct insert merchant_leads error details:', error);
        }
      } catch (dbErr) {
        console.warn('Supabase direct insert merchant_leads error:', dbErr);
      }
    }

    // 3. Local fallback persistence
    const current = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
    const existingIdx = current.findIndex((l) => normalizeP(l.phone) === normPhone && l.status !== 'CONVERTED');
    if (existingIdx !== -1) {
      current[existingIdx] = {
        ...current[existingIdx],
        store_name: cleanStore,
        manager_name: cleanManager,
        referral_code: refCode || current[existingIdx].referral_code,
        notes: payload.notes || current[existingIdx].notes,
        updated_at: new Date().toISOString(),
      };
      saveLocalData(STORAGE_KEYS.LOCAL_LEADS, current);
      return { success: true, lead_id: current[existingIdx].id };
    }

    saveLocalData(STORAGE_KEYS.LOCAL_LEADS, [newLead, ...current.filter((l) => l.id !== newLead.id)]);
    return { success: true, lead_id: newLead.id };
  },

  async updateLeadStatus(leadId: string, newStatus: LeadStatus, notes?: string): Promise<{ success: boolean; error?: string }> {
    const current = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
    const updated = current.map((l) => {
      if (l.id === leadId) {
        return {
          ...l,
          status: newStatus,
          notes: notes !== undefined ? notes : l.notes,
          updated_at: new Date().toISOString(),
        };
      }
      return l;
    });
    saveLocalData(STORAGE_KEYS.LOCAL_LEADS, updated);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('merchant_leads')
          .update({
            status: newStatus,
            notes: notes !== undefined ? notes : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId);
      } catch (err) {
        console.warn('Supabase updateLeadStatus error:', err);
      }
    }

    LoyaltyEvents.emit({ type: 'LEAD_UPDATED', storeId: 'global' });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });

    return { success: true };
  },

  async convertLeadToStore(leadId: string, storeId: string): Promise<{ success: boolean; error?: string }> {
    const current = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
    const updated = current.map((l) => {
      if (l.id === leadId) {
        return {
          ...l,
          status: 'CONVERTED' as LeadStatus,
          converted_store_id: storeId,
          updated_at: new Date().toISOString(),
        };
      }
      return l;
    });
    saveLocalData(STORAGE_KEYS.LOCAL_LEADS, updated);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('merchant_leads')
          .update({
            status: 'CONVERTED',
            converted_store_id: storeId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId);
      } catch (err) {
        console.warn('Supabase convertLeadToStore error:', err);
      }
    }

    // 💰 العمولات لا تُسجل إطلاقاً عند تأسيس أو تحويل المتجر، بل تُسجل حصراً عند سداد الاشتراك الفعلي للباقة
    LoyaltyEvents.emit({ type: 'LEAD_UPDATED', storeId: storeId || 'global' });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: storeId || 'global' });
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: storeId || 'global' });
    invalidateAllServiceCaches();

    return { success: true };
  },

  // ==============================================================================
  // 💰 دفتر حركات العمولات والمكافآت للشركاء (Affiliate Financial Ledger & Milestones)
  // ==============================================================================

  // دالة متوافقة خلفياً - لا تنشئ أي عمولات معلقة أو تخمينية
  async recordLeadConversionCommission(
    _leadId: string,
    _storeId: string,
    _basisAmount?: number
  ): Promise<{ success: boolean; commission_id?: string; amount?: number; rate?: number; error?: string }> {
    return { success: true };
  },

  // 💰 تسجيل وتحرير العمولة المكتسبة فور سداد التاجر للاشتراك الفعلي (Dual Commission Engine on Real Paid Subscriptions)
  async unlockPaidStoreCommission(
    storeId: string,
    paidAmount: number,
    commissionType?: 'STORE_ACQUISITION' | 'STORE_CONVERSION' | 'SUBSCRIPTION_RENEWAL' | 'SUBSCRIPTION_UPGRADE',
    invoiceId?: string,
    invoiceNumber?: string
  ): Promise<{ success: boolean; unlockedCommissionsCount: number }> {
    const now = new Date().toISOString();
    const supabase = getSupabaseClient();
    const partnerIdsToEvaluate = new Set<string>();

    const allPartners = getLocalData<PartnerAccount[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    let store = stores.find((s) => s.id === storeId || s.slug === storeId);
    const allLeads = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
    let lead = allLeads.find((l) => l.converted_store_id === storeId || l.store_name === store?.name);

    // 🌐 استعلام مباشر وقاطع من Supabase أولاً لضمان جلب المتجر والطلب والشريك بدقة
    if (supabase) {
      try {
        if (!store) {
          const { data: dbStore } = await supabase.from('stores').select('*').eq('id', storeId).maybeSingle();
          if (dbStore) store = dbStore;
        }
        if (!lead) {
          const storePhoneNorm = store ? normalizePhone(store.manager_contact || '') : '';
          const { data: dbLeads } = await supabase
            .from('merchant_leads')
            .select('*')
            .or(`converted_store_id.eq.${storeId}${store?.manager_contact ? `,phone.eq.${store.manager_contact}` : ''}${storePhoneNorm ? `,normalized_phone.eq.${storePhoneNorm}` : ''}`);
          if (dbLeads && dbLeads.length > 0) {
            lead = dbLeads.find((l: any) => l.converted_store_id === storeId) || dbLeads[0];
          }
        }
      } catch (dbErr) {
        console.warn('[unlockPaidStoreCommission] DB lookup error:', dbErr);
      }
    }

    // البحث عن الشريك عبر كود الإحالة أو المعرف المباشر أو معرف المسوق
    const leadRef = (lead?.referral_code || '').toLowerCase().trim();
    const leadAffId = lead?.affiliate_id;
    let partner = allPartners.find((p) => {
      const pRef = (p.affiliates?.referral_code || p.referral_code || '').toLowerCase().trim();
      const pSlug = (p.slug || '').toLowerCase().trim();
      return (
        (pRef && leadRef && pRef === leadRef) ||
        (pSlug && leadRef && pSlug === leadRef) ||
        p.id === leadAffId ||
        p.affiliate_id === leadAffId
      );
    });

    if (!partner && supabase && (leadAffId || leadRef)) {
      try {
        const { data: dbPa } = await supabase.from('partner_accounts').select('*');
        if (dbPa && dbPa.length > 0) {
          partner = dbPa.find((p: any) =>
            (leadAffId && (p.id === leadAffId || p.affiliate_id === leadAffId)) ||
            (leadRef && (p.slug?.toLowerCase() === leadRef || p.referral_code?.toLowerCase() === leadRef))
          );
        }
      } catch (paErr) {
        console.warn('Fallback partner lookup error:', paErr);
      }
    }

    if (!partner || partner.active === false) {
      return { success: true, unlockedCommissionsCount: 0 };
    }

    partnerIdsToEvaluate.add(partner.id);

    const isAcquisition = commissionType === 'STORE_ACQUISITION' || commissionType === 'STORE_CONVERSION' || !commissionType;
    const rate = isAcquisition
      ? (partner.acquisition_commission_rate ?? partner.commission_rate ?? 0.20)
      : (partner.recurring_commission_rate ?? 0.10);

    const basis = Number(paidAmount) || 0;
    if (basis <= 0) {
      return { success: true, unlockedCommissionsCount: 0 };
    }

    const commAmt = Math.round(basis * rate * 100) / 100;
    const commId = toUUID(invoiceId || undefined);
    const idempotencyKey = `paid_comm_${invoiceNumber || invoiceId || storeId}_${Date.now()}`;
    const qualifyingEventDesc = isAcquisition
      ? 'سداد اشتراك متجر جديد'
      : (commissionType === 'SUBSCRIPTION_UPGRADE' ? 'ترقية باقة المتجر' : 'تجديد اشتراك المتجر الدوري');

    const newComm = {
      id: commId,
      partner_account_id: partner.id,
      merchant_lead_id: lead?.id || null,
      store_id: storeId,
      commission_type: commissionType || 'STORE_ACQUISITION',
      basis_amount: basis,
      commission_rate: rate,
      commission_amount: commAmt,
      status: 'EARNED',
      qualifying_event: qualifyingEventDesc,
      idempotency_key: idempotencyKey,
      merchant_name: store?.name || lead?.store_name || 'متجر معتمد',
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      created_at: now,
      updated_at: now,
    };

    // حفظ محلي مع تنظيف أي سجلات قديمة غير مدفوعة
    const filteredComms = localComms.filter((c) => c.status !== 'PENDING');
    filteredComms.unshift(newComm);
    saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, filteredComms);

    if (supabase) {
      try {
        if (isAcquisition) {
          await supabase
            .from('partner_commissions')
            .delete()
            .eq('store_id', storeId)
            .eq('status', 'PENDING');
        }

        // إرسال الحقول المعرفة فقط في مخطط الجدول بالسيرفر منعاً لأخطاء PGRST204
        const dbCommPayload: Record<string, any> = {
          id: commId,
          partner_account_id: partner.id,
          merchant_lead_id: (lead?.id && isUUID(lead.id)) ? lead.id : null,
          store_id: (storeId && isUUID(storeId)) ? storeId : null,
          commission_type: commissionType || 'STORE_ACQUISITION',
          basis_amount: basis,
          commission_rate: rate,
          commission_amount: commAmt,
          status: 'EARNED',
          qualifying_event: qualifyingEventDesc,
          idempotency_key: idempotencyKey,
          created_at: now,
          updated_at: now,
        };

        await supabase
          .from('partner_commissions')
          .upsert([dbCommPayload], { onConflict: 'idempotency_key' });
      } catch (dbErr) {
        console.warn('Supabase unlockPaidStoreCommission warning:', dbErr);
      }
    }

    // تقييم مكافآت التارقت للأعضاء بناءً على المتاجر المدفوعة فقط
    for (const partnerId of Array.from(partnerIdsToEvaluate)) {
      await this.evaluatePartnerMilestones(partnerId);
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    invalidateAllServiceCaches();

    return { success: true, unlockedCommissionsCount: 1 };
  },

  // 🏆 تقييم واحتساب مكافآت التارقت للأعضاء بناءً على المتاجر المدفوعة فقط
  async evaluatePartnerMilestones(partnerId: string): Promise<void> {
    const allPartners = getLocalData<PartnerAccount[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const partner = allPartners.find((p: any) => p.id === partnerId || p.affiliate_id === partnerId || p.slug === partnerId);
    const resolvedPartnerId = partner?.id || partnerId;
    const resolvedAffiliateId = partner?.affiliate_id || partnerId;

    const defaultMilestones = [
      { id: 'rule-3', milestone: 3, bonus_amount: 100 },
      { id: 'rule-5', milestone: 5, bonus_amount: 250 },
      { id: 'rule-10', milestone: 10, bonus_amount: 500 },
      { id: 'rule-20', milestone: 20, bonus_amount: 1000 },
    ];

    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    const earnedOrPaidComms = localComms.filter(
      (c) =>
        (c.partner_account_id === resolvedPartnerId ||
         c.affiliate_id === resolvedPartnerId ||
         c.partner_account_id === resolvedAffiliateId ||
         c.affiliate_id === resolvedAffiliateId ||
         (partner && (c.partner_account_id === partner.id || c.affiliate_id === partner.affiliate_id))) &&
        (c.status === 'AVAILABLE' || c.status === 'EARNED' || c.status === 'PAID')
    );

    const paidStoreIds = new Set<string>();
    earnedOrPaidComms.forEach((c) => {
      if (c.store_id) paidStoreIds.add(c.store_id);
    });

    const paidCount = paidStoreIds.size;
    const existingAwards = getLocalData<any[]>(STORAGE_KEYS.LOCAL_BONUS_AWARDS, []);
    let newAwardAdded = false;

    for (const rule of defaultMilestones) {
      if (paidCount >= rule.milestone) {
        const awardKey = `bonus_${resolvedPartnerId}_${rule.milestone}`;
        const hasAward = existingAwards.some(
          (a) =>
            a.idempotency_key === awardKey ||
            ((a.partner_account_id === resolvedPartnerId || a.partner_account_id === resolvedAffiliateId) &&
              Number(a.milestone) === rule.milestone)
        );

        if (!hasAward) {
          const newAward = {
            id: `award-${Date.now()}-${rule.milestone}`,
            partner_account_id: resolvedPartnerId,
            bonus_rule_id: rule.id,
            milestone: rule.milestone,
            bonus_amount: rule.bonus_amount,
            status: 'ACHIEVED',
            idempotency_key: awardKey,
            awarded_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          };
          existingAwards.push(newAward);
          newAwardAdded = true;

          const supabase = getSupabaseClient();
          if (supabase) {
            try {
              await supabase.from('partner_bonus_awards').upsert([newAward], { onConflict: 'idempotency_key' });
            } catch {}
          }
        }
      }
    }

    if (newAwardAdded) {
      saveLocalData(STORAGE_KEYS.LOCAL_BONUS_AWARDS, existingAwards);
      LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    }
  },

  async getPartnerCommissions(partnerId: string): Promise<any[]> {
    const allPartners = getLocalData<PartnerAccount[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const partner = allPartners.find((p: any) => p.id === partnerId || p.affiliate_id === partnerId || p.slug === partnerId);
    const resolvedPartnerId = partner?.id || partnerId;
    const resolvedAffiliateId = partner?.affiliate_id || partnerId;

    const supabase = getSupabaseClient();

    // تنظيف أي سجلات قديمة غير مدفوعة (PENDING) محلياً
    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    const cleanLocal = local.filter((c) => c.status !== 'PENDING');
    if (cleanLocal.length !== local.length) {
      saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, cleanLocal);
    }

    const isMatch = (c: any) =>
      c.partner_account_id === resolvedPartnerId ||
      c.affiliate_id === resolvedPartnerId ||
      c.partner_account_id === resolvedAffiliateId ||
      c.affiliate_id === resolvedAffiliateId ||
      (partner && (c.partner_account_id === partner.id || c.affiliate_id === partner.affiliate_id));

    const reconcileComm = (c: any) => {
      return {
        ...c,
        merchant_name: c.merchant_leads?.store_name || c.merchant_name || 'متجر معتمد',
        status: c.status === 'PAID' ? 'PAID' : 'AVAILABLE',
      };
    };

    if (supabase) {
      try {
        // حذف أي عمولات معلقة من قاعدة البيانات تلقائياً
        Promise.resolve(supabase.from('partner_commissions').delete().eq('status', 'PENDING')).catch(() => {});

        const { data, error } = await supabase
          .from('partner_commissions')
          .select('*, merchant_leads(store_name)')
          .or(`partner_account_id.eq.${resolvedPartnerId},partner_account_id.eq.${resolvedAffiliateId}`)
          .neq('status', 'PENDING')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const reconciledList = data.filter((c) => c.status !== 'PENDING').map(reconcileComm);
          saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, reconciledList);
          return reconciledList;
        }
      } catch (e) {
        console.warn('Supabase getPartnerCommissions failed:', e);
      }
    }

    return cleanLocal.filter((c) => isMatch(c) && c.status !== 'PENDING').map(reconcileComm);
  },

  async getPartnerBonuses(partnerId: string, affiliateId?: string): Promise<{ milestones: any[]; paidCount: number }> {
    const allPartners = getLocalData<PartnerAccount[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const partner = allPartners.find((p: any) => p.id === partnerId || p.affiliate_id === partnerId || p.slug === partnerId);
    const resolvedPartnerId = partner?.id || partnerId;
    const resolvedAffiliateId = partner?.affiliate_id || affiliateId || partnerId;

    const supabase = getSupabaseClient();
    let rules = [
      { id: 'rule-3', milestone: 3, bonus_amount: 100 },
      { id: 'rule-5', milestone: 5, bonus_amount: 250 },
      { id: 'rule-10', milestone: 10, bonus_amount: 500 },
      { id: 'rule-20', milestone: 20, bonus_amount: 1000 },
    ];
    let awards: any[] = [];
    let paidCount = 0;

    if (supabase) {
      try {
        const [rulesRes, awardsRes] = await Promise.all([
          supabase.from('partner_bonus_rules').select('*').eq('active', true).order('milestone', { ascending: true }),
          supabase.from('partner_bonus_awards').select('*').or(`partner_account_id.eq.${resolvedPartnerId},partner_account_id.eq.${resolvedAffiliateId}`),
        ]);

        if (rulesRes.data && rulesRes.data.length > 0) rules = rulesRes.data;
        if (awardsRes.data) awards = awardsRes.data;

        const { data: commRows } = await supabase
          .from('partner_commissions')
          .select('store_id')
          .or(`partner_account_id.eq.${resolvedPartnerId},partner_account_id.eq.${resolvedAffiliateId}`)
          .in('status', ['AVAILABLE', 'EARNED', 'PAID']);

        if (commRows && Array.isArray(commRows)) {
          const uniquePaid = new Set(commRows.map((c) => c.store_id).filter(Boolean));
          paidCount = uniquePaid.size;
        }
      } catch (e) {
        console.warn('Supabase getPartnerBonuses query failed:', e);
      }
    }

    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    const isMatchingComm = (c: any) =>
      c.partner_account_id === resolvedPartnerId ||
      c.affiliate_id === resolvedPartnerId ||
      c.partner_account_id === resolvedAffiliateId ||
      c.affiliate_id === resolvedAffiliateId ||
      (partner && (c.partner_account_id === partner.id || c.affiliate_id === partner.affiliate_id));

    if (paidCount === 0) {
      const partnerComms = localComms.filter(
        (c) => isMatchingComm(c) && (c.status === 'AVAILABLE' || c.status === 'EARNED' || c.status === 'PAID')
      );
      const uniqueStores = new Set(partnerComms.map((c) => c.store_id).filter(Boolean));
      paidCount = uniqueStores.size;
    }

    let localAwards = getLocalData<any[]>(STORAGE_KEYS.LOCAL_BONUS_AWARDS, []);
    const partnerAwards = localAwards.filter(
      (a) =>
        a.partner_account_id === resolvedPartnerId ||
        a.partner_account_id === resolvedAffiliateId ||
        (partner && (a.partner_account_id === partner.id || a.partner_account_id === partner.affiliate_id))
    );

    // 🔄 Auto-Reconciliation: Check if any previous payout already settled bonuses
    const localPayouts = getLocalData<AffiliatePayoutRecord[]>(STORAGE_KEYS.LOCAL_AFFILIATE_PAYOUTS, []);
    const partnerPayouts = localPayouts.filter(
      (p) =>
        p.affiliate_id === resolvedPartnerId ||
        p.affiliate_id === resolvedAffiliateId ||
        (partner && (p.affiliate_id === partner.id || p.affiliate_id === partner.affiliate_id))
    );
    const totalPayoutsAmt = partnerPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalPaidCommsAmt = localComms
      .filter((c) => isMatchingComm(c) && c.status === 'PAID')
      .reduce((sum, c) => sum + (Number(c.commission_amount) || 0), 0);

    let awardsUpdated = false;
    const combinedAwards = [...awards, ...partnerAwards.filter((la) => !awards.some((a) => a.idempotency_key === la.idempotency_key))];

    // If total payout exceeds paid commissions, milestone bonuses were disbursed
    let cumulativeBonusBudget = Math.max(0, Math.round((totalPayoutsAmt - totalPaidCommsAmt) * 100) / 100);

    const awardMap = new Map();
    combinedAwards.forEach((a) => {
      if (a.bonus_rule_id) awardMap.set(a.bonus_rule_id, a);
      if (a.milestone) {
        awardMap.set(a.milestone, a);
        awardMap.set(Number(a.milestone), a);
        awardMap.set(`rule-${a.milestone}`, a);
      }
    });

    const milestones = rules.map((r) => {
      let award = awardMap.get(r.id) || awardMap.get(r.milestone) || awardMap.get(Number(r.milestone)) || awardMap.get(`rule-${r.milestone}`);
      const isAchievedByCount = paidCount >= r.milestone;

      // Auto-reconcile to PAID if historical payouts covered it
      if (isAchievedByCount && (!award || award.status !== 'PAID') && cumulativeBonusBudget >= Number(r.bonus_amount)) {
        cumulativeBonusBudget -= Number(r.bonus_amount);
        const awardKey = `bonus_${resolvedPartnerId}_${r.milestone}`;
        award = {
          ...(award || {}),
          id: award?.id || `award-${Date.now()}-${r.milestone}`,
          partner_account_id: resolvedPartnerId,
          bonus_rule_id: r.id,
          milestone: r.milestone,
          bonus_amount: Number(r.bonus_amount),
          status: 'PAID',
          idempotency_key: awardKey,
          paid_at: award?.paid_at || new Date().toISOString(),
          awarded_at: award?.awarded_at || new Date().toISOString(),
        };
        awardMap.set(r.id, award);
        awardMap.set(r.milestone, award);

        // Update local storage awards
        const idx = localAwards.findIndex(
          (la) => la.idempotency_key === awardKey || ((la.partner_account_id === resolvedPartnerId || la.partner_account_id === resolvedAffiliateId) && Number(la.milestone) === r.milestone)
        );
        if (idx !== -1) {
          localAwards[idx] = award;
        } else {
          localAwards.push(award);
        }
        awardsUpdated = true;
      }

      let status: 'LOCKED' | 'IN_PROGRESS' | 'ACHIEVED' | 'AWARDED' = 'LOCKED';
      const isPaid = award?.status === 'PAID' || award?.status === 'AWARDED';

      if (isPaid) {
        status = 'AWARDED'; // Awarded & Paid out
      } else if (award?.status === 'ACHIEVED' || isAchievedByCount) {
        status = 'ACHIEVED'; // Achieved & Unpaid
      } else if (paidCount > 0) {
        status = 'IN_PROGRESS';
      }

      return {
        id: r.id,
        milestone: r.milestone,
        bonus_amount: Number(r.bonus_amount),
        status,
        is_paid: isPaid,
        current_progress: paidCount,
        required_merchants: r.milestone,
        awarded_at: award?.awarded_at || null,
        paid_at: award?.paid_at || null,
      };
    });

    if (awardsUpdated) {
      saveLocalData(STORAGE_KEYS.LOCAL_BONUS_AWARDS, localAwards);
    }

    return { milestones, paidCount };
  },

  async getPartnerFinancialSummary(partnerId: string, affiliateId?: string): Promise<{
    pending_commissions: number;
    earned_commissions: number;
    paid_commissions: number;
    bonuses_earned: number;
    bonuses_paid: number;
    total_payable: number;
    currency: string;
  }> {
    const commissions = await this.getPartnerCommissions(partnerId);
    const bonusesData = await this.getPartnerBonuses(partnerId, affiliateId);

    let earned_commissions = 0;
    let paid_commissions = 0;

    commissions.forEach((c) => {
      const amt = Number(c.commission_amount) || 0;
      if (c.status === 'PAID') {
        paid_commissions += amt;
      } else if (c.status === 'EARNED' || c.status === 'AVAILABLE') {
        earned_commissions += amt;
      }
    });

    let bonuses_earned = 0;
    let bonuses_paid = 0;

    bonusesData.milestones.forEach((m) => {
      if (m.status === 'ACHIEVED' && !m.is_paid) {
        bonuses_earned += Number(m.bonus_amount) || 0;
      } else if (m.is_paid || m.status === 'AWARDED') {
        bonuses_paid += Number(m.bonus_amount) || 0;
      }
    });

    const total_payable = Math.round((earned_commissions + bonuses_earned) * 100) / 100;
    const total_paid = Math.round((paid_commissions + bonuses_paid) * 100) / 100;

    return {
      pending_commissions: 0,
      earned_commissions: Math.round(earned_commissions * 100) / 100,
      paid_commissions: total_paid,
      bonuses_earned: Math.round(bonuses_earned * 100) / 100,
      bonuses_paid: Math.round(bonuses_paid * 100) / 100,
      total_payable,
      currency: 'SAR',
    };
  },

  // 💸 تنفيذ صرف وتسوية مستحقات الشريك والعمولات والمكافآت وتوثيقها في دفتر الأستاذ وسجل الحوالات
  async settlePartnerCommissions(
    partnerId: string,
    reference?: string,
    options?: {
      iban?: string;
      bankName?: string;
      adminUser?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; total_amount?: number; payout?: AffiliatePayoutRecord; ledgerEntry?: FinancialLedgerEntry; error?: string }> {
    const now = new Date();
    const allPartners = getLocalData<PartnerAccount[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const partner = allPartners.find((p: any) => p.id === partnerId || p.affiliate_id === partnerId || p.slug === partnerId);
    const resolvedPartnerId = partner?.id || partnerId;
    const resolvedAffiliateId = partner?.affiliate_id || partnerId;
    const partnerName = partner?.display_name || partner?.affiliates?.name || 'الشريك المعتمد';

    const isMatchingComm = (c: any) => {
      const pId = c.partner_account_id || c.affiliate_id;
      return (
        (pId === resolvedPartnerId || pId === resolvedAffiliateId || (partner && (pId === partner.id || pId === partner.affiliate_id))) &&
        (c.status === 'AVAILABLE' || c.status === 'EARNED')
      );
    };

    const isMatchingBonus = (b: any) => {
      const pId = b.partner_account_id;
      return (
        (pId === resolvedPartnerId || pId === resolvedAffiliateId || (partner && (pId === partner.id || pId === partner.affiliate_id))) &&
        (b.status === 'ACHIEVED' || b.status === 'AWARDED')
      );
    };

    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    let localBonuses = getLocalData<any[]>(STORAGE_KEYS.LOCAL_BONUS_AWARDS, []);

    // 🌟 ضمان توثيق جميع مكافآت التارقت المحققة للشريك قبل الصرف
    const bonusesData = await this.getPartnerBonuses(resolvedPartnerId, resolvedAffiliateId);
    bonusesData.milestones.forEach((m) => {
      if (m.status === 'ACHIEVED' && !m.is_paid) {
        const awardKey = `bonus_${resolvedPartnerId}_${m.milestone}`;
        const existingIdx = localBonuses.findIndex(
          (b) =>
            b.idempotency_key === awardKey ||
            ((b.partner_account_id === resolvedPartnerId || b.partner_account_id === resolvedAffiliateId) &&
              Number(b.milestone) === m.milestone)
        );
        if (existingIdx === -1) {
          localBonuses.push({
            id: `award-${Date.now()}-${m.milestone}`,
            partner_account_id: resolvedPartnerId,
            bonus_rule_id: m.id,
            milestone: m.milestone,
            bonus_amount: m.bonus_amount,
            status: 'ACHIEVED',
            idempotency_key: awardKey,
            awarded_at: now.toISOString(),
            created_at: now.toISOString(),
          });
        }
      }
    });

    let settledCommsAmt = 0;
    const commIds: string[] = [];

    const payoutNumber = `PAY-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const payoutRef = reference?.trim() || `PAYOUT-${now.toISOString().substring(0, 10)}-${partner?.slug || resolvedPartnerId}`;

    const updatedComms = localComms.map((c) => {
      if (isMatchingComm(c)) {
        const amt = Number(c.commission_amount) || 0;
        settledCommsAmt += amt;
        commIds.push(c.id);
        return {
          ...c,
          status: 'PAID',
          payout_reference: payoutRef,
          payout_number: payoutNumber,
          paid_at: now.toISOString(),
          updated_at: now.toISOString(),
        };
      }
      return c;
    });

    let settledBonusesAmt = 0;
    const updatedBonuses = localBonuses.map((b) => {
      if (isMatchingBonus(b)) {
        const amt = Number(b.bonus_amount) || 0;
        settledBonusesAmt += amt;
        return {
          ...b,
          status: 'PAID',
          payout_reference: payoutRef,
          payout_number: payoutNumber,
          paid_at: now.toISOString(),
          updated_at: now.toISOString(),
        };
      }
      return b;
    });

    const totalSettledAmt = Math.round((settledCommsAmt + settledBonusesAmt) * 100) / 100;

    if (totalSettledAmt <= 0) {
      return { success: false, error: 'لا توجد أي عمولات أو مكافآت مستحقة للصرف حالياً لهذا الشريك' };
    }

    // 1. حفظ الحركات المحدثة محلياً فورياً
    saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, updatedComms);
    saveLocalData(STORAGE_KEYS.LOCAL_BONUS_AWARDS, updatedBonuses);

    // 2. مزامنة Supabase إن وجدت
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        if (commIds.length > 0) {
          await supabase
            .from('partner_commissions')
            .update({ status: 'PAID', updated_at: now.toISOString() })
            .in('id', commIds);
        }
        await supabase
          .from('partner_bonus_awards')
          .update({ status: 'PAID' })
          .or(`partner_account_id.eq.${resolvedPartnerId},partner_account_id.eq.${resolvedAffiliateId}`)
          .in('status', ['ACHIEVED', 'AWARDED']);
      } catch (dbErr) {
        console.warn('Supabase settlePartnerCommissions sync warning:', dbErr);
      }
    }

    // 3. تسجيل قيد الصرف في السجل المالي العام (خصم من إيرادات وسيولة المنصة في دفتر الأستاذ)
    const ledgerEntry = await this.recordFinancialLedgerEntry({
      transaction_id: `tx_payout_${payoutNumber}_${Date.now()}`,
      affiliate_id: resolvedPartnerId,
      affiliate_name: partnerName,
      transaction_type: 'PAYOUT',
      gross_amount: -totalSettledAmt,
      vat_amount: 0.00,
      gateway_fee: 0.00,
      affiliate_commission: -totalSettledAmt,
      net_platform_amount: -totalSettledAmt,
      status: 'SETTLED',
      created_by: options?.adminUser || 'Super Admin (المالك)',
      metadata: {
        payout_number: payoutNumber,
        transfer_reference: payoutRef,
        iban: options?.iban || (partner as any)?.iban || 'حوالة بنكية مباشرة',
        bank_name: options?.bankName || 'تحويل بنكي فوري',
        commissions_count: commIds.length,
        bonuses_count: localBonuses.filter(isMatchingBonus).length,
        admin_notes: options?.notes || `صرف وتسوية عمولات الشريك [${partnerName}] بموجب الحوالة ${payoutRef}`,
        settled_at: now.toISOString(),
      },
    });

    // 4. تسجيل وتوثيق عملية الصرف في سجل الحوالات (Affiliate Payouts Audit)
    const payoutRecord: AffiliatePayoutRecord = {
      id: 'payout-' + Date.now(),
      payout_number: payoutNumber,
      affiliate_id: resolvedPartnerId,
      partner_name: partnerName,
      iban: options?.iban || (partner as any)?.iban || 'حوالة بنكية مباشرة',
      bank_name: options?.bankName || 'تحويل بنكي فوري',
      transfer_reference: payoutRef,
      amount: totalSettledAmt,
      commissions_count: commIds.length,
      commission_ids: commIds,
      status: 'COMPLETED',
      disbursed_by: options?.adminUser || 'Super Admin (المالك)',
      disbursed_at: now.toISOString(),
      ledger_entry_id: ledgerEntry.id,
      notes: options?.notes || `صرف وتسوية عمولات الشريك [${partnerName}] بموجب الحوالة ${payoutRef}`,
    };

    const localPayouts = getLocalData<AffiliatePayoutRecord[]>(STORAGE_KEYS.LOCAL_AFFILIATE_PAYOUTS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_AFFILIATE_PAYOUTS, [payoutRecord, ...localPayouts.filter((p) => p.id !== payoutRecord.id)]);

    invalidateAllServiceCaches();
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });

    return {
      success: true,
      total_amount: totalSettledAmt,
      payout: payoutRecord,
      ledgerEntry,
    };
  },

  async updatePartnerCommissionRate(
    partnerId: string,
    newRate: number,
    newRecurringRate?: number
  ): Promise<{ success: boolean; partner?: any; error?: string }> {
    const cleanRate = Math.max(0.01, Math.min(1.0, Number(newRate) || 0.20));
    const cleanRecurringRate = typeof newRecurringRate === 'number' ? Math.max(0.01, Math.min(1.0, newRecurringRate)) : undefined;

    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const idx = local.findIndex((p) => p.id === partnerId || p.affiliate_id === partnerId);
    if (idx === -1) {
      return { success: false, error: 'حساب الشريك غير موجود' };
    }

    const currentPartner = local[idx];
    const recRate = cleanRecurringRate !== undefined ? cleanRecurringRate : (currentPartner.recurring_commission_rate ?? 0.10);

    const updated = {
      ...currentPartner,
      commission_rate: cleanRate,
      acquisition_commission_rate: cleanRate,
      recurring_commission_rate: recRate,
      affiliates: currentPartner.affiliates
        ? {
            ...currentPartner.affiliates,
            commission_rate: cleanRate,
            acquisition_commission_rate: cleanRate,
            recurring_commission_rate: recRate,
          }
        : {
            commission_rate: cleanRate,
            acquisition_commission_rate: cleanRate,
            recurring_commission_rate: recRate,
          },
    };
    local[idx] = updated;
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, local);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const updateObj: Record<string, any> = {
          commission_rate: cleanRate,
        };
        if (cleanRecurringRate !== undefined) {
          updateObj.recurring_commission_rate = cleanRecurringRate;
        }
        await supabase.from('partner_accounts').update(updateObj).eq('id', partnerId);
        if (updated.affiliate_id) {
          await supabase.from('affiliates').update({ commission_rate: cleanRate }).eq('id', updated.affiliate_id);
        }
      } catch (e) {
        console.warn('Supabase updatePartnerCommissionRate error:', e);
      }
    }

    invalidatePartnersCache();
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    return { success: true, partner: updated };
  },

  async adminUpdatePartnerPin(partnerId: string, newPin: string): Promise<{ success: boolean; error?: string; partner?: any }> {
    const cleanNew = (newPin || '').trim();
    if (!cleanNew || cleanNew.length < 4) {
      return { success: false, error: 'الرمز السري الجديد يجب أن يتكون من 4 أرقام على الأقل' };
    }

    const allPartners = await this.getAllPartners(true);
    const targetNormId = normalizePhone(partnerId);
    const existingPartner = allPartners.find(
      (p: any) =>
        p.id === partnerId ||
        p.affiliate_id === partnerId ||
        p.slug === partnerId ||
        p.referral_code === partnerId ||
        (targetNormId && normalizePhone(p.affiliates?.phone || p.phone) === targetNormId)
    );
    if (!existingPartner) {
      return { success: false, error: 'لم يتم العثور على حساب الشريك' };
    }

    // Save in persistent PIN overrides
    const pinOverrides = getLocalData<Record<string, string>>(STORAGE_KEYS.LOCAL_PARTNER_PINS, {});
    const pPhone = normalizePhone(existingPartner.affiliates?.phone || existingPartner.phone);
    if (existingPartner.id) pinOverrides[existingPartner.id] = cleanNew;
    if (existingPartner.affiliate_id) pinOverrides[existingPartner.affiliate_id] = cleanNew;
    if (existingPartner.referral_code) pinOverrides[existingPartner.referral_code] = cleanNew;
    if (existingPartner.slug) pinOverrides[existingPartner.slug] = cleanNew;
    if (pPhone) pinOverrides[pPhone] = cleanNew;
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNER_PINS, pinOverrides);

    const updatedPartner = {
      ...existingPartner,
      pin_code: cleanNew,
      affiliates: existingPartner.affiliates ? {
        ...existingPartner.affiliates,
        notes: `PIN: ${cleanNew}`,
      } : {
        id: existingPartner.affiliate_id || existingPartner.id,
        name: existingPartner.display_name,
        phone: existingPartner.phone,
        referral_code: existingPartner.referral_code,
        notes: `PIN: ${cleanNew}`,
      },
    };

    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const updatedLocal = local.map((p: any) =>
      p.id === existingPartner.id || p.affiliate_id === existingPartner.affiliate_id ? updatedPartner : p
    );
    if (!updatedLocal.some((p: any) => p.id === existingPartner.id || p.affiliate_id === existingPartner.affiliate_id)) {
      updatedLocal.push(updatedPartner);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, updatedLocal);

    invalidatePartnersCache();

    // Update active partner session if currently logged in
    try {
      const activePartnerSession = localStorage.getItem('radar_partner_session');
      if (activePartnerSession) {
        const parsed = JSON.parse(activePartnerSession);
        if (parsed.id === existingPartner.id || parsed.affiliate_id === existingPartner.affiliate_id) {
          localStorage.setItem('radar_partner_session', JSON.stringify(updatedPartner));
        }
      }
      const authRaw = localStorage.getItem('radar_unified_auth_user');
      if (authRaw) {
        const authParsed = JSON.parse(authRaw);
        if (authParsed.role === 'partner' && (authParsed.id === existingPartner.id || authParsed.partnerId === existingPartner.id)) {
          authParsed.metadata = updatedPartner;
          localStorage.setItem('radar_unified_auth_user', JSON.stringify(authParsed));
        }
      }
    } catch {}

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        if (existingPartner.id) {
          await supabase
            .from('partner_accounts')
            .update({ pin_code: cleanNew })
            .eq('id', existingPartner.id);
        }
        if (existingPartner.affiliate_id) {
          await supabase
            .from('affiliates')
            .update({ notes: `PIN: ${cleanNew}` })
            .eq('id', existingPartner.affiliate_id);
        }
      } catch (e) {
        console.warn('Supabase adminUpdatePartnerPin error:', e);
      }
    }

    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    return { success: true, partner: updatedPartner };
  },

  async rollbackLeadConversion(leadId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    const current = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
    const updated = current.map((l) => {
      if (l.id === leadId) {
        return {
          ...l,
          status: 'APPROVED' as LeadStatus,
          conversion_started_at: null,
          conversion_error: reason || 'Rollback by admin',
          updated_at: new Date().toISOString(),
        };
      }
      return l;
    });
    saveLocalData(STORAGE_KEYS.LOCAL_LEADS, updated);
    invalidateLeadsCache();

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('merchant_leads')
          .update({
            status: 'APPROVED',
            conversion_started_at: null,
            conversion_error: reason || 'Rollback by admin',
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId);
      } catch (err) {
        console.warn('Supabase rollbackLeadConversion error:', err);
      }
    }

    return { success: true };
  },

  // ==============================================================================
  // 💳 إدارة خطط الاشتراك الديناميكية (Dynamic Subscription Plans)
  // ==============================================================================
  getAllSubscriptionPlansSync(): BillingPlan[] {
    const DEFAULT_PLANS: BillingPlan[] = [
      {
        id: 'plan-basic',
        code: 'BASIC',
        name: 'الباقة الأساسية',
        description: 'برنامج الولاء الذكي المتكامل ونقاط المكافآت مع كاشير رقمي وبطاقة ولاء PWA',
        amount: 690,
        currency: 'ر.س',
        duration_months: 3,
        billing_interval: 'MONTHLY',
        trial_days: 7,
        features: [
          'بطاقات ولاء رقمية (PWA) بدون تحميل تطبيق',
          'كاشير سريع لمسح الباركود وتجميع النقاط',
          'نظام الرتب والمستويات الذكي (Tiers)',
          'سجل العمليات والفواتير الفورية',
        ],
        active: true,
      },
      {
        id: 'plan-advanced',
        code: 'ADVANCED',
        name: 'الباقة المتقدمة',
        description: 'برنامج الولاء المتقدم مع المستويات Tiers والامتيازات المخصصة وحملات الواتساب واستعادة العملاء',
        amount: 1190,
        currency: 'ر.س',
        duration_months: 6,
        billing_interval: 'MONTHLY',
        trial_days: 7,
        features: [
          'كافة مميزات الباقة الأساسية',
          'حملات إعادة التنشيط الذكية واستعادة العملاء المنقطعين',
          'إدارة الامتيازات والعروض الترويجية الحصرية',
          'دعم فني أولوية عبر الواتساب',
        ],
        active: true,
      },
      {
        id: 'plan-pro',
        code: 'PRO',
        name: 'الباقة الاحترافية',
        description: 'الحل الشامل لشبكات المتاجر والفروع مع تحليلات متقدمة، كوبونات ديناميكية وربط مخصص',
        amount: 1890,
        currency: 'ر.س',
        duration_months: 12,
        billing_interval: 'YEARLY',
        trial_days: 7,
        features: [
          'كافة مميزات الباقة المتقدمة',
          'دعم الفروع المتعددة والموظفين غير المحدود',
          'إدارة الكوبونات والهدايا التسويقية المتقدمة',
          'تخصيص كامل للهوية البصرية والدومين الخاص',
        ],
        active: true,
      },
    ];
    const local = getLocalData<BillingPlan[]>(STORAGE_KEYS.LOCAL_BILLING_PLANS, DEFAULT_PLANS);
    return local && local.length > 0 ? local : DEFAULT_PLANS;
  },

  async getAllSubscriptionPlans(): Promise<BillingPlan[]> {
    // 1. استعلام Supabase المباشر كمصدر وحيد للحقيقة (Single Source of Truth)
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('billing_plans')
          .select(await planCols(supabase))
          .order('amount', { ascending: true });

        if (!error && data && data.length > 0) {
          const formatted: BillingPlan[] = data.map((p: any) => {
            const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
            const features = Array.isArray(p.features)
              ? p.features
              : Array.isArray(meta.features)
              ? meta.features
              : [];
            const durationMonths = p.duration_months
              ? Number(p.duration_months)
              : meta.duration_months
              ? Number(meta.duration_months)
              : (p.billing_interval === 'YEARLY' ? 12 : 1);

            return {
              id: p.id,
              code: p.code || p.id,
              name: p.name,
              description: p.description || '',
              amount: Number(p.amount) || 0,
              currency: p.currency || 'ر.س',
              duration_months: durationMonths,
              billing_interval: p.billing_interval || (durationMonths === 12 ? 'YEARLY' : 'MONTHLY'),
              trial_days: Number(p.trial_days) ?? 7,
              features,
              active: p.active !== false,
              created_at: p.created_at,
            };
          });

          // تحديث الذاكرة المحلية لتطابق قاعدة البيانات بدقة ومنع أي تعارض
          saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, formatted);
          return formatted;
        }
      } catch (e) {
        console.warn('Supabase getAllSubscriptionPlans error:', e);
      }
    }

    return this.getAllSubscriptionPlansSync();
  },

  async addSubscriptionPlan(planData: Omit<BillingPlan, 'id'>): Promise<BillingPlan> {
    const durationMonths = planData.duration_months && Number(planData.duration_months) > 0
      ? Number(planData.duration_months)
      : (planData.billing_interval === 'YEARLY' ? 12 : 1);

    const cleanCode = (planData.code || `PLAN_${Date.now()}`).toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 48);

    const supabase = getSupabaseClient();
    let newPlan: BillingPlan | null = null;

    if (supabase) {
      try {
        const insertPayload: any = {
          code: cleanCode,
          name: planData.name.trim(),
          description: planData.description || '',
          amount: Number(planData.amount) || 0,
          currency: planData.currency || 'SAR',
          billing_interval: durationMonths === 12 ? 'YEARLY' : 'MONTHLY',
          trial_days: Number(planData.trial_days) ?? 7,
          active: planData.active !== false,
          metadata: {
            features: planData.features || [],
            duration_months: durationMonths,
          },
        };

        const { data, error } = await supabase
          .from('billing_plans')
          .insert([insertPayload])
          .select()
          .maybeSingle();

        if (!error && data) {
          newPlan = {
            id: data.id,
            code: data.code,
            name: data.name,
            description: data.description || '',
            amount: Number(data.amount) || 0,
            currency: data.currency || 'ر.س',
            duration_months: durationMonths,
            billing_interval: data.billing_interval,
            trial_days: Number(data.trial_days) ?? 7,
            features: planData.features || [],
            active: data.active !== false,
            created_at: data.created_at,
          };
        }
      } catch (err) {
        console.warn('Supabase addSubscriptionPlan error:', err);
      }
    }

    if (!newPlan) {
      newPlan = {
        ...planData,
        id: 'plan-' + Date.now(),
        code: cleanCode,
        duration_months: durationMonths,
        billing_interval: durationMonths === 12 ? 'YEARLY' : 'MONTHLY',
        currency: planData.currency || 'ر.س',
        features: planData.features || [],
        active: planData.active !== false,
        created_at: new Date().toISOString(),
      };
    }

    const local = this.getAllSubscriptionPlansSync();
    const updated = [...local.filter((p) => (p.code || p.id) !== cleanCode && p.id !== newPlan!.id), newPlan];
    saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, updated);

    // مزامنة API كإجراء إضافي
    fetch('/api/billing/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPlan),
    }).catch(() => {});

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return newPlan;
  },

  async updateSubscriptionPlan(planId: string, updates: Partial<BillingPlan>): Promise<BillingPlan> {
    const local = this.getAllSubscriptionPlansSync();
    const existing = local.find((p) => p.id === planId || p.code === planId);

    const durationMonths = updates.duration_months !== undefined
      ? (Number(updates.duration_months) > 0 ? Number(updates.duration_months) : 1)
      : (existing?.duration_months || (updates.billing_interval === 'YEARLY' ? 12 : 1));

    const isUuid = planId.includes('-') && planId.length > 30;
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const updatePayload: any = {
          updated_at: new Date().toISOString(),
        };
        if (updates.name !== undefined) updatePayload.name = updates.name.trim();
        if (updates.description !== undefined) updatePayload.description = updates.description;
        if (updates.amount !== undefined) updatePayload.amount = Number(updates.amount);
        if (updates.currency !== undefined) updatePayload.currency = updates.currency;
        if (updates.trial_days !== undefined) updatePayload.trial_days = Number(updates.trial_days);
        if (updates.active !== undefined) updatePayload.active = Boolean(updates.active);
        if (updates.duration_months !== undefined || updates.billing_interval !== undefined) {
          updatePayload.billing_interval = durationMonths === 12 ? 'YEARLY' : 'MONTHLY';
        }
        if (updates.features !== undefined || updates.duration_months !== undefined) {
          updatePayload.metadata = {
            features: updates.features || existing?.features || [],
            duration_months: durationMonths,
          };
        }

        let query = supabase.from('billing_plans').update(updatePayload);
        if (isUuid) {
          query = query.eq('id', planId);
        } else {
          query = query.eq('code', planId);
        }
        await query;
      } catch (err) {
        console.warn('Supabase updateSubscriptionPlan error:', err);
      }
    }

    const updatedPlan: BillingPlan = {
      ...(existing || {} as any),
      ...updates,
      id: existing?.id || planId,
      code: existing?.code || planId,
      duration_months: durationMonths,
      billing_interval: durationMonths === 12 ? 'YEARLY' : 'MONTHLY',
    };

    const updatedList = local.map((p) => (p.id === planId || p.code === planId ? updatedPlan : p));
    saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, updatedList);

    fetch('/api/billing/plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updatedPlan, id: planId }),
    }).catch(() => {});

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return updatedPlan;
  },

  async toggleSubscriptionPlanActive(planId: string): Promise<boolean> {
    const local = this.getAllSubscriptionPlansSync();
    const existing = local.find((p) => p.id === planId || p.code === planId);
    const nextActive = existing ? !existing.active : true;

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const isUuid = planId.includes('-') && planId.length > 30;
        let query = supabase.from('billing_plans').update({ active: nextActive, updated_at: new Date().toISOString() });
        if (isUuid) query = query.eq('id', planId);
        else query = query.eq('code', planId);
        await query;
      } catch (err) {
        console.warn('Supabase toggleSubscriptionPlanActive error:', err);
      }
    }

    if (existing) {
      existing.active = nextActive;
      saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, local);
    }

    fetch('/api/billing/plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: planId, active: nextActive }),
    }).catch(() => {});

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return nextActive;
  },

  async deleteSubscriptionPlan(planId: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const isUuid = planId.includes('-') && planId.length > 30;
        let query = supabase.from('billing_plans').delete();
        if (isUuid) query = query.eq('id', planId);
        else query = query.eq('code', planId);
        await query;
      } catch (err) {
        console.warn('Supabase deleteSubscriptionPlan error:', err);
      }
    }

    const local = this.getAllSubscriptionPlansSync();
    const filtered = local.filter((p) => p.id !== planId && p.code !== planId);
    saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, filtered);

    fetch(`/api/billing/plans?id=${encodeURIComponent(planId)}`, {
      method: 'DELETE',
    }).catch(() => {});

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return true;
  },

  // ترقية باقة المتجر واختيار خطة جديدة مع الحساب التناسبي (Prorated Upgrade)
  async upgradeStoreSubscription(
    storeId: string,
    plan: BillingPlan,
    paymentMethod: string = 'mada'
  ): Promise<{ success: boolean; store: Store; invoice: StoreInvoice; prorated: ProratedUpgradeCalculation }> {
    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const store = stores.find((s) => s.id === storeId || s.slug === storeId) || INITIAL_STORE;
    const allPlans = await this.getAllSubscriptionPlans();
    const currentPlan = allPlans.find((p) => p.id === store.subscription_plan_id || p.code === store.plan_code) || null;

    const prorated = this.calculateProratedUpgrade(store, currentPlan, plan);

    const paymentResult = await this.processSubscriptionPayment({
      storeId,
      invoiceType: 'upgrade',
      amount: prorated.netUpgradeAmount,
      paymentMethod,
      gateway: 'sandbox',
      planId: plan.id || plan.code,
    });

    return {
      success: paymentResult.success,
      store: paymentResult.store,
      invoice: paymentResult.invoice,
      prorated,
    };
  },
};



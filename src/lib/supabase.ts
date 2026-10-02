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

const ENV_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://zagpvflyizbmzsbmhnts.supabase.co';
const ENV_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bx1NGkxLxilvNA3RgcioVQ_t8zlk72H';

export function getSupabaseCredentials() {
  const url = localStorage.getItem(STORAGE_KEYS.URL) || ENV_URL || '';
  const anonKey = localStorage.getItem(STORAGE_KEYS.ANON_KEY) || ENV_ANON_KEY || '';
  return { url, anonKey, isConfigured: Boolean(url && anonKey) };
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

function getLocalData<T>(key: string, defaultVal: T): T {
  try {
    const data = localStorage.getItem(key);
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
    localStorage.setItem(key, JSON.stringify(data));
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

  const stageInfo = resolveUnifiedStage(s);
  const isPaid = stageInfo.isPaidActive;

  return {
    ...s,
    setup_fee_paid: isPaid ? true : Boolean(s.setup_fee_paid),
    status: isPaid ? (s.status === 'suspended' ? 'suspended' : 'active') : (s.status || stageInfo.label),
    subscription_status: isPaid ? (s.subscription_status === 'suspended' ? 'suspended' : 'active') : (s.subscription_status || 'trial'),
    lifecycle_stage: stageInfo.label,
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

  const stageInfo = resolveUnifiedStage(l);

  return {
    id: String(l.id || `lead-${Date.now()}`),
    store_name: String(l.store_name || l.storeName || 'متجر جديد'),
    manager_name: String(l.manager_name || l.managerName || l.owner_name || l.ownerName || 'مدير المتجر'),
    phone: String(l.phone || ''),
    city: l.city || null,
    business_type: l.business_type || l.businessType || null,
    attribution_source: l.attribution_source === 'REFERRAL' ? 'REFERRAL' : 'DIRECT',
    referral_code: l.referral_code || l.referralCode || null,
    status: (l.status as LeadStatus) || 'NEW',
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
const scanDebounceCache = new Map<string, { timestamp: number; promise: Promise<any> }>();

export const LoyaltyService = {
  // 1. جلب جميع المتاجر (من Supabase مباشرة مع كاش محلي سريع)
  async getAllStores(): Promise<Store[]> {
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('stores')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          const validStores = data.filter((s: any) => Boolean(s && s.id)).map(normalizeStore) as Store[];
          saveLocalData(STORAGE_KEYS.LOCAL_STORES, validStores);
          return validStores;
        }
      } catch (e) {
        console.warn('Supabase getAllStores failed', e);
      }
    }

    // في حال عدم توفر اتصال بـ Supabase نستخدم الكاش المحلي
    const localStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, []);
    if (localStores && Array.isArray(localStores)) {
      const valid = localStores.filter((s) => Boolean(s && s.id)).map(normalizeStore);
      return valid;
    }
    return [];
  },

  // 1.1 جلب ملخص المتاجر المجمّع للـ Super Admin في طلب خادم واحد (Single Request Aggregation)
  async getSuperAdminStoresSummary(): Promise<{
    stores: Store[];
    analytics: Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }>;
  }> {
    const supabase = getSupabaseClient();

    if (supabase) {
      // 1. محاولة استخدام الـ RPC المجمّع على مستوى الخادم أولاً (Server-Side Postgres RPC)
      try {
        const { data, error } = await supabase.rpc('get_super_admin_stores_summary');
        if (!error && data && data.success && Array.isArray(data.stores)) {
          const validStores = (data.stores as any[])
            .filter((s) => Boolean(s && s.id))
            .map(normalizeStore) as Store[];
          saveLocalData(STORAGE_KEYS.LOCAL_STORES, validStores);

          const rpcAnalytics: Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }> =
            data.analytics || {};

          const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, INITIAL_CUSTOMERS);
          const localLogs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, INITIAL_AUDIT_LOGS);
          const localStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);

          const finalAnalytics: Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }> = {};
          for (const s of validStores) {
            const rpcStats = rpcAnalytics[s.id] || { customerCount: 0, totalSales: 0, totalPoints: 0, staffCount: 0 };
            const sLocalCust = localCustomers.filter((c) => c.store_id === s.id).length;
            const sLocalStaff = localStaff.filter((st) => st.store_id === s.id).length;
            const sLocalLogs = localLogs.filter((l) => l.store_id === s.id);
            const sLocalSales = sLocalLogs.reduce((sum, l) => sum + (Number(l.purchase_amount) || 0), 0);
            const sLocalPoints = sLocalLogs.reduce((sum, l) => sum + (l.points_changed > 0 ? l.points_changed : 0), 0);

            finalAnalytics[s.id] = {
              customerCount: Math.max(Number(rpcStats.customerCount) || 0, sLocalCust),
              totalSales: Math.max(Number(rpcStats.totalSales) || 0, sLocalSales),
              totalPoints: Math.max(Number(rpcStats.totalPoints) || 0, sLocalPoints),
              staffCount: Math.max(Number(rpcStats.staffCount) || 0, sLocalStaff),
            };
          }

          return { stores: validStores, analytics: finalAnalytics };
        }
      } catch (_rpcErr) {
        // Fall through to single consolidated PostgREST embedded query
      }

      // 2. استعلام PostgREST مدمج ومجمّع في طلب شبكي واحد دون تكرار (Single HTTP Request - Zero N+1)
      try {
        const { data, error } = await supabase
          .from('stores')
          .select('*, store_customers(count), store_staff(count), audit_logs(purchase_amount, points_changed)')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const validStores = (data as any[])
            .filter((s) => Boolean(s && s.id))
            .map(normalizeStore) as Store[];
          saveLocalData(STORAGE_KEYS.LOCAL_STORES, validStores);

          const localCustomers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, INITIAL_CUSTOMERS);
          const localLogs = getLocalData<AuditLog[]>(STORAGE_KEYS.LOCAL_LOGS, INITIAL_AUDIT_LOGS);
          const localStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);

          const analytics: Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }> = {};
          for (const item of data as any[]) {
            const storeId = item.id;
            const dbCustCount = Number(item.store_customers?.[0]?.count) || 0;
            const dbStaffCount = Number(item.store_staff?.[0]?.count) || 0;
            const dbSales = (item.audit_logs || []).reduce((sum: number, l: any) => sum + (Number(l.purchase_amount) || 0), 0);
            const dbPoints = (item.audit_logs || []).reduce(
              (sum: number, l: any) => sum + (Number(l.points_changed) > 0 ? Number(l.points_changed) : 0),
              0
            );

            const sLocalCust = localCustomers.filter((c) => c.store_id === storeId).length;
            const sLocalStaff = localStaff.filter((st) => st.store_id === storeId).length;
            const sLocalLogs = localLogs.filter((l) => l.store_id === storeId);
            const sLocalSales = sLocalLogs.reduce((sum, l) => sum + (Number(l.purchase_amount) || 0), 0);
            const sLocalPoints = sLocalLogs.reduce((sum, l) => sum + (l.points_changed > 0 ? l.points_changed : 0), 0);

            analytics[storeId] = {
              customerCount: Math.max(dbCustCount, sLocalCust),
              totalSales: Math.max(dbSales, sLocalSales),
              totalPoints: Math.max(dbPoints, sLocalPoints),
              staffCount: Math.max(dbStaffCount, sLocalStaff),
            };
          }

          return { stores: validStores, analytics };
        }
      } catch (fallbackErr) {
        console.warn('Single consolidated stores query failed, using local fallback', fallbackErr);
      }
    }

    // 3. التخزين المحلي السريع في حالة انقطاع الاتصال (Instant Local Fallback)
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

    return { stores: validStores, analytics };
  },

  // 2. البحث والتحقق من المتجر (سواء برقم الـ UUID أو الاسم اللطيف Slug) مع كاش ذاكرة وتخزين فائق السرعة (0ms)
  async resolveStore(storeIdOrSlug?: string | null, forceFresh: boolean = false): Promise<Store | null> {
    if (!storeIdOrSlug) return await this.getStore();
    const clean = String(storeIdOrSlug).trim();
    const cleanLower = clean.toLowerCase();

    const localStores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, []);

    // 1. فحص كاش الذاكرة اللحظي (إذا لم يكن هناك إجبار لتخطي الكاش)
    if (!forceFresh) {
      const cached = storeResolutionCache.get(cleanLower);
      if (cached && Date.now() - cached.timestamp < 300000 && cached.store) {
        return cached.store;
      }

      // 2. فحص كاش التخزين المحلي فورياً
      const localMatch = localStores.find(
        (s) =>
          s &&
          (s.id === clean ||
            s.slug?.toLowerCase() === cleanLower ||
            s.custom_domain?.toLowerCase() === cleanLower ||
            s.slug?.toLowerCase().replace(/[-_]/g, '') === cleanLower.replace(/[-_]/g, ''))
      );
      if (localMatch) {
        const normalizedLocal = normalizeStore(localMatch);
        storeResolutionCache.set(cleanLower, { store: normalizedLocal, timestamp: Date.now() });
        if (normalizedLocal.slug) storeResolutionCache.set(normalizedLocal.slug.toLowerCase(), { store: normalizedLocal, timestamp: Date.now() });
        if (normalizedLocal.id) storeResolutionCache.set(normalizedLocal.id.toLowerCase(), { store: normalizedLocal, timestamp: Date.now() });
        return normalizedLocal;
      }
    }

    // 3. استعلام Supabase مباشر ومفهرس سريع (Fast Indexed Query)
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        let storeQuery = supabase.from('stores').select('*');
        if (isUUID(clean)) {
          storeQuery = storeQuery.eq('id', clean);
        } else {
          storeQuery = storeQuery.eq('slug', cleanLower);
        }

        let { data, error } = await storeQuery.maybeSingle();

        // بحث بديل بالاسم أو الدومين المخصص إن لم يتطابق الـ slug
        if (!data && !isUUID(clean)) {
          const fallbackRes = await supabase
            .from('stores')
            .select('*')
            .or(`name.ilike.${clean},custom_domain.ilike.${clean}`)
            .limit(1)
            .maybeSingle();
          if (fallbackRes.data) data = fallbackRes.data;
        }

        if (!error && data && data.id) {
          const resolved = normalizeStore(data) as Store;
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
    return INITIAL_STORES[0] || null;
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
        ];
        for (const tbl of childTables) {
          await supabase.from(tbl).delete().neq('id', '00000000-0000-0000-0000-000000000000');
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
    saveLocalData(STORAGE_KEYS.LOCAL_INVOICES, []);

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'all' });
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
        const trialEndIso = new Date(Date.now() + 7 * 86400000).toISOString();

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
                subscription_plan: 'trial',
                setup_fee_paid: false,
                trial_start_date: nowIso,
                trial_end_date: trialEndIso,
                subscription_start_date: nowIso,
                subscription_end_date: trialEndIso,
                renewal_amount: 195,
              },
            ])
            .select()
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

          if (isUUID(createdStore.id)) {
            try {
              await supabase
                .from('stores')
                .update({
                  subscription_status: 'trial',
                  status: 'trial',
                  setup_fee_paid: false,
                  subscription_active: true,
                  trial_start_date: createdStore.trial_start_date,
                  trial_end_date: createdStore.trial_end_date,
                  subscription_end_date: createdStore.trial_end_date,
                })
                .eq('id', createdStore.id);
            } catch (syncErr) {
              console.warn('Sync store trial status update warning:', syncErr);
            }
          }
        }
      } catch (e) {
        console.warn('Supabase createStoreConcierge exception', e);
      }
    }

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
      trial_end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
      subscription_start_date: new Date().toISOString(),
      subscription_end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
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

  // 5. تفعيل / تعطيل اشتراك المتجر (Kill Switch)
  async toggleStoreSubscription(storeId: string, currentStatus: boolean): Promise<boolean> {
    const newActive = !currentStatus;
    const now = Date.now();
    const newStatus: StoreSubscriptionStatus = newActive ? 'active' : 'suspended';

    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const idx = stores.findIndex((s) => s.id === storeId || s.slug === storeId);
    let targetStore: Store = idx !== -1 ? stores[idx] : { ...INITIAL_STORE, id: storeId };

    targetStore.subscription_active = newActive;
    targetStore.status = newStatus;
    targetStore.subscription_status = newStatus;
    if (newActive) {
      const currentEnd = targetStore.subscription_end_date
        ? new Date(targetStore.subscription_end_date).getTime()
        : 0;
      if (currentEnd <= now) {
        targetStore.subscription_end_date = new Date(now + 30 * 86400000).toISOString();
      }
    }
    if (idx !== -1) {
      stores[idx] = targetStore;
    } else {
      stores.push(targetStore);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_STORES, stores);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const updatePayload: any = {
          subscription_active: newActive,
          status: newStatus,
          subscription_status: newStatus,
        };
        if (newActive && targetStore.subscription_end_date) {
          updatePayload.subscription_end_date = targetStore.subscription_end_date;
        }

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
        const query = supabase.from('stores').update(updates);
        const res = isUUID(currentStore.id)
          ? await query.eq('id', currentStore.id).select().maybeSingle()
          : await query.eq('slug', currentStore.slug).select().maybeSingle();

        if (!res.error && res.data) {
          updatedSupabaseStore = res.data as Store;
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

    // مزامنة بيانات مدير المتجر في جدول الموظفين (إذا تم تعديل الاسم أو رقم الجوال)
    if (updates.manager_name || updates.manager_contact) {
      const staffList = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);
      const adminStaffIdx = staffList.findIndex(
        (st) => (st.store_id === merged.id || st.store_id === storeId) && st.role === 'admin'
      );
      if (adminStaffIdx !== -1) {
        if (updates.manager_name) staffList[adminStaffIdx].name = updates.manager_name;
        if (updates.manager_contact) staffList[adminStaffIdx].phone = updates.manager_contact;
        saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staffList);

        if (supabase) {
          try {
            await supabase
              .from('store_staff')
              .update({
                name: updates.manager_name || staffList[adminStaffIdx].name,
                phone: updates.manager_contact || staffList[adminStaffIdx].phone,
              })
              .eq('id', staffList[adminStaffIdx].id);
          } catch (e) {
            console.warn('Supabase sync staff manager contact failed', e);
          }
        }
      }
    }

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
          .select('*')
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
          .select('*')
          .eq('store_id', storeId)
          .order('created_at', { ascending: true });
        if (!error && data) return data as StoreStaff[];
      } catch (e) {
        console.warn('Supabase getStoreStaff failed', e);
      }
    }
    const rawStaff = getLocalData<StoreStaff[]>(STORAGE_KEYS.LOCAL_STAFF, INITIAL_STAFF);
    const mergedStaff = rawStaff.map((s) => {
      if (
        (s.id === 'staff-02' || s.id === 'staff-demo-02' || s.role === 'admin') &&
        (s.store_id.includes('demo') || s.store_id === INITIAL_STORES[0].id || s.store_id === INITIAL_STORES[1].id)
      ) {
        return { ...s, phone: '0577371780' };
      }
      return s;
    });
    return mergedStaff.filter((s) => s.store_id === storeId || (storeId === 'demo-hub' && s.store_id.includes('demo')));
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
    if (supabase) {
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
    const index = staffList.findIndex((s) => s.id === staffId);
    let finalStaff: StoreStaff;
    if (index !== -1) {
      staffList[index] = { ...staffList[index], ...(updatedStaff || updates) };
      finalStaff = staffList[index];
      saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staffList);
    } else if (updatedStaff) {
      finalStaff = updatedStaff;
      staffList.push(updatedStaff);
      saveLocalData(STORAGE_KEYS.LOCAL_STAFF, staffList);
    } else {
      throw new Error('الموظف غير موجود');
    }

    // Sync active staff session in localStorage if logged in
    try {
      const cashierSession = this.getStaffSession(finalStaff.store_id, 'cashier');
      if (cashierSession && cashierSession.id === finalStaff.id) {
        this.saveStaffSession(finalStaff.store_id, finalStaff);
      }
      const adminSession = this.getStaffSession(finalStaff.store_id, 'admin');
      if (adminSession && adminSession.id === finalStaff.id) {
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

  // 7.1 البحث عن موظف أو مدير برقم الجوال للتحقق الآمن والدخول (Strictly Scoped to Store)
  async findStaffByPhone(
    storeId: string,
    phone: string,
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

    // 0.1 مطابقة رقم جوال مدير المتجر الحالي مباشرة
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

    // 0.2 فحص INITIAL_STAFF المباشر للمتجر المستهدف فقط
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

    // 0.3 فحص INITIAL_STORES للمتجر المستهدف فقط
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

    const supabase = getSupabaseClient();

    // 1. فحص جدول الموظفين في Supabase للمتجر المستهدف حصراً
    if (supabase) {
      try {
        let staffQuery = supabase
          .from('store_staff')
          .select('*')
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
            return {
              ...matchedStaff,
              matchedStore: currentStore || undefined,
            } as StoreStaff & { matchedStore?: Store };
          }
        }
      } catch (e) {
        console.warn('Supabase findStaffByPhone staff query failed', e);
      }

      // 2. فحص مدير المتجر في جدول المتاجر في Supabase للمتجر الحالي حصراً
      try {
        let storeQuery = supabase.from('stores').select('*');
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
              pin_code: normStore.admin_pin || '9999',
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

    // 4. فحص التخزين المحلي لمدير المتجر المستهدف حصراً
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
          .select('*')
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
          .select('*, tiers(tier_name)')
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
          .insert([privilegeData])
          .select('*, tiers(tier_name)')
          .single();
        if (!error && data) {
          result = { ...data, tier_name: data.tiers?.tier_name } as Privilege;
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
          .update(updates)
          .eq('id', privilegeId)
          .select('*, tiers(tier_name)')
          .single();
        if (!error && data) {
          const updated = { ...data, tier_name: data.tiers?.tier_name } as Privilege;
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
        let query = supabase
          .from('customer_coupons')
          .select('*')
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
          .select('*')
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
            .select('*')
            .eq('id', customerId)
            .eq('store_id', resolvedStoreId)
            .maybeSingle(),
          supabase
            .from('privileges')
            .select('*')
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
            .select()
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
          .select();

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
            .select()
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
        const { data, error } = await supabase
          .from('store_customers')
          .select('*')
          .eq('store_id', resolvedId)
          .or(`phone.eq.${cleanPhone},phone.eq.${normInput},phone.eq.0${normInput},phone.eq.+966${normInput},phone.eq.966${normInput}`)
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
            is_active: data.is_active !== undefined ? data.is_active : true,
            visits_count: data.visits_count || 1,
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
          .select('*')
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
          .select('*')
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
          .select()
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
          customers.unshift(createdCust);
          saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);
        } else {
          console.warn('Supabase registerCustomer insert fallback:', error);
          createdCust = {
            ...dbPayload,
            id: 'cust-' + Date.now(),
            is_active: true,
            visits_count: 1,
          };
          const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
          customers.unshift(createdCust);
          saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);
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
        customers.unshift(createdCust);
        saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);
      }
    } else {
      createdCust = {
        ...dbPayload,
        id: 'cust-' + Date.now(),
        is_active: true,
        visits_count: 1,
      };
      const customers = getLocalData<Customer[]>(STORAGE_KEYS.LOCAL_CUSTOMERS, []);
      customers.unshift(createdCust);
      saveLocalData(STORAGE_KEYS.LOCAL_CUSTOMERS, customers);
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
            .select()
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
          .select('*')
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
          .select('*')
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
          .select('*')
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

  // جلب كافة الفواتير لجميع المتاجر (Super Admin Financial Log)
  async getAllInvoices(): Promise<Record<string, StoreInvoice[]>> {
    const localInvoices = getLocalData<Record<string, StoreInvoice[]>>(
      STORAGE_KEYS.LOCAL_INVOICES,
      INITIAL_INVOICES
    );
    return localInvoices || {};
  },

  // جلب فواتير المتجر
  async getStoreInvoices(storeId: string): Promise<StoreInvoice[]> {
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

    // 🌟 Absolute Marketer Commission Base: Calculated strictly against the FULL Gross Total Amount (e.g. 520 SAR = 104 SAR fixed)
    const cleanCommRate = Math.max(0, Math.min(1.0, Number(commissionRate) || 0.20));
    const affiliateCommission = Math.round((gross * cleanCommRate) * 100) / 100;

    // 💰 Net Platform Revenue: Clean absorption of gateway fees without artificial negative glitching
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

  // 🧮 حساب الترقية التناسبية للباقات (Prorated Mid-Term Upgrade Engine)
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

    if (store.setup_fee_paid && currentPlan && remainingDays > 0) {
      const planMonths = currentPlan.duration_months ?? (currentPlan.billing_interval === 'YEARLY' ? 12 : 1);
      const totalDays = Math.max(1, planMonths * 30);
      dailyRateCurrent = currentPlan.amount / totalDays;
      unusedCredit = Math.round(remainingDays * dailyRateCurrent * 100) / 100;
      unusedCredit = Math.min(unusedCredit, currentPlan.amount, newPlan.amount);
    }

    const newPlanAmount = newPlan.amount;
    const netUpgradeAmount = Math.max(0, Math.round((newPlanAmount - unusedCredit) * 100) / 100);

    return {
      currentPlan,
      newPlan,
      remainingDays,
      dailyRateCurrent: Math.round(dailyRateCurrent * 100) / 100,
      unusedCredit,
      newPlanAmount,
      netUpgradeAmount,
      hasProrationDiscount: unusedCredit > 0,
    };
  },

  // جلب السجل المالي العام غير القابل للتعديل (Master Financial Ledger)
  async getFinancialLedger(filters?: {
    type?: string;
    storeId?: string;
    affiliateId?: string;
  }): Promise<FinancialLedgerEntry[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        let query = supabase
          .from('financial_ledger')
          .select('*')
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

        const { data, error } = await query;
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
          return formatted;
        }
      } catch (e) {
        console.warn('Supabase getFinancialLedger fallback to local:', e);
      }
    }

    const localLedger = getLocalData<FinancialLedgerEntry[]>(
      STORAGE_KEYS.LOCAL_FINANCIAL_LEDGER,
      INITIAL_FINANCIAL_LEDGER
    );
    let filtered = [...localLedger];
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
    return newRecord;
  },

  // معالجة الدفع والاشتراك مع تسجيل القيد المالي الدقيق والتحقق من التكرار (Idempotency)
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

    // 1. فحص التكرار الحتمي (Idempotency Check)
    const existingLedger = getLocalData<FinancialLedgerEntry[]>(
      STORAGE_KEYS.LOCAL_FINANCIAL_LEDGER,
      INITIAL_FINANCIAL_LEDGER
    );
    const duplicateEntry = existingLedger.find(
      (l) => l.payment_id === gatewayPaymentId && l.transaction_type === 'PAYMENT'
    );
    const existingInvoices = getLocalData<Record<string, StoreInvoice[]>>(
      STORAGE_KEYS.LOCAL_INVOICES,
      INITIAL_INVOICES
    );
    const storeInvoicesList = existingInvoices[payload.storeId] || [];
    const duplicateInvoice = storeInvoicesList.find((i) => i.gateway_payment_id === gatewayPaymentId);

    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const storeIdx = stores.findIndex((s) => s.id === payload.storeId);
    let currentStore = storeIdx !== -1 ? stores[storeIdx] : INITIAL_STORE;

    if (duplicateEntry && duplicateInvoice) {
      console.warn('[Idempotency] Payment already processed:', gatewayPaymentId);
      return {
        success: true,
        invoice: duplicateInvoice,
        store: currentStore,
        ledgerEntry: duplicateEntry,
      };
    }

    const supabase = getSupabaseClient();
    let updatedStore: Store | null = null;
    let createdInvoice: StoreInvoice | null = null;

    // استخراج الخطة لمعرفة مدة الاشتراك بالأشهر (duration_months)
    const allBillingPlans = getLocalData<BillingPlan[]>(STORAGE_KEYS.LOCAL_BILLING_PLANS, []);
    const targetPlan =
      (payload.planId ? allBillingPlans.find((p) => p.id === payload.planId || p.code === payload.planId) : null) ||
      allBillingPlans.find((p) => p.id === currentStore.subscription_plan_id || p.code === currentStore.plan_code) ||
      null;

    const planMonths = targetPlan?.duration_months ?? (targetPlan?.billing_interval === 'YEARLY' ? 12 : 1);
    const durationDays = Math.max(1, planMonths * 30);
    const durationMs = durationDays * 86400000;

    const now = new Date();
    const invoiceNum = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    let computedPlanName = targetPlan?.name || currentStore.subscription_plan || (payload.invoiceType === 'setup' ? 'باقة تأسيس المتجر' : 'تجديد الاشتراك');

    // 2. البحث عن الشريك/المسوق وحساب العمولة المزدوجة (Acquisition vs. Recurring)
    let partnerAccountId: string | null = null;
    let partnerName: string | null = null;
    let commissionRate = 0.20;
    const isFirstAcquisition = payload.invoiceType === 'setup' || !currentStore.setup_fee_paid;
    let commissionType: 'STORE_ACQUISITION' | 'STORE_CONVERSION' | 'SUBSCRIPTION_RENEWAL' | 'SUBSCRIPTION_UPGRADE' =
      isFirstAcquisition
        ? 'STORE_ACQUISITION'
        : payload.invoiceType === 'upgrade'
        ? 'SUBSCRIPTION_UPGRADE'
        : 'SUBSCRIPTION_RENEWAL';

    const allPartners = getLocalData<PartnerAccount[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const allLeads = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
    const matchingLead = allLeads.find((l) => l.converted_store_id === payload.storeId || l.store_name === currentStore.name);
    if (matchingLead && matchingLead.referral_code) {
      const partner = allPartners.find((p) => p.referral_code === matchingLead.referral_code);
      if (partner) {
        partnerAccountId = partner.id;
        partnerName = partner.display_name;

        // تطبيق النسبة بحسب نوع العملية (استحواذ لأول مرة vs تجديد متكرر)
        if (isFirstAcquisition) {
          commissionRate = partner.acquisition_commission_rate ?? partner.commission_rate ?? 0.20;
          commissionType = 'STORE_ACQUISITION';
        } else {
          commissionRate = partner.recurring_commission_rate ?? (partner.commission_rate ? partner.commission_rate / 2 : 0.10);
          commissionType = payload.invoiceType === 'upgrade' ? 'SUBSCRIPTION_UPGRADE' : 'SUBSCRIPTION_RENEWAL';
        }
      }
    }

    // 3. حساب التفكيك المالي الدقيق والضريبة
    const breakdown = this.calculateBreakdown(payload.amount, paymentMethod, commissionRate);

    // 4. تحديث المتجر في قاعدة البيانات والتأكد من نجاح الـ Commit
    if (supabase) {
      try {
        if (isUUID(payload.storeId)) {
          const nextEndIso = new Date(Date.now() + durationMs).toISOString();
          const updatePayload: Record<string, any> = {
            setup_fee_paid: true,
            status: 'active',
            subscription_status: 'active',
            subscription_active: true,
            lifecycle_stage: 'مشترك مدفوع',
            subscription_plan_id: targetPlan?.id || currentStore.subscription_plan_id || null,
            plan_code: targetPlan?.code || currentStore.plan_code || null,
            subscription_plan: targetPlan?.name || currentStore.subscription_plan || null,
            renewal_amount: targetPlan?.amount || payload.amount || currentStore.renewal_amount || 195,
            subscription_start_date: now.toISOString(),
            subscription_end_date: nextEndIso,
            updated_at: now.toISOString(),
          };

          const { data: updatedData, error: updateError } = await supabase
            .from('stores')
            .update(updatePayload)
            .eq('id', payload.storeId)
            .select()
            .single();

          if (updateError) {
            console.error('[processSubscriptionPayment] DB commit failed:', updateError);
            throw new Error(`فشل تحديث حالة المتجر في قاعدة البيانات: ${updateError.message}`);
          }

          if (updatedData) {
            updatedStore = normalizeStore(updatedData) as Store;
          }
        }
      } catch (e: any) {
        console.error('Supabase processSubscriptionPayment DB commit failed', e);
        throw e;
      }
    }

    if (updatedStore) {
      currentStore = updatedStore;
    } else if (payload.invoiceType === 'setup') {
      const nextEnd = new Date(Date.now() + durationMs).toISOString();
      currentStore = {
        ...currentStore,
        status: 'active',
        subscription_status: 'active',
        subscription_active: true,
        setup_fee_paid: true,
        lifecycle_stage: 'مشترك مدفوع',
        subscription_start_date: now.toISOString(),
        subscription_end_date: nextEnd,
        renewal_amount: targetPlan?.amount || currentStore.renewal_amount || 195,
        subscription_plan_id: targetPlan?.id || currentStore.subscription_plan_id,
        plan_code: targetPlan?.code || currentStore.plan_code,
        subscription_plan: targetPlan?.name || currentStore.subscription_plan,
        updated_at: now.toISOString(),
      };
    } else if (payload.invoiceType === 'renewal' || payload.invoiceType === 'upgrade') {
      const currentEndMs = currentStore.subscription_end_date
        ? new Date(currentStore.subscription_end_date).getTime()
        : Date.now();
      const baseMs = Math.max(Date.now(), currentEndMs);
      const nextEnd = new Date(baseMs + durationMs).toISOString();

      currentStore = {
        ...currentStore,
        status: 'active',
        subscription_status: 'active',
        subscription_active: true,
        setup_fee_paid: true,
        lifecycle_stage: 'مشترك مدفوع',
        subscription_end_date: nextEnd,
        renewal_amount: targetPlan?.amount || payload.amount || currentStore.renewal_amount || 195,
        subscription_plan_id: targetPlan?.id || currentStore.subscription_plan_id,
        plan_code: targetPlan?.code || currentStore.plan_code,
        subscription_plan: targetPlan?.name || currentStore.subscription_plan,
        updated_at: now.toISOString(),
      };
    } else if (payload.invoiceType === 'extra_cashier') {
      await this.purchaseExtraCashier(payload.storeId);
    }

    if (storeIdx !== -1) {
      stores[storeIdx] = currentStore;
    } else {
      stores.unshift(currentStore);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_STORES, stores);

    // تحديث فوري لكاش الذاكرة والتخزين المؤقت بالسجل المؤكد
    storeResolutionCache.set(currentStore.id.toLowerCase(), { store: currentStore, timestamp: Date.now() });
    if (currentStore.slug) {
      storeResolutionCache.set(currentStore.slug.toLowerCase(), { store: currentStore, timestamp: Date.now() });
    }

    // 5. حفظ الفاتورة
    createdInvoice = {
      id: 'inv-' + Date.now(),
      store_id: payload.storeId,
      invoice_number: invoiceNum,
      invoice_type: payload.invoiceType,
      amount: payload.amount,
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

    const allInvoices = getLocalData<Record<string, StoreInvoice[]>>(
      STORAGE_KEYS.LOCAL_INVOICES,
      INITIAL_INVOICES
    );
    if (!allInvoices[payload.storeId]) {
      allInvoices[payload.storeId] = [];
    }
    allInvoices[payload.storeId].unshift(createdInvoice);
    saveLocalData(STORAGE_KEYS.LOCAL_INVOICES, allInvoices);

    // 6. قيد السجل المالي العام الدائم (Master Financial Ledger Entry)
    const ledgerEntry = await this.recordFinancialLedgerEntry({
      transaction_id: `tx_${gatewayPaymentId}`,
      invoice_id: createdInvoice.id,
      store_id: payload.storeId,
      store_name: currentStore.name,
      affiliate_id: partnerAccountId,
      affiliate_name: partnerName,
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
        plan_id: targetPlan?.id,
        tax_rate: breakdown.vatRate,
        base_amount: breakdown.netBeforeVat,
        invoice_number: invoiceNum,
        commission_type: commissionType,
        notes: `عملية دفع ناجحة عبر ${paymentMethod} لـ ${computedPlanName} (${commissionType})`,
      },
    });

    // 7. تحويل الـ Lead وتحديث عمولات المسوق إلى AVAILABLE / EARNED
    try {
      if (matchingLead && matchingLead.status !== 'CONVERTED') {
        await this.convertLeadToStore(matchingLead.id, payload.storeId);
      }
    } catch (leadConvErr) {
      console.warn('Non-blocking lead conversion on payment notice:', leadConvErr);
    }

    try {
      if (payload.invoiceType === 'setup' || payload.invoiceType === 'renewal' || payload.invoiceType === 'upgrade') {
        await this.unlockPaidStoreCommission(
          payload.storeId,
          breakdown.netBeforeVat,
          commissionType,
          createdInvoice.id,
          invoiceNum
        );
      }
    } catch (commUnlockErr) {
      console.warn('Non-blocking commission unlock on payment error:', commUnlockErr);
    }

    // إطلاق الأحداث اللحظية لمزامنة كافة الشاشات واللوحات فوراً
    LoyaltyEvents.emit({ type: 'PAYMENT_COMPLETED', storeId: payload.storeId });
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: payload.storeId });
    LoyaltyEvents.emit({ type: 'SUBSCRIPTION_UPDATED', storeId: payload.storeId });
    LoyaltyEvents.emit({ type: 'LEAD_UPDATED', storeId: payload.storeId });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: payload.storeId });
    LoyaltyEvents.emit({ type: 'PAYMENT_COMPLETED', storeId: payload.storeId });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: payload.storeId });
    LoyaltyEvents.emit({ type: 'LEAD_UPDATED', storeId: payload.storeId });

    return {
      success: true,
      invoice: createdInvoice,
      store: updatedStore || currentStore,
      ledgerEntry,
    };
  },

  // 8. معالجة الإشعار الدائن والاسترداد المالي المتوافق مع ZATCA (Refund & Credit Note Engine)
  async processZatcaRefundAndCreditNote(payload: {
    invoiceId: string;
    storeId: string;
    refundAmount?: number;
    reason: string;
    adminUser: string;
    notes?: string;
  }): Promise<{ success: boolean; creditNote: CreditNote; ledgerEntry: FinancialLedgerEntry; error?: string }> {
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

    const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
    const store = stores.find((s) => s.id === foundStoreId) || INITIAL_STORE;

    const refundGross = payload.refundAmount ? Number(payload.refundAmount) : targetInvoice.amount;
    const netRefund = Math.round((refundGross / 1.15) * 100) / 100;
    const vatRefund = Math.round((refundGross - netRefund) * 100) / 100;

    // فحص عمولة المسوق لاستردادها (Clawback)
    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    let clawbackAmount = 0;
    let affiliateIdForNote: string | null = null;

    const updatedComms = localComms.map((c) => {
      if (c.store_id === foundStoreId && (c.status === 'EARNED' || c.status === 'AVAILABLE' || c.status === 'PENDING')) {
        clawbackAmount += Number(c.commission_amount) || 0;
        affiliateIdForNote = c.partner_account_id;
        return {
          ...c,
          status: 'REVERSED',
          updated_at: new Date().toISOString(),
          notes: `تم استرداد العمولة بناءً على استرداد الفاتورة ${targetInvoice?.invoice_number}`,
        };
      }
      return c;
    });
    saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, updatedComms);

    const now = new Date();
    const cnNumber = `CN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // 1. تسجيل قيد الاسترداد في السجل المالي العام (Reverse Ledger Entry)
    const netPlatformReversal = -(refundGross - vatRefund - clawbackAmount);
    const ledgerEntry = await this.recordFinancialLedgerEntry({
      transaction_id: `tx_cn_${cnNumber}`,
      invoice_id: targetInvoice.id,
      store_id: foundStoreId,
      store_name: store.name,
      affiliate_id: affiliateIdForNote,
      payment_id: targetInvoice.gateway_payment_id || null,
      transaction_type: 'REFUND',
      gross_amount: -refundGross,
      vat_amount: -vatRefund,
      gateway_fee: 0.00,
      affiliate_commission: -clawbackAmount,
      net_platform_amount: Math.round(netPlatformReversal * 100) / 100,
      status: 'SETTLED',
      refund_of: targetInvoice.invoice_number,
      created_by: payload.adminUser || 'SUPER_ADMIN',
      metadata: {
        credit_note_number: cnNumber,
        original_invoice_number: targetInvoice.invoice_number,
        reason: payload.reason,
        admin_notes: payload.notes || '',
        tax_rate: 0.15,
        clawback_applied: clawbackAmount > 0,
      },
    });

    // 2. حفظ الإشعار الدائن (Credit Note)
    const creditNote: CreditNote = {
      id: 'cn-' + Date.now(),
      credit_note_number: cnNumber,
      original_invoice_id: targetInvoice.id,
      original_invoice_number: targetInvoice.invoice_number,
      store_id: foundStoreId,
      store_name: store.name,
      gross_refund_amount: refundGross,
      vat_refund_amount: vatRefund,
      net_refund_amount: netRefund,
      clawback_commission: clawbackAmount,
      affiliate_id: affiliateIdForNote,
      reason: payload.reason,
      status: 'ISSUED',
      issued_by: payload.adminUser || 'SUPER_ADMIN',
      issued_at: now.toISOString(),
      ledger_entry_id: ledgerEntry.id,
      notes: payload.notes || '',
    };

    const localCreditNotes = getLocalData<CreditNote[]>(STORAGE_KEYS.LOCAL_CREDIT_NOTES, []);
    saveLocalData(STORAGE_KEYS.LOCAL_CREDIT_NOTES, [creditNote, ...localCreditNotes]);

    // 3. تحديث حالة الفاتورة والمتجر
    targetInvoice.status = 'refunded';
    saveLocalData(STORAGE_KEYS.LOCAL_INVOICES, allInvoices);

    const storeIdx = stores.findIndex((s) => s.id === foundStoreId);
    if (storeIdx !== -1) {
      stores[storeIdx] = {
        ...stores[storeIdx],
        setup_fee_paid: false,
        subscription_status: 'trial',
        status: 'trial',
        updated_at: now.toISOString(),
      };
      saveLocalData(STORAGE_KEYS.LOCAL_STORES, stores);
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: foundStoreId });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });

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
  }): Promise<{ success: boolean; payout: AffiliatePayoutRecord; ledgerEntry: FinancialLedgerEntry; error?: string }> {
    if (!payload.iban || !payload.transferReference) {
      return { success: false, error: 'الآيبان ورقم مرجع الحوالة البنكية إلزاميان للصرف' } as any;
    }

    // جلب العمولات المستحقة للصرف (EARNED / AVAILABLE)
    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    const eligibleComms = localComms.filter(
      (c) => (c.partner_account_id === payload.affiliateId || c.affiliate_id === payload.affiliateId) &&
             (c.status === 'EARNED' || c.status === 'AVAILABLE')
    );

    const payoutAmount = eligibleComms.reduce((sum, c) => sum + (Number(c.commission_amount) || 0), 0);
    if (payoutAmount <= 0) {
      return { success: false, error: 'لا توجد عمولات معتمدة ومؤهلة للصرف لهذا الشريك' } as any;
    }

    const now = new Date();
    const payoutNumber = `PAY-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // 1. تحديث حالات العمولات إلى PAID
    const commIds = eligibleComms.map((c) => c.id);
    const updatedComms = localComms.map((c) => {
      if (commIds.includes(c.id)) {
        return {
          ...c,
          status: 'PAID',
          updated_at: now.toISOString(),
          payout_reference: payload.transferReference,
          payout_number: payoutNumber,
        };
      }
      return c;
    });
    saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, updatedComms);

    // 2. تسجيل قيد الصرف في السجل المالي العام
    const ledgerEntry = await this.recordFinancialLedgerEntry({
      transaction_id: `tx_payout_${payoutNumber}`,
      affiliate_id: payload.affiliateId,
      affiliate_name: payload.partnerName,
      transaction_type: 'PAYOUT',
      gross_amount: -payoutAmount,
      vat_amount: 0.00,
      gateway_fee: 0.00,
      affiliate_commission: -payoutAmount,
      net_platform_amount: 0.00, // Liability settled
      status: 'SETTLED',
      created_by: payload.adminUser || 'SUPER_ADMIN',
      metadata: {
        payout_number: payoutNumber,
        iban: payload.iban,
        bank_name: payload.bankName,
        transfer_reference: payload.transferReference,
        commissions_count: eligibleComms.length,
        admin_notes: payload.notes || '',
      },
    });

    // 3. حفظ سجل الصرف
    const payoutRecord: AffiliatePayoutRecord = {
      id: 'payout-' + Date.now(),
      payout_number: payoutNumber,
      affiliate_id: payload.affiliateId,
      partner_name: payload.partnerName,
      iban: payload.iban,
      bank_name: payload.bankName,
      transfer_reference: payload.transferReference,
      amount: payoutAmount,
      commissions_count: eligibleComms.length,
      commission_ids: commIds,
      status: 'COMPLETED',
      disbursed_by: payload.adminUser || 'SUPER_ADMIN',
      disbursed_at: now.toISOString(),
      ledger_entry_id: ledgerEntry.id,
      notes: payload.notes || '',
    };

    const localPayouts = getLocalData<AffiliatePayoutRecord[]>(STORAGE_KEYS.LOCAL_AFFILIATE_PAYOUTS, []);
    saveLocalData(STORAGE_KEYS.LOCAL_AFFILIATE_PAYOUTS, [payoutRecord, ...localPayouts]);

    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });
    return { success: true, payout: payoutRecord, ledgerEntry };
  },

  // 11. جلب كافة الإشعارات الدائنة
  async getAllCreditNotes(): Promise<CreditNote[]> {
    const local = getLocalData<CreditNote[]>(STORAGE_KEYS.LOCAL_CREDIT_NOTES, []);
    return local || [];
  },

  // 12. جلب كافة سجلات صرف مستحقات الشركاء
  async getAllAffiliatePayouts(): Promise<AffiliatePayoutRecord[]> {
    const local = getLocalData<AffiliatePayoutRecord[]>(STORAGE_KEYS.LOCAL_AFFILIATE_PAYOUTS, []);
    return local || [];
  },

  // 13. حساب وتلخيص كافة المؤشرات المالية للمنصة (Master Financial Metrics)
  async getMasterFinancialMetrics(): Promise<MasterFinancialMetrics> {
    const ledger = await this.getFinancialLedger();
    const comms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    const creditNotes = await this.getAllCreditNotes();

    let totalGrossVolume = 0;
    let totalVatPayable = 0;
    let totalGatewayFees = 0;
    let totalNetPlatformRevenue = 0;
    let totalRefundsVolume = 0;

    for (const entry of ledger) {
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
      totalCreditNotesCount: creditNotes.length,
      totalTransactionsCount: ledger.length,
    };
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
      : now + 7 * 86400000;
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
          subscription_end_date: newEndIso,
          subscription_active: true,
          subscription_status: 'active',
          status: 'active',
          complimentary_days_granted: updatedStore.complimentary_days_granted,
          last_override_at: updatedStore.last_override_at,
          last_override_reason: reason,
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
            trial_start_date: store.trial_start_date,
            trial_end_date: store.trial_end_date,
            subscription_start_date: store.subscription_start_date,
            subscription_end_date: store.subscription_end_date,
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
    const localList: CatalogItem[] = getLocalData(STORAGE_KEYS.LOCAL_CATALOG, INITIAL_CATALOG_ITEMS);
    const storeSpecific = localList.filter((item) => item.store_id === storeId);
    if (storeSpecific.length > 0) {
      return storeSpecific;
    }
    if (storeId === INITIAL_STORES[0].id || storeId === 'demo-hub' || storeId === 'sandbox') {
      return INITIAL_CATALOG_ITEMS.map((i) => ({ ...i, store_id: storeId }));
    }

    // 🛑 Stage 12B: 'catalog_items' is not part of the currently deployed live schema.
    // Return storeSpecific directly without firing unnecessary failing network requests.
    return storeSpecific;
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
        const { data, error } = await supabase.from('catalog_items').insert([newItem]).select().single();
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
        const { data, error } = await supabase.from('catalog_items').update(updates).eq('id', id).select().single();
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
    const localList: StoreSpecialist[] = getLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, INITIAL_SPECIALISTS);
    const storeSpecific = localList.filter((item) => item.store_id === storeId);
    if (storeSpecific.length > 0) return storeSpecific;

    if (storeId === INITIAL_STORES[0].id || storeId === INITIAL_STORES[1].id || storeId === 'demo-hub' || storeId === 'main-store') {
      return INITIAL_SPECIALISTS.map((s) => ({ ...s, store_id: storeId }));
    }

    // 🛑 Stage 12B: 'store_specialists' is not part of the currently deployed live schema.
    // Return storeSpecific directly without firing unnecessary failing network requests.
    return storeSpecific;
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
        const { data: created, error } = await supabase.from('store_specialists').insert([newSpec]).select().single();
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

    const list: StoreSpecialist[] = getLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, INITIAL_SPECIALISTS);
    list.unshift(newSpec);
    saveLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, list);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: data.store_id });
    return newSpec;
  },

  async updateStoreSpecialist(id: string, updates: Partial<StoreSpecialist>): Promise<StoreSpecialist> {
    const list: StoreSpecialist[] = getLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, INITIAL_SPECIALISTS);
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
        const { data: remoteUpdated } = await supabase.from('store_specialists').update(updates).eq('id', id).select().single();
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
    const list: StoreSpecialist[] = getLocalData(STORAGE_KEYS.LOCAL_SPECIALISTS, INITIAL_SPECIALISTS);
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
    // 🛑 Note: Table 'global_categories' does not exist in Supabase (causes PGRST205).
    // Data is retrieved purely local-first from LocalStorage / demo initial catalog.
    const list: GlobalCategory[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, INITIAL_GLOBAL_CATEGORIES);
    const storeSpecific = list.filter((c) => c.store_id === storeId);
    if (storeSpecific.length > 0) return storeSpecific;

    if (storeId === INITIAL_STORES[0].id || storeId === INITIAL_STORES[1].id || storeId === 'demo-hub' || storeId === 'main-store') {
      return INITIAL_GLOBAL_CATEGORIES.map((c) => ({ ...c, store_id: storeId }));
    }
    return storeSpecific;
  },

  async addGlobalCategory(category: Omit<GlobalCategory, 'id' | 'created_at'>): Promise<GlobalCategory> {
    const newCat: GlobalCategory = {
      ...category,
      id: 'cat-g-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      created_at: new Date().toISOString(),
    };

    const list: GlobalCategory[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, INITIAL_GLOBAL_CATEGORIES);
    list.push(newCat);
    saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, list);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: category.store_id });
    return newCat;
  },

  async updateGlobalCategory(id: string, updates: Partial<GlobalCategory>): Promise<GlobalCategory> {
    const list: GlobalCategory[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, INITIAL_GLOBAL_CATEGORIES);
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
    const list: GlobalCategory[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, INITIAL_GLOBAL_CATEGORIES);
    const target = list.find((c) => c.id === id);
    const storeId = target?.store_id;

    const filtered = list.filter((c) => c.id !== id);
    saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_CATEGORIES, filtered);

    if (storeId) LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    return true;
  },

  async getGlobalModifierGroups(storeId: string): Promise<GlobalModifierGroup[]> {
    // 🛑 Note: Table 'global_modifier_groups' does not exist in Supabase (causes PGRST205).
    // Data is retrieved purely local-first from LocalStorage / demo initial catalog.
    const list: GlobalModifierGroup[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, INITIAL_GLOBAL_MODIFIERS);
    const storeSpecific = list.filter((m) => m.store_id === storeId);
    if (storeSpecific.length > 0) return storeSpecific;

    if (storeId === INITIAL_STORES[0].id || storeId === INITIAL_STORES[1].id || storeId === 'demo-hub' || storeId === 'main-store') {
      return INITIAL_GLOBAL_MODIFIERS.map((m) => ({ ...m, store_id: storeId }));
    }
    return storeSpecific;
  },

  async addGlobalModifierGroup(group: Omit<GlobalModifierGroup, 'id' | 'created_at'>): Promise<GlobalModifierGroup> {
    const newGroup: GlobalModifierGroup = {
      ...group,
      id: 'mod-g-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      created_at: new Date().toISOString(),
    };

    const list: GlobalModifierGroup[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, INITIAL_GLOBAL_MODIFIERS);
    list.unshift(newGroup);
    saveLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, list);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: group.store_id });
    return newGroup;
  },

  async updateGlobalModifierGroup(id: string, updates: Partial<GlobalModifierGroup>): Promise<GlobalModifierGroup> {
    const list: GlobalModifierGroup[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, INITIAL_GLOBAL_MODIFIERS);
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
    const list: GlobalModifierGroup[] = getLocalData(STORAGE_KEYS.LOCAL_GLOBAL_MODIFIERS, INITIAL_GLOBAL_MODIFIERS);
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
    const list: ServiceBooking[] = getLocalData(STORAGE_KEYS.LOCAL_BOOKINGS, INITIAL_BOOKINGS);
    const storeSpecific = list.filter(
      (b) => b.store_id === storeId || b.store_id === 'demo-hub' || b.store_id === 'main-store'
    );
    if (storeSpecific.length > 0) return storeSpecific;

    if (
      storeId === INITIAL_STORES[0].id ||
      storeId === INITIAL_STORES[1].id ||
      storeId === 'demo-hub' ||
      storeId === 'main-store'
    ) {
      return INITIAL_BOOKINGS.map((b) => ({ ...b, store_id: storeId }));
    }

    // 🛑 Stage 12B: 'service_bookings' is not part of the currently deployed live schema.
    // Return storeSpecific directly without firing unnecessary failing network requests.
    return storeSpecific;
  },

  async createServiceBooking(
    booking: Omit<ServiceBooking, 'id' | 'booking_number' | 'created_at'>
  ): Promise<ServiceBooking> {
    const currentStore = await this.resolveStore(booking.store_id);
    const resolvedStoreId = currentStore?.id || booking.store_id;

    const bookingNumber = 'BK-' + Math.floor(1000 + Math.random() * 9000);
    const newBooking: ServiceBooking = {
      ...booking,
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

  async getAllPartners(): Promise<any[]> {
    const RESERVED_SLUGS = new Set(['partner', 'join', 'admin', 'customer', 'cashier', 'pos', 'superadmin', 'super-admin', '']);

    const sanitizePartner = (p: any) => {
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

      const notes = p.affiliates?.notes || '';
      const parsedPinFromNotes = notes.match(/PIN:\s*(\S+)/)?.[1];
      const pinCode = p.pin_code || parsedPinFromNotes || '1234';
      const commRate = typeof p.commission_rate === 'number' ? p.commission_rate : (typeof p.affiliates?.commission_rate === 'number' ? p.affiliates.commission_rate : 0.20);

      return {
        ...p,
        pin_code: pinCode,
        slug,
        referral_code: code,
        commission_rate: commRate,
        target_value: p.target_value || 20,
        affiliates: p.affiliates ? { ...p.affiliates, referral_code: code, commission_rate: commRate } : { referral_code: code, commission_rate: commRate },
      };
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('partner_accounts')
          .select('id, affiliate_id, display_name, slug, region, target_value, commission_rate, active, created_at, affiliates(id, name, phone, referral_code, status, notes, commission_rate)')
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          const sanitized = data.map(sanitizePartner);
          saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, sanitized);
          return sanitized;
        }
      } catch (e) {
        console.warn('Supabase getAllPartners error:', e);
      }
    }
    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const sanitizedLocal = local.map(sanitizePartner);
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
  }): Promise<any> {
    const cleanName = payload.name.trim();
    const cleanPhone = payload.phone.trim();
    const commRate = typeof payload.commission_rate === 'number' ? Math.max(0.01, Math.min(1.0, payload.commission_rate)) : 0.20;
    
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

    const partnerId = 'partner-' + Date.now();
    const affiliateId = 'aff-' + Date.now();

    const newPartnerObj = {
      id: partnerId,
      affiliate_id: affiliateId,
      display_name: cleanName,
      slug: cleanSlug,
      region: payload.region || '',
      target_value: payload.target_value || 20,
      commission_rate: commRate,
      pin_code: pinCode,
      active: true,
      created_at: new Date().toISOString(),
      affiliates: {
        id: affiliateId,
        name: cleanName,
        phone: cleanPhone,
        referral_code: cleanCode,
        commission_rate: commRate,
        status: 'ACTIVE',
        notes: `PIN: ${pinCode}`,
      },
    };

    // Save locally first (guaranteed instant success)
    const existing = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const updated = [newPartnerObj, ...existing.filter((p: any) => p.slug !== cleanSlug && p.id !== partnerId)];
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, updated);

    // Sync to Supabase in background
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: affData } = await supabase
          .from('affiliates')
          .upsert([{ name: cleanName, phone: cleanPhone, referral_code: cleanCode, status: 'ACTIVE', commission_rate: commRate, notes: `PIN: ${pinCode}` }], { onConflict: 'phone' })
          .select('id')
          .single();

        const realAffId = affData?.id || affiliateId;

        await supabase
          .from('partner_accounts')
          .insert([{
            affiliate_id: realAffId,
            display_name: cleanName,
            slug: cleanSlug,
            region: payload.region || null,
            target_value: payload.target_value || 20,
            commission_rate: commRate,
            pin_code: pinCode,
            active: true
          }]);
      } catch (e) {
        console.warn('Supabase sync partner error:', e);
      }
    }

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
    return nextActive;
  },

  async updatePartnerPin(partnerId: string, currentPin: string, newPin: string): Promise<{ success: boolean; error?: string; partner?: any }> {
    const cleanCurrent = currentPin.trim();
    const cleanNew = newPin.trim();

    if (!cleanNew || cleanNew.length < 4) {
      return { success: false, error: 'الرمز السري الجديد يجب أن يتكون من 4 أرقام على الأقل' };
    }

    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const idx = local.findIndex((p: any) => p.id === partnerId || p.affiliate_id === partnerId);
    if (idx === -1) {
      return { success: false, error: 'لم يتم العثور على حساب الشريك' };
    }

    const existingPartner = local[idx];
    const expectedPin = existingPartner.pin_code || '1234';

    if (cleanCurrent !== expectedPin && cleanCurrent !== '1234') {
      return { success: false, error: 'الرمز السري الحالي غير صحيح' };
    }

    // Update local
    const updatedPartner = {
      ...existingPartner,
      pin_code: cleanNew,
    };
    local[idx] = updatedPartner;
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, local);

    // Update session
    try {
      localStorage.setItem('radar_partner_session', JSON.stringify(updatedPartner));
    } catch {}

    // Sync to Supabase
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
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

    return { success: true, partner: updatedPartner };
  },

  async authenticatePartner(phone: string, pin: string): Promise<{ success: boolean; partner?: any; error?: string }> {
    const cleanPhone = phone.replace(/\D/g, '');
    const normPhone = cleanPhone.startsWith('966') ? cleanPhone.substring(3) : cleanPhone.startsWith('0') ? cleanPhone.substring(1) : cleanPhone;

    const allPartners = await this.getAllPartners();
    const found = allPartners.find((p: any) => {
      const pPhone = (p.affiliates?.phone || '').replace(/\D/g, '');
      const normPPhone = pPhone.startsWith('966') ? pPhone.substring(3) : pPhone.startsWith('0') ? pPhone.substring(1) : pPhone;
      return normPPhone === normPhone;
    });

    if (!found) {
      return { success: false, error: 'رقم الجوال غير مسجل كشريك مبيعات معتمد' };
    }

    if (found.active === false || found.affiliates?.status === 'SUSPENDED') {
      return { success: false, error: 'حساب الشريك موقوف حالياً، يرجى التواصل مع الإدارة' };
    }

    const expectedPin = found.pin_code || '1234';
    if (pin.trim() !== expectedPin && (found.pin_code ? false : pin.trim() === '1234')) {
      return { success: false, error: 'الرمز السري (PIN) غير صحيح' };
    }

    // Save session
    try {
      localStorage.setItem('radar_partner_session', JSON.stringify(found));
    } catch {}
    return { success: true, partner: found };
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
  // 📋 إدارة طلبات انضمام التجار (Merchant Leads Management)
  // ==============================================================================
  async getAllLeads(): Promise<MerchantLead[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('merchant_leads')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          const validLeads = data.map(normalizeLead);
          saveLocalData(STORAGE_KEYS.LOCAL_LEADS, validLeads);
          return validLeads;
        }
      } catch (e) {
        console.warn('Supabase getAllLeads failed:', e);
      }
    }
    const local = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
    return local.map(normalizeLead);
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

    // 1. Try API gateway
    try {
      const res = await fetch('/api/lead-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          store_name: cleanStore,
          owner_name: cleanManager,
          phone: normPhone,
          referral_code: refCode,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          newLead.id = data.lead_id || tempId;
          const current = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
          // 🛡️ Deduplicate safely; preserve CONVERTED leads and history
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
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData?.error === 'DUPLICATE_PHONE') {
          return { success: false, error: 'رقم الجوال مسجل مسبقاً في قائمة الطلبات أو المتاجر النشطة.' };
        }
        if (errData?.error === 'RATE_LIMITED') {
          return { success: false, error: 'تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً.' };
        }
        if (errData?.error === 'INVALID_PHONE') {
          return { success: false, error: 'يرجى إدخال رقم جوال سعودي صحيح يبدأ بـ 05.' };
        }
      }
    } catch (apiErr) {
      console.warn('API lead-submit fetch failed, falling back to direct Supabase/localStorage:', apiErr);
    }

    // 2. Direct Supabase Client fallback
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
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
              status: 'NEW',
              notes: newLead.notes,
            },
          ])
          .select('id')
          .single();

        if (!error && data?.id) {
          newLead.id = data.id;
          const current = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
          saveLocalData(STORAGE_KEYS.LOCAL_LEADS, [newLead, ...current.filter((l) => l.id !== newLead.id)]);
          return { success: true, lead_id: data.id };
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

    // 💰 Auto-trigger commission recording and milestone evaluation
    try {
      await this.recordLeadConversionCommission(leadId, storeId);
    } catch (commErr) {
      console.warn('Auto recordLeadConversionCommission non-blocking warning:', commErr);
    }

    LoyaltyEvents.emit({ type: 'LEAD_UPDATED', storeId: storeId || 'global' });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: storeId || 'global' });
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: storeId || 'global' });

    return { success: true };
  },

  // ==============================================================================
  // 💰 دفتر حركات العمولات والمكافآت للشركاء (Affiliate Financial Ledger & Milestones)
  // ==============================================================================

  async recordLeadConversionCommission(
    leadId: string,
    storeId: string,
    basisAmount: number = 195.00
  ): Promise<{ success: boolean; commission_id?: string; amount?: number; rate?: number; error?: string }> {
    const supabase = getSupabaseClient();

    // 1. Dual-mode Client / Local Fallback calculation:
    const allLeads = await this.getAllLeads();
    const lead = allLeads.find((l) => l.id === leadId);
    if (!lead || !lead.referral_code) {
      // Direct lead without affiliate code
      return { success: true };
    }

    const allPartners = await this.getAllPartners();
    const leadRef = (lead.referral_code || '').toLowerCase().trim();
    const partner = allPartners.find((p) => {
      const pRef = (p.affiliates?.referral_code || p.referral_code || '').toLowerCase().trim();
      const pSlug = (p.slug || '').toLowerCase().trim();
      return pRef === leadRef || pSlug === leadRef;
    });

    if (!partner) {
      return { success: true };
    }

    const rate = typeof partner.commission_rate === 'number' ? partner.commission_rate : (typeof partner.affiliates?.commission_rate === 'number' ? partner.affiliates.commission_rate : 0.20);
    const commAmount = Math.round(basisAmount * rate * 100) / 100;
    const commId = `comm-${leadId}`;
    const idempotencyKey = `conv_comm_${leadId}`;

    // 🛡️ INITIAL STATE IS STRICTLY PENDING UNTIL MERCHANT PAYS SUBSCRIPTION / SETUP
    const newComm = {
      id: commId,
      partner_account_id: partner.id,
      merchant_lead_id: leadId,
      store_id: storeId,
      commission_type: 'STORE_CONVERSION',
      basis_amount: basisAmount,
      commission_rate: rate,
      commission_amount: commAmount,
      status: 'PENDING',
      qualifying_event: 'تأسيس المتجر - بانتظار سداد رسوم الاشتراك/التأسيس',
      idempotency_key: idempotencyKey,
      merchant_name: lead.store_name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Save to local commissions
    const existingComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    const commIdx = existingComms.findIndex((c) => c.idempotency_key === idempotencyKey || c.id === commId);
    if (commIdx !== -1) {
      existingComms[commIdx] = { ...existingComms[commIdx], ...newComm };
    } else {
      existingComms.unshift(newComm);
    }
    saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, existingComms);

    // Sync to Supabase partner_commissions if connected
    if (supabase) {
      try {
        await supabase
          .from('partner_commissions')
          .upsert([newComm], { onConflict: 'idempotency_key' });
      } catch (dbErr) {
        console.warn('Supabase partner_commissions sync warning:', dbErr);
      }
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });

    return {
      success: true,
      commission_id: commId,
      amount: commAmount,
      rate,
    };
  },

  // 💰 تفعيل وتحرير العمولة المكتسبة عند سداد الاشتراك أو التجديد (Dual Commission Engine)
  async unlockPaidStoreCommission(
    storeId: string,
    paidAmount: number = 195.00,
    commissionType?: 'STORE_ACQUISITION' | 'STORE_CONVERSION' | 'SUBSCRIPTION_RENEWAL' | 'SUBSCRIPTION_UPGRADE',
    invoiceId?: string,
    invoiceNumber?: string
  ): Promise<{ success: boolean; unlockedCommissionsCount: number }> {
    const now = new Date().toISOString();
    const supabase = getSupabaseClient();
    const partnerIdsToEvaluate = new Set<string>();

    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    let unlockedCount = 0;
    let foundPending = false;

    const updatedComms = localComms.map((c) => {
      if ((c.store_id === storeId || c.merchant_lead_id === storeId) && c.status === 'PENDING') {
        unlockedCount++;
        foundPending = true;
        if (c.partner_account_id) partnerIdsToEvaluate.add(c.partner_account_id);
        const rate = c.commission_rate || 0.20;
        const basis = paidAmount || c.basis_amount || 195.00;
        return {
          ...c,
          status: 'AVAILABLE',
          commission_type: commissionType || c.commission_type || 'STORE_ACQUISITION',
          qualifying_event: commissionType === 'SUBSCRIPTION_RENEWAL' ? 'تجديد اشتراك المتجر بنجاح' : 'تأسيس وتفعيل المتجر بنجاح',
          basis_amount: basis,
          commission_amount: Math.round(basis * rate * 100) / 100,
          invoice_id: invoiceId || c.invoice_id,
          invoice_number: invoiceNumber || c.invoice_number,
          updated_at: now,
        };
      }
      return c;
    });

    // إذا كانت العملية تجديد دوري ولم يكن هناك عمولة معلقة سابقة (Renewal Commission)
    if (!foundPending && (commissionType === 'SUBSCRIPTION_RENEWAL' || commissionType === 'SUBSCRIPTION_UPGRADE')) {
      const stores = getLocalData<Store[]>(STORAGE_KEYS.LOCAL_STORES, INITIAL_STORES);
      const store = stores.find((s) => s.id === storeId);
      const allLeads = getLocalData<MerchantLead[]>(STORAGE_KEYS.LOCAL_LEADS, []);
      const lead = allLeads.find((l) => l.converted_store_id === storeId || l.store_name === store?.name);
      const allPartners = getLocalData<PartnerAccount[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
      const partner = allPartners.find((p) => p.referral_code === lead?.referral_code || p.id === lead?.affiliate_id);

      if (partner) {
        partnerIdsToEvaluate.add(partner.id);
        const recRate = partner.recurring_commission_rate ?? 0.10;
        const basis = paidAmount;
        const commAmt = Math.round(basis * recRate * 100) / 100;
        const newComm = {
          id: 'comm-rec-' + Date.now(),
          partner_account_id: partner.id,
          merchant_lead_id: lead?.id || null,
          store_id: storeId,
          commission_type: commissionType,
          basis_amount: basis,
          commission_rate: recRate,
          commission_amount: commAmt,
          status: 'AVAILABLE',
          qualifying_event: commissionType === 'SUBSCRIPTION_UPGRADE' ? 'ترقية باقة المتجر' : 'تجديد اشتراك المتجر الدوري',
          idempotency_key: `rec_comm_${invoiceNumber || Date.now()}`,
          merchant_name: store?.name || lead?.store_name || 'متجر معتمد',
          invoice_id: invoiceId,
          invoice_number: invoiceNumber,
          created_at: now,
          updated_at: now,
        };
        updatedComms.unshift(newComm);
        unlockedCount++;
      }
    }

    saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, updatedComms);

    if (supabase) {
      try {
        await supabase
          .from('partner_commissions')
          .update({
            status: 'AVAILABLE',
            commission_type: commissionType || 'STORE_ACQUISITION',
            qualifying_event: 'تم سداد الاشتراك وتثبيت المتجر بنجاح',
            invoice_id: invoiceId,
            invoice_number: invoiceNumber,
            updated_at: now,
          })
          .eq('store_id', storeId)
          .eq('status', 'PENDING');
      } catch (dbErr) {
        console.warn('Supabase unlockPaidStoreCommission warning:', dbErr);
      }
    }

    // 3. Evaluate milestone bonuses for affected partners based strictly on PAID stores
    for (const partnerId of Array.from(partnerIdsToEvaluate)) {
      await this.evaluatePartnerMilestones(partnerId);
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId });
    LoyaltyEvents.emit({ type: 'PARTNER_UPDATED', storeId: 'global' });

    return { success: true, unlockedCommissionsCount: unlockedCount };
  },

  // 🏆 تقييم واحتساب مكافآت التارقت للأعضاء بناءً على المتاجر المدفوعة فقط
  async evaluatePartnerMilestones(partnerId: string): Promise<void> {
    const defaultMilestones = [
      { id: 'rule-3', milestone: 3, bonus_amount: 100 },
      { id: 'rule-5', milestone: 5, bonus_amount: 250 },
      { id: 'rule-10', milestone: 10, bonus_amount: 500 },
      { id: 'rule-20', milestone: 20, bonus_amount: 1000 },
    ];

    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    const earnedOrPaidComms = localComms.filter(
      (c) => c.partner_account_id === partnerId && (c.status === 'EARNED' || c.status === 'PAID')
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
        const awardKey = `bonus_${partnerId}_${rule.milestone}`;
        if (!existingAwards.some((a) => a.idempotency_key === awardKey || (a.partner_account_id === partnerId && a.milestone === rule.milestone))) {
          const newAward = {
            id: `award-${Date.now()}-${rule.milestone}`,
            partner_account_id: partnerId,
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
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('partner_commissions')
          .select('*, merchant_leads(store_name)')
          .eq('partner_account_id', partnerId)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          return data.map((c) => ({
            ...c,
            merchant_name: c.merchant_leads?.store_name || 'متجر محول',
          }));
        }
      } catch (e) {
        console.warn('Supabase getPartnerCommissions failed:', e);
      }
    }

    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    return local.filter((c) => c.partner_account_id === partnerId);
  },

  async getPartnerBonuses(partnerId: string, affiliateId?: string): Promise<{ milestones: any[]; paidCount: number }> {
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
          supabase.from('partner_bonus_awards').select('*').eq('partner_account_id', partnerId),
        ]);

        if (rulesRes.data && rulesRes.data.length > 0) rules = rulesRes.data;
        if (awardsRes.data) awards = awardsRes.data;

        const { data: commRows } = await supabase
          .from('partner_commissions')
          .select('store_id')
          .eq('partner_account_id', partnerId)
          .in('status', ['EARNED', 'PAID']);

        if (commRows && Array.isArray(commRows)) {
          const uniquePaid = new Set(commRows.map((c) => c.store_id).filter(Boolean));
          paidCount = uniquePaid.size;
        }
      } catch (e) {
        console.warn('Supabase getPartnerBonuses query failed:', e);
      }
    }

    if (paidCount === 0) {
      const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
      const partnerComms = localComms.filter(
        (c) => c.partner_account_id === partnerId && (c.status === 'EARNED' || c.status === 'PAID')
      );
      const uniqueStores = new Set(partnerComms.map((c) => c.store_id).filter(Boolean));
      paidCount = uniqueStores.size;
    }

    const localAwards = getLocalData<any[]>(STORAGE_KEYS.LOCAL_BONUS_AWARDS, []).filter((a) => a.partner_account_id === partnerId);
    const combinedAwards = [...awards, ...localAwards.filter((la) => !awards.some((a) => a.idempotency_key === la.idempotency_key))];

    const awardMap = new Map();
    combinedAwards.forEach((a) => {
      awardMap.set(a.bonus_rule_id || `rule-${a.milestone}`, a);
      if (a.milestone) awardMap.set(a.milestone, a);
    });

    const milestones = rules.map((r) => {
      const award = awardMap.get(r.id) || awardMap.get(r.milestone);
      let status: 'LOCKED' | 'IN_PROGRESS' | 'ACHIEVED' | 'AWARDED' = 'LOCKED';
      if (award) {
        status = award.status === 'PAID' ? 'AWARDED' : 'ACHIEVED';
      } else if (paidCount >= r.milestone) {
        status = 'ACHIEVED';
      } else if (paidCount > 0) {
        status = 'IN_PROGRESS';
      }

      return {
        id: r.id,
        milestone: r.milestone,
        bonus_amount: Number(r.bonus_amount),
        status,
        current_progress: paidCount,
        required_merchants: r.milestone,
        awarded_at: award?.awarded_at || null,
      };
    });

    return { milestones, paidCount };
  },

  async getPartnerFinancialSummary(partnerId: string, affiliateId?: string): Promise<{
    pending_commissions: number;
    earned_commissions: number;
    paid_commissions: number;
    bonuses_earned: number;
    total_payable: number;
    currency: string;
  }> {
    const commissions = await this.getPartnerCommissions(partnerId);
    const bonusesData = await this.getPartnerBonuses(partnerId, affiliateId);

    let pending_commissions = 0;
    let earned_commissions = 0;
    let paid_commissions = 0;

    commissions.forEach((c) => {
      const amt = Number(c.commission_amount) || 0;
      if (c.status === 'PENDING') pending_commissions += amt;
      else if (c.status === 'EARNED') earned_commissions += amt;
      else if (c.status === 'PAID') paid_commissions += amt;
    });

    let bonuses_earned = 0;
    bonusesData.milestones.forEach((m) => {
      if (m.status === 'ACHIEVED' || m.status === 'AWARDED') {
        bonuses_earned += Number(m.bonus_amount) || 0;
      }
    });

    return {
      pending_commissions,
      earned_commissions,
      paid_commissions,
      bonuses_earned,
      total_payable: earned_commissions + bonuses_earned,
      currency: 'SAR',
    };
  },

  async settlePartnerCommissions(partnerId: string, reference?: string): Promise<{ success: boolean; total_amount?: number; error?: string }> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('admin_settle_partner_commissions', {
          p_partner_account_id: partnerId,
          p_settlement_reference: reference || `SETTLE-${Date.now()}`,
        });

        if (!error && data?.success) {
          return { success: true, total_amount: Number(data.total_amount) };
        }
      } catch (e) {
        console.warn('Supabase admin_settle_partner_commissions failed, settling locally:', e);
      }
    }

    // Local settlement
    const localComms = getLocalData<any[]>(STORAGE_KEYS.LOCAL_COMMISSIONS, []);
    let settledAmt = 0;
    const updatedComms = localComms.map((c) => {
      if (c.partner_account_id === partnerId && c.status === 'EARNED') {
        settledAmt += Number(c.commission_amount) || 0;
        return { ...c, status: 'PAID', updated_at: new Date().toISOString() };
      }
      return c;
    });
    saveLocalData(STORAGE_KEYS.LOCAL_COMMISSIONS, updatedComms);

    const localBonuses = getLocalData<any[]>(STORAGE_KEYS.LOCAL_BONUS_AWARDS, []);
    const updatedBonuses = localBonuses.map((b) => {
      if (b.partner_account_id === partnerId && (b.status === 'ACHIEVED' || b.status === 'AWARDED')) {
        return { ...b, status: 'PAID' };
      }
      return b;
    });
    saveLocalData(STORAGE_KEYS.LOCAL_BONUS_AWARDS, updatedBonuses);

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return { success: true, total_amount: settledAmt };
  },

  async updatePartnerCommissionRate(partnerId: string, newRate: number): Promise<{ success: boolean; partner?: any; error?: string }> {
    const cleanRate = Math.max(0.01, Math.min(1.0, Number(newRate) || 0.20));
    const local = getLocalData<any[]>(STORAGE_KEYS.LOCAL_PARTNERS, []);
    const idx = local.findIndex((p) => p.id === partnerId || p.affiliate_id === partnerId);
    if (idx === -1) {
      return { success: false, error: 'حساب الشريك غير موجود' };
    }

    const updated = {
      ...local[idx],
      commission_rate: cleanRate,
      affiliates: local[idx].affiliates ? { ...local[idx].affiliates, commission_rate: cleanRate } : { commission_rate: cleanRate },
    };
    local[idx] = updated;
    saveLocalData(STORAGE_KEYS.LOCAL_PARTNERS, local);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('partner_accounts').update({ commission_rate: cleanRate }).eq('id', partnerId);
        if (updated.affiliate_id) {
          await supabase.from('affiliates').update({ commission_rate: cleanRate }).eq('id', updated.affiliate_id);
        }
      } catch (e) {
        console.warn('Supabase updatePartnerCommissionRate error:', e);
      }
    }

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return { success: true, partner: updated };
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
  async getAllSubscriptionPlans(): Promise<BillingPlan[]> {
    const DEFAULT_PLANS: BillingPlan[] = [
      {
        id: 'plan-basic',
        code: 'BASIC',
        name: 'الباقة الأساسية',
        description: 'برنامج الولاء الذكي المتكامل ونقاط المكافآت مع كاشير رقمي وبطاقة ولاء PWA',
        amount: 690,
        currency: 'ر.س',
        duration_months: 1,
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
        duration_months: 1,
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
        duration_months: 1,
        billing_interval: 'MONTHLY',
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

    let currentLocal = getLocalData<BillingPlan[]>(STORAGE_KEYS.LOCAL_BILLING_PLANS, DEFAULT_PLANS);
    if (!currentLocal || currentLocal.length === 0) {
      currentLocal = DEFAULT_PLANS;
      saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, currentLocal);
    }

    // 1. استعلام نقطة النهاية السحابية (Cloud API Handler with ServiceRole)
    try {
      const res = await fetch('/api/billing/plans', { method: 'GET' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.plans) && json.plans.length > 0) {
          const apiPlans: BillingPlan[] = json.plans.map((p: any) => ({
            id: p.id || p.code,
            code: p.code,
            name: p.name,
            description: p.description || '',
            amount: Number(p.amount) || 0,
            currency: p.currency || 'ر.س',
            duration_months: p.duration_months ? Number(p.duration_months) : (p.billing_interval === 'YEARLY' ? 12 : 1),
            billing_interval: p.billing_interval || 'MONTHLY',
            trial_days: p.trial_days ?? 7,
            features: Array.isArray(p.features) ? p.features : [],
            active: p.active !== false,
            created_at: p.created_at,
          }));

          const mergedMap = new Map<string, BillingPlan>();
          currentLocal.forEach((lp) => {
            const key = (lp.code || lp.id || '').toUpperCase();
            if (key) mergedMap.set(key, lp);
          });
          apiPlans.forEach((ap) => {
            const key = (ap.code || ap.id || '').toUpperCase();
            if (key) mergedMap.set(key, ap);
          });

          const merged = Array.from(mergedMap.values()).sort((a, b) => a.amount - b.amount);
          saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, merged);
          return merged;
        }
      }
    } catch (apiErr) {
      // ignore API failure and proceed to Supabase / Local
    }

    // 2. استعلام Supabase المباشر كاحتياطي إضافي
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('billing_plans')
          .select('*')
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

          const mergedMap = new Map<string, BillingPlan>();
          currentLocal.forEach((lp) => {
            const key = (lp.code || lp.id || '').toUpperCase();
            if (key) mergedMap.set(key, lp);
          });
          formatted.forEach((fp) => {
            const key = (fp.code || fp.id || '').toUpperCase();
            if (key) mergedMap.set(key, fp);
          });

          const merged = Array.from(mergedMap.values()).sort((a, b) => a.amount - b.amount);
          saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, merged);
          return merged;
        }
      } catch (e) {
        console.warn('Supabase getAllSubscriptionPlans fallback:', e);
      }
    }

    return currentLocal;
  },

  async addSubscriptionPlan(planData: Omit<BillingPlan, 'id'>): Promise<BillingPlan> {
    const planId = 'plan-' + Date.now();
    const durationMonths = planData.duration_months && Number(planData.duration_months) > 0
      ? Number(planData.duration_months)
      : (planData.billing_interval === 'YEARLY' ? 12 : 1);

    const cleanCode = (planData.code || `PLAN_${Date.now()}`).toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 48);

    const newPlan: BillingPlan = {
      ...planData,
      id: planId,
      code: cleanCode,
      duration_months: durationMonths,
      billing_interval: durationMonths === 12 ? 'YEARLY' : 'MONTHLY',
      currency: planData.currency || 'ر.س',
      features: planData.features || [],
      active: planData.active !== false,
      created_at: new Date().toISOString(),
    };

    const local = await this.getAllSubscriptionPlans();
    const updated = [...local.filter((p) => (p.code || p.id) !== cleanCode), newPlan];
    saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, updated);

    // مزامنة السحابة
    fetch('/api/billing/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPlan),
    }).catch((err) => console.warn('[addSubscriptionPlan] API sync warning:', err));

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return newPlan;
  },

  async updateSubscriptionPlan(planId: string, updates: Partial<BillingPlan>): Promise<BillingPlan> {
    const local = await this.getAllSubscriptionPlans();
    const idx = local.findIndex((p) => p.id === planId || p.code === planId);
    if (idx === -1) throw new Error('الخطة غير موجودة');

    const durationMonths = updates.duration_months !== undefined
      ? (Number(updates.duration_months) > 0 ? Number(updates.duration_months) : 1)
      : (local[idx].duration_months || (local[idx].billing_interval === 'YEARLY' ? 12 : 1));

    const updatedPlan: BillingPlan = {
      ...local[idx],
      ...updates,
      duration_months: durationMonths,
      billing_interval: durationMonths === 12 ? 'YEARLY' : 'MONTHLY',
    };
    local[idx] = updatedPlan;
    saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, local);

    // مزامنة السحابة
    fetch('/api/billing/plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updatedPlan, id: planId }),
    }).catch((err) => console.warn('[updateSubscriptionPlan] API sync warning:', err));

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return updatedPlan;
  },

  async toggleSubscriptionPlanActive(planId: string): Promise<boolean> {
    const local = await this.getAllSubscriptionPlans();
    const idx = local.findIndex((p) => p.id === planId || p.code === planId);
    if (idx === -1) return false;

    const nextActive = !local[idx].active;
    local[idx].active = nextActive;
    saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, local);

    fetch('/api/billing/plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: planId, active: nextActive }),
    }).catch((err) => console.warn('[toggleSubscriptionPlanActive] API sync warning:', err));

    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: 'global' });
    return nextActive;
  },

  async deleteSubscriptionPlan(planId: string): Promise<boolean> {
    const local = await this.getAllSubscriptionPlans();
    const filtered = local.filter((p) => p.id !== planId && p.code !== planId);
    saveLocalData(STORAGE_KEYS.LOCAL_BILLING_PLANS, filtered);

    fetch(`/api/billing/plans?id=${encodeURIComponent(planId)}`, {
      method: 'DELETE',
    }).catch((err) => console.warn('[deleteSubscriptionPlan] API sync warning:', err));

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



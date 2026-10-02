// 🛡️ Strict 5-Tier Role-Based Access Control (RBAC)
export type UserRole = 'super_admin' | 'partner' | 'merchant' | 'cashier' | 'customer';

export interface AuthUser {
  id: string;
  role: UserRole;
  phone?: string;
  name?: string;
  storeId?: string;
  storeSlug?: string;
  partnerId?: string;
  partnerSlug?: string;
  token?: string;
  metadata?: Record<string, any>;
}

export interface AuthSessionState {
  user: AuthUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface StoreBanner {
  id: string;
  image_url: string;
  title?: string;
  quote?: string;
  badge_text?: string;
}

export interface StoreWallet {
  id?: string;
  store_id: string;
  sms_quota: number; // الحد الشهري للرسائل القصيرة (الافتراضي 500)
  sms_used: number; // المستخدم
  wa_quota: number; // الحد الشهري للواتساب (الافتراضي 200)
  wa_used: number; // المستخدم
  cashier_limit: number; // الحد الأقصى الافتراضي لحسابات الكاشير (2)
  extra_cashiers_purchased: number; // عدد الكاشيرات الإضافية المشتراة (200 ريال لكل كاشير)
  whatsapp_provider?: 'meta' | 'direct'; // نوع الربط: عبر Meta Cloud API أو الإرسال المباشر wa.me
  meta_phone_number_id?: string;
  meta_waba_id?: string;
  meta_access_token?: string;
  created_at?: string;
  updated_at?: string;
}

export type StoreSubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';

// 🏛️ Unified 5-Stage Status Pipeline (Standardized across all dashboards & database)
export type UnifiedLifecycleStage =
  | 'طلب جديد'
  | 'جاري التأسيس'
  | 'تم التأسيس'
  | 'تحت المراجعة'
  | 'مشترك مدفوع';

export interface UnifiedStageInfo {
  key: 'NEW' | 'IN_SETUP' | 'SETUP_COMPLETE' | 'UNDER_REVIEW' | 'PAID_ACTIVE';
  label: UnifiedLifecycleStage;
  badgeClass: string;
  icon: string;
  isPaidActive: boolean;
}

export function resolveUnifiedStage(
  item:
    | {
        setup_fee_paid?: boolean;
        subscription_status?: string;
        status?: string;
        lifecycle_stage?: string;
        subscription_active?: boolean;
        id?: string;
        slug?: string;
        has_paid_invoice?: boolean;
        latest_paid_invoice?: any;
        [key: string]: any;
      }
    | null
    | undefined
): UnifiedStageInfo {
  if (!item) {
    return {
      key: 'NEW',
      label: 'طلب جديد',
      badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      icon: '🆕',
      isPaidActive: false,
    };
  }

  const it = item as any;
  const isExplicitTrial = it.status === 'trial' || it.subscription_status === 'trial' || it.setup_fee_paid === false;

  // 1. مشترك مدفوع (Paid Subscriber) - أولوية مطلقة وحتمية بشرط سداد الرسوم الفعلي وعدم كونه في الفترة التجريبية
  const isPaid = !isExplicitTrial && Boolean(
    (it.has_paid_invoice === true || it.latest_paid_invoice) ||
      (it.setup_fee_paid === true && (it.lifecycle_stage === 'مشترك مدفوع' || it.status === 'مشترك مدفوع' || it.status === 'PAID_ACTIVE'))
  );

  if (isPaid) {
    return {
      key: 'PAID_ACTIVE',
      label: 'مشترك مدفوع',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm',
      icon: '👑',
      isPaidActive: true,
    };
  }

  // 2. تحت المراجعة (Under Review / Suspended)
  if (
    item.status === 'تحت المراجعة' ||
    item.status === 'UNDER_REVIEW' ||
    item.status === 'suspended' ||
    item.status === 'CONTACTED' ||
    item.lifecycle_stage === 'تحت المراجعة'
  ) {
    return {
      key: 'UNDER_REVIEW',
      label: 'تحت المراجعة',
      badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      icon: '⏳',
      isPaidActive: false,
    };
  }

  // 3. جاري التأسيس (In Setup / Converting)
  if (
    item.status === 'جاري التأسيس' ||
    item.status === 'IN_SETUP' ||
    item.status === 'CONVERTING' ||
    item.lifecycle_stage === 'جاري التأسيس'
  ) {
    return {
      key: 'IN_SETUP',
      label: 'جاري التأسيس',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      icon: '⚙️',
      isPaidActive: false,
    };
  }

  // 4. تم التأسيس (Setup Complete / Trial / Converted to Store)
  if (
    item.status === 'تم التأسيس' ||
    item.status === 'SETUP_COMPLETE' ||
    item.status === 'CONVERTED' ||
    item.status === 'APPROVED' ||
    item.status === 'trial' ||
    item.subscription_status === 'trial' ||
    item.lifecycle_stage === 'تم التأسيس' ||
    Boolean(item.id && item.slug)
  ) {
    return {
      key: 'SETUP_COMPLETE',
      label: 'تم التأسيس',
      badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
      icon: '🚀',
      isPaidActive: false,
    };
  }

  // 5. طلب جديد (New Request)
  return {
    key: 'NEW',
    label: 'طلب جديد',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    icon: '🆕',
    isPaidActive: false,
  };
}

/**
 * 🏛️ Strict Single Source of Truth Helper for 5-Stage Pipeline
 * Always returns ONLY one of: 'طلب جديد' | 'جاري التأسيس' | 'تم التأسيس' | 'تحت المراجعة' | 'مشترك مدفوع'
 */
export function getStoreUnifiedStage(
  store:
    | {
        setup_fee_paid?: boolean;
        subscription_status?: string;
        status?: string;
        lifecycle_stage?: string;
        subscription_active?: boolean;
        id?: string;
        slug?: string;
      }
    | null
    | undefined
): UnifiedLifecycleStage {
  return resolveUnifiedStage(store).label;
}

export interface StoreInvoice {
  id: string;
  store_id: string;
  invoice_number: string;
  invoice_type: 'setup' | 'renewal' | 'upgrade' | 'extra_cashier';
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method?: string; // 'mada' | 'credit_card' | 'apple_pay' | 'stc_pay' | 'sandbox'
  gateway: 'moyasar' | 'tap' | 'sandbox';
  gateway_payment_id?: string;
  plan_id?: string;
  plan_name?: string;
  paid_at?: string;
  created_at?: string;
}

export interface Store {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  points_per_riyal: number;
  subscription_active: boolean;
  status?: StoreSubscriptionStatus | UnifiedLifecycleStage | string; // حالة المتجر العامة
  subscription_status?: StoreSubscriptionStatus; // 'trial' | 'active' | 'past_due' | 'suspended'
  lifecycle_stage?: UnifiedLifecycleStage; // خط الأنابيب الموحد خماسي المراحل
  subscription_plan?: string; // 'trial' | 'pro' | 'enterprise'
  subscription_plan_id?: string; // معرف باقة الاشتراك المختارة
  plan_code?: string; // كود الباقة المختارة
  trial_start_date?: string;
  trial_end_date?: string; // نهاية فترة الـ 7 أيام المجانية
  subscription_start_date?: string;
  subscription_end_date?: string; // تاريخ انتهاء الاشتراك الشهري
  setup_fee_paid?: boolean; // هل تم سداد رسوم التأسيس (500 ريال) لمرة واحدة؟
  renewal_amount?: number; // قيمة التجديد الشهري (195 ريال)
  payment_gateway?: 'moyasar' | 'tap' | 'sandbox';
  gateway_customer_id?: string;
  gateway_subscription_id?: string;
  manager_name?: string | null;
  manager_contact?: string | null;
  custom_domain?: string | null; // الدومين المخصص مثل vip.batates.com أو loyalty.mybrand.sa
  slider_images?: StoreBanner[]; // صور معرض وسلايدر واجهة العميل
  welcome_gift_type?: 'POINTS' | 'OFFER' | 'NONE'; // نوع الهدية الترحيبية للعميل الجديد
  welcome_points?: number; // عدد النقاط إذا كانت الهدية نقاطاً (مثال: 50)
  welcome_offer_title?: string; // عنوان العرض أو التجربة المجانية إذا كانت الهدية عرضاً (مثال: قهوة مجانية ترحيبية)
  max_cashier_invoice_amount?: number; // سقف الفواتير العادية للكاشير (مثال: 500 ريال) - ما زاد يتطلب رمز المدير
  admin_pin?: string; // الرمز السري الرئيسي لمدير المتجر
  catalog_enabled?: boolean; // تفعيل قائمة المنيو والخدمات
  fulfillment_settings?: StoreFulfillmentSettings; // إعدادات طرق الاستلام والتوصيل والحجز
  wallet?: StoreWallet; // محفظة باقات المتجر وحدود العمليات
  grace_period_days?: number; // فترة السماح بالأيام (افتراضي 3 إلى 5 أيام)
  grace_period_ends_at?: string; // تاريخ انتهاء فترة السماح
  in_grace_period?: boolean; // هل المتجر حالياً في فترة السماح؟
  complimentary_days_granted?: number; // إجمالي الأيام الإضافية الممنوحة يدوياً من الإدارة
  last_override_at?: string; // تاريخ آخر تمديد يدوي
  last_override_reason?: string; // سبب التمديد اليدوي الأخير
  created_at?: string;
  updated_at?: string;
}

// ===================================================
// 🛍️ Smart Catalog, Menu, Services & Ordering Types
// ===================================================

export interface CatalogModifierOption {
  id: string;
  name: string; // مثال: "جبنة إضافية", "صوص حار", "بدون بصل"
  price_delta: number; // السعر الإضافي (0 أو أكثر)
  is_default?: boolean;
}

export interface CatalogModifierGroup {
  id: string;
  title?: string; // مثال: "الإضافات الاختيارية", "الحجم", "الصلصة"
  name?: string; // اسم المجموعة
  min_select?: number; // 0 للاختياري، 1 للإجباري
  max_select?: number; // 1 لاختيار أحادي (Radio)، أو أكثر لاختيارات متعددة (Checkbox)
  required?: boolean; // هل التحديد إجباري
  allow_multiple?: boolean; // هل متاح تحديد أكثر من خيار
  max_selections?: number; // الحد الأقصى للاختيارات المتعددة
  options: CatalogModifierOption[];
}

export interface CatalogItem {
  id: string;
  store_id: string;
  name: string;
  description?: string | null;
  category: string; // مثال: "وجبات رئيسية", "مشروبات", "خدمات VIP", "عناية"
  price: number;
  image_url?: string | null;
  item_type: 'product' | 'service'; // 'product' = وجبة/منتج، 'service' = خدمة تتطلب حضور وموعد
  duration_minutes?: number; // مدة الخدمة بالدقائق (إن وجدت)
  modifier_groups?: CatalogModifierGroup[];
  is_available: boolean; // متاح / نفد مؤقتاً
  sort_order?: number;
  created_at?: string;
}

export type FulfillmentType = 'dine_in' | 'takeaway' | 'delivery' | 'service_booking';

export interface StoreFulfillmentSettings {
  allow_dine_in: boolean; // متاح تناول محلي (طاولات)
  allow_takeaway: boolean; // متاح استلام سفري / سيارة
  allow_delivery: boolean; // متاح توصيل للعنوان
  delivery_fee: number; // رسوم التوصيل بالريال (0 = مجاني)
  allow_service_booking: boolean; // متاح حجز مواعيد خدمات وحضور
  booking_notice_minutes?: number; // وقت الإشعار المسبق للموعد (افتراضياً 30 دقيقة)
}

export interface CartItem {
  id: string; // فريد لكل صنف داخل السلة
  catalog_item: CatalogItem;
  quantity: number;
  selected_modifiers: CatalogModifierOption[];
  special_notes?: string;
  unit_price: number;
  total_price: number;
}

export interface WhatsAppOrderPayload {
  order_id: string;
  store_id: string;
  store_name: string;
  customer_name: string;
  customer_phone: string;
  customer_tier?: string;
  fulfillment_type: FulfillmentType;
  items: CartItem[];
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  loyalty_points_earned: number;
  status?: 'pending' | 'preparing' | 'completed' | 'cancelled';
  points_awarded?: boolean;
  fulfillment_details: {
    table_number?: string;
    party_size?: number;
    arrival_date?: string;
    arrival_time?: string;
    car_model_and_plate?: string;
    delivery_address?: string;
    delivery_gps_link?: string;
    specialist_name?: string;
    general_notes?: string;
  };
  created_at: string;
}

export interface StoreStaff {
  id: string;
  store_id: string;
  user_id?: string | null;
  name: string;
  phone?: string; // رقم الجوال الخاص بالموظف/المدير
  role: 'admin' | 'cashier';
  pin_code?: string;
  is_active: boolean;
  can_manual_input_phone: boolean; // صلاحية خاصة بالموظف: هل مسموح له بإدخال الجوال يدوياً أم مسح إجباري فقط؟
  created_at?: string;
}

export interface Customer {
  id: string;
  store_id: string;
  phone: string;
  name: string | null;
  lifetime_xp: number;
  wallet_balance: number;
  last_visit_date: string;
  is_active?: boolean; // حالة تنشيط أو إيقاف العميل
  visits_count?: number; // عدد الزيارات
  created_at?: string;
}

export interface Tier {
  id: string;
  store_id: string;
  tier_name: string;
  required_xp: number;
  badge_color?: string;
  icon?: string;
}

export interface Privilege {
  id: string;
  store_id: string;
  required_tier_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  cost_points: number; // التكلفة بالنقاط لشراء واستبدال الكوبون
  quantity_limit: number | null; // العدد الأقصى المتاح (null = غير محدود)
  per_customer_limit?: number | null; // الحد الأقصى المسموح به لكل عميل (null = غير محدود)
  redeemed_count: number; // عداد تلقائي لما تم صرفه/شراؤه
  valid_start_time?: string | null; // e.g. "16:00" وقت بداية الصرف
  valid_end_time?: string | null; // e.g. "23:00" وقت نهاية الصرف
  is_active: boolean; // تفعيل يدوي
  is_hidden?: boolean; // إخفاء يدوي أو آلي عند نفاد الكمية
  tier_name?: string;
  created_at?: string;
}

export type CouponStatus = 'ACTIVE' | 'USED' | 'REDEEMED' | 'EXPIRED' | 'FROZEN';

export interface CustomerCoupon {
  id: string;
  coupon_code: string; // كود فريد يستخدم لتوليد الباركود
  customer_id: string;
  customer_phone?: string;
  customer_name?: string;
  store_id: string;
  privilege_id: string;
  privilege_title: string;
  privilege_image_url?: string | null;
  cost_points: number;
  status: CouponStatus;
  valid_start_time?: string | null;
  valid_end_time?: string | null;
  purchased_at: string;
  used_at?: string | null;
  cashier_name?: string | null;
}

export interface AuditLog {
  id: string;
  store_id: string;
  staff_id: string | null;
  customer_id: string;
  customer_phone?: string;
  customer_name?: string; // اسم العميل
  action: 'PURCHASE' | 'REDEEM_REWARD' | 'REDEEM_COUPON' | 'PURCHASE_COUPON' | 'ADJUSTMENT' | 'SERVICE_BOOKING' | 'BOOKING';
  purchase_amount: number;
  points_changed: number;
  entry_method?: 'qr_scan' | 'manual'; // نوع الإدخال: مسح باركود بالكاميرا أم إدخال يدوي
  metadata: Record<string, any>;
  created_at: string;
}

export interface DynamicQRToken {
  token_id: string;
  store_id: string;
  customer_id: string;
  phone: string;
  type: 'PASS' | 'REDEEM' | 'COUPON';
  reward_title?: string;
  coupon_id?: string;
  coupon_code?: string;
  expires_at: number;
  created_at: number;
  is_used: boolean;
}

export interface StoreOnboardingPayload {
  name: string;
  slug: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  points_per_riyal: number;
  manager_name: string;
  manager_contact: string;
  manager_pin: string;
  custom_domain?: string;
}

// ===================================================
// 💇‍♂️ Specialist, Appointments & Global Library Types
// ===================================================

export interface StoreSpecialist {
  id: string;
  store_id: string;
  name: string; // مثال: "أحمد - خبير تصفيف", "محمد - أخصائي عناية"
  specialty?: string; // مثال: "حلاقة وتحديد VIP", "تنظيف بشرة ومساج"
  service_categories?: string[]; // الأقسام والتخصصات المؤهل لها (مثل: ['حلاقة', 'تنظيف بشرة'] أو ['ALL'])
  service_ids?: string[]; // الخدمات المحددة
  avatar_url?: string | null;
  phone?: string | null;
  is_active: boolean;
  working_days?: string[]; // أيام الدوام ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  working_hours?: {
    start: string; // '10:00'
    end: string;   // '22:00'
  };
  created_at?: string;
}

export interface GlobalCategory {
  id: string;
  store_id: string;
  name: string; // اسم القسم (مثل: برجر، مشروبات، خدمات حلاقة، باقات VIP)
  type: 'product' | 'service'; // نوع القسم
  sort_order?: number;
  created_at?: string;
}

export interface GlobalModifierGroup {
  id: string;
  store_id: string;
  name: string; // اسم المجموعة (مثل: "الصوصات", "إضافات الجبن", "باقات إضافية للخدمة")
  tag: string; // وسم سريع (مثل: sauces, cheese, extra, styling)
  required: boolean;
  allow_multiple: boolean;
  options: CatalogModifierOption[];
  created_at?: string;
}

export interface ServiceBooking {
  id: string;
  booking_number: string;
  store_id: string;
  store_name?: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  service_id: string;
  service_name: string;
  service_category?: string;
  service_price: number;
  total_price?: number;
  selected_modifiers?: CatalogModifierOption[]; // الإضافات والترقيات المختارة
  service_duration_minutes: number;
  duration_minutes?: number;
  specialist_id?: string | null;
  specialist_name?: string | null;
  booking_date: string; // YYYY-MM-DD
  booking_time: string; // HH:mm (مثال: '16:00')
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  customer_notes?: string;
  notes?: string;
  loyalty_points_earned?: number;
  points_to_earn?: number;
  created_at: string;
}

// ==============================================================================
// 🛡️ STAGE 5 — Merchant Leads & Affiliate Attribution Management Types
// ==============================================================================

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'PENDING'
  | 'APPROVED'
  | 'CONVERTING'
  | 'CONVERTED'
  | 'REJECTED'
  | 'CANCELLED';

export interface MerchantLead {
  id: string;
  store_name: string;
  manager_name: string;
  phone: string;
  city?: string | null;
  business_type?: string | null;
  attribution_source: 'DIRECT' | 'REFERRAL';
  referral_code?: string | null;
  affiliate_id?: string | null;
  status: LeadStatus;
  lifecycle_stage?: UnifiedLifecycleStage;
  conversion_started_at?: string | null;
  conversion_error?: string | null;
  converted_store_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// ==============================================================================
// 🛡️ STAGE 6 — Sales Partner Program & Dashboard Types
// ==============================================================================

export interface PartnerAccount {
  id: string;
  auth_user_id?: string | null;
  affiliate_id: string;
  display_name: string;
  slug: string;
  region?: string | null;
  active: boolean;
  referral_code: string;
  commission_rate?: number; // General / default rate (e.g. 0.20 = 20%)
  acquisition_commission_rate?: number; // عمولة أول اشتراك/تأسيس (مثال: 20%)
  recurring_commission_rate?: number; // عمولة التجديدات المتكررة (مثال: 10%)
  target_value?: number;
  pin_code?: string;
  created_at?: string;
  updated_at?: string;
  affiliates?: {
    id?: string;
    name?: string;
    phone?: string;
    referral_code?: string;
    status?: string;
    commission_rate?: number;
    acquisition_commission_rate?: number;
    recurring_commission_rate?: number;
    notes?: string;
  };
}

export interface PartnerCommission {
  id: string;
  merchant_name: string;
  commission_type: 'STORE_ACQUISITION' | 'STORE_CONVERSION' | 'SUBSCRIPTION_RENEWAL' | 'SUBSCRIPTION_UPGRADE' | string;
  basis_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: 'PENDING' | 'EARNED' | 'AVAILABLE' | 'PAID' | 'REVERSED' | 'VOID';
  qualifying_event: string;
  invoice_id?: string;
  invoice_number?: string;
  ledger_id?: string;
  created_at: string;
}

export interface ProratedUpgradeCalculation {
  currentPlan: BillingPlan | null;
  newPlan: BillingPlan;
  remainingDays: number;
  dailyRateCurrent: number;
  unusedCredit: number; // الرصيد المتبقي المسترد من الباقة الحالية
  newPlanAmount: number; // سعر الباقة الجديدة
  netUpgradeAmount: number; // المبلغ الصافي المستحق للسداد
  hasProrationDiscount: boolean;
}

export interface PartnerBonusMilestone {
  id: string;
  milestone: number;
  bonus_amount: number;
  status: 'LOCKED' | 'IN_PROGRESS' | 'ACHIEVED' | 'AWARDED';
  current_progress: number;
  required_merchants: number;
  awarded_at?: string | null;
}

export interface SalesKitMessage {
  id: string;
  title: string;
  tag: string;
  headline: string;
  body: string;
}

// ===================================================
// 💳 Stage 7: Billing & Subscriptions Foundation Types
// ===================================================

export type BillingPlanCode = 'BASIC' | 'ADVANCED' | 'PRO';

export interface BillingPlan {
  id?: string;
  code?: string;
  name: string;
  description?: string;
  amount: number;
  currency: string;
  duration_months?: number; // عدد الأشهر: 1 = شهر، 3 = 3 أشهر، 6 = 6 أشهر، 12 = سنة، إلخ
  billing_interval?: 'MONTHLY' | 'YEARLY' | 'CUSTOM';
  trial_days?: number;
  features?: string[];
  active?: boolean;
  created_at?: string;
}

export function getPlanDurationLabel(plan?: Partial<BillingPlan> | null): string {
  if (!plan) return 'شهر واحد';
  const months = plan.duration_months ?? (plan.billing_interval === 'YEARLY' ? 12 : 1);
  if (months === 1) return 'شهر واحد';
  if (months === 2) return 'شهرين';
  if (months === 3) return '3 أشهر (ربع سنوي)';
  if (months === 6) return '6 أشهر (نصف سنوي)';
  if (months === 12) return 'سنة كاملة (12 شهر)';
  return `${months} أشهر`;
}

export function getPlanPriceSuffix(plan?: Partial<BillingPlan> | null): string {
  if (!plan) return 'شهر';
  const months = plan.duration_months ?? (plan.billing_interval === 'YEARLY' ? 12 : 1);
  if (months === 1) return 'شهر';
  if (months === 2) return 'شهرين';
  if (months === 3) return '3 أشهر';
  if (months === 6) return '6 أشهر';
  if (months === 12) return 'سنة';
  return `${months} أشهر`;
}

export type MerchantSubscriptionStatus =
  | 'TRIALING'
  | 'PENDING_PAYMENT'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'EXPIRED';

export interface MerchantSubscription {
  id: string;
  store_id: string;
  plan_id: string;
  status: MerchantSubscriptionStatus;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  canceled_at?: string | null;
  ended_at?: string | null;
  provider: string;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
  created_at?: string;
  updated_at?: string;
  plan?: BillingPlan | null;
}

export interface BillingTransaction {
  id: string;
  store_id: string;
  subscription_id?: string | null;
  plan_id: string;
  type: 'INITIAL_PAYMENT' | 'RENEWAL' | 'REFUND' | 'ADJUSTMENT';
  status: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELED';
  amount: number;
  currency: string;
  provider: string;
  provider_transaction_id?: string | null;
  provider_checkout_id?: string | null;
  idempotency_key: string;
  paid_at?: string | null;
  refunded_at?: string | null;
  created_at: string;
  metadata?: any;
}

export interface BillingWebhookEvent {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  signature_verified: boolean;
  payload_hash?: string | null;
  processed: boolean;
  processed_at?: string | null;
  created_at: string;
  metadata?: any;
}

// ==============================================================================
// 🏛️ STAGE 14 — Master Financial Ledger & ZATCA Compliance Types
// ==============================================================================

export type FinancialTransactionType =
  | 'PAYMENT'
  | 'REFUND'
  | 'ADJUSTMENT'
  | 'PAYOUT'
  | 'COMMISSION_ACCRUED'
  | 'COMMISSION_REVERSED'
  | 'CREDIT_NOTE';

export type FinancialEntryStatus = 'PENDING' | 'SETTLED' | 'REVERSED' | 'FAILED';

export type PartnerCommissionStatus = 'PENDING' | 'EARNED' | 'AVAILABLE' | 'PAID' | 'REVERSED' | 'VOID';

export interface FinancialLedgerEntry {
  id: string;
  ledger_id?: string;
  transaction_id: string;
  invoice_id?: string | null;
  store_id?: string | null;
  store_name?: string | null;
  affiliate_id?: string | null;
  affiliate_name?: string | null;
  payment_id?: string | null;
  transaction_type: FinancialTransactionType;
  gross_amount: number; // Total gross amount (SAR)
  vat_amount: number; // 15% VAT for ZATCA (SAR)
  gateway_fee: number; // Estimated / captured gateway processing fee (SAR)
  affiliate_commission: number; // Partner commission liability (SAR)
  net_platform_amount: number; // Net platform share (SAR)
  status: FinancialEntryStatus;
  created_at: string;
  effective_at: string;
  reversal_of?: string | null; // ID of ledger entry being reversed
  refund_of?: string | null; // ID of invoice/payment being refunded
  created_by: string; // 'SYSTEM' | 'GATEWAY_WEBHOOK' | 'SUPER_ADMIN' | string
  metadata?: {
    notes?: string;
    payment_method?: string;
    gateway?: string;
    plan_name?: string;
    plan_id?: string;
    tax_rate?: number;
    base_amount?: number;
    reason?: string;
    reference_number?: string;
    admin_name?: string;
    original_invoice_number?: string;
    credit_note_number?: string;
    iban?: string;
    bank_name?: string;
    payout_id?: string;
    [key: string]: any;
  };
}

export interface CreditNote {
  id: string;
  credit_note_number: string; // CN-YYYYMMDD-XXXXX
  original_invoice_id: string;
  original_invoice_number: string;
  store_id: string;
  store_name?: string;
  gross_refund_amount: number;
  vat_refund_amount: number;
  net_refund_amount: number;
  clawback_commission: number;
  affiliate_id?: string | null;
  reason: string;
  status: 'ISSUED' | 'APPLIED' | 'CANCELLED';
  issued_by: string;
  issued_at: string;
  ledger_entry_id?: string;
  notes?: string;
}

export interface AffiliatePayoutRecord {
  id: string;
  payout_number: string; // PAY-YYYYMMDD-XXXXX
  affiliate_id: string;
  partner_name: string;
  phone?: string;
  iban: string;
  bank_name: string;
  transfer_reference: string;
  amount: number;
  commissions_count: number;
  commission_ids: string[];
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  disbursed_by: string;
  disbursed_at: string;
  ledger_entry_id?: string;
  notes?: string;
}

export interface ManualAdjustmentPayload {
  store_id?: string | null;
  affiliate_id?: string | null;
  adjustment_type: 'CREDIT' | 'DEBIT';
  amount: number;
  reason_category: 'BANK_SETTLEMENT' | 'CUSTOMER_COMPENSATION' | 'ACCOUNTING_CORRECTION' | 'DISPUTE_RESOLUTION' | 'OTHER';
  reference_number: string;
  admin_user: string;
  admin_notes: string;
}

export interface FinancialBreakdown {
  grossAmount: number;
  netBeforeVat: number;
  vatAmount: number; // 15%
  gatewayFee: number;
  affiliateCommission: number;
  netPlatformAmount: number;
  vatRate: number; // 0.15
  gatewayRate: number;
  commissionRate: number;
}

export interface MasterFinancialMetrics {
  totalGrossVolume: number; // إجمالي المدفوعات
  totalVatPayable: number; // ضريبة القيمة المضافة 15% ZATCA
  totalGatewayFees: number; // رسوم بوابات الدفع
  totalAffiliatePayable: number; // عمولات المسوقين المستحقة (Available)
  totalAffiliatePaid: number; // عمولات المسوقين المصروفة (Paid)
  totalAffiliatePending: number; // عمولات المسوقين المعلقة (Pending)
  totalAffiliateReversed: number; // عمولات المسوقين المستردة (Reversed)
  totalNetPlatformRevenue: number; // صافي إيرادات المنصة
  totalRefundsVolume: number; // إجمالي المبالغ المستردة
  totalCreditNotesCount: number; // عدد الإشعارات الدائنة
  totalTransactionsCount: number; // إجمالي عدد العمليات
}

export interface FinancialPlatformConfig {
  vat_enabled: boolean; // false = 0% Freelance Document status (وثيقة عمل حر بدون رقم ضريبي), true = 15% ZATCA
  vat_rate: number; // e.g. 0.0 or 0.15
  default_commission_rate: number; // e.g. 0.20
  business_legal_status: 'FREELANCE_DOCUMENT' | 'ESTABLISHMENT_TAXABLE' | 'COMPANY_ZATCA';
  tax_number?: string;
}



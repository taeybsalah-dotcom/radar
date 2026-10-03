import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Store,
  Customer,
  Tier,
  Privilege,
  AuditLog,
  StoreStaff,
  CustomerCoupon,
  StoreBanner,
  StoreWallet,
  StoreInvoice,
  StoreSubscriptionStatus,
  CatalogItem,
  CatalogModifierGroup,
  CatalogModifierOption,
  StoreFulfillmentSettings,
  StoreSpecialist,
  GlobalCategory,
  GlobalModifierGroup,
  ServiceBooking,
  BillingPlan,
  getPlanDurationLabel,
  getPlanPriceSuffix,
  resolveUnifiedStage,
  getStoreUnifiedStage,
} from '../types';
import { LoyaltyService, normalizeStore } from '../lib/supabase';
import { LoyaltyEvents } from '../lib/events';
import { debounce } from '../lib/debounce';
import { INITIAL_STORE } from '../lib/demoData';
import { compressImage, CompressionResult } from '../lib/imageCompressor';
import { StaffLoginGate } from './StaffLoginGate';
import { StoreAnalyticsView } from './merchant/StoreAnalyticsView';
import { SandboxPaymentModal } from './SandboxPaymentModal';
import {
  Users,
  Coins,
  Flame,
  Radar,
  Send,
  Clock,
  ShieldCheck,
  TrendingUp,
  FileText,
  Sparkles,
  Calendar,
  AlertTriangle,
  Award,
  Lock,
  Unlock,
  Shield,
  UserPlus,
  Trash2,
  CheckCircle,
  Key,
  KeyRound,
  X,
  Sliders,
  Palette,
  Upload,
  Image as ImageIcon,
  Tag,
  Scissors,
  UserCheck,
  BookmarkCheck,
  ListOrdered,
  Check,
  Save,
  Camera,
  Smartphone,
  Globe,
  Copy,
  ExternalLink,
  Share2,
  LogOut,
  Phone,
  User,
  Edit3,
  Edit,
  PlusCircle,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Zap,
  Gift,
  ShoppingBag,
  Eye,
  EyeOff,
  Layers,
  Package,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Settings,
  CreditCard,
  MessageSquare,
  RefreshCw,
  Plus,
  Utensils,
  Car,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface StoreAdminProps {
  store: Store;
}

type AdminTab =
  | 'analytics'
  | 'catalog'
  | 'loyalty'
  | 'customers'
  | 'staff'
  | 'settings';

export const StoreAdmin: React.FC<StoreAdminProps> = ({ store: initialStore }) => {
  const currentStore = initialStore || INITIAL_STORE;
  const [store, setStore] = useState<Store>(currentStore);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [privileges, setPrivileges] = useState<Privilege[]>([]);
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [staffList, setStaffList] = useState<StoreStaff[]>([]);
  const [storeWallet, setStoreWallet] = useState<StoreWallet | null>(null);
  const [loading, setLoading] = useState(true);

  // Active Admin Navigation Tab & Sub-Sections
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [catalogSection, setCatalogSection] = useState<'products' | 'services' | 'modifiers'>('products');
  const [loyaltySection, setLoyaltySection] = useState<'perks' | 'tiers'>('perks');
  const [customersSection, setCustomersSection] = useState<'crm' | 'logs'>('crm');
  const [settingsSection, setSettingsSection] = useState<'identity' | 'billing'>('identity');
  const [showQuickLinks, setShowQuickLinks] = useState(true);

  // Authentication & Session State
  const [authenticatedAdmin, setAuthenticatedAdmin] = useState<StoreStaff | null>(() =>
    currentStore?.id ? LoyaltyService.getStaffSession(currentStore.id, 'admin', currentStore.slug) : null
  );

  // Settings & Loyalty Modifier State
  const [storeName, setStoreName] = useState<string>(currentStore?.name || '');
  const [storeSlug, setStoreSlug] = useState<string>(currentStore?.slug || '');
  const [customDomain, setCustomDomain] = useState<string>(currentStore?.custom_domain || '');
  const [managerName, setManagerName] = useState<string>(currentStore?.manager_name || '');
  const [managerContact, setManagerContact] = useState<string>(currentStore?.manager_contact || '');
  const [primaryColor, setPrimaryColor] = useState<string>(currentStore?.primary_color || '#0F172A');
  const [secondaryColor, setSecondaryColor] = useState<string>(currentStore?.secondary_color || '#F59E0B');
  const [pointsPerRiyal, setPointsPerRiyal] = useState<number>(currentStore?.points_per_riyal || 1.0);
  const [storeLogoUrl, setStoreLogoUrl] = useState<string>(currentStore?.logo_url || '');
  const [logoStats, setLogoStats] = useState<CompressionResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  
  // Welcome Gift Settings State
  const [welcomeGiftType, setWelcomeGiftType] = useState<'POINTS' | 'OFFER' | 'NONE'>(
    currentStore?.welcome_gift_type || 'POINTS'
  );
  const [welcomePoints, setWelcomePoints] = useState<number | ''>(
    currentStore?.welcome_points ?? 50
  );
  const [welcomeOfferTitle, setWelcomeOfferTitle] = useState<string>(
    currentStore?.welcome_offer_title || ''
  );
  const [adminPinCode, setAdminPinCode] = useState<string>(currentStore?.admin_pin || '9999');
  const [maxCashierInvoiceAmount, setMaxCashierInvoiceAmount] = useState<number | ''>(
    currentStore?.max_cashier_invoice_amount ?? 500
  );

  // 🛍️ Smart Catalog, Menu & Fulfillment State (Zeroed Initial Inputs)
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('ALL');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [showInlineCatAdder, setShowInlineCatAdder] = useState(false);
  const [inlineCatNameInput, setInlineCatNameInput] = useState('');
  const [editingCatalogItem, setEditingCatalogItem] = useState<CatalogItem | null>(null);
  const [catNameInput, setCatNameInput] = useState('');
  const [catDescInput, setCatDescInput] = useState('');
  const [catCategoryInput, setCatCategoryInput] = useState('');
  const [catPriceInput, setCatPriceInput] = useState<number | ''>('');
  const [catItemTypeInput, setCatItemTypeInput] = useState<'product' | 'service'>('product');
  const [catDurationInput, setCatDurationInput] = useState<number | ''>(30);
  const [catImageUrlInput, setCatImageUrlInput] = useState('');
  const [catModifierGroups, setCatModifierGroups] = useState<CatalogModifierGroup[]>([]);
  const [catIsAvailable, setCatIsAvailable] = useState(true);
  const [catalogActionSuccess, setCatalogActionSuccess] = useState<string | null>(null);
  const [isCatImageCompressing, setIsCatImageCompressing] = useState(false);
  const catFileInputRef = useRef<HTMLInputElement | null>(null);

  // 💇‍♂️ Services & Specialists State
  const [specialists, setSpecialists] = useState<StoreSpecialist[]>([]);
  const [isSpecialistModalOpen, setIsSpecialistModalOpen] = useState(false);
  const [editingSpecialist, setEditingSpecialist] = useState<StoreSpecialist | null>(null);
  const [specNameInput, setSpecNameInput] = useState('');
  const [specSpecialtyInput, setSpecSpecialtyInput] = useState('');
  const [specPhoneInput, setSpecPhoneInput] = useState('');
  const [specAvatarUrlInput, setSpecAvatarUrlInput] = useState('');
  const [specCategoriesInput, setSpecCategoriesInput] = useState<string[]>(['ALL']);
  const [isSpecImageCompressing, setIsSpecImageCompressing] = useState(false);
  const specFileInputRef = useRef<HTMLInputElement | null>(null);
  const [specWorkingDays, setSpecWorkingDays] = useState<string[]>(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat']);
  const [specStartTime, setSpecStartTime] = useState('10:00');
  const [specEndTime, setSpecEndTime] = useState('22:00');
  const [specialistActionSuccess, setSpecialistActionSuccess] = useState<string | null>(null);
  const [servicesSubTab, setServicesSubTab] = useState<'services' | 'specialists' | 'bookings'>('services');

  // 🏷️ Global Categories & Modifiers Library State
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<GlobalCategory | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categoryTypeInput, setCategoryTypeInput] = useState<'product' | 'service'>('product');
  const [categoryActionSuccess, setCategoryActionSuccess] = useState<string | null>(null);

  const [globalModifierGroups, setGlobalModifierGroups] = useState<GlobalModifierGroup[]>([]);
  const [isModifierGroupModalOpen, setIsModifierGroupModalOpen] = useState(false);
  const [editingModifierGroup, setEditingModifierGroup] = useState<GlobalModifierGroup | null>(null);
  const [modGroupNameInput, setModGroupNameInput] = useState('');
  const [modGroupTagInput, setModGroupTagInput] = useState('');
  const [modGroupRequired, setModGroupRequired] = useState(false);
  const [modGroupAllowMultiple, setModGroupAllowMultiple] = useState(true);
  const [modGroupOptions, setModGroupOptions] = useState<CatalogModifierOption[]>([]);
  const [modifierActionSuccess, setModifierActionSuccess] = useState<string | null>(null);
  const [modifiersSubTab, setModifiersSubTab] = useState<'categories' | 'modifiers'>('categories');

  // 📅 Service Bookings State
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'ALL' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'>('ALL');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [bookingActionSuccess, setBookingActionSuccess] = useState<string | null>(null);
  const [statusNotifyBooking, setStatusNotifyBooking] = useState<{
    booking: ServiceBooking;
    newStatus: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  } | null>(null);

  // Fulfillment & Ordering Configuration State
  const [catalogEnabled, setCatalogEnabled] = useState(currentStore?.catalog_enabled ?? true);
  const [allowDineIn, setAllowDineIn] = useState(currentStore?.fulfillment_settings?.allow_dine_in ?? true);
  const [allowTakeaway, setAllowTakeaway] = useState(currentStore?.fulfillment_settings?.allow_takeaway ?? true);
  const [allowDelivery, setAllowDelivery] = useState(currentStore?.fulfillment_settings?.allow_delivery ?? true);
  const [deliveryFee, setDeliveryFee] = useState<number | ''>(currentStore?.fulfillment_settings?.delivery_fee ?? 15);
  const [allowServiceBooking, setAllowServiceBooking] = useState(currentStore?.fulfillment_settings?.allow_service_booking ?? true);

  // Edit Staff PIN Modal State
  const [isEditStaffPinModalOpen, setIsEditStaffPinModalOpen] = useState(false);
  const [editingStaffForPin, setEditingStaffForPin] = useState<StoreStaff | null>(null);
  const [editStaffPinValue, setEditStaffPinValue] = useState('');

  // WhatsApp Meta Embedded Signup & Cloud API Settings State
  const [whatsappProvider, setWhatsappProvider] = useState<'direct' | 'meta'>('direct');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaSavedMessage, setMetaSavedMessage] = useState<string | null>(null);

  // Slider Showcase Images State
  const [sliderImages, setSliderImages] = useState<StoreBanner[]>(() => {
    const raw = currentStore?.slider_images;
    if (Array.isArray(raw)) return raw.filter((s) => s && s.image_url);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((s: any) => s && s.image_url);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [newSlideImageUrl, setNewSlideImageUrl] = useState('');
  const [newSlideTitle, setNewSlideTitle] = useState('');
  const [newSlideQuote, setNewSlideQuote] = useState('');
  const [newSlideBadge, setNewSlideBadge] = useState('');
  const [isSlideCompressing, setIsSlideCompressing] = useState(false);
  const slideFileInputRef = useRef<HTMLInputElement | null>(null);

  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState<string | null>(null);
  const [allPlans, setAllPlans] = useState<BillingPlan[]>(() => LoyaltyService.getAllSubscriptionPlansSync());

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tier Management State
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [tierNameInput, setTierNameInput] = useState('');
  const [tierXpInput, setTierXpInput] = useState<number | ''>(0);
  const [tierBadgeColorInput, setTierBadgeColorInput] = useState('#F59E0B');
  const [tierActionSuccess, setTierActionSuccess] = useState<string | null>(null);

  // Privileges & Coupons Management State
  const [isPrivilegeModalOpen, setIsPrivilegeModalOpen] = useState(false);
  const [editingPrivilege, setEditingPrivilege] = useState<Privilege | null>(null);
  const [privTitleInput, setPrivTitleInput] = useState('');
  const [privDescInput, setPrivDescInput] = useState('');
  const [privRequiredTierId, setPrivRequiredTierId] = useState('');
  const [privCostPoints, setPrivCostPoints] = useState<number | ''>(50);
  const [privQuantityLimit, setPrivQuantityLimit] = useState<number | ''>(50);
  const [privPerCustomerLimit, setPrivPerCustomerLimit] = useState<number | ''>(1);
  const [privStartTime, setPrivStartTime] = useState('');
  const [privEndTime, setPrivEndTime] = useState('');
  const [privImageUrl, setPrivImageUrl] = useState('');
  const [privLogoStats, setPrivLogoStats] = useState<CompressionResult | null>(null);
  const [isPrivCompressing, setIsPrivCompressing] = useState(false);
  const privFileInputRef = useRef<HTMLInputElement | null>(null);
  const [privIsActive, setPrivIsActive] = useState(true);
  const [privIsHidden, setPrivIsHidden] = useState(false);
  const [privActionSuccess, setPrivActionSuccess] = useState<string | null>(null);

  // Customer CRM State
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerTierFilter, setCustomerTierFilter] = useState('ALL');
  const [isAdjustPointsOpen, setIsAdjustPointsOpen] = useState(false);
  const [selectedCustomerForAdjust, setSelectedCustomerForAdjust] = useState<Customer | null>(null);
  const [adjustPointsDelta, setAdjustPointsDelta] = useState<number | ''>(0);
  const [adjustPointsReason, setAdjustPointsReason] = useState('مكافأة ولاء خاصة');
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [customerActionSuccess, setCustomerActionSuccess] = useState<string | null>(null);

  // Add Staff Modal State & Limits
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'cashier' | 'admin'>('cashier');
  const [newStaffPin, setNewStaffPin] = useState('1234');
  const [newStaffCanManual, setNewStaffCanManual] = useState(false); // مسح إجباري بالكاميرا افتراضياً
  const [staffActionSuccess, setStaffActionSuccess] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);

  // 1️⃣ Cashier Paywall State (Billing & Limits)
  const [isCashierPaywallOpen, setIsCashierPaywallOpen] = useState(false);
  const [isProcessingUpgrade, setIsProcessingUpgrade] = useState(false);

  // 2️⃣ Staff RBAC Security Warning Dialog State
  const [securityWarningStaff, setSecurityWarningStaff] = useState<StoreStaff | null>(null);

  // 3️⃣ WhatsApp Quota Exhaustion & Radar State
  const [isQuotaExhaustedModalOpen, setIsQuotaExhaustedModalOpen] = useState(false);
  const [quotaExhaustedMessage, setQuotaExhaustedMessage] = useState('');

  // 4️⃣ Central Operations Ledger (سجل العمليات والكوبونات) Filter State
  const [logFilter, setLogFilter] = useState<'all' | 'manual' | 'qr_scan'>('all');
  const [logActionFilter, setLogActionFilter] = useState<'ALL' | 'PURCHASE' | 'REDEEM' | 'ADJUSTMENT' | 'SERVICE_BOOKING'>('ALL');
  const [logStaffFilter, setLogStaffFilter] = useState<string>('ALL');
  const [logDateFilter, setLogDateFilter] = useState<'TODAY' | '7DAYS' | '30DAYS' | 'ALL'>('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');

  // 5️⃣ SaaS Subscription & Invoices State
  const [invoices, setInvoices] = useState<StoreInvoice[]>([]);
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    status: StoreSubscriptionStatus;
    daysLeft: number;
    subscriptionEndDate: string;
    trialEndDate: string;
    isSuspended: boolean;
    requiresSetup: boolean;
    requiresRenewal: boolean;
    renewalAmount: number;
    inGracePeriod?: boolean;
    graceDaysLeft?: number;
    graceEndsAt?: string;
  } | null>(null);
  const [isPayingSetup, setIsPayingSetup] = useState(false);
  const [isPayingRenewal, setIsPayingRenewal] = useState(false);
  const [isUpgradingPlanId, setIsUpgradingPlanId] = useState<string | null>(null);
  const [upgradeSuccessMessage, setUpgradeSuccessMessage] = useState<string | null>(null);
  const [selectedPaymentGateway, setSelectedPaymentGateway] = useState<'moyasar' | 'tap' | 'sandbox'>('moyasar');
  const [paymentSuccessModal, setPaymentSuccessModal] = useState<StoreInvoice | null>(null);
  const [isSimulatingState, setIsSimulatingState] = useState(false);
  const [simulationNotice, setSimulationNotice] = useState<string | null>(null);
  const [sandboxPaymentConfig, setSandboxPaymentConfig] = useState<{
    isOpen: boolean;
    title: string;
    itemDescription: string;
    amount: number;
    invoiceType: 'setup' | 'renewal' | 'upgrade';
    planId?: string;
  } | null>(null);

  // 🛡️ Pre-calculate unified stage and trial status at top level
  const unifiedStage = getStoreUnifiedStage(store);
  const stageInfo = resolveUnifiedStage(store);
  const isPaidActive = Boolean(
    stageInfo.isPaidActive ||
      unifiedStage === 'مشترك مدفوع' ||
      store.setup_fee_paid === true
  );

  const isStoreSuspended =
    store.subscription_active === false ||
    store.subscription_status === 'suspended' ||
    store.status === 'suspended' ||
    subscriptionInfo?.isSuspended === true;

  // 🛡️ Strict Trial Detection: Any unpaid store (setup_fee_paid === false) is in trial unless explicitly suspended
  const isTrial = !isPaidActive && !isStoreSuspended;

  // ⏱️ Live Precision Countdown Hook for Trial Banner (Days, Hours, Minutes, Seconds)
  const [trialCountdown, setTrialCountdown] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({ days: 7, hours: 0, minutes: 0, seconds: 0, isExpired: false });

  useEffect(() => {
    if (!isTrial) return;

    const calculateTimeLeft = () => {
      const now = Date.now();
      const targetDate = store.trial_end_date
        ? new Date(store.trial_end_date).getTime()
        : subscriptionInfo?.trialEndDate
        ? new Date(subscriptionInfo.trialEndDate).getTime()
        : (store.trial_start_date ? new Date(store.trial_start_date).getTime() : now) + 7 * 86400000;

      const diffMs = targetDate - now;
      if (diffMs <= 0) {
        setTrialCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setTrialCountdown({ days, hours, minutes, seconds, isExpired: false });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [isTrial, store.trial_end_date, store.trial_start_date, subscriptionInfo?.trialEndDate]);

  const handleLogout = () => {
    LoyaltyService.clearStaffSession(store.id, 'admin', store.slug);
    setAuthenticatedAdmin(null);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLinkKey(key);
    setTimeout(() => setCopiedLinkKey(null), 2500);
  };

  // 🎯 Debounced targeted fetch handlers for real-time events (300ms delay)
  const debouncedSyncStoreAndSubscription = useMemo(
    () =>
      debounce((storeId: string) => {
        LoyaltyService.resolveStore(storeId, true).then((s) => {
          if (s) {
            setStore(s);
            LoyaltyService.checkAndUpdateStoreSubscription(storeId, s).then(setSubscriptionInfo);
          }
        });
      }, 300),
    []
  );

  const debouncedSyncCoupons = useMemo(
    () =>
      debounce((storeId: string) => {
        LoyaltyService.getAllStoreCoupons(storeId).then(setCoupons);
        LoyaltyService.getAuditLogs(storeId).then(setAuditLogs);
      }, 300),
    []
  );

  const debouncedSyncPointsAndCustomers = useMemo(
    () =>
      debounce((storeId: string) => {
        LoyaltyService.getAuditLogs(storeId).then(setAuditLogs);
        LoyaltyService.getAllCustomers(storeId).then(setCustomers);
        LoyaltyService.getStoreWallet(storeId).then(setStoreWallet);
      }, 300),
    []
  );

  // Sync state if initialStore prop updates from parent
  useEffect(() => {
    if (initialStore) {
      setStore(initialStore);
    }
  }, [initialStore]);

  // Dynamic Page Document Title Isolation
  useEffect(() => {
    document.title = store?.name || 'لوحة التاجر';
  }, [store?.name]);

  useEffect(() => {
    if (currentStore?.id) {
      const session = LoyaltyService.getStaffSession(currentStore.id, 'admin', currentStore.slug);
      setAuthenticatedAdmin(session);
    }
  }, [currentStore?.id, currentStore?.slug]);

  useEffect(() => {
    if (!currentStore?.id || !authenticatedAdmin) return;
    loadAdminData();

    const unsubscribe = LoyaltyEvents.listen((event) => {
      if (event.storeId === currentStore.id || event.storeId === currentStore.slug) {
        // 🎯 Targeted refetching only:
        if (event.type === 'SUBSCRIPTION_UPDATED' || event.type === 'PAYMENT_COMPLETED' || event.type === 'STORE_UPDATED') {
          debouncedSyncStoreAndSubscription(currentStore.id);
          return;
        }

        if (event.type === 'COUPON_PURCHASED' || event.type === 'COUPON_REDEEMED') {
          debouncedSyncCoupons(currentStore.id);
          return;
        }

        if (event.type === 'POINTS_ADDED' || event.type === 'REWARD_REDEEMED' || event.type === 'WALLET_UPDATED') {
          debouncedSyncPointsAndCustomers(currentStore.id);
          return;
        }

        if (event.type === 'PRIVILEGES_UPDATED') {
          LoyaltyService.getPrivileges(currentStore.id).then(setPrivileges);
          return;
        }

        if (event.type === 'CUSTOMER_UPDATED') {
          LoyaltyService.getAllCustomers(currentStore.id).then(setCustomers);
          return;
        }

        if (event.type === 'STAFF_UPDATED') {
          LoyaltyService.getStoreStaff(currentStore.id).then(setStaffList);
          return;
        }
      }
    });

    return () => {
      unsubscribe();
      debouncedSyncStoreAndSubscription.cancel();
      debouncedSyncCoupons.cancel();
      debouncedSyncPointsAndCustomers.cancel();
    };
  }, [currentStore?.id, debouncedSyncStoreAndSubscription, debouncedSyncCoupons, debouncedSyncPointsAndCustomers]);

  const loadAdminData = async () => {
    if (!currentStore?.id) return;
    setLoading(true);
    LoyaltyService.getAllSubscriptionPlans().then((freshPlans) => {
      if (freshPlans && freshPlans.length > 0) setAllPlans(freshPlans);
    }).catch(() => {});

    try {
      const [s, c, a, t, staff, p, cpn, wallet, invs, subInfo, cat, specs, cats, mods, bks] = await Promise.all([
        LoyaltyService.resolveStore(currentStore.id),
        LoyaltyService.getAllCustomers(currentStore.id),
        LoyaltyService.getAuditLogs(currentStore.id),
        LoyaltyService.getTiers(currentStore.id),
        LoyaltyService.getStoreStaff(currentStore.id),
        LoyaltyService.getPrivileges(currentStore.id),
        LoyaltyService.getAllStoreCoupons(currentStore.id),
        LoyaltyService.getStoreWallet(currentStore.id),
        LoyaltyService.getStoreInvoices(currentStore.id),
        LoyaltyService.checkAndUpdateStoreSubscription(currentStore.id),
        LoyaltyService.getCatalogItems(currentStore.id),
        LoyaltyService.getStoreSpecialists(currentStore.id),
        LoyaltyService.getGlobalCategories(currentStore.id),
        LoyaltyService.getGlobalModifierGroups(currentStore.id),
        LoyaltyService.getStoreBookings(currentStore.id),
      ]);
      const activeStore = normalizeStore(s || currentStore);
      setStore(activeStore);
      setSpecialists(specs || []);
      setGlobalCategories(cats || []);
      setGlobalModifierGroups(mods || []);
      setBookings(bks || []);
      setStoreName(activeStore.name || '');
      setStoreSlug(activeStore.slug || '');
      setCustomDomain(activeStore.custom_domain || '');
      setManagerName(activeStore.manager_name || '');
      setManagerContact(activeStore.manager_contact || '');
      setPrimaryColor(activeStore.primary_color || '#0F172A');
      setSecondaryColor(activeStore.secondary_color || '#F59E0B');
      setPointsPerRiyal(activeStore.points_per_riyal || 1.0);
      setStoreLogoUrl(activeStore.logo_url || '');
      setSliderImages(activeStore.slider_images || []);
      setWelcomeGiftType(activeStore.welcome_gift_type || 'POINTS');
      setWelcomePoints(activeStore.welcome_points ?? 50);
      setWelcomeOfferTitle(activeStore.welcome_offer_title || '');
      setAdminPinCode(activeStore.admin_pin || '9999');
      setMaxCashierInvoiceAmount(activeStore.max_cashier_invoice_amount ?? 500);
      setCatalogEnabled(activeStore.catalog_enabled ?? true);
      if (activeStore.fulfillment_settings) {
        setAllowDineIn(activeStore.fulfillment_settings.allow_dine_in ?? true);
        setAllowTakeaway(activeStore.fulfillment_settings.allow_takeaway ?? true);
        setAllowDelivery(activeStore.fulfillment_settings.allow_delivery ?? true);
        setDeliveryFee(activeStore.fulfillment_settings.delivery_fee ?? 15);
        setAllowServiceBooking(activeStore.fulfillment_settings.allow_service_booking ?? true);
      }
      setCatalogItems(cat || []);
      setCustomers(c);
      setAuditLogs(a);
      setTiers(t.sort((t1, t2) => t1.required_xp - t2.required_xp));
      setStaffList(staff);
      setPrivileges(p);
      setCoupons(cpn);
      setStoreWallet(wallet);
      setInvoices(invs);
      setSubscriptionInfo(subInfo);
      if (wallet) {
        setWhatsappProvider(wallet.whatsapp_provider || 'direct');
        setMetaPhoneNumberId(wallet.meta_phone_number_id || '');
        setMetaWabaId(wallet.meta_waba_id || '');
        setMetaAccessToken(wallet.meta_access_token || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 💳 SaaS Subscription Payment Handlers (Sandbox & Live)
  // ==========================================
  const handlePaySetupFee = (_paymentMethod: string = 'mada') => {
    setSandboxPaymentConfig({
      isOpen: true,
      title: 'سداد رسوم التأسيس واشتراك المتجر',
      itemDescription: 'رسوم تأسيس المتجر + اشتراك الشهر الأول مجاناً 🎁',
      amount: 500,
      invoiceType: 'setup',
    });
  };

  const handlePayRenewal = (_paymentMethod: string = 'mada') => {
    setSandboxPaymentConfig({
      isOpen: true,
      title: 'تجديد اشتراك المتجر الشهري',
      itemDescription: 'تجديد باقة المتجر (+30 يوماً إضافية)',
      amount: subscriptionInfo?.renewalAmount || 195,
      invoiceType: 'renewal',
    });
  };

  const handleUpgradePlan = (plan: BillingPlan) => {
    const isPaid = Boolean(
      resolveUnifiedStage(store).isPaidActive ||
        getStoreUnifiedStage(store) === 'مشترك مدفوع' ||
        store.setup_fee_paid === true
    );

    const currentPlan = isPaid
      ? allPlans.find(
          (p) =>
            (p.id && (p.id === (store as any).subscription_plan_id || p.id === (store as any).plan_id)) ||
            (p.code && (p.code === (store as any).plan_code || p.code === (store as any).plan_id)) ||
            (p.name && (store as any).subscription_plan && (p.name === (store as any).subscription_plan || (store as any).subscription_plan.includes(p.name) || p.name.includes((store as any).subscription_plan))) ||
            (p.amount && (store as any).renewal_amount && p.amount === (store as any).renewal_amount)
        ) || (allPlans.length > 0 ? allPlans[0] : null)
      : null;

    // 🛡️ صمام أمان حتمي: منع ترقية المتجر إلى باقته الحالية أو أي باقة سابقة/أدنى سعراً
    if (isPaid && currentPlan) {
      const isCurrent =
        (plan.id && (plan.id === currentPlan.id || plan.id === (store as any).subscription_plan_id)) ||
        (plan.code && (plan.code === currentPlan.code || plan.code === (store as any).plan_code)) ||
        plan.name === currentPlan.name;
      if (isCurrent || plan.amount <= currentPlan.amount) {
        return;
      }
    }

    const proration = currentPlan
      ? LoyaltyService.calculateProratedUpgrade(store, currentPlan, plan)
      : null;

    const finalAmount = proration && proration.hasProrationDiscount ? proration.netUpgradeAmount : plan.amount;
    const desc = proration && proration.hasProrationDiscount
      ? `ترقية إلى "${plan.name}" ودفع فرق الباقة (${proration.netUpgradeAmount.toLocaleString()} ر.س مع خصم ${proration.unusedCredit.toLocaleString()} ر.س قيمة الباقة السابقة)`
      : `تفعيل باقة "${plan.name}" ومميزاتها المتقدمة`;

    setSandboxPaymentConfig({
      isOpen: true,
      title: `ترقية باقة المتجر إلى ${plan.name}`,
      itemDescription: desc,
      amount: finalAmount,
      invoiceType: 'upgrade',
      planId: plan.id || plan.code,
    });
  };

  const handleNavigateToBilling = () => {
    setActiveTab('settings');
    setSettingsSection('billing');
    setTimeout(() => {
      const target =
        document.getElementById('merchant-billing-packages') ||
        document.getElementById('merchant-billing-root');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  };

  const handleProcessSandboxPayment = async (details: {
    paymentMethod: 'mada' | 'visa' | 'mastercard' | 'credit_card';
    cardNumber: string;
    cardholderName: string;
    expiryDate: string;
    cvv: string;
  }) => {
    if (!sandboxPaymentConfig) return;
    setIsPayingSetup(true);
    setIsPayingRenewal(true);
    try {
      const res = await LoyaltyService.processSubscriptionPayment({
        storeId: store.id,
        invoiceType: sandboxPaymentConfig.invoiceType,
        amount: sandboxPaymentConfig.amount,
        paymentMethod: details.paymentMethod,
        gateway: 'sandbox',
        planId: sandboxPaymentConfig.planId,
      });

      // 1. مزامنة الحالة المعتمدة مباشرة بالسطر المؤكد من قاعدة البيانات
      setStore(res.store);
      setSandboxPaymentConfig(null);
      setPaymentSuccessModal(res.invoice);

      // 2. تحديث مؤشرات الاشتراك استناداً للسجل المؤكد
      const sub = await LoyaltyService.checkAndUpdateStoreSubscription(res.store.id, res.store);
      setSubscriptionInfo(sub);

      const invs = await LoyaltyService.getStoreInvoices(res.store.id);
      setInvoices(invs);

      // 3. إعادة تحميل البيانات الشاملة من قاعدة البيانات للتحقق التام
      await loadAdminData();

      confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
    } catch (err: any) {
      console.error('Sandbox payment error:', err);
      throw err;
    } finally {
      setIsPayingSetup(false);
      setIsPayingRenewal(false);
    }
  };

  const handleSimulateSubscription = async (
    state: 'trial_active' | 'trial_expired' | 'active_sub' | 'expiring_soon' | 'suspended'
  ) => {
    setIsSimulatingState(true);
    try {
      const updated = await LoyaltyService.simulateSubscriptionState(store.id, state);
      setStore(updated);
      const sub = await LoyaltyService.checkAndUpdateStoreSubscription(store.id);
      setSubscriptionInfo(sub);
      const stateLabels: Record<string, string> = {
        trial_active: 'فترة تجريبية نشطة (متبقي 5 أيام)',
        trial_expired: 'انتهت الفترة التجريبية (شاشة تأسيس 500 ر.س)',
        active_sub: 'اشتراك شهري نشط (متبقي 20 يوماً)',
        expiring_soon: 'اقتراب موعد التجديد (متبقي يومان - تنبيه 195 ر.س)',
        suspended: 'تعليق المتجر لانتهاء الاشتراك (شاشة حجب 195 ر.س)',
      };
      setSimulationNotice(`تم تحويل حالة المتجر بنجاح إلى: [${stateLabels[state]}]`);
      setTimeout(() => setSimulationNotice(null), 4500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSimulatingState(false);
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    try {
      const result = await compressImage(file, 400, 400, 0.8);
      setStoreLogoUrl(result.dataUrl);
      setLogoStats(result);
    } catch (err) {
      console.error('Failed to compress image:', err);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSlideFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSlideCompressing(true);
    try {
      const result = await compressImage(file, 600, 600, 0.85);
      setNewSlideImageUrl(result.dataUrl);
    } catch (err) {
      console.error('Failed to compress slide image:', err);
    } finally {
      setIsSlideCompressing(false);
    }
  };

  const handleAddSlide = async () => {
    if (!newSlideImageUrl.trim()) return;
    const newSlide: StoreBanner = {
      id: 'slide-' + Date.now(),
      image_url: newSlideImageUrl.trim(),
      title: newSlideTitle.trim() || storeName || undefined,
      quote: newSlideQuote.trim() || undefined,
      badge_text: newSlideBadge.trim() || undefined,
    };
    const currentList = Array.isArray(sliderImages) ? sliderImages : [];
    const updatedList = [...currentList, newSlide];
    setSliderImages(updatedList);
    setNewSlideImageUrl('');
    setNewSlideTitle('');
    setNewSlideQuote('');
    setNewSlideBadge('');

    try {
      await LoyaltyService.updateStoreSettings(store.id, {
        slider_images: updatedList,
      });
      LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: store.id });
    } catch (err) {
      console.warn('Failed to auto-save slide addition:', err);
    }
  };

  const handleDeleteSlide = async (index: number) => {
    const currentList = Array.isArray(sliderImages) ? sliderImages : [];
    const updatedList = currentList.filter((_, i) => i !== index);
    setSliderImages(updatedList);

    try {
      await LoyaltyService.updateStoreSettings(store.id, {
        slider_images: updatedList,
      });
      LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: store.id });
    } catch (err) {
      console.warn('Failed to auto-save slide deletion:', err);
    }
  };

  const handleSaveLoyaltySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pointsPerRiyal <= 0 || !storeName.trim() || !storeSlug.trim()) return;

    setUpdatingSettings(true);
    setSettingsSavedMessage(null);

    try {
      const updated = await LoyaltyService.updateStoreSettings(store.id, {
        name: storeName.trim(),
        slug: storeSlug.toLowerCase().trim(),
        custom_domain: customDomain.trim() ? customDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') : null,
        manager_name: managerName.trim() || store.manager_name,
        manager_contact: managerContact.trim() || store.manager_contact,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        points_per_riyal: Number(pointsPerRiyal),
        logo_url: storeLogoUrl,
        slider_images: sliderImages,
        welcome_gift_type: welcomeGiftType,
        welcome_points: welcomePoints === '' ? 0 : Number(welcomePoints),
        welcome_offer_title: welcomeOfferTitle.trim(),
        max_cashier_invoice_amount: maxCashierInvoiceAmount === '' ? 500 : Number(maxCashierInvoiceAmount),
        admin_pin: adminPinCode.trim() || '9999',
        catalog_enabled: catalogEnabled,
        fulfillment_settings: {
          allow_dine_in: allowDineIn,
          allow_takeaway: allowTakeaway,
          allow_delivery: allowDelivery,
          delivery_fee: deliveryFee === '' ? 0 : Number(deliveryFee),
          allow_service_booking: allowServiceBooking,
          booking_notice_minutes: 30,
        },
      });

      // Synchronize Admin staff record PIN if exists
      const adminStaff = staffList.find((s) => s.role === 'admin');
      if (adminStaff && adminPinCode.trim() && adminStaff.pin_code !== adminPinCode.trim()) {
        await LoyaltyService.updateStoreStaff(adminStaff.id, { pin_code: adminPinCode.trim() });
        setStaffList(
          staffList.map((s) => (s.id === adminStaff.id ? { ...s, pin_code: adminPinCode.trim() } : s))
        );
      }

      setStore(updated);
      LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: store.id });
      setSettingsSavedMessage(
        `تم بنجاح حفظ وتحديث هوية وإعدادات المتجر والدومين (${updated.name})`
      );
      setTimeout(() => setSettingsSavedMessage(null), 4500);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingSettings(false);
    }
  };

  // ==========================================
  // 🛍️ إدارة قائمة المنتجات والخدمات (Products & Services Handlers)
  // ==========================================
  const handleOpenAddProduct = () => {
    const defaultProductCat = globalCategories.find((c) => c.type === 'product')?.name || 'وجبات رئيسية';
    setEditingCatalogItem(null);
    setCatNameInput('');
    setCatDescInput('');
    setCatCategoryInput(defaultProductCat);
    setCatPriceInput('');
    setCatItemTypeInput('product');
    setCatDurationInput('');
    setCatImageUrlInput('');
    setCatModifierGroups([]);
    setCatIsAvailable(true);
    setShowInlineCatAdder(false);
    setInlineCatNameInput('');
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (item: CatalogItem) => {
    setEditingCatalogItem(item);
    setCatNameInput(item.name);
    setCatDescInput(item.description || '');
    setCatCategoryInput(item.category || '');
    setCatPriceInput(item.price);
    setCatItemTypeInput('product');
    setCatDurationInput('');
    setCatImageUrlInput(item.image_url || '');
    setCatModifierGroups(item.modifier_groups || []);
    setCatIsAvailable(item.is_available !== false);
    setShowInlineCatAdder(false);
    setInlineCatNameInput('');
    setIsProductModalOpen(true);
  };

  const handleOpenAddService = () => {
    const defaultServiceCat = globalCategories.find((c) => c.type === 'service')?.name || 'خدمات عامة';
    setEditingCatalogItem(null);
    setCatNameInput('');
    setCatDescInput('');
    setCatCategoryInput(defaultServiceCat);
    setCatPriceInput('');
    setCatItemTypeInput('service');
    setCatDurationInput(30);
    setCatImageUrlInput('');
    setCatModifierGroups([]);
    setCatIsAvailable(true);
    setShowInlineCatAdder(false);
    setInlineCatNameInput('');
    setIsServiceModalOpen(true);
  };

  const handleOpenEditService = (item: CatalogItem) => {
    setEditingCatalogItem(item);
    setCatNameInput(item.name);
    setCatDescInput(item.description || '');
    setCatCategoryInput(item.category || '');
    setCatPriceInput(item.price);
    setCatItemTypeInput('service');
    setCatDurationInput(item.duration_minutes || 30);
    setCatImageUrlInput(item.image_url || '');
    setCatModifierGroups(item.modifier_groups || []);
    setCatIsAvailable(item.is_available !== false);
    setShowInlineCatAdder(false);
    setInlineCatNameInput('');
    setIsServiceModalOpen(true);
  };

  const handleQuickAddInlineCategory = async (type: 'product' | 'service') => {
    if (!inlineCatNameInput.trim()) return;
    try {
      const created = await LoyaltyService.addGlobalCategory({
        store_id: store.id,
        name: inlineCatNameInput.trim(),
        type: type,
        sort_order: globalCategories.length + 1,
      });
      setGlobalCategories([...globalCategories, created]);
      setCatCategoryInput(created.name);
      setInlineCatNameInput('');
      setShowInlineCatAdder(false);
    } catch (e) {
      console.error('Failed to add category inline:', e);
    }
  };

  const handleSaveProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameInput.trim() || catPriceInput === '') return;

    try {
      if (editingCatalogItem) {
        const updated = await LoyaltyService.updateCatalogItem(editingCatalogItem.id, {
          name: catNameInput.trim(),
          description: catDescInput.trim() || null,
          category: catCategoryInput.trim() || 'عام',
          price: Number(catPriceInput),
          item_type: 'product',
          duration_minutes: undefined,
          image_url: catImageUrlInput.trim() || null,
          modifier_groups: catModifierGroups,
          is_available: catIsAvailable,
        });
        setCatalogItems(catalogItems.map((it) => (it.id === editingCatalogItem.id ? updated : it)));
        setCatalogActionSuccess(`تم بنجاح تحديث المنتج: "${updated.name}" 🍔`);
      } else {
        const created = await LoyaltyService.addCatalogItem({
          store_id: store.id,
          name: catNameInput.trim(),
          description: catDescInput.trim() || null,
          category: catCategoryInput.trim() || 'عام',
          price: Number(catPriceInput),
          item_type: 'product',
          duration_minutes: undefined,
          image_url: catImageUrlInput.trim() || null,
          modifier_groups: catModifierGroups,
          is_available: catIsAvailable,
        });
        setCatalogItems([created, ...catalogItems]);
        setCatalogActionSuccess(`تم بنجاح إضافة المنتج الجديد للمنيو: "${created.name}" 🍔`);
      }
      setIsProductModalOpen(false);
      setTimeout(() => setCatalogActionSuccess(null), 3500);
    } catch (err) {
      console.error('Failed to save product:', err);
    }
  };

  const handleSaveServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameInput.trim() || catPriceInput === '') return;

    try {
      if (editingCatalogItem) {
        const updated = await LoyaltyService.updateCatalogItem(editingCatalogItem.id, {
          name: catNameInput.trim(),
          description: catDescInput.trim() || null,
          category: catCategoryInput.trim() || 'خدمات عامة',
          price: Number(catPriceInput),
          item_type: 'service',
          duration_minutes: Number(catDurationInput || 30),
          image_url: catImageUrlInput.trim() || null,
          modifier_groups: catModifierGroups,
          is_available: catIsAvailable,
        });
        setCatalogItems(catalogItems.map((it) => (it.id === editingCatalogItem.id ? updated : it)));
        setCatalogActionSuccess(`تم بنجاح تحديث الخدمة: "${updated.name}" 💇‍♂️`);
      } else {
        const created = await LoyaltyService.addCatalogItem({
          store_id: store.id,
          name: catNameInput.trim(),
          description: catDescInput.trim() || null,
          category: catCategoryInput.trim() || 'خدمات عامة',
          price: Number(catPriceInput),
          item_type: 'service',
          duration_minutes: Number(catDurationInput || 30),
          image_url: catImageUrlInput.trim() || null,
          modifier_groups: catModifierGroups,
          is_available: catIsAvailable,
        });
        setCatalogItems([created, ...catalogItems]);
        setCatalogActionSuccess(`تم بنجاح إضافة الخدمة الجديدة: "${created.name}" 💇‍♂️`);
      }
      setIsServiceModalOpen(false);
      setTimeout(() => setCatalogActionSuccess(null), 3500);
    } catch (err) {
      console.error('Failed to save service:', err);
    }
  };

  const handleDeleteCatalogItem = async (itemId: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف (${name}) نهائياً؟`)) {
      try {
        await LoyaltyService.deleteCatalogItem(itemId);
        setCatalogItems(catalogItems.filter((it) => it.id !== itemId));
        setCatalogActionSuccess(`تم حذف (${name}) بنجاح`);
        setTimeout(() => setCatalogActionSuccess(null), 3000);
      } catch (err) {
        console.error('Failed to delete catalog item:', err);
      }
    }
  };

  const handleToggleCatalogItemAvailability = async (item: CatalogItem) => {
    try {
      const newStatus = !item.is_available;
      const updated = await LoyaltyService.updateCatalogItem(item.id, { is_available: newStatus });
      setCatalogItems(catalogItems.map((it) => (it.id === item.id ? updated : it)));
    } catch (err) {
      console.error('Failed to toggle availability:', err);
    }
  };

  const handleCatImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCatImageCompressing(true);
    try {
      const result = await compressImage(file, 500, 500, 0.82);
      setCatImageUrlInput(result.dataUrl);
    } catch (err) {
      console.error('Failed to compress catalog image:', err);
    } finally {
      setIsCatImageCompressing(false);
    }
  };

  // Modifiers Group Handlers inside Item Modal
  const handleAddModifierGroup = () => {
    const newGroup: CatalogModifierGroup = {
      id: 'grp-' + Date.now(),
      name: '',
      title: '',
      min_select: 0,
      max_select: 5,
      required: false,
      allow_multiple: true,
      options: [
        { id: 'opt-' + Date.now() + '-1', name: '', price_delta: 0 },
      ],
    };
    setCatModifierGroups([...catModifierGroups, newGroup]);
  };

  const handleRemoveModifierGroup = (groupId: string) => {
    setCatModifierGroups(catModifierGroups.filter((g) => g.id !== groupId));
  };

  const handleToggleGlobalModifierOnItem = (globalMod: GlobalModifierGroup) => {
    const exists = catModifierGroups.some((g) => g.id === globalMod.id || g.name === globalMod.name);
    if (exists) {
      setCatModifierGroups(catModifierGroups.filter((g) => g.id !== globalMod.id && g.name !== globalMod.name));
    } else {
      const converted: CatalogModifierGroup = {
        id: globalMod.id,
        name: globalMod.name,
        title: globalMod.name,
        required: globalMod.required,
        allow_multiple: globalMod.allow_multiple,
        min_select: globalMod.required ? 1 : 0,
        max_select: globalMod.allow_multiple ? 10 : 1,
        options: globalMod.options || [],
      };
      setCatModifierGroups([...catModifierGroups, converted]);
    }
  };

  const handleAddModifierOption = (groupId: string) => {
    setCatModifierGroups(
      catModifierGroups.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          options: [
            ...g.options,
            { id: 'opt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), name: '', price_delta: 0 },
          ],
        };
      })
    );
  };

  const handleRemoveModifierOption = (groupId: string, optionId: string) => {
    setCatModifierGroups(
      catModifierGroups.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          options: g.options.filter((o) => o.id !== optionId),
        };
      })
    );
  };

  // ==========================================
  // 💇‍♂️ إدارة المختصين والعاملين (Specialists Handlers)
  // ==========================================
  const handleSpecAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSpecImageCompressing(true);
    try {
      const result = await compressImage(file, 400, 400, 0.82);
      setSpecAvatarUrlInput(result.dataUrl);
    } catch (err) {
      console.error('Failed to compress specialist avatar image:', err);
    } finally {
      setIsSpecImageCompressing(false);
    }
  };

  const handleOpenAddSpecialist = () => {
    setEditingSpecialist(null);
    setSpecNameInput('');
    setSpecSpecialtyInput('');
    setSpecPhoneInput('');
    setSpecAvatarUrlInput('');
    setSpecCategoriesInput(['ALL']);
    setSpecWorkingDays(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat']);
    setSpecStartTime('10:00');
    setSpecEndTime('22:00');
    setIsSpecialistModalOpen(true);
  };

  const handleOpenEditSpecialist = (spec: StoreSpecialist) => {
    setEditingSpecialist(spec);
    setSpecNameInput(spec.name);
    setSpecSpecialtyInput(spec.specialty || '');
    setSpecPhoneInput(spec.phone || '');
    setSpecAvatarUrlInput(spec.avatar_url || '');
    setSpecCategoriesInput(
      spec.service_categories && spec.service_categories.length > 0 ? spec.service_categories : ['ALL']
    );
    setSpecWorkingDays(spec.working_days || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat']);
    setSpecStartTime(spec.working_hours?.start || '10:00');
    setSpecEndTime(spec.working_hours?.end || '22:00');
    setIsSpecialistModalOpen(true);
  };

  const handleSaveSpecialistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specNameInput.trim()) return;

    try {
      if (editingSpecialist) {
        const updated = await LoyaltyService.updateStoreSpecialist(editingSpecialist.id, {
          name: specNameInput.trim(),
          specialty: specSpecialtyInput.trim() || undefined,
          phone: specPhoneInput.trim() || undefined,
          avatar_url: specAvatarUrlInput.trim() || undefined,
          service_categories: specCategoriesInput,
          working_days: specWorkingDays,
          working_hours: { start: specStartTime, end: specEndTime },
        });
        setSpecialists(specialists.map((s) => (s.id === editingSpecialist.id ? updated : s)));
        setSpecialistActionSuccess(`تم تحديث بيانات المختص: "${updated.name}"`);
      } else {
        const created = await LoyaltyService.addStoreSpecialist({
          store_id: store.id,
          name: specNameInput.trim(),
          specialty: specSpecialtyInput.trim() || undefined,
          phone: specPhoneInput.trim() || undefined,
          avatar_url: specAvatarUrlInput.trim() || undefined,
          service_categories: specCategoriesInput,
          is_active: true,
          working_days: specWorkingDays,
          working_hours: { start: specStartTime, end: specEndTime },
        });
        setSpecialists([created, ...specialists]);
        setSpecialistActionSuccess(`تمت إضافة المختص الجديد: "${created.name}"`);
      }
      setIsSpecialistModalOpen(false);
      setTimeout(() => setSpecialistActionSuccess(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSpecialist = async (specId: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف المختص "${name}"؟`)) {
      try {
        await LoyaltyService.deleteStoreSpecialist(specId);
        setSpecialists(specialists.filter((s) => s.id !== specId));
        setSpecialistActionSuccess(`تم حذف المختص: "${name}"`);
        setTimeout(() => setSpecialistActionSuccess(null), 3000);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleToggleSpecialistActive = async (spec: StoreSpecialist) => {
    try {
      const updated = await LoyaltyService.updateStoreSpecialist(spec.id, { is_active: !spec.is_active });
      setSpecialists(specialists.map((s) => (s.id === spec.id ? updated : s)));
    } catch (err) {
      console.error(err);
    }
  };

  // ==========================================
  // 🏷️ إدارة الأقسام والإضافات المركزية (Global Categories & Modifiers)
  // ==========================================
  const handleOpenAddCategory = (type: 'product' | 'service' = 'product') => {
    setEditingCategory(null);
    setCategoryNameInput('');
    setCategoryTypeInput(type);
    setIsCategoryModalOpen(true);
  };

  const handleOpenEditCategory = (cat: GlobalCategory) => {
    setEditingCategory(cat);
    setCategoryNameInput(cat.name);
    setCategoryTypeInput(cat.type);
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryNameInput.trim()) return;

    try {
      if (editingCategory) {
        const updated = await LoyaltyService.updateGlobalCategory(editingCategory.id, {
          name: categoryNameInput.trim(),
          type: categoryTypeInput,
        });
        setGlobalCategories(globalCategories.map((c) => (c.id === editingCategory.id ? updated : c)));
        setCategoryActionSuccess(`تم تحديث القسم: "${updated.name}"`);
      } else {
        const created = await LoyaltyService.addGlobalCategory({
          store_id: store.id,
          name: categoryNameInput.trim(),
          type: categoryTypeInput,
          sort_order: globalCategories.length + 1,
        });
        setGlobalCategories([...globalCategories, created]);
        setCategoryActionSuccess(`تمت إضافة القسم الجديد: "${created.name}"`);
      }
      setIsCategoryModalOpen(false);
      setTimeout(() => setCategoryActionSuccess(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCategory = async (catId: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف القسم "${name}"؟`)) {
      try {
        await LoyaltyService.deleteGlobalCategory(catId);
        setGlobalCategories(globalCategories.filter((c) => c.id !== catId));
        setCategoryActionSuccess(`تم حذف القسم: "${name}"`);
        setTimeout(() => setCategoryActionSuccess(null), 3000);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleOpenAddModifierGroup = () => {
    setEditingModifierGroup(null);
    setModGroupNameInput('');
    setModGroupTagInput('');
    setModGroupRequired(false);
    setModGroupAllowMultiple(true);
    setModGroupOptions([{ id: 'opt-' + Date.now(), name: '', price_delta: 0 }]);
    setIsModifierGroupModalOpen(true);
  };

  const handleOpenEditModifierGroup = (group: GlobalModifierGroup) => {
    setEditingModifierGroup(group);
    setModGroupNameInput(group.name);
    setModGroupTagInput(group.tag || '');
    setModGroupRequired(group.required);
    setModGroupAllowMultiple(group.allow_multiple);
    setModGroupOptions(group.options || []);
    setIsModifierGroupModalOpen(true);
  };

  const handleSaveModifierGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modGroupNameInput.trim()) return;

    const cleanOptions = modGroupOptions.filter((o) => o.name.trim());
    if (cleanOptions.length === 0) {
      alert('يرجى إضافة خيار واحد على الأقل للمجموعة');
      return;
    }

    try {
      if (editingModifierGroup) {
        const updated = await LoyaltyService.updateGlobalModifierGroup(editingModifierGroup.id, {
          name: modGroupNameInput.trim(),
          tag: modGroupTagInput.trim() || 'extra',
          required: modGroupRequired,
          allow_multiple: modGroupAllowMultiple,
          options: cleanOptions,
        });
        setGlobalModifierGroups(globalModifierGroups.map((g) => (g.id === editingModifierGroup.id ? updated : g)));
        setModifierActionSuccess(`تم تحديث مجموعة الإضافات: "${updated.name}"`);
      } else {
        const created = await LoyaltyService.addGlobalModifierGroup({
          store_id: store.id,
          name: modGroupNameInput.trim(),
          tag: modGroupTagInput.trim() || 'extra',
          required: modGroupRequired,
          allow_multiple: modGroupAllowMultiple,
          options: cleanOptions,
        });
        setGlobalModifierGroups([created, ...globalModifierGroups]);
        setModifierActionSuccess(`تمت إضافة مجموعة الإضافات: "${created.name}"`);
      }
      setIsModifierGroupModalOpen(false);
      setTimeout(() => setModifierActionSuccess(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteModifierGroup = async (groupId: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف مجموعة الإضافات "${name}"؟`)) {
      try {
        await LoyaltyService.deleteGlobalModifierGroup(groupId);
        setGlobalModifierGroups(globalModifierGroups.filter((g) => g.id !== groupId));
        setModifierActionSuccess(`تم حذف مجموعة الإضافات: "${name}"`);
        setTimeout(() => setModifierActionSuccess(null), 3000);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAddOptionToGlobalGroup = () => {
    setModGroupOptions([
      ...modGroupOptions,
      { id: 'opt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), name: '', price_delta: 0 },
    ]);
  };

  const handleRemoveOptionFromGlobalGroup = (optionId: string) => {
    setModGroupOptions(modGroupOptions.filter((o) => o.id !== optionId));
  };

  // ==========================================
  // 📅 إدارة الحجوزات والمواعيد (Bookings Handlers)
  // ==========================================
  const handleUpdateBookingStatus = async (
    bookingId: string,
    newStatus: 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  ) => {
    try {
      const updated = await LoyaltyService.updateServiceBookingStatus(bookingId, newStatus);
      setBookings(bookings.map((b) => (b.id === bookingId ? updated : b)));
      setStatusNotifyBooking({ booking: updated, newStatus });
      const statusLabels: Record<string, string> = {
        confirmed: 'مؤكد ⏳',
        completed: 'مكتمل ✅',
        cancelled: 'ملغي ❌',
        no_show: 'لم يحضر 🏖️',
      };
      setBookingActionSuccess(`تم تغيير حالة الحجز #${updated.booking_number} إلى (${statusLabels[newStatus] || newStatus}) بنجاح`);
      setTimeout(() => setBookingActionSuccess(null), 5000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConnectMetaEmbeddedSignup = () => {
    setWhatsappProvider('meta');
    setMetaPhoneNumberId('109823485729104');
    setMetaWabaId('209847192847192');
    setMetaAccessToken('EAAG...demo_meta_cloud_access_token_radar_live');
    setMetaSavedMessage('تم محاكاة الربط السريع بنجاح عبر Meta Embedded Signup! تم استيراد WABA ID و Phone Number ID.');
    setTimeout(() => setMetaSavedMessage(null), 4500);
  };

  // ==========================================
  // إدارة الرتب (Tiers Handlers)
  // ==========================================
  const handleOpenAddTier = () => {
    setEditingTier(null);
    setTierNameInput('');
    setTierXpInput('');
    setTierBadgeColorInput('#F59E0B');
    setIsTierModalOpen(true);
  };

  const handleOpenEditTier = (t: Tier) => {
    setEditingTier(t);
    setTierNameInput(t.tier_name);
    setTierXpInput(t.required_xp);
    setTierBadgeColorInput(t.badge_color || '#F59E0B');
    setIsTierModalOpen(true);
  };

  const handleSaveTierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierNameInput.trim() || tierXpInput === '') return;

    try {
      if (editingTier) {
        const updated = await LoyaltyService.updateTier(editingTier.id, {
          tier_name: tierNameInput.trim(),
          required_xp: Number(tierXpInput),
          badge_color: tierBadgeColorInput,
        });
        setTiers(
          tiers
            .map((t) => (t.id === editingTier.id ? updated : t))
            .sort((a, b) => a.required_xp - b.required_xp)
        );
        setTierActionSuccess(`تم تحديث الرتبة: "${updated.tier_name}" (${updated.required_xp} XP)`);
      } else {
        const created = await LoyaltyService.addTier({
          store_id: store.id,
          tier_name: tierNameInput.trim(),
          required_xp: Number(tierXpInput),
          badge_color: tierBadgeColorInput,
        });
        const nextTiers = [...tiers, created].sort((a, b) => a.required_xp - b.required_xp);
        setTiers(nextTiers);
        setTierActionSuccess(`تم إضافة الرتبة الجديدة: "${created.tier_name}" (${created.required_xp} XP)`);
      }
      setIsTierModalOpen(false);
      setTimeout(() => setTierActionSuccess(null), 4000);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleDeleteTier = async (tierId: string, tierName: string) => {
    if (confirm(`هل أنت متأكد من حذف رتبة "${tierName}"؟`)) {
      try {
        await LoyaltyService.deleteTier(tierId);
        setTiers(tiers.filter((t) => t.id !== tierId));
        setTierActionSuccess(`تم حذف الرتبة: "${tierName}"`);
        setTimeout(() => setTierActionSuccess(null), 3500);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // ==========================================
  // إدارة الامتيازات والكوبونات (Privileges CRUD Handlers)
  // ==========================================
  const handlePrivFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsPrivCompressing(true);
    try {
      const result = await compressImage(file, 500, 500, 0.82);
      setPrivImageUrl(result.dataUrl);
      setPrivLogoStats(result);
    } catch (err) {
      console.error('Failed to compress privilege image:', err);
    } finally {
      setIsPrivCompressing(false);
    }
  };

  const handleOpenAddPrivilege = () => {
    setEditingPrivilege(null);
    setPrivTitleInput('');
    setPrivDescInput('');
    setPrivRequiredTierId(tiers[0]?.id || '');
    setPrivCostPoints('');
    setPrivQuantityLimit('');
    setPrivPerCustomerLimit('');
    setPrivStartTime('');
    setPrivEndTime('');
    setPrivImageUrl('');
    setPrivLogoStats(null);
    setPrivIsActive(true);
    setPrivIsHidden(false);
    setIsPrivilegeModalOpen(true);
  };

  const handleOpenEditPrivilege = (p: Privilege) => {
    setEditingPrivilege(p);
    setPrivTitleInput(p.title);
    setPrivDescInput(p.description || '');
    setPrivRequiredTierId(p.required_tier_id);
    setPrivCostPoints(p.cost_points ?? 50);
    setPrivQuantityLimit(p.quantity_limit ?? '');
    setPrivPerCustomerLimit(p.per_customer_limit ?? '');
    setPrivStartTime(p.valid_start_time || '');
    setPrivEndTime(p.valid_end_time || '');
    setPrivImageUrl(p.image_url || '');
    setPrivLogoStats(null);
    setPrivIsActive(p.is_active);
    setPrivIsHidden(p.is_hidden || false);
    setIsPrivilegeModalOpen(true);
  };

  const handleSavePrivilegeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privTitleInput.trim() || privCostPoints === '') return;

    try {
      if (editingPrivilege) {
        const updated = await LoyaltyService.updatePrivilege(editingPrivilege.id, {
          title: privTitleInput.trim(),
          description: privDescInput.trim() || null,
          required_tier_id: privRequiredTierId || tiers[0]?.id,
          cost_points: Number(privCostPoints),
          quantity_limit: privQuantityLimit === '' ? null : Number(privQuantityLimit),
          per_customer_limit: privPerCustomerLimit === '' ? null : Number(privPerCustomerLimit),
          valid_start_time: privStartTime.trim() || null,
          valid_end_time: privEndTime.trim() || null,
          image_url: privImageUrl.trim() || null,
          is_active: privIsActive,
          is_hidden: privIsHidden,
        });
        setPrivileges(privileges.map((p) => (p.id === editingPrivilege.id ? updated : p)));
        setPrivActionSuccess(`تم تحديث الامتياز: "${updated.title}"`);
      } else {
        const created = await LoyaltyService.createPrivilege({
          store_id: store.id,
          title: privTitleInput.trim(),
          description: privDescInput.trim() || null,
          required_tier_id: privRequiredTierId || tiers[0]?.id,
          cost_points: Number(privCostPoints),
          quantity_limit: privQuantityLimit === '' ? null : Number(privQuantityLimit),
          per_customer_limit: privPerCustomerLimit === '' ? null : Number(privPerCustomerLimit),
          redeemed_count: 0,
          valid_start_time: privStartTime.trim() || null,
          valid_end_time: privEndTime.trim() || null,
          image_url: privImageUrl.trim() || null,
          is_active: privIsActive,
          is_hidden: privIsHidden,
        });
        setPrivileges([created, ...privileges]);
        setPrivActionSuccess(`تم إضافة الامتياز الجديد: "${created.title}"`);
      }
      setIsPrivilegeModalOpen(false);
      setTimeout(() => setPrivActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePrivilege = async (id: string, title: string) => {
    if (confirm(`هل أنت متأكد من حذف الامتياز "${title}"؟`)) {
      try {
        await LoyaltyService.deletePrivilege(id);
        setPrivileges(privileges.filter((p) => p.id !== id));
        setPrivActionSuccess(`تم حذف الامتياز: "${title}"`);
        setTimeout(() => setPrivActionSuccess(null), 3500);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleTogglePrivilegeActive = async (p: Privilege) => {
    try {
      const newStatus = await LoyaltyService.togglePrivilegeActive(p.id, p.is_active);
      setPrivileges(privileges.map((item) => (item.id === p.id ? { ...item, is_active: newStatus } : item)));
      setPrivActionSuccess(newStatus ? `تم تفعيل "${p.title}"` : `تم إيقاف "${p.title}"`);
      setTimeout(() => setPrivActionSuccess(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePrivilegeHidden = async (p: Privilege) => {
    try {
      const newHidden = await LoyaltyService.togglePrivilegeHidden(p.id, p.is_hidden);
      setPrivileges(privileges.map((item) => (item.id === p.id ? { ...item, is_hidden: newHidden } : item)));
      setPrivActionSuccess(newHidden ? `تم إخفاء "${p.title}" عن العملاء` : `تم إظهار "${p.title}" للعملاء`);
      setTimeout(() => setPrivActionSuccess(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  // ==========================================
  // إدارة العملاء (Customer CRM Handlers)
  // ==========================================
  const handleToggleCustomerActive = async (cust: Customer) => {
    try {
      const currentActive = cust.is_active !== false;
      const newStatus = await LoyaltyService.toggleCustomerActive(cust.id, currentActive);
      setCustomers(customers.map((c) => (c.id === cust.id ? { ...c, is_active: newStatus } : c)));
      setCustomerActionSuccess(
        newStatus
          ? `تم تنشيط حساب (${cust.name || cust.phone}) بنجاح.`
          : `تم إيقاف حساب (${cust.name || cust.phone}) مؤقتاً.`
      );
      setTimeout(() => setCustomerActionSuccess(null), 3500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenEditCustomer = (cust: Customer) => {
    setEditingCustomer(cust);
    setEditCustomerName(cust.name || '');
    setEditCustomerPhone(cust.phone || '');
    setIsEditCustomerOpen(true);
  };

  const handleSaveCustomerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    try {
      const updated = await LoyaltyService.updateCustomer(editingCustomer.id, {
        name: editCustomerName.trim() || null,
        phone: editCustomerPhone.trim() || editingCustomer.phone,
      });
      setCustomers(customers.map((c) => (c.id === editingCustomer.id ? { ...c, ...updated } : c)));
      setCustomerActionSuccess(`تم تحديث بيانات العميل: ${updated.name || updated.phone}`);
      setIsEditCustomerOpen(false);
      setTimeout(() => setCustomerActionSuccess(null), 3500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenAdjustPoints = (cust: Customer) => {
    setSelectedCustomerForAdjust(cust);
    setAdjustPointsDelta('');
    setAdjustPointsReason('مكافأة ولاء خاصة');
    setIsAdjustPointsOpen(true);
  };

  const handleAdjustPointsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForAdjust || adjustPointsDelta === '') return;

    try {
      const delta = Number(adjustPointsDelta);
      const updated = await LoyaltyService.adjustCustomerPoints(
        store.id,
        selectedCustomerForAdjust.id,
        delta,
        adjustPointsReason,
        authenticatedAdmin?.name || 'مدير المتجر'
      );
      setCustomers(customers.map((c) => (c.id === selectedCustomerForAdjust.id ? { ...c, ...updated } : c)));
      const updatedLogs = await LoyaltyService.getAuditLogs(store.id);
      setAuditLogs(updatedLogs);
      setCustomerActionSuccess(
        `تم ${delta >= 0 ? `إضافة +${delta}` : `خصم ${delta}`} نقطة لحساب ${
          selectedCustomerForAdjust.name || selectedCustomerForAdjust.phone
        }`
      );
      setIsAdjustPointsOpen(false);
      setTimeout(() => setCustomerActionSuccess(null), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCustomerDirectWhatsApp = (cust: Customer) => {
    const tierName =
      tiers
        .filter((t) => t.required_xp <= cust.lifetime_xp)
        .sort((a, b) => b.required_xp - a.required_xp)[0]?.tier_name || 'ضيف';

    const text = encodeURIComponent(
      `أهلاً بك يا ${cust.name || 'عميلنا العزيز'}! 🌟\nيسعدنا تواصلك مع ${store.name}.\nرصيدك الحالي هو: ${cust.wallet_balance} نقطة (مكانتك: ${tierName}).\nنسعد بزيارتك القادمة للاستمتاع بحصرياتك وامتيازاتك ✨`
    );
    const cleanPhone = cust.phone.replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;
    window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank');
  };

  const handleExportCustomersCSV = () => {
    const headers = ['الاسم', 'رقم الجوال', 'الرتبة', 'رصيد المحفظة', 'النقاط التراكمية XP', 'آخر زيارة', 'الحالة'];
    const rows = customers.map((c) => {
      const custTier =
        tiers
          .filter((t) => t.required_xp <= c.lifetime_xp)
          .sort((a, b) => b.required_xp - a.required_xp)[0]?.tier_name || 'ضيف';
      return [
        `"${c.name || 'غير مسجل'}"`,
        `"${c.phone}"`,
        `"${custTier}"`,
        c.wallet_balance,
        c.lifetime_xp,
        c.last_visit_date ? new Date(c.last_visit_date).toLocaleDateString('ar-SA') : 'جديد',
        c.is_active !== false ? 'نشط' : 'موقوف',
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${store.slug}_customers_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportAuditLogsCSV = () => {
    const headers = [
      'رقم العملية',
      'التاريخ والوقت',
      'نوع الحركة',
      'اسم العميل',
      'رقم الجوال',
      'الكاشير المسؤول',
      'طريقة الإدخال',
      'قيمة المشتريات (ر.س)',
      'النقاط المعدلة (XP)',
      'ملاحظات وبيانات إضافية',
    ];
    const rows = auditLogs.map((log) => {
      const isManual = log.metadata?.entry_method === 'manual_phone' || log.metadata?.note?.includes('يدوي');
      const actionLabel =
        log.action === 'PURCHASE'
          ? 'منح نقاط مشتريات'
          : log.action === 'PURCHASE_COUPON'
          ? 'شراء كوبون بالمحفظة'
          : log.action === 'REDEEM_COUPON' || log.action === 'REDEEM_REWARD'
          ? 'صرف وتسليم مكافأة'
          : log.action === 'ADJUSTMENT'
          ? 'تعديل إداري'
          : log.action;

      return [
        `"${log.id.slice(0, 8)}"`,
        `"${new Date(log.created_at).toLocaleString('ar-SA')}"`,
        `"${actionLabel}"`,
        `"${log.customer_name || 'غير مسجل'}"`,
        `"${log.customer_phone || ''}"`,
        `"${log.metadata?.cashier_name || 'النظام'}"`,
        `"${isManual ? 'إدخال يدوي' : 'مسح باركود كاميرا'}"`,
        log.purchase_amount ?? 0,
        log.points_changed,
        `"${(log.metadata?.note || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${store.slug}_transactions_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================
  // إدارة الموظفين والصلاحيات (Staff Handlers & Quotas)
  // ==========================================
  const activeCashiersCount = staffList.filter((s) => s.role === 'cashier').length;
  const maxCashiersAllowed = (storeWallet?.cashier_limit || 2) + (storeWallet?.extra_cashiers_purchased || 0);
  const isCashierLimitReached = activeCashiersCount >= maxCashiersAllowed;

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffPhone.trim() || !newStaffPin.trim()) return;

    // 1️⃣ فحص حد الكاشير وإظهار نافذة الدفع (Paywall) عند محاولة إضافة كاشير ثالث
    if (newStaffRole === 'cashier' && isCashierLimitReached) {
      setIsAddStaffOpen(false);
      setIsCashierPaywallOpen(true);
      return;
    }

    try {
      const created = await LoyaltyService.addStoreStaff({
        store_id: store.id,
        name: newStaffName.trim(),
        phone: newStaffPhone.trim(),
        role: newStaffRole,
        pin_code: newStaffPin.trim(),
        can_manual_input_phone: newStaffRole === 'admin' ? true : newStaffCanManual,
        is_active: true,
      });

      setStaffList([...staffList, created]);
      setIsAddStaffOpen(false);
      setNewStaffName('');
      setNewStaffPhone('');
      setNewStaffPin('1234');
      setNewStaffCanManual(false);
      setStaffActionSuccess(`تم إضافة الموظف: "${created.name}"`);
      setTimeout(() => setStaffActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  // ترقية سعة الكاشير عبر نافذة الدفع (Paywall Sandbox Upgrade)
  const handlePurchaseExtraCashier = async () => {
    setIsProcessingUpgrade(true);
    try {
      const updatedWallet = await LoyaltyService.purchaseExtraCashier(store.id, 1);
      setStoreWallet(updatedWallet);
      setIsCashierPaywallOpen(false);
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#F59E0B', '#10B981', '#3B82F6', '#EC4899'],
      });
      setStaffActionSuccess('🎉 تمت ترقية سعة الكاشير بنجاح (+1 نقطة بيع إضافية)! يمكنك الآن إضافة موظف كاشير جديد.');
      setIsAddStaffOpen(true);
      setTimeout(() => setStaffActionSuccess(null), 5000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessingUpgrade(false);
    }
  };

  // 2️⃣ تبديل صلاحية الإدخال اليدوي مع التحذير الأمني الصارم
  const handleToggleStaffManualPermission = async (staff: StoreStaff) => {
    if (!staff.can_manual_input_phone) {
      // محاولة تفعيل الإدخال اليدوي -> فتح نافذة التحذير الأمني الصارم
      setSecurityWarningStaff(staff);
    } else {
      // إلغاء الاستثناء والعودة للمسح الإجباري بالكاميرا
      try {
        await LoyaltyService.updateStoreStaff(staff.id, { can_manual_input_phone: false });
        setStaffList(staffList.map((s) => (s.id === staff.id ? { ...s, can_manual_input_phone: false } : s)));
        setStaffActionSuccess(`تم تفعيل المسح الإجباري بالكاميرا 🔒 للموظف: ${staff.name}`);
        setTimeout(() => setStaffActionSuccess(null), 3500);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // تأكيد منح استثناء الإدخال اليدوي بعد قراءة التحذير
  const handleConfirmGrantManualPermission = async () => {
    if (!securityWarningStaff) return;
    try {
      await LoyaltyService.updateStoreStaff(securityWarningStaff.id, { can_manual_input_phone: true });
      setStaffList(
        staffList.map((s) =>
          s.id === securityWarningStaff.id ? { ...s, can_manual_input_phone: true } : s
        )
      );
      setStaffActionSuccess(`تم منح استثناء الإدخال اليدوي للموظف: ${securityWarningStaff.name}`);
      setSecurityWarningStaff(null);
      setTimeout(() => setStaffActionSuccess(null), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleStaffStatus = async (staff: StoreStaff) => {
    try {
      const newStatus = !staff.is_active;
      await LoyaltyService.updateStoreStaff(staff.id, { is_active: newStatus });
      setStaffList(staffList.map((s) => (s.id === staff.id ? { ...s, is_active: newStatus } : s)));
      setStaffActionSuccess(newStatus ? `تم تنشيط حساب ${staff.name}` : `تم إيقاف حساب ${staff.name}`);
      setTimeout(() => setStaffActionSuccess(null), 3500);
    } catch (e) {
      console.error(e);
    }
  };

  // فتح نافذة تعديل الرقم السري لأي موظف
  const handleOpenEditStaffPin = (staff: StoreStaff) => {
    setEditingStaffForPin(staff);
    setEditStaffPinValue(staff.pin_code || '1234');
    setIsEditStaffPinModalOpen(true);
  };

  // حفظ الرقم السري الجديد للموظف
  const handleSaveStaffPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffForPin || !editStaffPinValue.trim()) return;
    try {
      const cleanPin = editStaffPinValue.trim();
      await LoyaltyService.updateStoreStaff(editingStaffForPin.id, {
        pin_code: cleanPin,
      });
      if (editingStaffForPin.role === 'admin') {
        setAdminPinCode(cleanPin);
        setStore((prev) => ({ ...prev, admin_pin: cleanPin }));
      }
      setStaffList(
        staffList.map((s) =>
          s.id === editingStaffForPin.id ? { ...s, pin_code: cleanPin } : s
        )
      );
      setStaffActionSuccess(`تم بنجاح تحديث الرقم السري للموظف (${editingStaffForPin.name}) إلى [${cleanPin}]`);
      setIsEditStaffPinModalOpen(false);
      setEditingStaffForPin(null);
      setTimeout(() => setStaffActionSuccess(null), 3500);
    } catch (err) {
      console.error('Failed to update staff PIN:', err);
    }
  };

  const handleDeleteStaff = async (staffId: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف الموظف "${name}"؟`)) {
      try {
        await LoyaltyService.deleteStoreStaff(staffId);
        setStaffList(staffList.filter((s) => s.id !== staffId));
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Metrics (Accurate, Real-world & Practical)
  const totalLifetimeXP = customers.reduce((acc, c) => acc + c.lifetime_xp, 0);
  const totalWalletPoints = customers.reduce((acc, c) => acc + c.wallet_balance, 0);

  const customerVisitsMap = React.useMemo(() => {
    const map: { [key: string]: number } = {};
    auditLogs.forEach((log) => {
      const key = log.customer_phone || log.customer_id;
      if (key) {
        map[key] = (map[key] || 0) + 1;
      }
    });
    return map;
  }, [auditLogs]);

  // Returning / Repeat Customers (Visited > 1 time or has >= 100 XP)
  const returningCustomers = React.useMemo(() => {
    return customers.filter((c) => {
      const visits = (customerVisitsMap[c.phone] || 0) + (customerVisitsMap[c.id] || 0);
      return visits > 1 || c.lifetime_xp >= 100;
    });
  }, [customers, customerVisitsMap]);

  const returningCustomersCount = returningCustomers.length;
  const newCustomersCount = Math.max(0, customers.length - returningCustomersCount);
  const repeatRatePercentage =
    customers.length > 0 ? Math.round((returningCustomersCount / customers.length) * 100) : 0;

  // VIP Frequent Visitors (3+ visits or 300+ XP)
  const vipFrequentCount = customers.filter((c) => {
    const visits = (customerVisitsMap[c.phone] || 0) + (customerVisitsMap[c.id] || 0);
    return visits >= 3 || c.lifetime_xp >= 300;
  }).length;

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const churnedCustomers = customers.filter((c) => {
    if (!c.last_visit_date) return true;
    return new Date(c.last_visit_date) < fourteenDaysAgo;
  });

  // 3️⃣ رادار الإنقاذ مع فحص وخصم رصيد رسائل الواتساب
  const handleRescueWhatsApp = async (cust: Customer) => {
    const currentWaRemaining = (storeWallet?.wa_quota ?? 200) - (storeWallet?.wa_used ?? 0);
    if (currentWaRemaining <= 0) {
      setQuotaExhaustedMessage(
        'لقد استنفدت كامل رصيد رسائل الواتساب لهذا الشهر (0/200 رسالة). يرجى شحن أو ترقية باقة الرسائل لمتابعة إرسال حملات رادار الإنقاذ.'
      );
      setIsQuotaExhaustedModalOpen(true);
      return;
    }

    try {
      const deductRes = await LoyaltyService.deductWhatsAppQuota(store.id, 1);
      if (!deductRes.success) {
        setQuotaExhaustedMessage(deductRes.error || 'رصيد رسائل الواتساب غير كافٍ.');
        setIsQuotaExhaustedModalOpen(true);
        return;
      }
      setStoreWallet((prev) => (prev ? { ...prev, wa_used: prev.wa_used + 1 } : prev));
    } catch (e) {
      console.warn('Quota deduction error', e);
    }

    const text = encodeURIComponent(
      `أهلاً ${cust.name || 'يا غالي'}! 🌟\nاشتقنا لك في ${store.name}.\nعندك في رصيدك ${cust.wallet_balance} نقطة ولاء تنتظرك!\nحياك الله اليوم وعليك مشروبك المفضل مع خصم خاص بمناسبة رجعتك ☕⚡`
    );
    const cleanPhone = cust.phone.replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;
    window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank');
  };

  const handleSaveMetaWhatsAppSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await LoyaltyService.updateStoreWallet(store.id, {
        whatsapp_provider: whatsappProvider,
        meta_phone_number_id: metaPhoneNumberId.trim() || undefined,
        meta_waba_id: metaWabaId.trim() || undefined,
        meta_access_token: metaAccessToken.trim() || undefined,
      });
      setStoreWallet(updated);
      setMetaSavedMessage('تم حفظ وتحديث إعدادات ربط WhatsApp بنجاح ✅');
      setTimeout(() => setMetaSavedMessage(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  // Filtered Customers List
  const filteredCustomers = customers.filter((c) => {
    const query = customerSearchQuery.toLowerCase().trim();
    const matchesQuery =
      !query ||
      (c.name && c.name.toLowerCase().includes(query)) ||
      c.phone.includes(query);

    if (!matchesQuery) return false;

    if (customerTierFilter !== 'ALL') {
      const custTier =
        tiers
          .filter((t) => t.required_xp <= c.lifetime_xp)
          .sort((a, b) => b.required_xp - a.required_xp)[0]?.tier_name || 'ضيف';
      if (custTier !== customerTierFilter) return false;
    }

    return true;
  });

  if (!authenticatedAdmin) {
    return (
      <StaffLoginGate
        store={store}
        requiredRole="admin"
        onAuthenticated={(staff) => {
          setAuthenticatedAdmin(staff);
          loadAdminData();
        }}
      />
    );
  }

  const baseDomain = store.custom_domain
    ? `https://${store.custom_domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
    : `${window.location.origin}/?store=${store.slug}`;
  const custUrl = store.custom_domain ? `${baseDomain}/?portal=customer` : `${baseDomain}&portal=customer`;
  const posUrl = store.custom_domain ? `${baseDomain}/?portal=cashier` : `${baseDomain}&portal=cashier`;
  const adminUrl = store.custom_domain ? `${baseDomain}/?portal=admin` : `${baseDomain}&portal=admin`;

  const productItemsCount = catalogItems.filter((i) => i.item_type !== 'service').length;
  const serviceItemsCount = catalogItems.filter((i) => i.item_type === 'service').length;

  const tabsConfig = [
    {
      id: 'analytics' as AdminTab,
      label: 'التحليلات والأداء',
      icon: BarChart3,
      badge: null,
    },
    {
      id: 'catalog' as AdminTab,
      label: 'الكتالوج والخدمات',
      icon: ShoppingBag,
      badge: `${catalogItems.length}`,
    },
    {
      id: 'loyalty' as AdminTab,
      label: 'برنامج الولاء',
      icon: Gift,
      badge: `${privileges.length}`,
    },
    {
      id: 'customers' as AdminTab,
      label: 'العملاء والعمليات',
      icon: Users,
      badge: `${customers.length}`,
    },
    {
      id: 'staff' as AdminTab,
      label: 'طاقم العمل والـ PIN',
      icon: ShieldCheck,
      badge: `${staffList.length}`,
    },
    {
      id: 'settings' as AdminTab,
      label: 'الإعدادات والفوترة',
      icon: Sliders,
      badge: isStoreSuspended
        ? 'معلق ⚠️'
        : subscriptionInfo?.requiresRenewal
        ? 'تجديد ⚠️'
        : subscriptionInfo?.status === 'trial'
        ? `${subscriptionInfo.daysLeft} أيام`
        : 'نشط ✅',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in text-slate-200">
      
      {/* 🚀 Global Sticky Trial Banner with Precision Countdown (Days, Hours, Minutes) */}
      {isTrial && (
        <div className="sticky top-2 z-40 animate-fade-in">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/25 via-slate-900/95 to-amber-500/15 border border-amber-500/50 shadow-2xl backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="flex items-center space-x-3.5 rtl:space-x-reverse min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/25 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-black text-white">
                    فترة التجربة المجانية نشطة
                  </h4>
                  <div className="flex items-center gap-1.5 bg-slate-950/80 border border-amber-500/40 px-3 py-1 rounded-full text-amber-300 text-[11px] font-mono font-black shadow-inner">
                    <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                    <span>
                      متبقي {trialCountdown.days} {trialCountdown.days === 1 ? 'يوم' : trialCountdown.days === 2 ? 'يومان' : trialCountdown.days <= 10 ? 'أيام' : 'يوماً'} و {String(trialCountdown.hours).padStart(2, '0')} ساعة و {String(trialCountdown.minutes).padStart(2, '0')} دقيقة
                    </span>
                  </div>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300 truncate mt-0.5">
                  استمتع بكافة ميزات المنصة المفتوحة. اشترك في باقة متجرك لتثبيت الحساب والاستمرار دون انقطاع.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNavigateToBilling}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm transition-all duration-200 flex items-center justify-center space-x-1.5 rtl:space-x-reverse shadow-lg shadow-amber-500/25 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>اشترك الآن 🚀</span>
            </button>
          </div>
        </div>
      )}

      {/* ⚠️ Grace Period Sticky Warning Banner (Non-disruptive early warning) */}
      {!isTrial && (subscriptionInfo?.inGracePeriod || store.in_grace_period) && !isStoreSuspended && (
        <div className="sticky top-2 z-40 animate-fade-in">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-orange-600/30 via-slate-900/95 to-amber-600/20 border border-orange-500/60 shadow-2xl backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="flex items-center space-x-3.5 rtl:space-x-reverse min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-orange-500/25 shrink-0">
                <AlertTriangle className="w-5 h-5 text-slate-950" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-black text-orange-400">
                    تنبيه: أنت الآن في فترة السماح المؤقتة (Grace Period)
                  </h4>
                  <div className="flex items-center gap-1.5 bg-slate-950/80 border border-orange-500/40 px-3 py-1 rounded-full text-orange-300 text-[11px] font-mono font-black shadow-inner">
                    <Clock className="w-3.5 h-3.5 text-orange-400 animate-pulse shrink-0" />
                    <span>
                      متبقي {subscriptionInfo?.graceDaysLeft ?? store.grace_period_days ?? 3} {((subscriptionInfo?.graceDaysLeft ?? store.grace_period_days ?? 3) === 1 ? 'يوم' : (subscriptionInfo?.graceDaysLeft ?? store.grace_period_days ?? 3) === 2 ? 'يومان' : 'أيام')} قبل الإيقاف التلقائي
                    </span>
                  </div>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300 truncate mt-0.5">
                  انتهت دورة اشتراكك الحالي. تم تفعيل مهلة سماح إضافية للحفاظ على استمرارية نقاط البيع والخدمات. يرجى التجديد لتجنب تعليق المتجر.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNavigateToBilling}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm transition-all duration-200 flex items-center justify-center space-x-1.5 rtl:space-x-reverse shadow-lg shadow-orange-500/25 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" />
              <span>تجديد الاشتراك الآن ⚡</span>
            </button>
          </div>
        </div>
      )}

      {/* 👑 Executive Command Header */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900/90 border border-slate-800 p-5 sm:p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          {/* Manager & Store Info */}
          <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shadow-inner shrink-0 overflow-hidden">
              {store.logo_url ? (
                <img
                  src={store.logo_url}
                  alt={store.name}
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black text-lg">
                  {store.name.slice(0, 1)}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse flex-wrap gap-y-1">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  أهلاً بك، {authenticatedAdmin.name}
                </h2>
                <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  مدير المتجر المعتمد
                </span>
                {store.custom_domain && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    🌐 {store.custom_domain}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                لوحة القيادة التنفيذية: <strong className="text-slate-200 font-sans">{store.name}</strong> (/{store.slug})
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5 self-start lg:self-auto flex-wrap">
            <button
              onClick={() => setShowQuickLinks(!showQuickLinks)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center space-x-1.5 rtl:space-x-reverse"
            >
              <Share2 className="w-3.5 h-3.5 text-slate-400" />
              <span>الروابط السريعة</span>
              {showQuickLinks ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            <button
              onClick={() => {
                const plainText = `مرحباً بك في ${store.name} ⚡\n\n💼 *1. رابط لوحة تحكم وإدارة المتجر (المدير):*\n${adminUrl}\n\n⚡ *2. رابط شاشة الكاشير السريعة (POS):*\n${posUrl}\n\n📱 *3. رابط بطاقة ومحفظة الزبائن:*\n${custUrl}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(plainText)}`, '_blank');
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center space-x-1.5 rtl:space-x-reverse transition"
            >
              <Send className="w-3.5 h-3.5 text-emerald-400" />
              <span>مشاركة واتساب</span>
            </button>

            <button
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-red-950/60 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/40 text-xs font-semibold flex items-center space-x-1.5 rtl:space-x-reverse transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>

        {/* 🔗 Collapsible Quick Shareable Links Capsule */}
        {showQuickLinks && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in">
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-semibold text-xs flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                  <span>رابط الزبائن (PWA):</span>
                </span>
                <button
                  onClick={() => copyToClipboard(custUrl, 'cust_link')}
                  className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded-lg flex items-center gap-1 transition"
                >
                  {copiedLinkKey === 'cust_link' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLinkKey === 'cust_link' ? 'تم النسخ!' : 'نسخ'}</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-mono truncate select-all">{custUrl}</p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-semibold text-xs flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span>رابط الكاشير (POS):</span>
                </span>
                <button
                  onClick={() => copyToClipboard(posUrl, 'pos_link')}
                  className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded-lg flex items-center gap-1 transition"
                >
                  {copiedLinkKey === 'pos_link' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLinkKey === 'pos_link' ? 'تم النسخ!' : 'نسخ'}</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-mono truncate select-all">{posUrl}</p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-semibold text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>لوحة تحكم التاجر:</span>
                </span>
                <button
                  onClick={() => copyToClipboard(adminUrl, 'admin_link')}
                  className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded-lg flex items-center gap-1 transition"
                >
                  {copiedLinkKey === 'admin_link' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLinkKey === 'admin_link' ? 'تم النسخ!' : 'نسخ'}</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-mono truncate select-all">{adminUrl}</p>
            </div>
          </div>
        )}
      </div>

      {/* 🧪 Simulation Notice Toast */}
      {simulationNotice && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold animate-fade-in flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{simulationNotice}</span>
          </div>
          <button onClick={() => setSimulationNotice(null)} className="text-amber-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ⚠️ Urgent Renewal Alert Banner (3 Days or less before subscription expiry) */}
      {!isStoreSuspended && subscriptionInfo?.requiresRenewal && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/10 border border-amber-500/40 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-300">
                تنبيه تجديد الاشتراك: ينتهي اشتراك متجرك خلال {subscriptionInfo?.daysLeft ?? 3} أيام!
              </h4>
              <p className="text-xs text-slate-300 mt-0.5">
                بادر بتجديد اشتراك المتجر لضمان استمرار عمل شاشات الكاشير ونقاط البيع دون توقف.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isPayingRenewal}
            onClick={() => handlePayRenewal('mada')}
            className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg shadow-amber-500/20 shrink-0 disabled:opacity-50"
          >
            <CreditCard className="w-4 h-4" />
            <span>{isPayingRenewal ? 'جاري الدفع...' : `تجديد الاشتراك الآن (${subscriptionInfo?.renewalAmount || (store as any).renewal_amount || 690} ر.س) 💳`}</span>
          </button>
        </div>
      )}

      {/* 🧭 Luxury Executive Navigation Hub (Tab Bar) */}
      <div className="rounded-2xl p-2 border border-slate-800 bg-slate-900/80 shadow-xl backdrop-blur-md">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {tabsConfig.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full py-3 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 rtl:space-x-reverse transition-all duration-200 relative ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent hover:border-slate-700/60'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                <span className="truncate">{tab.label}</span>
                {tab.badge !== null && (
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded-full border font-bold shrink-0 ${
                      isActive
                        ? 'bg-slate-950 text-amber-400 border-slate-900'
                        : 'bg-slate-800 text-slate-400 border-slate-700/60'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================== */}
      {/* 🔒 PAYWALL LOCK SCREEN: When Suspended / Trial Expired */}
      {/* ========================================== */}
      {isStoreSuspended && (
        <div className="rounded-3xl p-6 sm:p-10 bg-slate-900/95 border-2 border-rose-500/40 shadow-2xl space-y-8 animate-fade-in relative overflow-hidden backdrop-blur-xl">
          {/* Background Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-24 -mt-24"></div>

          <div className="max-w-2xl mx-auto text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto shadow-inner">
              <Lock className="w-10 h-10" />
            </div>

            <span className="px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-wider">
              {subscriptionInfo?.requiresSetup || !store.setup_fee_paid
                ? 'انتهت فترة التجربة المجانية (7 أيام)'
                : 'تم تعليق حساب المتجر مؤقتاً (Suspended)'}
            </span>

            <h2 className="text-2xl sm:text-3xl font-black text-white">
              {subscriptionInfo?.requiresSetup || !store.setup_fee_paid
                ? 'تفعيل حساب المتجر وسداد رسوم التأسيس'
                : 'تجديد الاشتراك الشهري لاستئناف الخدمة فوراً'}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg mx-auto">
              {subscriptionInfo?.requiresSetup || !store.setup_fee_paid
                ? 'لقد انتهت فترة التجربة المجانية لمتجرك (7 أيام). للاستمرار في استخدام نظام Radar Loyalty ونقاط البيع، يرجى سداد رسوم التأسيس لمرة واحدة مع الاستفادة من اشتراك الشهر الأول مجاناً!'
                : 'انتهت دورة اشتراك المتجر الشهرية. جميع بيانات العملاء، الحركات، ونقاط الولاء محفوظة بأمان تام في قاعدة البيانات. قم بسداد رسوم التجديد لفتح لوحة التحكم والكاشير فوراً.'}
            </p>
          </div>

          {/* Pricing & Offer Card */}
          <div className="max-w-xl mx-auto rounded-3xl p-6 sm:p-8 bg-slate-950/90 border border-slate-800 space-y-6 shadow-2xl relative">
            {subscriptionInfo?.requiresSetup || !store.setup_fee_paid ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-xs text-slate-400 font-bold block">رسوم التأسيس والربط (تدفع لمرة واحدة فقط):</span>
                    <h3 className="text-lg font-black text-white mt-0.5">باقة التأسيس الشاملة (Setup Package)</h3>
                  </div>
                  <div className="text-left">
                    <span className="text-3xl font-black text-amber-400 font-mono">500</span>
                    <span className="text-xs text-slate-400 font-bold mr-1">ر.س</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center space-x-2.5 rtl:space-x-reverse">
                  <Gift className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>هدية التأسيس: فترة تجربة مجانية كاملة لكافة مميزات وبوابات النظام! 🎁</span>
                </div>

                <div className="space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>تفعيل فوري لكافة بوابات النظام (شاشة الكاشير POS وبوابة الزبائن)</span>
                  </div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>حصة شهرية: 200 رسالة واتساب + 500 رسالة SMS مجاناً</span>
                  </div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>ربط وتفعيل الدومين المخصص لمتجرك وسجل التدقيق المالي</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-xs text-slate-400 font-bold block">رسوم الاشتراك والخدمة (SaaS Subscription):</span>
                    <h3 className="text-lg font-black text-white mt-0.5">
                      {store.subscription_plan && store.subscription_plan !== 'trial'
                        ? `تجديد ${store.subscription_plan}`
                        : 'تجديد الاشتراك الدوري'}
                    </h3>
                  </div>
                  <div className="text-left">
                    <span className="text-3xl font-black text-amber-400 font-mono">
                      {subscriptionInfo?.renewalAmount || (store as any).renewal_amount || 690}
                    </span>
                    <span className="text-xs text-slate-400 font-bold mr-1">ر.س</span>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>استئناف فوري لعمليات مسح الباركود ونقاط البيع للكاشير</span>
                  </div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>تجديد رصيد رسائل الواتساب ورادار استرداد العملاء المفقودين</span>
                  </div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>تمديد فترة الصلاحية 30 يوماً إضافية تبدأ من تاريخ السداد</span>
                  </div>
                </div>
              </>
            )}

            {/* Payment Method Selector & Instant Action */}
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
                <span>بوابات الدفع المعتمدة:</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white font-bold">مدى Mada</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white font-bold">Apple Pay</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white font-bold">Visa / MC</span>
              </div>

              <button
                type="button"
                disabled={isPayingRenewal || isPayingSetup}
                onClick={() => handlePayRenewal('mada')}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-black font-black text-sm shadow-xl shadow-amber-500/20 transition flex items-center justify-center space-x-2 rtl:space-x-reverse disabled:opacity-50"
              >
                <CreditCard className="w-5 h-5" />
                <span>{isPayingRenewal || isPayingSetup ? 'جاري معالجة الاشتراك...' : `سداد الاشتراك وتفعيل المتجر (${subscriptionInfo?.renewalAmount || (store as any).renewal_amount || 690} ر.س) 💳`}</span>
              </button>
            </div>
          </div>

          {/* Quick Sandbox & Simulation Switcher (For Developer / Demo Testing) */}
          <div className="max-w-xl mx-auto p-4 rounded-2xl bg-slate-950/60 border border-dashed border-slate-800 text-center space-y-2">
            <span className="text-[11px] text-slate-400 font-bold block">
              🧪 مختبر الفحص السريع (Sandbox Simulation Controls):
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleSimulateSubscription('trial_active')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 transition"
              >
                تفعيل تجربة (5 أيام)
              </button>
              <button
                type="button"
                onClick={() => handleSimulateSubscription('active_sub')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 transition"
              >
                تفعيل اشتراك نشط (20 يوماً)
              </button>
              <button
                type="button"
                onClick={() => handleSimulateSubscription('expiring_soon')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 transition"
              >
                تنبيه تجديد (يومان)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 📊 TAB 1: الأداء والتحليلات المباشرة (Analytics & Direct Reports) */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'analytics' && (
        <StoreAnalyticsView
          store={store}
          customers={customers}
          auditLogs={auditLogs}
          onExportCustomersCSV={handleExportCustomersCSV}
          onExportAuditLogsCSV={handleExportAuditLogsCSV}
        />
      )}

      {/* ========================================== */}
      {/* 🎁 TAB 3: برنامج الولاء والمكافآت */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'loyalty' && (
        <div className="space-y-6 animate-fade-in">
          {/* Subtabs Switcher */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl w-fit shadow-md">
            <button
              type="button"
              onClick={() => setLoyaltySection('perks')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                loyaltySection === 'perks'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Gift className="w-4 h-4" />
              <span>الامتيازات والكوبونات ({privileges.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setLoyaltySection('tiers')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                loyaltySection === 'tiers'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>رتب ومستويات الولاء ({tiers.length})</span>
            </button>
          </div>

          {/* Sub-Section 1: Perks */}
          {loyaltySection === 'perks' && (
            <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                    <Gift className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2 rtl:space-x-reverse">
                      <span>الامتيازات وكوبونات الولاء</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono font-bold">
                    {privileges.length} عروض
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  تحديد تكلفة النقاط، المخزون الأقصى، وساعات الصرف المسموحة للكوبونات (Time-Lock)
                </p>
              </div>
            </div>

            <button
              onClick={handleOpenAddPrivilege}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-bold text-xs sm:text-sm flex items-center space-x-2 rtl:space-x-reverse shadow-sm transition self-start sm:self-auto"
            >
              <PlusCircle className="w-4 h-4 text-amber-400" />
              <span>+ إضافة امتياز / كوبون جديد</span>
            </button>
          </div>

          {privActionSuccess && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{privActionSuccess}</span>
            </div>
          )}

          {/* Coupons Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">إجمالي العروض النشطة</span>
              <span className="text-xl font-black text-white font-mono mt-1 block">
                {privileges.filter((p) => p.is_active).length}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">الكوبونات المشتراة (الكل)</span>
              <span className="text-xl font-black text-white font-mono mt-1 block">
                {coupons.length}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">تم صرفها وحرقها (Used)</span>
              <span className="text-xl font-black text-white font-mono mt-1 block">
                {coupons.filter((c) => c.status === 'USED').length}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">كوبونات نشطة بالمحافظ</span>
              <span className="text-xl font-black text-white font-mono mt-1 block">
                {coupons.filter((c) => c.status === 'ACTIVE').length}
              </span>
            </div>
          </div>

          {/* Privileges Cards Grid */}
          {privileges.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-950/60 border border-slate-800 border-dashed space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
                <Gift className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">لا توجد عروض أو مكافآت حتى الآن</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  ابدأ بإنشاء أول امتياز أو مكافأة لعملائك ليتمكنوا من استبدال نقاطهم بها في محفظتهم الرقمية.
                </p>
              </div>
              <button
                onClick={handleOpenAddPrivilege}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition shadow-lg shadow-amber-400/10"
              >
                <PlusCircle className="w-4 h-4" />
                <span>إضافة أول مكافأة / عرض</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {privileges.map((p) => {
              const reqTier = tiers.find((t) => t.id === p.required_tier_id);
              const isSoldOut =
                p.quantity_limit !== null &&
                p.quantity_limit > 0 &&
                (p.redeemed_count || 0) >= p.quantity_limit;
              const stockPercent =
                p.quantity_limit && p.quantity_limit > 0
                  ? Math.min(100, Math.round(((p.redeemed_count || 0) / p.quantity_limit) * 100))
                  : 0;

              return (
                <div
                  key={p.id}
                  className={`p-5 rounded-3xl border transition-all duration-300 relative flex flex-col justify-between overflow-hidden shadow-sm ${
                    !p.is_active
                      ? 'bg-slate-950/40 border-slate-800 opacity-60'
                      : isSoldOut
                      ? 'bg-slate-900/90 border-rose-500/30'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {p.image_url && (
                    <div className="relative h-28 -mx-5 -mt-5 mb-3 overflow-hidden rounded-t-3xl">
                      <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent"></div>

                      <div className="absolute top-2 left-2 rtl:right-2 rtl:left-auto flex items-center gap-1">
                        {isSoldOut ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px]">
                            نفدت الكمية
                          </span>
                        ) : p.is_hidden ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-900/90 text-slate-300 font-bold text-[10px] border border-slate-700">
                            مخفي
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-900/90 text-slate-200 border border-slate-700 font-bold text-[10px]">
                            متاح
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {reqTier?.tier_name || p.tier_name || 'الجميع'}
                      </span>

                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700 font-mono font-bold text-xs">
                        {p.cost_points} نقطة
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-white">{p.title}</h4>
                    <p className="text-xs text-slate-400 line-clamp-2">{p.description}</p>

                    {/* Time Window & Per-Customer Limits */}
                    <div className="space-y-1.5 pt-1">
                      <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>ساعات الصرف:</span>
                        </span>
                        <span className="font-mono text-slate-200 font-medium">
                          {p.valid_start_time && p.valid_end_time
                            ? `${p.valid_start_time} - ${p.valid_end_time}`
                            : '24/7'}
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>الحد لكل عميل:</span>
                        </span>
                        <span className="font-mono font-medium text-slate-200">
                          {p.per_customer_limit ? `${p.per_customer_limit} كود` : 'مفتوح'}
                        </span>
                      </div>
                    </div>

                    {/* Stock Quota Progress */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>المخزون المصروف:</span>
                        <span className="font-mono text-slate-200 font-semibold">
                          {p.redeemed_count || 0} / {p.quantity_limit ? p.quantity_limit : '∞'}
                        </span>
                      </div>
                      {p.quantity_limit && p.quantity_limit > 0 && (
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isSoldOut ? 'bg-rose-500' : 'bg-slate-500'
                            }`}
                            style={{ width: `${stockPercent}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Controls */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleTogglePrivilegeActive(p)}
                        className={`p-1.5 rounded-lg text-xs font-bold transition border ${
                          p.is_active
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                        title={p.is_active ? 'إيقاف الامتياز' : 'تفعيل الامتياز'}
                      >
                        {p.is_active ? 'نشط' : 'معطل'}
                      </button>

                      <button
                        onClick={() => handleTogglePrivilegeHidden(p)}
                        className="p-1.5 rounded-lg text-xs font-medium transition bg-slate-800 text-slate-300 border border-slate-700"
                        title={p.is_hidden ? 'إظهار للعملاء' : 'إخفاء عن العملاء'}
                      >
                        {p.is_hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditPrivilege(p)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition"
                        title="تعديل الامتياز"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeletePrivilege(p.id, p.title)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 border border-slate-700 text-xs transition"
                        title="حذف الامتياز"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

          {/* Sub-Section 2: Tiers */}
          {loyaltySection === 'tiers' && (
            <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2 rtl:space-x-reverse">
                      <span>رتب ومستويات الولاء</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold font-mono">
                        {tiers.length} رتب
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      تسمية الرتب وتحديد نقاط الـ XP المطلوبة للترقية في محفظة الزبائن وشاشة الكاشير
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddTier}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-md transition self-start sm:self-auto"
                >
                  <PlusCircle className="w-4 h-4 text-slate-950" />
                  <span>+ إضافة رتبة جديدة</span>
                </button>
              </div>

          {tierActionSuccess && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{tierActionSuccess}</span>
            </div>
          )}

          {/* Tiers Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers.map((tier, idx) => {
              const customerCountInTier = customers.filter((c) => {
                const custTier =
                  tiers
                    .filter((t) => t.required_xp <= c.lifetime_xp)
                    .sort((a, b) => b.required_xp - a.required_xp)[0]?.id || tiers[0]?.id;
                return custTier === tier.id;
              }).length;

              return (
                <div
                  key={tier.id}
                  className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition relative group shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-400 font-medium">
                        المستوى #{idx + 1}
                      </span>
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ backgroundColor: tier.badge_color || '#94A3B8' }}
                      ></span>
                    </div>

                    <h4 className="text-base font-bold text-white mt-2 flex items-center gap-1.5">
                      <span>{tier.tier_name}</span>
                    </h4>

                    <div className="mt-3 p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block">النقاط المطلوبة:</span>
                      <div className="flex items-baseline space-x-1.5 rtl:space-x-reverse mt-0.5">
                        <span className="text-xl font-bold text-white font-mono">
                          {tier.required_xp.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">XP</span>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
                      <span>العملاء:</span>
                      <strong className="text-slate-200 font-mono">{customerCountInTier} عميل</strong>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenEditTier(tier)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition flex items-center gap-1 border border-slate-700"
                      title="تعديل الرتبة"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>

                    <button
                      onClick={() => handleDeleteTier(tier.id, tier.tier_name)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-400 hover:text-rose-400 text-xs transition border border-slate-700"
                      title="حذف الرتبة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </div>
      )}

      {/* ========================================== */}
      {/* 👥 TAB 4: العملاء وحركات العمليات */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'customers' && (
        <div className="space-y-6 animate-fade-in">
          {/* Subtabs Switcher */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl w-fit shadow-md">
            <button
              type="button"
              onClick={() => setCustomersSection('crm')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                customersSection === 'crm'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>دليل وسجل العملاء ({customers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setCustomersSection('logs')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                customersSection === 'logs'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>سجل العمليات والطلبات ({auditLogs.length})</span>
            </button>
          </div>

          {/* Sub-Section 1: CRM Directory */}
          {customersSection === 'crm' && (
            <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shadow-sm">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2 rtl:space-x-reverse">
                      <span>سجل ودليل العملاء</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono font-bold">
                        {filteredCustomers.length} من أصل {customers.length} عميل
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      عرض بيانات العملاء، الرتبة، الرصيد، التنشيط/التعطيل، وتعديل النقاط
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                  <button
                    onClick={handleExportCustomersCSV}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 rtl:space-x-reverse border border-slate-700 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>تصدير ملف (CSV)</span>
                  </button>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو برقم الجوال..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none pr-9"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <select
                    value={customerTierFilter}
                    onChange={(e) => setCustomerTierFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-2xl px-3 py-2.5 text-xs text-white outline-none font-medium"
                  >
                    <option value="ALL">جميع الرتب</option>
                    {tiers.map((t) => (
                      <option key={t.id} value={t.tier_name}>
                        {t.tier_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {customerActionSuccess && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>{customerActionSuccess}</span>
                </div>
              )}

              {/* Customers Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-medium">
                      <th className="pb-3 px-3">اسم العميل</th>
                      <th className="pb-3 px-3">رقم الجوال</th>
                      <th className="pb-3 px-3">الرتبة الحالية</th>
                      <th className="pb-3 px-3">رصيد النقاط</th>
                      <th className="pb-3 px-3">النقاط الدائمة (XP)</th>
                      <th className="pb-3 px-3">آخر زيارة</th>
                      <th className="pb-3 px-3 text-center">حالة الحساب</th>
                      <th className="pb-3 px-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((cust) => {
                        const currentTier =
                          tiers
                            .filter((t) => t.required_xp <= cust.lifetime_xp)
                            .sort((a, b) => b.required_xp - a.required_xp)[0] || tiers[0];
                        const isActive = cust.is_active !== false;

                        return (
                          <tr key={cust.id} className="hover:bg-slate-950/40 transition">
                            <td className="py-3.5 px-3">
                              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 font-bold flex items-center justify-center text-xs border border-slate-700">
                                  {cust.name ? cust.name.charAt(0) : 'ع'}
                                </div>
                                <div>
                                  <span className="font-bold text-white block">
                                    {cust.name || 'عميل'}
                                  </span>
                                  <button
                                    onClick={() => handleOpenEditCustomer(cust)}
                                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-0.5"
                                  >
                                    <Edit3 className="w-2.5 h-2.5" />
                                    <span>{cust.name ? 'تعديل' : '+ إضافة اسم'}</span>
                                  </button>
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-3 font-mono text-slate-300 font-medium" dir="ltr">
                              {cust.phone}
                            </td>

                            <td className="py-3.5 px-3">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-medium bg-slate-800 text-slate-200 border border-slate-700">
                                {currentTier?.tier_name || 'ضيف'}
                              </span>
                            </td>

                            <td className="py-3.5 px-3 font-mono font-bold text-white text-sm">
                              {cust.wallet_balance.toLocaleString()}
                              <span className="text-[10px] text-slate-400 font-normal mr-1">نقطة</span>
                            </td>

                            <td className="py-3.5 px-3 font-mono text-slate-300">
                              {cust.lifetime_xp.toLocaleString()} XP
                            </td>

                            <td className="py-3.5 px-3 text-slate-400 font-mono text-[11px]">
                              {cust.last_visit_date
                                ? new Date(cust.last_visit_date).toLocaleDateString('ar-SA', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                : 'جديد'}
                            </td>

                            <td className="py-3.5 px-3 text-center">
                              <button
                                onClick={() => handleToggleCustomerActive(cust)}
                                className={`px-3 py-1 rounded-full text-[11px] font-medium border transition ${
                                  isActive
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                }`}
                                title="اضغط لتغيير حالة الحساب"
                              >
                                {isActive ? '● نشط' : '○ موقوف'}
                              </button>
                            </td>

                            <td className="py-3.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleOpenAdjustPoints(cust)}
                                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                                  title="تعديل النقاط"
                                >
                                  <Zap className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleCustomerDirectWhatsApp(cust)}
                                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                                  title="إرسال رسالة واتساب للعميل"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500">
                          لا يوجد أي عملاء يطابقون خيارات البحث الحالية.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-Section 2: Operations Ledger */}
          {customersSection === 'logs' && (() => {
            // Date Boundaries
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;
            const thirtyDaysAgo = startOfToday - 30 * 24 * 60 * 60 * 1000;

            // Apply all filters: Date, Action, Staff, Entry Method, Search Query
            const filteredAuditLogs = auditLogs.filter((log) => {
              const logTime = new Date(log.created_at).getTime();

              // Date filter
              if (logDateFilter === 'TODAY' && logTime < startOfToday) return false;
              if (logDateFilter === '7DAYS' && logTime < sevenDaysAgo) return false;
              if (logDateFilter === '30DAYS' && logTime < thirtyDaysAgo) return false;

              // Action Type filter
              if (logActionFilter === 'PURCHASE' && log.action !== 'PURCHASE') return false;
              if (
                logActionFilter === 'REDEEM' &&
                log.action !== 'REDEEM_COUPON' &&
                log.action !== 'REDEEM_REWARD' &&
                log.action !== 'PURCHASE_COUPON'
              ) {
                return false;
              }
              if (logActionFilter === 'ADJUSTMENT' && log.action !== 'ADJUSTMENT') return false;
              if (
                logActionFilter === 'SERVICE_BOOKING' &&
                log.action !== 'SERVICE_BOOKING' &&
                (log.action as string) !== 'BOOKING'
              ) {
                return false;
              }

              // Entry method filter
              if (logFilter === 'manual' && log.entry_method !== 'manual') return false;
              if (logFilter === 'qr_scan' && log.entry_method === 'manual') return false;

              // Staff filter
              if (logStaffFilter !== 'ALL') {
                const cashierName = log.metadata?.cashier_name || '';
                const matchingStaff = staffList.find(
                  (s) => s.id === logStaffFilter || s.name === logStaffFilter || s.id === log.staff_id
                );
                const matchesId = log.staff_id === logStaffFilter;
                const matchesName =
                  cashierName === logStaffFilter || (matchingStaff && cashierName === matchingStaff.name);
                if (!matchesId && !matchesName) return false;
              }

              // Search Query
              if (logSearchQuery.trim()) {
                const q = logSearchQuery.trim().toLowerCase();
                const customerName = (log.customer_name || '').toLowerCase();
                const customerPhone = (log.customer_phone || '').toLowerCase();
                const couponCode = (log.metadata?.coupon_code || '').toLowerCase();
                const privilegeTitle = (log.metadata?.privilege_title || '').toLowerCase();
                const note = (log.metadata?.note || '').toLowerCase();
                const cashierName = (log.metadata?.cashier_name || '').toLowerCase();
                const amountStr = log.purchase_amount ? log.purchase_amount.toString() : '';

                const matches =
                  customerName.includes(q) ||
                  customerPhone.includes(q) ||
                  couponCode.includes(q) ||
                  privilegeTitle.includes(q) ||
                  note.includes(q) ||
                  cashierName.includes(q) ||
                  amountStr.includes(q);
                if (!matches) return false;
              }

              return true;
            });

            // Summary calculations
            const totalSalesAmount = filteredAuditLogs
              .filter((l) => l.action === 'PURCHASE')
              .reduce((sum, l) => sum + (Number(l.purchase_amount) || 0), 0);

            const totalPointsAwarded = filteredAuditLogs
              .filter((l) => l.points_changed > 0)
              .reduce((sum, l) => sum + l.points_changed, 0);

            const totalRedeemedCoupons = filteredAuditLogs.filter(
              (l) => l.action === 'REDEEM_COUPON' || l.action === 'REDEEM_REWARD'
            ).length;

            const manualLogsCount = filteredAuditLogs.filter((l) => l.entry_method === 'manual').length;
            const qrLogsCount = filteredAuditLogs.filter((l) => l.entry_method !== 'manual').length;

            const handleRefreshLogs = async () => {
              try {
                const fresh = await LoyaltyService.getAuditLogs(store.id);
                setAuditLogs(fresh);
              } catch (e) {
                console.error(e);
              }
            };

            return (
              <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
                {/* Header Title & Subtitle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shadow-sm">
                      <FileText className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                        <span>سجل العمليات والطلبات المركزي</span>
                        {manualLogsCount > 0 && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                            ⚠️ {manualLogsCount} إدخال يدوي
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        سجل موحد لجميع حركات النقاط والكوبونات والطلبات وتفاصيل العمليات المالية وطرق المسح
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleRefreshLogs}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto transition shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تحديث السجل 🔄</span>
                  </button>
                </div>

                {/* 📊 Summary Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 block font-medium">إجمالي العمليات</span>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-black text-white font-mono">{filteredAuditLogs.length}</span>
                      <Layers className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 block font-medium">مبيعات الفواتير</span>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-black text-emerald-400 font-mono">
                        {totalSalesAmount.toLocaleString()} <span className="text-xs font-sans">ر.س</span>
                      </span>
                      <Coins className="w-4 h-4 text-emerald-500" />
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 block font-medium">النقاط الممنوحة</span>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-black text-amber-400 font-mono">
                        +{totalPointsAwarded.toLocaleString()}
                      </span>
                      <Zap className="w-4 h-4 text-amber-500" />
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 block font-medium">كوبونات تم حرقها</span>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-black text-rose-400 font-mono">{totalRedeemedCoupons}</span>
                      <Flame className="w-4 h-4 text-rose-500" />
                    </div>
                  </div>
                </div>

                {/* 🔍 Quick Filter Suite */}
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                  {/* Row 1: Search Bar & Date Filter Presets */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    {/* Search Box */}
                    <div className="sm:col-span-6 relative">
                      <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e.target.value)}
                        placeholder="بحث سريع بالاسم، رقم الجوال، كود الكوبون، أو المبلغ..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-10 pl-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500 transition"
                      />
                      {logSearchQuery && (
                        <button
                          onClick={() => setLogSearchQuery('')}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Date Filter Buttons */}
                    <div className="sm:col-span-6 flex items-center justify-start sm:justify-end gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      <span className="text-xs text-slate-400 font-medium ml-1 shrink-0 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>التاريخ:</span>
                      </span>
                      {[
                        { id: 'ALL', label: 'الكل' },
                        { id: 'TODAY', label: 'اليوم' },
                        { id: '7DAYS', label: 'آخر 7 أيام' },
                        { id: '30DAYS', label: 'آخر 30 يوماً' },
                      ].map((df) => (
                        <button
                          key={df.id}
                          onClick={() => setLogDateFilter(df.id as any)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                            logDateFilter === df.id
                              ? 'bg-amber-500 text-black shadow-sm'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          {df.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Row 2: Operation Type, Entry Method, and Cashier Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-800/80">
                    {/* Action Type Filters */}
                    <div className="sm:col-span-6 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-400 font-medium ml-1 shrink-0">نوع الحركة:</span>
                      {[
                        { id: 'ALL', label: 'الكل' },
                        { id: 'PURCHASE', label: '🛒 شراء ونقاط' },
                        { id: 'REDEEM', label: '🔥 حرق كوبونات' },
                        { id: 'SERVICE_BOOKING', label: '💇‍♂️ حجز مواعيد' },
                        { id: 'ADJUSTMENT', label: '⚡ تعديل رصيد' },
                      ].map((af) => (
                        <button
                          key={af.id}
                          onClick={() => setLogActionFilter(af.id as any)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition ${
                            logActionFilter === af.id
                              ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {af.label}
                        </button>
                      ))}
                    </div>

                    {/* Entry Method & Staff Dropdowns */}
                    <div className="sm:col-span-6 flex items-center justify-start sm:justify-end gap-2 flex-wrap">
                      {/* Entry Method Buttons */}
                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          onClick={() => setLogFilter('all')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                            logFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          الكل
                        </button>
                        <button
                          onClick={() => setLogFilter('qr_scan')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                            logFilter === 'qr_scan'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>مسح مباشر ({qrLogsCount})</span>
                        </button>
                        <button
                          onClick={() => setLogFilter('manual')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                            logFilter === 'manual'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span>يدوي ({manualLogsCount})</span>
                        </button>
                      </div>

                      {/* Cashier Staff Dropdown */}
                      {staffList.length > 0 && (
                        <select
                          value={logStaffFilter}
                          onChange={(e) => setLogStaffFilter(e.target.value)}
                          className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-amber-500"
                        >
                          <option value="ALL">جميع الكاشيرات ({staffList.length})</option>
                          {staffList.map((s) => (
                            <option key={s.id} value={s.name}>
                              {s.name} ({s.role === 'admin' ? 'مدير' : 'كاشير'})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>

                {/* 📋 Unified Operations Ledger Table */}
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-950/80">
                        <th className="py-3.5 px-3">التاريخ والوقت</th>
                        <th className="py-3.5 px-3">نوع الحركة</th>
                        <th className="py-3.5 px-3">التفاصيل (المبلغ / الكوبون)</th>
                        <th className="py-3.5 px-3">بيانات العميل</th>
                        <th className="py-3.5 px-3">طريقة الإدخال</th>
                        <th className="py-3.5 px-3">المسؤول / الكاشير</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredAuditLogs.length > 0 ? (
                        filteredAuditLogs.map((log) => {
                          const isManual = log.entry_method === 'manual';
                          return (
                            <tr
                              key={log.id}
                              className={`transition ${
                                isManual ? 'bg-amber-500/[0.03] hover:bg-amber-500/[0.07]' : 'hover:bg-slate-900/60'
                              }`}
                            >
                              {/* 1. التاريخ والوقت */}
                              <td className="py-3.5 px-3 text-slate-300 font-mono whitespace-nowrap">
                                <div className="font-bold text-slate-200">
                                  {new Date(log.created_at).toLocaleDateString('ar-SA', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {new Date(log.created_at).toLocaleTimeString('ar-SA', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                              </td>

                              {/* 2. نوع الحركة */}
                              <td className="py-3.5 px-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                    log.action === 'PURCHASE'
                                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                      : log.action === 'REDEEM_COUPON' || log.action === 'REDEEM_REWARD'
                                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                      : log.action === 'PURCHASE_COUPON'
                                      ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                                      : log.action === 'SERVICE_BOOKING' || (log.action as string) === 'BOOKING'
                                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                  }`}
                                >
                                  {log.action === 'PURCHASE' ? (
                                    <>
                                      <Zap className="w-3 h-3" />
                                      <span>🛒 شراء واكتساب نقاط</span>
                                    </>
                                  ) : log.action === 'REDEEM_COUPON' || log.action === 'REDEEM_REWARD' ? (
                                    <>
                                      <Flame className="w-3 h-3 text-rose-400" />
                                      <span>🔥 حرق واستلام كوبون</span>
                                    </>
                                  ) : log.action === 'PURCHASE_COUPON' ? (
                                    <>
                                      <Gift className="w-3 h-3" />
                                      <span>🎁 شراء كوبون بالنقاط</span>
                                    </>
                                  ) : log.action === 'SERVICE_BOOKING' || (log.action as string) === 'BOOKING' ? (
                                    <>
                                      <Calendar className="w-3 h-3 text-blue-400" />
                                      <span>💇‍♂️ حجز موعد خدمة</span>
                                    </>
                                  ) : (
                                    <>
                                      <Sliders className="w-3 h-3" />
                                      <span>⚡ تعديل رصيد يدوي</span>
                                    </>
                                  )}
                                </span>
                              </td>

                              {/* 3. التفاصيل */}
                              <td className="py-3.5 px-3">
                                <div className="space-y-0.5">
                                  {log.action === 'PURCHASE' ? (
                                    <div>
                                      <span className="font-bold text-white font-mono text-xs">
                                        فاتورة: {log.purchase_amount || 0} ر.س
                                      </span>
                                      <span className="text-[11px] font-bold text-amber-400 font-mono mr-2 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                        +{log.points_changed} XP
                                      </span>
                                    </div>
                                  ) : log.action === 'SERVICE_BOOKING' || (log.action as string) === 'BOOKING' ? (
                                    <div className="space-y-0.5">
                                      <div className="font-bold text-white text-xs flex items-center gap-1.5">
                                        <span>{log.metadata?.service_name || 'خدمة'}</span>
                                        {log.purchase_amount ? (
                                          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                            {log.purchase_amount} ر.س
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                        <span className="text-blue-300 font-bold">{log.metadata?.specialist_name || 'أي مختص'}</span>
                                        <span>•</span>
                                        <span>{log.metadata?.booking_date} الساعة {log.metadata?.booking_time}</span>
                                        {log.metadata?.booking_number && (
                                          <span className="text-amber-400 font-bold">#{log.metadata.booking_number}</span>
                                        )}
                                      </div>
                                    </div>
                                  ) : log.metadata?.privilege_title || log.metadata?.coupon_code ? (
                                    <div>
                                      <strong className="text-white text-xs block">
                                        {log.metadata.privilege_title || 'مكافأة'}
                                      </strong>
                                      {log.metadata?.coupon_code && (
                                        <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 mt-0.5 inline-block">
                                          كود: {log.metadata.coupon_code}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="text-white font-mono font-bold">
                                        {log.points_changed > 0 ? `+${log.points_changed}` : log.points_changed} XP
                                      </span>
                                      {log.metadata?.reason && (
                                        <span className="text-[10px] text-slate-400 block mt-0.5">
                                          السبب: {log.metadata.reason}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* 4. بيانات العميل */}
                              <td className="py-3.5 px-3">
                                <div className="font-bold text-white">
                                  {log.customer_name || 'عميل المتجر'}
                                </div>
                                <div className="text-[11px] font-mono text-slate-400 mt-0.5" dir="ltr">
                                  {log.customer_phone || log.customer_id?.substring(0, 10)}
                                </div>
                              </td>

                              {/* 5. طريقة الإدخال */}
                              <td className="py-3.5 px-3">
                                {isManual ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/40">
                                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                                    <span>⚠️ إدخال يدوي</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                    <span>🛡️ مسح مباشر</span>
                                  </span>
                                )}
                              </td>

                              {/* 6. المسؤول / الكاشير */}
                              <td className="py-3.5 px-3 font-medium text-slate-300">
                                {log.action === 'PURCHASE_COUPON' ? (
                                  <span className="text-xs text-slate-400">📱 العميل (عبر المحفظة)</span>
                                ) : (
                                  <div>
                                    <span className="text-xs font-bold text-white">
                                      {log.metadata?.cashier_name ||
                                        staffList.find((s) => s.id === log.staff_id)?.name ||
                                        'كاشير المتجر'}
                                    </span>
                                    {log.metadata?.note && (
                                      <span className="text-[10px] text-slate-400 block mt-0.5">
                                        {log.metadata.note}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 space-y-2">
                            <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                            <p className="text-xs">لا توجد أي حركات مطابقة لشروط البحث والفلتر المحددة.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================== */}
      {/* 🛡️ TAB 5: طاقم العمل والصلاحيات */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'staff' && (
        <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shadow-sm">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2 rtl:space-x-reverse">
                  <span>طاقم العمل والصلاحيات</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold font-mono">
                    {staffList.length} موظف
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  إضافة الكاشير والمدراء وتحديد صلاحية المسح الإجباري بالكاميرا 🔒 أو الإدخال اليدوي
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCashierPaywallOpen(true)}
                className="px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>شراء كاشير إضافي (200 ر.س)</span>
              </button>

              <button
                onClick={() => {
                  if (isCashierLimitReached) {
                    setIsCashierPaywallOpen(true);
                  } else {
                    setIsAddStaffOpen(true);
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-sm transition self-start sm:self-auto"
              >
                <UserPlus className="w-4 h-4 text-amber-400" />
                <span>+ إضافة كاشير / مدير جديد</span>
              </button>
            </div>
          </div>

          {/* Cashier Quota & Capacity Status Box */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                ⚡
              </div>
              <div>
                <span className="font-bold text-white block">سعة نقاط البيع (الكاشير):</span>
                <span className="text-slate-400 text-[11px]">
                  مستغل حالياً <strong className="text-white">{activeCashiersCount}</strong> من أصل <strong className="text-amber-400">{maxCashiersAllowed}</strong> كاشير متاح في باقتك.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-32 bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                <div
                  className={`h-full transition-all ${
                    isCashierLimitReached ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (activeCashiersCount / maxCashiersAllowed) * 100)}%` }}
                />
              </div>
              <span className={`font-mono font-bold text-xs px-2.5 py-0.5 rounded-lg border ${
                isCashierLimitReached
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              }`}>
                {isCashierLimitReached ? 'اكتملت السعة' : `${activeCashiersCount}/${maxCashiersAllowed} متاح`}
              </span>
            </div>
          </div>

          {staffActionSuccess && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{staffActionSuccess}</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-medium">
                  <th className="pb-3 px-3">اسم الموظف</th>
                  <th className="pb-3 px-3">رقم الجوال (الدخول)</th>
                  <th className="pb-3 px-3">الصلاحية</th>
                  <th className="pb-3 px-3">رمز الدخول (PIN)</th>
                  <th className="pb-3 px-3">صلاحية المسح</th>
                  <th className="pb-3 px-3">حالة الحساب</th>
                  <th className="pb-3 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {staffList.map((staff) => (
                  <tr key={staff.id} className="hover:bg-slate-950/40 transition">
                    <td className="py-3.5 px-3 font-bold text-white text-sm">
                      {staff.name}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-300 text-xs" dir="ltr">
                      {staff.phone || 'غير مسجل'}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-medium bg-slate-800 text-slate-200 border border-slate-700">
                        {staff.role === 'admin' ? 'مدير المتجر' : 'كاشير POS'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-300">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 tracking-widest font-bold text-amber-400">
                          {staff.pin_code || '1234'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditStaffPin(staff)}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
                          title="تعديل الرمز السري"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    
                    <td className="py-3.5 px-3">
                      <button
                        type="button"
                        onClick={() => handleToggleStaffManualPermission(staff)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-medium border transition flex items-center space-x-1.5 rtl:space-x-reverse ${
                          staff.can_manual_input_phone
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                        title="اضغط لتبديل صلاحية المسح لهذا الموظف"
                      >
                        {staff.can_manual_input_phone ? (
                          <>
                            <Unlock className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-bold">⚠️ إدخال يدوي مسموح</span>
                          </>
                        ) : (
                          <>
                            <Camera className="w-3.5 h-3.5 text-emerald-400" />
                            <span>🔒 مسح إجباري بالكاميرا</span>
                          </>
                        )}
                      </button>
                    </td>

                    <td className="py-3.5 px-3">
                      <button
                        onClick={() => handleToggleStaffStatus(staff)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition ${
                          staff.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {staff.is_active ? '● نشط' : '○ معطل'}
                      </button>
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <button
                        onClick={() => handleDeleteStaff(staff.id, staff.name)}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition border border-slate-700"
                        title="حذف الموظف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 🍔 TAB 2: الكتالوج والخدمات */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'catalog' && (
        <div className="space-y-6 animate-fade-in">
          {/* Subtabs Switcher */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl w-fit shadow-md flex-wrap">
            <button
              type="button"
              onClick={() => setCatalogSection('products')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                catalogSection === 'products'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>المنيو والمنتجات ({productItemsCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setCatalogSection('services')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                catalogSection === 'services'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>الخدمات والمواعيد ({serviceItemsCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setCatalogSection('modifiers')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                catalogSection === 'modifiers'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>الأقسام والإضافات ({globalCategories.length + globalModifierGroups.length})</span>
            </button>
          </div>

          {/* Sub-Section 1: Products */}
          {catalogSection === 'products' && (
            <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
              {/* Header & Quick Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                    <ShoppingBag className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center space-x-2 rtl:space-x-reverse">
                      <span>المنيو والمنتجات</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700 font-bold font-mono">
                        {catalogItems.filter((i) => i.item_type !== 'service').length} منتج
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      إدارة أصناف الطعام، المشروبات، والمنتجات مع خيارات التخصيص
                    </p>
                  </div>
                </div>

            <button
              type="button"
              onClick={handleOpenAddProduct}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs sm:text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-md transition self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة منتج جديد للمنيو</span>
            </button>
          </div>

          {/* 🚗 Fulfillment Settings Status Box */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>خيارات الاستلام والتوصيل المتاحة لعملائك بالمنيو:</span>
              </span>
              <span className="text-[11px] text-slate-400">
                (يمكنك تعديلها وتفعيلها من تبويب إعدادات المتجر)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className={`p-3 rounded-xl border flex items-center space-x-2 rtl:space-x-reverse ${
                allowDineIn ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}>
                <span>🍽️</span>
                <span className="font-bold">{allowDineIn ? 'تناول محلي (طاولات) مفعل' : 'تناول محلي معطل'}</span>
              </div>

              <div className={`p-3 rounded-xl border flex items-center space-x-2 rtl:space-x-reverse ${
                allowTakeaway ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}>
                <span>🚗</span>
                <span className="font-bold">{allowTakeaway ? 'استلام سفري / سيارة مفعل' : 'استلام سفري معطل'}</span>
              </div>

              <div className={`p-3 rounded-xl border flex items-center space-x-2 rtl:space-x-reverse ${
                allowDelivery ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}>
                <span>🛵</span>
                <span className="font-bold">{allowDelivery ? `توصيل منازل (${deliveryFee} ر.س)` : 'توصيل منازل معطل'}</span>
              </div>
            </div>
          </div>

          {catalogActionSuccess && (
            <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{catalogActionSuccess}</span>
            </div>
          )}

          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute top-3 right-3" />
              <input
                type="text"
                value={catalogSearchQuery}
                onChange={(e) => setCatalogSearchQuery(e.target.value)}
                placeholder="ابحث عن منتج أو وجبة..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-600 outline-none"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              {['ALL', ...Array.from(new Set(catalogItems.filter((i) => i.item_type !== 'service').map((it) => it.category).filter(Boolean)))].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatalogCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                    catalogCategoryFilter === cat
                      ? 'bg-amber-500 text-black border-amber-400 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {cat === 'ALL' ? '🌟 جميع الأقسام' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalogItems
              .filter((it) => it.item_type !== 'service')
              .filter((it) => {
                const matchQuery =
                  !catalogSearchQuery.trim() ||
                  it.name.toLowerCase().includes(catalogSearchQuery.toLowerCase()) ||
                  (it.description || '').toLowerCase().includes(catalogSearchQuery.toLowerCase());
                const matchCategory =
                  catalogCategoryFilter === 'ALL' || it.category === catalogCategoryFilter;
                return matchQuery && matchCategory;
              })
              .map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl bg-slate-950 border p-4 flex flex-col justify-between space-y-3 transition group shadow-sm ${
                    item.is_available !== false
                      ? 'border-slate-800 hover:border-slate-700'
                      : 'border-slate-850 opacity-60'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-16 h-16 rounded-xl object-cover border border-slate-800 bg-slate-900 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-2xl shrink-0">
                          🍔
                        </div>
                      )}

                      <div className="space-y-1 overflow-hidden min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-white truncate block">
                            {item.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 font-bold border border-slate-700">
                            {item.category}
                          </span>
                        </div>

                        {item.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Modifiers Pill Info */}
                    {item.modifier_groups && item.modifier_groups.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 text-[10px] text-slate-400 space-y-1">
                        <span className="font-bold text-slate-300 block">الإضافات المرفقة:</span>
                        <div className="flex flex-wrap gap-1">
                          {item.modifier_groups.map((g) => (
                            <span key={g.id} className="bg-slate-950 text-amber-300/90 px-1.5 py-0.5 rounded border border-slate-800">
                              {g.title} ({g.options.length})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-base font-black text-amber-400 font-mono">
                        {item.price}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold mr-1">ر.س</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleCatalogItemAvailability(item)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                          item.is_available !== false
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                        title="اضغط لتبديل حالة التوفر"
                      >
                        {item.is_available !== false ? '● متاح' : '○ نفد'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditProduct(item)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                        title="تعديل المنتج"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCatalogItem(item.id, item.name)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 transition"
                        title="حذف المنتج"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {catalogItems.filter((i) => i.item_type !== 'service').length === 0 && (
            <div className="text-center py-12 text-slate-500 space-y-3 bg-slate-950/60 rounded-3xl border border-slate-800">
              <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs">لم تقم بإضافة أي منتجات في المنيو بعد.</p>
              <button
                type="button"
                onClick={handleOpenAddProduct}
                className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs"
              >
                + إضافة أول منتج الآن
              </button>
            </div>
          )}
        </div>
      )}

          {/* Sub-Section 2: Services */}
          {catalogSection === 'services' && (
            <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
              {/* Main Services Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center space-x-2 rtl:space-x-reverse">
                      <span>الخدمات والمواعيد والمختصين</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700 font-bold font-mono">
                        {bookings.length} موعد مسجل
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      إدارة باقات الخدمات، المختصين، وسجل حجوزات المواعيد
                    </p>
                  </div>
                </div>

            {/* Sub-tab Navigation */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setServicesSubTab('services')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  servicesSubTab === 'services'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>قائمة الخدمات ({catalogItems.filter((i) => i.item_type === 'service').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setServicesSubTab('specialists')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  servicesSubTab === 'specialists'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>طاقم المختصين ({specialists.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setServicesSubTab('bookings')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  servicesSubTab === 'bookings'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BookmarkCheck className="w-3.5 h-3.5" />
                <span>سجل المواعيد ({bookings.length})</span>
              </button>
            </div>
          </div>

          {specialistActionSuccess && (
            <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{specialistActionSuccess}</span>
            </div>
          )}

          {bookingActionSuccess && (
            <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{bookingActionSuccess}</span>
            </div>
          )}

          {/* SUBTAB 1: Services List */}
          {servicesSubTab === 'services' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">خدمات المتجر المتاحة للحجز والمواعيد:</span>
                <button
                  type="button"
                  onClick={handleOpenAddService}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة خدمة جديدة</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalogItems
                  .filter((it) => it.item_type === 'service')
                  .map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 p-4 flex flex-col justify-between space-y-3 transition shadow-sm"
                    >
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-16 h-16 rounded-xl object-cover border border-slate-800 bg-slate-900 shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-blue-950/40 border border-blue-800/40 flex items-center justify-center text-2xl shrink-0">
                              💇‍♂️
                            </div>
                          )}

                          <div className="space-y-1 min-w-0 flex-1">
                            <span className="text-sm font-bold text-white block truncate">{item.name}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-bold">
                                {item.category}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/30 font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{item.duration_minutes || 30} دقيقة</span>
                              </span>
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {item.modifier_groups && item.modifier_groups.length > 0 && (
                          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[10px] text-slate-400 space-y-1">
                            <span className="font-bold text-slate-300 block">خيارات وترقيات الخدمة:</span>
                            <div className="flex flex-wrap gap-1">
                              {item.modifier_groups.map((g) => (
                                <span key={g.id} className="bg-slate-950 text-blue-300 px-1.5 py-0.5 rounded border border-slate-800">
                                  {g.title} ({g.options.length})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-base font-black text-amber-400 font-mono">{item.price}</span>
                          <span className="text-[10px] text-slate-400 font-bold mr-1">ر.س</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleCatalogItemAvailability(item)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                              item.is_available !== false
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {item.is_available !== false ? '● متاح' : '○ معطل'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditService(item)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteCatalogItem(item.id, item.name)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {catalogItems.filter((i) => i.item_type === 'service').length === 0 && (
                <div className="text-center py-10 text-slate-500 space-y-2 bg-slate-950/60 rounded-3xl border border-slate-800">
                  <Scissors className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs">لم تقم بإضافة أي خدمات للحجز بعد.</p>
                  <button
                    type="button"
                    onClick={handleOpenAddService}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs"
                  >
                    + إضافة أول خدمة الآن
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 2: Specialists Roster */}
          {servicesSubTab === 'specialists' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">طاقم مقدمي الخدمات والمختصين المتاحين للحجز:</span>
                <button
                  type="button"
                  onClick={handleOpenAddSpecialist}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة مختص جديد</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {specialists.map((spec) => (
                  <div
                    key={spec.id}
                    className="rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 p-4 space-y-3 transition shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 rtl:space-x-reverse">
                        {spec.avatar_url ? (
                          <img
                            src={spec.avatar_url}
                            alt={spec.name}
                            className="w-12 h-12 rounded-2xl object-cover border border-slate-700 bg-slate-900"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-xl text-blue-300 font-bold">
                            {spec.name.slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <h4 className="text-sm font-bold text-white">{spec.name}</h4>
                          <span className="text-[11px] text-blue-400 font-medium block">{spec.specialty || 'مقدم خدمة'}</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(!spec.service_categories || spec.service_categories.includes('ALL')) ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[9px] font-bold">
                                ⭐ شامل كل الأقسام
                              </span>
                            ) : (
                              spec.service_categories.map((c) => (
                                <span key={c} className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 text-[9px] font-bold">
                                  {c}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleSpecialistActive(spec)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                          spec.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {spec.is_active ? '● متاح للحجز' : '○ إجازة / معطل'}
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-[11px] space-y-1.5 text-slate-400">
                      {spec.phone && (
                        <div className="flex items-center justify-between font-mono">
                          <span>رقم الجوال:</span>
                          <span className="text-slate-200">{spec.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span>ساعات العمل:</span>
                        <span className="text-slate-200 font-mono font-bold">
                          {spec.working_hours?.start || '10:00'} - {spec.working_hours?.end || '22:00'}
                        </span>
                      </div>
                      <div className="pt-1 flex flex-wrap gap-1">
                        {(spec.working_days || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat']).map((d) => (
                          <span key={d} className="px-1.5 py-0.5 rounded bg-slate-950 text-[10px] font-mono text-slate-400 border border-slate-800">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditSpecialist(spec)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition text-xs font-bold flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSpecialist(spec.id, spec.name)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 transition text-xs font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {specialists.length === 0 && (
                <div className="text-center py-10 text-slate-500 space-y-2 bg-slate-950/60 rounded-3xl border border-slate-800">
                  <UserCheck className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs">لم تقم بإضافة أي مختصين أو مقدمي خدمات بعد.</p>
                  <button
                    type="button"
                    onClick={handleOpenAddSpecialist}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs"
                  >
                    + إضافة أول مختص الآن
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 3: Bookings Ledger */}
          {servicesSubTab === 'bookings' && (
            <div className="space-y-4">
              {/* Quick Status Notification Action Banner */}
              {statusNotifyBooking && (
                <div className="p-3.5 rounded-2xl bg-blue-950/80 border border-blue-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fade-in shadow-lg">
                  <div className="flex items-center gap-2 text-white">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      تم تغيير حالة موعد <strong>{statusNotifyBooking.booking.customer_name}</strong> إلى ({
                        statusNotifyBooking.newStatus === 'cancelled'
                          ? 'ملغي ❌'
                          : statusNotifyBooking.newStatus === 'completed'
                          ? 'مكتمل ✅'
                          : statusNotifyBooking.newStatus === 'no_show'
                          ? 'لم يحضر 🏖️'
                          : 'مؤكد ⏳'
                      }). هل تود إشعار العميل عبر الواتساب؟
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const url = LoyaltyService.generateMerchantBookingStatusWhatsAppUrl(
                          statusNotifyBooking.booking,
                          store.name,
                          statusNotifyBooking.newStatus
                        );
                        window.open(url, '_blank');
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>إرسال إشعار ({
                        statusNotifyBooking.newStatus === 'cancelled'
                          ? 'الإلغاء'
                          : statusNotifyBooking.newStatus === 'completed'
                          ? 'الشكر والنقاط'
                          : statusNotifyBooking.newStatus === 'no_show'
                          ? 'فوات الموعد'
                          : 'تأكيد الحجز'
                      }) عبر واتساب 💬</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStatusNotifyBooking(null)}
                      className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
                      title="إغلاق التنبيه"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-500 absolute top-3 right-3" />
                  <input
                    type="text"
                    value={bookingSearchQuery}
                    onChange={(e) => setBookingSearchQuery(e.target.value)}
                    placeholder="ابحث بالاسم، رقم الجوال، أو كود الحجز..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-600 outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                  {[
                    { id: 'ALL', label: 'الكل' },
                    { id: 'confirmed', label: '⏳ مؤكد' },
                    { id: 'completed', label: '✅ مكتمل' },
                    { id: 'cancelled', label: '❌ ملغي' },
                    { id: 'no_show', label: '🏖️ لم يحضر' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setBookingStatusFilter(st.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                        bookingStatusFilter === st.id
                          ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bookings Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-950/90">
                      <th className="py-3.5 px-3">رقم الحجز والتاريخ</th>
                      <th className="py-3.5 px-3">بيانات العميل</th>
                      <th className="py-3.5 px-3">الخدمة المطلوبة</th>
                      <th className="py-3.5 px-3">المختص</th>
                      <th className="py-3.5 px-3">الوقت والسعر</th>
                      <th className="py-3.5 px-3">الحالة وإشعار واتساب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {bookings
                      .filter((b) => {
                        const matchStatus = bookingStatusFilter === 'ALL' || b.status === bookingStatusFilter;
                        const matchQuery =
                          !bookingSearchQuery.trim() ||
                          b.customer_name.toLowerCase().includes(bookingSearchQuery.toLowerCase()) ||
                          b.customer_phone.includes(bookingSearchQuery.trim()) ||
                          b.booking_number.toLowerCase().includes(bookingSearchQuery.toLowerCase()) ||
                          b.service_name.toLowerCase().includes(bookingSearchQuery.toLowerCase());
                        return matchStatus && matchQuery;
                      })
                      .map((bk) => (
                        <tr key={bk.id} className="hover:bg-slate-900/40 transition">
                          <td className="py-3.5 px-3">
                            <div className="font-mono font-bold text-amber-400">#{bk.booking_number}</div>
                            <div className="text-[11px] text-slate-400 font-bold">{bk.booking_date}</div>
                          </td>

                          <td className="py-3.5 px-3">
                            <div className="font-bold text-white">{bk.customer_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{bk.customer_phone}</div>
                          </td>

                          <td className="py-3.5 px-3">
                            <div className="font-bold text-slate-200">{bk.service_name}</div>
                            <div className="text-[10px] text-blue-400">{bk.duration_minutes} دقيقة</div>
                            {bk.selected_modifiers && bk.selected_modifiers.length > 0 && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                + {bk.selected_modifiers.map((m) => m.name).join('، ')}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-medium border border-slate-800">
                              {bk.specialist_name || 'أي مختص متاح'}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            <div className="font-bold font-mono text-white">{bk.booking_time}</div>
                            <div className="text-[11px] font-mono text-amber-400 font-bold">{bk.total_price} ر.س</div>
                          </td>

                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={bk.status}
                                onChange={(e) => handleUpdateBookingStatus(bk.id, e.target.value as any)}
                                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border outline-none cursor-pointer transition ${
                                  bk.status === 'confirmed'
                                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                    : bk.status === 'completed'
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : bk.status === 'cancelled'
                                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                <option value="confirmed">⏳ مؤكد</option>
                                <option value="completed">✅ مكتمل</option>
                                <option value="cancelled">❌ ملغي</option>
                                <option value="no_show">🏖️ لم يحضر</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => {
                                  const url = LoyaltyService.generateMerchantBookingStatusWhatsAppUrl(
                                    bk,
                                    store.name,
                                    bk.status
                                  );
                                  window.open(url, '_blank');
                                }}
                                className={`p-2 rounded-xl text-white transition shadow-sm flex items-center justify-center ${
                                  bk.status === 'cancelled'
                                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                                    : bk.status === 'completed'
                                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                                    : bk.status === 'no_show'
                                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
                                }`}
                                title={
                                  bk.status === 'cancelled'
                                    ? 'إرسال إشعار الإلغاء للعميل عبر واتساب ❌'
                                    : bk.status === 'completed'
                                    ? 'إرسال شكر وإشعار النقاط للعميل عبر واتساب 🌟'
                                    : bk.status === 'no_show'
                                    ? 'إرسال إشعار فوات الموعد للعميل عبر واتساب ⏳'
                                    : 'إرسال تأكيد الموعد للعميل عبر واتساب 📅'
                                }
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {bookings.length === 0 && (
                <div className="text-center py-10 text-slate-500 space-y-2 bg-slate-950/60 rounded-3xl border border-slate-800">
                  <BookmarkCheck className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs">لا توجد أي حجوزات مواعيد مسجلة حتى الآن.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

          {/* Sub-Section 3: Modifiers & Categories */}
          {catalogSection === 'modifiers' && (
            <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                    <Tag className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center space-x-2 rtl:space-x-reverse">
                      <span>الأقسام ومجموعات الإضافات</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      تجهيز الأقسام والإضافات لاستخدامها كوسوم سريعة داخل الأصناف والخدمات
                    </p>
                  </div>
                </div>

            {/* Subtabs Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setModifiersSubTab('categories')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  modifiersSubTab === 'categories'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>مكتبة الأقسام ({globalCategories.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setModifiersSubTab('modifiers')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  modifiersSubTab === 'modifiers'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>مجموعات الإضافات ({globalModifierGroups.length})</span>
              </button>
            </div>
          </div>

          {categoryActionSuccess && (
            <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{categoryActionSuccess}</span>
            </div>
          )}

          {modifierActionSuccess && (
            <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{modifierActionSuccess}</span>
            </div>
          )}

          {/* SUBTAB 1: Categories */}
          {modifiersSubTab === 'categories' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">أقسام المتجر المعتمدة للمنتجات والخدمات:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddCategory('product')}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1.5 shadow transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ قسم منتجات 🍔</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAddCategory('service')}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ قسم خدمات 💇‍♂️</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {globalCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between transition"
                  >
                    <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                        cat.type === 'service' ? 'bg-blue-950 text-blue-300' : 'bg-amber-950 text-amber-300'
                      }`}>
                        {cat.type === 'service' ? '💇‍♂️' : '🍔'}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{cat.name}</h4>
                        <span className="text-[10px] text-slate-400">
                          {cat.type === 'service' ? 'قسم خدمات ومواعيد' : 'قسم منيو ومنتجات'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditCategory(cat)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUBTAB 2: Modifiers Library */}
          {modifiersSubTab === 'modifiers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-300 block">مكتبة خيارات الإضافات العامة:</span>
                  <span className="text-[11px] text-slate-500">
                    يمكنك إرفاق أي مجموعة بضغطة زر (وسم / Tag) داخل أي صنف في المنيو
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddModifierGroup}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1.5 shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة مجموعة خيارات جديدة</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {globalModifierGroups.map((grp) => (
                  <div
                    key={grp.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 space-y-3 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px] font-bold font-mono">
                          #{grp.tag || 'extra'}
                        </span>
                        <h4 className="text-sm font-bold text-white">{grp.name}</h4>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModifierGroup(grp)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteModifierGroup(grp.id, grp.name)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>{grp.required ? '⚠️ اختيار إجباري' : '💡 اختيار اختياري'}</span>
                      <span>•</span>
                      <span>{grp.allow_multiple ? 'متعدد الخيارات' : 'خيار واحد فقط'}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <span className="text-[10px] text-slate-400 font-bold block">الخيارات المسجلة داخل المجموعة:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {grp.options.map((opt) => (
                          <span
                            key={opt.id}
                            className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-200 flex items-center gap-1"
                          >
                            <span>{opt.name}</span>
                            <span className="text-amber-400 font-mono font-bold">
                              {opt.price_delta > 0 ? `+${opt.price_delta} ر.س` : 'مجاناً'}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {globalModifierGroups.length === 0 && (
                <div className="text-center py-10 text-slate-500 space-y-2 bg-slate-950/60 rounded-3xl border border-slate-800">
                  <Tag className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs">لم تقم بإضافة أي مجموعات إضافات مركزية بعد.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
        </div>
      )}

      {/* ========================================== */}
      {/* ⚙️ TAB 6: الإعدادات والفوترة */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'settings' && (
        <div className="space-y-6 animate-fade-in">
          {/* Subtabs Switcher */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl w-fit shadow-md">
            <button
              type="button"
              onClick={() => setSettingsSection('identity')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                settingsSection === 'identity'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>هوية المتجر والشعار</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsSection('billing')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                settingsSection === 'billing'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>الاشتراك والفوترة</span>
            </button>
          </div>

          {/* Sub-Section 1: Identity & Theme */}
          {settingsSection === 'identity' && (
            <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                    <Sliders className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">إعدادات وهوية المتجر</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      تعديل اسم المتجر، ألوان الهوية، الشعار، الدومين الخاص، ومعامل النقاط
                    </p>
                  </div>
                </div>

                <a
                  href={`/merchant/onboarding?store_id=${store.id}`}
                  className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold transition flex items-center gap-1.5 self-start md:self-auto"
                >
                  <span>معالج تهيئة المتجر 🚀</span>
                </a>
              </div>

          <form onSubmit={handleSaveLoyaltySettings} className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Store Name & Slug */}
            <div className="md:col-span-6 space-y-1.5">
              <label className="text-xs font-medium text-slate-300 block">اسم المتجر / العلامة التجارية</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="مثال: دكتور بطاطس 🍟"
                className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-white outline-none transition"
                required
              />
            </div>

            <div className="md:col-span-6 space-y-1.5">
              <label className="text-xs font-medium text-slate-300 block">الاسم التعريفي بالرابط (Slug)</label>
              <input
                type="text"
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value.toLowerCase().trim())}
                placeholder="dr-batates"
                className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-2xl px-4 py-3 text-sm font-mono text-white outline-none transition"
                required
              />
            </div>

            {/* Custom Domain */}
            <div className="md:col-span-12 space-y-1.5 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center space-x-1.5 rtl:space-x-reverse">
                  <Globe className="w-4 h-4 text-slate-400" />
                  <span>الدومين المخصص للتاجر (Custom Domain - اختياري):</span>
                </label>
                <span className="text-[10px] text-slate-500 font-mono">White-Label Branding</span>
              </div>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value.toLowerCase().trim())}
                placeholder="مثال: vip.drbatates.com أو loyalty.mybrand.sa"
                className="w-full bg-slate-900 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-slate-600 outline-none transition"
              />
              <p className="text-[10px] text-slate-500">
                * عند تعيين الدومين المخصص، ستعمل روابط الزبائن والكاشير مباشرة على نطاق موقعك الخاص.
              </p>
            </div>

            {/* Manager Details */}
            <div className="md:col-span-6 space-y-1.5">
              <label className="text-xs font-medium text-slate-300 block">اسم التاجر / المدير المسؤول</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="مثال: صالح الشهري"
                className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-white outline-none transition"
              />
            </div>

            <div className="md:col-span-6 space-y-1.5">
              <label className="text-xs font-medium text-slate-300 block">رقم جوال التاجر (للدخول واستلام التنبيهات)</label>
              <input
                type="tel"
                value={managerContact}
                onChange={(e) => setManagerContact(e.target.value)}
                placeholder="05xxxxxxxx"
                dir="ltr"
                className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-2xl px-4 py-2.5 text-xs font-mono text-white outline-none transition text-center"
              />
            </div>

            {/* Loyalty Point Conversion Rate Multiplier */}
            <div className="md:col-span-12 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
              <label className="text-xs font-bold text-slate-200 block">
                معامل احتساب النقاط (Points Multiplier):
              </label>
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <span className="text-xs text-slate-300 font-medium">كل 1 ريال مشتريات =</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={pointsPerRiyal}
                  onChange={(e) => setPointsPerRiyal(Number(e.target.value))}
                  className="w-24 bg-slate-900 border border-slate-800 focus:border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white text-center outline-none transition"
                  required
                />
                <span className="text-xs text-slate-300 font-medium">نقطة للزبون</span>
              </div>
              <p className="text-[11px] text-slate-500">
                مثال: إذا وضعته 1.0 فإن فاتورة بقيمة 100 ريال تمنح العميل 100 نقطة.
              </p>
            </div>

            {/* 🛡️ Security & Cashier Safeguards (الرمز السري وسقف الفواتير) */}
            <div className="md:col-span-12 p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center space-x-1.5 rtl:space-x-reverse">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>الأمان وحماية المتجر من التلاعب (Security & Anti-Fraud Safeguards):</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    التحكم في الرمز السري الرئيسي للمدير وتحديد سقف الفواتير اليومية المسموح للكاشير إدخالها دون موافقة الإدارة
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Master Admin PIN */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span>الرمز السري لمدير المتجر (Master Admin PIN):</span>
                    <span className="text-[10px] text-amber-400 font-mono">4-6 أرقام</span>
                  </label>
                  <input
                    type="password"
                    maxLength={8}
                    value={adminPinCode}
                    onChange={(e) => setAdminPinCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="9999"
                    dir="ltr"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-amber-400 text-center tracking-widest outline-none transition"
                    required
                  />
                  <p className="text-[10px] text-slate-500">
                    * يُستخدم لتسجيل دخول مدير المتجر وتأكيد العمليات الكبيرة والاستثنائية عند الكاشير.
                  </p>
                </div>

                {/* Max Cashier Invoice SAR */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span>سقف الفواتير العادية للكاشير (بالريال):</span>
                    <span className="text-[10px] text-emerald-400 font-mono">حماية الفواتير</span>
                  </label>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <input
                      type="number"
                      min="10"
                      step="10"
                      value={maxCashierInvoiceAmount}
                      onChange={(e) => setMaxCashierInvoiceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="500"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-400 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-white text-center outline-none transition"
                      required
                    />
                    <span className="text-xs text-slate-400 font-bold shrink-0">ر.س</span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    * أي فاتورة يدخلها الكاشير تتجاوز هذا المبلغ (افتراضياً 500 ر.س) ستتطلب فوراً إدخال رمز المدير للموافقة لمنع أي تلاعب بالنقاط.
                  </p>
                </div>
              </div>
            </div>

            {/* 🛍️ Fulfillment & Smart Ordering Configuration */}
            <div className="md:col-span-12 p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center space-x-1.5 rtl:space-x-reverse">
                    <ShoppingBag className="w-4 h-4 text-amber-400" />
                    <span>إعدادات المنيو والطلبات والحجز (Menu & Fulfillment Settings):</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    حدد خيارات الاستلام والتوصيل وحجز المواعيد المسموحة لزبائن متجرك
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 font-bold">عرض المنيو للعملاء:</span>
                  <button
                    type="button"
                    onClick={() => setCatalogEnabled(!catalogEnabled)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                      catalogEnabled
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    {catalogEnabled ? 'مفعل ✅' : 'معطل ✕'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Dine-in */}
                <button
                  type="button"
                  onClick={() => setAllowDineIn(!allowDineIn)}
                  className={`p-3.5 rounded-xl border text-right transition flex flex-col justify-between ${
                    allowDineIn
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">🍽️ تناول محلي (طاولات)</span>
                    <span className="text-[10px] font-mono">{allowDineIn ? 'مفعل' : 'معطل'}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">طلب من الطاولة أو حجز طاولة مسبق</p>
                </button>

                {/* 2. Takeaway */}
                <button
                  type="button"
                  onClick={() => setAllowTakeaway(!allowTakeaway)}
                  className={`p-3.5 rounded-xl border text-right transition flex flex-col justify-between ${
                    allowTakeaway
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">🚗 استلام سفري / سيارة</span>
                    <span className="text-[10px] font-mono">{allowTakeaway ? 'مفعل' : 'معطل'}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">استلام من الفرع أو تسليم للسيارة</p>
                </button>

                {/* 3. Delivery */}
                <button
                  type="button"
                  onClick={() => setAllowDelivery(!allowDelivery)}
                  className={`p-3.5 rounded-xl border text-right transition flex flex-col justify-between ${
                    allowDelivery
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">🛵 توصيل للعنوان</span>
                    <span className="text-[10px] font-mono">{allowDelivery ? 'مفعل' : 'معطل'}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">توصيل للعنوان أو موقع الخريطة</p>
                </button>

                {/* 4. Service Booking */}
                <button
                  type="button"
                  onClick={() => setAllowServiceBooking(!allowServiceBooking)}
                  className={`p-3.5 rounded-xl border text-right transition flex flex-col justify-between ${
                    allowServiceBooking
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">📅 حجز مواعيد خدمات</span>
                    <span className="text-[10px] font-mono">{allowServiceBooking ? 'مفعل' : 'معطل'}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">حجز موعد خدمة، جلسة، أو صالون</p>
                </button>
              </div>

              {/* Delivery Fee Input if Delivery Enabled */}
              {allowDelivery && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between max-w-sm">
                  <label className="text-xs font-medium text-slate-300">رسوم التوصيل الثابتة (بالريال):</label>
                  <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="15"
                      className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400 text-center outline-none"
                    />
                    <span className="text-xs text-slate-400 font-bold">ر.س</span>
                  </div>
                </div>
              )}
            </div>

            {/* 🎁 Welcome / Signup Gift Configuration */}
            <div className="md:col-span-12 p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center space-x-1.5 rtl:space-x-reverse">
                    <Gift className="w-4 h-4 text-amber-400" />
                    <span>الهدية الافتتاحية والترحيبية للعملاء الجدد (Welcome Gift):</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    حدد المكافأة الفورية التي يحصل عليها العميل الجديد بمجرد فتح حسابه بالمتجر
                  </p>
                </div>
              </div>

              {/* Gift Type Radio Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setWelcomeGiftType('POINTS')}
                  className={`p-3 rounded-xl border text-right transition flex flex-col justify-between ${
                    welcomeGiftType === 'POINTS'
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">🎁 نقاط ترحيبية فورية</span>
                    <span className="text-[10px] font-mono font-bold">POINTS</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    إيداع رصيد نقاط يبدأ به العميل حسابه مباشرة
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setWelcomeGiftType('OFFER')}
                  className={`p-3 rounded-xl border text-right transition flex flex-col justify-between ${
                    welcomeGiftType === 'OFFER'
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">🎟️ عرض خاص / تجربة مجانية</span>
                    <span className="text-[10px] font-mono font-bold">OFFER</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    كوبون ترحيبي فوري (قهوة مجانية، خصم خاص، تجربة)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setWelcomeGiftType('NONE')}
                  className={`p-3 rounded-xl border text-right transition flex flex-col justify-between ${
                    welcomeGiftType === 'NONE'
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">🚫 بدون هدية ترحيبية</span>
                    <span className="text-[10px] font-mono font-bold">NONE</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    تفعيل العضوية برصيد 0 دون هدية ترحيبية
                  </p>
                </button>
              </div>

              {/* Dynamic Inputs based on selected Gift Type */}
              {welcomeGiftType === 'POINTS' && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 animate-fade-in">
                  <label className="text-xs font-medium text-slate-300 block">
                    عدد النقاط الترحيبية المهداة للعميل الجديد:
                  </label>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse max-w-xs">
                    <input
                      type="number"
                      min="1"
                      value={welcomePoints}
                      onChange={(e) => setWelcomePoints(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="50"
                      className="w-32 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-4 py-2 text-sm font-mono font-bold text-amber-400 text-center outline-none transition"
                      required
                    />
                    <span className="text-xs text-slate-400 font-bold">نقطة ترحيبية فورية</span>
                  </div>
                </div>
              )}

              {welcomeGiftType === 'OFFER' && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 animate-fade-in">
                  <label className="text-xs font-medium text-slate-300 block">
                    عنوان العرض أو التجربة الترحيبية المجانية:
                  </label>
                  <input
                    type="text"
                    value={welcomeOfferTitle}
                    onChange={(e) => setWelcomeOfferTitle(e.target.value)}
                    placeholder="مثال: كوب قهوة ترحيبي مجاني، أو عينة عطر فاخرة، أو كود خصم 20%..."
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-4 py-2 text-xs text-white outline-none transition"
                    required
                  />
                  <p className="text-[10px] text-slate-500">
                    * سيتم إنشاء هذا الكوبون فوراً في بطاقة العميل ويظهر في تبويب "امتيازاتي" جاهزاً للمسح عند الكاشير.
                  </p>
                </div>
              )}

              {welcomeGiftType === 'NONE' && (
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
                  لن يتم منح أي هدية أو نقاط افتتاحية، وسيبدأ العميل رصيده من الصفر.
                </div>
              )}
            </div>

            {/* Colors */}
            <div className="md:col-span-6 space-y-2">
              <label className="text-xs font-medium text-slate-300 block">اللون الأساسي للعلامة (Primary Color)</label>
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded-xl border border-slate-800 bg-transparent cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none uppercase"
                />
              </div>
            </div>

            <div className="md:col-span-6 space-y-2">
              <label className="text-xs font-medium text-slate-300 block">اللون الثانوي والتمييز (Secondary Color)</label>
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-10 h-10 rounded-xl border border-slate-800 bg-transparent cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none uppercase"
                />
              </div>
            </div>

            {/* Store Logo with Auto-Compressor */}
            <div className="md:col-span-12 space-y-2 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <label className="text-xs font-bold text-slate-200 block">
                شعار المتجر (Store Logo - مع ضغط ذكي فوري للحجم):
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFileChange}
                className="hidden"
              />

              <div className="flex items-center space-x-4 rtl:space-x-reverse">
                {storeLogoUrl ? (
                  <div className="relative group">
                    <img
                      src={storeLogoUrl}
                      alt="Logo Preview"
                      className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shadow-md bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setStoreLogoUrl('');
                        setLogoStats(null);
                      }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-[10px] shadow hover:bg-rose-500"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border-2 border-dashed border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressing}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-2 rtl:space-x-reverse transition"
                >
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>{isCompressing ? 'جاري الضغط...' : 'اختر صورة من جهازك'}</span>
                </button>
              </div>

              {logoStats && (
                <p className="text-[11px] text-emerald-400">
                  تم ضغط الصورة بنسبة <strong>{logoStats.savingsPercent}%</strong> (الحجم: {logoStats.compressedSizeKB} KB)
                </p>
              )}
            </div>

            {/* 📸 Showcase Slider / Hero Banners Management */}
            <div className="md:col-span-12 p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-200 flex items-center space-x-1.5 rtl:space-x-reverse">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>معرض صور وسلايدر واجهة العميل (VIP Showcase Slider):</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    أضف صور منتجاتك، عباراتك التسويقية، وشارات التميز لتظهر في السلايدر المتحرك أعلى شاشة العميل
                  </p>
                </div>
                <span className="text-[11px] bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-800 text-slate-300 font-mono font-bold">
                  {sliderImages.length} شرائح
                </span>
              </div>

              {/* Current Slides List */}
              {sliderImages.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {sliderImages.map((slide, idx) => (
                    <div
                      key={slide.id || idx}
                      className="relative rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col justify-between p-3 group shadow-sm"
                    >
                      <div className="flex gap-3 items-center">
                        <img
                          src={slide.image_url}
                          alt="Slide preview"
                          className="w-14 h-16 rounded-xl object-cover border border-white/10 bg-slate-950 shrink-0"
                        />
                        <div className="space-y-1 overflow-hidden">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-white truncate block">
                              {slide.title || 'شريحة'}
                            </span>
                          </div>
                          {slide.badge_text && (
                            <span className="text-[9px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold inline-block">
                              {slide.badge_text}
                            </span>
                          )}
                          {slide.quote && (
                            <p className="text-[10px] text-slate-400 line-clamp-1 italic">
                              "{slide.quote}"
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                        <span>الشريحة #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlide(idx)}
                          className="text-slate-400 hover:text-rose-400 flex items-center gap-0.5 font-medium transition"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Slide Form Box */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-dashed border-slate-800 space-y-3">
                <span className="text-xs font-medium text-slate-300 block">
                  + إضافة شريحة جديدة إلى السلايدر:
                </span>

                <input
                  ref={slideFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSlideFileChange}
                  className="hidden"
                />

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-8 flex items-center gap-2">
                    <input
                      type="text"
                      value={newSlideImageUrl}
                      onChange={(e) => setNewSlideImageUrl(e.target.value)}
                      placeholder="رابط الصورة أو ارفع من جهازك..."
                      className="flex-1 bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => slideFileInputRef.current?.click()}
                      disabled={isSlideCompressing}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold shrink-0 transition"
                    >
                      {isSlideCompressing ? 'ضغط...' : 'رفع صورة'}
                    </button>
                  </div>

                  <div className="sm:col-span-4">
                    <input
                      type="text"
                      value={newSlideBadge}
                      onChange={(e) => setNewSlideBadge(e.target.value)}
                      placeholder="شارة التميز (مثال: VIP)"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>

                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      value={newSlideTitle}
                      onChange={(e) => setNewSlideTitle(e.target.value)}
                      placeholder="عنوان الشريحة"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>

                  <div className="sm:col-span-7">
                    <input
                      type="text"
                      value={newSlideQuote}
                      onChange={(e) => setNewSlideQuote(e.target.value)}
                      placeholder="عبارة تسويقية راقية..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleAddSlide}
                    disabled={!newSlideImageUrl.trim()}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition border border-slate-700 disabled:opacity-40"
                  >
                    + إضافة الشريحة
                  </button>
                </div>
              </div>
            </div>

            <div className="md:col-span-12 flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-500">
                التغييرات تنعكس فوراً على شاشات الكاشير ومحفظة الزبائن
              </span>

              <button
                type="submit"
                disabled={updatingSettings || isCompressing}
                className="py-3 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm flex items-center space-x-2 rtl:space-x-reverse shadow-md transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{updatingSettings ? 'جاري الحفظ...' : 'حفظ هوية وإعدادات المتجر'}</span>
              </button>
            </div>
          </form>

          {settingsSavedMessage && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{settingsSavedMessage}</span>
            </div>
          )}

          {/* ========================================== */}
          {/* 📡 WhatsApp & Meta Cloud API Integration Card */}
          {/* ========================================== */}
          <div className="mt-8 rounded-3xl p-6 sm:p-8 bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    بوابة الرسائل وتكامل WhatsApp Cloud API
                  </h3>
                  <p className="text-xs text-slate-400">
                    تهيئة إرسال حملات استرداد العملاء المفقودين (Radar Retention) وإشعارات الولاء
                  </p>
                </div>
              </div>

              {/* Wallets & Quota Quick Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>رصيد واتساب:</span>
                  <strong className="text-emerald-400">{storeWallet?.wa_quota ?? 200} رسالة</strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span>رصيد SMS:</span>
                  <strong className="text-blue-400">{storeWallet?.sms_quota ?? 500} رسالة</strong>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveMetaWhatsAppSettings} className="space-y-6">
              {/* Provider Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300 block">مزود خدمة الإرسال المعتمد</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    onClick={() => setWhatsappProvider('direct')}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${
                      whatsappProvider === 'direct'
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <Smartphone className="w-5 h-5 text-emerald-400" />
                        <h4 className="text-sm font-black text-white">توجيه مباشر مجاني (wa.me)</h4>
                      </div>
                      {whatsappProvider === 'direct' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      يفتح محادثة واتساب مع العميل بضغطة زر مع رسالة مجهزة ومخصصة مسبقاً دون الحاجة لحساب بزنس أو مفاتيح API.
                    </p>
                  </div>

                  <div
                    onClick={() => setWhatsappProvider('meta')}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${
                      whatsappProvider === 'meta'
                        ? 'bg-blue-500/10 border-blue-500/40 shadow-lg shadow-blue-500/5'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <Zap className="w-5 h-5 text-blue-400" />
                        <h4 className="text-sm font-black text-white">Meta Cloud API (Embedded Signup)</h4>
                      </div>
                      {whatsappProvider === 'meta' && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      إرسال آلي صامت في الخلفية عبر خوادم Meta الرسمية الموثقة. يدعم الردود التفاعلية والأزرار الذكية.
                    </p>
                  </div>
                </div>
              </div>

              {whatsappProvider === 'meta' && (
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-blue-950/40 border border-blue-800/40">
                    <div>
                      <h5 className="text-xs font-black text-blue-300">تسجيل الدخول السريع (Meta Embedded Signup)</h5>
                      <p className="text-[11px] text-blue-400/80">
                        قم بربط حساب فيسبوك وتفعيل رقم واتساب المعتمد لمتجرك خلال 60 ثانية.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectMetaEmbeddedSignup}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs transition flex items-center justify-center space-x-2 rtl:space-x-reverse shadow"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>بدء الربط السريع مع Meta</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 block">
                        معرف رقم الهاتف (Phone Number ID)
                      </label>
                      <input
                        type="text"
                        value={metaPhoneNumberId}
                        onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                        placeholder="مثال: 109823485729104"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 block">
                        معرف حساب واتساب للأعمال (WABA ID)
                      </label>
                      <input
                        type="text"
                        value={metaWabaId}
                        onChange={(e) => setMetaWabaId(e.target.value)}
                        placeholder="مثال: 209847192847192"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 block">
                        مفتاح وصول النظام الدائم (Permanent System Access Token)
                      </label>
                      <input
                        type="password"
                        value={metaAccessToken}
                        onChange={(e) => setMetaAccessToken(e.target.value)}
                        placeholder="EAAG..."
                        className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  {whatsappProvider === 'meta'
                    ? 'سيتم استخدام مفاتيح Meta API الرسمية لإرسال حملات Radar'
                    : 'النظام مجهز بالكامل للتوجيه المباشر المجاني عبر تطبيق واتساب'}
                </span>

                <button
                  type="submit"
                  className="py-2.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center space-x-2 rtl:space-x-reverse transition shadow-md"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ إعدادات وتكامل الرسائل</span>
                </button>
              </div>
            </form>

            {metaSavedMessage && (
              <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{metaSavedMessage}</span>
              </div>
            )}
          </div>
        </div>
      )}

          {/* Sub-Section 2: Billing */}
          {settingsSection === 'billing' && (() => {
        // 🛡️ During trial (setup_fee_paid === false), no paid plan is active (currentPaidPlan is null)
        const currentPaidPlan: BillingPlan | null =
          isPaidActive
            ? allPlans.find(
                (p) =>
                  (p.id && (p.id === (store as any).subscription_plan_id || p.id === (store as any).plan_id)) ||
                  (p.code && (p.code === (store as any).plan_code || p.code === (store as any).plan_id)) ||
                  (p.name && (store as any).subscription_plan && (p.name === (store as any).subscription_plan || (store as any).subscription_plan.includes(p.name) || p.name.includes((store as any).subscription_plan))) ||
                  (p.amount && (store as any).renewal_amount && p.amount === (store as any).renewal_amount)
              ) || (allPlans.length > 0 ? allPlans[0] : null)
            : null;

        const activePlans = allPlans.filter((p) => p.active !== false);

        return (
          <div id="merchant-billing-root" className="space-y-6 animate-fade-in" dir="rtl">
            {/* Toast Notification on Upgrade Success */}
            {upgradeSuccessMessage && (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2.5 animate-fade-in shadow-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{upgradeSuccessMessage}</span>
              </div>
            )}

            {/* ⏱️ شريط عداد الأيام المتبقية وحالة الاشتراك المباشرة */}
            {(() => {
              const daysLeft = Math.max(0, Math.ceil(subscriptionInfo?.daysLeft ?? (isTrial ? 7 : (currentPaidPlan?.duration_months ? currentPaidPlan.duration_months * 30 : 30))));
              const totalCycleDays = isTrial
                ? 7
                : currentPaidPlan
                ? Math.max(1, (currentPaidPlan.duration_months || (currentPaidPlan.billing_interval === 'YEARLY' ? 12 : 1)) * 30)
                : 30;
              const progressPercent = Math.min(100, Math.max(0, Math.round((daysLeft / totalCycleDays) * 100)));

              return (
                <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 shadow-2xl relative overflow-hidden space-y-6">
                  {/* Decorative ambient glow */}
                  <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

                  <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    {/* Left/Main info */}
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                          <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="text-base sm:text-lg font-black text-white">
                              إدارة الاشتراكات والفوترة
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                !isTrial && currentPaidPlan
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {!isTrial && currentPaidPlan ? `🟢 باقة ${currentPaidPlan.name}` : '🎁 فترة التجربة المجانية (7 أيام)'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {!isTrial && currentPaidPlan
                              ? `اشتراكك مفعل على (${currentPaidPlan.name}) بسعر ${currentPaidPlan.amount} ${currentPaidPlan.currency || 'ر.س'} / ${getPlanPriceSuffix(currentPaidPlan)}`
                              : 'أنت الآن تستمتع بفترة التجربة المجانية مع كامل المميزات المفتوحة. اشترك في إحدى الباقات لتثبيت الحساب والاستمرار دون انقطاع.'}
                          </p>
                        </div>
                      </div>

                      {/* Expiry Date */}
                      <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                        <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>تاريخ الاستحقاق والتجديد:</span>
                        <strong className="text-slate-200 font-mono">
                          {store.subscription_end_date
                            ? new Date(store.subscription_end_date).toLocaleDateString('ar-SA', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })
                            : store.trial_end_date
                            ? new Date(store.trial_end_date).toLocaleDateString('ar-SA', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })
                            : '7 أيام من تاريخ إنشاء المتجر'}
                        </strong>
                      </div>
                    </div>

                    {/* Right: Big Live Countdown Badge & Action Button */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
                      {/* Live Days Counter */}
                      <div className="flex items-center gap-3.5 bg-slate-950 border border-slate-800/90 px-5 py-3.5 rounded-2xl shadow-inner">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500/20 to-amber-400/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                          <Clock className="w-6 h-6 text-amber-400 animate-pulse" />
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-400 font-medium">
                            {isTrial ? 'المتبقي من التجربة المجانية:' : 'الأيام المتبقية في الاشتراك:'}
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-black text-amber-400 font-mono tracking-tight">
                              {daysLeft}
                            </span>
                            <span className="text-xs font-bold text-slate-300">
                              {daysLeft === 1 ? 'يوم واحد' : daysLeft === 2 ? 'يومان' : daysLeft <= 10 ? 'أيام' : 'يوماً'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              / {totalCycleDays} يوم
                            </span>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="pt-4 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 font-mono">
                      <span>مؤشر صلاحية الفترة الحالية</span>
                      <span className="text-amber-400 font-bold">{progressPercent}% متبقي</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          daysLeft <= 3
                            ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                            : 'bg-gradient-to-r from-amber-500 to-emerald-400'
                        }`}
                        style={{ width: `${Math.max(5, progressPercent)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 🚀 Active Plans Comparison & Upgrade Section (عرض الباقات المتاحة للترقية) */}
            <div id="merchant-billing-packages" className="rounded-3xl p-6 sm:p-8 bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-amber-500/20 shrink-0">
                    🚀
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-base sm:text-lg font-black text-white">
                        باقات وخطط الاشتراك المتاحة (الترقية وتغيير الباقة)
                      </h4>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        {activePlans.length} باقات نشطة
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      اختر الخطة المناسبة لحجم ونمو نشاطك. يتم احتساب مدة الصلاحية وتفعيل الميزات فوراً.
                    </p>
                  </div>
                </div>
              </div>

              {activePlans.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  لا توجد باقات مفعلة حالياً في النظام.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activePlans.map((plan) => {
                    const isCurrent =
                      !isTrial &&
                      Boolean(store.setup_fee_paid) &&
                      Boolean(
                        currentPaidPlan &&
                          ((plan.id && (plan.id === currentPaidPlan.id || plan.id === (store as any).subscription_plan_id)) ||
                            (plan.code && (plan.code === currentPaidPlan.code || plan.code === (store as any).plan_code)) ||
                            plan.name === currentPaidPlan.name ||
                            (plan.name && (store as any).subscription_plan && (plan.name === (store as any).subscription_plan || (store as any).subscription_plan.includes(plan.name) || plan.name.includes((store as any).subscription_plan))))
                      );

                    const isLowerTier =
                      !isTrial &&
                      Boolean(store.setup_fee_paid) &&
                      currentPaidPlan !== null &&
                      !isCurrent &&
                      plan.amount <= currentPaidPlan.amount;

                    const isHigherTier =
                      !isTrial &&
                      Boolean(store.setup_fee_paid) &&
                      currentPaidPlan !== null &&
                      !isCurrent &&
                      plan.amount > currentPaidPlan.amount;

                    const planKey = plan.id || plan.code || plan.name;
                    const isUpgradingThis = isUpgradingPlanId === planKey;

                    const proration =
                      isHigherTier && currentPaidPlan
                        ? LoyaltyService.calculateProratedUpgrade(store, currentPaidPlan, plan)
                        : null;

                    return (
                      <div
                        key={plan.id || plan.code}
                        className={`rounded-3xl p-6 sm:p-7 space-y-6 flex flex-col justify-between transition-all duration-300 relative ${
                          isCurrent
                            ? 'bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-500 shadow-2xl shadow-emerald-500/20 ring-2 ring-emerald-500/30'
                            : isLowerTier
                            ? 'bg-slate-950/50 border border-slate-800/80 opacity-75'
                            : 'bg-slate-950/80 border border-slate-800 hover:border-amber-500/40 hover:shadow-lg'
                        }`}
                      >
                        {isCurrent && (
                          <div className="absolute -top-3.5 right-6 px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/30 flex items-center gap-1.5 animate-bounce">
                            <CheckCircle2 className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                            <span>باقتك الحالية النشطة ✅</span>
                          </div>
                        )}

                        <div className="space-y-4">
                          {/* Plan Duration Badge */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                              🗓️ {getPlanDurationLabel(plan)}
                            </span>

                            {isLowerTier ? (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700/50">
                                🔒 باقة سابقة
                              </span>
                            ) : isHigherTier ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                ⚡ ترقية متاحة
                              </span>
                            ) : plan.trial_days && plan.trial_days > 0 ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                تجربة {plan.trial_days} أيام
                              </span>
                            ) : null}
                          </div>

                          {/* Title & Description */}
                          <div>
                            <h5 className="text-xl font-black text-white">{plan.name}</h5>
                            {plan.description && (
                              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                                {plan.description}
                              </p>
                            )}
                          </div>

                          {/* Price Tag with Smart Proration Breakdown (Only for higher tiers) */}
                          {isHigherTier && proration && proration.hasProrationDiscount ? (
                            <div className="p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-2.5">
                              <div className="flex items-baseline justify-between">
                                <div>
                                  <span className="text-3xl font-black text-emerald-400 font-mono">
                                    {proration.netUpgradeAmount.toLocaleString()}
                                  </span>
                                  <span className="text-xs text-slate-400 font-bold mr-1.5">
                                    {plan.currency || 'ر.س'}
                                  </span>
                                </div>
                                <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                  سداد فرق الترقية ⚡
                                </span>
                              </div>

                              <div className="pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                                <div className="flex items-center justify-between text-slate-400">
                                  <span>السعر الأساسي للباقة:</span>
                                  <span className="font-mono">{plan.amount.toLocaleString()} ر.س</span>
                                </div>
                                <div className="flex items-center justify-between text-emerald-400 font-bold">
                                  <span>💡 خصم قيمة الباقة السابقة:</span>
                                  <span className="font-mono">-{proration.unusedCredit.toLocaleString()} ر.س</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex items-baseline justify-between">
                              <div>
                                <span className={`text-3xl font-black font-mono ${isLowerTier ? 'text-slate-400' : 'text-amber-400'}`}>
                                  {plan.amount.toLocaleString()}
                                </span>
                                <span className="text-xs text-slate-400 font-bold mr-1.5">
                                  {plan.currency || 'ر.س'}
                                </span>
                              </div>
                              <span className="text-xs text-slate-400 font-medium">
                                / {getPlanPriceSuffix(plan)}
                              </span>
                            </div>
                          )}

                          {/* Features List */}
                          <div className="space-y-2 pt-2 border-t border-slate-800/60">
                            <span className="text-[11px] font-bold text-slate-400 block">المميزات المضمنة:</span>
                            <ul className="space-y-2 text-xs text-slate-300">
                              {(plan.features || []).map((feat, fIdx) => (
                                <li key={fIdx} className="flex items-start gap-2 leading-relaxed">
                                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                  <span>{feat}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Action Button: Frozen for lower/previous tiers */}
                        <div className="pt-4 mt-2 border-t border-slate-800/80">
                          {isCurrent ? (
                            <div className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border-2 border-emerald-500/40 text-emerald-300 text-xs font-black flex items-center justify-center gap-2 shadow-inner select-none">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>باقتك الحالية (نشطة ومفعلة) ✅</span>
                            </div>
                          ) : isLowerTier ? (
                            <div className="w-full py-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-500 text-xs font-bold flex items-center justify-center gap-2 cursor-not-allowed select-none opacity-60">
                              <Lock className="w-4 h-4 text-slate-500" />
                              <span>باقة سابقة (غير متاحة للترقية) 🔒</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpgradePlan(plan)}
                              disabled={isUpgradingThis}
                              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs shadow-xl shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
                            >
                              {isUpgradingThis ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>جاري المعالجة...</span>
                                </>
                              ) : isTrial ? (
                                <>
                                  <Zap className="w-4 h-4" />
                                  <span>الاشتراك وتفعيل هذه الباقة 🚀</span>
                                </>
                              ) : proration && proration.hasProrationDiscount ? (
                                <>
                                  <Zap className="w-4 h-4" />
                                  <span>ترقية وسداد فرق الباقة ({proration.netUpgradeAmount.toLocaleString()} ر.س) 🚀</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-4 h-4" />
                                  <span>ترقية إلى هذه الباقة ({plan.amount.toLocaleString()} ر.س) 🚀</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Invoices History Table Card */}
            <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <FileText className="w-5 h-5 text-amber-400" />
                  <h4 className="text-sm font-black text-white">سجل الفواتير والمدفوعات الإلكترونية</h4>
                </div>
                <span className="text-xs font-mono text-slate-400">{invoices.length} فواتير مسجلة</span>
              </div>

              {invoices.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-slate-600" />
                  <p>لا توجد فواتير مسجلة بعد. ستظهر هنا الفواتير فور إتمام أول عملية دفع.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-3 px-3">رقم الفاتورة</th>
                        <th className="py-3 px-3">نوع العملية</th>
                        <th className="py-3 px-3">المبلغ</th>
                        <th className="py-3 px-3">وسيلة الدفع</th>
                        <th className="py-3 px-3">التاريخ</th>
                        <th className="py-3 px-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-3 font-bold text-white select-all">{inv.invoice_number}</td>
                          <td className="py-3 px-3 font-sans">
                            {inv.invoice_type === 'setup' && (
                              <span className="text-blue-400 font-bold">رسوم تأسيس المتجر</span>
                            )}
                            {inv.invoice_type === 'renewal' && (
                              <span className="text-amber-400 font-bold">تجديد اشتراك شهري</span>
                            )}
                            {inv.invoice_type === 'extra_cashier' && (
                              <span className="text-purple-400 font-bold">مقعد كاشير إضافي</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold text-amber-400 font-mono">
                            {inv.amount} {inv.currency}
                          </td>
                          <td className="py-3 px-3 uppercase text-slate-300 font-sans">
                            {inv.payment_method || 'مدى'}
                          </td>
                          <td className="py-3 px-3 text-slate-400 font-sans">
                            {inv.created_at ? new Date(inv.created_at).toLocaleDateString('ar-SA') : '-'}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold font-sans">
                              مدفوعة بنجاح ✅
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}
        </div>
      )}

      {/* ========================================== */}
      {/* ➕ Modals (Outside tabs for clean overlays) */}
      {/* ========================================== */}

      {/* ➕ Modal: Add / Edit Tier */}
      {isTierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl">
            <button
              onClick={() => setIsTierModalOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingTier ? 'تعديل رتبة ولاء' : 'إضافة رتبة ولاء جديدة'}
                </h3>
                <p className="text-xs text-slate-400">حدد اسم الرتبة وعدد نقاط الـ XP للوصول إليها</p>
              </div>
            </div>

            <form onSubmit={handleSaveTierSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">اسم الرتبة</label>
                <input
                  type="text"
                  value={tierNameInput}
                  onChange={(e) => setTierNameInput(e.target.value)}
                  placeholder="مثال: VIP Gold أو النخبة"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white placeholder-slate-600 outline-none transition"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">
                  النقاط التراكمية المطلوبة (Required Lifetime XP)
                </label>
                <input
                  type="number"
                  min="0"
                  value={tierXpInput}
                  onChange={(e) => setTierXpInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-white placeholder-slate-600 outline-none transition"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">لون شارة الرتبة</label>
                <div className="flex items-center gap-2">
                  {['#94A3B8', '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#EF4444'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setTierBadgeColorInput(color)}
                      className={`w-8 h-8 rounded-xl border-2 transition ${
                        tierBadgeColorInput === color ? 'border-white scale-110 shadow-md' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    ></button>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md"
                >
                  {editingTier ? 'حفظ التعديلات' : 'إضافة الرتبة'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsTierModalOpen(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✏️ Modal: Edit Customer Details */}
      {isEditCustomerOpen && editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl">
            <button
              onClick={() => setIsEditCustomerOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">تعديل بيانات العميل</h3>
                <p className="text-xs text-slate-400">تحديث الاسم ورقم الجوال في قاعدة البيانات</p>
              </div>
            </div>

            <form onSubmit={handleSaveCustomerEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">اسم العميل</label>
                <input
                  type="text"
                  value={editCustomerName}
                  onChange={(e) => setEditCustomerName(e.target.value)}
                  placeholder="مثال: عبد الله القرني"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white placeholder-slate-600 outline-none transition"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">رقم الجوال</label>
                <input
                  type="tel"
                  value={editCustomerPhone}
                  onChange={(e) => setEditCustomerPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition text-center"
                  required
                />
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md"
                >
                  حفظ البيانات
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditCustomerOpen(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ⚡ Modal: Adjust Customer Points */}
      {isAdjustPointsOpen && selectedCustomerForAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl">
            <button
              onClick={() => setIsAdjustPointsOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">تعديل رصيد العميل</h3>
                <p className="text-xs text-slate-400">
                  العميل: {selectedCustomerForAdjust.name || selectedCustomerForAdjust.phone} (الرصيد الحالي: {selectedCustomerForAdjust.wallet_balance} نقطة)
                </p>
              </div>
            </div>

            <form onSubmit={handleAdjustPointsSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">
                  عدد النقاط (رقم موجب للإضافة مثل 100 أو سالب للخصم مثل -50):
                </label>
                <input
                  type="number"
                  value={adjustPointsDelta}
                  onChange={(e) => setAdjustPointsDelta(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="مثال: 100 أو -50"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-lg font-mono font-bold text-white placeholder-slate-600 outline-none transition text-center"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">سبب التعديل</label>
                <input
                  type="text"
                  value={adjustPointsReason}
                  onChange={(e) => setAdjustPointsReason(e.target.value)}
                  placeholder="مثال: مكافأة ولاء خاصة أو تعويض عن طلب"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
                  required
                />
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md"
                >
                  تأكيد وقيد النقاط
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdjustPointsOpen(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ➕ Modal: Add New Staff Member */}
      {isAddStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl">
            <button
              onClick={() => setIsAddStaffOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <UserPlus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">إضافة موظف جديد للمتجر</h3>
                <p className="text-xs text-slate-400">حدد الاسم والصلاحية وطريقة المسح</p>
              </div>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">اسم الموظف</label>
                <input
                  type="text"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="مثال: خالد الكاشير"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center space-x-1 rtl:space-x-reverse">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>رقم الجوال (لتسجيل الدخول الآمن)</span>
                </label>
                <input
                  type="tel"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition text-center"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">نوع الصلاحية (Role)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewStaffRole('cashier')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition flex flex-col items-center justify-center space-y-1 ${
                      newStaffRole === 'cashier'
                        ? 'bg-slate-800 border-slate-600 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>كاشير (Cashier)</span>
                    <span className="text-[10px] text-slate-500 font-normal">شاشة المسح ونقاط الفواتير</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewStaffRole('admin')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition flex flex-col items-center justify-center space-y-1 ${
                      newStaffRole === 'admin'
                        ? 'bg-slate-800 border-slate-600 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>مدير (Admin)</span>
                    <span className="text-[10px] text-slate-500 font-normal">إدارة الموظفين والسياسات</span>
                  </button>
                </div>
              </div>

              {newStaffRole === 'cashier' && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="text-xs font-medium text-slate-300 block">
                    صلاحية المسح ومكافحة التلاعب لهذا الكاشير:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewStaffCanManual(false)}
                      className={`py-2 px-2.5 rounded-xl border text-[11px] font-medium transition flex items-center justify-center space-x-1 rtl:space-x-reverse ${
                        !newStaffCanManual
                          ? 'bg-slate-800 border-slate-600 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>مسح إجباري فقط 🔒</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewStaffCanManual(true)}
                      className={`py-2 px-2.5 rounded-xl border text-[11px] font-medium transition flex items-center justify-center space-x-1 rtl:space-x-reverse ${
                        newStaffCanManual
                          ? 'bg-slate-800 border-slate-600 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>إدخال يدوي مسموح</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center space-x-1 rtl:space-x-reverse">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>رمز الدخول السريع (PIN Code)</span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={newStaffPin}
                  onChange={(e) => setNewStaffPin(e.target.value)}
                  placeholder="1234"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition tracking-widest text-center"
                  required
                />
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md"
                >
                  حفظ وإضافة الموظف
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddStaffOpen(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 🔑 Modal: Edit Staff PIN Code (تعديل الرقم السري للموظف) */}
      {isEditStaffPinModalOpen && editingStaffForPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-sm w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl">
            <button
              onClick={() => {
                setIsEditStaffPinModalOpen(false);
                setEditingStaffForPin(null);
              }}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">تعديل الرقم السري للموظف</h3>
                <p className="text-xs text-slate-400">
                  {editingStaffForPin.name} ({editingStaffForPin.role === 'admin' ? 'مدير المتجر' : 'كاشير'})
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveStaffPin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">
                  الرقم السري الجديد (4 إلى 6 أرقام):
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={editStaffPinValue}
                  onChange={(e) => setEditStaffPinValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="1234"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-4 py-3 text-lg font-mono font-bold text-amber-400 tracking-widest text-center outline-none transition"
                  required
                  autoFocus
                />
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  disabled={!editStaffPinValue.trim()}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md disabled:opacity-50"
                >
                  حفظ الرمز السري
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditStaffPinModalOpen(false);
                    setEditingStaffForPin(null);
                  }}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🍔 Modal: Add / Edit Product (إضافة أو تعديل منتج في المنيو) */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="max-w-xl w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsProductModalOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingCatalogItem ? 'تعديل منتج في المنيو 🍔' : 'إضافة منتج جديد للمنيو 🍔'}
                </h3>
                <p className="text-xs text-slate-400">أصناف الطعام، المشروبات، والمنتجات العادية مع الأقسام والإضافات</p>
              </div>
            </div>

            <form onSubmit={handleSaveProductSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">اسم المنتج / الصنف:</label>
                <input
                  type="text"
                  value={catNameInput}
                  onChange={(e) => setCatNameInput(e.target.value)}
                  placeholder="مثال: برجر دبل لحم بلدي، قهوة كيمكس، إلخ"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                  required
                  autoFocus
                />
              </div>

              {/* 🏷️ Interactive Product Categories Chips */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>القسم / التصنيف (اختر وسماً أو أضف قسماً جديداً):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowInlineCatAdder(!showInlineCatAdder)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
                  >
                    <span>{showInlineCatAdder ? 'إغلاق ✕' : '+ قسم جديد'}</span>
                  </button>
                </div>

                {/* Inline Quick Category Creator */}
                {showInlineCatAdder && (
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-amber-500/30 flex items-center gap-2 animate-fade-in">
                    <input
                      type="text"
                      value={inlineCatNameInput}
                      onChange={(e) => setInlineCatNameInput(e.target.value)}
                      placeholder="اسم القسم الجديد (مثال: برجر، حلويات، عصائر)..."
                      className="flex-1 bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuickAddInlineCategory('product');
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleQuickAddInlineCategory('product')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shrink-0 transition"
                    >
                      حفظ واختيار
                    </button>
                  </div>
                )}

                {/* Category Chips List */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {globalCategories
                    .filter((c) => c.type === 'product')
                    .map((cat) => {
                      const isSelected = catCategoryInput === cat.name;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCatCategoryInput(cat.name)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                            isSelected
                              ? 'bg-amber-500 text-black border-amber-400 shadow-md scale-105'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <span>{isSelected ? '✓' : ''}</span>
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                </div>

                <div className="pt-1.5">
                  <input
                    type="text"
                    value={catCategoryInput}
                    onChange={(e) => setCatCategoryInput(e.target.value)}
                    placeholder="أو اكتب اسم القسم يدوياً هنا..."
                    className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 outline-none focus:border-amber-400"
                    required
                  />
                </div>
              </div>

              {/* Price & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">السعر الأساسي (بالريال):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={catPriceInput}
                    onChange={(e) => setCatPriceInput(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="25"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-amber-400 text-center outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">الوصف والمكونات (اختياري):</label>
                  <input
                    type="text"
                    value={catDescInput}
                    onChange={(e) => setCatDescInput(e.target.value)}
                    placeholder="مثال: قطعة لحم بلاك أنجوس مع جبنة شيدر صوص خاص"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                  />
                </div>
              </div>

              {/* Image Uploader */}
              <div className="space-y-2 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <label className="text-xs font-bold text-slate-300 block">صورة المنتج (مع ضغط تلقائي للحجم):</label>
                <input
                  ref={catFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCatImageFileChange}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  {catImageUrlInput ? (
                    <div className="relative">
                      <img
                        src={catImageUrlInput}
                        alt="Preview"
                        className="w-14 h-14 rounded-xl object-cover border border-slate-700 bg-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => setCatImageUrlInput('')}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-900 border border-dashed border-slate-800 flex items-center justify-center text-slate-500 text-xl">
                      🍔
                    </div>
                  )}

                  <div className="flex-1 space-y-1.5">
                    <input
                      type="text"
                      value={catImageUrlInput}
                      onChange={(e) => setCatImageUrlInput(e.target.value)}
                      placeholder="رابط صورة مباشر أو ارفع من جهازك..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => catFileInputRef.current?.click()}
                      disabled={isCatImageCompressing}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 transition"
                    >
                      {isCatImageCompressing ? 'جاري الضغط...' : 'اختر صورة من جهازك'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 🏷️ Quick Tags from Global Modifier Groups */}
              {globalModifierGroups.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-amber-400" />
                      <span>وسوم الإضافات السريعة (اختر من مكتبة الإضافات المسبقة):</span>
                    </span>
                    <span className="text-[10px] text-slate-400">انقر للربط المباشر</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {globalModifierGroups.map((gMod) => {
                      const isAttached = catModifierGroups.some((g) => g.id === gMod.id || g.name === gMod.name);
                      return (
                        <button
                          key={gMod.id}
                          type="button"
                          onClick={() => handleToggleGlobalModifierOnItem(gMod)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                            isAttached
                              ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <span>{isAttached ? '✓' : '+'}</span>
                          <span>{gMod.name}</span>
                          <span className="text-[10px] opacity-75 font-mono">({gMod.options.length})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Interactive Modifiers Groups Builder */}
              <div className="space-y-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-200 block">
                      مجموعات الإضافات المرفقة بهذا المنتج:
                    </label>
                    <span className="text-[10px] text-slate-400">
                      يمكنك تخصيص الأسعار والخيارات الخاصة بهذا الصنف تحديداً
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddModifierGroup}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs font-bold flex items-center gap-1 transition"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ مجموعة مخصصة</span>
                  </button>
                </div>

                {catModifierGroups.map((grp, gIdx) => (
                  <div key={grp.id || gIdx} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={grp.title}
                        onChange={(e) => {
                          const updated = [...catModifierGroups];
                          updated[gIdx].title = e.target.value;
                          setCatModifierGroups(updated);
                        }}
                        placeholder="عنوان المجموعة (مثال: الإضافات)"
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white font-bold flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveModifierGroup(grp.id)}
                        className="text-rose-400 hover:text-rose-300 text-xs"
                      >
                        حذف المجموعة ✕
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {grp.options.map((opt, oIdx) => (
                        <div key={opt.id || oIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt.name}
                            onChange={(e) => {
                              const updated = [...catModifierGroups];
                              updated[gIdx].options[oIdx].name = e.target.value;
                              setCatModifierGroups(updated);
                            }}
                            placeholder="اسم الإضافة (مثال: جبنة إضافية)"
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white flex-1"
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400">+</span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={opt.price_delta}
                              onChange={(e) => {
                                const updated = [...catModifierGroups];
                                updated[gIdx].options[oIdx].price_delta = Number(e.target.value);
                                setCatModifierGroups(updated);
                              }}
                              placeholder="0"
                              className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-center font-mono text-amber-400"
                            />
                            <span className="text-[10px] text-slate-400">ر.س</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveModifierOption(grp.id, opt.id)}
                            className="text-slate-500 hover:text-rose-400 text-xs px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleAddModifierOption(grp.id)}
                        className="text-[11px] text-amber-400 hover:text-amber-300 font-bold block pt-1"
                      >
                        + إضافة خيار جديد للمجموعة
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Status Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <span className="text-slate-300 font-medium">حالة التوفر للطلب الفوري:</span>
                <button
                  type="button"
                  onClick={() => setCatIsAvailable(!catIsAvailable)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                    catIsAvailable
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : 'bg-rose-500/15 text-rose-400 border-rose-500/40'
                  }`}
                >
                  {catIsAvailable ? '● متاح للطلب' : '○ غير متوفر مؤقتاً'}
                </button>
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md"
                >
                  {editingCatalogItem ? 'حفظ تعديلات المنتج 🍔' : 'إضافة المنتج للمنيو 🍔'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 💇‍♂️ Modal: Add / Edit Service (إضافة أو تعديل خدمة وموعد) */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="max-w-xl w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsServiceModalOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Scissors className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingCatalogItem ? 'تعديل خدمة حجز 💇‍♂️' : 'إضافة خدمة جديدة للحجز والمواعيد 💇‍♂️'}
                </h3>
                <p className="text-xs text-slate-400">خدمات الصالون، العناية، الاستشارات، المواعيد والباقات التي تتطلب حجز موعد ومختص</p>
              </div>
            </div>

            <form onSubmit={handleSaveServiceSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">اسم الخدمة:</label>
                <input
                  type="text"
                  value={catNameInput}
                  onChange={(e) => setCatNameInput(e.target.value)}
                  placeholder="مثال: قص وتصفيف شعر VIP، تنظيف بشرة ملكي، استشارة خاصة"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                  required
                  autoFocus
                />
              </div>

              {/* 🏷️ Interactive Service Categories Chips */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    <span>قسم الخدمة (اختر وسماً أو أضف قسماً جديداً):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowInlineCatAdder(!showInlineCatAdder)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
                  >
                    <span>{showInlineCatAdder ? 'إغلاق ✕' : '+ قسم خدمات جديد'}</span>
                  </button>
                </div>

                {/* Inline Quick Service Category Creator */}
                {showInlineCatAdder && (
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-blue-500/30 flex items-center gap-2 animate-fade-in">
                    <input
                      type="text"
                      value={inlineCatNameInput}
                      onChange={(e) => setInlineCatNameInput(e.target.value)}
                      placeholder="اسم قسم الخدمات الجديد (مثال: حلاقة، عناية بالبشرة، سبا)..."
                      className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuickAddInlineCategory('service');
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleQuickAddInlineCategory('service')}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shrink-0 transition"
                    >
                      حفظ واختيار
                    </button>
                  </div>
                )}

                {/* Service Category Chips List */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {globalCategories
                    .filter((c) => c.type === 'service')
                    .map((cat) => {
                      const isSelected = catCategoryInput === cat.name;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCatCategoryInput(cat.name)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-500 shadow-md scale-105'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <span>{isSelected ? '✓' : ''}</span>
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                </div>

                <div className="pt-1.5">
                  <input
                    type="text"
                    value={catCategoryInput}
                    onChange={(e) => setCatCategoryInput(e.target.value)}
                    placeholder="أو اكتب اسم قسم الخدمة يدوياً..."
                    className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 outline-none focus:border-blue-400"
                    required
                  />
                </div>
              </div>

              {/* Service Duration & Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300 block">مدة الجلسة (بالدقائق):</label>
                    <span className="text-[10px] text-blue-400 font-mono font-bold">
                      {catDurationInput || 30} دقيقة
                    </span>
                  </div>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={catDurationInput}
                    onChange={(e) => setCatDurationInput(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="30"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-xl px-4 py-2 text-xs font-mono text-white text-center outline-none"
                    required
                  />
                  {/* Quick Duration Buttons */}
                  <div className="flex gap-1 pt-0.5">
                    {[15, 30, 45, 60, 90, 120].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setCatDurationInput(mins)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-mono font-bold border transition ${
                          catDurationInput === mins
                            ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {mins}د
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">سعر الخدمة (بالريال):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={catPriceInput}
                    onChange={(e) => setCatPriceInput(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="50"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-amber-400 text-center outline-none"
                    required
                  />
                </div>
              </div>

              {/* Description & Details */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">تفاصيل وما تشمله الخدمة (اختياري):</label>
                <textarea
                  value={catDescInput}
                  onChange={(e) => setCatDescInput(e.target.value)}
                  placeholder="مثال: غسيل شعر مع ماسك ترطيب، وتصفيف سيشوار مع زيت معالج..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-xl px-4 py-2 text-xs text-white outline-none"
                />
              </div>

              {/* Image Uploader */}
              <div className="space-y-2 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <label className="text-xs font-bold text-slate-300 block">صورة الخدمة (مع ضغط تلقائي للحجم):</label>
                <input
                  ref={catFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCatImageFileChange}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  {catImageUrlInput ? (
                    <div className="relative">
                      <img
                        src={catImageUrlInput}
                        alt="Preview"
                        className="w-14 h-14 rounded-xl object-cover border border-slate-700 bg-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => setCatImageUrlInput('')}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-900 border border-dashed border-slate-800 flex items-center justify-center text-slate-500 text-xl">
                      💇‍♂️
                    </div>
                  )}

                  <div className="flex-1 space-y-1.5">
                    <input
                      type="text"
                      value={catImageUrlInput}
                      onChange={(e) => setCatImageUrlInput(e.target.value)}
                      placeholder="رابط صورة مباشر أو ارفع من جهازك..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => catFileInputRef.current?.click()}
                      disabled={isCatImageCompressing}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 transition"
                    >
                      {isCatImageCompressing ? 'جاري الضغط...' : 'اختر صورة من جهازك'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 🏷️ Service Upgrades & Add-ons */}
              {globalModifierGroups.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-blue-400" />
                      <span>ترقيات وخيارات الخدمة الإضافية (اختر من مكتبة الإضافات):</span>
                    </span>
                    <span className="text-[10px] text-slate-400">انقر للربط المباشر</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {globalModifierGroups.map((gMod) => {
                      const isAttached = catModifierGroups.some((g) => g.id === gMod.id || g.name === gMod.name);
                      return (
                        <button
                          key={gMod.id}
                          type="button"
                          onClick={() => handleToggleGlobalModifierOnItem(gMod)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                            isAttached
                              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <span>{isAttached ? '✓' : '+'}</span>
                          <span>{gMod.name}</span>
                          <span className="text-[10px] opacity-75 font-mono">({gMod.options.length})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Interactive Service Modifiers Builder */}
              <div className="space-y-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-200 block">
                      خيارات وترقيات مخصصة لهذه الخدمة:
                    </label>
                    <span className="text-[10px] text-slate-400">
                      مثل: إضافة مساج رأس، ماسك إضافي، زيت خاص
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddModifierGroup}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 text-xs font-bold flex items-center gap-1 transition"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ ترقية مخصصة</span>
                  </button>
                </div>

                {catModifierGroups.map((grp, gIdx) => (
                  <div key={grp.id || gIdx} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={grp.title}
                        onChange={(e) => {
                          const updated = [...catModifierGroups];
                          updated[gIdx].title = e.target.value;
                          setCatModifierGroups(updated);
                        }}
                        placeholder="عنوان الترقية (مثال: خدمات إضافية)"
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white font-bold flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveModifierGroup(grp.id)}
                        className="text-rose-400 hover:text-rose-300 text-xs"
                      >
                        حذف ✕
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {grp.options.map((opt, oIdx) => (
                        <div key={opt.id || oIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt.name}
                            onChange={(e) => {
                              const updated = [...catModifierGroups];
                              updated[gIdx].options[oIdx].name = e.target.value;
                              setCatModifierGroups(updated);
                            }}
                            placeholder="اسم الخيار (مثال: صبغة شعر)"
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white flex-1"
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400">+</span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={opt.price_delta}
                              onChange={(e) => {
                                const updated = [...catModifierGroups];
                                updated[gIdx].options[oIdx].price_delta = Number(e.target.value);
                                setCatModifierGroups(updated);
                              }}
                              placeholder="0"
                              className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-center font-mono text-amber-400"
                            />
                            <span className="text-[10px] text-slate-400">ر.س</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveModifierOption(grp.id, opt.id)}
                            className="text-slate-500 hover:text-rose-400 text-xs px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleAddModifierOption(grp.id)}
                        className="text-[11px] text-blue-400 hover:text-blue-300 font-bold block pt-1"
                      >
                        + إضافة خيار جديد للترقية
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Status Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <span className="text-slate-300 font-medium">حالة التوفر للحجز والمواعيد:</span>
                <button
                  type="button"
                  onClick={() => setCatIsAvailable(!catIsAvailable)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                    catIsAvailable
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : 'bg-rose-500/15 text-rose-400 border-rose-500/40'
                  }`}
                >
                  {catIsAvailable ? '● متاحة للحجز' : '○ معطلة مؤقتاً'}
                </button>
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm transition shadow-md"
                >
                  {editingCatalogItem ? 'حفظ تعديلات الخدمة 💇‍♂️' : 'إضافة الخدمة للحجز 💇‍♂️'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsServiceModalOpen(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 💇‍♂️ Modal: Add / Edit Specialist (إضافة أو تعديل مختص / موظف خدمة) */}
      {isSpecialistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsSpecialistModalOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingSpecialist ? 'تعديل بيانات المختص' : 'إضافة مختص / مقدم خدمة جديد'}
                </h3>
                <p className="text-xs text-slate-400">حدد الاسم، التخصص، الجوال، وأوقات العمل</p>
              </div>
            </div>

            <form onSubmit={handleSaveSpecialistSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">اسم المختص / الموظف:</label>
                <input
                  type="text"
                  value={specNameInput}
                  onChange={(e) => setSpecNameInput(e.target.value)}
                  placeholder="مثال: أحمد الحلاق أو د. سارة"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">المسمى الوظيفي / التخصص:</label>
                <input
                  type="text"
                  value={specSpecialtyInput}
                  onChange={(e) => setSpecSpecialtyInput(e.target.value)}
                  placeholder="مثال: أخصائي حلاقة وتصفيف، أخصائية عناية..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">رقم الجوال (اختياري للتواصل):</label>
                <input
                  type="tel"
                  value={specPhoneInput}
                  onChange={(e) => setSpecPhoneInput(e.target.value)}
                  placeholder="05xxxxxxxx"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs font-mono text-white text-center outline-none"
                />
              </div>

              {/* Image / Avatar Uploader */}
              <div className="space-y-2 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <label className="text-xs font-bold text-slate-300 block">صورة المختص / الموظف (مع ضغط تلقائي للحجم):</label>
                <input
                  ref={specFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSpecAvatarFileChange}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  {specAvatarUrlInput ? (
                    <div className="relative shrink-0">
                      <img
                        src={specAvatarUrlInput}
                        alt="Specialist Avatar"
                        className="w-14 h-14 rounded-2xl object-cover border border-slate-700 bg-slate-900 shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setSpecAvatarUrlInput('')}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] shadow"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-dashed border-slate-800 flex items-center justify-center text-slate-500 text-xl shrink-0">
                      💇‍♂️
                    </div>
                  )}

                  <div className="flex-1 space-y-1.5">
                    <input
                      type="text"
                      value={specAvatarUrlInput}
                      onChange={(e) => setSpecAvatarUrlInput(e.target.value)}
                      placeholder="رابط صورة مباشر أو ارفع من جهازك..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-400"
                    />
                    <button
                      type="button"
                      onClick={() => specFileInputRef.current?.click()}
                      disabled={isSpecImageCompressing}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 transition flex items-center gap-1.5"
                    >
                      <span>{isSpecImageCompressing ? 'جاري الضغط...' : 'اختر صورة من جهازك 📷'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 🏷️ Service Categories / Specialties (أقسام وتخصصات المختص) */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 block">
                    الأقسام والخدمات المؤهل لها (تحديد متعدد):
                  </label>
                  <span className="text-[10px] text-blue-400 font-mono font-bold">
                    {specCategoriesInput.includes('ALL')
                      ? '⭐ شامل كل الأقسام'
                      : `${specCategoriesInput.length} أقسام محددة`}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  لن يظهر هذا المختص للعميل إلا عند طلب الخدمات التابعة للأقسام المحددة هنا
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {/* Option: ALL */}
                  <button
                    type="button"
                    onClick={() => {
                      if (specCategoriesInput.includes('ALL')) {
                        setSpecCategoriesInput([]);
                      } else {
                        setSpecCategoriesInput(['ALL']);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                      specCategoriesInput.includes('ALL')
                        ? 'bg-amber-500 text-black border-amber-400 shadow-md font-extrabold'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <span>{specCategoriesInput.includes('ALL') ? '✓' : ''}</span>
                    <span>⭐ جميع الأقسام (شامل)</span>
                  </button>

                  {/* Dynamic Service Categories */}
                  {globalCategories
                    .filter((c) => c.type === 'service')
                    .map((cat) => {
                      const isSelected =
                        !specCategoriesInput.includes('ALL') && specCategoriesInput.includes(cat.name);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            let next: string[];
                            if (specCategoriesInput.includes('ALL')) {
                              next = [cat.name];
                            } else if (specCategoriesInput.includes(cat.name)) {
                              next = specCategoriesInput.filter((c) => c !== cat.name);
                            } else {
                              next = [...specCategoriesInput, cat.name];
                            }
                            if (next.length === 0) next = ['ALL'];
                            setSpecCategoriesInput(next);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-500 shadow-md font-bold'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <span>{isSelected ? '✓' : ''}</span>
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Working Hours */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-200 block">ساعات العمل المتاحة للحجز:</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">من الساعة:</span>
                    <input
                      type="time"
                      value={specStartTime}
                      onChange={(e) => setSpecStartTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">إلى الساعة:</span>
                    <input
                      type="time"
                      value={specEndTime}
                      onChange={(e) => setSpecEndTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Working Days */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">أيام العمل الأسبوعية:</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'Sun', label: 'الأحد' },
                    { id: 'Mon', label: 'الاثنين' },
                    { id: 'Tue', label: 'الثلاثاء' },
                    { id: 'Wed', label: 'الأربعاء' },
                    { id: 'Thu', label: 'الخميس' },
                    { id: 'Fri', label: 'الجمعة' },
                    { id: 'Sat', label: 'السبت' },
                  ].map((day) => {
                    const isSelected = specWorkingDays.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSpecWorkingDays(specWorkingDays.filter((d) => d !== day.id));
                          } else {
                            setSpecWorkingDays([...specWorkingDays, day.id]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm transition shadow-md"
                >
                  حفظ المختص
                </button>
                <button
                  type="button"
                  onClick={() => setIsSpecialistModalOpen(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🏷️ Modal: Add / Edit Global Category */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="max-w-sm w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingCategory ? 'تعديل القسم' : 'إضافة قسم جديد'}
                </h3>
                <p className="text-xs text-slate-400">حدد اسم ونوع القسم للمنتجات أو الخدمات</p>
              </div>
            </div>

            <form onSubmit={handleSaveCategorySubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">اسم القسم:</label>
                <input
                  type="text"
                  value={categoryNameInput}
                  onChange={(e) => setCategoryNameInput(e.target.value)}
                  placeholder="مثال: وجبات رئيسية، مشروبات باردة، خدمات الحلاقة..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">نوع القسم:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryTypeInput('product')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      categoryTypeInput === 'product'
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span>🍔 منتجات ومنيو</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTypeInput('service')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      categoryTypeInput === 'service'
                        ? 'bg-blue-500/10 border-blue-500/40 text-blue-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span>💇‍♂️ خدمات ومواعيد</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md"
                >
                  حفظ القسم
                </button>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🏷️ Modal: Add / Edit Global Modifier Group */}
      {isModifierGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsModifierGroupModalOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingModifierGroup ? 'تعديل مجموعة الإضافات' : 'إضافة مجموعة خيارات جديدة'}
                </h3>
                <p className="text-xs text-slate-400">حدد اسم المجموعة، الوسم، والخيارات مع فارق السعر</p>
              </div>
            </div>

            <form onSubmit={handleSaveModifierGroupSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">اسم المجموعة:</label>
                  <input
                    type="text"
                    value={modGroupNameInput}
                    onChange={(e) => setModGroupNameInput(e.target.value)}
                    placeholder="مثال: حجم المشروب"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-bold"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">الوسم التعريفي (Tag):</label>
                  <input
                    type="text"
                    value={modGroupTagInput}
                    onChange={(e) => setModGroupTagInput(e.target.value)}
                    placeholder="size أو sauce"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none"
                  />
                </div>
              </div>

              {/* Behavior toggles */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setModGroupRequired(!modGroupRequired)}
                  className={`p-2.5 rounded-xl border font-bold transition flex items-center justify-center gap-1 ${
                    modGroupRequired
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span>{modGroupRequired ? '⚠️ إجباري الاختيار' : '💡 اختياري'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModGroupAllowMultiple(!modGroupAllowMultiple)}
                  className={`p-2.5 rounded-xl border font-bold transition flex items-center justify-center gap-1 ${
                    modGroupAllowMultiple
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span>{modGroupAllowMultiple ? 'متعدد الخيارات' : 'خيار واحد فقط'}</span>
                </button>
              </div>

              {/* Options Builder */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 block">الخيارات والأسعار الإضافية:</label>
                  <button
                    type="button"
                    onClick={handleAddOptionToGlobalGroup}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold"
                  >
                    + إضافة خيار
                  </button>
                </div>

                <div className="space-y-2">
                  {modGroupOptions.map((opt, idx) => (
                    <div key={opt.id || idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt.name}
                        onChange={(e) => {
                          const updated = [...modGroupOptions];
                          updated[idx].name = e.target.value;
                          setModGroupOptions(updated);
                        }}
                        placeholder="اسم الخيار (مثال: حجم كبير، صوص ثوم...)"
                        className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white flex-1"
                        required
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400">+</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={opt.price_delta}
                          onChange={(e) => {
                            const updated = [...modGroupOptions];
                            updated[idx].price_delta = Number(e.target.value);
                            setModGroupOptions(updated);
                          }}
                          placeholder="0"
                          className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-center font-mono text-amber-400"
                        />
                        <span className="text-[10px] text-slate-400">ر.س</span>
                      </div>
                      {modGroupOptions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOptionFromGlobalGroup(opt.id)}
                          className="text-slate-500 hover:text-rose-400 text-xs px-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md"
                >
                  حفظ مجموعة الخيارات
                </button>
                <button
                  type="button"
                  onClick={() => setIsModifierGroupModalOpen(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ➕ Modal: Add / Edit Privilege & Coupon */}
      {isPrivilegeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="max-w-lg w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsPrivilegeModalOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <Gift className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingPrivilege ? 'تعديل الامتياز / الكوبون' : 'إضافة امتياز / كوبون جديد'}
                </h3>
                <p className="text-xs text-slate-400">حدد التكلفة بالنقاط، المخزون الأقصى، وساعات الصرف المسموحة</p>
              </div>
            </div>

            <form onSubmit={handleSavePrivilegeSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">عنوان العرض / الكوبون</label>
                <input
                  type="text"
                  value={privTitleInput}
                  onChange={(e) => setPrivTitleInput(e.target.value)}
                  placeholder="مثال: خصم 20%، مشروب مجاني..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">وصف وتفاصيل الامتياز</label>
                <textarea
                  value={privDescInput}
                  onChange={(e) => setPrivDescInput(e.target.value)}
                  rows={2}
                  placeholder="شرح شروط ومميزات هذا العرض للعميل..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">التكلفة بالنقاط (Points)</label>
                  <input
                    type="number"
                    min="0"
                    value={privCostPoints}
                    onChange={(e) => setPrivCostPoints(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="50"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-white outline-none transition"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">المخزون الإجمالي المتاح</label>
                  <input
                    type="number"
                    min="1"
                    value={privQuantityLimit}
                    onChange={(e) => setPrivQuantityLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="فارغ = لا نهائي"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition"
                  />
                  <span className="text-[10px] text-slate-500 block">إجمالي ما يمكن صرفه</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">الحد لكل عميل</label>
                  <input
                    type="number"
                    min="1"
                    value={privPerCustomerLimit}
                    onChange={(e) => setPrivPerCustomerLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="مثلاً: 1"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-white placeholder-slate-600 outline-none transition"
                  />
                  <span className="text-[10px] text-slate-500 block">مرات الشراء المسموحة</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">الرتبة المطلوبة لفتح العرض</label>
                <select
                  value={privRequiredTierId}
                  onChange={(e) => setPrivRequiredTierId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-medium"
                >
                  <option value="">متاح لجميع العملاء (ضيف فما فوق)</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.tier_name} ({t.required_xp} XP)
                    </option>
                  ))}
                </select>
              </div>

              {/* Time-Lock Hours */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-200 flex items-center space-x-1.5 rtl:space-x-reverse">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>ساعات الصرف المسموحة للكوبون (Time-Lock):</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">من الساعة:</label>
                    <input
                      type="time"
                      value={privStartTime}
                      onChange={(e) => setPrivStartTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">إلى الساعة:</label>
                    <input
                      type="time"
                      value={privEndTime}
                      onChange={(e) => setPrivEndTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  * إذا تركته فارغاً سيكون الكوبون متاحاً للصرف 24/7 دون تجميد.
                </p>
              </div>

              {/* Privilege Image Upload with Auto-Compression */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300 block">
                  صورة العرض / الكوبون:
                </label>

                <input
                  ref={privFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePrivFileChange}
                  className="hidden"
                />

                <div className="flex items-center space-x-4 rtl:space-x-reverse">
                  {privImageUrl ? (
                    <div className="relative group shrink-0">
                      <img
                        src={privImageUrl}
                        alt="Privilege Preview"
                        className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shadow-md bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPrivImageUrl('');
                          setPrivLogoStats(null);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-[10px] shadow hover:bg-rose-500 transition"
                        title="حذف الصورة"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-slate-900 border-2 border-dashed border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => privFileInputRef.current?.click()}
                    disabled={isPrivCompressing}
                    className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-2 rtl:space-x-reverse transition"
                  >
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span>{isPrivCompressing ? 'جاري ضغط الصورة...' : 'اختر صورة من جهازك'}</span>
                  </button>
                </div>

                {privLogoStats && (
                  <p className="text-[11px] text-emerald-400 font-medium">
                    تم ضغط الصورة بنسبة <strong>{privLogoStats.savingsPercent}%</strong> (الحجم: {privLogoStats.compressedSizeKB} KB)
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center space-x-2 rtl:space-x-reverse text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privIsActive}
                    onChange={(e) => setPrivIsActive(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-amber-500"
                  />
                  <span>تفعيل هذا الامتياز (Active)</span>
                </label>

                <label className="flex items-center space-x-2 rtl:space-x-reverse text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privIsHidden}
                    onChange={(e) => setPrivIsHidden(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-amber-500"
                  />
                  <span>إخفاء العرض عن العملاء (Hidden)</span>
                </label>
              </div>

              <div className="pt-3 flex items-center space-x-3 rtl:space-x-reverse border-t border-slate-800">
                <button
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md"
                >
                  {editingPrivilege ? 'حفظ التعديلات' : 'إنشاء الامتياز والكوبون'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrivilegeModalOpen(false)}
                  className="px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 💳 Modal: Cashier Capacity Paywall (200 SAR One-time) */}
      {isCashierPaywallOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-amber-500/30 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>

            <button
              onClick={() => setIsCashierPaywallOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative z-10 space-y-5">
              <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                  <CreditCard className="w-7 h-7" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-wider">
                    ترقية الطاقة الاستيعابية
                  </span>
                  <h3 className="text-xl font-black text-white mt-1">إضافة مقعد كاشير إضافي</h3>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-baseline justify-between border-b border-slate-800/80 pb-3">
                  <span className="text-xs text-slate-400 font-medium">رسوم التأسيس والربط:</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-amber-400 font-mono">200</span>
                    <span className="text-xs font-bold text-slate-300">ريال سعودي</span>
                  </div>
                </div>

                <div className="text-xs text-slate-400 space-y-2">
                  <div className="flex items-center space-x-2 rtl:space-x-reverse text-slate-300">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>رسوم تأسيس تُدفع لمرة واحدة فقط (One-time Setup)</span>
                  </div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse text-slate-300">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>صلاحيات مستقلة وسجل تدقيق أمني (Audit Trail) خاص بكل موظف</span>
                  </div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse text-slate-300">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>تفعيل فوري للمقعد دون انقطاع العمل في نقاط البيع</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed text-center">
                لقد بلغت الحد الأقصى الافتراضي ({storeWallet?.cashier_limit || 2} حسابات كاشير). يمكنك إتمام التفعيل الفوري الآن للمتابعة.
              </p>

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handlePurchaseExtraCashier}
                  disabled={isProcessingUpgrade}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-sm shadow-lg shadow-amber-500/20 transition flex items-center justify-center space-x-2 rtl:space-x-reverse disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{isProcessingUpgrade ? 'جاري التفعيل ومعالجة الطلب...' : 'دفع 200 ر.س وتفعيل فوري (Sandbox) 💳'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCashierPaywallOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-transparent hover:bg-slate-800 text-slate-400 text-xs font-semibold transition text-center"
                >
                  إلغاء والعودة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ Modal: Security Warning on Granting Manual Phone Input */}
      {securityWarningStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-rose-500/40 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>

            <div className="relative z-10 space-y-5">
              <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-inner">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-wider">
                    تحذير أمني عالي الخطورة
                  </span>
                  <h3 className="text-lg font-black text-white mt-1">صلاحية إدخال الجوال يدوياً</h3>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/40 text-rose-200 text-xs space-y-2.5 leading-relaxed">
                <p>
                  أنت على وشك منح الموظف <strong className="text-white underline">{securityWarningStaff.name}</strong> إمكانية إدخال أرقام الجوالات يدوياً في شاشة الكاشير.
                </p>
                <div className="p-3 rounded-xl bg-black/40 border border-rose-800/30 space-y-1 text-[11px] text-slate-300">
                  <p className="font-bold text-rose-300">⚠️ المخاطر المحتملة (Risk of Fraud):</p>
                  <p>• قد يقوم الكاشير بتسجيل نقاط لحسابات وهمية أو أشخاص غير متواجدين في المتجر.</p>
                  <p>• النظام الآمن الموصى به يعتمد حصرياً على مسح كاميرا QR لإثبات الحضور الفعلي للعميل.</p>
                  <p>• سيتم وسم وتتبع أي عملية يدوية في سجل التدقيق المالي والأمني (Audit Logs).</p>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleConfirmGrantManualPermission}
                  className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg shadow-rose-600/20 transition flex items-center justify-center space-x-2 rtl:space-x-reverse"
                >
                  <Unlock className="w-4 h-4" />
                  <span>أتحمل المسؤولية، تأكيد ومنح الصلاحية للموظف</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSecurityWarningStaff(null)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition text-center"
                >
                  تراجع (الإبقاء على الوضع الآمن فقط)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ Modal: WhatsApp Quota Exhausted */}
      {isQuotaExhaustedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-amber-500/30 relative shadow-2xl">
            <button
              onClick={() => setIsQuotaExhaustedModalOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                <AlertCircle className="w-7 h-7" />
              </div>

              <h3 className="text-lg font-black text-white">
                تم استهلاك رصيد رسائل واتساب الشهري
              </h3>

              <p className="text-xs text-slate-400 leading-relaxed">
                لقد استنفدت كامل الباقة الشهرية لرسائل واتساب المباشرة ({storeWallet?.wa_quota ?? 0} رسالة متبقية). يمكنك دائماً استخدام ميزة التوجيه المباشر المجاني wa.me أو شحن رصيد إضافي.
              </p>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 text-right space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">الرصيد المتاح:</span>
                  <span className="text-rose-400 font-bold">0 رسالة</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">حالة التجديد:</span>
                  <span className="text-slate-300">أول كل شهر ميلادي تلقائياً</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuotaExhaustedModalOpen(false)}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition"
                >
                  حسناً، فهمت ذلك
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 💳 Sandbox Payment Checkout Modal */}
      {sandboxPaymentConfig && (
        <SandboxPaymentModal
          isOpen={sandboxPaymentConfig.isOpen}
          onClose={() => setSandboxPaymentConfig(null)}
          title={sandboxPaymentConfig.title}
          itemDescription={sandboxPaymentConfig.itemDescription}
          amount={sandboxPaymentConfig.amount}
          currency="ر.س"
          storeName={store.name}
          onProcessPayment={handleProcessSandboxPayment}
        />
      )}

      {/* 🎉 Modal: Payment & Subscription Success Invoice Receipt */}
      {paymentSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-emerald-500/40 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>

            <button
              onClick={() => setPaymentSuccessModal(null)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative z-10 space-y-5 text-center">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div>
                <span className="px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                  تم استلام وتأكيد الدفع بنجاح
                </span>
                <h3 className="text-xl font-black text-white mt-1.5">
                  {paymentSuccessModal.invoice_type === 'setup'
                    ? '🎉 تم تفعيل المتجر واشتراك الشهر الأول!'
                    : '🎉 تم تجديد الاشتراك الشهري بنجاح!'}
                </h3>
              </div>

              {/* Receipt Summary Card */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-right font-mono">
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400 font-sans">رقم الفاتورة الإلكترونية:</span>
                  <span className="text-white font-bold">{paymentSuccessModal.invoice_number}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400 font-sans">المبلغ المسدد:</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    {paymentSuccessModal.amount} {paymentSuccessModal.currency}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400 font-sans">بوابة الدفع:</span>
                  <span className="text-slate-300 uppercase font-sans">
                    {paymentSuccessModal.payment_method} ({paymentSuccessModal.gateway})
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400 font-sans">تاريخ الانتهاء الجديد:</span>
                  <span className="text-amber-400 font-bold">
                    {store.subscription_end_date
                      ? new Date(store.subscription_end_date).toLocaleDateString('ar-SA')
                      : '+30 يوماً'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPaymentSuccessModal(null)}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-sm transition shadow-lg shadow-emerald-500/20"
              >
                متابعة إلى لوحة التحكم 🚀
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default StoreAdmin;

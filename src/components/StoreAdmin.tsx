import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Store,
  Customer,
  Tier,
  Privilege,
  AuditLog,
  StoreStaff,
  StoreBranch,
  CustomerCoupon,
  StoreBanner,
  StoreWallet,
  StoreInvoice,
  StoreSubscriptionStatus,
  CatalogItem,
  CatalogModifierGroup,
  CatalogModifierOption,
  StoreFulfillmentSettings,
  StorePaymentConfig,
  OnlineGatewayProvider,
  SoftPOSProvider,
  StoreSpecialist,
  GlobalCategory,
  GlobalModifierGroup,
  ServiceBooking,
  BillingPlan,
  getPlanDurationLabel,
  getPlanPriceSuffix,
  resolveUnifiedStage,
  getStoreUnifiedStage,
  getStoreActiveModules,
  PublicPlatformIntegrations,
} from '../types';
import { LoyaltyService, normalizeStore, getSupabaseClient } from '../lib/supabase';
import { getActiveTenantConfig } from '../config/tenant';
import { LoyaltyEvents } from '../lib/events';
import { saveActiveStoreBranding, BRAND_PRESETS, BrandThemePreset } from '../lib/storeBranding';
import { debounce } from '../lib/debounce';
import { INITIAL_STORE } from '../lib/demoData';
import { compressImage, CompressionResult } from '../lib/imageCompressor';
import { StaffLoginGate } from './StaffLoginGate';
import { StoreAnalyticsView } from './merchant/StoreAnalyticsView';
import { SandboxPaymentModal } from './SandboxPaymentModal';
import { NotificationBell } from './NotificationBell';
import { clearAllInboxNotifications, saveInboxNotification } from '../lib/notifications';
import { playBeepSound } from '../lib/sound';
import { MenuAutoBuilderModal } from './merchant/MenuAutoBuilderModal';
import { POSOperationsTab } from './merchant/POSOperationsTab';
import { SubTabsHubGrid, SubTabItem } from './merchant/SubTabsHubGrid';
import { SubSectionFocusedHeader } from './merchant/SubSectionFocusedHeader';
import { exportToExcel } from '../lib/excelExporter';
import {
  Users,
  Coins,
  Flame,
  Radar,
  Send,
  Bell,
  Clock,
  ShieldCheck,
  TrendingUp,
  FileText,
  Sparkles,
  Calendar,
  AlertTriangle,
  Award,
  Lock,
  PauseCircle,
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
  Plus,
  PlusCircle,
  Download,
  FileSpreadsheet,
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
  Monitor,
  Truck,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Settings,
  CreditCard,
  MessageSquare,
  RefreshCw,
  Utensils,
  Car,
  Building2,
  Ticket,
  Receipt,
  ArrowRight,
  ArrowLeft,
  Tablet,
  Radio,
  HelpCircle,
  Info,
  Wifi,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BranchesManagementTab } from './BranchesManagementTab';
import { InventoryManagementTab } from './merchant/InventoryManagementTab';
import { WalletPassService } from '../lib/walletPassService';

interface StoreAdminProps {
  store: Store;
}

type AdminTab =
  | 'hub'
  | 'analytics'
  | 'catalog'
  | 'loyalty'
  | 'customers'
  | 'pos_operations'
  | 'staff'
  | 'branches'
  | 'settings'
  | 'inventory';

type SettingsSection =
  | 'hub'
  | 'branding'
  | 'payments'
  | 'modules'
  | 'security'
  | 'integrations'
  | 'billing'
  | 'wallet_passes';

export const StoreAdmin: React.FC<StoreAdminProps> = ({ store: initialStore }) => {
  const currentStore = initialStore || INITIAL_STORE;
  const [store, setStore] = useState<Store>(currentStore);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [privileges, setPrivileges] = useState<Privilege[]>([]);
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [staffList, setStaffList] = useState<StoreStaff[]>([]);
  const [branches, setBranches] = useState<StoreBranch[]>([]);
  const [storeWallet, setStoreWallet] = useState<StoreWallet | null>(null);
  const [telegramChatId, setTelegramChatId] = useState(store?.telegram_chat_id || '');
  const [showManualTelegram, setShowManualTelegram] = useState(false);
  const [publicIntegrations, setPublicIntegrations] = useState<PublicPlatformIntegrations | null>(null);
  const [loading, setLoading] = useState(true);

  // Active Admin Navigation Tab & Sub-Sections
  const [activeTab, setActiveTab] = useState<AdminTab>('hub');
  const [catalogSection, setCatalogSection] = useState<'hub' | 'products' | 'services' | 'modifiers' | 'fulfillment'>('hub');
  const [loyaltySection, setLoyaltySection] = useState<'hub' | 'perks' | 'tiers' | 'coupons'>('hub');
  const [customersSection, setCustomersSection] = useState<'hub' | 'crm' | 'logs'>('hub');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('hub');
  const [showQuickLinks, setShowQuickLinks] = useState(false);
  const [showQuickLinksModal, setShowQuickLinksModal] = useState(false);

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
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'warm_cream' | 'system'>(
    ((currentStore?.theme_mode as any) || 'light')
  );
  const [backgroundColor, setBackgroundColor] = useState<string>(
    currentStore?.background_color || (currentStore?.theme_mode === 'warm_cream' ? '#FAF6F0' : currentStore?.theme_mode === 'dark' ? '#080B11' : '#F8FAFC')
  );
  const [cardColor, setCardColor] = useState<string>(
    currentStore?.card_color || (currentStore?.theme_mode === 'dark' ? '#131A26' : '#FFFFFF')
  );
  const [selectedThemePreset, setSelectedThemePreset] = useState<string>(
    currentStore?.theme_preset || ''
  );
  // 🛡️ Operational Portal Theme Lock: StoreAdmin UI is strictly locked to Radar Pro High-Contrast Dark Slate
  // (themeMode, primaryColor, secondaryColor, backgroundColor, cardColor apply strictly to Customer Portal & Live Simulator)
  const isDarkTheme = true;
  const isWarmTheme = false;
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
  const [isAiMenuBuilderOpen, setIsAiMenuBuilderOpen] = useState(false);
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
  const [catalogActionError, setCatalogActionError] = useState<string | null>(null);
  const [isCatImageCompressing, setIsCatImageCompressing] = useState(false);
  const catFileInputRef = useRef<HTMLInputElement | null>(null);

  // 💇‍♂️ Services & Specialists State
  const [specialists, setSpecialists] = useState<StoreSpecialist[]>([]);
  const [isSpecialistModalOpen, setIsSpecialistModalOpen] = useState(false);
  const [editingSpecialist, setEditingSpecialist] = useState<StoreSpecialist | null>(null);
  const [specNameInput, setSpecNameInput] = useState('');
  const [specSpecialtyInput, setSpecSpecialtyInput] = useState('');
  const [specBranchIdInput, setSpecBranchIdInput] = useState<string>(''); // فرع المختص
  const [specPhoneInput, setSpecPhoneInput] = useState('');
  const [specAvatarUrlInput, setSpecAvatarUrlInput] = useState('');
  const [specCategoriesInput, setSpecCategoriesInput] = useState<string[]>(['ALL']);
  const [isSpecImageCompressing, setIsSpecImageCompressing] = useState(false);
  const specFileInputRef = useRef<HTMLInputElement | null>(null);
  const [specWorkingDays, setSpecWorkingDays] = useState<string[]>(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat']);
  const [specStartTime, setSpecStartTime] = useState('10:00');
  const [specEndTime, setSpecEndTime] = useState('22:00');
  const [specialistActionSuccess, setSpecialistActionSuccess] = useState<string | null>(null);
  const [specialistActionError, setSpecialistActionError] = useState<string | null>(null);
  const [specialistBranchFilter, setSpecialistBranchFilter] = useState<string>('ALL');
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
  const [bookingBranchFilter, setBookingBranchFilter] = useState<string>('ALL');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [bookingActionSuccess, setBookingActionSuccess] = useState<string | null>(null);
  const [statusNotifyBooking, setStatusNotifyBooking] = useState<{
    booking: ServiceBooking;
    newStatus: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  } | null>(null);

  // Fulfillment & Ordering Configuration State
  const [catalogEnabled, setCatalogEnabled] = useState(currentStore?.catalog_enabled ?? true);
  const [allowDineIn, setAllowDineIn] = useState(currentStore?.fulfillment_settings?.allow_dine_in ?? true);
  const [allowTakeaway, setAllowTakeaway] = useState(currentStore?.fulfillment_settings?.allow_takeaway ?? true);
  const [allowDelivery, setAllowDelivery] = useState(currentStore?.fulfillment_settings?.allow_delivery ?? true);
  const [deliveryFee, setDeliveryFee] = useState<number | ''>(currentStore?.fulfillment_settings?.delivery_fee ?? 15);
  const [allowServiceBooking, setAllowServiceBooking] = useState(currentStore?.fulfillment_settings?.allow_service_booking ?? true);
  const [bookingConfirmationMode, setBookingConfirmationMode] = useState<'auto' | 'manual'>(currentStore?.fulfillment_settings?.booking_confirmation_mode || 'manual');
  const [enablePosWhatsappReceipt, setEnablePosWhatsappReceipt] = useState(currentStore?.enable_pos_whatsapp_receipt !== false);

  // 💳 App Payment Policies State (Online Payment vs Pay At Store)
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState(currentStore?.fulfillment_settings?.online_payment_enabled !== false);
  const [ordersPaymentPolicy, setOrdersPaymentPolicy] = useState<'both' | 'online_only' | 'pay_at_store_only'>(currentStore?.fulfillment_settings?.orders_payment_policy || 'both');
  const [bookingsPaymentPolicy, setBookingsPaymentPolicy] = useState<'both' | 'online_only' | 'pay_at_store_only'>(currentStore?.fulfillment_settings?.bookings_payment_policy || 'both');

  // 💳 Unified Payment Channels State (Online In-App Gateway & Cashier SoftPOS)
  const [paymentConfig, setPaymentConfig] = useState<StorePaymentConfig>(() => {
    return currentStore?.fulfillment_settings?.payment_config || {
      online_enabled: currentStore?.fulfillment_settings?.online_payment_enabled !== false,
      online_provider: 'sandbox',
      online_mode: 'sandbox',
      online_public_key: '',
      online_secret_key: '',
      softpos_enabled: false,
      softpos_provider: 'nearpay',
      softpos_mode: 'sandbox',
      softpos_api_key: '',
      softpos_terminal_id: '',
      allow_cash: true,
      allow_external_pos: true,
    };
  });
  const [softposTestModalOpen, setSoftposTestModalOpen] = useState(false);
  const [softposTestStatus, setSoftposTestStatus] = useState<'idle' | 'scanning' | 'processing' | 'approved'>('idle');
  const [softposAuthCode, setSoftposAuthCode] = useState<string | null>(null);

  // 🎛️ Module Toggles State (SaaS Architecture)
  const [enableOrders, setEnableOrders] = useState(currentStore?.enable_orders !== false);
  const [enableBookings, setEnableBookings] = useState(currentStore?.enable_bookings !== false);
  const [enableLoyalty, setEnableLoyalty] = useState(currentStore?.enable_loyalty !== false);
  const [enablePos, setEnablePos] = useState(currentStore?.enable_pos !== false);
  const [enableKds, setEnableKds] = useState(currentStore?.enable_kds !== false);
  const [enableDrivers, setEnableDrivers] = useState(currentStore?.enable_drivers !== false);
  const [enableInventory, setEnableInventory] = useState(currentStore?.enable_inventory !== false);
  const [moduleToggleError, setModuleToggleError] = useState<string | null>(null);
  const [moduleToggleSuccess, setModuleToggleSuccess] = useState<string | null>(null);
  const [isTogglingModule, setIsTogglingModule] = useState<string | null>(null);

  useEffect(() => {
    const s = store || currentStore;
    if (s) {
      setEnableOrders(s.enable_orders !== false);
      setEnableBookings(s.enable_bookings !== false);
      setEnableLoyalty(s.enable_loyalty !== false);
      setEnablePos(s.enable_pos !== false);
      setEnableKds(s.enable_kds !== false);
      setEnableDrivers(s.enable_drivers !== false);
      setEnableInventory(s.enable_inventory !== false);
    }
  }, [store?.id, currentStore?.id]);

  type SaaSModuleKey = 'orders' | 'bookings' | 'loyalty' | 'pos' | 'kds' | 'drivers' | 'inventory';

  const handleToggleModule = async (module: SaaSModuleKey, targetVal: boolean) => {
    setModuleToggleError(null);
    setModuleToggleSuccess(null);

    const s = store || currentStore;
    const isOwnerLocked =
      module === 'orders' ? s?.owner_enable_orders === false :
      module === 'bookings' ? s?.owner_enable_bookings === false :
      module === 'loyalty' ? s?.owner_enable_loyalty === false :
      module === 'pos' ? s?.owner_enable_pos === false :
      module === 'kds' ? s?.owner_enable_kds === false :
      module === 'drivers' ? s?.owner_enable_drivers === false :
      module === 'inventory' ? s?.owner_enable_inventory === false : false;

    if (isOwnerLocked) {
      setModuleToggleError('هذا الموديول غير مشمول في باقة متجرك الحالية 🔒 يرجى التواصل مع إدارة المنصة للترقية.');
      return;
    }

    // شرط القيد الإلزامي: منع إيقاف كافة الخدمات الرئيسية دفعة واحدة
    const nextOrders = module === 'orders' ? targetVal : enableOrders;
    const nextBookings = module === 'bookings' ? targetVal : enableBookings;
    const nextLoyalty = module === 'loyalty' ? targetVal : enableLoyalty;

    const effOrders = (s?.owner_enable_orders !== false) && nextOrders;
    const effBookings = (s?.owner_enable_bookings !== false) && nextBookings;
    const effLoyalty = (s?.owner_enable_loyalty !== false) && nextLoyalty;

    if (!effOrders && !effBookings && !effLoyalty) {
      setModuleToggleError('⚠️ لا يمكن إيقاف كافة الخدمات الرئيسية دفعة واحدة. يجب أن يبقى موديول واحد نشطاً على الأقل لضمان عمل المتجر لعملائك.');
      return;
    }

    setIsTogglingModule(module);
    if (module === 'orders') setEnableOrders(targetVal);
    if (module === 'bookings') setEnableBookings(targetVal);
    if (module === 'loyalty') setEnableLoyalty(targetVal);
    if (module === 'pos') setEnablePos(targetVal);
    if (module === 'kds') setEnableKds(targetVal);
    if (module === 'drivers') setEnableDrivers(targetVal);
    if (module === 'inventory') setEnableInventory(targetVal);

    try {
      const updates: Partial<Store> = {};
      if (module === 'orders') updates.enable_orders = targetVal;
      if (module === 'bookings') updates.enable_bookings = targetVal;
      if (module === 'loyalty') updates.enable_loyalty = targetVal;
      if (module === 'pos') updates.enable_pos = targetVal;
      if (module === 'kds') updates.enable_kds = targetVal;
      if (module === 'drivers') updates.enable_drivers = targetVal;
      if (module === 'inventory') updates.enable_inventory = targetVal;

      const targetStoreId = store?.id || currentStore?.id;
      const updated = await LoyaltyService.updateStoreSettings(targetStoreId, updates);
      setStore(updated);
      const modNames: Record<SaaSModuleKey, string> = {
        orders: 'الطلبات والمنيو',
        bookings: 'الحجوزات والمواعيد',
        loyalty: 'برنامج الولاء والمكافآت',
        pos: 'الكاشير ونقاط البيع POS',
        kds: 'شاشة المطبخ KDS',
        drivers: 'أسطول السائقين والتوصيل',
        inventory: 'المخزون والوصفات الذكية',
      };
      setModuleToggleSuccess(`تم ${targetVal ? 'تفعيل' : 'إيقاف'} موديول ${modNames[module]} بنجاح ${targetVal ? '✅' : '⏸️'}`);
      setTimeout(() => setModuleToggleSuccess(null), 3500);
    } catch (err: any) {
      setModuleToggleError(err?.message || 'حدث خطأ أثناء حفظ الإعدادات');
      if (module === 'orders') setEnableOrders(!targetVal);
      if (module === 'bookings') setEnableBookings(!targetVal);
      if (module === 'loyalty') setEnableLoyalty(!targetVal);
      if (module === 'pos') setEnablePos(!targetVal);
      if (module === 'kds') setEnableKds(!targetVal);
      if (module === 'drivers') setEnableDrivers(!targetVal);
      if (module === 'inventory') setEnableInventory(!targetVal);
    } finally {
      setIsTogglingModule(null);
    }
  };

  // 💳 Instant Auto-Save for Fulfillment & Payment Policies
  const [isSavingPaymentPolicy, setIsSavingPaymentPolicy] = useState(false);
  const [paymentPolicyStatus, setPaymentPolicyStatus] = useState<string | null>(null);

  const handleInstantSavePaymentPolicy = async (overrides?: Partial<StoreFulfillmentSettings>) => {
    const targetStoreId = store?.id || currentStore?.id;
    if (!targetStoreId || isSavingPaymentPolicy) return;
    setIsSavingPaymentPolicy(true);
    setPaymentPolicyStatus('جاري الحفظ والتطبيق...');

    const nextOnline = overrides?.online_payment_enabled !== undefined ? overrides.online_payment_enabled : onlinePaymentEnabled;
    const nextOrders = overrides?.orders_payment_policy || ordersPaymentPolicy;
    const nextBookings = overrides?.bookings_payment_policy || bookingsPaymentPolicy;
    const nextDineIn = overrides?.allow_dine_in !== undefined ? overrides.allow_dine_in : allowDineIn;
    const nextTakeaway = overrides?.allow_takeaway !== undefined ? overrides.allow_takeaway : allowTakeaway;
    const nextDelivery = overrides?.allow_delivery !== undefined ? overrides.allow_delivery : allowDelivery;
    const nextDeliveryFee = overrides?.delivery_fee !== undefined ? overrides.delivery_fee : (deliveryFee === '' ? 0 : Number(deliveryFee));
    const nextServiceBooking = overrides?.allow_service_booking !== undefined ? overrides.allow_service_booking : allowServiceBooking;
    const nextBookingConfirmationMode = overrides?.booking_confirmation_mode !== undefined ? overrides.booking_confirmation_mode : bookingConfirmationMode;
    const nextPaymentConfig = overrides?.payment_config || paymentConfig;

    try {
      const newSettings: StoreFulfillmentSettings = {
        allow_dine_in: nextDineIn,
        allow_takeaway: nextTakeaway,
        allow_delivery: nextDelivery,
        delivery_fee: Number(nextDeliveryFee) >= 0 ? Number(nextDeliveryFee) : 15,
        allow_service_booking: nextServiceBooking,
        booking_notice_minutes: 30,
        booking_confirmation_mode: nextBookingConfirmationMode,
        online_payment_enabled: nextOnline,
        orders_payment_policy: nextOrders,
        bookings_payment_policy: nextBookings,
        payment_config: nextPaymentConfig,
      };

      const updated = await LoyaltyService.updateStoreSettings(targetStoreId, {
        fulfillment_settings: newSettings,
      });

      if (updated) {
        setStore(updated);
      }
      LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: targetStoreId });
      setPaymentPolicyStatus('⚡ تم حفظ وتطبيق إعدادات الدفع فوراً على المتجر وتطبيق العميل والكاشير!');
      setTimeout(() => setPaymentPolicyStatus(null), 4000);
    } catch (e: any) {
      console.error('Failed to auto-save payment policy', e);
      setPaymentPolicyStatus('⚠️ تعذر الحفظ الفوري، يرجى إعادة المحاولة.');
      setTimeout(() => setPaymentPolicyStatus(null), 4000);
    } finally {
      setIsSavingPaymentPolicy(false);
    }
  };

  // Edit Staff PIN Modal State
  const [isEditStaffPinModalOpen, setIsEditStaffPinModalOpen] = useState(false);
  const [editingStaffForPin, setEditingStaffForPin] = useState<StoreStaff | null>(null);
  const [editStaffPinValue, setEditStaffPinValue] = useState('');

  // WhatsApp Meta Embedded Signup & Cloud API Settings State
  const [whatsappProvider, setWhatsappProvider] = useState<'direct' | 'meta' | 'qr'>('direct');
  const [waQrCodeData, setWaQrCodeData] = useState<string | null>(null);
  const [waQrStatus, setWaQrStatus] = useState<string | null>(null);
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
  const [editCustomerSpecialDate, setEditCustomerSpecialDate] = useState('');
  const [editCustomerSpecialDateType, setEditCustomerSpecialDateType] = useState('');
  const [customerActionSuccess, setCustomerActionSuccess] = useState<string | null>(null);

  // Customer In-App Notification Modal State
  const [isCustomerNotificationOpen, setIsCustomerNotificationOpen] = useState(false);
  const [selectedCustomerForNotification, setSelectedCustomerForNotification] = useState<Customer | null>(null);
  const [customerNotifTitle, setCustomerNotifTitle] = useState('');
  const [customerNotifBody, setCustomerNotifBody] = useState('');
  const [customerNotifSound, setCustomerNotifSound] = useState<'notification' | 'commission' | 'redeem' | 'success'>('notification');
  const [isSendingCustomerNotif, setIsSendingCustomerNotif] = useState(false);

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
  const [logBranchFilter, setLogBranchFilter] = useState<string>('ALL');
  const [logDateFilter, setLogDateFilter] = useState<'TODAY' | '7DAYS' | '30DAYS' | 'ALL'>('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');

  // 4️⃣-B Coupons Ledger Filter State
  const [couponBranchFilter, setCouponBranchFilter] = useState<string>('ALL');
  const [couponStatusFilter, setCouponStatusFilter] = useState<'ALL' | 'ACTIVE' | 'USED'>('ALL');
  const [couponSearchQuery, setCouponSearchQuery] = useState<string>('');

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

  // 🏢 Branch Resolver Helpers for Central Ledgers (Operations, Bookings, Coupons)
  const resolveLogBranch = (log: AuditLog): { id: string | null; name: string; isFallback: boolean } => {
    if (log.branch_id) {
      const match = branches.find((b) => b.id === log.branch_id);
      if (match) return { id: match.id, name: match.name, isFallback: false };
    }
    if (log.metadata?.branch_id) {
      const match = branches.find((b) => b.id === log.metadata.branch_id);
      if (match) return { id: match.id, name: match.name, isFallback: false };
    }
    if (log.branch_name) {
      return { id: log.branch_id || null, name: log.branch_name, isFallback: false };
    }
    if (log.metadata?.branch_name) {
      return { id: log.metadata?.branch_id || null, name: log.metadata.branch_name, isFallback: false };
    }
    if (log.staff_id || log.metadata?.cashier_name) {
      const st = staffList.find(
        (s) => s.id === log.staff_id || (log.metadata?.cashier_name && s.name === log.metadata.cashier_name)
      );
      if (st?.branch_id) {
        const match = branches.find((b) => b.id === st.branch_id);
        if (match) return { id: match.id, name: match.name, isFallback: false };
      }
    }
    if (log.metadata?.booking_id) {
      const bk = bookings.find((b) => b.id === log.metadata?.booking_id);
      if (bk?.branch_id) {
        const match = branches.find((b) => b.id === bk.branch_id);
        if (match) return { id: match.id, name: match.name, isFallback: false };
      }
    }
    const mainBranch = branches.find((b) => b.is_main) || branches[0];
    if (mainBranch) return { id: mainBranch.id, name: mainBranch.name, isFallback: true };
    return { id: null, name: 'الفرع الرئيسي', isFallback: true };
  };

  const resolveCouponBranch = (coupon: CustomerCoupon): { id: string | null; name: string } => {
    if (coupon.branch_id) {
      const match = branches.find((b) => b.id === coupon.branch_id);
      if (match) return { id: match.id, name: match.name };
    }
    if (coupon.branch_name) return { id: coupon.branch_id || null, name: coupon.branch_name };
    if (coupon.redeemed_by_staff_id) {
      const st = staffList.find((s) => s.id === coupon.redeemed_by_staff_id);
      if (st?.branch_id) {
        const match = branches.find((b) => b.id === st.branch_id);
        if (match) return { id: match.id, name: match.name };
      }
    }
    const mainBranch = branches.find((b) => b.is_main) || branches[0];
    if (mainBranch) return { id: mainBranch.id, name: mainBranch.name };
    return { id: null, name: 'الفرع الرئيسي' };
  };

  const resolveBookingBranch = (bk: ServiceBooking): { id: string | null; name: string } => {
    if (bk.branch_id) {
      const match = branches.find((b) => b.id === bk.branch_id);
      if (match) return { id: match.id, name: match.name };
    }
    if (bk.specialist_id) {
      const spec = specialists.find((s) => s.id === bk.specialist_id);
      if (spec) {
        if (spec.branch_id || spec.branch_name) {
          const match = branches.find((b) => b.id === spec.branch_id || b.name === spec.branch_name || b.name === spec.branch_id);
          if (match) return { id: match.id, name: match.name };
          if (spec.branch_name) return { id: spec.branch_id || null, name: spec.branch_name };
        }
      }
    }
    const mainBranch = branches.find((b) => b.is_main) || branches[0];
    if (mainBranch) return { id: mainBranch.id, name: mainBranch.name };
    return { id: null, name: 'الفرع الرئيسي' };
  };

  // 🛡️ Pre-calculate unified stage and trial status at top level
  const unifiedStage = getStoreUnifiedStage(store);
  const stageInfo = resolveUnifiedStage(store);
  const isPaidActive = Boolean(
    stageInfo.isPaidActive ||
      unifiedStage === 'مشترك مدفوع'
  );

  const isStoreSuspended =
    store.subscription_active === false ||
    store.subscription_status === 'suspended' ||
    store.status === 'suspended' ||
    subscriptionInfo?.isSuspended === true;

  const nowMs = Date.now();
  const subEndDateMs = store.subscription_end_date ? new Date(store.subscription_end_date).getTime() : 0;
  const isSubscriptionValidInFuture = isPaidActive && subEndDateMs > nowMs;

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
        : (store.trial_start_date ? new Date(store.trial_start_date).getTime() : now) + 14 * 86400000;

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
    clearAllInboxNotifications({ portal: 'store', storeId: store.id });
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
      saveActiveStoreBranding(initialStore);
    }
  }, [initialStore]);

  // Dynamic Page Document Title Isolation
  useEffect(() => {
    document.title = store?.name || 'لوحة التاجر';
  }, [store?.name]);

  // 🔒 Operational Portal Theme Lock: Keep StoreAdmin locked to Radar Pro Dark Slate theme
  // (Merchant branding colors & themeMode apply ONLY to CustomerWallet & the Live Simulator Preview)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.style.backgroundColor = '#080B11';
    document.documentElement.style.setProperty('--brand-primary', '#0F172A');
    document.documentElement.style.setProperty('--brand-secondary', '#F59E0B');
  }, []);

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

  // 🔗 Keep Browser URL cleanly in sync with ?store=...&portal=admin to preserve session on refresh
  useEffect(() => {
    if (store?.slug && typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        const curStore = url.searchParams.get('store');
        const curPortal = url.searchParams.get('portal');
        if (curStore !== store.slug || curPortal !== 'admin') {
          url.searchParams.set('store', store.slug);
          url.searchParams.set('portal', 'admin');
          window.history.replaceState({}, '', url.toString());
        }
      } catch {}
    }
  }, [store?.slug]);

  // ⚡ Supabase Realtime WebSocket Connection for StoreAdmin
  useEffect(() => {
    if (!currentStore?.id || !authenticatedAdmin) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let isSubscribed = true;
    let channel: any = null;

    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    LoyaltyService.resolveStore(currentStore.id).then((resolved) => {
      if (!isSubscribed) return;
      const targetStoreId = resolved?.id || currentStore.id;
      const storeUuid = isUuid(targetStoreId)
        ? targetStoreId
        : isUuid(currentStore.id)
        ? currentStore.id
        : null;

      if (!storeUuid) return;

      channel = supabase
        .channel(`store-admin-realtime-${storeUuid}-${Date.now()}`)
        // 1. Listen for new or updated customers in real-time
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_customers',
            filter: `store_id=eq.${storeUuid}`,
          },
          (payload: any) => {
            if (!isSubscribed) return;
            if (payload.eventType === 'INSERT') {
              setCustomers((prev) => [payload.new, ...prev.filter((c) => c.id !== payload.new.id && c.phone !== payload.new.phone)]);
            } else if (payload.eventType === 'UPDATE') {
              setCustomers((prev) =>
                prev.map((c) => (c.id === payload.new.id || c.phone === payload.new.phone ? { ...c, ...payload.new } : c))
              );
            } else if (payload.eventType === 'DELETE') {
              setCustomers((prev) => prev.filter((c) => c.id !== payload.old?.id));
            }
          }
        )
        // 2. Listen for store settings & branding updates in real-time
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'stores',
            filter: `id=eq.${storeUuid}`,
          },
          (payload: any) => {
            if (!isSubscribed || !payload.new) return;
            setStore((prev) => ({ ...prev, ...payload.new }));
            if (payload.new.name) setStoreName(payload.new.name);
            if (payload.new.slug) setStoreSlug(payload.new.slug);
            if (payload.new.primary_color) setPrimaryColor(payload.new.primary_color);
            if (payload.new.secondary_color) setSecondaryColor(payload.new.secondary_color);
            if (payload.new.theme_mode) setThemeMode(payload.new.theme_mode);
            if (payload.new.background_color) setBackgroundColor(payload.new.background_color);
            if (payload.new.card_color) setCardColor(payload.new.card_color);
            if (payload.new.theme_preset !== undefined) setSelectedThemePreset(payload.new.theme_preset || '');
            if (payload.new.enable_orders !== undefined) setEnableOrders(payload.new.enable_orders);
            if (payload.new.enable_bookings !== undefined) setEnableBookings(payload.new.enable_bookings);
            if (payload.new.enable_loyalty !== undefined) setEnableLoyalty(payload.new.enable_loyalty);
            if (payload.new.status) {
              setSubscriptionInfo((prev: any) => prev ? { ...prev, status: payload.new.status } : prev);
            }
          }
        )
        // 3. Listen for catalog items (products & services) in real-time
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'catalog_items',
            filter: `store_id=eq.${storeUuid}`,
          },
          (payload: any) => {
            if (!isSubscribed) return;
            if (payload.eventType === 'INSERT') {
              setCatalogItems((prev) => [payload.new, ...prev.filter((it) => it.id !== payload.new.id)]);
            } else if (payload.eventType === 'UPDATE') {
              setCatalogItems((prev) => prev.map((it) => (it.id === payload.new.id ? { ...it, ...payload.new } : it)));
            } else if (payload.eventType === 'DELETE') {
              setCatalogItems((prev) => prev.filter((it) => it.id !== payload.old?.id));
            }
          }
        )
        // 4. Listen for coupons in real-time
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'customer_coupons',
            filter: `store_id=eq.${storeUuid}`,
          },
          (payload: any) => {
            if (!isSubscribed) return;
            if (payload.eventType === 'INSERT') {
              setCoupons((prev) => [payload.new, ...prev.filter((c) => c.id !== payload.new.id)]);
            } else if (payload.eventType === 'UPDATE') {
              setCoupons((prev) => prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c)));
            } else if (payload.eventType === 'DELETE') {
              setCoupons((prev) => prev.filter((c) => c.id !== payload.old?.id));
            }
          }
        )
        // 5. Listen for bookings in real-time
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'service_bookings',
            filter: `store_id=eq.${storeUuid}`,
          },
          (payload: any) => {
            if (!isSubscribed) return;
            if (payload.eventType === 'INSERT') {
              setBookings((prev) => [payload.new, ...prev.filter((b) => b.id !== payload.new.id)]);
            } else if (payload.eventType === 'UPDATE') {
              setBookings((prev) => prev.map((b) => (b.id === payload.new.id ? { ...b, ...payload.new } : b)));
            } else if (payload.eventType === 'DELETE') {
              setBookings((prev) => prev.filter((b) => b.id !== payload.old?.id));
            }
          }
        )
        // 6. Listen for staff and branches updates
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_staff',
            filter: `store_id=eq.${storeUuid}`,
          },
          () => {
            if (isSubscribed) {
              LoyaltyService.getStoreStaff(storeUuid).then((freshStaff) => {
                if (isSubscribed) setStaffList(freshStaff);
              }).catch(() => {});
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_branches',
            filter: `store_id=eq.${storeUuid}`,
          },
          () => {
            if (isSubscribed) {
              LoyaltyService.getStoreBranches(storeUuid).then((freshBranches) => {
                if (isSubscribed) setBranches(freshBranches);
              }).catch(() => {});
            }
          }
        )
        .subscribe();
    });

    return () => {
      isSubscribed = false;
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [currentStore?.id, authenticatedAdmin]);

  const loadAdminData = async () => {
    if (!currentStore?.id) return;
    setLoading(true);
    LoyaltyService.getAllSubscriptionPlans().then((freshPlans) => {
      if (freshPlans && freshPlans.length > 0) setAllPlans(freshPlans);
    }).catch(() => {});

    try {
      // 🚀 المرحلة 1: التحميل الفوري للوحة التحكم الأساسية (Core Dashboard Tier)
      const [s, c, t, staff, p, cpn, wallet, invs, subInfo, brs] = await Promise.all([
        LoyaltyService.resolveStore(currentStore.id),
        LoyaltyService.getAllCustomers(currentStore.id),
        LoyaltyService.getTiers(currentStore.id),
        LoyaltyService.getStoreStaff(currentStore.id),
        LoyaltyService.getPrivileges(currentStore.id),
        LoyaltyService.getAllStoreCoupons(currentStore.id),
        LoyaltyService.getStoreWallet(currentStore.id),
        LoyaltyService.getStoreInvoices(currentStore.id),
        LoyaltyService.checkAndUpdateStoreSubscription(currentStore.id),
        LoyaltyService.getStoreBranches(currentStore.id),
      ]);
      const activeStore = normalizeStore(s || currentStore);
      setStore(activeStore);
      setStoreName(activeStore.name || '');
      setStoreSlug(activeStore.slug || '');
      setCustomDomain(activeStore.custom_domain || '');
      setManagerName(activeStore.manager_name || '');
      setManagerContact(activeStore.manager_contact || '');
      setPrimaryColor(activeStore.primary_color || '#0F172A');
      setSecondaryColor(activeStore.secondary_color || '#F59E0B');
      setThemeMode(activeStore.theme_mode || 'light');
      setBackgroundColor(activeStore.background_color || (activeStore.theme_mode === 'warm_cream' ? '#FAF6F0' : activeStore.theme_mode === 'dark' ? '#080B11' : '#F8FAFC'));
      setCardColor(activeStore.card_color || (activeStore.theme_mode === 'dark' ? '#131A26' : '#FFFFFF'));
      setSelectedThemePreset(activeStore.theme_preset || '');
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
        setBookingConfirmationMode(activeStore.fulfillment_settings.booking_confirmation_mode || 'manual');
        setOnlinePaymentEnabled(activeStore.fulfillment_settings.online_payment_enabled !== false);
        setOrdersPaymentPolicy(activeStore.fulfillment_settings.orders_payment_policy || 'both');
        setBookingsPaymentPolicy(activeStore.fulfillment_settings.bookings_payment_policy || 'both');
        if (activeStore.fulfillment_settings.payment_config) {
          setPaymentConfig(activeStore.fulfillment_settings.payment_config);
        }
      }
      setEnableOrders(activeStore.enable_orders !== false);
      setEnableBookings(activeStore.enable_bookings !== false);
      setEnableLoyalty(activeStore.enable_loyalty !== false);
      setCustomers(c);
      setTiers(t.sort((t1, t2) => t1.required_xp - t2.required_xp));
      setStaffList(staff);
      setBranches(brs || []);
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

      // جلب إعدادات المنصة العامة (Zero-Trust لمعرف البوت وبوابات الواتساب)
      LoyaltyService.getPublicPlatformIntegrations().then(setPublicIntegrations).catch(() => {});

      // إيقاف شاشة التحميل فوراً ليتمكن التاجر من استخدام المنصة فوراً
      setLoading(false);

      // 🔄 المرحلة 2: التحميل المتأخر الذكي في الخلفية بدون تجميد الشاشة (Background / Deferred Tier)
      Promise.all([
        LoyaltyService.getAuditLogs(currentStore.id),
        LoyaltyService.getCatalogItems(currentStore.id),
        LoyaltyService.getStoreSpecialists(currentStore.id),
        LoyaltyService.getGlobalCategories(currentStore.id),
        LoyaltyService.getGlobalModifierGroups(currentStore.id),
        LoyaltyService.getStoreBookings(currentStore.id),
      ]).then(([a, cat, specs, cats, mods, bks]) => {
        setAuditLogs(a || []);
        setCatalogItems(cat || []);
        setSpecialists(specs || []);
        setGlobalCategories(cats || []);
        setGlobalModifierGroups(mods || []);
        setBookings(bks || []);
      }).catch((deferredErr) => {
        console.warn('[StoreAdmin] Deferred load warning:', deferredErr);
      });
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
    const isPaid = isPaidActive;

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

      if (!res.success) {
        throw new Error(res.error || 'فشلت معالجة عملية السداد في السيرفر');
      }

      // 1. مزامنة الحالة المعتمدة مباشرة بالسطر المؤكد من قاعدة البيانات
      if (res.store) {
        setStore(res.store);
      }
      setSandboxPaymentConfig(null);
      if (res.invoice) {
        setPaymentSuccessModal(res.invoice);
      }

      // 2. تحديث مؤشرات الاشتراك استناداً للسجل المؤكد
      const targetStore = res.store || store;
      const sub = await LoyaltyService.checkAndUpdateStoreSubscription(targetStore.id, targetStore);
      setSubscriptionInfo(sub);

      const invs = await LoyaltyService.getStoreInvoices(targetStore.id);
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
      console.warn('Failed to auto-save slide deletion:', err);
    }
  };

  const handleSaveLoyaltySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pointsPerRiyal <= 0 || !storeName.trim()) return;

    setUpdatingSettings(true);
    setSettingsSavedMessage(null);

    try {
      const updated = await LoyaltyService.updateStoreSettings(store.id, {
        name: storeName.trim(),
        slug: store.slug, // 🔒 المقفل أمنياً - يتم تغييره حصراً من لوحة المالك
        custom_domain: store.custom_domain, // 🔒 المقفل أمنياً - يتم ربطه حصراً من لوحة المالك
        manager_name: managerName.trim() || store.manager_name,
        manager_contact: store.manager_contact || (store as any).phone, // 🔒 المقفل أمنياً - يتم تحديثه حصراً من لوحة المالك
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        theme_mode: themeMode,
        background_color: backgroundColor,
        card_color: cardColor,
        theme_preset: selectedThemePreset,
        points_per_riyal: Number(pointsPerRiyal),
        logo_url: storeLogoUrl,
        slider_images: sliderImages,
        welcome_gift_type: welcomeGiftType,
        welcome_points: welcomePoints === '' ? 0 : Number(welcomePoints),
        welcome_offer_title: welcomeOfferTitle.trim(),
        max_cashier_invoice_amount: maxCashierInvoiceAmount === '' ? 500 : Number(maxCashierInvoiceAmount),
        admin_pin: adminPinCode.trim() || '9999',
        catalog_enabled: catalogEnabled,
        enable_orders: enableOrders,
        enable_bookings: enableBookings,
        enable_loyalty: enableLoyalty,
        enable_pos_whatsapp_receipt: enablePosWhatsappReceipt,
        fulfillment_settings: {
          allow_dine_in: allowDineIn,
          allow_takeaway: allowTakeaway,
          allow_delivery: allowDelivery,
          delivery_fee: deliveryFee === '' ? 0 : Number(deliveryFee),
          allow_service_booking: allowServiceBooking,
          booking_notice_minutes: 30,
          booking_confirmation_mode: bookingConfirmationMode,
          online_payment_enabled: onlinePaymentEnabled,
          orders_payment_policy: ordersPaymentPolicy,
          bookings_payment_policy: bookingsPaymentPolicy,
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
      saveActiveStoreBranding(updated);
      LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: store.id });
      setSettingsSavedMessage(
        `تم بنجاح حفظ وتحديث هوية وإعدادات المتجر والدومين (${updated.name})`
      );
      setTimeout(() => setSettingsSavedMessage(null), 4500);
    } catch (err: any) {
      console.error(err);
    } finally {
      setUpdatingSettings(false);
    }
  };

  const renderSingleModuleToggleCard = (
    key: SaaSModuleKey,
    title: string,
    description: string,
    icon: any,
    colorTheme: {
      bg: string;
      border: string;
      text: string;
      accentBg: string;
    },
    isEnabled: boolean,
    isOwnerEnabled: boolean,
  ) => {
    const isLocked = !isOwnerEnabled;
    const isToggling = isTogglingModule === key;
    const IconComponent = icon;

    return (
      <div
        key={key}
        className={`p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
          isLocked
            ? 'bg-slate-900/40 border-slate-800/80 opacity-85'
            : isEnabled
            ? `bg-slate-900/90 ${colorTheme.border} shadow-lg shadow-black/20`
            : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <div className={`w-8 h-8 rounded-xl ${colorTheme.bg} ${colorTheme.text} flex items-center justify-center`}>
                <IconComponent className="w-4 h-4" />
              </div>
              <span className="text-xs sm:text-sm font-black text-white">{title}</span>
            </div>

            {isLocked ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-rose-400" />
                <span>غير مشمول 🔒</span>
              </span>
            ) : (
              <button
                type="button"
                disabled={isToggling}
                onClick={() => handleToggleModule(key, !isEnabled)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition flex items-center gap-1.5 ${
                  isEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-sm'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                <span>{isEnabled ? 'مفعل ✅' : 'معطل ✕'}</span>
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
        </div>

        {isLocked ? (
          <div className="mt-3 pt-2.5 border-t border-slate-800/60">
            <a
              href={`https://wa.me/966577371780?text=${encodeURIComponent(
                `السلام عليكم، أرغب في ترقية باقة متجري (${(store || currentStore)?.name || ''}) وتفعيل موديول: ${title}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>طلب التفعيل والترقية 💬</span>
            </a>
          </div>
        ) : null}
      </div>
    );
  };

  const renderModulesCard = () => {
    const s = store || currentStore;
    const ownerOrders = s?.owner_enable_orders !== false;
    const ownerBookings = s?.owner_enable_bookings !== false;
    const ownerPos = s?.owner_enable_pos !== false;
    const ownerKds = s?.owner_enable_kds !== false;
    const ownerDrivers = s?.owner_enable_drivers !== false;
    const ownerInventory = s?.owner_enable_inventory !== false;
    const ownerLoyalty = s?.owner_enable_loyalty !== false;

    return (
      <div className="rounded-3xl p-6 sm:p-7 bg-slate-950/90 border border-slate-800 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-black text-white">التحكم في خدمات وموديولات المتجر (SaaS Modules)</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                فعل أو عطل الخدمات المصرح بها لمتجرك أو تواصل مع إدارة المنصة لترقية الباقة وفتح ميزات جديدة
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20 self-start sm:self-auto font-bold">
            تحديث لحظي فوري ⚡
          </span>
        </div>

        {moduleToggleError && (
          <div className="p-3.5 rounded-2xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2 animate-shake">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-bold leading-relaxed">{moduleToggleError}</span>
          </div>
        )}

        {moduleToggleSuccess && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold leading-relaxed">{moduleToggleSuccess}</span>
          </div>
        )}

        {/* Pillar 1: المبيعات والحجوزات */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-black text-slate-300">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span>الركيزة الأولى: المبيعات والحجوزات (Sales & Bookings)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {renderSingleModuleToggleCard(
              'orders',
              'الطلبات الفورية والمنيو',
              'عرض قائمة المأكولات والمنتجات للعميل، السلة الذكية، والطلب المباشر لتناول محلي أو سفري أو توصيل.',
              ShoppingBag,
              { bg: 'bg-blue-500/15', border: 'border-blue-500/40', text: 'text-blue-400', accentBg: 'bg-blue-500' },
              enableOrders,
              ownerOrders
            )}
            {renderSingleModuleToggleCard(
              'bookings',
              'حجوزات المواعيد والخدمات',
              'عرض خدمات الصالونات، العيادات، والاستشارات، اختيار المختصين، وتأكيد المواعيد بالتقويم.',
              Calendar,
              { bg: 'bg-purple-500/15', border: 'border-purple-500/40', text: 'text-purple-400', accentBg: 'bg-purple-500' },
              enableBookings,
              ownerBookings
            )}
            {renderSingleModuleToggleCard(
              'pos',
              'الكاشير ونقاط البيع السحابية',
              'نظام POS كامل مع إدارة الورديات، الفواتير الحرارية، مسح الباركود، وطرق الدفع المتعددة.',
              Monitor,
              { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-400', accentBg: 'bg-amber-500' },
              enablePos,
              ownerPos
            )}
          </div>
        </div>

        {/* Pillar 2: العمليات واللوجستيات */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-xs font-black text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>الركيزة الثانية: العمليات واللوجستيات (Operations & Logistics)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {renderSingleModuleToggleCard(
              'kds',
              'شاشة المطبخ KDS وإدارة الطاولات',
              'شاشة تجهيز الطلبات الحية في المطبخ، تنبيهات الطهي الصوتية، وربط الطاولات بباركود QR.',
              Utensils,
              { bg: 'bg-orange-500/15', border: 'border-orange-500/40', text: 'text-orange-400', accentBg: 'bg-orange-500' },
              enableKds,
              ownerKds
            )}
            {renderSingleModuleToggleCard(
              'drivers',
              'أسطول السائقين والتوصيل الميداني',
              'بوابة الكباتن، إسناد الطلبات الميدانية، تتبع رحلات التوصيل الحية، وإثبات التسليم.',
              Truck,
              { bg: 'bg-cyan-500/15', border: 'border-cyan-500/40', text: 'text-cyan-400', accentBg: 'bg-cyan-500' },
              enableDrivers,
              ownerDrivers
            )}
            {renderSingleModuleToggleCard(
              'inventory',
              'المخزون وتكاليف الوصفات OCR',
              'جرد المكونات الخام، تنبيهات النواقص، حساب هامش ربح كل وجبة، ومسح فواتير المشتريات بالذكاء الاصطناعي.',
              Package,
              { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', accentBg: 'bg-emerald-500' },
              enableInventory,
              ownerInventory
            )}
          </div>
        </div>

        {/* Pillar 3: النمو والولاء */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-xs font-black text-slate-300">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
            <span>الركيزة الثالثة: النمو والولاء (Growth & Retention)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {renderSingleModuleToggleCard(
              'loyalty',
              'برنامج الولاء والبطاقات الرقمية',
              'كسب النقاط والمكافآت، مستويات العضوية (Tiers)، الكوبونات، وبطاقات Apple Wallet وGoogle Wallet.',
              Gift,
              { bg: 'bg-rose-500/15', border: 'border-rose-500/40', text: 'text-rose-400', accentBg: 'bg-rose-500' },
              enableLoyalty,
              ownerLoyalty
            )}
          </div>
        </div>
      </div>
    );
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
          store_id: editingCatalogItem.store_id || store.id,
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
    } catch (err: any) {
      setCatalogActionError(err.message || 'حدث خطأ أثناء حفظ المنتج'); setTimeout(() => setCatalogActionError(null), 5000);
    }
  };

  const handleSaveServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameInput.trim() || catPriceInput === '') return;

    try {
      if (editingCatalogItem) {
        const updated = await LoyaltyService.updateCatalogItem(editingCatalogItem.id, {
          store_id: editingCatalogItem.store_id || store.id,
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
    } catch (err: any) {
      setCatalogActionError(err.message || 'حدث خطأ أثناء حفظ الخدمة'); setTimeout(() => setCatalogActionError(null), 5000);
    }
  };

  const handleDeleteCatalogItem = async (itemId: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف (${name}) نهائياً؟`)) {
      try {
        await LoyaltyService.deleteCatalogItem(itemId);
        setCatalogItems(catalogItems.filter((it) => it.id !== itemId));
        setCatalogActionSuccess(`تم حذف (${name}) بنجاح`);
        setTimeout(() => setCatalogActionSuccess(null), 3000);
      } catch (err: any) {
        console.error('Failed to delete catalog item:', err);
      }
    }
  };

  const handleToggleCatalogItemAvailability = async (item: CatalogItem) => {
    try {
      const newStatus = !item.is_available;
      const updated = await LoyaltyService.updateCatalogItem(item.id, {
        store_id: item.store_id || store.id,
        is_available: newStatus,
      });
      setCatalogItems(catalogItems.map((it) => (it.id === item.id ? updated : it)));
    } catch (err: any) {
      console.error('Failed to toggle availability:', err);
    }
  };

  const handleCatImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCatImageCompressing(true);
    try {
      const result = await compressImage(file, 400, 400, 0.78, 'image/webp', 'catalog');
      setCatImageUrlInput(result.dataUrl);
    } catch (err: any) {
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
    } catch (err: any) {
      console.error('Failed to compress specialist avatar image:', err);
    } finally {
      setIsSpecImageCompressing(false);
    }
  };

  const handleOpenAddSpecialist = () => {
    setEditingSpecialist(null);
    setSpecNameInput('');
    setSpecSpecialtyInput('');
    setSpecBranchIdInput(branches[0]?.id || '');
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
    const currentBranch = branches.find((b) => b.id === spec.branch_id || b.name === spec.branch_name || b.name === spec.branch_id);
    setSpecBranchIdInput(currentBranch ? currentBranch.id : (spec.branch_id || ''));
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

    const matchedBranch = branches.find((b) => b.id === specBranchIdInput || b.name === specBranchIdInput);
    const branchIdVal = matchedBranch ? matchedBranch.id : (specBranchIdInput ? specBranchIdInput : null);
    const branchNameVal = matchedBranch ? matchedBranch.name : null;

    try {
      setSpecialistActionError(null);
      if (editingSpecialist) {
        const updated = await LoyaltyService.updateStoreSpecialist(editingSpecialist.id, {
          name: specNameInput.trim(),
          specialty: specSpecialtyInput.trim() || undefined,
          branch_id: branchIdVal,
          branch_name: branchNameVal,
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
          branch_id: branchIdVal,
          branch_name: branchNameVal,
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
    } catch (err: any) {
      console.error('Failed to save specialist:', err);
      setSpecialistActionError(err.message || 'حدث خطأ أثناء حفظ بيانات المختص، يرجى المحاولة مرة أخرى.');
      setTimeout(() => setSpecialistActionError(null), 5000);
    }
  };

  const handleDeleteSpecialist = async (specId: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف المختص "${name}"؟`)) {
      try {
        await LoyaltyService.deleteStoreSpecialist(specId);
        setSpecialists(specialists.filter((s) => s.id !== specId));
        setSpecialistActionSuccess(`تم حذف المختص: "${name}"`);
        setTimeout(() => setSpecialistActionSuccess(null), 3000);
      } catch (err: any) {
        console.error(err);
      }
    }
  };

  const handleToggleSpecialistActive = async (spec: StoreSpecialist) => {
    try {
      const updated = await LoyaltyService.updateStoreSpecialist(spec.id, { is_active: !spec.is_active });
      setSpecialists(specialists.map((s) => (s.id === spec.id ? updated : s)));
    } catch (err: any) {
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
    } catch (err: any) {
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
      } catch (err: any) {
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
    } catch (err: any) {
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
      } catch (err: any) {
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
    newStatus: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
      } catch (err: any) {
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
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleTogglePrivilegeHidden = async (p: Privilege) => {
    try {
      const newHidden = await LoyaltyService.togglePrivilegeHidden(p.id, p.is_hidden);
      setPrivileges(privileges.map((item) => (item.id === p.id ? { ...item, is_hidden: newHidden } : item)));
      setPrivActionSuccess(newHidden ? `تم إخفاء "${p.title}" عن العملاء` : `تم إظهار "${p.title}" للعملاء`);
      setTimeout(() => setPrivActionSuccess(null), 3500);
    } catch (err: any) {
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
    setEditCustomerSpecialDate(cust.special_date || '');
    setEditCustomerSpecialDateType(cust.special_date_type || 'يوم ميلادي');
    setIsEditCustomerOpen(true);
  };

  const handleSaveCustomerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    try {
      const updated = await LoyaltyService.updateCustomer(editingCustomer.id, {
        name: editCustomerName.trim() || null,
        phone: editCustomerPhone.trim() || editingCustomer.phone,
        special_date: editCustomerSpecialDate.trim() || null,
        special_date_type: editCustomerSpecialDate.trim() ? editCustomerSpecialDateType.trim() || null : null,
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

    const specialDateLine = cust.special_date
      ? `\n🎉 نتمنى لك أجمل الأوقات بمناسبة (${cust.special_date_type || 'يومك المفضل'}) القادم في ${cust.special_date}!`
      : '';

    const text = encodeURIComponent(
      `أهلاً بك يا ${cust.name || 'عميلنا العزيز'}! 🌟\nيسعدنا تواصلك مع ${store.name}.${specialDateLine}\nرصيدك الحالي هو: ${cust.wallet_balance} نقطة (مكانتك: ${tierName}).\nنسعد بزيارتك القادمة للاستمتاع بحصرياتك وامتيازاتك ✨`
    );
    const cleanPhone = cust.phone.replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;
    window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank');
  };

  const handleOpenCustomerNotification = (cust: Customer) => {
    setSelectedCustomerForNotification(cust);
    if (cust.special_date) {
      setCustomerNotifTitle(`تهنئة بمناسبة ${cust.special_date_type || 'يومك المميز'} 🎉`);
      setCustomerNotifBody(`أهلاً بك يا ${cust.name || 'عميلنا العزيز'}! 🌸 يسعدنا في ${store.name} مشاركتك فرحتك بيومك المفضل، تنتظرك مفاجأة وضيافة خاصة في زيارتك القادمة ✨`);
    } else {
      setCustomerNotifTitle(`هدية وعرض حصري لك من ${store.name} 🎁`);
      setCustomerNotifBody(`أهلاً بك يا ${cust.name || 'عميلنا العزيز'}! يسعدنا إهداؤك نقاط ولاء ومكافآت مميزة في محفظتك.`);
    }
    setCustomerNotifSound('notification');
    setIsCustomerNotificationOpen(true);
  };

  const handleSendCustomerNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForNotification || !customerNotifTitle.trim() || !customerNotifBody.trim()) return;

    setIsSendingCustomerNotif(true);
    try {
      const cust = selectedCustomerForNotification;
      const eventId = `notif_cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 1. Emit realtime event targeted specifically to this customer
      LoyaltyEvents.emit({
        eventId,
        type: 'CUSTOM_NOTIFICATION',
        storeId: store.id,
        targetType: 'customer',
        targetId: cust.id,
        phone: cust.phone,
        title: customerNotifTitle.trim(),
        message: customerNotifBody.trim(),
        soundType: customerNotifSound,
      });

      // 2. Persist in scoped customer inbox storage
      saveInboxNotification(
        {
          id: eventId,
          title: customerNotifTitle.trim(),
          body: customerNotifBody.trim(),
          soundType: customerNotifSound,
          targetType: 'customer',
          targetId: cust.id,
          storeId: store.id,
          userPhone: cust.phone,
          portal: 'customer',
        },
        {
          portal: 'customer',
          storeId: store.id,
          userPhone: cust.phone,
        }
      );

      setCustomerActionSuccess(`تم إرسال الإشعار الفوري بنجاح إلى محفظة: ${cust.name || cust.phone} 🔔`);
      setIsCustomerNotificationOpen(false);
      setTimeout(() => setCustomerActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error sending customer notification:', err);
    } finally {
      setIsSendingCustomerNotif(false);
    }
  };

  const handleExportCustomersCSV = () => {
    exportToExcel({
      fileName: `${store.slug}_customers_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'قائمة العملاء',
      columns: [
        { header: 'اسم العميل', key: 'name', width: 22, formatter: (val) => val || 'غير مسجل' },
        { header: 'رقم الجوال', key: 'phone', width: 18, formatter: (val) => val ? String(val) : '' },
        {
          header: 'الرتبة الحالية',
          key: 'lifetime_xp',
          width: 16,
          formatter: (xp) => {
            return (
              tiers
                .filter((t) => t.required_xp <= (xp || 0))
                .sort((a, b) => b.required_xp - a.required_xp)[0]?.tier_name || 'ضيف'
            );
          },
        },
        { header: 'رصيد المحفظة (XP)', key: 'wallet_balance', width: 18, formatter: (val) => Number(val || 0) },
        { header: 'النقاط التراكمية (XP)', key: 'lifetime_xp', width: 20, formatter: (val) => Number(val || 0) },
        {
          header: 'تاريخ آخر زيارة',
          key: 'last_visit_date',
          width: 20,
          formatter: (val) => (val ? new Date(val).toLocaleDateString('ar-SA') : 'عميل جديد'),
        },
        {
          header: 'حالة الحساب',
          key: 'is_active',
          width: 14,
          formatter: (val) => (val !== false ? 'نشط' : 'موقوف'),
        },
      ],
      data: customers,
    });
  };

  const handleExportAuditLogsCSV = () => {
    exportToExcel({
      fileName: `${store.slug}_transactions_audit_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'سجل العمليات الميدانية',
      columns: [
        {
          header: 'رقم العملية (ID)',
          key: 'id',
          width: 16,
          formatter: (val) => (val ? String(val).slice(0, 8) : ''),
        },
        {
          header: 'التاريخ والوقت',
          key: 'created_at',
          width: 24,
          formatter: (val) => (val ? new Date(val).toLocaleString('ar-SA') : ''),
        },
        {
          header: 'نوع الحركة',
          key: 'action',
          width: 22,
          formatter: (val) =>
            val === 'PURCHASE'
              ? 'منح نقاط مشتريات'
              : val === 'PURCHASE_COUPON'
              ? 'شراء كوبون بالمحفظة'
              : val === 'REDEEM_COUPON' || val === 'REDEEM_REWARD'
              ? 'صرف وتسليم مكافأة'
              : val === 'ADJUSTMENT'
              ? 'تعديل إداري'
              : String(val || ''),
        },
        { header: 'اسم العميل', key: 'customer_name', width: 20, formatter: (val) => val || 'غير مسجل' },
        { header: 'رقم الجوال', key: 'customer_phone', width: 18, formatter: (val) => val ? String(val) : '' },
        {
          header: 'الكاشير المسؤول',
          key: 'metadata',
          width: 20,
          formatter: (meta) => meta?.cashier_name || 'النظام الذكي',
        },
        {
          header: 'طريقة الإدخال',
          key: 'metadata',
          width: 18,
          formatter: (meta) =>
            meta?.entry_method === 'manual_phone' || meta?.note?.includes('يدوي')
              ? 'إدخال يدوي'
              : 'مسح باركود كاميرا',
        },
        {
          header: 'قيمة المشتريات (ر.س)',
          key: 'purchase_amount',
          width: 20,
          formatter: (val) => Number(val ?? 0),
        },
        {
          header: 'النقاط المعدلة (XP)',
          key: 'points_changed',
          width: 18,
          formatter: (val) => Number(val ?? 0),
        },
        {
          header: 'ملاحظات وبيانات إضافية',
          key: 'metadata',
          width: 35,
          formatter: (meta) => meta?.note || '',
        },
      ],
      data: auditLogs,
    });
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    const currentWaRemaining = (storeWallet?.wa_quota ?? 100) - (storeWallet?.wa_used ?? 0);
    if (currentWaRemaining <= 0) {
      setQuotaExhaustedMessage(
        `لقد استنفدت كامل رصيد رسائل الواتساب المتاحة لمتجرك (0/${storeWallet?.wa_quota ?? 100} رسالة). يرجى شحن باقة 1,000 رسالة جديدة أو ربط حساب واتساب ميتا الخاص لمتابعة الإرسال.`
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
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleSaveTelegram = async () => {
    try {
      await LoyaltyService.updateStoreSettings(store.id, {
        telegram_chat_id: telegramChatId.trim() || null,
        telegram_notifications_enabled: !!telegramChatId.trim()
      });
      alert('تم حفظ إعدادات التليجرام بنجاح ✅');
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ إعدادات التليجرام');
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في إلغاء ربط بوت التليجرام؟')) return;
    try {
      await LoyaltyService.updateStoreSettings(store.id, {
        telegram_chat_id: null,
        telegram_notifications_enabled: false
      });
      setTelegramChatId('');
      alert('تم إلغاء ربط التليجرام بنجاح ✅');
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء إلغاء الربط');
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

  const activeStoreModules = useMemo(() => getStoreActiveModules(store || currentStore), [store, currentStore]);

  const catalogTabs = useMemo(() => {
    const list: SubTabItem<'products' | 'services' | 'modifiers' | 'fulfillment'>[] = [];

    if (activeStoreModules.orders) {
      list.push({
        id: 'products',
        label: 'المنيو والمنتجات',
        description: 'أصناف المأكولات، المشروبات، الأسعار، الباركود، والصور المميزة',
        icon: ShoppingBag,
        badge: `${productItemsCount}`,
        glowColor: 'bg-amber-500/20',
        iconBg: 'bg-amber-500/15',
        iconBorder: 'border-amber-500/30',
        iconColor: 'text-amber-400',
        statHighlight: `${productItemsCount} صنف ومنتج مسجل`,
      });
    }

    if (activeStoreModules.bookings) {
      list.push({
        id: 'services',
        label: activeStoreModules.orders ? 'الخدمات والحجوزات' : 'الخدمات وباقات المواعيد',
        description: 'باقات الخدمات، مدة التنفيذ، الحجوزات المجدولة، وتعيين المختصين',
        icon: Calendar,
        badge: `${serviceItemsCount}`,
        glowColor: 'bg-purple-500/20',
        iconBg: 'bg-purple-500/15',
        iconBorder: 'border-purple-500/30',
        iconColor: 'text-purple-400',
        statHighlight: `${serviceItemsCount} خدمة حجز وموعد`,
      });
    }

    if (activeStoreModules.orders || activeStoreModules.bookings) {
      list.push({
        id: 'modifiers',
        label: activeStoreModules.orders ? 'الأقسام ومجموعات الإضافات' : 'أقسام وتصنيفات الخدمات',
        description: activeStoreModules.orders
          ? 'تصنيفات المنيو، خيارات الأحجام، الإضافات الإجبارية والاختيارية'
          : 'تصنيفات الخدمات، باقات الجلسات، والخيارات الإضافية',
        icon: Tag,
        badge: `${globalCategories.length + globalModifierGroups.length}`,
        glowColor: 'bg-blue-500/20',
        iconBg: 'bg-blue-500/15',
        iconBorder: 'border-blue-500/30',
        iconColor: 'text-blue-400',
        statHighlight: `${globalCategories.length} أقسام • ${globalModifierGroups.length} إضافات`,
      });
    }

    if (activeStoreModules.orders) {
      list.push({
        id: 'fulfillment',
        label: 'خيارات الطلب والتجهيز والتوصيل',
        description: 'تخصيص: سفري، محلي صالة، استلام بالسيارة، وتوصيل الكباتن',
        icon: Car,
        badge: 'محدث ⚡',
        glowColor: 'bg-emerald-500/20',
        iconBg: 'bg-emerald-500/15',
        iconBorder: 'border-emerald-500/30',
        iconColor: 'text-emerald-400',
        statHighlight: 'محلي، سفري، سيارة وتوصيل',
      });
    }

    return list;
  }, [
    activeStoreModules.orders,
    activeStoreModules.bookings,
    productItemsCount,
    serviceItemsCount,
    globalCategories.length,
    globalModifierGroups.length,
  ]);

  const catalogColumns = (catalogTabs.length >= 4 ? '4' : catalogTabs.length === 3 ? '3' : '2') as '2' | '3' | '4';

  useEffect(() => {
    if (catalogSection !== 'hub' && !catalogTabs.some((t) => t.id === catalogSection)) {
      setCatalogSection('hub');
    }
  }, [catalogTabs, catalogSection]);

  const rawTabsConfig = [
    {
      id: 'analytics' as AdminTab,
      label: 'التحليلات ومؤشرات الأداء',
      shortLabel: 'التحليلات والأداء',
      description: 'مؤشرات تفاعل الزبائن، المبيعات، ومعدل عودة العملاء المباشرة',
      icon: BarChart3,
      badge: null,
      glowColor: 'bg-emerald-500/20',
      iconBg: 'bg-emerald-500/15',
      iconBorder: 'border-emerald-500/30',
      iconColor: 'text-emerald-400',
      statHighlight: `${customers.length} عميل نشط • تقارير حية`,
      isVisible: true,
    },
    {
      id: 'catalog' as AdminTab,
      label: !activeStoreModules.orders && activeStoreModules.bookings
        ? 'الخدمات وجدول المختصين'
        : activeStoreModules.orders && !activeStoreModules.bookings
        ? 'قائمة المنيو والمنتجات'
        : 'الكتالوج والمنتجات والخدمات',
      shortLabel: !activeStoreModules.orders && activeStoreModules.bookings
        ? 'الخدمات والمختصين'
        : activeStoreModules.orders && !activeStoreModules.bookings
        ? 'المنيو والمنتجات'
        : 'الكتالوج والخدمات',
      description: !activeStoreModules.orders && activeStoreModules.bookings
        ? 'قائمة الخدمات، أوقات العمل، المختصين، وتسعير الجلسات والمواعيد'
        : activeStoreModules.orders && !activeStoreModules.bookings
        ? 'أصناف وقوائم المنيو، الأسعار، ومعدات وإضافات التحضير'
        : 'أصناف وقوائم المنيو، الأسعار، الخدمات، ومعدات التحضير',
      icon: ShoppingBag,
      badge: `${catalogItems.length}`,
      glowColor: 'bg-amber-500/20',
      iconBg: 'bg-amber-500/15',
      iconBorder: 'border-amber-500/30',
      iconColor: 'text-amber-400',
      statHighlight: !activeStoreModules.orders && activeStoreModules.bookings
        ? `${serviceItemsCount} خدمة ومختص معتمد`
        : activeStoreModules.orders && !activeStoreModules.bookings
        ? `${productItemsCount} صنف ومنتج بالمنيو`
        : `${catalogItems.length} صنف (${productItemsCount} منتج • ${serviceItemsCount} خدمة)`,
      isVisible: activeStoreModules.orders || activeStoreModules.bookings,
    },
    {
      id: 'inventory' as AdminTab,
      label: 'المخزون وتكاليف الأطباق والموردين',
      shortLabel: 'المخزون وتكلفة الأطباق',
      description: 'المواد الخام، هندسة وصفات المنيو، وقارئ فواتير الموردين الذكي بالتصوير',
      icon: Package,
      badge: 'جديد ⚡',
      glowColor: 'bg-orange-500/20',
      iconBg: 'bg-orange-500/15',
      iconBorder: 'border-orange-500/30',
      iconColor: 'text-orange-400',
      statHighlight: 'خصم تلقائي مع المبيعات • قارئ فواتير OCR',
      isVisible: activeStoreModules.inventory && activeStoreModules.orders,
    },
    {
      id: 'loyalty' as AdminTab,
      label: 'برنامج الولاء والمكافآت',
      shortLabel: 'برنامج الولاء',
      description: 'مستويات العضوية (Tiers)، المكافآت الترحيبية، وقسائم الخصم',
      icon: Gift,
      badge: !activeStoreModules.loyalty ? 'ترقية 🔒' : `${privileges.length}`,
      glowColor: 'bg-purple-500/20',
      iconBg: 'bg-purple-500/15',
      iconBorder: 'border-purple-500/30',
      iconColor: 'text-purple-400',
      statHighlight: !activeStoreModules.loyalty
        ? 'غير مشمول في باقة المتجر الحالية'
        : `${tiers.length} مستويات • ${privileges.length} مكافأة نشطة`,
      isVisible: true,
    },
    {
      id: 'customers' as AdminTab,
      label: 'قاعدة العملاء وسجل العمليات',
      shortLabel: 'العملاء والعمليات',
      description: 'سجل الزبائن، محفظة النقاط، تاريخ الزيارات، واستدعاء العملاء',
      icon: Users,
      badge: `${customers.length}`,
      glowColor: 'bg-blue-500/20',
      iconBg: 'bg-blue-500/15',
      iconBorder: 'border-blue-500/30',
      iconColor: 'text-blue-400',
      statHighlight: `${customers.length} عميل مسجل بالمتجر`,
      isVisible: true,
    },
    {
      id: 'pos_operations' as AdminTab,
      label: 'ورديات الكاشير والمصروفات',
      shortLabel: 'الورديات والمصروفات',
      description: 'إغلاق الورديات، حركة النقدية، المصروفات والإيرادات النثرية',
      icon: Receipt,
      badge: !activeStoreModules.pos ? 'ترقية 🔒' : 'جديد ⚡',
      glowColor: 'bg-teal-500/20',
      iconBg: 'bg-teal-500/15',
      iconBorder: 'border-teal-500/30',
      iconColor: 'text-teal-400',
      statHighlight: !activeStoreModules.pos
        ? 'غير مشمول في باقة المتجر الحالية'
        : 'مطابقة الصندوق والقيود النقدية',
      isVisible: activeStoreModules.pos,
    },
    {
      id: 'staff' as AdminTab,
      label: 'طاقم العمل ورموز الـ PIN',
      shortLabel: 'طاقم العمل والـ PIN',
      description: 'إدارة الكاشيرية، المشرفين، رموز PIN السريعة، وصلاحيات الفروع',
      icon: ShieldCheck,
      badge: `${staffList.length}`,
      glowColor: 'bg-indigo-500/20',
      iconBg: 'bg-indigo-500/15',
      iconBorder: 'border-indigo-500/30',
      iconColor: 'text-indigo-400',
      statHighlight: `${staffList.length} موظف معتمد`,
      isVisible: true,
    },
    {
      id: 'branches' as AdminTab,
      label: activeStoreModules.orders
        ? 'الفروع والصالة وإدارة الطاولات'
        : 'الفروع والمواقع المعتمدة',
      shortLabel: activeStoreModules.orders ? 'الفروع والطاولات' : 'الفروع والمواقع',
      description: activeStoreModules.orders
        ? 'ساعات العمل، الفروع النشطة، طاولات الصالة، وملصقات QR الذكية'
        : 'ساعات العمل، الفروع النشطة، ومواقع تقديم الخدمة المعتمدة',
      icon: Building2,
      badge: 'محدث ⚡',
      glowColor: 'bg-cyan-500/20',
      iconBg: 'bg-cyan-500/15',
      iconBorder: 'border-cyan-500/30',
      iconColor: 'text-cyan-400',
      statHighlight: `${branches.length} فرع مسجل`,
      isVisible: true,
    },
    {
      id: 'settings' as AdminTab,
      label: 'الإعدادات والفوترة وطرق الدفع',
      shortLabel: 'الإعدادات والفوترة',
      description: 'سياسة الدفع (أونلاين/كاش)، الهوية والألوان، والاشتراك',
      icon: Sliders,
      badge: isStoreSuspended
        ? 'معلق ⚠️'
        : subscriptionInfo?.requiresRenewal
        ? 'تجديد ⚠️'
        : subscriptionInfo?.status === 'trial'
        ? `${Math.max(1, Math.ceil(subscriptionInfo.daysLeft))} ${Math.ceil(subscriptionInfo.daysLeft) === 1 ? 'يوم' : Math.ceil(subscriptionInfo.daysLeft) === 2 ? 'يومان' : 'أيام'}`
        : 'نشط ✅',
      glowColor: 'bg-amber-500/20',
      iconBg: 'bg-amber-500/15',
      iconBorder: 'border-amber-500/30',
      iconColor: 'text-amber-400',
      statHighlight: 'بوابة الدفع الإلكتروني والاشتراك',
      isVisible: true,
    },
  ];

  const tabsConfig = rawTabsConfig.filter((t) => t.isVisible);

  const currentTabConfig = tabsConfig.find((t) => t.id === activeTab);

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
      <div className={`relative overflow-hidden rounded-3xl border p-5 sm:p-6 shadow-2xl backdrop-blur-xl transition-colors ${
        isDarkTheme
          ? 'bg-slate-900/90 border-slate-800'
          : isWarmTheme
          ? 'bg-[#FAF6F0] border-[#EFE6D8]'
          : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          {/* Manager & Store Info */}
          <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shadow-inner shrink-0 overflow-hidden ${
              isDarkTheme ? 'bg-slate-800/80 border-slate-700/60' : 'bg-slate-100 border-slate-200'
            }`}>
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
                <h2 className={`text-base sm:text-lg font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  أهلاً بك، {authenticatedAdmin.name}
                </h2>
                <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  isDarkTheme ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  مدير المتجر المعتمد
                </span>
                {store.custom_domain && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isDarkTheme ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    🌐 {store.custom_domain}
                  </span>
                )}
              </div>
              <p className={`text-xs font-mono mt-0.5 flex items-center gap-1.5 flex-wrap ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                <span>لوحة القيادة التنفيذية: <strong className={`font-sans ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>{store.name}</strong> (/{store.slug})</span>
                {(store.store_code || store.id) && (
                  <span
                    title="كود المتجر التعريفي السريع"
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-500 font-extrabold tracking-wider"
                  >
                    كود المتجر: {store.store_code || `RD-${store.id.replace(/-/g, '').substring(0, 4).toUpperCase()}`}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5 self-start lg:self-auto flex-wrap">
            <NotificationBell
              portalName={store.name || 'لوحة التاجر'}
              portalFilter="store"
              storeId={store.id}
            />

            <button
              type="button"
              onClick={() => setShowQuickLinksModal(true)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center space-x-1.5 rtl:space-x-reverse shadow-md active:scale-95 ${
                isDarkTheme
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-amber-500/5'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
              }`}
            >
              <Share2 className="w-3.5 h-3.5 text-amber-500" />
              <span>روابط ومشاركة المتجر 🔗</span>
            </button>

            <button
              onClick={() => {
                const plainText = `مرحباً بك في ${store.name} ⚡\n\n💼 *1. رابط لوحة تحكم وإدارة المتجر (المدير):*\n${adminUrl}\n\n⚡ *2. رابط شاشة الكاشير السريعة (POS):*\n${posUrl}\n\n📱 *3. رابط بطاقة ومحفظة الزبائن:*\n${custUrl}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(plainText)}`, '_blank');
              }}
              className={`px-3.5 py-2 rounded-xl border font-semibold text-xs flex items-center space-x-1.5 rtl:space-x-reverse transition active:scale-95 ${
                isDarkTheme
                  ? 'bg-slate-800/90 hover:bg-emerald-950/40 text-slate-300 hover:text-emerald-400 border-slate-700/80 hover:border-emerald-500/40'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 hover:text-emerald-900 border-emerald-200'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">واتساب</span>
            </button>

            <button
              onClick={handleLogout}
              className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 rtl:space-x-reverse transition active:scale-95 ${
                isDarkTheme
                  ? 'bg-slate-800/90 hover:bg-red-950/60 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/40'
                  : 'bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 border-slate-200 hover:border-red-200'
              }`}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تسجيل الخروج</span>
            </button>
          </div>
        </div>

        {/* 🔗 Luxury Quick Shareable Links Modal Dialog */}
        {showQuickLinksModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-scale-up">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">روابط ومشاركة متجر {store.name}</h3>
                    <p className="text-[11px] text-slate-400">انسخ الروابط أو افتحها مباشرة في المتصفح</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickLinksModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* 1. رابط الزبائن PWA */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                      <span>رابط بطاقة وتطبيق الزبائن (PWA)</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={custUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 transition"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                        <span>فتح</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(custUrl, 'cust_link')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 text-[11px] font-bold flex items-center gap-1 transition"
                      >
                        {copiedLinkKey === 'cust_link' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedLinkKey === 'cust_link' ? 'تم النسخ!' : 'نسخ'}</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono truncate select-all bg-slate-900/60 p-2 rounded-xl border border-slate-800/60">{custUrl}</p>
                </div>

                {/* 2. رابط الكاشير POS */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-amber-400" />
                      <span>رابط شاشة الكاشير السريعة (POS)</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={posUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 transition"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                        <span>فتح</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(posUrl, 'pos_link')}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 text-[11px] font-bold flex items-center gap-1 transition"
                      >
                        {copiedLinkKey === 'pos_link' ? <Check className="w-3 h-3 text-amber-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedLinkKey === 'pos_link' ? 'تم النسخ!' : 'نسخ'}</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono truncate select-all bg-slate-900/60 p-2 rounded-xl border border-slate-800/60">{posUrl}</p>
                </div>

                {/* 3. رابط لوحة تحكم التاجر */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-purple-400" />
                      <span>رابط لوحة تحكم وإدارة المتجر (Admin)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(adminUrl, 'admin_link')}
                      className="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 text-[11px] font-bold flex items-center gap-1 transition"
                    >
                      {copiedLinkKey === 'admin_link' ? <Check className="w-3 h-3 text-purple-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedLinkKey === 'admin_link' ? 'تم النسخ!' : 'نسخ'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono truncate select-all bg-slate-900/60 p-2 rounded-xl border border-slate-800/60">{adminUrl}</p>
                </div>
              </div>

              {/* Action Buttons: WhatsApp & Close */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const plainText = `مرحباً بك في ${store.name} ⚡\n\n💼 *1. رابط لوحة تحكم وإدارة المتجر (المدير):*\n${adminUrl}\n\n⚡ *2. رابط شاشة الكاشير السريعة (POS):*\n${posUrl}\n\n📱 *3. رابط بطاقة ومحفظة الزبائن:*\n${custUrl}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(plainText)}`, '_blank');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition shadow-md shadow-emerald-600/20"
                >
                  <Send className="w-4 h-4" />
                  <span>إرسال الروابط عبر الواتساب 📲</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQuickLinksModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  إغلاق
                </button>
              </div>
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

      {/* 🧭 Executive Hub & Focused Workspace View */}
      {!isStoreSuspended && (
        <>
          {activeTab === 'hub' ? (
            <div className="space-y-6 animate-fade-in">
              {/* Executive Welcome & Key Metrics Strip */}
              <div className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -ml-20 -mt-20" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                      <span className="text-xs font-bold text-emerald-400">لوحة التحكم المركزية نشطة ومحدثة لحظياً</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
                      أقسام وإدارة المتجر التنفيذية ⚡
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
                      اختر أحد الأقسام بالأسفل لإدارته والتحكم فيه بشكل كامل. عند فتح أي قسم يختفي باقي الأقسام للتركيز ويمكنك العودة في أي لحظة.
                    </p>
                  </div>

                  {/* Quick Counters */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="px-3.5 py-2 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold">المنتجات والخدمات</span>
                      <span className="text-base font-black text-amber-400 font-mono">{catalogItems.length}</span>
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold">قاعدة العملاء</span>
                      <span className="text-base font-black text-blue-400 font-mono">{customers.length}</span>
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold">المكافآت النشطة</span>
                      <span className="text-base font-black text-purple-400 font-mono">{privileges.length}</span>
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold">الفروع المعتمدة</span>
                      <span className="text-base font-black text-cyan-400 font-mono">{branches.length}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 🔲 The 8 Executive Section Cards (المربعات) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {tabsConfig.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        window.scrollTo({ top: 300, behavior: 'smooth' });
                      }}
                      className="group relative rounded-3xl p-6 bg-slate-900/90 hover:bg-slate-800/95 border border-slate-800 hover:border-amber-500/50 shadow-xl hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300 text-right flex flex-col justify-between overflow-hidden cursor-pointer hover:-translate-y-1 active:scale-[0.99]"
                    >
                      {/* Ambient Glow Corner */}
                      <div className={`absolute top-0 left-0 w-28 h-28 ${tab.glowColor} rounded-full blur-2xl pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity`} />

                      {/* Top Row: Icon & Badge */}
                      <div className="flex items-center justify-between w-full relative z-10 mb-4">
                        <div className={`w-12 h-12 rounded-2xl ${tab.iconBg} border ${tab.iconBorder} flex items-center justify-center ${tab.iconColor} shadow-inner group-hover:scale-110 group-hover:shadow-lg transition-transform duration-300`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        {tab.badge !== null && (
                          <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-slate-950/80 border border-slate-800 text-amber-300 shadow-sm">
                            {tab.badge}
                          </span>
                        )}
                      </div>

                      {/* Title & Description */}
                      <div className="relative z-10 space-y-2 mb-6">
                        <h4 className="text-base sm:text-lg font-black text-white group-hover:text-amber-400 transition-colors flex items-center justify-between">
                          <span>{tab.label}</span>
                        </h4>
                        <p className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed line-clamp-2">
                          {tab.description}
                        </p>
                      </div>

                      {/* Bottom Footer: Stat Highlight & Arrow Button */}
                      <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between w-full">
                        <span className="text-[11px] font-mono font-bold text-slate-300 bg-slate-950/70 px-2.5 py-1 rounded-xl border border-slate-800/80 truncate max-w-[70%]">
                          {tab.statHighlight}
                        </span>
                        <div className="flex items-center gap-1 text-xs font-black text-amber-400 group-hover:text-amber-300 shrink-0">
                          <span>فتح القسم</span>
                          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ⬅️ Focused Active Workspace Navigation Header (When a tile is open) */
            <div className={`rounded-2xl p-3.5 sm:p-4 border shadow-xl backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-2 z-30 animate-fade-in transition-colors ${
              isDarkTheme
                ? 'bg-slate-900/95 border-slate-800 text-slate-100'
                : isWarmTheme
                ? 'bg-[#FAF6F0]/95 border-[#EFE6D8] text-[#2A1F17]'
                : 'bg-white/95 border-slate-200 text-slate-900'
            }`}>
              {/* Back to Hub Button & Section Title */}
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('hub');
                    window.scrollTo({ top: 200, behavior: 'smooth' });
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-95 group shrink-0"
                >
                  <ArrowRight className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                  <span>العودة للوحة الرئيسية (كافة الأقسام)</span>
                </button>

                <div className={`h-6 w-px hidden sm:block ${isDarkTheme ? 'bg-slate-800' : 'bg-slate-200'}`} />

                {/* Current Section Title & Icon */}
                {currentTabConfig && (
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-xl ${currentTabConfig.iconBg} border ${currentTabConfig.iconBorder} flex items-center justify-center ${currentTabConfig.iconColor} shrink-0`}>
                      <currentTabConfig.icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-sm sm:text-base font-black truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                          {currentTabConfig.label}
                        </h3>
                        {currentTabConfig.badge && (
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                            isDarkTheme ? 'bg-slate-800 border-slate-700 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                          }`}>
                            {currentTabConfig.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Jump Dropdown & Close X Button */}
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <span className={`text-[11px] hidden lg:inline font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>انتقال سريع:</span>
                <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value as AdminTab)}
                  className={`text-xs font-bold rounded-xl px-3 py-2 outline-none border transition cursor-pointer ${
                    isDarkTheme
                      ? 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200 focus:border-amber-500'
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800 focus:border-amber-500 shadow-sm'
                  }`}
                >
                  <option value="hub">⬅️ لوحة الأقسام (الرئيسية)</option>
                  {tabsConfig.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setActiveTab('hub')}
                  title="إغلاق القسم والعودة للرئيسية (X)"
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center transition ${
                    isDarkTheme
                      ? 'bg-slate-800/90 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border-slate-700/80 hover:border-red-500/40'
                      : 'bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 border-slate-200 hover:border-red-200'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================== */}
      {/* 🔒 1. شاشة الإيقاف المؤقت بقرار إداري / بطلب المتجر (مع بقاء الاشتراك سارياً ومحفوظاً) */}
      {/* ========================================== */}
      {isStoreSuspended && isSubscriptionValidInFuture && (
        <div className="rounded-3xl p-6 sm:p-10 bg-slate-900/95 border-2 border-amber-500/40 shadow-2xl space-y-6 animate-fade-in relative overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-24 -mt-24"></div>
          <div className="max-w-2xl mx-auto text-center space-y-5">
            <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
              <PauseCircle className="w-10 h-10" />
            </div>

            <span className="px-3.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black">
              حساب المتجر موقوف مؤقتاً ⏸️
            </span>

            <h2 className="text-2xl sm:text-3xl font-black text-white">
              تم إيقاف تشغيل المتجر مؤقتاً
            </h2>

            <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 text-slate-300 text-xs sm:text-sm space-y-3 text-right">
              <p className="leading-relaxed">
                تم إيقاف تشغيل واجهات المتجر ونقاط البيع مؤقتاً من قبل إدارة المنصة (بناءً على طلبكم أو لأسباب إدارية وتشغيلية).
              </p>
              <div className="flex items-center gap-2 text-emerald-400 font-bold pt-2 border-t border-slate-800">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  اشتراككم وباقاتكم سارية المفعول حتى تاريخ: <strong className="text-white font-mono text-sm">{new Date(store.subscription_end_date!).toLocaleDateString('ar-SA')} ({new Date(store.subscription_end_date!).toISOString().split('T')[0]})</strong>
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                جميع بيانات متجركم، العملاء، النقاط، وسجلات الكاشير محفوظة بأمان تام. لإعادة تشغيل وتنشيط المتجر فوراً، يرجى التواصل مع إدارة منصة RADAR.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  const text = encodeURIComponent(`السلام عليكم، بخصوص متجر (${store.name} - ${store.slug}) نود طلب إعادة تنشيط وتشغيل المتجر على منصة RADAR.`);
                  window.open(`https://wa.me/966577371780?text=${text}`, '_blank');
                }}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-emerald-500/20 transition flex items-center justify-center gap-2 mx-auto hover:scale-105"
              >
                <Send className="w-4 h-4" />
                <span>تواصل مع إدارة المنصة لإعادة التنشيط (WhatsApp) 💬</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 🔒 2. PAYWALL LOCK SCREEN: When Subscription / Trial Expired */}
      {/* ========================================== */}
      {isStoreSuspended && !isSubscriptionValidInFuture && (
        <div className="rounded-3xl p-6 sm:p-10 bg-slate-900/95 border-2 border-rose-500/40 shadow-2xl space-y-8 animate-fade-in relative overflow-hidden backdrop-blur-xl">
          {/* Background Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-24 -mt-24"></div>
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -ml-24 -mb-24"></div>

          <div className="max-w-3xl mx-auto text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto shadow-inner">
              <Lock className="w-10 h-10" />
            </div>

            <span className="px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-wider">
              {subscriptionInfo?.requiresSetup || !store.setup_fee_paid
                ? 'انتهت فترة التجربة المجانية (14 يوم)'
                : 'انتهت فترة اشتراك المتجر'}
            </span>

            <h2 className="text-2xl sm:text-3xl font-black text-white">
              {subscriptionInfo?.requiresSetup || !store.setup_fee_paid
                ? 'تفعيل حساب المتجر وسداد الاشتراك'
                : 'تجديد الاشتراك واختيار الباقة لاستئناف الخدمة فوراً'}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl mx-auto">
              جميع بيانات متجرك، حركات العملاء، نقاط الولاء، وكافة إعدادات الكاشير محفوظة بأمان تام في قاعدة البيانات.
              اختر باقة الاشتراك المناسبة لنشاطك لسدادها واستئناف لوحة التحكم وشاشة الكاشير فوراً.
            </p>
          </div>

          {/* Dynamic Billing Plans Grid */}
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">باقات وخطط الاشتراك المعتمدة</h3>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold">
                {allPlans.filter((p) => p.active !== false).length} باقات متاحة
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allPlans
                .filter((p) => p.active !== false)
                .map((plan) => {
                  const isCurrent =
                    store.subscription_plan &&
                    (plan.name === store.subscription_plan ||
                      store.subscription_plan.includes(plan.name) ||
                      plan.name.includes(store.subscription_plan));

                  return (
                    <div
                      key={plan.id || plan.code}
                      className={`rounded-3xl p-6 sm:p-7 space-y-6 flex flex-col justify-between transition-all duration-300 relative ${
                        isCurrent
                          ? 'bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500 shadow-2xl shadow-amber-500/20 ring-2 ring-amber-500/30'
                          : 'bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 hover:shadow-xl'
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-3.5 right-6 px-3.5 py-1 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 text-[11px] font-black shadow-lg shadow-amber-500/30 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />
                          <span>باقتك السابقة 👑</span>
                        </div>
                      )}

                      <div className="space-y-4">
                        {/* Plan Duration Badge */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                            🗓️ {getPlanDurationLabel(plan)}
                          </span>
                          {plan.code === 'PRO' || plan.name.includes('الاحترافية') ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              الأكثر شمولاً 🚀
                            </span>
                          ) : plan.code === 'ADVANCED' || plan.name.includes('المتقدمة') ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              الأكثر طلباً ⭐
                            </span>
                          ) : null}
                        </div>

                        {/* Title & Description */}
                        <div>
                          <h4 className="text-xl font-black text-white">{plan.name}</h4>
                          {plan.description && (
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                              {plan.description}
                            </p>
                          )}
                        </div>

                        {/* Price Tag */}
                        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex items-baseline justify-between">
                          <div>
                            <span className="text-3xl font-black text-amber-400 font-mono">
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

                      {/* Action Button */}
                      <div className="pt-4 mt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => {
                            setSandboxPaymentConfig({
                              isOpen: true,
                              title: `سداد واشتراك متجر [${store.name}] في ${plan.name}`,
                              itemDescription: `تفعيل باقة ${plan.name} (+${plan.duration_months ? plan.duration_months * 30 : 30} يوماً صلاحية لكافة بوابات النظام)`,
                              amount: plan.amount,
                              invoiceType: 'renewal',
                              planId: plan.id || plan.code,
                            });
                          }}
                          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs shadow-xl shadow-amber-500/20 transition flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>سداد وتفعيل الباقة ({plan.amount.toLocaleString()} ر.س) 💳</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Approved Payment Methods Bar */}
            <div className="rounded-2xl p-4 bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>دفع آمن ومشفر 100% معتمد لجميع البنوك السعودية ومزودي الدفع:</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-white font-bold font-mono">مدى Mada</span>
                <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-white font-bold font-mono">Apple Pay</span>
                <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-white font-bold font-mono">Visa / MasterCard</span>
              </div>
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
          {loyaltySection === 'hub' ? (
            /* 🔲 Executive Subtabs Grid Navigation */
            <SubTabsHubGrid<'perks' | 'tiers' | 'coupons'>
              activeTab={'perks'}
              onSelectTab={(sec) => {
                setLoyaltySection(sec);
                window.scrollTo({ top: 150, behavior: 'smooth' });
              }}
              columns="3"
              tabs={[
                {
                  id: 'perks',
                  label: 'الامتيازات والمكافآت',
                  description: 'العروض الترحيبية، خصومات النقاط، وتحديد ساعات الصرف ومخزون الهدايا',
                  icon: Gift,
                  badge: `${privileges.length}`,
                  glowColor: 'bg-purple-500/20',
                  iconBg: 'bg-purple-500/15',
                  iconBorder: 'border-purple-500/30',
                  iconColor: 'text-purple-400',
                  statHighlight: `${privileges.length} امتياز ومكافأة مفعلة`,
                },
                {
                  id: 'tiers',
                  label: 'رتب ومستويات العضوية (Tiers)',
                  description: 'مستويات ولاء الزبائن (برونزي، فضي، ذهبي...) وشروط النقاط والمضاعفات',
                  icon: Award,
                  badge: `${tiers.length}`,
                  glowColor: 'bg-amber-500/20',
                  iconBg: 'bg-amber-500/15',
                  iconBorder: 'border-amber-500/30',
                  iconColor: 'text-amber-400',
                  statHighlight: `${tiers.length} مستويات عضوية مصنفة`,
                },
                {
                  id: 'coupons',
                  label: 'سجل الكوبونات والعروض',
                  description: 'الكوبونات المصروفة للزبائن، حالة الاستخدام، وفروع الصرف المعتمدة',
                  icon: Ticket,
                  badge: `${coupons.length}`,
                  glowColor: 'bg-emerald-500/20',
                  iconBg: 'bg-emerald-500/15',
                  iconBorder: 'border-emerald-500/30',
                  iconColor: 'text-emerald-400',
                  statHighlight: `${coupons.length} كوبون وقسيمة صادرة`,
                },
              ]}
            />
          ) : (
            /* ⬅️ Focused Header when a sub-section is open */
            <SubSectionFocusedHeader
              title={
                loyaltySection === 'perks'
                  ? 'الامتيازات والمكافآت'
                  : loyaltySection === 'tiers'
                  ? 'رتب ومستويات العضوية (Tiers)'
                  : 'سجل الكوبونات والعروض'
              }
              badge={
                loyaltySection === 'perks'
                  ? `${privileges.length} عرض`
                  : loyaltySection === 'tiers'
                  ? `${tiers.length} رتبة`
                  : `${coupons.length} كوبون`
              }
              icon={
                loyaltySection === 'perks'
                  ? Gift
                  : loyaltySection === 'tiers'
                  ? Award
                  : Ticket
              }
              iconBg={
                loyaltySection === 'perks'
                  ? 'bg-purple-500/15'
                  : loyaltySection === 'tiers'
                  ? 'bg-amber-500/15'
                  : 'bg-emerald-500/15'
              }
              iconBorder={
                loyaltySection === 'perks'
                  ? 'border-purple-500/30'
                  : loyaltySection === 'tiers'
                  ? 'border-amber-500/30'
                  : 'border-emerald-500/30'
              }
              iconColor={
                loyaltySection === 'perks'
                  ? 'text-purple-400'
                  : loyaltySection === 'tiers'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }
              backLabel="العودة لأقسام الولاء"
              onBack={() => setLoyaltySection('hub')}
              activeId={loyaltySection}
              onSelectQuickJump={(id) => setLoyaltySection(id as any)}
              quickJumpOptions={[
                { id: 'perks', label: 'الامتيازات والمكافآت' },
                { id: 'tiers', label: 'رتب ومستويات العضوية' },
                { id: 'coupons', label: 'سجل الكوبونات والعروض' },
              ]}
              isDarkTheme={isDarkTheme}
            />
          )}

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

      {/* Sub-Section 3: Coupons Ledger */}
      {loyaltySection === 'coupons' && (() => {
        const filteredCoupons = coupons.filter((cpn) => {
          // Status filter
          if (couponStatusFilter === 'ACTIVE' && cpn.status !== 'ACTIVE') return false;
          if (couponStatusFilter === 'USED' && cpn.status !== 'USED') return false;

          // Branch filter
          if (couponBranchFilter !== 'ALL') {
            const br = resolveCouponBranch(cpn);
            if (br.id !== couponBranchFilter && br.name !== couponBranchFilter) return false;
          }

          // Search query
          if (couponSearchQuery.trim()) {
            const q = couponSearchQuery.trim().toLowerCase();
            const code = (cpn.code || '').toLowerCase();
            const title = (cpn.title || '').toLowerCase();
            const custName = (customers.find((c) => c.id === cpn.customer_id)?.name || '').toLowerCase();
            const custPhone = (customers.find((c) => c.id === cpn.customer_id)?.phone || '').toLowerCase();
            const matches = code.includes(q) || title.includes(q) || custName.includes(q) || custPhone.includes(q);
            if (!matches) return false;
          }

          return true;
        });

        const activeCouponsCount = coupons.filter((c) => c.status === 'ACTIVE').length;
        const usedCouponsCount = coupons.filter((c) => c.status === 'USED').length;

        return (
          <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                  <Ticket className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2 rtl:space-x-reverse">
                    <span>سجل الكوبونات والعروض المصروفة</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold font-mono">
                      {coupons.length} كوبون
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    متابعة حركة إصدار وصرف الكوبونات حسب الفروع والكاشيرات والعملاء
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    const fresh = await LoyaltyService.getAllStoreCoupons(store.id);
                    setCoupons(fresh);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto transition shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحديث الكوبونات 🔄</span>
              </button>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">إجمالي الكوبونات</span>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-black text-white font-mono">{coupons.length}</span>
                  <Ticket className="w-4 h-4 text-slate-500" />
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">كوبونات تم صرفها</span>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-black text-rose-400 font-mono">{usedCouponsCount}</span>
                  <Flame className="w-4 h-4 text-rose-500" />
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">كوبونات جاهزة للصرف</span>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-black text-emerald-400 font-mono">{activeCouponsCount}</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">الفروع النشطة</span>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-black text-amber-400 font-mono">{branches.length || 1}</span>
                  <Building2 className="w-4 h-4 text-amber-500" />
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Search */}
                <div className="sm:col-span-5 relative">
                  <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={couponSearchQuery}
                    onChange={(e) => setCouponSearchQuery(e.target.value)}
                    placeholder="ابحث بكود الكوبون، اسم العرض، أو العميل..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-10 pl-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500 transition"
                  />
                </div>

                {/* Status Tabs */}
                <div className="sm:col-span-4 flex items-center gap-1.5">
                  {[
                    { id: 'ALL', label: 'الكل' },
                    { id: 'ACTIVE', label: '🟢 جاهز للصرف' },
                    { id: 'USED', label: '🔥 تم الصرف' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setCouponStatusFilter(st.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                        couponStatusFilter === st.id
                          ? 'bg-amber-500 text-black shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {/* Branch Filter */}
                <div className="sm:col-span-3 flex items-center justify-end">
                  {branches.length > 0 && (
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 w-full">
                      <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <select
                        value={couponBranchFilter}
                        onChange={(e) => setCouponBranchFilter(e.target.value)}
                        className="bg-transparent text-slate-300 text-xs font-bold outline-none cursor-pointer w-full"
                      >
                        <option value="ALL" className="bg-slate-900 text-slate-200">
                          📍 جميع الفروع ({branches.length})
                        </option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                            {b.name} {b.city ? `(${b.city})` : ''} {b.is_main ? '⭐' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-950/80">
                    <th className="py-3.5 px-3">كود الكوبون</th>
                    <th className="py-3.5 px-3">العرض / المكافأة</th>
                    <th className="py-3.5 px-3">العميل</th>
                    <th className="py-3.5 px-3">الفرع</th>
                    <th className="py-3.5 px-3">المسؤول / الكاشير</th>
                    <th className="py-3.5 px-3">الحالة</th>
                    <th className="py-3.5 px-3">تاريخ الاكتساب / الصرف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCoupons.length > 0 ? (
                    filteredCoupons.map((cpn) => {
                      const cust = customers.find((c) => c.id === cpn.customer_id);
                      const br = resolveCouponBranch(cpn);
                      const staff = cpn.redeemed_by_staff_id
                        ? staffList.find((s) => s.id === cpn.redeemed_by_staff_id)
                        : null;
                      return (
                        <tr key={cpn.id} className="hover:bg-slate-900/60 transition">
                          {/* 1. كود الكوبون */}
                          <td className="py-3.5 px-3">
                            <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20 text-xs">
                              {cpn.code}
                            </span>
                          </td>

                          {/* 2. العرض / المكافأة */}
                          <td className="py-3.5 px-3">
                            <div className="font-bold text-white">{cpn.title}</div>
                            {cpn.cost_in_points ? (
                              <div className="text-[10px] text-amber-400/90 font-mono mt-0.5">
                                القيمة: {cpn.cost_in_points} نقطة
                              </div>
                            ) : null}
                          </td>

                          {/* 3. العميل */}
                          <td className="py-3.5 px-3">
                            <div className="font-bold text-white">{cust?.name || 'عميل المتجر'}</div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5" dir="ltr">
                              {cust?.phone || ''}
                            </div>
                          </td>

                          {/* 4. الفرع */}
                          <td className="py-3.5 px-3">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-800/90 text-slate-200 border border-slate-700/80 shadow-sm whitespace-nowrap">
                              <Building2 className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>{br.name}</span>
                            </span>
                          </td>

                          {/* 5. المسؤول / الكاشير */}
                          <td className="py-3.5 px-3 font-medium text-slate-300">
                            {staff ? (
                              <span className="text-xs font-bold text-white">{staff.name}</span>
                            ) : cpn.status === 'USED' ? (
                              <span className="text-xs text-slate-400">كاشير المتجر</span>
                            ) : (
                              <span className="text-xs text-slate-500">-</span>
                            )}
                          </td>

                          {/* 6. الحالة */}
                          <td className="py-3.5 px-3">
                            {cpn.status === 'USED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                                <Flame className="w-3 h-3 text-rose-400" />
                                <span>🔥 تم الصرف</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>🟢 جاهز للصرف</span>
                              </span>
                            )}
                          </td>

                          {/* 7. تاريخ الاكتساب / الصرف */}
                          <td className="py-3.5 px-3 text-slate-300 font-mono whitespace-nowrap">
                            <div className="font-bold text-slate-200 text-xs">
                              {cpn.used_at
                                ? `صرف: ${new Date(cpn.used_at).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}`
                                : `اكتساب: ${new Date(cpn.purchased_at || cpn.created_at || '').toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}`}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {new Date(cpn.used_at || cpn.purchased_at || cpn.created_at || '').toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-500">
                        لا توجد كوبونات تطابق شروط الفلتر المحددة
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
      {/* 👥 TAB 4: العملاء وحركات العمليات */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'customers' && (
        <div className="space-y-6 animate-fade-in">
          {customersSection === 'hub' ? (
            /* 🔲 Executive Subtabs Grid Navigation */
            <SubTabsHubGrid<'crm' | 'logs'>
              activeTab={'crm'}
              onSelectTab={(sec) => {
                setCustomersSection(sec);
                window.scrollTo({ top: 150, behavior: 'smooth' });
              }}
              columns="2"
              tabs={[
                {
                  id: 'crm',
                  label: 'دليل وسجل العملاء (CRM)',
                  description: 'استعراض بيانات الزبائن، رصيد النقاط، الرتبة الحالية، وتعديل النقاط المباشر',
                  icon: Users,
                  badge: `${customers.length} عميل`,
                  glowColor: 'bg-blue-500/20',
                  iconBg: 'bg-blue-500/15',
                  iconBorder: 'border-blue-500/30',
                  iconColor: 'text-blue-400',
                  statHighlight: `${customers.length} عميل مسجل بالمتجر`,
                },
                {
                  id: 'logs',
                  label: 'سجل العمليات والتدقيق (Audit Trail)',
                  description: 'التتبع الحي لعمليات الكاشير، مشتريات النقاط، صرف الكوبونات، وطرق الإدخال',
                  icon: FileText,
                  badge: `${auditLogs.length} حركة`,
                  glowColor: 'bg-emerald-500/20',
                  iconBg: 'bg-emerald-500/15',
                  iconBorder: 'border-emerald-500/30',
                  iconColor: 'text-emerald-400',
                  statHighlight: `${auditLogs.length} حركة مسجلة بالكامل`,
                },
              ]}
            />
          ) : (
            /* ⬅️ Focused Header when a sub-section is open */
            <SubSectionFocusedHeader
              title={
                customersSection === 'crm'
                  ? 'دليل وسجل العملاء (CRM)'
                  : 'سجل العمليات والتدقيق المالي (Audit Trail)'
              }
              badge={
                customersSection === 'crm'
                  ? `${customers.length} عميل`
                  : `${auditLogs.length} حركة`
              }
              icon={customersSection === 'crm' ? Users : FileText}
              iconBg={customersSection === 'crm' ? 'bg-blue-500/15' : 'bg-emerald-500/15'}
              iconBorder={customersSection === 'crm' ? 'border-blue-500/30' : 'border-emerald-500/30'}
              iconColor={customersSection === 'crm' ? 'text-blue-400' : 'text-emerald-400'}
              backLabel="العودة لأقسام العملاء والعمليات"
              onBack={() => setCustomersSection('hub')}
              activeId={customersSection}
              onSelectQuickJump={(id) => setCustomersSection(id as any)}
              quickJumpOptions={[
                { id: 'crm', label: 'دليل وسجل العملاء' },
                { id: 'logs', label: 'سجل العمليات والتدقيق' },
              ]}
              isDarkTheme={isDarkTheme}
            />
          )}

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
                    className="px-3.5 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 text-xs font-semibold flex items-center space-x-1.5 rtl:space-x-reverse border border-emerald-500/30 transition shadow-sm"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تصدير إكسل (Excel)</span>
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
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-white block">
                                      {cust.name || 'عميل'}
                                    </span>
                                    {cust.special_date && (
                                      <span
                                        className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/30 font-bold"
                                        title={`اليوم المفضل: ${cust.special_date_type || 'مناسبة'} (${cust.special_date})`}
                                      >
                                        <span>🎁</span>
                                        <span>{cust.special_date}</span>
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleOpenEditCustomer(cust)}
                                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-0.5 mt-0.5"
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

                                <button
                                  onClick={() => handleOpenCustomerNotification(cust)}
                                  className="p-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 hover:text-amber-300 border border-amber-500/30 transition shadow-sm"
                                  title="إرسال إشعار فوري داخل التطبيق للعميل"
                                >
                                  <Bell className="w-3.5 h-3.5" />
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

              // Branch filter
              if (logBranchFilter !== 'ALL') {
                const resBranch = resolveLogBranch(log);
                if (resBranch.id !== logBranchFilter && resBranch.name !== logBranchFilter) {
                  return false;
                }
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

                      {/* Branch Filter Dropdown */}
                      {branches.length > 0 && (
                        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5">
                          <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <select
                            value={logBranchFilter}
                            onChange={(e) => setLogBranchFilter(e.target.value)}
                            className="bg-transparent text-slate-300 text-xs font-bold outline-none cursor-pointer"
                          >
                            <option value="ALL" className="bg-slate-900 text-slate-200">
                              📍 جميع الفروع ({branches.length})
                            </option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                                {b.name} {b.city ? `(${b.city})` : ''} {b.is_main ? '⭐' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
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
                        <th className="py-3.5 px-3">الفرع</th>
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

                              {/* 1-B. الفرع */}
                              <td className="py-3.5 px-3">
                                {(() => {
                                  const br = resolveLogBranch(log);
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-800/90 text-slate-200 border border-slate-700/80 shadow-sm whitespace-nowrap">
                                      <Building2 className="w-3 h-3 text-amber-400 shrink-0" />
                                      <span>{br.name}</span>
                                    </span>
                                  );
                                })()}
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
                          <td colSpan={7} className="py-12 text-center text-slate-500 space-y-2">
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
      {/* 🧾 TAB: العمليات والورديات والمصروفات */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'pos_operations' && (
        <POSOperationsTab
          store={store}
          branches={branches}
          staffList={staffList}
        />
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
          {catalogSection === 'hub' ? (
            /* 🔲 Executive Subtabs Grid Navigation */
            <SubTabsHubGrid<'products' | 'services' | 'modifiers' | 'fulfillment'>
              activeTab={catalogTabs[0]?.id || 'products'}
              onSelectTab={(sec) => {
                setCatalogSection(sec);
                window.scrollTo({ top: 150, behavior: 'smooth' });
              }}
              columns={catalogColumns}
              tabs={catalogTabs}
            />
          ) : (
            /* ⬅️ Focused Header when a sub-section is open */
            <SubSectionFocusedHeader
              title={
                catalogSection === 'products'
                  ? 'المنيو وقائمة المنتجات'
                  : catalogSection === 'services'
                  ? 'الخدمات وباقات الحجوزات'
                  : catalogSection === 'modifiers'
                  ? 'الأقسام ومجموعات الإضافات'
                  : 'خيارات الطلب والتجهيز والتوصيل'
              }
              badge={
                catalogSection === 'products'
                  ? `${productItemsCount} منتج`
                  : catalogSection === 'services'
                  ? `${serviceItemsCount} خدمة`
                  : catalogSection === 'modifiers'
                  ? `${globalCategories.length} قسم`
                  : 'تجهيز وتوصيل'
              }
              icon={
                catalogSection === 'products'
                  ? ShoppingBag
                  : catalogSection === 'services'
                  ? Calendar
                  : catalogSection === 'modifiers'
                  ? Tag
                  : Car
              }
              iconBg={
                catalogSection === 'products'
                  ? 'bg-amber-500/15'
                  : catalogSection === 'services'
                  ? 'bg-purple-500/15'
                  : catalogSection === 'modifiers'
                  ? 'bg-blue-500/15'
                  : 'bg-emerald-500/15'
              }
              iconBorder={
                catalogSection === 'products'
                  ? 'border-amber-500/30'
                  : catalogSection === 'services'
                  ? 'border-purple-500/30'
                  : catalogSection === 'modifiers'
                  ? 'border-blue-500/30'
                  : 'border-emerald-500/30'
              }
              iconColor={
                catalogSection === 'products'
                  ? 'text-amber-400'
                  : catalogSection === 'services'
                  ? 'text-purple-400'
                  : catalogSection === 'modifiers'
                  ? 'text-blue-400'
                  : 'text-emerald-400'
              }
              backLabel="العودة لأقسام الكتالوج والخدمات"
              onBack={() => setCatalogSection('hub')}
              activeId={catalogSection}
              onSelectQuickJump={(id) => setCatalogSection(id as any)}
              quickJumpOptions={catalogTabs.map((t) => ({ id: t.id, label: t.label }))}
              isDarkTheme={isDarkTheme}
            />
          )}

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

            <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setIsAiMenuBuilderOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg shadow-amber-500/20 transition group"
              >
                <Sparkles className="w-4 h-4 text-slate-950 animate-pulse" />
                <span>✨ سحب المنيو الذكي (صورة)</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddProduct}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse border border-slate-700 transition"
              >
                <Plus className="w-4 h-4" />
                <span>+ إضافة يدوية</span>
              </button>
            </div>
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

          {catalogActionError && (
              <div className="p-3 rounded-xl bg-slate-950 border border-rose-500/30 text-rose-300 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>{catalogActionError}</span>
              </div>
            )}
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

          {specialistActionError && (
            <div className="p-3 rounded-xl bg-slate-950 border border-rose-500/30 text-rose-300 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span>{specialistActionError}</span>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-300">طاقم مقدمي الخدمات والمختصين المتاحين للحجز:</span>
                  {branches.length > 0 && (
                    <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <select
                        value={specialistBranchFilter}
                        onChange={(e) => setSpecialistBranchFilter(e.target.value)}
                        className="bg-transparent text-slate-300 text-xs font-bold outline-none cursor-pointer"
                      >
                        <option value="ALL" className="bg-slate-900 text-slate-200">
                          📍 جميع الفروع ({specialists.length})
                        </option>
                        {branches.map((b) => {
                          const count = specialists.filter((s) => s.branch_id === b.id || (s.branch_name && s.branch_name === b.name) || s.branch_id === b.name).length;
                          return (
                            <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                              {b.name} ({count})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddSpecialist}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة مختص جديد</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {specialists
                  .filter((spec) => {
                    if (specialistBranchFilter === 'ALL') return true;
                    const targetBranch = branches.find((b) => b.id === specialistBranchFilter || b.name === specialistBranchFilter);
                    return (
                      spec.branch_id === specialistBranchFilter ||
                      (targetBranch && (spec.branch_name === targetBranch.name || spec.branch_id === targetBranch.name))
                    );
                  })
                  .map((spec) => (
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
                      <div className="flex items-center justify-between">
                        <span>الفرع المخصص:</span>
                        <span className="text-amber-400 font-bold">
                          {spec.branch_name || (spec.branch_id ? (branches.find((b) => b.id === spec.branch_id || b.name === spec.branch_id)?.name || spec.branch_id) : '📍 جميع الفروع (متاح بكل الفروع)')}
                        </span>
                      </div>
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
                <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto flex-1">
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

                  {/* Branch Filter Dropdown */}
                  {branches.length > 0 && (
                    <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 w-full sm:w-auto">
                      <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <select
                        value={bookingBranchFilter}
                        onChange={(e) => setBookingBranchFilter(e.target.value)}
                        className="bg-transparent text-slate-300 text-xs font-bold outline-none cursor-pointer w-full sm:w-auto"
                      >
                        <option value="ALL" className="bg-slate-900 text-slate-200">
                          📍 جميع الفروع ({branches.length})
                        </option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                            {b.name} {b.city ? `(${b.city})` : ''} {b.is_main ? '⭐' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
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
                      <th className="py-3.5 px-3">الفرع</th>
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
                        const matchBranch =
                          bookingBranchFilter === 'ALL' || resolveBookingBranch(b).id === bookingBranchFilter;
                        const matchQuery =
                          !bookingSearchQuery.trim() ||
                          b.customer_name.toLowerCase().includes(bookingSearchQuery.toLowerCase()) ||
                          b.customer_phone.includes(bookingSearchQuery.trim()) ||
                          b.booking_number.toLowerCase().includes(bookingSearchQuery.toLowerCase()) ||
                          b.service_name.toLowerCase().includes(bookingSearchQuery.toLowerCase());
                        return matchStatus && matchBranch && matchQuery;
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

                          {/* الفرع */}
                          <td className="py-3.5 px-3">
                            {(() => {
                              const br = resolveBookingBranch(bk);
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-900 text-slate-300 border border-slate-800 whitespace-nowrap">
                                  <Building2 className="w-3 h-3 text-blue-400 shrink-0" />
                                  <span>{br.name}</span>
                                </span>
                              );
                            })()}
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
                            <div className="text-[11px] font-mono text-amber-400 font-bold">
                              {bk.service_price || bk.total_price || 0} ر.س
                            </div>
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

          {/* Sub-Section 4: Fulfillment & Ordering Options */}
          {catalogSection === 'fulfillment' && (
            <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                    <Car className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <span>خيارات الطلب والتجهيز والتوصيل</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono font-bold">
                        Fulfillment Settings
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      حدد قنوات الاستلام، التوصيل، وحجز المواعيد المتاحة لزبائن متجرك عبر التطبيق والكاشير
                    </p>
                  </div>
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

              {/* Status Alert for Auto-Save */}
              {paymentPolicyStatus && (
                <div className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between transition ${
                  paymentPolicyStatus.includes('⚠️') 
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  <div className="flex items-center gap-2">
                    {isSavingPaymentPolicy ? (
                      <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    <span>{paymentPolicyStatus}</span>
                  </div>
                </div>
              )}

              {/* Channels Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Dine-in */}
                <button
                  type="button"
                  disabled={isSavingPaymentPolicy}
                  onClick={() => {
                    const next = !allowDineIn;
                    setAllowDineIn(next);
                    handleInstantSavePaymentPolicy({ allow_dine_in: next });
                  }}
                  className={`p-4 rounded-2xl border text-right transition flex flex-col justify-between ${
                    allowDineIn
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">🍽️ تناول محلي (طاولات)</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                      allowDineIn ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {allowDineIn ? 'مفعل ✅' : 'معطل ✕'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    إتاحة الطلب المباشر من الطاولة أو حجز طاولة مسبق داخل الفرع
                  </p>
                </button>

                {/* 2. Takeaway */}
                <button
                  type="button"
                  disabled={isSavingPaymentPolicy}
                  onClick={() => {
                    const next = !allowTakeaway;
                    setAllowTakeaway(next);
                    handleInstantSavePaymentPolicy({ allow_takeaway: next });
                  }}
                  className={`p-4 rounded-2xl border text-right transition flex flex-col justify-between ${
                    allowTakeaway
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">🚗 استلام سفري / سيارة</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                      allowTakeaway ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {allowTakeaway ? 'مفعل ✅' : 'معطل ✕'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    الاستلام السريع من الفرع أو تسليم الطلب لسيارة العميل (Drive-thru)
                  </p>
                </button>

                {/* 3. Delivery */}
                <button
                  type="button"
                  disabled={isSavingPaymentPolicy}
                  onClick={() => {
                    const next = !allowDelivery;
                    setAllowDelivery(next);
                    handleInstantSavePaymentPolicy({ allow_delivery: next });
                  }}
                  className={`p-4 rounded-2xl border text-right transition flex flex-col justify-between ${
                    allowDelivery
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">🛵 توصيل للعنوان</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                      allowDelivery ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {allowDelivery ? 'مفعل ✅' : 'معطل ✕'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    إرسال الطلب لعنوان العميل المسجل أو موقعه عبر الخريطة
                  </p>
                </button>

                {/* 4. Service Booking */}
                <button
                  type="button"
                  disabled={isSavingPaymentPolicy}
                  onClick={() => {
                    const next = !allowServiceBooking;
                    setAllowServiceBooking(next);
                    handleInstantSavePaymentPolicy({ allow_service_booking: next });
                  }}
                  className={`p-4 rounded-2xl border text-right transition flex flex-col justify-between ${
                    allowServiceBooking
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">📅 حجز مواعيد خدمات</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                      allowServiceBooking ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {allowServiceBooking ? 'مفعل ✅' : 'معطل ✕'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    تمكين العملاء من حجز موعد محدد لخدمة، جلسة، أو خبير مسبقاً
                  </p>
                </button>
              </div>

              {/* Booking Confirmation Mode Setting (if service booking is enabled) */}
              {allowServiceBooking && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-white">⚙️ نمط اعتماد وتأكيد المواعيد المحجوزة</span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
                        {bookingConfirmationMode === 'auto' ? '⚡ تأكيد فوري تلقائي' : '✋ تأكيد يدوي من التاجر / الكاشير'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      {bookingConfirmationMode === 'auto'
                        ? 'يتم اعتماد الموعد وتأكيده للعميل فور حجزه دون الحاجة لموافقة يدوية مسبقة.'
                        : 'يبقى الموعد في حالة (قيد الانتظار) حتى يقوم الكاشير أو التاجر عبر التلجرام بالضغط على تأكيد الموعد.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setBookingConfirmationMode('manual');
                        handleInstantSavePaymentPolicy({ booking_confirmation_mode: 'manual' });
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        bookingConfirmationMode === 'manual'
                          ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>✋ تأكيد يدوي (Manual)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setBookingConfirmationMode('auto');
                        handleInstantSavePaymentPolicy({ booking_confirmation_mode: 'auto' });
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        bookingConfirmationMode === 'auto'
                          ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>⚡ تأكيد فوري تلقائي (Auto)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Delivery Fee Setting (if delivery is enabled) */}
              {allowDelivery && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-xl">
                  <div>
                    <label className="text-xs font-bold text-white block">رسوم التوصيل الثابتة للطلبات:</label>
                    <p className="text-[11px] text-slate-400 mt-0.5">تضاف تلقائياً إلى فاتورة السلة عند اختيار التوصيل للعنوان</p>
                  </div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value === '' ? '' : Number(e.target.value))}
                      onBlur={() => handleInstantSavePaymentPolicy({ delivery_fee: deliveryFee === '' ? 0 : Number(deliveryFee) })}
                      placeholder="15"
                      className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-400 text-center outline-none focus:border-amber-500"
                    />
                    <span className="text-xs text-slate-300 font-bold">ريال سعودي</span>
                  </div>
                </div>
              )}

              {/* WhatsApp Receipt Toggle */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white">إرسال فواتير الكاشير عبر الواتساب تلقائياً</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      إظهار زر إرسال الفاتورة الإلكترونية عبر الواتساب في شاشة الكاشير عند إتمام أي عملية بيع
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !enablePosWhatsappReceipt;
                    setEnablePosWhatsappReceipt(nextVal);
                    LoyaltyService.updateStoreSettings(store.id, { enable_pos_whatsapp_receipt: nextVal });
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
                    enablePosWhatsappReceipt
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {enablePosWhatsappReceipt ? 'مفعل بالكاشير ✅' : 'معطل ✕'}
                </button>
              </div>

              {/* Save Confirmation Button */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>يتم تطبيق خيارات التجهيز فورياً على تطبيق العملاء وشاشة الكاشير</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleInstantSavePaymentPolicy()}
                  disabled={isSavingPaymentPolicy}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-md shadow-amber-500/10 transition active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingPaymentPolicy ? 'جاري الحفظ...' : 'حفظ خيارات التجهيز 💾'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* 🏢 TAB: إدارة الفروع وأوقات العمل */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'branches' && (
        <BranchesManagementTab
          store={store}
          staffList={staffList}
          onStaffUpdated={() => {
            LoyaltyService.getStoreStaff(store.id).then(setStaffList);
          }}
        />
      )}

      {/* ========================================== */}
      {/* 📦 TAB: إدارة المخزون والمواد الخام وتكاليف الأطباق */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'inventory' && (
        <InventoryManagementTab
          store={store}
          catalogItems={catalogItems}
        />
      )}

      {/* ========================================== */}
      {/* ⚙️ TAB 6: الإعدادات والفوترة */}
      {/* ========================================== */}
      {!isStoreSuspended && activeTab === 'settings' && (
        <div className="space-y-6 animate-fade-in">
          {/* 🧭 Settings Hub & Workspace Navigation */}
          {(() => {
            const settingsSectionsConfig = [
              {
                id: 'branding' as SettingsSection,
                label: 'هوية ومظهر المتجر والشعار',
                description: 'اسم المتجر، الشعار الرسمي، الألوان الرئيسية، وسلايدر واجهة العميل',
                icon: Palette,
                glowColor: 'bg-amber-500/20',
                iconBg: 'bg-amber-500/15',
                iconBorder: 'border-amber-500/30',
                iconColor: 'text-amber-400',
                statHighlight: `${sliderImages.length} شرائح بالسلايدر • ألوان مخصصة`,
              },
              {
                id: 'payments' as SettingsSection,
                label: 'طرق وسياسة الدفع الإلكتروني',
                description: 'بوابة الدفع (مدى/Apple Pay)، إلزامية الدفع أونلاين أو كاش في الفرع',
                icon: CreditCard,
                glowColor: 'bg-emerald-500/20',
                iconBg: 'bg-emerald-500/15',
                iconBorder: 'border-emerald-500/30',
                iconColor: 'text-emerald-400',
                statHighlight: onlinePaymentEnabled ? 'بوابة الدفع: مفعلة ✅' : 'الدفع: كاش فقط 💵',
              },
              {
                id: 'wallet_passes' as SettingsSection,
                label: 'بطاقة Apple Wallet & Google Wallet',
                description: 'تخصيص بطاقة المحفظة الرقمية، إشعارات القرب لشاشة القفل، ورادار المسافة GPS',
                icon: Smartphone,
                glowColor: 'bg-teal-500/20',
                iconBg: 'bg-teal-500/15',
                iconBorder: 'border-teal-500/30',
                iconColor: 'text-teal-400',
                statHighlight: 'تنبيهات شاشة القفل التلقائية نشطة 🔔',
              },
              {
                id: 'modules' as SettingsSection,
                label: 'موديولات وخدمات النظام',
                description: 'التحكم في تشغيل وإيقاف: الطلبات المباشرة، المواعيد، وبرنامج الولاء',
                icon: Layers,
                glowColor: 'bg-blue-500/20',
                iconBg: 'bg-blue-500/15',
                iconBorder: 'border-blue-500/30',
                iconColor: 'text-blue-400',
                statHighlight: '3 خدمات تشغيلية بالتطبيق',
              },
              {
                id: 'security' as SettingsSection,
                label: 'الأمان والـ PIN ونقاط الولاء',
                description: 'رمز المدير السري PIN، سقف الفواتير، معدل احتساب النقاط، والهدية الترحيبية',
                icon: ShieldCheck,
                glowColor: 'bg-purple-500/20',
                iconBg: 'bg-purple-500/15',
                iconBorder: 'border-purple-500/30',
                iconColor: 'text-purple-400',
                statHighlight: 'رمز PIN وسقف الفواتير',
              },
              {
                id: 'integrations' as SettingsSection,
                label: 'تنبيهات تليجرام وبوابة الرسائل',
                description: 'ربط إشعارات بوت تليجرام المباشر وتكامل WhatsApp Cloud API',
                icon: Send,
                glowColor: 'bg-sky-500/20',
                iconBg: 'bg-sky-500/15',
                iconBorder: 'border-sky-500/30',
                iconColor: 'text-sky-400',
                statHighlight: telegramChatId ? 'تليجرام: متصل ✅' : 'تليجرام: غير مربوط ✕',
              },
              {
                id: 'billing' as SettingsSection,
                label: 'الاشتراك والفوترة وتجديد الباقة',
                description: 'حالة اشتراك المتجر، عداد الأيام المتبقية، باقات المنصة، والدفع المباشر',
                icon: Sparkles,
                glowColor: 'bg-amber-500/20',
                iconBg: 'bg-amber-500/15',
                iconBorder: 'border-amber-500/30',
                iconColor: 'text-amber-400',
                statHighlight: subscriptionInfo?.requiresRenewal ? 'تجديد الاشتراك مطلوب ⚠️' : 'الاشتراك ساري ✅',
              },
            ];

            const currentSettingsConfig = settingsSectionsConfig.find((s) => s.id === settingsSection);

            return (
              <>
                {settingsSection === 'hub' ? (
                  <div className="space-y-6 animate-fade-in">
                    {/* Settings Welcome Header Banner */}
                    <div className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -ml-20 -mt-20" />
                      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                            <span className="text-xs font-bold text-amber-400">مركز التحكم والإعدادات المتقدمة</span>
                          </div>
                          <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
                            إعدادات المتجر والتحكم المالي والتقني ⚙️
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
                            اختر أحد الأقسام بالأسفل لتخصيص متجرك. عند فتح أي قسم يختفي باقي الأقسام للتركيز الكامل، مع إمكانية العودة في أي لحظة.
                          </p>
                        </div>

                        {/* Quick Status Pills */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                            <span className="text-[10px] text-slate-400 block font-bold">بوابة الدفع</span>
                            <span className={`text-xs font-black font-mono ${onlinePaymentEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {onlinePaymentEnabled ? 'مفعلة ✅' : 'كاش 💵'}
                            </span>
                          </div>
                          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                            <span className="text-[10px] text-slate-400 block font-bold">بوت تليجرام</span>
                            <span className={`text-xs font-black font-mono ${telegramChatId ? 'text-sky-400' : 'text-slate-400'}`}>
                              {telegramChatId ? 'متصل 🚀' : 'غير مربوط'}
                            </span>
                          </div>
                          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                            <span className="text-[10px] text-slate-400 block font-bold">حالة الاشتراك</span>
                            <span className="text-xs font-black text-amber-400 font-mono">
                              {subscriptionInfo?.requiresRenewal ? 'تجديد ⚠️' : 'ساري ✅'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 🔲 The 6 Executive Settings Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                      {settingsSectionsConfig.map((sec) => {
                        const Icon = sec.icon;
                        return (
                          <button
                            key={sec.id}
                            type="button"
                            onClick={() => {
                              setSettingsSection(sec.id);
                              window.scrollTo({ top: 300, behavior: 'smooth' });
                            }}
                            className="group relative rounded-3xl p-6 bg-slate-900/90 hover:bg-slate-800/95 border border-slate-800 hover:border-amber-500/50 shadow-xl hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300 text-right flex flex-col justify-between overflow-hidden cursor-pointer hover:-translate-y-1 active:scale-[0.99]"
                          >
                            <div className={`absolute top-0 left-0 w-28 h-28 ${sec.glowColor} rounded-full blur-2xl pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity`} />

                            <div className="flex items-center justify-between w-full relative z-10 mb-4">
                              <div className={`w-12 h-12 rounded-2xl ${sec.iconBg} border ${sec.iconBorder} flex items-center justify-center ${sec.iconColor} shadow-inner group-hover:scale-110 group-hover:shadow-lg transition-transform duration-300`}>
                                <Icon className="w-6 h-6" />
                              </div>
                            </div>

                            <div className="relative z-10 space-y-2 mb-6">
                              <h4 className="text-base sm:text-lg font-black text-white group-hover:text-amber-400 transition-colors">
                                {sec.label}
                              </h4>
                              <p className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed line-clamp-2">
                                {sec.description}
                              </p>
                            </div>

                            <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between w-full">
                              <span className="text-[11px] font-mono font-bold text-slate-300 bg-slate-950/70 px-2.5 py-1 rounded-xl border border-slate-800/80 truncate max-w-[70%]">
                                {sec.statHighlight}
                              </span>
                              <div className="flex items-center gap-1 text-xs font-black text-amber-400 group-hover:text-amber-300 shrink-0">
                                <span>فتح الإعدادات</span>
                                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ⬅️ Focused Active Settings Workspace Header */
                  <div className={`rounded-2xl p-3.5 sm:p-4 border shadow-xl backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-2 z-20 animate-fade-in transition-colors ${
                    isDarkTheme
                      ? 'bg-slate-900/95 border-slate-800 text-slate-100'
                      : isWarmTheme
                      ? 'bg-[#FAF6F0]/95 border-[#EFE6D8] text-[#2A1F17]'
                      : 'bg-white/95 border-slate-200 text-slate-900'
                  }`}>
                    <div className="flex items-center gap-3 flex-wrap min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsSection('hub');
                          window.scrollTo({ top: 200, behavior: 'smooth' });
                        }}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-95 group shrink-0"
                      >
                        <ArrowRight className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        <span>العودة لقائمة الإعدادات (كافة الأقسام)</span>
                      </button>

                      <div className={`h-6 w-px hidden sm:block ${isDarkTheme ? 'bg-slate-800' : 'bg-slate-200'}`} />

                      {currentSettingsConfig && (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-xl ${currentSettingsConfig.iconBg} border ${currentSettingsConfig.iconBorder} flex items-center justify-center ${currentSettingsConfig.iconColor} shrink-0`}>
                            <currentSettingsConfig.icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className={`text-sm sm:text-base font-black truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                              {currentSettingsConfig.label}
                            </h3>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <span className={`text-[11px] hidden lg:inline font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>انتقال سريع:</span>
                      <select
                        value={settingsSection}
                        onChange={(e) => setSettingsSection(e.target.value as SettingsSection)}
                        className={`text-xs font-bold rounded-xl px-3 py-2 outline-none border transition cursor-pointer ${
                          isDarkTheme
                            ? 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200 focus:border-amber-500'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800 focus:border-amber-500 shadow-sm'
                        }`}
                      >
                        <option value="hub">⬅️ لوحة الإعدادات (الرئيسية)</option>
                        {settingsSectionsConfig.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => setSettingsSection('hub')}
                        title="إغلاق والعودة للإعدادات (X)"
                        className={`w-8 h-8 rounded-xl border flex items-center justify-center transition ${
                          isDarkTheme
                            ? 'bg-slate-800/90 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border-slate-700/80 hover:border-red-500/40'
                            : 'bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 border-slate-200 hover:border-red-200'
                        }`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* ======================================================== */}
          {/* 🎨 1. SUB-SECTION: هوية ومظهر المتجر (Branding) */}
          {/* ======================================================== */}
          {settingsSection === 'branding' && (
            <div className={`rounded-3xl p-6 sm:p-8 border space-y-6 animate-fade-in shadow-xl transition-colors ${
              isDarkTheme
                ? 'bg-slate-900/80 border-slate-800'
                : isWarmTheme
                ? 'bg-[#FDFBF7] border-[#EFE6D8]'
                : 'bg-white border-slate-200'
            }`}>
              <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b ${
                isDarkTheme ? 'border-slate-800' : isWarmTheme ? 'border-[#EFE6D8]' : 'border-slate-200'
              }`}>
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-sm">
                    <Palette className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className={`text-lg font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>هوية ومظهر المتجر والشعار</h3>
                    <p className={`text-xs mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                      تعديل اسم المتجر، ألوان الهوية، الشعار الرسمي، ومعرض صور واجهة العميل
                    </p>
                  </div>
                </div>

                <a
                  href={`/merchant/onboarding?store_id=${store.id}`}
                  className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 text-xs font-bold transition flex items-center gap-1.5 self-start md:self-auto"
                >
                  <span>معالج تهيئة المتجر 🚀</span>
                </a>
              </div>

              <form onSubmit={handleSaveLoyaltySettings} className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Store Identifiers Banner (Unified UUID & Short Code) */}
                <div className={`md:col-span-12 p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${
                  isDarkTheme ? 'bg-slate-950/80 border-slate-800/80' : isWarmTheme ? 'bg-white border-[#EFE6D8] shadow-sm' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-black text-sm">
                      #
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>كود المتجر التعريفي (Store Code):</span>
                        <span className="text-xs font-mono font-black px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-500 border border-amber-500/40 tracking-wider">
                          {store.store_code || `RD-${store.id.replace(/-/g, '').substring(0, 4).toUpperCase()}`}
                        </span>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                        كود مختصر وسهل للتعريف السريع بالمتجر وربط الكاشير والفروع.
                      </p>
                    </div>
                  </div>
                  <div className={`text-left sm:text-right px-3 py-1.5 rounded-xl border ${
                    isDarkTheme ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <span className="text-[10px] text-slate-500 block font-sans">المعرف البرمجي الموحد (UUID):</span>
                    <span className={`text-[10px] font-mono select-all font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-700'}`}>{store.id}</span>
                  </div>
                </div>

                {/* Store Name (Editable) */}
                <div className="md:col-span-6 space-y-1.5">
                  <label className={`text-xs font-medium block ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>اسم المتجر / العلامة التجارية</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="اسم المتجر"
                    className={`w-full border rounded-2xl px-4 py-3 text-sm font-bold outline-none transition ${
                      isDarkTheme
                        ? 'bg-slate-950 border-slate-800 focus:border-amber-400 text-white'
                        : 'bg-white border-slate-200 focus:border-amber-500 text-slate-900 shadow-sm'
                    }`}
                    required
                  />
                </div>

                {/* Store Slug (Locked & Read-only) */}
                <div className="md:col-span-6 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-medium ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>الاسم التعريفي بالرابط (Slug)</label>
                    <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1 font-mono">
                      <Lock className="w-3 h-3 text-amber-500" />
                      <span>مقفل (التحكم من لوحة المالك)</span>
                    </span>
                  </div>
                  <div className={`w-full border rounded-2xl px-4 py-3 text-xs font-mono flex items-center justify-between select-all ${
                    isDarkTheme ? 'bg-slate-950/70 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`} dir="ltr">
                    <span>{store.slug}</span>
                    <span className="text-[10px] text-slate-500 font-sans">معتمد</span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    * الاسم التعريفي بالرابط مقفل لحماية روابط الزبائن والكاشير، ويتم تغييره حصراً من لوحة إدارة المنصة (المالك).
                  </p>
                </div>

                {/* Custom Domain (Locked & Read-only) */}
                <div className={`md:col-span-12 space-y-1.5 p-4 rounded-2xl border ${
                  isDarkTheme ? 'bg-slate-950/80 border-slate-800' : isWarmTheme ? 'bg-white border-[#EFE6D8] shadow-sm' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                      <Globe className="w-4 h-4 text-slate-400" />
                      <span>الدومين المخصص لمتجرك (Custom Domain):</span>
                    </label>
                    <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1 font-mono">
                      <Lock className="w-3 h-3 text-amber-500" />
                      <span>White-Label (التحكم من لوحة المالك)</span>
                    </span>
                  </div>
                  <div className={`w-full border rounded-xl px-4 py-2.5 text-xs font-mono flex items-center justify-between mt-1 ${
                    isDarkTheme ? 'bg-slate-900/70 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}>
                    <span>{store.custom_domain ? `https://${store.custom_domain}` : 'لم يتم ربط دومين خاص (المتجر يعمل على نطاق المنصة الافتراضي)'}</span>
                    <span className="text-[10px] text-slate-400 font-sans">{store.custom_domain ? 'مفعل وموثق ✅' : 'نطاق افتراضي'}</span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    * ربط وتفعيل الدومين المخصص يتم حصراً من قبل إدارة المنصة (المالك) لضبط شهادات الأمان SSL وDNS.
                  </p>
                </div>

                {/* ======================================================== */}
                {/* 🎨 استوديو الهوية ومظهر المنصة المخصص (White-Label Theme Studio) */}
                {/* ======================================================== */}
                <div className={`md:col-span-12 p-5 sm:p-6 rounded-3xl border space-y-6 transition-all duration-300 ${
                  isDarkTheme ? 'bg-slate-950/90 border-slate-800' : isWarmTheme ? 'bg-white border-[#EFE6D8] shadow-sm' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
                    isDarkTheme ? 'border-slate-800/80' : isWarmTheme ? 'border-[#EFE6D8]' : 'border-slate-200'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>🎨 استوديو تخصيص مظهر وهوية المنصة</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[10px] font-bold">
                          White-Label 100%
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                        اختر المظهر العام لمنصتك (فاتح ناصع للمطاعم والكافيهات، كريمي دافئ، أو داكن فاخر) مع حرية كاملة في تحديد ألوان الهوية والخلفيات والبطاقات
                      </p>
                    </div>
                  </div>

                  {/* 1. Theme Mode Switcher */}
                  <div className="space-y-2">
                    <label className={`text-xs font-bold block ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                      1. نمط المظهر العام للمنصة (Theme Mode):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setThemeMode('light');
                          if (backgroundColor === '#080B11' || backgroundColor === '#FAF6F0') {
                            setBackgroundColor('#F8FAFC');
                          }
                          if (cardColor === '#131A26') {
                            setCardColor('#FFFFFF');
                          }
                        }}
                        className={`p-3.5 rounded-2xl border text-right transition flex items-center justify-between ${
                          themeMode === 'light'
                            ? 'bg-amber-50 border-amber-500 shadow-md ring-2 ring-amber-500/30'
                            : isDarkTheme
                            ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                            : isWarmTheme
                            ? 'bg-[#FAF6F0] border-[#EFE6D8] hover:border-[#DFD4C2]'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">☀️</span>
                          <div>
                            <span className={`text-xs font-black block ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>فاتح ناصع عصري (Clean Light)</span>
                            <span className={`text-[10px] block ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>مثالي للمطاعم والبرغر والعصائر</span>
                          </div>
                        </div>
                        {themeMode === 'light' && <CheckCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setThemeMode('warm_cream');
                          if (backgroundColor === '#080B11' || backgroundColor === '#F8FAFC') {
                            setBackgroundColor('#FAF6F0');
                          }
                          if (cardColor === '#131A26') {
                            setCardColor('#FFFFFF');
                          }
                        }}
                        className={`p-3.5 rounded-2xl border text-right transition flex items-center justify-between ${
                          themeMode === 'warm_cream'
                            ? 'bg-amber-50 border-amber-500 shadow-md ring-2 ring-amber-500/30'
                            : isDarkTheme
                            ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                            : isWarmTheme
                            ? 'bg-[#FAF6F0] border-[#EFE6D8] hover:border-[#DFD4C2]'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">☕</span>
                          <div>
                            <span className={`text-xs font-black block ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>فانيلا وبيج دافئ (Warm Cream)</span>
                            <span className={`text-[10px] block ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>مخصص للكافيهات والمخابز المختصة</span>
                          </div>
                        </div>
                        {themeMode === 'warm_cream' && <CheckCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setThemeMode('dark');
                          if (backgroundColor === '#F8FAFC' || backgroundColor === '#FAF6F0') {
                            setBackgroundColor('#080B11');
                          }
                          if (cardColor === '#FFFFFF') {
                            setCardColor('#131A26');
                          }
                        }}
                        className={`p-3.5 rounded-2xl border text-right transition flex items-center justify-between ${
                          themeMode === 'dark'
                            ? 'bg-amber-500/10 border-amber-500 shadow-lg ring-1 ring-amber-500/50'
                            : isDarkTheme
                            ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                            : isWarmTheme
                            ? 'bg-[#FAF6F0] border-[#EFE6D8] hover:border-[#DFD4C2]'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🌙</span>
                          <div>
                            <span className={`text-xs font-black block ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>داكن ملكي (Sleek Dark)</span>
                            <span className={`text-[10px] block ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>للمطاعم الفاخرة وسهرات اللاونج</span>
                          </div>
                        </div>
                        {themeMode === 'dark' && <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                      </button>
                    </div>
                  </div>

                  {/* 2. Ready-Made Industry Presets (1-Click Selector) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-bold block ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                        2. قوالب ألوان جاهزة بضغطة زر واحدة (Curated Presets):
                      </label>
                      <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>اختر قالباً لضبط كافة الألوان المتناسقة فوراً</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                      {BRAND_PRESETS.map((preset) => {
                        const isSelected = selectedThemePreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setSelectedThemePreset(preset.id);
                              setThemeMode(preset.theme_mode);
                              setPrimaryColor(preset.primary_color);
                              setSecondaryColor(preset.secondary_color);
                              setBackgroundColor(preset.background_color);
                              setCardColor(preset.card_color);
                            }}
                            className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between gap-2.5 relative group ${
                              isSelected
                                ? 'border-amber-500 shadow-md ring-2 ring-amber-500/40 ' + (isDarkTheme ? 'bg-slate-900' : 'bg-amber-50/50')
                                : isDarkTheme
                                ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                                : isWarmTheme
                                ? 'bg-[#FAF6F0] border-[#EFE6D8] hover:border-[#DFD4C2]'
                                : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xl">{preset.icon}</span>
                              <div className="flex items-center -space-x-1.5 rtl:space-x-reverse">
                                <span
                                  className="w-4 h-4 rounded-full border border-black/20 shadow-sm"
                                  style={{ backgroundColor: preset.primary_color }}
                                />
                                <span
                                  className="w-4 h-4 rounded-full border border-black/20 shadow-sm"
                                  style={{ backgroundColor: preset.secondary_color }}
                                />
                                <span
                                  className="w-4 h-4 rounded-full border border-black/20 shadow-sm"
                                  style={{ backgroundColor: preset.background_color }}
                                />
                              </div>
                            </div>
                            <div>
                              <span className={`text-[11px] font-bold block truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{preset.name}</span>
                              <span className={`text-[9px] block line-clamp-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{preset.description}</span>
                            </div>
                            {isSelected && (
                              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Detailed Color Pickers */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                    {/* Primary Color */}
                    <div className={`space-y-1.5 p-3 rounded-2xl border transition-colors ${
                      isDarkTheme ? 'bg-slate-900/70 border-slate-800/80' : isWarmTheme ? 'bg-[#FAF6F0] border-[#EFE6D8]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <label className={`text-[11px] font-bold block ${isDarkTheme ? 'text-slate-300' : 'text-slate-800'}`}>
                        اللون الأساسي للعلامة (Primary)
                      </label>
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => {
                            setPrimaryColor(e.target.value);
                            setSelectedThemePreset('');
                          }}
                          className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer p-0.5 shrink-0"
                        />
                        <input
                          type="text"
                          value={primaryColor}
                          onChange={(e) => {
                            setPrimaryColor(e.target.value);
                            setSelectedThemePreset('');
                          }}
                          className={`flex-1 min-w-0 border rounded-xl px-2.5 py-1.5 text-xs font-mono outline-none uppercase ${
                            isDarkTheme ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900 focus:border-amber-500'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">الهيدر والبطاقة والنصوص</span>
                    </div>

                    {/* Secondary Color */}
                    <div className={`space-y-1.5 p-3 rounded-2xl border transition-colors ${
                      isDarkTheme ? 'bg-slate-900/70 border-slate-800/80' : isWarmTheme ? 'bg-[#FAF6F0] border-[#EFE6D8]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <label className={`text-[11px] font-bold block ${isDarkTheme ? 'text-slate-300' : 'text-slate-800'}`}>
                        لون التمييز والأكشن (Secondary)
                      </label>
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => {
                            setSecondaryColor(e.target.value);
                            setSelectedThemePreset('');
                          }}
                          className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer p-0.5 shrink-0"
                        />
                        <input
                          type="text"
                          value={secondaryColor}
                          onChange={(e) => {
                            setSecondaryColor(e.target.value);
                            setSelectedThemePreset('');
                          }}
                          className={`flex-1 min-w-0 border rounded-xl px-2.5 py-1.5 text-xs font-mono outline-none uppercase ${
                            isDarkTheme ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900 focus:border-amber-500'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">النقاط والعروض وأزرار الشراء</span>
                    </div>

                    {/* Background Color */}
                    <div className={`space-y-1.5 p-3 rounded-2xl border transition-colors ${
                      isDarkTheme ? 'bg-slate-900/70 border-slate-800/80' : isWarmTheme ? 'bg-[#FAF6F0] border-[#EFE6D8]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <label className={`text-[11px] font-bold block ${isDarkTheme ? 'text-slate-300' : 'text-slate-800'}`}>
                        لون خلفية المنصة (Background)
                      </label>
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <input
                          type="color"
                          value={backgroundColor}
                          onChange={(e) => {
                            setBackgroundColor(e.target.value);
                            setSelectedThemePreset('');
                          }}
                          className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer p-0.5 shrink-0"
                        />
                        <input
                          type="text"
                          value={backgroundColor}
                          onChange={(e) => {
                            setBackgroundColor(e.target.value);
                            setSelectedThemePreset('');
                          }}
                          className={`flex-1 min-w-0 border rounded-xl px-2.5 py-1.5 text-xs font-mono outline-none uppercase ${
                            isDarkTheme ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900 focus:border-amber-500'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">خلفية بوابات العميل والكاشير</span>
                    </div>

                    {/* Card Surface Color */}
                    <div className={`space-y-1.5 p-3 rounded-2xl border transition-colors ${
                      isDarkTheme ? 'bg-slate-900/70 border-slate-800/80' : isWarmTheme ? 'bg-[#FAF6F0] border-[#EFE6D8]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <label className={`text-[11px] font-bold block ${isDarkTheme ? 'text-slate-300' : 'text-slate-800'}`}>
                        لون البطاقات والأسطح (Card Color)
                      </label>
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <input
                          type="color"
                          value={cardColor}
                          onChange={(e) => {
                            setCardColor(e.target.value);
                            setSelectedThemePreset('');
                          }}
                          className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer p-0.5 shrink-0"
                        />
                        <input
                          type="text"
                          value={cardColor}
                          onChange={(e) => {
                            setCardColor(e.target.value);
                            setSelectedThemePreset('');
                          }}
                          className={`flex-1 min-w-0 border rounded-xl px-2.5 py-1.5 text-xs font-mono outline-none uppercase ${
                            isDarkTheme ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900 focus:border-amber-500'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">لون بطاقات المنتجات والحاويات</span>
                    </div>
                  </div>

                  {/* 4. Interactive Live Simulator Preview */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-amber-400" />
                        <span>معاينة حية فورية لتطبيق وبوابة العميل (Live Simulator):</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-medium">مباشر حسب اختياراتك الحالية ⚡</span>
                    </div>

                    <div
                      className="p-5 sm:p-6 rounded-3xl border transition-all duration-300 flex flex-col md:flex-row items-center justify-center gap-6"
                      style={{ backgroundColor: backgroundColor, borderColor: themeMode === 'dark' ? '#1E293B' : '#CBD5E1' }}
                    >
                      {/* Live Customer Membership Card */}
                      {(() => {
                        const simIsPrimaryLight = (() => {
                          try {
                            const hex = primaryColor.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16) || 0;
                            const g = parseInt(hex.substring(2, 4), 16) || 0;
                            const b = parseInt(hex.substring(4, 6), 16) || 0;
                            return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
                          } catch {
                            return false;
                          }
                        })();
                        const simCardTextColor = simIsPrimaryLight ? '#0F172A' : '#FFFFFF';
                        const simCardSubtextColor = simIsPrimaryLight ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.75)';
                        const simCardBorderColor = simIsPrimaryLight ? 'rgba(0, 0, 0, 0.09)' : 'rgba(255, 255, 255, 0.15)';

                        const simIsSecondaryLight = (() => {
                          try {
                            const hex = secondaryColor.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16) || 0;
                            const g = parseInt(hex.substring(2, 4), 16) || 0;
                            const b = parseInt(hex.substring(4, 6), 16) || 0;
                            return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
                          } catch {
                            return false;
                          }
                        })();
                        const simBadgeTextColor = simIsSecondaryLight ? '#000000' : '#FFFFFF';

                        return (
                          <div
                            className="w-full max-w-[290px] h-[170px] rounded-3xl p-4 shadow-xl flex flex-col justify-between relative overflow-hidden transition-all duration-300"
                            style={{
                              backgroundColor: primaryColor,
                              color: simCardTextColor,
                              border: `1px solid ${simCardBorderColor}`,
                              boxShadow: `0 14px 28px -6px ${primaryColor}40`,
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {storeLogoUrl ? (
                                  <img
                                    src={storeLogoUrl}
                                    alt="Logo"
                                    className="w-8 h-8 rounded-xl object-cover bg-white/10 border border-white/20"
                                  />
                                ) : (
                                  <div
                                    className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs"
                                    style={{
                                      backgroundColor: simIsPrimaryLight ? '#0F172A' : '#FFFFFF',
                                      color: simIsPrimaryLight ? '#FFFFFF' : '#0F172A',
                                    }}
                                  >
                                    {storeName.slice(0, 2) || 'RD'}
                                  </div>
                                )}
                                <div>
                                  <span
                                    className="text-xs font-black block leading-tight"
                                    style={{ color: simCardTextColor }}
                                  >
                                    {storeName || 'اسم المتجر'}
                                  </span>
                                  <span
                                    className="text-[9px] block"
                                    style={{ color: simCardSubtextColor }}
                                  >
                                    عضوية ولاء VIP
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-black shadow-sm ${
                                  simBadgeTextColor === '#FFFFFF' ? 'keep-white' : ''
                                }`}
                                style={{ backgroundColor: secondaryColor, color: simBadgeTextColor }}
                              >
                                ذهبي ★
                              </span>
                            </div>

                            <div className="space-y-0.5">
                              <span
                                className="text-[9px] block"
                                style={{ color: simCardSubtextColor }}
                              >
                                رصيد النقاط المتاحة
                              </span>
                              <div className="flex items-baseline gap-1.5">
                                <span
                                  className="text-2xl font-black tracking-tight"
                                  style={{ color: simCardTextColor }}
                                >
                                  750
                                </span>
                                <span className="text-[10px] font-bold" style={{ color: secondaryColor }}>نقطة</span>
                              </div>
                            </div>

                            <div
                              className="flex items-center justify-between pt-1 text-[9px]"
                              style={{
                                borderTop: `1px solid ${simCardBorderColor}`,
                                color: simCardSubtextColor,
                              }}
                            >
                              <span className="font-mono">#RD-9821</span>
                              <span>مسح بالكاشير 📱</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Live Menu Product Card */}
                      <div
                        className="w-full max-w-[240px] rounded-2xl p-3.5 shadow-md flex flex-col gap-2.5 transition-all duration-300"
                        style={{
                          backgroundColor: cardColor,
                          borderColor: themeMode === 'dark' ? '#334155' : '#E2E8F0',
                          borderWidth: '1px',
                          color: themeMode === 'dark' ? '#F8FAFC' : '#0F172A',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black">منتج تجريبي في المنيو</span>
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{ backgroundColor: `${secondaryColor}25`, color: secondaryColor }}
                          >
                            الأكثر طلباً
                          </span>
                        </div>
                        <p className="text-[10px] opacity-70 leading-relaxed">
                          مذاق متوازن ومكونات طازجة مختارة بعناية لأجلك
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-sm font-black">24.00 ر.س</span>
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-xl text-[10px] font-black text-white shadow-sm flex items-center gap-1 transition"
                            style={{ backgroundColor: secondaryColor }}
                          >
                            <span>+ إضافة</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

            {/* Store Logo with Auto-Compressor */}
            <div className={`md:col-span-12 space-y-2 p-4 rounded-2xl border transition-colors ${
              isDarkTheme ? 'bg-slate-950 border-slate-800' : isWarmTheme ? 'bg-white border-[#EFE6D8] shadow-sm' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <label className={`text-xs font-bold block ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
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
                      className={`w-16 h-16 rounded-2xl object-cover border shadow-md ${
                        isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'
                      }`}
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
                  <div className={`w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center text-slate-400 shrink-0 ${
                    isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressing}
                  className={`py-3 px-4 rounded-xl border text-xs font-semibold flex items-center space-x-2 rtl:space-x-reverse transition ${
                    isDarkTheme
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                  }`}
                >
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>{isCompressing ? 'جاري الضغط...' : 'اختر صورة من جهازك'}</span>
                </button>
              </div>

              {logoStats && (
                <p className="text-[11px] text-emerald-500 font-bold">
                  تم ضغط الصورة بنسبة <strong>{logoStats.savingsPercent}%</strong> (الحجم: {logoStats.compressedSizeKB} KB)
                </p>
              )}
            </div>

            {/* 📸 Showcase Slider / Hero Banners Management */}
            <div className={`md:col-span-12 p-4 sm:p-5 rounded-2xl border space-y-4 transition-colors ${
              isDarkTheme ? 'bg-slate-950 border-slate-800' : isWarmTheme ? 'bg-white border-[#EFE6D8] shadow-sm' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className={`text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>معرض صور وسلايدر واجهة العميل (VIP Showcase Slider):</span>
                  </h4>
                  <p className={`text-[11px] mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                    أضف صور منتجاتك، عباراتك التسويقية، وشارات التميز لتظهر في السلايدر المتحرك أعلى شاشة العميل
                  </p>
                </div>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-mono font-bold ${
                  isDarkTheme ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}>
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

            <div className={`md:col-span-12 flex items-center justify-between pt-3 border-t ${
              isDarkTheme ? 'border-slate-800' : isWarmTheme ? 'border-[#EFE6D8]' : 'border-slate-200'
            }`}>
              <span className={`text-xs ${isDarkTheme ? 'text-slate-500' : 'text-slate-500'}`}>
                التغييرات تنعكس فوراً على شاشات الكاشير ومحفظة الزبائن
              </span>

              <button
                type="submit"
                disabled={updatingSettings || isCompressing}
                className="py-3 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center space-x-2 rtl:space-x-reverse shadow-lg shadow-amber-500/25 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{updatingSettings ? 'جاري الحفظ...' : 'حفظ هوية وإعدادات المتجر'}</span>
              </button>
            </div>
          </form>

          {settingsSavedMessage && (
            <div className={`p-3.5 rounded-2xl border text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse ${
              isDarkTheme
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm'
            }`}>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>{settingsSavedMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 💳 2. SUB-SECTION: مركز إدارة المدفوعات والتحصيل (Unified Payments) */}
      {/* ======================================================== */}
      {settingsSection === 'payments' && (
        <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/90 border border-slate-800 space-y-8 animate-fade-in shadow-xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  مركز إدارة المدفوعات وطرق التحصيل (Omnichannel Payments)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  تحكم مرن وشامل في قناتي الدفع: الدفع داخل التطبيق (عن بُعد) والدفع عند الكاشير (حضوري في الفرع)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold font-mono ${
                onlinePaymentEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${onlinePaymentEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                دفع التطبيق: {onlinePaymentEnabled ? 'مفعل ✅' : 'معطل ⏸️'}
              </span>

              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold font-mono ${
                paymentConfig.softpos_enabled
                  ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                  : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
              }`}>
                <span className={`w-2 h-2 rounded-full ${paymentConfig.softpos_enabled ? 'bg-purple-400 animate-pulse' : 'bg-blue-400'}`} />
                كاشير: {paymentConfig.softpos_enabled ? 'تابلت SoftPOS باللمس 📲' : 'جهاز شبكة بنكي 💳'}
              </span>
            </div>
          </div>

          {/* 💡 Smart Educational Guide Card (دليل توضيحي بسيط يريح التاجر) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-black">
              <Sparkles className="w-4 h-4" />
              <span>دليلك السريع: كيف تعمل المدفوعات في منصة {getActiveTenantConfig().brandName}؟</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/70 space-y-1">
                <div className="font-black text-emerald-400 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>1. الدفع داخل التطبيق (عن بُعد):</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  للزبون الذي يتصفح ويطلب من جواله عبر Apple Pay أو بطاقة مدى. يتطلب بوابة دفع إلكتروني (مثل ميسر أو جيديا)، ويمكنك تفعيل البيئة التجريبية فوراً مجاناً.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/70 space-y-1">
                <div className="font-black text-purple-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5" />
                  <span>2. الدفع عند الكاشير (حضوري في المحل):</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  للزبون الواقف أمام المحاسب. يمكنك استخدام جهاز شبكة مدى العادي بدون أي اشتراكات، أو تفعيل خاصية SoftPOS لتحويل تابلت الكاشير نفسه لجهاز شبكة باللمس!
                </p>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 pt-1">
              ✨ <strong>ملاحظة مريحة:</strong> كافة الخدمات اختيارية بالكامل؛ لن يُلزمك النظام بأي اشتراك أو رسوم إضافية ما لم ترغب بتفعيلها بنفسك.
            </p>
          </div>

          {/* ======================================================== */}
          {/* 📱 CHANNEL 1: الدفع الإلكتروني عبر التطبيق (Online In-App) */}
          {/* ======================================================== */}
          <div className="space-y-5 p-5 sm:p-6 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <h4 className="text-sm sm:text-base font-black text-white">
                    قناة الدفع الإلكتروني عبر التطبيق (Mada / Apple Pay / Visa)
                  </h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                    onlinePaymentEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {onlinePaymentEnabled ? 'مفعل' : 'معطل'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  تمكين عملائك من الدفع الفوري عند الطلب أو الحجز من جوالاتهم
                </p>
              </div>

              <button
                type="button"
                disabled={isSavingPaymentPolicy}
                onClick={() => {
                  const next = !onlinePaymentEnabled;
                  setOnlinePaymentEnabled(next);
                  const nextCfg: StorePaymentConfig = { ...paymentConfig, online_enabled: next };
                  setPaymentConfig(nextCfg);
                  handleInstantSavePaymentPolicy({ online_payment_enabled: next, payment_config: nextCfg });
                }}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  onlinePaymentEnabled ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    onlinePaymentEnabled ? 'translate-x-0' : '-translate-x-7'
                  }`}
                />
              </button>
            </div>

            {onlinePaymentEnabled && (
              <div className="space-y-5 animate-fade-in">
                {/* Provider Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    اختر مزود بوابة الدفع الإلكتروني لمتجرك:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {[
                      {
                        id: 'sandbox' as const,
                        name: 'البيئة التجريبية (Sandbox)',
                        desc: 'مدمج ومجاني للاختبار الفوري دون اشتراك أو أوراق',
                        badge: 'جاهز فوراً ⚡',
                        badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
                      },
                      {
                        id: 'moyasar' as const,
                        name: 'ميسر (Moyasar)',
                        desc: 'الأسرع تفعيلاً لمدى وApple Pay بحسابك البنكي',
                        badge: 'معتمد من ساما 🇸🇦',
                        badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
                      },
                      {
                        id: 'geidea' as const,
                        name: 'جيديا (Geidea E-Com)',
                        desc: 'حل موحد ممتاز للمتجر والكاشير معاً في حساب واحد',
                        badge: 'حل موحد 🔄',
                        badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
                      },
                      {
                        id: 'tap' as const,
                        name: 'تاب (Tap Payments)',
                        desc: 'بوابة إقليمية موثوقة تدعم بطاقات الخليج كافة',
                        badge: 'إقليمي 🌐',
                        badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
                      },
                    ].map((prov) => {
                      const isSelected = (paymentConfig.online_provider || 'sandbox') === prov.id;
                      return (
                        <div
                          key={prov.id}
                          onClick={() => {
                            const nextCfg: StorePaymentConfig = { ...paymentConfig, online_provider: prov.id };
                            setPaymentConfig(nextCfg);
                            handleInstantSavePaymentPolicy({ payment_config: nextCfg });
                          }}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-black text-white">{prov.name}</span>
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                            </div>
                            <p className="text-[10px] text-slate-400 leading-relaxed mb-2">
                              {prov.desc}
                            </p>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border inline-block w-fit ${prov.badgeColor}`}>
                            {prov.badge}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Provider Settings / Key Input */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-400" />
                      <span>بيانات تشغيل بوابة {paymentConfig.online_provider === 'sandbox' ? 'البيئة التجريبية' : paymentConfig.online_provider === 'moyasar' ? 'ميسر Moyasar' : paymentConfig.online_provider === 'geidea' ? 'جيديا Geidea' : 'تاب Tap'}</span>
                    </span>

                    {/* Mode Toggle */}
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          const nextCfg: StorePaymentConfig = { ...paymentConfig, online_mode: 'sandbox' };
                          setPaymentConfig(nextCfg);
                          handleInstantSavePaymentPolicy({ payment_config: nextCfg });
                        }}
                        className={`px-2.5 py-1 rounded-lg transition ${
                          paymentConfig.online_mode === 'sandbox'
                            ? 'bg-amber-500 text-black shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        تجريبي (Sandbox)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextCfg: StorePaymentConfig = { ...paymentConfig, online_mode: 'live' };
                          setPaymentConfig(nextCfg);
                          handleInstantSavePaymentPolicy({ payment_config: nextCfg });
                        }}
                        className={`px-2.5 py-1 rounded-lg transition ${
                          paymentConfig.online_mode === 'live'
                            ? 'bg-emerald-500 text-black shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        حي (Live الإنتاج)
                      </button>
                    </div>
                  </div>

                  {paymentConfig.online_provider === 'sandbox' ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        البيئة التجريبية المدمجة جاهزة ونشطة الآن. يمكن لعملائك ولكم تجربة الدفع ببطاقات مدى وأبل باي تجريبية بدون أي تكاليف.
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] text-slate-300 font-bold block mb-1">
                          المفتاح العام (Publishable / Public API Key):
                        </label>
                        <input
                          type="text"
                          placeholder={paymentConfig.online_provider === 'moyasar' ? 'pk_live_...' : 'pk_...'}
                          value={paymentConfig.online_public_key || ''}
                          onChange={(e) => {
                            const nextCfg: StorePaymentConfig = { ...paymentConfig, online_public_key: e.target.value };
                            setPaymentConfig(nextCfg);
                          }}
                          onBlur={() => handleInstantSavePaymentPolicy({ payment_config: paymentConfig })}
                          className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none dir-ltr text-left"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-300 font-bold block mb-1">
                          المفتاح السري / المرجع (Secret Key / Merchant ID):
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••••••••••"
                          value={paymentConfig.online_secret_key || ''}
                          onChange={(e) => {
                            const nextCfg: StorePaymentConfig = { ...paymentConfig, online_secret_key: e.target.value };
                            setPaymentConfig(nextCfg);
                          }}
                          onBlur={() => handleInstantSavePaymentPolicy({ payment_config: paymentConfig })}
                          className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none dir-ltr text-left"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Sub-Policy 1: الطلبات (Orders Payment Policy) */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-amber-400" />
                      <span>سياسة الدفع لطلبات المنيو (محلي، سفري، توصيل):</span>
                    </label>
                    <span className="text-[11px] text-slate-400">حفظ تلقائي فوري ⚡</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Option 1: Both */}
                    <div
                      onClick={() => {
                        setOrdersPaymentPolicy('both');
                        handleInstantSavePaymentPolicy({ orders_payment_policy: 'both' });
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        ordersPaymentPolicy === 'both'
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-black text-white flex items-center gap-1.5">
                            <span>الخياران متاحان (مرن)</span>
                            <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">افتراضي</span>
                          </span>
                          {ordersPaymentPolicy === 'both' && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          يمنح العميل حرية الاختيار بين الدفع أونلاين فوراً أو الدفع عند الاستلام/الكاشير.
                        </p>
                      </div>
                    </div>

                    {/* Option 2: Online Only */}
                    <div
                      onClick={() => {
                        setOrdersPaymentPolicy('online_only');
                        handleInstantSavePaymentPolicy({ orders_payment_policy: 'online_only' });
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        ordersPaymentPolicy === 'online_only'
                          ? 'bg-emerald-500/10 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-black text-white flex items-center gap-1.5">
                            <span>دفع أونلاين إلزامي فقط 🔒</span>
                          </span>
                          {ordersPaymentPolicy === 'online_only' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          لا يُقبل أي طلب إلا بعد سداد قيمته إلكترونياً بالكامل. يلغي خيار الدفع عند الاستلام.
                        </p>
                      </div>
                    </div>

                    {/* Option 3: Pay at store only */}
                    <div
                      onClick={() => {
                        setOrdersPaymentPolicy('pay_at_store_only');
                        handleInstantSavePaymentPolicy({ orders_payment_policy: 'pay_at_store_only' });
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        ordersPaymentPolicy === 'pay_at_store_only'
                          ? 'bg-blue-500/10 border-blue-500/50 shadow-md ring-1 ring-blue-500/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-black text-white flex items-center gap-1.5">
                            <span>دفع عند الاستلام / في الفرع فقط 💵</span>
                          </span>
                          {ordersPaymentPolicy === 'pay_at_store_only' && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          يتم تجهيز الطلب ويسدد العميل نقداً أو بجهاز مدى في الفرع مباشرة.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-Policy 2: الحجوزات والمواعيد (Bookings Payment Policy) */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-400" />
                      <span>سياسة الدفع لحجوزات الخدمات والمواعيد:</span>
                    </label>
                    <span className="text-[11px] text-slate-400">حفظ تلقائي فوري ⚡</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Option 1: Both */}
                    <div
                      onClick={() => {
                        setBookingsPaymentPolicy('both');
                        handleInstantSavePaymentPolicy({ bookings_payment_policy: 'both' });
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        bookingsPaymentPolicy === 'both'
                          ? 'bg-purple-500/10 border-purple-500/50 shadow-md ring-1 ring-purple-500/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-black text-white flex items-center gap-1.5">
                            <span>الخياران متاحان (مرن)</span>
                            <span className="text-[10px] text-purple-400 font-bold bg-purple-500/10 px-1.5 py-0.5 rounded">افتراضي</span>
                          </span>
                          {bookingsPaymentPolicy === 'both' && <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          يمكن للعميل تأكيد الحجز فوراً مع خيار الدفع أونلاين أو الدفع عند الحضور في الموعد.
                        </p>
                      </div>
                    </div>

                    {/* Option 2: Online Only */}
                    <div
                      onClick={() => {
                        setBookingsPaymentPolicy('online_only');
                        handleInstantSavePaymentPolicy({ bookings_payment_policy: 'online_only' });
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        bookingsPaymentPolicy === 'online_only'
                          ? 'bg-emerald-500/10 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-black text-white flex items-center gap-1.5">
                            <span>دفع أونلاين إلزامي لتأكيد الحجز 🔒</span>
                          </span>
                          {bookingsPaymentPolicy === 'online_only' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          حجز الموعد يتطلب السداد مقدماً عبر المتجر لتثبيت وتأكيد الحجز ومنع التغيب.
                        </p>
                      </div>
                    </div>

                    {/* Option 3: Pay at store only */}
                    <div
                      onClick={() => {
                        setBookingsPaymentPolicy('pay_at_store_only');
                        handleInstantSavePaymentPolicy({ bookings_payment_policy: 'pay_at_store_only' });
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        bookingsPaymentPolicy === 'pay_at_store_only'
                          ? 'bg-blue-500/10 border-blue-500/50 shadow-md ring-1 ring-blue-500/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-black text-white flex items-center gap-1.5">
                            <span>الدفع عند الحضور في الموعد فقط 💵</span>
                          </span>
                          {bookingsPaymentPolicy === 'pay_at_store_only' && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          يتم تثبيت الحجز ويسدد العميل تكلفة الخدمة عند الحضور في الفرع نقداً أو مدى.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* 📟 CHANNEL 2: الدفع الحضوري عند الكاشير (In-Store & SoftPOS) */}
          {/* ======================================================== */}
          <div className="space-y-5 p-5 sm:p-6 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Tablet className="w-5 h-5 text-purple-400" />
                  <h4 className="text-sm sm:text-base font-black text-white">
                    قناة الدفع الحضوري عند الكاشير (In-Store POS & SoftPOS)
                  </h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                    paymentConfig.softpos_enabled
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                      : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  }`}>
                    {paymentConfig.softpos_enabled ? 'SoftPOS مفعل' : 'شبكة بنكية خارجية'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  حدد كيف يقوم الكاشير بتحصيل مبالغ الشبكة من الزبائن في الفرع
                </p>
              </div>

              {/* Quick SoftPOS Test Button */}
              {paymentConfig.softpos_enabled && (
                <button
                  type="button"
                  onClick={() => {
                    setSoftposTestStatus('idle');
                    setSoftposAuthCode(null);
                    setSoftposTestModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Radio className="w-3.5 h-3.5 animate-pulse text-purple-400" />
                  <span>محاكاة تجربة اللمس (NFC Tap) 📲</span>
                </button>
              )}
            </div>

            {/* Mode Cards: External Terminal vs SoftPOS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option A: Traditional External POS */}
              <div
                onClick={() => {
                  const nextCfg: StorePaymentConfig = { ...paymentConfig, softpos_enabled: false };
                  setPaymentConfig(nextCfg);
                  handleInstantSavePaymentPolicy({ payment_config: nextCfg });
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                  !paymentConfig.softpos_enabled
                    ? 'bg-blue-500/10 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-black text-white">جهاز شبكة بنكي خارجي (التقليدي)</span>
                    </div>
                    {!paymentConfig.softpos_enabled && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                    استخدم جهاز مدى البنكي العادي الممنوح لك من بنكك (بدون أي رسوم أو إعدادات برمجية إضافية). يقوم الكاشير بتمرير البطاقة على جهاز البنك واعتماد الفاتورة فوراً.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-blue-300 font-bold bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg w-fit">
                  <span>✓ بدون اشتراك</span>
                  <span>•</span>
                  <span>✓ أسهل خيار للبدء</span>
                </div>
              </div>

              {/* Option B: SoftPOS Tap-to-Phone */}
              <div
                onClick={() => {
                  const nextCfg: StorePaymentConfig = { ...paymentConfig, softpos_enabled: true };
                  setPaymentConfig(nextCfg);
                  handleInstantSavePaymentPolicy({ payment_config: nextCfg });
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                  paymentConfig.softpos_enabled
                    ? 'bg-purple-500/10 border-purple-500 shadow-md ring-1 ring-purple-500/40'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Tablet className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-black text-white">تحويل التابلت لشبكة SoftPOS (Tap-to-Phone)</span>
                    </div>
                    {paymentConfig.softpos_enabled && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                    استغنِ عن جهاز الشبكة المنفصل! حوّل تابلت الكاشير العامل بنظام أندرويد إلى جهاز شبكة يستقبل لمس بطاقات مدى وأبل باي عبر شريحة الـ NFC بظهر الجهاز مباشرة.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-purple-300 font-bold bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg w-fit">
                  <span>⚡ بدون أجهزة إضافية</span>
                  <span>•</span>
                  <span>معتمد من ساما ومدى 🇸🇦</span>
                </div>
              </div>
            </div>

            {/* SoftPOS Configuration Drawer (Shown when SoftPOS enabled) */}
            {paymentConfig.softpos_enabled && (
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-purple-400" />
                    <span>إعدادات مزود خدمة SoftPOS للتابلت:</span>
                  </span>

                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        const nextCfg: StorePaymentConfig = { ...paymentConfig, softpos_mode: 'sandbox' };
                        setPaymentConfig(nextCfg);
                        handleInstantSavePaymentPolicy({ payment_config: nextCfg });
                      }}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        paymentConfig.softpos_mode === 'sandbox'
                          ? 'bg-amber-500 text-black shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      تجريبي (Sandbox)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextCfg: StorePaymentConfig = { ...paymentConfig, softpos_mode: 'live' };
                        setPaymentConfig(nextCfg);
                        handleInstantSavePaymentPolicy({ payment_config: nextCfg });
                      }}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        paymentConfig.softpos_mode === 'live'
                          ? 'bg-purple-500 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      حي (Live إنتاج)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Nearpay */}
                  <div
                    onClick={() => {
                      const nextCfg: StorePaymentConfig = { ...paymentConfig, softpos_provider: 'nearpay' };
                      setPaymentConfig(nextCfg);
                      handleInstantSavePaymentPolicy({ payment_config: nextCfg });
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      paymentConfig.softpos_provider === 'nearpay'
                        ? 'bg-purple-500/15 border-purple-500 text-purple-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black">نيرباي (Nearpay SDK)</span>
                      {paymentConfig.softpos_provider === 'nearpay' && <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      الرائد والأكثر انتشاراً في السعودية للدفع عبر التابلت بنقرة واحدة
                    </p>
                  </div>

                  {/* Geidea Tap on Phone */}
                  <div
                    onClick={() => {
                      const nextCfg: StorePaymentConfig = { ...paymentConfig, softpos_provider: 'geidea' };
                      setPaymentConfig(nextCfg);
                      handleInstantSavePaymentPolicy({ payment_config: nextCfg });
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      paymentConfig.softpos_provider === 'geidea'
                        ? 'bg-purple-500/15 border-purple-500 text-purple-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black">جيديا (Geidea Tap-on-Phone)</span>
                      {paymentConfig.softpos_provider === 'geidea' && <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      يسمح لك باستخدام حسابك التجاري في جيديا للمتجر والتابلت معاً
                    </p>
                  </div>
                </div>

                {/* API Key / Terminal ID Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] text-slate-300 font-bold block mb-1">
                      مفتاح التطبيق للتابلت (App / Client Key):
                    </label>
                    <input
                      type="text"
                      placeholder={paymentConfig.softpos_provider === 'nearpay' ? 'nearpay_live_...' : 'geidea_term_...'}
                      value={paymentConfig.softpos_api_key || ''}
                      onChange={(e) => {
                        const nextCfg: StorePaymentConfig = { ...paymentConfig, softpos_api_key: e.target.value };
                        setPaymentConfig(nextCfg);
                      }}
                      onBlur={() => handleInstantSavePaymentPolicy({ payment_config: paymentConfig })}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-purple-400 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none dir-ltr text-left"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-bold block mb-1">
                      معرّف نقطة البيع (Terminal ID):
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: TID-BRANCH-01"
                      value={paymentConfig.softpos_terminal_id || ''}
                      onChange={(e) => {
                        const nextCfg: StorePaymentConfig = { ...paymentConfig, softpos_terminal_id: e.target.value };
                        setPaymentConfig(nextCfg);
                      }}
                      onBlur={() => handleInstantSavePaymentPolicy({ payment_config: paymentConfig })}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-purple-400 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none dir-ltr text-left"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* 💡 FAQ: إجابات سريعة تريح التاجر (Smart Merchant FAQ) */}
          {/* ======================================================== */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-black">
              <HelpCircle className="w-4 h-4" />
              <span>أسئلة شائعة تهمك حول المدفوعات والاشتراكات:</span>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1">
                <span className="font-bold text-white block">س: هل أنا ملزم بالاشتراك في بوابات الدفع الإلكتروني أو الـ SoftPOS؟</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  ج: أبداً! يمكنك تشغيل متجرك وفروعك مجاناً وبأبسط الطرق بالاعتماد على الدفع النقدي (كاش) وجهاز الشبكة العادي الممنوح لك من بنكك، دون أي رسوم اشتراك إضافية.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1">
                <span className="font-bold text-white block">س: هل يمكنني التعامل مع مزود خدمة واحد للمتجر والكاشير معاً؟</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  ج: نعم، شركة مثل <strong>جيديا (Geidea)</strong> تتيح لك فتح حساب واحد يغطي بوابة الدفع للمتجر وخدمة Tap-on-Phone للتابلت، وتودع كافة المبيعات في نفس الحساب البنكي. كما يمكنك اختيار <strong>ميسر (Moyasar)</strong> للتطبيق و<strong>نيرباي (Nearpay)</strong> للتابلت وكلاهما يحوّل المبالغ مباشرة لنفس آيبانك.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1">
                <span className="font-bold text-white block">س: أين تذهب مبالغ المبيعات التي يدفعها العملاء؟</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  ج: كافة بوابات الدفع وخدمات الـ SoftPOS السعودية المعتمدة من البنك المركزي (ساما) تقوم بإيداع المبالغ مباشرة في حسابك التجاري البنكي (الآيبان) بشكل دوري وتلقائي.
                </p>
              </div>
            </div>
          </div>

          {/* Status footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-slate-800">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>تنعكس إعدادات الدفع فوراً على تطبيق العميل وشاشة الكاشير</span>
            </span>
            {paymentPolicyStatus && (
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl">
                {paymentPolicyStatus}
              </span>
            )}
          </div>

          {/* 📲 Modal: محاكاة تجربة SoftPOS Tap-to-Phone التفاعلية */}
          {softposTestModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
              <div className="bg-slate-900 border-2 border-purple-500/40 rounded-3xl p-6 w-full max-w-md shadow-2xl relative space-y-5 text-center">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Radio className="w-5 h-5 text-purple-400" />
                    <h3 className="text-base font-black text-white">محاكاة الدفع باللمس (SoftPOS NFC)</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSoftposTestModalOpen(false)}
                    className="text-slate-400 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                </div>

                {/* Radar Contactless Waves Visual */}
                <div className="py-4 relative flex flex-col items-center justify-center">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping" />
                    <div className="absolute inset-2 rounded-full border-2 border-purple-500/40 animate-pulse" />
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-purple-500/30">
                      <Radio className="w-10 h-10" />
                    </div>
                  </div>

                  <div className="mt-4 space-y-1">
                    <p className="text-sm font-black text-white">
                      {softposTestStatus === 'idle' && 'قرّب البطاقة أو الجوال من شريحة الـ NFC 💳'}
                      {softposTestStatus === 'scanning' && 'جاري قراءة البطاقة... 📡'}
                      {softposTestStatus === 'processing' && 'جاري معالجة العملية مع شبكة مدى... ⏳'}
                      {softposTestStatus === 'approved' && 'تمت العملية بنجاح! مسدد ومقبول ✅'}
                    </p>
                    <p className="text-xs text-slate-400">
                      المبلغ المطلوب في الاختبار: <span className="font-mono text-purple-300 font-bold">150.00 ﷼</span>
                    </p>
                  </div>
                </div>

                {/* Result Display */}
                {softposTestStatus === 'approved' && softposAuthCode && (
                  <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 space-y-2 animate-fade-in text-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/30">
                      ✓
                    </div>
                    <div className="text-emerald-400 font-black text-sm">
                      تم تفويض عملية مدى (MADA APPROVED)
                    </div>
                    <p className="text-xs font-mono text-emerald-200">
                      رقم التفويض: <strong className="text-white">{softposAuthCode}</strong>
                    </p>
                    <div className="flex justify-center gap-2 pt-1">
                      <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-300 font-mono">EMV Contactless</span>
                      <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-emerald-300 font-mono">Mada Debit</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2 pt-2">
                  {softposTestStatus !== 'approved' ? (
                    <button
                      type="button"
                      disabled={softposTestStatus !== 'idle'}
                      onClick={() => {
                        setSoftposTestStatus('scanning');
                        playBeepSound();
                        setTimeout(() => {
                          setSoftposTestStatus('processing');
                          setTimeout(() => {
                            playBeepSound();
                            setSoftposAuthCode(`AUTH-MADA-${Math.floor(100000 + Math.random() * 900000)}`);
                            setSoftposTestStatus('approved');
                          }, 900);
                        }, 700);
                      }}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm transition shadow-lg shadow-purple-500/25 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Radio className="w-4 h-4" />
                      <span>
                        {softposTestStatus === 'idle'
                          ? 'محاكاة لمس بطاقة مدى الآن (Tap Card)'
                          : 'جاري قراءة وتفويض مدى...'}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSoftposTestStatus('idle');
                        setSoftposAuthCode(null);
                      }}
                      className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
                    >
                      إعادة الاختبار 🔄
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSoftposTestModalOpen(false)}
                    className="w-full py-2.5 text-xs text-slate-400 hover:text-white"
                  >
                    إغلاق النافذة
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 📱 3. SUB-SECTION: بطاقة Apple Wallet & Google Wallet      */}
      {/* ======================================================== */}
      {settingsSection === 'wallet_passes' && (() => {
        const currentWalletConfig = WalletPassService.getWalletConfig(store);
        const registeredDevices = WalletPassService.getStoreRegistrations(store.id);

        return (
          <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/90 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
              <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm shrink-0">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-white">
                      بطاقة Apple Wallet & Google Wallet ومستشعر القرب الجغرافي
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                      ميزة رادار الحصرية ⚡
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    تمكين عملائك من إضافة بطاقة ولاء متجرك إلى محفظة الآيفون (Apple Wallet) والأندرويد بضغطة زر
                    واحدة، مع تفعيل إشعارات شاشة القفل التلقائية عند اقتراب العميل من أي من فروعك دون الحاجة لتحميل تطبيق!
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800 self-start sm:self-auto">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-white">البطاقات الرقمية: نشطة وجاهزة</span>
              </div>
            </div>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block font-bold">بطاقات العملاء الصادرة</span>
                <span className="text-xl font-black text-amber-400 font-mono mt-1 block">
                  {registeredDevices.length > 0 ? registeredDevices.length : customers.length}
                </span>
                <span className="text-[10px] text-slate-500">بطاقة مفعلة بمحفظة الهاتف</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block font-bold">الفروع المرتبطة (Geofencing)</span>
                <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
                  {branches.length > 0 ? branches.length : 3}
                </span>
                <span className="text-[10px] text-slate-500">نقاط GPS متصلة بشاشة القفل</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block font-bold">نطاق مستشعر القرب</span>
                <span className="text-xl font-black text-blue-400 font-mono mt-1 block">
                  {currentWalletConfig.proximity_radius_meters || 300} م
                </span>
                <span className="text-[10px] text-slate-500">نصف قطر تنبيه شاشة القفل</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block font-bold">تحديث النقاط الفوري</span>
                <span className="text-xl font-black text-purple-400 font-mono mt-1 block">
                  تلقائي 100%
                </span>
                <span className="text-[10px] text-slate-500">مع كل عملية بيع بالكاشير</span>
              </div>
            </div>

            {/* Configuration Form */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
              <div className="lg:col-span-7 space-y-4">
                {/* 1. Lockscreen Message Template */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="text-xs font-black text-white block">
                    نص إشعار شاشة القفل التلقائي عند اقتراب العميل من الفرع 🔔
                  </label>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    هذا النص سيظهر على شاشة قفل الآيفون تلقائياً عندما يقترب العميل من أي فرع من فروعك.
                    يمكنك استخدام المتغيرات <code className="text-amber-400 bg-slate-900 px-1 py-0.5 rounded">{'{store}'}</code> و <code className="text-amber-400 bg-slate-900 px-1 py-0.5 rounded">{'{points}'}</code>.
                  </p>
                  <textarea
                    rows={2}
                    defaultValue={currentWalletConfig.lockscreen_message_template}
                    onBlur={(e) => {
                      WalletPassService.saveWalletConfig(store.id, {
                        lockscreen_message_template: e.target.value,
                      });
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-teal-500 font-medium"
                    placeholder="مثال: أهلاً بك بالقرب من {store}! لديك {points} نقطة ومكافآت بانتظارك ☕🎁"
                  />
                </div>

                {/* 2. Proximity Radius Setting */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-black text-white block">
                        مسافة استشعار القرب الجغرافي (Geofence Trigger Radius)
                      </label>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        المسافة التي يبدأ عندها الهاتف بإظهار البطاقة للعميل على شاشة القفل.
                      </p>
                    </div>
                    <span className="text-xs font-mono font-black text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-xl border border-teal-500/30">
                      {currentWalletConfig.proximity_radius_meters || 300} متر
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[100, 300, 500, 1000].map((meters) => (
                      <button
                        key={meters}
                        type="button"
                        onClick={() => {
                          WalletPassService.saveWalletConfig(store.id, {
                            proximity_radius_meters: meters,
                          });
                          setStore({ ...store });
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition ${
                          (currentWalletConfig.proximity_radius_meters || 300) === meters
                            ? 'bg-teal-500 text-slate-950 border-teal-400 font-black'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {meters} متر
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Card Styling & Colors */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <label className="text-xs font-black text-white block">
                    ألوان وهوية بطاقة المحفظة (Apple & Google Pass)
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-1">خلفية البطاقة</span>
                      <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800">
                        <input
                          type="color"
                          defaultValue={currentWalletConfig.background_color || '#110E05'}
                          onChange={(e) => {
                            WalletPassService.saveWalletConfig(store.id, {
                              background_color: e.target.value,
                            });
                          }}
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <span className="text-[11px] font-mono text-slate-300">داكن فاخر</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block mb-1">لون النقاط والشعارات</span>
                      <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800">
                        <input
                          type="color"
                          defaultValue={currentWalletConfig.label_color || '#E3B94A'}
                          onChange={(e) => {
                            WalletPassService.saveWalletConfig(store.id, {
                              label_color: e.target.value,
                            });
                          }}
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <span className="text-[11px] font-mono text-amber-400">ذهبي ملكي</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block mb-1">لون النصوص</span>
                      <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800">
                        <input
                          type="color"
                          defaultValue={currentWalletConfig.foreground_color || '#FFFFFF'}
                          onChange={(e) => {
                            WalletPassService.saveWalletConfig(store.id, {
                              foreground_color: e.target.value,
                            });
                          }}
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <span className="text-[11px] font-mono text-white">أبيض ناصع</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Mockup Preview */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
                  <span className="text-xs font-black text-slate-400 block">
                    معاينة بطاقة Apple Wallet لمتجرك 
                  </span>

                  {/* Card Silhouette */}
                  <div
                    className="w-full rounded-2xl p-4 text-right shadow-2xl border transition relative overflow-hidden"
                    style={{
                      backgroundColor: currentWalletConfig.background_color || '#110E05',
                      borderColor: `${currentWalletConfig.label_color || '#E3B94A'}40`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-xs font-black text-amber-400">
                          {store.name.slice(0, 1)}
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-white">{store.name}</h4>
                          <span className="text-[9px] text-white/60">بطاقة الولاء والمكافآت</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        VIP GOLD
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 mb-3 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] text-white/70 block">رصيد النقاط</span>
                        <span className="text-xl font-black font-mono text-amber-400">180 نقطة</span>
                      </div>
                      <div className="text-left">
                        <span className="text-[9px] text-white/70 block">اسم العميل</span>
                        <span className="text-xs font-bold text-white">عبدالله الشمري</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-white/60 pt-1 border-t border-white/10">
                      <span>📍 إشعار شاشة القفل نشط</span>
                      <span className="font-mono">VIP-966050</span>
                    </div>
                  </div>

                  {/* Lockscreen Preview Simulation */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-right space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-bold text-white flex items-center gap-1">
                        <span></span>
                        <span>شاشة القفل • على بعد 140 متر</span>
                      </span>
                      <span>الآن</span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-medium">
                      {currentWalletConfig.lockscreen_message_template
                        .replace('{store}', store.name)
                        .replace('{points}', '180')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* 🛡️ 4. SUB-SECTION: الأمان والـ PIN ونقاط الولاء (Security) */}
      {/* ======================================================== */}
      {settingsSection === 'security' && (
        <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/90 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-sm">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  الأمان والـ PIN وصلاحيات المدير ونقاط الولاء
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  إدارة رمز الدخول السري للمدير PIN، سقف فواتير الكاشير، رقم جوال الإدارة المعتمد، ونظام نقاط الولاء
                </p>
              </div>
            </div>

            <div className="px-3.5 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-bold font-mono">
              حماية متقدمة 🔒
            </div>
          </div>

          <form onSubmit={handleSaveLoyaltySettings} className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Manager Name (Editable) */}
            <div className="md:col-span-6 space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-purple-400" />
                <span>اسم المدير العام / المسئول:</span>
              </label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="اسم مدير الفرع أو مالك النشاط"
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-400 rounded-2xl px-4 py-3 text-sm font-bold text-white outline-none transition"
              />
              <p className="text-[10px] text-slate-500">
                الاسم المسجل في السجلات الإدارية وتقارير المتجر.
              </p>
            </div>

            {/* Manager Contact Phone (Locked & Read-only 🔒) */}
            <div className="md:col-span-6 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-purple-400" />
                  <span>رقم جوال المتجر / المدير العام:</span>
                </label>
                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1 font-mono">
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>مقفل (التحكم من لوحة المالك فقط)</span>
                </span>
              </div>
              <div className="w-full bg-slate-950/70 border border-slate-800 rounded-2xl px-4 py-3 text-xs font-mono text-slate-300 flex items-center justify-between select-all" dir="ltr">
                <span>{store.manager_contact || (store as any).phone || 'غير مسجل'}</span>
                <span className="text-[10px] text-slate-500 font-sans">معتمد أمنياً</span>
              </div>
              <p className="text-[10px] text-slate-500">
                * رقم الجوال معتمد وموثق في السجل الأمني للمتجر، ويتم تعديله حصراً من لوحة إدارة المنصة (المالك) لضمان حماية الملكية.
              </p>
            </div>

            {/* Master Admin PIN */}
            <div className="md:col-span-6 space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>رمز PIN للمدير العام (Master Admin PIN):</span>
              </label>
              <input
                type="text"
                maxLength={6}
                value={adminPinCode}
                onChange={(e) => setAdminPinCode(e.target.value.replace(/\D/g, ''))}
                placeholder="9999"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm font-mono font-bold text-white outline-none transition tracking-widest text-center"
                required
              />
              <p className="text-[10px] text-slate-500">
                الرمز السري الرئيسي لدخول لوحة التاجر وتخطي حدود العمليات في شاشات الكاشير.
              </p>
            </div>

            {/* Max Cashier Invoice Amount */}
            <div className="md:col-span-6 space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-emerald-400" />
                <span>سقف فاتورة الكاشير بالريال (Max Invoice SAR):</span>
              </label>
              <input
                type="number"
                min={1}
                value={maxCashierInvoiceAmount}
                onChange={(e) => setMaxCashierInvoiceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="500"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-400 rounded-2xl px-4 py-3 text-sm font-mono font-bold text-white outline-none transition"
              />
              <p className="text-[10px] text-slate-500">
                الحد الأقصى المسموح لموظفي الكاشير بإدخاله في الفاتورة الواحدة لمنع التلاعب وتجاوز الصلاحيات.
              </p>
            </div>

            {/* Points Per Riyal */}
            <div className="md:col-span-6 space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>معدل احتساب نقاط الولاء (نقاط لكل 1 ريال):</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={pointsPerRiyal}
                onChange={(e) => setPointsPerRiyal(Number(e.target.value))}
                placeholder="1.0"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm font-mono font-bold text-white outline-none transition"
                required
              />
              <p className="text-[10px] text-slate-500">
                مثال: 1.0 يعني أن إنفاق 100 ريال يمنح العميل 100 نقطة ولاء تلقائياً.
              </p>
            </div>

            {/* Welcome Gift Type */}
            <div className="md:col-span-6 space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-rose-400" />
                <span>نوع الهدية الترحيبية للزبون الجديد:</span>
              </label>
              <select
                value={welcomeGiftType}
                onChange={(e) => setWelcomeGiftType(e.target.value as 'POINTS' | 'OFFER' | 'NONE')}
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-400 rounded-2xl px-4 py-3 text-xs font-bold text-white outline-none transition cursor-pointer"
              >
                <option value="POINTS">🎁 نقاط ولاء فورية مضافة للمحفظة</option>
                <option value="OFFER">🏷️ قسيمة / عرض خصم ترحيبي خاص</option>
                <option value="NONE">❌ بدون هدية ترحيبية</option>
              </select>
              <p className="text-[10px] text-slate-500">
                تمنح للزبون تلقائياً بمجرد مسح الباركود لأول مرة والانضمام لمتجرك.
              </p>
            </div>

            {/* Conditional Welcome Gift Fields */}
            {welcomeGiftType === 'POINTS' && (
              <div className="md:col-span-12 space-y-1.5 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 animate-fade-in">
                <label className="text-xs font-bold text-amber-400 block">
                  عدد النقاط الترحيبية المجانية الممنوحة للعميل:
                </label>
                <input
                  type="number"
                  min={0}
                  value={welcomePoints}
                  onChange={(e) => setWelcomePoints(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="مثال: 50"
                  className="w-full max-w-xs bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2 text-xs font-mono font-bold text-white outline-none"
                />
              </div>
            )}

            {welcomeGiftType === 'OFFER' && (
              <div className="md:col-span-12 space-y-1.5 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 animate-fade-in">
                <label className="text-xs font-bold text-rose-400 block">
                  عنوان الهدية أو العرض الترحيبي (مثال: قهوة مجانية / خصم 15%):
                </label>
                <input
                  type="text"
                  value={welcomeOfferTitle}
                  onChange={(e) => setWelcomeOfferTitle(e.target.value)}
                  placeholder="خصم 15% على أول طلب"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-rose-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                />
              </div>
            )}

            {/* Submit button */}
            <div className="md:col-span-12 flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-500">
                يتم تطبيق رمز الـ PIN ومعدل النقاط فوراً على محفظة العملاء وشاشة الكاشير
              </span>

              <button
                type="submit"
                disabled={updatingSettings}
                className="py-3 px-6 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-sm flex items-center space-x-2 rtl:space-x-reverse shadow-md transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{updatingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات الأمان ونقاط الولاء'}</span>
              </button>
            </div>
          </form>

          {settingsSavedMessage && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold animate-fade-in flex items-center space-x-2 rtl:space-x-reverse">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{settingsSavedMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 📡 5. SUB-SECTION: تنبيهات تليجرام وبوابة الرسائل (Integrations) */}
      {/* ======================================================== */}
      {settingsSection === 'integrations' && (
        <div className="space-y-6 animate-fade-in">
          {/* ========================================== */}
          {/* 🤖 Telegram Bot Integration Card */}
          {/* ========================================== */}
          <div className="rounded-3xl p-6 sm:p-8 bg-blue-900/10 border border-blue-500/30 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-blue-500/20">
              <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    تنبيهات بوت تليجرام التفاعلي (مباشر ومجاني)
                  </h3>
                  <p className="text-xs text-slate-400">
                    استقبال إشعارات فورية للطلبات، الحجوزات، واستبدال النقاط مع أزرار تفاعلية لإدارتها مباشرة من تليجرام.
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              {telegramChatId ? (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold self-start sm:self-auto">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>متصل ومفعّل</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold self-start sm:self-auto">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span>غير مربوط حالياً</span>
                </div>
              )}
            </div>

            {/* Quick 1-Click Linking Buttons */}
            <div className="space-y-3">
              <p className="text-sm font-bold text-white">
                اختر طريقة الربط التلقائي بضغطة زر واحدة:
              </p>
              {publicIntegrations?.telegram_enabled && publicIntegrations?.telegram_bot_username ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Button 1: Private chat */}
                    <a 
                      href={`https://t.me/${publicIntegrations.telegram_bot_username}?start=store_${store?.slug || store?.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-900/30 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                          <Send className="w-4 h-4" />
                        </div>
                        <div className="text-right">
                          <div className="font-black text-sm">🔗 ربط بحسابي الخاص</div>
                          <div className="text-[11px] text-blue-100 font-normal">استقبال الطلبات في محادثتك الشخصية</div>
                        </div>
                      </div>
                      <span className="text-xs bg-white/20 px-2.5 py-1 rounded-lg">فتح @{publicIntegrations.telegram_bot_username}</span>
                    </a>

                    {/* Button 2: Group chat */}
                    <a 
                      href={`https://t.me/${publicIntegrations.telegram_bot_username}?startgroup=store_${store?.slug || store?.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-900/30 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="text-right">
                          <div className="font-black text-sm">👥 ربط بقروب عمل (للموظفين)</div>
                          <div className="text-[11px] text-indigo-100 font-normal">إضافة البوت للقروب واستقبال الطلبات جماعياً</div>
                        </div>
                      </div>
                      <span className="text-xs bg-white/20 px-2.5 py-1 rounded-lg">اختيار قروب</span>
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    💡 بمجرد الضغط على Start أو إضافة البوت (@{publicIntegrations.telegram_bot_username}) للقروب، يلتقط النظام المتجر تلقائياً ويتم تفعيل الإشعارات فوراً.
                  </p>
                </>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-bold flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400" />
                  <div>
                    <div>خدمة بوت تليجرام غير مفعّلة حالياً على هذه المنصة.</div>
                    <div className="text-[11px] font-normal text-amber-400/80 mt-0.5">يرجى من إدارة المنصة تفعيل بوت التليجرام الخاص بها من مركز التكاملات ليتمكن التجار من الربط بضغطة زر.</div>
                  </div>
                </div>
              )}
            </div>

            {/* If connected, show active Chat ID & Unlink option */}
            {telegramChatId && (
              <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-500/20 p-4 rounded-2xl">
                <div>
                  <p className="text-xs font-bold text-emerald-300">معرف المحادثة المربوط حالياً:</p>
                  <p className="text-xs font-mono text-emerald-400 mt-0.5">{telegramChatId}</p>
                </div>
                <button
                  type="button"
                  onClick={handleUnlinkTelegram}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold transition"
                >
                  إلغاء الربط ✕
                </button>
              </div>
            )}

            {/* Collapsible Manual Settings (Secondary) */}
            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowManualTelegram(!showManualTelegram)}
                className="text-xs font-bold text-slate-400 hover:text-slate-200 transition flex items-center gap-1.5"
              >
                <span>⚙️ إعدادات الربط اليدوي للـ Chat ID (خيار ثانوي)</span>
                <span className="text-[10px]">{showManualTelegram ? '▲' : '▼'}</span>
              </button>

              {showManualTelegram && (
                <div className="mt-3 flex flex-col space-y-3 p-4 rounded-2xl bg-slate-950 border border-slate-800 animate-fade-in">
                  <label className="text-xs font-bold text-white">إدخال معرف الشات يدوياً (Chat ID):</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="text" 
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="مثال: 123456789 أو -100123456789"
                      className="flex-1 bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSaveTelegram}
                      className="py-2 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition"
                    >
                      تأكيد وحفظ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

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
              <div className="flex items-center gap-2.5 flex-wrap">
                {storeWallet?.meta_access_token && storeWallet?.meta_phone_number_id ? (
                  <div className="px-4 py-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 shadow-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>حساب واتساب ميتا الخاص: متصل (إرسال غير محدود) ✅</span>
                  </div>
                ) : (
                  <div className="px-4 py-2 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-bold flex items-center gap-2 shadow-sm flex-wrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse"></span>
                    <span>رصيد رسائل الواتساب المتاحة:</span>
                    <strong className="font-mono text-white text-sm bg-sky-950/80 px-2.5 py-0.5 rounded-xl border border-sky-500/40">
                      {Math.max(0, (storeWallet?.wa_quota ?? 100) - (storeWallet?.wa_used ?? 0))} / {storeWallet?.wa_quota ?? 100} رسالة
                    </strong>
                    {(storeWallet?.wa_quota ?? 100) <= 100 ? (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                        هدية المنصة الترحيبية (OTP) 🎁
                      </span>
                    ) : (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                        باقة معتمدة مشحونة ✅
                      </span>
                    )}
                  </div>
                )}

                {/* زر شحن باقة 1,000 رسالة واتساب */}
                <a
                  href={`https://wa.me/966577371780?text=${encodeURIComponent(
                    `السلام عليكم، أرغب في شحن باقة 1,000 رسالة واتساب لمتجري (${store.name}) بسعر (${publicIntegrations?.whatsapp_tier_1000_price ?? 150} ر.س). كود المتجر: ${store.id}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 hover:scale-105 active:scale-95 transition"
                >
                  <Coins className="w-4 h-4 text-amber-300" />
                  <span>شحن باقة 1,000 رسالة ({publicIntegrations?.whatsapp_tier_1000_price ?? 150} ر.س) ⚡</span>
                </a>
              </div>
            </div>

            {/* Informative Platform vs Merchant Meta Quota Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-3 shadow-md">
              <div className="flex items-center gap-2 font-black text-white text-sm">
                <span className="text-emerald-400 text-base">⚡</span>
                <span>سياسة رسائل الواتساب وخيارات التشغيل المتاحة لمتجرك:</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يمنحك النظام رصيداً افتتاحياً مجانياً (100 رسالة OTP) كهدية ترحيبية مخصصة حصرياً لبث رموز الدخول وكلمات المرور لعملائك لضمان انطلاق عملك فوراً.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* مسار ميتا المجاني */}
                <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-800/40 space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-300 font-bold text-xs">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span>الخيار 1: ربط حساب ميتا الخاص بك (مجاناً وبدون حدود)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    قم بربط حساب فيسبوك/ميتا الخاص بمتجرك أدناه خلال دقيقة واحدة. تخرج الرسائل برقمك الرسمي الموثق وتكون التكلفة على حسابك في ميتا مباشرة دون أي رسوم للمنصة.
                  </p>
                </div>

                {/* مسار باقة المنصة */}
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                    <Coins className="w-3.5 h-3.5 text-emerald-400" />
                    <span>الخيار 2: شراء باقة 1,000 رسالة عبر سيرفر المنصة</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    اشحن باقة 1,000 رسالة مباشرة بسعر ({publicIntegrations?.whatsapp_tier_1000_price ?? 150} ر.س) لإرسال الفواتير الإلكترونية وحملات الاسترداد دون الحاجة لربط ميتا أو إعدادات تقنية.
                  </p>
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
                  <div
                    onClick={() => setWhatsappProvider('qr')}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${
                      whatsappProvider === 'qr'
                        ? 'bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <Smartphone className="w-5 h-5 text-amber-400" />
                        <h4 className="text-sm font-black text-white">واتساب ويب (سيرفر المنصة)</h4>
                      </div>
                      {whatsappProvider === 'qr' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      إرسال آلي صامت ومجاني عبر ربط رقمك كـ (واتساب ويب) بمسح باركود. مثالي للبدء والتجربة.
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

              {whatsappProvider === 'qr' && (
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 animate-fade-in flex flex-col items-center">
                   <p className="text-sm font-bold text-white mb-2">امسح الباركود لربط رقم المتجر</p>
                   {waQrStatus === 'loading' && <p className="text-amber-400 text-xs animate-pulse">جاري الاتصال بسيرفر الاختبار...</p>}
                   {waQrStatus === 'connected' && <p className="text-emerald-400 font-bold">✅ تم الربط بنجاح! يمكنك الآن تجربة المنصة وتلقي الإشعارات.</p>}
                   {waQrCodeData && (
                      <div className="bg-white p-4 rounded-xl mt-2">
                          {/* Use an external QR generator for the raw data returned by whatsapp-web.js */}
                          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(waQrCodeData)}`} alt="WhatsApp QR Code" />
                      </div>
                   )}
                   <button
                      type="button"
                      onClick={async () => {
                         setWaQrStatus('loading');
                         try {
                            const res = await fetch('https://radar-wa-salah.loca.lt/api/whatsapp/init', {
                               method: 'POST',
                               headers: { 
                                 'Content-Type': 'application/json',
                                 'Bypass-Tunnel-Reminder': 'true'
                               },
                               body: JSON.stringify({ storeId: store.id })
                            });
                            const data = await res.json();
                            if (data.qr_code) {
                               setWaQrCodeData(data.qr_code);
                               setWaQrStatus('ready');
                            } else if (data.message && data.message.includes('ready')) {
                               setWaQrStatus('connected');
                            }
                         } catch (e) {
                            setWaQrStatus('error');
                            console.error(e);
                         }
                      }}
                      className="mt-4 px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs transition shadow-md"
                   >
                      توليد الباركود
                   </button>
                   <p className="text-[10px] text-slate-500 text-center mt-2">
                       (ملاحظة: هذا الخيار يعمل فقط عند تشغيل سيرفر الاختبار المحلي لديك npx localtunnel)
                   </p>
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

      {/* Sub-Section: Modules Management */}
      {settingsSection === 'modules' && (
        <div className="space-y-6 animate-fade-in">
          {renderModulesCard()}
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
                  (p.code && (p.code === (store as any).plan_code || p.code === (store as any).plan_id))
              ) ||
              allPlans.find(
                (p) =>
                  p.name &&
                  (store as any).subscription_plan &&
                  p.name.trim().toLowerCase() === String((store as any).subscription_plan).trim().toLowerCase()
              ) ||
              allPlans.find(
                (p) => p.amount && (store as any).renewal_amount && p.amount === (store as any).renewal_amount
              ) ||
              (allPlans.length > 0 ? allPlans[0] : null)
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
              const planTrialDays = Number(currentPaidPlan?.trial_days) || 0;
              const totalCycleDays = isTrial
                ? 14
                : currentPaidPlan
                ? Math.max(1, (currentPaidPlan.duration_months || (currentPaidPlan.billing_interval === 'YEARLY' ? 12 : 1)) * 30 + planTrialDays)
                : 30;
              const daysLeft = Math.max(0, Math.ceil(subscriptionInfo?.daysLeft ?? (isTrial ? 14 : totalCycleDays)));
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
                              {!isTrial && currentPaidPlan ? `🟢 ${currentPaidPlan.name.startsWith('باقة') || currentPaidPlan.name.startsWith('الباقة') ? currentPaidPlan.name : `باقة ${currentPaidPlan.name}`}` : '🎁 فترة التجربة المجانية (14 يوم)'}
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
                            : '14 يوم من تاريخ إنشاء المتجر'}
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
                      currentPaidPlan !== null &&
                      (plan.id === currentPaidPlan.id || (Boolean(plan.code) && plan.code === currentPaidPlan.code) || plan.name === currentPaidPlan.name);

                    const isLowerTier =
                      !isTrial &&
                      Boolean(store.setup_fee_paid) &&
                      currentPaidPlan !== null &&
                      !isCurrent &&
                      plan.amount < currentPaidPlan.amount;

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

              {/* 🎁 Special Date (اليوم المفضل) - Editable by store admin */}
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span>🎁</span>
                    <span>توثيق اليوم المفضل (خاص بالإدارة)</span>
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    {editCustomerSpecialDate ? `مسجل: ${editCustomerSpecialDate}` : 'غير مسجل'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">تاريخ اليوم والشهر (MM-DD)</label>
                    <input
                      type="text"
                      value={editCustomerSpecialDate}
                      onChange={(e) => setEditCustomerSpecialDate(e.target.value)}
                      placeholder="مثال: 05-18"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none font-mono text-center"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">نوع المناسبة</label>
                    <select
                      value={editCustomerSpecialDateType}
                      onChange={(e) => setEditCustomerSpecialDateType(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none"
                    >
                      <option value="يوم ميلادي">يوم ميلادي 🎂</option>
                      <option value="يوم زواجي">يوم زواجي 💍</option>
                      <option value="يوم الأم">يوم الأم 👩‍👧</option>
                      <option value="يوم التخرج">يوم التخرج 🎓</option>
                      <option value="أفضل يوم بحياتي">أفضل يوم بحياتي ✨</option>
                      <option value="مناسبة خاصة">مناسبة خاصة 🌸</option>
                    </select>
                  </div>
                </div>
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

      {/* 🔔 Modal: Direct In-App Customer Notification */}
      {isCustomerNotificationOpen && selectedCustomerForNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-lg w-full rounded-3xl p-6 sm:p-7 bg-slate-900 border border-slate-800 relative shadow-2xl space-y-5 text-right">
            <button
              onClick={() => setIsCustomerNotificationOpen(false)}
              className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">إرسال إشعار فوري داخل التطبيق</h3>
                <p className="text-xs text-slate-400">يصل مباشرة لمحفظة العميل كإشعار منبثق وتنبيه صوتي</p>
              </div>
            </div>

            {/* Customer Snapshot Box */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-200 font-bold flex items-center justify-center text-xs">
                  {selectedCustomerForNotification.name ? selectedCustomerForNotification.name.charAt(0) : 'ع'}
                </div>
                <div>
                  <strong className="text-white block">{selectedCustomerForNotification.name || 'عميل'}</strong>
                  <span className="text-[11px] font-mono text-slate-400" dir="ltr">{selectedCustomerForNotification.phone}</span>
                </div>
              </div>

              {selectedCustomerForNotification.special_date ? (
                <div className="text-left">
                  <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/30 font-bold">
                    <span>🎉</span>
                    <span>{selectedCustomerForNotification.special_date_type || 'مناسبة خاصة'}: {selectedCustomerForNotification.special_date}</span>
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium">الرصيد: {selectedCustomerForNotification.wallet_balance} نقطة</span>
              )}
            </div>

            {/* Quick Templates */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 block">نماذج رسائل سريعة:</label>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setCustomerNotifTitle(`تهنئة بمناسبة ${selectedCustomerForNotification.special_date_type || 'يومك المميز'} 🎉`);
                    setCustomerNotifBody(`أهلاً بك يا ${selectedCustomerForNotification.name || 'عميلنا العزيز'}! 🌸 يسعدنا في ${store.name} مشاركتك فرحتك بيومك المفضل، تنتظرك مفاجأة وضيافة خاصة في زيارتك القادمة ✨`);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-pink-300 border border-pink-500/20 transition flex items-center gap-1"
                >
                  <span>🎂</span>
                  <span>تهنئة باليوم المفضل</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCustomerNotifTitle(`هدية ونقاط ولاء في محفظتك 🎁`);
                    setCustomerNotifBody(`أهلاً بك يا ${selectedCustomerForNotification.name || 'عميلنا العزيز'}! يسعدنا إهداؤك نقاط ولاء إضافية في محفظتك، استمتع بزيارتك القادمة لـ ${store.name}!`);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-amber-300 border border-amber-500/20 transition flex items-center gap-1"
                >
                  <span>🎁</span>
                  <span>هدية نقاط ولاء</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCustomerNotifTitle(`عرض حصري وضيافة خاصة 🌟`);
                    setCustomerNotifBody(`نحن بانتظارك في ${store.name}! يتوفر لك عرض خاص وامتيازات حصرية جاهزة للاستبدال.`);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-emerald-300 border border-emerald-500/20 transition flex items-center gap-1"
                >
                  <span>🌟</span>
                  <span>عرض حصري</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSendCustomerNotification} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">عنوان الإشعار</label>
                <input
                  type="text"
                  value={customerNotifTitle}
                  onChange={(e) => setCustomerNotifTitle(e.target.value)}
                  placeholder="مثال: هدية خاصة في محفظتك 🎁"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">نص الإشعار</label>
                <textarea
                  value={customerNotifBody}
                  onChange={(e) => setCustomerNotifBody(e.target.value)}
                  placeholder="اكتب تفاصيل التهنئة أو العرض..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none transition resize-none leading-relaxed"
                  required
                />
              </div>

              {/* Sound Effect Selector */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 font-bold">النغمة الصوتية:</span>
                  <select
                    value={customerNotifSound}
                    onChange={(e: any) => setCustomerNotifSound(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value="notification">تنبيه رسمي 🔔</option>
                    <option value="success">احتفال وإنجاز 🎉</option>
                    <option value="redeem">مكافأة واستبدال 🎁</option>
                    <option value="commission">رنين عملات 🪙</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => playBeepSound(customerNotifSound)}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-bold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 transition"
                >
                  🔊 تجربة الصوت
                </button>
              </div>

              <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  type="submit"
                  disabled={isSendingCustomerNotif || !customerNotifTitle.trim() || !customerNotifBody.trim()}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSendingCustomerNotif ? 'جاري الإرسال...' : 'إرسال الإشعار للمحفظة الآن 🔔'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomerNotificationOpen(false)}
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

      {/* 🧠 Modal: AI Menu Auto-Builder (سحب المنيو بالذكاء الاصطناعي) */}
      <MenuAutoBuilderModal
        isOpen={isAiMenuBuilderOpen}
        onClose={() => setIsAiMenuBuilderOpen(false)}
        storeId={store.id}
        existingCategories={globalCategories.map((c) => c.name)}
        onItemsSaved={(newItems) => {
          setCatalogItems((prev) => [...newItems, ...prev]);
          LoyaltyEvents.emit({ type: 'CATALOG_UPDATED', storeId: store.id });
          LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: store.id });
          setCatalogActionSuccess(`تم بنجاح إضافة ${newItems.length} صنف بالذكاء الاصطناعي إلى المنيو! 🎉`);
          setTimeout(() => setCatalogActionSuccess(null), 4000);
        }}
      />

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

              {/* 🏢 Branch Selection for Specialist */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 block">فرع العمل المخصص للمختص:</label>
                <select
                  value={specBranchIdInput}
                  onChange={(e) => setSpecBranchIdInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                >
                  <option value="">📍 جميع الفروع (متاح بكل الفروع)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.city ? `(${b.city})` : ''} {b.is_main ? '⭐' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">
                  عند تخصيص فرع، سيظهر هذا المختص فقط للعملاء عند اختيارهم هذا الفرع حصراً لمنع خلط المواعيد.
                </p>
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

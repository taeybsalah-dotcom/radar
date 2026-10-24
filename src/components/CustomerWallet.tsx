import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Store,
  Customer,
  Tier,
  Privilege,
  DynamicQRToken,
  CustomerCoupon,
  StoreBanner,
  CatalogItem,
  CatalogModifierGroup,
  CatalogModifierOption,
  CartItem,
  WhatsAppOrderPayload,
  StoreSpecialist,
  ServiceBooking,
  StoreWallet,
  StoreBranch,
  CustomerSavedAddress,
  getStoreActiveModules,
} from '../types';
import { LoyaltyService, normalizePhone, getSupabaseClient } from '../lib/supabase';
import { getActiveTenantConfig } from '../config/tenant';
import { LoyaltyEvents } from '../lib/events';
import { playBeepSound } from '../lib/sound';
import { calculateDeliveryFee, extractCoordsFromMapUrl, estimateDeliveryTime } from '../lib/deliveryPricing';
import { DriverService } from '../lib/driverService';
import { CustomerLoginGate } from './CustomerLoginGate';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { checkBranchOpenStatus } from '../lib/branchUtils';
import { saveActiveStoreBranding } from '../lib/storeBranding';
import { SandboxPaymentModal } from './SandboxPaymentModal';
import { WalletPassModal } from './WalletPassModal';
import { WalletPassService } from '../lib/walletPassService';
import {
  Building2,
  Sparkles,
  QrCode,
  Flame,
  Award,
  ShieldCheck,
  CheckCircle2,
  CreditCard,
  X,
  RefreshCw,
  Smartphone,
  User,
  Edit3,
  Check,
  AlertCircle,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Crown,
  Gift,
  Ticket,
  Clock,
  ShoppingBag,
  ShoppingCart,
  UserCheck,
  Maximize2,
  Coins,
  Shield,
  Copy,
  Utensils,
  Calendar,
  MapPin,
  Car,
  Plus,
  Minus,
  Trash2,
  Send,
  MessageCircle,
  Phone,
  MessageSquare,
  Search,
  Filter,
  RotateCcw,
  History,
  Scissors,
  BookmarkCheck,
  Home,
  Briefcase,
  Trees,
  Camera,
  Image,
  Navigation,
  Compass,
  ExternalLink,
} from 'lucide-react';
import { compressImage } from '../lib/imageCompressor';
import { NotificationBell } from './NotificationBell';
import { saveInboxNotification, clearAllInboxNotifications } from '../lib/notifications';

interface CustomerWalletProps {
  store: Store;
}

export const CustomerWallet: React.FC<CustomerWalletProps> = ({ store: initialStore }) => {
  const [store, setStore] = useState<Store>(initialStore);

  useEffect(() => {
    if (initialStore) {
      setStore(initialStore);
      saveActiveStoreBranding(initialStore);
    }
  }, [initialStore]);

  const activeModules = useMemo(() => getStoreActiveModules(store), [store]);

  // 🎨 Luxury Brand Color Engine & Fallback Harmonizer
  const brandColors = useMemo(() => {
    const rawPrimary = (store?.primary_color || '').trim();
    const rawSecondary = (store?.secondary_color || '').trim();

    // Default ultra-luxury palette
    const defaultPrimary = '#07070B';
    const defaultSecondary = '#D4AF37';

    // Helper: validate hex format
    const isValidColor = (c: string) => /^#([0-9A-F]{3}){1,2}$/i.test(c);

    const safePrimary = isValidColor(rawPrimary) ? rawPrimary : defaultPrimary;
    const safeSecondary = isValidColor(rawSecondary) ? rawSecondary : defaultSecondary;

    // Convert hex to rgb
    const hexToRgb = (hex: string) => {
      let clean = hex.replace('#', '').trim();
      if (clean.length === 3) {
        clean = clean.split('').map((c) => c + c).join('');
      }
      if (clean.length !== 6) return { r: 212, g: 175, b: 55 }; // fallback gold
      const num = parseInt(clean, 16);
      if (isNaN(num)) return { r: 212, g: 175, b: 55 };
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
      };
    };

    const rgbToHex = (r: number, g: number, b: number) => {
      const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
      return '#' + [clamp(r), clamp(g), clamp(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
    };

    const rgbToHsl = (r: number, g: number, b: number) => {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    };

    const hslToRgb = (h: number, s: number, l: number) => {
      h = (h % 360) / 360;
      s = Math.max(0, Math.min(100, s)) / 100;
      l = Math.max(0, Math.min(100, l)) / 100;

      if (s === 0) {
        const val = Math.round(l * 255);
        return { r: val, g: val, b: val };
      }

      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
      const g = Math.round(hue2rgb(p, q, h) * 255);
      const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
      return { r, g, b };
    };

    // Calculate harmonious palette
    const secRgb = hexToRgb(safeSecondary);
    const secHsl = rgbToHsl(secRgb.r, secRgb.g, secRgb.b);

    const priRgb = hexToRgb(safePrimary);
    const priHsl = rgbToHsl(priRgb.r, priRgb.g, priRgb.b);

    // Helper to generate lighter/darker shades of an HSL color
    const shiftLightness = (hsl: { h: number; s: number; l: number }, deltaPercent: number) => {
      const newL = Math.max(0, Math.min(100, hsl.l + deltaPercent));
      const rgb = hslToRgb(hsl.h, hsl.s, newL);
      return rgbToHex(rgb.r, rgb.g, rgb.b);
    };

    // Calculate primary & secondary luminance for contrast
    const priContrast = (0.299 * priRgb.r + 0.587 * priRgb.g + 0.114 * priRgb.b) / 255;
    const isPrimaryLight = priContrast > 0.60;
    const contrastOnPrimary = isPrimaryLight ? '#0F172A' : '#FFFFFF';

    const secContrast = (0.299 * secRgb.r + 0.587 * secRgb.g + 0.114 * secRgb.b) / 255;
    const contrastOnSecondary = secContrast > 0.55 ? '#000000' : '#FFFFFF';

    // 1. VIP Card Monochromatic Luxury Gradient (Pure to brand primary, never mixing clashing colors)
    let cardGradient = '';
    let cardTextColor = '';
    let cardSubtextColor = '';
    let cardBorderColor = '';
    let cardBoxShadow = '';

    if (isPrimaryLight) {
      // Light / Platinum / Cream / Clean Light VIP Card
      const cLight = shiftLightness(priHsl, 10);
      const cDeep = shiftLightness(priHsl, -8);
      cardGradient = `linear-gradient(135deg, ${cLight} 0%, ${safePrimary} 50%, ${cDeep} 100%)`;
      cardTextColor = '#0F172A';
      cardSubtextColor = '#475569';
      cardBorderColor = 'rgba(0, 0, 0, 0.09)';
      cardBoxShadow = '0 18px 40px -10px rgba(0, 0, 0, 0.14), inset 0 1px 1px rgba(255, 255, 255, 0.9)';
    } else {
      // Dark / Charcoal / Obsidian Luxury VIP Card
      const cLighter = shiftLightness(priHsl, 12);
      const cDarker = shiftLightness(priHsl, -10);
      cardGradient = `linear-gradient(135deg, ${cLighter} 0%, ${safePrimary} 60%, ${cDarker} 100%)`;
      cardTextColor = '#FFFFFF';
      cardSubtextColor = '#94A3B8';
      cardBorderColor = 'rgba(255, 255, 255, 0.14)';
      cardBoxShadow = '0 20px 45px -10px rgba(0, 0, 0, 0.65), inset 0 1px 1px rgba(255, 255, 255, 0.2)';
    }

    // 2. Floating FAB Gradient (Pure, radiant brand secondary gradient)
    const fabTop = shiftLightness(secHsl, 10);
    const fabBottom = shiftLightness(secHsl, -10);
    const fabGradient = `linear-gradient(135deg, ${fabTop} 0%, ${safeSecondary} 50%, ${fabBottom} 100%)`;

    // 3. Safe accent text for light surfaces (Ensure WCAG AAA 7:1+ contrast on white & cream)
    let textLightL = secHsl.l;
    const isYellowOrGold = secHsl.h >= 24 && secHsl.h <= 65;
    if (isYellowOrGold) {
      if (textLightL > 22) textLightL = 20; // Deep royal burnt bronze/amber (#78350F / #713F12)
    } else {
      if (textLightL > 32) textLightL = 26;
    }
    const textOnLightRgb = hslToRgb(secHsl.h, Math.min(100, Math.max(secHsl.s, 85)), textLightL);
    const textOnLightHex = rgbToHex(textOnLightRgb.r, textOnLightRgb.g, textOnLightRgb.b);

    // 4. Smart fill for active circles, stepper tracks & badges on light surfaces when secondary is pale cream/white
    const isSecondaryVeryLight = secContrast > 0.72;
    const solidFillOnLight = isSecondaryVeryLight
      ? (!isPrimaryLight ? safePrimary : textOnLightHex)
      : safeSecondary;
    const solidFillOnLightContrast = isSecondaryVeryLight ? '#FFFFFF' : contrastOnSecondary;

    return {
      primary: safePrimary,
      secondary: safeSecondary,
      isPrimaryLight,
      isSecondaryVeryLight,
      contrastOnPrimary,
      contrastOnSecondary,
      textOnLightHex,
      solidFillOnLight,
      solidFillOnLightContrast,
      cardGradient,
      cardTextColor,
      cardSubtextColor,
      cardBorderColor,
      cardBoxShadow,
      progressGradient: `linear-gradient(90deg, ${shiftLightness(secHsl, -5)} 0%, ${safeSecondary} 50%, ${shiftLightness(secHsl, 12)} 100%)`,
      progressBarColor: safeSecondary,
      progressGlow: `${safeSecondary}60`,
      qrButtonBg: isPrimaryLight ? '#0F172A' : safeSecondary,
      qrButtonText: isPrimaryLight ? '#FFFFFF' : contrastOnSecondary,
      qrButtonBorder: isPrimaryLight ? '#1E293B' : `${safeSecondary}50`,
      qrButtonGlow: `${safeSecondary}40`,
      howButtonBg: isPrimaryLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.10)',
      howButtonBorder: isPrimaryLight ? 'rgba(0, 0, 0, 0.10)' : 'rgba(255, 255, 255, 0.18)',
      howButtonText: isPrimaryLight ? '#0F172A' : '#FFFFFF',
      fabGradient,
      glow: `${safeSecondary}60`,
      buttonBg: safeSecondary,
    };
  }, [store?.primary_color, store?.secondary_color]);

  const brandPrimary = brandColors.primary;
  const brandSecondary = brandColors.secondary;
  const isDarkTheme = store?.theme_mode === 'dark';
  const isWarmTheme = store?.theme_mode === 'warm_cream';
  const isLightOrWarm = !isDarkTheme;
  const safeAccentText = isDarkTheme ? brandSecondary : brandColors.textOnLightHex;
  const safeAccentFill = isDarkTheme ? brandSecondary : brandColors.solidFillOnLight;
  const safeAccentFillContrast = isDarkTheme ? brandColors.contrastOnSecondary : brandColors.solidFillOnLightContrast;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [privileges, setPrivileges] = useState<Privilege[]>([]);
  const [customerCoupons, setCustomerCoupons] = useState<CustomerCoupon[]>([]);
  const [ticketsFilter, setTicketsFilter] = useState<'active' | 'used'>('active');
  const [selectedCouponForQR, setSelectedCouponForQR] = useState<CustomerCoupon | null>(null);
  const [selectedRewardPass, setSelectedRewardPass] = useState<Privilege | null>(null);
  const [loading, setLoading] = useState(true);

  const [savedProfile, setSavedProfile] = useState<{ name: string; phone: string } | null>(() => {
    try {
      return LoyaltyService.getCustomerProfile(initialStore?.id, initialStore?.slug);
    } catch {
      return null;
    }
  });

  const [guestName, setGuestName] = useState(() => savedProfile?.name || '');
  const [guestPhone, setGuestPhone] = useState(() => savedProfile?.phone || '');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isEditingGuestDetails, setIsEditingGuestDetails] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  type PendingAuthAction =
    | { type: 'SHOW_QR' }
    | { type: 'SUBMIT_ORDER' }
    | { type: 'SUBMIT_BOOKING' }
    | { type: 'REDEEM_PRIVILEGE'; privilege: Privilege };

  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction | null>(null);

  const [activeTab, setActiveTab] = useState<'pass' | 'menu' | 'services' | 'perks' | 'tickets' | 'tiers'>(() => {
    const mods = getStoreActiveModules(initialStore);
    if (mods.loyalty) return 'pass';
    if (mods.orders) return 'menu';
    if (mods.bookings) return 'services';
    return 'tickets';
  });

  // 🎛️ Dynamic Redirection if an active module is disabled by Merchant or Owner
  useEffect(() => {
    if ((activeTab === 'pass' || activeTab === 'perks' || activeTab === 'tiers') && !activeModules.loyalty) {
      if (activeModules.orders) setActiveTab('menu');
      else if (activeModules.bookings) setActiveTab('services');
      else setActiveTab('tickets');
    } else if (activeTab === 'menu' && !activeModules.orders) {
      if (activeModules.loyalty) setActiveTab('pass');
      else if (activeModules.bookings) setActiveTab('services');
      else setActiveTab('tickets');
    } else if (activeTab === 'services' && !activeModules.bookings) {
      if (activeModules.loyalty) setActiveTab('pass');
      else if (activeModules.orders) setActiveTab('menu');
      else setActiveTab('tickets');
    }
  }, [activeModules.loyalty, activeModules.orders, activeModules.bookings, activeTab]);
  const [specialDateMonth, setSpecialDateMonth] = useState('1');
  const [specialDateDay, setSpecialDateDay] = useState('1');
  const [specialDateType, setSpecialDateType] = useState('يوم ميلادي');
  const [specialDateTypeOther, setSpecialDateTypeOther] = useState('');
  const [isSubmittingSpecialDate, setIsSubmittingSpecialDate] = useState(false);
  const [showSpecialDateForm, setShowSpecialDateForm] = useState(true);

  const handleSaveSpecialDate = async () => {
    if (!customer) return;
    setIsSubmittingSpecialDate(true);
    try {
      const finalType = specialDateType === 'أخرى' ? specialDateTypeOther.trim() : specialDateType;
      if (!finalType) throw new Error('يرجى تحديد نوع المناسبة');
      const dateStr = `${specialDateMonth.padStart(2, '0')}-${specialDateDay.padStart(2, '0')}`;

      // 🛡️ Immediately persist in localStorage cache so it can never reappear upon reload
      if (store?.id && customer.phone) {
        const payload = JSON.stringify({ date: dateStr, type: finalType });
        const normP = normalizePhone(customer.phone);
        localStorage.setItem(`radar_cust_special_date_${store.id}_${normP}`, payload);
        localStorage.setItem(`radar_cust_special_date_${store.id}_${customer.phone}`, payload);
        if (store.slug) {
          localStorage.setItem(`radar_cust_special_date_${store.slug}_${normP}`, payload);
          localStorage.setItem(`radar_cust_special_date_${store.slug}_${customer.phone}`, payload);
        }
      }

      const updated = await LoyaltyService.updateCustomerSpecialDate(customer.id, dateStr, finalType);
      const fullyUpdated: Customer = {
        ...customer,
        ...updated,
        special_date: dateStr,
        special_date_type: finalType,
      };
      setCustomer(fullyUpdated);
      setShowSpecialDateForm(false);
      alert('تم حفظ وتوثيق يومك المميز بنجاح! شكراً لك 🎉');
    } catch (e: any) {
      alert(e.message || 'حدث خطأ أثناء الحفظ');
    }
    setIsSubmittingSpecialDate(false);
  };

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [pastOrders, setPastOrders] = useState<WhatsAppOrderPayload[]>([]);
  const [showPastOrdersModal, setShowPastOrdersModal] = useState(false);

  const [branches, setBranches] = useState<StoreBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<StoreBranch | null>(null);
  const branchStatus = checkBranchOpenStatus(selectedBranch);

  // 📱 Apple & Google Wallet Pass and Proximity Distance Radar State
  const [isWalletPassModalOpen, setIsWalletPassModalOpen] = useState(false);
  const [walletPassPlatform, setWalletPassPlatform] = useState<'apple' | 'google'>('apple');
  const [proximityInfo, setProximityInfo] = useState<any>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const status = WalletPassService.getProximityStatus(
            { lat: pos.coords.latitude, lng: pos.coords.longitude },
            store,
            customer?.wallet_balance || 0,
            branches
          );
          setProximityInfo(status);
        },
        () => {
          const status = WalletPassService.getProximityStatus(
            null,
            store,
            customer?.wallet_balance || 0,
            branches
          );
          setProximityInfo(status);
        },
        { timeout: 4000 }
      );
    } else {
      const status = WalletPassService.getProximityStatus(
        null,
        store,
        customer?.wallet_balance || 0,
        branches
      );
      setProximityInfo(status);
    }
  }, [store, customer?.wallet_balance, branches]);


  const [specialists, setSpecialists] = useState<StoreSpecialist[]>([]);
  const [storeBookings, setStoreBookings] = useState<ServiceBooking[]>([]);
  const customerServiceBookings = storeBookings.filter(
    (b) => b.customer_phone === customer?.phone || normalizePhone(b.customer_phone) === normalizePhone(customer?.phone || '')
  );
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedBookingService, setSelectedBookingService] = useState<CatalogItem | null>(null);
  const [selectedServiceModifiers, setSelectedServiceModifiers] = useState<Record<string, CatalogModifierOption[]>>({});
  const [selectedBookingSpecialist, setSelectedBookingSpecialist] = useState<StoreSpecialist | null>(null);
  const [selectedBookingDate, setSelectedBookingDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [selectedBookingTime, setSelectedBookingTime] = useState<string>('16:00');
  const [bookingNotes, setBookingNotes] = useState<string>('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingSuccessData, setBookingSuccessData] = useState<ServiceBooking | null>(null);
  const [pastModalTab, setPastModalTab] = useState<'orders' | 'bookings'>('orders');

  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [itemToCustomize, setItemToCustomize] = useState<CatalogItem | null>(null);
  const [customizingQuantity, setCustomizingQuantity] = useState(1);
  const [selectedModifierOptions, setSelectedModifierOptions] = useState<Record<string, CatalogModifierOption[]>>({});
  const [customizingNotes, setCustomizingNotes] = useState('');

  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<'dine_in' | 'takeaway' | 'delivery' | 'service_booking'>('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [tableQrBanner, setTableQrBanner] = useState<{ tableNumber: string; branchId?: string } | null>(null);

  // 🍽️ Direct Table QR Detection from URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      let detectedTable = searchParams.get('table') || searchParams.get('table_number');
      let detectedBranch = searchParams.get('branch') || searchParams.get('branch_id');

      if (!detectedTable && window.location.hash.includes('?')) {
        const hashQuery = window.location.hash.split('?')[1];
        if (hashQuery) {
          const hashParams = new URLSearchParams(hashQuery);
          detectedTable = hashParams.get('table') || hashParams.get('table_number');
          if (!detectedBranch) detectedBranch = hashParams.get('branch') || hashParams.get('branch_id');
        }
      }

      if (detectedTable) {
        const cleanTable = detectedTable.trim();
        setTableNumber(cleanTable);
        setFulfillmentType('dine_in');
        setTableQrBanner({
          tableNumber: cleanTable,
          branchId: detectedBranch || undefined,
        });
      }
    } catch (e) {
      console.warn('Error reading table QR params:', e);
    }
  }, []);

  const [partySize, setPartySize] = useState(1);
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [arrivalTime, setArrivalTime] = useState('18:00');
  const [carPlate, setCarPlate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryGpsLink, setDeliveryGpsLink] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [saveThisAddress, setSaveThisAddress] = useState(false);
  const [saveAddressLabel, setSaveAddressLabel] = useState<string>('البيت');
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [copiedGpsToast, setCopiedGpsToast] = useState(false);
  const [deliveryLocationPhoto, setDeliveryLocationPhoto] = useState<string>('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoSavingsPercent, setPhotoSavingsPercent] = useState<number | null>(null);

  // 🏠 دفتر العناوين المحفوظة للعميل (بدون عناوين ديمو وهمية، ومفلترة من أي بيانات قديمة)
  const savedAddressesStorageKey = `radar_saved_addresses_${customer?.phone || store?.id || 'guest'}`;
  const [savedAddresses, setSavedAddresses] = useState<CustomerSavedAddress[]>(() => {
    try {
      const raw = localStorage.getItem(`radar_saved_addresses_${customer?.phone || store?.id || 'guest'}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // استبعاد أي عناوين تجريبية سابقة (addr_home, addr_work أو عناوين الملقا التجريبية)
          return parsed.filter((a: any) => a.id !== 'addr_home' && a.id !== 'addr_work');
        }
      }
    } catch {}
    return [];
  });

  // مزامنة واسترجاع عناوين العميل المحفوظة من قاعدة البيانات عبر سجل الطلبات السابقة
  useEffect(() => {
    if (!pastOrders || pastOrders.length === 0) return;
    const extracted: CustomerSavedAddress[] = [];
    const seen = new Set<string>();

    pastOrders.forEach((order: any, idx: number) => {
      const fd = order.fulfillment_details;
      const fType = order.order_type || order.fulfillment_type;
      if (fType === 'delivery' && fd?.delivery_address?.trim()) {
        const label = fd?.delivery_address_label?.trim() || 'البيت';
        const key = `${label}_${fd.delivery_address.trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          const coords = fd.delivery_gps_link ? extractCoordsFromMapUrl(fd.delivery_gps_link) : undefined;
          extracted.push({
            id: `past_addr_${label}_${idx}`,
            label,
            icon: label === 'البيت' ? 'home' : label === 'العمل' ? 'building' : 'map-pin',
            district: fd.delivery_address.split('-')[0]?.trim() || fd.delivery_address.trim(),
            street: fd.delivery_address.split('-')[1]?.trim() || '',
            building_no: fd.delivery_address.split('-')[2]?.trim() || '',
            map_url: fd.delivery_gps_link?.trim() || undefined,
            lat: fd.delivery_lat ?? coords?.lat,
            lng: fd.delivery_lng ?? coords?.lng,
            photo_url: fd.delivery_location_photo || undefined,
            created_at: order.created_at || new Date().toISOString(),
          });
        }
      }
    });

    if (extracted.length > 0) {
      setSavedAddresses((prev) => {
        const existingKeys = new Set(prev.map((a) => `${a.label}_${[a.district, a.street, a.building_no].filter(Boolean).join(' - ')}`));
        const toAdd = extracted.filter((e) => !existingKeys.has(`${e.label}_${[e.district, e.street, e.building_no].filter(Boolean).join(' - ')}`));
        if (toAdd.length === 0) return prev;
        const merged = [...prev, ...toAdd];
        try {
          localStorage.setItem(savedAddressesStorageKey, JSON.stringify(merged));
        } catch {}
        return merged;
      });
    }
  }, [pastOrders, savedAddressesStorageKey]);

  // الفرع الفعال وموقعه الجغرافي
  const effectiveBranch = useMemo(() => {
    const b = selectedBranch || (branches && branches.length > 0 ? branches[0] : null);
    if (!b) return null;
    return {
      ...b,
      lat: b.lat ?? 24.7136,
      lng: b.lng ?? 46.6753,
      delivery_radius_km: b.delivery_radius_km ?? 15,
    };
  }, [selectedBranch, branches]);

  // فحص توفر السائقين في الفرع المختار ومزامنتهم مع السيرفر
  const [driversRefreshTrigger, setDriversRefreshTrigger] = useState(0);

  useEffect(() => {
    if (store?.id) {
      DriverService.syncWithSupabase(store.id).then(() => {
        setDriversRefreshTrigger((v) => v + 1);
      });
    }

    const unsub = LoyaltyEvents.listen((event) => {
      if (event.type === 'DRIVERS_UPDATED' || event.type === 'ORDER_STATUS_UPDATED') {
        setDriversRefreshTrigger((v) => v + 1);
      }
    });
    return () => unsub();
  }, [store?.id]);

  const availableDriversCount = useMemo(() => {
    if (!store?.id) return 1;
    const branchId = selectedBranch?.id || null;
    const list = DriverService.getAvailableBranchDrivers(store.id, branchId);
    return list.length;
  }, [store?.id, selectedBranch?.id, driversRefreshTrigger]);

  // حساب المسافة ورسوم التوصيل وفحص النطاق تلقائياً
  const calculatedDelivery = useMemo(() => {
    if (fulfillmentType !== 'delivery') return null;
    const coords = extractCoordsFromMapUrl(deliveryGpsLink);
    return calculateDeliveryFee(
      effectiveBranch,
      coords?.lat,
      coords?.lng,
      store.fulfillment_settings?.delivery_fee || 0
    );
  }, [fulfillmentType, effectiveBranch, deliveryGpsLink, store.fulfillment_settings?.delivery_fee]);

  const handleGetGpsLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert('تحديد الموقع عبر GPS غير مدعوم في هذا المتصفح.');
      return;
    }
    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        const url = `https://maps.google.com/?q=${lat},${lng}`;
        setDeliveryGpsLink(url);
        if (!deliveryAddress) {
          setDeliveryAddress(`موقعي الحالي عبر GPS (${lat}, ${lng})`);
        }
        playBeepSound('success');
      },
      (err) => {
        setIsLocatingGps(false);
        console.warn('Geolocation error:', err);
        alert('تعذر تحديد موقعك بدقة. يرجى التأكد من تفعيل إذن الموقع في المتصفح أو إدخال الرابط يدوياً.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSelectSavedAddress = (addr: CustomerSavedAddress) => {
    setSelectedAddressId(addr.id);
    const fullText = [addr.district, addr.street, addr.building_no, addr.notes].filter(Boolean).join(' - ');
    setDeliveryAddress(fullText);
    if (addr.label) setSaveAddressLabel(addr.label);
    if (addr.photo_url) {
      setDeliveryLocationPhoto(addr.photo_url);
    }
    if (addr.map_url) {
      setDeliveryGpsLink(addr.map_url);
    } else if (addr.lat && addr.lng) {
      setDeliveryGpsLink(`https://maps.google.com/?q=${addr.lat},${addr.lng}`);
    }
    playBeepSound('notification');
  };

  const handleDeleteSavedAddress = (addrId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedAddresses((prev) => {
      const updated = prev.filter((a) => a.id !== addrId);
      try {
        localStorage.setItem(savedAddressesStorageKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    if (selectedAddressId === addrId) {
      setSelectedAddressId(null);
    }
  };

  const handleLocationPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    setPhotoSavingsPercent(null);
    try {
      // ضغط الصورة تلقائياً بأبعاد وجودة محسوبة (WebP/JPEG) لتوفير الباندويث والمساحة
      const result = await compressImage(file, 800, 800, 0.75, 'image/jpeg', 'delivery-locations');
      setDeliveryLocationPhoto(result.dataUrl);
      setPhotoSavingsPercent(result.reductionPercentage || result.savingsPercent || 0);
      playBeepSound('success');
    } catch (err: any) {
      console.error('Failed to upload/compress location photo:', err);
      alert('تعذر رفع صورة الموقع، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleCopyGpsLink = () => {
    if (!deliveryGpsLink) return;
    navigator.clipboard.writeText(deliveryGpsLink);
    setCopiedGpsToast(true);
    setTimeout(() => setCopiedGpsToast(false), 2500);
    playBeepSound('success');
  };

  const [specialistName, setSpecialistName] = useState('');
  const [generalOrderNotes, setGeneralOrderNotes] = useState('');
  const [orderSuccessPayload, setOrderSuccessPayload] = useState<WhatsAppOrderPayload | null>(null);

  // 💳 سياسات الدفع الإلكتروني والتحصيل في التطبيق
  const [orderPaymentMethod, setOrderPaymentMethod] = useState<'online' | 'pay_at_store'>('online');
  const [bookingPaymentMethod, setBookingPaymentMethod] = useState<'online' | 'pay_at_store'>('online');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentModalConfig, setPaymentModalConfig] = useState<{
    type: 'order' | 'booking';
    title: string;
    itemDescription: string;
    amount: number;
    onSuccess: (details: any) => Promise<void>;
  } | null>(null);

  const onlinePaymentEnabled = store.fulfillment_settings?.online_payment_enabled !== false;
  const effectiveOrdersPolicy = onlinePaymentEnabled
    ? (store.fulfillment_settings?.orders_payment_policy || 'both')
    : 'pay_at_store_only';
  const effectiveBookingsPolicy = onlinePaymentEnabled
    ? (store.fulfillment_settings?.bookings_payment_policy || 'both')
    : 'pay_at_store_only';

  const [celebrationModal, setCelebrationModal] = useState<{
    isOpen: boolean;
    type: 'COUPON_REDEEMED' | 'POINTS_EARNED' | 'REJECTED';
    title: string;
    subtitle: string;
    points?: number;
    newBalance?: number;
  } | null>(null);

  const lastPointsRef = useRef<number | null>(null);
  const selectedCouponRef = useRef<CustomerCoupon | null>(null);
  selectedCouponRef.current = selectedCouponForQR;
  const storeRef = useRef<Store>(store);
  storeRef.current = store;
  const customerRef = useRef<Customer | null>(customer);
  customerRef.current = customer;
  const pastOrdersRef = useRef<WhatsAppOrderPayload[]>(pastOrders);
  pastOrdersRef.current = pastOrders;
  const storeBookingsRef = useRef<ServiceBooking[]>(storeBookings);
  storeBookingsRef.current = storeBookings;
  const orderSuccessPayloadRef = useRef<WhatsAppOrderPayload | null>(orderSuccessPayload);
  orderSuccessPayloadRef.current = orderSuccessPayload;
  const bookingSuccessDataRef = useRef<ServiceBooking | null>(bookingSuccessData);
  bookingSuccessDataRef.current = bookingSuccessData;

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const [isFullscreenQR, setIsFullscreenQR] = useState(false);
  const [showEmbeddedQR, setShowEmbeddedQR] = useState(false);
  const [showHowToEarnPoints, setShowHowToEarnPoints] = useState(false);

  const [purchasingPrivilege, setPurchasingPrivilege] = useState<Privilege | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseSuccessAlert, setPurchaseSuccessAlert] = useState<{
    title: string;
    cost: number;
    code: string;
  } | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const [currentQRToken, setCurrentQRToken] = useState<DynamicQRToken | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);

  const defaultStoreSlide: StoreBanner = {
    id: `brand-slide-${store?.id || 'default'}`,
    image_url:
      store?.logo_url ||
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&auto=format&fit=crop&q=80',
    title: store?.name || getActiveTenantConfig().brandName,
    quote: undefined,
    badge_text: undefined,
  };

  const showcaseSlides: StoreBanner[] = (() => {
    const raw = store?.slider_images;
    let list: any[] = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
    }
    const valid = list.filter((s) => s && typeof s === 'object' && Boolean(s.image_url));
    return valid.length > 0 ? valid : [defaultStoreSlide];
  })();

  const safeSlideIndex = currentSlideIndex < showcaseSlides.length ? currentSlideIndex : 0;
  const activeSlide = showcaseSlides[safeSlideIndex] || defaultStoreSlide;

  const handleNextSlide = () => {
    if (showcaseSlides.length <= 1) return;
    setCurrentSlideIndex((prev) => (prev + 1) % showcaseSlides.length);
  };

  const handlePrevSlide = () => {
    if (showcaseSlides.length <= 1) return;
    setCurrentSlideIndex((prev) => (prev - 1 + showcaseSlides.length) % showcaseSlides.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 35) {
      handleNextSlide();
    } else if (diff < -35) {
      handlePrevSlide();
    }
    setTouchStartX(null);
  };

  useEffect(() => {
    if (showcaseSlides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % showcaseSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [showcaseSlides.length, currentSlideIndex]);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  useEffect(() => {
    document.title = store?.name || 'بطاقة الولاء';
    const mode = store?.theme_mode || 'light';
    document.documentElement.setAttribute('data-theme', mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
      document.body.style.backgroundColor = '#080B11';
    };
  }, [store?.name, store?.theme_mode]);

  useEffect(() => {
    if (!store?.id) return;
    loadInitialData();

    const unsubscribe = LoyaltyEvents.listen((event) => {
      const curStore = storeRef.current;
      const curCust = customerRef.current;

      if (event.type === 'SCAN_REJECTED') {
        const isTargetCustomer = Boolean(
          curCust &&
          event.phone &&
          normalizePhone(event.phone) === normalizePhone(curCust.phone)
        );
        if (isTargetCustomer) {
          playBeepSound('error');
          setCelebrationModal({
            isOpen: true,
            type: 'REJECTED',
            title: 'تم رفض المسح من الكاشير ❌',
            subtitle: event.error || 'عفواً، لا يمكن استخدام هذا الباركود هنا لأنه يتبع لمتجر آخر',
          });
        }
        return;
      }

      if (event.type === 'CUSTOM_NOTIFICATION') {
        const isTargetCustomer =
          event.targetType === 'all_customers' ||
          (curCust !== null &&
            ((Boolean(event.phone) && normalizePhone(event.phone!) === normalizePhone(curCust.phone)) ||
              event.targetId === curCust.id ||
              event.targetId === curCust.phone));

        if (isTargetCustomer && (event.storeId === store?.id || event.storeId === 'all' || event.storeId === 'global')) {
          playBeepSound(event.soundType || 'notification');
          setCelebrationModal({
            isOpen: true,
            type: 'POINTS_EARNED',
            title: event.title || 'إشعار جديد من المتجر 🔔',
            subtitle: event.message || '',
          });

          if (curCust?.phone) {
            saveInboxNotification(
              {
                id: event.eventId,
                title: event.title || 'إشعار من المتجر 🔔',
                body: event.message || '',
                soundType: event.soundType || 'notification',
                targetType: 'customer',
                storeId: curStore.id,
                userPhone: curCust.phone,
                portal: 'customer',
              },
              {
                portal: 'customer',
                storeId: curStore.id,
                userPhone: curCust.phone,
              }
            );
          }
        }
        return;
      }

      if (event.storeId === store?.id || event.storeId === 'all') {
        if (event.type === 'COUPON_REDEEMED') {
          const currentSelected = selectedCouponRef.current;
          const isMyCoupon =
            (event.phone && curCust && normalizePhone(event.phone) === normalizePhone(curCust.phone)) ||
            (currentSelected && (currentSelected.id === event.couponId || currentSelected.coupon_code === event.couponCode));

          if (isMyCoupon) {
            setSelectedCouponForQR(null);
            if (curCust) regenerateToken(curCust, null);
            playBeepSound('success');
            confetti({
              particleCount: 140,
              spread: 100,
              origin: { y: 0.5 },
              colors: ['#10B981', curStore.secondary_color || '#d4af37', '#38BDF8', '#FFFFFF'],
            });
            setCelebrationModal({
              isOpen: true,
              type: 'COUPON_REDEEMED',
              title: event.rewardTitle || currentSelected?.privilege_title || 'الامتياز',
              subtitle: `شكراً لزيارتك لـ ${curStore.name}! تم صرف وتسليم طلبك بنجاح ✨`,
            });
            setCustomerCoupons((prev) =>
              prev.map((c) =>
                (event.couponId && c.id === event.couponId) || (event.couponCode && c.coupon_code === event.couponCode)
                  ? { ...c, status: 'REDEEMED' as const }
                  : c
              )
            );

            // 📬 Save isolated inbox notification for this customer
            if (curCust?.phone) {
              saveInboxNotification(
                {
                  title: 'استبدال مكافأة بنجاح 🎁',
                  body: `تم استبدال: "${event.rewardTitle || currentSelected?.privilege_title || 'الامتياز'}" بنجاح!`,
                  soundType: 'redeem',
                  targetType: 'customer',
                  storeId: curStore.id,
                  userPhone: curCust.phone,
                  portal: 'customer',
                },
                {
                  portal: 'customer',
                  storeId: curStore.id,
                  userPhone: curCust.phone,
                }
              );
            }
          }
          refreshCustomerData();
          return;
        }

        if (event.type === 'POINTS_ADDED') {
          const effectivePhone = curCust?.phone || savedProfile?.phone || guestPhone;
          const isMyPoints =
            event.phone && effectivePhone && normalizePhone(event.phone) === normalizePhone(effectivePhone);
          if (isMyPoints && event.points) {
            setIsFullscreenQR(false);
            setShowEmbeddedQR(false);
            playBeepSound('success');
            confetti({
              particleCount: 120,
              spread: 90,
              origin: { y: 0.5 },
              colors: [curStore.secondary_color || '#d4af37', '#10B981', '#38BDF8', '#FFFFFF'],
            });
            setCelebrationModal({
              isOpen: true,
              type: 'POINTS_EARNED',
              title: curStore.name,
              subtitle: 'شكراً لزيارتك! تم تسجيل نقاط الزيارة بنجاح ✨',
              points: event.points,
              newBalance: event.newBalance,
            });
            if (event.newBalance !== undefined && curCust) {
              setCustomer((prev) => prev ? { ...prev, wallet_balance: event.newBalance! } : prev);
            }

            // 📬 Save isolated inbox notification for this customer
            if (effectivePhone) {
              saveInboxNotification(
                {
                  title: 'نقاط ولاء جديدة 🌟',
                  body: `تمت إضافة +${event.points} نقطة بنجاح! رصيدك الجديد: ${event.newBalance ?? 0} نقطة.`,
                  soundType: 'success',
                  targetType: 'customer',
                  storeId: curStore.id,
                  userPhone: effectivePhone,
                  portal: 'customer',
                },
                {
                  portal: 'customer',
                  storeId: curStore.id,
                  userPhone: effectivePhone,
                }
              );
            }
          }
          refreshCustomerData();
          return;
        }

        if (
          event.type === 'COUPON_PURCHASED' ||
          event.type === 'WALLET_UPDATED' ||
          event.type === 'CUSTOMER_UPDATED'
        ) {
          refreshCustomerData();
          return;
        }

        if (event.type === 'TIERS_UPDATED') {
          LoyaltyService.getTiers(store.id).then((t) => {
            setTiers(t.sort((a, b) => a.required_xp - b.required_xp));
          }).catch(() => {});
          return;
        }

        if (event.type === 'PRIVILEGES_UPDATED') {
          LoyaltyService.getPrivileges(store.id).then((p) => {
            setPrivileges(p);
          }).catch(() => {});
          return;
        }

        if (
          event.type === 'STORE_UPDATED' ||
          event.type === 'BRANCHES_UPDATED' ||
          event.type === 'CATALOG_UPDATED' ||
          event.type === 'BOOKING_CREATED' ||
          event.type === 'BOOKING_STATUS_UPDATED' ||
          event.type === 'BOOKINGS_UPDATED'
        ) {
          // 🔄 Instant live reload of catalog items (Menu / Products / Services)
          LoyaltyService.getCatalogItems(store.id).then((cat) => {
            if (cat && Array.isArray(cat)) setCatalogItems(cat);
          }).catch(() => {});

          // 🔄 Instant live reload of specialists
          LoyaltyService.getStoreSpecialists(store.id).then((specs) => {
            if (specs && Array.isArray(specs)) setSpecialists(specs);
          }).catch(() => {});

          // 🔄 Instant live reload of customer bookings
          const myCleanPhone = customerRef.current?.phone || guestPhone || '';
          LoyaltyService.getStoreBookings(store.id, myCleanPhone).then((bks) => {
            if (bks && Array.isArray(bks)) setStoreBookings(bks);
          }).catch(() => {});

          if (event.type === 'STORE_UPDATED' || event.type === 'BRANCHES_UPDATED') {
            LoyaltyService.resolveStore(store.id || store.slug, true).then((fresh) => {
              if (fresh) setStore(fresh);
            }).catch(() => {});
            LoyaltyService.getStoreBranches(store.id).then((brs) => {
              if (brs && Array.isArray(brs)) {
                setBranches(brs);
                setSelectedBranch((prev) => {
                  if (!prev) return brs.find((b) => b.is_main) || brs[0] || null;
                  return brs.find((b) => b.id === prev.id) || brs.find((b) => b.is_main) || brs[0] || null;
                });
              }
            }).catch(() => {});
          }
          return;
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [store?.id]);

  const loadInitialData = async () => {
    if (!store?.id) return;
    setLoading(true);
    try {
      const savedPhone = LoyaltyService.getCustomerSession(store.id, store.slug);
      const freshCust = savedPhone ? await LoyaltyService.getCustomer(store.id, savedPhone) : null;

      const [freshStore, t, p, cat, specs, bks, freshCoupons, freshBranches] = await Promise.all([
        LoyaltyService.resolveStore(store.id || store.slug),
        LoyaltyService.getTiers(store.id),
        LoyaltyService.getPrivileges(store.id),
        LoyaltyService.getCatalogItems(store.id),
        LoyaltyService.getStoreSpecialists(store.id),
        LoyaltyService.getStoreBookings(store.id, freshCust?.phone),
        freshCust ? LoyaltyService.getCustomerCoupons(freshCust.id, store.id, freshCust.phone) : Promise.resolve([]),
        LoyaltyService.getStoreBranches(store.id),
      ]);

      if (freshStore) setStore(freshStore);
      setTiers(t.sort((a, b) => a.required_xp - b.required_xp));
      setPrivileges(p);
      setCatalogItems(cat || []);
      setSpecialists(specs || []);
      setStoreBookings(bks || []);
      if (freshCoupons) setCustomerCoupons(freshCoupons);

      if (freshBranches && Array.isArray(freshBranches)) {
        setBranches(freshBranches);
        if (freshBranches.length > 0) {
          const mainBranch = freshBranches.find((b) => b.is_main) || freshBranches[0];
          setSelectedBranch(mainBranch);
        }
      }

      if (freshCust) {
        if (!freshCust.special_date && freshCust.phone) {
          const normP = normalizePhone(freshCust.phone);
          const cached =
            localStorage.getItem(`radar_cust_special_date_${store.id}_${normP}`) ||
            (store.slug ? localStorage.getItem(`radar_cust_special_date_${store.slug}_${normP}`) : null) ||
            localStorage.getItem(`radar_cust_special_date_${store.id}_${freshCust.phone}`) ||
            (store.slug ? localStorage.getItem(`radar_cust_special_date_${store.slug}_${freshCust.phone}`) : null);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              freshCust.special_date = (typeof parsed === 'object' && parsed !== null && parsed.date) ? parsed.date : String(parsed);
              freshCust.special_date_type = (typeof parsed === 'object' && parsed !== null && parsed.type) ? parsed.type : 'يوم ميلادي';
            } catch {
              freshCust.special_date = cached;
              freshCust.special_date_type = 'يوم ميلادي';
            }
          }
        }
        if (freshCust.special_date) {
          setShowSpecialDateForm(false);
        }
        setCustomer(freshCust);
        setSavedProfile({ name: freshCust.name || '', phone: freshCust.phone });
        setGuestName(freshCust.name || '');
        setGuestPhone(freshCust.phone);
        lastPointsRef.current = freshCust.wallet_balance;
        regenerateToken(freshCust, null);
      } else {
        const prof = LoyaltyService.getCustomerProfile(store.id, store.slug);
        if (prof) {
          setSavedProfile(prof);
          if (prof.name) setGuestName(prof.name);
          if (prof.phone) setGuestPhone(prof.phone);
        }
      }

      const effectivePhone = freshCust?.phone || savedPhone || LoyaltyService.getCustomerProfile(store.id, store.slug)?.phone;
      if (effectivePhone) {
        LoyaltyService.getCustomerOrders(store.id, effectivePhone)
          .then((ords) => {
            if (ords && Array.isArray(ords)) setPastOrders(ords);
          })
          .catch(() => {});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const refreshCustomerData = async () => {
    if (!store?.id || !customer?.phone) return;
    try {
      const [freshCust, freshCoupons] = await Promise.all([
        LoyaltyService.getCustomer(store.id, customer.phone),
        LoyaltyService.getCustomerCoupons(customer.id, store.id, customer.phone),
      ]);
      if (freshCust) {
        if (!freshCust.special_date && customer?.special_date) {
          freshCust.special_date = customer.special_date;
          freshCust.special_date_type = customer.special_date_type;
        }
        setCustomer(freshCust);
        lastPointsRef.current = freshCust.wallet_balance;
      }
      if (freshCoupons && Array.isArray(freshCoupons)) {
        setCustomerCoupons(freshCoupons);
      }
    } catch {
    }
  };

  // 1.5 Lightweight Background Sync (تحديث خفيف للأرقام فقط كل 5 ثواني)
  useEffect(() => {
    if (!store?.id || !customer?.phone) return;

    let isSubscribed = true;

    const runLightSync = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (!isSubscribed) return;
      try {
        const [freshCust, freshCoupons] = await Promise.all([
          LoyaltyService.getCustomer(store.id, customer.phone),
          LoyaltyService.getCustomerCoupons(customer.id, store.id, customer.phone),
          LoyaltyService.getStoreBookings(store.id, customer.phone).then((bks) => { if (isSubscribed && Array.isArray(bks)) setStoreBookings(bks); return bks; }),
        ]);

        if (!isSubscribed) return;

        if (freshCust) {
          if (!freshCust.special_date && customer?.special_date) {
            freshCust.special_date = customer.special_date;
            freshCust.special_date_type = customer.special_date_type;
          }
          if (lastPointsRef.current !== null && freshCust.wallet_balance > lastPointsRef.current) {
            const pointsGained = freshCust.wallet_balance - lastPointsRef.current;
            lastPointsRef.current = freshCust.wallet_balance;
            setCustomer(freshCust);
            playBeepSound('success');
            confetti({
              particleCount: 120,
              spread: 90,
              origin: { y: 0.5 },
              colors: [store.secondary_color || '#d4af37', '#10B981', '#38BDF8', '#FFFFFF'],
            });
            setCelebrationModal({
              isOpen: true,
              type: 'POINTS_EARNED',
              title: store.name,
              subtitle: 'شكراً لزيارتك! تم تسجيل نقاط الزيارة بنجاح ✨',
              points: pointsGained,
              newBalance: freshCust.wallet_balance,
            });

            // 📬 Save isolated inbox notification for this customer as backup sync
            const effectivePhone = freshCust.phone || savedProfile?.phone || guestPhone;
            if (effectivePhone) {
              saveInboxNotification(
                {
                  title: 'نقاط ولاء جديدة 🌟',
                  body: `تمت إضافة +${pointsGained} نقطة بنجاح! رصيدك الجديد: ${freshCust.wallet_balance} نقطة.`,
                  soundType: 'success',
                  targetType: 'customer',
                  storeId: store.id,
                  userPhone: effectivePhone,
                  portal: 'customer',
                },
                {
                  portal: 'customer',
                  storeId: store.id,
                  userPhone: effectivePhone,
                }
              );
            }
          } else {
            lastPointsRef.current = freshCust.wallet_balance;
            if (
              freshCust.wallet_balance !== customer.wallet_balance ||
              freshCust.lifetime_xp !== customer.lifetime_xp ||
              freshCust.name !== customer.name
            ) {
              setCustomer(freshCust);
            }
          }
        }

        if (freshCoupons && Array.isArray(freshCoupons)) {
          const currentSelected = selectedCouponRef.current;
          if (currentSelected) {
            const matchingCoupon = freshCoupons.find(
              (c) => c.id === currentSelected.id || c.coupon_code === currentSelected.coupon_code
            );
            if (matchingCoupon && (matchingCoupon.status === 'USED' || matchingCoupon.status === 'REDEEMED')) {
              setSelectedCouponForQR(null);
              setCustomerCoupons(freshCoupons);
              playBeepSound('success');
              confetti({
                particleCount: 140,
                spread: 100,
                origin: { y: 0.5 },
                colors: ['#10B981', store.secondary_color || '#d4af37', '#38BDF8', '#FFFFFF'],
              });
              setCelebrationModal({
                isOpen: true,
                type: 'COUPON_REDEEMED',
                title: currentSelected.privilege_title,
                subtitle: `شكراً لزيارتك لـ ${store.name}! تم صرف وتسليم طلبك بنجاح ✨`,
              });
            } else {
              setCustomerCoupons(freshCoupons);
            }
          } else {
            setCustomerCoupons(freshCoupons);
          }
        }
      } catch (e) {
      }
    };

    const lightInterval = setInterval(() => {
      // 🛡️ Fail-safe backup query every 60s ONLY if page is in foreground and screen is unlocked
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        runLightSync();
      }
    }, 60000);

    const onVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        runLightSync();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', onVisibilityOrFocus);
      window.addEventListener('focus', onVisibilityOrFocus);
    }

    return () => {
      isSubscribed = false;
      clearInterval(lightInterval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', onVisibilityOrFocus);
        window.removeEventListener('focus', onVisibilityOrFocus);
      }
    };
  }, [store?.id, customer?.phone, customer?.id]);

  const regenerateToken = (
    c: Customer,
    couponToRedeem: CustomerCoupon | null = selectedCouponForQR
  ) => {
    let type: 'PASS' | 'REDEEM' | 'COUPON' = 'PASS';
    let rewardTitle: string | undefined = undefined;
    let couponId: string | undefined = undefined;
    let couponCode: string | undefined = undefined;

    if (couponToRedeem) {
      type = 'COUPON';
      rewardTitle = couponToRedeem.privilege_title;
      couponId = couponToRedeem.id;
      couponCode = couponToRedeem.coupon_code;
    } else if (selectedRewardPass) {
      type = 'REDEEM';
      rewardTitle = selectedRewardPass.title;
    }

    const token = LoyaltyService.generateDynamicQR(
      store.id,
      c,
      type,
      rewardTitle,
      couponId,
      couponCode
    );
    setCurrentQRToken(token);
    setTimeLeft(60);
  };

  useEffect(() => {
    if (!customer || !currentQRToken || selectedCouponForQR) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const remainingSeconds = Math.max(0, Math.ceil((currentQRToken.expires_at - now) / 1000));
      setTimeLeft(remainingSeconds);

      if (remainingSeconds <= 0) {
        regenerateToken(customer, null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [customer?.id, currentQRToken?.token_id, selectedRewardPass, selectedCouponForQR]);

  useEffect(() => {
    if (!store?.id) return;
    const effectivePhone = customer?.phone || orderSuccessPayload?.customer_phone || (bookingSuccessData as any)?.customer_phone || guestPhone;
    if (!effectivePhone && !orderSuccessPayload && !bookingSuccessData) return;
    
    // Fetch initial orders & bookings directly from live Supabase
    let isCancelled = false;
    let channel: any = null;

    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    LoyaltyService.resolveStore(store.id).then((resolvedStore) => {
      if (isCancelled) return;
      const validStoreUuid = resolvedStore?.id && isUuid(resolvedStore.id)
        ? resolvedStore.id
        : isUuid(store.id)
        ? store.id
        : null;

      if (!validStoreUuid) return;

      if (effectivePhone) {
        LoyaltyService.getCustomerOrders(validStoreUuid, effectivePhone).then((orders) => {
          if (!isCancelled) setPastOrders(orders);
        }).catch(() => {});

        LoyaltyService.getStoreBookings(validStoreUuid, effectivePhone).then((bks) => {
          if (!isCancelled) setStoreBookings(bks);
        }).catch(() => {});
      }

      // Listen to live changes with verified store UUID filter
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const normPhone = (p: string | null | undefined) => (p || '').replace(/\D/g, '').slice(-9);
      const targetNormPhone = normPhone(effectivePhone || customerRef.current?.phone || guestPhone || '');

      channel = supabase
        .channel('customer-live-' + (targetNormPhone || 'guest') + '-' + validStoreUuid)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_orders',
            filter: `store_id=eq.${validStoreUuid}`,
          },
          (payload: any) => {
            const updated = payload.new;
            if (!updated) return;
            const updatedPhone = normPhone(updated.customer_phone);
            const myCleanPhone = normPhone(effectivePhone || customerRef.current?.phone || guestPhone || '');

            const activeOrder = orderSuccessPayloadRef.current;
            const activeOrderId = activeOrder?.order_id || (activeOrder as any)?.id || (activeOrder as any)?.order_number;

            const isMatchingActive = Boolean(activeOrderId && (activeOrderId === updated.order_number || activeOrderId === updated.id));
            const isMatchingPhone = Boolean(myCleanPhone && updatedPhone && myCleanPhone === updatedPhone);
            const isExistingInList = pastOrdersRef.current.some((o: any) => o.id === updated.id || (o.order_number && o.order_number === updated.order_number));

            if (isMatchingActive || isMatchingPhone || isExistingInList) {
              setPastOrders((prev) => {
                const exists = prev.some((o: any) => o.id === updated.id || (o.order_number && o.order_number === updated.order_number));
                if (exists) {
                  return prev.map((o: any) => (o.id === updated.id || o.order_number === updated.order_number) ? { ...o, ...updated } : o);
                }
                return [updated, ...prev];
              });

              // ⚡ Instant live update on active order confirmation modal
              setOrderSuccessPayload((prev) => {
                if (!prev) return prev;
                const prevId = prev.order_id || (prev as any).id || (prev as any).order_number;
                if (prevId === updated.order_number || prevId === updated.id) {
                  return {
                    ...prev,
                    ...updated,
                    status: updated.status,
                  };
                }
                return prev;
              });

              if (payload.eventType === 'UPDATE') {
                try { playBeepSound('notification'); } catch {}
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'service_bookings',
            filter: `store_id=eq.${validStoreUuid}`,
          },
          (payload: any) => {
            const updated = payload.new;
            if (!updated) return;
            const updatedPhone = normPhone(updated.customer_phone);
            const myCleanPhone = normPhone(effectivePhone || customerRef.current?.phone || guestPhone || '');

            const activeBooking = bookingSuccessDataRef.current;
            const activeBookingId = activeBooking?.id || activeBooking?.booking_number;

            const isMatchingActive = Boolean(activeBookingId && (activeBookingId === updated.id || activeBookingId === updated.booking_number));
            const isMatchingPhone = Boolean(myCleanPhone && updatedPhone && myCleanPhone === updatedPhone);
            const isExistingInList = storeBookingsRef.current.some((b: any) => b.id === updated.id || (b.booking_number && b.booking_number === updated.booking_number));

            if (isMatchingActive || isMatchingPhone || isExistingInList) {
              setStoreBookings((prev) => {
                const exists = prev.some((b: any) => b.id === updated.id || (b.booking_number && b.booking_number === updated.booking_number));
                if (exists) {
                  return prev.map((b: any) => (b.id === updated.id || b.booking_number === updated.booking_number) ? { ...b, ...updated } : b);
                }
                return [{ ...updated }, ...prev];
              });

              // ⚡ Instant live update on active booking confirmation modal
              setBookingSuccessData((prev) => {
                if (!prev) return prev;
                const prevId = prev.id || prev.booking_number;
                if (prevId === updated.id || prevId === updated.booking_number) {
                  return {
                    ...prev,
                    ...updated,
                    status: updated.status,
                  };
                }
                return prev;
              });

              if (payload.eventType === 'UPDATE') {
                try { playBeepSound('notification'); } catch {}
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'catalog_items',
            filter: `store_id=eq.${validStoreUuid}`,
          },
          (payload: any) => {
            // ⚡ Instant live update on menu / catalog items across all devices
            if (payload.eventType === 'INSERT' && payload.new) {
              setCatalogItems((prev) => {
                if (prev.some((it) => it.id === payload.new.id)) return prev;
                return [payload.new, ...prev];
              });
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              setCatalogItems((prev) =>
                prev.map((it) => (it.id === payload.new.id ? { ...it, ...payload.new } : it))
              );
            } else if (payload.eventType === 'DELETE' && payload.old) {
              setCatalogItems((prev) => prev.filter((it) => it.id !== payload.old.id));
            } else {
              LoyaltyService.getCatalogItems(store.id).then((fresh) => {
                if (fresh && Array.isArray(fresh)) setCatalogItems(fresh);
              }).catch(() => {});
            }
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_customers', filter: 'phone=eq.' + (customer?.phone || '') }, () => {
          // ⚡ Instant push update when cashier adds points or edits customer
          if (customer?.phone) {
            LoyaltyService.getCustomer(store.id, customer.phone).then((fresh) => {
              if (fresh && !isCancelled) {
                setCustomer(fresh);
                lastPointsRef.current = fresh.wallet_balance;
              }
            });
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_coupons', filter: 'customer_phone=eq.' + (effectivePhone || customer?.phone || '') }, () => {
          // ⚡ Instant push update when a coupon is redeemed or added
          if (customer?.id && (effectivePhone || customer?.phone)) {
            LoyaltyService.getCustomerCoupons(customer.id, store.id, (effectivePhone || customer?.phone)!).then((freshCoupons) => {
              if (freshCoupons && !isCancelled) setCustomerCoupons(freshCoupons);
            });
          }
        })
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'stores',
            filter: `id=eq.${validStoreUuid}`,
          },
          (payload: any) => {
            if (payload.new && !isCancelled) {
              setStore((prev) => ({ ...prev, ...payload.new }));
            }
          }
        )
        .subscribe();
    });

    // ⚡ Cross-Device Event Bus listener for instant POS <-> Customer sync
    const normPhone = (p: string) => (p || '').replace(/\D/g, '').slice(-9);
    const targetNormPhone = normPhone(effectivePhone || customer?.phone || '');

    const unsubscribeEvents = LoyaltyEvents.listen((event) => {
      if (event.type === 'ORDER_STATUS_UPDATED' && event.orderData) {
        const orderPhone = normPhone(event.phone || event.orderData.customer_phone);
        const myCleanPhone = normPhone(effectivePhone || customerRef.current?.phone || guestPhone || '');
        const activeOrder = orderSuccessPayloadRef.current;
        const activeOrderId = activeOrder?.order_id || (activeOrder as any)?.id || (activeOrder as any)?.order_number;

        const isMatchingActive = Boolean(activeOrderId && (activeOrderId === event.orderData.order_number || activeOrderId === event.orderData.id));
        const isMatchingPhone = Boolean(myCleanPhone && orderPhone && myCleanPhone === orderPhone);
        const isExistingInList = pastOrdersRef.current.some((o: any) => o.id === event.orderData.id || (o.order_number && o.order_number === event.orderData.order_number));

        if (isMatchingActive || isMatchingPhone || isExistingInList) {
          const updated = event.orderData;
          setPastOrders((prev) => [
            updated,
            ...prev.filter(
              (o: any) => o.id !== updated.id && (o.order_number || o.order_id) !== (updated.order_number || updated.order_id)
            ),
          ]);
          setOrderSuccessPayload((prev) => {
            if (!prev) return prev;
            const prevId = prev.order_id || (prev as any).id || (prev as any).order_number;
            if (prevId === updated.order_number || prevId === updated.id) {
              return {
                ...prev,
                status: updated.status,
              };
            }
            return prev;
          });
          try { playBeepSound('notification'); } catch {}
        }
      }

      if (event.type === 'BOOKING_STATUS_UPDATED' && event.bookingData) {
        const bPhone = normPhone(event.phone || event.bookingData.customer_phone);
        const myCleanPhone = normPhone(effectivePhone || customerRef.current?.phone || guestPhone || '');
        const activeBooking = bookingSuccessDataRef.current;
        const activeBookingId = activeBooking?.id || activeBooking?.booking_number;

        const isMatchingActive = Boolean(activeBookingId && (activeBookingId === event.bookingData.id || activeBookingId === event.bookingData.booking_number));
        const isMatchingPhone = Boolean(myCleanPhone && bPhone && myCleanPhone === bPhone);
        const isExistingInList = storeBookingsRef.current.some((b: any) => b.id === event.bookingData.id || (b.booking_number && b.booking_number === event.bookingData.booking_number));

        if (isMatchingActive || isMatchingPhone || isExistingInList) {
          const updated = event.bookingData;
          setStoreBookings((prev) => [
            updated,
            ...prev.filter(
              (b) =>
                b.id !== updated.id &&
                b.booking_number !== updated.booking_number
            ),
          ]);
          setBookingSuccessData((prev) => {
            if (!prev) return prev;
            const prevId = prev.id || prev.booking_number;
            if (prevId === updated.id || prevId === updated.booking_number) {
              return {
                ...prev,
                ...updated,
                status: updated.status,
              };
            }
            return prev;
          });
          try { playBeepSound('notification'); } catch {}
        }
      }
    });

    return () => {
      isCancelled = true;
      unsubscribeEvents();
      if (channel) {
        getSupabaseClient()?.removeChannel(channel);
      }
    };
  }, [store?.id, customer?.phone, orderSuccessPayload?.order_id, (orderSuccessPayload as any)?.id, bookingSuccessData?.id, bookingSuccessData?.booking_number, guestPhone]);

  const handleCustomerAuthenticated = async (authCustomer: Customer) => {
    // 🛡️ Root-level reset of previous customer state to prevent data leak
    setCustomerCoupons([]);
    setStoreBookings([]);
    setPastOrders([]);
    setSelectedCouponForQR(null);

    if (!authCustomer.special_date && authCustomer.phone) {
      const normP = normalizePhone(authCustomer.phone);
      const cached =
        localStorage.getItem(`radar_cust_special_date_${store.id}_${normP}`) ||
        (store.slug ? localStorage.getItem(`radar_cust_special_date_${store.slug}_${normP}`) : null) ||
        localStorage.getItem(`radar_cust_special_date_${store.id}_${authCustomer.phone}`) ||
        (store.slug ? localStorage.getItem(`radar_cust_special_date_${store.slug}_${authCustomer.phone}`) : null);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          authCustomer.special_date = (typeof parsed === 'object' && parsed !== null && parsed.date) ? parsed.date : String(parsed);
          authCustomer.special_date_type = (typeof parsed === 'object' && parsed !== null && parsed.type) ? parsed.type : 'يوم ميلادي';
        } catch {
          authCustomer.special_date = cached;
          authCustomer.special_date_type = 'يوم ميلادي';
        }
      }
    }
    if (authCustomer.special_date) {
      setShowSpecialDateForm(false);
    }

    setCustomer(authCustomer);
    setSavedProfile({ name: authCustomer.name || '', phone: authCustomer.phone });
    setGuestName(authCustomer.name || '');
    setGuestPhone(authCustomer.phone);
    LoyaltyService.saveCustomerProfile(store.id, { name: authCustomer.name || '', phone: authCustomer.phone }, store.slug);
    lastPointsRef.current = authCustomer.wallet_balance;
    regenerateToken(authCustomer, null);
    setShowLoginModal(false);

    try {
      const [cpns, bks, ords] = await Promise.all([
        LoyaltyService.getCustomerCoupons(authCustomer.id, store.id, authCustomer.phone),
        LoyaltyService.getStoreBookings(store.id, authCustomer.phone),
        LoyaltyService.getCustomerOrders(store.id, authCustomer.phone),
      ]);
      setCustomerCoupons(cpns);
      if (bks) setStoreBookings(bks);
      if (ords && Array.isArray(ords)) setPastOrders(ords);
    } catch (e) {
      console.error(e);
    }

    // ⚡ التنفيذ التلقائي للعملية السابقة بدون إعادة طلب الضغط (Auto-Resume)
    const action = pendingAuthAction;
    setPendingAuthAction(null);

    if (action) {
      if (action.type === 'SHOW_QR') {
        setActiveTab('pass');
      } else if (action.type === 'SUBMIT_ORDER') {
        setTimeout(() => {
          executeDirectOrderSubmission(authCustomer);
        }, 150);
      } else if (action.type === 'SUBMIT_BOOKING') {
        setTimeout(() => {
          executeDirectBookingSubmission(authCustomer);
        }, 150);
      } else if (action.type === 'REDEEM_PRIVILEGE') {
        setPurchasingPrivilege(action.privilege);
      }
    }
  };

  const handleLogout = () => {
    const phoneToPurge = customer?.phone || savedProfile?.phone || guestPhone;
    LoyaltyService.clearCustomerSession(store.id, store.slug);

    if (phoneToPurge) {
      clearAllInboxNotifications({
        portal: 'customer',
        storeId: store.id,
        userPhone: phoneToPurge,
      });
    }

    // 🛡️ Comprehensive State Reset to prevent any Cross-User Data Leaks
    setCustomer(null);
    setSavedProfile(null);
    setGuestName('');
    setGuestPhone('');
    setSelectedCouponForQR(null);
    setPastOrders([]);
    setStoreBookings([]);
    setCustomerCoupons([]);
    setCartItems([]);
    setOrderSuccessPayload(null);
    setBookingSuccessData(null);
    setCelebrationModal(null);

    if (activeModules.orders) setActiveTab('menu');
    else if (activeModules.bookings) setActiveTab('services');
    else if (activeModules.loyalty) setActiveTab('pass');
    else setActiveTab('tickets');
  };

  const openEditName = () => {
    setNameInput(customer?.name || savedProfile?.name || guestName || '');
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      if (customer) {
        const updated = await LoyaltyService.updateCustomer(customer.id, { name: nameInput.trim() });
        setCustomer(updated);
        LoyaltyService.saveCustomerProfile(store.id, { name: updated.name || '', phone: updated.phone }, store.slug);
      } else if (savedProfile) {
        LoyaltyService.saveCustomerProfile(store.id, { name: nameInput.trim(), phone: savedProfile.phone }, store.slug);
        setSavedProfile({ name: nameInput.trim(), phone: savedProfile.phone });
      }
      setGuestName(nameInput.trim());
      setIsEditingName(false);
      playBeepSound('success');
    } catch (e) {
      console.error('Failed to update name', e);
    } finally {
      setSavingName(false);
    }
  };

  const handleConfirmPurchaseCoupon = async () => {
    if (!customer || !purchasingPrivilege || purchaseLoading) return;
    setPurchaseLoading(true);
    setPurchaseError(null);

    const cost = purchasingPrivilege.cost_points || 0;
    if ((customer.wallet_balance || 0) < cost) {
      setPurchaseError(`رصيد نقاطك غير كافٍ! تحتاج إلى ${cost} نقطة ورصيدك الحالي هو ${customer.wallet_balance} نقطة`);
      setPurchaseLoading(false);
      return;
    }

    const previousCustomer = { ...customer };
    const previousCoupons = [...customerCoupons];
    const previousSelectedCoupon = selectedCouponForQR;
    const activePrivilege = purchasingPrivilege;

    const optimisticCode =
      'CPN-' +
      Math.floor(1000 + Math.random() * 9000) +
      '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase();
    const optimisticCoupon: CustomerCoupon = {
      id: 'cpn-opt-' + Date.now(),
      coupon_code: optimisticCode,
      customer_id: customer.id,
      customer_phone: customer.phone,
      customer_name: customer.name || undefined,
      store_id: store.id,
      privilege_id: activePrivilege.id,
      privilege_title: activePrivilege.title,
      privilege_image_url: activePrivilege.image_url,
      cost_points: cost,
      status: 'ACTIVE',
      valid_start_time: activePrivilege.valid_start_time,
      valid_end_time: activePrivilege.valid_end_time,
      purchased_at: new Date().toISOString(),
    };

    const optimisticUpdatedCustomer: Customer = {
      ...customer,
      wallet_balance: customer.wallet_balance - cost,
    };

    setCustomer(optimisticUpdatedCustomer);
    setCustomerCoupons([optimisticCoupon, ...customerCoupons]);
    setSelectedCouponForQR(optimisticCoupon);
    regenerateToken(optimisticUpdatedCustomer, optimisticCoupon);

    setPurchaseSuccessAlert({
      title: optimisticCoupon.privilege_title,
      cost: optimisticCoupon.cost_points,
      code: optimisticCoupon.coupon_code,
    });

    setPurchasingPrivilege(null);
    setActiveTab('tickets'); 

    playBeepSound('success');
    confetti({
      particleCount: 120,
      spread: 90,
      origin: { y: 0.5 },
      colors: [store.secondary_color || '#C6F27B', '#10B981', '#38BDF8', '#FFFFFF'],
    });

    try {
      const result = await LoyaltyService.purchaseCoupon(
        store.id,
        customer.id,
        activePrivilege.id
      );

      if (result && result.coupon) {
        setCustomer(result.updatedCustomer);
        setCustomerCoupons((prev) =>
          prev.map((c) => (c.id === optimisticCoupon.id ? result.coupon : c))
        );
        setSelectedCouponForQR(result.coupon);
        regenerateToken(result.updatedCustomer, result.coupon);
      }
    } catch (err: any) {
      console.error('Background redemption failed, executing rollback:', err);
      setCustomer(previousCustomer);
      setCustomerCoupons(previousCoupons);
      setSelectedCouponForQR(previousSelectedCoupon);
      regenerateToken(previousCustomer, previousSelectedCoupon);
      setPurchaseSuccessAlert(null);
      setPurchaseError(err.message || 'فشلت عملية تفعيل الامتياز. تم استرجاع نقاطك بالكامل.');
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleSelectCouponForRedeem = (coupon: CustomerCoupon) => {
    if (selectedCouponForQR?.id === coupon.id) {
      setSelectedCouponForQR(null);
      if (customer) regenerateToken(customer, null);
    } else {
      setSelectedCouponForQR(coupon);
      if (customer) regenerateToken(customer, coupon);
      setActiveTab('pass'); 
      window.scrollTo({ top: 0, behavior: 'smooth' });
      playBeepSound('success');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeKey(key);
    setTimeout(() => setCopiedCodeKey(null), 2500);
  };

  const isStoreSuspended =
    store.subscription_active === false ||
    store.subscription_status === 'suspended' ||
    store.status === 'suspended';

  if (isStoreSuspended) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900/95 border border-rose-500/30 text-center space-y-6 shadow-2xl relative overflow-hidden backdrop-blur-md animate-fade-in">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

          <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto shadow-inner">
            <Shield className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <span className="px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-wider">
              برنامج الولاء معلق مؤقتاً
            </span>
            <h2 className="text-xl font-black text-white mt-2">
              خدمة كسب النقاط غير متاحة حالياً
            </h2>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              تم إيقاف عمليات كسب واستبدال المكافآت لمتجر <strong className="text-white">({store.name})</strong> مؤقتاً من قِبل الإدارة.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 text-right space-y-2">
            <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>بيانات عضويتك وأرصدتك التراكمية محفوظة بأمان تام 🔒</span>
            </div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse text-slate-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>ستتم إعادة فتح محفظتك فور قيام إدارة المتجر بتنشيط الخدمة.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div
          className="w-12 h-12 border-4 rounded-full animate-spin"
          style={{
            borderColor: `${store.secondary_color || '#C6F27B'}30`,
            borderTopColor: store.secondary_color || '#C6F27B',
          }}
        ></div>
        <p className="text-xs text-slate-400 font-bold">جاري فتح محفظة {store.name} الفاخرة...</p>
      </div>
    );
  }

  const timeLockCheck = selectedCouponForQR
    ? LoyaltyService.isWithinTimeRange(
        selectedCouponForQR.valid_start_time,
        selectedCouponForQR.valid_end_time
      )
    : { allowed: true };

  const isCouponFrozen = !timeLockCheck.allowed;

  const qrDataPayload = isCouponFrozen
    ? 'FROZEN'
    : selectedCouponForQR
    ? selectedCouponForQR.coupon_code
    : customer
    ? JSON.stringify({
        t: 'PASS',
        s: store.id,
        p: customer.phone,
        tk: currentQRToken?.token_id,
      })
    : '';

  const sortedTiers = [...tiers].sort((a, b) => a.required_xp - b.required_xp);
  const currentTierObj =
    customer && sortedTiers.length > 0
      ? [...sortedTiers].reverse().find((t) => (customer.lifetime_xp || 0) >= t.required_xp) ||
        sortedTiers[0]
      : sortedTiers[0];

  const nextTierObj =
    customer && sortedTiers.length > 0
      ? sortedTiers.find((t) => t.required_xp > (customer.lifetime_xp || 0)) || null
      : sortedTiers[1] || null;

  const currentTierMinXP = currentTierObj?.required_xp || 0;
  const nextTierMinXP = nextTierObj?.required_xp || currentTierMinXP + 100;
  const customerXP = customer?.lifetime_xp || 0;

  const progressPercent = nextTierObj
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(((customerXP - currentTierMinXP) / (nextTierMinXP - currentTierMinXP)) * 100)
        )
      )
    : 100;

  const xpNeeded = nextTierObj ? Math.max(0, nextTierObj.required_xp - customerXP) : 0;
  const activeCouponsCount = customerCoupons.filter((c) => c.status === 'ACTIVE').length;

  const catalogCategories = Array.from(
    new Set(
      catalogItems
        .filter((item) => item.item_type !== 'service')
        .map((item) => item.category?.trim())
        .filter(Boolean)
    )
  ) as string[];

  const filteredCatalogItems = catalogItems.filter((item) => {
    if (!item.is_available) return false;
    if (item.item_type === 'service') return false; 
    const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
    const matchesSearch =
      !catalogSearch.trim() ||
      item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(catalogSearch.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const availableServiceItems = catalogItems.filter(
    (item) => item.item_type === 'service' && item.is_available !== false
  );

  const calculateServiceBookingPrice = (): number => {
    if (!selectedBookingService) return 0;
    let total = selectedBookingService.price;
    Object.values(selectedServiceModifiers).forEach((opts) => {
      opts.forEach((opt) => {
        total += opt.price_delta || 0;
      });
    });
    return Math.max(0, total);
  };

  const getFlatSelectedServiceModifiers = (): CatalogModifierOption[] => {
    const list: CatalogModifierOption[] = [];
    Object.values(selectedServiceModifiers).forEach((opts) => {
      list.push(...opts);
    });
    return list;
  };

  const handleSelectServiceForBooking = (srv: CatalogItem) => {
    setSelectedBookingService(srv);
    const initialModifiers: Record<string, CatalogModifierOption[]> = {};
    if (srv.modifier_groups && srv.modifier_groups.length > 0) {
      srv.modifier_groups.forEach((group) => {
        const defaultOpts = group.options.filter((opt) => opt.is_default);
        if (defaultOpts.length > 0) {
          initialModifiers[group.id] = defaultOpts;
        } else if (group.required && group.options.length > 0) {
          initialModifiers[group.id] = [group.options[0]];
        } else {
          initialModifiers[group.id] = [];
        }
      });
      setSelectedServiceModifiers(initialModifiers);
      setBookingStep(2); 
    } else {
      setSelectedServiceModifiers({});
      setBookingStep(3); 
    }
  };

  const handleToggleServiceModifierOption = (
    group: CatalogModifierGroup,
    option: CatalogModifierOption
  ) => {
    const currentList = selectedServiceModifiers[group.id] || [];
    const isAlreadySelected = currentList.some((o) => o.id === option.id);

    if (!group.allow_multiple) {
      setSelectedServiceModifiers((prev) => ({
        ...prev,
        [group.id]: [option],
      }));
    } else {
      if (isAlreadySelected) {
        setSelectedServiceModifiers((prev) => ({
          ...prev,
          [group.id]: currentList.filter((o) => o.id !== option.id),
        }));
      } else {
        if (group.max_selections && currentList.length >= group.max_selections) {
          return;
        }
        setSelectedServiceModifiers((prev) => ({
          ...prev,
          [group.id]: [...currentList, option],
        }));
      }
    }
  };

  const executeDirectBookingSubmission = async (targetCustomer: Customer, paidDetails?: any) => {
    if (!selectedBookingService || bookingSubmitting) return;

    if (selectedBookingService.modifier_groups) {
      for (const group of selectedBookingService.modifier_groups) {
        if (group.required) {
          const selectedInGroup = selectedServiceModifiers[group.id] || [];
          if (selectedInGroup.length === 0) {
            alert(`يرجى تحديد اختيار لمجموعة الإضافات: "${group.name}"`);
            setBookingStep(2);
            return;
          }
        }
      }
    }

    const isConflict = storeBookings.some((b) => 
      b.status !== 'cancelled' &&
      b.booking_date === selectedBookingDate &&
      b.booking_time === selectedBookingTime &&
      (selectedBookingSpecialist ? (b.specialist_id === selectedBookingSpecialist.id || !b.specialist_id) : false)
    );

    if (isConflict) {
      alert(`عفواً! تم حجز موعد الساعة (${selectedBookingTime}) للمختص (${selectedBookingSpecialist?.name || 'المحدد'}) للتو من قبل عميل آخر 🔒.\nيرجى اختيار وقت بديل متاح.`);
      setBookingStep(4);
      return;
    }

    setBookingSubmitting(true);
    try {
      const flatModifiers = getFlatSelectedServiceModifiers();
      const finalPrice = calculateServiceBookingPrice();
      const isPrepaid = Boolean(paidDetails);
      const isAutoConfirm = store.fulfillment_settings?.booking_confirmation_mode === 'auto';
      const resolvedPaymentMethod = isPrepaid ? (paidDetails?.paymentMethod || 'online') : 'pay_at_store';
      const resolvedPaymentStatus = isPrepaid ? 'paid' : 'pending';
      const resolvedBookingStatus = (isPrepaid || isAutoConfirm) ? 'confirmed' : 'pending';
      const pointsToEarn = Math.floor(finalPrice * (store.points_per_riyal || 1));

      const createdBooking = await LoyaltyService.createServiceBooking({
        store_id: store.id,
        store_name: store.name,
        branch_id: selectedBranch?.id || null,
        branch_name: selectedBranch?.name || null,
        customer_id: targetCustomer.id,
        customer_name: targetCustomer.name || 'عميل المتجر',
        customer_phone: targetCustomer.phone,
        service_id: selectedBookingService.id,
        service_name: selectedBookingService.name,
        service_category: selectedBookingService.category,
        service_price: finalPrice,
        selected_modifiers: flatModifiers,
        total_price: finalPrice,
        service_duration_minutes: selectedBookingService.duration_minutes || 30,
        specialist_id: selectedBookingSpecialist?.id,
        specialist_name: selectedBookingSpecialist?.name,
        booking_date: selectedBookingDate,
        booking_time: selectedBookingTime,
        status: resolvedBookingStatus,
        payment_status: resolvedPaymentStatus,
        payment_method: resolvedPaymentMethod,
        points_to_earn: pointsToEarn,
        loyalty_points_earned: isPrepaid ? pointsToEarn : 0,
        points_awarded: isPrepaid,
        notes: bookingNotes.trim() || undefined,
        booking_source: 'customer_app',
      } as any);

      // 👑 سداد مسبق معتمد: منح نقاط الولاء فوراً للعميل وتحديث المحفظة
      if (isPrepaid && pointsToEarn > 0) {
        LoyaltyService.rewardPointsForCompletedTransaction(
          store.id,
          targetCustomer.phone,
          pointsToEarn,
          `سداد إلكتروني لحجز موعد #${createdBooking.booking_number || ''} (${selectedBookingService.name})`,
          targetCustomer.name || undefined,
          'بوابة الدفع الإلكتروني',
          selectedBranch?.id || null,
          selectedBranch?.name || null,
          finalPrice,
          'SERVICE_BOOKING'
        ).catch(console.error);

        setCustomer((prev) =>
          prev
            ? {
                ...prev,
                wallet_balance: (prev.wallet_balance || 0) + pointsToEarn,
                lifetime_xp: (prev.lifetime_xp || 0) + pointsToEarn,
              }
            : null
        );
      }

      setStoreBookings((prev) => [createdBooking, ...prev]);
      setBookingSuccessData(createdBooking);

      playBeepSound('success');
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 },
      });
    } catch (err: any) {
      console.error('Booking creation error:', err);
      alert(err.message || 'فشل تسجيل الحجز، يرجى المحاولة مرة أخرى.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleConfirmServiceBooking = async () => {
    if (!selectedBookingService || bookingSubmitting) return;

    if (!customer) {
      setPendingAuthAction({ type: 'SUBMIT_BOOKING' });
      setShowLoginModal(true);
      return;
    }

    const needsOnlinePayment =
      effectiveBookingsPolicy === 'online_only' ||
      (effectiveBookingsPolicy === 'both' && bookingPaymentMethod === 'online');

    if (needsOnlinePayment) {
      const price = calculateServiceBookingPrice();
      setPaymentModalConfig({
        type: 'booking',
        title: 'سداد حجز الموعد إلكترونياً',
        itemDescription: `${selectedBookingService.name} - ${selectedBookingDate} (${selectedBookingTime})`,
        amount: price,
        onSuccess: async (details) => {
          setIsPaymentModalOpen(false);
          await executeDirectBookingSubmission(customer, details);
        },
      });
      setIsPaymentModalOpen(true);
      return;
    }

    await executeDirectBookingSubmission(customer);
  };

  const handleReBookService = (pastBooking: ServiceBooking) => {
    const matchedService: CatalogItem = catalogItems.find(
      (item) => item.id === pastBooking.service_id || item.name === pastBooking.service_name
    ) || {
      id: pastBooking.service_id || 'srv-' + Date.now(),
      store_id: store.id,
      name: pastBooking.service_name,
      category: pastBooking.service_category || 'خدمات عامة',
      price: pastBooking.service_price || pastBooking.total_price || 0,
      item_type: 'service',
      duration_minutes: pastBooking.duration_minutes || 30,
      modifier_groups: [],
      is_available: true,
      created_at: new Date().toISOString(),
    };

    setSelectedBookingService(matchedService);

    const restoredModifiers: Record<string, CatalogModifierOption[]> = {};
    if (pastBooking.selected_modifiers && pastBooking.selected_modifiers.length > 0) {
      if (matchedService.modifier_groups && matchedService.modifier_groups.length > 0) {
        matchedService.modifier_groups.forEach((grp: CatalogModifierGroup) => {
          const matchedOpts = grp.options.filter((opt: CatalogModifierOption) =>
            pastBooking.selected_modifiers?.some((m) => m.id === opt.id || m.name === opt.name)
          );
          if (matchedOpts.length > 0) {
            restoredModifiers[grp.id] = matchedOpts;
          }
        });
      }
    }
    setSelectedServiceModifiers(restoredModifiers);

    const matchedSpec = specialists.find(
      (s) => s.id === pastBooking.specialist_id && s.is_active !== false
    );
    setSelectedBookingSpecialist(matchedSpec || null);

    setShowPastOrdersModal(false);
    setActiveTab('services');
    setBookingSuccessData(null);
    setBookingStep(4);
    playBeepSound('success');
  };

  const cartSubtotal = cartItems.reduce((acc, item) => acc + item.total_price, 0);
  const isDelivery = fulfillmentType === 'delivery';
  const deliveryFee = isDelivery
    ? (calculatedDelivery ? calculatedDelivery.delivery_fee : (store.fulfillment_settings?.delivery_fee || 0))
    : 0;
  const cartGrandTotal = cartSubtotal + deliveryFee;
  const estimatedLoyaltyPoints = Math.floor(cartGrandTotal * (store.points_per_riyal || 1));
  const hasServiceInCart = cartItems.some((i) => i.catalog_item.item_type === 'service');

  const handleOpenCustomizeModal = (item: CatalogItem) => {
    setItemToCustomize(item);
    setCustomizingQuantity(1);
    setCustomizingNotes('');

    const initialSelections: Record<string, CatalogModifierOption[]> = {};
    if (item.modifier_groups && item.modifier_groups.length > 0) {
      item.modifier_groups.forEach((group) => {
        const defaultOpts = group.options.filter((opt) => opt.is_default);
        if (defaultOpts.length > 0) {
          initialSelections[group.id] = defaultOpts;
        } else if (group.required && group.options.length > 0) {
          initialSelections[group.id] = [group.options[0]];
        } else {
          initialSelections[group.id] = [];
        }
      });
    }
    setSelectedModifierOptions(initialSelections);
    setIsCustomizeModalOpen(true);
  };

  const handleToggleModifierOption = (
    group: CatalogModifierGroup,
    option: CatalogModifierOption
  ) => {
    const currentList = selectedModifierOptions[group.id] || [];
    const isAlreadySelected = currentList.some((o) => o.id === option.id);

    if (!group.allow_multiple) {
      setSelectedModifierOptions((prev) => ({
        ...prev,
        [group.id]: [option],
      }));
    } else {
      if (isAlreadySelected) {
        setSelectedModifierOptions((prev) => ({
          ...prev,
          [group.id]: currentList.filter((o) => o.id !== option.id),
        }));
      } else {
        if (group.max_selections && currentList.length >= group.max_selections) {
          return;
        }
        setSelectedModifierOptions((prev) => ({
          ...prev,
          [group.id]: [...currentList, option],
        }));
      }
    }
  };

  const calculateCustomizedItemUnitPrice = (item: CatalogItem): number => {
    let price = item.price;
    Object.values(selectedModifierOptions).forEach((opts) => {
      opts.forEach((opt) => {
        price += opt.price_delta || 0;
      });
    });
    return Math.max(0, price);
  };

  const handleAddCustomizedItemToCart = () => {
    if (!itemToCustomize) return;

    if (selectedBranch && !branchStatus.isOpen) {
      alert(`عفواً، فرع "${selectedBranch.name}" مغلق حالياً ولا يستقبل طلبات جديدة.\n${branchStatus.reason || ''}`);
      return;
    }

    if (itemToCustomize.modifier_groups) {
      for (const group of itemToCustomize.modifier_groups) {
        if (group.required) {
          const selectedInGroup = selectedModifierOptions[group.id] || [];
          if (selectedInGroup.length === 0) {
            alert(`يرجى تحديد اختيار لمجموعة: "${group.name}"`);
            return;
          }
        }
      }
    }

    const allSelectedModifiers: CatalogModifierOption[] = [];
    Object.values(selectedModifierOptions).forEach((opts) => {
      allSelectedModifiers.push(...opts);
    });

    const unitPrice = calculateCustomizedItemUnitPrice(itemToCustomize);
    const totalPrice = unitPrice * customizingQuantity;

    const newCartItem: CartItem = {
      id: 'cart-item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      catalog_item: itemToCustomize,
      quantity: customizingQuantity,
      selected_modifiers: allSelectedModifiers,
      special_notes: customizingNotes.trim() || undefined,
      unit_price: unitPrice,
      total_price: totalPrice,
    };

    setCartItems((prev) => [...prev, newCartItem]);
    setIsCustomizeModalOpen(false);
    setItemToCustomize(null);
    playBeepSound('success');
  };

  const handleQuickAddToCart = (item: CatalogItem) => {
    if (selectedBranch && !branchStatus.isOpen) {
      alert(`عفواً، فرع "${selectedBranch.name}" مغلق حالياً ولا يستقبل طلبات جديدة.\n${branchStatus.reason || ''}`);
      return;
    }

    if (item.modifier_groups && item.modifier_groups.length > 0) {
      handleOpenCustomizeModal(item);
      return;
    }

    const newCartItem: CartItem = {
      id: 'cart-item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      catalog_item: item,
      quantity: 1,
      selected_modifiers: [],
      unit_price: item.price,
      total_price: item.price,
    };

    setCartItems((prev) => [...prev, newCartItem]);
    playBeepSound('success');
  };

  const handleUpdateCartItemQty = (cartItemId: string, delta: number) => {
    setCartItems((prev) => {
      return prev
        .map((item) => {
          if (item.id === cartItemId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return {
              ...item,
              quantity: newQty,
              total_price: item.unit_price * newQty,
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== cartItemId));
  };

  const executeDirectOrderSubmission = async (targetCustomer: Customer, paidDetails?: any) => {
    if (cartItems.length === 0 || submittingOrder) return;

    if (selectedBranch && !branchStatus.isOpen) {
      alert(`عفواً، فرع "${selectedBranch.name}" مغلق حالياً ولا يستقبل طلبات فورية.\n${branchStatus.reason || ''}`);
      return;
    }

    if (fulfillmentType === 'delivery') {
      if (!deliveryAddress.trim()) {
        alert('⚠️ يرجى كتابة عنوان التوصيل بالتفصيل للمتابعة وعدم تخطي الموقع.');
        return;
      }
      if (!deliveryGpsLink.trim()) {
        alert('⚠️ يرجى تحديد موقعك على الخريطة عبر زر الـ GPS لضمان وصول الكابتن لمكانك بدقة.');
        return;
      }
      if (availableDriversCount === 0) {
        alert('عذراً، كباتن التوصيل غير متاحين حالياً في هذا الفرع 🛵💨\nيمكنك اختيار الاستلام سفري من الفرع أو التواصل مع المتجر للتأكيد.');
        return;
      }
      if (calculatedDelivery && !calculatedDelivery.is_deliverable) {
        alert(calculatedDelivery.message || 'عذراً، موقعك يقع خارج نطاق التوصيل المتاح لهذا الفرع.');
        return;
      }
    }

    setSubmittingOrder(true);

    try {
      if ((saveThisAddress || selectedAddressId) && deliveryAddress.trim()) {
        const coords = extractCoordsFromMapUrl(deliveryGpsLink);
        const newAddr: CustomerSavedAddress = {
          id: selectedAddressId || `addr_${Date.now()}`,
          label: saveAddressLabel,
          icon: saveAddressLabel === 'البيت' ? 'home' : saveAddressLabel === 'العمل' ? 'building' : 'map-pin',
          district: deliveryAddress.split('-')[0]?.trim() || deliveryAddress.trim(),
          street: deliveryAddress.split('-')[1]?.trim() || '',
          building_no: deliveryAddress.split('-')[2]?.trim() || '',
          map_url: deliveryGpsLink.trim() || undefined,
          lat: coords?.lat,
          lng: coords?.lng,
          photo_url: deliveryLocationPhoto.trim() || undefined,
          created_at: new Date().toISOString(),
        };
        const updated = [...savedAddresses.filter((a) => a.label !== saveAddressLabel), newAddr];
        setSavedAddresses(updated);
        try {
          localStorage.setItem(savedAddressesStorageKey, JSON.stringify(updated));
        } catch {}
      }

      const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
      const activationCode = Math.floor(1000 + Math.random() * 9000).toString();
      const isPaid = Boolean(paidDetails);
      const resolvedPaymentMethod = isPaid ? (paidDetails?.paymentMethod || 'online') : 'pay_at_store';
      const resolvedPaymentStatus = isPaid ? 'paid' : 'pending';

      const coords = extractCoordsFromMapUrl(deliveryGpsLink);

      const payload: any = {
        order_id: orderId,
        store_id: store.id,
        store_name: store.name,
        branch_id: selectedBranch?.id || null,
        branch_name: selectedBranch?.name || null,
        customer_name: targetCustomer.name || 'عميل المتجر',
        customer_phone: targetCustomer.phone,
        customer_tier: currentTierObj?.tier_name,
        activation_code: activationCode,
        items: cartItems.map((c) => ({
          ...c,
          id: c.catalog_item?.id || c.id,
          name: c.catalog_item?.name || (c as any).name || 'صنف',
          item_name: c.catalog_item?.name || (c as any).item_name || (c as any).name || 'صنف',
          unit_price: c.unit_price,
          total_price: c.total_price,
          quantity: c.quantity,
          notes: c.special_notes || (c as any).notes || null,
          category: c.catalog_item?.category || (c as any).category || null,
          item_type: c.catalog_item?.item_type || (c as any).item_type || 'product',
        })),
        fulfillment_type: fulfillmentType,
        fulfillment_details: {
          table_number: tableNumber.trim() || undefined,
          party_size: partySize > 0 ? partySize : undefined,
          arrival_date: arrivalDate || undefined,
          arrival_time: arrivalTime || undefined,
          car_model_and_plate: carPlate.trim() || undefined,
          delivery_address: deliveryAddress.trim() || undefined,
          delivery_gps_link: deliveryGpsLink.trim() || undefined,
          delivery_lat: coords?.lat,
          delivery_lng: coords?.lng,
          delivery_distance_km: calculatedDelivery?.distance_km,
          delivery_tier_label: calculatedDelivery?.matched_tier?.label,
          delivery_address_label: saveAddressLabel || 'البيت',
          delivery_location_photo: deliveryLocationPhoto.trim() || undefined,
          specialist_name: specialistName.trim() || undefined,
          general_notes: generalOrderNotes.trim() || undefined,
          points_awarded: isPaid,
        },
        delivery_address: deliveryAddress.trim() || undefined,
        delivery_gps_link: deliveryGpsLink.trim() || undefined,
        subtotal: cartSubtotal,
        delivery_fee: deliveryFee,
        total_amount: cartGrandTotal,
        total_price: cartGrandTotal,
        notes: generalOrderNotes.trim(),
        loyalty_points_earned: estimatedLoyaltyPoints,
        order_source: 'customer_app',
        payment_method: resolvedPaymentMethod,
        payment_status: resolvedPaymentStatus,
        status: 'pending',
        points_awarded: isPaid,
        created_at: new Date().toISOString(),
      };

      // 1. Insert order in Supabase store_orders (also triggers Telegram notification)
      await LoyaltyService.createStoreOrder(payload);

      // 2. إذا تم السداد إلكترونياً، يتم منح نقاط الولاء فوراً للعميل وتحديث المحفظة
      if (isPaid && estimatedLoyaltyPoints > 0) {
        LoyaltyService.rewardPointsForCompletedTransaction(
          store.id,
          targetCustomer.phone,
          estimatedLoyaltyPoints,
          `سداد إلكتروني لطلب أونلاين #${orderId}`,
          targetCustomer.name || undefined,
          'بوابة الدفع الإلكتروني',
          selectedBranch?.id || null,
          selectedBranch?.name || null,
          cartGrandTotal,
          'PURCHASE'
        ).catch(console.error);

        setCustomer((prev) =>
          prev
            ? {
                ...prev,
                wallet_balance: (prev.wallet_balance || 0) + estimatedLoyaltyPoints,
                lifetime_xp: (prev.lifetime_xp || 0) + estimatedLoyaltyPoints,
              }
            : null
        );
      }

      // 3. Update past orders in local view
      LoyaltyService.getCustomerOrders(store.id, targetCustomer.phone)
        .then((updated) => {
          if (updated && Array.isArray(updated)) setPastOrders(updated);
        })
        .catch(() => {});

      // 4. Clear cart and show order confirmation modal (ZERO WhatsApp redirect!)
      setCartItems([]);
      setIsCartModalOpen(false);
      setOrderSuccessPayload(payload);
      playBeepSound('success');
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.5 },
        colors: [brandSecondary, '#10B981', '#38BDF8', '#FFFFFF'],
      });
    } catch (e: any) {
      console.error('Could not submit order to server', e);
      alert(e.message || 'حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (cartItems.length === 0 || submittingOrder) return;

    if (selectedBranch && !branchStatus.isOpen) {
      alert(`عفواً، فرع "${selectedBranch.name}" مغلق حالياً ولا يستقبل طلبات فورية.\n${branchStatus.reason || ''}`);
      return;
    }

    if (!customer) {
      setPendingAuthAction({ type: 'SUBMIT_ORDER' });
      setShowLoginModal(true);
      return;
    }

    const needsOnlinePayment =
      effectiveOrdersPolicy === 'online_only' ||
      (effectiveOrdersPolicy === 'both' && orderPaymentMethod === 'online');

    if (needsOnlinePayment) {
      setPaymentModalConfig({
        type: 'order',
        title: 'سداد فاتورة الطلب إلكترونياً',
        itemDescription: `طلب منيو (${cartItems.length} أصناف) - ${store.name}`,
        amount: cartGrandTotal,
        onSuccess: async (details) => {
          setIsPaymentModalOpen(false);
          await executeDirectOrderSubmission(customer, details);
        },
      });
      setIsPaymentModalOpen(true);
      return;
    }

    await executeDirectOrderSubmission(customer);
  };

  const handleReOrder = (order: WhatsAppOrderPayload) => {
    if (!order.items || order.items.length === 0) return;
    setCartItems(order.items);
    setFulfillmentType(order.fulfillment_type);
    if (order.fulfillment_details) {
      const fd = order.fulfillment_details;
      if (fd.table_number) setTableNumber(fd.table_number);
      if (fd.party_size) setPartySize(fd.party_size);
      if (fd.car_model_and_plate) setCarPlate(fd.car_model_and_plate);
      if (fd.delivery_address) setDeliveryAddress(fd.delivery_address);
      if (fd.delivery_gps_link) setDeliveryGpsLink(fd.delivery_gps_link);
      if (fd.specialist_name) setSpecialistName(fd.specialist_name);
      if (fd.general_notes) setGeneralOrderNotes(fd.general_notes);
    }
    setShowPastOrdersModal(false);
    setIsCartModalOpen(true);
    playBeepSound('success');
  };

  return (
    <div className="max-w-md mx-auto space-y-5 pb-28 animate-fade-in" style={{ accentColor: brandSecondary }}>
      
      {/* 🍽️ Table QR Direct Dine-in Banner */}
      {tableQrBanner && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-amber-600/20 border border-amber-500/40 text-amber-200 shadow-xl flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400 font-bold text-base">
              🍽️
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-white">الطلب المباشر من الصالة</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">
                  طاولة #{tableQrBanner.tableNumber}
                </span>
              </div>
              <p className="text-[11px] text-amber-200/80 truncate mt-0.5">
                تم تثبيت رقم طاولتك بنجاح — ستصلك طلباتك إليها مباشرة!
              </p>
            </div>
          </div>
          <button
            onClick={() => setTableQrBanner(null)}
            className="p-1 rounded-lg hover:bg-amber-500/20 text-amber-300/70 hover:text-white transition shrink-0"
            title="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {customer && customer.is_active === false && (
        <div className="p-4 rounded-3xl bg-rose-950/80 border-2 border-rose-500/60 text-rose-200 text-xs font-semibold flex items-center space-x-3 rtl:space-x-reverse animate-shake shadow-2xl">
          <AlertCircle className="w-6 h-6 text-rose-400 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-white">تنبيه: حساب العضوية موقوف مؤقتاً</h4>
            <p className="text-[11px] text-rose-300 mt-0.5">
              تم إيقاف حسابك مؤقتاً من قبل إدارة المتجر. يرجى مراجعة إدارة {store.name}.
            </p>
          </div>
        </div>
      )}

      {/* 👑 02 - Luxury Capsule Header with Merchant Brand Logo */}
      <div className={`px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-3 relative z-20 transition-all ${
        isDarkTheme ? 'frosted-glass-capsule shadow-2xl' : 'bg-white border border-slate-200/90 shadow-sm'
      }`}>
        <div className="flex items-center space-x-3 rtl:space-x-reverse min-w-0">
          {/* Merchant Brand Logo replacing generic customer avatar */}
          <div
            className="w-11 h-11 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 border shadow-lg relative p-0.5"
            style={{
              borderColor: `${brandSecondary}60`,
              background: `radial-gradient(circle, ${brandSecondary}25 0%, rgba(15,23,42,0.9) 100%)`,
            }}
          >
            {store.logo_url ? (
              <img
                src={store.logo_url}
                alt={store.name}
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              <span className="font-serif font-black text-lg" style={{ color: brandSecondary }}>
                {store.name.slice(0, 1)}
              </span>
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-950 flex items-center justify-center text-[7px]"
              style={{ backgroundColor: brandSecondary, color: brandColors.contrastOnSecondary }}
            >
              👑
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>مرحباً بك،</span>
              <span className={`font-black text-sm sm:text-base truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {customer?.name || savedProfile?.name || (guestName.trim() ? guestName : ('ضيف ' + getActiveTenantConfig().brandName))}
              </span>
              {(customer || savedProfile) && (
                <button
                  onClick={openEditName}
                  className="p-0.5 transition"
                  style={{ color: isDarkTheme ? brandSecondary : brandColors.textOnLightHex }}
                  title="تعديل الاسم"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full font-mono border"
                style={{
                  backgroundColor: `${brandSecondary}15`,
                  borderColor: `${brandSecondary}35`,
                  color: isDarkTheme ? brandSecondary : brandColors.textOnLightHex,
                }}
              >
                {currentTierObj?.tier_name ? `عضو ${currentTierObj.tier_name}` : `متجر ${store.name}`}
              </span>
              <p className={`text-[10px] font-mono truncate ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} dir="ltr">
                {customer?.phone || savedProfile?.phone || (guestPhone.trim() ? guestPhone : '')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 rtl:space-x-reverse shrink-0">
          <button
            type="button"
            onClick={() => setShowPastOrdersModal(true)}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition shadow-sm relative ${
              isDarkTheme
                ? 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-amber-400'
                : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900'
            }`}
            title="سجل طلباتي ومتابعة الطلب 🕒"
          >
            <Clock className="w-4 h-4" />
            {pastOrders.some((o) => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready') && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          <NotificationBell
            portalName={store.name || 'محفظة العميل'}
            portalFilter="customer"
            storeId={store.id}
            userPhone={customer?.phone || savedProfile?.phone || guestPhone}
            buttonClassName={`w-10 h-10 rounded-2xl p-0 shadow-sm flex items-center justify-center transition ${
              isDarkTheme
                ? 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white'
                : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900'
            }`}
          />

          {(customer || savedProfile) ? (
            <button
              onClick={handleLogout}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition shadow-sm ${
                isDarkTheme
                  ? 'bg-white/5 hover:bg-rose-950/60 border border-white/10 hover:border-rose-500/40 text-slate-300 hover:text-rose-300'
                  : 'bg-slate-100 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-600'
              }`}
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPendingAuthAction({ type: 'SHOW_QR' });
                setShowLoginModal(true);
              }}
              className="px-3 py-2 rounded-2xl border font-black text-xs flex items-center gap-1.5 transition active:scale-95 shadow-lg"
              style={{
                backgroundColor: brandSecondary,
                borderColor: brandSecondary,
                color: brandColors.contrastOnSecondary,
              }}
            >
              <QrCode className="w-4 h-4" />
              <span>دخول / بطاقتي</span>
            </button>
          )}
        </div>
      </div>

      {isEditingName && (
        <div
          className="p-4 rounded-2xl bg-slate-900 border space-y-3 animate-fade-in shadow-xl"
          style={{ borderColor: `${brandSecondary}40` }}
        >
          <label className="text-xs font-bold block" style={{ color: brandSecondary }}>
            تعديل اسم صاحب البطاقة:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="اكتب اسمك الكريم هنا..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
              style={{ caretColor: brandSecondary }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={savingName || !nameInput.trim()}
              style={{
                backgroundColor: store.secondary_color || '#d4af37',
                color: '#000000',
              }}
              className="px-4 py-2.5 rounded-xl font-black text-xs flex items-center space-x-1 rtl:space-x-reverse transition shadow disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{savingName ? 'حفظ...' : 'حفظ'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditingName(false)}
              className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {activeTab === 'pass' && activeModules.loyalty && (
        <div className="space-y-4 animate-fade-in">
          
          {/* 🌟 03 - Edge-to-Edge Hero Banner */}
          <div
            className="relative group select-none -mx-4 sm:mx-0 overflow-hidden shadow-2xl"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="relative min-h-[200px] sm:min-h-[230px] flex flex-col justify-end p-5 sm:p-6 transition-all duration-500 rounded-none sm:rounded-3xl border-y sm:border border-white/10"
              style={{
                backgroundColor: store.primary_color || '#07070B',
              }}
            >
              <img
                key={`img-${activeSlide.id || safeSlideIndex}`}
                src={activeSlide.image_url}
                alt={activeSlide.title || store.name}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                loading="lazy"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/25 pointer-events-none"></div>

              <div
                key={`content-${activeSlide.id || safeSlideIndex}`}
                className="relative z-10 space-y-2 text-right animate-fade-in"
              >
                {activeSlide.badge_text && (
                  <div>
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black shadow-lg"
                      style={{
                        backgroundColor: brandSecondary,
                        color: brandColors.contrastOnSecondary,
                      }}
                    >
                      <span>👑</span>
                      <span>{activeSlide.badge_text}</span>
                    </span>
                  </div>
                )}

                <h2 className="keep-white font-black text-white text-lg sm:text-2xl leading-tight drop-shadow-lg" style={{ color: '#FFFFFF' }}>
                  {activeSlide.title || store.name}
                </h2>

                {activeSlide.quote && (
                  <p className="keep-white text-xs sm:text-sm text-slate-100 leading-relaxed font-medium drop-shadow-md max-w-[95%] line-clamp-2" style={{ color: '#F1F5F9' }}>
                    "{activeSlide.quote}"
                  </p>
                )}

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('menu')}
                    className={`px-4 py-1.5 rounded-full font-black text-xs shadow-lg flex items-center gap-1.5 hover:scale-105 active:scale-95 transition ${
                      brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                    }`}
                    style={{
                      backgroundColor: brandSecondary,
                      color: brandColors.contrastOnSecondary,
                    }}
                  >
                    <span>اطلب الآن</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {showcaseSlides.length > 1 && (
                <div className="relative z-10 flex items-center justify-center gap-1.5 mt-3 pt-2 border-t border-white/10">
                  {showcaseSlides.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentSlideIndex(idx);
                      }}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        safeSlideIndex === idx
                          ? 'w-6 shadow-md'
                          : 'w-2 bg-white/40 hover:bg-white/70'
                      }`}
                      style={{
                        backgroundColor: safeSlideIndex === idx ? brandSecondary : undefined,
                      }}
                      aria-label={`Slide ${idx + 1}`}
                    ></button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 📍 Proximity Distance Radar Strip (كم يبعد العميل عن المتجر مع تنبيه شاشة القفل) */}
          {proximityInfo && (
            <div className="relative z-20 mb-2">
              <button
                type="button"
                onClick={() => {
                  setWalletPassPlatform('apple');
                  setIsWalletPassModalOpen(true);
                }}
                className={`w-full p-2.5 sm:p-3 rounded-2xl border shadow-md flex items-center justify-between gap-2.5 transition text-right group active:scale-[0.99] ${
                  isDarkTheme
                    ? 'bg-slate-900/95 hover:bg-slate-800 border-emerald-500/40 hover:border-emerald-400 text-white'
                    : 'bg-white hover:bg-slate-50 border-emerald-500/40 hover:border-emerald-500 text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-500 shrink-0">
                    <MapPin className="w-4 h-4 animate-bounce" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[11px] font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                        أقرب فرع لك ({proximityInfo.nearestBranchName}):
                      </span>
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {proximityInfo.formattedDistance}
                      </span>
                    </div>
                    <span className={`text-[10px] block truncate ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                      تنبيه شاشة القفل التلقائي نشط ببطاقة المحفظة 🔔
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-600 dark:text-amber-400 shrink-0 group-hover:translate-x-[-2px] transition-transform bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/25">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>بطاقة المحفظة</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          )}

          {/* 🌟 04 - VIP Pass Card (Adaptive Monochromatic Luxury matching Merchant Identity) */}
          <div className="relative group select-none -mt-10 sm:-mt-12 z-20">
            {/* Ambient Brand Glow Behind Card */}
            <div
              className="absolute -inset-1 rounded-[30px] blur-xl opacity-35 group-hover:opacity-60 transition duration-700 pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${brandSecondary}40 0%, transparent 70%)`,
              }}
            ></div>

            <div
              className="relative rounded-[28px] p-5 sm:p-6 transition-all duration-300 vip-card-shine"
              style={{
                background: brandColors.cardGradient,
                boxShadow: brandColors.cardBoxShadow,
                border: `1px solid ${brandColors.cardBorderColor}`,
                color: brandColors.cardTextColor,
              }}
            >
              {/* Card Top Row: Merchant Info (Right) & Circular Logo Badge (Left in RTL) */}
              <div className="relative z-10 flex items-center justify-between gap-3">
                <div className="text-right">
                  <h3
                    className={`font-black text-base sm:text-lg leading-tight ${!brandColors.isPrimaryLight ? 'keep-white' : ''}`}
                    style={{ color: brandColors.cardTextColor }}
                  >
                    {store.name}
                  </h3>
                  <p
                    className="text-[11px] font-bold font-mono mt-0.5 flex items-center gap-1.5 flex-wrap"
                    style={{ color: brandColors.cardSubtextColor }}
                  >
                    <span>{currentTierObj?.tier_name ? `عضوية ${currentTierObj.tier_name}` : 'عضوية مميزة'}</span>
                    <span>•</span>
                    <span dir="ltr">#{customer?.phone ? `VIP-${customer.phone.slice(-6)}` : 'VIP-DEMO01'}</span>
                  </p>
                </div>

                {/* Circular Merchant Logo Badge */}
                <div
                  className="w-11 h-11 rounded-full border-2 flex items-center justify-center shrink-0 shadow-lg overflow-hidden font-black text-sm"
                  style={{
                    backgroundColor: brandColors.isPrimaryLight ? '#0F172A' : '#FFFFFF',
                    borderColor: brandColors.cardBorderColor,
                    color: brandColors.isPrimaryLight ? '#FFFFFF' : '#0F172A',
                  }}
                >
                  {store.logo_url ? (
                    <img
                      src={store.logo_url}
                      alt={store.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{store.name.slice(0, 1)}</span>
                  )}
                </div>
              </div>

              {/* Massive Points Display */}
              <div className="relative z-10 my-3.5 text-center">
                <div
                  className={`text-[44px] sm:text-[50px] font-black font-mono leading-none ${!brandColors.isPrimaryLight ? 'keep-white' : ''}`}
                  style={{ color: brandColors.cardTextColor }}
                >
                  {customer?.wallet_balance?.toLocaleString() ?? '0'}
                </div>
                <div
                  className="text-xs font-black mt-1"
                  style={{ color: brandColors.cardSubtextColor }}
                >
                  نقطة ولاء
                </div>
              </div>

              {/* Progress Bar & XP Remaining */}
              <div className="relative z-10 space-y-1.5 my-2">
                <div
                  className="w-full h-2.5 rounded-full overflow-hidden p-[2px] shadow-inner"
                  style={{
                    backgroundColor: brandColors.isPrimaryLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.15)',
                    border: `1px solid ${brandColors.cardBorderColor}`,
                  }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700 shadow-sm"
                    style={{
                      width: `${progressPercent}%`,
                      background: brandColors.progressGradient,
                      boxShadow: `0 0 10px ${brandColors.progressGlow}`,
                    }}
                  ></div>
                </div>
                <div
                  className="text-center text-[11px] font-bold"
                  style={{ color: brandColors.cardSubtextColor }}
                >
                  {nextTierObj ? (
                    <span>
                      باقي <strong className={`font-mono font-black ${!brandColors.isPrimaryLight ? 'keep-white' : ''}`} style={{ color: brandColors.cardTextColor }}>{xpNeeded} XP</strong> للوصول إلى {nextTierObj.tier_name}
                    </span>
                  ) : (
                    <span>وصلت لأعلى مستوى ملكي 👑</span>
                  )}
                </div>
              </div>

              {/* Bottom Interactive Pill Buttons */}
              <div className="relative z-10 mt-4 pt-1 flex items-center justify-between gap-2.5">
                {/* 1. Right Button (RTL): "كيف أجمع نقاط؟" */}
                <button
                  type="button"
                  onClick={() => setShowHowToEarnPoints(true)}
                  className={`flex-1 py-2.5 px-3 rounded-full font-black text-xs transition hover:scale-[1.02] active:scale-95 shadow-sm text-center ${
                    !brandColors.isPrimaryLight ? 'keep-white' : ''
                  }`}
                  style={{
                    backgroundColor: brandColors.howButtonBg,
                    border: `1px solid ${brandColors.howButtonBorder}`,
                    color: brandColors.howButtonText,
                  }}
                >
                  كيف أجمع نقاط؟
                </button>

                {/* 2. Left Button (RTL): "إظهار رمز الباركود" / "إخفاء الرمز" */}
                <button
                  type="button"
                  onClick={() => {
                    if (!customer) {
                      setPendingAuthAction({ type: 'SHOW_QR' });
                      setShowLoginModal(true);
                    } else {
                      setShowEmbeddedQR(!showEmbeddedQR);
                    }
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-full font-black text-xs transition hover:scale-[1.02] active:scale-95 shadow-md flex items-center justify-center gap-1.5 text-center ${
                    brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                  }`}
                  style={{
                    backgroundColor: brandSecondary,
                    color: brandColors.contrastOnSecondary,
                    border: `1px solid ${brandSecondary}80`,
                    boxShadow: `0 4px 14px ${brandColors.glow}`,
                  }}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>
                    {selectedCouponForQR
                      ? 'العودة لباركود الزيارة'
                      : showEmbeddedQR
                      ? 'إخفاء الرمز'
                      : 'إظهار رمز الباركود'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* 📱 1-Click Add to Apple Wallet & Google Wallet Strip (Arabic + Vector SVGs) */}
          <div className="relative z-10 my-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setWalletPassPlatform('apple');
                setIsWalletPassModalOpen(true);
              }}
              className="py-3 px-3 rounded-2xl bg-black hover:bg-neutral-900 border border-black/80 text-white keep-white font-black text-xs flex items-center justify-center gap-2 shadow-md transition hover:scale-[1.02] active:scale-95 group"
              style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
            >
              <svg className="w-4 h-4 fill-white shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 384 512">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              </svg>
              <span className="truncate keep-white text-white" style={{ color: '#FFFFFF' }}>إضافة لمحفظة آبل</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setWalletPassPlatform('google');
                setIsWalletPassModalOpen(true);
              }}
              className={`py-3 px-3 rounded-2xl border font-black text-xs flex items-center justify-center gap-2 shadow-sm transition hover:scale-[1.02] active:scale-95 group ${
                isDarkTheme
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-white'
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-900 shadow-sm'
              }`}
            >
              <svg className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z" />
                <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z" />
              </svg>
              <span className="truncate">حفظ في محفظة قوقل</span>
            </button>
          </div>

          {/* Active Privilege/Coupon Notice if selected */}
          {selectedCouponForQR && (
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 animate-fade-in shadow-md ${
                isDarkTheme ? 'bg-slate-900/95 border-slate-800' : 'bg-white border-slate-200'
              }`}
              style={{
                borderInlineStartWidth: '4px',
                borderInlineStartColor: safeAccentText,
              }}
            >
              <div className="flex items-center space-x-3 rtl:space-x-reverse min-w-0">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
                  style={{
                    backgroundColor: `${safeAccentFill}20`,
                    color: safeAccentText,
                  }}
                >
                  <Ticket className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className={`text-xs sm:text-sm font-black truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    جاهز لصرف امتياز: <span style={{ color: safeAccentText }}>{selectedCouponForQR.privilege_title}</span>
                  </h4>
                  <p className={`text-[10px] sm:text-[11px] font-mono mt-0.5 truncate ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    كود: <strong className={isDarkTheme ? 'text-slate-200' : 'text-slate-900'}>{selectedCouponForQR.coupon_code}</strong> | الساعات:{' '}
                    {selectedCouponForQR.valid_start_time
                      ? `${selectedCouponForQR.valid_start_time} - ${selectedCouponForQR.valid_end_time}`
                      : 'متاح 24/7'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedCouponForQR(null);
                  if (customer) regenerateToken(customer, null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 transition active:scale-95 ${
                  isDarkTheme
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 shadow-sm'
                }`}
              >
                إلغاء
              </button>
            </div>
          )}

          {/* 🌟 Dedicated Coupon Redemption Card (يظهر الكوبون تحت الشريط جاهزاً للصرف فوراً) */}
          {selectedCouponForQR && (
            <div className={`p-6 rounded-3xl border text-center space-y-4 shadow-xl animate-fade-in ${
              isDarkTheme
                ? 'bg-slate-900/95 border-slate-800 backdrop-blur-2xl'
                : 'bg-white border-slate-200 shadow-lg'
            }`}>
              <div className="flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className={`text-xs font-black ${isDarkTheme ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  🎟️ أبرز هذا الرمز للكاشير لصرف الامتياز فوراً
                </p>
              </div>

              {/* Large High-Contrast White QR Card */}
              <div
                onClick={() => setIsFullscreenQR(true)}
                className={`w-56 h-56 mx-auto p-4 rounded-3xl bg-white shadow-2xl flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform border-4 relative group/qr overflow-hidden ${
                  isDarkTheme ? 'border-slate-800' : 'border-slate-200'
                }`}
                title="انقر لتكبير الكود"
              >
                <div className="laser-beam" />
                <QRCodeSVG
                  value={isCouponFrozen ? 'FROZEN' : selectedCouponForQR.coupon_code}
                  size={190}
                  level="M"
                  includeMargin={false}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/qr:opacity-100 transition-opacity rounded-3xl flex items-center justify-center text-white keep-white text-xs font-bold gap-1">
                  <Maximize2 className="w-4 h-4" />
                  <span>تكبير الرمز</span>
                </div>
              </div>

              {/* Coupon Code Box with Copy */}
              <div className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border shadow-inner ${
                isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-[11px] font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  رمز الكوبون:
                </span>
                <span
                  className="text-sm font-black font-mono tracking-wider select-all"
                  style={{ color: safeAccentText }}
                >
                  {selectedCouponForQR.coupon_code}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(selectedCouponForQR.coupon_code, `cpn-${selectedCouponForQR.id}`)}
                  className={`text-[11px] px-3 py-1 rounded-xl transition font-black flex items-center gap-1 shadow-sm active:scale-95 ${
                    isDarkTheme
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300'
                  }`}
                >
                  {copiedCodeKey === `cpn-${selectedCouponForQR.id}` ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-600">تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-400" />
                      <span>نسخ</span>
                    </>
                  )}
                </button>
              </div>

              {/* Time lock notice if frozen */}
              {isCouponFrozen && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs text-center font-bold">
                  {timeLockCheck.message || 'عذراً، هذا الكوبون غير متاح للصرف في الوقت الحالي ⏰'}
                </div>
              )}

              {/* Validity and Details */}
              <div className={`text-[11px] space-y-1 pt-1 border-t ${
                isDarkTheme ? 'text-slate-400 border-slate-800/80' : 'text-slate-600 border-slate-200'
              }`}>
                <p>
                  صالح للاستخدام لمرة واحدة لدى متجر{' '}
                  <strong className={isDarkTheme ? 'text-white' : 'text-slate-900'}>{store.name}</strong>
                </p>
                <p className={`font-mono ${isDarkTheme ? 'text-slate-500' : 'text-slate-500'}`}>
                  ساعات الصرف: {selectedCouponForQR.valid_start_time ? `${selectedCouponForQR.valid_start_time} - ${selectedCouponForQR.valid_end_time}` : 'متاح 24/7'}
                </p>
              </div>
            </div>
          )}

          {/* 🌟 Member Regular QR Code Card (Shows smoothly when clicking "إظهار رمز الباركود") */}
          {!selectedCouponForQR && showEmbeddedQR && (
            <div className={`p-6 rounded-3xl border text-center space-y-4 shadow-2xl animate-fade-in ${
              isDarkTheme
                ? 'bg-slate-900/95 border-slate-800 backdrop-blur-2xl'
                : 'bg-white border-slate-200 shadow-xl'
            }`}>
              <p className={`text-xs font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                أبرز الرمز للكاشير لتسجيل زيارتك وكسب النقاط
              </p>

              {/* Large High-Contrast White QR Card */}
              <div
                onClick={() => setIsFullscreenQR(true)}
                className={`w-56 h-56 mx-auto p-4 rounded-3xl bg-white shadow-2xl flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform border-4 relative group/qr overflow-hidden ${
                  isDarkTheme ? 'border-slate-800' : 'border-slate-200'
                }`}
                title="انقر لتكبير الكود"
              >
                <div className="laser-beam" />
                <QRCodeSVG
                  value={qrDataPayload}
                  size={190}
                  level="M"
                  includeMargin={false}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/qr:opacity-100 transition-opacity rounded-3xl flex items-center justify-center text-white keep-white text-xs font-bold gap-1">
                  <Maximize2 className="w-4 h-4" />
                  <span>تكبير الرمز</span>
                </div>
              </div>

              {/* Countdown Timer and Refresh */}
              <div className={`flex items-center justify-center gap-2 text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                <span>يتجدد خلال</span>
                <strong
                  className="px-2 py-0.5 rounded-lg font-black font-mono"
                  style={{
                    backgroundColor: `${safeAccentFill}18`,
                    color: safeAccentText,
                  }}
                >
                  {timeLeft} ثانية
                </strong>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => {
                    if (customer) {
                      regenerateToken(customer, null);
                      playBeepSound('success');
                    }
                  }}
                  className={`transition flex items-center gap-1 font-bold hover:underline ${
                    isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>تحديث الرمز</span>
                </button>
              </div>

              <p className={`text-[11px] font-bold ${isDarkTheme ? 'text-slate-500' : 'text-slate-600'}`} dir="ltr">
                VIP-{customer?.phone ? customer.phone.slice(-6) : 'DEMO01'}
              </p>
            </div>
          )}

          {!customer && (
            <div className={`p-6 rounded-3xl border text-center space-y-4 shadow-xl ${
              isDarkTheme ? 'bg-slate-900/90 border-slate-800 backdrop-blur-xl' : 'bg-white border-slate-200 shadow-lg'
            }`}>
              <div
                className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-2xl shadow-lg border"
                style={{
                  backgroundColor: `${brandSecondary}20`,
                  borderColor: `${brandSecondary}40`,
                  color: brandSecondary,
                }}
              >
                👑
              </div>
              <div className="space-y-1">
                <h3 className={`text-base font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>بطاقة العضوية والولاء الرقمية</h3>
                <p className={`text-xs leading-relaxed max-w-xs mx-auto ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                  سجّل رقم جوالك لربط بطاقتك الخاصة بمتجر{' '}
                  <strong className={isDarkTheme ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{store.name}</strong>
                  ، لتكسب النقاط وتستبدل الجوائز مع كل زيارة!
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPendingAuthAction({ type: 'SHOW_QR' });
                  setShowLoginModal(true);
                }}
                style={{
                  backgroundColor: safeAccentFill,
                  color: safeAccentFillContrast,
                }}
                className={`w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2 transition hover:scale-[1.02] active:scale-95 ${
                  safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>تسجيل الدخول / فتح بطاقتي 🚀</span>
              </button>
            </div>
          )}

        </div>
      )}

      {activeTab === 'menu' && activeModules.orders && (
        <div className="space-y-3.5 animate-fade-in">
          {/* 🌟 05 & 07 - Category Pills & Search Row */}
          <div className="space-y-3.5">
            {/* Search Bar + Floating Orders Icon Row */}
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="ابحث عن وجبتك أو مشروبك المفضل..."
                  className={`w-full rounded-full pr-11 pl-10 py-3 text-xs sm:text-sm focus:outline-none transition shadow-sm ${
                    isDarkTheme
                      ? 'bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:border-white/30 backdrop-blur-xl shadow-inner'
                      : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-slate-400'
                  }`}
                />
                <Search className={`w-4 h-4 absolute right-4 top-3.5 pointer-events-none ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                {catalogSearch && (
                  <button
                    type="button"
                    onClick={() => setCatalogSearch('')}
                    className="absolute left-3.5 top-3 p-0.5 rounded-full bg-white/10 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Floating Orders Badge / Quick Access */}
              {pastOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPastOrdersModal(true)}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 relative transition shadow-sm active:scale-95 ${
                    isDarkTheme
                      ? 'bg-white/5 hover:bg-white/10 border border-white/10'
                      : 'bg-white hover:bg-slate-50 border border-slate-200 shadow-sm'
                  }`}
                  title="سجل طلباتي السابقة"
                >
                  <ShoppingBag className="w-5 h-5" style={{ color: isDarkTheme ? brandSecondary : brandColors.textOnLightHex }} />
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center shadow-lg"
                    style={{ backgroundColor: brandSecondary, color: brandColors.contrastOnSecondary }}
                  >
                    {pastOrders.length}
                  </span>
                </button>
              )}
            </div>

            {/* 🛵 Live Active Order Status Banner on Main Screen */}
            {(() => {
              const liveOrd: any = pastOrders.find(
                (o: any) => o && o.status && !['completed', 'cancelled'].includes(o.status)
              );
              if (!liveOrd) return null;
              const isDeliv = (liveOrd.order_type || liveOrd.fulfillment_type) === 'delivery';
              const isPickedUp = liveOrd.delivery_status === 'picked_up';
              const ordNum = String(liveOrd.order_number || liveOrd.order_id || liveOrd.id || '').replace(/^ORD-/i, '').slice(-5);

              let statusLabel = '⏳ بانتظار تأكيد المطعم لطلبك...';
              let stepDot = 1;
              if (isPickedUp) {
                statusLabel = `🛵 الكابتن (${liveOrd.driver_name || 'المندوب'}) في الطريق إليك الآن!`;
                stepDot = 4;
              } else if (liveOrd.status === 'ready') {
                statusLabel = isDeliv
                  ? `📦 طلبك جاهز بانتظار انطلاق الكابتن ${liveOrd.driver_name || ''}`
                  : '✅ طلبك جاهز للاستلام من الفرع!';
                stepDot = 3;
              } else if (liveOrd.status === 'accepted' || liveOrd.status === 'preparing') {
                statusLabel = `👨‍🍳 جاري تحضير طلبك بالمطبخ${liveOrd.driver_name ? ` • الكابتن: ${liveOrd.driver_name}` : ''}`;
                stepDot = 2;
              }

              return (
                <div
                  onClick={() => setShowPastOrdersModal(true)}
                  className={`p-3.5 rounded-2xl border-2 shadow-lg flex flex-col gap-2 cursor-pointer transition-all hover:scale-[1.01] animate-fade-in ${
                    isDarkTheme
                      ? 'bg-slate-900/95 border-amber-500/50 text-white'
                      : 'bg-white border-amber-500/60 text-slate-900 shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                      <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0" dir="ltr">
                        #ORD-{ordNum}
                      </span>
                      <span className={`text-xs font-black leading-snug ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 text-[10px] font-black shrink-0 shadow-sm flex items-center gap-1">
                      <span>تتبع</span>
                      <ChevronLeft className="w-3 h-3" />
                    </span>
                  </div>
                  {/* Mini Progress Bar */}
                  <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                    {[1, 2, 3, 4].map((d) => (
                      <div
                        key={d}
                        className={`h-1 rounded-full transition-all duration-500 ${
                          d <= stepDot ? 'bg-amber-500' : isDarkTheme ? 'bg-slate-800' : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Branch Selector if multiple branches */}
            {branches.length > 1 && (
              <div className={`space-y-1.5 p-2.5 rounded-2xl border ${
                isDarkTheme ? 'bg-white/[0.03] border-white/[0.07] backdrop-blur-md' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className={`flex items-center gap-1.5 text-[11px] ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                    <Building2 className="w-3.5 h-3.5" style={{ color: safeAccentText }} />
                    <span>فرع الطلب:</span>
                  </span>
                  {selectedBranch && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black border flex items-center gap-1 ${
                      branchStatus.isOpen
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${branchStatus.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      <span>{branchStatus.isOpen ? 'مفتوح للطلبات' : 'مغلق حالياً'}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none pt-1">
                  {branches.map((b) => {
                    const isSel = selectedBranch?.id === b.id;
                    const bStatus = checkBranchOpenStatus(b);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBranch(b)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 border ${
                          isSel
                            ? `shadow-md font-black ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                            : isDarkTheme
                            ? 'bg-white/[0.04] text-slate-400 border-white/[0.06] hover:text-white'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:text-slate-900'
                        }`}
                        style={isSel ? { backgroundColor: safeAccentFill, borderColor: safeAccentFill, color: safeAccentFillContrast } : undefined}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${bStatus.isOpen ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                        <span>{b.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Floating Glowing Category Pills (05) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                style={
                  selectedCategory === 'ALL'
                    ? {
                        backgroundColor: safeAccentFill,
                        color: safeAccentFillContrast,
                        boxShadow: `0 4px 14px -2px ${safeAccentFill}50`,
                      }
                    : undefined
                }
                className={`px-4 py-2 rounded-full font-black transition whitespace-nowrap flex items-center gap-1.5 ${
                  selectedCategory === 'ALL'
                    ? `scale-105 ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                    : isDarkTheme
                    ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm'
                }`}
              >
                <span>🌟</span>
                <span>الكل ({catalogItems.filter((i) => i.is_available && i.item_type !== 'service').length})</span>
              </button>
              {catalogCategories.map((cat) => {
                const count = catalogItems.filter((i) => i.is_available && i.item_type !== 'service' && i.category === cat).length;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    style={
                      isSelected
                        ? {
                            backgroundColor: safeAccentFill,
                            color: safeAccentFillContrast,
                            boxShadow: `0 4px 14px -2px ${safeAccentFill}50`,
                          }
                        : undefined
                    }
                    className={`px-4 py-2 rounded-full font-black transition whitespace-nowrap flex items-center gap-1.5 ${
                      isSelected
                        ? `scale-105 ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                        : isDarkTheme
                        ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm'
                    }`}
                  >
                    <span>🍽️</span>
                    <span>{cat} ({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 🌟 06 - Luxury Product Cards in 2-Column Grid */}
          {filteredCatalogItems.length === 0 ? (
            <div className={`py-14 text-center rounded-3xl border border-dashed space-y-3 ${
              isDarkTheme ? 'text-slate-400 border-white/10 bg-white/[0.02]' : 'text-slate-500 border-slate-200 bg-white shadow-sm'
            }`}>
              <ShoppingBag className="w-12 h-12 mx-auto text-slate-400 mb-1" />
              <h4 className={`text-base font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>لا توجد أصناف في هذا القسم حالياً</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {catalogSearch ? 'جرب البحث بكلمات أخرى' : `سيتم تحديث قائمة ${store.name} قريباً`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-1">
              {filteredCatalogItems.map((item) => {
                const hasModifiers = item.modifier_groups && item.modifier_groups.length > 0;
                const cartCountForItem = cartItems
                  .filter((c) => c.catalog_item.id === item.id)
                  .reduce((sum, c) => sum + c.quantity, 0);
                const earnedPoints = Math.floor(item.price * (store.points_per_riyal || 1));

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (hasModifiers) handleOpenCustomizeModal(item);
                      else handleQuickAddToCart(item);
                    }}
                    className={`${
                      isDarkTheme
                        ? 'frosted-glass-capsule hover:border-white/20'
                        : 'bg-white border border-slate-200/90 shadow-sm hover:shadow-lg hover:border-slate-300'
                    } rounded-[22px] overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-0.5 cursor-pointer group/card relative`}
                  >
                    {/* Item Image with Floating Points Badge */}
                    <div
                      className="relative h-28 sm:h-32 w-full overflow-hidden"
                      style={{
                        background: isDarkTheme
                          ? `radial-gradient(circle at center, ${safeAccentFill}22 0%, #090D16 100%)`
                          : `radial-gradient(circle at center, ${brandSecondary}35 0%, #F1F5F9 100%)`,
                      }}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-14 h-14 rounded-2xl bg-white/80 dark:bg-slate-900/70 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-md flex items-center justify-center text-3xl group-hover/card:scale-110 transition-transform duration-300">
                            🍔
                          </div>
                        </div>
                      )}

                      {/* Earned Points Badge (Top Right) */}
                      {earnedPoints > 0 && (
                        <div
                          className={`absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-md ${
                            safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                          }`}
                          style={{
                            backgroundColor: safeAccentFill,
                            color: safeAccentFillContrast,
                          }}
                        >
                          +{earnedPoints} نقطة
                        </div>
                      )}

                      {/* Cart Quantity Badge (Top Left) */}
                      {cartCountForItem > 0 && (
                        <div
                          className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white shadow-lg keep-white"
                          style={{ color: '#FFFFFF' }}
                        >
                          {cartCountForItem} بالسلة
                        </div>
                      )}

                      {/* Floating Circular Action (+) Button overlapping image */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasModifiers) handleOpenCustomizeModal(item);
                          else handleQuickAddToCart(item);
                        }}
                        className={`absolute bottom-2 left-2 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition transform active:scale-90 hover:scale-110 z-10 ${
                          safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                        }`}
                        style={{
                          backgroundColor: safeAccentFill,
                          color: safeAccentFillContrast,
                          boxShadow: `0 4px 14px ${safeAccentFill}50`,
                        }}
                        title={hasModifiers ? 'تخصيص الصنف' : 'إضافة سريعة'}
                      >
                        {hasModifiers ? <Sparkles className="w-4 h-4" /> : <Plus className="w-5 h-5 stroke-[2.5]" />}
                      </button>
                    </div>

                    {/* Item Info (Name, Description, Price) */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <h4 className={`font-extrabold text-xs sm:text-sm line-clamp-1 leading-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                          {item.name}
                        </h4>
                        {item.description && (
                          <p className={`text-[10px] line-clamp-2 mt-0.5 leading-relaxed ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className={`flex items-baseline justify-between pt-1.5 border-t ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                        <div className="flex items-baseline gap-1">
                          <span
                            className={`font-mono font-black text-sm sm:text-base ${
                              isDarkTheme ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {item.price}
                          </span>
                          <span className={`text-[10px] font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>ر.س</span>
                        </div>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isDarkTheme ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                          {item.category || 'وجبة'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'services' && activeModules.bookings && (() => {
        const hasModifiers = Boolean(
          selectedBookingService?.modifier_groups && selectedBookingService.modifier_groups.length > 0
        );

        const bookingStepsList: { step: 1 | 2 | 3 | 4 | 5; label: string }[] = [
          { step: 1, label: 'الخدمة' },
          ...(hasModifiers ? [{ step: 2 as const, label: 'الإضافات' }] : []),
          { step: 3, label: 'المختص' },
          { step: 4, label: 'الموعد' },
          { step: 5, label: 'التأكيد' },
        ];

        const currentStepIdx = Math.max(0, bookingStepsList.findIndex((s) => s.step === bookingStep));
        const progressPercent = bookingStepsList.length > 1
          ? (currentStepIdx / (bookingStepsList.length - 1)) * 100
          : 0;

        return (
          <div className="space-y-4 animate-fade-in pb-36">
            {/* Header Card */}
            <div className={`p-4 sm:p-5 rounded-3xl border space-y-3.5 shadow-md ${
              isDarkTheme ? 'bg-slate-900/80 border-white/[0.08] backdrop-blur-xl' : 'bg-white border-slate-200/90'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-base sm:text-lg font-black flex items-center gap-2 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  <Calendar className="w-5 h-5" style={{ color: safeAccentText }} />
                  <span>حجز المواعيد والخدمات</span>
                </h3>
              </div>

              {/* 🏢 Smart Branch Capsule (Only visible when multiple branches exist) */}
              {branches.length > 1 && (
                <div className={`flex items-center gap-2 p-1.5 rounded-2xl border ${
                  isDarkTheme ? 'bg-white/[0.03] border-white/[0.07]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className={`flex items-center gap-1.5 px-2 text-xs font-bold shrink-0 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    <Building2 className="w-3.5 h-3.5" style={{ color: safeAccentText }} />
                    <span>الفرع:</span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                    {branches.map((b) => {
                      const isSel = selectedBranch?.id === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBranch(b)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 border ${
                            isSel
                              ? `shadow-md font-black scale-[1.02] ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                              : isDarkTheme
                              ? 'bg-white/[0.04] text-slate-400 hover:text-white border-white/[0.06]'
                              : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200'
                          }`}
                          style={isSel ? { backgroundColor: safeAccentFill, borderColor: safeAccentFill, color: safeAccentFillContrast } : undefined}
                        >
                          <span>{b.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 🚀 Sleek Horizontal Stepper */}
              {!bookingSuccessData && (
                <div className="pt-1 pb-1 px-2">
                  <div className="relative flex items-center justify-between">
                    {/* Background track line */}
                    <div className={`absolute top-4 left-5 right-5 h-0.5 -translate-y-1/2 z-0 ${
                      isDarkTheme ? 'bg-white/10' : 'bg-slate-200'
                    }`} />
                    {/* Active progress track line */}
                    <div
                      className="absolute top-4 right-5 h-0.5 -translate-y-1/2 z-0 transition-all duration-500 ease-out"
                      style={{
                        width: `calc(${progressPercent}% * 0.85)`,
                        backgroundColor: safeAccentFill,
                      }}
                    />

                    {bookingStepsList.map((s, idx) => {
                      const isCurrent = bookingStep === s.step;
                      const isPast = bookingStep > s.step;
                      const canClick =
                        s.step === 1 ||
                        (s.step <= bookingStep) ||
                        (s.step === 2 && selectedBookingService && hasModifiers) ||
                        (s.step === 3 && selectedBookingService) ||
                        (s.step === 4 && selectedBookingService) ||
                        (s.step === 5 && selectedBookingService && selectedBookingTime);

                      return (
                        <button
                          key={s.step}
                          type="button"
                          disabled={!canClick}
                          onClick={() => {
                            if (canClick) setBookingStep(s.step);
                          }}
                          className={`relative z-10 flex flex-col items-center gap-1.5 transition-all duration-300 ${
                            !canClick ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:scale-105'
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 ${
                              isCurrent
                                ? `shadow-lg scale-110 ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                                : isPast
                                ? 'bg-emerald-500 text-white keep-white border border-emerald-600 shadow-sm'
                                : isDarkTheme
                                ? 'bg-slate-900 text-slate-400 border border-white/15'
                                : 'bg-slate-100 text-slate-600 border border-slate-300'
                            }`}
                            style={
                              isCurrent
                                ? {
                                    backgroundColor: safeAccentFill,
                                    color: safeAccentFillContrast,
                                    boxShadow: `0 4px 14px ${safeAccentFill}45`,
                                  }
                                : undefined
                            }
                          >
                            {isPast ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                          </div>
                          <span
                            className={`text-[11px] transition-colors duration-200 ${
                              isCurrent
                                ? 'font-black'
                                : isPast
                                ? isDarkTheme ? 'font-bold text-emerald-400' : 'font-bold text-emerald-700'
                                : isDarkTheme ? 'font-bold text-slate-400' : 'font-bold text-slate-500'
                            }`}
                            style={isCurrent ? { color: safeAccentText } : undefined}
                          >
                            {s.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {bookingSuccessData ? (
              <div className={`p-6 rounded-3xl border border-emerald-500/40 text-center space-y-4 shadow-2xl animate-fade-in ${
                isDarkTheme ? 'bg-white/[0.03] backdrop-blur-xl' : 'bg-white'
              }`}>
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 mx-auto text-3xl shadow-inner">
                  {bookingSuccessData.status === 'confirmed' ? '✅' : bookingSuccessData.status === 'cancelled' ? '❌' : '⏳'}
                </div>
                <div>
                  <span
                    className={`px-3 py-0.5 rounded-full text-[10px] font-black ${
                      bookingSuccessData.status === 'confirmed'
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : bookingSuccessData.status === 'cancelled'
                        ? 'bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400'
                        : 'border animate-pulse'
                    }`}
                    style={
                      bookingSuccessData.status !== 'confirmed' && bookingSuccessData.status !== 'cancelled'
                        ? {
                            backgroundColor: `${safeAccentFill}15`,
                            borderColor: `${safeAccentFill}40`,
                            color: safeAccentText,
                          }
                        : undefined
                    }
                  >
                    {bookingSuccessData.status === 'confirmed'
                      ? 'تم تأكيد الموعد رسمياً ✅'
                      : bookingSuccessData.status === 'cancelled'
                      ? 'تم الاعتذار عن الموعد ❌'
                      : 'تم استلام الحجز وبانتظار التأكيد ⏳'}
                  </span>
                  <h3 className={`text-lg font-black mt-1.5 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    حجز موعد برقم <span dir="ltr" className="font-mono" style={{ color: safeAccentText }}>#BKG-{String(bookingSuccessData.booking_number || '').replace(/^BKG-/i, '').slice(-6).toUpperCase()}</span>
                  </h3>
                </div>

                <div className={`p-4 rounded-2xl border text-xs space-y-2 text-right ${
                  isDarkTheme ? 'bg-white/[0.02] border-white/[0.07]' : 'bg-slate-50 border-slate-200'
                }`}>
                  {bookingSuccessData.branch_name && (
                    <div className="flex justify-between">
                      <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>الفرع:</span>
                      <span className="font-bold text-amber-500">📍 {bookingSuccessData.branch_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>الخدمة:</span>
                    <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{bookingSuccessData.service_name}</span>
                  </div>
                  {bookingSuccessData.selected_modifiers && bookingSuccessData.selected_modifiers.length > 0 && (
                    <div className="flex justify-between items-start gap-2">
                      <span className={`shrink-0 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>الإضافات والترقيات:</span>
                      <span className="font-bold text-left" style={{ color: safeAccentText }}>
                        {bookingSuccessData.selected_modifiers.map((m: any) => m.name).join('، ')}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>المختص:</span>
                    <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{bookingSuccessData.specialist_name || 'أي مختص متاح'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>التاريخ والوقت:</span>
                    <span dir="ltr" className={`font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{bookingSuccessData.booking_date} | {bookingSuccessData.booking_time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>مدة الخدمة:</span>
                    <span className={`font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>{bookingSuccessData.duration_minutes || 30} دقيقة</span>
                  </div>
                  <div className={`flex justify-between pt-2 border-t ${isDarkTheme ? 'border-white/[0.07]' : 'border-slate-200'}`}>
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>المبلغ الإجمالي:</span>
                    <span className={`font-mono font-black text-sm ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{bookingSuccessData.total_price || bookingSuccessData.service_price || 0} ر.س</span>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setBookingSuccessData(null);
                      setSelectedBookingService(null);
                      setSelectedServiceModifiers({});
                      setSelectedBookingSpecialist(null);
                      setBookingStep(1);
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition border ${
                      isDarkTheme
                        ? 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border-white/10'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm'
                    }`}
                  >
                    حجز موعد آخر
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* 💇 Step 1: Select Service (Luxury Cards with Circular Image) */}
                {bookingStep === 1 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className={`text-xs font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>الخطوة 1: اختر الخدمة المطلوبة للحجز:</span>
                    </div>

                    {availableServiceItems.length === 0 ? (
                      <div className={`p-8 text-center rounded-3xl border space-y-2 ${
                        isDarkTheme ? 'bg-white/[0.02] border-white/[0.07]' : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                        <Scissors className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className={`text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>لا توجد خدمات متاحة للحجز حالياً.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5">
                        {availableServiceItems.map((srv) => {
                          const isSelected = selectedBookingService?.id === srv.id;
                          const earnedPoints = Math.floor(srv.price * (store.points_per_riyal || 1));
                          const hasServiceModifiers = Boolean(srv.modifier_groups && srv.modifier_groups.length > 0);

                          return (
                            <div
                              key={srv.id}
                              onClick={() => handleSelectServiceForBooking(srv)}
                              className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all duration-300 flex items-center justify-between gap-3 ${
                                isSelected
                                  ? 'shadow-lg ring-2'
                                  : isDarkTheme
                                  ? 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.07] hover:border-white/15 backdrop-blur-md'
                                  : 'bg-white hover:bg-slate-50 border-slate-200/90 shadow-sm hover:border-slate-300'
                              }`}
                              style={
                                isSelected
                                  ? {
                                      backgroundColor: `${safeAccentFill}10`,
                                      borderColor: safeAccentFill,
                                      boxShadow: `0 8px 24px ${safeAccentFill}20`,
                                    }
                                  : undefined
                              }
                            >
                              <div className="flex items-center space-x-3.5 rtl:space-x-reverse min-w-0">
                                {/* Luxury Circular Avatar/Image */}
                                <div className="relative shrink-0">
                                  {srv.image_url ? (
                                    <img
                                      src={srv.image_url}
                                      alt={srv.name}
                                      className="w-13 h-13 sm:w-14 sm:h-14 rounded-full object-cover border shadow-md"
                                      style={{ borderColor: `${safeAccentFill}40` }}
                                    />
                                  ) : (
                                    <div
                                      className="w-13 h-13 sm:w-14 sm:h-14 rounded-full border flex items-center justify-center text-2xl shadow-inner"
                                      style={{
                                        background: isDarkTheme
                                          ? `linear-gradient(135deg, ${brandSecondary}20 0%, #0f172a 100%)`
                                          : `linear-gradient(135deg, ${brandSecondary}25 0%, #F8FAFC 100%)`,
                                        borderColor: `${safeAccentFill}35`,
                                      }}
                                    >
                                      💇‍♂️
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-1 min-w-0">
                                  <h4 className={`text-sm font-black truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{srv.name}</h4>
                                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                    {srv.category && (
                                      <span className={`px-2 py-0.5 rounded-full font-bold border ${
                                        isDarkTheme ? 'bg-white/[0.06] text-slate-300 border-white/[0.08]' : 'bg-slate-100 text-slate-700 border-slate-200'
                                      }`}>
                                        {srv.category}
                                      </span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border ${
                                      isDarkTheme ? 'bg-white/[0.04] text-slate-300 border-white/[0.06]' : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}>
                                      <Clock className="w-3 h-3" style={{ color: safeAccentText }} />
                                      <span>{srv.duration_minutes || 30} دقيقة</span>
                                    </span>
                                    {hasServiceModifiers && (
                                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30">
                                        ✨ إضافات ({srv.modifier_groups?.length})
                                      </span>
                                    )}
                                    {earnedPoints > 0 && (
                                      <span
                                        className="font-mono font-bold"
                                        style={{ color: safeAccentText }}
                                      >
                                        +{earnedPoints} نقطة
                                      </span>
                                    )}
                                  </div>
                                  {srv.description && (
                                    <p className={`text-[11px] line-clamp-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{srv.description}</p>
                                  )}
                                </div>
                              </div>

                              <div className="text-left shrink-0 pl-1">
                                <div className={`text-base font-black font-mono ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                                  {srv.price} <span className={`text-[10px] font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>ر.س</span>
                                </div>
                                <span
                                  className={`inline-block mt-1 text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${
                                    isSelected
                                      ? `shadow-sm ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                                      : isDarkTheme
                                      ? 'text-slate-300 bg-white/[0.05] border-white/10 hover:text-white'
                                      : 'text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200'
                                  }`}
                                  style={
                                    isSelected
                                      ? {
                                          backgroundColor: safeAccentFill,
                                          borderColor: safeAccentFill,
                                          color: safeAccentFillContrast,
                                        }
                                      : undefined
                                  }
                                >
                                  {hasServiceModifiers ? 'تخصيص وحجز ➔' : 'اختر الخدمة ➔'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ✨ Step 2: Modifiers & Extras */}
                {bookingStep === 2 && selectedBookingService && (
                  <div className="space-y-4 animate-fade-in">
                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs ${
                      isDarkTheme ? 'bg-white/[0.03] border-white/[0.07] backdrop-blur-md' : 'bg-white border-slate-200 shadow-sm'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>الخدمة الأساسية:</span>
                        <strong className={isDarkTheme ? 'text-white' : 'text-slate-900'}>{selectedBookingService.name}</strong>
                        <span className={`font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>({selectedBookingService.price} ر.س)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBookingStep(1)}
                        className={`font-bold ${isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        تغيير الخدمة
                      </button>
                    </div>

                    <div className="flex items-center justify-between px-1">
                      <span className={`text-xs font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>الخطوة {currentStepIdx + 1}: حدد الإضافات والترقيات لجلسة الخدمة:</span>
                      <span className={`text-[10px] ${isDarkTheme ? 'text-slate-500' : 'text-slate-400'}`}>(اختياري أو حسب الرغبة)</span>
                    </div>

                    {selectedBookingService.modifier_groups && selectedBookingService.modifier_groups.length > 0 ? (
                      <div className="space-y-3">
                        {selectedBookingService.modifier_groups.map((group) => {
                          const currentSelected = selectedServiceModifiers[group.id] || [];

                          return (
                            <div
                              key={group.id}
                              className={`p-4 rounded-2xl border space-y-2.5 ${
                                isDarkTheme ? 'bg-white/[0.03] border-white/[0.07] backdrop-blur-md' : 'bg-white border-slate-200 shadow-sm'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <h4 className={`text-xs font-black flex items-center gap-1.5 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                                  <span>{group.name}</span>
                                  {group.required && (
                                    <span className="text-[10px] text-rose-500 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded">
                                      إجباري
                                    </span>
                                  )}
                                </h4>
                                <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {group.allow_multiple
                                    ? group.max_selections
                                      ? `حد أقصى ${group.max_selections}`
                                      : 'اختيارات متعددة'
                                    : 'اختر واحداً'}
                                </span>
                              </div>

                              <div className="space-y-1.5">
                                {group.options.map((option) => {
                                  const isSelected = currentSelected.some((o) => o.id === option.id);

                                  return (
                                    <div
                                      key={option.id}
                                      onClick={() => handleToggleServiceModifierOption(group, option)}
                                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                                        isSelected
                                          ? (isDarkTheme ? 'text-white' : 'text-slate-900 font-bold')
                                          : isDarkTheme
                                          ? 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06] text-slate-300'
                                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                                      }`}
                                      style={
                                        isSelected
                                          ? {
                                              backgroundColor: `${safeAccentFill}12`,
                                              borderColor: safeAccentFill,
                                            }
                                          : undefined
                                      }
                                    >
                                      <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                                        <div
                                          className={`w-4 h-4 rounded-${group.allow_multiple ? 'md' : 'full'} border flex items-center justify-center transition shrink-0 ${
                                            isSelected
                                              ? `border-transparent ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                                              : isDarkTheme
                                              ? 'border-slate-600 bg-slate-900'
                                              : 'border-slate-300 bg-white'
                                          }`}
                                          style={
                                            isSelected
                                              ? {
                                                  backgroundColor: safeAccentFill,
                                                  borderColor: safeAccentFill,
                                                  color: safeAccentFillContrast,
                                                }
                                              : undefined
                                          }
                                        >
                                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                        </div>
                                        <span className="text-xs font-bold">{option.name}</span>
                                      </div>

                                      <span
                                        className="text-xs font-mono font-bold"
                                        style={option.price_delta > 0 ? { color: safeAccentText } : { color: '#94a3b8' }}
                                      >
                                        {option.price_delta > 0 ? `+${option.price_delta} ر.س` : 'مجاناً'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={`p-4 rounded-2xl border text-center text-xs ${
                        isDarkTheme ? 'bg-white/[0.02] border-white/[0.06] text-slate-400' : 'bg-white border-slate-200 text-slate-500 shadow-sm'
                      }`}>
                        لا توجد إضافات مخصصة لهذه الخدمة. يمكنك المتابعة مباشرة لاختيار المختص.
                      </div>
                    )}

                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                      isDarkTheme ? 'bg-white/[0.03] border-white/[0.07] backdrop-blur-md' : 'bg-white border-slate-200 shadow-sm'
                    }`}>
                      <div>
                        <span className={`text-[11px] block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>الإجمالي الحالي للخدمة:</span>
                        <strong className={`text-base font-black font-mono ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                          {calculateServiceBookingPrice()} ر.س
                        </strong>
                      </div>

                      <button
                        type="button"
                        onClick={() => setBookingStep(3)}
                        className={`py-2.5 px-5 rounded-xl font-black text-xs shadow-md transition flex items-center gap-1.5 ${
                          safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                        }`}
                        style={{
                          backgroundColor: safeAccentFill,
                          color: safeAccentFillContrast,
                          boxShadow: `0 6px 18px ${safeAccentFill}40`,
                        }}
                      >
                        <span>متابعة لاختيار المختص ➔</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 👤 Step 3: Select Specialist */}
                {bookingStep === 3 && selectedBookingService && (() => {
                  const serviceCategory = selectedBookingService.category?.trim();
                  const targetBranchId = selectedBranch?.id || null;
                  const qualifiedSpecialists = specialists.filter((s) => {
                    if (s.is_active === false) return false;
                    // 🛡️ Strict Branch Isolation: only show specialists assigned to this branch or available in all branches
                    if (targetBranchId && (s.branch_id || s.branch_name)) {
                      const matches =
                        s.branch_id === targetBranchId ||
                        (selectedBranch?.name && (s.branch_name === selectedBranch.name || s.branch_id === selectedBranch.name));
                      if (!matches) return false;
                    }
                    if (!s.service_categories || s.service_categories.length === 0 || s.service_categories.includes('ALL')) {
                      return true;
                    }
                    return s.service_categories.includes(serviceCategory);
                  });

                  const hasServiceModifiers = Boolean(
                    selectedBookingService.modifier_groups && selectedBookingService.modifier_groups.length > 0
                  );

                  return (
                    <div className="space-y-3 animate-fade-in">
                      <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                        isDarkTheme ? 'bg-white/[0.03] border-white/[0.07] backdrop-blur-md' : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>الخدمة:</span>
                          <strong className={isDarkTheme ? 'text-white' : 'text-slate-900'}>{selectedBookingService.name}</strong>
                          <span className={`font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>({selectedBookingService.duration_minutes || 30} د)</span>
                          <span className={`font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>({calculateServiceBookingPrice()} ر.س)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBookingStep(hasServiceModifiers ? 2 : 1)}
                          className={`font-bold ${isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          {hasServiceModifiers ? 'تعديل الإضافات' : 'تغيير الخدمة'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between px-1">
                        <span className={`text-xs font-bold block ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>الخطوة {currentStepIdx + 1}: حدد المختص المؤهل في قسم ({serviceCategory}):</span>
                        <span
                          className="text-[10px] px-2.5 py-0.5 rounded-full border font-bold"
                          style={{
                            color: safeAccentText,
                            backgroundColor: `${safeAccentFill}12`,
                            borderColor: `${safeAccentFill}30`,
                          }}
                        >
                          {qualifiedSpecialists.length} مختص متاح
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        {/* Express / Any Available Specialist */}
                        <div
                          onClick={() => {
                            setSelectedBookingSpecialist(null);
                            setBookingStep(4);
                          }}
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-300 flex items-center justify-between ${
                            selectedBookingSpecialist === null
                              ? 'shadow-lg ring-2'
                              : isDarkTheme
                              ? 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.07] hover:border-white/15'
                              : 'bg-white hover:bg-slate-50 border-slate-200/90 shadow-sm hover:border-slate-300'
                          }`}
                          style={
                            selectedBookingSpecialist === null
                              ? {
                                  backgroundColor: `${safeAccentFill}08`,
                                  borderColor: safeAccentFill,
                                  boxShadow: `0 8px 24px ${safeAccentFill}18`,
                                }
                              : undefined
                          }
                        >
                          <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                            <div
                              className="w-12 h-12 rounded-full border flex items-center justify-center text-xl shadow-inner shrink-0"
                              style={{
                                background: isDarkTheme
                                  ? `linear-gradient(135deg, ${brandSecondary}20 0%, #0f172a 100%)`
                                  : `linear-gradient(135deg, ${brandSecondary}25 0%, #F8FAFC 100%)`,
                                borderColor: `${safeAccentFill}35`,
                                color: safeAccentText,
                              }}
                            >
                              ⚡
                            </div>
                            <div>
                              <h4 className={`text-xs sm:text-sm font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>أي مختص متاح في قسم ({serviceCategory})</h4>
                              <p className={`text-[10px] mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>سيتم التنسيق مع أول موظف متاح فور حضورك (الأسرع للحجز)</p>
                            </div>
                          </div>
                          <span
                            className={`text-xs font-black shrink-0 px-3 py-1.5 rounded-full border ${
                              selectedBookingSpecialist === null && safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                            }`}
                            style={
                              selectedBookingSpecialist === null
                                ? {
                                    backgroundColor: safeAccentFill,
                                    borderColor: safeAccentFill,
                                    color: safeAccentFillContrast,
                                  }
                                : {
                                    color: safeAccentText,
                                    backgroundColor: `${safeAccentFill}12`,
                                    borderColor: `${safeAccentFill}30`,
                                  }
                            }
                          >
                            اختيار ➔
                          </span>
                        </div>

                        {/* Specific Specialists */}
                        {qualifiedSpecialists.map((spec) => {
                          const isSelected = selectedBookingSpecialist?.id === spec.id;
                          return (
                            <div
                              key={spec.id}
                              onClick={() => {
                                setSelectedBookingSpecialist(spec);
                                setBookingStep(4);
                              }}
                              className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-300 flex items-center justify-between ${
                                isSelected
                                  ? 'shadow-lg ring-2'
                                  : isDarkTheme
                                  ? 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.07] hover:border-white/15'
                                  : 'bg-white hover:bg-slate-50 border-slate-200/90 shadow-sm hover:border-slate-300'
                              }`}
                              style={
                                isSelected
                                  ? {
                                      backgroundColor: `${safeAccentFill}08`,
                                      borderColor: safeAccentFill,
                                      boxShadow: `0 8px 24px ${safeAccentFill}18`,
                                    }
                                  : undefined
                              }
                            >
                              <div className="flex items-center space-x-3.5 rtl:space-x-reverse min-w-0">
                                {spec.avatar_url ? (
                                  <img
                                    src={spec.avatar_url}
                                    alt={spec.name}
                                    className="w-12 h-12 rounded-full object-cover border shrink-0 shadow-md"
                                    style={{ borderColor: `${safeAccentFill}40` }}
                                  />
                                ) : (
                                  <div
                                    className="w-12 h-12 rounded-full border flex items-center justify-center font-black text-base shrink-0 shadow-inner"
                                    style={{
                                      background: isDarkTheme
                                        ? `linear-gradient(135deg, ${brandSecondary}20 0%, #0f172a 100%)`
                                        : `linear-gradient(135deg, ${brandSecondary}25 0%, #F8FAFC 100%)`,
                                      borderColor: `${safeAccentFill}35`,
                                      color: safeAccentText,
                                    }}
                                  >
                                    {spec.name.slice(0, 1)}
                                  </div>
                                )}
                                <div className="min-w-0 space-y-0.5">
                                  <h4 className={`text-xs sm:text-sm font-black truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{spec.name}</h4>
                                  <p className="text-[10px] font-bold" style={{ color: safeAccentText }}>{spec.specialty || 'أخصائي خدمة'}</p>
                                  {spec.service_categories && spec.service_categories.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                      {spec.service_categories.map((cat, idx) => (
                                        <span
                                          key={idx}
                                          className={`text-[9px] px-2 py-0.5 rounded-full border ${
                                            isDarkTheme ? 'bg-white/[0.05] text-slate-300 border-white/[0.06]' : 'bg-slate-100 text-slate-600 border-slate-200'
                                          }`}
                                        >
                                          {cat === 'ALL' ? '⭐ جميع الأقسام' : cat}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <span
                                className={`text-xs font-bold px-3 py-1.5 rounded-full border shrink-0 transition ${
                                  isSelected
                                    ? `${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                                    : isDarkTheme ? 'text-slate-300 bg-white/[0.05] border-white/10' : 'text-slate-700 bg-slate-100 border-slate-200'
                                }`}
                                style={
                                  isSelected
                                    ? {
                                        backgroundColor: safeAccentFill,
                                        borderColor: safeAccentFill,
                                        color: safeAccentFillContrast,
                                      }
                                    : undefined
                                }
                              >
                                اختيار ➔
                              </span>
                            </div>
                          );
                        })}

                        {qualifiedSpecialists.length === 0 && (
                          <div className={`p-4 rounded-2xl border text-xs text-center space-y-1 ${
                            isDarkTheme ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                          }`}>
                            <p className="font-bold">جميع مقدمي الخدمة متاحون لخدمتك في هذا القسم</p>
                            <p className={`text-[11px] ${isDarkTheme ? 'text-amber-400/80' : 'text-amber-700'}`}>اختر "أي مختص متاح" للمتابعة وتأكيد موعدك مباشرة.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 📅 Step 4: Date & Time Slot Selection */}
                {bookingStep === 4 && selectedBookingService && (() => {
                  const selectedDateObj = new Date(selectedBookingDate + 'T00:00:00');
                  const dayOfWeekIndex = selectedDateObj.getDay();
                  const dayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeekIndex];
                  const dayArabicName = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][dayOfWeekIndex];

                  const isSpecialistOffToday = Boolean(
                    selectedBookingSpecialist &&
                    selectedBookingSpecialist.working_days &&
                    !selectedBookingSpecialist.working_days.includes(dayKey)
                  );

                  const rawStart = selectedBookingSpecialist?.working_hours?.start || '10:00';
                  const rawEnd = selectedBookingSpecialist?.working_hours?.end || '22:00';
                  const startHour = parseInt(rawStart.split(':')[0], 10) || 10;
                  const endHour = parseInt(rawEnd.split(':')[0], 10) || 22;

                  const generatedSlots: string[] = [];
                  for (let h = startHour; h < endHour; h++) {
                    const formattedHour = h < 10 ? `0${h}:00` : `${h}:00`;
                    generatedSlots.push(formattedHour);
                  }

                  const getSlotInfo = (slot: string) => {
                    if (isSpecialistOffToday) {
                      return { isBooked: true, label: 'إجازة 🏖️', canBook: false };
                    }

                    if (selectedBookingSpecialist) {
                      const existingBooking = storeBookings.find(
                        (b) =>
                          b.status !== 'cancelled' &&
                          b.booking_date === selectedBookingDate &&
                          b.booking_time === slot &&
                          (b.specialist_id === selectedBookingSpecialist.id || !b.specialist_id)
                      );

                      if (existingBooking) {
                        return { isBooked: true, label: 'محجوز 🔒', canBook: false };
                      }
                      return { isBooked: false, label: 'متاح ✨', canBook: true };
                    } else {
                      const targetBranchId = selectedBranch?.id || null;
                      const branchFilteredSpecialists = specialists.filter((s) => {
                        if (targetBranchId && (s.branch_id || s.branch_name)) {
                          const matches =
                            s.branch_id === targetBranchId ||
                            (selectedBranch?.name && (s.branch_name === selectedBranch.name || s.branch_id === selectedBranch.name));
                          if (!matches) return false;
                        }
                        return true;
                      });

                      if (branchFilteredSpecialists.length === 0) {
                        const bookedCount = storeBookings.filter(
                          (b) =>
                            b.status !== 'cancelled' &&
                            b.booking_date === selectedBookingDate &&
                            b.booking_time === slot &&
                            (!targetBranchId || !b.branch_id || b.branch_id === targetBranchId)
                        ).length;
                        const maxConcurrent = 5;
                        const isBooked = bookedCount >= maxConcurrent;
                        return {
                          isBooked,
                          label: isBooked ? 'مكتمل 🔒' : 'متاح ✨',
                          canBook: !isBooked,
                        };
                      }

                      const activeWorkingSpecs = branchFilteredSpecialists.filter(
                        (s) =>
                          s.is_active !== false &&
                          (!s.working_days || s.working_days.includes(dayKey))
                      );

                      if (activeWorkingSpecs.length === 0) {
                        return { isBooked: true, label: 'إجازة 🏖️', canBook: false };
                      }

                      const bookedCount = storeBookings.filter(
                        (b) =>
                          b.status !== 'cancelled' &&
                          b.booking_date === selectedBookingDate &&
                          b.booking_time === slot &&
                          b.specialist_id &&
                          activeWorkingSpecs.some((s) => s.id === b.specialist_id)
                      ).length;

                      const isFullyBooked = bookedCount >= activeWorkingSpecs.length;
                      if (isFullyBooked) {
                        return { isBooked: true, label: 'محجوز بالكامل 🔒', canBook: false };
                      }
                      return {
                        isBooked: false,
                        label: `${activeWorkingSpecs.length - bookedCount} متاح ✨`,
                        canBook: true,
                      };
                    }
                  };

                  const currentSlotCheck = getSlotInfo(selectedBookingTime);
                  const canProceed = currentSlotCheck.canBook && !isSpecialistOffToday;

                  return (
                    <div className="space-y-4 animate-fade-in">
                      <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                        isDarkTheme ? 'bg-white/[0.03] border-white/[0.07] backdrop-blur-md' : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>المختص:</span>
                          <strong style={{ color: safeAccentText }}>
                            {selectedBookingSpecialist?.name || 'أي مختص متاح (الأسرع)'}
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBookingStep(3)}
                          className={`font-bold ${isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          تغيير المختص
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold block px-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>الخطوة {currentStepIdx + 1}: اختر يوم ووقت الحضور:</span>
                        <span className={`text-[10px] font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                          ساعات العمل: <span dir="ltr" className="font-mono">{rawStart} - {rawEnd}</span>
                        </span>
                      </div>

                      {/* Day Selector */}
                      <div className="space-y-1.5">
                        <label className={`text-[11px] font-bold block ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>اختر اليوم:</label>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                          {Array.from({ length: 7 }).map((_, i) => {
                            const d = new Date();
                            d.setDate(d.getDate() + i);
                            const iso = d.toISOString().split('T')[0];
                            const dayName = i === 0 ? 'اليوم' : i === 1 ? 'غداً' : d.toLocaleDateString('ar-SA', { weekday: 'short' });
                            const dateFormatted = d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
                            const isSelected = selectedBookingDate === iso;

                            return (
                              <button
                                key={iso}
                                type="button"
                                onClick={() => setSelectedBookingDate(iso)}
                                className={`p-2.5 rounded-2xl text-center shrink-0 min-w-[74px] border transition-all duration-200 ${
                                  isSelected
                                    ? `shadow-lg font-black scale-105 ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                                    : isDarkTheme
                                    ? 'bg-white/[0.03] border-white/[0.07] text-slate-300 hover:text-white hover:border-white/20'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
                                }`}
                                style={
                                  isSelected
                                    ? {
                                        backgroundColor: safeAccentFill,
                                        borderColor: safeAccentFill,
                                        color: safeAccentFillContrast,
                                        boxShadow: `0 4px 14px ${safeAccentFill}35`,
                                      }
                                    : undefined
                                }
                              >
                                <span className="text-[11px] block">{dayName}</span>
                                <span className="text-xs font-bold block mt-0.5">{dateFormatted}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {isSpecialistOffToday && selectedBookingSpecialist && (
                        <div className={`p-3 rounded-2xl border text-xs flex items-center gap-2 ${
                          isDarkTheme ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                        }`}>
                          <AlertCircle className="w-4 h-4 shrink-0" style={{ color: safeAccentText }} />
                          <span>
                            المختص ({selectedBookingSpecialist.name}) في إجازة أسبوعية يوم ({dayArabicName}). يرجى اختيار يوم آخر أو اختيار &quot;أي مختص متاح&quot;.
                          </span>
                        </div>
                      )}

                      {/* Time Slots Grid */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className={`text-[11px] font-bold block ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                            اختر الموعد المناسب (<span dir="ltr" className="font-mono">{selectedBookingDate}</span>):
                          </label>
                          <span className={`text-[10px] ${isDarkTheme ? 'text-slate-500' : 'text-slate-400'}`}>
                            (المواعيد المحجوزة تُغلق تلقائياً 🔒)
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          {generatedSlots.map((slot) => {
                            const slotInfo = getSlotInfo(slot);
                            const isSelected = selectedBookingTime === slot && slotInfo.canBook;

                            if (!slotInfo.canBook) {
                              return (
                                <button
                                  key={slot}
                                  type="button"
                                  disabled={true}
                                  className={`py-2.5 px-1.5 rounded-xl border line-through cursor-not-allowed flex flex-col items-center justify-center opacity-40 transition ${
                                    isDarkTheme ? 'border-white/[0.04] bg-white/[0.01] text-slate-600' : 'border-slate-200 bg-slate-100 text-slate-400'
                                  }`}
                                  title="هذا الموعد محجوز مسبقاً وغير متاح"
                                >
                                  <span className="font-mono text-xs font-bold">{slot}</span>
                                  <span className="text-[9px] text-rose-500 mt-0.5">{slotInfo.label}</span>
                                </button>
                              );
                            }

                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => setSelectedBookingTime(slot)}
                                className={`py-2.5 px-1.5 rounded-xl border flex flex-col items-center justify-center transition-all duration-200 shadow-sm ${
                                  isSelected
                                    ? `shadow-md scale-[1.03] font-black ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                                    : isDarkTheme
                                    ? 'bg-white/[0.03] border-white/[0.07] text-slate-200 hover:text-white'
                                    : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                                }`}
                                style={
                                  isSelected
                                    ? {
                                        backgroundColor: safeAccentFill,
                                        borderColor: safeAccentFill,
                                        color: safeAccentFillContrast,
                                        boxShadow: `0 4px 14px ${safeAccentFill}35`,
                                      }
                                    : undefined
                                }
                              >
                                <span className="font-mono text-xs font-bold">{slot}</span>
                                <span className={`text-[9px] mt-0.5 ${isSelected ? 'font-black' : 'text-emerald-600 dark:text-emerald-400 font-bold'}`}>
                                  {isSelected ? 'محدد ✓' : slotInfo.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={!canProceed}
                        onClick={() => setBookingStep(5)}
                        className={`w-full py-3.5 rounded-2xl font-black text-xs shadow-lg transition mt-2 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                          safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                        }`}
                        style={{
                          backgroundColor: safeAccentFill,
                          color: safeAccentFillContrast,
                          boxShadow: `0 8px 24px ${safeAccentFill}30`,
                        }}
                      >
                        <span>{canProceed ? `متابعة لتأكيد موعد الساعة (${selectedBookingTime}) ➔` : 'يرجى تحديد موعد متاح للمتابعة'}</span>
                      </button>
                    </div>
                  );
                })()}

                {/* ✅ Step 5: Final Confirmation & Summary */}
                {bookingStep === 5 && selectedBookingService && (() => {
                  const finalTotalPrice = calculateServiceBookingPrice();
                  const flatModifiers = getFlatSelectedServiceModifiers();
                  const pointsToEarn = Math.floor(finalTotalPrice * (store.points_per_riyal || 1));

                  return (
                    <div className="space-y-4 animate-fade-in">
                      <div className={`p-4 sm:p-5 rounded-3xl border space-y-3.5 text-xs shadow-sm ${
                        isDarkTheme ? 'bg-white/[0.03] border-white/[0.08] backdrop-blur-xl' : 'bg-white border-slate-200'
                      }`}>
                        <h4 className={`font-black text-sm pb-2.5 border-b flex items-center gap-2 ${
                          isDarkTheme ? 'text-white border-white/[0.07]' : 'text-slate-900 border-slate-100'
                        }`}>
                          <BookmarkCheck className="w-4 h-4" style={{ color: safeAccentText }} />
                          <span>ملخص تفاصيل الموعد والخدمة:</span>
                        </h4>

                        <div className="flex justify-between">
                          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>الخدمة:</span>
                          <strong className={isDarkTheme ? 'text-white' : 'text-slate-900'}>{selectedBookingService.name}</strong>
                        </div>

                        <div className="flex justify-between">
                          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>القسم:</span>
                          <span className={`font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>{selectedBookingService.category}</span>
                        </div>

                        {flatModifiers.length > 0 && (
                          <div className={`pt-2 pb-1 border-t space-y-1.5 ${isDarkTheme ? 'border-white/[0.07]' : 'border-slate-100'}`}>
                            <span className={`block font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>الإضافات والترقيات المختارة:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {flatModifiers.map((mod, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2.5 py-1 rounded-full border text-[11px] font-bold flex items-center gap-1 ${
                                    isDarkTheme ? 'bg-white/[0.05] border-white/[0.08] text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-700'
                                  }`}
                                >
                                  <span>{mod.name}</span>
                                  <span className="font-mono" style={{ color: safeAccentText }}>
                                    {mod.price_delta > 0 ? `(+${mod.price_delta} ر.س)` : '(مجاناً)'}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className={`flex justify-between pt-2 border-t ${isDarkTheme ? 'border-white/[0.07]' : 'border-slate-100'}`}>
                          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>المختص المطلوب:</span>
                          <strong style={{ color: safeAccentText }}>
                            {selectedBookingSpecialist?.name || 'أي مختص متاح'}
                          </strong>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>اليوم والوقت:</span>
                          <strong className={isDarkTheme ? 'text-white' : 'text-slate-900'}>
                            <span dir="ltr" className="font-mono">{selectedBookingDate}</span> في تمام الساعة <span dir="ltr" className="font-mono">{selectedBookingTime}</span>
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>مدة الجلسة المتوقعة:</span>
                          <strong className={isDarkTheme ? 'text-slate-300' : 'text-slate-700'}>{selectedBookingService.duration_minutes || 30} دقيقة</strong>
                        </div>

                        <div className={`flex justify-between pt-2 border-t ${isDarkTheme ? 'border-white/[0.07]' : 'border-slate-100'}`}>
                          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>السعر الإجمالي النهائي:</span>
                          <span className={`text-base font-black font-mono ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{finalTotalPrice} ر.س</span>
                        </div>

                        <div className="flex justify-between">
                          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>النقاط المكتسبة بعد الحضور:</span>
                          <span className="text-xs font-bold" style={{ color: safeAccentText }}>+{pointsToEarn} نقطة ولاء ✨</span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className={`text-xs font-bold block ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>ملاحظات إضافية للمتجر (اختياري):</label>
                        <textarea
                          value={bookingNotes}
                          onChange={(e) => setBookingNotes(e.target.value)}
                          placeholder="مثال: يرجى تجهيز كرسي خاص، أو أي تفاصيل تخص طلبك..."
                          rows={2}
                          className={`w-full rounded-2xl px-3.5 py-2.5 text-xs outline-none border ${
                            isDarkTheme
                              ? 'bg-white/[0.03] border-white/[0.08] text-white placeholder-slate-500'
                              : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                          }`}
                        />
                      </div>

                      {/* 💳 طرق وسياسة سداد الحجز */}
                      <div className={`p-3.5 rounded-2xl border space-y-2.5 ${
                        isDarkTheme ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                        <div className={`flex items-center justify-between text-xs font-bold ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                          <span className="flex items-center gap-1.5">
                            <CreditCard className="w-4 h-4" style={{ color: safeAccentText }} />
                            <span>طريقة سداد الموعد:</span>
                          </span>
                          {effectiveBookingsPolicy === 'online_only' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 border border-emerald-500/40 font-bold">
                              🔒 سداد مسبق إلزامي
                            </span>
                          )}
                          {effectiveBookingsPolicy === 'pay_at_store_only' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 border border-amber-500/40 font-bold">
                              💵 عند الحضور بالمركز
                            </span>
                          )}
                          {effectiveBookingsPolicy === 'both' && (
                            <span className={`text-[10px] font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                              اختر طريقتك المفضلة
                            </span>
                          )}
                        </div>

                        {effectiveBookingsPolicy === 'both' ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setBookingPaymentMethod('online')}
                              className={`p-3 rounded-xl border text-right transition flex flex-col gap-0.5 ${
                                bookingPaymentMethod === 'online'
                                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300 shadow-sm ring-1 ring-emerald-500/30'
                                  : isDarkTheme
                                  ? 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <span className="text-xs font-black flex items-center gap-1">
                                <span>💳 دفع إلكتروني فوري</span>
                                {bookingPaymentMethod === 'online' && <Check className="w-3.5 h-3.5 mr-auto text-emerald-600" />}
                              </span>
                              <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>تأكيد الموعد والمقعد 100%</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setBookingPaymentMethod('pay_at_store')}
                              className={`p-3 rounded-xl border text-right transition flex flex-col gap-0.5 ${
                                bookingPaymentMethod === 'pay_at_store'
                                  ? 'bg-amber-500/15 border-amber-500 text-amber-800 dark:text-amber-300 shadow-sm ring-1 ring-amber-500/30'
                                  : isDarkTheme
                                  ? 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <span className="text-xs font-black flex items-center gap-1">
                                <span>💵 عند الحضور بالمركز</span>
                                {bookingPaymentMethod === 'pay_at_store' && <Check className="w-3.5 h-3.5 mr-auto text-amber-600" />}
                              </span>
                              <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>نقداً أو شبكة بالاستقبال</span>
                            </button>
                          </div>
                        ) : effectiveBookingsPolicy === 'online_only' ? (
                          <div className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                            isDarkTheme ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          }`}>
                            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>يشترط المركز السداد الإلكتروني المسبق لتأكيد الموعد وضمان عدم تضارب الجداول.</span>
                          </div>
                        ) : (
                          <div className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                            isDarkTheme ? 'bg-white/[0.03] border-white/[0.08] text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                          }`}>
                            <span className="text-base">💵</span>
                            <span>يتم سداد قيمة الخدمة في صالة الاستقبال بالمركز عند موعد حضورك.</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 pt-1">
                        <button
                          type="button"
                          onClick={handleConfirmServiceBooking}
                          disabled={bookingSubmitting}
                          className={`w-full py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition hover:scale-[1.01] active:scale-95 disabled:opacity-50 ${
                            safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                          }`}
                          style={{
                            backgroundColor: safeAccentFill,
                            color: safeAccentFillContrast,
                            boxShadow: `0 10px 25px ${safeAccentFill}35`,
                          }}
                        >
                          {bookingSubmitting ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (effectiveBookingsPolicy === 'online_only' || (effectiveBookingsPolicy === 'both' && bookingPaymentMethod === 'online')) ? (
                            <CreditCard className="w-4 h-4" />
                          ) : (
                            <BookmarkCheck className="w-4 h-4" />
                          )}
                          <span>
                            {bookingSubmitting
                              ? 'جاري تسجيل الموعد...'
                              : (effectiveBookingsPolicy === 'online_only' || (effectiveBookingsPolicy === 'both' && bookingPaymentMethod === 'online'))
                              ? `سداد الجلسة (${finalTotalPrice} ر.س) وتأكيد الحجز 💳`
                              : 'تأكيد الحجز المباشر ✅'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setBookingStep(4)}
                          className={`w-full py-2 text-xs font-bold text-center ${isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          الرجوع لتعديل الموعد أو الوقت
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* 📋 Active and Past Bookings (مواعيدي السابقة والقادمة) */}
            <div className={`mt-8 pt-6 border-t space-y-4 ${isDarkTheme ? 'border-white/[0.08]' : 'border-slate-200'}`}>
              <h3 className={`text-sm font-black flex items-center gap-2 ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                <Calendar className="w-4 h-4" style={{ color: safeAccentText }} />
                <span>مواعيدي السابقة والقادمة (تحديث مباشر)</span>
              </h3>
              
              {customerServiceBookings.length === 0 ? (
                <div className={`py-8 text-center space-y-2 rounded-3xl border ${
                  isDarkTheme ? 'text-slate-400 bg-white/[0.02] border-white/[0.06]' : 'text-slate-500 bg-white border-slate-200 shadow-sm'
                }`}>
                  <Calendar className="w-8 h-8 mx-auto text-slate-400" />
                  <p className="text-xs">لا توجد مواعيد مسجلة برقمك حتى الآن.</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {customerServiceBookings.map((bk: any) => {
                    const isLive = ['pending', 'confirmed'].includes(bk.status);
                    const isConfirmed = bk.status === 'confirmed';
                    const isCancelled = bk.status === 'cancelled';
                    const shortBkNum = String(bk.booking_number || bk.id || '').replace(/^BKG-/i, '').slice(-6).toUpperCase();
                    const displayBkPrice = bk.total_price ?? bk.service_price ?? 0;
                    
                    return (
                      <div
                        key={bk.id}
                        className={`p-4 sm:p-5 rounded-3xl border transition-all duration-300 shadow-md relative overflow-hidden ${
                          isDarkTheme
                            ? (isLive ? 'bg-[#0B0F19]/95 border-white/[0.12] ring-1 ring-white/[0.05]' : 'bg-[#0B0F19]/70 border-white/[0.06] opacity-90')
                            : (isLive ? 'bg-white border-slate-200/90 shadow-md ring-1 ring-slate-100' : 'bg-slate-50 border-slate-200 opacity-90')
                        }`}
                      >
                        {isLive && (
                          <div
                            className={`absolute top-0 right-0 left-0 h-1.5 ${isConfirmed ? 'bg-emerald-500 shadow-[0_0_12px_#10B981]' : 'animate-pulse'}`}
                            style={!isConfirmed ? { backgroundColor: safeAccentFill, boxShadow: `0 0 12px ${safeAccentFill}` } : undefined}
                          />
                        )}
                        
                        <div className="flex items-center justify-between mb-3.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              dir="ltr"
                              className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-black border ${
                                isDarkTheme ? 'bg-white/[0.05]' : 'bg-slate-100'
                              }`}
                              style={{
                                color: safeAccentText,
                                borderColor: `${safeAccentFill}35`,
                              }}
                            >
                              #BKG-{shortBkNum}
                            </span>
                            {bk.service_category && (
                              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                                isDarkTheme ? 'bg-white/[0.06] text-slate-300 border-white/[0.08]' : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {bk.service_category}
                              </span>
                            )}
                            {bk.payment_status === 'paid' ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1 border border-emerald-500/40">
                                💳 مسدد أونلاين ✅
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1 border border-amber-500/30">
                                💵 الدفع عند الحضور
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                            {new Date(bk.created_at).toLocaleDateString('ar-SA')}
                          </span>
                        </div>

                        {/* Live Tracking Progress Bar for Bookings */}
                        {isLive && (
                          <div className={`mb-4 p-3.5 rounded-2xl border ${
                            isDarkTheme ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-slate-200'
                          }`}>
                            <div className="flex justify-between items-end mb-2.5">
                              <div className="text-right">
                                <h4
                                  className={`text-xs sm:text-sm font-black ${
                                    isConfirmed ? 'text-emerald-600 dark:text-emerald-400' : isDarkTheme ? 'text-white' : 'text-slate-900'
                                  }`}
                                >
                                  {isConfirmed ? '✅ تم تأكيد الحجز رسمياً' : '⏳ قيد المراجعة في الاستقبال'}
                                </h4>
                                <p className={`text-[10px] mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {isConfirmed ? 'المختص بانتظارك في الموعد المحدد' : 'ننتظر تأكيد الصالون أو توفر المختص'}
                                </p>
                              </div>
                              {isConfirmed && (
                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                                  <Calendar className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                            
                            <div className={`relative h-1.5 rounded-full overflow-hidden ${isDarkTheme ? 'bg-white/[0.08]' : 'bg-slate-200'}`}>
                              <div
                                className={`absolute top-0 right-0 bottom-0 transition-all duration-1000 ${isConfirmed ? 'w-full bg-emerald-500' : 'w-1/2'}`}
                                style={!isConfirmed ? { backgroundColor: safeAccentFill } : undefined}
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* Cancelled State */}
                        {isCancelled && (
                          <div className="mb-3.5 bg-rose-500/10 p-3 rounded-2xl border border-rose-500/30 text-center">
                            <span className="text-rose-600 font-bold text-xs">❌ نعتذر، تعذر قبول الحجز أو أن المختص غير متاح</span>
                          </div>
                        )}

                        <div className={`flex justify-between items-center p-3.5 rounded-2xl border ${
                          isDarkTheme ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-slate-50 border-slate-200'
                        }`}>
                          <div className="space-y-1">
                            <div className={`text-sm font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                              {bk.service_name || 'خدمة غير محددة'}
                            </div>
                            <div className={`text-xs flex items-center gap-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                              <Clock className="w-3.5 h-3.5" style={{ color: safeAccentText }} />
                              <span dir="ltr" className={`font-mono font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>{bk.booking_date} | {bk.booking_time}</span>
                            </div>
                          </div>
                          <div className="text-left">
                            <div className={`text-base font-black font-mono ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                              {displayBkPrice} <span className={`text-[10px] font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>ر.س</span>
                            </div>
                            <div className={`text-[10px] mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                              المختص: <span className={`font-bold ${isDarkTheme ? 'text-slate-200' : 'text-slate-700'}`}>{bk.specialist_name || 'أي مختص متاح'}</span>
                            </div>
                          </div>
                        </div>

                        {!isLive && bk.status !== 'cancelled' && (
                          <div className="mt-3 text-center">
                            <span className={`text-[10px] px-3 py-1 rounded-full font-bold inline-flex items-center gap-1 ${
                              bk.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                                : isDarkTheme
                                ? 'bg-white/[0.05] text-slate-400 border border-white/[0.08]'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {bk.status === 'completed' ? '🏁 تمت الخدمة ومكتمل' : '🏖️ العميل لم يحضر'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {activeTab === 'perks' && activeModules.loyalty && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className={`text-base sm:text-lg font-black flex items-center space-x-2 rtl:space-x-reverse ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              <Gift className="w-5 h-5" style={{ color: safeAccentText }} />
              <span>العروض والامتيازات</span>
            </h3>
          </div>

          {!customer?.special_date && showSpecialDateForm && (
            <div className={`p-3.5 sm:p-4 rounded-2xl relative overflow-hidden space-y-2.5 transition-colors ${
              isDarkTheme
                ? 'bg-white/[0.03] border border-white/[0.08] backdrop-blur-md shadow-lg text-white'
                : 'bg-white border border-slate-200/90 shadow-sm text-slate-900'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎁</span>
                  <h4 className={`font-black text-xs sm:text-sm ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>وثّق يومك المفضل</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSpecialDateForm(false)}
                  className={`text-[10px] font-bold ${isDarkTheme ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'}`}
                >
                  إخفاء
                </button>
              </div>

              <p className={`text-[11px] leading-relaxed ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                سجل يومك المميز مرة واحدة (ميلادك أو زواجك) وخلي هديتك علينا! (لا يمكن تعديله لاحقاً).
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[9px] font-bold block mb-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>الشهر</label>
                  <select
                    value={specialDateMonth}
                    onChange={(e) => setSpecialDateMonth(e.target.value)}
                    className={`w-full rounded-xl px-2.5 py-1.5 text-xs outline-none ${
                      isDarkTheme
                        ? 'bg-slate-950 border border-slate-800 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white'
                    }`}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`text-[9px] font-bold block mb-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>اليوم</label>
                  <select
                    value={specialDateDay}
                    onChange={(e) => setSpecialDateDay(e.target.value)}
                    className={`w-full rounded-xl px-2.5 py-1.5 text-xs outline-none ${
                      isDarkTheme
                        ? 'bg-slate-950 border border-slate-800 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white'
                    }`}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={`text-[9px] font-bold block mb-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>المناسبة</label>
                <select
                  value={specialDateType}
                  onChange={(e) => setSpecialDateType(e.target.value)}
                  className={`w-full rounded-xl px-2.5 py-1.5 text-xs outline-none ${
                    isDarkTheme
                      ? 'bg-slate-950 border border-slate-800 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white'
                  }`}
                >
                  <option value="يوم ميلادي">يوم ميلادي 🎂</option>
                  <option value="يوم زواجي">يوم زواجي 💍</option>
                  <option value="يوم الأم">يوم الأم 👩‍👧</option>
                  <option value="يوم التخرج">يوم التخرج 🎓</option>
                  <option value="أفضل يوم بحياتي">أفضل يوم بحياتي ✨</option>
                  <option value="أخرى">أخرى (كتابة يدوية) ✍️</option>
                </select>
              </div>

              {specialDateType === 'أخرى' && (
                <div className="animate-fade-in">
                  <input
                    type="text"
                    value={specialDateTypeOther}
                    onChange={(e) => setSpecialDateTypeOther(e.target.value)}
                    placeholder="مثال: ذكرى تأسيس مشروعي"
                    className={`w-full rounded-xl px-2.5 py-1.5 text-xs outline-none ${
                      isDarkTheme
                        ? 'bg-slate-950 border border-slate-800 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white'
                    }`}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveSpecialDate}
                disabled={isSubmittingSpecialDate || (specialDateType === 'أخرى' && !specialDateTypeOther.trim())}
                className={`w-full py-2.5 rounded-xl font-black text-xs transition shadow-md active:scale-95 disabled:opacity-50 ${
                  safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                }`}
                style={{
                  backgroundColor: safeAccentFill,
                  color: safeAccentFillContrast,
                }}
              >
                {isSubmittingSpecialDate ? 'جاري الاعتماد...' : 'اعتماد وحفظ المناسبة'}
              </button>
            </div>
          )}

          {privileges.filter((p) => p.is_active && !p.is_hidden).length === 0 ? (
            <div className={`rounded-3xl p-8 border text-center space-y-3 shadow-xl ${
              isDarkTheme
                ? 'border-slate-800/80 bg-slate-900/40 backdrop-blur-xl'
                : 'border-slate-200/90 bg-white'
            }`}>
              <div
                className="w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center shadow-inner"
                style={{
                  backgroundColor: `${safeAccentFill}15`,
                  borderColor: `${safeAccentFill}30`,
                  color: safeAccentText,
                }}
              >
                <Gift className="w-7 h-7" />
              </div>
              <h4 className={`text-base font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>لا توجد عروض أو مكافآت معلنة حالياً</h4>
              <p className={`text-xs max-w-xs mx-auto leading-relaxed ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                ترقبوا قريباً أحدث الامتيازات والمكافآت الحصرية المخصصة لأعضاء برنامج ولاء {store.name} ✨
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
            {privileges
              .filter((p) => p.is_active && !p.is_hidden)
              .map((priv) => {
                const requiredTier = tiers.find((t) => t.id === priv.required_tier_id);
                const isTierUnlocked = customer
                  ? requiredTier
                    ? customer.lifetime_xp >= requiredTier.required_xp
                    : true
                  : true;

                const hasEnoughPoints = customer ? (customer.wallet_balance || 0) >= (priv.cost_points || 0) : true;
                const isSoldOut =
                  priv.quantity_limit !== null &&
                  priv.quantity_limit > 0 &&
                  (priv.redeemed_count || 0) >= priv.quantity_limit;
                const remainingStock =
                  priv.quantity_limit !== null && priv.quantity_limit > 0
                    ? Math.max(0, priv.quantity_limit - (priv.redeemed_count || 0))
                    : null;

                const customerPurchasedThisCount = customerCoupons.filter(
                  (c) => c.privilege_id === priv.id
                ).length;
                const isUserLimitReached =
                  priv.per_customer_limit !== null &&
                  priv.per_customer_limit !== undefined &&
                  priv.per_customer_limit > 0 &&
                  customerPurchasedThisCount >= priv.per_customer_limit;

                return (
                  <div
                    key={priv.id}
                    className={`rounded-3xl p-5 border transition-all duration-300 flex flex-col justify-between relative overflow-hidden shadow-xl hover:-translate-y-0.5 ${
                      isSoldOut
                        ? isDarkTheme ? 'bg-slate-950/60 border-slate-800/80 opacity-50' : 'bg-slate-100 border-slate-200 opacity-60'
                        : isUserLimitReached
                        ? isDarkTheme ? 'bg-slate-900/90 border-slate-700/60' : 'bg-white border-slate-200 shadow-sm'
                        : isTierUnlocked
                        ? isDarkTheme ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200/90 shadow-md'
                        : isDarkTheme ? 'bg-slate-950/60 border-slate-800/80 backdrop-blur-sm' : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    {priv.image_url && (
                      <div className={`w-full h-40 -mt-1 mb-3.5 rounded-2xl overflow-hidden relative border shadow-inner ${
                        isDarkTheme ? 'bg-black/40 border-slate-800/80' : 'bg-slate-100 border-slate-200/80'
                      }`}>
                        <img
                          src={priv.image_url}
                          alt={priv.title}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        {requiredTier && (
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1"
                            style={{
                              backgroundColor: `${requiredTier.badge_color || safeAccentFill}15`,
                              borderColor: `${requiredTier.badge_color || safeAccentFill}40`,
                              color: requiredTier.badge_color || safeAccentText,
                            }}
                          >
                            <Award className="w-3 h-3" />
                            <span>مكانة: {requiredTier.tier_name}</span>
                          </span>
                        )}

                        <span
                          className={`px-3 py-1 rounded-full font-mono font-black text-xs shadow-sm ${
                            safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                          }`}
                          style={{
                            backgroundColor: safeAccentFill,
                            color: safeAccentFillContrast,
                          }}
                        >
                          {priv.cost_points} نقطة
                        </span>
                      </div>

                      <div>
                        <h4 className={`font-extrabold text-base ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{priv.title}</h4>
                        {priv.description && (
                          <p className={`text-xs mt-1 leading-relaxed ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                            {priv.description}
                          </p>
                        )}
                      </div>

                      <div className={`p-3 rounded-2xl border space-y-1.5 text-[11px] ${
                        isDarkTheme
                          ? 'bg-slate-950/80 border-slate-800/80'
                          : 'bg-slate-50 border-slate-200/90'
                      }`}>
                        <div className={`flex items-center justify-between ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                          <span className={`flex items-center gap-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                            <Clock className="w-3.5 h-3.5" style={{ color: safeAccentText }} />
                            <span>ساعات الصرف:</span>
                          </span>
                          <span className={`font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                            {priv.valid_start_time && priv.valid_end_time
                              ? `${priv.valid_start_time} - ${priv.valid_end_time}`
                              : 'متاح 24/7'}
                          </span>
                        </div>

                        {priv.per_customer_limit && priv.per_customer_limit > 0 && (
                          <div className={`flex items-center justify-between ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                            <span className={`flex items-center gap-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>الحد لكل عضو:</span>
                            </span>
                            <span className="font-mono font-bold">
                              {customerPurchasedThisCount >= priv.per_customer_limit ? (
                                <span className="font-bold" style={{ color: safeAccentText }}>استنفدت الحد ({customerPurchasedThisCount}/{priv.per_customer_limit})</span>
                              ) : (
                                <span>{priv.per_customer_limit} رمز (حصلت على {customerPurchasedThisCount})</span>
                              )}
                            </span>
                          </div>
                        )}

                        {remainingStock !== null && (
                          <div className={`flex items-center justify-between ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                            <span>الكمية المتاحة:</span>
                            <span
                              className="font-mono font-bold"
                              style={{
                                color: remainingStock <= 3 ? '#F43F5E' : safeAccentText,
                              }}
                            >
                              {remainingStock} فقط
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={`mt-4 pt-3 border-t ${isDarkTheme ? 'border-slate-800' : 'border-slate-200'}`}>
                      {isSoldOut ? (
                        <button
                          disabled
                          className={`w-full py-3 rounded-2xl font-bold text-xs cursor-not-allowed ${
                            isDarkTheme ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400 border border-slate-200'
                          }`}
                        >
                          نفدت الكمية 🚫
                        </button>
                      ) : isUserLimitReached ? (
                        <div className={`p-2.5 rounded-2xl text-center text-xs font-bold border ${
                          isDarkTheme
                            ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}>
                          استنفدت الحد المسموح لك من هذا الامتياز ✓
                        </div>
                      ) : !isTierUnlocked ? (
                        <div className="text-center text-[11px] py-1.5 font-bold" style={{ color: safeAccentText }}>
                          ارتقِ إلى {requiredTier?.tier_name} لفتح هذا الامتياز
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (!customer) {
                              setPendingAuthAction({ type: 'REDEEM_PRIVILEGE', privilege: priv });
                              setShowLoginModal(true);
                              return;
                            }
                            setPurchaseError(null);
                            setPurchasingPrivilege(priv);
                          }}
                          disabled={customer ? !hasEnoughPoints : false}
                          style={
                            (!customer || hasEnoughPoints)
                              ? {
                                  backgroundColor: safeAccentFill,
                                  color: safeAccentFillContrast,
                                }
                              : undefined
                          }
                          className={`w-full py-3 rounded-2xl font-black text-xs flex items-center justify-center space-x-1.5 rtl:space-x-reverse transition shadow-lg ${
                            safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                          } ${
                            (!customer || hasEnoughPoints)
                              ? 'hover:brightness-110 active:scale-95'
                              : isDarkTheme
                              ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                          }`}
                        >
                          <ShoppingBag className="w-4 h-4" />
                          <span>
                            {!customer
                              ? `استبدال وشراء بالنقاط (${priv.cost_points} نقطة) 🛍️`
                              : hasEnoughPoints
                              ? `شراء الامتياز (${priv.cost_points} نقطة) 🛍️`
                              : `تحتاج ${priv.cost_points} نقطة (رصيدك غير كافٍ)`}
                          </span>
                        </button>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'tickets' && (
        <div className="space-y-5 animate-fade-in pb-28">
          {/* 👑 VIP Tier Progress & Rank Bar (مكانتي المدمجة) */}
          <div
            className="p-4 rounded-3xl border shadow-xl relative overflow-hidden backdrop-blur-md transition-colors"
            style={
              isDarkTheme
                ? {
                    borderColor: `${safeAccentFill}40`,
                    background: `linear-gradient(135deg, ${safeAccentFill}15 0%, #0F172A 60%, #020617 100%)`,
                  }
                : {
                    borderColor: `${safeAccentFill}35`,
                    background: `linear-gradient(135deg, #FFFFFF 0%, #FAFBFD 50%, ${safeAccentFill}12 100%)`,
                  }
            }
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-lg shadow-inner"
                  style={{
                    backgroundColor: `${currentTierObj?.badge_color || safeAccentFill}20`,
                    color: currentTierObj?.badge_color || safeAccentText,
                    border: `1px solid ${currentTierObj?.badge_color || safeAccentFill}40`,
                  }}
                >
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <div className={`text-[11px] font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                    مكانتك ومستواك الحالي:
                  </div>
                  <div className={`text-base font-black flex items-center gap-2 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    <span>{currentTierObj?.tier_name || 'عضو مميز'}</span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold font-mono shadow-2xs ${
                        safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                      }`}
                      style={{ backgroundColor: safeAccentFill, color: safeAccentFillContrast }}
                    >
                      {customer?.lifetime_xp || 0} XP
                    </span>
                  </div>
                </div>
              </div>

              {nextTierObj && (
                <div className="text-left">
                  <span className={`text-[10px] block font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                    المستوى القادم:
                  </span>
                  <span className={`text-xs font-bold font-mono ${isDarkTheme ? 'text-amber-300' : 'text-amber-700'}`}>
                    {nextTierObj.tier_name}
                  </span>
                </div>
              )}
            </div>

            {/* Smart Visual Progress Bar */}
            {nextTierObj ? (
              <div className={`space-y-1.5 mt-2 p-2.5 rounded-2xl border ${
                isDarkTheme ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50 border-slate-200/90'
              }`}>
                <div className={`w-full rounded-full h-2.5 overflow-hidden border p-0.5 ${
                  isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300'
                }`}>
                  <div
                    className="h-full rounded-full transition-all duration-700 shadow-sm"
                    style={{
                      width: `${progressPercent}%`,
                      backgroundColor: safeAccentFill,
                    }}
                  />
                </div>
                <div className={`flex items-center justify-between text-[10px] font-mono ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  <span>نسبة التقدم: <strong className={isDarkTheme ? 'text-white' : 'text-slate-900'}>{progressPercent}%</strong></span>
                  <span className={`font-bold ${isDarkTheme ? 'text-amber-300' : 'text-amber-700'}`}>
                    باقي {xpNeeded} XP للوصول لـ {nextTierObj.tier_name} 🚀
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-emerald-500 font-bold mt-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>تهانينا! أنت حالياً في أعلى مستوى VIP متاح بالمتجر 👑</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-lg font-black flex items-center space-x-2 rtl:space-x-reverse ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  <Ticket className="w-5 h-5" style={{ color: safeAccentText }} />
                  <span>عروضي وكوبوناتي المحفوظة 🎟️</span>
                </h3>
                <p className={`text-xs mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  العروض التي قمت بشرائها بنقاطك، جاهزة للصرف عند الكاشير
                </p>
              </div>
              <span className="text-xs bg-emerald-500/15 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/30 font-bold shrink-0">
                {activeCouponsCount} جاهز للصرف
              </span>
            </div>

            {customerCoupons.length > 0 && (
              <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border ${
                isDarkTheme ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-100 border-slate-200/90'
              }`}>
                <button
                  type="button"
                  onClick={() => setTicketsFilter('active')}
                  style={
                    ticketsFilter === 'active'
                      ? { backgroundColor: safeAccentFill, color: safeAccentFillContrast }
                      : undefined
                  }
                  className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                    ticketsFilter === 'active'
                      ? `shadow-md ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                      : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>المتاحة للصرف 🎫</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-mono">
                    {customerCoupons.filter((c) => c.status !== 'USED' && c.status !== 'REDEEMED').length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setTicketsFilter('used')}
                  style={
                    ticketsFilter === 'used'
                      ? { backgroundColor: safeAccentFill, color: safeAccentFillContrast }
                      : undefined
                  }
                  className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                    ticketsFilter === 'used'
                      ? `shadow-md ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                      : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>السجل المستخدم ✓</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-mono">
                    {customerCoupons.filter((c) => c.status === 'USED' || c.status === 'REDEEMED').length}
                  </span>
                </button>
              </div>
            )}
          </div>

          {(() => {
            const displayedCoupons = customerCoupons.filter((coupon) => {
              const isUsed = coupon.status === 'USED' || coupon.status === 'REDEEMED';
              return ticketsFilter === 'used' ? isUsed : !isUsed;
            });

            if (customerCoupons.length === 0 || displayedCoupons.length === 0) {
              return (
                <div className={`py-14 text-center border border-dashed rounded-3xl space-y-3 ${
                  isDarkTheme
                    ? 'border-slate-800 bg-slate-950/40 text-slate-400'
                    : 'border-slate-200 bg-white text-slate-500 shadow-sm'
                }`}>
                  <Ticket className="w-12 h-12 mx-auto text-slate-400 mb-1" />
                  <h4 className={`text-base font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    {customerCoupons.length === 0
                      ? 'لا توجد امتيازات محفوظة حالياً'
                      : ticketsFilter === 'used'
                      ? 'لا توجد كوبونات مستخدمة سابقة'
                      : 'لا توجد امتيازات جاهزة للصرف حالياً'}
                  </h4>
                  <p className={`text-xs max-w-sm mx-auto ${isDarkTheme ? 'text-slate-500' : 'text-slate-600'}`}>
                    {ticketsFilter === 'used' && customerCoupons.length > 0
                      ? 'جميع الامتيازات المصروفة سابقاً ستظهر هنا في سجلك.'
                      : 'استبدل رصيد نقاطك من قائمة العروض لتفتح هدايا وتذاكر فورية 🎁'}
                  </p>
                  {ticketsFilter === 'active' && (
                    <button
                      onClick={() => setActiveTab('perks')}
                      style={{
                        backgroundColor: safeAccentFill,
                        color: safeAccentFillContrast,
                      }}
                      className={`px-5 py-2.5 rounded-2xl font-bold text-xs shadow-lg transition hover:brightness-110 active:scale-95 ${
                        safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                      }`}
                    >
                      استكشف العروض 🚀
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 gap-4">
                {displayedCoupons.map((coupon) => {
                const isSelected = selectedCouponForQR?.id === coupon.id;
                const isUsed = coupon.status === 'USED' || coupon.status === 'REDEEMED';
                const timeCheck = LoyaltyService.isWithinTimeRange(
                  coupon.valid_start_time,
                  coupon.valid_end_time
                );
                const isFrozen = !isUsed && !timeCheck.allowed;

                return (
                  <div
                    key={coupon.id}
                    className={`relative rounded-3xl p-5 border transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl ${
                      isUsed
                        ? isDarkTheme ? 'bg-slate-950/60 border-slate-800/80 opacity-70' : 'bg-slate-50 border-slate-200/90 opacity-80'
                        : isSelected
                        ? 'border-2'
                        : isFrozen
                        ? isDarkTheme ? 'bg-slate-900/90 border-slate-700/60' : 'bg-slate-50 border-slate-200'
                        : isDarkTheme ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200/90 shadow-md'
                    }`}
                    style={
                      isSelected
                        ? isDarkTheme
                          ? {
                              borderColor: safeAccentFill,
                              background: `linear-gradient(135deg, ${safeAccentFill}20 0%, #0F172A 60%, #020617 100%)`,
                            }
                          : {
                              borderColor: safeAccentFill,
                              background: `linear-gradient(135deg, #FFFFFF 0%, #FAFBFD 50%, ${safeAccentFill}15 100%)`,
                            }
                        : undefined
                    }
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border ${
                          isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                        }`}>
                          <span className={`font-mono font-black text-xs select-all ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                            {coupon.coupon_code}
                          </span>
                          <button
                            onClick={() => copyToClipboard(coupon.coupon_code, coupon.id)}
                            className={`${isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'} transition`}
                            title="نسخ الرمز"
                          >
                            {copiedCodeKey === coupon.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {isUsed ? (
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            isDarkTheme ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-700 border-slate-300'
                          }`}>
                            تم الاستخدام ✓
                          </span>
                        ) : isFrozen ? (
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30 text-[10px] font-bold">
                            ❄️ خارج ساعات الصرف
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 text-[10px] font-bold">
                            🟢 جاهز للصرف
                          </span>
                        )}
                      </div>

                      {coupon.privilege_image_url && (
                        <div className={`w-full h-32 rounded-xl overflow-hidden relative border my-2 ${
                          isDarkTheme ? 'bg-black/40 border-slate-800/80' : 'bg-slate-100 border-slate-200'
                        }`}>
                          <img
                            src={coupon.privilege_image_url}
                            alt={coupon.privilege_title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}

                      <h4 className={`font-black text-base ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{coupon.privilege_title}</h4>

                      <div className={`p-3 rounded-2xl border border-dashed space-y-1.5 text-[11px] ${
                        isDarkTheme ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className={`flex items-center justify-between ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                          <span>ساعات الصرف:</span>
                          <span className="font-mono font-bold" style={{ color: safeAccentText }}>
                            {coupon.valid_start_time && coupon.valid_end_time
                              ? `${coupon.valid_start_time} - ${coupon.valid_end_time}`
                              : 'متاح 24/7'}
                          </span>
                        </div>
                        <div className={`flex items-center justify-between ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                          <span>القيمة:</span>
                          <span className={`font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{coupon.cost_points} نقطة</span>
                        </div>
                      </div>
                    </div>

                    {!isUsed && (
                      <div className={`mt-4 pt-3 border-t border-dashed ${isDarkTheme ? 'border-slate-800' : 'border-slate-200'}`}>
                        <button
                          onClick={() => handleSelectCouponForRedeem(coupon)}
                          style={
                            isSelected
                              ? {
                                  backgroundColor: safeAccentFill,
                                  color: safeAccentFillContrast,
                                }
                              : undefined
                          }
                          className={`w-full py-2.5 rounded-2xl font-black text-xs flex items-center justify-center space-x-1.5 rtl:space-x-reverse transition shadow-lg ${
                            isSelected
                              ? (safeAccentFillContrast === '#FFFFFF' ? 'keep-white shadow-lg' : 'shadow-lg')
                              : isFrozen
                              ? isDarkTheme ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white keep-white shadow-emerald-500/20'
                          }`}
                        >
                          <QrCode className="w-4 h-4" />
                          <span>{isSelected ? '✓ معروض بالباركود الرئيسي الآن' : 'عرض الرمز للصرف 📱'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'tiers' && activeModules.loyalty && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-lg font-black flex items-center space-x-2 rtl:space-x-reverse ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                <Crown className="w-5 h-5" style={{ color: safeAccentText }} />
                <span>مكانتك ومستويات الـ VIP 👑</span>
              </h3>
              <p className={`text-xs mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                ارتقِ في مكانتك مع كل زيارة لتحصل على مكافآت وقوائم حصرية
              </p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full border font-mono ${
              isDarkTheme ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-600 shadow-sm'
            }`}>
              {sortedTiers.length} مستويات
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {sortedTiers.map((t, idx) => {
              const isReached = customer ? customer.lifetime_xp >= t.required_xp : false;
              const isCurrent = currentTierObj?.id === t.id;

              return (
                <div
                  key={t.id}
                  className={`p-5 rounded-3xl border transition-all duration-300 relative overflow-hidden shadow-xl ${
                    isCurrent
                      ? 'border-2'
                      : isReached
                      ? isDarkTheme ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200/90 shadow-md'
                      : isDarkTheme ? 'bg-slate-950/60 border-slate-800/80 opacity-60' : 'bg-slate-50/80 border-slate-200 opacity-60'
                  }`}
                  style={
                    isCurrent
                      ? isDarkTheme
                        ? {
                            borderColor: safeAccentFill,
                            background: `linear-gradient(135deg, ${safeAccentFill}20 0%, #0F172A 60%, #020617 100%)`,
                          }
                        : {
                            borderColor: safeAccentFill,
                            background: `linear-gradient(135deg, #FFFFFF 0%, #FAFBFD 50%, ${safeAccentFill}15 100%)`,
                          }
                      : undefined
                  }
                >
                  {isCurrent && (
                    <div className="absolute top-3 left-3 rtl:right-3 rtl:left-auto">
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${
                          safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                        }`}
                        style={{ backgroundColor: safeAccentFill, color: safeAccentFillContrast }}
                      >
                        مكانتك الحالية ✨
                      </span>
                    </div>
                  )}

                  <div className="space-y-2 mt-1">
                    <div
                      className="w-10 h-10 rounded-2xl border flex items-center justify-center font-bold text-base"
                      style={{
                        backgroundColor: `${t.badge_color || safeAccentFill}20`,
                        borderColor: `${t.badge_color || safeAccentFill}60`,
                        color: t.badge_color || safeAccentText,
                      }}
                    >
                      {idx === 0 ? '🥉' : idx === 1 ? '🥈' : idx === 2 ? '🥇' : '👑'}
                    </div>

                    <h4 className={`font-extrabold text-base ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{t.tier_name}</h4>
                    <p className={`text-xs font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                      الشرط: <strong style={{ color: safeAccentText }}>{t.required_xp} XP</strong> تراكمي
                    </p>

                    <div className={`pt-2 text-[11px] ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                      {isReached ? (
                        <span className="text-emerald-500 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>مستوى مفتوح ومفعل ✓</span>
                        </span>
                      ) : (
                        <span>
                          باقي <strong className="font-mono" style={{ color: safeAccentText }}>{t.required_xp - (customer?.lifetime_xp || 0)} XP</strong> للوصول
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 🌟 08 & Prototype - Floating Luxury Bottom Cart Pill */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-24 left-4 right-4 max-w-md mx-auto z-40 animate-slide-up">
          <div
            onClick={() => setIsCartModalOpen(true)}
            className={`p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all duration-300 border border-white/20 ${
              safeAccentFillContrast === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'
            }`}
            style={{
              backgroundColor: safeAccentFill,
              color: safeAccentFillContrast,
              boxShadow: `0 12px 30px -4px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.25)`,
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center font-mono font-black text-xs bg-black/20"
                style={{ color: safeAccentFillContrast }}
              >
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
              </div>
              <div>
                <span className="text-xs font-black block leading-tight">سلة طلباتك جاهزة</span>
                <span
                  className="text-[10px] font-bold opacity-85"
                  style={{ color: safeAccentFillContrast }}
                >
                  ستكسب +{estimatedLoyaltyPoints} نقطة ولاء 👑
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCartItems([]);
                  try {
                    localStorage.removeItem(`radar_cart_${store.id}`);
                  } catch {}
                }}
                className="w-7 h-7 rounded-xl bg-black/20 hover:bg-black/35 active:scale-90 flex items-center justify-center transition shrink-0"
                style={{ color: safeAccentFillContrast }}
                title="إلغاء وإفراغ السلة ✕"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-left">
                <span className="text-sm font-black font-mono leading-none block">
                  {cartGrandTotal} ر.س
                </span>
                <span className="text-[9px] font-bold opacity-80">متابعة الطلب</span>
              </div>
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: safeAccentFillContrast === '#FFFFFF' ? '#FFFFFF' : '#0F172A',
                  color: safeAccentFillContrast === '#FFFFFF' ? '#0F172A' : '#FFFFFF',
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 09 - Floating Bottom Dock with ABSOLUTE FIXED CENTER FAB & 5-Column Symmetrical Grid */}
      <div className="fixed bottom-3 left-3 right-3 max-w-md mx-auto z-40">
        <div className="relative">
          {/* 🌟 CENTER FLOATING ACTION BUTTON (FAB): Absolutely Centered regardless of tabs */}
          {activeModules.loyalty && (
            <div className="absolute left-1/2 -translate-x-1/2 -top-5 sm:-top-6 z-50 flex flex-col items-center justify-center pointer-events-auto">
              <button
                type="button"
                onClick={() => {
                  if (!customer) {
                    setPendingAuthAction({ type: 'SHOW_QR' });
                    setShowLoginModal(true);
                  } else {
                    setActiveTab('pass');
                  }
                }}
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex flex-col items-center justify-center transition-all duration-300 transform active:scale-90 ${
                  safeAccentFillContrast === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'
                } ${
                  activeTab === 'pass'
                    ? isDarkTheme ? 'scale-110 shadow-2xl ring-4 ring-slate-900' : 'scale-110 shadow-2xl ring-4 ring-white'
                    : isDarkTheme ? 'hover:scale-105 shadow-xl ring-4 ring-slate-950' : 'hover:scale-105 shadow-xl ring-4 ring-white'
                }`}
                style={{
                  backgroundColor: safeAccentFill,
                  boxShadow: `0 10px 28px -4px rgba(0,0,0,0.35), 0 4px 14px rgba(0,0,0,0.25)`,
                  color: safeAccentFillContrast,
                }}
                title="بطاقة العضوية والولاء الرقمية"
              >
                <div className="relative flex items-center justify-center">
                  <QrCode className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.4]" style={{ color: safeAccentFillContrast }} />
                  {activeTab === 'pass' && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white animate-ping"></span>
                  )}
                </div>
                <span
                  className="text-[10px] font-black tracking-tight leading-none mt-1"
                  style={{ color: safeAccentFillContrast }}
                >
                  بطاقتي
                </span>
              </button>
            </div>
          )}

          <nav className={`glass-dock rounded-3xl p-1.5 grid grid-cols-5 items-center relative transition-colors duration-300 ${
            isDarkTheme
              ? 'shadow-[0_-8px_30px_rgba(0,0,0,0.5)] bg-slate-950/95 backdrop-blur-3xl border border-white/10'
              : 'shadow-[0_-4px_25px_rgba(0,0,0,0.08)] bg-white/95 backdrop-blur-3xl border border-slate-200/90'
          }`}>
            {/* Slot 1: المنيو (Rightmost in RTL) */}
            <div className="flex justify-center items-center">
              {activeModules.orders ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('menu')}
                  style={activeTab === 'menu' ? { color: safeAccentText } : undefined}
                  className={`w-full py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300 relative ${
                    activeTab === 'menu'
                      ? 'font-black scale-105'
                      : isDarkTheme ? 'font-bold text-slate-400 hover:text-white hover:scale-105' : 'font-bold text-slate-500 hover:text-slate-900 hover:scale-105'
                  }`}
                >
                  <ShoppingBag
                    className="w-5 h-5 transition-transform duration-300"
                    style={activeTab === 'menu' ? { filter: `drop-shadow(0 0 6px ${safeAccentText}40)` } : undefined}
                  />
                  <span className="text-[10px] sm:text-[11px] leading-tight">المنيو</span>
                  {activeTab === 'menu' ? (
                    <span
                      className="w-4 h-1 rounded-full animate-fade-in"
                      style={{ backgroundColor: safeAccentText }}
                    />
                  ) : (
                    <span className="w-4 h-1 opacity-0" />
                  )}
                  {cartItems.length > 0 && (
                    <span
                      className={`absolute top-0.5 right-1 sm:right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center shadow-sm ${
                        safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                      }`}
                      style={{ backgroundColor: safeAccentFill, color: safeAccentFillContrast }}
                    >
                      {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  )}
                </button>
              ) : <div className="h-10" />}
            </div>

            {/* Slot 2: حجز موعد */}
            <div className="flex justify-center items-center">
              {activeModules.bookings ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('services')}
                  style={activeTab === 'services' ? { color: safeAccentText } : undefined}
                  className={`w-full py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300 relative ${
                    activeTab === 'services'
                      ? 'font-black scale-105'
                      : isDarkTheme ? 'font-bold text-slate-400 hover:text-white hover:scale-105' : 'font-bold text-slate-500 hover:text-slate-900 hover:scale-105'
                  }`}
                >
                  <Calendar
                    className="w-5 h-5 transition-transform duration-300"
                    style={activeTab === 'services' ? { filter: `drop-shadow(0 0 6px ${safeAccentText}40)` } : undefined}
                  />
                  <span className="text-[10px] sm:text-[11px] leading-tight">حجز موعد</span>
                  {activeTab === 'services' ? (
                    <span
                      className="w-4 h-1 rounded-full animate-fade-in"
                      style={{ backgroundColor: safeAccentText }}
                    />
                  ) : (
                    <span className="w-4 h-1 opacity-0" />
                  )}
                </button>
              ) : <div className="h-10" />}
            </div>

            {/* Slot 3: Center FAB Spacer Slot (Exactly 20% column width for absolute symmetry) */}
            <div className="flex justify-center items-center pointer-events-none">
              <div className="w-12 h-10" />
            </div>

            {/* Slot 4: العروض */}
            <div className="flex justify-center items-center">
              {activeModules.loyalty ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('perks')}
                  style={activeTab === 'perks' ? { color: safeAccentText } : undefined}
                  className={`w-full py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300 relative ${
                    activeTab === 'perks'
                      ? 'font-black scale-105'
                      : isDarkTheme ? 'font-bold text-slate-400 hover:text-white hover:scale-105' : 'font-bold text-slate-500 hover:text-slate-900 hover:scale-105'
                  }`}
                >
                  <Gift
                    className="w-5 h-5 transition-transform duration-300"
                    style={activeTab === 'perks' ? { filter: `drop-shadow(0 0 6px ${safeAccentText}40)` } : undefined}
                  />
                  <span className="text-[10px] sm:text-[11px] leading-tight">العروض</span>
                  {activeTab === 'perks' ? (
                    <span
                      className="w-4 h-1 rounded-full animate-fade-in"
                      style={{ backgroundColor: safeAccentText }}
                    />
                  ) : (
                    <span className="w-4 h-1 opacity-0" />
                  )}
                </button>
              ) : <div className="h-10" />}
            </div>

            {/* Slot 5: حصرياتي (Leftmost in RTL) */}
            <div className="flex justify-center items-center">
              <button
                type="button"
                onClick={() => setActiveTab('tickets')}
                style={activeTab === 'tickets' ? { color: safeAccentText } : undefined}
                className={`w-full py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300 relative ${
                  activeTab === 'tickets'
                    ? 'font-black scale-105'
                    : isDarkTheme ? 'font-bold text-slate-400 hover:text-white hover:scale-105' : 'font-bold text-slate-500 hover:text-slate-900 hover:scale-105'
                }`}
              >
                <Ticket
                  className="w-5 h-5 transition-transform duration-300"
                  style={activeTab === 'tickets' ? { filter: `drop-shadow(0 0 6px ${safeAccentText}40)` } : undefined}
                />
                <span className="text-[10px] sm:text-[11px] leading-tight">حصرياتي</span>
                {activeTab === 'tickets' ? (
                  <span
                    className="w-4 h-1 rounded-full animate-fade-in"
                    style={{ backgroundColor: safeAccentText }}
                  />
                ) : (
                  <span className="w-4 h-1 opacity-0" />
                )}
                {activeCouponsCount > 0 && (
                  <span
                    className={`absolute top-0.5 right-1 sm:right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center shadow-sm animate-pulse ${
                      safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                    }`}
                    style={{ backgroundColor: safeAccentFill, color: safeAccentFillContrast }}
                  >
                    {activeCouponsCount}
                  </span>
                )}
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* 🌟 04 (Image 4) - "كيف أجمع نقاط؟" Interactive Modal Bottom Sheet */}
      {showHowToEarnPoints && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className={`w-full max-w-sm rounded-t-[32px] sm:rounded-3xl p-6 space-y-4 shadow-2xl relative text-center border ${
            isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <h3 className={`font-black text-xl ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              كيف تجمع نقاط؟
            </h3>

            <div className="space-y-3 text-right text-xs sm:text-sm py-2">
              <div className={`flex items-start gap-2.5 p-3 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="font-bold text-amber-500 font-mono text-sm shrink-0">1.</span>
                <span className={`font-semibold leading-relaxed ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                  اطلب من المنيو أو زر المطعم وأبرز الباركود للكاشير عند المحاسبة.
                </span>
              </div>
              <div className={`flex items-start gap-2.5 p-3 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="font-bold text-amber-500 font-mono text-sm shrink-0">2.</span>
                <span className={`font-semibold leading-relaxed ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                  كل ريال تدفعه = {store.points_per_riyal || 5} نقاط تضاف تلقائياً لمحفظتك.
                </span>
              </div>
              <div className={`flex items-start gap-2.5 p-3 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="font-bold text-amber-500 font-mono text-sm shrink-0">3.</span>
                <span className={`font-semibold leading-relaxed ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                  استبدل نقاطك بمكافآت وهدايا حصرية من شاشة "العروض والامتيازات".
                </span>
              </div>
              <div className={`flex items-start gap-2.5 p-3 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="font-bold text-amber-500 font-mono text-sm shrink-0">4.</span>
                <span className={`font-semibold leading-relaxed ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                  كل ما زادت نقاطك ارتقى مستواك وزادت مميزاتك الخاصة! 👑
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowHowToEarnPoints(false)}
              className={`w-full py-3.5 rounded-2xl font-black text-sm transition active:scale-95 shadow-lg ${
                safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
              }`}
              style={{
                backgroundColor: safeAccentFill,
                color: safeAccentFillContrast,
              }}
            >
              فهمت ✓
            </button>
          </div>
        </div>
      )}

      {isFullscreenQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in">
          <div className={`relative max-w-sm w-full p-6 sm:p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center space-y-5 border ${
            isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <button
              type="button"
              onClick={() => setIsFullscreenQR(false)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition absolute top-4 left-4 border ${
                isDarkTheme
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200 shadow-2xs'
              }`}
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className={`font-black text-lg ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{store.name}</h3>
              <p
                className="text-xs font-bold mt-0.5"
                style={{ color: safeAccentText }}
              >
                {selectedCouponForQR ? `امتياز: ${selectedCouponForQR.privilege_title}` : 'بطاقة الولاء الرقمية المباشرة'}
              </p>
            </div>

            <div className={`p-4 rounded-3xl bg-white shadow-2xl flex items-center justify-center border ${
              isDarkTheme ? 'border-slate-800' : 'border-slate-100'
            }`}>
              <QRCodeSVG
                value={qrDataPayload}
                size={260}
                level="M"
                includeMargin={true}
              />
            </div>

            <div className={`text-xs ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
              <span>يتحدث الرمز خلال: </span>
              <strong className="font-bold font-mono" style={{ color: safeAccentText }}>
                {timeLeft} ثانية
              </strong>
            </div>

            <button
              type="button"
              onClick={() => setIsFullscreenQR(false)}
              className={`w-full py-3.5 rounded-2xl font-bold text-xs transition border ${
                isDarkTheme
                  ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700 shadow-md'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200 shadow-2xs'
              }`}
            >
              إغلاق وتصغير
            </button>
          </div>
        </div>
      )}

      {purchasingPrivilege && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="glass-card max-w-md w-full rounded-3xl p-6 sm:p-8 space-y-5 border border-slate-800 bg-slate-900 shadow-2xl relative">
            <button
              onClick={() => setPurchasingPrivilege(null)}
              className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              {purchasingPrivilege.image_url ? (
                <div className="w-full h-36 rounded-2xl overflow-hidden bg-black/40 mb-3 border border-slate-800/80 shadow-inner">
                  <img
                    src={purchasingPrivilege.image_url}
                    alt={purchasingPrivilege.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="w-14 h-14 rounded-2xl border flex items-center justify-center text-3xl mx-auto"
                  style={{
                    backgroundColor: `${safeAccentFill}15`,
                    borderColor: `${safeAccentFill}30`,
                    color: safeAccentText,
                  }}
                >
                  🎁
                </div>
              )}
              <h3 className="text-lg font-black text-white">تأكيد شراء واستبدال الامتياز</h3>
              <p className="text-xs text-slate-300">
                أنت على وشك شراء <strong style={{ color: safeAccentText }}>"{purchasingPrivilege.title}"</strong>
              </p>
            </div>

            {purchaseError && (
              <div className="p-3 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-semibold animate-shake">
                {purchaseError}
              </div>
            )}

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>رصيدك الحالي:</span>
                <span className="font-mono text-white font-bold">{customer?.wallet_balance} نقطة</span>
              </div>
              <div className="flex items-center justify-between font-bold" style={{ color: safeAccentText }}>
                <span>النقاط المستحقة:</span>
                <span className="font-mono">-{purchasingPrivilege.cost_points} نقطة</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-emerald-500 font-bold">
                <span>رصيدك بعد الشراء:</span>
                <span className="font-mono">
                  {(customer?.wallet_balance || 0) - purchasingPrivilege.cost_points} نقطة
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center space-x-3 rtl:space-x-reverse">
              <button
                type="button"
                onClick={handleConfirmPurchaseCoupon}
                disabled={purchaseLoading}
                style={{
                  backgroundColor: safeAccentFill,
                  color: safeAccentFillContrast,
                }}
                className={`flex-1 py-3.5 rounded-xl font-black text-sm transition shadow-lg hover:brightness-110 disabled:opacity-50 ${
                  safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                }`}
              >
                {purchaseLoading ? 'جاري الشراء...' : 'تأكيد الشراء الفوري 🛍️'}
              </button>
              <button
                type="button"
                onClick={() => setPurchasingPrivilege(null)}
                className="px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {showInstallGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="glass-card max-w-md w-full rounded-3xl p-6 sm:p-8 space-y-6 border border-slate-800 bg-slate-900 shadow-2xl relative">
            <button
              onClick={() => setShowInstallGuide(false)}
              className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div
                className="w-12 h-12 rounded-2xl border flex items-center justify-center text-2xl shrink-0"
                style={{
                  backgroundColor: `${safeAccentFill}15`,
                  borderColor: `${safeAccentFill}30`,
                  color: safeAccentText,
                }}
              >
                📲
              </div>
              <div>
                <h3 className="text-lg font-black text-white">تثبيت تطبيق {store.name}</h3>
                <p className="text-xs text-slate-400">احصل على التطبيق الكامل على شاشة جوالك</p>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center space-x-2 rtl:space-x-reverse font-bold text-xs" style={{ color: safeAccentText }}>
                  <span>🍎 لمستخدمي الآيفون (Safari):</span>
                </div>
                <ol className="text-xs text-slate-300 space-y-1 list-decimal list-inside pr-1">
                  <li>اضغط على زر <strong className="text-white font-bold">المشاركة (Share ⎋)</strong> أسفل المتصفح.</li>
                  <li>اختر <strong className="text-white font-bold">"إضافة إلى الشاشة الرئيسية" (Add to Home Screen ➕)</strong>.</li>
                  <li>اضغط <strong className="font-bold" style={{ color: safeAccentText }}>"إضافة" (Add)</strong> في الزاوية.</li>
                </ol>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-500 font-bold text-xs">
                  <span>🤖 لمستخدمي الأندرويد (Chrome):</span>
                </div>
                <ol className="text-xs text-slate-300 space-y-1 list-decimal list-inside pr-1">
                  <li>اضغط على النقاط الثلاث <strong className="text-white font-bold">(⋮)</strong> أعلى يمين المتصفح.</li>
                  <li>اختر <strong className="text-white font-bold">"تثبيت التطبيق" (Install App 📥)</strong> أو "إضافة للشاشة".</li>
                </ol>
              </div>
            </div>

            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
            >
              فهمت ذلك ✓
            </button>
          </div>
        </div>
      )}

      {celebrationModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div
            className="glass-card max-w-md w-full rounded-3xl p-6 sm:p-8 space-y-5 border text-center relative shadow-2xl bg-slate-900 overflow-hidden"
            style={{ borderColor: `${safeAccentFill}80` }}
          >
            <div
              className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-30"
              style={{ backgroundColor: safeAccentFill }}
            ></div>

            <button
              onClick={() => setCelebrationModal(null)}
              className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            {celebrationModal.type === 'REJECTED' ? (
              <div className="space-y-4 pt-2">
                <div className="w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-4xl mx-auto shadow-inner animate-shake">
                  🚫
                </div>
                <div className="space-y-1.5">
                  <span className="px-3 py-1 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/30 text-xs font-bold font-mono inline-block">
                    تم رفض العملية
                  </span>
                  <h3 className="text-lg font-black text-white">{celebrationModal.title}</h3>
                  <p className="text-xs text-rose-400 max-w-xs mx-auto leading-relaxed pt-1">
                    {celebrationModal.subtitle}
                  </p>
                </div>
              </div>
            ) : celebrationModal.type === 'COUPON_REDEEMED' ? (
              <div className="space-y-4 pt-2">
                <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-4xl mx-auto shadow-inner animate-bounce">
                  🎁
                </div>
                <div className="space-y-1.5">
                  <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-xs font-bold font-mono inline-block">
                    تم الصرف والتسليم بنجاح ✓
                  </span>
                  <h3 className="text-xl font-black text-white">ألف مبروك!</h3>
                  <h4 className="text-sm font-bold" style={{ color: safeAccentText }}>
                    "{celebrationModal.title}"
                  </h4>
                  <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed pt-1">
                    {celebrationModal.subtitle}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div
                  className="w-16 h-16 rounded-3xl border flex items-center justify-center text-4xl mx-auto shadow-inner animate-bounce"
                  style={{
                    backgroundColor: `${safeAccentFill}20`,
                    borderColor: `${safeAccentFill}40`,
                  }}
                >
                  💎
                </div>
                <div className="space-y-1.5">
                  <span
                    className="px-3 py-1 rounded-full border text-xs font-bold font-mono inline-block"
                    style={{
                      backgroundColor: `${safeAccentFill}15`,
                      borderColor: `${safeAccentFill}30`,
                      color: safeAccentText,
                    }}
                  >
                    +{celebrationModal.points} نقطة جديدة ✨
                  </span>
                  <h3 className="text-xl font-black text-white">شكراً لزيارتك لـ {store.name}!</h3>
                  <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed pt-1">
                    {celebrationModal.subtitle}
                  </p>
                  <div className="mt-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 inline-flex items-center gap-2">
                    <span className="text-xs text-slate-400">رصيدك الحالي أصبح:</span>
                    <strong className="text-base font-black font-mono" style={{ color: safeAccentText }}>
                      {celebrationModal.newBalance?.toLocaleString()} نقطة
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setCelebrationModal(null)}
                style={{
                  backgroundColor: safeAccentFill,
                  color: safeAccentFillContrast,
                }}
                className={`w-full py-3.5 rounded-2xl font-black text-sm transition shadow-xl hover:brightness-110 ${
                  safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                }`}
              >
                رائع! شكراً لكم 👏
              </button>
            </div>
          </div>
        </div>
      )}

      {isCustomizeModalOpen && itemToCustomize && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div
            className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up border transition-colors ${
              isDarkTheme ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
            style={{ borderColor: `${brandSecondary}40` }}
          >
            <div className="relative h-44 sm:h-48 w-full bg-slate-950 shrink-0">
              {itemToCustomize.image_url ? (
                <img
                  src={itemToCustomize.image_url}
                  alt={itemToCustomize.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl text-slate-600">
                  {itemToCustomize.item_type === 'service' ? '💇‍♂️' : '🍽'}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
              
              <button
                type="button"
                onClick={() => setIsCustomizeModalOpen(false)}
                className="absolute top-3 left-3 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white transition border border-slate-700/60"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="absolute bottom-3 right-4 left-4 text-right">
                <span
                  className="text-[10px] px-2.5 py-0.5 rounded-full font-bold inline-block mb-1 keep-white"
                  style={{
                    backgroundColor: `${brandSecondary}30`,
                    color: '#FFFFFF',
                    border: `1px solid ${brandSecondary}60`,
                  }}
                >
                  {itemToCustomize.item_type === 'service'
                    ? `⏱️ مدة الجلسة: ${itemToCustomize.duration_minutes || 30} دقيقة`
                    : itemToCustomize.category || 'صنف'}
                </span>
                <h3 className="text-base sm:text-lg font-black text-white leading-tight keep-white">
                  {itemToCustomize.name}
                </h3>
              </div>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-right">
              {itemToCustomize.description && (
                <p className={`text-xs leading-relaxed p-3 rounded-2xl border ${
                  isDarkTheme ? 'text-slate-300 bg-slate-950/60 border-slate-800' : 'text-slate-700 bg-slate-50 border-slate-200'
                }`}>
                  {itemToCustomize.description}
                </p>
              )}

              {itemToCustomize.modifier_groups && itemToCustomize.modifier_groups.length > 0 && (
                <div className="space-y-4">
                  {itemToCustomize.modifier_groups.map((group) => {
                    const currentSelected = selectedModifierOptions[group.id] || [];

                    return (
                      <div
                        key={group.id}
                        className={`p-3.5 rounded-2xl border space-y-2.5 ${
                          isDarkTheme ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200/90'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className={`text-xs font-black flex items-center gap-1.5 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                            <span>{group.name}</span>
                            {group.required && (
                              <span className="text-[10px] text-rose-400 font-bold bg-rose-500/15 px-1.5 py-0.5 rounded">
                                إجباري
                              </span>
                            )}
                          </h4>
                          <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                            {group.allow_multiple
                              ? group.max_selections
                                ? `حد أقصى ${group.max_selections}`
                                : 'اختيارات متعددة'
                              : 'اختر واحداً'}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {group.options.map((option) => {
                            const isSelected = currentSelected.some((o) => o.id === option.id);

                            return (
                              <div
                                key={option.id}
                                onClick={() => handleToggleModifierOption(group, option)}
                                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                                  isSelected
                                    ? isDarkTheme ? 'bg-slate-900 border-2 text-white' : 'bg-slate-100 border-2 text-slate-900'
                                    : isDarkTheme ? 'bg-slate-950 hover:bg-slate-900/60 border-slate-800/80 text-slate-300' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-800'
                                }`}
                                style={isSelected ? { borderColor: brandSecondary } : undefined}
                              >
                                <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                                  <div
                                    className={`w-4 h-4 rounded-${group.allow_multiple ? 'md' : 'full'} border flex items-center justify-center transition shrink-0 ${
                                      isSelected
                                        ? 'border-transparent'
                                        : isDarkTheme ? 'border-slate-600 bg-slate-900' : 'border-slate-300 bg-white'
                                    }`}
                                    style={
                                      isSelected
                                        ? {
                                            backgroundColor: brandSecondary,
                                            color: brandColors.contrastOnSecondary,
                                          }
                                        : undefined
                                    }
                                  >
                                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <span className="text-xs font-bold">{option.name}</span>
                                </div>

                                <span
                                  className="text-xs font-mono font-bold"
                                  style={
                                    option.price_delta > 0
                                      ? { color: isDarkTheme ? brandSecondary : brandColors.textOnLightHex }
                                      : { color: isDarkTheme ? '#94A3B8' : '#64748B' }
                                  }
                                >
                                  {option.price_delta > 0 ? `+${option.price_delta} ر.س` : 'مجاناً'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-1.5">
                <label className={`text-xs font-bold flex items-center gap-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  <span>ملاحظات أو طلبات خاصة (اختياري):</span>
                </label>
                <textarea
                  value={customizingNotes}
                  onChange={(e) => setCustomizingNotes(e.target.value)}
                  placeholder="مثال: بدون بصل، زيادة صلصة، تحضير سريع..."
                  rows={2}
                  className={`w-full rounded-2xl p-3 text-xs outline-none transition resize-none ${
                    isDarkTheme
                      ? 'bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-slate-600'
                      : 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-slate-500'
                  }`}
                />
              </div>

              {itemToCustomize.item_type === 'product' && (
                <div className={`flex items-center justify-between p-3 rounded-2xl border ${
                  isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className={`text-xs font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>الكمية المطلوبة:</span>
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <button
                      type="button"
                      onClick={() => setCustomizingQuantity((prev) => Math.max(1, prev - 1))}
                      disabled={customizingQuantity <= 1}
                      className={`w-8 h-8 rounded-xl disabled:opacity-40 flex items-center justify-center transition ${
                        isDarkTheme ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-200'
                      }`}
                    >
                      <Minus className="w-3 gross-3" />
                    </button>
                    <span className={`text-sm font-black font-mono w-6 text-center ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                      {customizingQuantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomizingQuantity((prev) => prev + 1)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${
                        isDarkTheme ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-200'
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={`p-4 border-t flex items-center justify-between gap-3 shrink-0 ${
              isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <span className={`text-[10px] block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>المجموع للصنف:</span>
                <div className="flex items-baseline gap-1">
                  <span className={`text-lg font-black font-mono ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    {calculateCustomizedItemUnitPrice(itemToCustomize) * customizingQuantity}
                  </span>
                  <span className={`text-xs font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>ر.س</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddCustomizedItemToCart}
                style={{
                  backgroundColor: brandSecondary,
                  color: brandColors.contrastOnSecondary,
                }}
                className={`flex-1 py-3 px-5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg hover:brightness-110 transition active:scale-95 ${
                  brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>إضافة إلى السلة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isCartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div
            className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up border transition-colors ${
              isDarkTheme ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
            style={{ borderColor: `${brandSecondary}40` }}
          >
            <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
              isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-bold"
                  style={{
                    backgroundColor: `${brandSecondary}20`,
                    color: brandColors.textOnLightHex,
                  }}
                >
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-sm sm:text-base font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    سلة الطلبات والحجز المسبق
                  </h3>
                  <p className={`text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                    {cartItems.length} أصناف • متجر {store.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCartModalOpen(false)}
                className={`p-2 rounded-xl transition ${
                  isDarkTheme ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-right">
              <div className="space-y-2.5">
                <h4 className={`text-xs font-black ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>الأصناف والخدمات المختارة:</h4>
                {cartItems.map((cartItem) => (
                  <div
                    key={cartItem.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 shadow-sm ${
                      isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200/90'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-extrabold truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                          {cartItem.catalog_item.name}
                        </span>
                      </div>

                      {cartItem.selected_modifiers && cartItem.selected_modifiers.length > 0 && (
                        <p className={`text-[10px] mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                          + {cartItem.selected_modifiers.map((m) => m.name).join(', ')}
                        </p>
                      )}

                      {cartItem.special_notes && (
                        <p className="text-[10px] text-amber-500 italic mt-0.5">
                          "{cartItem.special_notes}"
                        </p>
                      )}

                      <div className="flex items-baseline gap-1 mt-1">
                        <span className={`text-xs font-black font-mono ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                          {cartItem.total_price}
                        </span>
                        <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>ر.س</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 rtl:space-x-reverse shrink-0">
                      {cartItem.catalog_item.item_type === 'product' && (
                        <div className={`flex items-center rounded-xl border p-1 ${
                          isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartItemQty(cartItem.id, -1)}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                              isDarkTheme ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                            }`}
                          >
                            <Minus className="w-3 gross-3" />
                          </button>
                          <span className={`w-6 text-center text-xs font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                            {cartItem.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartItemQty(cartItem.id, 1)}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                              isDarkTheme ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                            }`}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveCartItem(cartItem.id)}
                        className={`p-2 rounded-xl border transition ${
                          isDarkTheme
                            ? 'bg-slate-900 hover:bg-rose-950/60 border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400'
                            : 'bg-white hover:bg-rose-50 border-slate-200 hover:border-rose-300 text-slate-400 hover:text-rose-600'
                        }`}
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer Identification & Persistent Session Section */}
              {(() => {
                const hasValidSavedCustomer = Boolean(customer?.phone || (savedProfile?.phone && savedProfile.phone.length >= 9));
                const currentDisplayName = customer?.name || savedProfile?.name || guestName;
                const currentDisplayPhone = customer?.phone || savedProfile?.phone || guestPhone;

                if (customer) {
                  return (
                    <div className={`p-3.5 rounded-2xl border space-y-2 shadow-inner ${
                      isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-emerald-500">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-xs font-black">جلسة موثقة ومحفوظة ⚡</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingAuthAction({ type: 'SUBMIT_ORDER' });
                            setShowLoginModal(true);
                          }}
                          className={`text-[11px] underline transition ${
                            isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          تغيير الحساب
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{customer.name || 'عميل المتجر'}</span>
                        <span className={`font-mono font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`} dir="ltr">{customer.phone}</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className={`p-3.5 rounded-2xl border space-y-1.5 text-right ${
                    isDarkTheme
                      ? 'bg-slate-950/80 border-slate-800'
                      : 'bg-amber-50/70 border-amber-200'
                  }`}>
                    <div className="flex items-center gap-1.5 text-amber-500">
                      <Sparkles className="w-3.5 h-3.5" />
                      <h4 className="text-xs font-black">طلب مباشر وسريع كزائر 🛍️</h4>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                      عند الضغط على «إتمام الطلب»، ستفتح لك نافذة سريعة لتأكيد رقمك بكود 4 أرقام لمرة واحدة، لحفظ نقاطك وتجهيز طلبك مباشرة للكاشير.
                    </p>
                  </div>
                );
              })()}

              <div className={`space-y-2.5 pt-2 border-t ${isDarkTheme ? 'border-slate-800' : 'border-slate-200'}`}>
                <h4 className={`text-xs font-black ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>طريقة الاستلام أو الحجز:</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('dine_in')}
                    className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                      fulfillmentType === 'dine_in'
                        ? 'border-2 shadow-md'
                        : isDarkTheme
                        ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
                    }`}
                    style={
                      fulfillmentType === 'dine_in'
                        ? {
                            borderColor: safeAccentFill,
                            backgroundColor: isDarkTheme ? `${safeAccentFill}22` : `${safeAccentFill}14`,
                            color: isDarkTheme ? brandSecondary : safeAccentText,
                          }
                        : undefined
                    }
                  >
                    <Utensils className="w-5 h-5 shrink-0" style={fulfillmentType === 'dine_in' ? { color: safeAccentText } : undefined} />
                    <span>تناول محلي</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentType('takeaway')}
                    className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                      fulfillmentType === 'takeaway'
                        ? 'border-2 shadow-md'
                        : isDarkTheme
                        ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
                    }`}
                    style={
                      fulfillmentType === 'takeaway'
                        ? {
                            borderColor: safeAccentFill,
                            backgroundColor: isDarkTheme ? `${safeAccentFill}22` : `${safeAccentFill}14`,
                            color: isDarkTheme ? brandSecondary : safeAccentText,
                          }
                        : undefined
                    }
                  >
                    <Car className="w-5 h-5 shrink-0" style={fulfillmentType === 'takeaway' ? { color: safeAccentText } : undefined} />
                    <span>استلام سفري</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentType('delivery')}
                    className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                      fulfillmentType === 'delivery'
                        ? 'border-2 shadow-md'
                        : isDarkTheme
                        ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
                    }`}
                    style={
                      fulfillmentType === 'delivery'
                        ? {
                            borderColor: safeAccentFill,
                            backgroundColor: isDarkTheme ? `${safeAccentFill}22` : `${safeAccentFill}14`,
                            color: isDarkTheme ? brandSecondary : safeAccentText,
                          }
                        : undefined
                    }
                  >
                    <MapPin className="w-5 h-5 shrink-0" style={fulfillmentType === 'delivery' ? { color: safeAccentText } : undefined} />
                    <span>توصيل للعنوان</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentType('service_booking')}
                    className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                      fulfillmentType === 'service_booking'
                        ? 'border-2 shadow-md'
                        : isDarkTheme
                        ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs'
                    }`}
                    style={
                      fulfillmentType === 'service_booking'
                        ? {
                            borderColor: safeAccentFill,
                            backgroundColor: isDarkTheme ? `${safeAccentFill}22` : `${safeAccentFill}14`,
                            color: isDarkTheme ? brandSecondary : safeAccentText,
                          }
                        : undefined
                    }
                  >
                    <Calendar className="w-5 h-5 shrink-0" style={fulfillmentType === 'service_booking' ? { color: safeAccentText } : undefined} />
                    <span>موعد خدمة</span>
                  </button>
                </div>
              </div>

              <div className={`p-3.5 rounded-2xl border space-y-3 ${
                isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                {fulfillmentType === 'dine_in' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                        رقم الطاولة في المحل (إن وجد):
                      </label>
                      <input
                        type="text"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="مثال: 7"
                        className={`w-24 rounded-xl px-3 py-1.5 text-xs text-center font-mono focus:outline-none ${
                          isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                    <div className={`flex items-center justify-between pt-2 border-t ${isDarkTheme ? 'border-slate-800/80' : 'border-slate-200'}`}>
                      <label className={`text-xs font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                        أو حجز طاولة مسبق (عدد الأفراد):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={partySize}
                          onChange={(e) => setPartySize(Number(e.target.value))}
                          className={`w-16 rounded-xl px-2 py-1.5 text-xs text-center font-mono focus:outline-none ${
                            isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-slate-900'
                          }`}
                        />
                        <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>أشخاص</span>
                      </div>
                    </div>
                  </div>
                )}

                {fulfillmentType === 'takeaway' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className={`text-xs font-bold block mb-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                        وقت الاستلام المفضل:
                      </label>
                      <input
                        type="time"
                        value={arrivalTime}
                        onChange={(e) => setArrivalTime(e.target.value)}
                        className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none ${
                          isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`text-xs font-bold block mb-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                        بيانات السيارة للاستلام السريع (النوع واللوحة - اختياري):
                      </label>
                      <input
                        type="text"
                        value={carPlate}
                        onChange={(e) => setCarPlate(e.target.value)}
                        placeholder="مثال: كامري أبيض - أ ب ج 1234"
                        className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none ${
                          isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>
                )}

                {fulfillmentType === 'delivery' && (
                  <div className="space-y-3">
                    {/* 1. حالة توفر السائقين في الفرع المختار */}
                    {availableDriversCount === 0 ? (
                      <div className={`p-3 rounded-2xl border text-xs flex flex-col gap-2 ${
                        isDarkTheme ? 'bg-amber-950/40 border-amber-800 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}>
                        <div className="flex items-center gap-2 font-bold">
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>كباتن التوصيل غير متاحين حالياً في هذا الفرع 🛵💨</span>
                        </div>
                        <p className="text-[11px] opacity-90 leading-relaxed">
                          جميع السائقين في مهمات توصيل جارية أو خارج الخدمة. يمكنك استلام الطلب بنفسك من الفرع، أو التواصل مع المتجر للتأكيد.
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => setFulfillmentType('takeaway')}
                            className="flex-1 py-1.5 px-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] flex items-center justify-center gap-1 transition"
                          >
                            <Car className="w-3.5 h-3.5" />
                            <span>تحويل إلى استلام سفري 🚗</span>
                          </button>
                          {store.manager_contact && (
                            <a
                              href={`https://wa.me/${normalizePhone(store.manager_contact)}?text=${encodeURIComponent(`مرحباً ${store.name}، أود الاستفسار عن إمكانية توصيل طلب لفرع ${selectedBranch?.name || 'الرئيسي'}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`py-1.5 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                                isDarkTheme ? 'bg-slate-900 border-amber-800 text-amber-300' : 'bg-white border-amber-300 text-amber-900'
                              }`}
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                              <span>واتساب الفرع</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={`py-1.5 px-3 rounded-xl border text-[11px] font-bold flex items-center justify-between ${
                        isDarkTheme ? 'bg-emerald-950/30 border-emerald-900 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>خدمة التوصيل نشطة • كباتن الفرع جاهزون 🛵</span>
                        </div>
                        <span className="text-[10px] font-medium opacity-80">
                          فرع: {selectedBranch?.name || 'الرئيسي'}
                        </span>
                      </div>
                    )}

                    {/* 2. شريط العناوين المحفوظة (Address Book) */}
                    {savedAddresses.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className={`text-xs font-bold flex items-center gap-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                            <BookmarkCheck className="w-3.5 h-3.5 text-amber-500" />
                            <span>عناويني المحفوظة:</span>
                          </label>
                          <span className="text-[10px] text-slate-400">اختر للتعبئة السريعة</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {savedAddresses.map((addr) => {
                            const isSelected = selectedAddressId === addr.id;
                            const isWork = addr.label === 'العمل';
                            const isRest = addr.label === 'الاستراحة';
                            return (
                              <div
                                key={addr.id}
                                onClick={() => handleSelectSavedAddress(addr)}
                                className={`p-2.5 rounded-2xl border text-right transition flex items-start justify-between gap-2 cursor-pointer relative group ${
                                  isSelected
                                    ? isDarkTheme ? 'bg-slate-900 border-2 border-amber-500 text-white shadow-lg' : 'bg-amber-50/50 border-2 border-amber-500 text-slate-900 shadow-sm'
                                    : isDarkTheme ? 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-start gap-2 min-w-0 flex-1">
                                  <div className={`p-1.5 rounded-xl shrink-0 ${isSelected ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'}`}>
                                    {isWork ? (
                                      <Briefcase className="w-3.5 h-3.5" />
                                    ) : isRest ? (
                                      <Trees className="w-3.5 h-3.5" />
                                    ) : (
                                      <Home className="w-3.5 h-3.5" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-black truncate">{addr.label}</div>
                                    <div className="text-[10px] text-slate-400 truncate">{addr.district || 'موقع محفوظ'}</div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteSavedAddress(addr.id, e)}
                                  title="حذف هذا العنوان"
                                  className="opacity-60 hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 3. عنوان التوصيل بالتفصيل (إجباري) */}
                    <div>
                      <label className={`text-xs font-bold block mb-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                        عنوان التوصيل بالتفصيل <span className="text-rose-500 font-black">*</span>:
                      </label>
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => {
                          setDeliveryAddress(e.target.value);
                          setSelectedAddressId(null);
                        }}
                        placeholder="مثال: حي النرجس - شارع التخصصي - عمارة الهدى شقة 3"
                        className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none transition ${
                          isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white focus:border-amber-500' : 'bg-white border border-slate-300 text-slate-900 focus:border-amber-500'
                        } ${!deliveryAddress.trim() ? 'border-amber-500/40' : ''}`}
                      />
                    </div>

                    {/* 4. رابط الخريطة وزر الـ GPS التلقائي الذكي (إجباري) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={`text-xs font-bold flex items-center gap-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                          <MapPin className="w-3.5 h-3.5 text-rose-500" />
                          <span>موقعك على الخريطة (GPS) <span className="text-rose-500 font-black">*</span>:</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleGetGpsLocation}
                          disabled={isLocatingGps}
                          className="text-[11px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 py-0.5 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition disabled:opacity-50"
                        >
                          {isLocatingGps ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Navigation className="w-3 h-3" />
                          )}
                          <span>{isLocatingGps ? 'جاري تحديد موقعك...' : '📍 حدد موقعي الحالي عبر GPS'}</span>
                        </button>
                      </div>

                      <div className="relative">
                        <input
                          type="url"
                          value={deliveryGpsLink}
                          onChange={(e) => setDeliveryGpsLink(e.target.value)}
                          placeholder="https://maps.google.com/?q=24.7136,46.6753"
                          className={`w-full rounded-xl pl-20 pr-3 py-2 text-xs font-mono focus:outline-none transition ${
                            isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white focus:border-amber-500' : 'bg-white border border-slate-300 text-slate-900 focus:border-amber-500'
                          } ${!deliveryGpsLink.trim() ? 'border-amber-500/40' : ''}`}
                        />
                        {deliveryGpsLink && (
                          <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={handleCopyGpsLink}
                              title="نسخ الرابط"
                              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            >
                              {copiedGpsToast ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <a
                              href={deliveryGpsLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="معاينة في الخريطة"
                              className="p-1 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                      {copiedGpsToast && (
                        <div className="text-[10px] text-emerald-400 font-bold mt-1 text-left">
                          ✓ تم نسخ رابط الموقع بنجاح
                        </div>
                      )}
                    </div>

                    {/* 5. صورة واجهة المبنى أو الباب مع الضغط التلقائي */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className={`text-xs font-bold flex items-center gap-1.5 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                          <Camera className="w-3.5 h-3.5 text-amber-500" />
                          <span>صورة الموقع / واجهة المبنى (اختياري):</span>
                        </label>
                        <span className="text-[10px] text-slate-400">ضغط فوري لحفظ المساحة ⚡</span>
                      </div>

                      {deliveryLocationPhoto ? (
                        <div className={`p-2.5 rounded-2xl border flex items-center justify-between gap-3 ${
                          isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={deliveryLocationPhoto}
                              alt="واجهة الموقع"
                              className="w-12 h-12 rounded-xl object-cover border border-amber-500/40 shadow-sm shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>تم ضغط ورفع الصورة</span>
                              </div>
                              {photoSavingsPercent != null && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  توفير {photoSavingsPercent}% من حجم الملف
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={deliveryLocationPhoto}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs transition"
                              title="معاينة الصورة"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                setDeliveryLocationPhoto('');
                                setPhotoSavingsPercent(null);
                              }}
                              className="p-1.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs transition"
                              title="حذف الصورة"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className={`w-full p-2.5 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 cursor-pointer transition ${
                            isUploadingPhoto
                              ? 'opacity-70 cursor-not-allowed bg-amber-500/5 border-amber-500/30'
                              : isDarkTheme
                              ? 'border-slate-800 hover:border-amber-500/50 bg-slate-900/40 hover:bg-slate-900 text-slate-400 hover:text-amber-300'
                              : 'border-slate-300 hover:border-amber-500/50 bg-slate-50 hover:bg-amber-50/30 text-slate-600 hover:text-amber-800'
                          }`}>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isUploadingPhoto}
                              onChange={handleLocationPhotoUpload}
                              className="hidden"
                            />
                            {isUploadingPhoto ? (
                              <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>جاري ضغط ورفع صورة الموقع...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-xs font-medium">
                                <Camera className="w-4 h-4 text-amber-500" />
                                <span>إرفاق صورة للواجهة أو الباب (لتسهيل وصول السائق)</span>
                              </div>
                            )}
                          </label>
                        </div>
                      )}
                    </div>

                    {/* 6. بطاقة النطاق الجغرافي والمسافة ورسوم التوصيل المحسوبة */}
                    {calculatedDelivery && (
                      <div className={`p-3 rounded-2xl border text-xs transition ${
                        calculatedDelivery.is_deliverable
                          ? isDarkTheme ? 'bg-slate-900/90 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                          : isDarkTheme ? 'bg-rose-950/40 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}>
                        {calculatedDelivery.is_deliverable ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold flex items-center gap-1.5 text-emerald-500">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>موقعك داخل نطاق التوصيل</span>
                              </span>
                              <span className="font-black text-amber-500 text-sm">
                                {calculatedDelivery.delivery_fee.toFixed(2)} ر.س
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
                              <span>المسافة التقديرية: {calculatedDelivery.distance_km != null ? `${calculatedDelivery.distance_km} كم` : 'محددة بالفرع'}</span>
                              <span>وقت التوصيل: {estimateDeliveryTime(calculatedDelivery.distance_km).label}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 font-bold text-rose-400">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>{calculatedDelivery.message}</span>
                            </div>
                            <p className="text-[11px] opacity-90">
                              يرجى تقريب العنوان أو اختيار الاستلام سفري من الفرع.
                            </p>
                            <button
                              type="button"
                              onClick={() => setFulfillmentType('takeaway')}
                              className="w-full py-1.5 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
                            >
                              <Car className="w-3.5 h-3.5" />
                              <span>التحويل إلى استلام سفري 🚗</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 7. خيار حفظ وتصنيف العنوان في دفتر العناوين */}
                    <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between flex-wrap gap-2 ${
                      isDarkTheme ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={saveThisAddress}
                          onChange={(e) => setSaveThisAddress(e.target.checked)}
                          className="rounded text-amber-500 focus:ring-amber-500"
                        />
                        <span className={`font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                          حفظ هذا العنوان للطلبات القادمة
                        </span>
                      </label>
                      {saveThisAddress && (
                        <div className="flex items-center gap-1.5">
                          {[
                            { id: 'البيت', label: 'البيت 🏠' },
                            { id: 'العمل', label: 'العمل 💼' },
                            { id: 'الاستراحة', label: 'الاستراحة 🌴' },
                          ].map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setSaveAddressLabel(cat.id)}
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition ${
                                saveAddressLabel === cat.id
                                  ? 'bg-amber-500 text-slate-950 shadow'
                                  : isDarkTheme ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-200 text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {fulfillmentType === 'service_booking' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={`text-xs font-bold block mb-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                          تاريخ الموعد:
                        </label>
                        <input
                          type="date"
                          value={arrivalDate}
                          onChange={(e) => setArrivalDate(e.target.value)}
                          className={`w-full rounded-xl px-2.5 py-2 text-xs focus:outline-none ${
                            isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                      <div>
                        <label className={`text-xs font-bold block mb-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                          الساعة المفضلة:
                        </label>
                        <input
                          type="time"
                          value={arrivalTime}
                          onChange={(e) => setArrivalTime(e.target.value)}
                          className={`w-full rounded-xl px-2.5 py-2 text-xs focus:outline-none ${
                            isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={`text-xs font-bold block mb-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                        الأخصائي أو الموظف المفضل (اختياري):
                      </label>
                      <input
                        type="text"
                        value={specialistName}
                        onChange={(e) => setSpecialistName(e.target.value)}
                        placeholder="اسم المختص..."
                        className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none ${
                          isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className={`text-xs font-bold block mb-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                    ملاحظات عامة للطلب:
                  </label>
                  <input
                    type="text"
                    value={generalOrderNotes}
                    onChange={(e) => setGeneralOrderNotes(e.target.value)}
                    placeholder="أي تعليمات إضافية للمتجر..."
                    className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      isDarkTheme ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`flex items-center justify-between ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  <span>المجموع الفرعي:</span>
                  <span className={`font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{cartSubtotal} ر.س</span>
                </div>
                {deliveryFee > 0 && (
                  <div className={`flex items-center justify-between ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    <span>رسوم التوصيل:</span>
                    <span className={`font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>+{deliveryFee} ر.س</span>
                  </div>
                )}
                <div className={`pt-2 border-t flex items-center justify-between text-sm font-black ${
                  isDarkTheme ? 'border-slate-800' : 'border-slate-200'
                }`}>
                  <span className={isDarkTheme ? 'text-white' : 'text-slate-900'}>الإجمالي النهائي:</span>
                  <span className={`font-mono text-base font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    {cartGrandTotal} ر.س
                  </span>
                </div>
                {estimatedLoyaltyPoints > 0 && (
                  <div className="pt-1.5 flex items-center justify-between text-emerald-500 text-[11px] font-bold">
                    <span>نقاط الولاء المكتسبة عند الدفع:</span>
                    <span className="font-mono">+{estimatedLoyaltyPoints} نقطة ✨</span>
                  </div>
                )}
              </div>

              {/* 💳 طرق وسياسة السداد للطلب */}
              <div className={`p-3.5 rounded-2xl border space-y-2.5 ${
                isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`flex items-center justify-between text-xs font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-emerald-500" />
                    <span>طريقة الدفع:</span>
                  </span>
                  {effectiveOrdersPolicy === 'online_only' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 border border-emerald-500/40 font-bold">
                      🔒 إلزامي أونلاين
                    </span>
                  )}
                  {effectiveOrdersPolicy === 'pay_at_store_only' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 border border-blue-500/40 font-bold">
                      💵 بالفرع فقط
                    </span>
                  )}
                  {effectiveOrdersPolicy === 'both' && (
                    <span className={`text-[10px] font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                      اختر طريقتك المفضلة
                    </span>
                  )}
                </div>

                {effectiveOrdersPolicy === 'both' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderPaymentMethod('online')}
                      className={`p-2.5 rounded-xl border text-right transition flex flex-col gap-0.5 ${
                        orderPaymentMethod === 'online'
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 shadow-sm'
                          : isDarkTheme ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs font-black flex items-center gap-1">
                        <span>💳 دفع إلكتروني</span>
                        {orderPaymentMethod === 'online' && <Check className="w-3.5 h-3.5 mr-auto text-emerald-500" />}
                      </span>
                      <span className="text-[10px] text-slate-500">مدى / فيزا / أبل باي</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderPaymentMethod('pay_at_store')}
                      className={`p-2.5 rounded-xl border text-right transition flex flex-col gap-0.5 ${
                        orderPaymentMethod === 'pay_at_store'
                          ? 'bg-blue-500/15 border-blue-500/50 text-blue-600 shadow-sm'
                          : isDarkTheme ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs font-black flex items-center gap-1">
                        <span>💵 دفع عند الاستلام</span>
                        {orderPaymentMethod === 'pay_at_store' && <Check className="w-3.5 h-3.5 mr-auto text-blue-500" />}
                      </span>
                      <span className="text-[10px] text-slate-500">نقداً أو شبكة بالفرع</span>
                    </button>
                  </div>
                ) : effectiveOrdersPolicy === 'online_only' ? (
                  <div className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                    isDarkTheme ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>يشترط المتجر السداد الإلكتروني المسبق بالبطاقة (مدى / فيزا) لتأكيد وتجهيز الطلب.</span>
                  </div>
                ) : (
                  <div className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                    isDarkTheme ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                  }`}>
                    <span className="text-base">💵</span>
                    <span>يتم تحصيل قيمة الطلب بالكامل عند استلام طلبك من الفرع أو للسيارة.</span>
                  </div>
                )}
              </div>
            </div>

            <div className={`p-4 border-t shrink-0 space-y-2.5 ${
              isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              {selectedBranch && (
                <div className="flex items-center justify-between text-xs pb-0.5">
                  <span className={`flex items-center gap-1.5 font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    <Building2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>الفرع: {selectedBranch.name}</span>
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${
                    branchStatus.isOpen
                      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                  }`}>
                    {branchStatus.isOpen ? '🟢 متاح للطلب' : '🔴 مغلق حالياً'}
                  </span>
                </div>
              )}

              {selectedBranch && !branchStatus.isOpen && (
                <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>عفواً، الفرع مغلق حالياً ولا يستقبل طلبات جديدة ({branchStatus.reason}).</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={submittingOrder || (Boolean(selectedBranch) && !branchStatus.isOpen)}
                className={`w-full py-3.5 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50 keep-white ${
                  selectedBranch && !branchStatus.isOpen
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : (effectiveOrdersPolicy === 'online_only' || (effectiveOrdersPolicy === 'both' && orderPaymentMethod === 'online'))
                    ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 shadow-xl shadow-emerald-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-600/25'
                }`}
              >
                {submittingOrder ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (effectiveOrdersPolicy === 'online_only' || (effectiveOrdersPolicy === 'both' && orderPaymentMethod === 'online')) ? (
                  <CreditCard className="w-5 h-5" />
                ) : (
                  <ShoppingBag className="w-5 h-5 fill-current" />
                )}
                <span>
                  {submittingOrder
                    ? 'جاري إرسال الطلب...'
                    : selectedBranch && !branchStatus.isOpen
                    ? 'الفرع مغلق حالياً 🔒'
                    : (effectiveOrdersPolicy === 'online_only' || (effectiveOrdersPolicy === 'both' && orderPaymentMethod === 'online'))
                    ? `سداد إلكترونياً بالبطاقة (${cartGrandTotal} ر.س) 💳`
                    : customer
                    ? 'تأكيد وإرسال الطلب للكاشير فوراً 🚀'
                    : 'إتمام الطلب وتأكيد الرقم 🚀'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {orderSuccessPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div
            className="glass-card max-w-md w-full rounded-3xl p-6 sm:p-8 space-y-5 border text-center relative shadow-2xl bg-slate-900"
            style={{ borderColor: `${safeAccentFill}80` }}
          >
            <button
              onClick={() => setOrderSuccessPayload(null)}
              className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            {(() => {
              const st = String(orderSuccessPayload.status || 'pending');
              if (st === 'preparing' || st === 'accepted') {
                return (
                  <>
                    <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-4xl mx-auto shadow-inner animate-pulse">
                      👨‍🍳
                    </div>
                    <div className="space-y-2">
                      <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/40 text-xs font-bold font-mono inline-block">
                        طلبك رقم #{orderSuccessPayload.order_id}
                      </span>
                      <h3 className="text-xl font-black text-amber-500">تم قبول الطلب وجاري التحضير!</h3>
                      <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                        الكاشير قبل طلبك وبدأ المطبخ في تجهيز أصنافك الآن بكل حب وعناية 🍳🔥
                      </p>
                    </div>
                  </>
                );
              }
              if (st === 'ready' || st === 'completed') {
                return (
                  <>
                    <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-4xl mx-auto shadow-inner animate-bounce">
                      🛍️
                    </div>
                    <div className="space-y-2">
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 text-xs font-bold font-mono inline-block">
                        طلبك رقم #{orderSuccessPayload.order_id}
                      </span>
                      <h3 className="text-xl font-black text-emerald-500">طلبك جاهز تماماً!</h3>
                      <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                        تم الانتهاء من تجهيز طلبك وهو جاهز للاستلام أو التوصيل، بالهناء والعافية ✨
                      </p>
                    </div>
                  </>
                );
              }
              if (st === 'cancelled') {
                return (
                  <>
                    <div className="w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-4xl mx-auto shadow-inner">
                      ❌
                    </div>
                    <div className="space-y-2">
                      <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/40 text-xs font-bold font-mono inline-block">
                        طلبك رقم #{orderSuccessPayload.order_id}
                      </span>
                      <h3 className="text-xl font-black text-rose-500">تم إلغاء الطلب</h3>
                      <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                        نعتذر منك، تم إلغاء هذا الطلب من إدارة المتجر.
                      </p>
                    </div>
                  </>
                );
              }
              return (
                <>
                  <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-4xl mx-auto shadow-inner animate-bounce">
                    ✅
                  </div>
                  <div className="space-y-2">
                    <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-xs font-bold font-mono inline-block">
                      طلبك رقم #{orderSuccessPayload.order_id}
                    </span>
                    <h3 className="text-xl font-black text-white">تم استلام طلبك وبانتظار الموافقة!</h3>
                    <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                      تم إرسال طلبك مباشرة لكاشير المتجر والمطبخ بنجاح! سيتم تجهيز طلبك فوراً 🚀
                    </p>
                  </div>
                </>
              );
            })()}

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs text-right">
              <div className="flex items-center justify-between text-slate-400">
                <span>الإجمالي:</span>
                <span className="font-mono text-white font-bold">{orderSuccessPayload.total_amount} ر.س</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>طريقة وسداد الطلب:</span>
                <span className="font-bold text-white">
                  {orderSuccessPayload.payment_status === 'paid'
                    ? '💳 مدفوع إلكترونياً (أونلاين) ✅'
                    : '💵 الدفع عند الاستلام بالفرع'}
                </span>
              </div>
              <div className="flex items-center justify-between text-emerald-500 font-bold">
                <span>النقاط المستحقة:</span>
                <span className="font-mono">+{orderSuccessPayload.loyalty_points_earned} نقطة ولاء</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderSuccessPayload(null);
                  setShowPastOrdersModal(true);
                }}
                className="w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm text-white keep-white bg-blue-600 hover:bg-blue-500 shadow-xl flex items-center justify-center gap-2 transition"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>تتبع حالة الطلب 📋</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderSuccessPayload(null)}
                className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                إغلاق والعودة للمحفظة
              </button>
            </div>
          </div>
        </div>
      )}

      {showPastOrdersModal && (() => {
        const customerServiceBookings = storeBookings.filter(
          (b) =>
            (customer?.phone && normalizePhone(b.customer_phone) === normalizePhone(customer.phone)) ||
            (customer?.id && b.customer_id === customer.id)
        );

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
            <div
              className={`w-full max-w-md border rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up ${
                isDarkTheme ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
              }`}
              style={{ borderColor: `${safeAccentFill}40` }}
            >
              <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
                isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-sm ${
                      safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                    }`}
                    style={{
                      backgroundColor: safeAccentFill,
                      color: safeAccentFillContrast,
                    }}
                  >
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`text-sm sm:text-base font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                      سجل طلباتي ومواعيدي
                    </h3>
                    <p className={`text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                      تتبع الطلب الحالي أو إعادة الطلب بضغطة زر
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPastOrdersModal(false)}
                  className={`p-2 rounded-xl transition ${
                    isDarkTheme ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-200/80 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(activeModules.orders && (activeModules.bookings || customerServiceBookings.length > 0)) && (
                <div className={`px-4 pt-3 pb-1 shrink-0 ${isDarkTheme ? 'bg-slate-900' : 'bg-white'}`}>
                  <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border ${
                    isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setPastModalTab('orders')}
                      style={
                        pastModalTab === 'orders'
                          ? { backgroundColor: safeAccentFill, color: safeAccentFillContrast }
                          : undefined
                      }
                      className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                        pastModalTab === 'orders'
                          ? `shadow-sm ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                          : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>طلباتي 🛍️</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-mono">
                        {pastOrders.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPastModalTab('bookings')}
                      style={
                        pastModalTab === 'bookings'
                          ? { backgroundColor: safeAccentFill, color: safeAccentFillContrast }
                          : undefined
                      }
                      className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                        pastModalTab === 'bookings'
                          ? `shadow-sm ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
                          : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>مواعيدي 📅</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-mono">
                        {customerServiceBookings.length}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1 text-right">
                {pastModalTab === 'orders' && (
                  <>
                    {pastOrders.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 space-y-2">
                        <History className="w-10 h-10 mx-auto text-slate-500" />
                        <p className="text-xs">لا توجد طلبات سابقة مسجلة حتى الآن.</p>
                      </div>
                    ) : (
                      pastOrders.map((order: any) => {
  const fulfillmentType = order.order_type || order.fulfillment_type || 'takeaway';
  const orderNumber = order.order_number || order.order_id || String(order.id).substring(0, 5);
  const itemsCalculatedSum = Array.isArray(order.items)
    ? order.items.reduce(
        (sum: number, item: any) =>
          sum + (Number(item.total_price) || Number(item.quantity || 1) * Number(item.catalog_item?.price || item.price || 0)),
        0
      )
    : 0;
  const totalPrice = Number(order.total_price) || Number(order.total_amount) || itemsCalculatedSum || 0;
  const status = order.status || 'pending';
  const isLive = !['completed', 'cancelled'].includes(status);
  
  const fulfillmentTitles: Record<string, string> = {
    dine_in: '🍽️ محلي',
    takeaway: '🚗 سفري',
    delivery: '🛵 توصيل',
    service_booking: '💇‍♂️ حجز موعد',
  };

  const getStatusStep = (st: string) => {
    if (fulfillmentType === 'delivery') {
      if (order.delivery_status === 'picked_up') return 3;
      if (st === 'ready') return 2;
      if (st === 'accepted' || st === 'preparing') return 1;
      return 0;
    }
    if (st === 'pending') return 0;
    if (st === 'accepted') return 1;
    if (st === 'preparing') return 2;
    if (st === 'ready') return 3;
    return 0;
  };

  const step = getStatusStep(status);

  return (
    <div
      key={order.id || order.order_id || Math.random()}
      className={`p-4 rounded-3xl border space-y-4 shadow-lg ${
        isLive
          ? isDarkTheme
            ? 'bg-slate-950 border-amber-500/40 shadow-amber-900/20'
            : 'bg-white border-amber-400/70 shadow-amber-500/10'
          : isDarkTheme
          ? 'bg-slate-950 border-slate-800'
          : 'bg-slate-50/80 border-slate-200/90'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-black shadow-2xs ${
              safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
            }`}
            style={{
              backgroundColor: safeAccentFill,
              color: safeAccentFillContrast,
            }}
          >
            #{orderNumber}
          </span>
          <span className={`text-[10px] font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
            {fulfillmentTitles[fulfillmentType] || fulfillmentType}
          </span>
          {order.payment_status === 'paid' ? (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 font-bold flex items-center gap-1">
              💳 مسدد أونلاين ✅
            </span>
          ) : (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 border border-amber-500/30 font-bold flex items-center gap-1">
              {fulfillmentType === 'delivery' ? '💵 الدفع عند الاستلام' : '💵 الدفع بالفرع'}
            </span>
          )}
          {!isLive && status === 'completed' && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 font-bold">
              ✓ مكتمل
            </span>
          )}
          {!isLive && status === 'cancelled' && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 border border-rose-500/30 font-bold">
              ❌ ملغي
            </span>
          )}
        </div>

        <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
          {new Date(order.created_at).toLocaleDateString('ar-SA')}
        </span>
      </div>

      {isLive && (
        <div className="py-4 px-2 relative mt-2 mb-4" dir="rtl">
          <div className={`absolute top-6 left-6 right-6 h-1.5 rounded-full z-0 ${isDarkTheme ? 'bg-slate-800' : 'bg-slate-200'}`}></div>
          <div className={`absolute top-6 right-6 h-1.5 bg-amber-500 rounded-full z-0 transition-all duration-700 ease-in-out ${step === 0 ? 'w-0' : step === 1 ? 'w-1/3' : step === 2 ? 'w-[66%]' : 'w-[calc(100%-3rem)]'}`}></div>
          
          <div className="flex justify-between items-start relative z-10">
            <div className={`flex flex-col items-center gap-2 w-16 transition-colors duration-500 ${step >= 0 ? 'text-amber-600 font-black' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-md transition-all duration-500 ${step >= 0 ? 'bg-amber-500 border-2 border-amber-200 text-amber-950 scale-110' : isDarkTheme ? 'bg-slate-800 border-2 border-slate-700' : 'bg-white border-2 border-slate-200'}`}>⏳</div>
              <span className="text-[9px] sm:text-[10px] font-bold text-center leading-tight">بانتظار التأكيد</span>
            </div>
            
            <div className={`flex flex-col items-center gap-2 w-16 transition-colors duration-500 ${step >= 1 ? 'text-amber-600 font-black' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-md transition-all duration-500 ${step >= 1 ? 'bg-amber-500 border-2 border-amber-200 text-amber-950 scale-110' : isDarkTheme ? 'bg-slate-800 border-2 border-slate-700' : 'bg-white border-2 border-slate-200'}`}>👨‍🍳</div>
              <span className="text-[9px] sm:text-[10px] font-bold text-center leading-tight">
                {fulfillmentType === 'delivery' ? 'يجهز بالمطبخ' : 'تم القبول'}
              </span>
            </div>

            <div className={`flex flex-col items-center gap-2 w-16 transition-colors duration-500 ${step >= 2 ? 'text-amber-600 font-black' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-md transition-all duration-500 ${step >= 2 ? 'bg-amber-500 border-2 border-amber-200 text-amber-950 scale-110' : isDarkTheme ? 'bg-slate-800 border-2 border-slate-700' : 'bg-white border-2 border-slate-200'}`}>
                {fulfillmentType === 'delivery' ? '📦' : '🔥'}
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-center leading-tight">
                {fulfillmentType === 'delivery' ? 'جاهز للاستلام' : 'جاري التحضير'}
              </span>
            </div>

            <div className={`flex flex-col items-center gap-2 w-16 transition-colors duration-500 ${step >= 3 ? 'text-amber-600 font-black' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-md transition-all duration-500 ${step >= 3 ? 'bg-amber-500 border-2 border-amber-200 text-amber-950 scale-110' : isDarkTheme ? 'bg-slate-800 border-2 border-slate-700' : 'bg-white border-2 border-slate-200'}`}>
                {fulfillmentType === 'delivery' ? '🛵' : '✅'}
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-center leading-tight">{fulfillmentType === 'delivery' ? 'في الطريق إليك' : 'جاهز للاستلام'}</span>
            </div>
          </div>
        </div>
      )}

      {/* 🛵 Assigned Driver Live Tracking Card */}
      {order.driver_name && isLive && (
        <div className={`p-3 rounded-2xl border shadow-md flex items-center justify-between gap-3 animate-fade-in my-2 ${
          isDarkTheme
            ? 'bg-amber-950/40 border-amber-500/40 text-amber-100'
            : 'bg-amber-50/90 border-amber-300 text-slate-900'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center text-xl shrink-0 ${
              isDarkTheme ? 'bg-amber-500/20 border-amber-500/40' : 'bg-amber-500/15 border-amber-400/50'
            }`}>
              🛵
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-xs font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{order.driver_name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black">
                  {order.delivery_status === 'picked_up' ? 'في الطريق إليك 🛵' : 'كابتن التوصيل'}
                </span>
              </div>
              <p className={`text-[11px] font-mono font-bold mt-0.5 truncate ${isDarkTheme ? 'text-amber-300' : 'text-amber-900'}`} dir="ltr">
                {order.driver_phone}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {order.driver_phone && (
              <a
                href={`tel:${order.driver_phone}`}
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition shadow-2xs ${
                  isDarkTheme
                    ? 'bg-slate-900 border-amber-500/40 text-amber-400 hover:bg-amber-500 hover:text-slate-950'
                    : 'bg-white border-amber-300 text-amber-700 hover:bg-amber-500 hover:text-slate-950'
                }`}
                title="اتصال بالسائق"
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
            {order.driver_phone && (
              <a
                href={`https://wa.me/${order.driver_phone.replace(/^0/, '966').replace(/\D/g, '')}?text=${encodeURIComponent(
                  `مرحباً كابتن ${order.driver_name}، أنا صاحب الطلب #${orderNumber}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition shadow-2xs ${
                  isDarkTheme
                    ? 'bg-slate-900 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950'
                    : 'bg-white border-emerald-300 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                }`}
                title="محادثة واتساب"
              >
                <MessageSquare className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      )}

      <div className={`space-y-2 text-xs p-3.5 rounded-xl border ${
        isDarkTheme ? 'text-slate-200 bg-slate-900/60 border-slate-800/80' : 'text-slate-800 bg-slate-50 border-slate-200/80'
      }`}>
        {order.items && order.items.map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between items-center">
            <span className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-emerald-600 bg-emerald-500/15 px-1.5 py-0.5 rounded text-[10px]">{item.quantity}x</span>
              <span className="font-bold">{item.catalog_item?.name || item.name || 'عنصر غير معروف'}</span>
              {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                <span className="text-[10px] text-slate-500">
                  ({item.selected_modifiers.map((m: any) => m.name).join(", ")})
                </span>
              )}
            </span>
            <span className={`font-mono font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
              {item.total_price || (item.quantity * (item.catalog_item?.price || item.price || 0))} ر.س
            </span>
          </div>
        ))}
      </div>

      <div className="pt-2 flex items-center justify-between text-xs">
        <div>
          <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>الإجمالي: </span>
          <strong className={`font-mono text-base font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{totalPrice} ر.س</strong>
        </div>

        <button
          type="button"
          onClick={() => !isLive && handleReOrder(order)}
          disabled={isLive}
          style={
            isLive
              ? undefined
              : {
                  backgroundColor: safeAccentFill,
                  color: safeAccentFillContrast,
                }
          }
          className={`px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-md transition ${
            isLive
              ? isDarkTheme
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-slate-200 text-slate-600 cursor-not-allowed'
              : `hover:brightness-110 active:scale-95 ${safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''}`
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isLive ? 'قيد التنفيذ ⏳' : 'إعادة الطلب 🔁'}</span>
        </button>
      </div>
    </div>
  );
})
                    )}
                  </>
                )}

                {pastModalTab === 'bookings' && (
                  <>
                    {customerServiceBookings.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 space-y-2">
                        <Calendar className="w-10 h-10 mx-auto text-slate-500" />
                        <p className="text-xs">لا توجد حجوزات مواعيد سابقة مسجلة برقمك.</p>
                      </div>
                    ) : (
                      customerServiceBookings.map((bk) => (
                        <div
                          key={bk.id}
                          className={`p-4 rounded-2xl border space-y-3 shadow-md ${
                            isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold ${
                                  safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                                }`}
                                style={{ backgroundColor: safeAccentFill, color: safeAccentFillContrast }}
                              >
                                #{bk.booking_number ? String(bk.booking_number).slice(-6) : String(bk.id).slice(-6)}
                              </span>
                              {bk.service_category && (
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                  isDarkTheme ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {bk.service_category}
                                </span>
                              )}
                              {bk.status === 'completed' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 font-bold">
                                  ✓ تم الحضور
                                </span>
                              )}
                              {bk.status === 'confirmed' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-600 border border-sky-500/30 font-bold">
                                  📅 مؤكد
                                </span>
                              )}
                              {bk.status === 'cancelled' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-600 border border-rose-500/30 font-bold">
                                  ✕ ملغي
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
                              {bk.booking_date} | {bk.booking_time}
                            </span>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between items-center">
                              <strong className={`text-sm font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{bk.service_name}</strong>
                              <span className="font-mono font-black" style={{ color: safeAccentText }}>{bk.total_price ?? bk.service_price ?? 0} ر.س</span>
                            </div>

                            {bk.selected_modifiers && bk.selected_modifiers.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {bk.selected_modifiers.map((mod, i) => (
                                  <span
                                    key={i}
                                    className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-600 font-bold"
                                  >
                                    +{mod.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className={`flex items-center justify-between text-[11px] pt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                              <span>المختص: <strong style={{ color: safeAccentText }}>{bk.specialist_name || 'أي مختص متاح'}</strong></span>
                              <span>المدة: {bk.duration_minutes || bk.service_duration_minutes || 30} دقيقة</span>
                            </div>
                          </div>

                          <div className={`pt-2 border-t flex items-center justify-between text-xs ${
                            isDarkTheme ? 'border-slate-800/80' : 'border-slate-200'
                          }`}>
                            <div className="text-emerald-600 text-[11px] font-bold">
                              +{bk.points_to_earn || bk.loyalty_points_earned || 0} نقطة ولاء
                            </div>

                            <button
                              type="button"
                              onClick={() => handleReBookService(bk)}
                              style={{ backgroundColor: safeAccentFill, color: safeAccentFillContrast }}
                              className={`px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 shadow transition active:scale-95 ${
                                safeAccentFillContrast === '#FFFFFF' ? 'keep-white' : ''
                              }`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>إعادة حجز الموعد 🔁</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative max-w-md w-full">
            <CustomerLoginGate
              store={store}
              initialName={guestName || savedProfile?.name || ''}
              initialPhone={guestPhone || savedProfile?.phone || ''}
              onClose={() => {
                setShowLoginModal(false);
                setPendingAuthAction(null);
              }}
              onAuthenticated={handleCustomerAuthenticated}
            />
          </div>
        </div>
      )}

      {/* 💳 بوابة السداد والدفع الإلكتروني السريع للعميل */}
      {isPaymentModalOpen && paymentModalConfig && (
        <SandboxPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setPaymentModalConfig(null);
          }}
          title={paymentModalConfig.title}
          itemDescription={paymentModalConfig.itemDescription}
          amount={paymentModalConfig.amount}
          currency="ر.س"
          storeName={store.name}
          provider={store.fulfillment_settings?.payment_config?.online_provider || 'sandbox'}
          gatewayMode={store.fulfillment_settings?.payment_config?.online_mode || 'sandbox'}
          onProcessPayment={paymentModalConfig.onSuccess}
        />
      )}

      {/* 📱 نافذة ومحاكي بطاقة Apple Wallet & Google Wallet الذكية */}
      <WalletPassModal
        isOpen={isWalletPassModalOpen}
        onClose={() => setIsWalletPassModalOpen(false)}
        store={store}
        customer={customer}
        tier={currentTierObj}
        storeBranches={branches}
        initialPlatform={walletPassPlatform}
      />

    </div>
  );
};
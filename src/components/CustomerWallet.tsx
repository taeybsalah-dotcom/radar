import React, { useState, useEffect, useRef } from 'react';
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
} from '../types';
import { LoyaltyService, normalizePhone } from '../lib/supabase';
import { LoyaltyEvents } from '../lib/events';
import { playBeepSound } from '../lib/sound';
import { CustomerLoginGate } from './CustomerLoginGate';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  QrCode,
  Flame,
  Award,
  ShieldCheck,
  CheckCircle2,
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
  Search,
  Filter,
  RotateCcw,
  History,
  Scissors,
  BookmarkCheck,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';

interface CustomerWalletProps {
  store: Store;
}

export const CustomerWallet: React.FC<CustomerWalletProps> = ({ store: initialStore }) => {
  const [store, setStore] = useState<Store>(initialStore);

  useEffect(() => {
    if (initialStore) setStore(initialStore);
  }, [initialStore]);

  const brandPrimary = store?.primary_color || '#0F172A';
  const brandSecondary = store?.secondary_color || '#d4af37';

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [privileges, setPrivileges] = useState<Privilege[]>([]);
  const [customerCoupons, setCustomerCoupons] = useState<CustomerCoupon[]>([]);
  const [selectedCouponForQR, setSelectedCouponForQR] = useState<CustomerCoupon | null>(null);
  const [selectedRewardPass, setSelectedRewardPass] = useState<Privilege | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'pass' | 'menu' | 'services' | 'perks' | 'tickets' | 'tiers'>('pass');

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [pastOrders, setPastOrders] = useState<WhatsAppOrderPayload[]>([]);
  const [showPastOrdersModal, setShowPastOrdersModal] = useState(false);

  const [specialists, setSpecialists] = useState<StoreSpecialist[]>([]);
  const [storeBookings, setStoreBookings] = useState<ServiceBooking[]>([]);
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
  const [partySize, setPartySize] = useState(1);
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [arrivalTime, setArrivalTime] = useState('18:00');
  const [carPlate, setCarPlate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryGpsLink, setDeliveryGpsLink] = useState('');
  const [specialistName, setSpecialistName] = useState('');
  const [generalOrderNotes, setGeneralOrderNotes] = useState('');
  const [orderSuccessPayload, setOrderSuccessPayload] = useState<WhatsAppOrderPayload | null>(null);

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

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const [isFullscreenQR, setIsFullscreenQR] = useState(false);

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
    title: store?.name || 'متجر رادار',
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
  }, [store?.name]);

  useEffect(() => {
    if (!store?.id) return;
    loadInitialData();

    const unsubscribe = LoyaltyEvents.listen((event) => {
      const curStore = storeRef.current;
      const curCust = customerRef.current;

      if (event.type === 'SCAN_REJECTED') {
        const isTargetCustomer =
          event.storeId === store?.id ||
          (curCust && event.phone && normalizePhone(event.phone) === normalizePhone(curCust.phone));
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
          }
          refreshCustomerData();
          return;
        }

        if (event.type === 'POINTS_ADDED') {
          const isMyPoints =
            event.phone && curCust && normalizePhone(event.phone) === normalizePhone(curCust.phone);
          if (isMyPoints && event.points) {
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

        if (event.type === 'STORE_UPDATED') {
          LoyaltyService.resolveStore(store.id || store.slug).then((fresh) => {
            if (fresh) setStore(fresh);
          }).catch(() => {});
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

      const [freshStore, t, p, cat, specs, bks, freshCoupons] = await Promise.all([
        LoyaltyService.resolveStore(store.id || store.slug),
        LoyaltyService.getTiers(store.id),
        LoyaltyService.getPrivileges(store.id),
        LoyaltyService.getCatalogItems(store.id),
        LoyaltyService.getStoreSpecialists(store.id),
        LoyaltyService.getStoreBookings(store.id),
        freshCust ? LoyaltyService.getCustomerCoupons(freshCust.id, store.id, freshCust.phone) : Promise.resolve([]),
      ]);

      if (freshStore) setStore(freshStore);
      setTiers(t.sort((a, b) => a.required_xp - b.required_xp));
      setPrivileges(p);
      setCatalogItems(cat || []);
      setSpecialists(specs || []);
      setStoreBookings(bks || []);
      if (freshCoupons) setCustomerCoupons(freshCoupons);

      if (freshCust) {
        setCustomer(freshCust);
        lastPointsRef.current = freshCust.wallet_balance;
        regenerateToken(freshCust, null);
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
      if (!isSubscribed) return;
      try {
        const [freshCust, freshCoupons] = await Promise.all([
          LoyaltyService.getCustomer(store.id, customer.phone),
          LoyaltyService.getCustomerCoupons(customer.id, store.id, customer.phone),
        ]);

        if (!isSubscribed) return;

        if (freshCust) {
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

    const lightInterval = setInterval(runLightSync, 5000);

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
    try {
      const stored = JSON.parse(localStorage.getItem('radar_local_whatsapp_orders') || '[]');
      if (Array.isArray(stored)) {
        const matching = stored.filter(
          (o: any) =>
            o.store_id === store.id &&
            (!customer?.phone || normalizePhone(o.customer_phone) === normalizePhone(customer.phone))
        );
        setPastOrders(matching);
      }
    } catch {
      setPastOrders([]);
    }
  }, [store?.id, customer?.phone, isCartModalOpen, orderSuccessPayload]);

  const handleCustomerAuthenticated = async (authCustomer: Customer) => {
    setCustomer(authCustomer);
    lastPointsRef.current = authCustomer.wallet_balance;
    regenerateToken(authCustomer, null);
    try {
      const cpns = await LoyaltyService.getCustomerCoupons(authCustomer.id, store.id, authCustomer.phone);
      setCustomerCoupons(cpns);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => {
    LoyaltyService.clearCustomerSession(store.id, store.slug);
    setCustomer(null);
    setSelectedCouponForQR(null);
    setCurrentQRToken(null);
  };

  const openEditName = () => {
    setNameInput(customer?.name || '');
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!customer || !nameInput.trim()) return;
    setSavingName(true);
    try {
      const updated = await LoyaltyService.updateCustomer(customer.id, { name: nameInput.trim() });
      setCustomer(updated);
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

  if (!customer && !loading) {
    return <CustomerLoginGate store={store} onAuthenticated={handleCustomerAuthenticated} />;
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

  const handleConfirmServiceBooking = async () => {
    if (!selectedBookingService || !customer) return;

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
      const merchantPhone = store.manager_contact || '0577371780';
      const createdBooking = await LoyaltyService.createServiceBooking({
        store_id: store.id,
        store_name: store.name,
        customer_id: customer.id,
        customer_name: customer.name || 'عميل المتجر',
        customer_phone: customer.phone,
        service_id: selectedBookingService.id,
        service_name: selectedBookingService.name,
        service_category: selectedBookingService.category,
        service_price: selectedBookingService.price,
        selected_modifiers: flatModifiers,
        total_price: finalPrice,
        service_duration_minutes: selectedBookingService.duration_minutes || 30,
        duration_minutes: selectedBookingService.duration_minutes || 30,
        specialist_id: selectedBookingSpecialist?.id,
        specialist_name: selectedBookingSpecialist?.name,
        booking_date: selectedBookingDate,
        booking_time: selectedBookingTime,
        status: 'confirmed',
        points_to_earn: Math.floor(finalPrice * (store.points_per_riyal || 1)),
        notes: bookingNotes.trim() || undefined,
      });

      setStoreBookings((prev) => [createdBooking, ...prev]);
      setBookingSuccessData(createdBooking);

      const whatsappUrl = LoyaltyService.generateWhatsAppBookingUrl(merchantPhone, createdBooking);
      window.open(whatsappUrl, '_blank');

      playBeepSound('success');
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 },
      });
    } catch (err) {
      console.error('Booking creation error:', err);
    } finally {
      setBookingSubmitting(false);
    }
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
  const deliveryFee = isDelivery ? (store.fulfillment_settings?.delivery_fee || 0) : 0;
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

  const handleSendWhatsAppOrder = () => {
    if (cartItems.length === 0) return;

    const orderId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const payload: WhatsAppOrderPayload = {
      order_id: orderId,
      store_id: store.id,
      store_name: store.name,
      customer_name: customer?.name || 'عميل المتجر',
      customer_phone: customer?.phone || '',
      customer_tier: currentTierObj?.tier_name,
      items: cartItems,
      fulfillment_type: fulfillmentType,
      fulfillment_details: {
        table_number: tableNumber.trim() || undefined,
        party_size: partySize > 0 ? partySize : undefined,
        arrival_date: arrivalDate || undefined,
        arrival_time: arrivalTime || undefined,
        car_model_and_plate: carPlate.trim() || undefined,
        delivery_address: deliveryAddress.trim() || undefined,
        delivery_gps_link: deliveryGpsLink.trim() || undefined,
        specialist_name: specialistName.trim() || undefined,
        general_notes: generalOrderNotes.trim() || undefined,
      },
      subtotal: cartSubtotal,
      delivery_fee: deliveryFee,
      total_amount: cartGrandTotal,
      loyalty_points_earned: estimatedLoyaltyPoints,
      status: 'pending',
      points_awarded: false,
      created_at: new Date().toISOString(),
    };

    const merchantPhone = store.manager_contact || '0577371780';
    const whatsappUrl = LoyaltyService.generateWhatsAppOrderUrl(merchantPhone, payload);
    window.open(whatsappUrl, '_blank');

    try {
      const existingOrders = JSON.parse(localStorage.getItem('radar_local_whatsapp_orders') || '[]');
      existingOrders.unshift(payload);
      localStorage.setItem('radar_local_whatsapp_orders', JSON.stringify(existingOrders));
      window.dispatchEvent(new Event('radar_orders_updated'));
    } catch (e) {
      console.warn('Could not save local order history', e);
    }

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

      <div className="bg-slate-900/90 backdrop-blur-2xl px-4 py-3 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center font-bold text-slate-300 shrink-0">
            <User className="w-4 h-4 text-slate-300" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-sm sm:text-base">
                {customer?.name || 'عميل VIP'}
              </span>
              <button
                onClick={openEditName}
                className="text-slate-400 hover:text-white p-0.5 transition"
                style={{ color: brandSecondary }}
                title="تعديل الاسم"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 font-mono" dir="ltr">
              {customer?.phone}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <div
            className="px-3 py-1.5 rounded-xl border flex items-center space-x-1.5 rtl:space-x-reverse shadow-inner"
            style={{
              backgroundColor: `${brandSecondary}15`,
              borderColor: `${brandSecondary}30`,
            }}
          >
            <span
              className="text-xs font-black font-mono"
              style={{ color: brandSecondary }}
            >
              {customer?.wallet_balance ?? 0}
            </span>
            <span className="text-[10px] text-slate-400 font-bold">نقطة</span>
          </div>

          <NotificationBell
            portalName={store.name || 'محفظة العميل'}
            portalFilter="customer"
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white"
          />

          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 border border-slate-700/60 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 flex items-center justify-center transition"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
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

      {activeTab === 'pass' && (
        <div className="space-y-4 animate-fade-in">
          
          <div
            className="relative group select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="relative rounded-3xl border border-slate-800 shadow-2xl overflow-hidden min-h-[175px] sm:min-h-[195px] flex flex-col justify-end p-5 sm:p-6 transition-all duration-500"
              style={{
                backgroundColor: store.primary_color || '#0F172A',
                borderColor: `${store.secondary_color || '#d4af37'}30`,
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
                className="relative z-10 space-y-1.5 text-right animate-fade-in"
              >
                {activeSlide.badge_text && (
                  <div>
                    <span
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black shadow-md border border-white/10"
                      style={{
                        backgroundColor: store.secondary_color || '#d4af37',
                        color: '#000000',
                      }}
                    >
                      <span>👑</span>
                      <span>{activeSlide.badge_text}</span>
                    </span>
                  </div>
                )}

                <h2 className="font-black text-white text-base sm:text-lg leading-tight tracking-tight drop-shadow-md">
                  {activeSlide.title || store.name}
                </h2>

                {activeSlide.quote && (
                  <p className="text-[11px] sm:text-xs text-slate-200 leading-relaxed font-normal drop-shadow-sm max-w-[95%] line-clamp-2">
                    "{activeSlide.quote}"
                  </p>
                )}
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
                      className={`h-2 rounded-full transition-all duration-300 ${
                        safeSlideIndex === idx
                          ? 'w-6 shadow-md'
                          : 'w-2 bg-white/40 hover:bg-white/70'
                      }`}
                      style={{
                        backgroundColor: safeSlideIndex === idx ? (store.secondary_color || '#F59E0B') : undefined,
                      }}
                      aria-label={`Slide ${idx + 1}`}
                    ></button>
                  ))}
                </div>
              )}

            </div>
          </div>

          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 backdrop-blur-xl space-y-3.5 shadow-xl">
            
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">رصيدك الحالي</span>
                <div className="flex items-baseline space-x-2 rtl:space-x-reverse mt-0.5">
                  <span
                    className="text-3xl font-black font-mono tracking-tight"
                    style={{ color: brandSecondary }}
                  >
                    {customer?.wallet_balance?.toLocaleString() ?? 0}
                  </span>
                  <span className="text-xs text-slate-300 font-bold">نقطة</span>
                </div>
              </div>

              <div
                className="w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 shadow-inner"
                style={{
                  backgroundColor: `${brandSecondary}18`,
                  borderColor: `${brandSecondary}35`,
                  color: brandSecondary,
                }}
              >
                <Coins className="w-6 h-6" />
              </div>
            </div>

            <div className="space-y-2 pt-0.5">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <span className="text-slate-400">مكانتك:</span>
                  <strong className="text-white flex items-center gap-1 font-bold">
                    <span>👑</span>
                    <span>{currentTierObj?.tier_name}</span>
                  </strong>
                </span>

                {nextTierObj ? (
                  <span className="text-slate-400 text-[11px]">
                    باقي <strong className="font-mono" style={{ color: brandSecondary }}>{xpNeeded} XP</strong> للوصول إلى{' '}
                    <strong className="text-white">{nextTierObj.tier_name}</strong>
                  </span>
                ) : (
                  <span className="font-bold text-[11px] flex items-center gap-1" style={{ color: brandSecondary }}>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>وصلت لأعلى مستوى ملكي! 👑</span>
                  </span>
                )}
              </div>

              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800 shadow-inner">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
                  style={{
                    width: `${progressPercent}%`,
                    background: `linear-gradient(to right, ${brandPrimary}, ${brandSecondary})`,
                    boxShadow: `0 0 10px ${brandSecondary}50`,
                  }}
                ></div>
              </div>
            </div>

          </div>

          {selectedCouponForQR && (
            <div
              className="p-3.5 rounded-2xl border flex items-center justify-between gap-3 animate-fade-in shadow-lg"
              style={{
                backgroundColor: `${brandSecondary}18`,
                borderColor: `${brandSecondary}45`,
              }}
            >
              <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                <Ticket className="w-5 h-5 shrink-0" style={{ color: brandSecondary }} />
                <div>
                  <h4 className="text-xs font-black text-white">
                    جاهز لصرف امتياز: <span style={{ color: brandSecondary }}>{selectedCouponForQR.privilege_title}</span>
                  </h4>
                  <p className="text-[10px] text-slate-300 font-mono">
                    كود: {selectedCouponForQR.coupon_code} | الساعات:{' '}
                    {selectedCouponForQR.valid_start_time
                      ? `${selectedCouponForQR.valid_start_time} - ${selectedCouponForQR.valid_end_time}`
                      : 'متاح 24/7'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedCouponForQR(null);
                  if (customer) regenerateToken(customer, null);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-slate-300 text-[11px] font-bold border border-slate-700 shrink-0 transition"
              >
                إلغاء
              </button>
            </div>
          )}

          <div className="relative group">
            
            <div
              className="absolute -inset-1 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-700 pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${brandSecondary}40 0%, transparent 70%)`,
              }}
            ></div>

            <div className="glass-qr-shield rounded-3xl p-5 sm:p-6 relative overflow-hidden backdrop-blur-2xl shadow-2xl flex flex-col items-center space-y-4 border border-slate-800 bg-slate-900/90">
              
              <div className="w-full flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-1.5 rtl:space-x-reverse text-slate-300 text-[11px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>{selectedCouponForQR ? '🎟️ رمز صرف الهدية / الامتياز' : 'امسح الباركود لتسجيل زيارتك وكسب النقاط'}</span>
                </div>

                {selectedCouponForQR ? (
                  <div className="flex items-center space-x-1.5 rtl:space-x-reverse bg-emerald-950/80 border border-emerald-500/40 px-3 py-1 rounded-full text-[10px] text-emerald-300 font-bold shadow-inner">
                    <span>✨ رمز جاهز للصرف</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5 rtl:space-x-reverse bg-slate-950 border border-slate-800 px-3 py-1 rounded-full text-[10px] text-slate-300 font-mono shadow-inner">
                    <Clock className="w-3 h-3" style={{ color: brandSecondary }} />
                    <span>يتجدد:</span>
                    <strong className="font-bold" style={{ color: brandSecondary }}>{timeLeft}s</strong>
                    <button
                      type="button"
                      onClick={() => {
                        if (customer) {
                          regenerateToken(customer, null);
                          playBeepSound('success');
                        }
                      }}
                      className="p-1 hover:text-white transition text-slate-400 hover:rotate-180 duration-300"
                      title="تحديث الرمز فوراً"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="relative p-3">
                
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 rounded-tr-lg pointer-events-none" style={{ borderColor: `${brandSecondary}cc` }}></div>
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 rounded-tl-lg pointer-events-none" style={{ borderColor: `${brandSecondary}cc` }}></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 rounded-br-lg pointer-events-none" style={{ borderColor: `${brandSecondary}cc` }}></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 rounded-bl-lg pointer-events-none" style={{ borderColor: `${brandSecondary}cc` }}></div>

                <div
                  onClick={() => setIsFullscreenQR(true)}
                  className={`relative p-3.5 rounded-3xl bg-white shadow-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] overflow-hidden ${
                    isCouponFrozen ? 'opacity-30 grayscale blur-[1px]' : ''
                  }`}
                  title="انقر لتكبير الباركود بملء الشاشة"
                >
                  <QRCodeSVG
                    value={qrDataPayload}
                    size={210}
                    level="M"
                    includeMargin={true}
                  />

                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-bold gap-1 rounded-3xl">
                    <Maximize2 className="w-4 h-4" style={{ color: brandSecondary }} />
                    <span>تكبير</span>
                  </div>
                </div>
              </div>

              <div className="w-full pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center space-x-1.5 rtl:space-x-reverse text-slate-300">
                  <span className="text-slate-400">
                    {selectedCouponForQR ? 'كود الكوبون:' : 'كود العضو:'}
                  </span>
                  <span className="font-bold text-white tracking-wider">
                    {selectedCouponForQR
                      ? selectedCouponForQR.coupon_code
                      : customer?.phone
                      ? `VIP-${customer.phone.slice(-6)}`
                      : 'VIP-89010'}
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        selectedCouponForQR
                          ? selectedCouponForQR.coupon_code
                          : customer?.phone
                          ? `VIP-${customer.phone.slice(-6)}`
                          : 'VIP-89010',
                        'vip-id'
                      )
                    }
                    className="text-slate-400 hover:text-white p-0.5 transition"
                    title="نسخ الكود"
                  >
                    {copiedCodeKey === 'vip-id' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-sans font-semibold">
                  <span>● جاهز للمسح</span>
                </div>
              </div>

              {selectedCouponForQR ? (
                <p className="text-xs font-bold text-center pt-0.5" style={{ color: brandSecondary }}>
                  أبرز هذا الباركود للكاشير لصرف وتسليم طلبك فوراً 🎁
                </p>
              ) : (
                <p className="text-[10px] text-slate-400 text-center font-medium pt-0.5">
                  أبرز الرمز للكاشير عند الدفع لكسب النقاط واستبدال الامتيازات
                </p>
              )}

            </div>
          </div>

        </div>
      )}

      {activeTab === 'menu' && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 backdrop-blur-xl space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" style={{ color: brandSecondary }} />
                  <span>المنيو والمنتجات 🍔</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  اختر وجباتك ومشروباتك، خصّص إضافاتك، واطلب بكل سهولة
                </p>
              </div>
              <span
                className="text-xs px-3 py-1 rounded-full border font-mono font-bold bg-slate-950"
                style={{ color: brandSecondary, borderColor: `${brandSecondary}40` }}
              >
                {filteredCatalogItems.length} صنف
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="ابحث عن وجبة، مشروب، أو صنف..."
                className="w-full bg-slate-950/90 border border-slate-800 rounded-2xl pr-10 pl-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 transition"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
              {catalogSearch && (
                <button
                  type="button"
                  onClick={() => setCatalogSearch('')}
                  className="absolute left-3 top-2.5 p-0.5 rounded-full bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {pastOrders.length > 0 && (
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-950/90 border border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-300 font-bold">لديك ({pastOrders.length}) طلبات سابقة</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPastOrdersModal(true)}
                  style={{ color: brandSecondary }}
                  className="font-black hover:underline flex items-center gap-1 text-[11px] bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800"
                >
                  <span>إعادة الطلب 🔁</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                style={
                  selectedCategory === 'ALL'
                    ? {
                        backgroundColor: brandSecondary,
                        color: '#000000',
                      }
                    : undefined
                }
                className={`px-3.5 py-1.5 rounded-full font-bold transition whitespace-nowrap ${
                  selectedCategory === 'ALL'
                    ? 'shadow-md font-black'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                🌟 الكل ({catalogItems.filter((i) => i.is_available && i.item_type !== 'service').length})
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
                            backgroundColor: brandSecondary,
                            color: '#000000',
                          }
                        : undefined
                    }
                    className={`px-3.5 py-1.5 rounded-full font-bold transition whitespace-nowrap ${
                      isSelected
                        ? 'shadow-md font-black'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {filteredCatalogItems.length === 0 ? (
            <div className="py-14 text-center text-slate-400 border border-dashed border-slate-800 rounded-3xl bg-slate-950/40 space-y-3">
              <ShoppingBag className="w-12 h-12 mx-auto text-slate-600 mb-1" />
              <h4 className="text-base font-bold text-white">لا توجد أصناف في المنيو حالياً</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {catalogSearch
                  ? 'جرب البحث بكلمات أخرى أو اختر قسماً مختلفاً'
                  : 'سيقوم متجر ' + store.name + ' بإضافة قائمة المنيو قريباً'}
              </p>
              {catalogSearch && (
                <button
                  onClick={() => {
                    setCatalogSearch('');
                    setSelectedCategory('ALL');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
                >
                  إعادة ضبط البحث
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {filteredCatalogItems.map((item) => {
                const hasModifiers = item.modifier_groups && item.modifier_groups.length > 0;
                const cartCountForItem = cartItems
                  .filter((c) => c.catalog_item.id === item.id)
                  .reduce((sum, c) => sum + c.quantity, 0);
                const earnedPoints = Math.floor(item.price * (store.points_per_riyal || 1));

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all duration-300 shadow-xl flex gap-3.5 relative overflow-hidden group"
                  >
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 relative">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl text-slate-600">
                          🍔
                        </div>
                      )}
                      {cartCountForItem > 0 && (
                        <div
                          className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-lg font-black text-[10px] text-black shadow-md"
                          style={{ backgroundColor: brandSecondary }}
                        >
                          {cartCountForItem} في السلة
                        </div>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                            style={{
                              backgroundColor: '#10B98120',
                              color: '#34D399',
                              border: '1px solid #10B98140',
                            }}
                          >
                            🍽️ {item.category || 'وجبة'}
                          </span>
                          {earnedPoints > 0 && (
                            <span className="text-[10px] text-amber-300 font-mono font-bold">
                              +{earnedPoints} نقطة
                            </span>
                          )}
                        </div>

                        <h4 className="font-extrabold text-white text-sm sm:text-base leading-tight">
                          {item.name}
                        </h4>

                        {item.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 flex items-center justify-between gap-2 mt-1">
                        <div className="flex items-baseline gap-1">
                          <span
                            className="text-base sm:text-lg font-black font-mono tracking-tight"
                            style={{ color: brandSecondary }}
                          >
                            {item.price}
                          </span>
                          <span className="text-[11px] text-slate-400 font-bold">ر.س</span>
                        </div>

                        {hasModifiers ? (
                          <button
                            type="button"
                            onClick={() => handleOpenCustomizeModal(item)}
                            style={{
                              backgroundColor: brandSecondary,
                              color: '#000000',
                            }}
                            className="px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 shadow-md hover:brightness-110 transition active:scale-95"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>تخصيص وإضافة</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleQuickAddToCart(item)}
                            style={{
                              backgroundColor: brandSecondary,
                              color: '#000000',
                            }}
                            className="px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 shadow-md hover:brightness-110 transition active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>إضافة</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'services' && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 backdrop-blur-xl space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  <span>حجز المواعيد والخدمات 📅</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  احجز موعدك بسهولة، اختر الإضافات والمختص والوقت المناسب، وأكد حجزك عبر الواتساب
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full border font-mono font-bold bg-blue-950 text-blue-300 border-blue-800">
                {availableServiceItems.length} خدمة
              </span>
            </div>

            {!bookingSuccessData && (
              <div className="grid grid-cols-5 gap-1 pt-1 text-[10px] sm:text-[11px] font-bold text-center">
                {[
                  { step: 1, label: '1. الخدمة' },
                  { step: 2, label: '2. الإضافات' },
                  { step: 3, label: '3. المختص' },
                  { step: 4, label: '4. الموعد' },
                  { step: 5, label: '5. التأكيد' },
                ].map((s) => {
                  const isCurrent = bookingStep === s.step;
                  const isPast = bookingStep > s.step;
                  const isModifiersStep = s.step === 2;
                  const hasModifiers = Boolean(
                    selectedBookingService?.modifier_groups && selectedBookingService.modifier_groups.length > 0
                  );

                  return (
                    <button
                      key={s.step}
                      type="button"
                      disabled={s.step > 1 && !selectedBookingService}
                      onClick={() => {
                        if (s.step === 1) setBookingStep(1);
                        if (s.step === 2 && selectedBookingService) {
                          if (hasModifiers) setBookingStep(2);
                        }
                        if (s.step === 3 && selectedBookingService) setBookingStep(3);
                        if (s.step === 4 && selectedBookingService) setBookingStep(4);
                        if (s.step === 5 && selectedBookingService) setBookingStep(5);
                      }}
                      className={`py-1.5 rounded-xl transition ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-md'
                          : isPast
                          ? 'bg-blue-950/60 text-blue-300 border border-blue-800/40'
                          : isModifiersStep && !hasModifiers && selectedBookingService
                          ? 'bg-slate-950/40 text-slate-600 opacity-40 line-through'
                          : 'bg-slate-950 text-slate-500'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {bookingSuccessData ? (
            <div className="p-6 rounded-3xl bg-slate-900 border border-emerald-500/40 text-center space-y-4 shadow-2xl animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto text-3xl shadow-inner">
                🎉
              </div>
              <div>
                <span className="px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                  تم تسجيل الحجز بنجاح
                </span>
                <h3 className="text-lg font-black text-white mt-1">
                  موعدك مؤكد برقم #{bookingSuccessData.booking_number}
                </h3>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2 text-right">
                <div className="flex justify-between">
                  <span className="text-slate-400">الخدمة:</span>
                  <span className="font-bold text-white">{bookingSuccessData.service_name}</span>
                </div>
                {bookingSuccessData.selected_modifiers && bookingSuccessData.selected_modifiers.length > 0 && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-slate-400 shrink-0">الإضافات والترقيات:</span>
                    <span className="font-bold text-blue-300 text-left">
                      {bookingSuccessData.selected_modifiers.map((m) => m.name).join('، ')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">المختص:</span>
                  <span className="font-bold text-blue-400">{bookingSuccessData.specialist_name || 'أي مختص متاح'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">التاريخ والوقت:</span>
                  <span className="font-mono font-bold text-white">{bookingSuccessData.booking_date} | {bookingSuccessData.booking_time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">مدة الخدمة:</span>
                  <span className="font-bold text-slate-300">{bookingSuccessData.duration_minutes} دقيقة</span>
                </div>
                <div className="flex justify-between border-t border-slate-900 pt-2">
                  <span className="text-slate-400">المبلغ الإجمالي:</span>
                  <span className="font-mono font-black text-amber-400">{bookingSuccessData.total_price} ر.س</span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const merchantPhone = store.manager_contact || '0577371780';
                    const url = LoyaltyService.generateWhatsAppBookingUrl(merchantPhone, bookingSuccessData);
                    window.open(url, '_blank');
                  }}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>فتح محادثة الواتساب مع المتجر 💬</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBookingSuccessData(null);
                    setSelectedBookingService(null);
                    setSelectedServiceModifiers({});
                    setSelectedBookingSpecialist(null);
                    setBookingStep(1);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  حجز موعد آخر
                </button>
              </div>
            </div>
          ) : (
            <>
              {bookingStep === 1 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-slate-300">الخطوة 1: اختر الخدمة المطلوبة للحجز:</span>
                  </div>

                  {availableServiceItems.length === 0 ? (
                    <div className="p-8 text-center bg-slate-900/60 rounded-3xl border border-slate-800 space-y-2">
                      <Scissors className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-slate-400">لا توجد خدمات متاحة للحجز حالياً.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {availableServiceItems.map((srv) => {
                        const isSelected = selectedBookingService?.id === srv.id;
                        const earnedPoints = Math.floor(srv.price * (store.points_per_riyal || 1));
                        const hasModifiers = Boolean(srv.modifier_groups && srv.modifier_groups.length > 0);

                        return (
                          <div
                            key={srv.id}
                            onClick={() => handleSelectServiceForBooking(srv)}
                            className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between gap-3 shadow-md ${
                              isSelected
                                ? 'bg-blue-950/50 border-blue-500 shadow-blue-500/10'
                                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center space-x-3 rtl:space-x-reverse min-w-0">
                              {srv.image_url ? (
                                <img
                                  src={srv.image_url}
                                  alt={srv.name}
                                  className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-xl bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-2xl shrink-0">
                                  💇‍♂️
                                </div>
                              )}
                              <div className="space-y-0.5 min-w-0">
                                <h4 className="text-sm font-bold text-white truncate">{srv.name}</h4>
                                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                                    {srv.category}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 font-bold flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{srv.duration_minutes || 30} دقيقة</span>
                                  </span>
                                  {hasModifiers && (
                                    <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold">
                                      ✨ إضافات وترقيات ({srv.modifier_groups?.length})
                                    </span>
                                  )}
                                  {earnedPoints > 0 && (
                                    <span className="text-amber-400 font-mono font-bold">+{earnedPoints} نقطة</span>
                                  )}
                                </div>
                                {srv.description && (
                                  <p className="text-[11px] text-slate-400 line-clamp-1">{srv.description}</p>
                                )}
                              </div>
                            </div>

                            <div className="text-left shrink-0">
                              <div className="text-base font-black font-mono text-amber-400">{srv.price} ر.س</div>
                              <span className="text-[11px] text-blue-400 font-bold hover:underline">
                                {hasModifiers ? 'تخصيص وحجز ➔' : 'اختر الخدمة ➔'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {bookingStep === 2 && selectedBookingService && (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">الخدمة الأساسية:</span>
                      <strong className="text-white">{selectedBookingService.name}</strong>
                      <span className="text-amber-400 font-mono font-bold">({selectedBookingService.price} ر.س)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBookingStep(1)}
                      className="text-slate-400 hover:text-white font-bold"
                    >
                      تغيير الخدمة
                    </button>
                  </div>

                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-slate-300">الخطوة 2: حدد الإضافات والترقيات لجلسة الخدمة:</span>
                    <span className="text-[10px] text-slate-500">(اختياري أو حسب الرغبة)</span>
                  </div>

                  {selectedBookingService.modifier_groups && selectedBookingService.modifier_groups.length > 0 ? (
                    <div className="space-y-3">
                      {selectedBookingService.modifier_groups.map((group) => {
                        const currentSelected = selectedServiceModifiers[group.id] || [];

                        return (
                          <div
                            key={group.id}
                            className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                                <span>{group.name}</span>
                                {group.required && (
                                  <span className="text-[10px] text-rose-400 font-bold bg-rose-500/15 px-1.5 py-0.5 rounded">
                                    إجباري
                                  </span>
                                )}
                              </h4>
                              <span className="text-[10px] text-slate-400">
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
                                        ? 'bg-blue-950/60 border-blue-500 text-white'
                                        : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                                      <div
                                        className={`w-4 h-4 rounded-${group.allow_multiple ? 'md' : 'full'} border flex items-center justify-center transition shrink-0 ${
                                          isSelected
                                            ? 'border-transparent bg-blue-500 text-white'
                                            : 'border-slate-600 bg-slate-900'
                                        }`}
                                      >
                                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                      </div>
                                      <span className="text-xs font-bold">{option.name}</span>
                                    </div>

                                    <span
                                      className={`text-xs font-mono font-bold ${
                                        option.price_delta > 0 ? 'text-amber-400' : 'text-slate-400'
                                      }`}
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
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                      لا توجد إضافات مخصصة لهذه الخدمة. يمكنك المتابعة مباشرة لاختيار المختص.
                    </div>
                  )}

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-400 block">الإجمالي الحالي للخدمة:</span>
                      <strong className="text-base font-black font-mono text-amber-400">
                        {calculateServiceBookingPrice()} ر.س
                      </strong>
                    </div>

                    <button
                      type="button"
                      onClick={() => setBookingStep(3)}
                      className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-md transition flex items-center gap-1.5"
                    >
                      <span>متابعة لاختيار المختص ➔</span>
                    </button>
                  </div>
                </div>
              )}

              {bookingStep === 3 && selectedBookingService && (() => {
                const serviceCategory = selectedBookingService.category?.trim();
                const qualifiedSpecialists = specialists.filter((s) => {
                  if (s.is_active === false) return false;
                  if (!s.service_categories || s.service_categories.length === 0 || s.service_categories.includes('ALL')) {
                    return true;
                  }
                  return s.service_categories.includes(serviceCategory);
                });

                const hasModifiers = Boolean(
                  selectedBookingService.modifier_groups && selectedBookingService.modifier_groups.length > 0
                );

                return (
                  <div className="space-y-3 animate-fade-in">
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">الخدمة:</span>
                        <strong className="text-white">{selectedBookingService.name}</strong>
                        <span className="text-blue-400 font-mono">({selectedBookingService.duration_minutes || 30} د)</span>
                        <span className="text-amber-400 font-mono font-bold">({calculateServiceBookingPrice()} ر.س)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBookingStep(hasModifiers ? 2 : 1)}
                        className="text-slate-400 hover:text-white font-bold"
                      >
                        {hasModifiers ? 'تعديل الإضافات' : 'تغيير الخدمة'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold text-slate-300 block">الخطوة 3: حدد المختص المؤهل في قسم ({serviceCategory}):</span>
                      <span className="text-[10px] text-blue-300 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                        {qualifiedSpecialists.length} مختص متاح
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      <div
                        onClick={() => {
                          setSelectedBookingSpecialist(null);
                          setBookingStep(4);
                        }}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                          selectedBookingSpecialist === null
                            ? 'bg-blue-950/50 border-blue-500 text-white'
                            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-3 rtl:space-x-reverse">
                          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 text-lg">
                            ⚡
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white">أي مختص متاح في قسم ({serviceCategory})</h4>
                            <p className="text-[10px] text-slate-400">سيتم التنسيق مع أول موظف متاح فور حضورك (الأسرع للحجز)</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-blue-400">اختيار ➔</span>
                      </div>

                      {qualifiedSpecialists.map((spec) => {
                        const isSelected = selectedBookingSpecialist?.id === spec.id;
                        return (
                          <div
                            key={spec.id}
                            onClick={() => {
                              setSelectedBookingSpecialist(spec);
                              setBookingStep(4);
                            }}
                            className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                              isSelected
                                ? 'bg-blue-950/50 border-blue-500 text-white'
                                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center space-x-3 rtl:space-x-reverse min-w-0">
                              {spec.avatar_url ? (
                                <img
                                  src={spec.avatar_url}
                                  alt={spec.name}
                                  className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-blue-400 text-sm shrink-0">
                                  {spec.name.slice(0, 1)}
                                </div>
                              )}
                              <div className="min-w-0 space-y-0.5">
                                <h4 className="text-xs font-bold text-white truncate">{spec.name}</h4>
                                <p className="text-[10px] text-blue-300">{spec.specialty || 'أخصائي خدمة'}</p>
                                {spec.service_categories && spec.service_categories.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                    {spec.service_categories.map((cat, idx) => (
                                      <span
                                        key={idx}
                                        className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/50"
                                      >
                                        {cat === 'ALL' ? '⭐ جميع الأقسام' : cat}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className="text-xs font-bold text-blue-400 shrink-0">اختيار ➔</span>
                          </div>
                        );
                      })}

                      {qualifiedSpecialists.length === 0 && (
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center space-y-1">
                          <p className="font-bold">جميع مقدمي الخدمة متاحون لخدمتك في هذا القسم</p>
                          <p className="text-[11px] text-amber-400/80">اختر "أي مختص متاح" للمتابعة وتأكيد موعدك مباشرة.</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

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
                    const activeWorkingSpecs = specialists.filter(
                      (s) =>
                        s.is_active !== false &&
                        (!s.working_days || s.working_days.includes(dayKey))
                    );

                    if (activeWorkingSpecs.length === 0) {
                      return { isBooked: true, label: 'لا مختصين', canBook: false };
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
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">المختص:</span>
                        <strong className="text-blue-400">{selectedBookingSpecialist?.name || 'أي مختص متاح (الأسرع)'}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBookingStep(3)}
                        className="text-slate-400 hover:text-white font-bold"
                      >
                        تغيير المختص
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300 block px-1">الخطوة 4: اختر يوم ووقت الحضور:</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ساعات العمل: {rawStart} - {rawEnd}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 block">اختر اليوم:</label>
                      <div className="flex gap-2 overflow-x-auto pb-1">
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
                              className={`p-2.5 rounded-2xl text-center shrink-0 min-w-[72px] border transition ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-500 shadow-md font-bold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              <span className="text-[11px] block">{dayName}</span>
                              <span className="text-xs font-bold block mt-0.5">{dateFormatted}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {isSpecialistOffToday && selectedBookingSpecialist && (
                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>
                          المختص ({selectedBookingSpecialist.name}) في إجازة أسبوعية يوم ({dayArabicName}). يرجى اختيار يوم آخر أو اختيار &quot;أي مختص متاح&quot;.
                        </span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-slate-400 block">
                          اختر الموعد المناسب ({selectedBookingDate}):
                        </label>
                        <span className="text-[10px] text-slate-500">
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
                                className="py-2.5 px-1.5 rounded-xl border border-slate-850 bg-slate-950/40 text-slate-600 line-through cursor-not-allowed flex flex-col items-center justify-center opacity-60 transition"
                                title="هذا الموعد محجوز مسبقاً وغير متاح"
                              >
                                <span className="font-mono text-xs font-bold">{slot}</span>
                                <span className="text-[9px] text-rose-400 font-sans mt-0.5">{slotInfo.label}</span>
                              </button>
                            );
                          }

                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setSelectedBookingTime(slot)}
                              className={`py-2.5 px-1.5 rounded-xl border flex flex-col items-center justify-center transition shadow-sm ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-500 shadow-md scale-[1.02]'
                                  : 'bg-slate-950 border-slate-800 text-slate-200 hover:border-blue-400 hover:text-white'
                              }`}
                            >
                              <span className="font-mono text-xs font-bold">{slot}</span>
                              <span className={`text-[9px] mt-0.5 font-sans ${isSelected ? 'text-blue-200 font-bold' : 'text-emerald-400'}`}>
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
                      className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg transition mt-2 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>{canProceed ? `متابعة لتأكيد موعد الساعة (${selectedBookingTime}) ➔` : 'يرجى تحديد موعد متاح للمتابعة'}</span>
                    </button>
                  </div>
                );
              })()}

              {bookingStep === 5 && selectedBookingService && (() => {
                const finalTotalPrice = calculateServiceBookingPrice();
                const flatModifiers = getFlatSelectedServiceModifiers();
                const pointsToEarn = Math.floor(finalTotalPrice * (store.points_per_riyal || 1));

                return (
                  <div className="space-y-4 animate-fade-in">
                    <div className="p-4 rounded-3xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                      <h4 className="font-bold text-white text-sm pb-2 border-b border-slate-900 flex items-center gap-1.5">
                        <BookmarkCheck className="w-4 h-4 text-blue-400" />
                        <span>ملخص تفاصيل الموعد والخدمة:</span>
                      </h4>

                      <div className="flex justify-between">
                        <span className="text-slate-400">الخدمة:</span>
                        <strong className="text-white">{selectedBookingService.name}</strong>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400">القسم:</span>
                        <span className="font-bold text-slate-300">{selectedBookingService.category}</span>
                      </div>

                      {flatModifiers.length > 0 && (
                        <div className="pt-2 pb-1 border-t border-slate-900 space-y-1.5">
                          <span className="text-slate-400 block font-bold">الإضافات والترقيات المختارة:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {flatModifiers.map((mod, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 rounded-lg bg-blue-950/70 border border-blue-800/60 text-blue-200 text-[11px] font-bold flex items-center gap-1"
                              >
                                <span>{mod.name}</span>
                                <span className="text-amber-400 font-mono">
                                  {mod.price_delta > 0 ? `(+${mod.price_delta} ر.س)` : '(مجاناً)'}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between pt-2 border-t border-slate-900">
                        <span className="text-slate-400">المختص المطلوب:</span>
                        <strong className="text-blue-400">{selectedBookingSpecialist?.name || 'أي مختص متاح'}</strong>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400">اليوم والوقت:</span>
                        <strong className="text-white font-mono">{selectedBookingDate} في تمام {selectedBookingTime}</strong>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400">مدة الجلسة المتوقعة:</span>
                        <strong className="text-slate-300">{selectedBookingService.duration_minutes || 30} دقيقة</strong>
                      </div>

                      <div className="flex justify-between pt-2 border-t border-slate-900">
                        <span className="text-slate-400">السعر الإجمالي النهائي:</span>
                        <span className="text-base font-black font-mono text-amber-400">{finalTotalPrice} ر.س</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400">النقاط المكتسبة بعد الحضور:</span>
                        <span className="text-xs font-bold text-amber-300">+{pointsToEarn} نقطة ولاء ✨</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300 block">ملاحظات إضافية للمتجر (اختياري):</label>
                      <textarea
                        value={bookingNotes}
                        onChange={(e) => setBookingNotes(e.target.value)}
                        placeholder="مثال: يرجى تجهيز كرسي خاص، أو أي تفاصيل تخص طلبك..."
                        rows={2}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-blue-400"
                      />
                    </div>

                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={handleConfirmServiceBooking}
                        disabled={bookingSubmitting}
                        className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{bookingSubmitting ? 'جاري تسجيل الموعد...' : 'تأكيد الحجز والإرسال عبر واتساب 💬'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBookingStep(4)}
                        className="w-full py-2 text-slate-400 hover:text-white text-xs text-center"
                      >
                        الرجوع لتعديل الموعد أو الوقت
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {activeTab === 'perks' && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-white flex items-center space-x-2 rtl:space-x-reverse">
                <Gift className="w-5 h-5" style={{ color: brandSecondary }} />
                <span>حصرياتك والقائمة السرية 💎</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                استبدل رصيد نقاطك بامتيازات وهدايا حصرية مخصصة لك
              </p>
            </div>
            <span
              className="text-xs bg-slate-900 px-3 py-1 rounded-full border border-slate-800 font-mono font-bold"
              style={{ color: brandSecondary }}
            >
              {privileges.filter((p) => p.is_active && !p.is_hidden).length} عروض
            </span>
          </div>

          {privileges.filter((p) => p.is_active && !p.is_hidden).length === 0 ? (
            <div className="rounded-3xl p-8 border border-slate-800/80 bg-slate-900/40 backdrop-blur-xl text-center space-y-3 shadow-xl">
              <div
                className="w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center shadow-inner"
                style={{
                  backgroundColor: `${brandSecondary}15`,
                  borderColor: `${brandSecondary}30`,
                  color: brandSecondary,
                }}
              >
                <Gift className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white">لا توجد عروض أو مكافآت معلنة حالياً</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
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
                  : false;

                const hasEnoughPoints = (customer?.wallet_balance || 0) >= (priv.cost_points || 0);
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
                    className={`rounded-3xl p-5 border transition-all duration-300 flex flex-col justify-between relative overflow-hidden shadow-xl ${
                      isSoldOut
                        ? 'bg-slate-950/60 border-slate-800/80 opacity-50'
                        : isUserLimitReached
                        ? 'bg-slate-900/90 border-slate-700/60'
                        : isTierUnlocked
                        ? 'bg-slate-900/90 border-slate-800'
                        : 'bg-slate-950/60 border-slate-800/80 backdrop-blur-sm'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        {requiredTier && (
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1"
                            style={{
                              backgroundColor: `${requiredTier.badge_color || brandSecondary}15`,
                              borderColor: `${requiredTier.badge_color || brandSecondary}40`,
                              color: requiredTier.badge_color || brandSecondary,
                            }}
                          >
                            <Award className="w-3 h-3" />
                            <span>مكانة: {requiredTier.tier_name}</span>
                          </span>
                        )}

                        <span
                          className="px-3 py-1 rounded-full border font-mono font-black text-xs"
                          style={{
                            backgroundColor: `${brandSecondary}15`,
                            borderColor: `${brandSecondary}30`,
                            color: brandSecondary,
                          }}
                        >
                          {priv.cost_points} نقطة
                        </span>
                      </div>

                      <div>
                        <h4 className="font-extrabold text-base text-white">{priv.title}</h4>
                        {priv.description && (
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                            {priv.description}
                          </p>
                        )}
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="flex items-center gap-1 text-slate-400">
                            <Clock className="w-3.5 h-3.5" style={{ color: brandSecondary }} />
                            <span>ساعات الصرف:</span>
                          </span>
                          <span className="font-mono text-white font-bold">
                            {priv.valid_start_time && priv.valid_end_time
                              ? `${priv.valid_start_time} - ${priv.valid_end_time}`
                              : 'متاح 24/7'}
                          </span>
                        </div>

                        {priv.per_customer_limit && priv.per_customer_limit > 0 && (
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="flex items-center gap-1 text-slate-400">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>الحد لكل عضو:</span>
                            </span>
                            <span className="font-mono font-bold">
                              {customerPurchasedThisCount >= priv.per_customer_limit ? (
                                <span className="font-bold" style={{ color: brandSecondary }}>استنفدت الحد ({customerPurchasedThisCount}/{priv.per_customer_limit})</span>
                              ) : (
                                <span>{priv.per_customer_limit} رمز (حصلت على {customerPurchasedThisCount})</span>
                              )}
                            </span>
                          </div>
                        )}

                        {remainingStock !== null && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>الكمية المتاحة:</span>
                            <span
                              className="font-mono font-bold"
                              style={{
                                color: remainingStock <= 3 ? '#F43F5E' : brandSecondary,
                              }}
                            >
                              {remainingStock} فقط
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800">
                      {isSoldOut ? (
                        <button
                          disabled
                          className="w-full py-3 rounded-2xl bg-slate-800 text-slate-500 font-bold text-xs cursor-not-allowed"
                        >
                          نفدت الكمية 🚫
                        </button>
                      ) : isUserLimitReached ? (
                        <div className="p-2.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-300 text-center text-xs font-bold">
                          استنفدت الحد المسموح لك من هذا الامتياز ✓
                        </div>
                      ) : !isTierUnlocked ? (
                        <div className="text-center text-[11px] py-1.5 font-bold" style={{ color: brandSecondary }}>
                          ارتقِ إلى {requiredTier?.tier_name} لفتح هذا الامتياز
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setPurchaseError(null);
                            setPurchasingPrivilege(priv);
                          }}
                          disabled={!hasEnoughPoints}
                          style={
                            hasEnoughPoints
                              ? {
                                  backgroundColor: brandSecondary,
                                  color: '#000000',
                                }
                              : undefined
                          }
                          className={`w-full py-3 rounded-2xl font-black text-xs flex items-center justify-center space-x-1.5 rtl:space-x-reverse transition shadow-lg ${
                            hasEnoughPoints
                              ? 'hover:brightness-110'
                              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                          }`}
                        >
                          <ShoppingBag className="w-4 h-4" />
                          <span>
                            {hasEnoughPoints
                              ? `فتح وتفعيل الامتياز (${priv.cost_points} نقطة) ✨`
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
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-white flex items-center space-x-2 rtl:space-x-reverse">
                <Ticket className="w-5 h-5" style={{ color: brandSecondary }} />
                <span>امتيازاتي ومكافآتي المحفوظة ✨</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                بطاقاتك الجاهزة للصرف الفوري عند الكاشير
              </p>
            </div>
            <span className="text-xs bg-emerald-500/15 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30 font-mono font-bold">
              {activeCouponsCount} نشط
            </span>
          </div>

          {customerCoupons.length === 0 ? (
            <div className="py-14 text-center text-slate-400 border border-dashed border-slate-800 rounded-3xl bg-slate-950/40 space-y-3">
              <Ticket className="w-12 h-12 mx-auto text-slate-600 mb-1" />
              <h4 className="text-base font-bold text-white">لا توجد امتيازات محفوظة حالياً</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                استبدل رصيد نقاطك من قائمة حصرياتك لتفتح هدايا وتذاكر فورية 🎁
              </p>
              <button
                onClick={() => setActiveTab('perks')}
                style={{
                  backgroundColor: brandSecondary,
                  color: '#000000',
                }}
                className="px-5 py-2.5 rounded-2xl font-bold text-xs shadow-lg transition hover:brightness-110"
              >
                استكشف حصرياتك 🚀
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {customerCoupons.map((coupon) => {
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
                        ? 'bg-slate-950/40 border-slate-800/80 opacity-50'
                        : isSelected
                        ? 'border-2'
                        : isFrozen
                        ? 'bg-slate-900/90 border-slate-700/60'
                        : 'bg-slate-900/90 border-slate-800'
                    }`}
                    style={
                      isSelected
                        ? {
                            borderColor: brandSecondary,
                            background: `linear-gradient(135deg, ${brandSecondary}20 0%, #0F172A 60%, #020617 100%)`,
                          }
                        : undefined
                    }
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-slate-300 select-all">
                            {coupon.coupon_code}
                          </span>
                          <button
                            onClick={() => copyToClipboard(coupon.coupon_code, coupon.id)}
                            className="text-slate-500 hover:text-white transition"
                            title="نسخ الرمز"
                          >
                            {copiedCodeKey === coupon.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {isUsed ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold">
                            تم الاستخدام ✓
                          </span>
                        ) : isFrozen ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold">
                            ❄️ خارج ساعات الصرف
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            🟢 جاهز للصرف
                          </span>
                        )}
                      </div>

                      <h4 className="font-black text-base text-white">{coupon.privilege_title}</h4>

                      <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1 text-[11px]">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>ساعات الصرف:</span>
                          <span className="font-mono font-bold" style={{ color: brandSecondary }}>
                            {coupon.valid_start_time && coupon.valid_end_time
                              ? `${coupon.valid_start_time} - ${coupon.valid_end_time}`
                              : 'متاح 24/7'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>القيمة:</span>
                          <span className="font-mono text-white font-bold">{coupon.cost_points} نقطة</span>
                        </div>
                      </div>
                    </div>

                    {!isUsed && (
                      <div className="mt-4 pt-3 border-t border-slate-800">
                        <button
                          onClick={() => handleSelectCouponForRedeem(coupon)}
                          style={
                            isSelected
                              ? {
                                  backgroundColor: brandSecondary,
                                  color: '#000000',
                                }
                              : undefined
                          }
                          className={`w-full py-2.5 rounded-2xl font-black text-xs flex items-center justify-center space-x-1.5 rtl:space-x-reverse transition shadow-lg ${
                            isSelected
                              ? 'shadow-lg'
                              : isFrozen
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
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
          )}
        </div>
      )}

      {activeTab === 'tiers' && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-white flex items-center space-x-2 rtl:space-x-reverse">
                <Crown className="w-5 h-5" style={{ color: brandSecondary }} />
                <span>مكانتك ومستويات الـ VIP 👑</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ارتقِ في مكانتك مع كل زيارة لتحصل على مكافآت وقوائم حصرية
              </p>
            </div>
            <span className="text-xs bg-slate-900 px-3 py-1 rounded-full border border-slate-800 font-mono text-slate-300">
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
                      ? 'bg-slate-900/90 border-slate-800'
                      : 'bg-slate-950/60 border-slate-800/80 opacity-60'
                  }`}
                  style={
                    isCurrent
                      ? {
                          borderColor: brandSecondary,
                          background: `linear-gradient(135deg, ${brandSecondary}20 0%, #0F172A 60%, #020617 100%)`,
                        }
                      : undefined
                  }
                >
                  {isCurrent && (
                    <div className="absolute top-3 left-3 rtl:right-3 rtl:left-auto">
                      <span
                        className="px-2.5 py-0.5 rounded-full font-black text-[10px]"
                        style={{ backgroundColor: brandSecondary, color: '#000000' }}
                      >
                        مكانتك الحالية ✨
                      </span>
                    </div>
                  )}

                  <div className="space-y-2 mt-1">
                    <div
                      className="w-10 h-10 rounded-2xl border flex items-center justify-center font-bold text-base"
                      style={{
                        backgroundColor: `${t.badge_color || brandSecondary}20`,
                        borderColor: `${t.badge_color || brandSecondary}60`,
                        color: t.badge_color || brandSecondary,
                      }}
                    >
                      {idx === 0 ? '🥉' : idx === 1 ? '🥈' : idx === 2 ? '🥇' : '👑'}
                    </div>

                    <h4 className="font-extrabold text-base text-white">{t.tier_name}</h4>
                    <p className="text-xs text-slate-400 font-mono">
                      الشرط: <strong style={{ color: brandSecondary }}>{t.required_xp} XP</strong> تراكمي
                    </p>

                    <div className="pt-2 text-[11px] text-slate-300">
                      {isReached ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>مستوى مفتوح ومفعل ✓</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          باقي <strong className="font-mono" style={{ color: brandSecondary }}>{t.required_xp - (customer?.lifetime_xp || 0)} XP</strong> للوصول
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

      <div className="fixed bottom-3 left-3 right-3 max-w-md mx-auto z-40">
        <nav className="glass-dock rounded-full p-1.5 flex items-center justify-around shadow-2xl bg-slate-950/90 backdrop-blur-2xl border border-slate-800">
          
          <button
            onClick={() => setActiveTab('pass')}
            style={
              activeTab === 'pass'
                ? {
                    backgroundColor: brandSecondary,
                    color: '#000000',
                  }
                : undefined
            }
            className={`flex-1 py-2 px-1 rounded-full text-[10px] sm:text-[11px] font-black flex flex-col items-center gap-0.5 transition ${
              activeTab === 'pass'
                ? 'shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>بطاقتي</span>
          </button>

          <button
            onClick={() => setActiveTab('menu')}
            style={
              activeTab === 'menu'
                ? {
                    backgroundColor: brandSecondary,
                    color: '#000000',
                  }
                : undefined
            }
            className={`flex-1 py-2 px-1 rounded-full text-[10px] sm:text-[11px] font-black flex flex-col items-center gap-0.5 transition relative ${
              activeTab === 'menu'
                ? 'shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>المنيو</span>
            {cartItems.length > 0 && (
              <span
                className="absolute top-1 right-1.5 w-4 h-4 rounded-full text-black text-[9px] font-black flex items-center justify-center shadow-sm"
                style={{ backgroundColor: brandSecondary }}
              >
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('services')}
            style={
              activeTab === 'services'
                ? {
                    backgroundColor: brandSecondary,
                    color: '#000000',
                  }
                : undefined
            }
            className={`flex-1 py-2 px-1 rounded-full text-[10px] sm:text-[11px] font-black flex flex-col items-center gap-0.5 transition ${
              activeTab === 'services'
                ? 'shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>حجز موعد</span>
          </button>

          <button
            onClick={() => setActiveTab('perks')}
            style={
              activeTab === 'perks'
                ? {
                    backgroundColor: brandSecondary,
                    color: '#000000',
                  }
                : undefined
            }
            className={`flex-1 py-2 px-1 rounded-full text-[10px] sm:text-[11px] font-black flex flex-col items-center gap-0.5 transition ${
              activeTab === 'perks'
                ? 'shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>حصرياتك</span>
          </button>

          <button
            onClick={() => setActiveTab('tickets')}
            style={
              activeTab === 'tickets'
                ? {
                    backgroundColor: brandSecondary,
                    color: '#000000',
                  }
                : undefined
            }
            className={`flex-1 py-2 px-1 rounded-full text-[10px] sm:text-[11px] font-black flex flex-col items-center gap-0.5 transition relative ${
              activeTab === 'tickets'
                ? 'shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span>امتيازاتي</span>
            {activeCouponsCount > 0 && (
              <span
                className="absolute top-1 right-1.5 w-4 h-4 rounded-full text-black text-[9px] font-black flex items-center justify-center shadow-sm"
                style={{ backgroundColor: brandSecondary }}
              >
                {activeCouponsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('tiers')}
            style={
              activeTab === 'tiers'
                ? {
                    backgroundColor: brandSecondary,
                    color: '#000000',
                  }
                : undefined
            }
            className={`flex-1 py-2 px-1 rounded-full text-[10px] sm:text-[11px] font-black flex flex-col items-center gap-0.5 transition ${
              activeTab === 'tiers'
                ? 'shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>مكانتك</span>
          </button>

        </nav>
      </div>

      {isFullscreenQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-fade-in">
          <div className="relative max-w-sm w-full p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col items-center text-center space-y-5">
            <button
              onClick={() => setIsFullscreenQR(false)}
              className="absolute top-4 left-4 p-2.5 rounded-full bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="font-black text-lg text-white">{store.name}</h3>
              <p className="text-xs font-mono mt-0.5" style={{ color: brandSecondary }}>
                {selectedCouponForQR ? `امتياز: ${selectedCouponForQR.privilege_title}` : 'Dynamic VIP Pass'}
              </p>
            </div>

            <div className="p-4 rounded-3xl bg-white shadow-2xl flex items-center justify-center">
              <QRCodeSVG
                value={qrDataPayload}
                size={260}
                level="M"
                includeMargin={true}
              />
            </div>

            <div className="text-xs text-slate-300 font-mono">
              <span>يتحدث الرمز خلال: </span>
              <strong style={{ color: brandSecondary }}>{timeLeft} ثانية</strong>
            </div>

            <button
              onClick={() => setIsFullscreenQR(false)}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
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
              <div
                className="w-14 h-14 rounded-2xl border flex items-center justify-center text-3xl mx-auto"
                style={{
                  backgroundColor: `${brandSecondary}15`,
                  borderColor: `${brandSecondary}30`,
                  color: brandSecondary,
                }}
              >
                🎁
              </div>
              <h3 className="text-lg font-black text-white">تأكيد فتح واستبدال الامتياز</h3>
              <p className="text-xs text-slate-300">
                أنت على وشك فتح <strong style={{ color: brandSecondary }}>"{purchasingPrivilege.title}"</strong>
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
              <div className="flex items-center justify-between font-bold" style={{ color: brandSecondary }}>
                <span>النقاط المستحقة:</span>
                <span className="font-mono">-{purchasingPrivilege.cost_points} نقطة</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-emerald-400 font-bold">
                <span>رصيدك بعد التفعيل:</span>
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
                  backgroundColor: brandSecondary,
                  color: '#000000',
                }}
                className="flex-1 py-3.5 rounded-xl font-black text-sm transition shadow-lg hover:brightness-110 disabled:opacity-50"
              >
                {purchaseLoading ? 'جاري التفعيل...' : 'تأكيد الفتح الفوري 🚀'}
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
                  backgroundColor: `${brandSecondary}15`,
                  borderColor: `${brandSecondary}30`,
                  color: brandSecondary,
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
                <div className="flex items-center space-x-2 rtl:space-x-reverse font-bold text-xs" style={{ color: brandSecondary }}>
                  <span>🍎 لمستخدمي الآيفون (Safari):</span>
                </div>
                <ol className="text-xs text-slate-300 space-y-1 list-decimal list-inside pr-1">
                  <li>اضغط على زر <strong className="text-white font-bold">المشاركة (Share ⎋)</strong> أسفل المتصفح.</li>
                  <li>اختر <strong className="text-white font-bold">"إضافة إلى الشاشة الرئيسية" (Add to Home Screen ➕)</strong>.</li>
                  <li>اضغط <strong className="font-bold" style={{ color: brandSecondary }}>"إضافة" (Add)</strong> في الزاوية.</li>
                </ol>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400 font-bold text-xs">
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
            style={{ borderColor: `${brandSecondary}80` }}
          >
            <div
              className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-30"
              style={{ backgroundColor: brandSecondary }}
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
                  <span className="px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold font-mono inline-block">
                    تم رفض العملية
                  </span>
                  <h3 className="text-lg font-black text-white">{celebrationModal.title}</h3>
                  <p className="text-xs text-rose-300 max-w-xs mx-auto leading-relaxed pt-1">
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
                  <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold font-mono inline-block">
                    تم الصرف والتسليم بنجاح ✓
                  </span>
                  <h3 className="text-xl font-black text-white">ألف مبروك!</h3>
                  <h4 className="text-sm font-bold" style={{ color: brandSecondary }}>
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
                    backgroundColor: `${brandSecondary}20`,
                    borderColor: `${brandSecondary}40`,
                  }}
                >
                  💎
                </div>
                <div className="space-y-1.5">
                  <span
                    className="px-3 py-1 rounded-full border text-xs font-bold font-mono inline-block"
                    style={{
                      backgroundColor: `${brandSecondary}15`,
                      borderColor: `${brandSecondary}30`,
                      color: brandSecondary,
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
                    <strong className="text-base font-black font-mono" style={{ color: brandSecondary }}>
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
                  backgroundColor: brandSecondary,
                  color: '#000000',
                }}
                className="w-full py-3.5 rounded-2xl font-black text-sm transition shadow-xl hover:brightness-110"
              >
                رائع! شكراً لكم 👏
              </button>
            </div>
          </div>
        </div>
      )}

      {cartItems.length > 0 && (
        <div className="fixed bottom-20 left-3 right-3 max-w-md mx-auto z-40 animate-slide-up">
          <div
            onClick={() => setIsCartModalOpen(true)}
            className="p-3.5 rounded-2xl shadow-2xl border flex items-center justify-between cursor-pointer transition transform hover:scale-[1.01] active:scale-[0.99]"
            style={{
              backgroundColor: brandPrimary || '#0F172A',
              borderColor: `${brandSecondary}60`,
              boxShadow: `0 10px 25px -5px ${brandSecondary}30`,
            }}
          >
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-inner"
                style={{
                  backgroundColor: brandSecondary,
                  color: '#000000',
                }}
              >
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-white">
                    سلة الطلبات ({cartItems.reduce((sum, i) => sum + i.quantity, 0)} أصناف)
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    +{estimatedLoyaltyPoints} نقطة ✨
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                  الإجمالي: <strong className="text-white font-bold">{cartSubtotal} ر.س</strong>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCartModalOpen(true);
              }}
              style={{
                backgroundColor: brandSecondary,
                color: '#000000',
              }}
              className="px-4 py-2 rounded-xl font-black text-xs flex items-center gap-1 shadow-md hover:brightness-110 transition"
            >
              <span>متابعة الطلب</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {isCustomizeModalOpen && itemToCustomize && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up"
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
                  className="text-[10px] px-2.5 py-0.5 rounded-full font-bold inline-block mb-1"
                  style={{
                    backgroundColor: `${brandSecondary}20`,
                    color: brandSecondary,
                    border: `1px solid ${brandSecondary}40`,
                  }}
                >
                  {itemToCustomize.item_type === 'service'
                    ? `⏱️ مدة الجلسة: ${itemToCustomize.duration_minutes || 30} دقيقة`
                    : itemToCustomize.category || 'صنف'}
                </span>
                <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                  {itemToCustomize.name}
                </h3>
              </div>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-right">
              {itemToCustomize.description && (
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
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
                        className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                            <span>{group.name}</span>
                            {group.required && (
                              <span className="text-[10px] text-rose-400 font-bold bg-rose-500/15 px-1.5 py-0.5 rounded">
                                إجباري
                              </span>
                            )}
                          </h4>
                          <span className="text-[10px] text-slate-400">
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
                                    ? 'bg-slate-900 border-2 text-white'
                                    : 'bg-slate-950 hover:bg-slate-900/60 border-slate-800/80 text-slate-300'
                                }`}
                                style={isSelected ? { borderColor: brandSecondary } : undefined}
                              >
                                <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                                  <div
                                    className={`w-4 h-4 rounded-${group.allow_multiple ? 'md' : 'full'} border flex items-center justify-center transition shrink-0 ${
                                      isSelected
                                        ? 'border-transparent'
                                        : 'border-slate-600 bg-slate-900'
                                    }`}
                                    style={
                                      isSelected
                                        ? {
                                            backgroundColor: brandSecondary,
                                            color: '#000000',
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
                                  style={option.price_delta > 0 ? { color: brandSecondary } : { color: '#94A3B8' }}
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
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <span>ملاحظات أو طلبات خاصة (اختياري):</span>
                </label>
                <textarea
                  value={customizingNotes}
                  onChange={(e) => setCustomizingNotes(e.target.value)}
                  placeholder="مثال: بدون بصل، زيادة صلصة، تحضير سريع..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 transition resize-none"
                />
              </div>

              {itemToCustomize.item_type === 'product' && (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-xs font-bold text-white">الكمية المطلوبة:</span>
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <button
                      type="button"
                      onClick={() => setCustomizingQuantity((prev) => Math.max(1, prev - 1))}
                      disabled={customizingQuantity <= 1}
                      className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white flex items-center justify-center transition"
                    >
                      <Minus className="w-3 gross-3" />
                    </button>
                    <span className="text-sm font-black font-mono text-white w-6 text-center">
                      {customizingQuantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomizingQuantity((prev) => prev + 1)}
                      className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div>
                <span className="text-[10px] text-slate-400 block">المجموع للصنف:</span>
                <div className="flex items-baseline gap-1">
                  <span
                    className="text-lg font-black font-mono"
                    style={{ color: brandSecondary }}
                  >
                    {calculateCustomizedItemUnitPrice(itemToCustomize) * customizingQuantity}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">ر.س</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddCustomizedItemToCart}
                style={{
                  backgroundColor: brandSecondary,
                  color: '#000000',
                }}
                className="flex-1 py-3 px-5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg hover:brightness-110 transition active:scale-95"
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
            className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up"
            style={{ borderColor: `${brandSecondary}40` }}
          >
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-bold"
                  style={{
                    backgroundColor: `${brandSecondary}20`,
                    color: brandSecondary,
                  }}
                >
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    سلة الطلبات والحجز المسبق
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {cartItems.length} أصناف • متجر {store.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCartModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-right">
              <div className="space-y-2.5">
                <h4 className="text-xs font-black text-slate-300">الأصناف والخدمات المختارة:</h4>
                {cartItems.map((cartItem) => (
                  <div
                    key={cartItem.id}
                    className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 shadow-inner"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-white truncate">
                          {cartItem.catalog_item.name}
                        </span>
                      </div>

                      {cartItem.selected_modifiers && cartItem.selected_modifiers.length > 0 && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          + {cartItem.selected_modifiers.map((m) => m.name).join(', ')}
                        </p>
                      )}

                      {cartItem.special_notes && (
                        <p className="text-[10px] text-amber-300/80 italic mt-0.5">
                          "{cartItem.special_notes}"
                        </p>
                      )}

                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-xs font-black font-mono text-white">
                          {cartItem.total_price}
                        </span>
                        <span className="text-[10px] text-slate-400">ر.س</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 rtl:space-x-reverse shrink-0">
                      {cartItem.catalog_item.item_type === 'product' && (
                        <div className="flex items-center bg-slate-900 rounded-xl border border-slate-800 p-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartItemQty(cartItem.id, -1)}
                            className="w-6 h-6 rounded-lg bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700"
                          >
                            <Minus className="w-3 gross-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-mono font-bold text-white">
                            {cartItem.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartItemQty(cartItem.id, 1)}
                            className="w-6 h-6 rounded-lg bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveCartItem(cartItem.id)}
                        className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition"
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-black text-slate-300">طريقة الاستلام أو الحجز:</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('dine_in')}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                      fulfillmentType === 'dine_in'
                        ? 'bg-slate-900 border-2'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                    style={
                      fulfillmentType === 'dine_in'
                        ? {
                            borderColor: brandSecondary,
                            color: brandSecondary,
                          }
                        : undefined
                    }
                  >
                    <Utensils className="w-4 h-4" />
                    <span>🍽️ تناول محلي</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentType('takeaway')}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                      fulfillmentType === 'takeaway'
                        ? 'bg-slate-900 border-2'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                    style={
                      fulfillmentType === 'takeaway'
                        ? {
                            borderColor: brandSecondary,
                            color: brandSecondary,
                          }
                        : undefined
                    }
                  >
                    <Car className="w-4 h-4" />
                    <span>🚗 استلام سفري</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentType('delivery')}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                      fulfillmentType === 'delivery'
                        ? 'bg-slate-900 border-2'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                    style={
                      fulfillmentType === 'delivery'
                        ? {
                            borderColor: brandSecondary,
                            color: brandSecondary,
                          }
                        : undefined
                    }
                  >
                    <MapPin className="w-4 h-4" />
                    <span>🛵 توصيل للعنوان</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentType('service_booking')}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                      fulfillmentType === 'service_booking'
                        ? 'bg-slate-900 border-2'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                    style={
                      fulfillmentType === 'service_booking'
                        ? {
                            borderColor: brandSecondary,
                            color: brandSecondary,
                          }
                        : undefined
                    }
                  >
                    <Calendar className="w-4 h-4" />
                    <span>💇‍♂️ موعد خدمة</span>
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                {fulfillmentType === 'dine_in' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300">
                        رقم الطاولة في المحل (إن وجد):
                      </label>
                      <input
                        type="text"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="مثال: 7"
                        className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white text-center font-mono focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <label className="text-xs font-bold text-slate-300">
                        أو حجز طاولة مسبق (عدد الأفراد):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={partySize}
                          onChange={(e) => setPartySize(Number(e.target.value))}
                          className="w-16 bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white text-center font-mono focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">أشخاص</span>
                      </div>
                    </div>
                  </div>
                )}

                {fulfillmentType === 'takeaway' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        وقت الاستلام المفضل:
                      </label>
                      <input
                        type="time"
                        value={arrivalTime}
                        onChange={(e) => setArrivalTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        بيانات السيارة للاستلام السريع (النوع واللوحة - اختياري):
                      </label>
                      <input
                        type="text"
                        value={carPlate}
                        onChange={(e) => setCarPlate(e.target.value)}
                        placeholder="مثال: كامري أبيض - أ ب ج 1234"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {fulfillmentType === 'delivery' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        عنوان التوصيل بالتفصيل:
                      </label>
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="الحي، الشارع، رقم العمارة / المنزل..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        رابط خرائط جوجل (Google Maps GPS Link):
                      </label>
                      <input
                        type="url"
                        value={deliveryGpsLink}
                        onChange={(e) => setDeliveryGpsLink(e.target.value)}
                        placeholder="https://maps.app.goo.gl/..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {fulfillmentType === 'service_booking' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">
                          تاريخ الموعد:
                        </label>
                        <input
                          type="date"
                          value={arrivalDate}
                          onChange={(e) => setArrivalDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">
                          الساعة المفضلة:
                        </label>
                        <input
                          type="time"
                          value={arrivalTime}
                          onChange={(e) => setArrivalTime(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        الأخصائي أو الموظف المفضل (اختياري):
                      </label>
                      <input
                        type="text"
                        value={specialistName}
                        onChange={(e) => setSpecialistName(e.target.value)}
                        placeholder="اسم المختص..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    ملاحظات عامة للطلب:
                  </label>
                  <input
                    type="text"
                    value={generalOrderNotes}
                    onChange={(e) => setGeneralOrderNotes(e.target.value)}
                    placeholder="أي تعليمات إضافية للمتجر..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono text-white font-bold">{cartSubtotal} ر.س</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex items-center justify-between text-slate-400">
                    <span>رسوم التوصيل:</span>
                    <span className="font-mono text-white font-bold">+{deliveryFee} ر.س</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm font-black">
                  <span className="text-white">الإجمالي النهائي:</span>
                  <span className="font-mono" style={{ color: brandSecondary }}>
                    {cartGrandTotal} ر.س
                  </span>
                </div>
                {estimatedLoyaltyPoints > 0 && (
                  <div className="pt-1.5 flex items-center justify-between text-emerald-400 text-[11px] font-bold">
                    <span>نقاط الولاء المكتسبة عند الدفع:</span>
                    <span className="font-mono">+{estimatedLoyaltyPoints} نقطة ✨</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={handleSendWhatsAppOrder}
                className="w-full py-3.5 rounded-2xl font-black text-sm text-white bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-600/25 flex items-center justify-center gap-2 transition active:scale-95"
              >
                <MessageCircle className="w-5 h-5 fill-current" />
                <span>إرسال الطلب عبر الواتساب مباشرة 🚀</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {orderSuccessPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div
            className="glass-card max-w-md w-full rounded-3xl p-6 sm:p-8 space-y-5 border text-center relative shadow-2xl bg-slate-900"
            style={{ borderColor: `${brandSecondary}80` }}
          >
            <button
              onClick={() => setOrderSuccessPayload(null)}
              className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-4xl mx-auto shadow-inner animate-bounce">
              ✅
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold font-mono inline-block">
                طلبك رقم #{orderSuccessPayload.order_id}
              </span>
              <h3 className="text-xl font-black text-white">تم تجهيز وإرسال الطلب بنجاح!</h3>
              <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                تم تحويل طلبك لـ <strong className="text-white">{store.name}</strong> عبر الواتساب. سيقوم المتجر بتأكيد استلاستلام الطلب وتجهيزه فوراً.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs text-right">
              <div className="flex items-center justify-between text-slate-400">
                <span>الإجمالي:</span>
                <span className="font-mono text-white font-bold">{orderSuccessPayload.total_amount} ر.س</span>
              </div>
              <div className="flex items-center justify-between text-emerald-400 font-bold">
                <span>النقاط المستحقة:</span>
                <span className="font-mono">+{orderSuccessPayload.loyalty_points_earned} نقطة ولاء</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const merchantPhone = store.manager_contact || '0577371780';
                  const whatsappUrl = LoyaltyService.generateWhatsAppOrderUrl(merchantPhone, orderSuccessPayload);
                  window.open(whatsappUrl, '_blank');
                }}
                className="w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm text-white bg-emerald-600 hover:bg-emerald-500 shadow-xl flex items-center justify-center gap-2 transition"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>إعادة فتح المحادثة على الواتساب 💬</span>
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
              className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up"
              style={{ borderColor: `${brandSecondary}40` }}
            >
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold"
                    style={{
                      backgroundColor: `${brandSecondary}20`,
                      color: brandSecondary,
                    }}
                  >
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      سجل طلباتي وحجوزاتي السابقة
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      إعادة الطلب والحجز بضغطة زر واحدة
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPastOrdersModal(false)}
                  className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-2 bg-slate-950/80 border-b border-slate-800 grid grid-cols-2 gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPastModalTab('orders')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    pastModalTab === 'orders'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>طلبات المنيو ({pastOrders.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPastModalTab('bookings')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    pastModalTab === 'bookings'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>حجوزات الخدمات ({customerServiceBookings.length})</span>
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1 text-right">
                {pastModalTab === 'orders' && (
                  <>
                    {pastOrders.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 space-y-2">
                        <History className="w-10 h-10 mx-auto text-slate-600" />
                        <p className="text-xs">لا توجد طلبات سابقة مسجلة حتى الآن.</p>
                      </div>
                    ) : (
                      pastOrders.map((order) => {
                        const fulfillmentTitles: Record<string, string> = {
                          dine_in: '🍽️ محلي',
                          takeaway: '🚗 سفري',
                          delivery: '🛵 توصيل',
                          service_booking: '💇‍♂️ حجز موعد',
                        };

                        return (
                          <div
                            key={order.order_id}
                            className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 shadow-md"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold"
                                  style={{
                                    backgroundColor: `${brandSecondary}20`,
                                    color: brandSecondary,
                                    border: `1px solid ${brandSecondary}40`,
                                  }}
                                >
                                  #{order.order_id}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  {fulfillmentTitles[order.fulfillment_type] || order.fulfillment_type}
                                </span>
                                {order.status === 'completed' && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                                    ✓ مكتمل
                                  </span>
                                )}
                                {order.status === 'preparing' && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                                    🔥 قيد التحضير
                                  </span>
                                )}
                                {(!order.status || order.status === 'pending') && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                                    ⏳ قيد الانتظار
                                  </span>
                                )}
                              </div>

                              <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
                                {new Date(order.created_at).toLocaleDateString('ar-SA')}
                              </span>
                            </div>

                            <div className="space-y-1 text-xs text-slate-300">
                              {order.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center">
                                  <span>
                                    {item.quantity}x {item.catalog_item.name}
                                    {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                                      <span className="text-[10px] text-slate-400 mr-1">
                                        ({item.selected_modifiers.map((m) => m.name).join(', ')})
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono text-slate-400">{item.total_price} ر.س</span>
                                </div>
                              ))}
                            </div>

                            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                              <div>
                                <span className="text-slate-400">الإجمالي: </span>
                                <strong className="text-white font-mono">{order.total_amount} ر.س</strong>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleReOrder(order)}
                                style={{
                                  backgroundColor: brandSecondary,
                                  color: '#000000',
                                }}
                                className="px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 shadow hover:brightness-110 transition active:scale-95"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>إعادة الطلب 🔁</span>
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
                        <Calendar className="w-10 h-10 mx-auto text-slate-600" />
                        <p className="text-xs">لا توجد حجوزات مواعيد سابقة مسجلة برقمك.</p>
                      </div>
                    ) : (
                      customerServiceBookings.map((bk) => (
                        <div
                          key={bk.id}
                          className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 shadow-md"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                                #{bk.booking_number}
                              </span>
                              {bk.service_category && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                                  {bk.service_category}
                                </span>
                              )}
                              {bk.status === 'completed' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                                  ✓ تم الحضور
                                </span>
                              )}
                              {bk.status === 'confirmed' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                                  📅 مؤكد
                                </span>
                              )}
                              {bk.status === 'cancelled' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
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
                              <strong className="text-white text-sm">{bk.service_name}</strong>
                              <span className="font-mono text-amber-400 font-bold">{bk.total_price || bk.service_price} ر.س</span>
                            </div>

                            {bk.selected_modifiers && bk.selected_modifiers.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {bk.selected_modifiers.map((mod, i) => (
                                  <span
                                    key={i}
                                    className="text-[10px] px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/40 text-blue-200"
                                  >
                                    +{mod.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                              <span>المختص: <strong className="text-blue-300">{bk.specialist_name || 'أي مختص متاح'}</strong></span>
                              <span>المدة: {bk.duration_minutes || bk.service_duration_minutes || 30} دقيقة</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                            <div className="text-emerald-400 text-[11px] font-bold">
                              +{bk.points_to_earn || bk.loyalty_points_earned || 0} نقطة ولاء
                            </div>

                            <button
                              type="button"
                              onClick={() => handleReBookService(bk)}
                              className="px-3.5 py-1.5 rounded-xl font-black text-xs bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 shadow transition active:scale-95"
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

    </div>
  );
};
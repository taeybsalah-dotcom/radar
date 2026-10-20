import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Store, Customer, Tier, Privilege, DynamicQRToken, StoreStaff, CustomerCoupon, StoreBranch, getStoreActiveModules } from '../types';
import { LoyaltyService, normalizePhone, getSupabaseClient } from '../lib/supabase';
import { QRScannerModal } from './QRScannerModal';
import { StaffLoginGate } from './StaffLoginGate';
import { NotificationBell } from './NotificationBell';
import { clearAllInboxNotifications, sendPortalNotification, requestNotificationPermission, getNotificationPermissionStatus } from '../lib/notifications';
import { playBeepSound, ensureAudioUnlocked } from '../lib/sound';
import { LoyaltyEvents } from '../lib/events';
import { saveActiveStoreBranding } from '../lib/storeBranding';
import { CashierRegisterTab } from './CashierRegisterTab';
import { CashierShiftCloseModal } from './CashierShiftCloseModal';
import { CashierRefundModal } from './CashierRefundModal';
import { OfflineSyncModal } from './OfflineSyncModal';
import { OfflineSyncEngine } from '../lib/offlineSync';
import { KitchenDisplaySystem } from './KitchenDisplaySystem';
import { CashierCashMovementModal } from './CashierCashMovementModal';
import { QRCodeSVG } from 'qrcode.react';
import {
  Camera, QrCode, ShoppingBag, Calendar,
  Zap,
  Gift,
  Clock,
  Sparkles,
  Lock,
  ShieldCheck,
  AlertTriangle,
  User,
  LogOut,
  Phone,
  Ticket,
  Check,
  X,
  RefreshCw,
  Layers,
  History,
  AlertCircle,
  Search,
  Flame,
  CheckCircle2,
  DollarSign,
  KeyRound,
  Key,
  Volume2,
  VolumeX,
  Bell,
  Utensils,
  ChefHat,
  Filter,
  Building2,
  Receipt,
  RotateCcw,
  Wifi,
  WifiOff,
  TrendingDown,
  Coins,
  Scissors,
  ExternalLink,
  Copy,
  MessageSquare,
} from 'lucide-react';
import { DriverService } from '../lib/driverService';

interface CashierPOSProps {
  store: Store;
}

export const CashierPOS: React.FC<CashierPOSProps> = ({ store }) => {
  // 🛡️ ZERO ADMIN FALLBACK: Check staff session for cashier or admin operating POS
  const [authenticatedCashier, setAuthenticatedCashier] = useState<StoreStaff | null>(() => {
    if (!store?.id) return null;
    return LoyaltyService.getStaffSession(store.id, 'any', store.slug);
  });

  useEffect(() => {
    if (store) {
      saveActiveStoreBranding(store);
    }
  }, [store]);

  // Memoized brand styling derived from store colors
  const brandColors = useMemo(() => {
    const rawPrimary = store?.primary_color || '#0F172A';
    const rawSecondary = store?.secondary_color || '#535EB2';

    const safePrimary = /^#[0-9A-Fa-f]{6}$/.test(rawPrimary) ? rawPrimary : '#0F172A';
    const safeSecondary = /^#[0-9A-Fa-f]{6}$/.test(rawSecondary) ? rawSecondary : '#535EB2';

    const hexToRgb = (hex: string) => {
      const clean = hex.replace('#', '');
      return {
        r: parseInt(clean.substring(0, 2), 16) || 0,
        g: parseInt(clean.substring(2, 4), 16) || 0,
        b: parseInt(clean.substring(4, 6), 16) || 0,
      };
    };

    const rgbToHsl = (r: number, g: number, b: number) => {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (max + min) / 2;
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
      h /= 360; s /= 100; l /= 100;
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    };

    const rgbToHex = (r: number, g: number, b: number) =>
      `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

    const shiftLightness = (hsl: { h: number; s: number; l: number }, deltaPercent: number) => {
      const newL = Math.max(0, Math.min(100, hsl.l + deltaPercent));
      const rgb = hslToRgb(hsl.h, hsl.s, newL);
      return rgbToHex(rgb.r, rgb.g, rgb.b);
    };

    const secRgb = hexToRgb(safeSecondary);
    const secHsl = rgbToHsl(secRgb.r, secRgb.g, secRgb.b);
    const secContrast = (0.299 * secRgb.r + 0.587 * secRgb.g + 0.114 * secRgb.b) / 255;
    const contrastOnSecondary = secContrast > 0.55 ? '#000000' : '#FFFFFF';

    const priRgb = hexToRgb(safePrimary);
    const priHsl = rgbToHsl(priRgb.r, priRgb.g, priRgb.b);
    const priContrast = (0.299 * priRgb.r + 0.587 * priRgb.g + 0.114 * priRgb.b) / 255;
    const isPrimaryLight = priContrast > 0.60;
    const contrastOnPrimary = isPrimaryLight ? '#0F172A' : '#FFFFFF';

    let textLightL = secHsl.l;
    if (textLightL > 42) textLightL = 36;
    const textOnLightRgb = hslToRgb(secHsl.h, Math.max(secHsl.s, 65), textLightL);
    const textOnLightHex = rgbToHex(textOnLightRgb.r, textOnLightRgb.g, textOnLightRgb.b);

    const buttonGradient = `linear-gradient(135deg, ${shiftLightness(secHsl, 10)} 0%, ${safeSecondary} 55%, ${shiftLightness(secHsl, -10)} 100%)`;

    return {
      primary: safePrimary,
      secondary: safeSecondary,
      isPrimaryLight,
      contrastOnPrimary,
      contrastOnSecondary,
      textOnLightHex,
      buttonGradient,
      glow: `${safeSecondary}40`,
    };
  }, [store?.primary_color, store?.secondary_color]);

  const isDarkTheme = store?.theme_mode === 'dark';
  const isWarmTheme = store?.theme_mode === 'warm_cream';
  const isLightOrWarm = !isDarkTheme;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [privileges, setPrivileges] = useState<Privilege[]>([]);
  const [storeCoupons, setStoreCoupons] = useState<CustomerCoupon[]>([]);
  const [staffList, setStaffList] = useState<StoreStaff[]>([]);
  const [storeBranches, setStoreBranches] = useState<StoreBranch[]>([]);
  const [activeStaff, setActiveStaff] = useState<StoreStaff | null>(authenticatedCashier);

  const authCashierRef = useRef<StoreStaff | null>(authenticatedCashier);
  authCashierRef.current = authenticatedCashier;
  const activeStaffRef = useRef<StoreStaff | null>(activeStaff);
  activeStaffRef.current = activeStaff;

  // ⚡ Debounce / Duplicate Scan Suppression Ref (Section 15 & 51)
  const lastScanRef = useRef<{ rawData: string; timestamp: number } | null>(null);

  const [activeTab, setActiveTab] = useState<'register' | 'orders' | 'bookings' | 'scanner' | 'rewards'>('register');
  const [loading, setLoading] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerAction, setScannerAction] = useState<'SMART' | 'REDEEM'>('SMART');
  const [selectedReward, setSelectedReward] = useState<{ id?: string; title: string; cost: number } | null>(null);

  // 📱 KDS & Services Display QR Codes Modal for Kitchen/Salon Tablets
  const [isScreensModalOpen, setIsScreensModalOpen] = useState(false);
  const [copiedScreenKey, setCopiedScreenKey] = useState<string | null>(null);
  const [screensModalBranchId, setScreensModalBranchId] = useState<string>('');

  // 🧾 Transfer online order or booking into active POS Cart
  const [transferredOrderToPOS, setTransferredOrderToPOS] = useState<any | null>(null);

  const handleTransferOrderToPOS = (order: any) => {
    stopAlertRinger();
    setIncomingAlert(null);
    setTransferredOrderToPOS(order);
    setActiveTab('register');
  };

  const handleTransferBookingToPOS = (booking: any) => {
    stopAlertRinger();
    setIncomingAlert(null);
    const isPaid = booking.payment_status === 'paid' || booking.payment_method === 'online';
    const bookingOrder = {
      id: booking.id,
      order_number: booking.booking_number,
      customer_id: booking.customer_id,
      customer_name: booking.customer_name,
      customer_phone: booking.customer_phone,
      order_source: 'customer_app_booking',
      payment_method: booking.payment_method || (isPaid ? 'online' : 'pay_at_store'),
      payment_status: booking.payment_status || (isPaid ? 'paid' : 'pending'),
      is_app_paid: isPaid,
      fulfillment_type: 'service_booking',
      notes: `حجز موعد #${booking.booking_number} (${booking.booking_date} | ${booking.booking_time})${booking.notes ? ` - ${booking.notes}` : ''}`,
      items: [
        {
          id: booking.service_id,
          name: booking.service_name,
          category: booking.service_category || 'خدمات',
          unit_price: Number(booking.total_price || booking.service_price) || 0,
          quantity: 1,
          total_price: Number(booking.total_price || booking.service_price) || 0,
          item_type: 'service',
          duration_minutes: booking.duration_minutes || booking.service_duration_minutes || 30,
          specialist_id: booking.specialist_id,
          specialist_name: booking.specialist_name,
          notes: `حجز #${booking.booking_number}`,
        },
      ],
    };
    setTransferredOrderToPOS(bookingOrder);
    setActiveTab('register');
  };

  // 💰 Invoice Amount Modal State (For Customer Points Accumulation)
  const [isAmountModalOpen, setIsAmountModalOpen] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState<number | ''>('');
  const [pendingCustomerScan, setPendingCustomerScan] = useState<{
    phone: string;
    name?: string;
    qrTokenObj?: DynamicQRToken;
    entryMethod: 'qr_scan' | 'manual';
  } | null>(null);

  // 🛡️ High Invoice Manager Approval State
  const [isManagerApprovalModalOpen, setIsManagerApprovalModalOpen] = useState(false);
  const [managerPinInput, setManagerPinInput] = useState('');
  const [managerPinError, setManagerPinError] = useState<string | null>(null);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // 🔑 Cashier Self-Service PIN Change State
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [changePinCurrent, setChangePinCurrent] = useState('');
  const [changePinNew, setChangePinNew] = useState('');
  const [changePinConfirm, setChangePinConfirm] = useState('');
  const [changePinError, setChangePinError] = useState<string | null>(null);
  const [changePinSuccess, setChangePinSuccess] = useState<string | null>(null);
  const [isSavingCashierPin, setIsSavingCashierPin] = useState(false);

  // 🔒 Shift Close & Cash Drawer Modal State
  const [isShiftCloseModalOpen, setIsShiftCloseModalOpen] = useState(false);

  // 🔄 Refund & Tax Credit Note Modal State
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  // 💵 Cash Drawer In / Out Movement Modal State
  const [isCashMovementModalOpen, setIsCashMovementModalOpen] = useState(false);
  const [cashMovementInitialType, setCashMovementInitialType] = useState<'cash_in' | 'cash_out'>('cash_out');

  // 🌐 Offline Sync Modal State
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);

  // ✏️ Unified Manual Input State (Phone or Coupon Code)
  const [manualInput, setManualInput] = useState('');

  // Subscription Status State
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    isSuspended: boolean;
    requiresSetup: boolean;
    requiresRenewal: boolean;
    status: string;
  } | null>(null);

  const [successResult, setSuccessResult] = useState<{
    message: string;
    points?: number;
    phone?: string;
    tier?: string;
    balance?: number;
    couponTitle?: string;
    couponCode?: string;
    type: 'PURCHASE' | 'REDEEM' | 'COUPON';
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 🛒 Live Orders State
  const [liveOrders, setLiveOrders] = useState<any[]>([]);
  const [liveBookings, setLiveBookings] = useState<any[]>([]);
  const liveOrdersRef = useRef<any[]>(liveOrders);
  liveOrdersRef.current = liveOrders;
  const liveBookingsRef = useRef<any[]>(liveBookings);
  liveBookingsRef.current = liveBookings;
  const [orderActionError, setOrderActionError] = useState<string | null>(null);

  // 🔔 Audio & Realtime Alert State
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('radar_pos_sound_muted') === 'true';
    } catch {
      return false;
    }
  });
  const isSoundMutedRef = useRef(isSoundMuted);
  isSoundMutedRef.current = isSoundMuted;

  const toggleSound = () => {
    setIsSoundMuted(prev => {
      const next = !prev;
      try {
        localStorage.setItem('radar_pos_sound_muted', String(next));
      } catch {}
      if (!next) {
        try { playBeepSound('pos_order_alert'); } catch {}
      }
      return next;
    });
  };

  const [notificationPermission, setNotificationPermission] = useState<string>(() => {
    return getNotificationPermissionStatus();
  });

  useEffect(() => {
    // Automatically attempt to prompt for notifications on first interaction if default
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const handleFirstInteraction = () => {
          requestNotificationPermission()
            .then((status) => setNotificationPermission(status))
            .catch(() => {});
          window.removeEventListener('click', handleFirstInteraction);
          window.removeEventListener('touchstart', handleFirstInteraction);
        };
        window.addEventListener('click', handleFirstInteraction, { once: true });
        window.addEventListener('touchstart', handleFirstInteraction, { once: true });
      }
    }
  }, []);

  const handleEnableNotifications = async () => {
    const status = await requestNotificationPermission();
    setNotificationPermission(status);
    if (status === 'granted') {
      try {
        playBeepSound('notification');
      } catch {}
    }
  };

  // 🔋 Persistent Background Standby & Screen WakeLock (For mobile order alerts when screen is locked)
  const silentKeepAliveAudioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<any>(null);
  const [isKeepAliveActive, setIsKeepAliveActive] = useState<boolean>(false);

  const requestWakeLock = async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {}
    }
  };

  const startBackgroundKeepAlive = async () => {
    try {
      // 1. Silent Loop Audio to maintain active OS media session (prevents iOS/Android from killing WebSocket)
      if (!silentKeepAliveAudioRef.current && typeof window !== 'undefined') {
        const audio = new Audio('/sounds/silent-keepalive.wav');
        audio.loop = true;
        audio.preload = 'auto';
        silentKeepAliveAudioRef.current = audio;
      }
      if (silentKeepAliveAudioRef.current) {
        await silentKeepAliveAudioRef.current.play().catch(() => {});
      }

      // 2. Set MediaSession so iOS/Android treats it as persistent foreground media
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `رادار كاشير | في انتظار الطلبات 🟢`,
          artist: store.name,
          album: 'نظام الاستقبال الفوري للطلبات',
          artwork: [{ src: store.logo_url || '/icon-192.png', sizes: '192x192', type: 'image/png' }],
        });
        navigator.mediaSession.setActionHandler('play', () => {
          silentKeepAliveAudioRef.current?.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          silentKeepAliveAudioRef.current?.play().catch(() => {});
        });
      }

      // 3. Keep screen from dimming/sleeping
      await requestWakeLock();

      setIsKeepAliveActive(true);
    } catch (e) {
      console.warn('Background keep-alive start error:', e);
    }
  };

  useEffect(() => {
    // Start keep alive on first user interaction anywhere in POS
    const triggerKeepAlive = () => {
      startBackgroundKeepAlive();
      window.removeEventListener('click', triggerKeepAlive);
      window.removeEventListener('touchstart', triggerKeepAlive);
    };
    window.addEventListener('click', triggerKeepAlive, { once: true });
    window.addEventListener('touchstart', triggerKeepAlive, { once: true });

    // Handle visibility change to re-acquire wakeLock if user returns to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release(); } catch {}
      }
      if (silentKeepAliveAudioRef.current) {
        silentKeepAliveAudioRef.current.pause();
      }
    };
  }, [store.name, store.logo_url]);

  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );

  const [incomingAlert, setIncomingAlert] = useState<{
    id: string;
    title: string;
    detail: string;
    type: 'order' | 'booking' | 'coupon';
    orderId?: string;
    bookingId?: string;
  } | null>(null);

  const lastAlertKeyRef = useRef<{ key: string; time: number }>({ key: '', time: 0 });
  const alertRingerTimerRef = useRef<any>(null);

  const stopAlertRinger = () => {
    if (alertRingerTimerRef.current) {
      clearInterval(alertRingerTimerRef.current);
      alertRingerTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopAlertRinger();
    };
  }, []);

  // 📍 Interactive Branch Selection for Cashier and Manager
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`radar_pos_active_branch_${store.id}`) || null;
    } catch {
      return null;
    }
  });

  const effectiveStaff = activeStaff || authenticatedCashier;
  const isAdmin = effectiveStaff?.role === 'admin';

  // Allowed branches for this staff member
  const allowedBranches = useMemo(() => {
    if (isAdmin) return storeBranches;
    if (!effectiveStaff) return storeBranches;
    const assigned = Array.isArray(effectiveStaff.assigned_branch_ids) ? effectiveStaff.assigned_branch_ids : [];
    const directBranch = effectiveStaff.branch_id;
    if (assigned.length === 0 && !directBranch) return storeBranches;
    return storeBranches.filter(b => assigned.includes(b.id) || b.id === directBranch);
  }, [isAdmin, effectiveStaff, storeBranches]);

  // Determine current active branch ID
  const effectiveBranchId: string | null = useMemo(() => {
    if (isAdmin) {
      if (selectedBranchId === 'ALL') return null;
      if (selectedBranchId && storeBranches.some(b => b.id === selectedBranchId)) {
        return selectedBranchId;
      }
      return effectiveStaff?.branch_id || (storeBranches.length > 0 ? storeBranches[0].id : null);
    }
    // Cashier:
    if (selectedBranchId && allowedBranches.some(b => b.id === selectedBranchId)) {
      return selectedBranchId;
    }
    return allowedBranches[0]?.id || effectiveStaff?.branch_id || storeBranches[0]?.id || null;
  }, [isAdmin, selectedBranchId, allowedBranches, effectiveStaff?.branch_id, storeBranches]);

  const isGeneralManager = isAdmin && (!effectiveBranchId || selectedBranchId === 'ALL');
  const activeBranchId = isGeneralManager ? null : effectiveBranchId;
  const activeBranchObj = storeBranches.find(b => b.id === activeBranchId);

  const activeBranchIdRef = useRef<string | null>(activeBranchId);
  activeBranchIdRef.current = activeBranchId;
  const isGMModeRef = useRef<boolean>(isGeneralManager);
  isGMModeRef.current = isGeneralManager;

  // 🛵 Branch Delivery Drivers
  const branchDrivers = useMemo(() => {
    if (!store?.id) return [];
    return DriverService.getDrivers(store.id, activeBranchId);
  }, [store?.id, activeBranchId, liveOrders]);

  const handleAssignDriver = (order: any, driverId: string) => {
    if (!store?.id) return;
    const orderId = order.id || order.order_id || order.order_number;
    const updated = DriverService.assignOrderToDriver(store.id, orderId, driverId);
    if (updated) {
      setLiveOrders((prev) =>
        prev.map((o) =>
          o.id === order.id || o.order_id === order.id || o.order_number === order.order_number
            ? { ...o, ...updated, driver_id: driverId, driver_name: updated.driver_name, driver_phone: updated.driver_phone, delivery_status: 'assigned' }
            : o
        )
      );
      playBeepSound('success');
    }
  };

  const handleNotifyDriverWhatsApp = (order: any) => {
    const driverPhone = order.driver_phone;
    if (!driverPhone) return;
    const cleanPhone = driverPhone.replace(/^0/, '966').replace(/\D/g, '');
    const itemsText = Array.isArray(order.items)
      ? order.items.map((it: any) => `- ${it.quantity || 1}x ${it.catalog_item?.name || it.name || 'صنف'}`).join('\n')
      : '';
    const portalUrl = `${window.location.origin}/?store=${encodeURIComponent(store.slug || store.id)}&portal=driver&driver=${order.driver_id || ''}&branch=${order.branch_id || activeBranchId || ''}`;

    const msg = `🛵 *طلب توصيل جديد من ${store.name}*
رقم الطلب: #${order.order_number || order.id}
اسم العميل: ${order.customer_name || 'عميل'}
جوال العميل: ${order.customer_phone || '-'}
العنوان: ${order.delivery_address || order.fulfillment_details?.delivery_address || 'حسب اللوكيشن'}
${order.delivery_gps_link || order.fulfillment_details?.delivery_gps_link ? `📍 اللوكيشن: ${order.delivery_gps_link || order.fulfillment_details?.delivery_gps_link}\n` : ''}
المبلغ المطلوب: ${Number(order.total_price || 0).toFixed(2)} ر.س
حالة الدفع: ${order.payment_status === 'paid' ? 'مدفوع مسبقاً بالتطبيق ✅' : 'تحصيل عند الباب (كاش/شبكة) 💵'}

📋 *الأصناف:*
${itemsText}

📲 *افتح تطبيق السائق لتأكيد الاستلام والتسليم:*
${portalUrl}`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleSwitchBranch = (branchId: string | null) => {
    setSelectedBranchId(branchId || 'ALL');
    try {
      if (branchId) {
        localStorage.setItem(`radar_pos_active_branch_${store.id}`, branchId);
      } else {
        localStorage.setItem(`radar_pos_active_branch_${store.id}`, 'ALL');
      }
    } catch {}
  };

  // 🛡️ Strict Branch Alert Filter:
  // If in GM mode (admin viewing all branches), receive all alerts.
  // Specific branch cashier/manager: strictly isolate to their currently active branch.
  const shouldAlertForBranch = (incomingBranchId?: string | null): boolean => {
    if (isGMModeRef.current) return true;
    const curBranch = activeBranchIdRef.current;
    if (!curBranch) return true;
    if (incomingBranchId && incomingBranchId !== curBranch) {
      return false;
    }
    if (!incomingBranchId) {
      const isMain = storeBranches.find(b => b.id === curBranch)?.is_main;
      return Boolean(isMain);
    }
    return true;
  };

  // 🛑 State-Driven Ringer Watcher: Automatically stops ringer when current alert is no longer pending
  useEffect(() => {
    if (incomingAlert?.orderId) {
      const order = liveOrders.find(o => o.id === incomingAlert.orderId);
      if (order && order.status !== 'pending') {
        stopAlertRinger();
        setIncomingAlert(null);
      }
    }
    if (incomingAlert?.bookingId) {
      const booking = liveBookings.find(b => b.id === incomingAlert.bookingId);
      if (booking && booking.status !== 'pending') {
        stopAlertRinger();
        setIncomingAlert(null);
      }
    }
  }, [liveOrders, liveBookings, incomingAlert]);

  const triggerLiveAlert = (
    title: string,
    detail: string,
    type: 'order' | 'booking' | 'coupon' = 'order',
    targetEntityId?: string,
    targetBranchId?: string | null
  ) => {
    // 🛡️ Defense-in-depth: if targetBranchId is provided and does not match active branch, abort
    if (targetBranchId && !shouldAlertForBranch(targetBranchId)) {
      return;
    }

    const alertKey = `${title}_${detail}_${targetEntityId || ''}`;
    const now = Date.now();
    const isDuplicate = lastAlertKeyRef.current.key === alertKey && (now - lastAlertKeyRef.current.time < 4000);

    // If duplicate event fired rapidly, keep the existing ringer loop running!
    if (isDuplicate && alertRingerTimerRef.current) {
      return;
    }
    lastAlertKeyRef.current = { key: alertKey, time: now };

    stopAlertRinger();

    if (!isSoundMutedRef.current) {
      try {
        playBeepSound('pos_order_alert');
      } catch (e) {
        console.warn('Audio alert failed', e);
      }

      // 🛎️ Show OS / Lockscreen push notification (rings/vibrates even if browser in background or screen off)
      try {
        sendPortalNotification({
          title: `🛎️ ${title}`,
          body: detail,
          tag: `pos-alert-${targetEntityId || Date.now()}`,
          soundType: 'pos_order_alert',
          requireInteraction: true,
        });
      } catch {}

      // 📳 Mobile Physical Device Vibration
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([500, 250, 500, 250, 800]);
        } catch {}
      }

      // 🛎️ Continuous ringer loop (rings & vibrates every 3.0 seconds until accepted or cancelled)
      if (type === 'order' || type === 'booking') {
        alertRingerTimerRef.current = setInterval(() => {
          if (!isSoundMutedRef.current) {
            try {
              playBeepSound('pos_order_alert');
            } catch {}
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([350, 150, 350]);
              } catch {}
            }
          }
        }, 3000);
      }
    }

    const alertId = Math.random().toString(36).substring(7);
    setIncomingAlert({
      id: alertId,
      title,
      detail,
      type,
      orderId: type === 'order' ? targetEntityId : undefined,
      bookingId: type === 'booking' ? targetEntityId : undefined,
    });

    // Coupons auto-dismiss after 6s; Orders & Bookings remain until handled
    if (type === 'coupon') {
      setTimeout(() => {
        setIncomingAlert(prev => (prev?.id === alertId ? null : prev));
      }, 6000);
    }
  };

  // 🎛️ Store Active Modules (SaaS & Merchant Settings)
  const activeModules = useMemo(() => getStoreActiveModules(store), [store]);

  // 📦 Orders & Bookings Organization State
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'new' | 'preparing' | 'completed'>('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'past'>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');

  // Auto-sync tab if active modules change
  useEffect(() => {
    if (!activeModules.orders && activeTab === 'orders') {
      setActiveTab(activeModules.bookings ? 'bookings' : 'register');
    } else if (!activeModules.bookings && activeTab === 'bookings') {
      setActiveTab(activeModules.orders ? 'orders' : 'register');
    }
  }, [activeModules.orders, activeModules.bookings, activeTab]);

  // 🔊 Unlock Web Audio API on first user interaction (click/touch/key) to comply with browser Autoplay Policy
  useEffect(() => {
    const handleUnlock = () => {
      ensureAudioUnlocked();
    };
    window.addEventListener('pointerdown', handleUnlock, { once: true, passive: true });
    window.addEventListener('keydown', handleUnlock, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
  }, []);

  const [effectiveStoreId, setEffectiveStoreId] = useState<string>(store.id);

  useEffect(() => {
    LoyaltyService.resolveStore(store.id).then((resolved) => {
      if (resolved?.id) {
        setEffectiveStoreId(resolved.id);
      }
    });
  }, [store?.id]);

  useEffect(() => {
    if (!store?.id) return;
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
      setEffectiveStoreId(validStoreUuid);

      // 1. Initial Load (Runs ONCE when cashier mounts)
      LoyaltyService.getLiveStoreOrders(validStoreUuid).then(orders => {
        if (!isCancelled) setLiveOrders(orders);
      }).catch(() => {});
      LoyaltyService.getLiveStoreBookings(validStoreUuid).then(bookings => {
        if (!isCancelled) setLiveBookings(bookings);
      }).catch(() => {});

      // 2. Realtime WebSocket subscription with verified UUID server filter
      const supabase = getSupabaseClient();
      if (!supabase) return;

      channel = supabase
        .channel('pos-live-orders-and-bookings-' + (validStoreUuid || store.id) + '-' + Date.now())
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_orders',
          },
          (payload: any) => {
            const updated = payload.new;
            if (!updated) return;
            const orderStoreId = String(updated.store_id || '').toLowerCase().trim();
            const currentUuid = String(validStoreUuid || '').toLowerCase().trim();
            const rawStoreId = String(store?.id || '').toLowerCase().trim();

            const isStoreMatch = Boolean(
              (currentUuid && orderStoreId === currentUuid) ||
              (rawStoreId && orderStoreId === rawStoreId)
            );
            const isExistingMatch = liveOrdersRef.current.some(o => o.id === updated.id || (o.order_number && o.order_number === updated.order_number));

            if (!isStoreMatch && !isExistingMatch) return;

            if (payload.eventType === 'INSERT') {
              setLiveOrders(prev => [payload.new, ...prev.filter(o => o.id !== payload.new.id && o.order_number !== payload.new.order_number)]);
              // 🛡️ Alert ONLY for orders from customer app, NEVER for in-store walk-in POS orders or completed invoices!
              const isDirectPOSOrder = 
                payload.new.order_source === 'pos' || 
                payload.new.status === 'completed' || 
                Boolean(payload.new.cashier_id);
              const isCustomerAppPendingOrder = 
                !isDirectPOSOrder && 
                payload.new.status === 'pending' && 
                (payload.new.order_source === 'customer_app' || !payload.new.order_source);

              if (isCustomerAppPendingOrder && shouldAlertForBranch(payload.new?.branch_id)) {
                const num = payload.new.order_number || '';
                const name = payload.new.customer_name || 'عميل التطبيق';
                const price = payload.new.total_price || 0;
                const typeText = payload.new.order_type === 'dine_in' ? 'محلي' : payload.new.order_type === 'takeaway' ? 'سفري' : 'توصيل';
                const isPaid = payload.new.payment_status === 'paid' ? ' (مدفوع بالتطبيق 💳)' : '';
                triggerLiveAlert(`طلب تطبيق جديد #${num}`, `${name} (${price} ر.س)${isPaid} • ${typeText}`, 'order', payload.new.id, payload.new.branch_id);
              }
            } else if (payload.eventType === 'UPDATE') {
              setLiveOrders(prev => prev.map(o => (o.id === updated.id || o.order_number === updated.order_number) ? { ...o, ...updated } : o));
              if (updated.status !== 'pending') {
                stopAlertRinger();
                setIncomingAlert(prev => (prev?.orderId === updated.id || !prev?.orderId) ? null : prev);
              }
            } else if (payload.eventType === 'DELETE') {
              setLiveOrders(prev => prev.filter(o => o.id !== payload.old?.id));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'service_bookings',
          },
          (payload: any) => {
            const updated = payload.new;
            if (!updated) return;
            const bookingStoreId = String(updated.store_id || '').toLowerCase().trim();
            const currentUuid = String(validStoreUuid || '').toLowerCase().trim();
            const rawStoreId = String(store?.id || '').toLowerCase().trim();

            const isStoreMatch = Boolean(
              (currentUuid && bookingStoreId === currentUuid) ||
              (rawStoreId && bookingStoreId === rawStoreId)
            );
            const isExistingMatch = liveBookingsRef.current.some(b => b.id === updated.id || (b.booking_number && b.booking_number === updated.booking_number));

            if (!isStoreMatch && !isExistingMatch) return;

            if (payload.eventType === 'INSERT') {
              setLiveBookings(prev => [payload.new, ...prev.filter(b => b.id !== payload.new.id && b.booking_number !== payload.new.booking_number)]);
              // 🛡️ Alert ONLY for bookings from customer app, NEVER for cashier phone/walk-in or completed bookings
              const isCashierNotes = Boolean(
                (payload.new.customer_notes && (payload.new.customer_notes.includes('حجز هاتف للكاشير') || payload.new.customer_notes.includes('حجز هاتف'))) ||
                ((payload.new as any).notes && ((payload.new as any).notes.includes('حجز هاتف للكاشير') || (payload.new as any).notes.includes('حجز هاتف')))
              );
              const isDirectCashierBooking = 
                payload.new.status === 'completed' || 
                payload.new.status === 'cancelled' ||
                payload.new.status === 'confirmed' ||
                payload.new.booking_source === 'phone_call' ||
                payload.new.booking_source === 'walk_in' ||
                payload.new.booking_source === 'cashier' ||
                isCashierNotes;

              const isCustomerAppPendingBooking = 
                !isDirectCashierBooking && 
                payload.new.status === 'pending' && 
                (payload.new.booking_source === 'customer_app' || !payload.new.booking_source) &&
                !isCashierNotes;

              if (isCustomerAppPendingBooking && shouldAlertForBranch(payload.new?.branch_id)) {
                const num = payload.new.booking_number || '';
                const name = payload.new.customer_name || 'عميل التطبيق';
                const service = payload.new.service_name || 'خدمة';
                const date = payload.new.booking_date || '';
                triggerLiveAlert(`حجز موعد عبر التطبيق #${num}`, `${name} - ${service} (${date})`, 'booking', payload.new.id, payload.new.branch_id);
              }
            } else if (payload.eventType === 'UPDATE') {
              setLiveBookings(prev => prev.map(b => (b.id === updated.id || b.booking_number === updated.booking_number) ? { ...b, ...updated } : b));
              if (updated.status !== 'pending') {
                stopAlertRinger();
                setIncomingAlert(prev => (prev?.bookingId === updated.id || !prev?.bookingId) ? null : prev);
              }
            } else if (payload.eventType === 'DELETE') {
              setLiveBookings(prev => prev.filter(b => b.id !== payload.old?.id));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'customer_coupons',
            filter: `store_id=eq.${validStoreUuid}`,
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setStoreCoupons(prev => [payload.new, ...prev.filter(c => c.id !== payload.new.id)]);
            } else if (payload.eventType === 'UPDATE') {
              setStoreCoupons(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
            } else if (payload.eventType === 'DELETE') {
              setStoreCoupons(prev => prev.filter(c => c.id !== payload.old.id));
            }

            if (payload.eventType === 'INSERT' || (payload.new && (payload.new.status === 'USED' || payload.new.status === 'REDEEMED'))) {
              const phone = payload.new.customer_phone || '';
              const title = payload.new.privilege_title || 'مكافأة ولاء';
              triggerLiveAlert('عملية استبدال نقاط / كوبون 🎁', `تم حرق/صرف (${title}) للعميل ${phone}`, 'coupon');
            }
          }
        )
        .subscribe();
    });

    return () => {
      isCancelled = true;
      if (channel) {
        getSupabaseClient()?.removeChannel(channel);
      }
    };
  }, [store?.id]);

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      stopAlertRinger();
      setIncomingAlert(prev => prev?.orderId === orderId ? null : prev);
      setOrderActionError(null);
      const staffName = activeStaff?.name || authenticatedCashier?.name || 'الكاشير';
      const effectiveBranchId = activeBranchId || activeStaff?.branch_id || authenticatedCashier?.branch_id || null;
      const effectiveBranchName = activeBranchObj?.name || null;
      await LoyaltyService.updateOrderStatus(orderId, status, staffName, effectiveBranchId, effectiveBranchName);
      setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    } catch (e: any) {
      setOrderActionError(e.message || 'حدث خطأ أثناء تحديث الحالة.');
      console.error(e);
      LoyaltyService.getLiveStoreOrders(effectiveStoreId || store!.id).then(setLiveOrders);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: 'pending' | 'completed' | 'cancelled' | 'confirmed' | 'no_show') => {
    try {
      stopAlertRinger();
      setIncomingAlert(prev => prev?.bookingId === bookingId ? null : prev);
      setOrderActionError(null);
      const staffName = activeStaff?.name || authenticatedCashier?.name || 'الكاشير';
      const effectiveBranchId = activeBranchId || activeStaff?.branch_id || authenticatedCashier?.branch_id || null;
      const effectiveBranchName = activeBranchObj?.name || null;
      await LoyaltyService.updateServiceBookingStatus(bookingId, status, staffName, effectiveBranchId, effectiveBranchName);
      setLiveBookings(prev => prev.map(o => o.id === bookingId ? { ...o, status } : o));
    } catch (e: any) {
      setOrderActionError(e.message || 'حدث خطأ أثناء تحديث حالة الحجز.');
      console.error(e);
      LoyaltyService.getLiveStoreBookings(effectiveStoreId || store!.id).then(setLiveBookings);
    }
  };

  useEffect(() => {
    document.title = store?.name ? `${store.name} - الكاشير` : 'نظام الكاشير';
  }, [store?.name]);

  useEffect(() => {
    if (store?.id) {
      const session = LoyaltyService.getStaffSession(store.id, 'any', store.slug);
      setAuthenticatedCashier(session);
      setActiveStaff(session);
    }
  }, [store?.id, store?.slug]);

  useEffect(() => {
    if (!store?.id || !authenticatedCashier) return;
    loadStoreMetadata();

    LoyaltyService.checkAndUpdateStoreSubscription(store.id).then((sub) => {
      setSubscriptionInfo(sub);
    });

    const unsubscribe = LoyaltyEvents.listen((event) => {
      const isCurrentStore =
        !event.storeId ||
        event.storeId === store?.id ||
        (effectiveStoreId && event.storeId === effectiveStoreId) ||
        event.storeId === store?.slug;

      if (isCurrentStore) {
        // تحديثات مستهدفة دقيقة فقط حسب نوع الحدث، دون إعادة تحميل كامل البيانات التشغيلية
        if (event.type === 'ORDER_CREATED') {
          if (event.orderData) {
            const o = event.orderData;
            setLiveOrders((prev) => [
              o,
              ...prev.filter(
                (item) => item.id !== o.id && item.order_number !== o.order_number
              ),
            ]);
            // 🛡️ BRANCH ISOLATION: Alert ONLY if matches active cashier branch AND comes from customer app
            const isDirectPOSOrder = o.order_source === 'pos' || o.status === 'completed' || Boolean(o.cashier_id);
            const isCustomerAppPendingOrder = !isDirectPOSOrder && o.status === 'pending' && (o.order_source === 'customer_app' || !o.order_source);
            if (isCustomerAppPendingOrder && shouldAlertForBranch(o.branch_id)) {
              const num = o.order_number || '';
              const name = o.customer_name || 'عميل التطبيق';
              const price = o.total_price || 0;
              const typeText =
                o.order_type === 'dine_in'
                  ? 'محلي'
                  : o.order_type === 'takeaway'
                  ? 'سفري'
                  : 'توصيل';
              const isPaid = o.payment_status === 'paid' ? ' (مدفوع بالتطبيق 💳)' : '';
              triggerLiveAlert(
                `طلب تطبيق جديد #${num}`,
                `${name} (${price} ر.س)${isPaid} • ${typeText}`,
                'order',
                o.id,
                o.branch_id
              );
            }
          } else {
            if (effectiveStoreId || store?.id) {
              LoyaltyService.getLiveStoreOrders(effectiveStoreId || store.id)
                .then(setLiveOrders)
                .catch(() => {});
            }
          }
          return;
        }

        if (event.type === 'BOOKING_CREATED') {
          if (event.bookingData) {
            const b = event.bookingData;
            setLiveBookings((prev) => [
              b,
              ...prev.filter(
                (item) =>
                  item.id !== b.id && item.booking_number !== b.booking_number
              ),
            ]);
            // 🛡️ BRANCH ISOLATION: Alert ONLY if matches active cashier branch AND is from customer app
            const isCashierNotes = Boolean(
              (b.customer_notes && (b.customer_notes.includes('حجز هاتف للكاشير') || b.customer_notes.includes('حجز هاتف'))) ||
              ((b as any).notes && ((b as any).notes.includes('حجز هاتف للكاشير') || (b as any).notes.includes('حجز هاتف')))
            );
            const isDirectCashierBooking = 
              b.status === 'completed' || 
              b.status === 'cancelled' ||
              b.status === 'confirmed' ||
              b.booking_source === 'phone_call' ||
              b.booking_source === 'walk_in' ||
              b.booking_source === 'cashier' ||
              isCashierNotes;

            const isCustomerAppPendingBooking = 
              !isDirectCashierBooking && 
              b.status === 'pending' && 
              (b.booking_source === 'customer_app' || !b.booking_source) &&
              !isCashierNotes;

            if (isCustomerAppPendingBooking && shouldAlertForBranch(b.branch_id)) {
              const num = b.booking_number || '';
              const name = b.customer_name || 'عميل التطبيق';
              const service = b.service_name || 'خدمة';
              const date = b.booking_date || '';
              triggerLiveAlert(
                `حجز موعد عبر التطبيق #${num}`,
                `${name} - ${service} (${date})`,
                'booking',
                b.id,
                b.branch_id
              );
            }
          } else {
            if (effectiveStoreId || store?.id) {
              LoyaltyService.getLiveStoreBookings(effectiveStoreId || store.id)
                .then(setLiveBookings)
                .catch(() => {});
            }
          }
          return;
        }

        if (event.type === 'ORDER_STATUS_UPDATED' && event.orderData) {
          const updated = event.orderData;
          setLiveOrders((prev) =>
            prev.map((o) => (o.id === updated.id || o.order_number === updated.order_number ? { ...o, ...updated } : o))
          );
          if (updated.status !== 'pending') {
            stopAlertRinger();
            setIncomingAlert((prev) => (prev?.orderId === updated.id || !prev?.orderId) ? null : prev);
          }
          return;
        }

        if (event.type === 'BOOKING_STATUS_UPDATED' && event.bookingData) {
          const updated = event.bookingData;
          setLiveBookings((prev) =>
            prev.map((b) => (b.id === updated.id || b.booking_number === updated.booking_number ? { ...b, ...updated } : b))
          );
          if (updated.status !== 'pending') {
            stopAlertRinger();
            setIncomingAlert((prev) => (prev?.bookingId === updated.id || !prev?.bookingId) ? null : prev);
          }
          return;
        }

        if (event.type === 'TIERS_UPDATED') {
          LoyaltyService.getTiers(store.id).then(setTiers).catch(() => {});
          return;
        }

        if (event.type === 'PRIVILEGES_UPDATED') {
          LoyaltyService.getPrivileges(store.id).then(setPrivileges).catch(() => {});
          return;
        }

        if (event.type === 'BRANCHES_UPDATED') {
          LoyaltyService.getStoreBranches(store.id).then((brs) => {
            if (brs && Array.isArray(brs)) setStoreBranches(brs);
          }).catch(() => {});
          return;
        }

        if (event.type === 'STAFF_UPDATED') {
          LoyaltyService.getStoreStaff(store.id).then((staff) => {
            setStaffList(staff);
            const curAuth = authCashierRef.current;
            if (curAuth) {
              const freshAuth = staff.find(
                (s) =>
                  s.id === curAuth.id ||
                  normalizePhone(s.phone) === normalizePhone(curAuth.phone)
              );
              if (freshAuth) {
                setAuthenticatedCashier(freshAuth);
                setActiveStaff(freshAuth);
                LoyaltyService.saveStaffSession(store.id, freshAuth, store.slug);
              }
            }
          }).catch(() => {});
          return;
        }

        if (event.type === 'SUBSCRIPTION_UPDATED') {
          LoyaltyService.checkAndUpdateStoreSubscription(store.id).then(setSubscriptionInfo).catch(() => {});
          return;
        }

        if (event.type === 'STORE_UPDATED') {
          return;
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [store?.id, effectiveStoreId]);

  const loadStoreMetadata = async () => {
    if (!store?.id) return;
    try {
      const [t, p, staff, cpns, brs] = await Promise.all([
        LoyaltyService.getTiers(store.id),
        LoyaltyService.getPrivileges(store.id),
        LoyaltyService.getStoreStaff(store.id),
        LoyaltyService.getAllStoreCoupons(store.id),
        LoyaltyService.getStoreBranches(store.id),
      ]);
      setTiers(t);
      setPrivileges(p);
      setStaffList(staff);
      setStoreCoupons(cpns);
      if (brs && Array.isArray(brs)) {
        setStoreBranches(brs);
      }

      // Real-time synchronization of cashier / staff permissions and branch assignment
      if (authenticatedCashier) {
        const freshAuth = staff.find(
          (s) =>
            s.id === authenticatedCashier.id ||
            normalizePhone(s.phone) === normalizePhone(authenticatedCashier.phone)
        );
        if (freshAuth) {
          setAuthenticatedCashier(freshAuth);
          setActiveStaff(freshAuth);
          LoyaltyService.saveStaffSession(store.id, freshAuth, store.slug);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // فتح الماسح الذكي الموحد بالكاميرا
  const handleOpenSmartScanner = () => {
    setScannerAction('SMART');
    setSelectedReward(null);
    setErrorMessage(null);
    setSuccessResult(null);
    setIsScannerOpen(true);
  };

  // فتح ماسح حرق مكافأة محددة بالنقاط
  const handleOpenRewardScanner = (reward: { id?: string; title: string; cost: number }) => {
    setScannerAction('REDEEM');
    setSelectedReward(reward);
    setErrorMessage(null);
    setSuccessResult(null);
    setIsScannerOpen(true);
  };

  // معالجة الباركود المقروء من الكاميرا أو الإدخال اليدوي بنظام (Single Smart Scanner)
  const handleQRScanned = async (rawData: string, entryMethod: 'qr_scan' | 'manual' = 'qr_scan') => {
    const trimmed = (rawData || '').trim();
    if (!trimmed) return;

    // ⚡ Debounce / Duplicate Scan Suppression Gate (Section 15 & 51)
    // If exact same scan arrives within 1500ms, suppress duplicate server lookups
    const now = Date.now();
    if (
      lastScanRef.current &&
      lastScanRef.current.rawData === trimmed &&
      now - lastScanRef.current.timestamp < 1500
    ) {
      return;
    }
    lastScanRef.current = { rawData: trimmed, timestamp: now };

    setIsScannerOpen(false);
    setLoading(true);
    setErrorMessage(null);
    setSuccessResult(null);

    // إذا كان الكاشير قد اختار مكافأة محددة يدوياً لاستبدالها بالنقاط
    if (scannerAction === 'REDEEM' && selectedReward) {
      try {
        let phoneToBurn = rawData.trim();
        try {
          const parsed = JSON.parse(rawData);
          if (parsed.phone) phoneToBurn = parsed.phone;
        } catch {}

        const burnAmount = selectedReward.cost;
        const res = await LoyaltyService.processRedeem(
          store.id,
          phoneToBurn,
          burnAmount,
          selectedReward.title,
          undefined,
          activeStaff?.id,
          activeStaff?.name,
          entryMethod,
          activeBranchId || activeStaff?.branch_id || authenticatedCashier?.branch_id || null,
          activeBranchObj?.name || null
        );

        setCustomer(res.customer);
        setSuccessResult({
          message: `تم حرق ${burnAmount} نقطة واستلام (${selectedReward.title}) بنجاح!`,
          points: burnAmount,
          phone: phoneToBurn,
          tier: 'Member',
          balance: res.customer.wallet_balance,
          type: 'REDEEM',
        });

        playBeepSound('redeem');

        LoyaltyEvents.emit({
          type: 'REWARD_REDEEMED',
          storeId: store.id,
          phone: phoneToBurn,
          points: burnAmount,
          newBalance: res.customer.wallet_balance,
          newLifetimeXP: res.customer.lifetime_xp,
          rewardTitle: selectedReward.title,
        });

        setSelectedReward(null);
        setManualInput('');
      } catch (err: any) {
        setErrorMessage(err.message || 'فشلت عملية حرق النقاط للمكافأة');
        playBeepSound('error');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // ⚡ استدعاء المحرك الأمني الموحد (Guard Clauses + Single Query + Store Isolation)
      const scanResult = await LoyaltyService.smartScanProcess(
        store,
        rawData,
        activeStaff?.id,
        activeStaff?.name,
        entryMethod,
        activeBranchId || activeStaff?.branch_id || authenticatedCashier?.branch_id || null,
        activeBranchObj?.name || null
      );

      // 🛑 Early Exit في حال وجود أي خطأ أو عدم تطابق المتجر
      if (!scanResult.success) {
        playBeepSound('error');
        setErrorMessage(scanResult.error || 'فشلت قراءة الباركود أو الكوبون غير صالح');
        setLoading(false);
        return;
      }

      // 1️⃣ إذا كان كوبون تابع لهذا المتجر تم حرقه بنجاح
      if (scanResult.type === 'COUPON' && scanResult.coupon) {
        playBeepSound('redeem');

        setSuccessResult({
          message: scanResult.message || 'تم بنجاح حرق الكوبون وتسليم الطلب للعميل!',
          couponTitle: scanResult.coupon.privilege_title,
          couponCode: scanResult.coupon.coupon_code,
          phone: scanResult.coupon.customer_phone,
          type: 'COUPON',
        });

        // تحديث قائمة الكوبونات محلياً بدون إعادة جلب كل الكوبونات من قاعدة البيانات
        setStoreCoupons((prev) => {
          const updated = prev.map((c) =>
            c.id === scanResult.coupon!.id || c.coupon_code === scanResult.coupon!.coupon_code
              ? { ...c, status: 'REDEEMED' as const }
              : c
          );
          // إذا لم يكن موجوداً في القائمة المحلية، نضيفه في البداية
          const exists = updated.some((c) => c.id === scanResult.coupon!.id);
          return exists ? updated : [scanResult.coupon!, ...updated];
        });
        setManualInput('');
        setLoading(false);
        return;
      }


      // 2️⃣ إذا كان باركود عميل (PASS) تم التحقق من سلامته ومطابقته للمتجر
      if (scanResult.type === 'PASS' && scanResult.customerPhone) {
        playBeepSound('success');

        // إذا كان الكاشير في تبويب نقطة البيع (register) يتم ربط العميل فوراً بالسلة وتطبيق الخصومات
        if (activeTab === 'register') {
          try {
            const freshCust = await LoyaltyService.getCustomer(store.id, scanResult.customerPhone);
            if (freshCust) {
              setCustomer(freshCust);
            }
          } catch {}
          setSuccessResult({
            message: `تم ربط حساب العميل (${scanResult.customerName || scanResult.customerPhone}) بنقطة البيع بنجاح! 👑`,
            phone: scanResult.customerPhone,
            type: 'PURCHASE',
          });
          setLoading(false);
          return;
        }

        setPendingCustomerScan({
          phone: scanResult.customerPhone,
          name: scanResult.customerName,
          entryMethod,
        });
        setInvoiceAmount('');
        setIsAmountModalOpen(true);
        setLoading(false);
        return;
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'فشلت قراءة الباركود');
      playBeepSound('error');
      setLoading(false);
    }
  };

  // تأكيد مبلغ الفاتورة واحتساب وإيداع النقاط لمحفظة العميل
  const handleConfirmPurchaseAmount = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pendingCustomerScan) return;
    if (!invoiceAmount || Number(invoiceAmount) <= 0) {
      setErrorMessage('يرجى إدخال مبلغ فاتورة صحيح أكبر من صفر');
      return;
    }

    const amountNum = Number(invoiceAmount);
    const maxSafeThreshold = store.max_cashier_invoice_amount ?? 500;
    const effectiveStaff = activeStaff || authenticatedCashier;

    // 🛡️ فحص سقف الفواتير الكبيرة: إذا تجاوز السقف والكاشير ليس مديراً (admin) -> طلب موافقة المدير
    if (amountNum > maxSafeThreshold && effectiveStaff?.role === 'cashier') {
      setIsManagerApprovalModalOpen(true);
      setManagerPinInput('');
      setManagerPinError(null);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await LoyaltyService.processPurchase(
        store.id,
        pendingCustomerScan.phone,
        amountNum,
        pendingCustomerScan.entryMethod === 'manual'
          ? `إدخال يدوي بواسطة: ${effectiveStaff?.name || 'الكاشير'}`
          : `مسح باركود بواسطة: ${effectiveStaff?.name || 'الكاشير'}`,
        pendingCustomerScan.qrTokenObj,
        effectiveStaff?.id,
        effectiveStaff?.name,
        pendingCustomerScan.entryMethod,
        activeBranchId || effectiveStaff?.branch_id || authenticatedCashier?.branch_id || null,
        activeBranchObj?.name || null
      );

      setCustomer(res.customer);
      setIsAmountModalOpen(false);
      setPendingCustomerScan(null);
      setInvoiceAmount('');
      setManualInput('');

      let successMessage = `تم بنجاح إضافة ${res.pointsEarned} نقطة لرصيد العميل!`;
      if (res.customer.lifetime_xp === res.pointsEarned && pendingCustomerScan.entryMethod === 'manual') {
        successMessage = `✅ تم تسجيل عميل جديد برقم (${pendingCustomerScan.phone}) وإضافة ${res.pointsEarned} نقطة بنجاح! ذكّر العميل بالدخول للرابط لاحقاً لاستكمال بياناته.`;
      }

      setSuccessResult({
        message: successMessage,
        points: res.pointsEarned,
        phone: pendingCustomerScan.phone,
        tier: res.currentTier,
        balance: res.customer.wallet_balance,
        type: 'PURCHASE',
      });

      playBeepSound('success');

      LoyaltyEvents.emit({
        type: 'POINTS_ADDED',
        storeId: store.id,
        phone: pendingCustomerScan.phone,
        points: res.pointsEarned,
        newBalance: res.customer.wallet_balance,
        newLifetimeXP: res.customer.lifetime_xp,
        currentTier: res.currentTier,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'فشلت عملية إضافة النقاط');
      playBeepSound('error');
    } finally {
      setLoading(false);
    }
  };

  // 🛡️ معالجة واعتماد الفاتورة الكبيرة برمز مدير المتجر (Manager PIN Approval)
  const handleManagerApprovalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingCustomerScan || !invoiceAmount) return;

    const enteredPin = managerPinInput.trim();
    if (!enteredPin) {
      setManagerPinError('يرجى إدخال الرمز السري لمدير المتجر');
      return;
    }

    // التحقق من رمز مدير المتجر داخل السيرفر عبر verify_staff_pin (مع قفل بعد 5 محاولات خاطئة)
    setIsSubmittingApproval(true);
    setManagerPinError(null);
    const adminPhones = Array.from(
      new Set(
        [
          ...staffList.filter((s) => s.role === 'admin').map((s) => s.phone),
          (store as any).manager_contact,
        ].filter((p): p is string => !!p && !!String(p).trim())
      )
    );
    let isValidPin = false;
    let lockedMessage: string | null = null;
    for (const adminPhone of adminPhones) {
      const check = await LoyaltyService.verifyStaffPin(adminPhone, enteredPin, store.id, store.slug, 'admin');
      if (check.success) {
        isValidPin = true;
        break;
      }
      if (check.error === 'LOCKED') {
        lockedMessage = check.message || null;
        break;
      }
    }

    if (!isValidPin) {
      setIsSubmittingApproval(false);
      setManagerPinError(
        lockedMessage ||
          'الرمز السري لمدير المتجر غير صحيح. لا يمكن اعتماد هذه الفاتورة الكبيرة دون موافقة الإدارة.'
      );
      playBeepSound('error');
      return;
    }

    setManagerPinError(null);
    try {
      const amountNum = Number(invoiceAmount);
      const effectiveStaff = activeStaff || authenticatedCashier;
      const res = await LoyaltyService.processPurchase(
        store.id,
        pendingCustomerScan.phone,
        amountNum,
        `فاتورة كبيرة (${amountNum} ر.س) - موافقة واعتماد مدير المتجر (بواسطة: ${effectiveStaff?.name || 'الكاشير'})`,
        pendingCustomerScan.qrTokenObj,
        effectiveStaff?.id,
        effectiveStaff?.name,
        pendingCustomerScan.entryMethod,
        activeBranchId || effectiveStaff?.branch_id || authenticatedCashier?.branch_id || null,
        activeBranchObj?.name || null
      );

      setCustomer(res.customer);
      setIsManagerApprovalModalOpen(false);
      setIsAmountModalOpen(false);
      setPendingCustomerScan(null);
      setInvoiceAmount('');
      setManualInput('');
      setManagerPinInput('');

      setSuccessResult({
        message: `تم بنجاح اعتماد الفاتورة الكبيرة وإضافة ${res.pointsEarned} نقطة!`,
        points: res.pointsEarned,
        phone: pendingCustomerScan.phone,
        tier: res.currentTier,
        balance: res.customer.wallet_balance,
        type: 'PURCHASE',
      });

      playBeepSound('success');

      LoyaltyEvents.emit({
        type: 'POINTS_ADDED',
        storeId: store.id,
        phone: pendingCustomerScan.phone,
        points: res.pointsEarned,
        newBalance: res.customer.wallet_balance,
        newLifetimeXP: res.customer.lifetime_xp,
        currentTier: res.currentTier,
      });
    } catch (err: any) {
      setManagerPinError(err.message || 'فشلت عملية اعتماد الفاتورة');
      playBeepSound('error');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  // 🔑 معالجة تغيير الكاشير لرمزه السري الخاص من واجهة الكاشير
  const handleChangeCashierPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveStaff = activeStaff || authenticatedCashier;
    if (!effectiveStaff) return;

    setChangePinError(null);
    setChangePinSuccess(null);

    const currentPin = changePinCurrent.trim();
    const newPin = changePinNew.trim();
    const confirmPin = changePinConfirm.trim();

    if (!currentPin || !newPin || !confirmPin) {
      setChangePinError('يرجى ملء جميع الحقول');
      return;
    }

    if (!/^\d{4,6}$/.test(newPin)) {
      setChangePinError('يجب أن يتكون الرمز السري الجديد من 4 إلى 6 أرقام فقط');
      return;
    }

    if (newPin !== confirmPin) {
      setChangePinError('الرمز السري الجديد وتأكيده غير متطابقين');
      return;
    }

    setIsSavingCashierPin(true);
    try {
      // التحقق من الرمز الحالي داخل السيرفر (مع قفل بعد 5 محاولات خاطئة)
      const currentCheck = await LoyaltyService.verifyStaffPin(
        effectiveStaff.phone || '',
        currentPin,
        store.id,
        store.slug
      );
      if (!currentCheck.success) {
        setChangePinError(
          currentCheck.error === 'LOCKED'
            ? currentCheck.message || 'تم قفل الدخول مؤقتاً'
            : 'الرمز السري الحالي غير صحيح'
        );
        return;
      }

      const updateRes = await LoyaltyService.updateStaffPinSecure(effectiveStaff.id, currentPin, newPin);
      if (!updateRes.success) {
        setChangePinError(updateRes.message || 'فشل تحديث الرمز السري');
        return;
      }

      const updatedStaff = { ...effectiveStaff };
      delete (updatedStaff as any).pin_code;
      setAuthenticatedCashier(updatedStaff);
      setActiveStaff(updatedStaff);
      LoyaltyService.saveStaffSession(store.id, updatedStaff, store.slug);

      setStaffList(staffList.map((s) => (s.id === effectiveStaff.id ? { ...s, ...updatedStaff } : s)));

      setChangePinSuccess('تم بنجاح تغيير وحفظ رمزك السري الجديد! 🔒');
      setTimeout(() => {
        setIsChangePinModalOpen(false);
        setChangePinSuccess(null);
        setChangePinCurrent('');
        setChangePinNew('');
        setChangePinConfirm('');
      }, 1500);
    } catch (err: any) {
      setChangePinError(err.message || 'فشل تحديث الرمز السري');
    } finally {
      setIsSavingCashierPin(false);
    }
  };

  // معالجة الإدخال اليدوي الموحد (جوال العميل أو كود الكوبون)
  const handleUnifiedManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveStaff = activeStaff || authenticatedCashier;
    if (!effectiveStaff?.can_manual_input_phone) {
      setErrorMessage(
        `⚠️ حساب الموظف (${effectiveStaff?.name || 'الكاشير'}) مقيد بالمسح الإجباري فقط بالكاميرا لمنع التلاعب.`
      );
      return;
    }
    if (!manualInput.trim()) {
      setErrorMessage('يرجى إدخال رقم جوال العميل أو رمز الكوبون');
      return;
    }
    handleQRScanned(manualInput.trim(), 'manual');
  };

  const handleLogout = () => {
    LoyaltyService.clearStaffSession(store.id, 'cashier', store.slug);
    LoyaltyService.clearStaffSession(store.id, 'admin', store.slug);
    try {
      localStorage.removeItem('radar_unified_auth_user');
      localStorage.removeItem(`radar_stoken_${store.id}_cashier`);
      localStorage.removeItem(`radar_stoken_${store.id}_admin`);
      if (store.slug) {
        localStorage.removeItem(`radar_session_${store.slug}_cashier`);
        localStorage.removeItem(`radar_session_${store.slug}_admin`);
        localStorage.removeItem(`radar_pos_active_branch_${store.slug}`);
      }
      localStorage.removeItem(`radar_pos_active_branch_${store.id}`);
    } catch {}

    // 🛡️ Root-level Cashier State & Notification Purge
    clearAllInboxNotifications({ portal: 'cashier', storeId: store.id });
    setSelectedBranchId(null);
    setAuthenticatedCashier(null);
    setActiveStaff(null);
    setCustomer(null);
    setSuccessResult(null);
    setErrorMessage(null);
    setIncomingAlert(null);
    setPendingCustomerScan(null);
    setManualInput('');
    stopAlertRinger();
  };

  const handleRefreshSubscriptionCheck = async () => {
    setIsCheckingSubscription(true);
    setErrorMessage(null);
    try {
      const [freshSub] = await Promise.all([
        LoyaltyService.checkAndUpdateStoreSubscription(store.id),
        loadStoreMetadata(),
      ]);
      setSubscriptionInfo(freshSub);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCheckingSubscription(false);
    }
  };

  // Recent redeemed coupons for cashier shift reconciliation
  const redeemedCouponsList = storeCoupons
    .filter((c) => c.status === 'REDEEMED' || c.status === 'USED')
    .slice(0, 6);

  if (!authenticatedCashier) {
    return (
      <StaffLoginGate
        store={store}
        requiredRole="cashier"
        onAuthenticated={(staff) => {
          setAuthenticatedCashier(staff);
          setActiveStaff(staff);
          if (staff.branch_id) {
            setSelectedBranchId(staff.branch_id);
          }
          loadStoreMetadata();
          LoyaltyService.checkAndUpdateStoreSubscription(store.id).then(setSubscriptionInfo).catch(() => {});
        }}
      />
    );
  }

  // 🔒 إذا كان المتجر في حالة تعليق (Suspended) - تُعطل واجهة الكاشير بالكامل
  const isStoreSuspended =
    store.subscription_active === false ||
    store.subscription_status === 'suspended' ||
    store.status === 'suspended' ||
    subscriptionInfo?.isSuspended === true;

  if (isStoreSuspended) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 rounded-3xl bg-slate-900/90 border border-rose-500/30 text-center space-y-6 shadow-2xl relative overflow-hidden animate-fade-in backdrop-blur-md">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto shadow-inner">
          <Lock className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <span className="px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-wider">
            خدمة نقاط البيع معلقة مؤقتاً (Suspended)
          </span>
          <h2 className="text-2xl font-black text-white mt-2">
            تم إيقاف واجهة الكاشير لانتهاء اشتراك المتجر
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            انتهت فترة الاشتراك المخصصة لمتجر <strong className="text-white">({store.name})</strong>. تم إيقاف عمليات مسح الباركود وإضافة النقاط مؤقتاً.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-right space-y-3 text-xs text-slate-300">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>بيانات العملاء وأرصدة نقاطهم التراكمية محفوظة بأمان تام في قاعدة البيانات 🔒</span>
          </div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>يتم استئناف الخدمة فوراً بمجرد قيام إدارة المتجر بسداد رسوم التجديد (195 ر.س).</span>
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleRefreshSubscriptionCheck}
            disabled={isCheckingSubscription}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center space-x-2 rtl:space-x-reverse transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isCheckingSubscription ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isCheckingSubscription ? 'جاري التحقق من الاشتراك...' : 'إعادة التحقق من حالة الاشتراك 🔄'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-transparent hover:bg-rose-950/40 text-rose-400 font-bold text-xs border border-rose-500/30 transition"
          >
            تسجيل خروج الكاشير 🚪
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-32 px-2 sm:px-0">
      
      {/* 🧭 Top POS Status Bar & Active Staff Switcher */}
      <div
        className={`p-4 sm:p-5 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm border transition-colors duration-300 ${
          isDarkTheme
            ? 'bg-slate-900/90 border-slate-800 shadow-xl'
            : isWarmTheme
            ? 'bg-[#FCFAF6]/95 border-[#EFE6D8] shadow-sm'
            : 'bg-white/95 border-slate-200/90 shadow-sm'
        }`}
        style={{
          borderRightWidth: '4px',
          borderRightColor: brandColors.secondary,
        }}
      >
        {/* Right side: Store Logo + Name, with Cashier & Branch directly underneath */}
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name}
              className={`w-12 h-12 rounded-2xl object-cover border shrink-0 shadow-sm ${
                isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
              style={{ borderColor: `${brandColors.secondary}50` }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-2xl border flex items-center justify-center font-bold text-xl shrink-0 shadow-sm"
              style={{
                backgroundColor: brandColors.primary,
                borderColor: brandColors.secondary,
                color: brandColors.contrastOnPrimary,
              }}
            >
              ⚡
            </div>
          )}
          <div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <h3 className={`text-base sm:text-lg font-black tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {store.name}
              </h3>
              {(store.store_code || store.id) && (
                <span
                  title="كود المتجر التعريفي السريع"
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-extrabold tracking-wider ${
                    isDarkTheme
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {store.store_code || `RD-${store.id.replace(/-/g, '').substring(0, 4).toUpperCase()}`}
                </span>
              )}
            </div>
            
            {/* Cashier & Branch underneath store name */}
            <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs ${
                isDarkTheme
                  ? 'bg-slate-950/70 border-slate-800 text-slate-300'
                  : 'bg-slate-100/90 border-slate-200 text-slate-700'
              }`}>
                <User className={`w-3.5 h-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>الكاشير: <strong className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{activeStaff?.name || authenticatedCashier.name}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    setIsChangePinModalOpen(true);
                    setChangePinCurrent('');
                    setChangePinNew('');
                    setChangePinConfirm('');
                    setChangePinError(null);
                    setChangePinSuccess(null);
                  }}
                  className="text-slate-400 hover:text-amber-500 mr-1 transition"
                  title="تغيير رمزي السري"
                >
                  <KeyRound className="w-3 h-3" />
                </button>
              </div>

              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs ${
                isDarkTheme
                  ? 'bg-slate-950/70 border-slate-800 text-slate-300'
                  : 'bg-slate-100/90 border-slate-200 text-slate-700'
              }`}>
                <Building2 className={`w-3.5 h-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>الفرع: <strong className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{activeBranchObj ? activeBranchObj.name : isGeneralManager ? 'كافة الفروع' : 'الفرع الرئيسي'}</strong></span>
                <span className="text-[10px] text-slate-400" title="الفرع معتمد ومقفل لوردية الكاشير">🔒</span>
              </div>
            </div>
          </div>
        </div>

        {/* Left side: System Controls & Integrated Logout Button */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 text-xs">
          <NotificationBell
            portalName={`كاشير (${store.name})`}
            portalFilter="cashier"
            storeId={store.id}
            userId={activeStaff?.id || authenticatedCashier?.id}
          />

          {/* 🔔 Live Audio Alert Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse transition shadow-sm ${
              isSoundMuted
                ? isDarkTheme
                  ? 'bg-rose-950/30 text-rose-300 border-rose-800/40 hover:bg-rose-900/40'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                : isDarkTheme
                ? 'bg-emerald-950/30 text-emerald-300 border-emerald-800/40 hover:bg-emerald-900/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
            title={isSoundMuted ? 'تفعيل جرس التنبيه الصوتي' : 'كتم جرس التنبيه الصوتي'}
          >
            {isSoundMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-500" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            )}
            <span>{isSoundMuted ? 'صامت 🔕' : 'جرس التنبيه 🔔'}</span>
          </button>

          {/* 🌐 Network & Offline Sync Status Pill */}
          <button
            type="button"
            onClick={() => setIsOfflineModalOpen(true)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse transition shadow-sm ${
              !OfflineSyncEngine.isOnline() || OfflineSyncEngine.getQueuedOrders(store.id).length > 0
                ? isDarkTheme
                  ? 'bg-amber-950/30 text-amber-300 border-amber-800/50 hover:bg-amber-900/40'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                : isDarkTheme
                ? 'bg-emerald-950/20 text-emerald-300 border-emerald-800/40 hover:bg-emerald-900/30'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
            title="حالة الاتصال ومزامنة فواتير الأوفلاين"
          >
            {OfflineSyncEngine.isOnline() ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            )}
            <span>{OfflineSyncEngine.isOnline() ? 'أونلاين 🟢' : 'أوفلاين 🟡'}</span>
            {OfflineSyncEngine.getQueuedOrders(store.id).length > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-black font-black text-[10px] flex items-center justify-center animate-bounce">
                {OfflineSyncEngine.getQueuedOrders(store.id).length}
              </span>
            )}
          </button>

          {/* 📱 Screens Barcode Modal Button (for kitchen/salon tablets) */}
          {(activeModules.orders || activeModules.bookings) && (
            <button
              type="button"
              onClick={() => {
                setScreensModalBranchId(activeBranchId || 'ALL');
                setIsScreensModalOpen(true);
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse transition shadow-sm ${
                isDarkTheme
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="عرض باركود شاشات العرض للتابلت"
            >
              <QrCode className="w-3.5 h-3.5 text-slate-400" />
              <span>باركود الشاشات 📱</span>
            </button>
          )}

          {/* 🔒 Cashier Shift Close & Z-Report Button */}
          <button
            type="button"
            onClick={() => setIsShiftCloseModalOpen(true)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse transition shadow-sm ${
              isDarkTheme
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="تقفيل الصندوق وجرد الوردية (Z-Report)"
          >
            <Lock className="w-3.5 h-3.5 text-amber-500" />
            <span>تقفيل الصندوق (Z-Report) 🔒</span>
          </button>

          {/* Logout Button (Unified in line) */}
          <button
            type="button"
            onClick={handleLogout}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1 rtl:space-x-reverse transition shrink-0 ${
              isDarkTheme
                ? 'bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border-rose-800/40'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
            }`}
            title="تسجيل خروج الكاشير"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج 🚪</span>
          </button>
        </div>
      </div>

      {/* 🔔 Background Notification Permission Banner (For Mobile Background Alerts) */}
      {notificationPermission !== 'granted' && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg animate-fade-in">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
            <span className="text-amber-100 font-semibold">
              لتصلك أصوات ورنين الطلبات حتى لو كانت الشاشة مقفلة أو المتصفح في الخلفية:
            </span>
          </div>
          <button
            type="button"
            onClick={handleEnableNotifications}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs shadow transition active:scale-95 shrink-0"
          >
            تفعيل الرنين والإشعارات 🔔
          </button>
        </div>
      )}

      {/* 📱 iOS Add to Home Screen Guidance for 100% Locked Screen Notifications */}
      {isIos && !isStandalone && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500/20 via-blue-500/10 to-transparent border border-blue-500/30 flex items-center justify-between gap-3 text-xs shadow-lg animate-fade-in text-blue-100">
          <div className="flex items-center gap-2.5">
            <span className="text-base shrink-0">📱</span>
            <span>
              <strong>لمستخدمي الآيفون:</strong> لرنين جرس الطلبات حتى وشاشة الآيفون مقفلة، اضغط زر المشاركة <strong className="font-mono text-white">⎋</strong> أسفل متصفح Safari ثم اختر <strong>"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)</strong>.
            </span>
          </div>
        </div>
      )}

      {/* 🛎️ Real-Time Floating Incoming Alert Toast with Loop Ringer & Instant Actions */}
      {incomingAlert && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/25 via-slate-900 to-amber-500/15 border-2 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.35)] flex flex-wrap items-center justify-between gap-4 animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-amber-500 animate-pulse"></div>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-black flex items-center justify-center font-black text-xl shrink-0 animate-bounce shadow-lg">
              🔔
            </div>
            <div className="min-w-0">
              <div className="text-sm font-black text-amber-300 flex items-center gap-2">
                <span className="truncate">{incomingAlert.title}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-200 border border-amber-500/40 font-mono shrink-0 animate-pulse">
                  رنين مباشر 🔔
                </span>
              </div>
              <p className="text-xs text-white font-medium mt-0.5 truncate">{incomingAlert.detail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {incomingAlert.type === 'order' && incomingAlert.orderId && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const ord = liveOrders.find(o => o.id === incomingAlert.orderId);
                    if (ord) handleTransferOrderToPOS(ord);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs transition shrink-0 flex items-center gap-1"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>تحويل للسلة 🧾</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateOrderStatus(incomingAlert.orderId!, 'accepted')}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition shadow-lg shrink-0 flex items-center gap-1"
                >
                  <ChefHat className="w-3.5 h-3.5" />
                  <span>قبول وإرسال للمطبخ 👨‍🍳</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateOrderStatus(incomingAlert.orderId!, 'cancelled')}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-black text-xs transition shrink-0"
                >
                  <span>رفض ❌</span>
                </button>
              </>
            )}

            {incomingAlert.type === 'booking' && incomingAlert.bookingId && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const bk = liveBookings.find(b => b.id === incomingAlert.bookingId);
                    if (bk) handleTransferBookingToPOS(bk);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 font-black text-xs transition shadow-lg shrink-0 flex items-center gap-1"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>تحويل للسلة 🧾</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateBookingStatus(incomingAlert.bookingId!, 'confirmed')}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition shadow-lg shrink-0 flex items-center gap-1"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>تأكيد الموعد وإرساله للصالة ✅</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateBookingStatus(incomingAlert.bookingId!, 'cancelled')}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-black text-xs transition shrink-0"
                >
                  <span>إلغاء ❌</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => stopAlertRinger()}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs transition shrink-0"
              title="كتم صوت الجرس الحالي"
            >
              <span>إيقاف الرنين 🔕</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopAlertRinger();
                if (incomingAlert.type === 'booking') {
                  setActiveTab('bookings');
                } else {
                  setActiveTab('orders');
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-black text-xs transition shrink-0"
            >
              عرض التفاصيل 📋
            </button>
            <button
              type="button"
              onClick={() => {
                stopAlertRinger();
                setIncomingAlert(null);
              }}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title="إغلاق التنبيه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 🛒 TAB 1: Complete Cloud POS Register (نقطة البيع والسلة الذكية) */}
      {activeTab === 'register' && (
        <CashierRegisterTab
          store={store}
          activeStaff={(activeStaff || authenticatedCashier)!}
          activeBranch={activeBranchObj || null}
          customer={customer}
          tiers={tiers}
          setCustomer={setCustomer}
          onOpenCustomerScanner={handleOpenSmartScanner}
          onOpenShiftClose={() => setIsShiftCloseModalOpen(true)}
          onOpenRefund={() => setIsRefundModalOpen(true)}
          liveOrders={liveOrders}
          liveBookings={liveBookings}
          transferredOrder={transferredOrderToPOS}
          onClearTransferredOrder={() => setTransferredOrderToPOS(null)}
          onRefreshOrders={() => {
            if (effectiveStoreId || store?.id) {
              LoyaltyService.getLiveStoreOrders(effectiveStoreId || store.id).then(setLiveOrders).catch(() => {});
              LoyaltyService.getLiveStoreBookings(effectiveStoreId || store.id).then(setLiveBookings).catch(() => {});
            }
          }}
        />
      )}

      {activeTab === 'scanner' && (
        <div className="animate-fade-in pb-24">
          
        <div className="space-y-6 max-w-xl mx-auto">
          
          {/* 🌟 HERO CARD: Unified Smart Single QR Scanner */}
          <div className={`glass-card rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden shadow-xl border transition-colors duration-300 ${
            isDarkTheme
              ? 'bg-slate-900/90 border-slate-800'
              : isWarmTheme
              ? 'bg-[#FCFAF6]/95 border-[#EFE6D8]'
              : 'bg-white/95 border-slate-200/90'
          }`}>
            <div
              className="absolute top-0 left-0 w-48 h-48 rounded-full blur-3xl pointer-events-none -ml-16 -mt-16 opacity-30"
              style={{ backgroundColor: brandColors.secondary }}
            />
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 w-fit">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  ماسح ذكي موحد (Single QR Scanner) ⚡
                </span>
                <h2 className={`text-xl sm:text-2xl font-black pt-1 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  مسح الباركود الذكي الفوري
                </h2>
                <p className={`text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                  يميز النظام تلقائياً باركود العميل لإضافة النقاط، أو باركود الكوبون لحرقه فوراً دون أي لبس.
                </p>
              </div>
            </div>

            {/* 📸 Huge Prominent Single Scan Button */}
            <button
              type="button"
              disabled={loading}
              onClick={handleOpenSmartScanner}
              style={{
                background: brandColors.buttonGradient,
                color: brandColors.contrastOnSecondary,
                boxShadow: `0 10px 30px -5px ${brandColors.glow}`,
              }}
              className={`w-full py-5 sm:py-6 rounded-3xl font-black text-lg sm:text-xl flex items-center justify-center space-x-3 rtl:space-x-reverse transition-all duration-300 transform active:scale-98 group hover:brightness-110 shadow-2xl ${
                brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'
              }`}
            >
              <Camera className="w-7 h-7 sm:w-8 sm:h-8 group-hover:scale-110 transition duration-300" />
              <span>افتح الكاميرا وامسح الباركود 📸</span>
            </button>

            {/* Features summary under scanner button */}
            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div className={`p-3 rounded-2xl border flex items-center space-x-2 rtl:space-x-reverse ${
                isDarkTheme ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${brandColors.secondary}15`, color: isDarkTheme ? brandColors.secondary : brandColors.textOnLightHex }}
                >
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <strong className={`block text-[11px] truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>باركود العميل</strong>
                  <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>طلب الفاتورة وإضافة النقاط</span>
                </div>
              </div>

              <div className={`p-3 rounded-2xl border flex items-center space-x-2 rtl:space-x-reverse ${
                isDarkTheme ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="w-7 h-7 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500 shrink-0">
                  <Flame className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <strong className={`block text-[11px] truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>كوبون / هدية ترحيبية</strong>
                  <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>حرق فوري وتسليم الطلب</span>
                </div>
              </div>
            </div>

            {/* ✏️ Manual Input Fallback Bar */}
            <div className={`pt-3 border-t ${isDarkTheme ? 'border-slate-800/80' : 'border-slate-200'}`}>
              {activeStaff?.can_manual_input_phone ? (
                <form onSubmit={handleUnifiedManualSubmit} className="space-y-2">
                  <label className={`text-xs font-bold block flex items-center justify-between ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span>✏️ خيار الإدخال اليدوي البديل (رقم الجوال أو رمز الكوبون):</span>
                    <span className="text-[10px] font-mono opacity-70">Manual Fallback</span>
                  </label>
                  <div className="flex space-x-2 rtl:space-x-reverse">
                    <input
                      type="text"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder="050XXXXXXX أو CPN-... أو WELCOME-..."
                      className={`flex-1 rounded-2xl px-4 py-3 text-xs sm:text-sm font-mono outline-none uppercase transition border ${
                        isDarkTheme
                          ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-600 focus:border-slate-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-slate-400'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={loading || !manualInput.trim()}
                      style={{
                        backgroundColor: brandColors.secondary,
                        color: brandColors.contrastOnSecondary,
                      }}
                      className={`px-5 py-3 rounded-2xl font-black text-xs transition disabled:opacity-40 flex items-center space-x-1 rtl:space-x-reverse shrink-0 ${
                        brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                      }`}
                    >
                      <Zap className="w-4 h-4" />
                      <span>تنفيذ ذكي</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className={`flex items-center space-x-2 rtl:space-x-reverse text-[11px] p-3 rounded-2xl border ${
                  isDarkTheme ? 'text-slate-400 bg-slate-950/60 border-slate-800' : 'text-slate-600 bg-slate-50 border-slate-200'
                }`}>
                  <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>
                    الإدخال اليدوي <strong>مقفل لهذا الكاشير ({activeStaff?.name})</strong>. يتم قبول العمليات عبر المسح بالكاميرا فقط لمنع التلاعب 🛡️.
                  </span>
                </div>
              )}
            </div>

            {/* Success Notification Alert */}
            {successResult && (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/90 to-slate-900 border-2 border-emerald-500/60 text-emerald-300 space-y-2 shadow-2xl animate-fade-in relative">
                <button
                  onClick={() => setSuccessResult(null)}
                  className="absolute top-3 left-3 text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-2xl shrink-0">
                    🎉
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-black text-white">{successResult.message}</h4>
                    {successResult.type === 'COUPON' ? (
                      <p className="text-xs text-emerald-400 font-mono mt-0.5">
                        الكوبون: <strong className="text-white">{successResult.couponTitle}</strong> ({successResult.couponCode}) | العميل: {successResult.phone}
                      </p>
                    ) : successResult.type === 'PURCHASE' ? (
                      <p className="text-xs text-emerald-400 font-mono mt-0.5">
                        العميل: <strong className="text-white">{successResult.phone}</strong> | النقاط المكتسبة: +{successResult.points} | الرصيد الجديد: {successResult.balance} نقطة ({successResult.tier})
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-400 font-mono mt-0.5">
                        العميل: <strong className="text-white">{successResult.phone}</strong> | الرصيد المتبقي: {successResult.balance} نقطة
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error Message Alert */}
            {errorMessage && (
              <div className="p-4 rounded-2xl bg-red-950/80 border-2 border-red-500/60 text-red-200 text-xs flex items-center justify-between space-x-2.5 rtl:space-x-reverse animate-shake">
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <span className="font-bold leading-relaxed">{errorMessage}</span>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="text-red-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

        </div>

        
        </div>
      )}

      {activeTab === 'orders' && (() => {
        // Scope orders strictly to active branch (or all if general manager)
        const branchScopedOrders = isGeneralManager
          ? liveOrders
          : liveOrders.filter(o => {
              if (o.branch_id) return o.branch_id === activeBranchId;
              return Boolean(activeBranchObj?.is_main);
            });

        const newOrders = branchScopedOrders.filter(o => o.status === 'pending');
        const prepOrders = branchScopedOrders.filter(o => o.status === 'accepted' || o.status === 'preparing');
        const readyOrders = branchScopedOrders.filter(o => o.status === 'ready');
        const completedOrders = branchScopedOrders.filter(o => o.status === 'completed' || o.status === 'cancelled');

        const displayedOrders = branchScopedOrders.filter(order => {
          if (orderStatusFilter === 'new' && order.status !== 'pending') return false;
          if (orderStatusFilter === 'preparing' && !(order.status === 'accepted' || order.status === 'preparing')) return false;
          if (orderStatusFilter === 'completed' && !(order.status === 'ready' || order.status === 'completed' || order.status === 'cancelled')) return false;
          
          if (orderSearchQuery.trim()) {
            const q = orderSearchQuery.toLowerCase().trim();
            const matchNum = String(order.order_number || '').toLowerCase().includes(q);
            const matchName = String(order.customer_name || '').toLowerCase().includes(q);
            const matchPhone = String(order.customer_phone || '').includes(q);
            if (!matchNum && !matchName && !matchPhone) return false;
          }
          return true;
        });

        return (
          <div className="animate-fade-in max-w-4xl mx-auto space-y-5 pb-28">

            {/* 📍 Active Branch Context Indicator Banner */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-950/90 border border-slate-800 text-xs shadow-sm">
              <div className="flex items-center gap-2">
                <Utensils className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-400 font-bold">عرض طلبات المنيو:</span>
                <span className="font-extrabold text-amber-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  {activeBranchObj ? activeBranchObj.name : 'كافة الفروع (المدير العام)'}
                </span>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <span>عزل آمن للفرع 🔒</span>
              </span>
            </div>
            
            {/* 🔘 Header & Live Sync Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/90 p-3 sm:p-4 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-2xl border border-amber-500/30 px-4 py-2.5">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <span className="font-black text-xs sm:text-sm text-amber-200">سجل طلبات المتجر والمنيو</span>
                {newOrders.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center animate-pulse">
                    {newOrders.length}
                  </span>
                )}
              </div>

              {/* Quick Search & Manual Refresh */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="بحث برقم الطلب، اسم، جوال..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-8 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  {orderSearchQuery && (
                    <button
                      onClick={() => setOrderSearchQuery('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    LoyaltyService.getLiveStoreOrders(store.id).then(setLiveOrders);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
                  title="تحديث فوري"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Error notice if action failed */}
            {orderActionError && (
              <div className="p-3 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-rose-300 text-xs flex items-center justify-between">
                <span>{orderActionError}</span>
                <button onClick={() => setOrderActionError(null)} className="p-1 text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ══════════════════════════════════════════════ */}
            {/* MENU ORDERS LIST (طلبات المنيو) */}
            {/* ══════════════════════════════════════════════ */}
            <div className="space-y-4">
                {/* Status Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('all')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition shrink-0 ${
                      orderStatusFilter === 'all'
                        ? 'bg-slate-200 text-black border-white'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    الكل ({branchScopedOrders.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('new')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shrink-0 ${
                      orderStatusFilter === 'new'
                        ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/30'
                        : 'bg-slate-900 text-rose-400 border-slate-800 hover:border-rose-500/40'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${newOrders.length > 0 ? 'bg-rose-400 animate-ping' : 'bg-slate-600'}`}></span>
                    <span>الطلبات الجديدة ({newOrders.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('preparing')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shrink-0 ${
                      orderStatusFilter === 'preparing'
                        ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/30'
                        : 'bg-slate-900 text-amber-400 border-slate-800 hover:border-amber-500/40'
                    }`}
                  >
                    <ChefHat className="w-3.5 h-3.5" />
                    <span>قيد التحضير ({prepOrders.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('completed')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shrink-0 ${
                      orderStatusFilter === 'completed'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                        : 'bg-slate-900 text-emerald-400 border-slate-800 hover:border-emerald-500/40'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>جاهزة ومكتملة ({readyOrders.length + completedOrders.length})</span>
                  </button>
                </div>

                {/* Orders Grid */}
                {displayedOrders.length === 0 ? (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 space-y-2">
                    <ShoppingBag className="w-12 h-12 text-slate-700 mx-auto" />
                    <p className="font-bold text-sm text-slate-300">لا توجد طلبات مطابقة في هذا القسم</p>
                    <p className="text-xs text-slate-500">الطلبات الجديدة القادمة من المنيو ستظهر هنا فورياً مع جرس تنبيه صوتي</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayedOrders.map((order) => {
                      const isPending = order.status === 'pending';
                      const isAccepted = order.status === 'accepted';
                      const isNew = isPending || isAccepted;
                      const isPrep = order.status === 'preparing';
                      const isReady = order.status === 'ready';
                      const isDone = order.status === 'completed';
                      const isCancelled = order.status === 'cancelled';

                      return (
                        <div
                          key={order.id}
                          className={`bg-slate-900 rounded-3xl p-5 border flex flex-col justify-between shadow-xl transition duration-200 relative overflow-hidden ${
                            isPending
                              ? 'border-rose-500/60 shadow-rose-950/30 ring-1 ring-rose-500/30'
                              : isAccepted
                              ? 'border-blue-500/60 shadow-blue-950/30 ring-1 ring-blue-500/30'
                              : isPrep
                              ? 'border-amber-500/50 shadow-amber-950/20'
                              : isReady
                              ? 'border-emerald-500/50 shadow-emerald-950/20'
                              : 'border-slate-800 opacity-80'
                          }`}
                        >
                          {/* Top Order Card Header */}
                          <div>
                            <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-3 mb-3">
                              <div className="space-y-1.5 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-black font-mono text-amber-500 dark:text-amber-400">
                                    #{order.order_number || String(order.id).slice(0, 6)}
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                                    {order.order_type === 'dine_in'
                                      ? `🍽️ محلي ${order.table_number ? `(${order.table_number})` : ''}`
                                      : order.order_type === 'takeaway'
                                      ? '🥡 سفري'
                                      : '🛵 توصيل'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {order.order_source === 'customer_app' && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                                      📱 تطبيق
                                    </span>
                                  )}
                                  {order.payment_status === 'paid' ? (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                                      مدفوع بالتطبيق ✅
                                    </span>
                                  ) : (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                                      الدفع بالفرع ⏳
                                    </span>
                                  )}
                                </div>
                              </div>

                              <span
                                className={`text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 shadow-2xs ${
                                  isPending
                                    ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 animate-pulse'
                                    : isAccepted
                                    ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/40'
                                    : isPrep
                                    ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40'
                                    : isReady
                                    ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40'
                                    : isCancelled
                                    ? 'bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {isPending ? '🔴 بانتظار الموافقة' : isAccepted ? '👨‍🍳 بالمطبخ' : isPrep ? '🟡 قيد التحضير' : isReady ? '🟢 جاهز للتسليم' : isCancelled ? '❌ ملغي' : '🏁 مكتمل'}
                              </span>
                            </div>

                            {/* Customer & Time Info */}
                            <div className="flex items-start justify-between mb-3 text-xs">
                              <div>
                                <div className="font-bold text-slate-900 dark:text-white text-sm">
                                  {order.customer_name || 'عميل المتجر'}
                                </div>
                                {order.customer_phone && (
                                  <a
                                    href={`tel:${order.customer_phone}`}
                                    className="text-slate-500 dark:text-slate-400 hover:text-amber-500 font-mono text-[11px] flex items-center gap-1 mt-0.5"
                                    dir="ltr"
                                  >
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    {order.customer_phone}
                                  </a>
                                )}
                              </div>
                              <div className="text-left rtl:text-right">
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  {order.created_at
                                    ? new Date(order.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                                    : ''}
                                </span>
                                <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 block mt-0.5">
                                  {Number(order.total_price || 0).toFixed(2)} ر.س
                                </span>
                              </div>
                            </div>

                            {/* Items Breakdown */}
                            <div className="space-y-1.5 mb-4 bg-slate-50 dark:bg-slate-950/90 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/80">
                              {Array.isArray(order.items) && order.items.length > 0 ? (
                                order.items.map((it: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center text-xs">
                                    <div className="text-slate-800 dark:text-slate-300 min-w-0 pr-1">
                                      <strong className="text-amber-600 dark:text-amber-400 font-mono ml-1">{it.quantity || 1}x</strong>
                                      <span>{it.catalog_item?.name || it.name || 'صنف'}</span>
                                    </div>
                                    <span className="text-slate-500 font-mono text-[11px] shrink-0">
                                      {(Number(it.item_total_price || (it.price * (it.quantity || 1)) || 0)).toFixed(2)}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[11px] text-slate-400">تفاصيل الطلب غير متوفرة</div>
                              )}

                              {order.notes && (
                                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/80 text-[11px] text-amber-800 dark:text-amber-300/90 bg-amber-50 dark:bg-amber-500/10 p-2 rounded-xl border border-amber-200 dark:border-amber-500/20 leading-relaxed">
                                  <strong>ملاحظات:</strong> {order.notes}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 🛵 Delivery Driver Dispatch Section (Only for Accepted/Preparing/Ready delivery orders) */}
                          {(order.order_type === 'delivery' || order.fulfillment_type === 'delivery') && !isPending && (
                            <div className="mb-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-amber-500/30 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                  <span>🛵</span>
                                  <span>كابتن التوصيل:</span>
                                </span>
                                {order.driver_name ? (
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                                    {order.delivery_status === 'picked_up' ? 'في الطريق 🛵' : order.delivery_status === 'delivered' ? 'تم التسليم ✅' : 'تم الإسناد ⏳'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 animate-pulse">
                                    بانتظار إسناد سائق ⏳
                                  </span>
                                )}
                              </div>

                              {/* Customer Address & GPS */}
                              {(order.delivery_address || order.fulfillment_details?.delivery_address) && (
                                <div className="text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-1">
                                  <span className="text-slate-400 shrink-0">📍</span>
                                  <span className="truncate">{order.delivery_address || order.fulfillment_details?.delivery_address}</span>
                                </div>
                              )}

                              {/* Driver Select Dropdown & WhatsApp Dispatch */}
                              {!isDone && !isCancelled && (
                                <div className="flex items-center gap-1.5 pt-1">
                                  <select
                                    value={order.driver_id || ''}
                                    onChange={(e) => handleAssignDriver(order, e.target.value)}
                                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                                  >
                                    <option value="">-- اختر سائق من الفرع --</option>
                                    {branchDrivers.map((d) => (
                                      <option key={d.id} value={d.id}>
                                        {d.name} ({DriverService.getVehicleLabel(d.vehicle_type)}) {d.status === 'available' ? '🟢' : '🟡'}
                                      </option>
                                    ))}
                                  </select>

                                  {order.driver_phone && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleNotifyDriverWhatsApp(order)}
                                        className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-bold text-xs transition flex items-center gap-1 shadow"
                                        title="إشعار السائق بتفاصيل الطلب عبر واتساب"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">إشعار واتساب</span>
                                      </button>
                                      <a
                                        href={`tel:${order.driver_phone}`}
                                        className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition"
                                        title="اتصال بالسائق"
                                      >
                                        <Phone className="w-3.5 h-3.5" />
                                      </a>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Transfer to POS Cart & Invoice */}
                          {!isDone && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleTransferOrderToPOS(order)}
                              className={`w-full mb-2 py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 border ${
                                isDarkTheme
                                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/35'
                                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                              }`}
                            >
                              <Receipt className="w-3.5 h-3.5 text-amber-500" />
                              <span>🧾 تحويل للسلة والمحاسبة (POS)</span>
                            </button>
                          )}

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/80 mt-auto">
                            {isPending && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => updateOrderStatus(order.id, 'accepted')}
                                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-black text-xs transition shadow-md shadow-emerald-900/20 flex items-center justify-center gap-1.5 active:scale-95"
                                >
                                  <ChefHat className="w-3.5 h-3.5" />
                                  <span>قبول وإرسال للمطبخ 👨‍🍳</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                  className="px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 font-bold text-xs transition"
                                  title="إلغاء الطلب"
                                >
                                  إلغاء ❌
                                </button>
                              </>
                            )}

                            {isAccepted && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => updateOrderStatus(order.id, 'preparing')}
                                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white keep-white font-black text-xs transition shadow-md shadow-blue-900/20 flex items-center justify-center gap-1.5 active:scale-95"
                                >
                                  <ChefHat className="w-3.5 h-3.5" />
                                  <span>بدء التحضير 🍳</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                  className="px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 font-bold text-xs transition"
                                  title="إلغاء الطلب"
                                >
                                  إلغاء ❌
                                </button>
                              </>
                            )}

                            {isPrep && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(order.id, 'ready')}
                                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-black text-xs transition shadow-md shadow-emerald-900/20 flex items-center justify-center gap-1.5 active:scale-95"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>الطلب جاهز للاستلام 📦</span>
                              </button>
                            )}

                            {isReady && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(order.id, 'completed')}
                                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-black text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/20 active:scale-95"
                              >
                                <Check className="w-4 h-4 text-white" />
                                <span>تسليم وإنهاء الطلب ✅</span>
                              </button>
                            )}

                            {(isDone || isCancelled) && (
                              <div className="w-full text-center py-1.5 text-[11px] font-bold text-slate-500">
                                {isDone ? 'تم إنهاء وتسليم الطلب ✅' : 'تم إلغاء هذا الطلب ❌'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
          </div>
        );
      })()}

      {/* 📅 TAB: SERVICE BOOKINGS (حجوزات ومواعيد الخدمات) */}
      {activeTab === 'bookings' && (() => {
        const branchScopedBookings = isGeneralManager
          ? liveBookings
          : liveBookings.filter(b => {
              if (b.branch_id) return b.branch_id === activeBranchId;
              return Boolean(activeBranchObj?.is_main);
            });

        const pendingBookings = branchScopedBookings.filter(b => b.status === 'pending');
        const confirmedBookings = branchScopedBookings.filter(b => b.status === 'confirmed' || b.status === 'in_progress');
        const pastBookings = branchScopedBookings.filter(b => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show');

        const displayedBookings = branchScopedBookings.filter(bk => {
          if (bookingStatusFilter === 'pending' && bk.status !== 'pending') return false;
          if (bookingStatusFilter === 'confirmed' && !(bk.status === 'confirmed' || bk.status === 'in_progress')) return false;
          if (bookingStatusFilter === 'past' && !(bk.status === 'completed' || bk.status === 'cancelled' || bk.status === 'no_show')) return false;

          if (bookingSearchQuery.trim()) {
            const q = bookingSearchQuery.toLowerCase().trim();
            const matchNum = String(bk.booking_number || '').toLowerCase().includes(q);
            const matchName = String(bk.customer_name || '').toLowerCase().includes(q);
            const matchPhone = String(bk.customer_phone || '').includes(q);
            const matchService = String(bk.service_name || '').toLowerCase().includes(q);
            if (!matchNum && !matchName && !matchPhone && !matchService) return false;
          }
          return true;
        });

        return (
          <div className="animate-fade-in max-w-4xl mx-auto space-y-5 pb-28">

            {/* 📍 Active Branch Context Indicator Banner */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-950/90 border border-slate-800 text-xs shadow-sm">
              <div className="flex items-center gap-2">
                <Scissors className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-slate-400 font-bold">عرض حجوزات ومواعيد الخدمات:</span>
                <span className="font-extrabold text-purple-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-purple-400" />
                  {activeBranchObj ? activeBranchObj.name : 'كافة الفروع (المدير العام)'}
                </span>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <span>عزل آمن للفرع 🔒</span>
              </span>
            </div>
            
            {/* 🔘 Header & Live Sync Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/90 p-3 sm:p-4 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-2xl border border-purple-500/30 px-4 py-2.5">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span className="font-black text-xs sm:text-sm text-purple-200">سجل حجوزات ومواعيد الخدمات</span>
                {pendingBookings.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center animate-pulse">
                    {pendingBookings.length}
                  </span>
                )}
              </div>

              {/* Quick Search & Manual Refresh */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={bookingSearchQuery}
                    onChange={(e) => setBookingSearchQuery(e.target.value)}
                    placeholder="بحث برقم الحجز، اسم، جوال، خدمة..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-8 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                  {bookingSearchQuery && (
                    <button
                      onClick={() => setBookingSearchQuery('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    LoyaltyService.getLiveStoreBookings(store.id).then(setLiveBookings);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
                  title="تحديث فوري"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Error notice if action failed */}
            {orderActionError && (
              <div className="p-3 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-rose-300 text-xs flex items-center justify-between">
                <span>{orderActionError}</span>
                <button onClick={() => setOrderActionError(null)} className="p-1 text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ══════════════════════════════════════════════ */}
            {/* SERVICE BOOKINGS LIST (حجوزات الخدمات) */}
            {/* ══════════════════════════════════════════════ */}
            <div className="space-y-4">
                {/* Status Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setBookingStatusFilter('all')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition shrink-0 ${
                      bookingStatusFilter === 'all'
                        ? 'bg-slate-200 text-black border-white'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    الكل ({branchScopedBookings.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setBookingStatusFilter('pending')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shrink-0 ${
                      bookingStatusFilter === 'pending'
                        ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/30'
                        : 'bg-slate-900 text-rose-400 border-slate-800 hover:border-rose-500/40'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${pendingBookings.length > 0 ? 'bg-rose-400 animate-ping' : 'bg-slate-600'}`}></span>
                    <span>بانتظار التأكيد ({pendingBookings.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBookingStatusFilter('confirmed')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shrink-0 ${
                      bookingStatusFilter === 'confirmed'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                        : 'bg-slate-900 text-blue-400 border-slate-800 hover:border-blue-500/40'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>مؤكدة ومجدولة ({confirmedBookings.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBookingStatusFilter('past')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shrink-0 ${
                      bookingStatusFilter === 'past'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>السجل والمكتملة ({pastBookings.length})</span>
                  </button>
                </div>

                {/* Bookings Grid */}
                {displayedBookings.length === 0 ? (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 space-y-2">
                    <Calendar className="w-12 h-12 text-slate-700 mx-auto" />
                    <p className="font-bold text-sm text-slate-300">لا توجد حجوزات في هذا التصنيف</p>
                    <p className="text-xs text-slate-500">حجوزات الخدمات والمواعيد الجديدة ستظهر هنا فور تسجيلها</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayedBookings.map((bk) => {
                      const isPending = bk.status === 'pending';
                      const isConfirmed = bk.status === 'confirmed';
                      const isCompleted = bk.status === 'completed';
                      const isCancelled = bk.status === 'cancelled';
                      const isNoShow = bk.status === 'no_show';

                      return (
                        <div
                          key={bk.id}
                          className={`bg-slate-900 rounded-3xl p-5 border flex flex-col justify-between shadow-xl transition duration-200 relative overflow-hidden ${
                            isPending
                              ? 'border-rose-500/60 shadow-rose-950/30 ring-1 ring-rose-500/30'
                              : isConfirmed
                              ? 'border-blue-500/50 shadow-blue-950/20'
                              : isCompleted
                              ? 'border-emerald-500/40'
                              : 'border-slate-800 opacity-75'
                          }`}
                        >
                          {(() => {
                            const rawId = String(bk.booking_number || bk.id || '').trim();
                            const digitsOnly = rawId.replace(/^BKG-?/i, '');
                            const displayCode = digitsOnly.length > 5 ? digitsOnly.slice(-5).toUpperCase() : digitsOnly.toUpperCase();
                            const cleanBookingNumber = `#BKG-${displayCode}`;

                            return (
                              <>
                                <div>
                                  {/* Booking Card Header */}
                                  <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-3 mb-3">
                                    <div className="space-y-1.5 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-black font-mono text-purple-600 dark:text-purple-400">
                                          {cleanBookingNumber}
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                                          📅 حجز تطبيق
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        {bk.payment_status === 'paid' ? (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                                            مدفوع بالتطبيق ✅
                                          </span>
                                        ) : (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                                            الدفع بالمركز ⏳
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <span
                                      className={`text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 shadow-2xs ${
                                        isPending
                                          ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 animate-pulse'
                                          : isConfirmed
                                          ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/40'
                                          : isCompleted
                                          ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                                          : isNoShow
                                          ? 'bg-slate-100 dark:bg-slate-800 text-amber-800 dark:text-amber-400 border border-slate-200 dark:border-slate-700'
                                          : 'bg-slate-100 dark:bg-slate-800 text-rose-700 dark:text-rose-400 border border-slate-200 dark:border-slate-700'
                                      }`}
                                    >
                                      {isPending
                                        ? '🔴 في الانتظار'
                                        : isConfirmed
                                        ? '🔵 مؤكد'
                                        : isCompleted
                                        ? '🏁 اكتمل الحضور'
                                        : isNoShow
                                        ? '🏖️ لم يحضر'
                                        : '❌ ملغي'}
                                    </span>
                                  </div>

                                  {/* Customer & Price */}
                                  <div className="flex items-start justify-between mb-3 text-xs">
                                    <div>
                                      <div className="font-bold text-slate-900 dark:text-white text-sm">{bk.customer_name || 'العميل'}</div>
                                      {bk.customer_phone && (
                                        <a
                                          href={`tel:${bk.customer_phone}`}
                                          className="text-slate-500 dark:text-slate-400 hover:text-amber-500 font-mono text-[11px] flex items-center gap-1 mt-0.5"
                                          dir="ltr"
                                        >
                                          <Phone className="w-3 h-3 text-slate-400" />
                                          {bk.customer_phone}
                                        </a>
                                      )}
                                    </div>
                                    <div className="text-left">
                                      <div className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                                        {Number(bk.service_price ?? bk.total_price ?? 0).toFixed(2)} ر.س
                                      </div>
                                      {Number(bk.loyalty_points_earned ?? bk.points_to_earn ?? 0) > 0 && (
                                        <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 justify-end mt-0.5 font-mono">
                                          <span>+{Number(bk.loyalty_points_earned ?? bk.points_to_earn ?? 0)} نقطة ولاء 👑</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Service Details Card */}
                                  <div className="bg-slate-50 dark:bg-slate-950/90 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-1.5 mb-4">
                                    <div className="text-xs text-slate-900 dark:text-white font-bold">{bk.service_name || 'خدمة'}</div>
                                    <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                                      <span>مع: {bk.specialist_name || 'أي مختص متاح'}</span>
                                      <span className="font-mono text-slate-700 dark:text-slate-300" dir="ltr">
                                        {bk.booking_date} • {bk.booking_time}
                                      </span>
                                    </div>

                                    {bk.notes && (
                                      <div className="text-[11px] text-amber-800 dark:text-amber-300/90 bg-amber-50 dark:bg-amber-500/10 p-2 rounded-xl mt-2 border border-amber-200 dark:border-amber-500/20 leading-relaxed">
                                        <strong>ملاحظة العميل:</strong> {bk.notes}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Transfer Booking to POS Cart & Invoice */}
                                {!isCompleted && !isCancelled && !isNoShow && (
                                  <button
                                    type="button"
                                    onClick={() => handleTransferBookingToPOS(bk)}
                                    className="w-full mb-2 py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/15 dark:hover:bg-purple-500/25 text-purple-900 dark:text-purple-200 border border-purple-200 dark:border-purple-500/40 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                    <span>🧾 استقبال وتحويل للسلة والمحاسبة (POS)</span>
                                  </button>
                                )}

                                {/* Booking Action Buttons */}
                                <div className="flex gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/80 mt-auto">
                                  {isPending && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => updateBookingStatus(bk.id, 'confirmed')}
                                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-black text-xs rounded-xl transition shadow-md shadow-emerald-900/20 active:scale-95"
                                      >
                                        قبول وتأكيد ✅
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateBookingStatus(bk.id, 'cancelled')}
                                        className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-600/15 dark:hover:bg-rose-600/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 font-bold text-xs rounded-xl transition"
                                      >
                                        رفض / غير متاح ❌
                                      </button>
                                    </>
                                  )}

                                  {isConfirmed && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => updateBookingStatus(bk.id, 'completed')}
                                        className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white keep-white font-black text-xs rounded-xl transition shadow-md shadow-blue-900/20 active:scale-95"
                                      >
                                        حضر واكتمل 🏁
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateBookingStatus(bk.id, 'no_show')}
                                        className="px-3.5 py-2.5 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 hover:text-rose-600 dark:text-slate-300 border border-slate-200 hover:border-rose-200 dark:border-slate-700 font-bold text-xs rounded-xl transition"
                                        title="العميل لم يحضر"
                                      >
                                        لم يحضر 🏖️
                                      </button>
                                    </>
                                  )}

                                  {(isCompleted || isCancelled || isNoShow) && (
                                    <div className="w-full text-center py-1.5 text-[11px] font-bold text-slate-500">
                                      {isCompleted ? 'اكتمل الموعد بنجاح ✅' : isNoShow ? 'تم تسجيل عدم حضور العميل 🏖️' : 'تم إلغاء الحجز ❌'}
                                    </div>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

          </div>
        );
      })()}

      {activeTab === 'rewards' && (
        <div className="animate-fade-in pb-24">
          <div className="space-y-6 max-w-xl mx-auto">
          
          {/* Card: Store Privileges & Instant Reward Redeem by Points */}
          <div className="glass-card rounded-3xl p-6 space-y-4 border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Gift className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  عروض وامتيازات المتجر ({privileges.length})
                </h3>
              </div>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2.5 py-0.5 rounded-full font-bold border border-amber-500/20">
                استبدال بالنقاط
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              إذا طلب العميل استبدال مكافأة محددة بنقاطه فورياً، اضغط على العرض وامسح باركود العميل:
            </p>

            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {privileges.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  لا توجد امتيازات مضافة بعد في لوحة تحكم التاجر.
                </div>
              ) : (
                privileges.map((priv) => {
                  const isSoldOut =
                    priv.quantity_limit !== null &&
                    priv.quantity_limit > 0 &&
                    (priv.redeemed_count || 0) >= priv.quantity_limit;

                  return (
                    <div
                      key={priv.id}
                      className={`p-3.5 rounded-2xl bg-slate-900/80 border transition flex items-center justify-between gap-3 ${
                        isSoldOut || !priv.is_active
                          ? 'border-slate-800 opacity-60'
                          : 'border-slate-800 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="flex items-center space-x-3 rtl:space-x-reverse min-w-0">
                        {priv.image_url ? (
                          <img
                            src={priv.image_url}
                            alt={priv.title}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 text-base shrink-0">
                            🎁
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{priv.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-amber-400 font-mono font-bold">
                              {priv.cost_points || 0} نقطة
                            </span>
                            {priv.valid_start_time && priv.valid_end_time && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {priv.valid_start_time} - {priv.valid_end_time}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isSoldOut || !priv.is_active}
                        onClick={() =>
                          handleOpenRewardScanner({
                            id: priv.id,
                            title: priv.title,
                            cost: priv.cost_points || 0,
                          })
                        }
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1 rtl:space-x-reverse shrink-0 transition border ${
                          isSoldOut
                            ? 'bg-slate-800 text-slate-500 border-slate-700'
                            : 'bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-300 border-amber-500/30'
                        }`}
                      >
                        <Camera className="w-3 h-3" />
                        <span>{isSoldOut ? 'نفد 🚫' : 'حرق بالنقاط 🔥'}</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Card: Daily Coupon Redemption Inventory */}
          <div className="glass-card rounded-3xl p-6 space-y-4 border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <History className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  سجل الكوبونات المصروفة اليوم
                </h3>
              </div>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/20 font-mono">
                {redeemedCouponsList.length} تم حرقها
              </span>
            </div>

            <div className="space-y-2">
              {redeemedCouponsList.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  لم يتم حرق أي كوبونات خلال هذه الوردية حتى الآن
                </div>
              ) : (
                redeemedCouponsList.map((cpn) => (
                  <div
                    key={cpn.id}
                    className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-white">{cpn.privilege_title}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {cpn.coupon_code} | {cpn.customer_phone}
                      </p>
                    </div>
                    <div className="text-left rtl:text-right">
                      <span className="text-[10px] text-emerald-400 font-bold block">
                        تم الصرف ✅
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {cpn.used_at ? new Date(cpn.used_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      
        </div>
      )}


      {/* 📱 Bottom Navigation Dock */}
      <div className="fixed bottom-3 left-3 right-3 z-40 max-w-lg mx-auto">
        <nav className={`glass-dock rounded-3xl p-1.5 flex items-center justify-around relative transition-colors duration-300 ${
          isDarkTheme
            ? 'shadow-[0_-8px_30px_rgba(0,0,0,0.5)] bg-slate-950/95 backdrop-blur-3xl border border-white/10'
            : 'shadow-[0_-4px_25px_rgba(0,0,0,0.08)] bg-white/95 backdrop-blur-3xl border border-slate-200/90'
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            style={activeTab === 'register' ? {
              backgroundColor: brandColors.secondary,
              color: brandColors.contrastOnSecondary,
              boxShadow: `0 6px 18px -3px ${brandColors.glow}`
            } : undefined}
            className={`flex-1 py-2 px-1 rounded-2xl text-[10px] sm:text-xs flex flex-col items-center justify-center gap-1 transition-all duration-300 relative ${
              activeTab === 'register'
                ? `font-black scale-105 ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'}`
                : isDarkTheme ? 'font-bold text-slate-400 hover:text-white hover:scale-105' : 'font-bold text-slate-500 hover:text-slate-900 hover:scale-105'
            }`}
          >
            <Receipt className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>نقطة البيع</span>
            {activeTab === 'register' && (
              <span className="w-4 h-0.5 rounded-full bg-current opacity-80" />
            )}
          </button>

          {/* Orders Button (ShoppingBag) */}
          {activeModules.orders && (
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              style={activeTab === 'orders' ? {
                backgroundColor: brandColors.secondary,
                color: brandColors.contrastOnSecondary,
                boxShadow: `0 6px 18px -3px ${brandColors.glow}`
              } : undefined}
              className={`flex-1 py-2 px-1 rounded-2xl text-[10px] sm:text-xs flex flex-col items-center justify-center gap-1 transition-all duration-300 relative ${
                activeTab === 'orders'
                  ? `font-black scale-105 ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'}`
                  : isDarkTheme ? 'font-bold text-slate-400 hover:text-white hover:scale-105' : 'font-bold text-slate-500 hover:text-slate-900 hover:scale-105'
              }`}
            >
              <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
              <span>الطلبات</span>
              {activeTab === 'orders' && (
                <span className="w-4 h-0.5 rounded-full bg-current opacity-80" />
              )}
              {(() => {
                const ordersCount = liveOrders.filter(
                  (o) =>
                    (o.status === 'pending' || o.status === 'accepted' || o.status === 'preparing' || o.status === 'ready') &&
                    (isGeneralManager || (o.branch_id ? o.branch_id === activeBranchId : Boolean(activeBranchObj?.is_main)))
                ).length;
                return ordersCount > 0 ? (
                  <span className="absolute top-0 right-3 sm:right-5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm animate-pulse">
                    {ordersCount}
                  </span>
                ) : null;
              })()}
            </button>
          )}

          {/* Bookings Button (Calendar) */}
          {activeModules.bookings && (
            <button
              type="button"
              onClick={() => setActiveTab('bookings')}
              style={activeTab === 'bookings' ? {
                backgroundColor: brandColors.secondary,
                color: brandColors.contrastOnSecondary,
                boxShadow: `0 6px 18px -3px ${brandColors.glow}`
              } : undefined}
              className={`flex-1 py-2 px-1 rounded-2xl text-[10px] sm:text-xs flex flex-col items-center justify-center gap-1 transition-all duration-300 relative ${
                activeTab === 'bookings'
                  ? `font-black scale-105 ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'}`
                  : isDarkTheme ? 'font-bold text-slate-400 hover:text-white hover:scale-105' : 'font-bold text-slate-500 hover:text-slate-900 hover:scale-105'
              }`}
            >
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
              <span>المواعيد</span>
              {activeTab === 'bookings' && (
                <span className="w-4 h-0.5 rounded-full bg-current opacity-80" />
              )}
              {(() => {
                const bookingsCount = liveBookings.filter(
                  (b) =>
                    (b.status === 'pending' || b.status === 'confirmed') &&
                    (isGeneralManager || (b.branch_id ? b.branch_id === activeBranchId : Boolean(activeBranchObj?.is_main)))
                ).length;
                return bookingsCount > 0 ? (
                  <span className="absolute top-0 right-3 sm:right-5 w-4 h-4 rounded-full bg-purple-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm animate-pulse">
                    {bookingsCount}
                  </span>
                ) : null;
              })()}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('scanner')}
            style={activeTab === 'scanner' ? {
              backgroundColor: brandColors.secondary,
              color: brandColors.contrastOnSecondary,
              boxShadow: `0 6px 18px -3px ${brandColors.glow}`
            } : undefined}
            className={`flex-1 py-2 px-1 rounded-2xl text-[10px] sm:text-xs flex flex-col items-center justify-center gap-1 transition-all duration-300 relative ${
              activeTab === 'scanner'
                ? `font-black scale-105 ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'}`
                : isDarkTheme ? 'font-bold text-slate-400 hover:text-white hover:scale-105' : 'font-bold text-slate-500 hover:text-slate-900 hover:scale-105'
            }`}
          >
            <QrCode className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>الماسح</span>
            {activeTab === 'scanner' && (
              <span className="w-4 h-0.5 rounded-full bg-current opacity-80" />
            )}
          </button>

          {activeModules.loyalty && (
            <button
              type="button"
              onClick={() => setActiveTab('rewards')}
              style={activeTab === 'rewards' ? {
                backgroundColor: brandColors.secondary,
                color: brandColors.contrastOnSecondary,
                boxShadow: `0 6px 18px -3px ${brandColors.glow}`
              } : undefined}
              className={`flex-1 py-2 px-1 rounded-2xl text-[10px] sm:text-xs flex flex-col items-center justify-center gap-1 transition-all duration-300 relative ${
                activeTab === 'rewards'
                  ? `font-black scale-105 ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'}`
                  : isDarkTheme ? 'font-bold text-slate-400 hover:text-white hover:scale-105' : 'font-bold text-slate-500 hover:text-slate-900 hover:scale-105'
              }`}
            >
              <Gift className="w-5 h-5 sm:w-6 sm:h-6" />
              <span>العروض</span>
              {activeTab === 'rewards' && (
                <span className="w-4 h-0.5 rounded-full bg-current opacity-80" />
              )}
            </button>
          )}
        </nav>
      </div>
    

{/* 💰 MODAL: Enter Invoice Amount for Customer (نافذة إدخال مبلغ الفاتورة) */}
      {isAmountModalOpen && pendingCustomerScan && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl relative animate-scale-up">
            
            <button
              type="button"
              onClick={() => {
                setIsAmountModalOpen(false);
                setPendingCustomerScan(null);
              }}
              className="absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-amber-500/20">
                💳
              </div>
              <h3 className="text-xl font-black text-white">إدخال مبلغ فاتورة المشتريات</h3>
              <p className="text-xs text-slate-400">
                تم مسح باركود العميل بنجاح! أدخل قيمة الفاتورة لاحتساب النقاط فوراً:
              </p>
            </div>

            {/* Customer Info Card */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">العميل المستفيد:</span>
                <strong className="text-white text-sm">
                  {pendingCustomerScan.name || 'عميل المتجر'}
                </strong>
              </div>
              <div className="text-left rtl:text-right font-mono text-amber-400 font-bold" dir="ltr">
                {pendingCustomerScan.phone}
              </div>
            </div>

            {/* Amount Input Form */}
            <form onSubmit={handleConfirmPurchaseAmount} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  مبلغ الفاتورة الحالي (بالريال السعودي):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    autoFocus
                    value={invoiceAmount}
                    onChange={(e) => setInvoiceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    style={{
                      borderColor: `${store.secondary_color || '#F59E0B'}60`,
                      color: store.secondary_color || '#F59E0B',
                    }}
                    className="w-full bg-slate-950 border-2 rounded-2xl px-5 py-4 text-3xl font-black placeholder-slate-700 outline-none transition shadow-inner font-mono text-center sm:text-right"
                  />
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">
                    ر.س
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-2 pt-2">
                  {[15, 30, 50, 100].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setInvoiceAmount(val)}
                      className="py-2.5 px-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 transition"
                    >
                      {val} ر.س
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Points Calculation Preview */}
              {invoiceAmount && Number(invoiceAmount) > 0 && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between font-bold animate-fade-in">
                  <span>النقاط المستحقة للعميل:</span>
                  <span className="text-sm font-black font-mono">
                    + {Math.floor(Number(invoiceAmount) * store.points_per_riyal)} نقطة ولاء
                  </span>
                </div>
              )}

              {/* Confirm Action Button */}
              <button
                type="submit"
                disabled={loading || !invoiceAmount || Number(invoiceAmount) <= 0}
                style={{
                  backgroundColor: store.secondary_color || '#F59E0B',
                  color: '#000000',
                }}
                className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center space-x-2 rtl:space-x-reverse transition shadow-xl hover:brightness-110 disabled:opacity-50"
              >
                <Zap className="w-5 h-5 text-black" />
                <span>{loading ? 'جاري الاحتساب والإيداع...' : 'تأكيد العملية وإضافة النقاط ⚡'}</span>
              </button>
            </form>

          </div>
        </div>
      )}

      {/* 🛡️ MODAL: Manager Approval for High Invoice (طلب موافقة مدير المتجر على الفاتورة الكبيرة) */}
      {isManagerApprovalModalOpen && pendingCustomerScan && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border-2 border-rose-500/60 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl relative animate-scale-up">
            <button
              type="button"
              onClick={() => {
                setIsManagerApprovalModalOpen(false);
                setManagerPinInput('');
                setManagerPinError(null);
              }}
              className="absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-3xl bg-rose-500/20 border-2 border-rose-500/40 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-rose-500/20">
                🛡️
              </div>
              <h3 className="text-xl font-black text-white">تأكيد وموافقة مدير المتجر</h3>
              <p className="text-xs text-rose-300 font-bold bg-rose-950/60 p-2.5 rounded-xl border border-rose-500/30">
                ⚠️ قيمة الفاتورة ({Number(invoiceAmount)} ر.س) تتجاوز سقف العمليات العادية للكاشير ({store.max_cashier_invoice_amount ?? 500} ر.س)
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">العميل المستفيد:</span>
                <strong className="text-white">{pendingCustomerScan.name || pendingCustomerScan.phone}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">النقاط المقترحة:</span>
                <strong className="text-amber-400 font-mono">+{Math.floor(Number(invoiceAmount) * store.points_per_riyal)} نقطة</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">الكاشير:</span>
                <span className="text-slate-200">{activeStaff?.name || authenticatedCashier.name}</span>
              </div>
            </div>

            <form onSubmit={handleManagerApprovalSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-200 block text-center">
                  أدخل الرمز السري لمدير المتجر (Manager PIN) للموافقة:
                </label>
                <input
                  type="password"
                  maxLength={8}
                  autoFocus
                  value={managerPinInput}
                  onChange={(e) => setManagerPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  dir="ltr"
                  className="w-full bg-slate-950 border-2 border-rose-500/50 focus:border-rose-400 rounded-2xl px-4 py-3 text-2xl font-mono font-black text-rose-400 tracking-widest text-center outline-none transition"
                  required
                />
              </div>

              {managerPinError && (
                <div className="p-3 rounded-xl bg-red-950/90 border border-red-500/50 text-red-200 text-xs font-bold animate-shake text-center">
                  {managerPinError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSubmittingApproval || !managerPinInput.trim()}
                  className="flex-1 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-sm transition shadow-lg disabled:opacity-50 flex items-center justify-center space-x-1.5 rtl:space-x-reverse"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmittingApproval ? 'جاري التحقق...' : 'موافقة واعتماد الفاتورة 🔒'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsManagerApprovalModalOpen(false);
                    setManagerPinInput('');
                    setManagerPinError(null);
                  }}
                  className="px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔑 MODAL: Cashier Self-Service Change PIN (تغيير الرمز السري للكاشير) */}
      {isChangePinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full space-y-5 shadow-2xl relative animate-scale-up">
            <button
              type="button"
              onClick={() => {
                setIsChangePinModalOpen(false);
                setChangePinError(null);
                setChangePinSuccess(null);
              }}
              className="absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-2xl mx-auto text-amber-400">
                <KeyRound className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-white">تغيير رمزي السري</h3>
              <p className="text-xs text-slate-400">
                الموظف: <strong className="text-white">{activeStaff?.name || authenticatedCashier.name}</strong>
              </p>
            </div>

            <form onSubmit={handleChangeCashierPinSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 block">الرمز السري الحالي:</label>
                <input
                  type="password"
                  maxLength={6}
                  value={changePinCurrent}
                  onChange={(e) => setChangePinCurrent(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-4 py-2.5 text-center font-mono font-bold text-white text-base tracking-widest outline-none transition"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 block">الرمز السري الجديد (4-6 أرقام):</label>
                <input
                  type="password"
                  maxLength={6}
                  value={changePinNew}
                  onChange={(e) => setChangePinNew(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-4 py-2.5 text-center font-mono font-bold text-amber-400 text-base tracking-widest outline-none transition"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 block">تأكيد الرمز السري الجديد:</label>
                <input
                  type="password"
                  maxLength={6}
                  value={changePinConfirm}
                  onChange={(e) => setChangePinConfirm(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-4 py-2.5 text-center font-mono font-bold text-amber-400 text-base tracking-widest outline-none transition"
                  required
                />
              </div>

              {changePinError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-bold text-center animate-shake">
                  {changePinError}
                </div>
              )}

              {changePinSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center animate-fade-in flex items-center justify-center space-x-1 rtl:space-x-reverse">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{changePinSuccess}</span>
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={isSavingCashierPin || !changePinNew || !changePinConfirm || !changePinCurrent}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-md disabled:opacity-50"
                >
                  {isSavingCashierPin ? 'جاري التحديث...' : 'حفظ الرمز السري'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsChangePinModalOpen(false);
                    setChangePinError(null);
                    setChangePinSuccess(null);
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

      {/* 📷 Live Camera Single QR Scanner Modal */}
      {isScannerOpen && (
        <QRScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScanSuccess={handleQRScanned}
          title={
            scannerAction === 'REDEEM'
              ? `مسح باركود العميل لحرق: ${selectedReward?.title || 'المكافأة'}`
              : 'مسح الباركود الذكي (عميل أو كوبون)'
          }
          subtitle="وجّه كاميرا الجهاز نحو شاشة الجوال لقراءة الباركود فورياً"
        />
      )}

      {/* 🔒 Shift Closing & Z-Report Modal */}
      {isShiftCloseModalOpen && (
        <CashierShiftCloseModal
          store={store}
          activeStaff={(activeStaff || authenticatedCashier)!}
          activeBranch={activeBranchObj || null}
          isOpen={isShiftCloseModalOpen}
          onClose={() => setIsShiftCloseModalOpen(false)}
          onShiftClosed={() => {
            // Refresh shift data and orders
            if (effectiveStoreId || store?.id) {
              LoyaltyService.getLiveStoreOrders(effectiveStoreId || store.id).then(setLiveOrders).catch(() => {});
            }
          }}
        />
      )}

      {/* 🔄 POS Returns & Tax Credit Note Modal */}
      {isRefundModalOpen && (
        <CashierRefundModal
          store={store}
          activeStaff={(activeStaff || authenticatedCashier)!}
          activeBranch={activeBranchObj || null}
          activeShift={null}
          isOpen={isRefundModalOpen}
          onClose={() => setIsRefundModalOpen(false)}
          onRefundCompleted={() => {
            if (effectiveStoreId || store?.id) {
              LoyaltyService.getLiveStoreOrders(effectiveStoreId || store.id).then(setLiveOrders).catch(() => {});
            }
          }}
        />
      )}

      {/* 🌐 Offline Mode & Auto-Sync Modal */}
      {isOfflineModalOpen && (
        <OfflineSyncModal
          store={store}
          isOpen={isOfflineModalOpen}
          onClose={() => setIsOfflineModalOpen(false)}
          onSyncCompleted={() => {
            if (effectiveStoreId || store?.id) {
              LoyaltyService.getLiveStoreOrders(effectiveStoreId || store.id).then(setLiveOrders).catch(() => {});
            }
          }}
        />
      )}

      {/* 💵 POS Cash In / Out Movements Modal */}
      {isCashMovementModalOpen && (
        <CashierCashMovementModal
          store={store}
          activeStaff={(activeStaff || authenticatedCashier)!}
          activeBranch={activeBranchObj || null}
          activeShift={null}
          initialType={cashMovementInitialType}
          isOpen={isCashMovementModalOpen}
          onClose={() => setIsCashMovementModalOpen(false)}
          onMovementRecorded={() => {
            if (effectiveStoreId || store?.id) {
              LoyaltyService.getLiveStoreOrders(effectiveStoreId || store.id).then(setLiveOrders).catch(() => {});
            }
          }}
        />
      )}

      {/* 📱 KDS & Services Display QR Codes Modal for Kitchen/Salon Tablets */}
      {isScreensModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in text-right" dir="rtl">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>شاشات العرض والباركود لأجهزة التابلت</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      فوري ومحدد بالفرع ⚡
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    امسح رمز الـ QR بكاميرا جهاز التابلت أو التلفزيون لتشغيل الشاشة مباشرة ومقفلة على هذا الفرع
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsScreensModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-6 overflow-y-auto max-h-[80vh]">
              
              {/* Branch Indicator (Strictly locked to Cashier's Active Branch) */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-bold">الفرع المعتمد للشاشات:</span>
                  <span className="font-black text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-sm">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {activeBranchObj?.name || (storeBranches.find(b => b.id === activeBranchId)?.name) || 'الفرع الرئيسي'}
                    </span>
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
                  <span>🔒 مقفل تلقائياً لفرع هذا الكاشير لمنع تداخل الطلبات</span>
                </span>
              </div>

              {/* Screens Grid (Orders vs Services) */}
              {(() => {
                const effectiveBranchParam = activeBranchId || activeBranchObj?.id || (storeBranches.length > 0 ? storeBranches[0].id : null);

                const baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';
                const kitchenUrl = `${baseOrigin}/${store.slug}/kds${effectiveBranchParam ? '?branch=' + effectiveBranchParam : ''}`;
                const salonUrl = `${baseOrigin}/${store.slug}/kds?mode=services${effectiveBranchParam ? '&branch=' + effectiveBranchParam : ''}`;

                const showBoth = activeModules.orders && activeModules.bookings;

                return (
                  <div className={`grid grid-cols-1 ${showBoth ? 'md:grid-cols-2' : 'max-w-md mx-auto'} gap-5`}>
                    
                    {/* CARD 1: KITCHEN DISPLAY (المطبخ والبار) */}
                    {activeModules.orders && (
                      <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-5 flex flex-col justify-between items-center text-center space-y-4 shadow-xl">
                        <div className="space-y-1">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                            <ChefHat className="w-5 h-5" />
                          </div>
                          <h4 className="text-sm font-black text-white">شاشة المطبخ والبار (KDS) 👨‍🍳</h4>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            لتجهيز وجبات ومشروبات المطبخ مع نغمة رنين فورية لكل طلب جديد
                          </p>
                        </div>

                        {/* QR Code */}
                        <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-amber-400/40">
                          <QRCodeSVG
                            value={kitchenUrl}
                            size={160}
                            level="H"
                            includeMargin={false}
                          />
                        </div>

                        {/* Actions */}
                        <div className="w-full space-y-2 pt-2 border-t border-slate-800">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              readOnly
                              value={kitchenUrl}
                              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] font-mono text-amber-300 outline-none text-left select-all"
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(kitchenUrl);
                                setCopiedScreenKey('kitchen');
                                setTimeout(() => setCopiedScreenKey(null), 2000);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1 border border-slate-700 transition shrink-0"
                            >
                              {copiedScreenKey === 'kitchen' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                              <span>{copiedScreenKey === 'kitchen' ? 'تم!' : 'نسخ'}</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => window.open(kitchenUrl, '_blank')}
                            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>فتح شاشة المطبخ في نافذة جديدة</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* CARD 2: SALON / SERVICES DISPLAY (صالة الخدمات والمواعيد) */}
                    {activeModules.bookings && (
                      <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-5 flex flex-col justify-between items-center text-center space-y-4 shadow-xl">
                        <div className="space-y-1">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mx-auto">
                            <Scissors className="w-5 h-5" />
                          </div>
                          <h4 className="text-sm font-black text-white">شاشة صالة الخدمات والمواعيد ✂️</h4>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            لمتابعة مواعيد اليوم واستقبال العملاء وتنفيذ الجلسات في الصالون/المركز
                          </p>
                        </div>

                        {/* QR Code */}
                        <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-purple-400/40">
                          <QRCodeSVG
                            value={salonUrl}
                            size={160}
                            level="H"
                            includeMargin={false}
                          />
                        </div>

                        {/* Actions */}
                        <div className="w-full space-y-2 pt-2 border-t border-slate-800">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              readOnly
                              value={salonUrl}
                              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] font-mono text-purple-300 outline-none text-left select-all"
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(salonUrl);
                                setCopiedScreenKey('salon');
                                setTimeout(() => setCopiedScreenKey(null), 2000);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1 border border-slate-700 transition shrink-0"
                            >
                              {copiedScreenKey === 'salon' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-purple-400" />}
                              <span>{copiedScreenKey === 'salon' ? 'تم!' : 'نسخ'}</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => window.open(salonUrl, '_blank')}
                            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>فتح شاشة الخدمات في نافذة جديدة</span>
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })()}

              {/* Instructions Footer */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2.5">
                <span className="text-base shrink-0">💡</span>
                <p className="leading-relaxed">
                  <strong className="text-slate-200">طريقة الاستخدام السريع:</strong> وجّه كاميرا جهاز التابلت (iPad أو Android) أو الهاتف نحو الباركود لفتح الشاشة مباشرة على هذا الفرع. الشاشة تعمل بنظام التحديث اللحظي (WebSockets) مع نغمات تنبيه صوتية مستقلة للمطبخ دون إزعاج الكاشير.
                </p>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setIsScreensModalOpen(false)}
                className="py-2.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition border border-slate-700"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

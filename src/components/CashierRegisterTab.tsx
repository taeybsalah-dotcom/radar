import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Store, StoreStaff, StoreBranch, Customer, CatalogItem, Tier, POSCartDiscount, POSCashMovement, POSShift, StoreSpecialist, ServiceBooking, getStoreActiveModules } from '../types';
import { LoyaltyService } from '../lib/supabase';
import { playBeepSound } from '../lib/sound';
import { generateZatcaTLVQR } from '../lib/zatcaQR';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Sparkles,
  User,
  Printer,
  Send,
  X,
  CheckCircle2,
  Building2,
  Utensils,
  Car,
  Package,
  Layers,
  ArrowRight,
  ShieldCheck,
  Percent,
  Clock,
  QrCode,
  Tag,
  Receipt,
  RotateCcw,
  Lock,
  Pause,
  Play,
  Wifi,
  WifiOff,
  DollarSign,
  Unlock,
  TrendingDown,
  Coins,
  Scissors,
  Calendar,
  UserCheck,
  Radio,
  Tablet,
  Smartphone,
} from 'lucide-react';
import { OfflineSyncEngine } from '../lib/offlineSync';
import { InventoryService } from '../lib/inventoryService';
import { OfflineSyncModal } from './OfflineSyncModal';
import { CashierDiscountModal } from './CashierDiscountModal';
import { CashierRecentReceiptsModal } from './CashierRecentReceiptsModal';
import { CashierCustomItemModal } from './CashierCustomItemModal';
import { CashierTableSelectorModal } from './CashierTableSelectorModal';
import { CashierCashMovementModal } from './CashierCashMovementModal';
import { CashierAppointmentsModal } from './CashierAppointmentsModal';
import { DriverService } from '../lib/driverService';

export interface POSCartItem {
  id: string; // unique cart entry id
  catalog_item: CatalogItem;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
  specialist_id?: string | null;
  specialist_name?: string | null;
}

export interface ParkedPOSOrder {
  id: string;
  reference_title: string;
  parked_at: string;
  items: POSCartItem[];
  customer: Customer | null;
  order_type: 'dine_in' | 'takeaway' | 'delivery' | 'car';
  table_number: string;
  car_plate: string;
  total_price: number;
  cashier_name: string;
}

interface CashierRegisterTabProps {
  store: Store;
  activeStaff: StoreStaff;
  activeBranch: StoreBranch | null;
  customer: Customer | null;
  tiers: Tier[];
  setCustomer: (cust: Customer | null) => void;
  onOpenCustomerScanner: () => void;
  onRefreshOrders?: () => void;
  onOpenShiftClose?: () => void;
  onOpenRefund?: (order?: any) => void;
  liveOrders?: any[];
  liveBookings?: ServiceBooking[];
  activeShift?: POSShift | null;
  transferredOrder?: any | null;
  onClearTransferredOrder?: () => void;
}

export const CashierRegisterTab: React.FC<CashierRegisterTabProps> = ({
  store,
  activeStaff,
  activeBranch,
  customer,
  tiers,
  setCustomer,
  onOpenCustomerScanner,
  onRefreshOrders,
  onOpenShiftClose,
  onOpenRefund,
  liveOrders = [],
  liveBookings = [],
  activeShift,
  transferredOrder,
  onClearTransferredOrder,
}) => {
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

  const brandPrimary = brandColors.primary;
  const brandSecondary = brandColors.secondary;
  const isDarkTheme = store?.theme_mode === 'dark';
  const isWarmTheme = store?.theme_mode === 'warm_cream';
  const isLightOrWarm = !isDarkTheme;

  // Active store modules based on merchant activity & permissions
  const activeModules = useMemo(() => getStoreActiveModules(store), [store]);

  // Catalog State
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cart State
  const [cartItems, setCartItems] = useState<POSCartItem[]>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery' | 'car'>('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  // 🛵 Branch Drivers (كباتن الفرع المتاحين)
  const branchDrivers = useMemo(() => {
    if (!store?.id) return [];
    return DriverService.getDrivers(store.id, activeBranch?.id);
  }, [store?.id, activeBranch?.id]);

  const selectedDriver = useMemo(() => {
    return branchDrivers.find((d) => d.id === selectedDriverId) || null;
  }, [branchDrivers, selectedDriverId]);

  // 📱 Transferred Online Order / Booking Metadata
  const [transferredMetadata, setTransferredMetadata] = useState<{
    orderSource: 'customer_app' | 'customer_app_booking';
    originalOrderId: string;
    appOrderNumber: string;
    isAppPrepaid: boolean;
    appPaymentMethod?: string;
  } | null>(null);

  // 💇‍♂️ Services & Specialists State
  const [specialists, setSpecialists] = useState<StoreSpecialist[]>([]);
  const [bookingsList, setBookingsList] = useState<ServiceBooking[]>(liveBookings || []);
  const [isAppointmentsModalOpen, setIsAppointmentsModalOpen] = useState(false);
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'product' | 'service'>('all');

  // 🏷️ POS Cart Discounts & Promo Codes
  const [appliedDiscount, setAppliedDiscount] = useState<POSCartDiscount | null>(null);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  // 🧾 Recent Shift Receipts Modal
  const [isRecentReceiptsModalOpen, setIsRecentReceiptsModalOpen] = useState(false);

  // ➕ Custom Open Price Item Modal
  const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);

  // 🪑 Visual Table Selector Modal
  const [isTableSelectorModalOpen, setIsTableSelectorModalOpen] = useState(false);

  // 💵 Cash Drawer In / Out Movement Modal
  const [isCashMovementModalOpen, setIsCashMovementModalOpen] = useState(false);
  const [cashMovementInitialType, setCashMovementInitialType] = useState<'cash_in' | 'cash_out'>('cash_out');

  // 🔓 Cash Drawer Open Feedback Toast
  const [drawerKickToast, setDrawerKickToast] = useState<string | null>(null);

  const handleKickCashDrawer = () => {
    playBeepSound('commission');
    setDrawerKickToast('تم إرسال أمر فتح درج الكاشير الإلكتروني (Drawer Kick) 💵');
    setTimeout(() => setDrawerKickToast(null), 3000);
  };

  // Item Notes Editing Modal
  const [editingCartItem, setEditingCartItem] = useState<POSCartItem | null>(null);
  const [noteInput, setNoteInput] = useState('');

  // Inline Customer Lookup by Phone
  const [isCustomerLookupOpen, setIsCustomerLookupOpen] = useState(false);
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [customerLookupError, setCustomerLookupError] = useState<string | null>(null);

  // Checkout Modal State
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'points' | 'split'>('card');
  const [cashTendered, setCashTendered] = useState<number | ''>('');
  const [splitCashAmount, setSplitCashAmount] = useState<number | ''>('');
  const [splitCardAmount, setSplitCardAmount] = useState<number | ''>('');
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // 📲 Cashier SoftPOS Tap-to-Phone State
  const isSoftPosEnabled = Boolean(store?.fulfillment_settings?.payment_config?.softpos_enabled);
  const softPosProvider = store?.fulfillment_settings?.payment_config?.softpos_provider || 'nearpay';
  const [useSoftPosForCard, setUseSoftPosForCard] = useState<boolean>(isSoftPosEnabled);
  const [softPosCardStatus, setSoftPosCardStatus] = useState<'idle' | 'tapping' | 'reading' | 'approved'>('idle');
  const [softPosAuthReference, setSoftPosAuthReference] = useState<string | null>(null);

  // Completed Receipt Modal State
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isWhatsAppInputOpen, setIsWhatsAppInputOpen] = useState(false);
  const [customWhatsAppPhone, setCustomWhatsAppPhone] = useState('');

  // ⏸️ Parked / Held Orders State (تعليق واسترجاع الفواتير)
  const branchKey = activeBranch?.id || activeStaff.branch_id || 'default';
  const parkedStorageKey = `radar_pos_parked_${store.id}_${branchKey}`;
  const [parkedOrders, setParkedOrders] = useState<ParkedPOSOrder[]>(() => {
    try {
      const saved = localStorage.getItem(parkedStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(parkedStorageKey, JSON.stringify(parkedOrders));
    } catch {}
  }, [parkedOrders, parkedStorageKey]);

  const [isParkModalOpen, setIsParkModalOpen] = useState(false);
  const [parkTitleInput, setParkTitleInput] = useState('');
  const [isParkedOrdersModalOpen, setIsParkedOrdersModalOpen] = useState(false);

  // 🌐 Offline Mode & Auto-Sync State
  const [isOnline, setIsOnline] = useState<boolean>(OfflineSyncEngine.isOnline());
  const [queuedOfflineCount, setQueuedOfflineCount] = useState<number>(() => {
    return OfflineSyncEngine.getQueuedOrders(store.id).length;
  });
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);

  useEffect(() => {
    const handleStatusChange = () => {
      const online = OfflineSyncEngine.isOnline();
      setIsOnline(online);
      setQueuedOfflineCount(OfflineSyncEngine.getQueuedOrders(store.id).length);

      if (online) {
        // Auto-sync queued orders when connection resumes
        OfflineSyncEngine.syncQueue(store.id)
          .then((res) => {
            if (res.successCount > 0) {
              setQueuedOfflineCount(OfflineSyncEngine.getQueuedOrders(store.id).length);
              if (onRefreshOrders) onRefreshOrders();
            }
          })
          .catch(() => {});
      }
    };

    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);

    OfflineSyncEngine.checkRealInternet().then((real) => {
      setIsOnline(real);
    });

    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, [store.id, onRefreshOrders]);

  // Sync live bookings if passed from parent
  useEffect(() => {
    if (liveBookings && liveBookings.length > 0) {
      setBookingsList(liveBookings);
    }
  }, [liveBookings]);

  // 📥 Sync incoming transferred online order or booking into active Cart
  useEffect(() => {
    if (!transferredOrder) return;

    playBeepSound('commission');

    const isBooking =
      transferredOrder.order_source === 'customer_app_booking' ||
      transferredOrder.fulfillment_type === 'service_booking';
    const isPaid =
      transferredOrder.payment_status === 'paid' ||
      transferredOrder.payment_method === 'online' ||
      Boolean(transferredOrder.is_app_paid);

    setTransferredMetadata({
      orderSource: isBooking ? 'customer_app_booking' : 'customer_app',
      originalOrderId: transferredOrder.id,
      appOrderNumber: String(transferredOrder.order_number || transferredOrder.id?.slice(0, 6) || ''),
      isAppPrepaid: isPaid,
      appPaymentMethod: transferredOrder.payment_method || (isPaid ? 'online' : 'pay_at_store'),
    });

    // 1. Link customer
    if (transferredOrder.customer_phone || transferredOrder.customer_name) {
      setCustomer({
        id: transferredOrder.customer_id || `app-cust-${Date.now()}`,
        store_id: store.id,
        phone: transferredOrder.customer_phone || '0500000000',
        name: transferredOrder.customer_name || 'عميل التطبيق',
        points: 0,
        lifetime_xp: 0,
        visit_count: 1,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
      } as any);
    }

    // 2. Set Fulfillment details
    if (transferredOrder.order_type && ['dine_in', 'takeaway', 'delivery', 'car'].includes(transferredOrder.order_type)) {
      setOrderType(transferredOrder.order_type);
    } else if (isBooking) {
      setOrderType('dine_in');
    }

    if (transferredOrder.table_number) {
      setTableNumber(String(transferredOrder.table_number));
    }
    if (transferredOrder.car_plate) {
      setCarPlate(String(transferredOrder.car_plate));
    }

    // 3. Populate Cart Items
    if (Array.isArray(transferredOrder.items) && transferredOrder.items.length > 0) {
      const newItems: POSCartItem[] = transferredOrder.items.map((it: any, idx: number) => {
        const itemUnitPrice = Number(it.unit_price ?? it.price ?? 0);
        const itemQuantity = Number(it.quantity) || 1;
        const itemTotalPrice = Number(it.total_price ?? (itemUnitPrice * itemQuantity));

        const matchedCatalog = catalogItems.find((c) => c.id === it.id || c.name.trim() === (it.name || '').trim());

        const catalogItem: CatalogItem = matchedCatalog || {
          id: it.id || `app-item-${idx}-${Date.now()}`,
          store_id: store.id,
          name: it.name || it.catalog_item?.name || 'صنف',
          category: it.category || it.catalog_item?.category || (it.item_type === 'service' ? 'خدمات' : 'أصناف'),
          price: itemUnitPrice,
          item_type: it.item_type || (isBooking ? 'service' : 'product'),
          duration_minutes: it.duration_minutes || undefined,
          is_available: true,
        };

        return {
          id: `pos-transfer-${idx}-${Date.now()}`,
          catalog_item: catalogItem,
          quantity: itemQuantity,
          unit_price: itemUnitPrice,
          total_price: itemTotalPrice,
          notes: it.notes || undefined,
          specialist_id: it.specialist_id || null,
          specialist_name: it.specialist_name || null,
        };
      });

      setCartItems(newItems);
    }

    // 4. Clear parent's transferred order holder
    if (onClearTransferredOrder) {
      onClearTransferredOrder();
    }
  }, [transferredOrder, store.id, catalogItems, onClearTransferredOrder]);

  // Load Catalog Items, Specialists, and Bookings
  useEffect(() => {
    if (store?.id) {
      setLoadingCatalog(true);
      Promise.all([
        LoyaltyService.getCatalogItems(store.id),
        LoyaltyService.getStoreSpecialists(store.id).catch(() => []),
        LoyaltyService.getStoreBookings(store.id).catch(() => []),
      ])
        .then(([items, specs, bks]) => {
          if (Array.isArray(items)) {
            setCatalogItems(items.filter((it) => it.is_available !== false));
          }
          if (Array.isArray(specs)) {
            setSpecialists(specs.filter((s) => s.is_active !== false));
          }
          if (Array.isArray(bks) && bks.length > 0) {
            setBookingsList(bks);
          }
        })
        .catch((err) => console.warn('Failed to load POS catalog and services data', err))
        .finally(() => setLoadingCatalog(false));
    }
  }, [store?.id]);

  // 🎯 Items allowed strictly by store active modules (Services only vs Products only vs Both)
  const moduleAllowedItems = useMemo(() => {
    if (!activeModules.orders && activeModules.bookings) {
      return catalogItems.filter((it) => it.item_type === 'service');
    }
    if (activeModules.orders && !activeModules.bookings) {
      return catalogItems.filter((it) => (it.item_type || 'product') !== 'service');
    }
    return catalogItems;
  }, [catalogItems, activeModules]);

  // Extract Unique Categories ONLY from allowed items for current activity
  const categories = useMemo(() => {
    const set = new Set<string>();
    moduleAllowedItems.forEach((it) => {
      if (it.category && it.category.trim()) {
        set.add(it.category.trim());
      }
    });
    return Array.from(set);
  }, [moduleAllowedItems]);

  // Reset selected category to ALL if selected category is not in allowed categories
  useEffect(() => {
    if (selectedCategory !== 'ALL' && !categories.includes(selectedCategory)) {
      setSelectedCategory('ALL');
    }
  }, [categories, selectedCategory]);

  // Filter Catalog Items
  const filteredItems = useMemo(() => {
    let result = moduleAllowedItems;

    // In hybrid stores, respect the quick itemTypeFilter ('product' vs 'service')
    if (activeModules.orders && activeModules.bookings && itemTypeFilter !== 'all') {
      result = result.filter((it) => (it.item_type || 'product') === itemTypeFilter);
    }

    if (selectedCategory !== 'ALL') {
      result = result.filter((it) => it.category?.trim() === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          (it.description && it.description.toLowerCase().includes(q)) ||
          it.price.toString().includes(q)
      );
    }

    return result;
  }, [moduleAllowedItems, activeModules, itemTypeFilter, selectedCategory, searchQuery]);

  // Add Item to Cart with Quick Haptic Feedback
  const handleAddToCart = (item: CatalogItem, specificSpecialist?: StoreSpecialist | null) => {
    playBeepSound('success');
    setCartItems((prev) => {
      // Products can be incremented if matching same item and no custom notes
      if (item.item_type !== 'service') {
        const existingIdx = prev.findIndex(
          (p) => p.catalog_item.id === item.id && !p.notes
        );
        if (existingIdx !== -1) {
          const next = [...prev];
          const nextQty = next[existingIdx].quantity + 1;
          next[existingIdx] = {
            ...next[existingIdx],
            quantity: nextQty,
            total_price: next[existingIdx].unit_price * nextQty,
          };
          return next;
        }
      }

      // Services or new items
      const newEntry: POSCartItem = {
        id: `pos-item-${item.id}-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        catalog_item: item,
        quantity: 1,
        unit_price: Number(item.price) || 0,
        total_price: Number(item.price) || 0,
        specialist_id: specificSpecialist ? specificSpecialist.id : null,
        specialist_name: specificSpecialist ? specificSpecialist.name : null,
      };
      return [newEntry, ...prev];
    });
  };

  // Change assigned specialist for a cart item
  const handleSetItemSpecialist = (cartId: string, specialistId: string) => {
    const foundSpec = specialists.find((s) => s.id === specialistId);
    setCartItems((prev) =>
      prev.map((it) => {
        if (it.id === cartId) {
          return {
            ...it,
            specialist_id: foundSpec ? foundSpec.id : null,
            specialist_name: foundSpec ? foundSpec.name : null,
          };
        }
        return it;
      })
    );
  };

  // Check in a service booking and transfer it to the active cart
  const handleCheckInBooking = (booking: ServiceBooking) => {
    playBeepSound('commission');

    // 1. Link customer to POS
    if (booking.customer_phone) {
      setCustomer({
        id: booking.customer_id || `booking-cust-${Date.now()}`,
        store_id: store.id,
        phone: booking.customer_phone,
        name: booking.customer_name || 'عميل حجز',
        points: 0,
        lifetime_xp: 0,
        visit_count: 1,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
      } as any);
    }

    // 2. Find matching catalog item or construct fallback service
    const matched = catalogItems.find(
      (it) => it.id === booking.service_id || it.name.trim().toLowerCase() === booking.service_name.trim().toLowerCase()
    );

    const serviceItem: CatalogItem = matched || {
      id: booking.service_id || `srv-${Date.now()}`,
      store_id: store.id,
      name: booking.service_name,
      category: booking.service_category || 'خدمات',
      price: Number(booking.total_price || booking.service_price) || 0,
      item_type: 'service',
      duration_minutes: booking.duration_minutes || booking.service_duration_minutes || 30,
      is_available: true,
    };

    const newCartEntry: POSCartItem = {
      id: `pos-bk-${booking.id}-${Date.now()}`,
      catalog_item: serviceItem,
      quantity: 1,
      unit_price: Number(booking.total_price || booking.service_price) || 0,
      total_price: Number(booking.total_price || booking.service_price) || 0,
      notes: `حجز #${booking.booking_number}${booking.notes || booking.customer_notes ? ` (${booking.notes || booking.customer_notes})` : ''}`,
      specialist_id: booking.specialist_id || null,
      specialist_name: booking.specialist_name || null,
    };

    setCartItems((prev) => [newCartEntry, ...prev]);

    // 3. Mark booking confirmed in local list
    setBookingsList((prev) =>
      prev.map((b) => (b.id === booking.id ? { ...b, status: 'confirmed' } : b))
    );
  };

  // Add Custom Open Price Item
  const handleAddCustomItem = (customItem: CatalogItem, qty: number, note?: string) => {
    playBeepSound('success');
    setCartItems((prev) => [
      {
        id: `pos-custom-${Date.now()}`,
        catalog_item: customItem,
        quantity: qty,
        unit_price: Number(customItem.price) || 0,
        total_price: (Number(customItem.price) || 0) * qty,
        notes: note,
      },
      ...prev,
    ]);
  };

  // Modify Quantity
  const handleUpdateQty = (cartId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((it) => {
          if (it.id === cartId) {
            const nextQty = it.quantity + delta;
            if (nextQty <= 0) return null;
            return {
              ...it,
              quantity: nextQty,
              total_price: it.unit_price * nextQty,
            };
          }
          return it;
        })
        .filter(Boolean) as POSCartItem[]
    );
  };

  // Remove Item
  const handleRemoveItem = (cartId: string) => {
    setCartItems((prev) => prev.filter((it) => it.id !== cartId));
  };

  // Open Notes Modal for an Item
  const handleOpenItemNote = (item: POSCartItem) => {
    setEditingCartItem(item);
    setNoteInput(item.notes || '');
  };

  const handleSaveItemNote = () => {
    if (!editingCartItem) return;
    setCartItems((prev) =>
      prev.map((it) =>
        it.id === editingCartItem.id ? { ...it, notes: noteInput.trim() || undefined } : it
      )
    );
    setEditingCartItem(null);
    setNoteInput('');
  };

  // Financial Calculations (ZATCA 15% VAT standard)
  const cartSubtotal = useMemo(() => {
    return cartItems.reduce((sum, it) => sum + it.total_price, 0);
  }, [cartItems]);

  // In Saudi retail, menu prices are typically tax-inclusive.
  // Tax = Total - (Total / 1.15)
  const cartVatAmount = useMemo(() => {
    if (cartSubtotal <= 0) return 0;
    return Math.round((cartSubtotal - cartSubtotal / 1.15) * 100) / 100;
  }, [cartSubtotal]);

  const cartNetBeforeVat = useMemo(() => {
    return Math.round((cartSubtotal - cartVatAmount) * 100) / 100;
  }, [cartSubtotal, cartVatAmount]);

  // Customer Loyalty Tier Discount
  const customerTier = useMemo(() => {
    if (!customer) return null;
    const sorted = [...tiers].sort((a, b) => b.required_xp - a.required_xp);
    return sorted.find((t) => customer.lifetime_xp >= t.required_xp) || sorted[sorted.length - 1] || null;
  }, [customer, tiers]);

  const customerDiscountPct = useMemo(() => {
    if (!customer || !customerTier) return 0;
    // Gold / Platinum perks
    if (customerTier.tier_name.includes('بلاتيني') || customerTier.tier_name.includes('Platinum')) return 15;
    if (customerTier.tier_name.includes('ذهبي') || customerTier.tier_name.includes('Gold')) return 10;
    if (customerTier.tier_name.includes('فضي') || customerTier.tier_name.includes('Silver')) return 5;
    return 0;
  }, [customer, customerTier]);

  // Priority: Custom Cart Discount takes precedence, fallback to Customer Loyalty Tier Discount
  const cartDiscountAmount = useMemo(() => {
    if (appliedDiscount) {
      if (appliedDiscount.type === 'complimentary') return cartSubtotal;
      if (appliedDiscount.type === 'percentage') {
        return Math.round(((cartSubtotal * appliedDiscount.value) / 100) * 100) / 100;
      }
      return Math.min(cartSubtotal, appliedDiscount.amount);
    }
    if (customerDiscountPct > 0 && cartSubtotal > 0) {
      return Math.round(((cartSubtotal * customerDiscountPct) / 100) * 100) / 100;
    }
    return 0;
  }, [appliedDiscount, cartSubtotal, customerDiscountPct]);

  const cartGrandTotal = Math.max(0, Math.round((cartSubtotal - cartDiscountAmount) * 100) / 100);

  // Cash Change Calculation
  const changeDue = useMemo(() => {
    if (paymentMethod !== 'cash') return 0;
    const num = Number(cashTendered) || 0;
    return Math.max(0, Math.round((num - cartGrandTotal) * 100) / 100);
  }, [paymentMethod, cashTendered, cartGrandTotal]);

  // Quick Customer Lookup or Auto-Register by Phone
  const handleLookupCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhoneInput.trim()) return;
    setCustomerLookupLoading(true);
    setCustomerLookupError(null);
    try {
      let cust = await LoyaltyService.getCustomer(store.id, customerPhoneInput.trim());
      if (cust) {
        if (customerNameInput.trim() && (!cust.name || cust.name === 'عميل' || cust.name === 'عميل جديد' || cust.name === 'عميل مميز')) {
          cust = await LoyaltyService.updateCustomer(cust.id, { name: customerNameInput.trim() });
        }
        setCustomer(cust);
        setIsCustomerLookupOpen(false);
        setCustomerPhoneInput('');
        setCustomerNameInput('');
        playBeepSound('success');
      } else {
        // العميل غير مسجل مسبقاً -> تسجيله تلقائياً كعميل جديد لكسب نقاط الفاتورة
        const newCust = await LoyaltyService.registerCustomer(
          store.id,
          customerPhoneInput.trim(),
          customerNameInput.trim() || 'عميل جديد'
        );
        setCustomer(newCust);
        setIsCustomerLookupOpen(false);
        setCustomerPhoneInput('');
        setCustomerNameInput('');
        playBeepSound('success');
      }
    } catch (err: any) {
      setCustomerLookupError(err.message || 'فشل البحث عن العميل أو تسجيله');
    } finally {
      setCustomerLookupLoading(false);
    }
  };

  // Complete Checkout Sale
  const handleCompleteSale = async () => {
    if (cartItems.length === 0 || isSubmittingCheckout) return;

    if (!transferredMetadata?.isAppPrepaid) {
      if (paymentMethod === 'cash') {
        const tendered = Number(cashTendered) || 0;
        if (tendered < cartGrandTotal) {
          setCheckoutError(`المبلغ المدفوع كاش (${tendered} ﷼) أقل من إجمالي الفاتورة (${cartGrandTotal} ﷼)`);
          return;
        }
      }

      if (paymentMethod === 'split') {
        const c = Number(splitCashAmount) || 0;
        const k = Number(splitCardAmount) || 0;
        if (Math.abs(c + k - cartGrandTotal) > 0.1) {
          setCheckoutError(`مجموع الكاش والشبكة (${(c + k).toFixed(2)} ﷼) لا يطابق إجمالي الفاتورة (${cartGrandTotal} ﷼)`);
          return;
        }
      }
    }

    setIsSubmittingCheckout(true);
    setCheckoutError(null);

    try {
      const orderNumber = `POS-${Date.now().toString().slice(-6)}`;
      const nowIso = new Date().toISOString();

      const orderPayload: any = {
        store_id: store.id,
        store_name: store.name,
        branch_id: activeBranch?.id || null,
        branch_name: activeBranch?.name || 'الفرع الرئيسي',
        order_number: orderNumber,
        app_order_number: transferredMetadata?.appOrderNumber || null,
        order_source: transferredMetadata ? transferredMetadata.orderSource : 'pos',
        is_app_paid: Boolean(transferredMetadata?.isAppPrepaid),
        customer_name: customer?.name || 'عميل نقدي مباشر',
        customer_phone: customer?.phone || '0500000000',
        customer_tier: customerTier?.tier_name || null,
        items: cartItems.map((c) => ({
          id: c.catalog_item.id,
          name: c.catalog_item.name,
          category: c.catalog_item.category,
          unit_price: c.unit_price,
          quantity: c.quantity,
          total_price: c.total_price,
          notes: c.notes || null,
          item_type: c.catalog_item.item_type || 'product',
          duration_minutes: c.catalog_item.duration_minutes || undefined,
          specialist_id: c.specialist_id || null,
          specialist_name: c.specialist_name || null,
        })),
        fulfillment_type: orderType,
        fulfillment_details: {
          table_number: orderType === 'dine_in' ? tableNumber.trim() || undefined : undefined,
          car_plate: orderType === 'car' ? carPlate.trim() || undefined : undefined,
        },
        driver_id: orderType === 'delivery' && selectedDriverId ? selectedDriverId : undefined,
        driver_name: orderType === 'delivery' && selectedDriver ? selectedDriver.name : undefined,
        driver_phone: orderType === 'delivery' && selectedDriver ? selectedDriver.phone : undefined,
        delivery_status: orderType === 'delivery' ? (selectedDriverId ? 'assigned' : 'unassigned') : undefined,
        subtotal: cartSubtotal,
        discount_amount: cartDiscountAmount,
        discount_reason: appliedDiscount ? appliedDiscount.reason : customerTier ? `خصم فئة ولاء (${customerTier.tier_name})` : null,
        tax_amount: cartVatAmount,
        total_amount: cartGrandTotal,
        total_price: cartGrandTotal,
        payment_method: transferredMetadata?.isAppPrepaid ? 'online' : paymentMethod,
        payment_status: 'paid',
        status: 'pending',
        cashier_id: activeStaff.id,
        cashier_name: activeStaff.name,
        created_at: nowIso,
      };

      // 1. Create order record or update transferred online order
      let savedOrder: any = null;
      let isOfflineOrder = false;

      const isTransferredAppOrder = Boolean(transferredMetadata?.originalOrderId && transferredMetadata.orderSource === 'customer_app');
      const isTransferredBooking = Boolean(transferredMetadata?.originalOrderId && transferredMetadata.orderSource === 'customer_app_booking');

      if (!OfflineSyncEngine.isOnline()) {
        isOfflineOrder = true;
      } else if (isTransferredAppOrder && transferredMetadata) {
        try {
          // 🛡️ Settle existing online menu order: Mark as paid + accepted (sent to kitchen for preparation)
          // ⚠️ Do NOT mark as 'completed'! It must go to the Kitchen KDS Column 1 for food preparation!
          const updateFields = {
            status: 'accepted', // 👨‍🍳 معتمد من الكاشير - يرسل للمطبخ في بداية التحضير
            payment_status: 'paid', // 💰 مسدد
            payment_method: transferredMetadata?.isAppPrepaid ? 'online' : paymentMethod,
            cashier_id: activeStaff.id,
            cashier_name: activeStaff.name,
            order_type: orderType,
            table_number: orderType === 'dine_in' ? tableNumber.trim() || undefined : undefined,
            car_plate: orderType === 'car' ? carPlate.trim() || undefined : undefined,
            items: orderPayload.items,
            total_price: cartGrandTotal,
            loyalty_points_earned: 0,
            driver_id: orderType === 'delivery' && selectedDriverId ? selectedDriverId : undefined,
            driver_name: orderType === 'delivery' && selectedDriver ? selectedDriver.name : undefined,
            driver_phone: orderType === 'delivery' && selectedDriver ? selectedDriver.phone : undefined,
            delivery_status: orderType === 'delivery' ? (selectedDriverId ? 'assigned' : 'unassigned') : undefined,
            branch_id: activeBranch?.id || null,
            branch_name: activeBranch?.name || null,
          };
          savedOrder = await LoyaltyService.updateStoreOrder(transferredMetadata.originalOrderId, updateFields);
          if (!savedOrder) {
            savedOrder = {
              ...orderPayload,
              id: transferredMetadata.originalOrderId,
              order_number: transferredMetadata.appOrderNumber || orderNumber,
              status: 'accepted',
            };
          }
        } catch (updateErr) {
          console.warn('Failed to update transferred app order, fallback to create:', updateErr);
          savedOrder = await LoyaltyService.createStoreOrder(orderPayload);
        }
      } else {
        try {
          savedOrder = await LoyaltyService.createStoreOrder(orderPayload);
          if (savedOrder?.is_offline) {
            isOfflineOrder = true;
          }
        } catch (netErr) {
          console.warn('Network checkout failed, switching to offline queue:', netErr);
          isOfflineOrder = true;
        }
      }

      // 1b. If the invoice contains services and wasn't already converted from an existing booking,
      // register them as service bookings so they appear on the salon/service display (KDS Services)
      const serviceCartItems = cartItems.filter((c) => {
        const itemType = (c.catalog_item.item_type || '').toLowerCase();
        const cat = (c.catalog_item.category || '').toLowerCase();
        return itemType === 'service' || cat === 'خدمات' || cat === 'خدمة' || cat === 'صالون' || cat === 'عناية';
      });

      if (!isOfflineOrder && serviceCartItems.length > 0 && !transferredMetadata?.originalOrderId) {
        try {
          const nowDate = new Date();
          const bookingDateStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
          const bookingTimeStr = `${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}`;

          for (const sItem of serviceCartItems) {
            await LoyaltyService.createServiceBooking({
              store_id: store.id,
              branch_id: activeBranch?.id || null,
              branch_name: activeBranch?.name || null,
              customer_id: customer?.id || undefined,
              customer_name: customer?.name || 'عميل كاشير مباشر',
              customer_phone: customer?.phone || '',
              service_id: sItem.catalog_item.id || 'srv-direct',
              service_name: sItem.catalog_item.name,
              service_price: sItem.total_price,
              total_price: sItem.total_price,
              service_duration_minutes: sItem.catalog_item.duration_minutes || 30,
              specialist_id: sItem.specialist_id || null,
              specialist_name: sItem.specialist_name || null,
              booking_date: bookingDateStr,
              booking_time: bookingTimeStr,
              booking_source: 'walk_in',
              status: 'pending',
              customer_notes: `[فاتورة كاشير #${orderNumber}] ${sItem.notes || ''}`.trim(),
            });
          }
        } catch (bkErr) {
          console.warn('Could not auto-register walk-in service booking from POS:', bkErr);
        }
      }

      if (isOfflineOrder) {
        OfflineSyncEngine.queueOrder(store.id, {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `off_${Date.now()}`,
          storeId: store.id,
          orderNumber,
          orderPayload,
          customerPhone: customer?.phone,
          customerName: customer?.name,
          cartGrandTotal,
          paymentMethod,
          activeStaff: { id: activeStaff.id, name: activeStaff.name },
          branchId: activeBranch?.id || null,
          branchName: activeBranch?.name || null,
          itemsCount: cartItems.reduce((s, it) => s + it.quantity, 0),
          queuedAt: nowIso,
          retryCount: 0,
        });

        setQueuedOfflineCount(OfflineSyncEngine.getQueuedOrders(store.id).length);
      }

      // 2. If a customer was linked, award loyalty points (or estimate if offline)
      let pointsEarned = 0;
      if (!isOfflineOrder && customer && customer.phone) {
        try {
          const purchaseRes = await LoyaltyService.processPurchase(
            store.id,
            customer.phone,
            cartGrandTotal,
            `فاتورة كاشير #${orderNumber} (${orderType === 'dine_in' ? 'محلي' : 'سفري'})`,
            undefined,
            activeStaff.id,
            activeStaff.name,
            'qr_scan',
            activeBranch?.id || null,
            activeBranch?.name || null
          );
          if (purchaseRes && purchaseRes.customer) {
            setCustomer(purchaseRes.customer);
            pointsEarned = purchaseRes.pointsEarned;
          }
        } catch (ptsErr) {
          console.warn('Could not award points to customer:', ptsErr);
        }
      } else if (isOfflineOrder && customer && customer.phone) {
        const multiplier = Number(store.points_per_riyal) > 0 ? Number(store.points_per_riyal) : 1.0;
        pointsEarned = Math.floor(cartGrandTotal * multiplier);
      }

      // 2b. 📦 الخصم التلقائي للمخزون والمواد الخام وتنبيهات النفاد الوشيك
      try {
        const deductRes = InventoryService.deductInventoryForOrder(
          store.id,
          cartItems.map((c) => ({ catalog_item: c.catalog_item, quantity: c.quantity }))
        );
        if (deductRes.lowStockAlerts && deductRes.lowStockAlerts.length > 0) {
          console.warn('تنبيه: بعض المواد الخام وصلت للحد الأدنى:', deductRes.lowStockAlerts.map((i) => i.name));
        }
      } catch (invErr) {
        console.warn('Inventory auto-deduction error on POS checkout:', invErr);
      }

      // 3. Play celebratory cash register ka-ching & throw confetti
      playBeepSound('commission');
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
        colors: [brandSecondary, '#10B981', '#38BDF8', '#FFFFFF'],
      });

      // 4. Prepare completed order for printable receipt
      const completeInfo = {
        ...orderPayload,
        id: savedOrder?.id || orderNumber,
        order_number: savedOrder?.order_number || transferredMetadata?.appOrderNumber || orderNumber,
        pointsEarned,
        is_offline: isOfflineOrder,
        cashTendered: paymentMethod === 'cash' ? Number(cashTendered) : undefined,
        changeDue: paymentMethod === 'cash' ? changeDue : undefined,
        softpos_auth: paymentMethod === 'card' && softPosAuthReference ? softPosAuthReference : undefined,
        card_channel: paymentMethod === 'card' ? (softPosAuthReference ? 'softpos' : 'external_pos') : undefined,
      };

      setCompletedOrder(completeInfo);
      setIsCheckoutModalOpen(false);
      setIsReceiptModalOpen(true);

      // 5. If this invoice was converted from an app booking, confirm the booking
      // Note: Transferred app menu orders are already set to 'accepted' (sent to kitchen for preparation) in Step 1,
      // and must NOT be marked 'completed' here! Completion happens when the food is prepared and delivered to the customer.
      if (isTransferredBooking && transferredMetadata?.originalOrderId) {
        try {
          await LoyaltyService.updateServiceBookingStatus(
            transferredMetadata.originalOrderId,
            'confirmed',
            activeStaff.name,
            activeBranch?.id || null,
            activeBranch?.name || null
          );
        } catch (syncOrigErr) {
          console.warn('Could not update transferred booking status in backend:', syncOrigErr);
        }
      }

      // Reset cart and fields
      setCartItems([]);
      setCustomer(null);
      setAppliedDiscount(null);
      setTableNumber('');
      setCarPlate('');
      setCashTendered('');
      setSplitCashAmount('');
      setSplitCardAmount('');
      setTransferredMetadata(null);
      if (onClearTransferredOrder) {
        onClearTransferredOrder();
      }

      if (onRefreshOrders) {
        onRefreshOrders();
      }
    } catch (err: any) {
      console.error('Checkout failed', err);
      setCheckoutError(err.message || 'حدث خطأ أثناء اعتماد الفاتورة بالسيرفر.');
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  // Generate ZATCA TLV Base64 for the receipt
  const zatcaQrValue = useMemo(() => {
    if (!completedOrder) return '';
    const vatNum = store.tax_number || (store as any).vat_number || '300000000000003';
    return generateZatcaTLVQR(
      store.name,
      vatNum,
      completedOrder.created_at || new Date().toISOString(),
      String(completedOrder.total_amount || '0.00'),
      String(completedOrder.tax_amount || '0.00')
    );
  }, [completedOrder, store]);

  // Handle Sending WhatsApp Receipt
  const handleSendWhatsAppReceipt = () => {
    if (!completedOrder) return;
    const phone = customWhatsAppPhone.trim() || completedOrder.customer_phone || '';
    if (!phone) return;
    const url = LoyaltyService.generateCustomerOrderWhatsAppUrl(store, completedOrder, phone);
    window.open(url, '_blank');
    setIsWhatsAppInputOpen(false);
    setCustomWhatsAppPhone('');
  };

  // ⏸️ Handlers for Parking / Holding Orders
  const handleOpenParkModal = () => {
    if (cartItems.length === 0) return;
    const defaultTitle =
      customer?.name
        ? `${customer.name}`
        : orderType === 'dine_in' && tableNumber
        ? `طاولة #${tableNumber}`
        : orderType === 'car' && carPlate
        ? `سيارة (${carPlate})`
        : `طلب معلق #${parkedOrders.length + 1}`;
    setParkTitleInput(defaultTitle);
    setIsParkModalOpen(true);
  };

  const handleConfirmParkOrder = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (cartItems.length === 0) return;

    const newParked: ParkedPOSOrder = {
      id: 'parked-' + Date.now(),
      reference_title: parkTitleInput.trim() || `طلب معلق #${parkedOrders.length + 1}`,
      parked_at: new Date().toISOString(),
      items: [...cartItems],
      customer: customer ? { ...customer } : null,
      order_type: orderType,
      table_number: tableNumber,
      car_plate: carPlate,
      total_price: cartGrandTotal,
      cashier_name: activeStaff.name,
    };

    setParkedOrders((prev) => [newParked, ...prev]);
    setCartItems([]);
    setCustomer(null);
    setTableNumber('');
    setCarPlate('');
    setIsParkModalOpen(false);
    playBeepSound('notification');
  };

  const handleResumeParkedOrder = (parked: ParkedPOSOrder) => {
    if (cartItems.length > 0) {
      const confirmReplace = window.confirm(
        'توجد أصناف حالية في السلة! هل ترغب في استبدال السلة الحالية بالطلب المعلق المسترجع؟'
      );
      if (!confirmReplace) return;
    }

    setCartItems(parked.items);
    setCustomer(parked.customer);
    setOrderType(parked.order_type);
    setTableNumber(parked.table_number || '');
    setCarPlate(parked.car_plate || '');

    setParkedOrders((prev) => prev.filter((p) => p.id !== parked.id));
    setIsParkedOrdersModalOpen(false);
    playBeepSound('success');
  };

  const handleDeleteParkedOrder = (parkedId: string) => {
    const confirmDelete = window.confirm('هل أنت متأكد من رغبتك في حذف هذا الطلب المعلق؟');
    if (!confirmDelete) return;
    setParkedOrders((prev) => prev.filter((p) => p.id !== parkedId));
  };

  return (
    <div className="space-y-4 animate-fade-in text-right" dir="rtl">
      
      {/* 🚀 Bar 1: Order Type & Catalog Search */}
      <div className={`border rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm backdrop-blur-md transition-colors ${
        isDarkTheme ? 'bg-slate-900/80 border-slate-800' : isWarmTheme ? 'bg-[#FCFAF6] border-[#EFE6D8]' : 'bg-white border-slate-200'
      }`}>
        
        {/* Order Type Selector (Only for Stores with Orders / Food / Retail) */}
        {activeModules.orders && (
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-bold ${
              isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => setOrderType('dine_in')}
                style={orderType === 'dine_in' ? {
                  backgroundColor: brandColors.secondary,
                  color: brandColors.contrastOnSecondary,
                  boxShadow: `0 4px 12px ${brandColors.glow}`
                } : undefined}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  orderType === 'dine_in'
                    ? `font-black shadow-sm ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'}`
                    : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>محلي 🍽️</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderType('takeaway')}
                style={orderType === 'takeaway' ? {
                  backgroundColor: brandColors.secondary,
                  color: brandColors.contrastOnSecondary,
                  boxShadow: `0 4px 12px ${brandColors.glow}`
                } : undefined}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  orderType === 'takeaway'
                    ? `font-black shadow-sm ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'}`
                    : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>سفري 🥡</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderType('car')}
                style={orderType === 'car' ? {
                  backgroundColor: brandColors.secondary,
                  color: brandColors.contrastOnSecondary,
                  boxShadow: `0 4px 12px ${brandColors.glow}`
                } : undefined}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  orderType === 'car'
                    ? `font-black shadow-sm ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'}`
                    : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                <span>سيارة 🚗</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderType('delivery')}
                style={orderType === 'delivery' ? {
                  backgroundColor: brandColors.secondary,
                  color: brandColors.contrastOnSecondary,
                  boxShadow: `0 4px 12px ${brandColors.glow}`
                } : undefined}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  orderType === 'delivery'
                    ? `font-black shadow-sm ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'}`
                    : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🛵 توصيل</span>
              </button>
            </div>

            {/* Dynamic Detail input based on order type */}
            {orderType === 'dine_in' && (
              <div className="flex items-center gap-1.5 animate-fade-in">
                <span className={`text-xs font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>الطاولة:</span>
                <input
                  type="text"
                  placeholder="رقم 1, 2..."
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold w-20 outline-none border transition ${
                    isDarkTheme
                      ? 'bg-slate-950 border-slate-800 focus:border-slate-600 text-white'
                      : 'bg-slate-50 border-slate-200 focus:border-slate-400 text-slate-900'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setIsTableSelectorModalOpen(true)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1 shadow-sm ${
                    isDarkTheme
                      ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                  title="خريطة واختيار الطاولات"
                >
                  <Utensils className="w-3.5 h-3.5" />
                  <span>خريطة 🪑</span>
                </button>
              </div>
            )}

            {orderType === 'car' && (
              <div className="flex items-center gap-1.5 animate-fade-in">
                <span className={`text-xs font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>لوحة/نوع السيارة:</span>
                <input
                  type="text"
                  placeholder="كامري أبيض 1234"
                  value={carPlate}
                  onChange={(e) => setCarPlate(e.target.value)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold w-40 outline-none border transition ${
                    isDarkTheme
                      ? 'bg-slate-950 border-slate-800 focus:border-slate-600 text-white'
                      : 'bg-slate-50 border-slate-200 focus:border-slate-400 text-slate-900'
                  }`}
                />
              </div>
            )}

            {orderType === 'delivery' && (
              <div className="flex items-center gap-1.5 animate-fade-in flex-wrap">
                <span className={`text-xs font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>كابتن الفرع:</span>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className={`rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none max-w-[200px] border transition ${
                    isDarkTheme
                      ? 'bg-slate-950 border-slate-800 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="">بدون إسناد (متاح لكل سائقي الفرع)</option>
                  {branchDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({DriverService.getVehicleLabel(d.vehicle_type)})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Salon / Service Center Badge */}
        {!activeModules.orders && activeModules.bookings && (
          <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 px-3.5 py-1.5 rounded-xl text-xs text-purple-600 dark:text-purple-300 font-bold shadow-sm">
            <Scissors className="w-4 h-4 text-purple-500" />
            <span>خدمات ومواعيد المركز 💇‍♂️</span>
          </div>
        )}

        {/* Search Input & Items Count */}
        <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="ابحث بالاسم أو السعر... 🔍"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredItems.length === 1) {
                  e.preventDefault();
                  handleAddToCart(filteredItems[0]);
                  setSearchQuery('');
                }
              }}
              className={`w-full rounded-xl px-3.5 py-1.5 text-xs outline-none transition border ${
                isDarkTheme
                  ? 'bg-slate-950 border-slate-800 focus:border-slate-600 text-white placeholder-slate-500'
                  : 'bg-slate-50 border-slate-200 focus:border-slate-400 text-slate-900 placeholder-slate-400'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border shrink-0 ${
            isDarkTheme ? 'text-slate-400 bg-slate-950 border-slate-800' : 'text-slate-600 bg-slate-50 border-slate-200'
          }`}>
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>الأصناف: <strong className={isDarkTheme ? 'text-white' : 'text-slate-900'}>{filteredItems.length}</strong></span>
          </div>
        </div>
      </div>

      {/* ⚡ Bar 2: Fast Invoicing Utilities & Cash Accounts (Grouped Near Cart / Invoicing) */}
      <div className={`border rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-sm backdrop-blur-md transition-colors ${
        isDarkTheme ? 'bg-slate-900/70 border-slate-800' : isWarmTheme ? 'bg-[#FCFAF6] border-[#EFE6D8]' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          {/* Electronic Cash Drawer Kick Button */}
          <button
            type="button"
            onClick={handleKickCashDrawer}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 shadow-sm active:scale-95 ${
              isDarkTheme
                ? 'bg-slate-950 hover:bg-slate-800 text-slate-200 border-slate-800'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="إرسال أمر فتح درج الكاشير الإلكتروني (Drawer Kick)"
          >
            <Unlock className="w-3.5 h-3.5 text-emerald-500" />
            <span>فتح الدرج 🔓</span>
          </button>

          {/* Custom Open Price Item */}
          <button
            type="button"
            onClick={() => setIsCustomItemModalOpen(true)}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 shadow-sm active:scale-95 ${
              isDarkTheme
                ? 'bg-slate-950 hover:bg-slate-800 text-slate-200 border-slate-800'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="إضافة صنف مخصص أو خدمة بسعر حر"
          >
            <Plus className="w-3.5 h-3.5 text-amber-500" />
            <span>صنف حر ➕</span>
          </button>

          {/* Refund & Returns */}
          {onOpenRefund && (
            <button
              type="button"
              onClick={onOpenRefund}
              className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 shadow-sm active:scale-95 ${
                isDarkTheme
                  ? 'bg-slate-950 hover:bg-slate-800 text-rose-300 border-slate-800 hover:border-rose-800/40'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
              }`}
              title="استرجاع فاتورة وإصدار إشعار دائن ضريبي معتمد"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
              <span>المرتجع (إشعار دائن) 🔄</span>
            </button>
          )}

          {/* Parked Orders Button */}
          <button
            type="button"
            onClick={() => setIsParkedOrdersModalOpen(true)}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 shadow-sm relative active:scale-95 ${
              parkedOrders.length > 0
                ? isDarkTheme
                  ? 'bg-amber-950/40 text-amber-300 border-amber-800/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                  : 'bg-amber-50 text-amber-800 border-amber-300 shadow-sm'
                : isDarkTheme
                ? 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
            }`}
            title="عرض واسترجاع الفواتير المعلقة"
          >
            <Pause className="w-3.5 h-3.5 text-amber-500" />
            <span>الفواتير المعلقة ⏸️</span>
            {parkedOrders.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-black font-black text-[10px] flex items-center justify-center animate-pulse">
                {parkedOrders.length}
              </span>
            )}
          </button>

          {/* Recent Shift Receipts */}
          <button
            type="button"
            onClick={() => setIsRecentReceiptsModalOpen(true)}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 shadow-sm active:scale-95 ${
              isDarkTheme
                ? 'bg-slate-950 hover:bg-slate-800 text-slate-200 border-slate-800'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="سجل فواتير الوردية وإعادة الطباعة"
          >
            <Receipt className="w-3.5 h-3.5 text-blue-500" />
            <span>فواتير الوردية 🧾</span>
          </button>
        </div>

        {/* 💸 Unified Petty Cash & Float Movements Button */}
        <button
          type="button"
          onClick={() => {
            setCashMovementInitialType('cash_out');
            setIsCashMovementModalOpen(true);
          }}
          className={`px-3.5 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition shadow-sm active:scale-95 ${
            isDarkTheme
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
          }`}
          title="تسجيل المصروفات النثرية وإيداع الفكة والعهدة في الصندوق"
        >
          <Coins className="w-3.5 h-3.5 text-amber-500" />
          <span>حسابات الفرع والنثريات 💸</span>
        </button>
      </div>

      {/* 🌟 Master 3-Column POS Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* ======================================================== */}
        {/* 1️⃣ LEFT COLUMN: LIVE TICKET / CART (lg:col-span-4)         */}
        {/* ======================================================== */}
        <div className={`lg:col-span-4 border rounded-3xl p-4 flex flex-col justify-between shadow-xl backdrop-blur-xl relative transition-colors ${
          isDarkTheme ? 'bg-slate-900/90 border-slate-800' : isWarmTheme ? 'bg-[#FCFAF6] border-[#EFE6D8]' : 'bg-white border-slate-200'
        }`}>
          
          <div className="space-y-3.5">
            
            {/* Ticket Header */}
            <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-500" />
                <h3 className={`text-sm font-black ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>تذكرة الفاتورة الحية</h3>
                {cartItems.length > 0 && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                      brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'
                    }`}
                    style={{ backgroundColor: brandColors.secondary }}
                  >
                    {cartItems.reduce((s, it) => s + it.quantity, 0)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenParkModal}
                    className="text-amber-500 hover:text-amber-600 text-xs font-bold flex items-center gap-1 transition px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20"
                    title="تعليق هذا الطلب لخدمة عميل آخر في الطابور"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>تعليق ⏸️</span>
                  </button>
                )}

                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCartItems([]);
                      setCustomer(null);
                      setAppliedDiscount(null);
                    }}
                    className="text-rose-500 hover:text-rose-600 text-xs font-bold flex items-center gap-1 transition"
                    title="تفريغ السلة بالكامل"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>تفريغ</span>
                  </button>
                )}
              </div>
            </div>

            {/* 📱 Transferred Online Order / Booking Banner */}
            {transferredMetadata && (
              <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border border-blue-500/50 space-y-1.5 shadow-lg animate-fade-in relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-blue-300">
                    <span>{transferredMetadata.orderSource === 'customer_app_booking' ? '📅 حجز موعد تطبيق' : '📱 طلب أونلاين عبر التطبيق'}</span>
                    <span className="font-mono text-white">#{transferredMetadata.appOrderNumber}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTransferredMetadata(null);
                      if (onClearTransferredOrder) onClearTransferredOrder();
                    }}
                    className="text-slate-400 hover:text-white p-1 rounded-md text-[10px] transition"
                    title="فصل ارتباط الطلب"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">حالة السداد:</span>
                  {transferredMetadata.isAppPrepaid ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                      <span>✅ مدفوع إلكترونياً بالتطبيق</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1">
                      <span>⏳ الدفع عند الاستلام بالفرع</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 👤 Customer Loyalty Capsule */}
            <div className={`rounded-2xl p-2.5 border space-y-2 ${isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              {customer ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border"
                      style={{ backgroundColor: `${brandColors.secondary}15`, borderColor: `${brandColors.secondary}35`, color: isDarkTheme ? brandColors.secondary : brandColors.textOnLightHex }}
                    >
                      👤
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-xs font-black truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{customer.name || 'عميل مميز'}</p>
                        {customerTier && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold border border-amber-500/30">
                            {customerTier.tier_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                        <span dir="ltr">{customer.phone}</span>
                        <span className="font-bold" style={{ color: isDarkTheme ? brandColors.secondary : brandColors.textOnLightHex }}>⭐ {customer.wallet_balance} نقطة</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCustomer(null)}
                    className="text-slate-400 hover:text-rose-500 p-1 text-xs"
                    title="فك ربط العميل"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenCustomerScanner}
                    style={{
                      backgroundColor: `${brandColors.secondary}15`,
                      borderColor: `${brandColors.secondary}35`,
                      color: isDarkTheme ? brandColors.secondary : brandColors.textOnLightHex
                    }}
                    className="flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>مسح باركود العميل 📷</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCustomerLookupOpen(true)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition ${
                      isDarkTheme
                        ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                        : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>رقم الجوال</span>
                  </button>
                </div>
              )}

              {customerDiscountPct > 0 && (
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-between bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/25">
                  <span>✨ خصم رتبة العضوية:</span>
                  <span>%{customerDiscountPct}</span>
                </div>
              )}
            </div>

            {/* Cart Items List */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {cartItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <ShoppingBag className="w-10 h-10 mx-auto text-slate-400 opacity-50" />
                  <p className={`text-xs font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>السلة فارغة</p>
                  <p className="text-[10px] text-slate-400">اختر الأصناف من المنيو لإضافتها للتذكرة</p>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-2xl border space-y-1.5 transition ${
                      isDarkTheme
                        ? 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                        : 'bg-slate-50 border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`text-xs font-bold truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{item.catalog_item.name}</p>
                          {item.catalog_item.item_type === 'service' && (
                            <span className="text-[9px] bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30 px-1.5 py-0.2 rounded-md font-bold">
                              خدمة
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {item.unit_price.toFixed(2)} ﷼ للقطعة
                        </p>
                      </div>

                      <span className={`text-xs font-black font-mono shrink-0 ${isDarkTheme ? 'text-amber-400' : 'text-slate-900'}`}>
                        {item.total_price.toFixed(2)} ﷼
                      </span>
                    </div>

                    {/* Specialist Selector for Service Items */}
                    {item.catalog_item.item_type === 'service' && (
                      <div className="pt-1 flex items-center gap-1.5 text-[11px] bg-purple-500/10 px-2 py-1 rounded-xl border border-purple-500/20">
                        <Scissors className="w-3 h-3 text-purple-500 shrink-0" />
                        <span className="text-purple-600 dark:text-purple-300 font-bold shrink-0 text-[10px]">المختص:</span>
                        <select
                          value={item.specialist_id || ''}
                          onChange={(e) => handleSetItemSpecialist(item.id, e.target.value)}
                          className={`rounded-lg px-2 py-0.5 text-[10px] font-bold outline-none flex-1 truncate cursor-pointer border ${
                            isDarkTheme
                              ? 'bg-slate-900 border-slate-700 text-white'
                              : 'bg-white border-slate-200 text-slate-900'
                          }`}
                        >
                          <option value="">أي مختص متاح</option>
                          {specialists.map((spec) => (
                            <option key={spec.id} value={spec.id}>
                              {spec.name} {spec.specialty ? `(${spec.specialty})` : ''}
                            </option>
                          ))}
                        </select>
                        {item.catalog_item.duration_minutes && (
                          <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                            ⏱️ {item.catalog_item.duration_minutes}د
                          </span>
                        )}
                      </div>
                    )}

                    {/* Quantity Controls & Notes Button */}
                    <div className={`flex items-center justify-between pt-1 border-t text-xs ${isDarkTheme ? 'border-slate-800' : 'border-slate-200'}`}>
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${
                        isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(item.id, -1)}
                          className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white font-black"
                        >
                          -
                        </button>
                        <span className={`w-6 text-center font-black font-mono ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(item.id, 1)}
                          className="w-5 h-5 rounded flex items-center justify-center text-amber-500 hover:text-amber-600 font-black"
                        >
                          +
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenItemNote(item)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            item.notes
                              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40'
                              : isDarkTheme
                              ? 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
                          }`}
                        >
                          {item.notes ? `ملاحظة: ${item.notes}` : '+ ملاحظة'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-400 hover:text-rose-500 p-0.5 transition"
                          title="حذف الصنف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 🏷️ Discount Action or Active Discount Capsule */}
            {appliedDiscount ? (
              <div className="p-2.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex items-center justify-between text-xs animate-fade-in">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                  <Tag className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span className="font-bold">
                    {appliedDiscount.type === 'complimentary'
                      ? 'ضيافة 100% (مجاني)'
                      : appliedDiscount.type === 'percentage'
                      ? `خصم ${appliedDiscount.value}%`
                      : appliedDiscount.coupon_code
                      ? `كوبون [${appliedDiscount.coupon_code}]`
                      : `خصم ${appliedDiscount.amount} ﷼`}
                  </span>
                  {appliedDiscount.reason && (
                    <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                      ({appliedDiscount.reason})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black text-rose-500">-{cartDiscountAmount.toFixed(2)} ﷼</span>
                  <button
                    type="button"
                    onClick={() => setAppliedDiscount(null)}
                    className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                    title="إلغاء الخصم"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={cartItems.length === 0}
                onClick={() => setIsDiscountModalOpen(true)}
                className={`w-full py-2 px-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition disabled:opacity-40 ${
                  isDarkTheme
                    ? 'bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-amber-300 border-slate-800'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-slate-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-amber-500" />
                  <span>تطبيق خصم أو كوبون 🏷️</span>
                </span>
                <span className="text-[10px] text-slate-400">مباشر / نسبة / كود</span>
              </button>
            )}

            {/* Financial Summary */}
            <div className={`pt-2.5 border-t space-y-1.5 text-xs ${isDarkTheme ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
              <div className="flex justify-between">
                <span>المجموع بدون الضريبة:</span>
                <span className="font-mono">{cartNetBeforeVat.toFixed(2)} ﷼</span>
              </div>

              <div className="flex justify-between">
                <span>ضريبة القيمة المضافة (15%):</span>
                <span className="font-mono">{cartVatAmount.toFixed(2)} ﷼</span>
              </div>

              {cartDiscountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                  <span>
                    {appliedDiscount
                      ? appliedDiscount.type === 'complimentary'
                        ? 'ضيافة كاملة (100%):'
                        : appliedDiscount.coupon_code
                        ? `كوبون [${appliedDiscount.coupon_code}]:`
                        : `خصم (${appliedDiscount.reason || 'مباشر'}):`
                      : 'خصم رتبة العميل:'}
                  </span>
                  <span className="font-mono">-{cartDiscountAmount.toFixed(2)} ﷼</span>
                </div>
              )}

              <div className={`flex justify-between items-center text-base font-black pt-2 border-t ${
                isDarkTheme ? 'border-slate-800 text-white' : 'border-slate-200 text-slate-900'
              }`}>
                <span>الإجمالي الصافي:</span>
                <span className={`text-xl font-mono font-black ${isDarkTheme ? 'text-amber-400' : 'text-slate-900'}`}>
                  {cartGrandTotal.toFixed(2)} ﷼
                </span>
              </div>
            </div>

            {/* Big Action Checkout Button */}
            {transferredMetadata?.isAppPrepaid ? (
              <button
                type="button"
                disabled={cartItems.length === 0}
                onClick={() => {
                  setIsCheckoutModalOpen(true);
                }}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white keep-white font-black text-sm transition shadow-xl shadow-emerald-500/25 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4 text-white" />
                <span>إصدار فاتورة الطلب المسدد ({cartGrandTotal.toFixed(2)} ﷼) 🖨️</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={cartItems.length === 0}
                onClick={() => {
                  setCashTendered(cartGrandTotal);
                  setSplitCashAmount(Math.round((cartGrandTotal / 2) * 100) / 100);
                  setSplitCardAmount(Math.round((cartGrandTotal / 2) * 100) / 100);
                  setIsCheckoutModalOpen(true);
                }}
                style={{
                  background: brandColors.buttonGradient,
                  color: brandColors.contrastOnSecondary,
                  boxShadow: `0 10px 25px -4px ${brandColors.glow}`,
                }}
                className={`w-full py-3.5 rounded-2xl font-black text-sm transition shadow-xl active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>إتمام الدفع ({cartGrandTotal.toFixed(2)} ﷼) 💳</span>
              </button>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2️⃣ CENTER COLUMN: PRODUCTS & SERVICES GRID (lg:col-span-6) */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 space-y-3">
          
          {/* Quick Filter: Products / Services Strip */}
          <div className={`flex items-center justify-between gap-2 p-1.5 rounded-2xl border transition-all ${
            isDarkTheme 
              ? 'bg-slate-900/90 border-slate-800' 
              : 'bg-white border-slate-200/90 shadow-xs'
          }`}>
            {activeModules.orders && activeModules.bookings ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setItemTypeFilter('all')}
                  style={itemTypeFilter === 'all' ? { backgroundColor: brandColors.secondary } : undefined}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    itemTypeFilter === 'all'
                      ? `${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'} shadow-md`
                      : (isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>الكل 📦</span>
                </button>
                <button
                  type="button"
                  onClick={() => setItemTypeFilter('product')}
                  style={itemTypeFilter === 'product' ? { backgroundColor: brandColors.secondary } : undefined}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    itemTypeFilter === 'product'
                      ? `${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white text-white' : 'text-slate-950'} shadow-md`
                      : (isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>منتجات 🛍️</span>
                </button>
                <button
                  type="button"
                  onClick={() => setItemTypeFilter('service')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    itemTypeFilter === 'service'
                      ? 'bg-purple-600 text-white shadow-md'
                      : (isDarkTheme ? 'text-purple-300 hover:text-white' : 'text-purple-600 hover:text-purple-800')
                  }`}
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>خدمات ومختصين 💇‍♂️</span>
                </button>
              </div>
            ) : activeModules.bookings ? (
              <div className={`flex items-center gap-2 px-3 py-1 text-xs font-bold ${isDarkTheme ? 'text-purple-300' : 'text-purple-700'}`}>
                <Scissors className="w-4 h-4 text-purple-400" />
                <span>قائمة خدمات ومختصي المركز 💇‍♂️</span>
              </div>
            ) : (
              <div 
                style={{ color: brandColors.textOnLightHex }}
                className="flex items-center gap-2 px-3 py-1 text-xs font-bold"
              >
                <Utensils className="w-4 h-4" />
                <span>أصناف وقائمة الطعام 🍔</span>
              </div>
            )}

            {/* Quick appointment badge if any */}
            {activeModules.bookings && bookingsList.filter((b) => b.booking_date === new Date().toISOString().slice(0, 10)).length > 0 && (
              <button
                type="button"
                onClick={() => setIsAppointmentsModalOpen(true)}
                style={{
                  backgroundColor: `${brandColors.secondary}15`,
                  borderColor: `${brandColors.secondary}40`,
                  color: brandColors.textOnLightHex
                }}
                className="text-[11px] font-bold px-2.5 py-1 rounded-xl flex items-center gap-1 transition border"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>مواعيد اليوم ({bookingsList.filter((b) => b.booking_date === new Date().toISOString().slice(0, 10)).length})</span>
              </button>
            )}
          </div>

          {loadingCatalog ? (
            <div className={`py-24 text-center space-y-3 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
              <div 
                style={{ borderTopColor: 'transparent', borderColor: brandColors.secondary }}
                className="w-8 h-8 border-3 rounded-full animate-spin mx-auto"
              ></div>
              <p className="text-xs font-bold">جاري تحميل أصناف المنيو...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className={`p-12 text-center rounded-3xl border space-y-2 ${
              isDarkTheme 
                ? 'bg-slate-900/60 border-slate-800' 
                : 'bg-white border-slate-200/90 shadow-xs'
            }`}>
              <Tag className={`w-8 h-8 mx-auto ${isDarkTheme ? 'text-slate-600' : 'text-slate-400'}`} />
              <p className={`text-xs font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-800'}`}>لا توجد أصناف تطابق هذا البحث أو القسم</p>
              <p className={`text-[10px] ${isDarkTheme ? 'text-slate-500' : 'text-slate-400'}`}>اختر قسماً آخر أو أضف أصناف جديدة من لوحة الإدارة</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredItems.map((item) => {
                const inCartCount = cartItems
                  .filter((c) => c.catalog_item.id === item.id)
                  .reduce((sum, it) => sum + it.quantity, 0);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleAddToCart(item)}
                    className={`p-3 rounded-2xl border transition-all duration-150 flex flex-col justify-between cursor-pointer active:scale-95 group relative overflow-hidden ${
                      isDarkTheme
                        ? 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-800 hover:border-slate-700 shadow-md'
                        : 'bg-white hover:bg-slate-50/90 border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-sm'
                    }`}
                  >
                    {/* In-Cart Quantity Indicator */}
                    {inCartCount > 0 && (
                      <span 
                        style={{ backgroundColor: brandColors.secondary, color: brandColors.contrastOnSecondary }}
                        className={`absolute top-2 left-2 z-10 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg animate-fade-in ${
                          brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                        }`}
                      >
                        {inCartCount}
                      </span>
                    )}

                    {/* Service Badge & Duration */}
                    {item.item_type === 'service' && (
                      <span className="absolute top-2 right-2 z-10 bg-purple-950/90 text-purple-200 border border-purple-500/40 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm backdrop-blur-sm">
                        <Scissors className="w-2.5 h-2.5 text-purple-400" />
                        <span>خدمة</span>
                        {item.duration_minutes && <span>• {item.duration_minutes}د</span>}
                      </span>
                    )}

                    {/* Image Thumbnail */}
                    <div className={`w-full h-24 rounded-xl border overflow-hidden mb-2 relative flex items-center justify-center ${
                      isDarkTheme ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200/80'
                    }`}>
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <span className="text-2xl opacity-60">
                          {item.item_type === 'service' ? '✨' : '🍽️'}
                        </span>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="space-y-1">
                      <p className={`text-xs font-black truncate transition ${
                        isDarkTheme ? 'text-white group-hover:text-amber-300' : 'text-slate-900 group-hover:text-slate-700'
                      }`}>
                        {item.name}
                      </p>
                      <div className="flex items-center justify-between">
                        <span 
                          style={{ color: brandColors.textOnLightHex }}
                          className="text-xs font-bold font-mono"
                        >
                          {Number(item.price).toFixed(2)} ﷼
                        </span>
                        <div 
                          style={{
                            backgroundColor: `${brandColors.secondary}18`,
                            color: brandColors.textOnLightHex
                          }}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black transition group-hover:scale-110"
                        >
                          +
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 3️⃣ RIGHT COLUMN: CATEGORY SELECTOR (lg:col-span-2)       */}
        {/* ======================================================== */}
        <div className="lg:col-span-2 space-y-2">
          <div className={`text-xs font-black px-1 pb-1 border-b ${
            isDarkTheme ? 'text-slate-400 border-slate-800' : 'text-slate-600 border-slate-200'
          }`}>
            الأقسام 📑
          </div>

          <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
            {/* ALL / Featured */}
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              style={selectedCategory === 'ALL' ? {
                backgroundColor: `${brandColors.secondary}22`,
                borderColor: `${brandColors.secondary}66`,
                color: brandColors.textOnLightHex
              } : undefined}
              className={`w-full text-right px-3 py-2.5 rounded-xl text-xs font-black flex items-center justify-between transition whitespace-nowrap border ${
                selectedCategory === 'ALL'
                  ? 'shadow-md'
                  : (isDarkTheme 
                      ? 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/60' 
                      : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50 shadow-xs')
              }`}
            >
              <span>⭐ الكل</span>
              <span className="text-[10px] font-mono opacity-60">({moduleAllowedItems.length})</span>
            </button>

            {/* Dynamic Categories */}
            {categories.map((cat) => {
              const count = moduleAllowedItems.filter((i) => i.category?.trim() === cat).length;
              const isSelected = selectedCategory === cat;

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={isSelected ? {
                    backgroundColor: `${brandColors.secondary}22`,
                    borderColor: `${brandColors.secondary}66`,
                    color: brandColors.textOnLightHex
                  } : undefined}
                  className={`w-full text-right px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition whitespace-nowrap border ${
                    isSelected
                      ? 'shadow-md'
                      : (isDarkTheme 
                          ? 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/60' 
                          : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50 shadow-xs')
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  <span className="text-[10px] font-mono opacity-60 shrink-0">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 💳 CHECKOUT MODAL (Tender Selection & Cash Calculator)   */}
      {/* ======================================================== */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">إتمام الفاتورة وسداد الحساب</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Total Display */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-1">
              <p className="text-xs text-slate-400 font-bold">المبلغ المطلوب سداده:</p>
              <p className="text-3xl font-black text-amber-400 font-mono">{cartGrandTotal.toFixed(2)} ﷼</p>
              {customer && (
                <p className="text-[11px] text-emerald-400 font-medium">
                  عميل مسجل: {customer.name || customer.phone} (سيحصل على نقاط الزيارة فوراً ⭐)
                </p>
              )}
            </div>

            {/* Tender / Method Selector */}
            {transferredMetadata?.isAppPrepaid ? (
              <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-center space-y-2 animate-fade-in">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/30">
                  ✓
                </div>
                <div className="text-emerald-400 font-black text-sm">
                  مسدد إلكترونياً عبر التطبيق بالكامل ✅
                </div>
                <p className="text-xs text-emerald-200/90 leading-relaxed">
                  تم تحصيل المبلغ ({cartGrandTotal.toFixed(2)} ﷼) مسبقاً عبر وسيلة الدفع الإلكترونية في تطبيق العميل (Apple Pay / بطاقة بنكية).
                  <br />
                  <strong className="text-white">لا تقم بتحصيل أي مبالغ نقدية من العميل.</strong>
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    style={paymentMethod === 'card' ? {
                      backgroundColor: brandColors.secondary,
                      borderColor: brandColors.secondary,
                      color: brandColors.contrastOnSecondary
                    } : undefined}
                    className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center justify-center gap-1.5 transition ${
                      paymentMethod === 'card'
                        ? `shadow-lg ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''}`
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span>مدى / شبكة 💳</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    style={paymentMethod === 'cash' ? {
                      backgroundColor: brandColors.secondary,
                      borderColor: brandColors.secondary,
                      color: brandColors.contrastOnSecondary
                    } : undefined}
                    className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center justify-center gap-1.5 transition ${
                      paymentMethod === 'cash'
                        ? `shadow-lg ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''}`
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Banknote className="w-5 h-5" />
                    <span>كاش / نقدي 💵</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('split')}
                    style={paymentMethod === 'split' ? {
                      backgroundColor: brandColors.secondary,
                      borderColor: brandColors.secondary,
                      color: brandColors.contrastOnSecondary
                    } : undefined}
                    className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center justify-center gap-1.5 transition ${
                      paymentMethod === 'split'
                        ? `shadow-lg ${brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''}`
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Sparkles className="w-5 h-5" />
                    <span>تقسيم الدفع ⚡</span>
                  </button>
                </div>

                {/* 💳 Card / SoftPOS Payment Drawer */}
                {paymentMethod === 'card' && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 animate-fade-in">
                    {isSoftPosEnabled && useSoftPosForCard ? (
                      /* SoftPOS Tap-to-Phone Activated */
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <div className="flex items-center gap-2">
                            <Radio className="w-4 h-4 text-purple-400 animate-pulse" />
                            <span className="text-xs font-black text-white">
                              الدفع باللمس عبر التابلت ({softPosProvider === 'nearpay' ? 'نيرباي Nearpay' : 'جيديا Geidea'}) 📲
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setUseSoftPosForCard(false)}
                            className="text-[10px] text-slate-400 hover:text-white underline"
                          >
                            التبديل إلى جهاز شبكة خارجي
                          </button>
                        </div>

                        {/* Interactive Radar Waves & Tap Action */}
                        <div className="py-2 text-center space-y-2">
                          <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/20 border-2 border-purple-500/40 flex items-center justify-center text-purple-300 relative">
                            <span className="absolute inset-0 rounded-full border border-purple-400/30 animate-ping pointer-events-none" />
                            <Radio className="w-8 h-8" />
                          </div>

                          <div className="space-y-0.5">
                            <p className="text-xs font-black text-white">
                              وجّه ظهر التابلت أو شاشته للمس بطاقة مدى أو أبل باي
                            </p>
                            <p className="text-[11px] text-slate-400">
                              المبلغ المطلوب سداده: <span className="font-mono text-amber-400 font-bold">{cartGrandTotal.toFixed(2)} ﷼</span>
                            </p>
                          </div>
                        </div>

                        {/* SoftPOS Status & Trigger */}
                        {softPosCardStatus === 'approved' && softPosAuthReference ? (
                          <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-center space-y-1 animate-fade-in">
                            <div className="text-emerald-400 font-black text-xs flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>تم تفويض وسداد العملية بنجاح! (MADA APPROVED)</span>
                            </div>
                            <p className="text-[10px] font-mono text-emerald-200">
                              رقم المرجع والتفويض: <strong className="text-white">{softPosAuthReference}</strong>
                            </p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={softPosCardStatus !== 'idle'}
                            onClick={() => {
                              setSoftPosCardStatus('tapping');
                              playBeepSound();
                              setTimeout(() => {
                                setSoftPosCardStatus('reading');
                                setTimeout(() => {
                                  playBeepSound();
                                  setSoftPosAuthReference(`MADA-${Math.floor(100000 + Math.random() * 900000)}`);
                                  setSoftPosCardStatus('approved');
                                }, 900);
                              }, 700);
                            }}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 hover:from-purple-500 text-white font-black text-xs transition shadow-lg shadow-purple-500/25 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <Radio className="w-4 h-4" />
                            <span>
                              {softPosCardStatus === 'idle' && `محاكاة لمس بطاقة مدى الآن (${cartGrandTotal.toFixed(2)} ﷼) 📡`}
                              {softPosCardStatus === 'tapping' && 'جاري قراءة بطاقة مدى بالـ NFC...'}
                              {softPosCardStatus === 'reading' && 'جاري تفويض العملية مع شبكة مدى السعودية...'}
                            </span>
                          </button>
                        )}

                        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 pt-1">
                          <span>يدعم:</span>
                          <span className="font-bold text-slate-300">مدى Mada</span>
                          <span>•</span>
                          <span className="font-bold text-slate-300">Apple Pay</span>
                          <span>•</span>
                          <span className="font-bold text-slate-300">Visa / Mastercard</span>
                        </div>
                      </div>
                    ) : (
                      /* Traditional External Bank POS Terminal */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                            <CreditCard className="w-4 h-4 text-blue-400" />
                            <span>الدفع عبر جهاز الشبكة البنكي الخارجي 💳</span>
                          </span>
                          {isSoftPosEnabled && (
                            <button
                              type="button"
                              onClick={() => {
                                setUseSoftPosForCard(true);
                                setSoftPosCardStatus('idle');
                              }}
                              className="text-[10px] text-purple-400 hover:text-purple-300 underline font-bold"
                            >
                              التبديل إلى SoftPOS (اللمس بالتابلت)
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          قم بتمرير بطاقة العميل على جهاز مدى اليدوي التابع لبنكك بقيمة (<strong className="text-white">{cartGrandTotal.toFixed(2)} ﷼</strong>)، ثم اضغط على زر "اعتماد وسداد الفاتورة" بالأسفل بعد خروج إيصال الشبكة.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Cash Calculator Drawer */}
                {paymentMethod === 'cash' && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 animate-fade-in">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 block">المبلغ المستلم من العميل:</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-4 py-2.5 text-lg font-black text-white font-mono outline-none text-center"
                      />
                    </div>

                    {/* Quick Presets */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCashTendered(cartGrandTotal)}
                        className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold font-mono"
                      >
                        بالضبط
                      </button>
                      {[50, 100, 200, 500].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setCashTendered(val)}
                          className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold font-mono"
                        >
                          {val} ﷼
                        </button>
                      ))}
                    </div>

                    {/* Change Due Display */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold">
                      <span className="text-slate-400">المتبقي للعميل (الفكة):</span>
                      <span className="text-lg font-black text-emerald-400 font-mono">{changeDue.toFixed(2)} ﷼</span>
                    </div>
                  </div>
                )}

                {/* Split Payment Input */}
                {paymentMethod === 'split' && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 animate-fade-in text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">المبلغ كاش (💵):</label>
                        <input
                          type="number"
                          step="any"
                          value={splitCashAmount}
                          onChange={(e) => setSplitCashAmount(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono font-bold text-center"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">المبلغ شبكة (💳):</label>
                        <input
                          type="number"
                          step="any"
                          value={splitCardAmount}
                          onChange={(e) => setSplitCardAmount(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono font-bold text-center"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {checkoutError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-bold animate-shake">
                {checkoutError}
              </div>
            )}

            {/* Complete Sale CTA */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCheckoutModalOpen(false)}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={isSubmittingCheckout}
                onClick={handleCompleteSale}
                className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm transition shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isSubmittingCheckout
                    ? 'جاري الاعتماد...'
                    : transferredMetadata?.isAppPrepaid
                    ? 'اعتماد واستخراج الفاتورة الضريبية 🖨️'
                    : 'اعتماد وسداد الفاتورة 🖨️'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 🖨️ COMPLETED ZATCA RECEIPT MODAL                         */}
      {/* ======================================================== */}
      {isReceiptModalOpen && completedOrder && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative space-y-4">
            
            {/* Modal Title */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-black text-white">تمت العملية بنجاح! 🎉</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsReceiptModalOpen(false);
                  setCustomer(null);
                  setCartItems([]);
                  setAppliedDiscount(null);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Printable Receipt Card Preview */}
            <div className="p-4 rounded-2xl bg-white text-black font-sans text-xs space-y-2.5 shadow-inner" id="zatca-receipt-print">
              
              {/* Store & Branch Info */}
              <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-slate-400">
                <h4 className="text-sm font-black text-black">{store.name}</h4>
                <p className="text-[10px] text-slate-700">{completedOrder.branch_name || 'الفرع الرئيسي'}</p>
                <p className="text-[10px] font-mono text-slate-700">
                  الرقم الضريبي: {store.tax_number || (store as any).vat_number || '300000000000003'}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">فاتورة ضريبية مبسطة (Simplified Tax Invoice)</p>
              </div>

              {/* Order Metadata */}
              <div className="flex justify-between text-[10px] text-slate-700 font-mono">
                <span>رقم الفاتورة: {completedOrder.order_number}</span>
                <span>{new Date().toLocaleTimeString('ar-SA')}</span>
              </div>

              {/* Order Origin Channel */}
              <div className="flex justify-between text-[10px] text-slate-700 border-b border-dashed border-slate-300 pb-1">
                <span>قناة الطلب:</span>
                <span className="font-bold">
                  {completedOrder.order_source === 'customer_app'
                    ? `📱 تطبيق العميل (أونلاين ${completedOrder.app_order_number ? `#${completedOrder.app_order_number}` : ''})`
                    : completedOrder.order_source === 'customer_app_booking'
                    ? `📅 حجز مسبق عبر التطبيق (${completedOrder.app_order_number ? `#${completedOrder.app_order_number}` : ''})`
                    : '🏬 كاشير مباشر'}
                </span>
              </div>

              {completedOrder.is_offline && (
                <div className="bg-amber-100 text-amber-900 border border-amber-300 rounded px-2 py-1 text-[9px] font-bold text-center">
                  ⚡ فاتورة وضع عدم الاتصال (أوفلاين) - تم الحفظ محلياً وستتم المزامنة تلقائياً
                </div>
              )}

              {/* Items List */}
              <div className="space-y-1 py-1 border-t border-b border-dashed border-slate-400">
                {completedOrder.items?.map((it: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <div className="min-w-0">
                      <span className="font-bold">{it.quantity}x {it.name}</span>
                      {it.specialist_name && (
                        <p className="text-[9px] text-purple-700 font-semibold font-mono">✂️ المختص: {it.specialist_name}</p>
                      )}
                      {it.notes && <p className="text-[9px] text-slate-500">({it.notes})</p>}
                    </div>
                    <span className="font-mono font-bold shrink-0">{Number(it.total_price || it.total).toFixed(2)} ﷼</span>
                  </div>
                ))}
              </div>

              {/* Financial Totals */}
              <div className="space-y-0.5 text-[11px] font-bold">
                <div className="flex justify-between">
                  <span>المجموع الفرعي (شامل الضريبة):</span>
                  <span className="font-mono">{Number(completedOrder.subtotal).toFixed(2)} ﷼</span>
                </div>
                {Number(completedOrder.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>خصم الولاء:</span>
                    <span className="font-mono">-{Number(completedOrder.discount_amount).toFixed(2)} ﷼</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>ضريبة القيمة المضافة (15%):</span>
                  <span className="font-mono">{Number(completedOrder.tax_amount).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-sm font-black border-t border-slate-400 pt-1">
                  <span>الإجمالي المدفوع:</span>
                  <span className="font-mono">{Number(completedOrder.total_amount).toFixed(2)} ﷼</span>
                </div>
              </div>

              {/* Payment Info */}
              <div className="text-[10px] text-slate-600 flex justify-between border-t border-dashed border-slate-400 pt-1">
                <span>
                  طريقة الدفع:{' '}
                  {completedOrder.is_app_paid
                    ? 'مدفوع إلكترونياً بالتطبيق (Apple Pay / بطاقة) ✅'
                    : completedOrder.payment_method === 'cash'
                    ? 'كاش 💵'
                    : completedOrder.payment_method === 'points'
                    ? 'نقاط ولاء 👑'
                    : completedOrder.payment_method === 'split'
                    ? 'دفع مجزأ (كاش + شبكة)'
                    : completedOrder.softpos_auth
                    ? `مدى باللمس SoftPOS (${completedOrder.softpos_auth}) 📲`
                    : 'شبكة / مدى 💳'}
                </span>
                {completedOrder.changeDue !== undefined && !completedOrder.is_app_paid && (
                  <span>المتبقي: {Number(completedOrder.changeDue).toFixed(2)} ﷼</span>
                )}
              </div>

              {/* ZATCA Official QR Code */}
              <div className="pt-2 text-center flex flex-col items-center">
                <div className="p-1.5 bg-white border border-slate-300 rounded-lg">
                  <QRCodeSVG value={zatcaQrValue} size={90} level="M" />
                </div>
                <p className="text-[9px] text-slate-500 font-mono mt-1">متوافق مع هيئة الزكاة والضريبة والجمارك (ZATCA)</p>
              </div>
            </div>

            {/* 📲 Optional WhatsApp Digital Receipt (للتاجر والعميل) */}
            {store.enable_pos_whatsapp_receipt !== false && (
              <div className="pt-1">
                {isWhatsAppInputOpen ? (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl space-y-2 animate-fade-in text-right">
                    <label className="text-[11px] font-bold text-emerald-300 block">
                      أدخل رقم جوال العميل لإرسال الفاتورة عبر الواتساب:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        dir="ltr"
                        placeholder="05XXXXXXXX"
                        value={customWhatsAppPhone}
                        onChange={(e) => setCustomWhatsAppPhone(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-xl px-3 py-1.5 text-xs text-white font-mono outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleSendWhatsAppReceipt}
                        className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl transition shadow"
                      >
                        إرسال 🚀
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsWhatsAppInputOpen(false)}
                        className="px-2.5 py-1.5 bg-slate-800 text-slate-400 hover:text-white text-xs rounded-xl"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (completedOrder.customer_phone) {
                        const url = LoyaltyService.generateCustomerOrderWhatsAppUrl(store, completedOrder);
                        window.open(url, '_blank');
                      } else {
                        setIsWhatsAppInputOpen(true);
                      }
                    }}
                    className="w-full py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <Send className="w-4 h-4 text-emerald-400" />
                    <span>إرسال الفاتورة عبر الواتساب 📲</span>
                  </button>
                )}
              </div>
            )}

            {/* Receipt Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>طباعة الإيصال 🖨️</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsReceiptModalOpen(false);
                  setCustomer(null);
                  setCartItems([]);
                  setAppliedDiscount(null);
                  setTableNumber('');
                  setCarPlate('');
                  setCashTendered('');
                  setSplitCashAmount('');
                  setSplitCardAmount('');
                  setTransferredMetadata(null);
                }}
                style={{
                  backgroundColor: brandColors.secondary,
                  color: brandColors.contrastOnSecondary
                }}
                className={`flex-1 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg ${
                  brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>طلب جديد ➕</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 👤 CUSTOMER PHONE LOOKUP MODAL                           */}
      {/* ======================================================== */}
      {isCustomerLookupOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" />
                <span>ربط أو تسجيل عميل بالرقم</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomerLookupOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLookupCustomer} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">رقم جوال العميل:</label>
                <input
                  type="tel"
                  placeholder="05xxxxxxxx"
                  value={customerPhoneInput}
                  onChange={(e) => setCustomerPhoneInput(e.target.value)}
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-sm font-bold text-white font-mono text-center outline-none"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">اسم العميل (اختياري للعملاء الجدد):</label>
                <input
                  type="text"
                  placeholder="مثال: عبدالمجيد، سعد..."
                  value={customerNameInput}
                  onChange={(e) => setCustomerNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2 text-xs font-bold text-white outline-none"
                />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  إذا كان الرقم غير مسجل مسبقاً، سيتم إنشاؤه كعميل جديد واحتساب نقاط الفاتورة له فوراً ⭐
                </p>
              </div>

              {customerLookupError && (
                <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs font-semibold">
                  {customerLookupError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCustomerLookupOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={customerLookupLoading}
                  style={{
                    backgroundColor: brandColors.secondary,
                    color: brandColors.contrastOnSecondary
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ${
                    brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                  }`}
                >
                  {customerLookupLoading ? 'جاري الفحص والتسجيل...' : 'ربط أو تسجيل العميل ➕⭐'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ✏️ ITEM NOTE MODAL                                       */}
      {/* ======================================================== */}
      {editingCartItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 w-full max-w-sm shadow-2xl relative space-y-3.5">
            <h3 className="text-sm font-black text-white">
              إضافة ملاحظة للصنف: ({editingCartItem.catalog_item.name})
            </h3>
            <input
              type="text"
              placeholder="مثال: بدون بصل، ثلج قليل، حليب لوز..."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs text-white outline-none font-bold"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingCartItem(null)}
                className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveItemNote}
                style={{
                  backgroundColor: brandColors.secondary,
                  color: brandColors.contrastOnSecondary
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-black shadow ${
                  brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                }`}
              >
                حفظ الملاحظة ✅
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ⏸️ PARK CURRENT ORDER MODAL                              */}
      {/* ======================================================== */}
      {isParkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Pause className="w-4 h-4 text-amber-400" />
                <span>تعليق الطلب الحالي (Park Order)</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsReceiptModalOpen(false);
                  setCustomer(null);
                  setCartItems([]);
                  setAppliedDiscount(null);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              سيتم حفظ أصناف السلة الحالية والعميل مؤقتاً لتتمكن من خدمة العميل التالي، ويمكنك استرجاعها بنقرة واحدة لاحقاً.
            </p>

            <form onSubmit={handleConfirmParkOrder} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  اسم أو رقم مرجعي للطلب المعلق:
                </label>
                <input
                  type="text"
                  placeholder="مثال: طاولة 4، عميل الشاي، محمد..."
                  value={parkTitleInput}
                  onChange={(e) => setParkTitleInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none font-bold"
                  autoFocus
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">عدد الأصناف:</span>
                  <strong className="text-white font-mono">{cartItems.reduce((s, it) => s + it.quantity, 0)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">الإجمالي:</span>
                  <strong className="text-amber-400 font-mono font-bold">{cartGrandTotal.toFixed(2)} ﷼</strong>
                </div>
                {customer && (
                  <div className="flex justify-between text-[11px] text-emerald-400 pt-1 border-t border-slate-800/80">
                    <span>العميل:</span>
                    <span>{customer.name || customer.phone}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsParkModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: brandColors.secondary,
                    color: brandColors.contrastOnSecondary
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 shadow-lg ${
                    brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                  }`}
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>تأكيد تعليق الطلب ⏸️</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 📋 PARKED ORDERS LIST / DRAWER MODAL                     */}
      {/* ======================================================== */}
      {isParkedOrdersModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl relative space-y-4 max-h-[88vh] flex flex-col">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <Pause className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">الطلبات والفواتير المعلقة (Parked Orders)</h3>
                  <p className="text-[11px] text-slate-400">يمكنك استرجاع أي سلة معلقة فوراً أو حذفها</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsParkedOrdersModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {parkedOrders.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs space-y-2">
                  <div className="text-3xl">☕</div>
                  <p className="font-bold">لا توجد طلبات معلقة حالياً</p>
                  <p className="text-[11px] text-slate-600">يمكنك تعليق أي طلب من شاشة السلة بالضغط على زر "تعليق ⏸️"</p>
                </div>
              ) : (
                parkedOrders.map((p) => {
                  const elapsedMinutes = Math.max(0, Math.round((Date.now() - new Date(p.parked_at).getTime()) / 60000));
                  return (
                    <div
                      key={p.id}
                      className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 transition space-y-2.5 shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-white">{p.reference_title}</h4>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              {elapsedMinutes === 0 ? 'الآن' : `منذ ${elapsedMinutes} دقيقة`}
                            </span>
                          </div>
                          {p.customer && (
                            <p className="text-[11px] text-emerald-400 font-bold mt-0.5">
                              👤 العميل: {p.customer.name || p.customer.phone}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span>
                              {p.order_type === 'dine_in'
                                ? `محلي (طاولة ${p.table_number || '-'})`
                                : p.order_type === 'takeaway'
                                ? 'سفري'
                                : p.order_type === 'car'
                                ? `سيارة (${p.car_plate || '-'})`
                                : 'توصيل'}
                            </span>
                            <span>•</span>
                            <span>{new Date(p.parked_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>

                        <div className="text-left font-mono">
                          <span className="text-base font-black text-amber-400">{Number(p.total_price).toFixed(2)}</span>
                          <span className="text-[10px] text-slate-400 mr-1">﷼</span>
                        </div>
                      </div>

                      {/* Items Preview */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {p.items.map((it) => (
                          <span
                            key={it.id}
                            className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded-md"
                          >
                            {it.catalog_item.name} × {it.quantity}
                          </span>
                        ))}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => handleResumeParkedOrder(p)}
                          style={{
                            backgroundColor: brandColors.secondary,
                            color: brandColors.contrastOnSecondary
                          }}
                          className={`flex-1 py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition shadow ${
                            brandColors.contrastOnSecondary === '#FFFFFF' ? 'keep-white' : ''
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>استرجاع إلى السلة ⚡</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteParkedOrder(p.id)}
                          className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 text-xs font-bold transition flex items-center gap-1"
                          title="حذف هذا الطلب المعلق"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🌐 Offline Mode & Auto-Sync Modal */}
      {isOfflineModalOpen && (
        <OfflineSyncModal
          store={store}
          isOpen={isOfflineModalOpen}
          onClose={() => {
            setIsOfflineModalOpen(false);
            setQueuedOfflineCount(OfflineSyncEngine.getQueuedOrders(store.id).length);
          }}
          onSyncCompleted={() => {
            setQueuedOfflineCount(OfflineSyncEngine.getQueuedOrders(store.id).length);
            if (onRefreshOrders) onRefreshOrders();
          }}
        />
      )}

      {/* 🏷️ Cart Discount Modal */}
      {isDiscountModalOpen && (
        <CashierDiscountModal
          isOpen={isDiscountModalOpen}
          onClose={() => setIsDiscountModalOpen(false)}
          subtotal={cartSubtotal}
          currentDiscount={appliedDiscount}
          onApplyDiscount={(discount) => setAppliedDiscount(discount)}
          onRemoveDiscount={() => setAppliedDiscount(null)}
        />
      )}

      {/* 🧾 Recent Shift Receipts Modal */}
      {isRecentReceiptsModalOpen && (
        <CashierRecentReceiptsModal
          isOpen={isRecentReceiptsModalOpen}
          onClose={() => setIsRecentReceiptsModalOpen(false)}
          store={store}
          activeStaff={activeStaff}
          activeBranch={activeBranch}
          orders={liveOrders}
          onReprintReceipt={(ord) => {
            setCompletedOrder(ord);
            setIsReceiptModalOpen(true);
          }}
          onOpenRefundForOrder={onOpenRefund}
        />
      )}

      {/* ➕ Custom Open Price Item Modal */}
      {isCustomItemModalOpen && (
        <CashierCustomItemModal
          isOpen={isCustomItemModalOpen}
          onClose={() => setIsCustomItemModalOpen(false)}
          onAddCustomItem={handleAddCustomItem}
        />
      )}

      {/* 🪑 Visual Table Selector Modal */}
      {isTableSelectorModalOpen && (
        <CashierTableSelectorModal
          isOpen={isTableSelectorModalOpen}
          onClose={() => setIsTableSelectorModalOpen(false)}
          selectedTable={tableNumber}
          activeOrders={liveOrders}
          storeId={store.id}
          activeBranchId={activeBranch?.id}
          onSelectTable={(tableNum) => {
            setTableNumber(tableNum);
            if (tableNum) setOrderType('dine_in');
          }}
        />
      )}

      {/* 💵 Cash In / Out Movement Modal */}
      {isCashMovementModalOpen && (
        <CashierCashMovementModal
          isOpen={isCashMovementModalOpen}
          onClose={() => setIsCashMovementModalOpen(false)}
          store={store}
          activeStaff={activeStaff}
          activeBranch={activeBranch}
          activeShift={activeShift}
          initialType={cashMovementInitialType}
          onMovementRecorded={() => {
            if (onRefreshOrders) onRefreshOrders();
          }}
        />
      )}

      {/* 📅 Service Appointments & Bookings Modal */}
      {isAppointmentsModalOpen && (
        <CashierAppointmentsModal
          isOpen={isAppointmentsModalOpen}
          onClose={() => setIsAppointmentsModalOpen(false)}
          store={store}
          activeBranch={activeBranch}
          activeStaff={activeStaff}
          specialists={specialists}
          catalogItems={catalogItems}
          bookings={bookingsList}
          onCheckInBooking={handleCheckInBooking}
          onRefreshBookings={() => {
            if (store?.id) {
              LoyaltyService.getStoreBookings(store.id).then(setBookingsList).catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
};

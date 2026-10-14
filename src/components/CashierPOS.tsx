import React, { useState, useEffect, useRef } from 'react';
import { Store, Customer, Tier, Privilege, DynamicQRToken, StoreStaff, CustomerCoupon } from '../types';
import { LoyaltyService, normalizePhone, getSupabaseClient } from '../lib/supabase';
import { QRScannerModal } from './QRScannerModal';
import { StaffLoginGate } from './StaffLoginGate';
import { NotificationBell } from './NotificationBell';
import { playBeepSound } from '../lib/sound';
import { LoyaltyEvents } from '../lib/events';
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
} from 'lucide-react';

interface CashierPOSProps {
  store: Store;
}

export const CashierPOS: React.FC<CashierPOSProps> = ({ store }) => {
  const [authenticatedCashier, setAuthenticatedCashier] = useState<StoreStaff | null>(() =>
    store?.id ? (LoyaltyService.getStaffSession(store.id, 'cashier', store.slug) ||
    LoyaltyService.getStaffSession(store.id, 'admin', store.slug)) : null
  );

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [privileges, setPrivileges] = useState<Privilege[]>([]);
  const [storeCoupons, setStoreCoupons] = useState<CustomerCoupon[]>([]);
  const [staffList, setStaffList] = useState<StoreStaff[]>([]);
  const [activeStaff, setActiveStaff] = useState<StoreStaff | null>(authenticatedCashier);

  const authCashierRef = useRef<StoreStaff | null>(authenticatedCashier);
  authCashierRef.current = authenticatedCashier;
  const activeStaffRef = useRef<StoreStaff | null>(activeStaff);
  activeStaffRef.current = activeStaff;

  // ⚡ Debounce / Duplicate Scan Suppression Ref (Section 15 & 51)
  const lastScanRef = useRef<{ rawData: string; timestamp: number } | null>(null);

  const [activeTab, setActiveTab] = useState<'scanner' | 'orders' | 'rewards'>('scanner');
  const [loading, setLoading] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerAction, setScannerAction] = useState<'SMART' | 'REDEEM'>('SMART');
  const [selectedReward, setSelectedReward] = useState<{ id?: string; title: string; cost: number } | null>(null);

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

  const [incomingAlert, setIncomingAlert] = useState<{
    id: string;
    title: string;
    detail: string;
    type: 'order' | 'booking' | 'coupon';
  } | null>(null);

  const triggerLiveAlert = (title: string, detail: string, type: 'order' | 'booking' | 'coupon' = 'order') => {
    if (!isSoundMutedRef.current) {
      try {
        playBeepSound('pos_order_alert');
      } catch (e) {
        console.warn('Audio alert failed', e);
      }
    }
    const alertId = Math.random().toString(36).substring(7);
    setIncomingAlert({ id: alertId, title, detail, type });
    setTimeout(() => {
      setIncomingAlert(prev => (prev?.id === alertId ? null : prev));
    }, 8000);
  };

  // 📦 Orders & Bookings Organization State
  const [ordersSubTab, setOrdersSubTab] = useState<'orders' | 'bookings'>('orders');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'new' | 'preparing' | 'completed'>('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'past'>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  useEffect(() => {
    if (!store?.id) return;
    
    // Fetch initial orders & bookings
    LoyaltyService.getLiveStoreOrders(store.id).then(orders => setLiveOrders(orders)).catch(() => {});
    LoyaltyService.getLiveStoreBookings(store.id).then(bookings => setLiveBookings(bookings)).catch(() => {});

    // Listen to changes via Supabase Realtime
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('live-pos-' + store.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_orders',
          filter: `store_id=eq.${store.id}`
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setLiveOrders(prev => [payload.new, ...prev.filter(o => o.id !== payload.new.id)]);
            const num = payload.new.order_number || '';
            const name = payload.new.customer_name || 'عميل جديد';
            const price = payload.new.total_price || 0;
            const typeText = payload.new.order_type === 'dine_in' ? 'محلي' : payload.new.order_type === 'takeaway' ? 'سفري' : 'توصيل';
            triggerLiveAlert(`طلب جديد #${num}`, `${name} (${price} ر.س) • ${typeText}`, 'order');
          } else if (payload.eventType === 'UPDATE') {
            setLiveOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
          } else if (payload.eventType === 'DELETE') {
            setLiveOrders(prev => prev.filter(o => o.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_bookings',
          filter: `store_id=eq.${store.id}`
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setLiveBookings(prev => [payload.new, ...prev.filter(b => b.id !== payload.new.id)]);
            const num = payload.new.booking_number || '';
            const name = payload.new.customer_name || 'عميل جديد';
            const service = payload.new.service_name || 'خدمة';
            const date = payload.new.booking_date || '';
            triggerLiveAlert(`حجز جديد #${num}`, `${name} - ${service} (${date})`, 'booking');
          } else if (payload.eventType === 'UPDATE') {
            setLiveBookings(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
          } else if (payload.eventType === 'DELETE') {
            setLiveBookings(prev => prev.filter(o => o.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_coupons',
          filter: `store_id=eq.${store.id}`
        },
        (payload: any) => {
          LoyaltyService.getAllStoreCoupons(store.id).then(setStoreCoupons).catch(() => {});
          if (payload.eventType === 'INSERT' || (payload.new && (payload.new.status === 'USED' || payload.new.status === 'REDEEMED'))) {
            const phone = payload.new.customer_phone || '';
            const title = payload.new.privilege_title || 'مكافأة ولاء';
            triggerLiveAlert('عملية استبدال نقاط / كوبون 🎁', `تم حرق/صرف (${title}) للعميل ${phone}`, 'coupon');
          }
        }
      )
      .subscribe();

    // مزامنة دورية احترازية كل 15 ثانية لضمان أحدث البيانات في الخلفية
    const livePollingTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      LoyaltyService.getLiveStoreOrders(store.id).then(setLiveOrders).catch(() => {});
      LoyaltyService.getLiveStoreBookings(store.id).then(setLiveBookings).catch(() => {});
    }, 15000);

    return () => {
      clearInterval(livePollingTimer);
      supabase.removeChannel(channel);
    };
  }, [store?.id]);

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      setOrderActionError(null);
      await LoyaltyService.updateOrderStatus(orderId, status);
      setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    } catch (e: any) {
      setOrderActionError(e.message || 'حدث خطأ أثناء تحديث الحالة.');
      console.error(e);
      LoyaltyService.getLiveStoreOrders(store!.id).then(setLiveOrders);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: 'pending' | 'completed' | 'cancelled' | 'confirmed' | 'no_show') => {
    try {
      setOrderActionError(null);
      await LoyaltyService.updateServiceBookingStatus(bookingId, status);
      setLiveBookings(prev => prev.map(o => o.id === bookingId ? { ...o, status } : o));
    } catch (e: any) {
      setOrderActionError(e.message || 'حدث خطأ أثناء تحديث حالة الحجز.');
      console.error(e);
      LoyaltyService.getLiveStoreBookings(store!.id).then(setLiveBookings);
    }
  };

  useEffect(() => {
    document.title = store?.name ? `${store.name} - الكاشير` : 'نظام الكاشير';
  }, [store?.name]);

  useEffect(() => {
    if (store?.id) {
      const session =
        LoyaltyService.getStaffSession(store.id, 'cashier', store.slug) ||
        LoyaltyService.getStaffSession(store.id, 'admin', store.slug);
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
      if (event.storeId === store?.id) {
        // تحديثات مستهدفة دقيقة فقط حسب نوع الحدث، دون إعادة تحميل كامل البيانات التشغيلية
        if (event.type === 'ORDER_CREATED') {
          LoyaltyService.getLiveStoreOrders(store.id).then(setLiveOrders).catch(() => {});
          triggerLiveAlert('طلب جديد في المنيو 📦', 'تم استلام طلب جديد من العميل', 'order');
          return;
        }

        if (event.type === 'BOOKING_CREATED') {
          LoyaltyService.getLiveStoreBookings(store.id).then(setLiveBookings).catch(() => {});
          triggerLiveAlert('حجز موعد جديد 📅', 'تم استلام حجز خدمة جديد من العميل', 'booking');
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
            } else if (staff.length > 0 && !activeStaffRef.current) {
              setActiveStaff(staff[0]);
            }
          }).catch(() => {});
          return;
        }

        if (event.type === 'SUBSCRIPTION_UPDATED') {
          LoyaltyService.checkAndUpdateStoreSubscription(store.id).then(setSubscriptionInfo).catch(() => {});
          return;
        }

        if (event.type === 'STORE_UPDATED') {
          // التغييرات البصرية والهيكلية للمتجر تنعكس تلقائياً عبر prop المتجر القادم من App
          // دون الحاجة لإعادة جلب كل الكوبونات أو الموظفين أو الرتب أو الفواتير
          return;
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [store?.id]);

  const loadStoreMetadata = async () => {
    if (!store?.id) return;
    try {
      const [t, p, staff, cpns] = await Promise.all([
        LoyaltyService.getTiers(store.id),
        LoyaltyService.getPrivileges(store.id),
        LoyaltyService.getStoreStaff(store.id),
        LoyaltyService.getAllStoreCoupons(store.id),
      ]);
      setTiers(t);
      setPrivileges(p);
      setStaffList(staff);
      setStoreCoupons(cpns);

      // Real-time synchronization of cashier / staff permissions
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
      } else if (staff.length > 0 && !activeStaff) {
        setActiveStaff(staff[0]);
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
          entryMethod
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
        entryMethod
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
        pendingCustomerScan.entryMethod
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
        pendingCustomerScan.entryMethod
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
    setAuthenticatedCashier(null);
    setActiveStaff(null);
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
        className="p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl border border-slate-800"
        style={{
          background: `linear-gradient(to right, ${store.secondary_color || '#F59E0B'}20, #0B0F17 60%, ${store.primary_color || '#0F172A'}40)`,
          borderRightWidth: '4px',
          borderRightColor: store.secondary_color || '#F59E0B',
        }}
      >
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name}
              className="w-12 h-12 rounded-2xl object-cover border bg-slate-950 shrink-0 shadow-md"
              style={{ borderColor: `${store.secondary_color || '#F59E0B'}60` }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-2xl border flex items-center justify-center font-bold text-xl shrink-0 shadow-md"
              style={{
                backgroundColor: store.primary_color || '#0F172A',
                borderColor: store.secondary_color || '#F59E0B',
                color: store.secondary_color || '#F59E0B',
              }}
            >
              ⚡
            </div>
          )}
          <div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <h3 className="text-base sm:text-lg font-black text-white">نظام الكاشير الذكي (Radar POS)</h3>
              <span
                className="text-[10px] font-mono px-2.5 py-0.5 rounded-full border font-bold"
                style={{
                  backgroundColor: `${store.secondary_color || '#F59E0B'}20`,
                  borderColor: `${store.secondary_color || '#F59E0B'}40`,
                  color: store.secondary_color || '#F59E0B',
                }}
              >
                {store.name}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              معامل النقاط: كل 1 ريال = <strong style={{ color: store.secondary_color || '#F59E0B' }}>{store.points_per_riyal} نقطة</strong> ولاء
            </p>
          </div>
        </div>

        {/* Authenticated Cashier Info & Logout */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <NotificationBell
            portalName={`كاشير (${store.name})`}
            portalFilter="cashier"
          />

          {/* 🔔 Live Audio Alert Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse transition shadow-sm ${
              isSoundMuted
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
            }`}
            title={isSoundMuted ? 'تفعيل جرس التنبيه الصوتي' : 'كتم جرس التنبيه الصوتي'}
          >
            {isSoundMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            )}
            <span>{isSoundMuted ? 'الصوت صامت 🔕' : 'جرس التنبيه 🔔'}</span>
          </button>

          <div className="flex items-center space-x-2 rtl:space-x-reverse bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <User className="w-3.5 h-3.5" style={{ color: store.secondary_color || '#F59E0B' }} />
            <span className="text-slate-400">الكاشير:</span>
            <strong className="text-white font-bold">{activeStaff?.name || authenticatedCashier.name}</strong>
            <span className="text-[11px] font-mono" style={{ color: store.secondary_color || '#F59E0B' }} dir="ltr">({activeStaff?.phone || authenticatedCashier.phone})</span>
          </div>

          {/* Permission Indicator */}
          <span
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
              activeStaff?.can_manual_input_phone
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            }`}
          >
            {activeStaff?.can_manual_input_phone ? '✏️ مسموح يدوي' : '📷 مسح إجباري 🔒'}
          </span>

          {/* Cashier Self-Service PIN Change Button */}
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
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse transition"
            title="تغيير الرقم السري الخاص بي"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>تغيير رمزي السري 🔑</span>
          </button>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-red-950/70 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/40 text-xs font-bold flex items-center space-x-1 rtl:space-x-reverse transition"
          >
            <LogOut className="w-3 h-3" />
            <span>خروج 🚪</span>
          </button>
        </div>
      </div>

      {/* 🛎️ Real-Time Floating Incoming Alert Toast */}
      {incomingAlert && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/10 border-2 border-amber-500/60 shadow-2xl flex items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center font-black text-lg shrink-0">
              🔔
            </div>
            <div className="min-w-0">
              <div className="text-sm font-black text-amber-300 flex items-center gap-2">
                <span className="truncate">{incomingAlert.title}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono shrink-0">
                  وصل للتو!
                </span>
              </div>
              <p className="text-xs text-white font-medium mt-0.5 truncate">{incomingAlert.detail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setActiveTab('orders');
                if (incomingAlert.type === 'booking') {
                  setOrdersSubTab('bookings');
                } else {
                  setOrdersSubTab('orders');
                }
                setIncomingAlert(null);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition shadow-lg shrink-0"
            >
              عرض الآن 👈
            </button>
            <button
              onClick={() => setIncomingAlert(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      

      {activeTab === 'scanner' && (
        <div className="animate-fade-in pb-24">
          
        <div className="space-y-6 max-w-xl mx-auto">
          
          {/* 🌟 HERO CARD: Unified Smart Single QR Scanner */}
          <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 border-slate-800 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 shadow-2xl">
            <div className="absolute top-0 left-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -ml-16 -mt-16"></div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 w-fit">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  ماسح ذكي موحد (Single QR Scanner) ⚡
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white pt-1">
                  مسح الباركود الذكي الفوري
                </h2>
                <p className="text-xs text-slate-400">
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
                backgroundColor: store.secondary_color || '#F59E0B',
                color: '#000000',
                boxShadow: `0 10px 30px -5px ${store.secondary_color || '#F59E0B'}60`,
              }}
              className="w-full py-5 sm:py-6 rounded-3xl font-black text-lg sm:text-xl flex items-center justify-center space-x-3 rtl:space-x-reverse transition-all duration-300 transform active:scale-98 group hover:brightness-110 shadow-2xl"
            >
              <Camera className="w-7 h-7 sm:w-8 sm:h-8 group-hover:scale-110 transition duration-300" />
              <span>افتح الكاميرا وامسح الباركود 📸</span>
            </button>

            {/* Features summary under scanner button */}
            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center space-x-2 rtl:space-x-reverse">
                <div className="w-7 h-7 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <strong className="text-white block text-[11px] truncate">باركود العميل</strong>
                  <span className="text-[10px] text-slate-400">طلب الفاتورة وإضافة النقاط</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center space-x-2 rtl:space-x-reverse">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <Flame className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <strong className="text-white block text-[11px] truncate">كوبون / هدية ترحيبية</strong>
                  <span className="text-[10px] text-slate-400">حرق فوري وتسليم الطلب</span>
                </div>
              </div>
            </div>

            {/* ✏️ Manual Input Fallback Bar */}
            <div className="pt-3 border-t border-slate-800/80">
              {activeStaff?.can_manual_input_phone ? (
                <form onSubmit={handleUnifiedManualSubmit} className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block flex items-center justify-between">
                    <span>✏️ خيار الإدخال اليدوي البديل (رقم الجوال أو رمز الكوبون):</span>
                    <span className="text-[10px] text-amber-400 font-mono">Manual Fallback</span>
                  </label>
                  <div className="flex space-x-2 rtl:space-x-reverse">
                    <input
                      type="text"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder="050XXXXXXX أو CPN-... أو WELCOME-..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-xs sm:text-sm font-mono text-white outline-none focus:border-amber-500 placeholder-slate-600 uppercase"
                    />
                    <button
                      type="submit"
                      disabled={loading || !manualInput.trim()}
                      className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-amber-500 hover:text-black text-amber-300 font-black text-xs border border-slate-700 transition disabled:opacity-50 flex items-center space-x-1 rtl:space-x-reverse shrink-0"
                    >
                      <Zap className="w-4 h-4" />
                      <span>تنفيذ ذكي</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center space-x-2 rtl:space-x-reverse text-[11px] text-slate-500 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
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
        const newOrders = liveOrders.filter(o => o.status === 'pending' || o.status === 'accepted');
        const prepOrders = liveOrders.filter(o => o.status === 'preparing');
        const readyOrders = liveOrders.filter(o => o.status === 'ready');
        const completedOrders = liveOrders.filter(o => o.status === 'completed' || o.status === 'cancelled');

        const displayedOrders = liveOrders.filter(order => {
          if (orderStatusFilter === 'new' && !(order.status === 'pending' || order.status === 'accepted')) return false;
          if (orderStatusFilter === 'preparing' && order.status !== 'preparing') return false;
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

        const pendingBookings = liveBookings.filter(b => b.status === 'pending');
        const confirmedBookings = liveBookings.filter(b => b.status === 'confirmed');
        const pastBookings = liveBookings.filter(b => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show');

        const displayedBookings = liveBookings.filter(bk => {
          if (bookingStatusFilter === 'pending' && bk.status !== 'pending') return false;
          if (bookingStatusFilter === 'confirmed' && bk.status !== 'confirmed') return false;
          if (bookingStatusFilter === 'past' && !(bk.status === 'completed' || bk.status === 'cancelled' || bk.status === 'no_show')) return false;

          if (orderSearchQuery.trim()) {
            const q = orderSearchQuery.toLowerCase().trim();
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
            
            {/* 🔘 Sub-Tab Selector & Live Sync Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/90 p-3 sm:p-4 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setOrdersSubTab('orders')}
                  className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition duration-200 ${
                    ordersSubTab === 'orders'
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Utensils className="w-4 h-4" />
                  <span>طلبات المنيو</span>
                  {newOrders.length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center animate-pulse">
                      {newOrders.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setOrdersSubTab('bookings')}
                  className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition duration-200 ${
                    ordersSubTab === 'bookings'
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>حجوزات الخدمات</span>
                  {pendingBookings.length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center animate-pulse">
                      {pendingBookings.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Quick Search & Manual Refresh */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="بحث برقم، اسم، جوال..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-8 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    LoyaltyService.getLiveStoreOrders(store.id).then(setLiveOrders);
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
            {/* TAB 1: MENU ORDERS (طلبات المنيو) */}
            {/* ══════════════════════════════════════════════ */}
            {ordersSubTab === 'orders' && (
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
                    الكل ({liveOrders.length})
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
                      const isNew = order.status === 'pending' || order.status === 'accepted';
                      const isPrep = order.status === 'preparing';
                      const isReady = order.status === 'ready';
                      const isDone = order.status === 'completed';
                      const isCancelled = order.status === 'cancelled';

                      return (
                        <div
                          key={order.id}
                          className={`bg-slate-900 rounded-3xl p-5 border flex flex-col justify-between shadow-xl transition duration-200 relative overflow-hidden ${
                            isNew
                              ? 'border-rose-500/60 shadow-rose-950/30 ring-1 ring-rose-500/30'
                              : isPrep
                              ? 'border-amber-500/50 shadow-amber-950/20'
                              : isReady
                              ? 'border-emerald-500/50 shadow-emerald-950/20'
                              : 'border-slate-800 opacity-80'
                          }`}
                        >
                          {/* Top Order Card Header */}
                          <div>
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black font-mono text-amber-400">
                                  #{order.order_number || String(order.id).slice(0, 6)}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-300 font-bold">
                                  {order.order_type === 'dine_in'
                                    ? `🍽️ محلي ${order.table_number ? `(طاولة ${order.table_number})` : ''}`
                                    : order.order_type === 'takeaway'
                                    ? '🥡 استلام سفري'
                                    : '🛵 توصيل'}
                                </span>
                              </div>

                              <span
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                                  isNew
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                                    : isPrep
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : isReady
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : isCancelled
                                    ? 'bg-slate-800 text-rose-400'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {isNew ? '🔴 طلب جديد' : isPrep ? '🟡 قيد التحضير' : isReady ? '🟢 جاهز للتسليم' : isCancelled ? '❌ ملغي' : '🏁 مكتمل'}
                              </span>
                            </div>

                            {/* Customer & Time Info */}
                            <div className="flex items-start justify-between mb-3 text-xs">
                              <div>
                                <div className="font-bold text-white text-sm">
                                  {order.customer_name || 'عميل المتجر'}
                                </div>
                                {order.customer_phone && (
                                  <a
                                    href={`tel:${order.customer_phone}`}
                                    className="text-slate-400 hover:text-amber-400 font-mono text-[11px] flex items-center gap-1 mt-0.5"
                                    dir="ltr"
                                  >
                                    <Phone className="w-3 h-3 text-slate-500" />
                                    {order.customer_phone}
                                  </a>
                                )}
                              </div>
                              <div className="text-left rtl:text-right">
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  {order.created_at
                                    ? new Date(order.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                                    : ''}
                                </span>
                                <span className="text-sm font-black font-mono text-emerald-400 block mt-0.5">
                                  {Number(order.total_price || 0).toFixed(2)} ر.س
                                </span>
                              </div>
                            </div>

                            {/* Items Breakdown */}
                            <div className="space-y-1.5 mb-4 bg-slate-950/90 p-3 rounded-2xl border border-slate-800/80">
                              {Array.isArray(order.items) && order.items.length > 0 ? (
                                order.items.map((it: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center text-xs">
                                    <div className="text-slate-300 min-w-0 pr-1">
                                      <strong className="text-amber-400 font-mono ml-1">{it.quantity || 1}x</strong>
                                      <span>{it.catalog_item?.name || it.name || 'صنف'}</span>
                                    </div>
                                    <span className="text-slate-500 font-mono text-[11px] shrink-0">
                                      {(Number(it.item_total_price || (it.price * (it.quantity || 1)) || 0)).toFixed(2)}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[11px] text-slate-500">تفاصيل الطلب غير متوفرة</div>
                              )}

                              {order.notes && (
                                <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-amber-300/90 bg-amber-500/10 p-2 rounded-xl border border-amber-500/20 leading-relaxed">
                                  <strong>ملاحظات:</strong> {order.notes}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-1 border-t border-slate-800/80 mt-auto">
                            {isNew && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => updateOrderStatus(order.id, 'preparing')}
                                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-lg shadow-blue-900/30 flex items-center justify-center gap-1.5"
                                >
                                  <ChefHat className="w-3.5 h-3.5" />
                                  <span>قبول وبدء التحضير</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                  className="px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition"
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
                                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-1.5"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>الطلب جاهز للاستلام 📦</span>
                              </button>
                            )}

                            {isReady && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(order.id, 'completed')}
                                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 border border-slate-700"
                              >
                                <Check className="w-4 h-4 text-emerald-400" />
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
            )}

            {/* ══════════════════════════════════════════════ */}
            {/* TAB 2: SERVICE BOOKINGS (حجوزات الخدمات) */}
            {/* ══════════════════════════════════════════════ */}
            {ordersSubTab === 'bookings' && (
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
                    الكل ({liveBookings.length})
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
                          <div>
                            {/* Booking Card Header */}
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
                              <span className="text-sm font-black font-mono text-amber-400">
                                #{bk.booking_number || String(bk.id).slice(0, 6)}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                  isPending
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                                    : isConfirmed
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                    : isCompleted
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : isNoShow
                                    ? 'bg-slate-800 text-amber-400'
                                    : 'bg-slate-800 text-rose-400'
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
                                <div className="font-bold text-white text-sm">{bk.customer_name || 'العميل'}</div>
                                {bk.customer_phone && (
                                  <a
                                    href={`tel:${bk.customer_phone}`}
                                    className="text-slate-400 hover:text-amber-400 font-mono text-[11px] flex items-center gap-1 mt-0.5"
                                    dir="ltr"
                                  >
                                    <Phone className="w-3 h-3 text-slate-500" />
                                    {bk.customer_phone}
                                  </a>
                                )}
                              </div>
                              <div className="text-sm font-black font-mono text-emerald-400">
                                {Number(bk.total_price || 0).toFixed(2)} ر.س
                              </div>
                            </div>

                            {/* Service Details Card */}
                            <div className="bg-slate-950/90 p-3 rounded-2xl border border-slate-800/80 space-y-1.5 mb-4">
                              <div className="text-xs text-white font-bold">{bk.service_name || 'خدمة'}</div>
                              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                                <span>مع: {bk.specialist_name || 'أي مختص متاح'}</span>
                                <span className="font-mono text-slate-300" dir="ltr">
                                  {bk.booking_date} • {bk.booking_time}
                                </span>
                              </div>

                              {bk.notes && (
                                <div className="text-[11px] text-amber-300/90 bg-amber-500/10 p-2 rounded-xl mt-2 border border-amber-500/20 leading-relaxed">
                                  <strong>ملاحظة العميل:</strong> {bk.notes}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Booking Action Buttons */}
                          <div className="flex gap-2 pt-1 border-t border-slate-800/80 mt-auto">
                            {isPending && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => updateBookingStatus(bk.id, 'confirmed')}
                                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-emerald-900/30"
                                >
                                  قبول وتأكيد ✅
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateBookingStatus(bk.id, 'cancelled')}
                                  className="flex-1 py-2.5 bg-rose-600/15 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl transition"
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
                                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-blue-900/30"
                                >
                                  حضر واكتمل 🏁
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateBookingStatus(bk.id, 'no_show')}
                                  className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-xs rounded-xl transition"
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

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
      <div className="fixed bottom-3 left-3 right-3 z-40 max-w-md mx-auto">
        <nav className="glass-dock rounded-3xl p-1.5 flex items-center justify-around shadow-[0_-8px_30px_rgba(0,0,0,0.4)] bg-slate-950/95 backdrop-blur-3xl border border-slate-800">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex-1 py-2 px-1 rounded-2xl text-[10px] sm:text-xs flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === 'scanner'
                ? 'font-black shadow-lg scale-105 bg-amber-500 text-black'
                : 'font-bold text-slate-400 hover:text-white hover:scale-105'
            }`}
          >
            <QrCode className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>الماسح</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-2 px-1 rounded-2xl text-[10px] sm:text-xs flex flex-col items-center gap-1 transition-all duration-300 relative ${
              activeTab === 'orders'
                ? 'font-black shadow-lg scale-105 bg-amber-500 text-black'
                : 'font-bold text-slate-400 hover:text-white hover:scale-105'
            }`}
          >
            <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>الطلبات</span>
            {(() => {
              const activeCount =
                liveOrders.filter(o => o.status === 'pending' || o.status === 'accepted' || o.status === 'preparing' || o.status === 'ready').length +
                liveBookings.filter(b => b.status === 'pending' || b.status === 'confirmed').length;
              return activeCount > 0 ? (
                <span className="absolute top-0 right-3 sm:right-5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm animate-pulse">
                  {activeCount}
                </span>
              ) : null;
            })()}
          </button>

          <button
            onClick={() => setActiveTab('rewards')}
            className={`flex-1 py-2 px-1 rounded-2xl text-[10px] sm:text-xs flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === 'rewards'
                ? 'font-black shadow-lg scale-105 bg-amber-500 text-black'
                : 'font-bold text-slate-400 hover:text-white hover:scale-105'
            }`}
          >
            <Gift className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>العروض</span>
          </button>
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
              className="absolute top-5 left-5 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700 transition"
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
              className="absolute top-5 left-5 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700 transition"
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
              className="absolute top-5 left-5 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700 transition"
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

    </div>
  );
};

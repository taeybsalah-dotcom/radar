import React, { useState, useEffect, useRef } from 'react';
import { Store, Customer, Tier, Privilege, DynamicQRToken, StoreStaff, CustomerCoupon } from '../types';
import { LoyaltyService, normalizePhone, getSupabaseClient } from '../lib/supabase';
import { QRScannerModal } from './QRScannerModal';
import { StaffLoginGate } from './StaffLoginGate';
import { NotificationBell } from './NotificationBell';
import { playBeepSound } from '../lib/sound';
import { LoyaltyEvents } from '../lib/events';
import {
  Camera,
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

  useEffect(() => {
    if (!store?.id) return;
    
    // Fetch initial orders
    LoyaltyService.getLiveStoreOrders(store.id).then(orders => setLiveOrders(orders));
    LoyaltyService.getLiveStoreBookings(store.id).then(bookings => setLiveBookings(bookings));

    // Listen to changes
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('live-orders-' + store.id)
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
            setLiveOrders(prev => [...prev, payload.new]);
            try { playBeepSound('success'); } catch(e){}
          } else if (payload.eventType === 'UPDATE') {
            setLiveOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
          } else if (payload.eventType === 'DELETE') {
            setLiveOrders(prev => prev.filter(o => o.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
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

  const updateBookingStatus = async (bookingId: string, status: 'completed' | 'cancelled' | 'confirmed' | 'no_show') => {
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

      setSuccessResult({
        message: `تم بنجاح إضافة ${res.pointsEarned} نقطة لرصيد العميل!`,
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

    // التحقق من الرمز المدخل مقارنة بـ store.admin_pin أو أي موظف بصلاحية admin
    const masterAdminPin = store.admin_pin || '9999';
    const adminStaff = staffList.filter((s) => s.role === 'admin');
    const isValidPin =
      enteredPin === masterAdminPin ||
      adminStaff.some((admin) => (admin.pin_code || '1234') === enteredPin);

    if (!isValidPin) {
      setManagerPinError('الرمز السري لمدير المتجر غير صحيح. لا يمكن اعتماد هذه الفاتورة الكبيرة دون موافقة الإدارة.');
      playBeepSound('error');
      return;
    }

    setIsSubmittingApproval(true);
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

    const expectedCurrentPin = effectiveStaff.pin_code || '1234';
    if (currentPin !== expectedCurrentPin) {
      setChangePinError('الرمز السري الحالي غير صحيح');
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
      await LoyaltyService.updateStoreStaff(effectiveStaff.id, {
        pin_code: newPin,
      });

      const updatedStaff = { ...effectiveStaff, pin_code: newPin };
      setAuthenticatedCashier(updatedStaff);
      setActiveStaff(updatedStaff);
      LoyaltyService.saveStaffSession(store.id, updatedStaff, store.slug);

      setStaffList(staffList.map((s) => (s.id === effectiveStaff.id ? updatedStaff : s)));

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
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
      
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

      {/* ========================================== */}
      {/* 🚀 LIVE ORDERS BOARD (Kitchen Display System) */}
      {/* ========================================== */}
      {liveBookings.length > 0 && (
        <div className="space-y-4 animate-fade-in mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              📅 حجوزات الخدمات
            </h2>
            <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold font-mono">
              {liveBookings.length} حجوزات
            </span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveBookings.map(bk => (
              <div key={bk.id} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                    <span className="text-sm font-bold font-mono text-amber-400">
                      #{bk.booking_number}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 font-bold">
                      {bk.status === 'confirmed' ? 'تأكيد وحضور' : bk.status === 'pending' ? 'في الانتظار' : bk.status}
                    </span>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-white">{bk.customer_name}</div>
                        <div className="text-xs text-slate-400">{bk.customer_phone}</div>
                      </div>
                      <div className="text-sm font-black font-mono text-emerald-400">
                        {bk.total_price} ر.س
                      </div>
                    </div>
                    
                    <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                      <div className="text-xs text-slate-300 font-bold">{bk.service_name}</div>
                      <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                        <span>مع: {bk.specialist_name || 'أي مختص'}</span>
                        <span dir="ltr">{bk.booking_date} {bk.booking_time}</span>
                      </div>
                    </div>
                    
                    {bk.notes && (
                      <div className="text-xs text-amber-300/80 bg-amber-500/10 p-2 rounded-xl mt-2 border border-amber-500/20 leading-relaxed">
                        <strong>ملاحظة العميل:</strong> {bk.notes}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 border-t border-slate-800 pt-3">
                  <button
                    onClick={() => updateBookingStatus(bk.id, 'completed')}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition"
                  >
                    حضر واكتمل ✅
                  </button>
                  <button
                    onClick={() => updateBookingStatus(bk.id, 'cancelled')}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                  >
                    إلغاء ❌
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {liveOrders.length > 0 && (
        <div className="space-y-4 animate-fade-in mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
              الطلبات النشطة
            </h2>
            <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold font-mono">
              {liveOrders.length} طلبات
            </span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveOrders.map(order => (
              <div key={order.id} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                    <span className="text-xs font-bold text-slate-400 font-mono">#{order.order_number}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      order.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                      order.status === 'preparing' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {order.status === 'pending' ? 'طلب جديد' : order.status === 'preparing' ? 'جاري التحضير' : 'جاهز للاستلام'}
                    </span>
                  </div>
                  <div className="mb-3">
                    <h3 className="font-bold text-white text-sm">{order.customer_name}</h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                      {order.order_type === 'dine_in' ? `محلي - طاولة ${order.table_number || ''}` : 
                       order.order_type === 'takeaway' ? 'استلام سفري' : 'توصيل'}
                    </p>
                  </div>
                  <div className="space-y-1 mb-4 bg-slate-950 p-2 rounded-xl border border-slate-800">
                    {order.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 truncate pl-2">{item.quantity}x {item.catalog_item?.name || item.name}</span>
                        <span className="text-slate-500 font-mono">{(item.item_total_price || (item.price * item.quantity) || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    {order.notes && (
                      <div className="mt-2 pt-2 border-t border-slate-800/50 text-[10px] text-amber-200/70 italic">
                        * {order.notes}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-auto">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'preparing')}
                      className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-900/20"
                    >
                      قبول وبدء التحضير
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-900/20"
                    >
                      الطلب جاهز للاستلام
                    </button>
                  )}
                  {order.status === 'ready' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'completed')}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                    >
                      إنهاء الطلب
                    </button>
                  )}
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold transition"
                    >
                      إلغاء
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main POS Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Section: 🎯 Unified Single QR Scanner Hero & Manual Input */}
        <div className="lg:col-span-7 space-y-6">
          
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

        {/* Right Section: 3. Dynamic Store Privileges & 4. Daily Redemption Inventory */}
        <div className="lg:col-span-5 space-y-6">
          
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

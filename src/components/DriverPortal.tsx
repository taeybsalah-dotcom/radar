import React, { useState, useEffect, useMemo } from 'react';
import {
  Store,
  StoreBranch,
  StoreDriver,
  WhatsAppOrderPayload,
  DriverWorkStatus,
} from '../types';
import { DriverService } from '../lib/driverService';
import { LoyaltyService } from '../lib/supabase';
import { LoyaltyEvents } from '../lib/events';
import { playBeepSound } from '../lib/sound';
import { DriverDoorstepPaymentModal } from './driver/DriverDoorstepPaymentModal';
import {
  Navigation,
  Car,
  Phone,
  MessageSquare,
  CheckCircle2,
  Clock,
  MapPin,
  CreditCard,
  DollarSign,
  AlertCircle,
  RefreshCw,
  Building2,
  User,
  Power,
  ChevronRight,
  Sparkles,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Lock,
  Coffee,
  Copy,
  Check,
} from 'lucide-react';

interface DriverPortalProps {
  store: Store;
  activeBranch?: StoreBranch | null;
  onClose?: () => void;
}

export const DriverPortal: React.FC<DriverPortalProps> = ({
  store,
  activeBranch: initialBranch,
  onClose,
}) => {
  // Brand Colors
  const brandPrimary = store?.primary_color || '#0F172A';
  const brandSecondary = store?.secondary_color || '#F59E0B';

  // Fixed/Locked Identity from URL Query Params or Merchant Link
  const queryDriverId = useMemo(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('driver') || '';
    }
    return '';
  }, []);

  const queryBranchId = useMemo(() => {
    if (typeof window !== 'undefined') {
      const b = new URLSearchParams(window.location.search).get('branch');
      return b && b !== 'ALL' ? b : '';
    }
    return '';
  }, []);

  // Branches
  const [branches, setBranches] = useState<StoreBranch[]>(store?.branches || []);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const qBranch = new URLSearchParams(window.location.search).get('branch');
      if (qBranch && qBranch !== 'ALL') return qBranch;
      const qDriver = new URLSearchParams(window.location.search).get('driver');
      if (qDriver && store?.id) {
        const allDrivers = DriverService.getDrivers(store.id);
        const match = allDrivers.find((d) => d.id === qDriver);
        if (match && match.branch_id) return match.branch_id;
      }
    }
    if (initialBranch?.id) return initialBranch.id;
    if (store?.branches && store.branches.length > 0) return store.branches[0].id;
    return 'b1';
  });

  // Drivers for the store
  const [drivers, setDrivers] = useState<StoreDriver[]>([]);
  const [activeDriverId, setActiveDriverId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const qDriver = new URLSearchParams(window.location.search).get('driver');
      if (qDriver) return qDriver;
      const cached = localStorage.getItem(`radar_active_driver_${store?.id}`);
      if (cached) return cached;
    }
    return '';
  });

  // Active Driver Object strictly identified
  const currentDriver = useMemo(() => {
    if (queryDriverId) {
      const found = drivers.find((d) => d.id === queryDriverId);
      if (found) return found;
    }
    if (activeDriverId) {
      const found = drivers.find((d) => d.id === activeDriverId);
      if (found) return found;
    }
    return drivers[0] || null;
  }, [drivers, queryDriverId, activeDriverId]);

  // Load and reload drivers with Supabase sync
  const reloadDrivers = () => {
    if (!store?.id) return;
    const allDrivers = DriverService.getDrivers(store.id);
    setDrivers(allDrivers);

    let target = queryDriverId
      ? allDrivers.find((d) => d.id === queryDriverId)
      : activeDriverId
      ? allDrivers.find((d) => d.id === activeDriverId)
      : allDrivers[0];

    if (target) {
      setActiveDriverId(target.id);
      localStorage.setItem(`radar_active_driver_${store?.id}`, target.id);
      if (target.branch_id) {
        setSelectedBranchId(target.branch_id);
        localStorage.setItem(`radar_driver_branch_${store?.id}`, target.branch_id);
      }
    }
  };

  useEffect(() => {
    if (store?.id) {
      DriverService.syncWithSupabase(store.id).then(() => {
        reloadDrivers();
      });
    }

    const unsub = LoyaltyEvents.listen((event) => {
      if (event.type === 'DRIVERS_UPDATED') {
        reloadDrivers();
      }
    });
    return () => unsub();
  }, [store?.id]);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'delivering' | 'pickup' | 'completed' | 'settlement'>('delivering');

  // Orders State
  const [driverOrders, setDriverOrders] = useState<{
    availableForPickup: WhatsAppOrderPayload[];
    activeDeliveries: WhatsAppOrderPayload[];
    completedToday: WhatsAppOrderPayload[];
  }>({
    availableForPickup: [],
    activeDeliveries: [],
    completedToday: [],
  });

  const [loadingOrders, setLoadingOrders] = useState(false);

  // Doorstep Payment Modal
  const [selectedOrderForDelivery, setSelectedOrderForDelivery] = useState<WhatsAppOrderPayload | null>(null);
  const [copiedAddressId, setCopiedAddressId] = useState<string | null>(null);

  const handleCopyAddress = (orderId: string, text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedAddressId(orderId);
      setTimeout(() => setCopiedAddressId(null), 2000);
      playBeepSound('notification');
    } catch {}
  };

  // Reload orders
  const reloadOrders = () => {
    if (!store?.id || !currentDriver) return;
    setLoadingOrders(true);
    const result = DriverService.getDriverOrders(store.id, currentDriver.id, selectedBranchId);
    setDriverOrders(result);
    setLoadingOrders(false);
  };

  useEffect(() => {
    reloadOrders();
  }, [store?.id, currentDriver?.id, selectedBranchId]);

  // Realtime event listener for instant order status sync
  useEffect(() => {
    const unsub = LoyaltyEvents.listen((event) => {
      if ((event as any).type === 'ORDER_STATUS_UPDATED' || (event as any).type === 'NEW_ORDER') {
        reloadOrders();
      }
    });
    return () => unsub();
  }, [store?.id, currentDriver?.id, selectedBranchId]);

  // 🔒 Offline Blocked Modal State (حماية السائق من التحول إلى أوفلاين مع وجود طلبات نشطة)
  const [offlineBlockedModal, setOfflineBlockedModal] = useState<{
    isOpen: boolean;
    activeOrdersCount: number;
    activeOrderNumbers: string[];
  }>({ isOpen: false, activeOrdersCount: 0, activeOrderNumbers: [] });

  // 🚨 Emergency Release Modal State (طلب إعفاء طارئ لتعذر التوصيل)
  const [emergencyReleaseModal, setEmergencyReleaseModal] = useState<{
    isOpen: boolean;
    order: WhatsAppOrderPayload | null;
    reason: string;
    notes: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    order: null,
    reason: 'عطل مفاجئ في الدراجة أو المركبة',
    notes: '',
    isSubmitting: false,
  });

  // Handle Driver Status Switch with Active Orders State Guard
  const toggleDriverStatus = () => {
    if (!currentDriver || !store?.id) return;
    if (currentDriver.status === 'available' || currentDriver.status === 'loading') {
      const check = DriverService.canDriverGoOffline(store.id, currentDriver.id);
      if (!check.canGoOffline) {
        setOfflineBlockedModal({
          isOpen: true,
          activeOrdersCount: check.activeOrdersCount,
          activeOrderNumbers: check.activeOrderNumbers,
        });
        playBeepSound('pos_order_alert');
        return;
      }
    }
    const newStatus: DriverWorkStatus = currentDriver.status === 'available' ? 'off_duty' : 'available';
    DriverService.setDriverStatus(store.id, currentDriver.id, newStatus);
    reloadDrivers();
    playBeepSound('notification');
  };

  // Handle Emergency Release Submission
  const handleEmergencyReleaseSubmit = async () => {
    if (!store?.id || !currentDriver || !emergencyReleaseModal.order) return;
    setEmergencyReleaseModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const reasonText = emergencyReleaseModal.notes.trim()
        ? `${emergencyReleaseModal.reason} - ${emergencyReleaseModal.notes.trim()}`
        : emergencyReleaseModal.reason;

      DriverService.requestDriverEmergencyRelease(
        store.id,
        currentDriver.id,
        emergencyReleaseModal.order.order_id,
        reasonText
      );

      playBeepSound('pos_order_alert');
      setEmergencyReleaseModal({
        isOpen: false,
        order: null,
        reason: 'عطل مفاجئ في الدراجة أو المركبة',
        notes: '',
        isSubmitting: false,
      });

      reloadOrders();
      reloadDrivers();
    } catch {
      setEmergencyReleaseModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Handle Pickup action
  const handlePickup = (order: WhatsAppOrderPayload) => {
    if (!store?.id || !currentDriver) return;
    DriverService.pickupOrder(store.id, order.order_id, currentDriver.id);
    playBeepSound('success');
    reloadOrders();
    setActiveTab('delivering');
  };

  // Handle Complete Delivery
  const handleConfirmDelivery = (
    method: 'cash' | 'card' | 'online_link',
    amount: number,
    notes?: string
  ) => {
    if (!store?.id || !currentDriver || !selectedOrderForDelivery) return;
    DriverService.deliverOrder(
      store.id,
      selectedOrderForDelivery.order_id,
      currentDriver.id,
      method,
      amount,
      notes
    );
    reloadOrders();
    reloadDrivers();
    setSelectedOrderForDelivery(null);
  };

  // Handle Auto-Break Toggle
  const toggleAutoBreak = (enabled: boolean) => {
    if (!store?.id || !currentDriver) return;
    DriverService.setAutoBreakAfterDelivery(store.id, currentDriver.id, enabled);
    reloadDrivers();
    playBeepSound('notification');
  };

  // Handle Depart all batched orders at once
  const handleDepartAllTripOrders = () => {
    if (!store?.id || !currentDriver) return;
    DriverService.departTrip(store.id, currentDriver.id);
    playBeepSound('success');
    reloadOrders();
    reloadDrivers();
    setActiveTab('delivering');
  };

  // Handle Driver Returned to Branch
  const handleReportReturned = () => {
    if (!store?.id || !currentDriver) return;
    DriverService.reportDriverReturned(store.id, currentDriver.id);
    playBeepSound('success');
    reloadDrivers();
    reloadOrders();
  };

  // Handle End Break
  const handleEndBreak = () => {
    if (!store?.id || !currentDriver) return;
    DriverService.setDriverStatus(store.id, currentDriver.id, 'available');
    playBeepSound('success');
    reloadDrivers();
    reloadOrders();
  };

  // Shift Settlement Data
  const shiftSettlement = useMemo(() => {
    if (!store?.id || !currentDriver) return null;
    return DriverService.getDriverShiftSettlement(store.id, currentDriver.id);
  }, [store?.id, currentDriver?.id, driverOrders]);

  // Active branch details
  const activeBranchName = useMemo(() => {
    const b = branches.find((item) => item.id === selectedBranchId);
    return b?.name || initialBranch?.name || 'الفرع الرئيسي';
  }, [branches, selectedBranchId, initialBranch]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-lg mx-auto shadow-2xl relative font-sans text-right select-none" dir="rtl">
      
      {/* 👑 Top App Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 p-4">
        <div className="flex items-center justify-between gap-3">
          
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-lg shrink-0">
              🛵
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-black text-white truncate">
                  {currentDriver?.name || 'كابتن التوصيل'}
                </h1>
                {currentDriver && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700 shrink-0">
                    {DriverService.getVehicleIcon(currentDriver.vehicle_type)} {currentDriver.plate_number || 'دباب'}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                <span className="truncate">{activeBranchName}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 font-medium">{store?.name}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions in Header */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                reloadOrders();
                playBeepSound('notification');
              }}
              title="تحديث الطلبات"
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition"
            >
              <RefreshCw className={`w-4 h-4 ${loadingOrders ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            {currentDriver && (
              <button
                onClick={toggleDriverStatus}
                title={currentDriver.status === 'available' ? 'إيقاف استقبال الطلبات' : 'تفعيل استقبال الطلبات'}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 border shadow-sm ${
                  currentDriver.status === 'available'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{currentDriver.status === 'available' ? 'متصل' : 'أوفلاين'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 🔒 Locked Driver Identity & Branch Info Card (هوية الكابتن والفرع مقفلة ومعتمدة) */}
        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-800/80 bg-slate-950/70 rounded-2xl px-3.5 py-2.5 border border-slate-800 shadow-inner">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center text-sm shrink-0 font-bold">
              🔒
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400 font-bold">كابتن معتمد:</span>
                <span className="text-xs text-amber-400 font-black truncate">{currentDriver?.name || 'كابتن التوصيل'}</span>
                <span className="text-[10px] text-slate-400 font-medium">({DriverService.getVehicleLabel(currentDriver?.vehicle_type || 'motorcycle')})</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-bold mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>الفرع المعتمد:</span>
                <span className="text-white font-extrabold">{activeBranchName}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-amber-400 shadow-sm flex items-center gap-1">
              <span>🔒 هوية مقفلة</span>
            </span>
            {currentDriver?.plate_number && (
              <span className="text-[10px] text-slate-400 font-mono font-bold">
                {currentDriver.plate_number}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* 🧭 Tabs Navigation Bar */}
      <div className="grid grid-cols-4 gap-1 p-2 bg-slate-900 border-b border-slate-800 sticky top-[115px] z-30 shadow-md">
        
        {/* Tab 1: Delivering */}
        <button
          onClick={() => {
            setActiveTab('delivering');
            playBeepSound('notification');
          }}
          className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 relative ${
            activeTab === 'delivering'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-1">
            <span>🛵 بالطريق</span>
            {driverOrders.activeDeliveries.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                activeTab === 'delivering' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500 text-slate-950'
              }`}>
                {driverOrders.activeDeliveries.length}
              </span>
            )}
          </div>
        </button>

        {/* Tab 2: Pickup Ready */}
        <button
          onClick={() => {
            setActiveTab('pickup');
            playBeepSound('notification');
          }}
          className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 relative ${
            activeTab === 'pickup'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-1">
            <span>📦 بالفرع</span>
            {driverOrders.availableForPickup.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                activeTab === 'pickup' ? 'bg-slate-950 text-amber-400' : 'bg-emerald-500 text-slate-950'
              }`}>
                {driverOrders.availableForPickup.length}
              </span>
            )}
          </div>
        </button>

        {/* Tab 3: Completed Today */}
        <button
          onClick={() => {
            setActiveTab('completed');
            playBeepSound('notification');
          }}
          className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 ${
            activeTab === 'completed'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-1">
            <span>✅ تم اليوم</span>
            <span className={`text-[10px] font-mono ${activeTab === 'completed' ? 'text-slate-950' : 'text-slate-500'}`}>
              ({driverOrders.completedToday.length})
            </span>
          </div>
        </button>

        {/* Tab 4: Shift Cash Settlement */}
        <button
          onClick={() => {
            setActiveTab('settlement');
            playBeepSound('notification');
          }}
          className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 ${
            activeTab === 'settlement'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>💵 العهدة</span>
        </button>
      </div>

      {/* 📦 Tab Content Body */}
      <main className="flex-1 p-3 sm:p-4 space-y-3 pb-24 overflow-y-auto">

        {/* 🚨 DRIVER OPERATIONAL STATUS BANNERS */}
        {currentDriver?.status === 'break' && (
          <div className="p-4 rounded-3xl bg-gradient-to-r from-orange-950/70 to-slate-900 border-2 border-orange-500/50 text-orange-200 space-y-3 shadow-xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                <Coffee className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-sm text-white">أنت في فترة استراحة حالياً (Break) ☕</h4>
                <p className="text-[11px] text-orange-300/80 mt-0.5">
                  حالتك مغلقة أمام الكاشير ولن تُسند إليك أي طلبات جديدة حتى تنهي الاستراحة.
                </p>
              </div>
            </div>
            <button
              onClick={handleEndBreak}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs shadow-lg transition flex items-center justify-center gap-1.5"
            >
              <span>🟢 إنهاء الاستراحة والعودة للعمل متاحاً</span>
            </button>
          </div>
        )}

        {currentDriver?.status === 'returning' && (
          <div className="p-4 rounded-3xl bg-gradient-to-r from-purple-950/70 to-slate-900 border-2 border-purple-500/50 text-purple-200 space-y-3 shadow-xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-purple-500/20 text-purple-300 flex items-center justify-center text-xl shrink-0">
                🛵💨
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-sm text-white">في طريق العودة إلى الفرع</h4>
                <p className="text-[11px] text-purple-300/80 mt-0.5">
                  أنهيت مشاويرك بنجاح! الوقت المقدر للوصول: ~{currentDriver.estimated_return_minutes || 10} دقيقة
                </p>
              </div>
            </div>
            <button
              onClick={handleReportReturned}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-black text-xs shadow-lg transition flex items-center justify-center gap-1.5"
            >
              <span>🏁 وصلت الفرع (جاهز لرحلة جديدة) 🟢</span>
            </button>
          </div>
        )}

        {currentDriver?.status === 'loading' && driverOrders.availableForPickup.length > 0 && (
          <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-950/70 to-slate-900 border-2 border-amber-500/50 text-amber-200 space-y-3 shadow-xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0">
                📦
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-sm text-white">
                  يتم تجهيز طلبات رحلتك بالفرع ({driverOrders.availableForPickup.length}/3)
                </h4>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  بإمكانك استلام كافة الطلبات والانطلاق بها دفعة واحدة لعملاء قريبين.
                </p>
              </div>
            </div>
            <button
              onClick={handleDepartAllTripOrders}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-1.5"
            >
              <span>🚀 انطلقت بكافة طلبات الرحلة ({driverOrders.availableForPickup.length} طلبات)</span>
            </button>
          </div>
        )}
        
        {/* ========================================= */}
        {/* TAB 1: ACTIVE DELIVERIES (ON THE ROAD)    */}
        {/* ========================================= */}
        {activeTab === 'delivering' && (
          <div className="space-y-3 animate-fade-in">

            {/* Auto Break After Trip Toggle */}
            {driverOrders.activeDeliveries.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                    <Coffee className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black text-white block">أخذ استراحة بعد تسليم هذا المشوار ☕</span>
                    <span className="text-[10px] text-slate-400 block truncate">
                      التحول تلقائياً إلى وضع (استراحة) بعد تسليم آخر طلب
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(currentDriver?.auto_break_after_delivery)}
                    onChange={(e) => toggleAutoBreak(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>
            )}
            {driverOrders.activeDeliveries.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl mx-auto text-slate-600">
                  🛵
                </div>
                <h3 className="text-sm font-bold text-slate-300">لا توجد طلبات قيد التوصيل حالياً</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  تفقد تبويب "بالفرع" لاستلام الطلبات الجاهزة والانطلاق بها إلى العميل.
                </p>
                {driverOrders.availableForPickup.length > 0 && (
                  <button
                    onClick={() => setActiveTab('pickup')}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg transition"
                  >
                    استلام {driverOrders.availableForPickup.length} طلب جاهز الآن 📦
                  </button>
                )}
              </div>
            ) : (
              driverOrders.activeDeliveries.map((order) => {
                const isPaid = order.payment_status === 'paid';
                const mapsUrl =
                  order.fulfillment_details?.delivery_gps_link ||
                  (order.fulfillment_details?.delivery_address
                    ? `https://maps.google.com/?q=${encodeURIComponent(order.fulfillment_details.delivery_address)}`
                    : null);

                return (
                  <div
                    key={order.order_id}
                    className="p-4 rounded-3xl bg-slate-900 border-2 border-amber-500/40 shadow-xl space-y-3 relative overflow-hidden"
                  >
                    {/* Top Order Badge & Amount */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                        <span className="font-mono font-black text-amber-400 text-sm">
                          #{order.order_id.slice(-6)}
                        </span>
                        {order.fulfillment_details?.trip_stop_index ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-black">
                            🚩 محطة #{order.fulfillment_details.trip_stop_index}
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                            جاري التوصيل 🛵
                          </span>
                        )}
                        {order.fulfillment_details?.delivery_distance_km !== undefined && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono font-bold">
                            📏 {Number(order.fulfillment_details.delivery_distance_km).toFixed(1)} كم
                          </span>
                        )}
                      </div>

                      <div className="text-left font-mono shrink-0">
                        <span className="text-lg font-black text-white">{Number(order.total_amount).toFixed(2)}</span>
                        <span className="text-[10px] text-slate-400 mr-1">ريال</span>
                      </div>
                    </div>

                    {/* Customer Info & Address */}
                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-amber-400" />
                          <span className="font-bold text-white text-xs">{order.customer_name}</span>
                        </div>
                        <span className="font-mono text-xs text-slate-300">{order.customer_phone}</span>
                      </div>

                      <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-900">
                        <div className="flex items-start gap-2 min-w-0">
                          <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-300 line-clamp-2">
                              {order.fulfillment_details?.delivery_address || 'عنوان العميل محدد عبر الـ GPS'}
                            </p>
                            {order.fulfillment_details?.general_notes && (
                              <p className="text-[11px] text-amber-300/80 mt-0.5 font-medium">
                                📝 ملاحظة: {order.fulfillment_details.general_notes}
                              </p>
                            )}
                          </div>
                        </div>
                        {order.fulfillment_details?.delivery_address && (
                          <button
                            type="button"
                            onClick={() => handleCopyAddress(order.order_id, order.fulfillment_details!.delivery_address!)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition shrink-0"
                            title="نسخ العنوان"
                          >
                            {copiedAddressId === order.order_id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quick Items Preview */}
                    <div className="text-xs text-slate-400 line-clamp-1">
                      <span className="text-slate-500">الأصناف: </span>
                      {order.items?.map((it: any) => `${it.quantity}x ${it.catalog_item?.name || it.name || it.item?.name || 'صنف'}`).join(' • ')}
                    </div>

                    {/* Payment Status Tag */}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-slate-400">حالة الدفع:</span>
                      {isPaid ? (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-black flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> مدفوع إلكترونياً
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-black flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> مطلوب تحصيل عند الباب
                        </span>
                      )}
                    </div>

                    {/* Action Buttons Bar */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {/* Navigation via Google Maps */}
                      <button
                        onClick={() => {
                          if (mapsUrl) {
                            window.open(mapsUrl, '_blank');
                          } else {
                            alert('لم يتم تحديد عنوان أو رابط خريطة لهذا الطلب');
                          }
                        }}
                        className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700"
                      >
                        <Navigation className="w-4 h-4 text-emerald-400" />
                        <span>الخريطة</span>
                      </button>

                      {/* Phone Call */}
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700"
                      >
                        <Phone className="w-4 h-4 text-sky-400" />
                        <span>اتصال</span>
                      </a>

                      {/* WhatsApp Message */}
                      <a
                        href={`https://wa.me/${order.customer_phone.replace(/^0/, '966').replace(/\D/g, '')}?text=${encodeURIComponent(
                          `مرحباً ${order.customer_name}، أنا كابتن التوصيل من متجر ${store.name}، أنا في طريقي إليك مع طلبك رقم #${order.order_id.slice(-6)} 🛵`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700"
                      >
                        <MessageSquare className="w-4 h-4 text-emerald-400" />
                        <span>واتساب</span>
                      </a>
                    </div>

                    {/* Main Action: Doorstep Payment & Delivery Confirmation */}
                    <button
                      onClick={() => {
                        setSelectedOrderForDelivery(order);
                        playBeepSound('notification');
                      }}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm shadow-xl transition flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>{isPaid ? 'تأكيد التسليم للعميل ✅' : 'تحصيل المبلغ وتسليم الطلب 💳'}</span>
                    </button>

                    {/* Emergency Release Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setEmergencyReleaseModal({
                          isOpen: true,
                          order,
                          reason: 'عطل مفاجئ في الدراجة أو المركبة',
                          notes: '',
                          isSubmitting: false,
                        });
                        playBeepSound('pos_order_alert');
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs transition border border-rose-500/25 flex items-center justify-center gap-1.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>تعذر إكمال التوصيل لظرف طارئ (إبلاغ الكاشير) ⚠️</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ========================================= */}
        {/* TAB 2: AVAILABLE FOR PICKUP AT BRANCH     */}
        {/* ========================================= */}
        {activeTab === 'pickup' && (
          <div className="space-y-3 animate-fade-in">
            {driverOrders.availableForPickup.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl mx-auto text-slate-600">
                  📦
                </div>
                <h3 className="text-sm font-bold text-slate-300">لا توجد طلبات جديدة بانتظار الاستلام</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  أي طلب توصيل جديد يصدر من الكاشير أو ينتهي من المطبخ سيظهر هنا فوراً.
                </p>
              </div>
            ) : (
              <>
                {driverOrders.availableForPickup.length > 1 && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 shadow-md">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🛵</span>
                      <div>
                        <span className="text-xs font-black text-amber-300 block">
                          لديك {driverOrders.availableForPickup.length} طلبات جاهزة بالفرع
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          تجميع في رحلة مشتركة واحدة
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleDepartAllTripOrders}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow transition shrink-0"
                    >
                      🚀 انطلاق الكل
                    </button>
                  </div>
                )}
                {driverOrders.availableForPickup.map((order) => {
                const isPaid = order.payment_status === 'paid';
                return (
                  <div
                    key={order.order_id}
                    className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 relative"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-amber-400 text-sm">
                          #{order.order_id.slice(-6)}
                        </span>
                        {order.status === 'preparing' ? (
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1 animate-pulse">
                            <span>🍳 جاري التحضير بالمطبخ</span>
                          </span>
                        ) : order.status === 'ready' ? (
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                            <span>✅ جاهز للاستلام الفوري</span>
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                            بانتظار الاستلام 📦
                          </span>
                        )}
                      </div>

                      <div className="text-left font-mono">
                        <span className="text-lg font-black text-white">{Number(order.total_amount).toFixed(2)}</span>
                        <span className="text-[10px] text-slate-400 mr-1">ريال</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1 text-xs">
                      <div className="flex items-center justify-between text-white font-bold">
                        <span>{order.customer_name}</span>
                        <span className="font-mono text-slate-400">{order.customer_phone}</span>
                      </div>
                      <div className="text-slate-400 text-[11px] truncate">
                        📍 {order.fulfillment_details?.delivery_address || 'عنوان العميل محدد عبر الـ GPS'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>الأصناف ({order.items?.length || 0}):</span>
                      <span className="truncate max-w-[200px] text-slate-300">
                        {order.items?.map((it: any) => it.catalog_item?.name || it.name || it.item?.name || 'صنف').join('، ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handlePickup(order)}
                        className={`flex-1 py-3 rounded-2xl font-black text-xs sm:text-sm shadow-xl transition flex items-center justify-center gap-2 ${
                          order.status === 'preparing'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500 hover:text-slate-950'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        }`}
                      >
                        <Car className="w-4 h-4" />
                        <span>
                          {order.status === 'preparing'
                            ? 'استلام مبكر والانطلاق 🛵 (قيد التجهيز)'
                            : 'استلام الطلب والانطلاق 🛵'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEmergencyReleaseModal({
                            isOpen: true,
                            order,
                            reason: 'عطل مفاجئ في الدراجة أو المركبة',
                            notes: '',
                            isSubmitting: false,
                          });
                          playBeepSound('pos_order_alert');
                        }}
                        className="py-3 px-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 font-bold text-xs transition flex items-center justify-center shrink-0"
                        title="اعتذار طارئ عن استلام هذا الطلب"
                      >
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                        <span className="text-[11px] font-bold mr-1">اعتذار طارئ</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              </>
            )}
          </div>
        )}

        {/* ========================================= */}
        {/* TAB 3: COMPLETED DELIVERIES TODAY         */}
        {/* ========================================= */}
        {activeTab === 'completed' && (
          <div className="space-y-3 animate-fade-in">
            {driverOrders.completedToday.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl mx-auto text-slate-600">
                  📋
                </div>
                <h3 className="text-sm font-bold text-slate-300">لم تُسلّم أي طلبات اليوم بعد</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  كل طلب يتم تسليمه بنجاح سيُسجل في سجلك اليومي هنا لحساب العهدة والأرباح.
                </p>
              </div>
            ) : (
              driverOrders.completedToday.map((order) => (
                <div
                  key={order.order_id}
                  className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-white">#{order.order_id.slice(-6)}</span>
                        <span className="text-[10px] text-slate-400 truncate">({order.customer_name})</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        طريقة التحصيل: {order.driver_payment_method === 'cash' ? '💵 كاش' : order.driver_payment_method === 'card' ? '💳 شبكة' : '📱 أونلاين'}
                      </div>
                    </div>
                  </div>

                  <div className="text-left font-mono shrink-0">
                    <span className="font-bold text-emerald-400 text-sm">+{Number(order.total_amount).toFixed(2)}</span>
                    <span className="text-[10px] text-slate-500 mr-1">ريال</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ========================================= */}
        {/* TAB 4: SHIFT CASH SETTLEMENT (العهدة المالية) */}
        {/* ========================================= */}
        {activeTab === 'settlement' && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-sm">ملخص عهدة الوردية اليومية</h3>
                    <span className="text-[10px] text-slate-400">{new Date().toLocaleDateString('ar-SA')}</span>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black">
                  {shiftSettlement?.delivered_orders_count || 0} طلبات مسلمة
                </span>
              </div>

              {/* Cash in Hand to Turn in */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                <span className="text-xs text-amber-300 font-bold">إجمالي الكاش النقدي في حوزتك (واجب توريده لكاشير الفرع):</span>
                <div className="text-3xl font-black text-amber-400 font-mono">
                  {(shiftSettlement?.total_cash_collected || 0).toFixed(2)}{' '}
                  <span className="text-xs font-normal text-amber-200">ريال</span>
                </div>
              </div>

              {/* Financial Breakdown Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[11px]">تحصيلات شبكة / بطاقات:</span>
                  <div className="font-bold text-white font-mono text-sm">
                    {(shiftSettlement?.total_card_collected || 0).toFixed(2)} ريال
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[11px]">مدفوعات أونلاين مسبقة:</span>
                  <div className="font-bold text-white font-mono text-sm">
                    {(shiftSettlement?.total_online_collected || 0).toFixed(2)} ريال
                  </div>
                </div>
              </div>

              {/* Commission Earnings for Driver */}
              {Number(currentDriver?.commission_per_order) > 0 && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-emerald-300 font-bold block">مستحقاتك وعمولتك اليوم:</span>
                    <span className="text-[10px] text-emerald-400/80">
                      ({currentDriver.commission_per_order} ريال لكل طلب مكتمل)
                    </span>
                  </div>
                  <div className="text-lg font-black text-emerald-400 font-mono">
                    {((shiftSettlement?.delivered_orders_count || 0) * (currentDriver.commission_per_order || 0)).toFixed(2)} ريال
                  </div>
                </div>
              )}

              {/* Settle Shift Button */}
              <button
                onClick={() => {
                  if (!store?.id || !currentDriver) return;
                  const confirm = window.confirm('هل تريد تأكيد تسليم العهدة النقدية لكاشير الفرع وإغلاق الوردية الحالية؟');
                  if (confirm) {
                    DriverService.settleDriverShift(store.id, currentDriver.id);
                    playBeepSound('success');
                    alert('تم تسجيل تسليم العهدة النقدية بنجاح للكاشير! شكراً لجهودك.');
                    reloadOrders();
                  }
                }}
                className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition border border-slate-700 flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>تسليم العهدة النقدية لكاشير الفرع وتصفية الوردية</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* 💳 Doorstep Payment & Delivery Modal */}
      {selectedOrderForDelivery && (
        <DriverDoorstepPaymentModal
          isOpen={Boolean(selectedOrderForDelivery)}
          onClose={() => setSelectedOrderForDelivery(null)}
          order={selectedOrderForDelivery}
          onConfirmDelivery={handleConfirmDelivery}
        />
      )}

      {/* 🔒 Offline Blocked Warning Modal */}
      {offlineBlockedModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border-2 border-amber-500/50 p-5 space-y-4 shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl mx-auto shadow-inner">
              🔒
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-black text-white">
                تعذر إيقاف الاتصال (أوفلاين)
              </h3>
              <p className="text-xs text-amber-300 font-bold">
                لديك حالياً {offlineBlockedModal.activeOrdersCount} طلبات نشطة مرتبطة بحسابك
              </p>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-amber-400 font-bold">
                أرقام الطلبات: #{offlineBlockedModal.activeOrderNumbers.join(' • #')}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                لحماية تجربة العميل وضمان سرعة التوصيل، يجب تسليم كافة الطلبات للعملاء أولاً قبل تسجيل الخروج. في حال وجود ظرف قاهر يمنعك من التوصيل، يرجى الضغط على زر <span className="text-rose-400 font-bold">"اعتذار طارئ"</span> على الطلب لإشعار الكاشير فوراً.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOfflineBlockedModal({ isOpen: false, activeOrdersCount: 0, activeOrderNumbers: [] })}
              className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg"
            >
              فهمت ذلك، سأتابع توصيل الطلبات 👍
            </button>
          </div>
        </div>
      )}

      {/* 🚨 Emergency Release Modal */}
      {emergencyReleaseModal.isOpen && emergencyReleaseModal.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-rose-500/60 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl shrink-0 font-black shadow-inner">
                🚨
              </div>
              <div>
                <h3 className="text-sm font-black text-white">
                  طلب إعفاء طارئ عن الطلب #{emergencyReleaseModal.order.order_id.slice(-6)}
                </h3>
                <span className="text-[11px] text-rose-300 font-bold">
                  إلغاء الإسناد وإعادة الطلب لكاشير الفرع فوراً
                </span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 space-y-1">
              <span className="font-bold flex items-center gap-1 text-rose-300">
                <AlertCircle className="w-3.5 h-3.5" />
                تنبيه تشغيلي مهم:
              </span>
              <p className="text-[11px] leading-relaxed text-rose-200/90">
                سيتم إرسال إشعار إنذار فوري لشاشة الكاشير لسحب الطلب وإسناده لكابتن آخر بالفرع لتفادي تأخير العميل، كما سيتم تحويل حالتك إلى (أوفلاين) مؤقتاً لحين معالجة الظرف.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-bold block">
                حدد سبب تعذر التوصيل:
              </label>
              <select
                value={emergencyReleaseModal.reason}
                onChange={(e) => setEmergencyReleaseModal((prev) => ({ ...prev, reason: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 font-bold"
              >
                <option value="عطل مفاجئ في الدراجة أو المركبة">🛵 عطل مفاجئ في الدراجة أو المركبة (إطار، بنزين، محرك)</option>
                <option value="حادث مروري أو تعطل الحركة المرورية">🚗 حادث مروري أو زحام شديد يمنع الوصول</option>
                <option value="ظرف صحي طارئ للكابتن">🤒 ظرف صحي طارئ للكابتن</option>
                <option value="تلف أو مشكلة في محتويات الطلب">📦 مشكلة أو تلف في محتويات الطلب</option>
                <option value="العميل لا يجيب أو العنوان غير صحيح">📞 تعذر الوصول للعميل (لا يجيب نهائياً)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 block font-bold">
                ملاحظات إضافية للكاشير (اختياري):
              </label>
              <textarea
                value={emergencyReleaseModal.notes}
                onChange={(e) => setEmergencyReleaseModal((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="اكتب توضيحاً سريعاً يساعد الكاشير..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEmergencyReleaseModal({ isOpen: false, order: null, reason: 'عطل مفاجئ في الدراجة أو المركبة', notes: '', isSubmitting: false })}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                تراجع وإلغاء
              </button>

              <button
                type="button"
                disabled={emergencyReleaseModal.isSubmitting}
                onClick={handleEmergencyReleaseSubmit}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {emergencyReleaseModal.isSubmitting ? (
                  <span>جاري الإرسال...</span>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    <span>تأكيد الإعفاء وإشعار الكاشير 🚨</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

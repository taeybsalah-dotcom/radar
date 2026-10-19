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

  // Drivers for the selected branch
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

  // Active Driver Object
  const currentDriver = useMemo(() => {
    return drivers.find((d) => d.id === activeDriverId) || drivers[0] || null;
  }, [drivers, activeDriverId]);

  // Load and reload drivers
  const reloadDrivers = () => {
    if (!store?.id) return;
    let list = DriverService.getDrivers(store.id, selectedBranchId);
    if (activeDriverId && !list.some((d) => d.id === activeDriverId)) {
      const allDrivers = DriverService.getDrivers(store.id);
      const match = allDrivers.find((d) => d.id === activeDriverId);
      if (match) {
        if (match.branch_id && match.branch_id !== selectedBranchId) {
          setSelectedBranchId(match.branch_id);
          list = DriverService.getDrivers(store.id, match.branch_id);
        } else {
          list = allDrivers;
        }
      }
    }
    setDrivers(list);
    if (!activeDriverId && list.length > 0) {
      setActiveDriverId(list[0].id);
    }
  };

  useEffect(() => {
    reloadDrivers();
  }, [store?.id, selectedBranchId]);

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

  // Handle Driver Status Switch
  const toggleDriverStatus = () => {
    if (!currentDriver || !store?.id) return;
    const newStatus: DriverWorkStatus = currentDriver.status === 'available' ? 'off_duty' : 'available';
    DriverService.setDriverStatus(store.id, currentDriver.id, newStatus);
    reloadDrivers();
    playBeepSound('notification');
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

        {/* Driver & Branch Quick Selectors Bar (if multiple exist) */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1 font-bold">الفرع المربوط به:</label>
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                localStorage.setItem(`radar_driver_branch_${store?.id}`, e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  🏢 {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 font-bold">حساب الكابتن الحالي:</label>
            <select
              value={activeDriverId}
              onChange={(e) => {
                setActiveDriverId(e.target.value);
                localStorage.setItem(`radar_active_driver_${store?.id}`, e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-amber-400 font-bold focus:outline-none focus:border-amber-500"
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  👤 {d.name} ({DriverService.getVehicleLabel(d.vehicle_type)})
                </option>
              ))}
            </select>
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
        
        {/* ========================================= */}
        {/* TAB 1: ACTIVE DELIVERIES (ON THE ROAD)    */}
        {/* ========================================= */}
        {activeTab === 'delivering' && (
          <div className="space-y-3 animate-fade-in">
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
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
                        <span className="font-mono font-black text-amber-400 text-sm">
                          #{order.order_id.slice(-6)}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                          جاري التوصيل 🛵
                        </span>
                      </div>

                      <div className="text-left font-mono">
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

                      <div className="flex items-start gap-2 pt-1 border-t border-slate-900">
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
              driverOrders.availableForPickup.map((order) => {
                const isPaid = order.payment_status === 'paid';
                return (
                  <div
                    key={order.order_id}
                    className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 relative"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-amber-400 text-sm">
                          #{order.order_id.slice(-6)}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                          جاهز بالفرع 📦
                        </span>
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

                    <button
                      onClick={() => handlePickup(order)}
                      className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl transition flex items-center justify-center gap-2"
                    >
                      <span>🛵 استلام الطلب والانطلاق بالتوصيل</span>
                    </button>
                  </div>
                );
              })
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

    </div>
  );
};

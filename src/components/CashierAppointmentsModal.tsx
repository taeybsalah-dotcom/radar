import React, { useState, useMemo, useEffect } from 'react';
import { Store, StoreBranch, StoreStaff, ServiceBooking, StoreSpecialist, CatalogItem, Customer } from '../types';
import { LoyaltyService } from '../lib/supabase';
import { playBeepSound } from '../lib/sound';
import {
  Calendar,
  Clock,
  User,
  Phone,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  ShoppingCart,
  Send,
  Filter,
  Sparkles,
  Scissors,
  Check,
  RotateCcw,
  UserCheck,
  Plus,
  PhoneCall,
  Lock,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
} from 'lucide-react';

interface CashierAppointmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
  activeBranch: StoreBranch | null;
  activeStaff: StoreStaff;
  specialists: StoreSpecialist[];
  bookings: ServiceBooking[];
  catalogItems?: CatalogItem[];
  onCheckInBooking: (booking: ServiceBooking) => void;
  onRefreshBookings?: () => void;
}

const STANDARD_TIME_SLOTS = [
  '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30',
  '22:00', '22:30', '23:00'
];

export const CashierAppointmentsModal: React.FC<CashierAppointmentsModalProps> = ({
  isOpen,
  onClose,
  store,
  activeBranch,
  activeStaff,
  specialists,
  bookings,
  catalogItems = [],
  onCheckInBooking,
  onRefreshBookings,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'timetable'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'today' | 'tomorrow' | 'all'>('today');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // 📞 New In-Store / Phone Call Booking Modal State
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newServiceId, setNewServiceId] = useState('');
  const [newSpecialistId, setNewSpecialistId] = useState('');
  const [newBookingDate, setNewBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newBookingTime, setNewBookingTime] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isSavingBooking, setIsSavingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [lastCreatedBooking, setLastCreatedBooking] = useState<ServiceBooking | null>(null);
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null);

  // Available Services
  const servicesList = useMemo(() => {
    return catalogItems.filter((it) => it.item_type === 'service' || !it.item_type);
  }, [catalogItems]);

  useEffect(() => {
    if (servicesList.length > 0 && !newServiceId) {
      setNewServiceId(servicesList[0].id);
    }
  }, [servicesList, newServiceId]);

  // Lookup customer by phone when typing in new booking form
  useEffect(() => {
    const clean = newPhone.trim();
    if (clean.length >= 9) {
      LoyaltyService.getCustomer(store.id, clean)
        .then((cust: Customer | null) => {
          if (cust) {
            setMatchedCustomer(cust);
            if (!newName.trim() && cust.name) {
              setNewName(cust.name);
            }
          } else {
            setMatchedCustomer(null);
          }
        })
        .catch(() => setMatchedCustomer(null));
    } else {
      setMatchedCustomer(null);
    }
  }, [newPhone, store.id]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // Filter Bookings for List View (Hook must be declared unconditionally before any early return)
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (activeBranch?.id && b.branch_id && b.branch_id !== activeBranch.id) {
        return false;
      }
      if (selectedDateFilter === 'today' && b.booking_date !== todayStr) {
        return false;
      }
      if (selectedDateFilter === 'tomorrow' && b.booking_date !== tomorrowStr) {
        return false;
      }
      if (selectedStatusFilter !== 'all' && b.status !== selectedStatusFilter) {
        return false;
      }
      if (selectedSpecialistId !== 'all') {
        if (b.specialist_id !== selectedSpecialistId) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (b.customer_name || '').toLowerCase().includes(q);
        const matchPhone = (b.customer_phone || '').includes(q);
        const matchNum = (b.booking_number || '').toLowerCase().includes(q);
        const matchService = (b.service_name || '').toLowerCase().includes(q);
        const matchSpec = (b.specialist_name || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchNum && !matchService && !matchSpec) {
          return false;
        }
      }
      return true;
    });
  }, [
    bookings,
    activeBranch,
    selectedDateFilter,
    selectedStatusFilter,
    selectedSpecialistId,
    searchQuery,
    todayStr,
    tomorrowStr,
  ]);

  // Early return if modal is not open (AFTER all hooks)
  if (!isOpen) return null;

  // Statistics
  const todayCount = bookings.filter((b) => b.booking_date === todayStr).length;
  const pendingCount = bookings.filter((b) => b.status === 'pending').length;
  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length;
  const completedCount = bookings.filter((b) => b.status === 'completed').length;

  // 🛡️ Live Slot Conflict Checker (مانع التضارب الحي)
  const checkSlotStatus = (date: string, time: string, specialistId?: string | null) => {
    if (specialistId && specialistId !== 'all') {
      const existing = bookings.find(
        (b) =>
          b.status !== 'cancelled' &&
          b.status !== 'no_show' &&
          b.booking_date === date &&
          b.booking_time === time &&
          (b.specialist_id === specialistId || !b.specialist_id)
      );
      if (existing) {
        return {
          isBusy: true,
          booking: existing,
          label: 'مشغول 🔒',
          customerName: existing.customer_name,
          customerPhone: existing.customer_phone,
          serviceName: existing.service_name,
          source:
            existing.booking_source ||
            (existing.customer_notes?.includes('حجز هاتف') ? 'phone_call' : 'customer_app'),
        };
      }
      return { isBusy: false, booking: null, label: 'متاح ✨' };
    }

    // Unspecified or all specialists:
    const activeWorkingSpecs = specialists.filter((s) => s.is_active !== false);
    const bookedList = bookings.filter(
      (b) =>
        b.status !== 'cancelled' &&
        b.status !== 'no_show' &&
        b.booking_date === date &&
        b.booking_time === time
    );
    const isFullyBooked = activeWorkingSpecs.length > 0 && bookedList.length >= activeWorkingSpecs.length;
    return {
      isBusy: isFullyBooked,
      booking: bookedList[0] || null,
      label: isFullyBooked ? 'مشغول بالكامل 🔒' : `${Math.max(1, activeWorkingSpecs.length - bookedList.length)} متاح ✨`,
    };
  };

  // Handle Quick Status Change
  const handleUpdateStatus = async (
    bookingId: string,
    nextStatus: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
  ) => {
    setUpdatingId(bookingId);
    try {
      await LoyaltyService.updateServiceBookingStatus(
        bookingId,
        nextStatus,
        activeStaff.name,
        activeBranch?.id || null,
        activeBranch?.name || null
      );
      playBeepSound('success');
      if (onRefreshBookings) onRefreshBookings();
    } catch (err) {
      console.error('Failed to update booking status', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Open WhatsApp Link
  const handleOpenWhatsApp = (booking: ServiceBooking) => {
    const url = LoyaltyService.generateMerchantBookingStatusWhatsAppUrl(
      booking,
      store.name,
      booking.status
    );
    window.open(url, '_blank');
  };

  // Submit New Booking from Cashier (Phone Call / Walk-in)
  const handleCreateNewBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) {
      setBookingError('يرجى إدخال رقم جوال العميل');
      return;
    }
    if (!newName.trim()) {
      setBookingError('يرجى إدخال اسم العميل');
      return;
    }
    if (!newBookingTime) {
      setBookingError('يرجى اختيار وقت الموعد');
      return;
    }

    // Check conflict
    const slotCheck = checkSlotStatus(newBookingDate, newBookingTime, newSpecialistId);
    if (slotCheck.isBusy) {
      setBookingError(`عفواً! وقت الساعة (${newBookingTime}) محجوز مسبقاً لهذا المختص. يرجى اختيار وقت آخر متاح.`);
      return;
    }

    const selectedService = servicesList.find((s) => s.id === newServiceId) || servicesList[0];
    const selectedSpec = specialists.find((s) => s.id === newSpecialistId);

    setIsSavingBooking(true);
    setBookingError(null);

    try {
      const bookingNumber = `BK-${Date.now().toString().slice(-5)}`;
      const price = Number(selectedService?.price || 0);
      const duration = Number(selectedService?.duration_minutes || 30);

      const bookingPayload: any = {
        store_id: store.id,
        store_name: store.name,
        branch_id: activeBranch?.id || null,
        branch_name: activeBranch?.name || 'الفرع الرئيسي',
        booking_number: bookingNumber,
        customer_id: matchedCustomer?.id || `phone-cust-${Date.now()}`,
        customer_name: newName.trim(),
        customer_phone: newPhone.trim(),
        service_id: selectedService?.id || `srv-${Date.now()}`,
        service_name: selectedService?.name || 'خدمة',
        service_price: price,
        total_price: price,
        service_duration_minutes: duration,
        duration_minutes: duration,
        specialist_id: selectedSpec ? selectedSpec.id : null,
        specialist_name: selectedSpec ? selectedSpec.name : null,
        booking_date: newBookingDate,
        booking_time: newBookingTime,
        booking_source: 'phone_call', // 📞 مصدر الحجز: اتصال هاتفي بالكاشير
        status: 'confirmed', // حجز الكاشير المباشر مؤكد فوراً
        notes: newNotes.trim() ? `[حجز هاتف للكاشير: ${activeStaff.name}] ${newNotes.trim()}` : `[حجز هاتف للكاشير: ${activeStaff.name}]`,
        loyalty_points_earned: Math.floor(price * (store.points_per_riyal || 1)),
      };

      const created = await LoyaltyService.createServiceBooking(bookingPayload);
      setLastCreatedBooking(created);
      if (onRefreshBookings) onRefreshBookings();
    } catch (err: any) {
      console.error('Failed to create booking', err);
      setBookingError(err.message || 'حدث خطأ أثناء حفظ الموعد');
    } finally {
      setIsSavingBooking(false);
    }
  };

  const handleOpenNewBookingForSlot = (specId?: string, time?: string) => {
    if (specId) setNewSpecialistId(specId);
    if (time) setNewBookingTime(time);
    setNewBookingDate(selectedDateFilter === 'tomorrow' ? tomorrowStr : todayStr);
    setBookingError(null);
    setLastCreatedBooking(null);
    setIsNewBookingOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fade-in" dir="rtl">
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>جدول المواعيد والحجوزات</span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {filteredBookings.length} موعد
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                مزامنة حية مانعة للتضارب بين تطبيق العميل والكاشير والهاتف 💇‍♂️
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher: List vs Timetable */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center text-xs">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                  viewMode === 'list'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>قائمة</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('timetable')}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                  viewMode === 'timetable'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>جدول الفترات (Timeline)</span>
              </button>
            </div>

            {/* + New Booking Button */}
            <button
              type="button"
              onClick={() => {
                setBookingError(null);
                setLastCreatedBooking(null);
                setNewBookingTime('');
                setIsNewBookingOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-black text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>حجز موعد جديد 📞</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:px-5 bg-slate-950/40 border-b border-slate-800/60 shrink-0 text-xs">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
            <span className="text-slate-400 font-medium">مواعيد اليوم</span>
            <span className="font-black text-white font-mono text-sm">{todayCount}</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
            <span className="text-amber-400 font-medium">بانتظار التأكيد</span>
            <span className="font-black text-amber-400 font-mono text-sm">{pendingCount}</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
            <span className="text-emerald-400 font-medium">حجوزات مؤكدة</span>
            <span className="font-black text-emerald-400 font-mono text-sm">{confirmedCount}</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
            <span className="text-blue-400 font-medium">مكتملة ومحاسبة</span>
            <span className="font-black text-blue-400 font-mono text-sm">{completedCount}</span>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="p-3 sm:px-5 bg-slate-900 border-b border-slate-800/80 space-y-2.5 shrink-0">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ابحث باسم العميل، الجوال، رقم الحجز، أو الخدمة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Specialist Dropdown */}
            {specialists.length > 0 && (
              <div className="sm:w-56">
                <select
                  value={selectedSpecialistId}
                  onChange={(e) => setSelectedSpecialistId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="all">✂️ جميع المختصين ({specialists.length})</option>
                  {specialists.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.name} {spec.specialty ? `(${spec.specialty})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Date Filters */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedDateFilter('today')}
                className={`px-3 py-1 rounded-lg font-bold transition ${
                  selectedDateFilter === 'today'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                اليوم 📅
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateFilter('tomorrow')}
                className={`px-3 py-1 rounded-lg font-bold transition ${
                  selectedDateFilter === 'tomorrow'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                غداً ⏭️
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold transition ${
                  selectedDateFilter === 'all'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل 🗂️
              </button>
            </div>

            {/* Status Filters */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  selectedStatusFilter === 'all'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('pending')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  selectedStatusFilter === 'pending'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                انتظار ⏳
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('confirmed')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  selectedStatusFilter === 'confirmed'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                مؤكدة ✅
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('completed')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  selectedStatusFilter === 'completed'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                مكتملة 🏁
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════ */}
        {/* VIEW 1: CARD LIST VIEW (العرض كقائمة بطاقات)           */}
        {/* ══════════════════════════════════════════════════════ */}
        {viewMode === 'list' && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 custom-scrollbar">
            {filteredBookings.length === 0 ? (
              <div className="text-center py-14 space-y-3 bg-slate-950/40 border border-slate-800/80 rounded-3xl">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto">
                  <Calendar className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-white">لا توجد مواعيد تطابق التصفية المحددة</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  يمكنك حجز موعد جديد مباشرة عبر زر <strong>حجز موعد جديد 📞</strong> في الأعلى.
                </p>
              </div>
            ) : (
              filteredBookings.map((b) => {
                const isToday = b.booking_date === todayStr;
                const statusColor =
                  b.status === 'confirmed'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : b.status === 'in_progress'
                    ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                    : b.status === 'pending'
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
                    : b.status === 'completed'
                    ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                    : 'bg-rose-500/15 text-rose-400 border-rose-500/30';

                const statusArabic =
                  b.status === 'confirmed'
                    ? 'مؤكد بالصالة ✅'
                    : b.status === 'in_progress'
                    ? 'قيد الخدمة بالصالة ✂️'
                    : b.status === 'pending'
                    ? 'بانتظار موافقة الكاشير ⏳'
                    : b.status === 'completed'
                    ? 'مكتمل ومحاسب 🏁'
                    : b.status === 'cancelled'
                    ? 'ملغي ❌'
                    : 'لم يحضر ⚠️';

                const isPhoneSource = 
                  b.booking_source === 'phone_call' || 
                  b.booking_source === 'walk_in' || 
                  b.booking_source === 'cashier' ||
                  Boolean(b.customer_notes && (b.customer_notes.includes('حجز هاتف للكاشير') || b.customer_notes.includes('حجز هاتف'))) ||
                  Boolean((b as any).notes && ((b as any).notes.includes('حجز هاتف للكاشير') || (b as any).notes.includes('حجز هاتف')));
                const isAppSource = !isPhoneSource;

                return (
                  <div
                    key={b.id || b.booking_number}
                    className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950 border transition flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md hover:border-slate-700 ${
                      isToday ? 'border-amber-500/30' : 'border-slate-800'
                    }`}
                  >
                    {/* Left/Main Info */}
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Header Row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-xs text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                          #{b.booking_number}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                          {statusArabic}
                        </span>
                        
                        {/* Channel Badge */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          isPhoneSource
                            ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                            : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                        }`}>
                          {isPhoneSource ? '📞 حجز هاتفي للكاشير' : '📱 حجز تطبيق العميل'}
                        </span>

                        <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>{b.booking_time}</span>
                          <span className="text-slate-500">|</span>
                          <span>{b.booking_date}</span>
                          {isToday && (
                            <span className="bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.2 rounded font-sans">
                              اليوم
                            </span>
                          )}
                        </span>
                        {b.branch_name && (
                          <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                            {b.branch_name}
                          </span>
                        )}
                      </div>

                      {/* Customer & Service Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* Customer */}
                        <div className="flex items-center gap-2 bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">{b.customer_name || 'عميل المحل'}</p>
                            <p className="text-[10px] text-slate-400 font-mono" dir="ltr">
                              {b.customer_phone}
                            </p>
                          </div>
                        </div>

                        {/* Service & Specialist */}
                        <div className="flex items-center gap-2 bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
                          <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
                            <Scissors className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate flex items-center gap-1.5">
                              <span>{b.service_name}</span>
                              <span className="text-[10px] text-amber-400 font-mono font-bold">
                                ({b.total_price || b.service_price} ﷼)
                              </span>
                            </p>
                            <p className="text-[10px] text-indigo-300 truncate font-semibold flex items-center gap-1">
                              <span>المختص:</span>
                              <strong className="text-white">
                                {b.specialist_name || 'أي مختص متاح'}
                              </strong>
                              <span className="text-slate-500">
                                • {b.duration_minutes || b.service_duration_minutes || 30} دقيقة
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Notes if present */}
                      {(b.notes || b.customer_notes) && (
                        <p className="text-[11px] text-slate-400 bg-slate-900/40 px-2.5 py-1 rounded-lg border border-slate-800/60">
                          <strong className="text-slate-300 font-bold">ملاحظات: </strong>
                          {b.notes || b.customer_notes}
                        </p>
                      )}
                    </div>

                    {/* Right Actions CTA */}
                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                      {/* Primary Button: Check-in to POS Cart */}
                      <button
                        type="button"
                        onClick={() => {
                          onCheckInBooking(b);
                          onClose();
                        }}
                        className="flex-1 md:flex-none w-full px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg active:scale-95"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>استقبال وتحويل للسلة 🧾</span>
                      </button>

                      {/* Secondary Utility Controls */}
                      <div className="flex items-center gap-1.5">
                        {/* WhatsApp Link */}
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsApp(b)}
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition text-xs"
                          title="إرسال رسالة واتساب للعميل"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>

                        {/* Call Phone */}
                        <a
                          href={`tel:${b.customer_phone}`}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition text-xs"
                          title="اتصال هاتفي"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>

                        {/* Quick Confirm / Cancel */}
                        {b.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={updatingId === b.id}
                              onClick={() => handleUpdateStatus(b.id, 'confirmed')}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition flex items-center gap-1"
                              title="تأكيد الموعد وإرساله لشاشة الصالة"
                            >
                              {updatingId === b.id ? '...' : 'تأكيد وإرسال للصالة ✅'}
                            </button>
                            <button
                              type="button"
                              disabled={updatingId === b.id}
                              onClick={() => handleUpdateStatus(b.id, 'cancelled')}
                              className="px-2 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition"
                              title="إلغاء الموعد"
                            >
                              {updatingId === b.id ? '...' : 'إلغاء ❌'}
                            </button>
                          </>
                        )}

                        {/* Quick Complete */}
                        {(b.status === 'confirmed' || b.status === 'in_progress') && (
                          <button
                            type="button"
                            disabled={updatingId === b.id}
                            onClick={() => handleUpdateStatus(b.id, 'completed')}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-[11px] font-bold transition"
                            title="إنهاء الخدمة واكتمالها"
                          >
                            {updatingId === b.id ? '...' : 'إنهاء 🏁'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* VIEW 2: VISUAL TIMETABLE MATRIX (جدول الفترات والمختصين) */}
        {/* ══════════════════════════════════════════════════════ */}
        {viewMode === 'timetable' && (
          <div className="flex-1 overflow-x-auto overflow-y-auto p-3 sm:p-5 custom-scrollbar">
            <div className="min-w-[650px] space-y-3">
              {/* Timetable Header Guidance */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold">💡 قراءة سريعة لجدول اليوم:</span>
                  <span className="text-slate-400">
                    يعرض الجدول كل فترة زمنية لكل مختص لمنع الحجز المزدوج. اضغط على أي فترة متاحة لحجزها فوراً.
                  </span>
                </div>
                <div className="flex items-center gap-3 font-bold text-[11px]">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span>متاح ✨</span>
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                    <span>مشغول 🔒</span>
                  </span>
                </div>
              </div>

              {/* Matrix Table */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-300">
                      <th className="p-3 w-28 text-center font-black border-l border-slate-800">الوقت ⏱️</th>
                      {specialists.length === 0 ? (
                        <th className="p-3 font-bold">جميع المختصين</th>
                      ) : (
                        specialists.map((spec) => (
                          <th key={spec.id} className="p-3 font-black border-l border-slate-800/60 last:border-l-0">
                            <div className="flex items-center gap-1.5">
                              <Scissors className="w-3.5 h-3.5 text-purple-400" />
                              <span>{spec.name}</span>
                              {spec.specialty && (
                                <span className="text-[10px] text-slate-400 font-normal">({spec.specialty})</span>
                              )}
                            </div>
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {STANDARD_TIME_SLOTS.map((slot) => {
                      const targetDate = selectedDateFilter === 'tomorrow' ? tomorrowStr : todayStr;

                      return (
                        <tr key={slot} className="hover:bg-slate-900/40 transition">
                          <td className="p-2.5 text-center font-mono font-bold text-amber-400 bg-slate-900/60 border-l border-slate-800">
                            {slot}
                          </td>

                          {specialists.length === 0 ? (
                            <td className="p-2">
                              {(() => {
                                const check = checkSlotStatus(targetDate, slot, null);
                                if (check.isBusy && check.booking) {
                                  return (
                                    <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-center justify-between gap-2">
                                      <div>
                                        <p className="font-bold text-rose-300">{check.customerName}</p>
                                        <p className="text-[10px] text-slate-400">{check.serviceName}</p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onCheckInBooking(check.booking!);
                                          onClose();
                                        }}
                                        className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold"
                                      >
                                        تحويل للسلة 🧾
                                      </button>
                                    </div>
                                  );
                                }
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenNewBookingForSlot(undefined, slot)}
                                    className="w-full py-1.5 rounded-xl border border-dashed border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10 text-center font-bold text-[11px] transition"
                                  >
                                    + متاح للحجز
                                  </button>
                                );
                              })()}
                            </td>
                          ) : (
                            specialists.map((spec) => {
                              const check = checkSlotStatus(targetDate, slot, spec.id);

                              return (
                                <td key={spec.id} className="p-2 border-l border-slate-800/60 last:border-l-0">
                                  {check.isBusy && check.booking ? (
                                    <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-500/50 flex flex-col gap-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="font-black text-rose-300 truncate max-w-[120px]">
                                          {check.customerName || 'عميل'}
                                        </span>
                                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                          check.source === 'phone_call'
                                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                        }`}>
                                          {check.source === 'phone_call' ? '📞 هاتف' : '📱 تطبيق'}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-slate-400 truncate">{check.serviceName}</p>
                                      <div className="flex items-center justify-between pt-1 border-t border-rose-500/20">
                                        <span className="text-[10px] text-rose-400 font-mono">🔒 مشغول</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            onCheckInBooking(check.booking!);
                                            onClose();
                                          }}
                                          className="px-2 py-0.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] shadow"
                                        >
                                          استقبال 🧾
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenNewBookingForSlot(spec.id, slot)}
                                      className="w-full py-2.5 rounded-xl border border-dashed border-slate-800 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 text-center font-bold text-[11px] transition flex items-center justify-center gap-1 group"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:scale-125 transition"></span>
                                      <span>متاح ✨</span>
                                    </button>
                                  )}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>
              نظام المواعيد يمنع تلقائياً الحجز المزدوج لأي مختص في نفس الوقت عبر كافة القنوات.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition"
          >
            إغلاق
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* 📞 MODAL: CREATE NEW BOOKING (اتصال هاتف / حضور مباشر)    */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isNewBookingOpen && (
        <div className="fixed inset-0 z-55 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl relative space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <PhoneCall className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">حجز موعد جديد للكاشير</h3>
                  <p className="text-[11px] text-slate-400">اتصال هاتفي أو حضور مباشر للفرع</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewBookingOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {lastCreatedBooking ? (
              /* Success State */
              <div className="p-5 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-center space-y-3.5 animate-fade-in">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-2xl border border-emerald-500/40">
                  ✓
                </div>
                <div>
                  <h4 className="text-base font-black text-emerald-300">تم تأكيد وحفظ الموعد بنجاح! 🎉</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    الموعد رقم <strong className="font-mono text-white">#{lastCreatedBooking.booking_number}</strong> أصبح محجوزاً ومقفلاً في جدول المختص.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5 text-right font-medium">
                  <div className="flex justify-between">
                    <span className="text-slate-400">العميل:</span>
                    <span className="text-white font-bold">{lastCreatedBooking.customer_name} ({lastCreatedBooking.customer_phone})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">الخدمة والمختص:</span>
                    <span className="text-amber-400 font-bold">{lastCreatedBooking.service_name} • {lastCreatedBooking.specialist_name || 'أي مختص'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">تاريخ ووقت الموعد:</span>
                    <span className="text-emerald-400 font-mono font-bold">{lastCreatedBooking.booking_date} | {lastCreatedBooking.booking_time}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenWhatsApp(lastCreatedBooking)}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20"
                  >
                    <Send className="w-4 h-4" />
                    <span>إرسال رسالة تأكيد للعميل عبر الواتساب 📲</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLastCreatedBooking(null);
                      setIsNewBookingOpen(false);
                    }}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                  >
                    إغلاق والعودة للجدول
                  </button>
                </div>
              </div>
            ) : (
              /* New Booking Form */
              <form onSubmit={handleCreateNewBooking} className="space-y-3.5 text-xs">
                {bookingError && (
                  <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-bold animate-shake">
                    {bookingError}
                  </div>
                )}

                {/* Customer Phone & Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-slate-300 font-bold block mb-1">رقم جوال العميل:</label>
                    <input
                      type="tel"
                      required
                      placeholder="05xxxxxxxx"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      dir="ltr"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl p-2.5 text-white font-mono font-bold outline-none text-center"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 font-bold block mb-1">اسم العميل:</label>
                    <input
                      type="text"
                      required
                      placeholder="سعد العتيبي"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl p-2.5 text-white font-bold outline-none"
                    />
                  </div>
                </div>

                {matchedCustomer && (
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center justify-between">
                    <span>👑 عميل مسجل بالولاء: {matchedCustomer.name}</span>
                    <span className="font-mono">⭐ {matchedCustomer.wallet_balance} نقطة</span>
                  </div>
                )}

                {/* Service Selection */}
                <div>
                  <label className="text-slate-300 font-bold block mb-1">الخدمة المطلوبة:</label>
                  <select
                    value={newServiceId}
                    onChange={(e) => setNewServiceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl p-2.5 text-white font-bold outline-none cursor-pointer"
                  >
                    {servicesList.length === 0 ? (
                      <option value="">خدمة عامة (50 ر.س)</option>
                    ) : (
                      servicesList.map((srv) => (
                        <option key={srv.id} value={srv.id}>
                          {srv.name} — {srv.price} ﷼ ({srv.duration_minutes || 30} دقيقة)
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Specialist Selection & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-slate-300 font-bold block mb-1">المختص المفضل:</label>
                    <select
                      value={newSpecialistId}
                      onChange={(e) => setNewSpecialistId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl p-2.5 text-white font-bold outline-none cursor-pointer"
                    >
                      <option value="">✂️ أي مختص متاح</option>
                      {specialists.map((spec) => (
                        <option key={spec.id} value={spec.id}>
                          {spec.name} {spec.specialty ? `(${spec.specialty})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-300 font-bold block mb-1">تاريخ الموعد:</label>
                    <input
                      type="date"
                      required
                      value={newBookingDate}
                      onChange={(e) => setNewBookingDate(e.target.value)}
                      min={todayStr}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl p-2.5 text-white font-bold outline-none text-center font-mono cursor-pointer"
                    />
                  </div>
                </div>

                {/* Time Slots Picker (مانع التضارب الحي) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold">الوقت المحدد (فترات المختص):</label>
                    {newBookingTime && (
                      <span className="text-emerald-400 font-bold font-mono text-[11px]">
                        المحدد: {newBookingTime} ✅
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-950 rounded-2xl border border-slate-800 custom-scrollbar">
                    {STANDARD_TIME_SLOTS.map((slot) => {
                      const check = checkSlotStatus(newBookingDate, slot, newSpecialistId);
                      const isSelected = newBookingTime === slot;

                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={check.isBusy}
                          onClick={() => setNewBookingTime(slot)}
                          title={check.isBusy ? `مشغول: ${check.customerName || 'محجوز'}` : 'متاح'}
                          className={`p-2 rounded-xl text-xs font-mono font-bold transition flex flex-col items-center justify-center ${
                            check.isBusy
                              ? 'bg-rose-950/20 text-rose-500/50 border border-rose-900/30 cursor-not-allowed opacity-50'
                              : isSelected
                              ? 'bg-amber-500 text-black border border-amber-400 shadow-md font-black scale-105'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-emerald-500/40'
                          }`}
                        >
                          <span>{slot}</span>
                          <span className="text-[9px] font-sans">
                            {check.isBusy ? 'مشغول 🔒' : 'متاح'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Caller Notes */}
                <div>
                  <label className="text-slate-400 block mb-1">ملاحظات العميل / الاتصال:</label>
                  <input
                    type="text"
                    placeholder="مثال: يفضل مقص خفيف، عميل مستعجل..."
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl p-2 text-white outline-none"
                  />
                </div>

                {/* Form Buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewBookingOpen(false)}
                    className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingBooking}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-black flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSavingBooking ? 'جاري الحفظ...' : 'تأكيد وحفظ الموعد 📅'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

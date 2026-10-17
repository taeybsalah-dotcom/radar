import React, { useState, useEffect, useMemo } from 'react';
import { Store, StoreBranch, StoreStaff, POSShift, POSCashMovement, StoreSpecialist, getStoreActiveModules } from '../../types';
import { LoyaltyService } from '../../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import {
  Receipt,
  TrendingDown,
  Coins,
  History,
  Printer,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Building2,
  Calendar,
  Share2,
  Eye,
  X,
  FileText,
  DollarSign,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  Sparkles,
  Scissors,
  UserCheck,
  ChefHat,
  Monitor,
  QrCode,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

interface POSOperationsTabProps {
  store: Store;
  branches?: StoreBranch[];
  staffList?: StoreStaff[];
}

export const POSOperationsTab: React.FC<POSOperationsTabProps> = ({
  store,
  branches = [],
  staffList = [],
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'shifts' | 'expenses' | 'discounts' | 'specialists' | 'kds'>('shifts');
  const [loading, setLoading] = useState(true);

  // KDS Link Generator States
  const [kdsCopied, setKdsCopied] = useState(false);
  const [kdsMode, setKdsMode] = useState<'orders' | 'services'>(() => {
    const activeMods = getStoreActiveModules(store);
    if (activeMods.bookings && !activeMods.orders) return 'services';
    return 'orders';
  });
  const [kdsBranchId, setKdsBranchId] = useState<string>('ALL');
  
  // Data State
  const [shifts, setShifts] = useState<POSShift[]>([]);
  const [cashMovements, setCashMovements] = useState<POSCashMovement[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [specialists, setSpecialists] = useState<StoreSpecialist[]>([]);

  // Filters State
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | '7d' | '30d' | 'all'>('30d');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals for thermal viewing/printing
  const [viewingShift, setViewingShift] = useState<POSShift | null>(null);
  const [viewingMovement, setViewingMovement] = useState<POSCashMovement | null>(null);

  // Fetch Live Data
  const loadOperationsData = async () => {
    setLoading(true);
    try {
      const [fetchedShifts, fetchedMovements, fetchedOrders, fetchedSpecialists] = await Promise.all([
        LoyaltyService.getStoreShifts(store.id, { limit: 100 }),
        LoyaltyService.getStoreCashMovements(store.id, { limit: 100 }),
        LoyaltyService.getLiveStoreOrders(store.id).catch(() => []),
        LoyaltyService.getStoreSpecialists(store.id).catch(() => []),
      ]);
      setShifts(fetchedShifts || []);
      setCashMovements(fetchedMovements || []);
      setOrders(fetchedOrders || []);
      setSpecialists(fetchedSpecialists || []);
    } catch (err) {
      console.warn('Failed to load merchant POS operations data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOperationsData();
  }, [store.id]);

  // Date Filtering Helper
  const filterByDate = (dateStr: string) => {
    if (selectedPeriod === 'all') return true;
    const now = Date.now();
    const itemTime = new Date(dateStr).getTime();
    const diffDays = (now - itemTime) / (1000 * 3600 * 24);
    if (selectedPeriod === 'today') return diffDays <= 1;
    if (selectedPeriod === '7d') return diffDays <= 7;
    if (selectedPeriod === '30d') return diffDays <= 30;
    return true;
  };

  // Filtered Shifts
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      const matchBranch = selectedBranchId === 'ALL' || s.branch_id === selectedBranchId;
      const matchStaff = selectedStaffId === 'ALL' || s.staff_id === selectedStaffId;
      const matchDate = filterByDate(s.opened_at);
      const matchSearch =
        !searchQuery.trim() ||
        s.staff_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.branch_name && s.branch_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchBranch && matchStaff && matchDate && matchSearch;
    });
  }, [shifts, selectedBranchId, selectedStaffId, selectedPeriod, searchQuery]);

  // Filtered Cash Movements (Expenses / In)
  const filteredMovements = useMemo(() => {
    return cashMovements.filter((m) => {
      const matchBranch = selectedBranchId === 'ALL' || m.branch_id === selectedBranchId;
      const matchStaff = selectedStaffId === 'ALL' || m.staff_id === selectedStaffId;
      const matchDate = filterByDate(m.created_at);
      const matchSearch =
        !searchQuery.trim() ||
        m.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.staff_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.recipient_name && m.recipient_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.invoice_ref && m.invoice_ref.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchBranch && matchStaff && matchDate && matchSearch;
    });
  }, [cashMovements, selectedBranchId, selectedStaffId, selectedPeriod, searchQuery]);

  // Filtered Discount Orders
  const discountedOrders = useMemo(() => {
    return orders.filter((o) => {
      const hasDiscount = Number(o.discount_amount || 0) > 0 || o.discount_reason;
      const matchBranch = selectedBranchId === 'ALL' || o.branch_id === selectedBranchId;
      const matchDate = filterByDate(o.created_at);
      return hasDiscount && matchBranch && matchDate;
    });
  }, [orders, selectedBranchId, selectedPeriod]);

  // Top Metrics Calculations
  const metrics = useMemo(() => {
    const totalSales = filteredShifts.reduce((s, it) => s + (Number(it.total_sales) || 0), 0);
    const cashSales = filteredShifts.reduce((s, it) => s + (Number(it.cash_sales) || 0), 0);
    const cardSales = filteredShifts.reduce((s, it) => s + (Number(it.card_sales) || 0), 0);
    
    // Expenses (Cash Out)
    const totalCashOut = filteredMovements
      .filter((m) => m.type === 'cash_out')
      .reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const cashOutCount = filteredMovements.filter((m) => m.type === 'cash_out').length;

    // Floats (Cash In)
    const totalCashIn = filteredMovements
      .filter((m) => m.type === 'cash_in')
      .reduce((s, it) => s + (Number(it.amount) || 0), 0);

    // Total Discrepancy in shifts
    const totalDiscrepancy = filteredShifts.reduce((s, it) => s + (Number(it.cash_difference) || 0), 0);

    return {
      totalSales,
      cashSales,
      cardSales,
      totalCashOut,
      cashOutCount,
      totalCashIn,
      totalDiscrepancy,
      shiftsCount: filteredShifts.length,
    };
  }, [filteredShifts, filteredMovements]);

  // Export Shifts CSV
  const handleExportShiftsCSV = () => {
    if (filteredShifts.length === 0) return;
    const headers = [
      'رقم الوردية',
      'الكاشير',
      'الفرع',
      'تاريخ الفتح',
      'تاريخ الإغلاق',
      'إجمالي المبيعات',
      'مبيعات كاش',
      'مبيعات شبكة',
      'المرتجعات',
      'العهدة الافتتاحية',
      'المتوقع بالدرج',
      'الفعلي بالدرج',
      'الفارق النقدي',
      'الحالة',
    ];
    const rows = filteredShifts.map((s) => [
      s.id,
      s.staff_name,
      s.branch_name || 'الرئيسي',
      new Date(s.opened_at).toLocaleString('ar-SA'),
      s.closed_at ? new Date(s.closed_at).toLocaleString('ar-SA') : 'مفتوحة حالياً',
      Number(s.total_sales || 0).toFixed(2),
      Number(s.cash_sales || 0).toFixed(2),
      Number(s.card_sales || 0).toFixed(2),
      Number(s.total_refunds || 0).toFixed(2),
      Number(s.opening_cash || 0).toFixed(2),
      Number(s.expected_cash || 0).toFixed(2),
      Number(s.actual_cash || 0).toFixed(2),
      Number(s.cash_difference || 0).toFixed(2),
      s.status === 'open' ? 'مفتوحة' : 'مغلقة',
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `shifts_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Expenses CSV
  const handleExportExpensesCSV = () => {
    if (filteredMovements.length === 0) return;
    const headers = [
      'رقم السند',
      'النوع',
      'المبلغ',
      'البيان / الفئة',
      'المستلم / الجهة',
      'رقم الفاتورة الورقية',
      'الموظف',
      'الفرع',
      'التاريخ والوقت',
      'ملاحظات',
    ];
    const rows = filteredMovements.map((m) => [
      m.id,
      m.type === 'cash_out' ? 'صرف مصروفات نثرية' : 'إيداع فكة',
      Number(m.amount || 0).toFixed(2),
      m.reason,
      m.recipient_name || '-',
      m.invoice_ref || '-',
      m.staff_name,
      m.branch_name || 'الرئيسي',
      new Date(m.created_at).toLocaleString('ar-SA'),
      m.notes || '-',
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `petty_cash_expenses_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Orders for Specialists Analysis
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchBranch = selectedBranchId === 'ALL' || o.branch_id === selectedBranchId;
      const matchStaff = selectedStaffId === 'ALL' || o.cashier_id === selectedStaffId || o.staff_id === selectedStaffId;
      const matchDate = filterByDate(o.created_at);
      return matchBranch && matchStaff && matchDate;
    });
  }, [orders, selectedBranchId, selectedStaffId, selectedPeriod]);

  // Aggregate Specialists Performance Metrics
  const specialistsMetrics = useMemo(() => {
    const UNASSIGNED_KEY = 'unassigned';
    const specMap = new Map<string, {
      id: string;
      name: string;
      specialty: string;
      phone?: string | null;
      servicesCount: number;
      totalSales: number;
      servicesBreakdown: Record<string, { count: number; total: number }>;
    }>();

    // Register active specialists
    specialists.forEach((sp) => {
      specMap.set(sp.id, {
        id: sp.id,
        name: sp.name,
        specialty: sp.specialty || 'مختص خدمة',
        phone: sp.phone,
        servicesCount: 0,
        totalSales: 0,
        servicesBreakdown: {},
      });
    });

    // Bucket for unassigned specialist
    specMap.set(UNASSIGNED_KEY, {
      id: UNASSIGNED_KEY,
      name: 'أي مختص / غير محدد',
      specialty: 'خدمات مسجلة دون تحديد مختص',
      phone: null,
      servicesCount: 0,
      totalSales: 0,
      servicesBreakdown: {},
    });

    // Tally service items from orders
    filteredOrders.forEach((ord) => {
      if (!Array.isArray(ord.items)) return;
      ord.items.forEach((it: any) => {
        const isService = it.item_type === 'service' || Boolean(it.specialist_id || it.specialist_name);
        if (!isService) return;

        const specId =
          it.specialist_id ||
          (it.specialist_name ? specialists.find((s) => s.name === it.specialist_name)?.id : null) ||
          UNASSIGNED_KEY;

        const target = specMap.get(specId) || specMap.get(UNASSIGNED_KEY)!;
        const qty = Number(it.quantity) || 1;
        const total = Number(it.total_price ?? (it.unit_price ? it.unit_price * qty : 0));
        const serviceName = it.name || 'خدمة';

        target.servicesCount += qty;
        target.totalSales += total;

        if (!target.servicesBreakdown[serviceName]) {
          target.servicesBreakdown[serviceName] = { count: 0, total: 0 };
        }
        target.servicesBreakdown[serviceName].count += qty;
        target.servicesBreakdown[serviceName].total += total;
      });
    });

    return Array.from(specMap.values())
      .filter((item) => {
        if (item.id === UNASSIGNED_KEY && item.servicesCount === 0) return false;
        return true;
      })
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [specialists, filteredOrders]);

  const totalServicesDone = specialistsMetrics.reduce((s, it) => s + it.servicesCount, 0);
  const totalServicesRevenue = specialistsMetrics.reduce((s, it) => s + it.totalSales, 0);

  // Export Specialists CSV
  const handleExportSpecialistsCSV = () => {
    if (specialistsMetrics.length === 0) return;
    const headers = [
      'اسم المختص',
      'التخصص',
      'رقم الجوال',
      'عدد الخدمات المنجزة',
      'إجمالي الإيرادات (ر.س)',
      'متوسط قيمة التذكرة',
    ];
    const rows = specialistsMetrics.map((sp) => [
      sp.name,
      sp.specialty,
      sp.phone || '-',
      sp.servicesCount,
      sp.totalSales.toFixed(2),
      sp.servicesCount > 0 ? (sp.totalSales / sp.servicesCount).toFixed(2) : '0.00',
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `specialists_performance_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in text-right" dir="rtl">
      
      {/* 🧭 Top Bar: Title & Primary Controls */}
      <div className="rounded-3xl p-6 bg-slate-900/80 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>رقابة العمليات والورديات والمصروفات</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                تدقيق POS المالي ⚡
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              متابعة جرد الصناديق، تقارير الـ Z-Report، كشف المصروفات النثرية وفروقات الكاشير لحظياً
            </p>
          </div>
        </div>

        {/* Global Period Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {(['today', '7d', '30d', 'all'] as const).map((periodKey) => (
            <button
              key={periodKey}
              onClick={() => setSelectedPeriod(periodKey)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                selectedPeriod === periodKey
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
              }`}
            >
              {periodKey === 'today' ? 'اليوم' : periodKey === '7d' ? 'آخر 7 أيام' : periodKey === '30d' ? 'آخر 30 يوماً' : 'الكل'}
            </button>
          ))}
          <button
            onClick={loadOperationsData}
            title="تحديث البيانات"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 📊 Executive Financial Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Shift Sales */}
        <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>مبيعات الورديات</span>
            <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
              💰
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-white">
            {metrics.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ﷼
          </p>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
            <span>كاش: {metrics.cashSales.toFixed(0)} ﷼</span>
            <span>شبكة: {metrics.cardSales.toFixed(0)} ﷼</span>
          </div>
        </div>

        {/* Card 2: Petty Cash Expenses */}
        <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>المصروفات النثرية</span>
            <span className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold">
              💸
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-rose-400">
            {metrics.totalCashOut.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ﷼
          </p>
          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
            {metrics.cashOutCount} سند صرف نثري موثق
          </p>
        </div>

        {/* Card 3: Float Added (Cash In) */}
        <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>إيداعات الفكة والعهد</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
              🪙
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-emerald-400">
            {metrics.totalCashIn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ﷼
          </p>
          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
            مبالغ مضافة للدرج لتمويل الفكة
          </p>
        </div>

        {/* Card 4: Net Cash Discrepancy */}
        <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>صافي فروقات الصناديق</span>
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
              metrics.totalDiscrepancy === 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : metrics.totalDiscrepancy < 0
                ? 'bg-rose-500/10 text-rose-400'
                : 'bg-blue-500/10 text-blue-400'
            }`}>
              {metrics.totalDiscrepancy === 0 ? '⚖️' : metrics.totalDiscrepancy < 0 ? '⚠️' : '📈'}
            </span>
          </div>
          <p className={`text-2xl font-black font-mono ${
            metrics.totalDiscrepancy === 0
              ? 'text-emerald-400'
              : metrics.totalDiscrepancy < 0
              ? 'text-rose-400'
              : 'text-blue-400'
          }`}>
            {metrics.totalDiscrepancy > 0 ? '+' : ''}{metrics.totalDiscrepancy.toFixed(2)} ﷼
          </p>
          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
            {metrics.totalDiscrepancy === 0
              ? 'مطابقة تامة لكافة الصناديق ✅'
              : metrics.totalDiscrepancy < 0
              ? `يوجد عجز في الصناديق بقيمة ${Math.abs(metrics.totalDiscrepancy).toFixed(2)} ﷼ 🔴`
              : `يوجد فائض بالصناديق بقيمة +${metrics.totalDiscrepancy.toFixed(2)} ﷼ 🔵`}
          </p>
        </div>

      </div>

      {/* 🧭 Subtabs Switcher & Filters Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-2 rounded-2xl shadow-md">
        
        {/* Subtabs Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveSubTab('shifts')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 shrink-0 ${
              activeSubTab === 'shifts'
                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل الورديات وجرد الصناديق ({filteredShifts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('expenses')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 shrink-0 ${
              activeSubTab === 'expenses'
                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <TrendingDown className="w-4 h-4 text-rose-400" />
            <span>المصروفات النثرية والدرج ({filteredMovements.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('discounts')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 shrink-0 ${
              activeSubTab === 'discounts'
                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Receipt className="w-4 h-4 text-blue-400" />
            <span>رقابة الخصومات ({discountedOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('specialists')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 shrink-0 ${
              activeSubTab === 'specialists'
                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Scissors className="w-4 h-4 text-purple-400" />
            <span>مبيعات المختصين والخدمات ({specialistsMetrics.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('kds')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 shrink-0 ${
              activeSubTab === 'kds'
                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <ChefHat className="w-4 h-4 text-amber-400" />
            <span>شاشات المطبخ وأجهزة العرض (KDS) 📺</span>
          </button>
        </div>

        {/* Filter Dropdowns & Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Filter */}
          {branches.length > 0 && (
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
            >
              <option value="ALL">كافة الفروع 🏢</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="بحث بالاسم أو البيان... 🔍"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none w-44"
            />
          </div>

          {/* Export CSV Button */}
          {activeSubTab === 'shifts' ? (
            <button
              onClick={handleExportShiftsCSV}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition"
              title="تصدير سجل الورديات إكسل"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>تصدير CSV</span>
            </button>
          ) : activeSubTab === 'expenses' ? (
            <button
              onClick={handleExportExpensesCSV}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition"
              title="تصدير كشف المصروفات النثرية"
            >
              <Download className="w-3.5 h-3.5 text-rose-400" />
              <span>تصدير CSV</span>
            </button>
          ) : null}
        </div>

      </div>

      {/* ============================================================== */}
      {/* 🔒 SUBTAB 1: SHIFTS & Z-REPORTS LEDGER                          */}
      {/* ============================================================== */}
      {activeSubTab === 'shifts' && (
        <div className="rounded-3xl p-6 bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <span>سجل الورديات ومطابقة الصناديق (Z-Reports)</span>
              <span className="text-xs font-mono text-slate-500">({filteredShifts.length} وردية)</span>
            </h4>
            <span className="text-xs text-slate-400">انقر على أي وردية لعرض وطباعة الـ Z-Report الكامل 🖨️</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">جاري جلب سجل الورديات...</div>
          ) : filteredShifts.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <History className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-400">لا توجد ورديات مسجلة مطابقة للفلاتر المحددة</p>
              <p className="text-xs text-slate-600">ستظهر هنا أي وردية يفتحها الكاشير ويغلقها بجرد الصندوق</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-950/40">
                    <th className="py-3 px-3">رقم الوردية</th>
                    <th className="py-3 px-3">الكاشير المسؤول</th>
                    <th className="py-3 px-3">الفرع</th>
                    <th className="py-3 px-3">وقت الفتح / الإغلاق</th>
                    <th className="py-3 px-3">إجمالي المبيعات</th>
                    <th className="py-3 px-3">المبيعات (كاش / شبكة)</th>
                    <th className="py-3 px-3">المتوقع بالدرج</th>
                    <th className="py-3 px-3">الفعلي بالدرج</th>
                    <th className="py-3 px-3">الفارق النقدي</th>
                    <th className="py-3 px-3">تقرير تليجرام</th>
                    <th className="py-3 px-3 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredShifts.map((shift) => {
                    const diff = Number(shift.cash_difference || 0);
                    const isOpen = shift.status === 'open';

                    return (
                      <tr key={shift.id} className="hover:bg-slate-800/40 transition">
                        {/* ID */}
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-300">
                          #{shift.id.slice(-6).toUpperCase()}
                        </td>

                        {/* Staff */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs font-bold">
                              {shift.staff_name.charAt(0)}
                            </span>
                            <span className="font-bold text-white">{shift.staff_name}</span>
                          </div>
                        </td>

                        {/* Branch */}
                        <td className="py-3.5 px-3 text-slate-400">
                          {shift.branch_name || 'الفرع الرئيسي'}
                        </td>

                        {/* Timing */}
                        <td className="py-3.5 px-3 space-y-0.5">
                          <p className="text-white font-mono">
                            {new Date(shift.opened_at).toLocaleDateString('ar-SA')}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {new Date(shift.opened_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                            {shift.closed_at ? ` ➔ ${new Date(shift.closed_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}` : ' (قيد العمل)'}
                          </p>
                        </td>

                        {/* Total Sales */}
                        <td className="py-3.5 px-3 font-mono font-bold text-amber-300">
                          {Number(shift.total_sales || 0).toFixed(2)} ﷼
                        </td>

                        {/* Sales Breakdown */}
                        <td className="py-3.5 px-3 text-[11px] font-mono text-slate-400 space-y-0.5">
                          <div>💵 كاش: {Number(shift.cash_sales || 0).toFixed(0)} ﷼</div>
                          <div>💳 شبكة: {Number(shift.card_sales || 0).toFixed(0)} ﷼</div>
                        </td>

                        {/* Expected Cash */}
                        <td className="py-3.5 px-3 font-mono text-slate-300">
                          {Number(shift.expected_cash || 0).toFixed(2)} ﷼
                        </td>

                        {/* Actual Cash */}
                        <td className="py-3.5 px-3 font-mono font-bold text-white">
                          {isOpen ? '—' : `${Number(shift.actual_cash || 0).toFixed(2)} ﷼`}
                        </td>

                        {/* Discrepancy Badge */}
                        <td className="py-3.5 px-3">
                          {isOpen ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 text-[10px] font-bold border border-blue-500/30">
                              وردية نشطة ⏳
                            </span>
                          ) : diff === 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                              مطابق تماماً ✅
                            </span>
                          ) : diff < 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[10px] font-bold border border-rose-500/30 font-mono">
                              عجز: {diff.toFixed(2)} ﷼ 🔴
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 text-[10px] font-bold border border-blue-500/30 font-mono">
                              فائض: +{diff.toFixed(2)} ﷼ 🔵
                            </span>
                          )}
                        </td>

                        {/* Telegram Alert Status */}
                        <td className="py-3.5 px-3 text-center">
                          {shift.telegram_sent ? (
                            <span className="text-emerald-400 text-xs font-bold" title="تم إرسال التقرير لتليجرام التاجر">
                              وصل ✅
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]" title="لم يُرسل لتليجرام">
                              تخطي
                            </span>
                          )}
                        </td>

                        {/* Action View Z-Report */}
                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setViewingShift(shift)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1 mx-auto transition"
                            title="معاينة وطباعة تقرير الـ Z-Report"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Z-Report</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 💸 SUBTAB 2: PETTY CASH & EXPENSES LEDGER                      */}
      {/* ============================================================== */}
      {activeSubTab === 'expenses' && (
        <div className="rounded-3xl p-6 bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <span>سجل سندات المصروفات النثرية وإيداعات الفكة</span>
              <span className="text-xs font-mono text-slate-500">({filteredMovements.length} سند)</span>
            </h4>
            <span className="text-xs text-slate-400">توثيق دقيق لكل ريال يخرج أو يدخل صندوق الكاشير 🧾</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">جاري جلب سندات الصرف والإيداع...</div>
          ) : filteredMovements.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <TrendingDown className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-400">لا توجد مصروفات نثرية أو إيداعات مسجلة في هذه الفترة</p>
              <p className="text-xs text-slate-600">أي مصروف يسجله الكاشير عبر زر "تسجيل مصروف" سيظهر هنا فورياً</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-950/40">
                    <th className="py-3 px-3">رقم السند</th>
                    <th className="py-3 px-3">نوع الحركة</th>
                    <th className="py-3 px-3">المبلغ</th>
                    <th className="py-3 px-3">البند / الفئة والبيان</th>
                    <th className="py-3 px-3">المستلم / الجهة</th>
                    <th className="py-3 px-3">رقم الفاتورة الورقية</th>
                    <th className="py-3 px-3">الكاشير المسؤول</th>
                    <th className="py-3 px-3">الفرع</th>
                    <th className="py-3 px-3">التاريخ والوقت</th>
                    <th className="py-3 px-3 text-center">السند الحراري</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredMovements.map((mv) => {
                    const isOut = mv.type === 'cash_out';

                    return (
                      <tr key={mv.id} className="hover:bg-slate-800/40 transition">
                        {/* ID */}
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-300">
                          #{mv.id.slice(-6).toUpperCase()}
                        </td>

                        {/* Movement Type Badge */}
                        <td className="py-3.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 w-fit ${
                            isOut
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {isOut ? <ArrowUpRight className="w-3 h-3 text-rose-400" /> : <ArrowDownLeft className="w-3 h-3 text-emerald-400" />}
                            <span>{isOut ? 'صرف مصروف نثري 💸' : 'إيداع فكة / عهدة 🪙'}</span>
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-3 font-mono font-black text-sm">
                          <span className={isOut ? 'text-rose-400' : 'text-emerald-400'}>
                            {isOut ? '-' : '+'}{Number(mv.amount).toFixed(2)} ﷼
                          </span>
                        </td>

                        {/* Reason / Category */}
                        <td className="py-3.5 px-3">
                          <p className="font-bold text-white">{mv.reason}</p>
                          {mv.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">{mv.notes}</p>}
                        </td>

                        {/* Recipient */}
                        <td className="py-3.5 px-3 font-medium text-amber-300">
                          {mv.recipient_name || '—'}
                        </td>

                        {/* Paper Invoice Ref */}
                        <td className="py-3.5 px-3 font-mono text-slate-400">
                          {mv.invoice_ref || '—'}
                        </td>

                        {/* Staff */}
                        <td className="py-3.5 px-3 text-slate-300">
                          {mv.staff_name}
                        </td>

                        {/* Branch */}
                        <td className="py-3.5 px-3 text-slate-400">
                          {mv.branch_name || 'الرئيسي'}
                        </td>

                        {/* Date & Time */}
                        <td className="py-3.5 px-3 font-mono text-slate-400 space-y-0.5">
                          <div>{new Date(mv.created_at).toLocaleDateString('ar-SA')}</div>
                          <div className="text-[10px] text-slate-500">{new Date(mv.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>

                        {/* View Voucher Action */}
                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setViewingMovement(mv)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1 mx-auto transition"
                            title="معاينة وطباعة السند الحراري"
                          >
                            <Printer className="w-3.5 h-3.5 text-amber-400" />
                            <span>معاينة</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 🏷️ SUBTAB 3: DISCOUNTS AUDIT & LEAKAGE                         */}
      {/* ============================================================== */}
      {activeSubTab === 'discounts' && (
        <div className="rounded-3xl p-6 bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <span>رقابة الخصومات والهدر في السلة (Discount Auditing)</span>
                <span className="text-xs font-mono text-slate-500">({discountedOrders.length} فاتورة مخفضة)</span>
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                متابعة الخصومات الممنوحة وأسبابها المسجلة لمنع الهدر والتلاعب
              </p>
            </div>
          </div>

          {discountedOrders.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-300">لا توجد خصومات مطبقة في هذه الفترة</p>
              <p className="text-xs text-slate-500">جميع المبيعات تمت بالسعر الكامل بنسبة 100%</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-950/40">
                    <th className="py-3 px-3">رقم الفاتورة</th>
                    <th className="py-3 px-3">قيمة الخصم</th>
                    <th className="py-3 px-3">سبب الخصم الموثق</th>
                    <th className="py-3 px-3">إجمالي الفاتورة</th>
                    <th className="py-3 px-3">الكاشير المسؤول</th>
                    <th className="py-3 px-3">الفرع</th>
                    <th className="py-3 px-3">التاريخ والوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {discountedOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-3 font-mono font-bold text-amber-300">
                        #{o.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="py-3.5 px-3 font-mono font-black text-rose-400">
                        -{Number(o.discount_amount || 0).toFixed(2)} ﷼
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 font-bold">
                          {o.discount_reason || 'خصم مباشر'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-mono font-bold text-white">
                        {Number(o.total_price || 0).toFixed(2)} ﷼
                      </td>
                      <td className="py-3.5 px-3 text-slate-300">
                        {o.staff_name || o.activeStaff?.name || 'كاشير'}
                      </td>
                      <td className="py-3.5 px-3 text-slate-400">
                        {o.branch_name || 'الرئيسي'}
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-400">
                        {new Date(o.created_at).toLocaleString('ar-SA')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 💇‍♂️ SUBTAB 4: SPECIALISTS & SERVICES REVENUE AUDIT             */}
      {/* ============================================================== */}
      {activeSubTab === 'specialists' && (
        <div className="space-y-4 animate-fade-in">
          {/* Section Header & Export */}
          <div className="rounded-3xl p-6 bg-slate-900/80 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <Scissors className="w-4 h-4 text-purple-400" />
                <span>مبيعات وإنتاجية طاقم المختصين (Specialists Performance & Commission Audit)</span>
                <span className="text-xs font-mono text-purple-300">({specialistsMetrics.length} مختص)</span>
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                متابعة عدد الخدمات المنفذة والإيراد المالي المحقق لكل مختص لحساب العمولات والمكافآت بدقة
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportSpecialistsCSV}
              disabled={specialistsMetrics.length === 0}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-2 transition shadow-md disabled:opacity-40 shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>تصدير تقرير المختصين (CSV) 📊</span>
            </button>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
              <span className="text-slate-400 text-xs font-bold">إجمالي الخدمات المنجزة</span>
              <p className="text-xl font-black font-mono text-purple-300">{totalServicesDone}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
              <span className="text-slate-400 text-xs font-bold">إجمالي إيراد الخدمات</span>
              <p className="text-xl font-black font-mono text-emerald-400">
                {totalServicesRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ﷼
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
              <span className="text-slate-400 text-xs font-bold">طاقم المختصين المسجلين</span>
              <p className="text-xl font-black font-mono text-white">{specialists.length}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
              <span className="text-slate-400 text-xs font-bold">متوسط قيمة التذكرة</span>
              <p className="text-xl font-black font-mono text-amber-400">
                {(totalServicesDone > 0 ? totalServicesRevenue / totalServicesDone : 0).toFixed(2)} ﷼
              </p>
            </div>
          </div>

          {/* Specialists Performance Cards */}
          {specialistsMetrics.length === 0 ? (
            <div className="py-14 text-center text-slate-500 space-y-3 bg-slate-900/50 rounded-3xl border border-slate-800">
              <Scissors className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs font-bold text-slate-300">لا توجد خدمات منفذة خلال هذه الفترة المحددة</p>
              <p className="text-[10px] text-slate-500 max-w-sm mx-auto">
                عند تسجيل مبيعات خدمات عبر شاشة الكاشير وتحديد المختص، ستظهر تفاصيل كل مختص وحجم مبيعاته ونسبة إنجازه هنا تلقائياً.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {specialistsMetrics.map((spec) => {
                const revenueShare =
                  totalServicesRevenue > 0
                    ? Math.round((spec.totalSales / totalServicesRevenue) * 100)
                    : 0;
                const avgTicket =
                  spec.servicesCount > 0 ? spec.totalSales / spec.servicesCount : 0;
                const breakdownEntries = Object.entries(spec.servicesBreakdown);

                return (
                  <div
                    key={spec.id}
                    className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 space-y-3.5 shadow-xl transition"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 font-black text-base shrink-0">
                          {spec.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-sm font-black text-white truncate">{spec.name}</h5>
                          <p className="text-xs text-purple-300 font-medium truncate">{spec.specialty}</p>
                          {spec.phone && (
                            <p className="text-[10px] text-slate-400 font-mono" dir="ltr">
                              {spec.phone}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        <span className="text-lg font-black font-mono text-emerald-400 block">
                          {spec.totalSales.toFixed(2)} ﷼
                        </span>
                        <span className="text-[10px] font-bold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-500/30">
                          {revenueShare}% من إجمالي الخدمات
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar of Revenue Share */}
                    <div className="space-y-1">
                      <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(4, revenueShare))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                        <span>الخدمات المنفذة: <strong className="text-white">{spec.servicesCount}</strong></span>
                        <span>متوسط التذكرة: <strong className="text-white">{avgTicket.toFixed(2)} ﷼</strong></span>
                      </div>
                    </div>

                    {/* Services Breakdown Tags */}
                    {breakdownEntries.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 block">تفصيل الخدمات المنفذة:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {breakdownEntries.map(([srvName, data]) => (
                            <span
                              key={srvName}
                              className="text-[10px] font-medium bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 text-slate-300 flex items-center gap-1.5"
                            >
                              <span className="font-bold text-white">{srvName}</span>
                              <span className="text-amber-400 font-mono font-bold">×{data.count}</span>
                              <span className="text-slate-500 font-mono">({data.total.toFixed(0)} ﷼)</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 📺 SUBTAB 5: KITCHEN DISPLAY SYSTEM & LIVE SERVICES DISPLAY    */}
      {/* ============================================================== */}
      {activeSubTab === 'kds' && (
        <div className="space-y-6 animate-fade-in">
          {/* Hero Banner */}
          <div className="rounded-3xl p-6 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm shrink-0">
                <ChefHat className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>شاشات المطبخ وأجهزة العرض المباشرة (KDS)</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                    أجهزة التابلت والتلفزيون 📺
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  توليد روابط سريعة ورموز QR لتشغيل شاشات المطبخ، البار، وصالات الخدمات في ثوانٍ معدودة وبدون أي تطبيقات
                </p>
              </div>
            </div>

            {/* Quick Open In New Tab Button */}
            {(() => {
              const params = new URLSearchParams();
              if (kdsBranchId !== 'ALL') params.set('branch', kdsBranchId);
              if (kdsMode === 'services') params.set('mode', 'services');
              const q = params.toString() ? '?' + params.toString() : '';
              const targetUrl = `${window.location.origin}/${store.slug}/kds${q}`;
              return (
                <button
                  type="button"
                  onClick={() => window.open(targetUrl, '_blank')}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition self-start md:self-auto"
                >
                  <ExternalLink className="w-4 h-4 stroke-[2.5]" />
                  <span>فتح الشاشة الآن في نافذة جديدة</span>
                </button>
              );
            })()}
          </div>

          {/* Interactive Screen Configuration & QR Code Card */}
          {(() => {
            const params = new URLSearchParams();
            if (kdsBranchId !== 'ALL') params.set('branch', kdsBranchId);
            if (kdsMode === 'services') params.set('mode', 'services');
            const q = params.toString() ? '?' + params.toString() : '';
            const targetUrl = `${window.location.origin}/${store.slug}/kds${q}`;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left (2 Columns): Configuration & Link Generator */}
                <div className="lg:col-span-2 rounded-3xl p-6 bg-slate-900/90 border border-slate-800 shadow-xl space-y-5">
                  <h4 className="text-sm font-black text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Monitor className="w-4 h-4 text-amber-400" />
                    <span>تخصيص وتوليد رابط الشاشة للجهاز</span>
                  </h4>

                  {/* 1. Mode Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 block">
                      1. اختر نوع الشاشة المطلوب تشغيلها:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setKdsMode('orders')}
                        className={`p-3.5 rounded-2xl border text-right transition flex items-center gap-3 ${
                          kdsMode === 'orders'
                            ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-md'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          kdsMode === 'orders' ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400'
                        }`}>
                          <ChefHat className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-white">شاشة المطبخ والبار (KDS)</p>
                          <p className="text-[11px] text-slate-400">للمطاعم والكافيهات وتجهيز الوجبات والمشروبات</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setKdsMode('services')}
                        className={`p-3.5 rounded-2xl border text-right transition flex items-center gap-3 ${
                          kdsMode === 'services'
                            ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-md'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          kdsMode === 'services' ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400'
                        }`}>
                          <Scissors className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-white">شاشة الخدمات والمواعيد</p>
                          <p className="text-[11px] text-slate-400">للصالونات ومراكز العناية والعيادات ومتابعة الجلسات</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* 2. Branch Selector */}
                  {branches.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-300 block">
                        2. اختر الفرع المستهدف:
                      </label>
                      <select
                        value={kdsBranchId}
                        onChange={(e) => setKdsBranchId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-amber-400"
                      >
                        <option value="ALL">🏢 شاشة عامة لجميع الفروع</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            📍 {b.name} {b.is_main ? '(الفرع الرئيسي)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 3. Generated Direct URL */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 block">
                      3. الرابط المباشر للشاشة:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={targetUrl}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-amber-300 outline-none select-all text-left"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(targetUrl);
                          setKdsCopied(true);
                          setTimeout(() => setKdsCopied(false), 2000);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition shrink-0"
                      >
                        {kdsCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-amber-400" />}
                        <span>{kdsCopied ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      انسخ هذا الرابط وألصقه في متصفح جهاز التابلت أو التلفزيون الذكي في المطبخ/الصالون لفتح الشاشة مباشرة دون تسجيل دخول.
                    </p>
                  </div>
                </div>

                {/* Right (1 Column): Tablet QR Code Scanner */}
                <div className="rounded-3xl p-6 bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <QrCode className="w-5 h-5" />
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-white">مسح الـ QR بكاميرا الجهاز 📱</h4>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[220px]">
                      امسح الكود عبر كاميرا الآيباد أو التابلت لفتح الشاشة فوراً
                    </p>
                  </div>

                  {/* QR Code Container */}
                  <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-amber-400/30">
                    <QRCodeSVG
                      value={targetUrl}
                      size={160}
                      level="H"
                      includeMargin={false}
                    />
                  </div>

                  <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                    {kdsMode === 'services' ? '✂️ صالة الخدمات' : '👨‍🍳 مطبخ / بار'} • {kdsBranchId === 'ALL' ? 'كافة الفروع' : 'فرع محدد'}
                  </span>
                </div>

              </div>
            );
          })()}

          {/* 4 Feature Guidance & Best Practice Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-lg space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-lg">
                📱
              </div>
              <h5 className="text-xs font-black text-white">تثبيت بدون تطبيقات</h5>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                افتح الرابط في Safari أو Chrome واضغط "إضافة إلى الشاشة الرئيسية" ليعمل كتطبيق كامل ومثبت.
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-lg space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 text-lg">
                🔊
              </div>
              <h5 className="text-xs font-black text-white">نغمة مطبخ مستقلة</h5>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                فور صدور أي فاتورة من الكاشير أو طلب من العميل، تنطلق رنة خاصة في المطبخ دون إزعاج الكاشير.
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-lg space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg">
                ⚡
              </div>
              <h5 className="text-xs font-black text-white">مزامنة Realtime حية</h5>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                تحديث لحظي للطلبات والمواعيد عبر WebSocket في أجزاء من الثانية دون الحاجة لعمل Refresh.
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-lg space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 text-lg">
                🔒
              </div>
              <h5 className="text-xs font-black text-white">خصوصية الأرقام المالية</h5>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                شاشة المطبخ مخصصة للتجهيز فقط، وتخفي المبيعات والبيانات المالية الحساسة عن طاقم التحضير.
              </p>
            </div>

          </div>

        </div>
      )}

      {/* ============================================================== */}
      {/* 🖨️ MODAL 1: VIEW & PRINT 80MM Z-REPORT                         */}
      {/* ============================================================== */}
      {viewingShift && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in text-right" dir="rtl">
          
          {/* Printable Thermal Receipt (Visible in Print Only) */}
          <div className="hidden print:block print:w-[80mm] print:p-2 print:text-black print:bg-white text-xs font-mono">
            <div className="text-center pb-2 border-b border-black">
              <h2 className="text-base font-black">{store.name}</h2>
              <p className="text-[10px]">{viewingShift.branch_name || 'الفرع الرئيسي'}</p>
              <p className="font-black text-sm mt-1">تقرير إغلاق الصندوق (Z-REPORT)</p>
              <p className="text-[9px] text-gray-700">رقم الوردية: #{viewingShift.id.slice(-8).toUpperCase()}</p>
            </div>

            <div className="py-2 space-y-1 text-[11px] border-b border-black">
              <div className="flex justify-between">
                <span>الكاشير:</span>
                <span>{viewingShift.staff_name}</span>
              </div>
              <div className="flex justify-between">
                <span>تاريخ الفتح:</span>
                <span>{new Date(viewingShift.opened_at).toLocaleString('ar-SA')}</span>
              </div>
              {viewingShift.closed_at && (
                <div className="flex justify-between">
                  <span>تاريخ الإغلاق:</span>
                  <span>{new Date(viewingShift.closed_at).toLocaleString('ar-SA')}</span>
                </div>
              )}
            </div>

            <div className="py-2 border-b border-black text-[11px] space-y-1">
              <div className="flex justify-between font-bold">
                <span>إجمالي المبيعات:</span>
                <span>{Number(viewingShift.total_sales || 0).toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>- مبيعات نقدية (كاش):</span>
                <span>{Number(viewingShift.cash_sales || 0).toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>- مبيعات شبكة / مدى:</span>
                <span>{Number(viewingShift.card_sales || 0).toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>- إجمالي المرتجعات:</span>
                <span>{Number(viewingShift.total_refunds || 0).toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>- ضريبة القيمة المضافة (15%):</span>
                <span>{Number(viewingShift.tax_amount || 0).toFixed(2)} ر.س</span>
              </div>
            </div>

            <div className="py-2 border-b border-black text-[11px] space-y-1">
              <div className="flex justify-between">
                <span>العهدة الافتتاحية:</span>
                <span>{Number(viewingShift.opening_cash || 0).toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>+ إيداعات فكة (Cash In):</span>
                <span>+{Number(viewingShift.total_cash_in || 0).toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-rose-700">
                <span>- مصروفات نثرية (Cash Out):</span>
                <span>-{Number(viewingShift.total_cash_out || 0).toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between font-black pt-1 border-t border-dashed border-black">
                <span>المبلغ المتوقع بالدرج:</span>
                <span>{Number(viewingShift.expected_cash || 0).toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between font-black">
                <span>المبلغ الفعلي بالدرج:</span>
                <span>{Number(viewingShift.actual_cash || 0).toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between font-black text-sm pt-1 border-t border-black">
                <span>الفارق النقدي:</span>
                <span>{Number(viewingShift.cash_difference || 0).toFixed(2)} ر.س</span>
              </div>
            </div>

            <div className="pt-4 pb-2 text-center text-[10px]">
              <p className="border-b border-black pb-8">توقيع المسؤول / أمين الصندوق</p>
            </div>
          </div>

          {/* Modal Dialog Card */}
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col animate-scale-up print:hidden">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">
                  معاينة تقرير الوردية (Z-Report)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingShift(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800 border border-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
              {/* Header Box */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-1">
                <p className="font-black text-sm text-white">{store.name}</p>
                <p className="text-slate-400 text-[11px]">{viewingShift.branch_name || 'الفرع الرئيسي'}</p>
                <p className="font-mono text-amber-300 font-bold">وردية #{viewingShift.id.slice(-8).toUpperCase()}</p>
                <p className="text-[10px] text-slate-500 font-mono">الكاشير: {viewingShift.staff_name}</p>
              </div>

              {/* Financial Box */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between text-slate-300 font-bold pb-2 border-b border-slate-800">
                  <span>إجمالي المبيعات:</span>
                  <span className="font-mono text-white text-sm">{Number(viewingShift.total_sales || 0).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>مبيعات نقدية (كاش):</span>
                  <span className="font-mono text-slate-200">{Number(viewingShift.cash_sales || 0).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>مبيعات شبكة:</span>
                  <span className="font-mono text-slate-200">{Number(viewingShift.card_sales || 0).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>المرتجعات:</span>
                  <span className="font-mono text-rose-400">-{Number(viewingShift.total_refunds || 0).toFixed(2)} ﷼</span>
                </div>
              </div>

              {/* Cash Reconciliation Box */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>العهدة الافتتاحية:</span>
                  <span className="font-mono text-slate-200">{Number(viewingShift.opening_cash || 0).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>+ إيداعات فكة (Cash In):</span>
                  <span className="font-mono">+{Number(viewingShift.total_cash_in || 0).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-rose-400">
                  <span>- مصروفات نثرية (Cash Out):</span>
                  <span className="font-mono">-{Number(viewingShift.total_cash_out || 0).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t border-slate-800 text-white">
                  <span>المبلغ المتوقع بالصندوق:</span>
                  <span className="font-mono">{Number(viewingShift.expected_cash || 0).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between font-bold text-white">
                  <span>المبلغ الفعلي بالصندوق:</span>
                  <span className="font-mono">{Number(viewingShift.actual_cash || 0).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between font-black text-sm pt-2 border-t border-slate-800">
                  <span>الفارق النقدي:</span>
                  <span className={`font-mono ${
                    Number(viewingShift.cash_difference || 0) === 0
                      ? 'text-emerald-400'
                      : Number(viewingShift.cash_difference || 0) < 0
                      ? 'text-rose-400'
                      : 'text-blue-400'
                  }`}>
                    {Number(viewingShift.cash_difference || 0) > 0 ? '+' : ''}{Number(viewingShift.cash_difference || 0).toFixed(2)} ﷼
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة حرارية 🖨️</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingShift(null)}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center transition border border-slate-700"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 🖨️ MODAL 2: VIEW & PRINT PETTY CASH VOUCHER                    */}
      {/* ============================================================== */}
      {viewingMovement && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in text-right" dir="rtl">
          
          {/* Printable Voucher */}
          <div className="hidden print:block print:w-[80mm] print:p-2 print:text-black print:bg-white text-xs font-mono">
            <div className="text-center pb-2 border-b border-black">
              <h2 className="text-base font-black">{store.name}</h2>
              <p className="text-[10px]">{viewingMovement.branch_name || 'الفرع الرئيسي'}</p>
              <p className="font-black text-sm mt-1">
                {viewingMovement.type === 'cash_out' ? 'سند صرف مصروفات نثرية' : 'سند إيداع فكة / عهدة'}
              </p>
              <p className="text-[9px] text-gray-700">رقم السند: #{viewingMovement.id.slice(-8).toUpperCase()}</p>
            </div>

            <div className="py-2 space-y-1 text-[11px] border-b border-black">
              <div className="flex justify-between">
                <span>التاريخ والوقت:</span>
                <span>{new Date(viewingMovement.created_at).toLocaleString('ar-SA')}</span>
              </div>
              <div className="flex justify-between">
                <span>الكاشير المسؤول:</span>
                <span>{viewingMovement.staff_name}</span>
              </div>
              {viewingMovement.recipient_name && (
                <div className="flex justify-between">
                  <span>المستلم / الجهة:</span>
                  <span>{viewingMovement.recipient_name}</span>
                </div>
              )}
              {viewingMovement.invoice_ref && (
                <div className="flex justify-between">
                  <span>رقم الفاتورة الورقية:</span>
                  <span>{viewingMovement.invoice_ref}</span>
                </div>
              )}
            </div>

            <div className="py-2 border-b border-black text-center">
              <span className="text-[10px] text-gray-700 block">المبلغ المنصرف / المودع:</span>
              <span className="text-2xl font-black">{Number(viewingMovement.amount).toFixed(2)} ر.س</span>
            </div>

            <div className="py-2 border-b border-black text-[10px] space-y-1">
              <p><strong>البيان / الفئة:</strong> {viewingMovement.reason}</p>
              {viewingMovement.notes && <p><strong>ملاحظات:</strong> {viewingMovement.notes}</p>}
            </div>

            <div className="pt-4 pb-2 grid grid-cols-2 gap-4 text-center text-[10px]">
              <div>
                <p className="border-b border-black pb-8">توقيع المستلم</p>
              </div>
              <div>
                <p className="border-b border-black pb-8">توقيع الكاشير</p>
              </div>
            </div>
          </div>

          {/* Screen Card */}
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col animate-scale-up print:hidden">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <Printer className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">
                  معاينة سند {viewingMovement.type === 'cash_out' ? 'صرف مصروف نثري' : 'إيداع فكة'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingMovement(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800 border border-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400">نوع السند:</span>
                  <span className={`font-black ${viewingMovement.type === 'cash_out' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {viewingMovement.type === 'cash_out' ? 'صرف مصروفات نثرية 💸' : 'إيداع فكة وعهدة 🪙'}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400">المبلغ:</span>
                  <span className="text-lg font-black font-mono text-white">
                    {Number(viewingMovement.amount).toFixed(2)} ﷼
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400">البيان / الفئة:</span>
                  <span className="font-bold text-slate-200">{viewingMovement.reason}</span>
                </div>
                {viewingMovement.recipient_name && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-slate-400">المستلم / الجهة:</span>
                    <span className="font-bold text-amber-300">{viewingMovement.recipient_name}</span>
                  </div>
                )}
                {viewingMovement.invoice_ref && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-slate-400">رقم الفاتورة الورقية:</span>
                    <span className="font-mono text-slate-300">{viewingMovement.invoice_ref}</span>
                  </div>
                )}
                {viewingMovement.notes && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-slate-400">ملاحظات:</span>
                    <span className="text-slate-300 italic">{viewingMovement.notes}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                  <span>الموظف: {viewingMovement.staff_name}</span>
                  <span>{new Date(viewingMovement.created_at).toLocaleString('ar-SA')}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة حرارية 🖨️</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingMovement(null)}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center transition border border-slate-700"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Store, StoreBranch, StoreStaff, BranchDaySchedule, DeliveryDistanceTier } from '../types';
import { LoyaltyService } from '../lib/supabase';
import { checkBranchOpenStatus, DEFAULT_BRANCH_SCHEDULE } from '../lib/branchUtils';
import { DEFAULT_DELIVERY_TIERS, DEFAULT_MAX_DELIVERY_RADIUS_KM, extractCoordsFromMapUrl } from '../lib/deliveryPricing';
import {
  Building2,
  Clock,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Power,
  Users,
  MapPin,
  Phone,
  ShieldCheck,
  Check,
  X,
  Sparkles,
  Calendar,
  Save,
  RotateCcw,
  Utensils,
  Compass,
  Bike,
  LocateFixed,
  DollarSign,
  Navigation,
} from 'lucide-react';
import { TablesManagementView } from './merchant/TablesManagementView';
import { DriversManagementView } from './merchant/DriversManagementView';
import { SubTabsHubGrid } from './merchant/SubTabsHubGrid';
import { SubSectionFocusedHeader } from './merchant/SubSectionFocusedHeader';

interface BranchesManagementTabProps {
  store: Store;
  staffList: StoreStaff[];
  onStaffUpdated?: () => void;
}

export const BranchesManagementTab: React.FC<BranchesManagementTabProps> = ({
  store,
  staffList,
  onStaffUpdated,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'hub' | 'branches' | 'tables' | 'drivers'>('hub');
  const [branches, setBranches] = useState<StoreBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal States
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<StoreBranch | null>(null);
  const [branchFormName, setBranchFormName] = useState('');
  const [branchFormCode, setBranchFormCode] = useState('');
  const [branchFormCity, setBranchFormCity] = useState('');
  const [branchFormAddress, setBranchFormAddress] = useState('');
  const [branchFormPhone, setBranchFormPhone] = useState('');
  const [isSubmittingBranch, setIsSubmittingBranch] = useState(false);

  // Working Hours Modal State
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [selectedHoursBranch, setSelectedHoursBranch] = useState<StoreBranch | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<BranchDaySchedule[]>(DEFAULT_BRANCH_SCHEDULE);
  const [isSavingHours, setIsSavingHours] = useState(false);

  // Quick Time Batch Apply
  const [batchOpenTime, setBatchOpenTime] = useState('09:00');
  const [batchCloseTime, setBatchCloseTime] = useState('23:00');

  // Staff Assignment State
  const [assigningBranchId, setAssigningBranchId] = useState<string | null>(null);
  const [selectedStaffToAssign, setSelectedStaffToAssign] = useState<string>('');

  // 🛵 Delivery Settings Modal State
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [selectedDeliveryBranch, setSelectedDeliveryBranch] = useState<StoreBranch | null>(null);
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState<number>(DEFAULT_MAX_DELIVERY_RADIUS_KM);
  const [deliveryPricingType, setDeliveryPricingType] = useState<'fixed' | 'tiered'>('tiered');
  const [fixedDeliveryFee, setFixedDeliveryFee] = useState<number>(15);
  const [deliveryTiers, setDeliveryTiers] = useState<DeliveryDistanceTier[]>(DEFAULT_DELIVERY_TIERS);
  const [branchLat, setBranchLat] = useState<string>('');
  const [branchLng, setBranchLng] = useState<string>('');
  const [mapUrlInput, setMapUrlInput] = useState<string>('');
  const [isLocatingGPS, setIsLocatingGPS] = useState(false);
  const [isSavingDeliverySettings, setIsSavingDeliverySettings] = useState(false);

  const loadBranches = async () => {
    if (!store?.id) return;
    setLoading(true);
    try {
      const data = await LoyaltyService.getStoreBranches(store.id);
      setBranches(data);
    } catch (e: any) {
      setActionError('تعذر تحميل بيانات الفروع.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, [store?.id]);

  const notifySuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingBranch(null);
    setBranchFormName('');
    const nextNum = branches.length + 1;
    setBranchFormCode(`BR-0${nextNum}`);
    setBranchFormCity('');
    setBranchFormAddress('');
    setBranchFormPhone('');
    setIsAddEditModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (branch: StoreBranch) => {
    setEditingBranch(branch);
    setBranchFormName(branch.name);
    setBranchFormCode(branch.branch_code);
    setBranchFormCity(branch.city || '');
    setBranchFormAddress(branch.address || '');
    setBranchFormPhone(branch.phone || '');
    setIsAddEditModalOpen(true);
  };

  // Submit Add / Edit Branch
  const handleSaveBranchForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchFormName.trim()) return;
    setIsSubmittingBranch(true);
    setActionError(null);

    try {
      if (editingBranch) {
        // Update
        const updated = await LoyaltyService.updateStoreBranch(editingBranch.id, {
          name: branchFormName.trim(),
          branch_code: branchFormCode.trim() || editingBranch.branch_code,
          city: branchFormCity.trim() || null,
          address: branchFormAddress.trim() || null,
          phone: branchFormPhone.trim() || null,
        });
        if (updated) {
          setBranches((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
          notifySuccess('تم تحديث بيانات الفرع بنجاح!');
        }
      } else {
        // Create
        const isFirst = branches.length === 0;
        const newBranch = await LoyaltyService.addStoreBranch({
          store_id: store.id,
          branch_code: branchFormCode.trim() || `BR-0${branches.length + 1}`,
          name: branchFormName.trim(),
          city: branchFormCity.trim() || null,
          address: branchFormAddress.trim() || null,
          phone: branchFormPhone.trim() || null,
          is_main: isFirst,
          status: 'active',
          is_open: true,
          manual_override: 'auto',
          working_hours: DEFAULT_BRANCH_SCHEDULE,
        });
        setBranches((prev) => [...prev, newBranch]);
        notifySuccess('تمت إضافة الفرع الجديد بنجاح!');
      }
      setIsAddEditModalOpen(false);
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء حفظ الفرع.');
    } finally {
      setIsSubmittingBranch(false);
    }
  };

  // Delete Branch
  const handleDeleteBranch = async (branchId: string, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف فرع "${name}"؟`)) return;
    try {
      const ok = await LoyaltyService.deleteStoreBranch(branchId);
      if (ok) {
        setBranches((prev) => prev.filter((b) => b.id !== branchId));
        notifySuccess('تم حذف الفرع بنجاح.');
      } else {
        setActionError('تعذر حذف الفرع.');
      }
    } catch (e: any) {
      setActionError(e.message || 'فشل حذف الفرع.');
    }
  };

  // Change Operational Mode (Auto / Force Open / Force Closed)
  const handleChangeMode = async (branch: StoreBranch, newMode: 'auto' | 'forced_open' | 'forced_closed') => {
    try {
      const updated = await LoyaltyService.updateStoreBranch(branch.id, {
        manual_override: newMode,
      });
      if (updated) {
        setBranches((prev) => prev.map((b) => (b.id === branch.id ? { ...b, manual_override: newMode } : b)));
        const label = newMode === 'auto' ? 'تلقائي حسب الجدول' : newMode === 'forced_open' ? 'مفتوح دائماً' : 'مغلق مؤقتاً';
        notifySuccess(`تم تغيير وضع تشغيل فرع (${branch.name}) إلى: ${label}`);
      }
    } catch (e) {
      setActionError('تعذر تحديث وضع التشغيل.');
    }
  };

  // Open Working Hours Editor
  const handleOpenHoursModal = (branch: StoreBranch) => {
    setSelectedHoursBranch(branch);
    const currentSchedule = (Array.isArray(branch.working_hours) && branch.working_hours.length > 0)
      ? branch.working_hours
      : DEFAULT_BRANCH_SCHEDULE;
    setEditingSchedule(JSON.parse(JSON.stringify(currentSchedule)));
    setIsHoursModalOpen(true);
  };

  // Toggle Day in Working Hours
  const handleToggleDay = (index: number) => {
    setEditingSchedule((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], is_open: !copy[index].is_open };
      return copy;
    });
  };

  // Change Day Time
  const handleTimeChange = (index: number, field: 'open_time' | 'close_time', val: string) => {
    setEditingSchedule((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  // Apply Batch Hours
  const handleApplyBatchHours = () => {
    setEditingSchedule((prev) =>
      prev.map((d) => ({
        ...d,
        open_time: batchOpenTime,
        close_time: batchCloseTime,
      }))
    );
    notifySuccess('تم تعميم التوقيت على كافة أيام الأسبوع!');
  };

  // Save Working Hours
  const handleSaveWorkingHours = async () => {
    if (!selectedHoursBranch) return;
    setIsSavingHours(true);
    setActionError(null);
    try {
      const updated = await LoyaltyService.updateStoreBranch(selectedHoursBranch.id, {
        working_hours: editingSchedule,
      });
      if (updated) {
        setBranches((prev) =>
          prev.map((b) => (b.id === selectedHoursBranch.id ? { ...b, working_hours: editingSchedule } : b))
        );
        notifySuccess('تم حفظ جدول أوقات العمل للفرع بنجاح!');
        setIsHoursModalOpen(false);
      }
    } catch (e: any) {
      setActionError('فشل حفظ جدول أوقات العمل.');
    } finally {
      setIsSavingHours(false);
    }
  };

  // Assign Staff to Branch
  const handleAssignStaff = async (branchId: string, staffId: string) => {
    if (!staffId) return;
    try {
      const ok = await LoyaltyService.assignStaffBranch(staffId, branchId);
      if (ok) {
        notifySuccess('تم تعيين الموظف للفرع بنجاح!');
        if (onStaffUpdated) onStaffUpdated();
      }
    } catch (e) {
      setActionError('تعذر تعيين الموظف للفرع.');
    }
  };

  // Unassign Staff from Branch
  const handleUnassignStaff = async (branchId: string, staffId: string) => {
    if (!staffId) return;
    try {
      const ok = await LoyaltyService.unassignStaffBranch(staffId, branchId);
      if (ok) {
        notifySuccess('تم إلغاء تعيين الموظف من هذا الفرع بنجاح!');
        if (onStaffUpdated) onStaffUpdated();
      }
    } catch (e) {
      setActionError('تعذر إلغاء تعيين الموظف من الفرع.');
    }
  };

  // 🛵 Open Delivery Settings Modal
  const handleOpenDeliveryModal = (branch: StoreBranch) => {
    setSelectedDeliveryBranch(branch);
    setDeliveryRadiusKm(branch.delivery_radius_km ?? DEFAULT_MAX_DELIVERY_RADIUS_KM);
    setDeliveryPricingType(branch.delivery_pricing_type ?? 'tiered');
    const existingTiers = Array.isArray(branch.delivery_tiers) && branch.delivery_tiers.length > 0
      ? branch.delivery_tiers
      : DEFAULT_DELIVERY_TIERS;
    setDeliveryTiers(existingTiers);
    if (branch.delivery_pricing_type === 'fixed' && existingTiers[0]?.fee) {
      setFixedDeliveryFee(existingTiers[0].fee);
    }
    setBranchLat(branch.lat !== undefined && branch.lat !== null ? String(branch.lat) : '');
    setBranchLng(branch.lng !== undefined && branch.lng !== null ? String(branch.lng) : '');
    setMapUrlInput(branch.lat && branch.lng ? `https://maps.google.com/?q=${branch.lat},${branch.lng}` : '');
    setIsDeliveryModalOpen(true);
  };

  // 📍 Locate Branch via Browser GPS
  const handleLocateBranchGPS = () => {
    if (!navigator.geolocation) {
      alert('المتصفح لا يدعم تحديد الموقع الجغرافي');
      return;
    }
    setIsLocatingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setBranchLat(String(lat));
        setBranchLng(String(lng));
        setMapUrlInput(`https://maps.google.com/?q=${lat},${lng}`);
        setIsLocatingGPS(false);
        notifySuccess('تم جلب إحداثيات موقع الفرع عبر الـ GPS بنجاح! 📍');
      },
      (err) => {
        setIsLocatingGPS(false);
        alert('تعذر تحديد الموقع الجغرافي. يرجى تفعيل إذن الموقع أو إدخال الإحداثيات يدوياً.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // 🎯 Parse Map URL input
  const handleMapUrlInput = (input: string) => {
    setMapUrlInput(input);
    const coords = extractCoordsFromMapUrl(input);
    if (coords) {
      setBranchLat(String(coords.lat));
      setBranchLng(String(coords.lng));
      notifySuccess('تم استخراج إحداثيات الفرع من الرابط بنجاح! 🎯');
    }
  };

  // ➕ Add new tier
  const handleAddTier = () => {
    const lastTier = deliveryTiers[deliveryTiers.length - 1];
    const nextMax = lastTier ? Number(lastTier.max_km) + 5 : 5;
    const nextFee = lastTier ? Number(lastTier.fee) + 6 : 10;
    const newTier: DeliveryDistanceTier = {
      id: `tier_${Date.now()}`,
      max_km: nextMax,
      fee: nextFee,
      label: `نطاق حتى ${nextMax} كم`,
    };
    setDeliveryTiers((prev) => [...prev, newTier]);
  };

  // 🗑️ Remove tier
  const handleRemoveTier = (index: number) => {
    if (deliveryTiers.length <= 1) {
      alert('يجب أن تحتوي قائمة الشرائح على شريحة واحدة على الأقل');
      return;
    }
    setDeliveryTiers((prev) => prev.filter((_, i) => i !== index));
  };

  // ✏️ Update tier field
  const handleUpdateTier = (index: number, field: keyof DeliveryDistanceTier, val: any) => {
    setDeliveryTiers((prev) =>
      prev.map((tier, i) => (i === index ? { ...tier, [field]: val } : tier))
    );
  };

  // ⚡ Apply default tiers
  const handleApplyDefaultTiers = () => {
    setDeliveryTiers(DEFAULT_DELIVERY_TIERS);
    notifySuccess('تمت استعادة شرائح التوصيل القياسية المقترحة! ⚡');
  };

  // 💾 Save Delivery Settings
  const handleSaveDeliverySettings = async () => {
    if (!selectedDeliveryBranch) return;
    setIsSavingDeliverySettings(true);
    setActionError(null);

    const latVal = branchLat.trim() ? parseFloat(branchLat) : null;
    const lngVal = branchLng.trim() ? parseFloat(branchLng) : null;

    // Sort tiers by max_km ascending
    const sortedTiers = deliveryPricingType === 'tiered'
      ? [...deliveryTiers].sort((a, b) => Number(a.max_km) - Number(b.max_km))
      : [
          {
            id: 'fixed_tier',
            max_km: Number(deliveryRadiusKm) || 15,
            fee: Number(fixedDeliveryFee) || 15,
            label: 'سعر توصيل موحد',
          },
        ];

    try {
      const updated = await LoyaltyService.updateStoreBranch(selectedDeliveryBranch.id, {
        lat: latVal,
        lng: lngVal,
        delivery_radius_km: Number(deliveryRadiusKm) || 15,
        delivery_pricing_type: deliveryPricingType,
        delivery_tiers: sortedTiers,
      });

      if (updated) {
        setBranches((prev) =>
          prev.map((b) =>
            b.id === updated.id
              ? {
                  ...b,
                  ...updated,
                  lat: latVal,
                  lng: lngVal,
                  delivery_radius_km: Number(deliveryRadiusKm) || 15,
                  delivery_pricing_type: deliveryPricingType,
                  delivery_tiers: sortedTiers,
                }
              : b
          )
        );
        notifySuccess(`تم حفظ إعدادات نطاق وأسعار التوصيل لفرع (${selectedDeliveryBranch.name}) بنجاح! 🛵`);
        setIsDeliveryModalOpen(false);
      }
    } catch (e: any) {
      setActionError(e.message || 'حدث خطأ أثناء حفظ إعدادات التوصيل.');
    } finally {
      setIsSavingDeliverySettings(false);
    }
  };

  return (
    <div className="rounded-3xl p-6 sm:p-8 bg-slate-900/80 border border-slate-800 space-y-6 animate-fade-in shadow-xl">
      {/* Alerts */}
      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-800/80 flex items-center justify-between text-rose-300 text-xs font-bold">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-between text-emerald-300 text-xs font-bold">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeSubTab === 'hub' ? (
        /* 🔲 Executive Subtabs Grid Navigation */
        <SubTabsHubGrid<'branches' | 'tables' | 'drivers'>
          activeTab={'branches'}
          onSelectTab={(tab) => {
            setActiveSubTab(tab);
            window.scrollTo({ top: 150, behavior: 'smooth' });
          }}
          columns="3"
          tabs={[
            {
              id: 'branches',
              label: 'الفروع ومواعيد العمل',
              description: 'إدارة شبكة الفروع، ساعات وأيام العمل الأسبوعية، والموقع الجغرافي ونطاقات التوصيل',
              icon: Building2,
              badge: `${branches.length} فروع`,
              glowColor: 'bg-cyan-500/20',
              iconBg: 'bg-cyan-500/15',
              iconBorder: 'border-cyan-500/30',
              iconColor: 'text-cyan-400',
              statHighlight: `${branches.length} فرع مسجل بالمتجر`,
            },
            {
              id: 'tables',
              label: 'إدارة الصالة وطاولات الطعام',
              description: 'توزيع طاولات المطعم/المقهى، ملصقات QR الذكية للطلب والدفع، وحالة الإشغال الفورية',
              icon: Utensils,
              badge: 'ملصقات QR 🍽️',
              glowColor: 'bg-amber-500/20',
              iconBg: 'bg-amber-500/15',
              iconBorder: 'border-amber-500/30',
              iconColor: 'text-amber-400',
              statHighlight: 'طاولات الصالة وQR',
            },
            {
              id: 'drivers',
              label: 'كباتن وأسطول التوصيل',
              description: 'إدارة السائقين، تعيين طلبات التوصيل، تتبع حالة الطلب، وبوابة الكابتن المستقلة',
              icon: Bike,
              badge: 'أسطول نشط 🛵',
              glowColor: 'bg-emerald-500/20',
              iconBg: 'bg-emerald-500/15',
              iconBorder: 'border-emerald-500/30',
              iconColor: 'text-emerald-400',
              statHighlight: 'إدارة الكباتن وبوابة السائق',
            },
          ]}
        />
      ) : (
        /* ⬅️ Focused Header when a sub-section is open */
        <>
          <SubSectionFocusedHeader
            title={
              activeSubTab === 'branches'
                ? 'الفروع ومواعيد العمل الأسبوعية'
                : activeSubTab === 'tables'
                ? 'إدارة الصالة وطاولات الطعام وملصقات QR'
                : 'كباتن وأسطول التوصيل'
            }
            badge={
              activeSubTab === 'branches'
                ? `${branches.length} فرع`
                : activeSubTab === 'tables'
                ? 'الصالة وQR'
                : 'أسطول التوصيل'
            }
            icon={
              activeSubTab === 'branches'
                ? Building2
                : activeSubTab === 'tables'
                ? Utensils
                : Bike
            }
            iconBg={
              activeSubTab === 'branches'
                ? 'bg-cyan-500/15'
                : activeSubTab === 'tables'
                ? 'bg-amber-500/15'
                : 'bg-emerald-500/15'
            }
            iconBorder={
              activeSubTab === 'branches'
                ? 'border-cyan-500/30'
                : activeSubTab === 'tables'
                ? 'border-amber-500/30'
                : 'border-emerald-500/30'
            }
            iconColor={
              activeSubTab === 'branches'
                ? 'text-cyan-400'
                : activeSubTab === 'tables'
                ? 'text-amber-400'
                : 'text-emerald-400'
            }
            backLabel="العودة لأقسام الفروع والصالة"
            onBack={() => setActiveSubTab('hub')}
            activeId={activeSubTab}
            onSelectQuickJump={(id) => setActiveSubTab(id as any)}
            quickJumpOptions={[
              { id: 'branches', label: 'الفروع ومواعيد العمل' },
              { id: 'tables', label: 'إدارة الصالة والطاولات' },
              { id: 'drivers', label: 'كباتن وأسطول التوصيل' },
            ]}
          />

          {activeSubTab === 'tables' ? (
            <TablesManagementView store={store} branches={branches} />
          ) : activeSubTab === 'drivers' ? (
            <DriversManagementView store={store} branches={branches} />
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2 rtl:space-x-reverse">
                  <span>إدارة الفروع وأوقات العمل</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold font-mono">
                {branches.length} فروع
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              تحديد مواعيد العمل الأسبوعية، التحكم الفوري بالحالة (مفتوح/مغلق)، وتعيين موظفي الكاشير لكل فرع
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg shadow-amber-500/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة فرع جديد</span>
        </button>
      </div>

      {/* Business Logic Explainer Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-950/90 border border-slate-800/80 text-xs">
        <div className="flex items-start gap-2.5 text-slate-300">
          <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-white block font-sans">الطلبات الفورية (المنيو):</strong>
            <span className="text-slate-400 text-[11px]">
              مرتبطة بحالة الفرع الحالية. إذا كان مغلقاً (آلياً أو يدوياً)، تتوقف استقبال الطلبات الجديدة في واجهة العميل.
            </span>
          </div>
        </div>
        <div className="flex items-start gap-2.5 text-slate-300">
          <Calendar className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-white block font-sans">الحجوزات والمواعيد:</strong>
            <span className="text-slate-400 text-[11px]">
              متاحة للعميل على مدار 24 ساعة لاختيار موعد مستقبلي ضمن أوقات الدوام الرسمية، حتى لو كان الفرع مغلقاً الآن.
            </span>
          </div>
        </div>
      </div>

      {/* Branches List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-xs">جاري تحميل الفروع وأوقات العمل...</div>
      ) : branches.length === 0 ? (
        <div className="p-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-3xl">
          لم يتم العثور على أي فرع. اضغط على «إضافة فرع جديد» لإضافة فرعك الأول.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {branches.map((branch) => {
            const statusInfo = checkBranchOpenStatus(branch);
            const isStaffInBranch = (s: StoreStaff) => {
              if (Array.isArray(s.assigned_branch_ids) && s.assigned_branch_ids.includes(branch.id)) return true;
              return s.branch_id === branch.id;
            };
            const branchStaff = staffList.filter(isStaffInBranch);
            const candidateStaff = staffList.filter((s) => !isStaffInBranch(s));

            return (
              <div
                key={branch.id}
                className="p-5 rounded-3xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700 transition flex flex-col justify-between space-y-4 shadow-lg"
              >
                {/* Branch Header */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 font-bold">
                        <Building2 className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-white">{branch.name}</h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-bold">
                            {branch.branch_code}
                          </span>
                          {branch.is_main && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold">
                              الفرع الرئيسي 👑
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          {branch.city && <span>📍 {branch.city}</span>}
                          {branch.phone && <span>📞 {branch.phone}</span>}
                        </p>
                      </div>
                    </div>

                    {/* Live Status Badge */}
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${statusInfo.badgeColor}`}>
                      {statusInfo.statusLabel}
                    </span>
                  </div>

                  {/* Mode Selector (Auto / Force Open / Force Closed) */}
                  <div className="mt-4 p-3 rounded-2xl bg-slate-900/90 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-bold">وضع التشغيل الفعلي:</span>
                      <span className="text-slate-300 font-mono text-[10px]">{statusInfo.reason}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleChangeMode(branch, 'auto')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                          branch.manual_override === 'auto'
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>تلقائي (جدول)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleChangeMode(branch, 'forced_open')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                          branch.manual_override === 'forced_open'
                            ? 'bg-emerald-500 text-slate-950 font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                        <span>مفتوح دائماً</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleChangeMode(branch, 'forced_closed')}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                          branch.manual_override === 'forced_closed'
                            ? 'bg-rose-500 text-white font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <XCircle className="w-3 h-3" />
                        <span>إغلاق مؤقت</span>
                      </button>
                    </div>
                  </div>

                  {/* Assigned Staff Preview with Badges, Unassign (X) and Add Dropdown */}
                  <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>طاقم العمل المعيّن لهذا الفرع ({branchStaff.length}):</span>
                      </div>

                      {candidateStaff.length > 0 && (
                        <select
                          className="bg-slate-900 border border-slate-700 hover:border-amber-500 rounded-xl px-2.5 py-1 text-[11px] text-amber-300 font-bold outline-none transition"
                          onChange={(e) => {
                            if (e.target.value) handleAssignStaff(branch.id, e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="">+ إضافة موظف للفرع</option>
                          {candidateStaff.map((st) => (
                            <option key={st.id} value={st.id}>
                              + {st.name} ({st.role === 'admin' ? 'مدير' : 'كاشير'})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Staff Chips with Unassign (X) */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {branchStaff.length === 0 ? (
                        <p className="text-[11px] text-slate-500 italic py-0.5">
                          لم يتم تخصيص أي موظف لهذا الفرع بعد. اختر موظفاً من القائمة أعلاه لإضافته.
                        </p>
                      ) : (
                        branchStaff.map((st) => (
                          <span
                            key={st.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white shadow-sm"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span className="font-bold">{st.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({st.role === 'admin' ? 'مدير' : 'كاشير'})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUnassignStaff(branch.id, st.id)}
                              className="p-0.5 rounded-md hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                              title={`إلغاء تعيين ${st.name} من هذا الفرع`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 🛵 Delivery Settings Status & Quick Access */}
                  <div className="mt-3 pt-3 border-t border-slate-800/80 p-3 rounded-2xl bg-slate-900/90 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                        <Bike className="w-4 h-4" />
                        <span>خدمة التوصيل والأسطول:</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-bold">
                        أقصى نطاق: {branch.delivery_radius_km ?? 15} كم
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 flex-wrap">
                      <span>
                        {branch.delivery_pricing_type === 'fixed'
                          ? '💵 تسعير موحد ثابت'
                          : `📏 تسعير شرائح مسافات (${branch.delivery_tiers?.length || 3} شرائح)`}
                      </span>
                      <span>
                        {branch.lat && branch.lng ? (
                          <span className="text-emerald-400 flex items-center gap-1 font-bold">
                            <LocateFixed className="w-3 h-3" />
                            <span>موقع الفرع محدد بالخريطة ✅</span>
                          </span>
                        ) : (
                          <span className="text-amber-400/80 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>موقع الفرع غير محدد</span>
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenDeliveryModal(branch)}
                        className="py-1.5 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>نطاق وأسعار التوصيل 🛵</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveSubTab('drivers');
                        }}
                        className="py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <Users className="w-3.5 h-3.5 text-sky-400" />
                        <span>كباتن التوصيل 👥</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenHoursModal(branch)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-400 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>أوقات العمل الأسبوعية (7 أيام) ⏰</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(branch)}
                      className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
                      title="تعديل بيانات الفرع"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    {!branch.is_main && (
                      <button
                        type="button"
                        onClick={() => handleDeleteBranch(branch.id, branch.name)}
                        className="p-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-rose-400 border border-slate-800 hover:border-rose-800/60 transition"
                        title="حذف الفرع"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
            </>
          )}
        </>
      )}

      {/* ======================================================== */}
      {/* ⏰ MODAL: محرر أوقات العمل الأسبوعية للفرع (7 Days Schedule) */}
      {/* ======================================================== */}
      {isHoursModalOpen && selectedHoursBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    جدول أوقات العمل: {selectedHoursBranch.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    حدد أوقات الدوام لكل يوم من أيام الأسبوع لاستقبال طلبات المنيو الفورية
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsHoursModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Batch Setup Bar */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-300 block">⚡ تعميم توقيت موحد سريع:</span>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>من:</span>
                  <input
                    type="time"
                    value={batchOpenTime}
                    onChange={(e) => setBatchOpenTime(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>إلى:</span>
                  <input
                    type="time"
                    value={batchCloseTime}
                    onChange={(e) => setBatchCloseTime(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyBatchHours}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 text-xs font-bold transition"
                >
                  تطبيق على الكل
                </button>
              </div>
            </div>

            {/* 7 Days Schedule Table */}
            <div className="space-y-2">
              {editingSchedule.map((dayItem, idx) => (
                <div
                  key={dayItem.day}
                  className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 flex-wrap ${
                    dayItem.is_open
                      ? 'bg-slate-950/90 border-slate-800'
                      : 'bg-slate-950/40 border-slate-800/40 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 w-32">
                    <button
                      type="button"
                      onClick={() => handleToggleDay(idx)}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                        dayItem.is_open
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                          : 'bg-slate-800 border-slate-700 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                    <span className="text-xs font-black text-white">{dayItem.day_ar}</span>
                  </div>

                  {dayItem.is_open ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 text-[11px]">يفتح:</span>
                      <input
                        type="time"
                        value={dayItem.open_time}
                        onChange={(e) => handleTimeChange(idx, 'open_time', e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white outline-none"
                      />
                      <span className="text-slate-400 text-[11px]">يغلق:</span>
                      <input
                        type="time"
                        value={dayItem.close_time}
                        onChange={(e) => handleTimeChange(idx, 'close_time', e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white outline-none"
                      />
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-rose-400">مغلق طوال اليوم</span>
                  )}
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsHoursModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingHours}
                onClick={handleSaveWorkingHours}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingHours ? 'جاري الحفظ...' : 'حفظ الجدول الأسبوعي 💾'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 🏢 MODAL: إضافة / تعديل بيانات الفرع */}
      {/* ======================================================== */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-400" />
                <span>{editingBranch ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddEditModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBranchForm} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">اسم الفرع *</label>
                <input
                  type="text"
                  value={branchFormName}
                  onChange={(e) => setBranchFormName(e.target.value)}
                  placeholder="مثال: فرع التحلية، فرع الياسمين"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500/50"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">كود الفرع المختصر (Branch Code)</label>
                <input
                  type="text"
                  value={branchFormCode}
                  onChange={(e) => setBranchFormCode(e.target.value.toUpperCase())}
                  placeholder="BR-02"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">المدينة</label>
                  <input
                    type="text"
                    value={branchFormCity}
                    onChange={(e) => setBranchFormCity(e.target.value)}
                    placeholder="الرياض، جدة..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">هاتف الفرع</label>
                  <input
                    type="text"
                    value={branchFormPhone}
                    onChange={(e) => setBranchFormPhone(e.target.value)}
                    placeholder="05XXXXXXXX"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">العنوان بالتفصيل</label>
                <input
                  type="text"
                  value={branchFormAddress}
                  onChange={(e) => setBranchFormAddress(e.target.value)}
                  placeholder="طريق الملك فهد، حي الصحافة"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBranch}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSubmittingBranch ? 'جاري الحفظ...' : editingBranch ? 'تحديث الفرع' : 'إضافة الفرع 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 🛵 MODAL: إعدادات نطاق وأسعار التوصيل وموقع الفرع الجغرافي */}
      {/* ======================================================== */}
      {isDeliveryModalOpen && selectedDeliveryBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    نطاق وأسعار التوصيل: {selectedDeliveryBranch.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    تحديد موقع الفرع الجغرافي، أقصى مسافة للتوصيل، وشرائح التسعير بالكيلومتر
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDeliveryModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Branch GPS Location Section */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-500" />
                  <span className="text-xs font-bold text-white">موقع الفرع على الخريطة (GPS)</span>
                </div>
                {branchLat && branchLng ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono font-bold flex items-center gap-1">
                    <LocateFixed className="w-3 h-3" />
                    <span>محدد ({Number(branchLat).toFixed(4)}, {Number(branchLng).toFixed(4)})</span>
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
                    ⚠️ غير محدد
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                يستخدم النظام موقع الفرع لحساب المسافة بدقة بالكيلومتر بين الفرع والعميل عند طلب التوصيل.
              </p>

              {/* GPS Buttons & Input */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLocateBranchGPS}
                    disabled={isLocatingGPS}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow disabled:opacity-50"
                  >
                    <LocateFixed className="w-4 h-4" />
                    <span>{isLocatingGPS ? 'جاري تحديد الموقع...' : '📍 حدد موقع الفرع الحالي عبر الـ GPS'}</span>
                  </button>

                  {branchLat && branchLng && (
                    <a
                      href={`https://maps.google.com/?q=${branchLat},${branchLng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold transition flex items-center gap-1"
                    >
                      <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                      <span>معاينة في خرائط جوجل</span>
                    </a>
                  )}
                </div>

                {/* Paste Google Maps URL */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 block font-bold">
                    أو الصق رابط موقع الفرع من خرائط جوجل (Google Maps URL):
                  </label>
                  <input
                    type="text"
                    value={mapUrlInput}
                    onChange={(e) => handleMapUrlInput(e.target.value)}
                    placeholder="https://maps.google.com/?q=24.7136,46.6753 أو https://maps.app.goo.gl/..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                {/* Manual Lat / Lng */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">خط العرض (Latitude)</label>
                    <input
                      type="number"
                      step="any"
                      value={branchLat}
                      onChange={(e) => setBranchLat(e.target.value)}
                      placeholder="24.7136"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">خط الطول (Longitude)</label>
                    <input
                      type="number"
                      step="any"
                      value={branchLng}
                      onChange={(e) => setBranchLng(e.target.value)}
                      placeholder="46.6753"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Max Delivery Radius */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-amber-400" />
                  <span>أقصى مسافة ونطاق توصيل للفرع (بالكيلومتر) *</span>
                </label>
                <span className="text-amber-400 font-mono font-black text-sm">{deliveryRadiusKm} كم</span>
              </div>
              <input
                type="number"
                min="1"
                max="100"
                value={deliveryRadiusKm}
                onChange={(e) => setDeliveryRadiusKm(Number(e.target.value) || 1)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-bold outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-slate-400">
                أي عميل يطلب من موقع يبعد أكثر من {deliveryRadiusKm} كم سيتم إخطاره فوراً بأن موقعه خارج النطاق مع إتاحة التحويل لاستلام سفري من الفرع.
              </p>
            </div>

            {/* 3. Pricing Model Selection */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>طريقة تسعير رسوم التوصيل:</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryPricingType('tiered')}
                  className={`p-3 rounded-xl border text-right transition ${
                    deliveryPricingType === 'tiered'
                      ? 'bg-amber-500/10 border-amber-500/50 text-white shadow'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-amber-300">📏 شرائح متدرجة حسب المسافة</span>
                    {deliveryPricingType === 'tiered' && <span className="text-xs">✅</span>}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    تسعير عادل يزداد كلما بعد العميل (مثال: 0-5 كم = 10 ر.س، 5-10 كم = 16 ر.س).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDeliveryPricingType('fixed')}
                  className={`p-3 rounded-xl border text-right transition ${
                    deliveryPricingType === 'fixed'
                      ? 'bg-amber-500/10 border-amber-500/50 text-white shadow'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-amber-300">💵 سعر موحد ثابت</span>
                    {deliveryPricingType === 'fixed' && <span className="text-xs">✅</span>}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    سعر توصيل ثابت لكافة الطلبات داخل النطاق مهما كانت المسافة.
                  </p>
                </button>
              </div>

              {/* If Fixed Rate */}
              {deliveryPricingType === 'fixed' ? (
                <div className="pt-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">سعر التوصيل الثابت (ريال سعودي) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={fixedDeliveryFee}
                    onChange={(e) => setFixedDeliveryFee(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-bold outline-none focus:border-amber-500"
                  />
                </div>
              ) : (
                /* If Tiered Rates */
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">جدول شرائح المسافات والأسعار:</span>
                    <button
                      type="button"
                      onClick={handleApplyDefaultTiers}
                      className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>استعادة الشرائح المقترحة</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {deliveryTiers.map((tier, idx) => (
                      <div
                        key={tier.id || idx}
                        className="p-3 rounded-2xl bg-slate-900 border border-slate-800 grid grid-cols-12 gap-2 items-center text-xs"
                      >
                        <div className="col-span-3">
                          <label className="text-[10px] text-slate-500 block">حتى مسافة (كم):</label>
                          <input
                            type="number"
                            min="1"
                            value={tier.max_km}
                            onChange={(e) => handleUpdateTier(idx, 'max_km', Number(e.target.value) || 1)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold font-mono outline-none"
                          />
                        </div>

                        <div className="col-span-3">
                          <label className="text-[10px] text-slate-500 block">رسوم التوصيل (ر.س):</label>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={tier.fee}
                            onChange={(e) => handleUpdateTier(idx, 'fee', Number(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-bold font-mono outline-none"
                          />
                        </div>

                        <div className="col-span-5">
                          <label className="text-[10px] text-slate-500 block">وصف الشريحة (يظهر للعميل):</label>
                          <input
                            type="text"
                            value={tier.label || ''}
                            onChange={(e) => handleUpdateTier(idx, 'label', e.target.value)}
                            placeholder="مثال: النطاق القريب (0-5 كم)"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none"
                          />
                        </div>

                        <div className="col-span-1 text-left pt-3">
                          <button
                            type="button"
                            onClick={() => handleRemoveTier(idx)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="حذف الشريحة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddTier}
                    className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 text-amber-400 text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة شريحة مسافة جديدة</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsDeliveryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingDeliverySettings}
                onClick={handleSaveDeliverySettings}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingDeliverySettings ? 'جاري الحفظ...' : 'حفظ إعدادات التوصيل للفرع 💾'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

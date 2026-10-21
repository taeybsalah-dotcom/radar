import React, { useState, useEffect } from 'react';
import {
  Store,
  StoreBranch,
  StoreDriver,
  DriverVehicleType,
  DriverWorkStatus,
} from '../../types';
import { DriverService } from '../../lib/driverService';
import { LoyaltyEvents } from '../../lib/events';
import {
  Plus,
  Edit3,
  Trash2,
  Phone,
  Building2,
  ExternalLink,
  ShieldCheck,
  Check,
  X,
  Power,
  Search,
  Sparkles,
  KeyRound,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { playBeepSound } from '../../lib/sound';

interface DriversManagementViewProps {
  store: Store;
  branches: StoreBranch[];
}

export const DriversManagementView: React.FC<DriversManagementViewProps> = ({
  store,
  branches,
}) => {
  const [drivers, setDrivers] = useState<StoreDriver[]>([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Partial<StoreDriver> | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formBranchId, setFormBranchId] = useState(branches[0]?.id || 'b1');
  const [formVehicleType, setFormVehicleType] = useState<DriverVehicleType>('motorcycle');
  const [formPlateNumber, setFormPlateNumber] = useState('');
  const [formPinCode, setFormPinCode] = useState('1234');
  const [formCommission, setFormCommission] = useState<number | ''>(10);
  const [formNotes, setFormNotes] = useState('');

  const reloadDrivers = () => {
    const list = DriverService.getDrivers(store.id, selectedBranchFilter);
    setDrivers(list);
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
  }, [store.id, selectedBranchFilter]);

  const openAddModal = () => {
    setEditingDriver(null);
    setFormName('');
    setFormPhone('');
    setFormBranchId(branches[0]?.id || 'b1');
    setFormVehicleType('motorcycle');
    setFormPlateNumber('');
    setFormPinCode('1234');
    setFormCommission(10);
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (d: StoreDriver) => {
    setEditingDriver(d);
    setFormName(d.name);
    setFormPhone(d.phone);
    setFormBranchId(d.branch_id || branches[0]?.id || 'b1');
    setFormVehicleType(d.vehicle_type);
    setFormPlateNumber(d.plate_number || '');
    setFormPinCode(d.pin_code || '1234');
    setFormCommission(d.commission_per_order ?? 10);
    setFormNotes(d.notes || '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      alert('يرجى إدخال اسم السائق ورقم جواله');
      return;
    }

    const matchedBranch = branches.find((b) => b.id === formBranchId);

    DriverService.saveDriver(store.id, {
      id: editingDriver?.id,
      store_id: store.id,
      name: formName.trim(),
      phone: formPhone.trim(),
      branch_id: formBranchId,
      branch_name: matchedBranch?.name || 'الفرع الرئيسي',
      vehicle_type: formVehicleType,
      plate_number: formPlateNumber.trim(),
      pin_code: formPinCode.trim() || '1234',
      commission_per_order: formCommission === '' ? 0 : Number(formCommission),
      notes: formNotes.trim(),
      is_active: true,
      status: editingDriver?.status || 'available',
    });

    playBeepSound('success');
    reloadDrivers();
    setIsModalOpen(false);
  };

  const handleDelete = (driverId: string, name: string) => {
    const confirm = window.confirm(`هل أنت متأكد من حذف السائق "${name}"؟`);
    if (confirm) {
      DriverService.deleteDriver(store.id, driverId);
      playBeepSound('notification');
      reloadDrivers();
    }
  };

  const filteredDrivers = drivers.filter((d) => {
    const matchSearch =
      searchQuery.trim() === '' ||
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.phone.includes(searchQuery) ||
      (d.plate_number || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* Top Action & Filter Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-3xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-white">كباتن وأسطول التوصيل الميداني</h3>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold font-mono">
              {drivers.length} كابتن
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            إدارة السائقين المربوطين بالفروع، وتتبع أدائهم والعهد النقدية اليومية
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Branch Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-2xl border border-slate-800 text-xs">
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none"
            >
              <option value="ALL">🏢 كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  🏢 {b.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={openAddModal}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة كابتن توصيل 🛵</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث بالاسم، رقم الجوال، أو رقم اللوحة..."
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pr-10 pl-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Drivers Cards Grid */}
      {filteredDrivers.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-slate-800/80 space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-slate-800/60 flex items-center justify-center mx-auto text-3xl">
            🛵
          </div>
          <h4 className="text-sm font-bold text-white">لا يوجد كباتن توصيل مسجلين في هذا الفرع</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            أضف سائقك الأول واربطه بفرعه ليبدأ باستلام طلبات التوصيل وتأكيد تحصيل المبالغ عند الباب.
          </p>
          <button
            onClick={openAddModal}
            className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black"
          >
            إضافة سائق الآن ➕
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredDrivers.map((driver) => {
            const statusInfo = DriverService.getStatusLabel(driver.status);
            const portalUrl = `/?store=${encodeURIComponent(store.slug || store.id)}&portal=driver&driver=${driver.id}&branch=${driver.branch_id}`;

            return (
              <div
                key={driver.id}
                className="p-4 rounded-3xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition shadow-xl space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xl shrink-0">
                        {DriverService.getVehicleIcon(driver.vehicle_type)}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white">{driver.name}</h4>
                        <span className="text-[11px] text-slate-400 font-mono">{driver.phone}</span>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* Branch & Vehicle Details */}
                  <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1.5 mt-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-amber-400" />
                        الفرع المربوط به:
                      </span>
                      <span className="text-white font-bold">{driver.branch_name || 'الفرع الرئيسي'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">المركبة واللوحة:</span>
                      <span className="text-slate-300 font-mono">
                        {DriverService.getVehicleLabel(driver.vehicle_type)} • {driver.plate_number || 'بدون لوحة'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">العمولة لكل طلب:</span>
                      <span className="text-emerald-400 font-bold font-mono">
                        {driver.commission_per_order || 0} ريال
                      </span>
                    </div>

                    {driver.notes && (
                      <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-900 truncate">
                        📝 {driver.notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Card Actions */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-[11px] font-bold transition flex items-center justify-center gap-1 border border-slate-700"
                    title="فتح تطبيق السائق لهذا الحساب"
                  >
                    <span>فتح التطبيق 📱</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(driver)}
                      className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition"
                      title="تعديل"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(driver.id, driver.name)}
                      className="p-1.5 rounded-xl hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in text-right" dir="rtl">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scale-up">
            
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-black">
                  🛵
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    {editingDriver ? 'تعديل بيانات كابتن التوصيل' : 'إضافة كابتن توصيل جديد للأسطول'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ربط السائق بفرع محدد وتحديد نوع المركبة والعمولة
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 sm:p-5 overflow-y-auto space-y-3.5">
              
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">اسم السائق:</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: سلطان العتيبي"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1">رقم الجوال:</label>
                  <input
                    type="tel"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="0501234567"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1">الفرع المربوط به:</label>
                  <select
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        🏢 {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1">نوع المركبة:</label>
                  <select
                    value={formVehicleType}
                    onChange={(e) => setFormVehicleType(e.target.value as DriverVehicleType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="motorcycle">🛵 دراجة نارية / دباب</option>
                    <option value="car">🚗 سيارة خاصة</option>
                    <option value="bicycle">🚲 دراجة هوائية</option>
                    <option value="van">🚐 فان / حافلة توزيع</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1">رقم اللوحة:</label>
                  <input
                    type="text"
                    value={formPlateNumber}
                    onChange={(e) => setFormPlateNumber(e.target.value)}
                    placeholder="مثال: أ ب د 1234"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1">رمز الدخول السريع (PIN):</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={formPinCode}
                    onChange={(e) => setFormPinCode(e.target.value)}
                    placeholder="1234"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono text-center tracking-widest focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1">عمولة السائق لكل طلب (ريال):</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formCommission}
                    onChange={(e) => setFormCommission(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="10"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">ملاحظات إضافية (اختياري):</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="مثال: مسؤول توصيل المربع الشمالي / دوام مسائي"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg transition"
                >
                  حفظ الكابتن 💾
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};

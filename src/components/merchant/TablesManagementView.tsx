import React, { useState, useEffect, useMemo } from 'react';
import {
  Utensils,
  Plus,
  Edit,
  Trash2,
  Printer,
  QrCode,
  Users,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Building2,
  Layers,
  Sparkles,
  ExternalLink,
  X,
  Check,
} from 'lucide-react';
import { Store, DiningTable, StoreBranch, DiningTableZone } from '../../types';
import { TableService } from '../../lib/tableService';
import { TableStickerPrintModal } from '../TableStickerPrintModal';

interface TablesManagementViewProps {
  store: Store;
  branches: StoreBranch[];
}

export const TablesManagementView: React.FC<TablesManagementViewProps> = ({
  store,
  branches,
}) => {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Partial<DiningTable> | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [singlePrintTable, setSinglePrintTable] = useState<DiningTable | null>(null);

  const reloadTables = () => {
    const list = TableService.getTables(store.id, selectedBranchId);
    setTables(list);
  };

  useEffect(() => {
    reloadTables();
  }, [store.id, selectedBranchId]);

  // Key stats
  const totalTables = tables.length;
  const totalCapacity = useMemo(
    () => tables.reduce((sum, t) => sum + (Number(t.capacity) || 0), 0),
    [tables]
  );

  const zonesList: { id: string; label: string }[] = [
    { id: 'all', label: 'كافة الأقسام' },
    { id: 'singles', label: 'الأفراد 👤' },
    { id: 'families', label: 'العوائل 👨‍👩‍👧‍👦' },
    { id: 'outdoor', label: 'التراس الخارجي 🌿' },
    { id: 'vip', label: 'أجنحة VIP 👑' },
    { id: 'bar', label: 'كاونتر بار ☕' },
  ];

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchZone = selectedZone === 'all' || t.zone === selectedZone;
      const matchSearch =
        searchQuery.trim() === '' ||
        t.table_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchZone && matchSearch;
    });
  }, [tables, selectedZone, searchQuery]);

  const handleSaveTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable || !editingTable.table_number?.trim()) return;

    TableService.saveTable(store.id, {
      ...editingTable,
      table_number: String(editingTable.table_number).trim(),
      capacity: Number(editingTable.capacity) || 4,
    });

    setIsEditModalOpen(false);
    setEditingTable(null);
    reloadTables();
  };

  const handleDeleteTable = (t: DiningTable) => {
    if (confirm(`هل أنت متأكد من حذف الطاولة #${t.table_number} (${t.name})؟`)) {
      TableService.deleteTable(store.id, t.id);
      reloadTables();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-100" dir="rtl">
      {/* Header & Quick Action Strip */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
              نظام إدارة الصالة والطاولات والطلبات الذاتية
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2.5">
            <Utensils className="w-7 h-7 text-amber-400" />
            <span>طاولات الصالة ورموز الـ QR</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            خصص طاولات متجرك بحسب الأقسام والفروع، واطبع ملصقات الـ QR ليقوم الزبون بمسح الكود والطلب
            مباشرة من طاولته، مع انعكاس حالة الطاولة (شاغرة / مشغولة) في شاشة الكاشير لحظياً!
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => {
              setSinglePrintTable(null);
              setIsPrintModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs sm:text-sm flex items-center gap-2 border border-slate-700 transition"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>طباعة ملصقات QR الصالة 🖨️</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingTable({
                table_number: String(tables.length + 1),
                name: `طاولة ${tables.length + 1}`,
                zone: 'singles',
                capacity: 4,
                shape: 'square',
                is_active: true,
                branch_id: selectedBranchId !== 'ALL' ? selectedBranchId : null,
              });
              setIsEditModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة طاولة جديدة</span>
          </button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400 block font-bold">إجمالي الطاولات</span>
          <span className="text-xl font-black text-white font-mono mt-1 block">{totalTables}</span>
          <span className="text-[10px] text-slate-500">طاولة مهيأة</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400 block font-bold">إجمالي سعة المقاعد</span>
          <span className="text-xl font-black text-amber-400 font-mono mt-1 block">
            {totalCapacity}
          </span>
          <span className="text-[10px] text-slate-500">كرسي في الصالة</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400 block font-bold">الأقسام الفعالة</span>
          <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
            {new Set(tables.map((t) => t.zone)).size}
          </span>
          <span className="text-[10px] text-slate-500">أفراد، عوائل، تراس، VIP</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400 block font-bold">ملصقات الـ QR</span>
          <span className="text-xl font-black text-cyan-400 font-mono mt-1 block">جاهزة 100%</span>
          <span className="text-[10px] text-slate-500">معتمدة مع الكاشير والمنيو</span>
        </div>
      </div>

      {/* Filters: Branch Dropdown + Search + Zone Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          {/* Branch Filter */}
          {branches.length > 0 && (
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-200 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="ALL">جميع الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Search Table */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث برقم الطاولة أو اسمها..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500 transition"
            />
          </div>
        </div>

        {/* Zone Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {zonesList.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setSelectedZone(z.id)}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedZone === z.id
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.length === 0 ? (
          <div className="col-span-full p-12 text-center text-slate-500 border border-slate-800 rounded-3xl bg-slate-900/60">
            لا توجد طاولات تطابق البحث. اضغط على "إضافة طاولة جديدة" لإعداد طاولات الصالة.
          </div>
        ) : (
          filteredTables.map((tbl) => {
            const tableQrUrl = TableService.generateTableQrUrl(
              store.slug || store.id,
              tbl.table_number,
              tbl.branch_id
            );

            return (
              <div
                key={tbl.id}
                className="rounded-3xl p-5 bg-slate-900 border border-slate-800 hover:border-amber-500/50 shadow-xl transition-all duration-300 flex flex-col justify-between space-y-4 group"
              >
                {/* Top Row: Table Number & Zone Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-mono font-black text-sm">
                      #{tbl.table_number}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">{tbl.name}</h4>
                      <span className="text-[10px] text-slate-400 block font-bold">
                        {TableService.getZoneLabel(tbl.zone)}
                      </span>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold flex items-center gap-1">
                    <Users className="w-3 h-3 text-amber-400" />
                    <span>{tbl.capacity} مقاعد</span>
                  </span>
                </div>

                {/* Middle: QR Preview Strip */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-bold">رابط الطلب الذاتي:</span>
                    <span className="text-[11px] font-mono text-emerald-400 block truncate">
                      ?table={tbl.table_number}
                    </span>
                  </div>

                  <button
                    type="button"
                    title="معاينة وطباعة ملصق الطاولة"
                    onClick={() => {
                      setSinglePrintTable(tbl);
                      setIsPrintModalOpen(true);
                    }}
                    className="p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition shrink-0"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>

                {/* Bottom Actions */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>نشطة بالكاشير</span>
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="تعديل الطاولة"
                      onClick={() => {
                        setEditingTable(tbl);
                        setIsEditModalOpen(true);
                      }}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      title="حذف الطاولة"
                      onClick={() => handleDeleteTable(tbl)}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 flex items-center justify-center transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ======================================================== */}
      {/* ✏️ MODAL: ADD / EDIT DINING TABLE                        */}
      {/* ======================================================== */}
      {isEditModalOpen && editingTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in text-right" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Utensils className="w-5 h-5 text-amber-400" />
                <span>{editingTable.id ? 'تعديل طاولة الصالة' : 'إضافة طاولة جديدة'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    رقم الطاولة <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: 5، 12، VIP-1"
                    value={editingTable.table_number || ''}
                    onChange={(e) =>
                      setEditingTable({ ...editingTable, table_number: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono font-bold outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    سعة المقاعد (أشخاص)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={editingTable.capacity ?? 4}
                    onChange={(e) =>
                      setEditingTable({ ...editingTable, capacity: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  اسم أو وصف الطاولة
                </label>
                <input
                  type="text"
                  placeholder="مثال: طاولة 5، كابينة عوائل مطلة، جناح VIP"
                  value={editingTable.name || ''}
                  onChange={(e) => setEditingTable({ ...editingTable, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  القسم في الصالة
                </label>
                <select
                  value={editingTable.zone || 'singles'}
                  onChange={(e) => setEditingTable({ ...editingTable, zone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="singles">قسم الأفراد 👤</option>
                  <option value="families">قسم العوائل والكبائن 👨‍👩‍👧‍👦</option>
                  <option value="outdoor">التراس والجلسات الخارجية 🌿</option>
                  <option value="vip">أجنحة كبار الشخصيات VIP 👑</option>
                  <option value="bar">كاونتر بار ☕</option>
                </select>
              </div>

              {branches.length > 0 && (
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    الفرع التابع له الطاولة
                  </label>
                  <select
                    value={editingTable.branch_id || ''}
                    onChange={(e) =>
                      setEditingTable({
                        ...editingTable,
                        branch_id: e.target.value || null,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="">جميع الفروع (عام)</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
                >
                  حفظ الطاولة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 🖨️ MODAL: PRINT TABLE QR STICKERS                        */}
      {/* ======================================================== */}
      <TableStickerPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        store={store}
        tables={tables}
        selectedSingleTable={singlePrintTable}
      />
    </div>
  );
};

import React, { useState, useMemo, useEffect } from 'react';
import {
  Utensils,
  X,
  Check,
  Search,
  Users,
  Coffee,
  Sparkles,
  Layers,
  Clock,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { DiningTable } from '../types';
import { TableService } from '../lib/tableService';

interface CashierTableSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTable: string;
  activeOrders?: any[];
  onSelectTable: (tableNum: string) => void;
  storeId?: string;
  activeBranchId?: string | null;
}

export const CashierTableSelectorModal: React.FC<CashierTableSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedTable,
  activeOrders = [],
  onSelectTable,
  storeId,
  activeBranchId,
}) => {
  const [activeZone, setActiveZone] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [tables, setTables] = useState<DiningTable[]>([]);

  // Reload tables from TableService
  useEffect(() => {
    if (isOpen) {
      const storeTables = TableService.getTables(storeId || 'default', activeBranchId);
      setTables(storeTables);
    }
  }, [isOpen, storeId, activeBranchId]);

  const zonesList: { id: string; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'singles', label: 'الأفراد 👤' },
    { id: 'families', label: 'العوائل 👨‍👩‍👧‍👦' },
    { id: 'outdoor', label: 'التراس الخارجي 🌿' },
    { id: 'vip', label: 'أجنحة VIP 👑' },
    { id: 'bar', label: 'كاونتر بار ☕' },
  ];

  // Filtered tables by Zone and Search
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchZone = activeZone === 'all' || t.zone === activeZone;
      const matchSearch =
        searchQuery.trim() === '' ||
        t.table_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchZone && matchSearch;
    });
  }, [tables, activeZone, searchQuery]);

  // Overall Occupancy Stats
  const occupancyStats = useMemo(() => {
    let occupiedCount = 0;
    tables.forEach((t) => {
      const occ = TableService.getTableOccupancy(t.table_number, activeOrders);
      if (occ.isOccupied) occupiedCount++;
    });
    return {
      occupied: occupiedCount,
      vacant: Math.max(0, tables.length - occupiedCount),
      total: tables.length,
    };
  }, [tables, activeOrders]);

  if (!isOpen) return null;

  const handleChoose = (tableNum: string) => {
    onSelectTable(tableNum);
    onClose();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInput.trim()) {
      handleChoose(customInput.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in text-right" dir="rtl">
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scale-up">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white">خريطة وحالة طاولات الصالة</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                  {occupancyStats.vacant} متاح • {occupancyStats.occupied} مشغول
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                حدد طاولة لربط الطلب المحلي بها أو متابعة حالة الفاتورة المفتوحة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Zones Switcher */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/40 space-y-2.5">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث برقم الطاولة أو اسمها..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-xs text-white rounded-xl pr-9 pl-3 py-2 outline-none focus:border-amber-500"
            />
          </div>

          {/* Zones Tabs */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {zonesList.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setActiveZone(z.id)}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  activeZone === z.id
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tables Grid */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {filteredTables.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              لا توجد طاولات تطابق البحث. يمكنك كتابة رقم طاولة يدوياً بالأسفل.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredTables.map((tbl) => {
                const occupancy = TableService.getTableOccupancy(tbl.table_number, activeOrders);
                const isOccupied = occupancy.isOccupied;
                const isSelected = selectedTable === tbl.table_number;

                return (
                  <button
                    key={tbl.id}
                    type="button"
                    onClick={() => handleChoose(tbl.table_number)}
                    className={`p-3.5 rounded-2xl border text-center transition flex flex-col justify-between gap-2 relative text-right group ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xl shadow-amber-500/20 scale-[1.02]'
                        : isOccupied
                        ? 'bg-rose-950/20 border-rose-500/40 text-rose-200 hover:bg-rose-950/30'
                        : 'bg-slate-950/90 border-slate-800 text-slate-200 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                  >
                    {/* Status Pill & Table Number Header */}
                    <div className="flex items-center justify-between w-full">
                      <strong className={`font-mono font-black text-base sm:text-lg ${isSelected ? 'text-slate-950' : 'text-white'}`}>
                        #{tbl.table_number}
                      </strong>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                          isSelected
                            ? 'bg-black text-amber-400 border-black'
                            : isOccupied
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOccupied ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'
                          }`}
                        />
                        <span>{isOccupied ? 'مشغولة' : 'شاغرة'}</span>
                      </span>
                    </div>

                    {/* Table Name and Zone */}
                    <div className="w-full text-right">
                      <span className={`text-xs font-bold block truncate ${isSelected ? 'text-slate-900' : 'text-slate-200'}`}>
                        {tbl.name}
                      </span>
                      <span className={`text-[10px] block ${isSelected ? 'text-slate-800 font-bold' : 'text-slate-500'}`}>
                        {TableService.getZoneLabel(tbl.zone)}
                      </span>
                    </div>

                    {/* Occupancy Info or Capacity */}
                    <div className={`w-full pt-2 border-t text-[11px] font-mono flex items-center justify-between ${
                      isSelected ? 'border-black/20 text-slate-900' : 'border-slate-800/80'
                    }`}>
                      {isOccupied ? (
                        <>
                          <span className="font-bold flex items-center gap-1 text-rose-400">
                            <Clock className="w-3 h-3" />
                            <span>{occupancy.elapsedMinutes} د</span>
                          </span>
                          <span className="font-black text-amber-400">
                            {occupancy.orderAmount?.toFixed(0)} ﷼
                          </span>
                        </>
                      ) : (
                        <span className={`flex items-center gap-1 text-[10px] ${isSelected ? 'text-slate-800' : 'text-slate-400'}`}>
                          <Users className="w-3 h-3" />
                          <span>{tbl.capacity} مقاعد</span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Manual Table Number Input */}
          <div className="pt-3 border-t border-slate-800">
            <form onSubmit={handleCustomSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="أو اكتب رقم طاولة أو جلسة يدوياً..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none"
              />
              <button
                type="submit"
                disabled={!customInput.trim()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition disabled:opacity-50"
              >
                اختيار ✅
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> شاغرة (متاحة)
            </span>
            <span className="flex items-center gap-1 text-rose-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> مشغولة بطلب جاري
            </span>
          </div>

          {selectedTable && (
            <button
              type="button"
              onClick={() => handleChoose('')}
              className="text-xs text-rose-400 hover:underline font-bold"
            >
              إلغاء رقم الطاولة ✖
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

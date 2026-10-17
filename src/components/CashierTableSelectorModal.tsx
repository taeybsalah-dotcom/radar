import React, { useState, useMemo } from 'react';
import { Store, StoreStaff, StoreBranch } from '../types';
import {
  Utensils,
  X,
  Check,
  Search,
  Users,
  Coffee,
  Sparkles,
  Layers,
} from 'lucide-react';

interface CashierTableSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTable: string;
  activeOrders?: any[];
  onSelectTable: (tableNum: string) => void;
}

interface TableDef {
  id: string;
  number: string;
  name: string;
  zone: 'singles' | 'families' | 'outdoor' | 'vip';
  capacity: number;
}

const DEFAULT_TABLES: TableDef[] = [
  // Singles
  { id: 't1', number: '1', name: 'طاولة 1', zone: 'singles', capacity: 2 },
  { id: 't2', number: '2', name: 'طاولة 2', zone: 'singles', capacity: 2 },
  { id: 't3', number: '3', name: 'طاولة 3', zone: 'singles', capacity: 4 },
  { id: 't4', number: '4', name: 'طاولة 4', zone: 'singles', capacity: 4 },
  { id: 't5', number: '5', name: 'طاولة 5', zone: 'singles', capacity: 2 },
  { id: 't6', number: '6', name: 'طاولة 6', zone: 'singles', capacity: 4 },
  // Families
  { id: 't11', number: '11', name: 'عوائل 11', zone: 'families', capacity: 6 },
  { id: 't12', number: '12', name: 'عوائل 12', zone: 'families', capacity: 6 },
  { id: 't13', number: '13', name: 'عوائل 13', zone: 'families', capacity: 8 },
  { id: 't14', number: '14', name: 'عوائل 14', zone: 'families', capacity: 4 },
  { id: 't15', number: '15', name: 'عوائل 15', zone: 'families', capacity: 6 },
  // Outdoor
  { id: 't21', number: '21', name: 'تراس خارجي 21', zone: 'outdoor', capacity: 4 },
  { id: 't22', number: '22', name: 'تراس خارجي 22', zone: 'outdoor', capacity: 4 },
  { id: 't23', number: '23', name: 'تراس خارجي 23', zone: 'outdoor', capacity: 2 },
  { id: 't24', number: '24', name: 'تراس خارجي 24', zone: 'outdoor', capacity: 4 },
  // VIP
  { id: 'v1', number: 'VIP-1', name: 'جناح VIP 1', zone: 'vip', capacity: 10 },
  { id: 'v2', number: 'VIP-2', name: 'جناح VIP 2', zone: 'vip', capacity: 8 },
];

export const CashierTableSelectorModal: React.FC<CashierTableSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedTable,
  activeOrders = [],
  onSelectTable,
}) => {
  if (!isOpen) return null;

  const [activeZone, setActiveZone] = useState<'all' | 'singles' | 'families' | 'outdoor' | 'vip'>('all');
  const [customInput, setCustomInput] = useState('');

  // Identify occupied tables from active orders
  const occupiedTableNumbers = useMemo(() => {
    const set = new Set<string>();
    activeOrders.forEach((o) => {
      if (
        (o.status === 'pending' || o.status === 'accepted' || o.status === 'preparing' || o.status === 'ready') &&
        o.fulfillment_type === 'dine_in' &&
        o.fulfillment_details?.table_number
      ) {
        set.add(String(o.fulfillment_details.table_number).trim());
      }
    });
    return set;
  }, [activeOrders]);

  const filteredTables = useMemo(() => {
    if (activeZone === 'all') return DEFAULT_TABLES;
    return DEFAULT_TABLES.filter((t) => t.zone === activeZone);
  }, [activeZone]);

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
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scale-up">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">خريطة واختيار الطاولات</h2>
              <p className="text-xs text-slate-400">حدد طاولة الصالة لربط الطلب المحلي بها</p>
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

        {/* Zones Tabs */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'singles', label: 'الأفراد 👤' },
              { id: 'families', label: 'العوائل 👨‍👩‍👧‍👦' },
              { id: 'outdoor', label: 'التراس الخارجي 🌿' },
              { id: 'vip', label: 'أجنحة VIP ✨' },
            ].map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setActiveZone(z.id as any)}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  activeZone === z.id
                    ? 'bg-amber-500 text-black shadow-md'
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
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {filteredTables.map((tbl) => {
              const isOccupied = occupiedTableNumbers.has(tbl.number);
              const isSelected = selectedTable === tbl.number;

              return (
                <button
                  key={tbl.id}
                  type="button"
                  onClick={() => handleChoose(tbl.number)}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-between gap-1 relative ${
                    isSelected
                      ? 'bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20 scale-105'
                      : isOccupied
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                      : 'bg-slate-950/90 border-slate-800 text-slate-200 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  {/* Status Indicator Dot */}
                  <span className={`w-2 h-2 rounded-full absolute top-2 right-2 ${
                    isOccupied ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'
                  }`} />

                  <span className="text-[10px] text-slate-400 font-bold">
                    {tbl.zone === 'vip' ? 'VIP' : `${tbl.capacity} مقاعد`}
                  </span>

                  <strong className={`font-mono font-black text-sm sm:text-base ${isSelected ? 'text-black' : 'text-white'}`}>
                    #{tbl.number}
                  </strong>

                  <span className={`text-[9px] font-bold ${
                    isSelected ? 'text-black' : isOccupied ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {isOccupied ? 'مشغولة 🔴' : 'متاحة 🟢'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Manual Table Number Input */}
          <div className="pt-3 border-t border-slate-800">
            <form onSubmit={handleCustomSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="أو اكتب رقم طاولة يدوياً..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none"
              />
              <button
                type="submit"
                disabled={!customInput.trim()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition disabled:opacity-50"
              >
                اختيار ✅
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> متاح
            </span>
            <span className="flex items-center gap-1 text-rose-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> مشغول بطلب جاري
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

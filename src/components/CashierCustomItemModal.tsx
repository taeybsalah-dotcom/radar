import React, { useState } from 'react';
import { CatalogItem } from '../types';
import { playBeepSound } from '../lib/sound';
import {
  PlusCircle,
  X,
  Check,
  DollarSign,
  Layers,
  FileText,
  Plus,
  Minus,
} from 'lucide-react';

interface CashierCustomItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCustomItem: (item: CatalogItem, quantity: number, notes?: string) => void;
}

const COMMON_CUSTOM_PRESETS = [
  'رسوم توصيل / خدمة خاصة 🛵',
  'طلب تعديل خاص / إضافة ☕',
  'كيكة أو مناسبة طلب مسبق 🎂',
  'علبة مياه أو مشروب غازي 🥤',
  'صنف تسويقي مؤقت 🏷️',
];

export const CashierCustomItemModal: React.FC<CashierCustomItemModalProps> = ({
  isOpen,
  onClose,
  onAddCustomItem,
}) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | ''>('');
  const [quantity, setQuantity] = useState(1);
  const [category, setCategory] = useState('طلبات خاصة');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('يرجى إدخال اسم الصنف المخصص');
      return;
    }
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setErrorMsg('يرجى إدخال سعر صحيح (0 أو أكثر)');
      return;
    }

    const customCatalogItem: CatalogItem = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      store_id: '',
      name: name.trim(),
      price: numPrice,
      category: category.trim() || 'طلبات خاصة',
      description: notes.trim() || 'صنف مخصص حر',
      item_type: 'product',
      is_available: true,
      created_at: new Date().toISOString(),
    };

    playBeepSound('success');
    onAddCustomItem(customCatalogItem, quantity, notes.trim() || undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in text-right" dir="rtl">
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col animate-scale-up">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">إضافة صنف مخصص بسعر حر</h2>
              <p className="text-xs text-slate-400">للأصناف والخدمات والطلبات غير المدرجة في المنيو</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          
          {/* Preset Buttons */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400 block font-semibold">أصناف شائعة سريعة:</label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_CUSTOM_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setName(preset)}
                  className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:text-white hover:border-slate-700 transition"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300 block">اسم الصنف أو الخدمة:</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="مثال: رسوم تغليف خاص، إضافة نكهة خاصة..."
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrorMsg(null);
              }}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
            />
          </div>

          {/* Price and Quantity Grid */}
          <div className="grid grid-cols-2 gap-3">
            
            {/* Price */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 block">السعر (شامل الضريبة ﷼):</label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value === '' ? '' : Number(e.target.value));
                    setErrorMsg(null);
                  }}
                  className="w-full bg-slate-950 border-2 border-amber-500/50 focus:border-amber-400 rounded-xl px-3 py-2 text-lg font-black font-mono text-center text-amber-400 outline-none"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">﷼</span>
              </div>
            </div>

            {/* Quantity Stepper */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 block">الكمية:</label>
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm transition"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-base font-black font-mono text-white">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400 block font-semibold">ملاحظات التحضير (اختياري):</label>
            <input
              type="text"
              placeholder="مثال: بدون سكر، حار، تسليم سريع..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none"
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-400 font-bold">{errorMsg}</p>
          )}

          {/* Total Preview and Submit */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 block">إجمالي الصنف:</span>
              <strong className="text-base font-black font-mono text-emerald-400">
                {((Number(price) || 0) * quantity).toFixed(2)} ﷼
              </strong>
            </div>

            <button
              type="submit"
              className="py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs shadow-lg shadow-amber-500/20 transition active:scale-95 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>إضافة للسلة 🛒</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

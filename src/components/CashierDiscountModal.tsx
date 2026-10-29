import React, { useState, useMemo } from 'react';
import { Store, StoreStaff, POSCartDiscount } from '../types';
import { playBeepSound } from '../lib/sound';
import {
  Percent,
  Tag,
  Gift,
  DollarSign,
  X,
  Check,
  Trash2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface CashierDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  currentDiscount: POSCartDiscount | null;
  onApplyDiscount: (discount: POSCartDiscount) => void;
  onRemoveDiscount: () => void;
}

const PERCENT_PRESETS = [5, 10, 15, 20, 25, 50];
const FIXED_PRESETS = [5, 10, 15, 20, 50, 100];

const DISCOUNT_REASONS = [
  'خصم بموافقة الإدارة 👔',
  'ضيافة ومجاملة VIP ✨',
  'تعويض عميل عن تأخير أو ملاحظة 🤝',
  'خصم موظف أو شريك 👨‍🍳',
  'عرض ترويجي موسمي 🏷️',
];

export const CashierDiscountModal: React.FC<CashierDiscountModalProps> = ({
  isOpen,
  onClose,
  subtotal,
  currentDiscount,
  onApplyDiscount,
  onRemoveDiscount,
}) => {
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | 'complimentary' | 'coupon'>(
    currentDiscount?.type || 'percentage'
  );
  const [inputValue, setInputValue] = useState<number | ''>(
    currentDiscount ? currentDiscount.value : 10
  );
  const [couponCodeInput, setCouponCodeInput] = useState<string>(
    currentDiscount?.coupon_code || ''
  );
  const [selectedReason, setSelectedReason] = useState<string>(
    currentDiscount?.reason || DISCOUNT_REASONS[0]
  );
  const [customReason, setCustomReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveReason = customReason.trim() ? customReason.trim() : selectedReason;

  // Calculate live discount amount
  const calculatedDiscountAmount = useMemo(() => {
    if (subtotal <= 0) return 0;

    if (discountType === 'complimentary') {
      return subtotal;
    }

    if (discountType === 'percentage') {
      const pct = Math.min(100, Math.max(0, Number(inputValue) || 0));
      return Math.round(((subtotal * pct) / 100) * 100) / 100;
    }

    if (discountType === 'fixed') {
      const amt = Math.max(0, Number(inputValue) || 0);
      return Math.min(subtotal, Math.round(amt * 100) / 100);
    }

    if (discountType === 'coupon') {
      // Standard coupon logic (e.g. 15% or 20 SAR default if valid format)
      const amt = Number(inputValue) || 15;
      return Math.min(subtotal, Math.round(amt * 100) / 100);
    }

    return 0;
  }, [subtotal, discountType, inputValue]);

  const newTotal = Math.max(0, Math.round((subtotal - calculatedDiscountAmount) * 100) / 100);

  // Handle Apply
  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (calculatedDiscountAmount <= 0 && discountType !== 'complimentary') {
      setErrorMsg('قيمة الخصم يجب أن تكون أكبر من صفر');
      return;
    }

    if (discountType === 'coupon' && !couponCodeInput.trim()) {
      setErrorMsg('يرجى إدخال رمز الكوبون الترويجي');
      return;
    }

    playBeepSound('success');
    onApplyDiscount({
      type: discountType,
      value: discountType === 'complimentary' ? 100 : Number(inputValue) || 0,
      amount: calculatedDiscountAmount,
      reason: discountType === 'coupon' ? `كوبون خصم [${couponCodeInput.trim().toUpperCase()}]` : effectiveReason,
      coupon_code: discountType === 'coupon' ? couponCodeInput.trim().toUpperCase() : undefined,
    });
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
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">تطبيق خصم على الفاتورة</h2>
              <p className="text-xs text-slate-400">
                إجمالي السلة الحالي: <strong className="text-amber-400 font-mono">{subtotal.toFixed(2)} ﷼</strong>
              </p>
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
        <form onSubmit={handleApply} className="p-4 sm:p-6 space-y-4">
          
          {/* Discount Type Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-2xl border border-slate-800 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => {
                setDiscountType('percentage');
                setInputValue(10);
                setErrorMsg(null);
              }}
              className={`py-2 rounded-xl transition ${
                discountType === 'percentage'
                  ? 'bg-amber-500 text-black font-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              نسبة %
            </button>

            <button
              type="button"
              onClick={() => {
                setDiscountType('fixed');
                setInputValue(10);
                setErrorMsg(null);
              }}
              className={`py-2 rounded-xl transition ${
                discountType === 'fixed'
                  ? 'bg-amber-500 text-black font-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              مبلغ ﷼
            </button>

            <button
              type="button"
              onClick={() => {
                setDiscountType('complimentary');
                setInputValue(100);
                setErrorMsg(null);
              }}
              className={`py-2 rounded-xl transition ${
                discountType === 'complimentary'
                  ? 'bg-emerald-500 text-black font-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ضيافة 100%
            </button>

            <button
              type="button"
              onClick={() => {
                setDiscountType('coupon');
                setErrorMsg(null);
              }}
              className={`py-2 rounded-xl transition ${
                discountType === 'coupon'
                  ? 'bg-blue-500 text-white font-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              كوبون 🏷️
            </button>
          </div>

          {/* Type-specific Input */}
          {discountType === 'percentage' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">نسبة الخصم المئوية (%):</label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  autoFocus
                  placeholder="10"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-950 border-2 border-amber-500/60 focus:border-amber-400 rounded-2xl px-4 py-3 text-2xl font-black font-mono text-center text-amber-400 outline-none shadow-inner"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">%</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1">
                {PERCENT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setInputValue(p)}
                    className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition ${
                      inputValue === p ? 'bg-amber-500 text-black border-amber-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {discountType === 'fixed' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">مبلغ الخصم المقطوع (﷼):</label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.5"
                  max={subtotal}
                  required
                  autoFocus
                  placeholder="10.00"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-950 border-2 border-amber-500/60 focus:border-amber-400 rounded-2xl px-4 py-3 text-2xl font-black font-mono text-center text-amber-400 outline-none shadow-inner"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">﷼</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1">
                {FIXED_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setInputValue(amt)}
                    className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition ${
                      inputValue === amt ? 'bg-amber-500 text-black border-amber-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {amt} ﷼
                  </button>
                ))}
              </div>
            </div>
          )}

          {discountType === 'complimentary' && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-1">
              <Sparkles className="w-6 h-6 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-black text-emerald-300">ضيافة كاملة 100% (مجاني)</h4>
              <p className="text-xs text-slate-400">سيتم تصفير إجمالي الفاتورة إلى 0.00 ﷼ مع توثيق اسم المسؤول والسبب</p>
            </div>
          )}

          {discountType === 'coupon' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">أدخل كود الكوبون الترويجي:</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="مثال: RADAR20 أو VIP"
                  value={couponCodeInput}
                  onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border-2 border-blue-500/60 focus:border-blue-400 rounded-2xl px-4 py-3 text-lg font-black font-mono text-center text-blue-400 uppercase outline-none shadow-inner"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>قيمة خصم الكوبون التقديري (﷼):</span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  placeholder="15"
                  value={inputValue}
                  onChange={(e) => setInputValue(Number(e.target.value) || 0)}
                  className="w-20 bg-slate-950 border border-slate-700 rounded-xl px-2 py-1 text-center font-mono font-bold text-white text-xs outline-none"
                />
              </div>
            </div>
          )}

          {/* Reason Selection */}
          {discountType !== 'coupon' && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-slate-300 block">سبب الخصم (للتدقيق الإداري):</label>
              <div className="grid grid-cols-1 gap-1">
                {DISCOUNT_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setSelectedReason(r);
                      setCustomReason('');
                    }}
                    className={`p-2 rounded-xl text-right text-xs font-bold border transition flex items-center justify-between ${
                      selectedReason === r && !customReason
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{r}</span>
                    {selectedReason === r && !customReason && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="أو اكتب سبباً آخر..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none"
              />
            </div>
          )}

          {/* Live Price Summary Box */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>المجموع قبل الخصم:</span>
              <span className="font-mono">{subtotal.toFixed(2)} ﷼</span>
            </div>
            <div className="flex justify-between text-rose-400 font-bold">
              <span>قيمة الخصم المحسوبة:</span>
              <span className="font-mono">-{calculatedDiscountAmount.toFixed(2)} ﷼</span>
            </div>
            <div className="flex justify-between text-white font-black text-sm pt-1.5 border-t border-slate-800">
              <span>الإجمالي النهائي المستحق:</span>
              <span className="font-mono text-emerald-400 text-base">{newTotal.toFixed(2)} ﷼</span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            {currentDiscount && (
              <button
                type="button"
                onClick={() => {
                  onRemoveDiscount();
                  onClose();
                }}
                className="p-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-bold transition flex items-center justify-center gap-1.5"
                title="إلغاء الخصم المطبق حالياً"
              >
                <Trash2 className="w-4 h-4" />
                <span>إلغاء الخصم</span>
              </button>
            )}

            <button
              type="submit"
              className="flex-1 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs shadow-xl shadow-amber-500/20 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>تطبيق الخصم على الفاتورة</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

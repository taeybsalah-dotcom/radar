import React, { useState, useEffect } from 'react';
import { Store, StoreStaff, StoreBranch, POSShift, POSCashMovement } from '../types';
import { LoyaltyService } from '../lib/supabase';
import { playBeepSound } from '../lib/sound';
import confetti from 'canvas-confetti';
import {
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Check,
  Printer,
  Share2,
  Clock,
  User,
  Building2,
  AlertCircle,
  FileText,
  History,
  Sparkles,
  TrendingDown,
  Coins,
  Receipt,
  Tag,
} from 'lucide-react';

interface CashierCashMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
  activeStaff: StoreStaff;
  activeBranch: StoreBranch | null;
  activeShift?: POSShift | null;
  initialType?: 'cash_in' | 'cash_out';
  onMovementRecorded?: (movement: POSCashMovement) => void;
}

export const CASH_OUT_CATEGORIES = [
  { id: 'supplies', label: 'مشتريات عاجلة (ثلج/ماء/أكياس) 🧊', icon: '🧊' },
  { id: 'advance', label: 'عهدة مشتريات مؤقتة / سلفة 🤝', icon: '🤝' },
  { id: 'cleaning', label: 'أدوات نظافة ومستهلكات 🧹', icon: '🧹' },
  { id: 'delivery', label: 'رسوم توصيل / كباتن دليفري 🛵', icon: '🛵' },
  { id: 'maintenance', label: 'صيانة وتشغيل سريع 🔧', icon: '🔧' },
  { id: 'hospitality', label: 'ضيافة وبوفيه العاملين ☕', icon: '☕' },
  { id: 'safe_drop', label: 'توريد أمانات للإدارة (Safe Drop) 🏦', icon: '🏦' },
  { id: 'other', label: 'مصروفات أخرى 📝', icon: '📝' },
];

export const CASH_IN_REASONS = [
  'فكة إضافية للصندوق 🪙',
  'إيداع عهدة إضافية 💵',
  'إرجاع باقي مشتريات / عهدة 🔄',
  'تحصيل إيراد خارجي 📈',
];

const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];

export const CashierCashMovementModal: React.FC<CashierCashMovementModalProps> = ({
  isOpen,
  onClose,
  store,
  activeStaff,
  activeBranch,
  activeShift,
  initialType = 'cash_out',
  onMovementRecorded,
}) => {
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>(initialType);
  const [amount, setAmount] = useState<number | ''>('');
  
  // Expenses & Cash Out Fields
  const [selectedCategory, setSelectedCategory] = useState<string>(CASH_OUT_CATEGORIES[0].label);
  const [recipientName, setRecipientName] = useState<string>('');
  const [invoiceRef, setInvoiceRef] = useState<string>('');
  
  // Cash In Fields
  const [selectedCashInReason, setSelectedCashInReason] = useState<string>(CASH_IN_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Success Voucher State
  const [completedMovement, setCompletedMovement] = useState<POSCashMovement | null>(null);

  // Shift History State
  const [shiftMovements, setShiftMovements] = useState<POSCashMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Update movementType if initialType changes upon opening
  useEffect(() => {
    if (initialType) {
      setMovementType(initialType);
    }
  }, [initialType, isOpen]);

  // Load Shift Movements
  const loadMovements = async () => {
    setLoadingHistory(true);
    try {
      const data = await LoyaltyService.getStoreCashMovements(store.id, {
        branchId: activeBranch?.id || activeStaff.branch_id || null,
        shiftOpenedAt: activeShift?.opened_at,
        limit: 20,
      });
      setShiftMovements(data);
    } catch (err) {
      console.warn('Failed to load cash movements:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadMovements();
  }, [isOpen, movementType, store.id]);

  const effectiveReason =
    movementType === 'cash_in'
      ? customReason.trim() || selectedCashInReason
      : customReason.trim() || selectedCategory;

  // Handle Submit Movement
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setErrorMsg('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    if (!effectiveReason) {
      setErrorMsg('يرجى تحديد سبب أو بيان حركة النقدية');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await LoyaltyService.recordPOSCashMovement({
        store,
        activeStaff,
        activeBranch,
        activeShift,
        type: movementType,
        amount: numAmount,
        reason: effectiveReason,
        category: movementType === 'cash_out' ? selectedCategory : undefined,
        recipient_name: recipientName.trim() || undefined,
        invoice_ref: invoiceRef.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      playBeepSound('commission');
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: movementType === 'cash_in' ? ['#10B981', '#34D399', '#F59E0B'] : ['#F43F5E', '#FB7185', '#F59E0B'],
      });

      setCompletedMovement(res);
      setShiftMovements((prev) => [res, ...prev]);

      if (onMovementRecorded) {
        onMovementRecorded(res);
      }
    } catch (err: any) {
      console.error('Failed to record cash movement:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء تسجيل الحركة النقدية');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset Form for another entry
  const handleResetForNew = () => {
    setCompletedMovement(null);
    setAmount('');
    setRecipientName('');
    setInvoiceRef('');
    setCustomReason('');
    setNotes('');
    setErrorMsg(null);
  };

  // WhatsApp Share
  const handleShareWhatsApp = () => {
    if (!completedMovement) return;
    const isOut = completedMovement.type === 'cash_out';
    const text = `*${store.name} — ${isOut ? 'سند صرف مصروفات نثرية 💸' : 'سند إيداع فكة / عهدة 🪙'}*\n` +
      `--------------------------------\n` +
      `🔢 *رقم السند:* #${completedMovement.id.slice(-8).toUpperCase()}\n` +
      `💰 *المبلغ:* ${Number(completedMovement.amount).toFixed(2)} ر.س\n` +
      `🏷️ *البيان / الفئة:* ${completedMovement.reason}\n` +
      (completedMovement.recipient_name ? `👤 *المستلم:* ${completedMovement.recipient_name}\n` : '') +
      (completedMovement.invoice_ref ? `🧾 *رقم الفاتورة:* ${completedMovement.invoice_ref}\n` : '') +
      (completedMovement.notes ? `📝 *ملاحظات:* ${completedMovement.notes}\n` : '') +
      `👨‍💼 *الموظف:* ${completedMovement.staff_name}\n` +
      `🏢 *الفرع:* ${completedMovement.branch_name || 'الرئيسي'}\n` +
      `⏰ *الوقت:* ${new Date(completedMovement.created_at).toLocaleTimeString('ar-SA')}\n` +
      `--------------------------------\n` +
      `_تم التوثيق عبر Radar POS_`;

    const targetPhone = store.manager_contact || '';
    const cleanPhone = targetPhone.replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;
    const url = `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Thermal Print Voucher
  const handlePrintVoucher = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in text-right" dir="rtl">
      
      {/* 🖨️ Thermal Voucher Print Layout (Visible only in @media print) */}
      {completedMovement && (
        <div className="hidden print:block print:w-[80mm] print:p-2 print:text-black print:bg-white text-xs font-mono">
          <div className="text-center pb-2 border-b border-black">
            <h2 className="text-base font-black">{store.name}</h2>
            <p className="text-[10px]">{completedMovement.branch_name || 'الفرع الرئيسي'}</p>
            <p className="font-black text-sm mt-1">
              {completedMovement.type === 'cash_in'
                ? 'سند إيداع فكة / عهدة (CASH IN)'
                : 'سند صرف مصروفات نثرية (EXPENSE VOUCHER)'}
            </p>
            <p className="text-[9px] text-gray-700">رقم السند: #{completedMovement.id.slice(-8).toUpperCase()}</p>
          </div>

          <div className="py-2 space-y-1 text-[11px] border-b border-black">
            <div className="flex justify-between">
              <span>التاريخ:</span>
              <span>{new Date(completedMovement.created_at).toLocaleDateString('ar-SA')}</span>
            </div>
            <div className="flex justify-between">
              <span>الوقت:</span>
              <span>{new Date(completedMovement.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="flex justify-between">
              <span>الموظف:</span>
              <span>{completedMovement.staff_name}</span>
            </div>
            {completedMovement.recipient_name && (
              <div className="flex justify-between">
                <span>المستلم / الجهة:</span>
                <span>{completedMovement.recipient_name}</span>
              </div>
            )}
            {completedMovement.invoice_ref && (
              <div className="flex justify-between">
                <span>رقم الفاتورة:</span>
                <span>{completedMovement.invoice_ref}</span>
              </div>
            )}
          </div>

          <div className="py-2 border-b border-black space-y-1 text-center">
            <span className="text-[10px] text-gray-700 block">المبلغ المنصرف / المودع:</span>
            <span className="text-2xl font-black">{Number(completedMovement.amount).toFixed(2)} ر.س</span>
          </div>

          <div className="py-2 border-b border-black text-[10px] space-y-1">
            <p><strong>البيان / الفئة:</strong> {completedMovement.reason}</p>
            {completedMovement.notes && (
              <p><strong>ملاحظات:</strong> {completedMovement.notes}</p>
            )}
          </div>

          <div className="pt-4 pb-2 grid grid-cols-2 gap-4 text-center text-[10px]">
            <div>
              <p className="border-b border-black pb-8">توقيع المستلم</p>
            </div>
            <div>
              <p className="border-b border-black pb-8">توقيع الكاشير</p>
            </div>
          </div>

          <div className="text-center text-[8px] text-gray-600 pt-2">
            تم التوثيق عبر نظام Radar POS السحابي
          </div>
        </div>
      )}

      {/* 📱 On-screen Modal Card */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scale-up print:hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg ${
              movementType === 'cash_out'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-rose-500/10'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-emerald-500/10'
            }`}>
              {movementType === 'cash_out' ? <TrendingDown className="w-6 h-6" /> : <Coins className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                {movementType === 'cash_out' ? 'تسجيل مصروف نثري من الدرج 💸' : 'إيداع فكة وعهدة إضافية 🪙'}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                  movementType === 'cash_out'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}>
                  {movementType === 'cash_out' ? 'صرف نثريات' : 'إيداع فكة'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {movementType === 'cash_out'
                  ? 'توثيق المبالغ الخارجة من الصندوق لمشتريات المحل والصيانة والخدمات'
                  : 'توثيق الفكة المضافة للدرج لضمان دقة جرد الوردية (Z-Report)'}
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

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Completed Success Voucher View */}
          {completedMovement ? (
            <div className="space-y-4 animate-fade-in text-center">
              <div className={`w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-3xl shadow-xl ${
                completedMovement.type === 'cash_out'
                  ? 'bg-rose-500/20 border-2 border-rose-500 text-rose-400 shadow-rose-500/20'
                  : 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 shadow-emerald-500/20'
              }`}>
                {completedMovement.type === 'cash_out' ? '💸' : '🪙'}
              </div>

              <div>
                <h3 className="text-lg font-black text-white">
                  تم تسجيل {completedMovement.type === 'cash_out' ? 'سند صرف المصروف' : 'سند إيداع الفكة'} بنجاح!
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  تم خصم المبلغ من الرصيد المتوقع للدرج وضبط جرد الوردية الحالية تلقائياً
                </p>
              </div>

              {/* Voucher Summary Capsule */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400">النوع:</span>
                  <span className={`font-black ${completedMovement.type === 'cash_out' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {completedMovement.type === 'cash_out' ? 'سند صرف مصروفات نثرية (Cash Out) ➖' : 'إيداع فكة وعهدة (Cash In) ➕'}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400">المبلغ المسجل:</span>
                  <span className="text-lg font-black font-mono text-white">
                    {Number(completedMovement.amount).toFixed(2)} ﷼
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400">البيان / الفئة:</span>
                  <span className="font-bold text-slate-200">{completedMovement.reason}</span>
                </div>
                {completedMovement.recipient_name && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-slate-400">المستلم / الجهة:</span>
                    <span className="font-bold text-amber-300">{completedMovement.recipient_name}</span>
                  </div>
                )}
                {completedMovement.invoice_ref && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-slate-400">رقم الفاتورة الورقية:</span>
                    <span className="font-mono text-slate-300">{completedMovement.invoice_ref}</span>
                  </div>
                )}
                {completedMovement.notes && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-slate-400">ملاحظات:</span>
                    <span className="text-slate-300 italic">{completedMovement.notes}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                  <span>الموظف: {completedMovement.staff_name}</span>
                  <span>{new Date(completedMovement.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handlePrintVoucher}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
                >
                  <Printer className="w-4 h-4 text-amber-400" />
                  <span>طباعة السند 🖨️</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition"
                >
                  <Share2 className="w-4 h-4" />
                  <span>واتساب للإدارة 📱</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleResetForNew}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-bold text-xs border border-slate-700 transition"
                >
                  تسجيل حركة أخرى ➕
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs shadow-md transition"
                >
                  تم والعودة لنقطة البيع ✅
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Type Switcher Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setMovementType('cash_out')}
                  className={`py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition ${
                    movementType === 'cash_out'
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <TrendingDown className="w-4 h-4" />
                  <span>صرف مصروفات نثرية (Cash Out) 💸</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMovementType('cash_in')}
                  className={`py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition ${
                    movementType === 'cash_in'
                      ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Coins className="w-4 h-4" />
                  <span>إيداع فكة وعهدة (Cash In) 🪙</span>
                </button>
              </div>

              {/* Amount Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>{movementType === 'cash_out' ? 'مبلغ المصروف المنصرف من الدرج:' : 'مبلغ الفكة المودعة:'}</span>
                  <span className="text-[11px] text-slate-400 font-mono">ريال سعودي (SAR)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    autoFocus
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className={`w-full bg-slate-950 border-2 rounded-2xl px-4 py-3 text-2xl font-black font-mono text-center outline-none transition shadow-inner ${
                      movementType === 'cash_out'
                        ? 'border-rose-500/60 focus:border-rose-400 text-rose-400'
                        : 'border-emerald-500/60 focus:border-emerald-400 text-emerald-400'
                    }`}
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-500">
                    ﷼
                  </span>
                </div>

                {/* Quick Amount Chips */}
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmount(amt)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition shrink-0 ${
                        amount === amt
                          ? 'bg-slate-700 text-white border-amber-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {amt} ﷼
                    </button>
                  ))}
                </div>
              </div>

              {/* Expense Category / Cash In Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  {movementType === 'cash_out' ? 'تصنيف وبند المصروف:' : 'بيان وسبب الإيداع:'}
                </label>
                
                {movementType === 'cash_out' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {CASH_OUT_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat.label);
                          setCustomReason('');
                        }}
                        className={`p-2.5 rounded-xl text-right text-xs font-bold border transition flex items-center justify-between ${
                          selectedCategory === cat.label && !customReason
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
                            : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <span className="truncate">{cat.label}</span>
                        {selectedCategory === cat.label && !customReason && (
                          <Check className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {CASH_IN_REASONS.map((rsn) => (
                      <button
                        key={rsn}
                        type="button"
                        onClick={() => {
                          setSelectedCashInReason(rsn);
                          setCustomReason('');
                        }}
                        className={`p-2.5 rounded-xl text-right text-xs font-bold border transition flex items-center justify-between ${
                          selectedCashInReason === rsn && !customReason
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                            : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <span className="truncate">{rsn}</span>
                        {selectedCashInReason === rsn && !customReason && (
                          <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom Reason Input */}
                <input
                  type="text"
                  placeholder={
                    movementType === 'cash_out'
                      ? 'أو اكتب وصفاً دقيقاً للمصروف هنا...'
                      : 'أو اكتب سبباً مخصصاً للإيداع هنا...'
                  }
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none mt-1"
                />
              </div>

              {/* Specific Person & Invoice Ref Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-semibold block">
                    {movementType === 'cash_out' ? 'اسم المستلم / المحل:' : 'اسم المسلّم / المودع (اختياري):'}
                  </label>
                  <input
                    type="text"
                    placeholder={movementType === 'cash_out' ? 'مثال: محمد، بقالة الحي، فني الصيانة...' : 'مثال: محمد، السائق...'}
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-semibold block">
                    {movementType === 'cash_out' ? 'رقم الفاتورة الورقية (إن وجد):' : 'رقم الفاتورة / السند المرفق (إن وجد):'}
                  </label>
                  <input
                    type="text"
                    placeholder="رقم الإيصال / الفاتورة الورقية"
                    value={invoiceRef}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-semibold block">
                  ملاحظات إضافية (اختياري):
                </label>
                <textarea
                  rows={2}
                  placeholder="أي تفاصيل أخرى توثق هذا المبلغ للمحاسبة..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl p-2.5 text-xs text-white placeholder-slate-600 outline-none resize-none"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || !amount}
                className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  movementType === 'cash_out'
                    ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
                }`}
              >
                {isSubmitting ? (
                  <span>جاري تسجيل السند والاعتماد...</span>
                ) : (
                  <>
                    <span>{movementType === 'cash_out' ? 'صرف المصروف وطباعة السند 💸' : 'إيداع الفكة واعتماد الرصيد 🪙'}</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Current Shift Movements Accordion / History */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-amber-400" />
                سجل المصروفات والإيداعات في الوردية الحالية:
              </span>
              <span className="font-mono text-slate-500">({shiftMovements.length})</span>
            </div>

            {loadingHistory ? (
              <p className="text-center text-xs text-slate-500 py-3">جاري جلب الحركات...</p>
            ) : shiftMovements.length === 0 ? (
              <p className="text-center text-xs text-slate-600 py-2">لا توجد مصروفات أو إيداعات مسجلة في هذه الوردية حتى الآن</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar pr-1">
                {shiftMovements.map((mv) => (
                  <div
                    key={mv.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                        mv.type === 'cash_out' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {mv.type === 'cash_out' ? '💸' : '🪙'}
                      </span>
                      <div>
                        <p className="font-bold text-white truncate max-w-[180px]">
                          {mv.reason}
                          {mv.recipient_name && <span className="text-slate-400 text-[10px] mr-1">({mv.recipient_name})</span>}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {mv.staff_name} • {new Date(mv.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <strong className={`font-mono font-black text-xs ${
                      mv.type === 'cash_out' ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {mv.type === 'cash_out' ? '-' : '+'}{Number(mv.amount).toFixed(2)} ﷼
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

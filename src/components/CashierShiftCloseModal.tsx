import React, { useState, useEffect, useMemo } from 'react';
import { Store, StoreStaff, StoreBranch, POSShift } from '../types';
import { LoyaltyService } from '../lib/supabase';
import { playBeepSound } from '../lib/sound';
import confetti from 'canvas-confetti';
import {
  Lock,
  DollarSign,
  CreditCard,
  Receipt,
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  Building2,
  User,
  Clock,
  Send,
  RotateCcw,
  ShieldCheck,
  Percent,
} from 'lucide-react';

interface CashierShiftCloseModalProps {
  store: Store;
  activeStaff: StoreStaff;
  activeBranch: StoreBranch | null;
  isOpen: boolean;
  onClose: () => void;
  onShiftClosed?: (shift: POSShift) => void;
}

export const CashierShiftCloseModal: React.FC<CashierShiftCloseModalProps> = ({
  store,
  activeStaff,
  activeBranch,
  isOpen,
  onClose,
  onShiftClosed,
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [shift, setShift] = useState<POSShift | null>(null);
  const [closedShift, setClosedShift] = useState<POSShift | null>(null);

  // Financial Summary from Live Orders
  const [ordersSummary, setOrdersSummary] = useState({
    orders_count: 0,
    total_sales: 0,
    cash_sales: 0,
    card_sales: 0,
    split_sales: 0,
    tax_amount: 0,
    discount_amount: 0,
    total_refunds: 0,
    cash_refunds: 0,
    card_refunds: 0,
    refunds_count: 0,
    total_cash_in: 0,
    total_cash_out: 0,
    cash_movements_count: 0,
    net_sales: 0,
  });

  // Drawer Reconciliation State
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [actualCash, setActualCash] = useState<number | ''>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'sending' | 'sent' | 'skipped'>('idle');

  // Load Active Shift & Orders Summary
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setErrorMsg(null);
    setClosedShift(null);

    const initShift = async () => {
      try {
        const active = await LoyaltyService.getOrCreateActiveShift(store, activeStaff, activeBranch);
        if (!isMounted) return;

        setShift(active);
        setOpeningCash(Number(active.opening_cash) || 0);

        const summary = await LoyaltyService.getShiftOrdersSummary(
          store.id,
          active.opened_at,
          activeBranch?.id || activeStaff.branch_id
        );
        if (!isMounted) return;

        setOrdersSummary(summary);
      } catch (err: any) {
        console.error('Failed to load shift data:', err);
        if (isMounted) setErrorMsg('تعذر تحميل بيانات الوردية الحالية');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initShift();

    return () => {
      isMounted = false;
    };
  }, [isOpen, store.id, activeStaff.id, activeBranch?.id]);

  // Calculations
  const expectedCash = useMemo(() => {
    return (
      Number(openingCash || 0) +
      Number(ordersSummary.cash_sales || 0) -
      Number(ordersSummary.cash_refunds || 0) +
      Number(ordersSummary.total_cash_in || 0) -
      Number(ordersSummary.total_cash_out || 0)
    );
  }, [
    openingCash,
    ordersSummary.cash_sales,
    ordersSummary.cash_refunds,
    ordersSummary.total_cash_in,
    ordersSummary.total_cash_out,
  ]);

  const difference = useMemo(() => {
    if (actualCash === '') return 0;
    return Number(actualCash) - expectedCash;
  }, [actualCash, expectedCash]);

  // Handle Confirm Close Shift
  const handleConfirmClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return;

    if (actualCash === '') {
      setErrorMsg('يرجى إدخال المبلغ النقدي الفعلي الموجود بالدرج');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setTelegramStatus('sending');

    try {
      const closed = await LoyaltyService.closePOSShift({
        store,
        shift: {
          ...shift,
          opening_cash: openingCash,
        },
        actualCash: Number(actualCash),
        notes,
        summary: ordersSummary,
      });

      setClosedShift(closed);
      setTelegramStatus(closed.telegram_sent ? 'sent' : 'skipped');
      playBeepSound('success');
      confetti({ particleCount: 60, spread: 55, origin: { y: 0.6 } });

      if (onShiftClosed) {
        onShiftClosed(closed);
      }
    } catch (err: any) {
      console.error('Failed to close shift:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء تقفيل الوردية');
      playBeepSound('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in" dir="rtl">
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl relative my-auto space-y-4 max-h-[92vh] overflow-y-auto">
        
        {/* Header Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
          title="إغلاق النافذة"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* VIEW 1: RECONCILIATION & CLOSING FORM                        */}
        {/* ════════════════════════════════════════════════════════════ */}
        {!closedShift ? (
          <div className="space-y-4">
            
            {/* Modal Title */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">تقفيل الوردية وجرد الصندوق (Z-Report)</h3>
                <p className="text-xs text-slate-400">
                  مطابقة مبيعات الكاش والشبكة وإرسال تقرير الإغلاق لمالك المتجر 🔒
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <span className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></span>
                <span>جاري احتساب وجرد مبيعات الوردية الحالية...</span>
              </div>
            ) : (
              <form onSubmit={handleConfirmClose} className="space-y-4">
                
                {/* Shift Details Capsule */}
                <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">الكاشير المسؤول:</span>
                    <strong className="text-white flex items-center gap-1 font-bold">
                      <User className="w-3.5 h-3.5 text-amber-400" />
                      {activeStaff.name}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">الفرع النشط:</span>
                    <strong className="text-white flex items-center gap-1 font-bold">
                      <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                      {activeBranch ? activeBranch.name : 'الفرع الرئيسي'}
                    </strong>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      بدء الوردية: {shift ? new Date(shift.opened_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    <span>
                      التاريخ: {shift ? new Date(shift.opened_at).toLocaleDateString('ar-SA') : ''}
                    </span>
                  </div>
                </div>

                {/* Sales Breakdown Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>ملخص مبيعات الوردية:</span>
                    <span className="text-amber-400 font-mono">({ordersSummary.orders_count} فاتورة صادرة)</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    
                    {/* Total Sales */}
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border border-emerald-500/30 text-center">
                      <span className="text-[10px] text-emerald-300 block font-bold">إجمالي المبيعات</span>
                      <strong className="text-sm sm:text-base font-black text-emerald-400 font-mono">
                        {ordersSummary.total_sales.toFixed(2)}
                      </strong>
                      <span className="text-[9px] text-slate-400 block">شامل الضريبة ﷼</span>
                    </div>

                    {/* Cash Sales */}
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold">مبيعات الكاش 💵</span>
                      <strong className="text-sm sm:text-base font-black text-white font-mono">
                        {ordersSummary.cash_sales.toFixed(2)}
                      </strong>
                      <span className="text-[9px] text-slate-500 block">ريال سعودي</span>
                    </div>

                    {/* Card Sales */}
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block font-bold">شبكة / مدى 💳</span>
                      <strong className="text-sm sm:text-base font-black text-white font-mono">
                        {ordersSummary.card_sales.toFixed(2)}
                      </strong>
                      <span className="text-[9px] text-slate-500 block">ريال سعودي</span>
                    </div>
                  </div>

                  {ordersSummary.split_sales > 0 && (
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex justify-between text-xs text-slate-400">
                      <span>دفع مجزأ (Split):</span>
                      <strong className="text-white font-mono">{ordersSummary.split_sales.toFixed(2)} ﷼</strong>
                    </div>
                  )}

                  {ordersSummary.total_refunds > 0 && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs space-y-1">
                      <div className="flex justify-between items-center text-rose-300 font-bold">
                        <span className="flex items-center gap-1">
                          <RotateCcw className="w-3.5 h-3.5" />
                          إجمالي المرتجعات ({ordersSummary.refunds_count} عملية):
                        </span>
                        <strong className="font-mono text-sm">-{ordersSummary.total_refunds.toFixed(2)} ﷼</strong>
                      </div>
                      <div className="flex justify-between text-[11px] text-rose-400/80">
                        <span>مرتجع نقدي (خرج من الدرج): -{ordersSummary.cash_refunds.toFixed(2)} ﷼</span>
                        <span>مرتجع شبكة: -{ordersSummary.card_refunds.toFixed(2)} ﷼</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-300 pt-1 border-t border-rose-500/20 font-bold">
                        <span>صافي المبيعات (Net Sales):</span>
                        <span className="font-mono text-emerald-400">{ordersSummary.net_sales.toFixed(2)} ﷼</span>
                      </div>
                    </div>
                  )}

                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                    <span>ضريبة القيمة المضافة المحصلة (15%):</span>
                    <strong className="text-slate-300 font-mono">{ordersSummary.tax_amount.toFixed(2)} ﷼</strong>
                  </div>
                </div>

                {/* 💵 Cash Drawer Reconciliation Section */}
                <div className="p-4 rounded-2xl bg-slate-950 border-2 border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-white flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-amber-400" />
                      جرد ومطابقة صندوق النقدية (Cash Drawer):
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    
                    {/* Opening Cash Float */}
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-semibold block">
                        العهدة الافتتاحية للصندوق:
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={openingCash}
                        onChange={(e) => setOpeningCash(Number(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-white font-mono font-bold text-center outline-none"
                      />
                    </div>

                    {/* Expected Cash in Drawer */}
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-semibold block">
                        النقد المتوقع بالدرج:
                      </label>
                      <div className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-amber-400 font-mono font-black text-center text-sm">
                        {expectedCash.toFixed(2)} ﷼
                      </div>
                    </div>
                  </div>

                  {(Number(ordersSummary.total_cash_in || 0) > 0 || Number(ordersSummary.total_cash_out || 0) > 0) && (
                    <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                      <div className="text-emerald-400 font-bold flex justify-between items-center">
                        <span>إيداعات نقدية (Cash In):</span>
                        <span className="font-mono">+{Number(ordersSummary.total_cash_in || 0).toFixed(2)} ﷼</span>
                      </div>
                      <div className="text-rose-400 font-bold flex justify-between items-center">
                        <span>مسحوبات ونثريات (Cash Out):</span>
                        <span className="font-mono">-{Number(ordersSummary.total_cash_out || 0).toFixed(2)} ﷼</span>
                      </div>
                    </div>
                  )}

                  {/* Actual Cash Input */}
                  <div className="space-y-1 pt-1">
                    <label className="text-xs text-white font-extrabold block">
                      المبلغ الفعلي الموجود بالدرج عند العدّ:
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        autoFocus
                        placeholder="0.00"
                        value={actualCash}
                        onChange={(e) => setActualCash(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-900 border-2 border-amber-500/70 focus:border-amber-400 rounded-2xl px-4 py-3 text-2xl font-black text-amber-400 text-center font-mono outline-none shadow-inner"
                        required
                      />
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        ريال
                      </span>
                    </div>
                  </div>

                  {/* Discrepancy Status Pill */}
                  {actualCash !== '' && (
                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs font-black animate-fade-in ${
                        Math.abs(difference) < 0.01
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : difference < 0
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 animate-shake'
                          : 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {Math.abs(difference) < 0.01 ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4" />
                        )}
                        <span>
                          {Math.abs(difference) < 0.01
                            ? 'مطابق تماماً 100% (لا يوجد عجز أو زيادة) ✅'
                            : difference < 0
                            ? `عجز في الصندوق: ${Math.abs(difference).toFixed(2)} ﷼ ⚠️`
                            : `زيادة في الصندوق: +${difference.toFixed(2)} ﷼ 🟢`}
                        </span>
                      </div>
                      <span className="font-mono text-sm">
                        {difference > 0 ? `+${difference.toFixed(2)}` : difference.toFixed(2)} ﷼
                      </span>
                    </div>
                  )}
                </div>

                {/* Notes Input */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium block">
                    ملاحظات إغلاق الوردية (اختياري):
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: تم تسليم الكاش للمشرف فهد في نهاية الوردية المسائية..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>

                {/* Telegram Bot Notice */}
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>
                    سيتم إرسال تقرير الوردية آلياً إلى بوت التلجرام الخاص بمالك المتجر فور التأكيد 🚀
                  </span>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-300 text-xs font-bold text-center">
                    {errorMsg}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                  >
                    إلغاء والعودة
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || actualCash === ''}
                    className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm flex items-center justify-center gap-2 transition shadow-lg disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{submitting ? 'جاري تقفيل الصندوق والإرسال...' : 'تأكيد الإغلاق وتقفيل الصندوق 🔒'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════════ */
          /* VIEW 2: Z-REPORT PRINTABLE THERMAL RECEIPT                   */
          /* ════════════════════════════════════════════════════════════ */
          <div className="space-y-4 animate-scale-up">
            
            {/* Success Message Banner */}
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>تم تقفيل الوردية والصندوق بنجاح وأرشفة السجل! 🔒</span>
              </div>
              {telegramStatus === 'sent' && (
                <span className="text-[10px] bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full font-mono">
                  تم إرسال تلجرام ✈️
                </span>
              )}
            </div>

            {/* Thermal Print Receipt Paper Box */}
            <div
              id="zatca-z-report-ticket"
              className="bg-white text-black p-5 rounded-2xl shadow-xl font-mono text-xs space-y-3 border border-slate-300 print:m-0 print:p-0 print:border-none"
            >
              {/* Header */}
              <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-slate-400">
                <h4 className="text-base font-black text-black">{store.name}</h4>
                <p className="text-[11px] text-slate-700 font-bold">{closedShift.branch_name || 'الفرع الرئيسي'}</p>
                <div className="py-1 my-1 bg-slate-100 rounded border border-slate-300">
                  <p className="text-xs font-black uppercase tracking-wider text-black">
                    تقرير تقفيل الصندوق والوردية (Z-REPORT)
                  </p>
                </div>
                {store.tax_number && (
                  <p className="text-[10px] text-slate-600">الرقم الضريبي: {store.tax_number}</p>
                )}
              </div>

              {/* Shift Timing & Staff */}
              <div className="text-[10px] text-slate-700 space-y-1 pb-2 border-b border-dashed border-slate-400">
                <div className="flex justify-between">
                  <span>الكاشير:</span>
                  <strong className="text-black font-bold">{closedShift.staff_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span>فتح الوردية:</span>
                  <span>{new Date(closedShift.opened_at).toLocaleTimeString('ar-SA')} ({new Date(closedShift.opened_at).toLocaleDateString('ar-SA')})</span>
                </div>
                <div className="flex justify-between">
                  <span>إغلاق الوردية:</span>
                  <span>{closedShift.closed_at ? new Date(closedShift.closed_at).toLocaleTimeString('ar-SA') : ''}</span>
                </div>
                <div className="flex justify-between">
                  <span>عدد الفواتير الصادرة:</span>
                  <strong className="text-black font-bold">{closedShift.orders_count} فاتورة</strong>
                </div>
              </div>

              {/* Financial Breakdown Table */}
              <div className="text-[11px] space-y-1 pb-2 border-b border-dashed border-slate-400">
                <div className="flex justify-between">
                  <span>إجمالي المبيعات (شامل الضريبة):</span>
                  <strong className="text-black font-bold">{Number(closedShift.total_sales).toFixed(2)} ﷼</strong>
                </div>
                {closedShift.total_refunds && Number(closedShift.total_refunds) > 0 && (
                  <>
                    <div className="flex justify-between text-rose-600">
                      <span>إجمالي المرتجعات ({closedShift.refunds_count || 0} عملية):</span>
                      <span>-{Number(closedShift.total_refunds).toFixed(2)} ﷼</span>
                    </div>
                    <div className="flex justify-between font-bold text-black border-t border-dotted border-slate-300 pt-0.5">
                      <span>صافي المبيعات الفعلي:</span>
                      <span>{(Number(closedShift.total_sales) - Number(closedShift.total_refunds)).toFixed(2)} ﷼</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>ضريبة القيمة المضافة (15%):</span>
                  <span>{Number(closedShift.tax_amount).toFixed(2)} ﷼</span>
                </div>
                {closedShift.discount_amount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>إجمالي الخصومات:</span>
                    <span>-{Number(closedShift.discount_amount).toFixed(2)} ﷼</span>
                  </div>
                )}
              </div>

              {/* Tender Breakdown */}
              <div className="text-[10px] space-y-1 pb-2 border-b border-dashed border-slate-400 text-slate-700">
                <div className="flex justify-between">
                  <span>مبيعات الكاش / النقدي:</span>
                  <strong className="text-black font-bold">{Number(closedShift.cash_sales).toFixed(2)} ﷼</strong>
                </div>
                {closedShift.cash_refunds && Number(closedShift.cash_refunds) > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>مرتجع نقدي (خرج من الدرج):</span>
                    <span>-{Number(closedShift.cash_refunds).toFixed(2)} ﷼</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>مبيعات الشبكة / مدى:</span>
                  <strong className="text-black font-bold">{Number(closedShift.card_sales).toFixed(2)} ﷼</strong>
                </div>
                {closedShift.card_refunds && Number(closedShift.card_refunds) > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>مرتجع شبكة / مدى:</span>
                    <span>-{Number(closedShift.card_refunds).toFixed(2)} ﷼</span>
                  </div>
                )}
                {closedShift.split_sales > 0 && (
                  <div className="flex justify-between">
                    <span>مبيعات الدفع المقسم:</span>
                    <strong className="text-black font-bold">{Number(closedShift.split_sales).toFixed(2)} ﷼</strong>
                  </div>
                )}
              </div>

              {/* Cash Reconciliation */}
              <div className="text-[11px] space-y-1 pb-2 border-b border-dashed border-slate-400 bg-slate-50 p-2 rounded">
                <div className="flex justify-between text-slate-600">
                  <span>العهدة الافتتاحية:</span>
                  <span>{Number(closedShift.opening_cash).toFixed(2)} ﷼</span>
                </div>
                {closedShift.total_cash_in && Number(closedShift.total_cash_in) > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>إيداعات نقدية (Cash In):</span>
                    <span>+{Number(closedShift.total_cash_in).toFixed(2)} ﷼</span>
                  </div>
                )}
                {closedShift.total_cash_out && Number(closedShift.total_cash_out) > 0 && (
                  <div className="flex justify-between text-rose-700 font-bold">
                    <span>مسحوبات ونثريات (Cash Out):</span>
                    <span>-{Number(closedShift.total_cash_out).toFixed(2)} ﷼</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-700">
                  <span>النقد المتوقع بالدرج:</span>
                  <strong>{Number(closedShift.expected_cash).toFixed(2)} ﷼</strong>
                </div>
                <div className="flex justify-between text-black font-black text-xs">
                  <span>النقد الفعلي المسلم:</span>
                  <span>{Number(closedShift.actual_cash).toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-300 font-black">
                  <span>فارق الصندوق:</span>
                  <span className={closedShift.cash_difference < 0 ? 'text-red-600' : 'text-emerald-700'}>
                    {closedShift.cash_difference > 0 ? `+${Number(closedShift.cash_difference).toFixed(2)}` : Number(closedShift.cash_difference).toFixed(2)} ﷼
                    {Math.abs(closedShift.cash_difference) < 0.01 ? ' (مطابق)' : closedShift.cash_difference < 0 ? ' (عجز)' : ' (زيادة)'}
                  </span>
                </div>
              </div>

              {/* Notes if any */}
              {closedShift.notes && (
                <div className="text-[10px] text-slate-600 border-b border-dashed border-slate-400 pb-2">
                  <strong>ملاحظات:</strong> {closedShift.notes}
                </div>
              )}

              {/* Signatures */}
              <div className="pt-3 grid grid-cols-2 gap-4 text-[10px] text-slate-700 text-center">
                <div>
                  <p className="font-bold">توقيع الكاشير:</p>
                  <p className="mt-4 border-b border-dotted border-slate-400"></p>
                </div>
                <div>
                  <p className="font-bold">توقيع المشرف / الإدارة:</p>
                  <p className="mt-4 border-b border-dotted border-slate-400"></p>
                </div>
              </div>

              <div className="text-center text-[9px] text-slate-500 pt-2 font-mono">
                نظام إدارة نقاط البيع السحابي - Radar Cloud POS
              </div>
            </div>

            {/* Receipt Modal Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>طباعة تقرير Z حرارياً 🖨️</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg"
              >
                <RotateCcw className="w-4 h-4" />
                <span>إنهاء والعودة لنقطة البيع 🚪</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

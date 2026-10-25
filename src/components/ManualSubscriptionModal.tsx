import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  Building2,
  Sparkles,
  CreditCard,
  Banknote,
  Receipt,
  Clock,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { Store, BillingPlan } from '../types';
import { LoyaltyService } from '../lib/supabase';

export interface ManualSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: Store[];
  preSelectedStoreId?: string;
  onSuccess?: (store: Store, invoice: any) => void;
}

export const ManualSubscriptionModal: React.FC<ManualSubscriptionModalProps> = ({
  isOpen,
  onClose,
  stores,
  preSelectedStoreId,
  onSuccess,
}) => {
  const [selectedStoreId, setSelectedStoreId] = useState<string>(preSelectedStoreId || '');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [amount, setAmount] = useState<number>(195);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ store: Store; invoice: any } | null>(null);

  // Load plans & sync store selection
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessResult(null);
      const syncPlans = LoyaltyService.getAllSubscriptionPlansSync();
      setPlans(syncPlans);
      if (syncPlans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(syncPlans[0].id || syncPlans[0].code || '');
        setAmount(Number(syncPlans[0].amount) || 195);
      }
      if (preSelectedStoreId) {
        setSelectedStoreId(preSelectedStoreId);
      } else if (!selectedStoreId && stores.length > 0) {
        setSelectedStoreId(stores[0].id);
      }
    }
  }, [isOpen, preSelectedStoreId]);

  const selectedStore = useMemo(() => {
    return stores.find((s) => s.id === selectedStoreId) || null;
  }, [stores, selectedStoreId]);

  const selectedPlan = useMemo(() => {
    return plans.find((p) => p.id === selectedPlanId || p.code === selectedPlanId) || null;
  }, [plans, selectedPlanId]);

  // Recalculate default amount when plan or duration changes
  const handleSelectPlan = (plan: BillingPlan) => {
    setSelectedPlanId(plan.id || plan.code || '');
    const planBase = Number(plan.amount) || 195;
    const planDur = Number(plan.duration_months) || 1;
    // If selecting a multi-month plan, sync duration
    if (planDur > 1) {
      setDurationMonths(planDur);
      setAmount(planBase);
    } else {
      setAmount(planBase * durationMonths);
    }
  };

  const handleDurationChange = (months: number) => {
    setDurationMonths(months);
    const basePerMonth = selectedPlan ? (Number(selectedPlan.amount) || 195) / (Number(selectedPlan.duration_months) || 1) : 195;
    setAmount(Math.round(basePerMonth * months));
  };

  // Compute projected expiration date
  const projectedExpiryDate = useMemo(() => {
    if (!selectedStore) return null;
    const now = new Date();
    const currentEnd = selectedStore.subscription_end_date ? new Date(selectedStore.subscription_end_date) : null;
    // If currently active and end date is in the future, extend from that date; otherwise from now
    const baseDate = currentEnd && currentEnd > now ? currentEnd : now;
    const newDate = new Date(baseDate);
    newDate.setMonth(newDate.getMonth() + durationMonths);
    return newDate.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [selectedStore, durationMonths]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) {
      setError('يرجى اختيار المتجر المراد تفعيل اشتراكه');
      return;
    }
    if (amount < 0) {
      setError('يرجى إدخال مبلغ صحيح');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const fullNotes = [
        paymentMethod === 'cash' ? 'سداد نقدي مباشر (كاش)' : 'سداد عبر تحويل بنكي',
        referenceNumber ? `رقم المرجع/الإيصال: ${referenceNumber.trim()}` : null,
        notes ? `ملاحظات: ${notes.trim()}` : null,
      ].filter(Boolean).join(' | ');

      const res = await LoyaltyService.manualActivateStoreSubscription({
        storeId: selectedStoreId,
        durationMonths,
        amount,
        paymentMethod,
        planId: selectedPlanId,
        notes: fullNotes,
      });

      if (!res.success) {
        throw new Error(res.error || 'فشلت معالجة التفعيل اليدوي');
      }

      setSuccessResult({
        store: res.store || selectedStore,
        invoice: res.invoice,
      });

      if (onSuccess && res.store) {
        onSuccess(res.store, res.invoice);
      }
    } catch (err: any) {
      console.error('[ManualSubscriptionModal] Error:', err);
      setError(err.message || 'حدث خطأ أثناء تفعيل الاشتراك يدوياً');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 text-right my-8 max-h-[92vh] overflow-y-auto">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 left-6 p-2 rounded-2xl bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success View */}
        {successResult ? (
          <div className="space-y-6 py-6 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white">تم تفعيل الاشتراك وتوثيق الفاتورة بنجاح! 🎉</h3>
              <p className="text-sm text-slate-400">
                أصبح متجر <span className="text-emerald-400 font-bold">{successResult.store?.name}</span> نشطاً الآن، وتم تمديد مدة اشتراكه وإصدار الفاتورة الرسمية في قاعدة البيانات.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs space-y-2.5 max-w-md mx-auto text-right">
              <div className="flex justify-between items-center text-slate-400">
                <span>تاريخ الانتهاء الجديد:</span>
                <strong className="text-white font-mono">{projectedExpiryDate}</strong>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>المبلغ المحصل:</span>
                <strong className="text-emerald-400 font-mono font-black">{amount} ر.س</strong>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>طريقة السداد:</span>
                <strong className="text-white">{paymentMethod === 'cash' ? 'نقداً (كاش) 💵' : 'تحويل بنكي 🏦'}</strong>
              </div>
              {successResult.invoice?.invoice_number && (
                <div className="flex justify-between items-center text-slate-400">
                  <span>رقم الفاتورة:</span>
                  <strong className="text-amber-400 font-mono">{successResult.invoice.invoice_number}</strong>
                </div>
              )}
            </div>

            <div className="pt-4">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20 transition"
              >
                إغلاق والعودة
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Header */}
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                <Banknote className="w-4 h-4" />
                <span>التحصيل اليدوي المباشر للاشتراكات</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">تفعيل / تجديد اشتراك المتجر (كاش أو بنكي)</h2>
              <p className="text-xs sm:text-sm text-slate-400">
                سجل المبالغ المستلمة باليد أو عبر الحوالات البنكية لتفعيل اشتراك التاجر فورياً وإصدار فاتورة نظامية.
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 1. Store Selector / Store Card */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">المتجر المستهدف:</label>
              {preSelectedStoreId && selectedStore ? (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-black">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{selectedStore.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        كود: {selectedStore.store_code || selectedStore.slug} | الحالة الحالية:{' '}
                        <span className={selectedStore.status === 'active' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                          {selectedStore.status === 'active' ? 'نشط' : selectedStore.status === 'trial' ? 'فترة تجريبية' : 'متوقف'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono">
                    {selectedStore.subscription_plan || 'الباقة الأساسية'}
                  </span>
                </div>
              ) : (
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500"
                  required
                >
                  <option value="">-- اختر المتجر --</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.store_code || s.slug}) - [{s.status === 'active' ? 'نشط' : 'تجريبي/متوقف'}]
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 2. Subscription Plan Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">باقة الاشتراك:</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {plans.map((p) => {
                  const isSelected = selectedPlanId === (p.id || p.code);
                  return (
                    <button
                      type="button"
                      key={p.id || p.code}
                      onClick={() => handleSelectPlan(p)}
                      className={`p-3 rounded-2xl border text-right transition ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white">{p.name}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {p.amount} ر.س / {p.duration_months} شهر
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Duration Selector (Months) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">مدة التفعيل الممنوحة:</label>
                {projectedExpiryDate && (
                  <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>سينتهي في: {projectedExpiryDate}</span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 3, 6, 12, 24].map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => handleDurationChange(m)}
                    className={`py-2.5 rounded-xl text-xs font-black transition border ${
                      durationMonths === m
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {m === 1 ? 'شهر واحد' : m === 12 ? 'سنة كاملة' : m === 24 ? 'سنتين' : `${m} أشهر`}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Payment Method & Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Payment Method Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">طريقة الاستلام:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 ${
                      paymentMethod === 'cash'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Banknote className="w-5 h-5" />
                    <span className="text-xs font-bold">نقداً (كاش 💵)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('bank_transfer')}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 ${
                      paymentMethod === 'bank_transfer'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="text-xs font-bold">تحويل بنكي 🏦</span>
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">المبلغ الفعلي المستلم (ر.س):</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono font-black text-lg focus:outline-none focus:border-emerald-500"
                    placeholder="المبلغ بالريال"
                    required
                  />
                  <span className="absolute left-4 top-3.5 text-xs text-slate-500 font-bold">ر.س SAR</span>
                </div>
              </div>
            </div>

            {/* 5. Reference Number & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 block">رقم الحوالة أو السند (اختياري):</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="مثال: REF-984210 أو سند رقم 104"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-slate-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 block">ملاحظات توثيقية (اختياري):</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: استلام نقدي بالفرع - خصم اتفاقية خاصة"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-slate-600"
                />
              </div>
            </div>

            {/* Notice */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                عملية التفعيل اليدوي ذرية ومحصنة بسيرفر رادار؛ تصدر فاتورة رسمية فورياً وتُقيد بالحسابات المالية كإيراد للمنصة بدون أي تضارب.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-5 py-3 rounded-2xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التفعيل وتوثيق الفاتورة...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد الاستلام وتفعيل المتجر فوراً ({amount} ر.س)</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  Sparkles,
  RefreshCw,
  X,
  Layers,
  Save,
  Check,
  Power,
  Clock,
  Zap,
  DollarSign,
  Gift,
} from 'lucide-react';
import { BillingPlan } from '../types';
import { LoyaltyService } from '../lib/supabase';

export const SuperAdminBillingConsole: React.FC = () => {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<BillingPlan | null>(null);

  // Form State
  const [planName, setPlanName] = useState('');
  const [planInterval, setPlanInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [planAmount, setPlanAmount] = useState<number | ''>(195);
  const [planFeaturesText, setPlanFeaturesText] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planTrialDays, setPlanTrialDays] = useState<number | ''>(7);
  const [isSaving, setIsSaving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchPlans = async () => {
    setLoadingPlans(true);
    try {
      const data = await LoyaltyService.getAllSubscriptionPlans();
      setPlans(data);
    } catch (err) {
      console.error('[SuperAdminBillingConsole] Fetch plans error:', err);
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleOpenAddModal = () => {
    setEditingPlan(null);
    setPlanName('');
    setPlanInterval('MONTHLY');
    setPlanAmount(195);
    setPlanDescription('');
    setPlanFeaturesText(
      'بطاقات ولاء رقمية (PWA) بدون تحميل تطبيق\nكاشير سريع لمسح الباركود وصرف النقاط\nنظام رتب ومستويات (Tiers) ذكي\nاستهداف العملاء المنقطعين تلقائياً\nدعم فني مخصص'
    );
    setPlanTrialDays(7);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (plan: BillingPlan) => {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setPlanInterval(plan.billing_interval || 'MONTHLY');
    setPlanAmount(plan.amount);
    setPlanDescription(plan.description || '');
    setPlanFeaturesText((plan.features || []).join('\n'));
    setPlanTrialDays(plan.trial_days ?? 7);
    setIsModalOpen(true);
  };

  const handleSavePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim() || planAmount === '') return;

    setIsSaving(true);
    try {
      const cleanFeatures = planFeaturesText
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      if (editingPlan && editingPlan.id) {
        const updated = await LoyaltyService.updateSubscriptionPlan(editingPlan.id, {
          name: planName.trim(),
          billing_interval: planInterval,
          amount: Number(planAmount),
          description: planDescription.trim(),
          features: cleanFeatures,
          trial_days: Number(planTrialDays) || 0,
        });
        setPlans(plans.map((p) => (p.id === editingPlan.id ? updated : p)));
        setActionSuccess(`تم تحديث خطة "${updated.name}" بنجاح 💾`);
      } else {
        const created = await LoyaltyService.addSubscriptionPlan({
          name: planName.trim(),
          billing_interval: planInterval,
          amount: Number(planAmount),
          currency: 'ر.س',
          description: planDescription.trim(),
          features: cleanFeatures,
          trial_days: Number(planTrialDays) || 0,
          active: true,
        });
        setPlans([...plans, created]);
        setActionSuccess(`تمت إضافة خطة "${created.name}" بنجاح 🚀`);
      }

      setIsModalOpen(false);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء حفظ الخطة');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (plan: BillingPlan) => {
    if (!plan.id) return;
    try {
      const newStatus = await LoyaltyService.toggleSubscriptionPlanActive(plan.id);
      setPlans(plans.map((p) => (p.id === plan.id ? { ...p, active: newStatus } : p)));
      setActionSuccess(newStatus ? `تم تنشيط الخطة "${plan.name}" ✅` : `تم إيقاف الخطة "${plan.name}" ⏸️`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePlan = async (plan: BillingPlan) => {
    if (!plan.id) return;
    if (confirm(`هل أنت متأكد من رغبتك في حذف خطة "${plan.name}"؟`)) {
      try {
        await LoyaltyService.deleteSubscriptionPlan(plan.id);
        setPlans(plans.filter((p) => p.id !== plan.id));
        setActionSuccess(`تم حذف الخطة "${plan.name}" 🗑️`);
        setTimeout(() => setActionSuccess(null), 3000);
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Toast Alert */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fade-in shadow-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 shrink-0 font-black text-2xl">
            💳
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg sm:text-xl font-black text-white">إدارة خطط وباقات الاشتراك</h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                {plans.length} خطط مسجلة
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              أضف وعدّل خطط الاشتراك والأسعار والمميزات لتنعكس مباشرة وبشكل حي في لوحة كل تاجر.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenAddModal}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-amber-500/20 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة خطة جديدة ➕</span>
          </button>

          <button
            onClick={fetchPlans}
            disabled={loadingPlans}
            className="p-3 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${loadingPlans ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Plans Table & Cards */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-black text-white">جدول الخطط المعتمدة في النظام</h4>
          </div>
          <span className="text-xs text-slate-500 font-mono">تحديث فوري</span>
        </div>

        {plans.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-3">
            <Layers className="w-10 h-10 mx-auto text-slate-600" />
            <p className="text-sm text-slate-400 font-bold">لا توجد خطط مضافة بعد</p>
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold transition"
            >
              إضافة أول خطة الآن
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`bg-slate-950/90 border rounded-3xl p-6 space-y-5 flex flex-col justify-between transition shadow-lg ${
                  plan.active !== false ? 'border-slate-800 hover:border-amber-500/40' : 'border-rose-900/30 opacity-60'
                }`}
              >
                {/* Card Top */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-xl border ${
                        plan.billing_interval === 'YEARLY'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                      }`}
                    >
                      {plan.billing_interval === 'YEARLY' ? '📅 اشتراك سنوي' : '📆 اشتراك شهري'}
                    </span>

                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                        plan.active !== false
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${plan.active !== false ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                      <span>{plan.active !== false ? 'نشطة' : 'متوقفة'}</span>
                    </span>
                  </div>

                  <div>
                    <h5 className="text-lg font-black text-white">{plan.name}</h5>
                    {plan.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{plan.description}</p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl font-black text-amber-400 font-mono">{plan.amount.toLocaleString()}</span>
                      <span className="text-xs text-slate-400 font-bold mr-1.5">{plan.currency || 'ر.س'}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">
                      / {plan.billing_interval === 'YEARLY' ? 'سنة' : 'شهر'}
                    </span>
                  </div>

                  {/* Features List */}
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-400 block">المميزات المضمنة:</span>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {(plan.features || []).map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2 leading-relaxed">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(plan)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      plan.active !== false
                        ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{plan.active !== false ? 'إيقاف الخطة' : 'تنشيط الخطة'}</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditModal(plan)}
                    className="p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition"
                    title="تعديل الخطة"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeletePlan(plan)}
                    className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                    title="حذف الخطة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ➕ Modal: Add / Edit Subscription Plan */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-xl w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-800 relative shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    {editingPlan ? 'تعديل خطة الاشتراك' : 'إضافة خطة اشتراك جديدة'}
                  </h3>
                  <p className="text-[11px] text-slate-400">حدد الاسم والسعر والمدة وقائمة المميزات</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlanSubmit} className="space-y-4">
              {/* Plan Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">اسم الخطة / الباقة</label>
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="مثال: باقة الانطلاق أو باقة المحترفين"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs font-bold text-white placeholder-slate-600 outline-none transition"
                  required
                />
              </div>

              {/* Interval & Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">المدة (دورة الاشتراك)</label>
                  <select
                    value={planInterval}
                    onChange={(e) => setPlanInterval(e.target.value as 'MONTHLY' | 'YEARLY')}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs font-bold text-white outline-none transition"
                  >
                    <option value="MONTHLY">📆 شهري (MONTHLY)</option>
                    <option value="YEARLY">📅 سنوي (YEARLY)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">السعر (بالريال السعودي ر.س)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={planAmount}
                      onChange={(e) => setPlanAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="195"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-4 pl-12 py-3 text-xs font-mono font-bold text-amber-400 placeholder-slate-600 outline-none transition"
                      required
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-500 pointer-events-none">
                      ر.س
                    </span>
                  </div>
                </div>
              </div>

              {/* Description (Optional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">وصف توضيحي مختصر (اختياري)</label>
                <input
                  type="text"
                  value={planDescription}
                  onChange={(e) => setPlanDescription(e.target.value)}
                  placeholder="مثال: الحل الشامل لنمو مبيعات نشاطك واستعادة زبائنك"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              {/* Features List (One per line) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 block">
                    قائمة المميزات (اكتب كل ميزة في سطر منفصل)
                  </label>
                  <span className="text-[10px] text-amber-400 font-medium">سطر لكل ميزة ✨</span>
                </div>
                <textarea
                  rows={5}
                  value={planFeaturesText}
                  onChange={(e) => setPlanFeaturesText(e.target.value)}
                  placeholder="بطاقات ولاء رقمية بدون تحميل تطبيق&#10;كاشير سريع لمسح الباركود&#10;استهداف العملاء المنقطعين تلقائياً"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl p-3.5 text-xs text-slate-200 placeholder-slate-600 outline-none transition leading-relaxed font-sans"
                  required
                />
              </div>

              {/* Trial Days */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">فترة التجربة المجانية (أيام)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={planTrialDays}
                  onChange={(e) => setPlanTrialDays(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="7"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-2.5 text-xs font-mono text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs shadow-xl shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{editingPlan ? 'حفظ تعديلات الخطة 💾' : 'اعتماد ونشر الخطة 🚀'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

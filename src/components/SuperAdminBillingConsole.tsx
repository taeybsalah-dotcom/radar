import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  AlertTriangle,
  RefreshCw,
  Shield,
  Layers,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Lock,
} from 'lucide-react';
import { BillingPlan } from '../types';

export const SuperAdminBillingConsole: React.FC = () => {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [activeTab, setActiveTab] = useState<'plans' | 'subscriptions' | 'transactions' | 'webhooks'>('plans');

  const fetchPlans = async () => {
    setLoadingPlans(true);
    try {
      const res = await fetch('/api/billing/plans');
      const data = await res.json();
      if (data.success && data.plans) {
        setPlans(data.plans);
      }
    } catch (err) {
      console.error('[SuperAdminBillingConsole] Fetch plans error:', err);
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner: Stage 7 Status Alert */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-6 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-amber-400">حالة بوابة الدفع (Payment Provider Status)</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                STAGE 7A
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              <strong>STAGE 7 PAYMENT ACTIVATION BLOCKED — NO VERIFIED PAYMENT PROVIDER</strong>
              <br />
              طبقة الفوترة المركزية وسجل الاشتراكات والخطط مهيأة بالكامل، ولكن عمليات الدفع الحي معلقة بأمان حتى يتم اعتماد وتزويد بيانات مزود دفع حقيقي.
            </p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'plans'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>خطط الاشتراك (Plans)</span>
            </button>
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'subscriptions'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>دفتر الاشتراكات (Subscriptions)</span>
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'transactions'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>سجل المعاملات (Transactions)</span>
            </button>
            <button
              onClick={() => setActiveTab('webhooks')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'webhooks'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>أحداث الويب هوك (Webhook Events)</span>
            </button>
          </div>

          <button
            onClick={fetchPlans}
            disabled={loadingPlans}
            className="p-2 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loadingPlans ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>

        {/* Tab 1: Official Plans */}
        {activeTab === 'plans' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">الخطط الرسمية المعتمدة في النظام (Server Price Authority)</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  الأسعار وفترة التجربة تدار حصرياً من السيرفر، ولا يمكن تعديلها أو تجاوزها من قبل الواجهات.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((p) => (
                <div
                  key={p.code}
                  className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-amber-400 border border-slate-700">
                      {p.code}
                    </span>
                    <span className="text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      فترة تجربة {p.trial_days} أيام
                    </span>
                  </div>

                  <div>
                    <h5 className="text-base font-black text-white">{p.name}</h5>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{p.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-900 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-black text-white">{p.amount.toLocaleString()}</span>
                      <span className="text-xs text-slate-400 font-bold mr-1">{p.currency}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {p.billing_interval === 'MONTHLY' ? 'شهرياً' : 'سنوياً'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Merchant Subscriptions */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-4">
            <div className="p-8 text-center bg-slate-950/50 rounded-2xl border border-slate-800/80 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 mx-auto">
                <CreditCard className="w-6 h-6" />
              </div>
              <h5 className="text-sm font-bold text-white">دفتر اشتراكات المتاجر (Merchant Subscriptions Ledger)</h5>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                يتم قيد الاشتراكات آلياً عند انتهاء الفترة التجريبية وتأكيد الدفع عبر أحداث السيرفر المعتمدة.
                <br />
                <span className="text-amber-400/80 font-mono text-[11px]">
                  (حماية النزاهة المالية: لا توجد أزرار تفعيل يدوية لضمان سلامة التدفق المالي)
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Transactions */}
        {activeTab === 'transactions' && (
          <div className="space-y-4">
            <div className="p-8 text-center bg-slate-950/50 rounded-2xl border border-slate-800/80 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h5 className="text-sm font-bold text-white">سجل العمليات المالية (Billing Transactions Ledger)</h5>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                يتم تسجيل كل دفعة مع رقم مرجعي فريد (Idempotency Key) فور اعتماد بوابة الدفع الرسمية.
              </p>
            </div>
          </div>
        )}

        {/* Tab 4: Webhook Events */}
        {activeTab === 'webhooks' && (
          <div className="space-y-4">
            <div className="p-8 text-center bg-slate-950/50 rounded-2xl border border-slate-800/80 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h5 className="text-sm font-bold text-white">سجل أحداث الويب هوك (Webhook Events)</h5>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                مسار الاستقبال مهيأ ومحمي بـ 503 حتى اعتماد مفاتيح توقيع الويب هوك الخاصة بالمزود المعتمد.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

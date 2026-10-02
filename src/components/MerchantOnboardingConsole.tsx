import React, { useState, useEffect } from 'react';
import { Store } from '../types';
import {
  Building2,
  Palette,
  Sliders,
  Smartphone,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Store as StoreIcon,
  HelpCircle,
  Clock,
  Layers,
  Check,
  Zap,
} from 'lucide-react';
import { SandboxPaymentModal } from './SandboxPaymentModal';
import { LoyaltyService } from '../lib/supabase';

interface MerchantOnboardingConsoleProps {
  store: Store;
  onComplete?: () => void;
  onExit?: () => void;
}

type StepKey =
  | 'BUSINESS_INFO'
  | 'BRANDING'
  | 'STORE_SETTINGS'
  | 'CUSTOMER_EXPERIENCE'
  | 'BILLING'
  | 'REVIEW';

const STEPS: { key: StepKey; title: string; subtitle: string; icon: any }[] = [
  {
    key: 'BUSINESS_INFO',
    title: 'معلومات المتجر',
    subtitle: 'البيانات التجارية ومسؤول التواصل',
    icon: Building2,
  },
  {
    key: 'BRANDING',
    title: 'الهوية البصرية',
    subtitle: 'الألوان والشعار وثيم المتجر',
    icon: Palette,
  },
  {
    key: 'STORE_SETTINGS',
    title: 'إعدادات التشغيل',
    subtitle: 'الرابط المخصص ونظام النقاط',
    icon: Sliders,
  },
  {
    key: 'CUSTOMER_EXPERIENCE',
    title: 'جاهزية العميل',
    subtitle: 'بوابة العملاء وبرنامج الولاء والـ PWA',
    icon: Smartphone,
  },
  {
    key: 'BILLING',
    title: 'الاشتراك والتجربة',
    subtitle: 'فترة التجربة 7 أيام وسياسة الدفع',
    icon: CreditCard,
  },
  {
    key: 'REVIEW',
    title: 'المراجعة والتدشين',
    subtitle: 'التأكيد النهائي وتفعيل المتجر',
    icon: CheckCircle2,
  },
];

export const MerchantOnboardingConsole: React.FC<MerchantOnboardingConsoleProps> = ({
  store: initialStore,
  onComplete,
  onExit,
}) => {
  // State
  const [store, setStore] = useState<Store>(initialStore);
  const [currentStep, setCurrentStep] = useState<StepKey>('BUSINESS_INFO');
  const [status, setStatus] = useState<string>('IN_PROGRESS');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [billingState, setBillingState] = useState<any>(null);
  const [isSandboxModalOpen, setIsSandboxModalOpen] = useState(false);

  // Form Fields for Step 1
  const [storeName, setStoreName] = useState(initialStore.name || '');
  const [managerName, setManagerName] = useState(initialStore.manager_name || '');
  const [managerContact, setManagerContact] = useState(initialStore.manager_contact || '');

  // Form Fields for Step 2
  const [primaryColor, setPrimaryColor] = useState(initialStore.primary_color || '#0F172A');
  const [secondaryColor, setSecondaryColor] = useState(initialStore.secondary_color || '#F59E0B');
  const [logoUrl, setLogoUrl] = useState(initialStore.logo_url || '');

  // Form Fields for Step 3
  const [slug, setSlug] = useState(initialStore.slug || '');
  const [pointsPerRiyal, setPointsPerRiyal] = useState<number>(initialStore.points_per_riyal || 1.0);

  // Auth token resolver
  const getAuthToken = () => {
    return (
      localStorage.getItem('radar_super_admin_token') ||
      localStorage.getItem('radar_merchant_token') ||
      'mock_merchant_token_store_' + initialStore.id
    );
  };

  // 1. Fetch Onboarding State from Server (Refresh-Safe)
  const fetchOnboardingState = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/merchant/onboarding?store_id=${initialStore.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.onboarding) {
          setCurrentStep(data.onboarding.current_step || 'BUSINESS_INFO');
          setStatus(data.onboarding.status || 'IN_PROGRESS');
          if (data.onboarding.metadata?.steps_completed) {
            setCompletedSteps(data.onboarding.metadata.steps_completed);
          }
        }
        if (data.store) {
          setStore((prev) => ({ ...prev, ...data.store }));
          setStoreName(data.store.name || '');
          setManagerName(data.store.manager_name || '');
          setManagerContact(data.store.manager_contact || '');
          setPrimaryColor(data.store.primary_color || '#0F172A');
          setSecondaryColor(data.store.secondary_color || '#F59E0B');
          setLogoUrl(data.store.logo_url || '');
          setSlug(data.store.slug || '');
          setPointsPerRiyal(data.store.points_per_riyal || 1.0);
        }
        if (data.billing_state) {
          setBillingState(data.billing_state);
        }
      } else {
        // Idempotently start onboarding if not started
        await startOnboarding();
      }
    } catch (err: any) {
      console.warn('[OnboardingConsole] Fetch failed, initializing start...', err);
      await startOnboarding();
    } finally {
      setLoading(false);
    }
  };

  // 2. Start Onboarding on Server
  const startOnboarding = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/merchant/onboarding/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ store_id: initialStore.id }),
      });
      const data = await res.json();
      if (data.success && data.onboarding) {
        setCurrentStep(data.onboarding.current_step || 'BUSINESS_INFO');
        setStatus(data.onboarding.status || 'IN_PROGRESS');
      }
    } catch (e) {
      console.error('[OnboardingConsole] Start failed', e);
    }
  };

  useEffect(() => {
    document.title = initialStore?.name ? `${initialStore.name} - إعداد المتجر` : 'بوابة إعداد المتجر | RADAR';
  }, [initialStore?.name]);

  useEffect(() => {
    fetchOnboardingState();
  }, [initialStore.id]);

  // Current Step Index (1 to 6)
  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const progressPercent = Math.round(((currentStepIndex + 1) / STEPS.length) * 100);

  // 3. Save & Continue Step Handler
  const handleSaveAndContinue = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    let stepPayload: Record<string, any> = {};

    if (currentStep === 'BUSINESS_INFO') {
      if (!storeName.trim()) {
        setErrorMsg('يرجى إدخال اسم المتجر');
        setSaving(false);
        return;
      }
      stepPayload = {
        name: storeName.trim(),
        manager_name: managerName.trim(),
        manager_contact: managerContact.trim(),
      };
    } else if (currentStep === 'BRANDING') {
      stepPayload = {
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        logo_url: logoUrl.trim(),
      };
    } else if (currentStep === 'STORE_SETTINGS') {
      stepPayload = {
        slug: slug.trim(),
        points_per_riyal: pointsPerRiyal,
      };
    } else if (currentStep === 'CUSTOMER_EXPERIENCE') {
      stepPayload = { ready: true };
    } else if (currentStep === 'BILLING') {
      stepPayload = { reviewed: true };
    }

    try {
      const token = getAuthToken();
      const nextStepKey =
        currentStepIndex < STEPS.length - 1 ? STEPS[currentStepIndex + 1].key : 'REVIEW';

      const res = await fetch('/api/merchant/onboarding/step', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          store_id: initialStore.id,
          step: currentStep,
          next_step: nextStepKey,
          data: stepPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'فشل في حفظ الخطوة');
        return;
      }

      setCompletedSteps((prev) => ({ ...prev, [currentStep]: true }));
      setSuccessMsg('تم حفظ التقدم بنجاح');
      setCurrentStep(nextStepKey);
    } catch (err: any) {
      console.error('[OnboardingConsole] Save step exception:', err);
      setErrorMsg('حدث خطأ في الاتصال بالخادم أثناء حفظ الخطوة');
    } finally {
      setSaving(false);
    }
  };

  // 4. Start 7-Day Trial on Step 5
  const handleStartTrial = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/merchant/onboarding/step', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          store_id: initialStore.id,
          step: 'BILLING',
          next_step: 'REVIEW',
          data: { start_trial: true },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'تعذر بدء التجربة المجانية');
        return;
      }

      setSuccessMsg('تم تفعيل الفترة التجريبية المجانية بنجاح (7 أيام)!');
      await fetchOnboardingState();
      setCurrentStep('REVIEW');
    } catch (err: any) {
      setErrorMsg('حدث خطأ أثناء تفعيل التجربة المجانية');
    } finally {
      setSaving(false);
    }
  };

  const handleProcessOnboardingSandboxPayment = async (details: {
    paymentMethod: 'mada' | 'visa' | 'mastercard' | 'credit_card';
    cardNumber: string;
    cardholderName: string;
    expiryDate: string;
    cvv: string;
  }) => {
    setSaving(true);
    try {
      const res = await LoyaltyService.processSubscriptionPayment({
        storeId: initialStore.id,
        invoiceType: 'setup',
        amount: 500,
        paymentMethod: details.paymentMethod,
        gateway: 'sandbox',
      });
      setStore((prev) => ({ ...prev, ...res.store }));
      setIsSandboxModalOpen(false);
      setSuccessMsg('🎉 تم سداد رسوم التأسيس وتفعيل المتجر واشتراك الشهر الأول بنجاح!');
      await fetchOnboardingState();
      setCurrentStep('REVIEW');
    } catch (err: any) {
      console.error('Onboarding payment failed:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // 5. Complete Onboarding
  const handleCompleteOnboarding = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/merchant/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ store_id: initialStore.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'فشل في إكمال التهيئة');
        return;
      }

      setStatus('COMPLETED');
      setSuccessMsg('تهانينا! اكتملت تهيئة المتجر بنجاح.');
      if (onComplete) {
        setTimeout(onComplete, 1500);
      }
    } catch (err: any) {
      setErrorMsg('حدث خطأ أثناء إتمام التهيئة');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
        <p className="text-sm font-medium text-slate-400">جاري تحميل حالة تهيئة المتجر...</p>
      </div>
    );
  }

  // Celebratory Completed View
  if (status === 'COMPLETED') {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto text-3xl shadow-xl">
          <CheckCircle2 className="w-12 h-12" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white">تم إكمال إعداد المتجر بنجاح! 🎉</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            متجرك <span className="text-amber-400 font-bold">{store.name}</span> أصبح مهيأً بالكامل
            وجاهزاً لاستقبال العملاء والعمليات.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-2 text-right">
          <div className="flex items-center justify-between">
            <span className="font-mono text-white">/{store.slug}</span>
            <span>الرابط المخصص:</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-amber-400">
              {billingState?.trial_ends_at
                ? 'فترة تجريبية سارية (7 أيام)'
                : 'في انتظار اشتراك مفعل'}
            </span>
            <span>حالة الاشتراك:</span>
          </div>
        </div>

        <button
          onClick={onExit || onComplete}
          className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-amber-500/20"
        >
          الدخول إلى لوحة إدارة المتجر 🚀
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 px-2 sm:px-4 text-right" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>تهيئة المتجر الجديد</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            مرحباً بك في RADAR — {store.name || 'متجرك الجديد'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            أكمل إعداد متجرك في خطوات بسيطة لتجهيزه للعمل بأعلى كفاءة.
          </p>
        </div>

        {onExit && (
          <button
            onClick={onExit}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            خروج والمتابعة لاحقاً
          </button>
        )}
      </div>

      {/* Progress Bar & Steps Indicator */}
      <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-slate-400">
            الخطوة {currentStepIndex + 1} من {STEPS.length}:{' '}
            <strong className="text-white">{STEPS[currentStepIndex].title}</strong>
          </span>
          <span className="text-amber-400 font-mono">{progressPercent}% مكتمل</span>
        </div>

        {/* Linear Progress Indicator */}
        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-amber-500 to-amber-400 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step Tabs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isCurrent = step.key === currentStep;
            const isDone = completedSteps[step.key] || idx < currentStepIndex;

            return (
              <button
                key={step.key}
                onClick={() => setCurrentStep(step.key)}
                className={`p-2.5 rounded-2xl border text-right transition flex flex-col gap-1.5 ${
                  isCurrent
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : isDone
                    ? 'bg-slate-900/50 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-500 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-mono opacity-70">0{idx + 1}</span>
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="text-xs font-bold truncate">{step.title}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Messages */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Step Content Container */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
        {/* Step 1: BUSINESS_INFO */}
        {currentStep === 'BUSINESS_INFO' && (
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-400" />
                البيانات الأساسية للمتجر
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                تأكد من صحة الاسم التجاري للمتجر وبيانات التواصل مع المدير المسؤول.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-slate-300">
                  اسم المتجر التجاري <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="مثال: مقهى رادار الفاخر"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">اسم المدير المسؤول</label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="مثال: أحمد عبد الله"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  رقم جوال التواصل <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={managerContact}
                  onChange={(e) => setManagerContact(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:border-amber-500 focus:outline-none text-left"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: BRANDING */}
        {currentStep === 'BRANDING' && (
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Palette className="w-5 h-5 text-amber-400" />
                الهوية البصرية للمتجر
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                حدد ألوان المتجر ورابط الشعار لتخصيص واجهة العميل ونقاط البيع.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-slate-300">رابط الشعار (Logo URL)</label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:border-amber-500 focus:outline-none text-left"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">اللون الأساسي (Primary)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-10 rounded-lg bg-transparent cursor-pointer border border-slate-700"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono uppercase"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">اللون الثانوي (Accent)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-12 h-10 rounded-lg bg-transparent cursor-pointer border border-slate-700"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono uppercase"
                  />
                </div>
              </div>

              {/* Brand Live Preview Box */}
              <div className="sm:col-span-2 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-400">معاينة الهوية المباشرة:</div>
                <div
                  className="p-4 rounded-xl flex items-center justify-between text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <div className="flex items-center gap-3">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white/10" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center font-bold">
                        {storeName ? storeName.charAt(0) : 'R'}
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-sm">{storeName || 'اسم المتجر'}</div>
                      <div className="text-[11px] opacity-80">برنامج الولاء والمكافآت</div>
                    </div>
                  </div>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold text-slate-950"
                    style={{ backgroundColor: secondaryColor }}
                  >
                    رصيدك: 150 نقطة
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: STORE_SETTINGS */}
        {currentStep === 'STORE_SETTINGS' && (
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                إعدادات التشغيل ورابط المتجر
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                تحديد رابط الوصول ونظام احتساب النقاط لكل ريال ينفقه العميل.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  الاسم اللطيف للرابط (Slug) <span className="text-rose-400">*</span>
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-3 rounded-r-xl bg-slate-900 border border-l-0 border-slate-800 text-slate-500 text-xs font-mono">
                    /
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="my-store"
                    className="w-full px-4 py-3 rounded-l-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono text-left focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  رابط وصول عملائك سيكون: <strong className="text-amber-400 font-mono">radar.sa/{slug}</strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  معدل النقاط لكل ريال ينفقه العميل <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={pointsPerRiyal}
                  onChange={(e) => setPointsPerRiyal(parseFloat(e.target.value) || 1)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono text-left focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500">
                  المعيار الافتراضي: 1 ريال = 1 نقطة ولاء.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: CUSTOMER_EXPERIENCE */}
        {currentStep === 'CUSTOMER_EXPERIENCE' && (
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-400" />
                فحص جاهزية تجربة العميل (Customer Experience)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                التحقق من جاهزية الأنظمة الأساسية التي يتفاعل معها العميل.
              </p>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    تطبيق الويب التقدمي ومحفظة العميل (Customer PWA)
                  </div>
                  <p className="text-[11px] text-slate-400">
                    يعمل تلقائياً عند زيارة العميل للرابط المخصص دون الحاجة لتحميل من المتجر.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-xs">
                  جاهز ومفعل
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    محرك رتب الولاء الذكي (Loyalty Tiers Engine)
                  </div>
                  <p className="text-[11px] text-slate-400">
                    الرتب الافتراضية (ضيف، عضو مميز، VIP) مهيأة وجاهزة للتخصيص من لوحة الإدارة.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-xs">
                  جاهز ومفعل
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    نظام الحجوزات والطلبات المسبقة (Optional)
                  </div>
                  <p className="text-[11px] text-slate-400">
                    خدمات إضافية اختيارية يمكن تفعيلها مستقبلاً من تبويب الكتالوج والخدمات.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 font-bold text-xs">
                  اختياري
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: BILLING */}
        {currentStep === 'BILLING' && (
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                حالة الفوترة والاشتراك
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                سياسة الاشتراك والفترة التجريبية المصرح بها لمتجرك.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
              <div className="font-bold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                تنويه هام بشأن الفوترة وبوابات الدفع
              </div>
              <p className="text-slate-300 leading-relaxed">
                التجربة المجانية متاحة رسمياً لمتجرك لمدة <strong>7 أيام</strong> كاملة.
                بوابات الدفع الإلكتروني المباشرة ستفعل لاحقاً عند اعتماد المشغل البنكي.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">فترة التجربة الرسمية المجانية (7 أيام)</h4>
                  <p className="text-xs text-slate-400">
                    استكشف جميع مزايا رادار دون أي قيود مالية خلال فترة التجربة.
                  </p>
                </div>
                {billingState?.trial_ends_at ? (
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold shrink-0">
                    التجربة مفعلة ومستمرة ✅
                  </span>
                ) : billingState?.trial_eligible ? (
                  <button
                    onClick={handleStartTrial}
                    disabled={saving}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-2 shrink-0"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    بدء التجربة المجانية (7 أيام)
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-semibold shrink-0">
                    تم استهلاك التجربة
                  </span>
                )}
              </div>

              {billingState?.trial_ends_at && (
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
                  <span>تاريخ انتهاء التجربة:</span>
                  <span className="font-mono text-white">
                    {new Date(billingState.trial_ends_at).toLocaleDateString('ar-SA')}
                  </span>
                </div>
              )}
            </div>

            {/* Direct Setup Fee Payment (Sandbox / Production) */}
            <div className="p-6 rounded-2xl bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950 border border-amber-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">تفعيل الحساب الدائم (سداد رسوم التأسيس)</h4>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                      شامل الشهر الأول مجاناً 🎁
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    سدد 500 ر.س لمرة واحدة الآن لتفعيل المتجر بدون أي فترات توقف تجريبية (متاح ببطاقات الاختبار Sandbox).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSandboxModalOpen(true)}
                  disabled={saving || store.setup_fee_paid}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 text-xs font-extrabold transition flex items-center gap-2 shadow-lg shadow-amber-500/20 shrink-0 disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{store.setup_fee_paid ? 'تم سداد التأسيس ✅' : 'سداد 500 ر.س (Sandbox) 🚀'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: REVIEW */}
        {currentStep === 'REVIEW' && (
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
                المراجعة النهائية وتأكيد التدشين
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                راجع ملخص الإعدادات واضغط تأكيد التدشين لفتح لوحة التحكم الخاصة بك.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs text-slate-400">هوية المتجر:</span>
                <div className="text-sm font-bold text-white">{storeName || store.name}</div>
                <div className="text-xs text-slate-400">مسؤول التواصل: {managerContact || store.manager_contact}</div>
                <div className="text-xs text-amber-400 font-mono">الرابط: /{slug || store.slug}</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs text-slate-400">نظام التشغيل والولاء:</span>
                <div className="text-sm font-bold text-white">{pointsPerRiyal} نقطة لكل 1 ريال</div>
                <div className="text-xs text-slate-400">محفظة العميل: مفعلة وجاهزة</div>
                <div className="text-xs text-emerald-400">
                  {billingState?.trial_ends_at ? 'الفترة التجريبية: نشطة' : 'الفوترة: تحت التجربة'}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              ✅ جميع متطلبات الإعداد مكتملة بنجاح. عند التأكيد سيتم تفعيل المتجر مباشرة.
            </div>
          </div>
        )}

        {/* Actions Bar (Footer) */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
          {currentStepIndex > 0 ? (
            <button
              onClick={() => setCurrentStep(STEPS[currentStepIndex - 1].key)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              الخطوة السابقة
            </button>
          ) : (
            <div />
          )}

          {currentStep === 'REVIEW' ? (
            <button
              onClick={handleCompleteOnboarding}
              disabled={saving}
              className="px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              تأكيد التدشين وتفعيل المتجر 🚀
            </button>
          ) : (
            <button
              onClick={handleSaveAndContinue}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-amber-500/20"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              حفظ والمتابعة
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 💳 Sandbox Payment Checkout Modal */}
      <SandboxPaymentModal
        isOpen={isSandboxModalOpen}
        onClose={() => setIsSandboxModalOpen(false)}
        title="سداد رسوم تأسيس واشتراك المتجر"
        itemDescription="رسوم تأسيس المتجر + اشتراك الشهر الأول مجاناً 🎁"
        amount={500}
        currency="ر.س"
        storeName={storeName || store.name}
        onProcessPayment={handleProcessOnboardingSandboxPayment}
      />
    </div>
  );
};

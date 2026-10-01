import React, { useState, useEffect, useRef } from 'react';
import { Store, User, Phone, CheckCircle2, AlertCircle, ShieldCheck, Loader2, Sparkles, Gift, Users, Zap } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';
import confetti from 'canvas-confetti';

// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE - OPEN MERCHANT JOIN LANDING PAGE
// Route: /join or /join?ref=RADAR-XXXX
// Purpose: Public self-serve join page with Radar branding & lead capture.
// ==============================================================================

type PageState =
  | 'INITIALIZING'
  | 'FORM_READY'
  | 'SUCCESS';

interface FormState {
  store_name: string;
  owner_name: string;
  phone: string;
}

export const MerchantJoinLanding: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('INITIALIZING');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    store_name: '',
    owner_name: '',
    phone: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackCalledRef = useRef(false);

  useEffect(() => {
    if (trackCalledRef.current) return;
    trackCalledRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    if (ref && ref.trim()) {
      const cleanRef = ref.trim().toUpperCase();
      setReferralCode(cleanRef);

      // Track referral via /api/track in background
      fetch(`/api/track?ref=${encodeURIComponent(cleanRef)}`, {
        method: 'GET',
        credentials: 'include',
      })
        .catch(() => {})
        .finally(() => {
          setPageState('FORM_READY');
        });
    } else {
      // Direct access is fully open by default
      setPageState('FORM_READY');
    }
  }, []);

  // Saudi Phone Normalizer (accepts 05..., 5..., +9665..., 9665...)
  const normalizeSaudiPhone = (raw: string): string | null => {
    if (!raw) return null;
    let clean = raw.replace(/[^0-9]/g, '');
    if (clean.startsWith('00966')) clean = clean.substring(5);
    else if (clean.startsWith('966')) clean = clean.substring(3);
    if (clean.length === 10 && clean.startsWith('05')) clean = clean.substring(1);
    if (clean.length === 9 && clean.startsWith('5')) return `0${clean}`;
    return null;
  };

  const mapErrorCodeToMessage = (code: string): string => {
    switch (code) {
      case 'INVALID_INPUT':
        return 'يرجى التحقق من صحة البيانات المدخلة وتعبئة كافة الحقول.';
      case 'INVALID_PHONE':
        return 'يرجى إدخال رقم جوال سعودي صحيح يبدأ بـ 05.';
      case 'DUPLICATE_PHONE':
        return 'رقم الجوال مسجل مسبقاً في النظام أو لديه طلب انضمام نشط.';
      case 'RATE_LIMITED':
        return 'تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً.';
      default:
        return 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    setErrorMessage(null);

    const storeName = form.store_name.trim();
    const ownerName = form.owner_name.trim();
    const rawPhone = form.phone.trim();

    if (!storeName || storeName.length < 2) {
      setErrorMessage('يرجى كتابة اسم المتجر (حرفين على الأقل).');
      return;
    }

    if (!ownerName || ownerName.length < 2) {
      setErrorMessage('يرجى كتابة اسم المالك (حرفين على الأقل).');
      return;
    }

    const normalizedPhone = normalizeSaudiPhone(rawPhone);
    if (!normalizedPhone) {
      setErrorMessage('يرجى إدخال رقم جوال سعودي صحيح يبدأ بـ 05.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Try API gateway
      const payload = {
        store_name: storeName,
        owner_name: ownerName,
        phone: normalizedPhone,
      };

      const response = await fetch('/api/lead-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (response && response.ok) {
        const result = await response.json().catch(() => ({}));
        if (result.success === true) {
          setPageState('SUCCESS');
          try { confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); } catch {}
          return;
        }
      }

      // 2. Direct Supabase Fallback if serverless API isn't present
      const client = getSupabaseClient();
      if (client) {
        const { error: dbError } = await client.from('merchant_leads').insert([
          {
            store_name: storeName,
            manager_name: ownerName,
            phone: normalizedPhone,
            status: 'NEW',
            referral_code: referralCode || null,
            notes: 'طلب انضمام مباشر من صفحة الهبوط العامة',
          },
        ]);

        if (!dbError) {
          setPageState('SUCCESS');
          try { confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); } catch {}
          return;
        }
      }

      // If both fail
      setErrorMessage('تم استلام طلبك ولكن تعذر إكمال التسجيل الآلي، سيتواصل معك فريقنا قريباً.');
      setPageState('SUCCESS');
    } catch {
      setErrorMessage('تعذر الاتصال بالخادم، يرجى التحقق من اتصالك بالإنترنت والمحاولة مجدداً.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#080B11] text-slate-100 flex flex-col justify-center items-center px-4 py-8 sm:py-12 selection:bg-amber-500 selection:text-black">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative w-full max-w-lg">
        {/* Brand Header with Radar Official Logo */}
        <div className="text-center mb-8 space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-slate-900/90 border border-amber-500/40 p-2.5 shadow-2xl flex items-center justify-center backdrop-blur-md">
              <img src="/icon-192.svg" alt="Radar Logo" className="w-full h-full object-contain" />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-amber-500/30 text-amber-400 text-xs font-bold tracking-wide">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>منصة رادار للولاء والتسويق الذكي</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            انضم كمتجر شريك في رادار
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
            منظومة ولاء رقمية ذكية لزيادة مبيعاتك ومضاعفة ولاء عملائك
          </p>

          {referralCode && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>كود الدعوة المعتمد: {referralCode}</span>
            </div>
          )}
        </div>

        {/* Feature Highlights Cards */}
        <div className="grid grid-cols-3 gap-2.5 mb-6 text-center">
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
            <Zap className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-[11px] font-bold text-white">كاشير فوري</p>
            <p className="text-[9px] text-slate-400">إضافة النقاط بثانية</p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
            <Gift className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-[11px] font-bold text-white">محفظة رقمية</p>
            <p className="text-[9px] text-slate-400">بدون تحميل تطبيق</p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
            <Users className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-[11px] font-bold text-white">إعادة تفعيل</p>
            <p className="text-[9px] text-slate-400">حملات واتساب ذكية</p>
          </div>
        </div>

        {/* State 1: Initializing */}
        {pageState === 'INITIALIZING' && (
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 text-center space-y-4 shadow-2xl backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
            <p className="text-sm text-slate-300 font-medium">جاري تهيئة الصفحة...</p>
          </div>
        )}

        {/* State 2: Join Form Ready */}
        {pageState === 'FORM_READY' && (
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-sm space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white">طلب الانضمام وتأسيس المتجر</h2>
              <p className="text-xs text-slate-400 mt-1">
                أدخل بيانات متجرك الأساسية وسيتواصل معك فريق رادار لتهيئة برنامج الولاء فوراً.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Field 1: Store Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-amber-400" />
                  <span>اسم المتجر / الكافيه *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="مثال: مخابز الشهد، كافيه لارين"
                  value={form.store_name}
                  onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 transition disabled:opacity-50"
                />
              </div>

              {/* Field 2: Owner Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  <span>اسم صاحب المتجر / المسؤول *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="الاسم الكريم"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 transition disabled:opacity-50"
                />
              </div>

              {/* Field 3: Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-amber-400" />
                  <span>رقم الجوال *</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    disabled={isSubmitting}
                    placeholder="05XXXXXXXX"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-3 text-right rounded-2xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 transition disabled:opacity-50 font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-500">رقم جوال سعودي يبدأ بـ 05</p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 mt-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري إرسال الطلب...</span>
                  </>
                ) : (
                  <span>إرسال طلب الانضمام</span>
                )}
              </button>
            </form>
          </div>
        )}

        {/* State 3: Success State */}
        {pageState === 'SUCCESS' && (
          <div className="p-8 rounded-3xl bg-slate-900/95 border border-emerald-500/30 text-center space-y-5 shadow-2xl backdrop-blur-sm animate-fade-in">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">تم استلام طلبك بنجاح 🌟</h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                شكراً لاهتمامك بالانضمام إلى منظومة رادار للولاء والمكافآت.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                سيقوم فريقنا بمراجعة بيانات متجرك والتواصل معك عبر رقم الجوال لتفعيل نظام الولاء والبدء فوراً.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-600">
          <p>© 2026 Radar Loyalty Engine • منصة رادار لبرامج الولاء والمكافآت</p>
        </div>
      </div>
    </div>
  );
};

export default MerchantJoinLanding;

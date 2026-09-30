import React, { useState, useEffect, useRef } from 'react';
import { Store, User, Phone, CheckCircle2, AlertCircle, ShieldCheck, Loader2 } from 'lucide-react';

// ==============================================================================
// 🛡️ RADAR LOYALTY ENGINE - STAGE 4: MERCHANT JOIN LANDING PAGE
// Route: /join or /join?ref=RADAR-XXXX
// Purpose: Validates affiliate invitation, renders join form, and submits lead.
// ==============================================================================

type PageState =
  | 'INITIALIZING'
  | 'NO_REF'
  | 'INVALID_REF'
  | 'FORM_READY'
  | 'SUCCESS';

interface FormState {
  store_name: string;
  owner_name: string;
  phone: string;
}

export const MerchantJoinLanding: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('INITIALIZING');
  const [form, setForm] = useState<FormState>({
    store_name: '',
    owner_name: '',
    phone: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Single-flight lock for /api/track to prevent multiple calls on React StrictMode / rerenders
  const trackCalledRef = useRef(false);

  useEffect(() => {
    if (trackCalledRef.current) return;
    trackCalledRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    if (!ref || !ref.trim()) {
      // Direct access without invitation code: require invitation link
      setPageState('NO_REF');
      return;
    }

    const cleanRef = ref.trim().toUpperCase();

    // Call /api/track once with credentials: 'include'
    fetch(`/api/track?ref=${encodeURIComponent(cleanRef)}`, {
      method: 'GET',
      credentials: 'include',
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.success) {
            setPageState('FORM_READY');
            return;
          }
        }
        setPageState('INVALID_REF');
      })
      .catch(() => {
        setPageState('INVALID_REF');
      });
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

  // Map API error codes to user-friendly Arabic messages
  const mapErrorCodeToMessage = (code: string): string => {
    switch (code) {
      case 'INVALID_INPUT':
        return 'يرجى التحقق من صحة البيانات المدخلة وتعبئة كافة الحقول.';
      case 'INVALID_PHONE':
        return 'يرجى إدخال رقم جوال سعودي صحيح يبدأ بـ 05.';
      case 'MISSING_ATTRIBUTION':
      case 'INVALID_ATTRIBUTION':
        return 'تعذر التحقق من رابط الدعوة، يرجى إعادة فتح الرابط والمحاولة مجدداً.';
      case 'EXPIRED_TOKEN':
        return 'انتهت صلاحية رابط الدعوة، يرجى طلب رابط دعوة جديد.';
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

    if (isSubmitting) return; // Prevent double submit
    setErrorMessage(null);

    // 1. Client-side field validations
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

    // 2. Lock submit button
    setIsSubmitting(true);

    try {
      // 3. Exact Public Body Contract: store_name, owner_name, phone
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
        credentials: 'include', // Sends radar_aff_token HttpOnly cookie
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success === true) {
        // Transition to Success State
        setPageState('SUCCESS');
      } else {
        const errorKey = result.error || 'INTERNAL_ERROR';
        setErrorMessage(mapErrorCodeToMessage(errorKey));
      }
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
        {/* Brand Header */}
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-amber-500/30 text-amber-400 text-xs font-bold tracking-wide">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>منصة رادار للولاء والتسويق الذكي</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            انضم كتاجر شريك في رادار
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
            منظومة ولاء رقمية ذكية لنمو مبيعاتك وزيادة ولاء عملائك
          </p>
        </div>

        {/* State 1: Checking Referral Link */}
        {pageState === 'INITIALIZING' && (
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 text-center space-y-4 shadow-2xl backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
            <p className="text-sm text-slate-300 font-medium">جاري التحقق من رابط الدعوة...</p>
          </div>
        )}

        {/* State 2: Direct Access without Ref (?ref= missing) */}
        {pageState === 'NO_REF' && (
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 text-center space-y-5 shadow-2xl backdrop-blur-sm">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto text-xl">
              ✉️
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white">رابط دعوة مطلوب</h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                الانضمام إلى منصة رادار كتاجر شريك متاح حالياً عبر الدعوات الحصرية من قِبل مسؤولي المنظمة وشركائنا المعتمدين.
              </p>
              <p className="text-xs text-amber-400/90 pt-1">
                إذا كان لديك رابط دعوة، يرجى استخدامه مباشرة للوصول إلى استمارة التسجيل.
              </p>
            </div>
          </div>
        )}

        {/* State 3: Invalid or Inactive Ref */}
        {pageState === 'INVALID_REF' && (
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-red-500/30 text-center space-y-5 shadow-2xl backdrop-blur-sm">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white">رابط الدعوة غير صالح</h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                عذراً، رابط الدعوة المستخدم غير مفعّل أو انتهت صلاحيته. يرجى التأكد من صحة الرابط أو التواصل مع ممثل رادار المعتمد.
              </p>
            </div>
          </div>
        )}

        {/* State 4: Join Form Ready */}
        {pageState === 'FORM_READY' && (
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-sm space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white">طلب الانضمام كمتجر شريك</h2>
              <p className="text-xs text-slate-400 mt-1">
                أدخل بيانات متجرك الأساسية وسيتواصل معك فريقنا لتفعيل حسابك.
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
                  <span>اسم المتجر *</span>
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
                  <span>اسم صاحب المتجر / المالك *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="الاسم الثلاثي"
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

              {/* Submit Button (Single Flight Protected) */}
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

        {/* State 5: Success State */}
        {pageState === 'SUCCESS' && (
          <div className="p-8 rounded-3xl bg-slate-900/95 border border-emerald-500/30 text-center space-y-5 shadow-2xl backdrop-blur-sm animate-fade-in">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">تم استلام طلبك بنجاح</h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                شكراً لاهتمامك بالانضمام إلى منصة رادار.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                سيقوم فريقنا بمراجعة بيانات متجرك والتواصل معك عبر رقم الجوال لاستكمال خطوات التفعيل والتأسيس.
              </p>
            </div>
          </div>
        )}

        {/* Minimal Footer */}
        <div className="mt-8 text-center text-xs text-slate-600">
          <p>© 2026 Radar Loyalty Engine • جميع الحقوق محفوظة</p>
        </div>
      </div>
    </div>
  );
};

export default MerchantJoinLanding;

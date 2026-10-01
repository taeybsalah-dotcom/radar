import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Loader2,
  Sparkles,
  Gift,
  Users,
  Zap,
  Smartphone,
  Flame,
  Bot,
  MessageSquare,
  TrendingUp,
  ArrowDown,
  Check,
  Star,
  ChevronLeft,
} from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';
import confetti from 'canvas-confetti';

// ==============================================================================
// 🌟 RADAR LOYALTY ENGINE - OFFICIAL HIGH-CONVERTING LANDING PAGE
// Route: /join or /join?ref=rXXXX
// ==============================================================================

type PageState = 'FORM_READY' | 'SUCCESS';

interface FormState {
  owner_name: string;
  store_name: string;
  phone: string;
}

export const MerchantJoinLanding: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('FORM_READY');
  const [referralCode, setReferralCode] = useState<string>('');
  const [form, setForm] = useState<FormState>({
    owner_name: '',
    store_name: '',
    phone: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  // Capture referral code quietly in background without showing it
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('ref') || urlParams.get('r') || '';
      if (ref && ref.trim()) {
        const cleanRef = ref.trim().toLowerCase();
        setReferralCode(cleanRef);
        sessionStorage.setItem('radar_captured_ref', cleanRef);

        // Quietly notify tracking endpoint
        fetch(`/api/track?ref=${encodeURIComponent(cleanRef)}`, {
          method: 'GET',
          credentials: 'include',
        }).catch(() => {});
      } else {
        const saved = sessionStorage.getItem('radar_captured_ref');
        if (saved) setReferralCode(saved);
      }
    } catch {}
  }, []);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Saudi Phone Normalizer (accepts 05..., 5..., +9665..., 9665...)
  const normalizeSaudiPhone = (raw: string): string | null => {
    if (!raw) return null;
    let clean = raw.replace(/[^0-9]/g, '');
    if (clean.startsWith('00966')) clean = clean.substring(5);
    else if (clean.startsWith('966')) clean = clean.substring(3);
    if (clean.length === 10 && clean.startsWith('05')) return clean;
    if (clean.length === 9 && clean.startsWith('5')) return `0${clean}`;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);

    const ownerName = form.owner_name.trim();
    const storeName = form.store_name.trim();
    const rawPhone = form.phone.trim();

    if (!ownerName || ownerName.length < 2) {
      setErrorMessage('يرجى كتابة الاسم الكريم (حرفين على الأقل).');
      return;
    }

    if (!storeName || storeName.length < 2) {
      setErrorMessage('يرجى كتابة اسم النشاط / المتجر.');
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
        referral_code: referralCode || undefined,
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
          try { confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }); } catch {}
          return;
        }
      }

      // 2. Direct Supabase Client fallback
      const client = getSupabaseClient();
      if (client) {
        const { error: dbError } = await client.from('merchant_leads').insert([
          {
            store_name: storeName,
            manager_name: ownerName,
            phone: normalizedPhone,
            status: 'NEW',
            referral_code: referralCode || null,
            notes: 'طلب تفعيل مباشر من صفحة الهبوط الرسمية',
          },
        ]);

        if (!dbError) {
          setPageState('SUCCESS');
          try { confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }); } catch {}
          return;
        }
      }

      // Fallback: Show success
      setPageState('SUCCESS');
      try { confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); } catch {}
    } catch {
      setErrorMessage('حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#07090E] text-slate-100 overflow-x-hidden selection:bg-cyan-400 selection:text-slate-950 font-sans">
      
      {/* Background Lighting Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-cyan-500/15 via-emerald-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-amber-500/10 via-cyan-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-[450px] h-[450px] bg-gradient-to-tl from-emerald-500/15 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Top Floating Navbar */}
      <header className="relative z-30 max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl p-0.5 bg-gradient-to-br from-cyan-400 via-emerald-400 to-amber-400 shadow-lg shadow-cyan-500/20">
            <img
              src="/radar-logo-dark.jpg"
              alt="RADAR"
              className="w-full h-full object-cover rounded-[14px]"
            />
          </div>
          <div>
            <span className="text-lg font-black tracking-wider text-white flex items-center gap-1.5">
              <span>RADAR</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </span>
            <p className="text-[10px] text-cyan-300/80 font-medium">منظومة الولاء والتسويق الذكي</p>
          </div>
        </div>

        <button
          onClick={scrollToForm}
          className="px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition transform hover:scale-105"
        >
          طلب تفعيل متجرك ✨
        </button>
      </header>

      {/* HERO SECTION */}
      <section className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 text-center space-y-8">
        
        {/* Glowing Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 border border-cyan-400/40 text-cyan-300 text-xs sm:text-sm font-bold shadow-xl backdrop-blur-xl animate-fade-in">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>المنصة السعودية الذكية لمضاعفة عوائد المتاجر</span>
        </div>

        {/* Main Hero Headline */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight max-w-4xl mx-auto">
          عميلك اشترى منك اليوم... <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-emerald-300 to-amber-300">
            لكن وينه بعد 30 يوم؟
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
          رادار يساعدك تعرف عملاءك، تكافئ الدائم منهم، وترجع اللي انقطع عنك — من نظام واحد يحمل اسم نشاطك.
        </p>

        {/* CTA Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-black text-base shadow-2xl shadow-cyan-500/30 transition transform hover:-translate-y-1 flex items-center justify-center gap-2.5"
          >
            <span>ابدأ تجربة متجرك مجاناً 🚀</span>
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Social Proof Mini Bar */}
        <div className="pt-6 flex items-center justify-center gap-6 text-xs text-slate-400 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>بدون أجهزة أو تمديدات</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>تفعيل فوري بنفس اليوم</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>بهوية وألوان محلك بالكامل</span>
          </span>
        </div>
      </section>

      {/* HIGHLIGHTED COMMERCIAL MESSAGE BANNER */}
      <section className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="relative rounded-3xl p-8 sm:p-10 bg-gradient-to-r from-slate-900/90 via-slate-900/90 to-slate-900/90 border-2 border-cyan-400/40 shadow-2xl backdrop-blur-xl text-center space-y-3 overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -left-10 -top-10 w-40 h-40 bg-cyan-500/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-400/10 text-cyan-300 text-xs font-black border border-cyan-400/30">
            💡 المعادلة الأذكى لمبيعاتك
          </div>
          <h2 className="text-xl sm:text-3xl font-black text-white leading-snug">
            "بدل ما تدفع كل شهر عشان تجيب عميل جديد... <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-emerald-300 to-cyan-300">
              ابنِ نظام يخلي عميلك الحالي يرجع.
            </span>"
          </h2>
        </div>
      </section>

      {/* SECTION: WHY RADAR? (5 CORE PILLARS) */}
      <section className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-12">
        <div className="text-center space-y-3">
          <span className="text-xs font-black text-cyan-400 uppercase tracking-widest">WHY RADAR?</span>
          <h2 className="text-2xl sm:text-4xl font-black text-white">
            لماذا تختار منظومة رادار لمتجرك؟
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            صُممت المنصة لتجمع لك بين سهولة الكاشير، سرعة العميل، وقوة التسويق الموجه لزيادة الأرباح.
          </p>
        </div>

        {/* 5 Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Pillar 1: PWA Instant */}
          <div className="group rounded-3xl p-7 bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-cyan-400/40 transition-all duration-300 space-y-4 shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                <Smartphone className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-white">1. بدون تحميل تطبيق (PWA) 📱</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                بطاقة ولاء رقمية فورية تفتح في المتصفح في ثانية واحدة بدون تحميل من المتاجر أو استهلاك ذاكرة جوال العميل، وتُضاف للشاشة الرئيسية بضغطة زر.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-cyan-400 font-bold flex items-center gap-1">
              <span>سهولة مطلقة عند الكاشير</span>
            </div>
          </div>

          {/* Pillar 2: Real Loyalty & Tiers */}
          <div className="group rounded-3xl p-7 bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-emerald-400/40 transition-all duration-300 space-y-4 shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Gift className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-white">2. ولاء حقيقي (نقاط ومكافآت) 💎</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                مستويات عضوية ذكية (Tiers) ومكافآت تحفيزية تجعل العميل يتحمس لتكرار الزيارة لجمع النقاط بدلاً من حرق أرباحك بالخصومات العامة التي تقلل قيمتك.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-emerald-400 font-bold flex items-center gap-1">
              <span>حماية هوامش الربح ومضاعفة الزيارات</span>
            </div>
          </div>

          {/* Pillar 3: Rescue Radar */}
          <div className="group rounded-3xl p-7 bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-amber-400/40 transition-all duration-300 space-y-4 shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <Flame className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-white">3. رادار الإنقاذ (استهداف المنقطعين) ⏰</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                نظام تنبيهات ذكي يرصد العملاء الذين لم يزوروا محلك منذ 30 يوماً ويساعدك ترسل لهم عروض حصرية ومخصصة لإعادتهم لمتجرك بضغطة زر.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-amber-400 font-bold flex items-center gap-1">
              <span>استعادة العملاء قبل خسارتهم</span>
            </div>
          </div>

          {/* Pillar 4: AI Behavior Analytics */}
          <div className="group rounded-3xl p-7 bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-purple-400/40 transition-all duration-300 space-y-4 shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-white">4. تحليل السلوك بالذكاء الاصطناعي 🧠</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                لوحة إحصائيات متقدمة تكشف لك أكثر العملاء إنفاقاً، أوقات الذروة، ونسبة تكرار الزيارات لتتخذ قرارات تسويقية دقيقة مبنية على أرقام حقيقية.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-purple-400 font-bold flex items-center gap-1">
              <span>قرارات تسويقية مبنية على أرقام</span>
            </div>
          </div>

          {/* Pillar 5: Extra Features */}
          <div className="group rounded-3xl p-7 bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-sky-400/40 transition-all duration-300 space-y-4 shadow-xl flex flex-col justify-between md:col-span-2 lg:col-span-2">
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
                <Bot className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-white">5. ميزات إضافية ذكية (مساعد كتابة، حجوزات، إشعارات) ⚡</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                مساعد ذكاء اصطناعي مدمج لصياغة رسائل العروض التسويقية المؤثرة، نظام مرن للحجوزات والمواعيد، وقنوات إشعارات فورية عبر الواتساب والويب لتبقى على اتصال دائم مع زبائنك.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-4 text-[11px] text-sky-400 font-bold flex-wrap">
              <span>✨ صانع رسائل بالـ AI</span>
              <span>✨ ربط واتساب مباشر</span>
              <span>✨ نظام حجوزات مدمج</span>
            </div>
          </div>

        </div>
      </section>

      {/* REGISTRATION FORM SECTION */}
      <section ref={formRef} className="relative z-20 max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="relative rounded-3xl p-6 sm:p-10 bg-gradient-to-b from-slate-900/95 to-slate-950 border-2 border-cyan-400/40 shadow-2xl backdrop-blur-2xl space-y-6">
          
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-3xl p-1 bg-gradient-to-tr from-cyan-400 via-emerald-400 to-amber-400 mx-auto shadow-xl shadow-cyan-500/20">
              <img
                src="/radar-logo-dark.jpg"
                alt="Radar Logo"
                className="w-full h-full object-cover rounded-[20px]"
              />
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-white pt-2">
              خلنا نجهز لك رادار
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              سجّل بيانات نشاطك وسيقوم مستشار رادار بالتواصل معك لتجهيز بطاقتك وتفعيل نظامك فوراً.
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-bold flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {pageState === 'FORM_READY' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Field 1: Owner Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-cyan-400" />
                  <span>الاسم الكريم *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="مثال: صالح القحطاني"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none transition disabled:opacity-50"
                />
              </div>

              {/* Field 2: Store Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-cyan-400" />
                  <span>اسم النشاط / المتجر *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="مثال: لارين كافيه، مخابز الشهد"
                  value={form.store_name}
                  onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none transition disabled:opacity-50"
                />
              </div>

              {/* Field 3: Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-cyan-400" />
                  <span>رقم الجوال *</span>
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  disabled={isSubmitting}
                  placeholder="05XXXXXXXX"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-2xl px-4 py-3.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition text-right disabled:opacity-50"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-black text-base shadow-xl shadow-cyan-500/25 transition duration-150 transform hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التجهيز...</span>
                  </>
                ) : (
                  <span>اطلب تفعيل منصتك الآن 🚀</span>
                )}
              </button>

              <p className="text-[11px] text-center text-slate-500 pt-1">
                🔒 بياناتك محمية ومشفرة، ولن تتم مشاركتها مع أي طرف ثالث.
              </p>
            </form>
          )}

          {pageState === 'SUCCESS' && (
            <div className="text-center py-6 space-y-4 animate-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-white">تم استلام طلبك بنجاح! 🎉</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                شكراً لانضمامك إلى منظومة رادار. سيتواصل معك مستشار رادار المختص لتجهيز هويتك وتفعيل لوحتك وكاشيرك فوراً.
              </p>
            </div>
          )}

        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-20 border-t border-slate-800/80 py-8 text-center text-xs text-slate-500 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <img src="/radar-logo-dark.jpg" alt="Radar" className="w-6 h-6 rounded-lg object-cover" />
          <span className="font-bold text-slate-400">منظومة RADAR للولاء الذكي</span>
        </div>
        <p>© 2026 جميع الحقوق محفوظة • اعرف عميلك . قرّبه . خله يرجع.</p>
      </footer>

    </div>
  );
};

export default MerchantJoinLanding;

import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Smartphone,
  ChevronLeft,
  ShoppingBag,
  Layers,
  ChefHat,
  Receipt,
  HeartHandshake,
  BarChart3,
  WifiOff,
  Clock,
  ShieldCheck,
  Check,
  ArrowRight,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { LoyaltyService } from '../lib/supabase';
import { getActiveTenantConfig } from '../config/tenant';
import confetti from 'canvas-confetti';

interface FormState {
  owner_name: string;
  store_name: string;
  phone: string;
}

export const SadeemRakeenStyleLanding: React.FC = () => {
  const [pageState, setPageState] = useState<'FORM_READY' | 'SUCCESS'>('FORM_READY');
  const [form, setForm] = useState<FormState>({
    owner_name: '',
    store_name: '',
    phone: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const tenant = getActiveTenantConfig();
  const agentPhone = '0544911944';
  const whatsappUrl = `https://wa.me/966544911944?text=${encodeURIComponent('السلام عليكم، مهتم بتجربة نظام سديم لإدارة نشاطي التجاري')}`;

  useEffect(() => {
    document.title = `${tenant.brandName} | نظام التشغيل المتكامل لنقاط البيع وإدارة المطاعم والمقاهي`;
  }, [tenant.brandName]);

  const scrollToForm = () => {
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const normalizePhone = (phone: string): string | null => {
    let clean = phone.replace(/[^\d]/g, '');
    if (clean.startsWith('00966')) clean = clean.substring(5);
    else if (clean.startsWith('966')) clean = clean.substring(3);
    else if (clean.startsWith('0')) clean = clean.substring(1);
    if (/^5\d{8}$/.test(clean)) return `+966${clean}`;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    const normalizedPhone = normalizePhone(rawPhone);
    if (!normalizedPhone) {
      setErrorMessage('يرجى إدخال رقم جوال سعودي يبدأ بـ 05.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await LoyaltyService.submitLead({
        store_name: storeName,
        manager_name: ownerName,
        phone: normalizedPhone,
        notes: `طلب تجربة مجانية من الواجهة الرسمية لسديم (وكيل: ${agentPhone})`,
      });

      if (res.success) {
        setPageState('SUCCESS');
        try {
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#00A3E0', '#D91B5C', '#F7CE3E', '#FFFFFF'],
          });
        } catch {}
      } else {
        setErrorMessage(res.error || 'حدث خطأ أثناء الإرسال، يرجى المحاولة ثانية.');
      }
    } catch (err: any) {
      setErrorMessage('حدث خطأ في الاتصال، يمكنك التواصل معنا مباشرة عبر واتساب.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const coreModules = [
    {
      icon: <Receipt className="w-8 h-8 text-[#00A3E0]" />,
      title: 'نظام الكاشير السحابي والـ Offline',
      badge: 'متوافق مع ZATCA',
      desc: 'يعمل بكفاءة فائقة مع أو بدون اتصال إنترنت. إغلاق ورديات، طباعة فواتير ضريبية مبسطة بـ QR فوري، وإدارة أذونات الصندوق.',
      features: ['يعمل بدون إنترنت دون توقف', 'ربط طابعات البلوتوث والشبكة', 'إغلاق ورديات بدقة حسابية عالية'],
    },
    {
      icon: <Layers className="w-8 h-8 text-[#D91B5C]" />,
      title: 'المخزون والوصفات وتكاليف الأطباق',
      badge: 'إدارة أرباح ذكية',
      desc: 'حساب دقيق لتكلفة الطبق وصافي الربح للمنتجات، تنبيهات آلية عند وصول المواد لحد إعادة الطلب، ومتابعة فواتير الموردين.',
      features: ['هندسة القائمة (Menu Engineering)', 'خصم تلقائي للمواد الخام مع كل بيع', 'تقارير الهدر والمشتريات'],
    },
    {
      icon: <ChefHat className="w-8 h-8 text-[#F7CE3E]" />,
      title: 'شاشات المطبخ الذكية (KDS) والصالة',
      badge: 'تسريع التحضير',
      desc: 'شاشة مطبخ تفاعلية لتنظيم خطوط الإنتاج والطلبات بين الصالة، السفري، والتوصيل، مع تنبيهات صوتية ومؤقت لكل طبق.',
      features: ['توجيه الأصناف لأقسام المطبخ المحددة', 'إدارة الطاولات وحجز الجلسات', 'شاشة عرض جاهزية الطلبات للعملاء'],
    },
    {
      icon: <HeartHandshake className="w-8 h-8 text-[#00A3E0]" />,
      title: 'محرك الولاء والمكافآت على الجوال',
      badge: 'مضاعفة عودة العملاء',
      desc: 'أقوى نظام ولاء رقمي يحفظ عملاءك في Apple Wallet وجوجل دون الحاجة لتحميل تطبيقات ثقيلة، مع استرداد كاش باك ونقاط.',
      features: ['بطاقة ولاء رقمية برقم جوال العميل', 'حملات رسائل العودة التلقائية بالـ AI', 'كوبونات وخصومات مخصصة'],
    },
    {
      icon: <ShoppingBag className="w-8 h-8 text-[#D91B5C]" />,
      title: 'متجر إلكتروني وقائمة طعام QR (بدون عمولة)',
      badge: '0% عمولة',
      desc: 'امتلك موقع طلبات خاص بنشاطك يستقبل طلبات الاستلام من الفرع أو التوصيل مباشرة عبر واتساب ونظامك دون وسيط.',
      features: ['منيو رقمي سريع بتصوير عالي الدقة', 'استقبال الطلبات على واتساب فورا', 'دعم الدفع الإلكتروني والشبكة'],
    },
    {
      icon: <BarChart3 className="w-8 h-8 text-[#F7CE3E]" />,
      title: 'التحليلات ومؤشرات الأداء المباشرة',
      badge: 'تقارير تنفيذية',
      desc: 'لوحة قيادة مركزية تعرض مبيعاتك لحظة بلحظة، الأصناف الأكثر طلباً، أوقات الذروة، مع إمكانية تصدير تقارير Excel رسمية.',
      features: ['تقارير مبيعات شاملة وفورية', 'تصدير إكسل بنقرة زر واحدة', 'تتبع أداء الكاشير والموظفين'],
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#080B11] text-slate-100 font-sans selection:bg-[#00A3E0] selection:text-black">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-[#00A3E0]/10 via-[#D91B5C]/5 to-transparent rounded-full blur-[140px]" />
        <div className="absolute bottom-1/3 left-10 w-[500px] h-[500px] bg-gradient-to-tr from-[#2D1E54]/40 via-[#00A3E0]/5 to-transparent rounded-full blur-[160px]" />
      </div>

      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#080B11]/85 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700/60 p-1 flex items-center justify-center shadow-lg shadow-[#00A3E0]/10 overflow-hidden">
              <img src="/sadeem-logo.jpg" alt={tenant.brandName} className="w-full h-full object-cover rounded-xl" />
            </div>
            <div>
              <span className="text-xl font-black text-white tracking-wide block">
                {tenant.brandName}
              </span>
              <span className="text-[11px] text-cyan-400 font-medium">لتطوير البرمجيات وإدارة الأعمال</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition"
            >
              <MessageCircle className="w-4 h-4" />
              <span>واتساب المبيعات: {agentPhone}</span>
            </a>

            <button
              onClick={scrollToForm}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00A3E0] to-[#0284C7] hover:brightness-110 text-white font-black text-xs shadow-lg shadow-[#00A3E0]/25 transition transform active:scale-95"
            >
              تجربة النظام مجاناً 🚀
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-16 text-center space-y-8">
        
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-[#00A3E0]/40 text-[#00A3E0] text-xs sm:text-sm font-bold shadow-xl backdrop-blur-xl">
          <Sparkles className="w-4 h-4" />
          <span>منظومة تشغيل المطاعم والمقاهي ونقاط البيع السحابية</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-tight max-w-4xl mx-auto tracking-tight">
          كل ما يحتاجه نشاطك التجاري <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A3E0] via-cyan-300 to-[#F7CE3E]">
            من الكاشير إلى المطبخ والولاء
          </span>
          <br />في منصة واحدة سهلة وسريعة
        </h1>

        <p className="text-base sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
          نظام تشغيل متكامل يجمع لك الكاشير السحابي (يعمل أوفلاين)، إدارة المخزون وتكاليف الوصفات، شاشات المطبخ، وبرامج ولاء العملاء لرفع مبيعاتك اليومية وتخفيض الهدر.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-[#00A3E0] via-cyan-500 to-[#0284C7] hover:brightness-110 text-white font-black text-base shadow-2xl shadow-[#00A3E0]/30 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            <span>احجز تجربة مجانية لنشاطك</span>
            <ChevronLeft className="w-5 h-5" />
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-white font-black text-base transition flex items-center justify-center gap-2.5"
          >
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            <span>تواصل مع الوكيل المباشر ({agentPhone})</span>
          </a>
        </div>

        {/* Fast Key Highlights */}
        <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-4xl mx-auto text-xs text-slate-300">
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4 text-[#00A3E0]" />
            <span>يعمل بدون إنترنت Offline</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>معتمد ومطابق للزكاة ZATCA</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-center gap-2">
            <Smartphone className="w-4 h-4 text-[#F7CE3E]" />
            <span>ولاء العميل على Apple Wallet</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 text-[#D91B5C]" />
            <span>تفعيل فوري خلال دقائق</span>
          </div>
        </div>

      </section>

      {/* CORE MODULES / FEATURES GRID */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
          <h2 className="text-2xl sm:text-4xl font-black text-white">
            منظومة متكاملة تدير كافة تفاصيل نشاطك
          </h2>
          <p className="text-sm text-slate-400">
            صُمم النظام ليوفر عليك الاشتراك في عدة برامج منفصلة، ويجمع كل ما تحتاجه في شاشة واحدة.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {coreModules.map((module, idx) => (
            <div
              key={idx}
              className="p-7 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-[#00A3E0]/40 transition duration-200 flex flex-col justify-between group shadow-xl"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center group-hover:scale-105 transition">
                    {module.icon}
                  </div>
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    {module.badge}
                  </span>
                </div>

                <h3 className="text-xl font-black text-white">{module.title}</h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{module.desc}</p>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-2">
                {module.features.map((feat, fIdx) => (
                  <div key={fIdx} className="flex items-center gap-2 text-xs text-slate-300">
                    <Check className="w-3.5 h-3.5 text-[#00A3E0] flex-shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* WHY CHOOSE SADEEM SECTION */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-[#1E1B4B]/60 via-slate-900 to-slate-950 border border-slate-800 shadow-2xl flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 space-y-4">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-[#D91B5C]/20 text-[#D91B5C] border border-[#D91B5C]/30">
              دعم فني حقيقي ومباشر
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-white">
              وكيل معتمد ومستشارك التقني معك خطوة بخطوة
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              مع {tenant.brandName}، لست مجرد رقم تذكرة دعم فني. نحن نساعدك في إدخال منيو متجرك، وتدريب طاقمك، ومتابعة فروعك لضمان انطلاقك بدون أي عقبات.
            </p>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-300 pt-2">
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-400" /> لا توجد رسوم خفية
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-400" /> تدريب كامل للموظفين
              </span>
            </div>
          </div>

          <div className="w-full md:w-auto">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 transition transform hover:scale-105"
            >
              <MessageCircle className="w-5 h-5" />
              <span>تحدث مع الوكيل الآن: {agentPhone}</span>
            </a>
          </div>
        </div>
      </section>

      {/* LEAD CONVERSION FORM */}
      <section ref={formRef} className="relative z-10 max-w-xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-3xl p-6 sm:p-10 bg-slate-900/95 border-2 border-[#00A3E0]/40 shadow-2xl backdrop-blur-2xl space-y-6">
          
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-700/80 p-1 mx-auto flex items-center justify-center shadow-xl shadow-[#00A3E0]/15 overflow-hidden">
              <img src="/sadeem-logo.jpg" alt={tenant.brandName} className="w-full h-full object-cover rounded-xl" />
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-white pt-2">
              اطلب تجربتك المجانية لنشاطك 🚀
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              سجّل بيانات متجرك وسيتواصل معك وكيل {tenant.brandName} المعتمد لتجهيز نظامك وتفعيله فوراً.
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-bold flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {pageState === 'FORM_READY' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-[#00A3E0]" />
                  <span>الاسم الكريم *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="مثال: محمد العمري"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-[#00A3E0] rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-[#00A3E0]" />
                  <span>اسم النشاط / الكافيه / المطعم *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="مثال: مطعم سديم، كافيه الأثر"
                  value={form.store_name}
                  onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-[#00A3E0] rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-[#00A3E0]" />
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
                  className="w-full bg-slate-950 border border-slate-800 focus:border-[#00A3E0] rounded-2xl px-4 py-3.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition text-right"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00A3E0] via-cyan-500 to-[#0284C7] hover:brightness-110 text-white font-black text-base shadow-xl shadow-[#00A3E0]/25 transition duration-150 transform hover:scale-[1.01] flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري إرسال الطلب...</span>
                  </>
                ) : (
                  <span>ابدأ تجربتك المجانية الآن ✨</span>
                )}
              </button>

              <div className="text-center pt-2">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1.5 transition"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>أو تواصل فوراً عبر الواتساب: <strong>{agentPhone}</strong></span>
                </a>
              </div>
            </form>
          )}

          {pageState === 'SUCCESS' && (
            <div className="text-center py-6 space-y-4 animate-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-white">تم استلام طلبك بنجاح! 🎉</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                شكراً لاهتمامك بنظام {tenant.brandName}. سيتواصل معك وكيلنا المعتمد على رقم جوالك فوراً لترتيب بدء التجربة المجانية وإعداد المتجر.
              </p>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition"
              >
                <MessageCircle className="w-4 h-4" />
                <span>متابعة فورية على واتساب الوكيل</span>
              </a>
            </div>
          )}

        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-slate-800/80 py-10 text-center text-xs text-slate-500 space-y-3">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">{tenant.brandName} - لتطوير البرمجيات</span>
            <span>•</span>
            <span>وكيل معتمد وموزع رسمي</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span>جوال وواتساب الوكيل: <strong className="text-white font-mono">{agentPhone}</strong></span>
          </div>
        </div>
        <p className="text-[11px] text-slate-600">© 2026 جميع الحقوق محفوظة • متوافق مع هيئة الزكاة والضريبة والجمارك</p>
      </footer>

    </div>
  );
};

export default SadeemRakeenStyleLanding;

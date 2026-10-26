import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Gift,
  Zap,
  Smartphone,
  Flame,
  Bot,
  TrendingUp,
  Check,
  ChevronLeft,
  ChevronDown,
  ShoppingBag,
  Coffee,
  Utensils,
  Scissors,
  Receipt,
  Clock,
  ArrowUpRight,
  HelpCircle,
  Send,
  Sliders,
  Smile,
  BadgePercent,
  CreditCard,
  QrCode,
  ShieldCheck,
  MapPin,
  Tag,
} from 'lucide-react';
import { LoyaltyService } from '../lib/supabase';
import { getActiveTenantConfig } from '../config/tenant';
import confetti from 'canvas-confetti';

// ==============================================================================
// 🌟 ULTRA-MODERN MULTI-TENANT MERCHANT LANDING PAGE
// Youth-Oriented, High-Converting, White-Label Dynamic (Reseller-Ready)
// ==============================================================================

type PageState = 'FORM_READY' | 'SUCCESS';

interface FormState {
  owner_name: string;
  store_name: string;
  phone: string;
  business_type: string;
  city: string;
}

type SimTab = 'PASS' | 'POS' | 'KDS' | 'CRM';

export const MerchantJoinLanding: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('FORM_READY');
  const [referralCode, setReferralCode] = useState<string>('');
  const [form, setForm] = useState<FormState>({
    owner_name: '',
    store_name: '',
    phone: '',
    business_type: 'مقهى مختص (Specialty Coffee)',
    city: 'الرياض',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  // Dynamic White-Label Tenant Configuration
  const tenant = getActiveTenantConfig();

  // Interactive Phone Simulator States
  const [activeSimTab, setActiveSimTab] = useState<SimTab>('PASS');
  const [stampsCount, setStampsCount] = useState<number>(4);
  const [posDiscountApplied, setPosDiscountApplied] = useState<boolean>(false);
  const [posCompleted, setPosCompleted] = useState<boolean>(false);
  const [kdsOrders, setKdsOrders] = useState([
    { id: '#104', title: 'فلات وايت + كوكيز شوكولاتة', type: 'محلي', time: '02:40 د', status: 'IN_PREP' },
    { id: '#105', title: 'آيسد V60 إثيوبي', type: 'سفري', time: '01:15 د', status: 'IN_PREP' },
    { id: '#106', title: 'سان سباستيان + كورتادو', type: 'محلي', time: '00:30 د', status: 'WAITING' },
  ]);

  // Interactive ROI Calculator States
  const [dailyOrders, setDailyOrders] = useState<number>(110);
  const [avgTicket, setAvgTicket] = useState<number>(36);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Dynamic calculations for ROI
  const monthlyOrders = dailyOrders * 30;
  const repeatVisitsBoost = Math.round(monthlyOrders * 0.22);
  const extraRevenue = Math.round(repeatVisitsBoost * avgTicket);
  const deliveryAppsSaved = Math.round(monthlyOrders * 0.25 * avgTicket * 0.20); // 25% of orders kept direct instead of 20% commission app
  const totalFinancialBenefit = extraRevenue + deliveryAppsSaved;

  // Capture referral code quietly in background without exposing technical clutter
  useEffect(() => {
    document.title = `${tenant.brandName} | المنظومة الذكية لنقاط البيع والولاء`;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('ref') || urlParams.get('r') || '';
      if (ref && ref.trim()) {
        const cleanRef = ref.trim().toLowerCase();
        setReferralCode(cleanRef);
        sessionStorage.setItem('radar_captured_ref', cleanRef);

        fetch(`/api/track?ref=${encodeURIComponent(cleanRef)}`, {
          method: 'GET',
          credentials: 'include',
        }).catch(() => {});
      } else {
        const saved = sessionStorage.getItem('radar_captured_ref');
        if (saved) setReferralCode(saved);
      }
    } catch {}
  }, [tenant.brandName]);

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
      setErrorMessage('يرجى إدخال اسمك الكريم (حرفين على الأقل).');
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
      const res = await LoyaltyService.submitLead({
        store_name: storeName,
        manager_name: ownerName,
        phone: normalizedPhone,
        city: form.city,
        business_type: form.business_type,
        referral_code: referralCode || undefined,
        notes: `طلب انضمام لمنظومة ${tenant.brandName} عبر صفحة الهبوط${referralCode ? ` (كود الشريك: ${referralCode})` : ''} - النشاط: ${form.business_type} - المدينة: ${form.city}`,
      });

      if (res.success) {
        setPageState('SUCCESS');
        try {
          confetti({
            particleCount: 160,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#06B6D4', '#10B981', '#F59E0B', '#3B82F6', '#FFFFFF'],
          });
        } catch {}
      } else {
        setErrorMessage(res.error || 'حدث خطأ أثناء إرسال الطلب، يرجى مراجعة البيانات والمحاولة مجدداً.');
      }
    } catch (err: any) {
      console.error('[MerchantJoinLanding] Submit exception:', err);
      setErrorMessage('حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // WhatsApp Chat Link
  const cleanWhatsappNumber = (tenant.supportWhatsapp || '966500000000').replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${cleanWhatsappNumber}?text=${encodeURIComponent(
    `السلام عليكم، حاب استفسر عن تفعيل منظومة ${tenant.brandName} لمتجري وتجربة النظام.`
  )}`;

  // Interactive Stamp Click Simulator
  const handleStampClick = (index: number) => {
    if (index === stampsCount) {
      const next = (stampsCount + 1) % 7;
      setStampsCount(next === 0 ? 1 : next);
      if (next === 6) {
        try {
          confetti({
            particleCount: 60,
            spread: 60,
            origin: { y: 0.5 },
            colors: ['#F59E0B', '#10B981', '#06B6D4'],
          });
        } catch {}
      }
    }
  };

  // Interactive KDS Order Ready Simulator
  const handleMarkOrderReady = (orderId: string) => {
    setKdsOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (kdsOrders.length <= 1) {
      setTimeout(() => {
        setKdsOrders([
          { id: '#107', title: '2x سبانش لاتيه بارد', type: 'محلي', time: '00:15 د', status: 'IN_PREP' },
          { id: '#108', title: 'كرواسون لوز + كيمكس', type: 'سفري', time: '00:45 د', status: 'WAITING' },
        ]);
      }, 1200);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#07090E] text-slate-100 overflow-x-hidden selection:bg-cyan-500 selection:text-slate-950 font-sans">
      
      {/* Dynamic Ambient Background Lights */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 right-1/4 w-[650px] h-[650px] bg-gradient-to-br from-cyan-500/15 via-emerald-500/10 to-transparent rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -left-48 w-[600px] h-[600px] bg-gradient-to-tr from-amber-500/12 via-cyan-500/8 to-transparent rounded-full blur-[130px]" />
        <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-gradient-to-tl from-emerald-500/15 to-transparent rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40" />
      </div>

      {/* ==================================================================== */}
      {/* FLOATING FROSTED NAVBAR */}
      {/* ==================================================================== */}
      <header className="sticky top-4 z-50 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-2xl shadow-black/50">
          
          {/* Dynamic Brand Monogram / Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl p-0.5 bg-gradient-to-br from-cyan-400 via-emerald-400 to-amber-400 shadow-md shadow-cyan-500/20 flex items-center justify-center font-black text-slate-950 overflow-hidden">
              {tenant.logoUrl ? (
                <img
                  src={tenant.logoUrl}
                  alt={tenant.brandName}
                  className="w-full h-full object-cover rounded-[10px]"
                />
              ) : (
                <span className="w-full h-full bg-slate-950 text-white rounded-[10px] flex items-center justify-center font-black text-sm tracking-wider">
                  {tenant.brandName.slice(0, 2)}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-black tracking-tight text-white">
                  {tenant.brandName}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  متاح للتفعيل
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-1 hidden sm:block">
                {tenant.tagline}
              </p>
            </div>
          </div>

          {/* Quick Nav Anchors & Action CTA */}
          <div className="flex items-center gap-2.5 sm:gap-4">
            <a
              href="#interfaces"
              className="text-xs font-semibold text-slate-300 hover:text-white transition hidden md:block px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              الواجهات الحية
            </a>
            <a
              href="#calculator"
              className="text-xs font-semibold text-slate-300 hover:text-white transition hidden md:block px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              حاسبة الأرباح
            </a>
            <button
              onClick={scrollToForm}
              className="px-4 sm:px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 hover:opacity-95 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-cyan-500/20 transition transform active:scale-95 flex items-center gap-1.5"
            >
              <span>ابدأ الآن مجاناً</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* ==================================================================== */}
      {/* HERO SECTION: YOUTH-FOCUSED, MODERN, BOLD */}
      {/* ==================================================================== */}
      <section className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 text-center space-y-8">
        
        {/* Glow Tagline Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 border border-cyan-400/30 text-cyan-300 text-xs sm:text-sm font-bold shadow-xl backdrop-blur-xl">
          <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
          <span>الجيل الأحدث لكاشير ونقاط ولاء المتاجر السعودية 🇸🇦</span>
        </div>

        {/* Main Punchy Saudi Headline */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.2] tracking-tight max-w-4xl mx-auto">
          كاشير يبيع حتى لو طاح النت... <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-emerald-300 to-amber-300">
            وبطاقة ولاء بمحفظة آبل بدون أي تطبيق!
          </span>
        </h1>

        {/* Hero Narrative */}
        <p className="text-sm sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          وفّر 25% من عمولات تطبيقات التوصيل، وخلّ عميل محلك يرجع لك مرّة بعد مرّة بنظام أختام ونقاط سحابي يحمل اسم وهويّة <span className="font-bold text-white">{tenant.brandName}</span> في ثوانٍ.
        </p>

        {/* Action CTAs */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 max-w-md mx-auto">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 text-slate-950 font-black text-base shadow-2xl shadow-cyan-500/30 transition transform hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2"
          >
            <span>اطلب تجربة متجرك مجاناً 🚀</span>
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-sm transition flex items-center justify-center gap-2 hover:border-emerald-500/40"
          >
            <Send className="w-4 h-4 text-emerald-400" />
            <span>محادثة واتساب سريعة</span>
          </a>
        </div>

        {/* Rapid Feature Pills */}
        <div className="pt-6 flex items-center justify-center gap-4 sm:gap-8 text-xs sm:text-sm text-slate-400 flex-wrap">
          <span className="flex items-center gap-2 bg-slate-900/60 px-3.5 py-1.5 rounded-xl border border-white/5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <strong className="text-white">0% عمولة</strong> على مبيعاتك
          </span>
          <span className="flex items-center gap-2 bg-slate-900/60 px-3.5 py-1.5 rounded-xl border border-white/5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <strong className="text-white">بدون تحميل</strong> يفتح بالكاميرا
          </span>
          <span className="flex items-center gap-2 bg-slate-900/60 px-3.5 py-1.5 rounded-xl border border-white/5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <strong className="text-white">يبيع أوفلاين</strong> بدون انقطاع
          </span>
          <span className="flex items-center gap-2 bg-slate-900/60 px-3.5 py-1.5 rounded-xl border border-white/5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <strong className="text-white">متوافق 100%</strong> مع الزكاة والضريبة
          </span>
        </div>

      </section>

      {/* ==================================================================== */}
      {/* 📱 INTERACTIVE SMARTPHONE & LIVE SYSTEM SIMULATOR */}
      {/* The Core Feature: Real interfaces live in the browser */}
      {/* ==================================================================== */}
      <section id="interfaces" className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20 space-y-8">
        
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-black border border-emerald-500/20">
            <Smartphone className="w-3.5 h-3.5" />
            <span>جرّب الواجهات بيدك الآن</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white">
            شاهد كيف تبدو منظومة {tenant.brandName} على جوالك وجوال عميلك
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            اضغط على التبويبات لتجربة بطاقة محفظة العميل، كاشير البيع السريع، شاشة المطبخ، ولوحة تحكم التاجر.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={() => setActiveSimTab('PASS')}
            className={`px-4 sm:px-6 py-3 rounded-2xl text-xs sm:text-sm font-black transition flex items-center gap-2 border ${
              activeSimTab === 'PASS'
                ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 border-transparent shadow-lg shadow-cyan-500/20 scale-105'
                : 'bg-slate-900/80 text-slate-300 border-white/10 hover:border-white/20'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>1. محفظة العميل (Apple Pass)</span>
          </button>

          <button
            onClick={() => setActiveSimTab('POS')}
            className={`px-4 sm:px-6 py-3 rounded-2xl text-xs sm:text-sm font-black transition flex items-center gap-2 border ${
              activeSimTab === 'POS'
                ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 border-transparent shadow-lg shadow-cyan-500/20 scale-105'
                : 'bg-slate-900/80 text-slate-300 border-white/10 hover:border-white/20'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>2. كاشير البيع السريع (POS)</span>
          </button>

          <button
            onClick={() => setActiveSimTab('KDS')}
            className={`px-4 sm:px-6 py-3 rounded-2xl text-xs sm:text-sm font-black transition flex items-center gap-2 border ${
              activeSimTab === 'KDS'
                ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 border-transparent shadow-lg shadow-cyan-500/20 scale-105'
                : 'bg-slate-900/80 text-slate-300 border-white/10 hover:border-white/20'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>3. شاشة تحضير المطبخ (KDS)</span>
          </button>

          <button
            onClick={() => setActiveSimTab('CRM')}
            className={`px-4 sm:px-6 py-3 rounded-2xl text-xs sm:text-sm font-black transition flex items-center gap-2 border ${
              activeSimTab === 'CRM'
                ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 border-transparent shadow-lg shadow-cyan-500/20 scale-105'
                : 'bg-slate-900/80 text-slate-300 border-white/10 hover:border-white/20'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>4. لوحة الإحصائيات ورادار الإنقاذ</span>
          </button>
        </div>

        {/* Phone Showcase Container */}
        <div className="relative max-w-sm sm:max-w-md mx-auto pt-4">
          
          {/* Outer Glow Halo */}
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/20 via-emerald-500/10 to-transparent rounded-[50px] blur-2xl -z-10" />

          {/* Realistic Smartphone Shell */}
          <div className="relative rounded-[48px] p-3 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 shadow-2xl border-4 border-slate-700/80">
            
            {/* Screen Inner Bezel */}
            <div className="relative rounded-[38px] bg-[#0A0D14] overflow-hidden border border-black/40 min-h-[580px] flex flex-col justify-between text-right">
              
              {/* Dynamic Island / Speaker Notch */}
              <div className="pt-3 pb-2 px-6 flex items-center justify-between z-30 bg-black/40 backdrop-blur-md">
                <span className="text-[11px] font-mono text-slate-400 font-bold">9:41</span>
                <div className="w-24 h-5 bg-black rounded-full mx-auto flex items-center justify-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700" />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-ping" />
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>

              {/* SIMULATOR SCREEN CONTENT */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                
                {/* ======================================================== */}
                {/* 1. CUSTOMER DIGITAL PASS TAB */}
                {/* ======================================================== */}
                {activeSimTab === 'PASS' && (
                  <div className="space-y-4 animate-fade-in">
                    
                    {/* Brand Card Mockup */}
                    <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-600 via-amber-700 to-stone-900 border border-amber-400/30 text-white shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                      
                      {/* Top Bar */}
                      <div className="flex items-center justify-between pb-3 border-b border-white/15">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center font-black text-amber-300 text-xs">
                            ☕
                          </div>
                          <div>
                            <h4 className="text-xs font-black">مقهى ركن البُن</h4>
                            <p className="text-[9px] text-amber-200">الولاء الذكي عبر {tenant.brandName}</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-[10px] font-bold">
                          عضو VIP ذهبي
                        </span>
                      </div>

                      {/* Customer Details */}
                      <div className="py-3 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-amber-200">صاحب البطاقة</p>
                          <p className="text-sm font-black">عبدالله الشمري</p>
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] text-amber-200">رصيد النقاط</p>
                          <p className="text-base font-black text-amber-300">420 نقطة</p>
                        </div>
                      </div>

                      {/* Interactive Stamp Card */}
                      <div className="mt-2 pt-3 border-t border-white/15 space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold">كرت الأختام (اشتر 5 والسادسة مجاناً)</span>
                          <span className="text-amber-300 font-bold">{stampsCount} من 6</span>
                        </div>
                        
                        <div className="grid grid-cols-6 gap-1.5 pt-1">
                          {[0, 1, 2, 3, 4, 5].map((idx) => {
                            const isFilled = idx < stampsCount;
                            const isNext = idx === stampsCount;
                            const isReward = idx === 5;
                            return (
                              <button
                                key={idx}
                                onClick={() => handleStampClick(idx)}
                                title={isNext ? 'اضغط لتجربة الختم!' : ''}
                                className={`h-11 rounded-xl flex flex-col items-center justify-center transition transform active:scale-90 border ${
                                  isFilled
                                    ? 'bg-amber-400 text-stone-950 border-amber-300 shadow-md font-black'
                                    : isNext
                                    ? 'bg-white/20 text-amber-200 border-amber-300 border-dashed animate-pulse cursor-pointer'
                                    : 'bg-black/30 text-white/40 border-white/10'
                                }`}
                              >
                                {isFilled ? (
                                  isReward ? '🎁' : '☕'
                                ) : isReward ? (
                                  <Gift className="w-3.5 h-3.5 text-amber-300" />
                                ) : (
                                  <span className="text-[10px]">{idx + 1}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[9px] text-center text-amber-200/80 pt-1">
                          👆 اضغط على الخانة المنقطة لتجربة الختم الحي!
                        </p>
                      </div>

                      {/* Digital Barcode & Apple Wallet Button */}
                      <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1.5 rounded-lg font-mono text-[10px] tracking-widest text-amber-200">
                          <QrCode className="w-3.5 h-3.5 text-amber-400" />
                          <span>R-9842-SA</span>
                        </div>
                        <span className="text-[10px] bg-black/60 px-2.5 py-1.5 rounded-lg font-bold text-white flex items-center gap-1">
                          <span>🍎 Add to Apple Wallet</span>
                        </span>
                      </div>

                    </div>

                    {/* Bottom Perks Banner */}
                    <div className="rounded-2xl p-3 bg-slate-900 border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-300 font-bold">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>مكافأتك القادمة جاهزة</span>
                        </span>
                        <span className="text-[11px] text-slate-500">متبقي ختم 1</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        مشروبك الساخن المفضل مجاناً عند إتمام الختم القادم!
                      </p>
                    </div>

                  </div>
                )}

                {/* ======================================================== */}
                {/* 2. CASHIER POS TAB */}
                {/* ======================================================== */}
                {activeSimTab === 'POS' && (
                  <div className="space-y-3 animate-fade-in">
                    
                    {/* POS Status Bar */}
                    <div className="flex items-center justify-between text-[11px] bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>الكاشير أوفلاين (يبيع بدون نت)</span>
                      </div>
                      <span className="text-slate-400 font-mono">وردية #14</span>
                    </div>

                    {/* Quick Item Cart Mockup */}
                    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-400 pb-1.5 border-b border-slate-800 text-[11px]">
                        <span>الطلب الحالي (طاولة 4)</span>
                        <span className="text-cyan-400 font-bold">عميل: عبدالله</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">1x فلات وايت (حليب شوفان)</span>
                        <span className="font-mono text-slate-300">18.00 ر.س</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">1x كوكيز بلجيكي كلاسيك</span>
                        <span className="font-mono text-slate-300">14.00 ر.س</span>
                      </div>
                      
                      {posDiscountApplied && (
                        <div className="flex items-center justify-between text-emerald-400 font-bold pt-1 border-t border-slate-800/60">
                          <span>خصم استبدال مكافأة الولاء (100 نقطة)</span>
                          <span className="font-mono">-10.00 ر.س</span>
                        </div>
                      )}
                    </div>

                    {/* Loyalty Points Redemption Toggle */}
                    <button
                      onClick={() => setPosDiscountApplied(!posDiscountApplied)}
                      className={`w-full p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-between ${
                        posDiscountApplied
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-900 border-amber-500/30 text-amber-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5" />
                        <span>{posDiscountApplied ? 'تم تطبيق خصم النقاط' : 'صرف نقاط العميل (خصم 10 ر.س)'}</span>
                      </span>
                      <span className="text-[10px] underline">
                        {posDiscountApplied ? 'إلغاء الخصم' : 'تطبيق الآن'}
                      </span>
                    </button>

                    {/* Order Total */}
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-slate-400">الإجمالي شامل الضريبة</p>
                        <p className="text-lg font-black text-white font-mono">
                          {posDiscountApplied ? '22.00' : '32.00'} <span className="text-xs font-sans text-cyan-400">ر.س</span>
                        </p>
                      </div>
                      
                      <button
                        onClick={() => {
                          setPosCompleted(true);
                          setTimeout(() => setPosCompleted(false), 2000);
                        }}
                        disabled={posCompleted}
                        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-black text-xs shadow-md transition transform active:scale-95"
                      >
                        {posCompleted ? '✓ تم الصرف وطباعة الفاتورة' : 'إتمام البيع وصرف النقاط ⚡'}
                      </button>
                    </div>

                  </div>
                )}

                {/* ======================================================== */}
                {/* 3. KITCHEN DISPLAY SYSTEM TAB */}
                {/* ======================================================== */}
                {activeSimTab === 'KDS' && (
                  <div className="space-y-3 animate-fade-in">
                    
                    <div className="flex items-center justify-between text-[11px] bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>شاشة المطبخ والبار (KDS المباشر)</span>
                      </span>
                      <span className="text-slate-400 text-[10px]">{kdsOrders.length} طلبات جارية</span>
                    </div>

                    <div className="space-y-2 max-h-[340px] overflow-y-auto">
                      {kdsOrders.map((ord) => (
                        <div
                          key={ord.id}
                          className="rounded-2xl p-3 bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-lg bg-cyan-400/20 text-cyan-300 font-mono font-black text-[11px]">
                                {ord.id}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">({ord.type})</span>
                            </div>
                            <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                              ⏱ {ord.time}
                            </span>
                          </div>

                          <p className="text-white font-bold text-xs">{ord.title}</p>

                          <button
                            onClick={() => handleMarkOrderReady(ord.id)}
                            className="w-full py-2 rounded-xl bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 font-black text-[11px] border border-slate-700 hover:border-emerald-500/40 transition flex items-center justify-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>جاهز للتسليم 🔔</span>
                          </button>
                        </div>
                      ))}
                    </div>

                  </div>
                )}

                {/* ======================================================== */}
                {/* 4. CRM & RESCUE RADAR TAB */}
                {/* ======================================================== */}
                {activeSimTab === 'CRM' && (
                  <div className="space-y-3 animate-fade-in">
                    
                    {/* Live Metric Cards */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl p-3 bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400">مبيعات اليوم</span>
                        <p className="text-base font-black text-emerald-400 font-mono">4,890 ر.س</p>
                        <span className="text-[9px] text-emerald-300">+18% عن أمس</span>
                      </div>
                      <div className="rounded-2xl p-3 bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400">الزيارات المتكررة</span>
                        <p className="text-base font-black text-cyan-400 font-mono">74%</p>
                        <span className="text-[9px] text-cyan-300">بدون عمولات للتطبيقات</span>
                      </div>
                    </div>

                    {/* Rescue Radar Box */}
                    <div className="rounded-2xl p-3 bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-400 font-black text-xs flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5 text-amber-400" />
                          <span>رادار استعادة العملاء (المنقطعين)</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[9px] font-bold">
                          آلي 100%
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300">
                        رصد النظام 14 عميلاً لم يزوروا الفرع منذ 25 يوماً. تم إرسال رسالة واتساب مخصصة باسم كل عميل.
                      </p>

                      <div className="rounded-xl bg-black/40 p-2.5 border border-white/5 space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>💬 نص الرسالة التلقائية:</span>
                          <span className="text-emerald-400">رجع 9 عملاء اليوم!</span>
                        </div>
                        <p className="text-[10px] text-slate-300 italic">
                          "يا تركي اشتقنا لك في مقهى ركن البُن! ☕ جهزنا لك فلات وايت مجاني إذا زرتنا قبل الجمعة: [رابط محفظتك]"
                        </p>
                      </div>

                    </div>

                  </div>
                )}

              </div>

              {/* Bottom Phone Bar */}
              <div className="py-2 flex justify-center bg-black/40">
                <div className="w-32 h-1 bg-slate-600 rounded-full" />
              </div>

            </div>

          </div>

        </div>

      </section>

      {/* ==================================================================== */}
      {/* 3D LOYALTY CARD TYPES SHOWCASE */}
      {/* ==================================================================== */}
      <section className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-12">
        <div className="text-center space-y-3">
          <span className="text-xs font-black text-cyan-400 uppercase tracking-widest">LOYALTY PASS MODES</span>
          <h2 className="text-2xl sm:text-4xl font-black text-white">
            اختر نظام الولاء الأنسب لطبيعة نشاطك
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            منظومة {tenant.brandName} تدعم كروت الأختام الرقمية، النقاط والمكافآت، والرتب الاستثنائية بلمسة زر.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1: Stamp Cards (Cafes & Bakeries) */}
          <div className="rounded-3xl p-6 bg-slate-900/80 border border-slate-800 hover:border-amber-400/40 transition-all duration-300 space-y-4 shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Coffee className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">1. كرت الأختام الرقمي</h3>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                  كافيهات ومخابز
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                اشتر 5 أكواب قهوة والسادس مجاناً! أسهل طريقة تحفز العميل يمرك كل صباح بدلاً من المنافس المجاور.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] text-amber-300 font-bold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-amber-400" />
              <span>معدل تكرار زيارات يصل لـ 82%</span>
            </div>
          </div>

          {/* Card 2: Points & Cashback (Restaurants & Burgers) */}
          <div className="rounded-3xl p-6 bg-slate-900/80 border border-slate-800 hover:border-emerald-400/40 transition-all duration-300 space-y-4 shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">2. كاش باك ونقاط لكل ريال</h3>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                  مطاعم وبرجر
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                مع كل ريال ينفقه العميل يكسب نقاطاً يستبدلها بوجبات أو خصم مباشر على فاتورته القادمة فوراً.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] text-emerald-300 font-bold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>رفع متوسط قيمة الفاتورة بنسبة 35%</span>
            </div>
          </div>

          {/* Card 3: VIP Tiers (Salons & Lounges) */}
          <div className="rounded-3xl p-6 bg-slate-900/80 border border-slate-800 hover:border-purple-400/40 transition-all duration-300 space-y-4 shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Scissors className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">3. رتب العضوية VIP</h3>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">
                  صالونات ولاونجات
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                ترقية تلقائية من برونزي إلى فضي وذهبي وبلاتيني، تمنح العميل المميز هيبة وخصومات خاصة تجعله مخلصاً لك للأبد.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] text-purple-300 font-bold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-purple-400" />
              <span>حفظ كبار العملاء الأكثر إنفاقاً</span>
            </div>
          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 📊 INTERACTIVE ROI & PROFIT CALCULATOR */}
      {/* ==================================================================== */}
      <section id="calculator" className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-3xl p-6 sm:p-10 bg-gradient-to-b from-slate-900/90 to-slate-950 border border-cyan-500/30 shadow-2xl space-y-8 backdrop-blur-xl">
          
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-black border border-cyan-500/30">
              <Sliders className="w-3.5 h-3.5" />
              <span>احسب أثر {tenant.brandName} على جيبك بالريال</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              كم ستكسب شهرياً إذا عاد عميلك بدلاً من خسارته؟
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              حرّك المؤشرات وشاهد الأرباح الإضافية والتوفير من عمولات تطبيقات التوصيل:
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            
            {/* Sliders Input */}
            <div className="space-y-6 bg-slate-950/60 p-6 rounded-2xl border border-slate-800">
              
              {/* Slider 1: Daily Orders */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    متوسط عدد الطلبات اليومية في محلك:
                  </label>
                  <span className="text-lg font-black text-cyan-400 font-mono">
                    {dailyOrders} <span className="text-xs font-sans text-slate-400">طلب / يوم</span>
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="350"
                  step="5"
                  value={dailyOrders}
                  onChange={(e) => setDailyOrders(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>30 طلب</span>
                  <span>150 طلب</span>
                  <span>350+ طلب</span>
                </div>
              </div>

              {/* Slider 2: Average Ticket */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    متوسط قيمة الفاتورة:
                  </label>
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    {avgTicket} <span className="text-xs font-sans text-slate-400">ر.س</span>
                  </span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="120"
                  step="1"
                  value={avgTicket}
                  onChange={(e) => setAvgTicket(Number(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>15 ر.س (كافيه)</span>
                  <span>50 ر.س (مطعم)</span>
                  <span>120+ ر.س (صالون/متجر)</span>
                </div>
              </div>

            </div>

            {/* Results Output Cards */}
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-cyan-500/10 to-transparent border border-emerald-500/30 space-y-1">
                <span className="text-xs text-emerald-300 font-bold">
                  زيارات متكررة إضافية من نظام الولاء:
                </span>
                <p className="text-2xl font-black text-white font-mono">
                  +{repeatVisitsBoost.toLocaleString()} <span className="text-xs font-sans text-slate-400">زيارة شهرياً</span>
                </p>
                <p className="text-[11px] text-slate-400">
                  تولد مبيعات مباشرة تقدر بـ <strong className="text-emerald-400 font-mono">+{extraRevenue.toLocaleString()} ر.س</strong>
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-xs text-amber-300 font-bold">
                  توفير عمولات تطبيقات التوصيل (20%):
                </span>
                <p className="text-xl font-black text-white font-mono">
                  +{deliveryAppsSaved.toLocaleString()} <span className="text-xs font-sans text-slate-400">ر.س شهرياً</span>
                </p>
                <p className="text-[11px] text-slate-400">
                  لأن العميل يطلب منك مباشرة بـ 0% عمولة بدلاً من دفعها لوسيط.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 text-slate-950 font-black space-y-0.5">
                <span className="text-xs font-bold text-slate-900">
                  إجمالي الأثر المالي الإيجابي السنوي المتوقع:
                </span>
                <p className="text-2xl sm:text-3xl font-black font-mono">
                  +{(totalFinancialBenefit * 12).toLocaleString()} ر.س / سنوياً 🚀
                </p>
              </div>

            </div>

          </div>

          <div className="text-center pt-2">
            <button
              onClick={scrollToForm}
              className="px-8 py-3.5 rounded-xl bg-white text-slate-950 font-black text-xs sm:text-sm hover:bg-slate-200 transition"
            >
              جاهز لتوفير هذه المبالغ؟ ابدأ تفعيل متجرك الآن 👈
            </button>
          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* DIRECT COMPARISON MATRIX: WHY THIS PLATFORM? */}
      {/* ==================================================================== */}
      <section className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-10">
        <div className="text-center space-y-3">
          <span className="text-xs font-black text-amber-400 uppercase tracking-widest">SMART COMPARISON</span>
          <h2 className="text-2xl sm:text-4xl font-black text-white">
            لماذا تختار {tenant.brandName} بدلاً من الطرق القديمة؟
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Option 1: Old Paper Cards */}
          <div className="rounded-3xl p-6 bg-slate-900/50 border border-rose-500/20 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-rose-500/20">
              <h3 className="font-black text-slate-300">الكروت الورقية القديمة</h3>
              <span className="text-xs text-rose-400 font-bold">بدائي ومكلف</span>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>العميل ينساها أو يضيعها في جيبه</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>تكاليف طباعة وتصميم مستمرة بدون عائد</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>ما تدري مين زارك ولا عندك رقم جواله</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>سهلة التزوير والتلاعب في الأختام</span>
              </li>
            </ul>
          </div>

          {/* Option 2: Delivery Apps */}
          <div className="rounded-3xl p-6 bg-slate-900/50 border border-amber-500/20 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
              <h3 className="font-black text-slate-300">تطبيقات التوصيل الوسيطة</h3>
              <span className="text-xs text-amber-400 font-bold">تلتهم هامشك</span>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✕</span>
                <span>عمولات قاسية بين 20% و 30% على كل طلب</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✕</span>
                <span>بيانات العميل محجوبة عنك بالكامل</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✕</span>
                <span>العميل عميل التطبيق مو عميل متجرك</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✕</span>
                <span>تقييمات مجحفة بدون تحكم منك</span>
              </li>
            </ul>
          </div>

          {/* Option 3: TENANT PLATFORM */}
          <div className="rounded-3xl p-6 bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-400/50 space-y-4 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between pb-3 border-b border-emerald-400/30">
              <h3 className="font-black text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>منظومة {tenant.brandName}</span>
              </h3>
              <span className="text-xs text-emerald-300 font-black bg-emerald-500/20 px-2.5 py-0.5 rounded-full">
                الخيار الذكي
              </span>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-200">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span><strong>0% عمولة</strong>: كل ريال يدخل جيبك بالكامل</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span><strong>بدون تطبيق</strong>: يحفظ بمحفظة آبل وجوجل في ثانيتين</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span><strong>كاشير أوفلاين</strong>: يبيع حتى لو انقطع الإنترنت</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span><strong>رادار الإنقاذ بالواتساب</strong>: يعيد الزبائن المنقطعين آلياً</span>
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 🚀 REGISTRATION FORM SECTION (CONVERSION ENGINE) */}
      {/* ==================================================================== */}
      <section ref={formRef} className="relative z-20 max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="relative rounded-3xl p-6 sm:p-10 bg-gradient-to-b from-slate-900/95 to-slate-950 border-2 border-cyan-400/40 shadow-2xl backdrop-blur-2xl space-y-6">
          
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-3xl p-1 bg-gradient-to-tr from-cyan-400 via-emerald-400 to-amber-400 mx-auto shadow-xl shadow-cyan-500/20 flex items-center justify-center overflow-hidden">
              {tenant.logoUrl ? (
                <img
                  src={tenant.logoUrl}
                  alt={tenant.brandName}
                  className="w-full h-full object-cover rounded-[20px]"
                />
              ) : (
                <span className="w-full h-full bg-slate-950 text-white rounded-[20px] flex items-center justify-center font-black text-xl">
                  {tenant.brandName.slice(0, 2)}
                </span>
              )}
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-white pt-2">
              خلنا نجهّز لك منظومة {tenant.brandName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              سجّل بيانات محلك وسيتواصل معك فريق {tenant.brandName} لتسليمك حسابك وكاشيرك وبطاقتك فوراً.
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
                  placeholder="مثال: راكان السبيعي"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none transition disabled:opacity-50"
                />
              </div>

              {/* Field 2: Store Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-cyan-400" />
                  <span>اسم المتجر / الكافيه *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="مثال: أثر كافيه، شيفز برجر"
                  value={form.store_name}
                  onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none transition disabled:opacity-50"
                />
              </div>

              {/* Field 3: Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-cyan-400" />
                  <span>رقم الجوال للتفعيل والتواصل *</span>
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

              {/* Field 4: Business Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-cyan-400" />
                    <span>نوع النشاط</span>
                  </label>
                  <select
                    value={form.business_type}
                    onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-2xl px-3 py-3 text-xs text-white outline-none transition"
                  >
                    <option value="مقهى مختص (Specialty Coffee)">مقهى مختص (Specialty Coffee)</option>
                    <option value="مطعم أو برجر (Dining / Burger)">مطعم أو برجر (Dining / Burger)</option>
                    <option value="مخبز وحلويات (Bakery / Sweets)">مخبز وحلويات (Bakery / Sweets)</option>
                    <option value="صالون وعناية (Salon / Spa)">صالون وعناية (Salon / Spa)</option>
                    <option value="متجر تجزئة أو ملابس (Retail)">متجر تجزئة أو ملابس (Retail)</option>
                    <option value="نشاط آخر (Other)">نشاط آخر (Other)</option>
                  </select>
                </div>

                {/* Field 5: City */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-cyan-400" />
                    <span>المدينة</span>
                  </label>
                  <select
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-2xl px-3 py-3 text-xs text-white outline-none transition"
                  >
                    <option value="الرياض">الرياض</option>
                    <option value="جدة">جدة</option>
                    <option value="الدمام / الخبر">الدمام / الخبر</option>
                    <option value="مكة المكرمة">مكة المكرمة</option>
                    <option value="المدينة المنورة">المدينة المنورة</option>
                    <option value="القصيم">القصيم</option>
                    <option value="أخرى">مدينة أخرى</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-black text-base shadow-xl shadow-cyan-500/25 transition duration-150 transform hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التجهيز...</span>
                  </>
                ) : (
                  <span>اطلب تفعيل حسابك الآن مجاناً 🚀</span>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>بياناتك محمية ومشفرة، وتفعيل فوري بنفس اليوم.</span>
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
                شكراً لاختيارك منظومة {tenant.brandName}. سيتواصل معك أحد مستشارينا خلال دقائق لتجهيز كاشيرك وتفعيل بطاقة متجرك فوراً.
              </p>
              
              <div className="pt-2">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs transition"
                >
                  <Send className="w-4 h-4" />
                  <span>تواصل معنا مباشرة عبر الواتساب</span>
                </a>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ==================================================================== */}
      {/* ❓ FREQUENTLY ASKED QUESTIONS (FAQ) */}
      {/* ==================================================================== */}
      <section className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="text-center space-y-2">
          <span className="text-xs font-black text-cyan-400 uppercase tracking-widest">FAQ</span>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            الأسئلة الشائعة لأصحاب المشاريع
          </h2>
        </div>

        <div className="space-y-3">
          {[
            {
              q: 'هل أحتاج لشراء أجهزة أو طابعات خاصة لتشغيل النظام؟',
              a: 'أبداً! منظومة سحابية متكاملة تعمل على أي جهاز تمتلكه بالفعل: جهاز آيباد، تابلت أندرويد، لابتوب، أو حتى جوالك الشخصي، وتتصل بطابعات الفواتير عبر البلوتوث أو الشبكة بضغطة زر.',
            },
            {
              q: 'كيف يحفظ العميل بطاقة الولاء بدون تحميل تطبيق؟',
              a: 'بكل بساطة، العميل يفتح كاميرا جواله ويمسح كود الاستجابة السريع (QR) عند الكاشير أو الطاولة، فتفتح له بطاقة الولاء فوراً وتنزل بضغطة واحدة في محفظة Apple Wallet أو Google Wallet في أقل من ثانيتين!',
            },
            {
              q: 'هل الكاشير يبيع فعلاً لو انقطع الإنترنت في المحل؟',
              a: 'نعم 100%! تم بناء الكاشير بتقنية Offline-First المتطورة؛ تستطيع إتمام العمليات وفتح الدرج وطباعة الفواتير دون أي توقف، وفور عودة الإنترنت تتم المزامنة تلقائياً مع السحابة في الخلفية.',
            },
            {
              q: 'هل المنظومة متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA)؟',
              a: 'نعم بالكامل، تصدر المنظومة فواتير إلكترونية مبسطة معتمدة تتضمن رمز الاستجابة السريع المشفر (ZATCA QR) وكافة الحقول الإلزامية الضريبية.',
            },
            {
              q: 'كم يستغرق تفعيل متجري وبدء البيع؟',
              a: 'يتم تجهيز هويتك، إضافة منتجاتك، وتفعيل بطاقة متجرك في أقل من 30 دقيقة، وتبدأ باستقبال عملائك وجمع النقاط في نفس اليوم.',
            },
          ].map((faq, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden transition"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full p-4 sm:p-5 text-right font-bold text-sm text-white flex items-center justify-between gap-4"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-cyan-400 transition-transform ${
                    openFaq === idx ? 'transform rotate-180' : ''
                  }`}
                />
              </button>
              {openFaq === idx && (
                <div className="px-4 sm:px-5 pb-5 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* FOOTER: DYNAMIC WHITE-LABEL BRANDING */}
      {/* ==================================================================== */}
      <footer className="relative z-20 border-t border-slate-800/80 py-10 text-center text-xs text-slate-500 space-y-4">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">{tenant.brandName}</span>
            <span>•</span>
            <span>{tenant.tagline}</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <a href="#interfaces" className="hover:text-white transition">الواجهات</a>
            <a href="#calculator" className="hover:text-white transition">حاسبة الأرباح</a>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition">الدعم الفني</a>
          </div>
        </div>
        <p className="text-[11px] text-slate-600">
          © 2026 {tenant.copyrightHolder} • جميع الحقوق محفوظة
        </p>
      </footer>

    </div>
  );
};

export default MerchantJoinLanding;

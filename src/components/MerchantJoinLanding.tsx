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
  Send,
  CreditCard,
  QrCode,
  ShieldCheck,
  MapPin,
  Tag,
  Car,
  Stethoscope,
  Calendar,
  WifiOff,
  Printer,
  Layers,
} from 'lucide-react';
import { LoyaltyService } from '../lib/supabase';
import { LoyaltyEvents, type LoyaltyEventPayload } from '../lib/events';
import type { BillingPlan } from '../types';
import { getActiveTenantConfig } from '../config/tenant';
import confetti from 'canvas-confetti';

// ==============================================================================
// 🌟 ALL-IN-ONE MULTI-INDUSTRY MERCHANT OPERATING & LOYALTY PLATFORM
// Dynamic White-Label Engine for All Resellers (Radar, Sadeem Al-Athar, etc.)
// Covers: Cafes, Salons, Car Washes, Clinics, Restaurants, & Retail
// ==============================================================================

type PageState = 'FORM_READY' | 'SUCCESS';

type IndustryKey = 'CAFE' | 'SALON' | 'CARWASH' | 'CLINIC' | 'RESTAURANT' | 'RETAIL';

interface FormState {
  owner_name: string;
  store_name: string;
  phone: string;
  business_type: string;
  city: string;
}

export const MerchantJoinLanding: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('FORM_READY');
  const [referralCode, setReferralCode] = useState<string>('');
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryKey>('CAFE');
  
  const [form, setForm] = useState<FormState>({
    owner_name: '',
    store_name: '',
    phone: '',
    business_type: 'كافيه أو مخبز (Cafe & Bakery)',
    city: 'الرياض',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  
  const formRef = useRef<HTMLDivElement | null>(null);

  // 🏷️ Dynamic White-Label Billing Plans fetched directly from get_public_billing_plans RPC
  const [dynamicPlans, setDynamicPlans] = useState<BillingPlan[]>([]);

  useEffect(() => {
    const loadPlans = () => {
      LoyaltyService.getAllSubscriptionPlans()
        .then((plans) => {
          if (plans && plans.length > 0) {
            const active = plans
              .filter((p) => p.active !== false)
              .sort((a, b) => (a.tier_level ?? 1) - (b.tier_level ?? 1));
            if (active.length > 0) {
              setDynamicPlans(active);
            }
          }
        })
        .catch((err) => console.warn('[MerchantJoinLanding] Error loading dynamic billing plans:', err));
    };

    loadPlans();

    // 🔄 Live re-sync when plans are updated in Super Admin or when tab regains focus
    const unsub = LoyaltyEvents.listen((event: LoyaltyEventPayload) => {
      if (event.type === 'STORE_UPDATED') {
        loadPlans();
      }
    });

    const handleFocus = () => loadPlans();
    window.addEventListener('focus', handleFocus);

    return () => {
      unsub();
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Dynamic White-Label Tenant Configuration
  const tenant = getActiveTenantConfig();

  // Capture referral code quietly in background without clutter
  useEffect(() => {
    document.title = `${tenant.brandName} | المنظومة الذكية لإدارة المبيعات والحجوزات والولاء`;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('ref') || urlParams.get('r') || '';
      if (ref && ref.trim()) {
        const cleanRef = ref.trim().toUpperCase();
        setReferralCode(cleanRef);
        sessionStorage.setItem('radar_captured_ref', cleanRef);

        fetch(`/api/track?ref=${encodeURIComponent(cleanRef)}`, {
          method: 'GET',
          credentials: 'include',
        }).catch(() => {});
      } else {
        const saved = sessionStorage.getItem('radar_captured_ref');
        if (saved) setReferralCode(saved.toUpperCase());
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
      setErrorMessage('يرجى كتابة اسم النشاط أو المحل.');
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
        notes: `طلب انضمام لمنظومة ${tenant.brandName} عبر صفحة الهبوط الرسمية${
          referralCode ? ` (كود الشريك: ${referralCode})` : ''
        } - النشاط: ${form.business_type} - المدينة: ${form.city}`,
      });

      if (res.success) {
        setPageState('SUCCESS');
        try {
          confetti({
            particleCount: 160,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#CCFF00', '#10E588', '#F59E0B', '#3B82F6', '#FFFFFF'],
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

  // WhatsApp Support Link
  const cleanWhatsappNumber = (tenant.supportWhatsapp || '966500000000').replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${cleanWhatsappNumber}?text=${encodeURIComponent(
    `السلام عليكم، حاب استفسر عن تفعيل منظومة ${tenant.brandName} لنشاطي وتجربة المنصة.`
  )}`;

  // Industry Specific Data Details
  const industriesConfig = {
    CAFE: {
      name: 'الكافيهات والمخابز',
      icon: Coffee,
      badge: 'كافيهات ومخابز',
      heroSub: 'طلب الطاولات بالـ QR، كرت أختام كوبك السادس مجاناً، وشاشة باريستا للطلبات السريعة.',
      screenTitle: 'ركن البُن | Coffee Corner',
      screenSubtitle: 'كرت أختام رقمي • 4/6 أكواب',
      notificationText: 'يا عبدالله، باقي لك كوبين على قهوتك المجانية! ☕',
      tagColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      activeColor: '#F59E0B',
    },
    SALON: {
      name: 'الصالونات ومراكز العناية',
      icon: Scissors,
      badge: 'صالونات ومراكز تجميل',
      heroSub: 'جدول مواعيد ذكي، اختيار الأخصائي المفضل، ورتب عضوية VIP بلاتينيوم تعيد العميل شهرياً.',
      screenTitle: 'لاونج ستايل | Style Lounge',
      screenSubtitle: 'عضوية VIP ذهبية • رصيد 350 نقطة',
      notificationText: 'تذكير: موعد جلسة العناية اليوم الساعة 5:30 مساءً ✂️',
      tagColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      activeColor: '#A855F7',
    },
    CARWASH: {
      name: 'مغاسل وتلميع السيارات',
      icon: Car,
      badge: 'مغاسل وتلميع سيارات',
      heroSub: 'كرت غسيل رقمي مرتبط برقم لوحة السيارة، مع تنبيه آلي بمجرد جاهزية سيارة العميل.',
      screenTitle: 'سبارك كلين | Spark Auto',
      screenSubtitle: 'كرت باقة 4 غسلات + تلميع مجاني',
      notificationText: 'تم الانتهاء من غسيل وتلميع سيارتك وهي جاهزة للاستلام 🚗✨',
      tagColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      activeColor: '#0EA5E9',
    },
    CLINIC: {
      name: 'العيادات والمراكز الصحية',
      icon: Stethoscope,
      badge: 'عيادات ومراكز صحية',
      heroSub: 'حجز المواعيد الطبية بدقة، باقات الجلسات المسبقة، وملف المريض الإلكتروني المتكامل.',
      screenTitle: 'عيادات غلو | Glow Clinic',
      screenSubtitle: 'باقة نضارة • متبقي 2 من 5 جلسات',
      notificationText: 'تأكيد حجز جلستك القادمة يوم الأربعاء الساعة 4:00 عصراً 🩺',
      tagColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      activeColor: '#10B981',
    },
    RESTAURANT: {
      name: 'المطاعم والمطابخ السحابية',
      icon: Utensils,
      badge: 'مطاعم وسحابية',
      heroSub: 'كاشير أوفلاين، منيو أونلاين بـ 0% عمولة، وبوابة خاصة بمناديب التوصيل لتوفير العمولات.',
      screenTitle: 'شيفز برجر | Chefz Burger',
      screenSubtitle: 'كاش باك 10% • رصيد المحفظة 45 ر.س',
      notificationText: 'طلبك #108 في طريقه إليك مع الكابتن أحمد 🛵',
      tagColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      activeColor: '#F43F5E',
    },
    RETAIL: {
      name: 'متاجر التجزئة والعطور',
      icon: ShoppingBag,
      badge: 'تجزئة وعطور وملابس',
      heroSub: 'كاشير باركود سريع، فواتير ضريبية فورية على الواتساب، ونقاط مكافأة مع كل عملية شراء.',
      screenTitle: 'عطور الأريج | Aroma Oud',
      screenSubtitle: 'نقاط مكافآت • رصيد 620 نقطة',
      notificationText: 'تمت إضافة 45 نقطة إلى محفظتك بعد زيارتك اليوم 🎁',
      tagColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      activeColor: '#14B8A6',
    },
  };

  const currentInd = industriesConfig[selectedIndustry];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0A0F15] text-slate-100 overflow-x-hidden selection:bg-[#CCFF00] selection:text-slate-950 font-sans">
      
      {/* Dynamic Ambient Background Lights */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 right-1/4 w-[650px] h-[650px] bg-gradient-to-br from-[#10E588]/12 via-[#CCFF00]/8 to-transparent rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -left-48 w-[600px] h-[600px] bg-gradient-to-tr from-emerald-500/10 via-cyan-500/8 to-transparent rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />
      </div>

      {/* ==================================================================== */}
      {/* 🚀 TOP FLOATING NAVBAR */}
      {/* ==================================================================== */}
      <header className="sticky top-4 z-50 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="rounded-full bg-[#0D151D]/90 backdrop-blur-xl border border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between shadow-2xl shadow-black/60">
          
          {/* Dynamic Brand Logo / Monogram */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full p-0.5 bg-gradient-to-tr from-[#CCFF00] via-[#10E588] to-emerald-400 shadow-md flex items-center justify-center overflow-hidden">
              {tenant.logoUrl ? (
                <img
                  src={tenant.logoUrl}
                  alt={tenant.brandName}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="w-full h-full bg-[#0A0F15] text-[#CCFF00] rounded-full flex items-center justify-center font-black text-sm tracking-wider">
                  {tenant.brandName.slice(0, 2)}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-black tracking-tight text-white">
                {tenant.brandName}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#CCFF00]/15 text-[#CCFF00] text-[10px] font-bold border border-[#CCFF00]/30 hidden sm:flex">
                <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse" />
                جاهز للتفعيل الفوري
              </span>
            </div>
          </div>

          {/* Quick Nav Anchors & Action CTA */}
          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href="#pos"
              className="text-xs font-semibold text-slate-300 hover:text-[#CCFF00] transition hidden md:block px-2 py-1"
            >
              الكاشير الأوفلاين
            </a>
            <a
              href="#bookings"
              className="text-xs font-semibold text-slate-300 hover:text-[#CCFF00] transition hidden md:block px-2 py-1"
            >
              الحجوزات
            </a>
            <a
              href="#loyalty"
              className="text-xs font-semibold text-slate-300 hover:text-[#CCFF00] transition hidden md:block px-2 py-1"
            >
              محفظة الولاء
            </a>
            <a
              href="#pricing"
              className="text-xs font-semibold text-slate-300 hover:text-[#CCFF00] transition hidden md:block px-2 py-1"
            >
              الباقات
            </a>

            <button
              onClick={scrollToForm}
              className="px-5 py-2.5 rounded-full bg-[#CCFF00] hover:bg-[#b8e600] text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-[#CCFF00]/20 transition transform active:scale-95 flex items-center gap-1.5"
            >
              <span>ابدأ مجاناً</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* ==================================================================== */}
      {/* ⚡ HERO SECTION (DARK OBSIDIAN & ELECTRIC LIME) */}
      {/* ==================================================================== */}
      <section className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-16 space-y-10">
        
        {/* Top Trial Badge */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#121B24] border border-[#CCFF00]/30 text-white text-xs sm:text-sm font-bold shadow-xl backdrop-blur-xl">
            <span className="px-2 py-0.5 rounded-full bg-[#CCFF00] text-slate-950 font-black text-[11px]">
              تجربة مجانية
            </span>
            <span>أول 30 يوماً مجاناً بالكامل • بدون أي عقود أو التزام</span>
          </div>
        </div>

        {/* Main Punchy Multi-Sector Headline */}
        <div className="text-center space-y-4 max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.25] tracking-tight">
            لكل مشروع ناجح، <br className="hidden sm:block" />
            يستند على{' '}
            <span className="inline-block px-4 py-1 rounded-2xl bg-[#CCFF00] text-slate-950 transform -rotate-1 shadow-lg shadow-[#CCFF00]/20">
              {tenant.brandName}
            </span>
          </h1>

          <p className="text-base sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed pt-2">
            الكاشير، الحجوزات والمواعيد، ومحفظة الولاء الرقمية. <br className="hidden sm:block" />
            <span className="text-[#CCFF00] font-bold">نظام واحد يشتغل عن نشاطك بالكامل</span> ويضاعف مبيعاتك وأرباحك.
          </p>
        </div>

        {/* Quick Sector Selector Buttons */}
        <div className="space-y-3 max-w-4xl mx-auto">
          <p className="text-xs text-center font-bold text-slate-400">
            اختر قطاعك وشاهد كيف تتكيف المنظومة مع تفاصيل عملك:
          </p>
          <div className="flex items-center justify-center gap-2 sm:gap-2.5 flex-wrap">
            {(Object.keys(industriesConfig) as IndustryKey[]).map((key) => {
              const item = industriesConfig[key];
              const Icon = item.icon;
              const isSelected = selectedIndustry === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedIndustry(key)}
                  className={`px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-[#CCFF00] text-slate-950 border-transparent font-black shadow-lg shadow-[#CCFF00]/20 scale-105'
                      : 'bg-[#121B24]/90 text-slate-300 border-white/10 hover:border-white/25 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Device & Live Showcase */}
        <div className="relative pt-6 max-w-5xl mx-auto">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            
            {/* Left Column: Dynamic Interactive Mockups */}
            <div className="lg:col-span-7 relative">
              
              {/* Outer Glow */}
              <div className="absolute inset-0 bg-gradient-to-tr from-[#10E588]/15 via-[#CCFF00]/10 to-transparent rounded-3xl blur-2xl -z-10" />

              {/* Main Console Showcase Box */}
              <div className="rounded-3xl p-5 sm:p-6 bg-[#0E1620] border border-white/15 shadow-2xl space-y-4">
                
                {/* Console Top Header */}
                <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    <span className="font-mono text-slate-400 font-bold pr-2">{currentInd.screenTitle}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-[#CCFF00]/15 text-[#CCFF00] border border-[#CCFF00]/30">
                    🟢 كاشير سحابي متصل
                  </span>
                </div>

                {/* Dynamic Screen Content Based on Industry */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  
                  {/* Left Widget: The Pass / Membership */}
                  <div className="rounded-2xl p-4 bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 space-y-3 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold">محفظة العميل (Apple Wallet)</span>
                      <QrCode className="w-4 h-4 text-[#CCFF00]" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-white">{currentInd.screenTitle}</p>
                      <p className="text-[11px] text-[#CCFF00] font-bold">{currentInd.screenSubtitle}</p>
                    </div>

                    {/* Mini Pass Perks */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-300">
                      <span>الاسم: محمد الخالدي</span>
                      <span className="text-[#CCFF00]">خصم 15% VIP</span>
                    </div>
                  </div>

                  {/* Right Widget: Live Operations & Shift Metrics */}
                  <div className="rounded-2xl p-4 bg-slate-900/90 border border-white/10 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>صافي مبيعات اليوم</span>
                      <span className="text-emerald-400 font-bold">+24%</span>
                    </div>
                    <p className="text-xl font-black text-white font-mono">
                      18,450.00 <span className="text-xs font-sans text-[#CCFF00]">ر.س</span>
                    </p>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                      <span>الطلبات: 168 طلب</span>
                      <span className="text-cyan-400 font-bold">الزيارات المتكررة: 74%</span>
                    </div>
                  </div>

                </div>

                {/* Realistic Floating Push Notification Pill */}
                <div className="rounded-2xl p-3.5 bg-[#121B24] border border-[#CCFF00]/40 flex items-center gap-3 shadow-lg">
                  <div className="w-8 h-8 rounded-xl bg-[#CCFF00] text-slate-950 flex items-center justify-center font-black flex-shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-right text-xs">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pb-0.5">
                      <span className="font-bold text-white">إشعار شاشة القفل الفوري (Lock Screen)</span>
                      <span>الآن</span>
                    </div>
                    <p className="text-slate-200 font-medium text-[11px]">
                      {currentInd.notificationText}
                    </p>
                  </div>
                </div>

              </div>

            </div>

            {/* Right Column: CTA & Dynamic Highlights */}
            <div className="lg:col-span-5 space-y-6 text-right">
              
              <div className="space-y-3">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-black border ${currentInd.tagColor}`}>
                  {currentInd.badge}
                </span>
                <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  نظام صُمم ليفهم تفاصيل <br />
                  <span className="text-[#CCFF00]">{currentInd.name}</span>
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {currentInd.heroSub}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={scrollToForm}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-[#CCFF00] hover:bg-[#b8e600] text-slate-950 font-black text-base shadow-xl shadow-[#CCFF00]/25 transition transform active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>اطلب تجربة متجرك مجاناً 🚀</span>
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <p className="text-xs text-slate-400">
                  ⚡ لا يتطلب شراء أجهزة خاصة — يعمل على أجهزتك الحالية في 30 دقيقة.
                </p>
              </div>

            </div>

          </div>

        </div>

        {/* ================================================================== */}
        {/* 💡 THE EQUATION BAR (نظام واحد يجمع كل شيء) */}
        {/* ================================================================== */}
        <div className="pt-8">
          <div className="rounded-3xl p-6 sm:p-8 bg-[#0D151F] border border-white/10 text-center space-y-4">
            
            <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm font-bold text-slate-300">
              <span className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10">الكاشير الأوفلاين</span>
              <span className="text-[#CCFF00] font-black">+</span>
              <span className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10">الحجوزات والمواعيد</span>
              <span className="text-[#CCFF00] font-black">+</span>
              <span className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10">محفظة Apple Wallet</span>
              <span className="text-[#CCFF00] font-black">+</span>
              <span className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10">تطبيق المناديب (0% عمولة)</span>
              <span className="text-[#CCFF00] font-black">+</span>
              <span className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10">{tenant.brandName === 'رادار' ? 'رادار الإنقاذ بالواتساب' : 'منظومة الإنقاذ بالواتساب'}</span>
              <span className="text-[#CCFF00] font-black">=</span>
              <span className="px-4 py-1.5 rounded-full bg-[#CCFF00] text-slate-950 font-black shadow-md">
                {tenant.brandName}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
              بدل ما تشترك في خمسة برامج وتدفع آلاف شهرياً وتضيع وقتك بالربط المعقد؛ كلها مدمجة في نظام واحد واشتراك واحد يحمل اسمك التجاري.
            </p>

          </div>
        </div>

      </section>

      {/* ==================================================================== */}
      {/* 🧾 FEATURE 01: OFFLINE POS & REAL PRINTER (WARM IVORY SECTION) */}
      {/* ==================================================================== */}
      <section id="pos" className="relative z-20 bg-[#FAF9F5] text-slate-900 py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Right Side: Copy & Checklist */}
          <div className="lg:col-span-6 space-y-6 text-right order-2 lg:order-1">
            
            <div className="flex items-center gap-3">
              <span className="text-4xl sm:text-5xl font-black text-slate-300 font-mono">01</span>
              <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-black">
                الكاشير السحابي المطور
              </span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-slate-950 leading-tight">
              يبيع، حتى لو <br />
              <span className="underline decoration-[#CCFF00] decoration-wavy decoration-4">
                طاح النت.
              </span>
            </h2>

            <p className="text-base text-slate-600 leading-relaxed font-medium">
              تنقطع الشبكة في المحل؟ الكاشير يكمل بدون توقف، يطبع فواتيرك، ويسجل مبيعاتك، وفور عودة النت يرسل كل شيء ويحدث تقاريرك تلقائياً.
            </p>

            <ul className="space-y-3 text-sm font-bold text-slate-800">
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span>فاتورة ضريبية مبسطة معتمدة برمز QR (هيئة الزكاة ZATCA)</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span>دفع كاش، مدى، فيزا، وتقسيم الفاتورة بمرونة</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span>يعمل على الآيباد، التابلت، اللابتوب، أو أجهزة الكاشير المحمولة</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span>إغلاق الوردية والتقرير النهائي (Z-Report) بضغطة زر</span>
              </li>
            </ul>

          </div>

          {/* Left Side: Real Thermal Printer Mockup with Invoice */}
          <div className="lg:col-span-6 relative order-1 lg:order-2">
            
            {/* Printer Slot Housing */}
            <div className="max-w-sm mx-auto">
              
              {/* Printer Hardware Top Bar */}
              <div className="rounded-t-2xl bg-slate-900 p-4 border-b-4 border-slate-950 shadow-xl flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-bold tracking-wider">ESC/POS THERMAL PRINTER</span>
                </div>
                <Printer className="w-4 h-4 text-slate-400" />
              </div>

              {/* Realistic Paper Receipt Sliding Out */}
              <div className="bg-white p-6 shadow-2xl border-x border-b border-slate-200 space-y-4 font-mono text-xs text-slate-800 relative">
                
                {/* Floating Offline Status Badge */}
                <div className="absolute -top-3 left-4 bg-slate-900 text-white px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-md">
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  <span>بدون اتصال • 28 طلبات محفوظة</span>
                </div>

                <div className="text-center space-y-1 pt-2 border-b border-dashed border-slate-300 pb-3">
                  <h4 className="font-black text-sm text-slate-950 font-sans">{tenant.brandName} - فرع العليا</h4>
                  <p className="text-[10px] text-slate-500">فاتورة ضريبية مبسطة</p>
                  <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                    <span>رقم الفاتورة: #1042</span>
                    <span>2026-10-26 • 11:20 ص</span>
                  </div>
                </div>

                {/* Invoice Items */}
                <div className="space-y-1.5 text-[11px] border-b border-dashed border-slate-300 pb-3">
                  <div className="flex justify-between">
                    <span>1x فلات وايت (حليب شوفان)</span>
                    <span className="font-bold">18.00 ر.س</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1x كوكيز شوكولاتة بلجيكي</span>
                    <span className="font-bold">14.00 ر.س</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>خصم استبدال مكافأة الولاء (100 نقطة)</span>
                    <span>-10.00 ر.س</span>
                  </div>
                </div>

                {/* Totals */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-500 text-[10px]">
                    <span>المجموع قبل الضريبة:</span>
                    <span>19.13 ر.س</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[10px]">
                    <span>ضريبة القيمة المضافة (15%):</span>
                    <span>2.87 ر.س</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-slate-950 pt-1 border-t border-slate-200">
                    <span>الإجمالي شامل الضريبة:</span>
                    <span className="text-base font-bold">22.00 ر.س</span>
                  </div>
                </div>

                {/* ZATCA QR Code */}
                <div className="pt-2 text-center space-y-1">
                  <div className="w-20 h-20 bg-slate-100 border border-slate-300 mx-auto rounded-lg flex items-center justify-center p-1">
                    <QrCode className="w-full h-full text-slate-900" />
                  </div>
                  <p className="text-[9px] text-slate-400">شكراً لزيارتكم • فواتير إلكترونية معتمدة</p>
                </div>

              </div>

            </div>

          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 📅 FEATURE 02: SMART APPOINTMENTS & BOOKINGS FOR SALONS & CLINICS */}
      {/* ==================================================================== */}
      <section id="bookings" className="relative z-20 bg-[#FAF9F5] text-slate-900 py-16 px-4 sm:px-6 border-t border-slate-200/80">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Side: Interactive Appointments Mockup */}
          <div className="lg:col-span-6 relative">
            <div className="max-w-md mx-auto rounded-3xl p-6 bg-slate-900 text-white shadow-2xl border border-slate-800 space-y-4">
              
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#CCFF00]" />
                  <span className="text-xs font-black">جدول حجوزات اليوم (مباشر)</span>
                </div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#CCFF00]/15 text-[#CCFF00] font-bold">
                  صالونات وعيادات ومراكز
                </span>
              </div>

              {/* Appointment Cards */}
              <div className="space-y-2.5 text-xs">
                
                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-emerald-500/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white">جلسة عناية متكاملة + تصفيف</span>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/15 px-2 py-0.5 rounded">
                      مؤكد • 04:30 م
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>العميل: ريم القحطاني</span>
                    <span className="text-[#CCFF00]">الأخصائية: مريم</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white">تلميع ساطع + حماية نانو</span>
                    <span className="text-[10px] text-amber-400 font-bold bg-amber-500/15 px-2 py-0.5 rounded">
                      قيد التنفيذ • 05:15 م
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>السيارة: لكزس 2024 (أ د ص 902)</span>
                    <span className="text-slate-300">الفني: خالد</span>
                  </div>
                </div>

              </div>

              {/* Automatic WhatsApp Reminder Mockup */}
              <div className="rounded-2xl p-3 bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-3 text-xs">
                <Send className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-[11px] text-emerald-200">
                  <strong>تأكيد آلي بالواتساب:</strong> يرسل النظام تنبيهاً ذكياً للعميل قبل موعده بساعتين مع خيار التأكيد لتقليل الغياب بنسبة 85%!
                </p>
              </div>

            </div>
          </div>

          {/* Right Side: Copy & Details */}
          <div className="lg:col-span-6 space-y-6 text-right">
            
            <div className="flex items-center gap-3">
              <span className="text-4xl sm:text-5xl font-black text-slate-300 font-mono">02</span>
              <span className="px-3 py-1 rounded-full bg-purple-600 text-white text-xs font-black">
                الحجوزات والمواعيد الذكية
              </span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-slate-950 leading-tight">
              مواعيدك في جيبك، <br />
              <span className="underline decoration-purple-500 decoration-wavy decoration-4">
                بدون تضارب أو فوضى.
              </span>
            </h2>

            <p className="text-base text-slate-600 leading-relaxed font-medium">
              للصالونات، العيادات، المغاسل، والمراكز: دع عميلك يحجز خدمته وأخصائيه ووقته المفضل أونلاين بضغطة واحدة من جواله، مع تحصيل عربون مسبق لضمان الجدية.
            </p>

            <ul className="space-y-3 text-sm font-bold text-slate-800">
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span>رابط حجز أنيق بهوية وألوان محلك للمشاركة في إنستغرام وتيك توك</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span>تحديد مواعيد عمل كل موظف وعمولاته بدقة ومنع أي حجز مزدوج</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span>تذكير تلقائي عبر الواتساب يقلل تغيب العملاء وخسارة المواعيد</span>
              </li>
            </ul>

          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 💎 FEATURE 03: 3D MULTI-INDUSTRY WALLET PASSES FAN */}
      {/* ==================================================================== */}
      <section id="loyalty" className="relative z-20 bg-[#FAF9F5] text-slate-900 py-20 px-4 sm:px-6 border-t border-slate-200/80">
        <div className="max-w-6xl mx-auto space-y-12">
          
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl sm:text-5xl font-black text-slate-300 font-mono">03</span>
              <span className="px-3.5 py-1 rounded-full bg-[#CCFF00] text-slate-950 text-xs font-black">
                محفظة الولاء الرقمية
              </span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-slate-950 leading-tight">
              عميلك يرجع لك. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600">
                مرّة بعد مرّة.
              </span>
            </h2>

            <p className="text-base text-slate-600 leading-relaxed font-medium">
              بطاقة بهويتك في Apple Wallet و Google Wallet، بدون تحميل تطبيق، كل زيارة تحفظ ختومها ونقاطها لحالها، ويوصله تنبيه يذكّره بمحلك لما يقرب من فرعك!
            </p>

            <div className="flex items-center justify-center gap-4 sm:gap-8 text-xs sm:text-sm font-bold text-slate-800 flex-wrap pt-2">
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 font-black" />
                <span>أختام أو نقاط بتصميمك</span>
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 font-black" />
                <span>تنبيه على الشاشة المقفلة</span>
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 font-black" />
                <span>تذكير ذكي بالموقع الجغرافي</span>
              </span>
            </div>
          </div>

          {/* 3D Realistic Fan of Cards (Across Industries) */}
          <div className="pt-8 pb-12 overflow-x-auto sm:overflow-visible">
            <div className="relative min-w-[700px] sm:min-w-0 max-w-4xl mx-auto h-[380px] flex items-center justify-center">
              
              {/* Card 1: Platinum Lounge (Far Left) */}
              <div className="absolute transform -rotate-12 -translate-x-56 translate-y-6 w-60 h-80 rounded-3xl p-5 bg-gradient-to-br from-stone-900 to-black text-white border border-white/20 shadow-2xl transition hover:-translate-y-2 hover:rotate-0 hover:z-30 cursor-pointer">
                <div className="flex justify-between items-center text-xs pb-3 border-b border-white/10">
                  <span className="font-bold">Luxe Salon</span>
                  <span className="text-amber-400 font-bold">VIP Platinum</span>
                </div>
                <div className="py-6 text-center space-y-1">
                  <span className="text-[10px] text-slate-400">رصيد النقاط الحصري</span>
                  <p className="text-2xl font-black text-amber-300 font-mono">1,440</p>
                  <p className="text-[10px] text-slate-400">مكافأة: جلسة عناية مجانية</p>
                </div>
                <div className="pt-6 border-t border-white/10 flex justify-between items-center">
                  <QrCode className="w-8 h-8 text-white" />
                  <span className="text-[10px] font-mono text-slate-400">#NO-9842</span>
                </div>
              </div>

              {/* Card 2: Green Specialty Cafe (Left) */}
              <div className="absolute transform -rotate-6 -translate-x-28 translate-y-2 w-60 h-80 rounded-3xl p-5 bg-gradient-to-br from-[#122A1E] to-[#0A1811] text-white border border-emerald-500/30 shadow-2xl transition hover:-translate-y-2 hover:rotate-0 hover:z-30 cursor-pointer">
                <div className="flex justify-between items-center text-xs pb-3 border-b border-white/10">
                  <span className="font-bold">مقهى الأصالة</span>
                  <span className="text-emerald-400 font-bold">ختوم 4/6</span>
                </div>
                <div className="py-6 text-center space-y-2">
                  <span className="text-[10px] text-slate-300">كرت الأختام الرقمي</span>
                  <div className="grid grid-cols-3 gap-2 px-2">
                    {['☕', '☕', '☕', '☕', '⭕', '🎁'].map((item, i) => (
                      <span key={i} className="h-8 rounded-lg bg-black/40 flex items-center justify-center text-xs border border-white/10">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                  <QrCode className="w-8 h-8 text-emerald-400" />
                  <span className="text-[10px] font-mono text-slate-400">#CF-5309</span>
                </div>
              </div>

              {/* Card 3: Featured Caramel Cafe Card (Center - Highlighted) */}
              <div className="absolute transform z-20 w-64 h-84 rounded-3xl p-5 bg-gradient-to-br from-[#B7834A] to-[#8C5D2A] text-white border-2 border-amber-300 shadow-2xl transition hover:scale-105 cursor-pointer">
                <div className="flex justify-between items-center text-xs pb-3 border-b border-white/20">
                  <div className="flex items-center gap-1.5">
                    <Coffee className="w-4 h-4 text-white" />
                    <span className="font-black">هبيّة | HBIAH</span>
                  </div>
                  <span className="text-amber-200 text-[10px] font-bold bg-black/20 px-2 py-0.5 rounded-full">
                    ختم 3/5
                  </span>
                </div>
                <div className="py-6 text-center space-y-1">
                  <span className="text-[11px] text-amber-100">صاحب البطاقة: محمد الشمري</span>
                  <p className="text-sm font-black pt-1">متبقي 2 لكوبك المجاني ☕</p>
                  <div className="pt-2 flex justify-center gap-1.5">
                    <span className="w-8 h-8 rounded-xl bg-black/30 flex items-center justify-center text-sm">☕</span>
                    <span className="w-8 h-8 rounded-xl bg-black/30 flex items-center justify-center text-sm">☕</span>
                    <span className="w-8 h-8 rounded-xl bg-black/30 flex items-center justify-center text-sm">☕</span>
                    <span className="w-8 h-8 rounded-xl border border-dashed border-white/40 flex items-center justify-center text-xs text-amber-200">4</span>
                    <span className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-xs">🎁</span>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/20 flex justify-between items-center">
                  <QrCode className="w-9 h-9 text-white" />
                  <span className="text-[11px] font-mono font-bold">F2A8A3D4</span>
                </div>
              </div>

              {/* Card 4: Red Burger Restaurant Card (Right) */}
              <div className="absolute transform rotate-6 translate-x-28 translate-y-2 w-60 h-80 rounded-3xl p-5 bg-gradient-to-br from-[#9E1B1B] to-[#5C0A0A] text-white border border-rose-500/30 shadow-2xl transition hover:-translate-y-2 hover:rotate-0 hover:z-30 cursor-pointer">
                <div className="flex justify-between items-center text-xs pb-3 border-b border-white/10">
                  <span className="font-bold">BRGR House</span>
                  <span className="text-rose-300 font-bold">كاش باك 10%</span>
                </div>
                <div className="py-6 text-center space-y-1">
                  <span className="text-[10px] text-slate-300">رصيد محفظة المشتريات</span>
                  <p className="text-2xl font-black font-mono">48.50 ر.س</p>
                  <p className="text-[10px] text-rose-200">صالح للاستبدال الفوري</p>
                </div>
                <div className="pt-6 border-t border-white/10 flex justify-between items-center">
                  <QrCode className="w-8 h-8 text-rose-300" />
                  <span className="text-[10px] font-mono text-slate-400">#BG-2903</span>
                </div>
              </div>

              {/* Card 5: Blue Car Wash & Care Card (Far Right) */}
              <div className="absolute transform rotate-12 translate-x-56 translate-y-6 w-60 h-80 rounded-3xl p-5 bg-gradient-to-br from-[#0F3460] to-[#081B33] text-white border border-sky-400/30 shadow-2xl transition hover:-translate-y-2 hover:rotate-0 hover:z-30 cursor-pointer">
                <div className="flex justify-between items-center text-xs pb-3 border-b border-white/10">
                  <span className="font-bold">Spark Wash</span>
                  <span className="text-sky-300 font-bold">كرت 4+1 مجاناً</span>
                </div>
                <div className="py-6 text-center space-y-1">
                  <span className="text-[10px] text-slate-300">رقم اللوحة: أ ب د 104</span>
                  <p className="text-xl font-black text-sky-200">غسيل 3 من 4</p>
                  <p className="text-[10px] text-slate-300">الغسيل القادم مجاناً بالكامل 🚗</p>
                </div>
                <div className="pt-6 border-t border-white/10 flex justify-between items-center">
                  <QrCode className="w-8 h-8 text-sky-300" />
                  <span className="text-[10px] font-mono text-slate-400">#CW-7719</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 🛵 FEATURE 04: ZERO-COMMISSION DIRECT STORE & DRIVERS PORTAL */}
      {/* ==================================================================== */}
      <section className="relative z-20 bg-[#FAF9F5] text-slate-900 py-16 px-4 sm:px-6 border-t border-slate-200/80">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          <div className="lg:col-span-6 space-y-6 text-right">
            
            <div className="flex items-center gap-3">
              <span className="text-4xl sm:text-5xl font-black text-slate-300 font-mono">04</span>
              <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-black">
                المتجر وتطبيق المناديب (0% عمولة)
              </span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-slate-950 leading-tight">
              متجرك بهويتك. <br />
              <span className="underline decoration-emerald-500 decoration-wavy decoration-4">
                بدون عمولات لتطبيقات التوصيل.
              </span>
            </h2>

            <p className="text-base text-slate-600 leading-relaxed font-medium">
              عميلك يطلب منك مباشرة، يدفع بالبطاقة أو Apple Pay، ويتابع طلبه لحظة بلحظة مع تطبيق خاص بمناديب متجرك يوفر عليك 25% من مبيعاتك.
            </p>

            <ul className="space-y-3 text-sm font-bold text-slate-800">
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span><strong>0% عمولة</strong>: كل ريال من الفاتورة يدخل حسابك البنكي مباشرة</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span>بوابة خاصة بمناديب وسائقي متجرك لإسناد الطلبات والتسليم</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center flex-shrink-0 font-black text-xs">✓</span>
                <span>الطلب يوصل شاشة الكاشير والمطبخ فورياً دون أي تأخير</span>
              </li>
            </ul>

          </div>

          <div className="lg:col-span-6">
            <div className="max-w-md mx-auto rounded-3xl p-6 bg-slate-900 text-white shadow-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-white/10">
                <span className="font-bold text-emerald-400">بوابة مناديب المتجر المباشرة</span>
                <span className="text-slate-400 font-mono">0% عمولة وسيط</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold">طلب رقم #1043 • توصيل حي النخيل</span>
                  <span className="text-[#CCFF00] font-mono">38.00 ر.س</span>
                </div>
                <p className="text-[11px] text-slate-400">العميل: فهد السديري • مدفوع إلكترونياً</p>
                <div className="pt-2 flex items-center justify-between text-[11px] text-slate-300">
                  <span>الكابتن: سالم الزهراني</span>
                  <span className="text-emerald-400 font-bold">في الطريق للعميل 🛵</span>
                </div>
              </div>
              <p className="text-[10px] text-center text-slate-400">
                💰 وفّرت في هذا الطلب 9.50 ر.س كانت ستذهب كعمولة لتطبيقات التوصيل!
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ==================================================================== */}
      {/* 🏷️ PRICING TIERS SECTION (من الأساس إلى الصرح - تصميم ركين الأنيق) */}
      {/* ==================================================================== */}
      <section id="pricing" className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 py-24 space-y-12" dir="rtl">
        
        {/* Section Header */}
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tight">
            من الأساس.. إلى الصرح.
          </h2>
          <p className="text-sm sm:text-base text-slate-400 font-medium leading-relaxed">
            أول 30 يوماً مجاناً بكل المزايا: ما تدفع ولا ريال، ولا توقّع أي عقد.
          </p>

          {/* Monthly / Annual Period Switch */}
          <div className="pt-3 flex items-center justify-center">
            <div className="p-1 rounded-full bg-slate-900/90 border border-slate-800 flex items-center text-xs font-bold shadow-2xl backdrop-blur-md">
              <button
                type="button"
                onClick={() => setBillingPeriod('MONTHLY')}
                className={`px-6 py-2.5 rounded-full transition-all duration-200 ${
                  billingPeriod === 'MONTHLY'
                    ? 'bg-slate-800 text-white font-black shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                شهري
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod('ANNUAL')}
                className={`px-6 py-2.5 rounded-full transition-all duration-200 flex items-center gap-2 ${
                  billingPeriod === 'ANNUAL'
                    ? 'bg-[#CCFF00] text-slate-950 font-black shadow-lg shadow-[#CCFF00]/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>سنوي</span>
                <span className="text-[10px] bg-slate-950 text-[#CCFF00] px-2 py-0.5 rounded-full font-black">
                  شهرين مجاناً
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 3 Pricing Cards (Dynamic per-tenant via get_public_billing_plans) */}
        {(() => {
          const fallbackPlans: BillingPlan[] = [
            {
              id: 'plan_basic_fb',
              code: 'BASIC',
              name: 'أساس',
              description: 'تبيع، وتطبع، وتقفّل يومك',
              amount: 99,
              monthly_amount: 99,
              yearly_amount: 990,
              extra_branch_price: 49,
              extra_branch_yearly_price: 490,
              tier_level: 1,
              badge_text: null,
              cumulative_note: null,
              currency: 'ر.س',
              duration_months: 1,
              billing_interval: 'MONTHLY',
              trial_days: 14,
              features_list: [
                'الكاشير',
                'الفاتورة الضريبية',
                'العمل بدون إنترنت',
                'إغلاق الوردية',
                'المنيو',
                'الطلبات والاسترجاع',
                'التقرير اليومي',
                'الموظفين'
              ],
              active: true
            },
            {
              id: 'plan_advanced_fb',
              code: 'ADVANCED',
              name: 'عماد',
              description: 'تعرف وش تكسب، والعميل يرجع لك',
              amount: 179,
              monthly_amount: 179,
              yearly_amount: 1790,
              extra_branch_price: 89,
              extra_branch_yearly_price: 890,
              tier_level: 2,
              badge_text: 'الأكثر طلباً',
              cumulative_note: 'كل اللي في أساس، وفوقها:',
              currency: 'ر.س',
              duration_months: 1,
              billing_interval: 'MONTHLY',
              trial_days: 14,
              features_list: [
                'شاشة المطبخ وطباعته',
                'شاشة العميل',
                'المخزون والوصفات والتنبيهات',
                'قراءة فواتير الموردين بالتصوير',
                'تكلفة الأطباق وصافي الربح',
                'برنامج الولاء وبطاقة الجوال',
                'الطاولات والحجوزات',
                'تطبيقات التوصيل',
                'صلاحيات الموظفين',
                'التقارير الكاملة وExcel'
              ],
              active: true
            },
            {
              id: 'plan_pro_fb',
              code: 'PRO',
              name: 'صرح',
              description: 'يطلبون منك مباشرة، وتكبر لأكثر من فرع',
              amount: 279,
              monthly_amount: 279,
              yearly_amount: 2790,
              extra_branch_price: 139,
              extra_branch_yearly_price: 1390,
              tier_level: 3,
              badge_text: 'الأشمل',
              cumulative_note: 'كل اللي في عماد، وفوقها:',
              currency: 'ر.س',
              duration_months: 1,
              billing_interval: 'MONTHLY',
              trial_days: 14,
              features_list: [
                'متجر إلكتروني بدون عمولة',
                'صفحة حجز المواعيد',
                'تعدد الفروع وتقارير لكل فرع',
                'دعم أولوية'
              ],
              active: true
            }
          ];

          const sourcePlans = dynamicPlans && dynamicPlans.length >= 3 ? dynamicPlans : fallbackPlans;
          const basicPlan = sourcePlans.find(p => (p.tier_level ?? 0) === 1 || p.code === 'BASIC') || sourcePlans[0] || fallbackPlans[0];
          const imadPlan = sourcePlans.find(p => (p.tier_level ?? 0) === 2 || p.code === 'ADVANCED') || sourcePlans[1] || fallbackPlans[1];
          const sarhPlan = sourcePlans.find(p => (p.tier_level ?? 0) === 3 || p.code === 'PRO') || sourcePlans[2] || fallbackPlans[2];

          // Helpers
          const cleanName = (name: string | undefined | null, fallback: string) => {
            if (!name) return fallback;
            const m = name.match(/\(([^)]+)\)/);
            if (m && m[1]) return m[1].trim();
            if (name.includes('الأساسية') || name.includes('أساس') || name.toUpperCase().includes('BASIC')) return 'أساس';
            if (name.includes('النمو') || name.includes('عماد') || name.includes('المتقدمة') || name.toUpperCase().includes('ADVANCED')) return 'عماد';
            if (name.includes('الاحترافية') || name.includes('صرح') || name.toUpperCase().includes('PRO')) return 'صرح';
            return name.trim();
          };

          const cleanDesc = (desc: string | undefined | null, fallback: string) => {
            if (!desc) return fallback;
            return desc.split(' - ')[0].trim() || fallback;
          };

          // Basic calculations
          const basicMonthly = Number(basicPlan.monthly_amount) || Number(basicPlan.amount) || 99;
          const basicYearly = Number(basicPlan.yearly_amount) || (basicMonthly * 10);
          const basicBranch = Number(basicPlan.extra_branch_price) || 49;
          const basicSavings = Math.max(0, (basicMonthly * 12) - basicYearly);
          const basicFeats = (basicPlan.features_list && basicPlan.features_list.length > 0)
            ? basicPlan.features_list
            : (basicPlan.features || fallbackPlans[0].features_list || []);

          // Imad calculations
          const imadMonthly = Number(imadPlan.monthly_amount) || Number(imadPlan.amount) || 179;
          const imadYearly = Number(imadPlan.yearly_amount) || (imadMonthly * 10);
          const imadBranch = Number(imadPlan.extra_branch_price) || 89;
          const imadSavings = Math.max(0, (imadMonthly * 12) - imadYearly);
          const imadFeats = (imadPlan.features_list && imadPlan.features_list.length > 0)
            ? imadPlan.features_list
            : (imadPlan.features || fallbackPlans[1].features_list || []);

          // Sarh calculations
          const sarhMonthly = Number(sarhPlan.monthly_amount) || Number(sarhPlan.amount) || 279;
          const sarhYearly = Number(sarhPlan.yearly_amount) || (sarhMonthly * 10);
          const sarhBranch = Number(sarhPlan.extra_branch_price) || 139;
          const sarhSavings = Math.max(0, (sarhMonthly * 12) - sarhYearly);
          const sarhFeats = (sarhPlan.features_list && sarhPlan.features_list.length > 0)
            ? sarhPlan.features_list
            : (sarhPlan.features || fallbackPlans[2].features_list || []);

          // Cumulative chips for Sarh box (all Imad + Basic features)
          const allImadChips = [...basicFeats, ...imadFeats];

          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-stretch pt-6">

              {/* ============================================================== */}
              {/* 🏛️ CARD 3: صرح (Leftmost column in RTL) */}
              {/* ============================================================== */}
              <div className="flex flex-col">
                {/* Decorative Temple Outline (Architecture line-art) */}
                <svg className="w-20 h-14 mx-auto opacity-40 stroke-current text-purple-300 mb-3 hidden lg:block" viewBox="0 0 80 56" fill="none" strokeWidth="1.5">
                  <path d="M40 4L12 18h56L40 4z" />
                  <circle cx="40" cy="11" r="2" />
                  <path d="M16 18v28M28 18v28M40 18v28M52 18v28M64 18v28" />
                  <path d="M10 46h60M6 52h68" />
                </svg>

                <div className="rounded-[36px] bg-[#121028] text-white p-7 sm:p-9 shadow-2xl border border-purple-500/30 flex flex-col justify-between flex-1 hover:border-purple-500/50 transition-all duration-300">
                  <div>
                    {/* Top Badges Row (No overlap - clean separated metadata row) */}
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full bg-white/10 text-purple-200 text-xs font-black shrink-0">
                        {allImadChips.length + sarhFeats.length} ميزة
                      </span>
                      <span className="px-3.5 py-1 rounded-full bg-indigo-600 text-white text-xs font-black shadow-md flex items-center gap-1.5 border border-indigo-400/30">
                        <span>{sarhPlan.badge_text ? sarhPlan.badge_text.replace(/[👑⭐]/g, '').trim() : 'الأشمل'}</span>
                        <span>👑</span>
                      </span>
                    </div>

                    {/* Title & Subtitle */}
                    <div className="mt-4">
                      <h3 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                        {cleanName(sarhPlan.name, 'صرح')}
                      </h3>
                      <p className="text-xs text-slate-300 font-medium mt-1.5 leading-relaxed">
                        {cleanDesc(sarhPlan.description, 'يطلبون منك مباشرة، وتكبر لأكثر من فرع')}
                      </p>
                    </div>

                    {/* Price Block */}
                    <div className="mt-7 mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-white">
                          {(billingPeriod === 'ANNUAL' ? sarhYearly : sarhMonthly).toLocaleString()}
                        </span>
                        <div className="text-xs font-bold text-slate-300 leading-tight">
                          <span className="block font-sans text-sm text-white font-black">﷼</span>
                          <span>{billingPeriod === 'ANNUAL' ? 'سنوياً' : 'شهرياً'}</span>
                        </div>
                      </div>

                      {billingPeriod === 'ANNUAL' && (
                        <div className="mt-2.5">
                          <span className="inline-block px-3 py-1 rounded-full bg-[#CCFF00] text-slate-950 text-xs font-black shadow-sm">
                            وفّر {sarhSavings > 0 ? sarhSavings.toLocaleString() : (sarhMonthly * 2).toLocaleString()} بالسنة
                          </span>
                        </div>
                      )}

                      <p className="text-xs text-slate-300 font-medium mt-2">
                        فرعين مشمولة + {billingPeriod === 'ANNUAL' ? (sarhBranch * 10).toLocaleString() : sarhBranch.toLocaleString()} لكل فرع زيادة
                      </p>
                    </div>

                    {/* CTA Button (Directly under Price!) */}
                    <button
                      type="button"
                      onClick={scrollToForm}
                      className="w-full py-3.5 rounded-full bg-white hover:bg-slate-100 text-slate-950 font-black text-sm transition-all duration-200 shadow-xl hover:shadow-2xl active:scale-[0.98]"
                    >
                      ابدأ مجاناً
                    </button>

                    {/* Features List */}
                    <div className="mt-8 pt-6 border-t border-white/10 space-y-3.5">
                      <span className="text-xs font-black text-purple-300 block">
                        {sarhPlan.cumulative_note || 'كل اللي في عماد، وفوقها:'}
                      </span>
                      <ul className="space-y-3 text-xs text-slate-200 font-bold">
                        {sarhFeats.map((f, i) => (
                          <li key={i} className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-black flex items-center justify-center shrink-0">
                              ✓
                            </span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Cumulative Tags Box (Exact Rakeen Feature) */}
                      <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2.5 mt-5">
                        <span className="text-[11px] font-bold text-slate-400 block">
                          ومعها كل مزايا عماد ({allImadChips.length} ميزة):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {allImadChips.map((chip, cIdx) => (
                            <span
                              key={cIdx}
                              className="px-2 py-0.5 rounded-lg bg-white/[0.07] border border-white/5 text-[10px] text-slate-300 font-medium"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-8 pt-4 text-center border-t border-white/10">
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-slate-400 hover:text-white transition"
                    >
                      عندك سؤال؟ كلّمنا
                    </a>
                  </div>
                </div>
              </div>


              {/* ============================================================== */}
              {/* ⚡ CARD 2: عماد (Hero Column in RTL - Middle) */}
              {/* ============================================================== */}
              <div className="flex flex-col">
                {/* Decorative Pillar Outline (Architecture line-art) */}
                <svg className="w-16 h-12 mx-auto opacity-50 stroke-current text-[#CCFF00] mb-3 hidden lg:block" viewBox="0 0 64 48" fill="none" strokeWidth="1.5">
                  <path d="M16 8h32M20 8v32M44 8v32M14 40h36M26 8v32M38 8v32M12 44h40" />
                  <path d="M18 12c4 2 24 2 28 0M18 36c4-2 24-2 28 0" strokeDasharray="2 2" />
                </svg>

                <div className="rounded-[36px] bg-[#CCFF00] text-slate-950 p-7 sm:p-9 shadow-2xl flex flex-col justify-between flex-1 border-2 border-[#CCFF00] relative lg:-translate-y-4">
                  <div>
                    {/* Top Badges Row (No overlap - clean separated metadata row) */}
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full bg-slate-950/10 text-slate-950 text-xs font-black shrink-0">
                        {basicFeats.length + imadFeats.length} ميزة
                      </span>
                      <span className="px-3.5 py-1 rounded-full bg-slate-950 text-[#CCFF00] text-xs font-black shadow-md flex items-center gap-1.5 border border-slate-900">
                        <span>{imadPlan.badge_text ? imadPlan.badge_text.replace(/[👑⭐]/g, '').trim() : 'الأكثر طلباً'}</span>
                        <span>⭐</span>
                      </span>
                    </div>

                    {/* Title & Subtitle */}
                    <div className="mt-4">
                      <h3 className="text-4xl sm:text-5xl font-black text-slate-950 tracking-tight">
                        {cleanName(imadPlan.name, 'عماد')}
                      </h3>
                      <p className="text-xs text-slate-900 font-bold mt-1.5 leading-relaxed">
                        {cleanDesc(imadPlan.description, 'تعرف وش تكسب، والعميل يرجع لك')}
                      </p>
                    </div>

                    {/* Price Block */}
                    <div className="mt-7 mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-slate-950">
                          {(billingPeriod === 'ANNUAL' ? imadYearly : imadMonthly).toLocaleString()}
                        </span>
                        <div className="text-xs font-black text-slate-800 leading-tight">
                          <span className="block font-sans text-sm text-slate-950 font-black">﷼</span>
                          <span>{billingPeriod === 'ANNUAL' ? 'سنوياً' : 'شهرياً'}</span>
                        </div>
                      </div>

                      {billingPeriod === 'ANNUAL' && (
                        <div className="mt-2.5">
                          <span className="inline-block px-3 py-1 rounded-full bg-slate-950 text-white text-xs font-black shadow-sm">
                            وفّر {imadSavings > 0 ? imadSavings.toLocaleString() : (imadMonthly * 2).toLocaleString()} بالسنة
                          </span>
                        </div>
                      )}

                      <p className="text-xs text-slate-800 font-bold mt-2">
                        فرع واحد + {billingPeriod === 'ANNUAL' ? (imadBranch * 10).toLocaleString() : imadBranch.toLocaleString()} لكل فرع زيادة
                      </p>
                    </div>

                    {/* CTA Button (Directly under Price!) */}
                    <button
                      type="button"
                      onClick={scrollToForm}
                      className="w-full py-3.5 rounded-full bg-slate-950 hover:bg-slate-900 text-[#CCFF00] font-black text-sm transition-all duration-200 shadow-xl hover:shadow-2xl active:scale-[0.98]"
                    >
                      ابدأ مجاناً
                    </button>

                    {/* Features List */}
                    <div className="mt-8 pt-6 border-t border-slate-950/20 space-y-3">
                      <span className="text-xs font-black text-slate-950 block">
                        {imadPlan.cumulative_note || 'كل اللي في أساس، وفوقها:'}
                      </span>
                      <ul className="space-y-3 text-xs text-slate-950 font-black">
                        {imadFeats.map((f, i) => (
                          <li key={i} className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-slate-950 text-[#CCFF00] text-[10px] font-black flex items-center justify-center shrink-0">
                              ✓
                            </span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-8 pt-4 text-center border-t border-slate-950/15">
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-black text-slate-800 hover:text-slate-950 transition"
                    >
                      عندك سؤال؟ كلّمنا
                    </a>
                  </div>
                </div>
              </div>


              {/* ============================================================== */}
              {/* 🏢 CARD 1: أساس (Rightmost column in RTL) */}
              {/* ============================================================== */}
              <div className="flex flex-col">
                {/* Decorative Foundation Outline (Architecture line-art) */}
                <svg className="w-20 h-10 mx-auto opacity-40 stroke-current text-white mb-3 hidden lg:block" viewBox="0 0 80 40" fill="none" strokeWidth="1.5">
                  <path d="M10 28h60M15 28V14h50v14M10 14h60M25 14V6h30v8" />
                  <line x1="20" y1="20" x2="20" y2="28" />
                  <line x1="30" y1="20" x2="30" y2="28" />
                  <line x1="40" y1="20" x2="40" y2="28" />
                  <line x1="50" y1="20" x2="50" y2="28" />
                  <line x1="60" y1="20" x2="60" y2="28" />
                </svg>

                <div className="rounded-[36px] bg-white text-slate-950 p-7 sm:p-9 shadow-2xl flex flex-col justify-between flex-1 border border-slate-200/90 hover:border-slate-300 transition-all duration-300">
                  <div>
                    {/* Top Badges Row */}
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-black shrink-0">
                        {basicFeats.length} مزايا
                      </span>
                      <span className="text-transparent select-none">-</span>
                    </div>

                    {/* Title & Subtitle */}
                    <div className="mt-4">
                      <h3 className="text-4xl sm:text-5xl font-black text-slate-950 tracking-tight">
                        {cleanName(basicPlan.name, 'أساس')}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-1.5 leading-relaxed">
                        {cleanDesc(basicPlan.description, 'تبيع، وتطبع، وتقفّل يومك')}
                      </p>
                    </div>

                    {/* Price Block */}
                    <div className="mt-7 mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-slate-950">
                          {(billingPeriod === 'ANNUAL' ? basicYearly : basicMonthly).toLocaleString()}
                        </span>
                        <div className="text-xs font-bold text-slate-500 leading-tight">
                          <span className="block font-sans text-sm text-slate-900 font-black">﷼</span>
                          <span>{billingPeriod === 'ANNUAL' ? 'سنوياً' : 'شهرياً'}</span>
                        </div>
                      </div>

                      {billingPeriod === 'ANNUAL' && (
                        <div className="mt-2.5">
                          <span className="inline-block px-3 py-1 rounded-full bg-[#CCFF00] text-slate-950 text-xs font-black shadow-sm">
                            وفّر {basicSavings > 0 ? basicSavings.toLocaleString() : (basicMonthly * 2).toLocaleString()} بالسنة
                          </span>
                        </div>
                      )}

                      <p className="text-xs text-slate-500 font-medium mt-2">
                        فرع واحد + {billingPeriod === 'ANNUAL' ? (basicBranch * 10).toLocaleString() : basicBranch.toLocaleString()} لكل فرع زيادة
                      </p>
                    </div>

                    {/* CTA Button (Directly under Price!) */}
                    <button
                      type="button"
                      onClick={scrollToForm}
                      className="w-full py-3.5 rounded-full border-2 border-slate-950 text-slate-950 hover:bg-slate-950 hover:text-white font-black text-sm transition-all duration-200 shadow-sm active:scale-[0.98]"
                    >
                      ابدأ مجاناً
                    </button>

                    {/* Features List */}
                    <div className="mt-8 pt-6 border-t border-slate-200/80 space-y-3">
                      <ul className="space-y-3 text-xs text-slate-700 font-bold">
                        {basicFeats.map((f, i) => (
                          <li key={i} className="flex items-center gap-2.5">
                            <span className="text-slate-400 font-black text-sm">✓</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-8 pt-4 text-center border-t border-slate-100">
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-slate-500 hover:text-slate-900 transition"
                    >
                      عندك سؤال؟ كلّمنا
                    </a>
                  </div>
                </div>
              </div>

            </div>
          );
        })()}

      </section>

      {/* ==================================================================== */}
      {/* 🚀 REGISTRATION ONBOARDING FORM */}
      {/* ==================================================================== */}
      <section ref={formRef} className="relative z-20 max-w-xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-3xl p-6 sm:p-10 bg-[#0E1620] border-2 border-[#CCFF00]/40 shadow-2xl space-y-6">
          
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-full p-1 bg-gradient-to-tr from-[#CCFF00] via-[#10E588] to-emerald-400 mx-auto shadow-xl flex items-center justify-center overflow-hidden">
              {tenant.logoUrl ? (
                <img
                  src={tenant.logoUrl}
                  alt={tenant.brandName}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="w-full h-full bg-[#0A0F15] text-[#CCFF00] rounded-full flex items-center justify-center font-black text-lg">
                  {tenant.brandName.slice(0, 2)}
                </span>
              )}
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-white pt-1">
              خلنا نجهّز لك منظومة {tenant.brandName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              سجّل بيانات نشاطك وسيقوم مستشارنا بالتواصل معك لتسليمك حسابك وكاشيرك وبطاقتك فوراً.
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
              
              {/* Field 1: Owner Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-[#CCFF00]" />
                  <span>الاسم الكريم *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="مثال: صالح القحطاني"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  className="w-full bg-[#070B0F] border border-white/10 focus:border-[#CCFF00] rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none transition disabled:opacity-50"
                />
              </div>

              {/* Field 2: Store Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-[#CCFF00]" />
                  <span>اسم النشاط أو المحل *</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="مثال: لارين كافيه، صالون النخبة، مغسلة سبارك"
                  value={form.store_name}
                  onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                  className="w-full bg-[#070B0F] border border-white/10 focus:border-[#CCFF00] rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none transition disabled:opacity-50"
                />
              </div>

              {/* Field 3: Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-[#CCFF00]" />
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
                  className="w-full bg-[#070B0F] border border-white/10 focus:border-[#CCFF00] rounded-2xl px-4 py-3.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition text-right disabled:opacity-50"
                />
              </div>

              {/* Field 4: Sector & City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-[#CCFF00]" />
                    <span>نوع النشاط</span>
                  </label>
                  <select
                    value={form.business_type}
                    onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                    className="w-full bg-[#070B0F] border border-white/10 focus:border-[#CCFF00] rounded-2xl px-3 py-3 text-xs text-white outline-none transition"
                  >
                    <option value="كافيه أو مخبز (Cafe & Bakery)">كافيه أو مخبز (Cafe & Bakery)</option>
                    <option value="صالون أو مركز عناية وتجميل (Salon & Spa)">صالون أو مركز عناية وتجميل (Salon & Spa)</option>
                    <option value="مغسلة أو تلميع سيارات (Car Wash & Auto)">مغسلة أو تلميع سيارات (Car Wash & Auto)</option>
                    <option value="عيادة أو مركز صحي (Clinic & Wellness)">عيادة أو مركز صحي (Clinic & Wellness)</option>
                    <option value="مطعم أو برجر أو سحابي (Restaurant / Cloud)">مطعم أو برجر أو سحابي (Restaurant / Cloud)</option>
                    <option value="متجر تجزئة أو عطور أو أزياء (Retail & Boutiques)">متجر تجزئة أو عطور أو أزياء (Retail)</option>
                    <option value="نشاط تجاري آخر (Other)">نشاط تجاري آخر (Other)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#CCFF00]" />
                    <span>المدينة</span>
                  </label>
                  <select
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full bg-[#070B0F] border border-white/10 focus:border-[#CCFF00] rounded-2xl px-3 py-3 text-xs text-white outline-none transition"
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
                className="w-full py-4 rounded-2xl bg-[#CCFF00] hover:bg-[#b8e600] text-slate-950 font-black text-base shadow-xl shadow-[#CCFF00]/25 transition transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التجهيز...</span>
                  </>
                ) : (
                  <span>اطلب تفعيل حسابك مجاناً الآن 🚀</span>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>بياناتك محمية ومشفرة، والتفعيل فوري بنفس اليوم.</span>
              </div>
            </form>
          )}

          {pageState === 'SUCCESS' && (
            <div className="text-center py-6 space-y-4 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
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
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs transition"
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
          <span className="px-3 py-1 rounded-full bg-[#CCFF00] text-slate-950 text-xs font-black">
            الأسئلة الشائعة
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            قبل ما تبدأ.
          </h2>
        </div>

        <div className="space-y-3">
          {[
            {
              q: 'وش أحتاج عشان أبدأ البيع وتشغيل النظام؟',
              a: 'جهاز آيباد، تابلت، أو لابتوب، مع طابعة فواتير بلوتوث أو شبكية، لتسجيل العمليات التجارية والطباعة الفورية. المنظومة سحابية ولا تتطلب أي أجهزة معقدة.',
            },
            {
              q: 'هل النظام يناسب الصالونات، المغاسل، والعيادات بجانب المقاهي؟',
              a: 'نعم 100%! المنظومة صُممت كمنظومة تشغيل متكاملة تحتوي على نظام حجوزات ومواعيد ذكي للصالونات والعيادات، كروت غسيل للسيارات، ونظام أختام ونقاط للكافيهات والمطاعم.',
            },
            {
              q: 'لو انقطع الإنترنت في المحل؟',
              a: 'الكاشير يستمر بالعمل والبيع وإصدار الفواتير وطباعتها بدون توقف (Offline-First)، وبمجرد عودة الاتصال تتم مزامنة كافة العمليات تلقائياً في الخلفية.',
            },
            {
              q: 'كيف تنزل بطاقة الولاء للعميل بدون ما يحمل تطبيق؟',
              a: 'العميل يفتح كاميرا جواله ويمسح رمز QR عند الكاشير أو الطاولة، وتنزل البطاقة مباشرة في محفظة Apple Wallet أو Google Wallet في أقل من ثانيتين!',
            },
            {
              q: 'هل المنظومة معتمدة من هيئة الزكاة والضريبة والجمارك (ZATCA)؟',
              a: 'نعم بالكامل، تصدر المنظومة فواتير إلكترونية مبسطة معتمدة تتضمن رمز الاستجابة السريع المشفر (ZATCA QR) وكافة الحقول الإلزامية.',
            },
          ].map((faq, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-[#0E1620] border border-white/10 overflow-hidden transition"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full p-4 sm:p-5 text-right font-bold text-sm text-white flex items-center justify-between gap-4"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#CCFF00] transition-transform ${
                    openFaq === idx ? 'transform rotate-180' : ''
                  }`}
                />
              </button>
              {openFaq === idx && (
                <div className="px-4 sm:px-5 pb-5 text-xs text-slate-300 leading-relaxed border-t border-white/5 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 🏁 FINAL CTA BANNER */}
      {/* ==================================================================== */}
      <section className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-3xl p-8 sm:p-12 bg-gradient-to-br from-[#121B24] via-[#0E1620] to-[#0A0F15] border border-[#CCFF00]/40 text-center space-y-4 shadow-2xl">
          <span className="px-3 py-1 rounded-full bg-[#CCFF00] text-slate-950 text-xs font-black">
            ابدأ اليوم قبل بكرة
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-white">
            مشروعك يستاهل نظام يشتغل عنه.
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            لا تقعد تضيع وقتك بين برامج متفرقة وتدفع عمولات لتطبيقات التوصيل. ابدأ تجربة {tenant.brandName} مجاناً الآن.
          </p>
          <div className="pt-2 flex justify-center">
            <button
              onClick={scrollToForm}
              className="px-8 py-4 rounded-full bg-[#CCFF00] hover:bg-[#b8e600] text-slate-950 font-black text-sm shadow-xl shadow-[#CCFF00]/20 transition transform active:scale-95"
            >
              اطلب تفعيل حسابك مجاناً 🚀
            </button>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 📜 DYNAMIC WHITE-LABEL FOOTER */}
      {/* ==================================================================== */}
      <footer className="relative z-20 border-t border-white/10 py-10 text-center text-xs text-slate-500 space-y-4">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">{tenant.brandName}</span>
            <span>•</span>
            <span>{tenant.tagline}</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <a href="#pos" className="hover:text-white transition">الكاشير</a>
            <a href="#bookings" className="hover:text-white transition">الحجوزات</a>
            <a href="#loyalty" className="hover:text-white transition">محفظة الولاء</a>
            <a href="#pricing" className="hover:text-white transition">الباقات</a>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition">واتساب المبيعات</a>
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

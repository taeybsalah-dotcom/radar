import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PartnerAccount,
  PartnerCommission,
  PartnerBonusMilestone,
  SalesKitMessage,
  MerchantLead,
} from '../types';
import { LoyaltyService, getSupabaseClient } from '../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShieldCheck,
  Sparkles,
  Link as LinkIcon,
  QrCode,
  Share2,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
  Users,
  Target,
  DollarSign,
  Gift,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building,
  ArrowUpRight,
  Download,
  Lock,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Phone,
  KeyRound,
} from 'lucide-react';

interface PartnerDashboardProps {
  onBackToApp?: () => void;
}

const buildDefaultSalesKit = (pName: string, pSlug: string, pRef: string): SalesKitMessage[] => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://radar.sa';
  const publicLink = `${origin}/${pSlug}`;
  return [
    {
      id: 'msg-cashier',
      title: 'رسالة الكاشير والعميل العائد 🏪',
      tag: 'CASHIER_LOST',
      headline: 'كم عميل يجيك مرة ويختفي؟',
      body: `كم عميل يجيك مرة ويختفي؟ 🤔\n\nأغلب المحلات تركز على جلب زبون جديد وتنسى الزبون اللي اشترى وراح.\nمع منصة RADAR للولاء الذكي، تقدر تجمع بيانات عملائك وتخليهم يرجعون لك بدون ما تدفع مبالغ ضخمة على الإعلانات.\n\nجرّب بنفسك وشوف كيف يشتغل لمتجرك:\n${publicLink}\n\nأخوك: ${pName}`,
    },
    {
      id: 'msg-app',
      title: 'رسالة التطبيق والهوية الخاصة 📱',
      tag: 'BRAND_EXPERIENCE',
      headline: 'تخيل عميلك يفتح تجربة باسم محلك بدون ما تبني تطبيق من الصفر',
      body: `تخيل عميلك يفتح تجربة وبطاقة ولاء باسم وشعار محلك في ثواني بدون ما تدفع عشرات الآلاف لبناء تطبيق من الصفر! 🚀\n\nنظام RADAR يعطيك PWA فورية لكاشيرك وعملائك برابط وهوية خاصة.\n\nاطلع على التفاصيل وابدأ هنا:\n${publicLink}\n\nتحياتي، ${pName}`,
    },
    {
      id: 'msg-loyalty',
      title: 'رسالة قيمة الولاء والخصم 💎',
      tag: 'VALUE_VS_DISCOUNT',
      headline: 'مو كل عميل يحتاج خصم... بعضهم يحتاج سبب يرجع',
      body: `مو كل عميل يحتاج خصم... بعضهم يحتاج سبب يرجع! ✨\n\nالخصومات تحرق هامش ربحك، لكن نظام النقاط والمستويات (Tiers) يخلي العميل يرتبط بمحلك ويتحمس يجمع نقاط ويكرر زيارته.\n\nشوف النظام وشلون يفيد نشاطك:\n${publicLink}\n\n${pName} — رادار لخدمات التجار`,
    },
    {
      id: 'msg-lost-customers',
      title: 'رسالة استعادة العملاء المنقطعين ⏰',
      tag: 'RETENTION',
      headline: 'عندك عملاء ما شفتهم من شهر؟',
      body: `عندك عملاء كانوا يجونك دايماً وفجأة انقطعوا من شهر؟ 📉\n\nنظام رادار ينبهك عليهم ويساعدك ترسل لهم عروض حصرية وترجعهم لك بضغطة زر.\n\nسجل متجرك وجرب التجربة:\n${publicLink}\n\nمستشارك: ${pName}`,
    },
    {
      id: 'msg-positioning',
      title: 'رسالة التموضع الاستراتيجي ⚡',
      tag: 'COMPETITIVE',
      headline: 'الكاشير يعرف كم بعت اليوم. RADAR يساعدك تعرف مين تبغى يرجع بكرة',
      body: `الكاشير يعرف كم بعت اليوم... لكن RADAR يساعدك تعرف مين تبغى يرجع بكرة! 🎯\n\nحوّل كل عملية بيع إلى علاقة مستمرة وزبون وفيّ.\n\nابدأ تجربتك الآن:\n${publicLink}\n\n${pName}`,
    },
  ];
};

const buildDefaultStatusTemplates = (pName: string, pSlug: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://radar.sa';
  const directJoinLink = `${origin}/join`;
  return {
    trial: {
      title: 'متابعة تجربة المتجر (Trial Follow-up)',
      body: `مرحباً بك! 👋\nحبيت أطمئن كيف كانت تجربتك المبدئية مع منصة RADAR؟\nهل جربت إنشاء بطاقة الولاء أو مسح أول باركود كاشير؟ إذا عندك أي استفسار أنا بالخدمة لمساعدتك خطوة بخطوة 🚀\n\n${pName}`,
    },
    pending_payment: {
      title: 'تذكير التفعيل والاعتماد (Payment / Setup Reminder)',
      body: `أهلاً بك عزيزي،\nطلب متجركم معتمد وجاهز للانطلاق على رادار. باقي فقط خطوة الاعتماد النهائي لنفعل لكم الربط الكامل وهوية المتجر الخاصة.\n\nيسعدني مساعدتك لإتمام التفعيل في أي وقت:\n${directJoinLink}\n\n${pName}`,
    },
    no_response: {
      title: 'إعادة فتح التواصل (No Response Check-in)',
      body: `السلام عليكم! عساك بخير.\nأعرف أن جدولك مشغول بإدارة المتجر. فقط أردت التذكير أن نظام رادار جاهز لتشغيل بطاقات ولاء زبائنك لزيادة مبيعات هذا الشهر.\n\nهل يناسبك ننسق اتصال سريع لمدة 3 دقائق؟\n\nأخوك: ${pName}`,
    },
    paid: {
      title: 'تهنئة التأسيس والانطلاق (Welcome Onboard)',
      body: `ألف مبروك انضمامكم لشبكة رادار! 🎉\nتم تأسيس وربط متجركم بنجاح. سنكون معك في كل خطوة لضمان مضاعفة زيارات عملائك ومبيعاتك.\n\nبالتوفيق والنجاح الدائم!\n${pName}`,
    },
    active: {
      title: 'متابعة الأداء الدوري (Active Relationship)',
      body: `مرحباً بك! أتمنى أن تكون نتائج برنامج الولاء ممتازة هذا الأسبوع.\nإذا محتاج أي مساعدة في ضبط عروض جديدة أو حملات استعادة الزبائن، أنا في خدمتك دائماً.\n\n${pName} — رادار`,
    },
  };
};

const buildDefaultLogoPitch = (pName: string, pSlug: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://radar.sa';
  const publicLink = `${origin}/${pSlug}`;
  return {
    title: 'أداة أرسل شعارك (Logo Pitch)',
    headline: 'أرسل لي اسم محلك وشعاره، وأوريك كيف ممكن تكون تجربة RADAR باسم محلك',
    body: `أرسل لي اسم محلك وشعاره 🎨\n\nوأنا بجهّز لك نموذج حي يعرض كيف تظهر تجربة وبطاقة ولاء RADAR بهوية وألوان محلك قبل ما تشترك!\n\nشوف الرابط وجرب:\n${publicLink}\n\n${pName}`,
  };
};

const defaultBonusMilestones: PartnerBonusMilestone[] = [
  { id: 'b-5', milestone: 5, bonus_amount: 500, status: 'LOCKED', current_progress: 0, required_merchants: 5 },
  { id: 'b-10', milestone: 10, bonus_amount: 1500, status: 'LOCKED', current_progress: 0, required_merchants: 10 },
  { id: 'b-20', milestone: 20, bonus_amount: 3500, status: 'LOCKED', current_progress: 0, required_merchants: 20 },
  { id: 'b-50', milestone: 50, bonus_amount: 10000, status: 'LOCKED', current_progress: 0, required_merchants: 50 },
];

export const PartnerDashboard: React.FC<PartnerDashboardProps> = ({ onBackToApp }) => {
  // 1. Auth State
  const [partner, setPartner] = useState<any | null>(() => {
    return LoyaltyService.getPartnerSession();
  });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Login Form State (Phone + PIN)
  const [phoneInput, setPhoneInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // 2. Active Tab State
  const [activeTab, setActiveTab] = useState<
    'overview' | 'leads' | 'sales_kit' | 'qr' | 'targets' | 'commissions'
  >('overview');

  // 3. Stats State
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // 4. Leads State
  const [leads, setLeads] = useState<MerchantLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsStatusFilter, setLeadsStatusFilter] = useState('ALL');
  const [leadsPage, setLeadsPage] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [selectedLead, setSelectedLead] = useState<MerchantLead | null>(null);

  // 5. Assets / Sales Kit State
  const [salesKit, setSalesKit] = useState<SalesKitMessage[]>([]);
  const [statusTemplates, setStatusTemplates] = useState<Record<string, { title: string; body: string }>>({});
  const [logoPitch, setLogoPitch] = useState<{ title: string; headline: string; body: string } | null>(null);

  // 6. Commissions State
  const [commissions, setCommissions] = useState<PartnerCommission[]>([]);
  const [commissionsSummary, setCommissionsSummary] = useState({
    total_pending: 0,
    total_earned: 0,
    total_paid: 0,
  });

  // 7. Bonuses State
  const [bonusMilestones, setBonusMilestones] = useState<PartnerBonusMilestone[]>(defaultBonusMilestones);

  // 8. Copy Feedback State
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const shareText = async (title: string, text: string, url?: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        // Fallback to clipboard
      }
    }
    copyText(`${text}\n${url || ''}`, 'share-fallback');
  };

  const openWhatsApp = (text: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Fetch Stats, Assets, Commissions, Bonuses when authenticated
  useEffect(() => {
    if (!partner) return;

    const partnerName = partner.display_name || 'الشريك المعتمد';
    const partnerSlug = partner.slug || 'partner';
    const refCode = partner.affiliates?.referral_code || partner.referral_code || 'r1001';

    // Set immediate rich defaults
    setSalesKit(buildDefaultSalesKit(partnerName, partnerSlug, refCode));
    setStatusTemplates(buildDefaultStatusTemplates(partnerName, partnerSlug));
    setLogoPitch(buildDefaultLogoPitch(partnerName, partnerSlug));
    setStats({
      target: {
        target_value: partner.target_value || 20,
        achieved_count: 0,
        status_note: 'بانتظار تسجيل أول متجر عبر رابطك',
      },
      financials: {
        earned_commissions: 0,
        bonuses_earned: 0,
        pending_commissions: 0,
      },
      pipeline: {
        total_leads: 0,
      },
    });

    const loadDashboardData = async () => {
      setLoadingStats(true);
      try {
        const tok = sessionStorage.getItem('RADAR_PARTNER_AUTH_TOKEN');
        const headers = tok ? { Authorization: `Bearer ${tok}` } : undefined;

        // Try API if available
        if (headers) {
          const statsRes = await fetch('/api/partner/stats', { headers });
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            if (statsData.success && statsData.stats) setStats(statsData.stats);
          }

          const assetsRes = await fetch('/api/partner/assets', { headers });
          if (assetsRes.ok) {
            const assetsData = await assetsRes.json();
            if (assetsData.success) {
              if (assetsData.sales_kit) setSalesKit(assetsData.sales_kit);
              if (assetsData.status_templates) setStatusTemplates(assetsData.status_templates);
              if (assetsData.logo_pitch) setLogoPitch(assetsData.logo_pitch);
            }
          }

          const commRes = await fetch('/api/partner/commissions', { headers });
          if (commRes.ok) {
            const commData = await commRes.json();
            if (commData.success) {
              setCommissions(commData.commissions || []);
              if (commData.summary) setCommissionsSummary(commData.summary);
            }
          }

          const bonusRes = await fetch('/api/partner/bonuses', { headers });
          if (bonusRes.ok) {
            const bonusData = await bonusRes.json();
            if (bonusData.success && bonusData.milestones) {
              setBonusMilestones(bonusData.milestones);
            }
          }
        }
      } catch (err) {
        console.warn('Using client-side generated partner assets and stats');
      } finally {
        setLoadingStats(false);
      }
    };

    loadDashboardData();
  }, [partner]);

  // Fetch Leads with search & pagination
  const fetchLeads = useCallback(
    async (pageToLoad = leadsPage) => {
      if (!partner) return;
      setLoadingLeads(true);

      try {
        const client = getSupabaseClient();
        const refCode = partner.affiliates?.referral_code || partner.referral_code;
        
        if (client) {
          let query = client.from('merchant_leads').select('*', { count: 'exact' });
          if (refCode) {
            query = query.or(`partner_id.eq.${partner.id},referral_code.eq.${refCode}`);
          } else {
            query = query.eq('partner_id', partner.id);
          }

          if (leadsStatusFilter && leadsStatusFilter !== 'ALL') {
            query = query.eq('status', leadsStatusFilter);
          }
          if (leadsSearch.trim()) {
            query = query.or(`store_name.ilike.%${leadsSearch.trim()}%,manager_name.ilike.%${leadsSearch.trim()}%,phone.ilike.%${leadsSearch.trim()}%`);
          }

          const from = (pageToLoad - 1) * 15;
          const to = from + 14;
          const { data, count, error } = await query.range(from, to).order('created_at', { ascending: false });

          if (!error && data) {
            setLeads(data as MerchantLead[]);
            setTotalLeads(count || data.length);
            setLeadsPage(pageToLoad);
            setLoadingLeads(false);
            return;
          }
        }

        // Fallback: empty array
        setLeads([]);
        setTotalLeads(0);
      } catch (err) {
        console.warn('Error fetching partner leads:', err);
      } finally {
        setLoadingLeads(false);
      }
    },
    [partner, leadsStatusFilter, leadsSearch, leadsPage]
  );

  useEffect(() => {
    if (partner && (activeTab === 'leads' || activeTab === 'overview')) {
      fetchLeads(1);
    }
  }, [partner, activeTab, leadsStatusFilter, fetchLeads]);

  // Handle Login via Phone + PIN
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) {
      setAuthError('يرجى إدخال رقم الجوال');
      return;
    }
    if (!pinInput.trim()) {
      setAuthError('يرجى إدخال الرمز السري (PIN)');
      return;
    }

    setIsLoggingIn(true);
    setAuthError(null);

    try {
      const res = await LoyaltyService.authenticatePartner(phoneInput, pinInput);
      if (!res.success || !res.partner) {
        setAuthError(res.error || 'بيانات الدخول غير صحيحة');
        return;
      }

      setPartner(res.partner);
      setPhoneInput('');
      setPinInput('');
    } catch (err: any) {
      setAuthError(err.message || 'حدث خطأ في تسجيل الدخول');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    LoyaltyService.clearPartnerSession();
    sessionStorage.removeItem('RADAR_PARTNER_AUTH_TOKEN');
    setPartner(null);
    setStats(null);
  };

  // Download QR Code as SVG
  const handleDownloadQR = () => {
    if (!qrRef.current) return;
    const svgElement = qrRef.current.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `radar-partner-qr-${partner?.slug || 'code'}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --------------------------------------------------------------------------
  // UN-AUTHENTICATED STATE (Partner Login Gate)
  // --------------------------------------------------------------------------
  if (loadingProfile) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
        <p className="text-xs text-slate-400 font-medium">جاري التحقق من هوية الشريك...</p>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 animate-fade-in" dir="rtl">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-xl">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto text-2xl font-bold shadow-lg shadow-amber-500/20">
              🤝
            </div>
            <div>
              <h2 className="text-xl font-black text-white">بوابة شركاء المبيعات | Partner Portal</h2>
              <p className="text-xs text-slate-400 mt-1">
                سجل الدخول برقم الجوال والرمز السري الخاص بك لمتابعة عملائك وأدوات البيع والعمولات.
              </p>
            </div>
          </div>

          {authError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-start gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">رقم جوال المسوق / الشريك</label>
              <div className="relative">
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="05XXXXXXXX"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-4 pl-10 py-3 text-xs text-white placeholder-slate-600 outline-none transition text-left"
                />
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">الرمز السري (PIN)</label>
              <div className="relative">
                <input
                  type="password"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="••••"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-4 pl-10 py-3 text-xs text-white placeholder-slate-600 outline-none transition text-left tracking-widest font-mono"
                />
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-[10px] text-slate-500">الرمز السري المحدد لك من قبل إدارة رادار (الافتراضي: 1234)</p>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isLoggingIn ? 'جاري التحقق...' : 'دخول بوابة الشريك'}</span>
            </button>
          </form>

          {onBackToApp && (
            <div className="text-center pt-2">
              <button
                onClick={onBackToApp}
                className="text-xs text-slate-500 hover:text-slate-300 transition"
              >
                العودة للمنصة الرئيسية
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const RESERVED_SLUGS = new Set(['partner', 'join', 'admin', 'customer', 'cashier', 'pos', 'superadmin', 'super-admin', '']);

  let rawCode = partner.affiliates?.referral_code || partner.referral_code || 'r1001';
  if (rawCode.toLowerCase().startsWith('radar-')) {
    rawCode = 'r' + (rawCode.replace(/\D/g, '') || '1001');
  } else if (!rawCode.toLowerCase().startsWith('r')) {
    rawCode = 'r' + (rawCode.replace(/\D/g, '') || '1001');
  }
  const partnerRefCode = rawCode.toLowerCase();

  let safeSlug = (partner.slug || '').toLowerCase().trim().replace(/^\/+|\/+$/g, '');
  if (RESERVED_SLUGS.has(safeSlug) || safeSlug.length < 2) {
    safeSlug = partnerRefCode;
  }

  // Derived Links
  const publicLandingLink = typeof window !== 'undefined'
    ? `${window.location.origin}/${safeSlug}`
    : `https://radar.sa/${safeSlug}`;

  const directJoinLink = typeof window !== 'undefined'
    ? `${window.location.origin}/join?ref=${encodeURIComponent(partnerRefCode)}`
    : `https://radar.sa/join?ref=${encodeURIComponent(partnerRefCode)}`;

  // --------------------------------------------------------------------------
  // AUTHENTICATED PARTNER DASHBOARD
  // --------------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8 space-y-8 animate-fade-in" dir="rtl">
      
      {/* 1. Partner Header & Identity Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-amber-500/30 flex-shrink-0">
            🤝
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-white">{partner.display_name}</h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>شريك معتمد نشط</span>
              </span>
              {partner.region && (
                <span className="text-[11px] text-slate-400 font-mono px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700">
                  📍 {partner.region}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs font-mono">
              <span className="text-slate-400">
                كود الإحالة: <strong className="text-amber-400 font-bold px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">{partnerRefCode}</strong>
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">
                معرف الصفحة: <strong className="text-slate-300">/{safeSlug}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => copyText(directJoinLink, 'header-direct-join')}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-2 rounded-2xl text-xs font-black transition shadow-lg shadow-amber-500/20"
            title="نسخ رابط تسجيل التاجر المباشر"
          >
            {copiedKey === 'header-direct-join' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === 'header-direct-join' ? 'تم نسخ رابط التسجيل!' : 'نسخ رابط تسجيل التاجر'}</span>
          </button>

          <a
            href={publicLandingLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3.5 py-2 rounded-2xl text-xs font-bold transition"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            <span>معاينة صفحتك الترويجية</span>
          </a>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-3.5 py-2 rounded-2xl text-xs font-bold transition"
            title="تسجيل الخروج"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* 2. Top Financial & Pipeline Summary Bar (Section 55) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>التجار المدفوعون</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-black text-white font-mono block">
            {stats?.target?.achieved_count ?? 0}
          </span>
          <span className="text-[10px] text-slate-500 block">من إجمالي {stats?.pipeline?.total_leads ?? 0} عميل مسجل</span>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>العمولات المكتسبة</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-black text-emerald-400 font-mono block">
            {stats?.financials?.earned_commissions ?? 0} <span className="text-xs">ريال</span>
          </span>
          <span className="text-[10px] text-slate-500 block">تم التحقق المالي</span>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>المكافآت المحققة</span>
            <Gift className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-2xl font-black text-purple-400 font-mono block">
            {stats?.financials?.bonuses_earned ?? 0} <span className="text-xs">ريال</span>
          </span>
          <span className="text-[10px] text-slate-500 block">مكافآت التارقت</span>
        </div>

        <div className="bg-slate-900/70 border border-amber-500/20 rounded-3xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-amber-400 font-medium">
            <span>العمولات المعلقة</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-2xl font-black text-amber-400 font-mono block">
            {stats?.financials?.pending_commissions ?? 0} <span className="text-xs">ريال</span>
          </span>
          <span className="text-[10px] text-amber-300/70 block">بانتظار تأكيد الدفع الفعلي</span>
        </div>
      </div>

      {/* 3. Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
        {[
          { id: 'overview', label: 'الرئيسية 🏠', icon: Sparkles },
          { id: 'leads', label: `عملائي (${stats?.pipeline?.total_leads ?? 0}) 👥`, icon: Users },
          { id: 'sales_kit', label: 'أدوات البيع 🧰', icon: MessageSquare },
          { id: 'qr', label: 'الرابط والـ QR 📱', icon: QrCode },
          { id: 'targets', label: 'الأهداف والمكافآت 🎯', icon: Target },
          { id: 'commissions', label: 'العمولات 💰', icon: DollarSign },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* TAB 1: OVERVIEW                                                      */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Target & Progress Card */}
            <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Target className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">هدف مبيعات الشهر الحالي</h3>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {stats?.target?.achieved_count ?? 0} / {stats?.target?.target_value ?? 20} تاجر
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="w-full bg-slate-950 rounded-full h-3.5 border border-slate-800 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          2,
                          ((stats?.target?.achieved_count ?? 0) /
                            (stats?.target?.target_value || 20)) *
                            100
                        )
                      )}%`,
                    }}
                  ></div>
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>{stats?.target?.status_note || 'لا تتوفر بيانات الدفع الكافية لاحتساب الهدف'}</span>
                </p>
              </div>

              {/* Demo CTA (Section 41 & 104) */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>⚡ بيئة تجربة المنصة (Demo Hub):</span>
                  </span>
                  <span className="text-[10px] bg-slate-800 text-amber-400 px-2 py-0.5 rounded font-mono font-bold">
                    DEMO ENVIRONMENT REQUIRED
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  لحماية بيانات المتاجر الإنتاجية القائمة، تتيح المنصة تجربة شاشة العميل والكاشير في بيئة ديمو معزولة تماماً.
                </p>
                <button
                  onClick={() => {
                    const demoUrl = `${window.location.origin}/?store=demo-hub&portal=customer`;
                    window.open(demoUrl, '_blank');
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                  <span>فتح نافذة الديمو المعزولة</span>
                </button>
              </div>
            </div>

            {/* Right: Personal Link & Quick QR Card */}
            <div className="lg:col-span-5 bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-amber-400" />
                    <span>روابطك الذكية والـ QR</span>
                  </h3>
                  <button
                    onClick={() => setActiveTab('qr')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold"
                  >
                    عرض صفحة الـ QR الكاملة
                  </button>
                </div>

                <div className="flex items-center justify-center p-3 bg-white rounded-2xl w-32 h-32 mx-auto shadow-xl">
                  <QRCodeSVG value={directJoinLink} size={110} level="M" />
                </div>

                {/* Direct Registration Link */}
                <div className="space-y-1.5 text-right">
                  <span className="text-[11px] font-bold text-amber-400 block">
                    🚀 رابط تسجيل التاجر المباشر (كودك مفعل تلقائياً):
                  </span>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-amber-500/30 font-mono text-xs text-amber-400 break-all select-all flex items-center justify-between gap-2">
                    <span className="truncate">{directJoinLink}</span>
                    <button
                      onClick={() => copyText(directJoinLink, 'direct-link-quick')}
                      className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[10px] font-black transition flex-shrink-0"
                    >
                      {copiedKey === 'direct-link-quick' ? 'تم النسخ' : 'نسخ'}
                    </button>
                  </div>
                </div>

                {/* Public Landing Link */}
                <div className="space-y-1.5 text-right">
                  <span className="text-[11px] font-bold text-slate-300 block">
                    🌐 صفحتك التعريفية الترويجية (Landing Page):
                  </span>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 break-all select-all flex items-center justify-between gap-2">
                    <span className="truncate">{publicLandingLink}</span>
                    <button
                      onClick={() => copyText(publicLandingLink, 'public-link-quick')}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold transition flex-shrink-0"
                    >
                      {copiedKey === 'public-link-quick' ? 'تم النسخ' : 'نسخ'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => copyText(directJoinLink, 'quick-join-all')}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-1.5"
                >
                  {copiedKey === 'quick-join-all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey === 'quick-join-all' ? 'تم نسخ رابط التسجيل!' : 'نسخ رابط التسجيل المباشر'}</span>
                </button>

                <button
                  onClick={() => openWhatsApp(`أهلاً بك! سجّل متجرك في منصة RADAR مع كود الشريك [${partnerRefCode}]:\n${directJoinLink}`)}
                  className="px-3 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-1"
                  title="مشاركة عبر واتساب"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>واتساب</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Recent Clients Preview */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                <span>أحدث العملاء المسجلين عبر رابطك</span>
              </h3>
              <button
                onClick={() => setActiveTab('leads')}
                className="text-xs text-amber-400 hover:text-amber-300 font-bold"
              >
                عرض كل العملاء ({stats?.pipeline?.total_leads ?? 0})
              </button>
            </div>

            {leads.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 space-y-2">
                <p>لم يسجل أي عميل عبر رابطك حتى الآن.</p>
                <p className="text-[11px] text-slate-600">شارك رابطك الشخصي أو رسائل المبيعات للبدء في استقطاب أول تاجر!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {leads.slice(0, 5).map((l) => (
                  <div key={l.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-white block">{l.store_name}</strong>
                      <span className="text-[11px] text-slate-400">{l.manager_name} • {l.city || 'الرياض'}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {l.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 2: MY CLIENTS PIPELINE                                           */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'leads' && (
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={leadsSearch}
                  onChange={(e) => setLeadsSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchLeads(1)}
                  placeholder="ابحث باسم المتجر أو المالك أو رقم الجوال..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-11 pl-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchLeads(1)}
                  className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>بحث</span>
                </button>
                <button
                  onClick={() => fetchLeads(leadsPage)}
                  className="p-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
                  title="تحديث"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingLeads ? 'animate-spin text-amber-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {['ALL', 'NEW', 'CONTACTED', 'PENDING', 'APPROVED', 'CONVERTING', 'CONVERTED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setLeadsStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    leadsStatusFilter === st
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                  }`}
                >
                  {st === 'ALL' ? 'الكل' : st}
                </button>
              ))}
            </div>
          </div>

          {/* Leads Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            {loadingLeads ? (
              <div className="py-16 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400">جاري تحميل قائمة عملائك...</p>
              </div>
            ) : leads.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <p className="text-sm font-bold text-white">لا توجد طلبات تطابق الفلترة الحالية</p>
                <p className="text-xs text-slate-500">شارك رابطك الشخصي لجلب تجار جدد تحت مظلتك.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400">
                      <th className="py-3.5 px-4">المتجر والمالك</th>
                      <th className="py-3.5 px-4">الجوال</th>
                      <th className="py-3.5 px-4">المدينة / النشاط</th>
                      <th className="py-3.5 px-4">الحالة</th>
                      <th className="py-3.5 px-4">التاريخ</th>
                      <th className="py-3.5 px-4 text-center">إجراءات المتابعة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {leads.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-4 px-4">
                          <strong className="text-white block">{l.store_name}</strong>
                          <span className="text-[11px] text-slate-400">{l.manager_name}</span>
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-300" dir="ltr">
                          {l.phone}
                        </td>
                        <td className="py-4 px-4 text-slate-300">
                          {l.city || '—'} {l.business_type ? `(${l.business_type})` : ''}
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            {l.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-400 font-mono text-[11px]">
                          {new Date(l.created_at).toLocaleDateString('ar-SA')}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => setSelectedLead(l)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-400" />
                            <span>متابعة وتواصل</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 3: READY-MADE SALES KIT (Section 37, 39, 40)                      */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'sales_kit' && (
        <div className="space-y-8">
          <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-2">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-400" />
              <span>حقيبة أدوات البيع الجاهزة (Sales Kit)</span>
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              5 رسائل تسويقية احترافية مدروسة سيكولوجياً للتأثير في قرار أصحاب المتاجر، بالإضافة إلى قوالب متابعة الحالات وأداة استعراض الشعار.
            </p>
          </div>

          {/* 5 Core Messages */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              1. الرسائل الخمس الأساسية للاستقطاب
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {salesKit.map((msg, idx) => (
                <div
                  key={msg.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-4 shadow-xl"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                        رسالة #{idx + 1}
                      </span>
                      <span className="text-[11px] text-slate-400 font-bold">{msg.title}</span>
                    </div>

                    <h5 className="text-sm font-black text-white leading-snug">{msg.headline}</h5>

                    <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs text-slate-300 whitespace-pre-line leading-relaxed select-all">
                      {msg.body}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => copyText(msg.body, msg.id)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      {copiedKey === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === msg.id ? 'تم النسخ!' : 'نسخ الرسالة'}</span>
                    </button>

                    <button
                      onClick={() => openWhatsApp(msg.body)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>واتساب</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Logo Pitch Section (Section 40) */}
          {logoPitch && (
            <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  🎨
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">{logoPitch.title}</h4>
                  <p className="text-xs text-slate-400">{logoPitch.headline}</p>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 whitespace-pre-line leading-relaxed select-all">
                {logoPitch.body}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => copyText(logoPitch.body, 'logo-pitch')}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5"
                >
                  {copiedKey === 'logo-pitch' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey === 'logo-pitch' ? 'تم نسخ الرسالة!' : 'نسخ رسالة طلب الشعار'}</span>
                </button>
                <button
                  onClick={() => openWhatsApp(logoPitch.body)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>فتح واتساب</span>
                </button>
              </div>
            </div>
          )}

          {/* Status-Based Follow-up Templates (Section 39) */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              2. قوالب المتابعة الذكية حسب حالة العميل
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(statusTemplates).map(([statusKey, tmpl]) => (
                <div key={statusKey} className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-3">
                  <h5 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{tmpl.title}</span>
                  </h5>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 whitespace-pre-line leading-relaxed select-all">
                    {tmpl.body}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => copyText(tmpl.body, `tmpl-${statusKey}`)}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      {copiedKey === `tmpl-${statusKey}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === `tmpl-${statusKey}` ? 'تم النسخ!' : 'نسخ القالب'}</span>
                    </button>
                    <button
                      onClick={() => openWhatsApp(tmpl.body)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold transition"
                      title="فتح واتساب"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 4: REFERRAL LINK & QR CODE (Section 25 & 26)                     */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'qr' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Direct Merchant Registration Link & QR */}
            <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-5 text-center shadow-2xl flex flex-col justify-between">
              <div className="space-y-3">
                <span className="px-3 py-1 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30 inline-block">
                  الأكثر استخداماً للتسجيل المباشر ⚡
                </span>
                <h3 className="text-base font-black text-white">رابط وباركود تسجيل التاجر المباشر</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  يفتح للتاجر نموذج التسجيل الفوري مع تثبيت كودك <strong className="text-amber-400 font-mono">({partnerRefCode})</strong> تلقائياً ليُحتسب العميل لك فور تسجيله.
                </p>

                <div className="p-4 bg-white rounded-2xl w-44 h-44 mx-auto shadow-xl flex items-center justify-center border-2 border-amber-500/30">
                  <QRCodeSVG value={directJoinLink} size={150} level="H" includeMargin={true} />
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-amber-500/20 font-mono text-xs text-amber-400 break-all select-all text-left" dir="ltr">
                  {directJoinLink}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => copyText(directJoinLink, 'full-direct-join-link')}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20"
                >
                  {copiedKey === 'full-direct-join-link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey === 'full-direct-join-link' ? 'تم النسخ!' : 'نسخ رابط التسجيل المباشر'}</span>
                </button>

                <button
                  onClick={() => openWhatsApp(`أهلاً بك! سجّل متجرك عبر منظومة RADAR مع كود الشريك [${partnerRefCode}]:\n${directJoinLink}`)}
                  className="w-full py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>إرسال عبر واتساب</span>
                </button>
              </div>
            </div>

            {/* Card 2: Promotional Landing Page Link & QR */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 text-center shadow-2xl flex flex-col justify-between">
              <div className="space-y-3">
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 inline-block">
                  صفحة الهبوط التعريفية 🌐
                </span>
                <h3 className="text-base font-black text-white">رابط وباركود صفحتك التعريفية</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  صفحة تسويقية خاصة باسمك تعرض مميزات رادار للتاجر، وبها أزرار تنقله لنموذج التسجيل مع كودك.
                </p>

                <div className="p-4 bg-white rounded-2xl w-44 h-44 mx-auto shadow-xl flex items-center justify-center border-2 border-slate-700">
                  <QRCodeSVG value={publicLandingLink} size={150} level="H" includeMargin={true} />
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 break-all select-all text-left" dir="ltr">
                  {publicLandingLink}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => copyText(publicLandingLink, 'full-public-landing-link')}
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  {copiedKey === 'full-public-landing-link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey === 'full-public-landing-link' ? 'تم النسخ!' : 'نسخ رابط الصفحة التعريفية'}</span>
                </button>

                <a
                  href={publicLandingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4 text-amber-400" />
                  <span>معاينة الصفحة في نافذة جديدة</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 5: TARGETS & BONUSES (Section 43, 52, 53)                        */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'targets' && (
        <div className="space-y-8">
          {/* Monthly Target Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Target className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="text-lg font-black text-white">هدف مبيعات الشهر الحالي</h3>
                  <p className="text-xs text-slate-400">احتساب التجار المدفوعين المؤهلين للعمولات والمكافآت</p>
                </div>
              </div>
              <span className="text-xl font-mono font-black text-amber-400">
                {stats?.target?.achieved_count ?? 0} / {stats?.target?.target_value ?? 20}
              </span>
            </div>

            <div className="w-full bg-slate-950 rounded-full h-4 border border-slate-800 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(2, ((stats?.target?.achieved_count ?? 0) / (stats?.target?.target_value || 20)) * 100)
                  )}%`,
                }}
              ></div>
            </div>

            <p className="text-xs text-slate-400">
              📌 {stats?.target?.status_note || 'لا تتوفر بيانات الدفع الكافية لاحتساب الهدف'}
            </p>
          </div>

          {/* Bonus Milestones (Section 13 & 52) */}
          <div className="space-y-4">
            <div>
              <h4 className="text-base font-black text-white">مراحل المكافآت التحفيزية (Milestone Bonuses)</h4>
              <p className="text-xs text-slate-400">مكافآت نقدية إضافية تُضاف إلى رصيدك عند تحقيق عدد التجار المدفوعين.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {bonusMilestones.map((m) => {
                const isAchieved = m.status === 'ACHIEVED' || m.status === 'AWARDED';
                return (
                  <div
                    key={m.id}
                    className={`rounded-3xl p-6 border transition space-y-4 ${
                      isAchieved
                        ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/30'
                        : 'bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">🏆</span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          isAchieved
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {m.status === 'AWARDED' ? 'تم الصرف' : isAchieved ? 'محققة' : 'مقفلة 🔒'}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-slate-400 block">عند استقطاب:</span>
                      <strong className="text-lg font-black text-white block">
                        {m.milestone} تجار مدفوعين
                      </strong>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-xs text-slate-400 block">قيمة المكافأة:</span>
                      <span className="text-xl font-black text-amber-400 font-mono">
                        +{m.bonus_amount} <span className="text-xs font-normal">ريال</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 6: COMMISSIONS LEDGER (Section 47, 48, 50)                       */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'commissions' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/80 border border-amber-500/30 rounded-3xl p-5 space-y-1">
              <span className="text-xs text-amber-400 font-medium block">عمولات معلقة (Pending)</span>
              <span className="text-2xl font-black text-amber-400 font-mono block">
                {commissionsSummary.total_pending} <span className="text-xs">ريال</span>
              </span>
              <span className="text-[10px] text-slate-400 block">بانتظار تأكيد الدفع التجاري</span>
            </div>

            <div className="bg-slate-900/80 border border-emerald-500/30 rounded-3xl p-5 space-y-1">
              <span className="text-xs text-emerald-400 font-medium block">عمولات مكتسبة (Earned)</span>
              <span className="text-2xl font-black text-emerald-400 font-mono block">
                {commissionsSummary.total_earned} <span className="text-xs">ريال</span>
              </span>
              <span className="text-[10px] text-slate-400 block">مستحقة للصرف</span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-1">
              <span className="text-xs text-slate-400 font-medium block">عمولات مدفوعة (Paid)</span>
              <span className="text-2xl font-black text-white font-mono block">
                {commissionsSummary.total_paid} <span className="text-xs">ريال</span>
              </span>
              <span className="text-[10px] text-slate-400 block">تم تحويلها</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-white">دفتر حركات العمولات</h4>
                <p className="text-xs text-slate-400">سجل شفاف لكل عملية بيع أو اشتراك محول بنسبة 20%</p>
              </div>
            </div>

            {commissions.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500 space-y-2">
                <p>لا توجد حركات عمولات مسجلة حتى الآن.</p>
                <p className="text-[11px] text-slate-600">تُسجل العمولات آلياً فور تأسيس واشتراك المتاجر المحولة من خلالك.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400">
                      <th className="py-3.5 px-4">اسم التاجر / المتجر</th>
                      <th className="py-3.5 px-4">نوع العملية</th>
                      <th className="py-3.5 px-4">أساس الاحتساب</th>
                      <th className="py-3.5 px-4">النسبة</th>
                      <th className="py-3.5 px-4">مبلغ العمولة</th>
                      <th className="py-3.5 px-4">الحالة</th>
                      <th className="py-3.5 px-4">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {commissions.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-4 px-4 font-bold text-white">{c.merchant_name}</td>
                        <td className="py-4 px-4 text-slate-300">{c.qualifying_event}</td>
                        <td className="py-4 px-4 font-mono text-slate-300">{c.basis_amount} ريال</td>
                        <td className="py-4 px-4 font-mono text-amber-400 font-bold">
                          {Math.round(c.commission_rate * 100)}%
                        </td>
                        <td className="py-4 px-4 font-mono text-emerald-400 font-bold text-sm">
                          {c.commission_amount} ريال
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              c.status === 'EARNED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : c.status === 'PAID'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-mono text-[11px] text-slate-400">
                          {new Date(c.created_at).toLocaleDateString('ar-SA')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* CLIENT DETAIL & WHATSAPP FOLLOW-UP MODAL (Section 35 & 36)           */}
      {/* -------------------------------------------------------------------- */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">{selectedLead.store_name}</h4>
                  <p className="text-xs text-slate-400">{selectedLead.manager_name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Safe Details Only (Section 35: Never expose conversion_lease_id or internal tokens) */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-slate-500 block text-[11px]">الجوال</span>
                <span className="text-white font-mono font-bold mt-1 block" dir="ltr">{selectedLead.phone}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-slate-500 block text-[11px]">الحالة الراهنة</span>
                <span className="text-amber-400 font-bold mt-1 block">{selectedLead.status}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-slate-500 block text-[11px]">المدينة</span>
                <span className="text-white font-bold mt-1 block">{selectedLead.city || '—'}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-slate-500 block text-[11px]">تاريخ التسجيل</span>
                <span className="text-slate-300 font-mono mt-1 block">
                  {new Date(selectedLead.created_at).toLocaleDateString('ar-SA')}
                </span>
              </div>
            </div>

            {/* Section 36: WhatsApp Follow-up Generator & Copy */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-slate-300 block">رسالة المتابعة المخصصة لهذا العميل:</label>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs text-slate-300 whitespace-pre-line leading-relaxed select-all">
                {`مرحباً بك ${selectedLead.manager_name} 👋\nمعك ${partner.display_name} من رادار.\nحبيت أطمئن كيف كانت تجربتك واطلاعك على المنظومة لمتجركم (${selectedLead.store_name})؟ هل تحب أساعدك بتفعيل أول بطاقة ولاء؟ 🚀`}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  const msg = `مرحباً بك ${selectedLead.manager_name} 👋\nمعك ${partner.display_name} من رادار.\nحبيت أطمئن كيف كانت تجربتك واطلاعك على المنظومة لمتجركم (${selectedLead.store_name})؟ هل تحب أساعدك بتفعيل أول بطاقة ولاء؟ 🚀`;
                  copyText(msg, `lead-msg-${selectedLead.id}`);
                }}
                className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
              >
                {copiedKey === `lead-msg-${selectedLead.id}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedKey === `lead-msg-${selectedLead.id}` ? 'تم النسخ!' : 'نسخ رسالة المتابعة'}</span>
              </button>

              <button
                onClick={() => {
                  const cleanPhone = (selectedLead.phone || '').replace(/\D/g, '');
                  const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;
                  const msg = `مرحباً بك ${selectedLead.manager_name} 👋\nمعك ${partner.display_name} من رادار.\nحبيت أطمئن كيف كانت تجربتك واطلاعك على المنظومة لمتجركم (${selectedLead.store_name})؟ هل تحب أساعدك بتفعيل أول بطاقة ولاء؟ 🚀`;
                  window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                }}
                className="px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                <span>واتساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

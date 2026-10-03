import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  PartnerAccount,
  PartnerCommission,
  PartnerBonusMilestone,
  SalesKitMessage,
  MerchantLead,
  UnifiedLifecycleStage,
  UnifiedStageInfo,
  resolveUnifiedStage,
  getStoreUnifiedStage,
} from '../types';
import { LoyaltyService, getSupabaseClient, normalizeLead, normalizePhone } from '../lib/supabase';
import { LoyaltyEvents } from '../lib/events';
import { debounce } from '../lib/debounce';
import { useAuth } from '../context/AuthContext';
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
  CreditCard,
  X,
  Phone,
  KeyRound,
} from 'lucide-react';

export function getLeadStatusArabic(status?: string, lead?: any): { label: string; colorClass: string } {
  const stage = resolveUnifiedStage(lead || { status });
  return {
    label: `${stage.label} ${stage.icon}`,
    colorClass: stage.badgeClass,
  };
}

export function getCommissionStatusArabic(status?: string): { label: string; colorClass: string } {
  switch (status) {
    case 'EARNED':
    case 'AVAILABLE':
      return { label: 'مستحقة وجاهزة للصرف 💰', colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
    case 'PAID':
      return { label: 'تم الصرف والتحويل ✅', colorClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' };
    case 'CANCELLED':
    case 'VOID':
    case 'REVERSED':
      return { label: 'ملغاة ✕', colorClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    default:
      return { label: 'مكتسبة 💰', colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
  }
}

const PARTNER_STATUS_FILTER_TABS = [
  { id: 'ALL', label: 'الكل' },
  { id: 'NEW', label: 'طلب جديد 🆕' },
  { id: 'IN_SETUP', label: 'جاري التأسيس ⚙️' },
  { id: 'SETUP_COMPLETE', label: 'تم التأسيس 🚀' },
  { id: 'UNDER_REVIEW', label: 'تحت المراجعة ⏳' },
  { id: 'PAID_ACTIVE', label: 'مشترك مدفوع 👑' },
];

const buildDefaultSalesKit = (pName: string, pSlug: string, pRef: string): SalesKitMessage[] => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://radar.taeybsalah.workers.dev';
  const joinLink = `${origin}/join?ref=${pRef}`;
  return [
    {
      id: 'msg-cashier',
      title: 'رسالة الكاشير والعميل العائد 🏪',
      tag: 'CASHIER_LOST',
      headline: 'كم عميل يجيك مرة ويختفي؟',
      body: `كم عميل يجيك مرة ويختفي؟ 🤔\n\nأغلب المحلات تركز على جلب زبون جديد وتنسى الزبون اللي اشترى وراح.\nمع منصة RADAR للولاء الذكي، تقدر تجمع بيانات عملائك وتخليهم يرجعون لك بدون ما تدفع مبالغ ضخمة على الإعلانات.\n\nجرّب بنفسك وسجّل متجرك من هنا:\n${joinLink}\n\nأخوك: ${pName}`,
    },
    {
      id: 'msg-app',
      title: 'رسالة التطبيق والهوية الخاصة 📱',
      tag: 'BRAND_EXPERIENCE',
      headline: 'تخيل عميلك يفتح تجربة باسم محلك بدون ما تبني تطبيق من الصفر',
      body: `تخيل عميلك يفتح تجربة وبطاقة ولاء باسم وشعار محلك في ثواني بدون ما تدفع عشرات الآلاف لبناء تطبيق من الصفر! 🚀\n\nنظام RADAR يعطيك PWA فورية لكاشيرك وعملائك برابط وهوية خاصة.\n\nسجّل متجرك وابدأ هنا:\n${joinLink}\n\nتحياتي، ${pName}`,
    },
    {
      id: 'msg-loyalty',
      title: 'رسالة قيمة الولاء والخصم 💎',
      tag: 'VALUE_VS_DISCOUNT',
      headline: 'مو كل عميل يحتاج خصم... بعضهم يحتاج سبب يرجع',
      body: `مو كل عميل يحتاج خصم... بعضهم يحتاج سبب يرجع! ✨\n\nالخصومات تحرق هامش ربحك، لكن نظام النقاط والمستويات (Tiers) يخلي العميل يرتبط بمحلك ويتحمس يجمع نقاط ويكرر زيارته.\n\nسجّل متجرك وشوف كيف يفيد نشاطك:\n${joinLink}\n\n${pName} — رادار لخدمات التجار`,
    },
    {
      id: 'msg-lost-customers',
      title: 'رسالة استعادة العملاء المنقطعين ⏰',
      tag: 'RETENTION',
      headline: 'عندك عملاء ما شفتهم من شهر؟',
      body: `عندك عملاء كانوا يجونك دايماً وفجأة انقطعوا من شهر؟ 📉\n\nنظام رادار ينبهك عليهم ويساعدك ترسل لهم عروض حصرية وترجعهم لك بضغطة زر.\n\nسجل متجرك وابدأ التجربة:\n${joinLink}\n\nمستشارك: ${pName}`,
    },
    {
      id: 'msg-positioning',
      title: 'رسالة التموضع الاستراتيجي ⚡',
      tag: 'COMPETITIVE',
      headline: 'الكاشير يعرف كم بعت اليوم. RADAR يساعدك تعرف مين تبغى يرجع بكرة',
      body: `الكاشير يعرف كم بعت اليوم... لكن RADAR يساعدك تعرف مين تبغى يرجع بكرة! 🎯\n\nحوّل كل عملية بيع إلى علاقة مستمرة وزبون وفيّ.\n\nسجّل متجرك الآن عبر هذا الرابط:\n${joinLink}\n\n${pName}`,
    },
  ];
};

const buildDefaultStatusTemplates = (pName: string, pRef: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://radar.taeybsalah.workers.dev';
  const joinLink = `${origin}/join?ref=${pRef}`;
  return {
    trial: {
      title: 'متابعة تجربة المتجر (Trial Follow-up)',
      body: `مرحباً بك! 👋\nحبيت أطمئن كيف كانت تجربتك المبدئية مع منصة RADAR؟\nهل جربت إنشاء بطاقة الولاء أو مسح أول باركود كاشير؟ إذا عندك أي استفسار أنا بالخدمة لمساعدتك خطوة بخطوة 🚀\n\n${pName}`,
    },
    pending_payment: {
      title: 'تذكير التفعيل والاعتماد (Payment / Setup Reminder)',
      body: `أهلاً بك عزيزي،\nطلب متجركم معتمد وجاهز للانطلاق على رادار. باقي فقط خطوة الاعتماد النهائي لنفعل لكم الربط الكامل وهوية المتجر الخاصة.\n\nيسعدني مساعدتك لإتمام التفعيل في أي وقت:\n${joinLink}\n\n${pName}`,
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

const buildDefaultLogoPitch = (pName: string, pRef: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://radar.taeybsalah.workers.dev';
  const joinLink = `${origin}/join?ref=${pRef}`;
  return {
    title: 'أداة أرسل شعارك (Logo Pitch)',
    headline: 'أرسل لي اسم محلك وشعاره، وأوريك كيف ممكن تكون تجربة RADAR باسم محلك',
    body: `أرسل لي اسم محلك وشعاره 🎨\n\nوأنا بجهّز لك نموذج حي يعرض كيف تظهر تجربة وبطاقة ولاء RADAR بهوية وألوان محلك قبل ما تشترك!\n\nسجّل متجرك وجرب من هنا:\n${joinLink}\n\n${pName}`,
  };
};

const defaultBonusMilestones: PartnerBonusMilestone[] = [
  { id: 'b-5', milestone: 5, bonus_amount: 500, status: 'LOCKED', current_progress: 0, required_merchants: 5 },
  { id: 'b-10', milestone: 10, bonus_amount: 1500, status: 'LOCKED', current_progress: 0, required_merchants: 10 },
  { id: 'b-20', milestone: 20, bonus_amount: 3500, status: 'LOCKED', current_progress: 0, required_merchants: 20 },
  { id: 'b-50', milestone: 50, bonus_amount: 10000, status: 'LOCKED', current_progress: 0, required_merchants: 50 },
];

export interface PartnerDashboardProps {
  onBackToApp?: () => void;
}

export const PartnerDashboard: React.FC<PartnerDashboardProps> = ({ onBackToApp }) => {
  const { user, login: authLogin, logout: authLogout } = useAuth();

  // 1. Auth State
  const [partner, setPartner] = useState<any | null>(() => {
    if (user?.role === 'partner' && user.metadata) return user.metadata;
    return LoyaltyService.getPartnerSession();
  });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'partner' && user.metadata && !partner) {
      setPartner(user.metadata);
    }
  }, [user, partner]);

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

  // 8. Change PIN Modal State
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);
  const [pinChangeSuccess, setPinChangeSuccess] = useState<string | null>(null);
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);

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

  // Dynamic Page Document Title Isolation
  useEffect(() => {
    const pName = partner?.display_name || partner?.name;
    document.title = pName ? `${pName} | شريك رادار` : 'بوابة الشريك | RADAR';
  }, [partner?.display_name, partner?.name]);

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
        let apiLoaded = false;

        // 1. Try API if token available (with fast 800ms timeout)
        if (headers) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 800);

            const [statsRes, assetsRes, commRes, bonusRes] = await Promise.all([
              fetch('/api/partner/stats', { headers, signal: controller.signal }).catch(() => null),
              fetch('/api/partner/assets', { headers, signal: controller.signal }).catch(() => null),
              fetch('/api/partner/commissions', { headers, signal: controller.signal }).catch(() => null),
              fetch('/api/partner/bonuses', { headers, signal: controller.signal }).catch(() => null),
            ]);
            clearTimeout(timeoutId);

            if (statsRes && statsRes.ok) {
              const statsData = await statsRes.json().catch(() => null);
              if (statsData && statsData.success && statsData.stats) setStats(statsData.stats);
            }
            if (assetsRes && assetsRes.ok) {
              const assetsData = await assetsRes.json().catch(() => null);
              if (assetsData && assetsData.success) {
                if (assetsData.sales_kit) setSalesKit(assetsData.sales_kit);
                if (assetsData.status_templates) setStatusTemplates(assetsData.status_templates);
                if (assetsData.logo_pitch) setLogoPitch(assetsData.logo_pitch);
              }
            }
            if (commRes && commRes.ok) {
              const commData = await commRes.json().catch(() => null);
              if (commData && commData.success) {
                setCommissions(commData.commissions || []);
                if (commData.summary) setCommissionsSummary(commData.summary);
              }
            }
            if (bonusRes && bonusRes.ok) {
              const bonusData = await bonusRes.json().catch(() => null);
              if (bonusData && bonusData.success && bonusData.milestones) {
                setBonusMilestones(bonusData.milestones);
              }
            }
            if (statsRes && statsRes.ok) {
              apiLoaded = true;
            }
          } catch (e) {
            console.warn('Partner API fetch warning:', e);
          }
        }

        // 2. Dual-mode fallback / hydration via LoyaltyService
        if (!apiLoaded) {
          const [summary, commList, bonusData, allLeads] = await Promise.all([
            LoyaltyService.getPartnerFinancialSummary(partner.id, partner.affiliate_id),
            LoyaltyService.getPartnerCommissions(partner.id),
            LoyaltyService.getPartnerBonuses(partner.id, partner.affiliate_id),
            LoyaltyService.getAllLeads(),
          ]);

          const partnerRef = (partner.affiliates?.referral_code || partner.referral_code || '').toLowerCase().trim();
          const matchedLeads = allLeads.filter(
            (l) => (l.referral_code || '').toLowerCase().trim() === partnerRef
          );
          const paidMerchants = matchedLeads.filter((l) => resolveUnifiedStage(l).isPaidActive);
          const paidCount = bonusData?.paidCount ?? paidMerchants.length;
          const convertedCount = matchedLeads.filter((l) => l.status === 'CONVERTED' || l.converted_store_id).length;
          const targetVal = partner.target_value || 20;

          setStats({
            pipeline: {
              total_leads: matchedLeads.length,
              converted: convertedCount,
            },
            target: {
              target_value: targetVal,
              achieved_count: paidCount,
              status_note: paidCount > 0 ? `تم تحقيق ${paidCount} من إجمالي هدف ${targetVal} متجر مدفوع` : 'بانتظار سداد أول متجر لاحتسابه ضمن الهدف',
            },
            financials: {
              pending_commissions: summary.pending_commissions,
              earned_commissions: summary.earned_commissions,
              paid_commissions: summary.paid_commissions,
              bonuses_earned: summary.bonuses_earned,
              commission_rate: partner.commission_rate || 0.20,
              currency: 'SAR',
            },
          });

          setCommissions(commList || []);
          setCommissionsSummary({
            total_pending: summary.pending_commissions,
            total_earned: summary.earned_commissions,
            total_paid: summary.paid_commissions,
          });

          if (bonusData?.milestones) {
            setBonusMilestones(bonusData.milestones);
          }
        }
      } catch (err) {
        console.warn('Dashboard data loader exception:', err);
      } finally {
        setLoadingStats(false);
      }
    };

    loadDashboardData();
  }, [partner]);

  // Fetch Leads with search & pagination (without triggering re-render flicker)
  const fetchLeads = useCallback(
    async (pageToLoad: number = 1) => {
      if (!partner) return;
      if (leads.length === 0) {
        setLoadingLeads(true);
      }

      try {
        const client = getSupabaseClient();
        const refCode = partner.affiliates?.referral_code || partner.referral_code;
        
        if (client) {
          let query = client.from('merchant_leads').select('*', { count: 'exact' });
          if (partner.affiliate_id && refCode) {
            query = query.or(`affiliate_id.eq.${partner.affiliate_id},partner_id.eq.${partner.id},referral_code.eq.${refCode}`);
          } else if (partner.affiliate_id) {
            query = query.or(`affiliate_id.eq.${partner.affiliate_id},partner_id.eq.${partner.id}`);
          } else if (refCode) {
            query = query.or(`partner_id.eq.${partner.id},referral_code.eq.${refCode}`);
          } else {
            query = query.eq('partner_id', partner.id);
          }

          if (leadsSearch.trim()) {
            query = query.or(`store_name.ilike.%${leadsSearch.trim()}%,manager_name.ilike.%${leadsSearch.trim()}%,phone.ilike.%${leadsSearch.trim()}%`);
          }

          const from = (pageToLoad - 1) * 15;
          const to = from + 14;
          const { data, count, error } = await query.range(from, to).order('created_at', { ascending: false });

          if (!error && data && data.length > 0) {
            const allLocalLeads = await LoyaltyService.getAllLeads();
            let normalized = (data as any[]).map((d) => {
              const localMatch = allLocalLeads.find((l) => l.id === d.id || (l.phone && d.phone && normalizePhone(l.phone) === normalizePhone(d.phone)));
              return normalizeLead(localMatch || d);
            });

            if (leadsStatusFilter && leadsStatusFilter !== 'ALL') {
              normalized = normalized.filter((l) => {
                const stage = resolveUnifiedStage(l);
                return (
                  stage.key === leadsStatusFilter ||
                  stage.label === leadsStatusFilter ||
                  l.status === leadsStatusFilter ||
                  l.lifecycle_stage === leadsStatusFilter
                );
              });
            }

            setLeads(normalized);
            setTotalLeads(count || data.length);
            setLeadsPage(pageToLoad);
            setLoadingLeads(false);
            return;
          }
        }

        // Fallback: search local leads
        const allLocalLeads = await LoyaltyService.getAllLeads();
        const partnerRef = (partner.affiliates?.referral_code || partner.referral_code || '').toLowerCase().trim();
        let matched = allLocalLeads.filter(
          (l) => (l.referral_code || '').toLowerCase().trim() === partnerRef
        );
        if (leadsStatusFilter && leadsStatusFilter !== 'ALL') {
          matched = matched.filter((l) => {
            const stage = resolveUnifiedStage(l);
            return (
              stage.key === leadsStatusFilter ||
              stage.label === leadsStatusFilter ||
              l.status === leadsStatusFilter ||
              l.lifecycle_stage === leadsStatusFilter
            );
          });
        }
        if (leadsSearch.trim()) {
          const s = leadsSearch.toLowerCase().trim();
          matched = matched.filter(
            (l) => l.store_name?.toLowerCase().includes(s) || l.manager_name?.toLowerCase().includes(s) || l.phone?.includes(s)
          );
        }
        setLeads(matched);
        setTotalLeads(matched.length);
        setLeadsPage(pageToLoad);
      } catch (err) {
        console.warn('Error fetching partner leads:', err);
      } finally {
        setLoadingLeads(false);
      }
    },
    [partner, leadsStatusFilter, leadsSearch]
  );

  useEffect(() => {
    if (partner && (activeTab === 'leads' || activeTab === 'overview')) {
      fetchLeads(1);
    }
  }, [partner, activeTab, leadsStatusFilter, fetchLeads]);

  // 🔄 Debounced real-time synchronization when Super Admin updates lead status or creates store
  const debouncedSyncPartnerData = useMemo(
    () =>
      debounce(async (pId: string) => {
        fetchLeads(1);
        const [fin, comms, allLeads, bonusData] = await Promise.all([
          LoyaltyService.getPartnerFinancialSummary(pId, partner?.affiliate_id),
          LoyaltyService.getPartnerCommissions(pId),
          LoyaltyService.getAllLeads(),
          LoyaltyService.getPartnerBonuses(pId, partner?.affiliate_id),
        ]);

        const partnerRef = (partner?.affiliates?.referral_code || partner?.referral_code || '').toLowerCase().trim();
        const matched = allLeads.filter((l) => (l.referral_code || '').toLowerCase().trim() === partnerRef);
        const paidMerchants = matched.filter((l) => resolveUnifiedStage(l).isPaidActive);
        const paidCount = bonusData?.paidCount ?? paidMerchants.length;
        const targetVal = partner?.target_value || 20;

        setStats((prev: any) => ({
          ...prev,
          pipeline: {
            total_leads: matched.length,
            converted: matched.filter((l) => l.status === 'CONVERTED' || l.converted_store_id).length,
          },
          target: {
            target_value: targetVal,
            achieved_count: paidCount,
            status_note: paidCount > 0 ? `تم تحقيق ${paidCount} من إجمالي هدف ${targetVal} متجر مدفوع` : 'بانتظار سداد أول متجر لاحتسابه ضمن الهدف',
          },
          financials: {
            earned_commissions: fin.earned_commissions,
            bonuses_earned: fin.bonuses_earned,
            pending_commissions: fin.pending_commissions,
            paid_commissions: fin.paid_commissions,
            commission_rate: partner?.commission_rate || 0.20,
            currency: 'SAR',
          },
        }));

        setCommissions(comms || []);
        setCommissionsSummary({
          total_pending: fin.pending_commissions,
          total_earned: fin.earned_commissions,
          total_paid: fin.paid_commissions,
        });
      }, 400),
    [partner, fetchLeads]
  );

  useEffect(() => {
    if (!partner) return;
    const unsubscribe = LoyaltyEvents.listen((event) => {
      if (
        event.type === 'LEAD_UPDATED' ||
        event.type === 'PARTNER_UPDATED' ||
        event.type === 'PAYMENT_COMPLETED' ||
        event.type === 'STORE_UPDATED'
      ) {
        debouncedSyncPartnerData(partner.id);
      }
    });
    return () => {
      unsubscribe();
      debouncedSyncPartnerData.cancel();
    };
  }, [partner, debouncedSyncPartnerData]);

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
      authLogin('partner', {
        id: res.partner.id,
        partnerId: res.partner.id,
        partnerSlug: res.partner.slug || res.partner.referral_code,
        name: res.partner.display_name || res.partner.name,
        phone: res.partner.affiliates?.phone || res.partner.phone,
        metadata: res.partner,
      });
      setPhoneInput('');
      setPinInput('');
    } catch (err: any) {
      setAuthError(err.message || 'حدث خطأ في تسجيل الدخول');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    authLogout('partner');
    LoyaltyService.clearPartnerSession();
    sessionStorage.removeItem('RADAR_PARTNER_AUTH_TOKEN');
    setPartner(null);
    setStats(null);
  };

  // Handle Changing PIN
  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinChangeError(null);
    setPinChangeSuccess(null);

    if (!currentPinInput.trim()) {
      setPinChangeError('يرجى إدخال الرمز السري الحالي');
      return;
    }
    if (!newPinInput.trim() || newPinInput.trim().length < 4) {
      setPinChangeError('الرمز السري الجديد يجب أن يكون 4 أرقام على الأقل');
      return;
    }
    if (newPinInput.trim() !== confirmPinInput.trim()) {
      setPinChangeError('الرمز السري الجديد وتأكيده غير متطابقين');
      return;
    }

    setIsUpdatingPin(true);
    try {
      const res = await LoyaltyService.updatePartnerPin(
        partner.id || partner.affiliate_id,
        currentPinInput.trim(),
        newPinInput.trim()
      );
      if (!res.success) {
        setPinChangeError(res.error || 'فشل تحديث الرمز السري');
        return;
      }

      setPartner(res.partner);
      setPinChangeSuccess('تم تحديث الرمز السري بنجاح! 🔒');
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      setTimeout(() => {
        setShowChangePinModal(false);
        setPinChangeSuccess(null);
      }, 1500);
    } catch (err: any) {
      setPinChangeError(err.message || 'حدث خطأ أثناء تحديث الرمز');
    } finally {
      setIsUpdatingPin(false);
    }
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
            <div className="w-20 h-20 mx-auto rounded-3xl p-1 bg-gradient-to-tr from-cyan-400 via-emerald-400 to-amber-400 shadow-2xl shadow-cyan-500/20">
              <img src="/radar-logo-dark.jpg" alt="RADAR" className="w-full h-full object-cover rounded-[22px]" />
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
              <p className="text-[10px] text-slate-500">الرمز السري المحدد لك من قبل إدارة رادار (يمكنك تغييره من لوحة التحكم)</p>
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
          <div className="w-14 h-14 rounded-2xl p-0.5 bg-gradient-to-tr from-cyan-400 via-emerald-400 to-amber-400 shadow-lg shadow-cyan-500/20 flex-shrink-0">
            <img src="/radar-logo-dark.jpg" alt="RADAR" className="w-full h-full object-cover rounded-[14px]" />
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

          <button
            onClick={() => {
              setPinChangeError(null);
              setPinChangeSuccess(null);
              setCurrentPinInput('');
              setNewPinInput('');
              setConfirmPinInput('');
              setShowChangePinModal(true);
            }}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-400 hover:text-amber-300 px-3.5 py-2 rounded-2xl text-xs font-bold transition"
            title="تغيير الرمز السري الخاص بك"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>تغيير الرمز السري</span>
          </button>

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

        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>العمولات المصروفة</span>
            <CreditCard className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-2xl font-black text-slate-200 font-mono block">
            {stats?.financials?.paid_commissions ?? 0} <span className="text-xs">ريال</span>
          </span>
          <span className="text-[10px] text-slate-500 block">تم تحويلها لحسابك البنكي</span>
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
                {leads.slice(0, 5).map((l) => {
                  const statusInfo = getLeadStatusArabic(l.status, l);
                  return (
                    <div key={l.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-white block">{l.store_name}</strong>
                        <span className="text-[11px] text-slate-400">{l.manager_name} • {l.city || 'الرياض'}</span>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusInfo.colorClass}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  );
                })}
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
              {PARTNER_STATUS_FILTER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setLeadsStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    leadsStatusFilter === tab.id
                      ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                      : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Leads Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            {loadingLeads && leads.length === 0 ? (
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
                    {leads.map((l) => {
                      const statusInfo = getLeadStatusArabic(l.status, l);
                      return (
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
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusInfo.colorClass}`}>
                              {statusInfo.label}
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
                      );
                    })}
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
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Card: Direct Merchant Registration Link & QR */}
          <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-6 text-center shadow-2xl">
            <div className="space-y-3">
              <span className="px-3 py-1 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30 inline-block">
                رابط وباركود تسجيل التاجر المباشر ⚡
              </span>
              <h3 className="text-lg font-black text-white">رابط وباركود تسجيل التاجر</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
                يفتح للتاجر نموذج التسجيل الفوري مع تثبيت كودك <strong className="text-amber-400 font-mono">({partnerRefCode})</strong> تلقائياً ليُحتسب العميل لك فور تسجيله.
              </p>

              <div className="p-4 bg-white rounded-2xl w-48 h-48 mx-auto shadow-xl flex items-center justify-center border-2 border-amber-500/30 my-4">
                <QRCodeSVG value={directJoinLink} size={165} level="H" includeMargin={true} />
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-amber-500/20 font-mono text-xs text-amber-400 break-all select-all text-left" dir="ltr">
                {directJoinLink}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => copyText(directJoinLink, 'full-direct-join-link')}
                className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              >
                {copiedKey === 'full-direct-join-link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedKey === 'full-direct-join-link' ? 'تم النسخ بنجاح!' : 'نسخ رابط التسجيل المباشر'}</span>
              </button>

              <button
                onClick={() => openWhatsApp(`أهلاً بك! سجّل متجرك عبر منظومة RADAR مع كود الشريك [${partnerRefCode}]:\n${directJoinLink}`)}
                className="w-full py-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>مشاركة عبر واتساب</span>
              </button>
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
                          m.is_paid || m.status === 'AWARDED'
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                            : isAchieved
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {m.is_paid || m.status === 'AWARDED' ? 'تم الصرف والتحويل ✅' : isAchieved ? 'محققة جاهزة للصرف 🎁' : 'مقفلة 🔒'}
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
          {/* Dual Commission Tier Rates Banner */}
          <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-purple-500/10 border border-amber-500/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white">نظام العمولات المزدوجة المتكامل (Dual Commissions)</h4>
                <p className="text-xs text-slate-300">أرباح فورية عند التأسيس ودخل سلبي مستمر مع كل تجديد شهري أو سنوي</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="px-3.5 py-1.5 rounded-2xl bg-slate-950/80 border border-amber-500/40 text-xs flex items-center gap-2">
                <span className="text-slate-400">عمولة الاستحواذ (أول اشتراك):</span>
                <strong className="text-amber-400 font-mono font-black text-sm">
                  {Math.round((partner?.acquisition_commission_rate ?? partner?.commission_rate ?? 0.20) * 100)}%
                </strong>
              </div>
              <div className="px-3.5 py-1.5 rounded-2xl bg-slate-950/80 border border-purple-500/40 text-xs flex items-center gap-2">
                <span className="text-slate-400">عمولة التجديد المستمر:</span>
                <strong className="text-purple-400 font-mono font-black text-sm">
                  {Math.round((partner?.recurring_commission_rate ?? 0.10) * 100)}%
                </strong>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/80 border border-emerald-500/30 rounded-3xl p-5 space-y-1">
              <span className="text-xs text-emerald-400 font-medium block">عمولات مكتسبة جاهزة (Available)</span>
              <span className="text-2xl font-black text-emerald-400 font-mono block">
                {commissionsSummary.total_earned} <span className="text-xs">ريال</span>
              </span>
              <span className="text-[10px] text-slate-400 block">مستحقة وجاهزة للصرف الفوري</span>
            </div>

            <div className="bg-slate-900/80 border border-purple-500/30 rounded-3xl p-5 space-y-1">
              <span className="text-xs text-purple-400 font-medium block">المكافآت المحققة (Bonuses)</span>
              <span className="text-2xl font-black text-purple-400 font-mono block">
                {stats?.financials?.bonuses_earned ?? 0} <span className="text-xs">ريال</span>
              </span>
              <span className="text-[10px] text-purple-300/70 block">مكافآت إنجاز أهداف المبيعات</span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-1">
              <span className="text-xs text-slate-400 font-medium block">عمولات ومكافآت مدفوعة (Paid)</span>
              <span className="text-2xl font-black text-white font-mono block">
                {stats?.financials?.paid_commissions ?? commissionsSummary.total_paid} <span className="text-xs">ريال</span>
              </span>
              <span className="text-[10px] text-slate-400 block">تم تحويلها لحسابك البنكي</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-white">دفتر حركات العمولات الشفاف</h4>
                <p className="text-xs text-slate-400">سجل محاسبي آلي غير قابل للتعديل يوثق كل عمولة مع رقم الفاتورة والعملية</p>
              </div>
            </div>

            {commissions.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500 space-y-2">
                <p>لا توجد حركات عمولات مسجلة حتى الآن.</p>
                <p className="text-[11px] text-slate-600">تُسجل العمولات آلياً فور تأسيس واشتراك أو تجديد المتاجر المحولة من خلالك.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400">
                      <th className="py-3.5 px-4">اسم التاجر / المتجر</th>
                      <th className="py-3.5 px-4">نوع العملية ومصدر العمولة</th>
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
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1">
                            {c.commission_type === 'STORE_ACQUISITION' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 w-fit">
                                عمولة استحواذ جديد 🌟
                              </span>
                            ) : c.commission_type === 'SUBSCRIPTION_RENEWAL' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 w-fit">
                                عمولة تجديد دوري 🔄
                              </span>
                            ) : c.commission_type === 'SUBSCRIPTION_UPGRADE' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 w-fit">
                                عمولة ترقية باقة ⚡
                              </span>
                            ) : null}
                            <span className="text-slate-300">{c.qualifying_event}</span>
                            {c.invoice_number && (
                              <span className="text-[10px] font-mono text-slate-500">
                                فاتورة: {c.invoice_number}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-300">{c.basis_amount} ريال</td>
                        <td className="py-4 px-4 font-mono text-amber-400 font-bold">
                          {Math.round(c.commission_rate * 100)}%
                        </td>
                        <td className="py-4 px-4 font-mono text-emerald-400 font-bold text-sm">
                          {c.commission_amount} ريال
                        </td>
                        <td className="py-4 px-4">
                          {(() => {
                            const commStatus = getCommissionStatusArabic(c.status);
                            return (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${commStatus.colorClass}`}>
                                {commStatus.label}
                              </span>
                            );
                          })()}
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
                <span className="text-amber-400 font-bold mt-1 block">
                  {getLeadStatusArabic(selectedLead.status, selectedLead).label}
                </span>
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

      {/* Change PIN Modal */}
      {showChangePinModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">تغيير الرمز السري (PIN)</h3>
                  <p className="text-[11px] text-slate-400">تحديث رمز دخولك الخاص ببوابة الشركاء</p>
                </div>
              </div>
              <button
                onClick={() => setShowChangePinModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pinChangeError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-start gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{pinChangeError}</span>
              </div>
            )}

            {pinChangeSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{pinChangeSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePinSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">الرمز السري الحالي</label>
                <div className="relative">
                  <input
                    type="password"
                    maxLength={8}
                    value={currentPinInput}
                    onChange={(e) => setCurrentPinInput(e.target.value)}
                    placeholder="••••"
                    dir="ltr"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-4 pl-10 py-3 text-xs text-white placeholder-slate-600 outline-none transition text-left tracking-widest font-mono"
                    required
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">الرمز السري الجديد</label>
                <div className="relative">
                  <input
                    type="password"
                    maxLength={8}
                    value={newPinInput}
                    onChange={(e) => setNewPinInput(e.target.value)}
                    placeholder="••••"
                    dir="ltr"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-4 pl-10 py-3 text-xs text-white placeholder-slate-600 outline-none transition text-left tracking-widest font-mono"
                    required
                  />
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-500">مكون من 4 أرقام على الأقل</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">تأكيد الرمز السري الجديد</label>
                <div className="relative">
                  <input
                    type="password"
                    maxLength={8}
                    value={confirmPinInput}
                    onChange={(e) => setConfirmPinInput(e.target.value)}
                    placeholder="••••"
                    dir="ltr"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-4 pl-10 py-3 text-xs text-white placeholder-slate-600 outline-none transition text-left tracking-widest font-mono"
                    required
                  />
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePinModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPin}
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isUpdatingPin ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>حفظ الرمز السري 🔒</span>
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

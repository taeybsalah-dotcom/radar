import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PartnerAccount,
  PartnerCommission,
  PartnerBonusMilestone,
  SalesKitMessage,
  MerchantLead,
} from '../types';
import { getSupabaseClient } from '../lib/supabase';
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
} from 'lucide-react';

interface PartnerDashboardProps {
  onBackToApp?: () => void;
}

export const PartnerDashboard: React.FC<PartnerDashboardProps> = ({ onBackToApp }) => {
  // 1. Auth State
  const [partnerToken, setPartnerToken] = useState<string>(() => {
    return sessionStorage.getItem('RADAR_PARTNER_AUTH_TOKEN') || '';
  });
  const [partner, setPartner] = useState<PartnerAccount | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Login Form State
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [manualTokenInput, setManualTokenInput] = useState('');
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
  const [bonusMilestones, setBonusMilestones] = useState<PartnerBonusMilestone[]>([]);

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

  // Auto-detect existing Supabase session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client.auth.getSession();
          if (data?.session?.access_token && !partnerToken) {
            setPartnerToken(data.session.access_token);
            sessionStorage.setItem('RADAR_PARTNER_AUTH_TOKEN', data.session.access_token);
          }
        }
      } catch (e) {
        console.warn('Failed auto-detecting Supabase session:', e);
      }
    };
    checkSession();
  }, []);

  // Fetch Partner Profile
  const fetchPartnerProfile = useCallback(async () => {
    if (!partnerToken) {
      setLoadingProfile(false);
      return;
    }

    setLoadingProfile(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/partner/me', {
        headers: { Authorization: `Bearer ${partnerToken}` },
      });
      const data = await res.json();

      if (!res.ok || data.success === false) {
        setAuthError(data.error || 'فشل في تحميل بيانات الشريك');
        setPartner(null);
        return;
      }

      setPartner(data.partner);
    } catch (err: any) {
      setAuthError('حدث خطأ في الاتصال بخدمة الشركاء');
      setPartner(null);
    } finally {
      setLoadingProfile(false);
    }
  }, [partnerToken]);

  useEffect(() => {
    fetchPartnerProfile();
  }, [fetchPartnerProfile]);

  // Fetch Stats, Assets, Commissions, Bonuses when authenticated
  useEffect(() => {
    if (!partner || !partnerToken) return;

    const loadDashboardData = async () => {
      setLoadingStats(true);
      try {
        const headers = { Authorization: `Bearer ${partnerToken}` };

        // 1. Stats
        const statsRes = await fetch('/api/partner/stats', { headers });
        const statsData = await statsRes.json();
        if (statsData.success) setStats(statsData.stats);

        // 2. Assets (Sales Kit)
        const assetsRes = await fetch('/api/partner/assets', { headers });
        const assetsData = await assetsRes.json();
        if (assetsData.success) {
          setSalesKit(assetsData.sales_kit || []);
          setStatusTemplates(assetsData.status_templates || {});
          setLogoPitch(assetsData.logo_pitch || null);
        }

        // 3. Commissions
        const commRes = await fetch('/api/partner/commissions', { headers });
        const commData = await commRes.json();
        if (commData.success) {
          setCommissions(commData.commissions || []);
          setCommissionsSummary(commData.summary);
        }

        // 4. Bonuses
        const bonusRes = await fetch('/api/partner/bonuses', { headers });
        const bonusData = await bonusRes.json();
        if (bonusData.success) {
          setBonusMilestones(bonusData.milestones || []);
        }
      } catch (err) {
        console.error('Error loading partner dashboard data:', err);
      } finally {
        setLoadingStats(false);
      }
    };

    loadDashboardData();
  }, [partner, partnerToken]);

  // Fetch Leads with search & pagination
  const fetchLeads = useCallback(
    async (pageToLoad = leadsPage) => {
      if (!partnerToken) return;
      setLoadingLeads(true);

      try {
        const params = new URLSearchParams();
        if (leadsStatusFilter && leadsStatusFilter !== 'ALL') {
          params.set('status', leadsStatusFilter);
        }
        if (leadsSearch.trim()) {
          params.set('q', leadsSearch.trim());
        }
        params.set('page', String(pageToLoad));
        params.set('pageSize', '15');

        const res = await fetch(`/api/partner/leads?${params.toString()}`, {
          headers: { Authorization: `Bearer ${partnerToken}` },
        });
        const data = await res.json();

        if (data.success) {
          setLeads(data.leads || []);
          setTotalLeads(data.total || 0);
          setLeadsPage(data.page || 1);
        }
      } catch (err) {
        console.error('Error fetching partner leads:', err);
      } finally {
        setLoadingLeads(false);
      }
    },
    [partnerToken, leadsStatusFilter, leadsSearch, leadsPage]
  );

  useEffect(() => {
    if (activeTab === 'leads' || activeTab === 'overview') {
      fetchLeads(1);
    }
  }, [activeTab, leadsStatusFilter, fetchLeads]);

  // Handle Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setAuthError(null);

    try {
      if (manualTokenInput.trim()) {
        const tok = manualTokenInput.trim();
        setPartnerToken(tok);
        sessionStorage.setItem('RADAR_PARTNER_AUTH_TOKEN', tok);
        setManualTokenInput('');
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        setAuthError('عميل الاتصال غير مهيأ');
        return;
      }

      const { data, error } = await client.auth.signInWithPassword({
        email: emailInput.trim(),
        password: passwordInput.trim(),
      });

      if (error || !data.session?.access_token) {
        setAuthError(error?.message || 'فشل تسجيل الدخول ببيانات الشريك');
        return;
      }

      setPartnerToken(data.session.access_token);
      sessionStorage.setItem('RADAR_PARTNER_AUTH_TOKEN', data.session.access_token);
      setEmailInput('');
      setPasswordInput('');
    } catch (err: any) {
      setAuthError(err.message || 'حدث خطأ في المصادقة');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('RADAR_PARTNER_AUTH_TOKEN');
    setPartnerToken('');
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
                سجل الدخول بحساب الشريك المعتمد لمتابعة عملائك، أدوات البيع، وأرباحك.
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
              <label className="text-xs font-bold text-slate-300 block">البريد الإلكتروني للشريك</label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="partner@radar.sa"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-600 outline-none transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">كلمة المرور</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-600 outline-none transition"
              />
            </div>

            <div className="text-center text-[11px] text-slate-500 my-1">— أو استخدم رمز الوصول المباشر —</div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 block">رمز وصول الشريك (Partner Token)</label>
              <input
                type="password"
                value={manualTokenInput}
                onChange={(e) => setManualTokenInput(e.target.value)}
                placeholder="أدخل رمز الوصول الخاص بك..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs font-mono text-amber-400 placeholder-slate-600 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isLoggingIn ? 'جاري التحقق...' : 'تسجيل الدخول لبوابة الشريك'}</span>
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

  // Derived Public Link
  const publicLink = typeof window !== 'undefined'
    ? `${window.location.origin}/${partner.slug}`
    : `https://radar.sa/${partner.slug}`;

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
            <p className="text-xs text-slate-400 mt-1 font-mono">
              كود الإحالة: <strong className="text-amber-400 font-bold">{partner.referral_code}</strong> • الرابط: /{partner.slug}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <a
            href={publicLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3.5 py-2 rounded-2xl text-xs font-bold transition"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            <span>عرض صفحتك العامة</span>
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-amber-400" />
                    <span>رابطك والـ QR السريع</span>
                  </h3>
                  <button
                    onClick={() => setActiveTab('qr')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold"
                  >
                    عرض كبير
                  </button>
                </div>

                <div className="flex items-center justify-center p-4 bg-white rounded-2xl w-36 h-36 mx-auto shadow-xl">
                  <QRCodeSVG value={publicLink} size={120} level="M" />
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center font-mono text-xs text-amber-400 break-all select-all">
                  {publicLink}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => copyText(publicLink, 'quick-link')}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  {copiedKey === 'quick-link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey === 'quick-link' ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                </button>

                <button
                  onClick={() => openWhatsApp(`أهلاً بك! اطلع على منظومة RADAR لمتجرك:\n${publicLink}`)}
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
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 text-center shadow-2xl">
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">الباركود الذكي والرابط الشخصي للشريك</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                امسح الـ QR أو شارك الرابط مباشرة مع أصحاب المتاجر لفتح صفحتك الشخصية المعتمدة والتسجيل.
              </p>
            </div>

            {/* Live QR Element */}
            <div ref={qrRef} className="p-6 bg-white rounded-3xl w-56 h-56 mx-auto shadow-2xl flex items-center justify-center border-4 border-amber-500/20">
              <QRCodeSVG value={publicLink} size={190} level="H" includeMargin={true} />
            </div>

            {/* Display Link */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 font-mono text-sm text-amber-400 break-all select-all">
              {publicLink}
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                onClick={() => copyText(publicLink, 'full-qr-link')}
                className="py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20"
              >
                {copiedKey === 'full-qr-link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedKey === 'full-qr-link' ? 'تم النسخ!' : 'نسخ الرابط'}</span>
              </button>

              <button
                onClick={handleDownloadQR}
                className="py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>تحميل الـ QR (SVG)</span>
              </button>

              <button
                onClick={() => shareText(`رابط الشريك المعتمد: ${partner.display_name}`, 'سجّل متجرك عبر منظومة رادار:', publicLink)}
                className="py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4 text-sky-400" />
                <span>مشاركة الرابط</span>
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

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Server,
  PlusCircle,
  KeyRound,
  Power,
  CheckCircle2,
  XCircle,
  Copy,
  Loader2,
  Building,
  Globe,
  Database,
  Palette,
  Phone,
  Upload,
  Image as ImageIcon,
  Terminal,
  Play,
  CheckCheck,
  Code2,
  AlertTriangle,
  ExternalLink,
  Smartphone,
  Sparkles,
  Layers,
  Crown,
  Lock,
  RefreshCw,
  Mail,
  Store,
  ChevronRight,
  ShieldCheck,
  Sliders,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  masterSupabase,
  TenantRecord,
  SovereignWalletsConfig,
  DEFAULT_SOVEREIGN_WALLETS,
  fetchMasterTenants,
  executeMasterKillSwitch,
  executeMasterUpdateTenant,
  executeMasterCreateTenant,
  fetchMasterWalletCredentials,
  saveMasterWalletCredentials,
  testGoogleWalletConfig,
  testApplePassConfig,
  executeMasterSql,
  uploadLogoToStorage,
  SqlExecutionResult,
  SOVEREIGN_MASTER_TOKEN,
  MASTER_SUPABASE_URL,
} from './lib/masterApi';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tenants' | 'wallets' | 'security' | 'sql'>('tenants');
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [wallets, setWallets] = useState<SovereignWalletsConfig>(DEFAULT_SOVEREIGN_WALLETS);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Wallets Testing States
  const [isTestingGoogle, setIsTestingGoogle] = useState(false);
  const [googleTestResult, setGoogleTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingApple, setIsTestingApple] = useState(false);
  const [appleTestResult, setAppleTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingWallets, setIsSavingWallets] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showCertPassword, setShowCertPassword] = useState(false);

  // Domain Test Tool
  const [testDomainInput, setTestDomainInput] = useState('www.sdeemalathr.com');
  const [domainTestResult, setDomainTestResult] = useState<any | null>(null);
  const [isTestingDomain, setIsTestingDomain] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    id: '',
    name: '',
    name_en: '',
    slug: '',
    custom_domain: '',
    tagline: 'منظومة الولاء ونقاط البيع السحابية الذكية',
    support_phone: '+966500000000',
    support_whatsapp: '966500000000',
    support_email: 'support@al-athar.cloud',
    primary_color_hex: '#10B981',
    accent_color_hex: '#0EA5E9',
    logo_url: '/favicon.png',
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantRecord | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    name_en: '',
    custom_domain: '',
    tagline: '',
    support_phone: '',
    support_whatsapp: '',
    support_email: '',
    primary_color_hex: '#F59E0B',
    accent_color_hex: '#10B981',
    logo_url: '',
  });

  // SQL Console
  const [sqlScript, setSqlScript] = useState(`-- ⚡ استعلام سيادي مباشر على قاعدة الأثر
SELECT id, name, slug, custom_domain, status 
FROM public.tenants;`);
  const [sqlResult, setSqlResult] = useState<SqlExecutionResult | null>(null);
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  const [showSqlSetupModal, setShowSqlSetupModal] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    setError(null);
    try {
      const [tenantsList, walletsConfig] = await Promise.all([
        fetchMasterTenants(),
        fetchMasterWalletCredentials(),
      ]);
      setTenants(tenantsList);
      setWallets(walletsConfig);
    } catch (err: any) {
      console.error('Error loading master data:', err);
      setError(err?.message || 'فشل جلب بيانات مركز القيادة');
    } finally {
      setLoading(false);
    }
  }

  // Trigger Kill Switch
  async function handleKillSwitchToggle(tenant: TenantRecord) {
    const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
    const actionWord = nextStatus === 'suspended' ? 'إيقاف فوري (Kill Switch)' : 'إعادة تفعيل';
    if (!confirm(`هل أنت متأكد من تنفيذ ${actionWord} للوكيل "${tenant.name}"؟`)) {
      return;
    }

    setActionLoading(`killswitch-${tenant.id}`);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await executeMasterKillSwitch(tenant.id, nextStatus);
      if (res.success) {
        setSuccessMsg(`تم تغيير حالة الوكيل "${tenant.name}" إلى ${nextStatus === 'active' ? 'نشط' : 'معلّق إدارياً'}`);
        await loadAllData();
      } else {
        setError(res.error || 'فشل تحديث الحالة');
      }
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء تنفيذ الأمر');
    } finally {
      setActionLoading(null);
    }
  }

  // Save Wallets Config
  async function handleSaveWallets() {
    setIsSavingWallets(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await saveMasterWalletCredentials(wallets);
      if (res.success) {
        setSuccessMsg('تم حفظ وتحديث معرفات المحافظ الرقمية السيادية بنجاح في المنظومة الأم! 💳');
      } else {
        setError(res.error || 'فشل حفظ معرفات المحافظ في السحابة');
      }
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء حفظ معرفات المحافظ');
    } finally {
      setIsSavingWallets(false);
    }
  }

  // Test Google Wallet
  function handleTestGoogle() {
    setIsTestingGoogle(true);
    setGoogleTestResult(null);
    setTimeout(() => {
      setIsTestingGoogle(false);
      const res = testGoogleWalletConfig(
        wallets.google_issuer_id,
        wallets.google_client_email,
        wallets.google_private_key
      );
      setGoogleTestResult(res);
    }, 500);
  }

  // Test Apple PassKit
  function handleTestApple() {
    setIsTestingApple(true);
    setAppleTestResult(null);
    setTimeout(() => {
      setIsTestingApple(false);
      const res = testApplePassConfig(
        wallets.apple_pass_type_id,
        wallets.apple_team_id,
        wallets.apple_cert_p12_base64
      );
      setAppleTestResult(res);
    }, 500);
  }

  // Test Domain Lookup
  async function handleTestDomainLookup() {
    setIsTestingDomain(true);
    setDomainTestResult(null);
    try {
      const { data, error } = await masterSupabase.rpc('get_active_tenant_by_domain', {
        p_host: testDomainInput.trim(),
      });
      if (error) {
        setDomainTestResult({ error: error.message });
      } else {
        setDomainTestResult(data);
      }
    } catch (err: any) {
      setDomainTestResult({ error: err?.message || 'فشل الاستعلام' });
    } finally {
      setIsTestingDomain(false);
    }
  }

  // Create Agency Submission
  async function handleCreateTenantSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading('create-tenant');
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await executeMasterCreateTenant(createFormData);
      if (res.success) {
        setSuccessMsg(`تم تدشين الوكيل الاستراتيجي "${createFormData.name}" بنجاح في المنظومة!`);
        setShowCreateModal(false);
        setCreateFormData({
          id: '',
          name: '',
          name_en: '',
          slug: '',
          custom_domain: '',
          tagline: 'منظومة الولاء ونقاط البيع السحابية الذكية',
          support_phone: '+966500000000',
          support_whatsapp: '966500000000',
          support_email: 'support@al-athar.cloud',
          primary_color_hex: '#10B981',
          accent_color_hex: '#0EA5E9',
          logo_url: '/favicon.png',
        });
        await loadAllData();
      } else {
        setError(res.error || 'فشل تدشين الوكيل');
      }
    } catch (err: any) {
      setError(err?.message || 'خطأ أثناء إنشاء الوكيل');
    } finally {
      setActionLoading(null);
    }
  }

  // Edit Agency Submission
  function openEditModal(tenant: TenantRecord) {
    setEditTarget(tenant);
    setEditFormData({
      name: tenant.name,
      name_en: tenant.name_en || '',
      custom_domain: tenant.custom_domain || '',
      tagline: tenant.tagline || '',
      support_phone: tenant.support_phone || '',
      support_whatsapp: tenant.support_whatsapp || '',
      support_email: tenant.support_email || '',
      primary_color_hex: tenant.primary_color_hex || '#F59E0B',
      accent_color_hex: tenant.accent_color_hex || '#10B981',
      logo_url: tenant.logo_url || '',
    });
    setShowEditModal(true);
  }

  async function handleEditTenantSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;

    setActionLoading(`edit-${editTarget.id}`);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await executeMasterUpdateTenant(editTarget.id, editFormData);
      if (res.success) {
        setSuccessMsg(`تم تحديث هوية ونطاق الوكيل "${editFormData.name}" بنجاح!`);
        setShowEditModal(false);
        await loadAllData();
      } else {
        setError(res.error || 'فشل تحديث بيانات الوكيل');
      }
    } catch (err: any) {
      setError(err?.message || 'خطأ أثناء التحديث');
    } finally {
      setActionLoading(null);
    }
  }

  // Execute SQL
  async function handleRunSql() {
    setIsExecutingSql(true);
    setSqlResult(null);
    setError(null);
    try {
      const res = await executeMasterSql(sqlScript);
      setSqlResult(res);
      if (res.success) {
        setSuccessMsg('تم تنفيذ الاستعلام بنجاح');
      } else {
        setError(res.error || 'فشل تنفيذ الاستعلام');
      }
    } catch (err: any) {
      setError(err?.message || 'خطأ أثناء تنفيذ الاستعلام');
    } finally {
      setIsExecutingSql(false);
    }
  }

  // Calculations
  const totalStores = tenants.reduce((acc, t) => acc + (t.stores_count || 0), 0);
  const activeTenantsCount = tenants.filter((t) => t.status === 'active').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Tajawal',sans-serif]">
      {/* 👑 Top Sovereign Header */}
      <header className="border-b border-amber-500/20 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/30">
              <Crown className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  منصة الأثر السحابية <span className="text-amber-400 font-normal text-base">(Al-Athar Core)</span>
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  مركز القيادة والسيادة المركزية
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  متصل بالنواة السحابية الموحدة: <code className="text-slate-300 font-mono">zagpvflyizbmzsbmhnts</code>
                </span>
                <span>•</span>
                <span className="text-slate-400 font-mono">localhost:3001 (Private Local Sovereign Engine)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadAllData}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              title="تحديث البيانات الفوري"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>تدشين وكيل استراتيجي جديد</span>
            </button>
          </div>
        </div>
      </header>

      {/* 🚀 Main Command Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Alerts */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-rose-300 animate-in fade-in">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-emerald-300 animate-in fade-in">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <p className="text-sm font-medium">{successMsg}</p>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* 📊 Executive Sovereign KPI Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1 */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">الوكلاء الاستراتيجيين</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <Building className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{tenants.length}</span>
              <span className="text-xs text-emerald-400 font-bold">({activeTenantsCount} نشط)</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">رادار + سديم الأثر (تناظر 100%)</p>
          </div>

          {/* KPI 2 */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">شبكة المتاجر النشطة</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <Store className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{totalStores}</span>
              <span className="text-xs text-slate-400">متجر سحابي</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">تدار وتصدر بطاقات الولاء مركزياً</p>
          </div>

          {/* KPI 3 */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-sky-500/40 transition relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl group-hover:bg-sky-500/10 transition"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">المحافظ الرقمية المركزية</span>
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
                <Smartphone className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                جاهزة ونشطة 
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Apple PassKit + Google Wallet</p>
          </div>

          {/* KPI 4 */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/40 transition relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">جدار العزل السيادي</span>
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-black text-indigo-400">100% RLS</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">عزل تام للمتاجر والمسوقين والاشتراكات</p>
          </div>
        </div>

        {/* 🧭 Sovereign Tabs Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2.5 transition ${
              activeTab === 'tenants'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>إدارة الوكلاء الاستراتيجيين ({tenants.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('wallets')}
            className={`px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2.5 transition ${
              activeTab === 'wallets'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>بوابة المحافظ الرقمية السيادية (حصرية هنا) 🔒</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2.5 transition ${
              activeTab === 'security'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>فحص النطاقات والأمان السيادي</span>
          </button>

          <button
            onClick={() => setActiveTab('sql')}
            className={`px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2.5 transition ${
              activeTab === 'sql'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>أوامر الـ SQL والتهيئة المركزية</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 🏢 TAB 1: STRATEGIC TENANTS HUB (RADAR & SADEEM & OTHERS) */}
        {/* ========================================================================= */}
        {activeTab === 'tenants' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>منظومة الوكلاء المستقلين (Multi-Tenant Hub)</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    محرك واحد • تناظر تام
                  </span>
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  كل وكيل يتمتع بهوية مستقلة، ونطاق خاص، وتكاملات مستقلة (واتساب، تليجرام، ذكاء اصطناعي)، مع الاستفادة من قاعدة البيانات الموحدة وشهادات المحافظ المركزية.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-amber-400 mb-3" />
                <p className="text-sm">جاري جلب بيانات الوكلاء من النواة السحابية...</p>
              </div>
            ) : tenants.length === 0 ? (
              <div className="p-12 rounded-3xl bg-slate-900/50 border border-slate-800 text-center">
                <Building className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white">لم يتم العثور على وكلاء مسجلين</h3>
                <p className="text-sm text-slate-400 mt-1">تأكد من تشغيل كود المايجريشن الموحد في Supabase.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {tenants.map((tenant) => {
                  const isRadar = tenant.id === 'radar';
                  const isSadeem = tenant.id === 'sadeem';
                  const isSuspended = tenant.status === 'suspended';

                  return (
                    <div
                      key={tenant.id}
                      className={`rounded-3xl bg-slate-900 border transition-all duration-300 flex flex-col justify-between overflow-hidden relative ${
                        isSuspended
                          ? 'border-rose-900/50 bg-rose-950/10'
                          : isRadar
                          ? 'border-amber-500/40 hover:border-amber-400/70 shadow-lg shadow-amber-500/5'
                          : isSadeem
                          ? 'border-emerald-500/40 hover:border-emerald-400/70 shadow-lg shadow-emerald-500/5'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Top Accent Line */}
                      <div
                        className="h-1.5 w-full"
                        style={{
                          backgroundColor: tenant.primary_color_hex || (isRadar ? '#F59E0B' : '#10B981'),
                        }}
                      ></div>

                      <div className="p-6 space-y-6 flex-1">
                        {/* Header: Logo, Name, Badge & Status */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 p-2 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {tenant.logo_url ? (
                                <img
                                  src={tenant.logo_url}
                                  alt={tenant.name}
                                  className="w-full h-full object-contain"
                                  onError={(e) => {
                                    (e.target as any).src = '/favicon.png';
                                  }}
                                />
                              ) : (
                                <Building className="w-7 h-7 text-slate-400" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-xl font-black text-white">{tenant.name}</h3>
                                {isRadar && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    الوكيل المؤسس 👑
                                  </span>
                                )}
                                {isSadeem && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    وكيل استراتيجي معتمد ⭐
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 font-mono mt-0.5">
                                slug: <strong className="text-slate-300">{tenant.slug}</strong> • ID:{' '}
                                <strong className="text-slate-300">{tenant.id}</strong>
                                {tenant.name_en && ` • ${tenant.name_en}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                                isSuspended
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isSuspended ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse'
                                }`}
                              ></span>
                              {isSuspended ? 'موقف إدارياً' : 'نشط ويعمل'}
                            </span>
                          </div>
                        </div>

                        {/* Tagline */}
                        {tenant.tagline && (
                          <p className="text-xs text-slate-300 italic bg-slate-950/50 p-2.5 rounded-xl border border-slate-800">
                            "{tenant.tagline}"
                          </p>
                        )}

                        {/* Domain & URL Box */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-slate-400" />
                            <span>رابط المنصة الرسمي (Custom Domain):</span>
                          </label>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                            <a
                              href={`https://${tenant.custom_domain || (isRadar ? 'myradar.sarl' : 'sdeemalathr.com')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1.5 truncate"
                            >
                              <span>https://{tenant.custom_domain || (isRadar ? 'myradar.sarl' : 'sdeemalathr.com')}</span>
                              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                            </a>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `https://${tenant.custom_domain || (isRadar ? 'myradar.sarl' : 'sdeemalathr.com')}`
                                );
                                setSuccessMsg('تم نسخ رابط منصة الوكيل');
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                              title="نسخ الرابط"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Statistics & Colors Details */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                            <span className="text-[11px] text-slate-400 block">المتاجر التابعة</span>
                            <span className="text-lg font-black text-white">{tenant.stores_count || 0} متجر</span>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                            <span className="text-[11px] text-slate-400 block">ألوان الهوية</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className="w-4 h-4 rounded-full border border-slate-700"
                                style={{ backgroundColor: tenant.primary_color_hex || '#F59E0B' }}
                                title="Primary Color"
                              ></span>
                              <span
                                className="w-4 h-4 rounded-full border border-slate-700"
                                style={{ backgroundColor: tenant.accent_color_hex || '#10B981' }}
                                title="Accent Color"
                              ></span>
                              <span className="text-xs font-mono text-slate-400">
                                {tenant.primary_color_hex || '#F59E0B'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Contacts Strip */}
                        <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                          {tenant.support_phone && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3.5 h-3.5 text-slate-500" />
                              {tenant.support_phone}
                            </span>
                          )}
                          {tenant.support_email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              {tenant.support_email}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Sovereign Control Actions Bar */}
                      <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-3">
                        {/* Kill Switch Toggle */}
                        <button
                          onClick={() => handleKillSwitchToggle(tenant)}
                          disabled={actionLoading === `killswitch-${tenant.id}`}
                          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition ${
                            isSuspended
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                              : 'bg-rose-600/90 hover:bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                          <span>{isSuspended ? 'إعادة تفعيل الوكيل' : 'Kill Switch (إيقاف فوري)'}</span>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(tenant)}
                            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition"
                          >
                            <Palette className="w-4 h-4 text-amber-400" />
                            <span>تخصيص الهوية والنطاق</span>
                          </button>

                          <a
                            href={`https://${tenant.custom_domain || (isRadar ? 'myradar.sarl' : 'sdeemalathr.com')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                            title="فتح بوابة الوكيل"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 💳 TAB 2: SOVEREIGN CENTRAL DIGITAL WALLETS (APPLE & GOOGLE) */}
        {/* ========================================================================= */}
        {activeTab === 'wallets' && (
          <div className="space-y-6">
            {/* Top Sovereign Banner */}
            <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-emerald-500/10 border border-amber-500/30 relative overflow-hidden">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40">
                  <Crown className="w-7 h-7" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-white">
                      البنية السيادية لمنصة الأثر السحابية (Al-Athar Core) — المحافظ المركزية
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      مركزية ومفعلة تلقائياً لكافة الوكلاء ✓
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    تدار شهادات <strong>Apple PassKit</strong> وحسابات <strong>Google Wallet API</strong> حصرياً وسيادياً هنا في مركز القيادة من المنصة الأم لتوقيع بطاقات الولاء لكافة الوكلاء (رادار، سديم الأثر، وأي وكيل مستقبلي) وتجارهم تلقائياً، دون أن يحتاج أي وكيل لفتح حساب مطور مستقل أو الاطلاع على هذه المفاتيح السرية.
                  </p>
                </div>
              </div>
            </div>

            {/* Wallets Configuration Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* 🌐 Google Wallet Gateway */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 flex flex-col justify-between">
                <div className="space-y-6">
                  {/* Title & Toggle */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400">
                        <Globe className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">بوابة محفظة قوقل الرسمية</h3>
                        <span className="text-xs text-sky-400 font-mono">Google Wallet API</span>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wallets.google_wallet_enabled}
                        onChange={(e) =>
                          setWallets({ ...wallets, google_wallet_enabled: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  <p className="text-xs text-slate-400">
                    تتيح إصدار بطاقات الولاء الرسمية لهواتف أندرويد وتفعيل زر "Add to Google Wallet" المعتمد.
                  </p>

                  {/* Form Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        معرف المصدر التجاري (Google Wallet Issuer ID) *
                      </label>
                      <input
                        type="text"
                        value={wallets.google_issuer_id}
                        onChange={(e) => setWallets({ ...wallets, google_issuer_id: e.target.value })}
                        placeholder="3388000000023226136"
                        className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        إيميل حساب الخدمة (Service Account Email) *
                      </label>
                      <input
                        type="text"
                        value={wallets.google_client_email}
                        onChange={(e) => setWallets({ ...wallets, google_client_email: e.target.value })}
                        placeholder="sadim-504@sadim-512923.iam.gserviceaccount.com"
                        className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                          <span>المفتاح الخاص المشفر لـ JWT (RSA Private Key) *</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPrivateKey(!showPrivateKey)}
                          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                        >
                          {showPrivateKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>{showPrivateKey ? 'إخفاء' : 'عرض'}</span>
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={wallets.google_private_key}
                        onChange={(e) => setWallets({ ...wallets, google_private_key: e.target.value })}
                        placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                        className={`w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:border-sky-500 focus:outline-none ${
                          !showPrivateKey ? 'filter blur-[3px] select-none' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Google Test Result */}
                  {googleTestResult && (
                    <div
                      className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                        googleTestResult.success
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {googleTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      )}
                      <span>{googleTestResult.message}</span>
                    </div>
                  )}
                </div>

                {/* Google Test Button */}
                <button
                  type="button"
                  onClick={handleTestGoogle}
                  disabled={isTestingGoogle}
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
                >
                  {isTestingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  <span>فحص جاهزية معرفات قوقل (Google Wallet)</span>
                </button>
              </div>

              {/*  Apple PassKit Gateway */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 flex flex-col justify-between">
                <div className="space-y-6">
                  {/* Title & Toggle */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-800 text-white">
                        <Smartphone className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">بوابة محفظة أبل الرسمية</h3>
                        <span className="text-xs text-slate-400 font-mono">Apple PassKit</span>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wallets.apple_wallet_enabled}
                        onChange={(e) =>
                          setWallets({ ...wallets, apple_wallet_enabled: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  <p className="text-xs text-slate-400">
                    تتيح توقيع بطاقات الولاء الرقمية (pkpass.) لتنزل في تطبيق Wallet بآيفون بضغطة واحدة وتظهر على شاشة القفل عند الاقتراب.
                  </p>

                  {/* Form Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        معرف نوع البطاقة (Pass Type Identifier) *
                      </label>
                      <input
                        type="text"
                        value={wallets.apple_pass_type_id}
                        onChange={(e) => setWallets({ ...wallets, apple_pass_type_id: e.target.value })}
                        placeholder="pass.com.sdeemalathr.loyalty"
                        className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        معرف فريق المطور (Apple Team ID) *
                      </label>
                      <input
                        type="text"
                        value={wallets.apple_team_id}
                        onChange={(e) => setWallets({ ...wallets, apple_team_id: e.target.value })}
                        placeholder="PK42BF79S2"
                        className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        شهادة التوقيع الرقمية (p12 Base64 / Certificate)
                      </label>
                      <input
                        type="password"
                        value={wallets.apple_cert_p12_base64}
                        onChange={(e) => setWallets({ ...wallets, apple_cert_p12_base64: e.target.value })}
                        placeholder="مشفر ومحمي في السيرفر"
                        className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-300">
                          كلمة مرور الشهادة (Certificate Password)
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCertPassword(!showCertPassword)}
                          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                        >
                          {showCertPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>{showCertPassword ? 'إخفاء' : 'عرض'}</span>
                        </button>
                      </div>
                      <input
                        type={showCertPassword ? 'text' : 'password'}
                        value={wallets.apple_cert_password || ''}
                        onChange={(e) => setWallets({ ...wallets, apple_cert_password: e.target.value })}
                        placeholder="كلمة مرور الشهادة إن وجدت"
                        className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Apple Test Result */}
                  {appleTestResult && (
                    <div
                      className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                        appleTestResult.success
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {appleTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      )}
                      <span>{appleTestResult.message}</span>
                    </div>
                  )}
                </div>

                {/* Apple Test Button */}
                <button
                  type="button"
                  onClick={handleTestApple}
                  disabled={isTestingApple}
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
                >
                  {isTestingApple ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                  <span>فحص جاهزية معرفات أبل (Apple PassKit)</span>
                </button>
              </div>
            </div>

            {/* Master Wallets Save Button */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-amber-500/30 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">اعتماد وحفظ التعديلات المركزية</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  سيتم حفظ التغييرات فوراً في قاعدة البيانات السحابية لتكون متاحة لتوقيع كافة بطاقات المتاجر.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSaveWallets}
                disabled={isSavingWallets}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition transform active:scale-95"
              >
                {isSavingWallets ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>حفظ واعتماد المعرفات السيادية للمنظومة</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 🛡️ TAB 3: DOMAIN RESOLUTION & SECURITY AUDIT */}
        {/* ========================================================================= */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Live Domain Normalization & Lookup Tester */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Globe className="w-5 h-5 text-amber-400" />
                    <span>أداة فحص التعرف التلقائي على دومين الوكيل (Live Domain Resolution Test)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    تتحقق الدالة الحية <code className="text-amber-300 font-mono">get_active_tenant_by_domain</code> من إزالة <code className="text-sky-300 font-mono">www.</code> وتطابق الدومين المخصص أو الـ slug لعرض هوية الوكيل الصحيحة بنسبة 100%.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={testDomainInput}
                  onChange={(e) => setTestDomainInput(e.target.value)}
                  placeholder="e.g. www.sdeemalathr.com or myradar.sarl"
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={handleTestDomainLookup}
                  disabled={isTestingDomain}
                  className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm flex items-center gap-2 transition"
                >
                  {isTestingDomain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span>فحص مباشر</span>
                </button>
              </div>

              {domainTestResult && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 mt-3 font-mono text-xs">
                  <span className="text-slate-400 block mb-2 font-sans font-bold">نتيجة الاستعلام الحي:</span>
                  <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(domainTestResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Sovereign Security Firewalls Audit */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>حالة جدار العزل السيادي (Multi-Tenant Isolation Firewalls)</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-xs text-slate-400 block">جدول الوكلاء (tenants)</span>
                  <span className="text-sm font-bold text-emerald-400 mt-1 block">RLS RESTRICTIVE ✓</span>
                  <p className="text-[11px] text-slate-400 mt-1">حماية الحقول السيادية بـ Trigger</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-xs text-slate-400 block">جدول المتاجر (stores)</span>
                  <span className="text-sm font-bold text-emerald-400 mt-1 block">RLS RESTRICTIVE ✓</span>
                  <p className="text-[11px] text-slate-400 mt-1">عزل تام وممنوع نقل المتجر لوكيل آخر</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-xs text-slate-400 block">جدول الاشتراكات</span>
                  <span className="text-sm font-bold text-emerald-400 mt-1 block">RLS RESTRICTIVE ✓</span>
                  <p className="text-[11px] text-slate-400 mt-1">توريث tenant_id تلقائياً من المتجر</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-xs text-slate-400 block">جدول المسوقين والطلبات</span>
                  <span className="text-sm font-bold text-emerald-400 mt-1 block">RLS RESTRICTIVE ✓</span>
                  <p className="text-[11px] text-slate-400 mt-1">كل وكيل يرى مسوقيه وعملائه فقط</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 💻 TAB 4: SOVEREIGN SQL CONSOLE & ROLLOUT */}
        {/* ========================================================================= */}
        {activeTab === 'sql' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-amber-400" />
                    <span>نافذة الأوامر التنفيذية السيادية (Sovereign SQL Console)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    تشغيل مباشر للأوامر الإدارية على قاعدة بيانات الأثر الموحدة عبر التوكن السيادي.
                  </p>
                </div>

                <button
                  onClick={() => setShowSqlSetupModal(true)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition"
                >
                  <Code2 className="w-4 h-4" />
                  <span>عرض كود التأسيس للـ Supabase SQL Editor</span>
                </button>
              </div>

              <div className="space-y-3">
                <textarea
                  rows={6}
                  value={sqlScript}
                  onChange={(e) => setSqlScript(e.target.value)}
                  className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 focus:border-amber-500 focus:outline-none"
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">
                    Token: {SOVEREIGN_MASTER_TOKEN ? `${SOVEREIGN_MASTER_TOKEN.substring(0, 12)}...` : 'غير محدد'}
                  </span>

                  <button
                    onClick={handleRunSql}
                    disabled={isExecutingSql}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition transform active:scale-95"
                  >
                    {isExecutingSql ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    <span>تنفيذ الاستعلام السيادي</span>
                  </button>
                </div>
              </div>

              {sqlResult && (
                <div
                  className={`p-4 rounded-2xl border font-mono text-xs mt-3 ${
                    sqlResult.success
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold">{sqlResult.success ? 'تم بنجاح ✓' : 'فشل الاستعلام ✗'}</span>
                    {sqlResult.durationMs && <span>المدة: {sqlResult.durationMs}ms</span>}
                  </div>
                  {sqlResult.message && <p>{sqlResult.message}</p>}
                  {sqlResult.error && <p className="text-rose-400">{sqlResult.error}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* ➕ MODAL: CREATE STRATEGIC AGENCY */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400">
                  <Building className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">تدشين وكيل استراتيجي جديد</h3>
                  <p className="text-xs text-slate-400">إضافة وكيل متناظر بالكامل مع رادار وسديم في جدول tenants</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTenantSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اسم الوكيل (عربي) *</label>
                  <input
                    type="text"
                    required
                    value={createFormData.name}
                    onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
                    placeholder="مثال: أفق الأثر"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الرمز الفريد (slug / id) *</label>
                  <input
                    type="text"
                    required
                    value={createFormData.slug}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                        id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                      })
                    }
                    placeholder="ofooq"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">النطاق المخصص (Custom Domain)</label>
                  <input
                    type="text"
                    value={createFormData.custom_domain}
                    onChange={(e) => setCreateFormData({ ...createFormData, custom_domain: e.target.value })}
                    placeholder="ofooq.sa أو ofooq-alathr.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الاسم بالإنجليزي</label>
                  <input
                    type="text"
                    value={createFormData.name_en}
                    onChange={(e) => setCreateFormData({ ...createFormData, name_en: e.target.value })}
                    placeholder="Ofooq"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">شعار المنظومة (Tagline)</label>
                <input
                  type="text"
                  value={createFormData.tagline}
                  onChange={(e) => setCreateFormData({ ...createFormData, tagline: e.target.value })}
                  placeholder="منظومة الولاء ونقاط البيع السحابية الذكية"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اللون الأساسي (Primary HEX)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={createFormData.primary_color_hex}
                      onChange={(e) => setCreateFormData({ ...createFormData, primary_color_hex: e.target.value })}
                      className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border border-slate-800"
                    />
                    <input
                      type="text"
                      value={createFormData.primary_color_hex}
                      onChange={(e) => setCreateFormData({ ...createFormData, primary_color_hex: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اللون الثانوي (Accent HEX)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={createFormData.accent_color_hex}
                      onChange={(e) => setCreateFormData({ ...createFormData, accent_color_hex: e.target.value })}
                      className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border border-slate-800"
                    />
                    <input
                      type="text"
                      value={createFormData.accent_color_hex}
                      onChange={(e) => setCreateFormData({ ...createFormData, accent_color_hex: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">هاتف الدعم (واتساب)</label>
                  <input
                    type="text"
                    value={createFormData.support_whatsapp}
                    onChange={(e) => setCreateFormData({ ...createFormData, support_whatsapp: e.target.value })}
                    placeholder="966500000000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">إيميل الدعم</label>
                  <input
                    type="email"
                    value={createFormData.support_email}
                    onChange={(e) => setCreateFormData({ ...createFormData, support_email: e.target.value })}
                    placeholder="support@ofooq.cloud"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'create-tenant'}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs flex items-center gap-2"
                >
                  {actionLoading === 'create-tenant' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlusCircle className="w-4 h-4" />
                  )}
                  <span>تدشين الوكيل فوراً</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🎨 MODAL: EDIT AGENCY BRANDING & DOMAIN */}
      {/* ========================================================================= */}
      {showEditModal && editTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400">
                  <Palette className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">تخصيص هوية ونطاق: {editTarget.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {editTarget.id}</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditTenantSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اسم الوكيل (عربي) *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الاسم بالإنجليزي</label>
                  <input
                    type="text"
                    value={editFormData.name_en}
                    onChange={(e) => setEditFormData({ ...editFormData, name_en: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">النطاق المخصص (Custom Domain)</label>
                <input
                  type="text"
                  value={editFormData.custom_domain}
                  onChange={(e) => setEditFormData({ ...editFormData, custom_domain: e.target.value })}
                  placeholder="e.g. sdeemalathr.com (بدون https:// أو www)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">شعار المنظومة (Tagline)</label>
                <input
                  type="text"
                  value={editFormData.tagline}
                  onChange={(e) => setEditFormData({ ...editFormData, tagline: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اللون الأساسي (Primary HEX)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editFormData.primary_color_hex}
                      onChange={(e) => setEditFormData({ ...editFormData, primary_color_hex: e.target.value })}
                      className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border border-slate-800"
                    />
                    <input
                      type="text"
                      value={editFormData.primary_color_hex}
                      onChange={(e) => setEditFormData({ ...editFormData, primary_color_hex: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اللون الثانوي (Accent HEX)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editFormData.accent_color_hex}
                      onChange={(e) => setEditFormData({ ...editFormData, accent_color_hex: e.target.value })}
                      className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border border-slate-800"
                    />
                    <input
                      type="text"
                      value={editFormData.accent_color_hex}
                      onChange={(e) => setEditFormData({ ...editFormData, accent_color_hex: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">هاتف الدعم (واتساب)</label>
                  <input
                    type="text"
                    value={editFormData.support_whatsapp}
                    onChange={(e) => setEditFormData({ ...editFormData, support_whatsapp: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">إيميل الدعم</label>
                  <input
                    type="email"
                    value={editFormData.support_email}
                    onChange={(e) => setEditFormData({ ...editFormData, support_email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === `edit-${editTarget.id}`}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs flex items-center gap-2"
                >
                  {actionLoading === `edit-${editTarget.id}` ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCheck className="w-4 h-4" />
                  )}
                  <span>حفظ التعديلات في السحابة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📜 MODAL: SQL SETUP SNIPPET */}
      {/* ========================================================================= */}
      {showSqlSetupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Code2 className="w-6 h-6 text-amber-400" />
                <h3 className="text-base font-bold text-white">كود المايجريشن للـ Supabase SQL Editor</h3>
              </div>
              <button
                onClick={() => setShowSqlSetupModal(false)}
                className="p-1 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              انسخ هذا الكود والصقه في محرّر الـ SQL بقاعدة بيانات رادار لتثبيت دوال مركز القيادة والتحكم:
            </p>

            <div className="flex-1 overflow-y-auto bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-emerald-300">
              <pre className="whitespace-pre-wrap">{`-- الملف: supabase/migrations/20261114_al_athar_core_sovereign_master_engine.sql
-- شغّل هذا الكود في Supabase SQL Editor مرة واحدة فقط.`}</pre>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSqlSetupModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                إغلاق
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `-- 🏛️ AL-ATHAR CORE (منصة الأثر السحابية) - SOVEREIGN MASTER CONTROL ENGINE\n-- شغّل الملف: supabase/migrations/20261114_al_athar_core_sovereign_master_engine.sql`
                  );
                  setSuccessMsg('تم نسخ الكود للحافظة');
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold flex items-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                <span>نسخ للحافظة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;

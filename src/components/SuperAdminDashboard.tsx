import React, { useState, useEffect, useRef } from 'react';
import { Store, StoreOnboardingPayload } from '../types';
import { LoyaltyService } from '../lib/supabase';
import { compressImage, CompressionResult } from '../lib/imageCompressor';
import {
  Crown,
  PlusCircle,
  Store as StoreIcon,
  ShieldCheck,
  Globe,
  Smartphone,
  ExternalLink,
  Lock,
  Power,
  Sparkles,
  CheckCircle2,
  Copy,
  Users,
  Palette,
  Phone,
  KeyRound,
  ArrowUpRight,
  TrendingUp,
  Upload,
  Image as ImageIcon,
  Check,
  X,
  Share2,
  Coins,
  MessageSquare,
  DollarSign,
  Edit3,
  Save,
  Trash2,
  AlertTriangle,
  CreditCard,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { SuperAdminLeadsConsole } from './SuperAdminLeadsConsole';
import { SuperAdminPartnersConsole } from './SuperAdminPartnersConsole';
import { SuperAdminBillingConsole } from './SuperAdminBillingConsole';

interface SuperAdminDashboardProps {
  onSelectStore: (store: Store, targetTab?: 'cashier' | 'customer' | 'admin') => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onSelectStore }) => {
  const [activeSubTab, setActiveSubTab] = useState<'stores' | 'leads' | 'partners' | 'billing'>(() => {
    if (typeof window === 'undefined') return 'stores';
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    return tabParam === 'leads' || tabParam === 'partners' || tabParam === 'billing' ? tabParam : 'stores';
  });

  const handleSubTabChange = (newTab: 'stores' | 'leads' | 'partners' | 'billing') => {
    setActiveSubTab(newTab);
    const url = new URL(window.location.href);
    if (newTab === 'leads' || newTab === 'partners' || newTab === 'billing') {
      url.searchParams.set('tab', newTab);
    } else {
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', url.toString());
  };

  const [stores, setStores] = useState<Store[]>([]);
  const [storesAnalytics, setStoresAnalytics] = useState<
    Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoStats, setLogoStats] = useState<CompressionResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const [primaryColor, setPrimaryColor] = useState('#0F172A');
  const [secondaryColor, setSecondaryColor] = useState('#F59E0B');
  const [pointsPerRiyal, setPointsPerRiyal] = useState(1.0);
  const [managerName, setManagerName] = useState('');
  const [managerContact, setManagerContact] = useState('');
  const [managerPin, setManagerPin] = useState('9999');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete Store State
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset Platform State
  const [isResetPlatformModalOpen, setIsResetPlatformModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Edit Store Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editCustomDomain, setEditCustomDomain] = useState('');
  const [editManagerName, setEditManagerName] = useState('');
  const [editManagerContact, setEditManagerContact] = useState('');
  const [editPrimaryColor, setEditPrimaryColor] = useState('#0F172A');
  const [editSecondaryColor, setEditSecondaryColor] = useState('#F59E0B');
  const [editPointsPerRiyal, setEditPointsPerRiyal] = useState(1.0);
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editLogoStats, setEditLogoStats] = useState<CompressionResult | null>(null);
  const [editIsCompressing, setEditIsCompressing] = useState(false);
  const [editIsSaving, setEditIsSaving] = useState(false);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  // Success Onboarding Modal Card State
  const [onboardedResult, setOnboardedResult] = useState<{
    store: Store;
    managerName: string;
    managerPin: string;
    portalUrl: string;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Master Security Gate State (🔒 حماية بوابة المالك برمز رئيسي)
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('RADAR_SUPER_ADMIN_AUTH') === 'true';
  });
  const [masterPinInput, setMasterPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const handleMasterLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = '2026';
    if (masterPinInput.trim() === correctPin) {
      sessionStorage.setItem('RADAR_SUPER_ADMIN_AUTH', 'true');
      setIsAuthenticated(true);
      setPinError(null);
    } else {
      setPinError('رمز المرور الرئيسي غير صحيح (Master PIN)');
    }
  };

  const handleMasterLogout = () => {
    sessionStorage.removeItem('RADAR_SUPER_ADMIN_AUTH');
    setIsAuthenticated(false);
    setMasterPinInput('');
  };

  const handleConfirmDeleteStore = async () => {
    if (!storeToDelete) return;
    setIsDeleting(true);
    try {
      await LoyaltyService.deleteStore(storeToDelete.id);
      setStores((prev) => prev.filter((s) => s.id !== storeToDelete.id));
      setStoreToDelete(null);
    } catch (e) {
      console.error('Failed to delete store', e);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmResetPlatform = async () => {
    setIsResetting(true);
    try {
      await LoyaltyService.resetAllPlatformData();
      setStores([]);
      setStoresAnalytics({});
      setIsResetPlatformModalOpen(false);
    } catch (e) {
      console.error('Failed to reset platform', e);
    } finally {
      setIsResetting(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleOpenEditStore = (storeToEdit: Store) => {
    setEditingStore(storeToEdit);
    setEditName(storeToEdit.name || '');
    setEditSlug(storeToEdit.slug || '');
    setEditCustomDomain(storeToEdit.custom_domain || '');
    setEditManagerName(storeToEdit.manager_name || '');
    setEditManagerContact(storeToEdit.manager_contact || '');
    setEditPrimaryColor(storeToEdit.primary_color || '#0F172A');
    setEditSecondaryColor(storeToEdit.secondary_color || '#F59E0B');
    setEditPointsPerRiyal(storeToEdit.points_per_riyal || 1.0);
    setEditLogoUrl(storeToEdit.logo_url || '');
    setEditLogoStats(null);
    setEditErrorMessage(null);
    setEditSuccessMessage(null);
    setIsEditModalOpen(true);
  };

  const handleEditLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setEditIsCompressing(true);
    try {
      const result = await compressImage(file, 400, 400, 0.8);
      setEditLogoUrl(result.dataUrl);
      setEditLogoStats(result);
    } catch (err) {
      console.error('Failed to compress image:', err);
      setEditErrorMessage('حدث خطأ أثناء معالجة وضغط الصورة');
    } finally {
      setEditIsCompressing(false);
    }
  };

  const handleSaveEditStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore) return;
    if (!editName.trim() || !editSlug.trim()) {
      setEditErrorMessage('اسم المتجر والرابط مطلوبان');
      return;
    }

    setEditIsSaving(true);
    setEditErrorMessage(null);
    setEditSuccessMessage(null);

    try {
      const cleanCustomDomain = editCustomDomain.trim()
        ? editCustomDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
        : null;

      const updated = await LoyaltyService.updateStoreSettings(editingStore.id, {
        name: editName.trim(),
        slug: editSlug.toLowerCase().trim(),
        custom_domain: cleanCustomDomain,
        manager_name: editManagerName.trim() || editingStore.manager_name,
        manager_contact: editManagerContact.trim() || editingStore.manager_contact,
        primary_color: editPrimaryColor,
        secondary_color: editSecondaryColor,
        points_per_riyal: editPointsPerRiyal,
        logo_url: editLogoUrl || editingStore.logo_url,
      });

      if (updated) {
        setStores(stores.map((s) => (s.id === editingStore.id ? updated : s)));
        setEditSuccessMessage('تم حفظ وتحديث هوية وبيانات المتجر والدومين بنجاح! 🚀');
        setTimeout(() => {
          setIsEditModalOpen(false);
        }, 1200);
      }
    } catch (err: any) {
      setEditErrorMessage(err.message || 'حدث خطأ أثناء حفظ التعديلات');
    } finally {
      setEditIsSaving(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadStores();
    }
  }, [isAuthenticated]);

  const loadStores = async () => {
    setLoading(true);
    try {
      const { stores: validStores, analytics } = await LoyaltyService.getSuperAdminStoresSummary();
      setStores(validStores);
      setStoresAnalytics(analytics);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === '') {
      const generatedSlug = val
        .toLowerCase()
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (generatedSlug) setSlug(generatedSlug);
    }
  };

  // معالجة وضغط الصورة المرفوعة من الجوال أو الكمبيوتر
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    try {
      // ضغط الصورة وتصغيرها إلى 400px وبصيغة WebP لتوفير أقصى قدر من الذاكرة
      const result = await compressImage(file, 400, 400, 0.8);
      setLogoUrl(result.dataUrl);
      setLogoStats(result);
    } catch (err) {
      console.error('Failed to compress image:', err);
      setErrorMessage('حدث خطأ أثناء معالجة وضغط الصورة');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleCreateStoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !managerName.trim()) {
      setErrorMessage('يرجى تعبئة الحقول الأساسية (اسم المتجر، الرابط، واسم المدير)');
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const cleanCustomDomain = customDomain.trim()
        ? customDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
        : undefined;

      const payload: StoreOnboardingPayload = {
        name: name.trim(),
        slug: slug.toLowerCase().trim(),
        custom_domain: cleanCustomDomain,
        logo_url:
          logoUrl ||
          'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=150&auto=format&fit=crop&q=80',
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        points_per_riyal: pointsPerRiyal,
        manager_name: managerName.trim(),
        manager_contact: managerContact.trim() || '0500000000',
        manager_pin: managerPin.trim() || '9999',
      };

      const result = await LoyaltyService.createStoreConcierge(payload);

      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 },
        colors: [secondaryColor, '#F59E0B', '#10B981', '#FFFFFF'],
      });

      setOnboardedResult({
        store: result.store,
        managerName: payload.manager_name,
        managerPin: payload.manager_pin,
        portalUrl: `/app/${result.store.slug}`,
      });

      // Reset Form
      setName('');
      setSlug('');
      setCustomDomain('');
      setLogoUrl('');
      setLogoStats(null);
      setManagerName('');
      setManagerContact('');
      setManagerPin('9999');

      await loadStores();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشلت عملية تأسيس المتجر');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleSubscription = async (targetStore: Store) => {
    const updatedStatus = await LoyaltyService.toggleStoreSubscription(
      targetStore.id,
      targetStore.subscription_active
    );
    setStores(
      stores.map((s) =>
        s.id === targetStore.id
          ? {
              ...s,
              subscription_active: updatedStatus,
              status: updatedStatus ? 'active' : 'suspended',
              subscription_status: updatedStatus ? 'active' : 'suspended',
            }
          : s
      )
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 animate-fade-in text-center">
        <div className="rounded-3xl p-8 bg-slate-900/90 border-2 border-amber-500/40 shadow-2xl backdrop-blur-2xl space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl p-1 bg-gradient-to-tr from-cyan-400 via-emerald-400 to-amber-400 shadow-2xl shadow-cyan-500/20">
            <img src="/radar-logo-dark.jpg" alt="RADAR" className="w-full h-full object-cover rounded-[22px]" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-white">بوابة مالك المنصة (Super Admin)</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              هذه المنطقة مخصصة لإدارة المنصة والمتاجر. يرجى إدخال رمز المرور الرئيسي (Master PIN) للمتابعة.
            </p>
          </div>

          <form onSubmit={handleMasterLogin} className="space-y-4">
            <div className="space-y-1.5 text-right">
              <label className="text-xs font-bold text-slate-300 block">رمز المرور الرئيسي (PIN)</label>
              <input
                type="password"
                maxLength={8}
                value={masterPinInput}
                onChange={(e) => {
                  setMasterPinInput(e.target.value);
                  setPinError(null);
                }}
                placeholder="••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3.5 text-center text-lg text-amber-400 font-mono font-bold tracking-widest outline-none transition"
                autoFocus
              />
            </div>

            {pinError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
                {pinError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition flex items-center justify-center gap-2"
            >
              <Crown className="w-4 h-4" />
              <span>تسجيل الدخول للمنصة</span>
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500 font-mono">
            Radar Multi-Tenant Engine • Secured
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10">
      
      {/* 👑 Super Admin Hero Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-slate-900 border-2 border-amber-500/40 p-6 sm:p-10 overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-x-4 rtl:space-x-reverse flex items-start">
            <div className="w-14 h-14 rounded-2xl p-0.5 bg-gradient-to-tr from-cyan-400 via-emerald-400 to-amber-400 shadow-lg shadow-cyan-500/20 flex-shrink-0">
              <img src="/radar-logo-dark.jpg" alt="RADAR" className="w-full h-full object-cover rounded-[14px]" />
            </div>
            <div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  بوابة المالك | Super Admin Dashboard
                </h2>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  Concierge SaaS
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                منصة تأسيس وإدارة المتاجر بنظام White-label مع رفع وضغط الصور التلقائي وعزل RLS الكامل.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="bg-slate-950/80 px-4 py-2.5 rounded-2xl border border-slate-800 text-center">
              <span className="text-[11px] text-slate-400 block">المتاجر النشطة</span>
              <span className="text-xl font-black text-amber-400 font-mono">
                {stores.filter((s) => s.subscription_active).length} / {stores.length}
              </span>
            </div>
            {stores.length > 0 && (
              <button
                onClick={() => setIsResetPlatformModalOpen(true)}
                className="px-3.5 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                title="حذف وتصفير جميع المتاجر والبيانات من المنصة"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تصفير المنصة</span>
              </button>
            )}
            <button
              onClick={handleMasterLogout}
              className="px-3.5 py-2.5 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              title="قفل وتسجيل الخروج"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>قفل 🔒</span>
            </button>
          </div>
        </div>
      </div>

      {/* 🧭 Super Admin Sub-Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => handleSubTabChange('stores')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeSubTab === 'stores'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <StoreIcon className="w-4 h-4" />
          <span>متاجر المنصة والتأسيس ({stores.length})</span>
        </button>

        <button
          onClick={() => handleSubTabChange('leads')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeSubTab === 'leads'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>طلبات التجار الجدد (Leads) 📥</span>
        </button>

        <button
          onClick={() => handleSubTabChange('partners')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeSubTab === 'partners'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Users className="w-4 h-4 text-amber-400" />
          <span>شركاء المبيعات (Sales Partners) 🤝</span>
        </button>

        <button
          onClick={() => handleSubTabChange('billing')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeSubTab === 'billing'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4 text-amber-400" />
          <span>الفوترة والاشتراكات (Billing) 💳</span>
        </button>
      </div>

      {activeSubTab === 'leads' ? (
        <SuperAdminLeadsConsole stores={stores} onSelectStore={onSelectStore} />
      ) : activeSubTab === 'partners' ? (
        <SuperAdminPartnersConsole />
      ) : activeSubTab === 'billing' ? (
        <SuperAdminBillingConsole />
      ) : (
        /* Grid: Onboarding Form (Left) & Live Stores List (Right) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* 📝 Left Form: Concierge Store Onboarding */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-3xl p-6 sm:p-8 border-amber-500/30 space-y-6">
            <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
              <Sparkles className="w-6 h-6 text-amber-400" />
              <h3 className="text-lg font-bold text-white">تأسيس متجر جديد (Concierge Onboarding)</h3>
            </div>

            <form onSubmit={handleCreateStoreSubmit} className="space-y-4">
              
              {/* Store Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  اسم المتجر / العلامة التجارية
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="مثال: دكتور بطاطس 🍟 أو رادار كافيه"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition"
                  required
                />
              </div>

              {/* Unique Slug */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  الرابط المخصص الفريد (Store Slug)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
                    placeholder="dr-batatas"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-3 text-sm font-mono text-amber-400 placeholder-slate-600 outline-none transition"
                    required
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none">
                    /app/{slug || 'slug'}
                  </span>
                </div>
              </div>

              {/* 🌐 Custom Domain */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 block">
                    🌐 الدومين المخصص (Custom Domain - اختياري)
                  </label>
                  <span className="text-[10px] text-slate-500">مثل: vip.batates.com</span>
                </div>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value.toLowerCase().trim())}
                  placeholder="loyalty.brand.com"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-3 text-sm font-mono text-blue-400 placeholder-slate-600 outline-none transition"
                />
              </div>

              {/* 📷 Local File Upload with Auto-Compression */}
              <div className="space-y-2 p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-400 flex items-center space-x-1.5 rtl:space-x-reverse">
                    <ImageIcon className="w-4 h-4 text-amber-400" />
                    <span>شعار المتجر (رفع من جهازك/جوالك):</span>
                  </label>
                  {isCompressing && (
                    <span className="text-[10px] text-amber-300 animate-pulse font-bold">
                      جاري الضغط الفوري... ⚡
                    </span>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />

                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  {logoUrl ? (
                    <div className="relative w-16 h-16 rounded-2xl border border-amber-500/50 p-1 bg-slate-950 flex-shrink-0 group">
                      <img
                        src={logoUrl}
                        alt="Logo Preview"
                        className="w-full h-full object-cover rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setLogoUrl('');
                          setLogoStats(null);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow-md"
                        title="حذف الشعار"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500 flex-shrink-0">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center space-x-1.5 rtl:space-x-reverse transition border border-slate-700"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>{logoUrl ? 'تغيير الصورة' : 'اختر صورة من الجوال أو الكمبيوتر'}</span>
                    </button>

                    {logoStats && (
                      <p className="text-[10px] text-emerald-400 mt-1.5 flex items-center space-x-1 rtl:space-x-reverse">
                        <Check className="w-3 h-3" />
                        <span>
                          تم الضغط بنجاح: من <strong>{logoStats.originalSizeKB} KB</strong> إلى{' '}
                          <strong>{logoStats.compressedSizeKB} KB</strong> (وفّرنا{' '}
                          {logoStats.reductionPercentage}%)
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Manager Details */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <p className="text-xs font-bold text-amber-400 flex items-center space-x-1 rtl:space-x-reverse">
                  <span>👤 بيانات مدير المتجر الأول (Admin Account):</span>
                </p>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-300 block">اسم المدير العام</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="مثال: خالد السالم"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 block">رقم التواصل / الإيميل</label>
                    <input
                      type="text"
                      value={managerContact}
                      onChange={(e) => setManagerContact(e.target.value)}
                      placeholder="0555XXXXXX"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 block">رمز الدخول (PIN)</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={managerPin}
                      onChange={(e) => setManagerPin(e.target.value)}
                      placeholder="9999"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono font-bold tracking-widest text-center outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Brand Customization Colors */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <p className="text-xs font-bold text-amber-400 flex items-center space-x-1 rtl:space-x-reverse">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>تخصيص هوية وألوان المتجر (White-Label Theme):</span>
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">اللون الأساسي (Primary)</label>
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-slate-300">{primaryColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">اللون الثانوي (Secondary)</label>
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-slate-300">{secondaryColor}</span>
                    </div>
                  </div>
                </div>

                {/* Preset Themes */}
                <div className="pt-2 flex flex-wrap gap-1.5">
                  {[
                    { name: 'بطاطس برتقالي', p: '#7C2D12', s: '#F97316' },
                    { name: 'كافيه ذهبي', p: '#0F172A', s: '#F59E0B' },
                    { name: 'لاونج زمردي', p: '#064E3B', s: '#10B981' },
                    { name: 'فاخر بنفسجي', p: '#2E1065', s: '#A855F7' },
                  ].map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setPrimaryColor(preset.p);
                        setSecondaryColor(preset.s);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Points per Riyal */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  معامل النقاط (كم نقطة لكل ريال):
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={pointsPerRiyal}
                  onChange={(e) => setPointsPerRiyal(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-2.5 text-sm font-mono text-amber-400 font-bold outline-none"
                  required
                />
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs">
                  ⚠️ {errorMessage}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-sm sm:text-base shadow-xl shadow-amber-500/25 flex items-center justify-center space-x-2 rtl:space-x-reverse transition disabled:opacity-50"
              >
                {isCreating ? (
                  <span className="inline-block animate-spin">⚡</span>
                ) : (
                  <>
                    <PlusCircle className="w-5 h-5" />
                    <span>تأسيس المتجر وتوليد المفاتيح 🚀</span>
                  </>
                )}
              </button>

            </form>
          </div>
        </div>

        {/* 🏪 Right Section: Live Stores Directory */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card rounded-3xl p-6 sm:p-8 border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                <StoreIcon className="w-6 h-6 text-amber-400" />
                <h3 className="text-lg font-bold text-white">دليل المتاجر في منصة Radar ({stores.length})</h3>
              </div>
            </div>

            <div className="space-y-4">
              {stores.length === 0 ? (
                <div className="p-8 rounded-3xl bg-slate-900/50 border border-dashed border-slate-800 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto text-xl font-bold">
                    🏪
                  </div>
                  <h4 className="text-sm font-bold text-white">لا توجد متاجر مسجلة حالياً (المنصة نظيفة تماماً 🧼)</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    تم تفريغ كافة المتاجر السابقة. يمكنك الآن البدء من جديد وتأسيس متجرك الأول من النموذج الموجود على اليمين.
                  </p>
                </div>
              ) : (
                stores.filter((s): s is Store => Boolean(s && s.id)).map((s) => {
                const stats = (s.id && storesAnalytics[s.id]) || {
                  customerCount: 0,
                  totalSales: 0,
                  totalPoints: 0,
                  staffCount: 1,
                };

                return (
                  <div
                    key={s.id}
                    className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition space-y-4 relative overflow-hidden shadow-xl"
                  >
                    <div
                      className="absolute top-0 right-0 left-0 h-1.5"
                      style={{ background: `linear-gradient(to right, ${s.primary_color || '#0F172A'}, ${s.secondary_color || '#F59E0B'})` }}
                    ></div>

                    {/* Top Store Info & Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                      <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                        {s.logo_url ? (
                          <img
                            src={s.logo_url}
                            alt={s.name}
                            className="w-14 h-14 rounded-2xl object-cover border border-slate-700 shadow-md flex-shrink-0"
                          />
                        ) : (
                          <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl border shadow-inner flex-shrink-0"
                            style={{
                              backgroundColor: s.primary_color || '#0F172A',
                              borderColor: s.secondary_color || '#F59E0B',
                              color: s.secondary_color || '#F59E0B',
                            }}
                          >
                            {(s.name || 'متجر').slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-white text-base sm:text-lg">{s.name}</h4>
                            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                              /{s.slug}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                s.subscription_status === 'suspended' || !s.subscription_active
                                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                  : s.setup_fee_paid
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                              }`}
                            >
                              {s.subscription_status === 'suspended' || !s.subscription_active
                                ? 'معلق 🔴'
                                : s.setup_fee_paid
                                ? 'نشط معتمد 🟢'
                                : 'تجربة (7 أيام) 🎁'}
                            </span>
                            {s.custom_domain && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1 font-bold">
                                <Globe className="w-3 h-3 text-blue-400" />
                                <span>{s.custom_domain}</span>
                              </span>
                            )}
                          </div>
                          
                          {/* Manager Contact & Phone */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
                            <span>المدير: <strong className="text-white">{s.manager_name || 'المدير العام'}</strong></span>
                            <span>•</span>
                            <span className="flex items-center space-x-1 rtl:space-x-reverse text-amber-300 font-mono font-bold" dir="ltr">
                              <Phone className="w-3 h-3 text-amber-400" />
                              <span>{s.manager_contact || '05xxxxxxxx'}</span>
                            </span>
                            <span>•</span>
                            <span className="text-slate-400">المعامل: <strong className="text-emerald-400">{s.points_per_riyal}x</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 rtl:space-x-reverse self-start sm:self-auto">
                        {/* ✏️ Edit Store Details & Branding */}
                        <button
                          onClick={() => handleOpenEditStore(s)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black border border-amber-500/30 transition text-xs font-bold flex items-center space-x-1 rtl:space-x-reverse"
                          title="تعديل بيانات وهوية المتجر والدومين"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>

                        {/* WhatsApp Handover Quick Button */}
                        <button
                          onClick={() => {
                            const adminUrl = s.custom_domain
                              ? `https://${s.custom_domain}/?portal=admin`
                              : `${window.location.origin}/?store=${s.slug}&portal=admin`;
                            const cashierUrl = s.custom_domain
                              ? `https://${s.custom_domain}/?portal=cashier`
                              : `${window.location.origin}/?store=${s.slug}&portal=cashier`;
                            const custUrl = s.custom_domain
                              ? `https://${s.custom_domain}/?portal=customer`
                              : `${window.location.origin}/?store=${s.slug}&portal=customer`;

                            const cleanPhone = (s.manager_contact || '').replace(/\D/g, '');
                            const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;
                            const plainText = `مرحباً بك ${s.name} ⚡\nروابط نظام الولاء والمكافآت (Radar) لمتجركم:\n\n💼 *1. رابط لوحة تحكم وإدارة المتجر (المدير):*\n${adminUrl}\n\n⚡ *2. رابط شاشة الكاشير السريعة (POS):*\n${cashierUrl}\n\n📱 *3. رابط بطاقة ومحفظة الزبائن:*\n${custUrl}`;
                            const encodedMsg = encodeURIComponent(plainText);
                            const waUrl = intlPhone ? `https://wa.me/${intlPhone}?text=${encodedMsg}` : `https://wa.me/?text=${encodedMsg}`;
                            window.open(waUrl, '_blank');
                          }}
                          className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 transition text-xs font-bold"
                          title="إرسال روابط المتجر واللوحة عبر واتساب"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleToggleSubscription(s)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse border transition ${
                            s.subscription_active
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                              : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                          }`}
                          title={s.subscription_active ? 'اضغط لإيقاف المتجر' : 'اضغط لتفعيل المتجر'}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{s.subscription_active ? 'نشط 🟢' : 'موقوف 🔴'}</span>
                        </button>

                        {/* 🗑️ Delete Store Button */}
                        <button
                          onClick={() => setStoreToDelete(s)}
                          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 transition text-xs font-bold"
                          title="حذف المتجر نهائياً مع كافة بياناته"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 📊 Live Store Metrics Grid (بيانات الزوار والمبيعات والنقاط) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                      {/* Visitors / Customers */}
                      <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">العملاء والزوار</span>
                          <span className="text-base font-black text-white font-mono">{stats.customerCount}</span>
                        </div>
                        <Users className="w-4 h-4 text-blue-400" />
                      </div>

                      {/* Total Sales */}
                      <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">إجمالي المبيعات</span>
                          <span className="text-base font-black text-emerald-400 font-mono">{stats.totalSales} <span className="text-[10px] text-emerald-300 font-normal">ر.س</span></span>
                        </div>
                        <DollarSign className="w-4 h-4 text-emerald-400" />
                      </div>

                      {/* Points Distributed */}
                      <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">النقاط المصروفة</span>
                          <span className="text-base font-black text-amber-400 font-mono">{stats.totalPoints} <span className="text-[10px] text-amber-300 font-normal">XP</span></span>
                        </div>
                        <Coins className="w-4 h-4 text-amber-400" />
                      </div>

                      {/* Staff Count */}
                      <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">طاقم العمل</span>
                          <span className="text-base font-black text-purple-400 font-mono">{stats.staffCount}</span>
                        </div>
                        <Users className="w-4 h-4 text-purple-400" />
                      </div>
                    </div>

                    {/* Portal Quick Access Buttons */}
                    <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 text-[11px]">معاينة البوابات كـ:</span>

                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <button
                          onClick={() => onSelectStore(s, 'customer')}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold flex items-center space-x-1 rtl:space-x-reverse transition"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                          <span>بوابة الزبون (PWA)</span>
                        </button>

                        <button
                          onClick={() => onSelectStore(s, 'cashier')}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold flex items-center space-x-1 rtl:space-x-reverse transition"
                        >
                          <Globe className="w-3.5 h-3.5 text-blue-400" />
                          <span>بوابة الكاشير (POS)</span>
                        </button>

                        <button
                          onClick={() => onSelectStore(s, 'admin')}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold flex items-center space-x-1 rtl:space-x-reverse transition"
                        >
                          <StoreIcon className="w-3.5 h-3.5 text-emerald-400" />
                          <span>لوحة التاجر</span>
                        </button>
                      </div>
                    </div>

                  </div>
                );
              }))}
            </div>

          </div>
        </div>

      </div>
      )}

      {/* ✏️ Modal: Edit Store Details & Branding */}
      {isEditModalOpen && editingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="glass-card max-w-2xl w-full rounded-3xl p-6 sm:p-8 border-2 border-amber-500/50 shadow-2xl relative space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                <Edit3 className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="text-lg font-bold text-white">تعديل بيانات وهوية المتجر والدومين</h3>
                  <p className="text-xs text-slate-400">تحديث فوري ينعكس على بوابات الزبائن والكاشير ولوحة التاجر</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditStore} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Store Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">اسم المتجر</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-2.5 text-sm text-white outline-none"
                    required
                  />
                </div>

                {/* Slug */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">الرابط الفريد (Slug)</label>
                  <input
                    type="text"
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value.toLowerCase().trim())}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-2.5 text-sm font-mono text-amber-400 outline-none"
                    required
                  />
                </div>
              </div>

              {/* Custom Domain */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 block">
                    🌐 الدومين المخصص (Custom Domain)
                  </label>
                  <span className="text-[10px] text-slate-500">مثال: vip.batates.com أو loyalty.brand.sa</span>
                </div>
                <input
                  type="text"
                  value={editCustomDomain}
                  onChange={(e) => setEditCustomDomain(e.target.value.toLowerCase().trim())}
                  placeholder="vip.yourdomain.com"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-2.5 text-sm font-mono text-blue-400 outline-none"
                />
              </div>

              {/* Logo Upload */}
              <div className="space-y-2 p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-400 flex items-center space-x-1.5 rtl:space-x-reverse">
                    <ImageIcon className="w-4 h-4 text-amber-400" />
                    <span>تغيير الشعار (رفع مضغوط WebP تلقائياً):</span>
                  </label>
                  {editIsCompressing && (
                    <span className="text-[10px] text-amber-300 animate-pulse font-bold">
                      جاري الضغط الفوري... ⚡
                    </span>
                  )}
                </div>

                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleEditLogoFileChange}
                  className="hidden"
                />

                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  {editLogoUrl ? (
                    <div className="relative w-16 h-16 rounded-2xl border border-amber-500/50 p-1 bg-slate-950 flex-shrink-0 group">
                      <img
                        src={editLogoUrl}
                        alt="Logo Preview"
                        className="w-full h-full object-cover rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditLogoUrl('');
                          setEditLogoStats(null);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow-md"
                        title="حذف الشعار"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500 flex-shrink-0">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={() => editFileInputRef.current?.click()}
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center space-x-1.5 rtl:space-x-reverse transition border border-slate-700"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>{editLogoUrl ? 'تغيير الصورة' : 'اختر صورة من الجوال أو الكمبيوتر'}</span>
                    </button>

                    {editLogoStats && (
                      <p className="text-[10px] text-emerald-400 mt-1.5 flex items-center space-x-1 rtl:space-x-reverse">
                        <Check className="w-3 h-3" />
                        <span>
                          تم الضغط: من <strong>{editLogoStats.originalSizeKB} KB</strong> إلى{' '}
                          <strong>{editLogoStats.compressedSizeKB} KB</strong> (وفّرنا{' '}
                          {editLogoStats.reductionPercentage}%)
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Manager Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">اسم المدير العام</label>
                  <input
                    type="text"
                    value={editManagerName}
                    onChange={(e) => setEditManagerName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-2.5 text-sm text-white outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">رقم جوال المدير (تسجيل الدخول والتواصل)</label>
                  <input
                    type="text"
                    value={editManagerContact}
                    onChange={(e) => setEditManagerContact(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-2.5 text-sm font-mono text-amber-400 outline-none"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Colors & Points */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <p className="text-xs font-bold text-amber-400 flex items-center space-x-1 rtl:space-x-reverse">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>تخصيص هوية وألوان المتجر (White-Label):</span>
                </p>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">اللون الأساسي</label>
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                      <input
                        type="color"
                        value={editPrimaryColor}
                        onChange={(e) => setEditPrimaryColor(e.target.value)}
                        className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-slate-300">{editPrimaryColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">اللون الثانوي</label>
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                      <input
                        type="color"
                        value={editSecondaryColor}
                        onChange={(e) => setEditSecondaryColor(e.target.value)}
                        className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-slate-300">{editSecondaryColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">النقاط لكل ريال</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editPointsPerRiyal}
                      onChange={(e) => setEditPointsPerRiyal(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-emerald-400 font-bold text-center outline-none"
                    />
                  </div>
                </div>

                {/* Preset Themes */}
                <div className="pt-2 flex flex-wrap gap-1.5">
                  {[
                    { name: 'بطاطس برتقالي', p: '#7C2D12', s: '#F97316' },
                    { name: 'كافيه ذهبي', p: '#0F172A', s: '#F59E0B' },
                    { name: 'لاونج زمردي', p: '#064E3B', s: '#10B981' },
                    { name: 'فاخر بنفسجي', p: '#2E1065', s: '#A855F7' },
                  ].map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setEditPrimaryColor(preset.p);
                        setEditSecondaryColor(preset.s);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {editErrorMessage && (
                <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs">
                  ⚠️ {editErrorMessage}
                </div>
              )}

              {editSuccessMessage && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs">
                  ✅ {editSuccessMessage}
                </div>
              )}

              <div className="flex items-center space-x-3 rtl:space-x-reverse pt-2">
                <button
                  type="submit"
                  disabled={editIsSaving}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-sm shadow-xl shadow-amber-500/25 flex items-center justify-center space-x-2 rtl:space-x-reverse transition disabled:opacity-50"
                >
                  {editIsSaving ? (
                    <span className="inline-block animate-spin">⚡</span>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>حفظ التعديلات وتحديث المتجر 💾</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm"
                >
                  إلغاء
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 🎉 Onboarding Success Modal Card */}
      {onboardedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="glass-card max-w-xl w-full rounded-3xl p-6 sm:p-8 border-2 border-emerald-500 shadow-2xl relative space-y-6 my-8">
            
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="w-14 h-14 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-3xl shrink-0">
                🎉
              </div>
              <div>
                <h3 className="text-xl font-black text-white">تم تأسيس المتجر وتسجيله في Supabase!</h3>
                <p className="text-xs text-emerald-400">
                  تم إنشاء حساب المتجر وحساب المدير والروابط المخصصة فورياً بنجاح.
                </p>
              </div>
            </div>

            {/* Links & Credentials Box */}
            <div className="space-y-3 font-mono text-xs">
              
              {/* 1. Merchant Admin Link (Primary & Highlighted) */}
              <div className="p-4 rounded-2xl bg-emerald-950/30 border-2 border-emerald-500/50 space-y-2 shadow-lg shadow-emerald-950/40">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-sm">
                    <StoreIcon className="w-4 h-4" />
                    <span>💼 1. رابط لوحة تحكم وإدارة المتجر (المدير):</span>
                  </span>
                  <button
                    onClick={() => {
                      const url = onboardedResult.store.custom_domain
                        ? `https://${onboardedResult.store.custom_domain}/?portal=admin`
                        : `${window.location.origin}/?store=${onboardedResult.store.slug}&portal=admin`;
                      copyToClipboard(url, 'admin');
                    }}
                    className="px-3 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 hover:text-black text-emerald-300 flex items-center gap-1 text-[11px] font-bold border border-emerald-500/30 transition"
                  >
                    {copiedKey === 'admin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'admin' ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                  </button>
                </div>
                <div className="text-xs text-emerald-200 break-all bg-slate-900/90 p-2.5 rounded-xl border border-emerald-500/30 select-all font-mono font-bold">
                  {onboardedResult.store.custom_domain
                    ? `https://${onboardedResult.store.custom_domain}/?portal=admin`
                    : `${window.location.origin}/?store=${onboardedResult.store.slug}&portal=admin`}
                </div>
                <div className="flex justify-between items-center text-[11px] pt-1 text-slate-300 bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
                  <span>المدير المسؤول: <strong className="text-white">{onboardedResult.managerName}</strong></span>
                  <span>رمز الدخول السري (PIN): <strong className="text-amber-400 font-mono tracking-widest text-sm bg-slate-950 px-2.5 py-1 rounded-lg border border-amber-400/40">{onboardedResult.managerPin}</strong></span>
                </div>
              </div>

              {/* 2. Cashier POS Link */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-blue-400 font-bold flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>⚡ 2. رابط شاشة الكاشير السريعة (POS):</span>
                  </span>
                  <button
                    onClick={() => {
                      const url = onboardedResult.store.custom_domain
                        ? `https://${onboardedResult.store.custom_domain}/?portal=cashier`
                        : `${window.location.origin}/?store=${onboardedResult.store.slug}&portal=cashier`;
                      copyToClipboard(url, 'pos');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 text-[11px]"
                  >
                    {copiedKey === 'pos' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'pos' ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-300 break-all bg-slate-900/90 p-2 rounded-xl border border-slate-800 select-all">
                  {onboardedResult.store.custom_domain
                    ? `https://${onboardedResult.store.custom_domain}/?portal=cashier`
                    : `${window.location.origin}/?store=${onboardedResult.store.slug}&portal=cashier`}
                </div>
              </div>

              {/* 3. Customer Wallet Link */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span>📱 3. رابط بطاقة ومحفظة الزبائن (PWA):</span>
                  </span>
                  <button
                    onClick={() => {
                      const url = onboardedResult.store.custom_domain
                        ? `https://${onboardedResult.store.custom_domain}/?portal=customer`
                        : `${window.location.origin}/?store=${onboardedResult.store.slug}&portal=customer`;
                      copyToClipboard(url, 'cust');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 text-[11px]"
                  >
                    {copiedKey === 'cust' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'cust' ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-300 break-all bg-slate-900/90 p-2 rounded-xl border border-slate-800 select-all">
                  {onboardedResult.store.custom_domain
                    ? `https://${onboardedResult.store.custom_domain}/?portal=customer`
                    : `${window.location.origin}/?store=${onboardedResult.store.slug}&portal=customer`}
                </div>
                <p className="text-[10px] text-slate-400">
                  * هذا الرابط مخصص لنشره للزبائن أو وضعه في البايو أو طباعة باركود الانضمام لبرنامج الولاء.
                </p>
              </div>

            </div>

            {/* Actions */}
            <div className="space-y-3">
              {/* WhatsApp Share Button */}
              <button
                onClick={() => {
                  const adminUrl = onboardedResult.store.custom_domain
                    ? `https://${onboardedResult.store.custom_domain}/?portal=admin`
                    : `${window.location.origin}/?store=${onboardedResult.store.slug}&portal=admin`;
                  const cashierUrl = onboardedResult.store.custom_domain
                    ? `https://${onboardedResult.store.custom_domain}/?portal=cashier`
                    : `${window.location.origin}/?store=${onboardedResult.store.slug}&portal=cashier`;
                  const custUrl = onboardedResult.store.custom_domain
                    ? `https://${onboardedResult.store.custom_domain}/?portal=customer`
                    : `${window.location.origin}/?store=${onboardedResult.store.slug}&portal=customer`;

                  const cleanPhone = (onboardedResult.store.manager_contact || '').replace(/\D/g, '');
                  const intlPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.substring(1) : cleanPhone;

                  const plainText = `مرحباً بك ${onboardedResult.store.name} ⚡\nتم بنجاح تفعيل وتشغيل نظام الولاء والمكافآت (Radar) لمتجركم!\n\n💼 *1. رابط لوحة تحكم وإدارة المتجر (المدير):*\n${adminUrl}\n🔑 رمز الدخول السري (PIN): ${onboardedResult.managerPin}\n(من هنا تدير العروض، النقاط، الرتب، والكاشيرات)\n\n⚡ *2. رابط شاشة الكاشير السريعة (POS):*\n${cashierUrl}\n(شاشة مسح باركود الزبائن وصرف الكوبونات)\n\n📱 *3. رابط بطاقة ومحفظة الزبائن:*\n${custUrl}\n(الرابط المخصص لنشره للزبائن أو وضعه في البايو للتسجيل)\n\nنتمنى لكم تجربة مميزة ومبيعات مضاعفة! 🚀`;
                  
                  const encodedMsg = encodeURIComponent(plainText);
                  const waUrl = intlPhone ? `https://wa.me/${intlPhone}?text=${encodedMsg}` : `https://wa.me/?text=${encodedMsg}`;
                  window.open(waUrl, '_blank');
                }}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse transition shadow-lg"
              >
                <span>💬 إرسال الروابط وبيانات الدخول للتاجر عبر واتساب</span>
              </button>

              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <button
                  onClick={() => {
                    onSelectStore(onboardedResult.store, 'admin');
                    setOnboardedResult(null);
                  }}
                  className="flex-1 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition flex items-center justify-center gap-1.5"
                >
                  <StoreIcon className="w-4 h-4" />
                  <span>الدخول فوراً للوحة التاجر 💼</span>
                </button>

                <button
                  onClick={() => setOnboardedResult(null)}
                  className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm"
                >
                  إغلاق
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 🗑️ Modal: Delete Single Store Confirmation */}
      {storeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="glass-card max-w-md w-full rounded-3xl p-6 sm:p-8 border-2 border-rose-500/50 shadow-2xl relative space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-white">تأكيد حذف المتجر نهائياً</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                هل أنت متأكد من رغبتك في حذف متجر <strong className="text-rose-400">({storeToDelete.name})</strong> وكافة البيانات المرتبطة به؟
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1.5">
              <p className="text-rose-400 font-bold">⚠️ سيتم حذف ما يلي فوراً:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                <li>حسابات الموظفين ومدراء المتجر</li>
                <li>سجلات نقاط الزبائن ومحفظاتهم</li>
                <li>سجل العمليات والطلبات (Audit Logs)</li>
                <li>مستويات العضوية (Tiers) والمكافآت</li>
              </ul>
            </div>

            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteStore}
                className="flex-1 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <span className="inline-block animate-spin">⚡</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>تأكيد الحذف النهائي 🗑️</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setStoreToDelete(null)}
                className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm transition disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ Modal: Reset All Platform Confirmation */}
      {isResetPlatformModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="glass-card max-w-md w-full rounded-3xl p-6 sm:p-8 border-2 border-rose-500/50 shadow-2xl relative space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 className="w-7 h-7" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-white">تصفير المنصة بالكامل (Hard Reset)</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                هل أنت متأكد من حذف <strong className="text-rose-400">جميع المتاجر ({stores.length})</strong> وتفريغ قاعدة البيانات والذاكرة بالكامل؟
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300">
              ⚠️ هذا الإجراء سيعيد المنصة إلى حالتها الصفرية الأولى بدون أي متاجر أو عملاء أو بيانات سابقة.
            </div>

            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <button
                type="button"
                disabled={isResetting}
                onClick={handleConfirmResetPlatform}
                className="flex-1 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isResetting ? (
                  <span className="inline-block animate-spin">⚡</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>تأكيد تصفير كل المنصة 💥</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setIsResetPlatformModalOpen(false)}
                className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm transition disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

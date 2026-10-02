import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Store, StoreOnboardingPayload, MerchantLead, StoreInvoice, UnifiedLifecycleStage, UnifiedStageInfo, resolveUnifiedStage, getStoreUnifiedStage } from '../types';
import { LoyaltyService } from '../lib/supabase';
import { LoyaltyEvents, LoyaltyEventPayload } from '../lib/events';
import { debounce } from '../lib/debounce';
import { useAuth } from '../context/AuthContext';
import { compressImage, CompressionResult } from '../lib/imageCompressor';
import { generateSafeSlug, resolveUniqueStoreSlug } from '../lib/slugUtils';
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
  Receipt,
  CalendarPlus,
  Gift,
  Clock,
  Search,
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

  const [stores, setStores] = useState<Store[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('radar_local_stores');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  const [storesAnalytics, setStoresAnalytics] = useState<
    Record<string, { customerCount: number; totalSales: number; totalPoints: number; staffCount: number }>
  >(() => {
    if (typeof window === 'undefined') return {};
    try {
      const rawStores = localStorage.getItem('radar_local_stores');
      const rawCust = localStorage.getItem('radar_local_customers');
      const rawLogs = localStorage.getItem('radar_local_logs');
      const rawStaff = localStorage.getItem('radar_local_staff');
      if (rawStores) {
        const parsedStores: Store[] = JSON.parse(rawStores);
        const parsedCust = rawCust ? JSON.parse(rawCust) : [];
        const parsedLogs = rawLogs ? JSON.parse(rawLogs) : [];
        const parsedStaff = rawStaff ? JSON.parse(rawStaff) : [];
        const initialMap: Record<string, any> = {};
        for (const s of parsedStores) {
          const sCust = Array.isArray(parsedCust) ? parsedCust.filter((c: any) => c.store_id === s.id).length : 0;
          const sStaff = Array.isArray(parsedStaff) ? parsedStaff.filter((st: any) => st.store_id === s.id).length : 0;
          const sLogs = Array.isArray(parsedLogs) ? parsedLogs.filter((l: any) => l.store_id === s.id) : [];
          initialMap[s.id] = {
            customerCount: sCust,
            staffCount: sStaff,
            totalSales: sLogs.reduce((sum: number, l: any) => sum + (Number(l.purchase_amount) || 0), 0),
            totalPoints: sLogs.reduce((sum: number, l: any) => sum + (l.points_changed > 0 ? l.points_changed : 0), 0),
          };
        }
        return initialMap;
      }
    } catch {}
    return {};
  });

  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    const raw = localStorage.getItem('radar_local_stores');
    return !raw || raw === '[]';
  });
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
  const [activeFoundingLead, setActiveFoundingLead] = useState<MerchantLead | null>(null);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

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

  // 👑 Super Admin Manual Extension & Override Modal State
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideStore, setOverrideStore] = useState<Store | null>(null);
  const [overrideDays, setOverrideDays] = useState<number>(7);
  const [overrideReasonCategory, setOverrideReasonCategory] = useState<
    'SUPPORT_ISSUE' | 'SALES_PROMOTION' | 'PAYMENT_GRACE' | 'VIP_COURTESY' | 'OTHER'
  >('SUPPORT_ISSUE');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [overrideSuccessMessage, setOverrideSuccessMessage] = useState<string | null>(null);
  const [overrideErrorMessage, setOverrideErrorMessage] = useState<string | null>(null);

  const handleOpenOverrideModal = (storeToOverride: Store) => {
    setOverrideStore(storeToOverride);
    setOverrideDays(7);
    setOverrideReasonCategory('SUPPORT_ISSUE');
    setOverrideNotes('');
    setOverrideErrorMessage(null);
    setOverrideSuccessMessage(null);
    setIsOverrideModalOpen(true);
  };

  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideStore) return;
    if (overrideDays <= 0) {
      setOverrideErrorMessage('يرجى تحديد عدد أيام أكبر من صفر');
      return;
    }

    setIsSubmittingOverride(true);
    setOverrideErrorMessage(null);
    setOverrideSuccessMessage(null);

    const categoryLabels: Record<string, string> = {
      SUPPORT_ISSUE: 'تعويض عن مشكلة تقنية أو دعم فني',
      SALES_PROMOTION: 'مكافأة / عرض ترويجي واستقطاب',
      PAYMENT_GRACE: 'مهلة سداد استثنائية مؤقتة',
      VIP_COURTESY: 'مجاملة عميل استراتيجي VIP',
      OTHER: 'أخرى',
    };

    const formattedReason = `[${categoryLabels[overrideReasonCategory] || overrideReasonCategory}] ${
      overrideNotes.trim() ? overrideNotes.trim() : 'تمديد يدوي من الإدارة'
    }`;

    try {
      const res = await LoyaltyService.grantStoreComplimentaryDays(
        overrideStore.id,
        overrideDays,
        formattedReason,
        'SUPER_ADMIN',
        overrideNotes
      );

      if (!res.success || !res.store) {
        setOverrideErrorMessage(res.error || 'فشل تمديد الاشتراك');
        return;
      }

      setStores((prev) => prev.map((s) => (s.id === overrideStore.id ? res.store! : s)));
      setOverrideSuccessMessage(`تم بنجاح منح +${overrideDays} يوماً للمتجر وتوثيق العملية في السجل المالي العام! 🚀`);
      setTimeout(() => {
        setIsOverrideModalOpen(false);
        setOverrideSuccessMessage(null);
      }, 1500);
    } catch (err: any) {
      setOverrideErrorMessage(err.message || 'حدث خطأ أثناء تمديد المتجر');
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { role, login: authLogin, logout: authLogout } = useAuth();

  // Master Security Gate State (🔒 حماية بوابة المالك برمز رئيسي مع استمرارية الجلسة عند التحديث)
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const rawAuth = localStorage.getItem('radar_unified_auth_user');
      if (rawAuth) {
        const parsed = JSON.parse(rawAuth);
        if (parsed?.role === 'super_admin') return true;
      }
    } catch {}
    return (
      role === 'super_admin' ||
      localStorage.getItem('RADAR_SUPER_ADMIN_AUTH') === 'true' ||
      sessionStorage.getItem('RADAR_SUPER_ADMIN_AUTH') === 'true'
    );
  });
  const [masterPinInput, setMasterPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'RADAR';
  }, []);

  useEffect(() => {
    if (role === 'super_admin' && !isAuthenticated) {
      setIsAuthenticated(true);
    }
  }, [role, isAuthenticated]);

  const handleMasterLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = '2026';
    if (masterPinInput.trim() === correctPin) {
      localStorage.setItem('RADAR_SUPER_ADMIN_AUTH', 'true');
      sessionStorage.setItem('RADAR_SUPER_ADMIN_AUTH', 'true');
      authLogin('super_admin', {
        id: 'super_admin_1',
        name: 'مالك المنصة (Super Admin)',
      });
      setIsAuthenticated(true);
      setPinError(null);
    } else {
      setPinError('رمز المرور الرئيسي غير صحيح (Master PIN)');
    }
  };

  const handleMasterLogout = () => {
    authLogout('super_admin');
    localStorage.removeItem('RADAR_SUPER_ADMIN_AUTH');
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

      const safeEditSlug = generateSafeSlug(editSlug.trim());
      const finalUniqueSlug = await resolveUniqueStoreSlug(safeEditSlug, stores, editingStore.id);

      const updated = await LoyaltyService.updateStoreSettings(editingStore.id, {
        name: editName.trim(),
        slug: finalUniqueSlug,
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

  // Financial Log & Invoices State
  const [allInvoices, setAllInvoices] = useState<Record<string, StoreInvoice[]>>({});
  const [selectedStoreForFinancials, setSelectedStoreForFinancials] = useState<Store | null>(null);

  // 🏛️ 5-Stage Status Filter & Search State
  const [storeStageFilter, setStoreStageFilter] = useState<'ALL' | UnifiedLifecycleStage>('ALL');
  const [storeSearchQuery, setStoreSearchQuery] = useState('');

  const handleUpdateStoreStage = async (targetStore: Store, newStage: UnifiedLifecycleStage) => {
    try {
      const isPaid = newStage === 'مشترك مدفوع';
      await LoyaltyService.updateStoreSettings(targetStore.id, {
        status: isPaid ? 'active' : (newStage as any),
        subscription_status: isPaid ? 'active' : (targetStore.subscription_status || 'trial'),
        setup_fee_paid: isPaid ? true : targetStore.setup_fee_paid,
        lifecycle_stage: newStage,
      });
      await loadStores();
    } catch (e) {
      console.error('Failed to update store stage', e);
    }
  };

  const loadStores = async () => {
    if (stores.length === 0) {
      setLoading(true);
    }
    try {
      const [{ stores: validStores, analytics }, invs] = await Promise.all([
        LoyaltyService.getSuperAdminStoresSummary(),
        LoyaltyService.getAllInvoices(),
      ]);
      setStores(validStores);
      setStoresAnalytics(analytics);
      setAllInvoices(invs || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const debouncedLoadStores = useMemo(
    () =>
      debounce(() => {
        loadStores();
      }, 300),
    []
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    loadStores();

    const unsubscribe = LoyaltyEvents.listen((event: LoyaltyEventPayload) => {
      if (
        event.type === 'STORE_UPDATED' ||
        event.type === 'PAYMENT_COMPLETED' ||
        event.type === 'SUBSCRIPTION_UPDATED' ||
        event.type === 'LEAD_UPDATED'
      ) {
        debouncedLoadStores();
      }
    });

    return () => {
      unsubscribe();
      debouncedLoadStores.cancel();
    };
  }, [isAuthenticated, debouncedLoadStores]);

  const handleNameChange = async (val: string) => {
    setName(val);
    if (!isSlugManuallyEdited || !slug.trim()) {
      const candidateSlug = generateSafeSlug(val);
      if (candidateSlug) {
        const uniqueSlug = await resolveUniqueStoreSlug(candidateSlug, stores);
        setSlug(uniqueSlug);
      } else {
        setSlug('');
      }
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

  const handleFoundStoreFromLead = async (lead: MerchantLead) => {
    setActiveFoundingLead(lead);
    setName(lead.store_name || '');
    setIsSlugManuallyEdited(false);

    // Generate clean URL-safe transliterated unique English slug (e.g. bin-walia)
    const uniqueSlug = await resolveUniqueStoreSlug(lead.store_name || '', stores);
    setSlug(uniqueSlug);

    setManagerName(lead.manager_name || '');
    setManagerContact(lead.phone || '');
    handleSubTabChange('stores');
  };

  const handleCreateStoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !managerName.trim()) {
      setErrorMessage('يرجى تعبئة الحقول الأساسية (اسم المتجر واسم المدير)');
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const cleanCustomDomain = customDomain.trim()
        ? customDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
        : undefined;

      const rawSlug = slug.trim() || generateSafeSlug(name.trim()) || `store-${Date.now().toString().slice(-4)}`;
      const safeSlug = generateSafeSlug(rawSlug);
      const finalUniqueSlug = await resolveUniqueStoreSlug(safeSlug, stores);

      const payload: StoreOnboardingPayload = {
        name: name.trim(),
        slug: finalUniqueSlug,
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

      // 💰 If founded directly from an existing lead, auto-convert the lead and distribute affiliate commissions
      if (activeFoundingLead) {
        try {
          await LoyaltyService.convertLeadToStore(activeFoundingLead.id, result.store.id);
        } catch (convErr) {
          console.warn('[SuperAdmin] Auto convert lead to store error:', convErr);
        }
        setActiveFoundingLead(null);
      }

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
      setIsSlugManuallyEdited(false);
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
        <SuperAdminLeadsConsole
          stores={stores}
          onSelectStore={onSelectStore}
          onFoundStoreFromLead={handleFoundStoreFromLead}
        />
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

            {/* 🎯 Linked Lead Notification Banner */}
            {activeFoundingLead && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 flex items-center justify-between gap-3 animate-fadeIn">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black">
                      ربط بطلب عميل محتمل 🎯
                    </span>
                    <h4 className="text-xs font-bold text-white">{activeFoundingLead.store_name}</h4>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    المسؤول: <strong>{activeFoundingLead.manager_name}</strong> ({activeFoundingLead.phone})
                    {activeFoundingLead.referral_code && (
                      <span className="mr-2 rtl:ml-2 text-amber-400 font-mono">
                        • كود الشريك: {activeFoundingLead.referral_code}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveFoundingLead(null);
                    setName('');
                    setSlug('');
                    setManagerName('');
                    setManagerContact('');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition shrink-0"
                  title="إلغاء ربط الطلب وتأسيس متجر عام"
                >
                  إلغاء الربط ✕
                </button>
              </div>
            )}

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
                    onChange={(e) => {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'));
                      setIsSlugManuallyEdited(true);
                    }}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                <StoreIcon className="w-6 h-6 text-amber-400" />
                <h3 className="text-lg font-bold text-white">دليل المتاجر في منصة Radar ({stores.length})</h3>
              </div>
            </div>

            {/* 🔍 Search & 5-Stage Filter Bar */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-slate-950/80 p-2 rounded-2xl border border-slate-800">
                <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={storeSearchQuery}
                  onChange={(e) => setStoreSearchQuery(e.target.value)}
                  placeholder="ابحث بالاسم، الرابط الفريد، أو جوال المدير..."
                  className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-full"
                />
                {storeSearchQuery && (
                  <button onClick={() => setStoreSearchQuery('')} className="text-slate-500 hover:text-white p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[
                  { id: 'ALL', label: 'الكل' },
                  { id: 'طلب جديد', label: 'طلب جديد 🆕' },
                  { id: 'جاري التأسيس', label: 'جاري التأسيس ⚙️' },
                  { id: 'تم التأسيس', label: 'تم التأسيس 🚀' },
                  { id: 'تحت المراجعة', label: 'تحت المراجعة ⏳' },
                  { id: 'مشترك مدفوع', label: 'مشترك مدفوع 👑' },
                ].map((tab) => {
                  const count = tab.id === 'ALL'
                    ? stores.length
                    : stores.filter((s) => s && getStoreUnifiedStage(s) === tab.id).length;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setStoreStageFilter(tab.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                        storeStageFilter === tab.id
                          ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className="text-[10px] opacity-75 font-mono">({count})</span>
                    </button>
                  );
                })}
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
                stores
                  .filter((s): s is Store => {
                    if (!s || !s.id) return false;
                    const stage = getStoreUnifiedStage(s);
                    const matchesFilter = storeStageFilter === 'ALL' || stage === storeStageFilter;
                    const q = storeSearchQuery.trim().toLowerCase();
                    const matchesSearch =
                      !q ||
                      s.name.toLowerCase().includes(q) ||
                      (s.slug || '').toLowerCase().includes(q) ||
                      (s.manager_contact || '').includes(q) ||
                      (s.manager_name || '').toLowerCase().includes(q);
                    return matchesFilter && matchesSearch;
                  })
                  .map((s) => {
                const stats = (s.id && storesAnalytics[s.id]) || {
                  customerCount: 0,
                  totalSales: 0,
                  totalPoints: 0,
                  staffCount: 1,
                };
                const storeInvs = (s.id && allInvoices[s.id]) || [];
                const totalPaid = storeInvs.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
                const stageInfo = resolveUnifiedStage(s);

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
                            
                            {/* 🏷️ Unified 5-Stage Status Badge */}
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${stageInfo.badgeClass}`}>
                              <span>{stageInfo.icon}</span>
                              <span>{stageInfo.label}</span>
                            </span>

                            {s.subscription_status === 'suspended' || !s.subscription_active ? (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                معلق 🔴
                              </span>
                            ) : null}

                            {s.subscription_plan && s.subscription_plan !== 'trial' ? (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-purple-400" />
                                <span>{s.subscription_plan}</span>
                              </span>
                            ) : null}
                            {s.in_grace_period && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center gap-1 animate-pulse">
                                <Clock className="w-3 h-3 text-orange-400" />
                                <span>فترة سماح ({s.grace_period_days ?? 3} أيام)</span>
                              </span>
                            )}
                            {s.complimentary_days_granted && s.complimentary_days_granted > 0 ? (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                                <Gift className="w-3 h-3 text-indigo-400" />
                                <span>+{s.complimentary_days_granted} أيام ممنوحة</span>
                              </span>
                            ) : null}
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

                      <div className="flex items-center space-x-2 rtl:space-x-reverse self-start sm:self-auto flex-wrap gap-y-1.5">
                        {/* 🏛️ Quick 5-Stage Status Selector */}
                        <select
                          value={getStoreUnifiedStage(s)}
                          onChange={(e) => handleUpdateStoreStage(s, e.target.value as UnifiedLifecycleStage)}
                          className="bg-slate-950 border border-slate-700 hover:border-amber-500/60 text-[11px] font-bold text-amber-300 rounded-xl px-2.5 py-1.5 outline-none cursor-pointer transition shadow-inner"
                          title="تغيير مرحلة المتجر في خط الأنابيب (يتم التحديث فورياً)"
                        >
                          <option value="طلب جديد" className="bg-slate-900 text-white">طلب جديد 🆕</option>
                          <option value="جاري التأسيس" className="bg-slate-900 text-white">جاري التأسيس ⚙️</option>
                          <option value="تم التأسيس" className="bg-slate-900 text-white">تم التأسيس 🚀</option>
                          <option value="تحت المراجعة" className="bg-slate-900 text-white">تحت المراجعة ⏳</option>
                          <option value="مشترك مدفوع" className="bg-slate-900 text-white">مشترك مدفوع 👑</option>
                        </select>

                        {/* 🎁 Manual Extension / Complimentary Days Button */}
                        <button
                          onClick={() => handleOpenOverrideModal(s)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500 text-indigo-300 hover:text-white border border-indigo-500/30 transition text-xs font-bold flex items-center space-x-1 rtl:space-x-reverse shadow-sm"
                          title="منح أيام إضافية وتمديد يدوي مع توثيق السجل المالي"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          <span>تمديد 🎁</span>
                        </button>

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

                    {/* 💳 Dedicated Financial Log Quick Summary & Action Bar */}
                    <div className="p-3 rounded-2xl bg-slate-950/90 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">
                              {s.subscription_plan && s.subscription_plan !== 'trial' ? s.subscription_plan : 'باقة التجربة والتأسيس'}
                            </span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                              s.setup_fee_paid ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {s.setup_fee_paid ? 'مدفوع ومثبت' : 'قيد التجربة (غير مدفوع)'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 block font-mono mt-0.5">
                            المحصل: <strong className="text-emerald-400 font-bold">{totalPaid.toLocaleString()} ر.س</strong> ({storeInvs.length} فواتير مسجلة)
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedStoreForFinancials(s)}
                        className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/30 transition text-xs font-bold flex items-center justify-center space-x-1.5 rtl:space-x-reverse shadow-sm shrink-0"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>كشف الحساب والمدفوعات ({storeInvs.length})</span>
                      </button>
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

      {/* 💳 Modal: Super Admin Store Financial Log & Invoices Breakdown */}
      {selectedStoreForFinancials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="glass-card max-w-3xl w-full rounded-3xl p-6 sm:p-8 border-2 border-amber-500/50 shadow-2xl relative space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    السجل المالي والمدفوعات لمتجر: {selectedStoreForFinancials.name}
                  </h3>
                  <p className="text-xs text-slate-400">
                    كشف حساب تفصيلي بالباقات، المبالغ المحصلة، بوابات الدفع، وأرقام الفواتير
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStoreForFinancials(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[11px] block">الباقة الحالية</span>
                <span className="text-sm font-black text-amber-400 block truncate">
                  {selectedStoreForFinancials.subscription_plan && selectedStoreForFinancials.subscription_plan !== 'trial'
                    ? selectedStoreForFinancials.subscription_plan
                    : 'فترة تجريبية (بدون باقة)'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {selectedStoreForFinancials.setup_fee_paid ? '🟢 اشتراك نشط' : '🎁 قيد التجربة'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[11px] block">إجمالي المبالغ المحصلة</span>
                <span className="text-lg font-black text-emerald-400 font-mono block">
                  {(allInvoices[selectedStoreForFinancials.id] || [])
                    .filter((i) => i.status === 'paid')
                    .reduce((sum, i) => sum + i.amount, 0)}{' '}
                  ر.س
                </span>
                <span className="text-[10px] text-slate-400">
                  عدد الفواتير: {(allInvoices[selectedStoreForFinancials.id] || []).length}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[11px] block">تاريخ التجديد / الانتهاء</span>
                <span className="text-sm font-black text-white font-mono block">
                  {selectedStoreForFinancials.subscription_end_date
                    ? new Date(selectedStoreForFinancials.subscription_end_date).toLocaleDateString('ar-SA')
                    : '—'}
                </span>
                <span className="text-[10px] text-slate-400">
                  رسوم التجديد: {selectedStoreForFinancials.renewal_amount || 195} ر.س
                </span>
              </div>
            </div>

            {/* Invoices Breakdown Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-400" />
                <span>سجل العمليات والفواتير الضريبية:</span>
              </h4>

              {(!allInvoices[selectedStoreForFinancials.id] || allInvoices[selectedStoreForFinancials.id].length === 0) ? (
                <div className="p-8 rounded-2xl bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500 space-y-2">
                  <CreditCard className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>لا توجد مدفوعات أو فواتير مسجلة لهذا المتجر حتى الآن.</p>
                  <p className="text-[11px]">المتجر قيد التجربة أو بانتظار سداد رسوم التأسيس والاشتراك.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/60 shadow-inner">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400">
                          <th className="py-3 px-3.5">رقم الفاتورة</th>
                          <th className="py-3 px-3.5">الباقة / البيان</th>
                          <th className="py-3 px-3.5">المبلغ</th>
                          <th className="py-3 px-3.5">طريقة الدفع</th>
                          <th className="py-3 px-3.5">معرف المعاملة</th>
                          <th className="py-3 px-3.5">التاريخ والوقت</th>
                          <th className="py-3 px-3.5 text-center">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {allInvoices[selectedStoreForFinancials.id].map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-3.5 font-mono text-amber-400 font-bold">
                              {inv.invoice_number}
                            </td>
                            <td className="py-3 px-3.5 text-white font-medium">
                              {inv.plan_name ||
                                (inv.invoice_type === 'setup'
                                  ? 'رسوم تأسيس المتجر'
                                  : inv.invoice_type === 'upgrade'
                                  ? 'ترقية باقة'
                                  : inv.invoice_type === 'extra_cashier'
                                  ? 'كاشير إضافي'
                                  : 'تجديد اشتراك')}
                            </td>
                            <td className="py-3 px-3.5 font-mono text-emerald-400 font-black text-sm">
                              {inv.amount.toLocaleString()} {inv.currency || 'SAR'}
                            </td>
                            <td className="py-3 px-3.5">
                              <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-mono font-bold text-slate-300 inline-flex items-center gap-1">
                                {inv.payment_method === 'mada'
                                  ? '💳 مدى Mada'
                                  : inv.payment_method === 'visa' || inv.payment_method === 'mastercard' || inv.payment_method === 'credit_card'
                                  ? '💳 فيزا/ماستر'
                                  : inv.payment_method === 'apple_pay'
                                  ? '🍏 Apple Pay'
                                  : inv.gateway === 'sandbox'
                                  ? '🧪 Sandbox'
                                  : inv.payment_method || '💳 بطاقة'}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 font-mono text-slate-500 text-[10px] max-w-[120px] truncate" title={inv.gateway_payment_id}>
                              {inv.gateway_payment_id || '—'}
                            </td>
                            <td className="py-3 px-3.5 font-mono text-slate-400 text-[11px]">
                              {new Date(inv.paid_at || inv.created_at || Date.now()).toLocaleString('ar-SA', {
                                year: 'numeric',
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-3 px-3.5 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                مكتمل ✅
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedStoreForFinancials(null)}
                className="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
              >
                إغلاق الكشف ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎁 Modal: Super Admin Manual Override & Subscription Extension */}
      {isOverrideModalOpen && overrideStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="glass-card max-w-lg w-full rounded-3xl p-6 sm:p-8 border-2 border-indigo-500/50 shadow-2xl relative space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <CalendarPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">منح أيام إضافية وتمديد يدوي</h3>
                  <p className="text-xs text-slate-400">Super Admin Manual Extension & Override</p>
                </div>
              </div>
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Store Header Summary */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block font-sans">المتجر المستهدف:</span>
                <span className="text-base font-black text-white">{overrideStore.name}</span>
                <span className="text-xs text-amber-400 font-mono block mt-0.5">/{overrideStore.slug}</span>
              </div>
              <div className="text-left">
                <span className="text-[11px] text-slate-400 block">نهاية الاشتراك الحالية:</span>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {overrideStore.subscription_end_date
                    ? new Date(overrideStore.subscription_end_date).toLocaleDateString('ar-SA')
                    : 'فترة تجربة'}
                </span>
                {overrideStore.complimentary_days_granted && overrideStore.complimentary_days_granted > 0 ? (
                  <span className="text-[10px] text-indigo-400 font-mono block mt-0.5">
                    (سابقاً: +{overrideStore.complimentary_days_granted} أيام)
                  </span>
                ) : null}
              </div>
            </div>

            {overrideSuccessMessage && (
              <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{overrideSuccessMessage}</span>
              </div>
            )}

            {overrideErrorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2 animate-fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{overrideErrorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmitOverride} className="space-y-4">
              {/* Days Selector Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  عدد الأيام المراد إضافتها وتمديدها:
                </label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[3, 7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setOverrideDays(d)}
                      className={`py-2 px-3 rounded-xl text-xs font-mono font-bold transition border ${
                        overrideDays === d
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      +{d} {d === 3 ? 'أيام' : 'يوماً'}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={overrideDays}
                    onChange={(e) => setOverrideDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:border-indigo-500 outline-none"
                    placeholder="أو أدخل عدد الأيام يدوياً..."
                    required
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">أيام</span>
                </div>
              </div>

              {/* Reason Category */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  تصنيف وسبب التمديد:
                </label>
                <select
                  value={overrideReasonCategory}
                  onChange={(e) => setOverrideReasonCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                >
                  <option value="SUPPORT_ISSUE">تعويض عن مشكلة تقنية أو دعم فني (SUPPORT_ISSUE)</option>
                  <option value="SALES_PROMOTION">مكافأة / عرض ترويجي واستقطاب (SALES_PROMOTION)</option>
                  <option value="PAYMENT_GRACE">مهلة سداد استثنائية مؤقتة (PAYMENT_GRACE)</option>
                  <option value="VIP_COURTESY">مجاملة عميل استراتيجي VIP (VIP_COURTESY)</option>
                  <option value="OTHER">أخرى (OTHER)</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  ملاحظات وتفاصيل القرار الإداري:
                </label>
                <textarea
                  rows={2}
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  placeholder="مثال: تم تمديد 7 أيام إضافية كتعويض عن بطء استجابة بوابة الدفع..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:border-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Audit Trail Immutable Ledger Notice */}
              <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-[11px] text-indigo-200 leading-relaxed flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  <strong>سجل مالي رقابي غير قابل للتعديل:</strong> سيتم تدوين قيد تسوية إدارية <code className="font-mono text-amber-300">ADJUSTMENT</code> بقيمة <strong>0.00 ر.س</strong> تلقائياً في السجل المالي لتوثيق هذا القرار مع اسم المشرف والتاريخ.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 rtl:space-x-reverse pt-2">
                <button
                  type="button"
                  onClick={() => setIsOverrideModalOpen(false)}
                  disabled={isSubmittingOverride}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOverride}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition flex items-center space-x-2 rtl:space-x-reverse disabled:opacity-50"
                >
                  {isSubmittingOverride ? (
                    <span>جاري التمديد وتدوين القيد...</span>
                  ) : (
                    <>
                      <CalendarPlus className="w-4 h-4" />
                      <span>تأكيد ومنح الأيام الإضافية ⚡</span>
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

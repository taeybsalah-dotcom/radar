import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Store, MerchantLead, LeadStatus, resolveUnifiedStage, UnifiedLifecycleStage } from '../types';
import { getSupabaseClient, LoyaltyService } from '../lib/supabase';
import {
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  Phone,
  MapPin,
  Building,
  Calendar,
  ExternalLink,
  Sparkles,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  X,
  ChevronLeft,
  ChevronRight,
  Store as StoreIcon,
  RotateCcw,
  Check,
  Copy,
  Tag,
  Share2,
  FileText,
  UserCheck,
  Ban,
  ArrowRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface SuperAdminLeadsConsoleProps {
  stores: Store[];
  onSelectStore?: (store: Store, targetTab?: 'cashier' | 'customer' | 'admin') => void;
  onFoundStoreFromLead?: (lead: MerchantLead) => void;
}

export const SuperAdminLeadsConsole: React.FC<SuperAdminLeadsConsoleProps> = ({
  stores,
  onSelectStore,
  onFoundStoreFromLead,
}) => {
  // 1. Authentication State
  const [adminToken, setAdminToken] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const isSuperMaster = sessionStorage.getItem('RADAR_SUPER_ADMIN_AUTH') === 'true';
      if (isSuperMaster) return '2026';
    }
    return '';
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // 2. Leads Data State
  const [leads, setLeads] = useState<MerchantLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalLeads, setTotalLeads] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 15;

  // 3. Filters State
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // 4. Details Drawer / Modal State
  const [selectedLead, setSelectedLead] = useState<MerchantLead | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [leadNotes, setLeadNotes] = useState('');

  // 5. Transient In-Memory Fencing Tokens (Never persisted to localStorage/sessionStorage/URL)
  const [activeLeases, setActiveLeases] = useState<Record<string, string>>({});

  // 6. Action Processing & Concurrency Lock
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // 7. Conversion Target Store State
  const [targetStoreId, setTargetStoreId] = useState<string>('');
  const [customStoreUuid, setCustomStoreUuid] = useState<string>('');
  const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('إلغاء يدوي من قبل المسؤول');

  // Copy Feedback
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Automatically check for Supabase Auth JWT on mount
  useEffect(() => {
    const detectSession = async () => {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client.auth.getSession();
          if (data?.session?.access_token) {
            setAdminToken(data.session.access_token);
            return;
          }
        }
      } catch (err) {
        console.warn('[LeadsConsole] Failed to auto-detect Supabase session:', err);
      }
    };
    detectSession();
  }, []);

  // Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Leads from Server API (with automatic LoyaltyService fallback)
  const fetchLeads = useCallback(
    async (pageToLoad = currentPage) => {
      setLoading(true);
      setActionError(null);

      const effectiveToken =
        adminToken ||
        (typeof window !== 'undefined' && sessionStorage.getItem('RADAR_SUPER_ADMIN_AUTH') === 'true' ? '2026' : '');

      try {
        const params = new URLSearchParams();
        if (statusFilter && statusFilter !== 'ALL') {
          params.set('status', statusFilter);
        }
        if (debouncedSearch) {
          params.set('q', debouncedSearch);
        }
        params.set('page', String(pageToLoad));
        params.set('pageSize', String(pageSize));

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (effectiveToken) {
          headers['Authorization'] = `Bearer ${effectiveToken}`;
        }

        const res = await fetch(`/api/admin/leads?${params.toString()}`, {
          method: 'GET',
          headers,
        }).catch(() => null);

        if (res && res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.success) {
            setLeads(data.leads || []);
            setTotalLeads(data.total || 0);
            setCurrentPage(data.page || 1);
            setTotalPages(data.totalPages || 1);
            setAuthError(null);

            // If a lead is currently selected, refresh its state from the fetched list
            if (selectedLead) {
              const fresh = (data.leads || []).find((l: MerchantLead) => l.id === selectedLead.id);
              if (fresh) {
                setSelectedLead(fresh);
                setLeadNotes(fresh.notes || '');
              }
            }
            return;
          }
        }

        // Direct Fallback via LoyaltyService.getAllLeads()
        const allLeads = await LoyaltyService.getAllLeads();
        let filtered = allLeads;
        if (statusFilter && statusFilter !== 'ALL') {
          filtered = filtered.filter((l) => {
            const stage = resolveUnifiedStage(l);
            return (
              stage.key === statusFilter ||
              stage.label === statusFilter ||
              l.status === statusFilter ||
              l.lifecycle_stage === statusFilter
            );
          });
        }
        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          filtered = filtered.filter(
            (l) =>
              (l.store_name || '').toLowerCase().includes(q) ||
              (l.manager_name || '').toLowerCase().includes(q) ||
              (l.phone || '').includes(q) ||
              (l.referral_code || '').toLowerCase().includes(q)
          );
        }

        const total = filtered.length;
        const from = (pageToLoad - 1) * pageSize;
        const pageItems = filtered.slice(from, from + pageSize);
        setLeads(pageItems);
        setTotalLeads(total);
        setCurrentPage(pageToLoad);
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)));
        setAuthError(null);

        if (selectedLead) {
          const fresh = allLeads.find((l: MerchantLead) => l.id === selectedLead.id);
          if (fresh) {
            setSelectedLead(fresh);
            setLeadNotes(fresh.notes || '');
          }
        }
      } catch (err: any) {
        console.error('[LeadsConsole] Error fetching leads:', err);
        setActionError('حدث خطأ أثناء استرجاع طلبات التجار');
      } finally {
        setLoading(false);
      }
    },
    [adminToken, statusFilter, debouncedSearch, currentPage, selectedLead]
  );

  // Trigger fetch when filters or token change
  useEffect(() => {
    fetchLeads(currentPage);
  }, [adminToken, statusFilter, debouncedSearch, currentPage]);

  // Handle Supabase Login Form Submit
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      if (manualTokenInput.trim()) {
        // Direct Bearer Token or Master Key
        setAdminToken(manualTokenInput.trim());
        setIsAuthModalOpen(false);
        setManualTokenInput('');
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        setAuthError('عميل Supabase غير مهيأ بالواجهة');
        return;
      }

      if (!adminEmail.trim() || !adminPassword.trim()) {
        setAuthError('يرجى إدخال البريد الإلكتروني وكلمة المرور أو رمز وصول الإدارة');
        return;
      }

      const { data, error } = await client.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword.trim(),
      });

      if (error || !data.session?.access_token) {
        setAuthError(error?.message || 'فشل تسجيل الدخول ببيانات المسؤول');
        return;
      }

      setAdminToken(data.session.access_token);
      setIsAuthModalOpen(false);
      setAdminEmail('');
      setAdminPassword('');
    } catch (err: any) {
      setAuthError(err.message || 'حدث خطأ أثناء مصادقة المسؤول');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Copy helper
  const copyValue = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Open Lead Details Drawer
  const openLeadDetails = (lead: MerchantLead) => {
    setSelectedLead(lead);
    setLeadNotes(lead.notes || '');
    setEditingNotes(false);
    setActionError(null);
    setActionSuccess(null);
    setTargetStoreId('');
    setCustomStoreUuid('');
  };

  // --------------------------------------------------------------------------
  // Lead State Machine & Actions Dispatcher
  // --------------------------------------------------------------------------

  const getEffectiveToken = () => {
    return (
      adminToken ||
      (typeof window !== 'undefined' && sessionStorage.getItem('RADAR_SUPER_ADMIN_AUTH') === 'true' ? '2026' : '')
    );
  };

  // 1. Update Status Action
  const handleUpdateStatus = async (newStatus: LeadStatus) => {
    if (!selectedLead || processingId) return;

    setProcessingId(selectedLead.id);
    setActionError(null);
    setActionSuccess(null);

    const tokenToUse = getEffectiveToken();

    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({
          action: 'UPDATE_STATUS',
          lead_id: selectedLead.id,
          new_status: newStatus,
          notes: leadNotes.trim() || null,
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.success) {
          setActionSuccess(`تم تحديث حالة الطلب إلى [${getStatusLabel(newStatus)}] بنجاح`);
          await fetchLeads(currentPage);
          return;
        }
      }

      // Fallback via LoyaltyService
      await LoyaltyService.updateLeadStatus(selectedLead.id, newStatus, leadNotes.trim() || undefined);
      setActionSuccess(`تم تحديث حالة الطلب إلى [${getStatusLabel(newStatus)}] بنجاح`);
      await fetchLeads(currentPage);
    } catch (err: any) {
      console.error('[LeadsConsole] Update status exception:', err);
      // Fallback via LoyaltyService
      await LoyaltyService.updateLeadStatus(selectedLead.id, newStatus, leadNotes.trim() || undefined);
      setActionSuccess(`تم تحديث حالة الطلب إلى [${getStatusLabel(newStatus)}] بنجاح`);
      await fetchLeads(currentPage);
    } finally {
      setProcessingId(null);
    }
  };

  // 2. Save Notes Action
  const handleSaveNotes = async () => {
    if (!selectedLead || processingId) return;

    setProcessingId(selectedLead.id);
    setActionError(null);

    const tokenToUse = getEffectiveToken();

    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({
          action: 'UPDATE_STATUS',
          lead_id: selectedLead.id,
          new_status: selectedLead.status,
          notes: leadNotes.trim() || null,
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.success) {
          setActionSuccess('تم حفظ الملاحظات بنجاح');
          setEditingNotes(false);
          await fetchLeads(currentPage);
          return;
        }
      }

      // Fallback via LoyaltyService
      await LoyaltyService.updateLeadStatus(selectedLead.id, selectedLead.status, leadNotes.trim());
      setActionSuccess('تم حفظ الملاحظات بنجاح');
      setEditingNotes(false);
      await fetchLeads(currentPage);
    } catch (err: any) {
      // Fallback via LoyaltyService
      await LoyaltyService.updateLeadStatus(selectedLead.id, selectedLead.status, leadNotes.trim());
      setActionSuccess('تم حفظ الملاحظات بنجاح');
      setEditingNotes(false);
      await fetchLeads(currentPage);
    } finally {
      setProcessingId(null);
    }
  };

  // 3. Start Conversion Action (Acquire Fencing Lease Token)
  const handleStartConversion = async () => {
    if (!selectedLead || processingId) return;

    setProcessingId(selectedLead.id);
    setActionError(null);
    setActionSuccess(null);

    const tokenToUse = getEffectiveToken();
    const fallbackLeaseId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `lease-${Date.now()}`;

    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({
          action: 'START_CONVERSION',
          lead_id: selectedLead.id,
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.success && data.lease_id) {
          setActiveLeases((prev) => ({
            ...prev,
            [selectedLead.id]: data.lease_id,
          }));
          setActionSuccess('تم حجز الطلب للتأسيس بنجاح! يمكنك الآن ربط المتجر أو إتمامه.');
          await fetchLeads(currentPage);
          return;
        }
      }

      // Fallback via LoyaltyService
      await LoyaltyService.updateLeadStatus(selectedLead.id, 'CONVERTING' as LeadStatus);
      setActiveLeases((prev) => ({
        ...prev,
        [selectedLead.id]: fallbackLeaseId,
      }));
      setActionSuccess('تم حجز الطلب للتأسيس بنجاح! يمكنك الآن ربط المتجر أو إتمامه.');
      await fetchLeads(currentPage);
    } catch (err: any) {
      console.error('[LeadsConsole] Start conversion exception:', err);
      await LoyaltyService.updateLeadStatus(selectedLead.id, 'CONVERTING' as LeadStatus);
      setActiveLeases((prev) => ({
        ...prev,
        [selectedLead.id]: fallbackLeaseId,
      }));
      setActionSuccess('تم حجز الطلب للتأسيس بنجاح! يمكنك الآن ربط المتجر أو إتمامه.');
      await fetchLeads(currentPage);
    } finally {
      setProcessingId(null);
    }
  };

  // 4. Complete Conversion Action
  const handleCompleteConversion = async () => {
    if (!selectedLead || processingId) return;

    const currentLeaseId = activeLeases[selectedLead.id];
    if (!currentLeaseId) {
      setActionError(
        'رمز حجز التأسيس (Fencing Lease) غير متوفر في الذاكرة. يرجى الضغط على "بدء التأسيس" أولاً للحصول على حجز صالح.'
      );
      return;
    }

    const effectiveStoreId = targetStoreId || customStoreUuid.trim();
    if (!effectiveStoreId) {
      setActionError('يرجى تحديد المتجر المراد ربطه أو إدخال معرّف المتجر المنشأ (Store ID)');
      return;
    }

    setProcessingId(selectedLead.id);
    setActionError(null);
    setActionSuccess(null);

    const tokenToUse = getEffectiveToken();

    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({
          action: 'COMPLETE_CONVERSION',
          lead_id: selectedLead.id,
          store_id: effectiveStoreId,
          lease_id: currentLeaseId,
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.success) {
          setActiveLeases((prev) => {
            const copy = { ...prev };
            delete copy[selectedLead.id];
            return copy;
          });
          try {
            confetti({
              particleCount: 150,
              spread: 90,
              origin: { y: 0.6 },
              colors: ['#F59E0B', '#10B981', '#3B82F6', '#FFFFFF'],
            });
          } catch {}
          setActionSuccess('🎉 تم تحويل وتأسيس المتجر بنجاح وربطه بالمنظومة قطعيًا!');
          await fetchLeads(currentPage);
          return;
        }
      }

      // Fallback via LoyaltyService
      await LoyaltyService.convertLeadToStore(selectedLead.id, effectiveStoreId);
      setActiveLeases((prev) => {
        const copy = { ...prev };
        delete copy[selectedLead.id];
        return copy;
      });
      try {
        confetti({
          particleCount: 150,
          spread: 90,
          origin: { y: 0.6 },
          colors: ['#F59E0B', '#10B981', '#3B82F6', '#FFFFFF'],
        });
      } catch {}
      setActionSuccess('🎉 تم تحويل وتأسيس المتجر بنجاح وربطه بالمنظومة قطعيًا!');
      await fetchLeads(currentPage);
    } catch (err: any) {
      console.error('[LeadsConsole] Complete conversion exception:', err);
      await LoyaltyService.convertLeadToStore(selectedLead.id, effectiveStoreId);
      setActiveLeases((prev) => {
        const copy = { ...prev };
        delete copy[selectedLead.id];
        return copy;
      });
      setActionSuccess('🎉 تم تحويل وتأسيس المتجر بنجاح وربطه بالمنظومة قطعيًا!');
      await fetchLeads(currentPage);
    } finally {
      setProcessingId(null);
    }
  };

  // 5. Rollback Conversion Action
  const handleRollbackConversion = async () => {
    if (!selectedLead || processingId) return;

    const currentLeaseId = activeLeases[selectedLead.id];
    if (!currentLeaseId) {
      setActionError('لا يوجد رمز حجز نشط في الذاكرة لهذا الطلب للتراجع عنه');
      setIsRollbackModalOpen(false);
      return;
    }

    setProcessingId(selectedLead.id);
    setActionError(null);
    setActionSuccess(null);

    const tokenToUse = getEffectiveToken();

    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({
          action: 'ROLLBACK_CONVERSION',
          lead_id: selectedLead.id,
          lease_id: currentLeaseId,
          error_message: rollbackReason.trim() || 'Manual rollback by admin',
        }),
      }).catch(() => null);

      setActiveLeases((prev) => {
        const copy = { ...prev };
        delete copy[selectedLead.id];
        return copy;
      });
      setIsRollbackModalOpen(false);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.success) {
          setActionSuccess('تم التراجع عن حجز التأسيس وإعادة الطلب إلى حالة [معتمد]');
          await fetchLeads(currentPage);
          return;
        }
      }

      // Fallback via LoyaltyService
      await LoyaltyService.rollbackLeadConversion(selectedLead.id, rollbackReason.trim());
      setActionSuccess('تم التراجع عن حجز التأسيس وإعادة الطلب إلى حالة [معتمد]');
      await fetchLeads(currentPage);
    } catch (err: any) {
      console.error('[LeadsConsole] Rollback exception:', err);
      await LoyaltyService.rollbackLeadConversion(selectedLead.id, rollbackReason.trim());
      setActiveLeases((prev) => {
        const copy = { ...prev };
        delete copy[selectedLead.id];
        return copy;
      });
      setIsRollbackModalOpen(false);
      setActionSuccess('تم التراجع عن حجز التأسيس وإعادة الطلب إلى حالة [معتمد]');
      await fetchLeads(currentPage);
    } finally {
      setProcessingId(null);
    }
  };

  // Helper status badge using Unified 5-Stage Standard Pipeline
  const getStatusBadge = (itemOrStatus: any) => {
    const item = typeof itemOrStatus === 'object' && itemOrStatus !== null ? itemOrStatus : { status: itemOrStatus };
    const stage = resolveUnifiedStage(item);
    return {
      bg: stage.badgeClass,
      dot: stage.isPaidActive ? 'bg-emerald-400' : 'bg-amber-400',
      label: `${stage.label} ${stage.icon}`,
      stageKey: stage.key,
      stageLabel: stage.label,
    };
  };

  const getStatusLabel = (itemOrStatus: any) => {
    return getStatusBadge(itemOrStatus).label;
  };

  // Summary Metrics (Unified 5-Stage Standard Pipeline)
  const summaryMetrics = useMemo(() => {
    const counts = {
      total: totalLeads,
      new: 0,
      in_setup: 0,
      setup_complete: 0,
      under_review: 0,
      paid_active: 0,
    };
    leads.forEach((l) => {
      const stage = resolveUnifiedStage(l);
      if (stage.key === 'NEW') counts.new++;
      else if (stage.key === 'IN_SETUP') counts.in_setup++;
      else if (stage.key === 'SETUP_COMPLETE') counts.setup_complete++;
      else if (stage.key === 'UNDER_REVIEW') counts.under_review++;
      else if (stage.key === 'PAID_ACTIVE') counts.paid_active++;
    });
    return counts;
  }, [leads, totalLeads]);

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white">إدارة طلبات التجار الجدد</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  Stage 5 Console
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                متابعة طلبات الانضمام القادمة من بوابة التسجيل، إدارة الحالات، وتحويل الـLead إلى متجر بنظام Fencing Lease الآمن.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {adminToken ? (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2 rounded-2xl text-xs font-bold text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>جلسة مسؤول موثقة</span>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="text-[11px] text-slate-400 hover:text-white underline mr-1"
              >
                تغيير
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-2xl text-xs transition shadow-lg shadow-amber-500/20"
            >
              <Lock className="w-4 h-4" />
              <span>تسجيل دخول المسؤول</span>
            </button>
          )}

          <button
            onClick={() => fetchLeads(currentPage)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3.5 py-2 rounded-2xl text-xs font-bold transition disabled:opacity-50"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* 2. Metrics Bar (Unified 5-Stage Pipeline) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900/60 border border-blue-500/20 rounded-2xl p-3.5">
          <span className="text-[11px] text-blue-400 block font-medium">طلب جديد 🆕</span>
          <span className="text-xl font-black text-blue-400 font-mono mt-1 block">{summaryMetrics.new}</span>
        </div>
        <div className="bg-slate-900/60 border border-amber-500/20 rounded-2xl p-3.5">
          <span className="text-[11px] text-amber-400 block font-medium">جاري التأسيس ⚙️</span>
          <span className="text-xl font-black text-amber-300 font-mono mt-1 block">{summaryMetrics.in_setup}</span>
        </div>
        <div className="bg-slate-900/60 border border-teal-500/20 rounded-2xl p-3.5">
          <span className="text-[11px] text-teal-400 block font-medium">تم التأسيس 🚀</span>
          <span className="text-xl font-black text-teal-300 font-mono mt-1 block">{summaryMetrics.setup_complete}</span>
        </div>
        <div className="bg-slate-900/60 border border-purple-500/20 rounded-2xl p-3.5">
          <span className="text-[11px] text-purple-400 block font-medium">تحت المراجعة ⏳</span>
          <span className="text-xl font-black text-purple-300 font-mono mt-1 block">{summaryMetrics.under_review}</span>
        </div>
        <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl p-3.5">
          <span className="text-[11px] text-emerald-400 block font-medium">مشترك مدفوع 👑</span>
          <span className="text-xl font-black text-emerald-300 font-mono mt-1 block">{summaryMetrics.paid_active}</span>
        </div>
      </div>

      {/* 3. Search & Status Tabs Filter */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المتجر، المدير، رقم الجوال، أو كود الإحالة..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-11 pl-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="text-xs font-mono text-slate-400">
            صفحة <span className="text-amber-400 font-bold">{currentPage}</span> من{' '}
            <span className="text-white">{totalPages}</span> ({totalLeads} طلب)
          </div>
        </div>

        {/* Status Filter Tabs (Unified 5-Stage Standard Pipeline) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
          {[
            { id: 'ALL', label: 'الكل' },
            { id: 'NEW', label: 'طلب جديد 🆕' },
            { id: 'IN_SETUP', label: 'جاري التأسيس ⚙️' },
            { id: 'SETUP_COMPLETE', label: 'تم التأسيس 🚀' },
            { id: 'UNDER_REVIEW', label: 'تحت المراجعة ⏳' },
            { id: 'PAID_ACTIVE', label: 'مشترك مدفوع 👑' },
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusFilter(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Leads Table & Content */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-medium">جاري استرجاع طلبات التجار من الخادم...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-500 mx-auto text-xl">
              📭
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">لا توجد طلبات تطابق معايير البحث</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                لم يتم العثور على أي طلبات تجار للحالة المحددة أو الكلمات المفتاحية.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">المتجر والمسؤول</th>
                  <th className="py-3.5 px-4">رقم الجوال</th>
                  <th className="py-3.5 px-4">المدينة / النشاط</th>
                  <th className="py-3.5 px-4">المصدر</th>
                  <th className="py-3.5 px-4">الحالة</th>
                  <th className="py-3.5 px-4">تاريخ الطلب</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {leads.map((lead) => {
                  const badge = getStatusBadge(lead);
                  const isConvertingWithLease = lead.status === 'CONVERTING' && Boolean(activeLeases[lead.id]);

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => openLeadDetails(lead)}
                      className="hover:bg-slate-800/40 transition cursor-pointer group"
                    >
                      {/* Store & Manager */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-bold group-hover:border-amber-500/50 transition">
                            <StoreIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-white block text-sm group-hover:text-amber-300 transition">
                              {lead.store_name}
                            </span>
                            <span className="text-[11px] text-slate-400 block">{lead.manager_name}</span>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-4 px-4 font-mono text-slate-300" dir="ltr">
                        <div className="flex items-center gap-1.5 justify-end">
                          <span>{lead.phone}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyValue(lead.phone, `phone-${lead.id}`);
                            }}
                            className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition"
                            title="نسخ الرقم"
                          >
                            {copiedText === `phone-${lead.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* City & Business Type */}
                      <td className="py-4 px-4 text-slate-300">
                        <div className="flex flex-col">
                          <span>{lead.city || '—'}</span>
                          <span className="text-[11px] text-slate-500">{lead.business_type || '—'}</span>
                        </div>
                      </td>

                      {/* Source & Referral */}
                      <td className="py-4 px-4">
                        {lead.attribution_source === 'REFERRAL' ? (
                          <div className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold">
                            <Tag className="w-3 h-3" />
                            <span>{lead.referral_code || 'إحالة'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-medium">مباشر (Direct)</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                            <span>{badge.label}</span>
                          </span>
                          {isConvertingWithLease && (
                            <span
                              className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold"
                              title="حجز التأسيس نشط بالذاكرة"
                            >
                              🔒 Lease
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Created At */}
                      <td className="py-4 px-4 font-mono text-[11px] text-slate-400">
                        {new Date(lead.created_at).toLocaleDateString('ar-SA', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openLeadDetails(lead);
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition inline-flex items-center gap-1"
                            title="عرض تفاصيل الطلب"
                          >
                            <span>عرض</span>
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>

                          {lead.status !== 'CONVERTED' && onFoundStoreFromLead && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onFoundStoreFromLead(lead);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 text-xs font-black transition inline-flex items-center gap-1 shadow-md shadow-amber-500/10"
                              title="تعبئة بيانات الطلب وتأسيس المتجر فوراً"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>تأسيس</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || loading}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold transition disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronRight className="w-4 h-4" />
              <span>السابق</span>
            </button>

            <span className="text-xs font-mono text-slate-400">
              صفحة {currentPage} من {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || loading}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold transition disabled:opacity-40 flex items-center gap-1"
            >
              <span>التالي</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 6. Lead Details Slide-Over Drawer */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="w-full max-w-xl bg-slate-950 border-r border-slate-800 h-full overflow-y-auto p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-2xl">
            {/* Drawer Header */}
            <div>
              <div className="flex items-start justify-between border-b border-slate-800 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <StoreIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{selectedLead.store_name}</h3>
                    <p className="text-xs text-slate-400">{selectedLead.manager_name}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedLead(null)}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Alert & Feedback */}
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between bg-slate-900 p-3 rounded-2xl border border-slate-800">
                  <span className="text-xs font-bold text-slate-400">الحالة الراهنة:</span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                      getStatusBadge(selectedLead.status).bg
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusBadge(selectedLead.status).dot}`}></span>
                    <span>{getStatusBadge(selectedLead.status).label}</span>
                  </span>
                </div>

                {actionError && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-start gap-2 animate-shake">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{actionError}</span>
                  </div>
                )}

                {actionSuccess && (
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{actionSuccess}</span>
                  </div>
                )}
              </div>

              {/* Lead Details Grid */}
              <div className="mt-6 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">بيانات الطلب والاتصال</h4>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900/70 p-3 rounded-2xl border border-slate-800/80">
                    <span className="text-slate-500 block text-[11px]">رقم الجوال</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-mono text-white font-bold" dir="ltr">
                        {selectedLead.phone}
                      </span>
                      <button
                        onClick={() => copyValue(selectedLead.phone, 'modal-phone')}
                        className="text-slate-400 hover:text-white"
                      >
                        {copiedText === 'modal-phone' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900/70 p-3 rounded-2xl border border-slate-800/80">
                    <span className="text-slate-500 block text-[11px]">المدينة</span>
                    <span className="text-white font-bold mt-1 block">{selectedLead.city || 'غير محدد'}</span>
                  </div>

                  <div className="bg-slate-900/70 p-3 rounded-2xl border border-slate-800/80">
                    <span className="text-slate-500 block text-[11px]">نوع النشاط</span>
                    <span className="text-white font-bold mt-1 block">{selectedLead.business_type || 'غير محدد'}</span>
                  </div>

                  <div className="bg-slate-900/70 p-3 rounded-2xl border border-slate-800/80">
                    <span className="text-slate-500 block text-[11px]">المصدر وكود الإحالة</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-white font-bold">
                        {selectedLead.attribution_source === 'REFERRAL' ? 'إحالة شريك' : 'مباشر'}
                      </span>
                      {selectedLead.referral_code && (
                        <span className="font-mono text-amber-400 font-bold text-[11px]">
                          ({selectedLead.referral_code})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Converted Store Info (if converted) */}
                {selectedLead.status === 'CONVERTED' && selectedLead.converted_store_id && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400">المتجر المربوط في المنظومة:</span>
                      <span className="font-mono text-xs text-white font-bold">
                        {selectedLead.converted_store_id}
                      </span>
                    </div>
                    {stores.find((s) => s.id === selectedLead.converted_store_id) && onSelectStore && (
                      <button
                        onClick={() => {
                          const store = stores.find((s) => s.id === selectedLead.converted_store_id);
                          if (store) onSelectStore(store, 'admin');
                        }}
                        className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>فتح لوحة إدارة المتجر مباشرة</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Conversion Error (if any recorded in lead) */}
                {selectedLead.conversion_error && (
                  <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                    <strong className="block">خطأ سابق في التأسيس:</strong>
                    <span>{selectedLead.conversion_error}</span>
                  </div>
                )}

                {/* Notes Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">ملاحظات الإدارة</h4>
                    {!editingNotes ? (
                      <button
                        onClick={() => setEditingNotes(true)}
                        className="text-xs text-amber-400 hover:text-amber-300 font-bold"
                      >
                        تعديل الملاحظات
                      </button>
                    ) : (
                      <button
                        onClick={handleSaveNotes}
                        disabled={processingId === selectedLead.id}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-bold"
                      >
                        حفظ الملاحظة
                      </button>
                    )}
                  </div>

                  {editingNotes ? (
                    <textarea
                      value={leadNotes}
                      onChange={(e) => setLeadNotes(e.target.value)}
                      placeholder="أدخل أي ملاحظات خاصة بالتواصل أو المتابعة مع هذا التاجر..."
                      rows={3}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl p-3 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                  ) : (
                    <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 min-h-[50px]">
                      {selectedLead.notes || 'لا توجد ملاحظات مسجلة لهذا الطلب حتى الآن.'}
                    </div>
                  )}
                </div>
              </div>

              {/* ------------------------------------------------------------------ */}
              {/* CONVERSION CONTROLS (FENCING LEASE TOKEN FLOW)                      */}
              {/* ------------------------------------------------------------------ */}
              <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>إجراءات المرحلة ودورة حياة التأسيس</span>
                </h4>

                {/* 🚀 Quick Action: Direct Pre-fill Store Founding */}
                {selectedLead.status !== 'CONVERTED' && onFoundStoreFromLead && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        تأسيس المتجر وتعبئة البيانات تلقائياً
                      </span>
                      {selectedLead.referral_code && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900/80 border border-amber-500/30 text-amber-400">
                          كود: {selectedLead.referral_code}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      انقل بيانات المتجر والمدير ورقم التواصل تلقائياً إلى نموذج تأسيس المتاجر لإنشاء المتجر فوراً مع الحفاظ على ربط الشريك.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onFoundStoreFromLead(selectedLead);
                        setSelectedLead(null);
                      }}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>تعبئة وتأسيس متجر جديد من هذا الطلب 🚀</span>
                    </button>
                  </div>
                )}

                {/* State: APPROVED -> Can Start Conversion */}
                {selectedLead.status === 'APPROVED' && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 space-y-3">
                    <div className="space-y-1">
                      <h5 className="text-sm font-bold text-white">الطلب معتمد ومؤهل للتأسيس 🚀</h5>
                      <p className="text-xs text-slate-400">
                        اضغط على "بدء تأسيس المتجر" لحجز حصر التأسيس (Fencing Lease) بشكل آمن ومنع أي تضارب مع مسؤولي المنصة الآخرين.
                      </p>
                    </div>

                    <button
                      onClick={handleStartConversion}
                      disabled={processingId === selectedLead.id}
                      className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {processingId === selectedLead.id ? 'جاري بدء حجز التأسيس...' : 'بدء تأسيس المتجر (Start Conversion)'}
                      </span>
                    </button>
                  </div>
                )}

                {/* State: CONVERTING -> Fencing Lease Active in Memory */}
                {selectedLead.status === 'CONVERTING' && (
                  <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-bold text-yellow-300 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 animate-spin text-yellow-400" />
                          <span>الطلب قيد التأسيس (Converting In-Progress)</span>
                        </h5>
                        {activeLeases[selectedLead.id] && (
                          <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded font-mono font-bold">
                            Lease Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300">
                        الطلب محجوز الآن بواسطة Fencing Token. اختر المتجر المكتمل لربطه بالطلب وإتمام العملية.
                      </p>
                    </div>

                    {/* Target Store Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-300 block">
                        اختر المتجر المؤسس للربط:
                      </label>
                      <select
                        value={targetStoreId}
                        onChange={(e) => {
                          setTargetStoreId(e.target.value);
                          setCustomStoreUuid('');
                        }}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-xs text-white outline-none transition"
                      >
                        <option value="">-- اختر متجر من المنصة --</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.slug})
                          </option>
                        ))}
                      </select>

                      <div className="text-center text-[11px] text-slate-500 my-1">— أو —</div>

                      <input
                        type="text"
                        value={customStoreUuid}
                        onChange={(e) => {
                          setCustomStoreUuid(e.target.value);
                          setTargetStoreId('');
                        }}
                        placeholder="أدخل Store UUID يدوياً (مثال: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-mono text-amber-400 placeholder-slate-600 outline-none transition"
                      />
                    </div>

                    {/* Actions: Complete or Rollback */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={handleCompleteConversion}
                        disabled={
                          processingId === selectedLead.id ||
                          (!targetStoreId && !customStoreUuid.trim()) ||
                          !activeLeases[selectedLead.id]
                        }
                        className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {processingId === selectedLead.id
                            ? 'جاري إتمام التأسيس...'
                            : 'إتمام التأسيس والربط (Complete)'}
                        </span>
                      </button>

                      <button
                        onClick={() => setIsRollbackModalOpen(true)}
                        disabled={processingId === selectedLead.id}
                        className="px-3 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
                        title="تراجع عن التأسيس"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>تراجع</span>
                      </button>
                    </div>

                    {!activeLeases[selectedLead.id] && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                        ⚠️ رمز الحجز (Lease) غير مخزن بالذاكرة المؤقتة (ربما تم تحديث الصفحة). إذا كنت المسؤول الذي بدأ التأسيس وترغب في تجديد الحجز، أعد الضغط على بدء التأسيس.
                      </div>
                    )}
                  </div>
                )}

                {/* State: CONVERTED -> Immutable Terminal State */}
                {selectedLead.status === 'CONVERTED' && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <h5 className="text-sm font-black text-white">متجر مكتمل ومؤسس بنجاح 🎉</h5>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      وصل هذا الطلب إلى حالته النهائية القطعية (Terminal State) وتم ربطه بالمتجر وتفعيل أحقية الشريك إن وجدت.
                    </p>
                  </div>
                )}

                {/* State Transitions Matrix Actions (for NEW, CONTACTED, PENDING) */}
                {selectedLead.status !== 'CONVERTING' && selectedLead.status !== 'CONVERTED' && (
                  <div className="space-y-2">
                    <span className="text-[11px] text-slate-400 font-bold block">
                      تحديث الحالة وفق مصفوفة Stage 2:
                    </span>

                    <div className="flex flex-wrap gap-2">
                      {/* Transitions from NEW */}
                      {selectedLead.status === 'NEW' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus('CONTACTED')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold transition"
                          >
                            📞 تم التواصل (CONTACTED)
                          </button>
                          <button
                            onClick={() => handleUpdateStatus('REJECTED')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition"
                          >
                            ❌ رفض الطلب (REJECTED)
                          </button>
                        </>
                      )}

                      {/* Transitions from CONTACTED */}
                      {selectedLead.status === 'CONTACTED' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus('PENDING')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-bold transition"
                          >
                            ⏳ قيد المراجعة (PENDING)
                          </button>
                          <button
                            onClick={() => handleUpdateStatus('APPROVED')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition"
                          >
                            ✅ اعتماد الطلب (APPROVED)
                          </button>
                          <button
                            onClick={() => handleUpdateStatus('REJECTED')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition"
                          >
                            ❌ رفض الطلب
                          </button>
                        </>
                      )}

                      {/* Transitions from PENDING */}
                      {selectedLead.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus('APPROVED')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition"
                          >
                            ✅ اعتماد الطلب (APPROVED)
                          </button>
                          <button
                            onClick={() => handleUpdateStatus('CONTACTED')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold transition"
                          >
                            ↩️ إعادة للتواصل
                          </button>
                          <button
                            onClick={() => handleUpdateStatus('REJECTED')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition"
                          >
                            ❌ رفض الطلب
                          </button>
                        </>
                      )}

                      {/* Transitions from APPROVED (Rollback to Pending or Reject) */}
                      {selectedLead.status === 'APPROVED' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus('PENDING')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                          >
                            ↩️ إعادة للمراجعة
                          </button>
                          <button
                            onClick={() => handleUpdateStatus('CANCELLED')}
                            disabled={processingId === selectedLead.id}
                            className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition"
                          >
                            🚫 إلغاء الطلب
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="pt-4 border-t border-slate-800/80 text-center">
              <span className="text-[11px] font-mono text-slate-500">
                Lead ID: {selectedLead.id}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 7. Rollback Confirmation Modal */}
      {isRollbackModalOpen && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <RotateCcw className="w-6 h-6" />
              <h4 className="text-lg font-black text-white">تأكيد التراجع عن حجز التأسيس</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              سيتم التراجع عن حجز التأسيس للطلب <strong className="text-white">{selectedLead.store_name}</strong> وإعادته إلى حالة [معتمد]، وإلغاء رمز الـLease الحالي.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 block">سبب التراجع / رسالة الخطأ:</label>
              <input
                type="text"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="أدخل سبب التراجع (اختياري)..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleRollbackConversion}
                disabled={processingId === selectedLead.id}
                className="flex-1 py-3 rounded-2xl bg-rose-500 hover:bg-rose-400 text-white font-black text-xs transition shadow-lg shadow-rose-500/20 disabled:opacity-50"
              >
                {processingId === selectedLead.id ? 'جاري التراجع...' : 'تأكيد التراجع الآن'}
              </button>
              <button
                onClick={() => setIsRollbackModalOpen(false)}
                className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Super Admin Authentication Modal */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-black text-white">مصادقة مسؤول المنصة (Super Admin)</h4>
              </div>
              <button
                onClick={() => setIsAuthModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {/* Option A: Supabase Auth Email/Password */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  1. تسجيل الدخول عبر Supabase Auth:
                </span>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="بريد المسؤول (admin@radar.sa)"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
                />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="كلمة المرور"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              <div className="text-center text-[11px] text-slate-500 my-1">— أو —</div>

              {/* Option B: Direct Bearer Token / Admin Key */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  2. رمز وصول المسؤول المباشر (Admin Bearer Token):
                </span>
                <input
                  type="password"
                  value={manualTokenInput}
                  onChange={(e) => setManualTokenInput(e.target.value)}
                  placeholder="أدخل رمز وصول المسؤول (Admin Token)..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2.5 text-xs font-mono text-amber-400 placeholder-slate-600 outline-none transition"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {isAuthenticating ? 'جاري التحقق...' : 'تأكيد المصادقة'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(false)}
                  className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

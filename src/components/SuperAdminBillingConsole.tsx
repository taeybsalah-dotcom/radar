import React, { useState, useEffect, useMemo } from 'react';
import { debounce } from '../lib/debounce';
import {
  CreditCard,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  Sparkles,
  RefreshCw,
  X,
  Layers,
  Save,
  Check,
  Power,
  Clock,
  Zap,
  DollarSign,
  Gift,
  Building,
  Receipt,
  RotateCcw,
  FileText,
  Filter,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Scale,
  Send,
  FileSpreadsheet,
  AlertCircle,
  Info,
  ExternalLink,
  Lock,
  ChevronLeft,
  ChevronRight,
  Calculator,
  UserCheck,
  Briefcase,
  Landmark,
  Key,
  Eye,
  EyeOff,
  Copy,
  Banknote,
} from 'lucide-react';
import {
  BillingPlan,
  getPlanDurationLabel,
  getPlanPriceSuffix,
  FinancialLedgerEntry,
  CreditNote,
  AffiliatePayoutRecord,
  MasterFinancialMetrics,
  Store,
  StoreInvoice,
  PartnerAccount,
  FinancialTransactionType,
  FinancialPlatformConfig,
  PlatformPaymentConfig,
  OnlineGatewayProvider,
} from '../types';
import { LoyaltyService } from '../lib/supabase';
import { LoyaltyEvents, LoyaltyEventPayload } from '../lib/events';
import { ManualSubscriptionModal } from './ManualSubscriptionModal';

interface SuperAdminBillingConsoleProps {
  isDark?: boolean;
}

export const SuperAdminBillingConsole: React.FC<SuperAdminBillingConsoleProps> = ({ isDark = true }) => {
  // Navigation Subtabs
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'payouts' | 'refunds' | 'plans' | 'gateways'>('overview');

  // Data States
  const [ledgerEntries, setLedgerEntries] = useState<FinancialLedgerEntry[]>(() => {
    try {
      const raw = localStorage.getItem('radar_financial_ledger') || localStorage.getItem('radar_local_financial_ledger');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  const [creditNotes, setCreditNotes] = useState<CreditNote[]>(() => {
    try {
      const raw = localStorage.getItem('radar_credit_notes') || localStorage.getItem('radar_local_credit_notes');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [metrics, setMetrics] = useState<MasterFinancialMetrics | null>(() => {
    try {
      const rawLedger = localStorage.getItem('radar_financial_ledger') || localStorage.getItem('radar_local_financial_ledger');
      const ledger: FinancialLedgerEntry[] = rawLedger ? JSON.parse(rawLedger) : [];
      const rawCreditNotes = localStorage.getItem('radar_credit_notes') || localStorage.getItem('radar_local_credit_notes');
      const cNotes: CreditNote[] = rawCreditNotes ? JSON.parse(rawCreditNotes) : [];
      return LoyaltyService.calculateMetricsFromLedger(ledger, cNotes);
    } catch {
      return null;
    }
  });

  const [payouts, setPayouts] = useState<AffiliatePayoutRecord[]>(() => {
    try {
      const raw = localStorage.getItem('radar_affiliate_payouts') || localStorage.getItem('radar_local_affiliate_payouts');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const [plans, setPlans] = useState<BillingPlan[]>(() => LoyaltyService.getAllSubscriptionPlansSync());

  const [stores, setStores] = useState<Store[]>(() => {
    try {
      const raw = localStorage.getItem('radar_local_stores') || localStorage.getItem('radar_stores');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const [partners, setPartners] = useState<PartnerAccount[]>(() => {
    try {
      const raw = localStorage.getItem('radar_local_partners') || localStorage.getItem('radar_partners');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const [allInvoices, setAllInvoices] = useState<Record<string, StoreInvoice[]>>(() => {
    try {
      const raw = localStorage.getItem('radar_local_invoices') || localStorage.getItem('radar_invoices');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [loading, setLoading] = useState(false);

  // Filter States
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('ALL');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [payoutSearch, setPayoutSearch] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals States
  const [selectedLedgerAudit, setSelectedLedgerAudit] = useState<FinancialLedgerEntry | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<BillingPlan | null>(null);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [selectedPartnerForPayout, setSelectedPartnerForPayout] = useState<any | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [selectedInvoiceForRefund, setSelectedInvoiceForRefund] = useState<StoreInvoice | null>(null);

  // Plan Form State
  const [planName, setPlanName] = useState('');
  const [planDurationMonths, setPlanDurationMonths] = useState<number | ''>(1);
  const [planAmount, setPlanAmount] = useState<number | ''>(195);
  const [planFeaturesText, setPlanFeaturesText] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planTrialDays, setPlanTrialDays] = useState<number | ''>(7);
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  // Manual Adjustment Form State
  const [adjTargetType, setAdjTargetType] = useState<'store' | 'partner' | 'platform'>('store');
  const [adjTargetId, setAdjTargetId] = useState('');
  const [adjType, setAdjType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjAmount, setAdjAmount] = useState<number | ''>('');
  const [adjCategory, setAdjCategory] = useState<'BANK_SETTLEMENT' | 'CUSTOMER_COMPENSATION' | 'ACCOUNTING_CORRECTION' | 'DISPUTE_RESOLUTION' | 'OTHER'>('ACCOUNTING_CORRECTION');
  const [adjReference, setAdjReference] = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);

  // Payout Form State
  const [payoutIban, setPayoutIban] = useState('');
  const [payoutBank, setPayoutBank] = useState('Al Rajhi Bank (مصرف الراجحي)');
  const [payoutRef, setPayoutRef] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);

  // Refund Form State
  const [refundAmount, setRefundAmount] = useState<number | ''>('');
  const [refundReason, setRefundReason] = useState('إلغاء الاشتراك وطلب استرداد المبلغ');
  const [refundNotes, setRefundNotes] = useState('');
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  // Financial Platform Config (VAT 0% Freelance Document vs 15% ZATCA)
  const [financialConfig, setFinancialConfig] = useState<FinancialPlatformConfig>(() =>
    LoyaltyService.getFinancialConfig()
  );

  // Partner Payable Summaries Map
  const [partnerSummaries, setPartnerSummaries] = useState<Record<string, { earned_commissions: number; bonuses_earned: number; total_payable: number; paid_commissions: number }>>({});

  // Interactive 520 SAR Calculator State
  const [calcGross, setCalcGross] = useState<number>(520);
  const [calcMethod, setCalcMethod] = useState<string>('mada');
  const [calcRate, setCalcRate] = useState<number>(0.20);

  // 💳 Platform Subscription Omnichannel Payment Gateways Config State
  const [platformPaymentConfig, setPlatformPaymentConfig] = useState<PlatformPaymentConfig>({
    enabled: true,
    provider: 'sandbox',
    mode: 'sandbox',
    public_key: '',
    secret_key: '',
    allow_cash: true,
    allow_bank_transfer: true,
    bank_details: {
      bank_name: 'مصرف الراجحي (Al Rajhi Bank)',
      account_name: 'مؤسسة رادار الرقمية لتقنية المعلومات',
      iban: '',
    },
  });
  const [isSavingPaymentConfig, setIsSavingPaymentConfig] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // 💵 Manual Subscription Activation Modal State
  const [isManualSubModalOpen, setIsManualSubModalOpen] = useState(false);
  const [manualSubPreSelectedStoreId, setManualSubPreSelectedStoreId] = useState<string | undefined>(undefined);

  // Load all data
  const loadAllFinancialData = async () => {
    if (ledgerEntries.length === 0 && !metrics) {
      setLoading(true);
    }
    try {
      const cfg = LoyaltyService.getFinancialConfig();
      setFinancialConfig(cfg);

      // Fetch platform payment gateway configuration
      LoyaltyService.getPlatformPaymentConfig().then((payCfg) => {
        if (payCfg) setPlatformPaymentConfig(payCfg);
      }).catch((e) => console.warn('[SuperAdminBillingConsole] Platform payment config fetch error:', e));

      // Fetch plans immediately and independently so they appear on frame 0
      LoyaltyService.getAllSubscriptionPlans().then((freshPlans) => {
        if (freshPlans && freshPlans.length > 0) setPlans(freshPlans);
      }).catch((e) => console.warn('Plans fetch error:', e));

      const [ledgerRes, creditNotesRes, payoutsRes, storesRes, partnersRes, invoicesRes, summariesRes] = await Promise.allSettled([
        LoyaltyService.getFinancialLedger(),
        LoyaltyService.getAllCreditNotes(),
        LoyaltyService.getAllAffiliatePayouts(),
        LoyaltyService.getSuperAdminStoresSummary(),
        LoyaltyService.getAllPartners(),
        LoyaltyService.getAllInvoices(),
        LoyaltyService.getAllPartnerFinancialSummaries(),
      ]);

      const freshLedger = ledgerRes.status === 'fulfilled' ? ledgerRes.value : ledgerEntries;
      const freshCreditNotes = creditNotesRes.status === 'fulfilled' ? creditNotesRes.value : creditNotes;

      if (ledgerRes.status === 'fulfilled') setLedgerEntries(freshLedger);
      if (creditNotesRes.status === 'fulfilled') setCreditNotes(freshCreditNotes);
      if (payoutsRes.status === 'fulfilled') setPayouts(payoutsRes.value);
      if (storesRes.status === 'fulfilled') setStores(storesRes.value.stores || []);
      if (partnersRes.status === 'fulfilled') {
        const loadedPartners = partnersRes.value || [];
        setPartners(loadedPartners);
      }
      if (summariesRes.status === 'fulfilled' && summariesRes.value) {
        setPartnerSummaries(summariesRes.value);
      }
      if (invoicesRes.status === 'fulfilled') setAllInvoices(invoicesRes.value || {});

      // Instant in-memory metric computation without redundant network queries
      const computedMetrics = LoyaltyService.calculateMetricsFromLedger(freshLedger, freshCreditNotes);
      
      // Override affiliate metrics directly from Server Summaries to fix LocalStorage desync
      if (summariesRes.status === 'fulfilled' && summariesRes.value) {
        let realTotalPayable = 0;
        let realTotalPaid = 0;
        Object.values(summariesRes.value).forEach((s: any) => {
          realTotalPayable += (s.total_payable || 0);
          realTotalPaid += (s.paid_commissions || 0) + (s.bonuses_paid || 0);
        });
        computedMetrics.totalAffiliatePayable = realTotalPayable;
        computedMetrics.totalAffiliatePaid = realTotalPaid;
      }
      
      setMetrics(computedMetrics);
    } catch (err) {
      console.error('[SuperAdminBillingConsole] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVatMode = (enableVat: boolean) => {
    const updated = LoyaltyService.updateFinancialConfig({
      vat_enabled: enableVat,
      vat_rate: enableVat ? 0.15 : 0.00,
      business_legal_status: enableVat ? 'ESTABLISHMENT_TAXABLE' : 'FREELANCE_DOCUMENT',
    });
    setFinancialConfig(updated);
    setActionSuccess(
      enableVat
        ? 'تم تفعيل وضع التسجيل الضريبي الرسمي ZATCA (15%) بنجاح 🏛️'
        : 'تم تفعيل وضع وثيقة العمل الحر (0% ضريبة - بدون خصم ضريبي) بنجاح 🏢'
    );
    loadAllFinancialData();
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const debouncedLoadAllFinancialData = useMemo(
    () =>
      debounce(() => {
        loadAllFinancialData();
      }, 300),
    []
  );

  const pendingPayoutPartnersCount = useMemo(() => {
    return partners.filter((p) => (partnerSummaries[p.id]?.total_payable || 0) > 0).length;
  }, [partners, partnerSummaries]);

  useEffect(() => {
    loadAllFinancialData();

    const unsubscribe = LoyaltyEvents.listen((event: LoyaltyEventPayload) => {
      if (
        event.type === 'PAYMENT_COMPLETED' ||
        event.type === 'STORE_UPDATED' ||
        event.type === 'SUBSCRIPTION_UPDATED' ||
        event.type === 'PARTNER_UPDATED'
      ) {
        debouncedLoadAllFinancialData();
      }
    });

    return () => {
      unsubscribe();
      debouncedLoadAllFinancialData.cancel();
    };
  }, [debouncedLoadAllFinancialData]);

  // --- Handlers: Subscription Plans ---
  const handleOpenAddPlan = () => {
    setEditingPlan(null);
    setPlanName('');
    setPlanDurationMonths(1);
    setPlanAmount(195);
    setPlanDescription('');
    setPlanFeaturesText(
      'بطاقات ولاء رقمية (PWA) بدون تحميل تطبيق\nكاشير سريع لمسح الباركود وصرف النقاط\nنظام رتب ومستويات (Tiers) ذكي\nاستهداف العملاء المنقطعين تلقائياً\nدعم فني مخصص'
    );
    setPlanTrialDays(7);
    setIsPlanModalOpen(true);
  };

  const handleOpenEditPlan = (plan: BillingPlan) => {
    setEditingPlan(plan);
    setPlanName(plan.name);
    const months = plan.duration_months ?? (plan.billing_interval === 'YEARLY' ? 12 : 1);
    setPlanDurationMonths(months);
    setPlanAmount(plan.amount);
    setPlanDescription(plan.description || '');
    setPlanFeaturesText((plan.features || []).join('\n'));
    setPlanTrialDays(plan.trial_days ?? 7);
    setIsPlanModalOpen(true);
  };

  const handleSavePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim() || planAmount === '' || planDurationMonths === '') return;

    setIsSavingPlan(true);
    try {
      const cleanFeatures = planFeaturesText
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      const months = Math.max(1, Math.floor(Number(planDurationMonths)));
      const interval = months === 12 ? 'YEARLY' : 'MONTHLY';

      if (editingPlan && editingPlan.id) {
        const updated = await LoyaltyService.updateSubscriptionPlan(editingPlan.id, {
          name: planName.trim(),
          duration_months: months,
          billing_interval: interval,
          amount: Number(planAmount),
          description: planDescription.trim(),
          features: cleanFeatures,
          trial_days: Number(planTrialDays) || 0,
        });
        setPlans(plans.map((p) => (p.id === editingPlan.id ? updated : p)));
        setActionSuccess(`تم تحديث خطة "${updated.name}" بنجاح 💾`);
      } else {
        const created = await LoyaltyService.addSubscriptionPlan({
          name: planName.trim(),
          duration_months: months,
          billing_interval: interval,
          amount: Number(planAmount),
          currency: 'ر.س',
          description: planDescription.trim(),
          features: cleanFeatures,
          trial_days: Number(planTrialDays) || 0,
          active: true,
        });
        setPlans([...plans, created]);
        setActionSuccess(`تمت إضافة خطة "${created.name}" بنجاح 🚀`);
      }

      setIsPlanModalOpen(false);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'حدث خطأ أثناء حفظ الخطة');
      setTimeout(() => setActionError(null), 3500);
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleToggleActivePlan = async (plan: BillingPlan) => {
    if (!plan.id) return;
    try {
      const newStatus = await LoyaltyService.toggleSubscriptionPlanActive(plan.id);
      setPlans(plans.map((p) => (p.id === plan.id ? { ...p, active: newStatus } : p)));
      setActionSuccess(newStatus ? `تم تنشيط الخطة "${plan.name}" ✅` : `تم إيقاف الخطة "${plan.name}" ⏸️`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePlan = async (plan: BillingPlan) => {
    if (!plan.id) return;
    if (confirm(`هل أنت متأكد من رغبتك في حذف خطة "${plan.name}"؟`)) {
      try {
        await LoyaltyService.deleteSubscriptionPlan(plan.id);
        setPlans(plans.filter((p) => p.id !== plan.id));
        setActionSuccess(`تم حذف الخطة "${plan.name}" 🗑️`);
        setTimeout(() => setActionSuccess(null), 3000);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // --- Handlers: Platform Payment Gateways Config ---
  const handleSavePlatformPaymentConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingPaymentConfig(true);
    try {
      const res = await LoyaltyService.updatePlatformPaymentConfig(platformPaymentConfig);
      if (res.success && res.config) {
        setPlatformPaymentConfig(res.config);
        setActionSuccess('تم حفظ وتثبيت إعدادات بوابات الدفع لاشتراكات المنصة بنجاح 💾');
      } else {
        setActionError(res.error || 'تعذر حفظ إعدادات البوابة');
      }
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSavingPaymentConfig(false);
      setTimeout(() => {
        setActionSuccess(null);
        setActionError(null);
      }, 3500);
    }
  };

  // --- Handlers: Manual Ledger Adjustments ---
  const handleOpenManualAdjustment = () => {
    setAdjTargetType('store');
    setAdjTargetId(stores[0]?.id || '');
    setAdjType('CREDIT');
    setAdjAmount('');
    setAdjCategory('ACCOUNTING_CORRECTION');
    setAdjReference(`ADJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`);
    setAdjNotes('');
    setIsAdjustmentModalOpen(true);
  };

  const handleSubmitManualAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjAmount || Number(adjAmount) <= 0 || !adjReference.trim() || !adjNotes.trim()) {
      setActionError('يرجى ملء جميع الحقول الإلزامية (المبلغ، رقم المرجع، والسبب التفصيلي)');
      setTimeout(() => setActionError(null), 4000);
      return;
    }

    setIsSubmittingAdj(true);
    try {
      const result = await LoyaltyService.recordManualLedgerAdjustment({
        store_id: adjTargetType === 'store' ? adjTargetId : null,
        affiliate_id: adjTargetType === 'partner' ? adjTargetId : null,
        adjustment_type: adjType,
        amount: Number(adjAmount),
        reason_category: adjCategory,
        reference_number: adjReference.trim(),
        admin_user: 'Super Admin (المالك)',
        admin_notes: adjNotes.trim(),
      });

      if (result.success) {
        setActionSuccess(`تم توثيق القيد والتسوية المحاسبية بنجاح برقم: ${result.ledgerEntry.transaction_id} ⚖️`);
        setIsAdjustmentModalOpen(false);
        await loadAllFinancialData();
        setTimeout(() => setActionSuccess(null), 4000);
      } else {
        setActionError(result.error || 'فشلت عملية التسوية');
        setTimeout(() => setActionError(null), 4000);
      }
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء حفظ القيد المحاسبي');
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setIsSubmittingAdj(false);
    }
  };

  // --- Handlers: Affiliate Payouts ---
  const handleOpenPayoutModal = (partner: any) => {
    setSelectedPartnerForPayout(partner);
    setPayoutIban(partner.iban || 'SA');
    setPayoutBank('Al Rajhi Bank (مصرف الراجحي)');
    setPayoutRef(`TRX-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(10000 + Math.random() * 90000)}`);
    setPayoutNotes(`صرف مستحقات العمولات للشريك ${partner.display_name}`);
    setIsPayoutModalOpen(true);
  };

  const handleSubmitPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartnerForPayout || !payoutIban.trim() || !payoutRef.trim()) {
      setActionError('يرجى إدخال الآيبان ورقم مرجع الحوالة البنكية');
      setTimeout(() => setActionError(null), 3500);
      return;
    }

    setIsSubmittingPayout(true);
    try {
      const result = await LoyaltyService.processAffiliatePayout({
        affiliateId: selectedPartnerForPayout.id,
        partnerName: selectedPartnerForPayout.display_name,
        iban: payoutIban.trim(),
        bankName: payoutBank.trim(),
        transferReference: payoutRef.trim(),
        adminUser: 'Super Admin (المالك)',
        notes: payoutNotes.trim(),
      });

      if (result.success) {
        setActionSuccess(`تم تسجيل وتوثيق صرف المستحقات للشريك بنجاح برقم: ${result.payout?.payout_number || 'PAY-CONFIRMED'} 💸`);
        setIsPayoutModalOpen(false);
        await loadAllFinancialData();
        setTimeout(() => setActionSuccess(null), 4000);
      } else {
        setActionError(result.error || 'فشلت عملية الصرف');
        setTimeout(() => setActionError(null), 4000);
      }
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء تنفيذ الصرف');
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setIsSubmittingPayout(false);
    }
  };

  // --- Handlers: ZATCA Refund & Credit Note ---
  const handleOpenRefundModal = (invoice: StoreInvoice) => {
    setSelectedInvoiceForRefund(invoice);
    setRefundAmount(invoice.amount);
    setRefundReason('إلغاء الاشتراك بناءً على طلب التاجر وضمان الاسترداد');
    setRefundNotes(`إشعار دائن واسترداد كامل للفاتورة ${invoice.invoice_number}`);
    setIsRefundModalOpen(true);
  };

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForRefund || !refundAmount || Number(refundAmount) <= 0 || !refundReason.trim()) {
      setActionError('يرجى تحديد المبلغ وسبب الاسترداد');
      setTimeout(() => setActionError(null), 3500);
      return;
    }

    if (Number(refundAmount) > selectedInvoiceForRefund.amount) {
      setActionError('مبلغ الاسترداد لا يمكن أن يتجاوز قيمة الفاتورة الأصلية');
      setTimeout(() => setActionError(null), 3500);
      return;
    }

    setIsSubmittingRefund(true);
    try {
      const result = await LoyaltyService.processZatcaRefundAndCreditNote({
        invoiceId: selectedInvoiceForRefund.id,
        storeId: selectedInvoiceForRefund.store_id,
        refundAmount: Number(refundAmount),
        reason: refundReason.trim(),
        adminUser: 'Super Admin (المالك)',
        notes: refundNotes.trim(),
      });

      if (result.success) {
        setActionSuccess(`تم إصدار الإشعار الدائن (${result.creditNote.credit_note_number}) وعكس القيود المحاسبية بنجاح 🔄`);
        setIsRefundModalOpen(false);
        await loadAllFinancialData();
        setTimeout(() => setActionSuccess(null), 4000);
      } else {
        setActionError(result.error || 'فشلت عملية إصدار الإشعار الدائن');
        setTimeout(() => setActionError(null), 4000);
      }
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء معالجة الإشعار الدائن');
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  // Live calculation breakdown
  const liveBreakdown = LoyaltyService.calculateBreakdown(calcGross, calcMethod, calcRate);

  // Flattened paid invoices list for refund selector
  const paidInvoicesList: (StoreInvoice & { store_name?: string })[] = [];
  Object.entries(allInvoices).forEach(([sId, invs]) => {
    const st = stores.find((s) => s.id === sId);
    invs.forEach((i) => {
      if (i.status === 'paid') {
        paidInvoicesList.push({
          ...i,
          store_name: st?.name || `متجر (${sId.substring(0, 6)})`,
        });
      }
    });
  });

  // Filtered Ledger
  const filteredLedger = ledgerEntries.filter((entry) => {
    const matchesType = ledgerTypeFilter === 'ALL' || entry.transaction_type === ledgerTypeFilter;
    const q = ledgerSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      entry.transaction_id.toLowerCase().includes(q) ||
      (entry.store_name || '').toLowerCase().includes(q) ||
      (entry.affiliate_name || '').toLowerCase().includes(q) ||
      (entry.metadata?.invoice_number || '').toLowerCase().includes(q) ||
      (entry.metadata?.credit_note_number || '').toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-8" dir="rtl">
      {/* Toast Alerts */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-bold flex items-center gap-2 animate-fadeIn shadow-2xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm font-bold flex items-center gap-2 animate-fadeIn shadow-2xl">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-emerald-500/15 via-slate-900 to-slate-900 border-2 border-emerald-500/30 p-6 sm:p-8 overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-x-4 rtl:space-x-reverse flex items-start">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 via-amber-400 to-cyan-400 flex items-center justify-center text-slate-950 font-black text-2xl shadow-lg shadow-emerald-500/20 shrink-0">
              🏛️
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  السجل المالي العام وإدارة الإيرادات والعمولات
                </h3>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  Master Financial Ledger 🔒
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
                سجل القيود المحاسبية الدائم، احتساب عمولات المسوقين على الإجمالي، معالجة رسوم بوابات الدفع، وإدارة الوضع الضريبي المرن.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setManualSubPreSelectedStoreId(undefined);
                setIsManualSubModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
            >
              <Banknote className="w-4 h-4" />
              <span>سداد اشتراك (كاش / تحويل) 💵</span>
            </button>

            <button
              onClick={handleOpenManualAdjustment}
              className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1.5 shadow-lg"
            >
              <Scale className="w-4 h-4 text-amber-400" />
              <span>تسوية يدوية ⚖️</span>
            </button>

            <button
              onClick={loadAllFinancialData}
              disabled={loading}
              className="p-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 🧭 Navigation Subtabs */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>المؤشرات والتحليلات المالية 📊</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeTab === 'ledger'
              ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>سجل القيود المالية العام ({ledgerEntries.length}) 📜</span>
        </button>

        <button
          onClick={() => setActiveTab('payouts')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeTab === 'payouts'
              ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>صرف مستحقات المسوقين ({pendingPayoutPartnersCount > 0 ? pendingPayoutPartnersCount : payouts.length}) 💸</span>
        </button>

        <button
          onClick={() => setActiveTab('refunds')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeTab === 'refunds'
              ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>المستردات والإشعارات الدائنة ({creditNotes.length}) 🔄</span>
        </button>

        <button
          onClick={() => setActiveTab('plans')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeTab === 'plans'
              ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>باقات الاشتراك ({plans.length}) 💳</span>
        </button>

        <button
          onClick={() => setActiveTab('gateways')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap ${
            activeTab === 'gateways'
              ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>بوابات وطرق الدفع ({platformPaymentConfig.provider === 'sandbox' ? 'تجريبي' : platformPaymentConfig.provider.toUpperCase()}) ⚡</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & REDESIGNED FINANCIAL METRICS */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fadeIn">
          {/* 🏢 1. Flexible Legal & Tax Compliance Switcher */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 shadow-lg ${
                financialConfig.vat_enabled
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-amber-500/10'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-emerald-500/10'
              }`}>
                {financialConfig.vat_enabled ? <Landmark className="w-6 h-6" /> : <Briefcase className="w-6 h-6" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm sm:text-base font-black text-white">
                    الوضع القانوني والضريبي للمنصة:
                  </h4>
                  <span className={`text-xs font-bold px-3 py-0.5 rounded-full border ${
                    financialConfig.vat_enabled
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  }`}>
                    {financialConfig.vat_enabled
                      ? 'منشأة مسجلة ضريبياً (15% ZATCA) 🏛️'
                      : 'وثيقة عمل حر (معفى ضريبياً 0%) 🏢'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {financialConfig.vat_enabled
                    ? 'يتم استقطاع ضريبة القيمة المضافة 15% تلقائياً وتوثيقها في قيود السجل المالي للامتثال الضريبي لهيئة الزكاة والضريبة والجمارك.'
                    : 'الوضع الافتراضي الحالي: لا يتم فرض أي استقطاعات ضريبية وتذهب المبالغ مباشرة كإيراد صافٍ ومستحقات مسوقين.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 self-start md:self-auto shrink-0 shadow-inner">
              <button
                type="button"
                onClick={() => handleToggleVatMode(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  !financialConfig.vat_enabled
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>وثيقة عمل حر (0% ضريبة)</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleVatMode(true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  financialConfig.vat_enabled
                    ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>تسجيل ZATCA (15%)</span>
              </button>
            </div>
          </div>

          {/* 📊 2. Clean Metric Cards Grid (Zero Overlapping, Crisp Typography) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Gross Volume */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-bold">إجمالي التدفقات والمبيعات</span>
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                  {(metrics?.totalGrossVolume || 0).toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-bold">ر.س</span>
              </div>
              <p className="text-[11px] text-slate-500">إجمالي ما سدده التجار بالكامل عبر المنصة</p>
            </div>

            {/* Net Platform Revenue */}
            <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-5 space-y-3 shadow-xl hover:border-emerald-500/50 transition relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-400 font-bold">صافي دخل المنصة الفعلي</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                  {(metrics?.totalNetPlatformRevenue || 0).toLocaleString()}
                </span>
                <span className="text-xs text-emerald-300/80 font-bold">ر.س</span>
              </div>
              <p className="text-[11px] text-slate-400">بعد خصم العمولات ورسوم البوابات التشغيلية</p>
            </div>

            {/* Marketer Liabilities */}
            <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-5 space-y-3 shadow-xl hover:border-amber-500/50 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-300 font-bold">عمولات المسوقين المستحقة</span>
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                  {(metrics?.totalAffiliatePayable || 0).toLocaleString()}
                </span>
                <span className="text-xs text-amber-300/80 font-bold">ر.س</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">مستحقة وجاهزة للصرف</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('payouts')}
                  className="text-amber-400 hover:text-amber-300 font-bold underline"
                >
                  صرف الآن 💸
                </button>
              </div>
            </div>

            {/* Gateway Fees */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-bold">رسوم معالجة بوابات الدفع</span>
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-purple-400 font-mono">
                  {(metrics?.totalGatewayFees || 0).toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-bold">ر.س</span>
              </div>
              <p className="text-[11px] text-slate-500">مصاريف تشغيلية محسومة (Mada / Visa)</p>
            </div>
          </div>

          {/* 🧮 3. Interactive Architecture Simulator (520 SAR Architecture Simulator) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base sm:text-lg font-black text-white">
                    حاسبة التفكيك المالي المعياري وتوزيع الأرباح (Architecture Simulator)
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    محاكاة حية لطريقة تفكيك كل عملية دفع بدقة وبدون أي أخطاء أو تشويش في الحسابات.
                  </p>
                </div>
              </div>

              {/* Simulator Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 font-bold">المبلغ المدفوع:</span>
                  <input
                    type="number"
                    value={calcGross}
                    onChange={(e) => setCalcGross(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 bg-transparent text-amber-400 font-black font-mono text-sm outline-none"
                  />
                  <span className="text-xs text-slate-400 font-bold">ر.س</span>
                </div>

                <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 font-bold">بوابة الدفع:</span>
                  <select
                    value={calcMethod}
                    onChange={(e) => setCalcMethod(e.target.value)}
                    className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="mada" className="bg-slate-900">مدى Mada (1% + 1 ر.س)</option>
                    <option value="visa" className="bg-slate-900">فيزا / ماستر (2.75% + 1 ر.س)</option>
                    <option value="apple_pay" className="bg-slate-900">أبل باي (2.2% + 1 ر.س)</option>
                    <option value="sandbox" className="bg-slate-900">تجريبي Sandbox (0%)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 font-bold">نسبة المسوق:</span>
                  <select
                    value={calcRate}
                    onChange={(e) => setCalcRate(Number(e.target.value))}
                    className="bg-transparent text-amber-400 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value={0.20} className="bg-slate-900">20% (عمولة تأسيس واستحواذ)</option>
                    <option value={0.10} className="bg-slate-900">10% (عمولة تجديد دوري)</option>
                    <option value={0.15} className="bg-slate-900">15% (مستوى مخصص)</option>
                    <option value={0.25} className="bg-slate-900">25% (شريك VIP)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Simulator Breakdown Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Step 1: Gross Paid */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold">1. إجمالي ما دفعه التاجر</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800">100%</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white font-mono">
                    {liveBreakdown.grossAmount.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">ر.س</span>
                </div>
                <p className="text-[11px] text-slate-500">القيمة الإجمالية المسددة من التاجر</p>
              </div>

              {/* Step 2: Marketer Commission */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-amber-500/40 space-y-2">
                <div className="flex items-center justify-between text-xs text-amber-400">
                  <span className="font-bold">2. عمولة المسوق المحمية</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30">
                    {Math.round(calcRate * 100)}% ثابتة
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-amber-400 font-mono">
                    {liveBreakdown.affiliateCommission.toFixed(2)}
                  </span>
                  <span className="text-xs text-amber-300 font-bold">ر.س</span>
                </div>
                <p className="text-[11px] text-amber-300/70">
                  محسوبة على كامل المبلغ ({liveBreakdown.grossAmount} × {Math.round(calcRate * 100)}%) دون اقتطاع
                </p>
              </div>

              {/* Step 3: Gateway Fees */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-purple-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs text-purple-400">
                  <span className="font-bold">3. رسوم بوابة الدفع</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30">
                    تشغيلي
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-purple-400 font-mono">
                    {liveBreakdown.gatewayFee.toFixed(2)}
                  </span>
                  <span className="text-xs text-purple-300 font-bold">ر.س</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  رسوم معالجة تقنية تتحملها المنصة فقط
                </p>
              </div>

              {/* Step 4: Net Platform Profit */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-2 border-emerald-500/50 space-y-2 shadow-lg shadow-emerald-500/10">
                <div className="flex items-center justify-between text-xs text-emerald-400">
                  <span className="font-black">4. صافي إيراد المنصة 🚀</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                    {liveBreakdown.grossAmount > 0 ? Math.round((liveBreakdown.netPlatformAmount / liveBreakdown.grossAmount) * 100) : 0}%
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    {liveBreakdown.netPlatformAmount.toFixed(2)}
                  </span>
                  <span className="text-xs text-emerald-300 font-bold">ر.س</span>
                </div>
                <p className="text-[11px] text-emerald-300/80">
                  صافي ربح حقيقي بعد خصم العمولة والرسوم
                </p>
              </div>
            </div>

            {/* Proportional Distribution Visual Bar */}
            {liveBreakdown.grossAmount > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold">
                  <span>توزيع التدفق المالي للعملية:</span>
                  <span className="font-mono">
                    المنصة: {((liveBreakdown.netPlatformAmount / liveBreakdown.grossAmount) * 100).toFixed(1)}% | المسوق: {((liveBreakdown.affiliateCommission / liveBreakdown.grossAmount) * 100).toFixed(1)}% | البوابة: {((liveBreakdown.gatewayFee / liveBreakdown.grossAmount) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex">
                  <div
                    style={{ width: `${(liveBreakdown.netPlatformAmount / liveBreakdown.grossAmount) * 100}%` }}
                    className="bg-emerald-500 h-full transition-all duration-500"
                    title="صافي المنصة"
                  ></div>
                  <div
                    style={{ width: `${(liveBreakdown.affiliateCommission / liveBreakdown.grossAmount) * 100}%` }}
                    className="bg-amber-500 h-full transition-all duration-500"
                    title="عمولة المسوق"
                  ></div>
                  <div
                    style={{ width: `${(liveBreakdown.gatewayFee / liveBreakdown.grossAmount) * 100}%` }}
                    className="bg-purple-500 h-full transition-all duration-500"
                    title="رسوم البوابة"
                  ></div>
                  {liveBreakdown.vatAmount > 0 && (
                    <div
                      style={{ width: `${(liveBreakdown.vatAmount / liveBreakdown.grossAmount) * 100}%` }}
                      className="bg-blue-500 h-full transition-all duration-500"
                      title="ضريبة ZATCA"
                    ></div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: IMMUTABLE MASTER FINANCIAL LEDGER */}
      {/* ========================================================================= */}
      {activeTab === 'ledger' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Filters Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              <span className="text-xs text-slate-400 font-bold shrink-0 ml-2">نوع القيد:</span>
              {(['ALL', 'PAYMENT', 'REFUND', 'ADJUSTMENT', 'PAYOUT'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setLedgerTypeFilter(t)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                    ledgerTypeFilter === t
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {t === 'ALL'
                    ? 'الكل'
                    : t === 'PAYMENT'
                    ? 'مدفوعات واشتراكات 💰'
                    : t === 'REFUND'
                    ? 'استرداد وإشعار دائن 🔄'
                    : t === 'ADJUSTMENT'
                    ? 'تسويات محاسبية ⚖️'
                    : 'صرف مستحقات 💸'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="بحث برقم العملية أو المتجر..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
                />
              </div>

              <button
                onClick={handleOpenManualAdjustment}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة تسوية</span>
              </button>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[11px] font-bold">
                    <th className="p-4">رقم العملية (TX ID)</th>
                    <th className="p-4">نوع القيد</th>
                    <th className="p-4">المتجر / الشريك</th>
                    <th className="p-4 text-left">المبلغ الإجمالي</th>
                    <th className="p-4 text-left">ضريبة 15%</th>
                    <th className="p-4 text-left">رسوم البوابة</th>
                    <th className="p-4 text-left">حصة المسوق</th>
                    <th className="p-4 text-left">صافي المنصة</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4 text-center">التدقيق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-10 text-center text-slate-500">
                        لا توجد قيود مالية مطابقة للبحث
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-4 font-mono font-bold text-slate-300">
                          {entry.transaction_id}
                          {entry.refund_of && (
                            <span className="block text-[10px] text-rose-400 font-mono">
                              استرداد لـ: {entry.refund_of}
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              entry.transaction_type === 'PAYMENT'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : entry.transaction_type === 'REFUND'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                : entry.transaction_type === 'ADJUSTMENT'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                            }`}
                          >
                            {entry.transaction_type === 'PAYMENT'
                              ? 'دفع واشتراك 💳'
                              : entry.transaction_type === 'REFUND'
                              ? 'إشعار دائن 🔄'
                              : entry.transaction_type === 'ADJUSTMENT'
                              ? 'تسوية يدوية ⚖️'
                              : 'صرف مستحقات 💸'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-bold text-white block">
                            {entry.store_name || entry.affiliate_name || 'المنصة الرئيسية'}
                          </span>
                          {entry.affiliate_name && entry.store_name && (
                            <span className="text-[10px] text-emerald-400 block">
                              شريك: {entry.affiliate_name}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-left font-mono font-bold text-white" dir="ltr">
                          {entry.gross_amount > 0 ? `+${entry.gross_amount.toFixed(2)}` : entry.gross_amount.toFixed(2)} SAR
                        </td>
                        <td className="p-4 text-left font-mono text-amber-400" dir="ltr">
                          {entry.vat_amount.toFixed(2)} SAR
                        </td>
                        <td className="p-4 text-left font-mono text-purple-400" dir="ltr">
                          {entry.gateway_fee.toFixed(2)} SAR
                        </td>
                        <td className="p-4 text-left font-mono text-emerald-400" dir="ltr">
                          {entry.affiliate_commission.toFixed(2)} SAR
                        </td>
                        <td className="p-4 text-left font-mono font-bold text-cyan-400" dir="ltr">
                          {entry.net_platform_amount > 0 ? `+${entry.net_platform_amount.toFixed(2)}` : entry.net_platform_amount.toFixed(2)} SAR
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            مؤكد ومثبت ✅
                          </span>
                        </td>
                        <td className="p-4 text-[11px] text-slate-400 font-mono">
                          {new Date(entry.created_at).toLocaleDateString('ar-SA')}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setSelectedLedgerAudit(entry)}
                            className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold transition"
                          >
                            تتبع التدقيق 🔍
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: AFFILIATE PAYOUTS & DISBURSEMENTS */}
      {/* ========================================================================= */}
      {activeTab === 'payouts' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Partners with Available Balance Ready for Payout */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <h4 className="text-base font-black text-white">شركاء المبيعات والمسوقين المؤهلين للصرف الفوري</h4>
              </div>
              <span className="text-xs text-slate-400">حوالات بنكية مباشرة</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {partners.map((partner) => {
                const summary = partnerSummaries[partner.id];
                const availableAmt = summary ? summary.total_payable : 0;
                return (
                  <div
                    key={partner.id}
                    className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between shadow-lg"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 font-mono">
                          كود: {partner.referral_code}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          عمولة {Math.round((partner.commission_rate ?? 0.20) * 100)}%
                        </span>
                      </div>

                      <h5 className="text-base font-black text-white">{partner.display_name}</h5>
                      <p className="text-xs text-slate-400 font-mono">
                        {partner.affiliates?.phone || (partner as any).phone || '05xxxxxxxx'}
                      </p>

                      <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-400">الرصيد الجاهز للصرف:</span>
                        <span className="text-lg font-black text-emerald-400 font-mono">
                          {availableAmt.toLocaleString()} ر.س
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenPayoutModal(partner)}
                      disabled={availableAmt <= 0}
                      className={`w-full py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 shadow-lg ${
                        availableAmt > 0
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 shadow-emerald-500/20'
                          : 'bg-slate-800/60 text-slate-500 cursor-not-allowed shadow-none'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{availableAmt > 0 ? 'صرف المستحقات وتسجيل الحوالة 💸' : 'لا توجد مستحقات معلقة'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Historical Payouts Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-purple-400" />
                <h4 className="text-base font-black text-white">سجل الحوالات والمبالغ المصروفة للشركاء (Payout Audit)</h4>
              </div>
              <span className="text-xs text-slate-400 font-mono">{payouts.length} حوالة موثقة</span>
            </div>

            {payouts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">لا توجد سجلات صرف بعد</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th className="p-3">رقم الصرف</th>
                      <th className="p-3">الشريك</th>
                      <th className="p-3">المبلغ المصروف</th>
                      <th className="p-3">الآيبان والبنك</th>
                      <th className="p-3">مرجع الحوالة البنكية</th>
                      <th className="p-3">التاريخ والمنفذ</th>
                      <th className="p-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono font-bold text-white">{p.payout_number}</td>
                        <td className="p-3 font-bold text-slate-200">{p.partner_name}</td>
                        <td className="p-3 font-mono font-black text-emerald-400">{p.amount.toLocaleString()} ر.س</td>
                        <td className="p-3 font-mono text-[11px] text-slate-300">
                          {p.bank_name} <br />
                          <span className="text-slate-500">{p.iban}</span>
                        </td>
                        <td className="p-3 font-mono text-amber-400">{p.transfer_reference}</td>
                        <td className="p-3 text-[11px] text-slate-400">
                          {new Date(p.disbursed_at).toLocaleString('ar-SA')} <br />
                          <span className="text-slate-500">{p.disbursed_by}</span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            مكتمل ومحول ✅
                          </span>
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

      {/* ========================================================================= */}
      {/* TAB 4: REFUNDS & ZATCA CREDIT NOTES */}
      {/* ========================================================================= */}
      {activeTab === 'refunds' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Quick Issue Refund Banner */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h4 className="text-base font-black text-white">إصدار إشعار دائن واسترداد مالي (ZATCA Credit Note)</h4>
                <p className="text-xs text-slate-400 mt-1">
                  اختر أي فاتورة مسددة لعكس الضريبة 15% واسترداد عمولة المسوق تلقائياً دون تعديل القيود السابقة.
                </p>
              </div>
            </div>

            {/* Paid Invoices Available for Refund */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paidInvoicesList.slice(0, 6).map((inv) => (
                <div
                  key={inv.id}
                  className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-white">{inv.invoice_number}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        مسددة ✅
                      </span>
                    </div>
                    <span className="text-xs font-bold text-amber-400 block">{inv.store_name}</span>
                    <span className="text-lg font-black text-white font-mono block">{inv.amount.toLocaleString()} ر.س</span>
                  </div>

                  <button
                    onClick={() => handleOpenRefundModal(inv)}
                    className="w-full py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إصدار إشعار دائن واسترداد 🔄</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Credit Notes Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-rose-400" />
                <h4 className="text-base font-black text-white">سجل الإشعارات الدائنة ZATCA المعتمدة</h4>
              </div>
              <span className="text-xs text-slate-400 font-mono">{creditNotes.length} إشعار دائن</span>
            </div>

            {creditNotes.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">لا توجد إشعارات دائنة صادرة حتى الآن</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th className="p-3">رقم الإشعار الدائن</th>
                      <th className="p-3">الفاتورة الأصلية</th>
                      <th className="p-3">المتجر</th>
                      <th className="p-3">مبلغ الاسترداد</th>
                      <th className="p-3">عكس ضريبة 15%</th>
                      <th className="p-3">استرداد العمولة</th>
                      <th className="p-3">السبب</th>
                      <th className="p-3">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {creditNotes.map((cn) => (
                      <tr key={cn.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono font-bold text-rose-400">{cn.credit_note_number}</td>
                        <td className="p-3 font-mono text-white">{cn.original_invoice_number}</td>
                        <td className="p-3 font-bold text-slate-200">{cn.store_name}</td>
                        <td className="p-3 font-mono font-bold text-rose-400">-{cn.gross_refund_amount.toFixed(2)} ر.س</td>
                        <td className="p-3 font-mono text-amber-400">-{cn.vat_refund_amount.toFixed(2)} ر.س</td>
                        <td className="p-3 font-mono text-emerald-400">-{cn.clawback_commission.toFixed(2)} ر.س</td>
                        <td className="p-3 text-slate-300">{cn.reason}</td>
                        <td className="p-3 text-slate-400 font-mono">{new Date(cn.issued_at).toLocaleDateString('ar-SA')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SUBSCRIPTION PLANS */}
      {/* ========================================================================= */}
      {activeTab === 'plans' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg sm:text-xl font-black text-white">إدارة باقات وخطط الاشتراك</h3>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  {plans.length} خطط معتمدة
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                تحديد الأسعار والمدد والمميزات لتظهر ديناميكياً في لوحة كل تاجر.
              </p>
            </div>

            <button
              onClick={handleOpenAddPlan}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-amber-500/20 transition flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة خطة جديدة ➕</span>
            </button>
          </div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`bg-slate-950 border rounded-3xl p-6 space-y-5 flex flex-col justify-between transition shadow-lg ${
                  plan.active !== false ? 'border-slate-800 hover:border-amber-500/40' : 'border-rose-900/30 opacity-60'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl border bg-amber-500/10 text-amber-300 border-amber-500/30 font-mono">
                      🗓️ {getPlanDurationLabel(plan)}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                        plan.active !== false
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${plan.active !== false ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                      <span>{plan.active !== false ? 'نشطة' : 'متوقفة'}</span>
                    </span>
                  </div>

                  <div>
                    <h5 className="text-lg font-black text-white">{plan.name}</h5>
                    {plan.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{plan.description}</p>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl font-black text-amber-400 font-mono">{plan.amount.toLocaleString()}</span>
                      <span className="text-xs text-slate-400 font-bold mr-1.5">{plan.currency || 'ر.س'}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">/ {getPlanPriceSuffix(plan)}</span>
                  </div>

                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-400 block">المميزات المضمنة:</span>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {(plan.features || []).map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2 leading-relaxed">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActivePlan(plan)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      plan.active !== false
                        ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{plan.active !== false ? 'إيقاف الخطة' : 'تفعيل الخطة'}</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditPlan(plan)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-400 hover:text-amber-300 transition"
                    title="تعديل الخطة"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeletePlan(plan)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 border border-slate-800 text-rose-400 hover:text-rose-300 transition"
                    title="حذف الخطة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: OMNICHANNEL PLATFORM SUBSCRIPTION PAYMENT GATEWAYS & CASH */}
      {/* ========================================================================= */}
      {activeTab === 'gateways' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Info Banner & Quick Action */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-2xl shrink-0 shadow-lg shadow-emerald-500/20">
                <CreditCard className="w-7 h-7 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base sm:text-lg font-black text-white">
                    بوابات الدفع الإلكتروني وتحصيل اشتراكات رادار
                  </h4>
                  <span className={`text-xs font-bold px-3 py-0.5 rounded-full border ${
                    platformPaymentConfig.enabled
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                  }`}>
                    {platformPaymentConfig.enabled ? 'التحصيل التلقائي مفعّل 🟢' : 'التحصيل الإلكتروني متوقف 🔴'}
                  </span>
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                    {platformPaymentConfig.mode === 'live' ? '⚡ وضع الإنتاج (LIVE)' : '🧪 بيئة تجريبية (SANDBOX)'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  تحديد بوابات الدفع المستخدمة لتحصيل رسوم اشتراكات المتاجر (ميسر، جيديا، تاب، أو البيئة التجريبية)، مع إمكانية تحصيل الاشتراكات نقداً (كاش) أو عبر التحويل البنكي وتفعيل المتاجر يدوياً فوراً.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setManualSubPreSelectedStoreId(undefined);
                  setIsManualSubModalOpen(true);
                }}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm transition flex items-center gap-2 shadow-lg shadow-emerald-500/25"
              >
                <Banknote className="w-4 h-4" />
                <span>تفعيل اشتراك كاش / تحويل 💵</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSavePlatformPaymentConfig} className="space-y-6">
            {/* 1. Master Online Collection Toggle */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  platformPaymentConfig.enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'
                }`}>
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-white">تفعيل بوابة الدفع الإلكتروني لاشتراكات المنصة</h5>
                  <p className="text-xs text-slate-400">عند التعطيل، لن يتمكن التجار من الدفع ببطاقاتهم أونلاين وسيقتصر التحصيل على الكاش والتحويل البنكي.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPlatformPaymentConfig({ ...platformPaymentConfig, enabled: !platformPaymentConfig.enabled })}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  platformPaymentConfig.enabled ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    platformPaymentConfig.enabled ? 'translate-x-0' : '-translate-x-7'
                  }`}
                />
              </button>
            </div>

            {/* 2. Provider Selection (4 Cards) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>اختر مزود بوابة الدفع الإلكتروني المعتمد للمنصة:</span>
                  </h5>
                  <span className="text-xs text-slate-400">سيتم توجيه جميع عمليات سداد الاشتراكات عبر هذه البوابة</span>
                </div>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setPlatformPaymentConfig({ ...platformPaymentConfig, mode: 'sandbox' })}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      platformPaymentConfig.mode === 'sandbox'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    تجريبي (Sandbox)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlatformPaymentConfig({ ...platformPaymentConfig, mode: 'live' })}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      platformPaymentConfig.mode === 'live'
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    حي (Live الإنتاج)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                {[
                  {
                    id: 'sandbox' as const,
                    name: 'البيئة التجريبية (Sandbox)',
                    desc: 'مدمج ومجاني للاختبار الفوري دون اشتراك أو أوراق',
                    badge: 'جاهز فوراً ⚡',
                    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
                  },
                  {
                    id: 'moyasar' as const,
                    name: 'ميسر (Moyasar)',
                    desc: 'الأسرع تفعيلاً لمدى وApple Pay بحسابك البنكي التجاري',
                    badge: 'معتمد من ساما 🇸🇦',
                    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
                  },
                  {
                    id: 'geidea' as const,
                    name: 'جيديا (Geidea E-Com)',
                    desc: 'حل موحد متكامل للدفع الإلكتروني وأجهزة نقاط البيع',
                    badge: 'حل موحد 🔄',
                    badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
                  },
                  {
                    id: 'tap' as const,
                    name: 'تاب (Tap Payments)',
                    desc: 'بوابة إقليمية موثوقة تدعم بطاقات الخليج كافة ومدى وApple Pay',
                    badge: 'إقليمي 🌐',
                    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
                  },
                ].map((prov) => {
                  const isSelected = (platformPaymentConfig.provider || 'sandbox') === prov.id;
                  return (
                    <div
                      key={prov.id}
                      onClick={() => setPlatformPaymentConfig({ ...platformPaymentConfig, provider: prov.id })}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? 'bg-emerald-500/10 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs sm:text-sm font-black text-white">{prov.name}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {prov.desc}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border inline-block w-fit ${prov.badgeColor}`}>
                        {prov.badge}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Provider Keys & Credentials */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 mt-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <span className="text-xs font-black text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span>بيانات ومفاتيح تشغيل بوابة {
                      platformPaymentConfig.provider === 'sandbox' ? 'البيئة التجريبية (Sandbox)' :
                      platformPaymentConfig.provider === 'moyasar' ? 'ميسر (Moyasar)' :
                      platformPaymentConfig.provider === 'geidea' ? 'جيديا (Geidea)' : 'تاب (Tap Payments)'
                    }</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    الوضع: <strong className={platformPaymentConfig.mode === 'live' ? 'text-emerald-400' : 'text-amber-400'}>{platformPaymentConfig.mode === 'live' ? 'LIVE الإنتاج' : 'SANDBOX تجريبي'}</strong>
                  </span>
                </div>

                {platformPaymentConfig.provider === 'sandbox' ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                    <span className="leading-relaxed">
                      البيئة التجريبية (Sandbox) مدمجة في نظام رادار. يمكنك أنت والتجار تجربة سداد الاشتراكات باستخدام أي بطاقة اختبار مدى أو فيزا أو أبل باي بشكل وهمي فوراً دون الحاجة لإدخال مفاتيح API.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-300 font-bold block mb-1.5">
                          المفتاح العام (Publishable / Public API Key):
                        </label>
                        <input
                          type="text"
                          placeholder={
                            platformPaymentConfig.provider === 'moyasar'
                              ? (platformPaymentConfig.mode === 'live' ? 'pk_live_...' : 'pk_test_...')
                              : (platformPaymentConfig.mode === 'live' ? 'pk_live_...' : 'pk_test_...')
                          }
                          value={platformPaymentConfig.public_key || ''}
                          onChange={(e) => setPlatformPaymentConfig({ ...platformPaymentConfig, public_key: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono outline-none focus:border-emerald-500 transition"
                        />
                        <span className="text-[10px] text-slate-500 mt-1 block">يُستخدم لتهيئة نموذج الدفع على واجهة المستخدم.</span>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs text-slate-300 font-bold block">
                            المفتاح السري (Secret API Key):
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowSecretKey(!showSecretKey)}
                            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition"
                          >
                            {showSecretKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            <span>{showSecretKey ? 'إخفاء' : 'إظهار'}</span>
                          </button>
                        </div>
                        <input
                          type={showSecretKey ? 'text' : 'password'}
                          placeholder={
                            platformPaymentConfig.provider === 'moyasar'
                              ? (platformPaymentConfig.mode === 'live' ? 'sk_live_...' : 'sk_test_...')
                              : (platformPaymentConfig.mode === 'live' ? 'sk_live_...' : 'sk_test_...')
                          }
                          value={platformPaymentConfig.secret_key || ''}
                          onChange={(e) => setPlatformPaymentConfig({ ...platformPaymentConfig, secret_key: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono outline-none focus:border-emerald-500 transition"
                        />
                        <span className="text-[10px] text-slate-500 mt-1 block">يُحفظ بأمان في قاعدة البيانات ولا يُعرض لعامة الزوار.</span>
                      </div>
                    </div>

                    {/* Webhook URL Display */}
                    <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="text-slate-300 font-bold block">رابط استلام إشعارات الدفع (Webhook URL):</span>
                        <code className="text-emerald-400 font-mono text-[11px] break-all select-all">
                          {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/platform-subscription` : '/api/webhooks/platform-subscription'}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/api/webhooks/platform-subscription`;
                          navigator.clipboard.writeText(url);
                          setCopiedWebhook(true);
                          setTimeout(() => setCopiedWebhook(false), 2500);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-[11px] flex items-center gap-1.5 shrink-0 transition"
                      >
                        {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedWebhook ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Manual & Offline Payment Methods (Cash & Bank Transfer) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
              <div>
                <h5 className="text-sm font-bold text-white flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-amber-400" />
                  <span>طرق التحصيل اليدوي والمباشر (Cash & Direct Bank Transfer)</span>
                </h5>
                <span className="text-xs text-slate-400">خيارات السداد خارج البوابة الإلكترونية مع إمكانية التفعيل الفوري</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cash Option */}
                <div className={`p-5 rounded-2xl border transition-all ${
                  platformPaymentConfig.allow_cash
                    ? 'bg-emerald-500/5 border-emerald-500/30'
                    : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                        💵
                      </div>
                      <div>
                        <h6 className="text-xs font-black text-white">السماح بالدفع كاش (Cash)</h6>
                        <span className="text-[10px] text-slate-400">تحصيل نقدي مباشر عبر الإدارة أو المشرف الميداني</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlatformPaymentConfig({ ...platformPaymentConfig, allow_cash: !platformPaymentConfig.allow_cash })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        platformPaymentConfig.allow_cash ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          platformPaymentConfig.allow_cash ? 'translate-x-0' : '-translate-x-5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    يتيح لك كمسؤول تفعيل اشتراك أي متجر بضغطة زر وتحديد المدة والمبلغ عند استلام النقد، مع إصدار فاتورة نظامية وتوثيق القيد في السجل المالي العام لضمان مطابقة الصندوق.
                  </p>
                </div>

                {/* Bank Transfer Option */}
                <div className={`p-5 rounded-2xl border transition-all ${
                  platformPaymentConfig.allow_bank_transfer
                    ? 'bg-blue-500/5 border-blue-500/30'
                    : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold">
                        🏦
                      </div>
                      <div>
                        <h6 className="text-xs font-black text-white">التحويل البنكي المباشر (Bank Wire)</h6>
                        <span className="text-[10px] text-slate-400">تحويل لحساب مؤسسة رادار الرسمي</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlatformPaymentConfig({ ...platformPaymentConfig, allow_bank_transfer: !platformPaymentConfig.allow_bank_transfer })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        platformPaymentConfig.allow_bank_transfer ? 'bg-blue-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          platformPaymentConfig.allow_bank_transfer ? 'translate-x-0' : '-translate-x-5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    يعرض للتجار بيانات الحساب البنكي والآيبان للتحويل المباشر مع إرفاق الإشعار، وتفعيل الاشتراك يدوياً من لوحة التحكم برقم الحوالة البنكية.
                  </p>
                </div>
              </div>

              {/* Bank Account Details Inputs */}
              {platformPaymentConfig.allow_bank_transfer && (
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                  <span className="text-xs font-bold text-slate-300 block">بيانات الحساب البنكي للمنصة (التي تظهر للتجار):</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-[11px] text-slate-400 font-bold block mb-1">اسم البنك:</label>
                      <input
                        type="text"
                        placeholder="مثال: مصرف الراجحي"
                        value={platformPaymentConfig.bank_details?.bank_name || ''}
                        onChange={(e) => setPlatformPaymentConfig({
                          ...platformPaymentConfig,
                          bank_details: {
                            bank_name: e.target.value,
                            account_name: platformPaymentConfig.bank_details?.account_name || '',
                            iban: platformPaymentConfig.bank_details?.iban || '',
                          },
                        })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 font-bold block mb-1">اسم صاحب الحساب:</label>
                      <input
                        type="text"
                        placeholder="مثال: مؤسسة رادار الرقمية"
                        value={platformPaymentConfig.bank_details?.account_name || ''}
                        onChange={(e) => setPlatformPaymentConfig({
                          ...platformPaymentConfig,
                          bank_details: {
                            bank_name: platformPaymentConfig.bank_details?.bank_name || '',
                            account_name: e.target.value,
                            iban: platformPaymentConfig.bank_details?.iban || '',
                          },
                        })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 font-bold block mb-1">رقم الآيبان (IBAN):</label>
                      <input
                        type="text"
                        placeholder="SA0000000000000000000000"
                        value={platformPaymentConfig.bank_details?.iban || ''}
                        onChange={(e) => setPlatformPaymentConfig({
                          ...platformPaymentConfig,
                          bank_details: {
                            bank_name: platformPaymentConfig.bank_details?.bank_name || '',
                            account_name: platformPaymentConfig.bank_details?.account_name || '',
                            iban: e.target.value.toUpperCase(),
                          },
                        })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono outline-none focus:border-blue-500"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit & Save Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                🔒 يتم حفظ الإعدادات بصلاحيات سيرفرية مؤمنة (Security Definer RPC) بدون أي مخاطر كشف للمفاتيح الحساسة.
              </span>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setManualSubPreSelectedStoreId(undefined);
                    setIsManualSubModalOpen(true);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition flex items-center gap-2"
                >
                  <Banknote className="w-4 h-4 text-emerald-400" />
                  <span>تفعيل اشتراك يدوي 💵</span>
                </button>

                <button
                  type="submit"
                  disabled={isSavingPaymentConfig}
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition flex-1 sm:flex-initial"
                >
                  {isSavingPaymentConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>حفظ وتثبيت إعدادات البوابات 💾</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: LEDGER ENTRY AUDIT TRACE */}
      {/* ========================================================================= */}
      {selectedLedgerAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black">
                  🔍
                </div>
                <div>
                  <h4 className="text-base font-black text-white">تتبع تدقيق القيد المالي (Audit Trail)</h4>
                  <span className="text-xs text-slate-400 font-mono">{selectedLedgerAudit.transaction_id}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedLedgerAudit(null)}
                className="p-2 rounded-xl bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="text-xs text-emerald-300 leading-relaxed">
                <strong>ضمان عدم التعديل (Immutable Record):</strong> هذا القيد مسجل بشكل نهائي في السجل المالي العام، ومحمي برمجياً من أي تعديل أو حذف مباشر.
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 block">الإجمالي (Gross)</span>
                <span className="text-sm font-black text-white font-mono">{selectedLedgerAudit.gross_amount.toFixed(2)} SAR</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] text-amber-400 block">ضريبة 15%</span>
                <span className="text-sm font-black text-amber-400 font-mono">{selectedLedgerAudit.vat_amount.toFixed(2)} SAR</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] text-purple-400 block">رسوم البوابة</span>
                <span className="text-sm font-black text-purple-400 font-mono">{selectedLedgerAudit.gateway_fee.toFixed(2)} SAR</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] text-cyan-400 block">صافي المنصة</span>
                <span className="text-sm font-black text-cyan-400 font-mono">{selectedLedgerAudit.net_platform_amount.toFixed(2)} SAR</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 block">بيانات التتبع والـ Metadata:</span>
              <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto" dir="ltr">
                {JSON.stringify(
                  {
                    id: selectedLedgerAudit.id,
                    transaction_id: selectedLedgerAudit.transaction_id,
                    invoice_id: selectedLedgerAudit.invoice_id,
                    store_id: selectedLedgerAudit.store_id,
                    affiliate_id: selectedLedgerAudit.affiliate_id,
                    payment_id: selectedLedgerAudit.payment_id,
                    transaction_type: selectedLedgerAudit.transaction_type,
                    created_by: selectedLedgerAudit.created_by,
                    effective_at: selectedLedgerAudit.effective_at,
                    metadata: selectedLedgerAudit.metadata,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: MANUAL LEDGER ADJUSTMENT */}
      {/* ========================================================================= */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">تسجيل قيد وتسوية محاسبية يدوية</h4>
                  <span className="text-xs text-slate-400">إضافة قيد دائم دون تعديل السجلات السابقة</span>
                </div>
              </div>
              <button
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="p-2 rounded-xl bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitManualAdjustment} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1.5">الجهة المستهدفة:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['store', 'partner', 'platform'] as const).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setAdjTargetType(t)}
                      className={`py-2 rounded-xl font-bold border transition ${
                        adjTargetType === t
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {t === 'store' ? 'متجر' : t === 'partner' ? 'شريك مسوق' : 'عام للمنصة'}
                    </button>
                  ))}
                </div>
              </div>

              {adjTargetType === 'store' && (
                <div>
                  <label className="text-slate-400 font-bold block mb-1.5">اختر المتجر:</label>
                  <select
                    value={adjTargetId}
                    onChange={(e) => setAdjTargetId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white outline-none focus:border-amber-500"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.slug})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {adjTargetType === 'partner' && (
                <div>
                  <label className="text-slate-400 font-bold block mb-1.5">اختر الشريك:</label>
                  <select
                    value={adjTargetId}
                    onChange={(e) => setAdjTargetId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white outline-none focus:border-amber-500"
                  >
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name} ({p.referral_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-bold block mb-1.5">نوع التسوية:</label>
                  <select
                    value={adjType}
                    onChange={(e) => setAdjType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white outline-none focus:border-amber-500 font-bold"
                  >
                    <option value="CREDIT">قيد دائن (إيداع / زيادة +)</option>
                    <option value="DEBIT">قيد مدين (خصم / استقطاع -)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1.5">المبلغ (ر.س):</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="500.00"
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-amber-400 font-mono font-bold outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">تصنيف سبب التسوية:</label>
                <select
                  value={adjCategory}
                  onChange={(e) => setAdjCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white outline-none focus:border-amber-500"
                >
                  <option value="ACCOUNTING_CORRECTION">تصحيح محاسبي / تسوية دفترية</option>
                  <option value="BANK_SETTLEMENT">تسوية مطابقة بنكية (Bank Settlement)</option>
                  <option value="CUSTOMER_COMPENSATION">تعويض عميل أو متجر</option>
                  <option value="DISPUTE_RESOLUTION">فض نزاع مالي (Dispute Resolution)</option>
                  <option value="OTHER">أسباب أخرى موثقة</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">رقم المرجع البنكي أو المحاسبي:</label>
                <input
                  type="text"
                  value={adjReference}
                  onChange={(e) => setAdjReference(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-mono outline-none focus:border-amber-500"
                  placeholder="ADJ-20261002-9841"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">الملاحظات والتفاصيل (Audit Notes):</label>
                <textarea
                  rows={3}
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-amber-500"
                  placeholder="اكتب التبرير المحاسبي بالتفصيل لضمان الشفافية في التدقيق..."
                  required
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-950 text-slate-400 hover:text-white border border-slate-800 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdj}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black flex items-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  {isSubmittingAdj && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>حفظ وتثبيت القيد ⚖️</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: AFFILIATE PAYOUT MODAL */}
      {/* ========================================================================= */}
      {isPayoutModalOpen && selectedPartnerForPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">تسجيل وتوثيق صرف مستحقات الشريك</h4>
                  <span className="text-xs text-slate-400">{selectedPartnerForPayout.display_name}</span>
                </div>
              </div>
              <button
                onClick={() => setIsPayoutModalOpen(false)}
                className="p-2 rounded-xl bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
              <span className="text-slate-300 font-bold">إجمالي المبلغ المستحق للصرف والترحيل:</span>
              <span className="text-xl font-black text-emerald-400 font-mono">
                {(partnerSummaries[selectedPartnerForPayout.id]?.total_payable ?? 0).toLocaleString()} ر.س
              </span>
            </div>

            <form onSubmit={handleSubmitPayout} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1.5">اسم البنك المحول إليه:</label>
                <input
                  type="text"
                  value={payoutBank}
                  onChange={(e) => setPayoutBank(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">رقم الآيبان البنكي (IBAN):</label>
                <input
                  type="text"
                  value={payoutIban}
                  onChange={(e) => setPayoutIban(e.target.value)}
                  placeholder="SA0000000000000000000000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-mono outline-none focus:border-emerald-500 text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">رقم مرجع الحوالة البنكية (Bank Ref TRX):</label>
                <input
                  type="text"
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-emerald-400 font-mono font-bold outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">ملاحظات التحويل:</label>
                <textarea
                  rows={2}
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-emerald-500"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPayoutModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-950 text-slate-400 hover:text-white border border-slate-800 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayout}
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {isSubmittingPayout && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>تأكيد الصرف وتوليد القيد 💸</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ZATCA REFUND & CREDIT NOTE MODAL */}
      {/* ========================================================================= */}
      {isRefundModalOpen && selectedInvoiceForRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">إصدار إشعار دائن واسترداد مالي ZATCA</h4>
                  <span className="text-xs text-slate-400 font-mono">{selectedInvoiceForRefund.invoice_number}</span>
                </div>
              </div>
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="p-2 rounded-xl bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 leading-relaxed">
              <strong>تنبيه الامتثال الضريبي:</strong> سيتم توليد إشعار دائن رسمي متوافق مع هيئة الزكاة والضريبة (ZATCA)، وعكس الضريبة (15%)، واسترداد عمولة المسوق تلقائياً دون التعديل على سجل الفاتورة التاريخي.
            </div>

            <form onSubmit={handleSubmitRefund} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1.5">
                  مبلغ الاسترداد (الحد الأقصى {selectedInvoiceForRefund.amount} ر.س):
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedInvoiceForRefund.amount}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-rose-400 font-mono font-bold outline-none focus:border-rose-500 text-lg"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">سبب الاسترداد (مطلب ضريبي):</label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white outline-none focus:border-rose-500"
                >
                  <option value="إلغاء الاشتراك بناءً على طلب التاجر وضمان الاسترداد">إلغاء الاشتراك بناءً على طلب التاجر وضمان الاسترداد</option>
                  <option value="خطأ في الفوترة أو تكرار العملية">خطأ في الفوترة أو تكرار العملية</option>
                  <option value="تسوية استثنائية معتمدة من الإدارة">تسوية استثنائية معتمدة من الإدارة</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">ملاحظات إضافية:</label>
                <textarea
                  rows={2}
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-rose-500"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsRefundModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-950 text-slate-400 hover:text-white border border-slate-800 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRefund}
                  className="px-6 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black flex items-center gap-2 shadow-lg shadow-rose-500/20"
                >
                  {isSubmittingRefund && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>تأكيد الإشعار الدائن والاسترداد 🔄</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: PLAN CREATE / EDIT MODAL */}
      {/* ========================================================================= */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                  {editingPlan ? '✏️' : '➕'}
                </div>
                <div>
                  <h4 className="text-base font-black text-white">{editingPlan ? 'تعديل خطة الاشتراك' : 'إضافة خطة اشتراك جديدة'}</h4>
                  <span className="text-xs text-slate-400">ستظهر مباشرة للتجار في صفحة الفوترة</span>
                </div>
              </div>
              <button
                onClick={() => setIsPlanModalOpen(false)}
                className="p-2 rounded-xl bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlanSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1.5">اسم الباقة (Plan Name):</label>
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="مثال: باقة النمو VIP (3 أشهر)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white outline-none focus:border-amber-500 font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-bold block mb-1.5">المدة بالأشهر:</label>
                  <input
                    type="number"
                    min="1"
                    value={planDurationMonths}
                    onChange={(e) => setPlanDurationMonths(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-mono font-bold outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1.5">السعر الإجمالي (ر.س):</label>
                  <input
                    type="number"
                    min="0"
                    value={planAmount}
                    onChange={(e) => setPlanAmount(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-amber-400 font-mono font-bold outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">أيام التجربة المجانية:</label>
                <input
                  type="number"
                  min="0"
                  value={planTrialDays}
                  onChange={(e) => setPlanTrialDays(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-mono outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1.5">المميزات (ميزة واحدة في كل سطر):</label>
                <textarea
                  rows={4}
                  value={planFeaturesText}
                  onChange={(e) => setPlanFeaturesText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-amber-500 leading-relaxed font-mono"
                  placeholder="ميزة 1&#10;ميزة 2&#10;ميزة 3"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-950 text-slate-400 hover:text-white border border-slate-800 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingPlan}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black flex items-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  {isSavingPlan && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{editingPlan ? 'حفظ التعديلات 💾' : 'إضافة الباقة 🚀'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: MANUAL STORE SUBSCRIPTION (CASH / BANK TRANSFER) */}
      {/* ========================================================================= */}
      <ManualSubscriptionModal
        isOpen={isManualSubModalOpen}
        onClose={() => setIsManualSubModalOpen(false)}
        stores={stores}
        preSelectedStoreId={manualSubPreSelectedStoreId}
        onSuccess={async (updatedStore, invoice) => {
          setActionSuccess(`تم تفعيل اشتراك متجر "${updatedStore.name}" بنجاح وإصدار فاتورة برقم: ${invoice?.invoice_number || invoice?.id || 'N/A'} 💵`);
          await loadAllFinancialData();
          setTimeout(() => setActionSuccess(null), 4000);
        }}
      />
    </div>
  );
};


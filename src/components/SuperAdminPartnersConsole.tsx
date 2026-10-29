import React, { useState, useEffect, useCallback } from 'react';
import { LoyaltyService } from '../lib/supabase';
import { generateSafeSlug } from '../lib/slugUtils';
import confetti from 'canvas-confetti';
import {
  Users,
  PlusCircle,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  Sparkles,
  X,
  Phone,
  User,
  Tag,
  MapPin,
  Target,
  KeyRound,
  Loader2,
  Send,
  MessageSquare,
  Share2,
  DollarSign,
  Percent,
  Receipt,
  Coins,
  CreditCard,
  Sliders,
  Bell,
  Trash2,
  Eye,
  EyeOff,
  Search,
  LayoutGrid,
  List,
} from 'lucide-react';
import { SendNotificationModal } from './SendNotificationModal';

interface SuperAdminPartnersConsoleProps {
  isDark?: boolean;
}

export const SuperAdminPartnersConsole: React.FC<SuperAdminPartnersConsoleProps> = ({ isDark = true }) => {
  const [partners, setPartners] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('radar_local_partners') || localStorage.getItem('radar_partners');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New Marketer / Partner Direct Form Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [pinCode, setPinCode] = useState('1234');
  const [partnerSlug, setPartnerSlug] = useState('');
  const [region, setRegion] = useState('');
  const [monthlyTarget, setMonthlyTarget] = useState<number | ''>('');
  const [commissionRate, setCommissionRate] = useState<number>(20);
  const [recurringCommissionRate, setRecurringCommissionRate] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Referral code live check & auto-generation state
  const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [codeStatusMsg, setCodeStatusMsg] = useState<string | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const codeCheckTimerRef = React.useRef<any>(null);

  // Commission Rate Edit Modal
  const [rateModalPartner, setRateModalPartner] = useState<any | null>(null);
  const [editingRate, setEditingRate] = useState<number>(20);
  const [editingRecurringRate, setEditingRecurringRate] = useState<number>(10);
  const [isUpdatingRate, setIsUpdatingRate] = useState(false);

  // Partner PIN Edit Modal State (Super Admin)
  const [pinModalPartner, setPinModalPartner] = useState<any | null>(null);
  const [editingPinValue, setEditingPinValue] = useState<string>('1234');
  const [isUpdatingPartnerPin, setIsUpdatingPartnerPin] = useState(false);

  // Settlement Modal State
  const [settlePartner, setSettlePartner] = useState<any | null>(null);
  const [settleSummary, setSettleSummary] = useState<any | null>(null);
  const [settleReference, setSettleReference] = useState('');
  const [isSettling, setIsSettling] = useState(false);
  const [loadingSettleSummary, setLoadingSettleSummary] = useState(false);

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState<{ id: string; type: 'affiliate' | 'merchant' } | null>(null);

  // 🎴 View Modes & Filter States
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  const togglePinVisibility = (partnerId: string) => {
    setRevealedPins((prev) => ({ ...prev, [partnerId]: !prev[partnerId] }));
  };

  const filteredPartners = partners.filter((p) => {
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && p.active) ||
      (statusFilter === 'INACTIVE' && !p.active);

    if (!matchesStatus) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const name = (p.display_name || p.name || '').toLowerCase();
    const phone = (p.affiliates?.phone || '').toLowerCase();
    const refCode = (p.affiliates?.referral_code || p.referral_code || '').toLowerCase();
    const region = (p.region || '').toLowerCase();

    return name.includes(q) || phone.includes(q) || refCode.includes(q) || region.includes(q);
  });

  // 🔔 Send Notification Modal State for Partner
  const [notificationModalData, setNotificationModalData] = useState<{
    isOpen: boolean;
    targetType: 'partner';
    targetName: string;
    targetId?: string;
  }>({
    isOpen: false,
    targetType: 'partner',
    targetName: '',
  });

  const handleOpenPartnerNotification = (p: any) => {
    setNotificationModalData({
      isOpen: true,
      targetType: 'partner',
      targetName: p.display_name || p.name || 'المسوق',
      targetId: p.id,
    });
  };

  const fetchPartners = useCallback(async () => {
    setError(null);
    try {
      const list = await LoyaltyService.getAllPartners();
      if (list && Array.isArray(list)) {
        setPartners(list);
      }
    } catch (err: any) {
      console.error('[SuperAdminPartnersConsole] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  // Referral code live check & unique code generation
  const verifyCodeUniqueness = useCallback(async (codeToTest: string) => {
    const clean = codeToTest.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!clean || clean.length < 2) {
      setCodeStatus('taken');
      setCodeStatusMsg('الكود يجب أن يتكون من حرفين أو رقمين على الأقل');
      return false;
    }

    setCodeStatus('checking');
    setCodeStatusMsg('جاري التحقق من توفر الكود في قاعدة البيانات... ⏳');

    try {
      const res = await LoyaltyService.checkReferralCodeAvailability(clean);
      if (res.available) {
        setCodeStatus('available');
        setCodeStatusMsg('الكود متاح وفريد ويمكن اعتماده ✅');
        return true;
      } else {
        setCodeStatus('taken');
        setCodeStatusMsg(res.reason || 'الكود مستخدم مسبقاً لشريك آخر ❌');
        return false;
      }
    } catch {
      setCodeStatus('available');
      setCodeStatusMsg(null);
      return true;
    }
  }, []);

  const handleCustomCodeChange = (raw: string) => {
    const clean = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setReferralCode(clean);
    setModalError(null);

    if (codeCheckTimerRef.current) {
      clearTimeout(codeCheckTimerRef.current);
    }

    if (!clean) {
      setCodeStatus('idle');
      setCodeStatusMsg(null);
      return;
    }

    codeCheckTimerRef.current = setTimeout(() => {
      verifyCodeUniqueness(clean);
    }, 350);
  };

  const handleAutoGenerateCode = async () => {
    setIsGeneratingCode(true);
    try {
      const generated = await LoyaltyService.generateUniqueReferralCode(partnerName);
      setReferralCode(generated);
      setCodeStatus('available');
      setCodeStatusMsg('تم توليد كود تلقائي فريد ومتاح بنجاح 🎲');
    } catch (e) {
      console.warn('Auto generate code failed:', e);
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const openNewPartnerModal = async () => {
    setModalError(null);
    setPartnerName('');
    setPartnerPhone('');
    setPinCode('1234');
    setPartnerSlug('');
    setRegion('');
    setMonthlyTarget('');
    setCommissionRate(20);
    setRecurringCommissionRate(10);
    setCodeStatus('checking');
    setCodeStatusMsg('جاري تحضير كود فريد...');
    setIsModalOpen(true);

    try {
      const initialCode = await LoyaltyService.generateUniqueReferralCode();
      setReferralCode(initialCode);
      setCodeStatus('available');
      setCodeStatusMsg('كود تلقائي مبدئي متاح (يمكنك تعديله أو كتابة كود مخصص)');
    } catch {
      const fallback = `r${Math.floor(1000 + Math.random() * 9000)}`;
      setReferralCode(fallback);
      setCodeStatus('available');
    }
  };

  // Open Rate Edit Modal
  const openRateModal = (p: any) => {
    const rateVal = Math.round((typeof p.commission_rate === 'number' ? p.commission_rate : 0.20) * 100);
    const recVal = Math.round((typeof p.recurring_commission_rate === 'number' ? p.recurring_commission_rate : 0.10) * 100);
    setEditingRate(rateVal);
    setEditingRecurringRate(recVal);
    setRateModalPartner(p);
  };

  const handleUpdateRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateModalPartner) return;
    setIsUpdatingRate(true);
    setError(null);
    try {
      const decimalRate = (Number(editingRate) || 20) / 100;
      const decimalRecurring = (Number(editingRecurringRate) || 10) / 100;
      await LoyaltyService.updatePartnerCommissionRate(rateModalPartner.id, decimalRate, decimalRecurring);
      setSuccess(`تم بنجاح تحديث نسب عمولة [${rateModalPartner.display_name}] (اشتراك جديد: ${editingRate}%، تجديد: ${editingRecurringRate}%) 🎉`);
      setRateModalPartner(null);
      await fetchPartners();
    } catch (err: any) {
      setError(err.message || 'فشل في تحديث نسبة العمولة');
    } finally {
      setIsUpdatingRate(false);
    }
  };

  // Open PIN Edit Modal
  const openPinModal = (p: any) => {
    setPinModalPartner(p);
    setEditingPinValue(p.pin_code || '1234');
    setError(null);
  };

  const handleUpdatePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModalPartner) return;
    const cleanPin = editingPinValue.trim();
    if (!cleanPin || cleanPin.length < 4) {
      setError('الرمز السري الجديد يجب أن يتكون من 4 أرقام على الأقل');
      return;
    }
    setIsUpdatingPartnerPin(true);
    setError(null);
    try {
      const res = await LoyaltyService.adminUpdatePartnerPin(pinModalPartner.id, cleanPin);
      if (res.success) {
        setSuccess(`تم بنجاح تحديث الرمز السري للمسوق [${pinModalPartner.display_name}] إلى [${cleanPin}] 🔒🎉`);
        setPinModalPartner(null);
        await fetchPartners();
      } else {
        setError(res.error || 'فشل تحديث الرمز السري');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تحديث الرمز السري');
    } finally {
      setIsUpdatingPartnerPin(false);
    }
  };

  // Open Settlement Modal
  const openSettlementModal = async (p: any) => {
    setSettlePartner(p);
    setSettleReference(`PAYOUT-${new Date().toISOString().substring(0, 10)}-${p.slug || 'PARTNER'}`);
    setSettleSummary(null);
    setLoadingSettleSummary(true);

    try {
      const summary = await LoyaltyService.getPartnerFinancialSummary(p.id, p.affiliate_id);
      setSettleSummary(summary);
    } catch (err) {
      console.warn('Failed to get partner financial summary:', err);
      setSettleSummary({
        pending_commissions: 0,
        earned_commissions: 0,
        paid_commissions: 0,
        bonuses_earned: 0,
        total_payable: 0,
        currency: 'SAR',
      });
    } finally {
      setLoadingSettleSummary(false);
    }
  };

  const handleExecuteSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlePartner) return;
    setIsSettling(true);
    setError(null);

    try {
      const res = await LoyaltyService.settlePartnerCommissions(settlePartner.id, settleReference.trim());
      if (res.success) {
        setSuccess(`تمت تسوية وصرف عمولات ومكافآت [${settlePartner.display_name}] بمبلغ ${res.total_amount || settleSummary?.total_payable || 0} ر.س بنجاح 💳✨`);
        try { confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); } catch {}
        setSettlePartner(null);
        await fetchPartners();
      } else {
        setError(res.error || 'فشلت عملية التسوية');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تنفيذ التسوية');
    } finally {
      setIsSettling(false);
    }
  };

  // Auto-generate slug when typing name
  const handleNameChange = (val: string) => {
    setPartnerName(val);
    setModalError(null);

    if (!partnerSlug) {
      setPartnerSlug(generateSafeSlug(val));
    }
  };

  // Saudi Phone Normalizer
  const normalizeSaudiPhone = (raw: string): string => {
    let clean = raw.replace(/\D/g, '');
    if (clean.startsWith('00966')) clean = clean.substring(5);
    else if (clean.startsWith('966')) clean = clean.substring(3);
    if (clean.length === 10 && clean.startsWith('05')) return clean;
    if (clean.length === 9 && clean.startsWith('5')) return `0${clean}`;
    return clean;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setError(null);
    setSuccess(null);

    const cleanName = partnerName.trim();
    const cleanPhone = normalizeSaudiPhone(partnerPhone.trim());
    let cleanCode = referralCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    if (!cleanName || cleanName.length < 2) {
      setModalError('يرجى كتابة اسم المسوق (حرفين على الأقل)');
      return;
    }

    if (!cleanPhone || cleanPhone.length < 9) {
      setModalError('يرجى إدخال رقم جوال صحيح للمسوق (05XXXXXXXX)');
      return;
    }

    if (!cleanCode || cleanCode.length < 2) {
      setModalError('يرجى كتابة كود إحالة متاح أو الضغط على زر التوليد التلقائي');
      return;
    }

    // Strict uniqueness verification before submitting
    const codeCheck = await LoyaltyService.checkReferralCodeAvailability(cleanCode);
    if (!codeCheck.available) {
      setCodeStatus('taken');
      setCodeStatusMsg(codeCheck.reason || 'الكود مستخدم مسبقاً لشريك آخر ❌');
      setModalError(codeCheck.reason || 'كود الإحالة مستخدم مسبقاً، يرجى كتابة رمز آخر');
      return;
    }

    let cleanSlug = partnerSlug.trim() ? generateSafeSlug(partnerSlug.trim()) : generateSafeSlug(cleanName);
    if (!cleanSlug) cleanSlug = cleanCode;

    setIsSubmitting(true);

    try {
      const decimalRate = (Number(commissionRate) || 20) / 100;
      const decimalRecurring = (Number(recurringCommissionRate) || 10) / 100;
      await LoyaltyService.addPartner({
        name: cleanName,
        phone: cleanPhone,
        referral_code: cleanCode,
        pin_code: pinCode.trim() || '1234',
        slug: cleanSlug,
        region: region.trim(),
        target_value: typeof monthlyTarget === 'number' ? monthlyTarget : 20,
        commission_rate: decimalRate,
        recurring_commission_rate: decimalRecurring,
      });

      setSuccess(`تم بنجاح إضافة المسوق [${cleanName}] بنسبة عمولة أول اشتراك: ${commissionRate}%، وتجديد: ${recurringCommissionRate}%، وكود: ${cleanCode} والرمز السري (PIN): ${pinCode.trim() || '1234'} 🎉`);
      setIsModalOpen(false);
      setPartnerName('');
      setPartnerPhone('');
      setReferralCode('');
      setPartnerSlug('');
      setRegion('');
      setMonthlyTarget('');
      setCommissionRate(20);
      setRecurringCommissionRate(10);
      setModalError(null);

      try { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); } catch {}
      await fetchPartners();
    } catch (err: any) {
      console.error(err);
      setModalError(err.message || 'حدث خطأ أثناء حفظ المسوق');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (partnerId: string, affiliateId: string, currentActive: boolean) => {
    try {
      const nextActive = await LoyaltyService.togglePartnerStatus(partnerId, affiliateId, currentActive);
      setPartners(
        partners.map((p) =>
          p.id === partnerId
            ? {
                ...p,
                active: nextActive,
                affiliates: p.affiliates ? { ...p.affiliates, status: nextActive ? 'ACTIVE' : 'SUSPENDED' } : p.affiliates,
              }
            : p
        )
      );
    } catch (err: any) {
      setError(err.message || 'فشل في تحديث حالة المسوق');
    }
  };

  const handleDeletePartner = async (partnerId: string, affiliateId: string, partnerDisplayName: string) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف حساب المسوق (${partnerDisplayName}) نهائياً؟`)) {
      return;
    }
    try {
      await LoyaltyService.deletePartner(partnerId, affiliateId);
      setPartners((prev) => prev.filter((p) => p.id !== partnerId && p.affiliate_id !== partnerId));
      setSuccess(`تم حذف حساب المسوق (${partnerDisplayName}) بنجاح 🗑️`);
    } catch (err: any) {
      setError(err.message || 'فشل في حذف المسوق');
    }
  };

  const copyUrl = (slugName: string) => {
    const full = `${window.location.origin}/${slugName}`;
    navigator.clipboard.writeText(full);
    setCopiedSlug(slugName);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  /**
   * Action A: Send to Affiliate (إرسال بيانات الدخول للوحة المسوق)
   * Contains Partner Dashboard URL (/partner) + PIN + Login Phone + Referral Code.
   */
  const getAffiliateCredentialsMessage = (p: any) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://myradar.sarl';
    const name = p.display_name || 'الشريك المعتمد';
    const phone = p.affiliates?.phone || '';
    const pin = p.pin_code || '1234';
    const refCode = p.affiliates?.referral_code || p.referral_code || 'r1001';

    return `مرحباً بك ${name} في المنصة كمسوق معتمد 🤝

تفاصيل حسابك ولوحة أرباحك:
🔗 رابط لوحة المسوق: ${origin}/partner
📱 رقم الدخول: ${phone}
🔑 الرمز السري (PIN): ${pin}

🎯 رابط الإحالة الخاص بك لمشاركته مع المتاجر:
${origin}/join?ref=${refCode}

يمكنك الدخول الآن لمتابعة المتاجر المسجلة والعمولات المحققة لحظياً.`;
  };

  /**
   * Action B: Promo Message for Merchant (رسالة دعوة رسمية للمتجر)
   * Copy derived directly from the landing page value proposition.
   * MUST NOT mention "affiliate", "partner", or "commission".
   */
  const getMerchantPromoMessage = (p: any) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://myradar.sarl';
    const refCode = p.affiliates?.referral_code || p.referral_code || 'r1001';

    return `عميلك اشترى منك اليوم... هل يضمن لك أحد عودته غداً؟ 🎯

المنظومة السحابية المتكاملة — محرك الولاء السحابي الأذكى للمتاجر والمقاهي في المملكة:

✨ بطاقات ولاء رقمية في محفظة العميل فوراً وبدون تحميل تطبيقات
⚡ شاشة كاشير سريعة لمسح الباركود وإضافة النقاط في ثوانٍ
🤖 مساعد ذكي يستعيد العملاء المنقطعين تلقائياً عبر رسائل تفاعلية
📊 زيادة مثبتة في تكرار زيارات العملاء ومتوسط الفاتورة بنسبة +35%

🚀 احجز تجربة مجانية لمتجرك وابدأ بتأسيس نظام ولائك الآن:
${origin}/join?ref=${refCode}`;
  };

  const handleCopyAffiliateMessage = (p: any) => {
    const msg = getAffiliateCredentialsMessage(p);
    navigator.clipboard.writeText(msg);
    setCopiedAction({ id: p.id, type: 'affiliate' });
    setTimeout(() => setCopiedAction(null), 2500);
  };

  const handleCopyMerchantPromoMessage = (p: any) => {
    const msg = getMerchantPromoMessage(p);
    navigator.clipboard.writeText(msg);
    setCopiedAction({ id: p.id, type: 'merchant' });
    setTimeout(() => setCopiedAction(null), 2500);
  };

  const getAffiliateWhatsAppUrl = (p: any) => {
    const msg = getAffiliateCredentialsMessage(p);
    const rawPhone = p.affiliates?.phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    let waPhone = cleanPhone;
    if (cleanPhone.startsWith('05')) waPhone = `966${cleanPhone.substring(1)}`;
    else if (cleanPhone.startsWith('5')) waPhone = `966${cleanPhone}`;

    if (waPhone.length >= 9) {
      return `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;
    }
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  };

  const getMerchantPromoWhatsAppUrl = (p: any) => {
    const msg = getMerchantPromoMessage(p);
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className={`border rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 transition-colors ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-xl sm:text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  إدارة المسوقين والشركاء (Partners & Affiliates)
                </h2>
                <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full font-bold border ${
                  isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}>
                  {partners.length} مسوق
                </span>
              </div>
              <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                إدارة شبكة المسوقين والشركاء، توليد أكواد الإحالة، ضبط نسب العمولات، وتسوية الأرباح فورياً.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openNewPartnerModal}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-5 py-3 rounded-2xl text-xs transition shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ إضافة مسوق جديد</span>
          </button>

          <button
            onClick={fetchPartners}
            disabled={loading}
            className={`p-3 rounded-2xl border transition ${
              isDark
                ? 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar with View Mode Toggle */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm transition-colors ${
        isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث باسم المسوق، الجوال، كود الإحالة (مثل r6710)، أو المنطقة..."
            className={`w-full pr-10 pl-4 py-2.5 rounded-xl text-xs border outline-none transition ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500/50'
                : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-amber-500'
            }`}
          />
        </div>

        {/* Status Filters & View Mode */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Pills */}
          <div className={`p-1 rounded-xl border flex items-center gap-1 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === 'ALL'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({partners.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm font-black'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>النشطين ({partners.filter((p) => p.active).length})</span>
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                statusFilter === 'INACTIVE'
                  ? 'bg-rose-500 text-white shadow-sm font-black'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              <span>الموقوفين ({partners.filter((p) => !p.active).length})</span>
            </button>
          </div>

          {/* View Mode Toggle: Cards vs Table */}
          <div className={`p-1 rounded-xl border flex items-center gap-1 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'cards'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="عرض الكروت التنفيذية الفخمة"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>كروت</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="عرض جدول مضغوط"
            >
              <List className="w-3.5 h-3.5" />
              <span>جدول</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2 animate-shake">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Content Area: Loading / Empty / Cards / Table */}
      {loading ? (
        <div className={`py-20 text-center space-y-3 rounded-3xl border ${
          isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-bold">جاري استرجاع قائمة المسوقين والشركاء...</p>
        </div>
      ) : filteredPartners.length === 0 ? (
        <div className={`py-16 text-center space-y-4 rounded-3xl border shadow-xl ${
          isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl mx-auto">
            🤝
          </div>
          <div className="space-y-1">
            <h4 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {partners.length === 0 ? 'لا يوجد مسوقين مسجلين حتى الآن' : 'لا توجد نتائج مطابقة لبحثك'}
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {partners.length === 0
                ? 'اضغط على "+ إضافة مسوق جديد" لإدخال الاسم ورقم الجوال لتوليد كوده ورابطه فوراً.'
                : 'جرب البحث بكلمة أخرى أو قم بإلغاء الفلاتر لإظهار كافة الشركاء.'}
            </p>
          </div>
          {partners.length === 0 && (
            <button
              onClick={openNewPartnerModal}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>إضافة مسوق الآن</span>
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        /* 🎴 1. EXECUTIVE CARDS GRID VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredPartners.map((p) => {
            const refCode = p.affiliates?.referral_code || p.referral_code || '—';
            const phone = p.affiliates?.phone || '—';
            const partnerPin = p.pin_code || '1234';
            const commRatePct = Math.round((typeof p.commission_rate === 'number' ? p.commission_rate : 0.20) * 100);
            const recurringRatePct = Math.round((typeof p.recurring_commission_rate === 'number' ? p.recurring_commission_rate : 0.10) * 100);
            const isPinRevealed = !!revealedPins[p.id];

            return (
              <div
                key={p.id}
                className={`rounded-3xl p-6 border transition-all duration-300 flex flex-col justify-between shadow-xl hover:shadow-2xl hover:-translate-y-0.5 group ${
                  isDark
                    ? 'bg-[#0E1622] hover:bg-[#121B2A] border-white/10 hover:border-amber-500/40'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200 hover:border-amber-500/40'
                }`}
              >
                <div className="space-y-4">
                  {/* Card Top: Avatar, Name, Phone, Status & Notification */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border shrink-0 transition-transform group-hover:scale-105 ${
                        p.active
                          ? isDark
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                          : isDark
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}>
                        {(p.display_name || 'م')[0]}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {p.display_name}
                          </h4>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              p.active
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${p.active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                            <span>{p.active ? 'نشط' : 'موقوف'}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <a
                            href={`tel:${phone}`}
                            dir="ltr"
                            className={`font-mono transition ${isDark ? 'text-slate-400 hover:text-amber-400' : 'text-slate-500 hover:text-amber-600'}`}
                          >
                            📞 {phone}
                          </a>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenPartnerNotification(p)}
                      className={`p-2 rounded-xl transition text-[11px] font-bold flex items-center gap-1 border shadow-sm shrink-0 ${
                        isDark
                          ? 'bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border-amber-500/30'
                          : 'bg-amber-50 hover:bg-amber-400 text-amber-800 hover:text-slate-950 border-amber-300'
                      }`}
                      title="إرسال إشعار فوري مع نغمة صوتية لهذا المسوق"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">إشعار 🔔</span>
                    </button>
                  </div>

                  {/* Section 1: Referral Code & Secret PIN (Masked with Eye Toggle) */}
                  <div className={`p-3.5 rounded-2xl border grid grid-cols-1 sm:grid-cols-2 gap-3 ${
                    isDark ? 'bg-[#080C13] border-white/5' : 'bg-slate-50 border-slate-200/80'
                  }`}>
                    {/* Referral Code */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-amber-400" />
                        <span className={`text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>كود الإحالة:</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono font-black text-xs">
                          {refCode}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(refCode);
                            setCopiedSlug(`code_${p.id}`);
                            setTimeout(() => setCopiedSlug(null), 2000);
                          }}
                          className={`p-1.5 rounded-lg border transition ${
                            isDark ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                          }`}
                          title="نسخ كود الإحالة"
                        >
                          {copiedSlug === `code_${p.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    {/* Secret PIN - Masked by default with Eye button 🔒 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                        <span className={`text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>الرمز السري (PIN):</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`px-2.5 py-1 rounded-xl border font-mono font-black text-xs tracking-widest ${
                          isDark ? 'bg-slate-950 border-slate-800 text-amber-400' : 'bg-white border-slate-200 text-amber-700'
                        }`}>
                          {isPinRevealed ? partnerPin : '••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePinVisibility(p.id)}
                          className={`p-1.5 rounded-lg border transition ${
                            isDark ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-400' : 'bg-white border-slate-200 text-slate-500 hover:text-amber-600'
                          }`}
                          title={isPinRevealed ? 'إخفاء الرمز السري' : 'كشف الرمز السري'}
                        >
                          {isPinRevealed ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => openPinModal(p)}
                          className={`p-1.5 rounded-lg border transition ${
                            isDark ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-400' : 'bg-white border-slate-200 text-slate-500 hover:text-amber-600'
                          }`}
                          title="تعديل الرمز السري للمسوق"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Commission Rates & Target */}
                  <div className={`p-3.5 rounded-2xl border grid grid-cols-1 sm:grid-cols-2 gap-3 ${
                    isDark ? 'bg-[#080C13] border-white/5' : 'bg-slate-50 border-slate-200/80'
                  }`}>
                    {/* Commission Rates with Quick Edit */}
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>العمولات:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono font-bold text-[11px]" title="عمولة أول اشتراك">
                          جديد: {commRatePct}%
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-mono font-bold text-[11px]" title="عمولة التجديد">
                          تجديد: {recurringRatePct}%
                        </span>
                        <button
                          type="button"
                          onClick={() => openRateModal(p)}
                          className={`p-1.5 rounded-lg border transition ${
                            isDark ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-400' : 'bg-white border-slate-200 text-slate-500 hover:text-amber-600'
                          }`}
                          title="تعديل نسب العمولة"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Region & Target */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-[11px]">
                        <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{p.region || 'عام'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px]">
                        <Target className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                          {p.target_value ? `${p.target_value} متجر/شهر` : 'بدون هدف'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Direct Referral URL Bar */}
                  <div className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                    isDark ? 'bg-[#080C13] border-white/5' : 'bg-slate-50 border-slate-200/80'
                  }`}>
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <ExternalLink className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className={`text-[11px] font-mono font-bold truncate ${isDark ? 'text-amber-300' : 'text-amber-700'}`} dir="ltr">
                        /join?ref={refCode}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const full = `${window.location.origin}/join?ref=${refCode}`;
                          navigator.clipboard.writeText(full);
                          setCopiedSlug(`ref_${p.id}`);
                          setTimeout(() => setCopiedSlug(null), 2000);
                        }}
                        className={`p-1.5 px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition ${
                          isDark ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                        title="نسخ رابط الإحالة المباشر"
                      >
                        {copiedSlug === `ref_${p.id}` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">تم</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>
                      <a
                        href={`/join?ref=${refCode}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`p-1.5 rounded-lg border transition ${
                          isDark ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                        }`}
                        title="معاينة صفحة الهبوط للإحالة"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Section 4: WhatsApp & Dispatch Cards (Action A & Action B) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Box A: Affiliate Portal Credentials */}
                    <div className={`p-3 rounded-2xl border flex flex-col justify-between gap-2.5 ${
                      isDark ? 'bg-slate-950/70 border-emerald-500/20' : 'bg-emerald-50/50 border-emerald-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          <span className={`text-[11px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>بيانات المسوق</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">لوحة الأرباح</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <a
                          href={getAffiliateWhatsAppUrl(p)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition text-[11px] font-bold flex items-center justify-center gap-1"
                          title="إرسال رابط لوحة المسوق والرمز السري (PIN) عبر واتساب"
                        >
                          <Send className="w-3 h-3" />
                          <span>واتساب</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyAffiliateMessage(p)}
                          className={`p-1.5 rounded-xl border transition text-[11px] font-bold flex items-center justify-center gap-1 ${
                            isDark ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white' : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900'
                          }`}
                          title="نسخ بيانات الدخول للمسوق"
                        >
                          {copiedAction?.id === p.id && copiedAction?.type === 'affiliate' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">تم النسخ</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>نسخ</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Box B: Store Official Promo Invitation */}
                    <div className={`p-3 rounded-2xl border flex flex-col justify-between gap-2.5 ${
                      isDark ? 'bg-slate-950/70 border-amber-500/20' : 'bg-amber-50/50 border-amber-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                          <span className={`text-[11px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>دعوة المتجر</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">رسالة رسمية</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <a
                          href={getMerchantPromoWhatsAppUrl(p)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition text-[11px] font-bold flex items-center justify-center gap-1"
                          title="نشر رسالة المتجر الرسمية عبر واتساب"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>واتساب</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyMerchantPromoMessage(p)}
                          className={`p-1.5 rounded-xl border transition text-[11px] font-bold flex items-center justify-center gap-1 ${
                            isDark ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white' : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900'
                          }`}
                          title="نسخ نص الدعوة الرسمية للمتجر"
                        >
                          {copiedAction?.id === p.id && copiedAction?.type === 'merchant' ? (
                            <>
                              <Check className="w-3 h-3 text-amber-400" />
                              <span className="text-amber-400">تم النسخ</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>نسخ</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Bottom: Settlement & Account Actions */}
                <div className="pt-4 mt-5 border-t border-white/5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openSettlementModal(p)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/30 text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]"
                    title="صرف وتسوية العمولات والمكافآت"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>تسوية المستحقات</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(p.id, p.affiliate_id, p.active)}
                      className={`p-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                        p.active
                          ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      }`}
                      title={p.active ? 'إيقاف الحساب' : 'تنشيط الحساب'}
                    >
                      {p.active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeletePartner(p.id, p.affiliate_id, p.display_name)}
                      className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                      title="حذف حساب المسوق نهائياً"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 📋 2. COMPACT TABLE VIEW (WITH SECURE PIN MASKING) */
        <div className={`border rounded-3xl overflow-hidden shadow-2xl ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className={`border-b text-[11px] font-bold ${
                  isDark ? 'border-slate-800 bg-slate-950/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}>
                  <th className="py-3.5 px-4">اسم المسوق والجوال</th>
                  <th className="py-3.5 px-4">كود الإحالة</th>
                  <th className="py-3.5 px-4">النسب (%)</th>
                  <th className="py-3.5 px-4">الرمز السري (PIN)</th>
                  <th className="py-3.5 px-4">رابط الإحالة</th>
                  <th className="py-3.5 px-4 min-w-[220px]">إرسال ونشر (WhatsApp & Copy)</th>
                  <th className="py-3.5 px-4">المنطقة والهدف</th>
                  <th className="py-3.5 px-4">الحالة</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                {filteredPartners.map((p) => {
                  const refCode = p.affiliates?.referral_code || p.referral_code || '—';
                  const phone = p.affiliates?.phone || '—';
                  const partnerPin = p.pin_code || '1234';
                  const commRatePct = Math.round((typeof p.commission_rate === 'number' ? p.commission_rate : 0.20) * 100);
                  const recurringRatePct = Math.round((typeof p.recurring_commission_rate === 'number' ? p.recurring_commission_rate : 0.10) * 100);
                  const isPinRevealed = !!revealedPins[p.id];

                  return (
                    <tr key={p.id} className={`transition ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <strong className={`block text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{p.display_name}</strong>
                            <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                              📞 {phone}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenPartnerNotification(p)}
                            className="p-1.5 px-2 rounded-xl bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/30 transition text-[10px] font-bold flex items-center gap-1 shrink-0 shadow-sm"
                            title="إرسال إشعار فوري مع نغمة صوتية"
                          >
                            <Bell className="w-3.5 h-3.5" />
                            <span>إشعار</span>
                          </button>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono font-bold text-amber-400">
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                          {refCode}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="space-y-1">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono font-bold text-[10px] block">
                              جديد: {commRatePct}%
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-mono font-bold text-[10px] block">
                              تجديد: {recurringRatePct}%
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openRateModal(p)}
                            className={`p-1.5 rounded-xl border transition ${
                              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-amber-600 border-slate-200'
                            }`}
                            title="تعديل نسب العمولة"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Secure Masked PIN in Table */}
                      <td className="py-4 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-black tracking-widest ${
                            isDark ? 'bg-slate-950 border-slate-800 text-amber-400' : 'bg-slate-100 border-slate-200 text-amber-700'
                          }`}>
                            {isPinRevealed ? partnerPin : '••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePinVisibility(p.id)}
                            className={`p-1 rounded-lg border transition ${
                              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                            }`}
                            title={isPinRevealed ? 'إخفاء الرمز' : 'كشف الرمز'}
                          >
                            {isPinRevealed ? <EyeOff className="w-3 h-3 text-amber-400" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => openPinModal(p)}
                            className={`p-1 rounded-lg border transition ${
                              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                            }`}
                            title="تعديل الرمز السري"
                          >
                            <KeyRound className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono">
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                          <span>/join?ref={refCode}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const full = `${window.location.origin}/join?ref=${refCode}`;
                              navigator.clipboard.writeText(full);
                              setCopiedSlug(`ref_${p.id}`);
                              setTimeout(() => setCopiedSlug(null), 2000);
                            }}
                            className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition"
                            title="نسخ الرابط"
                          >
                            {copiedSlug === `ref_${p.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1.5">
                          {/* Affiliate Portal Credentials */}
                          <div className={`flex items-center justify-between border rounded-lg p-1 px-2 ${
                            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}>
                            <span className="text-[10px] font-bold">بيانات المسوق:</span>
                            <div className="flex items-center gap-1">
                              <a
                                href={getAffiliateWhatsAppUrl(p)}
                                target="_blank"
                                rel="noreferrer"
                                className="p-0.5 px-1.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold"
                              >
                                واتساب
                              </a>
                              <button
                                type="button"
                                onClick={() => handleCopyAffiliateMessage(p)}
                                className="p-0.5 px-1.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold"
                              >
                                {copiedAction?.id === p.id && copiedAction?.type === 'affiliate' ? 'تم' : 'نسخ'}
                              </button>
                            </div>
                          </div>

                          {/* Merchant Promo Message */}
                          <div className={`flex items-center justify-between border rounded-lg p-1 px-2 ${
                            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}>
                            <span className="text-[10px] font-bold">دعوة المتجر:</span>
                            <div className="flex items-center gap-1">
                              <a
                                href={getMerchantPromoWhatsAppUrl(p)}
                                target="_blank"
                                rel="noreferrer"
                                className="p-0.5 px-1.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold"
                              >
                                واتساب
                              </a>
                              <button
                                type="button"
                                onClick={() => handleCopyMerchantPromoMessage(p)}
                                className="p-0.5 px-1.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold"
                              >
                                {copiedAction?.id === p.id && copiedAction?.type === 'merchant' ? 'تم' : 'نسخ'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span className="block text-[11px]">{p.region ? `📍 ${p.region}` : '—'}</span>
                        <span className="text-[10px] text-slate-400">{p.target_value ? `الهدف: ${p.target_value}` : 'بدون هدف'}</span>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            p.active
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${p.active ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                          <span>{p.active ? 'نشط' : 'موقوف'}</span>
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openSettlementModal(p)}
                            className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold"
                            title="تسوية"
                          >
                            تسوية
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(p.id, p.affiliate_id, p.active)}
                            className={`p-1.5 rounded-lg border text-xs ${
                              p.active ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                            }`}
                          >
                            {p.active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                          <a
                            href={`/join?ref=${refCode}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`p-1.5 rounded-lg border transition ${
                              isDark ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeletePartner(p.id, p.affiliate_id, p.display_name)}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Simple 1-Step Add New Marketer */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-black text-white">إضافة مسوق / شريك جديد</h4>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error inside modal */}
            {modalError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-bold flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Field 1: Marketer Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  <span>اسم المسوق أو المؤسسة *</span>
                </label>
                <input
                  type="text"
                  required
                  value={partnerName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="مثال: صالح القحطاني"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              {/* Field 2: Marketer Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-amber-400" />
                  <span>رقم جوال المسوق *</span>
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={partnerPhone}
                  onChange={(e) => {
                    setPartnerPhone(e.target.value);
                    setModalError(null);
                  }}
                  placeholder="05XXXXXXXX"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs font-mono text-white placeholder-slate-600 outline-none transition text-right"
                />
                <p className="text-[10px] text-slate-500">يستخدمه المسوق للدخول إلى لوحة أرباحه عبر /partner</p>
              </div>

              {/* Field 3: Dual Commission Rates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-emerald-400" />
                    <span>عمولة اشتراك جديد (%) *</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(Number(e.target.value))}
                    placeholder="20"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-2xl px-3 py-2.5 text-xs font-mono text-emerald-400 font-bold outline-none transition"
                  />
                  <p className="text-[10px] text-slate-500">لأول اشتراك/تأسيس للمتجر</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-cyan-400" />
                    <span>عمولة التجديد الدوري (%) *</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={recurringCommissionRate}
                    onChange={(e) => setRecurringCommissionRate(Number(e.target.value))}
                    placeholder="10"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-2xl px-3 py-2.5 text-xs font-mono text-cyan-400 font-bold outline-none transition"
                  />
                  <p className="text-[10px] text-slate-500">عند تجديد الاشتراك كل دورة</p>
                </div>
              </div>

              {/* Field 4: Referral Code with Auto-Gen & Real-Time Availability Check */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span>كود الإحالة ورابط الشريك *</span>
                  </label>
                  <button
                    type="button"
                    disabled={isGeneratingCode}
                    onClick={handleAutoGenerateCode}
                    className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[11px] font-bold flex items-center gap-1 transition active:scale-95 disabled:opacity-50"
                  >
                    {isGeneratingCode ? (
                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-amber-400" />
                    )}
                    <span>توليد كود تلقائي 🎲</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={referralCode}
                    onChange={(e) => handleCustomCodeChange(e.target.value)}
                    placeholder="مثال: r4820 أو salah أو alhaj"
                    className={`w-full bg-slate-900 border rounded-xl px-4 py-2.5 text-xs font-mono font-bold outline-none transition ${
                      codeStatus === 'taken'
                        ? 'border-rose-500/80 text-rose-400 focus:border-rose-500'
                        : codeStatus === 'available'
                        ? 'border-emerald-500/80 text-emerald-400 focus:border-emerald-500'
                        : 'border-slate-800 text-amber-400 focus:border-amber-500'
                    }`}
                  />
                  <div className="absolute left-3 top-2.5 flex items-center">
                    {codeStatus === 'checking' && (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    )}
                    {codeStatus === 'available' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    {codeStatus === 'taken' && (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                </div>

                {/* Status Message */}
                {codeStatusMsg && (
                  <p
                    className={`text-[11px] font-bold flex items-center gap-1 mt-1 ${
                      codeStatus === 'taken'
                        ? 'text-rose-400'
                        : codeStatus === 'available'
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {codeStatus === 'available' && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                    {codeStatus === 'taken' && <X className="w-3 h-3 text-rose-400 shrink-0" />}
                    <span>{codeStatusMsg}</span>
                  </p>
                )}

                <p className="text-[10px] text-slate-500 leading-relaxed">
                  💡 يمكنك كتابة كود مخصص بالاسم أو الرمز (مثل: salah أو alhaj أو r5000) أو الضغط على "توليد كود تلقائي". يقوم النظام بفحص الكود فورياً في قاعدة البيانات لمنع تكراره لأي شريك آخر.
                </p>
              </div>

              {/* Field 4: PIN Code (Default 1234) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>الرمز السري (PIN Code) *</span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="1234"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs font-mono text-white placeholder-slate-600 outline-none transition text-center tracking-widest font-bold"
                />
                <p className="text-[10px] text-slate-500">الرمز السري للدخول إلى /partner (الافتراضي 1234)</p>
              </div>

              {/* Optional Fields: Region & Target */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>المنطقة (اختياري)</span>
                  </label>
                  <input
                    type="text"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="الرياض، جدة..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    <span>الهدف الشهري</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={monthlyTarget}
                    onChange={(e) => setMonthlyTarget(e.target.value ? Number(e.target.value) : '')}
                    placeholder="20 متجر"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || codeStatus === 'taken' || codeStatus === 'checking'}
                  className="flex-1 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <span>تأكيد وإنشاء حساب المسوق 🚀</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Quick Edit Commission Rate */}
      {rateModalPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-black text-white">تعديل نسبة العمولة المخصصة</h4>
              </div>
              <button onClick={() => setRateModalPartner(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
              <span className="text-slate-400 block text-[11px]">الشريك:</span>
              <strong className="text-white text-sm">{rateModalPartner.display_name}</strong>
              <span className="text-slate-500 block text-[10px] font-mono mt-0.5">كود: {rateModalPartner.affiliates?.referral_code || rateModalPartner.referral_code}</span>
            </div>

            <form onSubmit={handleUpdateRateSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>عمولة أول اشتراك/تأسيس (%)</span>
                  <span className="font-mono text-emerald-400 font-black">{editingRate}%</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={editingRate}
                  onChange={(e) => setEditingRate(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>5%</span>
                  <span>20%</span>
                  <span>35%</span>
                  <span>50%</span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>عمولة التجديد الدوري (%)</span>
                  <span className="font-mono text-cyan-400 font-black">{editingRecurringRate}%</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="40"
                  step="5"
                  value={editingRecurringRate}
                  onChange={(e) => setEditingRecurringRate(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>5%</span>
                  <span>10% (افتراضي)</span>
                  <span>25%</span>
                  <span>40%</span>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isUpdatingRate}
                  className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUpdatingRate ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>حفظ النسب الجديدة 💾</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setRateModalPartner(null)}
                  className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Partner PIN Edit Modal (Super Admin) */}
      {pinModalPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-sm w-full bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-black text-white">تعديل الرمز السري (PIN)</h4>
              </div>
              <button onClick={() => setPinModalPartner(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <strong className="text-white block text-sm">{pinModalPartner.display_name}</strong>
                  <span className="text-slate-400 text-[11px] font-mono" dir="ltr">📞 {pinModalPartner.affiliates?.phone || '—'}</span>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono font-bold text-xs">
                  {pinModalPartner.affiliates?.referral_code || pinModalPartner.referral_code}
                </span>
              </div>
            </div>

            <form onSubmit={handleUpdatePinSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">الرمز السري الجديد (PIN)</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={editingPinValue}
                    onChange={(e) => setEditingPinValue(e.target.value)}
                    placeholder="1234"
                    dir="ltr"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-4 pl-10 py-3 text-sm text-white placeholder-slate-600 outline-none transition text-left tracking-widest font-mono font-bold"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-500">يتكون من 4 أرقام على الأقل لدخول بوابة الشريك</p>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isUpdatingPartnerPin}
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  {isUpdatingPartnerPin ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>حفظ الرمز السري 🔒</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setPinModalPartner(null)}
                  className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Settlement & Payout */}
      {settlePartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-black text-white">صرف وتسوية عمولات الشريك</h4>
              </div>
              <button onClick={() => setSettlePartner(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <strong className="text-white block text-sm">{settlePartner.display_name}</strong>
                  <span className="text-slate-400 text-[11px]">📞 {settlePartner.affiliates?.phone || '—'}</span>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono font-bold text-xs">
                  كود: {settlePartner.affiliates?.referral_code || settlePartner.referral_code}
                </span>
              </div>
            </div>

            {loadingSettleSummary ? (
              <div className="py-8 text-center space-y-2">
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400">جاري احتساب دفتر العمولات والمكافآت...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Financial Breakdowns */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 block">عمولات مكتسبة</span>
                    <span className="text-base font-black font-mono text-emerald-400 block">
                      {settleSummary?.earned_commissions || 0} <span className="text-xs">ر.س</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 block">مكافآت محققة</span>
                    <span className="text-base font-black font-mono text-amber-400 block">
                      {settleSummary?.bonuses_earned || 0} <span className="text-xs">ر.س</span>
                    </span>
                  </div>
                </div>

                {/* Total Grand Payable */}
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-400 block">إجمالي المبلغ المستحق للصرف</span>
                    <span className="text-[10px] text-slate-400">سيتم ترحيل هذه الحركات إلى (مدفوع PAID)</span>
                  </div>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    {settleSummary?.total_payable || 0} <span className="text-xs font-normal">ر.س</span>
                  </span>
                </div>

                <form onSubmit={handleExecuteSettlement} className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                      <span>مرجع التحويل أو الحوالة البنكية *</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={settleReference}
                      onChange={(e) => setSettleReference(e.target.value)}
                      placeholder="مثال: حوالة الراجحي #94821"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-600 outline-none transition"
                    />
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isSettling || (settleSummary?.total_payable || 0) === 0}
                      className="flex-1 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSettling ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>جاري التسوية...</span>
                        </>
                      ) : (
                        <span>تأكيد الصرف والترحيل إلى مدفوع 💸</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettlePartner(null)}
                      className="px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🔔 Send Notification Modal for Partner */}
      <SendNotificationModal
        isOpen={notificationModalData.isOpen}
        onClose={() => setNotificationModalData((prev) => ({ ...prev, isOpen: false }))}
        targetType="partner"
        targetName={notificationModalData.targetName}
        targetId={notificationModalData.targetId}
      />
    </div>
  );
};

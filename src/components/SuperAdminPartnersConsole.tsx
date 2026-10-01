import React, { useState, useEffect, useCallback } from 'react';
import { LoyaltyService } from '../lib/supabase';
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
} from 'lucide-react';

export const SuperAdminPartnersConsole: React.FC = () => {
  const [partners, setPartners] = useState<any[]>([]);
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState<{ id: string; type: 'affiliate' | 'merchant' } | null>(null);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await LoyaltyService.getAllPartners();
      setPartners(list || []);
    } catch (err: any) {
      console.error('[SuperAdminPartnersConsole] Fetch error:', err);
      setError('تعذر استرجاع قائمة الشركاء');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  // Generate random 4-digit code prefixed with lowercase 'r' (e.g. r4819)
  const generateNewReferralCode = () => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    return `r${randomDigits}`;
  };

  const openNewPartnerModal = () => {
    setModalError(null);
    setPartnerName('');
    setPartnerPhone('');
    setReferralCode(generateNewReferralCode());
    setPinCode('1234');
    setPartnerSlug('');
    setRegion('');
    setMonthlyTarget('');
    setIsModalOpen(true);
  };

  // Auto-generate slug when typing name
  const handleNameChange = (val: string) => {
    setPartnerName(val);
    setModalError(null);

    const cleanLatin = val
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    if (!partnerSlug) {
      setPartnerSlug(cleanLatin || '');
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
    let cleanCode = referralCode.trim() || generateNewReferralCode();
    // Ensure code has lowercase r prefix
    if (!cleanCode.startsWith('r') && !cleanCode.startsWith('R')) {
      cleanCode = `r${cleanCode}`;
    }
    cleanCode = cleanCode.toLowerCase();

    let cleanSlug = (partnerSlug.trim() || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')).toLowerCase();
    if (!cleanSlug) cleanSlug = `partner-${Math.floor(1000 + Math.random() * 9000)}`;

    if (!cleanName || cleanName.length < 2) {
      setModalError('يرجى كتابة اسم المسوق (حرفين على الأقل)');
      return;
    }

    if (!cleanPhone || cleanPhone.length < 9) {
      setModalError('يرجى إدخال رقم جوال صحيح للمسوق (05XXXXXXXX)');
      return;
    }

    setIsSubmitting(true);

    try {
      await LoyaltyService.addPartner({
        name: cleanName,
        phone: cleanPhone,
        referral_code: cleanCode,
        pin_code: pinCode.trim() || '1234',
        slug: cleanSlug,
        region: region.trim(),
        target_value: typeof monthlyTarget === 'number' ? monthlyTarget : 0,
      });

      setSuccess(`تم بنجاح إضافة المسوق [${cleanName}] بكود: ${cleanCode} والرمز السري (PIN): ${pinCode.trim() || '1234'} 🎉`);
      setIsModalOpen(false);
      setPartnerName('');
      setPartnerPhone('');
      setReferralCode('');
      setPartnerSlug('');
      setRegion('');
      setMonthlyTarget('');
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
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://radar.com';
    const name = p.display_name || 'الشريك المعتمد';
    const phone = p.affiliates?.phone || '';
    const pin = p.pin_code || '1234';
    const refCode = p.affiliates?.referral_code || p.referral_code || 'r1001';

    return `مرحباً بك ${name} في منصة رادار كمسوق معتمد 🤝

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
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://radar.com';
    const refCode = p.affiliates?.referral_code || p.referral_code || 'r1001';

    return `عميلك اشترى منك اليوم... هل يضمن لك أحد عودته غداً؟ 🎯

منظومة RADAR — محرك الولاء السحابي الأذكى للمتاجر والمقاهي في المملكة:

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
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white">إدارة المسوقين والشركاء (Partners & Affiliates)</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  {partners.length} مسوق
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                أضف مسوقين جدد بالاسم ورقم الجوال والرمز السري (PIN) لتوليد كود الإحالة (مثل r1042) ومشاركة الروابط بسهولة.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openNewPartnerModal}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2.5 rounded-2xl text-xs transition shadow-lg shadow-amber-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ إضافة مسوق جديد</span>
          </button>

          <button
            onClick={fetchPartners}
            disabled={loading}
            className="p-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
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

      {/* Partners List Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">جاري استرجاع قائمة المسوقين...</p>
          </div>
        ) : partners.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto text-xl">
              🤝
            </div>
            <h4 className="text-base font-bold text-white">لا يوجد مسوقين مسجلين حتى الآن</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              اضغط على "+ إضافة مسوق جديد" لإدخال الاسم ورقم الجوال لتوليد كوده ورابطه فوراً.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400">
                  <th className="py-3.5 px-4">اسم المسوق والجوال</th>
                  <th className="py-3.5 px-4">كود الإحالة (Referral)</th>
                  <th className="py-3.5 px-4">الرمز السري (PIN)</th>
                  <th className="py-3.5 px-4">رابط الإحالة المباشر</th>
                  <th className="py-3.5 px-4 min-w-[240px]">إرسال ونشر (WhatsApp & Copy)</th>
                  <th className="py-3.5 px-4">المنطقة والهدف</th>
                  <th className="py-3.5 px-4">حالة الحساب</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {partners.map((p) => {
                  const refCode = p.affiliates?.referral_code || '—';
                  const phone = p.affiliates?.phone || '—';
                  const partnerPin = p.pin_code || '1234';

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-4 px-4">
                        <strong className="text-white block text-sm">{p.display_name}</strong>
                        <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                          📞 {phone}
                        </span>
                      </td>

                      <td className="py-4 px-4 font-mono font-bold text-amber-400">
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                          {refCode}
                        </span>
                      </td>

                      <td className="py-4 px-4 font-mono text-slate-300">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                          🔑 {partnerPin}
                        </span>
                      </td>

                      <td className="py-4 px-4 font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                            <span>/join?ref={refCode}</span>
                            <button
                              onClick={() => {
                                const full = `${window.location.origin}/join?ref=${refCode}`;
                                navigator.clipboard.writeText(full);
                                setCopiedSlug(`ref_${p.id}`);
                                setTimeout(() => setCopiedSlug(null), 2000);
                              }}
                              className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition"
                              title="نسخ رابط الإحالة المباشر"
                            >
                              {copiedSlug === `ref_${p.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          {p.slug && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                              <span>المسار البديل:</span>
                              <span className="text-slate-400">/{p.slug}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 📲 WhatsApp & Share Actions (Action A & Action B) */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-2 min-w-[230px]">
                          
                          {/* Action A: Send to Affiliate (إرسال بيانات الدخول للمسوق) */}
                          <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl p-1.5 px-2.5 shadow-sm">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                              <span className="text-[11px] font-bold text-slate-200">بيانات المسوق</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <a
                                href={getAffiliateWhatsAppUrl(p)}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition text-[10px] font-bold flex items-center gap-1"
                                title="إرسال رابط لوحة المسوق والرمز السري (PIN) عبر واتساب"
                              >
                                <Send className="w-3 h-3" />
                                <span>واتساب</span>
                              </a>
                              <button
                                onClick={() => handleCopyAffiliateMessage(p)}
                                className="p-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition text-[10px] font-bold flex items-center gap-1"
                                title="نسخ رسالة بيانات الدخول للمسوق"
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

                          {/* Action B: Promo Message for Merchant (دعوة رسمية تسويقية للمتجر) */}
                          <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl p-1.5 px-2.5 shadow-sm">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                              <span className="text-[11px] font-bold text-slate-200">دعوة المتجر</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <a
                                href={getMerchantPromoWhatsAppUrl(p)}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 px-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition text-[10px] font-bold flex items-center gap-1"
                                title="نشر رسالة المتجر الرسمية عبر واتساب"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>واتساب</span>
                              </a>
                              <button
                                onClick={() => handleCopyMerchantPromoMessage(p)}
                                className="p-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition text-[10px] font-bold flex items-center gap-1"
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
                      </td>

                      <td className="py-4 px-4">
                        <span className="text-slate-300 block">{p.region ? `📍 ${p.region}` : '—'}</span>
                        <span className="text-[10px] text-slate-500">{p.target_value ? `الهدف: ${p.target_value} متجر/شهر` : 'بدون هدف محدد'}</span>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            p.active
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${p.active ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                          <span>{p.active ? 'نشط (مفعل)' : 'موقوف'}</span>
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleToggleStatus(p.id, p.affiliate_id, p.active)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                              p.active
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {p.active ? (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>إيقاف</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>تنشيط</span>
                              </>
                            )}
                          </button>

                          <a
                            href={`/join?ref=${refCode}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="معاينة صفحة الهبوط الرسمية للإحالة"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

              {/* Field 3: Referral Code (r + 4 digits) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span>كود الإحالة التلقائي (Referral Code)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReferralCode(generateNewReferralCode())}
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>توليد كود آخر</span>
                  </button>
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="r4819"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs font-mono text-amber-400 font-bold outline-none transition"
                />
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
                    placeholder="10 متاجر"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
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
    </div>
  );
};

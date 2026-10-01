import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase';
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
} from 'lucide-react';

export const SuperAdminPartnersConsole: React.FC = () => {
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New Marketer / Partner Direct Form Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [partnerSlug, setPartnerSlug] = useState('');
  const [region, setRegion] = useState('الرياض');
  const [monthlyTarget, setMonthlyTarget] = useState(20);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const client = getSupabaseClient();
      if (client) {
        const { data, error: dbErr } = await client
          .from('partner_accounts')
          .select('id, affiliate_id, display_name, slug, region, target_value, active, created_at, affiliates(id, name, phone, referral_code, status)')
          .order('created_at', { ascending: false });

        if (!dbErr && data) {
          setPartners(data);
          setLoading(false);
          return;
        }
      }

      const res = await fetch('/api/admin/partners');
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setPartners(data.partners || []);
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

  // Auto-generate code & slug when typing name
  const handleNameChange = (val: string) => {
    setPartnerName(val);
    const cleanLatin = val
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    if (!referralCode || referralCode.startsWith('RADAR-')) {
      const autoCode = val.trim() ? `RADAR-${val.replace(/\s+/g, '').toUpperCase().slice(0, 10)}` : '';
      setReferralCode(autoCode);
    }

    if (!partnerSlug) {
      setPartnerSlug(cleanLatin || 'partner');
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
    setError(null);
    setSuccess(null);

    const cleanName = partnerName.trim();
    const cleanPhone = normalizeSaudiPhone(partnerPhone.trim());
    let cleanCode = (referralCode.trim() || `RADAR-${cleanName.replace(/\s+/g, '')}`).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    let cleanSlug = (partnerSlug.trim() || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')).toLowerCase();

    if (!cleanName || cleanName.length < 2) {
      setError('يرجى كتابة اسم المسوق (حرفين على الأقل)');
      return;
    }

    if (!cleanPhone || cleanPhone.length < 9) {
      setError('يرجى إدخال رقم جوال صحيح للمسوق (05XXXXXXXX)');
      return;
    }

    if (cleanCode.length < 3) cleanCode = `RADAR-${Math.floor(1000 + Math.random() * 9000)}`;
    if (cleanSlug.length < 2) cleanSlug = `partner-${Math.floor(1000 + Math.random() * 9000)}`;

    setIsSubmitting(true);

    try {
      const client = getSupabaseClient();
      if (!client) {
        throw new Error('تعذر الاتصال بقاعدة البيانات');
      }

      // 1. Check if affiliate already exists by phone
      const { data: existingAff } = await client
        .from('affiliates')
        .select('id, name, referral_code')
        .eq('phone', cleanPhone)
        .maybeSingle();

      let affiliateId = existingAff?.id;

      if (!affiliateId) {
        // Create new affiliate row
        const { data: newAff, error: affErr } = await client
          .from('affiliates')
          .insert([
            {
              name: cleanName,
              phone: cleanPhone,
              referral_code: cleanCode,
              status: 'ACTIVE',
              notes: `تمت الإضافة بواسطة المالك من لوحة التحكم`,
            },
          ])
          .select('id')
          .single();

        if (affErr) {
          throw new Error(affErr.message || 'فشل في حفظ بيانات المسوق');
        }
        affiliateId = newAff?.id;
      }

      // 2. Create partner account with landing slug
      const { error: partnerErr } = await client.from('partner_accounts').insert([
        {
          affiliate_id: affiliateId,
          display_name: cleanName,
          slug: cleanSlug,
          region: region.trim() || 'عام',
          target_value: monthlyTarget,
          active: true,
        },
      ]);

      if (partnerErr) {
        throw new Error(partnerErr.message || 'فشل في إنشاء صفحة ورابط الشريك');
      }

      setSuccess(`تم بنجاح إضافة المسوق [${cleanName}] بكود إحالة: ${cleanCode} ورابط: /${cleanSlug}`);
      setIsModalOpen(false);
      setPartnerName('');
      setPartnerPhone('');
      setReferralCode('');
      setPartnerSlug('');
      setRegion('الرياض');
      await fetchPartners();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء حفظ المسوق');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (partnerId: string, affiliateId: string, currentActive: boolean) => {
    try {
      const client = getSupabaseClient();
      if (client) {
        const nextActive = !currentActive;
        const nextAffStatus = nextActive ? 'ACTIVE' : 'SUSPENDED';

        await client
          .from('partner_accounts')
          .update({ active: nextActive })
          .eq('id', partnerId);

        if (affiliateId) {
          await client
            .from('affiliates')
            .update({ status: nextAffStatus })
            .eq('id', affiliateId);
        }

        setPartners(
          partners.map((p) =>
            p.id === partnerId
              ? {
                  ...p,
                  active: nextActive,
                  affiliates: p.affiliates ? { ...p.affiliates, status: nextAffStatus } : p.affiliates,
                }
              : p
          )
        );
      }
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
                أضف مسوقين جدد بالاسم ورقم الجوال لتوليد أكواد الإحالة وروابط الهبوط المخصصة لهم وتتبع أرباحهم.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
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
                  <th className="py-3.5 px-4">رابط المسوق الخاص</th>
                  <th className="py-3.5 px-4">المنطقة والهدف</th>
                  <th className="py-3.5 px-4">حالة الحساب</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {partners.map((p) => {
                  const refCode = p.affiliates?.referral_code || '—';
                  const phone = p.affiliates?.phone || '—';
                  const joinUrl = `${window.location.origin}/join?ref=${refCode}`;

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

                      <td className="py-4 px-4 font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                            <span>/{p.slug}</span>
                            <button
                              onClick={() => copyUrl(p.slug)}
                              className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition"
                              title="نسخ صفحة المسوق"
                            >
                              {copiedSlug === p.slug ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            رابط الإحالة: <span className="text-amber-400/80">/join?ref={refCode}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span className="text-slate-300 block">{p.region ? `📍 ${p.region}` : 'عام'}</span>
                        <span className="text-[10px] text-slate-500">الهدف: {p.target_value || 20} متجر/شهر</span>
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
                            href={`/${p.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="معاينة الصفحة العامة"
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

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Field 1: Marketer Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  <span>اسم المسوق أو المؤسسة المسوقة *</span>
                </label>
                <input
                  type="text"
                  required
                  value={partnerName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="مثال: صالح القحطاني، مؤسسة التسويق الذكي"
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
                  onChange={(e) => setPartnerPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs font-mono text-white placeholder-slate-600 outline-none transition text-right"
                />
                <p className="text-[10px] text-slate-500">يستخدمه المسوق للدخول إلى لوحة أرباحه عبر /partner</p>
              </div>

              {/* Field 3: Referral Code */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <span>كود الإحالة (Referral Code)</span>
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="مثال: RADAR-SALEH أو SALEH10"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-xs font-mono text-amber-400 placeholder-slate-600 outline-none transition uppercase"
                />
              </div>

              {/* Field 4: Custom URL Slug */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                  <span>رابط صفحة المسوق العامة</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={partnerSlug}
                    onChange={(e) => setPartnerSlug(e.target.value.toLowerCase().trim())}
                    placeholder="saleh"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-4 pl-20 py-3 text-xs font-mono text-amber-400 placeholder-slate-600 outline-none transition"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none">
                    /{partnerSlug || 'slug'}
                  </span>
                </div>
              </div>

              {/* Field 5: Region & Target (Inline Grid) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>المنطقة</span>
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
                    <span>الهدف الشهري (متجر)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={monthlyTarget}
                    onChange={(e) => setMonthlyTarget(parseInt(e.target.value, 10) || 20)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-3 py-2.5 text-xs font-mono text-white outline-none transition"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'جاري الحفظ...' : 'حفظ وتفعيل المسوق فوراً 🚀'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
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

export default SuperAdminPartnersConsole;

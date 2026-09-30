import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import {
  Users,
  PlusCircle,
  ShieldCheck,
  RefreshCw,
  Search,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  Target,
  Sparkles,
  X,
  KeyRound,
} from 'lucide-react';

interface SuperAdminPartnersConsoleProps {
  adminToken?: string;
}

export const SuperAdminPartnersConsole: React.FC<SuperAdminPartnersConsoleProps> = ({ adminToken: adminTokenProp }) => {
  const [partners, setPartners] = useState<any[]>([]);
  const [availableAffiliates, setAvailableAffiliates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New Partner Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAffiliateId, setSelectedAffiliateId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [region, setRegion] = useState('');
  const [monthlyTarget, setMonthlyTarget] = useState(20);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Token management
  const [token, setToken] = useState<string>(() => {
    return adminTokenProp || sessionStorage.getItem('RADAR_ADMIN_JWT') || '';
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');

  // Automatically check for Supabase Auth JWT on mount if not provided
  useEffect(() => {
    if (adminTokenProp) {
      setToken(adminTokenProp);
      return;
    }
    const detectSession = async () => {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client.auth.getSession();
          if (data?.session?.access_token) {
            setToken(data.session.access_token);
          }
        }
      } catch (err) {
        console.warn('[SuperAdminPartnersConsole] Session detect error:', err);
      }
    };
    detectSession();
  }, [adminTokenProp]);

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/admin/partners', { headers });
      const data = await res.json();

      if (data.success) {
        setPartners(data.partners || []);
        setAvailableAffiliates(data.available_affiliates || []);
        setAuthError(null);
      } else {
        if (res.status === 401 || res.status === 403) {
          setAuthError(data.error || 'مطلوب جلسة مسؤول صالحة لعرض الشركاء');
        } else {
          setError(data.error || 'فشل في استرجاع قائمة الشركاء');
        }
      }
    } catch (err: any) {
      console.error('[SuperAdminPartnersConsole] Fetch error:', err);
      setError('حدث خطأ في الاتصال بخدمة إدارة الشركاء');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  // Handle Display Name -> auto generate slug
  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val);
    if (!slug) {
      const generated = val
        .toLowerCase()
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (generated) setSlug(generated);
    }
  };

  // Handle Create Partner Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAffiliateId || !displayName.trim() || !slug.trim()) {
      setError('يرجى تعبئة الحقول الإلزامية');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/admin/partners', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          affiliate_id: selectedAffiliateId,
          display_name: displayName.trim(),
          slug: slug.trim().toLowerCase(),
          region: region.trim() || null,
          target_value: monthlyTarget,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.success === false) {
        setError(data.error || 'فشل في إنشاء حساب الشريك');
        return;
      }

      setSuccess(`تم إنشاء حساب الشريك [${displayName}] بنجاح ورابطه: /${data.slug}`);
      setIsModalOpen(false);
      setSelectedAffiliateId('');
      setDisplayName('');
      setSlug('');
      setRegion('');
      await fetchPartners();
    } catch (err: any) {
      setError('حدث خطأ أثناء إرسال طلب إنشاء الشريك');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Status Toggle (Suspend / Reactivate)
  const handleToggleStatus = async (partnerId: string, currentActive: boolean) => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/admin/partners', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          partner_id: partnerId,
          active: !currentActive,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setPartners(
          partners.map((p) => (p.id === partnerId ? { ...p, active: !currentActive } : p))
        );
      } else {
        setError(data.error || 'فشل في تحديث حالة الشريك');
      }
    } catch (err) {
      setError('حدث خطأ في الاتصال بالخادم');
    }
  };

  const copyUrl = (partnerSlug: string) => {
    const full = `${window.location.origin}/${partnerSlug}`;
    navigator.clipboard.writeText(full);
    setCopiedSlug(partnerSlug);
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
                <h2 className="text-xl sm:text-2xl font-black text-white">إدارة شركاء المبيعات (Sales Partners)</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  Stage 6 Console
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                تأسيس وإدارة حسابات الشركاء الميدانيين، تخصيص الروابط الشخصية، تحديد الأهداف وتتبع الإحالات.
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
            <span>إضافة شريك جديد</span>
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
            <p className="text-xs text-slate-400">جاري استرجاع قائمة الشركاء...</p>
          </div>
        ) : partners.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto text-xl">
              🤝
            </div>
            <h4 className="text-base font-bold text-white">لا يوجد شركاء مبيعات مسجلين حالياً</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              اضغط على "إضافة شريك جديد" لربط أحد الوسطاء المعتمدين بحساب شريك ميداني ورابط مخصص.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400">
                  <th className="py-3.5 px-4">اسم الشريك والمنطقة</th>
                  <th className="py-3.5 px-4">الرابط المخصص</th>
                  <th className="py-3.5 px-4">كود الإحالة</th>
                  <th className="py-3.5 px-4">حالة الحساب</th>
                  <th className="py-3.5 px-4">تاريخ التأسيس</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {partners.map((p) => {
                  const refCode = p.affiliates?.referral_code || '—';
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-4 px-4">
                        <strong className="text-white block text-sm">{p.display_name}</strong>
                        <span className="text-[11px] text-slate-400">
                          {p.region ? `📍 ${p.region}` : 'عام'} • {p.affiliates?.name || 'وسيط معتمد'}
                        </span>
                      </td>

                      <td className="py-4 px-4 font-mono">
                        <div className="flex items-center gap-1.5 text-amber-400">
                          <span>/{p.slug}</span>
                          <button
                            onClick={() => copyUrl(p.slug)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition"
                            title="نسخ الرابط العام"
                          >
                            {copiedSlug === p.slug ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono font-bold text-slate-300">
                        {refCode}
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            p.active
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              p.active ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          ></span>
                          <span>{p.active ? 'نشط (ACTIVE)' : 'موقوف (SUSPENDED)'}</span>
                        </span>
                      </td>

                      <td className="py-4 px-4 font-mono text-[11px] text-slate-400">
                        {new Date(p.created_at).toLocaleDateString('ar-SA')}
                      </td>

                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleToggleStatus(p.id, p.active)}
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

      {/* Modal: Add New Partner Account */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-black text-white">تأسيس حساب شريك مبيعات جديد</h4>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Select Existing Affiliate */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  الوسيط التجاري المعتمد (Affiliate):
                </label>
                <select
                  value={selectedAffiliateId}
                  onChange={(e) => {
                    setSelectedAffiliateId(e.target.value);
                    const found = availableAffiliates.find((a) => a.id === e.target.value);
                    if (found && !displayName) {
                      handleDisplayNameChange(found.name);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-3 py-2.5 text-xs text-white outline-none transition"
                  required
                >
                  <option value="">-- اختر وسيط من المنظومة --</option>
                  {availableAffiliates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.referral_code}) - {a.phone}
                    </option>
                  ))}
                </select>
              </div>

              {/* Display Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  اسم الشريك الظاهر (Display Name):
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  placeholder="مثال: أحمد الغامدي (مسوق جدة)"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
                  required
                />
              </div>

              {/* Custom Slug */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  الرابط الشخصي الفريد (Partner Slug):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
                    placeholder="ahmed-jeddah"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl pr-4 pl-20 py-2.5 text-xs font-mono text-amber-400 placeholder-slate-600 outline-none transition"
                    required
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none">
                    /{slug || 'slug'}
                  </span>
                </div>
              </div>

              {/* Region */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  المنطقة التقديرية (Region - اختياري):
                </label>
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="مثال: جدة، الرياض، مكة المكرمة"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              {/* Monthly Target */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  تارقت المبيعات الشهري (Target):
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

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'جاري الإنشاء...' : 'تأكيد إنشاء الشريك 🚀'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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

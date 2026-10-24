import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Server,
  PlusCircle,
  KeyRound,
  Power,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  AlertTriangle,
  Loader2,
  Building,
  Globe,
  Database,
  Lock,
} from 'lucide-react';
import { ResellerRecord } from '../types/reseller';
import { getSupabaseClient } from '../lib/supabase';

export const MasterResellerControl: React.FC = () => {
  const [resellers, setResellers] = useState<ResellerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State for New Reseller
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    custom_domain: '',
    supabase_url: '',
    supabase_anon_key: '',
    service_role_key: '',
    admin_email: '',
    admin_password: '',
    brand_logo_url: '',
    brand_primary_color: '#4F46E5',
    notes: '',
  });

  // Reset Password Modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedReseller, setSelectedReseller] = useState<ResellerRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const supabase = getSupabaseClient();

  useEffect(() => {
    fetchResellers();
  }, []);

  async function fetchResellers() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('resellers')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setResellers((data || []) as unknown as ResellerRecord[]);
    } catch (err: any) {
      console.error('Fetch resellers failed:', err);
      setError(err?.message || 'فشل تحميل قائمة الوكلاء');
    } finally {
      setLoading(false);
    }
  }

  // Create Reseller with DB provision + User creation
  async function handleCreateReseller(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setActionLoading('creating');
    setError(null);
    setSuccessMsg(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('جلسة تسجيل الدخول مفقودة');

      // 1. Insert into resellers table
      const { data: newReseller, error: insertErr } = await supabase
        .from('resellers')
        .insert({
          name: formData.name.trim(),
          slug: formData.slug.trim().toLowerCase(),
          custom_domain: formData.custom_domain.trim() || null,
          brand_logo_url: formData.brand_logo_url.trim() || null,
          brand_primary_color: formData.brand_primary_color || '#4F46E5',
          supabase_url: formData.supabase_url.trim(),
          supabase_anon_key: formData.supabase_anon_key.trim(),
          platform_status: 'active',
          notes: formData.notes.trim() || null,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // 2. Insert service_role_key strictly into isolated reseller_secrets table
      // (This requires Service Role or Master API call to keep it isolated from client)
      const res = await fetch('/api/admin/master-manage-reseller-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'create_or_update_admin',
          resellerId: newReseller.id,
          email: formData.admin_email.trim(),
          password: formData.admin_password.trim(),
          fullName: formData.name.trim(),
          // Passing service_role_key in this initial secure handshake to store it in reseller_secrets
          serviceRoleKey: formData.service_role_key.trim(),
        }),
      });

      const resData = await res.json();
      if (!resData.success) {
        console.warn('Admin user setup notice:', resData.error);
      }

      setSuccessMsg(`تم إنشاء الوكيل (${formData.name}) بنجاح وتجهيز سيرفره.`);
      setShowCreateModal(false);
      resetForm();
      fetchResellers();
    } catch (err: any) {
      console.error('Create reseller error:', err);
      setError(err?.message || 'فشل إنشاء الوكيل');
    } finally {
      setActionLoading(null);
    }
  }

  // Toggle Kill Switch (Instant Suspension)
  async function toggleStatus(reseller: ResellerRecord) {
    if (!supabase) return;
    const nextStatus = reseller.platform_status === 'active' ? 'suspended' : 'active';
    const confirmMsg =
      nextStatus === 'suspended'
        ? `هل أنت متأكد من تفعيل الـ Kill Switch وإيقاف منصة (${reseller.name}) فوراً؟ سينقطع وصول جميع متاجره وعملائه في هذه اللحظة!`
        : `هل تريد إعادة تفعيل منصة (${reseller.name}) الآن؟`;

    if (!window.confirm(confirmMsg)) return;

    setActionLoading(`toggle_${reseller.id}`);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from('resellers')
        .update({
          platform_status: nextStatus,
          suspension_reason: nextStatus === 'suspended' ? 'إيقاف إداري سيادي من مالك المنصة' : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reseller.id);

      if (updateErr) throw updateErr;

      setSuccessMsg(
        nextStatus === 'suspended'
          ? `تم تفعيل الـ Kill Switch وإيقاف (${reseller.name}) فوراً بنجاح.`
          : `تم إعادة تفعيل منصة (${reseller.name}) للعمل.`
      );
      fetchResellers();
    } catch (err: any) {
      console.error('Toggle status error:', err);
      setError(err?.message || 'فشل تحديث حالة المنصة');
    } finally {
      setActionLoading(null);
    }
  }

  // Reset Reseller Admin Password
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !selectedReseller) return;
    setActionLoading('reset_pwd');
    setError(null);
    setSuccessMsg(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('جلسة تسجيل الدخول مفقودة');

      const res = await fetch('/api/admin/master-manage-reseller-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'reset_password',
          resellerId: selectedReseller.id,
          password: newPassword.trim(),
        }),
      });

      const resData = await res.json();
      if (!resData.success) throw new Error(resData.error || 'فشل تصفير كلمة المرور');

      setSuccessMsg(`تم تصفير كلمة مرور مالك الوكيل (${selectedReseller.name}) بنجاح.`);
      setShowResetModal(false);
      setNewPassword('');
    } catch (err: any) {
      console.error('Reset password error:', err);
      setError(err?.message || 'فشل تصفير كلمة المرور');
    } finally {
      setActionLoading(null);
    }
  }

  // Test Reseller Database Connection
  async function testConnection(reseller: ResellerRecord) {
    if (!supabase) return;
    setActionLoading(`test_${reseller.id}`);
    setError(null);
    setSuccessMsg(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('جلسة تسجيل الدخول مفقودة');

      const res = await fetch('/api/admin/master-manage-reseller-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'test_connection',
          resellerId: reseller.id,
        }),
      });

      const resData = await res.json();
      if (!resData.success || !resData.connected) {
        throw new Error(resData.error || 'فشل الاتصال بسيرفر الوكيل');
      }

      setSuccessMsg(`الاتصال بسيرفر (${reseller.name}) سليم ونشط 100%.`);
    } catch (err: any) {
      console.error('Test connection error:', err);
      setError(err?.message || 'سيرفر الوكيل لا يستجيب');
    } finally {
      setActionLoading(null);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      slug: '',
      custom_domain: '',
      supabase_url: '',
      supabase_anon_key: '',
      service_role_key: '',
      admin_email: '',
      admin_password: '',
      brand_logo_url: '',
      brand_primary_color: '#4F46E5',
      notes: '',
    });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setSuccessMsg('تم نسخ الرابط للحافظة بنجاح');
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  return (
    <div className="space-y-6 text-slate-100" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-950 p-6 rounded-3xl border border-indigo-500/20 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600/20 border border-indigo-500/40 rounded-2xl flex items-center justify-center text-indigo-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-wide">
                  بوابة إدارة الوكلاء والرخص (Master Reseller Hub)
                </h1>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono">
                  MASTER SOVEREIGN
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-1">
                نظام البيع بالجملة (Database-per-Reseller) • إنشاء وتصفير حسابات الوكلاء وزر الإيقاف اللحظي (Kill Switch).
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-2xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02]"
          >
            <PlusCircle className="w-5 h-5" />
            <span>إنشاء وكيل جديد</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-2xl text-red-200 text-xs flex items-center gap-3">
          <XCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl text-emerald-200 text-xs flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Resellers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-500 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <span className="text-xs">جاري تحميل منظومة الوكلاء...</span>
          </div>
        ) : resellers.length === 0 ? (
          <div className="col-span-full py-16 bg-slate-900/40 border border-slate-800 rounded-3xl text-center p-8">
            <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-300">لا يوجد وكلاء مسجلون حتى الآن</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              اضغط على زر "إنشاء وكيل جديد" لإضافة أول شريك وموزع بنظام قاعدة بيانات مستقلة تماماً.
            </p>
          </div>
        ) : (
          resellers.map((reseller) => {
            const isSuspended = reseller.platform_status === 'suspended';
            const agentUrl = reseller.custom_domain
              ? `https://${reseller.custom_domain}`
              : `${window.location.origin}/?tenant=${reseller.slug}`;

            return (
              <div
                key={reseller.id}
                className={`bg-slate-900/80 border rounded-3xl p-5 flex flex-col justify-between transition-all relative overflow-hidden backdrop-blur-sm ${
                  isSuspended
                    ? 'border-red-500/40 shadow-red-950/20 shadow-xl'
                    : 'border-slate-800 hover:border-slate-700 shadow-xl'
                }`}
              >
                {/* Status indicator bar */}
                <div
                  className={`absolute top-0 right-0 left-0 h-1.5 ${
                    isSuspended ? 'bg-red-500' : 'bg-emerald-500'
                  }`}
                />

                <div>
                  {/* Top info */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                        {reseller.brand_logo_url ? (
                          <img
                            src={reseller.brand_logo_url}
                            alt={reseller.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Building className="w-5 h-5 text-indigo-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-base font-black text-white">{reseller.name}</h3>
                        <span className="text-[11px] text-slate-400 font-mono">
                          ID: {reseller.slug}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                        isSuspended
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {isSuspended ? 'موقوف (Kill Switch)' : 'نشط ويعمل'}
                    </span>
                  </div>

                  {/* Reseller Link Card */}
                  <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 mb-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-indigo-400" />
                        رابط المنصة:
                      </span>
                      <button
                        onClick={() => copyToClipboard(agentUrl)}
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[11px]"
                      >
                        <Copy className="w-3 h-3" />
                        نسخ
                      </button>
                    </div>
                    <div className="text-[11px] font-mono text-slate-300 truncate bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-800">
                      {agentUrl}
                    </div>
                  </div>

                  {/* Server Details */}
                  <div className="text-xs text-slate-400 space-y-1.5 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-slate-500" />
                        سيرفر Supabase:
                      </span>
                      <span className="font-mono text-[11px] text-slate-300 truncate max-w-[150px]">
                        {reseller.supabase_url.replace('https://', '')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Reset Password Button */}
                    <button
                      onClick={() => {
                        setSelectedReseller(reseller);
                        setShowResetModal(true);
                      }}
                      title="تصفير كلمة مرور الوكيل عن بعد"
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>

                    {/* Test Connection Button */}
                    <button
                      onClick={() => testConnection(reseller)}
                      disabled={actionLoading === `test_${reseller.id}`}
                      title="فحص الاتصال بسيرفر الوكيل"
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition disabled:opacity-50"
                    >
                      {actionLoading === `test_${reseller.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                      ) : (
                        <Server className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Kill Switch Toggle */}
                  <button
                    onClick={() => toggleStatus(reseller)}
                    disabled={actionLoading === `toggle_${reseller.id}`}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
                      isSuspended
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 shadow-md'
                        : 'bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{isSuspended ? 'إعادة التفعيل' : 'Kill Switch'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Create Reseller */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">إنشاء رخصة وكيل جديدة</h3>
                  <p className="text-xs text-slate-400">
                    ربط سيرفر مستقل مع عزل البيانات 100% وإنشاء حساب السوبر أدمن
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-500 hover:text-slate-300 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReseller} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    اسم الوكيل / العلامة التجارية *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: سديم الأثر"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    المعرف الفريد (Slug / ID) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                    placeholder="مثال: sadim"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  الدومين المخصص (اختياري)
                </label>
                <input
                  type="text"
                  value={formData.custom_domain}
                  onChange={(e) => setFormData({ ...formData, custom_domain: e.target.value })}
                  placeholder="مثال: app.sadim.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Supabase Connection details */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
                  <Database className="w-4 h-4" />
                  <span>بيانات قاعدة بيانات الوكيل المستقلة (Supabase)</span>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Supabase Project URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={formData.supabase_url}
                    onChange={(e) => setFormData({ ...formData, supabase_url: e.target.value })}
                    placeholder="https://xxxxxxxx.supabase.co"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Supabase Anon Key *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.supabase_anon_key}
                    onChange={(e) => setFormData({ ...formData, supabase_anon_key: e.target.value })}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 flex items-center justify-between">
                    <span>Supabase Service Role Key (للإدارة فقط - يعزل في جدول سري) *</span>
                    <span className="text-[10px] text-amber-400">سري ومحمي</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.service_role_key}
                    onChange={(e) => setFormData({ ...formData, service_role_key: e.target.value })}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Admin User Credentials */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <KeyRound className="w-4 h-4" />
                  <span>حساب المالك الرئيسي للوكيل (Super Admin)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">البريد الإلكتروني *</label>
                    <input
                      type="email"
                      required
                      value={formData.admin_email}
                      onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                      placeholder="admin@brand.com"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">كلمة المرور الأولية *</label>
                    <input
                      type="text"
                      required
                      value={formData.admin_password}
                      onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                      placeholder="كلمة مرور قوية"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'creating'}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading === 'creating' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري التجهيز والربط...</span>
                    </>
                  ) : (
                    <span>إنشاء وتشغيل الوكيل</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {showResetModal && selectedReseller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <KeyRound className="w-5 h-5" />
                <span>تصفير كلمة مرور ({selectedReseller.name})</span>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-xs text-slate-400">
                أدخل كلمة المرور الجديدة لمالك الوكيل. سيتم تحديثها مباشرة في قاعدة بياناته المستقلة دون الحاجة لدخول لوحة التحكم الخاصة به.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  كلمة المرور الجديدة *
                </label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="اكتب كلمة المرور الجديدة"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'reset_pwd'}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-600/30 flex items-center gap-2"
                >
                  {actionLoading === 'reset_pwd' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>تأكيد التصفير</span>
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

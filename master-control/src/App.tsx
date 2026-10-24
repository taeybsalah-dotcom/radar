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
} from 'lucide-react';
import {
  masterSupabase,
  ResellerInstance,
  executeResellerKillSwitch,
  executeResellerPasswordReset,
  testResellerConnection,
  executeUpdateResellerBranding,
  uploadLogoToStorage,
} from './lib/masterApi';

export const App: React.FC = () => {
  const [instances, setInstances] = useState<ResellerInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal: Create Reseller Instance
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
    support_phone: '',
    support_whatsapp: '',
    primary_color_hex: '#4F46E5',
    notes: '',
  });

  // Modal: Edit Branding Modal
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [brandingTarget, setBrandingTarget] = useState<ResellerInstance | null>(null);
  const [brandingData, setBrandingData] = useState({
    brand_name: '',
    logo_url: '',
    support_phone: '',
    support_whatsapp: '',
    primary_color_hex: '#4F46E5',
  });

  // Modal: Reset Password
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<ResellerInstance | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchInstances();
  }, []);

  async function fetchInstances() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await masterSupabase
        .from('reseller_instances')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setInstances(data || []);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err?.message || 'فشل جلب بيانات الوكلاء');
    } finally {
      setLoading(false);
    }
  }

  // Handle Logo Upload and convert to Public URL
  async function handleFileUpload(file: File, isEditing: boolean) {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const targetUrl = isEditing && brandingTarget ? brandingTarget.supabase_url : formData.supabase_url;
      const targetKey = isEditing && brandingTarget ? brandingTarget.supabase_anon_key : formData.supabase_anon_key;

      const publicUrl = await uploadLogoToStorage(file, targetUrl, targetKey);

      if (isEditing) {
        setBrandingData((prev) => ({ ...prev, logo_url: publicUrl }));
      } else {
        setFormData((prev) => ({ ...prev, brand_logo_url: publicUrl }));
      }
      setSuccessMsg('تم رفع الصورة وتحويلها لرابط سحابي بنجاح!');
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err?.message || 'فشل رفع الصورة وتحويلها');
    } finally {
      setUploadingLogo(false);
    }
  }

  // Create Reseller
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading('creating');
    setError(null);
    setSuccessMsg(null);

    try {
      const { data: newInst, error: insertErr } = await masterSupabase
        .from('reseller_instances')
        .insert({
          name: formData.name.trim(),
          slug: formData.slug.trim().toLowerCase(),
          custom_domain: formData.custom_domain.trim() || null,
          brand_logo_url: formData.brand_logo_url.trim() || null,
          support_phone: formData.support_phone.trim() || null,
          support_whatsapp: formData.support_whatsapp.trim() || null,
          primary_color_hex: formData.primary_color_hex || '#4F46E5',
          supabase_url: formData.supabase_url.trim(),
          supabase_anon_key: formData.supabase_anon_key.trim(),
          service_role_key: formData.service_role_key.trim(),
          admin_email: formData.admin_email.trim().toLowerCase(),
          platform_status: 'active',
          notes: formData.notes.trim() || null,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Also push branding to the reseller's DB directly
      if (formData.brand_logo_url || formData.support_phone) {
        await executeUpdateResellerBranding(newInst, {
          brand_name: formData.name.trim(),
          logo_url: formData.brand_logo_url.trim(),
          support_phone: formData.support_phone.trim(),
          support_whatsapp: formData.support_whatsapp.trim(),
          primary_color_hex: formData.primary_color_hex,
        });
      }

      setSuccessMsg(`تم إنشاء وتجهيز وكيل جديد (${formData.name}) بنجاح.`);
      setShowCreateModal(false);
      resetForm();
      fetchInstances();
    } catch (err: any) {
      console.error('Create error:', err);
      setError(err?.message || 'فشل إنشاء الوكيل وتجهيز حسابه');
    } finally {
      setActionLoading(null);
    }
  }

  // Update Branding Remotely
  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    if (!brandingTarget) return;
    setActionLoading('saving_branding');
    setError(null);

    try {
      await executeUpdateResellerBranding(brandingTarget, brandingData);
      setSuccessMsg(`تم تحديث شعار وهوية (${brandingData.brand_name}) في سيرفره فوراً.`);
      setShowBrandingModal(false);
      fetchInstances();
    } catch (err: any) {
      console.error('Branding update error:', err);
      setError(err?.message || 'فشل تحديث هوية الوكيل في سيرفره');
    } finally {
      setActionLoading(null);
    }
  }

  // Toggle Direct Kill Switch
  async function handleKillSwitch(instance: ResellerInstance) {
    const nextStatus = instance.platform_status === 'active' ? 'suspended' : 'active';
    const confirmMsg =
      nextStatus === 'suspended'
        ? `هل أنت متأكد من تفعيل الـ Kill Switch وإيقاف (${instance.name}) فوراً؟ سينقطع وصول جميع متاجره وعملائه في هذه اللحظة!`
        : `هل تريد إعادة تفعيل منصة (${instance.name}) الآن؟`;

    if (!window.confirm(confirmMsg)) return;

    setActionLoading(`kill_${instance.id}`);
    setError(null);
    try {
      await executeResellerKillSwitch(instance, nextStatus);
      setSuccessMsg(
        nextStatus === 'suspended'
          ? `تم إيقاف (${instance.name}) وقفل قاعدة بياناته فوراً بنجاح.`
          : `تم إعادة تفعيل منصة (${instance.name}) بنجاح.`
      );
      fetchInstances();
    } catch (err: any) {
      console.error('Killswitch error:', err);
      setError(err?.message || 'فشل إرسال أمر الـ Kill Switch لسيرفر الوكيل');
    } finally {
      setActionLoading(null);
    }
  }

  // Direct Password Reset
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInstance) return;
    setActionLoading('reset_pwd');
    setError(null);

    try {
      await executeResellerPasswordReset(selectedInstance, newPassword.trim());
      setSuccessMsg(`تم تغيير كلمة مرور مالك الوكيل (${selectedInstance.name}) في سيرفره مباشرة.`);
      setShowResetModal(false);
      setNewPassword('');
    } catch (err: any) {
      console.error('Reset error:', err);
      setError(err?.message || 'فشل تغيير كلمة المرور في سيرفر الوكيل');
    } finally {
      setActionLoading(null);
    }
  }

  // Test Direct DB Connection
  async function testConnection(instance: ResellerInstance) {
    setActionLoading(`test_${instance.id}`);
    setError(null);
    try {
      await testResellerConnection(instance);
      setSuccessMsg(`الاتصال المباشر بسيرفر (${instance.name}) نشط ومستجيب 100%.`);
    } catch (err: any) {
      console.error('Ping error:', err);
      setError(`تعذر الاتصال المباشر بسيرفر (${instance.name}): ${err?.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  function openBrandingModal(inst: ResellerInstance) {
    setBrandingTarget(inst);
    setBrandingData({
      brand_name: inst.name,
      logo_url: inst.brand_logo_url || '',
      support_phone: inst.support_phone || '',
      support_whatsapp: inst.support_whatsapp || '',
      primary_color_hex: inst.primary_color_hex || '#4F46E5',
    });
    setShowBrandingModal(true);
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
      support_phone: '',
      support_whatsapp: '',
      primary_color_hex: '#4F46E5',
      notes: '',
    });
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setSuccessMsg('تم نسخ الرابط للحافظة بنجاح');
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-10" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Sovereign Header */}
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-950 border border-indigo-500/20 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <ShieldAlert className="w-9 h-9" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl md:text-3xl font-black text-white">
                    اللوحة السيادية لإدارة الوكلاء (Master Control Hub)
                  </h1>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-mono">
                    STANDALONE SOVEREIGN
                  </span>
                </div>
                <p className="text-slate-400 text-xs md:text-sm mt-1">
                  إدارة وتجهيز هويات وقواعد بيانات الوكلاء المستقلة (White-Label Branding & Kill-Switch) مباشرة عبر السيرفر.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-2xl shadow-lg shadow-indigo-600/30 transition hover:scale-[1.02]"
            >
              <PlusCircle className="w-5 h-5" />
              <span>إنشاء وتجهيز وكيل جديد</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-20 text-center text-slate-500 flex flex-col items-center gap-3">
              <Loader2 className="w-9 h-9 animate-spin text-indigo-400" />
              <span className="text-sm">جاري الاتصال بقاعدة التحكم المركزية...</span>
            </div>
          ) : instances.length === 0 ? (
            <div className="col-span-full py-20 bg-slate-900/40 border border-slate-800 rounded-3xl text-center p-8">
              <Server className="w-14 h-14 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-300">لا يوجد وكلاء مسجلون حالياً</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                اضغط على زر "إنشاء وتجهيز وكيل جديد" لإضافة أول وكيل بنظام قاعدة بيانات وهوية مستقلة.
              </p>
            </div>
          ) : (
            instances.map((inst) => {
              const isSuspended = inst.platform_status === 'suspended';
              const agentUrl = inst.custom_domain
                ? `https://${inst.custom_domain}`
                : `https://${inst.slug}.pages.dev`;

              return (
                <div
                  key={inst.id}
                  className={`bg-slate-900/90 border rounded-3xl p-6 flex flex-col justify-between transition relative overflow-hidden backdrop-blur-sm ${
                    isSuspended
                      ? 'border-red-500/40 shadow-red-950/20 shadow-xl'
                      : 'border-slate-800 hover:border-slate-700 shadow-xl'
                  }`}
                >
                  <div
                    className={`absolute top-0 right-0 left-0 h-1.5 ${
                      isSuspended ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                  />

                  <div>
                    <div className="flex items-start justify-between gap-3 mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                          {inst.brand_logo_url ? (
                            <img src={inst.brand_logo_url} alt={inst.name} className="w-full h-full object-cover" />
                          ) : (
                            <Building className="w-7 h-7 text-indigo-400" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-white">{inst.name}</h3>
                          <span className="text-[11px] text-slate-400 font-mono">Slug: {inst.slug}</span>
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

                    {/* Reseller URL */}
                    <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 mb-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-indigo-400" />
                          رابط المنصة:
                        </span>
                        <button
                          onClick={() => copy(agentUrl)}
                          className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[11px]"
                        >
                          <Copy className="w-3 h-3" />
                          نسخ
                        </button>
                      </div>
                      <div className="text-[11px] font-mono text-slate-300 truncate bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                        {agentUrl}
                      </div>
                    </div>

                    {/* Contact & Server Details */}
                    <div className="text-xs text-slate-400 space-y-2 mb-5">
                      {inst.support_phone && (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-emerald-400" />
                            جوال الوكيل:
                          </span>
                          <span className="font-mono text-[11px] text-slate-300 dir-ltr">
                            {inst.support_phone}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-slate-500" />
                          سيرفر Supabase:
                        </span>
                        <span className="font-mono text-[11px] text-slate-300 truncate max-w-[150px]">
                          {inst.supabase_url.replace('https://', '')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {/* Edit Branding Button */}
                      <button
                        onClick={() => openBrandingModal(inst)}
                        title="تعديل الشعار ورقم الجوال والهوية"
                        className="p-2.5 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-xl transition"
                      >
                        <Palette className="w-4 h-4" />
                      </button>

                      {/* Reset Password */}
                      <button
                        onClick={() => {
                          setSelectedInstance(inst);
                          setShowResetModal(true);
                        }}
                        title="تصفير كلمة المرور في سيرفر الوكيل مباشرة"
                        className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>

                      {/* Test Connection */}
                      <button
                        onClick={() => testConnection(inst)}
                        disabled={actionLoading === `test_${inst.id}`}
                        title="فحص الاتصال المباشر بقاعدة بيانات الوكيل"
                        className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition disabled:opacity-50"
                      >
                        {actionLoading === `test_${inst.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                        ) : (
                          <Server className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <button
                      onClick={() => handleKillSwitch(inst)}
                      disabled={actionLoading === `kill_${inst.id}`}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                        isSuspended
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 shadow-md'
                          : 'bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                      <span>{isSuspended ? 'إعادة التفعيل' : 'Kill Switch'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal: Edit Branding */}
        {showBrandingModal && brandingTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <Palette className="w-5 h-5" />
                  <span>تعديل هوية وشعار ({brandingTarget.name})</span>
                </div>
                <button onClick={() => setShowBrandingModal(false)} className="text-slate-500 hover:text-slate-300">
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveBranding} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">اسم الوكيل / العلامة التجارية *</label>
                  <input
                    type="text"
                    required
                    value={brandingData.brand_name}
                    onChange={(e) => setBrandingData({ ...brandingData, brand_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Upload Logo Box */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    شعار الوكيل (رفع صورة مباشرة أو كتابة رابط)
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-950 border border-dashed border-indigo-500/40 hover:border-indigo-500 rounded-xl cursor-pointer transition text-xs text-indigo-300">
                      {uploadingLogo ? (
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                      ) : (
                        <Upload className="w-4 h-4 text-indigo-400" />
                      )}
                      <span>{uploadingLogo ? 'جاري رفع وتحويل الصورة...' : 'اختر صورة من جهازك لرفعها فوراً'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, true);
                        }}
                      />
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={brandingData.logo_url}
                        onChange={(e) => setBrandingData({ ...brandingData, logo_url: e.target.value })}
                        placeholder="أو اكتب رابط الشعار المباشر https://..."
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                      {brandingData.logo_url && (
                        <div className="w-9 h-9 rounded-lg border border-slate-700 overflow-hidden shrink-0 bg-slate-800">
                          <img src={brandingData.logo_url} alt="Logo" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">رقم جوال الوكيل</label>
                    <input
                      type="text"
                      value={brandingData.support_phone}
                      onChange={(e) => setBrandingData({ ...brandingData, support_phone: e.target.value })}
                      placeholder="+9665..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">واتساب الدعم</label>
                    <input
                      type="text"
                      value={brandingData.support_whatsapp}
                      onChange={(e) => setBrandingData({ ...brandingData, support_whatsapp: e.target.value })}
                      placeholder="9665..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">اللون الأساسي للهوية (Hex)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={brandingData.primary_color_hex}
                      onChange={(e) => setBrandingData({ ...brandingData, primary_color_hex: e.target.value })}
                      className="w-10 h-10 rounded-xl border border-slate-800 cursor-pointer bg-slate-950 p-1"
                    />
                    <input
                      type="text"
                      value={brandingData.primary_color_hex}
                      onChange={(e) => setBrandingData({ ...brandingData, primary_color_hex: e.target.value })}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowBrandingModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading === 'saving_branding' || uploadingLogo}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50"
                  >
                    {actionLoading === 'saving_branding' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>حفظ وإرسال لسيرفر الوكيل فوراً</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Create Instance */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                    <PlusCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">إضافة وتجهيز وكيل مستقل</h3>
                    <p className="text-xs text-slate-400">
                      رفع الصورة والهوية مع ربط سيرفر Supabase مستقل
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-slate-300">
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">اسم الوكيل *</label>
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
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">المعرف الفريد (Slug) *</label>
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

                {/* Identity & Contact Details with Direct File Upload */}
                <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
                    <Palette className="w-4 h-4" />
                    <span>الهوية والشعار والتواصل (رفع ملف أو رابط)</span>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">شعار الوكيل</label>
                    <div className="space-y-2">
                      <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 border border-dashed border-indigo-500/40 hover:border-indigo-500 rounded-xl cursor-pointer transition text-xs text-indigo-300">
                        {uploadingLogo ? (
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                        ) : (
                          <Upload className="w-4 h-4 text-indigo-400" />
                        )}
                        <span>{uploadingLogo ? 'جاري رفع وتحويل الصورة...' : 'رفع صورة الشعار من جهازك'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, false);
                          }}
                        />
                      </label>

                      <input
                        type="url"
                        value={formData.brand_logo_url}
                        onChange={(e) => setFormData({ ...formData, brand_logo_url: e.target.value })}
                        placeholder="أو اكتب رابط الصورة المباشر https://..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">رقم جوال الوكيل</label>
                      <input
                        type="text"
                        value={formData.support_phone}
                        onChange={(e) => setFormData({ ...formData, support_phone: e.target.value })}
                        placeholder="+9665..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">رقم واتساب الوكيل</label>
                      <input
                        type="text"
                        value={formData.support_whatsapp}
                        onChange={(e) => setFormData({ ...formData, support_whatsapp: e.target.value })}
                        placeholder="9665..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">الدومين المخصص للوكيل (اختياري)</label>
                  <input
                    type="text"
                    value={formData.custom_domain}
                    onChange={(e) => setFormData({ ...formData, custom_domain: e.target.value })}
                    placeholder="مثال: app.sadim.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Database Credentials */}
                <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
                    <Database className="w-4 h-4" />
                    <span>بيانات سيرفر Supabase الخاص بالوكيل</span>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Supabase URL *</label>
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
                    <label className="block text-xs text-slate-400 mb-1">Supabase Anon Key *</label>
                    <input
                      type="text"
                      required
                      value={formData.supabase_anon_key}
                      onChange={(e) => setFormData({ ...formData, supabase_anon_key: e.target.value })}
                      placeholder="eyJhbGciOi..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1 flex items-center justify-between">
                      <span>Supabase Service Role Key (للتحكم المباشر بالداتابيس) *</span>
                      <span className="text-[10px] text-amber-400">سري ومحمي في لوحتك</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={formData.service_role_key}
                      onChange={(e) => setFormData({ ...formData, service_role_key: e.target.value })}
                      placeholder="eyJhbGciOi..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Admin user info */}
                <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <KeyRound className="w-4 h-4" />
                    <span>إنشاء حساب مالك الوكيل (Super Admin) في سيرفره</span>
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
                    className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading === 'creating' || uploadingLogo}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50"
                  >
                    {actionLoading === 'creating' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري إنشاء الحساب في سيرفر الوكيل...</span>
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
        {showResetModal && selectedInstance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <KeyRound className="w-5 h-5" />
                  <span>تصفير كلمة مرور ({selectedInstance.name})</span>
                </div>
                <button onClick={() => setShowResetModal(false)} className="text-slate-500 hover:text-slate-300">
                  ✕
                </button>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <p className="text-xs text-slate-400">
                  سيتم تعديل كلمة المرور لحساب ({selectedInstance.admin_email}) مباشرة في سيرفر Supabase الخاص به دون أن تفتح لوحته.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">كلمة المرور الجديدة *</label>
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
                      <span>تأكيد التصفير المباشر</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;

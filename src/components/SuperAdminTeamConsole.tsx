import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Lock,
  Unlock,
  Mail,
  Phone,
  Clock,
  Trash2,
  Edit,
  Check,
  X,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Store,
  CreditCard,
  TrendingUp,
  Send,
  AlertTriangle,
  Loader2,
  UserCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { LoyaltyService } from '../lib/supabase';
import {
  SuperAdminUser,
  AdminRole,
  AdminPermissions,
  DEFAULT_SUPER_ADMIN_PERMISSIONS,
  ROLE_PRESET_PERMISSIONS,
} from '../types';

interface SuperAdminTeamConsoleProps {
  currentUser?: SuperAdminUser | null;
}

const ROLE_LABELS: Record<AdminRole, { name: string; badge: string; icon: any }> = {
  super_admin: {
    name: 'مالك المنصة (Super Admin)',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    icon: ShieldCheck,
  },
  platform_manager: {
    name: 'مدير عام المنصة (Manager)',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    icon: Shield,
  },
  support_agent: {
    name: 'مشرف متاجر ودعم فني (Support)',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    icon: UserCheck,
  },
  finance_officer: {
    name: 'مسؤول مالي ومحاسب (Finance)',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    icon: CreditCard,
  },
};

const PERMISSION_CONFIG: {
  key: keyof AdminPermissions;
  title: string;
  description: string;
  icon: any;
  danger?: boolean;
}[] = [
  {
    key: 'can_manage_stores',
    title: 'إدارة وتعديل المتاجر',
    description: 'إنشاء متاجر جديدة وتعديل الهوية والإعدادات التشغيلية',
    icon: Store,
  },
  {
    key: 'can_delete_stores',
    title: 'حذف المتاجر نهائياً',
    description: 'إزالة المتجر وكافة بياناته وقواعده نهائياً من السيرفر',
    icon: Trash2,
    danger: true,
  },
  {
    key: 'can_manage_billing',
    title: 'الفوترة وتجاوزات السداد',
    description: 'تعديل الباقات ومنح فترات سماح وتعديل أسعار الاشتراكات',
    icon: CreditCard,
  },
  {
    key: 'can_view_financials',
    title: 'الاطلاع على الأرقام المالية',
    description: 'مشاهدة إجمالي الإيرادات وسجل الحركات والتقارير المالية للمنصة',
    icon: TrendingUp,
  },
  {
    key: 'can_manage_partners',
    title: 'إدارة الشركاء والمسوقين',
    description: 'تسجيل شركاء مبيعات جدد وتعديل نسب العمولات واعتماد السحوبات',
    icon: Users,
  },
  {
    key: 'can_send_notifications',
    title: 'بث الإشعارات الجماعية',
    description: 'إرسال تنبيهات فورية للمتاجر والعملاء والشركاء',
    icon: Send,
  },
  {
    key: 'can_manage_admins',
    title: 'إدارة فريق العمل والمدراء',
    description: 'إضافة مدراء جدد وتعيين صلاحياتهم أو تجميد حساباتهم',
    icon: Sliders,
    danger: true,
  },
  {
    key: 'can_reset_platform',
    title: 'تصفير المنصة (Reset)',
    description: 'حذف وتصفير كافة بيانات النظام بالكامل (صلاحية قصوى)',
    icon: AlertTriangle,
    danger: true,
  },
];

export const SuperAdminTeamConsole: React.FC<SuperAdminTeamConsoleProps> = ({ currentUser }) => {
  const [team, setTeam] = useState<SuperAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | AdminRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Form state for creating a manager
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<AdminRole>('platform_manager');
  const [customPermissions, setCustomPermissions] = useState<AdminPermissions>({
    ...ROLE_PRESET_PERMISSIONS.platform_manager,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state for editing
  const [editingAdmin, setEditingAdmin] = useState<SuperAdminUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<AdminRole>('platform_manager');
  const [editPermissions, setEditPermissions] = useState<AdminPermissions>({
    ...ROLE_PRESET_PERMISSIONS.platform_manager,
  });
  const [editIsActive, setEditIsActive] = useState(true);
  const [editNewPassword, setEditNewPassword] = useState('');

  // Target for delete
  const [adminToDelete, setAdminToDelete] = useState<SuperAdminUser | null>(null);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await LoyaltyService.getSuperAdminTeam();
      setTeam(data);
    } catch (err: any) {
      setError(err.message || 'تعذر جلب فريق الإدارة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // Handle Preset Selection for Create Form
  const handleRolePresetChange = (newRole: AdminRole) => {
    setSelectedRole(newRole);
    if (newRole !== 'super_admin') {
      setCustomPermissions({ ...ROLE_PRESET_PERMISSIONS[newRole] });
    } else {
      setCustomPermissions({ ...DEFAULT_SUPER_ADMIN_PERMISSIONS });
    }
  };

  // Toggle single permission for Create Form
  const togglePermission = (key: keyof AdminPermissions) => {
    setCustomPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Toggle single permission for Edit Form
  const toggleEditPermission = (key: keyof AdminPermissions) => {
    setEditPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setSelectedRole('platform_manager');
    setCustomPermissions({ ...ROLE_PRESET_PERMISSIONS.platform_manager });
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Submit Add Manager
  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setFormError('يرجى ملء كافة الحقول الأساسية (الاسم، البريد، كلمة المرور)');
      return;
    }

    if (password.length < 6) {
      setFormError('كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await LoyaltyService.createSuperAdminManager({
        email: email.trim(),
        password: password.trim(),
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        role: selectedRole,
        permissions: selectedRole === 'super_admin' ? DEFAULT_SUPER_ADMIN_PERMISSIONS : customPermissions,
      });

      if (res.success) {
        setIsAddModalOpen(false);
        setSuccess('تمت إضافة المدير بنجاح وتم تفعيل حسابه في المنصة!');
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
        fetchTeam();
      } else {
        setFormError(res.error || 'فشلت إضافة المدير');
      }
    } catch (err: any) {
      setFormError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (admin: SuperAdminUser) => {
    setEditingAdmin(admin);
    setEditFullName(admin.full_name || '');
    // Prevent email from leaking into phone input
    const isEmailInPhone = admin.phone?.includes('@');
    setEditPhone(isEmailInPhone ? '' : (admin.phone || ''));
    setEditRole(admin.role);
    setEditPermissions({
      ...DEFAULT_SUPER_ADMIN_PERMISSIONS,
      ...(admin.permissions || {}),
    });
    setEditIsActive(admin.is_active);
    setEditNewPassword('');
    setFormError(null);
    setIsEditModalOpen(true);
  };

  // Submit Edit Manager
  const handleUpdateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;
    setFormError(null);

    setIsSubmitting(true);
    try {
      const res = await LoyaltyService.updateSuperAdminManager({
        admin_id: editingAdmin.id,
        full_name: editFullName.trim(),
        phone: editPhone.trim() || undefined,
        role: editRole,
        permissions: editRole === 'super_admin' ? DEFAULT_SUPER_ADMIN_PERMISSIONS : editPermissions,
        is_active: editIsActive,
        new_password: editNewPassword.trim() ? editNewPassword.trim() : undefined,
      });

      if (res.success) {
        setIsEditModalOpen(false);
        setEditingAdmin(null);
        setSuccess('تم تحديث بيانات وصلاحيات المدير بنجاح');
        fetchTeam();
      } else {
        setFormError(res.error || 'تعذر تحديث البيانات');
      }
    } catch (err: any) {
      setFormError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Toggle Active Status
  const handleToggleActive = async (admin: SuperAdminUser) => {
    if (admin.role === 'super_admin') {
      alert('لا يمكن تجميد حساب مالك المنصة الأساسي');
      return;
    }

    try {
      const res = await LoyaltyService.updateSuperAdminManager({
        admin_id: admin.id,
        is_active: !admin.is_active,
      });
      if (res.success) {
        fetchTeam();
      } else {
        alert(res.error || 'تعذر تغيير حالة الحساب');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    }
  };

  // Open Delete Confirmation
  const handleOpenDeleteModal = (admin: SuperAdminUser) => {
    if (admin.role === 'super_admin') {
      alert('لا يمكن حذف حساب مالك المنصة الأساسي');
      return;
    }
    if (currentUser && currentUser.id === admin.id) {
      alert('لا يمكنك حذف حسابك المسجل حالياً');
      return;
    }
    setAdminToDelete(admin);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!adminToDelete) return;
    setIsSubmitting(true);
    try {
      const res = await LoyaltyService.deleteSuperAdminManager(adminToDelete.id);
      if (res.success) {
        setIsDeleteModalOpen(false);
        setAdminToDelete(null);
        setSuccess('تم حذف المدير وسحب كافة صلاحياته بنجاح');
        fetchTeam();
      } else {
        alert(res.error || 'تعذر حذف المدير');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered list
  const filteredTeam = team.filter((member) => {
    if (roleFilter !== 'ALL' && member.role !== roleFilter) return false;
    if (statusFilter === 'ACTIVE' && !member.is_active) return false;
    if (statusFilter === 'INACTIVE' && member.is_active) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = member.full_name?.toLowerCase().includes(q);
      const matchEmail = member.email?.toLowerCase().includes(q);
      const matchPhone = member.phone?.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchPhone) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 🌟 Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Users className="w-6 h-6 text-amber-400" />
            <h3 className="text-xl font-black text-white">فريق إدارة المنصة والصلاحيات</h3>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {team.length} عضو
            </span>
          </div>
          <p className="text-xs text-slate-400">
            إضافة مدراء ومساعدين لمنصتك وتعيين صلاحيات دقيقة ومخصصة لكل مسؤول.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchTeam}
            disabled={loading}
            className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة مدير جديد ➕</span>
          </button>
        </div>
      </div>

      {/* 🔔 Notifications / Alerts */}
      {success && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-emerald-400 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-rose-400 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 📊 Summary Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">إجمالي الحسابات</span>
          <span className="text-2xl font-black text-white font-mono">{team.length}</span>
        </div>
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <span className="text-xs text-emerald-400 block mb-1">حسابات نشطة</span>
          <span className="text-2xl font-black text-emerald-400 font-mono">
            {team.filter((m) => m.is_active).length}
          </span>
        </div>
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <span className="text-xs text-rose-400 block mb-1">حسابات مجمدة</span>
          <span className="text-2xl font-black text-rose-400 font-mono">
            {team.filter((m) => !m.is_active).length}
          </span>
        </div>
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <span className="text-xs text-amber-400 block mb-1">ملاك المنصة</span>
          <span className="text-2xl font-black text-amber-400 font-mono">
            {team.filter((m) => m.role === 'super_admin').length}
          </span>
        </div>
      </div>

      {/* 🔍 Search & Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، البريد الإلكتروني، أو رقم الجوال..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-10 pl-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">جميع الرتب</option>
            <option value="super_admin">مالك منصة</option>
            <option value="platform_manager">مدير عام</option>
            <option value="support_agent">مشرف متاجر / دعم</option>
            <option value="finance_officer">مسؤول مالي</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">جميع الحالات</option>
            <option value="ACTIVE">نشط فقط</option>
            <option value="INACTIVE">مجمد فقط</option>
          </select>
        </div>
      </div>

      {/* 👥 Team Members Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          <p className="text-xs">جاري تحميل فريق الإدارة...</p>
        </div>
      ) : filteredTeam.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 rounded-3xl border border-slate-800 space-y-3">
          <Users className="w-12 h-12 text-slate-600 mx-auto" />
          <h4 className="text-base font-bold text-white">لا يوجد مدراء مطابقين للبحث</h4>
          <p className="text-xs text-slate-400">يمكنك إضافة مدير جديد بالضغط على زر "إضافة مدير جديد" أعلاه.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTeam.map((member) => {
            const roleInfo = ROLE_LABELS[member.role] || ROLE_LABELS.platform_manager;
            const RoleIcon = roleInfo.icon;
            const isOwner = member.role === 'super_admin';

            return (
              <div
                key={member.id}
                className={`relative bg-slate-900/60 p-5 rounded-3xl border transition flex flex-col justify-between gap-5 ${
                  member.is_active
                    ? 'border-slate-800 hover:border-slate-700'
                    : 'border-rose-900/40 bg-rose-950/10'
                }`}
              >
                {/* Header: User Info & Role Badge */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-slate-800 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-base flex-shrink-0">
                        {member.full_name ? member.full_name.charAt(0).toUpperCase() : 'A'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{member.full_name || 'مدير المنصة'}</h4>
                          {!member.is_active && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold">
                              مجمّد
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-mono">{member.email}</span>
                        </div>
                        {member.phone && (
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            <span className="font-mono">{member.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border flex items-center gap-1.5 ${roleInfo.badge}`}
                      >
                        <RoleIcon className="w-3.5 h-3.5" />
                        <span>{roleInfo.name.split(' ')[0]}</span>
                      </span>
                      {member.last_login_at && (
                        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(member.last_login_at).toLocaleDateString('ar-SA')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Permissions Chips */}
                  <div className="mt-4 pt-4 border-t border-slate-800/80">
                    <span className="text-[11px] font-bold text-slate-400 block mb-2">الصلاحيات الممنوحة:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {isOwner ? (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          👑 مالك المنصة — كافة الصلاحيات مفتوحة
                        </span>
                      ) : (
                        PERMISSION_CONFIG.map((p) => {
                          const hasIt = Boolean(member.permissions?.[p.key]);
                          if (!hasIt) return null;
                          return (
                            <span
                              key={p.key}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                p.danger
                                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>{p.title}</span>
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center gap-2">
                    {!isOwner && (
                      <button
                        onClick={() => handleToggleActive(member)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 border ${
                          member.is_active
                            ? 'bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white border-rose-500/30'
                            : 'bg-emerald-500/10 hover:bg-emerald-500 text-emerald-300 hover:text-white border-emerald-500/30'
                        }`}
                      >
                        {member.is_active ? (
                          <>
                            <Lock className="w-3 h-3" />
                            <span>تجميد الحساب</span>
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3" />
                            <span>تنشيط الحساب</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEditModal(member)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold transition flex items-center gap-1.5 border border-slate-700"
                    >
                      <Edit className="w-3 h-3 text-amber-400" />
                      <span>تعديل الصلاحيات</span>
                    </button>

                    {!isOwner && currentUser?.id !== member.id && (
                      <button
                        onClick={() => handleOpenDeleteModal(member)}
                        className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white text-[11px] font-bold transition border border-rose-500/30"
                        title="حذف الحساب"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================== */}
      {/* 🌟 MODAL: إضافة مدير جديد */}
      {/* ============================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">إضافة مدير جديد للمنصة</h3>
                  <p className="text-xs text-slate-400">أنشئ حساب إداري وعيّن صلاحياته بدقة</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateManager} className="mt-6 space-y-6">
              {/* Account Credentials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    الاسم الكامل <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="مثال: عبدالله التميمي"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    البريد الإلكتروني (لتسجيل الدخول) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رقم الجوال (اختياري)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05XXXXXXXX"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    كلمة المرور المؤقتة <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="•••••••• (6 أحرف فأكثر)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Role Preset Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  قالب الرتبة الافتراضي (Role Preset)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(['platform_manager', 'support_agent', 'finance_officer', 'super_admin'] as AdminRole[]).map(
                    (roleKey) => {
                      const isSel = selectedRole === roleKey;
                      const info = ROLE_LABELS[roleKey];
                      const Icon = info.icon;
                      return (
                        <button
                          key={roleKey}
                          type="button"
                          onClick={() => handleRolePresetChange(roleKey)}
                          className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between gap-2 ${
                            isSel
                              ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <Icon className={`w-4 h-4 ${isSel ? 'text-amber-400' : 'text-slate-500'}`} />
                          <div>
                            <span className="text-xs font-bold block">{info.name.split(' ')[0]}</span>
                            <span className="text-[10px] text-slate-500">{info.name.split('(')[1]?.replace(')', '')}</span>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Granular Permissions Checkboxes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300">الصلاحيات التفصيلية (Custom Permissions)</label>
                  {selectedRole === 'super_admin' && (
                    <span className="text-[11px] text-amber-400 font-bold">👑 كافة الصلاحيات مفعلة تلقائياً للمالك</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto p-1 border border-slate-800 rounded-2xl bg-slate-950/40">
                  {PERMISSION_CONFIG.map((p) => {
                    const isChecked =
                      selectedRole === 'super_admin' ? true : Boolean(customPermissions[p.key]);
                    const Icon = p.icon;

                    return (
                      <div
                        key={p.key}
                        onClick={() => selectedRole !== 'super_admin' && togglePermission(p.key)}
                        className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition select-none ${
                          isChecked
                            ? 'bg-amber-500/10 border-amber-500/40 text-white'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        } ${selectedRole === 'super_admin' ? 'cursor-not-allowed opacity-90' : ''}`}
                      >
                        <div
                          className={`w-4 h-4 rounded-md mt-0.5 flex items-center justify-center border transition ${
                            isChecked
                              ? 'bg-amber-500 border-amber-500 text-slate-950'
                              : 'border-slate-700 bg-slate-950'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <Icon className={`w-3.5 h-3.5 ${isChecked ? 'text-amber-400' : 'text-slate-500'}`} />
                            <span className="text-xs font-bold">{p.title}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{p.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>حفظ وإضافة المدير</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 🌟 MODAL: تعديل بيانات وصلاحيات المدير */}
      {/* ============================================================== */}
      {isEditModalOpen && editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">تعديل بيانات وصلاحيات المدير</h3>
                  <p className="text-xs text-slate-400 font-mono">{editingAdmin.email}</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateManager} className="mt-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">الاسم الكامل</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رقم الجوال</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    تغيير كلمة المرور (اتركه فارغاً للإبقاء على الحالية)
                  </label>
                  <input
                    type="password"
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    placeholder="•••••••• (اختياري)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">حالة الحساب</label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                      <input
                        type="radio"
                        name="activeStatus"
                        checked={editIsActive}
                        onChange={() => setEditIsActive(true)}
                        className="text-amber-500 focus:ring-0"
                      />
                      <span>نشط</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input
                        type="radio"
                        name="activeStatus"
                        checked={!editIsActive}
                        disabled={editingAdmin.role === 'super_admin'}
                        onChange={() => setEditIsActive(false)}
                        className="text-rose-500 focus:ring-0"
                      />
                      <span>مجمّد</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Role Preset Selector */}
              {editingAdmin.role !== 'super_admin' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">الرتبة والدور</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(['platform_manager', 'support_agent', 'finance_officer'] as AdminRole[]).map((roleKey) => {
                      const isSel = editRole === roleKey;
                      const info = ROLE_LABELS[roleKey];
                      return (
                        <button
                          key={roleKey}
                          type="button"
                          onClick={() => {
                            setEditRole(roleKey);
                            setEditPermissions({ ...ROLE_PRESET_PERMISSIONS[roleKey] });
                          }}
                          className={`p-3 rounded-2xl border text-right transition ${
                            isSel
                              ? 'bg-amber-500/10 border-amber-500 text-white'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400'
                          }`}
                        >
                          <span className="text-xs font-bold block">{info.name.split(' ')[0]}</span>
                          <span className="text-[10px] text-slate-500">{info.name.split('(')[1]?.replace(')', '')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                  👑 مالك المنصة الأساسي يمتلك كافة الصلاحيات بدون قيود.
                </div>
              )}

              {/* Granular Permissions Checkboxes */}
              {editingAdmin.role !== 'super_admin' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">الصلاحيات المخصصة</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto p-1 border border-slate-800 rounded-2xl bg-slate-950/40">
                    {PERMISSION_CONFIG.map((p) => {
                      const isChecked = Boolean(editPermissions[p.key]);
                      const Icon = p.icon;

                      return (
                        <div
                          key={p.key}
                          onClick={() => toggleEditPermission(p.key)}
                          className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition select-none ${
                            isChecked
                              ? 'bg-amber-500/10 border-amber-500/40 text-white'
                              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-md mt-0.5 flex items-center justify-center border transition ${
                              isChecked
                                ? 'bg-amber-500 border-amber-500 text-slate-950'
                                : 'border-slate-700 bg-slate-950'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <Icon className={`w-3.5 h-3.5 ${isChecked ? 'text-amber-400' : 'text-slate-500'}`} />
                              <span className="text-xs font-bold">{p.title}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{p.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>حفظ التعديلات</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* ⚠️ MODAL: تأكيد حذف المدير */}
      {/* ============================================================== */}
      {isDeleteModalOpen && adminToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-lg font-black text-white">هل أنت متأكد من حذف هذا المدير؟</h4>
              <p className="text-xs text-slate-400">
                سيتم حذف حساب <span className="font-bold text-white">{adminToDelete.full_name}</span> (
                <span className="font-mono text-amber-400">{adminToDelete.email}</span>) وإلغاء وصوله للوحة التحكم
                نهائياً.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmDelete}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
              >
                {isSubmitting ? 'جاري الحذف...' : 'نعم، حذف نهائياً'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, LogOut, ArrowRight, Lock } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  portalName?: string;
  loginFallback?: React.ReactNode;
  children: React.ReactNode;
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'مالك المنصة (Super Admin) 👑',
  partner: 'شريك مبيعات معتمد (Sales Partner) 🤝',
  merchant: 'مدير المتجر (Merchant Admin) 🏪',
  cashier: 'كاشير المتجر (Cashier POS) ⚡',
  customer: 'عميل المتجر (Customer) 📱',
};

const ROLE_DEFAULT_ROUTES: Record<UserRole, { path: string; portal: string }> = {
  super_admin: { path: '/super-admin', portal: 'super-admin' },
  partner: { path: '/partner', portal: 'partner' },
  merchant: { path: '/admin', portal: 'admin' },
  cashier: { path: '/cashier', portal: 'cashier' },
  customer: { path: '/', portal: 'customer' },
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
  portalName = 'هذه البوابة',
  loginFallback,
  children,
}) => {
  const { user, role, isAuthenticated, isLoading, logout } = useAuth();

  // 1. Wait for Auth Context to fully resolve on page reload (Prevents premature redirect & session bleed)
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xl font-bold animate-pulse">
          <Lock className="w-6 h-6 animate-spin" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white">جاري التحقق من الصلاحيات والأمان...</h3>
          <p className="text-xs text-slate-400 font-mono">Role-Based Access Control (RBAC) Verification</p>
        </div>
      </div>
    );
  }

  // 2. If not authenticated:
  // If a login fallback component is provided (or if children handle their own login view), render it cleanly
  if (!isAuthenticated || !role) {
    if (loginFallback) {
      return <>{loginFallback}</>;
    }
    return <>{children}</>;
  }

  // 3. Hierarchical Isolation: Super Admin has master access to all portals; others must match allowedRoles
  if (role !== 'super_admin' && !allowedRoles.includes(role)) {
    const userRoleLabel = ROLE_LABELS[role] || role;
    const requiredRolesLabel = allowedRoles.map((r) => ROLE_LABELS[r] || r).join(' أو ');
    const authorizedRoute = ROLE_DEFAULT_ROUTES[role] || { path: '/partner', portal: 'partner' };

    const handleNavigateToAuthorizedPortal = () => {
      const url = new URL(window.location.origin + authorizedRoute.path);
      url.searchParams.set('portal', authorizedRoute.portal);
      window.location.href = url.toString();
    };

    const handleSwitchAccount = () => {
      logout();
      const url = new URL(window.location.href);
      window.location.href = url.toString();
    };

    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-slate-900/95 border border-rose-500/30 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

          <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto text-2xl font-black shadow-lg shadow-rose-500/10">
            <ShieldAlert className="w-8 h-8 text-rose-400" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-mono font-bold">
              <span>⛔ 403 FORBIDDEN</span>
              <span>•</span>
              <span>عزل الصلاحيات الهرمي</span>
            </div>
            <h2 className="text-xl font-black text-white">غير مصرح لك بالدخول إلى {portalName}</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              أنت مسجل الدخول حالياً بصلاحية: <br />
              <strong className="text-amber-400 font-bold">{userRoleLabel}</strong>
              <br />
              بينما تتطلب هذه البوابة صلاحية: <br />
              <strong className="text-emerald-400 font-bold">{requiredRolesLabel}</strong>
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              onClick={handleNavigateToAuthorizedPortal}
              className="w-full py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            >
              <span>الذهاب إلى لوحتي المصرحة ({userRoleLabel})</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>

            <button
              onClick={handleSwitchAccount}
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج والتبديل لحساب آخر</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Fully Authenticated and Authorized
  return <>{children}</>;
};

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

  // 2. If not authenticated or current session belongs to another portal role:
  // Render loginFallback if provided, or allow the portal's native PIN/Login Gate to render cleanly
  if (!isAuthenticated || !role || (role !== 'super_admin' && !allowedRoles.includes(role))) {
    if (loginFallback) {
      return <>{loginFallback}</>;
    }
    return <>{children}</>;
  }

  // 3. Fully Authenticated and Authorized
  return <>{children}</>;
};

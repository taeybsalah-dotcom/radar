import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserRole, AuthUser, AuthSessionState } from '../types';
import { LoyaltyService } from '../lib/supabase';

interface AuthContextValue extends AuthSessionState {
  login: (role: UserRole, userDetails: Partial<AuthUser>) => void;
  logout: (role?: UserRole) => void;
  hasRole: (allowedRoles: UserRole[]) => boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const UNIFIED_AUTH_KEY = 'radar_unified_auth_user';
const SUPER_ADMIN_AUTH_KEY = 'RADAR_SUPER_ADMIN_AUTH';

function getInitialAuthSync(): { user: AuthUser | null; role: UserRole | null; isAuthenticated: boolean } {
  if (typeof window === 'undefined') return { user: null, role: null, isAuthenticated: false };
  try {
    // 1. Check Unified Auth Store
    const savedUnified = localStorage.getItem(UNIFIED_AUTH_KEY);
    if (savedUnified) {
      try {
        const parsed = JSON.parse(savedUnified) as AuthUser;
        if (parsed && parsed.role && parsed.id) {
          return { user: parsed, role: parsed.role, isAuthenticated: true };
        }
      } catch {}
    }

    // 2. Check Super Admin Persistent Auth
    const isSuperAdmin =
      localStorage.getItem(SUPER_ADMIN_AUTH_KEY) === 'true' ||
      sessionStorage.getItem(SUPER_ADMIN_AUTH_KEY) === 'true';
    if (isSuperAdmin) {
      const superAdminUser: AuthUser = {
        id: 'super_admin_session',
        role: 'super_admin',
        name: 'مالك المنصة (Super Admin)',
      };
      return { user: superAdminUser, role: 'super_admin', isAuthenticated: true };
    }

    // 3. Check Partner Session
    const partnerSession = LoyaltyService.getPartnerSession();
    if (partnerSession && partnerSession.id) {
      const partnerUser: AuthUser = {
        id: partnerSession.id,
        role: 'partner',
        name: partnerSession.display_name || partnerSession.name,
        phone: partnerSession.affiliates?.phone || partnerSession.phone,
        partnerId: partnerSession.id,
        partnerSlug: partnerSession.slug || partnerSession.referral_code,
        metadata: partnerSession,
      };
      return { user: partnerUser, role: 'partner', isAuthenticated: true };
    }
  } catch {}
  return { user: null, role: null, isAuthenticated: false };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialAuth = getInitialAuthSync();
  const [user, setUser] = useState<AuthUser | null>(initialAuth.user);
  const [role, setRole] = useState<UserRole | null>(initialAuth.role);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(initialAuth.isAuthenticated);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 🔍 Synchronous and Asynchronous Session Resolver
  const resolveSession = useCallback(async () => {
    try {
      const fresh = getInitialAuthSync();
      setUser(fresh.user);
      setRole(fresh.role);
      setIsAuthenticated(fresh.isAuthenticated);
      if (fresh.user) {
        localStorage.setItem(UNIFIED_AUTH_KEY, JSON.stringify(fresh.user));
      }
    } catch (e) {
      console.warn('[AuthContext] Failed to resolve auth session:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    resolveSession();
  }, [resolveSession]);

  const login = useCallback((newRole: UserRole, userDetails: Partial<AuthUser>) => {
    const authUser: AuthUser = {
      id: userDetails.id || `user_${Date.now()}`,
      role: newRole,
      name: userDetails.name || (newRole === 'super_admin' ? 'مالك المنصة' : 'مستخدم معتمد'),
      phone: userDetails.phone,
      storeId: userDetails.storeId,
      storeSlug: userDetails.storeSlug,
      partnerId: userDetails.partnerId,
      partnerSlug: userDetails.partnerSlug,
      token: userDetails.token,
      metadata: userDetails.metadata,
    };

    setUser(authUser);
    setRole(newRole);
    setIsAuthenticated(true);
    setIsLoading(false);

    try {
      localStorage.setItem(UNIFIED_AUTH_KEY, JSON.stringify(authUser));

      // Synchronize role-specific legacy session keys for deep backward compatibility
      if (newRole === 'super_admin') {
        localStorage.setItem(SUPER_ADMIN_AUTH_KEY, 'true');
        sessionStorage.setItem(SUPER_ADMIN_AUTH_KEY, 'true');
      } else if (newRole === 'partner' && userDetails.metadata) {
        localStorage.setItem('radar_partner_session', JSON.stringify(userDetails.metadata));
      }
    } catch (err) {
      console.warn('[AuthContext] Error storing auth session:', err);
    }
  }, []);

  const logout = useCallback((specificRole?: UserRole) => {
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);

    try {
      localStorage.removeItem(UNIFIED_AUTH_KEY);

      if (!specificRole || specificRole === 'super_admin') {
        localStorage.removeItem(SUPER_ADMIN_AUTH_KEY);
        sessionStorage.removeItem(SUPER_ADMIN_AUTH_KEY);
      }
      if (!specificRole || specificRole === 'partner') {
        LoyaltyService.clearPartnerSession();
        sessionStorage.removeItem('RADAR_PARTNER_AUTH_TOKEN');
      }
    } catch (err) {
      console.warn('[AuthContext] Error during logout cleanup:', err);
    }
  }, []);

  const hasRole = useCallback(
    (allowedRoles: UserRole[]): boolean => {
      if (!role || !isAuthenticated) return false;
      return allowedRoles.includes(role);
    },
    [role, isAuthenticated]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated,
        isLoading,
        login,
        logout,
        hasRole,
        refreshSession: resolveSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

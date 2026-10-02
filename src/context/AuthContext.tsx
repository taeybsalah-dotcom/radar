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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 🔍 Synchronous and Asynchronous Session Resolver
  const resolveSession = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Check Unified Auth Store
      const savedUnified = localStorage.getItem(UNIFIED_AUTH_KEY);
      if (savedUnified) {
        try {
          const parsed = JSON.parse(savedUnified) as AuthUser;
          if (parsed && parsed.role && parsed.id) {
            setUser(parsed);
            setRole(parsed.role);
            setIsAuthenticated(true);
            setIsLoading(false);
            return;
          }
        } catch {}
      }

      // 2. Check Partner Session
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
        setUser(partnerUser);
        setRole('partner');
        setIsAuthenticated(true);
        localStorage.setItem(UNIFIED_AUTH_KEY, JSON.stringify(partnerUser));
        setIsLoading(false);
        return;
      }

      // 3. Check Super Admin Session
      const isSuperAdminAuth = typeof window !== 'undefined' && sessionStorage.getItem('RADAR_SUPER_ADMIN_AUTH') === 'true';
      if (isSuperAdminAuth) {
        const superAdminUser: AuthUser = {
          id: 'super_admin_session',
          role: 'super_admin',
          name: 'مالك المنصة (Super Admin)',
        };
        setUser(superAdminUser);
        setRole('super_admin');
        setIsAuthenticated(true);
        localStorage.setItem(UNIFIED_AUTH_KEY, JSON.stringify(superAdminUser));
        setIsLoading(false);
        return;
      }

      // 4. If no explicit active session found, reset state cleanly
      setUser(null);
      setRole(null);
      setIsAuthenticated(false);
    } catch (e) {
      console.warn('[AuthContext] Failed to resolve auth session:', e);
      setUser(null);
      setRole(null);
      setIsAuthenticated(false);
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
        sessionStorage.setItem('RADAR_SUPER_ADMIN_AUTH', 'true');
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
        sessionStorage.removeItem('RADAR_SUPER_ADMIN_AUTH');
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

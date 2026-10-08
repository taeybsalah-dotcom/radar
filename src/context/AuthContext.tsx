import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { UserRole, AuthUser, AuthSessionState } from '../types';
import { LoyaltyService, getSupabaseClient } from '../lib/supabase';

interface AuthContextValue extends AuthSessionState {
  login: (role: UserRole, userDetails: Partial<AuthUser>) => void;
  logout: (role?: UserRole) => Promise<void>;
  hasRole: (allowedRoles: UserRole[]) => boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const UNIFIED_AUTH_KEY = 'radar_unified_auth_user';
const SUPER_ADMIN_AUTH_KEY = 'RADAR_SUPER_ADMIN_AUTH';

function isSuperAdminPortalRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname.includes('super-admin') ||
    window.location.pathname.includes('superadmin') ||
    window.location.search.includes('super-admin') ||
    window.location.search.includes('superadmin') ||
    window.location.hash.includes('super-admin') ||
    window.location.hash.includes('superadmin')
  );
}

function getInitialAuthSync(): { user: AuthUser | null; role: UserRole | null; isAuthenticated: boolean } {
  if (typeof window === 'undefined') return { user: null, role: null, isAuthenticated: false };
  try {
    // 🛡️ Do NOT read localStorage auth if currently on super-admin portal route
    if (isSuperAdminPortalRoute()) {
      return { user: null, role: null, isAuthenticated: false };
    }

    // 1. Check Unified Auth Store (Only for non-super_admin accounts)
    const savedUnified = localStorage.getItem(UNIFIED_AUTH_KEY);
    if (savedUnified) {
      try {
        const parsed = JSON.parse(savedUnified) as AuthUser;
        if (parsed && parsed.role && parsed.id) {
          // 🛡️ SECURITY GATE: Super Admin role CANNOT be established from localStorage!
          if (parsed.role !== 'super_admin') {
            return { user: parsed, role: parsed.role, isAuthenticated: true };
          }
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
  const isLoggingOutRef = useRef<boolean>(false);

  // 🔍 Synchronous and Asynchronous Session Resolver
  const resolveSession = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    try {
      // 1. First, check official Supabase Auth session for super_admin
      const superAdminCheck = await LoyaltyService.verifySuperAdminSession();
      if (superAdminCheck.is_super_admin) {
        const superAdminUser: AuthUser = {
          id: 'super_admin_session',
          role: 'super_admin',
          name: 'مالك المنصة (Super Admin)',
          phone: superAdminCheck.email,
        };
        setUser(superAdminUser);
        setRole('super_admin');
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }

      // 🛡️ If on super-admin portal route and Supabase verification failed: stay strictly logged out!
      if (isSuperAdminPortalRoute()) {
        setUser(null);
        setRole(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      // 2. Otherwise resolve non-super_admin session
      const fresh = getInitialAuthSync();
      if (fresh.role === 'super_admin') {
        setUser(null);
        setRole(null);
        setIsAuthenticated(false);
      } else {
        setUser(fresh.user);
        setRole(fresh.role);
        setIsAuthenticated(fresh.isAuthenticated);
        if (fresh.user) {
          localStorage.setItem(UNIFIED_AUTH_KEY, JSON.stringify(fresh.user));
        }
      }
    } catch (e) {
      console.warn('[AuthContext] Failed to resolve auth session:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (specificRole?: UserRole): Promise<void> => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    // 1. Instantly reset React state
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);

    try {
      // 2. Clean up storage tokens
      localStorage.removeItem(UNIFIED_AUTH_KEY);
      localStorage.removeItem(SUPER_ADMIN_AUTH_KEY);
      sessionStorage.removeItem(SUPER_ADMIN_AUTH_KEY);

      if (!specificRole || specificRole === 'partner') {
        LoyaltyService.clearPartnerSession();
        sessionStorage.removeItem('RADAR_PARTNER_AUTH_TOKEN');
      }

      if (!specificRole || specificRole === 'super_admin') {
        await LoyaltyService.superAdminSignOut();
      }
    } catch (err) {
      console.warn('[AuthContext] Error during logout cleanup:', err);
    } finally {
      // Release lock after allowing asynchronous auth events to settle
      setTimeout(() => {
        isLoggingOutRef.current = false;
      }, 400);
    }
  }, []);

  useEffect(() => {
    resolveSession();

    const supabase = getSupabaseClient();
    let authSub: any;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        // 🛡️ If active logout is in progress, ignore events to break any recursion loops
        if (isLoggingOutRef.current) return;

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session) {
            resolveSession();
          }
        } else if (event === 'SIGNED_OUT') {
          // Server confirmed sign-out: cleanly reset state WITHOUT re-calling signOut()
          setUser(null);
          setRole(null);
          setIsAuthenticated(false);
          try {
            localStorage.removeItem(UNIFIED_AUTH_KEY);
            localStorage.removeItem(SUPER_ADMIN_AUTH_KEY);
            sessionStorage.removeItem(SUPER_ADMIN_AUTH_KEY);
          } catch {}
        }
      });
      authSub = data.subscription;
    }

    return () => {
      if (authSub) authSub.unsubscribe();
    };
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
      if (newRole !== 'super_admin') {
        localStorage.setItem(UNIFIED_AUTH_KEY, JSON.stringify(authUser));
      } else {
        localStorage.removeItem(SUPER_ADMIN_AUTH_KEY);
        sessionStorage.removeItem(SUPER_ADMIN_AUTH_KEY);
      }

      if (newRole === 'partner' && userDetails.metadata) {
        localStorage.setItem('radar_partner_session', JSON.stringify(userDetails.metadata));
      }
    } catch (err) {
      console.warn('[AuthContext] Error storing auth session:', err);
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

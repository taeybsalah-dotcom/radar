import React, { useState, useEffect, useMemo } from 'react';
import { Store, UserRole } from './types';
import { LoyaltyService } from './lib/supabase';
import { LoyaltyEvents } from './lib/events';
import { debounce } from './lib/debounce';
import { INITIAL_STORE } from './lib/demoData';
import { isDemoStoreSlug } from './lib/slugUtils';
import { INITIAL_DEMO_STORE, DEMO_STORE_SLUG } from './lib/demoStoreSeed';
import { updateDynamicPWA } from './lib/pwa';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { NotificationPermissionBanner } from './components/NotificationPermissionBanner';
import { registerRadarServiceWorker, sendPortalNotification, saveInboxNotification } from './lib/notifications';
import { playBeepSound } from './lib/sound';
import { Bell, Coins, X } from 'lucide-react';

const SuperAdminDashboard = React.lazy(() =>
  import('./components/SuperAdminDashboard').then((m) => ({ default: m.SuperAdminDashboard }))
);
const CashierPOS = React.lazy(() =>
  import('./components/CashierPOS').then((m) => ({ default: m.CashierPOS }))
);
const CustomerWallet = React.lazy(() =>
  import('./components/CustomerWallet').then((m) => ({ default: m.CustomerWallet }))
);
const StoreAdmin = React.lazy(() =>
  import('./components/StoreAdmin').then((m) => ({ default: m.StoreAdmin }))
);
const MerchantJoinLanding = React.lazy(() =>
  import('./components/MerchantJoinLanding').then((m) => ({ default: m.MerchantJoinLanding }))
);
const PartnerDashboard = React.lazy(() =>
  import('./components/PartnerDashboard').then((m) => ({ default: m.PartnerDashboard }))
);
const PartnerPublicLanding = React.lazy(() =>
  import('./components/PartnerPublicLanding').then((m) => ({ default: m.PartnerPublicLanding }))
);
const MerchantOnboardingConsole = React.lazy(() =>
  import('./components/MerchantOnboardingConsole').then((m) => ({ default: m.MerchantOnboardingConsole }))
);

type PortalTab =
  | 'super-admin'
  | 'cashier'
  | 'customer'
  | 'admin'
  | 'join'
  | 'partner'
  | 'partner-landing'
  | 'onboarding';

function getInitialStoreSync(targetSlug?: string | null): Store | null {
  if (typeof window === 'undefined') return null;
  const clean = (targetSlug || '').trim().toLowerCase();
  if (clean === DEMO_STORE_SLUG || isDemoStoreSlug(clean)) {
    return INITIAL_DEMO_STORE;
  }
  try {
    const rawList = localStorage.getItem('radar_local_stores');
    if (rawList) {
      const stores: Store[] = JSON.parse(rawList);
      if (Array.isArray(stores) && stores.length > 0) {
        if (targetSlug) {
          const found = stores.find((s) => s.slug === targetSlug || s.id === targetSlug);
          return found || null;
        }
        return stores[0];
      }
    }
  } catch {}
  return null;
}

function parseRouteParams() {
  if (typeof window === 'undefined') {
    return {
      portal: 'join' as PortalTab,
      isPreview: false,
      storeSlug: null as string | null,
      partnerSlug: null as string | null,
    };
  }
  const urlParams = new URLSearchParams(window.location.search);
  const portalParam = (urlParams.get('portal') || '').toLowerCase().trim();
  const slugParam = urlParams.get('store');
  const previewParam = urlParams.get('preview') === 'true';

  const pathname = (window.location.pathname || '').toLowerCase();
  const rawHash = window.location.hash ? window.location.hash.replace(/^#\/?/, '').trim() : '';

  // 1. Check Partner Portal (/partner, /partner/, portal=partner, #partner)
  const isPartnerPortal =
    pathname === '/partner' ||
    pathname === '/partner/' ||
    portalParam === 'partner' ||
    rawHash === 'partner';
  if (isPartnerPortal) {
    return {
      portal: 'partner' as const,
      isPreview: false,
      storeSlug: null,
      partnerSlug: null,
    };
  }

  // 2. Check Super Admin Route (/admin, /super-admin, /superadmin, /owner, portal=super-admin, #super-admin, #owner)
  const isSuperAdmin =
    ((pathname === '/admin' || pathname === '/admin/') && !slugParam && portalParam !== 'admin') ||
    pathname === '/super-admin' ||
    pathname === '/super-admin/' ||
    pathname === '/superadmin' ||
    pathname === '/superadmin/' ||
    pathname === '/owner' ||
    pathname === '/owner/' ||
    portalParam === 'super-admin' ||
    portalParam === 'superadmin' ||
    portalParam === 'owner' ||
    rawHash === 'super-admin' ||
    rawHash === 'superadmin' ||
    rawHash === 'owner';
  if (isSuperAdmin) {
    return {
      portal: 'super-admin' as const,
      isPreview: false,
      storeSlug: null,
      partnerSlug: null,
    };
  }

  // 3. Check Merchant Join Route (/join, /join?ref=..., /?ref=..., portal=join, #join)
  const isRefParam = urlParams.has('ref') || urlParams.has('r');
  const isJoin =
    pathname === '/join' ||
    pathname === '/join/' ||
    portalParam === 'join' ||
    rawHash === 'join' ||
    (pathname === '/' && isRefParam && !slugParam);
  if (isJoin) {
    return {
      portal: 'join' as const,
      isPreview: false,
      storeSlug: null,
      partnerSlug: null,
    };
  }

  // 4. Check Merchant Onboarding Route (/merchant/onboarding, /onboarding, portal=onboarding, #onboarding)
  const isOnboarding =
    pathname === '/merchant/onboarding' ||
    pathname === '/merchant/onboarding/' ||
    pathname === '/onboarding' ||
    pathname === '/onboarding/' ||
    portalParam === 'onboarding' ||
    rawHash === 'onboarding';
  if (isOnboarding) {
    return {
      portal: 'onboarding' as const,
      isPreview: previewParam,
      storeSlug: slugParam,
      partnerSlug: null,
    };
  }

  // 5. Check Merchant Admin Route (/store, /store-admin, /merchant, portal=store, portal=merchant, portal=admin with store)
  const isMerchantAdminPath =
    pathname === '/store' ||
    pathname === '/store/' ||
    pathname === '/store-admin' ||
    pathname === '/store-admin/' ||
    pathname === '/merchant' ||
    pathname === '/merchant/' ||
    (pathname === '/admin' && (Boolean(slugParam) || portalParam === 'admin')) ||
    portalParam === 'store' ||
    portalParam === 'merchant' ||
    portalParam === 'admin' ||
    rawHash === 'store' ||
    rawHash === 'merchant' ||
    rawHash.endsWith('-admin');
  if (isMerchantAdminPath) {
    return {
      portal: 'admin' as const,
      isPreview: previewParam,
      storeSlug: slugParam || (rawHash.endsWith('-admin') ? rawHash.replace(/-admin$/, '') : null),
      partnerSlug: null,
    };
  }

  // 6. Check Cashier POS Route (/cashier, /pos, portal=cashier, portal=pos, #cashier, #pos)
  const isCashierPath =
    pathname === '/cashier' ||
    pathname === '/cashier/' ||
    pathname === '/pos' ||
    pathname === '/pos/' ||
    portalParam === 'cashier' ||
    urlParams.get('portal') === 'pos' ||
    rawHash === 'cashier' ||
    rawHash === 'pos' ||
    rawHash.endsWith('-pos');
  if (isCashierPath) {
    return {
      portal: 'cashier' as const,
      isPreview: previewParam,
      storeSlug: slugParam || (rawHash.endsWith('-pos') ? rawHash.replace(/-pos$/, '') : null),
      partnerSlug: null,
    };
  }

  // 7. Check Direct Store Path or Hash (e.g. /demo-cafe, #/demo-cafe)
  const pathSegments = pathname.split('/').filter(Boolean);
  const potentialSlug = pathSegments.length === 1 ? pathSegments[0] : null;
  const isDemoPath = potentialSlug && (potentialSlug === DEMO_STORE_SLUG || isDemoStoreSlug(potentialSlug));
  const isDemoHash = rawHash && (rawHash === DEMO_STORE_SLUG || isDemoStoreSlug(rawHash));

  if ((isDemoPath || isDemoHash) && !slugParam) {
    const effectiveSlug = isDemoPath ? potentialSlug! : rawHash;
    return {
      portal: (portalParam as PortalTab) || 'customer',
      isPreview: previewParam,
      storeSlug: effectiveSlug,
      partnerSlug: null,
    };
  }

  // 8. Check Public Partner Landing Page (/<partner-slug>)
  const RESERVED_SLUGS = new Set([
    '',
    'join',
    'admin',
    'login',
    'logout',
    'api',
    'assets',
    'partner',
    'merchant',
    'cashier',
    'dashboard',
    'app',
    'super-admin',
    'superadmin',
    'pos',
    'track',
    'onboarding',
    'owner',
    'store',
    'store-admin',
    'demo-cafe',
  ]);

  if (potentialSlug && !RESERVED_SLUGS.has(potentialSlug) && !slugParam) {
    return {
      portal: 'partner-landing' as const,
      isPreview: false,
      storeSlug: null,
      partnerSlug: potentialSlug,
    };
  }

  // 9. If URL contains store slug explicitly (?store=xyz)
  if (slugParam) {
    let defaultStorePortal: PortalTab = 'customer';
    try {
      if (localStorage.getItem(`radar_session_${slugParam}_admin`)) {
        defaultStorePortal = 'admin';
      } else if (localStorage.getItem(`radar_session_${slugParam}_cashier`)) {
        defaultStorePortal = 'cashier';
      }
    } catch {}

    const targetPortal = (portalParam as PortalTab) || defaultStorePortal;
    return {
      portal: targetPortal,
      isPreview: previewParam,
      storeSlug: slugParam,
      partnerSlug: null,
    };
  }

  // 9. Session-Aware Fallback on Root "/"
  let resolvedRolePortal: PortalTab = 'join';
  let hasSession = false;
  try {
    const rawAuth = localStorage.getItem('radar_unified_auth_user');
    if (rawAuth) {
      const parsed = JSON.parse(rawAuth);
      if (parsed.role === 'partner') { resolvedRolePortal = 'partner'; hasSession = true; }
      else if (parsed.role === 'super_admin') { resolvedRolePortal = 'super-admin'; hasSession = true; }
      else if (parsed.role === 'merchant') { resolvedRolePortal = 'admin'; hasSession = true; }
      else if (parsed.role === 'cashier') { resolvedRolePortal = 'cashier'; hasSession = true; }
      else if (parsed.role === 'customer') { resolvedRolePortal = 'customer'; hasSession = true; }
    } else if (localStorage.getItem('radar_partner_session')) {
      resolvedRolePortal = 'partner';
      hasSession = true;
    } else if (
      localStorage.getItem('RADAR_SUPER_ADMIN_AUTH') === 'true' ||
      sessionStorage.getItem('RADAR_SUPER_ADMIN_AUTH') === 'true'
    ) {
      resolvedRolePortal = 'super-admin';
      hasSession = true;
    }
  } catch {}

  const savedSlug = localStorage.getItem('radar_last_store_slug');
  const storeSlug = slugParam || savedSlug || null;

  if (!portalParam && !hasSession && slugParam) {
    resolvedRolePortal = 'customer';
  }

  return {
    portal: (portalParam as PortalTab) || resolvedRolePortal,
    isPreview: previewParam,
    storeSlug,
    partnerSlug: null as string | null,
  };
}

export function App() {
  const initialConfig = parseRouteParams();
  const [store, setStore] = useState<Store | null>(() => {
    if (
      initialConfig.portal === 'super-admin' ||
      initialConfig.portal === 'partner' ||
      initialConfig.portal === 'join' ||
      initialConfig.portal === 'partner-landing'
    ) {
      return null;
    }
    return getInitialStoreSync(initialConfig.storeSlug);
  });
  const [partnerSlug, setPartnerSlug] = useState<string | null>(initialConfig.partnerSlug || null);
  const [activeTab, setActiveTab] = useState<PortalTab>(initialConfig.portal);
  const [loading, setLoading] = useState(true);

  const [isSuperAdminPreview, setIsSuperAdminPreview] = useState(initialConfig.isPreview);
  const [incomingToast, setIncomingToast] = useState<{
    id: string;
    title: string;
    message: string;
    soundType?: string;
  } | null>(null);

  const { role, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    loadInitialStore();
    registerRadarServiceWorker().catch(() => {});

    const handleRouteChange = () => {
      loadInitialStore();
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);

    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'super-admin' || activeTab === 'join' || activeTab === 'partner' || activeTab === 'partner-landing') {
      document.documentElement.style.setProperty('--brand-primary', '#0B0F17');
      document.documentElement.style.setProperty('--brand-secondary', '#F59E0B');
      updateDynamicPWA(null, activeTab as any);
    } else if (store) {
      const p = store.primary_color || '#0F172A';
      const s = store.secondary_color || '#F59E0B';
      document.documentElement.style.setProperty('--brand-primary', p);
      document.documentElement.style.setProperty('--brand-secondary', s);
      updateDynamicPWA(store, activeTab);
    }
  }, [store, activeTab]);

  const debouncedSyncAppStore = useMemo(
    () =>
      debounce((currentStoreId?: string, currentSlug?: string) => {
        LoyaltyService.getAllStores().then((all) => {
          const updated = all.find((s) => s.id === currentStoreId || s.slug === currentSlug);
          if (updated) {
            setStore(updated);
            updateDynamicPWA(updated, activeTab);
          } else if (all.length === 0) {
            setStore(null);
            updateDynamicPWA(null, 'super-admin');
          }
        });
      }, 300),
    [activeTab]
  );

  useEffect(() => {
    const unsubscribe = LoyaltyEvents.listen((event) => {
      if (event.type === 'STORE_UPDATED') {
        debouncedSyncAppStore(store?.id, store?.slug);
      }

      if (event.type === 'CUSTOM_NOTIFICATION') {
        const isTargetStore =
          event.targetType === 'all_stores' ||
          event.targetType === 'broadcast' ||
          (event.targetType === 'store' &&
            (!event.targetId ||
              (store && (event.targetId === store.id || event.targetId === store.slug || event.storeId === store.id || event.storeId === store.slug)) ||
              activeTab === 'admin' ||
              activeTab === 'cashier')) ||
          (store && (event.targetId === store.id || event.targetId === store.slug || event.storeId === store.id || event.storeId === store.slug));

        const isTargetPartner =
          event.targetType === 'all_partners' ||
          event.targetType === 'broadcast' ||
          (event.targetType === 'partner' &&
            (!event.targetId || (partnerSlug && event.targetId === partnerSlug) || activeTab === 'partner')) ||
          (partnerSlug && event.targetId === partnerSlug) ||
          activeTab === 'partner';

        const isTargetCurrent = isTargetStore || isTargetPartner || activeTab === 'super-admin';

        if (isTargetCurrent && event.title && event.message) {
          playBeepSound(event.soundType || 'notification');

          saveInboxNotification({
            title: event.title,
            body: event.message,
            soundType: event.soundType || 'notification',
            targetType: (event.targetType as any) || 'broadcast',
            targetId: event.targetId || undefined,
            portal:
              activeTab === 'super-admin'
                ? 'super_admin'
                : activeTab === 'partner'
                ? 'partner'
                : activeTab === 'admin'
                ? 'store'
                : activeTab === 'cashier'
                ? 'cashier'
                : 'customer',
          });

          setIncomingToast({
            id: 'toast-' + Date.now(),
            title: event.title,
            message: event.message,
            soundType: event.soundType,
          });

          sendPortalNotification({
            title: event.title,
            body: event.message,
            soundType: event.soundType || 'notification',
            tag: `radar-notif-${Date.now()}`,
          }).catch(() => {});
        }
      }

      if (event.type === 'POINTS_ADDED' && event.points) {
        saveInboxNotification({
          title: 'نقاط ولاء جديدة 🌟',
          body: `تمت إضافة +${event.points} نقطة بنجاح! رصيدك الجديد: ${event.newBalance ?? 0} نقطة.`,
          soundType: 'success',
          targetType: 'customer',
          portal: 'customer',
        });
      }

      if (event.type === 'REWARD_REDEEMED' && event.rewardTitle) {
        saveInboxNotification({
          title: 'استبدال مكافأة بنجاح 🎁',
          body: `تم استبدال: "${event.rewardTitle}" بنجاح!`,
          soundType: 'redeem',
          targetType: 'customer',
          portal: 'customer',
        });
      }

      if (event.type === 'PAYMENT_COMPLETED') {
        saveInboxNotification({
          title: 'عملية دفع جديدة 💳',
          body: 'تم استلام دفعة مالية جديدة وتحديث اشتراك المتجر.',
          soundType: 'success',
          targetType: 'store',
          portal: 'store',
        });
      }
    });

    return () => {
      unsubscribe();
      debouncedSyncAppStore.cancel();
    };
  }, [store?.id, store?.slug, partnerSlug, activeTab, debouncedSyncAppStore]);

  useEffect(() => {
    if (!incomingToast) return;
    const timer = setTimeout(() => {
      setIncomingToast(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [incomingToast]);

  const loadInitialStore = async () => {
    try {
      const config = parseRouteParams();
      setIsSuperAdminPreview(config.isPreview);

      // 1. If portal is partner -> Strictly Render Partner Dashboard
      if (config.portal === 'partner') {
        setActiveTab('partner');
        setStore(null);
        updateDynamicPWA(null, 'partner');
        setLoading(false);
        return;
      }

      // 2. If portal is super-admin -> Strictly Render Super Admin Dashboard
      if (config.portal === 'super-admin') {
        setActiveTab('super-admin');
        setStore(null);
        updateDynamicPWA(null, 'super-admin');
        setLoading(false);
        return;
      }

      // 3. If portal is join -> Render Merchant Join Flow
      if (config.portal === 'join') {
        setActiveTab('join');
        setStore(null);
        updateDynamicPWA(null, 'join');
        setLoading(false);
        return;
      }

      // 4. Direct Affiliate Slug Resolution -> Straight to Final Landing Page
      if (config.portal === 'partner-landing' && config.partnerSlug) {
        const cleanSlug = config.partnerSlug.trim().toLowerCase();
        try {
          const allPartners = await LoyaltyService.getAllPartners();
          const found = allPartners.find(
            (p: any) =>
              (p.slug || '').toLowerCase() === cleanSlug ||
              (p.affiliates?.referral_code || '').toLowerCase() === cleanSlug ||
              (p.referral_code || '').toLowerCase() === cleanSlug
          );

          const refCode = found?.affiliates?.referral_code || found?.referral_code || cleanSlug;
          sessionStorage.setItem('radar_captured_ref', refCode);

          fetch(`/api/track?ref=${encodeURIComponent(refCode)}`, {
            method: 'GET',
            credentials: 'include',
          }).catch(() => {});
        } catch (e) {
          sessionStorage.setItem('radar_captured_ref', cleanSlug);
        }

        setPartnerSlug(cleanSlug);
        setActiveTab('partner-landing');
        setStore(null);
        updateDynamicPWA(null, 'partner-landing');
        setLoading(false);
        return;
      }

      // 5. Merchant Onboarding Route
      if (config.portal === 'onboarding') {
        let targetStore: Store | null = null;
        if (config.storeSlug) {
          targetStore = await LoyaltyService.resolveStore(config.storeSlug);
        }
        if (!targetStore) {
          targetStore = await LoyaltyService.getStore();
        }
        if (!targetStore) {
          const allStores = await LoyaltyService.getAllStores();
          if (allStores && allStores.length > 0) targetStore = allStores[0];
        }
        setStore(targetStore);
        setActiveTab('onboarding');
        updateDynamicPWA(targetStore, 'onboarding');
        setLoading(false);
        return;
      }

      // 6. Store-based Portals (admin, cashier, customer)
      if (config.storeSlug) {
        const found = await LoyaltyService.resolveStore(config.storeSlug);
        if (found) {
          setStore(found);
          const targetPortal =
            config.portal && ['cashier', 'customer', 'admin'].includes(config.portal)
              ? config.portal
              : 'customer';
          setActiveTab(targetPortal);
          updateDynamicPWA(found, targetPortal);
          localStorage.setItem('radar_last_store_slug', found.slug || found.id);
          localStorage.setItem('radar_last_portal', targetPortal);
          setLoading(false);
          return;
        }
      }

      // 7. Resolving default store if portal is cashier, admin, or customer without slug
      if (config.portal && ['cashier', 'customer', 'admin'].includes(config.portal)) {
        const defaultStore = await LoyaltyService.getStore();
        if (defaultStore) {
          setStore(defaultStore);
          setActiveTab(config.portal);
          updateDynamicPWA(defaultStore, config.portal);
          localStorage.setItem('radar_last_store_slug', defaultStore.slug || defaultStore.id);
          localStorage.setItem('radar_last_portal', config.portal);
          setLoading(false);
          return;
        }
      }

      // 8. Explicit fallback
      const fallbackPortal = config.portal || 'join';
      setActiveTab(fallbackPortal);
      setStore(null);
      updateDynamicPWA(null, fallbackPortal);
    } catch (e) {
      console.error('loadInitialStore failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStoreFromSuperAdmin = (
    selectedStore: Store,
    targetTab: 'cashier' | 'customer' | 'admin' = 'admin'
  ) => {
    setStore(selectedStore);
    setActiveTab(targetTab);
    setIsSuperAdminPreview(true);
    updateDynamicPWA(selectedStore, targetTab);
    const url = new URL(window.location.href);
    url.searchParams.set('store', selectedStore.slug);
    url.searchParams.set('portal', targetTab);
    url.searchParams.set('preview', 'true');
    window.history.pushState({}, '', url.toString());
  };

  const handleReturnToSuperAdmin = () => {
    setIsSuperAdminPreview(false);
    setActiveTab('super-admin');
    updateDynamicPWA(null, 'super-admin');
    const url = new URL(window.location.href);
    url.searchParams.delete('store');
    url.searchParams.delete('preview');
    url.searchParams.set('portal', 'super-admin');
    window.history.pushState({}, '', url.toString());
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-[#080B11] flex flex-col items-center justify-center text-slate-100 selection:bg-amber-500 selection:text-black">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 text-3xl shadow-xl shadow-amber-500/20 font-black animate-pulse">
            ⚡
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-black tracking-wide text-white">رادار | RADAR</h1>
            <p className="text-xs text-slate-400 font-medium">نظام الولاء السحابي الذكي</p>
          </div>
          <div className="flex items-center gap-2 text-slate-400 font-mono text-xs mt-2 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-800 shadow-lg">
            <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <span>جاري التحقق من الصلاحيات وتهيئة البوابة...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080B11] text-slate-100 flex flex-col selection:bg-amber-500 selection:text-black">
      {/* 👁️ Super Admin Preview Banner (Visible ONLY to platform owner during preview) */}
      {isSuperAdminPreview && activeTab !== 'super-admin' && store && (
        <div className="sticky top-0 z-50 bg-amber-500/20 backdrop-blur-md border-b border-amber-500/40 px-4 py-2.5 text-xs flex items-center justify-between text-amber-300 shadow-xl">
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <span className="flex items-center gap-1.5 font-bold">
              <span>👑 وضع معاينة المالك:</span>
              <strong className="text-white text-sm">{store.name}</strong>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-900/80 border border-amber-500/30 text-amber-400">
                {activeTab === 'customer'
                  ? '📱 بوابة الزبون (PWA)'
                  : activeTab === 'cashier'
                  ? '⚡ بوابة الكاشير (POS)'
                  : '💼 لوحة التاجر (Admin)'}
              </span>
            </span>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <button
              onClick={handleReturnToSuperAdmin}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center space-x-1 rtl:space-x-reverse transition shadow-md"
            >
              <span>⬅️ العودة لبوابة المالك (Super Admin)</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Portals Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <React.Suspense
          fallback={
            <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-mono text-slate-400">جاري تحميل البوابة...</span>
            </div>
          }
        >
          {activeTab === 'join' && <MerchantJoinLanding />}

          {activeTab === 'partner-landing' && partnerSlug && (
            <PartnerPublicLanding slug={partnerSlug} />
          )}

          {activeTab === 'partner' && (
            <ProtectedRoute
              allowedRoles={['partner', 'super_admin']}
              portalName="بوابة شركاء المبيعات (Partner Portal)"
            >
              <PartnerDashboard
                onBackToApp={() => {
                  const url = new URL(window.location.origin + '/partner');
                  url.searchParams.set('portal', 'partner');
                  window.location.href = url.toString();
                }}
              />
            </ProtectedRoute>
          )}

          {activeTab === 'super-admin' && (
            <ProtectedRoute
              allowedRoles={['super_admin']}
              portalName="لوحة تحكم مالك المنصة (Super Admin)"
            >
              <SuperAdminDashboard onSelectStore={handleSelectStoreFromSuperAdmin} />
            </ProtectedRoute>
          )}

          {activeTab === 'onboarding' && (
            <ProtectedRoute
              allowedRoles={['merchant', 'super_admin']}
              portalName="معالج إعداد المتجر"
            >
              <MerchantOnboardingConsole
                store={store || INITIAL_STORE}
                onComplete={() => {
                  setActiveTab('admin');
                  const url = new URL(window.location.href);
                  url.searchParams.set('portal', 'admin');
                  window.history.pushState({}, '', url.toString());
                }}
                onExit={() => {
                  setActiveTab('admin');
                  const url = new URL(window.location.href);
                  url.searchParams.set('portal', 'admin');
                  window.history.pushState({}, '', url.toString());
                }}
              />
            </ProtectedRoute>
          )}

          {activeTab === 'cashier' && store && (
            <ProtectedRoute
              allowedRoles={['cashier', 'merchant', 'super_admin']}
              portalName="نظام الكاشير (Cashier POS)"
            >
              <CashierPOS store={store} />
            </ProtectedRoute>
          )}

          {activeTab === 'admin' && store && (
            <ProtectedRoute
              allowedRoles={['merchant', 'super_admin']}
              portalName="لوحة إدارة المتجر (Merchant Admin)"
            >
              <StoreAdmin store={store} />
            </ProtectedRoute>
          )}

          {activeTab === 'customer' && store && (
            <CustomerWallet store={store} />
          )}

          {activeTab !== 'super-admin' &&
            activeTab !== 'join' &&
            activeTab !== 'partner' &&
            activeTab !== 'partner-landing' &&
            activeTab !== 'onboarding' &&
            (!store || !store.id) && (
              <div className="min-h-[60vh] flex items-center justify-center p-4">
                <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900/95 border border-slate-800 text-center space-y-5 shadow-2xl">
                  <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto text-2xl font-bold">
                    🏪
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-black text-white">المتجر غير متوفر حالياً</h2>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      الرابط المطلوب غير موجود أو لم يتم تفعيل المتجر بعد. يرجى التحقق من الرابط أو العودة لصفحة البداية.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('join');
                      const url = new URL(window.location.origin);
                      window.history.pushState({}, '', url.toString());
                    }}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-sm transition shadow-lg shadow-cyan-500/20"
                  >
                    العودة لصفحة المنصة الرئيسية 🏠
                  </button>
                </div>
              </div>
            )}
        </React.Suspense>

        {/* 🔔 Live Real-Time Incoming Notification Toast Popup */}
        {incomingToast && (
          <div className="fixed top-4 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-[9999] animate-bounce-subtle">
            <div className="bg-slate-900/95 border-2 border-amber-500/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl flex items-start justify-between gap-3 text-right">
              <div className="flex items-start space-x-3 rtl:space-x-reverse">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 shadow-inner">
                  {incomingToast.soundType === 'commission' ? (
                    <Coins className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Bell className="w-5 h-5 animate-pulse text-amber-400" />
                  )}
                </div>
                <div className="space-y-1 pr-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black border border-amber-500/30">
                      إشعار فوري جديد 🔔
                    </span>
                    <h4 className="text-xs font-black text-white">{incomingToast.title}</h4>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">{incomingToast.message}</p>
                </div>
              </div>
              <button
                onClick={() => setIncomingToast(null)}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Global Lock-Screen Push & Notification Permission Banner */}
        <NotificationPermissionBanner
          portalName={
            activeTab === 'partner'
              ? 'بوابة الشريك والمسوق'
              : activeTab === 'cashier'
              ? 'بوابة الكاشير'
              : activeTab === 'admin'
              ? 'لوحة إدارة المتجر'
              : activeTab === 'super-admin'
              ? 'لوحة المالك (Super Admin)'
              : store?.name || 'محفظة الولاء'
          }
          role={role || activeTab}
        />
      </main>

      {/* SaaS Multi-Tenant Footer (Visible ONLY in Super Admin / Preview mode) */}
      {(activeTab === 'super-admin' || isSuperAdminPreview) && (
        <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>© 2026 Radar Loyalty Engine (White-Label Multi-Tenant SaaS Platform).</p>
            {isSuperAdminPreview && store ? (
              <div className="flex items-center space-x-3 rtl:space-x-reverse text-slate-400 font-mono text-[11px]">
                <span>المتجر النشط: <strong className="text-white">{store.name}</strong></span>
                <span>•</span>
                <span className="text-amber-400">Slug: /{store.slug}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-3 rtl:space-x-reverse text-slate-400 font-mono text-[11px]">
                <span>لوحة التحكم المركزية لمالك المنصة (Super Admin) 👑</span>
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;

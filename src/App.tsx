import React, { useState, useEffect } from 'react';
import { Store } from './types';
import { LoyaltyService } from './lib/supabase';
import { LoyaltyEvents } from './lib/events';
import { INITIAL_STORE } from './lib/demoData';
import { updateDynamicPWA } from './lib/pwa';
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

function parseRouteParams() {
  if (typeof window === 'undefined') {
    return {
      portal: 'super-admin' as 'super-admin' | 'cashier' | 'customer' | 'admin' | 'join' | 'partner' | 'partner-landing' | 'onboarding',
      isPreview: false,
      storeSlug: null as string | null,
      partnerSlug: null as string | null,
    };
  }
  const urlParams = new URLSearchParams(window.location.search);
  let portalParam = urlParams.get('portal') as 'super-admin' | 'cashier' | 'customer' | 'admin' | 'join' | 'partner' | 'partner-landing' | 'onboarding' | null;
  let slugParam = urlParams.get('store');
  const previewParam = urlParams.get('preview') === 'true';

  // 👑 Stage 1: Super Admin / Platform Owner Route (/super-admin, /superadmin, /owner, portal=super-admin, #super-admin)
  const pathname = (window.location.pathname || '').toLowerCase();
  const rawHash = window.location.hash ? window.location.hash.replace(/^#\/?/, '').trim() : '';

  const isSuperAdmin =
    pathname === '/super-admin' ||
    pathname === '/super-admin/' ||
    pathname === '/superadmin' ||
    pathname === '/superadmin/' ||
    pathname === '/owner' ||
    pathname === '/owner/' ||
    portalParam === 'super-admin' ||
    rawHash === 'super-admin' ||
    rawHash === 'superadmin';
  if (isSuperAdmin) {
    return {
      portal: 'super-admin' as const,
      isPreview: false,
      storeSlug: null,
      partnerSlug: null,
    };
  }

  // 🚪 Stage 4: Merchant Join Route (/join or /join?ref=RADAR-XXXX or portal=join)
  const isJoin = pathname === '/join' || pathname === '/join/' || portalParam === 'join' || rawHash === 'join';
  if (isJoin) {
    return {
      portal: 'join' as const,
      isPreview: false,
      storeSlug: null,
      partnerSlug: null,
    };
  }

  // 🤝 Stage 6: Partner Portal Route (/partner or portal=partner or #partner)
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

  // 🏪 Stage 8: Merchant Onboarding Route (/merchant/onboarding or /onboarding or portal=onboarding or #onboarding)
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

  // 🤝 Stage 6: Public Partner Landing Page (/<partner-slug>)
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
  ]);

  const pathSegments = pathname.split('/').filter(Boolean);
  const potentialPartnerSlug = pathSegments.length === 1 ? pathSegments[0] : null;

  if (potentialPartnerSlug && !RESERVED_SLUGS.has(potentialPartnerSlug) && !slugParam) {
    return {
      portal: 'partner-landing' as const,
      isPreview: false,
      storeSlug: null,
      partnerSlug: potentialPartnerSlug,
    };
  }
  if (rawHash) {
    if (rawHash === 'super-admin' || rawHash === 'superadmin') {
      portalParam = 'super-admin';
    } else if (rawHash.endsWith('-pos') || rawHash.endsWith('/pos')) {
      portalParam = 'cashier';
      slugParam = slugParam || rawHash.replace(/-pos$/, '').replace(/\/pos$/, '');
    } else if (rawHash.endsWith('-admin') || rawHash.endsWith('/admin')) {
      portalParam = 'admin';
      slugParam = slugParam || rawHash.replace(/-admin$/, '').replace(/\/admin$/, '');
    } else if (rawHash === 'cashier' || rawHash === 'pos') {
      portalParam = 'cashier';
    } else if (rawHash === 'admin') {
      portalParam = 'admin';
    } else if (rawHash !== '') {
      // Direct store slug e.g. #demo-hub
      slugParam = slugParam || rawHash;
      if (!portalParam) portalParam = 'customer';
    }
  }

  // 🏢 Stage 12B: Merchant Admin Route (/admin or /admin/ or /merchant or /merchant/)
  const isAdminPath =
    pathname === '/admin' ||
    pathname === '/admin/' ||
    pathname === '/merchant' ||
    pathname === '/merchant/';
  if (isAdminPath) {
    portalParam = 'admin';
  }

  // ⚡ Stage 12B: Cashier POS Route (/cashier or /cashier/ or /pos or /pos/)
  const isCashierPath =
    pathname === '/cashier' ||
    pathname === '/cashier/' ||
    pathname === '/pos' ||
    pathname === '/pos/' ||
    urlParams.get('portal') === 'pos';
  if (isCashierPath) {
    portalParam = 'cashier';
  }

  const hostname = window.location.hostname.toLowerCase();
  const isPlatformHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.vercel.app') ||
    hostname.endsWith('.pages.dev') ||
    hostname.endsWith('.workers.dev') ||
    hostname.endsWith('.web.app');

  let portal: 'super-admin' | 'cashier' | 'customer' | 'admin' | 'join' | 'partner' | 'partner-landing' | 'onboarding' = 'super-admin';
  let storeSlug = slugParam;

  // 🌐 Custom Merchant Domain Support (e.g. loyalty.store.com)
  if (!storeSlug && !isPlatformHost && hostname) {
    storeSlug = hostname;
    if (!portalParam) portalParam = 'customer';
  }

  // 🔄 LocalStorage context recovery (Both standard browser and PWA standalone)
  // Security Invariant: LocalStorage only resolves preferred store/portal context.
  // It NEVER grants authorization — StaffLoginGate and server auth strictly protect all portals.
  const savedSlug = localStorage.getItem('radar_last_store_slug');
  const savedPortal = localStorage.getItem('radar_last_portal') as any;
  if (!storeSlug && savedSlug) {
    storeSlug = savedSlug;
  }

  if (portalParam && ['cashier', 'customer', 'admin', 'super-admin', 'join', 'partner', 'partner-landing', 'onboarding'].includes(portalParam)) {
    portal = portalParam;
  } else if (storeSlug && savedPortal && ['cashier', 'customer', 'admin', 'onboarding'].includes(savedPortal)) {
    portal = savedPortal;
  } else if (storeSlug) {
    portal = 'customer';
  } else if (savedPortal && ['cashier', 'customer', 'admin', 'onboarding'].includes(savedPortal)) {
    portal = savedPortal;
  }

  return {
    portal,
    isPreview: previewParam,
    storeSlug,
    partnerSlug: null as string | null,
  };
}

export function App() {
  const initialConfig = parseRouteParams();
  const [store, setStore] = useState<Store | null>(null);
  const [partnerSlug, setPartnerSlug] = useState<string | null>(initialConfig.partnerSlug || null);
  const [activeTab, setActiveTab] = useState<'super-admin' | 'cashier' | 'customer' | 'admin' | 'join' | 'partner' | 'partner-landing' | 'onboarding'>(
    initialConfig.portal
  );
  const [loading, setLoading] = useState(true);

  const [isSuperAdminPreview, setIsSuperAdminPreview] = useState(initialConfig.isPreview);

  useEffect(() => {
    loadInitialStore();

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

  useEffect(() => {
    const unsubscribe = LoyaltyEvents.listen((event) => {
      if (event.type === 'STORE_UPDATED') {
        LoyaltyService.getAllStores().then((all) => {
          const updated = all.find((s) => s.id === store?.id || s.slug === store?.slug);
          if (updated) {
            setStore(updated);
            updateDynamicPWA(updated, activeTab);
          } else if (all.length === 0) {
            setStore(null);
            updateDynamicPWA(null, 'super-admin');
          }
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [store?.id, store?.slug, activeTab]);

  const loadInitialStore = async () => {
    try {
      const config = parseRouteParams();
      setIsSuperAdminPreview(config.isPreview);

      // 🚪 Stage 4: If portal is join -> Render Merchant Join Flow
      if (config.portal === 'join') {
        setActiveTab('join');
        setStore(null);
        setLoading(false);
        return;
      }

      // 🤝 Stage 6: If portal is partner -> Render Partner Dashboard
      if (config.portal === 'partner') {
        setActiveTab('partner');
        setStore(null);
        setLoading(false);
        return;
      }

      // 🤝 Stage 6: If portal is partner-landing -> Render Public Partner Landing
      if (config.portal === 'partner-landing' && config.partnerSlug) {
        setActiveTab('partner-landing');
        setPartnerSlug(config.partnerSlug);
        setStore(null);
        setLoading(false);
        return;
      }

      // 🏪 Stage 8: If portal is onboarding -> Render Merchant Onboarding Console
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
        setLoading(false);
        return;
      }

      // 1. If portal is explicitly super-admin and no store slug -> Pure Super Admin (لوحة المالك)
      if (config.portal === 'super-admin' && !config.storeSlug) {
        setActiveTab('super-admin');
        setStore(null);
        updateDynamicPWA(null, 'super-admin');
        return;
      }

      // 2. If store slug is provided -> Load specific store (e.g., demo-hub)
      if (config.storeSlug) {
        const found = await LoyaltyService.resolveStore(config.storeSlug);
        if (found) {
          setStore(found);
          const targetPortal =
            config.portal && ['cashier', 'customer', 'admin', 'super-admin'].includes(config.portal)
              ? config.portal
              : 'customer';
          setActiveTab(targetPortal);
          updateDynamicPWA(found, targetPortal);
          localStorage.setItem('radar_last_store_slug', found.slug || found.id);
          localStorage.setItem('radar_last_portal', targetPortal);
          return;
        }
      }

      // 3. If portal is cashier, admin, or customer without slug, resolve active/default store
      if (config.portal && ['cashier', 'customer', 'admin'].includes(config.portal)) {
        const defaultStore = await LoyaltyService.getStore();
        if (defaultStore) {
          setStore(defaultStore);
          setActiveTab(config.portal);
          updateDynamicPWA(defaultStore, config.portal);
          localStorage.setItem('radar_last_store_slug', defaultStore.slug || defaultStore.id);
          localStorage.setItem('radar_last_portal', config.portal);
          return;
        }
      }

      // 4. Fallback
      if (config.portal && ['cashier', 'customer', 'admin', 'super-admin'].includes(config.portal)) {
        setActiveTab(config.portal);
      } else {
        setActiveTab('super-admin');
      }

      setStore(null);
      updateDynamicPWA(null, 'super-admin');
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

  if (loading) {
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
            <span>جاري تهيئة البوابة...</span>
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

          {activeTab === 'partner' && (
            <PartnerDashboard onBackToApp={() => setActiveTab('super-admin')} />
          )}

          {activeTab === 'partner-landing' && partnerSlug && (
            <PartnerPublicLanding slug={partnerSlug} />
          )}

          {activeTab === 'super-admin' && (
            <SuperAdminDashboard onSelectStore={handleSelectStoreFromSuperAdmin} />
          )}

          {activeTab === 'onboarding' && (
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
          )}

          {activeTab !== 'super-admin' &&
            activeTab !== 'join' &&
            activeTab !== 'partner' &&
            activeTab !== 'partner-landing' &&
            activeTab !== 'onboarding' &&
            (!store || !store.id) ? (
            <div className="min-h-[60vh] flex items-center justify-center p-4">
              <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900/95 border border-slate-800 text-center space-y-5 shadow-2xl">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto text-2xl font-bold">
                  🏪
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-black text-white">لا يوجد متجر مسجل حالياً</h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    تم تفريغ كافة المتاجر بنجاح لتجربة نظيفة. يرجى التوجه إلى لوحة المالك وتأسيس أول متجر.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveTab('super-admin');
                    const url = new URL(window.location.href);
                    url.searchParams.delete('store');
                    url.searchParams.set('portal', 'super-admin');
                    window.history.pushState({}, '', url.toString());
                  }}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition"
                >
                  فتح بوابة المالك (Super Admin) 👑
                </button>
              </div>
            </div>
          ) : (
            store && (
              <>
                {activeTab === 'cashier' && <CashierPOS store={store} />}
                {activeTab === 'customer' && <CustomerWallet store={store} />}
                {activeTab === 'admin' && <StoreAdmin store={store} />}
              </>
            )
          )}
        </React.Suspense>
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

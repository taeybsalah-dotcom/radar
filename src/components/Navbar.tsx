import React, { useState, useEffect } from 'react';
import { Store } from '../types';
import {
  Crown,
  Sparkles,
  Smartphone,
  Store as StoreIcon,
  Database,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { getSupabaseCredentials, LoyaltyService } from '../lib/supabase';
import { LoyaltyEvents } from '../lib/events';

interface NavbarProps {
  store: Store;
  activeTab: 'super-admin' | 'cashier' | 'customer' | 'admin';
  setActiveTab: (tab: 'super-admin' | 'cashier' | 'customer' | 'admin') => void;
  onOpenConfig: () => void;
  onStoreChange: (store: Store) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  store,
  activeTab,
  setActiveTab,
  onOpenConfig,
  onStoreChange,
}) => {
  const { isConfigured } = getSupabaseCredentials();
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [isStoreMenuOpen, setIsStoreMenuOpen] = useState(false);

  useEffect(() => {
    loadStores();

    const unsubscribe = LoyaltyEvents.listen((event) => {
      if (event.type === 'STORE_UPDATED') {
        loadStores();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [store.id, store.primary_color, store.secondary_color, store.name]);

  const loadStores = async () => {
    try {
      const list = await LoyaltyService.getAllStores();
      setAllStores(list);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-[#0B0F17]/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & Store Switcher */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-extrabold text-xl sm:text-2xl shadow-lg border"
              style={{
                backgroundColor: activeTab === 'super-admin' ? '#F59E0B' : store.primary_color,
                borderColor: store.secondary_color,
                color: activeTab === 'super-admin' ? '#000000' : store.secondary_color,
              }}
            >
              {activeTab === 'super-admin' ? '👑' : store.name.slice(0, 2)}
            </div>

            <div className="relative">
              <button
                onClick={() => setIsStoreMenuOpen(!isStoreMenuOpen)}
                className="flex items-center space-x-1.5 rtl:space-x-reverse text-right hover:opacity-80 transition"
              >
                <div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                      {activeTab === 'super-admin' ? 'Radar SaaS Platform' : store.name}
                    </h1>
                    {activeTab !== 'super-admin' && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                        /app/{store.slug}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 hidden sm:flex items-center space-x-1 rtl:space-x-reverse">
                    <span>
                      {activeTab === 'super-admin'
                        ? 'لوحة المالك لتأسيس المتاجر'
                        : 'انقر لتبديل المتجر المستأجر'}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </p>
                </div>
              </button>

              {/* Store Switcher Dropdown */}
              {isStoreMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 animate-fade-in">
                  <p className="text-[10px] text-slate-400 px-3 py-1.5 font-bold">
                    المتاجر المسجلة بالنظام (White-Label):
                  </p>
                  <div className="space-y-1">
                    {allStores.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          onStoreChange(s);
                          setIsStoreMenuOpen(false);
                          if (activeTab === 'super-admin') setActiveTab('customer');
                        }}
                        className={`w-full text-right px-3 py-2 rounded-xl text-xs flex items-center justify-between transition ${
                          s.id === store.id && activeTab !== 'super-admin'
                            ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{s.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">/{s.slug}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Portals Switcher */}
          <nav className="flex items-center bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
            
            {/* Super Admin Tab */}
            <button
              onClick={() => setActiveTab('super-admin')}
              className={`flex items-center space-x-1.5 rtl:space-x-reverse px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'super-admin'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black font-extrabold shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" />
              <span>بوابة المالك</span>
            </button>

            {/* Customer Pass Tab */}
            <button
              onClick={() => setActiveTab('customer')}
              style={
                activeTab === 'customer'
                  ? {
                      backgroundColor: store.secondary_color || '#F59E0B',
                      color: '#000000',
                      boxShadow: `0 4px 14px -2px ${store.secondary_color || '#F59E0B'}40`,
                    }
                  : undefined
              }
              className={`flex items-center space-x-1.5 rtl:space-x-reverse px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'customer'
                  ? 'font-extrabold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>بوابة الزبون</span>
            </button>

            {/* Cashier POS Tab */}
            <button
              onClick={() => setActiveTab('cashier')}
              style={
                activeTab === 'cashier'
                  ? {
                      backgroundColor: store.secondary_color || '#F59E0B',
                      color: '#000000',
                      boxShadow: `0 4px 14px -2px ${store.secondary_color || '#F59E0B'}40`,
                    }
                  : undefined
              }
              className={`flex items-center space-x-1.5 rtl:space-x-reverse px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'cashier'
                  ? 'font-extrabold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>الكاشير (POS)</span>
            </button>

            {/* Store Admin Tab */}
            <button
              onClick={() => setActiveTab('admin')}
              style={
                activeTab === 'admin'
                  ? {
                      backgroundColor: store.secondary_color || '#F59E0B',
                      color: '#000000',
                      boxShadow: `0 4px 14px -2px ${store.secondary_color || '#F59E0B'}40`,
                    }
                  : undefined
              }
              className={`flex items-center space-x-1.5 rtl:space-x-reverse px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'admin'
                  ? 'font-extrabold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <StoreIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>لوحة التاجر</span>
            </button>

          </nav>

          {/* Database Connection Status Button */}
          <div className="hidden lg:flex items-center">
            <button
              onClick={onOpenConfig}
              className={`flex items-center space-x-2 rtl:space-x-reverse px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                isConfigured
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/40'
                  : 'bg-amber-950/40 text-amber-300 border-amber-500/30 hover:bg-amber-900/40'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              {isConfigured ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Supabase متصلة</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3 text-amber-400" />
                  <span>معاينة (اضغط للربط)</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};

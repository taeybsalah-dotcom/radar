import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Store as StoreIcon,
  Trash2,
  Users,
  ShieldCheck,
  Smartphone,
  Zap,
  ChevronUp,
  ChevronDown,
  X,
  ExternalLink,
  Check,
  Crown,
  Coins,
} from 'lucide-react';
import { Store } from '../types';
import { LoyaltyService } from '../lib/supabase';

interface RadarQuickSwitcherProps {
  currentStore: Store | null;
  activePortal: string;
  onNavigate: (portal: string, storeSlug?: string) => void;
}

export const RadarQuickSwitcher: React.FC<RadarQuickSwitcherProps> = ({
  currentStore,
  activePortal,
  onNavigate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreSlug, setSelectedStoreSlug] = useState<string>(currentStore?.slug || '');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    LoyaltyService.getAllStores().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setStores(list);
        if (!selectedStoreSlug && list[0]?.slug) {
          setSelectedStoreSlug(list[0].slug);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (currentStore?.slug) {
      setSelectedStoreSlug(currentStore.slug);
    }
  }, [currentStore?.slug]);

  const handleClearTestCache = () => {
    setIsResetting(true);
    try {
      // 1. Remove all lingering session tokens and sticky store slugs
      const keysToRemove = [
        'radar_unified_auth_user',
        'radar_partner_session',
        'radar_last_store_slug',
        'radar_last_portal',
        'radar_last_store_name',
        'radar_captured_ref',
        'radar_cashier_token',
        'RADAR_SUPER_ADMIN_AUTH',
        'RADAR_PARTNER_AUTH_TOKEN',
      ];

      keysToRemove.forEach((key) => localStorage.removeItem(key));
      sessionStorage.clear();

      // Clear any cashier pin storage keys
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('radar_session_') || key.startsWith('radar_local_customer_phone'))) {
          localStorage.removeItem(key);
        }
      }

      setResetSuccess(true);
      setTimeout(() => {
        // Full clean redirect to root
        window.location.href = window.location.origin + '/';
      }, 700);
    } catch (e) {
      console.error('Failed to clear cache:', e);
      setIsResetting(false);
    }
  };

  const getPortalBadge = (portal: string) => {
    switch (portal) {
      case 'join':
        return { label: 'صفحة الهبوط (Landing)', icon: '🏠', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
      case 'super-admin':
        return { label: 'لوحة المالك (Super Admin)', icon: '👑', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'partner':
        return { label: 'بوابة الشريك (Partner)', icon: '🤝', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' };
      case 'admin':
        return { label: 'لوحة التاجر (Merchant)', icon: '💼', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      case 'cashier':
        return { label: 'كاشير المحل (POS)', icon: '⚡', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
      case 'customer':
        return { label: 'محفظة الزبون (PWA)', icon: '📱', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
      case 'driver':
        return { label: 'بوابة كابتن التوصيل 🛵', icon: '🛵', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'kds':
        return { label: 'شاشة المطبخ (KDS)', icon: '👨‍🍳', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
      case 'onboarding':
        return { label: 'معالج التأسيس', icon: '🚀', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
      default:
        return { label: portal, icon: '🌐', color: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const currentBadge = getPortalBadge(activePortal);

  return (
    <div className="fixed bottom-4 left-4 z-[9999] font-sans antialiased text-right" dir="rtl">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 hover:border-amber-400 shadow-2xl backdrop-blur-xl text-white transition-all duration-200 transform hover:scale-105"
          title="شريط التحكم والتنقل السريع ومسح الكاش"
        >
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-black">
            ⚡
          </div>
          <div className="text-right">
            <div className="text-[11px] font-black leading-tight flex items-center gap-1.5">
              <span>تحكم رادار السريع</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
            <div className="text-[9px] text-slate-400 font-mono truncate max-w-[120px]">
              {currentStore ? currentStore.name : currentBadge.label}
            </div>
          </div>
          <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition" />
        </button>
      )}

      {/* Expanded Control Drawer */}
      {isOpen && (
        <div className="w-80 sm:w-96 rounded-3xl bg-[#0F172A]/95 border-2 border-amber-500/40 p-4 shadow-2xl backdrop-blur-2xl text-slate-100 space-y-4 animate-scale-up">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-black shadow-inner">
                ⚡
              </div>
              <div>
                <h3 className="text-xs font-black text-white">لوحة التنقل السريع والاختبار</h3>
                <p className="text-[10px] text-slate-400">بدّل بين البوابات ونظف بيانات التجربة بضغطة زر</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Current Status Pill */}
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-400 font-medium">البوابة النشطة الآن:</span>
            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border flex items-center gap-1.5 ${currentBadge.color}`}>
              <span>{currentBadge.icon}</span>
              <span>{currentBadge.label}</span>
            </span>
          </div>

          {/* Main Direct Navigation Hub */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 tracking-wider">التنقل المباشر:</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = window.location.origin + '/';
                }}
                className={`p-2 rounded-xl text-center border transition flex flex-col items-center gap-1 ${
                  activePortal === 'join'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <span className="text-base">🏠</span>
                <span className="text-[10px] font-bold">صفحة الهبوط</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = window.location.origin + '/super-admin';
                }}
                className={`p-2 rounded-xl text-center border transition flex flex-col items-center gap-1 ${
                  activePortal === 'super-admin'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <span className="text-base">👑</span>
                <span className="text-[10px] font-bold">لوحة المالك</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = window.location.origin + '/partner';
                }}
                className={`p-2 rounded-xl text-center border transition flex flex-col items-center gap-1 ${
                  activePortal === 'partner'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <span className="text-base">🤝</span>
                <span className="text-[10px] font-bold">بوابة الشركاء</span>
              </button>
            </div>
          </div>

          {/* Store Testing Controls */}
          <div className="space-y-2 pt-1 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">اختبار متجر محدد:</span>
              {stores.length > 0 && (
                <span className="text-[9px] text-slate-500">{stores.length} متاجر متوفرة</span>
              )}
            </div>

            <select
              value={selectedStoreSlug}
              onChange={(e) => setSelectedStoreSlug(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:border-amber-400"
            >
              <option value="">-- اختر متجراً لتجربته --</option>
              {stores.map((s) => (
                <option key={s.id || s.slug} value={s.slug}>
                  {s.name} ({s.slug})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-2">
              <button
                disabled={!selectedStoreSlug}
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = `${window.location.origin}/${selectedStoreSlug}`;
                }}
                className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/50 disabled:opacity-40 text-slate-300 hover:text-blue-300 text-center transition flex flex-col items-center gap-1"
              >
                <span className="text-base">📱</span>
                <span className="text-[10px] font-bold">محفظة الزبون</span>
              </button>

              <button
                disabled={!selectedStoreSlug}
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = `${window.location.origin}/${selectedStoreSlug}/pos`;
                }}
                className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-yellow-500/50 disabled:opacity-40 text-slate-300 hover:text-yellow-300 text-center transition flex flex-col items-center gap-1"
              >
                <span className="text-base">⚡</span>
                <span className="text-[10px] font-bold">كاشير المحل</span>
              </button>

              <button
                disabled={!selectedStoreSlug}
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = `${window.location.origin}/${selectedStoreSlug}/admin`;
                }}
                className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/50 disabled:opacity-40 text-slate-300 hover:text-purple-300 text-center transition flex flex-col items-center gap-1"
              >
                <span className="text-base">💼</span>
                <span className="text-[10px] font-bold">لوحة التاجر</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                disabled={!selectedStoreSlug}
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = `${window.location.origin}/?store=${selectedStoreSlug}&portal=driver`;
                }}
                className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 hover:text-amber-400 text-center transition flex flex-col items-center gap-1"
              >
                <span className="text-base">🛵</span>
                <span className="text-[10px] font-bold">كابتن التوصيل</span>
              </button>

              <button
                disabled={!selectedStoreSlug}
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = `${window.location.origin}/${selectedStoreSlug}/kds`;
                }}
                className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-orange-500/50 disabled:opacity-40 text-slate-300 hover:text-orange-400 text-center transition flex flex-col items-center gap-1"
              >
                <span className="text-base">👨‍🍳</span>
                <span className="text-[10px] font-bold">شاشة المطبخ</span>
              </button>
            </div>
          </div>

          {/* Master Reset Button - Solves lingering cache & sticky session */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              onClick={handleClearTestCache}
              disabled={isResetting}
              className={`w-full py-2.5 px-3 rounded-2xl font-black text-xs transition flex items-center justify-center gap-2 shadow-lg ${
                resetSuccess
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 hover:border-rose-400'
              }`}
            >
              {resetSuccess ? (
                <>
                  <Check className="w-4 h-4 text-slate-950" />
                  <span>تم مسح الكاش بنجاح! جاري التحديث...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>🧹 مسح بيانات التجربة والكاش المؤقت</span>
                </>
              )}
            </button>
            <p className="text-[9px] text-slate-500 text-center mt-1.5 leading-tight">
              يمسح الجلسات والتوكنات القديمة ويفتح المنصة نظيفة تماماً دون الحاجة للمتصفح الخفي
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

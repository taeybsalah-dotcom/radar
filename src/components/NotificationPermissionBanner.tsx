import React, { useState, useEffect } from 'react';
import { Bell, BellRing, CheckCircle2, X } from 'lucide-react';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  sendPortalNotification,
  NotificationPermissionState,
} from '../lib/notifications';

interface NotificationBannerProps {
  portalName?: string;
  role?: string;
}

export const NotificationPermissionBanner: React.FC<NotificationBannerProps> = ({
  portalName = 'المنصة',
  role,
}) => {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showTestSuccess, setShowTestSuccess] = useState(false);

  useEffect(() => {
    const status = getNotificationPermissionStatus();
    setPermission(status);

    const dismissedKey = 'radar_notif_banner_dismissed';
    if (sessionStorage.getItem(dismissedKey) === 'true') {
      setIsDismissed(true);
    }
  }, []);

  if (permission === 'unsupported' || permission === 'denied' || isDismissed) {
    return null;
  }

  const handleEnable = async () => {
    setIsLoading(true);
    try {
      const res = await requestNotificationPermission();
      setPermission(res);

      if (res === 'granted') {
        setShowTestSuccess(true);
        // Play welcome sound and trigger test lock-screen notification
        await sendPortalNotification({
          title: `🔔 تم تفعيل الإشعارات في ${portalName}`,
          body: 'ستصلك التنبيهات الفورية والنغمات بنجاح حتى عند إغلاق الشاشة.',
          soundType: role === 'partner' ? 'commission' : 'notification',
          tag: 'radar-welcome-notification',
        });

        setTimeout(() => {
          setIsDismissed(true);
        }, 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('radar_notif_banner_dismissed', 'true');
  };

  if (permission === 'granted') {
    if (!showTestSuccess) return null;
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-emerald-950/95 border border-emerald-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-fade-in flex items-center justify-between text-emerald-100">
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold">تم تفعيل الإشعارات والنغمات بنجاح 🎉</p>
            <p className="text-[11px] text-emerald-300/80">ستصلك التنبيهات حتى عند إغلاق التطبيق.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-slate-900/95 border border-amber-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-bounce-subtle">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start space-x-3 rtl:space-x-reverse">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
            <BellRing className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-black text-white flex items-center gap-1.5">
              <span>تفعيل التنبيهات الفورية والنغمات</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                مهم 🔔
              </span>
            </h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              لتصلك إشعارات {role === 'partner' ? 'العمولات والمتاجر' : 'العمليات والمكافآت'} بنغمة تنبيه حتى وشاشة الجوال مقفلة.
            </p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          aria-label="إغلاق"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3.5 flex items-center gap-2">
        <button
          onClick={handleEnable}
          disabled={isLoading}
          className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs transition shadow-lg flex items-center justify-center gap-2"
        >
          <Bell className="w-3.5 h-3.5" />
          <span>{isLoading ? 'جاري التفعيل...' : 'تفعيل الإشعارات الآن ⚡'}</span>
        </button>
        <button
          onClick={handleDismiss}
          className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
        >
          لاحقاً
        </button>
      </div>
    </div>
  );
};

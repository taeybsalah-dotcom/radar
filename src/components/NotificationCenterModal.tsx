import { getActiveTenantConfig } from '../config/tenant';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Coins,
  Gift,
  Sparkles,
  Clock,
  Store,
} from 'lucide-react';
import {
  InboxNotification,
  getInboxNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteInboxNotification,
  clearAllInboxNotifications,
  subscribeToInboxUpdates,
} from '../lib/notifications';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  portalName?: string;
  portalFilter?: string;
  storeId?: string;
  userPhone?: string;
  userId?: string;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  portalName = 'المنصة',
  portalFilter,
  storeId,
  userPhone,
  userId,
}) => {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'commissions' | 'rewards'>('all');

  const scope = React.useMemo(
    () => ({
      portal: portalFilter,
      storeId,
      userPhone,
      userId,
    }),
    [portalFilter, storeId, userPhone, userId]
  );

  useEffect(() => {
    setNotifications(getInboxNotifications(scope));
    const unsubscribe = subscribeToInboxUpdates((list) => {
      setNotifications(list);
    }, scope);
    return () => unsubscribe();
  }, [scope]);

  if (!isOpen) return null;

  const isCustomerPortal = portalFilter === 'customer';
  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.read;
    if (activeTab === 'commissions') return n.soundType === 'commission' || n.title.includes('عمولة') || n.title.includes('أرباح');
    if (activeTab === 'rewards') return n.soundType === 'success' || n.soundType === 'redeem' || n.title.includes('نقاط') || n.title.includes('نقطة') || n.title.includes('مكافأة') || n.title.includes('استبدال');
    return true;
  });

  const formatArabicTime = (timestampStr: string) => {
    try {
      const date = new Date(timestampStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return 'الآن';
      if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
      if (diffHours < 24) return `منذ ${diffHours} ساعة`;
      return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getNotificationBadge = (n: InboxNotification) => {
    if (n.title.includes('نقاط') || n.title.includes('نقطة')) {
      return {
        icon: <Sparkles className="w-5 h-5 text-amber-500" />,
        bg: 'bg-amber-100/90 dark:bg-amber-500/15 border-amber-200/90 dark:border-amber-500/30',
      };
    }
    if (n.soundType === 'commission' || n.title.includes('عمولة') || n.title.includes('أرباح')) {
      return {
        icon: <Coins className="w-5 h-5 text-emerald-500" />,
        bg: 'bg-emerald-100/90 dark:bg-emerald-500/15 border-emerald-200/90 dark:border-emerald-500/30',
      };
    }
    if (n.soundType === 'redeem' || n.title.includes('مكافأة') || n.title.includes('استبدال') || n.title.includes('هدية') || n.title.includes('كوبون')) {
      return {
        icon: <Gift className="w-5 h-5 text-purple-500" />,
        bg: 'bg-purple-100/90 dark:bg-purple-500/15 border-purple-200/90 dark:border-purple-500/30',
      };
    }
    if (n.title.includes('متجر') || n.title.includes('انضمام') || n.title.includes('فرع')) {
      return {
        icon: <Store className="w-5 h-5 text-cyan-500" />,
        bg: 'bg-cyan-100/90 dark:bg-cyan-500/15 border-cyan-200/90 dark:border-cyan-500/30',
      };
    }
    return {
      icon: <Bell className="w-5 h-5 text-amber-500" />,
      bg: 'bg-amber-100/90 dark:bg-amber-500/15 border-amber-200/90 dark:border-amber-500/30',
    };
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center sm:justify-end p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 sm:rounded-3xl w-full sm:max-w-md h-full sm:h-[90vh] flex flex-col shadow-2xl overflow-hidden text-right">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 shadow-2xs">
              <Bell className="w-5 h-5" />
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white">صندوق الإشعارات</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">
                    {unreadCount} جديد
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">تنبيهات ورسائل {portalName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Tabs & Bulk Actions */}
        <div className="p-3 bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                activeTab === 'all'
                  ? 'bg-amber-100/90 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 font-black shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-transparent'
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                activeTab === 'unread'
                  ? 'bg-amber-100/90 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 font-black shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-transparent'
              }`}
            >
              غير المقروءة ({unreadCount})
            </button>
            {isCustomerPortal ? (
              <button
                type="button"
                onClick={() => setActiveTab('rewards')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                  activeTab === 'rewards'
                    ? 'bg-purple-100/90 text-purple-900 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/40 font-black shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-transparent'
                }`}
              >
                نقاط ومكافآت ⭐
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('commissions')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                  activeTab === 'commissions'
                    ? 'bg-emerald-100/90 text-emerald-900 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 font-black shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-transparent'
                }`}
              >
                العمولات 💰
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllNotificationsAsRead(scope)}
                className="p-1.5 px-2.5 rounded-xl transition border text-[11px] font-bold flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700"
                title="تحديد الكل كمقروء"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline">قراءة الكل</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('هل أنت متأكد من رغبتك في مسح كافة الإشعارات؟')) {
                    clearAllInboxNotifications(scope);
                  }
                }}
                className="p-1.5 rounded-xl transition border text-slate-500 hover:text-rose-500 hover:bg-rose-50 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-rose-500/20"
                title="مسح كافة الإشعارات"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredNotifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-slate-400">
              <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/40 flex items-center justify-center text-3xl shadow-inner">
                📬
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-300">لا توجد إشعارات في هذا القسم</h4>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                  كافة التنبيهات الفورية ونقاط الولاء الجديدة ستصلك هنا فور حدوثها.
                </p>
              </div>
            </div>
          ) : (
            filteredNotifications.map((n) => {
              const badge = getNotificationBadge(n);
              return (
                <div
                  key={n.id}
                  onClick={() => !n.read && markNotificationAsRead(n.id, scope)}
                  className={`rounded-2xl p-3.5 transition cursor-pointer relative group border ${
                    n.read
                      ? 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-2xs dark:bg-slate-900/50 dark:hover:bg-slate-800/60 dark:border-slate-800'
                      : 'bg-amber-50/70 hover:bg-amber-50 border-amber-200/90 shadow-xs dark:bg-slate-800/80 dark:hover:bg-slate-800 dark:border-amber-500/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* 1. Badge Icon (Right in RTL) */}
                    <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${badge.bg}`}>
                      {badge.icon}
                    </div>

                    {/* 2. Text Content (Center in RTL) */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {!n.read && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>}
                        <h4 className={`text-xs font-black truncate ${n.read ? 'text-slate-800 dark:text-slate-200' : 'text-slate-950 dark:text-white'}`}>
                          {n.title}
                        </h4>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {n.body}
                      </p>
                    </div>

                    {/* 3. Timestamp & Delete Action (Left in RTL) */}
                    <div className="flex flex-col items-end justify-between shrink-0 self-stretch min-h-[44px]">
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatArabicTime(n.timestamp)}</span>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteInboxNotification(n.id, scope);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition opacity-60 group-hover:opacity-100"
                        title="حذف هذا الإشعار"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          نظام {getActiveTenantConfig().brandName} للولاء الذكي والتنبيهات المباشرة 🔔⚡
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

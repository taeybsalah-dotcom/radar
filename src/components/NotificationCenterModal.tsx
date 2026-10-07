import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Volume2,
  Coins,
  Gift,
  Zap,
  Sparkles,
  CheckCircle2,
  Clock,
  ExternalLink,
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
import { playBeepSound } from '../lib/sound';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  portalName?: string;
  portalFilter?: string;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  portalName = 'المنصة',
  portalFilter,
}) => {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'commissions'>('all');

  useEffect(() => {
    setNotifications(getInboxNotifications(portalFilter));
    const unsubscribe = subscribeToInboxUpdates((list) => {
      if (!portalFilter || portalFilter === 'all') {
        setNotifications(list);
      } else {
        setNotifications(list.filter((n) => !n.portal || n.portal === portalFilter || n.portal === 'all'));
      }
    });
    return () => unsubscribe();
  }, [portalFilter]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.read;
    if (activeTab === 'commissions') return n.soundType === 'commission' || n.title.includes('عمولة') || n.title.includes('أرباح');
    return true;
  });

  const handleReplaySound = (soundType?: string) => {
    playBeepSound((soundType as any) || 'notification');
  };

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

  const getNotificationIcon = (n: InboxNotification) => {
    if (n.soundType === 'commission' || n.title.includes('عمولة')) {
      return <Coins className="w-5 h-5 text-emerald-400" />;
    }
    if (n.soundType === 'success' || n.title.includes('هدية') || n.title.includes('مكافأة')) {
      return <Gift className="w-5 h-5 text-amber-400" />;
    }
    if (n.title.includes('متجر') || n.title.includes('انضمام')) {
      return <Store className="w-5 h-5 text-cyan-400" />;
    }
    return <Bell className="w-5 h-5 text-amber-400" />;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center sm:justify-end p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 sm:rounded-3xl w-full sm:max-w-md h-full sm:h-[90vh] flex flex-col shadow-2xl overflow-hidden text-right">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">
                    {unreadCount} جديد
                  </span>
                )}
                <h3 className="text-base font-black text-white">صندوق الإشعارات</h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">تنبيهات ورسائل {portalName}</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Bell className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter Tabs & Bulk Actions */}
        <div className="p-3 bg-slate-950/40 border-b border-slate-800/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'all'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'unread'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              غير المقروءة ({unreadCount})
            </button>
            <button
              onClick={() => setActiveTab('commissions')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'commissions'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              العمولات 💰
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllNotificationsAsRead(portalFilter)}
                className="p-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold flex items-center gap-1 transition"
                title="تحديد الكل كمقروء"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">قراءة الكل</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('هل أنت متأكد من رغبتك في مسح كافة الإشعارات؟')) {
                    clearAllInboxNotifications(portalFilter);
                  }
                }}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                title="مسح كافة الإشعارات"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-800/40">
          {filteredNotifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-slate-500">
              <div className="w-16 h-16 rounded-3xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center text-2xl">
                📬
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-300">لا توجد إشعارات في هذا القسم</h4>
                <p className="text-xs text-slate-500 max-w-xs">
                  كافة التنبيهات الفورية والعمليات الجديدة ستصلك هنا فور حدوثها.
                </p>
              </div>
            </div>
          ) : (
            filteredNotifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.read && markNotificationAsRead(n.id)}
                className={`pt-3 first:pt-0 rounded-2xl p-3 transition cursor-pointer relative group ${
                  n.read ? 'bg-slate-900/40 hover:bg-slate-800/40' : 'bg-slate-800/60 hover:bg-slate-800 border border-amber-500/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Actions (Delete & Sound) */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplaySound(n.soundType);
                      }}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 flex items-center justify-center transition"
                      title="تشغيل نغمة الإشعار"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteInboxNotification(n.id);
                      }}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center transition"
                      title="حذف هذا الإشعار"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex items-start space-x-3 rtl:space-x-reverse flex-1 pr-1">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      {getNotificationIcon(n)}
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {!n.read && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>}
                          <h4 className={`text-xs font-black ${n.read ? 'text-slate-200' : 'text-white'}`}>
                            {n.title}
                          </h4>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 shrink-0">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{formatArabicTime(n.timestamp)}</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{n.body}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800/80 text-center text-[11px] text-slate-500">
          نظام رادار للولاء الذكي والتنبيهات المباشرة 🔔⚡
        </div>
      </div>
    </div>
  );
};

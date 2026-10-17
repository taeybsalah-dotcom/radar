import React, { useState, useEffect, useMemo } from 'react';
import { Bell } from 'lucide-react';
import {
  NotificationScope,
  getUnreadNotificationCount,
  subscribeToInboxUpdates,
} from '../lib/notifications';
import { NotificationCenterModal } from './NotificationCenterModal';

interface NotificationBellProps {
  portalName?: string;
  portalFilter?: string;
  storeId?: string;
  userPhone?: string;
  userId?: string;
  className?: string;
  buttonClassName?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  portalName = 'المنصة',
  portalFilter,
  storeId,
  userPhone,
  userId,
  className = '',
  buttonClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const scope: NotificationScope = useMemo(
    () => ({
      portal: portalFilter,
      storeId,
      userPhone,
      userId,
    }),
    [portalFilter, storeId, userPhone, userId]
  );

  useEffect(() => {
    setUnreadCount(getUnreadNotificationCount(scope));
    const unsubscribe = subscribeToInboxUpdates(() => {
      setUnreadCount(getUnreadNotificationCount(scope));
    }, scope);
    return () => unsubscribe();
  }, [scope]);

  return (
    <>
      <div className={`relative inline-block ${className}`}>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`relative p-2 sm:p-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition shadow-md flex items-center justify-center ${buttonClassName}`}
          title="صندوق الإشعارات والتنبيهات"
        >
          <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          {unreadCount > 0 && (
            <>
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-[10px] rounded-full flex items-center justify-center shadow-lg animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
              <span className="absolute -top-1 -right-1 w-[18px] h-[18px] bg-amber-400 rounded-full animate-ping opacity-60 pointer-events-none"></span>
            </>
          )}
        </button>
      </div>

      <NotificationCenterModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        portalName={portalName}
        portalFilter={portalFilter}
        storeId={storeId}
        userPhone={userPhone}
        userId={userId}
      />
    </>
  );
};

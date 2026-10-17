// 🔔 Radar Loyalty Engine — Unified Push & Notification Center
import { playBeepSound } from './sound';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Initializes and registers the Service Worker for lock-screen push notifications.
 */
export async function registerRadarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    swRegistration = registration;
    return registration;
  } catch (err) {
    console.warn('[Radar SW] Registration failed:', err);
    return null;
  }
}

/**
 * Checks current notification permission status.
 */
export function getNotificationPermissionStatus(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * Requests browser & OS notification permission from user.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      await registerRadarServiceWorker();
    }
    return result as NotificationPermissionState;
  } catch (err) {
    console.warn('[Radar Notifications] Request permission error:', err);
    return 'denied';
  }
}

export interface SendNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  soundType?: 'notification' | 'commission' | 'success' | 'redeem' | 'error' | 'pos_order_alert';
  requireInteraction?: boolean;
}

/**
 * Dispatches notification:
 * - Plays high-fidelity sound cue in-app.
 * - Shows OS / Lock-screen notification via ServiceWorker or Notification API.
 */
export async function sendPortalNotification(options: SendNotificationOptions): Promise<void> {
  const {
    title,
    body,
    icon = '/icon-192.png',
    badge = '/favicon-32.png',
    url = window.location.href,
    tag = 'radar-alert',
    soundType = 'notification',
    requireInteraction = false,
  } = options;

  // 1. Play Audio Cue
  try {
    playBeepSound(soundType);
  } catch (e) {
    // Ignore audio context autoplay restrictions
  }

  // 2. Dispatch System / Lock-screen Push Notification if supported and permitted
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'granted') {
    try {
      if (!swRegistration && 'serviceWorker' in navigator) {
        swRegistration = await navigator.serviceWorker.ready.catch(() => null);
      }

      if (swRegistration && 'showNotification' in swRegistration) {
        await (swRegistration as any).showNotification(title, {
          body,
          icon,
          badge,
          tag,
          renotify: true,
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction,
          data: {
            url,
            dateOfArrival: Date.now(),
          },
        });
      } else {
        new Notification(title, {
          body,
          icon,
          tag,
        });
      }
    } catch (err) {
      console.warn('[Radar Notifications] Failed to show system notification:', err);
    }
  }
}

/**
 * 👤 Customer Notification (Points earned, coupons, rewards)
 */
export function notifyCustomer(title: string, body: string, url?: string) {
  return sendPortalNotification({
    title: `🎁 ${title}`,
    body,
    icon: '/icon-192.png',
    url,
    soundType: 'success',
    tag: 'customer-reward',
  });
}

/**
 * 🏪 Cashier POS Notification (New scan, coupon redemption, transaction)
 */
export function notifyCashier(title: string, body: string, url?: string) {
  return sendPortalNotification({
    title: `⚡ ${title}`,
    body,
    icon: '/icon-192.png',
    url,
    soundType: 'notification',
    tag: 'cashier-operation',
  });
}

/**
 * 🏢 Merchant Admin Notification (New customer, daily sales, invoice)
 */
export function notifyMerchant(title: string, body: string, url?: string) {
  return sendPortalNotification({
    title: `🏪 ${title}`,
    body,
    icon: '/icon-192.png',
    url,
    soundType: 'notification',
    tag: 'merchant-update',
  });
}

/**
 * 🤝 Partner / Marketer Notification (New merchant lead, commission earned)
 */
export function notifyPartner(title: string, body: string, url?: string) {
  return sendPortalNotification({
    title: `💰 ${title}`,
    body,
    icon: '/icon-192.png',
    url,
    soundType: 'commission',
    tag: 'partner-commission',
  });
}

/**
 * 👑 Super Admin Notification (New store registered, subscription paid)
 */
export function notifySuperAdmin(title: string, body: string, url?: string) {
  return sendPortalNotification({
    title: `👑 ${title}`,
    body,
    icon: '/icon-192.png',
    url,
    soundType: 'commission',
    tag: 'super-admin-event',
  });
}

// ==============================================================================
// 📬 INBOX NOTIFICATION CENTER STORE (Isolated & Scoped by User/Store/Portal)
// ==============================================================================

export interface NotificationScope {
  portal?: 'customer' | 'cashier' | 'store' | 'partner' | 'super_admin' | 'all' | string;
  storeId?: string;
  userPhone?: string;
  userId?: string;
  branchId?: string;
}

export interface InboxNotification {
  id: string;
  title: string;
  body: string;
  soundType?: 'notification' | 'commission' | 'success' | 'redeem' | 'error';
  targetType?: string;
  targetId?: string;
  storeId?: string;
  userPhone?: string;
  userId?: string;
  portal?: string;
  read: boolean;
  timestamp: string;
  actionUrl?: string;
}

const LEGACY_STORAGE_KEY = 'radar_inbox_notifications_history';
const INBOX_EVENT_NAME = 'radar_inbox_updated';

function normalizeCleanPhone(phone?: string): string {
  return (phone || '').replace(/\D/g, '').slice(-9);
}

/**
 * Returns a isolated, user-specific localStorage key for notifications.
 * Prevents any cross-user or cross-store notification leakage.
 */
export function getScopedStorageKey(scope?: NotificationScope | string): string {
  if (!scope) return 'radar_notifs_guest';
  if (typeof scope === 'string') {
    return `radar_notifs_portal_${scope}`;
  }
  const parts: string[] = ['radar_notifs'];
  if (scope.portal) parts.push(scope.portal);
  if (scope.storeId) parts.push(scope.storeId);
  if (scope.userPhone) {
    const clean = normalizeCleanPhone(scope.userPhone);
    if (clean) parts.push(clean);
  }
  if (scope.userId) parts.push(scope.userId);
  return parts.join('_');
}

/**
 * Extracts and parses notifications for a specific user/portal scope.
 */
export function getInboxNotifications(scopeFilter?: NotificationScope | string): InboxNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    // 🛡️ Purge legacy shared global storage key if still lingering
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {}
    }

    const key = getScopedStorageKey(scopeFilter);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const list: InboxNotification[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    if (!scopeFilter || scopeFilter === 'all') return list;

    if (typeof scopeFilter === 'string') {
      return list.filter((n) => !n.portal || n.portal === scopeFilter || n.portal === 'all');
    }

    const filterPhone = scopeFilter.userPhone ? normalizeCleanPhone(scopeFilter.userPhone) : null;

    return list.filter((n) => {
      // 1. Portal check
      if (scopeFilter.portal && scopeFilter.portal !== 'all' && n.portal && n.portal !== scopeFilter.portal && n.portal !== 'all') {
        return false;
      }
      // 2. Store check
      if (scopeFilter.storeId && n.storeId && n.storeId !== scopeFilter.storeId) {
        return false;
      }
      // 3. User phone check
      if (filterPhone && n.userPhone) {
        const notifPhone = normalizeCleanPhone(n.userPhone);
        if (notifPhone && notifPhone !== filterPhone) return false;
      }
      // 4. User ID check
      if (scopeFilter.userId && n.userId && n.userId !== scopeFilter.userId) {
        return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

/**
 * Saves a notification into the user's isolated scoped storage.
 */
export function saveInboxNotification(
  notif: Omit<InboxNotification, 'id' | 'read' | 'timestamp'> & {
    id?: string;
    read?: boolean;
    timestamp?: string;
  },
  explicitScope?: NotificationScope | string
): InboxNotification {
  const scope: NotificationScope = typeof explicitScope === 'string'
    ? { portal: explicitScope }
    : (explicitScope || {
        portal: notif.portal || 'all',
        storeId: notif.storeId,
        userPhone: notif.userPhone,
        userId: notif.userId,
      });

  const storageKey = getScopedStorageKey(scope);
  const current = getInboxNotifications(scope);

  const newNotif: InboxNotification = {
    id: notif.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: notif.title,
    body: notif.body,
    soundType: notif.soundType || 'notification',
    targetType: notif.targetType,
    targetId: notif.targetId,
    storeId: notif.storeId || scope.storeId,
    userPhone: notif.userPhone || scope.userPhone,
    userId: notif.userId || scope.userId,
    portal: notif.portal || scope.portal || 'all',
    read: notif.read ?? false,
    timestamp: notif.timestamp || new Date().toISOString(),
    actionUrl: notif.actionUrl,
  };

  // 🛡️ Deduplication Guard: Ignore if an identical notification was saved within 4 seconds
  const isDuplicate = current.some((existing) => {
    if (existing.id === newNotif.id) return true;
    const isSameText = existing.title === newNotif.title && existing.body === newNotif.body;
    if (isSameText) {
      const existingTime = new Date(existing.timestamp).getTime();
      const newTime = new Date(newNotif.timestamp).getTime();
      return Math.abs(newTime - existingTime) < 4000;
    }
    return false;
  });

  if (isDuplicate) {
    return current[0] || newNotif;
  }

  const updated = [newNotif, ...current.filter((n) => n.id !== newNotif.id)].slice(0, 100);
  try {
    localStorage.setItem(storageKey, JSON.stringify(updated));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(INBOX_EVENT_NAME, {
          detail: { list: updated, key: storageKey, scope },
        })
      );
    }
  } catch {}
  return newNotif;
}

export function markNotificationAsRead(id: string, scope?: NotificationScope | string): void {
  const storageKey = getScopedStorageKey(scope);
  const current = getInboxNotifications(scope);
  const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
  try {
    localStorage.setItem(storageKey, JSON.stringify(updated));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(INBOX_EVENT_NAME, { detail: { list: updated, key: storageKey } }));
    }
  } catch {}
}

export function markAllNotificationsAsRead(scope?: NotificationScope | string): void {
  const storageKey = getScopedStorageKey(scope);
  const current = getInboxNotifications(scope);
  const updated = current.map((n) => ({ ...n, read: true }));
  try {
    localStorage.setItem(storageKey, JSON.stringify(updated));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(INBOX_EVENT_NAME, { detail: { list: updated, key: storageKey } }));
    }
  } catch {}
}

export function deleteInboxNotification(id: string, scope?: NotificationScope | string): void {
  const storageKey = getScopedStorageKey(scope);
  const current = getInboxNotifications(scope);
  const updated = current.filter((n) => n.id !== id);
  try {
    localStorage.setItem(storageKey, JSON.stringify(updated));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(INBOX_EVENT_NAME, { detail: { list: updated, key: storageKey } }));
    }
  } catch {}
}

export function clearAllInboxNotifications(scope?: NotificationScope | string): void {
  const storageKey = getScopedStorageKey(scope);
  try {
    localStorage.removeItem(storageKey);
    // Also remove legacy key if present
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(INBOX_EVENT_NAME, { detail: { list: [], key: storageKey } }));
    }
  } catch {}
}

/**
 * Complete purge of user notifications and session memory on logout
 */
export function purgeAllCachedUserDataAndNotifications(scope?: NotificationScope | string): void {
  clearAllInboxNotifications(scope);
  try {
    // Purge any residual keys starting with radar_notifs_
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('radar_notifs_') || k === LEGACY_STORAGE_KEY)) {
          if (!scope || k === getScopedStorageKey(scope)) {
            keysToRemove.push(k);
          }
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      window.dispatchEvent(new CustomEvent(INBOX_EVENT_NAME, { detail: { list: [] } }));
    }
  } catch {}
}

export function getUnreadNotificationCount(scope?: NotificationScope | string): number {
  const list = getInboxNotifications(scope);
  return list.filter((n) => !n.read).length;
}

export function subscribeToInboxUpdates(
  callback: (list: InboxNotification[]) => void,
  scope?: NotificationScope | string
): () => void {
  if (typeof window === 'undefined') return () => {};
  const currentKey = getScopedStorageKey(scope);

  const handler = (e: any) => {
    // If the event specifies key and it doesn't match, still update safely
    if (e.detail?.key && e.detail.key !== currentKey) {
      return;
    }
    callback(getInboxNotifications(scope));
  };

  window.addEventListener(INBOX_EVENT_NAME, handler);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === currentKey || e.key === LEGACY_STORAGE_KEY) {
      callback(getInboxNotifications(scope));
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    window.removeEventListener(INBOX_EVENT_NAME, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

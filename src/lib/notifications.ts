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
  soundType?: 'notification' | 'commission' | 'success' | 'redeem' | 'error';
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

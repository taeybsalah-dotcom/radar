import { LoyaltyService } from './supabase';
import { LoyaltyEvents } from './events';

export interface QueuedOfflineOrder {
  id: string; // Client-side unique UUID
  storeId: string;
  orderNumber: string;
  orderPayload: any;
  customerPhone?: string | null;
  customerName?: string | null;
  cartGrandTotal: number;
  paymentMethod: string;
  activeStaff: { id: string; name: string };
  branchId?: string | null;
  branchName?: string | null;
  itemsCount: number;
  queuedAt: string;
  retryCount: number;
  lastError?: string;
}

const OFFLINE_QUEUE_KEY_PREFIX = 'radar_pos_offline_orders_';

export const OfflineSyncEngine = {
  getQueueKey(storeId: string): string {
    return `${OFFLINE_QUEUE_KEY_PREFIX}${storeId}`;
  },

  getQueuedOrders(storeId: string): QueuedOfflineOrder[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.getQueueKey(storeId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  queueOrder(storeId: string, order: QueuedOfflineOrder): void {
    if (typeof window === 'undefined') return;
    try {
      const current = this.getQueuedOrders(storeId);
      // Avoid duplicate queuing
      if (current.some((o) => o.id === order.id || o.orderNumber === order.orderNumber)) {
        return;
      }
      current.push(order);
      localStorage.setItem(this.getQueueKey(storeId), JSON.stringify(current));

      // Emit local event so all UI components update queue count badge
      LoyaltyEvents.emit({
        type: 'ORDER_CREATED',
        storeId,
        orderData: { ...order.orderPayload, is_offline_queued: true },
      });
    } catch (e) {
      console.warn('Failed to queue offline order:', e);
    }
  },

  removeOrder(storeId: string, orderId: string): void {
    if (typeof window === 'undefined') return;
    try {
      const current = this.getQueuedOrders(storeId);
      const filtered = current.filter((o) => o.id !== orderId && o.orderNumber !== orderId);
      localStorage.setItem(this.getQueueKey(storeId), JSON.stringify(filtered));
    } catch (e) {
      console.warn('Failed to remove queued order:', e);
    }
  },

  clearQueue(storeId: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(this.getQueueKey(storeId));
    } catch (e) {
      console.warn('Failed to clear queue:', e);
    }
  },

  isOnline(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  },

  // Ping check to detect "lie-fi" (Wi-Fi connected but no Internet route)
  async checkRealInternet(): Promise<boolean> {
    if (!this.isOnline()) return false;
    try {
      // 1-second timeout probe
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch('https://radar-telegram-bot.taeybsalah.workers.dev/notify', {
        method: 'OPTIONS',
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeoutId);
      return Boolean(resp);
    } catch {
      return this.isOnline();
    }
  },

  // 🔄 Sync all queued offline orders sequentially
  async syncQueue(
    storeId: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ successCount: number; failedCount: number; remainingCount: number }> {
    const queue = this.getQueuedOrders(storeId);
    if (queue.length === 0) {
      return { successCount: 0, failedCount: 0, remainingCount: 0 };
    }

    let successCount = 0;
    let failedCount = 0;
    const remainingQueue: QueuedOfflineOrder[] = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (onProgress) {
        onProgress(i + 1, queue.length);
      }

      try {
        // 1. Create order in Supabase
        await LoyaltyService.createStoreOrder(item.orderPayload);

        // 2. Award loyalty points if customer was registered
        if (item.customerPhone) {
          try {
            await LoyaltyService.processPurchase(
              storeId,
              item.customerPhone,
              item.cartGrandTotal,
              `فاتورة كاشير #${item.orderNumber} (مزامنة أوفلاين)`,
              undefined,
              item.activeStaff.id,
              item.activeStaff.name,
              'qr_scan',
              item.branchId || null,
              item.branchName || null
            );
          } catch (ptsErr) {
            console.warn(`Points award failed during offline sync for order ${item.orderNumber}:`, ptsErr);
          }
        }

        successCount++;
      } catch (err: any) {
        console.warn(`Failed to sync queued order ${item.orderNumber}:`, err);
        failedCount++;
        remainingQueue.push({
          ...item,
          retryCount: (item.retryCount || 0) + 1,
          lastError: err?.message || 'تعذر الاتصال بالسيرفر',
        });
      }
    }

    // Save whatever couldn't be synced back to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.getQueueKey(storeId), JSON.stringify(remainingQueue));
    }

    return {
      successCount,
      failedCount,
      remainingCount: remainingQueue.length,
    };
  },
};

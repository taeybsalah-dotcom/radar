// Real-time Event Bus to sync Cashier Scan with Customer Wallet and Admin in real-time across all devices
export type LoyaltyEventType =
  | 'POINTS_ADDED'
  | 'REWARD_REDEEMED'
  | 'TIERS_UPDATED'
  | 'STORE_UPDATED'
  | 'CUSTOMER_UPDATED'
  | 'PRIVILEGES_UPDATED'
  | 'COUPON_PURCHASED'
  | 'COUPON_REDEEMED'
  | 'WALLET_UPDATED'
  | 'STAFF_UPDATED'
  | 'SUBSCRIPTION_UPDATED'
  | 'PAYMENT_COMPLETED'
  | 'SCAN_REJECTED';

export interface LoyaltyEventPayload {
  type: LoyaltyEventType;
  storeId: string;
  phone?: string;
  points?: number;
  newBalance?: number;
  newLifetimeXP?: number;
  currentTier?: string;
  rewardTitle?: string;
  couponId?: string;
  couponCode?: string;
  staffId?: string;
  error?: string;
}

const channelName = 'radar_loyalty_realtime_channel';
let channel: BroadcastChannel | null = null;
const listeners = new Set<(payload: LoyaltyEventPayload) => void>();
let supabaseBroadcastChannel: any = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(channelName);
    channel.addEventListener('message', (event: MessageEvent<LoyaltyEventPayload>) => {
      if (event.data) {
        listeners.forEach((fn) => {
          try { fn(event.data); } catch (err) { console.warn('Listener error:', err); }
        });
      }
    });
  }
} catch (e) {
  console.warn('BroadcastChannel not supported in this environment');
}

export const LoyaltyEvents = {
  // Connect to Supabase Realtime Channel for Cross-Device Web Broadcast
  initRealtime(supabaseClient: any) {
    if (!supabaseClient || supabaseBroadcastChannel) return;
    try {
      supabaseBroadcastChannel = supabaseClient.channel('radar_realtime_broadcast', {
        config: { broadcast: { self: true } },
      });

      supabaseBroadcastChannel
        .on('broadcast', { event: 'LOYALTY_EVENT' }, (msg: any) => {
          if (msg && msg.payload) {
            listeners.forEach((fn) => {
              try { fn(msg.payload); } catch (err) { console.warn('Realtime listener error:', err); }
            });
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Supabase realtime broadcast init warning:', e);
    }
  },

  emit(payload: LoyaltyEventPayload) {
    // 1. Notify local browser listeners
    listeners.forEach((fn) => {
      try { fn(payload); } catch {}
    });

    // 2. Broadcast to other tabs on same device
    if (channel) {
      try {
        channel.postMessage(payload);
      } catch (e) {
        console.error('Failed to broadcast event locally:', e);
      }
    }

    // 3. Broadcast to all mobile devices & screens via Supabase Realtime
    if (supabaseBroadcastChannel) {
      try {
        supabaseBroadcastChannel.send({
          type: 'broadcast',
          event: 'LOYALTY_EVENT',
          payload,
        });
      } catch (e) {
        console.warn('Supabase realtime broadcast send warning:', e);
      }
    }
  },

  listen(callback: (payload: LoyaltyEventPayload) => void) {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
};

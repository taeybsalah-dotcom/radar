// Real-time Event Bus to sync Cashier Scan with Customer Wallet in real-time across devices
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
  | 'LEAD_UPDATED'
  | 'PARTNER_UPDATED'
  | 'CUSTOM_NOTIFICATION'
  | 'SCAN_REJECTED';

export interface LoyaltyEventPayload {
  type: LoyaltyEventType;
  storeId: string;
  senderId?: string;
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
  title?: string;
  message?: string;
  soundType?: 'notification' | 'commission' | 'redeem' | 'success';
  targetType?: string;
  targetId?: string;
}

const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client_${Math.random().toString(36).substring(2)}_${Date.now().toString(36)}`;

// 🛡️ Whitelist of events that genuinely require cross-device Supabase Realtime broadcast (POS <-> Wallet)
// Internal admin/metadata events (stores, subscriptions, leads, staff) NEVER pollute the WebSocket quota.
const CROSS_DEVICE_REALTIME_EVENTS = new Set<LoyaltyEventType>([
  'POINTS_ADDED',
  'REWARD_REDEEMED',
  'COUPON_REDEEMED',
  'SCAN_REJECTED',
  'CUSTOM_NOTIFICATION',
]);

const channelName = 'radar_loyalty_realtime_channel';
let channel: BroadcastChannel | null = null;
const listeners = new Set<(payload: LoyaltyEventPayload) => void>();
let supabaseBroadcastChannel: any = null;
let activeSupabaseClient: any = null;

// Throttling map to strictly prevent broadcast spam and feedback loops
const lastBroadcastTimestamps = new Map<string, number>();
const BROADCAST_THROTTLE_MS = 1500;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(channelName);
    channel.addEventListener('message', (event: MessageEvent<LoyaltyEventPayload>) => {
      if (event.data) {
        // Prevent echo if sender is current client instance
        if (event.data.senderId && event.data.senderId === CLIENT_INSTANCE_ID) {
          return;
        }
        listeners.forEach((fn) => {
          try { fn(event.data); } catch (err) { console.warn('Local listener error:', err); }
        });
      }
    });
  }
} catch (e) {
  console.warn('BroadcastChannel not supported in this environment');
}

export const LoyaltyEvents = {
  // Connect to Supabase Realtime Channel exclusively for targeted cross-device POS <-> Wallet interactions
  initRealtime(supabaseClient: any) {
    if (!supabaseClient || supabaseBroadcastChannel) return;
    activeSupabaseClient = supabaseClient;

    try {
      // 🛡️ Explicit broadcast-only channel with self=false to prevent self-reflection
      supabaseBroadcastChannel = supabaseClient.channel('radar_realtime_broadcast', {
        config: { broadcast: { self: false } },
      });

      supabaseBroadcastChannel
        .on('broadcast', { event: 'LOYALTY_EVENT' }, (msg: any) => {
          if (msg && msg.payload) {
            // Strictly filter out self-emitted events
            if (msg.payload.senderId && msg.payload.senderId === CLIENT_INSTANCE_ID) {
              return;
            }
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

  // 🧹 Clean teardown of Realtime channels to prevent lingering connections and quota leaks
  teardownRealtime() {
    if (supabaseBroadcastChannel && activeSupabaseClient) {
      try {
        if (typeof activeSupabaseClient.removeChannel === 'function') {
          activeSupabaseClient.removeChannel(supabaseBroadcastChannel);
        } else if (typeof supabaseBroadcastChannel.unsubscribe === 'function') {
          supabaseBroadcastChannel.unsubscribe();
        }
      } catch (err) {
        console.warn('Failed to clean up Supabase Realtime channel:', err);
      }
      supabaseBroadcastChannel = null;
    }
  },

  emit(payload: LoyaltyEventPayload) {
    const eventWithSender: LoyaltyEventPayload = {
      ...payload,
      senderId: payload.senderId || CLIENT_INSTANCE_ID,
    };

    // 1. Notify local browser listeners once (Instant UI update: 0ms, 0 network cost)
    listeners.forEach((fn) => {
      try { fn(eventWithSender); } catch {}
    });

    // 2. Broadcast to other tabs on same device via native browser BroadcastChannel (0 network cost)
    if (channel) {
      try {
        channel.postMessage(eventWithSender);
      } catch (e) {
        console.error('Failed to broadcast event locally:', e);
      }
    }

    // 3. Broadcast to other physical devices via Supabase Realtime WebSocket ONLY if it is an essential user-facing event
    if (supabaseBroadcastChannel && CROSS_DEVICE_REALTIME_EVENTS.has(payload.type)) {
      // Throttle protection: prevent identical spam within 1.5s window
      const throttleKey = `${payload.type}_${payload.storeId}_${payload.phone || payload.couponCode || ''}`;
      const now = Date.now();
      const lastSent = lastBroadcastTimestamps.get(throttleKey) || 0;
      if (now - lastSent < BROADCAST_THROTTLE_MS) {
        return;
      }
      lastBroadcastTimestamps.set(throttleKey, now);

      try {
        supabaseBroadcastChannel.send({
          type: 'broadcast',
          event: 'LOYALTY_EVENT',
          payload: eventWithSender,
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

// 🧹 Automatic cleanup on page unload to release Supabase connection immediately
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    LoyaltyEvents.teardownRealtime();
  });
}

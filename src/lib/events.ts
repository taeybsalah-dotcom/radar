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

const channelName = 'radar_loyalty_realtime_channel';
let channel: BroadcastChannel | null = null;
const listeners = new Set<(payload: LoyaltyEventPayload) => void>();
let supabaseBroadcastChannel: any = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(channelName);
    channel.addEventListener('message', (event: MessageEvent<LoyaltyEventPayload>) => {
      if (event.data) {
        // Prevent echo if sender is current client
        if (event.data.senderId && event.data.senderId === CLIENT_INSTANCE_ID) {
          return;
        }
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
  // Connect to Supabase Realtime Channel for Cross-Device Web Broadcast and DB Changes
  initRealtime(supabaseClient: any) {
    if (!supabaseClient || supabaseBroadcastChannel) return;
    try {
      // 🛡️ Prevent echo chamber: self = false
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

      // 🔄 Realtime Postgres Table Subscriptions for Cross-Dashboard Sync
      // Rule: Exactly 1 consolidated event per database table change
      supabaseClient
        .channel('radar_postgres_sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'stores' },
          (payload: any) => {
            const sId = payload.new?.id || payload.old?.id || '';
            listeners.forEach((fn) => {
              try {
                fn({ type: 'STORE_UPDATED', storeId: sId, senderId: 'POSTGRES_CDC' });
              } catch (err) {
                console.warn('Postgres changes store listener error:', err);
              }
            });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'merchant_leads' },
          (payload: any) => {
            const sId = payload.new?.converted_store_id || payload.old?.converted_store_id || '';
            listeners.forEach((fn) => {
              try {
                fn({ type: 'LEAD_UPDATED', storeId: sId, senderId: 'POSTGRES_CDC' });
              } catch (err) {
                console.warn('Postgres changes lead listener error:', err);
              }
            });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'store_invoices' },
          (payload: any) => {
            const sId = payload.new?.store_id || payload.old?.store_id || '';
            listeners.forEach((fn) => {
              try {
                fn({ type: 'PAYMENT_COMPLETED', storeId: sId, senderId: 'POSTGRES_CDC' });
              } catch (err) {
                console.warn('Postgres changes invoice listener error:', err);
              }
            });
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Supabase realtime broadcast init warning:', e);
    }
  },

  emit(payload: LoyaltyEventPayload) {
    const eventWithSender: LoyaltyEventPayload = {
      ...payload,
      senderId: payload.senderId || CLIENT_INSTANCE_ID,
    };

    // 1. Notify local browser listeners once
    listeners.forEach((fn) => {
      try { fn(eventWithSender); } catch {}
    });

    // 2. Broadcast to other tabs on same device
    if (channel) {
      try {
        channel.postMessage(eventWithSender);
      } catch (e) {
        console.error('Failed to broadcast event locally:', e);
      }
    }

    // 3. Broadcast to other devices via Supabase Realtime (self is false)
    if (supabaseBroadcastChannel) {
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

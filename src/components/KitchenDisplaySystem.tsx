import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Store, StoreStaff, StoreBranch, ServiceBooking, getStoreActiveModules } from '../types';
import { LoyaltyService, getSupabaseClient, isUUID } from '../lib/supabase';
import { LoyaltyEvents } from '../lib/events';
import { playBeepSound } from '../lib/sound';
import confetti from 'canvas-confetti';
import {
  ChefHat,
  Coffee,
  Utensils,
  Cake,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  X,
  Printer,
  Search,
  Filter,
  Check,
  Building2,
  Car,
  ShoppingBag,
  Layers,
  ArrowRight,
  Flame,
  Sparkles,
  RefreshCw,
  Copy,
  ExternalLink,
  Scissors,
  Calendar,
  User,
} from 'lucide-react';

// Helper: Check if an item is a service (salon/care/appointment) rather than a kitchen/bar item
export const isServiceItem = (it: any): boolean => {
  if (!it) return false;
  const itemType = (it.item_type || '').toLowerCase().trim();
  const cat = (it.category || '').toLowerCase().trim();
  const name = (it.name || '').toLowerCase().trim();
  return (
    itemType === 'service' ||
    cat === 'خدمات' ||
    cat === 'خدمة' ||
    cat === 'صالون' ||
    cat === 'عناية' ||
    name.includes('قص شعر') ||
    name.includes('حلاقة') ||
    name.includes('مساج') ||
    name.includes('تنظيف بشرة') ||
    name.includes('مكياج') ||
    name.includes('مانيكير') ||
    name.includes('بديكير') ||
    Boolean(it.specialist_id || it.specialist_name)
  );
};

export const hasKitchenItems = (order: any): boolean => {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.some((it: any) => !isServiceItem(it));
};

interface KitchenDisplaySystemProps {
  store: Store;
  activeStaff?: StoreStaff | null;
  activeBranch?: StoreBranch | null;
  isGeneralManager?: boolean;
  onClose?: () => void;
}

export const KitchenDisplaySystem: React.FC<KitchenDisplaySystemProps> = ({
  store,
  activeStaff,
  activeBranch,
  isGeneralManager = false,
  onClose,
}) => {
  // Brand color scheme
  const brandPrimary = store.primary_color || '#0F172A';
  const brandSecondary = store.secondary_color || '#F59E0B';

  // Standalone Branch Selection (supports query param ?branch= or localStorage persistence or first branch)
  const [branches, setBranches] = useState<StoreBranch[]>(store.branches || []);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const qBranch = new URLSearchParams(window.location.search).get('branch');
      if (qBranch && qBranch !== 'ALL') return qBranch;
    }
    if (activeBranch?.id) return activeBranch.id;
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(`radar_kds_branch_${store.id}`);
      if (cached && cached !== 'ALL') return cached;
    }
    if (store.branches && store.branches.length > 0) {
      return store.branches[0].id;
    }
    return 'ALL';
  });

  // Locked branch name for display
  const currentBranchName = useMemo(() => {
    if (selectedBranchId && selectedBranchId !== 'ALL') {
      const b = branches.find((item) => item.id === selectedBranchId) || (activeBranch?.id === selectedBranchId ? activeBranch : null);
      if (b?.name) return b.name;
    }
    if (activeBranch?.name) return activeBranch.name;
    if (branches.length > 0) return branches[0].name;
    return 'الفرع الرئيسي';
  }, [selectedBranchId, branches, activeBranch]);

  // Display Mode: Orders (Kitchen/Bar) vs Services (Salon/Care Appointments)
  const activeMods = getStoreActiveModules(store);
  const hasBookingsModule = Boolean(activeMods.bookings);
  const hasMenuModule = Boolean(activeMods.orders);
  const [displayMode, setDisplayMode] = useState<'orders' | 'services'>(() => {
    if (typeof window !== 'undefined') {
      const qMode = new URLSearchParams(window.location.search).get('mode');
      if (qMode === 'services') return 'services';
      if (qMode === 'orders') return 'orders';
    }
    if (hasBookingsModule && !hasMenuModule) return 'services';
    return 'orders';
  });

  // Orders & Bookings State
  const [orders, setOrders] = useState<any[]>([]);
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Filters State
  const [stationFilter, setStationFilter] = useState<'ALL' | 'BARISTA' | 'KITCHEN' | 'BAKERY'>('ALL');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'ALL' | 'dine_in' | 'takeaway' | 'car'>('ALL');
  const [specialistFilter, setSpecialistFilter] = useState<string>('ALL');
  const [bookingDateFilter, setBookingDateFilter] = useState<'today' | 'all'>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'grid'>('kanban');
  const [ticketTab, setTicketTab] = useState<'active' | 'completed'>('active');

  // Interactive Checklist State: map "orderId_itemIdx" -> boolean
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Sound & Screen Settings
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('radar_kds_sound') !== 'false';
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Real-Time Clock & Timers
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Ticket to Print Ref (Orders & Bookings)
  const [printingOrder, setPrintingOrder] = useState<any | null>(null);
  const [printingBooking, setPrintingBooking] = useState<ServiceBooking | null>(null);

  // WakeLock Ref to keep screen alive
  const wakeLockRef = useRef<any>(null);

  // Load branches if not provided and lock default branch
  useEffect(() => {
    if (store?.id && branches.length === 0) {
      LoyaltyService.getStoreBranches(store.id).then((fetched) => {
        setBranches(fetched);
        if (fetched.length > 0) {
          setSelectedBranchId((prev) => {
            const qBranch = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('branch') : null;
            if (qBranch && qBranch !== 'ALL') return qBranch;
            if (prev === 'ALL' || !prev) return fetched[0].id;
            return prev;
          });
        }
      }).catch(() => {});
    }
  }, [store?.id]);

  // Update current time every second for precise ticket countdown
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Request WakeLock so kitchen tablet doesn't lock/dim
  useEffect(() => {
    const requestLock = async () => {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch {}
      }
    };
    requestLock();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  // Fetch Live Store Orders & Bookings
  const loadOrders = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const [fetchedOrders, fetchedBookings] = await Promise.all([
        LoyaltyService.getLiveStoreOrders(store.id).catch(() => []),
        LoyaltyService.getStoreBookings(store.id).catch(() => []),
      ]);
      if (Array.isArray(fetchedOrders)) {
        setOrders(fetchedOrders);
      }
      if (Array.isArray(fetchedBookings)) {
        setBookings(fetchedBookings);
      }
    } catch (err) {
      console.warn('Failed to load live data for KDS:', err);
    } finally {
      if (!isBackground) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (store?.id) {
      loadOrders();
    }
  }, [store?.id]);

  // ⚡ Multi-Device Realtime Sync across Tablets / Smart TVs via Supabase WebSocket
  useEffect(() => {
    if (!store?.id) return;
    let channel: any = null;

    const setupRealtime = async () => {
      const resolved = await LoyaltyService.resolveStore(store.id);
      const targetStoreId = resolved?.id || store.id;
      const supabase = getSupabaseClient();
      if (!supabase || !isUUID(targetStoreId)) return;

      channel = supabase
        .channel(`kds_orders_channel_${targetStoreId}_${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_orders',
          },
          (payload: any) => {
            const row = payload.new || payload.old;
            if (!row) return;
            const rowStoreId = String(row.store_id || '').toLowerCase().trim();
            const currentStoreId = String(targetStoreId).toLowerCase().trim();
            if (rowStoreId !== currentStoreId) return;

            if (payload.eventType === 'INSERT') {
              const newOrder = payload.new;
              setOrders((prev) => {
                if (prev.some((o) => o.id === newOrder.id || (o.order_number && o.order_number === newOrder.order_number))) {
                  return prev;
                }
                return [newOrder, ...prev];
              });

              // 🛡️ Central Cashier Gate: Only ding if order was created directly by Cashier (POS) or already approved!
              const isAppPending = (newOrder.order_source === 'customer_app' || (!newOrder.order_source && !newOrder.cashier_id)) && (newOrder.status || '').toLowerCase() === 'pending';
              if (soundEnabled && hasKitchenItems(newOrder) && !isAppPending) {
                try {
                  playBeepSound('kitchen_order_ding');
                } catch {}
              }
            } else if (payload.eventType === 'UPDATE') {
              const updated = payload.new;
              setOrders((prev) => {
                const existing = prev.find((o) => o.id === updated.id);
                const wasAppPending = existing && (existing.order_source === 'customer_app' || !existing.order_source) && (existing.status || '').toLowerCase() === 'pending';
                const isNowApproved = (updated.status || '').toLowerCase() === 'accepted' || (updated.status || '').toLowerCase() === 'preparing';

                // 🔔 Ring in Kitchen the moment the Cashier approves the order!
                if (soundEnabled && hasKitchenItems(updated) && wasAppPending && isNowApproved) {
                  try {
                    playBeepSound('kitchen_order_ding');
                  } catch {}
                }
                return prev.map((o) => (o.id === updated.id || o.order_number === updated.order_number ? { ...o, ...updated } : o));
              });
            } else if (payload.eventType === 'DELETE') {
              setOrders((prev) => prev.filter((o) => o.id !== payload.old?.id));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'service_bookings',
          },
          (payload: any) => {
            const row = payload.new || payload.old;
            if (!row) return;
            const rowStoreId = String(row.store_id || '').toLowerCase().trim();
            const currentStoreId = String(targetStoreId).toLowerCase().trim();
            if (rowStoreId !== currentStoreId) return;

            if (payload.eventType === 'INSERT') {
              const newBk = payload.new;
              setBookings((prev) => [newBk, ...prev.filter((b) => b.id !== newBk.id && b.booking_number !== newBk.booking_number)]);
              
              // 🛡️ Central Cashier Gate: Do not ding for unconfirmed customer app bookings
              const isAppPendingBooking = (newBk.booking_source === 'customer_app' || !newBk.booking_source) && (newBk.status || '').toLowerCase() === 'pending';
              if (soundEnabled && !isAppPendingBooking) {
                try {
                  playBeepSound('kitchen_order_ding');
                } catch {}
              }
            } else if (payload.eventType === 'UPDATE') {
              const updated = payload.new;
              setBookings((prev) => {
                const existing = prev.find((b) => b.id === updated.id);
                const wasAppPending = existing && (existing.booking_source === 'customer_app' || !existing.booking_source) && (existing.status || '').toLowerCase() === 'pending';
                const isNowConfirmed = (updated.status || '').toLowerCase() === 'confirmed' || (updated.status || '').toLowerCase() === 'in_progress';

                // 🔔 Ring in Salon when Cashier confirms the booking!
                if (soundEnabled && wasAppPending && isNowConfirmed) {
                  try {
                    playBeepSound('kitchen_order_ding');
                  } catch {}
                }
                return prev.map((b) => (b.id === updated.id || b.booking_number === updated.booking_number ? { ...b, ...updated } : b));
              });
            } else if (payload.eventType === 'DELETE') {
              setBookings((prev) => prev.filter((b) => b.id !== payload.old?.id));
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) {
        const supabase = getSupabaseClient();
        if (supabase) supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [store?.id, soundEnabled]);

  // Subscribe to In-Memory Events (ORDER_CREATED, ORDER_STATUS_UPDATED)
  useEffect(() => {
    const unsubscribe = LoyaltyEvents.listen((payload) => {
      if (payload.storeId !== store.id) return;

      if (payload.type === 'ORDER_CREATED' && payload.orderData) {
        const newOrder = payload.orderData;
        setOrders((prev) => {
          if (prev.some((o) => o.id === newOrder.id)) return prev;
          return [newOrder, ...prev];
        });

        if (soundEnabled && hasKitchenItems(newOrder)) {
          try {
            playBeepSound('kitchen_order_ding');
          } catch {}
        }
      } else if (payload.type === 'ORDER_STATUS_UPDATED' && payload.orderData) {
        const updated = payload.orderData;
        setOrders((prev) =>
          prev.map((o) => (o.id === updated.id || o.order_number === updated.order_number ? { ...o, status: updated.status } : o))
        );
      } else if (payload.type === 'BOOKING_STATUS_UPDATED' && payload.bookingData) {
        const updated = payload.bookingData;
        setBookings((prev) =>
          prev.map((b) => (b.id === updated.id || b.booking_number === updated.booking_number ? { ...b, ...updated } : b))
        );
      }
    });

    return () => {
      unsubscribe();
    };
  }, [store.id, soundEnabled]);

  // Toggle Sound Setting
  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('radar_kds_sound', String(next));
      if (next) playBeepSound('notification');
      return next;
    });
  };

  // Toggle Fullscreen Mode
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  // Check / Uncheck item in checklist
  const toggleCheckItem = (orderId: string, idx: number) => {
    const key = `${orderId}_${idx}`;
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper: Elapsed time calculation & urgency levels
  const getElapsedInfo = (createdAt: string) => {
    const diffMs = currentTime.getTime() - new Date(createdAt).getTime();
    const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
    const totalSeconds = Math.max(0, Math.floor((diffMs % 60000) / 1000));
    const formatted = `${totalMinutes}:${totalSeconds < 10 ? '0' : ''}${totalSeconds}`;

    let level: 'normal' | 'warning' | 'urgent' = 'normal';
    if (totalMinutes >= 10) {
      level = 'urgent'; // red pulse
    } else if (totalMinutes >= 5) {
      level = 'warning'; // amber
    }

    return { totalMinutes, formatted, level };
  };

  // Handle Order Status Transitions
  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    // ⚡ 1. Optimistic Instant UI Update (0ms latency on screen)
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId || o.order_number === orderId ? { ...o, status: nextStatus } : o))
    );

    if (nextStatus === 'ready') {
      playBeepSound('success');
      confetti({
        particleCount: 50,
        spread: 50,
        origin: { y: 0.7 },
        colors: ['#10B981', '#38BDF8', '#F59E0B'],
      });
    } else {
      playBeepSound('commission');
    }

    try {
      const staffName = activeStaff?.name || 'شاشة المطبخ (KDS)';
      const branchId = activeBranch?.id || null;
      const branchName = activeBranch?.name || null;

      await LoyaltyService.updateOrderStatus(orderId, nextStatus, staffName, branchId, branchName);
    } catch (err) {
      console.error('Failed to update order status in KDS:', err);
    }
  };

  // Print Kitchen Chit
  const handlePrintChit = (order: any) => {
    setPrintingOrder(order);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Print Booking Service Chit
  const handlePrintBookingChit = (b: ServiceBooking) => {
    setPrintingBooking(b);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Handle Booking Status Transitions
  const handleUpdateBookingStatus = async (
    bookingId: string,
    nextStatus: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
  ) => {
    // ⚡ 1. Optimistic Instant UI Update (0ms latency on screen)
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId || b.booking_number === bookingId ? { ...b, status: nextStatus } : b))
    );

    if (nextStatus === 'completed') {
      playBeepSound('success');
      confetti({
        particleCount: 50,
        spread: 50,
        origin: { y: 0.7 },
        colors: ['#A855F7', '#EC4899', '#38BDF8'],
      });
    } else {
      playBeepSound('commission');
    }

    try {
      const staffName = activeStaff?.name || 'شاشة الخدمات (KDS)';
      const branchId = selectedBranchId !== 'ALL' ? selectedBranchId : null;
      const branchName = branches.find((b) => b.id === branchId)?.name || null;

      await LoyaltyService.updateServiceBookingStatus(bookingId, nextStatus, staffName, branchId, branchName);
    } catch (err) {
      console.error('Failed to update booking status in KDS:', err);
    }
  };

  // Filtered Orders for the KDS (Kitchen & Bar)
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 0. Exclude orders that contain ONLY services (e.g. Salon, Haircuts, Spa)
      // The Kitchen/Bar display is exclusively for food, beverages, and kitchen items.
      if (!hasKitchenItems(order)) return false;

      // 🛡️ Central Cashier Gate (Option 2): Customer App orders must be approved by Cashier first!
      // If an order came from customer_app (or has no cashier_id) and is still 'pending',
      // it must NOT appear in the Kitchen until the Cashier approves it.
      const isFromApp = order.order_source === 'customer_app' || (!order.order_source && !order.cashier_id);
      const isPendingApproval = (order.status || '').toLowerCase() === 'pending';
      if (isFromApp && isPendingApproval) {
        return false;
      }

      // 1. Branch Filter
      if (selectedBranchId !== 'ALL' && order.branch_id) {
        if (order.branch_id !== selectedBranchId) return false;
      }

      // 2. Fulfillment Filter
      if (fulfillmentFilter !== 'ALL') {
        const oType = (order.order_type || '').toLowerCase();
        if (fulfillmentFilter === 'dine_in' && oType !== 'dine_in') return false;
        if (fulfillmentFilter === 'takeaway' && oType !== 'takeaway') return false;
        if (fulfillmentFilter === 'car' && oType !== 'car') return false;
      }

      // 3. Station Filter
      if (stationFilter !== 'ALL') {
        const items = (Array.isArray(order.items) ? order.items : []).filter((it: any) => !isServiceItem(it));
        const hasMatchingItem = items.some((it: any) => {
          const cat = (it.category || '').toLowerCase();
          const name = (it.name || '').toLowerCase();
          if (stationFilter === 'BARISTA') {
            return (
              cat.includes('قهوة') ||
              cat.includes('مشروب') ||
              cat.includes('عصير') ||
              cat.includes('شاي') ||
              cat.includes('بار') ||
              name.includes('قهوة') ||
              name.includes('لاتيه') ||
              name.includes('ماتشا')
            );
          }
          if (stationFilter === 'BAKERY') {
            return (
              cat.includes('حلى') ||
              cat.includes('كيك') ||
              cat.includes('مخبوز') ||
              cat.includes('سويت') ||
              name.includes('كيك') ||
              name.includes('كرواسون') ||
              name.includes('كوكيز')
            );
          }
          if (stationFilter === 'KITCHEN') {
            return (
              cat.includes('وجب') ||
              cat.includes('ساندوتش') ||
              cat.includes('برجر') ||
              cat.includes('مطبخ') ||
              cat.includes('شاورما') ||
              cat.includes('طبق')
            );
          }
          return true;
        });
        if (!hasMatchingItem) return false;
      }

      // 4. Tab Filter (Active vs Completed)
      const st = (order.status || '').toLowerCase();
      if (ticketTab === 'active') {
        return st === 'pending' || st === 'accepted' || st === 'preparing' || st === 'ready';
      } else {
        return st === 'completed' || st === 'cancelled' || st === 'refunded';
      }
    });
  }, [orders, selectedBranchId, fulfillmentFilter, stationFilter, ticketTab]);

  // Filtered Bookings for Salon / Services Display
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // 1. Branch Filter
      if (selectedBranchId !== 'ALL' && b.branch_id) {
        if (b.branch_id !== selectedBranchId) return false;
      }

      // 🛡️ Central Cashier Gate (Option 2): Customer App bookings must be confirmed by Cashier first!
      // While status is 'pending' from customer_app, it stays in Cashier review queue and is hidden from live salon.
      const isAppBooking = b.booking_source === 'customer_app' || !b.booking_source;
      const isPendingAppBooking = (b.status || '').toLowerCase() === 'pending';
      if (isAppBooking && isPendingAppBooking) {
        return false;
      }

      // 2. Date Filter
      if (bookingDateFilter === 'today') {
        const rawDate = b.booking_date ? String(b.booking_date) : '';
        const bDatePart = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;

        const now = new Date();
        const localYear = now.getFullYear();
        const localMonth = String(now.getMonth() + 1).padStart(2, '0');
        const localDay = String(now.getDate()).padStart(2, '0');
        const localToday = `${localYear}-${localMonth}-${localDay}`;
        const utcToday = now.toISOString().split('T')[0];

        let isMatch = bDatePart === localToday || bDatePart === utcToday;
        if (!isMatch && rawDate) {
          try {
            const bD = new Date(rawDate);
            const bLocal = `${bD.getFullYear()}-${String(bD.getMonth() + 1).padStart(2, '0')}-${String(bD.getDate()).padStart(2, '0')}`;
            if (bLocal === localToday || bLocal === utcToday) isMatch = true;
          } catch {}
        }
        if (!isMatch) return false;
      }

      // 3. Specialist Filter
      if (specialistFilter !== 'ALL') {
        if (b.specialist_name !== specialistFilter && b.specialist_id !== specialistFilter) return false;
      }

      // 4. Tab Filter
      const st = (b.status || 'pending').toLowerCase();
      if (ticketTab === 'active') {
        return st === 'pending' || st === 'confirmed' || st === 'in_progress';
      } else {
        return st === 'completed' || st === 'cancelled' || st === 'no_show';
      }
    });
  }, [bookings, selectedBranchId, bookingDateFilter, specialistFilter, ticketTab]);

  // Group active orders for Kanban
  const kanbanColumns = useMemo(() => {
    const pendingOrders = filteredOrders.filter(
      (o) => (o.status || '').toLowerCase() === 'pending' || (o.status || '').toLowerCase() === 'accepted'
    );
    const preparingOrders = filteredOrders.filter(
      (o) => (o.status || '').toLowerCase() === 'preparing'
    );
    const readyOrders = filteredOrders.filter(
      (o) => (o.status || '').toLowerCase() === 'ready'
    );

    return { pendingOrders, preparingOrders, readyOrders };
  }, [filteredOrders]);

  // Group active bookings for Kanban
  const kanbanBookingColumns = useMemo(() => {
    // Column 1: Confirmed today & waiting for customer arrival
    const waitingArrivalBookings = filteredBookings.filter((b) => {
      const st = (b.status || '').toLowerCase();
      return st === 'confirmed' || st === 'pending';
    });
    // Column 2: Customer has arrived and is currently in service on the chair
    const inProgressBookings = filteredBookings.filter(
      (b) => (b.status || '').toLowerCase() === 'in_progress'
    );
    // Column 3: Completed today
    const completedBookings = bookings.filter((b) => {
      if (selectedBranchId !== 'ALL' && b.branch_id && b.branch_id !== selectedBranchId) return false;
      return (b.status || '').toLowerCase() === 'completed';
    });
    return { waitingArrivalBookings, inProgressBookings, completedBookings };
  }, [filteredBookings, bookings, selectedBranchId]);

  // Unique specialists list
  const uniqueSpecialists = useMemo(() => {
    const set = new Set<string>();
    bookings.forEach((b) => {
      if (b.specialist_name) set.add(b.specialist_name);
    });
    return Array.from(set);
  }, [bookings]);

  // Counts summary
  const activeCount =
    displayMode === 'services'
      ? bookings.filter((b) => {
          if (selectedBranchId !== 'ALL' && b.branch_id && b.branch_id !== selectedBranchId) return false;
          const isAppBooking = b.booking_source === 'customer_app' || !b.booking_source;
          const isPending = (b.status || '').toLowerCase() === 'pending';
          if (isAppBooking && isPending) return false;
          return ['pending', 'confirmed', 'in_progress'].includes((b.status || '').toLowerCase());
        }).length
      : orders.filter((o) => {
          if (selectedBranchId !== 'ALL' && o.branch_id && o.branch_id !== selectedBranchId) return false;
          if (!hasKitchenItems(o)) return false;
          const isFromApp = o.order_source === 'customer_app' || (!o.order_source && !o.cashier_id);
          const isPending = (o.status || '').toLowerCase() === 'pending';
          if (isFromApp && isPending) return false;
          return ['pending', 'accepted', 'preparing', 'ready'].includes((o.status || '').toLowerCase());
        }).length;

  const urgentCount =
    displayMode === 'services'
      ? 0
      : orders.filter((o) => {
          if (selectedBranchId !== 'ALL' && o.branch_id && o.branch_id !== selectedBranchId) return false;
          if (!hasKitchenItems(o)) return false;
          if (!['pending', 'accepted', 'preparing'].includes((o.status || '').toLowerCase())) return false;
          const diffMin = (currentTime.getTime() - new Date(o.created_at).getTime()) / 60000;
          return diffMin >= 10;
        }).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col overflow-hidden font-sans select-none">
      
      {/* 🧭 KDS MASTER TOP BAR */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg z-20">
        
        {/* Left: Brand & Station Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black">
            {displayMode === 'services' ? <Scissors className="w-5 h-5" /> : <ChefHat className="w-5 h-5" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                {displayMode === 'services' ? 'شاشة صالة الخدمات والمواعيد' : 'شاشة المطبخ والبار (KDS)'}
              </h2>
              <span className="text-[11px] bg-slate-800 text-amber-300 px-2.5 py-0.5 rounded-full font-bold border border-slate-700 flex items-center gap-1 shadow-sm">
                <Building2 className="w-3 h-3 text-amber-400" />
                {currentBranchName}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {displayMode === 'services'
                ? 'متابعة مباشرة للمواعيد الحية وحضور العملاء وتنفيذ الخدمات لحظياً'
                : 'استقبال وتجهيز الطلبات لحظياً مع مؤقتات دقيقة وتنبيهات صوتية للمطبخ'}
            </p>
          </div>
        </div>

        {/* Center: Live Kitchen Clock & Urgent Alert */}
        <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-1.5">
          <div className="flex items-center gap-1.5 text-slate-300 font-mono text-sm font-bold">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>
              {currentTime.toLocaleTimeString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="text-amber-400 font-mono font-black">{activeCount} نشطة</span>
            {urgentCount > 0 && (
              <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full text-[10px] animate-pulse flex items-center gap-1">
                <Flame className="w-3 h-3 text-rose-400" />
                {urgentCount} متأخرة
              </span>
            )}
          </div>
        </div>

        {/* Right: Station Filters & Quick Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Copy Direct KDS Link */}
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              if (selectedBranchId !== 'ALL') params.set('branch', selectedBranchId);
              if (displayMode === 'services') params.set('mode', 'services');
              const q = params.toString() ? '?' + params.toString() : '';
              const url = `${window.location.origin}/${store.slug}/kds${q}`;
              navigator.clipboard.writeText(url);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 flex items-center gap-1.5 transition"
            title="نسخ الرابط المباشر لشاشة العرض"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
            <span className="hidden sm:inline">{copiedLink ? 'تم النسخ!' : 'نسخ الرابط'}</span>
          </button>

          {displayMode === 'services' ? (
            <>
              {/* Specialist Selector for Salon */}
              {uniqueSpecialists.length > 0 && (
                <select
                  value={specialistFilter}
                  onChange={(e) => setSpecialistFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-300 outline-none focus:border-amber-400"
                >
                  <option value="ALL">✂️ جميع المختصين</option>
                  {uniqueSpecialists.map((sp) => (
                    <option key={sp} value={sp}>
                      👤 {sp}
                    </option>
                  ))}
                </select>
              )}

              {/* Date Filter: Today vs All */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setBookingDateFilter('today')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    bookingDateFilter === 'today' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  اليوم
                </button>
                <button
                  type="button"
                  onClick={() => setBookingDateFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    bookingDateFilter === 'all' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  كافة الأيام
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Station Selector */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setStationFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                    stationFilter === 'ALL'
                      ? 'bg-amber-500 text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>الكل</span>
                </button>
                <button
                  onClick={() => setStationFilter('BARISTA')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                    stationFilter === 'BARISTA'
                      ? 'bg-amber-500 text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Coffee className="w-3 h-3" />
                  <span>البار</span>
                </button>
                <button
                  onClick={() => setStationFilter('KITCHEN')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                    stationFilter === 'KITCHEN'
                      ? 'bg-amber-500 text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Utensils className="w-3 h-3" />
                  <span>المطبخ</span>
                </button>
                <button
                  onClick={() => setStationFilter('BAKERY')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                    stationFilter === 'BAKERY'
                      ? 'bg-amber-500 text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Cake className="w-3 h-3" />
                  <span>الحلويات</span>
                </button>
              </div>

              {/* Fulfillment Filter (Dine-in / Takeaway / Car) */}
              <select
                value={fulfillmentFilter}
                onChange={(e: any) => setFulfillmentFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-300 outline-none focus:border-amber-400"
              >
                <option value="ALL">جميع الاستلام</option>
                <option value="dine_in">🍽️ محلي</option>
                <option value="takeaway">🥡 سفري</option>
                <option value="car">🚗 استلام سيارة</option>
              </select>
            </>
          )}

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            className={`p-2 rounded-xl border transition ${
              soundEnabled
                ? 'bg-slate-800 text-amber-400 border-amber-500/30 hover:bg-slate-700'
                : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'تنبيهات الصوت مفعلة' : 'تنبيهات الصوت مكتومة'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => {
              setRefreshing(true);
              loadOrders(true);
            }}
            disabled={refreshing}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
            title="تحديث الطلبات"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition hidden sm:flex"
            title="ملء الشاشة"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close KDS View */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 transition"
              title="إغلاق والعودة للكاشير"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* 📊 TAB BAR: Active Tickets vs Archived */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-4 sm:px-6 py-2 flex items-center justify-between text-xs font-bold">
        <div className="flex items-center gap-2">
          {displayMode === 'services' ? (
            <>
              <button
                onClick={() => setTicketTab('active')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                  ticketTab === 'active'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>مواعيد اليوم النشطة</span>
                <span className="w-5 h-5 rounded-full bg-amber-500 text-black text-[10px] flex items-center justify-center font-black">
                  {filteredBookings.length}
                </span>
              </button>

              <button
                onClick={() => setTicketTab('completed')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                  ticketTab === 'completed'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>سجل المواعيد المكتملة</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setTicketTab('active')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                  ticketTab === 'active'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>الطلبات النشطة للتجهيز</span>
                <span className="w-5 h-5 rounded-full bg-amber-500 text-black text-[10px] flex items-center justify-center font-black">
                  {filteredOrders.length}
                </span>
              </button>

              <button
                onClick={() => setTicketTab('completed')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                  ticketTab === 'completed'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>سجل الطلبات المسلمة اليوم</span>
              </button>
            </>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
              viewMode === 'kanban' ? 'bg-slate-800 text-white shadow' : 'text-slate-500'
            }`}
          >
            أعمدة (Kanban)
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
              viewMode === 'grid' ? 'bg-slate-800 text-white shadow' : 'text-slate-500'
            }`}
          >
            شبكة بطاقات (Grid)
          </button>
        </div>
      </div>

      {/* 🚀 MAIN CONTENT WORKSPACE */}
      <main className="flex-1 overflow-x-auto overflow-y-auto p-4 sm:p-5 bg-slate-950">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold">
              {displayMode === 'services' ? 'جاري تحميل شاشة المواعيد والخدمات...' : 'جاري تحميل شاشة المطبخ والبار...'}
            </p>
          </div>
        ) : displayMode === 'services' ? (
          /* ======================================================== */
          /* ✂️ SALON / CARE SERVICES DISPLAY WORKSPACE                */
          (viewMode === 'kanban' && ticketTab === 'active'
            ? (kanbanBookingColumns.waitingArrivalBookings.length === 0 &&
               kanbanBookingColumns.inProgressBookings.length === 0 &&
               kanbanBookingColumns.completedBookings.length === 0)
            : filteredBookings.length === 0) ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3 text-center border-2 border-dashed border-slate-800 rounded-3xl p-8">
              <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl">
                ✂️
              </div>
              <h3 className="text-lg font-black text-slate-300">صالة الخدمات والمواعيد جاهزة بانتظار الحجوزات</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                لا توجد أي حجوزات أو مواعيد تحت الإجراء حالياً. ستظهر المواعيد المعتمدة هنا فور تأكيدها من الكاشير أو تسجيلها بالفرع.
              </p>
            </div>
          ) : viewMode === 'kanban' && ticketTab === 'active' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full min-w-[900px]">
              {/* COLUMN 1: CONFIRMED / WAITING FOR ARRIVAL (🟡 مواعيد مؤكدة اليوم / بانتظار الحضور) */}
              <div className="bg-slate-900/60 border border-amber-500/30 rounded-3xl p-3 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-amber-500/20 px-2 shrink-0">
                  <span className="font-black text-xs text-amber-300 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                    المواعيد المؤكدة اليوم (بانتظار الحضور)
                  </span>
                  <span className="text-xs font-mono font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full">
                    {kanbanBookingColumns.waitingArrivalBookings.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {kanbanBookingColumns.waitingArrivalBookings.map((booking) => (
                    <ServiceBookingChitCard
                      key={booking.id}
                      booking={booking}
                      onUpdateStatus={handleUpdateBookingStatus}
                      onPrintChit={handlePrintBookingChit}
                    />
                  ))}
                </div>
              </div>

              {/* COLUMN 2: IN PROGRESS / ATTENDED (🟣 تم الحضور / قيد التنفيذ الآن) */}
              <div className="bg-slate-900/60 border border-purple-500/30 rounded-3xl p-3 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-purple-500/20 px-2 shrink-0">
                  <span className="font-black text-xs text-purple-300 flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                    تم الحضور / قيد التنفيذ الآن
                  </span>
                  <span className="text-xs font-mono font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2.5 py-0.5 rounded-full">
                    {kanbanBookingColumns.inProgressBookings.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {kanbanBookingColumns.inProgressBookings.map((booking) => (
                    <ServiceBookingChitCard
                      key={booking.id}
                      booking={booking}
                      onUpdateStatus={handleUpdateBookingStatus}
                      onPrintChit={handlePrintBookingChit}
                    />
                  ))}
                </div>
              </div>

              {/* COLUMN 3: COMPLETED (🟢 خدمات مكتملة اليوم) */}
              <div className="bg-slate-900/60 border border-emerald-500/30 rounded-3xl p-3 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20 px-2 shrink-0">
                  <span className="font-black text-xs text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    خدمات مكتملة اليوم
                  </span>
                  <span className="text-xs font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                    {kanbanBookingColumns.completedBookings.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {kanbanBookingColumns.completedBookings.map((booking) => (
                    <ServiceBookingChitCard
                      key={booking.id}
                      booking={booking}
                      onUpdateStatus={handleUpdateBookingStatus}
                      onPrintChit={handlePrintBookingChit}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredBookings.map((booking) => (
                <ServiceBookingChitCard
                  key={booking.id}
                  booking={booking}
                  onUpdateStatus={handleUpdateBookingStatus}
                  onPrintChit={handlePrintBookingChit}
                />
              ))}
            </div>
          )
        ) : (
          /* ======================================================== */
          /* 👨‍🍳 KITCHEN ORDERS WORKSPACE                              */
          /* ======================================================== */
          filteredOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3 text-center border-2 border-dashed border-slate-800 rounded-3xl p-8">
              <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl">
                ☕
              </div>
              <h3 className="text-lg font-black text-slate-300">المطبخ والبار جاهز بانتظار الطلبات</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                لا توجد أي طلبات حالياً تحت التجهيز. ستظهر الطلبات الجديدة هنا فور تسجيلها مع نغمة تنبيه صوتية.
              </p>
            </div>
          ) : viewMode === 'kanban' && ticketTab === 'active' ? (
            /* ======================================================== */
            /* 🍱 KANBAN 3-COLUMN VIEW (جديد / قيد التحضير / جاهز)      */
            /* ======================================================== */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full min-w-[900px]">
              
              {/* COLUMN 1: NEW / PENDING (🟡 جديد) */}
              <div className="bg-slate-900/60 border border-amber-500/30 rounded-3xl p-3 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-amber-500/20 px-2 shrink-0">
                  <span className="font-black text-xs text-amber-300 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                    جديد / بانتظار البدء
                  </span>
                  <span className="text-xs font-mono font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full">
                    {kanbanColumns.pendingOrders.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {kanbanColumns.pendingOrders.map((order) => (
                    <OrderChitCard
                      key={order.id}
                      order={order}
                      getElapsedInfo={getElapsedInfo}
                      checkedItems={checkedItems}
                      onToggleCheck={toggleCheckItem}
                      onUpdateStatus={handleUpdateStatus}
                      onPrintChit={handlePrintChit}
                    />
                  ))}
                </div>
              </div>

              {/* COLUMN 2: IN PREPARATION (🔵 قيد التحضير) */}
              <div className="bg-slate-900/60 border border-blue-500/30 rounded-3xl p-3 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-blue-500/20 px-2 shrink-0">
                  <span className="font-black text-xs text-blue-300 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                    قيد التحضير والتجهيز الآن
                  </span>
                  <span className="text-xs font-mono font-black bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2.5 py-0.5 rounded-full">
                    {kanbanColumns.preparingOrders.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {kanbanColumns.preparingOrders.map((order) => (
                    <OrderChitCard
                      key={order.id}
                      order={order}
                      getElapsedInfo={getElapsedInfo}
                      checkedItems={checkedItems}
                      onToggleCheck={toggleCheckItem}
                      onUpdateStatus={handleUpdateStatus}
                      onPrintChit={handlePrintChit}
                    />
                  ))}
                </div>
              </div>

              {/* COLUMN 3: READY FOR PICKUP (🟢 جاهز للتسليم) */}
              <div className="bg-slate-900/60 border border-emerald-500/30 rounded-3xl p-3 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20 px-2 shrink-0">
                  <span className="font-black text-xs text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    جاهز للاستلام والتسليم
                  </span>
                  <span className="text-xs font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                    {kanbanColumns.readyOrders.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {kanbanColumns.readyOrders.map((order) => (
                    <OrderChitCard
                      key={order.id}
                      order={order}
                      getElapsedInfo={getElapsedInfo}
                      checkedItems={checkedItems}
                      onToggleCheck={toggleCheckItem}
                      onUpdateStatus={handleUpdateStatus}
                      onPrintChit={handlePrintChit}
                    />
                  ))}
                </div>
              </div>

            </div>
          ) : (
            /* ======================================================== */
            /* 🍱 GRID VIEW (Cards Grid)                                */
            /* ======================================================== */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredOrders.map((order) => (
                <OrderChitCard
                  key={order.id}
                  order={order}
                  getElapsedInfo={getElapsedInfo}
                  checkedItems={checkedItems}
                  onToggleCheck={toggleCheckItem}
                  onUpdateStatus={handleUpdateStatus}
                  onPrintChit={handlePrintChit}
                />
              ))}
            </div>
          )
        )}
      </main>

      {/* 🖨️ Thermal Kitchen Chit Print Output (Hidden until window.print) */}
      {printingOrder && (
        <div className="hidden print:block fixed inset-0 bg-white text-black p-4 font-mono text-xs" dir="rtl">
          <div className="text-center pb-2 border-b-2 border-black">
            <h2 className="text-base font-black">{store.name}</h2>
            <h3 className="text-sm font-bold mt-1">بون تحضير المطبخ (Kitchen Chit)</h3>
            <p className="text-lg font-black mt-1">#{printingOrder.order_number}</p>
            <p className="text-[11px]">
              {new Date(printingOrder.created_at).toLocaleTimeString('ar-SA')} - {new Date(printingOrder.created_at).toLocaleDateString('ar-SA')}
            </p>
          </div>

          <div className="py-2 border-b border-black text-xs space-y-0.5">
            {printingOrder.order_type === 'dine_in' && (
              <p className="font-bold text-sm">🍽️ محلي - طاولة: {printingOrder.table_number || 'بدون رقم'}</p>
            )}
            {printingOrder.order_type === 'takeaway' && <p className="font-bold text-sm">🥡 سفري</p>}
            {printingOrder.order_type === 'car' && (
              <p className="font-bold text-sm">🚗 سيارة: {printingOrder.car_plate || '-'}</p>
            )}
            {printingOrder.customer_name && <p>العميل: {printingOrder.customer_name}</p>}
          </div>

          <div className="py-2 border-b-2 border-black space-y-2">
            <p className="font-bold text-xs pb-1 border-b border-dotted">الأصناف المطلوبة:</p>
            {(Array.isArray(printingOrder.items) ? printingOrder.items : []).map((it: any, i: number) => (
              <div key={i} className="flex justify-between items-start text-sm">
                <div>
                  <strong className="text-base font-black">{it.quantity}x {it.name}</strong>
                  {it.notes && <p className="text-xs text-slate-700 italic">ملاحظة: {it.notes}</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center pt-2 text-[10px]">
            Radar POS & Kitchen Display System
          </div>
        </div>
      )}

      {/* 🖨️ Thermal Salon Booking Chit Print Output (Hidden until window.print) */}
      {printingBooking && (
        <div className="hidden print:block fixed inset-0 bg-white text-black p-4 font-mono text-xs" dir="rtl">
          <div className="text-center pb-2 border-b-2 border-black">
            <h2 className="text-base font-black">{store.name}</h2>
            <h3 className="text-sm font-bold mt-1">تذكرة موعد خدمة (Salon Service Chit)</h3>
            <p className="text-lg font-black mt-1">#{printingBooking.booking_number}</p>
            <p className="text-[11px]">
              {printingBooking.booking_date} | {printingBooking.booking_time}
            </p>
          </div>

          <div className="py-2 border-b border-black text-xs space-y-1">
            <p className="font-bold text-sm">👤 العميل: {printingBooking.customer_name}</p>
            <p>📞 الهاتف: {printingBooking.customer_phone}</p>
            {printingBooking.specialist_name && (
              <p className="font-bold">✂️ المختص: {printingBooking.specialist_name}</p>
            )}
            {printingBooking.branch_name && (
              <p>📍 الفرع: {printingBooking.branch_name}</p>
            )}
          </div>

          <div className="py-2 border-b-2 border-black space-y-1.5">
            <p className="font-bold text-xs pb-1 border-b border-dotted">تفاصيل الخدمة:</p>
            <div className="flex justify-between items-start text-sm">
              <strong className="text-base font-black">{printingBooking.service_name}</strong>
              <span>{printingBooking.service_duration_minutes || printingBooking.duration_minutes || 30} دقيقة</span>
            </div>
            {Array.isArray(printingBooking.selected_modifiers) && printingBooking.selected_modifiers.length > 0 && (
              <div className="pt-1 text-xs text-slate-700">
                <p className="font-bold">الإضافات والترقيات:</p>
                {printingBooking.selected_modifiers.map((mod: any, idx: number) => (
                  <p key={idx}>+ {mod.name} ({mod.price || 0} ﷼)</p>
                ))}
              </div>
            )}
            {(printingBooking.notes || printingBooking.customer_notes) && (
              <p className="text-xs pt-1 border-t border-dotted mt-1">
                ملاحظات: {printingBooking.notes || printingBooking.customer_notes}
              </p>
            )}
          </div>

          <div className="text-center pt-2 text-[10px]">
            Radar POS & Salon Display System
          </div>
        </div>
      )}

    </div>
  );
};

/* ======================================================== */
/* 🎫 SUB-COMPONENT: Individual Order Chit Card             */
/* ======================================================== */
interface OrderChitCardProps {
  order: any;
  getElapsedInfo: (date: string) => { totalMinutes: number; formatted: string; level: 'normal' | 'warning' | 'urgent' };
  checkedItems: Record<string, boolean>;
  onToggleCheck: (orderId: string, idx: number) => void;
  onUpdateStatus: (orderId: string, nextStatus: string) => void;
  onPrintChit: (order: any) => void;
}

const OrderChitCard: React.FC<OrderChitCardProps> = ({
  order,
  getElapsedInfo,
  checkedItems,
  onToggleCheck,
  onUpdateStatus,
  onPrintChit,
}) => {
  const status = (order.status || 'pending').toLowerCase();
  const elapsed = getElapsedInfo(order.created_at);
  const items = (Array.isArray(order.items) ? order.items : []).filter((it: any) => !isServiceItem(it));

  // Urgency styling based on wait time
  const timerBorderClass =
    elapsed.level === 'urgent'
      ? 'border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.35)] animate-pulse'
      : elapsed.level === 'warning'
      ? 'border-amber-500/70'
      : 'border-slate-800';

  const timerBadgeClass =
    elapsed.level === 'urgent'
      ? 'bg-rose-500 text-white font-black animate-bounce'
      : elapsed.level === 'warning'
      ? 'bg-amber-500 text-black font-black'
      : 'bg-slate-800 text-emerald-400 font-bold border border-emerald-500/30';

  return (
    <div
      className={`rounded-2xl bg-slate-900 border-2 ${timerBorderClass} flex flex-col justify-between overflow-hidden shadow-lg transition-all hover:border-slate-700`}
    >
      {/* 🏷️ Ticket Header */}
      <div className="p-3 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <strong className="text-white font-mono font-black text-sm">
            #{order.order_number}
          </strong>

          {/* Fulfillment Type Badge */}
          {order.order_type === 'dine_in' && (
            <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded-full font-bold">
              🍽️ {order.table_number ? `طاولة ${order.table_number}` : 'محلي'}
            </span>
          )}
          {order.order_type === 'takeaway' && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
              🥡 سفري
            </span>
          )}
          {order.order_type === 'car' && (
            <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full font-bold">
              🚗 {order.car_plate || 'سيارة'}
            </span>
          )}
          {order.order_source === 'customer_app' && (
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              📱 معتمد من الكاشير
            </span>
          )}
        </div>

        {/* Live Elapsed Wait Timer */}
        <div
          className={`text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1 font-mono ${timerBadgeClass}`}
          title="الوقت المنقضي منذ إنشاء الطلب"
        >
          <Clock className="w-3 h-3 shrink-0" />
          <span>{elapsed.formatted}</span>
        </div>
      </div>

      {/* 📋 Ticket Items Body */}
      <div className="p-3.5 space-y-2 flex-1 overflow-y-auto max-h-[280px]">
        {items.map((item: any, idx: number) => {
          const checkKey = `${order.id}_${idx}`;
          const isChecked = Boolean(checkedItems[checkKey]);

          return (
            <div
              key={idx}
              onClick={() => onToggleCheck(order.id, idx)}
              className={`p-2 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                isChecked
                  ? 'bg-slate-950/40 border-slate-800/50 opacity-40 line-through'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition ${
                  isChecked
                    ? 'bg-emerald-500 border-emerald-500 text-black'
                    : 'border-slate-700 bg-slate-900'
                }`}
              >
                {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                    {item.name || 'منتج'}
                  </span>
                  <span className="text-xs font-mono font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md shrink-0">
                    {item.quantity}x
                  </span>
                </div>

                {item.notes && (
                  <p className="text-[10px] text-amber-300 font-semibold mt-0.5 bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-500/20 italic">
                    ملاحظة: {item.notes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 👤 Customer Info & Notes Footer */}
      {(order.customer_name || order.notes) && (
        <div className="px-3.5 py-1.5 bg-slate-950/50 border-t border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between">
          {order.customer_name && (
            <span className="truncate">العميل: <strong className="text-slate-300">{order.customer_name}</strong></span>
          )}
          {order.notes && (
            <span className="text-amber-400 font-bold truncate max-w-[150px]">"{order.notes}"</span>
          )}
        </div>
      )}

      {/* ⚡ Action Buttons Footer */}
      <div className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPrintChit(order)}
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
          title="طباعة بون المطبخ"
        >
          <Printer className="w-4 h-4" />
        </button>

        {/* Dynamic Status Progress Button */}
        {status === 'pending' || status === 'accepted' ? (
          <button
            type="button"
            onClick={() => onUpdateStatus(order.id, 'preparing')}
            className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow transition"
          >
            <Flame className="w-3.5 h-3.5 fill-current" />
            <span>بدء التحضير 👨‍🍳</span>
          </button>
        ) : status === 'preparing' ? (
          <button
            type="button"
            onClick={() => onUpdateStatus(order.id, 'ready')}
            className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow transition shadow-emerald-600/30"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>جاهز للتسليم 🚀</span>
          </button>
        ) : status === 'ready' ? (
          <button
            type="button"
            onClick={() => onUpdateStatus(order.id, 'completed')}
            className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-extrabold text-xs flex items-center justify-center gap-1.5 transition border border-emerald-500/40"
          >
            <Check className="w-3.5 h-3.5" />
            <span>تم التسليم وأرشفة ✅</span>
          </button>
        ) : (
          <span className="flex-1 py-2 text-center text-xs text-slate-500 font-bold">
            مكتمل ومؤرشف
          </span>
        )}
      </div>
    </div>
  );
};

/* ======================================================== */
/* 🎫 SUB-COMPONENT: Individual Salon Booking Chit Card     */
/* ======================================================== */
interface ServiceBookingChitCardProps {
  booking: ServiceBooking;
  onUpdateStatus: (bookingId: string, nextStatus: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show') => void;
  onPrintChit: (booking: ServiceBooking) => void;
}

const ServiceBookingChitCard: React.FC<ServiceBookingChitCardProps> = ({
  booking,
  onUpdateStatus,
  onPrintChit,
}) => {
  const status = (booking.status || 'pending').toLowerCase();
  const duration = booking.service_duration_minutes || booking.duration_minutes || 30;

  const sourceConfig = {
    customer_app: { text: 'تطبيق العميل 📱', bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
    phone_call: { text: 'اتصال هاتفي 📞', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    cashier: { text: 'الكاشير 💻', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    walk_in: { text: 'حضور مباشر 🚶', bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  }[booking.booking_source || 'customer_app'] || { text: 'حجز', bg: 'bg-slate-700 text-slate-300 border-slate-600' };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 hover:border-slate-700 transition shadow-lg overflow-hidden flex flex-col justify-between">
      {/* Top Header */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-sm text-white">#{booking.booking_number}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sourceConfig.bg}`}>
            {sourceConfig.text}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg">
          <Clock className="w-3.5 h-3.5" />
          <span>{booking.booking_time}</span>
          <span className="text-[10px] text-slate-400">({duration}د)</span>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2.5 flex-1">
        {/* Customer Info */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-200">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span>{booking.customer_name}</span>
          </div>
          {booking.customer_phone && (
            <a
              href={`tel:${booking.customer_phone}`}
              className="font-mono text-slate-400 hover:text-amber-400 transition text-[11px]"
              dir="ltr"
            >
              {booking.customer_phone}
            </a>
          )}
        </div>

        {/* Service Details */}
        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-amber-300 flex items-center gap-1.5">
              <Scissors className="w-4 h-4 text-amber-400" />
              {booking.service_name}
            </span>
            {booking.total_price ? (
              <span className="text-xs font-mono font-bold text-slate-300">
                {booking.total_price} ﷼
              </span>
            ) : null}
          </div>

          {/* Modifiers / Add-ons */}
          {Array.isArray(booking.selected_modifiers) && booking.selected_modifiers.length > 0 && (
            <div className="pt-1 border-t border-slate-800/60 flex flex-wrap gap-1">
              {booking.selected_modifiers.map((mod: any, idx: number) => (
                <span
                  key={idx}
                  className="text-[10px] bg-slate-900 text-slate-300 px-1.5 py-0.5 rounded border border-slate-800"
                >
                  +{mod.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Specialist Tag */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span>المختص المطلوب:</span>
          <span className="font-bold text-slate-200 bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/60">
            {booking.specialist_name || 'أي مختص متاح'}
          </span>
        </div>

        {/* Notes if any */}
        {(booking.notes || booking.customer_notes) && (
          <div className="text-[11px] bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 text-amber-200">
            💬 {booking.notes || booking.customer_notes}
          </div>
        )}
      </div>

      {/* Actions Footer */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPrintChit(booking)}
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
          title="طباعة تذكرة الخدمة"
        >
          <Printer className="w-4 h-4" />
        </button>

        {(status === 'confirmed' || status === 'pending') && (
          <>
            <button
              type="button"
              onClick={() => onUpdateStatus(booking.id, 'in_progress')}
              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition"
            >
              <Scissors className="w-4 h-4" />
              <span>تأكيد الحضور وبدء الخدمة</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateStatus(booking.id, 'no_show')}
              className="py-2 px-2.5 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 transition text-xs font-bold"
              title="لم يحضر العميل"
            >
              لم يحضر
            </button>
          </>
        )}

        {status === 'in_progress' && (
          <button
            type="button"
            onClick={() => onUpdateStatus(booking.id, 'completed')}
            className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>إتمام الخدمة بنجاح ✅</span>
          </button>
        )}

        {status === 'completed' && (
          <div className="flex-1 text-center py-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            تمت الخدمة بنجاح ✅
          </div>
        )}
      </div>
    </div>
  );
};

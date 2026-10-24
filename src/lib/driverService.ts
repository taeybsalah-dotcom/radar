import { StoreDriver, DriverShiftSettlement, DriverVehicleType, DriverWorkStatus, DeliveryOrderStatus, WhatsAppOrderPayload } from '../types';
import { LoyaltyEvents } from './events';
import { getSupabaseClient, isUUID, LoyaltyService } from './supabase';
import { InventoryService } from './inventoryService';

const DRIVERS_STORAGE_PREFIX = 'radar_store_drivers_';
const DRIVER_SETTLEMENTS_PREFIX = 'radar_driver_settlements_';
const PRIMARY_ORDERS_KEY = 'radar_local_whatsapp_orders';
const FALLBACK_ORDERS_KEY = 'radar_local_store_orders';

// In-flight sync debounce tracker
const lastSyncTimestampMap = new Map<string, number>();
const lastOrdersSyncTimestampMap = new Map<string, number>();

async function resolveStoreUUID(storeId: string): Promise<string> {
  if (!storeId || storeId === 'default') return storeId;
  if (isUUID(storeId)) return storeId;
  const supabase = getSupabaseClient();
  if (!supabase) return storeId;
  try {
    const { data } = await (supabase as any)
      .from('stores')
      .select('id')
      .or(`id.eq.${storeId},slug.eq.${storeId}`)
      .limit(1)
      .single();
    if (data?.id) return data.id;
  } catch {}
  return storeId;
}

async function syncOrderToSupabase(orderId: string, updates: Record<string, any>): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !orderId) return;
  try {
    if (isUUID(orderId)) {
      await (supabase as any)
        .from('store_orders')
        .update(updates)
        .or(`id.eq.${orderId},order_number.eq.${orderId}`);
    } else {
      await (supabase as any)
        .from('store_orders')
        .update(updates)
        .eq('order_number', orderId);
    }
  } catch (err) {
    console.warn('Failed to sync order to Supabase:', err);
  }
}

export function normalizeOrderRecord(raw: any): WhatsAppOrderPayload {
  const id = String(raw.order_id || raw.id || raw.order_number || '');
  const orderNumber = String(raw.order_number || raw.order_id || raw.id || '');
  const totalAmount = Number(raw.total_amount ?? raw.total_price ?? 0);
  const fulfillmentDetails = raw.fulfillment_details && typeof raw.fulfillment_details === 'object'
    ? raw.fulfillment_details
    : {};

  return {
    ...raw,
    id: raw.id || id,
    order_id: id,
    order_number: orderNumber,
    store_id: raw.store_id || 'default',
    branch_id: raw.branch_id || fulfillmentDetails.branch_id || undefined,
    branch_name: raw.branch_name || fulfillmentDetails.branch_name || undefined,
    customer_id: raw.customer_id || undefined,
    customer_name: raw.customer_name || 'عميل المتجر',
    customer_phone: raw.customer_phone || '',
    items: Array.isArray(raw.items) ? raw.items : [],
    subtotal: Number(raw.subtotal ?? totalAmount),
    discount_amount: Number(raw.discount_amount ?? 0),
    total_amount: totalAmount,
    total_price: totalAmount,
    payment_method: raw.payment_method || 'pay_at_store',
    payment_status: raw.payment_status || 'unpaid',
    fulfillment_type: raw.fulfillment_type || raw.order_type || 'delivery',
    order_type: raw.order_type || raw.fulfillment_type || 'delivery',
    fulfillment_details: {
      ...fulfillmentDetails,
      delivery_address: raw.delivery_address || fulfillmentDetails.delivery_address || '',
      delivery_gps_link: raw.delivery_gps_link || fulfillmentDetails.delivery_gps_link || '',
      delivery_fee: Number(raw.delivery_fee ?? fulfillmentDetails.delivery_fee ?? 0),
    },
    delivery_address: raw.delivery_address || fulfillmentDetails.delivery_address || '',
    delivery_gps_link: raw.delivery_gps_link || fulfillmentDetails.delivery_gps_link || '',
    delivery_distance_km: raw.delivery_distance_km !== undefined ? Number(raw.delivery_distance_km) : fulfillmentDetails.delivery_distance_km,
    delivery_tier_label: raw.delivery_tier_label || fulfillmentDetails.delivery_tier_label || undefined,
    loyalty_points_earned: Number(raw.loyalty_points_earned ?? 0),
    points_awarded: Boolean(raw.points_awarded || fulfillmentDetails.points_awarded),
    status: raw.status || 'pending',
    driver_id: raw.driver_id || fulfillmentDetails.driver_id || undefined,
    driver_name: raw.driver_name || fulfillmentDetails.driver_name || undefined,
    driver_phone: raw.driver_phone || fulfillmentDetails.driver_phone || undefined,
    delivery_status: raw.delivery_status || fulfillmentDetails.delivery_status || (raw.driver_id ? 'assigned' : 'unassigned'),
    driver_assigned_at: raw.driver_assigned_at || fulfillmentDetails.driver_assigned_at || undefined,
    driver_picked_up_at: raw.driver_picked_up_at || fulfillmentDetails.driver_picked_up_at || undefined,
    delivered_at: raw.delivered_at || fulfillmentDetails.delivered_at || undefined,
    driver_payment_method:
      raw.driver_payment_method ||
      fulfillmentDetails.driver_payment_method ||
      (raw.payment_method === 'cash'
        ? 'cash'
        : raw.payment_method === 'mada' || raw.payment_method === 'card'
        ? 'card'
        : 'online_link'),
    driver_collected_amount: Number(raw.driver_collected_amount ?? fulfillmentDetails.driver_collected_amount ?? totalAmount),
    created_at: raw.created_at || new Date().toISOString(),
  } as any;
}

function getAllStoredOrders(): WhatsAppOrderPayload[] {
  try {
    const list1 = JSON.parse(localStorage.getItem(PRIMARY_ORDERS_KEY) || '[]');
    const list2 = JSON.parse(localStorage.getItem(FALLBACK_ORDERS_KEY) || '[]');
    const map = new Map<string, WhatsAppOrderPayload>();
    [...list2, ...list1].forEach((o) => {
      if (!o) return;
      const normalized = normalizeOrderRecord(o);
      const key = String(normalized.order_id || (normalized as any).id || (normalized as any).order_number || '');
      if (key) map.set(key, normalized);
    });
    return Array.from(map.values());
  } catch {
    return [];
  }
}

function saveAllStoredOrders(orders: WhatsAppOrderPayload[]): void {
  try {
    const json = JSON.stringify(orders);
    localStorage.setItem(PRIMARY_ORDERS_KEY, json);
    localStorage.setItem(FALLBACK_ORDERS_KEY, json);
  } catch {}
}

export const INITIAL_DEMO_DRIVERS: StoreDriver[] = [
  {
    id: 'drv_demo_1',
    store_id: 'default',
    branch_id: 'b1',
    branch_name: 'الفرع الرئيسي',
    name: 'سلطان العتيبي',
    phone: '0501112233',
    vehicle_type: 'motorcycle',
    plate_number: 'أ ب د 1234',
    pin_code: '1234',
    is_active: true,
    status: 'available',
    commission_per_order: 10,
    notes: 'دراجة نارية مجهزة بصندوق حراري معزول',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'drv_demo_2',
    store_id: 'default',
    branch_id: 'b1',
    branch_name: 'الفرع الرئيسي',
    name: 'فهد الدوسري',
    phone: '0554445566',
    vehicle_type: 'car',
    plate_number: 'ر س م 5678',
    pin_code: '2222',
    is_active: true,
    status: 'available',
    commission_per_order: 15,
    notes: 'سيارة تويوتا يارس - توصيل الطلبات الكبيرة والعائلية',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'drv_demo_3',
    store_id: 'default',
    branch_id: 'b2',
    branch_name: 'فرع التحلية',
    name: 'طارق الجابري',
    phone: '0567778899',
    vehicle_type: 'motorcycle',
    plate_number: 'ط ل ق 9012',
    pin_code: '3333',
    is_active: true,
    status: 'available',
    commission_per_order: 10,
    notes: 'دراجة نارية سريعة للمنطقة المركزية',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export class DriverService {
  /** Server-side driver PIN check (bcrypt + lockout). The PIN is never read in the browser. */
  static async verifyDriverPin(storeId: string, driverId: string, pin: string): Promise<{ success: boolean; error?: string; driver?: any }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'OFFLINE' };
    const resolved = await resolveStoreUUID(String(storeId));
    const { data, error } = await (supabase as any).rpc('verify_driver_pin', {
      p_store_id: resolved,
      p_driver_id: String(driverId),
      p_pin: String(pin || '').trim(),
    });
    if (error || !data) return { success: false, error: error?.message || 'RPC_FAILED' };
    return data as any;
  }

  /**
   * ☁️ مزامنة طلبات التوصيل من قاعدة بيانات Supabase (store_orders) إلى الكاش المحلي
   * ليتمكن المندوب من رؤية الطلبات المسندة إليه من أي جوال أو جهاز آخر لحظياً
   */
  static async syncOrdersWithSupabase(storeId: string, force = false): Promise<WhatsAppOrderPayload[]> {
    const cleanStoreId = storeId || 'default';
    const now = Date.now();
    const lastSync = lastOrdersSyncTimestampMap.get(cleanStoreId) || 0;
    if (!force && now - lastSync < 2000) {
      return getAllStoredOrders();
    }
    lastOrdersSyncTimestampMap.set(cleanStoreId, now);

    try {
      const resolvedStoreId = await resolveStoreUUID(cleanStoreId);
      const supabase = getSupabaseClient();
      if (supabase && isUUID(resolvedStoreId)) {
        const { data, error } = await (supabase as any)
          .from('store_orders')
          .select('*')
          .eq('store_id', resolvedStoreId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (!error && Array.isArray(data) && data.length > 0) {
          const existing = getAllStoredOrders();
          const map = new Map<string, WhatsAppOrderPayload>();

          existing.forEach((o) => {
            const key = String(o.order_id || (o as any).id || (o as any).order_number || '');
            if (key) map.set(key, o);
          });

          data.forEach((row: any) => {
            const normalized = normalizeOrderRecord(row);
            const key = String(normalized.order_id || (normalized as any).id || (normalized as any).order_number || '');
            if (key) {
              const prev = map.get(key);
              map.set(key, prev ? { ...prev, ...normalized } : normalized);
            }
          });

          const merged = Array.from(map.values());
          saveAllStoredOrders(merged);
          return merged;
        }
      }
    } catch (err) {
      console.warn('DriverService.syncOrdersWithSupabase warning:', err);
    }

    return getAllStoredOrders();
  }

  /**
   * تحديث أو إدراج طلب في الكاش المحلي مباشرة (مفيد عند استدعاء الكاشير لطلب أونلاين قادم من جهاز العميل)
   */
  static upsertOrderInCache(rawOrder: any): WhatsAppOrderPayload {
    const normalized = normalizeOrderRecord(rawOrder);
    const orders = getAllStoredOrders();
    const key = String(normalized.order_id || (normalized as any).id || (normalized as any).order_number || '');
    const idx = orders.findIndex(
      (o) =>
        o.order_id === key ||
        (o as any).id === key ||
        (o as any).order_number === key ||
        (normalized as any).order_number && (o as any).order_number === (normalized as any).order_number
    );
    if (idx !== -1) {
      orders[idx] = { ...orders[idx], ...normalized };
      saveAllStoredOrders(orders);
      return orders[idx];
    } else {
      orders.unshift(normalized);
      saveAllStoredOrders(orders);
      return normalized;
    }
  }

  /**
   * جلب قائمة السائقين من قاعدة بيانات Supabase ومزامنتها محلياً
   */
  static async syncWithSupabase(storeId: string): Promise<StoreDriver[]> {
    const cleanStoreId = storeId || 'default';
    const now = Date.now();
    const lastSync = lastSyncTimestampMap.get(cleanStoreId) || 0;
    
    // Don't sync more frequently than once every 2 seconds unless forced
    if (now - lastSync < 2000) {
      return this.getDrivers(cleanStoreId);
    }
    lastSyncTimestampMap.set(cleanStoreId, now);

    try {
      const resolvedStoreId = await resolveStoreUUID(cleanStoreId);
      const supabase = getSupabaseClient();
      if (supabase && isUUID(resolvedStoreId)) {
        const { data, error } = await (supabase as any)
          .from('store_drivers')
          .select('id, store_id, branch_id, branch_name, name, phone, vehicle_type, plate_number, is_active, status, auto_break_after_delivery, current_trip_orders_count, current_trip_order_ids, estimated_return_minutes, last_status_change_at, commission_per_order, notes, created_at, updated_at')
          .eq('store_id', resolvedStoreId)
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data)) {
          if (data.length > 0) {
            const list: StoreDriver[] = data.map((d: any) => ({
              id: String(d.id),
              store_id: String(d.store_id),
              branch_id: d.branch_id || 'b1',
              branch_name: d.branch_name || 'الفرع الرئيسي',
              name: d.name,
              phone: d.phone,
              vehicle_type: d.vehicle_type || 'motorcycle',
              plate_number: d.plate_number || '',
              pin_code: '', // never fetched from server (hashed + column revoked)
              is_active: d.is_active !== false,
              status: d.status || 'available',
              auto_break_after_delivery: !!d.auto_break_after_delivery,
              current_trip_orders_count: Number(d.current_trip_orders_count) || 0,
              current_trip_order_ids: Array.isArray(d.current_trip_order_ids) ? d.current_trip_order_ids : [],
              estimated_return_minutes: Number(d.estimated_return_minutes) || 0,
              last_status_change_at: d.last_status_change_at,
              commission_per_order: Number(d.commission_per_order) || 0,
              notes: d.notes || '',
              created_at: d.created_at || new Date().toISOString(),
              updated_at: d.updated_at || new Date().toISOString(),
            }));

            localStorage.setItem(`${DRIVERS_STORAGE_PREFIX}${cleanStoreId}`, JSON.stringify(list));
            if (resolvedStoreId !== cleanStoreId) {
              localStorage.setItem(`${DRIVERS_STORAGE_PREFIX}${resolvedStoreId}`, JSON.stringify(list));
            }

            LoyaltyEvents.emit({
              type: 'DRIVERS_UPDATED',
              storeId: cleanStoreId,
            });

            return list;
          } else {
            // Seed initial store drivers into Supabase if empty
            const currentLocal = this.getDrivers(cleanStoreId);
            if (currentLocal.length > 0) {
              const suffix = resolvedStoreId.slice(0, 6);
              const seedRows = currentLocal.map((d) => ({
                id: d.id.startsWith('drv_demo_') ? `${d.id}_${suffix}` : d.id,
                store_id: resolvedStoreId,
                branch_id: d.branch_id || 'b1',
                branch_name: d.branch_name || 'الفرع الرئيسي',
                name: d.name,
                phone: d.phone,
                vehicle_type: d.vehicle_type || 'motorcycle',
                plate_number: d.plate_number || '',
                pin_code: d.pin_code || '1234',
                is_active: d.is_active !== false,
                status: d.status || 'available',
                commission_per_order: Number(d.commission_per_order) || 0,
                notes: d.notes || '',
                updated_at: new Date().toISOString(),
              }));
              await (supabase as any).from('store_drivers').upsert(seedRows, { onConflict: 'id' });
            }
          }
        }
      }
    } catch (err) {
      console.warn('DriverService.syncWithSupabase warning:', err);
    }

    return this.getDrivers(cleanStoreId);
  }

  /**
   * جلب قائمة السائقين مع دعم الفلترة حسب الفرع التابع له السائق
   */
  static getDrivers(storeId: string, branchId?: string | null): StoreDriver[] {
    const cleanStoreId = storeId || 'default';
    const key = `${DRIVERS_STORAGE_PREFIX}${cleanStoreId}`;
    let list: StoreDriver[] = [];

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        list = JSON.parse(raw);
      } else {
        // تهيئة السائقين الافتراضيين
        list = INITIAL_DEMO_DRIVERS.map((d) => ({
          ...d,
          store_id: cleanStoreId,
        }));
        localStorage.setItem(key, JSON.stringify(list));
      }
    } catch {
      list = INITIAL_DEMO_DRIVERS;
    }

    // Trigger background sync if not synced recently
    const lastSync = lastSyncTimestampMap.get(cleanStoreId) || 0;
    if (Date.now() - lastSync > 5000) {
      this.syncWithSupabase(cleanStoreId).catch(() => {});
    }

    if (branchId && branchId !== 'ALL') {
      const filtered = list.filter((d) => {
        if (!d.branch_id || d.branch_id === 'ALL') return true;
        if (d.branch_id === branchId) return true;
        return false;
      });

      // If matches found for this specific branch, return them
      if (filtered.length > 0) {
        return filtered;
      }

      // Smart Fallback: If no drivers explicitly matched branchId (e.g. branchId is UUID and drivers have demo 'b1' or vice versa),
      // return all active drivers for this store so cashier and customers are never left with 0 drivers!
      return list.filter((d) => d.is_active !== false);
    }

    return list;
  }

  /**
   * حفظ أو تعديل سائق وحفظه في كل من التخزين المحلي وقاعدة بيانات Supabase
   */
  static saveDriver(storeId: string, driverData: Partial<StoreDriver>): StoreDriver {
    const cleanStoreId = storeId || 'default';
    const list = this.getDrivers(cleanStoreId);
    const nowIso = new Date().toISOString();

    let target: StoreDriver;
    const existingIdx = list.findIndex((d) => d.id === driverData.id);

    if (existingIdx !== -1) {
      target = {
        ...list[existingIdx],
        ...driverData,
        updated_at: nowIso,
      };
      list[existingIdx] = target;
    } else {
      target = {
        id: driverData.id || `drv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        store_id: cleanStoreId,
        branch_id: driverData.branch_id || 'b1',
        branch_name: driverData.branch_name || 'الفرع الرئيسي',
        name: (driverData.name || 'سائق جديد').trim(),
        phone: (driverData.phone || '').trim(),
        vehicle_type: driverData.vehicle_type || 'motorcycle',
        plate_number: driverData.plate_number || '',
        pin_code: driverData.pin_code || '1234',
        is_active: driverData.is_active !== false,
        status: driverData.status || 'available',
        commission_per_order: Number(driverData.commission_per_order) || 0,
        notes: driverData.notes || '',
        created_at: nowIso,
        updated_at: nowIso,
      };
      list.push(target);
    }

    localStorage.setItem(`${DRIVERS_STORAGE_PREFIX}${cleanStoreId}`, JSON.stringify(list));

    LoyaltyEvents.emit({
      type: 'DRIVERS_UPDATED',
      storeId: cleanStoreId,
    });

    // Asynchronously save to Supabase
    (async () => {
      try {
        const resolvedStoreId = await resolveStoreUUID(cleanStoreId);
        const supabase = getSupabaseClient();
        if (supabase && isUUID(resolvedStoreId)) {
          const payload: any = {
            id: target.id,
            store_id: resolvedStoreId,
            branch_id: target.branch_id,
            branch_name: target.branch_name,
            name: target.name,
            phone: target.phone,
            vehicle_type: target.vehicle_type,
            plate_number: target.plate_number,
            ...(target.pin_code && !String(target.pin_code).startsWith('$2') ? { pin_code: target.pin_code } : {}),
            is_active: target.is_active,
            status: target.status,
            commission_per_order: target.commission_per_order,
            notes: target.notes,
            updated_at: nowIso,
          };

          if (existingIdx !== -1) {
            await (supabase as any).from('store_drivers').update(payload).eq('id', target.id);
          } else {
            const { error: insErr } = await (supabase as any).from('store_drivers').insert([payload]);
            if (insErr) {
              await (supabase as any).from('store_drivers').update(payload).eq('id', target.id);
            }
          }
        }
      } catch (e) {
        console.warn('DriverService.saveDriver Supabase sync error:', e);
      }
    })();

    return target;
  }

  /**
   * حذف سائق من التخزين المحلي وقاعدة بيانات Supabase
   */
  static deleteDriver(storeId: string, driverId: string): void {
    const cleanStoreId = storeId || 'default';
    const list = this.getDrivers(cleanStoreId).filter((d) => d.id !== driverId);
    localStorage.setItem(`${DRIVERS_STORAGE_PREFIX}${cleanStoreId}`, JSON.stringify(list));

    LoyaltyEvents.emit({
      type: 'DRIVERS_UPDATED',
      storeId: cleanStoreId,
    });

    // Asynchronously delete from Supabase
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          await (supabase as any)
            .from('store_drivers')
            .delete()
            .eq('id', driverId);
        }
      } catch (e) {
        console.warn('DriverService.deleteDriver Supabase sync error:', e);
      }
    })();
  }

  /**
   * تحديث حالة السائق (متاح / يجهز رحلة / يوصل / راجع / استراحة / غير متاح)
   */
  static setDriverStatus(
    storeId: string,
    driverId: string,
    status: DriverWorkStatus,
    extra?: Partial<StoreDriver>
  ): void {
    const cleanStoreId = storeId || 'default';
    const list = this.getDrivers(cleanStoreId);
    const target = list.find((d) => d.id === driverId);
    const nowIso = new Date().toISOString();

    if (target) {
      target.status = status;
      target.last_status_change_at = nowIso;
      target.updated_at = nowIso;
      if (extra) {
        Object.assign(target, extra);
      }
      localStorage.setItem(`${DRIVERS_STORAGE_PREFIX}${cleanStoreId}`, JSON.stringify(list));

      LoyaltyEvents.emit({
        type: 'DRIVERS_UPDATED',
        storeId: cleanStoreId,
      });

      LoyaltyEvents.emit({
        type: 'ORDER_STATUS_UPDATED',
        storeId: cleanStoreId,
        phone: target.phone,
        orderData: { driver_id: driverId, status, ...extra } as any,
      });

      // Asynchronously update Supabase
      (async () => {
        try {
          const supabase = getSupabaseClient();
          if (supabase) {
            await (supabase as any)
              .from('store_drivers')
              .update({
                status,
                last_status_change_at: nowIso,
                updated_at: nowIso,
                ...(extra || {}),
              })
              .eq('id', driverId);
          }
        } catch (e) {
          console.warn('DriverService.setDriverStatus Supabase sync error:', e);
        }
      })();
    }
  }

  /**
   * تفعيل أو إلغاء خيار أخذ استراحة تلقائية بعد إنهاء مشاوير الرحلة الحالية
   */
  static setAutoBreakAfterDelivery(storeId: string, driverId: string, autoBreak: boolean): void {
    const cleanStoreId = storeId || 'default';
    const list = this.getDrivers(cleanStoreId);
    const target = list.find((d) => d.id === driverId);
    if (target) {
      target.auto_break_after_delivery = autoBreak;
      target.updated_at = new Date().toISOString();
      localStorage.setItem(`${DRIVERS_STORAGE_PREFIX}${cleanStoreId}`, JSON.stringify(list));

      (async () => {
        try {
          const supabase = getSupabaseClient();
          if (supabase) {
            await (supabase as any)
              .from('store_drivers')
              .update({
                auto_break_after_delivery: autoBreak,
                updated_at: target.updated_at,
              })
              .eq('id', driverId);
          }
        } catch {}
      })();
    }
  }

  /**
   * فحص ما إذا كان السائق يستطيع الخروج أوفلاين أو أخذ استراحة
   * (يُمنع إذا كان لديه طلبات نشطة قيد التحضير أو الاستلام أو التوصيل)
   */
  static canDriverGoOffline(
    storeId: string,
    driverId: string
  ): { canGoOffline: boolean; activeOrdersCount: number; activeOrderNumbers: string[] } {
    try {
      const orders = getAllStoredOrders();
      const activeAssigned = orders.filter((o) => {
        if (o.driver_id !== driverId) return false;
        if (o.delivery_status === 'delivered' || o.status === 'completed' || o.status === 'cancelled') return false;
        // Check if emergency was already handled
        if ((o.fulfillment_details as any)?.emergency_reported) return false;
        return true;
      });

      return {
        canGoOffline: activeAssigned.length === 0,
        activeOrdersCount: activeAssigned.length,
        activeOrderNumbers: activeAssigned.map((o) => String((o as any).order_number || o.order_id || '')).filter(Boolean),
      };
    } catch {
      return { canGoOffline: true, activeOrdersCount: 0, activeOrderNumbers: [] };
    }
  }

  /**
   * اقتراح أفضل كابتن متاح في الفرع لإسناد الطلب له تلقائياً
   * الأولولية: 
   * 1. كابتن متفرغ بالكامل بالفرع (available) ومعه 0 طلبات
   * 2. كابتن في مرحلة التحميل بالفرع (loading) ومعه أقل من 3 طلبات لضم الطلب لنفس الرحلة
   */
  static getSuggestedBranchDriver(storeId: string, branchId?: string | null): StoreDriver | null {
    const available = this.getAvailableBranchDrivers(storeId, branchId);
    if (available.length === 0) return null;

    // First preference: completely available in branch
    const completelyFree = available.find((d) => d.status === 'available');
    if (completelyFree) return completelyFree;

    // Second preference: loading in branch with minimal trip orders count
    const sorted = [...available].sort((a, b) => (a.current_trip_orders_count || 0) - (b.current_trip_orders_count || 0));
    return sorted[0] || null;
  }

  /**
   * طلب إعفاء طارئ من السائق لتعذر توصيل الطلب (عطل بالمركبة، حادث، ظرف قاهر)
   * يقوم بإلغاء إسناد الطلب (وأي طلبات أخرى مرافقة معه في نفس الرحلة Batching)
   * وإعادتها للكاشير كطلبات عاجلة تحتاج كابتن بديل مع إشعار الكاشير فورياً
   */
  static requestDriverEmergencyRelease(
    storeId: string,
    driverId: string,
    orderId: string,
    reason: string
  ): WhatsAppOrderPayload | null {
    const cleanStoreId = storeId || 'default';
    try {
      const orders = getAllStoredOrders();
      const nowIso = new Date().toISOString();
      const driver = this.getDrivers(cleanStoreId).find((d) => d.id === driverId);

      // Find all active orders assigned to this driver (including the target order and any batched orders on the same trip)
      const affectedOrders: WhatsAppOrderPayload[] = [];
      let primaryOrder: WhatsAppOrderPayload | null = null;

      orders.forEach((o) => {
        const isTarget = o.order_id === orderId || (o as any).id === orderId || (o as any).order_number === orderId;
        const isActiveForDriver =
          o.driver_id === driverId &&
          o.delivery_status !== 'delivered' &&
          o.status !== 'completed' &&
          o.status !== 'cancelled';

        if (isTarget || isActiveForDriver) {
          const driverName = o.driver_name || driver?.name || 'الكابتن';
          const targetId = String((o as any).id || o.order_id || (o as any).order_number || '');

          o.driver_id = undefined;
          o.driver_name = undefined;
          o.driver_phone = undefined;
          o.delivery_status = 'unassigned';
          o.fulfillment_details = {
            ...(o.fulfillment_details as any),
            emergency_reported: true,
            emergency_reason: reason,
            emergency_driver_name: driverName,
            emergency_driver_id: driverId,
            emergency_reported_at: nowIso,
          } as any;

          affectedOrders.push(o);
          if (isTarget || !primaryOrder) {
            primaryOrder = o;
          }

          // Update in Supabase store_orders
          syncOrderToSupabase(targetId, {
            driver_id: null,
            driver_name: null,
            driver_phone: null,
            delivery_status: 'unassigned',
            fulfillment_details: o.fulfillment_details,
          });
        }
      });

      if (affectedOrders.length > 0 && primaryOrder) {
        saveAllStoredOrders(orders);

        const driverName =
          (primaryOrder as any).fulfillment_details?.emergency_driver_name ||
          driver?.name ||
          'الكابتن';
        const displayNums = affectedOrders
          .map((o) => `#${String((o as any).order_number || o.order_id || '').slice(-6)}`)
          .join(' ، ');

        // Set driver to off_duty due to emergency and clear all trip counters cleanly
        this.setDriverStatus(cleanStoreId, driverId, 'off_duty', {
          current_trip_orders_count: 0,
          current_trip_order_ids: [],
          notes: `اعتذر عن توصيل (${displayNums}): ${reason}`,
        });

        // Emit high-priority emergency event for each affected order to Cashier and Store
        affectedOrders.forEach((ord) => {
          const ordNum = String((ord as any).order_number || ord.order_id || '').slice(-6);
          LoyaltyEvents.emit({
            type: 'ORDER_STATUS_UPDATED',
            storeId: ord.store_id || cleanStoreId,
            phone: ord.customer_phone,
            title: `🚨 إعفاء طارئ للكابتن ${driverName}`,
            message: `اعتذر الكابتن ${driverName} عن الطلب #${ordNum} لسبب: ${reason}`,
            soundType: 'notification',
            orderData: ord,
          });
        });

        LoyaltyEvents.emit({
          type: 'DRIVERS_UPDATED',
          storeId: cleanStoreId,
        });

        return primaryOrder;
      }
    } catch (err) {
      console.warn('requestDriverEmergencyRelease error:', err);
    }
    return null;
  }

  /**
   * جلب السائقين المتاحين للإسناد في الفرع المحدد
   * (إما متفرغ تماماً بالفرع أو لا يزال بالفرع يجهز ومعه أقل من 3 طلبات)
   */
  static getAvailableBranchDrivers(storeId: string, branchId?: string | null): StoreDriver[] {
    const all = this.getDrivers(storeId, branchId);
    return all.filter((d) => {
      if (!d.is_active) return false;
      if (d.status === 'available' || d.status === 'returning') return true;
      if (d.status === 'loading' && (d.current_trip_orders_count || 0) < 3) return true;
      return false;
    });
  }

  /**
   * إسناد طلب توصيل لسائق محدد في الفرع مع دعم ضم الطلبات في نفس الرحلة (Batching)
   */
  static assignOrderToDriver(
    storeId: string,
    orderId: string,
    driverId: string,
    rawOrderSnapshot?: any
  ): WhatsAppOrderPayload | null {
    const cleanStoreId = storeId || 'default';
    const driver = this.getDrivers(cleanStoreId).find((d) => d.id === driverId);
    if (!driver) return null;

    try {
      if (rawOrderSnapshot) {
        this.upsertOrderInCache(rawOrderSnapshot);
      }
      const orders = getAllStoredOrders();
      const orderIdx = orders.findIndex(
        (o) => o.order_id === orderId || (o as any).id === orderId || (o as any).order_number === orderId
      );

      if (orderIdx !== -1) {
        const currentOrders = Array.isArray(driver.current_trip_order_ids) ? driver.current_trip_order_ids : [];
        const newTripCount = currentOrders.includes(orderId)
          ? (driver.current_trip_orders_count || 1)
          : (driver.current_trip_orders_count || 0) + 1;
        const batchId = driver.current_trip_order_ids && driver.current_trip_order_ids.length > 0
          ? (orders.find((o) => o.order_id === driver.current_trip_order_ids![0])?.fulfillment_details as any)?.trip_batch_id || `batch_${Date.now()}`
          : `batch_${Date.now()}`;

        const nowIso = new Date().toISOString();
        const prevFulfillment = orders[orderIdx].fulfillment_details || {};
        orders[orderIdx].driver_id = driver.id;
        orders[orderIdx].driver_name = driver.name;
        orders[orderIdx].driver_phone = driver.phone;
        orders[orderIdx].delivery_status = 'assigned';
        orders[orderIdx].driver_assigned_at = nowIso;
        orders[orderIdx].fulfillment_details = {
          ...prevFulfillment,
          driver_id: driver.id,
          driver_name: driver.name,
          driver_phone: driver.phone,
          delivery_status: 'assigned',
          driver_assigned_at: nowIso,
          emergency_reported: false,
          trip_batch_id: batchId,
          trip_stop_index: newTripCount,
        } as any;

        saveAllStoredOrders(orders);

        // تحديث حالة السائق: في الفرع يجهز للإنطلاق
        this.setDriverStatus(cleanStoreId, driverId, 'loading', {
          current_trip_orders_count: newTripCount,
          current_trip_order_ids: [...currentOrders.filter((id) => id !== orderId), orderId],
        });

        // مزامنة حالة الطلب مع قاعدة بيانات Supabase
        syncOrderToSupabase(orderId, {
          driver_id: driver.id,
          driver_name: driver.name,
          driver_phone: driver.phone,
          delivery_status: 'assigned',
          driver_assigned_at: nowIso,
          fulfillment_details: orders[orderIdx].fulfillment_details,
        });

        // إشعار فوري وتحديث الحالة
        LoyaltyEvents.emit({
          type: 'ORDER_STATUS_UPDATED',
          storeId: orders[orderIdx].store_id || cleanStoreId,
          phone: orders[orderIdx].customer_phone,
          orderData: orders[orderIdx],
        });

        return orders[orderIdx];
      }
    } catch (e) {
      console.warn('Error assigning order to driver:', e);
    }
    return null;
  }

  /**
   * انطلاق السائق في الطريق رسمياً مع كافة طلبات الرحلة (قفل الرحلة)
   */
  static departTrip(storeId: string, driverId: string): void {
    const cleanStoreId = storeId || 'default';
    const orders = getAllStoredOrders();
    const nowIso = new Date().toISOString();

    orders.forEach((o) => {
      if (o.driver_id === driverId && o.delivery_status === 'assigned') {
        o.delivery_status = 'picked_up';
        o.driver_picked_up_at = nowIso;
        if (o.status !== 'completed') {
          o.status = 'ready';
        }
        o.fulfillment_details = {
          ...(o.fulfillment_details as any),
          delivery_status: 'picked_up',
          driver_picked_up_at: nowIso,
        } as any;
        syncOrderToSupabase(o.order_id || (o as any).id, {
          delivery_status: 'picked_up',
          status: o.status,
          fulfillment_details: o.fulfillment_details,
        });
      }
    });

    saveAllStoredOrders(orders);

    this.setDriverStatus(cleanStoreId, driverId, 'delivering', {
      last_status_change_at: nowIso,
    });
  }

  /**
   * قيام السائق باستلام الطلب من الفرع والانطلاق في الطريق
   */
  static pickupOrder(
    storeId: string,
    orderId: string,
    driverId: string
  ): WhatsAppOrderPayload | null {
    try {
      const orders = getAllStoredOrders();
      const orderIdx = orders.findIndex(
        (o) => o.order_id === orderId || (o as any).id === orderId || (o as any).order_number === orderId
      );

      if (orderIdx !== -1) {
        const nowIso = new Date().toISOString();
        orders[orderIdx].delivery_status = 'picked_up';
        orders[orderIdx].driver_picked_up_at = nowIso;
        if (orders[orderIdx].status !== 'completed') {
          orders[orderIdx].status = 'ready'; // جاري التوصيل
        }
        orders[orderIdx].fulfillment_details = {
          ...(orders[orderIdx].fulfillment_details as any),
          delivery_status: 'picked_up',
          driver_picked_up_at: nowIso,
        } as any;

        saveAllStoredOrders(orders);

        syncOrderToSupabase(orderId, {
          delivery_status: 'picked_up',
          status: orders[orderIdx].status,
          fulfillment_details: orders[orderIdx].fulfillment_details,
        });

        LoyaltyEvents.emit({
          type: 'ORDER_STATUS_UPDATED',
          storeId: orders[orderIdx].store_id || storeId,
          phone: orders[orderIdx].customer_phone,
          orderData: orders[orderIdx],
        });

        this.setDriverStatus(storeId, driverId, 'delivering');
        return orders[orderIdx];
      }
    } catch (e) {
      console.warn('Error picking up order:', e);
    }
    return null;
  }

  /**
   * تأكيد تسليم الطلب للعميل عند الباب وتحصيل المبلغ (كاش أو شبكة/مدى أو أونلاين مسبق)
   * مع منح نقاط الولاء للعميل تلقائياً وخصم المخزون ومزامنة عهدة السائق مع قاعدة البيانات
   */
  static deliverOrder(
    storeId: string,
    orderId: string,
    driverId: string,
    paymentMethod: 'cash' | 'card' | 'online_link',
    collectedAmount: number,
    notes?: string
  ): WhatsAppOrderPayload | null {
    try {
      const orders = getAllStoredOrders();
      const orderIdx = orders.findIndex(
        (o) => o.order_id === orderId || (o as any).id === orderId || (o as any).order_number === orderId
      );

      if (orderIdx !== -1) {
        const nowIso = new Date().toISOString();
        const targetOrder = orders[orderIdx];
        const wasPointsAwarded = Boolean(targetOrder.points_awarded || (targetOrder.fulfillment_details as any)?.points_awarded);
        const wasInventoryDeducted = Boolean((targetOrder as any).inventory_deducted || (targetOrder.fulfillment_details as any)?.inventory_deducted);

        targetOrder.delivery_status = 'delivered';
        targetOrder.status = 'completed';
        targetOrder.delivered_at = nowIso;
        targetOrder.payment_status = 'paid';
        targetOrder.payment_method = (paymentMethod === 'card' ? 'mada' : paymentMethod === 'online_link' ? 'online' : 'cash') as any;
        targetOrder.driver_payment_method = paymentMethod;
        targetOrder.driver_collected_amount = collectedAmount;
        targetOrder.points_awarded = true;
        (targetOrder as any).inventory_deducted = true;

        if (notes) {
          (targetOrder as any).notes = (targetOrder as any).notes
            ? `${(targetOrder as any).notes} | ملاحظة التسليم: ${notes}`
            : `ملاحظة التسليم: ${notes}`;
        }

        targetOrder.fulfillment_details = {
          ...(targetOrder.fulfillment_details as any),
          delivery_status: 'delivered',
          delivered_at: nowIso,
          points_awarded: true,
          inventory_deducted: true,
          driver_payment_method: paymentMethod,
          driver_collected_amount: collectedAmount,
          driver_cash_settled: paymentMethod === 'online_link',
          driver_settlement_requested: false,
        } as any;

        saveAllStoredOrders(orders);

        syncOrderToSupabase(orderId, {
          delivery_status: 'delivered',
          status: 'completed',
          delivered_at: nowIso,
          payment_status: 'paid',
          payment_method: paymentMethod === 'card' ? 'mada' : paymentMethod === 'online_link' ? 'online' : 'cash',
          fulfillment_details: targetOrder.fulfillment_details,
        });

        // 1. تسجيل تسوية الكابتن النقدية ومزامنتها في Supabase
        const deliveryFee = Number((targetOrder.fulfillment_details as any)?.delivery_fee || 0);
        this.recordSettlementTransaction(storeId, driverId, paymentMethod, collectedAmount, deliveryFee);

        // 2. خصم المواد الخام من المخزون إذا لم تكن قد خُصمت مسبقاً
        if (!wasInventoryDeducted && Array.isArray(targetOrder.items) && targetOrder.items.length > 0) {
          try {
            InventoryService.deductInventoryForOrder(storeId, targetOrder.items as any);
          } catch (invErr) {
            console.warn('Inventory deduction on delivery warning:', invErr);
          }
        }

        // 3. منح نقاط الولاء للعميل عند التسليم والدفع عند الباب إذا لم تُمنح مسبقاً
        if (!wasPointsAwarded && targetOrder.customer_phone) {
          const orderTotal = Number(targetOrder.total_amount || (targetOrder as any).total_price || collectedAmount || 0);
          const pointsToAward =
            Number(targetOrder.loyalty_points_earned) > 0
              ? Number(targetOrder.loyalty_points_earned)
              : Math.max(1, Math.floor(orderTotal * 0.1));

          const driverObj = this.getDrivers(storeId).find((d) => d.id === driverId);
          LoyaltyService.rewardPointsForCompletedTransaction(
            targetOrder.store_id || storeId,
            targetOrder.customer_phone,
            pointsToAward,
            `إتمام توصيل واستلام الطلب #${(targetOrder as any).order_number || orderId}`,
            targetOrder.customer_name,
            driverObj?.name || 'كابتن التوصيل',
            targetOrder.branch_id || driverObj?.branch_id || null,
            (targetOrder as any).branch_name || driverObj?.branch_name || null,
            orderTotal,
            'PURCHASE'
          ).catch((err) => console.warn('Failed to reward loyalty points upon delivery:', err));
        }

        // إشعار اكتمال الطلب
        LoyaltyEvents.emit({
          type: 'ORDER_STATUS_UPDATED',
          storeId: targetOrder.store_id || storeId,
          phone: targetOrder.customer_phone,
          orderData: targetOrder,
        });

        // فحص ما إذا كان لدى السائق طلبات أخرى متبقية في نفس الرحلة
        const driver = this.getDrivers(storeId).find((d) => d.id === driverId);
        const remainingActive = orders.filter(
          (o) =>
            o.driver_id === driverId &&
            (o.delivery_status === 'picked_up' || o.delivery_status === 'assigned') &&
            o.order_id !== orderId &&
            (o as any).id !== orderId
        );

        if (remainingActive.length === 0) {
          // انتهت كل توصيلات الرحلة!
          if (driver?.auto_break_after_delivery) {
            this.setDriverStatus(storeId, driverId, 'break', {
              auto_break_after_delivery: false,
              current_trip_orders_count: 0,
              current_trip_order_ids: [],
              estimated_return_minutes: 0,
            });
          } else {
            // يعود الكابتن متاحاً تلقائياً لاستلام طلبات جديدة بدون تعليقه
            this.setDriverStatus(storeId, driverId, 'available', {
              current_trip_orders_count: 0,
              current_trip_order_ids: [],
              estimated_return_minutes: 0,
            });
          }
        } else {
          // لا يزال لديه طلبات تالية في نفس الرحلة
          this.setDriverStatus(storeId, driverId, 'delivering', {
            current_trip_orders_count: remainingActive.length,
            current_trip_order_ids: remainingActive.map((o) => o.order_id || (o as any).id),
          });
        }

        return targetOrder;
      }
    } catch (e) {
      console.warn('Error completing order delivery:', e);
    }
    return null;
  }

  /**
   * تأكيد عودة السائق للفرع واستعداده لرحلة جديدة
   */
  static reportDriverReturned(storeId: string, driverId: string): void {
    this.setDriverStatus(storeId, driverId, 'available', {
      current_trip_orders_count: 0,
      current_trip_order_ids: [],
      estimated_return_minutes: 0,
    });
  }

  /**
   * جلب تصنيفات طلبات السائق الحالية (جاهزة للاستلام / قيد التوصيل / مكتملة اليوم)
   */
  static getDriverOrders(
    storeId: string,
    driverId: string,
    branchId?: string | null
  ): {
    availableForPickup: WhatsAppOrderPayload[];
    activeDeliveries: WhatsAppOrderPayload[];
    completedToday: WhatsAppOrderPayload[];
  } {
    try {
      // Trigger non-blocking background orders sync from Supabase
      this.syncOrdersWithSupabase(storeId).catch(() => {});

      const orders = getAllStoredOrders();
      const todayStr = new Date().toISOString().split('T')[0];

      // فلترة طلبات التوصيل للفرع المحدد
      const branchOrders = orders.filter((o) => {
        const isDelivery = o.fulfillment_type === 'delivery' || (o as any).order_type === 'delivery';
        const matchBranch =
          !branchId ||
          branchId === 'ALL' ||
          !o.branch_id ||
          o.branch_id === branchId ||
          o.driver_id === driverId;
        return isDelivery && matchBranch;
      });

      // 1. طلبات مسندة لهذا السائق بانتظار الاستلام من الفرع (حصر صارم بطلبات هذا الكابتن المعتمدة فقط)
      const availableForPickup = branchOrders.filter((o) => {
        if (o.delivery_status === 'delivered' || o.status === 'cancelled' || o.status === 'completed') return false;
        if ((o.fulfillment_details as any)?.emergency_reported && !o.driver_id) return false;
        return o.driver_id === driverId && (o.delivery_status === 'assigned' || !o.delivery_status);
      });

      // 2. طلبات جاري توصيلها حالياً بالسيارة/الدراجة (استلمها السائق وفي الطريق للعميل)
      const activeDeliveries = branchOrders.filter((o) => {
        return o.driver_id === driverId && o.delivery_status === 'picked_up';
      });

      // 3. طلبات اكتمل تسليمها اليوم بواسطة هذا السائق
      const completedToday = branchOrders.filter((o) => {
        const isThisDriver = o.driver_id === driverId;
        const isDelivered = o.delivery_status === 'delivered';
        const isToday = (o.delivered_at || o.created_at || '').startsWith(todayStr);
        return isThisDriver && isDelivered && isToday;
      });

      return {
        availableForPickup,
        activeDeliveries,
        completedToday,
      };
    } catch {
      return {
        availableForPickup: [],
        activeDeliveries: [],
        completedToday: [],
      };
    }
  }

  /**
   * ☁️ مزامنة عهدة السائق اليومية من قاعدة بيانات Supabase (driver_settlements)
   */
  static async syncSettlementWithSupabase(storeId: string, driverId: string): Promise<DriverShiftSettlement> {
    const cleanStoreId = storeId || 'default';
    const today = new Date().toISOString().split('T')[0];
    const key = `${DRIVER_SETTLEMENTS_PREFIX}${cleanStoreId}_${driverId}_${today}`;

    try {
      const resolvedStoreId = await resolveStoreUUID(cleanStoreId);
      const supabase = getSupabaseClient();
      if (supabase && isUUID(resolvedStoreId)) {
        const { data, error } = await (supabase as any)
          .from('driver_settlements')
          .select('*')
          .eq('store_id', resolvedStoreId)
          .eq('driver_id', driverId)
          .eq('date', today)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          let prevLocal: Partial<DriverShiftSettlement> = {};
          try {
            const rawPrev = localStorage.getItem(key);
            if (rawPrev) prevLocal = JSON.parse(rawPrev);
          } catch {}

          const synced: DriverShiftSettlement = {
            ...prevLocal,
            driver_id: String(data.driver_id),
            driver_name: data.driver_name || 'السائق',
            branch_id: data.branch_id || 'b1',
            store_id: cleanStoreId,
            date: data.date || today,
            delivered_orders_count: Number(data.delivered_orders_count) || 0,
            total_cash_collected: Number(data.total_cash_collected) || 0,
            total_card_collected: Number(data.total_card_collected) || 0,
            total_online_collected: Number(data.total_online_collected) || 0,
            total_delivery_fees: Number(data.total_delivery_fees) || 0,
            settled: Boolean(data.settled),
            settled_at: data.settled_at || prevLocal.settled_at || undefined,
          };
          localStorage.setItem(key, JSON.stringify(synced));
          return synced;
        }
      }
    } catch (err) {
      console.warn('DriverService.syncSettlementWithSupabase warning:', err);
    }

    return this.getDriverShiftSettlement(cleanStoreId, driverId);
  }

  /**
   * جلب تفاصيل العهدة غير المصفاة حالياً للسائق (الفواتير النقدية والشبكة التي لم يستلمها الكاشير بعد)
   */
  static getDriverUnsettledSummary(
    storeId: string,
    driverId: string,
    externalOrders?: any[]
  ): {
    unsettledOrders: WhatsAppOrderPayload[];
    unsettledCash: number;
    unsettledCard: number;
    unsettledOnline: number;
    settlementRequested: boolean;
    settlementRequestedAt?: string;
  } {
    const storedOrders = getAllStoredOrders();
    const map = new Map<string, WhatsAppOrderPayload>();
    storedOrders.forEach((o) => {
      const k = String(o.order_id || (o as any).id || (o as any).order_number || '');
      if (k) map.set(k, o);
    });
    if (Array.isArray(externalOrders)) {
      externalOrders.forEach((raw) => {
        if (!raw) return;
        const norm = normalizeOrderRecord(raw);
        const k = String(norm.order_id || (norm as any).id || (norm as any).order_number || '');
        if (k) {
          const prev = map.get(k);
          map.set(k, prev ? { ...prev, ...norm } : norm);
        }
      });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const allDriverDeliveredToday = Array.from(map.values()).filter((o) => {
      const isDriver = o.driver_id === driverId || (o.fulfillment_details as any)?.driver_id === driverId;
      const isDelivered = o.delivery_status === 'delivered' || (o.fulfillment_details as any)?.delivery_status === 'delivered';
      const isToday = (o.delivered_at || o.created_at || '').startsWith(todayStr);
      return isDriver && isDelivered && isToday;
    });

    const unsettledOrders = allDriverDeliveredToday.filter((o) => {
      const fd = (o.fulfillment_details || {}) as any;
      if (fd.driver_cash_settled === true) return false;
      const method = fd.driver_payment_method || o.driver_payment_method || o.payment_method;
      if (method === 'online_link' || method === 'online') return false;
      return true;
    });

    let unsettledCash = 0;
    let unsettledCard = 0;
    let unsettledOnline = 0;
    let orderRequested = false;
    let requestedAt: string | undefined = undefined;

    allDriverDeliveredToday.forEach((o) => {
      const fd = (o.fulfillment_details || {}) as any;
      const method = fd.driver_payment_method || o.driver_payment_method || o.payment_method;
      const amt = Number(fd.driver_collected_amount ?? o.driver_collected_amount ?? o.total_amount ?? (o as any).total_price ?? 0);

      if (method === 'online_link' || method === 'online') {
        unsettledOnline += amt;
        return;
      }

      if (fd.driver_cash_settled !== true) {
        if (method === 'cash') {
          unsettledCash += amt;
        } else if (method === 'card' || method === 'mada' || method === 'credit_card') {
          unsettledCard += amt;
        }
        if (fd.driver_settlement_requested) {
          orderRequested = true;
          requestedAt = fd.driver_settlement_requested_at || requestedAt;
        }
      }
    });

    const shiftRecord = this.getDriverShiftSettlement(storeId, driverId);
    const hasUnsettledInShiftRecord = !shiftRecord.settled && (shiftRecord.total_cash_collected > 0 || shiftRecord.total_card_collected > 0);

    if (unsettledOrders.length === 0 && hasUnsettledInShiftRecord) {
      unsettledCash = shiftRecord.total_cash_collected || 0;
      unsettledCard = shiftRecord.total_card_collected || 0;
    }

    return {
      unsettledOrders,
      unsettledCash,
      unsettledCard,
      unsettledOnline,
      settlementRequested: Boolean(
        (unsettledCash > 0 || unsettledCard > 0 || unsettledOrders.length > 0) &&
          (orderRequested || shiftRecord.settlement_requested)
      ),
      settlementRequestedAt: requestedAt || shiftRecord.settlement_requested_at,
    };
  }

  /**
   * حساب تقرير وردية السائق والعهد النقدية اليومية
   */
  static getDriverShiftSettlement(storeId: string, driverId: string): DriverShiftSettlement {
    const today = new Date().toISOString().split('T')[0];
    const key = `${DRIVER_SETTLEMENTS_PREFIX}${storeId}_${driverId}_${today}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {}

    const driver = this.getDrivers(storeId).find((d) => d.id === driverId);
    return {
      driver_id: driverId,
      driver_name: driver?.name || 'السائق',
      branch_id: driver?.branch_id || 'b1',
      store_id: storeId,
      date: today,
      delivered_orders_count: 0,
      total_cash_collected: 0,
      total_card_collected: 0,
      total_online_collected: 0,
      total_delivery_fees: 0,
      settled: false,
    };
  }

  /**
   * حفظ ومزامنة سجل العهدة اليومية للسائق في قاعدة بيانات Supabase (driver_settlements)
   */
  private static persistSettlementToSupabase(storeId: string, settlement: DriverShiftSettlement): void {
    (async () => {
      try {
        const resolvedStoreId = await resolveStoreUUID(storeId);
        const supabase = getSupabaseClient();
        if (supabase && isUUID(resolvedStoreId)) {
          const payload = {
            store_id: resolvedStoreId,
            branch_id: settlement.branch_id || 'b1',
            driver_id: settlement.driver_id,
            driver_name: settlement.driver_name || 'السائق',
            date: settlement.date,
            delivered_orders_count: Number(settlement.delivered_orders_count) || 0,
            total_cash_collected: Number(settlement.total_cash_collected) || 0,
            total_card_collected: Number(settlement.total_card_collected) || 0,
            total_online_collected: Number(settlement.total_online_collected) || 0,
            total_delivery_fees: Number(settlement.total_delivery_fees) || 0,
            settled: Boolean(settlement.settled),
            settled_at: settlement.settled_at || null,
            updated_at: new Date().toISOString(),
          };

          const { data: existing } = await (supabase as any)
            .from('driver_settlements')
            .select('id')
            .eq('store_id', resolvedStoreId)
            .eq('driver_id', settlement.driver_id)
            .eq('date', settlement.date)
            .limit(1)
            .maybeSingle();

          if (existing?.id) {
            await (supabase as any)
              .from('driver_settlements')
              .update(payload)
              .eq('id', existing.id);
          } else {
            await (supabase as any)
              .from('driver_settlements')
              .insert(payload);
          }
        }
      } catch (err) {
        console.warn('DriverService.persistSettlementToSupabase warning:', err);
      }
    })();
  }

  /**
   * تسجيل مبلغ في عهدة السائق عند إتمام التوصيل ومزامنته مع قاعدة البيانات
   */
  private static recordSettlementTransaction(
    storeId: string,
    driverId: string,
    method: 'cash' | 'card' | 'online_link',
    amount: number,
    deliveryFee: number
  ): void {
    const today = new Date().toISOString().split('T')[0];
    const key = `${DRIVER_SETTLEMENTS_PREFIX}${storeId}_${driverId}_${today}`;
    const current = this.getDriverShiftSettlement(storeId, driverId);

    // إذا كانت العهدة السابقة قد تمت تصفيتها، نبدأ دورة عهدة جديدة من الصفر للمشوار الجديد
    if (current.settled && (method === 'cash' || method === 'card')) {
      current.settled = false;
      current.settlement_requested = false;
    }

    current.delivered_orders_count += 1;
    current.total_delivery_fees += Number(deliveryFee) || 0;

    if (method === 'cash') {
      current.total_cash_collected += Number(amount) || 0;
    } else if (method === 'card') {
      current.total_card_collected += Number(amount) || 0;
    } else {
      current.total_online_collected += Number(amount) || 0;
    }

    localStorage.setItem(key, JSON.stringify(current));
    this.persistSettlementToSupabase(storeId, current);
  }

  /**
   * ✋ إرسال طلب من الكابتن للكاشير لتسليم العهدة النقدية وتصفيرها
   * يرسل إشعاراً لحظياً لشاشة الكاشير عبر Supabase Realtime و LoyaltyEvents
   */
  static requestDriverSettlement(storeId: string, driverId: string): DriverShiftSettlement {
    const cleanStoreId = storeId || 'default';
    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    const key = `${DRIVER_SETTLEMENTS_PREFIX}${cleanStoreId}_${driverId}_${today}`;

    const summary = this.getDriverUnsettledSummary(cleanStoreId, driverId);
    const current = this.getDriverShiftSettlement(cleanStoreId, driverId);

    current.settled = false;
    current.settlement_requested = true;
    current.settlement_requested_at = nowIso;
    if (summary.unsettledCash > 0) current.total_cash_collected = summary.unsettledCash;
    if (summary.unsettledCard > 0) current.total_card_collected = summary.unsettledCard;

    localStorage.setItem(key, JSON.stringify(current));
    this.persistSettlementToSupabase(cleanStoreId, current);

    // تحديث الفواتير غير المصفاة في store_orders لإطلاق تنبيه Realtime فوري لدى الكاشير
    const orders = getAllStoredOrders();
    let updatedAnyOrder = false;
    orders.forEach((o) => {
      const isDriver = o.driver_id === driverId || (o.fulfillment_details as any)?.driver_id === driverId;
      const isDelivered = o.delivery_status === 'delivered' || (o.fulfillment_details as any)?.delivery_status === 'delivered';
      const fd = (o.fulfillment_details || {}) as any;
      if (isDriver && isDelivered && fd.driver_cash_settled !== true) {
        o.fulfillment_details = {
          ...fd,
          driver_settlement_requested: true,
          driver_settlement_requested_at: nowIso,
        };
        updatedAnyOrder = true;
        const targetId = String((o as any).id || o.order_id || (o as any).order_number || '');
        if (targetId) {
          syncOrderToSupabase(targetId, {
            fulfillment_details: o.fulfillment_details,
          });
        }
      }
    });

    if (updatedAnyOrder) {
      saveAllStoredOrders(orders);
    }

    const driverObj = this.getDrivers(cleanStoreId).find((d) => d.id === driverId);
    LoyaltyEvents.emit({
      type: 'ORDER_STATUS_UPDATED',
      storeId: cleanStoreId,
      title: `💵 طلب تسليم عهدة من الكابتن ${driverObj?.name || current.driver_name}`,
      message: `الكابتن بالفرع يطلب تسليم عهدة نقدية بقيمة ${summary.unsettledCash.toFixed(2)} ريال`,
      soundType: 'notification',
    });

    LoyaltyEvents.emit({
      type: 'DRIVERS_UPDATED',
      storeId: cleanStoreId,
    });

    return current;
  }

  /**
   * ✍️ توقيع الكاشير باستلام العهدة النقدية وإدخال الفواتير في صندوق الوردية وتصفير عهدة الكابتن (0.00 ريال)
   */
  static settleDriverShift(
    storeId: string,
    driverId: string,
    settledByCashier?: string,
    externalOrders?: any[]
  ): DriverShiftSettlement {
    const cleanStoreId = storeId || 'default';
    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    const key = `${DRIVER_SETTLEMENTS_PREFIX}${cleanStoreId}_${driverId}_${today}`;
    const cashierLabel = settledByCashier || 'كاشير الفرع';

    const summary = this.getDriverUnsettledSummary(cleanStoreId, driverId, externalOrders);
    const current = this.getDriverShiftSettlement(cleanStoreId, driverId);

    const cashSettledNow = summary.unsettledCash > 0 ? summary.unsettledCash : (current.total_cash_collected || 0);
    const cardSettledNow = summary.unsettledCard > 0 ? summary.unsettledCard : (current.total_card_collected || 0);
    const ordersSettledCount = summary.unsettledOrders.length || current.delivered_orders_count || 0;

    // 1. اعتماد كافة فواتير التوصيل الخاصة بالكابتن وإدخالها رسمياً في صندوق الكاشير
    const orders = getAllStoredOrders();
    const settledIds = new Set(
      summary.unsettledOrders.map((u) => String((u as any).id || u.order_id || (u as any).order_number || ''))
    );

    orders.forEach((o) => {
      const oid = String((o as any).id || o.order_id || (o as any).order_number || '');
      const isDriver = o.driver_id === driverId || (o.fulfillment_details as any)?.driver_id === driverId;
      const isDelivered = o.delivery_status === 'delivered' || (o.fulfillment_details as any)?.delivery_status === 'delivered';
      const fd = (o.fulfillment_details || {}) as any;

      if ((isDriver && isDelivered && fd.driver_cash_settled !== true) || settledIds.has(oid)) {
        o.fulfillment_details = {
          ...fd,
          driver_cash_settled: true,
          driver_cash_settled_at: nowIso,
          driver_cash_settled_by: cashierLabel,
          driver_settlement_requested: false,
        };
        if (oid) {
          syncOrderToSupabase(oid, {
            cashier_name: cashierLabel,
            fulfillment_details: o.fulfillment_details,
          });
        }
      }
    });

    // أيضاً لو كانت هناك طلبات قادمة من شاشة الكاشير غير موجودة في الكاش المحلي
    summary.unsettledOrders.forEach((uo) => {
      const oid = String((uo as any).id || uo.order_id || (uo as any).order_number || '');
      if (oid) {
        const updatedFd = {
          ...(uo.fulfillment_details || {}),
          driver_cash_settled: true,
          driver_cash_settled_at: nowIso,
          driver_cash_settled_by: cashierLabel,
          driver_settlement_requested: false,
        };
        syncOrderToSupabase(oid, {
          cashier_name: cashierLabel,
          fulfillment_details: updatedFd,
        });
      }
    });

    saveAllStoredOrders(orders);

    // 2. تصفير العهدة الحالية في ذمة الكابتن إلى 0.00 ريال وحفظ سند التصفية الأخير
    current.last_settled_cash = cashSettledNow;
    current.last_settled_card = cardSettledNow;
    current.last_settled_orders_count = ordersSettledCount;
    current.total_cash_collected = 0;
    current.total_card_collected = 0;
    current.settled = true;
    current.settlement_requested = false;
    current.settled_at = nowIso;
    current.settled_by_cashier = cashierLabel;

    localStorage.setItem(key, JSON.stringify(current));
    this.persistSettlementToSupabase(cleanStoreId, current);

    LoyaltyEvents.emit({
      type: 'DRIVERS_UPDATED',
      storeId: cleanStoreId,
    });

    LoyaltyEvents.emit({
      type: 'ORDER_STATUS_UPDATED',
      storeId: cleanStoreId,
      title: `✅ تم استلام وتصفير عهدة الكابتن ${current.driver_name}`,
      message: `تم توقيع استلام ${cashSettledNow.toFixed(2)} ريال كاش بواسطة ${cashierLabel}`,
      soundType: 'success',
    });

    return current;
  }

  /**
   * أيقونة ونوع المركبة
   */
  static getVehicleIcon(vehicle: DriverVehicleType): string {
    switch (vehicle) {
      case 'motorcycle':
        return '🛵';
      case 'car':
        return '🚗';
      case 'bicycle':
        return '🚲';
      case 'van':
        return '🚐';
      default:
        return '🛵';
    }
  }

  static getVehicleLabel(vehicle: DriverVehicleType): string {
    switch (vehicle) {
      case 'motorcycle':
        return 'دراجة نارية / دباب';
      case 'car':
        return 'سيارة خاصة';
      case 'bicycle':
        return 'دراجة هوائية';
      case 'van':
        return 'فان / حافلة توزيع';
      default:
        return 'دراجة نارية';
    }
  }

  static getStatusLabel(status: DriverWorkStatus): { label: string; color: string } {
    switch (status) {
      case 'available':
        return { label: 'متاح للطلب', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
      case 'loading':
        return { label: 'يجهز بالفرع 📦', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'delivering':
        return { label: 'في مهمة توصيل 🛵', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
      case 'returning':
        return { label: 'راجع للفرع 💨', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      case 'break':
        return { label: 'في استراحة ☕', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
      case 'off_duty':
        return { label: 'خارج الخدمة', color: 'bg-slate-700/50 text-slate-400 border-slate-600/30' };
      default:
        return { label: 'متاح', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    }
  }
}

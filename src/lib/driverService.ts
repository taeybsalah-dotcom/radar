import { StoreDriver, DriverShiftSettlement, DriverVehicleType, DriverWorkStatus, DeliveryOrderStatus, WhatsAppOrderPayload } from '../types';
import { LoyaltyEvents } from './events';
import { getSupabaseClient, isUUID } from './supabase';

const DRIVERS_STORAGE_PREFIX = 'radar_store_drivers_';
const DRIVER_SETTLEMENTS_PREFIX = 'radar_driver_settlements_';
const PRIMARY_ORDERS_KEY = 'radar_local_whatsapp_orders';
const FALLBACK_ORDERS_KEY = 'radar_local_store_orders';

// In-flight sync debounce tracker
const lastSyncTimestampMap = new Map<string, number>();

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
    await (supabase as any)
      .from('store_orders')
      .update(updates)
      .or(`id.eq.${orderId},order_number.eq.${orderId}`);
  } catch (err) {
    console.warn('Failed to sync order to Supabase:', err);
  }
}

function getAllStoredOrders(): WhatsAppOrderPayload[] {
  try {
    const list1 = JSON.parse(localStorage.getItem(PRIMARY_ORDERS_KEY) || '[]');
    const list2 = JSON.parse(localStorage.getItem(FALLBACK_ORDERS_KEY) || '[]');
    const map = new Map<string, WhatsAppOrderPayload>();
    [...list2, ...list1].forEach((o) => {
      const key = String(o.order_id || (o as any).id || (o as any).order_number || '');
      if (key) map.set(key, o);
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
          .select('*')
          .eq('store_id', resolvedStoreId)
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data) && data.length > 0) {
          const list: StoreDriver[] = data.map((d: any) => ({
            id: String(d.id),
            store_id: String(d.store_id),
            branch_id: d.branch_id || 'b1',
            branch_name: d.branch_name || 'الفرع الرئيسي',
            name: d.name,
            phone: d.phone,
            vehicle_type: d.vehicle_type || 'motorcycle',
            plate_number: d.plate_number || '',
            pin_code: d.pin_code || '1234',
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
          await (supabase as any)
            .from('store_drivers')
            .upsert({
              id: target.id,
              store_id: resolvedStoreId,
              branch_id: target.branch_id,
              branch_name: target.branch_name,
              name: target.name,
              phone: target.phone,
              vehicle_type: target.vehicle_type,
              plate_number: target.plate_number,
              pin_code: target.pin_code,
              is_active: target.is_active,
              status: target.status,
              commission_per_order: target.commission_per_order,
              notes: target.notes,
              updated_at: nowIso,
            }, { onConflict: 'id' });
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
   * جلب السائقين المتاحين للإسناد في الفرع المحدد
   * (إما متفرغ تماماً بالفرع أو لا يزال بالفرع يجهز ومعه أقل من 3 طلبات)
   */
  static getAvailableBranchDrivers(storeId: string, branchId?: string | null): StoreDriver[] {
    const all = this.getDrivers(storeId, branchId);
    return all.filter((d) => {
      if (!d.is_active) return false;
      if (d.status === 'available') return true;
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
    driverId: string
  ): WhatsAppOrderPayload | null {
    const cleanStoreId = storeId || 'default';
    const driver = this.getDrivers(cleanStoreId).find((d) => d.id === driverId);
    if (!driver) return null;

    try {
      const orders = getAllStoredOrders();
      const orderIdx = orders.findIndex(
        (o) => o.order_id === orderId || (o as any).id === orderId || (o as any).order_number === orderId
      );

      if (orderIdx !== -1) {
        const currentOrders = Array.isArray(driver.current_trip_order_ids) ? driver.current_trip_order_ids : [];
        const newTripCount = (driver.current_trip_orders_count || 0) + 1;
        const batchId = driver.current_trip_order_ids && driver.current_trip_order_ids.length > 0
          ? (orders.find((o) => o.order_id === driver.current_trip_order_ids![0])?.fulfillment_details as any)?.trip_batch_id || `batch_${Date.now()}`
          : `batch_${Date.now()}`;

        const nowIso = new Date().toISOString();
        orders[orderIdx].driver_id = driver.id;
        orders[orderIdx].driver_name = driver.name;
        orders[orderIdx].driver_phone = driver.phone;
        orders[orderIdx].delivery_status = 'assigned';
        orders[orderIdx].driver_assigned_at = nowIso;
        orders[orderIdx].fulfillment_details = {
          ...orders[orderIdx].fulfillment_details,
          trip_batch_id: batchId,
          trip_stop_index: newTripCount,
        };

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
          storeId: orders[orderIdx].store_id,
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
        syncOrderToSupabase(o.order_id || (o as any).id, {
          delivery_status: 'picked_up',
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

        saveAllStoredOrders(orders);

        syncOrderToSupabase(orderId, {
          delivery_status: 'picked_up',
        });

        LoyaltyEvents.emit({
          type: 'ORDER_STATUS_UPDATED',
          storeId: orders[orderIdx].store_id,
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
        orders[orderIdx].delivery_status = 'delivered';
        orders[orderIdx].status = 'completed';
        orders[orderIdx].delivered_at = nowIso;
        orders[orderIdx].payment_status = 'paid';
        orders[orderIdx].payment_method = (paymentMethod === 'card' ? 'mada' : paymentMethod) as any;

        if (notes) {
          (orders[orderIdx] as any).notes = (orders[orderIdx] as any).notes
            ? `${(orders[orderIdx] as any).notes} | ملاحظة التسليم: ${notes}`
            : `ملاحظة التسليم: ${notes}`;
        }

        saveAllStoredOrders(orders);

        syncOrderToSupabase(orderId, {
          delivery_status: 'delivered',
          status: 'completed',
          delivered_at: nowIso,
          payment_status: 'paid',
          payment_method: paymentMethod,
        });

        // تسجيل تسوية الكابتن النقدية
        const deliveryFee = (orders[orderIdx].fulfillment_details as any)?.delivery_fee || 0;
        this.recordSettlementTransaction(storeId, driverId, paymentMethod, collectedAmount, deliveryFee);

        // إشعار اكتمال الطلب
        LoyaltyEvents.emit({
          type: 'ORDER_STATUS_UPDATED',
          storeId: orders[orderIdx].store_id,
          phone: orders[orderIdx].customer_phone,
          orderData: orders[orderIdx],
        });

        // فحص ما إذا كان لدى السائق طلبات أخرى متبقية في نفس الرحلة
        const driver = this.getDrivers(storeId).find((d) => d.id === driverId);
        const remainingActive = orders.filter(
          (o) => o.driver_id === driverId && o.delivery_status === 'picked_up' && o.order_id !== orderId
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
            // في طريق العودة للفرع
            this.setDriverStatus(storeId, driverId, 'returning', {
              current_trip_orders_count: 0,
              current_trip_order_ids: [],
              estimated_return_minutes: 10,
            });
          }
        } else {
          // لا يزال لديه طلبات تالية في نفس الرحلة
          this.setDriverStatus(storeId, driverId, 'delivering', {
            current_trip_orders_count: remainingActive.length,
            current_trip_order_ids: remainingActive.map((o) => o.order_id || (o as any).id),
          });
        }

        return orders[orderIdx];
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
      const orders = getAllStoredOrders();
      const todayStr = new Date().toISOString().split('T')[0];

      // فلترة طلبات التوصيل للفرع المحدد
      const branchOrders = orders.filter((o) => {
        const isDelivery = o.fulfillment_type === 'delivery' || (o as any).order_type === 'delivery';
        const matchBranch = !branchId || branchId === 'ALL' || !o.branch_id || o.branch_id === branchId;
        return isDelivery && matchBranch;
      });

      // 1. طلبات جاهزة للاستلام (إما مسندة لهذا السائق ولم يستلمها بعد، أو بانتظار سائق بالفرع)
      const availableForPickup = branchOrders.filter((o) => {
        if (o.delivery_status === 'delivered' || o.status === 'cancelled') return false;
        return (
          o.driver_id === driverId && o.delivery_status === 'assigned'
        ) || (!o.driver_id && (o.status === 'ready' || o.status === 'preparing' || o.status === 'pending'));
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
   * تسجيل مبلغ في عهدة السائق عند إتمام التوصيل
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
  }

  /**
   * تسليم العهدة النقدية اليومية لكاشير الفرع وإغلاق وردية السائق
   */
  static settleDriverShift(storeId: string, driverId: string): DriverShiftSettlement {
    const today = new Date().toISOString().split('T')[0];
    const key = `${DRIVER_SETTLEMENTS_PREFIX}${storeId}_${driverId}_${today}`;
    const current = this.getDriverShiftSettlement(storeId, driverId);

    current.settled = true;
    current.settled_at = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(current));
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

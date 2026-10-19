import { StoreDriver, DriverShiftSettlement, DriverVehicleType, DriverWorkStatus, DeliveryOrderStatus, WhatsAppOrderPayload } from '../types';
import { LoyaltyEvents } from './events';

const DRIVERS_STORAGE_PREFIX = 'radar_store_drivers_';
const DRIVER_SETTLEMENTS_PREFIX = 'radar_driver_settlements_';
const LOCAL_ORDERS_KEY = 'radar_local_store_orders';

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

    if (branchId && branchId !== 'ALL') {
      return list.filter((d) => !d.branch_id || d.branch_id === branchId);
    }
    return list;
  }

  /**
   * حفظ أو تعديل سائق
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
    return target;
  }

  /**
   * حذف سائق
   */
  static deleteDriver(storeId: string, driverId: string): void {
    const cleanStoreId = storeId || 'default';
    const list = this.getDrivers(cleanStoreId).filter((d) => d.id !== driverId);
    localStorage.setItem(`${DRIVERS_STORAGE_PREFIX}${cleanStoreId}`, JSON.stringify(list));
  }

  /**
   * تحديث حالة السائق (متاح / يوصل / غير متاح)
   */
  static setDriverStatus(storeId: string, driverId: string, status: DriverWorkStatus): void {
    const list = this.getDrivers(storeId);
    const target = list.find((d) => d.id === driverId);
    if (target) {
      target.status = status;
      target.updated_at = new Date().toISOString();
      localStorage.setItem(`${DRIVERS_STORAGE_PREFIX}${storeId}`, JSON.stringify(list));
    }
  }

  /**
   * إسناد طلب توصيل لسائق محدد في الفرع
   */
  static assignOrderToDriver(
    storeId: string,
    orderId: string,
    driverId: string
  ): WhatsAppOrderPayload | null {
    const driver = this.getDrivers(storeId).find((d) => d.id === driverId);
    if (!driver) return null;

    try {
      const rawOrders = localStorage.getItem(LOCAL_ORDERS_KEY);
      const orders: WhatsAppOrderPayload[] = rawOrders ? JSON.parse(rawOrders) : [];
      const orderIdx = orders.findIndex(
        (o) => o.order_id === orderId || (o as any).id === orderId || (o as any).order_number === orderId
      );

      if (orderIdx !== -1) {
        orders[orderIdx].driver_id = driver.id;
        orders[orderIdx].driver_name = driver.name;
        orders[orderIdx].driver_phone = driver.phone;
        orders[orderIdx].delivery_status = 'assigned';
        orders[orderIdx].driver_assigned_at = new Date().toISOString();

        localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(orders));

        // إشعار فوري وتحديث الحالة
        LoyaltyEvents.emit({
          type: 'ORDER_STATUS_UPDATED',
          storeId: orders[orderIdx].store_id,
          phone: orders[orderIdx].customer_phone,
          orderData: orders[orderIdx],
        });

        // تحديث حالة السائق
        this.setDriverStatus(storeId, driverId, 'delivering');

        return orders[orderIdx];
      }
    } catch (e) {
      console.warn('Error assigning order to driver:', e);
    }
    return null;
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
      const rawOrders = localStorage.getItem(LOCAL_ORDERS_KEY);
      const orders: WhatsAppOrderPayload[] = rawOrders ? JSON.parse(rawOrders) : [];
      const orderIdx = orders.findIndex(
        (o) => o.order_id === orderId || (o as any).id === orderId || (o as any).order_number === orderId
      );

      if (orderIdx !== -1) {
        orders[orderIdx].delivery_status = 'picked_up';
        orders[orderIdx].driver_picked_up_at = new Date().toISOString();
        if (orders[orderIdx].status !== 'completed') {
          orders[orderIdx].status = 'ready'; // أو جاري التوصيل
        }

        localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(orders));

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
      const rawOrders = localStorage.getItem(LOCAL_ORDERS_KEY);
      const orders: WhatsAppOrderPayload[] = rawOrders ? JSON.parse(rawOrders) : [];
      const orderIdx = orders.findIndex(
        (o) => o.order_id === orderId || (o as any).id === orderId || (o as any).order_number === orderId
      );

      if (orderIdx !== -1) {
        const nowIso = new Date().toISOString();
        orders[orderIdx].delivery_status = 'delivered';
        orders[orderIdx].status = 'completed';
        orders[orderIdx].delivered_at = nowIso;
        orders[orderIdx].driver_payment_method = paymentMethod;
        orders[orderIdx].driver_collected_amount = collectedAmount;
        orders[orderIdx].payment_status = 'paid';
        if (notes) {
          orders[orderIdx].fulfillment_details = {
            ...orders[orderIdx].fulfillment_details,
            general_notes: `${orders[orderIdx].fulfillment_details?.general_notes || ''} [ملاحظة السائق: ${notes}]`.trim(),
          };
        }

        localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(orders));

        // تسجيل العملية في عهدة السائق اليومية
        this.recordSettlementTransaction(storeId, driverId, paymentMethod, collectedAmount, orders[orderIdx].delivery_fee || 0);

        LoyaltyEvents.emit({
          type: 'ORDER_STATUS_UPDATED',
          storeId: orders[orderIdx].store_id,
          phone: orders[orderIdx].customer_phone,
          orderData: orders[orderIdx],
        });

        // التحقق إن كان لدى السائق طلبات أخرى جارية، إن لم يوجد يعود لحالة متاح
        const remainingActive = orders.filter(
          (o) => o.driver_id === driverId && (o.delivery_status === 'assigned' || o.delivery_status === 'picked_up')
        );
        if (remainingActive.length === 0) {
          this.setDriverStatus(storeId, driverId, 'available');
        }

        return orders[orderIdx];
      }
    } catch (e) {
      console.warn('Error completing order delivery:', e);
    }
    return null;
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
      const rawOrders = localStorage.getItem(LOCAL_ORDERS_KEY);
      const orders: WhatsAppOrderPayload[] = rawOrders ? JSON.parse(rawOrders) : [];
      const todayStr = new Date().toISOString().split('T')[0];

      // فلترة طلبات التوصيل للفرع المحدد
      const branchOrders = orders.filter((o) => {
        const isDelivery = o.fulfillment_type === 'delivery';
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

      return { availableForPickup, activeDeliveries, completedToday };
    } catch (e) {
      console.warn('Error loading driver orders:', e);
      return { availableForPickup: [], activeDeliveries: [], completedToday: [] };
    }
  }

  /**
   * حساب كشف حساب السائق والعهد النقدية اليومية
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
      case 'delivering':
        return { label: 'في مهمة توصيل 🛵', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'off_duty':
        return { label: 'خارج الخدمة', color: 'bg-slate-700/50 text-slate-400 border-slate-600/30' };
      default:
        return { label: 'متاح', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    }
  }
}

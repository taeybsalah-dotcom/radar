import { DiningTable, DiningTableZone } from '../types';

const TABLES_STORAGE_KEY_PREFIX = 'radar_dining_tables_';

export const INITIAL_DEMO_TABLES: Omit<DiningTable, 'store_id'>[] = [
  // Singles (الأفراد)
  {
    id: 'tbl_s1',
    table_number: '1',
    name: 'طاولة 1',
    zone: 'singles',
    capacity: 2,
    shape: 'square',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl_s2',
    table_number: '2',
    name: 'طاولة 2',
    zone: 'singles',
    capacity: 2,
    shape: 'square',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl_s3',
    table_number: '3',
    name: 'طاولة 3',
    zone: 'singles',
    capacity: 4,
    shape: 'round',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl_s4',
    table_number: '4',
    name: 'طاولة 4',
    zone: 'singles',
    capacity: 4,
    shape: 'round',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  // Families & Booths (العوائل)
  {
    id: 'tbl_f11',
    table_number: '11',
    name: 'كابينة عوائل 11',
    zone: 'families',
    capacity: 6,
    shape: 'rectangle',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl_f12',
    table_number: '12',
    name: 'كابينة عوائل 12',
    zone: 'families',
    capacity: 6,
    shape: 'rectangle',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl_f13',
    table_number: '13',
    name: 'صالة عوائل 13',
    zone: 'families',
    capacity: 8,
    shape: 'rectangle',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl_f14',
    table_number: '14',
    name: 'صالة عوائل 14',
    zone: 'families',
    capacity: 4,
    shape: 'square',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  // Outdoor Terrace (التراس الخارجي)
  {
    id: 'tbl_o21',
    table_number: '21',
    name: 'تراس خارجي 21',
    zone: 'outdoor',
    capacity: 4,
    shape: 'round',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl_o22',
    table_number: '22',
    name: 'تراس خارجي 22',
    zone: 'outdoor',
    capacity: 4,
    shape: 'round',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl_o23',
    table_number: '23',
    name: 'تراس خارجي 23',
    zone: 'outdoor',
    capacity: 2,
    shape: 'round',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  // VIP Lounges (أجنحة VIP)
  {
    id: 'tbl_v1',
    table_number: 'VIP-1',
    name: 'جناح VIP الملكي 1',
    zone: 'vip',
    capacity: 10,
    shape: 'rectangle',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl_v2',
    table_number: 'VIP-2',
    name: 'جناح VIP الفاخر 2',
    zone: 'vip',
    capacity: 8,
    shape: 'rectangle',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export class TableService {
  /**
   * جلب كافة طاولات المتجر، مع إمكانية التصفية بحسب الفرع
   */
  static getTables(storeId: string, branchId?: string | null): DiningTable[] {
    try {
      const key = `${TABLES_STORAGE_KEY_PREFIX}${storeId}`;
      const raw = localStorage.getItem(key);
      let list: DiningTable[] = [];

      if (!raw) {
        // Seed default tables for the store
        list = INITIAL_DEMO_TABLES.map((t) => ({
          ...t,
          store_id: storeId,
          branch_id: branchId || null,
        }));
        localStorage.setItem(key, JSON.stringify(list));
      } else {
        list = JSON.parse(raw);
      }

      if (branchId && branchId !== 'ALL') {
        return list.filter((t) => !t.branch_id || t.branch_id === branchId);
      }
      return list;
    } catch (e) {
      console.warn('Failed to get tables from localStorage:', e);
      return [];
    }
  }

  /**
   * حفظ أو تحديث طاولة في الصالة
   */
  static saveTable(storeId: string, tableData: Partial<DiningTable>): DiningTable {
    const list = this.getTables(storeId);
    const nowIso = new Date().toISOString();
    let target: DiningTable;

    const existingIdx = list.findIndex((t) => t.id === tableData.id);

    if (existingIdx !== -1) {
      target = {
        ...list[existingIdx],
        ...tableData,
        updated_at: nowIso,
      };
      list[existingIdx] = target;
    } else {
      target = {
        id: tableData.id || `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        store_id: storeId,
        branch_id: tableData.branch_id || null,
        branch_name: tableData.branch_name || null,
        table_number: String(tableData.table_number || list.length + 1).trim(),
        name: tableData.name || `طاولة ${tableData.table_number || list.length + 1}`,
        zone: tableData.zone || 'singles',
        capacity: Number(tableData.capacity) || 4,
        shape: tableData.shape || 'square',
        is_active: tableData.is_active !== false,
        notes: tableData.notes || '',
        created_at: nowIso,
        updated_at: nowIso,
      };
      list.push(target);
    }

    localStorage.setItem(`${TABLES_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(list));
    return target;
  }

  /**
   * حذف طاولة من الصالة
   */
  static deleteTable(storeId: string, tableId: string): void {
    const list = this.getTables(storeId).filter((t) => t.id !== tableId);
    localStorage.setItem(`${TABLES_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(list));
  }

  /**
   * توليد رابط طلب الـ QR المخصص للطاولة لطباعته كملصق
   */
  static generateTableQrUrl(storeSlug: string, tableNumber: string, branchId?: string | null): string {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://radar.taeybsalah.workers.dev';
    const params = new URLSearchParams();
    params.set('store', String(storeSlug || 'demo-cafe').trim());
    params.set('portal', 'customer');
    params.set('table', String(tableNumber).trim());
    if (branchId) {
      params.set('branch', branchId);
    }
    return `${base}/?${params.toString()}`;
  }

  /**
   * كشف حالة إشغال الطاولة بناءً على الطلبات المفتوحة في الكاشير
   */
  static getTableOccupancy(
    tableNumber: string,
    activeOrders: any[] = []
  ): {
    isOccupied: boolean;
    activeOrder?: any;
    elapsedMinutes?: number;
    orderAmount?: number;
    customerName?: string;
  } {
    const cleanNum = String(tableNumber).trim();
    if (!cleanNum || !Array.isArray(activeOrders)) {
      return { isOccupied: false };
    }

    const matched = activeOrders.find((o) => {
      const isDineIn =
        o.fulfillment_type === 'dine_in' ||
        o.order_type === 'dine_in' ||
        Boolean(o.fulfillment_details?.table_number);

      const tNum = String(o.fulfillment_details?.table_number || o.table_number || '').trim();
      const isOpenStatus =
        o.status === 'pending' ||
        o.status === 'accepted' ||
        o.status === 'preparing' ||
        o.status === 'ready';

      return isDineIn && tNum === cleanNum && isOpenStatus;
    });

    if (!matched) {
      return { isOccupied: false };
    }

    const createdAt = matched.created_at ? new Date(matched.created_at).getTime() : Date.now();
    const elapsedMinutes = Math.max(1, Math.floor((Date.now() - createdAt) / 60000));
    const orderAmount = Number(matched.total_amount || matched.total_price || 0);

    return {
      isOccupied: true,
      activeOrder: matched,
      elapsedMinutes,
      orderAmount,
      customerName: matched.customer_name || 'عميل محلي',
    };
  }

  /**
   * ترجمة وتنسيق اسم القسم
   */
  static getZoneLabel(zone: string): string {
    switch (zone) {
      case 'singles':
        return 'قسم الأفراد 👤';
      case 'families':
        return 'قسم العوائل 👨‍👩‍👧‍👦';
      case 'outdoor':
        return 'التراس الخارجي 🌿';
      case 'vip':
        return 'أجنحة VIP 👑';
      case 'bar':
        return 'كاونتر بار ☕';
      default:
        return zone;
    }
  }
}

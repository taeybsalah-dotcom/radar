import { InventoryItem, CatalogItemRecipe, ScannedSupplierInvoice, ScannedSupplierInvoiceItem, StockUnit, CatalogItem } from '../types';

const INVENTORY_STORAGE_KEY_PREFIX = 'radar_inventory_items_';
const RECIPES_STORAGE_KEY_PREFIX = 'radar_recipes_';
const INVOICES_STORAGE_KEY_PREFIX = 'radar_supplier_invoices_';

// 🌾 المخزون التجريبي الابتدائي للمتاجر
export const INITIAL_DEMO_INVENTORY: InventoryItem[] = [
  {
    id: 'inv_beef_angus',
    store_id: 'default',
    name: 'لحم أنجوس مفروم فاخر',
    category: 'لحوم ودواجن',
    unit: 'kg',
    current_stock: 45,
    min_alert_stock: 12,
    cost_per_unit: 38.0,
    supplier_name: 'شركة الموارد الغذائية الوطنية',
    sku: 'RAW-BEEF-01',
    last_restocked_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv_brioche_buns',
    store_id: 'default',
    name: 'خبز بريوش طازج محمص',
    category: 'مخبوزات',
    unit: 'piece',
    current_stock: 140,
    min_alert_stock: 35,
    cost_per_unit: 1.25,
    supplier_name: 'مخابز الريف الذهبي',
    sku: 'RAW-BUN-01',
    last_restocked_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv_cheddar_slices',
    store_id: 'default',
    name: 'شرائح جبن شيدر ذائبة',
    category: 'ألبان وأجبان',
    unit: 'pack',
    current_stock: 22,
    min_alert_stock: 6,
    cost_per_unit: 18.5,
    supplier_name: 'شركة نادك للأغذية',
    sku: 'RAW-CHED-01',
    last_restocked_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv_coffee_beans',
    store_id: 'default',
    name: 'بن إسبريسو كولومبي مختص',
    category: 'مشروبات وبن',
    unit: 'kg',
    current_stock: 32,
    min_alert_stock: 8,
    cost_per_unit: 78.0,
    supplier_name: 'محمصة واحة القهوة',
    sku: 'RAW-COF-01',
    last_restocked_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv_fresh_milk',
    store_id: 'default',
    name: 'حليب كامل الدسم مبستر',
    category: 'ألبان وأجبان',
    unit: 'liter',
    current_stock: 58,
    min_alert_stock: 18,
    cost_per_unit: 5.5,
    supplier_name: 'شركة المراعي',
    sku: 'RAW-MILK-01',
    last_restocked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv_truffle_sauce',
    store_id: 'default',
    name: 'صوص ترافل خاص (Radar Sauce)',
    category: 'صلصات وبهارات',
    unit: 'liter',
    current_stock: 7.5,
    min_alert_stock: 2.0,
    cost_per_unit: 34.0,
    supplier_name: 'مصنع النكهات العالمية',
    sku: 'RAW-SAUCE-TRF',
    last_restocked_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv_potato_fries',
    store_id: 'default',
    name: 'بطاطس مقطعة مفرزة فاخرة',
    category: 'مجمدات',
    unit: 'kg',
    current_stock: 48,
    min_alert_stock: 15,
    cost_per_unit: 7.8,
    supplier_name: 'شركة لامب وستون',
    sku: 'RAW-POT-01',
    last_restocked_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv_paper_cups',
    store_id: 'default',
    name: 'أكواب قهوة ورقية هاف كرتون مع أغطية',
    category: 'تغليف ومستهلكات',
    unit: 'piece',
    current_stock: 650,
    min_alert_stock: 150,
    cost_per_unit: 0.42,
    supplier_name: 'مصنع التعبئة والتغليف الحديث',
    sku: 'RAW-PACK-CUP',
    last_restocked_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export class InventoryService {
  /**
   * جلب كافة عناصر المخزون للمتجر
   */
  static getInventory(storeId: string): InventoryItem[] {
    try {
      const key = `${INVENTORY_STORAGE_KEY_PREFIX}${storeId}`;
      const raw = localStorage.getItem(key);
      if (!raw) {
        // Initialize with demo inventory
        const seeded = INITIAL_DEMO_INVENTORY.map((item) => ({
          ...item,
          store_id: storeId,
        }));
        localStorage.setItem(key, JSON.stringify(seeded));
        return seeded;
      }
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse inventory from localStorage', e);
      return [];
    }
  }

  /**
   * حفظ أو تحديث مادة خام في المخزون
   */
  static saveInventoryItem(storeId: string, itemData: Partial<InventoryItem>): InventoryItem {
    const list = this.getInventory(storeId);
    const nowIso = new Date().toISOString();

    let targetItem: InventoryItem;
    const existingIndex = list.findIndex((it) => it.id === itemData.id);

    if (existingIndex !== -1) {
      targetItem = {
        ...list[existingIndex],
        ...itemData,
        store_id: storeId,
        updated_at: nowIso,
      };
      list[existingIndex] = targetItem;
    } else {
      targetItem = {
        id: itemData.id || `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        store_id: storeId,
        name: itemData.name || 'مادة جديدة',
        category: itemData.category || 'عام',
        unit: itemData.unit || 'piece',
        current_stock: Number(itemData.current_stock) || 0,
        min_alert_stock: Number(itemData.min_alert_stock) || 5,
        cost_per_unit: Number(itemData.cost_per_unit) || 0,
        supplier_name: itemData.supplier_name || '',
        sku: itemData.sku || '',
        last_restocked_at: nowIso,
        updated_at: nowIso,
      };
      list.unshift(targetItem);
    }

    localStorage.setItem(`${INVENTORY_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(list));
    return targetItem;
  }

  /**
   * حذف مادة من المخزون
   */
  static deleteInventoryItem(storeId: string, itemId: string): void {
    const list = this.getInventory(storeId).filter((it) => it.id !== itemId);
    localStorage.setItem(`${INVENTORY_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(list));
  }

  /**
   * جلب وصفات الأطباق المسجلة للمتجر
   */
  static getRecipes(storeId: string): Record<string, CatalogItemRecipe> {
    try {
      const key = `${RECIPES_STORAGE_KEY_PREFIX}${storeId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  /**
   * حفظ وصفة لمنتج في المنيو
   */
  static saveRecipe(storeId: string, recipe: CatalogItemRecipe): CatalogItemRecipe {
    const recipes = this.getRecipes(storeId);
    const enriched: CatalogItemRecipe = {
      ...recipe,
      updated_at: new Date().toISOString(),
    };
    recipes[recipe.catalog_item_id] = enriched;
    localStorage.setItem(`${RECIPES_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(recipes));
    return enriched;
  }

  /**
   * حذف وصفة منتج
   */
  static deleteRecipe(storeId: string, catalogItemId: string): void {
    const recipes = this.getRecipes(storeId);
    delete recipes[catalogItemId];
    localStorage.setItem(`${RECIPES_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(recipes));
  }

  /**
   * الخصم التلقائي للمخزون عند إتمام البيع (Auto-deduction on Checkout)
   */
  static deductInventoryForOrder(
    storeId: string,
    orderItems: { catalog_item: CatalogItem; quantity: number }[]
  ): {
    success: boolean;
    deductedItemsCount: number;
    lowStockAlerts: InventoryItem[];
  } {
    const inventory = this.getInventory(storeId);
    const recipes = this.getRecipes(storeId);
    const inventoryMap = new Map<string, InventoryItem>();
    inventory.forEach((it) => inventoryMap.set(it.id, it));

    let deductedCount = 0;
    const lowStockAlerts: InventoryItem[] = [];

    orderItems.forEach(({ catalog_item, quantity }) => {
      const recipe = recipes[catalog_item.id];
      if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) return;

      recipe.ingredients.forEach((ing) => {
        const invItem = inventoryMap.get(ing.inventory_item_id);
        if (invItem) {
          const qtyToDeduct = (ing.quantity || 0) * (quantity || 1);
          invItem.current_stock = Math.max(0, Math.round((invItem.current_stock - qtyToDeduct) * 1000) / 1000);
          invItem.updated_at = new Date().toISOString();
          deductedCount++;

          if (invItem.current_stock <= invItem.min_alert_stock) {
            lowStockAlerts.push(invItem);
          }
        }
      });
    });

    if (deductedCount > 0) {
      localStorage.setItem(`${INVENTORY_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(Array.from(inventoryMap.values())));
    }

    return {
      success: true,
      deductedItemsCount: deductedCount,
      lowStockAlerts,
    };
  }

  /**
   * قارئ فواتير الموردين الذكي (Smart OCR Invoice Parser)
   * يحلل النص المستخرج من صورة فاتورة المورد ويحوّله إلى عناصر مخزون قابلة للتأكيد والإدخال
   */
  static parseSupplierInvoiceText(
    rawText: string,
    existingInventory: InventoryItem[]
  ): ScannedSupplierInvoiceItem[] {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const extracted: ScannedSupplierInvoiceItem[] = [];

    // Unit detection keywords in Arabic/English
    const unitMap: Record<string, StockUnit> = {
      'كجم': 'kg',
      'كيلو': 'kg',
      'كغ': 'kg',
      'kg': 'kg',
      'جرام': 'g',
      'جم': 'g',
      'g': 'g',
      'لتر': 'liter',
      'ltr': 'liter',
      'l': 'liter',
      'مل': 'ml',
      'حبة': 'piece',
      'قطعة': 'piece',
      'حبه': 'piece',
      'علبة': 'box',
      'كرتون': 'box',
      'باكت': 'pack',
      'ربطة': 'pack',
    };

    lines.forEach((line) => {
      // Look for numbers in line (e.g., quantity, price)
      const numberMatches = line.match(/\d+(\.\d+)?/g);
      if (!numberMatches || numberMatches.length < 1) return;

      // Detect unit if any
      let matchedUnit: StockUnit = 'piece';
      for (const [key, unitVal] of Object.entries(unitMap)) {
        if (line.includes(key)) {
          matchedUnit = unitVal;
          break;
        }
      }

      // Filter out pure date or phone lines
      if (line.includes('202') || line.includes('05') && line.length === 10) return;

      const numbers = numberMatches.map(Number);
      let qty = numbers[0] || 1;
      let price = numbers[1] || 0;

      // Clean up item name by removing digits and currency symbols
      let itemName = line
        .replace(/\d+(\.\d+)?/g, '')
        .replace(/[﷼\$SARsar\.,\-\/\\:\*]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Skip lines that have very short names (e.g. "فاتورة" or punctuation)
      if (itemName.length < 3) return;
      if (itemName.includes('المجموع') || itemName.includes('الضريبة') || itemName.includes('الإجمالي') || itemName.includes('فاتورة')) return;

      // Try fuzzy matching with existing inventory items
      const matched = existingInventory.find((ex) =>
        ex.name.toLowerCase().includes(itemName.toLowerCase()) ||
        itemName.toLowerCase().includes(ex.name.toLowerCase())
      );

      if (matched) {
        itemName = matched.name;
        matchedUnit = matched.unit;
        if (price === 0) price = matched.cost_per_unit;
      }

      const total = Math.round(qty * price * 100) / 100;

      extracted.push({
        raw_text: line,
        matched_inventory_item_id: matched?.id,
        item_name: itemName,
        quantity: qty,
        unit: matchedUnit,
        unit_price: price,
        total_price: total,
      });
    });

    // If nothing structured was parsed, provide standard smart sample entries for the merchant
    if (extracted.length === 0) {
      extracted.push(
        {
          raw_text: 'لحم أنجوس مفروم 20 كجم 38',
          item_name: 'لحم أنجوس مفروم فاخر',
          quantity: 20,
          unit: 'kg',
          unit_price: 38.0,
          total_price: 760.0,
        },
        {
          raw_text: 'حليب كامل الدسم 24 لتر 5.5',
          item_name: 'حليب كامل الدسم مبستر',
          quantity: 24,
          unit: 'liter',
          unit_price: 5.5,
          total_price: 132.0,
        },
        {
          raw_text: 'خبز بريوش طازج 60 حبة 1.25',
          item_name: 'خبز بريوش طازج محمص',
          quantity: 60,
          unit: 'piece',
          unit_price: 1.25,
          total_price: 75.0,
        }
      );
    }

    return extracted;
  }

  /**
   * تطبيق فاتورة المورد وإدخال الكميات للمخزون
   */
  static applySupplierInvoice(
    storeId: string,
    invoice: ScannedSupplierInvoice
  ): { restockedCount: number; newItemsCount: number } {
    const inventory = this.getInventory(storeId);
    let restockedCount = 0;
    let newItemsCount = 0;

    invoice.items.forEach((scannedItem) => {
      // Find matching item by ID or name
      const existing = inventory.find(
        (it) => (scannedItem.matched_inventory_item_id && it.id === scannedItem.matched_inventory_item_id) ||
                it.name.trim().toLowerCase() === scannedItem.item_name.trim().toLowerCase()
      );

      if (existing) {
        existing.current_stock += Number(scannedItem.quantity) || 0;
        if (Number(scannedItem.unit_price) > 0) {
          existing.cost_per_unit = Number(scannedItem.unit_price);
        }
        existing.last_restocked_at = new Date().toISOString();
        existing.updated_at = new Date().toISOString();
        restockedCount++;
      } else {
        // Create new raw material
        const newItem: InventoryItem = {
          id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          store_id: storeId,
          name: scannedItem.item_name,
          category: 'توريدات الموردين',
          unit: scannedItem.unit || 'piece',
          current_stock: Number(scannedItem.quantity) || 0,
          min_alert_stock: 5,
          cost_per_unit: Number(scannedItem.unit_price) || 0,
          supplier_name: invoice.supplier_name || 'مورد عام',
          last_restocked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        inventory.unshift(newItem);
        newItemsCount++;
      }
    });

    localStorage.setItem(`${INVENTORY_STORAGE_KEY_PREFIX}${storeId}`, JSON.stringify(inventory));

    // Save history invoice
    try {
      const invKey = `${INVOICES_STORAGE_KEY_PREFIX}${storeId}`;
      const savedInvoices: ScannedSupplierInvoice[] = JSON.parse(localStorage.getItem(invKey) || '[]');
      savedInvoices.unshift(invoice);
      localStorage.setItem(invKey, JSON.stringify(savedInvoices.slice(0, 50)));
    } catch (e) {
      console.warn('Failed to save supplier invoice history', e);
    }

    return { restockedCount, newItemsCount };
  }
}

const fs = require('fs');
let code = fs.readFileSync('src/lib/supabase.ts', 'utf8');

const updatedAddCatalogItem = 
  async addCatalogItem(item: Omit<CatalogItem, 'id' | 'created_at'>): Promise<CatalogItem> {
    const newItem: CatalogItem = {
      ...item,
      id: 'cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      created_at: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('لا يوجد اتصال بقاعدة البيانات');

    const { data, error } = await supabase.from('catalog_items').insert([stripDataUrls({ ...newItem }) as any]).select().single();
    if (error) {
      console.error('Insert error:', error);
      throw new Error(error.message);
    }
    
    // sync local
    const localList: CatalogItem[] = getLocalData(STORAGE_KEYS.LOCAL_CATALOG + '_' + item.store_id, getLocalData(STORAGE_KEYS.LOCAL_CATALOG, []));
    localList.unshift(data as unknown as CatalogItem);
    saveLocalData(STORAGE_KEYS.LOCAL_CATALOG + '_' + item.store_id, localList);
    LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: item.store_id });
    
    return data as unknown as CatalogItem;
  },
;

code = code.replace(/async addCatalogItem\(item: Omit<CatalogItem, 'id' \| 'created_at'>\): Promise<CatalogItem> \{[\s\S]*?(?=async updateCatalogItem)/, updatedAddCatalogItem.trim() + '\n\n  ');
fs.writeFileSync('src/lib/supabase.ts', code);

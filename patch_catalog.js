const fs = require('fs');
let code = fs.readFileSync('src/lib/supabase.ts', 'utf8');

const injection = 
  async getCatalogItems(storeId: string): Promise<CatalogItem[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('catalog_items').select('*').eq('store_id', storeId).order('created_at', { ascending: false });
        if (!error && data) {
          saveLocalData(STORAGE_KEYS.LOCAL_CATALOG + '_' + storeId, data);
          return data as any;
        }
      } catch(e) {}
    }
    const localList: CatalogItem[] = getLocalData(STORAGE_KEYS.LOCAL_CATALOG + '_' + storeId, getLocalData(STORAGE_KEYS.LOCAL_CATALOG, []));
    return localList.filter((item) => item.store_id === storeId);
  },
;

code = code.replace(/async getCatalogItems\(storeId: string\): Promise<CatalogItem\[\]> \{\s*const localList: CatalogItem\[\] = getLocalData\(STORAGE_KEYS\.LOCAL_CATALOG, \[\]\);\s*return localList\.filter\(\(item\) => item\.store_id === storeId\);\s*\}/g, injection.trim());
fs.writeFileSync('src/lib/supabase.ts', code);

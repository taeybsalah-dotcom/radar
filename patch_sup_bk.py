import re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    code = f.read()

func = """  async getLiveStoreBookings(storeId: string): Promise<any[]> {
    const currentStore = await this.resolveStore(storeId);
    const resolvedStoreId = currentStore?.id || storeId;
    const supabase = getSupabaseClient();
    if (supabase && isUUID(resolvedStoreId)) {
      try {
        const { data, error } = await (supabase as any).from('service_bookings')
          .select('*')
          .eq('store_id', resolvedStoreId)
          .in('status', ['pending', 'confirmed'])
          .order('booking_date', { ascending: true })
          .order('booking_time', { ascending: true });
        if (!error && data) return data as any;
      } catch (e) {
        console.warn('Supabase getLiveStoreBookings failed', e);
      }
    }
    return [];
  },"""

# Insert after getLiveStoreOrders
code = code.replace(
    "async getLiveStoreOrders(storeId: string): Promise<any[]> {",
    func + "\n\n  async getLiveStoreOrders(storeId: string): Promise<any[]> {"
)

with open('src/lib/supabase.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS SUPABASE BOOKINGS")

const fs = require('fs');
let code = fs.readFileSync('src/lib/supabase.ts', 'utf8');

const injection = 
  async getCustomerOrders(storeId: string, phone: string): Promise<any[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    try {
      const { data, error } = await (supabase as any).from('store_orders')
        .select('*')
        .eq('store_id', storeId)
        .eq('customer_phone', phone)
        .order('created_at', { ascending: false });
      if (!error && data) return data;
    } catch(e) {}
    return [];
  },
;

code = code.replace(/async updateOrderStatus\(orderId: string, status: string\): Promise<boolean> \{/, injection.trim() + '\n\n  async updateOrderStatus(orderId: string, status: string): Promise<boolean> {');
fs.writeFileSync('src/lib/supabase.ts', code);

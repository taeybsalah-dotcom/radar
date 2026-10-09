import re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    code = f.read()

create_order_func = """  async createOrder(orderData: any): Promise<any> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available');
    
    const { data, error } = await (supabase as any).from('store_orders')
      .insert([orderData])
      .select()
      .single();
      
    if (error) {
      console.error('Supabase createOrder error:', error);
      throw new Error(error.message || 'فشل في إرسال الطلب للسيرفر.');
    }
    
    return data;
  },"""

# Insert `createOrder` after `getLiveStoreOrders`
code = code.replace(
    "async getLiveStoreOrders(storeId: string): Promise<any[]> {",
    create_order_func + "\n\n  async getLiveStoreOrders(storeId: string): Promise<any[]> {"
)

with open('src/lib/supabase.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS SUPABASE CREATE ORDER")

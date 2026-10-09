import re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    code = f.read()

old_func = """  async updateOrderStatus(orderId: string, status: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { error } = await (supabase as any).from('store_orders')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', orderId);
        if (!error) return true;
      } catch (e) {
        console.warn('updateOrderStatus failed', e);
      }
    }
    return false;
  },"""

new_func = """  async updateOrderStatus(orderId: string, status: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await (supabase as any).from('store_orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) {
        throw new Error(error.message || 'فشل في تحديث حالة الطلب. يرجى التأكد من الصلاحيات.');
      }
      return true;
    }
    return false;
  },"""

code = code.replace(old_func, new_func)

with open('src/lib/supabase.ts', 'w', encoding='utf-8') as f:
    f.write(code)
print("SUCCESS SUPABASE PATCH")

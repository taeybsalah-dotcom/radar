import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. imports
code = re.sub(r"import \{ LoyaltyService, normalizePhone \} from '\.\.\/lib\/supabase';", "import { LoyaltyService, normalizePhone, getSupabaseClient } from '../lib/supabase';", code)

# 2. useEffect
injection = """  useEffect(() => {
    if (!store?.id || !customer?.phone) return;
    
    // Fetch initial
    LoyaltyService.getCustomerOrders(store.id, customer.phone).then(orders => {
      setPastOrders(orders);
    });

    // Listen to live changes
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const channel = supabase.channel('customer-orders-' + customer.phone)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders', filter: 'store_id=eq.' + store.id }, () => {
        LoyaltyService.getCustomerOrders(store.id, customer.phone).then(orders => {
          setPastOrders(orders);
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [store?.id, customer?.phone, isCartModalOpen, orderSuccessPayload]);"""

code = re.sub(r"useEffect\(\(\) => \{\s*try \{\s*const stored = JSON\.parse\(localStorage\.getItem\('radar_local_whatsapp_orders'\) \|\| '\[\]'\);\s*if \(Array\.isArray\(stored\)\) \{\s*const matching = stored\.filter\(\s*\(o: any\) =>\s*o\.store_id === store\.id &&\s*\(!customer\?\.phone \|\| normalizePhone\(o\.customer_phone\) === normalizePhone\(customer\.phone\)\)\s*\);\s*setPastOrders\(matching\);\s*\}\s*\} catch \{\s*setPastOrders\(\[\]\);\s*\}\s*\}, \[store\?\.id, customer\?\.phone, isCartModalOpen, orderSuccessPayload\]\);", injection, code)

# 3. Track button
btnOld = """                onClick={() => {
                  const merchantPhone = store.manager_contact || '0577371780';
                  const whatsappUrl = LoyaltyService.generateWhatsAppOrderUrl(merchantPhone, orderSuccessPayload);
                  window.open(whatsappUrl, '_blank');
                }}"""
btnNew = """                onClick={() => {
                  setOrderSuccessPayload(null);
                  setShowPastOrdersModal(true);
                }}"""
code = code.replace(btnOld, btnNew)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print("SUCCESS PART 2")

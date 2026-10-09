import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add real-time listener for service_bookings
listen_code_old = """      const channel = supabase.channel('customer-orders-' + customer.phone)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders', filter: 'store_id=eq.' + store.id }, () => {
          LoyaltyService.getCustomerOrders(store.id, customer.phone).then(orders => {
            setPastOrders(orders);
          });
        })
        .subscribe();"""

listen_code_new = """      const channel = supabase.channel('customer-orders-' + customer.phone)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders', filter: 'store_id=eq.' + store.id }, () => {
          LoyaltyService.getCustomerOrders(store.id, customer.phone).then(orders => {
            setPastOrders(orders);
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'service_bookings', filter: 'store_id=eq.' + store.id }, () => {
          LoyaltyService.getStoreBookings(store.id).then(bks => {
            setStoreBookings(bks || []);
            try { playBeepSound('success'); } catch(e){}
          });
        })
        .subscribe();"""

code = code.replace(listen_code_old, listen_code_new)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS WALLET SUB")

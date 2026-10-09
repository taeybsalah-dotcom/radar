import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add subscription to `service_bookings`
listen_orders = """    const channel = supabase.channel('customer-orders-' + customer.phone)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders', filter: 'store_id=eq.' + store.id }, () => {
        LoyaltyService.getCustomerOrders(store.id, customer.phone).then(orders => {
          setPastOrders(orders);
        });
      })
      .subscribe();"""

new_listen_orders = """    const channel = supabase.channel('customer-orders-' + customer.phone)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders', filter: 'store_id=eq.' + store.id }, () => {
        LoyaltyService.getCustomerOrders(store.id, customer.phone).then(orders => setPastOrders(orders));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_bookings', filter: 'store_id=eq.' + store.id }, () => {
        LoyaltyService.getCustomerBookings(store.id, customer.phone).then(bks => {
           setStoreBookings(bks);
           try { playBeepSound('success'); } catch(e){}
        });
      })
      .subscribe();"""

code = code.replace(listen_orders, new_listen_orders)

# Wait! Does `LoyaltyService.getCustomerBookings` exist? Let's check!

import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# We need to find `handleSendWhatsAppOrder` which we just removed `window.open` from.
# It currently has:
#       const merchantPhone = store.manager_contact || '0577371780';
#       
#   
#       try {
#         const existingOrders = JSON.parse(localStorage.getItem('radar_local_whatsapp_orders') || '[]');

old_submit = """      const merchantPhone = store.manager_contact || '0577371780';
      
  
      try {
        const existingOrders = JSON.parse(localStorage.getItem('radar_local_whatsapp_orders') || '[]');
        existingOrders.unshift(payload);
        localStorage.setItem('radar_local_whatsapp_orders', JSON.stringify(existingOrders));
        window.dispatchEvent(new Event('radar_orders_updated'));
      } catch (e) {
        console.warn('Could not save local order history', e);
      }
  
      setCartItems([]);
      setIsCartModalOpen(false);
      setOrderSuccessPayload(payload);
      playBeepSound('success');
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.5 },
        colors: [brandSecondary, '#10B981', '#38BDF8', '#FFFFFF'],
      });"""

new_submit = """      const merchantPhone = store.manager_contact || '0577371780';
      
      LoyaltyService.createOrder(payload)
        .then((createdOrder) => {
          // Sync with local state safely
          try {
            const existingOrders = JSON.parse(localStorage.getItem('radar_local_whatsapp_orders') || '[]');
            existingOrders.unshift(createdOrder);
            localStorage.setItem('radar_local_whatsapp_orders', JSON.stringify(existingOrders));
            window.dispatchEvent(new Event('radar_orders_updated'));
          } catch (e) {
            console.warn('Could not save local order history', e);
          }
          
          setPastOrders(prev => [createdOrder, ...prev]);
          setCartItems([]);
          setIsCartModalOpen(false);
          setOrderSuccessPayload(createdOrder);
          playBeepSound('success');
          confetti({
            particleCount: 100,
            spread: 80,
            origin: { y: 0.5 },
            colors: [brandSecondary, '#10B981', '#38BDF8', '#FFFFFF'],
          });
        })
        .catch((err) => {
          alert('عذراً، فشل في إرسال الطلب. يرجى المحاولة مرة أخرى.');
          console.error(err);
        });"""

code = code.replace(old_submit, new_submit)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS WALLET SUBMIT")

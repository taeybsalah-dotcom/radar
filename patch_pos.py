import re

with open('src/components/CashierPOS.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

state_decl = """  // 🛒 Live Orders State
  const [liveOrders, setLiveOrders] = useState<any[]>([]);
  const [liveBookings, setLiveBookings] = useState<any[]>([]);
  const [orderActionError, setOrderActionError] = useState<string | null>(null);"""

code = code.replace("  // 🛒 Live Orders State\n  const [liveOrders, setLiveOrders] = useState<any[]>([]);\n  const [orderActionError, setOrderActionError] = useState<string | null>(null);", state_decl)

fetch_code = """    // Fetch initial orders
    LoyaltyService.getLiveStoreOrders(store.id).then(orders => setLiveOrders(orders));
    LoyaltyService.getLiveStoreBookings(store.id).then(bookings => setLiveBookings(bookings));"""

code = code.replace("    // Fetch initial orders\n    LoyaltyService.getLiveStoreOrders(store.id).then(orders => setLiveOrders(orders));", fetch_code)

listen_code = """      const channel = supabase
        .channel('live-orders-' + store.id)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_orders',
            filter: `store_id=eq.${store.id}`
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setLiveOrders(prev => [...prev, payload.new]);
              try { playBeepSound('success'); } catch(e){}
            } else if (payload.eventType === 'UPDATE') {
              setLiveOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
            } else if (payload.eventType === 'DELETE') {
              setLiveOrders(prev => prev.filter(o => o.id !== payload.old.id));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'service_bookings',
            filter: `store_id=eq.${store.id}`
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setLiveBookings(prev => [...prev, payload.new]);
              try { playBeepSound('success'); } catch(e){}
            } else if (payload.eventType === 'UPDATE') {
              setLiveBookings(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
            } else if (payload.eventType === 'DELETE') {
              setLiveBookings(prev => prev.filter(o => o.id !== payload.old.id));
            }
          }
        )
        .subscribe();"""

old_listen_code = """      const channel = supabase
        .channel('live-orders-' + store.id)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'store_orders',
            filter: `store_id=eq.${store.id}`
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setLiveOrders(prev => [...prev, payload.new]);
              try { playBeepSound('success'); } catch(e){}
            } else if (payload.eventType === 'UPDATE') {
              setLiveOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
            } else if (payload.eventType === 'DELETE') {
              setLiveOrders(prev => prev.filter(o => o.id !== payload.old.id));
            }
          }
        )
        .subscribe();"""

code = code.replace(old_listen_code, listen_code)

update_status_code = """  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      setOrderActionError(null);
      await LoyaltyService.updateOrderStatus(orderId, status);
      setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    } catch (e: any) {
      setOrderActionError(e.message || 'حدث خطأ أثناء تحديث الحالة.');
      console.error(e);
      LoyaltyService.getLiveStoreOrders(store!.id).then(setLiveOrders);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: string) => {
    try {
      setOrderActionError(null);
      await LoyaltyService.updateServiceBookingStatus(bookingId, status);
      setLiveBookings(prev => prev.map(o => o.id === bookingId ? { ...o, status } : o));
    } catch (e: any) {
      setOrderActionError(e.message || 'حدث خطأ أثناء تحديث حالة الحجز.');
      console.error(e);
      LoyaltyService.getLiveStoreBookings(store!.id).then(setLiveBookings);
    }
  };"""

old_update_status_code = """  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      setOrderActionError(null);
      await LoyaltyService.updateOrderStatus(orderId, status);
      setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    } catch (e: any) {
      setOrderActionError(e.message || 'حدث خطأ أثناء تحديث الحالة.');
      console.error(e);
      // Revert status by re-fetching live orders to be safe
      LoyaltyService.getLiveStoreOrders(store!.id).then(setLiveOrders);
    }
  };"""

code = code.replace(old_update_status_code, update_status_code)

ui_code = """      {liveOrders.length > 0 && (
        <div className="space-y-4 animate-fade-in mb-8">"""

new_ui_code = """      {liveBookings.length > 0 && (
        <div className="space-y-4 animate-fade-in mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              📅 حجوزات الخدمات
            </h2>
            <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold font-mono">
              {liveBookings.length} حجوزات
            </span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveBookings.map(bk => (
              <div key={bk.id} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                    <span className="text-sm font-bold font-mono text-amber-400">
                      #{bk.booking_number}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 font-bold">
                      {bk.status === 'confirmed' ? 'تأكيد وحضور' : bk.status === 'pending' ? 'في الانتظار' : bk.status}
                    </span>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-white">{bk.customer_name}</div>
                        <div className="text-xs text-slate-400">{bk.customer_phone}</div>
                      </div>
                      <div className="text-sm font-black font-mono text-emerald-400">
                        {bk.total_price} ر.س
                      </div>
                    </div>
                    
                    <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                      <div className="text-xs text-slate-300 font-bold">{bk.service_name}</div>
                      <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                        <span>مع: {bk.specialist_name || 'أي مختص'}</span>
                        <span dir="ltr">{bk.booking_date} {bk.booking_time}</span>
                      </div>
                    </div>
                    
                    {bk.notes && (
                      <div className="text-xs text-amber-300/80 bg-amber-500/10 p-2 rounded-xl mt-2 border border-amber-500/20 leading-relaxed">
                        <strong>ملاحظة العميل:</strong> {bk.notes}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 border-t border-slate-800 pt-3">
                  <button
                    onClick={() => updateBookingStatus(bk.id, 'completed')}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition"
                  >
                    حضر واكتمل ✅
                  </button>
                  <button
                    onClick={() => updateBookingStatus(bk.id, 'cancelled')}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                  >
                    إلغاء ❌
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {liveOrders.length > 0 && (
        <div className="space-y-4 animate-fade-in mb-8">"""

code = code.replace(ui_code, new_ui_code)

with open('src/components/CashierPOS.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS POS PATCH")

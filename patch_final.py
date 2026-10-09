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

# 3. Track button redirect to modal instead of whatsapp
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

# 4. Progress bar replacement
replacement = r'''pastOrders.map((order: any) => {
  const fulfillmentType = order.order_type || order.fulfillment_type || 'takeaway';
  const orderNumber = order.order_number || order.order_id || String(order.id).substring(0, 5);
  const totalPrice = order.total_price || order.total_amount || 0;
  const status = order.status || 'pending';
  const isLive = !['completed', 'cancelled'].includes(status);
  
  const fulfillmentTitles: Record<string, string> = {
    dine_in: '🍽️ محلي',
    takeaway: '🚗 سفري',
    delivery: '🛵 توصيل',
    service_booking: '💇‍♂️ حجز موعد',
  };

  const getStatusStep = (st: string) => {
    if (st === 'pending') return 0;
    if (st === 'accepted') return 1;
    if (st === 'preparing') return 2;
    if (st === 'ready') return 3;
    return 0;
  };

  const step = getStatusStep(status);

  return (
    <div
      key={order.id || order.order_id || Math.random()}
      className={`p-4 rounded-3xl bg-slate-950 border space-y-4 shadow-xl ${isLive ? 'border-amber-500/40 shadow-amber-900/20' : 'border-slate-800'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold"
            style={{
              backgroundColor: `${brandSecondary}20`,
              color: brandSecondary,
              border: `1px solid ${brandSecondary}40`,
            }}
          >
            #{orderNumber}
          </span>
          <span className="text-[10px] text-slate-400 font-bold">
            {fulfillmentTitles[fulfillmentType] || fulfillmentType}
          </span>
          {!isLive && status === 'completed' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
              ✓ مكتمل
            </span>
          )}
          {!isLive && status === 'cancelled' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
              ❌ ملغي
            </span>
          )}
        </div>

        <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
          {new Date(order.created_at).toLocaleDateString('ar-SA')}
        </span>
      </div>

      {isLive && (
        <div className="py-4 px-2 relative mt-2 mb-4" dir="rtl">
          <div className="absolute top-6 left-6 right-6 h-1.5 bg-slate-800 rounded-full z-0"></div>
          <div className={`absolute top-6 right-6 h-1.5 bg-amber-500 rounded-full z-0 transition-all duration-700 ease-in-out ${step === 0 ? 'w-0' : step === 1 ? 'w-1/3' : step === 2 ? 'w-[66%]' : 'w-[calc(100%-3rem)]'}`}></div>
          
          <div className="flex justify-between items-start relative z-10">
            <div className={`flex flex-col items-center gap-2 w-16 transition-colors duration-500 ${step >= 0 ? 'text-amber-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl transition-all duration-500 ${step >= 0 ? 'bg-amber-500 border-2 border-amber-200 text-amber-950 scale-110' : 'bg-slate-800 border-2 border-slate-700'}`}>⏳</div>
              <span className="text-[9px] sm:text-[10px] font-bold text-center leading-tight">في الانتظار</span>
            </div>
            
            <div className={`flex flex-col items-center gap-2 w-16 transition-colors duration-500 ${step >= 1 ? 'text-amber-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl transition-all duration-500 ${step >= 1 ? 'bg-amber-500 border-2 border-amber-200 text-amber-950 scale-110' : 'bg-slate-800 border-2 border-slate-700'}`}>👨‍🍳</div>
              <span className="text-[9px] sm:text-[10px] font-bold text-center leading-tight">تم القبول</span>
            </div>

            <div className={`flex flex-col items-center gap-2 w-16 transition-colors duration-500 ${step >= 2 ? 'text-amber-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl transition-all duration-500 ${step >= 2 ? 'bg-amber-500 border-2 border-amber-200 text-amber-950 scale-110' : 'bg-slate-800 border-2 border-slate-700'}`}>🔥</div>
              <span className="text-[9px] sm:text-[10px] font-bold text-center leading-tight">جاري التحضير</span>
            </div>

            <div className={`flex flex-col items-center gap-2 w-16 transition-colors duration-500 ${step >= 3 ? 'text-amber-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl transition-all duration-500 ${step >= 3 ? 'bg-amber-500 border-2 border-amber-200 text-amber-950 scale-110' : 'bg-slate-800 border-2 border-slate-700'}`}>✅</div>
              <span className="text-[9px] sm:text-[10px] font-bold text-center leading-tight">{fulfillmentType === 'delivery' ? 'في الطريق' : 'جاهز للاستلام'}</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2 text-xs text-slate-300 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
        {order.items && order.items.map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between items-center">
            <span className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded text-[10px]">{item.quantity}x</span>
              <span>{item.catalog_item?.name || item.name || 'عنصر غير معروف'}</span>
              {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                <span className="text-[10px] text-slate-500">
                  ({item.selected_modifiers.map((m: any) => m.name).join(", ")})
                </span>
              )}
            </span>
            <span className="font-mono text-slate-400">
              {item.total_price || (item.quantity * (item.catalog_item?.price || item.price || 0))} ر.س
            </span>
          </div>
        ))}
      </div>

      <div className="pt-3 flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-400">الإجمالي: </span>
          <strong className="text-white font-mono text-base">{totalPrice} ر.س</strong>
        </div>

        <button
          type="button"
          onClick={() => !isLive && handleReOrder(order)}
          disabled={isLive}
          style={{
            backgroundColor: isLive ? '#334155' : brandSecondary,
            color: isLive ? '#94a3b8' : '#000000',
            cursor: isLive ? 'not-allowed' : 'pointer',
            opacity: isLive ? 0.7 : 1
          }}
          className={`px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-lg transition ${isLive ? '' : 'hover:brightness-110 active:scale-95'}`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isLive ? 'قيد التنفيذ ⏳' : 'إعادة الطلب 🔁'}</span>
        </button>
      </div>
    </div>
  );
})'''

start_str = "pastOrders.map((order) => {"
end_str = "<span>إعادة الطلب 🔁</span>\n                                </button>\n                              </div>\n                            </div>\n                          );\n                        })"

start_idx = code.find(start_str)
if start_idx != -1:
    match = re.search(r'<span>إعادة الطلب 🔁</span>\s*</button>\s*</div>\s*</div>\s*\);\s*\}\)', code[start_idx:])
    if match:
        end_idx = start_idx + match.end()
        code = code[:start_idx] + replacement + code[end_idx:]

# 5. Rename small modal trigger
code = code.replace("<span>إعادة الطلب 🔁</span>\n                  </button>\n                </div>\n              )}", "<span>طلباتي 📋</span>\n                  </button>\n                </div>\n              )}")

code = code.replace("سجل طلباتي وحجوزاتي السابقة", "سجل طلباتي السابقة")
code = code.replace("إعادة الطلب والحجز بضغطة زر واحدة", "تتبع الطلب الحالي أو إعادة الطلب بضغطة زر")

# 6. Remove Tabs "Orders" vs "Bookings"
tab_wrapper = """<div className="p-2 bg-slate-950/80 border-b border-slate-800 grid grid-cols-2 gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPastModalTab('orders')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      pastModalTab === 'orders'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>الطلبات ({pastOrders.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPastModalTab('bookings')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      pastModalTab === 'bookings'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>حجوزات الخدمات ({customerServiceBookings.length})</span>
                  </button>
                </div>"""
code = code.replace(tab_wrapper, "")

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print("SUCCESS TABS")

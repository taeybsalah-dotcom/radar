const fs = require('fs');
let code = fs.readFileSync('src/components/CashierPOS.tsx', 'utf8');

const uiComponent = 
      {/* ========================================== */}
      {/* 🚀 LIVE ORDERS BOARD (Kitchen Display System) */}
      {/* ========================================== */}
      {liveOrders.length > 0 && (
        <div className="space-y-4 animate-fade-in mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
              الطلبات النشطة
            </h2>
            <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold font-mono">
              {liveOrders.length} طلبات
            </span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveOrders.map(order => (
              <div key={order.id} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                    <span className="text-xs font-bold text-slate-400 font-mono">#{order.order_number}</span>
                    <span className={\px-2 py-0.5 rounded-md text-[10px] font-bold \\}>
                      {order.status === 'pending' ? 'طلب جديد' : order.status === 'preparing' ? 'جاري التحضير' : 'جاهز للاستلام'}
                    </span>
                  </div>
                  <div className="mb-3">
                    <h3 className="font-bold text-white text-sm">{order.customer_name}</h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                      {order.order_type === 'dine_in' ? \محلي - طاولة \\ : 
                       order.order_type === 'takeaway' ? 'استلام سفري' : 'توصيل'}
                    </p>
                  </div>
                  <div className="space-y-1 mb-4 bg-slate-950 p-2 rounded-xl border border-slate-800">
                    {order.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 truncate pl-2">{item.quantity}x {item.name}</span>
                        <span className="text-slate-500 font-mono">{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {order.notes && (
                      <div className="mt-2 pt-2 border-t border-slate-800/50 text-[10px] text-amber-200/70 italic">
                        * {order.notes}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'preparing')}
                      className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-900/20"
                    >
                      قبول وبدء التحضير
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-900/20"
                    >
                      الطلب جاهز للاستلام
                    </button>
                  )}
                  {order.status === 'ready' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'completed')}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                    >
                      إنهاء الطلب
                    </button>
                  )}
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold transition"
                    >
                      إلغاء
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
;

code = code.replace('{/* Main POS Content Grid */}', uiComponent + '\n      {/* Main POS Content Grid */}');
fs.writeFileSync('src/components/CashierPOS.tsx', code);

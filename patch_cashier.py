import re

with open('src/components/CashierPOS.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add state
old_state = """  const [isScanning, setIsScanning] = useState(false);
  const [liveOrders, setLiveOrders] = useState<any[]>([]);"""
new_state = """  const [isScanning, setIsScanning] = useState(false);
  const [liveOrders, setLiveOrders] = useState<any[]>([]);
  const [orderActionError, setOrderActionError] = useState<string | null>(null);"""
code = code.replace(old_state, new_state)

# 2. Update function
old_update = """  const updateOrderStatus = async (orderId: string, status: string) => {
    await LoyaltyService.updateOrderStatus(orderId, status);
    setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  };"""
new_update = """  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      setOrderActionError(null);
      await LoyaltyService.updateOrderStatus(orderId, status);
      setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    } catch (e: any) {
      setOrderActionError(e.message || 'حدث خطأ أثناء تحديث الحالة.');
      console.error(e);
    }
  };"""
code = code.replace(old_update, new_update)

# 3. Add alert banner before Live Orders Grid
old_banner_loc = """      {liveOrders.length > 0 && (
        <div className="mb-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center animate-pulse">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            </div>
            <h3 className="text-lg font-black text-white">الطلبات المباشرة</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              {liveOrders.length}
            </span>
          </div>"""

new_banner_loc = """      {orderActionError && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-400 animate-fade-in relative shadow-lg shadow-rose-900/20">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-bold">فشل في تحديث الطلب</p>
            <p className="text-xs opacity-90">{orderActionError}</p>
          </div>
          <button onClick={() => setOrderActionError(null)} className="p-1 hover:bg-rose-500/20 rounded-lg transition text-rose-400/70 hover:text-rose-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {liveOrders.length > 0 && (
        <div className="mb-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center animate-pulse">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            </div>
            <h3 className="text-lg font-black text-white">الطلبات المباشرة</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              {liveOrders.length}
            </span>
          </div>"""
code = code.replace(old_banner_loc, new_banner_loc)

with open('src/components/CashierPOS.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print("SUCCESS CASHIER PATCH")

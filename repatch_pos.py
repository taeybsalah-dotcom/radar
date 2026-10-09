import re

with open('src/components/CashierPOS.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Patch Subscription
pattern_sub = r'\.on\(\s*\'postgres_changes\',\s*\{\s*event:\s*\'\*\',\s*schema:\s*\'public\',\s*table:\s*\'store_orders\',\s*filter:\s*`store_id=eq\.\$\{store\.id\}`\s*\},\s*\(payload:\s*any\)\s*=>\s*\{\s*if\s*\(payload\.eventType\s*===\s*\'INSERT\'\)\s*\{\s*setLiveOrders\(prev\s*=>\s*\[\.\.\.prev,\s*payload\.new\]\);\s*try\s*\{\s*playBeepSound\(\'success\'\);\s*\}\s*catch\(e\)\{\}\s*\}\s*else\s*if\s*\(payload\.eventType\s*===\s*\'UPDATE\'\)\s*\{\s*setLiveOrders\(prev\s*=>\s*prev\.map\(o\s*=>\s*o\.id\s*===\s*payload\.new\.id\s*\?\s*payload\.new\s*:\s*o\)\);\s*\}\s*else\s*if\s*\(payload\.eventType\s*===\s*\'DELETE\'\)\s*\{\s*setLiveOrders\(prev\s*=>\s*prev\.filter\(o\s*=>\s*o\.id\s*!==\s*payload\.old\.id\)\);\s*\}\s*\}\s*\)'

replacement_sub = """        .on(
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
        )"""

code = re.sub(pattern_sub, replacement_sub, code)

# 2. Patch type for updateBookingStatus
code = code.replace(
    "const updateBookingStatus = async (bookingId: string, status: 'completed' | 'cancelled' | 'confirmed' | 'no_show') => {",
    "const updateBookingStatus = async (bookingId: string, status: 'pending' | 'completed' | 'cancelled' | 'confirmed' | 'no_show') => {"
)

# 3. Always show Bookings Header
# We will find the exact string that renders `liveBookings` and replace it
code = code.replace(
    """      {liveBookings.length > 0 && (
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
            {liveBookings.map(bk => (""",
    """      <div className="space-y-4 animate-fade-in mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              📅 حجوزات الخدمات (مباشر)
            </h2>
            <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold font-mono">
              {liveBookings.length} حجوزات
            </span>
          </div>
          
          {liveBookings.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center text-slate-400">
              لا توجد حجوزات بانتظار الموافقة.
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveBookings.map(bk => ("""
)

# Now we must close the div properly where liveBookings map ends!
# Currently it ends with:
#               </div>
#             ))}
#           </div>
#         </div>
#       )}
#
#       {liveOrders.length > 0 && (

code = code.replace(
    """              </div>
            ))}
          </div>
        </div>
      )}

      {liveOrders.length > 0 && (""",
    """              </div>
            ))}
          </div>
          )}
        </div>

      {liveOrders.length > 0 && ("""
)

with open('src/components/CashierPOS.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS REPATCH")

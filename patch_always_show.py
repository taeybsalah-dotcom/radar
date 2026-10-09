import re

with open('src/components/CashierPOS.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

old_block = """      {liveBookings.length > 0 && (
        <div className="space-y-4 animate-fade-in mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              📅 حجوزات الخدمات
            </h2>
            <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold font-mono">
              {liveBookings.length} حجوزات
            </span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">"""

new_block = """      <div className="space-y-4 animate-fade-in mb-8">
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
            لا توجد حجوزات خدمات بانتظار الموافقة.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">"""

old_end = """              </div>
            ))}
          </div>
        </div>
      )}"""

new_end = """              </div>
            ))}
          </div>
        )}
      </div>"""

code = code.replace(old_block, new_block).replace(old_end, new_end)

with open('src/components/CashierPOS.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS ALWAYS SHOW BOOKINGS")

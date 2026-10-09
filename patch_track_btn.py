import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

old_btn = """              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setBookingSuccessData(null);
                    setSelectedBookingService(null);
                    setSelectedServiceModifiers({});
                    setSelectedBookingSpecialist(null);
                    setBookingStep(1);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  حجز موعد آخر
                </button>"""

new_btn = """              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setBookingSuccessData(null);
                    setSelectedBookingService(null);
                    setSelectedServiceModifiers({});
                    setSelectedBookingSpecialist(null);
                    setBookingStep(1);
                    setActiveTab('services');
                  }}
                  className="w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-500 shadow-xl flex items-center justify-center gap-2 transition"
                >
                  <Calendar className="w-4 h-4" />
                  <span>تتبع حالة الحجز 📋</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBookingSuccessData(null);
                    setSelectedBookingService(null);
                    setSelectedServiceModifiers({});
                    setSelectedBookingSpecialist(null);
                    setBookingStep(1);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  حجز موعد آخر
                </button>"""

code = code.replace(old_btn, new_btn)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS ADD TRACKING BTN")

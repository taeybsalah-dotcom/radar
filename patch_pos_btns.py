import re

with open('src/components/CashierPOS.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace the buttons in CashierPOS for liveBookings
old_buttons = """                <div className="flex gap-2 border-t border-slate-800 pt-3">
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
                </div>"""

new_buttons = """                <div className="flex gap-2 border-t border-slate-800 pt-3">
                  {bk.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => updateBookingStatus(bk.id, 'confirmed')}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition"
                      >
                        قبول وتأكيد ✅
                      </button>
                      <button
                        onClick={() => updateBookingStatus(bk.id, 'cancelled')}
                        className="flex-1 py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl transition"
                      >
                        رفض / غير متاح ❌
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => updateBookingStatus(bk.id, 'completed')}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition"
                      >
                        حضر واكتمل 🏁
                      </button>
                      <button
                        onClick={() => updateBookingStatus(bk.id, 'no_show')}
                        className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-xs rounded-xl transition"
                      >
                        لم يحضر 🏖️
                      </button>
                    </>
                  )}
                </div>"""

code = code.replace(old_buttons, new_buttons)

with open('src/components/CashierPOS.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS POS BUTTONS")

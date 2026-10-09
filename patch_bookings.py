import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# I will find the exact string to insert before
# `          )}`
# `        </div>`
# `      )}`
# ``
# `      {activeTab === 'perks' && (`

insert_point = """            </>
          )}
        </div>
      )}

      {activeTab === 'perks' && ("""

# Actually, the string is:
#             </>
#           )}
#         </div>
#       )}
#
#       {activeTab === 'perks' && (
# BUT let's just use regular expressions or simple `code.find` to be safe.

replacement = """            </>
          )}

          <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>مواعيدي السابقة والقادمة</span>
            </h3>
            
            {customerServiceBookings.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-2 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                <Calendar className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-xs">لا توجد مواعيد مسجلة برقمك حتى الآن.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {customerServiceBookings.map((bk) => (
                  <div
                    key={bk.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                          #{bk.booking_number}
                        </span>
                        {bk.service_category && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                            {bk.service_category}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(bk.created_at).toLocaleDateString('ar-SA')}
                      </span>
                    </div>

                    <div className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-white">
                          {bk.service_name || 'خدمة غير محددة'}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span dir="ltr">{bk.booking_date} | {bk.booking_time}</span>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-black text-amber-400 font-mono">
                          {bk.total_price} ر.س
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          مع {bk.specialist_name || 'أي مختص'}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-between items-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        bk.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : bk.status === 'cancelled'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {bk.status === 'completed' ? '✓ مكتمل' : bk.status === 'cancelled' ? '❌ ملغي' : '⏳ قيد المراجعة'}
                      </span>
                      
                      {!['completed', 'cancelled'].includes(bk.status) && (
                        <button
                          type="button"
                          onClick={() => {
                            const merchantPhone = store.manager_contact || '';
                            const text = `مرحباً، أود الاستفسار عن موعدي رقم #${bk.booking_number} المجدول بتاريخ ${bk.booking_date} الساعة ${bk.booking_time}. شكراً لك.`;
                            window.open(`https://wa.me/${normalizePhone(merchantPhone)}?text=${encodeURIComponent(text)}`, '_blank');
                          }}
                          className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-white transition"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>استفسار</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {activeTab === 'perks' && ("""

# Replace using string replace since it's very specific
search_str = """            </>
          )}
        </div>
      )}

      {activeTab === 'perks' && ("""
      
if search_str in code:
    code = code.replace(search_str, replacement)
    print("SUCCESS INSERTING BOOKINGS LIST")
else:
    print("COULD NOT FIND INSERTION POINT")

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)


import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# I will replace the entire mapping block for services
# Find `<h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">\n                <Calendar className="w-4 h-4 text-blue-400" />\n                <span>مواعيدي السابقة والقادمة</span>\n              </h3>`

# First I need to identify the exact code to replace.

def find_replacement_range(text, start_str, end_str):
    start = text.find(start_str)
    if start == -1: return -1, -1
    end = text.find(end_str, start + len(start_str))
    if end == -1: return -1, -1
    return start, end + len(end_str)

start_str = """<div className="mt-8 pt-6 border-t border-slate-800 space-y-4">"""
end_str = """{!['completed', 'cancelled'].includes(bk.status) && (""" # actually wait, I'll just replace the whole thing.

# Let's write the new Bookings List UI
new_bookings_ui = """<div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span>مواعيدي السابقة والقادمة (تحديث مباشر)</span>
              </h3>
              
              {customerServiceBookings.length === 0 ? (
                <div className="py-8 text-center text-slate-400 space-y-2 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                  <Calendar className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs">لا توجد مواعيد مسجلة برقمك حتى الآن.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {customerServiceBookings.map((bk: any) => {
                    const isLive = ['pending', 'confirmed'].includes(bk.status);
                    const isConfirmed = bk.status === 'confirmed';
                    const isCancelled = bk.status === 'cancelled';
                    
                    return (
                      <div
                        key={bk.id}
                        className={`p-5 rounded-3xl border transition-all duration-500 shadow-xl relative overflow-hidden ${
                          isLive 
                            ? 'bg-slate-900/90 border-slate-700/80' 
                            : 'bg-slate-950/80 border-slate-800/60 opacity-80'
                        }`}
                      >
                        {isLive && (
                          <div className={`absolute top-0 right-0 left-0 h-1.5 ${isConfirmed ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                        )}
                        
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] px-3 py-1 rounded-full font-mono font-black bg-blue-950/60 text-blue-300 border border-blue-800/50">
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

                        {/* Live Tracking Progress Bar for Bookings */}
                        {isLive && (
                          <div className="mb-5 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80">
                            <div className="flex justify-between items-end mb-3">
                              <div className="text-right">
                                <h4 className={`text-sm font-black ${isConfirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  {isConfirmed ? '✅ تم تأكيد الحجز' : '⏳ قيد المراجعة في الاستقبال'}
                                </h4>
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {isConfirmed ? 'المختص بانتظارك في الموعد المحدد' : 'ننتظر تأكيد الصالون أو توفر المختص'}
                                </p>
                              </div>
                              {isConfirmed && (
                                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center animate-bounce">
                                  <Calendar className="w-5 h-5 text-emerald-400" />
                                </div>
                              )}
                            </div>
                            
                            <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`absolute top-0 right-0 bottom-0 transition-all duration-1000 ${isConfirmed ? 'w-full bg-emerald-500' : 'w-1/2 bg-amber-500'}`} />
                            </div>
                          </div>
                        )}
                        
                        {/* Cancelled State */}
                        {isCancelled && (
                          <div className="mb-4 bg-rose-950/30 p-3 rounded-2xl border border-rose-900/50 text-center">
                            <span className="text-rose-400 font-bold text-xs">❌ نعتذر، تعذر قبول الحجز أو أن المختص غير متاح</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800/40">
                          <div className="space-y-1.5">
                            <div className="text-sm font-black text-white">
                              {bk.service_name || 'خدمة غير محددة'}
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-blue-400" />
                              <span dir="ltr" className="font-mono text-slate-300">{bk.booking_date} | {bk.booking_time}</span>
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-black text-amber-400 font-mono">
                              {bk.total_price} ر.س
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1">
                              المختص: <span className="text-slate-300">{bk.specialist_name || 'أي مختص متاح'}</span>
                            </div>
                          </div>
                        </div>

                        {!isLive && bk.status !== 'cancelled' && (
                          <div className="mt-3 text-center">
                            <span className={`text-[10px] px-3 py-1 rounded-full font-bold ${
                              bk.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {bk.status === 'completed' ? '🏁 تمت الخدمة ومكتمل' : '🏖️ العميل لم يحضر'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>"""

start_str = """<div className="mt-8 pt-6 border-t border-slate-800 space-y-4">"""
end_str = """{!['completed', 'cancelled'].includes(bk.status) && ("""

# I will just replace from `start_str` up to the end of that specific div block.
# Let's find the exact content.

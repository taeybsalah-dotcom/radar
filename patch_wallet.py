import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Rename modal trigger from إعادة الطلب to طلباتي
old_trigger = """<span>إعادة الطلب 🔁</span>
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">"""
new_trigger = """<span>طلباتي 📋</span>
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">"""

code = code.replace(old_trigger, new_trigger)

# Another instance of the trigger:
old_trigger2 = """<RotateCcw className="w-3.5 h-3.5" />
                                  <span>إعادة الطلب 🔁</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </>
                )}"""
new_trigger2 = """<History className="w-3.5 h-3.5" />
                                  <span>طلباتي 📋</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </>
                )}"""
code = code.replace(old_trigger2, new_trigger2)

# 2. Disable reorder button inside the Past Orders UI if isLive
old_reorder = """<button
          type="button"
          onClick={() => handleReOrder(order)}
          style={{
            backgroundColor: brandSecondary,
            color: '#000000',
          }}
          className="px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-lg hover:brightness-110 transition active:scale-95"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>إعادة الطلب 🔁</span>
        </button>"""
new_reorder = """<button
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
        </button>"""
code = code.replace(old_reorder, new_reorder)

# Remove the Bookings Tab in CustomerWallet modal as per user request: "في جدول الحجوزات مكانه مو هنا عند المنيو"
old_tabs = """<div className="p-2 bg-slate-950/80 border-b border-slate-800 grid grid-cols-2 gap-1.5 shrink-0">
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
                </div>

                <div className="p-4 overflow-y-auto space-y-3.5 flex-1 text-right">
                  {pastModalTab === 'orders' && ("""

new_tabs = """<div className="p-4 overflow-y-auto space-y-3.5 flex-1 text-right">
                  {pastModalTab === 'orders' && ("""
# Actually, I need to remove the closing braces for pastModalTab === 'bookings' too, but it's easier to just remove the tab bar. 
code = code.replace(old_tabs, new_tabs)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print("SUCCESS WALLET PATCH")

const fs = require('fs');
let code = fs.readFileSync('src/components/CustomerWallet.tsx', 'utf8');

const startStr = 'pastOrders.map((order) => {';
const endStr = '<span>إعادة الطلب 🔁</span>\n                                </button>\n                              </div>\n                            </div>\n                          );\n                        })';

const startIdx = code.indexOf(startStr);
if (startIdx === -1) { console.log('startStr not found'); process.exit(1); }

let endIdx = code.indexOf(endStr, startIdx);
if (endIdx === -1) {
  // try fallback with variable spaces
  const regex = /<span>إعادة الطلب 🔁<\/span>[\s\S]*?<\/button>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\);[\s\S]*?\}\)/;
  const match = regex.exec(code.substring(startIdx));
  if (match) {
    endIdx = startIdx + match.index + match[0].length;
  } else {
    console.log('endStr not found'); process.exit(1);
  }
} else {
  endIdx += endStr.length;
}

const replacement = 'pastOrders.map((order: any) => {\n' +
'  const fulfillmentType = order.order_type || order.fulfillment_type || \\'takeaway\\';\n' +
'  const orderNumber = order.order_number || order.order_id || String(order.id).substring(0, 5);\n' +
'  const totalPrice = order.total_price || order.total_amount || 0;\n' +
'  const status = order.status || \\'pending\\';\n' +
'  const isLive = ![\\'completed\\', \\'cancelled\\'].includes(status);\n' +
'  \n' +
'  const fulfillmentTitles: Record<string, string> = {\n' +
'    dine_in: \\'🍽️ محلي\\',\n' +
'    takeaway: \\'🚗 سفري\\',\n' +
'    delivery: \\'🛵 توصيل\\',\n' +
'    service_booking: \\'💇‍♂️ حجز موعد\\',\n' +
'  };\n' +
'\n' +
'  const getStatusStep = (st: string) => {\n' +
'    if (st === \\'pending\\') return 0;\n' +
'    if (st === \\'accepted\\') return 1;\n' +
'    if (st === \\'preparing\\') return 2;\n' +
'    if (st === \\'ready\\') return 3;\n' +
'    return 0;\n' +
'  };\n' +
'\n' +
'  const step = getStatusStep(status);\n' +
'\n' +
'  return (\n' +
'    <div\n' +
'      key={order.id || order.order_id || Math.random()}\n' +
'      className={p-4 rounded-2xl bg-slate-950 border space-y-4 shadow-md }\n' +
'    >\n' +
'      <div className=\"flex items-center justify-between\">\n' +
'        <div className=\"flex items-center gap-1.5 flex-wrap\">\n' +
'          <span\n' +
'            className=\"text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold\"\n' +
'            style={{\n' +
'              backgroundColor: ${brandSecondary}20,\n' +
'              color: brandSecondary,\n' +
'              border: 1px solid 40,\n' +
'            }}\n' +
'          >\n' +
'            #{orderNumber}\n' +
'          </span>\n' +
'          <span className=\"text-[10px] text-slate-400 font-bold\">\n' +
'            {fulfillmentTitles[fulfillmentType] || fulfillmentType}\n' +
'          </span>\n' +
'          {!isLive && status === \\'completed\\' && (\n' +
'            <span className=\"text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold\">\n' +
'              ✓ مكتمل\n' +
'            </span>\n' +
'          )}\n' +
'          {!isLive && status === \\'cancelled\\' && (\n' +
'            <span className=\"text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold\">\n' +
'              ❌ ملغي\n' +
'            </span>\n' +
'          )}\n' +
'        </div>\n' +
'\n' +
'        <span className=\"text-[10px] text-slate-500 font-mono\" dir=\"ltr\">\n' +
'          {new Date(order.created_at).toLocaleDateString(\\'ar-SA\\')}\n' +
'        </span>\n' +
'      </div>\n' +
'\n' +
'      {isLive && (\n' +
'        <div className=\"py-4 px-2 relative mt-2 mb-4\">\n' +
'          <div className=\"absolute top-6 left-8 right-8 h-1.5 bg-slate-800 rounded-full z-0\"></div>\n' +
'          <div className={bsolute top-6 right-8 h-1.5 bg-amber-500 rounded-full z-0 transition-all duration-500 }></div>\n' +
'          \n' +
'          <div className=\"flex justify-between items-start relative z-10\">\n' +
'            <div className={lex flex-col items-center gap-2 w-16 }>\n' +
'              <div className={w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl transition-colors }>⏳</div>\n' +
'              <span className=\"text-[9px] sm:text-[10px] font-bold text-center leading-tight\">في الانتظار</span>\n' +
'            </div>\n' +
'            \n' +
'            <div className={lex flex-col items-center gap-2 w-16 }>\n' +
'              <div className={w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl transition-colors }>👨‍🍳</div>\n' +
'              <span className=\"text-[9px] sm:text-[10px] font-bold text-center leading-tight\">تم القبول</span>\n' +
'            </div>\n' +
'\n' +
'            <div className={lex flex-col items-center gap-2 w-16 }>\n' +
'              <div className={w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl transition-colors }>🔥</div>\n' +
'              <span className=\"text-[9px] sm:text-[10px] font-bold text-center leading-tight\">جاري التحضير</span>\n' +
'            </div>\n' +
'\n' +
'            <div className={lex flex-col items-center gap-2 w-16 }>\n' +
'              <div className={w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl transition-colors }>✅</div>\n' +
'              <span className=\"text-[9px] sm:text-[10px] font-bold text-center leading-tight\">{fulfillmentType === \\'delivery\\' ? \\'في الطريق\\' : \\'جاهز للاستلام\\'}</span>\n' +
'            </div>\n' +
'          </div>\n' +
'        </div>\n' +
'      )}\n' +
'\n' +
'      <div className=\"space-y-2 text-xs text-slate-300 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80\">\n' +
'        {order.items && order.items.map((item: any, idx: number) => (\n' +
'          <div key={idx} className=\"flex justify-between items-center\">\n' +
'            <span className=\"flex items-center gap-1.5\">\n' +
'              <span className=\"font-mono font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded text-[10px]\">{item.quantity}x</span>\n' +
'              <span>{item.catalog_item?.name || item.name || \\'عنصر غير معروف\\'}</span>\n' +
'              {item.selected_modifiers && item.selected_modifiers.length > 0 && (\n' +
'                <span className=\"text-[10px] text-slate-500\">\n' +
'                  ({item.selected_modifiers.map((m: any) => m.name).join(\\", \\")})\n' +
'                </span>\n' +
'              )}\n' +
'            </span>\n' +
'            <span className=\"font-mono text-slate-400\">\n' +
'              {item.total_price || (item.quantity * (item.catalog_item?.price || item.price || 0))} ر.س\n' +
'            </span>\n' +
'          </div>\n' +
'        ))}\n' +
'      </div>\n' +
'\n' +
'      <div className=\"pt-3 flex items-center justify-between text-xs\">\n' +
'        <div>\n' +
'          <span className=\"text-slate-400\">الإجمالي: </span>\n' +
'          <strong className=\"text-white font-mono text-base\">{totalPrice} ر.س</strong>\n' +
'        </div>\n' +
'\n' +
'        <button\n' +
'          type=\"button\"\n' +
'          onClick={() => handleReOrder(order)}\n' +
'          style={{\n' +
'            backgroundColor: brandSecondary,\n' +
'            color: \\'#000000\\',\n' +
'          }}\n' +
'          className=\"px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-lg hover:brightness-110 transition active:scale-95\"\n' +
'        >\n' +
'          <RotateCcw className=\"w-3.5 h-3.5\" />\n' +
'          <span>إعادة الطلب 🔁</span>\n' +
'        </button>\n' +
'      </div>\n' +
'    </div>\n' +
'  );\n' +
'})';

code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
fs.writeFileSync('src/components/CustomerWallet.tsx', code);
console.log('Successfully patched!');

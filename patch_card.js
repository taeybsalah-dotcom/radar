const fs = require('fs');
let code = fs.readFileSync('src/components/CustomerWallet.tsx', 'utf8');

const updatedMapBody = 
                        const fulfillmentType = order.order_type || order.fulfillment_type || 'takeaway';
                        const orderNumber = order.order_number || order.order_id || String(order.id).substring(0, 5);
                        const totalPrice = order.total_price || order.total_amount || 0;
                        const status = order.status || 'pending';
                        const isLive = !['completed', 'cancelled'].includes(status);
                        
                        const fulfillmentTitles: Record<string, string> = {
                          dine_in: '🍽️ محلي',
                          takeaway: '🚗 سفري',
                          delivery: '🛵 توصيل',
                          service_booking: '💇‍♂️ حجز موعد',
                        };

                        const getStatusStep = (st: string) => {
                          if (st === 'pending') return 0;
                          if (st === 'accepted') return 1;
                          if (st === 'preparing') return 2;
                          if (st === 'ready') return 3;
                          return 0;
                        };

                        const step = getStatusStep(status);

                        return (
                          <div
                            key={order.id || order.order_id || Math.random()}
                            className={\p-4 rounded-2xl bg-slate-950 border space-y-4 shadow-md \\}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold"
                                  style={{
                                    backgroundColor: \\20\,
                                    color: brandSecondary,
                                    border: \1px solid \40\,
                                  }}
                                >
                                  #{orderNumber}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  {fulfillmentTitles[fulfillmentType] || fulfillmentType}
                                </span>
                                {!isLive && status === 'completed' && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                                    ✓ مكتمل
                                  </span>
                                )}
                                {!isLive && status === 'cancelled' && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                                    ❌ ملغي
                                  </span>
                                )}
                              </div>

                              <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
                                {new Date(order.created_at).toLocaleDateString('ar-SA')}
                              </span>
                            </div>

                            {/* 🚀 LIVE ORDER PROGRESS BAR */}
                            {isLive && (
                              <div className="py-2">
                                <div className="flex justify-between items-center mb-2 px-1">
                                  <div className={\lex flex-col items-center gap-1 \\}>
                                    <div className={\w-6 h-6 rounded-full flex items-center justify-center text-xs \\}>⏳</div>
                                    <span className="text-[9px] font-bold">بانتظار التأكيد</span>
                                  </div>
                                  <div className={\lex-1 h-0.5 mx-2 \\}></div>
                                  
                                  <div className={\lex flex-col items-center gap-1 \\}>
                                    <div className={\w-6 h-6 rounded-full flex items-center justify-center text-xs \\}>👨‍🍳</div>
                                    <span className="text-[9px] font-bold">تم القبول</span>
                                  </div>
                                  <div className={\lex-1 h-0.5 mx-2 \\}></div>

                                  <div className={\lex flex-col items-center gap-1 \\}>
                                    <div className={\w-6 h-6 rounded-full flex items-center justify-center text-xs \\}>🔥</div>
                                    <span className="text-[9px] font-bold">جاري التحضير</span>
                                  </div>
                                  <div className={\lex-1 h-0.5 mx-2 \\}></div>

                                  <div className={\lex flex-col items-center gap-1 \\}>
                                    <div className={\w-6 h-6 rounded-full flex items-center justify-center text-xs \\}>✅</div>
                                    <span className="text-[9px] font-bold">{fulfillmentType === 'delivery' ? 'في الطريق' : 'جاهز للاستلام'}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="space-y-1.5 text-xs text-slate-300 bg-slate-900/50 p-3 rounded-xl border border-slate-800/50">
                              {order.items && order.items.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center">
                                  <span>
                                    {item.quantity}x {item.catalog_item?.name || item.name || 'عنصر غير معروف'}
                                    {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                                      <span className="text-[10px] text-slate-400 mr-1">
                                        ({item.selected_modifiers.map((m: any) => m.name).join(', ')})
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono text-slate-400">{item.total_price} ر.س</span>
                                </div>
                              ))}
                            </div>

                            <div className="pt-2 flex items-center justify-between text-xs">
                              <div>
                                <span className="text-slate-400">الإجمالي: </span>
                                <strong className="text-white font-mono text-sm">{totalPrice} ر.س</strong>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleReOrder(order)}
                                style={{
                                  backgroundColor: brandSecondary,
                                  color: '#000000',
                                }}
                                className="px-3 py-1.5 rounded-xl font-black text-[10px] sm:text-xs flex items-center gap-1.5 shadow hover:brightness-110 transition active:scale-95"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>إعادة الطلب 🔁</span>
                              </button>
                            </div>
                          </div>
                        );
;

const regex = /pastOrders\.map\(\(order\) => \{[\s\S]*?return \([\s\S]*?<span>إعادة الطلب 🔁<\/span>\s*<\/button>\s*<\/div>\s*<\/div>\s*\);\s*\}\)/;
code = code.replace(regex, pastOrders.map((order: any) => {\n\n                      }));
fs.writeFileSync('src/components/CustomerWallet.tsx', code);

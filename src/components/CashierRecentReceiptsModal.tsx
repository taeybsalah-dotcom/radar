import React, { useState, useMemo } from 'react';
import { Store, StoreStaff, StoreBranch } from '../types';
import { LoyaltyService } from '../lib/supabase';
import {
  Receipt,
  Search,
  Printer,
  Share2,
  RotateCcw,
  X,
  Clock,
  User,
  ShoppingBag,
  CreditCard,
  Banknote,
  Car,
  Utensils,
  RefreshCw,
} from 'lucide-react';

interface CashierRecentReceiptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
  activeStaff: StoreStaff;
  activeBranch: StoreBranch | null;
  orders: any[];
  onReprintReceipt: (order: any) => void;
  onOpenRefundForOrder?: (order: any) => void;
}

export const CashierRecentReceiptsModal: React.FC<CashierRecentReceiptsModalProps> = ({
  isOpen,
  onClose,
  store,
  activeStaff,
  activeBranch,
  orders,
  onReprintReceipt,
  onOpenRefundForOrder,
}) => {
  if (!isOpen) return null;

  const [searchQuery, setSearchQuery] = useState('');

  // Filter orders by search query and sort newest first
  const filteredOrders = useMemo(() => {
    let list = Array.isArray(orders) ? [...orders] : [];
    
    // Sort newest first
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((o) => {
        const num = (o.order_number || '').toLowerCase();
        const phone = (o.customer_phone || '').toLowerCase();
        const name = (o.customer_name || '').toLowerCase();
        return num.includes(q) || phone.includes(q) || name.includes(q);
      });
    }

    return list.slice(0, 50);
  }, [orders, searchQuery]);

  // Handle WhatsApp
  const handleShareWhatsApp = (order: any) => {
    const phone = order.customer_phone || '';
    const url = LoyaltyService.generateCustomerOrderWhatsAppUrl(store, order, phone);
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in text-right" dir="rtl">
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scale-up">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                سجل فواتير الوردية الأخيرة
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 font-mono border border-slate-700">
                  {filteredOrders.length} فاتورة
                </span>
              </h2>
              <p className="text-xs text-slate-400">إعادة طباعة أي فاتورة حرارية أو إرسالها واتساب للعميل بضغطة زر</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث برقم الفاتورة، جوال العميل، أو الاسم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
            />
          </div>
        </div>

        {/* Orders List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Receipt className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-400">لا توجد فواتير مطابقة لبحثك</p>
              <p className="text-xs text-slate-600">الفواتير المصدرة خلال هذه الوردية تظهر هنا تلقائياً</p>
            </div>
          ) : (
            filteredOrders.map((ord) => {
              const isPaid = ord.payment_status === 'paid' || ord.status === 'completed';
              const isRefunded = ord.refund_status === 'full';
              const isPartialRefund = ord.refund_status === 'partial';

              return (
                <div
                  key={ord.id || ord.order_number}
                  className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition space-y-2.5"
                >
                  {/* Top Row: Order # and Total */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-amber-400 text-sm">
                        #{ord.order_number}
                      </span>
                      {ord.fulfillment_type === 'dine_in' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                          <Utensils className="w-3 h-3" />
                          محلي {ord.fulfillment_details?.table_number ? `(طاولة ${ord.fulfillment_details.table_number})` : ''}
                        </span>
                      ) : ord.fulfillment_type === 'car' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold flex items-center gap-1">
                          <Car className="w-3 h-3" />
                          سيارة {ord.fulfillment_details?.car_plate ? `(${ord.fulfillment_details.car_plate})` : ''}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30 font-bold flex items-center gap-1">
                          <ShoppingBag className="w-3 h-3" />
                          سفري
                        </span>
                      )}

                      {isRefunded && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                          مسترجع بالكامل
                        </span>
                      )}
                      {isPartialRefund && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                          مسترجع جزئياً
                        </span>
                      )}
                    </div>

                    <strong className="text-base font-black font-mono text-white">
                      {Number(ord.total_price || ord.total_amount || 0).toFixed(2)} ﷼
                    </strong>
                  </div>

                  {/* Middle Row: Customer and Payment Method */}
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-900">
                    <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                      <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-slate-300 font-semibold truncate">
                        {ord.customer_name || 'عميل نقدي'}
                      </span>
                      {ord.customer_phone && ord.customer_phone !== '0500000000' && (
                        <span className="text-[10px] text-slate-500 font-mono">({ord.customer_phone})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] shrink-0">
                      <span className="flex items-center gap-1 text-slate-300">
                        {ord.payment_method === 'cash' ? (
                          <>
                            <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                            <span>كاش</span>
                          </>
                        ) : ord.payment_method === 'card' ? (
                          <>
                            <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                            <span>مدى</span>
                          </>
                        ) : ord.payment_method === 'split' ? (
                          <span>مجزأ (كاش+شبكة)</span>
                        ) : (
                          <span>نقاط الولاء</span>
                        )}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-500 font-mono">
                        {new Date(ord.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onReprintReceipt(ord)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                      <span>إعادة طباعة 🖨️</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp(ord)}
                      className="py-1.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                      title="إرسال الفاتورة عبر واتساب"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>واتساب</span>
                    </button>

                    {!isRefunded && onOpenRefundForOrder && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenRefundForOrder(ord);
                        }}
                        className="py-1.5 px-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1 transition"
                        title="طلب استرجاع وإصدار إشعار دائن"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>استرجاع</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition"
          >
            إغلاق السجل ✖
          </button>
        </div>

      </div>
    </div>
  );
};

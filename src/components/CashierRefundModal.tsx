import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Store, StoreStaff, StoreBranch, POSShift, POSRefund, POSRefundItem } from '../types';
import { LoyaltyService } from '../lib/supabase';
import { playBeepSound } from '../lib/sound';
import { QRCodeSVG } from 'qrcode.react';
import {
  RotateCcw,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Printer,
  Send,
  Building2,
  User,
  Clock,
  DollarSign,
  CreditCard,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  Plus,
  Minus,
  Trash2,
} from 'lucide-react';

interface CashierRefundModalProps {
  store: Store;
  activeStaff: StoreStaff;
  activeBranch: StoreBranch | null;
  activeShift: POSShift | null;
  isOpen: boolean;
  onClose: () => void;
  onRefundCompleted?: (refund: POSRefund) => void;
}

export const CashierRefundModal: React.FC<CashierRefundModalProps> = ({
  store,
  activeStaff,
  activeBranch,
  activeShift,
  isOpen,
  onClose,
  onRefundCompleted,
}) => {
  // 🛡️ Radar Pro Operational Theme Colors
  const brandPrimary = '#0F172A';
  const brandSecondary = '#F59E0B';

  // Search & Orders List State
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersList, setOrdersList] = useState<any[]>([]);

  // Selected Order for Refund
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  // Selected Items to refund: map itemId -> quantity to refund
  const [refundQuantities, setRefundQuantities] = useState<Record<string, number>>({});
  const [refundReason, setRefundReason] = useState<string>('رغبة العميل (بدون عيب بالمنتج)');
  const [customReasonNote, setCustomReasonNote] = useState<string>('');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'wallet'>('cash');

  // Processing State
  const [processing, setProcessing] = useState(false);
  const [processedRefund, setProcessedRefund] = useState<POSRefund | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Print ref
  const printReceiptRef = useRef<HTMLDivElement>(null);

  // Load recent orders when modal opens or search query changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingOrders(true);
    setErrorMsg(null);

    const delayDebounce = setTimeout(async () => {
      try {
        const results = await LoyaltyService.searchOrdersForRefund(
          store.id,
          searchQuery,
          activeBranch?.id
        );
        if (isMounted) {
          setOrdersList(results);
        }
      } catch (err) {
        console.warn('Failed to load orders for refund:', err);
      } finally {
        if (isMounted) setLoadingOrders(false);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(delayDebounce);
    };
  }, [isOpen, searchQuery, store.id, activeBranch?.id]);

  // Reset modal state when closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedOrder(null);
      setRefundQuantities({});
      setRefundReason('رغبة العميل (بدون عيب بالمنتج)');
      setCustomReasonNote('');
      setRefundMethod('cash');
      setProcessedRefund(null);
      setErrorMsg(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Select an order to refund
  const handleSelectOrder = (order: any) => {
    setSelectedOrder(order);
    setErrorMsg(null);
    setProcessedRefund(null);

    // Initial default: 1 of each unrefunded item or 0
    const initialQtys: Record<string, number> = {};
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item: any, idx: number) => {
      const key = item.id || `item_${idx}`;
      initialQtys[key] = Number(item.quantity || 1);
    });
    setRefundQuantities(initialQtys);

    // Auto set default refund method matching original payment
    const origMethod = (order.payment_method || '').toLowerCase();
    if (origMethod === 'cash') {
      setRefundMethod('cash');
    } else {
      setRefundMethod('card');
    }
  };

  // Adjust quantity for a specific item
  const updateItemQty = (itemKey: string, maxQty: number, delta: number) => {
    setRefundQuantities((prev) => {
      const current = prev[itemKey] || 0;
      const next = Math.max(0, Math.min(maxQty, current + delta));
      return { ...prev, [itemKey]: next };
    });
  };

  // Select all items for full refund
  const handleSelectAllItems = () => {
    if (!selectedOrder) return;
    const items = Array.isArray(selectedOrder.items) ? selectedOrder.items : [];
    const allQtys: Record<string, number> = {};
    items.forEach((item: any, idx: number) => {
      const key = item.id || `item_${idx}`;
      allQtys[key] = Number(item.quantity || 1);
    });
    setRefundQuantities(allQtys);
  };

  // Clear all items selection
  const handleClearAllItems = () => {
    setRefundQuantities({});
  };

  // Calculate items being refunded
  const itemsToRefund = useMemo<POSRefundItem[]>(() => {
    if (!selectedOrder) return [];
    const items = Array.isArray(selectedOrder.items) ? selectedOrder.items : [];
    const result: POSRefundItem[] = [];

    items.forEach((item: any, idx: number) => {
      const key = item.id || `item_${idx}`;
      const qty = refundQuantities[key] || 0;
      if (qty > 0) {
        const unitPrice = Number(item.unit_price) || (Number(item.total_price) / (Number(item.quantity) || 1));
        result.push({
          id: key,
          name: item.name || 'منتج',
          unit_price: Math.round(unitPrice * 100) / 100,
          quantity: qty,
          original_quantity: Number(item.quantity || 1),
          total_price: Math.round(unitPrice * qty * 100) / 100,
        });
      }
    });

    return result;
  }, [selectedOrder, refundQuantities]);

  // Financial Totals
  const totalRefundAmount = useMemo(() => {
    return itemsToRefund.reduce((sum, item) => sum + item.total_price, 0);
  }, [itemsToRefund]);

  const taxAmount = useMemo(() => {
    return Math.round((totalRefundAmount - totalRefundAmount / 1.15) * 100) / 100;
  }, [totalRefundAmount]);

  const subtotalBeforeTax = useMemo(() => {
    return Math.round((totalRefundAmount - taxAmount) * 100) / 100;
  }, [totalRefundAmount, taxAmount]);

  // Points to be deducted
  const pointsToDeduct = useMemo(() => {
    if (!selectedOrder) return 0;
    const origPoints = Number(selectedOrder.loyalty_points_earned || 0);
    const origTotal = Number(selectedOrder.total_price || selectedOrder.total_amount || 1);
    if (origPoints <= 0) return 0;
    if (totalRefundAmount >= origTotal) return origPoints;
    return Math.round((totalRefundAmount / origTotal) * origPoints);
  }, [selectedOrder, totalRefundAmount]);

  // Is full refund or partial
  const isFullRefund = useMemo(() => {
    if (!selectedOrder) return false;
    const origTotal = Number(selectedOrder.total_price || selectedOrder.total_amount || 0);
    return totalRefundAmount >= origTotal * 0.99;
  }, [selectedOrder, totalRefundAmount]);

  // Handle Process Refund Submission
  const handleProcessRefund = async () => {
    if (!selectedOrder || itemsToRefund.length === 0) {
      setErrorMsg('يرجى تحديد صنف واحد على الأقل للاسترجاع');
      return;
    }

    if (totalRefundAmount <= 0) {
      setErrorMsg('قيمة الاسترجاع يجب أن تكون أكبر من صفر');
      return;
    }

    setProcessing(true);
    setErrorMsg(null);

    try {
      const fullReason = customReasonNote.trim()
        ? `${refundReason} - ${customReasonNote.trim()}`
        : refundReason;

      const refundResult = await LoyaltyService.processPOSRefund({
        store,
        activeStaff,
        activeBranch,
        activeShift,
        order: selectedOrder,
        refundItems: itemsToRefund,
        refundType: isFullRefund ? 'full' : 'partial',
        refundReason: fullReason,
        refundMethod,
        notes: customReasonNote.trim() || undefined,
      });

      playBeepSound('success');
      setProcessedRefund(refundResult);

      if (onRefundCompleted) {
        onRefundCompleted(refundResult);
      }
    } catch (err: any) {
      console.error('Failed to process refund:', err);
      setErrorMsg(err.message || 'تعذر إتمام عملية الاسترجاع');
    } finally {
      setProcessing(false);
    }
  };

  // Instant Print Handler
  const handlePrintCreditNote = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Modal Top Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                إدارة المرتجعات والإشعار الدائن (POS Returns)
              </h3>
              <p className="text-[11px] text-slate-400">
                استرجاع جزئي أو كلي مع إصدار إشعار دائن ضريبي معتمد وتحديث الصندوق ونقاط الولاء
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 🌟 STEP 1: If No Order Selected Yet -> Search and Order Selection */}
          {!selectedOrder && !processedRefund && (
            <div className="space-y-4">
              {/* Search Box */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  placeholder="ابحث برقم الفاتورة (مثال: 8188) أو رقم جوال العميل أو اسمه..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-2xl pr-10 pl-4 py-3 text-xs sm:text-sm text-white placeholder-slate-500 outline-none transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                  >
                    مسح
                  </button>
                )}
              </div>

              {/* Orders List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
                  <span>
                    {searchQuery ? `نتائج البحث عن "${searchQuery}":` : 'آخر الفواتير القابلة للاسترجاع:'}
                  </span>
                  <span>{ordersList.length} فاتورة</span>
                </div>

                {loadingOrders ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <div className="w-7 h-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    جاري البحث في الفواتير...
                  </div>
                ) : ordersList.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs space-y-2 border border-dashed border-slate-800 rounded-2xl">
                    <Receipt className="w-8 h-8 mx-auto text-slate-600" />
                    <p>لم يتم العثور على فواتير مطابقة للبحث أو جميعها مسترجعة بالكامل</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                    {ordersList.map((order) => {
                      const isPartial = order.refund_status === 'partial';
                      const itemsCount = Array.isArray(order.items)
                        ? order.items.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0)
                        : 0;

                      return (
                        <div
                          key={order.id}
                          onClick={() => handleSelectOrder(order)}
                          className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-950 cursor-pointer transition flex items-center justify-between group"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <strong className="text-white font-mono font-bold text-sm">
                                #{order.order_number}
                              </strong>
                              {isPartial ? (
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                                  مسترجع جزئياً
                                </span>
                              ) : (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                                  مكتملة ومتاحة
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500">
                                {new Date(order.created_at).toLocaleTimeString('ar-SA', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <div className="text-xs text-slate-400 flex items-center gap-3">
                              {order.customer_name && (
                                <span className="flex items-center gap-1 text-slate-300">
                                  <User className="w-3 h-3 text-slate-500" />
                                  {order.customer_name}
                                  {order.customer_phone ? ` (${order.customer_phone})` : ''}
                                </span>
                              )}
                              <span>{itemsCount} أصناف</span>
                              <span className="text-slate-500">
                                طريقة الدفع: {order.payment_method === 'cash' ? 'نقدي 💵' : 'شبكة 💳'}
                              </span>
                            </div>
                          </div>

                          <div className="text-left flex items-center gap-3">
                            <div>
                              <strong className="text-sm sm:text-base font-black text-rose-400 font-mono block">
                                {Number(order.total_price || 0).toFixed(2)} ﷼
                              </strong>
                              {Number(order.refunded_amount || 0) > 0 && (
                                <span className="text-[10px] text-slate-500 block">
                                  استُرد: {Number(order.refunded_amount).toFixed(2)} ﷼
                                </span>
                              )}
                            </div>
                            <button className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 group-hover:bg-rose-500 group-hover:text-white flex items-center justify-center transition">
                              <ArrowRight className="w-4 h-4 rotate-180" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 🌟 STEP 2: Order Selected -> Configure Refund Items & Quantities */}
          {selectedOrder && !processedRefund && (
            <div className="space-y-4 animate-fade-in">
              {/* Selected Order Summary Banner */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold">الفاتورة المحددة:</span>
                    <strong className="text-white font-mono font-bold text-sm">
                      #{selectedOrder.order_number}
                    </strong>
                    <span className="text-[10px] text-slate-500">
                      {new Date(selectedOrder.created_at).toLocaleDateString('ar-SA')}
                    </span>
                  </div>
                  {selectedOrder.customer_name && (
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>العميل: <strong className="text-slate-300">{selectedOrder.customer_name}</strong></span>
                      {selectedOrder.customer_phone && <span>({selectedOrder.customer_phone})</span>}
                      {Number(selectedOrder.loyalty_points_earned || 0) > 0 && (
                        <span className="text-amber-400 font-bold">
                          👑 نقاط الفاتورة: +{selectedOrder.loyalty_points_earned}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  تغيير الفاتورة 🔄
                </button>
              </div>

              {/* Items Selection Card */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-rose-400" />
                    حدد الأصناف والكميات المراد استرجاعها:
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSelectAllItems}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 font-bold transition"
                    >
                      إرجاع كامل ⚡
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllItems}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 font-bold transition"
                    >
                      تصفير
                    </button>
                  </div>
                </div>

                {/* Items List Table */}
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {(Array.isArray(selectedOrder.items) ? selectedOrder.items : []).map(
                    (item: any, idx: number) => {
                      const itemKey = item.id || `item_${idx}`;
                      const maxQty = Number(item.quantity || 1);
                      const currentRefundQty = refundQuantities[itemKey] || 0;
                      const unitPrice =
                        Number(item.unit_price) || (Number(item.total_price) / maxQty);
                      const itemTotalRefund = unitPrice * currentRefundQty;

                      return (
                        <div
                          key={itemKey}
                          className={`p-2.5 rounded-xl border transition flex items-center justify-between text-xs ${
                            currentRefundQty > 0
                              ? 'bg-rose-500/10 border-rose-500/40 text-white'
                              : 'bg-slate-900 border-slate-800/80 text-slate-400'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-200 block text-xs">
                              {item.name || 'منتج'}
                            </span>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2">
                              <span>سعر الوحدة: {unitPrice.toFixed(2)} ﷼</span>
                              <span>الكمية بالفاتورة: {maxQty}</span>
                            </div>
                          </div>

                          {/* Stepper + Item Total */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700/80 rounded-xl p-1">
                              <button
                                type="button"
                                onClick={() => updateItemQty(itemKey, maxQty, -1)}
                                disabled={currentRefundQty <= 0}
                                className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center transition"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-7 text-center font-mono font-bold text-xs text-white">
                                {currentRefundQty}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateItemQty(itemKey, maxQty, 1)}
                                disabled={currentRefundQty >= maxQty}
                                className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center transition"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="text-left w-16">
                              <span className="font-mono font-bold text-xs text-rose-400 block">
                                {itemTotalRefund.toFixed(2)} ﷼
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Refund Reason & Tender Method Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Reason Selection */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="text-xs font-bold text-white block">
                    سبب الاسترجاع (الزكاة والضريبة):
                  </label>
                  <select
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-rose-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="رغبة العميل (بدون عيب بالمنتج)">رغبة العميل (بدون عيب بالمنتج)</option>
                    <option value="منتج غير مطابق للمواصفات أو الطلب">منتج غير مطابق للمواصفات أو الطلب</option>
                    <option value="تلف أو عيب بالمنتج / خطأ في التحضير">تلف أو عيب بالمنتج / خطأ في التحضير</option>
                    <option value="طلب مكرر أو خطأ إدخال من الكاشير">طلب مكرر أو خطأ إدخال من الكاشير</option>
                    <option value="أخرى">أخرى (كتابة ملاحظة)</option>
                  </select>

                  {refundReason === 'أخرى' && (
                    <input
                      type="text"
                      placeholder="اكتب سبب الاسترجاع بدقة..."
                      value={customReasonNote}
                      onChange={(e) => setCustomReasonNote(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-rose-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none mt-1"
                    />
                  )}
                </div>

                {/* Refund Payment Tender */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="text-xs font-bold text-white block">
                    طريقة رد المبلغ للعميل:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundMethod('cash')}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                        refundMethod === 'cash'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>نقداً 💵 (من الدرج)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRefundMethod('card')}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                        refundMethod === 'card'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>بطاقة / مدى 💳</span>
                    </button>
                  </div>

                  {refundMethod === 'cash' && (
                    <p className="text-[10px] text-amber-400/90 font-semibold pt-1">
                      ⚠️ تنبيه: سيتم خصم هذا المبلغ من عهدة الدرج النقدية للوردية الحالية.
                    </p>
                  )}
                </div>
              </div>

              {/* Financial Calculation Summary Box */}
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>المبلغ المسترد قبل الضريبة:</span>
                  <span className="font-mono">{subtotalBeforeTax.toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>ضريبة القيمة المضافة المستردة (15%):</span>
                  <span className="font-mono">{taxAmount.toFixed(2)} ﷼</span>
                </div>

                {pointsToDeduct > 0 && (
                  <div className="flex justify-between text-xs text-amber-300 font-bold border-t border-rose-500/20 pt-1.5">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      نقاط الولاء المطلوب عكسها من حساب العميل:
                    </span>
                    <span className="font-mono">-{pointsToDeduct} نقطة</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-sm font-black text-white border-t border-rose-500/30 pt-2">
                  <span className="text-rose-300">إجمالي المبلغ المسترد (Total Refund):</span>
                  <strong className="font-mono text-xl text-rose-400">
                    {totalRefundAmount.toFixed(2)} ﷼
                  </strong>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  إلغاء / اختيار فاتورة أخرى
                </button>

                <button
                  type="button"
                  onClick={handleProcessRefund}
                  disabled={processing || itemsToRefund.length === 0 || totalRefundAmount <= 0}
                  className="flex-[2] py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition"
                >
                  {processing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري معالجة الاسترجاع وإصدار الإشعار...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>تأكيد الاسترجاع وإصدار الإشعار الدائن ({totalRefundAmount.toFixed(2)} ﷼)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 🌟 STEP 3: Refund Processed Successfully -> ZATCA Credit Note Display & Print */}
          {processedRefund && (
            <div className="space-y-4 animate-fade-in">
              {/* Success Alert Banner */}
              <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>تم استرجاع الفاتورة وإصدار الإشعار الدائن الضريبي بنجاح!</span>
                </div>
                <span className="font-mono text-white text-xs">#{processedRefund.credit_note_number}</span>
              </div>

              {/* Printable 80mm ZATCA Tax Credit Note */}
              <div
                ref={printReceiptRef}
                className="bg-white text-slate-900 p-5 rounded-2xl shadow-xl max-w-sm mx-auto font-mono text-xs space-y-3 border border-slate-200 print:m-0 print:p-2 print:shadow-none print:w-full"
              >
                {/* Store Header */}
                <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
                  {store.logo_url && (
                    <img
                      src={store.logo_url}
                      alt={store.name}
                      className="w-12 h-12 object-contain mx-auto rounded-full mb-1"
                    />
                  )}
                  <h4 className="font-black text-sm text-black">{store.name}</h4>
                  {processedRefund.branch_name && (
                    <p className="text-[10px] text-slate-600">فرع: {processedRefund.branch_name}</p>
                  )}
                  {store.tax_number && (
                    <p className="text-[10px] text-slate-700 font-bold">الرقم الضريبي: {store.tax_number}</p>
                  )}
                </div>

                {/* Credit Note Title */}
                <div className="text-center bg-slate-100 py-1.5 px-2 rounded border border-slate-300">
                  <strong className="block text-black font-extrabold text-xs">
                    إشعار دائن ضريبي مبسط
                  </strong>
                  <span className="text-[9px] text-slate-600 font-bold uppercase tracking-wider block">
                    Simplified Tax Credit Note
                  </span>
                </div>

                {/* Metadata */}
                <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-slate-300 text-slate-700">
                  <div className="flex justify-between">
                    <span>رقم الإشعار الدائن:</span>
                    <strong className="text-black font-bold">#{processedRefund.credit_note_number}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>إشارة للفاتورة الأصلية:</span>
                    <strong className="text-black font-bold">#{processedRefund.order_number}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>تاريخ الاسترجاع:</span>
                    <span>
                      {new Date(processedRefund.created_at).toLocaleDateString('ar-SA')} -{' '}
                      {new Date(processedRefund.created_at).toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {processedRefund.cashier_name && (
                    <div className="flex justify-between">
                      <span>الكاشير المسؤول:</span>
                      <strong className="text-black">{processedRefund.cashier_name}</strong>
                    </div>
                  )}
                  {processedRefund.customer_name && (
                    <div className="flex justify-between">
                      <span>العميل:</span>
                      <strong className="text-black">{processedRefund.customer_name}</strong>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>سبب الاسترجاع:</span>
                    <span className="text-black">{processedRefund.refund_reason}</span>
                  </div>
                </div>

                {/* Refunded Items Table */}
                <div className="space-y-1 pb-2 border-b border-dashed border-slate-300 text-[11px]">
                  <div className="flex justify-between font-bold text-black pb-1 border-b border-dotted border-slate-300">
                    <span>الصنف</span>
                    <span>الكمية × السعر</span>
                    <span>الإجمالي</span>
                  </div>
                  {processedRefund.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-slate-800">
                      <span className="font-bold truncate max-w-[120px]">{item.name}</span>
                      <span>
                        {item.quantity} × {item.unit_price.toFixed(2)}
                      </span>
                      <strong className="text-black font-bold">{item.total_price.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>

                {/* Financial Totals */}
                <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-slate-300">
                  <div className="flex justify-between text-slate-600">
                    <span>المبلغ الخاضع للضريبة:</span>
                    <span>{Number(processedRefund.subtotal).toFixed(2)} ﷼</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ضريبة القيمة المضافة (15%):</span>
                    <span>{Number(processedRefund.tax_amount).toFixed(2)} ﷼</span>
                  </div>
                  <div className="flex justify-between font-black text-black text-sm pt-1 border-t border-slate-300">
                    <span>المبلغ المسترد الإجمالي:</span>
                    <span>{Number(processedRefund.total_refunded).toFixed(2)} ﷼</span>
                  </div>
                  <div className="flex justify-between text-slate-600 text-[10px]">
                    <span>طريقة رد المبلغ:</span>
                    <strong className="text-black">
                      {processedRefund.refund_method === 'cash' ? 'نقداً 💵' : 'بطاقة / مدى 💳'}
                    </strong>
                  </div>
                  {processedRefund.loyalty_points_deducted > 0 && (
                    <div className="flex justify-between text-amber-700 text-[10px] font-bold">
                      <span>نقاط الولاء المخصومة:</span>
                      <span>-{processedRefund.loyalty_points_deducted} نقطة</span>
                    </div>
                  )}
                </div>

                {/* ZATCA QR Code */}
                {processedRefund.zatca_qr && (
                  <div className="text-center pt-1 space-y-1">
                    <div className="bg-white p-2 rounded-xl inline-block border border-slate-200">
                      <QRCodeSVG
                        value={processedRefund.zatca_qr}
                        size={110}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <p className="text-[9px] text-slate-500 font-sans">
                      رمز التحقق الضريبي المعتمد (ZATCA TLV)
                    </p>
                  </div>
                )}

                <div className="text-center text-[9px] text-slate-500 pt-1">
                  Radar Cloud POS & Loyalty System
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handlePrintCreditNote}
                  className="py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <Printer className="w-4 h-4 text-slate-900" />
                  <span>طباعة الإشعار الدائن (Print 80mm)</span>
                </button>

                {store.enable_pos_whatsapp_receipt && processedRefund.customer_phone ? (
                  <a
                    href={LoyaltyService.generateCreditNoteWhatsAppUrl(store, processedRefund)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition text-center"
                  >
                    <Send className="w-4 h-4" />
                    <span>إرسال الإشعار للعميل عبر الواتساب</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrder(null);
                      setProcessedRefund(null);
                    }}
                    className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>استرجاع فاتورة أخرى</span>
                  </button>
                )}
              </div>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-slate-400 hover:text-white text-xs font-semibold underline transition"
                >
                  إغلاق النافذة
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

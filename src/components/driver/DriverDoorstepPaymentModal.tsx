import React, { useState } from 'react';
import {
  X,
  CreditCard,
  QrCode,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Sparkles,
  Receipt,
  User,
  MapPin,
  Check,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { WhatsAppOrderPayload } from '../../types';
import { playBeepSound } from '../../lib/sound';
import confetti from 'canvas-confetti';

interface DriverDoorstepPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: WhatsAppOrderPayload;
  onConfirmDelivery: (
    paymentMethod: 'cash' | 'card' | 'online_link',
    collectedAmount: number,
    notes?: string
  ) => void;
}

export const DriverDoorstepPaymentModal: React.FC<DriverDoorstepPaymentModalProps> = ({
  isOpen,
  onClose,
  order,
  onConfirmDelivery,
}) => {
  const isAlreadyPaid = order.payment_status === 'paid';
  const totalAmount = Number(order.total_amount) || 0;

  const [paymentTab, setPaymentTab] = useState<'qr_apple_pay' | 'card_on_phone' | 'cash'>(
    isAlreadyPaid ? 'cash' : 'qr_apple_pay'
  );

  // Cash calculation
  const [cashReceived, setCashReceived] = useState<number | ''>(totalAmount);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Mock Card Direct on Phone
  const [cardNumber, setCardNumber] = useState('4111 •••• •••• 1111');
  const [cardHolder, setCardHolder] = useState(order.customer_name || 'عميل رادار');
  const [cardSuccess, setCardSuccess] = useState(false);

  if (!isOpen) return null;

  const changeDue = typeof cashReceived === 'number' ? Math.max(0, cashReceived - totalAmount) : 0;
  const isCashSufficient = typeof cashReceived === 'number' && cashReceived >= totalAmount;

  // Direct QR payment link
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://radar.taeybsalah.workers.dev';
  const paymentQrUrl = `${origin}/?store=${encodeURIComponent(order.store_id)}&portal=customer&pay_order=${encodeURIComponent(order.order_id)}&amount=${totalAmount}`;

  const handleComplete = (method: 'cash' | 'card' | 'online_link', amount: number) => {
    setIsProcessing(true);
    playBeepSound('success');
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
    });

    setTimeout(() => {
      setIsProcessing(false);
      onConfirmDelivery(method, amount, notes.trim() || undefined);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in text-right" dir="rtl">
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[94vh] animate-scale-up">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">تحصيل وتسليم الطلب عند الباب</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  #{order.order_id.slice(-6)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                العميل: <span className="text-white font-bold">{order.customer_name}</span> • {order.customer_phone}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          
          {/* Order Bill Summary Banner */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium">المطلوب تحصيله من العميل:</span>
              <div className="text-2xl font-black text-amber-400 font-mono mt-0.5">
                {totalAmount.toFixed(2)} <span className="text-xs font-normal text-slate-400">ريال</span>
              </div>
            </div>
            {isAlreadyPaid ? (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-black flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                مدفوع مسبقاً بالكامل
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-black flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                الدفع عند الاستلام
              </span>
            )}
          </div>

          {/* If already paid, simple 1-click confirmation */}
          {isAlreadyPaid ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-400 flex items-center justify-center mx-auto text-2xl">
                ✅
              </div>
              <h4 className="text-sm font-bold text-white">الطلب مدفوع إلكترونياً ولا يتطلب تحصيل أي مبالغ</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                سلّم الوجبة للعميل واضغط الزر أدناه لتأكيد إتمام التوصيل وإشعار المتجر.
              </p>
            </div>
          ) : (
            <>
              {/* Payment Method Selector Tabs */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950/80 rounded-2xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setPaymentTab('qr_apple_pay')}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 ${
                    paymentTab === 'qr_apple_pay'
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>شبكة / Apple Pay</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentTab('card_on_phone')}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 ${
                    paymentTab === 'card_on_phone'
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>بطاقة على جوالك</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentTab('cash')}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 ${
                    paymentTab === 'cash'
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <DollarSign className="w-4 h-4" />
                  <span>كاش نقداً</span>
                </button>
              </div>

              {/* Tab 1: Direct Apple Pay / Mada QR for customer's phone */}
              {paymentTab === 'qr_apple_pay' && (
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-center space-y-3 animate-fade-in">
                  <div className="flex items-center justify-center gap-2 text-amber-400 font-bold text-xs">
                    <Sparkles className="w-4 h-4" />
                    <span>وجّه الشاشة للعميل ليمسح ويدفع بالـ Apple Pay أو مدى</span>
                  </div>

                  <div className="p-3 bg-white rounded-2xl inline-block shadow-xl mx-auto border-4 border-amber-500/50">
                    <QRCodeSVG value={paymentQrUrl} size={150} level="M" />
                  </div>

                  <p className="text-[11px] text-slate-400">
                    يمسح العميل الكود بكاميرا جواله وتفتح له صفحة الدفع الرسمية مباشرة للدفع بالبصمة.
                  </p>
                </div>
              )}

              {/* Tab 2: Direct Card Input on Driver's Phone */}
              {paymentTab === 'card_on_phone' && (
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>محطة الدفع المتنقلة (Tap to Pay / شبكة)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      مدى • فيزا • ماستركارد
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">رقم بطاقة العميل:</label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white text-center tracking-wider"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">تاريخ الانتهاء:</label>
                        <input
                          type="text"
                          defaultValue="08/28"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">رمز الأمان (CVV):</label>
                        <input
                          type="password"
                          defaultValue="•••"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      playBeepSound('success');
                      setCardSuccess(true);
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                      cardSuccess
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {cardSuccess ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>تم خصم {totalAmount} ريال بنجاح من البطاقة!</span>
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        <span>تنفيذ عملية الخصم الفوري ({totalAmount} ريال)</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Tab 3: Cash & Change Calculator */}
              {paymentTab === 'cash' && (
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 animate-fade-in">
                  <div>
                    <label className="text-xs text-slate-300 font-bold block mb-1.5">
                      المبلغ الذي سلمه لك العميل (كاش):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 px-3 text-lg font-mono text-white text-center font-bold focus:border-amber-500 focus:outline-none"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">ريال</span>
                    </div>
                  </div>

                  {/* Quick cash pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400">اقتراحات:</span>
                    {[totalAmount, 50, 100, 200, 500].filter((v) => v >= totalAmount).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCashReceived(val)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono font-bold transition border border-slate-700"
                      >
                        {val} ريال
                      </button>
                    ))}
                  </div>

                  {/* Change due alert */}
                  {typeof cashReceived === 'number' && (
                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        isCashSufficient
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      <span className="text-xs font-bold">
                        {isCashSufficient ? 'الباقي المطلوب إرجاعه للعميل:' : 'المبلغ المدخل أقل من الفاتورة!'}
                      </span>
                      <span className="text-base font-black font-mono">
                        {changeDue.toFixed(2)} ريال
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Optional Driver Delivery Notes */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">ملاحظة التوصيل (اختياري):</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: تم التسليم عند الباب الخارجي / للعميل شخصياً"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Modal Footer / Action Button */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition"
          >
            إلغاء وتراجع
          </button>

          <button
            type="button"
            disabled={isProcessing || (!isAlreadyPaid && paymentTab === 'cash' && !isCashSufficient)}
            onClick={() => {
              if (isAlreadyPaid) {
                handleComplete('online_link', totalAmount);
              } else if (paymentTab === 'cash') {
                handleComplete('cash', totalAmount);
              } else if (paymentTab === 'card_on_phone') {
                handleComplete('card', totalAmount);
              } else {
                handleComplete('online_link', totalAmount);
              }
            }}
            className="flex-[2] py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs sm:text-sm shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <span>جاري تسجيل التسليم...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>تأكيد التسليم بنجاح وإغلاق الطلب ✅</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

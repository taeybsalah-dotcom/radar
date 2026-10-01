import React, { useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  Lock,
  X,
  Zap,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ArrowRight,
  Smartphone,
  Sparkles,
} from 'lucide-react';

export interface SandboxPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  itemDescription: string;
  amount: number;
  currency?: string;
  storeName?: string;
  onProcessPayment: (details: {
    paymentMethod: 'mada' | 'visa' | 'mastercard' | 'credit_card';
    cardNumber: string;
    cardholderName: string;
    expiryDate: string;
    cvv: string;
  }) => Promise<void>;
}

export const TEST_CARDS = [
  {
    id: 'mada',
    name: 'مدى (Mada)',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    number: '4588 3333 3333 3338',
    cardholder: 'MADA TESTER',
    expiry: '12/28',
    cvv: '123',
    otp: '1234',
    logo: '💳 مدى',
  },
  {
    id: 'visa',
    name: 'فيزا (Visa)',
    badgeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    number: '4111 1111 1111 1111',
    cardholder: 'VISA TESTER',
    expiry: '05/29',
    cvv: '123',
    otp: '1234',
    logo: '💳 VISA',
  },
  {
    id: 'mastercard',
    name: 'ماستركارد (Mastercard)',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    number: '5555 5555 5555 4444',
    cardholder: 'MASTERCARD TESTER',
    expiry: '08/27',
    cvv: '123',
    otp: '1234',
    logo: '💳 MC',
  },
];

export const SandboxPaymentModal: React.FC<SandboxPaymentModalProps> = ({
  isOpen,
  onClose,
  title,
  itemDescription,
  amount,
  currency = 'ر.س',
  storeName,
  onProcessPayment,
}) => {
  const [selectedCardType, setSelectedCardType] = useState<'mada' | 'visa' | 'mastercard'>('mada');
  const [cardNumber, setCardNumber] = useState(TEST_CARDS[0].number);
  const [cardholderName, setCardholderName] = useState(TEST_CARDS[0].cardholder);
  const [expiryDate, setExpiryDate] = useState(TEST_CARDS[0].expiry);
  const [cvv, setCvv] = useState(TEST_CARDS[0].cvv);

  // OTP Step Simulation
  const [step, setStep] = useState<'CARD_DETAILS' | 'OTP_VERIFICATION' | 'PROCESSING'>('CARD_DETAILS');
  const [otpCode, setOtpCode] = useState('1234');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectTestCard = (card: typeof TEST_CARDS[0]) => {
    setSelectedCardType(card.id as any);
    setCardNumber(card.number);
    setCardholderName(card.cardholder);
    setExpiryDate(card.expiry);
    setCvv(card.cvv);
    setOtpCode(card.otp);
    setErrorMsg(null);
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text.replace(/\s+/g, ''));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSubmitCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber || cardNumber.replace(/\s/g, '').length < 15) {
      setErrorMsg('يرجى إدخال رقم بطاقة صحيح ومكتمل');
      return;
    }
    if (!cardholderName.trim()) {
      setErrorMsg('يرجى إدخال اسم حامل البطاقة');
      return;
    }
    if (!expiryDate || !expiryDate.includes('/')) {
      setErrorMsg('يرجى إدخال تاريخ انتهاء صحيح (MM/YY)');
      return;
    }
    if (!cvv || cvv.length < 3) {
      setErrorMsg('يرجى إدخال رمز الأمان (CVV)');
      return;
    }

    setErrorMsg(null);
    setStep('OTP_VERIFICATION');
  };

  const handleConfirmOtp = async () => {
    if (otpCode !== '1234' && otpCode !== '123456') {
      setErrorMsg('رمز التحقق غير صحيح. استخدم الرمز التجريبي المعتمد (1234)');
      return;
    }

    setErrorMsg(null);
    setStep('PROCESSING');

    try {
      await onProcessPayment({
        paymentMethod: selectedCardType,
        cardNumber: cardNumber.replace(/\s+/g, ''),
        cardholderName,
        expiryDate,
        cvv,
      });
      // Reset on close
      setStep('CARD_DETAILS');
    } catch (err: any) {
      setErrorMsg(err.message || 'فشلت معالجة عملية الدفع');
      setStep('OTP_VERIFICATION');
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="relative p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-500/10">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">{title}</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                  Sandbox التجريبي
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {storeName ? `متجر: ${storeName}` : 'بوابة السداد الإلكتروني المعتمدة'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Order Summary Box */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">بيان العملية:</span>
              <span className="text-white font-bold">{itemDescription}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-900">
              <span className="text-slate-400">إجمالي المبلغ المطلوب:</span>
              <span className="text-emerald-400 font-extrabold text-base font-mono">
                {amount.toLocaleString('ar-SA')} {currency}
              </span>
            </div>
          </div>

          {/* Sandbox Security Notice */}
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-2.5 text-blue-300 text-xs">
            <ShieldCheck className="w-4 h-4 shrink-0 text-blue-400" />
            <span>
              <strong>بيئة فحص آمنة (Moyasar Sandbox):</strong> لن يتم خصم أي مبالغ حقيقية من حسابك البنكي.
            </span>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === 'CARD_DETAILS' && (
            <form onSubmit={handleSubmitCard} className="space-y-4">
              {/* Test Cards Quick Selection Bar */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>أرقام بطاقات الاختبار الجاهزة (ضغطة واحدة للتعبئة):</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TEST_CARDS.map((card, idx) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => handleSelectTestCard(card)}
                      className={`p-2.5 rounded-xl border text-right transition flex flex-col justify-between ${
                        selectedCardType === card.id
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-[11px] font-black">{card.name}</span>
                        {selectedCardType === card.id && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 truncate dir-ltr">
                        {card.number.substring(0, 9)}...
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Luxury Virtual Card Preview */}
              <div className="relative p-5 rounded-2xl bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 border border-slate-700 shadow-xl overflow-hidden">
                {/* Glowing Aura */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="relative z-10 flex justify-between items-start mb-6">
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <div className="w-8 h-6 rounded-md bg-gradient-to-r from-amber-400 to-amber-200 border border-amber-400 shadow-sm" />
                    <span className="text-[10px] text-slate-400 font-mono">EMV CHIP</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-700 text-white font-extrabold text-xs">
                    {TEST_CARDS.find((c) => c.id === selectedCardType)?.logo || '💳 بطاقة بنكية'}
                  </span>
                </div>

                <div className="relative z-10 space-y-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-xl font-mono tracking-widest text-amber-300 font-bold dir-ltr">
                      {cardNumber || '•••• •••• •••• ••••'}
                    </div>
                  </div>

                  <div className="flex justify-between items-end text-xs text-slate-300 font-mono pt-1">
                    <div>
                      <span className="text-[9px] text-slate-400 block">CARDHOLDER</span>
                      <span className="font-bold uppercase tracking-wider">{cardholderName || 'TEST USER'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block">EXPIRES</span>
                      <span className="font-bold">{expiryDate || 'MM/YY'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Input Fields */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    اسم حامل البطاقة (Cardholder Name)
                  </label>
                  <input
                    type="text"
                    required
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    placeholder="مثال: MADA TESTER"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-amber-500 focus:outline-none uppercase font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    رقم البطاقة (Card Number)
                  </label>
                  <input
                    type="text"
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4588 3333 3333 3338"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-amber-500 focus:outline-none font-mono dir-ltr text-right"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      تاريخ الانتهاء (MM/YY)
                    </label>
                    <input
                      type="text"
                      required
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      placeholder="12/28"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-amber-500 focus:outline-none font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      رمز الأمان (CVV)
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      placeholder="123"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-amber-500 focus:outline-none font-mono text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm transition shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 rtl:space-x-reverse"
              >
                <Lock className="w-4 h-4" />
                <span>متابعة للتحقق وسداد {amount.toLocaleString('ar-SA')} {currency} (Sandbox) 🚀</span>
              </button>
            </form>
          )}

          {step === 'OTP_VERIFICATION' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">التحقق الأمني المالي (3D Secure OTP)</h4>
                <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                  تم إرسال رمز تحقق تجريبي إلى هاتفك المسجل لدى المشغل البنكي.
                </p>
                <div className="inline-block px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold">
                  رمز التحقق التجريبي المعتمد: 1234
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 text-center">
                  أدخل رمز التحقق (OTP):
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="1234"
                  className="w-full max-w-xs mx-auto block px-4 py-3 rounded-2xl bg-slate-950 border-2 border-amber-500/50 text-amber-400 text-xl font-mono text-center tracking-widest focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('CARD_DETAILS')}
                  className="w-1/3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  الرجوع
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOtp}
                  className="w-2/3 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs transition shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 rtl:space-x-reverse"
                >
                  <Zap className="w-4 h-4" />
                  <span>تأكيد العملية وتفعيل الاشتراك ✅</span>
                </button>
              </div>
            </div>
          )}

          {step === 'PROCESSING' && (
            <div className="py-10 text-center space-y-4 animate-fadeIn">
              <div className="w-14 h-14 mx-auto rounded-full border-4 border-amber-500/30 border-t-amber-400 animate-spin flex items-center justify-center" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">جاري معالجة الدفع عبر بوابة Moyasar Sandbox...</h4>
                <p className="text-xs text-slate-400">يتم الآن تسجيل الفاتورة وتفعيل الاشتراك وتحديث رصيد العمولات ⚡</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Store, Customer } from '../types';
import { LoyaltyService } from '../lib/supabase';
import {
  Sparkles,
  Phone,
  User,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Gift,
  AlertCircle,
  X,
  RotateCcw,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CustomerLoginGateProps {
  store: Store;
  onAuthenticated: (customer: Customer) => void;
  onClose?: () => void;
  initialPhone?: string;
  initialName?: string;
}

function normalizeArabicDigits(str: string): string {
  const arabicNumerals = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
  return str.replace(/[٠-٩۰۱۲۳۴۵۶۷۸۹]/g, (d) => (arabicNumerals.indexOf(d) % 10).toString());
}

export const CustomerLoginGate: React.FC<CustomerLoginGateProps> = ({
  store,
  onAuthenticated,
  onClose,
  initialPhone = '',
  initialName = '',
}) => {
  const [step, setStep] = useState<'INFO' | 'OTP'>('INFO');
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState(initialName);
  const [enteredCode, setEnteredCode] = useState('');
  const [generatedOTP, setGeneratedOTP] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derive welcome gift configuration
  const giftType = store.welcome_gift_type || 'POINTS';
  const welcomePoints = store.welcome_points ?? 50;
  const welcomeOfferTitle = store.welcome_offer_title?.trim() || 'عرض وتجربة ترحيبية مجانية';

  // 1. إرسال كود التحقق
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const cleanPhone = normalizeArabicDigits(phone).replace(/[^\d+]/g, '');

    if (!trimmedName) {
      setErrorMessage('يرجى إدخال اسمك الكريم للمتابعة');
      return;
    }

    if (!cleanPhone || cleanPhone.replace(/\D/g, '').length < 9) {
      setErrorMessage('يرجى إدخال رقم جوال صحيح (مثال: 05XXXXXXXX)');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      setGeneratedOTP(otp);

      // إرسال الكود للواتساب عبر البوابة المعتمدة للمتجر (Meta أو QR Gateway)
      await LoyaltyService.sendStoreWhatsAppOTP(
        store.id,
        cleanPhone,
        otp,
        store.name,
        trimmedName
      );

      setStep('OTP');
      setEnteredCode('');
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء إرسال كود التحقق');
    } finally {
      setLoading(false);
    }
  };

  // 2. التحقق من كود OTP وتوثيق العميل
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = normalizeArabicDigits(enteredCode).trim();

    if (cleanCode === generatedOTP || cleanCode === '1234') {
      setLoading(true);
      setErrorMessage(null);

      try {
        const cleanPhone = normalizeArabicDigits(phone).replace(/[^\d+]/g, '');
        const trimmedName = name.trim();

        // تسجيل أو جلب العميل
        const finalCustomer = await LoyaltyService.registerCustomer(
          store.id,
          cleanPhone,
          trimmedName
        );

        // حفظ الجلسة الدائمة
        LoyaltyService.saveCustomerProfile(
          store.id,
          { name: finalCustomer.name || trimmedName, phone: finalCustomer.phone },
          store.slug
        );

        confetti({
          particleCount: 75,
          spread: 60,
          origin: { y: 0.6 },
          colors: [store.secondary_color || '#d4af37', '#10B981', '#FFFFFF'],
        });

        onAuthenticated(finalCustomer);
      } catch (err: any) {
        setErrorMessage(err.message || 'فشل في حفظ بيانات الحساب بعد التحقق');
      } finally {
        setLoading(false);
      }
    } else {
      setErrorMessage('❌ كود التحقق غير صحيح! يرجى إدخال الكود الصحيح أو 1234 للتجربة');
    }
  };

  return (
    <div className="max-w-md mx-auto animate-fade-in relative">
      <div
        className="glass-card rounded-[2.5rem] p-6 sm:p-8 border bg-slate-900/95 shadow-2xl relative overflow-hidden backdrop-blur-2xl"
        style={{
          borderColor: `${store.secondary_color || '#d4af37'}30`,
        }}
      >
        {/* Glow Effects */}
        <div
          className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: store.secondary_color || '#d4af37' }}
        />
        <div
          className="absolute bottom-0 left-0 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-15"
          style={{ backgroundColor: store.primary_color || '#0F172A' }}
        />

        {/* Close Button if onClose provided */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 left-4 p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white transition z-10"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Brand Header */}
        <div className="text-center space-y-3 pb-5 border-b border-slate-800/80 relative">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name}
              className="w-14 h-14 rounded-2xl object-cover border-2 shadow-xl bg-slate-950 mx-auto"
              style={{ borderColor: `${store.secondary_color || '#d4af37'}50` }}
            />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-2xl mx-auto shadow-lg font-black"
              style={{
                backgroundColor: `${store.secondary_color || '#d4af37'}15`,
                borderColor: `${store.secondary_color || '#d4af37'}40`,
                color: store.secondary_color || '#d4af37',
              }}
            >
              👑
            </div>
          )}

          <div>
            <h2 className="text-xl font-black text-white tracking-tight">
              {store.name}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              توثيق الدخول وربط الحساب
            </p>
          </div>

          <div className="inline-flex items-center space-x-1.5 rtl:space-x-reverse px-3.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>توثيق سريع لمرة واحدة فقط</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-semibold animate-shake flex items-start space-x-2.5 rtl:space-x-reverse leading-relaxed">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: Name & Phone Entry */}
        {step === 'INFO' && (
          <form onSubmit={handleRequestOTP} className="mt-5 space-y-4">
            {/* Welcome Perk Banner */}
            <div
              className="p-3.5 rounded-2xl border flex items-center space-x-3 rtl:space-x-reverse"
              style={{
                backgroundColor: `${store.secondary_color || '#d4af37'}10`,
                borderColor: `${store.secondary_color || '#d4af37'}25`,
              }}
            >
              <div
                className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 text-lg shadow-sm"
                style={{
                  backgroundColor: `${store.secondary_color || '#d4af37'}20`,
                  borderColor: `${store.secondary_color || '#d4af37'}40`,
                }}
              >
                🎁
              </div>
              <div className="text-xs">
                {giftType === 'POINTS' && (
                  <p className="text-slate-300">
                    احصل فوراً على <strong className="font-mono font-bold" style={{ color: store.secondary_color || '#d4af37' }}>+{welcomePoints} نقطة ولاء</strong> كهدية ترحيبية مجانية!
                  </p>
                )}
                {giftType === 'OFFER' && (
                  <p className="text-slate-300">
                    احصل فوراً على: <strong className="font-bold" style={{ color: store.secondary_color || '#d4af37' }}>"{welcomeOfferTitle}"</strong>!
                  </p>
                )}
                {giftType === 'NONE' && (
                  <p className="text-slate-300">
                    فعّل بطاقة عضويتك الرقمية واحفظ نقاطك وطلباتك بضغطة واحدة!
                  </p>
                )}
              </div>
            </div>

            {/* Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-200 block text-right">
                الاسم الكريم:
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="مثال: عبد العزيز، سارة..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm font-bold text-white outline-none transition"
                  autoFocus
                  required
                />
                <User className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Phone Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-200 block text-right">
                رقم الجوال:
              </label>
              <div className="relative">
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  placeholder="05xxxxxxxx"
                  value={phone}
                  onChange={(e) => {
                    const normalized = normalizeArabicDigits(e.target.value);
                    setPhone(normalized);
                  }}
                  dir="ltr"
                  className="w-full bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl px-4 py-3 text-base font-bold text-white font-mono outline-none text-center tracking-wider transition"
                  required
                />
                <Phone className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: store.secondary_color || '#d4af37',
                color: '#000000',
              }}
              className="w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg transition hover:brightness-110 disabled:opacity-50 mt-2"
            >
              <span>{loading ? 'جاري إرسال الرمز...' : 'إرسال رمز التحقق (OTP) 💬'}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </form>
        )}

        {/* STEP 2: 4-Digit OTP Entry */}
        {step === 'OTP' && (
          <form onSubmit={handleVerifyOTP} className="mt-5 space-y-5 animate-fade-in">
            {/* Phone Summary & Change Link */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 rtl:space-x-reverse text-xs">
                <User className="w-4 h-4 text-slate-400" />
                <span className="font-bold text-white">{name}</span>
                <span className="text-slate-500">|</span>
                <span className="font-mono text-slate-300" dir="ltr">{phone}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('INFO');
                  setErrorMessage(null);
                }}
                className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-bold"
              >
                <RotateCcw className="w-3 h-3" />
                <span>تعديل</span>
              </button>
            </div>

            {/* Instruction */}
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-white">أدخل كود التحقق (4 أرقام)</h3>
              <p className="text-xs text-slate-400">
                أدخل الكود المرسل لواتساب رقمك (أو <strong className="text-amber-400 font-mono">1234</strong> للتجربة):
              </p>
            </div>

            {/* 4-Digit Input */}
            <div className="space-y-2">
              <input
                type="tel"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={enteredCode}
                onChange={(e) => {
                  const cleaned = normalizeArabicDigits(e.target.value).replace(/\D/g, '');
                  setEnteredCode(cleaned);
                }}
                className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-400 rounded-2xl px-5 py-3.5 text-2xl font-black text-white font-mono outline-none text-center tracking-[0.5em] transition"
                autoFocus
                required
              />
            </div>

            {/* Confirm Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: store.secondary_color || '#d4af37',
                color: '#000000',
              }}
              className="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg transition hover:brightness-110 disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{loading ? 'جاري التحقق...' : 'تأكيد ومتابعة ✅'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

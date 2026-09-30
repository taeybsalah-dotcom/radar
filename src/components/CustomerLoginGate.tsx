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
  Send,
  Gift,
  AlertCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CustomerLoginGateProps {
  store: Store;
  onAuthenticated: (customer: Customer) => void;
}

export const CustomerLoginGate: React.FC<CustomerLoginGateProps> = ({
  store,
  onAuthenticated,
}) => {
  const [step, setStep] = useState<'PHONE' | 'OTP' | 'NEW_REGISTER'>('PHONE');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [generatedOTP, setGeneratedOTP] = useState<string>('');
  const [enteredCode, setEnteredCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOtpSent, setIsOtpSent] = useState(false);

  // Derive welcome gift configuration
  const giftType = store.welcome_gift_type || 'POINTS';
  const welcomePoints = store.welcome_points ?? 50;
  const welcomeOfferTitle = store.welcome_offer_title?.trim() || 'عرض وتجربة ترحيبية مجانية';

  // 1. التحقق من رقم الجوال
  const handleCheckPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setErrorMessage('يرجى كتابة رقم الجوال');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const cust = await LoyaltyService.getCustomer(store.id, phone.trim());

      if (cust) {
        // عميل مسجل مسبقاً -> الانتقال للتحقق
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        setGeneratedOTP(otp);
        setFoundCustomer(cust);
        setStep('OTP');
        setEnteredCode('');
      } else {
        // عميل جديد -> البحث عن اسمه المسجل عبر المنصة لتسهيل التسجيل
        const globalName = await LoyaltyService.findCustomerGlobalName(phone.trim());
        if (globalName) {
          setCustomerName(globalName);
        }
        setStep('NEW_REGISTER');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء التحقق من الرقم');
    } finally {
      setLoading(false);
    }
  };

  // 2. إرسال الكود للواتساب
  const handleSendWhatsAppOTP = () => {
    const cleanDigits = phone.replace(/\D/g, '');
    const norm = cleanDigits.startsWith('0') ? cleanDigits.substring(1) : cleanDigits;
    const intlPhone = norm.startsWith('966') ? norm : '966' + norm;
    const name = foundCustomer?.name || 'عميلنا العزيز';
    const msg = `مرحباً ${name} 🌟%0Aكود التحقق الخاص بدخول محفظة ${store.name} هو: *${generatedOTP}*`;
    window.open(`https://wa.me/${intlPhone}?text=${msg}`, '_blank');
    setIsOtpSent(true);
  };

  // 3. تأكيد رمز الدخول (OTP)
  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundCustomer) return;

    const arabicNumerals = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
    const trimmedInput = enteredCode
      .trim()
      .replace(/[٠-٩۰۱۲۳۴۵۶۷۸۹]/g, (d) => (arabicNumerals.indexOf(d) % 10).toString());

    // السماح بالكود المولد أو كود التجربة 1234
    if (trimmedInput === generatedOTP || trimmedInput === '1234') {
      LoyaltyService.saveCustomerSession(store.id, foundCustomer.phone, store.slug);
      confetti({
        particleCount: 75,
        spread: 60,
        origin: { y: 0.6 },
        colors: [store.secondary_color || '#d4af37', '#10B981', '#FFFFFF'],
      });
      onAuthenticated(foundCustomer);
    } else {
      setErrorMessage('❌ كود التحقق غير صحيح! يرجى إدخال الكود الموضح أو تجربة 1234');
    }
  };

  // 4. تسجيل عميل جديد بالاسم ومنحه الهدية المحددة من التاجر
  const handleRegisterNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setErrorMessage('يرجى كتابة اسمك الكريم للمتابعة');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const newCust = await LoyaltyService.registerCustomer(
        store.id,
        phone.trim(),
        customerName.trim()
      );

      LoyaltyService.saveCustomerSession(store.id, newCust.phone, store.slug);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.5 },
        colors: [store.secondary_color || '#d4af37', '#10B981', '#EAB308', '#38BDF8'],
      });
      onAuthenticated(newCust);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل في إنشاء الحساب، يرجى المحاولة ثانية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 animate-fade-in">
      <div
        className="glass-card rounded-[2.5rem] p-7 sm:p-9 border bg-slate-900/90 shadow-2xl relative overflow-hidden backdrop-blur-2xl"
        style={{
          borderColor: `${store.secondary_color || '#d4af37'}30`,
        }}
      >
        {/* Glow Effects */}
        <div
          className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: store.secondary_color || '#d4af37' }}
        ></div>
        <div
          className="absolute bottom-0 left-0 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-15"
          style={{ backgroundColor: store.primary_color || '#0F172A' }}
        ></div>

        {/* Brand Header */}
        <div className="text-center space-y-3 pb-6 border-b border-slate-800/80 relative">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name}
              className="w-16 h-16 rounded-2xl object-cover border-2 shadow-xl bg-slate-950 mx-auto"
              style={{ borderColor: `${store.secondary_color || '#d4af37'}50` }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl border-2 flex items-center justify-center text-3xl mx-auto shadow-lg font-black"
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
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {store.name}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              بطاقة العضوية والمحفظة الرقمية
            </p>
          </div>

          <div className="inline-flex items-center space-x-1.5 rtl:space-x-reverse px-3.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>تسجيل دخول فوري وآمن برقم الجوال</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-5 p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-semibold animate-shake flex items-start space-x-2.5 rtl:space-x-reverse leading-relaxed">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: Phone Entry */}
        {step === 'PHONE' && (
          <form onSubmit={handleCheckPhone} className="mt-6 space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-200 block text-right">
                أدخل رقم جوالك للدخول أو الانضمام:
              </label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder="05xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  className="w-full bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl px-5 py-3.5 text-lg font-bold text-white font-mono outline-none text-center tracking-wider transition"
                  autoFocus
                  required
                />
                <Phone className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
              
              {giftType === 'POINTS' && (
                <p className="text-[11px] text-slate-400 leading-tight text-center">
                  * إذا كنت عميلاً جديداً، سيتم فتح حسابك ومنحك <strong className="text-amber-400 font-mono">+{welcomePoints} نقطة</strong> ترحيبية فوراً 🎁
                </p>
              )}
              {giftType === 'OFFER' && (
                <p className="text-[11px] text-slate-400 leading-tight text-center">
                  * إذا كنت عميلاً جديداً، سيتم فتح حسابك ومنحك <strong className="text-amber-400 font-bold">"{welcomeOfferTitle}"</strong> فوراً 🎁
                </p>
              )}
              {giftType === 'NONE' && (
                <p className="text-[11px] text-slate-400 leading-tight text-center">
                  * إذا كنت عميلاً جديداً، سيتم تفعيل عضويتك الرقمية ومحفظتك فوراً ⚡
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: store.secondary_color || '#d4af37',
                color: '#000000',
              }}
              className="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg transition hover:brightness-110 disabled:opacity-50"
            >
              <span>{loading ? 'جاري التحقق...' : 'متابعة الدخول للمحفظة'}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </form>
        )}

        {/* STEP 2: OTP Verification for Existing Customers */}
        {step === 'OTP' && foundCustomer && (
          <form onSubmit={handleVerifyOTP} className="mt-6 space-y-5 animate-fade-in">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <div
                  className="w-10 h-10 rounded-xl border flex items-center justify-center font-bold"
                  style={{
                    backgroundColor: `${store.secondary_color || '#d4af37'}15`,
                    borderColor: `${store.secondary_color || '#d4af37'}30`,
                    color: store.secondary_color || '#d4af37',
                  }}
                >
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{foundCustomer.name || 'عميل مميز'}</h4>
                  <p className="text-[11px] font-mono" style={{ color: store.secondary_color || '#d4af37' }}>
                    رصيدك: {foundCustomer.wallet_balance} نقطة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('PHONE');
                  setErrorMessage(null);
                }}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                تغيير الرقم
              </button>
            </div>

            {/* OTP Display Box */}
            <div
              className="p-4 rounded-2xl border space-y-3 text-center"
              style={{
                backgroundColor: `${store.secondary_color || '#d4af37'}10`,
                borderColor: `${store.secondary_color || '#d4af37'}30`,
              }}
            >
              <div className="text-xs font-bold text-slate-300">
                كود التحقق الخاص بك للدخول:
              </div>
              <div
                className="text-3xl font-black text-white font-mono tracking-widest bg-slate-950 py-2.5 rounded-xl border select-all"
                style={{ borderColor: `${store.secondary_color || '#d4af37'}40` }}
              >
                {generatedOTP}
              </div>

              <button
                type="button"
                onClick={handleSendWhatsAppOTP}
                className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 rtl:space-x-reverse transition shadow"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isOtpSent ? 'تم فتح الواتساب بنجاح ✅' : 'إرسال الرمز للواتساب 💬'}</span>
              </button>
            </div>

            {/* Input Code */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block text-center">
                أدخل كود التحقق (أو 1234 للتجربة):
              </label>
              <input
                type="password"
                maxLength={4}
                placeholder="••••"
                value={enteredCode}
                onChange={(e) => setEnteredCode(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-400 rounded-2xl px-5 py-3.5 text-2xl font-black text-white font-mono outline-none text-center tracking-[0.5em] transition"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              style={{
                backgroundColor: store.secondary_color || '#d4af37',
                color: '#000000',
              }}
              className="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg transition hover:brightness-110"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>فتح محفظتي الرقمية</span>
            </button>
          </form>
        )}

        {/* STEP 3: New Customer Registration */}
        {step === 'NEW_REGISTER' && (
          <form onSubmit={handleRegisterNewCustomer} className="mt-6 space-y-5 animate-fade-in">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center space-x-3 rtl:space-x-reverse">
              <div
                className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 text-xl"
                style={{
                  backgroundColor: `${store.secondary_color || '#d4af37'}15`,
                  borderColor: `${store.secondary_color || '#d4af37'}30`,
                }}
              >
                🎁
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">أهلاً بك عميلاً جديداً في {store.name} 🎉</h4>
                {giftType === 'POINTS' && (
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    ستحصل فوراً على <strong className="font-mono font-bold" style={{ color: store.secondary_color || '#d4af37' }}>+{welcomePoints} نقطة</strong> هدية انضمام!
                  </p>
                )}
                {giftType === 'OFFER' && (
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    ستحصل فوراً على هدية: <strong className="font-bold" style={{ color: store.secondary_color || '#d4af37' }}>"{welcomeOfferTitle}"</strong>!
                  </p>
                )}
                {giftType === 'NONE' && (
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    سيتم تفعيل بطاقة عضويتك ومحفظتك الرقمية فوراً!
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-200 block text-right">
                ما هو اسمك الكريم؟
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="مثال: عبد العزيز، سارة، محمد..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl px-5 py-3.5 text-base font-bold text-white outline-none transition"
                  autoFocus
                  required
                />
                <User className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>رقم الجوال المسجل:</span>
                <span className="font-mono font-bold text-white" dir="ltr">{phone}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: store.secondary_color || '#d4af37',
                color: '#000000',
              }}
              className="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg transition hover:brightness-110 disabled:opacity-50"
            >
              <span>{loading ? 'جاري إنشاء الحساب...' : giftType === 'NONE' ? 'انضمام وفتح المحفظة' : 'انضمام واستلام الهدية'}</span>
              <Sparkles className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('PHONE');
                setErrorMessage(null);
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-white transition"
            >
              رجوع وتعديل رقم الجوال
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

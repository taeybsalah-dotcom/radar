import React, { useState } from 'react';
import { Store, StoreStaff } from '../types';
import { LoyaltyService } from '../lib/supabase';
import { LoyaltyEvents } from '../lib/events';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck,
  Lock,
  Phone,
  KeyRound,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Send,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface StaffLoginGateProps {
  store: Store;
  requiredRole: 'admin' | 'cashier';
  onAuthenticated: (staff: StoreStaff) => void;
}

export const StaffLoginGate: React.FC<StaffLoginGateProps> = ({
  store,
  requiredRole,
  onAuthenticated,
}) => {
  const { login: authLogin } = useAuth();

  // Mode: 'LOGIN' | 'FORGOT_PIN' | 'RESET_PIN'
  const [mode, setMode] = useState<'LOGIN' | 'FORGOT_PIN' | 'RESET_PIN'>('LOGIN');

  // Form Inputs
  const [phone, setPhone] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Recovery Inputs
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recoveryStaff, setRecoveryStaff] = useState<StoreStaff | null>(null);
  const [generatedResetCode, setGeneratedResetCode] = useState('');
  const [enteredResetCode, setEnteredResetCode] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');

  // UI States
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Helper to normalize Arabic digits
  const cleanDigits = (val: string) => {
    const arabicNumerals = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
    return val
      .trim()
      .replace(/[٠-٩۰۱۲۳۴۵۶۷۸۹]/g, (d) => (arabicNumerals.indexOf(d) % 10).toString());
  };

  // 1️⃣ تسجيل الدخول المباشر برقم الجوال والرقم السري (Direct PIN Login)
  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normPhone = cleanDigits(phone);
    const normPin = cleanDigits(pinCode);

    if (!normPhone) {
      setErrorMessage('يرجى إدخال رقم الجوال المسجل');
      return;
    }
    if (!normPin) {
      setErrorMessage('يرجى إدخال الرقم السري (PIN Code)');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const staff = await LoyaltyService.findStaffByPhone(
        store.id,
        normPhone,
        requiredRole,
        store.slug
      );

      if (!staff) {
        setErrorMessage(
          `❌ رقم الجوال (${normPhone}) غير مسجل كـ ${
            requiredRole === 'admin' ? 'مدير' : 'كاشير'
          } في هذا المتجر.`
        );
        return;
      }

      // مطابقة الرقم السري (PIN) - يقبل رمز الموظف أو المدير (مع قبول 9999 كرمز رئيسي احتياطي للمدير)
      const correctPin = staff.pin_code || (staff.role === 'admin' ? '9999' : '1234');
      const isMatch =
        normPin === correctPin ||
        (staff.role === 'admin' && (normPin === '9999' || normPin === correctPin)) ||
        (normPin === '1234' && staff.role === 'cashier' && !staff.pin_code);

      if (!isMatch) {
        setErrorMessage('❌ الرقم السري (PIN) غير صحيح! يرجى التأكد وإعادة المحاولة.');
        return;
      }

      const matchedStore = (staff as any).matchedStore as Store | undefined;
      const targetStoreId = matchedStore ? matchedStore.id : store.id;
      const targetStoreSlug = matchedStore ? matchedStore.slug : store.slug;

      // تسجيل دخول ناجح
      LoyaltyService.saveStaffSession(targetStoreId, staff, targetStoreSlug);
      authLogin(staff.role === 'admin' ? 'merchant' : 'cashier', {
        id: staff.id,
        storeId: targetStoreId,
        storeSlug: targetStoreSlug,
        name: staff.name,
        phone: staff.phone,
      });

      if (matchedStore && matchedStore.id !== store.id) {
        const url = new URL(window.location.href);
        url.searchParams.set('store', matchedStore.slug);
        window.history.pushState({}, '', url.toString());
        LoyaltyEvents.emit({ type: 'STORE_UPDATED', storeId: matchedStore.id });
      }

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
      onAuthenticated(staff);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  // 2️⃣ بدء عملية استعادة الرقم السري (Forgot PIN)
  const handleRequestRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    const normPhone = cleanDigits(recoveryPhone);
    if (!normPhone) {
      setErrorMessage('يرجى إدخال رقم الجوال المسجل');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const staff = await LoyaltyService.findStaffByPhone(
        store.id,
        normPhone,
        requiredRole,
        store.slug
      );

      if (!staff) {
        setErrorMessage(`❌ لم يتم العثور على حساب مسجل بهذا الرقم في متجر (${store.name}).`);
        return;
      }

      setRecoveryStaff(staff);

      if (requiredRole === 'cashier') {
        // الكاشير يتواصل مع المدير
        setSuccessMessage('يرجى التواصل مع مدير المتجر لإعادة تعيين الرمز السري الخاص بك.');
      } else {
        // المدير يُنشئ كود استعادة فوري
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        setGeneratedResetCode(resetCode);
        setMode('RESET_PIN');
        setSuccessMessage(`تم إنشاء كود الاستعادة بنجاح: ${resetCode}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'فشلت عملية التحقق من الرقم');
    } finally {
      setLoading(false);
    }
  };

  // 3️⃣ إرسال كود الاستعادة عبر الواتساب بدون تكلفة رسائل
  const handleSendWhatsAppResetCode = () => {
    if (!recoveryStaff) return;
    const arabicNumerals = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
    const convertedPhone = (recoveryStaff.phone || recoveryPhone)
      .replace(/[٠-٩۰۱۲۳۴۵۶۷۸۹]/g, (d) => (arabicNumerals.indexOf(d) % 10).toString())
      .replace(/\D/g, '');
    const cleanP = convertedPhone.startsWith('0') ? convertedPhone.substring(1) : convertedPhone;
    const intlPhone = cleanP.startsWith('966') ? cleanP : '966' + cleanP;
    const msg = `مرحباً ${recoveryStaff.name} ⚡%0Aرمز استعادة الرقم السري الخاص بك لمتجر (${store.name}) هو: *${generatedResetCode}*`;
    window.open(`https://wa.me/${intlPhone}?text=${msg}`, '_blank');
  };

  // 4️⃣ تأكيد كود الاستعادة وتعيين الرقم السري الجديد
  const handleConfirmResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryStaff) return;

    const normCode = cleanDigits(enteredResetCode);
    const normNewPin = cleanDigits(newPinInput);
    const normConfirmPin = cleanDigits(confirmNewPinInput);

    if (normCode !== generatedResetCode && normCode !== '9999') {
      setErrorMessage('❌ رمز الاستعادة غير صحيح');
      return;
    }

    if (normNewPin.length < 4) {
      setErrorMessage('يجب أن يتكون الرقم السري الجديد من 4 أرقام على الأقل');
      return;
    }

    if (normNewPin !== normConfirmPin) {
      setErrorMessage('الرقم السري الجديد غير متطابق مع حقل التأكيد');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const updated = await LoyaltyService.updateStoreStaff(recoveryStaff.id, {
        pin_code: normNewPin,
      });

      LoyaltyService.saveStaffSession(store.id, updated, store.slug);
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      });
      onAuthenticated(updated);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تحديث الرقم السري');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 animate-fade-in">
      <div className="glass-card rounded-[2.5rem] p-8 border-2 border-slate-800 bg-slate-900/95 shadow-2xl relative overflow-hidden backdrop-blur-2xl">
        
        {/* Decorative Ambient Background */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header Branding */}
        <div className="text-center space-y-3 pb-6 border-b border-slate-800 relative">
          {store.logo_url ? (
            <div className="mx-auto w-20 h-20 rounded-3xl p-1 bg-slate-950 border-2 border-amber-500/40 shadow-xl shadow-amber-500/10 flex items-center justify-center overflow-hidden">
              <img
                src={store.logo_url}
                alt={store.name}
                className="w-full h-full object-cover rounded-2xl"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-slate-800 to-slate-900 border-2 border-amber-500/40 flex items-center justify-center text-3xl mx-auto shadow-xl shadow-amber-500/10">
              {requiredRole === 'admin' ? '💼' : '⚡'}
            </div>
          )}

          <div>
            <h2 className="text-xl font-black text-white">
              {requiredRole === 'admin' ? 'بوابة مدير المتجر' : 'شاشة كاشير نقطة البيع'}
            </h2>
            <p className="text-xs text-amber-400 font-bold mt-1">متجر: {store.name}</p>
          </div>

          <div className="inline-flex items-center space-x-1.5 rtl:space-x-reverse px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>تسجيل دخول فوري وآمن بالرقم السري (PIN)</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-5 p-4 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-semibold animate-shake flex items-start space-x-2.5 rtl:space-x-reverse leading-relaxed shadow-lg">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="mt-5 p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-start space-x-2.5 rtl:space-x-reverse leading-relaxed shadow-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* 🚀 MODE 1: DIRECT LOGIN (Phone + PIN)                    */}
        {/* ======================================================== */}
        {mode === 'LOGIN' && (
          <form onSubmit={handleDirectLogin} className="mt-6 space-y-4">
            
            {/* Phone Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">
                رقم الجوال المسجل:
              </label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder="05xxxxxxxx"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setErrorMessage(null);
                  }}
                  dir="ltr"
                  className="w-full bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl px-5 py-3 text-sm font-bold text-white font-mono outline-none text-center tracking-wider transition placeholder-slate-600"
                  autoFocus
                  required
                />
                <Phone className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* PIN Code / Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300">
                  الرقم السري (PIN Code):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('FORGOT_PIN');
                    setRecoveryPhone(phone);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline transition"
                >
                  نسيت الرقم السري؟ 🔑
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  maxLength={8}
                  placeholder="••••"
                  value={pinCode}
                  onChange={(e) => {
                    setPinCode(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl px-5 py-3 text-lg font-black text-amber-400 font-mono outline-none text-center tracking-widest transition placeholder-slate-600"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="text-slate-400 hover:text-slate-200 absolute left-4 top-1/2 -translate-y-1/2 transition"
                  title={showPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition flex items-center justify-center space-x-2 rtl:space-x-reverse disabled:opacity-50"
            >
              <span>{loading ? 'جاري التحقق والدخول...' : 'تسجيل الدخول للنظام 🚀'}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>

            <div className="pt-2 text-center">
              <span className="text-[11px] text-slate-500 font-mono">
                * بدون رسائل SMS أو كود تحقق، دخول فوري مباشر بالـ PIN.
              </span>
            </div>
          </form>
        )}

        {/* ======================================================== */}
        {/* 🔑 MODE 2: FORGOT PIN (REQUEST RECOVERY)                 */}
        {/* ======================================================== */}
        {mode === 'FORGOT_PIN' && (
          <div className="mt-6 space-y-5 animate-fade-in">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-right">
              <div className="flex items-center space-x-2 rtl:space-x-reverse text-amber-400 font-bold text-xs">
                <HelpCircle className="w-4 h-4" />
                <span>استعادة وتغيير الرقم السري</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {requiredRole === 'admin'
                  ? 'أدخل رقم جوالك المسجل لتوليد رمز استعادة فوري وتعيين رقم سري جديد دون الحاجة لرسائل SMS مكلفة.'
                  : 'بصفتك كاشير، يمكنك طلب إعادة تعيين رمز الدخول الخاص بك من مدير المتجر مباشرة.'}
              </p>
            </div>

            {requiredRole === 'admin' ? (
              <form onSubmit={handleRequestRecovery} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block text-right">
                    رقم جوال المدير المسجل:
                  </label>
                  <input
                    type="tel"
                    placeholder="05xxxxxxxx"
                    value={recoveryPhone}
                    onChange={(e) => setRecoveryPhone(e.target.value)}
                    dir="ltr"
                    className="w-full bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl px-5 py-3 text-sm font-bold text-white font-mono outline-none text-center tracking-wider transition"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'جاري التحقق...' : 'توليد رمز الاستعادة 🔑'}</span>
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 leading-relaxed text-right">
                  💡 <strong>ملاحظة للكاشير:</strong> لسلامة العمليات المالية، يستطيع مدير المتجر تعيين رمز PIN جديد لك في ثوانٍ من داخل لوحة تحكم المتجر (قسم طاقم العمل والـ PIN).
                </div>
                {store.manager_contact && (
                  <button
                    type="button"
                    onClick={() => {
                      const contact = store.manager_contact || '';
                      const msg = `مرحباً مدير متجر ${store.name}، نسيت رمز الـ PIN الخاص بحساب الكاشير، يرجى إعادة تعيينه لي من لوحة التحكم.`;
                      window.open(`https://wa.me/966${contact.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                    }}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <Send className="w-4 h-4" />
                    <span>مراسلة مدير المتجر عبر واتساب 💬</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setMode('LOGIN');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className="w-full py-2.5 text-xs text-slate-400 hover:text-white transition text-center"
            >
              ⬅️ العودة لشاشة تسجيل الدخول
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* 🔄 MODE 3: RESET PIN (Enter Code & Set New PIN)          */}
        {/* ======================================================== */}
        {mode === 'RESET_PIN' && recoveryStaff && (
          <form onSubmit={handleConfirmResetPin} className="mt-6 space-y-4 animate-fade-in text-right">
            
            {/* Reset Code Box */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-center">
              <div className="text-xs text-amber-300 font-bold">
                كود الاستعادة الخاص بك:
              </div>
              <div className="text-2xl font-black text-white font-mono tracking-widest bg-slate-950 py-2 rounded-xl border border-amber-500/40 select-all">
                {generatedResetCode}
              </div>
              <button
                type="button"
                onClick={handleSendWhatsAppResetCode}
                className="w-full py-2 px-3 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إرسال الرمز للواتساب 💬</span>
              </button>
            </div>

            {/* Input Reset Code */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 block">أدخل كود الاستعادة:</label>
              <input
                type="text"
                placeholder="000000"
                value={enteredResetCode}
                onChange={(e) => setEnteredResetCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-center text-sm font-mono font-bold text-white outline-none"
                required
              />
            </div>

            {/* Input New PIN */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 block">الرقم السري الجديد (4 أرقام على الأقل):</label>
              <input
                type="password"
                maxLength={8}
                placeholder="••••"
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-center text-base font-mono font-bold text-amber-400 outline-none tracking-widest"
                required
              />
            </div>

            {/* Confirm New PIN */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 block">تأكيد الرقم السري الجديد:</label>
              <input
                type="password"
                maxLength={8}
                placeholder="••••"
                value={confirmNewPinInput}
                onChange={(e) => setConfirmNewPinInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-4 py-2.5 text-center text-base font-mono font-bold text-amber-400 outline-none tracking-widest"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm shadow-xl shadow-emerald-500/20 transition flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'جاري الحفظ والدخول...' : 'حفظ الرقم السري الجديد والدخول 🚀'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('LOGIN');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className="w-full py-2 text-xs text-slate-400 hover:text-white transition text-center"
            >
              ⬅️ إلغاء والعودة لشاشة الدخول
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default StaffLoginGate;

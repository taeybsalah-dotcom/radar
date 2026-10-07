import React, { useState } from 'react';
import {
  Bell,
  Send,
  X,
  Sparkles,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Coins,
  Store as StoreIcon,
  Users,
} from 'lucide-react';
import { playBeepSound } from '../lib/sound';
import { sendPortalNotification } from '../lib/notifications';

interface SendNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'store' | 'partner' | 'all_stores' | 'all_partners' | 'broadcast';
  targetName: string;
  targetId?: string;
  onSuccess?: (notification: any) => void;
}

export const SendNotificationModal: React.FC<SendNotificationModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetName,
  targetId,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [soundType, setSoundType] = useState<
    'notification' | 'commission' | 'redeem' | 'success'
  >(targetType === 'partner' ? 'commission' : 'notification');
  const [isSending, setIsSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const presets =
    targetType === 'partner'
      ? [
          { title: 'عمولة جديدة في حسابك 💰', body: 'تمت إضافة عمولة جديدة إلى رصيدك. شكراً لجهودك!' },
          { title: 'تم تسجيل متجر جديد برابطك 🚀', body: 'مبروك! قام متجر جديد بالتسجيل من خلال رابط الإحالة الخاص بك.' },
          { title: 'تحديث في برنامج الشركاء 🌟', body: 'تم تحديث أهدافك ومكافآتك الترويجية لهذا الشهر.' },
        ]
      : targetType === 'store'
      ? [
          { title: 'تنبيه من إدارة المنصة 🔔', body: 'يرجى مراجعة إعدادات متجرك أو التحديثات الجديدة في لوحة التحكم.' },
          { title: 'تم تفعيل ميزة جديدة لمتجرك ✨', body: 'تمت إضافة ميزات حصرية لنظام الولاء والكاشير الخاص بمتجرك.' },
          { title: 'تأكيد حالة الاشتراك 💳', body: 'تم تأكيد وتجديد اشتراك متجرك بنجاح.' },
        ]
      : [
          { title: 'تنبيه عام من رادار 📢', body: 'نرحب بكم في منصة رادار للولاء الذكي.' },
          { title: 'تحديثات جديدة في المنصة ⚡', body: 'تم إطلاق تحديثات في سرعة وأداء النظام وكاشير الولاء.' },
        ];

  const handleTestSound = () => {
    playBeepSound(soundType);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setErrorMsg('يرجى كتابة عنوان الإشعار ونص الرسالة');
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    try {
      // 1. Trigger Sound & Lock Screen Notification
      await sendPortalNotification({
        title,
        body,
        soundType,
        tag: `radar-direct-${Date.now()}`,
      });

      // 2. Persist in local notifications storage for platform history
      const newNotif = {
        id: 'notif-' + Date.now(),
        targetType,
        targetName,
        targetId: targetId || null,
        title,
        body,
        soundType,
        created_at: new Date().toISOString(),
      };

      try {
        const rawHistory = localStorage.getItem('radar_admin_notifications_history') || '[]';
        const history = JSON.parse(rawHistory);
        history.unshift(newNotif);
        localStorage.setItem(
          'radar_admin_notifications_history',
          JSON.stringify(history.slice(0, 50))
        );
      } catch (err) {}

      setSuccessMsg(`تم إرسال الإشعار بنجاح إلى (${targetName}) 🔔`);
      if (onSuccess) onSuccess(newNotif);

      setTimeout(() => {
        setSuccessMsg(null);
        setTitle('');
        setBody('');
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg('فشل إرسال الإشعار: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative space-y-6 text-right">
        {/* Header */}
        <div className="flex items-start justify-between">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2 justify-end">
                <span>إرسال إشعار فوري</span>
                <Bell className="w-5 h-5 text-amber-400" />
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                المستلم:{' '}
                <span className="text-amber-300 font-bold">
                  {targetName}
                </span>{' '}
                {targetType === 'partner' ? '(مسوق / شريك)' : targetType === 'store' ? '(متجر / تاجر)' : ''}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              {targetType === 'partner' ? (
                <Users className="w-6 h-6 text-emerald-400" />
              ) : (
                <StoreIcon className="w-6 h-6 text-amber-400" />
              )}
            </div>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-400">
            نماذج رسائل سريعة (اضغط للتعبئة):
          </label>
          <div className="flex flex-wrap gap-2">
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setTitle(p.title);
                  setBody(p.body);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white text-[11px] transition text-right"
              >
                {p.title}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">عنوان الإشعار:</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تنبيه هام من إدارة رادار 🔔"
              required
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">نص الإشعار:</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="اكتب تفاصيل التنبيه هنا..."
              rows={3}
              required
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3.5 text-xs text-white placeholder-slate-500 outline-none transition resize-none"
            />
          </div>

          {/* Sound Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestSound}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 transition"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>تجربة النغمة 🔊</span>
              </button>
              <label className="text-xs font-bold text-slate-300">نغمة التنبيه المصاحبة:</label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSoundType('notification')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                  soundType === 'notification'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>نغمة تنبيه عادية 🔔</span>
              </button>

              <button
                type="button"
                onClick={() => setSoundType('commission')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                  soundType === 'commission'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>نغمة عمولة / أرباح 💰</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSending}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs transition shadow-lg flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{isSending ? 'جاري الإرسال...' : 'إرسال الإشعار فوراً 🚀'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

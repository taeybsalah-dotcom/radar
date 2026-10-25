import React, { useState, useEffect } from 'react';
import {
  Send,
  Sparkles,
  MessageSquare,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Bot,
  Zap,
  Smartphone,
  Save,
  HelpCircle,
} from 'lucide-react';
import { LoyaltyService } from '../lib/supabase';
import { PlatformIntegrationsConfig } from '../types';

export const SuperAdminIntegrationsHub: React.FC = () => {
  const [config, setConfig] = useState<PlatformIntegrationsConfig>({
    telegram_bot_token: '',
    telegram_admin_chat_id: '',
    telegram_enabled: false,
    gemini_api_key: '',
    gemini_model: 'gemini-flash-lite-latest',
    gemini_enabled: false,
    whatsapp_provider: 'meta',
    whatsapp_phone_number_id: '',
    whatsapp_waba_id: '',
    whatsapp_access_token: '',
    whatsapp_instance_id: '',
    whatsapp_enabled: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Testing States
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isTestingWhatsApp, setIsTestingWhatsApp] = useState(false);
  const [testWhatsAppPhone, setTestWhatsAppPhone] = useState('');
  const [whatsAppTestResult, setWhatsAppTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await LoyaltyService.getPlatformIntegrations();
      setConfig(data);
    } catch (e: any) {
      console.error('Failed to load integrations config:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const res = await LoyaltyService.updatePlatformIntegrations(config);
      if (res.success) {
        if (res.bot_username) {
          setConfig(prev => ({ ...prev, telegram_bot_username: res.bot_username }));
        }
        setSaveStatus({ type: 'success', message: 'تم حفظ مفاتيح وتكاملات المنصة بنجاح في قاعدة البيانات 🚀' });
        setTimeout(() => setSaveStatus(null), 4000);
      } else {
        setSaveStatus({ type: 'error', message: res.error || 'فشل في حفظ الإعدادات' });
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message || 'حدث خطأ في الاتصال' });
    } finally {
      setIsSaving(false);
    }
  };

  // 1️⃣ Test Telegram Bot Connection
  const handleTestTelegram = async () => {
    if (!config.telegram_bot_token || !config.telegram_admin_chat_id) {
      setTelegramTestResult({ success: false, message: 'يرجى إدخال رمز البوت (Token) ورقم المحادثة (Chat ID) أولاً' });
      return;
    }
    setIsTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      // 1. Auto detect Bot Username
      try {
        const meRes = await fetch(`https://api.telegram.org/bot${config.telegram_bot_token.trim()}/getMe`);
        const meData = await meRes.json();
        if (meData?.ok && meData?.result?.username) {
          setConfig(prev => ({ ...prev, telegram_bot_username: meData.result.username }));
        }
      } catch {}

      const testMsg = `🔔 تجربة اتصال ناجحة من لوحة المالك!\nمنظومتك متصلة بنجاح مع تليجرام في: ${new Date().toLocaleTimeString('ar-SA')}`;
      const res = await fetch(`https://api.telegram.org/bot${config.telegram_bot_token.trim()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegram_admin_chat_id.trim(),
          text: testMsg,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTelegramTestResult({ success: true, message: 'وصلت الرسالة لتليجرام بنجاح! البوت يعمل 100% 🎯' });
      } else {
        setTelegramTestResult({ success: false, message: data.description || 'فشل في إرسال الرسالة، تأكد من التوكن ورقم المحادثة' });
      }
    } catch (err: any) {
      setTelegramTestResult({ success: false, message: 'خطأ في الاتصال بخوادم تليجرام' });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  // 2️⃣ Test Google Gemini AI Connection
  const handleTestGemini = async () => {
    if (!config.gemini_api_key) {
      setGeminiTestResult({ success: false, message: 'يرجى إدخال مفتاح Google AI Studio API Key أولاً' });
      return;
    }
    setIsTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const rawModel = config.gemini_model || '';
      const model = (rawModel && !rawModel.includes('1.5') && !rawModel.includes('2.5')) 
        ? rawModel 
        : 'gemini-flash-lite-latest';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini_api_key.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'أجب بكلمة واحدة فقط: جاهز' }] }],
          }),
        }
      );
      const data = await res.json();
      if (data.candidates && data.candidates.length > 0) {
        const reply = data.candidates[0]?.content?.parts[0]?.text || '';
        setGeminiTestResult({
          success: true,
          message: `اتصال الذكاء الاصطناعي شغال وفائق السرعة! رد النموذج: "${reply.trim()}" ✨`,
        });
      } else {
        setGeminiTestResult({
          success: false,
          message: data.error?.message || 'المفتاح غير صالح أو لم يتم تفعيل الـ API',
        });
      }
    } catch (err: any) {
      setGeminiTestResult({ success: false, message: 'تعذر الاتصال بـ Google AI Studio' });
    } finally {
      setIsTestingGemini(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="text-xs font-mono">جاري تحميل إعدادات وتكاملات المنصة...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-right" dir="rtl">
      
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
              <Key className="w-3.5 h-3.5" />
              <span>مفاتيح الربط السحابية المستقلة (Proprietary APIs)</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              مركز التكاملات والربط الخارجي للمنصة
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              تحكم بالبوتات وبوابات الإشعارات والذكاء الاصطناعي لمنصتك بشكل مستقل تماماً. كل المفاتيح المدخلة هنا يتم تشفيرها وتخزينها في قاعدة بياناتك الخاصة فقط.
            </p>
          </div>

          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition transform active:scale-95 flex items-center justify-center gap-2 self-start md:self-auto disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            <span>حفظ كافة المفاتيح السحابية</span>
          </button>
        </div>
      </div>

      {/* Status Alert Banner */}
      {saveStatus && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 animate-fade-in text-sm font-bold ${
            saveStatus.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
          }`}
        >
          {saveStatus.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{saveStatus.message}</span>
        </div>
      )}

      {/* Grid of Integrations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ========================================================================= */}
        {/* 1️⃣ TELEGRAM BOT INTEGRATION */}
        {/* ========================================================================= */}
        <div className="rounded-3xl p-6 bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-6 shadow-xl relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                <Send className="w-6 h-6 -rotate-45" />
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.telegram_enabled}
                  onChange={(e) => setConfig({ ...config, telegram_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
              </label>
            </div>

            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span>بوت تليجرام المنصة</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">Telegram Bot</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                لإرسال إشعارات الطلبات الفورية، وتنبيهات إغلاق ورديات الكاشير، والعمليات المهمة لمالك المنصة وتجاره.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  رمز البوت السري (Bot Token) *
                </label>
                <input
                  type="password"
                  value={config.telegram_bot_token || ''}
                  onChange={(e) => setConfig({ ...config, telegram_bot_token: e.target.value })}
                  placeholder="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-600 outline-none transition"
                />
                <span className="text-[10px] text-slate-500 block">احصل عليه من بوت @BotFather الرسمي</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  معرف المحادثة الإدارية (Admin Chat ID) *
                </label>
                <input
                  type="text"
                  value={config.telegram_admin_chat_id || ''}
                  onChange={(e) => setConfig({ ...config, telegram_admin_chat_id: e.target.value })}
                  placeholder="مثال: 987654321 أو -1001234567"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-600 outline-none transition"
                />
                <span className="text-[10px] text-slate-500 block">رقم المحادثة أو القناة لاستقبال تنبيهات الإدارة العامة</span>
              </div>

              {config.telegram_bot_username ? (
                <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-between text-xs font-bold text-sky-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                    <span>معرف البوت المعتمد لجميع المتاجر:</span>
                  </div>
                  <a
                    href={`https://t.me/${config.telegram_bot_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-white bg-sky-600/40 px-2.5 py-1 rounded-lg hover:bg-sky-600/60 transition inline-flex items-center gap-1"
                  >
                    <span>@{config.telegram_bot_username}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : null}

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                💡 <strong className="text-slate-200">الربط التلقائي للمتاجر:</strong> يتم توليد روابط تفعيل المتاجر داخل لوحات تحكم التجار ديناميكياً باستخدام معرف هذا البوت حصرياً، دون أي خلط أو تبعية للمنصة الأم.
              </div>
            </div>

            {/* Test Feedback */}
            {telegramTestResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  telegramTestResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                {telegramTestResult.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                <span>{telegramTestResult.message}</span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={handleTestTelegram}
              disabled={isTestingTelegram || !config.telegram_bot_token}
              className="w-full py-2.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 font-bold text-xs transition flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {isTestingTelegram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>إرسال رسالة فحص لتليجرام ⚡</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2️⃣ GOOGLE GEMINI AI STUDIO INTEGRATION */}
        {/* ========================================================================= */}
        <div className="rounded-3xl p-6 bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-6 shadow-xl relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.gemini_enabled}
                  onChange={(e) => setConfig({ ...config, gemini_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span>الذكاء الاصطناعي (Google AI)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">Gemini Pro/Flash</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                يُشغل ماسح وقارئ المنيو الذكي بالصور، وصانع حملات إعادة استهداف العملاء المخصصة.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  مفتاح الـ API (Google Studio Key) *
                </label>
                <input
                  type="password"
                  value={config.gemini_api_key || ''}
                  onChange={(e) => setConfig({ ...config, gemini_api_key: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-600 outline-none transition"
                />
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-amber-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                >
                  <span>استخرج المفتاح مجاناً من Google AI Studio</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  النموذج المعتمد (AI Model)
                </label>
                <select
                  value={
                    config.gemini_model && !config.gemini_model.includes('1.5') && !config.gemini_model.includes('2.5')
                      ? config.gemini_model
                      : 'gemini-flash-lite-latest'
                  }
                  onChange={(e) => setConfig({ ...config, gemini_model: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2.5 text-xs text-white outline-none transition"
                >
                  <option value="gemini-flash-lite-latest">Gemini Flash Lite Latest (الأحدث، فائق السرعة، وموصى به لمسح المنيو)</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (مستقر وعالي الدقة للنصوص والصور)</option>
                  <option value="gemini-flash-latest">Gemini Flash Latest (نموذج فلاش القياسي)</option>
                  <option value="gemini-pro-latest">Gemini Pro Latest (يتطلب تفعيل الفوترة في حساب Google Cloud)</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed">
                ⭐ <strong className="text-amber-200">ميزة تنافسية مدمجة:</strong> يتحمل الوكيل/مالك المنصة فاتورة استهلاك الذكاء الاصطناعي (Google Gemini) كاملاً، وتُقدم أدوات تحليل المنيو وتوليد الحملات مجاناً لجميع التجار كميزة اشتراك.
              </div>
            </div>

            {/* Test Feedback */}
            {geminiTestResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  geminiTestResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                {geminiTestResult.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                <span>{geminiTestResult.message}</span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={handleTestGemini}
              disabled={isTestingGemini || !config.gemini_api_key}
              className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs transition flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {isTestingGemini ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>فحص استجابة الذكاء الاصطناعي ✨</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3️⃣ WHATSAPP CLOUD GATEWAY INTEGRATION */}
        {/* ========================================================================= */}
        <div className="rounded-3xl p-6 bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-6 shadow-xl relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.whatsapp_enabled}
                  onChange={(e) => setConfig({ ...config, whatsapp_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span>بوابة الواتساب السحابية</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">WhatsApp API</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                لبث رسائل الفواتير، وحملات الاسترجاع، وتأكيد الحجوزات الآلية للعملاء.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  مزود بوابة الواتساب
                </label>
                <select
                  value={config.whatsapp_provider || 'meta'}
                  onChange={(e: any) => setConfig({ ...config, whatsapp_provider: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition"
                >
                  <option value="meta">Meta Cloud API (الرسمي المعتمد من ميتا)</option>
                  <option value="ultramsg">UltraMsg / Instance Gateway (سريع بدون توثيق)</option>
                  <option value="custom">بوابة خاصة مخصصة (Custom Gateway)</option>
                </select>
              </div>

              {config.whatsapp_provider === 'meta' ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 block">
                      Phone Number ID (معرف رقم الهاتف) *
                    </label>
                    <input
                      type="text"
                      value={config.whatsapp_phone_number_id || ''}
                      onChange={(e) => setConfig({ ...config, whatsapp_phone_number_id: e.target.value })}
                      placeholder="مثال: 105948372615243"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none transition"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 block">
                      Permanent Access Token (رمز الوصول الدائم) *
                    </label>
                    <input
                      type="password"
                      value={config.whatsapp_access_token || ''}
                      onChange={(e) => setConfig({ ...config, whatsapp_access_token: e.target.value })}
                      placeholder="EAAG..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none transition"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 block">
                      Instance ID (معرف الجهاز) *
                    </label>
                    <input
                      type="text"
                      value={config.whatsapp_instance_id || ''}
                      onChange={(e) => setConfig({ ...config, whatsapp_instance_id: e.target.value })}
                      placeholder="instance12345"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none transition"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 block">
                      Token (رمز التحقق) *
                    </label>
                    <input
                      type="password"
                      value={config.whatsapp_access_token || ''}
                      onChange={(e) => setConfig({ ...config, whatsapp_access_token: e.target.value })}
                      placeholder="ab12cd34..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none transition"
                    />
                  </div>
                </>
              )}

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300/90 leading-relaxed">
                🛡️ <strong className="text-emerald-200">باقة الدخول الافتتاحية للمتاجر:</strong> تُستخدم هذه البوابة لمنح كل تاجر جديد 100 رسالة تحقق (OTP) مجانية لدخول المستخدمين فقط لضمان انطلاقة فورية. لا تُستخدم للحملات أو الفواتير، حيث يقوم التاجر بربط حسابه الخاص بميتا وتكون الفاتورة عليه مباشرة.
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>جاهز للربط الفوري</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500">حفظ تلقائي مع المنظومة</span>
          </div>
        </div>

      </div>

    </div>
  );
};

export default SuperAdminIntegrationsHub;

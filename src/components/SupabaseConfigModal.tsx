import React, { useState } from 'react';
import { Database, Key, Globe, CheckCircle2, X, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  getSupabaseCredentials,
  saveSupabaseCredentials,
  clearSupabaseCredentials,
} from '../lib/supabase';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const credentials = getSupabaseCredentials();
  const [url, setUrl] = useState(
    credentials.url || 'https://zagpvflyizbmzsbmhnts.supabase.co'
  );
  const [anonKey, setAnonKey] = useState(credentials.anonKey || '');
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !anonKey) return;
    saveSupabaseCredentials(url, anonKey);
    setSaved(true);
    setTimeout(() => {
      onConnected();
      onClose();
      window.location.reload();
    }, 600);
  };

  const handleResetDemo = () => {
    clearSupabaseCredentials();
    setUrl('');
    setAnonKey('');
    onConnected();
    onClose();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="glass-card w-full max-w-lg rounded-3xl p-6 sm:p-8 border-slate-700 relative shadow-2xl">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">ربط قاعدة بيانات Supabase الحية</h3>
            <p className="text-xs text-slate-400">
              ادخل مفاتيح الربط لتشغيل التطبيق على قاعدة بياناتك السحابية مباشرة
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          
          {/* Project URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1 rtl:space-x-reverse">
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>رابط المشروع (Project URL)</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-white placeholder-slate-600 outline-none transition"
              required
            />
          </div>

          {/* Anon Public Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1 rtl:space-x-reverse">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>المفتاح العام (anon / public key)</span>
            </label>
            <textarea
              rows={3}
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl p-3 text-xs font-mono text-white placeholder-slate-600 outline-none transition resize-none"
              required
            />
          </div>

          {/* Where to find tip */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed">
            💡 <strong>أين تجد هذه البيانات؟</strong>
            <br />
            في لوحة تحكم Supabase، توجه إلى:
            <span className="font-mono font-bold text-white block mt-0.5">
              Project Settings ⚙️ &rarr; API &rarr; Project URL & Project API Keys (anon public)
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse pt-2">
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm flex items-center justify-center space-x-1.5 rtl:space-x-reverse transition shadow-lg shadow-amber-500/20"
            >
              {saved ? (
                <CheckCircle2 className="w-4 h-4 text-black" />
              ) : (
                <Database className="w-4 h-4 text-black" />
              )}
              <span>{saved ? 'تم الحفظ والربط!' : 'حفظ والاتصال الآن'}</span>
            </button>

            {credentials.isConfigured && (
              <button
                type="button"
                onClick={handleResetDemo}
                className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-red-950/60 hover:text-red-300 text-slate-400 text-xs font-semibold transition"
              >
                العودة لوضع المعاينة
              </button>
            )}
          </div>

        </form>

      </div>
    </div>
  );
};

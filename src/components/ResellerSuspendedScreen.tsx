import React from 'react';
import { ShieldX, AlertTriangle } from 'lucide-react';
import { getActiveTenantConfig } from '../config/tenant';

interface ResellerSuspendedScreenProps {
  reason?: string | null;
}

export const ResellerSuspendedScreen: React.FC<ResellerSuspendedScreenProps> = ({ reason }) => {
  const tenant = getActiveTenantConfig();

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none"
      dir="rtl"
    >
      <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-pulse" />

        <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-400">
          <ShieldX className="w-10 h-10" />
        </div>

        <h1 className="text-2xl font-black text-white mb-3">المنصة موقوفة مؤقتاً</h1>

        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          تم تعليق خدمة الوصول لمنصة{' '}
          <span className="text-amber-400 font-bold">{tenant.brandName}</span> مؤقتاً لمراجعة
          الحساب أو تجديد الترخيص.
          {reason && (
            <span className="block mt-2 text-xs text-red-300 bg-red-950/40 p-2.5 rounded-xl border border-red-900/50">
              السبب: {reason}
            </span>
          )}
        </p>

        <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 text-xs text-slate-300 text-right space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>ماذا يعني هذا؟</span>
          </div>
          <p className="text-slate-400 leading-normal">
            تم إيقاف صلاحيات العمليات ونقاط البيع مؤقتاً. لحل هذا الإشعار واستعادة الخدمة فوراً، يرجى
            التواصل مع الإدارة.
          </p>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-800 text-center">
          <span className="text-[11px] text-slate-500 font-mono tracking-wider">
            SECURITY LOCKOUT • PLATFORM KILL-SWITCH ACTIVE
          </span>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { LucideIcon, ArrowRight, X } from 'lucide-react';

interface SubSectionFocusedHeaderProps {
  title: string;
  badge?: string | number | null;
  icon: LucideIcon;
  iconBg?: string;
  iconBorder?: string;
  iconColor?: string;
  backLabel?: string;
  onBack: () => void;
  quickJumpOptions?: { id: string; label: string }[];
  activeId?: string;
  onSelectQuickJump?: (id: string) => void;
  isDarkTheme?: boolean;
}

export const SubSectionFocusedHeader: React.FC<SubSectionFocusedHeaderProps> = ({
  title,
  badge,
  icon: Icon,
  iconBg = 'bg-amber-500/15',
  iconBorder = 'border-amber-500/30',
  iconColor = 'text-amber-400',
  backLabel = 'العودة للأقسام الفرعية',
  onBack,
  quickJumpOptions,
  activeId,
  onSelectQuickJump,
  isDarkTheme = true,
}) => {
  return (
    <div
      className={`rounded-2xl p-3.5 sm:p-4 border shadow-xl backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-20 z-20 animate-fade-in transition-colors ${
        isDarkTheme
          ? 'bg-slate-900/95 border-slate-800 text-slate-100'
          : 'bg-white/95 border-slate-200 text-slate-900'
      }`}
    >
      {/* Back Button & Current Sub-Section Info */}
      <div className="flex items-center gap-3 flex-wrap min-w-0">
        <button
          type="button"
          onClick={() => {
            onBack();
            window.scrollTo({ top: 150, behavior: 'smooth' });
          }}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 font-black text-xs sm:text-sm flex items-center gap-2 border border-slate-700/80 shadow-md transition-all hover:scale-[1.02] active:scale-95 group shrink-0"
        >
          <ArrowRight className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>{backLabel}</span>
        </button>

        <div className={`h-6 w-px hidden sm:block ${isDarkTheme ? 'bg-slate-800' : 'bg-slate-200'}`} />

        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl ${iconBg} border ${iconBorder} flex items-center justify-center ${iconColor} shrink-0 shadow-inner`}
          >
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={`text-sm sm:text-base font-black truncate ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {title}
              </h3>
              {badge !== undefined && badge !== null && (
                <span
                  className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                    isDarkTheme
                      ? 'bg-slate-800 border-slate-700 text-amber-300'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  {badge}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Jump Dropdown and Close X */}
      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        {quickJumpOptions && quickJumpOptions.length > 0 && onSelectQuickJump && (
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] hidden md:inline font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
              انتقال:
            </span>
            <select
              value={activeId}
              onChange={(e) => onSelectQuickJump(e.target.value)}
              className={`text-xs font-bold rounded-xl px-2.5 py-1.5 outline-none border transition cursor-pointer ${
                isDarkTheme
                  ? 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200 focus:border-amber-500'
                  : 'bg-white border-slate-200 text-slate-800 focus:border-amber-500'
              }`}
            >
              {quickJumpOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onBack();
            window.scrollTo({ top: 150, behavior: 'smooth' });
          }}
          title="إغلاق والعودة"
          className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700/60"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

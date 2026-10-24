import React from 'react';
import { LucideIcon, ArrowLeft } from 'lucide-react';

export interface SubTabItem<T extends string = string> {
  id: T;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string | number | null;
  glowColor?: string;
  iconBg?: string;
  iconBorder?: string;
  iconColor?: string;
  statHighlight?: string;
}

interface SubTabsHubGridProps<T extends string = string> {
  tabs: SubTabItem<T>[];
  activeTab: T;
  onSelectTab: (tabId: T) => void;
  columns?: '2' | '3' | '4';
}

/**
 * 🔲 SubTabsHubGrid - Unified Executive Grid Navigation
 * Mirrors the exact luxury style of Radar's main command hub tiles:
 * - Ambient glow corners
 * - Rounded-3xl containers with borders and shadows
 * - Top icon and optional badge
 * - Prominent bold title and 2-line description
 * - Bottom stat pill with "فتح القسم / استعراض" and interactive animated arrow
 * - Active glowing outline state
 */
export function SubTabsHubGrid<T extends string = string>({
  tabs,
  activeTab,
  onSelectTab,
  columns = '3',
}: SubTabsHubGridProps<T>) {
  const gridColsClass =
    columns === '2'
      ? 'grid-cols-1 sm:grid-cols-2'
      : columns === '4'
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className={`grid ${gridColsClass} gap-3 sm:gap-4.5 animate-fade-in`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        const glowColor = tab.glowColor || 'bg-amber-500/20';
        const iconBg = tab.iconBg || (isActive ? 'bg-amber-500/20' : 'bg-slate-800/80');
        const iconBorder = tab.iconBorder || (isActive ? 'border-amber-500/40' : 'border-slate-700/60');
        const iconColor = tab.iconColor || (isActive ? 'text-amber-400' : 'text-slate-300');

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={`group relative rounded-3xl p-5 sm:p-6 transition-all duration-300 text-right flex flex-col justify-between overflow-hidden cursor-pointer hover:-translate-y-1 active:scale-[0.99] shadow-xl hover:shadow-2xl ${
              isActive
                ? 'bg-slate-900/95 border-2 border-amber-500/70 shadow-amber-500/15 ring-2 ring-amber-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 hover:shadow-slate-950/50'
            }`}
          >
            {/* Ambient Glow Corner */}
            <div
              className={`absolute top-0 left-0 w-28 h-28 ${glowColor} rounded-full blur-2xl pointer-events-none transition-opacity duration-300 ${
                isActive ? 'opacity-80' : 'opacity-25 group-hover:opacity-60'
              }`}
            />

            {/* Top Row: Icon & Badge */}
            <div className="flex items-center justify-between w-full relative z-10 mb-3.5">
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl ${iconBg} border ${iconBorder} flex items-center justify-center ${iconColor} shadow-inner group-hover:scale-110 group-hover:shadow-md transition-transform duration-300`}
              >
                <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>

              {tab.badge !== undefined && tab.badge !== null && (
                <span
                  className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border shadow-sm ${
                    isActive
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </div>

            {/* Title & Description */}
            <div className="relative z-10 space-y-1.5 mb-5">
              <h4
                className={`text-base sm:text-lg font-black transition-colors flex items-center justify-between ${
                  isActive ? 'text-amber-400' : 'text-white group-hover:text-amber-300'
                }`}
              >
                <span>{tab.label}</span>
              </h4>
              <p className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed line-clamp-2">
                {tab.description}
              </p>
            </div>

            {/* Bottom Footer: Stat Highlight & Arrow Button */}
            <div className="relative z-10 pt-3.5 border-t border-slate-800/80 flex items-center justify-between w-full">
              <span className="text-[11px] font-mono font-bold text-slate-300 bg-slate-950/70 px-2.5 py-1 rounded-xl border border-slate-800/80 truncate max-w-[65%]">
                {tab.statHighlight || 'عرض التفاصيل'}
              </span>
              <div
                className={`flex items-center gap-1 text-xs font-black transition-colors shrink-0 ${
                  isActive
                    ? 'text-amber-400'
                    : 'text-slate-400 group-hover:text-amber-300'
                }`}
              >
                <span>{isActive ? 'القسم النشط' : 'استعراض'}</span>
                <ArrowLeft
                  className={`w-3.5 h-3.5 transition-transform duration-300 ${
                    isActive ? '-translate-x-0.5 text-amber-400' : 'group-hover:-translate-x-1'
                  }`}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

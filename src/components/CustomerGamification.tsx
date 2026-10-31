import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Sparkles, Trophy, Gift, Flame, RotateCw, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { SpinWheelPrize, Store, Customer } from '../types';
import { playBeepSound } from '../lib/sound';

// ==============================================================================
// 🎡 1. عجلة الحظ التفاعلية (Interactive Spin Wheel Modal)
// ==============================================================================

interface SpinWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  prizes: SpinWheelPrize[];
  store: Store;
  customer: Customer | null;
  onPrizeWon?: (prize: SpinWheelPrize) => void;
}

export const SpinWheelModal: React.FC<SpinWheelModalProps> = ({
  isOpen,
  onClose,
  prizes = [],
  store,
  customer,
  onPrizeWon,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [wonPrize, setWonPrize] = useState<SpinWheelPrize | null>(null);
  const [hasSpun, setHasSpun] = useState(false);

  // Fallback default prizes if none configured
  const effectivePrizes: SpinWheelPrize[] = prizes && prizes.length >= 2 ? prizes : [
    { id: 'p1', label: 'خصم 15% على طلبك 🏷️', reward_type: 'discount_percent', reward_value: 15, probability_weight: 35, color: '#F59E0B' },
    { id: 'p2', label: 'حلى مجاني 🍩', reward_type: 'free_item', reward_value: 'حلى مجاني', probability_weight: 20, color: '#10B981' },
    { id: 'p3', label: '50 نقطة إضافية ⭐', reward_type: 'points', reward_value: 50, probability_weight: 25, color: '#6366F1' },
    { id: 'p4', label: 'حظ أوفر المرة القادمة 🎯', reward_type: 'no_luck', reward_value: 0, probability_weight: 20, color: '#64748B' },
  ];

  const totalSlices = effectivePrizes.length;
  const sliceAngle = 360 / totalSlices;

  // Spin the wheel with natural easing physics
  const spin = () => {
    if (isSpinning || hasSpun) return;
    setIsSpinning(true);
    setWonPrize(null);

    playBeepSound('notification');

    // Pick a winning index (weighted or random)
    const totalWeight = effectivePrizes.reduce((acc, p) => acc + (p.probability_weight || 25), 0);
    let rand = Math.random() * totalWeight;
    let selectedIdx = 0;
    for (let i = 0; i < effectivePrizes.length; i++) {
      rand -= effectivePrizes[i].probability_weight || 25;
      if (rand <= 0) {
        selectedIdx = i;
        break;
      }
    }

    // Number of full rotations (5 to 8 rotations) + targeted segment angle
    const extraSpins = 360 * (5 + Math.floor(Math.random() * 3));
    // In SVG, 0 deg is at 3 o'clock. Pointer is at top (270 deg or 90 deg depending on orientation).
    // Center the chosen slice right at the top pointer (270 deg)
    const targetSliceCenter = selectedIdx * sliceAngle + sliceAngle / 2;
    const finalAngle = extraSpins + (270 - targetSliceCenter);

    setRotation((prev) => prev + finalAngle);

    setTimeout(() => {
      setIsSpinning(false);
      setHasSpun(true);
      const chosen = effectivePrizes[selectedIdx];
      setWonPrize(chosen);

      if (chosen.reward_type !== 'no_luck') {
        playBeepSound('success');
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: [chosen.color || '#F59E0B', '#10B981', '#38BDF8', '#FFFFFF'],
        });
      } else {
        playBeepSound('error');
      }

      if (onPrizeWon) {
        onPrizeWon(chosen);
      }
    }, 4500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn" dir="rtl">
      <div className="relative w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-center overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSpinning}
          className="absolute top-4 left-4 p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white transition disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
          <h3 className="text-xl font-black text-white">عجلة الحظ التفاعلية</h3>
        </div>
        <p className="text-xs text-slate-400 mb-6">دوّر العجلة واربح خصومات وهدايا فورية من {store.name}!</p>

        {/* Wheel Container */}
        <div className="relative w-64 h-64 mx-auto my-4 flex items-center justify-center">
          {/* Top Indicator Arrow */}
          <div className="absolute -top-3 z-30 flex flex-col items-center">
            <div className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-t-[22px] border-t-amber-400 drop-shadow-[0_2px_8px_rgba(251,191,36,0.8)]" />
          </div>

          {/* SVG Wheel */}
          <div
            className="w-full h-full rounded-full shadow-[0_0_30px_rgba(0,0,0,0.8)] border-4 border-slate-700/80 overflow-hidden"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? 'transform 4.5s cubic-bezier(0.15, 0.9, 0.25, 1)' : 'none',
            }}
          >
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {effectivePrizes.map((prize, idx) => {
                const startAngle = (idx * sliceAngle * Math.PI) / 180;
                const endAngle = (((idx + 1) * sliceAngle) * Math.PI) / 180;

                const x1 = 50 + 50 * Math.cos(startAngle);
                const y1 = 50 + 50 * Math.sin(startAngle);
                const x2 = 50 + 50 * Math.cos(endAngle);
                const y2 = 50 + 50 * Math.sin(endAngle);

                const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 0 1 ${x2} ${y2} Z`;

                // Calculate label angle
                const midAngle = idx * sliceAngle + sliceAngle / 2;

                return (
                  <g key={prize.id || idx}>
                    <path
                      d={pathData}
                      fill={prize.color || (idx % 2 === 0 ? '#F59E0B' : '#10B981')}
                      stroke="#0F172A"
                      strokeWidth="0.8"
                    />
                    {/* Text Label inside slice */}
                    <g transform={`rotate(${midAngle} 50 50)`}>
                      <text
                        x="76"
                        y="51"
                        fill="#FFFFFF"
                        fontSize="3.8"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="font-black select-none pointer-events-none drop-shadow"
                      >
                        {prize.label.slice(0, 14)}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Center Hub Button */}
          <button
            type="button"
            onClick={spin}
            disabled={isSpinning || hasSpun}
            className={`absolute z-20 w-16 h-16 rounded-full font-black text-xs shadow-xl flex items-center justify-center border-2 border-white/40 transition active:scale-95 ${
              isSpinning
                ? 'bg-slate-700 text-slate-400'
                : hasSpun
                ? 'bg-emerald-600 text-white'
                : 'bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 hover:scale-105'
            }`}
          >
            {isSpinning ? (
              <RotateCw className="w-5 h-5 animate-spin" />
            ) : hasSpun ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              'تدوير!'
            )}
          </button>
        </div>

        {/* Won Prize Celebration Card */}
        {wonPrize && (
          <div className="mt-4 p-3.5 rounded-2xl bg-slate-800/90 border border-amber-500/30 animate-scaleUp">
            {wonPrize.reward_type !== 'no_luck' ? (
              <>
                <div className="text-amber-400 font-black text-sm flex items-center justify-center gap-1.5 mb-1">
                  <Trophy className="w-4 h-4" />
                  <span>مبروك! لقد ربحت:</span>
                </div>
                <div className="text-white font-extrabold text-base">{wonPrize.label}</div>
                <p className="text-[11px] text-emerald-400 mt-1">تم حفظ الجائزة في محفظتك الرقمية للاستخدام عند الكاشير ✓</p>
              </>
            ) : (
              <>
                <div className="text-slate-400 font-bold text-sm">حظ أوفر في زيارتك القادمة! 🎯</div>
                <p className="text-[11px] text-slate-500 mt-1">شكراً لتجربتك، يمكنك تدوير العجلة مرة أخرى مع طلبك التالي.</p>
              </>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="mt-5">
          {!hasSpun ? (
            <button
              type="button"
              onClick={spin}
              disabled={isSpinning}
              className="w-full py-3 px-4 rounded-2xl font-black text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-95 transition disabled:opacity-50"
            >
              {isSpinning ? 'العجلة تدور الآن...' : 'دوّر العجلة الآن 🎡'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 px-4 rounded-2xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-white transition active:scale-95"
            >
              إغلاق ومتابعة التسوق
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==============================================================================
// 🎁 2. بطاقة اكشط واربح التفاعلية (Interactive Scratch & Win Card)
// ==============================================================================

interface ScratchCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  rewardTitle: string;
  store: Store;
  onRewardRevealed?: () => void;
}

export const ScratchCardModal: React.FC<ScratchCardModalProps> = ({
  isOpen,
  onClose,
  rewardTitle,
  store,
  onRewardRevealed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const isDrawingRef = useRef(false);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 280;
    canvas.height = 160;

    // Golden metallic scratch gradient
    const grad = ctx.createLinearGradient(0, 0, 280, 160);
    grad.addColorStop(0, '#D4AF37');
    grad.addColorStop(0.5, '#F3E5AB');
    grad.addColorStop(1, '#AA771C');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative Text over scratch foil
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#422006';
    ctx.textAlign = 'center';
    ctx.fillText('✨ اكشط هنا للكشف عن هديتك ✨', 140, 75);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#78350F';
    ctx.fillText('امسح بإصبعك أو الماوس', 140, 100);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsRevealed(false);
      setTimeout(initCanvas, 100);
    }
  }, [isOpen, initCanvas]);

  const scratch = (clientX: number, clientY: number) => {
    if (isRevealed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();

    // Check scratch completion percentage (every 15 strokes)
    if (Math.random() < 0.2) {
      checkCompletion();
    }
  };

  const checkCompletion = () => {
    if (isRevealed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparentPixels = 0;
    const totalPixels = imgData.data.length / 4;

    for (let i = 3; i < imgData.data.length; i += 16) {
      if (imgData.data[i] === 0) {
        transparentPixels++;
      }
    }

    if (transparentPixels / (totalPixels / 4) > 0.35) {
      setIsRevealed(true);
      playBeepSound('success');
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
      if (onRewardRevealed) onRewardRevealed();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn" dir="rtl">
      <div className="relative w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-center">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center justify-center gap-2 mb-1">
          <Gift className="w-5 h-5 text-emerald-400" />
          <h3 className="text-xl font-black text-white">بطاقة اكشط واربح</h3>
        </div>
        <p className="text-xs text-slate-400 mb-5">هدية خاصة بمناسبة زيارتك لـ {store.name}</p>

        {/* Scratch Area */}
        <div className="relative w-[280px] h-[160px] mx-auto rounded-2xl overflow-hidden shadow-xl border-2 border-amber-500/40 select-none">
          {/* Secret Reward Behind Canvas */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-900 flex flex-col items-center justify-center p-4 text-center">
            <Trophy className="w-8 h-8 text-amber-400 mb-1" />
            <div className="text-amber-300 text-xs font-bold">مبارك! هديتك هي:</div>
            <div className="text-white font-black text-base mt-1">{rewardTitle || 'خصم 20% على طلبك القادم 🎁'}</div>
            <div className="text-emerald-400 text-[10px] font-bold mt-2">جاهزة للاستخدام الآن عند الكاشير ✓</div>
          </div>

          {/* Canvas Foil Overlay */}
          {!isRevealed && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 z-10 cursor-pointer touch-none"
              onMouseDown={() => (isDrawingRef.current = true)}
              onMouseUp={() => (isDrawingRef.current = false)}
              onMouseMove={(e) => {
                if (isDrawingRef.current) scratch(e.clientX, e.clientY);
              }}
              onTouchStart={() => (isDrawingRef.current = true)}
              onTouchEnd={() => (isDrawingRef.current = false)}
              onTouchMove={(e) => {
                if (e.touches[0]) scratch(e.touches[0].clientX, e.touches[0].clientY);
              }}
            />
          )}
        </div>

        {/* Status text */}
        <div className="mt-4">
          {isRevealed ? (
            <div className="text-emerald-400 text-xs font-bold animate-bounce">
              تم كشف الجائزة بنجاح! 🎉
            </div>
          ) : (
            <div className="text-slate-400 text-xs">
              حرّك إصبعك على المستطيل الذهبي لكشط الطبقة
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 py-3 rounded-2xl font-black text-sm bg-slate-800 hover:bg-slate-700 text-white transition active:scale-95"
        >
          {isRevealed ? 'تم، حفظ الهدية في المحفظة' : 'إغلاق'}
        </button>
      </div>
    </div>
  );
};

// ==============================================================================
// 🔥 3. شريط تحدي سلسلة الزيارات (Visit Streaks Banner)
// ==============================================================================

interface StreakBannerProps {
  currentStreak: number;
  targetDays: number;
  rewardTitle: string;
}

export const StreakBanner: React.FC<StreakBannerProps> = ({
  currentStreak = 1,
  targetDays = 3,
  rewardTitle,
}) => {
  const safeTarget = Math.max(2, targetDays || 3);
  const activeStreak = Math.min(safeTarget, currentStreak || 1);

  return (
    <div className="my-3 p-3.5 rounded-2xl bg-gradient-to-r from-orange-500/15 via-slate-900 to-amber-500/15 border border-orange-500/30 text-right" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-orange-400 flex items-center gap-1.5">
          <Flame className="w-4 h-4 fill-orange-500 text-orange-500 animate-pulse" />
          <span>تحدي سلسلة الزيارات المتتالية</span>
        </span>
        <span className="text-xs font-mono font-black text-white">
          {activeStreak} / {safeTarget} زيارات
        </span>
      </div>

      {/* Progress Dots */}
      <div className="flex items-center gap-2 my-2">
        {Array.from({ length: safeTarget }).map((_, idx) => {
          const isDone = idx < activeStreak;
          return (
            <div
              key={idx}
              className={`flex-1 h-2 rounded-full transition-all duration-500 ${
                isDone
                  ? 'bg-gradient-to-r from-orange-500 to-amber-400 shadow-md shadow-orange-500/40'
                  : 'bg-slate-800 border border-slate-700'
              }`}
            />
          );
        })}
      </div>

      <div className="text-[11px] text-slate-300 mt-1 flex items-center justify-between">
        <span>المكافأة القادمة: <strong className="text-amber-300">{rewardTitle || 'مشروب مجاني'}</strong></span>
        {activeStreak >= safeTarget ? (
          <span className="text-emerald-400 font-bold">جاهزة للاستلام 🎉</span>
        ) : (
          <span className="text-slate-400 text-[10px]">متبقي {safeTarget - activeStreak} زيارات</span>
        )}
      </div>
    </div>
  );
};

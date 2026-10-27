import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  MapPin,
  Sparkles,
  CheckCircle2,
  Bell,
  RefreshCw,
  Download,
  Share2,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Info,
  QrCode,
  Flame,
  Award,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { Store, Customer, Tier, StoreBranch, ProximityDistanceResult } from '../types';
import { WalletPassService } from '../lib/walletPassService';

interface WalletPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
  customer: Customer | null;
  tier?: Tier | null;
  storeBranches?: StoreBranch[];
  initialPlatform?: 'apple' | 'google';
}

export const WalletPassModal: React.FC<WalletPassModalProps> = ({
  isOpen,
  onClose,
  store,
  customer,
  tier,
  storeBranches = [],
  initialPlatform = 'apple',
}) => {
  const [activePlatform, setActivePlatform] = useState<'apple' | 'google'>(initialPlatform);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showLockScreenSim, setShowLockScreenSim] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [proximityInfo, setProximityInfo] = useState<ProximityDistanceResult | null>(null);
  const [customerGps, setCustomerGps] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);

  const config = WalletPassService.getWalletConfig(store);
  const customerPoints = customer?.wallet_balance || 0;
  const brandColor = config.label_color || store.secondary_color || '#E3B94A';
  const cardBg = config.background_color || store.primary_color || '#110E05';

  // Request GPS or use simulated proximity
  useEffect(() => {
    if (isOpen) {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        setIsGettingGps(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCustomerGps(coords);
            const status = WalletPassService.getProximityStatus(coords, store, customerPoints, storeBranches);
            setProximityInfo(status);
            setIsGettingGps(false);
          },
          () => {
            // Geolocation denied or unavailable -> fallback to simulated proximity
            const status = WalletPassService.getProximityStatus(null, store, customerPoints, storeBranches);
            setProximityInfo(status);
            setIsGettingGps(false);
          },
          { timeout: 5000 }
        );
      } else {
        const status = WalletPassService.getProximityStatus(null, store, customerPoints, storeBranches);
        setProximityInfo(status);
      }
    }
  }, [isOpen, store, customerPoints, storeBranches]);

  if (!isOpen) return null;

  const handleDownloadPass = () => {
    if (!customer) {
      alert('يرجى تسجيل الدخول أولاً لإصدار بطاقة المحفظة الخاصة بك.');
      return;
    }

    WalletPassService.downloadPassFile(store, customer, tier, storeBranches);
    setIsDownloaded(true);

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: [brandColor, '#FFFFFF', '#10B981', '#38BDF8'],
    });

    setTimeout(() => setIsDownloaded(false), 5000);
  };

  const qrPayload = customer
    ? `RADAR:PASS:${store.id}:${customer.id}:${customer.phone || 'VIP'}`
    : `RADAR:PASS:${store.id}:GUEST`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl relative text-slate-100 flex flex-col">
        {/* Header Strip */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-md z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <span>بطاقة المحفظة الرقمية الذكية</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                  تنبيهات شاشة القفل 🔔
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                احفظها في هاتفك بضغطة زر دون الحاجة لتحميل أي تطبيق!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-6 flex-1">
          {/* Platform Switcher & Distance Radar Pill */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Apple / Google Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActivePlatform('apple')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  activePlatform === 'apple'
                    ? 'bg-slate-900 text-white keep-white shadow-md border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 384 512">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
                <span>محفظة آبل</span>
              </button>

              <button
                type="button"
                onClick={() => setActivePlatform('google')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  activePlatform === 'google'
                    ? 'bg-blue-600 text-white keep-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                </svg>
                <span>محفظة قوقل</span>
              </button>
            </div>

            {/* Live Distance Radar Pill */}
            {proximityInfo && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 text-xs font-bold">
                <MapPin className="w-3.5 h-3.5 text-emerald-500 animate-bounce" />
                <span>
                  أقرب فرع ({proximityInfo.nearestBranchName}):{' '}
                  <strong className="font-mono font-black">{proximityInfo.formattedDistance}</strong>
                </span>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* 📱 3D REALISTIC DIGITAL PASS CARD (Apple / Google Style) */}
          {/* ======================================================== */}
          <div className="relative perspective-1000 max-w-sm mx-auto keep-white">
            <div
              className={`w-full rounded-3xl p-5 shadow-2xl border transition-all duration-500 relative overflow-hidden cursor-pointer select-none keep-white text-white vip-card-shine ${
                isFlipped ? 'rotate-y-180' : ''
              }`}
              style={{
                backgroundColor: cardBg,
                borderColor: `${brandColor}40`,
                boxShadow: `0 20px 40px -15px rgba(0, 0, 0, 0.8), 0 0 25px ${brandColor}20`,
                minHeight: '360px',
              }}
              onClick={() => setIsFlipped(!isFlipped)}
              title="اضغط لقلب البطاقة وعرض التفاصيل الخلفية"
            >
              {/* Subtle Luxury Gradient Overlay */}
              <div
                className="absolute inset-0 opacity-25 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at top right, ${brandColor} 0%, transparent 70%)`,
                }}
              />

              {!isFlipped ? (
                /* 🎴 FRONT SIDE */
                <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
                  {/* Top Bar: Store Logo + Name + Tier Badge */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-black/60 border border-white/20 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                        {store.logo_url ? (
                          <img
                            src={store.logo_url}
                            alt={store.name}
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          <span className="font-black text-sm" style={{ color: brandColor }}>
                            {store.name.slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white leading-tight">{store.name}</h4>
                        <span className="text-[10px] text-white/70 block">بطاقة العضوية والولاء الرسمية</span>
                      </div>
                    </div>

                    <div
                      className="px-2.5 py-1 rounded-full text-[10px] font-black border flex items-center gap-1 shadow-sm"
                      style={{
                        backgroundColor: `${brandColor}25`,
                        color: brandColor,
                        borderColor: `${brandColor}60`,
                      }}
                    >
                      <Award className="w-3 h-3" />
                      <span>{tier?.tier_name ? `عضوية ${tier.tier_name}` : 'عضوية VIP'}</span>
                    </div>
                  </div>

                  {/* Main Points / Stamps Block */}
                  {config.loyalty_mode === 'stamps' ? (
                    <div className="my-2 p-3.5 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/70 block font-bold">
                          الأختام المجمعة: <strong className="text-amber-400 font-mono">{(customerPoints || 0) % (config.stamps_target || 6)} من {config.stamps_target || 6}</strong>
                        </span>
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                          {((config.stamps_target || 6) - ((customerPoints || 0) % (config.stamps_target || 6))) === 0 ? 'مكتملة! 🎉' : `باقي ${(config.stamps_target || 6) - ((customerPoints || 0) % (config.stamps_target || 6))} أختام للهدية`}
                        </span>
                      </div>

                      <div className="grid grid-cols-6 gap-1.5 py-1">
                        {Array.from({ length: config.stamps_target || 6 }).map((_, idx) => {
                          const isStamped = idx < ((customerPoints || 0) % (config.stamps_target || 6));
                          return (
                            <div
                              key={idx}
                              className={`h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition ${
                                isStamped
                                  ? 'bg-amber-500/25 border-amber-400/60 shadow-sm'
                                  : 'bg-white/5 border-white/10 text-white/20'
                              }`}
                            >
                              {isStamped ? (config.stamps_icon || '☕') : idx + 1}
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-[9px] text-white/70 pt-1 border-t border-white/10 flex items-center justify-between">
                        <span>الهدية القادمة:</span>
                        <span className="font-bold text-amber-300 truncate max-w-[170px]">
                          {config.stamps_reward_title || 'قهوة مجانية ☕'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="my-2 p-3.5 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-white/70 block font-bold">
                          {config.loyalty_mode === 'cashback' ? 'الرصيد المالي المتاح' : 'رصيد النقاط الحالي'}
                        </span>
                        <div className="text-3xl font-black font-mono text-white flex items-baseline gap-1 mt-0.5">
                          <span style={{ color: brandColor }}>
                            {config.loyalty_mode === 'cashback' ? `${customerPoints.toLocaleString()} ر.س` : customerPoints.toLocaleString()}
                          </span>
                          {config.loyalty_mode !== 'cashback' && <span className="text-xs font-bold text-white/80">نقطة</span>}
                        </div>
                      </div>

                      <div className="text-left">
                        <span className="text-[10px] text-white/70 block font-bold">اسم العضو</span>
                        <span className="text-xs font-black text-white block mt-0.5 truncate max-w-[120px]">
                          {customer?.name || 'عميل مميز'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Active Gamification Badges */}
                  <div className="flex flex-wrap items-center gap-1">
                    {config.enable_spin_wheel && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[8px] font-bold border border-amber-500/30">
                        🎡 عجلة الحظ متاحة
                      </span>
                    )}
                    {config.enable_scratch_card && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[8px] font-bold border border-emerald-500/30">
                        🎁 اكشط واربح مفعلة
                      </span>
                    )}
                    {config.enable_streaks && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 text-[8px] font-bold border border-blue-500/30">
                        🔥 سلسلة 3 زيارات
                      </span>
                    )}
                  </div>

                  {/* High Contrast Barcode / QR Section for Cashier */}
                  <div className="p-3 bg-white rounded-2xl flex flex-col items-center justify-center shadow-lg border-2 border-white/20">
                    <QRCodeSVG value={qrPayload} size={110} level="M" includeMargin={false} />
                    <span className="text-[10px] font-mono font-black text-slate-900 mt-1">
                      {customer?.phone ? `VIP-${customer.phone.slice(-6)}` : 'VIP-GUEST'}
                    </span>
                  </div>

                  {/* Bottom Footer on Card */}
                  <div className="flex items-center justify-between text-[10px] text-white/70 pt-1 border-t border-white/10">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-400" />
                      <span>تنبيهات القرب الجغرافي نشطة 🔔</span>
                    </span>
                    <span className="underline font-bold text-white/90">اضغط لقلب البطاقة ↺</span>
                  </div>
                </div>
              ) : (
                /* 🎴 BACK SIDE */
                <div className="relative z-10 flex flex-col justify-between h-full space-y-3 text-right text-xs">
                  <div>
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <h4 className="font-black text-white text-sm">تفاصيل البطاقة والشروط</h4>
                      <span className="text-[10px] text-white/60">وجه البطاقة ↺</span>
                    </div>

                    <div className="space-y-2.5 mt-3 text-[11px] text-white/80">
                      <div>
                        <strong className="text-white block font-bold">تنبيهات شاشة القفل الذكية:</strong>
                        <p className="text-[10px] text-white/70 leading-relaxed mt-0.5">
                          تظهر هذه البطاقة تلقائياً على شاشة القفل بمجرد اقترابك من أي فرع لكسب
                          واستبدال النقاط بدون فتح الهاتف.
                        </p>
                      </div>

                      <div>
                        <strong className="text-white block font-bold">الفروع المدعومة:</strong>
                        <p className="text-[10px] text-white/70 mt-0.5">
                          {storeBranches.length > 0
                            ? storeBranches.map((b) => b.name).join(' • ')
                            : 'الفرع الرئيسي • طريق التحلية • مجمع النخيل'}
                        </p>
                      </div>

                      <div>
                        <strong className="text-white block font-bold">رقم الدعم والتواصل:</strong>
                        <span className="font-mono text-amber-300 text-[10px]">
                          {store.phone || '+966577371780'}
                        </span>
                      </div>

                      <div>
                        <strong className="text-white block font-bold">رقم البطاقة التسلسلي:</strong>
                        <span className="font-mono text-white/60 text-[10px]">
                          RADAR-{store.id.slice(0, 4)}-{customer?.phone || 'DEMO'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-white/50 text-center pt-2 border-t border-white/10">
                    المنصة الذكية لبرامج الولاء والمكافآت والمحفظة الرقمية 2026
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ======================================================== */}
          {/* ⚡ ONE-CLICK ACTION BUTTONS (Apple & Google Wallet)      */}
          {/* ======================================================== */}
          <div className="space-y-2.5 max-w-sm mx-auto">
            {activePlatform === 'apple' ? (
              <button
                type="button"
                onClick={handleDownloadPass}
                className="w-full py-3.5 px-5 rounded-2xl bg-slate-950 hover:bg-slate-900 text-white keep-white font-black text-sm flex items-center justify-center gap-2.5 shadow-xl border border-slate-700 transition-all hover:scale-[1.02] active:scale-95"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 384 512">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
                <span>إضافة إلى محفظة آبل (Apple Wallet)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadPass}
                className="w-full py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white keep-white font-black text-sm flex items-center justify-center gap-2.5 shadow-xl transition-all hover:scale-[1.02] active:scale-95"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                </svg>
                <span>حفظ في محفظة قوقل (Google Wallet)</span>
              </button>
            )}

            {isDownloaded && (
              <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-bold text-center animate-fade-in flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>تم إعداد بطاقة المحفظة وتجهيز ملفها بنجاح! 🚀</span>
              </div>
            )}

            {/* Toggle Lock-Screen Preview Simulator */}
            <button
              type="button"
              onClick={() => setShowLockScreenSim(!showLockScreenSim)}
              className="w-full py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <Bell className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {showLockScreenSim
                  ? 'إخفاء محاكي شاشة القفل'
                  : 'شاهد كيف يظهر الإشعار للعميل على شاشة القفل 🔔'}
              </span>
            </button>
          </div>

          {/* ======================================================== */}
          {/* 🔔 IPHONE LOCK SCREEN SIMULATOR                          */}
          {/* ======================================================== */}
          {showLockScreenSim && (
            <div className="p-4 rounded-3xl bg-slate-950 border border-slate-800 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-amber-500" />
                  <span>محاكاة شاشة قفل الآيفون عند اقتراب العميل من الفرع:</span>
                </span>
                <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  تلقائي بالكامل 100%
                </span>
              </div>

              {/* Realistic iOS Lock-Screen Notification Card */}
              <div className="rounded-2xl p-3.5 bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl space-y-1.5 text-right">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <span className="w-4 h-4 rounded-md bg-amber-500 flex items-center justify-center text-slate-950 font-black">
                      <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 384 512">
                        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                      </svg>
                    </span>
                    <span>محفظة الهاتف • {store.name}</span>
                  </div>
                  <span className="font-mono text-[10px]">الآن</span>
                </div>

                <p className="text-xs font-bold text-white leading-relaxed">
                  {proximityInfo?.suggestedLockscreenMessage ||
                    `أهلاً بك بالقرب من ${store.name}! لديك ${customerPoints} نقطة ومكافآت بانتظارك ☕🎁`}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                  <span>المسافة الحالية: {proximityInfo?.formattedDistance || '140 متر'}</span>
                  <span className="text-amber-500 font-bold">اسحب لفتح البطاقة &gt;</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                💡 <strong>الميزة التنافسية:</strong> هذا الإشعار يظهر في هاتف العميل تلقائياً بمجرد
                اقترابه من الفرع حتى لو كان الهاتف مقفلاً والتطبيق غير مفتوح!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

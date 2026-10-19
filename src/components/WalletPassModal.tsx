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
                    ? 'bg-white text-black shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span> Apple Wallet</span>
              </button>

              <button
                type="button"
                onClick={() => setActivePlatform('google')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  activePlatform === 'google'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>G Google Wallet</span>
              </button>
            </div>

            {/* Live Distance Radar Pill */}
            {proximityInfo && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
                <span>
                  أقرب فرع ({proximityInfo.nearestBranchName}):{' '}
                  <strong className="text-white font-mono">{proximityInfo.formattedDistance}</strong>
                </span>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* 📱 3D REALISTIC DIGITAL PASS CARD (Apple / Google Style) */}
          {/* ======================================================== */}
          <div className="relative perspective-1000 max-w-sm mx-auto">
            <div
              className={`w-full rounded-3xl p-5 shadow-2xl border transition-all duration-500 relative overflow-hidden cursor-pointer select-none ${
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
                      className="px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider flex items-center gap-1 shadow-sm"
                      style={{
                        backgroundColor: `${brandColor}25`,
                        color: brandColor,
                        borderColor: `${brandColor}60`,
                      }}
                    >
                      <Award className="w-3 h-3" />
                      <span>{tier?.tier_name ? `VIP ${tier.tier_name}` : 'VIP GOLD'}</span>
                    </div>
                  </div>

                  {/* Main Points Block */}
                  <div className="my-2 p-3.5 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-white/70 block font-bold">رصيد النقاط الحالي</span>
                      <div className="text-3xl font-black font-mono tracking-tight text-white flex items-baseline gap-1 mt-0.5">
                        <span style={{ color: brandColor }}>{customerPoints.toLocaleString()}</span>
                        <span className="text-xs font-bold text-white/80">نقطة</span>
                      </div>
                    </div>

                    <div className="text-left">
                      <span className="text-[10px] text-white/70 block font-bold">اسم العضو</span>
                      <span className="text-xs font-black text-white block mt-0.5 truncate max-w-[120px]">
                        {customer?.name || 'عميل مميز'}
                      </span>
                    </div>
                  </div>

                  {/* High Contrast Barcode / QR Section for Cashier */}
                  <div className="p-3 bg-white rounded-2xl flex flex-col items-center justify-center shadow-lg border-2 border-white/20">
                    <QRCodeSVG value={qrPayload} size={110} level="M" includeMargin={false} />
                    <span className="text-[10px] font-mono font-black text-black tracking-widest mt-1">
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
                        <strong className="text-white block font-bold">تنبيهات شاشة القفل (Geofencing):</strong>
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
                    منصة رادار الذكية لبرامج الولاء والمحفظة الرقمية 2026
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
                className="w-full py-3.5 px-5 rounded-2xl bg-black hover:bg-neutral-900 text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-xl border border-white/20 transition-all hover:scale-[1.02] active:scale-95"
              >
                <span className="text-lg"></span>
                <span>إضافة إلى Apple Wallet (آبل واليت)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadPass}
                className="w-full py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-xl transition-all hover:scale-[1.02] active:scale-95"
              >
                <span className="font-bold text-base">G</span>
                <span>حفظ في Google Wallet (قوقل واليت)</span>
              </button>
            )}

            {isDownloaded && (
              <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold text-center animate-fade-in flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>تم إعداد بطاقة المحفظة وتجهيز ملفها بنجاح! 🚀</span>
              </div>
            )}

            {/* Toggle Lock-Screen Preview Simulator */}
            <button
              type="button"
              onClick={() => setShowLockScreenSim(!showLockScreenSim)}
              className="w-full py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
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
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  <span>محاكاة شاشة قفل الآيفون عند اقتراب العميل من الفرع:</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  تلقائي بالكامل 100%
                </span>
              </div>

              {/* Realistic iOS Lock-Screen Notification Card */}
              <div className="rounded-2xl p-3.5 bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl space-y-1.5 text-right">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <span className="w-4 h-4 rounded-md bg-amber-500 flex items-center justify-center text-[10px] text-black font-black">
                      
                    </span>
                    <span>Apple Wallet • {store.name}</span>
                  </div>
                  <span className="font-mono text-[10px]">الآن</span>
                </div>

                <p className="text-xs font-bold text-white leading-relaxed">
                  {proximityInfo?.suggestedLockscreenMessage ||
                    `أهلاً بك بالقرب من ${store.name}! لديك ${customerPoints} نقطة ومكافآت بانتظارك ☕🎁`}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                  <span>المسافة الحالية: {proximityInfo?.formattedDistance || '140 متر'}</span>
                  <span className="text-amber-400 font-bold">اسحب لفتح البطاقة &gt;</span>
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

import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, SwitchCamera, AlertCircle, Zap } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedData: string) => void;
  title?: string;
  subtitle?: string;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'مسح الباركود الذكي (عميل أو كوبون)',
  subtitle = 'وجّه كاميرا الجهاز نحو شاشة الجوال لقراءة الباركود فورياً',
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  const scannerRef = useRef<any>(null);
  const isStoppingRef = useRef(false);
  const readerElementId = 'radar-qr-reader-viewport';

  useEffect(() => {
    if (isOpen) {
      isStoppingRef.current = false;
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const stopCamera = () => {
    isStoppingRef.current = true;
    if (scannerRef.current) {
      const instance = scannerRef.current;
      scannerRef.current = null;
      try {
        if (instance.isScanning) {
          instance.stop().then(() => instance.clear()).catch(() => {});
        } else {
          instance.clear();
        }
      } catch (e) {
        console.warn('Error clearing scanner instance', e);
      }
    }
  };

  const startCamera = async (cameraIdToUse?: string) => {
    setCameraError(null);
    isStoppingRef.current = false;

    // ⚡ Guaranteed DOM layout settling before initializing Html5Qrcode on Mobile
    setTimeout(async () => {
      if (isStoppingRef.current) return;

      const container = document.getElementById(readerElementId);
      if (!container) return;

      try {
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              await scannerRef.current.stop();
            }
            scannerRef.current.clear();
          } catch {}
        }

        // Dynamically import html5-qrcode on demand
        const { Html5Qrcode } = await import('html5-qrcode');
        if (isStoppingRef.current) return;

        const html5QrCode = new Html5Qrcode(readerElementId, false);
        scannerRef.current = html5QrCode;

        // Mobile-Safe Dynamic Scan Box (Guaranteed never to exceed viewfinder dimensions on mobile)
        const scanConfig = {
          fps: 20,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth || 280, viewfinderHeight || 280);
            const size = Math.floor(minEdge * 0.75);
            const finalSize = Math.max(150, Math.min(size, minEdge - 10));
            return { width: finalSize, height: finalSize };
          },
          disableFlip: false,
        };

        const onScan = (decodedText: string) => {
          if (isStoppingRef.current) return;
          isStoppingRef.current = true;
          // Instant 0ms callback to POS UI
          onScanSuccess(decodedText.trim());
          onClose();
          // Background teardown
          setTimeout(() => {
            try {
              html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
            } catch {}
          }, 30);
        };

        const targetCamera = cameraIdToUse || { facingMode: 'environment' };

        try {
          await html5QrCode.start(targetCamera, scanConfig, onScan, () => {});

          // Non-blocking device enumeration in background for camera switcher
          Html5Qrcode.getCameras()
            .then((cams) => {
              if (Array.isArray(cams) && cams.length > 0) {
                setAvailableCameras(cams);
              }
            })
            .catch(() => {});
        } catch (firstErr) {
          console.warn('Direct environment start failed, attempting device enumeration fallback', firstErr);
          // 🛡️ Fallback: Enumerate available cameras to explicitly find rear camera on iOS/Android
          try {
            const cams = await Html5Qrcode.getCameras();
            if (Array.isArray(cams) && cams.length > 0) {
              setAvailableCameras(cams);
              const backCam =
                cams.find((c) => {
                  const l = (c.label || '').toLowerCase();
                  return (
                    (l.includes('back') ||
                      l.includes('rear') ||
                      l.includes('environment') ||
                      l.includes('خلفية') ||
                      l.includes('0')) &&
                    !l.includes('ultra') &&
                    !l.includes('wide 0.5')
                  );
                }) ||
                cams.find((c) => {
                  const l = (c.label || '').toLowerCase();
                  return l.includes('back') || l.includes('rear') || l.includes('environment') || l.includes('خلفية');
                }) ||
                cams[cams.length - 1] ||
                cams[0];

              const fallbackCam = backCam ? backCam.id : { facingMode: 'environment' };
              if (backCam) setSelectedCameraId(backCam.id);
              await html5QrCode.start(fallbackCam, scanConfig, onScan, () => {});
            } else {
              await html5QrCode.start('environment' as any, scanConfig, onScan, () => {});
            }
          } catch (fallbackErr: any) {
            console.warn('Camera fallback failed:', fallbackErr);
            throw fallbackErr;
          }
        }
      } catch (err: any) {
        console.warn('Camera start fatal error:', err);
        setCameraError(
          'تعذر تشغيل الكاميرا. يرجى التأكد من السماح بصلاحية الكاميرا للمتصفح في إعدادات الجوال أو استخدام الإدخال اليدوي.'
        );
      }
    }, 80);
  };

  const handleSwitchCamera = () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
    startCamera(nextCamera.id);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    isStoppingRef.current = true;
    onScanSuccess(manualCode.trim());
    onClose();
    stopCamera();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-lg animate-fade-in">
      <div className="w-full max-w-lg rounded-3xl p-5 sm:p-7 border border-slate-700/80 relative shadow-2xl overflow-hidden bg-slate-900/98 text-right">
        
        {/* Custom styling to ensure video stream fills container completely and seamlessly on mobile */}
        <style>{`
          #radar-qr-reader-viewport,
          #radar-qr-reader-viewport__scan_region,
          #radar-qr-reader-viewport__scan_region > div {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            border: none !important;
            background: transparent !important;
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: hidden !important;
          }
          #radar-qr-reader-viewport video {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            object-fit: cover !important;
            border-radius: 1.5rem !important;
            display: block !important;
          }
          #radar-qr-reader-viewport img, #radar-qr-reader-viewport span, #radar-qr-reader-viewport a {
            display: none !important;
          }
        `}</style>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2.5 rounded-2xl text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition z-30 shadow-lg"
          title="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Title & Switch Camera */}
        <div className="flex items-center justify-between mb-4 pl-12">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-md">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">{title}</h3>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>

          {availableCameras.length > 1 && (
            <button
              onClick={handleSwitchCamera}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs flex items-center gap-1 transition shrink-0"
              title="تبديل الكاميرا"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 📷 Big Spacious Camera Viewport */}
        <div className="relative rounded-3xl overflow-hidden bg-black border-2 border-amber-500/60 w-full h-[360px] sm:h-[420px] flex items-center justify-center shadow-2xl">
          {/* Universal Html5Qrcode Viewport */}
          <div id={readerElementId} className="w-full h-full"></div>

          {/* Clean Focused Viewfinder Guide Frame */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 z-10">
            <div className="w-full max-w-[270px] aspect-square rounded-3xl border border-white/20 relative shadow-[0_0_20px_rgba(0,0,0,0.4)]">
              {/* Clean Subtle Corner Accents */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-amber-400 rounded-tl-lg"></div>
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-amber-400 rounded-tr-lg"></div>
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-amber-400 rounded-bl-lg"></div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-amber-400 rounded-br-lg"></div>

              <div className="absolute -bottom-8 left-0 right-0 text-center">
                <span className="px-3 py-1 rounded-full bg-slate-950/80 border border-slate-700 text-[11px] font-bold text-slate-300 backdrop-blur-md">
                  ضع الباركود داخل الإطار
                </span>
              </div>
            </div>
          </div>

          {/* Error Alert Display */}
          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-4 z-20">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xs leading-relaxed">{cameraError}</p>
              <button
                onClick={() => startCamera()}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-black text-xs font-black hover:bg-amber-400 flex items-center space-x-1.5 rtl:space-x-reverse transition shadow-lg"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة محاولة فتح الكاميرا 🔄</span>
              </button>
            </div>
          )}
        </div>

        {/* ✏️ Quick Manual Entry Fallback inside Scanner */}
        <form onSubmit={handleManualSubmit} className="mt-4 pt-3 border-t border-slate-800 flex space-x-2 rtl:space-x-reverse">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="أو اكتب رقم الجوال (05...) أو كود الكوبون..."
            className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-xs text-white outline-none font-mono placeholder-slate-600 uppercase"
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center gap-1.5 transition shadow-lg disabled:opacity-40 shrink-0"
          >
            <Zap className="w-4 h-4" />
            <span>تنفيذ</span>
          </button>
        </form>

      </div>
    </div>
  );
};

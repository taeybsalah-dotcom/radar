import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, SwitchCamera, AlertCircle, Zap, Copy, Check, ShieldAlert } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedData: string) => void;
  title?: string;
  subtitle?: string;
}

interface DiagnosticDetails {
  errorName: string;
  errorMessage: string;
  stagesAttempted: string[];
  isSecureContext: boolean;
  protocol: string;
  hasMediaDevices: boolean;
  userAgent: string;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'مسح الباركود الذكي (عميل أو كوبون)',
  subtitle = 'وجّه كاميرا الجهاز نحو شاشة الجوال لقراءة الباركود فورياً',
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticDetails | null>(null);
  const [copiedDiag, setCopiedDiag] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStoppingRef = useRef(false);
  const readerElementId = 'radar-qr-reader-viewport';

  useEffect(() => {
    if (isOpen) {
      isStoppingRef.current = false;
      // Start camera directly
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
    setDiagnostic(null);
    setIsInitializing(true);
    isStoppingRef.current = false;

    const stagesAttempted: string[] = [];

    // Pre-flight check: Secure context & mediaDevices
    const isSecure = typeof window !== 'undefined' ? window.isSecureContext : false;
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'unknown';
    const hasMedia = typeof navigator !== 'undefined' && !!navigator?.mediaDevices?.getUserMedia;

    if (!isSecure && protocol !== 'https:' && typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      const errName = 'SecurityError / InsecureContext';
      const errMsg = 'المتصفح يمنع تشغيل الكاميرا في المواقع غير المشفرة (HTTP). يجب فتح الموقع عبر HTTPS.';
      setCameraError(errMsg);
      setDiagnostic({
        errorName: errName,
        errorMessage: errMsg,
        stagesAttempted: ['pre-flight-https-check'],
        isSecureContext: isSecure,
        protocol,
        hasMediaDevices: hasMedia,
        userAgent: navigator.userAgent,
      });
      setIsInitializing(false);
      return;
    }

    const container = document.getElementById(readerElementId);
    if (!container) {
      setIsInitializing(false);
      return;
    }

    try {
      // Clear previous instance safely
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch {}
      }

      const html5QrCode = new Html5Qrcode(readerElementId, false);
      scannerRef.current = html5QrCode;

      // Mathematically guaranteed safe qrbox calculation:
      // Always strictly 75% of minimum dimension, never exceeds viewfinder width or height
      const scanConfig = {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const vw = viewfinderWidth > 0 ? viewfinderWidth : 260;
          const vh = viewfinderHeight > 0 ? viewfinderHeight : 260;
          const minEdge = Math.min(vw, vh);
          const safeSize = Math.max(50, Math.floor(minEdge * 0.75));
          return { width: safeSize, height: safeSize };
        },
        disableFlip: false,
      };

      const onScan = (decodedText: string) => {
        if (isStoppingRef.current) return;
        isStoppingRef.current = true;
        // Instant callback to POS UI
        onScanSuccess(decodedText.trim());
        onClose();
        // Background cleanup
        setTimeout(() => {
          try {
            html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
          } catch {}
        }, 30);
      };

      // Progressive Multi-Stage Fallback Strategy
      let startSuccess = false;
      let lastError: any = null;

      // If a specific camera ID was selected by the user, prioritize it
      if (cameraIdToUse) {
        stagesAttempted.push(`specific-camera-id (${cameraIdToUse})`);
        try {
          await html5QrCode.start(cameraIdToUse, scanConfig, onScan, () => {});
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn('Direct camera ID start failed:', e);
        }
      }

      // Stage 1: Standard Environment Facing Mode { facingMode: 'environment' }
      if (!startSuccess && !isStoppingRef.current) {
        stagesAttempted.push("facingMode: 'environment'");
        try {
          await html5QrCode.start({ facingMode: 'environment' }, scanConfig, onScan, () => {});
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn('Stage 1 facingMode environment failed:', e);
        }
      }

      // Stage 2: Camera Enumeration -> Detect Rear Camera explicitly
      if (!startSuccess && !isStoppingRef.current) {
        stagesAttempted.push('camera-device-enumeration');
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

            if (backCam) {
              setSelectedCameraId(backCam.id);
              stagesAttempted.push(`enumerated-rear-camera (${backCam.label || backCam.id})`);
              await html5QrCode.start(backCam.id, scanConfig, onScan, () => {});
              startSuccess = true;
            }
          }
        } catch (e: any) {
          lastError = e;
          console.warn('Stage 2 device enumeration fallback failed:', e);
        }
      }

      // Stage 3: Front Facing Mode / User Facing
      if (!startSuccess && !isStoppingRef.current) {
        stagesAttempted.push("facingMode: 'user'");
        try {
          await html5QrCode.start({ facingMode: 'user' }, scanConfig, onScan, () => {});
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn('Stage 3 user facingMode failed:', e);
        }
      }

      // Stage 4: Basic string fallback 'environment'
      if (!startSuccess && !isStoppingRef.current) {
        stagesAttempted.push("string: 'environment'");
        try {
          await html5QrCode.start('environment' as any, scanConfig, onScan, () => {});
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn('Stage 4 string environment failed:', e);
        }
      }

      // If all stages failed, throw the last error to be captured in the UI Diagnostic Boundary
      if (!startSuccess) {
        throw lastError || new Error('فشلت جميع محاولات الاتصال بكاميرا الجهاز');
      }

      // Populate camera list in background for switcher
      Html5Qrcode.getCameras()
        .then((cams) => {
          if (Array.isArray(cams) && cams.length > 0) {
            setAvailableCameras(cams);
          }
        })
        .catch(() => {});
    } catch (err: any) {
      console.error('Camera fatal error in diagnostic boundary:', err);

      const errName = err?.name || 'CameraError';
      const errMsg = err?.message || String(err);

      // Human-readable Arabic translation for common browser media errors
      let arabicExplanation = 'تعذر تشغيل الكاميرا.';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        arabicExplanation = 'المتصفح يمنع الكاميرا (تم رفض الإذن). يرجى فتح إعدادات المتصفح وتفعيل إذن الكاميرا.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        arabicExplanation = 'لم يتم العثور على كاميرا في هذا الجهاز.';
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        arabicExplanation = 'الكاميرا قيد الاستخدام بواسطة تطبيق آخر أو نظام الجهاز يمنع الوصول.';
      } else if (errName === 'OverconstrainedError') {
        arabicExplanation = 'إعدادات الكاميرا غير متوافقة مع عدسات الجهاز، وتمت تجربة كافة البدائل.';
      } else if (errName === 'SecurityError') {
        arabicExplanation = 'المتصفح يمنع الكاميرا لأن الاتصال ليس مشفراً (HTTPS).';
      }

      setCameraError(arabicExplanation);
      setDiagnostic({
        errorName: errName,
        errorMessage: errMsg,
        stagesAttempted,
        isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
        protocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown',
        hasMediaDevices: typeof navigator !== 'undefined' && !!navigator?.mediaDevices?.getUserMedia,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      });
    } finally {
      setIsInitializing(false);
    }
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

  const handleCopyDiagnostic = () => {
    if (!diagnostic) return;
    const text = [
      `=== RADAR POS CAMERA DIAGNOSTIC ===`,
      `Error Name: ${diagnostic.errorName}`,
      `Error Message: ${diagnostic.errorMessage}`,
      `Stages Attempted: ${diagnostic.stagesAttempted.join(' -> ')}`,
      `Secure Context: ${diagnostic.isSecureContext ? 'YES (Secure)' : 'NO (Insecure)'}`,
      `Protocol: ${diagnostic.protocol}`,
      `MediaDevices API: ${diagnostic.hasMediaDevices ? 'Available' : 'Unavailable'}`,
      `User Agent: ${diagnostic.userAgent}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopiedDiag(true);
      setTimeout(() => setCopiedDiag(false), 2500);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-lg animate-fade-in">
      <div className="w-full max-w-lg rounded-3xl p-5 sm:p-7 border border-slate-700/80 relative shadow-2xl overflow-hidden bg-slate-900/98 text-right">
        
        {/* Custom styling for video stream viewport */}
        <style>{`
          #radar-qr-reader-viewport {
            width: 100% !important;
            height: 100% !important;
            border: none !important;
            background: #000 !important;
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: hidden !important;
          }
          #radar-qr-reader-viewport__scan_region {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            border: none !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
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

          {/* Clean Focused Viewfinder Guide Frame (Visible when active and no error) */}
          {!cameraError && (
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
          )}

          {/* Loading Overlay */}
          {isInitializing && !cameraError && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 z-15 text-center p-4">
              <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-bold text-slate-300">جاري تشغيل الكاميرا والتحقق من التوافق...</p>
            </div>
          )}

          {/* 🔴 VISIBLE ERROR BOUNDARY & DIAGNOSTIC PANEL */}
          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/98 flex flex-col items-center justify-between p-4 sm:p-5 text-right z-25 overflow-y-auto">
              
              <div className="w-full space-y-3">
                {/* Header */}
                <div className="flex items-center space-x-2 rtl:space-x-reverse text-rose-400 border-b border-rose-500/30 pb-2">
                  <ShieldAlert className="w-6 h-6 shrink-0 animate-pulse" />
                  <div>
                    <h4 className="text-sm font-black text-white">تنبيه تشغيل الكاميرا</h4>
                    <span className="text-[11px] font-mono text-rose-400">{diagnostic?.errorName || 'Camera Access Blocked'}</span>
                  </div>
                </div>

                {/* Explanation */}
                <p className="text-xs text-rose-200 font-medium leading-relaxed bg-rose-950/40 p-3 rounded-2xl border border-rose-500/30">
                  {cameraError}
                </p>

                {/* Technical Diagnostic Details Box */}
                {diagnostic && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-[11px] font-mono space-y-1 text-slate-300 select-text">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-1 mb-1">
                      <span className="text-amber-400 font-bold">تقرير الفحص الفني (Diagnostic):</span>
                      <button
                        type="button"
                        onClick={handleCopyDiagnostic}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700"
                      >
                        {copiedDiag ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedDiag ? 'تم النسخ' : 'نسخ التقرير'}</span>
                      </button>
                    </div>
                    <div className="text-rose-300 font-bold truncate">Error: {diagnostic.errorMessage}</div>
                    <div className="text-slate-400">Stages: {diagnostic.stagesAttempted.join(' ➔ ')}</div>
                    <div className="flex gap-3 text-slate-400 text-[10px]">
                      <span>HTTPS: <strong className={diagnostic.isSecureContext ? 'text-emerald-400' : 'text-rose-400'}>{diagnostic.isSecureContext ? 'نعم' : 'لا'}</strong></span>
                      <span>MediaAPI: <strong className={diagnostic.hasMediaDevices ? 'text-emerald-400' : 'text-rose-400'}>{diagnostic.hasMediaDevices ? 'متاح' : 'محظور'}</strong></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Direct Tap User-Gesture Action Button */}
              <div className="w-full pt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 text-black text-xs font-black hover:bg-amber-400 flex items-center justify-center space-x-2 rtl:space-x-reverse transition shadow-xl active:scale-98"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>👉 انقر هنا للسماح وتشغيل الكاميرا مباشرة (Tap to Start)</span>
                </button>
              </div>

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

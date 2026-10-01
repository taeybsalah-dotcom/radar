import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, SwitchCamera, AlertCircle, Zap, Copy, Check, ShieldAlert } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedData: string) => void;
  title?: string;
  subtitle?: string;
}

interface ScoredCamera {
  id: string;
  label: string;
  isRear: boolean;
  score: number;
}

interface DiagnosticDetails {
  errorName: string;
  errorMessage: string;
  stagesAttempted: string[];
  detectedCameras: Array<{ id: string; label: string; isRear: boolean }>;
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
  const [rearWarning, setRearWarning] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
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

  /**
   * 🛡️ Clean track stopping: Kills all active MediaStreamTracks and clears Html5Qrcode instance
   */
  const killAllActiveMediaTracks = async () => {
    if (scannerRef.current) {
      try {
        const instance = scannerRef.current;
        scannerRef.current = null;
        if (instance.isScanning) {
          await instance.stop();
        }
        instance.clear();
      } catch (e) {
        console.warn('Error stopping scanner instance:', e);
      }
    }

    if (typeof document !== 'undefined') {
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach((vid) => {
        if (vid.srcObject) {
          try {
            const stream = vid.srcObject as MediaStream;
            stream.getTracks().forEach((track) => {
              track.stop();
            });
            vid.srcObject = null;
          } catch {}
        }
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  };

  const stopCamera = () => {
    isStoppingRef.current = true;
    killAllActiveMediaTracks().catch(() => {});
  };

  /**
   * 🎯 Camera Device Enumeration (Handles Empty Privacy Labels on iOS/Android gracefully)
   */
  const enumerateCamerasSafely = async (): Promise<ScoredCamera[]> => {
    let devices: MediaDeviceInfo[] = [];
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        devices = await navigator.mediaDevices.enumerateDevices();
      }
    } catch {}

    const videoInputs = devices.filter((d) => d.kind === 'videoinput');

    if (videoInputs.length === 0) {
      try {
        const html5Cams = await Html5Qrcode.getCameras();
        if (html5Cams && html5Cams.length > 0) {
          return html5Cams.map((c, idx) => {
            const label = (c.label || '').toLowerCase();
            const isRear =
              label.includes('back') ||
              label.includes('rear') ||
              label.includes('environment') ||
              label.includes('خلف');
            return {
              id: c.id,
              label: c.label || `كاميرا ${idx + 1}`,
              isRear,
              score: isRear ? 60 : 10,
            };
          });
        }
      } catch {}
    }

    return videoInputs.map((d, idx) => {
      const rawLabel = d.label || '';
      const lower = rawLabel.toLowerCase();

      const isFront =
        lower.includes('front') ||
        lower.includes('user') ||
        lower.includes('selfie') ||
        lower.includes('أمام') ||
        lower.includes('face');

      const isRear =
        !isFront &&
        (lower.includes('back') ||
          lower.includes('rear') ||
          lower.includes('environment') ||
          lower.includes('خلف') ||
          lower.includes('facing back'));

      let score = 0;
      if (isRear) {
        score += 100;
        if (lower.includes('main') || lower.includes('primary') || lower.includes('standard') || lower.includes('أساسية')) {
          score += 50;
        }
        if (lower.includes('1x') || (lower.includes('wide') && !lower.includes('ultra') && !lower.includes('0.5'))) {
          score += 30;
        }
        if (lower.includes('ultra') || lower.includes('0.5') || lower.includes('macro') || lower.includes('telephoto')) {
          score -= 80;
        }
      } else if (isFront) {
        score = 10;
      } else {
        score = 50; // Neutral if label is empty (Safari privacy)
      }

      const displayLabel = rawLabel.trim() || `كاميرا الجهاز (${idx + 1})`;

      return {
        id: d.deviceId,
        label: displayLabel,
        isRear,
        score,
      };
    });
  };

  const startCamera = async (cameraIdToUse?: string) => {
    setCameraError(null);
    setRearWarning(null);
    setDiagnostic(null);
    setIsInitializing(true);
    isStoppingRef.current = false;

    const stagesAttempted: string[] = [];
    let detectedList: ScoredCamera[] = [];

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
        detectedCameras: [],
        isSecureContext: isSecure,
        protocol,
        hasMediaDevices: hasMedia,
        userAgent: navigator.userAgent,
      });
      setIsInitializing(false);
      return;
    }

    try {
      // 1. Cleanly kill all previous active streams to prevent hardware lock
      await killAllActiveMediaTracks();
      if (isStoppingRef.current) return;

      const container = document.getElementById(readerElementId);
      if (!container) {
        setIsInitializing(false);
        return;
      }

      // ⚡ Restrict formats to QR_CODE and CODE_128 for rapid decoding (<50ms)
      const html5QrCode = new Html5Qrcode(readerElementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
        ],
        verbose: false,
        useBarCodeDetectorIfSupported: true,
      });
      scannerRef.current = html5QrCode;

      // ⚡ Clean scan configuration WITHOUT strict videoConstraints (Ensures 100% Safari compatibility)
      const scanConfig = {
        fps: 15,
        disableFlip: true,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const vw = viewfinderWidth > 0 ? viewfinderWidth : 260;
          const vh = viewfinderHeight > 0 ? viewfinderHeight : 260;
          const minEdge = Math.min(vw, vh);
          const safeSize = Math.max(50, Math.floor(minEdge * 0.75));
          return { width: safeSize, height: safeSize };
        },
      };

      const onScan = (decodedText: string) => {
        if (isStoppingRef.current) return;
        isStoppingRef.current = true;
        onScanSuccess(decodedText.trim());
        onClose();
        setTimeout(() => {
          killAllActiveMediaTracks().catch(() => {});
        }, 30);
      };

      // 2. Fetch available cameras
      detectedList = await enumerateCamerasSafely();
      setAvailableCameras(detectedList.map((c) => ({ id: c.id, label: c.label })));

      const rearWithLabels = detectedList.filter((c) => c.isRear && c.label && !c.label.startsWith('كاميرا الجهاز')).sort((a, b) => b.score - a.score);

      let startSuccess = false;
      let lastError: any = null;

      // Stage 0: User manually selected a specific camera from switcher
      if (cameraIdToUse) {
        stagesAttempted.push(`manual-camera-id: ${cameraIdToUse}`);
        try {
          await html5QrCode.start(cameraIdToUse, scanConfig, onScan, () => {});
          setSelectedCameraId(cameraIdToUse);
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn('Manual camera ID start failed:', e);
        }
      }

      // Stage 1 (Clean Environment Standard - 100% Safari / Mobile Chrome compliant):
      // Clean request without conflicting constraints
      if (!startSuccess && !isStoppingRef.current) {
        stagesAttempted.push("clean facingMode: 'environment'");
        try {
          await html5QrCode.start({ facingMode: 'environment' }, scanConfig, onScan, () => {});
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn("Stage 1 clean facingMode: 'environment' failed:", e);
        }
      }

      // Stage 2 (Exact Environment Mode - for devices requiring exact rear flag):
      if (!startSuccess && !isStoppingRef.current) {
        stagesAttempted.push("facingMode: { exact: 'environment' }");
        try {
          await html5QrCode.start({ facingMode: { exact: 'environment' } }, scanConfig, onScan, () => {});
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn("Stage 2 facingMode: { exact: 'environment' } failed:", e);
        }
      }

      // Stage 3 (Target Labeled Primary Rear Camera by DeviceId - if labels are available):
      if (!startSuccess && !isStoppingRef.current && rearWithLabels.length > 0) {
        const bestRear = rearWithLabels[0];
        stagesAttempted.push(`labeled-rear-id: ${bestRear.label} (${bestRear.id})`);
        try {
          await html5QrCode.start(bestRear.id, scanConfig, onScan, () => {});
          setSelectedCameraId(bestRear.id);
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn(`Stage 3 labeled rear camera [${bestRear.label}] failed:`, e);
        }
      }

      // Stage 4 (Ideal Environment Mode):
      if (!startSuccess && !isStoppingRef.current) {
        stagesAttempted.push("facingMode: { ideal: 'environment' }");
        try {
          await html5QrCode.start({ facingMode: { ideal: 'environment' } } as any, scanConfig, onScan, () => {});
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn('Stage 4 ideal environment failed:', e);
        }
      }

      // Stage 5 (String 'environment'):
      if (!startSuccess && !isStoppingRef.current) {
        stagesAttempted.push("string: 'environment'");
        try {
          await html5QrCode.start('environment' as any, scanConfig, onScan, () => {});
          startSuccess = true;
        } catch (e: any) {
          lastError = e;
          console.warn('Stage 5 string environment failed:', e);
        }
      }

      // Stage 6 (Front Camera fallback ONLY if all rear attempts failed):
      if (!startSuccess && !isStoppingRef.current) {
        stagesAttempted.push("fallback: facingMode 'user'");
        try {
          await html5QrCode.start({ facingMode: 'user' }, scanConfig, onScan, () => {});
          startSuccess = true;
          setRearWarning(
            '⚠️ تعذر فتح الكاميرا الخلفية تلقائياً، وتم فتح الكاميرا الأمامية مؤقتاً. يمكنك استخدام زر "تبديل العدسة" لتجربة عدسة أخرى.'
          );
        } catch (e: any) {
          lastError = e;
          console.warn('Stage 6 front camera fallback failed:', e);
        }
      }

      if (!startSuccess) {
        throw lastError || new Error('فشلت جميع محاولات تشغيل الكاميرا على هذا الجهاز');
      }
    } catch (err: any) {
      console.error('Camera fatal error in diagnostic boundary:', err);

      const errName = err?.name || 'CameraError';
      const errMsg = err?.message || String(err);

      let arabicExplanation = 'تعذر تشغيل الكاميرا.';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        arabicExplanation = 'المتصفح يمنع الكاميرا (تم رفض الإذن). يرجى فتح إعدادات المتصفح وتفعيل إذن الكاميرا.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        arabicExplanation = 'لم يتم العثور على كاميرا متوافقة في هذا الجهاز.';
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        arabicExplanation = 'الكاميرا قيد الاستخدام بواسطة تطبيق آخر أو حدث تعارض في تحرير العتاد (Hardware Lock).';
      } else if (errName === 'OverconstrainedError') {
        arabicExplanation = 'المتصفح رفض إعدادات العدسة المطلوبة (OverconstrainedError).';
      } else if (errName === 'SecurityError') {
        arabicExplanation = 'المتصفح يمنع الكاميرا لأن الاتصال ليس مشفراً (HTTPS).';
      }

      setCameraError(arabicExplanation);
      setDiagnostic({
        errorName: errName,
        errorMessage: errMsg,
        stagesAttempted,
        detectedCameras: detectedList,
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
      `Stages Attempted: ${diagnostic.stagesAttempted.join(' ➔ ')}`,
      `Detected Cameras:`,
      ...diagnostic.detectedCameras.map((c, i) => `  [${i + 1}] ${c.label} (ID: ${c.id.slice(0, 10)}..., Rear: ${c.isRear})`),
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
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs flex items-center gap-1.5 transition shrink-0"
              title="تبديل العدسة / الكاميرا"
            >
              <SwitchCamera className="w-4 h-4" />
              <span className="text-[11px] font-bold hidden sm:inline">تبديل العدسة</span>
            </button>
          )}
        </div>

        {/* Rear Warning Notification (e.g. if switched to front fallback) */}
        {rearWarning && (
          <div className="mb-3 p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{rearWarning}</span>
          </div>
        )}

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
              <p className="text-xs font-bold text-slate-300">جاري تشغيل الكاميرا الخلفية...</p>
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
                    <div className="text-slate-400 truncate">Stages: {diagnostic.stagesAttempted.join(' ➔ ')}</div>
                    {diagnostic.detectedCameras.length > 0 && (
                      <div className="text-[10px] text-amber-300/80 pt-1">
                        Detected Cams: {diagnostic.detectedCameras.map((c) => c.label).join(' | ')}
                      </div>
                    )}
                    <div className="flex gap-3 text-slate-400 text-[10px] pt-1">
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
                  <span>👉 انقر هنا لإعادة تشغيل الكاميرا مباشرة (Tap to Retry)</span>
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

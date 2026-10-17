import React, { useState, useEffect } from 'react';
import { Store } from '../types';
import { OfflineSyncEngine, QueuedOfflineOrder } from '../lib/offlineSync';
import { playBeepSound } from '../lib/sound';
import confetti from 'canvas-confetti';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  X,
  Clock,
  User,
  DollarSign,
  CreditCard,
  Trash2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

interface OfflineSyncModalProps {
  store: Store;
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: (count: number) => void;
}

export const OfflineSyncModal: React.FC<OfflineSyncModalProps> = ({
  store,
  isOpen,
  onClose,
  onSyncCompleted,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(OfflineSyncEngine.isOnline());
  const [queuedOrders, setQueuedOrders] = useState<QueuedOfflineOrder[]>([]);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [syncResult, setSyncResult] = useState<{ success: number; failed: number } | null>(null);

  // Load queued orders and monitor online/offline status
  const refreshQueue = () => {
    const list = OfflineSyncEngine.getQueuedOrders(store.id);
    setQueuedOrders(list);
  };

  useEffect(() => {
    if (!isOpen) return;

    refreshQueue();

    const handleOnline = () => {
      setIsOnline(true);
      // Optional: automatically trigger sync when network returns
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Active real-internet probe
    OfflineSyncEngine.checkRealInternet().then(setIsOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOpen, store.id]);

  // Total sales in queue
  const totalQueueAmount = queuedOrders.reduce((sum, ord) => sum + (Number(ord.cartGrandTotal) || 0), 0);

  // Trigger manual sync
  const handleSyncAll = async () => {
    if (queuedOrders.length === 0 || syncing) return;

    setSyncing(true);
    setSyncResult(null);
    setSyncProgress({ current: 0, total: queuedOrders.length });

    try {
      const res = await OfflineSyncEngine.syncQueue(store.id, (current, total) => {
        setSyncProgress({ current, total });
      });

      refreshQueue();
      setSyncResult({ success: res.successCount, failed: res.failedCount });

      if (res.successCount > 0) {
        playBeepSound('success');
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#10B981', '#38BDF8', '#F59E0B'],
        });

        if (onSyncCompleted) {
          onSyncCompleted(res.successCount);
        }
      }
    } catch (e) {
      console.warn('Sync failed:', e);
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  // Remove individual order from queue
  const handleRemoveOrder = (orderId: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذه الفاتورة من طابور المزامنة؟ لن يتم رفعها للسيرفر.')) {
      OfflineSyncEngine.removeOrder(store.id, orderId);
      refreshQueue();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                isOnline
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              }`}
            >
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                مدير وضع الأوفلاين والمزامنة
              </h3>
              <p className="text-[11px] text-slate-400">
                مزامنة فواتير الكاشير المحفوظة محلياً أثناء انقطاع الإنترنت
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Connection Status Banner */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs font-bold ${
              isOnline
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
              <span>
                {isOnline
                  ? 'متصل بالإنترنت وقاعدة البيانات السحابية ✅'
                  : 'أنت الآن في وضع الأوفلاين (غير متصل بالإنترنت) 🟡'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-normal">
              {isOnline ? 'المزامنة متاحة' : 'يتم حفظ الفواتير محلياً بأمان'}
            </span>
          </div>

          {/* Sync Result Banner */}
          {syncResult && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  تمت مزامنة {syncResult.success} فاتورة بنجاح مع السيرفر!
                  {syncResult.failed > 0 && ` (تعذر مزامنة ${syncResult.failed} فواتير)`}
                </span>
              </div>
            </div>
          )}

          {/* Summary Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block font-bold">
                فواتير بانتظار المزامنة 📑
              </span>
              <strong className="text-xl font-black text-amber-400 font-mono">
                {queuedOrders.length}
              </strong>
              <span className="text-[9px] text-slate-500 block">فاتورة محلية</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block font-bold">
                إجمالي قيمة الفواتير 💰
              </span>
              <strong className="text-xl font-black text-white font-mono">
                {totalQueueAmount.toFixed(2)}
              </strong>
              <span className="text-[9px] text-slate-500 block">ريال سعودي</span>
            </div>
          </div>

          {/* Queue List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
              <span>قائمة الفواتير المحفوظة في ذاكرة الجهاز:</span>
              <span>{queuedOrders.length} فواتير</span>
            </div>

            {queuedOrders.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs space-y-2 border border-dashed border-slate-800 rounded-2xl">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/60" />
                <p className="font-bold text-slate-300">جميع الفواتير متزامنة بالكامل!</p>
                <p className="text-[11px] text-slate-500">
                  لا توجد أي فواتير معلقة محلياً، كل البيانات محفوظة على السيرفر.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-0.5">
                {queuedOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <strong className="text-white font-mono font-bold">
                          #{ord.orderNumber}
                        </strong>
                        <span className="text-[10px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                          بانتظار الرفع
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(ord.queuedAt).toLocaleTimeString('ar-SA', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span>{ord.itemsCount} أصناف</span>
                        <span>•</span>
                        <span>{ord.paymentMethod === 'cash' ? 'نقدي 💵' : 'شبكة 💳'}</span>
                        {ord.customerName && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300">{ord.customerName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <strong className="font-mono text-amber-400 font-black text-sm">
                        {Number(ord.cartGrandTotal).toFixed(2)} ﷼
                      </strong>
                      <button
                        onClick={() => handleRemoveOrder(ord.id)}
                        className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-500 hover:text-rose-400 flex items-center justify-center transition"
                        title="حذف من الطابور"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sync Progress Bar */}
          {syncProgress && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs text-slate-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  جاري المزامنة مع السيرفر...
                </span>
                <span className="font-mono text-amber-400">
                  {syncProgress.current} / {syncProgress.total}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleSyncAll}
              disabled={syncing || queuedOrders.length === 0 || !isOnline}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition active:scale-[0.99]"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  <span>جاري المزامنة الآن...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 text-black" />
                  <span>
                    مزامنة الفواتير المعلقة الآن ({queuedOrders.length} فواتير) ⚡
                  </span>
                </>
              )}
            </button>

            {!isOnline && (
              <p className="text-[10px] text-amber-400/80 text-center font-medium">
                ⚠️ زر المزامنة سيتفعل تلقائياً فور عودة اتصال الإنترنت بالجهاز.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

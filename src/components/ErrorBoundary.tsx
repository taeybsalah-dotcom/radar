import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
    this.setState({ errorInfo });

    // 🛡️ Auto-Recovery for Stale Chunks / New Deployments
    const errorMsg = error?.message || String(error);
    const isChunkError =
      errorMsg.includes('dynamically imported module') ||
      errorMsg.includes('Failed to fetch') ||
      errorMsg.includes('Loading chunk') ||
      error?.name === 'ChunkLoadError';

    if (isChunkError) {
      const key = 'radar_eb_chunk_reload';
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - parseInt(last, 10) > 10000) {
        sessionStorage.setItem(key, String(now));
        console.warn('[Radar ErrorBoundary] Stale module detected after platform deployment. Auto-reloading seamlessly...');
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/?portal=super-admin';
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || String(this.state.error);
      const isChunkError =
        errorMsg.includes('dynamically imported module') ||
        errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('Loading chunk') ||
        this.state.error?.name === 'ChunkLoadError';

      return (
        <div className="min-h-screen bg-[#080B11] text-white flex flex-col items-center justify-center p-6 text-center font-sans" dir="rtl">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-5">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-inner ${
              isChunkError
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {isChunkError ? '🚀' : '⚠️'}
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">
                {isChunkError ? 'يتوفر إصدار أحدث للمنصة' : 'حدث خطأ أثناء تحميل الواجهة'}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isChunkError
                  ? 'تم إطلاق تحديث وتحسينات برمجية جديدة في المنصة. انقر بالأسفل لإعادة تحميل أحدث ملفات الواجهة فوراً.'
                  : (this.state.error?.message || 'خطأ غير معروف في تهيئة المكون')}
              </p>
            </div>

            {!isChunkError && (
              <div className="p-4 bg-slate-950 rounded-2xl text-left font-mono text-[11px] text-red-300 overflow-auto max-h-40 border border-slate-800" dir="ltr">
                {this.state.error?.stack || String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={() => {
                  sessionStorage.removeItem('radar_eb_chunk_reload');
                  window.location.reload();
                }}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition shadow-lg shadow-amber-500/20 active:scale-95"
              >
                🔄 تحديث الصفحة وتحميل أحدث إصدار
              </button>
              <button
                onClick={this.handleReset}
                className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition active:scale-95"
              >
                🧹 تنظيف الذاكرة المؤقتة والعودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

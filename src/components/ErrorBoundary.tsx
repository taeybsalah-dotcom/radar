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
  }

  private handleReset = () => {
    localStorage.clear();
    window.location.href = '/?portal=super-admin';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080B11] text-white flex flex-col items-center justify-center p-6 text-center font-sans" dir="rtl">
          <div className="max-w-lg w-full bg-slate-900 border border-red-500/40 rounded-3xl p-8 shadow-2xl space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-3xl mx-auto text-red-400">
              ⚠️
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">حدث خطأ أثناء تحميل الواجهة</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {this.state.error?.message || 'خطأ غير معروف في تهيئة المكون'}
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl text-left font-mono text-[11px] text-red-300 overflow-auto max-h-40 border border-slate-800" dir="ltr">
              {this.state.error?.stack || String(this.state.error)}
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition"
              >
                🔄 إعادة تحديث الصفحة
              </button>
              <button
                onClick={this.handleReset}
                className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
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

import React, { useRef } from 'react';
import { X, Printer, QrCode, Sparkles, Copy, Check, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Store, DiningTable } from '../types';
import { TableService } from '../lib/tableService';

interface TableStickerPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
  tables: DiningTable[];
  selectedSingleTable?: DiningTable | null;
}

export const TableStickerPrintModal: React.FC<TableStickerPrintModalProps> = ({
  isOpen,
  onClose,
  store,
  tables,
  selectedSingleTable,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const tablesToPrint = selectedSingleTable ? [selectedSingleTable] : tables;

  const handlePrint = () => {
    window.print();
  };

  const copyUrl = (tableNum: string, id: string) => {
    const url = TableService.generateTableQrUrl(store.slug || store.id, tableNum);
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in text-right" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl relative text-slate-100 flex flex-col">
        {/* Header (Hidden on print) */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-md z-20 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-black">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>طباعة ملصقات الـ QR الذكية للطاولات</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                  {tablesToPrint.length} ملصق جاهز
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                الصق هذا الكود على الطاولة لطلب الزبون المباشر وتثبيت رقم الطاولة تلقائياً!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الملصقات الآن 🖨️</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Stickers Sheet */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 print:grid-cols-2 print:gap-4">
            {tablesToPrint.map((table) => {
              const tableQrUrl = TableService.generateTableQrUrl(
                store.slug || store.id,
                table.table_number,
                table.branch_id
              );

              return (
                <div
                  key={table.id}
                  className="rounded-3xl p-6 bg-white text-slate-950 text-center shadow-xl border-4 border-slate-950 flex flex-col items-center justify-between space-y-4 relative overflow-hidden group print:break-inside-avoid print:shadow-none print:border-2"
                >
                  {/* Top: Store Brand & Name */}
                  <div className="space-y-1">
                    <div className="w-12 h-12 rounded-full bg-black text-amber-400 flex items-center justify-center font-black mx-auto overflow-hidden shadow">
                      {store.logo_url ? (
                        <img
                          src={store.logo_url}
                          alt={store.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{store.name.slice(0, 1)}</span>
                      )}
                    </div>
                    <h4 className="font-serif font-black text-sm tracking-tight text-black">
                      {store.name}
                    </h4>
                    <span className="text-[10px] font-bold text-slate-500 block">
                      {table.zone ? TableService.getZoneLabel(table.zone) : 'صالة المطعم'}
                    </span>
                  </div>

                  {/* Middle: Big Prominent Table Number */}
                  <div className="px-5 py-1.5 rounded-full bg-slate-950 text-white font-mono font-black text-base shadow-sm">
                    طاولة #{table.table_number}
                  </div>

                  {/* QR Code Container */}
                  <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-inner">
                    <QRCodeSVG
                      value={tableQrUrl}
                      size={150}
                      level="H"
                      includeMargin={false}
                    />
                  </div>

                  {/* Instructions */}
                  <div className="space-y-0.5">
                    <p className="text-xs font-black text-black">
                      امسح الكود بكاميرا الجوال واطلب مباشرة 📱
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      منيو ذكي • دفع ميسر • تتبع مباشر للطلب
                    </p>
                  </div>

                  {/* Quick Copy Link (Hidden on Print) */}
                  <div className="w-full pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 print:hidden">
                    <span className="font-mono truncate max-w-[150px]">{tableQrUrl}</span>
                    <button
                      type="button"
                      onClick={() => copyUrl(table.table_number, table.id)}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition flex items-center gap-1"
                    >
                      {copiedId === table.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>نسخ الرابط</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

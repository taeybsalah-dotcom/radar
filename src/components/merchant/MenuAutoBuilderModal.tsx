import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Upload,
  X,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  Edit2,
  Plus,
  ShoppingBag,
  DollarSign,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import {
  compressMenuImageForAi,
  parseMenuWithAi,
  batchSaveParsedMenuItems,
  ParsedMenuItem,
  CompressedImageResult,
} from '../../lib/aiMenuBuilder';
import { CatalogItem } from '../../types';

interface MenuAutoBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  existingCategories: string[];
  onItemsSaved: (newItems: CatalogItem[]) => void;
}

type ModalStep = 'upload' | 'scanning' | 'review' | 'saving' | 'done';

export const MenuAutoBuilderModal: React.FC<MenuAutoBuilderModalProps> = ({
  isOpen,
  onClose,
  storeId,
  existingCategories,
  onItemsSaved,
}) => {
  const [step, setStep] = useState<ModalStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [compressed, setCompressed] = useState<CompressedImageResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedMenuItem[]>([]);
  const [detectedCategories, setDetectedCategories] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingKeyError, setMissingKeyError] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setCompressed(null);
    setIsCompressing(false);
    setParsedItems([]);
    setDetectedCategories([]);
    setErrorMessage(null);
    setMissingKeyError(false);
    setSaveProgress({ current: 0, total: 0 });
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileSelect = async (selectedFile: File) => {
    setErrorMessage(null);
    setMissingKeyError(false);

    if (!selectedFile.type.startsWith('image/')) {
      setErrorMessage('يرجى اختيار ملف صورة صالح (JPG أو PNG أو WebP).');
      return;
    }

    try {
      setIsCompressing(true);
      setFile(selectedFile);
      const res = await compressMenuImageForAi(selectedFile);
      setCompressed(res);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء معالجة وتصغير الصورة.');
      setFile(null);
      setCompressed(null);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleStartScan = async () => {
    if (!compressed?.base64) return;
    setErrorMessage(null);
    setMissingKeyError(false);
    setStep('scanning');

    try {
      const res = await parseMenuWithAi(compressed.base64, compressed.mimeType);

      if (!res.success) {
        if (res.code === 'GEMINI_API_KEY_MISSING') {
          setMissingKeyError(true);
        }
        throw new Error(res.error || 'فشل في استخراج الأصناف من المنيو.');
      }

      if (!res.items || res.items.length === 0) {
        throw new Error('لم يتمكن الذكاء الاصطناعي من قراءة أي أصناف واضحة. يرجى تجربة صورة أوضح أو زاوية أقرب.');
      }

      setParsedItems(res.items);
      setDetectedCategories(res.categories);
      setStep('review');
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء مسح المنيو.');
      setStep('upload');
    }
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setParsedItems((prev) => prev.map((it) => ({ ...it, selected: checked })));
  };

  const handleToggleItem = (index: number) => {
    setParsedItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, selected: !it.selected } : it))
    );
  };

  const handleUpdateItemField = (
    index: number,
    field: keyof ParsedMenuItem,
    value: any
  ) => {
    setParsedItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, [field]: value } : it))
    );
  };

  const handleDeleteItem = (index: number) => {
    setParsedItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveAll = async () => {
    const selectedCount = parsedItems.filter((i) => i.selected).length;
    if (selectedCount === 0) {
      setErrorMessage('يرجى تحديد صنف واحد على الأقل للحفظ.');
      return;
    }

    setErrorMessage(null);
    setStep('saving');
    setSaveProgress({ current: 0, total: selectedCount });

    try {
      const res = await batchSaveParsedMenuItems(
        storeId,
        parsedItems,
        existingCategories,
        (current, total) => {
          setSaveProgress({ current, total });
        }
      );

      onItemsSaved(res.createdItems);
      setStep('done');
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ الأصناف في قاعدة البيانات.');
      setStep('review');
    }
  };

  const selectedCount = parsedItems.filter((i) => i.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in rtl text-right">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                <span>المنشئ الآلي للمنيو بالذكاء الاصطناعي</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Gemini Flash
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                ارفع صورة المنيو الورقي وسيتم استخراج الأصناف والأسعار وتصنيفها آلياً
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">{errorMessage}</p>
              {missingKeyError && (
                <div className="mt-2 p-2.5 rounded-xl bg-slate-950 border border-rose-900/40 text-slate-300 font-mono text-[11px] select-all">
                  npx wrangler secret put GEMINI_API_KEY
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                  compressed
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : 'border-slate-700 hover:border-amber-400/50 bg-slate-950/50 hover:bg-slate-950'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />

                {isCompressing ? (
                  <div className="py-8 flex flex-col items-center justify-center space-y-3">
                    <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                    <p className="text-sm font-bold text-slate-300">
                      جاري تجهيز الصورة وضغطها في المتصفح...
                    </p>
                  </div>
                ) : compressed ? (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="relative group">
                      <img
                        src={compressed.previewUrl}
                        alt="Menu preview"
                        className="w-48 h-48 object-cover rounded-2xl border-2 border-amber-500/40 shadow-xl"
                      />
                      <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <span className="text-xs text-white font-bold bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700">
                          تغيير الصورة
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">
                        {file?.name || 'صورة المنيو جاهزة'}
                      </p>
                      <p className="text-xs text-amber-400 mt-1 font-mono">
                        الحجم بعد الضغط: {compressed.sizeKB} KB (جاهز للرفع السريع)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-white">
                        اضغط هنا لاختيار صورة المنيو أو اسحبها إلى هنا
                      </p>
                      <p className="text-xs text-slate-400">
                        يدعم صور الجوال والكمبيوتر (JPG, PNG, WebP) مع تصغير تلقائي
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-amber-400 font-bold">📸 صورة واضحة</span>
                  <p className="text-slate-400 text-[11px]">
                    احرص على إضاءة جيدة وظهور الأسماء والأسعار بشكل مقروء.
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-amber-400 font-bold">⚡ استخراج فوري</span>
                  <p className="text-slate-400 text-[11px]">
                    الذكاء الاصطناعي يفرز الأقسام، الأسعار، والمكونات بثوانٍ.
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-amber-400 font-bold">🔒 تحكم كامل</span>
                  <p className="text-slate-400 text-[11px]">
                    تراجع وتعدل وتختار فقط ما يعجبك قبل الحفظ في المنيو.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Scanning */}
          {step === 'scanning' && (
            <div className="py-16 flex flex-col items-center justify-center space-y-6 text-center animate-fade-in">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-amber-500/10 border-2 border-amber-500 flex items-center justify-center text-amber-400 shadow-2xl animate-pulse">
                  <Sparkles className="w-12 h-12" />
                </div>
                <div className="absolute -inset-2 rounded-full border border-amber-500/20 animate-ping" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-lg font-black text-white">
                  جاري مسح المنيو وتحليل البيانات...
                </h3>
                <p className="text-xs text-slate-400">
                  يقوم نموذج Gemini Flash بقراءة النصوص، استخراج الأسعار بالريال، وفرز الأصناف حسب أقسامها تلقائياً.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Review & Edit */}
          {step === 'review' && (
            <div className="space-y-5 animate-fade-in">
              {/* Stats Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-300">
                    تم استخراج{' '}
                    <strong className="text-amber-400 font-mono text-sm">
                      {parsedItems.length}
                    </strong>{' '}
                    صنفاً في{' '}
                    <strong className="text-amber-400 font-mono text-sm">
                      {detectedCategories.length}
                    </strong>{' '}
                    أقسام
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={selectedCount === parsedItems.length && parsedItems.length > 0}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span>تحديد الكل ({selectedCount})</span>
                  </label>
                </div>
              </div>

              {/* Items Table/List */}
              <div className="space-y-3">
                {parsedItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className={`p-4 rounded-2xl border transition-all ${
                      item.selected
                        ? 'bg-slate-950/80 border-slate-700/80 shadow-md'
                        : 'bg-slate-950/30 border-slate-800/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={!!item.selected}
                        onChange={() => handleToggleItem(idx)}
                        className="rounded accent-amber-500 w-4 h-4 mt-2.5 cursor-pointer flex-shrink-0"
                      />

                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                        {/* Name */}
                        <div className="sm:col-span-5">
                          <label className="text-[10px] text-slate-400 font-bold block mb-1">
                            اسم الصنف
                          </label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) =>
                              handleUpdateItemField(idx, 'name', e.target.value)
                            }
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-white focus:border-amber-400 outline-none"
                            placeholder="اسم الوجبة أو الخدمة"
                          />
                        </div>

                        {/* Category */}
                        <div className="sm:col-span-3">
                          <label className="text-[10px] text-slate-400 font-bold block mb-1">
                            القسم
                          </label>
                          <input
                            type="text"
                            value={item.category}
                            onChange={(e) =>
                              handleUpdateItemField(idx, 'category', e.target.value)
                            }
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-amber-300 focus:border-amber-400 outline-none"
                            placeholder="القسم"
                          />
                        </div>

                        {/* Price */}
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-slate-400 font-bold block mb-1">
                            السعر (ر.س)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={item.price}
                            onChange={(e) =>
                              handleUpdateItemField(
                                idx,
                                'price',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-black text-emerald-400 font-mono focus:border-amber-400 outline-none"
                            placeholder="0"
                          />
                        </div>

                        {/* Type */}
                        <div className="sm:col-span-2 flex items-center justify-between gap-2 pt-4 sm:pt-0">
                          <select
                            value={item.item_type}
                            onChange={(e) =>
                              handleUpdateItemField(
                                idx,
                                'item_type',
                                e.target.value as any
                              )
                            }
                            className="px-2 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-bold text-slate-300 focus:border-amber-400 outline-none"
                          >
                            <option value="product">منتج/طعام</option>
                            <option value="service">خدمة/موعد</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleDeleteItem(idx)}
                            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                            title="حذف هذا الصنف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Description (Optional) */}
                    {item.description && (
                      <div className="mt-2 pr-7">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            handleUpdateItemField(idx, 'description', e.target.value)
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400 focus:border-amber-400 outline-none"
                          placeholder="وصف إضافي أو مكونات"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: Saving */}
          {step === 'saving' && (
            <div className="py-16 flex flex-col items-center justify-center space-y-6 text-center animate-fade-in">
              <Loader2 className="w-16 h-16 text-amber-400 animate-spin" />
              <div className="space-y-2 max-w-sm">
                <h3 className="text-lg font-black text-white">
                  جاري حفظ الأصناف في قاعدة البيانات...
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  تم حفظ {saveProgress.current} من أصل {saveProgress.total} صنف عبر التذكرة الآمنة
                </p>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-3">
                  <div
                    className="bg-amber-500 h-full transition-all duration-300"
                    style={{
                      width: `${
                        saveProgress.total > 0
                          ? (saveProgress.current / saveProgress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Done */}
          {step === 'done' && (
            <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-xl">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-black text-white">
                تم بنجاح حفظ المنيو وإضافته لمتجرك! 🎉
              </h3>
              <p className="text-xs text-slate-400">
                ستظهر كافة الأصناف الجديدة الآن في قائمة المنتجات.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 sm:p-6 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between gap-3">
          {step === 'upload' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-800 transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={!compressed || isCompressing}
                onClick={handleStartScan}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>استخراج الأصناف بالذكاء الاصطناعي</span>
              </button>
            </>
          )}

          {step === 'review' && (
            <>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-800 transition"
              >
                إعادة الرفع
              </button>
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={handleSaveAll}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition"
              >
                <Check className="w-4 h-4" />
                <span>اعتماد وحفظ ({selectedCount}) صنف بالمنيو</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

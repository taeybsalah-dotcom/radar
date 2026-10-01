import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowLeft, ShieldCheck, Store, Gift, Smartphone, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { LoyaltyService } from '../lib/supabase';

interface PartnerPublicLandingProps {
  slug: string;
}

export const PartnerPublicLanding: React.FC<PartnerPublicLandingProps> = ({ slug }) => {
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<{
    display_name: string;
    slug: string;
    region: string;
    referral_code: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resolvePartner = async () => {
      setLoading(true);
      setError(null);

      try {
        const cleanSlug = (slug || '').trim().toLowerCase();

        // 1. Direct query via LoyaltyService
        const allPartners = await LoyaltyService.getAllPartners();
        const found = allPartners.find((p: any) => (p.slug || '').toLowerCase() === cleanSlug);

        if (found) {
          const refCode = found.affiliates?.referral_code || found.referral_code || 'r1001';
          setPartner({
            display_name: found.display_name,
            slug: found.slug,
            region: found.region || 'عام',
            referral_code: refCode,
          });
          setLoading(false);
          return;
        }

        // 2. Fallback to API if available
        const res = await fetch(`/api/partner/resolve?slug=${encodeURIComponent(cleanSlug)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.partner) {
            setPartner(data.partner);
            setLoading(false);
            return;
          }
        }

        setError('صفحة الشريك غير متوفرة');
        setPartner(null);
      } catch (err: any) {
        console.error('[PartnerPublicLanding] Resolve error:', err);
        setError('حدث خطأ في تحميل الصفحة');
      } finally {
        setLoading(false);
      }
    };

    resolvePartner();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-spin">
          ⚡
        </div>
        <p className="text-xs text-slate-400 font-medium">جاري تجهيز تجربة الشريك المعتمد...</p>
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-3xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto text-2xl">
            🔍
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-white">الصفحة غير موجودة أو انتهت صلاحيتها</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              الرابط الذي قمت بفتحه غير مسجل كشريك نشط في منصة رادار.
            </p>
          </div>
          <a
            href="/join"
            className="inline-flex items-center justify-center w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
          >
            الانتقال إلى صفحة التسجيل العامة
          </a>
        </div>
      </div>
    );
  }

  const joinUrl = `/join?ref=${encodeURIComponent(partner.referral_code)}`;

  return (
    <div className="max-w-3xl mx-auto py-8 sm:py-16 px-4 space-y-12 animate-fade-in" dir="rtl">
      {/* 1. Partner Verification Badge & Hero Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 px-4 py-1.5 rounded-full text-xs font-bold text-amber-400 shadow-lg shadow-amber-500/10">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>مقدم لك بعناية من الشريك المعتمد: <strong className="text-white">{partner.display_name}</strong></span>
          {partner.region && partner.region !== 'عام' && (
            <span className="text-slate-400 text-[11px]">({partner.region})</span>
          )}
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight tracking-tight">
          ضاعف مبيعات متجرك وزيارات عملائك مع <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">منظومة RADAR</span>
        </h1>

        <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
          نظام ولاء متكامل، بطاقات ولاء ذكية بدون تطبيقات معقدة، شاشة كاشير سريعة، واستعادة تلقائية للعملاء المنقطعين لزيادة عوائد متجرك.
        </p>

        {/* Primary CTA Button */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={joinUrl}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/25 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>ابدأ تجربة متجرك الآن مجاناً</span>
            <ArrowLeft className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* 2. Platform Value Props Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Gift className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">نظام ولاء ونقاط ذكي</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            مستويات عضوية (Tiers) ومكافآت تدفع العميل للعودة مراراً وتكرار الشراء بدلاً من حرق أرباحك بالخصومات.
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">بطاقة عميل رقمية PWA فورية</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            عميلك يفتح بطاقة متجرك من المتصفح بدون تحميل تطبيقات ثقيلة، ويضيفها للشاشة الرئيسية بضغطة واحدة.
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Store className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">شاشة كاشير فائقة السرعة</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            مسح فوري لباركود العميل وصرف الخصومات والجوائز في أجزاء من الثانية بدون تعطيل طابور الدفع.
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">استعادة الزبائن المنقطعين</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            تنبيهات تلقائية للعملاء الذين لم يزوروك منذ شهر وأدوات ذكية لإعادتهم إلى متجرك بمبيعات متجددة.
          </p>
        </div>
      </div>

      {/* 3. Bottom Trust Guarantee & Direct CTA */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
        <h3 className="text-lg font-bold text-white">انضم لأكثر من 50+ علامة تجارية تثق برادار</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          التسجيل يستغرق دقيقة واحدة فقط. سيتواصل معك فريقنا المختص لتجهيز هويتك وتفعيل متجرك فوراً.
        </p>

        <a
          href={joinUrl}
          className="inline-flex items-center justify-center px-8 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 gap-2"
        >
          <span>سجّل متجرك مع كود الشريك: <strong className="font-mono">{partner.referral_code}</strong></span>
          <ArrowLeft className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};

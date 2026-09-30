import { authenticatePartner } from './_auth.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    const auth = await authenticatePartner(req, res);
    if (!auth) return;

    const { partner } = auth;
    const partnerName = partner.display_name;
    const refCode = partner.referral_code;

    // Build Public Referral Link
    const host = req.headers?.host || 'radar.sa';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const publicLink = `${protocol}://${host}/${partner.slug}`;
    const directJoinLink = `${protocol}://${host}/join?ref=${refCode}`;

    // 1. Five Core Sales Kit Messages (Section 37)
    const salesKit = [
      {
        id: 'msg-cashier',
        title: 'رسالة الكاشير والعميل العائد 🏪',
        tag: 'CASHIER_LOST',
        headline: 'كم عميل يجيك مرة ويختفي؟',
        body: `كم عميل يجيك مرة ويختفي؟ 🤔\n\nأغلب المحلات تركز على جلب زبون جديد وتنسى الزبون اللي اشترى وراح.\nمع منصة RADAR للولاء الذكي، تقدر تجمع بيانات عملائك وتخليهم يرجعون لك بدون ما تدفع مبالغ ضخمة على الإعلانات.\n\nجرّب بنفسك وشوف كيف يشتغل لمتجرك:\n${publicLink}\n\nأخوك: ${partnerName}`,
      },
      {
        id: 'msg-app',
        title: 'رسالة التطبيق والهوية الخاصة 📱',
        tag: 'BRAND_EXPERIENCE',
        headline: 'تخيل عميلك يفتح تجربة باسم محلك بدون ما تبني تطبيق من الصفر',
        body: `تخيل عميلك يفتح تجربة وبطاقة ولاء باسم وشعار محلك في ثواني بدون ما تدفع عشرات الآلاف لبناء تطبيق من الصفر! 🚀\n\nنظام RADAR يعطيك PWA فورية لكاشيرك وعملائك برابط وهوية خاصة.\n\nاطلع على التفاصيل وابدأ هنا:\n${publicLink}\n\nتحياتي، ${partnerName}`,
      },
      {
        id: 'msg-loyalty',
        title: 'رسالة قيمة الولاء والخصم 💎',
        tag: 'VALUE_VS_DISCOUNT',
        headline: 'مو كل عميل يحتاج خصم... بعضهم يحتاج سبب يرجع',
        body: `مو كل عميل يحتاج خصم... بعضهم يحتاج سبب يرجع! ✨\n\nالخصومات تحرق هامش ربحك، لكن نظام النقاط والمستويات (Tiers) يخلي العميل يرتبط بمحلك ويتحمس يجمع نقاط ويكرر زيارته.\n\nشوف النظام وشلون يفيد نشاطك:\n${publicLink}\n\n${partnerName} — رادار لخدمات التجار`,
      },
      {
        id: 'msg-lost-customers',
        title: 'رسالة استعادة العملاء المنقطعين ⏰',
        tag: 'RETENTION',
        headline: 'عندك عملاء ما شفتهم من شهر؟',
        body: `عندك عملاء كانوا يجونك دايماً وفجأة انقطعوا من شهر؟ 📉\n\nنظام رادار ينبهك عليهم ويساعدك ترسل لهم عروض حصرية وترجعهم لك بضغطة زر.\n\nسجل متجرك وجرب التجربة:\n${publicLink}\n\nمستشارك: ${partnerName}`,
      },
      {
        id: 'msg-positioning',
        title: 'رسالة التموضع الاستراتيجي ⚡',
        tag: 'COMPETITIVE',
        headline: 'الكاشير يعرف كم بعت اليوم. RADAR يساعدك تعرف مين تبغى يرجع بكرة',
        body: `الكاشير يعرف كم بعت اليوم... لكن RADAR يساعدك تعرف مين تبغى يرجع بكرة! 🎯\n\nحوّل كل عملية بيع إلى علاقة مستمرة وزبون وفيّ.\n\nابدأ تجربتك الآن:\n${publicLink}\n\n${partnerName}`,
      },
    ];

    // 2. Status-Based Follow-up Templates (Section 39)
    const statusTemplates = {
      trial: {
        title: 'متابعة تجربة المتجر (Trial Follow-up)',
        body: `مرحباً بك! 👋\nحبيت أطمئن كيف كانت تجربتك المبدئية مع منصة RADAR؟\nهل جربت إنشاء بطاقة الولاء أو مسح أول باركود كاشير؟ إذا عندك أي استفسار أنا بالخدمة لمساعدتك خطوة بخطوة 🚀\n\n${partnerName}`,
      },
      pending_payment: {
        title: 'تذكير التفعيل والاعتماد (Payment / Setup Reminder)',
        body: `أهلاً بك عزيزي،\nطلب متجركم معتمد وجاهز للانطلاق على رادار. باقي فقط خطوة الاعتماد النهائي لنفعل لكم الربط الكامل وهوية المتجر الخاصة.\n\nيسعدني مساعدتك لإتمام التفعيل في أي وقت:\n${directJoinLink}\n\n${partnerName}`,
      },
      no_response: {
        title: 'إعادة فتح التواصل (No Response Check-in)',
        body: `السلام عليكم! عساك بخير.\nأعرف أن جدولك مشغول بإدارة المتجر. فقط أردت التذكير أن نظام رادار جاهز لتشغيل بطاقات ولاء زبائنك لزيادة مبيعات هذا الشهر.\n\nهل يناسبك ننسق اتصال سريع لمدة 3 دقائق؟\n\nأخوك: ${partnerName}`,
      },
      paid: {
        title: 'تهنئة التأسيس والانطلاق (Welcome Onboard)',
        body: `ألف مبروك انضمامكم لشبكة رادار! 🎉\nتم تأسيس وربط متجركم بنجاح. سنكون معك في كل خطوة لضمان مضاعفة زيارات عملائك ومبيعاتك.\n\nبالتوفيق والنجاح الدائم!\n${partnerName}`,
      },
      active: {
        title: 'متابعة الأداء الدوري (Active Relationship)',
        body: `مرحباً بك! أتمنى أن تكون نتائج برنامج الولاء ممتازة هذا الأسبوع.\nإذا محتاج أي مساعدة في ضبط عروض جديدة أو حملات استعادة الزبائن، أنا في خدمتك دائماً.\n\n${partnerName} — رادار`,
      },
    };

    // 3. Logo Pitch Tool Template (Section 40)
    const logoPitch = {
      title: 'أداة أرسل شعارك (Logo Pitch)',
      headline: 'أرسل لي اسم محلك وشعاره، وأوريك كيف ممكن تكون تجربة RADAR باسم محلك',
      body: `أرسل لي اسم محلك وشعاره 🎨\n\nوأنا بجهّز لك نموذج حي يعرض كيف تظهر تجربة وبطاقة ولاء RADAR بهوية وألوان محلك قبل ما تشترك!\n\nشوف الرابط وجرب:\n${publicLink}\n\n${partnerName}`,
    };

    return res.status(200).json({
      success: true,
      partner: {
        name: partnerName,
        slug: partner.slug,
        referral_code: refCode,
        public_link: publicLink,
        direct_join_link: directJoinLink,
      },
      sales_kit: salesKit,
      status_templates: statusTemplates,
      logo_pitch: logoPitch,
    });
  } catch (err: any) {
    console.error('[api/partner/assets] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ في استرجاع أدوات البيع',
    });
  }
}

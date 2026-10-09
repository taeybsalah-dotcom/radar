import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove window.open from handleConfirmServiceBooking
code = code.replace(
    "const whatsappUrl = LoyaltyService.generateWhatsAppBookingUrl(merchantPhone, createdBooking);\n        window.open(whatsappUrl, '_blank');",
    ""
)

# 2. Change submit button text
code = code.replace(
    "<span>{bookingSubmitting ? 'جاري تسجيل الموعد...' : 'تأكيد الحجز والإرسال عبر واتساب 💬'}</span>",
    "<span>{bookingSubmitting ? 'جاري تسجيل الموعد...' : 'تأكيد الحجز المباشر ✅'}</span>"
)

# 3. Modify the booking success screen
success_screen_old = """                  <button
                    type="button"
                    onClick={() => {
                      const merchantPhone = store.manager_contact || '';
                      const url = LoyaltyService.generateWhatsAppBookingUrl(merchantPhone, bookingSuccessData);
                      window.open(url, '_blank');
                    }}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>فتح محادثة الواتساب مع المتجر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBookingSuccessData(null);
                      setBookingStep(4);
                    }}
                    className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                  >
                    حجز موعد آخر
                  </button>"""

success_screen_new = """                  <button
                    type="button"
                    onClick={() => {
                      setBookingSuccessData(null);
                      setBookingStep(4);
                    }}
                    className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                  >
                    حجز موعد آخر
                  </button>"""

code = code.replace(success_screen_old, success_screen_new)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS BOOKING PATCH")

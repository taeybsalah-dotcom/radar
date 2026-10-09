import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

bad_button = """                  <button
                    type="button"
                    onClick={() => {
                      const merchantPhone = store.manager_contact || '0577371780';
                      const url = LoyaltyService.generateWhatsAppBookingUrl(merchantPhone, bookingSuccessData);
                      window.open(url, '_blank');
                    }}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>فتح محادثة الواتساب مع المتجر 💬</span>
                  </button>"""

code = code.replace(bad_button, "")

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS BUTTON REMOVAL")

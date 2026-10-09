import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Remove the booking WhatsApp button
code = re.sub(
    r'<button[^>]*?onClick=\{\(\) => \{\s*const merchantPhone = store\.manager_contact \|\|.*?window\.open\(url, \'_blank\'\);\s*\}\}[^>]*?>.*?فتح محادثة الواتساب.*?💬.*?</button>',
    '',
    code,
    flags=re.DOTALL
)

# Replace the Order WhatsApp button with a generic tracking button
old_order_btn = r'<button[^>]*?onClick=\{\(\) => \{\s*setOrderSuccessPayload\(null\);\s*setShowPastOrdersModal\(true\);\s*\}\}[^>]*?>.*?إعادة فتح المحادثة على الواتساب 💬.*?</button>'
new_order_btn = """<button
                type="button"
                onClick={() => {
                  setOrderSuccessPayload(null);
                  setShowPastOrdersModal(true);
                }}
                className="w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-500 shadow-xl flex items-center justify-center gap-2 transition"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>تتبع حالة الطلب 📋</span>
              </button>"""

code = re.sub(old_order_btn, new_order_btn, code, flags=re.DOTALL)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS WA BUTTONS GONE")

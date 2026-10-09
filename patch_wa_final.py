import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove the window.open
# I will use a regex to remove the whatsappUrl generation and window.open for Bookings ONLY
code = re.sub(
    r"const whatsappUrl = LoyaltyService\.generateWhatsAppBookingUrl\(merchantPhone, createdBooking\);\s*window\.open\(whatsappUrl, '_blank'\);",
    "",
    code
)

# 2. Remove the button from the success screen
# The button contains `<span>فتح محادثة الواتساب مع المتجر 💬</span>`
code = re.sub(
    r'<button[^>]*?onClick=\{\(\) => \{\s*const merchantPhone = store\.manager_contact \|\| \'\';\s*const url = LoyaltyService\.generateWhatsAppBookingUrl\(merchantPhone, bookingSuccessData\);\s*window\.open\(url, \'_blank\'\);\s*\}\}[^>]*?>\s*<MessageCircle className="w-4 h-4" />\s*<span>فتح محادثة الواتساب مع المتجر 💬</span>\s*</button>',
    "",
    code,
    flags=re.DOTALL
)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS WHATSAPP REMOVAL")

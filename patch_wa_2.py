import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove window.open from handleConfirmServiceBooking
code = code.replace(
    "const whatsappUrl = LoyaltyService.generateWhatsAppBookingUrl(merchantPhone, createdBooking);\n        window.open(whatsappUrl, '_blank');",
    ""
)

# 2. Modify the booking success screen. Wait, what did my previous script do? It replaced the `success_screen_old` with `success_screen_new`. Did it succeed?
# Let's check if "فتح محادثة الواتساب مع المتجر" is still in the file.

import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "          duration_minutes: selectedBookingService.duration_minutes || 30,",
    ""
)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS CLEAN WALLET PAYLOAD")

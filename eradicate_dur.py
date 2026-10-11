import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = re.sub(r'duration_minutes:\s*selectedBookingService\.duration_minutes\s*\|\|\s*30,\n?', '', code)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS ERADICATE DURATION_MINUTES")

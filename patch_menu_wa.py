import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Remove Whatsapp from Menu submit
code = re.sub(
    r"const whatsappUrl = LoyaltyService\.generateWhatsAppOrderUrl\(merchantPhone, payload\);\s*window\.open\(whatsappUrl, '_blank'\);",
    "",
    code
)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS")

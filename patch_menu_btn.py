import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

btn_pattern = r'<button[^>]*?>\s*<MessageCircle className="w-4 h-4 fill-current" />\s*<span>إعادة فتح المحادثة على الواتساب 💬</span>\s*</button>'
code = re.sub(btn_pattern, "", code, flags=re.DOTALL)

# And make sure "إرسال الطلب عبر واتساب" becomes "إرسال الطلب المباشر"
btn2_pattern = r"<span>إرسال الطلب عبر واتساب 💬</span>"
code = re.sub(btn2_pattern, "<span>إرسال الطلب المباشر ✅</span>", code)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS")

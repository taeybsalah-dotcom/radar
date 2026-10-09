import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "} catch (err) {\n      console.error('Booking creation error:', err);\n    } finally {",
    "} catch (err: any) {\n      console.error('Booking creation error:', err);\n      alert(err.message || 'فشل تسجيل الحجز، يرجى المحاولة مرة أخرى.');\n    } finally {"
)

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS ALERT")

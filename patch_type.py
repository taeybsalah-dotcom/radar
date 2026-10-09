import re

with open('src/components/CashierPOS.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "const updateBookingStatus = async (bookingId: string, status: string) => {",
    "const updateBookingStatus = async (bookingId: string, status: 'completed' | 'cancelled' | 'confirmed' | 'no_show') => {"
)

with open('src/components/CashierPOS.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS TYPE FIX")

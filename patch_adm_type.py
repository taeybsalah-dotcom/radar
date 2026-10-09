import re

with open('src/components/StoreAdmin.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "const handleUpdateBookingStatus = async (bookingId: string, status: 'confirmed' | 'completed' | 'cancelled' | 'no_show') => {",
    "const handleUpdateBookingStatus = async (bookingId: string, status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show') => {"
)

with open('src/components/StoreAdmin.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS TYPE FIX ADMIN")

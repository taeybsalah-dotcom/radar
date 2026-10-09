import re

with open('src/components/StoreAdmin.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

code = re.sub(
    r"newStatus:\s*'confirmed'\s*\|\s*'completed'\s*\|\s*'cancelled'\s*\|\s*'no_show'",
    "newStatus: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'",
    code
)

with open('src/components/StoreAdmin.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS TYPE FIX ADMIN REAL")

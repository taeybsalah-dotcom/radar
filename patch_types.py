import re

with open('src/types.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';",
    "status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';"
)

with open('src/types.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS TYPE FIX")

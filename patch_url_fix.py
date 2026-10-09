import re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = re.sub(
    r"statusOverride\?:\s*'confirmed'\s*\|\s*'completed'\s*\|\s*'cancelled'\s*\|\s*'no_show'",
    "statusOverride?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'",
    code
)

code = re.sub(
    r"statusOverride\?:\s*'confirmed'\s*\|\s*'completed'\s*\|\s*'cancelled'\s*\|\s*'no_show'",
    "statusOverride?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'",
    code
)

with open('src/lib/supabase.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS TYPE FIX URL")

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(6950, 6970):
    if i < len(lines):
        print(f"{i+1}: {lines[i].rstrip()}")

with open('src/components/StoreAdmin.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = max(0, 4840)
end = min(len(lines), 4855)
for i in range(start, end):
    print(f"{i+1}: {lines[i].rstrip()}")

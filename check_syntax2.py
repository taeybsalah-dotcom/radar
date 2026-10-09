with open('src/components/CashierPOS.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(1065, 1095):
    if i < len(lines):
        print(f"{i+1}: {lines[i].rstrip()}")

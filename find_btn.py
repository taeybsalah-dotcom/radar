with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "فتح محادثة الواتساب" in line or "إعادة فتح" in line:
        start = max(0, i - 15)
        end = min(len(lines), i + 15)
        print(f"--- MATCH AT LINE {i+1} ---")
        for j in range(start, end):
            print(f"{j+1}: {lines[j].rstrip()}")

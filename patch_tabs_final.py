import re

with open('src/components/CustomerWallet.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Remove the tabs header div
code = re.sub(
    r'<div className="p-2 bg-slate-950/80 border-b border-slate-800 grid grid-cols-2 gap-1\.5 shrink-0">.*?</div>\s*<div className="p-4 overflow-y-auto space-y-3\.5 flex-1 text-right">',
    '<div className="p-4 overflow-y-auto space-y-3.5 flex-1 text-right">',
    code,
    flags=re.DOTALL
)

# Replace {pastModalTab === 'orders' && ( <> ... </> )}  Wait, we just need to keep what's inside if possible, but actually we can just leave the JS condition `{pastModalTab === 'orders' && (` because it defaults to 'orders' and user cannot change it now since tabs are gone! 
# So just removing the tabs HTML is enough!

with open('src/components/CustomerWallet.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS")

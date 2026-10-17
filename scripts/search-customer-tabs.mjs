import fs from 'fs';

const content = fs.readFileSync('src/components/CustomerWallet.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes("activeTab === 'menu'") || line.includes("activeTab === 'services'") || line.includes("activeTab === 'pass'") || line.includes("activeTab === 'perks'") || line.includes("activeTab === 'tiers'") || line.includes("activeTab === 'tickets'")) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

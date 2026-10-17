import fs from 'fs';

const content = fs.readFileSync('src/components/CustomerWallet.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes("setActiveTab('pass')") || line.includes("setActiveTab('services')") || line.includes("setActiveTab('perks')") || line.includes("setActiveTab('menu')")) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

import fs from 'fs';

const content = fs.readFileSync('src/components/StoreAdmin.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes("activeTab === 'settings'") || line.includes("setActiveTab('settings')") || line.includes('catalog_enabled') || line.includes('fulfillment_settings')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

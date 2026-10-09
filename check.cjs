const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'missing',
  process.env.VITE_SUPABASE_ANON_KEY || 'missing'
);

async function check() {
  const { data, error } = await supabase.from('catalog_items').select('*').limit(1);
  console.log('Error:', error);
  console.log('Data:', data);
}
check();

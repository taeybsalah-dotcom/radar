import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { generateSignedApplePass } from './src/lib/applePassSigner';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = (env.VITE_SUPABASE_URL || 'https://kspfiijorengpckdlymx.supabase.co').replace(/\/$/, '');
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  return {
    plugins: [
      react(),
      {
        name: 'apple-wallet-pass-dev-server',
        configureServer(server) {
          server.middlewares.use('/api/wallet/apple-pass', async (req, res) => {
            try {
              const reqUrl = new URL(req.url || '', 'http://localhost:3000');
              const storeIdOrSlug = reqUrl.searchParams.get('store_id') || reqUrl.searchParams.get('store') || '';
              const customerIdOrPhone = reqUrl.searchParams.get('customer_id') || reqUrl.searchParams.get('phone') || '';

              if (!storeIdOrSlug) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing store_id parameter' }));
                return;
              }

              // 1. Fetch Store
              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeIdOrSlug);
              const storeQuery = isUuid ? `id=eq.${storeIdOrSlug}` : `slug=eq.${encodeURIComponent(storeIdOrSlug)}`;
              const storeRes = await fetch(
                `${supabaseUrl}/rest/v1/stores?${storeQuery}&select=id,slug,name,primary_color,secondary_color,points_per_riyal,phone,logo_url&limit=1`,
                {
                  headers: {
                    apikey: supabaseKey,
                    Authorization: `Bearer ${supabaseKey}`,
                  },
                }
              );
              const storeList: any = await storeRes.json();
              const store = storeList?.[0];
              if (!store) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Store not found' }));
                return;
              }

              // 2. Fetch Customer
              let customer: any = { id: 'guest', name: 'عميل مميز', points_balance: 0 };
              if (customerIdOrPhone) {
                const isCustUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerIdOrPhone);
                const custQuery = isCustUuid
                  ? `id=eq.${customerIdOrPhone}`
                  : `phone=eq.${encodeURIComponent(customerIdOrPhone)}&store_id=eq.${store.id}`;
                const custRes = await fetch(
                  `${supabaseUrl}/rest/v1/store_customers?${custQuery}&select=id,name,phone,points_balance&limit=1`,
                  {
                    headers: {
                      apikey: supabaseKey,
                      Authorization: `Bearer ${supabaseKey}`,
                    },
                  }
                );
                const custList: any = await custRes.json();
                if (custList?.[0]) customer = custList[0];
              }

              // 3. Fetch Platform Wallet Credentials
              const intRes = await fetch(
                `${supabaseUrl}/rest/v1/platform_integrations?select=apple_wallet_enabled,apple_pass_type_id,apple_team_id,apple_cert_p12_base64,apple_cert_password&order=created_at.desc&limit=1`,
                {
                  headers: {
                    apikey: supabaseKey,
                    Authorization: `Bearer ${supabaseKey}`,
                  },
                }
              );
              const intList: any = await intRes.json();
              const intData = intList?.[0];

              if (!intData || !intData.apple_wallet_enabled) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Apple Wallet is disabled in Platform Integrations' }));
                return;
              }

              if (!intData.apple_cert_p12_base64 || !intData.apple_pass_type_id || !intData.apple_team_id) {
                res.writeHead(422, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Apple PassKit certificate or identifiers missing' }));
                return;
              }

              // 4. Generate Pass
              const pkpassBytes = generateSignedApplePass({
                store,
                customer,
                credentials: {
                  passTypeId: intData.apple_pass_type_id,
                  teamId: intData.apple_team_id,
                  p12Base64: intData.apple_cert_p12_base64,
                  p12Password: intData.apple_cert_password,
                },
              });

              res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.pkpass',
                'Content-Disposition': `attachment; filename="${store.slug || 'loyalty'}_pass.pkpass"`,
                'Cache-Control': 'no-cache',
              });
              res.end(Buffer.from(pkpassBytes));
            } catch (err: any) {
              console.error('Dev server Apple Pass generation error:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message || 'Internal error' }));
            }
          });
        },
      },
    ],
    server: {
      port: 3000,
      open: true,
    },
  };
});

// ==============================================================================
// RADAR LOYALTY ENGINE — UNIFIED API ROUTER
// Single Vercel serverless function dispatching all /api/* routes.
// Required to stay within Vercel Hobby plan's 12-function limit.
// All handlers live in src/api-handlers/ to avoid Vercel treating them
// as independent serverless functions.
// ==============================================================================

import handlerIcon from '../src/api-handlers/icon';
import handlerLeadSubmit from '../src/api-handlers/lead-submit';
import handlerManifest from '../src/api-handlers/manifest';
import handlerTrack from '../src/api-handlers/track';
import handlerAdminLeads from '../src/api-handlers/admin/leads';
import handlerAdminPartners from '../src/api-handlers/admin/partners';
import handlerAdminStoresSummary from '../src/api-handlers/admin/stores-summary';
import handlerAnalyticsCustomers from '../src/api-handlers/analytics/customers';
import handlerAnalyticsOperations from '../src/api-handlers/analytics/operations';
import handlerAnalyticsOverview from '../src/api-handlers/analytics/overview';
import handlerAnalyticsPartner from '../src/api-handlers/analytics/partner';
import handlerAnalyticsRetention from '../src/api-handlers/analytics/retention';
import handlerBillingCancel from '../src/api-handlers/billing/cancel';
import handlerBillingCheckout from '../src/api-handlers/billing/checkout';
import handlerBillingPlans from '../src/api-handlers/billing/plans';
import handlerBillingSubscription from '../src/api-handlers/billing/subscription';
import handlerBillingWebhook from '../src/api-handlers/billing/webhook';
import handlerCustomerNotifications from '../src/api-handlers/customer/notifications';
import handlerCustomerOrders from '../src/api-handlers/customer/orders';
import handlerCustomerProfile from '../src/api-handlers/customer/profile';
import handlerCustomerReservations from '../src/api-handlers/customer/reservations';
import handlerCustomerRewards from '../src/api-handlers/customer/rewards';
import handlerMerchantCashier from '../src/api-handlers/merchant/cashier';
import handlerMerchantKpis from '../src/api-handlers/merchant/kpis';
import handlerMerchantOnboarding from '../src/api-handlers/merchant/onboarding';
import handlerMerchantOrders from '../src/api-handlers/merchant/orders';
import handlerMerchantReservations from '../src/api-handlers/merchant/reservations';
import handlerMerchantSettings from '../src/api-handlers/merchant/settings';
import handlerMerchantOnboardingComplete from '../src/api-handlers/merchant/onboarding/complete';
import handlerMerchantOnboardingIndex from '../src/api-handlers/merchant/onboarding/index';
import handlerMerchantOnboardingStart from '../src/api-handlers/merchant/onboarding/start';
import handlerMerchantOnboardingStep from '../src/api-handlers/merchant/onboarding/step';
import handlerPartnerAssets from '../src/api-handlers/partner/assets';
import handlerPartnerBonuses from '../src/api-handlers/partner/bonuses';
import handlerPartnerCommissions from '../src/api-handlers/partner/commissions';
import handlerPartnerLeads from '../src/api-handlers/partner/leads';
import handlerPartnerMe from '../src/api-handlers/partner/me';
import handlerPartnerResolve from '../src/api-handlers/partner/resolve';
import handlerPartnerStats from '../src/api-handlers/partner/stats';
import handlerReactivationCampaigns from '../src/api-handlers/reactivation/campaigns';
import handlerReactivationCustomers from '../src/api-handlers/reactivation/customers';
import handlerReactivationSegments from '../src/api-handlers/reactivation/segments';
import handlerReactivationSend from '../src/api-handlers/reactivation/send';
import handlerReactivationTemplates from '../src/api-handlers/reactivation/templates';

declare const process: any;

const routes: Record<string, (req: any, res: any) => any> = {
  '/api/icon': handlerIcon,
  '/api/lead-submit': handlerLeadSubmit,
  '/api/manifest': handlerManifest,
  '/manifest.json': handlerManifest,
  '/api/track': handlerTrack,
  '/api/admin/leads': handlerAdminLeads,
  '/api/admin/partners': handlerAdminPartners,
  '/api/admin/stores-summary': handlerAdminStoresSummary,
  '/api/analytics/customers': handlerAnalyticsCustomers,
  '/api/analytics/operations': handlerAnalyticsOperations,
  '/api/analytics/overview': handlerAnalyticsOverview,
  '/api/analytics/partner': handlerAnalyticsPartner,
  '/api/analytics/retention': handlerAnalyticsRetention,
  '/api/billing/cancel': handlerBillingCancel,
  '/api/billing/checkout': handlerBillingCheckout,
  '/api/billing/plans': handlerBillingPlans,
  '/api/billing/subscription': handlerBillingSubscription,
  '/api/billing/webhook': handlerBillingWebhook,
  '/api/customer/notifications': handlerCustomerNotifications,
  '/api/customer/orders': handlerCustomerOrders,
  '/api/customer/profile': handlerCustomerProfile,
  '/api/customer/reservations': handlerCustomerReservations,
  '/api/customer/rewards': handlerCustomerRewards,
  '/api/merchant/cashier': handlerMerchantCashier,
  '/api/merchant/kpis': handlerMerchantKpis,
  '/api/merchant/onboarding': handlerMerchantOnboarding,
  '/api/merchant/orders': handlerMerchantOrders,
  '/api/merchant/reservations': handlerMerchantReservations,
  '/api/merchant/settings': handlerMerchantSettings,
  '/api/merchant/onboarding/complete': handlerMerchantOnboardingComplete,
  '/api/merchant/onboarding/index': handlerMerchantOnboardingIndex,
  '/api/merchant/onboarding/start': handlerMerchantOnboardingStart,
  '/api/merchant/onboarding/step': handlerMerchantOnboardingStep,
  '/api/partner/assets': handlerPartnerAssets,
  '/api/partner/bonuses': handlerPartnerBonuses,
  '/api/partner/commissions': handlerPartnerCommissions,
  '/api/partner/leads': handlerPartnerLeads,
  '/api/partner/me': handlerPartnerMe,
  '/api/partner/resolve': handlerPartnerResolve,
  '/api/partner/stats': handlerPartnerStats,
  '/api/reactivation/campaigns': handlerReactivationCampaigns,
  '/api/reactivation/customers': handlerReactivationCustomers,
  '/api/reactivation/segments': handlerReactivationSegments,
  '/api/reactivation/send': handlerReactivationSend,
  '/api/reactivation/templates': handlerReactivationTemplates,
};

export default async function handler(req: any, res: any) {
  // Normalize path: strip query string, trailing slash (except root)
  const url = req.url || '';
  const pathname = url.split('?')[0].replace(/\/$/, '') || '/';

  const routeHandler = routes[pathname];
  if (routeHandler) {
    return routeHandler(req, res);
  }

  return res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    error: 'API route not found',
  });
}

// ==============================================================================
// 🛡️ RADAR ANALYTICS & INTELLIGENCE — STAGE 12: CORE SHARED UTILITIES
// Server-Authoritative Aggregations, Time Period Resolver & Isolation Guards
// ==============================================================================

import type { CustomerSegment, DerivedCustomerInfo } from '../reactivation/_shared.ts';
import { deriveCustomerSegmentation, mockCustomerRecords, campaignsStore } from '../reactivation/_shared.ts';

export type AnalyticsPeriod = 'today' | '7d' | '30d' | 'current_month' | 'previous_month' | 'all';

export const VALID_PERIODS: AnalyticsPeriod[] = [
  'today',
  '7d',
  '30d',
  'current_month',
  'previous_month',
  'all',
];

export interface PeriodResolution {
  valid: boolean;
  period: AnalyticsPeriod;
  startDate: Date | null;
  endDate: Date;
  label: string;
}

/**
 * Validates and resolves date ranges for explicit, deterministic time periods.
 * Rejects invalid periods with valid: false to enforce HTTP 400.
 */
export function resolveAnalyticsPeriod(rawPeriod?: string | null): PeriodResolution {
  if (!rawPeriod) {
    // Default to 30d
    return resolveValidPeriod('30d');
  }

  const normalized = String(rawPeriod).toLowerCase().trim() as AnalyticsPeriod;
  if (!VALID_PERIODS.includes(normalized)) {
    return {
      valid: false,
      period: '30d',
      startDate: null,
      endDate: new Date(),
      label: 'غير صالحة',
    };
  }

  return resolveValidPeriod(normalized);
}

function resolveValidPeriod(period: AnalyticsPeriod): PeriodResolution {
  const now = new Date();
  const endDate = new Date(now);

  let startDate: Date | null = null;
  let label = '';

  switch (period) {
    case 'today': {
      label = 'اليوم';
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      break;
    }
    case '7d': {
      label = 'آخر 7 أيام';
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    }
    case '30d': {
      label = 'آخر 30 يوماً';
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    }
    case 'current_month': {
      label = 'الشهر الحالي';
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    }
    case 'previous_month': {
      label = 'الشهر السابق';
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return {
        valid: true,
        period,
        startDate,
        endDate: lastDayPrevMonth,
        label,
      };
    }
    case 'all': {
      label = 'كافة الفترات';
      startDate = null; // Beginning of time
      break;
    }
  }

  return {
    valid: true,
    period,
    startDate,
    endDate,
    label,
  };
}

export interface StoreOverviewMetrics {
  total_customers: number;
  active_customers: number;
  returning_customers: number;
  new_customers: number;
  repeat_rate_percentage: number;
  total_visits: number;
  average_visits_per_customer: number;
  total_wallet_balance: number;
  total_lifetime_xp: number;
  at_risk_customers: number;
  churned_customers: number;
  period: {
    key: AnalyticsPeriod;
    label: string;
    start: string | null;
    end: string;
  };
}

/**
 * Calculates store overview metrics from customer activity records.
 * Integrates directly with Stage 11 segmentation engine without duplicate definitions.
 */
export function calculateStoreOverview(
  customers: any[],
  periodInfo: PeriodResolution
): StoreOverviewMetrics {
  const total = customers.length;
  if (total === 0) {
    return {
      total_customers: 0,
      active_customers: 0,
      returning_customers: 0,
      new_customers: 0,
      repeat_rate_percentage: 0,
      total_visits: 0,
      average_visits_per_customer: 0,
      total_wallet_balance: 0,
      total_lifetime_xp: 0,
      at_risk_customers: 0,
      churned_customers: 0,
      period: {
        key: periodInfo.period,
        label: periodInfo.label,
        start: periodInfo.startDate ? periodInfo.startDate.toISOString() : null,
        end: periodInfo.endDate.toISOString(),
      },
    };
  }

  let activeCount = 0;
  let returningCount = 0;
  let newCount = 0;
  let atRiskCount = 0;
  let churnedCount = 0;
  let totalVisits = 0;
  let totalWallet = 0;
  let totalXP = 0;

  for (const c of customers) {
    const visits = Number(c.visits_count || 1);
    const wallet = Number(c.wallet_balance || 0);
    const xp = Number(c.lifetime_xp || 0);

    totalVisits += visits;
    totalWallet += wallet;
    totalXP += xp;

    // Use canonical Stage 11 segmentation
    const derived = deriveCustomerSegmentation(c);

    if (derived.segment === 'active' || derived.segment === 'loyal' || derived.segment === 'high_value') {
      activeCount++;
    }
    if (derived.segment === 'at_risk') {
      atRiskCount++;
    }
    if (derived.segment === 'lost' || derived.segment === 'inactive') {
      churnedCount++;
    }

    if (visits > 1 || xp >= 100) {
      returningCount++;
    } else {
      newCount++;
    }
  }

  const repeatRate = total > 0 ? Math.round((returningCount / total) * 1000) / 10 : 0;
  const avgVisits = total > 0 ? Math.round((totalVisits / total) * 10) / 10 : 0;

  return {
    total_customers: total,
    active_customers: activeCount,
    returning_customers: returningCount,
    new_customers: newCount,
    repeat_rate_percentage: repeatRate,
    total_visits: totalVisits,
    average_visits_per_customer: avgVisits,
    total_wallet_balance: totalWallet,
    total_lifetime_xp: totalXP,
    at_risk_customers: atRiskCount,
    churned_customers: churnedCount,
    period: {
      key: periodInfo.period,
      label: periodInfo.label,
      start: periodInfo.startDate ? periodInfo.startDate.toISOString() : null,
      end: periodInfo.endDate.toISOString(),
    },
  };
}

export { deriveCustomerSegmentation, mockCustomerRecords, campaignsStore };

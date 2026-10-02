import {
  Store,
  StoreStaff,
  Customer,
  Tier,
  Privilege,
  AuditLog,
  CustomerCoupon,
  CatalogItem,
  StoreSpecialist,
  GlobalCategory,
  GlobalModifierGroup,
  ServiceBooking,
  FinancialLedgerEntry,
  StoreInvoice,
} from '../types';

export const INITIAL_STORES: Store[] = [];

export const INITIAL_STORE: Store = {
  id: '',
  slug: '',
  name: '',
  logo_url: null,
  primary_color: '#0F172A',
  secondary_color: '#F59E0B',
  points_per_riyal: 1.0,
  subscription_active: false,
  status: 'trial',
  subscription_status: 'trial',
  subscription_plan: 'trial',
  setup_fee_paid: false,
  manager_name: '',
  manager_contact: '',
  catalog_enabled: false,
  created_at: new Date().toISOString(),
};

export const INITIAL_STAFF: StoreStaff[] = [];

export const INITIAL_TIERS: Tier[] = [];

export const INITIAL_PRIVILEGES: Privilege[] = [];

export const INITIAL_CUSTOMER_COUPONS: CustomerCoupon[] = [];

export const INITIAL_CUSTOMERS: Customer[] = [];

export const INITIAL_STORE_WALLETS: Record<string, any> = {};

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

export const INITIAL_FINANCIAL_LEDGER: FinancialLedgerEntry[] = [];

export const INITIAL_INVOICES: Record<string, StoreInvoice[]> = {};

export const INITIAL_GLOBAL_CATEGORIES: GlobalCategory[] = [];

export const INITIAL_CATALOG_ITEMS: CatalogItem[] = [];

export const INITIAL_SPECIALISTS: StoreSpecialist[] = [];

export const INITIAL_GLOBAL_MODIFIERS: GlobalModifierGroup[] = [];

export const INITIAL_SERVICE_BOOKINGS: ServiceBooking[] = [];

export const INITIAL_BOOKINGS: ServiceBooking[] = [];

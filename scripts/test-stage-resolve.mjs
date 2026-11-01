import { resolveUnifiedStage, getStoreUnifiedStage } from '../src/types.ts';

// Test 1: Newly founded store in trial (like shwaya)
const shwayaStore = {
  id: '5739ca5e-52f9-44f8-bf77-6b3af5f921b5',
  name: 'شواية',
  slug: 'shwaya',
  status: 'trial',
  subscription_status: 'trial',
  setup_fee_paid: false,
  subscription_plan: 'trial',
  lifecycle_stage: 'تم التأسيس'
};

const stage1 = resolveUnifiedStage(shwayaStore);
console.log('Test 1 (Shwaya store):', stage1);
console.assert(stage1.isPaidActive === false, 'FAIL: shwaya must NOT be paid active');
console.assert(stage1.label === 'تم التأسيس', 'FAIL: shwaya label must be تم التأسيس');
console.assert(getStoreUnifiedStage(shwayaStore) === 'تم التأسيس', 'FAIL: getStoreUnifiedStage must be تم التأسيس');

// Test 2: Converted lead for shwaya
const shwayaLead = {
  id: 'f40f28ff-bb34-4c31-8955-6f5f7badcebd',
  store_name: 'شواية',
  phone: '0550477150',
  status: 'CONVERTED',
  converted_store_id: '5739ca5e-52f9-44f8-bf77-6b3af5f921b5',
  setup_fee_paid: false,
  subscription_status: 'trial'
};

const stage2 = resolveUnifiedStage(shwayaLead);
console.log('Test 2 (Shwaya lead):', stage2);
console.assert(stage2.isPaidActive === false, 'FAIL: shwaya lead must NOT be paid active');
console.assert(stage2.label === 'تم التأسيس', 'FAIL: shwaya lead label must be تم التأسيس');

// Test 3: New Lead
const newLead = {
  id: 'lead-1',
  status: 'NEW',
  lifecycle_stage: 'طلب جديد'
};
const stage3 = resolveUnifiedStage(newLead);
console.log('Test 3 (New lead):', stage3);
console.assert(stage3.isPaidActive === false, 'FAIL: new lead must NOT be paid active');
console.assert(stage3.label === 'طلب جديد', 'FAIL: new lead label must be طلب جديد');

// Test 4: Real Paid Active Store
const paidStore = {
  id: 'store-paid-1',
  slug: 'paid-store',
  status: 'active',
  subscription_status: 'active',
  setup_fee_paid: true,
  has_paid_invoice: true,
  lifecycle_stage: 'مشترك مدفوع'
};
const stage4 = resolveUnifiedStage(paidStore);
console.log('Test 4 (Paid store):', stage4);
console.assert(stage4.isPaidActive === true, 'FAIL: paid store MUST be paid active');
console.assert(stage4.label === 'مشترك مدفوع', 'FAIL: paid store label must be مشترك مدفوع');

console.log('🎉 ALL 4 STAGE RESOLUTION TESTS PASSED!');

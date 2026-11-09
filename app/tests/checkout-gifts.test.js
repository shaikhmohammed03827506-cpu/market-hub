const test=require('node:test');
const assert=require('node:assert/strict');
const {eligibleCheckoutGiftSkus}=require('../db');

test('every first customer receives a separate gift on a one-rupee order',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:1,hasPreviousOrder:false}),['MH-GIFT-MYSTERY']);
});

test('first-order bonus is additional at every milestone boundary',()=>{
  for(const subtotalInr of [1,398,399,798,799,998,999,10000000]){
    const returning=eligibleCheckoutGiftSkus({subtotalInr,hasPreviousOrder:true});
    const first=eligibleCheckoutGiftSkus({subtotalInr,hasPreviousOrder:false});
    assert.deepEqual(first,['MH-GIFT-MYSTERY',...returning]);
  }
});

test('reducing subtotal removes milestone gifts',()=>{
  assert.equal(eligibleCheckoutGiftSkus({subtotalInr:999,hasPreviousOrder:false}).length,5);
  assert.equal(eligibleCheckoutGiftSkus({subtotalInr:398,hasPreviousOrder:false}).length,1);
});

test('first order at 998 receives the first-order gift and two milestone gifts',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:998,hasPreviousOrder:false}),['MH-GIFT-MYSTERY','MH-GIFT-MYSTERY','MH-GIFT-MYSTERY']);
});

test('first order at 999 receives four mystery gifts and the tumbler',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:999,hasPreviousOrder:false}),['MH-GIFT-MYSTERY','MH-GIFT-MYSTERY','MH-GIFT-MYSTERY','MH-GIFT-MYSTERY','MH-GIFT-TUMBLER']);
});

test('returning customer above threshold receives three mystery gifts and tumbler',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:1499,hasPreviousOrder:true}),['MH-GIFT-MYSTERY','MH-GIFT-MYSTERY','MH-GIFT-MYSTERY','MH-GIFT-TUMBLER']);
});

test('returning customer below threshold receives no gifts',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:398,hasPreviousOrder:true}),[]);
});

test('gift milestones unlock cumulatively',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:399,hasPreviousOrder:true}),['MH-GIFT-MYSTERY']);
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:799,hasPreviousOrder:true}),['MH-GIFT-MYSTERY','MH-GIFT-MYSTERY']);
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:999,hasPreviousOrder:true}),['MH-GIFT-MYSTERY','MH-GIFT-MYSTERY','MH-GIFT-MYSTERY','MH-GIFT-TUMBLER']);
});

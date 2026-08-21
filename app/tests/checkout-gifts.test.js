const test=require('node:test');
const assert=require('node:assert/strict');
const {eligibleCheckoutGiftSkus}=require('../db');

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

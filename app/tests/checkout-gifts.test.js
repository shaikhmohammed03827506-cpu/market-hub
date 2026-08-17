const test=require('node:test');
const assert=require('node:assert/strict');
const {eligibleCheckoutGiftSkus}=require('../db');

test('first order below tumbler threshold receives only mystery gift',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:998,hasPreviousOrder:false}),['MH-GIFT-MYSTERY']);
});

test('first order at tumbler threshold receives both gifts',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:999,hasPreviousOrder:false}),['MH-GIFT-MYSTERY','MH-GIFT-TUMBLER']);
});

test('returning customer above threshold receives only tumbler',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:1499,hasPreviousOrder:true}),['MH-GIFT-TUMBLER']);
});

test('returning customer below threshold receives no gifts',()=>{
  assert.deepEqual(eligibleCheckoutGiftSkus({subtotalInr:500,hasPreviousOrder:true}),[]);
});

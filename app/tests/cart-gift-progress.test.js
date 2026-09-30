const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../storefront-v40.js'),'utf8');
const render=source.slice(source.indexOf('  function renderCart() {'),source.indexOf('  function openCart() {'));
function draw(subtotal,preview,empty=false){
  const nodes=Object.fromEntries(['cartSubtotal','cartGiftProgress','cartPaymentPolicy','cartItems'].map(id=>[id,{}]));
  const context={cart:empty?[]:[{sku:'TEST',name:'Product',price:subtotal,qty:1}],giftPreview:preview,
    ensureCartUi(){},refreshGiftPreview(){},money:v=>`₹${v}`,escapeHtml:String,cartLineKey:i=>i.sku,optionLabel:()=>'',
    document:{getElementById:id=>nodes[id],querySelectorAll:()=>[]}};
  vm.runInNewContext(render+';renderCart();',context);
  return nodes;
}
test('cart shows progress, next milestone and separate verified first-order gift',()=>{
  const nodes=draw(249,{subtotalInr:249,authenticated:true,hasPreviousOrder:false,gifts:[{kind:'mystery',name:'Mystery',quantity:1}]});
  assert.match(nodes.cartGiftProgress.innerHTML,/role="progressbar"/);
  assert.match(nodes.cartGiftProgress.innerHTML,/Add ₹150 more/);
  assert.match(nodes.cartGiftProgress.innerHTML,/extra first-order mystery gift is included/);
  assert.match(nodes.cartItems.innerHTML,/₹0 × 1/);
  assert.match(nodes.cartPaymentPolicy.textContent,/₹13/);
  assert.doesNotMatch(nodes.cartPaymentPolicy.textContent,/1499|1,499|₹15/);
});
test('unknown eligibility never claims gifts were added',()=>{
  const nodes=draw(999,null);
  assert.doesNotMatch(nodes.cartItems.innerHTML,/FREE GIFT/);
  assert.match(nodes.cartGiftProgress.innerHTML,/Sign in to verify/);
});
test('verified subtotal controls progress, not client-side price',()=>{
  const nodes=draw(999,{subtotalInr:398,authenticated:true,hasPreviousOrder:true,gifts:[]});
  assert.match(nodes.cartGiftProgress.innerHTML,/Add ₹1 more/);
  assert.doesNotMatch(nodes.cartItems.innerHTML,/FREE GIFT/);
});
test('empty cart has no gifts',()=>{
  const nodes=draw(0,null,true);
  assert.match(nodes.cartGiftProgress.innerHTML,/Shop to unlock/);
  assert.doesNotMatch(nodes.cartItems.innerHTML,/FREE GIFT/);
});

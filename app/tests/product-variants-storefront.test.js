'use strict';
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'storefront-v40.js'),'utf8');
const context={
  window:{},localStorage:{getItem(){return null},setItem(){}},
  document:{readyState:'loading',addEventListener(){},querySelectorAll(){return[]},querySelector(){return null},getElementById(){return null},body:{}},
  URLSearchParams,location:{search:''},navigator:{},CustomEvent:class{},Event:class{},setTimeout(){},requestAnimationFrame(callback){callback()},console,alert(){}
};
context.window.window=context.window;
vm.runInNewContext(source,context,{filename:'storefront-v40.js'});
const store=context.window.MarketHubStorefront;
assert(store,'shared storefront module must initialize once');
const product=store.normalizeProduct({id:'p1',sku:'TSHIRT',name:'T Shirt',price_inr:499,stock_quantity:8,options:[{name:'Colour',values:['Blue','Red']},{name:'Size',values:['S','M']}],variants:[
  {id:'v1',sku:'TSHIRT-BLUE-S',price_inr:499,compare_at_price_inr:799,stock_quantity:5,is_enabled:true,is_default:true,options:{Colour:'Blue',Size:'S'},image_url:'https://example.com/blue-s.jpg'},
  {id:'v2',sku:'TSHIRT-BLUE-M',price_inr:549,stock_quantity:3,is_enabled:true,options:{Colour:'Blue',Size:'M'}},
  {id:'v3',sku:'TSHIRT-RED-S',price_inr:599,stock_quantity:0,is_enabled:true,options:{Colour:'Red',Size:'S'}}
]});
assert.equal(product.hasVariants,true);
assert.equal(store.resolveVariant(product,{Colour:'Blue',Size:'M'}).sku,'TSHIRT-BLUE-M');
assert.equal(store.resolveVariant(product,{Colour:'Red',Size:'M'}),null,'missing combinations must stay unavailable');
assert.equal(store.defaultVariant(product).id,'v1');
assert.match(store.card(product),/data-mh-card-option="Colour"/);
assert.match(store.card(product),/data-mh-variant-id="v1"/);
assert.match(source,/variantId: item\.variantId \|\| undefined/,'checkout must send the exact selected variant id');
assert.match(source,/variant:\$\{item\.variantId \|\| item\.variantSku\}/,'different variants must use different cart line keys');
assert.doesNotMatch(source,/MutationObserver|setInterval\s*\(/,'v43 storefront must retain the no polling/no MutationObserver performance rule');
const productPage=fs.readFileSync(path.join(root,'product.js'),'utf8');
assert.match(productPage,/Choose all options to add this product/);
assert.match(productPage,/data-product-option/);
assert.match(productPage,/data-mh-variant-id/);
const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const imported=fs.readFileSync(path.join(root,'admin-import.html'),'utf8');
assert.match(admin,/variant-editor-v43\.js/);
assert.match(imported,/variant-editor-v43\.js/);
assert.doesNotMatch(imported,/Variants JSON/);
console.log('v43 storefront variant contract tests passed');

const assert=require('assert/strict');
const Module=require('module');
const path=require('path');
const publishedAt=new Date('2026-08-04T12:00:00.000Z');
const state={
  item:{id:'11111111-1111-4111-8111-111111111111',source_url:'https://www.amazon.in/dp/B0ABC12345',source_url_hash:'source-hash',source_domain:'www.amazon.in',source_product_id:'B0ABC12345',source_sku:'MH-HOME-1',title:'Imported Bottle',status:'draft',duplicate_reason:null,existing_product_id:null,published_at:null,product_data:{title:'Imported Bottle',brand:'Fixture Brand',category:'Home & Kitchen',sku:'MH-HOME-1',description:'Imported description',price:1499,mrp:1999,discount:25,stock:99,weightGrams:500,selectedImages:['https://example.com/main.jpg','https://example.com/side.jpg'],variants:[{color:'Blue'}],specifications:{Material:'Steel'},tags:['bottle']}},
  product:null,images:[],history:0,audit:0,creates:0
};
function result(rows=[]){return{rows,rowCount:rows.length}}
async function query(sql,params=[]){
  const text=String(sql).replace(/\s+/g,' ').trim().toLowerCase();
  if(text==='begin'||text==='commit'||text==='rollback'||text.startsWith('create ')||text.startsWith('alter ')||text.startsWith('update product_import_settings')||text.startsWith('insert into product_import_settings'))return result();
  if(text.startsWith('select * from product_import_items')&&text.includes('for update'))return result([{...state.item}]);
  if(text.startsWith('select status,source_url from product_import_items'))return result([{status:state.item.status,source_url:state.item.source_url}]);
  if(text.startsWith('select id,name from categories'))return result([{id:'33333333-3333-4333-8333-333333333333',name:'Home & Kitchen'}]);
  if(text.startsWith('select product_id from product_source_mappings'))return result(state.product?[{product_id:state.product.id}]:[]);
  if(text.startsWith('select id from products where lower(sku)'))return result([]);
  if(text.startsWith('select 1 from products where slug'))return result([]);
  if(text.startsWith('insert into products(')){
    state.creates++;
    state.product={id:'22222222-2222-4222-8222-222222222222',sku:params[1],name:params[2],slug:params[3],description:params[4],specifications:JSON.parse(params[5]),price_inr:params[6],compare_at_price_inr:params[7],stock_quantity:params[8],weight_kg:params[9],is_active:true,published_at:publishedAt,category:'Home & Kitchen'};
    return result([{id:state.product.id,published_at:publishedAt}]);
  }
  if(text.startsWith('insert into product_images')){state.images.push({url:params[1],sort_order:params[3]});return result()}
  if(text.startsWith('update product_import_media'))return result();
  if(text.startsWith('update product_import_items set product_data')){state.item={...state.item,product_data:JSON.parse(params[1]),status:'published',existing_product_id:params[2],published_at:publishedAt};return result([{published_at:publishedAt}])}
  if(text.startsWith('insert into product_source_mappings'))return result();
  if(text.startsWith('insert into product_import_history')){state.history++;return result()}
  if(text.startsWith('insert into product_import_audit')){state.audit++;return result()}
  if(text.startsWith('select p.id, p.sku'))return result([{...state.product,images:state.images.map(image=>({url:image.url,alt_text:'Imported Bottle',sort_order:image.sort_order}))}]);
  throw new Error(`Unhandled test SQL: ${text}`);
}
class FakePool{connect(){return Promise.resolve({query,release(){}})}query(sql,params){return query(sql,params)}}
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==='pg')return{Pool:FakePool};return originalLoad.call(this,request,parent,isMain)};
process.env.DATABASE_URL='postgres://fixture.invalid/market-hub';
const db=require(path.join(__dirname,'..','db.js'));
(async()=>{
  const first=await db.publishProductImportItem(state.item.id,{},'test-admin');
  const second=await db.publishProductImportItem(state.item.id,{},'test-admin');
  assert.equal(first.status,'published');assert.equal(first.alreadyPublished,false);assert.equal(second.alreadyPublished,true);
  assert.equal(first.product.id,second.product.id);assert.equal(state.creates,1);assert.equal(state.history,1);assert.equal(state.audit,1);
  assert.deepEqual(state.images.map(image=>image.url),['https://example.com/main.jpg','https://example.com/side.jpg']);
  assert.equal(first.product.compare_at_price_inr,1999);assert.equal(first.product.stock_quantity,99);assert.equal(state.product.specifications.brand,'Fixture Brand');assert.deepEqual(state.product.specifications.variants,[{color:'Blue'}]);
  assert.equal(first.productUrl,'/product.html?sku=MH-HOME-1');assert(state.item.published_at);
  await assert.rejects(()=>db.deleteProductImportDraft(state.item.id,'test-admin'),/Published products cannot be deleted/);
  console.log('product-import transactional publish tests passed');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{Module._load=originalLoad});

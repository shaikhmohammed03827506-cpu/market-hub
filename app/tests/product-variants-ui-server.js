'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const port=Number(process.env.MH_V43_UI_PORT||43245);
const variantProduct={id:'11111111-1111-4111-8111-111111111111',sku:'MH-TSHIRT',name:'Variant T-Shirt',category:'Fashion',description:'Fixture variant product',price_inr:499,compare_at_price_inr:799,stock_quantity:8,weight_grams:250,image_url:'/assets/market-hub-logo.png',gallery:['/assets/market-hub-logo.png'],has_variants:true,options:[{name:'Colour',position:0,values:[{value:'Blue',position:0},{value:'Red',position:1}]},{name:'Size',position:1,values:[{value:'S',position:0},{value:'M',position:1}]}],variants:[
  {id:'21111111-1111-4111-8111-111111111111',sku:'MH-TSHIRT-BLUE-S',price_inr:499,compare_at_price_inr:799,stock_quantity:5,weight_grams:250,is_enabled:true,is_default:true,options:{Colour:'Blue',Size:'S'},image_url:'/assets/market-hub-logo.png',gallery:['/assets/market-hub-logo.png']},
  {id:'21111111-1111-4111-8111-111111111112',sku:'MH-TSHIRT-BLUE-M',price_inr:549,compare_at_price_inr:799,stock_quantity:3,weight_grams:260,is_enabled:true,is_default:false,options:{Colour:'Blue',Size:'M'},image_url:'/assets/market-hub-logo.png',gallery:['/assets/market-hub-logo.png']},
  {id:'21111111-1111-4111-8111-111111111113',sku:'MH-TSHIRT-RED-S',price_inr:599,compare_at_price_inr:799,stock_quantity:0,weight_grams:250,is_enabled:true,is_default:false,options:{Colour:'Red',Size:'S'},image_url:'/assets/market-hub-logo.png',gallery:['/assets/market-hub-logo.png']}
]};
const simpleProduct={id:'31111111-1111-4111-8111-111111111111',sku:'MH-BOTTLE',name:'Simple Bottle',category:'Home & Kitchen',description:'Fixture simple product',price_inr:349,compare_at_price_inr:599,stock_quantity:12,weight_grams:500,image_url:'/assets/market-hub-logo.png',gallery:['/assets/market-hub-logo.png'],has_variants:false,options:[],variants:[]};
const products=[variantProduct,simpleProduct];
const json=(response,status,value)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(value))};
http.createServer((request,response)=>{
  const url=new URL(request.url,`http://127.0.0.1:${port}`);
  if(url.pathname==='/api/products'){
    let rows=[...products],query=(url.searchParams.get('q')||'').toLowerCase(),category=(url.searchParams.get('category')||'').toLowerCase();
    if(query)rows=rows.filter(product=>`${product.name} ${product.sku} ${product.variants.map(variant=>variant.sku+' '+Object.values(variant.options).join(' ')).join(' ')}`.toLowerCase().includes(query));
    if(category)rows=rows.filter(product=>product.category.toLowerCase()===category);
    return json(response,200,{products:rows,page:1,limit:24,total:rows.length,hasMore:false});
  }
  if(url.pathname==='/api/categories')return json(response,200,{categories:['Fashion','Home & Kitchen']});
  const detail=url.pathname.match(/^\/api\/products\/([^/]+)$/);if(detail){const product=products.find(item=>item.sku===decodeURIComponent(detail[1]));return product?json(response,200,{product}):json(response,404,{error:'Product not found.'})}
  if(url.pathname==='/api/reviews')return json(response,200,{reviews:[]});
  if(url.pathname==='/api/recommendations/home')return json(response,200,{recommended:products,newArrivals:products,bestSellers:products});
  if(url.pathname==='/api/customer/wishlist'&&request.method==='GET')return json(response,401,{error:'Guest'});
  if(url.pathname==='/api/customer/wishlist'&&request.method==='POST')return json(response,401,{error:'Guest'});
  if(url.pathname==='/api/shipping/estimate')return json(response,200,{serviceable:true,message:'Delivery is available.'});
  if(url.pathname==='/api/config/shiprocket-checkout')return json(response,200,{ready:false});
  const requested=url.pathname==='/'?'/index.html':url.pathname;
  const file=path.resolve(root,requested.replace(/^\//,''));
  if(!file.startsWith(root)||!fs.existsSync(file)){response.writeHead(404);return response.end('Not found')}
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
  response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});fs.createReadStream(file).pipe(response);
}).listen(port,'127.0.0.1',()=>console.log(`v43 storefront fixture: http://127.0.0.1:${port}`));

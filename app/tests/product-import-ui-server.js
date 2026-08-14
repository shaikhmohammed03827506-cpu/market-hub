const http=require('http');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const id='11111111-1111-4111-8111-111111111111';
const product={title:'Fixture Amazon Bottle',shortDescription:'Insulated bottle',description:'Controlled Amazon importer preview',brand:'Fixture Brand',category:'Home & Kitchen',asin:'B0ABC12345',sourceProductId:'B0ABC12345',sourceUrl:'https://www.amazon.in/dp/B0ABC12345',sourceWebsite:'www.amazon.in',price:1499,mrp:1999,discount:25,calculatedPrice:1499,stock:99,sku:'MH-HOMEKITCHEN-000001',images:['https://m.media-amazon.com/images/I/main.jpg','https://m.media-amazon.com/images/I/side.jpg'],selectedImages:['https://m.media-amazon.com/images/I/main.jpg','https://m.media-amazon.com/images/I/side.jpg'],options:[{name:'Colour',values:['Blue','Red']}],variants:[{sku:'MH-HOMEKITCHEN-BLUE',price:1499,mrp:1999,stock:99,weightGrams:500,enabled:true,isDefault:true,options:{Colour:'Blue'},image:'https://m.media-amazon.com/images/I/main.jpg'},{sku:'MH-HOMEKITCHEN-RED',price:1599,mrp:1999,stock:0,weightGrams:500,enabled:false,isDefault:false,options:{Colour:'Red'},image:'https://m.media-amazon.com/images/I/side.jpg'}],specifications:{Material:'Steel'},tags:['bottle']};
let item={id,sourceUrl:product.sourceUrl,sourceDomain:'www.amazon.in',status:'draft',data:{...product}},draftExists=true,publishWrites=0;
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body))};
const body=req=>new Promise((resolve,reject)=>{let value='';req.on('data',chunk=>value+=chunk);req.on('end',()=>{try{resolve(value?JSON.parse(value):{})}catch(error){reject(error)}});req.on('error',reject)});
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:43244'),pathname=url.pathname;
  if(pathname==='/api/admin/products')return json(res,200,{products:[{category:'Home & Kitchen'}]});
  if(pathname==='/api/admin/product-import/settings')return json(res,200,{settings:{markup_percent:0,fixed_markup_inr:0,minimum_profit_inr:0,rounding_rule:0,default_stock:99,max_images:12,max_media_bytes:5242880,auto_sku:true,allowed_domains:[]}});
  if(pathname==='/api/admin/product-import/analyze'&&req.method==='POST'){
    const input=await body(req);
    if(String(input.url).includes('no-data'))return json(res,422,{ok:false,error:{code:'PRODUCT_DATA_NOT_FOUND',message:'No usable public product data was found at this URL. The page may require sign-in, be unavailable, or not expose product details that MARKET HUB can safely import.'},requestId:'fixture'});
    item={id,sourceUrl:product.sourceUrl,sourceDomain:'www.amazon.in',status:input.intent==='draft'?'draft':'ready',data:{...product}};draftExists=item.status==='draft';publishWrites=0;return json(res,201,{item});
  }
  if(pathname==='/api/admin/product-import/items'&&req.method==='GET')return json(res,200,{items:draftExists&&item.status==='draft'?[item]:[],total:draftExists?1:0,page:1});
  if(pathname===`/api/admin/product-import/items/${id}`&&req.method==='GET')return draftExists||item.status==='published'?json(res,200,{item}):json(res,404,{error:'Draft not found.'});
  if(pathname===`/api/admin/product-import/items/${id}`&&req.method==='PUT'){const input=await body(req);item={...item,status:'draft',data:{...item.data,...input}};draftExists=true;return json(res,200,{result:item})}
  if(pathname===`/api/admin/product-import/${id}/publish`&&req.method==='POST'){
    const input=await body(req),alreadyPublished=item.status==='published';if(!alreadyPublished)publishWrites++;
    item={...item,status:'published',publishedAt:'2026-08-04T12:00:00.000Z',data:{...item.data,...input}};draftExists=false;
    return json(res,200,{result:{status:'published',alreadyPublished,publishedAt:item.publishedAt,product:{id:'22222222-2222-4222-8222-222222222222',sku:item.data.sku,name:item.data.title,slug:'fixture-amazon-bottle-mh-homekitchen-000001',category:item.data.category,price_inr:item.data.price,compare_at_price_inr:item.data.mrp,stock_quantity:item.data.stock,gallery:item.data.selectedImages},productUrl:`/product.html?sku=${encodeURIComponent(item.data.sku)}`}});
  }
  if(pathname===`/api/admin/product-import/${id}`&&req.method==='DELETE'){draftExists=false;return json(res,200,{result:{deleted:true,id}})}
  if(pathname==='/__fixture/state')return json(res,200,{draftExists,publishWrites,item});
  const requested=pathname==='/'?'/admin-import.html':pathname,file=path.join(root,requested.replace(/^\//,''));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('Not found')}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});fs.createReadStream(file).pipe(res);
}).listen(43244,'127.0.0.1',()=>console.log('product import UI fixture: http://127.0.0.1:43244'));

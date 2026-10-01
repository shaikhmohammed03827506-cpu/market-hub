/* MARKET HUB local server and secure payment foundation.
   Keep .env private. It must never be uploaded with the public website files. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const config = {
  port: Number(process.env.PORT || 4173),
  publicOrigin: String(process.env.PUBLIC_ORIGIN || (process.env.VERCEL === '1' ? 'https://market-hub-shop.vercel.app' : '')).trim().replace(/\/+$/, ''),
  databaseUrl: process.env.DATABASE_URL || '',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  shiprocketCheckoutApiKey: process.env.SHIPROCKET_CHECKOUT_API_KEY || '',
  shiprocketCheckoutSecret: process.env.SHIPROCKET_CHECKOUT_SECRET_KEY || '',
  shiprocketCheckoutBaseUrl: (process.env.SHIPROCKET_CHECKOUT_BASE_URL || 'https://checkout-api.shiprocket.com').replace(/\/$/, ''),
  shiprocketApiEmail: (process.env.SHIPROCKET_API_EMAIL || '').trim().toLowerCase(),
  shiprocketApiPassword: process.env.SHIPROCKET_API_PASSWORD || '',
  shiprocketChannelId: Number(process.env.SHIPROCKET_CHANNEL_ID || 0),
  shiprocketApiBaseUrl: (process.env.SHIPROCKET_API_BASE_URL || 'https://apiv2.shiprocket.in').replace(/\/$/, ''),
  shiprocketPickupLocation: (process.env.SHIPROCKET_PICKUP_LOCATION || '').trim(),
  shiprocketPickupPincode: String(process.env.SHIPROCKET_PICKUP_PINCODE || '').replace(/\D/g, '').slice(0, 6),
  shiprocketCheckoutWebhookSecret: process.env.SHIPROCKET_CHECKOUT_WEBHOOK_SECRET || '',
  delhiveryToken: process.env.DELHIVERY_API_TOKEN || '',
  delhiveryBaseUrl: (process.env.DELHIVERY_API_BASE_URL || 'https://track.delhivery.com').replace(/\/$/, ''),
  delhiveryClientName: (process.env.DELHIVERY_CLIENT_NAME || '').trim(),
  delhiveryPickupLocation: (process.env.DELHIVERY_PICKUP_LOCATION || '').trim(),
  delhiveryPickupPincode: String(process.env.DELHIVERY_PICKUP_PINCODE || '').replace(/\D/g, '').slice(0, 6),
  delhiveryPickupCity: (process.env.DELHIVERY_PICKUP_CITY || '').trim(),
  delhiveryPickupState: (process.env.DELHIVERY_PICKUP_STATE || '').trim(),
  delhiverySellerName: (process.env.DELHIVERY_SELLER_NAME || 'MARKET HUB').trim(),
  delhiverySellerGstin: String(process.env.DELHIVERY_SELLER_GSTIN || '').trim().toUpperCase(),
  delhiveryHsnCode: String(process.env.DELHIVERY_HSN_CODE || '').replace(/\D/g, '').slice(0, 20),
  delhiveryCodEnabled: process.env.DELHIVERY_COD_ENABLED === 'true',
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  logo: process.env.STORE_LOGO_URL || ''
};

// Small demo-price fallback. The catalogue price is calculated on the server below.
const priceCatalog = new Map([
  [1, 899], [2, 349], [3, 399], [4, 649], [5, 1799], [6, 299], [7, 999], [8, 799]
]);
const contentTypes = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const sendJson = (res, status, body) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((resolve, reject) => { let body=''; req.on('data', chunk => { body += chunk; if (body.length > 6_000_000) { reject(new Error('Request too large')); req.destroy(); } }); req.on('end', () => resolve(body)); req.on('error', reject); });
const secureEqual = (first, second) => { const a=Buffer.from(first||''), b=Buffer.from(second||''); return a.length===b.length && crypto.timingSafeEqual(a,b); };
const pdfEscape = value => String(value ?? '').replace(/[^\x20-\x7e]/g, ' ').replace(/([\\()])/g, '\\$1');
function invoicePdf(order) {
  const lines=[`MARKET HUB - TAX INVOICE`,`Invoice: ${order.invoiceNumber}`,`Order: MH${order.orderNumber}`,
    `Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`,`Payment: ${order.paymentMethod} / ${order.paymentStatus}`,'',
    ...order.items.map(item=>{const options=Object.entries(item.options||{}).map(([name,value])=>`${name}: ${value}`).join(', ');return`${item.name}${options?` - ${options}`:''} (${item.sku}) x ${item.quantity}  INR ${(Number(item.price)*Number(item.quantity)).toFixed(2)}`}),'',
    `Subtotal: INR ${order.subtotalInr.toFixed(2)}`,`Discount: INR ${order.discountInr.toFixed(2)}`,
    `Shipping: INR ${order.shippingInr.toFixed(2)}`,`GST: INR ${order.gstInr.toFixed(2)}`,`Total: INR ${order.totalInr.toFixed(2)}`,
    '','Thank you for shopping with MARKET HUB.'];
  const stream=`BT /F1 12 Tf 50 790 Td ${lines.map((line,index)=>`${index?'0 -18 Td ':''}(${pdfEscape(line)}) Tj`).join(' ')} ET`;
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(pdf);pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const productImportRate = new Map();
function allowProductImportRequest(request,limit=12,windowMs=60_000){const key=String(request.headers['x-forwarded-for']||request.socket.remoteAddress||'unknown').split(',')[0].trim(),now=Date.now(),entry=productImportRate.get(key);if(!entry||entry.resetAt<now){productImportRate.set(key,{count:1,resetAt:now+windowMs});return true}if(entry.count>=limit)return false;entry.count++;return true}
const parseCookies = request => Object.fromEntries((request.headers.cookie||'').split(';').map(item=>item.trim()).filter(Boolean).map(item=>{const point=item.indexOf('=');return point<0?[item,'']:[item.slice(0,point),decodeURIComponent(item.slice(point+1))]}));
const sessionKey = () => {
  if (!config.sessionSecret || config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  return config.sessionSecret;
};
const makeSignedSession = payload => {
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature=crypto.createHmac('sha256',sessionKey()).update(body).digest('base64url');
  return `${body}.${signature}`;
};
const readSignedSession = token => {
  try {
    const [body,signature,...rest]=String(token||'').split('.');
    if(!body||!signature||rest.length)return null;
    const expected=crypto.createHmac('sha256',sessionKey()).update(body).digest('base64url');
    if(!secureEqual(expected,signature))return null;
    const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    return Number(payload.expiresAt)>Date.now()?payload:null;
  } catch { return null; }
};
const validAdminSession = request => readSignedSession(parseCookies(request).mh_admin_session)?.role==='admin';
const makeAdminSession = () => makeSignedSession({role:'admin',expiresAt:Date.now()+8*60*60*1000});
const adminCookie = (request,token) => `mh_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${request.headers['x-forwarded-proto']==='https'||request.socket.encrypted?'; Secure':''}`;
const customerCookie = (request,token) => `mh_customer_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${request.headers['x-forwarded-proto']==='https'||request.socket.encrypted?'; Secure':''}`;
const validCustomerSession = request => {
  const session=readSignedSession(parseCookies(request).mh_customer_session);
  return session?.role==='customer'&&/^[0-9a-f-]{36}$/i.test(String(session.userId||''))?session.userId:null;
};
const makeCustomerSession = userId => makeSignedSession({role:'customer',userId,expiresAt:Date.now()+30*24*60*60*1000});

async function razorpay(endpoint, body) {
  const authorization = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1${endpoint}`, {method:'POST',headers:{'Authorization':`Basic ${authorization}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.description || 'Razorpay could not create the payment order.');
  return data;
}

// Shiprocket Checkout (Fastrr) signs the exact JSON body using the private
// API secret. The secret stays on this server and is never sent to a browser.
function shiprocketCheckoutError(data, status) {
  const error = data && (data.error || data.errors || data.message || data.detail);
  const message = typeof error === 'string' ? error
    : Array.isArray(error) ? error.map(item => typeof item === 'string' ? item : item?.message).filter(Boolean).join(' ')
    : error && typeof error === 'object' ? (error.message || error.detail || Object.values(error).find(value => typeof value === 'string'))
    : '';
  if (message) return String(message).replace(/[<>]/g, '').slice(0, 300);
  return status ? `Shiprocket Checkout could not start (service response ${status}).` : 'Shiprocket Checkout could not start.';
}

async function shiprocketCheckout(endpoint, body) {
  if (!config.shiprocketCheckoutApiKey || !config.shiprocketCheckoutSecret) {
    throw new Error('Shiprocket Checkout is not configured yet.');
  }
  const serialized = JSON.stringify(body);
  const hmac = crypto.createHmac('sha256', config.shiprocketCheckoutSecret).update(serialized).digest('base64');
  let response;
  try {
    response = await fetch(`${config.shiprocketCheckoutBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.shiprocketCheckoutApiKey,
        'X-Api-HMAC-SHA256': hmac
      },
      body: serialized
    });
  } catch {
    throw new Error('Shiprocket Checkout is temporarily unavailable. Please keep your cart and try again shortly.');
  }
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok || data.ok === false) {
    const message=shiprocketCheckoutError(data,response.status);
    console.error('Shiprocket Checkout API rejected request:',{endpoint,status:response.status,message});
    throw new Error(message);
  }
  return data;
}

// Regular Shiprocket shipping API. This is separate from Shiprocket Checkout:
// Checkout collects the order, while this connection creates the shipment order
// in the seller's Shiprocket panel using a short-lived server-side token.
let shiprocketToken = { value: '', expiresAt: 0 };
async function shiprocketShippingToken(force = false) {
  if (!config.shiprocketApiEmail || !config.shiprocketApiPassword) throw new Error('Shiprocket shipping API is not configured yet.');
  if (!force && shiprocketToken.value && shiprocketToken.expiresAt > Date.now() + 60_000) return shiprocketToken.value;
  const response = await fetch(`${config.shiprocketApiBaseUrl}/v1/external/auth/login`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({email: config.shiprocketApiEmail, password: config.shiprocketApiPassword})
  });
  let data; try { data = await response.json(); } catch { data = {}; }
  if (!response.ok || !data.token) throw new Error(data.message || data.error || 'Shiprocket could not sign in with the API user.');
  // Shiprocket tokens normally last 10 days. Refreshing sooner is safe and
  // avoids exposing token handling to the browser.
  shiprocketToken = { value: data.token, expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000 };
  return shiprocketToken.value;
}
async function shiprocketShipping(endpoint, body, retried = false) {
  const token = await shiprocketShippingToken(retried);
  const response = await fetch(`${config.shiprocketApiBaseUrl}${endpoint}`, {
    method: 'POST', headers: {'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify(body)
  });
  let data; try { data = await response.json(); } catch { data = {}; }
  if (response.status === 401 && !retried) { shiprocketToken = { value: '', expiresAt: 0 }; return shiprocketShipping(endpoint, body, true); }
  if (!response.ok || data.status_code >= 400) throw new Error(data.message || data.error || 'Shiprocket could not create the shipping order.');
  return data;
}
async function shiprocketShippingGet(endpoint, retried = false) {
  const token = await shiprocketShippingToken(retried);
  const response = await fetch(`${config.shiprocketApiBaseUrl}${endpoint}`, {headers:{'Authorization':`Bearer ${token}`}});
  let data; try { data = await response.json(); } catch { data = {}; }
  if (response.status === 401 && !retried) { shiprocketToken = { value: '', expiresAt: 0 }; return shiprocketShippingGet(endpoint, true); }
  if (!response.ok || data.status_code >= 400) throw new Error(data.message || data.error || 'Shiprocket could not check this pincode.');
  return data;
}

const deliveryEstimateCache = new Map();
function estimateDateFromShiprocket(value) {
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(String(value).trim())) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
async function shiprocketDeliveryEstimate(pincode, weightGrams = 500) {
  const deliveryPincode = String(pincode || '').replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(deliveryPincode)) return {serviceable:false,message:'Enter a valid 6-digit pincode.'};
  if (!config.shiprocketPickupPincode) return {serviceable:null,message:'Delivery estimate will be confirmed in Shiprocket Checkout.'};
  const key = `${deliveryPincode}:${Math.max(1,Number(weightGrams)||500)}`;
  const cached=deliveryEstimateCache.get(key); if(cached && cached.expiresAt>Date.now()) return cached.value;
  const query = new URLSearchParams({pickup_postcode:config.shiprocketPickupPincode,delivery_postcode:deliveryPincode,cod:'1',weight:String(Math.max(.1,(Number(weightGrams)||500)/1000))});
  const response = await shiprocketShippingGet(`/v1/external/courier/serviceability/?${query.toString()}`);
  const options=response.data?.available_courier_companies || response.available_courier_companies || [];
  if(!options.length){const value={serviceable:false,message:'Delivery is not available for this pincode yet.'};deliveryEstimateCache.set(key,{value,expiresAt:Date.now()+300000});return value;}
  const best=options[0]||{}; const rawEta=best.etd || best.estimated_delivery_date || best.estimated_delivery_days; let eta=estimateDateFromShiprocket(rawEta); const days=Number(best.estimated_delivery_days || best.etd);
  if(!eta && Number.isFinite(days) && days>0 && days<90) eta=new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  const value={serviceable:true,estimatedDeliveryDate:eta,estimatedDeliveryDays:Number.isFinite(days)?days:null,courier:String(best.courier_name||''),message:eta?'Estimated delivery based on Shiprocket serviceability.':'Delivery is serviceable; exact options are shown in checkout.'};
  deliveryEstimateCache.set(key,{value,expiresAt:Date.now()+300000}); return value;
}

function delhiveryConfig() {
  return {
    token:config.delhiveryToken,baseUrl:config.delhiveryBaseUrl,clientName:config.delhiveryClientName,
    pickupLocation:config.delhiveryPickupLocation,pickupPincode:config.delhiveryPickupPincode,
    pickupCity:config.delhiveryPickupCity,pickupState:config.delhiveryPickupState,
    sellerName:config.delhiverySellerName,sellerGstin:config.delhiverySellerGstin,hsnCode:config.delhiveryHsnCode,codEnabled:config.delhiveryCodEnabled
  };
}

const delhiveryReady = () => Boolean(config.delhiveryToken && config.delhiveryClientName && config.delhiveryPickupLocation);

function checkoutPaymentDiagnostic(checkout) {
  const modes=[]; const scan=value=>{ if(Array.isArray(value)) return value.forEach(scan); if(value&&typeof value==='object') return Object.entries(value).forEach(([key,val])=>{if(/payment|method|mode/i.test(key)&&typeof val==='string')modes.push(val);scan(val);}); };
  scan(checkout?.result || checkout); const normalized=[...new Set(modes.map(value=>String(value).toLowerCase()))];
  if(normalized.length && normalized.every(value=>/cod|cash/.test(value))) console.warn('Shiprocket payment diagnostics: checkout response lists COD only; enable prepaid methods in Shiprocket Checkout Payment settings.',{event:'shiprocket_payment_modes',modeCount:normalized.length});
}

function shiprocketWebhookTrusted(req, raw) {
  // Shiprocket Checkout dashboard supports a custom header.  We intentionally
  // verify only a merchant-configured secret instead of guessing an SDK scheme.
  if (!config.shiprocketCheckoutWebhookSecret) return false;
  const supplied=req.headers['x-market-hub-webhook-secret'] || req.headers['x-shiprocket-webhook-secret'];
  return secureEqual(String(config.shiprocketCheckoutWebhookSecret), String(supplied || ''));
}
function shiprocketEventDetails(payload, raw) {
  const event=String(payload.event || payload.event_type || payload.type || payload.status || 'unknown').toLowerCase().replace(/\s+/g,'_');
  const externalOrderId=payload.order_id || payload.data?.order_id || payload.order?.id || '';
  const eventId=payload.event_id || payload.id || payload.data?.event_id || crypto.createHash('sha256').update(raw).digest('hex');
  return {type:event,externalOrderId:String(externalOrderId),eventKey:`shiprocket:${eventId}`,payloadHash:crypto.createHash('sha256').update(raw).digest('hex')};
}

// Never trust a product price submitted by the customer's browser.
let cataloguePriceBySku;
let catalogueProductBySku;
function catalogueProducts() {
  if (catalogueProductBySku) return catalogueProductBySku;
  const cataloguePath = path.join(root, 'assets', 'catalogue', 'products.json');
  const items = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
  catalogueProductBySku = new Map(items.map(item => [String(item.sku), item]));
  return catalogueProductBySku;
}
function cataloguePrices() {
  if (cataloguePriceBySku) return cataloguePriceBySku;
  const cataloguePath = path.join(root, 'assets', 'catalogue', 'products.json');
  const items = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
  cataloguePriceBySku = new Map(items.map(item => [String(item.sku), {
    price: Number(item.price_inr), stock: Number(item.stock_quantity)
  }]));
  return cataloguePriceBySku;
}

function publicOrigin(request) {
  if (config.publicOrigin) {
    if (!/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(config.publicOrigin)) {
      throw new Error('PUBLIC_ORIGIN must be a complete website origin without a path.');
    }
    return config.publicOrigin;
  }
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) throw new Error('The public website address is not available.');
  const protocol = request.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function shiprocketProductPayload(product, origin, options={}) {
  const freeGift=options.freeGift===true;
  const absoluteImage=value=>{
    if (!value) return '';
    const image = String(value).trim();
    if (/^https?:\/\//i.test(image)) {
      try {
        const parsed = new URL(image);
        const legacyHosts = new Set(['market-hub-india.vercel.app','market-hub-vavf.onrender.com','market-hub-staging.vercel.app']);
        if (legacyHosts.has(parsed.hostname)) return `${origin}${parsed.pathname}${parsed.search}`;
      } catch {}
      return image;
    }
    return `${origin}${image.startsWith('/')?image:`/${image}`}`;
  };
  const image = absoluteImage(product.image_url);
  const now = new Date().toISOString();
  const enabledVariants=Array.isArray(product.variants)?product.variants.filter(variant=>variant.is_enabled!==false):[];
  const variants=enabledVariants.length?enabledVariants.map(variant=>({
    id:Number(variant.checkout_variant_id),title:Object.values(variant.options||{}).join(' / ')||variant.sku,
    price:Number(freeGift?0:variant.price_inr).toFixed(2),compare_at_price:variant.compare_at_price_inr==null?undefined:Number(variant.compare_at_price_inr).toFixed(2),
    sku:String(variant.sku),created_at:now,updated_at:now,taxable:true,quantity:Number(variant.stock_quantity||0),
    grams:Number(variant.weight_grams||500),image:{src:absoluteImage(variant.image_url||product.image_url)},
    weight:Number(variant.weight_grams||500)/1000,weight_unit:'kg',options:variant.options||{}
  })): [{id:Number(product.checkout_product_id||product.id),title:'Default',price:Number(freeGift?0:product.price_inr).toFixed(2),sku:String(product.sku),created_at:now,updated_at:now,taxable:!freeGift,quantity:Number(product.stock_quantity||0),grams:Number(product.weight_grams||500),image:{src:image},weight:Number(product.weight_grams||500)/1000,weight_unit:'kg'}];
  return {
    id: Number(product.checkout_product_id||product.id), title: String(product.name),
    body_html: `<p>${String(product.name).replace(/[<>&]/g, '')}</p>`, vendor: 'MARKET HUB',
    product_type: String(product.category || 'General'), handle: String(product.sku).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    created_at: now, updated_at: now, tags: String(product.category || ''), status: 'active',
    variants,
    image: { src: image }
  };
}

async function shiprocketCategoryFeed() {
  const {listActiveProducts}=require('./db'),products=await listActiveProducts({includeGiftOnly:true});
  const categories = [...new Set(products.map(product => String(product.category || 'General')))].sort();
  return categories.map((title, index) => ({
    id: index + 1,
    title,
    handle: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    body_html: `<p>${title.replace(/[<>&]/g, '')}</p>`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
}

async function shiprocketProductFeed(origin, categoryName = '') {
  const {listActiveProducts}=require('./db'),products=await listActiveProducts({includeGiftOnly:true}),categories=await shiprocketCategoryFeed();
  const categoryIds = new Map(categories.map(category => [category.title, category.id]));
  return products
    .filter(product => !categoryName || String(product.category || 'General') === categoryName)
    .map(product => ({ ...shiprocketProductPayload(product, origin), collection_id: categoryIds.get(String(product.category || 'General')) || 1 }));
}

function shiprocketPage(url) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100));
  return { page, limit, from: (page - 1) * limit };
}

async function checkoutCartWithGifts(request, cart) {
  const db=require('./db'),purchasedLines=await db.checkoutCartItems(cart);
  const subtotalInr=purchasedLines.reduce((total,line)=>total+Number(line.price||0)*Number(line.quantity||0),0);
  const userId=validCustomerSession(request);
  const hasPreviousOrder=userId?await db.customerHasPreviousOrder(userId):true;
  const giftSkus=db.eligibleCheckoutGiftSkus({subtotalInr,hasPreviousOrder});
  const giftLines=[];
  for(const sku of giftSkus){
    try{giftLines.push(...await db.checkoutCartItems([{sku,quantity:1}],undefined,{includeGiftOnly:true,freeGift:true}));}
    catch(error){console.warn(`Checkout gift ${sku} was skipped:`,error.message);}
  }
  return {purchasedLines,giftLines,subtotalInr,hasPreviousOrder};
}

async function prepareShiprocketCart(request, cart) {
  const db=require('./db');
  const {purchasedLines,giftLines}=await checkoutCartWithGifts(request,cart);
  const lines=[...purchasedLines,...giftLines];
  const seen = new Set();
  const itemQuantities = new Map();
  for (const line of lines) {
    if (!seen.has(line.productId)) {
      // Fastrr Checkout validates variants against its catalogue before it
      // creates a checkout token, so send the product to its catalogue first.
      const product=await db.productById(line.productId);if(!product)throw new Error('A checkout product is no longer available.');
      const payload=shiprocketProductPayload(product,publicOrigin(request),{freeGift:line.isGiftOnly});
      const synced=await shiprocketCheckout('/wh/v1/custom/product',payload);
      console.info('Shiprocket Checkout catalog item synced:',{
        productId:payload.id,variantIds:payload.variants.map(variant=>variant.id),
        responseOk:synced?.ok!==false,resultKeys:Object.keys(synced?.result||{})
      });
      seen.add(line.productId);
    }
    const variantId=String(line.checkoutVariantId);
    itemQuantities.set(variantId,(itemQuantities.get(variantId)||0)+Number(line.quantity||0));
  }
  return [...itemQuantities].map(([variant_id,quantity])=>({variant_id,quantity}));
}

const cleanShippingText = value => String(value || '').trim().replace(/[<>]/g, '').slice(0, 200);
const shippingPhone = value => String(value || '').replace(/\D/g, '').slice(-10);
async function shiprocketShippingPayload(checkoutOrder, savedOrder) {
  const address = checkoutOrder.shipping_address || {};
  const firstName = cleanShippingText(address.first_name || checkoutOrder.customer_name || 'MARKET HUB customer') || 'MARKET HUB customer';
  const lastName = cleanShippingText(address.last_name);
  const phone = shippingPhone(address.phone || checkoutOrder.phone);
  const pincode = String(address.pincode || '').replace(/\D/g, '').slice(0, 6);
  const line1 = cleanShippingText(address.line1 || address.address);
  const city = cleanShippingText(address.city);
  const state = cleanShippingText(address.state);
  if (!phone || !pincode || !line1 || !city || !state) throw new Error('The checkout order needs a complete delivery address before it can be sent to Shiprocket.');
  const {shiprocketOrderItems}=require('./db'),savedItems=await shiprocketOrderItems(savedOrder.id);
  let weightGrams = 0;
  const orderItems = [];
  for (const item of savedItems) {
    const units=Math.max(1,item.quantity),optionLabel=Object.entries(item.options||{}).map(([name,value])=>`${name}: ${value}`).join(', ');
    weightGrams += Math.max(100,Number(item.weightGrams||500)) * units;
    orderItems.push({
      sku:String(item.sku),name:cleanShippingText(optionLabel?`${item.name} (${optionLabel})`:item.name),units,
      selling_price:Number(item.price||0).toFixed(2),discount:0
    });
  }
  if (!orderItems.length) throw new Error('The checkout order has no valid products to send to Shiprocket.');
  const paymentType = String(checkoutOrder.payment_type || '').toUpperCase();
  const total = Math.max(0, Number(checkoutOrder.total_amount_payable || checkoutOrder.subtotal_price || 0));
  const payload = {
    order_id: `MH${savedOrder.orderNumber}`,
    order_date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    channel_id: config.shiprocketChannelId,
    billing_customer_name: firstName, billing_last_name: lastName,
    billing_address: line1, billing_address_2: cleanShippingText(address.line2),
    billing_city: city, billing_pincode: pincode, billing_state: state, billing_country: 'India',
    billing_email: cleanShippingText(address.email || checkoutOrder.email), billing_phone: phone,
    shipping_is_billing: true,
    order_items: orderItems,
    payment_method: paymentType === 'CASH_ON_DELIVERY' || paymentType === 'COD' ? 'COD' : 'Prepaid',
    sub_total: total.toFixed(2), length: 15, breadth: 15, height: 10,
    weight: Math.max(0.5, weightGrams / 1000)
  };
  if (config.shiprocketPickupLocation) payload.pickup_location = config.shiprocketPickupLocation;
  return payload;
}

function shouldCreateShippingOrder(order) {
  return !['FAILED', 'CANCELLED', 'CANCELLED_BY_USER'].includes(String(order?.status || '').toUpperCase());
}

async function calculateCartTotal(cart) {
  let totalPaise = 0;
  const {checkoutCartItems}=require('./db'),lines=await checkoutCartItems(cart);
  for(const line of lines)totalPaise+=Math.round(line.price*100)*line.quantity;
  return totalPaise;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/healthz') {
    return sendJson(res, 200, { ok: true, service: 'market-hub' });
  }
  if (req.method === 'GET' && url.pathname === '/api/readyz') {
    try {
      const { databaseHealth } = require('./db');
      await databaseHealth();
      return sendJson(res, 200, { ok: true, database: 'connected' });
    } catch {
      return sendJson(res, 503, { ok: false, database: 'unavailable' });
    }
  }
  if (req.method==='POST' && url.pathname==='/api/auth/admin/login') {
    const {email='',password=''}=JSON.parse(await readBody(req));
    if(!config.adminEmail||!config.adminPassword) return sendJson(res,503,{authenticated:false,error:'Admin login is not configured.'});
    if(!secureEqual(String(email).trim().toLowerCase(),config.adminEmail)||!secureEqual(String(password),config.adminPassword)) return sendJson(res,401,{authenticated:false,error:'Email or password is incorrect.'});
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Set-Cookie':adminCookie(req,makeAdminSession()),'Cache-Control':'no-store'});return res.end(JSON.stringify({authenticated:true}));
  }
  if (req.method==='POST' && url.pathname==='/api/admin/email/connection-test') {
    if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first, then return here.'});
    if(!config.publicOrigin || req.headers.origin!==config.publicOrigin)return sendJson(res,403,{error:'Use the official storefront to run this test.'});
    try {
      const {database}=require('./db');
      const db=database();
      await db.query('create table if not exists email_connection_test_guard (id integer primary key, attempted_at timestamptz not null)');
      const slot=await db.query(`insert into email_connection_test_guard(id,attempted_at) values(1,now()) on conflict(id) do update set attempted_at=now() where email_connection_test_guard.attempted_at < now()-interval '10 minutes' returning id`);
      if(!slot.rowCount)return sendJson(res,429,{error:'A test was attempted recently. Check Brevo logs and wait 10 minutes before retrying.'});
      const {sendConnectionTest}=require('./.private/brevo-mail');
      return sendJson(res,200,await sendConnectionTest());
    }catch(error){return sendJson(res,503,{error:/^(Brevo |Email provider)/.test(error.message)?error.message:'Email test is unavailable. Check server configuration.'});}
  }
  if (req.method==='GET' && url.pathname==='/api/auth/admin/session') return sendJson(res,200,{authenticated:validAdminSession(req)});
  if (req.method==='POST' && url.pathname==='/api/auth/admin/logout') { res.writeHead(204,{'Set-Cookie':'mh_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return res.end(); }
  if (req.method === 'POST' && url.pathname === '/api/auth/customer/register') {
    try {
      const { registerCustomer } = require('./db');
      const customer = await registerCustomer(JSON.parse(await readBody(req)));
      res.writeHead(201, {'Content-Type':'application/json; charset=utf-8','Set-Cookie':customerCookie(req, makeCustomerSession(customer.id)),'Cache-Control':'no-store'});
      return res.end(JSON.stringify({authenticated:true, customer:{fullName:customer.full_name,email:customer.email,referralCode:customer.referral_code}}));
    } catch (error) { return sendJson(res,400,{authenticated:false,error:error.message || 'Your account could not be created.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/customer/login') {
    try {
      const { email='', password='' } = JSON.parse(await readBody(req));
      const { authenticateCustomer } = require('./db');
      const customer = await authenticateCustomer(email, password);
      if (!customer) return sendJson(res,401,{authenticated:false,error:'Email or password is incorrect.'});
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Set-Cookie':customerCookie(req, makeCustomerSession(customer.id)),'Cache-Control':'no-store'});
      return res.end(JSON.stringify({authenticated:true,customer:{fullName:customer.fullName,email:customer.email,referralCode:customer.referralCode}}));
    } catch { return sendJson(res,503,{authenticated:false,error:'Customer sign-in is not ready yet.'}); }
  }
  if(req.method==='POST'&&url.pathname==='/api/orders/guest-track'){
    try{const {orderNumber='',contact=''}=JSON.parse(await readBody(req));const {guestOrderTracking}=require('./db');return sendJson(res,200,{tracking:await guestOrderTracking(orderNumber,contact)});}
    catch(error){return sendJson(res,404,{error:error.message||'No order matched those details.'});}
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/customer/logout') {
    res.writeHead(204, {'Set-Cookie':'mh_customer_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}); return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/api/customer/account') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try {
      const { customerAccount } = require('./db'); const account = await customerAccount(userId);
      if (!account) return sendJson(res,401,{authenticated:false});
      return sendJson(res,200,{authenticated:true,account});
    } catch (error) { console.error('Customer account query failed:', error.message); return sendJson(res,503,{authenticated:false,error:'Your account is not ready yet.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/customer/dashboard') {
    const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{authenticated:false});
    try{const {customerDashboard}=require('./db');return sendJson(res,200,{dashboard:await customerDashboard(userId)});}
    catch(error){console.error('Customer dashboard failed:',error.message);return sendJson(res,503,{error:'Your dashboard is not ready yet.'});}
  }
  if (req.method === 'GET' && url.pathname === '/api/customer/orders-v41') {
    const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{authenticated:false});
    try{const {customerOrdersV41}=require('./db');return sendJson(res,200,{orders:await customerOrdersV41(userId,url.searchParams.get('status'))});}
    catch(error){console.error('Customer order list failed:',error.message);return sendJson(res,503,{error:'Your orders are not ready yet.'});}
  }
  const customerOrderRoute=url.pathname.match(/^\/api\/customer\/orders\/(\d+)(?:\/(cancel|buy-again|invoice|tracking))?$/);
  if(customerOrderRoute){
    const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{authenticated:false});
    const number=customerOrderRoute[1],action=customerOrderRoute[2]||'details';
    try{
      const db=require('./db');
      if(req.method==='GET'&&action==='details')return sendJson(res,200,{order:await db.customerOrderDetails(userId,number)});
      if(req.method==='GET'&&action==='tracking')return sendJson(res,200,{tracking:(await db.customerOrderDetails(userId,number)).shipment || null});
      if(req.method==='GET'&&action==='invoice'){const order=await db.customerOrderDetails(userId,number);const pdf=invoicePdf(order);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="MARKET-HUB-${number}.pdf"`,'Content-Length':pdf.length,'Cache-Control':'private, no-store'});return res.end(pdf);}
      if(req.method==='POST'&&action==='cancel')return sendJson(res,200,await db.cancelCustomerOrder(userId,number));
      if(req.method==='POST'&&action==='buy-again')return sendJson(res,200,{items:await db.buyAgainItems(userId,number)});
    }catch(error){return sendJson(res,400,{error:error.message||'The order action could not be completed.'});}
  }
  if(req.method==='GET'&&url.pathname==='/api/customer/coupons'){
    const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{authenticated:false});
    try{const {customerCoupons}=require('./db');return sendJson(res,200,{coupons:await customerCoupons(userId)});}catch(error){return sendJson(res,503,{error:'Coupons are not ready yet.'});}
  }
  if(req.method==='GET'&&url.pathname==='/api/customer/notifications'){
    const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{authenticated:false});
    try{const {customerNotifications}=require('./db');return sendJson(res,200,{notifications:await customerNotifications(userId)});}catch(error){return sendJson(res,503,{error:'Notifications are not ready yet.'});}
  }
  if(req.method==='POST'&&url.pathname==='/api/customer/notifications/read'){
    const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{authenticated:false});
    try{const {id='all'}=JSON.parse(await readBody(req));const {markCustomerNotifications}=require('./db');return sendJson(res,200,await markCustomerNotifications(userId,id));}catch(error){return sendJson(res,400,{error:error.message});}
  }
  if(req.method==='PUT'&&url.pathname==='/api/customer/password'){
    const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{authenticated:false});
    try{const {changeCustomerPassword}=require('./db');return sendJson(res,200,await changeCustomerPassword(userId,JSON.parse(await readBody(req))));}catch(error){return sendJson(res,400,{error:error.message});}
  }
  if (req.method === 'POST' && url.pathname === '/api/loyalty/quote') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false,error:'Sign in to use MARKET HUB Coins.'});
    try {
      const body=JSON.parse(await readBody(req)); const totalPaise=await calculateCartTotal(body.cart || []);
      const { loyaltyQuote } = require('./db'); return sendJson(res,200,await loyaltyQuote(userId,totalPaise/100,body.coins));
    } catch(error) { return sendJson(res,400,{error:error.message || 'Coin value could not be checked.'}); }
  }
  if (req.method==='GET' && url.pathname==='/api/customer/wishlist') { const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{authenticated:false});try{const {customerWishlist}=require('./db');return sendJson(res,200,{skus:await customerWishlist(userId)});}catch{return sendJson(res,503,{error:'Wishlist is not ready yet.'});} }
  if (req.method==='POST' && url.pathname==='/api/customer/wishlist') { const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{authenticated:false,error:'Sign in to save your wishlist.'});try{const body=JSON.parse(await readBody(req));const {saveCustomerWishlist}=require('./db');return sendJson(res,200,{skus:await saveCustomerWishlist(userId,body.sku,body.saved!==false)});}catch(error){return sendJson(res,400,{error:error.message||'Wishlist could not be updated.'});} }
  if (req.method === 'PUT' && url.pathname === '/api/customer/profile') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try { const { updateCustomerProfile } = require('./db'); return sendJson(res,200,{saved:true,profile:await updateCustomerProfile(userId,JSON.parse(await readBody(req)))}); }
    catch (error) { return sendJson(res,400,{saved:false,error:error.message || 'Your profile could not be saved.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/customer/addresses') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try { const { customerAddresses } = require('./db'); return sendJson(res,200,{addresses:await customerAddresses(userId)}); }
    catch (error) { return sendJson(res,503,{error:'Saved addresses are not ready yet.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/customer/addresses') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try { const { saveCustomerAddress } = require('./db'); return sendJson(res,201,{saved:true,...await saveCustomerAddress(userId,JSON.parse(await readBody(req)))}); }
    catch (error) { return sendJson(res,400,{saved:false,error:error.message || 'The address could not be saved.'}); }
  }
  const customerAddressRoute = url.pathname.match(/^\/api\/customer\/addresses\/([0-9a-f-]{36})$/i);
  if (customerAddressRoute && req.method === 'DELETE') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try { const { deleteCustomerAddress } = require('./db'); await deleteCustomerAddress(userId,customerAddressRoute[1]); return sendJson(res,200,{removed:true}); }
    catch (error) { return sendJson(res,400,{removed:false,error:error.message || 'The address could not be removed.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/customer/returns') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try { const { customerReturnItems } = require('./db'); return sendJson(res,200,{items:await customerReturnItems(userId)}); }
    catch (error) { console.error('Customer returns query failed:', error.message); return sendJson(res,503,{error:'Returns are not ready yet.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/customer/orders') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try { const { customerOrders } = require('./db'); return sendJson(res,200,{orders:await customerOrders(userId)}); }
    catch (error) { console.error('Customer orders query failed:', error.message); return sendJson(res,503,{error:'Orders are not ready yet.'}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/customer/reviews') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try { const { customerReviewItems } = require('./db'); return sendJson(res,200,{items:await customerReviewItems(userId)}); }
    catch (error) { console.error('Customer review query failed:', error.message); return sendJson(res,503,{error:'Reviews are not ready yet.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/customer/reviews') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try { const { submitCustomerReview } = require('./db'); return sendJson(res,201,await submitCustomerReview(userId, JSON.parse(await readBody(req)))); }
    catch (error) { return sendJson(res,400,{submitted:false,error:error.message || 'Your review could not be submitted.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/customer/returns') {
    const userId = validCustomerSession(req); if (!userId) return sendJson(res,401,{authenticated:false});
    try { const { requestCustomerReturn } = require('./db'); return sendJson(res,201,await requestCustomerReturn(userId, JSON.parse(await readBody(req)))); }
    catch (error) { return sendJson(res,400,{requested:false,error:error.message || 'The return request could not be submitted.'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/admin/catalogue/import') {
    if (!validAdminSession(req)) return sendJson(res,401,{imported:false,error:'Please sign in to the admin panel first.'});
    try {
      const { importPdfCatalogue } = require('./db');
      const result = await importPdfCatalogue();
      return sendJson(res,200,{imported:true,...result});
    } catch (error) {
      console.error('Catalogue import failed:', error.message);
      return sendJson(res,503,{imported:false,error:'The catalogue could not be imported. Confirm the live database connection and try again.'});
    }
  }
  if (req.method==='GET' && url.pathname==='/api/admin/products') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { listAdminProducts } = require('./db'); return sendJson(res,200,{products:await listAdminProducts()}); }
    catch (error) { console.error('Admin product query failed:', error.message); return sendJson(res,503,{error:'The product database is not ready yet.'}); }
  }
  if (req.method==='GET' && url.pathname==='/api/admin/categories') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const {listAdminCategories}=require('./db');return sendJson(res,200,{categories:await listAdminCategories()}); }
    catch(error){console.error('Admin category query failed:',error.message);return sendJson(res,503,{error:'Categories are not ready yet.'});}
  }
  if (req.method==='POST' && url.pathname==='/api/admin/categories') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const {saveCategory}=require('./db');return sendJson(res,201,{category:await saveCategory(JSON.parse(await readBody(req)))}); }
    catch(error){console.error('Category create failed:',error.message);return sendJson(res,400,{error:error.message||'The category could not be saved.'});}
  }
  if(url.pathname.startsWith('/api/admin/product-import/')){
    if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    if(!allowProductImportRequest(req))return sendJson(res,429,{ok:false,error:{code:'RATE_LIMITED',message:'Too many importer requests. Wait a minute and try again.'}});
    const adminIdentity=config.adminEmail||'MARKET HUB admin',requestId=crypto.randomBytes(6).toString('hex');
    try{
      const db=require('./db');
      if(req.method==='GET'&&url.pathname==='/api/admin/product-import/settings')return sendJson(res,200,{settings:await db.productImportSettings()});
      if(req.method==='PUT'&&url.pathname==='/api/admin/product-import/settings')return sendJson(res,200,{settings:await db.saveProductImportSettings(JSON.parse(await readBody(req)),adminIdentity)});
      if(req.method==='GET'&&url.pathname==='/api/admin/product-import/items')return sendJson(res,200,await db.listProductImports(url.searchParams.get('status')||'',url.searchParams.get('q')||'',url.searchParams.get('page')||1,25));
      if(req.method==='GET'&&url.pathname==='/api/admin/product-import/history')return sendJson(res,200,await db.listProductImportHistory(url.searchParams.get('status')||'',url.searchParams.get('q')||'',url.searchParams.get('page')||1,25));
      if(req.method==='POST'&&url.pathname==='/api/admin/product-import/analyze'){
        const {url:sourceUrl='',intent='analyze'}=JSON.parse(await readBody(req)),settings=await db.productImportSettings();
        const {analyzeUrl,sourceHash,effectiveAllowedDomains}=require('./importers/import-service');
        if(!effectiveAllowedDomains(sourceUrl,settings).length)throw new Error('Add this authorized source domain in Import Settings first. Amazon.in is available automatically.');
        const product=await analyzeUrl(sourceUrl,settings);let item=await db.createProductImportItem(product,sourceHash(product.sourceUrl),adminIdentity);
        if(intent==='draft'&&item.status!=='duplicate')item=await db.saveProductImportItem(item.id,{...product,action:'draft'},adminIdentity);
        return sendJson(res,201,{item});
      }
      if(req.method==='POST'&&url.pathname==='/api/admin/product-import/analyze-bulk'){
        const {urls=[]}=JSON.parse(await readBody(req)),values=[...new Set((Array.isArray(urls)?urls:[]).map(value=>String(value).trim()).filter(Boolean))];
        if(!values.length||values.length>20)throw new Error('Paste between 1 and 20 unique product URLs.');
        const settings=await db.productImportSettings();
        const {analyzeUrl,sourceHash,mapBounded,effectiveAllowedDomains}=require('./importers/import-service');
        if(values.some(sourceUrl=>!effectiveAllowedDomains(sourceUrl,settings).length))throw new Error('Add non-Amazon source domains in Import Settings first.');
        const jobId=await db.createProductImportJob('bulk',values.length,adminIdentity);
        const results=await mapBounded(values,3,async sourceUrl=>{try{const product=await analyzeUrl(sourceUrl,settings);return await db.createProductImportItem(product,sourceHash(product.sourceUrl),adminIdentity,jobId)}catch(error){let domain='invalid';try{domain=new URL(sourceUrl).hostname}catch{}return await db.failProductImportItem(sourceUrl,sourceHash(sourceUrl),domain,error.message,adminIdentity,jobId)}});
        const items=results.map(result=>result.value).filter(Boolean),ready=items.filter(item=>item.status!=='failed').length;await db.completeProductImportJob(jobId,ready,items.length-ready);return sendJson(res,201,{jobId,items});
      }
      const publishImportRoute=url.pathname.match(/^\/api\/admin\/product-import\/([0-9a-f-]{36})\/publish$/i);
      if(publishImportRoute&&req.method==='POST'){const input=JSON.parse(await readBody(req));return sendJson(res,200,{result:await db.publishProductImportItem(publishImportRoute[1],input,adminIdentity)});}
      const deleteImportRoute=url.pathname.match(/^\/api\/admin\/product-import\/([0-9a-f-]{36})$/i);
      if(deleteImportRoute&&req.method==='DELETE')return sendJson(res,200,{result:await db.deleteProductImportDraft(deleteImportRoute[1],adminIdentity)});
      const itemRoute=url.pathname.match(/^\/api\/admin\/product-import\/items\/([0-9a-f-]{36})$/i);
      if(itemRoute&&req.method==='GET')return sendJson(res,200,{item:await db.productImportItem(itemRoute[1])});
      if(itemRoute&&req.method==='PUT'){const input=JSON.parse(await readBody(req));if(input.action==='publish')input.category=await db.validateProductImportCategory(input.category);return sendJson(res,200,{result:await db.saveProductImportItem(itemRoute[1],input,adminIdentity)});}
      return sendJson(res,404,{error:'Importer API route not found.'});
    }catch(error){
      console.error(`[Product Import ${requestId}]`,error?.stack||error);
      const {productImportErrorResponse}=require('./importers/import-errors'),response=productImportErrorResponse(error);
      return sendJson(res,response.status,{...response.body,requestId});
    }
  }
  if (req.method==='GET' && url.pathname==='/api/admin/orders') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { listAdminOrders } = require('./db'); return sendJson(res,200,{orders:await listAdminOrders()}); }
    catch (error) { console.error('Admin order query failed:', error.message); return sendJson(res,503,{error:'Orders are not ready yet.'}); }
  }
  if (req.method==='GET' && url.pathname==='/api/admin/delhivery/shipments') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const {listDelhiveryShipments}=require('./db'); return sendJson(res,200,{ready:delhiveryReady(),shipments:await listDelhiveryShipments()}); }
    catch (error) { console.error('Delhivery shipment list failed:',error.message); return sendJson(res,503,{error:'Shipping orders are not ready yet.'}); }
  }
  const delhiveryCreateRoute=url.pathname.match(/^\/api\/admin\/delhivery\/shipments\/([0-9a-f-]{36})$/i);
  if (delhiveryCreateRoute && req.method==='POST') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    if (!delhiveryReady()) return sendJson(res,503,{error:'Complete the private Delhivery token, client name and pickup location settings first.'});
    try {
      const body=JSON.parse(await readBody(req));
      if(body.confirm !== true) return sendJson(res,400,{error:'Confirm this shipment before creating a live Delhivery waybill.'});
      const db=require('./db'),delhivery=require('./delhivery'),order=await db.delhiveryOrder(delhiveryCreateRoute[1]);
      if(['cancelled','returned','refunded'].includes(String(order.status))) throw new Error('This order cannot be shipped in its current status.');
      const mode=String(order.paymentMethod).toLowerCase()==='cod'?'COD':'Pre-paid';
      const serviceability=await delhivery.checkServiceability(delhiveryConfig(),order.pincode,mode);
      if(!serviceability.serviceable) throw new Error(serviceability.message);
      const reservation=await db.reserveDelhiveryShipment(order.id,config.delhiveryPickupLocation);
      if(!reservation.reserved) return sendJson(res,200,{created:false,existing:true,awb:reservation.awb});
      try {
        const created=await delhivery.createShipment(delhiveryConfig(),order);
        return sendJson(res,201,{created:true,...await db.completeDelhiveryShipment(order.id,created)});
      } catch (error) { await db.failDelhiveryShipment(order.id,error); throw error; }
    } catch(error) {
      console.error('Delhivery shipment creation failed:',error.message);
      return sendJson(res,400,{created:false,error:error.message || 'Delhivery could not create this shipment.'});
    }
  }
  const delhiveryTrackRoute=url.pathname.match(/^\/api\/admin\/delhivery\/shipments\/([0-9a-f-]{36})\/track$/i);
  if (delhiveryTrackRoute && req.method==='POST') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    if (!delhiveryReady()) return sendJson(res,503,{error:'Delhivery is not connected yet.'});
    try {
      const db=require('./db'),delhivery=require('./delhivery'),order=await db.delhiveryOrder(delhiveryTrackRoute[1]);
      if(!order.awb || order.shipmentProvider!=='delhivery') throw new Error('This order does not have a Delhivery waybill yet.');
      const tracking=await delhivery.trackShipment(delhiveryConfig(),order.awb);
      return sendJson(res,200,{tracking:await db.updateDelhiveryTracking(order.id,tracking)});
    } catch(error) { return sendJson(res,400,{error:error.message || 'Delhivery tracking is unavailable.'}); }
  }
  const adminOrderUpdateRoute=url.pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})\/status$/i);
  if(adminOrderUpdateRoute&&req.method==='PUT'){
    if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try{const {adminUpdateOrder}=require('./db');return sendJson(res,200,await adminUpdateOrder(adminOrderUpdateRoute[1],JSON.parse(await readBody(req))));}
    catch(error){return sendJson(res,400,{error:error.message||'The order could not be updated.'});}
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/returns'){
    if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try{const {listAdminReturns}=require('./db');return sendJson(res,200,{returns:await listAdminReturns()});}catch(error){return sendJson(res,503,{error:'Returns are not ready yet.'});}
  }
  const adminReturnRoute=url.pathname.match(/^\/api\/admin\/returns\/([0-9a-f-]{36})$/i);
  if(adminReturnRoute&&req.method==='PUT'){
    if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try{const {adminUpdateReturn}=require('./db');return sendJson(res,200,await adminUpdateReturn(adminReturnRoute[1],JSON.parse(await readBody(req))));}
    catch(error){return sendJson(res,400,{error:error.message||'The return could not be updated.'});}
  }
  if (req.method==='GET' && url.pathname==='/api/admin/loyalty') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { listAdminLoyalty } = require('./db'); return sendJson(res,200,await listAdminLoyalty()); }
    catch (error) { return sendJson(res,503,{error:'Loyalty data is not ready yet.'}); }
  }
  if (req.method==='PUT' && url.pathname==='/api/admin/loyalty/rules') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { setLoyaltyRules } = require('./db'); const body=JSON.parse(await readBody(req)); return sendJson(res,200,{saved:true,rules:await setLoyaltyRules(body,body.reason)}); }
    catch (error) { return sendJson(res,400,{saved:false,error:error.message || 'Loyalty rules could not be saved.'}); }
  }
  const loyaltyAdjustmentRoute=url.pathname.match(/^\/api\/admin\/loyalty\/customers\/([0-9a-f-]{36})\/adjustment$/i);
  if (loyaltyAdjustmentRoute && req.method==='POST') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { adminCoinAdjustment } = require('./db'); return sendJson(res,200,{saved:true,summary:await adminCoinAdjustment(loyaltyAdjustmentRoute[1],JSON.parse(await readBody(req)))}); }
    catch (error) { return sendJson(res,400,{saved:false,error:error.message || 'Coin adjustment could not be saved.'}); }
  }
  const packingVideoRoute = url.pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})\/packing-video$/i);
  if (packingVideoRoute && req.method==='POST') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { savePackingVideo } = require('./db'); return sendJson(res,200,{saved:true,...await savePackingVideo(packingVideoRoute[1], JSON.parse(await readBody(req)))}); }
    catch (error) { return sendJson(res,400,{saved:false,error:error.message || 'The packing video could not be saved.'}); }
  }
  if (req.method==='GET' && url.pathname==='/api/admin/refunds') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { listAdminRefunds } = require('./db'); return sendJson(res,200,{refunds:await listAdminRefunds()}); }
    catch (error) { console.error('Admin refunds query failed:', error.message); return sendJson(res,503,{error:'Refunds are not ready yet.'}); }
  }
  if (req.method==='GET' && url.pathname==='/api/admin/reviews') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { listAdminReviews } = require('./db'); return sendJson(res,200,{reviews:await listAdminReviews()}); }
    catch (error) { console.error('Admin review query failed:', error.message); return sendJson(res,503,{error:'Reviews are not ready yet.'}); }
  }
  const reviewApprovalRoute = url.pathname.match(/^\/api\/admin\/reviews\/([0-9a-f-]{36})\/approval$/i);
  if (reviewApprovalRoute && req.method==='POST') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { approved } = JSON.parse(await readBody(req)); const { approveReview } = require('./db'); await approveReview(reviewApprovalRoute[1], approved === true); return sendJson(res,200,{updated:true}); }
    catch (error) { return sendJson(res,400,{updated:false,error:error.message || 'The review could not be updated.'}); }
  }
  const reviewDeleteRoute = url.pathname.match(/^\/api\/admin\/reviews\/([0-9a-f-]{36})$/i);
  if (reviewDeleteRoute && req.method==='DELETE') { if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const {deleteReview}=require('./db');await deleteReview(reviewDeleteRoute[1]);return sendJson(res,200,{deleted:true});}catch(error){return sendJson(res,400,{error:error.message||'Review could not be deleted.'});} }
  const refundRoute = url.pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})\/refund$/i);
  if (refundRoute && req.method==='POST') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { refundOrderToWallet } = require('./db'); return sendJson(res,200,{refunded:true,...await refundOrderToWallet(refundRoute[1], JSON.parse(await readBody(req)))}); }
    catch (error) { console.error('Wallet refund failed:', error.message); return sendJson(res,400,{refunded:false,error:error.message || 'The wallet refund could not be approved.'}); }
  }
  const productRoute = url.pathname.match(/^\/api\/admin\/products\/([0-9a-f-]{36})$/i);
  if (req.method==='POST' && url.pathname==='/api/admin/checkout-gifts/setup') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try {
      const { listAdminProducts, saveProduct } = require('./db');
      const existing = await listAdminProducts();
      const gifts = [
        {
          name:'First Order Mystery Gift',category:'Checkout Gifts',sku:'MH-GIFT-MYSTERY',price:199,mrp:199,stock:9999,
          weight_grams:250,description:'A complimentary mystery gift reserved for eligible first-time MARKET HUB customers.',
          images:[`${publicOrigin(req)}/assets/mystery-gift.png`],gift_only:true
        },
        {
          name:'Premium Free Tumbler',category:'Checkout Gifts',sku:'MH-GIFT-TUMBLER',price:499,mrp:499,stock:9999,
          weight_grams:400,description:'A complimentary premium tumbler reserved for eligible MARKET HUB orders above ₹999.',
          images:[`${publicOrigin(req)}/assets/free-tumbler.png`],gift_only:true
        }
      ];
      const saved=[];
      for (const gift of gifts) {
        const current=existing.find(product=>String(product.sku).toUpperCase()===gift.sku);
        const product=await saveProduct(gift,current?.id||null);
        saved.push(product);
        await shiprocketCheckout('/wh/v1/custom/product',shiprocketProductPayload(product,publicOrigin(req)));
      }
      return sendJson(res,200,{configured:true,products:saved.map(product=>({id:product.id,sku:product.sku,stock:product.stock_quantity}))});
    } catch (error) {
      console.error('Checkout gift setup failed:',error.message);
      return sendJson(res,400,{configured:false,error:error.message||'Checkout gifts could not be configured.'});
    }
  }
  if (req.method==='POST' && url.pathname==='/api/admin/products') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { saveProduct } = require('./db'); return sendJson(res,201,{product:await saveProduct(JSON.parse(await readBody(req)))}); }
    catch (error) { console.error('Product create failed:', error.message); return sendJson(res,400,{error:error.message||'The product could not be saved.'}); }
  }
  if (productRoute && req.method==='PUT') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { saveProduct } = require('./db'); return sendJson(res,200,{product:await saveProduct(JSON.parse(await readBody(req)),productRoute[1])}); }
    catch (error) { console.error('Product update failed:', error.message); return sendJson(res,400,{error:error.message||'The product could not be updated.'}); }
  }
  if (productRoute && req.method==='DELETE') {
    if (!validAdminSession(req)) return sendJson(res,401,{error:'Please sign in to the admin panel first.'});
    try { const { deactivateProduct } = require('./db'); await deactivateProduct(productRoute[1]); return sendJson(res,200,{removed:true}); }
    catch (error) { console.error('Product removal failed:', error.message); return sendJson(res,400,{error:error.message||'The product could not be removed.'}); }
  }
  if (req.method==='GET' && url.pathname==='/api/health/database') {
    try { const { databaseHealth } = require('./db'); return sendJson(res,200,{connected:await databaseHealth()}); }
    catch (error) { console.error('Database connection failed:', error.message); return sendJson(res,503,{connected:false,error:'Database connection is not ready.'}); }
  }
  if (req.method==='GET' && url.pathname==='/api/products') {
    try {
      const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
      const limit = Math.min(24, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '24', 10) || 24));
      const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const category = String(url.searchParams.get('category') || '').trim().toLowerCase();
      const sort = String(url.searchParams.get('sort') || 'latest');
      const { listActiveProducts } = require('./db');
      let products = await listActiveProducts();
      if (query) products = products.filter(item => `${item.name} ${item.category} ${item.sku} ${(item.variants||[]).map(variant=>`${variant.sku} ${Object.values(variant.options||{}).join(' ')}`).join(' ')}`.toLowerCase().includes(query));
      if (category) products = products.filter(item => String(item.category || '').toLowerCase() === category);
      if (sort === 'price-low') products.sort((a,b) => Number(a.price_inr) - Number(b.price_inr));
      if (sort === 'price-high') products.sort((a,b) => Number(b.price_inr) - Number(a.price_inr));
      if (sort === 'name') products.sort((a,b) => String(a.name).localeCompare(String(b.name)));
      const total = products.length;
      const from = (page - 1) * limit;
      return sendJson(res,200,{products:products.slice(from,from + limit),page,limit,total,hasMore:from + limit < total});
    }
    catch (error) { console.error('Product query failed:', error.message); return sendJson(res,503,{error:'Product catalogue database is not ready.'}); }
  }
  if(req.method==='GET'&&url.pathname==='/api/categories'){
    try{const {listActiveCategoryNames}=require('./db');return sendJson(res,200,{categories:await listActiveCategoryNames()});}
    catch(error){console.error('Category query failed:',error.message);return sendJson(res,503,{error:'Product categories are not ready.'});}
  }
  const publicProductRoute=url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if(req.method==='GET'&&publicProductRoute){try{const {productBySku}=require('./db'),product=await productBySku(decodeURIComponent(publicProductRoute[1]));return product?sendJson(res,200,{product}):sendJson(res,404,{error:'Product not found.'});}catch(error){console.error('Product detail query failed:',error.message);return sendJson(res,503,{error:'Product details are not ready.'});}}
  if (req.method==='GET' && url.pathname==='/api/reviews') {
    try { const { publicReviewsBySku } = require('./db'); const reviews=await publicReviewsBySku(url.searchParams.get('sku'),url.searchParams.get('sort'));const averageRating=reviews.length?Number((reviews.reduce((sum,item)=>sum+item.rating,0)/reviews.length).toFixed(1)):0; return sendJson(res,200,{reviews,averageRating,reviewCount:reviews.length}); }
    catch (error) { console.error('Public review query failed:', error.message); return sendJson(res,503,{error:'Reviews are not available yet.'}); }
  }
  if (req.method==='GET' && url.pathname==='/api/reviews/summary') { try{const {reviewSummary}=require('./db');return sendJson(res,200,{summary:await reviewSummary((url.searchParams.get('skus')||'').split(','))});}catch{return sendJson(res,503,{summary:{}});} }
  const helpfulRoute=url.pathname.match(/^\/api\/reviews\/([0-9a-f-]{36})\/helpful$/i);
  if(helpfulRoute && req.method==='POST'){const userId=validCustomerSession(req);if(!userId)return sendJson(res,401,{error:'Sign in to mark a review helpful.'});try{const {voteReviewHelpful}=require('./db');return sendJson(res,200,{helpfulCount:await voteReviewHelpful(userId,helpfulRoute[1])});}catch(error){return sendJson(res,400,{error:error.message||'Helpful vote could not be saved.'});}}
  // Smart recommendations are first-party and non-critical: failures never affect shopping.
  if(req.method==='POST'&&url.pathname==='/api/activity/events'){try{const body=JSON.parse(await readBody(req));const {track}=require('./recommendations');const userId=validCustomerSession(req);return sendJson(res,202,await track({...body,userId:userId||null}));}catch(error){return sendJson(res,400,{recorded:false,error:error.message||'Activity event was not accepted.'});}}
  if(req.method==='GET'&&url.pathname==='/api/recommendations/home'){try{const {home}=require('./recommendations');return sendJson(res,200,await home({userId:validCustomerSession(req),sessionId:req.headers['x-mh-session']},url.searchParams.get('limit')));}catch(error){return sendJson(res,200,{continueShopping:[],recommended:[],trending:[],bestSellers:[],newArrivals:[],recentlyViewed:[]});}}
  if(req.method==='GET'&&url.pathname==='/api/recommendations/recently-viewed'){try{const {recent}=require('./recommendations');return sendJson(res,200,{products:await recent({userId:validCustomerSession(req),sessionId:req.headers['x-mh-session']},url.searchParams.get('limit'))});}catch{return sendJson(res,200,{products:[]});}}
  const recommendationProductRoute=url.pathname.match(/^\/api\/recommendations\/product\/([^/]+)$/);
  if(req.method==='GET'&&recommendationProductRoute){try{const {product}=require('./recommendations');const value=await product(decodeURIComponent(recommendationProductRoute[1]),{userId:validCustomerSession(req),sessionId:req.headers['x-mh-session']},url.searchParams.get('limit'));return value?sendJson(res,200,value):sendJson(res,404,{error:'Product not found.'});}catch{return sendJson(res,200,{similar:[],frequentlyBoughtTogether:[],recentlyViewed:[],alternatives:[]});}}
  if(req.method==='GET'&&url.pathname==='/api/admin/recommendations'){if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const {admin}=require('./recommendations');return sendJson(res,200,await admin());}catch{return sendJson(res,200,{mostViewed:[],mostWishlisted:[],mostAddedToCart:[],recommendationClicks:[],trending:[],bestSellers:[]});}}
  if(req.method==='GET'&&url.pathname==='/api/discovery/search'){try{const {search}=require('./discovery');return sendJson(res,200,await search(url.searchParams.get('q'),url.searchParams.get('limit')));}catch{return sendJson(res,200,{products:[],categories:[],brands:[],suggestion:null});}}
  if(req.method==='POST'&&url.pathname==='/api/discovery/search-events'){try{const body=JSON.parse(await readBody(req));const {recordSearch}=require('./discovery');return sendJson(res,202,await recordSearch({...body,userId:validCustomerSession(req)||null}));}catch{return sendJson(res,202,{recorded:false});}}
  if(req.method==='GET'&&url.pathname==='/api/discovery/compare'){try{const {compare}=require('./discovery');return sendJson(res,200,await compare((url.searchParams.get('skus')||'').split(',')));}catch(error){return sendJson(res,400,{error:error.message||'Products could not be compared.'});}}
  if(req.method==='GET'&&url.pathname==='/api/admin/discovery'){if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const {analytics}=require('./discovery');return sendJson(res,200,await analytics());}catch{return sendJson(res,200,{topSearches:[],zeroResults:[],searchCtr:[{clicks:0,searches:0}]});}}
  if(req.method==='GET'&&url.pathname==='/api/admin/bi/overview'){if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const {value}=require('./business-intelligence');return sendJson(res,200,await value());}catch{return sendJson(res,200,{todayRevenue:0,todayOrders:0,weeklyRevenue:0,monthlyRevenue:0,averageOrderValue:0,newCustomers:0,returningCustomers:0,activeCustomers:0,repeatCustomerPercent:0,topCategory:'—',topProduct:'—',trendingProduct:'—',inventory:{outOfStock:0,lowStock:0,total:0},wishlistGrowth:0,searches:[],zeroSearches:[],searchCtr:0,trending:[],bestSellers:[],suggestions:[]});}}
  if(req.method==='GET'&&url.pathname==='/api/admin/bi/report'){if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const {report}=require('./business-intelligence');return sendJson(res,200,await report(url.searchParams.get('period')));}catch{return sendJson(res,503,{error:'Report data is temporarily unavailable.'});}}
  if(req.method==='POST'&&url.pathname==='/api/admin/bi/assistant'){if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const body=JSON.parse(await readBody(req));const {answer}=require('./business-intelligence');return sendJson(res,200,await answer(String(body.question||'').slice(0,140)));}catch{return sendJson(res,400,{error:'The business assistant could not answer that question.'});}}
  if(url.pathname.startsWith('/api/admin/marketing')){if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const m=require('./marketing');if(req.method==='GET'&&url.pathname==='/api/admin/marketing/overview')return sendJson(res,200,await m.overview());if(req.method==='GET'&&url.pathname==='/api/admin/marketing/campaigns')return sendJson(res,200,{campaigns:await m.campaigns()});if(req.method==='POST'&&url.pathname==='/api/admin/marketing/campaigns')return sendJson(res,201,{campaign:await m.saveCampaign(JSON.parse(await readBody(req)))});if(req.method==='GET'&&url.pathname==='/api/admin/marketing/banners')return sendJson(res,200,{banners:await m.banners()});if(req.method==='GET'&&url.pathname==='/api/admin/marketing/assistant')return sendJson(res,200,await m.assistant());return sendJson(res,404,{error:'Marketing endpoint not found.'});}catch(error){return sendJson(res,400,{error:error.message||'Marketing data is unavailable.'});}}
  if(url.pathname.startsWith('/api/admin/marketplace')||url.pathname.startsWith('/api/admin/channel')||url.pathname==='/api/admin/channels'||url.pathname==='/api/admin/inventory'||url.pathname==='/api/admin/sync'){if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const m=require('./marketplace');if(req.method==='GET'&&url.pathname==='/api/admin/channels')return sendJson(res,200,{channels:await m.channels()});if(req.method==='GET'&&url.pathname==='/api/admin/channels/analytics')return sendJson(res,200,await m.analytics());if(req.method==='GET'&&url.pathname==='/api/admin/inventory')return sendJson(res,200,{products:await m.inventory()});const found=url.pathname.match(/^\/api\/admin\/channel\/([^/]+)\/status$/);if(req.method==='GET'&&found)return sendJson(res,200,{channel:await m.status(found[1])});if(req.method==='POST'&&url.pathname==='/api/admin/channel/connect')return sendJson(res,200,await m.configure(JSON.parse(await readBody(req))));if(req.method==='POST'&&url.pathname==='/api/admin/sync')return sendJson(res,202,{job:await m.requestSync(JSON.parse(await readBody(req)))});return sendJson(res,404,{error:'Marketplace endpoint not found.'});}catch(error){return sendJson(res,400,{error:error.message||'Marketplace data is unavailable.'});}}
  if(url.pathname.startsWith('/api/admin/enterprise')||url.pathname==='/api/admin/warehouses'||url.pathname==='/api/admin/suppliers'||url.pathname==='/api/admin/purchase-orders'||url.pathname==='/api/admin/transfers'||url.pathname==='/api/admin/audit-logs'){if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const e=require('./enterprise-v38');if(req.method==='GET'&&url.pathname==='/api/admin/enterprise/overview')return sendJson(res,200,await e.overview());if(req.method==='GET'&&url.pathname==='/api/admin/warehouses')return sendJson(res,200,{warehouses:await e.list('warehouses')});if(req.method==='POST'&&url.pathname==='/api/admin/warehouses')return sendJson(res,201,{warehouse:await e.saveWarehouse(JSON.parse(await readBody(req)))});if(req.method==='GET'&&url.pathname==='/api/admin/suppliers')return sendJson(res,200,{suppliers:await e.list('suppliers')});if(req.method==='POST'&&url.pathname==='/api/admin/suppliers')return sendJson(res,201,{supplier:await e.saveSupplier(JSON.parse(await readBody(req)))});if(req.method==='GET'&&url.pathname==='/api/admin/purchase-orders')return sendJson(res,200,{purchaseOrders:await e.list('purchase_orders')});if(req.method==='GET'&&url.pathname==='/api/admin/transfers')return sendJson(res,200,{transfers:await e.list('warehouse_transfers')});if(req.method==='GET'&&url.pathname==='/api/admin/audit-logs')return sendJson(res,200,{logs:await e.list('enterprise_audit_logs')});return sendJson(res,404,{error:'Enterprise endpoint not found.'});}catch(error){return sendJson(res,400,{error:error.message||'Enterprise data is unavailable.'});}}
  if(url.pathname.startsWith('/api/mobile')){if(!validAdminSession(req))return sendJson(res,401,{error:'Please sign in to the admin panel first.'});try{const m=require('./mobile-v39');if(req.method==='GET'&&url.pathname==='/api/mobile/dashboard')return sendJson(res,200,await m.dashboard());if(req.method==='GET'&&url.pathname==='/api/mobile/inventory')return sendJson(res,200,{products:await m.inventory(url.searchParams.get('q'))});if(req.method==='POST'&&url.pathname==='/api/mobile/operations')return sendJson(res,202,await m.queueEvent(JSON.parse(await readBody(req))));return sendJson(res,404,{error:'Mobile endpoint not found.'});}catch(error){return sendJson(res,400,{error:error.message||'Mobile operations are unavailable.'});}}
  // Optional Custom Platform endpoints. They can be added in Shiprocket's
  // Custom Endpoints settings to allow a full catalogue refresh at any time.
  if (req.method==='GET' && url.pathname==='/api/shiprocket/catalog/products') {
    const { page, limit, from } = shiprocketPage(url);
    const categoryId = Number.parseInt(url.searchParams.get('collection_id') || '', 10);
    const categories = await shiprocketCategoryFeed();
    const selectedCategory = Number.isInteger(categoryId) ? categories.find(category => category.id === categoryId)?.title : '';
    const products = await shiprocketProductFeed(publicOrigin(req), selectedCategory || '');
    return sendJson(res,200,{data:{total:products.length,products:products.slice(from,from + limit),page,limit}});
  }
  if (req.method==='GET' && url.pathname==='/api/shiprocket/catalog/collections') {
    const { page, limit, from } = shiprocketPage(url);
    const collections = await shiprocketCategoryFeed();
    return sendJson(res,200,{data:{total:collections.length,collections:collections.slice(from,from + limit),page,limit}});
  }
  if (req.method==='GET' && url.pathname==='/api/config/payment') return sendJson(res, 200, {ready:Boolean(config.razorpayKeyId && config.razorpayKeySecret),keyId:config.razorpayKeyId,logo:config.logo});
  if (req.method==='GET' && url.pathname==='/api/config/shipping') return sendJson(res, 200, {provider:'Delhivery',ready:delhiveryReady(),pickupLocation:config.delhiveryPickupLocation,cashOnDelivery:config.delhiveryCodEnabled});
  if (req.method==='GET' && url.pathname==='/api/config/shiprocket-checkout') return sendJson(res, 200, {
    ready:Boolean(config.shiprocketCheckoutApiKey && config.shiprocketCheckoutSecret),
    webhookReady:Boolean(config.shiprocketCheckoutWebhookSecret)
  });
  if (req.method==='GET' && url.pathname==='/api/config/shiprocket-shipping') return sendJson(res, 200, {ready:Boolean(config.shiprocketApiEmail && config.shiprocketApiPassword && config.shiprocketChannelId),channelId:config.shiprocketChannelId || null});
  if (req.method==='POST' && url.pathname==='/api/checkout/gift-preview') {
    try {
      const {cart=[]}=JSON.parse(await readBody(req));
      const {giftLines,subtotalInr,hasPreviousOrder}=await checkoutCartWithGifts(req,cart);
      const grouped=new Map();
      for(const line of giftLines){
        const key=String(line.variantSku||line.productSku);
        const existing=grouped.get(key)||{sku:key,name:line.name,quantity:0,image:line.image||'',kind:key==='MH-GIFT-TUMBLER'?'tumbler':'mystery'};
        existing.quantity+=Number(line.quantity||0);grouped.set(key,existing);
      }
      return sendJson(res,200,{subtotalInr,hasPreviousOrder,authenticated:Boolean(validCustomerSession(req)),gifts:[...grouped.values()]});
    } catch(error) { return sendJson(res,400,{error:error.message||'Gift preview is unavailable.',gifts:[]}); }
  }
  if (req.method==='GET' && url.pathname==='/api/shipping/estimate') {
    try {
      if(delhiveryReady()) {
        const {checkServiceability}=require('./delhivery');
        return sendJson(res,200,await checkServiceability(delhiveryConfig(),url.searchParams.get('pincode'),url.searchParams.get('cod')==='true'?'COD':'Pre-paid'));
      }
      return sendJson(res,200,await shiprocketDeliveryEstimate(url.searchParams.get('pincode'),url.searchParams.get('weightGrams')));
    }
    catch (error) { console.warn('Delivery estimate failed:',error.message); return sendJson(res,200,{serviceable:null,message:'Delivery estimate is temporarily unavailable. Checkout will confirm delivery options.'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/checkout/shiprocket/access-token') {
    try {
      const { cart=[] } = JSON.parse(await readBody(req));
      const items = await prepareShiprocketCart(req, cart);
      const checkout = await shiprocketCheckout('/api/v1/access-token/checkout', {
        cart_data: { items }, redirect_url: `${publicOrigin(req)}/checkout-success.html`, timestamp: new Date().toISOString()
      });
      checkoutPaymentDiagnostic(checkout);
      const token = checkout.result?.token;
      if (!token) throw new Error('Shiprocket Checkout did not return a checkout token.');
      return sendJson(res,200,{token,expiresAt:checkout.result?.expires_at || null});
    } catch (error) {
      console.error('Shiprocket Checkout start failed:', error.message);
      return sendJson(res,502,{error:error.message || 'Shiprocket Checkout could not start. Your cart is still saved.'});
    }
  }
  if (req.method==='POST' && url.pathname==='/api/webhooks/shiprocket-checkout/order') {
    try {
      const raw = await readBody(req);
      if (!shiprocketWebhookTrusted(req, raw)) {
        return sendJson(res,401,{error:'Shiprocket Checkout webhook authentication failed.'});
      }
      const order = JSON.parse(raw);
      const { recordShiprocketOrder, reserveShiprocketShipment, completeShiprocketShipment, releaseShiprocketShipment } = require('./db');
      const saved = await recordShiprocketOrder(order);
      let shipmentCreated = false;
      if (shouldCreateShippingOrder(order) && config.shiprocketApiEmail && config.shiprocketApiPassword && config.shiprocketChannelId) {
        const reservation = await reserveShiprocketShipment(saved.id, config.shiprocketPickupLocation);
        if (reservation.reserved) {
          try {
            const shippingOrder = await shiprocketShipping('/v1/external/orders/create', await shiprocketShippingPayload(order, saved));
            await completeShiprocketShipment(saved.id, shippingOrder);
            shipmentCreated = true;
          } catch (shippingError) {
            await releaseShiprocketShipment(saved.id);
            throw shippingError;
          }
        }
      }
      console.log('Shiprocket Checkout order saved:', saved.orderNumber, order.status || 'unknown');
      return sendJson(res,200,{received:true,orderNumber:saved.orderNumber,shipmentCreated});
    } catch (error) { console.error('Shiprocket checkout webhook failed:', error.message); return sendJson(res,502,{error:error.message || 'The checkout order could not be sent to Shiprocket shipping.'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/webhooks/shiprocket-checkout') {
    const raw=await readBody(req);
    let payload; try { payload=JSON.parse(raw); } catch { return sendJson(res,400,{error:'Invalid webhook body.'}); }
    const trusted=shiprocketWebhookTrusted(req,raw); const details=shiprocketEventDetails(payload,raw);
    try {
      const { recordShiprocketEvent } = require('./db');
      const result=await recordShiprocketEvent({...details,trusted,status:payload.status || payload.data?.status || ''});
      console.log('Shiprocket Checkout event recorded',{event:details.type,trusted,duplicate:result.duplicate});
      return sendJson(res,200,{received:true,duplicate:Boolean(result.duplicate)});
    } catch(error) { console.error('Shiprocket Checkout event failed:',error.message); return sendJson(res,502,{error:'Webhook event could not be recorded.'}); }
  }
  if (req.method==='POST' && url.pathname==='/api/payments/razorpay/order') {
    if (!config.razorpayKeyId || !config.razorpayKeySecret) return sendJson(res, 503, {error:'Razorpay keys are not configured on the server.'});
    const {cart=[]} = JSON.parse(await readBody(req));
    if (!Array.isArray(cart) || !cart.length || cart.length>50) return sendJson(res, 400, {error:'Your cart is invalid.'});
    let totalPaise;
    try { totalPaise = await calculateCartTotal(cart); }
    catch (error) { return sendJson(res,400,{error:error.message||'A cart item is no longer available.'}); }
    const receipt=`mh_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const order=await razorpay('/orders',{amount:totalPaise,currency:'INR',receipt,notes:{store:'MARKET HUB'}});
    return sendJson(res,200,{orderId:order.id,amount:order.amount,receipt});
  }
  if (req.method==='POST' && url.pathname==='/api/payments/razorpay/verify') {
    if (!config.razorpayKeySecret) return sendJson(res,503,{verified:false,error:'Payment verification is not configured.'});
    const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=JSON.parse(await readBody(req));
    if (!razorpay_order_id||!razorpay_payment_id||!razorpay_signature) return sendJson(res,400,{verified:false,error:'Missing payment details.'});
    const expected=crypto.createHmac('sha256',config.razorpayKeySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (!secureEqual(expected,razorpay_signature)) return sendJson(res,400,{verified:false,error:'Payment signature did not match.'});
    // TODO: Persist the verified payment and create the customer order in PostgreSQL.
    return sendJson(res,200,{verified:true});
  }
  if (req.method==='POST' && url.pathname==='/api/webhooks/razorpay') {
    const raw=await readBody(req); const signature=req.headers['x-razorpay-signature'];
    if (!config.razorpayWebhookSecret) return sendJson(res,503,{error:'Webhook secret is not configured.'});
    const expected=crypto.createHmac('sha256',config.razorpayWebhookSecret).update(raw).digest('hex');
    if (!secureEqual(expected,signature)) return sendJson(res,400,{error:'Invalid webhook signature.'});
    // TODO: Store payment/order updates and make this handler idempotent once the database is connected.
    return sendJson(res,200,{received:true});
  }
  return false;
}

function premiumHtml(data) {
  const html=data.toString('utf8');
  const premium=html.includes('premium-renovation-v32.css')?html:html.replace('</head>','<link rel="stylesheet" href="/premium-renovation-v32.css"></head>').replace('</body>','<script src="/premium-renovation-v32.js" defer></script></body>');
  if(premium.includes('mobile-navigation-v41-1.js'))return premium;
  return premium.replace('</head>','<link rel="stylesheet" href="/mobile-navigation-v41-1.css?v=41.1"></head>').replace('</body>','<script src="/mobile-navigation-v41-1.js?v=41.1" defer></script></body>');
}

async function requestHandler(req,res) {
  try {
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if (url.pathname.startsWith('/api/')) { const handled=await handleApi(req,res,url); if (handled!==false) return; return sendJson(res,404,{error:'API route not found.'}); }
    let pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    if((pathname==='/admin.html'||pathname==='/admin-import.html')&&!validAdminSession(req)) pathname='/admin-login.html';
    if((pathname==='/account.html'||pathname==='/order-details.html')&&!validCustomerSession(req)){
      const redirect=pathname==='/order-details.html'?`/order-details.html${url.search}`:'/account.html';
      res.writeHead(302,{'Location':`/login.html?redirect=${encodeURIComponent(redirect)}`,'Cache-Control':'no-store'});return res.end();
    }
    if (pathname.includes('..') || pathname.split('/').some(part=>part.startsWith('.'))) { res.writeHead(403); return res.end('Forbidden'); }
    const file=path.join(root,pathname);
    fs.readFile(file,(error,data)=>{ if(error){res.writeHead(404);return res.end('Not found');}const isCustomerHtml=path.extname(file)==='.html'&&!['/admin.html','/admin-login.html'].includes(pathname);const html=isCustomerHtml?premiumHtml(data):data;res.writeHead(200,{'Content-Type':contentTypes[path.extname(file)]||'application/octet-stream','Cache-Control':path.extname(file)==='.html'?'no-cache':'public, max-age=86400'});res.end(html); });
  } catch (error) { console.error(error); sendJson(res,500,{error:'Unexpected server error.'}); }
}

if (require.main === module) {
  http.createServer(requestHandler).listen(config.port,()=>console.log(`MARKET HUB server: http://localhost:${config.port}`));
}

module.exports = requestHandler;

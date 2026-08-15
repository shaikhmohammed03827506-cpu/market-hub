// Server-only PostgreSQL access. DATABASE_URL must exist only in .env or hosting secrets.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let pool;
let orderSchemaReady;
let rewardsSchemaReady;
let customerExperienceSchemaReady;
let engagementSchemaReady;
let accountV41SchemaReady;
let productImportSchemaReady;
let variantSchemaReady;

function database() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured. Add DATABASE_URL to the private .env file.');
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 8,
      idleTimeoutMillis: 20_000
    });
  }
  return pool;
}

async function databaseHealth() {
  const result = await database().query('select now() as connected_at');
  return Boolean(result.rows[0]);
}

const productFields = `
  select p.id, p.sku, p.name, p.slug, p.description, p.specifications, p.price_inr,
         p.compare_at_price_inr, p.stock_quantity, p.weight_kg, p.is_active,
         p.checkout_product_id, p.status, p.published_at,
         coalesce(c.name, 'Uncategorized') as category,
         coalesce(jsonb_agg(jsonb_build_object('url', pi.url, 'alt_text', pi.alt_text, 'sort_order', pi.sort_order)
           order by pi.sort_order) filter (where pi.id is not null), '[]'::jsonb) as images,
         coalesce((select jsonb_agg(jsonb_build_object(
           'id',po.id,'name',po.name,'position',po.position,
           'values',coalesce((select jsonb_agg(jsonb_build_object('id',pov.id,'value',pov.value,'position',pov.position) order by pov.position,pov.created_at)
             from product_option_values pov where pov.option_id=po.id),'[]'::jsonb)
         ) order by po.position,po.created_at) from product_options po where po.product_id=p.id),'[]'::jsonb) as options,
         coalesce((select jsonb_agg(jsonb_build_object(
           'id',pv.id,'sku',pv.sku,'price_inr',pv.price_inr,'compare_at_price_inr',pv.compare_at_price_inr,
           'stock_quantity',pv.stock_quantity,'weight_kg',pv.weight_kg,'barcode',pv.barcode,
           'is_enabled',pv.is_enabled,'is_default',pv.is_default,'checkout_variant_id',pv.checkout_variant_id,
           'options',coalesce((select jsonb_object_agg(po.name,pov.value order by po.position)
             from product_variant_values pvv join product_option_values pov on pov.id=pvv.option_value_id
             join product_options po on po.id=pov.option_id where pvv.variant_id=pv.id),'{}'::jsonb),
           'images',coalesce((select jsonb_agg(jsonb_build_object('url',pvi.url,'alt_text',pvi.alt_text,'sort_order',pvi.sort_order) order by pvi.sort_order,pvi.created_at)
             from product_variant_images pvi where pvi.variant_id=pv.id),'[]'::jsonb)
         ) order by pv.position,pv.created_at) from product_variants pv where pv.product_id=p.id and pv.archived_at is null),'[]'::jsonb) as variants
  from products p
  left join categories c on c.id = p.category_id
  left join product_images pi on pi.product_id = p.id
`;

const productGroup = ' group by p.id, c.name';
const serializeProduct = row => {
  const images = Array.isArray(row.images) ? row.images.map(image => image.url).filter(Boolean) : [];
  const options = Array.isArray(row.options) ? row.options.map(option => ({
    id: option.id, name: String(option.name || ''), position: Number(option.position || 0),
    values: Array.isArray(option.values) ? option.values.map(value => ({ id:value.id, value:String(value.value || ''), position:Number(value.position || 0) })) : []
  })) : [];
  const variants = Array.isArray(row.variants) ? row.variants.map(variant => {
    const variantImages=Array.isArray(variant.images)?variant.images.map(image=>image.url).filter(Boolean):[];
    const price=Number(variant.price_inr),mrp=variant.compare_at_price_inr==null?null:Number(variant.compare_at_price_inr);
    return { id:variant.id,sku:String(variant.sku||''),price_inr:price,compare_at_price_inr:mrp,
      discount:mrp&&mrp>price?Math.round((mrp-price)*100/mrp):0,stock_quantity:Number(variant.stock_quantity||0),
      weight_grams:Math.round(Number(variant.weight_kg||0)*1000),barcode:String(variant.barcode||''),
      is_enabled:variant.is_enabled!==false,is_default:Boolean(variant.is_default),checkout_variant_id:Number(variant.checkout_variant_id),
      options:variant.options&&typeof variant.options==='object'?variant.options:{},image_url:variantImages[0]||images[0]||'',gallery:variantImages };
  }) : [];
  const display=variants.find(variant=>variant.is_default&&variant.is_enabled)||variants.find(variant=>variant.is_enabled)||null;
  const price=display?display.price_inr:Number(row.price_inr),compareAt=display?display.compare_at_price_inr:(row.compare_at_price_inr==null?null:Number(row.compare_at_price_inr));
  const stock=variants.length?variants.filter(variant=>variant.is_enabled).reduce((total,variant)=>total+variant.stock_quantity,0):Number(row.stock_quantity);
  return {
    id: row.id, sku: row.sku, name: row.name, slug: row.slug, category: row.category,
    description: row.description || '', specifications:row.specifications&&typeof row.specifications==='object'?row.specifications:{},
    brand:String(row.specifications?.brand||''),price_inr: price, compare_at_price_inr:compareAt,
    stock_quantity: stock, weight_grams: display?display.weight_grams:Math.round(Number(row.weight_kg) * 1000),
    is_active: row.is_active, status:row.status||'published',published_at:row.published_at||null,
    checkout_product_id:Number(row.checkout_product_id),image_url: display?.image_url || images[0] || '', gallery: images,
    video_url: row.specifications?.video_url || '',has_variants:variants.length>0,options,variants,
    low_stock_variants:variants.filter(variant=>variant.is_enabled&&variant.stock_quantity<=5).map(variant=>({id:variant.id,sku:variant.sku,stock_quantity:variant.stock_quantity,options:variant.options}))
  };
};

async function listActiveProducts() {
  await ensureVariantSchema();
  const result = await database().query(`${productFields} where p.is_active = true and p.status='published'${productGroup} order by p.created_at desc limit 5000`);
  return result.rows.map(serializeProduct);
}

async function listAdminProducts() {
  await ensureVariantSchema();
  const result = await database().query(`${productFields}${productGroup} order by p.updated_at desc limit 5000`);
  return result.rows.map(serializeProduct);
}

const toSlug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const isWebUrl = value => /^https?:\/\/\S+$/i.test(String(value || '').trim());

async function ensureVariantSchema() {
  if (variantSchemaReady) return variantSchemaReady;
  variantSchemaReady = (async () => {
    const client = await database().connect();
    try {
      await client.query('begin');
      await client.query('create sequence if not exists market_hub_checkout_id_seq as bigint start with 1000000000');
      await client.query("alter table products add column if not exists status text not null default 'published'");
      await client.query('alter table products add column if not exists published_at timestamptz');
      await client.query("alter table products add column if not exists checkout_product_id bigint default nextval('market_hub_checkout_id_seq')");
      await client.query("update products set checkout_product_id=nextval('market_hub_checkout_id_seq') where checkout_product_id is null");
      await client.query('alter table products alter column checkout_product_id set not null');
      await client.query('create unique index if not exists products_checkout_product_id_unique on products(checkout_product_id)');
      await client.query(`create table if not exists product_options (
        id uuid primary key default gen_random_uuid(),product_id uuid not null references products(id) on delete cascade,
        name text not null,position integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
      )`);
      await client.query('create unique index if not exists product_options_product_name_unique on product_options(product_id,lower(name))');
      await client.query(`create table if not exists product_option_values (
        id uuid primary key default gen_random_uuid(),option_id uuid not null references product_options(id) on delete cascade,
        value text not null,position integer not null default 0,created_at timestamptz not null default now()
      )`);
      await client.query('create unique index if not exists product_option_values_option_value_unique on product_option_values(option_id,lower(value))');
      await client.query("create index if not exists product_option_values_search_idx on product_option_values using gin(to_tsvector('simple',value))");
      await client.query(`create table if not exists product_variants (
        id uuid primary key default gen_random_uuid(),product_id uuid not null references products(id) on delete cascade,
        sku text not null unique,price_inr numeric(10,2) not null check(price_inr>0),
        compare_at_price_inr numeric(10,2),stock_quantity integer not null default 0 check(stock_quantity>=0),
        weight_kg numeric(8,3) not null default .5 check(weight_kg>0),barcode text,
        is_enabled boolean not null default true,is_default boolean not null default false,position integer not null default 0,
        checkout_variant_id bigint not null default nextval('market_hub_checkout_id_seq'),
        archived_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
        check(compare_at_price_inr is null or compare_at_price_inr>=price_inr)
      )`);
      await client.query('alter table product_variants add column if not exists archived_at timestamptz');
      await client.query('create unique index if not exists product_variants_checkout_id_unique on product_variants(checkout_variant_id)');
      await client.query('create unique index if not exists product_variants_one_default on product_variants(product_id) where is_default');
      await client.query("create index if not exists product_variants_search_idx on product_variants using gin(to_tsvector('simple',coalesce(sku,'')||' '||coalesce(barcode,'')))");
      await client.query('create index if not exists product_variants_product_enabled on product_variants(product_id,is_enabled,position)');
      await client.query(`create table if not exists product_variant_values (
        variant_id uuid not null references product_variants(id) on delete cascade,
        option_value_id uuid not null references product_option_values(id) on delete cascade,
        primary key(variant_id,option_value_id)
      )`);
      await client.query(`create table if not exists product_variant_images (
        id uuid primary key default gen_random_uuid(),variant_id uuid not null references product_variants(id) on delete cascade,
        url text not null,alt_text text,sort_order integer not null default 0,created_at timestamptz not null default now()
      )`);
      await client.query('alter table if exists order_items add column if not exists product_variant_id uuid references product_variants(id) on delete set null');
      await client.query('alter table if exists order_items add column if not exists variant_sku text');
      await client.query("alter table if exists order_items add column if not exists selected_options jsonb not null default '{}'::jsonb");
      await client.query('alter table if exists order_items add column if not exists variant_image_url text');
      await client.query('alter table if exists order_items add column if not exists inventory_restored_at timestamptz');
      await client.query('alter table if exists orders add column if not exists inventory_reserved_at timestamptz');
      await client.query('alter table if exists orders add column if not exists inventory_restored_at timestamptz');
      await client.query('commit');
    } catch (error) {
      await client.query('rollback'); variantSchemaReady=undefined; throw error;
    } finally { client.release(); }
  })();
  return variantSchemaReady;
}

const cleanVariantText=(value,max=100)=>String(value||'').trim().replace(/\s+/g,' ').slice(0,max);
function normalizeVariantModel(input,base={}) {
  const provided=Array.isArray(input.options)||Array.isArray(input.variants);
  if(!provided)return{provided:false,options:[],variants:[]};
  const rawVariants=Array.isArray(input.variants)?input.variants:[];
  let rawOptions=Array.isArray(input.options)?input.options:[];
  if(!rawOptions.length&&rawVariants.length){const names=[];for(const variant of rawVariants){for(const name of Object.keys(variant.options||{}))if(!names.some(value=>value.toLowerCase()===name.toLowerCase()))names.push(name)}rawOptions=names.map(name=>({name,values:rawVariants.map(variant=>variant.options?.[name]).filter(Boolean)}))}
  const options=[];
  for(const [position,option] of rawOptions.entries()){
    const name=cleanVariantText(option.name,80);if(!name)throw new Error('Every variant option needs a name.');
    if(options.some(value=>value.name.toLowerCase()===name.toLowerCase()))throw new Error(`Variant option “${name}” is repeated.`);
    const values=[...new Map((Array.isArray(option.values)?option.values:[]).map(value=>cleanVariantText(value,100)).filter(Boolean).map(value=>[value.toLowerCase(),value])).values()];
    if(!values.length)throw new Error(`Add at least one value for ${name}.`);options.push({name,position,values});
  }
  if(!options.length){if(rawVariants.length)throw new Error('Add option names and values for these variants.');return{provided:true,options:[],variants:[]}}
  if(!rawVariants.length)throw new Error('Generate or add at least one product variant.');
  const optionByName=new Map(options.map(option=>[option.name.toLowerCase(),option])),seenCombinations=new Set(),seenSkus=new Set();
  const variants=rawVariants.map((variant,index)=>{
    const sourceOptions=variant.options&&typeof variant.options==='object'?variant.options:{};
    const selected={};
    for(const option of options){const key=Object.keys(sourceOptions).find(name=>name.toLowerCase()===option.name.toLowerCase()),value=cleanVariantText(key?sourceOptions[key]:'',100);if(!value)throw new Error(`Variant ${index+1} is missing ${option.name}.`);const saved=option.values.find(item=>item.toLowerCase()===value.toLowerCase());if(!saved)throw new Error(`${value} is not an allowed ${option.name} value.`);selected[option.name]=saved}
    for(const name of Object.keys(sourceOptions))if(!optionByName.has(name.toLowerCase()))throw new Error(`Unknown variant option: ${name}.`);
    const combination=options.map(option=>selected[option.name].toLowerCase()).join('\u001f');if(seenCombinations.has(combination))throw new Error('The same variant combination is listed more than once.');seenCombinations.add(combination);
    const sku=cleanVariantText(variant.sku||`${base.sku||'VAR'}-${index+1}`,100);if(!sku)throw new Error(`Variant ${index+1} needs a SKU.`);if(seenSkus.has(sku.toLowerCase()))throw new Error(`Variant SKU ${sku} is repeated.`);seenSkus.add(sku.toLowerCase());
    const price=Number(variant.price_inr??variant.price??base.price),mrpValue=Number(variant.compare_at_price_inr??variant.mrp??base.mrp),stock=Number(variant.stock_quantity??variant.stock??base.stock??0),weight=Number(variant.weight_grams??variant.weightGrams??base.weightGrams??500);
    if(!Number.isFinite(price)||price<=0)throw new Error(`Enter a selling price for variant ${sku}.`);if(!Number.isInteger(stock)||stock<0)throw new Error(`Enter valid stock for variant ${sku}.`);if(!Number.isFinite(weight)||weight<1)throw new Error(`Enter valid weight for variant ${sku}.`);
    const mrp=Number.isFinite(mrpValue)&&mrpValue>=price?mrpValue:null,image=cleanVariantText(variant.image_url||variant.image||'',2000),images=[...new Set((Array.isArray(variant.images)?variant.images:[image]).map(value=>String(value||'').trim()).filter(Boolean))];if(images.some(url=>!isWebUrl(url)))throw new Error(`Variant ${sku} has an invalid image URL.`);
    return{id:/^[0-9a-f-]{36}$/i.test(String(variant.id||''))?String(variant.id):null,sku,price,mrp,stock,weightGrams:weight,barcode:cleanVariantText(variant.barcode,100),images,enabled:variant.is_enabled!==false&&variant.enabled!==false,isDefault:Boolean(variant.is_default??variant.isDefault),options:selected,position:index};
  });
  if(!variants.some(variant=>variant.enabled))throw new Error('Enable at least one product variant.');let chosen=variants.find(variant=>variant.isDefault&&variant.enabled)||variants.find(variant=>variant.enabled);variants.forEach(variant=>{variant.isDefault=variant===chosen});return{provided:true,options,variants};
}

async function syncProductVariants(client,productId,model,base={}) {
  if(!model.provided)return;
  const existing=(await client.query('select id,sku from product_variants where product_id=$1',[productId])).rows;
  // Clear the partial unique default and temporary-rename existing SKUs so an
  // admin can safely change the default or swap two variant SKUs in one save.
  await client.query("update product_variants set is_default=false,sku='__mh_v43_tmp_'||replace(id::text,'-','') where product_id=$1",[productId]);
  await client.query('delete from product_variant_values where variant_id in (select id from product_variants where product_id=$1)',[productId]);
  await client.query('delete from product_variant_images where variant_id in (select id from product_variants where product_id=$1)',[productId]);
  await client.query('delete from product_option_values where option_id in (select id from product_options where product_id=$1)',[productId]);
  await client.query('delete from product_options where product_id=$1',[productId]);
  // Keep removed variants as archived inventory records. Historical order lines
  // retain their variant UUID so cancellation/return restores the exact SKU.
  if(!model.variants.length){await client.query("update product_variants set archived_at=coalesce(archived_at,now()),is_enabled=false,is_default=false,updated_at=now() where product_id=$1",[productId]);return}
  const optionValues=new Map();
  for(const option of model.options){const saved=await client.query('insert into product_options(product_id,name,position) values($1,$2,$3) returning id',[productId,option.name,option.position]);for(const [position,value] of option.values.entries()){const row=await client.query('insert into product_option_values(option_id,value,position) values($1,$2,$3) returning id',[saved.rows[0].id,value,position]);optionValues.set(`${option.name.toLowerCase()}\u001f${value.toLowerCase()}`,row.rows[0].id)}}
  const keep=[];
  for(const variant of model.variants){const matched=existing.find(row=>row.id===variant.id)||existing.find(row=>String(row.sku).toLowerCase()===variant.sku.toLowerCase());let saved;
    if(matched){saved=await client.query(`update product_variants set sku=$2,price_inr=$3,compare_at_price_inr=$4,stock_quantity=$5,weight_kg=$6,barcode=$7,is_enabled=$8,is_default=$9,position=$10,archived_at=null,updated_at=now() where id=$1 returning id`,[matched.id,variant.sku,variant.price,variant.mrp,variant.stock,variant.weightGrams/1000,variant.barcode||null,variant.enabled,variant.isDefault,variant.position])}
    else saved=await client.query(`insert into product_variants(product_id,sku,price_inr,compare_at_price_inr,stock_quantity,weight_kg,barcode,is_enabled,is_default,position) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,[productId,variant.sku,variant.price,variant.mrp,variant.stock,variant.weightGrams/1000,variant.barcode||null,variant.enabled,variant.isDefault,variant.position]);
    const variantId=saved.rows[0].id;keep.push(variantId);for(const option of model.options)await client.query('insert into product_variant_values(variant_id,option_value_id) values($1,$2)',[variantId,optionValues.get(`${option.name.toLowerCase()}\u001f${variant.options[option.name].toLowerCase()}`)]);for(const [sortOrder,url] of variant.images.entries())await client.query('insert into product_variant_images(variant_id,url,alt_text,sort_order) values($1,$2,$3,$4)',[variantId,url,base.name||variant.sku,sortOrder]);
  }
  await client.query("update product_variants set archived_at=coalesce(archived_at,now()),is_enabled=false,is_default=false,updated_at=now() where product_id=$1 and not(id=any($2::uuid[]))",[productId,keep]);
  const totals=await client.query(`select coalesce(sum(stock_quantity) filter(where is_enabled),0)::integer stock,
    (array_agg(price_inr order by is_default desc,position) filter(where is_enabled))[1] price,
    (array_agg(compare_at_price_inr order by is_default desc,position) filter(where is_enabled))[1] mrp,
    (array_agg(weight_kg order by is_default desc,position) filter(where is_enabled))[1] weight from product_variants where product_id=$1 and archived_at is null`,[productId]);
  await client.query('update products set price_inr=$2,compare_at_price_inr=$3,stock_quantity=$4,weight_kg=$5,updated_at=now() where id=$1',[productId,totals.rows[0].price,totals.rows[0].mrp,totals.rows[0].stock,totals.rows[0].weight]);
}

function productInput(input) {
  const name = String(input.name || '').trim();
  const category = String(input.category || '').trim();
  const sku = String(input.sku || '').trim();
  const description = String(input.description || '').trim();
  const price = Number(input.price);
  const stock = Number(input.stock);
  const weightGrams = Number(input.weight_grams);
  const images = Array.isArray(input.images) ? input.images.map(value => String(value).trim()).filter(Boolean) : [];
  const videoUrl = String(input.video_url || '').trim();
  const mrpValue=Number(input.mrp??input.compare_at_price_inr),mrp=Number.isFinite(mrpValue)&&mrpValue>=price?mrpValue:null;
  if (!name || name.length > 180 || !category || category.length > 80 || !sku || sku.length > 80) throw new Error('Enter a product name, category and SKU.');
  if (!Number.isFinite(price) || price <= 0 || price > 10000000) throw new Error('Enter a valid product price.');
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) throw new Error('Enter a valid stock quantity.');
  if (!Number.isFinite(weightGrams) || weightGrams < 1 || weightGrams > 100000) throw new Error('Enter a valid weight in grams.');
  if (!images.length || images.length > 12 || images.some(url => !isWebUrl(url))) throw new Error('Add 1 to 12 valid photo links starting with https://.');
  if (videoUrl && !isWebUrl(videoUrl)) throw new Error('The video link must start with https://.');
  const variantModel=normalizeVariantModel(input,{name,sku,price,mrp,stock,weightGrams});
  return { name, category, sku, description, price, mrp, stock, weightGrams, images, videoUrl, variantModel };
}

async function saveProduct(input, productId = null) {
  await ensureVariantSchema();
  const value = productInput(input);
  const client = await database().connect();
  try {
    await client.query('begin');
    const category = await client.query(
      'insert into categories (name, slug) values ($1, $2) on conflict (slug) do update set name = excluded.name, is_active = true returning id',
      [value.category, toSlug(value.category)]
    );
    const specification = JSON.stringify(value.videoUrl ? { video_url: value.videoUrl } : {});
    let result;
    if (productId) {
      result = await client.query(
        `update products set category_id=$1, sku=$2, name=$3, description=$4, specifications=$5::jsonb,
         price_inr=$6,compare_at_price_inr=$7,stock_quantity=$8,weight_kg=$9,is_active=true,updated_at=now() where id=$10 returning id`,
        [category.rows[0].id,value.sku,value.name,value.description,specification,value.price,value.mrp,value.stock,value.weightGrams/1000,productId]
      );
      if (!result.rowCount) throw new Error('This product no longer exists.');
      await client.query('delete from product_images where product_id=$1', [productId]);
    } else {
      const slugBase = toSlug(value.name) || 'product';
      result = await client.query(
        `insert into products (category_id,sku,name,slug,description,specifications,price_inr,compare_at_price_inr,stock_quantity,weight_kg)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) returning id`,
        [category.rows[0].id,value.sku,value.name,`${slugBase}-${toSlug(value.sku)}`,value.description,specification,value.price,value.mrp,value.stock,value.weightGrams/1000]
      );
    }
    const id = result.rows[0].id;
    for (const [sortOrder, url] of value.images.entries()) {
      await client.query('insert into product_images (product_id, url, alt_text, sort_order) values ($1,$2,$3,$4)', [id, url, value.name, sortOrder]);
    }
    await syncProductVariants(client,id,value.variantModel,value);
    await client.query('commit');
    const saved = await database().query(`${productFields} where p.id=$1${productGroup}`, [id]);
    return serializeProduct(saved.rows[0]);
  } catch (error) {
    await client.query('rollback');
    if (error.code === '23505') throw new Error('This SKU is already being used. Choose a different SKU.');
    throw error;
  } finally {
    client.release();
  }
}

async function productById(productId) {
  await ensureVariantSchema();
  const result=await database().query(`${productFields} where p.id=$1${productGroup}`,[productId]);
  return result.rowCount?serializeProduct(result.rows[0]):null;
}

async function productBySku(sku) {
  await ensureVariantSchema();
  const result=await database().query(`${productFields} where lower(p.sku)=lower($1) and p.is_active=true and p.status='published'${productGroup}`,[String(sku||'')]);
  return result.rowCount?serializeProduct(result.rows[0]):null;
}

async function checkoutCartItems(cart,queryable=database()) {
  await ensureVariantSchema();
  if(!Array.isArray(cart)||!cart.length||cart.length>50)throw new Error('Your cart is invalid.');
  const lines=[];
  for(const input of cart){const quantity=Number(input.qty??input.quantity),rawVariantId=String(input.variantId||input.variant_id||''),checkoutId=/^\d+$/.test(rawVariantId)?rawVariantId:String(input.checkoutVariantId||''),variantId=checkoutId?'':rawVariantId,sku=String(input.variantSku||input.sku||'').trim();
    if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw new Error('A cart quantity is invalid.');
    let result;
    if(variantId||sku)result=await queryable.query(`select p.id product_id,p.sku product_sku,p.name,p.checkout_product_id,p.price_inr product_price,
      p.compare_at_price_inr product_mrp,p.stock_quantity product_stock,p.weight_kg product_weight,p.is_active,
      pv.id variant_id,pv.sku variant_sku,pv.price_inr variant_price,pv.compare_at_price_inr variant_mrp,
      pv.stock_quantity variant_stock,pv.weight_kg variant_weight,pv.checkout_variant_id,pv.is_enabled,
      coalesce((select jsonb_object_agg(po.name,pov.value order by po.position) from product_variant_values pvv
        join product_option_values pov on pov.id=pvv.option_value_id join product_options po on po.id=pov.option_id where pvv.variant_id=pv.id),'{}'::jsonb) selected_options,
      coalesce((select url from product_variant_images where variant_id=pv.id order by sort_order limit 1),
        (select url from product_images where product_id=p.id order by sort_order limit 1),'') image_url,
      exists(select 1 from product_variants existing where existing.product_id=p.id and existing.archived_at is null) has_variants
      from products p left join product_variants pv on pv.product_id=p.id and pv.archived_at is null and (($1::text<>'' and pv.id::text=$1) or ($2::text<>'' and lower(pv.sku)=lower($2)) or ($3::text<>'' and pv.checkout_variant_id::text=$3))
      where p.is_active=true and p.status='published' and (($1::text<>'' and pv.id::text=$1) or ($2::text<>'' and (lower(pv.sku)=lower($2) or (lower(p.sku)=lower($2) and not exists(select 1 from product_variants x where x.product_id=p.id and x.archived_at is null)))) or ($3::text<>'' and (pv.checkout_variant_id::text=$3 or (p.checkout_product_id::text=$3 and not exists(select 1 from product_variants x where x.product_id=p.id and x.archived_at is null))))) limit 1`,[variantId,sku,checkoutId]);
    if(!result?.rowCount)throw new Error('A cart item or selected variant is no longer available.');const row=result.rows[0],hasVariant=Boolean(row.variant_id);
    if(row.has_variants&&!hasVariant)throw new Error(`${row.name} requires a variant selection.`);if(hasVariant&&!row.is_enabled)throw new Error(`${row.name} variant is disabled.`);
    const stock=Number(hasVariant?row.variant_stock:row.product_stock);if(quantity>stock)throw new Error(`${row.name} does not have enough stock for the selected variant.`);
    lines.push({productId:row.product_id,productSku:row.product_sku,name:row.name,variantId:row.variant_id||null,
      variantSku:row.variant_sku||row.product_sku,selectedOptions:row.selected_options||{},price:Number(hasVariant?row.variant_price:row.product_price),
      mrp:(hasVariant?row.variant_mrp:row.product_mrp)==null?null:Number(hasVariant?row.variant_mrp:row.product_mrp),stock,
      weightGrams:Math.round(Number(hasVariant?row.variant_weight:row.product_weight)*1000),image:String(row.image_url||''),
      checkoutProductId:Number(row.checkout_product_id),checkoutVariantId:Number(hasVariant?row.checkout_variant_id:row.checkout_product_id),quantity});
  }
  return lines;
}

async function shiprocketOrderItems(orderId) {
  await ensureVariantSchema();
  const result=await database().query(`select oi.product_name,coalesce(oi.variant_sku,oi.sku) sku,oi.selected_options,oi.unit_price_inr,
    oi.quantity,coalesce(pv.weight_kg,p.weight_kg,.5) weight_kg,oi.variant_image_url
    from order_items oi left join product_variants pv on pv.id=oi.product_variant_id left join products p on p.id=oi.product_id
    where oi.order_id=$1 order by oi.id`,[orderId]);
  return result.rows.map(row=>({name:row.product_name,sku:row.sku,options:row.selected_options||{},price:Number(row.unit_price_inr),quantity:Number(row.quantity),weightGrams:Math.round(Number(row.weight_kg)*1000),image:row.variant_image_url||''}));
}

async function restoreOrderItemInventory(client,itemId) {
  const locked=await client.query('select id,product_id,product_variant_id,quantity,inventory_restored_at from order_items where id=$1 for update',[itemId]);
  if(!locked.rowCount||locked.rows[0].inventory_restored_at)return false;const item=locked.rows[0];
  if(item.product_variant_id){await client.query('update product_variants set stock_quantity=stock_quantity+$2,updated_at=now() where id=$1',[item.product_variant_id,item.quantity]);await client.query('update products set stock_quantity=(select coalesce(sum(stock_quantity) filter(where is_enabled and archived_at is null),0) from product_variants where product_id=$1),updated_at=now() where id=$1',[item.product_id])}
  else if(item.product_id)await client.query('update products set stock_quantity=stock_quantity+$2,updated_at=now() where id=$1',[item.product_id,item.quantity]);
  await client.query('update order_items set inventory_restored_at=now() where id=$1',[item.id]);return true;
}

async function restoreOrderInventory(client,orderId) {
  const items=await client.query('select id from order_items where order_id=$1 and inventory_restored_at is null order by id for update',[orderId]);
  for(const item of items.rows)await restoreOrderItemInventory(client,item.id);
  if(items.rowCount)await client.query('update orders set inventory_restored_at=coalesce(inventory_restored_at,now()) where id=$1',[orderId]);
  return items.rowCount;
}

async function deactivateProduct(productId) {
  const result = await database().query('update products set is_active=false, updated_at=now() where id=$1 returning id', [productId]);
  if (!result.rowCount) throw new Error('This product no longer exists.');
}

// The original starter schema used whole numbers for order totals. Supplier
// prices can include paise, so this small migration keeps every order amount
// accurate and can safely run on an existing store database.
async function ensureOrderSchema() {
  if (orderSchemaReady) return orderSchemaReady;
  orderSchemaReady = (async () => {
    const client = await database().connect();
    try {
      await client.query('begin');
      await client.query('alter table orders alter column subtotal_inr type numeric(10,2) using subtotal_inr::numeric(10,2)');
      await client.query('alter table orders alter column discount_inr type numeric(10,2) using discount_inr::numeric(10,2)');
      await client.query('alter table orders alter column wallet_used_inr type numeric(10,2) using wallet_used_inr::numeric(10,2)');
      await client.query('alter table orders alter column shipping_inr type numeric(10,2) using shipping_inr::numeric(10,2)');
      await client.query('alter table orders alter column total_inr type numeric(10,2) using total_inr::numeric(10,2)');
      await client.query('alter table order_items alter column unit_price_inr type numeric(10,2) using unit_price_inr::numeric(10,2)');
      await client.query('alter table orders drop constraint if exists orders_payment_method_check');
      await client.query("alter table orders add constraint orders_payment_method_check check (payment_method in ('shiprocket','cod','wallet','razorpay'))");
      await client.query('create unique index if not exists orders_shiprocket_order_unique on orders(shiprocket_order_id) where shiprocket_order_id is not null');
      await client.query('alter table orders add column if not exists packing_video_url text');
      await client.query('alter table orders add column if not exists packing_video_note text');
      await client.query('alter table orders add column if not exists packing_video_uploaded_at timestamptz');
      await client.query('alter table shipments add column if not exists provider_order_id text');
      await client.query('alter table shipments add column if not exists creation_error text');
      await client.query('create unique index if not exists shipments_provider_order_unique on shipments(provider, provider_order_id) where provider_order_id is not null');
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      orderSchemaReady = undefined;
      throw error;
    } finally { client.release(); }
  })();
  return orderSchemaReady;
}

const moneyValue = value => Math.max(0, Number(value || 0)).toFixed(2);
const statusForShiprocket = value => ({ SUCCESS: 'confirmed', FAILED: 'cancelled' }[String(value || '').toUpperCase()] || 'pending');
const paymentForShiprocket = value => ({ SUCCESS: 'paid', FAILED: 'failed', PENDING: 'cod_pending' }[String(value || '').toUpperCase()] || 'pending');
const newReferralCode = () => `MH${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

async function findOrCreateCustomer(client, order) {
  const phone = String(order.phone || order.shipping_address?.phone || '').replace(/\D/g, '').slice(-10);
  const email = String(order.email || order.shipping_address?.email || '').trim().toLowerCase() || null;
  const name = [order.shipping_address?.first_name, order.shipping_address?.last_name].filter(Boolean).join(' ').trim() || 'MARKET HUB customer';
  if (!phone && !email) throw new Error('The checkout order is missing customer contact information.');
  const existing = await client.query(
    `select id
       from users
      where ($1::text <> '' and phone=$1)
         or ($2::text is not null and email=$2)
      order by case when $1::text <> '' and phone=$1 then 0 else 1 end
      limit 1`,
    [phone, email]
  );
  if (existing.rowCount) return existing.rows[0].id;
  const created = await client.query(
    'insert into users (full_name,email,phone,referral_code) values ($1,$2,$3,$4) returning id',
    [name, email, phone || null, newReferralCode()]
  );
  return created.rows[0].id;
}

async function saveOrderAddress(client, userId, order) {
  const address = order.shipping_address || {};
  const pincode = String(address.pincode || '').replace(/\D/g, '').slice(0, 6);
  if (!pincode || !address.line1 || !address.city || !address.state) return null;
  const name = [address.first_name, address.last_name].filter(Boolean).join(' ').trim() || 'MARKET HUB customer';
  const phone = String(address.phone || order.phone || '').replace(/\D/g, '').slice(-10) || '0000000000';
  const saved = await client.query(
    `insert into addresses (user_id,label,full_name,phone,line1,line2,city,state,pincode,is_default)
     values ($1,'Checkout',$2,$3,$4,$5,$6,$7,$8,false) returning id`,
    [userId, name, phone, String(address.line1), address.line2 || null, String(address.city), String(address.state), pincode]
  );
  return saved.rows[0].id;
}

function supplierCatalogueById() {
  const cataloguePath = path.join(__dirname, 'assets', 'catalogue', 'products.json');
  const products = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
  return new Map(products.map(product => [String(product.id), product]));
}

async function recordShiprocketOrder(order) {
  if (!order?.order_id) throw new Error('The checkout order id is missing.');
  await ensureOrderSchema();
  await ensureCustomerExperienceSchema();
  await ensureVariantSchema();
  const client = await database().connect();
  try {
    await client.query('begin');
    const userId = await findOrCreateCustomer(client, order);
    const addressId = await saveOrderAddress(client, userId, order);
    const paymentType = String(order.payment_type || '').toUpperCase();
    const status=statusForShiprocket(order.status),paymentStatus=paymentForShiprocket(order.payment_status),externalId=String(order.order_id);
    const existing=await client.query('select id,order_number,status,inventory_reserved_at from orders where shiprocket_order_id=$1 for update',[externalId]);
    let savedOrder;
    if(existing.rowCount){savedOrder=existing.rows[0];await client.query(`update orders set user_id=$2,address_id=coalesce($3,address_id),status=$4,payment_status=$5,payment_method=$6,
      subtotal_inr=$7,discount_inr=$8,shipping_inr=$9,total_inr=$10 where id=$1`,[savedOrder.id,userId,addressId,status,paymentStatus,paymentType==='CASH_ON_DELIVERY'?'cod':'shiprocket',moneyValue(order.subtotal_price),moneyValue(order.total_discount),moneyValue(order.cod_charges),moneyValue(order.total_amount_payable)])}
    else{const created=await client.query(`insert into orders(user_id,address_id,status,payment_status,payment_method,subtotal_inr,discount_inr,wallet_used_inr,coins_used,shipping_inr,total_inr,shiprocket_order_id)
      values($1,$2,$3,$4,$5,$6,$7,0,0,$8,$9,$10) returning id,order_number,status,inventory_reserved_at`,[userId,addressId,status,paymentStatus,paymentType==='CASH_ON_DELIVERY'?'cod':'shiprocket',moneyValue(order.subtotal_price),moneyValue(order.total_discount),moneyValue(order.cod_charges),moneyValue(order.total_amount_payable),externalId]);savedOrder=created.rows[0]}
    const itemCount=await client.query('select count(*)::integer total from order_items where order_id=$1',[savedOrder.id]);
    if(!Number(itemCount.rows[0].total)&&!['cancelled','returned','refunded'].includes(status)){
      const lines=await checkoutCartItems((order.cart_data?.items||[]).map(item=>({variant_id:item.variant_id,quantity:item.quantity})),client);
      if(!lines.length)throw new Error('The checkout order has no valid product variants.');
    for(const line of lines){let reserved;if(line.variantId){reserved=await client.query('update product_variants set stock_quantity=stock_quantity-$2,updated_at=now() where id=$1 and is_enabled=true and archived_at is null and stock_quantity>=$2 returning id',[line.variantId,line.quantity]);if(reserved.rowCount)await client.query('update products set stock_quantity=(select coalesce(sum(stock_quantity) filter(where is_enabled and archived_at is null),0) from product_variants where product_id=$1),updated_at=now() where id=$1',[line.productId])}
        else reserved=await client.query('update products set stock_quantity=stock_quantity-$2,updated_at=now() where id=$1 and is_active=true and stock_quantity>=$2 returning id',[line.productId,line.quantity]);
        if(!reserved.rowCount)throw new Error(`${line.name} no longer has enough stock.`);
        await client.query(`insert into order_items(order_id,product_id,product_variant_id,product_name,sku,variant_sku,selected_options,variant_image_url,unit_price_inr,quantity,coin_reward)
          values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,0)`,[savedOrder.id,line.productId,line.variantId,line.name,line.variantSku,line.variantSku,JSON.stringify(line.selectedOptions),line.image||null,moneyValue(line.price),line.quantity]);
      }
      await client.query('update orders set inventory_reserved_at=now(),inventory_restored_at=null where id=$1',[savedOrder.id]);
    }
    if(['cancelled','returned','refunded'].includes(status))await restoreOrderInventory(client,savedOrder.id);
    const pendingCoins = await createPendingOrderCoins(client, savedOrder.id, userId, order.subtotal_price);
    await client.query('commit');
    return { id: savedOrder.id, orderNumber: savedOrder.order_number, pendingCoins };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

// Reserve the one Shiprocket shipment record before calling the remote API.
// This makes checkout webhook retries safe: only the first delivery creates an
// external shipping order for the local order.
async function reserveShiprocketShipment(orderId, pickupLocation) {
  await ensureOrderSchema();
  const result = await database().query(
    `insert into shipments (order_id,provider,pickup_location,tracking_status)
     values ($1,'shiprocket',$2,'creating')
     on conflict (order_id) do nothing returning id`,
    [orderId, pickupLocation || 'Default Shiprocket pickup']
  );
  return { reserved: Boolean(result.rowCount) };
}

async function completeShiprocketShipment(orderId, payload) {
  await ensureOrderSchema();
  const response = payload || {};
  const providerOrderId = response.order_id || response.data?.order_id || null;
  const shipmentId = response.shipment_id || response.data?.shipment_id || null;
  const awb = response.awb_code || response.data?.awb_code || null;
  const tracking = response.status || response.data?.status || (shipmentId ? 'created' : 'processing');
  await database().query(
    `update shipments set provider_order_id=$2,awb=coalesce($3,awb),tracking_status=$4,raw_tracking=$5::jsonb,updated_at=now()
      where order_id=$1 and provider='shiprocket'`,
    [orderId, providerOrderId ? String(providerOrderId) : (shipmentId ? String(shipmentId) : null), awb ? String(awb) : null, String(tracking), JSON.stringify(response)]
  );
}

async function releaseShiprocketShipment(orderId) {
  await ensureOrderSchema();
  await database().query("delete from shipments where order_id=$1 and provider='shiprocket' and tracking_status='creating'", [orderId]);
}

async function delhiveryOrder(orderId) {
  await ensureOrderSchema();
  await ensureVariantSchema();
  const result = await database().query(
    `select o.id,o.order_number,o.status,o.payment_status,o.payment_method,o.total_inr,o.created_at,
            u.full_name as customer,u.phone as customer_phone,
            a.label as address_label,a.full_name as address_name,a.phone as address_phone,a.line1,a.line2,a.city,a.state,a.pincode,
            s.provider as shipment_provider,s.awb,s.tracking_status,
            coalesce(sum(coalesce(pv.weight_kg,p.weight_kg,0.5)*1000*oi.quantity),500)::integer as weight_grams,
            coalesce(max(p.length_cm),15)::numeric as length_cm,coalesce(max(p.breadth_cm),15)::numeric as breadth_cm,
            coalesce(max(p.height_cm),10)::numeric as height_cm,
            coalesce(jsonb_agg(jsonb_build_object('name',oi.product_name,'sku',coalesce(oi.variant_sku,oi.sku),
              'quantity',oi.quantity,'price',oi.unit_price_inr)) filter(where oi.id is not null),'[]'::jsonb) items
       from orders o join users u on u.id=o.user_id left join addresses a on a.id=o.address_id
       left join order_items oi on oi.order_id=o.id left join products p on p.id=oi.product_id
       left join product_variants pv on pv.id=oi.product_variant_id left join shipments s on s.order_id=o.id
      where o.id=$1
      group by o.id,u.full_name,u.phone,a.label,a.full_name,a.phone,a.line1,a.line2,a.city,a.state,a.pincode,
               s.provider,s.awb,s.tracking_status`, [orderId]
  );
  if (!result.rowCount) throw new Error('This order no longer exists.');
  const row = result.rows[0];
  return {
    id:row.id,orderNumber:Number(row.order_number),status:row.status,paymentStatus:row.payment_status,
    paymentMethod:row.payment_method,totalInr:Number(row.total_inr),createdAt:row.created_at,
    customer:row.address_name || row.customer,phone:row.address_phone || row.customer_phone,addressLabel:row.address_label,
    line1:row.line1,line2:row.line2,city:row.city,state:row.state,pincode:row.pincode,
    weightGrams:Number(row.weight_grams),lengthCm:Number(row.length_cm),breadthCm:Number(row.breadth_cm),heightCm:Number(row.height_cm),
    shipmentProvider:row.shipment_provider,awb:row.awb,trackingStatus:row.tracking_status,items:row.items || []
  };
}

async function listDelhiveryShipments() {
  await ensureOrderSchema();
  const result = await database().query(
    `select o.id,o.order_number,o.status,o.payment_status,o.payment_method,o.total_inr,o.created_at,
            coalesce(a.city,'') city,coalesce(a.pincode,'') pincode,coalesce(a.full_name,u.full_name) customer,
            coalesce(sum(coalesce(pv.weight_kg,p.weight_kg,0.5)*1000*oi.quantity),500)::integer as weight_grams,
            s.provider,s.awb,s.tracking_status,s.courier_name,s.tracking_url,s.creation_error
       from orders o join users u on u.id=o.user_id left join addresses a on a.id=o.address_id
       left join order_items oi on oi.order_id=o.id left join products p on p.id=oi.product_id
       left join product_variants pv on pv.id=oi.product_variant_id left join shipments s on s.order_id=o.id
      where o.status not in ('cancelled','returned','refunded')
      group by o.id,a.city,a.pincode,a.full_name,u.full_name,s.provider,s.awb,s.tracking_status,s.courier_name,s.tracking_url,s.creation_error
      order by o.created_at desc limit 100`
  );
  return result.rows.map(row => ({
    id:row.id,orderNumber:Number(row.order_number),status:row.status,paymentStatus:row.payment_status,
    paymentMethod:row.payment_method,totalInr:Number(row.total_inr),createdAt:row.created_at,customer:row.customer,
    city:row.city,pincode:row.pincode,weightGrams:Number(row.weight_grams),provider:row.provider || null,
    awb:row.awb || null,trackingStatus:row.tracking_status || null,courierName:row.courier_name || null,
    trackingUrl:row.tracking_url || null,creationError:row.creation_error || null
  }));
}

async function reserveDelhiveryShipment(orderId, pickupLocation) {
  await ensureOrderSchema();
  const client = await database().connect();
  try {
    await client.query('begin');
    const existing = await client.query('select provider,awb,tracking_status from shipments where order_id=$1 for update',[orderId]);
    if (existing.rowCount) {
      const shipment=existing.rows[0];
      if (shipment.provider !== 'delhivery') throw new Error(`This order is already assigned to ${shipment.provider}.`);
      if (shipment.awb) { await client.query('commit'); return {reserved:false,existing:true,awb:shipment.awb}; }
      if (shipment.tracking_status === 'creating') throw new Error('Delhivery shipment creation is already in progress.');
      await client.query("update shipments set pickup_location=$2,tracking_status='creating',creation_error=null,updated_at=now() where order_id=$1",[orderId,pickupLocation]);
    } else {
      await client.query("insert into shipments(order_id,provider,pickup_location,tracking_status) values($1,'delhivery',$2,'creating')",[orderId,pickupLocation]);
    }
    await client.query('commit');
    return {reserved:true};
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
}

async function completeDelhiveryShipment(orderId, shipment) {
  await ensureOrderSchema();
  const trackingUrl = `https://www.delhivery.com/track/package/${encodeURIComponent(shipment.awb)}`;
  await database().query(
    `update shipments set provider_order_id=$2,awb=$3,tracking_status=$4,courier_name='Delhivery',tracking_url=$5,
            raw_tracking=$6::jsonb,creation_error=null,updated_at=now() where order_id=$1 and provider='delhivery'`,
    [orderId,shipment.providerOrderId || null,shipment.awb,shipment.status || 'created',trackingUrl,JSON.stringify(shipment.raw || {})]
  );
  return {awb:shipment.awb,status:shipment.status || 'created',trackingUrl};
}

async function failDelhiveryShipment(orderId, error) {
  await ensureOrderSchema();
  await database().query(
    "update shipments set tracking_status='creation_failed',creation_error=$2,updated_at=now() where order_id=$1 and provider='delhivery' and awb is null",
    [orderId,String(error?.message || error || 'Shipment creation failed.').slice(0,500)]
  );
}

async function updateDelhiveryTracking(orderId, tracking) {
  await ensureOrderSchema();
  await database().query(
    `update shipments set tracking_status=$2,raw_tracking=$3::jsonb,updated_at=now(),
       shipped_at=case when lower($2) like '%transit%' or lower($2) like '%dispatch%' then coalesce(shipped_at,now()) else shipped_at end,
       delivered_at=case when lower($2) like '%delivered%' then coalesce(delivered_at,now()) else delivered_at end
     where order_id=$1 and provider='delhivery'`, [orderId,tracking.status,JSON.stringify(tracking.raw || {})]
  );
  return {awb:tracking.awb,status:tracking.status};
}

async function listAdminOrders() {
  await ensureOrderSchema();
  await ensureVariantSchema();
  const result = await database().query(
    `select o.id,o.order_number,o.status,o.payment_status,o.payment_method,o.total_inr,o.created_at,o.packing_video_url,o.packing_video_note,o.packing_video_uploaded_at,
            u.full_name,u.email,u.phone,coalesce(count(oi.id),0)::integer as item_count,
            coalesce(jsonb_agg(jsonb_build_object('name',oi.product_name,'sku',coalesce(oi.variant_sku,oi.sku),'options',oi.selected_options,
              'quantity',oi.quantity,'image',coalesce(oi.variant_image_url,''))) filter(where oi.id is not null),'[]'::jsonb) items
       from orders o join users u on u.id=o.user_id left join order_items oi on oi.order_id=o.id
      group by o.id,u.full_name,u.email,u.phone order by o.created_at desc limit 500`
  );
  return result.rows.map(order => ({ id: order.id, order_number: Number(order.order_number), status: order.status, payment_status: order.payment_status, payment_method: order.payment_method, total_inr: Number(order.total_inr), created_at: order.created_at, customer: order.full_name, email: order.email, phone: order.phone, item_count: order.item_count,items:order.items||[], packing_video_url: order.packing_video_url || '', packing_video_note: order.packing_video_note || '', packing_video_uploaded_at: order.packing_video_uploaded_at || null }));
}

function packingVideoInput(input) {
  const url = String(input.videoUrl || '').trim();
  const note = String(input.note || '').trim().slice(0, 300);
  const remoteVideo = /^https:\/\/\S+$/i.test(url);
  const uploadedVideo = /^data:video\/(mp4|webm|quicktime);base64,[a-z0-9+/=]+$/i.test(url) && url.length <= 5_600_000;
  if (url && !remoteVideo && !uploadedVideo) throw new Error('Choose a video up to 4 MB, or enter a secure https video link.');
  return { url, note };
}

async function savePackingVideo(orderId, input) {
  await ensureOrderSchema();
  const value = packingVideoInput(input);
  const result = await database().query(
    "update orders set packing_video_url=$2, packing_video_note=$3, packing_video_uploaded_at=case when $2='' then null else now() end where id=$1 returning id,order_number,packing_video_url,packing_video_note,packing_video_uploaded_at",
    [orderId, value.url || '', value.note || null]
  );
  if (!result.rowCount) throw new Error('This order no longer exists.');
  const row = result.rows[0];
  return { orderNumber: Number(row.order_number), videoUrl: row.packing_video_url || '', note: row.packing_video_note || '', uploadedAt: row.packing_video_uploaded_at || null };
}

async function listAdminRefunds() {
  await ensureOrderSchema();
  const result = await database().query(
    `select o.id,o.order_number,o.status,o.total_inr,o.created_at,u.full_name,
            coalesce(sum(w.amount_inr) filter (where w.transaction_type='refund'),0)::integer as refunded_inr,
            max(w.created_at) filter (where w.transaction_type='refund') as last_refund_at
       from orders o join users u on u.id=o.user_id
       left join wallet_transactions w on w.order_id=o.id
      where o.status in ('delivered','returned','return_requested','refunded')
      group by o.id,u.full_name
      order by o.created_at desc limit 500`
  );
  return result.rows.map(row => ({
    id: row.id, orderNumber: Number(row.order_number), status: row.status, customer: row.full_name,
    totalInr: Number(row.total_inr), refundedInr: Number(row.refunded_inr),
    remainingInr: Math.max(0, Number(row.total_inr) - Number(row.refunded_inr)), lastRefundAt: row.last_refund_at
  }));
}

async function refundOrderToWallet(orderId, input) {
  await ensureOrderSchema();
  const amount = Number(input.amount);
  const note = String(input.note || 'Approved return refund').trim().slice(0, 300) || 'Approved return refund';
  if (!Number.isInteger(amount) || amount < 1) throw new Error('Enter a whole refund amount of at least ₹1.');
  const client = await database().connect();
  try {
    await client.query('begin');
    const order = await client.query(
      `select o.id,o.user_id,o.total_inr,o.status,
              coalesce((select sum(w.amount_inr) from wallet_transactions w where w.order_id=o.id and w.transaction_type='refund'),0)::integer as refunded_inr
         from orders o where o.id=$1 for update`, [orderId]
    );
    if (!order.rowCount) throw new Error('This order no longer exists.');
    const saved = order.rows[0];
    if (!['delivered','returned','return_requested','refunded'].includes(saved.status)) throw new Error('Only delivered or returned orders can be refunded.');
    const available = Math.max(0, Number(saved.total_inr) - Number(saved.refunded_inr));
    if (amount > available) throw new Error(`Only ₹${available.toLocaleString('en-IN')} remains available to refund for this order.`);
    const refund = await client.query(
      `insert into wallet_transactions (user_id,order_id,transaction_type,amount_inr,expires_at,note)
       values ($1,$2,'refund',$3,now()+interval '12 months',$4) returning id,expires_at`,
      [saved.user_id, saved.id, amount, note]
    );
    const remaining = available - amount;
    await client.query(`update orders set status=$2,payment_status='refunded' where id=$1`, [saved.id, remaining === 0 ? 'refunded' : saved.status]);
    await client.query(`update return_requests set status='refunded',refund_transaction_id=$2 where order_id=$1 and refund_transaction_id is null`, [saved.id, refund.rows[0].id]);
    await client.query('commit');
    return { amount, expiresAt: refund.rows[0].expires_at, remaining: Math.max(0, remaining) };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

const cleanEmail = value => String(value || '').trim().toLowerCase();
const cleanReferralCode = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashPassword = password => new Promise((resolve, reject) => {
  const salt = crypto.randomBytes(16).toString('base64url');
  crypto.scrypt(password, salt, 64, (error, derived) => error ? reject(error) : resolve(`scrypt$${salt}$${derived.toString('base64url')}`));
});
const passwordsMatch = (password, stored) => new Promise((resolve, reject) => {
  const [kind, salt, expected] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !expected) return resolve(false);
  crypto.scrypt(password, salt, 64, (error, derived) => {
    if (error) return reject(error);
    const target = Buffer.from(expected, 'base64url');
    resolve(target.length === derived.length && crypto.timingSafeEqual(target, derived));
  });
});

async function ensureRewardsSchema() {
  if (rewardsSchemaReady) return rewardsSchemaReady;
  rewardsSchemaReady = (async () => {
    const client = await database().connect();
    try {
      await client.query('begin');
      await client.query(`create or replace function award_referral_coins() returns trigger language plpgsql as $$
        declare referrer uuid;
        begin
          if new.status = 'delivered' and old.status is distinct from 'delivered' then
            select referred_by into referrer from users where id = new.user_id;
            if referrer is not null and not exists (select 1 from referrals where referee_id = new.user_id and rewarded_at is not null) then
              insert into coin_transactions(user_id,order_id,transaction_type,coins,note) values
                (referrer,new.id,'referral_reward',10,'10 coins for a successful referral'),
                (new.user_id,new.id,'referral_reward',10,'Welcome referral reward');
              update referrals set reward_order_id=new.id,rewarded_at=now() where referee_id=new.user_id and rewarded_at is null;
            end if;
          end if;
          return new;
        end $$`);
      await client.query('drop trigger if exists order_delivery_referral_reward on orders');
      await client.query('create trigger order_delivery_referral_reward after update of status on orders for each row execute function award_referral_coins()');
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      rewardsSchemaReady = undefined;
      throw error;
    } finally { client.release(); }
  })();
  return rewardsSchemaReady;
}

// v27 keeps loyalty accounting append-only.  A correction is always a new
// row, never an edit to a customer balance, so retrying provider events cannot
// silently create or remove rewards.
async function ensureCustomerExperienceSchema() {
  if (customerExperienceSchemaReady) return customerExperienceSchemaReady;
  customerExperienceSchemaReady = (async () => {
    const client = await database().connect();
    try {
      await client.query('begin');
      await client.query(`create table if not exists loyalty_settings (
        id boolean primary key default true check (id), earn_divisor_inr numeric(10,2) not null default 10,
        coin_value_inr numeric(10,2) not null default .1, max_redemption_percent numeric(5,2) not null default 10,
        is_enabled boolean not null default true,
        updated_at timestamptz not null default now()
      )`);
      await client.query("insert into loyalty_settings(id) values (true) on conflict (id) do nothing");
      await client.query('alter table loyalty_settings add column if not exists is_enabled boolean not null default true');
      // v27 treated one coin as one rupee. MARKET HUB Coins are now fixed at
      // ten coins per rupee; migrate only that old default value once.
      await client.query('update loyalty_settings set coin_value_inr=.1 where id=true and coin_value_inr=1');
      await client.query(`create table if not exists coin_ledger (
        id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), order_id uuid references orders(id),
        event_key text not null unique, transaction_type text not null, status text not null check (status in ('pending','available','reversed')),
        coins integer not null, reason text not null, created_at timestamptz not null default now()
      )`);
      await client.query('create index if not exists coin_ledger_user_created on coin_ledger(user_id,created_at desc)');
      await client.query(`create table if not exists shiprocket_event_log (
        id uuid primary key default gen_random_uuid(), provider text not null default 'shiprocket', event_key text not null unique,
        order_id uuid references orders(id), event_type text not null, status text, trusted boolean not null default false,
        payload_hash text not null, created_at timestamptz not null default now()
      )`);
      await client.query(`create table if not exists customer_notification_outbox (
        id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), event_key text not null unique,
        channel text not null, template_key text not null, payload jsonb not null default '{}'::jsonb, consent_required boolean not null default true,
        created_at timestamptz not null default now(), sent_at timestamptz
      )`);
      await client.query(`create table if not exists customer_notification_preferences (
        user_id uuid primary key references users(id), transactional_opt_out boolean not null default false,
        marketing_opt_in boolean not null default false, updated_at timestamptz not null default now()
      )`);
      await client.query(`create table if not exists abandoned_checkout_recovery (
        id uuid primary key default gen_random_uuid(), external_id text not null unique, recovery_token text not null unique,
        user_id uuid references users(id), expires_at timestamptz not null, created_at timestamptz not null default now()
      )`);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback'); customerExperienceSchemaReady = undefined; throw error;
    } finally { client.release(); }
  })();
  return customerExperienceSchemaReady;
}

async function ensureAccountV41Schema() {
  if (accountV41SchemaReady) return accountV41SchemaReady;
  accountV41SchemaReady = (async () => {
    const client = await database().connect();
    try {
      await client.query('begin');
      await client.query("alter table users add column if not exists profile_image_url text");
      await client.query("alter table users add column if not exists account_settings jsonb not null default '{}'::jsonb");
      await client.query("alter table orders add column if not exists billing_address jsonb");
      await client.query("alter table orders add column if not exists gst_inr integer not null default 0");
      await client.query("alter table orders add column if not exists invoice_number text");
      await client.query("alter table orders add column if not exists cancelled_at timestamptz");
      await client.query("alter table shipments add column if not exists courier_name text");
      await client.query("alter table shipments add column if not exists tracking_url text");
      await client.query("alter table return_requests add column if not exists request_type text not null default 'return'");
      await client.query("alter table return_requests add column if not exists admin_note text");
      await client.query("alter table return_requests add column if not exists updated_at timestamptz not null default now()");
      await client.query(`create table if not exists customer_notifications (
        id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
        order_id uuid references orders(id) on delete cascade, notification_type text not null default 'account',
        title text not null, message text not null, is_read boolean not null default false,
        created_at timestamptz not null default now()
      )`);
      await client.query('create index if not exists customer_notifications_user_created on customer_notifications(user_id,created_at desc)');
      await client.query(`create table if not exists order_status_events (
        id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
        status text not null, message text, created_at timestamptz not null default now()
      )`);
      await client.query('create index if not exists order_status_events_order_created on order_status_events(order_id,created_at)');
      await client.query(`create table if not exists coupon_redemptions (
        id uuid primary key default gen_random_uuid(), coupon_id uuid not null references coupons(id),
        user_id uuid not null references users(id), order_id uuid references orders(id),
        used_at timestamptz not null default now(), unique(coupon_id,order_id)
      )`);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback'); accountV41SchemaReady = undefined; throw error;
    } finally { client.release(); }
  })();
  return accountV41SchemaReady;
}

async function ensureProductImportSchema() {
  if(productImportSchemaReady)return productImportSchemaReady;
  productImportSchemaReady=(async()=>{const client=await database().connect();try{await client.query('begin');
    await client.query(`create table if not exists product_import_settings (id boolean primary key default true check(id),markup_percent numeric(8,2) not null default 0,fixed_markup_inr numeric(10,2) not null default 0,minimum_profit_inr numeric(10,2) not null default 0,rounding_rule integer not null default 0,default_stock integer not null default 99,default_status text not null default 'draft' check(default_status='draft'),auto_sku boolean not null default true,max_images integer not null default 12,max_media_bytes integer not null default 5242880,allowed_domains text[] not null default '{}'::text[],updated_at timestamptz not null default now())`);
    await client.query('insert into product_import_settings(id) values(true) on conflict(id) do nothing');
    await client.query('alter table product_import_settings alter column default_stock set default 99');
    await client.query('update product_import_settings set default_stock=99 where default_stock=0');
    await client.query(`create table if not exists product_import_jobs (id uuid primary key default gen_random_uuid(),job_type text not null check(job_type in ('single','bulk','extension')),status text not null default 'queued',total_items integer not null default 0,ready_items integer not null default 0,failed_items integer not null default 0,created_by text not null,created_at timestamptz not null default now(),completed_at timestamptz)`);
    await client.query(`create table if not exists product_import_items (id uuid primary key default gen_random_uuid(),job_id uuid references product_import_jobs(id) on delete set null,source_url text not null,source_url_hash text not null,source_domain text not null,source_product_id text,source_sku text,title text,normalized_title text,status text not null default 'ready',duplicate_reason text,existing_product_id uuid references products(id),product_data jsonb not null default '{}'::jsonb,error_message text,created_by text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now())`);
    await client.query('alter table product_import_items add column if not exists published_at timestamptz');
    await client.query('alter table products add column if not exists published_at timestamptz');
    await client.query("alter table products add column if not exists status text not null default 'published'");
    await client.query('create index if not exists product_import_items_created on product_import_items(created_at desc)');await client.query('create index if not exists product_import_items_source_hash on product_import_items(source_url_hash)');
    await client.query(`create table if not exists product_import_media (id uuid primary key default gen_random_uuid(),import_item_id uuid not null references product_import_items(id) on delete cascade,source_url text not null,media_type text not null default 'image',content_type text,file_size integer,width integer,height integer,is_selected boolean not null default true,is_main boolean not null default false,sort_order integer not null default 0,validation_status text not null default 'pending',created_at timestamptz not null default now())`);
    await client.query(`create table if not exists product_import_history (id uuid primary key default gen_random_uuid(),import_item_id uuid references product_import_items(id) on delete set null,product_id uuid references products(id) on delete set null,source_domain text not null,source_url text not null,status text not null,imported_by text not null,error_message text,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now())`);await client.query('create index if not exists product_import_history_created on product_import_history(created_at desc)');
    await client.query(`create table if not exists product_source_mappings (id uuid primary key default gen_random_uuid(),source_domain text not null,source_product_id text,source_url_hash text not null,product_id uuid not null references products(id) on delete cascade,created_at timestamptz not null default now(),unique(source_domain,source_url_hash))`);
    await client.query(`create index if not exists product_source_mapping_source_id on product_source_mappings(source_domain,lower(source_product_id)) where source_product_id is not null and source_product_id<>''`);
    await client.query(`create table if not exists product_import_audit (id uuid primary key default gen_random_uuid(),admin_identity text not null,action text not null,target_id uuid,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now())`);await client.query('create index if not exists product_import_audit_created on product_import_audit(created_at desc)');
    await client.query(`create table if not exists product_import_sku_sequence (id bigserial primary key,created_at timestamptz not null default now())`);
    await client.query(`create index if not exists products_import_search_idx on products using gin (to_tsvector('simple'::regconfig,coalesce(name,'')||' '||coalesce(sku,'')||' '||coalesce(description,'')))`);
    await client.query('create index if not exists products_import_category_idx on products(category_id,is_active,created_at desc)');
    await client.query('commit');}catch(error){await client.query('rollback');productImportSchemaReady=undefined;throw error}finally{client.release()}})();return productImportSchemaReady;
}

async function ensureEngagementSchema() {
  if (engagementSchemaReady) return engagementSchemaReady;
  engagementSchemaReady=(async()=>{const client=await database().connect();try{await client.query('begin');await client.query(`create table if not exists customer_wishlists (user_id uuid not null references users(id) on delete cascade,sku text not null,created_at timestamptz not null default now(),primary key(user_id,sku))`);await client.query(`create table if not exists review_helpful_votes (review_id uuid not null references reviews(id) on delete cascade,user_id uuid not null references users(id) on delete cascade,created_at timestamptz not null default now(),primary key(review_id,user_id))`);await client.query('commit');}catch(error){await client.query('rollback');engagementSchemaReady=undefined;throw error;}finally{client.release();}})();return engagementSchemaReady;
}

async function customerWishlist(userId) { await ensureEngagementSchema(); const result=await database().query('select sku from customer_wishlists where user_id=$1 order by created_at desc',[userId]);return result.rows.map(row=>row.sku); }
async function saveCustomerWishlist(userId, sku, saved) { await ensureEngagementSchema(); const value=String(sku||'').trim().slice(0,100);if(!value)throw new Error('Choose a product to save.');if(saved)await database().query('insert into customer_wishlists(user_id,sku) values($1,$2) on conflict do nothing',[userId,value]);else await database().query('delete from customer_wishlists where user_id=$1 and sku=$2',[userId,value]);return customerWishlist(userId); }

async function loyaltyRules() {
  await ensureCustomerExperienceSchema();
  const result = await database().query('select earn_divisor_inr,coin_value_inr,max_redemption_percent,is_enabled from loyalty_settings where id=true');
  const row = result.rows[0];
  return { earnDivisorInr:Number(row.earn_divisor_inr), coinValueInr:Number(row.coin_value_inr), maxRedemptionPercent:Number(row.max_redemption_percent), enabled:Boolean(row.is_enabled) };
}

async function coinSummary(userId) {
  await ensureCustomerExperienceSchema();
  const result = await database().query(`select coins,transaction_type,status,reason,order_id,created_at,
    sum(coins) over (order by created_at,id rows between unbounded preceding and current row)::integer as balance_after
    from coin_ledger where user_id=$1 order by created_at,id`, [userId]);
  const entries=result.rows;
  const available=Math.max(0,entries.filter(row=>['available','reversed'].includes(row.status)).reduce((sum,row)=>sum+Number(row.coins),0));
  const pending=Math.max(0,entries.filter(row=>row.status==='pending').reduce((sum,row)=>sum+Number(row.coins),0));
  const totalEarned=entries.filter(row=>Number(row.coins)>0).reduce((sum,row)=>sum+Number(row.coins),0);
  const totalRedeemed=Math.abs(entries.filter(row=>row.transaction_type==='redemption').reduce((sum,row)=>sum+Number(row.coins),0));
  return { available, pending, totalEarned, totalRedeemed, history:entries.slice(-100).reverse().map(row=>({coins:Number(row.coins),type:row.transaction_type,status:row.status,reason:row.reason,orderId:row.order_id,createdAt:row.created_at,balanceAfter:Number(row.balance_after)})) };
}

async function createPendingOrderCoins(client, orderId, userId, subtotal) {
  const settings = await client.query('select earn_divisor_inr,is_enabled from loyalty_settings where id=true');
  if (settings.rows[0]?.is_enabled === false) return 0;
  const divisor = Math.max(1, Number(settings.rows[0]?.earn_divisor_inr || 10));
  const coins = Math.floor(Math.max(0, Number(subtotal || 0)) / divisor);
  if (!coins) return 0;
  await client.query(`insert into coin_ledger(user_id,order_id,event_key,transaction_type,status,coins,reason)
    values ($1,$2,$3,'order_reward','pending',$4,'Pending until Shiprocket confirms delivery') on conflict (event_key) do nothing`,
    [userId, orderId, `order:${orderId}:pending`, coins]);
  return coins;
}

async function setLoyaltyRules(input, adminReason) {
  await ensureCustomerExperienceSchema();
  const earnDivisorInr=Number(input.earnDivisorInr),coinValueInr=Number(input.coinValueInr),maxRedemptionPercent=Number(input.maxRedemptionPercent);
  if (!Number.isFinite(earnDivisorInr)||earnDivisorInr<=0||!Number.isFinite(coinValueInr)||coinValueInr<=0||!Number.isFinite(maxRedemptionPercent)||maxRedemptionPercent<0||maxRedemptionPercent>100) throw new Error('Enter valid loyalty rules.');
  const enabled=input.enabled === undefined ? null : input.enabled === true || input.enabled === 'true' || input.enabled === 'on';
  await database().query('update loyalty_settings set earn_divisor_inr=$1,coin_value_inr=$2,max_redemption_percent=$3,is_enabled=coalesce($4,is_enabled),updated_at=now() where id=true',[earnDivisorInr,coinValueInr,maxRedemptionPercent,enabled]);
  return { ...(await loyaltyRules()), auditReason:String(adminReason||'Admin loyalty setting update').slice(0,300) };
}

async function loyaltyQuote(userId, eligibleValueInr, requestedCoins) {
  const rules=await loyaltyRules(); const summary=await coinSummary(userId);
  const available=Math.max(0,summary.available); const total=Math.max(0,Number(eligibleValueInr||0));
  const unit=Math.max(.01,Number(rules.coinValueInr||.1));
  const maxValue=total*Math.max(0,Number(rules.maxRedemptionPercent||0))/100;
  const maxCoins=Math.max(0,Math.floor(maxValue/unit/10)*10);
  const requested=Math.max(0,Math.floor(Number(requestedCoins||0)/10)*10);
  const approved=rules.enabled?Math.min(available,maxCoins,requested):0;
  return {enabled:rules.enabled,availableCoins:available,availableValueInr:Number((available*unit).toFixed(2)),coinValueInr:unit,maxCoins,approvedCoins:approved,redemptionValueInr:Number((approved*unit).toFixed(2)),maximumRedemptionPercent:rules.maxRedemptionPercent};
}

async function adminCoinAdjustment(userId, input) {
  await ensureCustomerExperienceSchema();
  const coins=Math.trunc(Number(input.coins)); const reason=String(input.reason||'').trim().slice(0,300);
  if (!Number.isInteger(coins)||!coins||Math.abs(coins)>100000||reason.length<3) throw new Error('Enter a coin amount and a reason.');
  await database().query(`insert into coin_ledger(user_id,event_key,transaction_type,status,coins,reason)
    values ($1,$2,'admin_adjustment','available',$3,$4)`,[userId,`admin:${crypto.randomUUID()}`,coins,reason]);
  return coinSummary(userId);
}

async function listAdminLoyalty() {
  await ensureCustomerExperienceSchema();
  const rows=await database().query(`select u.id,u.full_name,u.email,coalesce(sum(l.coins) filter(where l.status='pending'),0)::integer pending,
    coalesce(sum(l.coins) filter(where l.status in ('available','reversed')),0)::integer available
    from users u left join coin_ledger l on l.user_id=u.id group by u.id order by u.created_at desc limit 500`);
  return { rules:await loyaltyRules(), customers:rows.rows.map(row=>({id:row.id,name:row.full_name,email:row.email,available:Math.max(0,Number(row.available)),pending:Math.max(0,Number(row.pending))})) };
}

async function recordShiprocketEvent(input) {
  await ensureCustomerExperienceSchema();
  await ensureVariantSchema();
  const eventKey=String(input.eventKey||'').slice(0,200), type=String(input.type||'unknown').toLowerCase(), externalOrderId=String(input.externalOrderId||'').slice(0,200);
  if (!eventKey) throw new Error('Webhook event id is missing.');
  const client=await database().connect();
  try {
    await client.query('begin');
    const existing=await client.query('select id from shiprocket_event_log where event_key=$1',[eventKey]);
    if(existing.rowCount){await client.query('commit');return {duplicate:true};}
    const order=externalOrderId?await client.query('select id,user_id,status from orders where shiprocket_order_id=$1',[externalOrderId]):{rows:[]};
    const saved=order.rows[0]||null;
    await client.query(`insert into shiprocket_event_log(event_key,order_id,event_type,status,trusted,payload_hash)
      values ($1,$2,$3,$4,$5,$6)`,[eventKey,saved?.id||null,type,String(input.status||'').slice(0,80)||null,Boolean(input.trusted),String(input.payloadHash||'').slice(0,128)]);
    if (saved && input.trusted) {
      const terminal=/cancel|refund|return|ndr|delivery.failed/.test(type);
      const delivered=/delivered/.test(type);
      const mapped=delivered?'delivered':terminal?(type.includes('return')?'returned':'cancelled'):null;
      if(mapped) await client.query('update orders set status=$2, delivered_at=case when $2=\'delivered\' then coalesce(delivered_at,now()) else delivered_at end where id=$1',[saved.id,mapped]);
      if(mapped&&['cancelled','returned','refunded'].includes(mapped))await restoreOrderInventory(client,saved.id);
      if(delivered){
        const pending=await client.query("select coalesce(sum(coins),0)::integer coins from coin_ledger where order_id=$1 and status='pending'",[saved.id]);
        const coins=Math.max(0,Number(pending.rows[0].coins));
        if(coins){
          await client.query("insert into coin_ledger(user_id,order_id,event_key,transaction_type,status,coins,reason) values ($1,$2,$3,'pending_release','pending',$4,'Released after delivery') on conflict(event_key) do nothing",[saved.user_id,saved.id,`order:${saved.id}:pending-release`, -coins]);
          await client.query("insert into coin_ledger(user_id,order_id,event_key,transaction_type,status,coins,reason) values ($1,$2,$3,'delivery_reward','available',$4,'Available after Shiprocket delivery') on conflict(event_key) do nothing",[saved.user_id,saved.id,`order:${saved.id}:available`,coins]);
        }
      }
      if(terminal){
        const balance=await client.query("select coalesce(sum(coins) filter(where status in ('pending','available','reversed')),0)::integer coins from coin_ledger where order_id=$1",[saved.id]);
        const coins=Math.max(0,Number(balance.rows[0].coins));
        if(coins) await client.query("insert into coin_ledger(user_id,order_id,event_key,transaction_type,status,coins,reason) values ($1,$2,$3,'order_reversal','reversed',$4,'Reversed after order cancellation, return or refund') on conflict(event_key) do nothing",[saved.user_id,saved.id,`order:${saved.id}:reversal`,-coins]);
      }
      if (/packed|shipped|out.for.delivery|delivered|cancel|refund|return|ndr/.test(type)) await client.query(`insert into customer_notification_outbox(user_id,event_key,channel,template_key,payload)
        values ($1,$2,'provider','order_status',$3::jsonb) on conflict(event_key) do nothing`,[saved.user_id,`notification:${eventKey}`,JSON.stringify({event:type})]);
    }
    await client.query('commit'); return {duplicate:false,matchedOrder:Boolean(saved)};
  } catch(error){await client.query('rollback');throw error;} finally{client.release();}
}

async function registerCustomer(input) {
  const fullName = String(input.fullName || '').trim().replace(/\s+/g, ' ');
  const phone = String(input.phone || '').replace(/\D/g, '');
  const email = cleanEmail(input.email);
  const password = String(input.password || '');
  const referralCode = cleanReferralCode(input.referralCode);
  if (fullName.length < 2 || fullName.length > 100) throw new Error('Enter your full name.');
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit mobile number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  if (password.length < 8 || password.length > 200) throw new Error('Your password must be at least 8 characters.');
  const client = await database().connect();
  try {
    await client.query('begin');
    const exists = await client.query('select id from users where email=$1 or phone=$2', [email, phone]);
    if (exists.rowCount) throw new Error('An account already exists with this email or mobile number. Please sign in.');
    let referrerId = null;
    if (referralCode) {
      const referrer = await client.query('select id from users where referral_code=$1 and is_active=true', [referralCode]);
      if (!referrer.rowCount) throw new Error('This referral code is not valid.');
      referrerId = referrer.rows[0].id;
    }
    const saved = await client.query(
      'insert into users (full_name,email,phone,password_hash,referral_code,referred_by) values ($1,$2,$3,$4,$5,$6) returning id,full_name,email,referral_code',
      [fullName, email, phone, await hashPassword(password), newReferralCode(), referrerId]
    );
    if (referrerId) await client.query('insert into referrals (referrer_id,referee_id) values ($1,$2)', [referrerId, saved.rows[0].id]);
    await client.query('commit');
    return saved.rows[0];
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

async function authenticateCustomer(emailInput, password) {
  const login = String(emailInput || '').trim();
  const email = cleanEmail(login);
  const phone = login.replace(/\D/g, '');
  if (!login || !password) return null;
  const result = await database().query('select id,full_name,email,password_hash,referral_code,is_active from users where email=$1 or phone=$2 limit 1', [email, phone]);
  const customer = result.rows[0];
  if (!customer || !customer.is_active || !customer.password_hash || !(await passwordsMatch(String(password), customer.password_hash))) return null;
  return { id: customer.id, fullName: customer.full_name, email: customer.email, referralCode: customer.referral_code };
}

async function customerAccount(userId) {
  await ensureRewardsSchema();
  await ensureCustomerExperienceSchema();
  await ensureAccountV41Schema();
  const result = await database().query(
    `select u.full_name,u.email,u.phone,u.referral_code,u.profile_image_url,
      coalesce((select sum(case when w.transaction_type in ('refund','credit','adjustment') then w.amount_inr else -w.amount_inr end)
        from wallet_transactions w where w.user_id=u.id and (w.expires_at is null or w.expires_at > now())),0)::integer as wallet_balance,
      coalesce((select sum(case when c.transaction_type in ('purchase_reward','referral_reward','adjustment') then c.coins else -c.coins end)
        from coin_transactions c where c.user_id=u.id and (c.expires_at is null or c.expires_at > now())),0)::integer as coin_balance,
      coalesce((select jsonb_agg(jsonb_build_object('type',w.transaction_type,'amount',w.amount_inr,'note',w.note,'createdAt',w.created_at,'expiresAt',w.expires_at) order by w.created_at desc)
        from (select * from wallet_transactions where user_id=u.id order by created_at desc limit 8) w),'[]'::jsonb) as wallet_activity
    from users u where u.id=$1 and u.is_active=true`, [userId]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  const coins = await coinSummary(userId); const rules=await loyaltyRules();
  return { fullName: row.full_name, email: row.email, phone: row.phone || '', profileImageUrl:row.profile_image_url || '', referralCode: row.referral_code, walletBalance: Number(row.wallet_balance), coinBalance: coins.available, pendingCoins: coins.pending, totalEarnedCoins:coins.totalEarned, totalRedeemedCoins:coins.totalRedeemed, coinValueInr:rules.coinValueInr, loyaltyEnabled:rules.enabled, coinHistory: coins.history, walletActivity: row.wallet_activity || [] };
}

async function updateCustomerProfile(userId, input) {
  await ensureAccountV41Schema();
  const fullName = String(input.fullName || '').trim().replace(/\s+/g, ' ');
  const email = cleanEmail(input.email);
  const phone = String(input.phone || '').replace(/\D/g, '');
  const profileImageUrl = String(input.profileImageUrl || '').trim();
  if (fullName.length < 2 || fullName.length > 100) throw new Error('Enter your full name.');
  if (!email || email.length > 254) throw new Error('Enter a valid email address.');
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit mobile number.');
  if (profileImageUrl && !/^https:\/\/\S+$/i.test(profileImageUrl)) throw new Error('Profile picture must use a secure https link.');
  const result = await database().query('update users set full_name=$2,email=$3,phone=$4,profile_image_url=$5,updated_at=now() where id=$1 and is_active=true returning full_name,email,phone,profile_image_url', [userId, fullName, email, phone, profileImageUrl || null]);
  if (!result.rowCount) throw new Error('Your profile is not available.');
  return { fullName: result.rows[0].full_name, email: result.rows[0].email, phone: result.rows[0].phone, profileImageUrl:result.rows[0].profile_image_url || '' };
}

async function customerAddresses(userId) {
  const result = await database().query('select id,label,full_name,phone,line1,line2,city,state,pincode,is_default from addresses where user_id=$1 order by is_default desc,created_at desc', [userId]);
  return result.rows.map(row => ({ id:row.id,label:row.label,fullName:row.full_name,phone:row.phone,line1:row.line1,line2:row.line2||'',city:row.city,state:row.state,pincode:row.pincode,isDefault:row.is_default }));
}

async function saveCustomerAddress(userId, input) {
  const id=String(input.id||''),label=String(input.label||'Home').trim().slice(0,30)||'Home',fullName=String(input.fullName||'').trim().replace(/\s+/g,' '),phone=String(input.phone||'').replace(/\D/g,''),line1=String(input.line1||'').trim(),line2=String(input.line2||'').trim(),city=String(input.city||'').trim(),state=String(input.state||'').trim(),pincode=String(input.pincode||'').replace(/\D/g,'').slice(0,6),isDefault=input.isDefault===true;
  if(fullName.length<2||!line1||!city||!state||!/^[6-9]\d{9}$/.test(phone)||!/^\d{6}$/.test(pincode)) throw new Error('Complete the address with a valid mobile number and 6-digit PIN code.');
  const client=await database().connect();
  try { await client.query('begin'); if(isDefault) await client.query('update addresses set is_default=false where user_id=$1',[userId]); const result=id?await client.query('update addresses set label=$3,full_name=$4,phone=$5,line1=$6,line2=$7,city=$8,state=$9,pincode=$10,is_default=$11 where id=$2 and user_id=$1 returning id',[userId,id,label,fullName,phone,line1,line2||null,city,state,pincode,isDefault]):await client.query('insert into addresses (user_id,label,full_name,phone,line1,line2,city,state,pincode,is_default) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id',[userId,label,fullName,phone,line1,line2||null,city,state,pincode,isDefault]); if(!result.rowCount) throw new Error('This saved address is no longer available.'); await client.query('commit'); return {id:result.rows[0].id}; } catch(error){await client.query('rollback');throw error;} finally{client.release();}
}

async function deleteCustomerAddress(userId,addressId) { const result=await database().query('delete from addresses where id=$1 and user_id=$2 returning id',[addressId,userId]); if(!result.rowCount) throw new Error('This saved address is no longer available.'); }

async function customerReturnItems(userId) {
  await ensureVariantSchema();
  const result = await database().query(
    `select oi.id as order_item_id,oi.product_name,oi.quantity,coalesce(oi.variant_sku,oi.sku) variant_sku,oi.selected_options,o.order_number,o.delivered_at,
            rr.status as return_status
       from orders o join order_items oi on oi.order_id=o.id
       left join return_requests rr on rr.order_item_id=oi.id
      where o.user_id=$1 and (rr.id is not null or (o.status='delivered' and o.delivered_at >= now()-interval '3 days'))
      order by o.delivered_at desc nulls last,oi.product_name`, [userId]
  );
  return result.rows.map(row => ({ orderItemId: row.order_item_id, productName: row.product_name, quantity: Number(row.quantity),variantSku:row.variant_sku,selectedOptions:row.selected_options||{}, orderNumber: Number(row.order_number), deliveredAt: row.delivered_at, returnStatus: row.return_status || null }));
}

async function relinkCustomerOrders(userId) {
  await database().query(
    `update orders
        set user_id=$1
      where user_id<>$1
        and user_id in (
          select matched.id
            from users current_user
            join users matched
              on (current_user.email is not null and current_user.email<>'' and matched.email=current_user.email)
              or (current_user.phone is not null and current_user.phone<>'' and matched.phone=current_user.phone)
           where current_user.id=$1
        )`,
    [userId]
  );
}

async function customerOrders(userId) {
  await relinkCustomerOrders(userId);
  const result = await database().query(
    `select o.order_number,o.status,o.payment_status,o.created_at,o.total_inr,o.packing_video_url,o.packing_video_note,
            s.awb,s.tracking_status,s.estimated_delivery_date,
            coalesce(count(oi.id),0)::integer as item_count
       from orders o left join shipments s on s.order_id=o.id left join order_items oi on oi.order_id=o.id
      where o.user_id=$1
      group by o.id,s.awb,s.tracking_status,s.estimated_delivery_date
      order by o.created_at desc limit 100`, [userId]
  );
  return result.rows.map(row => ({
    orderNumber: Number(row.order_number), status: row.status, paymentStatus: row.payment_status,
    createdAt: row.created_at, totalInr: Number(row.total_inr), itemCount: Number(row.item_count),
    awb: row.awb || null, trackingStatus: row.tracking_status || null, estimatedDeliveryDate: row.estimated_delivery_date,
    packingVideoUrl: row.packing_video_url || '', packingVideoNote: row.packing_video_note || ''
  }));
}

async function customerReviewItems(userId) {
  const result = await database().query(
    `select oi.id as order_item_id,oi.product_name,oi.product_id,o.order_number,r.id as review_id,r.is_approved
       from order_items oi join orders o on o.id=oi.order_id
       left join reviews r on r.order_item_id=oi.id and r.user_id=o.user_id
      where o.user_id=$1 and o.status='delivered' and oi.product_id is not null
      order by o.delivered_at desc nulls last,oi.product_name`, [userId]
  );
  return result.rows.map(row => ({ orderItemId: row.order_item_id, productName: row.product_name, orderNumber: Number(row.order_number), reviewed: Boolean(row.review_id), approved: Boolean(row.is_approved) }));
}

const reviewImage = value => /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(String(value || '')) && String(value).length <= 700000;
async function submitCustomerReview(userId, input) {
  const orderItemId = String(input.orderItemId || '');
  const rating = Number(input.rating);
  const body = String(input.body || '').trim();
  const images = Array.isArray(input.images) ? input.images.map(String).filter(Boolean) : [];
  if (!/^[0-9a-f-]{36}$/i.test(orderItemId)) throw new Error('Choose a delivered product.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Choose a rating from 1 to 5 stars.');
  if (body.length < 5 || body.length > 1500) throw new Error('Your review must be between 5 and 1,500 characters.');
  if (images.length > 3 || images.some(image => !reviewImage(image))) throw new Error('Add up to 3 JPG, PNG or WebP photos under 500 KB each.');
  const client = await database().connect();
  try {
    await client.query('begin');
    const item = await client.query(
      `select oi.product_id from order_items oi join orders o on o.id=oi.order_id
        where oi.id=$1 and o.user_id=$2 and o.status='delivered' for update`, [orderItemId, userId]
    );
    if (!item.rowCount || !item.rows[0].product_id) throw new Error('Only delivered products can be reviewed.');
    const review = await client.query('insert into reviews (user_id,product_id,order_item_id,rating,body) values ($1,$2,$3,$4,$5) returning id', [userId,item.rows[0].product_id,orderItemId,rating,body]);
    for (const image of images) await client.query('insert into review_images (review_id,url) values ($1,$2)', [review.rows[0].id,image]);
    await client.query('commit');
    return { submitted:true };
  } catch (error) {
    await client.query('rollback');
    if (error.code === '23505') throw new Error('You have already reviewed this product.');
    throw error;
  } finally { client.release(); }
}

async function listAdminReviews() {
  const result = await database().query(
    `select r.id,r.rating,r.body,r.is_approved,r.created_at,u.full_name,p.name as product_name,
      coalesce(jsonb_agg(ri.url) filter (where ri.id is not null),'[]'::jsonb) as images
       from reviews r join users u on u.id=r.user_id join products p on p.id=r.product_id
       left join review_images ri on ri.review_id=r.id
      group by r.id,u.full_name,p.name order by r.created_at desc limit 500`
  );
  return result.rows.map(row => ({ id:row.id,rating:Number(row.rating),body:row.body,approved:row.is_approved,createdAt:row.created_at,customer:row.full_name,productName:row.product_name,images:row.images || [] }));
}

async function approveReview(reviewId, approved) {
  const result = await database().query('update reviews set is_approved=$2 where id=$1 returning id', [reviewId, Boolean(approved)]);
  if (!result.rowCount) throw new Error('This review no longer exists.');
}

async function publicReviewsBySku(sku, sort = 'newest') {
  await ensureEngagementSchema();
  const orderBy={newest:'r.created_at desc',highest:'r.rating desc, r.created_at desc',helpful:'helpful_count desc, r.created_at desc'}[sort] || 'r.created_at desc';
  const result = await database().query(
    `select r.id,r.rating,r.body,r.created_at,u.full_name,count(distinct hv.user_id)::integer as helpful_count,coalesce(jsonb_agg(distinct ri.url) filter (where ri.id is not null),'[]'::jsonb) as images
       from reviews r join products p on p.id=r.product_id join users u on u.id=r.user_id left join review_images ri on ri.review_id=r.id
      left join review_helpful_votes hv on hv.review_id=r.id where p.sku=$1 and r.is_approved=true group by r.id,u.full_name order by ${orderBy} limit 50`, [String(sku || '')]
  );
  return result.rows.map(row => ({ id:row.id,rating:Number(row.rating),body:row.body,createdAt:row.created_at,customer:row.full_name,images:row.images || [],helpfulCount:Number(row.helpful_count),verifiedPurchase:true }));
}

async function reviewSummary(skus) { const values=[...new Set((Array.isArray(skus)?skus:[]).map(String).filter(Boolean))].slice(0,200);if(!values.length)return {};const result=await database().query(`select p.sku,round(avg(r.rating)::numeric,1) average_rating,count(r.id)::integer review_count from products p left join reviews r on r.product_id=p.id and r.is_approved=true where p.sku=any($1::text[]) group by p.sku`,[values]);return Object.fromEntries(result.rows.map(row=>[row.sku,{averageRating:Number(row.average_rating||0),reviewCount:Number(row.review_count)}])); }
async function voteReviewHelpful(userId, reviewId) { await ensureEngagementSchema();if(!/^[0-9a-f-]{36}$/i.test(String(reviewId||'')))throw new Error('Review is not available.');await database().query('insert into review_helpful_votes(review_id,user_id) values($1,$2) on conflict do nothing',[reviewId,userId]);const result=await database().query('select count(*)::integer as total from review_helpful_votes where review_id=$1',[reviewId]);return Number(result.rows[0].total); }
async function deleteReview(reviewId) { const result=await database().query('delete from reviews where id=$1 returning id',[reviewId]);if(!result.rowCount)throw new Error('This review no longer exists.'); }

async function requestCustomerReturn(userId, input) {
  await ensureAccountV41Schema();
  const orderItemId = String(input.orderItemId || '');
  const reason = String(input.reason || '').trim().replace(/\s+/g, ' ');
  const details = String(input.details || '').trim().slice(0, 1000) || null;
  const requestType = input.requestType === 'replacement' ? 'replacement' : 'return';
  if (!/^[0-9a-f-]{36}$/i.test(orderItemId)) throw new Error('Choose an eligible delivered product.');
  if (reason.length < 3 || reason.length > 160) throw new Error('Tell us the reason for the return.');
  const client = await database().connect();
  try {
    await client.query('begin');
    const item = await client.query(
      `select oi.id,oi.order_id,o.delivered_at,o.status
         from order_items oi join orders o on o.id=oi.order_id
        where oi.id=$1 and o.user_id=$2 for update`, [orderItemId, userId]
    );
    if (!item.rowCount) throw new Error('This delivered product is not available for return.');
    const saved = item.rows[0];
    if (saved.status !== 'delivered' || !saved.delivered_at || new Date(saved.delivered_at).getTime() + 3 * 24 * 60 * 60 * 1000 < Date.now()) throw new Error('Returns can only be requested within 3 days of delivery.');
    const exists = await client.query('select id from return_requests where order_item_id=$1', [orderItemId]);
    if (exists.rowCount) throw new Error('A return request already exists for this product.');
    await client.query('insert into return_requests (order_id,user_id,order_item_id,reason,details,request_type) values ($1,$2,$3,$4,$5,$6)', [saved.order_id, userId, orderItemId, reason, details, requestType]);
    await client.query("update orders set status='return_requested' where id=$1", [saved.order_id]);
    await client.query('commit');
    return { requested: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

const accountOrderStatus = value => String(value || '').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 40);
const orderNumberValue = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('This order is not available.');
  return number;
};

async function customerDashboard(userId) {
  await ensureAccountV41Schema();
  await ensureEngagementSchema();
  const result = await database().query(`select
    count(o.id)::integer total_orders,
    count(o.id) filter (where o.status in ('pending','confirmed','packed','shipped'))::integer pending_orders,
    count(o.id) filter (where o.status='delivered')::integer delivered_orders,
    coalesce((select sum(case when transaction_type in ('refund','credit','adjustment') then amount_inr else -amount_inr end)
      from wallet_transactions where user_id=$1 and (expires_at is null or expires_at>now())),0)::integer wallet_balance,
    (select count(*)::integer from customer_wishlists where user_id=$1) wishlist_count,
    (select count(*)::integer from customer_notifications where user_id=$1 and is_read=false) unread_notifications
    from orders o where o.user_id=$1`, [userId]);
  const notifications = await customerNotifications(userId, 6);
  const row = result.rows[0];
  return { totalOrders:Number(row.total_orders), pendingOrders:Number(row.pending_orders), deliveredOrders:Number(row.delivered_orders),
    walletBalance:Number(row.wallet_balance), wishlistCount:Number(row.wishlist_count), unreadNotifications:Number(row.unread_notifications), recentNotifications:notifications };
}

async function customerOrdersV41(userId, status = '') {
  await ensureAccountV41Schema();
  await ensureVariantSchema();
  await relinkCustomerOrders(userId);
  const state = accountOrderStatus(status);
  const values = [userId];
  const statusSql = state ? ` and o.status::text=$2` : '';
  if (state) values.push(state);
  const result = await database().query(`select o.order_number,o.status,o.payment_status,o.payment_method,o.created_at,o.total_inr,
    s.awb,s.courier_name,s.tracking_status,s.estimated_delivery_date,
    coalesce(jsonb_agg(jsonb_build_object('sku',coalesce(oi.variant_sku,oi.sku),'name',oi.product_name,'quantity',oi.quantity,
      'variantId',oi.product_variant_id,'options',oi.selected_options,'price',oi.unit_price_inr,'image',coalesce(oi.variant_image_url,
        (select pvi.url from product_variant_images pvi where pvi.variant_id=oi.product_variant_id order by pvi.sort_order limit 1),
        (select pi.url from product_images pi where pi.product_id=oi.product_id order by pi.sort_order limit 1),'')))
      filter (where oi.id is not null),'[]'::jsonb) items
    from orders o left join shipments s on s.order_id=o.id left join order_items oi on oi.order_id=o.id
    where o.user_id=$1${statusSql} group by o.id,s.awb,s.courier_name,s.tracking_status,s.estimated_delivery_date
    order by o.created_at desc limit 100`, values);
  return result.rows.map(row => ({ orderNumber:Number(row.order_number), status:row.status, paymentStatus:row.payment_status,
    paymentMethod:row.payment_method, createdAt:row.created_at, totalInr:Number(row.total_inr), awb:row.awb,
    courierName:row.courier_name, trackingStatus:row.tracking_status, estimatedDeliveryDate:row.estimated_delivery_date,
    items:(row.items || []).map(item => ({...item,quantity:Number(item.quantity),price:Number(item.price)})) }));
}

async function customerOrderDetails(userId, orderNumber) {
  await ensureAccountV41Schema();
  await ensureVariantSchema();
  const result = await database().query(`select o.*,c.code coupon_code,
    jsonb_build_object('label',a.label,'fullName',a.full_name,'phone',a.phone,'line1',a.line1,'line2',a.line2,
      'city',a.city,'state',a.state,'pincode',a.pincode) shipping,
    row_to_json(s) shipment,
    coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'sku',coalesce(oi.variant_sku,oi.sku),'name',oi.product_name,'quantity',oi.quantity,
      'variantId',oi.product_variant_id,'options',oi.selected_options,'price',oi.unit_price_inr,'image',coalesce(oi.variant_image_url,
        (select pvi.url from product_variant_images pvi where pvi.variant_id=oi.product_variant_id order by pvi.sort_order limit 1),
        (select pi.url from product_images pi where pi.product_id=oi.product_id order by pi.sort_order limit 1),'')))
      from order_items oi where oi.order_id=o.id),'[]'::jsonb) items,
    coalesce((select jsonb_agg(jsonb_build_object('status',e.status,'message',e.message,'createdAt',e.created_at) order by e.created_at)
      from order_status_events e where e.order_id=o.id),'[]'::jsonb) timeline
    from orders o left join addresses a on a.id=o.address_id left join coupons c on c.id=o.coupon_id
    left join shipments s on s.order_id=o.id where o.user_id=$1 and o.order_number=$2`, [userId, orderNumberValue(orderNumber)]);
  if (!result.rowCount) throw new Error('This order is not available.');
  const row=result.rows[0], billing=row.billing_address || row.shipping;
  return { orderNumber:Number(row.order_number),createdAt:row.created_at,status:row.status,paymentStatus:row.payment_status,
    paymentMethod:row.payment_method,subtotalInr:Number(row.subtotal_inr),discountInr:Number(row.discount_inr),
    shippingInr:Number(row.shipping_inr),walletUsedInr:Number(row.wallet_used_inr),gstInr:Number(row.gst_inr),
    totalInr:Number(row.total_inr),couponCode:row.coupon_code || '',shippingAddress:row.shipping,billingAddress:billing,
    shipment:row.shipment,items:row.items || [],timeline:row.timeline || [],invoiceNumber:row.invoice_number || `MH-${row.order_number}` };
}

async function cancelCustomerOrder(userId, orderNumber) {
  await ensureAccountV41Schema();
  await ensureVariantSchema();
  const client=await database().connect();
  try {
    await client.query('begin');
    const result=await client.query(`select o.id,o.status,s.awb from orders o left join shipments s on s.order_id=o.id
      where o.user_id=$1 and o.order_number=$2 for update`,[userId,orderNumberValue(orderNumber)]);
    if(!result.rowCount) throw new Error('This order is not available.');
    const row=result.rows[0];
    if(row.awb || !['pending','confirmed'].includes(row.status)) throw new Error('This order can no longer be cancelled.');
    await restoreOrderInventory(client,row.id);
    await client.query("update orders set status='cancelled',cancelled_at=now() where id=$1",[row.id]);
    await client.query("insert into order_status_events(order_id,status,message) values($1,'cancelled','Cancelled by customer')",[row.id]);
    await client.query("insert into customer_notifications(user_id,order_id,notification_type,title,message) values($1,$2,'cancelled','Order cancelled',$3)",
      [userId,row.id,`Order MH${orderNumber} was cancelled.`]);
    await client.query('commit'); return {cancelled:true};
  } catch(error){await client.query('rollback');throw error;} finally{client.release();}
}

async function buyAgainItems(userId, orderNumber) {
  await ensureVariantSchema();
  const result=await database().query(`select p.id,p.sku product_sku,p.name,coalesce(pv.id,oi.product_variant_id) variant_id,
    coalesce(pv.sku,p.sku) sku,coalesce(pv.price_inr,p.price_inr) price_inr,coalesce(pv.compare_at_price_inr,p.compare_at_price_inr) compare_at_price_inr,
    coalesce(pv.stock_quantity,p.stock_quantity) stock_quantity,coalesce(pv.is_enabled,true) variant_enabled,oi.quantity,
    coalesce(oi.selected_options,'{}'::jsonb) selected_options,coalesce((select url from product_variant_images where variant_id=pv.id order by sort_order limit 1),
      (select url from product_images where product_id=p.id order by sort_order limit 1),'') image
    from orders o join order_items oi on oi.order_id=o.id join products p on p.id=oi.product_id left join product_variants pv on pv.id=oi.product_variant_id
    where o.user_id=$1 and o.order_number=$2 and p.is_active=true`,[userId,orderNumberValue(orderNumber)]);
  if(!result.rowCount) throw new Error('These products are no longer available.');
  return result.rows.map(row=>({id:row.id,productId:row.id,parentSku:row.product_sku,variantId:row.variant_id||null,variantSku:row.sku,sku:row.sku,
    selectedOptions:row.selected_options||{},name:row.name,price:Number(row.price_inr),old:Number(row.compare_at_price_inr||0),
    stock:Number(row.stock_quantity),qty:row.variant_enabled?Math.min(Number(row.quantity),Number(row.stock_quantity)):0,img:row.image,variantImage:row.image})).filter(item=>item.qty>0);
}

async function customerNotifications(userId, limit=100) {
  await ensureAccountV41Schema();
  const result=await database().query(`select id,notification_type,title,message,is_read,created_at from customer_notifications
    where user_id=$1 order by created_at desc limit $2`,[userId,Math.min(100,Math.max(1,Number(limit)||100))]);
  return result.rows.map(row=>({id:row.id,type:row.notification_type,title:row.title,message:row.message,isRead:row.is_read,createdAt:row.created_at}));
}
async function markCustomerNotifications(userId, notificationId='all') {
  await ensureAccountV41Schema();
  if(notificationId==='all') await database().query('update customer_notifications set is_read=true where user_id=$1',[userId]);
  else await database().query('update customer_notifications set is_read=true where id=$1 and user_id=$2',[notificationId,userId]);
  return {updated:true};
}
async function customerCoupons(userId) {
  await ensureAccountV41Schema();
  const result=await database().query(`select c.code,c.discount_type,c.discount_value,c.minimum_order_inr,c.starts_at,c.ends_at,
    exists(select 1 from coupon_redemptions cr where cr.coupon_id=c.id and cr.user_id=$1) used
    from coupons c where c.is_active=true order by c.ends_at nulls last,c.code`,[userId]);
  const now=Date.now();
  return result.rows.map(row=>({code:row.code,type:row.discount_type,value:Number(row.discount_value),minimumOrderInr:Number(row.minimum_order_inr),
    startsAt:row.starts_at,endsAt:row.ends_at,used:row.used,expired:Boolean(row.ends_at&&new Date(row.ends_at).getTime()<now)}));
}
async function changeCustomerPassword(userId,input) {
  const current=String(input.currentPassword||''),next=String(input.newPassword||'');
  if(next.length<8) throw new Error('New password must be at least 8 characters.');
  const result=await database().query('select password_hash from users where id=$1 and is_active=true',[userId]);
  if(!result.rowCount || !(await passwordsMatch(current,result.rows[0].password_hash))) throw new Error('Current password is incorrect.');
  await database().query('update users set password_hash=$2,updated_at=now() where id=$1',[userId,await hashPassword(next)]);
  return {updated:true};
}

async function adminUpdateOrder(orderId,input) {
  await ensureAccountV41Schema();
  await ensureVariantSchema();
  const status=accountOrderStatus(input.status);
  const allowed=['pending','confirmed','packed','shipped','delivered','cancelled','return_requested','returned','refunded'];
  if(!allowed.includes(status)) throw new Error('Choose a valid order status.');
  const client=await database().connect();
  try{await client.query('begin');const order=await client.query('select id,user_id,order_number,status from orders where id=$1 for update',[orderId]);
    if(!order.rowCount)throw new Error('This order no longer exists.');
    if(['cancelled','returned','refunded'].includes(status))await restoreOrderInventory(client,orderId);
    await client.query('update orders set status=$2,delivered_at=case when $2=$3 then coalesce(delivered_at,now()) else delivered_at end where id=$1',[orderId,status,'delivered']);
    await client.query('insert into order_status_events(order_id,status,message) values($1,$2,$3)',[orderId,status,String(input.message||'Order status updated').slice(0,240)]);
    await client.query('insert into customer_notifications(user_id,order_id,notification_type,title,message) values($1,$2,$3,$4,$5)',
      [order.rows[0].user_id,orderId,status,`Order ${status.replace(/_/g,' ')}`,`Order MH${order.rows[0].order_number} is now ${status.replace(/_/g,' ')}.`]);
    if(input.awb||input.courierName||input.trackingUrl) await client.query(`update shipments set awb=coalesce($2,awb),courier_name=coalesce($3,courier_name),
      tracking_url=coalesce($4,tracking_url),tracking_status=$5,updated_at=now() where order_id=$1`,
      [orderId,input.awb||null,input.courierName||null,input.trackingUrl||null,status]);
    await client.query('commit');return {updated:true};
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}

async function listAdminReturns() {
  await ensureAccountV41Schema();
  const result=await database().query(`select rr.id,rr.request_type,rr.reason,rr.details,rr.status,rr.requested_at,rr.admin_note,
    o.order_number,u.full_name,u.email,oi.product_name,oi.quantity from return_requests rr join orders o on o.id=rr.order_id
    join users u on u.id=rr.user_id join order_items oi on oi.id=rr.order_item_id order by rr.requested_at desc limit 500`);
  return result.rows;
}
async function adminUpdateReturn(returnId,input) {
  await ensureAccountV41Schema();
  await ensureVariantSchema();
  const status=String(input.status||'').toLowerCase();
  if(!['requested','approved','rejected','pickup_booked','received','refunded'].includes(status))throw new Error('Choose a valid return status.');
  const client=await database().connect();try{await client.query('begin');const result=await client.query(`update return_requests set status=$2,admin_note=$3,updated_at=now() where id=$1
    returning user_id,order_id,order_item_id`,[returnId,status,String(input.note||'').slice(0,500)||null]);
    if(!result.rowCount)throw new Error('This return request no longer exists.');if(['received','refunded'].includes(status))await restoreOrderItemInventory(client,result.rows[0].order_item_id);
    await client.query(`insert into customer_notifications(user_id,order_id,notification_type,title,message)
      values($1,$2,'return','Return update',$3)`,[result.rows[0].user_id,result.rows[0].order_id,`Your return request is now ${status.replace(/_/g,' ')}.`]);await client.query('commit');return{updated:true};
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
}

async function guestOrderTracking(orderNumber, contactInput) {
  await ensureAccountV41Schema();
  const number=orderNumberValue(orderNumber),contact=String(contactInput||'').trim().toLowerCase(),phone=contact.replace(/\D/g,'');
  if(!contact || (phone.length!==10 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))) throw new Error('Enter the email or 10-digit phone used for this order.');
  const result=await database().query(`select o.order_number,o.status,o.created_at,s.awb,s.courier_name,s.tracking_status,
    s.estimated_delivery_date,s.tracking_url from orders o join users u on u.id=o.user_id
    left join addresses a on a.id=o.address_id left join shipments s on s.order_id=o.id
    where o.order_number=$1 and (lower(u.email)=$2 or u.phone=$3 or a.phone=$3) limit 1`,[number,contact,phone]);
  if(!result.rowCount) throw new Error('No order matched those details.');
  const row=result.rows[0];
  return {orderNumber:Number(row.order_number),status:row.status,createdAt:row.created_at,awb:row.awb||null,
    courierName:row.courier_name||null,trackingStatus:row.tracking_status||row.status,
    estimatedDeliveryDate:row.estimated_delivery_date,trackingUrl:row.tracking_url||null};
}

async function productImportSettings(){await ensureProductImportSchema();const result=await database().query('select * from product_import_settings where id=true');return result.rows[0]}
async function saveProductImportSettings(input,adminIdentity){await ensureProductImportSchema();const percent=Number(input.markupPercent||0),fixed=Number(input.fixedMarkupInr||0),minimum=Number(input.minimumProfitInr||0),rounding=Number(input.roundingRule||0),stock=Number(input.defaultStock||99),maxImages=Number(input.maxImages||12),maxBytes=Number(input.maxMediaBytes||5242880),domains=[...new Set((Array.isArray(input.allowedDomains)?input.allowedDomains:String(input.allowedDomains||'').split(/[\n,]/)).map(value=>String(value).trim().toLowerCase()).filter(value=>/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)))].slice(0,100);if([percent,fixed,minimum,maxImages,maxBytes].some(value=>!Number.isFinite(value)||value<0)||!Number.isInteger(stock)||stock<1||![0,9,49,99].includes(rounding)||maxImages<1||maxImages>20||maxBytes>15000000)throw new Error('Enter valid importer settings.');const result=await database().query(`update product_import_settings set markup_percent=$1,fixed_markup_inr=$2,minimum_profit_inr=$3,rounding_rule=$4,default_stock=$5,default_status='draft',auto_sku=$6,max_images=$7,max_media_bytes=$8,allowed_domains=$9,updated_at=now() where id=true returning *`,[percent,fixed,minimum,rounding,stock,input.autoSku!==false,maxImages,maxBytes,domains]);await auditProductImport(adminIdentity,'settings_updated',null,{domains:domains.length});return result.rows[0]}
async function auditProductImport(adminIdentity,action,targetId,details={}){await ensureProductImportSchema();await database().query('insert into product_import_audit(admin_identity,action,target_id,details) values($1,$2,$3,$4::jsonb)',[String(adminIdentity||'admin'),action,targetId||null,JSON.stringify(details)])}
const normalizedImportTitle=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().slice(0,180);
async function detectProductImportDuplicate(product,sourceHash){await ensureProductImportSchema();const sourceId=String(product.sourceProductId||product.asin||''),domain=String(product.sourceWebsite||'').toLowerCase();const pending=await database().query(`select id from product_import_items where status not in ('failed','skipped','published') and (source_url_hash=$1 or ($2<>'' and lower(coalesce(source_product_id,''))=lower($2) and lower(source_domain)=lower($3))) order by created_at desc limit 1`,[sourceHash,sourceId,domain]);if(pending.rowCount)return{id:null,reason:sourceId?'source_id_pending':'source_url_pending',importItemId:pending.rows[0].id};const result=await database().query(`select p.id,p.sku,p.name,case when m.product_id is not null and $4<>'' and lower(coalesce(m.source_product_id,''))=lower($4) then 'source_id' when m.product_id is not null then 'source_url' when $2<>'' and lower(p.sku)=lower($2) then 'sku' else 'title' end reason from products p left join product_source_mappings m on m.product_id=p.id and (m.source_url_hash=$1 or ($4<>'' and lower(m.source_domain)=lower($5) and lower(coalesce(m.source_product_id,''))=lower($4))) where m.product_id is not null or ($2<>'' and lower(p.sku)=lower($2)) or lower(regexp_replace(p.name,'[^a-zA-Z0-9]+',' ','g'))=$3 order by case when m.product_id is not null then 0 when $2<>'' and lower(p.sku)=lower($2) then 1 else 2 end limit 1`,[sourceHash,String(product.sku||''),normalizedImportTitle(product.title),sourceId,domain]);return result.rows[0]||null}
async function createProductImportItem(product,sourceHash,adminIdentity,jobId=null){await ensureProductImportSchema();const duplicate=await detectProductImportDuplicate(product,sourceHash),status=duplicate?'duplicate':'ready';const result=await database().query(`insert into product_import_items(job_id,source_url,source_url_hash,source_domain,source_product_id,source_sku,title,normalized_title,status,duplicate_reason,existing_product_id,product_data,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13) returning *`,[jobId,product.sourceUrl,sourceHash,product.sourceWebsite,product.sourceProductId||null,product.sku||null,product.title||null,normalizedImportTitle(product.title),status,duplicate?.reason||null,duplicate?.id||null,JSON.stringify(product),adminIdentity]);const item=result.rows[0];for(const [index,url] of (product.images||[]).entries())await database().query(`insert into product_import_media(import_item_id,source_url,is_main,sort_order,validation_status) values($1,$2,$3,$4,'url_validated')`,[item.id,url,index===0,index]);await database().query(`insert into product_import_history(import_item_id,source_domain,source_url,status,imported_by,details) values($1,$2,$3,$4,$5,$6::jsonb)`,[item.id,product.sourceWebsite,product.sourceUrl,status,adminIdentity,JSON.stringify({duplicate:duplicate||null})]);await auditProductImport(adminIdentity,'analyzed',item.id,{status});return serializeImportItem(item)}
function serializeImportItem(row){return{id:row.id,jobId:row.job_id,sourceUrl:row.source_url,sourceDomain:row.source_domain,status:row.status,duplicateReason:row.duplicate_reason,existingProductId:row.existing_product_id,data:row.product_data,error:row.error_message,createdAt:row.created_at,updatedAt:row.updated_at,publishedAt:row.published_at||null}}
async function createProductImportJob(type,total,adminIdentity){await ensureProductImportSchema();const result=await database().query('insert into product_import_jobs(job_type,status,total_items,created_by) values($1,$2,$3,$4) returning id',[type,'analyzing',total,adminIdentity]);return result.rows[0].id}
async function completeProductImportJob(jobId,ready,failed){await database().query(`update product_import_jobs set status=$2,ready_items=$3,failed_items=$4,completed_at=now() where id=$1`,[jobId,failed&&ready?'completed_with_errors':failed?'failed':'ready',ready,failed])}
async function failProductImportItem(url,sourceHash,domain,error,adminIdentity,jobId){await ensureProductImportSchema();const result=await database().query(`insert into product_import_items(job_id,source_url,source_url_hash,source_domain,status,error_message,product_data,created_by) values($1,$2,$3,$4,'failed',$5,'{}'::jsonb,$6) returning *`,[jobId,url,sourceHash,domain,String(error).slice(0,1000),adminIdentity]);await database().query(`insert into product_import_history(import_item_id,source_domain,source_url,status,imported_by,error_message) values($1,$2,$3,'failed',$4,$5)`,[result.rows[0].id,domain,url,adminIdentity,String(error).slice(0,1000)]);return serializeImportItem(result.rows[0])}
async function uniqueImportSku(category='GENERAL'){await ensureProductImportSchema();for(let attempt=0;attempt<10;attempt++){const seq=await database().query('insert into product_import_sku_sequence default values returning id'),prefix=String(category||'GENERAL').toUpperCase().replace(/[^A-Z0-9]+/g,'').slice(0,12)||'GENERAL',sku=`MH-${prefix}-${String(seq.rows[0].id).padStart(6,'0')}`;const exists=await database().query('select 1 from products where lower(sku)=lower($1)',[sku]);if(!exists.rowCount)return sku}throw new Error('A unique SKU could not be generated.')}
async function productImportItem(id){await ensureProductImportSchema();const result=await database().query('select * from product_import_items where id=$1',[id]);if(!result.rowCount)throw new Error('This import item is no longer available.');return serializeImportItem(result.rows[0])}
async function validateProductImportCategory(value){await ensureProductImportSchema();const category=String(value||'').trim();if(!category)throw new Error('Choose a MARKET HUB category before publishing.');const result=await database().query('select name from categories where lower(name)=lower($1) and is_active=true limit 1',[category]);if(!result.rowCount)throw new Error('Choose an existing active MARKET HUB category before publishing.');return result.rows[0].name}
async function saveProductImportItem(id,input,adminIdentity){
  await ensureProductImportSchema();
  if(String(input.action||'draft')==='publish')return publishProductImportItem(id,input,adminIdentity);
  const current=await productImportItem(id),data={...current.data,...input},settings=await productImportSettings();
  const duplicateAction=String(input.duplicateAction||data.duplicateAction||'');
  data.title=String(data.title||'').trim();
  data.category=String(data.category||'').trim();
  data.stock=Number.isInteger(Number(data.stock))&&Number(data.stock)>0?Number(data.stock):Number(settings.default_stock||99);
  data.price=Number(data.price||data.calculatedPrice)||0;
  data.selectedImages=Array.isArray(data.selectedImages)?data.selectedImages:[];
  if(!data.sku&&settings.auto_sku)data.sku=await uniqueImportSku(data.category||'GENERAL');
  if(!data.sku)throw new Error('Enter a SKU.');
  if(current.status==='duplicate'&&!['update','separate','skip'].includes(duplicateAction))throw new Error('Choose Update Existing, Create New, or Skip for this duplicate.');
  if(duplicateAction==='update'&&!current.existingProductId)throw new Error('This matches another pending import. Choose Create New or Skip.');
  if(duplicateAction==='skip'){
    await database().query("update product_import_items set status='skipped',updated_at=now() where id=$1",[id]);
    await auditProductImport(adminIdentity,'skipped',id);
    return{status:'skipped'};
  }
  if(duplicateAction==='separate'&&current.status==='duplicate')data.sku=await uniqueImportSku(data.category||'GENERAL');
  data.duplicateAction=duplicateAction;
  const result=await database().query("update product_import_items set product_data=$2::jsonb,status='draft',source_sku=$3,title=$4,updated_at=now() where id=$1 returning *",[id,JSON.stringify(data),data.sku,data.title||null]);
  await database().query(`insert into product_import_history(import_item_id,source_domain,source_url,status,imported_by) values($1,$2,$3,'draft',$4)`,[id,current.sourceDomain,current.sourceUrl,adminIdentity]);
  await auditProductImport(adminIdentity,'draft_saved',id,{stock:data.stock,sourceProductId:data.sourceProductId||data.asin||null});
  return serializeImportItem(result.rows[0]);
}
async function uniqueImportSkuWithClient(client,category='GENERAL'){for(let attempt=0;attempt<10;attempt++){const seq=await client.query('insert into product_import_sku_sequence default values returning id'),prefix=String(category||'GENERAL').toUpperCase().replace(/[^A-Z0-9]+/g,'').slice(0,12)||'GENERAL',sku=`MH-${prefix}-${String(seq.rows[0].id).padStart(6,'0')}`;const exists=await client.query('select 1 from products where lower(sku)=lower($1)',[sku]);if(!exists.rowCount)return sku}throw new Error('A unique SKU could not be generated.')}
async function uniqueImportSlugWithClient(client,title,sku,productId=null){const base=`${toSlug(title)||'product'}-${toSlug(sku)||'item'}`.slice(0,180);for(let attempt=0;attempt<20;attempt++){const slug=attempt?`${base}-${attempt+1}`:base,result=await client.query('select 1 from products where slug=$1 and ($2::uuid is null or id<>$2::uuid) limit 1',[slug,productId]);if(!result.rowCount)return slug}throw new Error('A unique product URL could not be generated.')}
function importProductSpecifications(data){const imported=data.specifications&&typeof data.specifications==='object'&&!Array.isArray(data.specifications)?data.specifications:{};return{...imported,brand:String(data.brand||''),variants:Array.isArray(data.variants)?data.variants:[],tags:Array.isArray(data.tags)?data.tags:[],short_description:String(data.shortDescription||''),discount_percent:Number(data.discount)||null,source:{url:String(data.sourceUrl||''),id:String(data.sourceProductId||data.asin||'')},...(data.video?{video_url:String(data.video)}:{})}}
async function serializedProductById(productId){const saved=await database().query(`${productFields} where p.id=$1${productGroup}`,[productId]);if(!saved.rowCount)throw new Error('The published product could not be loaded.');return serializeProduct(saved.rows[0])}
async function publishProductImportItem(id,input,adminIdentity){
  await ensureProductImportSchema();
  await ensureVariantSchema();
  const client=await database().connect();
  let productId,publishedAt,alreadyPublished=false;
  try{
    await client.query('begin');
    const locked=await client.query('select * from product_import_items where id=$1 for update',[id]);
    if(!locked.rowCount)throw new Error('This import draft is no longer available.');
    const row=locked.rows[0];
    if(row.status==='published'&&row.existing_product_id){productId=row.existing_product_id;publishedAt=row.published_at;alreadyPublished=true;await client.query('commit');}
    else{
      if(row.status!=='draft')throw new Error('Save this import as Draft before publishing.');
      const stored=row.product_data&&typeof row.product_data==='object'?row.product_data:{},data={...stored,...input};
      data.title=String(data.title||'').trim();data.category=String(data.category||'').trim();data.sku=String(data.sku||'').trim();
      data.stock=Number.isInteger(Number(data.stock))&&Number(data.stock)>=0?Number(data.stock):99;data.price=Number(data.price||data.calculatedPrice)||0;
      data.selectedImages=[...new Set((Array.isArray(data.selectedImages)?data.selectedImages:[]).map(value=>String(value).trim()).filter(value=>/^https:\/\//i.test(value)))].slice(0,12);
      const duplicateAction=String(input.duplicateAction||data.duplicateAction||'');data.duplicateAction=duplicateAction;
      if(!data.title||!data.category)throw new Error('Title and MARKET HUB category are required before publishing.');
      if(!data.selectedImages.length)throw new Error('Select at least one permitted HTTPS product image before publishing.');
      if(!Number.isFinite(data.price)||data.price<=0)throw new Error('Enter a selling price before publishing.');
      const category=await client.query('select id,name from categories where lower(name)=lower($1) and is_active=true limit 1',[data.category]);
      if(!category.rowCount)throw new Error('Choose an existing active MARKET HUB category before publishing.');
      data.category=category.rows[0].name;
      if(!data.sku)data.sku=await uniqueImportSkuWithClient(client,data.category);
      if(row.duplicate_reason&&!['update','separate'].includes(duplicateAction))throw new Error('Choose Update Existing or Create New for this duplicate before publishing.');
      if(duplicateAction==='update'&&!row.existing_product_id)throw new Error('The matching product is unavailable. Choose Create New.');
      if(duplicateAction==='separate'){const used=await client.query('select 1 from products where lower(sku)=lower($1) limit 1',[data.sku]);if(used.rowCount)data.sku=await uniqueImportSkuWithClient(client,data.category)}
      const mapping=await client.query('select product_id from product_source_mappings where source_domain=$1 and source_url_hash=$2 limit 1 for update',[row.source_domain,row.source_url_hash]);
      productId=duplicateAction==='update'?row.existing_product_id:(duplicateAction==='separate'?null:(mapping.rows[0]?.product_id||null));
      if(!productId){const skuOwner=await client.query('select id from products where lower(sku)=lower($1) limit 1',[data.sku]);if(skuOwner.rowCount)throw new Error('This SKU already belongs to another product. Choose a different SKU.')}
      const slug=await uniqueImportSlugWithClient(client,data.title,data.sku,productId),specifications=JSON.stringify(importProductSpecifications({...data,sourceUrl:row.source_url}));
      const mrp=Number(data.mrp),compareAt=Number.isFinite(mrp)&&mrp>=data.price?mrp:null,weightKg=Math.max(.001,Number(data.weightGrams||500)/1000);
      const variantModel=normalizeVariantModel(data,{name:data.title,sku:data.sku,price:data.price,mrp:compareAt,stock:data.stock,weightGrams:weightKg*1000});
      if(variantModel.provided){data.options=variantModel.options.map(option=>({name:option.name,values:option.values}));data.variants=variantModel.variants.map(variant=>({id:variant.id,sku:variant.sku,price:variant.price,mrp:variant.mrp,discount:variant.mrp&&variant.mrp>variant.price?Math.round((variant.mrp-variant.price)*100/variant.mrp):0,stock:variant.stock,weightGrams:variant.weightGrams,barcode:variant.barcode,image:variant.images[0]||'',images:variant.images,enabled:variant.enabled,isDefault:variant.isDefault,options:variant.options}))}
      if(productId){const updated=await client.query(`update products set category_id=$1,sku=$2,name=$3,slug=$4,description=$5,specifications=$6::jsonb,price_inr=$7,compare_at_price_inr=$8,stock_quantity=$9,weight_kg=$10,is_active=true,status='published',published_at=coalesce(published_at,now()),updated_at=now() where id=$11 returning id,published_at`,[category.rows[0].id,data.sku,data.title,slug,String(data.description||data.shortDescription||''),specifications,data.price,compareAt,data.stock,weightKg,productId]);if(!updated.rowCount)throw new Error('The matching product no longer exists.');publishedAt=updated.rows[0].published_at;await client.query('delete from product_images where product_id=$1',[productId])}
      else{const created=await client.query(`insert into products(category_id,sku,name,slug,description,specifications,price_inr,compare_at_price_inr,stock_quantity,weight_kg,is_active,status,published_at) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,true,'published',now()) returning id,published_at`,[category.rows[0].id,data.sku,data.title,slug,String(data.description||data.shortDescription||''),specifications,data.price,compareAt,data.stock,weightKg]);productId=created.rows[0].id;publishedAt=created.rows[0].published_at}
      for(const [sortOrder,url] of data.selectedImages.entries())await client.query('insert into product_images(product_id,url,alt_text,sort_order) values($1,$2,$3,$4)',[productId,url,data.title,sortOrder]);
      await syncProductVariants(client,productId,variantModel,{name:data.title,sku:data.sku,price:data.price,mrp:compareAt,stock:data.stock,weightGrams:weightKg*1000});
      await client.query('update product_import_media set is_selected=false,is_main=false where import_item_id=$1',[id]);
      for(const [sortOrder,url] of data.selectedImages.entries())await client.query('update product_import_media set is_selected=true,is_main=$3,sort_order=$4 where import_item_id=$1 and source_url=$2',[id,url,sortOrder===0,sortOrder]);
      const published=await client.query("update product_import_items set product_data=$2::jsonb,status='published',existing_product_id=$3,published_at=coalesce(published_at,now()),updated_at=now() where id=$1 returning published_at",[id,JSON.stringify(data),productId]);publishedAt=published.rows[0].published_at;
      await client.query(`insert into product_source_mappings(source_domain,source_product_id,source_url_hash,product_id) values($1,$2,$3,$4) on conflict(source_domain,source_url_hash) do update set source_product_id=excluded.source_product_id,product_id=excluded.product_id`,[row.source_domain,data.sourceProductId||data.asin||null,row.source_url_hash,productId]);
      await client.query(`insert into product_import_history(import_item_id,product_id,source_domain,source_url,status,imported_by,details) values($1,$2,$3,$4,'published',$5,$6::jsonb)`,[id,productId,row.source_domain,row.source_url,String(adminIdentity||'admin'),JSON.stringify({slug,images:data.selectedImages.length,searchIndexed:true,categoryIndexed:true})]);
      await client.query('insert into product_import_audit(admin_identity,action,target_id,details) values($1,$2,$3,$4::jsonb)',[String(adminIdentity||'admin'),'published',id,JSON.stringify({productId,slug,alreadyPublished:false})]);
      await client.query('commit');
    }
    const product=await serializedProductById(productId);
    return{status:'published',alreadyPublished,publishedAt,product,productUrl:`/product.html?sku=${encodeURIComponent(product.sku)}`};
  }catch(error){try{await client.query('rollback')}catch{}if(error.code==='23505')throw new Error('This product already exists. Review the duplicate choice and try again.');throw error}finally{client.release()}
}
async function deleteProductImportDraft(id,adminIdentity){await ensureProductImportSchema();const client=await database().connect();try{await client.query('begin');const result=await client.query('select status,source_url from product_import_items where id=$1 for update',[id]);if(!result.rowCount)throw new Error('This import draft is no longer available.');if(result.rows[0].status==='published')throw new Error('Published products cannot be deleted from Drafts.');await client.query('insert into product_import_audit(admin_identity,action,target_id,details) values($1,$2,$3,$4::jsonb)',[String(adminIdentity||'admin'),'draft_deleted',id,JSON.stringify({sourceUrl:result.rows[0].source_url})]);await client.query('delete from product_import_items where id=$1',[id]);await client.query('commit');return{deleted:true,id}}catch(error){try{await client.query('rollback')}catch{}throw error}finally{client.release()}}
async function listProductImports(status='',query='',page=1,limit=25){await ensureProductImportSchema();const values=[],where=[];if(status){values.push(status);where.push(`status=$${values.length}`)}if(query){values.push(`%${query}%`);where.push(`(title ilike $${values.length} or source_url ilike $${values.length})`)}values.push(Math.min(100,Math.max(1,Number(limit)||25)),(Math.max(1,Number(page)||1)-1)*Math.min(100,Math.max(1,Number(limit)||25)));const result=await database().query(`select *,count(*) over() total_count from product_import_items ${where.length?'where '+where.join(' and '):''} order by created_at desc limit $${values.length-1} offset $${values.length}`,values);return{items:result.rows.map(serializeImportItem),total:Number(result.rows[0]?.total_count||0),page:Number(page)||1}}
async function listProductImportHistory(status='',query='',page=1,limit=25){await ensureProductImportSchema();const values=[],where=[];if(status){values.push(status);where.push(`h.status=$${values.length}`)}if(query){values.push(`%${query}%`);where.push(`(i.title ilike $${values.length} or h.source_url ilike $${values.length})`)}values.push(Math.min(100,Math.max(1,Number(limit)||25)),(Math.max(1,Number(page)||1)-1)*Math.min(100,Math.max(1,Number(limit)||25)));const result=await database().query(`select h.*,i.title,count(*) over() total_count from product_import_history h left join product_import_items i on i.id=h.import_item_id ${where.length?'where '+where.join(' and '):''} order by h.created_at desc limit $${values.length-1} offset $${values.length}`,values);return{items:result.rows,total:Number(result.rows[0]?.total_count||0),page:Number(page)||1}}

// Imports the catalogue extracted from the owner's PDF. This is deliberately an
// admin-only server function: no browser can write product data directly.
async function importPdfCatalogue() {
  const cataloguePath = path.join(__dirname, 'assets', 'catalogue', 'products.json');
  if (!fs.existsSync(cataloguePath)) throw new Error('The PDF catalogue file is not available on this server.');
  const items = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
  if (!Array.isArray(items) || !items.length) throw new Error('The PDF catalogue is empty.');

  const client = await database().connect();
  try {
    await client.query('begin');
    // Some supplier prices include paise (for example ₹1.50), so retain the
    // exact PDF price instead of rounding it up.
    await client.query('alter table products alter column price_inr type numeric(10,2) using price_inr::numeric(10,2)');
    await client.query('alter table products alter column compare_at_price_inr type numeric(10,2) using compare_at_price_inr::numeric(10,2)');

    const categories = [...new Set(items.map(item => item.category))];
    for (const category of categories) {
      await client.query(
        'insert into categories (name, slug) values ($1, $2) on conflict (slug) do update set name = excluded.name, is_active = true',
        [category, toSlug(category)]
      );
    }
    const categoryRows = await client.query('select id, slug from categories where slug = any($1::text[])', [categories.map(toSlug)]);
    const categoryIds = new Map(categoryRows.rows.map(row => [row.slug, row.id]));

    const imported = [];
    for (let start = 0; start < items.length; start += 100) {
      const batch = items.slice(start, start + 100);
      const values = [];
      const params = [];
      batch.forEach((item, index) => {
        const at = index * 9;
        values.push(`($${at + 1}::uuid, $${at + 2}::text, $${at + 3}::text, $${at + 4}::text, $${at + 5}::text, $${at + 6}::jsonb, $${at + 7}::numeric, $${at + 8}::integer, $${at + 9}::numeric, 10, 10, 10, true)`);
        params.push(
          categoryIds.get(toSlug(item.category)) || null,
          item.sku,
          item.name,
          `${toSlug(item.name)}-${toSlug(item.sku)}`,
          `Imported from supplier PDF. Source code: ${item.source_code}.`,
          JSON.stringify({ source_code: item.source_code, source_page: item.source_page, weight_grams: item.weight_grams }),
          item.price_inr,
          item.stock_quantity,
          Number(item.weight_grams) / 1000
        );
      });
      const result = await client.query(
        `insert into products (category_id, sku, name, slug, description, specifications, price_inr, stock_quantity, weight_kg, length_cm, breadth_cm, height_cm, is_active)
         values ${values.join(',')}
         on conflict (sku) do update set category_id = excluded.category_id, name = excluded.name, slug = excluded.slug, description = excluded.description, specifications = excluded.specifications, price_inr = excluded.price_inr, stock_quantity = excluded.stock_quantity, weight_kg = excluded.weight_kg, is_active = true, updated_at = now()
         returning id, sku`,
        params
      );
      imported.push(...result.rows);
    }

    const productIds = imported.map(row => row.id);
    await client.query('delete from product_images where product_id = any($1::uuid[])', [productIds]);
    for (let start = 0; start < items.length; start += 200) {
      const batch = items.slice(start, start + 200);
      const values = [];
      const params = [];
      batch.forEach((item, index) => {
        // Each photo row has three parameters. Keeping the placeholder
        // numbering consecutive is required by PostgreSQL for batches.
        const at = index * 3;
        const product = imported.find(row => row.sku === item.sku);
        values.push(`($${at + 1}, $${at + 2}, $${at + 3}, 0)`);
        params.push(product.id, item.image_url, item.name);
      });
      await client.query(`insert into product_images (product_id, url, alt_text, sort_order) values ${values.join(',')}`, params);
    }
    await client.query('commit');
    return { products: items.length, categories: categories.length };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { database, databaseHealth, listActiveProducts, listAdminProducts,productById,productBySku,checkoutCartItems,shiprocketOrderItems,ensureVariantSchema,normalizeVariantModel,syncProductVariants, listAdminOrders, listAdminRefunds, saveProduct, deactivateProduct, importPdfCatalogue, recordShiprocketOrder, reserveShiprocketShipment, completeShiprocketShipment, releaseShiprocketShipment, delhiveryOrder, listDelhiveryShipments, reserveDelhiveryShipment, completeDelhiveryShipment, failDelhiveryShipment, updateDelhiveryTracking, refundOrderToWallet, registerCustomer, authenticateCustomer, customerAccount, updateCustomerProfile, customerAddresses, saveCustomerAddress, deleteCustomerAddress, customerOrders, customerReturnItems, requestCustomerReturn, customerReviewItems, submitCustomerReview, listAdminReviews, approveReview, deleteReview, publicReviewsBySku, reviewSummary, voteReviewHelpful, customerWishlist, saveCustomerWishlist, savePackingVideo, loyaltyRules, loyaltyQuote, setLoyaltyRules, coinSummary, adminCoinAdjustment, listAdminLoyalty, recordShiprocketEvent, ensureCustomerExperienceSchema, ensureEngagementSchema, ensureAccountV41Schema, customerDashboard, customerOrdersV41, customerOrderDetails, cancelCustomerOrder, buyAgainItems, customerNotifications, markCustomerNotifications, customerCoupons, changeCustomerPassword, adminUpdateOrder, listAdminReturns, adminUpdateReturn, guestOrderTracking, ensureProductImportSchema, productImportSettings, saveProductImportSettings, auditProductImport, detectProductImportDuplicate, createProductImportItem, createProductImportJob, completeProductImportJob, failProductImportItem, uniqueImportSku, productImportItem, validateProductImportCategory, saveProductImportItem, publishProductImportItem, deleteProductImportDraft, listProductImports, listProductImportHistory };

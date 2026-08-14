const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'database','v43-product-variants.sql'),'utf8');
const freshSchemas=[
  fs.readFileSync(path.join(root,'schema.sql'),'utf8'),
  fs.readFileSync(path.join(root,'database','schema.sql'),'utf8')
];
const normalizedTables=['product_options','product_option_values','product_variants','product_variant_values','product_variant_images'];
const variantColumns=['product_variant_id','variant_sku','selected_options','variant_image_url','inventory_restored_at'];

for(const table of normalizedTables){
  assert.match(migration,new RegExp(`create table if not exists ${table}\\s*\\(`,'i'),`${table} is missing from the v43 migration`);
  for(const schema of freshSchemas)assert.match(schema,new RegExp(`create table ${table}\\s*\\(`,'i'),`${table} is missing from a fresh schema`);
}

for(const sql of [migration,...freshSchemas]){
  assert.match(sql,/checkout_product_id bigint[^;\n]*default nextval\('market_hub_checkout_id_seq'\)/i);
  assert.match(sql,/checkout_variant_id bigint[^;\n]*default nextval\('market_hub_checkout_id_seq'\)/i);
  assert.match(sql,/products_checkout_product_id_unique/i);
  assert.match(sql,/product_variants_one_default/i);
  assert.match(sql,/product_options_product_name_unique/i);
  assert.match(sql,/product_option_values_option_value_unique/i);
  assert.match(sql,/archived_at timestamptz/i,'removed variants must remain addressable for exact stock restoration');
  for(const column of variantColumns)assert.match(sql,new RegExp(`\\b${column}\\b`,'i'));
  assert.match(sql,/inventory_reserved_at timestamptz/i);
}

for(const schema of freshSchemas){
  const users=schema.match(/create table users\s*\(([\s\S]*?)\n\);/i)?.[1]||'';
  const products=schema.match(/create table products\s*\(([\s\S]*?)\n\);/i)?.[1]||'';
  assert.doesNotMatch(users,/\bstatus\b|\bpublished_at\b/,'publication fields must not be stored on users');
  assert.match(products,/status text not null default 'published'/i);
  assert.match(products,/published_at timestamptz/i);
  assert.match(products,/checkout_product_id bigint not null/i);
}

assert.match(migration,/alter table if exists users drop column if exists status/i);
assert.match(migration,/alter table if exists users drop column if exists published_at/i);
assert.match(migration,/update products set checkout_product_id=nextval\('market_hub_checkout_id_seq'\) where checkout_product_id is null/i);
assert.match(migration,/alter table products alter column checkout_product_id set not null/i);
assert.match(migration,/selected_options jsonb not null default '\{\}'::jsonb/i);

const dbSource=fs.readFileSync(path.join(root,'db.js'),'utf8');
assert.match(dbSource,/update product_variants set archived_at=coalesce\(archived_at,now\(\)\),is_enabled=false,is_default=false/i);
assert.doesNotMatch(dbSource,/delete from product_variants where product_id=\$1 and not\(id=any/i,'removed variants must be archived, not detached from historical orders');
assert.match(dbSource,/archived_at is null and stock_quantity>=\$2 returning id/i);

console.log('product variant schema contract tests passed');

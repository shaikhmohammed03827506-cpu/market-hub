-- MARKET HUB v43 normalized product variants and inventory snapshots.
-- This migration is safe to run more than once and preserves legacy products.
begin;

create extension if not exists pgcrypto;
create sequence if not exists market_hub_checkout_id_seq as bigint start with 1000000000;

alter table products add column if not exists status text not null default 'published';
alter table products add column if not exists published_at timestamptz;
alter table products add column if not exists checkout_product_id bigint default nextval('market_hub_checkout_id_seq');
update products set status='published' where status is null;
update products set checkout_product_id=nextval('market_hub_checkout_id_seq') where checkout_product_id is null;
alter table products alter column status set default 'published';
alter table products alter column status set not null;
alter table products alter column checkout_product_id set default nextval('market_hub_checkout_id_seq');
alter table products alter column checkout_product_id set not null;
create unique index if not exists products_checkout_product_id_unique on products(checkout_product_id);
create index if not exists products_publication_idx on products(status,is_active,published_at desc);

-- These columns were briefly emitted on users by a fresh-schema typo.
alter table if exists users drop column if exists status;
alter table if exists users drop column if exists published_at;

create table if not exists product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_options_product_name_unique on product_options(product_id,lower(name));
create index if not exists product_options_product_position on product_options(product_id,position,id);

create table if not exists product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references product_options(id) on delete cascade,
  value text not null check (btrim(value) <> ''),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists product_option_values_option_value_unique on product_option_values(option_id,lower(value));
create index if not exists product_option_values_option_position on product_option_values(option_id,position,id);
create index if not exists product_option_values_search_idx on product_option_values using gin(to_tsvector('simple',value));

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text not null unique check (btrim(sku) <> ''),
  price_inr numeric(10,2) not null check (price_inr > 0),
  compare_at_price_inr numeric(10,2),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  weight_kg numeric(8,3) not null default 0.5 check (weight_kg > 0),
  barcode text,
  is_enabled boolean not null default true,
  is_default boolean not null default false,
  position integer not null default 0 check (position >= 0),
  checkout_variant_id bigint not null default nextval('market_hub_checkout_id_seq'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (compare_at_price_inr is null or compare_at_price_inr >= price_inr)
);
alter table product_variants add column if not exists archived_at timestamptz;
create unique index if not exists product_variants_checkout_id_unique on product_variants(checkout_variant_id);
create unique index if not exists product_variants_one_default on product_variants(product_id) where is_default;
create index if not exists product_variants_product_enabled on product_variants(product_id,is_enabled,position);
create index if not exists product_variants_search_idx on product_variants using gin(to_tsvector('simple',coalesce(sku,'')||' '||coalesce(barcode,'')));

create table if not exists product_variant_values (
  variant_id uuid not null references product_variants(id) on delete cascade,
  option_value_id uuid not null references product_option_values(id) on delete cascade,
  primary key (variant_id,option_value_id)
);
create index if not exists product_variant_values_option_value on product_variant_values(option_value_id,variant_id);

create table if not exists product_variant_images (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id) on delete cascade,
  url text not null check (btrim(url) <> ''),
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create index if not exists product_variant_images_variant_sort on product_variant_images(variant_id,sort_order,id);

alter table if exists order_items add column if not exists product_variant_id uuid references product_variants(id) on delete set null;
alter table if exists order_items add column if not exists variant_sku text;
alter table if exists order_items add column if not exists selected_options jsonb not null default '{}'::jsonb;
alter table if exists order_items add column if not exists variant_image_url text;
alter table if exists order_items add column if not exists inventory_restored_at timestamptz;
create index if not exists order_items_product_variant on order_items(product_variant_id) where product_variant_id is not null;

alter table if exists orders add column if not exists inventory_reserved_at timestamptz;
alter table if exists orders add column if not exists inventory_restored_at timestamptz;

commit;

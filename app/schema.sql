-- MARKET HUB production database (PostgreSQL 15+)
-- Apply this file to a new PostgreSQL database before connecting the server.
create extension if not exists pgcrypto;
create sequence market_hub_checkout_id_seq as bigint start with 1000000000;

create type user_role as enum ('customer','staff','admin');
create type order_status as enum ('pending','confirmed','packed','shipped','delivered','cancelled','return_requested','returned','refunded');
create type payment_status as enum ('pending','paid','failed','refunded','cod_pending','cod_collected');
create type wallet_transaction_type as enum ('refund','credit','debit','expiry','adjustment');
create type coin_transaction_type as enum ('purchase_reward','referral_reward','redeem','expiry','adjustment');
create type return_status as enum ('requested','approved','rejected','pickup_booked','received','refunded');

create table users (
  id uuid primary key default gen_random_uuid(),
  role user_role not null default 'customer',
  full_name text not null,
  email text unique,
  phone text unique,
  password_hash text,
  referral_code text not null unique,
  referred_by uuid references users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label text not null default 'Home',
  full_name text not null,
  phone text not null,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  pincode varchar(6) not null check (pincode ~ '^[0-9]{6}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_default_address_per_user on addresses(user_id) where is_default;

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id),
  name text not null,
  slug text not null unique,
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id),
  sku text not null unique,
  name text not null,
  slug text not null unique,
  description text,
  specifications jsonb not null default '{}'::jsonb,
  price_inr numeric(10,2) not null check (price_inr > 0),
  compare_at_price_inr numeric(10,2) check (compare_at_price_inr >= price_inr),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  weight_kg numeric(8,3) not null default 0.5 check (weight_kg > 0),
  length_cm numeric(8,2) not null default 10 check (length_cm > 0),
  breadth_cm numeric(8,2) not null default 10 check (breadth_cm > 0),
  height_cm numeric(8,2) not null default 10 check (height_cm > 0),
  is_active boolean not null default true,
  status text not null default 'published',
  published_at timestamptz,
  checkout_product_id bigint not null default nextval('market_hub_checkout_id_seq'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_checkout_product_id_unique on products(checkout_product_id);
create index products_publication_idx on products(status,is_active,published_at desc);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  alt_text text,
  sort_order integer not null default 0
);

create table product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_options_product_name_unique on product_options(product_id,lower(name));
create index product_options_product_position on product_options(product_id,position,id);

create table product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references product_options(id) on delete cascade,
  value text not null check (btrim(value) <> ''),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);
create unique index product_option_values_option_value_unique on product_option_values(option_id,lower(value));
create index product_option_values_option_position on product_option_values(option_id,position,id);
create index product_option_values_search_idx on product_option_values using gin(to_tsvector('simple',value));

create table product_variants (
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
create unique index product_variants_checkout_id_unique on product_variants(checkout_variant_id);
create unique index product_variants_one_default on product_variants(product_id) where is_default;
create index product_variants_product_enabled on product_variants(product_id,is_enabled,position);
create index product_variants_search_idx on product_variants using gin(to_tsvector('simple',coalesce(sku,'')||' '||coalesce(barcode,'')));

create table product_variant_values (
  variant_id uuid not null references product_variants(id) on delete cascade,
  option_value_id uuid not null references product_option_values(id) on delete cascade,
  primary key (variant_id,option_value_id)
);
create index product_variant_values_option_value on product_variant_values(option_value_id,variant_id);

create table product_variant_images (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id) on delete cascade,
  url text not null check (btrim(url) <> ''),
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create index product_variant_images_variant_sort on product_variant_images(variant_id,sort_order,id);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value integer not null check (discount_value > 0),
  minimum_order_inr integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  is_active boolean not null default true
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  user_id uuid not null references users(id),
  address_id uuid references addresses(id),
  status order_status not null default 'pending',
  payment_status payment_status not null default 'pending',
  payment_method text not null check (payment_method in ('shiprocket','cod','wallet','razorpay')),
  subtotal_inr numeric(10,2) not null check (subtotal_inr >= 0),
  discount_inr numeric(10,2) not null default 0 check (discount_inr >= 0),
  wallet_used_inr numeric(10,2) not null default 0 check (wallet_used_inr >= 0),
  coins_used integer not null default 0 check (coins_used >= 0),
  shipping_inr numeric(10,2) not null default 0 check (shipping_inr >= 0),
  total_inr numeric(10,2) not null check (total_inr >= 0),
  coupon_id uuid references coupons(id),
  shiprocket_order_id text,
  packing_video_url text,
  packing_video_note text,
  packing_video_uploaded_at timestamptz,
  inventory_reserved_at timestamptz,
  inventory_restored_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index orders_user_created on orders(user_id, created_at desc);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  product_variant_id uuid references product_variants(id) on delete set null,
  product_name text not null,
  sku text not null,
  variant_sku text,
  selected_options jsonb not null default '{}'::jsonb,
  variant_image_url text,
  unit_price_inr numeric(10,2) not null check (unit_price_inr >= 0),
  quantity integer not null check (quantity > 0),
  coin_reward integer not null default 0 check (coin_reward >= 0),
  inventory_restored_at timestamptz
);
create index order_items_product_variant on order_items(product_variant_id) where product_variant_id is not null;

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  order_id uuid references orders(id),
  transaction_type wallet_transaction_type not null,
  amount_inr integer not null check (amount_inr > 0),
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  check ((transaction_type in ('refund','credit') and expires_at is not null) or transaction_type not in ('refund','credit'))
);
create index wallet_user_expiry on wallet_transactions(user_id, expires_at);

create table coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  order_id uuid references orders(id),
  transaction_type coin_transaction_type not null,
  coins integer not null check (coins > 0),
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index coins_user_expiry on coin_transactions(user_id, expires_at);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references users(id),
  referee_id uuid not null unique references users(id),
  referrer_coins integer not null default 10,
  referee_coins integer not null default 10,
  reward_order_id uuid references orders(id),
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_id <> referee_id)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  product_id uuid not null references products(id),
  order_item_id uuid not null references order_items(id),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 5 and 1500),
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, order_item_id)
);
create table review_images (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  url text not null
);

create table return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  user_id uuid not null references users(id),
  order_item_id uuid not null references order_items(id),
  reason text not null,
  details text,
  status return_status not null default 'requested',
  requested_at timestamptz not null default now(),
  pickup_awb text,
  refund_transaction_id uuid references wallet_transactions(id)
);

-- Requests must be created no later than 3 calendar days after delivery.
create or replace function enforce_return_window() returns trigger language plpgsql as $$
declare delivered_time timestamptz;
begin
  select delivered_at into delivered_time from orders where id = new.order_id;
  if delivered_time is null or new.requested_at > delivered_time + interval '3 days' then
    raise exception 'Returns can only be requested within 3 days of delivery';
  end if;
  return new;
end $$;
create trigger return_window before insert on return_requests for each row execute function enforce_return_window();

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  provider text not null default 'delhivery',
  pickup_location text not null,
  awb text unique,
  label_url text,
  tracking_status text,
  estimated_delivery_date date,
  shipped_at timestamptz,
  delivered_at timestamptz,
  raw_tracking jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- v41 customer account and order management
alter table users add column if not exists profile_image_url text;
alter table users add column if not exists account_settings jsonb not null default '{}'::jsonb;
alter table orders add column if not exists billing_address jsonb;
alter table orders add column if not exists gst_inr integer not null default 0;
alter table orders add column if not exists invoice_number text;
alter table orders add column if not exists cancelled_at timestamptz;
alter table shipments add column if not exists courier_name text;
alter table shipments add column if not exists tracking_url text;
alter table shipments add column if not exists creation_error text;
alter table return_requests add column if not exists request_type text not null default 'return';
alter table return_requests add column if not exists admin_note text;
alter table return_requests add column if not exists updated_at timestamptz not null default now();
create table if not exists customer_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade, notification_type text not null default 'account',
  title text not null, message text not null, is_read boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists customer_notifications_user_created on customer_notifications(user_id,created_at desc);
create table if not exists order_status_events (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  status text not null, message text, created_at timestamptz not null default now()
);
create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(), coupon_id uuid not null references coupons(id), user_id uuid not null references users(id),
  order_id uuid references orders(id), used_at timestamptz not null default now(), unique(coupon_id,order_id)
);

-- 10 coins per ₹100 spent. Coins are awarded only when an order is delivered.
create or replace function award_purchase_coins() returns trigger language plpgsql as $$
declare reward integer;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    reward := floor(new.total_inr / 100) * 10;
    if reward > 0 then
      insert into coin_transactions(user_id,order_id,transaction_type,coins,note)
      values(new.user_id,new.id,'purchase_reward',reward,'10 coins for every ₹100 spent');
    end if;
  end if;
  return new;
end $$;
create trigger order_delivery_coin_reward after update of status on orders for each row execute function award_purchase_coins();

-- Wallet refunds are valid for exactly 12 months from the credit date.
create or replace function set_wallet_refund_expiry() returns trigger language plpgsql as $$
begin
  if new.transaction_type = 'refund' and new.expires_at is null then new.expires_at := new.created_at + interval '12 months'; end if;
  return new;
end $$;
create trigger wallet_refund_expiry before insert on wallet_transactions for each row execute function set_wallet_refund_expiry();

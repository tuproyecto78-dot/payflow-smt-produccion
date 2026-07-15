-- PayFlow SMT — optional multi-tenant catalog and orders module.
-- The catalog works independently from WhatsApp. WhatsApp is only an optional
-- notification channel configured per business.

create extension if not exists "uuid-ossp";

create table if not exists public.catalogs (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null unique,
  business_name text not null,
  slug text not null unique,
  description text,
  currency text not null default 'USD',
  status text not null default 'draft',
  accent_color text not null default '#2563eb',
  whatsapp_notifications_enabled boolean not null default false,
  whatsapp_template_name text,
  whatsapp_template_language text not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogs_status_check check (status in ('draft', 'published')),
  constraint catalogs_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint catalogs_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint catalogs_whatsapp_template_check check (
    whatsapp_notifications_enabled = false
    or (whatsapp_template_name is not null and whatsapp_template_name ~ '^[a-z0-9_]+$')
  ),
  constraint catalogs_whatsapp_language_check check (whatsapp_template_language ~ '^[a-z]{2,3}(_[A-Z]{2})?$')
);
create index if not exists idx_catalogs_status on public.catalogs(status);
drop trigger if exists touch_catalogs on public.catalogs;
create trigger touch_catalogs before update on public.catalogs
  for each row execute function public.touch_updated_at();

create table if not exists public.catalog_categories (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_id, slug)
);
create index if not exists idx_catalog_categories_client on public.catalog_categories(client_id, sort_order);
drop trigger if exists touch_catalog_categories on public.catalog_categories;
create trigger touch_catalog_categories before update on public.catalog_categories
  for each row execute function public.touch_updated_at();

create table if not exists public.catalog_products (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  category_id uuid references public.catalog_categories(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  sku text,
  price numeric(12, 2) not null,
  compare_at_price numeric(12, 2),
  currency text not null default 'USD',
  stock integer not null default 0,
  track_inventory boolean not null default true,
  active boolean not null default true,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_products_price_check check (price >= 0),
  constraint catalog_products_compare_price_check check (compare_at_price is null or compare_at_price >= price),
  constraint catalog_products_stock_check check (stock >= 0),
  constraint catalog_products_currency_check check (currency ~ '^[A-Z]{3}$'),
  unique (catalog_id, slug)
);
create index if not exists idx_catalog_products_client_active on public.catalog_products(client_id, active, updated_at desc);
create index if not exists idx_catalog_products_catalog_category on public.catalog_products(catalog_id, category_id);
create unique index if not exists idx_catalog_products_client_sku
  on public.catalog_products(client_id, lower(sku)) where sku is not null and sku <> '';
drop trigger if exists touch_catalog_products on public.catalog_products;
create trigger touch_catalog_products before update on public.catalog_products
  for each row execute function public.touch_updated_at();

create table if not exists public.catalog_orders (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  catalog_id uuid not null references public.catalogs(id) on delete restrict,
  order_number text not null unique,
  status text not null default 'new',
  payment_status text not null default 'unpaid',
  channel text not null default 'web',
  source_key text unique,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  notes text,
  subtotal numeric(12, 2) not null,
  total numeric(12, 2) not null,
  currency text not null default 'USD',
  payment_transaction_id text,
  whatsapp_notification_status text not null default 'not_requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_orders_status_check check (status in ('new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  constraint catalog_orders_payment_check check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  constraint catalog_orders_channel_check check (channel in ('web', 'whatsapp', 'api', 'manual')),
  constraint catalog_orders_notification_check check (whatsapp_notification_status in ('not_requested', 'pending', 'sent', 'failed', 'disabled')),
  constraint catalog_orders_amount_check check (subtotal >= 0 and total >= 0)
);
create index if not exists idx_catalog_orders_client_created on public.catalog_orders(client_id, created_at desc);
create index if not exists idx_catalog_orders_client_status on public.catalog_orders(client_id, status, created_at desc);
drop trigger if exists touch_catalog_orders on public.catalog_orders;
create trigger touch_catalog_orders before update on public.catalog_orders
  for each row execute function public.touch_updated_at();

create table if not exists public.catalog_order_items (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  order_id uuid not null references public.catalog_orders(id) on delete cascade,
  product_id uuid references public.catalog_products(id) on delete set null,
  product_name text not null,
  sku text,
  quantity integer not null,
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  constraint catalog_order_items_quantity_check check (quantity > 0 and quantity <= 99),
  constraint catalog_order_items_amount_check check (unit_price >= 0 and line_total >= 0)
);
create index if not exists idx_catalog_order_items_order on public.catalog_order_items(order_id);
create index if not exists idx_catalog_order_items_client on public.catalog_order_items(client_id, created_at desc);

-- Transactional outbox consumed by the workflow runner. Storing the event is
-- part of the same transaction as the order, so a notification can be retried.
create table if not exists public.catalog_events (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  event_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'pending',
  attempts integer not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint catalog_events_type_check check (event_type in ('order.created', 'order.status_changed', 'order.paid', 'stock.low')),
  constraint catalog_events_status_check check (processing_status in ('pending', 'processing', 'processed', 'failed'))
);
create index if not exists idx_catalog_events_pending on public.catalog_events(processing_status, created_at);
create index if not exists idx_catalog_events_client on public.catalog_events(client_id, created_at desc);

-- Atomic public order creation. Product prices are always resolved in the DB;
-- amounts submitted by the browser are deliberately ignored.
create or replace function public.create_catalog_order(
  p_catalog_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_notes text,
  p_channel text,
  p_source_key text,
  p_items jsonb
)
returns table(order_id uuid, order_number text, total numeric, currency text, was_existing boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  catalog_row public.catalogs%rowtype;
  product_row public.catalog_products%rowtype;
  item jsonb;
  requested_quantity integer;
  calculated_total numeric(12, 2) := 0;
  created_order_id uuid;
  created_order_number text;
  existing_order public.catalog_orders%rowtype;
begin
  if nullif(trim(p_customer_name), '') is null then
    raise exception 'CUSTOMER_NAME_REQUIRED';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_ORDER_ITEMS';
  end if;

  select * into catalog_row
  from public.catalogs
  where slug = p_catalog_slug and status = 'published';
  if not found then raise exception 'CATALOG_NOT_FOUND'; end if;

  if nullif(trim(coalesce(p_source_key, '')), '') is not null then
    select * into existing_order
    from public.catalog_orders
    where source_key = left(trim(p_source_key), 100)
      and catalog_id = catalog_row.id;
    if found then
      return query select existing_order.id, existing_order.order_number, existing_order.total, existing_order.currency, true;
      return;
    end if;
  end if;

  -- Lock every requested product before calculating or decrementing inventory.
  for item in select value from jsonb_array_elements(p_items)
  loop
    requested_quantity := coalesce((item->>'quantity')::integer, 0);
    if requested_quantity < 1 or requested_quantity > 99 then
      raise exception 'INVALID_QUANTITY';
    end if;

    select * into product_row
    from public.catalog_products
    where id = (item->>'product_id')::uuid
      and catalog_id = catalog_row.id
      and client_id = catalog_row.client_id
      and active = true
    for update;

    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if product_row.track_inventory and product_row.stock < requested_quantity then
      raise exception 'INSUFFICIENT_STOCK:%', product_row.name;
    end if;
    calculated_total := calculated_total + (product_row.price * requested_quantity);
  end loop;

  created_order_number := 'PF-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 8));
  insert into public.catalog_orders (
    client_id, catalog_id, order_number, channel, source_key, customer_name,
    customer_phone, customer_email, notes, subtotal, total, currency,
    whatsapp_notification_status
  ) values (
    catalog_row.client_id,
    catalog_row.id,
    created_order_number,
    case when p_channel in ('web', 'whatsapp', 'api', 'manual') then p_channel else 'web' end,
    nullif(left(trim(coalesce(p_source_key, '')), 100), ''),
    left(trim(p_customer_name), 160),
    nullif(left(trim(coalesce(p_customer_phone, '')), 40), ''),
    nullif(left(lower(trim(coalesce(p_customer_email, ''))), 254), ''),
    nullif(left(trim(coalesce(p_notes, '')), 1000), ''),
    calculated_total,
    calculated_total,
    catalog_row.currency,
    case when catalog_row.whatsapp_notifications_enabled and nullif(trim(coalesce(p_customer_phone, '')), '') is not null
      then 'pending' else 'disabled' end
  ) returning id into created_order_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    requested_quantity := (item->>'quantity')::integer;
    select * into product_row
    from public.catalog_products
    where id = (item->>'product_id')::uuid and catalog_id = catalog_row.id;

    insert into public.catalog_order_items (
      client_id, order_id, product_id, product_name, sku,
      quantity, unit_price, line_total
    ) values (
      catalog_row.client_id, created_order_id, product_row.id,
      product_row.name, product_row.sku, requested_quantity,
      product_row.price, product_row.price * requested_quantity
    );

    if product_row.track_inventory then
      update public.catalog_products
      set stock = stock - requested_quantity
      where id = product_row.id;

      if product_row.stock - requested_quantity <= 3 then
        insert into public.catalog_events (client_id, event_type, entity_id, payload)
        values (
          catalog_row.client_id,
          'stock.low',
          product_row.id,
          jsonb_build_object('product_id', product_row.id, 'product_name', product_row.name, 'stock', product_row.stock - requested_quantity)
        );
      end if;
    end if;
  end loop;

  insert into public.catalog_events (client_id, event_type, entity_id, payload)
  values (
    catalog_row.client_id,
    'order.created',
    created_order_id,
    jsonb_build_object('order_id', created_order_id, 'order_number', created_order_number, 'total', calculated_total, 'currency', catalog_row.currency)
  );

  return query select created_order_id, created_order_number, calculated_total, catalog_row.currency, false;
end;
$$;
revoke all on function public.create_catalog_order(text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_catalog_order(text, text, text, text, text, text, text, jsonb) to service_role;

-- Operational status changes are also transactional. Cancelling an order
-- restores inventory exactly once and a cancelled order cannot be reopened.
create or replace function public.update_catalog_order_status(
  p_client_id text,
  p_order_id uuid,
  p_status text,
  p_payment_status text
)
returns public.catalog_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.catalog_orders%rowtype;
  updated_row public.catalog_orders%rowtype;
  item_row public.catalog_order_items%rowtype;
begin
  select * into order_row
  from public.catalog_orders
  where id = p_order_id and client_id = p_client_id
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if order_row.status = 'cancelled' and coalesce(p_status, order_row.status) <> 'cancelled' then
    raise exception 'CANCELLED_ORDER_IS_FINAL';
  end if;
  if p_status is not null and p_status not in ('new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled') then
    raise exception 'INVALID_ORDER_STATUS';
  end if;
  if p_payment_status is not null and p_payment_status not in ('unpaid', 'pending', 'paid', 'failed', 'refunded') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;

  if p_status = 'cancelled' and order_row.status <> 'cancelled' then
    for item_row in
      select * from public.catalog_order_items where order_id = order_row.id
    loop
      update public.catalog_products
      set stock = stock + item_row.quantity
      where id = item_row.product_id and track_inventory = true;
    end loop;
  end if;

  update public.catalog_orders
  set status = coalesce(p_status, status),
      payment_status = coalesce(p_payment_status, payment_status)
  where id = order_row.id
  returning * into updated_row;

  if updated_row.status <> order_row.status then
    insert into public.catalog_events (client_id, event_type, entity_id, payload)
    values (
      order_row.client_id,
      'order.status_changed',
      order_row.id,
      jsonb_build_object('order_id', order_row.id, 'order_number', order_row.order_number, 'from', order_row.status, 'to', updated_row.status)
    );
  end if;
  if updated_row.payment_status = 'paid' and order_row.payment_status <> 'paid' then
    insert into public.catalog_events (client_id, event_type, entity_id, payload)
    values (
      order_row.client_id,
      'order.paid',
      order_row.id,
      jsonb_build_object('order_id', order_row.id, 'order_number', order_row.order_number, 'total', order_row.total, 'currency', order_row.currency)
    );
  end if;

  return updated_row;
end;
$$;
revoke all on function public.update_catalog_order_status(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_catalog_order_status(text, uuid, text, text) to service_role;

alter table public.catalogs enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_orders enable row level security;
alter table public.catalog_order_items enable row level security;
alter table public.catalog_events enable row level security;

create policy "catalogs_tenant_select" on public.catalogs
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "catalog_categories_tenant_select" on public.catalog_categories
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "catalog_products_tenant_select" on public.catalog_products
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "catalog_orders_tenant_select" on public.catalog_orders
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "catalog_order_items_tenant_select" on public.catalog_order_items
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "catalog_events_admin_select" on public.catalog_events
  for select to authenticated
  using ((select public.is_payflow_admin()));

grant select on public.catalogs, public.catalog_categories, public.catalog_products,
  public.catalog_orders, public.catalog_order_items to authenticated;

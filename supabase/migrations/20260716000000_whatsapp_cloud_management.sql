-- Tenant ownership ledger for media uploaded to WhatsApp Cloud API.
-- Provider tokens remain server-side; clients can only manage media registered for their own tenant.
create table if not exists public.whatsapp_media_assets (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  meta_media_id text not null unique,
  phone_number_id text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  status text not null default 'active' check (status in ('active', 'deleted', 'error')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_media_assets_client
  on public.whatsapp_media_assets(client_id, status, created_at desc);

alter table public.whatsapp_media_assets enable row level security;

drop policy if exists "whatsapp_media_assets_tenant_select" on public.whatsapp_media_assets;
create policy "whatsapp_media_assets_tenant_select" on public.whatsapp_media_assets
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));


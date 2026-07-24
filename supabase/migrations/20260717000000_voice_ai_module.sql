-- PayFlow SMT — optional multi-tenant Voice AI module.
--
-- Vercel hosts the control plane (dashboard and secure APIs). A separate
-- realtime runtime (Pipecat + Twilio/Fonoster/SIP) publishes signed events to
-- PayFlow. Secrets stay in the runtime/provider vault and are never stored in
-- these public application tables.

create extension if not exists "uuid-ossp";

create table if not exists public.voice_module_settings (
  client_id text primary key,
  activation_status text not null default 'not_enabled',
  provider text not null default 'twilio',
  business_phone text,
  routing_phone text,
  provider_phone_id text,
  sip_domain text,
  timezone text not null default 'America/Guayaquil',
  default_payment_provider text not null default 'none',
  whatsapp_confirmations_enabled boolean not null default true,
  human_transfer_enabled boolean not null default false,
  human_transfer_phone text,
  recording_enabled boolean not null default false,
  retention_days integer not null default 30,
  requested_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_module_activation_check check (
    activation_status in ('not_enabled', 'requested', 'provisioning', 'active', 'suspended')
  ),
  constraint voice_module_provider_check check (
    provider in ('twilio', 'fonoster', 'sip', 'custom')
  ),
  constraint voice_module_payment_check check (
    default_payment_provider in ('none', 'payphone', 'stripe')
  ),
  constraint voice_module_retention_check check (retention_days between 1 and 365)
);
drop trigger if exists touch_voice_module_settings on public.voice_module_settings;
create trigger touch_voice_module_settings before update on public.voice_module_settings
  for each row execute function public.touch_updated_at();
create unique index if not exists idx_voice_settings_provider_phone_unique
  on public.voice_module_settings(provider, provider_phone_id)
  where provider_phone_id is not null and provider_phone_id <> '';
create unique index if not exists idx_voice_settings_routing_phone_unique
  on public.voice_module_settings(provider, routing_phone)
  where routing_phone is not null and routing_phone <> '';
create unique index if not exists idx_voice_settings_business_phone_unique
  on public.voice_module_settings(provider, business_phone)
  where business_phone is not null and business_phone <> '';

create table if not exists public.voice_agents (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null unique,
  name text not null default 'Asistente de voz',
  language text not null default 'es-EC',
  voice_id text not null default 'neutral-female-1',
  greeting text not null default 'Hola, gracias por llamar. ¿En qué puedo ayudarte?',
  instructions text not null default '',
  use_catalog boolean not null default true,
  can_create_orders boolean not null default true,
  can_create_reservations boolean not null default true,
  can_create_payment_links boolean not null default true,
  can_answer_faq boolean not null default true,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_agents_language_check check (language ~ '^[a-z]{2,3}(?:-[A-Z]{2})?$')
);
create index if not exists idx_voice_agents_client on public.voice_agents(client_id);
drop trigger if exists touch_voice_agents on public.voice_agents;
create trigger touch_voice_agents before update on public.voice_agents
  for each row execute function public.touch_updated_at();

create table if not exists public.voice_calls (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  provider text not null,
  provider_call_id text not null,
  direction text not null default 'inbound',
  caller_phone text,
  business_phone text,
  status text not null default 'queued',
  outcome text not null default 'unknown',
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  summary text,
  transcript jsonb not null default '[]'::jsonb,
  recording_url text,
  recording_consent boolean not null default false,
  order_id uuid references public.catalog_orders(id) on delete set null,
  payment_transaction_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_call_id),
  constraint voice_calls_direction_check check (direction in ('inbound', 'outbound')),
  constraint voice_calls_status_check check (
    status in ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'busy', 'no_answer', 'cancelled')
  ),
  constraint voice_calls_outcome_check check (
    outcome in ('unknown', 'information', 'order', 'reservation', 'payment', 'transferred', 'abandoned')
  ),
  constraint voice_calls_duration_check check (duration_seconds >= 0)
);
create index if not exists idx_voice_calls_client_created on public.voice_calls(client_id, created_at desc);
create index if not exists idx_voice_calls_client_status on public.voice_calls(client_id, status, created_at desc);
drop trigger if exists touch_voice_calls on public.voice_calls;
create trigger touch_voice_calls before update on public.voice_calls
  for each row execute function public.touch_updated_at();

create table if not exists public.voice_reservations (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  call_id uuid references public.voice_calls(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  service_name text,
  party_size integer,
  scheduled_at timestamptz not null,
  status text not null default 'pending',
  notes text,
  source_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_reservations_status_check check (
    status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')
  ),
  constraint voice_reservations_party_check check (party_size is null or party_size between 1 and 100)
);
create index if not exists idx_voice_reservations_client_scheduled
  on public.voice_reservations(client_id, scheduled_at desc);
drop trigger if exists touch_voice_reservations on public.voice_reservations;
create trigger touch_voice_reservations before update on public.voice_reservations
  for each row execute function public.touch_updated_at();

create table if not exists public.voice_call_events (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  call_id uuid references public.voice_calls(id) on delete cascade,
  event_type text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_voice_events_client_occurred
  on public.voice_call_events(client_id, occurred_at desc);
create index if not exists idx_voice_events_call on public.voice_call_events(call_id, occurred_at);

-- Voice-created orders are first-class catalog orders. The transactional RPC
-- still resolves every price in the database and never trusts an AI amount.
alter table if exists public.catalog_orders
  drop constraint if exists catalog_orders_channel_check;
alter table if exists public.catalog_orders
  add constraint catalog_orders_channel_check
  check (channel in ('web', 'whatsapp', 'voice', 'api', 'manual'));

-- Wrapper around the audited catalog RPC. The base RPC performs the price and
-- stock transaction; this wrapper only labels the already-created order with
-- its real acquisition channel.
create or replace function public.create_voice_catalog_order(
  p_catalog_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_notes text,
  p_source_key text,
  p_items jsonb
)
returns table(order_id uuid, order_number text, total numeric, currency text, was_existing boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row record;
begin
  select * into result_row
  from public.create_catalog_order(
    p_catalog_slug,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_notes,
    'api',
    p_source_key,
    p_items
  );

  update public.catalog_orders set channel = 'voice' where id = result_row.order_id;
  return query select result_row.order_id, result_row.order_number,
    result_row.total, result_row.currency, result_row.was_existing;
end;
$$;
revoke all on function public.create_voice_catalog_order(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_voice_catalog_order(text, text, text, text, text, text, jsonb)
  to service_role;

alter table public.voice_module_settings enable row level security;
alter table public.voice_agents enable row level security;
alter table public.voice_calls enable row level security;
alter table public.voice_reservations enable row level security;
alter table public.voice_call_events enable row level security;

create policy "voice_settings_tenant_select" on public.voice_module_settings
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "voice_agents_tenant_select" on public.voice_agents
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "voice_calls_tenant_select" on public.voice_calls
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "voice_reservations_tenant_select" on public.voice_reservations
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "voice_events_tenant_select" on public.voice_call_events
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));

grant select on public.voice_module_settings, public.voice_agents,
  public.voice_calls, public.voice_reservations, public.voice_call_events to authenticated;

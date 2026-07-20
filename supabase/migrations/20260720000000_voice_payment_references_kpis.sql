-- Payment references, unified trace and KPIs for the optional Voice AI module.
-- PayFlow stores operational references only: it never stores card/bank credentials
-- and never marks a payment as paid from the voice agent.

alter table if exists public.voice_calls
  add column if not exists customer_name text,
  add column if not exists whatsapp_confirmation_status text not null default 'not_requested',
  add column if not exists transferred_to_human boolean not null default false,
  add column if not exists telephony_cost_estimate numeric(12,4) not null default 0,
  add column if not exists ai_cost_estimate numeric(12,4) not null default 0,
  add column if not exists currency text not null default 'USD';

alter table if exists public.voice_calls
  drop constraint if exists voice_calls_whatsapp_confirmation_status_check;
alter table if exists public.voice_calls
  add constraint voice_calls_whatsapp_confirmation_status_check
  check (whatsapp_confirmation_status in ('not_requested', 'queued', 'sent', 'delivered', 'failed'));

-- Keep providers interchangeable. Existing tenants can continue using Twilio,
-- while future tenants may use Telnyx, Fonoster, SIP or a custom gateway.
alter table if exists public.voice_module_settings
  drop constraint if exists voice_module_settings_provider_check;
alter table if exists public.voice_module_settings
  add constraint voice_module_settings_provider_check
  check (provider in ('telnyx', 'twilio', 'fonoster', 'sip', 'custom'));

create table if not exists public.voice_payment_profiles (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  label text not null,
  method text not null,
  provider_label text,
  payment_url text,
  bank_name text,
  account_holder text,
  account_type text,
  account_reference_masked text,
  instructions text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_payment_profiles_method_check check (
    method in ('payment_link', 'bank_transfer', 'cash', 'cash_on_delivery')
  )
);
create index if not exists idx_voice_payment_profiles_client
  on public.voice_payment_profiles(client_id, active, is_default desc);
create unique index if not exists uq_voice_payment_profiles_default
  on public.voice_payment_profiles(client_id) where is_default and active;
drop trigger if exists touch_voice_payment_profiles on public.voice_payment_profiles;
create trigger touch_voice_payment_profiles before update on public.voice_payment_profiles
  for each row execute function public.touch_updated_at();

create table if not exists public.voice_payment_references (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  call_id uuid references public.voice_calls(id) on delete set null,
  order_id uuid references public.catalog_orders(id) on delete set null,
  reservation_id uuid references public.voice_reservations(id) on delete set null,
  profile_id uuid references public.voice_payment_profiles(id) on delete set null,
  method text not null,
  provider_label text,
  external_reference text,
  checkout_url text,
  amount numeric(12,2),
  currency text not null default 'USD',
  status text not null default 'pending',
  status_source text not null default 'voice_agent',
  proof_url text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_payment_references_method_check check (
    method in ('payment_link', 'bank_transfer', 'cash', 'cash_on_delivery')
  ),
  constraint voice_payment_references_status_check check (
    status in ('pending', 'proof_received', 'paid', 'cancelled', 'refunded')
  ),
  constraint voice_payment_references_status_source_check check (
    status_source in ('voice_agent', 'manual', 'provider_webhook', 'system')
  ),
  constraint voice_payment_references_amount_check check (amount is null or amount >= 0)
);
create index if not exists idx_voice_payment_references_client_created
  on public.voice_payment_references(client_id, created_at desc);
create index if not exists idx_voice_payment_references_call
  on public.voice_payment_references(call_id, created_at desc);
create index if not exists idx_voice_payment_references_status
  on public.voice_payment_references(client_id, status, created_at desc);
drop trigger if exists touch_voice_payment_references on public.voice_payment_references;
create trigger touch_voice_payment_references before update on public.voice_payment_references
  for each row execute function public.touch_updated_at();

alter table if exists public.voice_call_events
  add column if not exists status text,
  add column if not exists summary text;

alter table public.voice_payment_profiles enable row level security;
alter table public.voice_payment_references enable row level security;

drop policy if exists "voice_payment_profiles_tenant_select" on public.voice_payment_profiles;
create policy "voice_payment_profiles_tenant_select" on public.voice_payment_profiles
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));

drop policy if exists "voice_payment_references_tenant_select" on public.voice_payment_references;
create policy "voice_payment_references_tenant_select" on public.voice_payment_references
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));

grant select on public.voice_payment_profiles, public.voice_payment_references to authenticated;

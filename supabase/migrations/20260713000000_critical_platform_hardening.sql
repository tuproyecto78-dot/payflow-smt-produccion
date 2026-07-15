-- PayFlow SMT critical platform hardening
-- One tenant boundary, explicit entitlements, durable messaging analytics.

create extension if not exists "uuid-ossp";

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Align the original profile schema with the application authorization model.
alter table public.profiles add column if not exists user_id uuid;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists status text not null default 'pending';
alter table public.profiles add column if not exists client_id text;

-- Some early PayFlow deployments created profiles.id as text while newer
-- Supabase schemas use uuid. Resolve the auth UUID by verified email instead
-- of casting a legacy identifier that may contain a CUID.
update public.profiles p
set user_id = auth_user.id
from auth.users auth_user
where p.user_id is null
  and p.email is not null
  and auth_user.email is not null
  and lower(p.email) = lower(auth_user.email);

update public.profiles
set full_name = coalesce(full_name, name)
where full_name is null;

create unique index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_profiles_client_id on public.profiles(client_id);
create index if not exists idx_profiles_status on public.profiles(status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'id'
      and atttypid = 'uuid'::regtype
      and not attisdropped
  ) then
    insert into public.profiles (id, user_id, email, name, full_name, role, status)
    values (
      new.id,
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
      'applicant',
      'pending'
    )
    on conflict (id) do update
    set user_id = excluded.user_id,
        email = excluded.email,
        updated_at = now();
  else
    insert into public.profiles (id, user_id, email, name, full_name, role, status)
    values (
      new.id::text,
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
      'applicant',
      'pending'
    )
    on conflict (id) do update
    set user_id = excluded.user_id,
        email = excluded.email,
        updated_at = now();
  end if;
  return new;
end;
$$;

-- Provider-agnostic entitlement. A profile is active only after a verified
-- provider webhook or an audited administrator verification.
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  subscription_request_id text unique,
  plan_code text not null,
  status text not null default 'pending',
  provider text,
  provider_subscription_id text,
  activation_source text not null default 'provider_webhook',
  period_start timestamptz,
  period_end timestamptz,
  activated_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (status in ('pending','active','past_due','suspended','cancelled'))
);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_client_status on public.subscriptions(client_id, status);
create unique index if not exists idx_subscriptions_provider_id
  on public.subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;
drop trigger if exists touch_subscriptions on public.subscriptions;
create trigger touch_subscriptions before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Durable tenant record. This replaces the production dependency on the
-- ephemeral SQLite ClientAccount model while keeping its identifier portable.
create table if not exists public.client_accounts (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  -- Kept as text because legacy requests may use CUIDs while Supabase-native
  -- requests use UUIDs. The activation function always compares id::text.
  subscription_request_id text unique,
  business_name text not null,
  business_type text,
  owner_email text not null,
  owner_phone text,
  owner_document text,
  country text,
  city text,
  plan_code text not null,
  payment_provider text not null default 'payphone',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_accounts_status_check check (status in ('active','suspended','cancelled'))
);
create index if not exists idx_client_accounts_owner on public.client_accounts(owner_user_id);
create index if not exists idx_client_accounts_status on public.client_accounts(status);
drop trigger if exists touch_client_accounts on public.client_accounts;
create trigger touch_client_accounts before update on public.client_accounts
  for each row execute function public.touch_updated_at();

-- Durable WhatsApp/customer event model used by operational KPIs.
create table if not exists public.contacts (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  channel text not null default 'whatsapp',
  external_id text not null,
  display_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, channel, external_id)
);
create index if not exists idx_contacts_client_last_seen on public.contacts(client_id, last_seen_at desc);
drop trigger if exists touch_contacts on public.contacts;
create trigger touch_contacts before update on public.contacts
  for each row execute function public.touch_updated_at();

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null default 'whatsapp',
  status text not null default 'open',
  current_step text not null default 'greeting',
  context jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_status_check check (status in ('open','waiting','human_handoff','closed'))
);
alter table public.conversations add column if not exists current_step text not null default 'greeting';
alter table public.conversations add column if not exists context jsonb not null default '{}'::jsonb;
create index if not exists idx_conversations_client_last_message on public.conversations(client_id, last_message_at desc);
create index if not exists idx_conversations_contact on public.conversations(contact_id);
drop trigger if exists touch_conversations on public.conversations;
create trigger touch_conversations before update on public.conversations
  for each row execute function public.touch_updated_at();

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null default 'meta',
  provider_message_id text not null,
  direction text not null,
  message_type text not null default 'text',
  status text not null default 'received',
  content_preview text,
  received_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_direction_check check (direction in ('inbound','outbound')),
  constraint messages_status_check check (status in ('received','queued','sent','delivered','read','failed')),
  unique (provider, provider_message_id)
);
create index if not exists idx_messages_client_created on public.messages(client_id, created_at desc);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at);
create index if not exists idx_messages_contact_created on public.messages(contact_id, created_at desc);

create table if not exists public.message_status_events (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  message_id uuid not null references public.messages(id) on delete cascade,
  provider_event_id text,
  status text not null,
  occurred_at timestamptz not null default now(),
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider_event_id, status)
);
create index if not exists idx_message_status_client_time on public.message_status_events(client_id, occurred_at desc);

create table if not exists public.workflow_run_events (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  workflow_id text not null,
  workflow_name text,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_workflow_run_events_client_time on public.workflow_run_events(client_id, started_at desc);
create index if not exists idx_workflow_run_events_workflow on public.workflow_run_events(workflow_id, started_at desc);

create table if not exists public.workflow_node_runs (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  workflow_run_event_id uuid not null references public.workflow_run_events(id) on delete cascade,
  workflow_id text not null,
  node_id text not null,
  node_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists idx_node_runs_client_time on public.workflow_node_runs(client_id, started_at desc);
create index if not exists idx_node_runs_workflow_run on public.workflow_node_runs(workflow_run_event_id);

alter table public.workflow_runs add column if not exists client_id text;
alter table public.payment_transactions add column if not exists client_id text;
alter table public.payment_transactions add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.payment_transactions add column if not exists client_transaction_id text;
alter table public.payment_transactions add column if not exists source_key text;
alter table public.payment_transactions add column if not exists paid_at timestamptz;
create index if not exists idx_workflow_runs_client_started on public.workflow_runs(client_id, started_at desc);
create index if not exists idx_payment_tx_client_created on public.payment_transactions(client_id, created_at desc);
create unique index if not exists idx_payment_tx_client_transaction_id
  on public.payment_transactions(client_transaction_id)
  where client_transaction_id is not null;
create unique index if not exists idx_payment_tx_source_key
  on public.payment_transactions(source_key)
  where source_key is not null;

-- WhatsApp routing metadata. Access tokens remain in Vercel, never here.
create table if not exists public.whatsapp_connections (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  phone_number_id text not null unique,
  business_account_id text,
  display_phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_connections_status_check check (status in ('active','inactive','error'))
);
create index if not exists idx_whatsapp_connections_client on public.whatsapp_connections(client_id, status);
drop trigger if exists touch_whatsapp_connections on public.whatsapp_connections;
create trigger touch_whatsapp_connections before update on public.whatsapp_connections
  for each row execute function public.touch_updated_at();

-- Columns used by the public subscription form. They are additive so this
-- migration works against both the initial schema and already-expanded DBs.
alter table public.subscription_requests add column if not exists city text;
alter table public.subscription_requests add column if not exists payment_provider text not null default 'payphone';
alter table public.subscription_requests add column if not exists payphone_business_status text not null default 'not_configured';
alter table public.subscription_requests add column if not exists has_payphone_business text not null default 'no';
alter table public.subscription_requests add column if not exists start_payments_config boolean not null default false;
alter table public.subscription_requests add column if not exists consent_accepted boolean not null default false;
alter table public.subscription_requests add column if not exists consent_accepted_at timestamptz;
alter table public.subscription_requests add column if not exists activated_client_id uuid references public.client_accounts(id) on delete set null;
alter table public.subscription_requests add column if not exists selected_plan_label text;
alter table public.subscription_requests add column if not exists selected_plan_price numeric;

-- Atomic activation: locks the request, creates the tenant, grants access and
-- records the entitlement/audit trail together. Callable only by service_role.
drop function if exists public.activate_subscription_request(uuid, uuid);
create or replace function public.activate_subscription_request(
  p_request_id text,
  p_actor_user_id uuid default null
)
returns table(client_id uuid, already_active boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.subscription_requests%rowtype;
  profile_row public.profiles%rowtype;
  resolved_client_id uuid;
  was_active boolean := false;
  email_verified_at timestamptz;
begin
  select * into request_row
  from public.subscription_requests
  where id::text = p_request_id
  for update;

  if not found then
    raise exception 'SUBSCRIPTION_REQUEST_NOT_FOUND';
  end if;

  select * into profile_row
  from public.profiles
  where lower(email) = lower(request_row.email)
  order by created_at asc
  limit 1;

  if not found or profile_row.user_id is null then
    raise exception 'VERIFIED_ACCOUNT_NOT_FOUND';
  end if;

  select email_confirmed_at into email_verified_at
  from auth.users
  where id = profile_row.user_id;
  if email_verified_at is null then
    raise exception 'VERIFIED_ACCOUNT_NOT_FOUND';
  end if;

  was_active := request_row.subscription_status = 'activated'
    and request_row.activated_client_id is not null;

  if was_active then
    resolved_client_id := request_row.activated_client_id;
  else
    insert into public.client_accounts (
      owner_user_id,
      subscription_request_id,
      business_name,
      business_type,
      owner_email,
      owner_phone,
      owner_document,
      country,
      city,
      plan_code,
      payment_provider,
      status
    ) values (
      profile_row.user_id,
      request_row.id::text,
      coalesce(nullif(request_row.business_name, ''), request_row.full_name),
      request_row.business_type,
      lower(request_row.email),
      concat(request_row.country_code, request_row.phone_number),
      request_row.document_id,
      request_row.country,
      request_row.city,
      request_row.selected_plan,
      request_row.payment_provider,
      'active'
    )
    on conflict (subscription_request_id) do update
    set status = 'active', updated_at = now()
    returning id into resolved_client_id;

    update public.subscription_requests
    set subscription_status = 'activated',
        activated_client_id = resolved_client_id,
        updated_at = now()
    where id = request_row.id;
  end if;

  update public.profiles
  set role = 'client_owner',
      status = 'active',
      client_id = resolved_client_id::text,
      updated_at = now()
  where id = profile_row.id;

  insert into public.subscriptions (
    user_id,
    client_id,
    subscription_request_id,
    plan_code,
    status,
    provider,
    activation_source,
    activated_at
  ) values (
    profile_row.user_id,
    resolved_client_id::text,
    request_row.id::text,
    request_row.selected_plan,
    'active',
    request_row.payment_provider,
    'admin_verified',
    now()
  )
  on conflict (subscription_request_id) do update
  set client_id = excluded.client_id,
      plan_code = excluded.plan_code,
      status = 'active',
      provider = excluded.provider,
      activated_at = coalesce(public.subscriptions.activated_at, now()),
      updated_at = now();

  if not was_active then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    values (
      p_actor_user_id,
      'client_activated',
      'subscription_request',
      request_row.id::text,
      jsonb_build_object(
        'client_id', resolved_client_id,
        'owner_email', lower(request_row.email),
        'plan', request_row.selected_plan,
        'activation_source', 'admin_verified'
      )
    );
  end if;

  return query select resolved_client_id, was_active;
end;
$$;
revoke all on function public.activate_subscription_request(text, uuid) from public, anon, authenticated;
grant execute on function public.activate_subscription_request(text, uuid) to service_role;

-- Generic idempotency ledger for external providers.
create table if not exists public.integration_webhook_events (
  id uuid primary key default uuid_generate_v4(),
  client_id text,
  provider text not null,
  event_key text not null,
  event_type text,
  signature_valid boolean not null default false,
  processing_status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  unique (provider, event_key)
);
create index if not exists idx_integration_webhooks_status on public.integration_webhook_events(provider, processing_status, received_at);

-- Authorization helpers used by tenant policies.
create or replace function public.is_payflow_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('admin','super_admin')
  );
$$;

create or replace function public.current_client_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

-- Replace permissive policies. The service role bypasses RLS for writes.
alter table public.subscriptions enable row level security;
alter table public.client_accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_status_events enable row level security;
alter table public.workflow_run_events enable row level security;
alter table public.workflow_node_runs enable row level security;
alter table public.integration_webhook_events enable row level security;
alter table public.whatsapp_connections enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_payflow_admin()));

drop policy if exists "subreq_insert_public" on public.subscription_requests;
drop policy if exists "subreq_select_auth" on public.subscription_requests;
drop policy if exists "subreq_update_auth" on public.subscription_requests;
create policy "subreq_admin_select" on public.subscription_requests
  for select to authenticated using ((select public.is_payflow_admin()));
create policy "subreq_admin_update" on public.subscription_requests
  for update to authenticated
  using ((select public.is_payflow_admin()))
  with check ((select public.is_payflow_admin()));

drop policy if exists "audit_insert_service" on public.audit_logs;

create policy "subscriptions_select_own_or_admin" on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_payflow_admin()));
create policy "client_accounts_owner_or_admin" on public.client_accounts
  for select to authenticated
  using ((select auth.uid()) = owner_user_id or (select public.is_payflow_admin()));

create policy "contacts_tenant_select" on public.contacts
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "conversations_tenant_select" on public.conversations
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "messages_tenant_select" on public.messages
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "message_events_tenant_select" on public.message_status_events
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "workflow_run_events_tenant_select" on public.workflow_run_events
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "node_runs_tenant_select" on public.workflow_node_runs
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));
create policy "webhook_events_admin_select" on public.integration_webhook_events
  for select to authenticated using ((select public.is_payflow_admin()));
create policy "whatsapp_connections_tenant_select" on public.whatsapp_connections
  for select to authenticated
  using (client_id = (select public.current_client_id()) or (select public.is_payflow_admin()));

-- Daily KPI view. All timestamps are interpreted in the business timezone.
create or replace view public.analytics_daily
with (security_invoker = true)
as
with message_metrics as (
  select
    client_id,
    (created_at at time zone 'America/Guayaquil')::date as metric_date,
    count(distinct contact_id) filter (where direction = 'inbound') as unique_contacts,
    count(*) filter (where direction = 'inbound') as inbound_messages,
    count(*) filter (where direction = 'outbound') as outbound_messages,
    count(*) filter (where direction = 'outbound' and status = 'failed') as failed_messages
  from public.messages
  group by client_id, (created_at at time zone 'America/Guayaquil')::date
), payment_metrics as (
  select
    client_id,
    (created_at at time zone 'America/Guayaquil')::date as metric_date,
    count(*) filter (where payment_link is not null) as payment_links,
    count(*) filter (where status = 'payment_success') as paid_transactions,
    count(*) filter (where status = 'payment_failed') as failed_transactions,
    coalesce(sum(amount) filter (where status = 'payment_success'), 0) as revenue
  from public.payment_transactions
  where client_id is not null
  group by client_id, (created_at at time zone 'America/Guayaquil')::date
), run_metrics as (
  select
    client_id,
    (started_at at time zone 'America/Guayaquil')::date as metric_date,
    count(*) as workflow_runs,
    count(*) filter (where status in ('success','completed')) as successful_runs,
    count(*) filter (where status in ('failed','error')) as failed_runs
  from public.workflow_run_events
  group by client_id, (started_at at time zone 'America/Guayaquil')::date
), keys as (
  select client_id, metric_date from message_metrics
  union
  select client_id, metric_date from payment_metrics
  union
  select client_id, metric_date from run_metrics
)
select
  keys.client_id,
  keys.metric_date,
  coalesce(m.unique_contacts, 0) as unique_contacts,
  coalesce(m.inbound_messages, 0) as inbound_messages,
  coalesce(m.outbound_messages, 0) as outbound_messages,
  coalesce(m.failed_messages, 0) as failed_messages,
  coalesce(p.payment_links, 0) as payment_links,
  coalesce(p.paid_transactions, 0) as paid_transactions,
  coalesce(p.failed_transactions, 0) as failed_transactions,
  coalesce(p.revenue, 0) as revenue,
  coalesce(r.workflow_runs, 0) as workflow_runs,
  coalesce(r.successful_runs, 0) as successful_runs,
  coalesce(r.failed_runs, 0) as failed_runs
from keys
left join message_metrics m using (client_id, metric_date)
left join payment_metrics p using (client_id, metric_date)
left join run_metrics r using (client_id, metric_date);

grant select on public.analytics_daily to authenticated;

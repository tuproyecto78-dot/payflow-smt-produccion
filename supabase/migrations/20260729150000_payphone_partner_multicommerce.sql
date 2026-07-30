-- PayPhone Partner multi-commerce support.
-- This migration is intentionally not coupled to the cancelled
-- external_payment_* experiment. It does not delete or rewrite legacy rows.
-- PayPhone merchant tokens are encrypted by the application before insert.

create table if not exists public.payphone_partner_accounts (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null
    references public.client_accounts(id) on delete restrict,
  ruc text not null,
  store_id text not null,
  token_ciphertext text not null,
  token_iv text not null,
  token_auth_tag text not null,
  token_key_version integer not null default 1,
  token_fingerprint text not null,
  environment text not null default 'sandbox',
  status text not null default 'onboarding_pending',
  fallback_url text,
  external_notification_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payphone_partner_accounts_client_unique unique (client_id),
  constraint payphone_partner_accounts_ruc_unique unique (ruc),
  constraint payphone_partner_accounts_store_unique unique (store_id),
  constraint payphone_partner_accounts_id_client_unique unique (id, client_id),
  constraint payphone_partner_accounts_ruc_check
    check (ruc ~ '^[0-9]{13}$'),
  constraint payphone_partner_accounts_store_check
    check (store_id ~ '^[A-Za-z0-9._:-]{3,160}$'),
  constraint payphone_partner_accounts_environment_check
    check (environment in ('sandbox', 'production')),
  constraint payphone_partner_accounts_status_check
    check (status in ('onboarding_pending', 'active', 'inactive', 'error')),
  constraint payphone_partner_accounts_fallback_check
    check (fallback_url is null or fallback_url ~ '^https://'),
  constraint payphone_partner_accounts_cipher_check
    check (
      length(token_ciphertext) >= 16
      and length(token_iv) >= 16
      and length(token_auth_tag) >= 16
      and token_key_version > 0
      and token_fingerprint ~ '^[a-f0-9]{16}$'
    )
);

create index if not exists idx_payphone_partner_accounts_client_status
  on public.payphone_partner_accounts(client_id, status);

drop trigger if exists touch_payphone_partner_accounts
  on public.payphone_partner_accounts;
create trigger touch_payphone_partner_accounts
  before update on public.payphone_partner_accounts
  for each row execute function public.touch_updated_at();

create or replace function public.enforce_active_payphone_partner_business()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.client_id is null then
    raise exception 'PAYPHONE_CLIENT_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.client_accounts
    where id = new.client_id
      and status = 'active'
  ) then
    raise exception 'PAYPHONE_BUSINESS_INACTIVE';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_active_payphone_partner_business
  on public.payphone_partner_accounts;
create trigger enforce_active_payphone_partner_business
  before insert or update of client_id on public.payphone_partner_accounts
  for each row execute function public.enforce_active_payphone_partner_business();

create table if not exists public.payphone_partner_transactions (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null
    references public.client_accounts(id) on delete restrict,
  account_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  client_transaction_id text not null,
  idempotency_key text not null,
  amount_cents bigint not null,
  currency text not null default 'USD',
  reference text not null,
  payment_link text,
  fallback_used boolean not null default false,
  status text not null default 'creating',
  real_charge boolean not null default false,
  provider_transaction_id text,
  authorization_code text,
  provider_response jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payphone_partner_tx_account_fkey
    foreign key (account_id, client_id)
    references public.payphone_partner_accounts(id, client_id)
    on delete restrict,
  constraint payphone_partner_tx_client_transaction_unique
    unique (client_transaction_id),
  constraint payphone_partner_tx_idempotency_unique
    unique (client_id, idempotency_key),
  constraint payphone_partner_tx_id_client_unique unique (id, client_id),
  constraint payphone_partner_tx_amount_check check (amount_cents > 0),
  constraint payphone_partner_tx_currency_check check (currency = 'USD'),
  constraint payphone_partner_tx_link_check
    check (payment_link is null or payment_link ~ '^https://'),
  constraint payphone_partner_tx_status_check
    check (status in ('creating', 'pending', 'approved', 'rejected', 'error'))
);

create index if not exists idx_payphone_partner_tx_client_created
  on public.payphone_partner_transactions(client_id, created_at desc);
create index if not exists idx_payphone_partner_tx_store_lookup
  on public.payphone_partner_transactions(account_id, client_transaction_id);

drop trigger if exists touch_payphone_partner_transactions
  on public.payphone_partner_transactions;
create trigger touch_payphone_partner_transactions
  before update on public.payphone_partner_transactions
  for each row execute function public.touch_updated_at();

create table if not exists public.payphone_partner_notification_events (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null,
  payment_transaction_id uuid not null,
  event_key text not null,
  provider_transaction_id text not null,
  store_id text not null,
  status_code integer not null,
  transaction_status text,
  amount_cents bigint not null,
  currency text not null,
  reference text,
  duplicate boolean not null default false,
  transition_applied boolean not null default false,
  received_at timestamptz not null,
  processed_at timestamptz not null default now(),
  constraint payphone_partner_event_tx_fkey
    foreign key (payment_transaction_id, client_id)
    references public.payphone_partner_transactions(id, client_id)
    on delete cascade,
  constraint payphone_partner_event_key_unique unique (event_key),
  constraint payphone_partner_event_status_check
    check (status_code in (1, 2, 3)),
  constraint payphone_partner_event_amount_check check (amount_cents > 0),
  constraint payphone_partner_event_currency_check check (currency = 'USD')
);

create index if not exists idx_payphone_partner_event_client_received
  on public.payphone_partner_notification_events(client_id, received_at desc);

alter table public.payphone_partner_accounts enable row level security;
alter table public.payphone_partner_transactions enable row level security;
alter table public.payphone_partner_notification_events enable row level security;

revoke all on public.payphone_partner_accounts from anon, authenticated;
revoke all on public.payphone_partner_transactions from anon, authenticated;
revoke all on public.payphone_partner_notification_events
  from anon, authenticated;
grant select, insert, update on public.payphone_partner_accounts
  to service_role;
grant select, insert, update on public.payphone_partner_transactions
  to service_role;
grant select, insert on public.payphone_partner_notification_events
  to service_role;

create or replace function public.apply_payphone_partner_notification(
  p_store_id text,
  p_client_transaction_id text,
  p_provider_transaction_id text,
  p_status_code integer,
  p_transaction_status text,
  p_amount_cents bigint,
  p_currency text,
  p_authorization_code text,
  p_reference text,
  p_received_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.payphone_partner_accounts%rowtype;
  v_transaction public.payphone_partner_transactions%rowtype;
  v_status text;
  v_event_key text;
  v_inserted_event_id uuid;
  v_transition_applied boolean := false;
begin
  if coalesce(trim(p_store_id), '') = ''
    or coalesce(trim(p_client_transaction_id), '') = ''
    or coalesce(trim(p_provider_transaction_id), '') = ''
  then
    raise exception 'PAYPHONE_NOTIFICATION_INVALID';
  end if;

  select *
    into v_account
    from public.payphone_partner_accounts
    where store_id = p_store_id
      and status = 'active'
      and external_notification_enabled = true
    for share;
  if not found then
    raise exception 'PAYPHONE_NOTIFICATION_UNAUTHORIZED';
  end if;

  select *
    into v_transaction
    from public.payphone_partner_transactions
    where client_id = v_account.client_id
      and account_id = v_account.id
      and client_transaction_id = p_client_transaction_id
    for update;
  if not found then
    raise exception 'PAYPHONE_TRANSACTION_NOT_FOUND';
  end if;

  if v_transaction.amount_cents <> p_amount_cents
    or v_transaction.currency <> upper(p_currency)
  then
    raise exception 'PAYPHONE_NOTIFICATION_MISMATCH';
  end if;

  v_status := case
    when p_status_code = 3
      or lower(coalesce(p_transaction_status, '')) = 'approved'
      then 'approved'
    when p_status_code = 2
      or lower(coalesce(p_transaction_status, '')) in ('canceled', 'cancelled')
      then 'rejected'
    when p_status_code = 1
      or lower(coalesce(p_transaction_status, '')) = 'pending'
      then 'pending'
    else null
  end;
  if v_status is null then
    raise exception 'PAYPHONE_NOTIFICATION_INVALID';
  end if;
  if v_status = 'approved'
    and coalesce(trim(p_authorization_code), '') = ''
  then
    raise exception 'PAYPHONE_NOTIFICATION_INVALID';
  end if;

  v_event_key :=
    v_account.client_id::text || ':' || trim(p_provider_transaction_id);
  insert into public.payphone_partner_notification_events (
    client_id,
    payment_transaction_id,
    event_key,
    provider_transaction_id,
    store_id,
    status_code,
    transaction_status,
    amount_cents,
    currency,
    reference,
    duplicate,
    transition_applied,
    received_at
  ) values (
    v_account.client_id,
    v_transaction.id,
    v_event_key,
    trim(p_provider_transaction_id),
    p_store_id,
    p_status_code,
    p_transaction_status,
    p_amount_cents,
    upper(p_currency),
    p_reference,
    false,
    false,
    coalesce(p_received_at, now())
  )
  on conflict (event_key) do nothing
  returning id into v_inserted_event_id;

  if v_inserted_event_id is null then
    return jsonb_build_object(
      'Response', true,
      'ErrorCode', '000',
      'duplicate', true,
      'transition_applied', false,
      'status', v_transaction.status,
      'client_id', v_account.client_id
    );
  end if;

  if v_transaction.status in ('approved', 'rejected') then
    v_transition_applied := false;
  elsif v_status <> 'pending' or v_transaction.status <> 'pending' then
    update public.payphone_partner_transactions
      set status = v_status,
          provider_transaction_id = trim(p_provider_transaction_id),
          authorization_code = case
            when v_status = 'approved' then p_authorization_code
            else authorization_code
          end,
          paid_at = case when v_status = 'approved' then now() else paid_at end,
          updated_at = now()
      where id = v_transaction.id;
    v_transition_applied := true;
    v_transaction.status := v_status;
  end if;

  update public.payphone_partner_notification_events
    set transition_applied = v_transition_applied
    where id = v_inserted_event_id;

  return jsonb_build_object(
    'Response', true,
    'ErrorCode', '000',
    'duplicate', false,
    'transition_applied', v_transition_applied,
    'status', v_transaction.status,
    'client_id', v_account.client_id
  );
end;
$$;

revoke all on function public.apply_payphone_partner_notification(
  text, text, text, integer, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_payphone_partner_notification(
  text, text, text, integer, text, bigint, text, text, text, timestamptz
) to service_role;

-- Payflow SMT: bounded context for external payment integrations.
-- Phase 1 is sandbox-only. It cannot create a real charge.

create table if not exists public.external_payment_requests (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  business_name text not null,
  provider text not null default 'sandbox',
  provider_reference text not null,
  order_reference text not null,
  idempotency_key text not null,
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  description text not null,
  customer_name text,
  status text not null default 'pending',
  payment_link text not null,
  checkout_token_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_payment_provider_check
    check (provider = 'sandbox'),
  constraint external_payment_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint external_payment_amount_check
    check (amount > 0 and amount <= 999999.99),
  constraint external_payment_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  unique (provider, provider_reference),
  unique (client_id, idempotency_key)
);

create index if not exists idx_external_payment_client_created
  on public.external_payment_requests(client_id, created_at desc);
create index if not exists idx_external_payment_client_status
  on public.external_payment_requests(client_id, status);
create index if not exists idx_external_payment_order_reference
  on public.external_payment_requests(client_id, order_reference);

drop trigger if exists touch_external_payment_requests
  on public.external_payment_requests;
create trigger touch_external_payment_requests
  before update on public.external_payment_requests
  for each row execute function public.touch_updated_at();

create table if not exists public.external_payment_events (
  id uuid primary key default uuid_generate_v4(),
  payment_request_id uuid not null
    references public.external_payment_requests(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  provider_reference text not null,
  status text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint external_payment_event_provider_check
    check (provider = 'sandbox'),
  constraint external_payment_event_status_check
    check (status in ('pending', 'approved', 'rejected')),
  unique (provider, provider_event_id)
);

create index if not exists idx_external_payment_events_request
  on public.external_payment_events(payment_request_id, created_at desc);

alter table public.external_payment_requests enable row level security;
alter table public.external_payment_events enable row level security;

-- No browser policies are created intentionally. These tables are accessed
-- only from authenticated server routes through the service role.
revoke all on public.external_payment_requests from anon, authenticated;
revoke all on public.external_payment_events from anon, authenticated;
grant select, insert, update on public.external_payment_requests
  to service_role;
grant select, insert on public.external_payment_events
  to service_role;

create or replace function public.apply_external_payment_event(
  p_provider text,
  p_event_id text,
  p_payment_request_id uuid,
  p_provider_reference text,
  p_status text,
  p_occurred_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.external_payment_requests%rowtype;
  v_existing_event public.external_payment_events%rowtype;
  v_inserted_event_id uuid;
  v_transition_applied boolean := false;
begin
  if p_provider <> 'sandbox'
    or p_status not in ('pending', 'approved', 'rejected')
    or coalesce(trim(p_event_id), '') = ''
  then
    raise exception 'EXTERNAL_PAYMENT_INVALID_EVENT';
  end if;

  select *
    into v_request
    from public.external_payment_requests
    where id = p_payment_request_id
    for update;

  if not found then
    raise exception 'EXTERNAL_PAYMENT_NOT_FOUND';
  end if;

  if v_request.provider <> p_provider
    or v_request.provider_reference <> p_provider_reference
  then
    raise exception 'EXTERNAL_PAYMENT_REFERENCE_MISMATCH';
  end if;

  insert into public.external_payment_events (
    payment_request_id,
    provider,
    provider_event_id,
    provider_reference,
    status,
    occurred_at,
    payload
  )
  values (
    p_payment_request_id,
    p_provider,
    p_event_id,
    p_provider_reference,
    p_status,
    p_occurred_at,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into v_inserted_event_id;

  if v_inserted_event_id is null then
    select *
      into v_existing_event
      from public.external_payment_events
      where provider = p_provider
        and provider_event_id = p_event_id;

    if v_existing_event.payment_request_id <> p_payment_request_id then
      raise exception 'EXTERNAL_PAYMENT_EVENT_CONFLICT';
    end if;

    select *
      into v_request
      from public.external_payment_requests
      where id = p_payment_request_id;

    return jsonb_build_object(
      'duplicate', true,
      'transition_applied', false,
      'request', to_jsonb(v_request)
    );
  end if;

  if v_request.status = 'pending'
    and p_status in ('approved', 'rejected')
  then
    v_transition_applied := true;
    update public.external_payment_requests
      set status = p_status,
          last_event_at = p_occurred_at,
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('last_sandbox_event_id', p_event_id)
      where id = p_payment_request_id
      returning * into v_request;
  else
    update public.external_payment_requests
      set last_event_at = p_occurred_at,
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('last_sandbox_event_id', p_event_id)
      where id = p_payment_request_id
      returning * into v_request;
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'transition_applied', v_transition_applied,
    'request', to_jsonb(v_request)
  );
end;
$$;

revoke all on function public.apply_external_payment_event(
  text, text, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_external_payment_event(
  text, text, uuid, text, text, timestamptz, jsonb
) to service_role;

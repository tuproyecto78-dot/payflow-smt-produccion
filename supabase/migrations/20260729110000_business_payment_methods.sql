-- Payflow SMT is an orchestrator, never a payment gateway.
-- Phase 2 supports manual external links and a PayPhone presentation adapter.
-- Real charges and public webhook transitions are intentionally disabled.

do $$
begin
  if exists (
    select 1
    from public.external_payment_requests
    where client_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'EXTERNAL_PAYMENT_INVALID_LEGACY_CLIENT_ID';
  end if;
end;
$$;

alter table public.external_payment_requests
  alter column client_id type uuid using client_id::uuid;

do $$
begin
  if exists (
    select 1
    from public.external_payment_requests r
    left join public.client_accounts c on c.id = r.client_id
    where c.id is null
  ) then
    raise exception 'EXTERNAL_PAYMENT_ORPHAN_CLIENT_ID';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_payment_requests_client_account_fkey'
  ) then
    alter table public.external_payment_requests
      add constraint external_payment_requests_client_account_fkey
      foreign key (client_id)
      references public.client_accounts(id)
      on delete restrict;
  end if;
end;
$$;

create table if not exists public.business_payment_methods (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null
    references public.client_accounts(id) on delete cascade,
  kind text not null,
  provider_code text not null,
  mode text not null,
  display_name text not null,
  external_url text,
  provider_account_reference text,
  status text not null default 'active',
  created_by uuid not null references auth.users(id) on delete restrict,
  deactivated_by uuid references auth.users(id) on delete restrict,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_payment_methods_kind_check
    check (kind in ('manual_link', 'payphone')),
  constraint business_payment_methods_provider_check
    check (provider_code ~ '^[a-z0-9_]{2,40}$'),
  constraint business_payment_methods_mode_check
    check (mode in ('manual', 'sandbox', 'presentation')),
  constraint business_payment_methods_status_check
    check (status in ('active', 'inactive')),
  constraint business_payment_methods_shape_check check (
    (
      kind = 'manual_link'
      and provider_code = 'manual_link'
      and mode = 'manual'
      and external_url ~ '^https://'
      and provider_account_reference is null
    )
    or
    (
      kind = 'payphone'
      and provider_code = 'payphone'
      and mode in ('sandbox', 'presentation')
      and external_url is null
    )
  ),
  constraint business_payment_methods_deactivation_check check (
    (status = 'active' and deactivated_by is null and deactivated_at is null)
    or
    (status = 'inactive' and deactivated_by is not null and deactivated_at is not null)
  ),
  unique (id, client_id)
);

create index if not exists idx_business_payment_methods_client
  on public.business_payment_methods(client_id, status, created_at desc);

drop trigger if exists touch_business_payment_methods
  on public.business_payment_methods;
create trigger touch_business_payment_methods
  before update on public.business_payment_methods
  for each row execute function public.touch_updated_at();

alter table public.external_payment_requests
  drop constraint if exists external_payment_provider_check;
alter table public.external_payment_requests
  alter column provider drop default;
alter table public.external_payment_requests
  alter column checkout_token_hash drop not null;

alter table public.external_payment_requests
  add column if not exists payment_method_id uuid,
  add column if not exists path_type text not null default 'provider_adapter',
  add column if not exists provider_mode text not null default 'sandbox',
  add column if not exists confirmation_mode text not null default 'legacy_webhook',
  add column if not exists real_charge boolean not null default false,
  add column if not exists confirmed_by uuid references auth.users(id) on delete restrict,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'external_payment_requests_method_fkey'
  ) then
    alter table public.external_payment_requests
      add constraint external_payment_requests_method_fkey
      foreign key (payment_method_id, client_id)
      references public.business_payment_methods(id, client_id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'external_payment_requests_id_client_unique'
  ) then
    alter table public.external_payment_requests
      add constraint external_payment_requests_id_client_unique
      unique (id, client_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'external_payment_requests_path_check'
  ) then
    alter table public.external_payment_requests
      add constraint external_payment_requests_path_check
      check (path_type in ('manual_link', 'provider_adapter'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'external_payment_requests_provider_mode_check'
  ) then
    alter table public.external_payment_requests
      add constraint external_payment_requests_provider_mode_check
      check (provider_mode in ('manual', 'sandbox', 'presentation'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'external_payment_requests_confirmation_mode_check'
  ) then
    alter table public.external_payment_requests
      add constraint external_payment_requests_confirmation_mode_check
      check (confirmation_mode in ('manual', 'presentation', 'legacy_webhook'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'external_payment_requests_real_charge_check'
  ) then
    alter table public.external_payment_requests
      add constraint external_payment_requests_real_charge_check
      check (real_charge = false);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'external_payment_requests_method_required_check'
  ) then
    alter table public.external_payment_requests
      add constraint external_payment_requests_method_required_check
      check (
        payment_method_id is not null
        or confirmation_mode = 'legacy_webhook'
      );
  end if;
end;
$$;

create index if not exists idx_external_payment_method_created
  on public.external_payment_requests(payment_method_id, created_at desc)
  where payment_method_id is not null;

create table if not exists public.external_payment_confirmation_audit (
  id uuid primary key default uuid_generate_v4(),
  payment_request_id uuid not null,
  client_id uuid not null,
  idempotency_key text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null,
  previous_status text not null,
  new_status text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint external_payment_confirmation_request_fkey
    foreign key (payment_request_id, client_id)
    references public.external_payment_requests(id, client_id)
    on delete cascade,
  constraint external_payment_confirmation_role_check
    check (actor_role in ('super_admin', 'admin', 'client_owner')),
  constraint external_payment_confirmation_previous_check
    check (previous_status = 'pending'),
  constraint external_payment_confirmation_new_check
    check (new_status in ('approved', 'rejected')),
  unique (payment_request_id, idempotency_key)
);

create index if not exists idx_external_payment_confirmation_client
  on public.external_payment_confirmation_audit(client_id, created_at desc);

create or replace function public.enforce_active_payment_business()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.client_id is null then
    raise exception 'EXTERNAL_PAYMENT_CLIENT_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.client_accounts
    where id = new.client_id
      and status = 'active'
  ) then
    raise exception 'EXTERNAL_PAYMENT_BUSINESS_INACTIVE';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_active_payment_method_business
  on public.business_payment_methods;
create trigger enforce_active_payment_method_business
  before insert or update of client_id on public.business_payment_methods
  for each row execute function public.enforce_active_payment_business();

drop trigger if exists enforce_active_payment_request_business
  on public.external_payment_requests;
create trigger enforce_active_payment_request_business
  before insert or update of client_id on public.external_payment_requests
  for each row execute function public.enforce_active_payment_business();

alter table public.business_payment_methods enable row level security;
alter table public.external_payment_confirmation_audit enable row level security;

revoke all on public.business_payment_methods from anon, authenticated;
revoke all on public.external_payment_confirmation_audit
  from anon, authenticated;
grant select, insert, update on public.business_payment_methods to service_role;
grant select, insert on public.external_payment_confirmation_audit
  to service_role;

create or replace function public.confirm_external_payment_manual(
  p_payment_request_id uuid,
  p_client_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_status text,
  p_idempotency_key text,
  p_note text,
  p_confirmed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.external_payment_requests%rowtype;
  v_existing public.external_payment_confirmation_audit%rowtype;
  v_actor_role text;
  v_actor_status text;
  v_actor_client_id text;
  v_confirmed_at timestamptz := coalesce(p_confirmed_at, now());
begin
  if p_client_id is null then
    raise exception 'EXTERNAL_PAYMENT_CLIENT_REQUIRED';
  end if;
  if p_status not in ('approved', 'rejected')
    or coalesce(trim(p_idempotency_key), '') = ''
  then
    raise exception 'EXTERNAL_PAYMENT_INVALID_CONFIRMATION';
  end if;
  if not exists (
    select 1 from public.client_accounts
    where id = p_client_id and status = 'active'
  ) then
    raise exception 'EXTERNAL_PAYMENT_BUSINESS_INACTIVE';
  end if;

  select role, status, client_id
    into v_actor_role, v_actor_status, v_actor_client_id
    from public.profiles
    where user_id = p_actor_user_id
    limit 1;

  if not found then
    raise exception 'EXTERNAL_PAYMENT_CONFIRMATION_FORBIDDEN';
  end if;
  if v_actor_role <> p_actor_role then
    raise exception 'EXTERNAL_PAYMENT_CONFIRMATION_FORBIDDEN';
  end if;
  if v_actor_role not in ('super_admin', 'admin')
    and not (
      v_actor_role = 'client_owner'
      and v_actor_status = 'active'
      and v_actor_client_id = p_client_id::text
    )
  then
    raise exception 'EXTERNAL_PAYMENT_CONFIRMATION_FORBIDDEN';
  end if;

  select *
    into v_request
    from public.external_payment_requests
    where id = p_payment_request_id
      and client_id = p_client_id
    for update;

  if not found then
    raise exception 'EXTERNAL_PAYMENT_NOT_FOUND';
  end if;
  if v_request.confirmation_mode <> 'manual' then
    raise exception 'EXTERNAL_PAYMENT_NOT_MANUAL';
  end if;

  select *
    into v_existing
    from public.external_payment_confirmation_audit
    where payment_request_id = p_payment_request_id
      and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.new_status <> p_status then
      raise exception 'EXTERNAL_PAYMENT_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'duplicate', true,
      'transition_applied', false,
      'request', to_jsonb(v_request)
    );
  end if;

  if v_request.status <> 'pending' then
    raise exception 'EXTERNAL_PAYMENT_TERMINAL';
  end if;

  insert into public.external_payment_confirmation_audit (
    payment_request_id,
    client_id,
    idempotency_key,
    actor_user_id,
    actor_role,
    previous_status,
    new_status,
    note,
    created_at
  ) values (
    p_payment_request_id,
    p_client_id,
    p_idempotency_key,
    p_actor_user_id,
    v_actor_role,
    v_request.status,
    p_status,
    nullif(trim(p_note), ''),
    v_confirmed_at
  );

  update public.external_payment_requests
    set status = p_status,
        confirmed_by = p_actor_user_id,
        confirmed_at = v_confirmed_at,
        confirmation_note = nullif(trim(p_note), ''),
        last_event_at = v_confirmed_at
    where id = p_payment_request_id
      and client_id = p_client_id
    returning * into v_request;

  return jsonb_build_object(
    'duplicate', false,
    'transition_applied', true,
    'request', to_jsonb(v_request)
  );
end;
$$;

revoke all on function public.confirm_external_payment_manual(
  uuid, uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.confirm_external_payment_manual(
  uuid, uuid, uuid, text, text, text, text, timestamptz
) to service_role;

-- Disable the legacy sandbox event transition. No webhook is exposed in this
-- phase; manual confirmation is the only state-changing integration API.
revoke execute on function public.apply_external_payment_event(
  text, text, uuid, text, text, timestamptz, jsonb
) from service_role;

-- Arandu — outbox transacional provider-agnostic
-- Aplicar depois do hardening de pedidos.
-- O endereço do destinatário é transitório: é apagado após entrega ou dead-letter.

create table if not exists public.transactional_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  template text not null,
  recipient_hash text not null,
  recipient_address text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','retry','delivered','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  provider text,
  provider_reference text,
  request_id text not null,
  idempotency_key text not null unique,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactional_email_outbox_ready
  on public.transactional_email_outbox(status, next_attempt_at, created_at)
  where status in ('pending','retry','processing');

alter table public.transactional_email_outbox enable row level security;
revoke all on public.transactional_email_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.transactional_email_outbox to service_role;

create or replace function public.enqueue_transactional_email_for_user(
  p_user_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_template text,
  p_payload jsonb,
  p_request_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_hash text;
  v_row public.transactional_email_outbox%rowtype;
begin
  if p_user_id is null then
    return jsonb_build_object('queued', false, 'reason', 'user_missing');
  end if;

  select lower(trim(email)) into v_email
  from public.profiles
  where id = p_user_id;

  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('queued', false, 'reason', 'recipient_unavailable');
  end if;

  if coalesce(length(trim(p_event_type)), 0) < 3
    or coalesce(length(trim(p_entity_type)), 0) < 2
    or coalesce(length(trim(p_entity_id)), 0) < 1
    or coalesce(length(trim(p_template)), 0) < 3
    or coalesce(length(trim(p_request_id)), 0) < 8
    or coalesce(length(trim(p_idempotency_key)), 0) < 8 then
    raise exception using message = 'Evento transacional inválido.', errcode = '22023';
  end if;

  v_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');

  insert into public.transactional_email_outbox (
    event_type, entity_type, entity_id, template,
    recipient_hash, recipient_address, payload,
    request_id, idempotency_key
  ) values (
    left(trim(p_event_type), 120),
    left(trim(p_entity_type), 80),
    left(trim(p_entity_id), 160),
    left(trim(p_template), 80),
    v_hash,
    v_email,
    coalesce(p_payload, '{}'::jsonb),
    left(trim(p_request_id), 80),
    left(trim(p_idempotency_key), 220)
  )
  on conflict (idempotency_key) do update set
    idempotency_key = excluded.idempotency_key
  returning * into v_row;

  return jsonb_build_object(
    'queued', true,
    'id', v_row.id,
    'status', v_row.status,
    'recipientRef', left(v_row.recipient_hash, 16)
  );
end;
$$;

create or replace function public.claim_transactional_email_batch(
  p_worker_ref text,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  if coalesce(length(trim(p_worker_ref)), 0) < 8 then
    raise exception using message = 'Worker inválido.', errcode = '22023';
  end if;

  with candidates as (
    select id
    from public.transactional_email_outbox
    where (
      status in ('pending','retry') and next_attempt_at <= now()
    ) or (
      status = 'processing' and claimed_at < now() - interval '10 minutes'
    )
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update public.transactional_email_outbox o
    set
      status = 'processing',
      attempts = attempts + 1,
      claimed_at = now(),
      updated_at = now(),
      last_error_code = null
    from candidates c
    where o.id = c.id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'eventType', event_type,
    'entityType', entity_type,
    'entityId', entity_id,
    'template', template,
    'recipientAddress', recipient_address,
    'recipientRef', left(recipient_hash, 16),
    'payload', payload,
    'attempts', attempts,
    'maxAttempts', max_attempts,
    'requestId', request_id
  ) order by created_at), '[]'::jsonb)
  into v_items
  from claimed;

  return v_items;
end;
$$;

create or replace function public.complete_transactional_email(
  p_id uuid,
  p_provider text,
  p_provider_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.transactional_email_outbox%rowtype;
begin
  update public.transactional_email_outbox
  set
    status = 'delivered',
    delivered_at = now(),
    provider = nullif(left(trim(p_provider), 40), ''),
    provider_reference = nullif(left(trim(p_provider_reference), 180), ''),
    recipient_address = null,
    claimed_at = null,
    updated_at = now(),
    last_error_code = null
  where id = p_id and status = 'processing'
  returning * into v_row;

  if not found then
    raise exception using message = 'Evento de e-mail não está em processamento.', errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status);
end;
$$;

create or replace function public.fail_transactional_email(
  p_id uuid,
  p_error_code text,
  p_retry_after_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.transactional_email_outbox%rowtype;
  v_dead boolean;
  v_delay integer;
begin
  select * into v_row
  from public.transactional_email_outbox
  where id = p_id
  for update;

  if not found or v_row.status <> 'processing' then
    raise exception using message = 'Evento de e-mail não está em processamento.', errcode = 'P0001';
  end if;

  v_dead := v_row.attempts >= v_row.max_attempts;
  v_delay := greatest(30, least(coalesce(p_retry_after_seconds, 60), 86400));

  update public.transactional_email_outbox
  set
    status = case when v_dead then 'dead' else 'retry' end,
    next_attempt_at = case when v_dead then next_attempt_at else now() + make_interval(secs => v_delay) end,
    claimed_at = null,
    recipient_address = case when v_dead then null else recipient_address end,
    last_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'delivery_failed'), 120),
    updated_at = now()
  where id = p_id
  returning * into v_row;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status, 'attempts', v_row.attempts);
end;
$$;

create or replace function public.enqueue_order_email_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_transactional_email_for_user(
      new.user_id,
      'order.created',
      'order',
      new.id::text,
      'order_created',
      jsonb_build_object('orderNumber', new.order_number),
      coalesce(new.request_id, 'order-' || new.id::text),
      'order.created:' || new.id::text
    );
    return new;
  end if;

  if old.payment_status is distinct from new.payment_status and new.payment_status = 'paid' then
    perform public.enqueue_transactional_email_for_user(
      new.user_id,
      'order.payment_confirmed',
      'order',
      new.id::text,
      'payment_confirmed',
      jsonb_build_object('orderNumber', new.order_number),
      coalesce(new.request_id, 'order-' || new.id::text),
      'order.payment_confirmed:' || new.id::text
    );
  end if;

  if old.fulfillment_status is distinct from new.fulfillment_status and new.fulfillment_status = 'shipped' then
    perform public.enqueue_transactional_email_for_user(
      new.user_id,
      'order.shipped',
      'order',
      new.id::text,
      'order_shipped',
      jsonb_build_object('orderNumber', new.order_number, 'trackingCode', coalesce(new.tracking_code, '')),
      coalesce(new.request_id, 'order-' || new.id::text),
      'order.shipped:' || new.id::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_transactional_email on public.orders;
create trigger trg_orders_transactional_email
after insert or update of payment_status, fulfillment_status on public.orders
for each row execute function public.enqueue_order_email_events();

revoke all on function public.enqueue_transactional_email_for_user(uuid,text,text,text,text,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.claim_transactional_email_batch(text,integer) from public, anon, authenticated;
revoke all on function public.complete_transactional_email(uuid,text,text) from public, anon, authenticated;
revoke all on function public.fail_transactional_email(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.enqueue_transactional_email_for_user(uuid,text,text,text,text,jsonb,text,text) to service_role;
grant execute on function public.claim_transactional_email_batch(text,integer) to service_role;
grant execute on function public.complete_transactional_email(uuid,text,text) to service_role;
grant execute on function public.fail_transactional_email(uuid,text,integer) to service_role;

comment on table public.transactional_email_outbox is 'Outbox transacional: destinatário é armazenado somente enquanto necessário para entrega/retry e apagado em delivered/dead.';

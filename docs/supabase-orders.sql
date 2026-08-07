-- Arandu — pedidos provider-agnostic
-- Aplicar depois de docs/supabase-transactions-rbac-audit.sql.
-- Não integra gateway de pagamento; registra o domínio do pedido pós-reserva.
-- Rollback operacional: docs/rollback/supabase-orders.rollback.sql

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default (
    'ARD-ORD-' || to_char(now(), 'YYYYMMDD') || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8)
  ),
  user_id uuid references auth.users(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete restrict,
  proposal_id uuid references public.proposals(id) on delete set null,
  commercial_record_id uuid references public.commercial_records(id) on delete set null,
  artwork_id text not null references public.artworks(id) on delete restrict,
  artist_id text references public.artists(id) on delete set null,
  price_snapshot numeric not null check (price_snapshot > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  platform_fee_rate numeric not null check (platform_fee_rate >= 0 and platform_fee_rate < 1),
  platform_fee numeric not null check (platform_fee >= 0),
  artist_amount numeric not null check (artist_amount >= 0),
  policy_version text not null,
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  status text not null default 'created'
    check (status in ('created', 'confirmed', 'completed', 'cancelled')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'awaiting_confirmation', 'paid', 'refunded', 'failed', 'cancelled')),
  fulfillment_status text not null default 'pending'
    check (fulfillment_status in ('pending', 'packing', 'shipped', 'delivered', 'returned', 'cancelled')),
  certificate_status text not null default 'pending'
    check (certificate_status in ('pending', 'ready', 'issued', 'not_applicable')),
  request_id text,
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_orders_reservation
  on public.orders(reservation_id)
  where reservation_id is not null;

create index if not exists idx_orders_user_created
  on public.orders(user_id, created_at desc);

create index if not exists idx_orders_status
  on public.orders(status, payment_status, fulfillment_status);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_arandu_audit on public.orders;
create trigger trg_arandu_audit
after insert or update or delete on public.orders
for each row execute function public.audit_privileged_mutation();

alter table public.orders enable row level security;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
on public.orders
for select
to authenticated
using (auth.uid() = user_id);

revoke all on public.orders from anon;
revoke insert, update, delete on public.orders from authenticated;
grant select on public.orders to authenticated;
grant select, insert, update, delete on public.orders to service_role;

create or replace function public.create_order_atomic(
  p_reservation_id uuid,
  p_proposal_id uuid,
  p_commercial_record_id uuid,
  p_actor_ref text,
  p_actor_role text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key_hash text,
  p_identity_hash text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
  v_artwork public.artworks%rowtype;
  v_order public.orders%rowtype;
  v_fee_rate numeric;
  v_fee numeric;
  v_artist_amount numeric;
  v_response jsonb;
begin
  if coalesce(length(trim(p_actor_ref)), 0) < 8
    or coalesce(length(trim(p_actor_role)), 0) < 3
    or coalesce(length(trim(p_request_id)), 0) < 8 then
    raise exception using message = 'Contexto operacional do pedido inválido.', errcode = '22023';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception using message = 'Reserva não encontrada.', errcode = 'P0002';
  end if;

  if v_reservation.status not in ('confirmed', 'converted') then
    raise exception using message = 'A reserva precisa estar confirmada para virar pedido.', errcode = 'P0001';
  end if;

  if coalesce(v_reservation.price_snapshot, 0) <= 0
    or v_reservation.currency !~ '^[A-Z]{3}$'
    or coalesce(length(trim(v_reservation.policy_version)), 0) < 1
    or jsonb_typeof(v_reservation.policy_snapshot) <> 'object' then
    raise exception using message = 'Snapshot comercial da reserva está incompleto.', errcode = '22023';
  end if;

  v_fee_rate := nullif(v_reservation.policy_snapshot->>'platformFeeRate', '')::numeric;
  if v_fee_rate is null or v_fee_rate < 0 or v_fee_rate >= 1 then
    raise exception using message = 'Comissão do snapshot comercial é inválida.', errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where reservation_id = p_reservation_id
  for update;

  if found then
    v_response := jsonb_build_object(
      'ok', true,
      'mode', 'stored',
      'stored', true,
      'existing', true,
      'statusCode', 200,
      'order', to_jsonb(v_order)
    );
    perform public.complete_idempotency(
      p_idempotency_scope,
      p_idempotency_key_hash,
      p_identity_hash,
      p_request_hash,
      200,
      v_response
    );
    return v_response;
  end if;

  select * into v_artwork
  from public.artworks
  where id = v_reservation.artwork_id
  for update;

  if not found then
    raise exception using message = 'Obra da reserva não encontrada.', errcode = 'P0002';
  end if;

  v_fee := round(v_reservation.price_snapshot * v_fee_rate, 2);
  v_artist_amount := round(v_reservation.price_snapshot - v_fee, 2);

  insert into public.orders (
    user_id,
    reservation_id,
    proposal_id,
    commercial_record_id,
    artwork_id,
    artist_id,
    price_snapshot,
    currency,
    platform_fee_rate,
    platform_fee,
    artist_amount,
    policy_version,
    policy_snapshot,
    request_id
  )
  values (
    v_reservation.user_id,
    p_reservation_id,
    p_proposal_id,
    p_commercial_record_id,
    v_reservation.artwork_id,
    v_artwork.artist_id,
    v_reservation.price_snapshot,
    v_reservation.currency,
    v_fee_rate,
    v_fee,
    v_artist_amount,
    v_reservation.policy_version,
    v_reservation.policy_snapshot,
    left(p_request_id, 80)
  )
  returning * into v_order;

  if v_reservation.status <> 'converted' then
    update public.reservations
    set status = 'converted', converted_at = coalesce(converted_at, now())
    where id = p_reservation_id;
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'mode', 'stored',
    'stored', true,
    'existing', false,
    'statusCode', 201,
    'order', to_jsonb(v_order)
  );

  if not public.complete_idempotency(
    p_idempotency_scope,
    p_idempotency_key_hash,
    p_identity_hash,
    p_request_hash,
    201,
    v_response
  ) then
    raise exception using message = 'Não foi possível concluir a idempotência do pedido.', errcode = 'P0001';
  end if;

  return v_response;
end;
$$;

revoke all on function public.create_order_atomic(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_order_atomic(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) to service_role;

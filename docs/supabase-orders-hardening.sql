-- Arandu — hardening aditivo do domínio de pedidos
-- Aplicar depois de docs/supabase-orders.sql.
-- Mantém a migration original intacta e adiciona state machine, histórico e imutabilidade financeira.
-- Rollback operacional: docs/rollback/supabase-orders-hardening.rollback.sql

alter table public.orders
  add column if not exists tracking_code text,
  add column if not exists shipping_provider text,
  add column if not exists shipping_updated_at timestamptz;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_ref text not null,
  actor_role text not null,
  request_id text not null,
  justification text not null,
  from_status text not null,
  to_status text not null,
  from_payment_status text not null,
  to_payment_status text not null,
  from_fulfillment_status text not null,
  to_fulfillment_status text not null,
  from_certificate_status text not null,
  to_certificate_status text not null,
  tracking_code text,
  shipping_provider text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_status_history_order_created
  on public.order_status_history(order_id, created_at desc);

alter table public.order_status_history enable row level security;
revoke all on public.order_status_history from public, anon, authenticated;
grant select, insert, update, delete on public.order_status_history to service_role;

create or replace function public.protect_order_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.reservation_id is distinct from old.reservation_id
    or new.proposal_id is distinct from old.proposal_id
    or new.commercial_record_id is distinct from old.commercial_record_id
    or new.artwork_id is distinct from old.artwork_id
    or new.artist_id is distinct from old.artist_id
    or new.price_snapshot is distinct from old.price_snapshot
    or new.currency is distinct from old.currency
    or new.platform_fee_rate is distinct from old.platform_fee_rate
    or new.platform_fee is distinct from old.platform_fee
    or new.artist_amount is distinct from old.artist_amount
    or new.policy_version is distinct from old.policy_version
    or new.policy_snapshot is distinct from old.policy_snapshot then
    raise exception using
      message = 'Campos financeiros e snapshots do pedido são imutáveis.',
      errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_immutable_fields on public.orders;
create trigger trg_orders_immutable_fields
before update on public.orders
for each row execute function public.protect_order_immutable_fields();

create or replace function public.transition_order_atomic(
  p_order_id uuid,
  p_status text,
  p_payment_status text,
  p_fulfillment_status text,
  p_certificate_status text,
  p_tracking_code text,
  p_shipping_provider text,
  p_justification text,
  p_actor_ref text,
  p_actor_role text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_next_status text;
  v_next_payment text;
  v_next_fulfillment text;
  v_next_certificate text;
  v_history public.order_status_history%rowtype;
begin
  if coalesce(length(trim(p_actor_ref)), 0) < 8
    or coalesce(length(trim(p_actor_role)), 0) < 3
    or coalesce(length(trim(p_request_id)), 0) < 8 then
    raise exception using message = 'Contexto operacional do pedido inválido.', errcode = '22023';
  end if;
  if coalesce(length(trim(p_justification)), 0) < 8 then
    raise exception using message = 'Justificativa operacional é obrigatória.', errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using message = 'Pedido não encontrado.', errcode = 'P0002';
  end if;

  v_next_status := coalesce(nullif(trim(p_status), ''), v_order.status);
  v_next_payment := coalesce(nullif(trim(p_payment_status), ''), v_order.payment_status);
  v_next_fulfillment := coalesce(nullif(trim(p_fulfillment_status), ''), v_order.fulfillment_status);
  v_next_certificate := coalesce(nullif(trim(p_certificate_status), ''), v_order.certificate_status);

  if v_next_status not in ('created', 'confirmed', 'completed', 'cancelled')
    or v_next_payment not in ('pending', 'awaiting_confirmation', 'paid', 'refunded', 'failed', 'cancelled')
    or v_next_fulfillment not in ('pending', 'packing', 'shipped', 'delivered', 'returned', 'cancelled')
    or v_next_certificate not in ('pending', 'ready', 'issued', 'not_applicable') then
    raise exception using message = 'Estado de pedido inválido.', errcode = '22023';
  end if;

  if v_next_status <> v_order.status and not (
    (v_order.status = 'created' and v_next_status in ('confirmed', 'cancelled'))
    or (v_order.status = 'confirmed' and v_next_status in ('completed', 'cancelled'))
  ) then
    raise exception using message = 'Transição de status do pedido não permitida.', errcode = 'P0001';
  end if;

  if v_next_payment <> v_order.payment_status and not (
    (v_order.payment_status = 'pending' and v_next_payment in ('awaiting_confirmation', 'paid', 'failed', 'cancelled'))
    or (v_order.payment_status = 'awaiting_confirmation' and v_next_payment in ('paid', 'failed', 'cancelled'))
    or (v_order.payment_status = 'failed' and v_next_payment in ('awaiting_confirmation', 'cancelled'))
    or (v_order.payment_status = 'paid' and v_next_payment = 'refunded')
  ) then
    raise exception using message = 'Transição de pagamento não permitida.', errcode = 'P0001';
  end if;

  if v_next_fulfillment <> v_order.fulfillment_status and not (
    (v_order.fulfillment_status = 'pending' and v_next_fulfillment in ('packing', 'cancelled'))
    or (v_order.fulfillment_status = 'packing' and v_next_fulfillment in ('shipped', 'cancelled'))
    or (v_order.fulfillment_status = 'shipped' and v_next_fulfillment in ('delivered', 'returned'))
    or (v_order.fulfillment_status = 'delivered' and v_next_fulfillment = 'returned')
  ) then
    raise exception using message = 'Transição logística não permitida.', errcode = 'P0001';
  end if;

  if v_next_certificate <> v_order.certificate_status and not (
    (v_order.certificate_status = 'pending' and v_next_certificate in ('ready', 'not_applicable'))
    or (v_order.certificate_status = 'ready' and v_next_certificate = 'issued')
  ) then
    raise exception using message = 'Transição de certificado não permitida.', errcode = 'P0001';
  end if;

  if v_next_fulfillment in ('shipped', 'delivered') and v_next_payment <> 'paid' then
    raise exception using message = 'Pedido só pode ser enviado após pagamento confirmado.', errcode = 'P0001';
  end if;

  if v_next_status = 'completed' and (
    v_next_payment <> 'paid'
    or v_next_fulfillment <> 'delivered'
    or v_next_certificate not in ('issued', 'not_applicable')
  ) then
    raise exception using message = 'Pedido só pode ser concluído após pagamento, entrega e certificado.', errcode = 'P0001';
  end if;

  if v_next_status = v_order.status
    and v_next_payment = v_order.payment_status
    and v_next_fulfillment = v_order.fulfillment_status
    and v_next_certificate = v_order.certificate_status
    and coalesce(trim(p_tracking_code), '') = coalesce(v_order.tracking_code, '')
    and coalesce(trim(p_shipping_provider), '') = coalesce(v_order.shipping_provider, '') then
    raise exception using message = 'Nenhuma transição efetiva foi solicitada.', errcode = '22023';
  end if;

  insert into public.order_status_history (
    order_id, actor_ref, actor_role, request_id, justification,
    from_status, to_status,
    from_payment_status, to_payment_status,
    from_fulfillment_status, to_fulfillment_status,
    from_certificate_status, to_certificate_status,
    tracking_code, shipping_provider
  ) values (
    v_order.id,
    left(trim(p_actor_ref), 120),
    left(trim(p_actor_role), 80),
    left(trim(p_request_id), 80),
    left(trim(p_justification), 500),
    v_order.status, v_next_status,
    v_order.payment_status, v_next_payment,
    v_order.fulfillment_status, v_next_fulfillment,
    v_order.certificate_status, v_next_certificate,
    nullif(left(trim(p_tracking_code), 160), ''),
    nullif(left(trim(p_shipping_provider), 120), '')
  ) returning * into v_history;

  update public.orders
  set
    status = v_next_status,
    payment_status = v_next_payment,
    fulfillment_status = v_next_fulfillment,
    certificate_status = v_next_certificate,
    tracking_code = coalesce(nullif(left(trim(p_tracking_code), 160), ''), tracking_code),
    shipping_provider = coalesce(nullif(left(trim(p_shipping_provider), 120), ''), shipping_provider),
    shipping_updated_at = case
      when coalesce(trim(p_tracking_code), '') <> '' or coalesce(trim(p_shipping_provider), '') <> ''
        or v_next_fulfillment <> fulfillment_status then now()
      else shipping_updated_at
    end,
    paid_at = case when v_next_payment = 'paid' then coalesce(paid_at, now()) else paid_at end,
    refunded_at = case when v_next_payment = 'refunded' then coalesce(refunded_at, now()) else refunded_at end,
    cancelled_at = case when v_next_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
    completed_at = case when v_next_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
    request_id = left(trim(p_request_id), 80)
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'mode', 'stored',
    'stored', true,
    'order', to_jsonb(v_order),
    'transition', to_jsonb(v_history)
  );
end;
$$;

revoke all on function public.transition_order_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.transition_order_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text
) to service_role;

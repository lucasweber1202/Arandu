-- Arandu — hardening aditivo do domínio de pedidos
-- Aplicar depois de docs/supabase-order-state-machine.sql.
-- Estende a state machine da PR #38 sem remover suas invariantes.
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
revoke all on public.order_status_history from public, anon, authenticated, service_role;
grant select, insert on public.order_status_history to service_role;

create or replace function public.protect_order_history_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using message = 'Histórico de pedido é append-only.', errcode = '22023';
end;
$$;

drop trigger if exists trg_order_status_history_append_only on public.order_status_history;
create trigger trg_order_status_history_append_only
before update or delete on public.order_status_history
for each row execute function public.protect_order_history_append_only();

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
  v_status text;
  v_payment text;
  v_fulfillment text;
  v_certificate text;
  v_tracking text;
  v_shipping_provider text;
  v_history public.order_status_history%rowtype;
begin
  if coalesce(length(trim(p_actor_ref)), 0) < 8
    or coalesce(length(trim(p_actor_role)), 0) < 3
    or coalesce(length(trim(p_request_id)), 0) < 8 then
    raise exception using message = 'Contexto operacional inválido.', errcode = '22023';
  end if;
  if coalesce(length(trim(p_justification)), 0) < 8 then
    raise exception using message = 'Justificativa operacional é obrigatória.', errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using message = 'Pedido não encontrado.', errcode = 'P0002';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), v_order.status);
  v_payment := coalesce(nullif(trim(p_payment_status), ''), v_order.payment_status);
  v_fulfillment := coalesce(nullif(trim(p_fulfillment_status), ''), v_order.fulfillment_status);
  v_certificate := coalesce(nullif(trim(p_certificate_status), ''), v_order.certificate_status);
  v_tracking := coalesce(nullif(left(trim(p_tracking_code), 160), ''), v_order.tracking_code);
  v_shipping_provider := coalesce(nullif(left(trim(p_shipping_provider), 120), ''), v_order.shipping_provider);

  if v_status not in ('created', 'confirmed', 'completed', 'cancelled')
    or v_payment not in ('pending', 'awaiting_confirmation', 'paid', 'refunded', 'failed', 'cancelled')
    or v_fulfillment not in ('pending', 'packing', 'shipped', 'delivered', 'returned', 'cancelled')
    or v_certificate not in ('pending', 'ready', 'issued', 'not_applicable') then
    raise exception using message = 'Estado de pedido inválido.', errcode = '22023';
  end if;

  if v_status <> v_order.status and not (
    (v_order.status = 'created' and v_status in ('confirmed', 'cancelled')) or
    (v_order.status = 'confirmed' and v_status in ('completed', 'cancelled'))
  ) then
    raise exception using message = 'Transição de status do pedido inválida.', errcode = '22023';
  end if;

  if v_payment <> v_order.payment_status and not (
    (v_order.payment_status = 'pending' and v_payment in ('awaiting_confirmation', 'paid', 'failed', 'cancelled')) or
    (v_order.payment_status = 'awaiting_confirmation' and v_payment in ('paid', 'failed', 'cancelled')) or
    (v_order.payment_status = 'failed' and v_payment in ('awaiting_confirmation', 'cancelled')) or
    (v_order.payment_status = 'paid' and v_payment = 'refunded')
  ) then
    raise exception using message = 'Transição de pagamento inválida.', errcode = '22023';
  end if;

  if v_fulfillment <> v_order.fulfillment_status and not (
    (v_order.fulfillment_status = 'pending' and v_fulfillment in ('packing', 'cancelled')) or
    (v_order.fulfillment_status = 'packing' and v_fulfillment in ('shipped', 'cancelled')) or
    (v_order.fulfillment_status = 'shipped' and v_fulfillment in ('delivered', 'returned')) or
    (v_order.fulfillment_status = 'delivered' and v_fulfillment = 'returned')
  ) then
    raise exception using message = 'Transição logística inválida.', errcode = '22023';
  end if;

  if v_certificate <> v_order.certificate_status and not (
    (v_order.certificate_status = 'pending' and v_certificate in ('ready', 'not_applicable')) or
    (v_order.certificate_status = 'ready' and v_certificate = 'issued')
  ) then
    raise exception using message = 'Transição de certificado inválida.', errcode = '22023';
  end if;

  if v_status = 'cancelled' and (
    v_payment not in ('pending', 'failed', 'refunded', 'cancelled') or
    v_fulfillment not in ('pending', 'returned', 'cancelled') or
    v_certificate = 'issued'
  ) then
    raise exception using message = 'Pedido não pode ser cancelado no estado operacional atual.', errcode = '23514';
  end if;
  if v_payment = 'paid' and v_status not in ('confirmed', 'completed') then
    raise exception using message = 'Pagamento pago exige pedido confirmado.', errcode = '23514';
  end if;
  if v_fulfillment in ('packing', 'shipped', 'delivered') and (v_payment <> 'paid' or v_status not in ('confirmed', 'completed')) then
    raise exception using message = 'Fulfillment exige pedido confirmado e pagamento pago.', errcode = '23514';
  end if;
  if v_certificate = 'ready' and v_payment <> 'paid' then
    raise exception using message = 'Certificado pronto exige pagamento pago.', errcode = '23514';
  end if;
  if v_certificate = 'issued' and (v_payment <> 'paid' or v_fulfillment <> 'delivered') then
    raise exception using message = 'Emissão do certificado exige pagamento e entrega.', errcode = '23514';
  end if;
  if v_status = 'completed' and (
    v_payment <> 'paid' or v_fulfillment <> 'delivered' or v_certificate not in ('issued', 'not_applicable')
  ) then
    raise exception using message = 'Conclusão exige pagamento, entrega e certificado resolvido.', errcode = '23514';
  end if;

  if v_status = v_order.status
    and v_payment = v_order.payment_status
    and v_fulfillment = v_order.fulfillment_status
    and v_certificate = v_order.certificate_status
    and v_tracking is not distinct from v_order.tracking_code
    and v_shipping_provider is not distinct from v_order.shipping_provider then
    raise exception using message = 'Nenhuma transição efetiva foi solicitada.', errcode = '22023';
  end if;

  perform set_config('request.headers', jsonb_build_object(
    'arandu-actor-type', 'admin',
    'arandu-actor-id', left(p_actor_ref, 160),
    'arandu-actor-role', left(p_actor_role, 40),
    'arandu-request-id', left(p_request_id, 80),
    'arandu-justification', left(p_justification, 500)
  )::text, true);

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
    v_order.status, v_status,
    v_order.payment_status, v_payment,
    v_order.fulfillment_status, v_fulfillment,
    v_order.certificate_status, v_certificate,
    v_tracking, v_shipping_provider
  ) returning * into v_history;

  update public.orders
  set status = v_status,
      payment_status = v_payment,
      fulfillment_status = v_fulfillment,
      certificate_status = v_certificate,
      tracking_code = v_tracking,
      shipping_provider = v_shipping_provider,
      shipping_updated_at = case
        when v_tracking is distinct from tracking_code
          or v_shipping_provider is distinct from shipping_provider
          or v_fulfillment is distinct from fulfillment_status then now()
        else shipping_updated_at
      end,
      paid_at = case when v_payment = 'paid' then coalesce(paid_at, now()) else paid_at end,
      refunded_at = case when v_payment = 'refunded' then coalesce(refunded_at, now()) else refunded_at end,
      completed_at = case when v_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
      cancelled_at = case when v_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
      request_id = left(p_request_id, 80)
  where id = p_order_id
  returning * into v_order;

  if v_status = 'completed' then
    update public.artworks set status = 'sold', updated_at = now() where id = v_order.artwork_id;
  elsif v_status = 'cancelled' then
    update public.artworks set status = 'available', updated_at = now()
    where id = v_order.artwork_id
      and not exists (
        select 1 from public.reservations r
        where r.artwork_id = v_order.artwork_id and r.status in ('requested', 'confirmed')
      );
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', 'stored',
    'stored', true,
    'order', to_jsonb(v_order),
    'transition', to_jsonb(v_history)
  );
end;
$$;

-- A assinatura antiga da PR #38 permanece instalada apenas para rollback,
-- mas não pode ser usada enquanto o hardening enriquecido estiver ativo.
revoke all on function public.transition_order_atomic(uuid, text, text, text, text, text, text, text)
from public, anon, authenticated, service_role;

revoke all on function public.transition_order_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.transition_order_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text
) to service_role;

comment on function public.transition_order_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text
) is 'Aplica transições válidas sob lock, exige justificativa, registra histórico e preserva invariantes financeiras/logísticas.';

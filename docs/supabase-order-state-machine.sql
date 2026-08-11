-- Arandu — máquina de estados transacional de pedidos
-- Aplicar depois de docs/supabase-orders.sql.

create or replace function public.transition_order_atomic(
  p_order_id uuid,
  p_status text,
  p_payment_status text,
  p_fulfillment_status text,
  p_certificate_status text,
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
begin
  if coalesce(length(trim(p_actor_ref)), 0) < 8
    or coalesce(length(trim(p_actor_role)), 0) < 3
    or coalesce(length(trim(p_request_id)), 0) < 8 then
    raise exception using message = 'Contexto operacional inválido.', errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using message = 'Pedido não encontrado.', errcode = 'P0002';
  end if;

  v_status := coalesce(p_status, v_order.status);
  v_payment := coalesce(p_payment_status, v_order.payment_status);
  v_fulfillment := coalesce(p_fulfillment_status, v_order.fulfillment_status);
  v_certificate := coalesce(p_certificate_status, v_order.certificate_status);

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

  perform set_config('request.headers', jsonb_build_object(
    'arandu-actor-type', 'admin',
    'arandu-actor-id', left(p_actor_ref, 160),
    'arandu-actor-role', left(p_actor_role, 40),
    'arandu-request-id', left(p_request_id, 80)
  )::text, true);

  update public.orders
  set status = v_status,
      payment_status = v_payment,
      fulfillment_status = v_fulfillment,
      certificate_status = v_certificate,
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

  return jsonb_build_object('ok', true, 'stored', true, 'order', to_jsonb(v_order));
end;
$$;

revoke all on function public.transition_order_atomic(uuid, text, text, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.transition_order_atomic(uuid, text, text, text, text, text, text, text)
to service_role;

comment on function public.transition_order_atomic(uuid, text, text, text, text, text, text, text) is
  'Aplica transições válidas de pedido, pagamento, fulfillment e certificado sob lock.';

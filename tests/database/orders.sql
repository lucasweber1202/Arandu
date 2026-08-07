\set ON_ERROR_STOP on

-- Requer tests/database/transactions.sql executado antes: usuário A e obra-2 já existem.

do $$
begin
  if has_table_privilege('anon', 'public.orders', 'SELECT')
    or has_table_privilege('anon', 'public.order_status_history', 'SELECT') then
    raise exception 'anon ainda consegue consultar pedidos ou histórico';
  end if;
  if has_table_privilege('authenticated', 'public.orders', 'UPDATE')
    or has_table_privilege('authenticated', 'public.order_status_history', 'INSERT') then
    raise exception 'authenticated ainda consegue alterar pedidos ou histórico diretamente';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.transition_order_atomic(uuid,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role não pode executar transition_order_atomic';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.transition_order_atomic(uuid,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated pode executar transition_order_atomic';
  end if;
end;
$$;

select public.acquire_idempotency(
  'reservation.order-test',
  repeat('1', 64),
  repeat('2', 64),
  repeat('3', 64),
  120,
  86400
);

select public.create_reservation_atomic(
  'obra-2',
  '11111111-1111-4111-8111-111111111111',
  null,
  'Pessoa A',
  '21999999999',
  '24 horas',
  null,
  now() + interval '24 hours',
  'BRL',
  'policy-order-v1',
  '{"version":"policy-order-v1","currency":"BRL","platformFeeRate":0.20,"reservationHours":24,"references":{"payment":"payment-test","shipping":"shipping-test","packaging":"packaging-test","insurance":"insurance-test","cancellation":"cancel-test","returns":"return-test","damage":"damage-test","certificate":"certificate-test","fiscalModel":"fiscal-test"}}'::jsonb,
  'database-test',
  'user',
  '11111111-1111-4111-8111-111111111111',
  'request-order-reservation',
  'reservation.order-test',
  repeat('1', 64),
  repeat('2', 64),
  repeat('3', 64)
);

update public.reservations
set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now())
where artwork_id = 'obra-2' and user_id = '11111111-1111-4111-8111-111111111111';

select public.acquire_idempotency(
  'orders.create',
  repeat('4', 64),
  repeat('5', 64),
  repeat('6', 64),
  120,
  86400
);

select public.create_order_atomic(
  (select id from public.reservations where artwork_id = 'obra-2' order by created_at desc limit 1),
  null,
  null,
  'database-operator',
  'operator',
  'request-order-create',
  'orders.create',
  repeat('4', 64),
  repeat('5', 64),
  repeat('6', 64)
);

do $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1;
  if v_order.price_snapshot <> 2000
    or v_order.currency <> 'BRL'
    or v_order.platform_fee_rate <> 0.20
    or v_order.platform_fee <> 400
    or v_order.artist_amount <> 1600 then
    raise exception 'Pedido não preservou cálculo financeiro oficial: %', row_to_json(v_order);
  end if;
  if v_order.policy_version <> 'policy-order-v1' then
    raise exception 'Pedido não congelou versão da política comercial';
  end if;
  if v_order.policy_snapshot->'references'->>'packaging' <> 'packaging-test' then
    raise exception 'Pedido perdeu referência de política de embalagem';
  end if;
end;
$$;

do $$
declare
  v_order_id uuid;
begin
  select id into v_order_id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1;
  begin
    update public.orders set price_snapshot = 1 where id = v_order_id;
    raise exception 'Snapshot financeiro pôde ser alterado diretamente';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1),
  'confirmed', null, null, null, null, null,
  'Confirmação operacional do pedido', 'database-operator', 'operator', 'request-order-confirm'
);

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1),
  null, 'awaiting_confirmation', null, null, null, null,
  'Pagamento encaminhado para confirmação', 'database-operator', 'operator', 'request-order-await-payment'
);

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1),
  null, 'paid', null, null, null, null,
  'Pagamento confirmado pela operação', 'database-operator', 'operator', 'request-order-paid'
);

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1),
  null, null, 'packing', null, null, 'transportadora-teste',
  'Obra liberada para preparação logística', 'database-operator', 'operator', 'request-order-packing'
);

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1),
  null, null, 'shipped', null, 'TRACK-TEST-001', 'transportadora-teste',
  'Obra entregue à transportadora', 'database-operator', 'operator', 'request-order-shipped'
);

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1),
  null, null, 'delivered', null, null, null,
  'Entrega confirmada pela operação', 'database-operator', 'operator', 'request-order-delivered'
);

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1),
  null, null, null, 'ready', null, null,
  'Certificado revisado e pronto', 'database-operator', 'operator', 'request-order-cert-ready'
);

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1),
  null, null, null, 'issued', null, null,
  'Certificado emitido ao comprador', 'database-operator', 'operator', 'request-order-cert-issued'
);

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1),
  'completed', null, null, null, null, null,
  'Pedido concluído após entrega e certificado', 'database-operator', 'operator', 'request-order-complete'
);

do $$
declare
  v_order public.orders%rowtype;
  v_order_id uuid;
begin
  select * into v_order from public.orders where artwork_id = 'obra-2' order by created_at desc limit 1;
  v_order_id := v_order.id;
  if v_order.status <> 'completed'
    or v_order.payment_status <> 'paid'
    or v_order.fulfillment_status <> 'delivered'
    or v_order.certificate_status <> 'issued' then
    raise exception 'State machine não chegou ao estado final esperado: %', row_to_json(v_order);
  end if;
  if v_order.paid_at is null or v_order.completed_at is null or v_order.shipping_updated_at is null then
    raise exception 'Timestamps operacionais não foram registrados';
  end if;
  if v_order.tracking_code <> 'TRACK-TEST-001' then
    raise exception 'Tracking não foi preservado';
  end if;
  if (select count(*) from public.order_status_history where order_id = v_order_id) <> 9 then
    raise exception 'Histórico de pedido incompleto';
  end if;
  begin
    perform public.transition_order_atomic(
      v_order_id,
      'created', null, null, null, null, null,
      'Tentativa inválida de regressão de estado', 'database-operator', 'operator', 'request-order-regression'
    );
    raise exception 'Pedido concluído aceitou regressão para created';
  exception
    when sqlstate 'P0001' then null;
  end;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$
begin
  if (select count(*) from public.orders) <> 1 then
    raise exception 'Pessoa A não enxerga exatamente o próprio pedido';
  end if;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
begin
  if (select count(*) from public.orders) <> 0 then
    raise exception 'Pessoa B conseguiu ler pedido da Pessoa A';
  end if;
end;
$$;
reset role;

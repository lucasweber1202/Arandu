\set ON_ERROR_STOP on

-- A reserva criada na suíte transacional foi expirada; crie outra para a obra 2.
select public.acquire_idempotency(
  'reservation.order-test', repeat('1', 64), repeat('2', 64), repeat('3', 64), 120, 86400
);
select public.create_reservation_atomic(
  'obra-2', '11111111-1111-4111-8111-111111111111', null,
  'Pessoa A', '21999999999', '24 horas', null, now() + interval '24 hours',
  'BRL', 'policy-test-v1',
  '{"version":"policy-test-v1","currency":"BRL","platformFeeRate":0.20,"reservationHours":24}'::jsonb,
  'database-test', 'user', '11111111-1111-4111-8111-111111111111', 'request-order-reservation',
  'reservation.order-test', repeat('1', 64), repeat('2', 64), repeat('3', 64)
);
update public.reservations set status = 'confirmed'
where artwork_id = 'obra-2' and status = 'requested';

select public.acquire_idempotency(
  'orders.create', repeat('4', 64), repeat('5', 64), repeat('6', 64), 120, 86400
);
select public.create_order_atomic(
  (select id from public.reservations where artwork_id = 'obra-2' and status = 'confirmed'),
  null, null, 'database-operator', 'operator', 'request-order-create',
  'orders.create', repeat('4', 64), repeat('5', 64), repeat('6', 64)
);

do $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where artwork_id = 'obra-2';
  if v_order.price_snapshot <> 2000 or v_order.platform_fee <> 400 or v_order.artist_amount <> 1600 then
    raise exception 'Pedido não preservou o snapshot comercial: %', row_to_json(v_order);
  end if;
  if (select count(*) from public.orders where reservation_id = v_order.reservation_id) <> 1 then
    raise exception 'Reserva gerou mais de um pedido';
  end if;
  if (public.acquire_idempotency(
    'orders.create', repeat('4', 64), repeat('5', 64), repeat('6', 64), 120, 86400
  )->>'outcome') <> 'replay' then
    raise exception 'Replay de pedido não devolveu resposta persistida';
  end if;
  begin
    perform public.transition_order_atomic(
      v_order.id, 'completed', null, null, null,
      'database-operator', 'operator', 'request-invalid-complete'
    );
    raise exception 'Pedido incompleto foi concluído';
  exception when check_violation then null;
  end;
end;
$$;

select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2'),
  'confirmed', 'paid', 'packing', 'ready',
  'database-operator', 'operator', 'request-order-confirm'
);
select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2'),
  null, null, 'shipped', null,
  'database-operator', 'operator', 'request-order-ship'
);
select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2'),
  null, null, 'delivered', 'issued',
  'database-operator', 'operator', 'request-order-deliver'
);
select public.transition_order_atomic(
  (select id from public.orders where artwork_id = 'obra-2'),
  'completed', null, null, null,
  'database-operator', 'operator', 'request-order-complete'
);

do $$
begin
  if (select status from public.artworks where id = 'obra-2') <> 'sold' then
    raise exception 'Conclusão do pedido não marcou a obra como vendida';
  end if;
  if (select completed_at is null from public.orders where artwork_id = 'obra-2') then
    raise exception 'Conclusão não registrou timestamp';
  end if;
  if not exists (select 1 from public.audit_logs where entity_type = 'orders') then
    raise exception 'Transições de pedido não foram auditadas';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
begin
  if exists (select 1 from public.orders) then
    raise exception 'Pessoa B acessou pedido da Pessoa A';
  end if;
end;
$$;
reset role;

\set ON_ERROR_STOP on

do $$
declare
  v_order_id uuid;
begin
  select id into v_order_id
  from public.orders
  where artwork_id = 'obra-order-test'
  order by created_at desc
  limit 1;

  if has_function_privilege(
    'service_role',
    'public.transition_order_atomic(uuid,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Assinatura antiga da state machine continua executável durante o hardening';
  end if;

  if has_table_privilege('service_role', 'public.order_status_history', 'UPDATE')
    or has_table_privilege('service_role', 'public.order_status_history', 'DELETE') then
    raise exception 'Histórico de pedidos não está append-only para service_role';
  end if;

  if (select status from public.artworks where id = 'obra-order-test') <> 'sold' then
    raise exception 'Conclusão do pedido não marcou a obra como vendida';
  end if;

  begin
    perform public.transition_order_atomic(
      v_order_id,
      null, 'refunded', null, null, null, null,
      'Tentativa de reembolso mantendo pedido concluído',
      'database-operator', 'operator', 'request-order-invalid-refund'
    );
    raise exception 'Pedido concluído aceitou pagamento incompatível';
  exception
    when sqlstate '23514' then null;
  end;
end;
$$;

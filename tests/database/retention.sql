\set ON_ERROR_STOP on

do $$
begin
  if has_table_privilege('anon', 'public.data_retention_policies', 'SELECT')
    or has_table_privilege('authenticated', 'public.data_legal_holds', 'SELECT') then
    raise exception 'Controles de retenção estão expostos a clientes';
  end if;
  if not has_function_privilege('service_role', 'public.create_legal_hold(text,text,text,text)', 'EXECUTE') then
    raise exception 'service_role não pode criar legal hold';
  end if;
  if has_function_privilege('authenticated', 'public.create_legal_hold(text,text,text,text)', 'EXECUTE') then
    raise exception 'authenticated consegue criar legal hold';
  end if;
end;
$$;

insert into public.data_retention_policies(data_class, disposition, enabled)
values ('orders', 'review', false)
on conflict (data_class) do nothing;

do $$
begin
  begin
    insert into public.data_retention_policies(
      data_class, retention_days, disposition, enabled, decision_reference, approved_by_ref, approved_at
    ) values ('orders-invalid', null, 'delete', true, 'decision-123', 'legal', now());
    raise exception 'Política ativa sem prazo foi aceita';
  exception
    when check_violation then null;
  end;
end;
$$;

select public.create_legal_hold(
  'orders',
  (select id::text from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1),
  'legal-case-2026-001',
  'legal-operator'
);

do $$
declare
  v_id text;
begin
  select id::text into v_id from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1;
  if not public.is_under_legal_hold('orders', v_id) then
    raise exception 'Legal hold ativo não foi detectado';
  end if;
end;
$$;

select public.release_legal_hold(
  'orders',
  (select id::text from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1),
  'legal-release-2026-001',
  'legal-operator'
);

do $$
declare
  v_id text;
begin
  select id::text into v_id from public.orders where artwork_id='obra-order-test' order by created_at desc limit 1;
  if public.is_under_legal_hold('orders', v_id) then
    raise exception 'Legal hold liberado continua ativo';
  end if;
end;
$$;

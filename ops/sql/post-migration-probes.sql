\set ON_ERROR_STOP on

begin;

do $$
begin
  if exists (
    select 1
    from public.reservations
    where status in ('requested', 'confirmed')
    group by artwork_id
    having count(*) > 1
  ) then
    raise exception 'Há reservas ativas duplicadas após a migration.';
  end if;

  if has_table_privilege('anon', 'public.reservations', 'INSERT')
    or has_table_privilege('authenticated', 'public.reservations', 'INSERT') then
    raise exception 'Escrita direta de reservas continua aberta.';
  end if;

  if has_table_privilege('anon', 'public.proposals', 'SELECT')
    or has_table_privilege('anon', 'public.audit_logs', 'SELECT') then
    raise exception 'Tabela privada está visível para anon.';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.create_reservation_atomic(text,uuid,text,text,text,text,text,timestamptz,text,text,jsonb,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role não pode executar a RPC de reserva.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.create_reservation_atomic(text,uuid,text,text,text,text,text,timestamptz,text,text,jsonb,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated pode contornar a API e executar a RPC de reserva.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'uq_reservations_one_active_artwork'
  ) then
    raise exception 'Índice único de reserva ativa ausente.';
  end if;
end;
$$;

select public.expire_reservations(true, 'release-probe', 'release-probe');
select public.cleanup_idempotency(true);

rollback;

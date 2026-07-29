\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'a@example.com', '{"full_name":"Pessoa A"}'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.com', '{"full_name":"Pessoa B"}')
on conflict (id) do nothing;

insert into public.artists (
  id, name, slug, status, identity_verified, publishing_consent_at,
  verified_at, source_reference, editorial_status
)
values (
  'artista-1', 'Artista 1', 'artista-1', 'published', true, now(),
  now(), 'database-test', 'published'
)
on conflict (id) do update set status = excluded.status;

insert into public.artworks (
  id, slug, title, artist_id, price, status, published, main_image_url,
  image_authorized_at, price_verified_at, availability_verified_at,
  catalog_verified_at, source_reference, editorial_status
)
values
  ('obra-1', 'obra-1', 'Obra 1', 'artista-1', 5000, 'available', true, 'https://example.com/1.webp', now(), now(), now(), now(), 'database-test', 'published'),
  ('obra-2', 'obra-2', 'Obra 2', 'artista-1', 2000, 'available', true, 'https://example.com/2.webp', now(), now(), now(), now(), 'database-test', 'published')
on conflict (id) do update set price = excluded.price, status = 'available', published = true;

insert into public.leads (id, user_id, name, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Lead A', 'new'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Lead B', 'new')
on conflict (id) do nothing;

insert into public.saved_selections (id, user_id, name, status, items)
values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Seleção A', 'open', '[]'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Seleção B', 'open', '[]')
on conflict (id) do nothing;

do $$
begin
  if has_table_privilege('anon', 'public.reservations', 'INSERT') then
    raise exception 'anon ainda pode inserir reservas diretamente';
  end if;
  if has_table_privilege('authenticated', 'public.proposals', 'INSERT') then
    raise exception 'authenticated ainda pode inserir propostas diretamente';
  end if;
  if has_table_privilege('authenticated', 'public.saved_selections', 'UPDATE') then
    raise exception 'authenticated ainda pode alterar seleção diretamente e contornar a API';
  end if;
  if has_table_privilege('anon', 'public.audit_logs', 'SELECT')
    or has_table_privilege('anon', 'public.commercial_records', 'SELECT')
    or has_table_privilege('anon', 'public.privacy_requests', 'SELECT') then
    raise exception 'anon ainda pode consultar tabela interna';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.create_reservation_atomic(text,uuid,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role não pode executar reserva atômica';
  end if;
  if has_function_privilege(
    'anon',
    'public.create_reservation_atomic(text,uuid,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'anon pode executar reserva atômica';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$
begin
  if (select count(*) from public.leads) <> 1 then
    raise exception 'RLS não isolou os leads da Pessoa A';
  end if;
  if exists (select 1 from public.leads where user_id = '22222222-2222-4222-8222-222222222222') then
    raise exception 'Pessoa A leu lead da Pessoa B';
  end if;
  if (select count(*) from public.saved_selections) <> 1 then
    raise exception 'RLS não isolou as seleções da Pessoa A';
  end if;
  if exists (
    select 1 from public.saved_selections
    where user_id = '22222222-2222-4222-8222-222222222222'
  ) then
    raise exception 'Pessoa A leu seleção da Pessoa B';
  end if;
end;
$$;
reset role;

select public.acquire_idempotency(
  'proposal.create',
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  120,
  86400
);

select public.create_proposal_atomic(
  array['obra-1', 'obra-2'],
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  null,
  'Cliente teste',
  'Sala',
  'Curadoria',
  'Até 10 mil',
  '30 dias',
  null,
  'BRL',
  0.20,
  'policy-test-v1',
  'user',
  '11111111-1111-4111-8111-111111111111',
  'request-proposal-1',
  'proposal.create',
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64)
);

do $$
declare
  v_proposal public.proposals%rowtype;
  v_replay jsonb;
begin
  select * into v_proposal from public.proposals order by created_at desc limit 1;
  if v_proposal.total <> 7000 or v_proposal.platform_fee <> 1400 or v_proposal.artist_amount <> 5600 then
    raise exception 'Proposta não calculou valores oficiais: %', row_to_json(v_proposal);
  end if;
  if (select count(*) from public.proposal_items where proposal_id = v_proposal.id) <> 2 then
    raise exception 'Itens da proposta não foram criados atomicamente';
  end if;
  if not exists (
    select 1 from public.idempotency_keys
    where scope = 'proposal.create' and key_hash = repeat('a', 64) and status = 'completed'
  ) then
    raise exception 'Idempotência da proposta não foi concluída';
  end if;
  v_replay := public.acquire_idempotency(
    'proposal.create', repeat('a', 64), repeat('b', 64), repeat('c', 64), 120, 86400
  );
  if v_replay->>'outcome' <> 'replay' then
    raise exception 'Operação concluída não reproduziu a resposta: %', v_replay;
  end if;
  if (
    public.acquire_idempotency(
      'proposal.create', repeat('a', 64), repeat('9', 64), repeat('c', 64), 120, 86400
    )->>'outcome'
  ) <> 'identity_conflict' then
    raise exception 'Idempotência aceitou outra identidade';
  end if;
  if (
    public.acquire_idempotency(
      'proposal.create', repeat('a', 64), repeat('b', 64), repeat('8', 64), 120, 86400
    )->>'outcome'
  ) <> 'payload_conflict' then
    raise exception 'Idempotência aceitou payload diferente';
  end if;
end;
$$;

select public.acquire_idempotency(
  'proposal.rollback',
  repeat('7', 64),
  repeat('6', 64),
  repeat('5', 64),
  120,
  86400
);

do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.proposals;
  begin
    perform public.create_proposal_atomic(
      array['obra-1', 'obra-inexistente'],
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      null,
      'Cliente rollback',
      null, null, null, null, null,
      'BRL',
      0.20,
      'policy-test-v1',
      'user',
      '11111111-1111-4111-8111-111111111111',
      'request-proposal-rollback',
      'proposal.rollback',
      repeat('7', 64),
      repeat('6', 64),
      repeat('5', 64)
    );
    raise exception 'Proposta com obra inexistente foi aceita';
  exception
    when sqlstate 'P0001' then null;
  end;
  select count(*) into v_after from public.proposals;
  if v_after <> v_before then
    raise exception 'Falha de proposta deixou registro parcial';
  end if;
end;
$$;

select public.acquire_idempotency(
  'reservation.create',
  repeat('d', 64),
  repeat('e', 64),
  repeat('f', 64),
  120,
  86400
);

select public.create_reservation_atomic(
  'obra-1',
  '11111111-1111-4111-8111-111111111111',
  null,
  'Pessoa A',
  '21999999999',
  '24 horas',
  null,
  now() + interval '24 hours',
  'BRL',
  'policy-test-v1',
  'database-test',
  'user',
  '11111111-1111-4111-8111-111111111111',
  'request-reservation-1',
  'reservation.create',
  repeat('d', 64),
  repeat('e', 64),
  repeat('f', 64)
);

do $$
begin
  if (select count(*) from public.reservations where artwork_id = 'obra-1' and status in ('requested', 'confirmed')) <> 1 then
    raise exception 'Reserva atômica não foi criada exatamente uma vez';
  end if;
  if (select status from public.artworks where id = 'obra-1') <> 'reserved' then
    raise exception 'Reserva não atualizou a obra';
  end if;
  if not exists (
    select 1 from public.audit_logs
    where action = 'reservation.create' and entity_type = 'reservations'
  ) then
    raise exception 'Reserva não gerou auditoria';
  end if;
end;
$$;

update public.reservations
set expires_at = now() - interval '1 minute'
where artwork_id = 'obra-1' and status = 'requested';

select public.expire_reservations(false, 'database-test', 'request-expire-1');

do $$
begin
  if (select status from public.artworks where id = 'obra-1') <> 'available' then
    raise exception 'Expiração não liberou a obra';
  end if;
  if exists (
    select 1 from public.reservations
    where artwork_id = 'obra-1' and status in ('requested', 'confirmed')
  ) then
    raise exception 'Expiração manteve reserva ativa';
  end if;
end;
$$;

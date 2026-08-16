\set ON_ERROR_STOP on

-- Superfície: a trilha operacional não pode vazar para clientes e a RPC
-- de transição só pode ser executada pela service_role.
do $$
begin
  if has_table_privilege('anon', 'public.operational_status_history', 'SELECT')
    or has_table_privilege('authenticated', 'public.operational_status_history', 'SELECT') then
    raise exception 'Trilha operacional exposta a clientes';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.apply_operational_status_atomic(text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role não executa a máquina de estados operacional';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.apply_operational_status_atomic(text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated executa a máquina de estados operacional';
  end if;
end;
$$;

-- Rotas declaradas.
do $$
begin
  if not public.operational_transition_allowed('artist', 'in_review', 'approved') then
    raise exception 'Rota válida de artista foi recusada';
  end if;
  if public.operational_transition_allowed('artist', 'prospected', 'published') then
    raise exception 'Artista pulou de prospectado para publicado';
  end if;
  if public.operational_transition_allowed('artwork', 'sold', 'available') then
    raise exception 'Obra vendida voltou para disponível';
  end if;
end;
$$;

insert into public.artists (id, name, slug, status, identity_verified)
values ('artista-status-test', 'Artista Status', 'artista-status-test', 'in_review', false)
on conflict (id) do update
set status = 'in_review', identity_verified = false, publishing_consent_at = null;

insert into public.artworks (id, slug, title, artist_id, status, price, image_authorized_at)
values ('obra-status-test', 'obra-status-test', 'Obra Status', 'artista-status-test', 'reserved', 4200, now())
on conflict (id) do update
set status = 'reserved', price = 4200, image_authorized_at = now();

-- Contexto operacional é obrigatório.
do $$
begin
  begin
    perform public.apply_operational_status_atomic(
      'artist', 'artista-status-test', 'approved', null, 'curto', 'cur', 'curto'
    );
    raise exception 'Transição aceita sem contexto operacional válido';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

-- Aprovar exige identidade verificada.
do $$
begin
  begin
    perform public.apply_operational_status_atomic(
      'artist', 'artista-status-test', 'approved', 'sem identidade',
      'admin-operacional-1', 'curator', 'request-status-0001'
    );
    raise exception 'Artista aprovado sem identidade verificada';
  exception
    when check_violation then null;
  end;
end;
$$;

update public.artists set identity_verified = true where id = 'artista-status-test';

select public.apply_operational_status_atomic(
  'artist', 'artista-status-test', 'approved', 'documentação conferida',
  'admin-operacional-1', 'curator', 'request-status-0002'
);

-- Publicar exige consentimento registrado.
do $$
begin
  begin
    perform public.apply_operational_status_atomic(
      'artist', 'artista-status-test', 'published', 'sem consentimento',
      'admin-operacional-1', 'curator', 'request-status-0003'
    );
    raise exception 'Artista publicado sem consentimento';
  exception
    when check_violation then null;
  end;
end;
$$;

update public.artists set publishing_consent_at = now() where id = 'artista-status-test';

select public.apply_operational_status_atomic(
  'artist', 'artista-status-test', 'published', 'consentimento registrado',
  'admin-operacional-1', 'curator', 'request-status-0004'
);

-- Transição fora da máquina é recusada.
do $$
begin
  begin
    perform public.apply_operational_status_atomic(
      'artist', 'artista-status-test', 'prospected', 'volta indevida',
      'admin-operacional-1', 'curator', 'request-status-0005'
    );
    raise exception 'Transição inválida de artista foi aceita';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

-- Repetir o mesmo status é recusado.
do $$
begin
  begin
    perform public.apply_operational_status_atomic(
      'artist', 'artista-status-test', 'published', 'repetido',
      'admin-operacional-1', 'curator', 'request-status-0006'
    );
    raise exception 'Status repetido foi aceito';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

-- Obra: venda exige preço; obra vendida não volta para disponível.
select public.apply_operational_status_atomic(
  'artwork', 'obra-status-test', 'sold', 'venda confirmada',
  'admin-operacional-1', 'curator', 'request-status-0007'
);

do $$
begin
  begin
    perform public.apply_operational_status_atomic(
      'artwork', 'obra-status-test', 'available', 'tentativa de revenda',
      'admin-operacional-1', 'curator', 'request-status-0008'
    );
    raise exception 'Obra vendida voltou para disponível';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

-- Registro inexistente e entidade inválida.
do $$
begin
  begin
    perform public.apply_operational_status_atomic(
      'artwork', 'obra-inexistente', 'archived', null,
      'admin-operacional-1', 'curator', 'request-status-0009'
    );
    raise exception 'Registro inexistente foi aceito';
  exception
    when no_data_found then null;
  end;
  begin
    perform public.apply_operational_status_atomic(
      'planeta', 'obra-status-test', 'archived', null,
      'admin-operacional-1', 'curator', 'request-status-0010'
    );
    raise exception 'Entidade inválida foi aceita';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

-- A trilha registra cada transição aplicada, com origem, destino e responsável.
do $$
declare
  v_artist integer;
  v_artwork integer;
  v_from text;
begin
  select count(*) into v_artist
  from public.operational_status_history
  where entity_type = 'artist' and entity_id = 'artista-status-test';
  if v_artist <> 2 then
    raise exception 'Trilha do artista com % linhas, esperado 2', v_artist;
  end if;

  select from_status into v_from
  from public.operational_status_history
  where entity_type = 'artist' and entity_id = 'artista-status-test' and to_status = 'published';
  if v_from <> 'approved' then
    raise exception 'Trilha registrou origem % para published', v_from;
  end if;

  select count(*) into v_artwork
  from public.operational_status_history
  where entity_type = 'artwork' and entity_id = 'obra-status-test' and to_status = 'sold' and from_status = 'reserved';
  if v_artwork <> 1 then
    raise exception 'Trilha da obra não registrou a venda';
  end if;

  if not exists (
    select 1 from public.operational_status_history
    where entity_id = 'artista-status-test'
      and actor_ref = 'admin-operacional-1'
      and actor_role = 'curator'
      and request_id is not null
  ) then
    raise exception 'Trilha sem responsável ou request_id';
  end if;
end;
$$;

-- O estado final precisa refletir a última transição aceita.
do $$
begin
  if (select status from public.artists where id = 'artista-status-test') <> 'published' then
    raise exception 'Artista não terminou publicado';
  end if;
  if (select status from public.artworks where id = 'obra-status-test') <> 'sold' then
    raise exception 'Obra não terminou vendida';
  end if;
end;
$$;

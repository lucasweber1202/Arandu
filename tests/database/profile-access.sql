\set ON_ERROR_STOP on

-- Superfície: escrita do vínculo é exclusiva da API; o artista lê apenas o próprio.
do $$
begin
  if has_table_privilege('anon', 'public.artist_accounts', 'SELECT') then
    raise exception 'Vínculo de artista exposto a anon';
  end if;
  if has_table_privilege('authenticated', 'public.artist_accounts', 'INSERT')
    or has_table_privilege('authenticated', 'public.artist_accounts', 'UPDATE') then
    raise exception 'Conta autenticada consegue escrever o próprio vínculo';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.link_artist_account_atomic(uuid,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role não vincula conta a artista';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.link_artist_account_atomic(uuid,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated consegue vincular a própria conta';
  end if;
end;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'artista-portal@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'outra-conta@example.com')
on conflict (id) do nothing;

insert into public.artists (id, name, slug, status, identity_verified)
values ('artista-portal-test', 'Artista Portal', 'artista-portal-test', 'in_review', true)
on conflict (id) do update set status = 'in_review', identity_verified = true;

-- Artista ainda não aprovado não recebe portal.
do $$
begin
  begin
    perform public.link_artist_account_atomic(
      '00000000-0000-0000-0000-0000000000a1', 'artista-portal-test',
      'admin-perfil-1', 'curator', 'request-perfil-0001'
    );
    raise exception 'Portal concedido a artista não aprovado';
  exception
    when check_violation then null;
  end;
end;
$$;

-- Contexto operacional insuficiente é recusado.
do $$
begin
  begin
    perform public.link_artist_account_atomic(
      '00000000-0000-0000-0000-0000000000a1', 'artista-portal-test', 'curto', 'cur', 'curto'
    );
    raise exception 'Vínculo aceito sem contexto operacional';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

update public.artists set status = 'approved' where id = 'artista-portal-test';

select public.link_artist_account_atomic(
  '00000000-0000-0000-0000-0000000000a1', 'artista-portal-test',
  'admin-perfil-1', 'curator', 'request-perfil-0002'
);

-- Conta inexistente é recusada.
do $$
begin
  begin
    perform public.link_artist_account_atomic(
      '00000000-0000-0000-0000-0000000000ff', 'artista-portal-test',
      'admin-perfil-1', 'curator', 'request-perfil-0003'
    );
    raise exception 'Vínculo aceito para conta inexistente';
  exception
    when no_data_found then null;
  end;
end;
$$;

-- O mesmo artista não pode ser reivindicado por outra conta.
do $$
begin
  begin
    perform public.link_artist_account_atomic(
      '00000000-0000-0000-0000-0000000000a2', 'artista-portal-test',
      'admin-perfil-1', 'curator', 'request-perfil-0004'
    );
    raise exception 'Artista vinculado a duas contas ao mesmo tempo';
  exception
    when unique_violation then null;
  end;
end;
$$;

do $$
declare
  v_active integer;
begin
  select count(*) into v_active
  from public.artist_accounts
  where artist_id = 'artista-portal-test' and status = 'active';
  if v_active <> 1 then
    raise exception 'Esperado exatamente 1 vínculo ativo, encontrado %', v_active;
  end if;
end;
$$;

-- Revogação encerra o acesso e é idempotente do ponto de vista do estado.
select public.revoke_artist_account_atomic(
  '00000000-0000-0000-0000-0000000000a1', 'admin-perfil-1', 'curator', 'request-perfil-0005'
);

do $$
begin
  if exists (
    select 1 from public.artist_accounts
    where user_id = '00000000-0000-0000-0000-0000000000a1' and status = 'active'
  ) then
    raise exception 'Vínculo continuou ativo após revogação';
  end if;
  if not exists (
    select 1 from public.artist_accounts
    where user_id = '00000000-0000-0000-0000-0000000000a1'
      and status = 'revoked' and revoked_by = 'admin-perfil-1' and revoked_at is not null
  ) then
    raise exception 'Revogação não registrou responsável';
  end if;
  begin
    perform public.revoke_artist_account_atomic(
      '00000000-0000-0000-0000-0000000000a1', 'admin-perfil-1', 'curator', 'request-perfil-0006'
    );
    raise exception 'Revogação sem vínculo ativo foi aceita';
  exception
    when no_data_found then null;
  end;
end;
$$;

-- Depois da revogação o artista pode ser vinculado a outra conta.
select public.link_artist_account_atomic(
  '00000000-0000-0000-0000-0000000000a2', 'artista-portal-test',
  'admin-perfil-1', 'curator', 'request-perfil-0007'
);

do $$
begin
  if not exists (
    select 1 from public.artist_accounts
    where user_id = '00000000-0000-0000-0000-0000000000a2'
      and artist_id = 'artista-portal-test' and status = 'active'
  ) then
    raise exception 'Novo vínculo não ficou ativo';
  end if;
end;
$$;

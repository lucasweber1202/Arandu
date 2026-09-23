\set ON_ERROR_STOP on

-- Controles de piloto: allowlist fail-closed, aceite de termos e o vocabulário
-- fechado de eventos vindos do cliente.

do $$
begin
  -- A lista de quem foi convidado para o piloto é, ela mesma, informação.
  if has_table_privilege('authenticated', 'public.fin_pilot_allowlist', 'SELECT')
    or has_table_privilege('anon', 'public.fin_pilot_allowlist', 'SELECT') then
    raise exception 'allowlist do piloto é legível por conta comum';
  end if;
  if has_table_privilege('authenticated', 'public.fin_terms_acceptances', 'INSERT')
    or has_table_privilege('authenticated', 'public.fin_terms_acceptances', 'UPDATE')
    or has_table_privilege('authenticated', 'public.fin_terms_acceptances', 'DELETE') then
    raise exception 'aceite de termos pode ser forjado por escrita direta';
  end if;
  if has_function_privilege('authenticated', 'public.fin_pilot_access_allowed(text)', 'EXECUTE') then
    raise exception 'conta comum consegue sondar a allowlist';
  end if;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000ca01', 'permitido@piloto.invalid'),
  ('00000000-0000-4000-8000-00000000ca02', 'fora@naoconvidado.invalid'),
  ('00000000-0000-4000-8000-00000000ca03', 'alguem@dominio-liberado.invalid')
on conflict (id) do nothing;

create temporary table pilot_ids (key text primary key, value uuid);
grant all on pilot_ids to authenticated;

-- Allowlist vazia: sem restrição (desenvolvimento e demonstração).
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca02', false);
insert into pilot_ids values ('aberta', public.fin_create_organization('Empresa Sem Allowlist DEMO', 'BUYER'));

-- Ligar a allowlist é o próprio ato de cadastrar quem pode entrar.
reset role;
insert into public.fin_pilot_allowlist (pattern, created_by, note)
  values ('permitido@piloto.invalid', '00000000-0000-4000-8000-00000000ca01', 'empresa piloto'),
         ('@dominio-liberado.invalid', '00000000-0000-4000-8000-00000000ca01', 'provedor piloto')
  on conflict (pattern) do nothing;
set role authenticated;

do $$
begin
  -- Quem não está na lista deixa de conseguir entrar.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca02', false);
  begin
    perform public.fin_create_organization('Empresa Nao Convidada DEMO', 'BUYER');
    raise exception 'conta fora da allowlist criou organização com o piloto restrito';
  exception when others then
    if sqlerrm not like '%pilot access not allowed%' then raise; end if;
  end;
end $$;

-- E-mail exato liberado entra.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca01', false);
insert into pilot_ids values ('buyer', public.fin_create_organization('Empresa Piloto DEMO', 'BUYER'));
-- Domínio liberado entra.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca03', false);
insert into pilot_ids values ('provider', public.fin_create_organization('Provedor Piloto DEMO', 'PROVIDER'));

do $$
declare v_events integer;
begin
  -- Onboarding de cada lado emite o evento correspondente; cada contagem é
  -- lida pela própria organização, porque o RLS não mostra a trilha alheia.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca01', false);
  select count(*) into v_events from public.fin_events
    where organization_id = (select value from pilot_ids where key = 'buyer') and event_type = 'buyer_onboarded';
  if v_events <> 1 then raise exception 'buyer_onboarded não foi emitido (%)', v_events; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca03', false);
  select count(*) into v_events from public.fin_events
    where organization_id = (select value from pilot_ids where key = 'provider') and event_type = 'provider_onboarded';
  if v_events <> 1 then raise exception 'provider_onboarded não foi emitido (%)', v_events; end if;
end $$;

-- ------------------------------------------------------- aceite de termos

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca01', false);
select public.fin_accept_terms((select value from pilot_ids where key = 'buyer'), '2026-09-23-pilot');

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.fin_terms_acceptances
    where organization_id = (select value from pilot_ids where key = 'buyer');
  if v_count <> 1 then raise exception 'aceite não foi registrado'; end if;

  -- Reaceitar a mesma versão não duplica.
  perform public.fin_accept_terms((select value from pilot_ids where key = 'buyer'), '2026-09-23-pilot');
  select count(*) into v_count from public.fin_terms_acceptances
    where organization_id = (select value from pilot_ids where key = 'buyer');
  if v_count <> 1 then raise exception 'aceite duplicado (%)', v_count; end if;

  -- Versão fora do formato não vira aceite.
  begin
    perform public.fin_accept_terms((select value from pilot_ids where key = 'buyer'), 'v1');
    raise exception 'versão de termos inválida foi aceita';
  exception when others then
    if sqlerrm not like '%invalid terms version%' then raise; end if;
  end;

  -- Ninguém aceita termos por organização da qual não é membro.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca03', false);
  begin
    perform public.fin_accept_terms((select value from pilot_ids where key = 'buyer'), '2026-09-23-pilot');
    raise exception 'terceiro aceitou termos por outra organização';
  exception when others then
    if sqlerrm not like '%forbidden%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca01', false);
end $$;

-- --------------------------------------------- eventos vindos do cliente

do $$
declare v_count integer;
begin
  perform public.fin_record_client_event(
    (select value from pilot_ids where key = 'buyer'), 'organization',
    (select value from pilot_ids where key = 'buyer'), 'comparison_viewed');
  select count(*) into v_count from public.fin_events
    where organization_id = (select value from pilot_ids where key = 'buyer') and event_type = 'comparison_viewed';
  if v_count <> 1 then raise exception 'evento de cliente não registrado'; end if;

  -- Vocabulário fechado: o cliente não inventa tipo de evento.
  begin
    perform public.fin_record_client_event(
      (select value from pilot_ids where key = 'buyer'), 'organization',
      (select value from pilot_ids where key = 'buyer'), 'taxa_negociada_1_72');
    raise exception 'evento arbitrário do cliente foi aceito';
  exception when others then
    if sqlerrm not like '%unknown event%' then raise; end if;
  end;

  -- E não emite evento por organização alheia.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca03', false);
  begin
    perform public.fin_record_client_event(
      (select value from pilot_ids where key = 'buyer'), 'organization',
      (select value from pilot_ids where key = 'buyer'), 'comparison_viewed');
    raise exception 'evento emitido por organização alheia';
  exception when others then
    if sqlerrm not like '%forbidden%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ca01', false);

  -- Nenhum evento da trilha carrega termo financeiro.
  if exists (select 1 from public.fin_events where metadata::text ~* '(interest_rate|mdr|offered_amount|cet)') then
    raise exception 'trilha registrou termo financeiro';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo 'Financial Procurement pilot: allowlist, aceite de termos e eventos de cliente aprovados.'

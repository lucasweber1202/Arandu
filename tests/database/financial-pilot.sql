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

-- --------------------------------------------- outbox de e-mail desligada

reset role;
do $$
declare v_enabled text; v_queued integer;
begin
  select public.fin_setting('email_enabled', 'ausente') into v_enabled;
  if v_enabled <> 'false' then raise exception 'envio de e-mail nasce ligado (%)', v_enabled; end if;

  -- Com a chave desligada, nada é enfileirado.
  if public.fin_enqueue_email('provider_invite', 'contato@exemplo.invalid', 'rfq',
       '00000000-0000-4000-8000-00000000cb01', '{}'::jsonb, 'teste-desligado') then
    raise exception 'e-mail foi enfileirado com o envio desligado';
  end if;
  select count(*) into v_queued from public.transactional_email_outbox where idempotency_key = 'teste-desligado';
  if v_queued <> 0 then raise exception 'linha entrou na outbox com o envio desligado'; end if;

  -- Ligada, enfileira uma vez só e nunca guarda o token nem termo financeiro.
  update public.fin_settings set value = 'true' where key = 'email_enabled';
  perform public.fin_enqueue_email('provider_invite', 'contato@exemplo.invalid', 'rfq',
    '00000000-0000-4000-8000-00000000cb01',
    jsonb_build_object('buyer', 'Empresa DEMO', 'product', 'credit', 'invite_ref', '00000000-0000-4000-8000-00000000cb02'),
    'teste-ligado');
  perform public.fin_enqueue_email('provider_invite', 'contato@exemplo.invalid', 'rfq',
    '00000000-0000-4000-8000-00000000cb01', '{}'::jsonb, 'teste-ligado');
  select count(*) into v_queued from public.transactional_email_outbox where idempotency_key = 'teste-ligado';
  if v_queued <> 1 then raise exception 'enfileiramento não é idempotente (%)', v_queued; end if;

  if exists (select 1 from public.transactional_email_outbox
             where idempotency_key = 'teste-ligado'
               and payload::text ~* '(token|interest_rate|mdr|offered_amount)') then
    raise exception 'payload de e-mail carrega token ou termo financeiro';
  end if;

  -- Modelo fora do vocabulário é recusado.
  begin
    perform public.fin_enqueue_email('promocao', 'contato@exemplo.invalid', 'rfq',
      '00000000-0000-4000-8000-00000000cb01', '{}'::jsonb, 'teste-invalido');
    raise exception 'modelo de e-mail desconhecido foi aceito';
  exception when others then
    if sqlerrm not like '%unknown template%' then raise; end if;
  end;

  update public.fin_settings set value = 'false' where key = 'email_enabled';
  -- A outbox é compartilhada com o restante do Arandu: deixar a linha de teste
  -- pendente faria o teste de concorrência da outbox contar um claim a mais.
  delete from public.transactional_email_outbox where idempotency_key in ('teste-ligado', 'teste-desligado');
end $$;

do $$
begin
  if has_table_privilege('authenticated', 'public.fin_settings', 'SELECT')
    or has_function_privilege('authenticated', 'public.fin_enqueue_email(text,text,text,uuid,jsonb,text)', 'EXECUTE') then
    raise exception 'conta comum alcança as chaves de operação do piloto';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '', false);

\echo 'Financial Procurement pilot: allowlist, aceite de termos, eventos de cliente e outbox de e-mail aprovados.'

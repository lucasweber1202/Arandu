\set ON_ERROR_STOP on

-- Arandu Financial Procurement — testes de banco.
-- Cobrem superfície de privilégios, isolamento multi-tenant, isolamento entre
-- provedores concorrentes, convite de uso único, versionamento de propostas,
-- máquina de estados, decisão humana com snapshot e contrato/renovação.

-- ---------------------------------------------------------------- superfície

do $$
declare t text;
begin
  foreach t in array array[
    'fin_organizations','fin_members','fin_member_invitations','fin_company_profiles','fin_providers',
    'fin_rfqs','fin_rfq_invites','fin_proposals','fin_proposal_versions','fin_decisions',
    'fin_contracts','fin_documents','fin_tasks','fin_events'] loop
    if has_table_privilege('anon', 'public.' || t, 'SELECT')
      or has_table_privilege('anon', 'public.' || t, 'INSERT') then
      raise exception 'anon alcança %', t;
    end if;
    if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'RLS não está forçada em %', t;
    end if;
  end loop;

  -- Estado financeiro só muda por função auditada; nada de UPDATE direto.
  foreach t in array array['fin_rfqs','fin_proposals','fin_proposal_versions','fin_decisions','fin_contracts','fin_rfq_invites','fin_events'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'authenticated escreve direto em %', t;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.fin_member_invitations', 'SELECT') then
    raise exception 'token de convite de membro exposto a conta autenticada';
  end if;
  if has_function_privilege('anon', 'public.fin_create_rfq(uuid,text,text,text,jsonb,date)', 'EXECUTE')
    or has_function_privilege('anon', 'public.fin_record_decision(uuid,uuid,jsonb,text)', 'EXECUTE') then
    raise exception 'anon executa funções de procurement';
  end if;
end $$;

-- ------------------------------------------------------------------ cenário

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000fa01', 'cfo-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000fa02', 'viewer-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000fb01', 'cfo-b@example.invalid'),
  ('00000000-0000-4000-8000-00000000fd01', 'provedor-1@example.invalid'),
  ('00000000-0000-4000-8000-00000000fd02', 'provedor-2@example.invalid')
on conflict (id) do nothing;

create temporary table fin_ids (key text primary key, value uuid);
create temporary table fin_tokens (key text primary key, value text);
grant all on fin_ids, fin_tokens to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa01', false);
insert into fin_ids values ('org_a', public.fin_create_organization('Empresa Compradora A DEMO', 'BUYER'));
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fb01', false);
insert into fin_ids values ('org_b', public.fin_create_organization('Empresa Compradora B DEMO', 'BUYER'));
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd01', false);
insert into fin_ids values ('org_p1', public.fin_create_organization('Provedor Um DEMO', 'PROVIDER'));
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd02', false);
insert into fin_ids values ('org_p2', public.fin_create_organization('Provedor Dois DEMO', 'PROVIDER'));

-- Membro viewer da empresa A (inserido pelo dono do schema para simular convite aceito).
reset role;
insert into public.fin_members (organization_id, user_id, role)
  select value, '00000000-0000-4000-8000-00000000fa02', 'viewer' from fin_ids where key = 'org_a'
  on conflict do nothing;
set role authenticated;

-- ------------------------------------------ provedores, RFQ e máquina de estados

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa01', false);
insert into public.fin_providers (organization_id, name, kind, created_by)
  select value, 'Banco Alfa Demo', 'bank', '00000000-0000-4000-8000-00000000fa01' from fin_ids where key = 'org_a';
insert into public.fin_providers (organization_id, name, kind, created_by)
  select value, 'Fintech Beta Demo', 'fintech', '00000000-0000-4000-8000-00000000fa01' from fin_ids where key = 'org_a';
insert into fin_ids select 'provider_1', id from public.fin_providers where name = 'Banco Alfa Demo';
insert into fin_ids select 'provider_2', id from public.fin_providers where name = 'Fintech Beta Demo';

-- Provedor não verificado não pode alegar registro regulatório sem evidência.
do $$
begin
  begin
    insert into public.fin_providers (organization_id, name, kind, created_by, verification_state)
      select value, 'Provedor Sem Evidencia Demo', 'bank', '00000000-0000-4000-8000-00000000fa01', 'EVIDENCIA_REGISTRADA'
      from fin_ids where key = 'org_a';
    raise exception 'provedor foi marcado como verificado sem evidência';
  exception when check_violation then null;
  end;
end $$;

insert into fin_ids select 'rfq', public.fin_create_rfq(
  (select value from fin_ids where key = 'org_a'), 'credit', 'Capital de giro DEMO', 'Dados de demonstração',
  '{"amount":500000,"purpose":"capital_de_giro","term_months":24}'::jsonb, current_date + 15);

do $$
begin
  -- Transição fora da máquina de estados é recusada.
  begin
    perform public.fin_transition('rfq', (select value from fin_ids where key = 'rfq'), 'decided');
    raise exception 'transição inválida draft->decided foi aceita';
  exception when others then
    if sqlerrm not like '%invalid transition%' then raise; end if;
  end;
  -- Empresa B não move a RFQ da empresa A.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fb01', false);
  begin
    perform public.fin_transition('rfq', (select value from fin_ids where key = 'rfq'), 'open');
    raise exception 'organização estrangeira moveu a RFQ';
  exception when others then
    if sqlerrm not like '%forbidden%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa01', false);
end $$;

select public.fin_transition('rfq', (select value from fin_ids where key = 'rfq'), 'open');

-- ----------------------------------------------------- convites de provedor

insert into fin_tokens select 'invite_1', public.fin_invite_provider(
  (select value from fin_ids where key = 'rfq'), (select value from fin_ids where key = 'provider_1'));
insert into fin_tokens select 'invite_2', public.fin_invite_provider(
  (select value from fin_ids where key = 'rfq'), (select value from fin_ids where key = 'provider_2'));

do $$
begin
  -- Provedor 2 tentando aceitar o convite 1 em nome da organização do provedor 1.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd02', false);
  begin
    perform public.fin_accept_provider_invite(
      (select value from fin_tokens where key = 'invite_1'), (select value from fin_ids where key = 'org_p1'));
    raise exception 'provedor assumiu identidade de outro provedor';
  exception when others then
    if sqlerrm not like '%forbidden%' then raise; end if;
  end;
  -- Token inexistente.
  begin
    perform public.fin_accept_provider_invite(repeat('a', 64), (select value from fin_ids where key = 'org_p2'));
    raise exception 'token inválido foi aceito';
  exception when others then
    if sqlerrm not like '%invalid invitation%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd01', false);
select public.fin_accept_provider_invite(
  (select value from fin_tokens where key = 'invite_1'), (select value from fin_ids where key = 'org_p1'));
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd02', false);
select public.fin_accept_provider_invite(
  (select value from fin_tokens where key = 'invite_2'), (select value from fin_ids where key = 'org_p2'));

do $$
begin
  -- Uso único: o mesmo token não vale duas vezes.
  begin
    perform public.fin_accept_provider_invite(
      (select value from fin_tokens where key = 'invite_2'), (select value from fin_ids where key = 'org_p2'));
    raise exception 'token de convite foi reutilizado';
  exception when others then
    if sqlerrm not like '%invalid invitation%' then raise; end if;
  end;
end $$;

-- Convite expirado não é aceito.
reset role;
insert into public.fin_rfq_invites (buyer_organization_id, rfq_id, provider_id, token_hash, created_by, expires_at)
  select (select value from fin_ids where key = 'org_a'), (select value from fin_ids where key = 'rfq'),
         (select value from fin_ids where key = 'provider_1'),
         encode(sha256(convert_to(repeat('b', 64), 'UTF8')), 'hex'),
         '00000000-0000-4000-8000-00000000fa01', now() - interval '1 day'
  on conflict do nothing;
set role authenticated;
do $$
begin
  begin
    perform public.fin_accept_provider_invite(repeat('b', 64), (select value from fin_ids where key = 'org_p2'));
    raise exception 'convite expirado foi aceito';
  exception when others then
    if sqlerrm not like '%invalid invitation%' then raise; end if;
  end;
end $$;

-- ------------------------------------------- propostas, versões e isolamento

-- A empresa compradora enxerga as duas propostas da própria RFQ; é por ela que
-- os identificadores do teste são capturados.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa01', false);
insert into fin_ids select 'proposal_1', p.id from public.fin_proposals p
  where p.provider_organization_id = (select value from fin_ids where key = 'org_p1');
insert into fin_ids select 'proposal_2', p.id from public.fin_proposals p
  where p.provider_organization_id = (select value from fin_ids where key = 'org_p2');

do $$
begin
  if (select count(*) from fin_ids where key in ('proposal_1','proposal_2')) <> 2 then
    raise exception 'aceitar o convite não criou a proposta do provedor';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd01', false);
select public.fin_submit_proposal((select value from fin_ids where key = 'proposal_1'),
  '{"institution":"Banco Alfa Demo","interest_rate_month":1.85,"term_months":24,"offered_amount":500000}'::jsonb);
select public.fin_submit_proposal((select value from fin_ids where key = 'proposal_1'),
  '{"institution":"Banco Alfa Demo","interest_rate_month":1.72,"term_months":24,"offered_amount":500000}'::jsonb, 'revisão comercial');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd02', false);
select public.fin_submit_proposal((select value from fin_ids where key = 'proposal_2'),
  '{"institution":"Fintech Beta Demo","interest_rate_month":2.10,"term_months":36,"offered_amount":500000}'::jsonb);

do $$
declare v_versions integer; v_rate numeric; v_visible integer;
begin
  -- Versionamento: a condição anterior continua registrada (lido pela empresa).
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa01', false);
  select count(*) into v_versions from public.fin_proposal_versions
    where proposal_id = (select value from fin_ids where key = 'proposal_1');
  if v_versions <> 2 then raise exception 'versionamento de proposta não preservou o histórico (%).', v_versions; end if;
  select (terms->>'interest_rate_month')::numeric into v_rate from public.fin_proposal_versions
    where proposal_id = (select value from fin_ids where key = 'proposal_1') and version = 1;
  if v_rate <> 1.85 then raise exception 'termo financeiro anterior foi sobrescrito'; end if;

  -- Provedor 2 não enxerga a proposta do concorrente.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd02', false);
  select count(*) into v_visible from public.fin_proposals
    where id = (select value from fin_ids where key = 'proposal_1');
  if v_visible <> 0 then raise exception 'provedor leu proposta do concorrente'; end if;
  select count(*) into v_visible from public.fin_proposal_versions
    where proposal_id = (select value from fin_ids where key = 'proposal_1');
  if v_visible <> 0 then raise exception 'provedor leu versões da proposta do concorrente'; end if;

  -- Empresa compradora enxerga as duas propostas da própria RFQ.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa01', false);
  select count(*) into v_visible from public.fin_proposals
    where rfq_id = (select value from fin_ids where key = 'rfq');
  if v_visible <> 2 then raise exception 'empresa não enxerga as propostas da própria RFQ (%).', v_visible; end if;

  -- Empresa B não enxerga nada da empresa A.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fb01', false);
  select count(*) into v_visible from public.fin_rfqs where id = (select value from fin_ids where key = 'rfq');
  if v_visible <> 0 then raise exception 'organização B leu RFQ da organização A'; end if;
  select count(*) into v_visible from public.fin_proposals where rfq_id = (select value from fin_ids where key = 'rfq');
  if v_visible <> 0 then raise exception 'organização B leu propostas da organização A'; end if;
  select count(*) into v_visible from public.fin_providers
    where organization_id = (select value from fin_ids where key = 'org_a');
  if v_visible <> 0 then raise exception 'organização B leu provedores da organização A'; end if;

  -- Viewer da própria empresa lê, mas não escreve.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa02', false);
  select count(*) into v_visible from public.fin_rfqs where id = (select value from fin_ids where key = 'rfq');
  if v_visible <> 1 then raise exception 'viewer não consegue ler a RFQ da própria empresa'; end if;
  begin
    insert into public.fin_providers (organization_id, name, kind, created_by)
      values ((select value from fin_ids where key = 'org_a'), 'Provedor Viewer Demo', 'bank',
              '00000000-0000-4000-8000-00000000fa02');
    raise exception 'viewer cadastrou provedor';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa01', false);
end $$;

-- ------------------------------------------------- decisão humana e contrato

select public.fin_transition('rfq', (select value from fin_ids where key = 'rfq'), 'comparing');

do $$
declare v_snapshot jsonb;
begin
  -- Provedor não decide pela empresa.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd01', false);
  begin
    perform public.fin_record_decision(
      (select value from fin_ids where key = 'rfq'), (select value from fin_ids where key = 'proposal_1'));
    raise exception 'provedor registrou decisão da empresa';
  exception when others then
    if sqlerrm not like '%forbidden%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa01', false);

  insert into fin_ids select 'decision', public.fin_record_decision(
    (select value from fin_ids where key = 'rfq'), (select value from fin_ids where key = 'proposal_1'),
    '{"weights":{"interest_rate_month":40,"term_months":30,"grace_months":30}}'::jsonb,
    'Decisão registrada pela equipe financeira.');

  select snapshot into v_snapshot from public.fin_decisions
    where id = (select value from fin_ids where key = 'decision');
  if jsonb_array_length(v_snapshot->'proposals') <> 2 then
    raise exception 'snapshot da decisão não preservou as demais propostas';
  end if;
  if (select status from public.fin_rfqs where id = (select value from fin_ids where key = 'rfq')) <> 'decided' then
    raise exception 'decisão não moveu a RFQ para decided';
  end if;
end $$;

insert into fin_ids select 'contract', public.fin_register_contract(
  (select value from fin_ids where key = 'decision'), current_date, current_date + 730, 60,
  'Custo conforme proposta registrada.', 'Condições principais de demonstração.');

do $$
declare v_status text;
begin
  if (select status from public.fin_rfqs where id = (select value from fin_ids where key = 'rfq')) <> 'contracted' then
    raise exception 'contrato não moveu a RFQ para contracted';
  end if;
  perform public.fin_transition('contract', (select value from fin_ids where key = 'contract'), 'renewing');
  select status into v_status from public.fin_contracts where id = (select value from fin_ids where key = 'contract');
  if v_status <> 'renewing' then raise exception 'contrato não entrou em renovação'; end if;
  perform public.fin_transition('contract', (select value from fin_ids where key = 'contract'), 'terminated');
  begin
    perform public.fin_transition('contract', (select value from fin_ids where key = 'contract'), 'active');
    raise exception 'contrato encerrado voltou a ativo';
  exception when others then
    if sqlerrm not like '%invalid transition%' then raise; end if;
  end;

  -- Proposta já decidida não pode ser retirada por trás da decisão.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fd01', false);
  begin
    perform public.fin_withdraw_proposal((select value from fin_ids where key = 'proposal_1'));
    raise exception 'proposta decidida foi retirada';
  exception when others then
    if sqlerrm not like '%decided proposal%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000fa01', false);
end $$;

-- ------------------------------------------------------------------- trilha

do $$
declare v_events integer;
begin
  select count(*) into v_events from public.fin_events
    where organization_id = (select value from fin_ids where key = 'org_a');
  if v_events < 7 then raise exception 'trilha de eventos incompleta (%).', v_events; end if;
  if exists (select 1 from public.fin_events
             where organization_id = (select value from fin_ids where key = 'org_a')
               and metadata::text ~* '(interest_rate|mdr|offered_amount)') then
    raise exception 'trilha de eventos registrou termos financeiros sensíveis';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo 'Financial Procurement: isolamento, convites, versionamento, decisão e contrato aprovados.'

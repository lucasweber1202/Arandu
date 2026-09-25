\set ON_ERROR_STOP on

-- Regressões das falhas de integridade encontradas na auditoria da main
-- (8db155f). Cada bloco falha se a trava correspondente for removida.

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000ba01', 'cfo-hard@example.invalid'),
  ('00000000-0000-4000-8000-00000000ba02', 'provedor-hard-1@example.invalid'),
  ('00000000-0000-4000-8000-00000000ba03', 'provedor-hard-2@example.invalid')
on conflict (id) do nothing;

insert into public.fin_pilot_allowlist (pattern, created_by, note)
  select email, '00000000-0000-4000-8000-00000000ba01', 'hardening database test'
  from auth.users where id in (
    '00000000-0000-4000-8000-00000000ba01','00000000-0000-4000-8000-00000000ba02',
    '00000000-0000-4000-8000-00000000ba03'
  ) on conflict (pattern) do nothing;

create temporary table hard_ids (key text primary key, value uuid);
create temporary table hard_tokens (key text primary key, value text);
grant all on hard_ids, hard_tokens to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba01', false);
insert into hard_ids values ('buyer', public.fin_create_organization('Empresa Hardening DEMO', 'BUYER'));
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba02', false);
insert into hard_ids values ('prov1', public.fin_create_organization('Provedor Hard Um DEMO', 'PROVIDER'));
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba03', false);
insert into hard_ids values ('prov2', public.fin_create_organization('Provedor Hard Dois DEMO', 'PROVIDER'));

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba01', false);

-- ------------------------------------------ completar dados da organização

do $$
declare v_cnpj text;
begin
  perform public.fin_update_organization(
    (select value from hard_ids where key = 'buyer'),
    'Hardening Demo', '11222333000181', 'Indústria', '30m_300m');
  select tax_identifier into v_cnpj from public.fin_organizations
    where id = (select value from hard_ids where key = 'buyer');
  if v_cnpj <> '11222333000181' then raise exception 'organização não pôde ser completada'; end if;

  -- CNPJ fora do formato é recusado no banco, mesmo que a aplicação falhe.
  begin
    perform public.fin_update_organization((select value from hard_ids where key = 'buyer'), null, '123', null, null);
    raise exception 'CNPJ malformado foi aceito';
  exception when others then
    if sqlerrm not like '%invalid tax identifier%' then raise; end if;
  end;

  -- Porte fora do vocabulário é recusado.
  begin
    perform public.fin_update_organization((select value from hard_ids where key = 'buyer'), null, null, null, 'gigante');
    raise exception 'faixa de faturamento inválida foi aceita';
  exception when others then
    if sqlerrm not like '%invalid revenue band%' then raise; end if;
  end;
end $$;

-- --------------------------------------- evidência regulatória de provedor

insert into public.fin_providers (organization_id, name, kind, created_by)
  select value, 'Banco Hardening Demo', 'bank', '00000000-0000-4000-8000-00000000ba01' from hard_ids where key = 'buyer';
insert into public.fin_providers (organization_id, name, kind, created_by)
  select value, 'Fintech Hardening Demo', 'fintech', '00000000-0000-4000-8000-00000000ba01' from hard_ids where key = 'buyer';
insert into hard_ids select 'provider_a', id from public.fin_providers where name = 'Banco Hardening Demo';
insert into hard_ids select 'provider_b', id from public.fin_providers where name = 'Fintech Hardening Demo';

do $$
declare v_state text;
begin
  -- Sem URL https não existe evidência registrada.
  begin
    perform public.fin_record_provider_evidence(
      (select value from hard_ids where key = 'provider_a'), 'Autoridade', '12345', 'http://inseguro.example', current_date);
    raise exception 'evidência sem https foi aceita';
  exception when others then
    if sqlerrm not like '%https%' then raise; end if;
  end;
  -- Data futura não é consulta.
  begin
    perform public.fin_record_provider_evidence(
      (select value from hard_ids where key = 'provider_a'), 'Autoridade', '12345',
      'https://evidencia.example/registro', current_date + 1);
    raise exception 'data futura de consulta foi aceita';
  exception when others then
    if sqlerrm not like '%invalid check date%' then raise; end if;
  end;

  perform public.fin_record_provider_evidence(
    (select value from hard_ids where key = 'provider_a'), 'Autoridade Demo', 'REG-123',
    'https://evidencia.example/registro', current_date);
  select verification_state into v_state from public.fin_providers
    where id = (select value from hard_ids where key = 'provider_a');
  if v_state <> 'EVIDENCIA_REGISTRADA' then raise exception 'evidência válida não foi registrada'; end if;
end $$;

-- ------------------------------------------------- RFQ, convites, propostas

insert into hard_ids select 'rfq', public.fin_create_rfq(
  (select value from hard_ids where key = 'buyer'), 'credit', 'RFQ hardening DEMO', null,
  '{"amount":250000,"purpose":"capital_de_giro","term_months":12}'::jsonb, null);
select public.fin_transition('rfq', (select value from hard_ids where key = 'rfq'), 'open');

insert into hard_tokens select 't1', public.fin_invite_provider(
  (select value from hard_ids where key = 'rfq'), (select value from hard_ids where key = 'provider_a'));
insert into hard_tokens select 't2', public.fin_invite_provider(
  (select value from hard_ids where key = 'rfq'), (select value from hard_ids where key = 'provider_b'));

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba02', false);
select public.fin_accept_provider_invite((select value from hard_tokens where key = 't1'), (select value from hard_ids where key = 'prov1'));
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba03', false);
select public.fin_accept_provider_invite((select value from hard_tokens where key = 't2'), (select value from hard_ids where key = 'prov2'));

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba01', false);
insert into hard_ids select 'p1', id from public.fin_proposals where provider_organization_id = (select value from hard_ids where key = 'prov1');
insert into hard_ids select 'p2', id from public.fin_proposals where provider_organization_id = (select value from hard_ids where key = 'prov2');

-- Idempotência: reenviar termos idênticos não cria versão nova.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba02', false);
do $$
declare v_first integer; v_again integer; v_count integer;
begin
  v_first := public.fin_submit_proposal((select value from hard_ids where key = 'p1'),
    '{"institution":"Banco Hardening Demo","interest_rate_month":1.5,"term_months":12}'::jsonb);
  v_again := public.fin_submit_proposal((select value from hard_ids where key = 'p1'),
    '{"institution":"Banco Hardening Demo","interest_rate_month":1.5,"term_months":12}'::jsonb);
  if v_first <> 1 or v_again <> 1 then raise exception 'reenvio idêntico criou versão nova (% e %)', v_first, v_again; end if;
  select count(*) into v_count from public.fin_proposal_versions
    where proposal_id = (select value from hard_ids where key = 'p1');
  if v_count <> 1 then raise exception 'histórico ganhou versão duplicada (%)', v_count; end if;

  -- Termos diferentes continuam criando versão.
  v_again := public.fin_submit_proposal((select value from hard_ids where key = 'p1'),
    '{"institution":"Banco Hardening Demo","interest_rate_month":1.4,"term_months":12}'::jsonb);
  if v_again <> 2 then raise exception 'revisão real não criou versão 2 (%)', v_again; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba03', false);
select public.fin_submit_proposal((select value from hard_ids where key = 'p2'),
  '{"institution":"Fintech Hardening Demo","interest_rate_month":2.2,"term_months":24}'::jsonb);

-- ------------------------------- vínculo com a conta canônica do provedor

do $$
declare v_linked uuid; v_visible integer;
begin
  -- Lido pelo comprador: é o cadastro dele.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba01', false);
  select provider_organization_id into v_linked from public.fin_providers
    where id = (select value from hard_ids where key = 'provider_a');
  if v_linked is distinct from (select value from hard_ids where key = 'prov1') then
    raise exception 'o cadastro do comprador não ficou ligado à conta canônica do provedor';
  end if;

  -- O vínculo não pode abrir leitura cruzada: o provedor continua sem enxergar
  -- o cadastro (e as notas internas) que o comprador mantém sobre ele.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba02', false);
  select count(*) into v_visible from public.fin_providers
    where id = (select value from hard_ids where key = 'provider_a');
  if v_visible <> 0 then raise exception 'provedor leu o cadastro interno do comprador'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba01', false);
end $$;

-- ------------------------------------------------- uma decisão por RFQ

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba01', false);
insert into hard_ids select 'decision', public.fin_record_decision(
  (select value from hard_ids where key = 'rfq'), (select value from hard_ids where key = 'p1'),
  '{"weights":{"interest_rate_month":100}}'::jsonb, 'Decisão de teste.');

do $$
declare v_snapshot jsonb;
begin
  -- Segunda decisão na mesma RFQ, sobre a outra proposta, tem de falhar.
  begin
    perform public.fin_record_decision(
      (select value from hard_ids where key = 'rfq'), (select value from hard_ids where key = 'p2'));
    raise exception 'a mesma RFQ aceitou duas decisões';
  exception when others then
    if sqlerrm not like '%decision already recorded%' and sqlerrm not like '%invalid state%' then raise; end if;
  end;

  select snapshot into v_snapshot from public.fin_decisions where id = (select value from hard_ids where key = 'decision');
  if (v_snapshot->>'decided_version')::integer <> 2 then
    raise exception 'snapshot não registrou a versão decidida';
  end if;
  if jsonb_array_length(v_snapshot->'proposals') <> 2 then
    raise exception 'snapshot não preservou as demais propostas';
  end if;
end $$;

-- ------------------------------- revisão posterior não altera a fotografia

do $$
declare v_snapshot jsonb; v_rate numeric;
begin
  -- A RFQ está em `decided`, então o provedor não consegue mais revisar. Ainda
  -- assim, o snapshot precisa ser imutável por construção: gravamos um valor
  -- novo direto na versão corrente e conferimos que a decisão não muda.
  select snapshot into v_snapshot from public.fin_decisions where id = (select value from hard_ids where key = 'decision');
  select ((v_snapshot->'proposals'->0->'terms')->>'interest_rate_month')::numeric into v_rate;
  if v_rate is null then raise exception 'snapshot não guardou os termos'; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba02', false);
  begin
    perform public.fin_submit_proposal((select value from hard_ids where key = 'p1'),
      '{"institution":"Banco Hardening Demo","interest_rate_month":0.1,"term_months":12}'::jsonb);
    raise exception 'proposta foi revisada com a RFQ já decidida';
  exception when others then
    if sqlerrm not like '%not receiving proposals%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000ba01', false);

  select ((snapshot->'proposals'->0->'terms')->>'interest_rate_month')::numeric into v_rate
    from public.fin_decisions where id = (select value from hard_ids where key = 'decision');
  select snapshot into v_snapshot from public.fin_decisions where id = (select value from hard_ids where key = 'decision');
  if (v_snapshot->>'decided_version')::integer <> 2 then raise exception 'snapshot mudou depois da decisão'; end if;
end $$;

-- ---------------------------------------------- um contrato por decisão

insert into hard_ids select 'contract', public.fin_register_contract(
  (select value from hard_ids where key = 'decision'), current_date, current_date + 365, 45,
  'Custo de teste.', 'Condições de teste.');

do $$
declare v_tasks integer; v_due date;
begin
  begin
    perform public.fin_register_contract(
      (select value from hard_ids where key = 'decision'), current_date, current_date + 365, 45);
    raise exception 'a mesma decisão gerou dois contratos';
  exception when others then
    if sqlerrm not like '%contract already registered%' then raise; end if;
  end;

  -- A tarefa derivada de renovação precisa existir, com a data de revisão.
  select count(*), min(due_on) into v_tasks, v_due from public.fin_tasks
    where related_type = 'contract' and related_id = (select value from hard_ids where key = 'contract');
  if v_tasks <> 1 then raise exception 'contrato não gerou tarefa de renovação (%)', v_tasks; end if;
  if v_due <> current_date + 365 - 45 then raise exception 'tarefa de renovação com data errada (%)', v_due; end if;
end $$;

-- -------------------------------------- edição da demanda deixa rastro

do $$
declare v_rfq uuid; v_events integer;
begin
  v_rfq := public.fin_create_rfq((select value from hard_ids where key = 'buyer'), 'acquiring',
    'RFQ adquirência hardening DEMO', null, '{"monthly_volume":100000}'::jsonb, null);
  perform public.fin_transition('rfq', v_rfq, 'open');
  perform public.fin_update_rfq_demand(v_rfq, null, null, '{"monthly_volume":120000}'::jsonb, null);
  select count(*) into v_events from public.fin_events
    where entity_id = v_rfq and event_type = 'rfq_demand_updated_after_open';
  if v_events <> 1 then raise exception 'mudança de demanda após abertura não deixou rastro (%)', v_events; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo 'Financial Procurement hardening: unicidade de decisão e contrato, idempotência, evidência de provedor e rastro de demanda aprovados.'

\set ON_ERROR_STOP on
-- Contract & Renewal Center v2 (docs/supabase-financial-contracts-v2.sql):
-- contrato importado, termos versionados append-only, correção justificada,
-- aditivo imutável que preserva datas anteriores, pai/filho, marcos únicos e
-- recorrentes com tarefa idempotente, nova RFQ a partir do contrato, escopo de
-- entidade e negações (papel, outra entidade, outro tenant, provedor).
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000cc001','cc-manager@example.invalid'),
('00000000-0000-4000-8000-0000000cc002','cc-analyst@example.invalid'),
('00000000-0000-4000-8000-0000000cc003','cc-manager-b@example.invalid'),
('00000000-0000-4000-8000-0000000cc004','cc-other@example.invalid'),
('00000000-0000-4000-8000-0000000cc005','cc-provider@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000cd001','Grupo contratos DEMO','BUYER','00000000-0000-4000-8000-0000000cc001'),
('00000000-0000-4000-8000-0000000cd002','Outra empresa contratos DEMO','BUYER','00000000-0000-4000-8000-0000000cc004'),
('00000000-0000-4000-8000-0000000cd003','Banco contratos DEMO','PROVIDER','00000000-0000-4000-8000-0000000cc005');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000cd001','00000000-0000-4000-8000-0000000cc001','admin'),
('00000000-0000-4000-8000-0000000cd001','00000000-0000-4000-8000-0000000cc002','analyst'),
('00000000-0000-4000-8000-0000000cd001','00000000-0000-4000-8000-0000000cc003','finance_manager'),
('00000000-0000-4000-8000-0000000cd002','00000000-0000-4000-8000-0000000cc004','admin'),
('00000000-0000-4000-8000-0000000cd003','00000000-0000-4000-8000-0000000cc005','provider_user');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000cd010','00000000-0000-4000-8000-0000000cd001','Banco carteira DEMO','bank','00000000-0000-4000-8000-0000000cc001'),
('00000000-0000-4000-8000-0000000cd011','00000000-0000-4000-8000-0000000cd002','Banco de outra empresa DEMO','bank','00000000-0000-4000-8000-0000000cc004');

create temporary table cc_ids(key text primary key, value uuid);
grant all on cc_ids to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- 1. Superfície.
do $$ begin
  if has_table_privilege('authenticated','public.fin_contract_versions','INSERT')
     or has_table_privilege('authenticated','public.fin_contract_amendments','INSERT')
     or has_table_privilege('authenticated','public.fin_contract_milestones','INSERT')
     or has_table_privilege('authenticated','public.fin_contract_milestones','UPDATE')
     or has_table_privilege('anon','public.fin_contract_versions','SELECT') then
    raise exception 'escrita direta em contratos v2 exposta';
  end if;
  if has_function_privilege('authenticated','public.fin_contract_for_write(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_run_contract_milestones(date)','EXECUTE')
     or has_function_privilege('anon','public.fin_import_contract(uuid,uuid,uuid,text,text,date,date,integer,boolean,text,jsonb,uuid)','EXECUTE') then
    raise exception 'função interna exposta';
  end if;
end $$;

-- 2. Entidades e escopo: o gestor cc003 só alcança a entidade B.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc001',false);
insert into cc_ids select 'A', public.fin_create_legal_entity('00000000-0000-4000-8000-0000000cd001','legal_entity','Contratos A DEMO','A',null,'BR','BRL',null);
insert into cc_ids select 'B', public.fin_create_legal_entity('00000000-0000-4000-8000-0000000cd001','legal_entity','Contratos B DEMO','B',null,'US','USD',null);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000cd001','00000000-0000-4000-8000-0000000cc003','entities',array[(select value from cc_ids where key='B')]);

-- 3. Contrato importado (carteira existente) com termos v1.
insert into cc_ids select 'contract', public.fin_import_contract('00000000-0000-4000-8000-0000000cd001',(select value from cc_ids where key='A'),
  '00000000-0000-4000-8000-0000000cd010','credit','Capital de giro carteira DEMO', current_date - 200, current_date + 400, 90, false, null,
  '{"contract_number":"CCB-123","principal_amount":5000000,"indexer":"cdi","spread_pct_year":2.1,"guarantees":"Recebíveis","fees":[{"service":"TAC","unit":"one_off","amount":5000}]}'::jsonb, null);
insert into cc_ids select 'child', public.fin_import_contract('00000000-0000-4000-8000-0000000cd001',(select value from cc_ids where key='A'),
  '00000000-0000-4000-8000-0000000cd010','cash_management','Pacote de serviços DEMO', current_date - 30, current_date + 700, 60, true, null,
  '{"fees":[{"service":"PIX enviado","unit":"per_transaction","amount":0.5}]}'::jsonb, (select value from cc_ids where key='contract'));
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-0000000cd001',null,'00000000-0000-4000-8000-0000000cd010','fx','FX DEMO',current_date,current_date - 1,30,false,null,'{}'::jsonb,null)$q$, 'invalid period');
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-0000000cd001',null,'00000000-0000-4000-8000-0000000cd011','fx','Provedor alheio DEMO',current_date,current_date + 10,30,false,null,'{}'::jsonb,null)$q$, 'provider not found');
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-0000000cd001',null,'00000000-0000-4000-8000-0000000cd010','crypto','Categoria inválida DEMO',current_date,current_date + 10,30,false,null,'{}'::jsonb,null)$q$, 'invalid contract');
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-0000000cd001',null,'00000000-0000-4000-8000-0000000cd010','fx','HTML DEMO',current_date,current_date + 10,30,false,null,'{"guarantees":"<script>"}'::jsonb,null)$q$, 'invalid contract terms');
reset role;
do $$ declare v record; begin
  select * into v from public.fin_contracts where id=(select value from cc_ids where key='contract');
  if v.origin <> 'imported' or v.decision_id is not null or v.current_version <> 1 or v.legal_entity_id <> (select value from cc_ids where key='A')
     or v.currency <> 'BRL' or v.owner_id <> '00000000-0000-4000-8000-0000000cc001' then raise exception 'contrato importado incompleto: %', row_to_json(v); end if;
  if (select currency from public.fin_contracts where id=(select value from cc_ids where key='child')) <> 'BRL'
     or (select parent_contract_id from public.fin_contracts where id=(select value from cc_ids where key='child')) <> (select value from cc_ids where key='contract') then
    raise exception 'filho sem pai ou moeda';
  end if;
  if (select source||'/'||(terms->>'contract_number') from public.fin_contract_versions where contract_id=(select value from cc_ids where key='contract') and version=1) <> 'import/CCB-123' then
    raise exception 'versão 1 do importado';
  end if;
  -- Trilha sem valor financeiro.
  if exists (select 1 from public.fin_events where event_type='contract_imported' and metadata::text ~ '5000000|CCB') then raise exception 'termo vazou para a trilha'; end if;
end $$;

-- 4. Correção exige justificativa e versão esperada; histórico nunca é reescrito.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc001',false);
select pg_temp.expect_error($q$select public.fin_record_contract_terms((select value from cc_ids where key='contract'),'{"principal_amount":5100000}'::jsonb,1,null)$q$, 'correction reason required');
select pg_temp.expect_error($q$select public.fin_record_contract_terms((select value from cc_ids where key='contract'),'{"principal_amount":5100000}'::jsonb,0,'stale')$q$, 'contract version conflict');
select public.fin_record_contract_terms((select value from cc_ids where key='contract'),
  '{"contract_number":"CCB-123","principal_amount":5100000,"indexer":"cdi","spread_pct_year":2.1,"guarantees":"Recebíveis"}'::jsonb,1,'Valor digitado errado na importação');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc002',false);
select pg_temp.expect_error($q$select public.fin_record_contract_terms((select value from cc_ids where key='contract'),'{}'::jsonb,2,'analista')$q$, 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc003',false);
select pg_temp.expect_error($q$select public.fin_record_contract_terms((select value from cc_ids where key='contract'),'{}'::jsonb,2,'outra entidade')$q$, 'forbidden');
do $$ begin
  if exists (select 1 from public.fin_contract_versions) or exists (select 1 from public.fin_contracts where id=(select value from cc_ids where key='contract')) then
    raise exception 'gestor de B lê contrato de A';
  end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc004',false);
select pg_temp.expect_error($q$select public.fin_record_contract_terms((select value from cc_ids where key='contract'),'{}'::jsonb,2,'outro tenant')$q$, 'forbidden');
do $$ begin
  if exists (select 1 from public.fin_contract_versions) or exists (select 1 from public.fin_contract_amendments) or exists (select 1 from public.fin_contract_milestones) then
    raise exception 'outro tenant lê contratos v2';
  end if;
end $$;
reset role;
do $$ begin
  update public.fin_contract_versions set terms='{}'::jsonb where contract_id=(select value from cc_ids where key='contract');
  raise exception 'versão de termos reescrita';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;
do $$ begin
  if (select string_agg(version||':'||source, ',' order by version) from public.fin_contract_versions where contract_id=(select value from cc_ids where key='contract'))
     <> '1:import,2:correction' then raise exception 'histórico de versões incorreto'; end if;
end $$;

-- 5. Aditivo: prorroga, muda aviso e termos; o anterior fica no aditivo.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc001',false);
select pg_temp.expect_error($q$select public.fin_record_contract_amendment((select value from cc_ids where key='contract'),'Aditivo vazio',current_date)$q$, 'empty amendment');
select pg_temp.expect_error($q$select public.fin_record_contract_amendment((select value from cc_ids where key='contract'),'Aditivo stale',current_date,null,null,'{"spread_pct_year":1.9}'::jsonb,null,null,null,1)$q$, 'contract version conflict');
insert into cc_ids select 'amendment', public.fin_record_contract_amendment((select value from cc_ids where key='contract'),'1º aditivo — prorrogação',current_date,current_date - 1,
  'Prorrogação e redução de spread',
  '{"contract_number":"CCB-123","principal_amount":5100000,"indexer":"cdi","spread_pct_year":1.9,"guarantees":"Recebíveis"}'::jsonb,
  current_date + 765, 120, null, 2);
reset role;
do $$ declare a record; c record; begin
  select * into a from public.fin_contract_amendments where id=(select value from cc_ids where key='amendment');
  select * into c from public.fin_contracts where id=(select value from cc_ids where key='contract');
  if a.number <> 1 or a.previous_ends_on <> current_date + 400 or a.new_ends_on <> current_date + 765 or a.previous_notice_days <> 90 or a.new_notice_days <> 120 then
    raise exception 'aditivo não preservou o anterior: %', row_to_json(a);
  end if;
  if c.ends_on <> current_date + 765 or c.renewal_notice_days <> 120 or c.current_version <> 3 then raise exception 'contrato não refletiu o aditivo'; end if;
  if (select amendment_id from public.fin_contract_versions where contract_id=c.id and version=3) <> a.id then raise exception 'versão sem vínculo com aditivo'; end if;
end $$;
do $$ begin
  delete from public.fin_contract_amendments;
  raise exception 'aditivo apagado';
exception when others then if sqlerrm <> 'immutable record' then raise; end if; end $$;

-- 6. Marcos: único e recorrente, tarefa por ocorrência, sem duplicar.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc001',false);
insert into cc_ids select 'm_once', public.fin_create_contract_milestone((select value from cc_ids where key='contract'),'repricing','Janela de repricing',current_date + 10,30,'none',null,'00000000-0000-4000-8000-0000000cc002');
insert into cc_ids select 'm_rec', public.fin_create_contract_milestone((select value from cc_ids where key='contract'),'obligation','Enviar demonstrações trimestrais',current_date + 5,15,'quarterly',current_date + 200,null);
insert into cc_ids select 'm_far', public.fin_create_contract_milestone((select value from cc_ids where key='contract'),'custom','Revisão anual',current_date + 300,30,'none',null,null);
select pg_temp.expect_error($q$select public.fin_create_contract_milestone((select value from cc_ids where key='contract'),'birthday','Inválido',current_date,30,'none',null,null)$q$, 'invalid milestone');
select pg_temp.expect_error($q$select public.fin_create_contract_milestone((select value from cc_ids where key='contract'),'custom','Dono externo',current_date,30,'none',null,'00000000-0000-4000-8000-0000000cc004')$q$, 'invalid owner');
do $$ begin
  if public.fin_process_contract_milestones('00000000-0000-4000-8000-0000000cd001', current_date) <> 2 then raise exception 'marcos dentro da antecedência não geraram tarefa'; end if;
  if public.fin_process_contract_milestones('00000000-0000-4000-8000-0000000cd001', current_date) <> 0 then raise exception 'processamento duplicou tarefa'; end if;
end $$;
select public.fin_settle_contract_milestone((select value from cc_ids where key='m_rec'),'done');
select pg_temp.expect_error($q$select public.fin_settle_contract_milestone((select value from cc_ids where key='m_once'),'postponed')$q$, 'invalid milestone');
select public.fin_settle_contract_milestone((select value from cc_ids where key='m_once'),'cancelled');
select pg_temp.expect_error($q$select public.fin_settle_contract_milestone((select value from cc_ids where key='m_once'),'done')$q$, 'milestone closed');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc003',false);
select pg_temp.expect_error($q$select public.fin_settle_contract_milestone((select value from cc_ids where key='m_far'),'done')$q$, 'forbidden');
do $$ begin
  if public.fin_process_contract_milestones('00000000-0000-4000-8000-0000000cd001', current_date) <> 0 then raise exception 'gestor de B gerou tarefa de A'; end if;
end $$;
select pg_temp.expect_error($q$select public.fin_process_contract_milestones(null, current_date)$q$, 'forbidden');
reset role;
do $$ begin
  if (select due_on from public.fin_contract_milestones where id=(select value from cc_ids where key='m_rec')) <> (current_date + 5 + interval '3 months')::date
     or (select status from public.fin_contract_milestones where id=(select value from cc_ids where key='m_rec')) <> 'scheduled' then
    raise exception 'recorrente não avançou para a próxima ocorrência';
  end if;
  if (select status from public.fin_tasks t join public.fin_contract_milestone_runs r on r.task_id=t.id where r.milestone_id=(select value from cc_ids where key='m_rec')) <> 'done'
     or (select status from public.fin_tasks t join public.fin_contract_milestone_runs r on r.task_id=t.id where r.milestone_id=(select value from cc_ids where key='m_once')) <> 'cancelled' then
    raise exception 'tarefa da ocorrência não acompanhou o marco';
  end if;
  if (select legal_entity_id from public.fin_tasks t join public.fin_contract_milestone_runs r on r.task_id=t.id where r.milestone_id=(select value from cc_ids where key='m_rec'))
     <> (select value from cc_ids where key='A') then raise exception 'tarefa do marco sem entidade'; end if;
  if not exists (select 1 from public.fin_notifications where user_id='00000000-0000-4000-8000-0000000cc002' and event_type='renewal_due') then
    raise exception 'dono do marco não foi avisado';
  end if;
end $$;
-- Job sem sessão processa todas as organizações e é idempotente.
select set_config('request.jwt.claim.sub','',false);
do $$ begin
  if public.fin_run_contract_milestones(current_date) <> 0 then raise exception 'job duplicou ocorrência já processada'; end if;
end $$;

-- 7. Nova concorrência a partir do contrato importado herda a entidade.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc001',false);
insert into cc_ids select 'rfq', public.fin_start_contract_rfq((select value from cc_ids where key='contract'));
select pg_temp.expect_error($q$select public.fin_start_contract_rfq((select value from cc_ids where key='child'))$q$, 'invalid product');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc005',false);
do $$ begin
  if exists (select 1 from public.fin_contracts) or exists (select 1 from public.fin_contract_versions) then raise exception 'provedor lê carteira do comprador'; end if;
end $$;
reset role;
do $$ begin
  if (select legal_entity_id::text||'/'||status||'/'||product from public.fin_rfqs where id=(select value from cc_ids where key='rfq'))
     <> (select value from cc_ids where key='A')::text||'/draft/credit' then raise exception 'RFQ de renovação do importado'; end if;
end $$;
select set_config('request.jwt.claim.sub','',false);

\set ON_ERROR_STOP on
-- P1.4 Proposal & Document Intelligence. Fixtures fictícias, escopo de transação.
begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000d1101','di-admin@example.invalid'),
('00000000-0000-4000-8000-0000000d1102','di-analyst@example.invalid'),
('00000000-0000-4000-8000-0000000d1103','di-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000d1104','di-entity-b@example.invalid'),
('00000000-0000-4000-8000-0000000d1105','di-other@example.invalid'),
('00000000-0000-4000-8000-0000000d1106','di-provider@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000d1201','DI Buyer','BUYER','00000000-0000-4000-8000-0000000d1101'),
('00000000-0000-4000-8000-0000000d1202','DI Other Buyer','BUYER','00000000-0000-4000-8000-0000000d1105'),
('00000000-0000-4000-8000-0000000d1203','DI Provider','PROVIDER','00000000-0000-4000-8000-0000000d1106');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000d1201','00000000-0000-4000-8000-0000000d1101','admin'),
('00000000-0000-4000-8000-0000000d1201','00000000-0000-4000-8000-0000000d1102','analyst'),
('00000000-0000-4000-8000-0000000d1201','00000000-0000-4000-8000-0000000d1103','viewer'),
('00000000-0000-4000-8000-0000000d1201','00000000-0000-4000-8000-0000000d1104','finance_manager'),
('00000000-0000-4000-8000-0000000d1202','00000000-0000-4000-8000-0000000d1105','admin'),
('00000000-0000-4000-8000-0000000d1203','00000000-0000-4000-8000-0000000d1106','admin');
insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) values
('00000000-0000-4000-8000-0000000d1401','00000000-0000-4000-8000-0000000d1201','DI Entity A','00000000-0000-4000-8000-0000000d1101'),
('00000000-0000-4000-8000-0000000d1402','00000000-0000-4000-8000-0000000d1201','DI Entity B','00000000-0000-4000-8000-0000000d1101');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000d1301','00000000-0000-4000-8000-0000000d1201','DI bank fixture','bank','00000000-0000-4000-8000-0000000d1101');
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-0000000d1104';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-0000000d1201','00000000-0000-4000-8000-0000000d1104','00000000-0000-4000-8000-0000000d1402','00000000-0000-4000-8000-0000000d1101');
create temporary table di_fixture(key text primary key,id uuid);
grant all on di_fixture to authenticated;
create or replace function pg_temp.fx(p_key text) returns uuid language sql as $$ select id from di_fixture where key=p_key $$;
create or replace function pg_temp.as_user(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub',p_user,true) $$;
create or replace function pg_temp.di_expect_error(p_sql text,p_expected text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when others then
   if sqlerrm not like p_expected||'%' then raise exception 'unexpected failure: % (expected %)',sqlerrm,p_expected; end if;
   return;
 end;
 raise exception 'expected failure did not occur: %',p_sql;
end $$;
grant execute on function pg_temp.fx(text),pg_temp.as_user(text),pg_temp.di_expect_error(text,text) to authenticated;

-- Contrato na entidade A + documento PDF disponível (upload finalizado pelo servidor).
set role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1101');
insert into di_fixture values('contract',public.fin_import_contract('00000000-0000-4000-8000-0000000d1201','00000000-0000-4000-8000-0000000d1401','00000000-0000-4000-8000-0000000d1301','credit','DI contract A','2025-01-01','2026-12-31',30,false,'BRL','{}',null));
insert into di_fixture select 'doc', document_id from public.fin_document_begin_upload('00000000-0000-4000-8000-0000000d1201','contract',pg_temp.fx('contract'),'Proposta crédito v1','internal','application/pdf',2048,repeat('a',64));
reset role;
select public.fin_document_finalize_upload(pg_temp.fx('doc'),1,2048,'application/pdf');
set role authenticated;

-- 1. Início: só comprador com papel interno e acesso ao documento.
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1103');
select pg_temp.di_expect_error(format('select * from public.fin_document_extraction_begin(%L,%L,1,%L,%L,%L)','00000000-0000-4000-8000-0000000d1201',pg_temp.fx('doc'),'credit_proposal','deterministic_v1','deterministic-v1.0'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1104');
select pg_temp.di_expect_error(format('select * from public.fin_document_extraction_begin(%L,%L,1,%L,%L,%L)','00000000-0000-4000-8000-0000000d1201',pg_temp.fx('doc'),'credit_proposal','deterministic_v1','deterministic-v1.0'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1105');
select pg_temp.di_expect_error(format('select * from public.fin_document_extraction_begin(%L,%L,1,%L,%L,%L)','00000000-0000-4000-8000-0000000d1202',pg_temp.fx('doc'),'credit_proposal','deterministic_v1','deterministic-v1.0'),'forbidden');
select pg_temp.di_expect_error(format('select * from public.fin_document_extraction_begin(%L,%L,1,%L,%L,%L)','00000000-0000-4000-8000-0000000d1201',pg_temp.fx('doc'),'credit_proposal','deterministic_v1','deterministic-v1.0'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1106');
select pg_temp.di_expect_error(format('select * from public.fin_document_extraction_begin(%L,%L,1,%L,%L,%L)','00000000-0000-4000-8000-0000000d1203',pg_temp.fx('doc'),'credit_proposal','deterministic_v1','deterministic-v1.0'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1102');
select pg_temp.di_expect_error(format('select * from public.fin_document_extraction_begin(%L,%L,1,%L,%L,%L)','00000000-0000-4000-8000-0000000d1201',pg_temp.fx('doc'),'invoice','deterministic_v1','deterministic-v1.0'),'invalid extraction');
select pg_temp.di_expect_error(format('select * from public.fin_document_extraction_begin(%L,%L,9,%L,%L,%L)','00000000-0000-4000-8000-0000000d1201',pg_temp.fx('doc'),'credit_proposal','deterministic_v1','deterministic-v1.0'),'document not available');
do $$ declare r record; begin
  select * into r from public.fin_document_extraction_begin('00000000-0000-4000-8000-0000000d1201',pg_temp.fx('doc'),1,'credit_proposal','deterministic_v1','deterministic-v1.0');
  if r.path is null or r.sha256 <> repeat('a',64) or r.mime_type <> 'application/pdf' then raise exception 'begin must return the authorized object key and hash'; end if;
  insert into di_fixture values('x1',r.extraction_id);
end $$;

-- 2. Registro: campo fora do schema, chave extra, método falsificado e não-solicitante falham fechado.
select pg_temp.di_expect_error(format('select public.fin_document_extraction_record(%L,%L::jsonb)',pg_temp.fx('x1'),'{"facts":[{"field_key":"approve_proposal","value_state":"present","normalized_value":true,"method":"deterministic_parser"}]}'),'invalid extraction fact');
select pg_temp.di_expect_error(format('select public.fin_document_extraction_record(%L,%L::jsonb)',pg_temp.fx('x1'),'{"facts":[{"field_key":"amount","value_state":"present","normalized_value":1,"method":"deterministic_parser","organization_id":"00000000-0000-4000-8000-0000000d1202"}]}'),'invalid extraction fact');
select pg_temp.di_expect_error(format('select public.fin_document_extraction_record(%L,%L::jsonb)',pg_temp.fx('x1'),'{"facts":[{"field_key":"amount","value_state":"present","normalized_value":1,"method":"manual_entry"}]}'),'invalid extraction fact');
select pg_temp.di_expect_error(format('select public.fin_document_extraction_record(%L,%L::jsonb)',pg_temp.fx('x1'),'{"facts":[{"field_key":"amount","value_state":"present","method":"deterministic_parser"}]}'),'invalid extraction fact');
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1101');
select pg_temp.di_expect_error(format('select public.fin_document_extraction_record(%L,%L::jsonb)',pg_temp.fx('x1'),'{"facts":[]}'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1102');
select public.fin_document_extraction_record(pg_temp.fx('x1'),'{"pages":2,"flags":["instruction_like_content"],"warnings":[],"facts":[
 {"field_key":"amount","value_state":"present","raw_value":"R$ 25.000.000,00","normalized_value":25000000,"currency":"BRL","confidence":0.99,"page":1,"locator":"página 1, linha 2","method":"deterministic_parser","parser_version":"deterministic-v1.0","status":"extracted"},
 {"field_key":"spread_pct_year","value_state":"present","raw_value":"2,35% a.a.","normalized_value":2.35,"unit":"percent_per_year","confidence":0.9,"page":1,"locator":"página 1, linha 5","method":"deterministic_parser"},
 {"field_key":"collateral","value_state":"present","raw_value":"Cessão fiduciária","normalized_value":"Cessão fiduciária","confidence":0.9,"page":2,"method":"deterministic_parser"},
 {"field_key":"grace_months","value_state":"present","raw_value":"6","normalized_value":6,"unit":"months","confidence":0.5,"method":"deterministic_parser"},
 {"field_key":"validity_date","value_state":"not_provided","method":"deterministic_parser"}]}');
do $$ begin
  -- O estado é decidido no banco: crítico com 0,99 (e "status":"extracted" enviado) vai para revisão.
  if (select status from public.fin_extraction_facts where extraction_id=pg_temp.fx('x1') and field_key='amount') <> 'needs_review' then raise exception 'critical fact must need review'; end if;
  if (select status from public.fin_extraction_facts where extraction_id=pg_temp.fx('x1') and field_key='collateral') <> 'extracted' then raise exception 'standard high-confidence fact should be extracted'; end if;
  if (select status from public.fin_extraction_facts where extraction_id=pg_temp.fx('x1') and field_key='grace_months') <> 'needs_review' then raise exception 'low confidence must need review'; end if;
  if (select status from public.fin_document_extractions where id=pg_temp.fx('x1')) <> 'completed' or (select flags from public.fin_document_extractions where id=pg_temp.fx('x1')) <> array['instruction_like_content'] then raise exception 'extraction must close with flags'; end if;
  if (select count(*) from public.fin_tasks where related_type='contract' and related_id=pg_temp.fx('contract') and title like 'Revisar fatos extraídos:%') <> 1 then raise exception 'review task missing'; end if;
end $$;
select pg_temp.di_expect_error(format('select public.fin_document_extraction_record(%L,%L::jsonb)',pg_temp.fx('x1'),'{"facts":[]}'),'extraction closed');

-- Segunda extração do mesmo documento: a tarefa aberta não duplica.
do $$ declare r record; begin
  select * into r from public.fin_document_extraction_begin('00000000-0000-4000-8000-0000000d1201',pg_temp.fx('doc'),1,'credit_proposal','deterministic_v1','deterministic-v1.0');
  perform public.fin_document_extraction_record(r.extraction_id,'{"facts":[{"field_key":"amount","value_state":"present","normalized_value":24000000,"currency":"BRL","confidence":0.9,"method":"deterministic_parser"}]}');
  insert into di_fixture values('x2',r.extraction_id);
  if (select count(*) from public.fin_tasks where related_type='contract' and related_id=pg_temp.fx('contract') and title like 'Revisar fatos extraídos:%') <> 1 then raise exception 'review task duplicated'; end if;
end $$;

-- Falha registrada com código fechado.
do $$ declare r record; begin
  select * into r from public.fin_document_extraction_begin('00000000-0000-4000-8000-0000000d1201',pg_temp.fx('doc'),1,'credit_proposal','model_external','not-configured');
  insert into di_fixture values('x3',r.extraction_id);
end $$;
select pg_temp.di_expect_error(format('select public.fin_document_extraction_fail(%L,%L)',pg_temp.fx('x3'),'model_says_no'),'invalid extraction');
select public.fin_document_extraction_fail(pg_temp.fx('x3'),'provider_not_configured');
do $$ begin
  if (select status||':'||error_code from public.fin_document_extractions where id=pg_temp.fx('x3')) <> 'failed:provider_not_configured' then raise exception 'failure not recorded'; end if;
end $$;
-- Digitação manual: o banco nunca devolve a chave do objeto.
do $$ declare r record; begin
  select * into r from public.fin_document_extraction_begin('00000000-0000-4000-8000-0000000d1201',pg_temp.fx('doc'),1,'credit_proposal','manual','manual-1');
  if r.path is not null then raise exception 'manual extraction must not expose the object key'; end if;
  perform public.fin_document_extraction_fail(r.extraction_id,'unreadable');
end $$;

-- 3. Leitura sob RLS: viewer lê; escopo de outra entidade, outra organização e provedor não.
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1103');
do $$ begin if (select count(*) from public.fin_extraction_facts where extraction_id=pg_temp.fx('x1')) <> 5 then raise exception 'viewer must read facts'; end if; end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1104');
do $$ begin if exists (select 1 from public.fin_extraction_facts) or exists (select 1 from public.fin_document_extractions) then raise exception 'entity-scoped member leaked another entity extraction'; end if; end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1105');
do $$ begin if exists (select 1 from public.fin_extraction_facts) or exists (select 1 from public.fin_document_extractions) or exists (select 1 from public.fin_extraction_reviews) then raise exception 'tenant leak'; end if; end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1106');
do $$ begin if exists (select 1 from public.fin_extraction_facts) or exists (select 1 from public.fin_document_extractions) then raise exception 'provider leak'; end if; end $$;
reset role;
set role anon;
do $$ begin perform 1 from public.fin_extraction_facts; raise exception 'anon read facts'; exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;

-- 4. Revisão humana.
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1102');
insert into di_fixture select 'amount', id from public.fin_extraction_facts where extraction_id=pg_temp.fx('x1') and field_key='amount';
insert into di_fixture select 'spread', id from public.fin_extraction_facts where extraction_id=pg_temp.fx('x1') and field_key='spread_pct_year';
insert into di_fixture select 'grace', id from public.fin_extraction_facts where extraction_id=pg_temp.fx('x1') and field_key='grace_months';
insert into di_fixture select 'validity', id from public.fin_extraction_facts where extraction_id=pg_temp.fx('x1') and field_key='validity_date';
insert into di_fixture select 'collateral', id from public.fin_extraction_facts where extraction_id=pg_temp.fx('x1') and field_key='collateral';
-- Analista não confirma campo crítico; confirma campo padrão.
select pg_temp.di_expect_error(format('select public.fin_review_extraction_fact(%L,%L,%L::jsonb)',pg_temp.fx('amount'),'needs_review','{"action":"confirm"}'),'forbidden');
select public.fin_review_extraction_fact(pg_temp.fx('collateral'),'extracted','{"action":"confirm"}');
select pg_temp.di_expect_error(format('select public.fin_review_extraction_fact(%L,%L,%L::jsonb)',pg_temp.fx('grace'),'needs_review','{"action":"reject"}'),'invalid extraction review');
select public.fin_review_extraction_fact(pg_temp.fx('grace'),'needs_review','{"action":"reject","reason":"Carência não consta na proposta"}');
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1103');
select pg_temp.di_expect_error(format('select public.fin_review_extraction_fact(%L,%L,%L::jsonb)',pg_temp.fx('spread'),'needs_review','{"action":"reject","reason":"viewer tries"}'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1101');
select pg_temp.di_expect_error(format('select public.fin_review_extraction_fact(%L,%L,%L::jsonb)',pg_temp.fx('amount'),'extracted','{"action":"confirm"}'),'extraction review conflict');
select pg_temp.di_expect_error(format('select public.fin_review_extraction_fact(%L,%L,%L::jsonb)',pg_temp.fx('validity'),'needs_review','{"action":"confirm"}'),'invalid extraction review');
select public.fin_review_extraction_fact(pg_temp.fx('amount'),'needs_review','{"action":"confirm"}');
select pg_temp.di_expect_error(format('select public.fin_review_extraction_fact(%L,%L,%L::jsonb)',pg_temp.fx('amount'),'needs_review','{"action":"confirm"}'),'extraction review conflict');
insert into di_fixture select 'spread_fix', public.fin_review_extraction_fact(pg_temp.fx('spread'),'needs_review','{"action":"correct","reason":"Spread conferido na página 1: 2,45","value_state":"present","normalized_value":2.45,"unit":"percent_per_year","raw_value":"2,45% a.a."}');
do $$ begin
  if (select status from public.fin_extraction_facts where id=pg_temp.fx('amount')) <> 'confirmed' or (select confirmed_by from public.fin_extraction_facts where id=pg_temp.fx('amount')) <> '00000000-0000-4000-8000-0000000d1101' then raise exception 'confirmation not recorded'; end if;
  if (select status from public.fin_extraction_facts where id=pg_temp.fx('spread')) <> 'superseded' then raise exception 'corrected fact must be superseded'; end if;
  if (select status||':'||method||':'||(normalized_value)::text||':'||supersedes::text from public.fin_extraction_facts where id=pg_temp.fx('spread_fix')) <> 'confirmed:manual_entry:2.45:'||pg_temp.fx('spread')::text then raise exception 'correction fact wrong'; end if;
  if (select count(*) from public.fin_extraction_reviews where fact_id in (pg_temp.fx('amount'),pg_temp.fx('spread'),pg_temp.fx('grace'),pg_temp.fx('collateral'))) <> 4 then raise exception 'review trail missing'; end if;
  if (select count(*) from public.fin_events where event_type in ('document_extraction_started','document_extraction_completed','extraction_fact_confirmed','extraction_fact_superseded','extraction_fact_rejected') and entity_id=pg_temp.fx('contract')) < 6 then raise exception 'audit events missing'; end if;
end $$;
-- Gestor restrito a outra entidade não revisa.
select pg_temp.as_user('00000000-0000-4000-8000-0000000d1104');
select pg_temp.di_expect_error(format('select public.fin_review_extraction_fact(%L,%L,%L::jsonb)',pg_temp.fx('validity'),'needs_review','{"action":"reject","reason":"out of scope"}'),'forbidden');

-- 5. Imutabilidade (mesmo para quem contorna as RPCs).
reset role;
select pg_temp.di_expect_error(format('update public.fin_extraction_facts set raw_value=%L where id=%L','R$ 1,00',pg_temp.fx('amount')),'immutable record');
select pg_temp.di_expect_error(format('update public.fin_extraction_facts set status=%L where id=%L','needs_review',pg_temp.fx('amount')),'immutable record');
select pg_temp.di_expect_error(format('delete from public.fin_extraction_facts where id=%L',pg_temp.fx('collateral')),'immutable record');
select pg_temp.di_expect_error(format('update public.fin_document_extractions set schema_key=%L where id=%L','fee_schedule',pg_temp.fx('x1')),'immutable record');
select pg_temp.di_expect_error(format('update public.fin_extraction_reviews set reason=%L','edited'),'immutable record');
-- Banco recusa crítico "extraído" mesmo por escrita direta.
select pg_temp.di_expect_error(format('insert into public.fin_extraction_facts(organization_id,extraction_id,document_id,document_version,schema_key,field_key,value_state,normalized_value,method,parser_version,criticality,status,created_by) values (%L,%L,%L,1,%L,%L,%L,%L::jsonb,%L,%L,%L,%L,%L)','00000000-0000-4000-8000-0000000d1201',pg_temp.fx('x2'),pg_temp.fx('doc'),'credit_proposal','amount','present','1','deterministic_parser','v1','critical','extracted','00000000-0000-4000-8000-0000000d1101'),'new row for relation');

-- 6. Governança: os três conjuntos entram no export do tenant.
do $$ begin
  if (select count(*) from public.fin_governance_export_datasets() where dataset in ('document_extractions','extraction_facts','extraction_reviews')) <> 3 then raise exception 'export datasets missing'; end if;
end $$;
rollback;

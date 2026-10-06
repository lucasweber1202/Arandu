\set ON_ERROR_STOP on
-- Provider Qualification & Due Diligence. Fixtures fictícias, escopo de transação.
begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000a7101','pq-admin@example.invalid'),
('00000000-0000-4000-8000-0000000a7102','pq-analyst@example.invalid'),
('00000000-0000-4000-8000-0000000a7103','pq-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000a7104','pq-entity-b@example.invalid'),
('00000000-0000-4000-8000-0000000a7105','pq-other@example.invalid'),
('00000000-0000-4000-8000-0000000a7106','pq-provider@example.invalid'),
('00000000-0000-4000-8000-0000000a7107','pq-manager@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000a7201','PQ Buyer','BUYER','00000000-0000-4000-8000-0000000a7101'),
('00000000-0000-4000-8000-0000000a7202','PQ Other Buyer','BUYER','00000000-0000-4000-8000-0000000a7105'),
('00000000-0000-4000-8000-0000000a7203','PQ Provider','PROVIDER','00000000-0000-4000-8000-0000000a7106');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7101','admin'),
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7102','analyst'),
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7103','viewer'),
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7104','finance_manager'),
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7107','finance_manager'),
('00000000-0000-4000-8000-0000000a7202','00000000-0000-4000-8000-0000000a7105','admin'),
('00000000-0000-4000-8000-0000000a7203','00000000-0000-4000-8000-0000000a7106','admin');
insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) values
('00000000-0000-4000-8000-0000000a7401','00000000-0000-4000-8000-0000000a7201','PQ Entity A','00000000-0000-4000-8000-0000000a7101'),
('00000000-0000-4000-8000-0000000a7402','00000000-0000-4000-8000-0000000a7201','PQ Entity B','00000000-0000-4000-8000-0000000a7101');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7201','PQ bank fixture','bank','00000000-0000-4000-8000-0000000a7101');
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-0000000a7104';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7104','00000000-0000-4000-8000-0000000a7402','00000000-0000-4000-8000-0000000a7101');
create temporary table pq_fixture(key text primary key,id uuid);
grant all on pq_fixture to authenticated;
create or replace function pg_temp.fx(p_key text) returns uuid language sql as $$ select id from pq_fixture where key=p_key $$;
create or replace function pg_temp.as_user(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub',p_user,true) $$;
create or replace function pg_temp.pq_expect_error(p_sql text,p_expected text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when others then
   if sqlerrm not like p_expected||'%' then raise exception 'unexpected failure: % (expected %)',sqlerrm,p_expected; end if;
   return;
 end;
 raise exception 'expected failure did not occur: %',p_sql;
end $$;
grant execute on function pg_temp.fx(text),pg_temp.as_user(text),pg_temp.pq_expect_error(text,text) to authenticated;
set role authenticated;

-- 1. Exigências: só admin define; versão nova aposenta a anterior.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7102');
select pg_temp.pq_expect_error(format('select public.fin_set_qualification_requirement(%L,%L::jsonb)','00000000-0000-4000-8000-0000000a7201','{"area":"legal","title":"Contrato social"}'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select pg_temp.pq_expect_error(format('select public.fin_set_qualification_requirement(%L,%L::jsonb)','00000000-0000-4000-8000-0000000a7201','{"area":"astrology","title":"Mapa astral"}'),'invalid qualification requirement');
select pg_temp.pq_expect_error(format('select public.fin_set_qualification_requirement(%L,%L::jsonb)','00000000-0000-4000-8000-0000000a7201','{"area":"legal","title":"Contrato social","organization_id":"00000000-0000-4000-8000-0000000a7202"}'),'invalid qualification requirement');
insert into pq_fixture values('req_legal',public.fin_set_qualification_requirement('00000000-0000-4000-8000-0000000a7201','{"area":"legal","title":"Contrato social e poderes","critical":true,"validity_days":365}'));
insert into pq_fixture values('req_sec',public.fin_set_qualification_requirement('00000000-0000-4000-8000-0000000a7201','{"area":"security","title":"Relatório de segurança (SOC 2 ou equivalente)","category":"acquiring"}'));
insert into pq_fixture values('req_fx',public.fin_set_qualification_requirement('00000000-0000-4000-8000-0000000a7201','{"area":"category_specific","title":"Autorização para câmbio","category":"fx"}'));
insert into pq_fixture values('req_legal_v2',public.fin_set_qualification_requirement('00000000-0000-4000-8000-0000000a7201',jsonb_build_object('requirement_key',(select requirement_key from public.fin_qualification_requirements where id=pg_temp.fx('req_legal')),'area','legal','title','Contrato social, poderes e certidões','critical',true,'validity_days',365)));
do $$ begin
  if (select status from public.fin_qualification_requirements where id=pg_temp.fx('req_legal'))<>'retired' or (select version from public.fin_qualification_requirements where id=pg_temp.fx('req_legal_v2'))<>2 then raise exception 'requirement versioning broken'; end if;
end $$;

-- 2. Abrir qualificação: escopo de entidade, duplicidade, dono elegível.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7102');
select pg_temp.pq_expect_error(format('select public.fin_open_provider_qualification(%L,%L,%L,%L,null,null)','00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7401','acquiring'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7104');
select pg_temp.pq_expect_error(format('select public.fin_open_provider_qualification(%L,%L,%L,%L,null,null)','00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7401','acquiring'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7105');
select pg_temp.pq_expect_error(format('select public.fin_open_provider_qualification(%L,%L,null,%L,null,null)','00000000-0000-4000-8000-0000000a7202','00000000-0000-4000-8000-0000000a7301','acquiring'),'invalid qualification');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select pg_temp.pq_expect_error(format('select public.fin_open_provider_qualification(%L,%L,%L,%L,%L,null)','00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7401','acquiring','00000000-0000-4000-8000-0000000a7103'),'invalid qualification owner');
insert into pq_fixture values('q',public.fin_open_provider_qualification('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7401','acquiring','00000000-0000-4000-8000-0000000a7102',current_date+30));
select pg_temp.pq_expect_error(format('select public.fin_open_provider_qualification(%L,%L,%L,%L,null,null)','00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7401','acquiring'),'qualification already exists');

-- 3. Estado: transição inválida, conflito, decisão sem prontidão.
select pg_temp.pq_expect_error(format('select public.fin_transition_provider_qualification(%L,%L,%L::jsonb)',pg_temp.fx('q'),'not_started','{"to_status":"qualified","reason":"Pular etapas não é permitido"}'),'invalid qualification transition');
select public.fin_transition_provider_qualification(pg_temp.fx('q'),'not_started','{"to_status":"in_progress"}');
select pg_temp.pq_expect_error(format('select public.fin_transition_provider_qualification(%L,%L,%L::jsonb)',pg_temp.fx('q'),'not_started','{"to_status":"pending_provider"}'),'qualification state conflict');
select public.fin_transition_provider_qualification(pg_temp.fx('q'),'in_progress','{"to_status":"pending_internal_review"}');
select pg_temp.pq_expect_error(format('select public.fin_transition_provider_qualification(%L,%L,%L::jsonb)',pg_temp.fx('q'),'pending_internal_review','{"to_status":"qualified","reason":"Tudo certo segundo o comercial"}'),'qualification requirements missing');

-- 4. Evidência: exigência de outra categoria/fora do escopo recusada; SoD na aceitação.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7102');
select pg_temp.pq_expect_error(format('select public.fin_record_qualification_evidence(%L,%L::jsonb)',pg_temp.fx('q'),json_build_object('requirement_id',pg_temp.fx('req_fx'),'source','internal','evidence_reference','FX-AUTH-1')),'invalid qualification evidence');
select pg_temp.pq_expect_error(format('select public.fin_record_qualification_evidence(%L,%L::jsonb)',pg_temp.fx('q'),json_build_object('requirement_id',pg_temp.fx('req_legal'),'source','internal','evidence_reference','OLD-VERSION')),'invalid qualification evidence');
select pg_temp.pq_expect_error(format('select public.fin_record_qualification_evidence(%L,%L::jsonb)',pg_temp.fx('q'),json_build_object('requirement_id',pg_temp.fx('req_legal_v2'),'source','external_service','evidence_reference','KYB-CHECK-1')),'invalid qualification evidence');
insert into pq_fixture values('ev_legal',public.fin_record_qualification_evidence(pg_temp.fx('q'),json_build_object('requirement_id',pg_temp.fx('req_legal_v2'),'source','external_service','external_service','Serviço KYB contratado (fictício)','evidence_reference','KYB-REPORT-2026-10')::jsonb));
insert into pq_fixture values('ev_sec',public.fin_record_qualification_evidence(pg_temp.fx('q'),json_build_object('requirement_id',pg_temp.fx('req_sec'),'source','provider','evidence_reference','SOC2-2026')::jsonb));
do $$ begin
  if (select valid_until from public.fin_qualification_evidence where id=pg_temp.fx('ev_legal')) <> current_date+365 then raise exception 'requirement validity not applied'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7103');
select pg_temp.pq_expect_error(format('select public.fin_review_qualification_evidence(%L,%L::jsonb)',pg_temp.fx('ev_legal'),'{"status":"accepted"}'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select public.fin_review_qualification_evidence(pg_temp.fx('ev_legal'),'{"status":"accepted"}');
select pg_temp.pq_expect_error(format('select public.fin_review_qualification_evidence(%L,%L::jsonb)',pg_temp.fx('ev_legal'),'{"status":"accepted"}'),'qualification evidence conflict');
select pg_temp.pq_expect_error(format('select public.fin_review_qualification_evidence(%L,%L::jsonb)',pg_temp.fx('ev_sec'),'{"status":"rejected"}'),'invalid qualification evidence review');
-- Quem registrou não aceita a própria evidência.
insert into pq_fixture values('ev_own',public.fin_record_qualification_evidence(pg_temp.fx('q'),json_build_object('requirement_id',pg_temp.fx('req_sec'),'source','internal','evidence_reference','SELF-1')::jsonb));
select pg_temp.pq_expect_error(format('select public.fin_review_qualification_evidence(%L,%L::jsonb)',pg_temp.fx('ev_own'),'{"status":"accepted"}'),'segregation of duties');
select public.fin_review_qualification_evidence(pg_temp.fx('ev_sec'),'{"status":"rejected","reason":"Relatório vencido"}');

-- 5. Exceção com SoD; decisão com exceção só como "com condições".
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7102');
select pg_temp.pq_expect_error(format('select public.fin_request_qualification_exception(%L,%L::jsonb)',pg_temp.fx('q'),json_build_object('requirement_id',pg_temp.fx('req_sec'),'reason','Relatório anual em emissão','expires_on',current_date+400)),'invalid qualification exception');
insert into pq_fixture values('ex',public.fin_request_qualification_exception(pg_temp.fx('q'),json_build_object('requirement_id',pg_temp.fx('req_sec'),'reason','Relatório anual em emissão pelo auditor','compensating_controls','Carta de bridge do auditor','expires_on',current_date+90)::jsonb));
select pg_temp.pq_expect_error(format('select public.fin_request_qualification_exception(%L,%L::jsonb)',pg_temp.fx('q'),json_build_object('requirement_id',pg_temp.fx('req_sec'),'reason','Outra exceção para o mesmo item','expires_on',current_date+30)),'qualification exception already open');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7107');
select public.fin_decide_qualification_exception(pg_temp.fx('ex'),'{"status":"approved","reason":"Controle compensatório aceito"}');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select pg_temp.pq_expect_error(format('select public.fin_transition_provider_qualification(%L,%L,%L::jsonb)',pg_temp.fx('q'),'pending_internal_review','{"to_status":"qualified","reason":"Exigências atendidas e revisadas"}'),'qualification has exceptions');
select pg_temp.pq_expect_error(format('select public.fin_transition_provider_qualification(%L,%L,%L::jsonb)',pg_temp.fx('q'),'pending_internal_review','{"to_status":"qualified_with_conditions","reason":"Exigências atendidas e revisadas"}'),'invalid qualification transition');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7102');
select pg_temp.pq_expect_error(format('select public.fin_transition_provider_qualification(%L,%L,%L::jsonb)',pg_temp.fx('q'),'pending_internal_review','{"to_status":"qualified_with_conditions","reason":"Exigências atendidas e revisadas","conditions":"Entregar SOC 2 em 90 dias"}'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select public.fin_transition_provider_qualification(pg_temp.fx('q'),'pending_internal_review','{"to_status":"qualified_with_conditions","reason":"Exigências atendidas e revisadas","conditions":"Entregar SOC 2 em 90 dias"}');
do $$ begin
  if (select status||':'||valid_until from public.fin_provider_qualifications where id=pg_temp.fx('q')) <> 'qualified_with_conditions:'||(current_date+90) then raise exception 'validity must be the earliest of evidence/exception'; end if;
  if public.fin_provider_qualification_status('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7401','acquiring') <> 'conditional' then raise exception 'consult status wrong'; end if;
  if public.fin_provider_qualification_status('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7401','fx') <> 'unknown' then raise exception 'unknown category must be unknown'; end if;
  if (select count(*) from public.fin_qualification_events where qualification_id=pg_temp.fx('q')) < 9 then raise exception 'qualification audit trail incomplete'; end if;
end $$;

-- 6. Leitura sob RLS.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7103');
do $$ begin if (select count(*) from public.fin_provider_qualifications) <> 1 or (select count(*) from public.fin_qualification_evidence) <> 3 then raise exception 'viewer must read qualification'; end if; end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7104');
do $$ begin if exists (select 1 from public.fin_provider_qualifications) or exists (select 1 from public.fin_qualification_evidence) then raise exception 'entity-scoped member leaked'; end if; end $$;
select pg_temp.pq_expect_error(format('select public.fin_provider_qualification_status(%L,%L,%L,%L)','00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7401','acquiring'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7105');
do $$ begin if exists (select 1 from public.fin_provider_qualifications) or exists (select 1 from public.fin_qualification_requirements) or exists (select 1 from public.fin_qualification_events) then raise exception 'tenant leak'; end if; end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7106');
do $$ begin if exists (select 1 from public.fin_provider_qualifications) or exists (select 1 from public.fin_qualification_exceptions) then raise exception 'provider leak'; end if; end $$;
reset role;
set role anon;
do $$ begin perform 1 from public.fin_provider_qualifications; raise exception 'anon read'; exception when insufficient_privilege then null; end $$;
reset role;

-- 7. Vencimento pelo job (service role) e imutabilidade.
select set_config('request.jwt.claim.sub','',true);
select public.fin_run_qualification_expiry(current_date + 91);
do $$ begin
  if (select status from public.fin_provider_qualifications where id=pg_temp.fx('q')) <> 'expired' then raise exception 'expiry job did not expire'; end if;
  if (select status from public.fin_qualification_exceptions where id=pg_temp.fx('ex')) <> 'expired' then raise exception 'exception not expired'; end if;
end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select pg_temp.pq_expect_error('select public.fin_run_qualification_expiry(current_date)','permission denied');
select pg_temp.pq_expect_error(format('select public.fin_transition_provider_qualification(%L,%L,%L::jsonb)',pg_temp.fx('q'),'expired','{"to_status":"in_progress"}'),'invalid qualification transition');
select public.fin_transition_provider_qualification(pg_temp.fx('q'),'expired','{"to_status":"in_progress","reason":"Revalidação anual iniciada"}');
reset role;
select pg_temp.pq_expect_error(format('update public.fin_provider_qualifications set legal_entity_id=%L where id=%L','00000000-0000-4000-8000-0000000a7402',pg_temp.fx('q')),'immutable record');
select pg_temp.pq_expect_error(format('update public.fin_qualification_evidence set evidence_reference=%L where id=%L','FORGED',pg_temp.fx('ev_legal')),'immutable record');
select pg_temp.pq_expect_error(format('delete from public.fin_qualification_events where qualification_id=%L',pg_temp.fx('q')),'immutable record');
select pg_temp.pq_expect_error(format('update public.fin_qualification_exceptions set decided_by=requested_by where id=%L',pg_temp.fx('ex')),'immutable record');
do $$ begin
  if (select count(*) from public.fin_governance_export_datasets() where dataset like 'qualification%' or dataset='provider_qualifications') <> 5 then raise exception 'export datasets missing'; end if;
end $$;
rollback;

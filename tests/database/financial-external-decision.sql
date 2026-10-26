\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end $$;
create function pg_temp.denied(command text,pattern text) returns void language plpgsql as $$ begin
 begin execute command; exception when others then if sqlerrm ~ pattern then return; end if; raise; end;
 raise exception 'unexpected success: %',command;
end $$;
create function pg_temp.input(extra jsonb default '{}') returns jsonb language sql as $$ select
 '{"terms":{"offered_amount":100000,"interest_rate_month":1,"term_months":168,"institution":"Instituição declarada"},"state":"pending_review","channel":"manual","received_at":null,"source_reference":"Contato comercial fictício","rfq_revision":1,"currency":"BRL"}'::jsonb || extra $$;
insert into auth.users(id,email) select ('00000000-0000-4000-8000-0000000ea00'||n)::uuid,'external-'||n||'@example.invalid' from generate_series(1,7) n;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
 ('00000000-0000-4000-8000-0000000eb001','Buyer externo DEMO','BUYER','00000000-0000-4000-8000-0000000ea001'),
 ('00000000-0000-4000-8000-0000000eb002','Outro buyer DEMO','BUYER','00000000-0000-4000-8000-0000000ea004'),
 ('00000000-0000-4000-8000-0000000eb003','Portal da instituição DEMO','PROVIDER','00000000-0000-4000-8000-0000000ea005');
insert into public.fin_members(organization_id,user_id,role,entity_scope) values
 ('00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ea001','admin','group'),
 ('00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ea002','analyst','group'),
 ('00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ea003','viewer','group'),
 ('00000000-0000-4000-8000-0000000eb002','00000000-0000-4000-8000-0000000ea004','admin','group'),
 ('00000000-0000-4000-8000-0000000eb003','00000000-0000-4000-8000-0000000ea005','provider_user','group'),
 ('00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ea006','analyst','entities');
insert into public.fin_legal_entities(id,organization_id,kind,legal_name,created_by) values
 ('00000000-0000-4000-8000-0000000ee001','00000000-0000-4000-8000-0000000eb001','legal_entity','Entidade A DEMO','00000000-0000-4000-8000-0000000ea001'),
 ('00000000-0000-4000-8000-0000000ee002','00000000-0000-4000-8000-0000000eb001','legal_entity','Entidade B DEMO','00000000-0000-4000-8000-0000000ea001');
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
 ('00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ea006','00000000-0000-4000-8000-0000000ee001','00000000-0000-4000-8000-0000000ea001');
insert into public.fin_rfqs(id,organization_id,legal_entity_id,product,title,status,owner_id,demand) values
 ('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000eb001',null,'credit','RFQ externa DEMO','open','00000000-0000-4000-8000-0000000ea001','{}'),
 ('00000000-0000-4000-8000-0000000ec002','00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ee001','credit','RFQ entidade A DEMO','open','00000000-0000-4000-8000-0000000ea001','{}'),
 ('00000000-0000-4000-8000-0000000ec003','00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ee002','acquiring','RFQ entidade B DEMO','open','00000000-0000-4000-8000-0000000ea001','{}');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
 ('00000000-0000-4000-8000-0000000ed001','00000000-0000-4000-8000-0000000eb001','Instituição sem conta DEMO','bank','00000000-0000-4000-8000-0000000ea001'),
 ('00000000-0000-4000-8000-0000000ed002','00000000-0000-4000-8000-0000000eb002','Instituição alheia DEMO','bank','00000000-0000-4000-8000-0000000ea004');
create temporary table ext_ids(name text primary key,id uuid); grant all on ext_ids to authenticated;
insert into public.fin_members(organization_id,user_id,role) values('00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ea007','finance_manager');
create function pg_temp.command(op text,k text,payload jsonb default '{"criteria":{"weights":{}},"rationale":"Escolha humana demonstrativa"}',v integer default 1,rev integer default 1) returns jsonb language sql as $$ select public.fin_external_command((select id from ext_ids where name='external'),v,rev,k,op,payload) $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea002',true);
insert into ext_ids values('external',(public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','decision-create-1',0,null,pg_temp.input())->>'id')::uuid);
select pg_temp.denied($q$select pg_temp.command('decision','decision-analyst')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea001',true);
select pg_temp.denied($q$select pg_temp.command('decision','decision-unreviewed')$q$,'external review required');
select public.fin_external_proposal_review((select id from ext_ids where name='external'),1,'confirm','Material sintético conferido',true,false);
select pg_temp.assert_true((select decision_allowed from public.fin_external_proposal_current where id=(select id from ext_ids where name='external')),'eligible external selection');
select pg_temp.denied($q$select public.fin_record_decision_v2('00000000-0000-4000-8000-0000000ec001',(select id from ext_ids where name='external'),1)$q$,'external command required');
select pg_temp.denied($q$select pg_temp.command('decision','bad-version','{"criteria":{"weights":{}}}',2)$q$,'external version conflict');
select pg_temp.denied($q$select pg_temp.command('decision','bad-revision','{"criteria":{"weights":{}}}',1,2)$q$,'external version conflict');
select public.fin_set_approval_policy('00000000-0000-4000-8000-0000000eb001',true);
select pg_temp.denied($q$select pg_temp.command('decision','approval-missing')$q$,'approval required');
insert into ext_ids values('approval',(pg_temp.command('approval','external-approval-1','{"approver_ids":["00000000-0000-4000-8000-0000000ea007"],"rationale":"Revisar oferta externa sintética"}')->>'id')::uuid);
select pg_temp.assert_true((pg_temp.command('approval','external-approval-1','{"approver_ids":["00000000-0000-4000-8000-0000000ea007"],"rationale":"Revisar oferta externa sintética"}')->>'replayed')::boolean,'approval retry receipt');
select pg_temp.denied($q$select public.fin_act_on_approval_v2((select id from ext_ids where name='approval'),'approved')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea002',true);
select pg_temp.denied($q$select public.fin_act_on_approval_v2((select id from ext_ids where name='approval'),'approved')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea007',true);
select pg_temp.assert_true(public.fin_act_on_approval_v2((select id from ext_ids where name='approval'),'approved')='approved','canonical approval accepts typed source');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea001',true);
insert into ext_ids values('decision',(pg_temp.command('decision','external-decision-1')->>'id')::uuid);
select pg_temp.assert_true((pg_temp.command('decision','external-decision-1')->>'replayed')::boolean,'same decision intent returns original');
select pg_temp.denied($q$select pg_temp.command('decision','external-decision-1','{"criteria":{"weights":{}},"rationale":"Outra decisão material"}')$q$,'external intent conflict');
select pg_temp.denied($q$select pg_temp.command('decision','external-decision-2')$q$,'invalid state|decision already');
select pg_temp.assert_true((select proposal_id is null and external_proposal_version=1 and external_proposal_id=(select id from ext_ids where name='external') and snapshot->>'source_kind'='buyer_recorded_external' and snapshot->'selected_source'->>'issuer_identity'='buyer_attribution' and snapshot->'selected_source'->>'signature'='not_verified' from public.fin_decisions where id=(select id from ext_ids where name='decision')),'decision preserves typed authorship and version');
select pg_temp.assert_true((select count(*)=0 from public.fin_proposals),'no fabricated institutional proposal');
select pg_temp.assert_true((select count(*)=0 from public.fin_rfq_invites),'no fabricated invitation');
select pg_temp.assert_true((select count(*)=0 from public.fin_contracts),'decision creates no contract');
select pg_temp.denied($q$select public.fin_register_contract((select id from ext_ids where name='decision'),'2026-01-01','2040-01-01')$q$,'external command required');
insert into ext_ids values('contract',public.fin_import_contract('00000000-0000-4000-8000-0000000eb001',null,'00000000-0000-4000-8000-0000000ed001','credit','Contrato externo legítimo DEMO','2026-01-01','2040-01-01',60,false,'BRL','{}',null));
insert into ext_ids values('usd',public.fin_import_contract('00000000-0000-4000-8000-0000000eb001',null,'00000000-0000-4000-8000-0000000ed001','credit','Contrato moeda distinta DEMO','2026-01-01','2040-01-01',60,false,'USD','{}',null));
create function pg_temp.link(k text,c text,confirmed boolean default true,v integer default 1) returns jsonb language sql as $$ select pg_temp.command('contract',k,jsonb_build_object('decision_id',(select id from ext_ids where name='decision'),'contract_id',(select id from ext_ids where name=c),'expected_contract_version',v,'confirmed_contract_record',confirmed)) $$;
insert into ext_ids values('rate',public.fin_import_contract('00000000-0000-4000-8000-0000000eb001',null,'00000000-0000-4000-8000-0000000ed001','credit','Taxa diferente DEMO','2026-01-01','2040-01-01',60,false,'BRL','{"rate_pct_month":2}',null));
insert into ext_ids values('term',public.fin_import_contract('00000000-0000-4000-8000-0000000eb001',null,'00000000-0000-4000-8000-0000000ed001','credit','Prazo diferente DEMO','2026-01-01','2030-01-01',60,false,'BRL','{}',null));
select pg_temp.denied($q$select pg_temp.link('contract-wrong-rate','rate')$q$,'external contract conflict');
select pg_temp.denied($q$select pg_temp.link('contract-wrong-term','term')$q$,'external contract conflict');
select pg_temp.denied($q$select pg_temp.link('contract-no-confirm','contract',false)$q$,'invalid external contract confirmation');
select pg_temp.denied($q$select pg_temp.link('contract-wrong-currency','usd')$q$,'external contract conflict');
select pg_temp.denied($q$select pg_temp.link('contract-wrong-version','contract',true,2)$q$,'external contract conflict');
select pg_temp.assert_true((pg_temp.link('contract-link-1','contract')->>'id')::uuid=(select id from ext_ids where name='contract'),'explicit link uses existing contract');
select pg_temp.assert_true((pg_temp.link('contract-link-1','contract')->>'replayed')::boolean,'contract retry reconciles');
select pg_temp.denied($q$select pg_temp.link('contract-link-1','usd')$q$,'external intent conflict');
select pg_temp.denied($q$select pg_temp.link('contract-link-2','contract')$q$,'external contract conflict');
select pg_temp.assert_true((select origin='imported' and proposal_id is null and external_proposal_version=1 and decision_id=(select id from ext_ids where name='decision') from public.fin_contracts where id=(select id from ext_ids where name='contract')),'contract retains import origin and exact decision version');
select pg_temp.assert_true((select count(*)=1 from public.fin_contract_versions where contract_id=(select id from ext_ids where name='contract')),'link creates no replacement terms');
create temporary table frozen as select snapshot from public.fin_decisions where id=(select id from ext_ids where name='decision');
select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','post-decision-correction',1,(select id from ext_ids where name='external'),pg_temp.input('{"terms":{"offered_amount":200000},"correction_reason":"Correção superveniente demonstrativa"}'));
select pg_temp.assert_true((select d.snapshot=f.snapshot from public.fin_decisions d cross join frozen f where d.id=(select id from ext_ids where name='decision')),'later correction does not rewrite decision');
select pg_temp.assert_true((pg_temp.command('decision','external-decision-1')->>'replayed')::boolean,'timeout reconciliation after a later source version');
select pg_temp.assert_true((pg_temp.link('contract-link-1','contract')->>'replayed')::boolean,'link reconciliation after later source correction');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea004',true);
select pg_temp.assert_true((select count(*)=0 from public.fin_decisions),'other buyer sees no decision');
select pg_temp.denied($q$select pg_temp.command('decision','other-buyer-intent')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea005',true);
select pg_temp.assert_true((select count(*)=0 from public.fin_decisions),'provider sees no internal decision');
select pg_temp.assert_true((select count(*)=0 from public.fin_approval_requests),'provider sees no approval snapshot');
select pg_temp.denied($q$select pg_temp.command('decision','provider-intent')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea003',true);
select pg_temp.denied($q$select pg_temp.command('decision','reader-intent')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea006',true);
select pg_temp.denied($q$select pg_temp.command('decision','entity-intent')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea001',true);
insert into ext_ids select 'document',document_id from public.fin_document_begin_upload('00000000-0000-4000-8000-0000000eb001','rfq','00000000-0000-4000-8000-0000000ec002','Evidência externa DEMO','internal','application/pdf',100);
reset role;
select public.fin_document_finalize_upload((select id from ext_ids where name='document'),1,100,'application/pdf');
set local role authenticated;
insert into ext_ids values('document-source',(public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec002','00000000-0000-4000-8000-0000000ed001','decision-document-source',0,null,pg_temp.input(jsonb_build_object('document_id',(select id from ext_ids where name='document'),'document_version',1)))->>'id')::uuid);
select public.fin_external_proposal_review((select id from ext_ids where name='document-source'),1,'confirm','Documento sintético conferido',true,true);
reset role;
update public.fin_private_documents set removed_at=now() where id=(select id from ext_ids where name='document');
set local role authenticated;
select pg_temp.denied($q$select public.fin_external_command((select id from ext_ids where name='document-source'),1,1,'document-removed-intent','decision','{"criteria":{"weights":{}}}')$q$,'external document conflict');
select public.fin_revise_rfq('00000000-0000-4000-8000-0000000ec002',1,'Demanda revisada após transcrição',null,'{}',null);
select pg_temp.denied($q$select public.fin_external_command((select id from ext_ids where name='document-source'),1,1,'rfq-revised-intent','decision','{"criteria":{"weights":{}}}')$q$,'external version conflict');
reset role;
update public.fin_members set role='viewer' where organization_id='00000000-0000-4000-8000-0000000eb001' and user_id='00000000-0000-4000-8000-0000000ea001';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea001',true);
select pg_temp.denied($q$select pg_temp.command('decision','external-decision-1')$q$,'forbidden');
rollback;
\echo 'External decision: review, policy, SoD, typed snapshot, idempotency, explicit contract link, history and isolation passed.'

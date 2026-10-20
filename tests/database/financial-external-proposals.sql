\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end $$;
create function pg_temp.denied(command text,pattern text) returns void language plpgsql as $$ begin
 begin execute command; exception when others then if sqlerrm ~ pattern then return; end if; raise; end;
 raise exception 'unexpected success: %',command;
end $$;
create function pg_temp.input(extra jsonb default '{}') returns jsonb language sql as $$ select
 '{"terms":{"offered_amount":100000,"institution":"Instituição declarada"},"state":"pending_review","channel":"manual","received_at":null,"source_reference":"Contato comercial fictício","rfq_revision":1,"currency":"BRL"}'::jsonb || extra $$;
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
-- No portal organization, accepted invite or fake submission is created.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea002',true);
insert into ext_ids values('external',(public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','create-key-1',0,null,pg_temp.input())->>'id')::uuid);
select pg_temp.assert_true((public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','create-key-1',0,null,pg_temp.input())->>'replayed')::boolean,'retry create reconciles');
select pg_temp.assert_true((select count(*)=1 from public.fin_external_proposals),'one external proposal');
select pg_temp.assert_true((select recorded_by='00000000-0000-4000-8000-0000000ea002' from public.fin_external_proposals),'recording author comes from auth uid');
select pg_temp.assert_true((select received_at is null and recorded_at is not null from public.fin_external_proposal_current),'unknown receipt time is not invented from recording time');
select pg_temp.assert_true((select count(*)=0 from public.fin_rfq_invites),'no invitation required');
select pg_temp.assert_true((select not document_available and document_state='not_presented' from public.fin_external_proposal_current),'no linked document is not presented, not available');
select pg_temp.assert_true((select not (terms ? 'cet_year') and not (terms ? 'interest_rate_month') from public.fin_external_proposal_current),'missing rates stay absent');
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','create-key-1',0,null,pg_temp.input('{"currency":"USD"}'))$q$,'external proposal conflict');
select pg_temp.denied($q$select public.fin_external_proposal_review((select id from ext_ids where name='external'),1,'confirm','Conferência material fictícia',true,false)$q$,'forbidden');
-- Direct critical writes are denied even to a legitimate writer.
select pg_temp.denied($q$update public.fin_external_proposals set state='reviewed'$q$,'permission denied');
select pg_temp.denied($q$delete from public.fin_external_proposal_versions$q$,'permission denied');
select pg_temp.denied($q$insert into public.fin_external_proposal_reviews(organization_id) values('00000000-0000-4000-8000-0000000eb001')$q$,'permission denied');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea001',true);
insert into ext_ids values('review',public.fin_external_proposal_review((select id from ext_ids where name='external'),1,'confirm','Conferência material fictícia',true,false));
select pg_temp.assert_true(public.fin_external_proposal_review((select id from ext_ids where name='external'),1,'confirm','Conferência material fictícia',true,false)=(select id from ext_ids where name='review'),'confirmation retry same receipt');
select pg_temp.assert_true((select state='reviewed' and reviewed_by='00000000-0000-4000-8000-0000000ea001' from public.fin_external_proposal_current),'human confirmation attributed');
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed002','bad-provider',0,null,pg_temp.input())$q$,'invalid external provider');
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed099','bad-provider-2',0,null,pg_temp.input())$q$,'invalid external provider');
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','bad-revision',0,null,pg_temp.input('{"rfq_revision":2}'))$q$,'revision conflict');
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','bad-source-1',0,null,pg_temp.input('{"document_sha256":"fake"}'))$q$,'invalid external input');
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec003','00000000-0000-4000-8000-0000000ed001','wrong-product',0,null,pg_temp.input())$q$,'invalid external input');
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','bad-terms-1',0,null,pg_temp.input('{"terms":{"offered_amount":-1}}'))$q$,'invalid external input');
-- Stale corrections fail, successful corrections append and reset review.
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','correction-1',0,(select id from ext_ids where name='external'),pg_temp.input('{"correction_reason":"Correção fictícia documentada"}'))$q$,'external proposal conflict');
select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','correction-1',1,(select id from ext_ids where name='external'),pg_temp.input('{"terms":{"offered_amount":200000},"correction_reason":"Correção fictícia documentada"}'));
select pg_temp.assert_true((select count(*)=2 from public.fin_external_proposal_versions),'old version preserved');
select pg_temp.assert_true((select state='pending_review' and reviewed_by is null from public.fin_external_proposal_current),'new version needs review');
select pg_temp.denied($q$select public.fin_external_proposal_review((select id from ext_ids where name='external'),1,'confirm','Conferência material fictícia',true,false)$q$,'external proposal conflict');
select public.fin_external_proposal_review((select id from ext_ids where name='external'),2,'confirm','Conferência material fictícia',true,false);
-- Read and write adversaries: viewer, other buyer, institution and entity scope.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea003',true);
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','viewer-key-1',0,null,pg_temp.input())$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea004',true);
select pg_temp.assert_true((select count(*)=0 from public.fin_external_proposal_current),'other buyer reads zero');
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','other-key-1',0,null,pg_temp.input())$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea005',true);
select pg_temp.assert_true((select count(*)=0 from public.fin_external_proposals),'institution reads zero');
select pg_temp.assert_true((select count(*)=0 from public.fin_external_proposal_versions),'institution versions hidden');
select pg_temp.assert_true((select count(*)=0 from public.fin_external_proposal_reviews),'institution reviews hidden');
select pg_temp.denied($q$select public.fin_external_proposal_review((select id from ext_ids where name='external'),2,'withdraw','Retirada fictícia documentada',true,false)$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea006',true);
select pg_temp.assert_true((select count(*)=0 from public.fin_external_proposals),'restricted member cannot read group');
select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec002','00000000-0000-4000-8000-0000000ed001','entity-key-1',0,null,pg_temp.input());
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec003','00000000-0000-4000-8000-0000000ed001','entity-key-2',0,null,pg_temp.input('{"terms":{"mdr_debit":1}}'))$q$,'forbidden');
select pg_temp.assert_true((select count(*)=1 from public.fin_external_proposals),'entity reads only own scope');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea001',true);
set local role authenticated;
select pg_temp.denied($q$select public.fin_set_rfq_entity('00000000-0000-4000-8000-0000000ec002','00000000-0000-4000-8000-0000000ee002')$q$,'external proposal identity immutable');
reset role;
-- Canonical bank submission is still intact; external IDs cannot cross its FK.
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,status,created_by,recipient_mode) values
 ('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','00000000-0000-4000-8000-0000000eb003','external-fixture-hash','accepted','00000000-0000-4000-8000-0000000ea001','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product) values
 ('00000000-0000-4000-8000-0000000ef002','00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000eb001','00000000-0000-4000-8000-0000000ed001','00000000-0000-4000-8000-0000000eb003','credit');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea005',true);
select public.fin_submit_proposal('00000000-0000-4000-8000-0000000ef002','{"institution":"Instituição DEMO","product_name":"Crédito DEMO","offered_amount":100000,"interest_rate_month":1.5,"term_months":12}');
select pg_temp.assert_true((select count(*)=0 from public.fin_external_proposals),'accepting invite does not grant external access');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea001',true);
select pg_temp.denied($q$select public.fin_record_decision_v2('00000000-0000-4000-8000-0000000ec001',(select id from ext_ids where name='external'),2)$q$,'proposal not eligible');
insert into ext_ids values('decision',public.fin_record_decision_v2('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ef002',1,'{}','Decisão humana fictícia'));
reset role;
create temporary table ext_snapshot as select snapshot from public.fin_decisions where id=(select id from ext_ids where name='decision');
grant select on ext_snapshot to authenticated;
select pg_temp.assert_true((select snapshot->'external_alternatives'->0->>'origin'='buyer_recorded_external' from ext_snapshot),'decision records external alternative honestly');
set local role authenticated;
select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','correction-2',2,(select id from ext_ids where name='external'),pg_temp.input('{"terms":{"offered_amount":300000},"correction_reason":"Correção posterior à decisão"}'));
select public.fin_external_proposal_review((select id from ext_ids where name='external'),3,'withdraw','Retirada fictícia documentada',true,false);
select pg_temp.assert_true((select d.snapshot=s.snapshot from public.fin_decisions d cross join ext_snapshot s where d.id=(select id from ext_ids where name='decision')),'correction and withdrawal preserve decision snapshot');
-- Documents: use the existing upload metadata RPCs, never a parallel bucket.
insert into ext_ids select 'document',document_id from public.fin_document_begin_upload('00000000-0000-4000-8000-0000000eb001','rfq','00000000-0000-4000-8000-0000000ec001','Proposta externa fictícia','internal','application/pdf',100);
reset role;
select public.fin_document_finalize_upload((select id from ext_ids where name='document'),1,100,'application/pdf');
set local role authenticated;
insert into ext_ids values('document-proposal',(public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','document-key-1',0,null,pg_temp.input(jsonb_build_object('document_id',(select id from ext_ids where name='document'),'document_version',1)))->>'id')::uuid);
select pg_temp.denied($q$select public.fin_external_proposal_review((select id from ext_ids where name='document-proposal'),1,'confirm','Conferência material fictícia',true,false)$q$,'invalid external document');
reset role;
create function pg_temp.fail_external_review() returns trigger language plpgsql as $$ begin raise exception 'forced review failure'; end $$;
create trigger test_external_failure before update on public.fin_external_proposals for each row execute function pg_temp.fail_external_review();
set local role authenticated;
select pg_temp.denied($q$select public.fin_external_proposal_review((select id from ext_ids where name='document-proposal'),1,'confirm','Conferência material fictícia',true,true)$q$,'forced review failure');
select pg_temp.assert_true((select count(*)=0 from public.fin_external_proposal_reviews where proposal_id=(select id from ext_ids where name='document-proposal')),'review receipt rolled back with failed state update');
select pg_temp.assert_true((select state='pending_review' from public.fin_external_proposals where id=(select id from ext_ids where name='document-proposal')),'no partial confirmation');
reset role;
drop trigger test_external_failure on public.fin_external_proposals;
set local role authenticated;
select public.fin_external_proposal_review((select id from ext_ids where name='document-proposal'),1,'confirm','Conferência material fictícia',true,true);
select pg_temp.assert_true((select document_available and document_sha256 is null from public.fin_external_proposal_current where id=(select id from ext_ids where name='document-proposal')),'available metadata does not invent a hash');
reset role;
select pg_temp.denied($q$update public.fin_private_documents set visibility='shared' where id=(select id from ext_ids where name='document')$q$,'invalid external document');
update public.fin_private_documents set removed_at=now() where id=(select id from ext_ids where name='document');
set local role authenticated;
select pg_temp.assert_true((select not document_available from public.fin_external_proposal_current where id=(select id from ext_ids where name='document-proposal')),'removed document no longer current evidence');
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','removed-document',0,null,pg_temp.input(jsonb_build_object('document_id',(select id from ext_ids where name='document'),'document_version',1)))$q$,'invalid external document');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea004',true);
insert into ext_ids select 'foreign-document',document_id from public.fin_document_begin_upload('00000000-0000-4000-8000-0000000eb002','profile','00000000-0000-4000-8000-0000000eb002','Documento alheio fictício','internal','application/pdf',100);
reset role;
select public.fin_document_finalize_upload((select id from ext_ids where name='foreign-document'),1,100,'application/pdf');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea001',true);
set local role authenticated;
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','foreign-document',0,null,pg_temp.input(jsonb_build_object('document_id',(select id from ext_ids where name='foreign-document'),'document_version',1)))$q$,'invalid external document');
-- Governance: real export, hold, retention and offboarding enrollment.
insert into ext_ids values('export',public.fin_governance_request_export('00000000-0000-4000-8000-0000000eb001'));
select public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000eb001','organization',null,null,'Preservação fictícia para auditoria');
reset role;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true(public.fin_governance_hold_blocks('00000000-0000-4000-8000-0000000eb001',null),'legal hold applies');
do $$ declare i integer; pending integer; begin
 select count(*)+1 into pending from public.fin_data_exports where status='requested';
 for i in 1..pending loop
  exit when (select status='ready' from public.fin_data_exports where id=(select id from ext_ids where name='export'));
  perform public.fin_governance_build_export();
 end loop;
 if not exists(select 1 from public.fin_data_exports where id=(select id from ext_ids where name='export') and status='ready') then raise exception 'external export fixture not ready'; end if;
end $$;
select pg_temp.assert_true((select count(*)=3 from public.fin_data_export_parts where export_id=(select id from ext_ids where name='export') and dataset in ('external_proposals','external_proposal_versions','external_proposal_reviews')),'all external datasets exported');
select pg_temp.assert_true((select (tables->>'external_proposal_versions')::integer=5 from (select public.fin_governance_deletion_preview('00000000-0000-4000-8000-0000000eb001')->'tables' as tables) s),'offboarding preview includes history');
insert into public.fin_offboarding_requests(organization_id,status,requested_by,reason) values('00000000-0000-4000-8000-0000000eb001','access_revocation','00000000-0000-4000-8000-0000000ea001','Saída fictícia preservando evidências');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ea001',true);
set local role authenticated;
select pg_temp.denied($q$select public.fin_external_proposal_save('00000000-0000-4000-8000-0000000ec001','00000000-0000-4000-8000-0000000ed001','offboarding-key',0,null,pg_temp.input())$q$,'organization offboarding');
reset role;
select pg_temp.assert_true(not public.fin_external_terms_valid('credit','{"term_months":1.5}'),'database checks integer bounds');
select pg_temp.assert_true(not public.fin_external_terms_valid('credit','{"interest_rate_month":true}'),'no boolean rate coercion');
select pg_temp.assert_true(not public.fin_external_terms_valid('credit','{"cet_year":null}'),'null never becomes zero');
select pg_temp.assert_true(not public.fin_external_terms_valid('credit','{"valid_until":"2026-02-30"}'),'invalid calendar date');
rollback;
\echo 'External proposals: identity, versioning, review, scope, immutable decision context and governance passed.'

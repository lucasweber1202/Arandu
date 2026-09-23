\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000001','a@example.invalid'),
  ('00000000-0000-4000-8000-000000000002','b@example.invalid'),
  ('00000000-0000-4000-8000-000000000003','c@example.invalid'),
  ('00000000-0000-4000-8000-000000000004','d@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.b2b_create_organization('Exporter Demo','EXPORTER','BR') as org_a \gset
select set_config('test.org_a',:'org_a',true);
insert into public.b2b_products(organization_id,sku,name) values (:'org_a','DEMO-001','Product A') returning id as product_a \gset
insert into public.b2b_requirements(organization_id,code,title,vertical) values (:'org_a','DEMO-REQ','Composition','export') returning id as req_a \gset
insert into public.b2b_documents(organization_id,title,document_type,uploader_id) values (:'org_a','Composition file metadata','composition','00000000-0000-4000-8000-000000000001') returning id as doc_a \gset
insert into public.b2b_product_requirements(organization_id,product_id,requirement_id) values (:'org_a',:'product_a',:'req_a');
insert into public.b2b_evidence(organization_id,product_id,requirement_id,document_id) values (:'org_a',:'product_a',:'req_a',:'doc_a') returning id as evidence_a \gset
insert into public.b2b_passports(organization_id,product_id) values (:'org_a',:'product_a') returning id as passport_a,token as token_a \gset
select 1/(case when count(*)=0 then 1 else 0 end) from public.b2b_public_passport(:'token_a'::uuid);
select public.b2b_transition('passport',:'passport_a','published');
select 1/(case when count(*)=1 then 1 else 0 end) from public.b2b_public_passport(:'token_a'::uuid);
select 1/(case when data_readiness=0 then 1 else 0 end) from public.b2b_public_passport(:'token_a'::uuid);
select public.b2b_transition('document',:'doc_a','verified');
select public.b2b_transition('evidence',:'evidence_a','accepted');
select 1/(case when data_readiness=100 then 1 else 0 end) from public.b2b_public_passport(:'token_a'::uuid);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select public.b2b_create_organization('Buyer Demo','FINANCIAL_BUYER','BR') as org_b \gset
select 1/(case when count(*)=0 then 1 else 0 end) from public.b2b_products where organization_id=:'org_a'::uuid;
select 1/(case when count(*)=0 then 1 else 0 end) from public.b2b_passports where token=:'token_a'::uuid;
do $$ begin
  begin
    insert into public.b2b_products(organization_id,sku,name) values (current_setting('test.org_a')::uuid,'ATTACK','Cross tenant');
    raise exception 'cross-tenant insert permitted';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.b2b_rfqs(organization_id,title,category) values (:'org_b','Insurance','insurance') returning id as rfq_b \gset
select set_config('test.rfq_b',:'rfq_b',true);
select set_config('test.org_b',:'org_b',true);
do $$ begin
  begin
    insert into public.b2b_rfq_invitations(buyer_organization_id,rfq_id,provider_organization_id)
    values (current_setting('test.org_a')::uuid,current_setting('test.rfq_b')::uuid,current_setting('test.org_b')::uuid);
    raise exception 'mismatched RFQ permitted';
  exception when insufficient_privilege or foreign_key_violation then null; end;
end $$;
select public.b2b_transition('rfq',:'rfq_b','open');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select public.b2b_create_organization('Insurer Demo','FINANCIAL_PROVIDER','BR') as org_c \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
insert into public.b2b_rfq_invitations(buyer_organization_id,rfq_id,provider_organization_id)
  values (:'org_b',:'rfq_b',:'org_c') returning id as invite_bc \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
insert into public.b2b_quotes(invitation_id,provider_organization_id,category,terms,amount,currency)
  values (:'invite_bc',:'org_c','insurance','{"premium":1200,"deductible":500}'::jsonb,1200,'BRL') returning id as quote_c \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select public.b2b_create_organization('Other Provider Demo','FINANCIAL_PROVIDER','BR') as org_d \gset
select 1/(case when count(*)=0 then 1 else 0 end) from public.b2b_quotes where id=:'quote_c'::uuid;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select 1/(case when count(*)=1 then 1 else 0 end) from public.b2b_quotes where id=:'quote_c'::uuid;
insert into public.b2b_decisions(organization_id,rfq_id,invitation_id,quote_id,decided_by,rationale)
  values (:'org_b',:'rfq_b',:'invite_bc',:'quote_c','00000000-0000-4000-8000-000000000002','Human decision') returning id as decision_b \gset
insert into public.b2b_contracts(organization_id,decision_id,quote_id,starts_on,ends_on)
  values (:'org_b',:'decision_b',:'quote_c','2026-10-01','2027-09-30');
rollback;

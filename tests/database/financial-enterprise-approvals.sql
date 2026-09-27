\set ON_ERROR_STOP on
-- Self-contained fixture in the same psql session as the assertions.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000ba01','buyer-approval@example.invalid'),
('00000000-0000-4000-8000-00000000ba04','approver-one@example.invalid'),
('00000000-0000-4000-8000-00000000ba05','approver-two@example.invalid'),
('00000000-0000-4000-8000-00000000ba06','outsider@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000000bb01','Empresa aprovação DEMO','BUYER','00000000-0000-4000-8000-00000000ba01');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000ba01','admin'),
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000ba04','viewer'),
('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000ba05','finance_manager');
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand) values
('00000000-0000-4000-8000-00000000bb11','00000000-0000-4000-8000-00000000bb01','credit',
 'Aprovação empresarial DEMO','00000000-0000-4000-8000-00000000ba01','collecting','{"amount":100000}'::jsonb);
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-00000000bb03','00000000-0000-4000-8000-00000000bb01',
 'Banco approval DEMO','bank','00000000-0000-4000-8000-00000000ba01');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000000bb02','Provider approval DEMO','PROVIDER','00000000-0000-4000-8000-00000000ba01');
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('00000000-0000-4000-8000-00000000bb04','00000000-0000-4000-8000-00000000bb01',
 '00000000-0000-4000-8000-00000000bb11','00000000-0000-4000-8000-00000000bb03',
 '00000000-0000-4000-8000-00000000bb02',repeat('b',64),'00000000-0000-4000-8000-00000000ba01','accepted','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version) values
('00000000-0000-4000-8000-00000000bb12','00000000-0000-4000-8000-00000000bb04',
 '00000000-0000-4000-8000-00000000bb11','00000000-0000-4000-8000-00000000bb01',
 '00000000-0000-4000-8000-00000000bb03','00000000-0000-4000-8000-00000000bb02','credit','submitted',1);
insert into public.fin_proposal_versions(proposal_id,version,terms,submitted_by) values
('00000000-0000-4000-8000-00000000bb12',1,'{"interest_rate_month":1.5}'::jsonb,'00000000-0000-4000-8000-00000000ba01');
create temporary table approval_ids(key text primary key,value uuid);
grant all on approval_ids to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
select public.fin_set_approval_policy('00000000-0000-4000-8000-00000000bb01',true);
do $$
begin
 begin
  perform public.fin_record_decision('00000000-0000-4000-8000-00000000bb11',
   '00000000-0000-4000-8000-00000000bb12');
  raise exception 'required policy bypassed';
 exception when others then if sqlerrm not like '%approval required or stale%' then raise; end if; end;
end $$;
-- Direct table mutation cannot forge approval state.
do $$
begin
 if has_table_privilege('authenticated','public.fin_approval_requests','INSERT')
 or has_table_privilege('authenticated','public.fin_approval_steps','UPDATE') then
   raise exception 'approval tables are directly writable';
 end if;
 begin
  perform public.fin_request_approval('00000000-0000-4000-8000-00000000bb11'::uuid,
   '00000000-0000-4000-8000-00000000bb12'::uuid,array['00000000-0000-4000-8000-00000000ba01'::uuid],'self');
  raise exception 'self approval accepted';
 exception when others then if sqlerrm not like '%invalid approver%' then raise; end if; end;
 begin
  perform public.fin_request_approval('00000000-0000-4000-8000-00000000bb11'::uuid,
   '00000000-0000-4000-8000-00000000bb12'::uuid,array['00000000-0000-4000-8000-00000000ba06'::uuid],'outsider');
  raise exception 'foreign approver accepted';
 exception when others then if sqlerrm not like '%invalid approver%' then raise; end if; end;
end $$;

insert into approval_ids select 'request',public.fin_request_approval(
 '00000000-0000-4000-8000-00000000bb11'::uuid,'00000000-0000-4000-8000-00000000bb12'::uuid,
 array['00000000-0000-4000-8000-00000000ba04'::uuid,'00000000-0000-4000-8000-00000000ba05'::uuid],
 'Revisar proposta e condições');
do $$
begin
 begin
  perform public.fin_record_decision('00000000-0000-4000-8000-00000000bb11'::uuid,
   '00000000-0000-4000-8000-00000000bb12'::uuid);
  raise exception 'decision bypassed approval';
 exception when others then if sqlerrm not like '%approval required or stale%' then raise; end if; end;
 begin
  perform public.fin_request_approval('00000000-0000-4000-8000-00000000bb11'::uuid,
   '00000000-0000-4000-8000-00000000bb12'::uuid,array['00000000-0000-4000-8000-00000000ba05'::uuid],'duplicate');
  raise exception 'parallel request accepted';
 exception when others then if sqlerrm not like '%approval pending%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba05',false);
do $$
begin
 begin
  perform public.fin_act_on_approval((select value from approval_ids where key='request'),'approved',null);
  raise exception 'step two voted before step one';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba04',false);
select public.fin_act_on_approval((select value from approval_ids where key='request'),'approved',null);
do $$
begin
 begin
  perform public.fin_act_on_approval((select value from approval_ids where key='request'),'approved',null);
  raise exception 'double vote accepted';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba05',false);
select public.fin_act_on_approval((select value from approval_ids where key='request'),'approved',null);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba06',false);
do $$
declare v_count integer;
begin
 select count(*) into v_count from public.fin_approval_requests where id=(select value from approval_ids where key='request');
 if v_count<>0 then raise exception 'cross-tenant approval visible'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
insert into approval_ids select 'decision',public.fin_record_decision(
 '00000000-0000-4000-8000-00000000bb11'::uuid,'00000000-0000-4000-8000-00000000bb12'::uuid);
do $$
declare v_id text;
begin
 select snapshot->>'approval_request_id' into v_id from public.fin_decisions where id=(select value from approval_ids where key='decision');
 if v_id is distinct from (select value::text from approval_ids where key='request') then raise exception 'decision lost approval lineage'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
\echo 'Enterprise approval RLS, roles, sequence, replay and decision gate validated.'

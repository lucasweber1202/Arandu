\set ON_ERROR_STOP on
-- Fixture independent of other test scripts.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000bc01','draft-provider@example.invalid'),
('00000000-0000-4000-8000-00000000bc02','draft-other@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000000bc11','Draft buyer DEMO','BUYER','00000000-0000-4000-8000-00000000bc01'),
('00000000-0000-4000-8000-00000000bc12','Draft provider DEMO','PROVIDER','00000000-0000-4000-8000-00000000bc01');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000000bc12','00000000-0000-4000-8000-00000000bc01','provider_user');
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status) values
('00000000-0000-4000-8000-00000000bc13','00000000-0000-4000-8000-00000000bc11','credit','Draft RFQ DEMO',
 '00000000-0000-4000-8000-00000000bc01','open');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-00000000bc14','00000000-0000-4000-8000-00000000bc11','Draft Bank','bank','00000000-0000-4000-8000-00000000bc01');
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('00000000-0000-4000-8000-00000000bc15','00000000-0000-4000-8000-00000000bc11',
 '00000000-0000-4000-8000-00000000bc13','00000000-0000-4000-8000-00000000bc14',
 '00000000-0000-4000-8000-00000000bc12',repeat('c',64),'00000000-0000-4000-8000-00000000bc01','accepted','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product) values
('00000000-0000-4000-8000-00000000bc16','00000000-0000-4000-8000-00000000bc15',
 '00000000-0000-4000-8000-00000000bc13','00000000-0000-4000-8000-00000000bc11',
 '00000000-0000-4000-8000-00000000bc14','00000000-0000-4000-8000-00000000bc12','credit');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000bc01',false);
do $$
declare v_first integer;v_next integer;
begin
 if has_table_privilege('authenticated','public.fin_proposal_drafts','UPDATE') then raise exception 'direct draft update allowed'; end if;
 v_first:=public.fin_save_proposal_draft('00000000-0000-4000-8000-00000000bc16',
   '{"interest_rate_month":1.2}'::jsonb,0,0);
 if v_first<>1 then raise exception 'first revision wrong'; end if;
 begin
  perform public.fin_save_proposal_draft('00000000-0000-4000-8000-00000000bc16',
   '{"interest_rate_month":2.4}'::jsonb,0,0);
  raise exception 'stale tab overwrote draft';
 exception when others then if sqlerrm not like '%draft conflict%' then raise; end if; end;
 v_next:=public.fin_save_proposal_draft('00000000-0000-4000-8000-00000000bc16',
   '{"interest_rate_month":1.1}'::jsonb,1,0);
 if v_next<>2 then raise exception 'revision failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000bc02',false);
do $$
declare v_count integer;
begin
 select count(*) into v_count from public.fin_proposal_drafts where proposal_id='00000000-0000-4000-8000-00000000bc16';
 if v_count<>0 then raise exception 'foreign draft visible'; end if;
 begin
  perform public.fin_save_proposal_draft('00000000-0000-4000-8000-00000000bc16','{}'::jsonb,2,0);
  raise exception 'foreign draft edited';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000bc01',false);
select public.fin_submit_proposal('00000000-0000-4000-8000-00000000bc16','{"interest_rate_month":1.1}'::jsonb);
do $$
begin
 if exists(select 1 from public.fin_proposal_drafts where proposal_id='00000000-0000-4000-8000-00000000bc16') then
  raise exception 'submitted draft was not cleared atomically';
 end if;
 begin
  perform public.fin_save_proposal_draft('00000000-0000-4000-8000-00000000bc16','{}'::jsonb,0,0);
  raise exception 'old base version reused';
 exception when others then if sqlerrm not like '%draft conflict%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
\echo 'Server proposal draft concurrency, RLS and submit cleanup validated.'

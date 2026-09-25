\set ON_ERROR_STOP on
-- Enterprise approvals: authorization, sequential votes, stale evidence and decision gate.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000ba04','approver-one@example.invalid'),
('00000000-0000-4000-8000-00000000ba05','approver-two@example.invalid'),
('00000000-0000-4000-8000-00000000ba06','outsider@example.invalid')
on conflict(id) do nothing;
insert into public.fin_members(organization_id,user_id,role)
select value,'00000000-0000-4000-8000-00000000ba04','viewer' from hard_ids where key='buyer'
on conflict do nothing;
insert into public.fin_members(organization_id,user_id,role)
select value,'00000000-0000-4000-8000-00000000ba05','finance_manager' from hard_ids where key='buyer'
on conflict do nothing;
create temporary table approval_ids(key text primary key,value uuid);
create temporary table approval_tokens(key text primary key,value text);
grant all on approval_ids,approval_tokens to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
insert into approval_ids select 'rfq',public.fin_create_rfq((select value from hard_ids where key='buyer'),
 'credit','Aprovação empresarial DEMO',null,'{"amount":100000}'::jsonb,null);
select public.fin_transition('rfq',(select value from approval_ids where key='rfq'),'open');
insert into approval_tokens select 'invite',public.fin_invite_provider(
 (select value from approval_ids where key='rfq'),(select value from hard_ids where key='provider_a'));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba02',false);
select public.fin_accept_provider_invite((select value from approval_tokens where key='invite'),(select value from hard_ids where key='prov1'));
insert into approval_ids select 'proposal',id from public.fin_proposals where rfq_id=(select value from approval_ids where key='rfq');
select public.fin_submit_proposal((select value from approval_ids where key='proposal'),'{"interest_rate_month":1.5}'::jsonb);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);

-- Direct table mutation cannot forge approval state.
do $$
begin
 if has_table_privilege('authenticated','public.fin_approval_requests','INSERT')
 or has_table_privilege('authenticated','public.fin_approval_steps','UPDATE') then
   raise exception 'approval tables are directly writable';
 end if;
 begin
  perform public.fin_request_approval((select value from approval_ids where key='rfq'),
   (select value from approval_ids where key='proposal'),array['00000000-0000-4000-8000-00000000ba01'::uuid],'self');
  raise exception 'self approval accepted';
 exception when others then if sqlerrm not like '%invalid approver%' then raise; end if; end;
 begin
  perform public.fin_request_approval((select value from approval_ids where key='rfq'),
   (select value from approval_ids where key='proposal'),array['00000000-0000-4000-8000-00000000ba06'::uuid],'outsider');
  raise exception 'foreign approver accepted';
 exception when others then if sqlerrm not like '%invalid approver%' then raise; end if; end;
end $$;

insert into approval_ids select 'request',public.fin_request_approval(
 (select value from approval_ids where key='rfq'),(select value from approval_ids where key='proposal'),
 array['00000000-0000-4000-8000-00000000ba04'::uuid,'00000000-0000-4000-8000-00000000ba05'::uuid],
 'Revisar proposta e condições');
do $$
begin
 begin
  perform public.fin_record_decision((select value from approval_ids where key='rfq'),
   (select value from approval_ids where key='proposal'));
  raise exception 'decision bypassed approval';
 exception when others then if sqlerrm not like '%approval required or stale%' then raise; end if; end;
 begin
  perform public.fin_request_approval((select value from approval_ids where key='rfq'),
   (select value from approval_ids where key='proposal'),array['00000000-0000-4000-8000-00000000ba05'::uuid],'duplicate');
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
 (select value from approval_ids where key='rfq'),(select value from approval_ids where key='proposal'));
do $$
declare v_id text;
begin
 select snapshot->>'approval_request_id' into v_id from public.fin_decisions where id=(select value from approval_ids where key='decision');
 if v_id is distinct from (select value::text from approval_ids where key='request') then raise exception 'decision lost approval lineage'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
\echo 'Enterprise approval RLS, roles, sequence, replay and decision gate validated.'

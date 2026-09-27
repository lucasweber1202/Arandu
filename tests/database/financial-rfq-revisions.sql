\set ON_ERROR_STOP on
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand)
values('00000000-0000-4000-8000-00000000cc31','00000000-0000-4000-8000-00000000bb01',
 'credit','Demanda revisável','00000000-0000-4000-8000-00000000ba01','open','{"amount":100000}'::jsonb);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
declare v_id uuid:='00000000-0000-4000-8000-00000000cc31';v_revision integer;
begin
 if has_function_privilege('authenticated','public.fin_update_rfq_demand(uuid,text,text,jsonb,date)','EXECUTE') then
  raise exception 'unguarded RFQ edit still exposed'; end if;
 if not exists(select 1 from public.fin_rfq_revisions where rfq_id=v_id and revision=1) then raise exception 'initial snapshot missing'; end if;
 v_revision:=public.fin_revise_rfq(v_id,1,'Demanda revisada',null,'{"amount":110000}'::jsonb,current_date+20);
 if v_revision<>2 then raise exception 'RFQ revision not incremented'; end if;
 begin
  perform public.fin_revise_rfq(v_id,1,'Aba antiga',null,'{"amount":90000}'::jsonb,null);
  raise exception 'stale RFQ revision overwritten';
 exception when others then if sqlerrm not like '%rfq revision conflict%' then raise; end if; end;
 if (select count(*) from public.fin_rfq_revisions where rfq_id=v_id)<>2 then raise exception 'duplicate or missing revision'; end if;
 if (select snapshot->'demand'->>'amount' from public.fin_rfq_revisions where rfq_id=v_id and revision=1)<>'100000'
 then raise exception 'historical snapshot rewritten'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
begin
 if exists(select 1 from public.fin_rfq_revisions where rfq_id='00000000-0000-4000-8000-00000000cc31')
 then raise exception 'uninvited provider read revisions'; end if;
 if not exists(select 1 from public.fin_rfq_revisions where rfq_id='00000000-0000-4000-8000-00000000bb11')
 then raise exception 'invited provider cannot read published RFQ'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
-- Lineage: revision 1 → 2 → 3 while a proposal submitted against revision 2
-- keeps pointing at revision 2 forever.
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand)
values('00000000-0000-4000-8000-00000000cc41','00000000-0000-4000-8000-00000000bb01',
 'credit','Linhagem de revisão DEMO','00000000-0000-4000-8000-00000000ba01','open','{"amount":200000}'::jsonb);
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
('00000000-0000-4000-8000-00000000cc42','00000000-0000-4000-8000-00000000bb01',
 '00000000-0000-4000-8000-00000000cc41','00000000-0000-4000-8000-00000000bb03',
 '00000000-0000-4000-8000-00000000bb02',repeat('e',64),'00000000-0000-4000-8000-00000000ba01','accepted','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version) values
('00000000-0000-4000-8000-00000000cc43','00000000-0000-4000-8000-00000000cc42',
 '00000000-0000-4000-8000-00000000cc41','00000000-0000-4000-8000-00000000bb01',
 '00000000-0000-4000-8000-00000000bb03','00000000-0000-4000-8000-00000000bb02','credit','draft',0);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
declare v_id uuid:='00000000-0000-4000-8000-00000000cc41';
begin
 if (select revision from public.fin_rfqs where id=v_id)<>1 then raise exception 'new RFQ not at revision 1'; end if;
 if not exists(select 1 from public.fin_rfq_revisions where rfq_id=v_id and revision=1) then raise exception 'revision 1 not seeded'; end if;
 if public.fin_revise_rfq(v_id,1,'Linhagem de revisão DEMO',null,'{"amount":250000}'::jsonb,current_date+15)<>2
 then raise exception 'expected revision 2'; end if;
 -- Same values again: no material change, no new revision.
 if public.fin_revise_rfq(v_id,2,'Linhagem de revisão DEMO',null,'{"amount":250000}'::jsonb,current_date+15)<>2
 then raise exception 'no-op edit created a revision'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
declare v_proposal uuid:='00000000-0000-4000-8000-00000000cc43';
begin
 if public.fin_submit_proposal(v_proposal,'{"interest_rate_month":1.4}'::jsonb,'na revisão 2')<>1 then raise exception 'proposal submit failed'; end if;
 if (select rfq_revision from public.fin_proposal_versions where proposal_id=v_proposal and version=1)<>2
 then raise exception 'proposal not stamped with revision 2'; end if;
 if has_table_privilege('authenticated','public.fin_proposal_versions','UPDATE')
 or has_table_privilege('authenticated','public.fin_rfq_revisions','UPDATE')
 or has_table_privilege('authenticated','public.fin_rfq_revisions','INSERT')
 or has_table_privilege('authenticated','public.fin_rfq_revisions','DELETE')
 then raise exception 'lineage tables writable by browser role'; end if;
 begin
  perform public.fin_revise_rfq('00000000-0000-4000-8000-00000000cc41',2,'Provedor editando',null,'{"amount":1}'::jsonb,null);
  raise exception 'provider revised buyer RFQ';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
declare v_id uuid:='00000000-0000-4000-8000-00000000cc41';
begin
 if (select status from public.fin_rfqs where id=v_id)<>'collecting' then raise exception 'rfq not collecting after proposal'; end if;
 if public.fin_revise_rfq(v_id,2,'Linhagem de revisão DEMO',null,'{"amount":300000}'::jsonb,current_date+20)<>3
 then raise exception 'expected revision 3'; end if;
 begin
  perform public.fin_revise_rfq(v_id,2,'Aba antiga',null,'{"amount":1}'::jsonb,null);
  raise exception 'stale tab overwrote revision 3';
 exception when others then if sqlerrm not like '%rfq revision conflict%' then raise; end if; end;
 if (select rfq_revision from public.fin_proposal_versions where proposal_id='00000000-0000-4000-8000-00000000cc43' and version=1)<>2
 then raise exception 'proposal lineage rewritten retroactively'; end if;
 if (select array_agg(revision order by revision) from public.fin_rfq_revisions where rfq_id=v_id)<>array[1,2,3]
 then raise exception 'revision history is not 1,2,3'; end if;
 if (select snapshot->'demand'->>'amount' from public.fin_rfq_revisions where rfq_id=v_id and revision=2)<>'250000'
 then raise exception 'revision 2 snapshot mutated'; end if;
 if (select count(*) from public.fin_events where entity_id=v_id and event_type='rfq_revised')<>2
 then raise exception 'rfq_revised events not exactly one per revision'; end if;
 if (select count(*) from public.fin_events where entity_id=v_id and event_type='rfq_demand_updated_after_open')<>3
 then raise exception 'post-opening edit audit trail missing'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
begin
 -- Invited provider reads every published revision of the RFQ it answers.
 if (select count(*) from public.fin_rfq_revisions where rfq_id='00000000-0000-4000-8000-00000000cc41')<>3
 then raise exception 'invited provider cannot read revision history'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
\echo 'RFQ revision lineage 1→2→3, immutable proposal stamp and stale-tab denial validated.'
\echo 'Published RFQ snapshots, stale update denial and provider authorization validated.'

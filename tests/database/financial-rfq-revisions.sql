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
\echo 'Published RFQ snapshots, stale update denial and provider authorization validated.'

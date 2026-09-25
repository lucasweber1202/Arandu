\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
declare v_dec uuid;v_contract uuid;v_new uuid;v_count integer;v_org uuid:='00000000-0000-4000-8000-00000000bb01';
begin
 select id into v_dec from public.fin_decisions where rfq_id='00000000-0000-4000-8000-00000000bb11' limit 1;
 v_contract:=public.fin_register_contract(v_dec,current_date,current_date+30,90,null,null,null);
 v_count:=public.fin_process_renewals(v_org);
 if v_count<>1 then raise exception 'renewal checkpoint did not create task (%)',v_count; end if;
 if public.fin_process_renewals(v_org)<>0 then raise exception 'renewal double-submit duplicated task'; end if;
 if (select count(*) from public.fin_renewal_milestones where contract_id=v_contract)<>1 then raise exception 'milestone duplicate'; end if;
 if not exists(select 1 from public.fin_tasks where related_id=v_contract and status='open') then raise exception 'renewal task absent'; end if;
 v_new:=public.fin_start_contract_rfq(v_contract);
 if not exists(select 1 from public.fin_rfqs where id=v_new and status='draft' and response_deadline is null)
 then raise exception 'renewal RFQ did not remain draft'; end if;
 if exists(select 1 from public.fin_rfq_invites where rfq_id=v_new) then raise exception 'old invites copied'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
begin
 begin
  perform public.fin_process_renewals('00000000-0000-4000-8000-00000000bb01');
  raise exception 'provider ran buyer renewal';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
\echo 'Contract renewal idempotency, tasks, reuse and tenant permissions validated.'

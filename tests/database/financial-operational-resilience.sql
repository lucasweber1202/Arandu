\set ON_ERROR_STOP on
begin;
reset role;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claims','{}',false);
do $$
declare a jsonb; b jsonb; c record; org uuid; owner uuid; n integer;
begin
  if (select value from public.fin_settings where key='schema_version') <> 'financial-operational-resilience-1' then raise exception 'resilience marker mismatch'; end if;
  if has_function_privilege('anon','public.fin_job_begin(text,text,timestamptz,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.fin_job_finish(uuid,uuid,text,integer,integer,text)','EXECUTE')
    or has_table_privilege('authenticated','public.fin_job_leases','SELECT')
    or not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.fin_job_leases'::regclass) then raise exception 'job lease surface exposed'; end if;
  delete from public.fin_job_leases;
  a:=public.fin_job_begin('renewals','resilience-test',now(),90);
  b:=public.fin_job_begin('renewals','contender-test',now(),90);
  if a is null or b is not null then raise exception 'lease contention'; end if;
  begin
    perform public.fin_job_finish((a->>'run_id')::uuid,gen_random_uuid(),'succeeded',1,0,null);
    raise exception 'wrong token accepted';
  exception when others then if sqlerrm not like 'stale lease%' then raise; end if; end;
  if not public.fin_job_finish((a->>'run_id')::uuid,(a->>'lease_token')::uuid,'succeeded',2,0,null)
    or not public.fin_job_finish((a->>'run_id')::uuid,(a->>'lease_token')::uuid,'succeeded',2,0,null) then raise exception 'idempotent finish'; end if;
  a:=public.fin_job_begin('renewals','expired-test',now(),90);
  update public.fin_job_runs set lease_expires_at=clock_timestamp()-interval '1 second' where id=(a->>'run_id')::uuid;
  update public.fin_job_leases set expires_at=clock_timestamp()-interval '1 second' where job='renewals';
  begin
    perform public.fin_job_finish((a->>'run_id')::uuid,(a->>'lease_token')::uuid,'succeeded',0,0,null);
    raise exception 'expired lease accepted';
  exception when others then if sqlerrm not like 'stale lease%' then raise; end if; end;
  b:=public.fin_job_begin('renewals','replacement-test',now(),90);
  if b is null or b->>'lease_token'=a->>'lease_token' or not exists(select 1 from public.fin_job_runs where id=(a->>'run_id')::uuid and status='failed' and error_code='lease_expired' and finished_at is not null) then raise exception 'lease recovery'; end if;
  perform public.fin_job_finish((b->>'run_id')::uuid,(b->>'lease_token')::uuid,'failed',3,1,'partial_failure');
  -- 151 ocorrências: lote de 100, retomada de 51, rerun sem duplicar tarefa.
  select * into c from public.fin_contracts where status in ('active','renewing') order by id limit 1;
  if c.id is null then raise exception 'contract fixture absent'; end if;
  org:=c.organization_id; owner:=c.owner_id;
  update public.fin_contract_milestones set status='cancelled' where organization_id=org and status='scheduled';
  insert into public.fin_contract_milestones(organization_id,contract_id,kind,title,due_on,created_by)
    select org,c.id,'custom','Resilience fixture '||i,current_date,owner from generate_series(1,151) i;
  n:=public.fin_process_contract_milestones(org,current_date);
  if n<>100 then raise exception 'first bounded batch %',n; end if;
  n:=public.fin_process_contract_milestones(org,current_date);
  if n<>51 then raise exception 'resumable batch %',n; end if;
  if public.fin_process_contract_milestones(org,current_date)<>0 then raise exception 'duplicate task on rerun'; end if;
  perform public.fin_run_renewal_schedule(current_date);
  if public.fin_run_renewal_schedule(current_date) <> 0 then raise exception 'renewal duplicate on rerun'; end if;
  -- Uma entrega com token correto mas lease vencido não pode concluir.
  select * into c from public.fin_webhook_deliveries limit 1;
  if c.id is not null then
    update public.fin_webhook_deliveries set status='delivering',lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()-interval '1 second' where id=c.id returning lease_token into owner;
    begin
      perform public.fin_webhook_complete(c.id,owner,true,204,null);
      raise exception 'expired webhook lease accepted';
    exception when others then if sqlerrm not like 'stale lease%' then raise; end if; end;
    update public.fin_webhook_deliveries set status='delivering',lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',attempts=1 where id=c.id returning lease_token into owner;
    if public.fin_webhook_complete(c.id,owner,false,403,'http_4xx') <> 'dead' then raise exception 'semantic 403 retried'; end if;
  end if;
end $$;
rollback;

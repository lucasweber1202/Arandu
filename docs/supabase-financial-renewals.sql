-- Idempotent contract renewal milestones. No background process is assumed:
-- the buyer invokes the RPC; a scheduled job may call the same RPC later.
create table if not exists public.fin_renewal_milestones (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 contract_id uuid not null,
 milestone text not null check(milestone in ('d180','d120','d90','d60','d30','d7','expired')),
 task_id uuid not null references public.fin_tasks(id),
 triggered_at timestamptz not null default now(),
 unique(contract_id,milestone),
 foreign key(organization_id,contract_id) references public.fin_contracts(organization_id,id)
);
create index if not exists fin_renewal_milestones_org on public.fin_renewal_milestones(organization_id,contract_id);
alter table public.fin_renewal_milestones enable row level security;
alter table public.fin_renewal_milestones force row level security;
revoke all on public.fin_renewal_milestones from anon,authenticated;
grant select on public.fin_renewal_milestones to authenticated;
drop policy if exists fin_renewal_read on public.fin_renewal_milestones;
create policy fin_renewal_read on public.fin_renewal_milestones for select to authenticated using(public.fin_has_role(organization_id));

create or replace function public.fin_process_renewals(p_org uuid,p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record;v_days integer;v_mark text;v_due date;v_task uuid;v_count integer:=0;v_inserted integer;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 if p_day is null or abs(p_day-current_date)>1 then raise exception 'invalid date'; end if;
 for c in select id,owner_id,ends_on,renewal_notice_days,status from public.fin_contracts
   where organization_id=p_org and status in ('active','renewing','expired') and ends_on<=p_day+180
   order by ends_on,id for update
 loop
  v_days:=c.ends_on-p_day;
  v_mark:=case when v_days<=0 then 'expired' when v_days<=7 then 'd7'
    when v_days<=30 then 'd30' when v_days<=60 then 'd60'
    when v_days<=90 then 'd90' when v_days<=120 then 'd120' else 'd180' end;
  v_due:=case when v_days<=0 then p_day else c.ends_on end;
  if exists(select 1 from public.fin_renewal_milestones where contract_id=c.id and milestone=v_mark) then continue; end if;
  insert into public.fin_tasks(organization_id,title,due_on,status,related_type,related_id,created_by)
   values(p_org,case when v_days<=0 then 'Revisar contrato vencido' else 'Revisar renovação de contrato' end,
    v_due,'open','contract',c.id,auth.uid()) returning id into v_task;
  insert into public.fin_renewal_milestones(organization_id,contract_id,milestone,task_id)
   values(p_org,c.id,v_mark,v_task) on conflict(contract_id,milestone) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then delete from public.fin_tasks where id=v_task; continue; end if;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
   values(p_org,'contract',c.id,'renewal_task_created',auth.uid(),jsonb_build_object('milestone',v_mark,'task_id',v_task));
  if c.owner_id<>auth.uid() then
   insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
    values(p_org,c.owner_id,'renewal_due','contract',c.id,v_task,'Contrato em revisão','Há uma tarefa de renovação para acompanhar.')
    on conflict(user_id,event_type,event_id) do nothing;
  end if;
  if v_days<=c.renewal_notice_days and c.status='active' then
   update public.fin_contracts set status='renewing',updated_at=now() where id=c.id;
  end if;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

create or replace function public.fin_start_contract_rfq(p_contract uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record;v_id uuid;
begin
 select c.organization_id,c.product,c.id,r.title,r.description,r.demand into c
 from public.fin_contracts c join public.fin_decisions d on d.id=c.decision_id
 join public.fin_rfqs r on r.id=d.rfq_id and r.organization_id=c.organization_id
 where c.id=p_contract for update of c;
 if not found then raise exception 'contract not found'; end if;
 if not public.fin_has_role(c.organization_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 insert into public.fin_rfqs(organization_id,product,title,description,demand,owner_id,status)
 values(c.organization_id,c.product,left('Renovação: '||c.title,200),c.description,c.demand,auth.uid(),'draft')
 returning id into v_id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(c.organization_id,'contract',c.id,'renewal_rfq_started',auth.uid(),jsonb_build_object('rfq_id',v_id));
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(c.organization_id,'rfq',v_id,'rfq_created_from_contract',auth.uid(),jsonb_build_object('contract_id',c.id));
 return v_id;
end $$;
revoke all on function public.fin_process_renewals(uuid,date),public.fin_start_contract_rfq(uuid) from public,anon;
grant execute on function public.fin_process_renewals(uuid,date),public.fin_start_contract_rfq(uuid) to authenticated,service_role;

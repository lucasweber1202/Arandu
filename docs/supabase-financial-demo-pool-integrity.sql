-- Arandu 12 / OPS-POOL-01: maintenance jobs scoped to one Demo workspace.
--
-- Defect: provisioning a disposable workspace called the global cron
-- (/api/jobs/renewals), whose processors scan every organisation. The hosted
-- audit saw fin_opportunities and fin_opportunity_scans change outside the
-- workspace being provisioned.
--
-- Fix: fin_demo_workspace_run_jobs(slug, day) runs the same processors
-- restricted to the organisations of that workspace. The scope is derived
-- here, from canonical records: organisations created by an account of the
-- workspace (e-mail +ws-<slug>@) whose members all belong to it. No caller
-- supplies an organisation id. The global cron is unchanged: without the
-- transaction-local scope, fin_job_in_scope() is true for every organisation.
--
-- OPS-POOL-02: heartbeat and failure time persisted on the workspace record,
-- so the controller detects provably dead provisioning and backs off on
-- failures by when they happened (not by when the workspace was created).
begin;

alter table public.fin_demo_workspaces add column if not exists heartbeat_at timestamptz;
alter table public.fin_demo_workspaces add column if not exists failed_at timestamptz;

create or replace function public.fin_job_in_scope(p_org uuid)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('arandu.job_scope', true), ''), '') = ''
      or p_org = any(string_to_array(current_setting('arandu.job_scope', true), ',')::uuid[])
$$;
revoke all on function public.fin_job_in_scope(uuid) from public, anon, authenticated;
grant execute on function public.fin_job_in_scope(uuid) to service_role;

create or replace function public.fin_run_renewal_schedule(p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; v_days integer; v_mark text; v_task uuid; v_created integer := 0; v_milestone uuid; v_new boolean;
begin
  if p_day is null or abs(p_day - current_date) > 1 then raise exception 'invalid date'; end if;
  if not pg_try_advisory_xact_lock(hashtext('fin_run_renewal_schedule')) then raise exception using errcode='55P03', message='job busy'; end if;
  for c in select id, organization_id, owner_id, ends_on, renewal_notice_days, status from public.fin_contracts ct
    where status in ('active','renewing') and ends_on <= p_day + greatest(90, renewal_notice_days)
    and public.fin_job_in_scope(ct.organization_id)
    and not exists (select 1 from public.fin_renewal_milestones rm where rm.contract_id=ct.id and rm.cycle_ends_on=ct.ends_on and rm.milestone =
      case when ct.ends_on <= p_day then 'expired' else
        (select m.mark from (values ('notice',ct.renewal_notice_days,0),('d30',30,1),('d60',60,1),('d90',90,1)) m(mark,threshold,tiebreak)
          where ct.ends_on-p_day <= m.threshold order by m.threshold,m.tiebreak limit 1) end)
    order by ends_on, id limit 100 for update skip locked
  loop
    v_days := c.ends_on - p_day;
    v_mark := null;
    if v_days <= 0 then v_mark := 'expired';
    else
      -- O menor limite já alcançado é o marco atual; empate favorece o aviso prévio.
      select m.mark into v_mark from (values ('notice', c.renewal_notice_days, 0), ('d30', 30, 1), ('d60', 60, 1), ('d90', 90, 1))
        as m(mark, threshold, tiebreak) where v_days <= m.threshold order by m.threshold, m.tiebreak limit 1;
    end if;
    if v_mark is null then continue; end if;
    if exists (select 1 from public.fin_renewal_milestones where contract_id = c.id and cycle_ends_on = c.ends_on and milestone = v_mark) then continue; end if;
    select id into v_task from public.fin_tasks where organization_id = c.organization_id and related_type = 'contract'
      and related_id = c.id and status = 'open' order by created_at limit 1;
    v_new := v_task is null;
    if v_new then
      insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (c.organization_id, case when v_days <= 0 then 'Revisar contrato vencido' else 'Revisar renovação de contrato' end,
        least(c.ends_on - c.renewal_notice_days, c.ends_on), 'open', 'contract', c.id, c.owner_id)
      returning id into v_task;
    end if;
    insert into public.fin_renewal_milestones(organization_id, contract_id, milestone, task_id, cycle_ends_on)
    values (c.organization_id, c.id, v_mark, v_task, c.ends_on) on conflict (contract_id, cycle_ends_on, milestone) do nothing
    returning id into v_milestone;
    if v_milestone is null then
      if v_new then delete from public.fin_tasks where id = v_task; end if;
      continue;
    end if;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'contract', c.id, 'renewal_milestone_reached', null,
      jsonb_build_object('milestone', v_mark, 'task_id', v_task, 'scheduled', true));
    -- Um aviso por marco novo (chave = marco), com ou sem tarefa nova: o contrato
    -- registrado pelo produto já nasce com a tarefa de revisão aberta.
    insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
    values (c.organization_id, c.owner_id, 'renewal_due', 'contract', c.id, v_milestone, 'Contrato em revisão de renovação',
      case v_mark when 'expired' then 'O contrato chegou ao fim. Registre a decisão de renovação.'
                  when 'notice' then 'O prazo de aviso prévio do contrato chegou.'
                  else 'Faltam ' || substr(v_mark, 2) || ' dias para o fim do contrato.' end)
    on conflict (user_id, event_type, event_id) do nothing;
    if v_new then v_created := v_created + 1; end if;
    if v_days <= c.renewal_notice_days and c.status = 'active' then
      update public.fin_contracts set status = 'renewing', updated_at = now() where id = c.id;
    end if;
  end loop;
  return v_created;
end $$;

create or replace function public.fin_run_obligations(p_day date default current_date) returns integer language plpgsql security definer set search_path='' as $$
declare v_obligation public.fin_obligations%rowtype;v_step integer;v_i integer;v_start date;v_next date;v_period uuid;v_count integer:=0;v_notice integer;begin
 if auth.uid() is not null then raise exception 'forbidden';end if;
 if p_day is null or abs(p_day-current_date)>31 then raise exception 'invalid obligation day';end if;
 for v_obligation in select * from public.fin_obligations where status='active' and not public.fin_governance_org_locked(organization_id) and public.fin_job_in_scope(organization_id) order by id for update loop
 v_step:=case v_obligation.frequency when 'monthly' then 1 when 'quarterly' then 3 when 'annually' then 12 else 0 end;
 if v_step>0 then
 for v_i in 1..1200 loop
 v_start:=(v_obligation.first_period_start+make_interval(months=>v_i*v_step))::date;exit when v_start>p_day;
 v_next:=(v_obligation.first_period_start+make_interval(months=>(v_i+1)*v_step))::date;
 if not exists(select 1 from public.fin_obligation_periods where obligation_id=v_obligation.id and period_start=v_start) then
 v_period:=public.fin_obligation_add_period(v_obligation.id,v_start,v_next-1,v_next-1+(v_obligation.first_due_on-v_obligation.first_period_end));v_count:=v_count+1;end if;
 end loop;
 end if;
 end loop;
 -- A later measurement reopens a completed task until reviewed again.
 update public.fin_tasks t set status=case when public.fin_obligation_facts(p.id,p_day)->>'status' in ('compliant','waived','not_applicable') then 'done' else 'open' end
 from public.fin_obligation_periods p join public.fin_obligations o on o.id=p.obligation_id where t.id=p.task_id and o.status='active' and not public.fin_governance_org_locked(o.organization_id) and public.fin_job_in_scope(o.organization_id);
 insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
 select o.organization_id,o.owner_id,'task_assigned','contract',o.contract_id,p.id,'Obrigação contratual a revisar','Consulte o período, dados, prazo e evidências. Ausência de dados não comprova conformidade.'
 from public.fin_obligation_periods p join public.fin_obligations o on o.id=p.obligation_id
 where o.status='active' and p.due_on-o.due_soon_days<=p_day and public.fin_obligation_facts(p.id,p_day)->>'status' not in ('compliant','waived','not_applicable')
 and not public.fin_governance_org_locked(o.organization_id) and public.fin_job_in_scope(o.organization_id) and public.fin_implementation_owner_valid(o.organization_id,o.legal_entity_id,o.owner_id)
 on conflict(user_id,event_type,event_id) do nothing;get diagnostics v_notice=row_count;return v_count+v_notice;
end $$;

create or replace function public.fin_run_performance(p_day date default current_date) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if auth.uid() is not null then raise exception 'forbidden';end if;
 if p_day is null or abs(p_day-current_date)>31 then raise exception 'invalid performance day';end if;
 insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
 select organization_id,owner_id,'task_assigned','contract',contract_id,id,'Revisão de performance pendente','Consulte período, fontes, cobertura e revisão humana.' from public.fin_provider_performance_periods where status='open' and review_due_on<=p_day and not public.fin_governance_org_locked(organization_id) and public.fin_job_in_scope(organization_id) and public.fin_implementation_owner_valid(organization_id,legal_entity_id,owner_id)
 on conflict(user_id,event_type,event_id) do nothing;get diagnostics n=row_count;return n;
end $$;

create or replace function public.fin_run_qualification_expiry(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q record; v_expired integer := 0; v_ev integer := 0; v_tasks integer := 0; v_title text;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  update public.fin_qualification_evidence set status = 'expired' where status = 'accepted' and valid_until < p_today and public.fin_job_in_scope(organization_id);
  get diagnostics v_ev = row_count;
  update public.fin_qualification_exceptions set status = 'expired' where status = 'approved' and expires_on < p_today and public.fin_job_in_scope(organization_id);
  for q in select * from public.fin_provider_qualifications where status in ('qualified','qualified_with_conditions') and valid_until < p_today and public.fin_job_in_scope(organization_id) for update loop
    update public.fin_provider_qualifications set status = 'expired', updated_at = now() where id = q.id;
    insert into public.fin_qualification_events(organization_id, qualification_id, event_type, from_status, to_status, reason) values (q.organization_id, q.id, 'expired', q.status, 'expired', 'validade encerrada em ' || q.valid_until);
    v_expired := v_expired + 1;
  end loop;
  for q in select x.*, p.name as provider_name from public.fin_provider_qualifications x join public.fin_providers p on p.organization_id = x.organization_id and p.id = x.provider_id
            where x.status in ('qualified','qualified_with_conditions') and x.valid_until between p_today and p_today + 30 and public.fin_job_in_scope(x.organization_id) loop
    v_title := left('Revalidar qualificação: ' || q.provider_name || ' (' || q.category || ')', 200);
    if not exists (select 1 from public.fin_tasks where organization_id = q.organization_id and title = v_title and status = 'open') then
      insert into public.fin_tasks(organization_id, title, due_on, status, created_by) values (q.organization_id, v_title, q.valid_until, 'open', q.owner_id);
      v_tasks := v_tasks + 1;
    end if;
  end loop;
  return jsonb_build_object('qualifications_expired', v_expired, 'evidence_expired', v_ev, 'tasks_created', v_tasks);
end $$;

-- Organisations that belong to one workspace, derived only from accounts.
create or replace function public.fin_demo_workspace_orgs(p_slug text)
returns uuid[] language sql stable security definer set search_path = '' as $$
  with ws_users as (
    select u.id from auth.users u where lower(u.email) ~ ('^[^@+]+\+ws-' || p_slug || '@[^@]+$')
  ), candidate as (
    select o.id from public.fin_organizations o where o.created_by in (select id from ws_users)
  )
  select coalesce(array_agg(c.id order by c.id), '{}') from candidate c
  where not exists (select 1 from public.fin_members m where m.organization_id = c.id and m.user_id not in (select id from ws_users))
$$;
revoke all on function public.fin_demo_workspace_orgs(text) from public, anon, authenticated, service_role;

create or replace function public.fin_demo_workspace_run_jobs(p_slug text, p_day date default current_date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.fin_demo_workspaces%rowtype; v_orgs uuid[]; v_buyer uuid; v_renewals integer; v_milestones integer := 0;
        v_impl integer; v_obligations integer; v_performance integer; v_deadlines integer := 0; v_opps integer := 0; v_qual jsonb; v_org uuid; v_n integer;
begin
  perform public.fin_demo_require_environment();
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  if p_slug is null or p_slug !~ '^[a-f0-9]{10}$' or p_day is null or abs(p_day - current_date) > 1 then raise exception 'invalid demo workspace job'; end if;
  select * into w from public.fin_demo_workspaces where slug = p_slug for update;
  if w.id is null or w.status <> 'provisioning' then raise exception 'demo workspace not provisioning'; end if;
  v_orgs := public.fin_demo_workspace_orgs(p_slug);
  select o.id into v_buyer from public.fin_organizations o where o.id = any(v_orgs) and o.kind = 'BUYER' order by o.created_at limit 1;
  if v_buyer is null or cardinality(v_orgs) > 12 then raise exception 'demo workspace scope invalid'; end if;
  if w.buyer_organization_id is not null and w.buyer_organization_id <> v_buyer then raise exception 'demo workspace scope invalid'; end if;
  -- Never touch an organisation registered by another workspace record.
  if exists (select 1 from public.fin_demo_workspaces x where x.id <> w.id
             and (x.buyer_organization_id = any(v_orgs) or x.provider_organization_ids && v_orgs)) then raise exception 'demo workspace scope invalid'; end if;
  perform set_config('arandu.job_scope', array_to_string(v_orgs, ','), true);

  v_renewals := public.fin_run_renewal_schedule(p_day);
  foreach v_org in array v_orgs loop
    v_milestones := v_milestones + public.fin_process_contract_milestones(v_org, p_day);
    v_deadlines := v_deadlines + public.fin_process_approval_deadlines(v_org);
  end loop;
  insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
  select p.organization_id,m.owner_id,'task_assigned','contract',p.contract_id,m.id,'Prazo de implantação','Um marco pendente atingiu o prazo. Consulte o contrato e a evidência.'
  from public.fin_implementation_milestones m join public.fin_implementation_plans p on p.id=m.plan_id
  where p.organization_id = any(v_orgs) and p.status not in ('accepted','cancelled') and m.status<>'completed' and m.due_on<=p_day
  and not public.fin_governance_org_locked(p.organization_id) and public.fin_implementation_owner_valid(p.organization_id,p.legal_entity_id,m.owner_id)
  on conflict(user_id,event_type,event_id) do nothing;
  get diagnostics v_impl = row_count;
  v_obligations := public.fin_run_obligations(p_day);
  v_performance := public.fin_run_performance(p_day);
  v_qual := public.fin_run_qualification_expiry(p_day);
  -- Opportunities: only this workspace's buyer; its scan row only.
  if exists (select 1 from public.fin_opportunity_rules r where r.organization_id = v_buyer) then
    insert into public.fin_opportunity_scans(organization_id) values (v_buyer) on conflict (organization_id) do nothing;
    v_n := public.fin_evaluate_opportunities(v_buyer, p_day, null);
    update public.fin_opportunity_scans set last_scanned_at = now(), last_day = p_day, last_touched = v_n where organization_id = v_buyer;
    v_opps := v_n;
  end if;
  -- Scope ends with this call even if the caller keeps the transaction open.
  perform set_config('arandu.job_scope', '', true);
  update public.fin_demo_workspaces set heartbeat_at = now() where id = w.id;
  return jsonb_build_object('scope_organizations', cardinality(v_orgs), 'renewals', v_renewals,
    'contract_milestones', v_milestones + v_impl + v_obligations + v_performance, 'approval_deadlines', v_deadlines,
    'opportunities_touched', v_opps, 'qualification_expiry', v_qual);
end $$;
revoke all on function public.fin_demo_workspace_run_jobs(text, date) from public, anon, authenticated, service_role;
grant execute on function public.fin_demo_workspace_run_jobs(text, date) to service_role;

insert into public.fin_settings(key,value) values ('schema_version', 'financial-demo-pool-integrity-1')
  on conflict(key) do update set value = excluded.value, updated_at = now();
notify pgrst, 'reload schema';
commit;

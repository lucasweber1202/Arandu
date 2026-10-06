-- Reverte docs/supabase-financial-policy-engine.sql.
-- Policies versionadas, etapas, exceções e delegações são trilha de decisão do
-- cliente: o rollback ABORTA se existir qualquer uma delas (ou pedido encerrado
-- como expirado/substituído), em vez de apagá-las em silêncio. Exporte a trilha
-- e faça backup antes (npm run pilot:restore:drill); em produção prefira
-- forward-fix (docs/FINANCIAL_POLICY_ENGINE.md, seção Rollback).
do $$
begin
  if exists (select 1 from public.fin_policy_versions) or exists (select 1 from public.fin_approval_stages)
     or exists (select 1 from public.fin_policy_exceptions) or exists (select 1 from public.fin_approval_delegations)
     or exists (select 1 from public.fin_policy_flags)
     or exists (select 1 from public.fin_approval_requests where policy_snapshot is not null or status in ('expired','superseded'))
     or exists (select 1 from public.fin_approval_steps where position > 5 or status not in ('pending','approved','rejected','changes_requested')) then
    raise exception 'rollback abortado: existe trilha do Policy Engine v2; exporte e trate antes';
  end if;
end $$;

drop function if exists public.fin_run_approval_deadlines();
drop function if exists public.fin_process_approval_deadlines(uuid);
drop function if exists public.fin_revoke_approval_delegation(uuid);
drop function if exists public.fin_set_approval_delegation(uuid, uuid, timestamptz, timestamptz, text);
drop function if exists public.fin_cancel_policy_exception(uuid);
drop function if exists public.fin_decide_policy_exception(uuid, text, text);
drop function if exists public.fin_request_policy_exception(uuid, uuid, text, text, text, jsonb);
drop function if exists public.fin_supersede_approval(uuid, text);
drop function if exists public.fin_request_policy_approval(uuid, uuid, jsonb, text, text, jsonb);
drop function if exists public.fin_simulate_policy_version(uuid, jsonb);
drop function if exists public.fin_preview_approval_policy(uuid, uuid, jsonb);
drop function if exists public.fin_set_policy_flag(uuid, text, text, text, boolean);
drop function if exists public.fin_retire_policy(uuid);
drop function if exists public.fin_discard_policy_draft(uuid);
drop function if exists public.fin_activate_policy_version(uuid);
drop function if exists public.fin_save_policy_draft(uuid, uuid, text, jsonb, text);

-- Versões anteriores (enterprise approvals + handoff) das funções substituídas.
create or replace function public.fin_request_approval(
  p_rfq uuid, p_proposal uuid, p_approvers uuid[], p_rationale text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rfq public.fin_rfqs%rowtype; v_version integer; v_id uuid; v_actor uuid; v_position integer := 0; v_terms jsonb;
begin
  select * into v_rfq from public.fin_rfqs where id = p_rfq for update;
  if not found then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_rfq.organization_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_rfq.status not in ('collecting','comparing') then raise exception 'invalid state'; end if;
  if coalesce(array_length(p_approvers,1),0) not between 1 and 5 or length(trim(coalesce(p_rationale,''))) not between 1 and 4000 then
    raise exception 'invalid approval request';
  end if;
  if exists(select 1 from public.fin_approval_requests where rfq_id = p_rfq and status = 'pending') then raise exception 'approval pending'; end if;
  select p.current_version,v.terms into v_version,v_terms
    from public.fin_proposals p join public.fin_proposal_versions v on v.proposal_id=p.id and v.version=p.current_version
    where p.id=p_proposal and p.rfq_id=p_rfq and p.buyer_organization_id=v_rfq.organization_id and p.status in ('submitted','revised');
  if v_version is null then raise exception 'proposal not eligible'; end if;
  foreach v_actor in array p_approvers loop
    if v_actor = auth.uid() or not exists(select 1 from public.fin_members m where m.organization_id=v_rfq.organization_id and m.user_id=v_actor and m.role in ('admin','finance_manager','analyst','viewer')) then
      raise exception 'invalid approver';
    end if;
    if p_approvers[1:v_position] @> array[v_actor] then raise exception 'duplicate approver'; end if;
    v_position := v_position+1;
  end loop;
  insert into public.fin_approval_requests(organization_id,rfq_id,proposal_id,proposal_version,rfq_updated_at,requested_by,rationale,snapshot)
    values(v_rfq.organization_id,p_rfq,p_proposal,v_version,v_rfq.updated_at,auth.uid(),trim(p_rationale),
      jsonb_build_object('proposal_version',v_version,'terms',v_terms,'rfq_demand',v_rfq.demand,'rfq_title',v_rfq.title,'deadline',v_rfq.response_deadline))
    returning id into v_id;
  for v_position in 1..array_length(p_approvers,1) loop
    insert into public.fin_approval_steps(request_id,position,approver_id) values(v_id,v_position,p_approvers[v_position]);
  end loop;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(v_rfq.organization_id,'rfq',p_rfq,'approval_requested',auth.uid(),jsonb_build_object('request_id',v_id,'steps',array_length(p_approvers,1),'version',v_version));
  return v_id;
end $$;

create or replace function public.fin_act_on_approval(
  p_request uuid, p_action text, p_comment text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype; v_step public.fin_approval_steps%rowtype; v_version integer; v_updated timestamptz; v_status text;
begin
  -- Lock order matches decision and request creation; competing votes serialize.
  select * into v_request from public.fin_approval_requests where id=p_request;
  if not found then raise exception 'approval not found'; end if;
  perform 1 from public.fin_rfqs where id=v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id=p_request for update;
  if not public.fin_has_role(v_request.organization_id) then raise exception 'forbidden'; end if;
  if v_request.status <> 'pending' then raise exception 'approval not pending'; end if;
  if p_action not in ('approved','rejected','changes_requested') then raise exception 'invalid approval action'; end if;
  if p_action <> 'approved' and length(trim(coalesce(p_comment,''))) < 3 then raise exception 'approval comment required'; end if;
  select updated_at into v_updated from public.fin_rfqs where id=v_request.rfq_id;
  select current_version into v_version from public.fin_proposals where id=v_request.proposal_id and status in ('submitted','revised');
  if v_updated is distinct from v_request.rfq_updated_at or v_version is distinct from v_request.proposal_version then raise exception 'approval stale'; end if;
  select * into v_step from public.fin_approval_steps where request_id=p_request and status='pending' order by position limit 1 for update;
  if not found or v_step.approver_id <> auth.uid() or v_request.requested_by=auth.uid() then raise exception 'forbidden'; end if;
  update public.fin_approval_steps set status=p_action,comment=nullif(trim(coalesce(p_comment,'')),''),acted_at=now() where id=v_step.id;
  v_status := case when p_action='approved' and exists(select 1 from public.fin_approval_steps where request_id=p_request and status='pending') then 'pending' else p_action end;
  if v_status <> 'pending' then update public.fin_approval_requests set status=v_status,resolved_at=now() where id=p_request; end if;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(v_request.organization_id,'rfq',v_request.rfq_id,'approval_'||p_action,auth.uid(),jsonb_build_object('request_id',p_request,'step',v_step.position));
  return v_status;
end $$;

create or replace function public.fin_cancel_approval(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype;
begin
  select * into v_request from public.fin_approval_requests where id=p_request;
  if not found then raise exception 'approval not found'; end if;
  perform 1 from public.fin_rfqs where id=v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id=p_request for update;
  if not public.fin_has_role(v_request.organization_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_request.status <> 'pending' then raise exception 'approval not pending'; end if;
  update public.fin_approval_requests set status='cancelled',resolved_at=now() where id=p_request;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(v_request.organization_id,'rfq',v_request.rfq_id,'approval_cancelled',auth.uid(),jsonb_build_object('request_id',p_request));
end $$;

create or replace function public.fin_record_decision(
  p_rfq uuid, p_proposal uuid, p_criteria jsonb default '{}'::jsonb, p_rationale text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_snapshot jsonb; v_id uuid; v_version integer; v_approval public.fin_approval_requests%rowtype; v_updated timestamptz;
begin
  select organization_id,status,updated_at into v_org,v_status,v_updated from public.fin_rfqs where id=p_rfq for update;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_status not in ('collecting','comparing') then raise exception 'invalid state'; end if;
  if jsonb_typeof(coalesce(p_criteria,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid criteria'; end if;
  if exists(select 1 from public.fin_decisions where rfq_id=p_rfq) then raise exception 'decision already recorded'; end if;
  select current_version into v_version from public.fin_proposals
    where id=p_proposal and rfq_id=p_rfq and buyer_organization_id=v_org and status in ('submitted','revised');
  if v_version is null then raise exception 'proposal not eligible'; end if;
  select * into v_approval from public.fin_approval_requests where rfq_id=p_rfq order by requested_at desc,id desc limit 1;
  if v_approval.id is null and exists(select 1 from public.fin_approval_policies where organization_id=v_org and required_for_decision) then
    raise exception 'approval required or stale';
  end if;
  if v_approval.id is not null and (v_approval.status <> 'approved' or v_approval.proposal_id <> p_proposal
    or v_approval.proposal_version <> v_version or v_approval.rfq_updated_at is distinct from v_updated) then
    raise exception 'approval required or stale';
  end if;
  select jsonb_build_object('decided_proposal_id',p_proposal,'decided_version',v_version,'captured_at',now(),
    'approval_request_id',v_approval.id,'proposals',coalesce(jsonb_agg(jsonb_build_object(
      'proposal_id',p.id,'provider_id',p.provider_id,'status',p.status,'version',p.current_version,
      'terms',v.terms,'submitted_at',v.submitted_at) order by p.created_at),'[]'::jsonb)) into v_snapshot
    from public.fin_proposals p left join public.fin_proposal_versions v on v.proposal_id=p.id and v.version=p.current_version
    where p.rfq_id=p_rfq and p.buyer_organization_id=v_org and p.current_version>0;
  insert into public.fin_decisions(organization_id,rfq_id,proposal_id,decided_by,criteria,rationale,snapshot)
    values(v_org,p_rfq,p_proposal,auth.uid(),coalesce(p_criteria,'{}'::jsonb),p_rationale,v_snapshot) returning id into v_id;
  update public.fin_rfqs set status='decided',updated_at=now() where id=p_rfq;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(v_org,'rfq',p_rfq,'decision_recorded',auth.uid(),jsonb_build_object('decided_version',v_version,'approval_request_id',v_approval.id));
  return v_id;
end $$;

create or replace function public.fin_notify_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid;v_type text;v_object text;v_target uuid;v_next uuid;
begin
 if new.event_type in ('proposal_submitted','proposal_revised') then
  select r.owner_id,r.id into v_user,v_target from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id where p.id=new.entity_id;
  v_type:=case when new.event_type='proposal_submitted' then 'proposal_received' else 'proposal_revised' end;
  v_object:='rfq';
 elsif new.event_type='approval_requested' then
  select s.approver_id,r.rfq_id into v_user,v_target from public.fin_approval_steps s join public.fin_approval_requests r on r.id=s.request_id where s.request_id=(new.metadata->>'request_id')::uuid order by s.position limit 1;
  v_type:='approval_requested';v_object:='rfq';
 elsif new.event_type in ('approval_approved','approval_rejected','approval_changes_requested') then
  select requested_by,rfq_id into v_user,v_target from public.fin_approval_requests where id=(new.metadata->>'request_id')::uuid;
  v_type:=new.event_type;v_object:='rfq';
  -- Etapa aprovada e pedido ainda pendente: a vez passou para o próximo aprovador.
  if new.event_type='approval_approved' then
   select s.approver_id into v_next from public.fin_approval_steps s join public.fin_approval_requests r on r.id=s.request_id
    where s.request_id=(new.metadata->>'request_id')::uuid and s.status='pending' and r.status='pending'
    order by s.position limit 1;
   if v_next is not null and v_next is distinct from new.actor_id then
    insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
    values(new.organization_id,v_next,'approval_requested','rfq',v_target,new.id,'Aprovação solicitada',
     'Chegou a sua vez de aprovar. Abra o processo para ver os detalhes.')
    on conflict(user_id,event_type,event_id) do nothing;
   end if;
  end if;
 else return new;
 end if;
 if v_user is not null and v_user is distinct from new.actor_id then
  insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
  values(new.organization_id,v_user,v_type,v_object,v_target,new.id,
   case v_type when 'proposal_received' then 'Proposta recebida' when 'proposal_revised' then 'Proposta revisada'
    when 'approval_requested' then 'Aprovação solicitada' when 'approval_approved' then 'Aprovação registrada'
    when 'approval_rejected' then 'Aprovação rejeitada' else 'Alterações solicitadas' end,
   'Abra o processo para ver os detalhes.')
  on conflict(user_id,event_type,event_id) do nothing;
 end if;
 return new;
end $$;

drop function if exists public.fin_act_on_approval_v2(uuid, text, text, text);
revoke all on function public.fin_request_approval(uuid,uuid,uuid[],text),public.fin_act_on_approval(uuid,text,text),public.fin_cancel_approval(uuid),
  public.fin_record_decision(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.fin_request_approval(uuid,uuid,uuid[],text),public.fin_act_on_approval(uuid,text,text),public.fin_cancel_approval(uuid),
  public.fin_record_decision(uuid,uuid,jsonb,text) to authenticated,service_role;
revoke all on function public.fin_notify_event() from public, anon, authenticated;

drop function if exists public.fin_approval_close_open(uuid, text);
drop function if exists public.fin_approval_refresh(uuid);
drop function if exists public.fin_policy_rule_excepted(uuid, uuid, text);
drop function if exists public.fin_approval_member_eligible(uuid, uuid, uuid, text[], text);
drop function if exists public.fin_policy_evaluate(uuid, uuid, jsonb);
drop function if exists public.fin_policy_combine(jsonb, jsonb);
drop function if exists public.fin_policy_apply(jsonb, jsonb, uuid, text);
drop function if exists public.fin_policy_condition(jsonb, jsonb);
drop function if exists public.fin_policy_facts(uuid, uuid, jsonb);

drop trigger if exists fin_approval_stages_guard on public.fin_approval_stages;
drop trigger if exists fin_approval_requests_snapshot_guard on public.fin_approval_requests;
drop function if exists public.fin_approval_stage_guard();
drop function if exists public.fin_approval_snapshot_guard();
alter table public.fin_approval_steps drop column if exists stage_id;
alter table public.fin_approval_steps drop column if exists acted_by;
alter table public.fin_approval_steps drop column if exists delegation_id;
alter table public.fin_approval_steps drop column if exists reason_code;
alter table public.fin_approval_steps drop constraint if exists fin_approval_steps_reason_code_check;
alter table public.fin_approval_steps drop constraint if exists fin_approval_steps_position_check;
alter table public.fin_approval_steps add constraint fin_approval_steps_position_check check (position between 1 and 5);
alter table public.fin_approval_steps drop constraint if exists fin_approval_steps_status_check;
alter table public.fin_approval_steps add constraint fin_approval_steps_status_check check (status in ('pending','approved','rejected','changes_requested'));
drop index if exists public.fin_approval_requests_expiry;
alter table public.fin_approval_requests drop constraint if exists fin_approval_requests_policy_shape;
alter table public.fin_approval_requests drop column if exists policy_snapshot;
alter table public.fin_approval_requests drop column if exists policy_version_ids;
alter table public.fin_approval_requests drop column if exists evaluated_at;
alter table public.fin_approval_requests drop column if exists justification;
alter table public.fin_approval_requests drop column if exists declared_facts;
alter table public.fin_approval_requests drop column if exists expires_at;
alter table public.fin_approval_requests drop column if exists resolution_note;
alter table public.fin_approval_requests drop constraint if exists fin_approval_requests_status_check;
alter table public.fin_approval_requests add constraint fin_approval_requests_status_check check (status in ('pending','approved','rejected','changes_requested','cancelled'));

drop table if exists public.fin_approval_delegations;
drop table if exists public.fin_policy_exceptions;
drop table if exists public.fin_approval_stages;
drop trigger if exists fin_policy_versions_guard on public.fin_policy_versions;
drop table if exists public.fin_policy_versions;
drop table if exists public.fin_policies;
drop table if exists public.fin_policy_flags;
drop function if exists public.fin_policy_version_guard();
drop function if exists public.fin_policy_valid_document(jsonb);
drop function if exists public.fin_policy_valid_condition(jsonb);
drop function if exists public.fin_policy_valid_stage(jsonb);
drop function if exists public.fin_policy_valid_roles(jsonb, boolean);

-- Telemetria do job removido: não é registro de negócio.
delete from public.fin_job_runs where job = 'approval_deadlines';
alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check (job in ('renewals','contract_milestones'));

insert into public.fin_settings (key, value) values ('schema_version', 'financial-graph-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

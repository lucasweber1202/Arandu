-- Enterprise approval gate. Append-only votes, serialized by the RFQ row lock.
-- No approval request means the existing human decision path remains available.
create table if not exists public.fin_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rfq_id uuid not null,
  proposal_id uuid not null,
  proposal_version integer not null check (proposal_version > 0),
  rfq_updated_at timestamptz not null,
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected','changes_requested','cancelled')),
  rationale text not null check (length(rationale) between 1 and 4000),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  resolved_at timestamptz,
  unique (organization_id,id),
  foreign key (organization_id,rfq_id) references public.fin_rfqs(organization_id,id),
  foreign key (rfq_id,proposal_id) references public.fin_proposals(rfq_id,id)
);
create unique index if not exists fin_approval_one_pending on public.fin_approval_requests(rfq_id) where status = 'pending';
create index if not exists fin_approval_org_inbox on public.fin_approval_requests(organization_id,status,requested_at desc);
create table if not exists public.fin_approval_steps (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.fin_approval_requests(id),
  position integer not null check (position between 1 and 5),
  approver_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected','changes_requested')),
  comment text check (comment is null or length(comment) <= 2000),
  acted_at timestamptz,
  unique(request_id,position),
  unique(request_id,approver_id)
);
create index if not exists fin_approval_step_inbox on public.fin_approval_steps(approver_id,status,request_id);
alter table public.fin_approval_requests enable row level security;
alter table public.fin_approval_requests force row level security;
alter table public.fin_approval_steps enable row level security;
alter table public.fin_approval_steps force row level security;
revoke all on public.fin_approval_requests, public.fin_approval_steps from anon, authenticated;
grant select on public.fin_approval_requests, public.fin_approval_steps to authenticated;
drop policy if exists fin_approval_request_read on public.fin_approval_requests;
create policy fin_approval_request_read on public.fin_approval_requests for select to authenticated
  using (public.fin_has_role(organization_id));
drop policy if exists fin_approval_step_read on public.fin_approval_steps;
create policy fin_approval_step_read on public.fin_approval_steps for select to authenticated
  using (exists (select 1 from public.fin_approval_requests r where r.id = request_id and public.fin_has_role(r.organization_id)));

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

-- Explicit opt-in organization policy; configured by an admin and audited.
create table if not exists public.fin_approval_policies (
 organization_id uuid primary key references public.fin_organizations(id),
 required_for_decision boolean not null default false,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.fin_approval_policies enable row level security;
alter table public.fin_approval_policies force row level security;
revoke all on public.fin_approval_policies from anon,authenticated;
grant select on public.fin_approval_policies to authenticated;
drop policy if exists fin_approval_policy_read on public.fin_approval_policies;
create policy fin_approval_policy_read on public.fin_approval_policies for select to authenticated
 using(public.fin_has_role(organization_id));
create or replace function public.fin_set_approval_policy(p_org uuid,p_required boolean)
returns void language plpgsql security definer set search_path = '' as $
begin
 if not public.fin_has_role(p_org,array['admin']) then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.fin_organizations where id=p_org and kind='BUYER') then raise exception 'forbidden'; end if;
 if p_required is null then raise exception 'invalid policy'; end if;
 insert into public.fin_approval_policies(organization_id,required_for_decision,updated_by)
 values(p_org,p_required,auth.uid())
 on conflict(organization_id) do update set required_for_decision=excluded.required_for_decision,updated_by=auth.uid(),updated_at=now();
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(p_org,'organization',p_org,'approval_policy_updated',auth.uid(),jsonb_build_object('required_for_decision',p_required));
end $;
revoke all on function public.fin_set_approval_policy(uuid,boolean) from public,anon;
grant execute on function public.fin_set_approval_policy(uuid,boolean) to authenticated,service_role;

-- Replace the decision entrypoint, including callers that bypass the application API.
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
revoke all on function public.fin_request_approval(uuid,uuid,uuid[],text),public.fin_act_on_approval(uuid,text,text),public.fin_cancel_approval(uuid) from public,anon;
grant execute on function public.fin_request_approval(uuid,uuid,uuid[],text),public.fin_act_on_approval(uuid,text,text),public.fin_cancel_approval(uuid) to authenticated,service_role;

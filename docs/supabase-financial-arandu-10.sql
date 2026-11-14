-- Arandu 10: persistent human analyses; derived scores are never stored.
-- Canonical manifest naming takes precedence over CLI timestamp filenames.
begin;
create table if not exists public.fin_decision_scenarios (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.fin_organizations(id),
 rfq_id uuid not null references public.fin_rfqs(id),
 name text not null check(length(trim(name)) between 2 and 120 and name !~ '[<>]'),
 weights jsonb not null check(jsonb_typeof(weights)='object'),
 context jsonb not null check(jsonb_typeof(context)='object'),
 version integer not null default 1 check(version>0),
 status text not null default 'active' check(status in ('active','archived')),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 request_key text not null check(request_key ~ '^[A-Za-z0-9._:-]{8,80}$'),
 request_payload jsonb not null,
 unique(rfq_id,created_by,request_key),
 foreign key(organization_id,rfq_id) references public.fin_rfqs(organization_id,id)
);
-- Rebuild only this additive projection index on reapply; no business records change.
drop index if exists public.fin_contract_notice_page;
create index fin_contract_notice_page on public.fin_contracts(organization_id,(ends_on-renewal_notice_days),id) where status in ('active','renewing','expired');
create index if not exists fin_decision_scenarios_page on public.fin_decision_scenarios(organization_id,rfq_id,status,created_at desc,id desc);
create index if not exists fin_scenario_history on public.fin_events(organization_id,entity_id,happened_at desc,id desc) where entity_type='decision_scenario';
alter table public.fin_decision_scenarios enable row level security;
drop policy if exists fin_scenario_read on public.fin_decision_scenarios;
create policy fin_scenario_read on public.fin_decision_scenarios for select to authenticated using (
 public.fin_has_role(organization_id) and public.fin_rfq_visible(rfq_id)
 and exists(select 1 from public.fin_rfqs r join public.fin_organizations o on o.id=r.organization_id
 where r.id=rfq_id and r.organization_id=fin_decision_scenarios.organization_id and o.kind='BUYER'));
revoke all on public.fin_decision_scenarios from public,anon,authenticated,service_role;
grant select on public.fin_decision_scenarios to authenticated;

-- Always verifies buyer + entity scope, even when invoked from a definer command.
create or replace function public.fin_scenario_context(p_rfq uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fin_rfqs%rowtype; sources jsonb;
begin
 select * into r from public.fin_rfqs where id=p_rfq;
 if auth.uid() is null or r.id is null or not public.fin_has_role(r.organization_id)
 or not public.fin_entity_visible(r.organization_id,r.legal_entity_id)
 or not exists(select 1 from public.fin_organizations where id=r.organization_id and kind='BUYER') then raise exception 'forbidden'; end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.source_kind,s.id),'[]'::jsonb) into sources from (
  select id,'portal'::text as source_kind,current_version,status,null::boolean as document_available,null::boolean as rfq_revision_matches from public.fin_proposals where rfq_id=r.id
  union all
  select id,'external',current_version,state,document_available,rfq_revision_matches from public.fin_external_proposal_current where rfq_id=r.id
  limit 501
 ) s;
 if jsonb_array_length(sources)>500 then raise exception 'scenario coverage limit'; end if;
 return jsonb_build_object('rfq_revision',r.revision,'rfq_updated_at',r.updated_at,'rfq_status',r.status,'sources',sources);
end $$;
revoke all on function public.fin_scenario_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.fin_scenario_context(uuid) to authenticated;

create or replace function public.fin_scenario_command(p_rfq uuid,p_id uuid,p_expected integer,p_operation text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fin_rfqs%rowtype; s public.fin_decision_scenarios%rowtype; original public.fin_decision_scenarios%rowtype;
 ctx jsonb; payload jsonb; key text; item record; role_name text;
begin
 -- Same RFQ-first lock order as approval and proposal commands.
 select * into r from public.fin_rfqs where id=p_rfq for update;
 ctx:=public.fin_scenario_context(p_rfq);
 select role into role_name from public.fin_members where organization_id=r.organization_id and user_id=auth.uid() for share;
 perform 1 from public.fin_member_entity_grants where organization_id=r.organization_id and user_id=auth.uid() for share;
 if role_name is null or role_name not in ('admin','finance_manager','analyst') or not public.fin_entity_visible(r.organization_id,r.legal_entity_id) then raise exception 'forbidden'; end if;
 if p_operation is null or p_operation not in ('create','update','archive','duplicate') or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid scenario'; end if;
 if p_operation in ('create','duplicate') then
  key:=p_input->>'request_key';
  if key is null or key !~ '^[A-Za-z0-9._:-]{8,80}$' then raise exception 'invalid scenario'; end if;
  payload:=jsonb_build_object('operation',p_operation,'source_id',p_id,'name',p_input->'name','weights',p_input->'weights');
  select * into s from public.fin_decision_scenarios where rfq_id=p_rfq and created_by=auth.uid() and request_key=key;
  if found then
   if s.request_payload is distinct from payload then raise exception 'scenario request conflict'; end if;
   return to_jsonb(s);
  end if;
 end if;
 if p_operation<>'create' then
  select * into original from public.fin_decision_scenarios where id=p_id and rfq_id=p_rfq for update;
  if not found then raise exception 'scenario not found'; end if;
  if p_operation='archive' and original.status='archived' and p_expected=original.version-1 then return to_jsonb(original); end if;
  if p_operation<>'duplicate' and (p_expected is null or original.version<>p_expected or original.status<>'active') then raise exception 'scenario version conflict'; end if;
 end if;
 if p_operation in ('create','update') then
  if jsonb_typeof(p_input->'weights') is distinct from 'object' then raise exception 'invalid scenario'; end if;
  if (select count(*) from jsonb_object_keys(p_input->'weights')) not between 1 and 30 then raise exception 'invalid scenario'; end if;
  for item in select * from jsonb_each(p_input->'weights') loop
   if item.key !~ '^[a-z][a-z0-9_]{0,59}$' or jsonb_typeof(item.value)<>'number' then raise exception 'invalid scenario'; end if;
   if item.value::text::numeric<=0 or item.value::text::numeric>100 then raise exception 'invalid scenario'; end if;
  end loop;
 end if;
 if p_operation<>'archive' and (p_input->>'name' is null or length(trim(p_input->>'name')) not between 2 and 120 or p_input->>'name' ~ '[<>]') then raise exception 'invalid scenario'; end if;
 if p_operation in ('create','duplicate') then
  insert into public.fin_decision_scenarios(organization_id,rfq_id,name,weights,context,created_by,updated_by,request_key,request_payload)
  values(r.organization_id,p_rfq,trim(p_input->>'name'),case when p_operation='duplicate' then original.weights else p_input->'weights' end,
   case when p_operation='duplicate' then original.context else ctx end,auth.uid(),auth.uid(),key,payload) returning * into s;
 else
  update public.fin_decision_scenarios set name=case when p_operation='archive' then name else trim(p_input->>'name') end,
   weights=case when p_operation='archive' then weights else p_input->'weights' end,
   context=case when p_operation='update' and p_input->'refresh_context'='true'::jsonb then ctx else context end,
   status=case when p_operation='archive' then 'archived' else status end,
   version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=original.id returning * into s;
 end if;
 insert into public.fin_events(organization_id,legal_entity_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(r.organization_id,r.legal_entity_id,'decision_scenario',s.id,'scenario_'||p_operation,auth.uid(),
 jsonb_build_object('version',s.version,'name',s.name,'weights',s.weights,'context',s.context,'status',s.status,'source_id',case when p_operation='duplicate' then p_id else null end));
 return to_jsonb(s);
end $$;
revoke all on function public.fin_scenario_command(uuid,uuid,integer,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fin_scenario_command(uuid,uuid,integer,text,jsonb) to authenticated;

-- History uses the existing immutable event log but must inherit RFQ scope.
drop policy if exists fin_scenario_event_read on public.fin_events;
-- Existing generic event policies already cover tenant membership; restrictive
-- policy narrows only this new event type, preserving every existing event.
create policy fin_scenario_event_read on public.fin_events as restrictive for select to authenticated using (
 entity_type<>'decision_scenario' or exists(select 1 from public.fin_decision_scenarios s where s.id=entity_id and s.organization_id=fin_events.organization_id));

create or replace view public.fin_renewal_operations with(security_invoker=true,security_barrier=true) as
 select c.id,c.organization_id,c.legal_entity_id,c.provider_id,c.title,c.product,c.status,c.owner_id,c.starts_on,c.ends_on,
 c.renewal_notice_days,c.current_version,c.parent_contract_id,c.decision_id,d.rfq_id,
 c.ends_on-c.renewal_notice_days as notice_on,
 c.ends_on-current_date as days_to_end,
 (c.ends_on-c.renewal_notice_days)-current_date as days_to_notice,
 (c.owner_id is null or m.user_id is null) as unassigned,
 case when c.status='expired' or c.ends_on<current_date then 'expired' when c.ends_on-c.renewal_notice_days<=current_date then 'notice_due' when c.status='renewing' then 'renewing' else 'upcoming' end as urgency,
 case when c.owner_id is null then 'unassigned' when m.user_id is null then 'member_unavailable' else 'assigned' end as owner_status
 from public.fin_contracts c left join public.fin_decisions d on d.id=c.decision_id and d.organization_id=c.organization_id left join public.fin_members m on m.organization_id=c.organization_id and m.user_id=c.owner_id where c.status in ('active','renewing','expired');
revoke all on public.fin_renewal_operations from public,anon,authenticated,service_role;
grant select on public.fin_renewal_operations to authenticated;

-- Recheck the selected portal source at the material vote write, retaining
-- row locks through commit. Existing role/assignment/SoD guards still execute.
create or replace function public.fin_approval_current_source_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare a public.fin_approval_requests%rowtype; r public.fin_rfqs%rowtype; p public.fin_proposals%rowtype; terms jsonb;
begin
 if old.status<>'pending' or new.status not in ('approved','rejected','changes_requested') then return new; end if;
 select * into a from public.fin_approval_requests where id=new.request_id;
 select * into r from public.fin_rfqs where id=a.rfq_id for update;
 if r.id is null or r.status not in ('open','collecting','comparing') or r.updated_at is distinct from a.rfq_updated_at
 or (a.expires_at is not null and a.expires_at<now()) then raise exception 'approval stale'; end if;
 if a.proposal_id is not null then
  select * into p from public.fin_proposals where id=a.proposal_id for share;
  select v.terms into terms from public.fin_proposal_versions v where v.proposal_id=p.id and v.version=p.current_version;
  if p.id is null or p.rfq_id<>r.id or p.status not in ('submitted','revised') or p.current_version is distinct from a.proposal_version
   or terms is null or terms is distinct from a.snapshot->'terms' then raise exception 'approval stale'; end if;
 else
  perform public.fin_external_lock_source(a.external_proposal_id,a.proposal_version,a.external_rfq_revision,array['admin','finance_manager','analyst','viewer']);
 end if;
 return new;
end $$;
revoke all on function public.fin_approval_current_source_guard() from public,anon,authenticated,service_role;
drop trigger if exists fin_approval_steps_current_source on public.fin_approval_steps;
create trigger fin_approval_steps_current_source before update on public.fin_approval_steps for each row execute function public.fin_approval_current_source_guard();

-- Canonical portable export inventory, extended with analysis definitions.
create or replace function public.fin_governance_export_datasets()
returns table(dataset text, query text) language sql immutable set search_path = '' as $$
  values
    ('decision_scenarios', 'select * from public.fin_decision_scenarios where organization_id = $1'),
    ('external_proposals', 'select * from public.fin_external_proposals where organization_id = $1'),
    ('external_proposal_versions', 'select * from public.fin_external_proposal_versions where organization_id = $1'),
    ('external_proposal_reviews', 'select * from public.fin_external_proposal_reviews where organization_id = $1'),
    ('organization', 'select * from public.fin_organizations where id = $1'),
    ('legal_entities', 'select * from public.fin_legal_entities where organization_id = $1'),
    ('members', 'select organization_id, user_id, role, entity_scope, display_name, job_title, created_at from public.fin_members where organization_id = $1'),
    ('member_entity_grants', 'select * from public.fin_member_entity_grants where organization_id = $1'),
    ('company_profiles', 'select * from public.fin_company_profiles where organization_id = $1'),
    ('company_profile_history', 'select * from public.fin_company_profile_history where organization_id = $1'),
    ('rfqs', 'select * from public.fin_rfqs where organization_id = $1'),
    ('rfq_revisions', 'select * from public.fin_rfq_revisions where organization_id = $1'),
    ('rfq_profile_snapshots', 'select * from public.fin_rfq_profile_snapshots where organization_id = $1'),
    ('rfq_invites', 'select * from public.fin_rfq_invites where buyer_organization_id = $1'),
    ('proposals', 'select * from public.fin_proposals where buyer_organization_id = $1'),
    ('proposal_versions', 'select v.* from public.fin_proposal_versions v join public.fin_proposals p on p.id = v.proposal_id where p.buyer_organization_id = $1 and p.current_version > 0'),
    ('decisions', 'select * from public.fin_decisions where organization_id = $1'),
    ('contracts', 'select * from public.fin_contracts where organization_id = $1'),
    ('contract_versions', 'select * from public.fin_contract_versions where organization_id = $1'),
    ('contract_amendments', 'select * from public.fin_contract_amendments where organization_id = $1'),
    ('contract_milestones', 'select * from public.fin_contract_milestones where organization_id = $1'),
    ('renewal_milestones', 'select * from public.fin_renewal_milestones where organization_id = $1'),
    ('providers', 'select * from public.fin_providers where organization_id = $1'),
    ('provider_contacts', 'select * from public.fin_provider_contacts where organization_id = $1'),
    ('crm_activities', 'select * from public.fin_crm_activities where organization_id = $1'),
    ('crm_processes', 'select * from public.fin_crm_processes where organization_id = $1'),
    ('provider_relationships', 'select * from public.fin_provider_relationships where organization_id = $1'),
    ('provider_issues', 'select * from public.fin_provider_issues where organization_id = $1'),
    ('provider_reviews', 'select * from public.fin_provider_reviews where organization_id = $1'),
    ('scorecard_templates', 'select * from public.fin_scorecard_templates where organization_id = $1'),
    ('facilities', 'select * from public.fin_facilities where organization_id = $1'),
    ('facility_balances', 'select * from public.fin_facility_balances where organization_id = $1'),
    ('facility_repayments', 'select * from public.fin_facility_repayments where organization_id = $1'),
    ('facility_history', 'select * from public.fin_facility_history where organization_id = $1'),
    ('guarantees', 'select * from public.fin_guarantees where organization_id = $1'),
    ('policies', 'select * from public.fin_policies where organization_id = $1'),
    ('policy_versions', 'select * from public.fin_policy_versions where organization_id = $1'),
    ('policy_flags', 'select * from public.fin_policy_flags where organization_id = $1'),
    ('approval_policies', 'select * from public.fin_approval_policies where organization_id = $1'),
    ('approval_requests', 'select * from public.fin_approval_requests where organization_id = $1'),
    ('approval_stages', 'select * from public.fin_approval_stages where organization_id = $1'),
    ('approval_steps', 'select s.* from public.fin_approval_steps s join public.fin_approval_requests a on a.id = s.request_id where a.organization_id = $1'),
    ('policy_exceptions', 'select * from public.fin_policy_exceptions where organization_id = $1'),
    ('approval_delegations', 'select * from public.fin_approval_delegations where organization_id = $1'),
    ('tasks', 'select * from public.fin_tasks where organization_id = $1'),
    ('comments', 'select * from public.fin_comments where organization_id = $1'),
    ('events', 'select * from public.fin_events where organization_id = $1'),
    ('documents', 'select * from public.fin_documents where organization_id = $1'),
    ('private_documents', 'select * from public.fin_private_documents where buyer_organization_id = $1'),
    ('document_versions', 'select v.document_id, v.version, v.mime_type, v.size_bytes, v.sha256, v.status, v.uploaded_by, v.created_at, v.completed_at from public.fin_document_versions v join public.fin_private_documents d on d.id = v.document_id where d.buyer_organization_id = $1'),
    ('service_accounts', 'select * from public.fin_service_accounts where organization_id = $1'),
    ('webhook_endpoints', 'select * from public.fin_webhook_endpoints where organization_id = $1'),
    ('sso_connections', 'select * from public.fin_sso_connections where organization_id = $1'),
    ('sso_domains', 'select * from public.fin_sso_domains where organization_id = $1'),
    ('retention_policies', 'select * from public.fin_retention_policies where organization_id = $1'),
    ('legal_holds', 'select * from public.fin_legal_holds where organization_id = $1'),
    ('value_methodologies', 'select * from public.fin_value_methodologies where organization_id = $1'),
    ('value_records', 'select * from public.fin_value_records where organization_id = $1'),
    ('value_observations', 'select * from public.fin_value_observations where organization_id = $1'),
    ('fee_schedules', 'select * from public.fin_fee_schedules where organization_id = $1'),
    ('fee_schedule_versions', 'select * from public.fin_fee_schedule_versions where organization_id = $1'),
    ('fee_observations', 'select * from public.fin_fee_observations where organization_id = $1'),
    ('fee_variances', 'select * from public.fin_fee_variances where organization_id = $1'),
    ('fee_reviews', 'select * from public.fin_fee_reviews where organization_id = $1'),
    ('opportunity_rules', 'select * from public.fin_opportunity_rules where organization_id = $1'),
    ('opportunities', 'select * from public.fin_opportunities where organization_id = $1'),
    ('opportunity_events', 'select * from public.fin_opportunity_events where organization_id = $1'),
    ('document_extractions', 'select * from public.fin_document_extractions where organization_id = $1'),
    ('extraction_facts', 'select * from public.fin_extraction_facts where organization_id = $1'),
    ('extraction_reviews', 'select * from public.fin_extraction_reviews where organization_id = $1'),
    ('qualification_requirements', 'select * from public.fin_qualification_requirements where organization_id = $1'),
    ('provider_qualifications', 'select * from public.fin_provider_qualifications where organization_id = $1'),
    ('qualification_evidence', 'select * from public.fin_qualification_evidence where organization_id = $1'),
    ('qualification_exceptions', 'select * from public.fin_qualification_exceptions where organization_id = $1'),
    ('qualification_events', 'select * from public.fin_qualification_events where organization_id = $1'),
    ('implementation_plans', 'select * from public.fin_implementation_plans where organization_id = $1'),
    ('implementation_milestones', 'select * from public.fin_implementation_milestones where organization_id = $1'),
    ('implementation_dependencies', 'select * from public.fin_implementation_dependencies where organization_id = $1'),
    ('implementation_issues', 'select * from public.fin_implementation_issues where organization_id = $1'),
    ('implementation_acceptances', 'select * from public.fin_implementation_acceptances where organization_id = $1'),
    ('obligations', 'select * from public.fin_obligations where organization_id = $1'),
    ('covenants', 'select * from public.fin_covenants where organization_id = $1'),
    ('obligation_periods', 'select * from public.fin_obligation_periods where organization_id = $1'),
    ('covenant_measurements', 'select * from public.fin_covenant_measurements where organization_id = $1'),
    ('obligation_evidence', 'select * from public.fin_obligation_evidence where organization_id = $1'),
    ('obligation_reviews', 'select * from public.fin_obligation_reviews where organization_id = $1'),
    ('covenant_waivers', 'select * from public.fin_covenant_waivers where organization_id = $1'),
    ('performance_dimensions', 'select * from public.fin_provider_performance_dimensions where organization_id = $1'),
    ('performance_periods', 'select * from public.fin_provider_performance_periods where organization_id = $1'),
    ('performance_targets', 'select * from public.fin_provider_performance_targets where organization_id = $1'),
    ('performance_observations', 'select * from public.fin_provider_performance_observations where organization_id = $1'),
    ('performance_reviews', 'select * from public.fin_provider_performance_reviews where organization_id = $1'),
    ('spend_records', 'select * from public.fin_spend_records where organization_id = $1'),
    ('spend_reconciliations', 'select * from public.fin_spend_reconciliations where organization_id = $1');
$$;
revoke all on function public.fin_governance_export_datasets() from public,anon,authenticated;
insert into public.fin_settings(key,value) values('schema_version', 'financial-arandu-10-1') on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;

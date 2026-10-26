-- Before material use only. Restore application compatibility first.
begin;
do $$ begin
 if exists(select 1 from public.fin_decisions where external_proposal_id is not null)
 or exists(select 1 from public.fin_approval_requests where external_proposal_id is not null)
 or exists(select 1 from public.fin_contracts where external_proposal_id is not null) then
 raise exception 'external decisions exist: use forward-fix'; end if;
end $$;
drop trigger if exists fin_external_contract_identity on public.fin_contracts;
drop function if exists public.fin_external_contract_identity_guard();
drop function if exists public.fin_external_preview(uuid,integer,integer,jsonb);
create or replace view public.fin_external_proposal_current with(security_invoker=true) as
 select p.id,p.organization_id,p.legal_entity_id,p.rfq_id,p.provider_id,p.product,p.state,p.current_version,
 v.terms,v.channel,v.received_at,v.source_reference,v.currency,v.rfq_revision,v.recorded_by,v.recorded_at,
 v.document_id,v.document_version,v.document_sha256,v.document_mime,v.document_size,
 q.reviewed_by,q.reviewed_at,q.document_read,
 (v.document_id is not null and d.id is not null and d.removed_at is null and coalesce(f.status='available',false)) as document_available,
 (v.rfq_revision=r.revision) as rfq_revision_matches,
 b.name as provider_name,
 'buyer_recorded_external'::text as origin,'buyer_attribution'::text as issuer_identity,
 'transcription_correspondence_only'::text as review_scope,
 'not_recorded'::text as external_validation,'not_recorded'::text as institution_acceptance,
 false as decision_allowed,'version_metadata_unverified'::text as document_hash_source,
 case when v.document_id is null then 'not_presented' when d.id is not null and d.removed_at is null and f.status='available' then 'metadata_available' else 'unavailable' end as document_state
 from public.fin_external_proposals p
 join public.fin_external_proposal_versions v on v.proposal_id=p.id and v.version=p.current_version
 join public.fin_rfqs r on r.id=p.rfq_id
 join public.fin_providers b on b.id=p.provider_id and b.organization_id=p.organization_id
 left join public.fin_external_proposal_reviews q on q.proposal_id=p.id and q.version=p.current_version and q.action='confirm'
 left join public.fin_private_documents d on d.id=v.document_id
 left join public.fin_document_versions f on f.document_id=v.document_id and f.version=v.document_version;

drop trigger if exists fin_00_external_source on public.fin_decisions;
drop trigger if exists fin_00_external_source on public.fin_approval_requests;
drop function if exists public.fin_external_command(uuid,integer,integer,text,text,jsonb);
drop function if exists public.fin_external_selected_source_guard();
create or replace function public.fin_record_decision(
  p_rfq uuid, p_proposal uuid, p_criteria jsonb default '{}'::jsonb, p_rationale text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_snapshot jsonb; v_id uuid; v_version integer; v_approval public.fin_approval_requests%rowtype; v_updated timestamptz;
  v_eval jsonb; v_final integer; v_actors uuid[];
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
  if v_approval.id is null then
    -- Sem pedido: a exigência é a da policy vigente agora (inclui a política v1).
    v_eval := public.fin_policy_evaluate(p_rfq, p_proposal, '{}'::jsonb);
    if coalesce((v_eval->>'approval_required')::boolean, false) then raise exception 'approval required or stale'; end if;
    if coalesce((v_eval->'requirements'->>'justification')::boolean, false) and length(trim(coalesce(p_rationale,''))) < 10 then
      raise exception 'policy justification required';
    end if;
  elsif v_approval.status <> 'approved' or v_approval.proposal_id <> p_proposal
    or v_approval.proposal_version <> v_version or v_approval.rfq_updated_at is distinct from v_updated then
    raise exception 'approval required or stale';
  elsif v_approval.policy_snapshot is not null then
    v_eval := v_approval.policy_snapshot;
    if coalesce((v_eval->'sod'->>'requester_cannot_decide')::boolean, false) and v_approval.requested_by = auth.uid() then
      raise exception 'segregation of duties';
    end if;
    if coalesce((v_eval->'sod'->>'decider_not_sole_final_approver')::boolean, true) then
      select max(st.sequence) into v_final from public.fin_approval_stages st where st.request_id = v_approval.id and st.status = 'approved';
      select array_agg(distinct s.acted_by) into v_actors from public.fin_approval_steps s join public.fin_approval_stages st on st.id = s.stage_id
       where st.request_id = v_approval.id and st.sequence = v_final and st.status = 'approved' and s.status = 'approved';
      if v_actors = array[auth.uid()] then raise exception 'segregation of duties'; end if;
    end if;
  end if;
  select jsonb_build_object('decided_proposal_id',p_proposal,'decided_version',v_version,'captured_at',now(),
    'approval_request_id',v_approval.id,
    'policy', case when v_eval is null then null else jsonb_build_object('engine', v_eval->'engine', 'policies', v_eval->'policies',
       'matched', v_eval->'matched', 'evaluated_at', v_eval->'evaluated_at', 'from_request', v_approval.policy_snapshot is not null) end,
    'proposals',coalesce(jsonb_agg(jsonb_build_object(
      'proposal_id',p.id,'provider_id',p.provider_id,'status',p.status,'version',p.current_version,
      'terms',v.terms,'submitted_at',v.submitted_at) order by p.created_at),'[]'::jsonb)) into v_snapshot
    from public.fin_proposals p left join public.fin_proposal_versions v on v.proposal_id=p.id and v.version=p.current_version
    where p.rfq_id=p_rfq and p.buyer_organization_id=v_org and p.current_version>0;
  insert into public.fin_decisions(organization_id,rfq_id,proposal_id,decided_by,criteria,rationale,snapshot)
    values(v_org,p_rfq,p_proposal,auth.uid(),coalesce(p_criteria,'{}'::jsonb),p_rationale,v_snapshot) returning id into v_id;
  update public.fin_rfqs set status='decided',updated_at=now() where id=p_rfq;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(v_org,'rfq',p_rfq,'decision_recorded',auth.uid(),jsonb_build_object('decided_version',v_version,'approval_request_id',v_approval.id,
      'policy_rules', jsonb_array_length(coalesce(v_eval->'matched','[]'::jsonb))));
  return v_id;
end $$;
create or replace function public.fin_request_approval(
  p_rfq uuid, p_proposal uuid, p_approvers uuid[], p_rationale text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rfq public.fin_rfqs%rowtype; v_version integer; v_id uuid; v_actor uuid; v_position integer := 0; v_terms jsonb; v_eval jsonb;
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
  v_eval := public.fin_policy_evaluate(p_rfq, p_proposal, '{}'::jsonb);
  if v_eval->>'engine' = 'policy' and (jsonb_array_length(v_eval->'stages') > 0 or jsonb_array_length(v_eval->'blockers') > 0) then
    raise exception 'policy assignment required';
  end if;
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
create or replace function public.fin_policy_facts(p_rfq uuid, p_proposal uuid, p_declared jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.fin_rfqs%rowtype; v_terms jsonb; v_provider uuid; v_status text; v_parent uuid; v_currency text;
  v_amount numeric; v_offered numeric; v_duration numeric; v_flags jsonb := '[]'::jsonb; v_cov jsonb := 'null'::jsonb; v_guarantee jsonb := 'null'::jsonb;
begin
  select * into r from public.fin_rfqs where id = p_rfq;
  if not found then return null; end if;
  if p_proposal is not null then
    select v.terms, p.provider_id into v_terms, v_provider
      from public.fin_proposals p join public.fin_proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
     where p.id = p_proposal and p.rfq_id = p_rfq;
    select pr.verification_state into v_status from public.fin_providers pr where pr.id = v_provider;
  end if;
  select e.parent_id, e.currency into v_parent, v_currency from public.fin_legal_entities e where e.id = r.legal_entity_id;
  if r.legal_entity_id is null then select o.base_currency into v_currency from public.fin_organizations o where o.id = r.organization_id; end if;
  -- Valor: o maior entre o pedido e o ofertado (conservador). Adquirência não tem
  -- "valor da operação" comparável; o fato fica desconhecido.
  if r.product = 'credit' then
    v_amount := public.fin_try_numeric(r.demand->>'amount');
    v_offered := public.fin_try_numeric(v_terms->>'offered_amount');
    v_amount := case when v_amount is null then v_offered when v_offered is null then v_amount else greatest(v_amount, v_offered) end;
    v_duration := coalesce(public.fin_try_numeric(v_terms->>'term_months'), public.fin_try_numeric(r.demand->>'term_months'));
    if v_terms is not null then v_guarantee := to_jsonb(length(trim(coalesce(v_terms->>'collateral_required',''))) > 0); end if;
  elsif v_terms is not null then
    v_guarantee := 'false'::jsonb;
  end if;
  if jsonb_typeof(p_declared->'covenant_present') = 'boolean' then v_cov := p_declared->'covenant_present'; end if;
  if jsonb_typeof(p_declared->'flags') = 'array' then
    select coalesce(jsonb_agg(distinct x order by x), '[]'::jsonb) into v_flags
      from jsonb_array_elements_text(p_declared->'flags') x
     where exists (select 1 from public.fin_policy_flags f where f.organization_id = r.organization_id and f.key = x and f.active);
  end if;
  return jsonb_build_object(
    'product', r.product,
    'legal_entity_id', r.legal_entity_id,
    'legal_entity_parent_id', v_parent,
    'currency', v_currency,
    'amount', v_amount,
    'provider_status', v_status,
    'provider_new', case when v_provider is null then null else not exists (
        select 1 from public.fin_contracts c where c.organization_id = r.organization_id and c.provider_id = v_provider) end,
    'proposals_count', (select count(*) from public.fin_proposals p where p.rfq_id = p_rfq and p.current_version > 0 and p.status in ('submitted','revised')),
    'guarantee_required', v_guarantee,
    'covenant_present', v_cov,
    'contract_duration_months', v_duration,
    'maturity_date', case when v_duration is null then null else to_char(current_date + make_interval(months => v_duration::integer), 'YYYY-MM-DD') end,
    'flags', v_flags);
end $$;
create or replace function public.fin_preview_approval_policy(p_rfq uuid, p_proposal uuid default null, p_declared jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.fin_rfqs where id = p_rfq;
  if v_org is null or not public.fin_has_role(v_org) or not public.fin_rfq_visible(p_rfq) then raise exception 'rfq not found'; end if;
  if p_proposal is not null and not exists (select 1 from public.fin_proposals p where p.id = p_proposal and p.rfq_id = p_rfq) then raise exception 'proposal not eligible'; end if;
  if jsonb_typeof(coalesce(p_declared, '{}'::jsonb)) <> 'object' then raise exception 'invalid policy'; end if;
  return public.fin_policy_evaluate(p_rfq, p_proposal, coalesce(p_declared, '{}'::jsonb));
end $$;
create or replace function public.fin_request_policy_approval(
  p_rfq uuid, p_proposal uuid, p_assignments jsonb, p_rationale text, p_justification text default null, p_declared jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rfq public.fin_rfqs%rowtype; v_version integer; v_terms jsonb; v_eval jsonb; s jsonb; v_people uuid[] := '{}'; v_user uuid; v_nominees jsonb;
  v_id uuid; v_stage uuid; v_position integer := 0; v_first integer; v_count integer; v_declared jsonb;
begin
  select * into v_rfq from public.fin_rfqs where id = p_rfq for update;
  if not found then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_rfq.organization_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_rfq.status not in ('collecting','comparing') then raise exception 'invalid state'; end if;
  if length(trim(coalesce(p_rationale,''))) not between 1 and 4000 then raise exception 'invalid approval request'; end if;
  if jsonb_typeof(coalesce(p_assignments, 'null'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_declared, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid approval request';
  end if;
  if exists (select 1 from public.fin_approval_requests where rfq_id = p_rfq and status = 'pending') then raise exception 'approval pending'; end if;
  select p.current_version, v.terms into v_version, v_terms
    from public.fin_proposals p join public.fin_proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
   where p.id = p_proposal and p.rfq_id = p_rfq and p.buyer_organization_id = v_rfq.organization_id and p.status in ('submitted','revised');
  if v_version is null then raise exception 'proposal not eligible'; end if;
  -- Só o que o engine lê fica gravado como declarado.
  v_declared := jsonb_strip_nulls(jsonb_build_object(
    'covenant_present', case when jsonb_typeof(p_declared->'covenant_present') = 'boolean' then p_declared->'covenant_present' end,
    'flags', case when jsonb_typeof(p_declared->'flags') = 'array' then p_declared->'flags' end));
  v_eval := public.fin_policy_evaluate(p_rfq, p_proposal, v_declared);
  -- Plano só com bloqueio (ex.: mínimo de propostas) também abre pedido: é nele
  -- que a exceção é pedida e decidida.
  if v_eval->>'engine' <> 'policy' or (jsonb_array_length(v_eval->'stages') = 0 and jsonb_array_length(v_eval->'blockers') = 0) then
    raise exception 'policy approval not applicable';
  end if;
  if jsonb_array_length(v_eval->'stages') > 8 then raise exception 'policy plan too large'; end if;
  if (v_eval->'requirements'->>'justification')::boolean and length(trim(coalesce(p_justification,''))) < 10 then
    raise exception 'policy justification required';
  end if;
  if exists (select 1 from jsonb_object_keys(p_assignments) k where not exists (select 1 from jsonb_array_elements(v_eval->'stages') x where x->>'key' = k)) then
    raise exception 'invalid approval request';
  end if;
  for s in select * from jsonb_array_elements(v_eval->'stages') loop
    v_nominees := p_assignments->(s->>'key');
    if jsonb_typeof(coalesce(v_nominees, 'null'::jsonb)) <> 'array' or jsonb_array_length(v_nominees) < (s->>'min_approvals')::integer
       or jsonb_array_length(v_nominees) > 5 then
      raise exception 'policy approvers required';
    end if;
    for v_user in select (x #>> '{}')::uuid from jsonb_array_elements(v_nominees) x loop
      -- SoD padrão: quem pede não aprova; ninguém ocupa duas etapas.
      if v_user = auth.uid() then raise exception 'invalid approver'; end if;
      if v_user = any(v_people) then raise exception 'duplicate approver'; end if;
      if not public.fin_approval_member_eligible(v_rfq.organization_id, v_rfq.legal_entity_id, v_user,
               array(select jsonb_array_elements_text(s->'roles')), s->>'scope') then
        raise exception 'policy approver ineligible';
      end if;
      v_people := v_people || v_user;
    end loop;
  end loop;
  insert into public.fin_approval_requests(organization_id, rfq_id, proposal_id, proposal_version, rfq_updated_at, requested_by, rationale, snapshot,
      policy_snapshot, policy_version_ids, evaluated_at, justification, declared_facts, expires_at)
    values (v_rfq.organization_id, p_rfq, p_proposal, v_version, v_rfq.updated_at, auth.uid(), trim(p_rationale),
      jsonb_build_object('proposal_version', v_version, 'terms', v_terms, 'rfq_demand', v_rfq.demand, 'rfq_title', v_rfq.title, 'deadline', v_rfq.response_deadline),
      v_eval, array(select (x->>'version_id')::uuid from jsonb_array_elements(v_eval->'policies') x),
      (v_eval->>'evaluated_at')::timestamptz, nullif(trim(coalesce(p_justification,'')),''), v_declared,
      case when jsonb_typeof(v_eval->'expire_after_hours') = 'number' then now() + make_interval(hours => (v_eval->>'expire_after_hours')::integer) end)
    returning id into v_id;
  v_first := (select min((x->>'sequence')::integer) from jsonb_array_elements(v_eval->'stages') x);
  for s in select * from jsonb_array_elements(v_eval->'stages') loop
    insert into public.fin_approval_stages(request_id, organization_id, stage_key, label, sequence, roles, scope, min_approvals, due_hours,
        allow_delegation, sources, status, opened_at, due_at)
      values (v_id, v_rfq.organization_id, s->>'key', s->>'label', (s->>'sequence')::integer, array(select jsonb_array_elements_text(s->'roles')),
        s->>'scope', (s->>'min_approvals')::integer, (s->>'due_hours')::integer, (s->>'allow_delegation')::boolean, s->'sources',
        case when (s->>'sequence')::integer = v_first then 'active' else 'pending' end,
        case when (s->>'sequence')::integer = v_first then now() end,
        case when (s->>'sequence')::integer = v_first and jsonb_typeof(s->'due_hours') = 'number' then now() + make_interval(hours => (s->>'due_hours')::integer) end)
      returning id into v_stage;
    for v_user in select (x #>> '{}')::uuid from jsonb_array_elements(p_assignments->(s->>'key')) x loop
      v_position := v_position + 1;
      insert into public.fin_approval_steps(request_id, position, approver_id, stage_id) values (v_id, v_position, v_user, v_stage);
    end loop;
  end loop;
  v_count := v_position;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_rfq.organization_id, 'rfq', p_rfq, 'approval_requested', auth.uid(), jsonb_build_object('request_id', v_id, 'steps', v_count, 'version', v_version,
      'engine', 'policy', 'stages', jsonb_array_length(v_eval->'stages'), 'policy_versions', jsonb_array_length(v_eval->'policies'),
      'rules', jsonb_array_length(v_eval->'matched'), 'blockers', jsonb_array_length(v_eval->'blockers')));
  return v_id;
end $$;
create or replace function public.fin_act_on_approval_v2(
  p_request uuid, p_action text, p_comment text default null, p_reason_code text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype; v_step public.fin_approval_steps%rowtype; v_stage public.fin_approval_stages%rowtype;
  v_version integer; v_updated timestamptz; v_status text; v_entity uuid; v_delegation uuid; v_done integer; v_step_id uuid;
begin
  -- Mesma ordem de travas da decisão e do pedido: votos concorrentes serializam.
  select * into v_request from public.fin_approval_requests where id = p_request;
  if not found then raise exception 'approval not found'; end if;
  perform 1 from public.fin_rfqs where id = v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id = p_request for update;
  if not public.fin_has_role(v_request.organization_id) then raise exception 'forbidden'; end if;
  if v_request.status <> 'pending' then raise exception 'approval not pending'; end if;
  if v_request.expires_at is not null and v_request.expires_at < now() then raise exception 'approval expired'; end if;
  if p_action not in ('approved','rejected','changes_requested') then raise exception 'invalid approval action'; end if;
  if p_action <> 'approved' and length(trim(coalesce(p_comment,''))) < 3 then raise exception 'approval comment required'; end if;
  if p_reason_code is not null and p_reason_code not in ('insufficient_competition','terms_outside_policy','missing_documentation','pricing_review','risk_review','compliance_review','budget','other') then
    raise exception 'invalid approval action';
  end if;
  select updated_at, legal_entity_id into v_updated, v_entity from public.fin_rfqs where id = v_request.rfq_id;
  select current_version into v_version from public.fin_proposals where id = v_request.proposal_id and status in ('submitted','revised');
  if v_updated is distinct from v_request.rfq_updated_at or v_version is distinct from v_request.proposal_version then raise exception 'approval stale'; end if;
  if v_request.requested_by = auth.uid() then raise exception 'forbidden'; end if;

  if v_request.policy_snapshot is null then
    -- Pedido v1: fila estritamente sequencial, só o aprovador da vez.
    select * into v_step from public.fin_approval_steps where request_id = p_request and status = 'pending' order by position limit 1 for update;
    if not found or v_step.approver_id <> auth.uid() then raise exception 'forbidden'; end if;
    update public.fin_approval_steps set status = p_action, comment = nullif(trim(coalesce(p_comment,'')),''), acted_at = now(), acted_by = auth.uid(), reason_code = p_reason_code
     where id = v_step.id;
    v_status := case when p_action = 'approved' and exists (select 1 from public.fin_approval_steps where request_id = p_request and status = 'pending') then 'pending' else p_action end;
    if v_status <> 'pending' then update public.fin_approval_requests set status = v_status, resolved_at = now() where id = p_request; end if;
    insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
      values (v_request.organization_id, 'rfq', v_request.rfq_id, 'approval_' || p_action, auth.uid(), jsonb_build_object('request_id', p_request, 'step', v_step.position));
    return v_status;
  end if;

  -- Pedido com policy: voto próprio numa etapa ativa...
  select s.* into v_step from public.fin_approval_steps s join public.fin_approval_stages st on st.id = s.stage_id and st.status = 'active'
   where s.request_id = p_request and s.status = 'pending' and s.approver_id = auth.uid() order by s.position limit 1 for update of s;
  if found then
    select * into v_stage from public.fin_approval_stages where id = v_step.stage_id;
    -- Aprovador revogado (papel ou entidade) não vota mais, mesmo indicado.
    if not public.fin_approval_member_eligible(v_request.organization_id, v_entity, auth.uid(), v_stage.roles, v_stage.scope) then
      raise exception 'approver no longer eligible';
    end if;
  else
    -- ...ou como substituto: delegação ativa, etapa que admite delegação,
    -- substituto elegível por si mesmo e fora das demais etapas do pedido.
    select s.id, d.id into v_step_id, v_delegation
      from public.fin_approval_steps s
      join public.fin_approval_stages st on st.id = s.stage_id and st.status = 'active' and st.allow_delegation
      join public.fin_approval_delegations d on d.organization_id = v_request.organization_id and d.delegator_id = s.approver_id
           and d.delegate_id = auth.uid() and d.revoked_at is null and now() >= d.starts_at and now() < d.ends_at
     where s.request_id = p_request and s.status = 'pending'
     order by s.position, d.created_at limit 1;
    if v_step_id is null then raise exception 'forbidden'; end if;
    select * into v_step from public.fin_approval_steps where id = v_step_id for update;
    select * into v_stage from public.fin_approval_stages where id = v_step.stage_id;
    if exists (select 1 from public.fin_approval_steps x where x.request_id = p_request and (x.approver_id = auth.uid() or x.acted_by = auth.uid())) then
      raise exception 'segregation of duties';
    end if;
    if not public.fin_approval_member_eligible(v_request.organization_id, v_entity, auth.uid(), v_stage.roles, v_stage.scope) then
      raise exception 'approver no longer eligible';
    end if;
  end if;

  update public.fin_approval_steps set status = p_action, comment = nullif(trim(coalesce(p_comment,'')),''), acted_at = now(),
         acted_by = auth.uid(), delegation_id = v_delegation, reason_code = p_reason_code
   where id = v_step.id;
  if p_action = 'approved' then
    select count(*) into v_done from public.fin_approval_steps where stage_id = v_stage.id and status = 'approved';
    if v_done >= v_stage.min_approvals then
      update public.fin_approval_stages set status = 'approved', completed_at = now() where id = v_stage.id;
      update public.fin_approval_steps set status = 'not_required' where stage_id = v_stage.id and status = 'pending';
    end if;
    -- Andamento antes do evento: o aviso já encontra a próxima sequência aberta.
    v_status := public.fin_approval_refresh(p_request);
    insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
      values (v_request.organization_id, 'rfq', v_request.rfq_id, 'approval_approved', auth.uid(),
              jsonb_build_object('request_id', p_request, 'step', v_step.position, 'stage', v_stage.stage_key, 'on_behalf_of', case when v_delegation is not null then v_step.approver_id end));
  else
    update public.fin_approval_stages set status = p_action, completed_at = now() where id = v_stage.id;
    update public.fin_approval_requests set status = p_action, resolved_at = now() where id = p_request;
    perform public.fin_approval_close_open(p_request, 'cancelled');
    insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
      values (v_request.organization_id, 'rfq', v_request.rfq_id, 'approval_' || p_action, auth.uid(),
              jsonb_build_object('request_id', p_request, 'step', v_step.position, 'stage', v_stage.stage_key, 'reason_code', p_reason_code,
                                 'on_behalf_of', case when v_delegation is not null then v_step.approver_id end));
    v_status := p_action;
  end if;
  return v_status;
end $$;
create or replace function public.fin_approval_snapshot_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.policy_snapshot is null and new.policy_snapshot is not null then raise exception 'immutable record'; end if;
  if old.policy_snapshot is not null and (new.policy_snapshot is distinct from old.policy_snapshot
     or new.policy_version_ids is distinct from old.policy_version_ids or new.evaluated_at is distinct from old.evaluated_at
     or new.declared_facts is distinct from old.declared_facts or new.justification is distinct from old.justification
     or new.expires_at is distinct from old.expires_at) then
    raise exception 'immutable record';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then raise exception 'immutable record'; end if;
  return new;
end $$;
create or replace function public.fin_record_decision_v2(
  p_rfq uuid, p_proposal uuid, p_expected_version integer,
  p_criteria jsonb default '{}'::jsonb, p_rationale text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_version integer;
begin
  if p_expected_version is null or p_expected_version < 1 then raise exception 'invalid expected version'; end if;
  -- A RFQ travada impede envio concorrente (o envio trava a RFQ antes da proposta):
  -- a versão lida aqui é a que a decisão vai gravar.
  select organization_id into v_org from public.fin_rfqs where id = p_rfq for update;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  select current_version into v_version from public.fin_proposals
    where id = p_proposal and rfq_id = p_rfq and buyer_organization_id = v_org;
  if v_version is null then raise exception 'proposal not eligible'; end if;
  if v_version <> p_expected_version then raise exception 'proposal version changed'; end if;
  return public.fin_record_decision(p_rfq, p_proposal, p_criteria, p_rationale);
end $$;
create or replace function public.fin_register_contract(
  p_decision uuid, p_starts date, p_ends date, p_notice integer default 60,
  p_cost text default null, p_conditions text default null, p_reference text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_dec public.fin_decisions%rowtype; v_provider uuid; v_product text; v_id uuid; v_review date;
begin
  select * into v_dec from public.fin_decisions where id = p_decision for update;
  if not found then raise exception 'decision not found'; end if;
  if not public.fin_has_role(v_dec.organization_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.fin_contracts c where c.decision_id = p_decision) then raise exception 'contract already registered'; end if;
  if p_ends < p_starts then raise exception 'invalid period'; end if;
  select p.provider_id, p.product into v_provider, v_product from public.fin_proposals p where p.id = v_dec.proposal_id;
  insert into public.fin_contracts (organization_id, decision_id, proposal_id, provider_id, product,
      starts_on, ends_on, renewal_notice_days, cost_summary, main_conditions, document_reference, owner_id)
    values (v_dec.organization_id, p_decision, v_dec.proposal_id, v_provider, v_product,
      p_starts, p_ends, coalesce(p_notice,60), p_cost, p_conditions, p_reference, auth.uid())
    returning id into v_id;
  update public.fin_rfqs set status = 'contracted', updated_at = now()
    where id = v_dec.rfq_id and status = 'decided';
  v_review := p_ends - coalesce(p_notice,60);
  insert into public.fin_tasks (organization_id, title, due_on, related_type, related_id, created_by)
    values (v_dec.organization_id,
            'Revisar renovação do contrato antes do aviso prévio', v_review, 'contract', v_id, auth.uid());
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_dec.organization_id, 'contract', v_id, 'contract_registered', auth.uid(),
            jsonb_build_object('review_from', v_review));
  return v_id;
end $$;
drop function if exists public.fin_external_lock_source(uuid,integer,integer,text[]);
drop view if exists public.fin_decision_source_versions;
drop view if exists public.fin_decision_sources;
alter table public.fin_contracts drop constraint if exists contract_external_decision;
alter table public.fin_decisions drop constraint if exists decision_external_contract_identity;
alter table public.fin_decisions drop constraint if exists decision_external_header;
alter table public.fin_decisions drop constraint if exists decision_external_version;
alter table public.fin_approval_requests drop constraint if exists approval_external_header;
alter table public.fin_approval_requests drop constraint if exists approval_external_version;
alter table public.fin_external_proposals drop constraint if exists external_header_rfq_identity;
alter table public.fin_decisions drop constraint if exists decision_typed_source;
drop index if exists public.fin_decisions_external_intent;
alter table public.fin_decisions drop column if exists external_proposal_id;
alter table public.fin_decisions drop column if exists external_proposal_version;
alter table public.fin_decisions drop column if exists external_rfq_revision;
alter table public.fin_decisions drop column if exists external_request_key;
alter table public.fin_decisions drop column if exists external_request_hash;
alter table public.fin_approval_requests drop constraint if exists approval_typed_source;
drop index if exists public.fin_approval_requests_external_intent;
alter table public.fin_approval_requests drop column if exists external_proposal_id;
alter table public.fin_approval_requests drop column if exists external_rfq_revision;
alter table public.fin_approval_requests drop column if exists external_request_key;
alter table public.fin_approval_requests drop column if exists external_request_hash;
alter table public.fin_contracts drop constraint if exists contract_external_source;
drop index if exists public.fin_contracts_external_intent;
alter table public.fin_contracts drop column if exists external_proposal_id;
alter table public.fin_contracts drop column if exists external_proposal_version;
alter table public.fin_contracts drop column if exists external_request_key;
alter table public.fin_contracts drop column if exists external_request_hash;
alter table public.fin_decisions alter column proposal_id set not null;
alter table public.fin_approval_requests alter column proposal_id set not null;
update public.fin_settings set value='financial-relationship-continuity-1',updated_at=now() where key='schema_version';
notify pgrst,'reload schema';
commit;

-- Policy & Approval Engine v2 (guideline §27, addendum v2.1 H.1 item 8).
-- Aditivo e idempotente. Rollback: docs/rollback/supabase-financial-policy-engine.rollback.sql
--
-- Policies configuráveis e VERSIONADAS (cada versão é imutável), globais
-- (grupo) ou locais (entidade). Avaliação determinística no banco sobre fatos
-- do processo: produto, valor, prazo, garantia exigida, provedor novo, número
-- de propostas e entidade. Global e local se somam; prevalece o mais restrito.
--
-- A avaliação vigente no momento do pedido de aprovação fica gravada no
-- próprio pedido (policy_evaluation): mudar ou aposentar uma policy depois
-- NÃO altera processo em andamento. Sem pedido, a decisão é conferida contra a
-- avaliação corrente.
--
-- Requisitos que uma regra pode impor:
--   approvals (mínimo de aprovadores), approver_groups (papéis + escopo, ex.:
--   tesouraria do grupo), min_proposals + justificativa, step_hours (prazo de
--   cada etapa) + escalate_to (quem é avisado no atraso), sod_decider (quem
--   pediu a aprovação não registra a decisão).
--
-- Nada aqui decide pelo cliente: a policy é dele e só exige etapas humanas.

-- ------------------------------------------------- 1. policies versionadas
create or replace function public.fin_valid_policy_rules(p_rules jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare r jsonb; g jsonb; v_ids text[] := '{}';
begin
  if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) not between 1 and 30 or length(p_rules::text) > 20000 or p_rules::text ~ '[<>]' then
    return false;
  end if;
  for r in select * from jsonb_array_elements(p_rules) loop
    if coalesce(r->>'id','') !~ '^[a-z][a-z0-9_]{1,40}$' or (r->>'id') = any(v_ids) or length(coalesce(r->>'label','')) not between 2 and 160
       or jsonb_typeof(r->'when') <> 'object' or jsonb_typeof(r->'require') <> 'object' then return false; end if;
    v_ids := v_ids || (r->>'id');
    -- Condições aceitas (todas opcionais; ausência = não restringe).
    if exists (select 1 from jsonb_object_keys(r->'when') k where k not in
         ('products','amount_gte','amount_lt','term_months_gt','collateral_required','provider_new','proposals_lt')) then return false; end if;
    if r->'when' ? 'products' and (jsonb_typeof(r->'when'->'products') <> 'array'
         or exists (select 1 from jsonb_array_elements_text(r->'when'->'products') p where p not in ('credit','acquiring'))) then return false; end if;
    if (r->'when' ? 'amount_gte' and jsonb_typeof(r->'when'->'amount_gte') <> 'number')
       or (r->'when' ? 'amount_lt' and jsonb_typeof(r->'when'->'amount_lt') <> 'number')
       or (r->'when' ? 'term_months_gt' and jsonb_typeof(r->'when'->'term_months_gt') <> 'number')
       or (r->'when' ? 'proposals_lt' and jsonb_typeof(r->'when'->'proposals_lt') <> 'number')
       or (r->'when' ? 'collateral_required' and jsonb_typeof(r->'when'->'collateral_required') <> 'boolean')
       or (r->'when' ? 'provider_new' and jsonb_typeof(r->'when'->'provider_new') <> 'boolean') then return false; end if;
    if exists (select 1 from jsonb_object_keys(r->'require') k where k not in
         ('approval_required','approvals','approver_groups','min_proposals','justification','step_hours','escalate_to','sod_decider')) then return false; end if;
    if (r->'require' ? 'approvals' and (jsonb_typeof(r->'require'->'approvals') <> 'number' or (r->'require'->>'approvals')::numeric not between 1 and 5))
       or (r->'require' ? 'min_proposals' and (jsonb_typeof(r->'require'->'min_proposals') <> 'number' or (r->'require'->>'min_proposals')::numeric not between 1 and 20))
       or (r->'require' ? 'step_hours' and (jsonb_typeof(r->'require'->'step_hours') <> 'number' or (r->'require'->>'step_hours')::numeric not between 1 and 720))
       or (r->'require' ? 'escalate_to' and coalesce(r->'require'->>'escalate_to','') !~ '^[0-9a-f-]{36}$')
       or (r->'require' ? 'approval_required' and jsonb_typeof(r->'require'->'approval_required') <> 'boolean')
       or (r->'require' ? 'justification' and jsonb_typeof(r->'require'->'justification') <> 'boolean')
       or (r->'require' ? 'sod_decider' and jsonb_typeof(r->'require'->'sod_decider') <> 'boolean') then return false; end if;
    if r->'require' ? 'approver_groups' then
      if jsonb_typeof(r->'require'->'approver_groups') <> 'array' or jsonb_array_length(r->'require'->'approver_groups') > 5 then return false; end if;
      for g in select * from jsonb_array_elements(r->'require'->'approver_groups') loop
        if jsonb_typeof(g->'roles') <> 'array' or jsonb_array_length(g->'roles') = 0
           or exists (select 1 from jsonb_array_elements_text(g->'roles') x where x not in ('admin','finance_manager','analyst','viewer'))
           or coalesce(g->>'scope','any') not in ('any','group') or length(coalesce(g->>'label','')) not between 2 and 120 then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end $$;

create table if not exists public.fin_policy_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  policy_key text not null check (policy_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  version integer not null check (version > 0),
  name text not null check (length(trim(name)) between 2 and 160 and name !~ '[<>]'),
  legal_entity_id uuid,
  rules jsonb not null check (public.fin_valid_policy_rules(rules)),
  status text not null default 'active' check (status in ('active','retired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (organization_id, policy_key, version),
  unique (organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id)
);
create index if not exists fin_policy_versions_active on public.fin_policy_versions(organization_id, status, legal_entity_id);
create or replace function public.fin_policy_version_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if current_user = 'service_role' and exists (select 1 from public.fin_settings where key = 'deployment_environment' and value = 'demo') then return old; end if;
    raise exception 'immutable record';
  end if;
  if new.rules is distinct from old.rules or new.name is distinct from old.name or new.version is distinct from old.version
     or new.policy_key is distinct from old.policy_key or new.legal_entity_id is distinct from old.legal_entity_id or new.organization_id is distinct from old.organization_id then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
drop trigger if exists fin_policy_versions_guard on public.fin_policy_versions;
create trigger fin_policy_versions_guard before update or delete on public.fin_policy_versions
  for each row execute function public.fin_policy_version_guard();

alter table public.fin_policy_versions enable row level security;
alter table public.fin_policy_versions force row level security;
revoke all on public.fin_policy_versions from anon, authenticated;
grant select on public.fin_policy_versions to authenticated;
drop policy if exists fin_policy_version_read on public.fin_policy_versions;
create policy fin_policy_version_read on public.fin_policy_versions for select to authenticated
  using (public.fin_group_or_entity_visible(organization_id, legal_entity_id));

alter table public.fin_approval_requests add column if not exists policy_evaluation jsonb;
alter table public.fin_approval_requests add column if not exists justification text;
alter table public.fin_approval_requests drop constraint if exists fin_approval_requests_justification_check;
alter table public.fin_approval_requests add constraint fin_approval_requests_justification_check
  check (justification is null or (length(trim(justification)) between 10 and 2000 and justification !~ '[<>]'));
alter table public.fin_approval_steps add column if not exists due_at timestamptz;
alter table public.fin_approval_steps add column if not exists escalated_at timestamptz;
create index if not exists fin_approval_steps_due on public.fin_approval_steps(due_at) where status = 'pending' and escalated_at is null;

-- ------------------------------------------------- 2. avaliação
-- Fatos do processo, sempre lidos do banco.
create or replace function public.fin_policy_context(p_rfq uuid, p_proposal uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.fin_rfqs%rowtype; v_terms jsonb := '{}'::jsonb; v_provider uuid; v_amount numeric; v_term numeric;
begin
  select * into r from public.fin_rfqs where id = p_rfq;
  if not found then return null; end if;
  if p_proposal is not null then
    select v.terms, p.provider_id into v_terms, v_provider
      from public.fin_proposals p join public.fin_proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
     where p.id = p_proposal and p.rfq_id = p_rfq;
  end if;
  v_amount := public.fin_try_numeric(coalesce(r.demand->>'amount', r.demand->>'monthly_volume'));
  v_term := public.fin_try_numeric(coalesce(v_terms->>'term_months', r.demand->>'term_months'));
  return jsonb_build_object(
    'product', r.product,
    'amount', v_amount,
    'term_months', v_term,
    'collateral_required', coalesce(nullif(trim(coalesce(v_terms->>'collateral_required','')), ''), null) is not null,
    'provider_new', v_provider is not null and not exists (select 1 from public.fin_contracts c where c.organization_id = r.organization_id and c.provider_id = v_provider),
    'proposals', (select count(*) from public.fin_proposals p where p.rfq_id = p_rfq and p.current_version > 0 and p.status <> 'withdrawn'),
    'legal_entity_id', r.legal_entity_id
  );
end $$;

-- Avaliação: policies ativas globais + locais da entidade (ou da entidade-mãe
-- da unidade). Requisitos se combinam pelo mais restrito.
create or replace function public.fin_evaluate_policies(p_rfq uuid, p_proposal uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_entity uuid; v_parent uuid; c jsonb; p record; r jsonb; v_when jsonb; v_req jsonb;
  v_policies jsonb := '[]'::jsonb; v_matched jsonb := '[]'::jsonb; v_groups jsonb := '[]'::jsonb;
  v_required boolean := false; v_approvals integer := 0; v_min integer := 0; v_just boolean := false; v_hours integer; v_escalate text; v_sod boolean := false;
begin
  select organization_id, legal_entity_id into v_org, v_entity from public.fin_rfqs where id = p_rfq;
  if v_org is null then return null; end if;
  select parent_id into v_parent from public.fin_legal_entities where id = v_entity;
  c := public.fin_policy_context(p_rfq, p_proposal);
  -- Compatibilidade com a política v1 (exigir aprovação antes de decidir).
  if exists (select 1 from public.fin_approval_policies where organization_id = v_org and required_for_decision) then
    v_required := true; v_approvals := 1;
    v_matched := v_matched || jsonb_build_object('policy', 'v1', 'rule', 'required_for_decision', 'label', 'Política geral: aprovação antes da decisão');
  end if;
  for p in select * from public.fin_policy_versions
            where organization_id = v_org and status = 'active'
              and (legal_entity_id is null or legal_entity_id = v_entity or legal_entity_id = v_parent)
            order by (legal_entity_id is null) desc, policy_key, version loop
    v_policies := v_policies || jsonb_build_object('id', p.id, 'key', p.policy_key, 'version', p.version, 'name', p.name, 'scope', case when p.legal_entity_id is null then 'group' else 'entity' end);
    for r in select * from jsonb_array_elements(p.rules) loop
      v_when := r->'when';
      if (v_when ? 'products' and not (v_when->'products') ? (c->>'product'))
         or (v_when ? 'amount_gte' and coalesce((c->>'amount')::numeric, -1) < (v_when->>'amount_gte')::numeric)
         or (v_when ? 'amount_lt' and coalesce((c->>'amount')::numeric, 'infinity'::numeric) >= (v_when->>'amount_lt')::numeric)
         or (v_when ? 'term_months_gt' and coalesce((c->>'term_months')::numeric, -1) <= (v_when->>'term_months_gt')::numeric)
         or (v_when ? 'collateral_required' and (c->>'collateral_required')::boolean is distinct from (v_when->>'collateral_required')::boolean)
         or (v_when ? 'provider_new' and (c->>'provider_new')::boolean is distinct from (v_when->>'provider_new')::boolean)
         or (v_when ? 'proposals_lt' and (c->>'proposals')::numeric >= (v_when->>'proposals_lt')::numeric) then
        continue;
      end if;
      v_req := r->'require';
      v_matched := v_matched || jsonb_build_object('policy', p.id, 'policy_key', p.policy_key, 'version', p.version, 'rule', r->>'id', 'label', r->>'label');
      if coalesce((v_req->>'approval_required')::boolean, false) or v_req ? 'approvals' or v_req ? 'approver_groups' then v_required := true; end if;
      v_approvals := greatest(v_approvals, coalesce((v_req->>'approvals')::integer, case when v_required then 1 else 0 end));
      if v_req ? 'approver_groups' then v_groups := v_groups || (v_req->'approver_groups'); end if;
      v_min := greatest(v_min, coalesce((v_req->>'min_proposals')::integer, 0));
      v_just := v_just or coalesce((v_req->>'justification')::boolean, false);
      if v_req ? 'step_hours' then v_hours := least(coalesce(v_hours, 100000), (v_req->>'step_hours')::integer); end if;
      v_escalate := coalesce(v_escalate, v_req->>'escalate_to');
      v_sod := v_sod or coalesce((v_req->>'sod_decider')::boolean, false);
    end loop;
  end loop;
  return jsonb_build_object(
    'evaluated_at', now(),
    'context', c,
    'policies', v_policies,
    'matched', v_matched,
    'requirements', jsonb_build_object(
      'approval_required', v_required, 'approvals', greatest(v_approvals, case when v_required then 1 else 0 end),
      'approver_groups', v_groups, 'min_proposals', v_min,
      'justification_required', v_just or (v_min > 0 and (c->>'proposals')::integer < v_min),
      'step_hours', v_hours, 'escalate_to', v_escalate, 'sod_decider', v_sod));
end $$;

-- Prévia para a interface: mesma avaliação, só para quem lê a RFQ.
create or replace function public.fin_preview_policy(p_rfq uuid, p_proposal uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.fin_rfq_visible(p_rfq) then raise exception 'rfq not found'; end if;
  return public.fin_evaluate_policies(p_rfq, p_proposal);
end $$;

-- ------------------------------------------------- 3. administração
create or replace function public.fin_publish_policy(p_org uuid, p_key text, p_name text, p_entity uuid, p_rules jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_version integer; v_bad uuid;
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if p_entity is not null and not exists (select 1 from public.fin_legal_entities e where e.organization_id = p_org and e.id = p_entity and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
  if p_rules is null or not public.fin_valid_policy_rules(p_rules) then raise exception 'invalid policy'; end if;
  -- Quem recebe a escalação precisa ser membro da compradora.
  select (x->'require'->>'escalate_to')::uuid into v_bad from jsonb_array_elements(p_rules) x
   where x->'require' ? 'escalate_to' and not exists (select 1 from public.fin_members m where m.organization_id = p_org and m.user_id = (x->'require'->>'escalate_to')::uuid)
   limit 1;
  if v_bad is not null then raise exception 'invalid policy'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.fin_policy_versions where organization_id = p_org and policy_key = p_key;
  if exists (select 1 from public.fin_policy_versions where organization_id = p_org and policy_key = p_key and legal_entity_id is distinct from p_entity) then
    raise exception 'invalid policy';
  end if;
  update public.fin_policy_versions set status = 'retired', retired_at = now() where organization_id = p_org and policy_key = p_key and status = 'active';
  insert into public.fin_policy_versions(organization_id, policy_key, version, name, legal_entity_id, rules, created_by)
    values (p_org, p_key, v_version, trim(p_name), p_entity, p_rules, auth.uid()) returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (p_org, 'organization', p_org, 'policy_published', auth.uid(), jsonb_build_object('policy_id', v_id, 'key', p_key, 'version', v_version, 'rules', jsonb_array_length(p_rules)), p_entity);
  return v_id;
exception when check_violation then raise exception 'invalid policy';
end $$;

create or replace function public.fin_retire_policy(p_policy uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.fin_policy_versions%rowtype;
begin
  select * into v from public.fin_policy_versions where id = p_policy for update;
  if not found or not public.fin_has_role(v.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if v.status = 'retired' then return; end if;
  update public.fin_policy_versions set status = 'retired', retired_at = now() where id = p_policy;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (v.organization_id, 'organization', v.organization_id, 'policy_retired', auth.uid(), jsonb_build_object('policy_id', v.id, 'key', v.policy_key, 'version', v.version), v.legal_entity_id);
end $$;

-- ------------------------------------------------- 4. pedido de aprovação
-- Mesma regra do pedido v1 (serializado pela RFQ, solicitante não aprova,
-- até 5 etapas) + requisitos da policy, gravados no próprio pedido.
create or replace function public.fin_request_approval_v2(
  p_rfq uuid, p_proposal uuid, p_approvers uuid[], p_rationale text, p_justification text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rfq public.fin_rfqs%rowtype; v_version integer; v_id uuid; v_actor uuid; v_position integer := 0; v_terms jsonb;
  v_eval jsonb; v_req jsonb; g jsonb; v_hours integer; v_count integer;
begin
  select * into v_rfq from public.fin_rfqs where id = p_rfq for update;
  if not found then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_rfq.organization_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_rfq.status not in ('collecting','comparing') then raise exception 'invalid state'; end if;
  v_count := coalesce(array_length(p_approvers,1),0);
  if v_count not between 1 and 5 or length(trim(coalesce(p_rationale,''))) not between 1 and 4000 then
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

  v_eval := public.fin_evaluate_policies(p_rfq, p_proposal);
  v_req := v_eval->'requirements';
  if v_count < coalesce((v_req->>'approvals')::integer, 0) then raise exception 'policy approvers required'; end if;
  for g in select * from jsonb_array_elements(coalesce(v_req->'approver_groups','[]'::jsonb)) loop
    if not exists (select 1 from unnest(p_approvers) a join public.fin_members m on m.organization_id = v_rfq.organization_id and m.user_id = a
                    where m.role in (select jsonb_array_elements_text(g->'roles'))
                      and (coalesce(g->>'scope','any') = 'any' or m.entity_scope = 'group')) then
      raise exception 'policy approver group missing';
    end if;
  end loop;
  if coalesce((v_req->>'justification_required')::boolean, false) and length(trim(coalesce(p_justification,''))) < 10 then
    raise exception 'policy justification required';
  end if;
  v_hours := (v_req->>'step_hours')::integer;

  insert into public.fin_approval_requests(organization_id,rfq_id,proposal_id,proposal_version,rfq_updated_at,requested_by,rationale,snapshot,policy_evaluation,justification)
    values(v_rfq.organization_id,p_rfq,p_proposal,v_version,v_rfq.updated_at,auth.uid(),trim(p_rationale),
      jsonb_build_object('proposal_version',v_version,'terms',v_terms,'rfq_demand',v_rfq.demand,'rfq_title',v_rfq.title,'deadline',v_rfq.response_deadline),
      v_eval, nullif(trim(coalesce(p_justification,'')),''))
    returning id into v_id;
  for v_position in 1..v_count loop
    insert into public.fin_approval_steps(request_id,position,approver_id,due_at)
      values(v_id,v_position,p_approvers[v_position], case when v_position = 1 and v_hours is not null then now() + make_interval(hours => v_hours) end);
  end loop;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(v_rfq.organization_id,'rfq',p_rfq,'approval_requested',auth.uid(),jsonb_build_object('request_id',v_id,'steps',v_count,'version',v_version,
      'policy_rules',jsonb_array_length(v_eval->'matched')));
  return v_id;
end $$;

-- O pedido v1 passa pela mesma avaliação (nenhum caminho antigo pula a policy).
create or replace function public.fin_request_approval(p_rfq uuid, p_proposal uuid, p_approvers uuid[], p_rationale text)
returns uuid language sql security definer set search_path = '' as $$
  select public.fin_request_approval_v2(p_rfq, p_proposal, p_approvers, p_rationale, null);
$$;

-- A etapa seguinte ganha prazo quando a anterior é aprovada.
create or replace function public.fin_approval_step_deadline()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_hours integer;
begin
  if new.status = 'approved' and old.status = 'pending' then
    select (r.policy_evaluation->'requirements'->>'step_hours')::integer into v_hours from public.fin_approval_requests r where r.id = new.request_id;
    if v_hours is not null then
      update public.fin_approval_steps set due_at = now() + make_interval(hours => v_hours)
       where request_id = new.request_id and position = new.position + 1 and status = 'pending' and due_at is null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fin_approval_steps_deadline on public.fin_approval_steps;
create trigger fin_approval_steps_deadline after update on public.fin_approval_steps
  for each row execute function public.fin_approval_step_deadline();

-- ------------------------------------------------- 5. decisão
-- Mesma decisão de antes + policy: com pedido, valem os requisitos gravados
-- nele; sem pedido, a avaliação corrente diz se a aprovação era exigida.
create or replace function public.fin_record_decision(
  p_rfq uuid, p_proposal uuid, p_criteria jsonb default '{}'::jsonb, p_rationale text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_snapshot jsonb; v_id uuid; v_version integer; v_approval public.fin_approval_requests%rowtype; v_updated timestamptz;
  v_eval jsonb; v_req jsonb;
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
  v_eval := coalesce(v_approval.policy_evaluation, public.fin_evaluate_policies(p_rfq, p_proposal));
  v_req := v_eval->'requirements';
  if v_approval.id is null and coalesce((v_req->>'approval_required')::boolean, false) then
    raise exception 'approval required or stale';
  end if;
  if v_approval.id is not null and (v_approval.status <> 'approved' or v_approval.proposal_id <> p_proposal
    or v_approval.proposal_version <> v_version or v_approval.rfq_updated_at is distinct from v_updated) then
    raise exception 'approval required or stale';
  end if;
  if v_approval.id is not null and coalesce((v_req->>'sod_decider')::boolean, false) and v_approval.requested_by = auth.uid() then
    raise exception 'segregation of duties';
  end if;
  if v_approval.id is null and coalesce((v_req->>'justification_required')::boolean, false) and length(trim(coalesce(p_rationale,''))) < 10 then
    raise exception 'policy justification required';
  end if;
  select jsonb_build_object('decided_proposal_id',p_proposal,'decided_version',v_version,'captured_at',now(),
    'approval_request_id',v_approval.id,'policy',jsonb_build_object('matched',v_eval->'matched','policies',v_eval->'policies','requirements',v_req),
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
      'policy_rules',jsonb_array_length(coalesce(v_eval->'matched','[]'::jsonb))));
  return v_id;
end $$;

-- ------------------------------------------------- 6. prazos e escalação
-- Etapa vencida: avisa quem a policy indicou (ou os admins do grupo), cria
-- tarefa e marca a etapa como escalada. Idempotente. Não aprova nada.
create or replace function public.fin_process_approval_deadlines(p_org uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare s record; v_target uuid; v_task uuid; v_count integer := 0;
begin
  if auth.uid() is not null and (p_org is null or not public.fin_has_role(p_org, array['admin','finance_manager'])) then raise exception 'forbidden'; end if;
  for s in select st.id, st.request_id, st.approver_id, st.position, r.organization_id, r.rfq_id, r.requested_by,
                  (r.policy_evaluation->'requirements'->>'escalate_to')::uuid escalate_to, f.legal_entity_id
             from public.fin_approval_steps st
             join public.fin_approval_requests r on r.id = st.request_id and r.status = 'pending'
             join public.fin_rfqs f on f.id = r.rfq_id
            where st.status = 'pending' and st.escalated_at is null and st.due_at is not null and st.due_at < now()
              and (p_org is null or r.organization_id = p_org)
              and (auth.uid() is null or public.fin_entity_visible(r.organization_id, f.legal_entity_id))
            order by st.due_at for update of st
  loop
    v_target := coalesce(s.escalate_to, (select m.user_id from public.fin_members m where m.organization_id = s.organization_id and m.role = 'admin' order by m.created_at limit 1));
    insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (s.organization_id, 'Aprovação em atraso: acompanhar a etapa pendente', current_date, 'open', 'rfq', s.rfq_id, coalesce(auth.uid(), s.requested_by))
      returning id into v_task;
    update public.fin_approval_steps set escalated_at = now() where id = s.id;
    if v_target is not null then
      insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
        values (s.organization_id, v_target, 'approval_requested', 'rfq', s.rfq_id, v_task, 'Aprovação em atraso', 'Uma etapa de aprovação passou do prazo da política.')
        on conflict (user_id, event_type, event_id) do nothing;
    end if;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (s.organization_id, 'rfq', s.rfq_id, 'approval_step_escalated', auth.uid(), jsonb_build_object('request_id', s.request_id, 'step', s.position, 'task_id', v_task));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.fin_run_approval_deadlines()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  return public.fin_process_approval_deadlines(null);
end $$;

alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check (job in ('renewals','contract_milestones','approval_deadlines'));

-- ------------------------------------------------- 7. grants
revoke all on function public.fin_valid_policy_rules(jsonb) from public, anon, authenticated;
revoke all on function public.fin_policy_version_guard() from public, anon, authenticated;
revoke all on function public.fin_policy_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fin_evaluate_policies(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fin_approval_step_deadline() from public, anon, authenticated;
revoke all on function public.fin_run_approval_deadlines() from public, anon, authenticated;
grant execute on function public.fin_run_approval_deadlines() to service_role;
revoke all on function public.fin_preview_policy(uuid, uuid), public.fin_publish_policy(uuid, text, text, uuid, jsonb), public.fin_retire_policy(uuid),
  public.fin_request_approval_v2(uuid, uuid, uuid[], text, text), public.fin_request_approval(uuid, uuid, uuid[], text),
  public.fin_record_decision(uuid, uuid, jsonb, text), public.fin_process_approval_deadlines(uuid) from public, anon;
grant execute on function public.fin_preview_policy(uuid, uuid), public.fin_publish_policy(uuid, text, text, uuid, jsonb), public.fin_retire_policy(uuid),
  public.fin_request_approval_v2(uuid, uuid, uuid[], text, text), public.fin_request_approval(uuid, uuid, uuid[], text),
  public.fin_record_decision(uuid, uuid, jsonb, text), public.fin_process_approval_deadlines(uuid) to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-policy-engine-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

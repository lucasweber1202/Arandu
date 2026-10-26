-- Typed external source in the existing decision/approval lifecycle.
begin;
do $$ begin
 if exists(select 1 from public.fin_external_proposals e join public.fin_proposals p on p.id=e.id) then
  raise exception 'external identity conflict';
 end if;
end $$;
alter table public.fin_decisions alter column proposal_id drop not null;
alter table public.fin_approval_requests alter column proposal_id drop not null;
alter table public.fin_decisions add column if not exists external_proposal_id uuid;
alter table public.fin_decisions add column if not exists external_proposal_version integer;
alter table public.fin_decisions add column if not exists external_rfq_revision integer;
alter table public.fin_approval_requests add column if not exists external_proposal_id uuid;
alter table public.fin_approval_requests add column if not exists external_rfq_revision integer;
alter table public.fin_contracts add column if not exists external_proposal_id uuid;
alter table public.fin_contracts add column if not exists external_proposal_version integer;
do $$ declare t text; begin
 foreach t in array array['fin_decisions','fin_approval_requests','fin_contracts'] loop
  execute format('alter table public.%I add column if not exists external_request_key text',t);
  execute format('alter table public.%I add column if not exists external_request_hash text',t);
  execute format('create unique index if not exists %I on public.%I(organization_id,external_request_key) where external_request_key is not null',t||'_external_intent',t);
 end loop;
end $$;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='external_header_rfq_identity') then
  alter table public.fin_external_proposals add constraint external_header_rfq_identity unique(organization_id,rfq_id,id);
  alter table public.fin_decisions add constraint decision_external_header foreign key(organization_id,rfq_id,external_proposal_id) references public.fin_external_proposals(organization_id,rfq_id,id);
  alter table public.fin_decisions add constraint decision_external_version foreign key(external_proposal_id,external_proposal_version) references public.fin_external_proposal_versions(proposal_id,version);
  alter table public.fin_decisions add constraint decision_external_contract_identity unique(organization_id,id,external_proposal_id,external_proposal_version);
  alter table public.fin_approval_requests add constraint approval_external_header foreign key(organization_id,rfq_id,external_proposal_id) references public.fin_external_proposals(organization_id,rfq_id,id);
  alter table public.fin_approval_requests add constraint approval_external_version foreign key(external_proposal_id,proposal_version) references public.fin_external_proposal_versions(proposal_id,version);
  alter table public.fin_contracts add constraint contract_external_decision foreign key(organization_id,decision_id,external_proposal_id,external_proposal_version) references public.fin_decisions(organization_id,id,external_proposal_id,external_proposal_version);
 end if;
end $$;
alter table public.fin_decisions drop constraint if exists decision_typed_source;
alter table public.fin_decisions add constraint decision_typed_source check(
 (proposal_id is not null and external_proposal_id is null and external_proposal_version is null and external_rfq_revision is null and external_request_key is null and external_request_hash is null)
 or (proposal_id is null and external_proposal_id is not null and external_proposal_version is not null and external_proposal_version>0 and external_rfq_revision is not null and external_rfq_revision>0 and external_request_key is not null and external_request_hash is not null));
alter table public.fin_approval_requests drop constraint if exists approval_typed_source;
alter table public.fin_approval_requests add constraint approval_typed_source check(
 (proposal_id is not null and external_proposal_id is null and external_rfq_revision is null and external_request_key is null and external_request_hash is null)
 or (proposal_id is null and external_proposal_id is not null and external_rfq_revision is not null and external_rfq_revision>0 and external_request_key is not null and external_request_hash is not null));
alter table public.fin_contracts drop constraint if exists contract_external_source;
alter table public.fin_contracts add constraint contract_external_source check(
 (external_proposal_id is null and external_proposal_version is null and external_request_key is null and external_request_hash is null)
 or (origin='imported' and proposal_id is null and decision_id is not null and external_proposal_id is not null and external_proposal_version is not null and external_proposal_version>0 and external_request_key is not null and external_request_hash is not null));

-- Internal adapters: no SELECT/EXECUTE grants to clients, no fabricated identity.
create or replace view public.fin_decision_sources with(security_invoker=true) as
 select p.id,p.rfq_id,p.buyer_organization_id,p.provider_id,p.product,p.status,p.current_version,p.created_at,
 'institution_authenticated'::text as source_kind
 from public.fin_proposals p
 union all
 select e.id,e.rfq_id,e.organization_id,e.provider_id,e.product,e.state,e.current_version,e.recorded_at,'buyer_recorded_external'::text
 from public.fin_external_proposal_current e
 where e.state='reviewed' and e.rfq_revision_matches and (e.document_id is null or e.document_available)
 and not exists(select 1 from public.fin_proposals p where p.id=e.id);
create or replace view public.fin_decision_source_versions with(security_invoker=true) as
 select v.proposal_id,v.version,v.terms,v.submitted_at,v.rfq_revision from public.fin_proposal_versions v
 union all
 select v.proposal_id,v.version,v.terms,null::timestamptz,v.rfq_revision from public.fin_external_proposal_versions v
 where not exists(select 1 from public.fin_proposals p where p.id=v.proposal_id);
revoke all on public.fin_decision_sources,public.fin_decision_source_versions from public,anon,authenticated,service_role;

create or replace function public.fin_external_lock_source(p_id uuid,p_expected integer,p_revision integer,p_roles text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fin_rfqs%rowtype; e public.fin_external_proposal_current%rowtype;
begin
 select r0.* into r from public.fin_rfqs r0 join public.fin_external_proposals p on p.rfq_id=r0.id where p.id=p_id for no key update of r0;
 if r.id is null then raise exception 'forbidden'; end if;
 perform public.fin_external_require_actor(r.organization_id,r.legal_entity_id,p_roles);
 perform 1 from public.fin_external_proposals where id=p_id for share;
 select * into e from public.fin_external_proposal_current where id=p_id;
 if e.document_id is not null then
  perform 1 from public.fin_private_documents where id=e.document_id for share;
  perform 1 from public.fin_document_versions where document_id=e.document_id and version=e.document_version for share;
  select * into e from public.fin_external_proposal_current where id=p_id;
 end if;
 if p_expected is null or p_revision is null or e.current_version is distinct from p_expected or r.revision is distinct from p_revision or e.rfq_revision is distinct from p_revision then raise exception 'external version conflict'; end if;
 if e.state<>'reviewed' or e.reviewed_by is null then raise exception 'external review required'; end if;
 if e.document_id is not null and not e.document_available then raise exception 'external document conflict'; end if;
 if exists(select 1 from public.fin_proposals where id=p_id) then raise exception 'external identity conflict'; end if;
 return to_jsonb(e)||jsonb_build_object('snapshot_version',1,'issuer_identity','buyer_attribution','signature','not_verified','credit_approval','not_recorded','disbursement','not_recorded','notice','Transcrição conferida pela empresa; não autentica o emissor nem representa aceite, assinatura, concessão ou desembolso.');
end $$;
revoke all on function public.fin_external_lock_source(uuid,integer,integer,text[]) from public,anon,authenticated,service_role;

create or replace function public.fin_external_selected_source_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare e jsonb; c jsonb; v integer;
begin
 if not exists(select 1 from public.fin_external_proposals where id=new.proposal_id) then return new; end if;
 c:=nullif(current_setting('arandu.external_intent',true),'')::jsonb;
 if c is null or c->>'actor' is distinct from auth.uid()::text or c->>'id' is distinct from new.proposal_id::text
 or c->>'rfq' is distinct from new.rfq_id::text or c->>'operation' is distinct from (case when tg_table_name='fin_decisions' then 'decision' else 'approval' end) then raise exception 'external command required'; end if;
 v:=(c->>'version')::integer;
 e:=public.fin_external_lock_source(new.proposal_id,v,(c->>'revision')::integer,array['admin','finance_manager']);
 new.external_proposal_id:=new.proposal_id; new.proposal_id:=null;
 new.external_rfq_revision:=(c->>'revision')::integer;
 new.external_request_key:=c->>'key'; new.external_request_hash:=c->>'hash';
 if tg_table_name='fin_decisions' then new.external_proposal_version:=v;
 elsif new.proposal_version is distinct from v then raise exception 'external version conflict'; end if;
 new.snapshot:=new.snapshot||jsonb_build_object('selected_source',e,'source_kind','buyer_recorded_external','decided_proposal_id',null,'decided_external_proposal_id',new.external_proposal_id);
 return new;
end $$;
revoke all on function public.fin_external_selected_source_guard() from public,anon,authenticated,service_role;
drop trigger if exists fin_00_external_source on public.fin_decisions;
create trigger fin_00_external_source before insert on public.fin_decisions for each row execute function public.fin_external_selected_source_guard();
drop trigger if exists fin_00_external_source on public.fin_approval_requests;
create trigger fin_00_external_source before insert on public.fin_approval_requests for each row execute function public.fin_external_selected_source_guard();

create or replace function public.fin_external_command(p_id uuid,p_expected integer,p_revision integer,p_key text,p_operation text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fin_rfqs%rowtype; old_id uuid; old_hash text; h text; e jsonb; result_id uuid; d public.fin_decisions%rowtype; ct public.fin_contracts%rowtype; ct_terms jsonb; pair record;
begin
 select r0.* into r from public.fin_rfqs r0 join public.fin_external_proposals p on p.rfq_id=r0.id where p.id=p_id for no key update of r0;
 if r.id is null then raise exception 'forbidden'; end if;
 perform public.fin_external_require_actor(r.organization_id,r.legal_entity_id,array['admin','finance_manager']);
 if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,80}$' or p_operation is null or p_operation not in ('decision','approval','contract')
 or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32768 then raise exception 'invalid external command'; end if;
 h:=encode(sha256(convert_to(jsonb_build_object('actor',auth.uid(),'id',p_id,'version',p_expected,'revision',p_revision,'operation',p_operation,'payload',case when p_operation='decision' then jsonb_build_object('weights',p_payload->'criteria'->'weights','rationale',p_payload->'rationale') else p_payload end)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('external-command:'||r.organization_id||':'||p_key,0));
 if p_operation='decision' then select id,external_request_hash into old_id,old_hash from public.fin_decisions where organization_id=r.organization_id and external_request_key=p_key;
 elsif p_operation='approval' then select id,external_request_hash into old_id,old_hash from public.fin_approval_requests where organization_id=r.organization_id and external_request_key=p_key;
 else select id,external_request_hash into old_id,old_hash from public.fin_contracts where organization_id=r.organization_id and external_request_key=p_key; end if;
 if old_id is not null then
  if old_hash is distinct from h then raise exception 'external intent conflict'; end if;
  return jsonb_build_object('id',old_id,'replayed',true,'operation',p_operation);
 end if;
 e:=public.fin_external_lock_source(p_id,p_expected,p_revision,array['admin','finance_manager']);
 perform set_config('arandu.external_intent',jsonb_build_object('actor',auth.uid(),'rfq',r.id,'id',p_id,'version',p_expected,'revision',p_revision,'key',p_key,'hash',h,'operation',p_operation)::text,true);
 if p_operation='decision' then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('criteria','rationale')) then raise exception 'invalid external command'; end if;
  result_id:=public.fin_record_decision_v2(r.id,p_id,p_expected,coalesce(p_payload->'criteria','{}'::jsonb),p_payload->>'rationale');
 elsif p_operation='approval' then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('assignments','approver_ids','rationale','justification','declared')) then raise exception 'invalid external command'; end if;
  if p_payload ? 'assignments' then
   result_id:=public.fin_request_policy_approval(r.id,p_id,p_payload->'assignments',p_payload->>'rationale',p_payload->>'justification',coalesce(p_payload->'declared','{}'::jsonb));
  else
   if jsonb_typeof(p_payload->'approver_ids') is distinct from 'array' then raise exception 'invalid external command'; end if;
   result_id:=public.fin_request_approval(r.id,p_id,array(select jsonb_array_elements_text(p_payload->'approver_ids'))::uuid[],p_payload->>'rationale');
  end if;
 else
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('decision_id','contract_id','expected_contract_version','confirmed_contract_record')) or p_payload->'confirmed_contract_record' is distinct from 'true'::jsonb then raise exception 'invalid external contract confirmation'; end if;
  select * into d from public.fin_decisions where id=(p_payload->>'decision_id')::uuid and organization_id=r.organization_id and rfq_id=r.id for update;
  if d.id is null or d.external_proposal_id is distinct from p_id or d.external_proposal_version is distinct from p_expected then raise exception 'external decision conflict'; end if;
  select * into ct from public.fin_contracts where id=(p_payload->>'contract_id')::uuid and organization_id=r.organization_id for update;
  if ct.id is null or ct.origin<>'imported' or ct.decision_id is not null or ct.provider_id is distinct from (e->>'provider_id')::uuid
   or ct.legal_entity_id is distinct from r.legal_entity_id or ct.product<>r.product or ct.current_version<1
   or ct.current_version is distinct from (p_payload->>'expected_contract_version')::integer
   or (e->>'currency' is not null and ct.currency is distinct from e->>'currency') then raise exception 'external contract conflict'; end if;
  select terms into ct_terms from public.fin_contract_versions where contract_id=ct.id and version=ct.current_version;
  -- Compare only explicit values on the same basis; never convert annual/monthly rates.
  for pair in select * from (values ('offered_amount','principal_amount'),('interest_rate_month','rate_pct_month'),
    ('index_spread','spread_pct_year'),('index','indexer'),('amortization','amortization'),
    ('mdr_debit','mdr_debit_pct'),('mdr_credit_cash','mdr_credit_pct'),('mdr_credit_installment','mdr_installment_pct'),('pix_fee','pix_pct'),('anticipation_rate','anticipation_pct_month'),('settlement_days','settlement_days')) m(source_key,contract_key) loop
   if e->'terms'->pair.source_key is not null and e->'terms'->pair.source_key<>'null'::jsonb
    and ct_terms->pair.contract_key is not null and ct_terms->pair.contract_key<>'null'::jsonb
    and e->'terms'->pair.source_key is distinct from ct_terms->pair.contract_key then raise exception 'external contract conflict'; end if;
  end loop;
  if r.product='credit' and e->'terms'->>'term_months' is not null
   and ct.ends_on not in ((ct.starts_on+make_interval(months=>(e->'terms'->>'term_months')::integer))::date,
    (ct.starts_on+make_interval(months=>(e->'terms'->>'term_months')::integer))::date-1) then raise exception 'external contract conflict'; end if;
  if exists(select 1 from public.fin_contracts where decision_id=d.id) then raise exception 'external contract conflict'; end if;
  update public.fin_contracts set decision_id=d.id,external_proposal_id=p_id,external_proposal_version=p_expected,
   external_request_key=p_key,external_request_hash=h,updated_at=now() where id=ct.id;
  update public.fin_rfqs set status='contracted',updated_at=now() where id=r.id;
  result_id:=ct.id;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
   values(r.organization_id,'contract',ct.id,'external_decision_linked',auth.uid(),jsonb_build_object('decision_id',d.id,'external_proposal_id',p_id,'version',p_expected,'signature','not_verified'));
 end if;
 perform set_config('arandu.external_intent','',true);
 return jsonb_build_object('id',result_id,'replayed',false,'operation',p_operation);
end $$;
revoke all on function public.fin_external_command(uuid,integer,integer,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fin_external_command(uuid,integer,integer,text,text,jsonb) to authenticated;

-- Canonical procedures: source adapter only; policy, votes and SoD retained.
create or replace function public.fin_policy_facts(p_rfq uuid, p_proposal uuid, p_declared jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.fin_rfqs%rowtype; v_terms jsonb; v_provider uuid; v_status text; v_parent uuid; v_currency text;
  v_amount numeric; v_offered numeric; v_duration numeric; v_flags jsonb := '[]'::jsonb; v_cov jsonb := 'null'::jsonb; v_guarantee jsonb := 'null'::jsonb;
begin
  select * into r from public.fin_rfqs where id = p_rfq;
  if not found then return null; end if;
  if p_proposal is not null then
    select v.terms, p.provider_id into v_terms, v_provider
      from public.fin_decision_sources p join public.fin_decision_source_versions v on v.proposal_id = p.id and v.version = p.current_version
     where p.id = p_proposal and p.rfq_id = p_rfq;
    select pr.verification_state into v_status from public.fin_providers pr where pr.id = v_provider;
  end if;
  select e.parent_id, e.currency into v_parent, v_currency from public.fin_legal_entities e where e.id = r.legal_entity_id;
  if r.legal_entity_id is null then select o.base_currency into v_currency from public.fin_organizations o where o.id = r.organization_id; end if;
  if exists(select 1 from public.fin_external_proposals where id=p_proposal) then
    select currency into v_currency from public.fin_external_proposal_current where id=p_proposal;
  end if;
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
    'proposals_count', (select count(*) from public.fin_decision_sources p where p.rfq_id = p_rfq and p.current_version > 0 and p.status in ('submitted','revised','reviewed')),
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
  if p_proposal is not null and not exists (select 1 from public.fin_decision_sources p where p.id = p_proposal and p.rfq_id = p_rfq) then raise exception 'proposal not eligible'; end if;
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
  if v_rfq.status not in ('collecting','comparing') and not (v_rfq.status='open' and exists(select 1 from public.fin_external_proposals where id=p_proposal)) then raise exception 'invalid state'; end if;
  if length(trim(coalesce(p_rationale,''))) not between 1 and 4000 then raise exception 'invalid approval request'; end if;
  if jsonb_typeof(coalesce(p_assignments, 'null'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_declared, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid approval request';
  end if;
  if exists (select 1 from public.fin_approval_requests where rfq_id = p_rfq and status = 'pending') then raise exception 'approval pending'; end if;
  select p.current_version, v.terms into v_version, v_terms
    from public.fin_decision_sources p join public.fin_decision_source_versions v on v.proposal_id = p.id and v.version = p.current_version
   where p.id = p_proposal and p.rfq_id = p_rfq and p.buyer_organization_id = v_rfq.organization_id and p.status in ('submitted','revised','reviewed');
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

create or replace function public.fin_request_approval(
  p_rfq uuid, p_proposal uuid, p_approvers uuid[], p_rationale text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rfq public.fin_rfqs%rowtype; v_version integer; v_id uuid; v_actor uuid; v_position integer := 0; v_terms jsonb; v_eval jsonb;
begin
  select * into v_rfq from public.fin_rfqs where id = p_rfq for update;
  if not found then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_rfq.organization_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_rfq.status not in ('collecting','comparing') and not (v_rfq.status='open' and exists(select 1 from public.fin_external_proposals where id=p_proposal)) then raise exception 'invalid state'; end if;
  if coalesce(array_length(p_approvers,1),0) not between 1 and 5 or length(trim(coalesce(p_rationale,''))) not between 1 and 4000 then
    raise exception 'invalid approval request';
  end if;
  if exists(select 1 from public.fin_approval_requests where rfq_id = p_rfq and status = 'pending') then raise exception 'approval pending'; end if;
  select p.current_version,v.terms into v_version,v_terms
    from public.fin_decision_sources p join public.fin_decision_source_versions v on v.proposal_id=p.id and v.version=p.current_version
    where p.id=p_proposal and p.rfq_id=p_rfq and p.buyer_organization_id=v_rfq.organization_id and p.status in ('submitted','revised','reviewed');
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
  if v_request.external_proposal_id is not null then
    perform public.fin_external_lock_source(v_request.external_proposal_id,v_request.proposal_version,v_request.external_rfq_revision,array['admin','finance_manager','analyst','viewer']);
  end if;
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
  select current_version into v_version from public.fin_decision_sources where id = coalesce(v_request.proposal_id,v_request.external_proposal_id) and status in ('submitted','revised','reviewed');
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

create or replace function public.fin_record_decision(
  p_rfq uuid, p_proposal uuid, p_criteria jsonb default '{}'::jsonb, p_rationale text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_snapshot jsonb; v_id uuid; v_version integer; v_approval public.fin_approval_requests%rowtype; v_updated timestamptz;
  v_eval jsonb; v_final integer; v_actors uuid[];
begin
  select organization_id,status,updated_at into v_org,v_status,v_updated from public.fin_rfqs where id=p_rfq for update;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_status not in ('collecting','comparing') and not (v_status='open' and exists(select 1 from public.fin_external_proposals where id=p_proposal)) then raise exception 'invalid state'; end if;
  if jsonb_typeof(coalesce(p_criteria,'null'::jsonb)) is distinct from 'object' then raise exception 'invalid criteria'; end if;
  if exists(select 1 from public.fin_decisions where rfq_id=p_rfq) then raise exception 'decision already recorded'; end if;
  select current_version into v_version from public.fin_decision_sources
    where id=p_proposal and rfq_id=p_rfq and buyer_organization_id=v_org and status in ('submitted','revised','reviewed');
  if v_version is null then raise exception 'proposal not eligible'; end if;
  select * into v_approval from public.fin_approval_requests where rfq_id=p_rfq order by requested_at desc,id desc limit 1;
  if v_approval.id is null then
    -- Sem pedido: a exigência é a da policy vigente agora (inclui a política v1).
    v_eval := public.fin_policy_evaluate(p_rfq, p_proposal, '{}'::jsonb);
    if coalesce((v_eval->>'approval_required')::boolean, false) then raise exception 'approval required or stale'; end if;
    if coalesce((v_eval->'requirements'->>'justification')::boolean, false) and length(trim(coalesce(p_rationale,''))) < 10 then
      raise exception 'policy justification required';
    end if;
  elsif v_approval.status <> 'approved' or coalesce(v_approval.proposal_id,v_approval.external_proposal_id) <> p_proposal
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
      'proposal_id',case when p.source_kind='institution_authenticated' then p.id end,'external_proposal_id',case when p.source_kind='buyer_recorded_external' then p.id end,'origin',p.source_kind,'provider_id',p.provider_id,'status',p.status,'version',p.current_version,
      'terms',v.terms,'submitted_at',v.submitted_at) order by p.created_at),'[]'::jsonb)) into v_snapshot
    from public.fin_decision_sources p left join public.fin_decision_source_versions v on v.proposal_id=p.id and v.version=p.current_version
    where p.rfq_id=p_rfq and p.buyer_organization_id=v_org and p.current_version>0;
  insert into public.fin_decisions(organization_id,rfq_id,proposal_id,decided_by,criteria,rationale,snapshot)
    values(v_org,p_rfq,p_proposal,auth.uid(),coalesce(p_criteria,'{}'::jsonb),p_rationale,v_snapshot) returning id into v_id;
  update public.fin_rfqs set status='decided',updated_at=now() where id=p_rfq;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(v_org,'rfq',p_rfq,'decision_recorded',auth.uid(),jsonb_build_object('decided_version',v_version,'approval_request_id',v_approval.id,
      'policy_rules', jsonb_array_length(coalesce(v_eval->'matched','[]'::jsonb))));
  return v_id;
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
  select current_version into v_version from public.fin_decision_sources
    where id = p_proposal and rfq_id = p_rfq and buyer_organization_id = v_org;
  if v_version is null then raise exception 'proposal not eligible'; end if;
  if v_version <> p_expected_version then raise exception 'proposal version changed'; end if;
  return public.fin_record_decision(p_rfq, p_proposal, p_criteria, p_rationale);
end $$;

create or replace function public.fin_approval_snapshot_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.proposal_id,new.external_proposal_id,new.external_rfq_revision,new.external_request_key,new.external_request_hash,new.proposal_version,new.snapshot,new.rfq_id,new.organization_id,new.requested_by) is distinct from (old.proposal_id,old.external_proposal_id,old.external_rfq_revision,old.external_request_key,old.external_request_hash,old.proposal_version,old.snapshot,old.rfq_id,old.organization_id,old.requested_by) then raise exception 'immutable record'; end if;
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
 (p.state='reviewed' and q.reviewed_by is not null and v.rfq_revision=r.revision and r.status in ('open','collecting','comparing') and (v.document_id is null or (d.id is not null and d.removed_at is null and f.status='available'))) as decision_allowed,'version_metadata_unverified'::text as document_hash_source,
 case when v.document_id is null then 'not_presented' when d.id is not null and d.removed_at is null and f.status='available' then 'metadata_available' else 'unavailable' end as document_state
 from public.fin_external_proposals p
 join public.fin_external_proposal_versions v on v.proposal_id=p.id and v.version=p.current_version
 join public.fin_rfqs r on r.id=p.rfq_id
 join public.fin_providers b on b.id=p.provider_id and b.organization_id=p.organization_id
 left join public.fin_external_proposal_reviews q on q.proposal_id=p.id and q.version=p.current_version and q.action='confirm'
 left join public.fin_private_documents d on d.id=v.document_id
 left join public.fin_document_versions f on f.document_id=v.document_id and f.version=v.document_version;

create or replace function public.fin_external_preview(p_id uuid,p_expected integer,p_revision integer,p_declared jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e jsonb;
begin
 e:=public.fin_external_lock_source(p_id,p_expected,p_revision,array['admin','finance_manager']);
 return public.fin_policy_evaluate((e->>'rfq_id')::uuid,p_id,p_declared);
end $$;
revoke all on function public.fin_external_preview(uuid,integer,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fin_external_preview(uuid,integer,integer,jsonb) to authenticated;
create or replace function public.fin_external_contract_identity_guard()
returns trigger language plpgsql set search_path='' as $$ begin
 if old.external_proposal_id is not null and
 (new.external_proposal_id,new.external_proposal_version,new.external_request_key,new.external_request_hash,new.decision_id,new.organization_id,new.provider_id,new.product,new.legal_entity_id)
 is distinct from (old.external_proposal_id,old.external_proposal_version,old.external_request_key,old.external_request_hash,old.decision_id,old.organization_id,old.provider_id,old.product,old.legal_entity_id) then raise exception 'immutable external contract source'; end if;
 return new;
end $$;
revoke all on function public.fin_external_contract_identity_guard() from public,anon,authenticated,service_role;
drop trigger if exists fin_external_contract_identity on public.fin_contracts;
create trigger fin_external_contract_identity before update on public.fin_contracts for each row execute function public.fin_external_contract_identity_guard();

create or replace function public.fin_register_contract(
  p_decision uuid, p_starts date, p_ends date, p_notice integer default 60,
  p_cost text default null, p_conditions text default null, p_reference text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_dec public.fin_decisions%rowtype; v_provider uuid; v_product text; v_id uuid; v_review date;
begin
  select * into v_dec from public.fin_decisions where id = p_decision for update;
  if not found then raise exception 'decision not found'; end if;
  if v_dec.external_proposal_id is not null then raise exception 'external command required'; end if;
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
insert into public.fin_settings (key, value) values ('schema_version', 'financial-external-decision-1') on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;

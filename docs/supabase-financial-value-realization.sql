-- P1.1: customer-declared procurement value with immutable provenance.
-- No interest projection, accounting entry, FX conversion or automatic decision.
begin;
create table if not exists public.fin_value_methodologies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  method_key text not null default 'period_total_difference',
  version integer not null default 1 check (version > 0),
  definition jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,method_key,version)
);
create table if not exists public.fin_value_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  contract_id uuid not null,
  contract_version integer not null,
  legal_entity_id uuid,
  provider_id uuid not null,
  product text not null,
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('NEGOTIATED_SAVINGS','REALIZED_SAVINGS','COST_AVOIDANCE')),
  title text not null check (length(trim(title)) between 3 and 200 and title !~ '[<>]'),
  currency text not null check (currency in ('BRL','USD','EUR','GBP','CHF','JPY','CAD','AUD','CNY','MXN','ARS','CLP','COP','PEN')),
  period_start date not null, period_end date not null,
  baseline jsonb not null,
  target_amount numeric(20,2) not null check (target_amount between 0 and 1000000000000),
  target_snapshot jsonb not null,
  target_dimensions jsonb not null,
  comparability text not null check (comparability in ('comparable','incomplete','not_comparable')),
  value_amount numeric(20,2),
  methodology_id uuid not null,
  methodology_snapshot jsonb not null,
  evidence_reference text not null check (length(trim(evidence_reference)) between 3 and 200 and evidence_reference !~ '[<>]'),
  reason text not null check (length(trim(reason)) between 3 and 1000 and reason !~ '[<>]'),
  parent_id uuid,
  status text not null default 'active' check (status in ('active','invalidated')),
  invalidation_reason text, invalidated_by uuid references auth.users(id), invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,contract_id) references public.fin_contracts(organization_id,id),
  foreign key(contract_id,contract_version) references public.fin_contract_versions(contract_id,version),
  foreign key(organization_id,legal_entity_id) references public.fin_legal_entities(organization_id,id),
  foreign key(organization_id,provider_id) references public.fin_providers(organization_id,id),
  foreign key(organization_id,methodology_id) references public.fin_value_methodologies(organization_id,id),
  foreign key(organization_id,parent_id) references public.fin_value_records(organization_id,id),
  check(period_end >= period_start and period_end - period_start <= 366*5),
  check ((kind = 'REALIZED_SAVINGS') = (parent_id is not null)),
  check ((comparability = 'comparable') = (value_amount is not null))
);
create unique index if not exists fin_value_realized_once on public.fin_value_records(parent_id) where kind='REALIZED_SAVINGS';
create index if not exists fin_value_period_scope on public.fin_value_records(organization_id,period_start,legal_entity_id,provider_id,id);
create table if not exists public.fin_value_observations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  record_id uuid not null, realized_record_id uuid not null unique,
  observed_amount numeric(20,2) not null check (observed_amount between 0 and 1000000000000),
  currency text not null, period_start date not null, period_end date not null,
  coverage text not null check (coverage='complete'),
  source text not null check(source in ('statement','invoice','import','manual')),
  evidence_reference text not null check(length(trim(evidence_reference)) between 3 and 200 and evidence_reference !~ '[<>]'),
  verification_reason text not null check(length(trim(verification_reason)) between 3 and 1000 and verification_reason !~ '[<>]'),
  verified_by uuid not null references auth.users(id), verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key(organization_id,record_id) references public.fin_value_records(organization_id,id),
  foreign key(organization_id,realized_record_id) references public.fin_value_records(organization_id,id)
);
alter table public.fin_value_methodologies enable row level security;
alter table public.fin_value_methodologies force row level security;
alter table public.fin_value_records enable row level security;
alter table public.fin_value_records force row level security;
alter table public.fin_value_observations enable row level security;
alter table public.fin_value_observations force row level security;
revoke all on public.fin_value_methodologies, public.fin_value_records, public.fin_value_observations from public, anon, authenticated;
grant select on public.fin_value_methodologies, public.fin_value_records, public.fin_value_observations to authenticated;
grant all on public.fin_value_methodologies, public.fin_value_records, public.fin_value_observations to service_role;
drop policy if exists fin_value_method_read on public.fin_value_methodologies;
create policy fin_value_method_read on public.fin_value_methodologies for select to authenticated using (
  public.fin_has_role(organization_id,array['admin','finance_manager','analyst','viewer'])
  and exists(select 1 from public.fin_organizations o where o.id=organization_id and o.kind='BUYER'));
drop policy if exists fin_value_record_read on public.fin_value_records;
create policy fin_value_record_read on public.fin_value_records for select to authenticated using (
  public.fin_entity_allows(organization_id,legal_entity_id,array['admin','finance_manager','analyst','viewer'])
  and exists(select 1 from public.fin_contracts c where c.id=fin_value_records.contract_id and c.organization_id=fin_value_records.organization_id));
drop policy if exists fin_value_observation_read on public.fin_value_observations;
create policy fin_value_observation_read on public.fin_value_observations for select to authenticated using (
  exists(select 1 from public.fin_value_records r where r.organization_id=fin_value_observations.organization_id and r.id=record_id));

create or replace function public.fin_value_record_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if (to_jsonb(new)-array['status','invalidation_reason','invalidated_by','invalidated_at'])
      is distinct from (to_jsonb(old)-array['status','invalidation_reason','invalidated_by','invalidated_at'])
     or old.status<>'active' or new.status<>'invalidated'
     or length(trim(coalesce(new.invalidation_reason,''))) not between 3 and 1000
     or new.invalidation_reason ~ '[<>]' or new.invalidated_by is null or new.invalidated_at is null then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
drop trigger if exists fin_value_method_immutable on public.fin_value_methodologies;
create trigger fin_value_method_immutable before update or delete on public.fin_value_methodologies for each row execute function public.fin_immutable_row();
drop trigger if exists fin_value_observation_immutable on public.fin_value_observations;
create trigger fin_value_observation_immutable before update or delete on public.fin_value_observations for each row execute function public.fin_immutable_row();
drop trigger if exists fin_value_record_immutable on public.fin_value_records;
create trigger fin_value_record_immutable before update on public.fin_value_records for each row execute function public.fin_value_record_guard();
drop trigger if exists fin_value_record_delete on public.fin_value_records;
create trigger fin_value_record_delete before delete on public.fin_value_records for each row execute function public.fin_immutable_row();
revoke all on function public.fin_value_record_guard() from public,anon,authenticated;

create or replace function public.fin_record_value(p_org uuid,p_contract uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype; cv public.fin_contract_versions%rowtype; m public.fin_value_methodologies%rowtype;
  b jsonb; ds jsonb; v_id uuid; v_start date; v_end date; v_base numeric; v_target numeric; v_method text; v_definition jsonb;
begin
  select * into c from public.fin_contracts where organization_id=p_org and id=p_contract for share;
  if c.id is null or auth.uid() is null or not public.fin_entity_allows(p_org,c.legal_entity_id,array['admin','finance_manager'])
     or not exists(select 1 from public.fin_organizations where id=p_org and kind='BUYER') then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  if p_input->>'kind' is null or p_input->>'kind' not in ('NEGOTIATED_SAVINGS','COST_AVOIDANCE') then raise exception 'invalid value kind'; end if;
  b:=p_input->'baseline'; ds:=p_input->'target_dimensions';
  v_start:=(p_input->>'period_start')::date; v_end:=(p_input->>'period_end')::date;
  v_base:=(b->>'amount')::numeric; v_target:=(p_input->>'target_amount')::numeric;
  if b is null or jsonb_typeof(b)<>'object' or b->>'source' is null or b->>'source' not in ('contract','proposal','approved_budget','manual','import')
     or length(trim(coalesce(b->>'reference',''))) not between 3 and 200
     or b->>'as_of' is null or (b->>'as_of')::date>v_start
     or b->>'currency' is distinct from p_input->>'currency' or b->>'unit' is distinct from 'period_total'
     or (b->>'period_start')::date is distinct from v_start or (b->>'period_end')::date is distinct from v_end
     or v_base is null or v_base<0 or v_base>1000000000000 or v_base::text='NaN' or v_base<>round(v_base,2)
     or v_target is null or v_target<0 or v_target>1000000000000 or v_target::text='NaN' or v_target<>round(v_target,2)
     or exists(select 1 from jsonb_object_keys(b) k where k not in ('source','reference','as_of','amount','currency','unit','period_start','period_end','dimensions'))
     or length(b::text)>6000 or b::text ~ '[<>]' then raise exception 'invalid value baseline'; end if;
  if jsonb_typeof(b->'dimensions') is distinct from 'object' or jsonb_typeof(ds) is distinct from 'object'
     or length(ds::text)>4000 or ds::text ~ '[<>]'
     or exists(select 1 from jsonb_object_keys(ds) k where k not in ('service','unit','volume','indexer','term_months','amortization','fees','guarantee','grace_months'))
     or exists(select 1 from jsonb_object_keys(b->'dimensions') k where k not in ('service','unit','volume','indexer','term_months','amortization','fees','guarantee','grace_months')) then raise exception 'invalid value dimensions'; end if;
  if p_input->>'comparability'='comparable' and
    (not (b->'dimensions' ?& array['service','unit','volume','indexer','term_months','amortization','fees','guarantee','grace_months'])
      or b->'dimensions' is distinct from ds
      or exists(select 1 from jsonb_each(ds) d where d.value='null'::jsonb or d.value='""'::jsonb)) then raise exception 'value not comparable'; end if;
  if c.currency is not null and c.currency is distinct from p_input->>'currency' then raise exception 'value currency mismatch'; end if;
  select * into cv from public.fin_contract_versions where contract_id=c.id and organization_id=p_org order by version desc limit 1;
  if cv.contract_id is null then raise exception 'value target version unavailable'; end if;
  v_method:=case when p_input->>'kind'='COST_AVOIDANCE' then 'counterfactual_period_total_avoidance' else 'period_total_difference' end;
  v_definition:=jsonb_build_object('formula',case when p_input->>'kind'='COST_AVOIDANCE' then 'counterfactual_period_total - target_period_total' else 'baseline_period_total - target_period_total' end,
    'version',1,'unit','period_total','rounding','2 decimal places',
    'verification',case when p_input->>'kind'='COST_AVOIDANCE' then 'Customer declared counterfactual expense avoided; not cash saved or observed realization' else 'Human declared total costs and equal economic dimensions; no spread projection' end);
  insert into public.fin_value_methodologies(organization_id,method_key,definition,created_by) values(p_org,v_method,v_definition,auth.uid())
    on conflict(organization_id,method_key,version) do nothing;
  select * into m from public.fin_value_methodologies where organization_id=p_org and method_key=v_method and version=1;
  insert into public.fin_value_records(organization_id,contract_id,contract_version,legal_entity_id,provider_id,product,owner_id,kind,title,currency,period_start,period_end,baseline,target_amount,target_snapshot,target_dimensions,comparability,value_amount,methodology_id,methodology_snapshot,evidence_reference,reason)
  values(p_org,c.id,cv.version,c.legal_entity_id,c.provider_id,c.product,auth.uid(),p_input->>'kind',p_input->>'title',p_input->>'currency',v_start,v_end,b,v_target,
    jsonb_build_object('contract_id',c.id,'version',cv.version,'terms',cv.terms,'effective_from',cv.effective_from),ds,p_input->>'comparability',
    case when p_input->>'comparability'='comparable' then round(v_base-v_target,2) end,m.id,m.definition,p_input->>'evidence_reference',p_input->>'reason') returning id into v_id;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
    values(p_org,'contract',c.id,'value_recorded',auth.uid(),jsonb_build_object('record_id',v_id,'kind',p_input->>'kind','methodology_version',m.version));
  return v_id;
end $$;
revoke all on function public.fin_record_value(uuid,uuid,jsonb) from public,anon;
grant execute on function public.fin_record_value(uuid,uuid,jsonb) to authenticated;

create or replace function public.fin_observe_value(p_record uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.fin_value_records%rowtype; v_id uuid:=gen_random_uuid(); v_amount numeric; m public.fin_value_methodologies%rowtype;
begin
  select * into r from public.fin_value_records where id=p_record for update;
  if r.id is null or auth.uid() is null or not public.fin_entity_allows(r.organization_id,r.legal_entity_id,array['admin','finance_manager'])
     or not exists(select 1 from public.fin_contracts c where c.id=r.contract_id and c.organization_id=r.organization_id and public.fin_entity_allows(c.organization_id,c.legal_entity_id,array['admin','finance_manager'])) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(r.organization_id) then raise exception 'organization offboarding'; end if;
  if r.kind<>'NEGOTIATED_SAVINGS' or r.status<>'active' or r.comparability<>'comparable' then raise exception 'value not realizable'; end if;
  if exists(select 1 from public.fin_value_records where parent_id=r.id) then raise exception 'value already realized'; end if;
  v_amount:=(p_input->>'observed_amount')::numeric;
  if v_amount is null or v_amount<0 or v_amount>1000000000000 or v_amount::text='NaN' or v_amount<>round(v_amount,2)
    or p_input->>'currency' is distinct from r.currency or p_input->>'coverage' is distinct from 'complete'
    or (p_input->>'period_start')::date is distinct from r.period_start or (p_input->>'period_end')::date is distinct from r.period_end
    or r.period_end>=current_date or r.period_start<=(r.baseline->>'as_of')::date
    or p_input->'verified' is distinct from 'true'::jsonb then raise exception 'value observation incomplete'; end if;
  insert into public.fin_value_methodologies(organization_id,method_key,definition,created_by)
    values(r.organization_id,'observed_period_total_difference',
      '{"formula":"baseline_period_total - observed_period_total","version":1,"unit":"period_total","rounding":"2 decimal places","verification":"Human verified evidence for complete closed period; negotiated amount is not realized amount"}',auth.uid())
    on conflict(organization_id,method_key,version) do nothing;
  select * into m from public.fin_value_methodologies where organization_id=r.organization_id and method_key='observed_period_total_difference' and version=1;
  insert into public.fin_value_records(id,organization_id,contract_id,contract_version,legal_entity_id,provider_id,product,owner_id,kind,title,currency,period_start,period_end,baseline,target_amount,target_snapshot,target_dimensions,comparability,value_amount,methodology_id,methodology_snapshot,evidence_reference,reason,parent_id)
  values(v_id,r.organization_id,r.contract_id,r.contract_version,r.legal_entity_id,r.provider_id,r.product,auth.uid(),'REALIZED_SAVINGS',r.title,r.currency,r.period_start,r.period_end,r.baseline,v_amount,r.target_snapshot,r.target_dimensions,'comparable',round((r.baseline->>'amount')::numeric-v_amount,2),m.id,m.definition,p_input->>'evidence_reference',p_input->>'verification_reason',r.id);
  insert into public.fin_value_observations(organization_id,record_id,realized_record_id,observed_amount,currency,period_start,period_end,coverage,source,evidence_reference,verification_reason,verified_by)
  values(r.organization_id,r.id,v_id,v_amount,r.currency,r.period_start,r.period_end,'complete',p_input->>'source',p_input->>'evidence_reference',p_input->>'verification_reason',auth.uid());
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
  values(r.organization_id,'contract',r.contract_id,'value_realized',auth.uid(),jsonb_build_object('record_id',v_id,'parent_id',r.id,'coverage','complete'));
  return v_id;
end $$;
revoke all on function public.fin_observe_value(uuid,jsonb) from public,anon;
grant execute on function public.fin_observe_value(uuid,jsonb) to authenticated;

create or replace function public.fin_invalidate_value(p_record uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.fin_value_records%rowtype;
begin
  select * into r from public.fin_value_records where id=p_record for update;
  if r.id is null or auth.uid() is null or not public.fin_entity_allows(r.organization_id,r.legal_entity_id,array['admin','finance_manager'])
     or not exists(select 1 from public.fin_contracts c where c.id=r.contract_id and c.organization_id=r.organization_id and public.fin_entity_allows(c.organization_id,c.legal_entity_id,array['admin','finance_manager'])) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(r.organization_id) then raise exception 'organization offboarding'; end if;
  update public.fin_value_records set status='invalidated',invalidation_reason=p_input->>'reason',invalidated_by=auth.uid(),invalidated_at=now() where id=p_record or (parent_id=p_record and status='active');
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
  values(r.organization_id,'contract',r.contract_id,'value_invalidated',auth.uid(),jsonb_build_object('record_id',r.id));
  return r.id;
end $$;
revoke all on function public.fin_invalidate_value(uuid,jsonb) from public,anon;
grant execute on function public.fin_invalidate_value(uuid,jsonb) to authenticated;

-- List and totals share exactly the same authorized, bounded date filters.
create or replace function public.fin_list_value(p_org uuid,p_start date,p_end date,p_kind text default null,p_currency text default null,p_entity uuid default null,p_provider uuid default null,p_after uuid default null,p_limit integer default 25,p_product text default null)
returns setof public.fin_value_records language plpgsql stable security invoker set search_path='' as $$
begin
  if p_org is null or auth.uid() is null or not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366*5 or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid value filters'; end if;
  if p_product is not null and p_product not in ('credit','acquiring') then raise exception 'invalid value filters'; end if;
  return query select r.* from public.fin_value_records r where r.organization_id=p_org and r.period_start>=p_start and r.period_end<=p_end
   and (p_kind is null or r.kind=p_kind) and (p_currency is null or r.currency=p_currency) and (p_entity is null or r.legal_entity_id=p_entity)
   and (p_product is null or r.product=p_product) and (p_provider is null or r.provider_id=p_provider) and (p_after is null or r.id>p_after) order by r.id limit p_limit+1;
end $$;
revoke all on function public.fin_list_value(uuid,date,date,text,text,uuid,uuid,uuid,integer,text) from public,anon;
grant execute on function public.fin_list_value(uuid,date,date,text,text,uuid,uuid,uuid,integer,text) to authenticated;
create or replace function public.fin_value_totals(p_org uuid,p_start date,p_end date,p_kind text default null,p_currency text default null,p_entity uuid default null,p_provider uuid default null,p_product text default null)
returns table(kind text,currency text,records bigint,comparable bigint,value_amount numeric) language plpgsql stable security invoker set search_path='' as $$
begin
  if p_org is null or auth.uid() is null or not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366*5 then raise exception 'invalid value filters'; end if;
  if p_product is not null and p_product not in ('credit','acquiring') then raise exception 'invalid value filters'; end if;
  return query select r.kind,r.currency,count(*),count(r.value_amount),sum(r.value_amount) from public.fin_value_records r
   where r.organization_id=p_org and r.status='active' and r.period_start>=p_start and r.period_end<=p_end
   and (p_kind is null or r.kind=p_kind) and (p_currency is null or r.currency=p_currency) and (p_entity is null or r.legal_entity_id=p_entity)
   and (p_product is null or r.product=p_product) and (p_provider is null or r.provider_id=p_provider) group by r.kind,r.currency;
end $$;
revoke all on function public.fin_value_totals(uuid,date,date,text,text,uuid,uuid,text) from public,anon;
grant execute on function public.fin_value_totals(uuid,date,date,text,text,uuid,uuid,text) to authenticated;

create or replace function public.fin_governance_export_datasets()
returns table(dataset text, query text) language sql immutable set search_path = '' as $$
  values
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
    ('value_observations', 'select * from public.fin_value_observations where organization_id = $1');
$$;
revoke all on function public.fin_governance_export_datasets() from public, anon, authenticated;


create or replace view public.fin_graph_objects with (security_invoker=true) as
select n.* from (
select o.id as organization_id, 'organization'::text as object_type, (o.id)::text as object_id, (o.legal_name)::text as title, null::text as status, null::uuid as legal_entity_id, null::uuid as provider_id, null::uuid as rfq_id, null::uuid as contract_id, null::uuid as facility_id, null::uuid as owner_id, null::date as due_on, '{}'::jsonb as facts from public.fin_organizations o
union all
select e.organization_id as organization_id, 'entity'::text as object_type, (e.id)::text as object_id, (e.legal_name)::text as title, e.status as status, e.id as legal_entity_id, null::uuid as provider_id, null::uuid as rfq_id, null::uuid as contract_id, null::uuid as facility_id, null::uuid as owner_id, null::date as due_on, jsonb_build_object('kind',e.kind,'currency',e.currency) as facts from public.fin_legal_entities e
union all
select p.organization_id as organization_id, 'provider'::text as object_type, (p.id)::text as object_id, (p.name)::text as title, p.status as status, null::uuid as legal_entity_id, p.id as provider_id, null::uuid as rfq_id, null::uuid as contract_id, null::uuid as facility_id, null::uuid as owner_id, null::date as due_on, jsonb_build_object('kind',p.kind,'verification_state',p.verification_state) as facts from public.fin_providers p
union all
select x.organization_id as organization_id, 'relationship'::text as object_type, (x.id)::text as object_id, (coalesce(p.name,'Relacionamento'))::text as title, x.status as status, e.id as legal_entity_id, p.id as provider_id, null::uuid as rfq_id, null::uuid as contract_id, null::uuid as facility_id, x.owner_id as owner_id, null::date as due_on, jsonb_build_object('entity',e.legal_name,'categories',x.categories,'since_on',x.since_on) as facts from public.fin_provider_relationships x join public.fin_legal_entities e on e.organization_id=x.organization_id and e.id=x.legal_entity_id join public.fin_providers p on p.organization_id=x.organization_id and p.id=x.provider_id
union all
select r.organization_id as organization_id, 'rfq'::text as object_type, (r.id)::text as object_id, (r.title)::text as title, r.status as status, r.legal_entity_id as legal_entity_id, null::uuid as provider_id, r.id as rfq_id, null::uuid as contract_id, null::uuid as facility_id, r.owner_id as owner_id, r.response_deadline as due_on, jsonb_build_object('product',r.product) as facts from public.fin_rfqs r
union all
select r.organization_id as organization_id, 'proposal'::text as object_type, (x.id)::text as object_id, (coalesce(p.name,'Proposta'))::text as title, x.status as status, r.legal_entity_id as legal_entity_id, p.id as provider_id, r.id as rfq_id, null::uuid as contract_id, null::uuid as facility_id, null::uuid as owner_id, null::date as due_on, jsonb_build_object('version',x.current_version,'product',x.product) as facts from public.fin_proposals x join public.fin_rfqs r on r.organization_id=x.buyer_organization_id and r.id=x.rfq_id left join public.fin_providers p on p.organization_id=r.organization_id and p.id=x.provider_id
union all
select d.organization_id as organization_id, 'decision'::text as object_type, (d.id)::text as object_id, ('Decisão — '||r.title)::text as title, null::text as status, r.legal_entity_id as legal_entity_id, p.id as provider_id, r.id as rfq_id, null::uuid as contract_id, null::uuid as facility_id, d.decided_by as owner_id, null::date as due_on, jsonb_build_object('decided_at',d.decided_at,'proposal_id',x.id) as facts from public.fin_decisions d join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id left join public.fin_proposals x on x.buyer_organization_id=d.organization_id and x.id=d.proposal_id left join public.fin_providers p on p.organization_id=d.organization_id and p.id=x.provider_id
union all
select c.organization_id as organization_id, 'contract'::text as object_type, (c.id)::text as object_id, (coalesce(c.title,p.name,'Contrato'))::text as title, c.status as status, c.legal_entity_id as legal_entity_id, p.id as provider_id, r.id as rfq_id, c.id as contract_id, null::uuid as facility_id, c.owner_id as owner_id, c.ends_on as due_on, jsonb_build_object('origin',c.origin,'decision_id',d.id,'rfq',r.title,'currency',c.currency) as facts from public.fin_contracts c left join public.fin_providers p on p.organization_id=c.organization_id and p.id=c.provider_id left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id
union all
select f.organization_id as organization_id, 'facility'::text as object_type, (f.id)::text as object_id, (f.name)::text as title, f.status as status, f.legal_entity_id as legal_entity_id, p.id as provider_id, r.id as rfq_id, c.id as contract_id, f.id as facility_id, f.owner_id as owner_id, f.maturity_on as due_on, jsonb_build_object('kind',f.kind,'currency',f.currency,'approved_limit',f.approved_limit,'source',f.source,'verified_at',f.verified_at) as facts from public.fin_facilities f left join public.fin_providers p on p.organization_id=f.organization_id and p.id=f.provider_id left join public.fin_contracts c on c.organization_id=f.organization_id and c.id=f.contract_id left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id
union all
select f.organization_id as organization_id, 'limit'::text as object_type, (f.id)::text as object_id, (f.name)::text as title, f.status as status, f.legal_entity_id as legal_entity_id, p.id as provider_id, r.id as rfq_id, c.id as contract_id, f.id as facility_id, f.owner_id as owner_id, f.maturity_on as due_on, jsonb_build_object('kind',f.kind,'currency',f.currency,'approved_limit',f.approved_limit,'source',f.source,'verified_at',f.verified_at) as facts from public.fin_facilities f left join public.fin_providers p on p.organization_id=f.organization_id and p.id=f.provider_id left join public.fin_contracts c on c.organization_id=f.organization_id and c.id=f.contract_id left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id where f.approved_limit is not null
union all
select g.organization_id as organization_id, 'guarantee'::text as object_type, (g.id)::text as object_id, (g.description)::text as title, g.status as status, g.legal_entity_id as legal_entity_id, p.id as provider_id, r.id as rfq_id, c.id as contract_id, f.id as facility_id, null::uuid as owner_id, g.ends_on as due_on, jsonb_build_object('kind',g.kind,'currency',g.currency,'committed_amount',g.committed_amount,'source',g.source) as facts from public.fin_guarantees g left join public.fin_facilities f on f.organization_id=g.organization_id and f.id=g.facility_id left join public.fin_contracts c on c.organization_id=g.organization_id and c.id=coalesce(g.contract_id,f.contract_id) left join public.fin_providers p on p.organization_id=g.organization_id and p.id=coalesce(g.provider_id,f.provider_id,c.provider_id) left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id
union all
select s.organization_id as organization_id, 'passport_snapshot'::text as object_type, (s.id)::text as object_id, (s.field_key||' — '||r.title)::text as title, null::text as status, r.legal_entity_id as legal_entity_id, null::uuid as provider_id, r.id as rfq_id, null::uuid as contract_id, null::uuid as facility_id, s.profile_updated_by as owner_id, null::date as due_on, jsonb_build_object('value',s.field_value,'source',s.source,'original_scope',s.original_scope,'source_legal_entity_id',s.source_legal_entity_id,'vintage',s.vintage,'verified_at',s.verified_at,'captured_at',s.captured_at) as facts from public.fin_rfq_profile_snapshots s join public.fin_rfqs r on r.organization_id=s.organization_id and r.id=s.rfq_id
union all
select m.organization_id as organization_id, 'milestone'::text as object_type, (m.id)::text as object_id, (m.title)::text as title, m.status as status, c.legal_entity_id as legal_entity_id, p.id as provider_id, r.id as rfq_id, c.id as contract_id, null::uuid as facility_id, m.owner_id as owner_id, m.due_on as due_on, jsonb_build_object('kind',m.kind,'recurrence',m.recurrence) as facts from public.fin_contract_milestones m join public.fin_contracts c on c.organization_id=m.organization_id and c.id=m.contract_id left join public.fin_providers p on p.organization_id=c.organization_id and p.id=c.provider_id left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id where m.kind<>'obligation'
union all
select m.organization_id as organization_id, 'obligation'::text as object_type, (m.id)::text as object_id, (m.title)::text as title, m.status as status, c.legal_entity_id as legal_entity_id, p.id as provider_id, r.id as rfq_id, c.id as contract_id, null::uuid as facility_id, m.owner_id as owner_id, m.due_on as due_on, jsonb_build_object('kind',m.kind,'recurrence',m.recurrence) as facts from public.fin_contract_milestones m join public.fin_contracts c on c.organization_id=m.organization_id and c.id=m.contract_id left join public.fin_providers p on p.organization_id=c.organization_id and p.id=c.provider_id left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id where m.kind='obligation'
union all
select s.organization_id as organization_id, 'obligation'::text as object_type, (s.facility_id::text||':'||s.schedule_version::text||':'||s.due_on::text)::text as object_id, ('Amortização — '||f.name)::text as title, null::text as status, f.legal_entity_id as legal_entity_id, p.id as provider_id, r.id as rfq_id, c.id as contract_id, f.id as facility_id, s.recorded_by as owner_id, s.due_on as due_on, jsonb_build_object('source','fin_facility_repayments','schedule_version',s.schedule_version,'principal_amount',s.principal_amount,'currency',f.currency) as facts from public.fin_facility_repayments s join public.fin_facilities f on f.organization_id=s.organization_id and f.id=s.facility_id left join public.fin_providers p on p.organization_id=f.organization_id and p.id=f.provider_id left join public.fin_contracts c on c.organization_id=f.organization_id and c.id=f.contract_id left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id where s.schedule_version=f.schedule_version
union all
select x.organization_id as organization_id, 'document'::text as object_type, (x.id)::text as object_id, (x.title)::text as title, null::text as status, case when x.entity_type='profile' then case when x.entity_id=x.organization_id then null else x.entity_id end else coalesce(c.legal_entity_id,r.legal_entity_id) end as legal_entity_id, p.id as provider_id, r.id as rfq_id, c.id as contract_id, null::uuid as facility_id, x.created_by as owner_id, null::date as due_on, jsonb_build_object('entity_type',x.entity_type,'version',x.current_version,'visibility',x.visibility) as facts from public.fin_private_documents x left join public.fin_contracts c on x.entity_type='contract' and c.organization_id=x.organization_id and c.id=x.entity_id left join public.fin_rfqs r on r.organization_id=x.buyer_organization_id and r.id=x.rfq_id left join public.fin_providers p on p.organization_id=c.organization_id and p.id=c.provider_id where x.removed_at is null
union all
select v.organization_id,'value_realization'::text,v.id::text,v.title::text,v.status,v.legal_entity_id,p.id,r.id,c.id,null::uuid,v.owner_id,v.period_end,
 jsonb_build_object('kind',v.kind,'currency',v.currency,'comparability',v.comparability,'value_amount',v.value_amount,'baseline_source',v.baseline->>'source','methodology',v.methodology_snapshot,'contract_version',v.contract_version)
 from public.fin_value_records v join public.fin_contracts c on c.organization_id=v.organization_id and c.id=v.contract_id
 left join public.fin_providers p on p.organization_id=c.organization_id and p.id=c.provider_id
 left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id
 left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id
) n where exists(select 1 from public.fin_organizations o where o.id=n.organization_id and o.kind='BUYER')
 and public.fin_has_role(n.organization_id,array['admin','finance_manager','analyst','viewer']);
revoke all on public.fin_graph_objects from public,anon,authenticated;
grant select on public.fin_graph_objects to authenticated;
create or replace view public.fin_financial_graph with (security_invoker=true) as
select * from public.fin_graph_objects
union
select n.organization_id,'owner'::text,m.user_id::text,coalesce(m.display_name,'Responsável')::text,null::text,n.legal_entity_id,n.provider_id,n.rfq_id,n.contract_id,n.facility_id,m.user_id,null::date,jsonb_build_object('source','fin_members')
from public.fin_graph_objects n join public.fin_members m on m.organization_id=n.organization_id and m.user_id=n.owner_id;
revoke all on public.fin_financial_graph from public,anon,authenticated;
grant select on public.fin_financial_graph to authenticated;
create or replace function public.fin_query_graph(p_org uuid,p_root_type text,p_root uuid,p_kind text default null,p_entity uuid default null,p_status text default null,p_query text default null,p_due_before date default null,p_limit integer default 20,p_offset integer default 0)
returns setof public.fin_financial_graph language plpgsql stable security invoker set search_path='' as $$ begin
 if not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
 if p_root_type is null or p_root is null or p_org is null or p_root_type not in ('organization','entity','provider','rfq','contract','facility')
 or p_kind is not null and p_kind not in ('organization','entity','provider','relationship','rfq','proposal','decision','contract','facility','limit','guarantee','passport_snapshot','milestone','obligation','document','owner','value_realization')
 or p_limit is null or p_offset is null or p_limit not between 1 and 50 or p_offset not between 0 and 5000
 or p_query is not null and length(trim(p_query)) not between 2 and 100 then raise exception 'invalid graph query'; end if;
 if not exists(select 1 from public.fin_financial_graph n where n.organization_id=p_org and n.object_type=p_root_type and n.object_id=p_root::text) then raise exception 'graph root unavailable'; end if;
 if p_entity is not null and not public.fin_entity_visible(p_org,p_entity) then raise exception 'graph root unavailable'; end if;
 return query select n.* from public.fin_financial_graph n where n.organization_id=p_org
 and case p_root_type when 'organization' then n.organization_id=p_root when 'entity' then n.legal_entity_id=p_root when 'provider' then n.provider_id=p_root when 'rfq' then n.rfq_id=p_root when 'contract' then n.contract_id=p_root when 'facility' then n.facility_id=p_root end
 and (p_kind is null or n.object_type=p_kind) and (p_entity is null or n.legal_entity_id=p_entity)
 and (p_status is null or n.status=p_status) and (p_query is null or position(lower(trim(p_query)) in lower(n.title))>0)
 and (p_due_before is null or n.due_on between current_date and p_due_before)
 order by n.object_type,n.object_id,n.legal_entity_id nulls first,n.provider_id nulls first,n.rfq_id nulls first,n.contract_id nulls first,n.facility_id nulls first,n.owner_id nulls first limit p_limit + 1 offset p_offset;
end $$;
revoke all on function public.fin_query_graph(uuid,text,uuid,text,uuid,text,text,date,integer,integer) from public,anon;
grant execute on function public.fin_query_graph(uuid,text,uuid,text,uuid,text,text,date,integer,integer) to authenticated;

insert into public.fin_settings(key,value) values ('schema_version', 'financial-value-realization-1') on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

-- SI-01: currency-separated evidence ledger. A difference is never savings.
begin;
create table if not exists public.fin_spend_records (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,contract_id uuid not null,legal_entity_id uuid,provider_id uuid not null,product text not null,
 period_start date not null,period_end date not null,currency text not null check(currency in ('BRL','USD','EUR','GBP','CHF','JPY','CAD','AUD','CNY','MXN','ARS','CLP','COP','PEN')),
 value_kind text not null check(value_kind in ('contracted','observed','estimated')),amount numeric(20,2) not null check(amount between 0 and 1e12),
 source_type text not null check(source_type in ('declared','imported')),source_reference text not null check(length(trim(source_reference)) between 3 and 200 and source_reference !~ '[<>]'),
 source_line text not null check(length(trim(source_line)) between 1 and 200 and source_line !~ '[<>]'),
 provenance text not null check(length(trim(provenance)) between 10 and 2000 and provenance !~ '[<>]'),
 source_key text not null,revision integer not null check(revision>0),supersedes_id uuid unique,correction_reason text,
 recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,source_key,revision),foreign key(organization_id,contract_id) references public.fin_contracts(organization_id,id),
 foreign key(organization_id,supersedes_id) references public.fin_spend_records(organization_id,id),
 check(period_end>=period_start and period_end-period_start<=366),check(supersedes_id is null or (correction_reason is not null and length(trim(correction_reason)) between 10 and 2000 and correction_reason !~ '[<>]'))
);
create table if not exists public.fin_spend_reconciliations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,record_id uuid not null unique,
 status text not null check(status in ('confirmed','rejected')),no_duplicate_confirmed boolean not null check(no_duplicate_confirmed),
 reason text not null check(length(trim(reason)) between 10 and 2000 and reason !~ '[<>]'),reviewed_by uuid not null references auth.users(id),reviewed_at timestamptz not null default now(),
 foreign key(organization_id,record_id) references public.fin_spend_records(organization_id,id)
);
create index if not exists fin_spend_scope on public.fin_spend_records(organization_id,legal_entity_id,provider_id,period_start,id);
do $$ declare t text;begin
 foreach t in array array['fin_spend_records','fin_spend_reconciliations'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);
 execute format('drop policy if exists spend_read on public.%I',t);
 if t='fin_spend_records' then execute 'create policy spend_read on public.fin_spend_records for select to authenticated using(public.fin_entity_allows(organization_id,legal_entity_id,array[''admin'',''finance_manager'',''analyst'',''viewer'']) and exists(select 1 from public.fin_organizations o where o.id=organization_id and o.kind=''BUYER''))';
 else execute 'create policy spend_read on public.fin_spend_reconciliations for select to authenticated using(exists(select 1 from public.fin_spend_records r where r.organization_id=fin_spend_reconciliations.organization_id and r.id=record_id))';end if;
 execute format('drop trigger if exists spend_immutable on public.%I',t);execute format('create trigger spend_immutable before update or delete on public.%I for each row execute function public.fin_immutable_row()',t);
 end loop;
end $$;
create or replace function public.fin_record_spend(p_contract uuid,p_expected uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype;last public.fin_spend_records%rowtype;v_key text;v_id uuid;begin
 select * into c from public.fin_contracts where id=p_contract for update;
 if auth.uid() is null or c.id is null or not public.fin_entity_allows(c.organization_id,c.legal_entity_id,array['admin','finance_manager','analyst']) or not exists(select 1 from public.fin_organizations where id=c.organization_id and kind='BUYER') then raise exception 'forbidden';end if;
 if public.fin_governance_org_locked(c.organization_id) then raise exception 'organization offboarding';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('period_start','period_end','currency','value_kind','amount','source_type','source_reference','source_line','provenance','correction_reason')) then raise exception 'invalid spend input';end if;
 if (p_input->>'amount')::numeric<>round((p_input->>'amount')::numeric,2) then raise exception 'invalid spend precision';end if;
 -- Stable reference/line identity prevents changed dates or kinds from silently creating another copy.
 v_key:=md5(lower(trim(p_input->>'source_reference'))||':'||lower(trim(p_input->>'source_line')));
 perform pg_advisory_xact_lock(hashtextextended(c.organization_id::text||':spend:'||v_key,0));
 select * into last from public.fin_spend_records where organization_id=c.organization_id and source_key=v_key order by revision desc limit 1;
 if last.id is not null and last.contract_id<>c.id then raise exception 'spend duplicate source';end if;
 if last.id is distinct from p_expected then raise exception 'spend conflict';end if;
 if exists(select 1 from public.fin_fee_observations o where o.organization_id=c.organization_id and lower(trim(o.source_reference))=lower(trim(p_input->>'source_reference'))) then raise exception 'spend duplicate fee source';end if;
 insert into public.fin_spend_records(organization_id,contract_id,legal_entity_id,provider_id,product,period_start,period_end,currency,value_kind,amount,source_type,source_reference,source_line,provenance,source_key,revision,supersedes_id,correction_reason,recorded_by)
 values(c.organization_id,c.id,c.legal_entity_id,c.provider_id,c.product,(p_input->>'period_start')::date,(p_input->>'period_end')::date,p_input->>'currency',p_input->>'value_kind',(p_input->>'amount')::numeric,p_input->>'source_type',trim(p_input->>'source_reference'),trim(p_input->>'source_line'),trim(p_input->>'provenance'),v_key,coalesce(last.revision,0)+1,last.id,trim(p_input->>'correction_reason'),auth.uid()) returning id into v_id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(c.organization_id,'contract',c.id,'spend_recorded',auth.uid(),c.legal_entity_id,jsonb_build_object('record_id',v_id,'revision',coalesce(last.revision,0)+1));return v_id;
end $$;
revoke all on function public.fin_record_spend(uuid,uuid,jsonb) from public,anon;grant execute on function public.fin_record_spend(uuid,uuid,jsonb) to authenticated;
create or replace function public.fin_reconcile_spend(p_record uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.fin_spend_records%rowtype;v_id uuid;begin
 select * into r from public.fin_spend_records where id=p_record for update;
 if auth.uid() is null or r.id is null or not public.fin_entity_allows(r.organization_id,r.legal_entity_id,array['admin','finance_manager']) then raise exception 'forbidden';end if;
 if public.fin_governance_org_locked(r.organization_id) then raise exception 'organization offboarding';end if;
 if r.recorded_by=auth.uid() then raise exception 'spend independent review required';end if;
 if exists(select 1 from public.fin_spend_records where supersedes_id=r.id) or exists(select 1 from public.fin_spend_reconciliations where record_id=r.id) then raise exception 'spend conflict';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('status','reason','no_duplicate_confirmed')) or p_input->>'no_duplicate_confirmed' is distinct from 'true' then raise exception 'spend duplicate confirmation required';end if;
 insert into public.fin_spend_reconciliations(organization_id,record_id,status,no_duplicate_confirmed,reason,reviewed_by) values(r.organization_id,r.id,p_input->>'status',true,trim(p_input->>'reason'),auth.uid()) returning id into v_id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(r.organization_id,'contract',r.contract_id,'spend_reconciled',auth.uid(),r.legal_entity_id,jsonb_build_object('record_id',r.id,'reconciliation_id',v_id));return v_id;
end $$;
revoke all on function public.fin_reconcile_spend(uuid,jsonb) from public,anon;grant execute on function public.fin_reconcile_spend(uuid,jsonb) to authenticated;
create or replace view public.fin_spend_monitor with(security_invoker=true) as
select r.id,r.organization_id,r.contract_id,r.legal_entity_id,r.provider_id,r.product,r.period_start,r.period_end,r.currency,
 case when x.status='confirmed' and r.value_kind='observed' then 'verified' else r.value_kind end as value_kind,r.amount::text as amount,r.source_type,r.source_reference,r.source_line,r.provenance,r.revision,r.supersedes_id,r.recorded_by,r.recorded_at,
 coalesce(x.status,'unreviewed') as reconciliation_status,(x.status='confirmed' and not exists(select 1 from public.fin_fee_observations f where f.organization_id=r.organization_id and lower(trim(f.source_reference))=lower(trim(r.source_reference)))) as included,'fin_spend_records'::text as source_table,r.id as source_id,'recorded amount; no currency conversion'::text as formula
from public.fin_spend_records r left join public.fin_spend_reconciliations x on x.record_id=r.id where not exists(select 1 from public.fin_spend_records n where n.supersedes_id=r.id)
union all
select o.id,o.organization_id,o.contract_id,o.legal_entity_id,o.provider_id,c.product,o.period_start,o.period_end,o.currency,
 case when o.verification_status='verified' then 'verified' else 'observed' end,o.observed_amount::text,'fee_observation',o.source_reference,coalesce(o.source_object_id,o.id::text),o.evidence_reference,1,null::uuid,o.owner_id,o.ingested_at,
 o.verification_status,o.verification_status<>'rejected','fin_fee_observations',o.id,'observed fee amount; verification preserved' from public.fin_fee_observations o join public.fin_contracts c on c.id=o.contract_id
union all
select v.id,v.organization_id,v.contract_id,v.legal_entity_id,v.provider_id,c.product,v.period_start,v.period_end,v.currency,'contracted',v.contracted_amount::text,'fee_schedule',o.source_reference,v.id::text,o.evidence_reference,1,null::uuid,o.owner_id,o.ingested_at,
 o.verification_status,o.verification_status<>'rejected','fin_fee_variances',v.id,'contracted charge for observed cohort; not total contract spend' from public.fin_fee_variances v join public.fin_fee_observations o on o.id=v.observation_id join public.fin_contracts c on c.id=v.contract_id where v.comparison_status='comparable';
revoke all on public.fin_spend_monitor from public,anon;grant select on public.fin_spend_monitor to authenticated,service_role;
create or replace function public.fin_spend_summary(p_org uuid,p_start date,p_end date,p_entity uuid default null,p_provider uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$ begin
 if auth.uid() is null or not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) or p_entity is not null and not public.fin_entity_visible(p_org,p_entity) then raise exception 'forbidden';end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>1826 then raise exception 'invalid spend period';end if;
 return jsonb_build_object('source','fin_spend_monitor','observed_at',now(),'formula','sum included evidence, separated by currency/kind/entity/provider/product; no FX or savings','rows',(select coalesce(jsonb_agg(x),'[]') from(select currency,value_kind,legal_entity_id,provider_id,product,count(*) as records,count(*) filter(where included and period_start>=p_start and period_end<=p_end) as included_records,sum(amount::numeric) filter(where included and period_start>=p_start and period_end<=p_end)::text as amount,count(*) filter(where period_start<p_start or period_end>p_end) as outside_complete_period from public.fin_spend_monitor where organization_id=p_org and period_end>=p_start and period_start<=p_end and (p_entity is null or legal_entity_id=p_entity) and (p_provider is null or provider_id=p_provider) group by currency,value_kind,legal_entity_id,provider_id,product)x));
end $$;
revoke all on function public.fin_spend_summary(uuid,date,date,uuid,uuid) from public,anon;grant execute on function public.fin_spend_summary(uuid,date,date,uuid,uuid) to authenticated;
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
create or replace function public.fin_search(p_org uuid,p_query text,p_kind text default null,p_limit integer default 12,p_offset integer default 0)
returns table(kind text,id uuid,title text,detail text,href text)
language plpgsql stable security definer set search_path = '' as $$
declare v_query text;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
 v_query:=lower(trim(coalesce(p_query,'')));
 if length(v_query) not between 2 and 100 or p_limit not between 1 and 30 or p_offset not between 0 and 1000
 or (p_kind is not null and p_kind not in ('rfq','proposal','provider','contract','task','implementation','covenant','performance','spend')) then
  raise exception 'invalid search'; end if;
 return query
 select x.kind,x.id,x.title,x.detail,x.href from (
  select 'rfq'::text kind,r.id,r.title::text,coalesce(r.status,'')::text detail,
    ('/finance/rfq.html?id='||r.id)::text href, 1 priority,r.created_at sorted_at
  from public.fin_rfqs r where r.organization_id=p_org and (p_kind is null or p_kind='rfq')
    and public.fin_entity_visible(p_org, r.legal_entity_id)
    and (position(v_query in lower(r.title))>0 or position(v_query in lower(r.id::text))>0)
  union all
  select 'proposal'::text,p.id,coalesce(v.name,'Proposta')::text,r.title::text,
    ('/finance/rfq.html?id='||r.id)::text,2,p.updated_at
  from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id and r.organization_id=p_org
   left join public.fin_providers v on v.id=p.provider_id and v.organization_id=p_org
  where p.buyer_organization_id=p_org and (p_kind is null or p_kind='proposal')
   and public.fin_entity_visible(p_org, r.legal_entity_id)
   and (position(v_query in lower(coalesce(v.name,'')))>0 or position(v_query in lower(r.title))>0 or position(v_query in lower(p.id::text))>0)
  union all
  select 'provider'::text,v.id,v.name::text,coalesce(v.region,'')::text,
    '/finance/providers.html'::text,3,v.created_at
  from public.fin_providers v where v.organization_id=p_org and (p_kind is null or p_kind='provider')
   and (position(v_query in lower(v.name))>0 or position(v_query in lower(v.id::text))>0)
  union all
  select 'contract'::text,c.id,coalesce(v.name,'Contrato')::text,c.ends_on::text,
    '/finance/contracts.html'::text,4,c.created_at
  from public.fin_contracts c left join public.fin_providers v on v.id=c.provider_id and v.organization_id=p_org
  where c.organization_id=p_org and (p_kind is null or p_kind='contract')
   and public.fin_entity_visible(p_org, c.legal_entity_id)
   and (position(v_query in lower(coalesce(v.name,'')))>0 or position(v_query in lower(c.id::text))>0)
  union all
  select 'task'::text,t.id,t.title::text,coalesce(t.due_on::text,'')::text,
    '/finance/dashboard.html'::text,5,t.created_at
  from public.fin_tasks t where t.organization_id=p_org and (p_kind is null or p_kind='task')
   and (public.fin_entity_visible(p_org, t.legal_entity_id) or (t.related_type is null and t.created_by = auth.uid()))
   and (position(v_query in lower(t.title))>0 or position(v_query in lower(t.id::text))>0)
 union all
 select 'implementation'::text,p.id,p.title::text,p.status::text,('/finance/implementations.html?id='||p.id)::text,6,p.created_at
 from public.fin_implementation_plans p where p.organization_id=p_org and (p_kind is null or p_kind='implementation') and public.fin_entity_visible(p_org,p.legal_entity_id) and (position(v_query in lower(p.title))>0 or position(v_query in lower(p.id::text))>0)
 union all
 select 'covenant'::text,o.id,o.title::text,o.kind::text,('/finance/covenants.html?obligation_id='||o.id)::text,7,o.created_at from public.fin_obligations o where o.organization_id=p_org and (p_kind is null or p_kind='covenant') and public.fin_entity_visible(p_org,o.legal_entity_id) and (position(v_query in lower(o.title))>0 or position(v_query in lower(o.id::text))>0)
 union all
 select 'performance'::text,p.id,p.title::text,p.status::text,('/finance/performance.html?id='||p.id)::text,8,p.created_at from public.fin_provider_performance_periods p where p.organization_id=p_org and (p_kind is null or p_kind='performance') and public.fin_entity_visible(p_org,p.legal_entity_id) and (position(v_query in lower(p.title))>0 or position(v_query in lower(p.id::text))>0)
 union all
 select 'spend'::text,r.id,('Spend '||r.source_reference)::text,r.value_kind::text,('/finance/spend.html?id='||r.id)::text,9,r.recorded_at from public.fin_spend_monitor r where r.organization_id=p_org and (p_kind is null or p_kind='spend') and public.fin_entity_visible(p_org,r.legal_entity_id) and (position(v_query in lower(r.source_reference))>0 or position(v_query in lower(r.id::text))>0)
 ) x order by x.priority,x.sorted_at desc,x.id limit p_limit offset p_offset;
end $$;
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
union all
select s.organization_id,'fee_schedule'::text,s.id::text,(s.service)::text,null::text,c.legal_entity_id,p.id,r.id,c.id,null::uuid,s.owner_id,null::date,
 jsonb_build_object('category',s.category,'charging_unit',s.charging_unit,'current_version',s.current_version)
 from public.fin_fee_schedules s join public.fin_contracts c on c.organization_id=s.organization_id and c.id=s.contract_id
 left join public.fin_providers p on p.organization_id=c.organization_id and p.id=c.provider_id
 left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id
 left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id
union all
select x.organization_id,'fee_observation'::text,x.id::text,(x.service||' · '||x.period_start||' – '||x.period_end)::text,x.verification_status,c.legal_entity_id,p.id,r.id,c.id,null::uuid,x.owner_id,null::date,
 jsonb_build_object('source_type',x.source_type,'source_reference',x.source_reference,'currency',x.currency,'observed_amount',x.observed_amount,'period_start',x.period_start,'period_end',x.period_end)
 from public.fin_fee_observations x join public.fin_contracts c on c.organization_id=x.organization_id and c.id=x.contract_id
 left join public.fin_providers p on p.organization_id=c.organization_id and p.id=c.provider_id
 left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id
 left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id
union all
select v.organization_id,'fee_variance'::text,v.id::text,('Diferença de tarifa — '||v.service)::text,v.review_status,c.legal_entity_id,p.id,r.id,c.id,null::uuid,v.reviewer_id,null::date,
 jsonb_build_object('comparison_status',v.comparison_status,'direction',v.direction,'currency',v.currency,'contracted_amount',v.contracted_amount,'observed_amount',v.observed_amount,'variance_amount',v.variance_amount,'reasons',v.reasons,'observation_id',v.observation_id,'schedule_id',v.schedule_id,'schedule_version',v.schedule_version)
 from public.fin_fee_variances v join public.fin_contracts c on c.organization_id=v.organization_id and c.id=v.contract_id
 left join public.fin_providers p on p.organization_id=c.organization_id and p.id=c.provider_id
 left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id
 left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id
union all
select w.organization_id,'fee_review'::text,w.id::text,('Revisão de tarifa — '||v.service)::text,w.to_status,c.legal_entity_id,p.id,r.id,c.id,null::uuid,w.reviewer_id,null::date,
 jsonb_build_object('variance_id',w.variance_id,'from_status',w.from_status,'to_status',w.to_status,'reason_code',w.reason_code,'reviewed_at',w.reviewed_at)
 from public.fin_fee_reviews w join public.fin_fee_variances v on v.organization_id=w.organization_id and v.id=w.variance_id
 join public.fin_contracts c on c.organization_id=v.organization_id and c.id=v.contract_id
 left join public.fin_providers p on p.organization_id=c.organization_id and p.id=c.provider_id
 left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id
 left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id
union all
select x.organization_id,'opportunity'::text,x.id::text,('Oportunidade — '||x.opportunity_type)::text,x.status,x.legal_entity_id,x.provider_id,coalesce(q.id,r.id),c.id,f.id,x.reviewer_id,x.deadline,
 jsonb_build_object('type',x.opportunity_type,'possible_action',x.possible_action,'rule_version',x.rule_version,'source_object_type',x.source_object_type,'source_object_id',x.source_object_id)
 from public.fin_opportunities x
 left join public.fin_contracts c on c.organization_id=x.organization_id and c.id=case x.source_object_type when 'contract' then x.source_object_id
   when 'contract_milestone' then (select m.contract_id from public.fin_contract_milestones m where m.organization_id=x.organization_id and m.id=x.source_object_id)
   when 'fee_variance' then (select v.contract_id from public.fin_fee_variances v where v.organization_id=x.organization_id and v.id=x.source_object_id)
   when 'value_record' then (select w.contract_id from public.fin_value_records w where w.organization_id=x.organization_id and w.id=x.source_object_id) end
 left join public.fin_facilities f on x.source_object_type='facility' and f.organization_id=x.organization_id and f.id=x.source_object_id
 left join public.fin_rfqs q on x.source_object_type='rfq' and q.organization_id=x.organization_id and q.id=x.source_object_id
 left join public.fin_decisions d on d.organization_id=c.organization_id and d.id=c.decision_id
 left join public.fin_rfqs r on r.organization_id=d.organization_id and r.id=d.rfq_id
union all
select p.organization_id,'implementation'::text,p.id::text,p.title,p.status,p.legal_entity_id,p.provider_id,null::uuid,p.contract_id,null::uuid,p.owner_id,p.target_go_live,jsonb_build_object('source','fin_implementation_plans','template',p.template_version,'actual_go_live',p.actual_go_live,'updated_at',p.updated_at) from public.fin_implementation_plans p
union all
select x.organization_id,case when x.kind='financial_covenant' then 'covenant' else 'obligation' end,x.id::text,x.title,x.facts->>'status',x.legal_entity_id,x.provider_id,null::uuid,x.contract_id,null::uuid,x.owner_id,x.due_on,x.facts from public.fin_obligation_monitor x
union all
select p.organization_id,'performance'::text,p.id::text,p.title,p.status,p.legal_entity_id,p.provider_id,null::uuid,p.contract_id,null::uuid,p.owner_id,p.review_due_on,jsonb_build_object('source','fin_provider_performance_periods','period_start',p.period_start,'period_end',p.period_end,'version',p.version) from public.fin_provider_performance_periods p
union all
select r.organization_id,'spend'::text,r.id::text,('Spend '||r.source_reference)::text,r.reconciliation_status,r.legal_entity_id,r.provider_id,null::uuid,r.contract_id,null::uuid,r.recorded_by,r.period_end,jsonb_build_object('source',r.source_table,'source_id',r.source_id,'kind',r.value_kind,'currency',r.currency,'amount',r.amount,'included',r.included,'period_start',r.period_start,'period_end',r.period_end) from public.fin_spend_monitor r
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
 or p_kind is not null and p_kind not in ('organization','entity','provider','relationship','rfq','proposal','decision','contract','facility','limit','guarantee','passport_snapshot','milestone','obligation','document','owner','value_realization','fee_schedule','fee_observation','fee_variance','fee_review','opportunity','implementation','covenant','performance','spend')
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
insert into public.fin_settings(key,value) values('schema_version', 'financial-spend-intelligence-1') on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

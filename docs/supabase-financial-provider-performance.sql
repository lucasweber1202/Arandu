-- PP-01: customer-defined, source-linked measurements; no universal bank score.
begin;
create table if not exists public.fin_provider_performance_dimensions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.fin_organizations(id),
 dimension_key text not null check(dimension_key ~ '^[a-z][a-z0-9_]{2,60}$'), version integer not null check(version>0),
 title text not null check(length(trim(title)) between 3 and 200 and title !~ '[<>]'),
 metric text not null check(metric in ('implementation_timeliness','response_time','sla_adherence','proposal_completeness','issue_resolution','fee_accuracy','renewal_responsiveness','obligation_fulfillment','obligation_responsiveness','operational_incidents','service_availability')),
 unit text not null check(unit in ('percent','days','count')), methodology text not null check(length(trim(methodology)) between 10 and 2000 and methodology !~ '[<>]'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,dimension_key,version)
);
create table if not exists public.fin_provider_performance_periods (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, contract_id uuid not null,
 legal_entity_id uuid, provider_id uuid not null, product text not null, source_contract_version integer not null,
 title text not null check(length(trim(title)) between 3 and 200 and title !~ '[<>]'),
 period_start date not null, period_end date not null, review_due_on date not null,
 owner_id uuid not null references auth.users(id), status text not null default 'open' check(status in ('open','closed')),
 version integer not null default 1, previous_period_id uuid unique, task_id uuid references public.fin_tasks(id),
 closed_by uuid references auth.users(id), closed_at timestamptz, close_reason text check(close_reason is null or (length(trim(close_reason)) between 10 and 2000 and close_reason !~ '[<>]')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,contract_id) references public.fin_contracts(organization_id,id),
 foreign key(organization_id,legal_entity_id) references public.fin_legal_entities(organization_id,id),
 foreign key(organization_id,provider_id) references public.fin_providers(organization_id,id),
 foreign key(organization_id,previous_period_id) references public.fin_provider_performance_periods(organization_id,id),
 check(period_end>=period_start and period_end-period_start<=366 and review_due_on>=period_end),
 check((status='closed')=(closed_at is not null and closed_by is not null and close_reason is not null))
);
create unique index if not exists fin_performance_initial_period on public.fin_provider_performance_periods(contract_id,period_start,period_end) where previous_period_id is null;
create table if not exists public.fin_provider_performance_targets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, period_id uuid not null, dimension_id uuid not null,
 operator text check(operator in ('le','ge','eq')), threshold numeric check(threshold between 0 and 1e18),
 source_reference text not null check(length(trim(source_reference)) between 3 and 200 and source_reference !~ '[<>]'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(period_id,dimension_id), foreign key(organization_id,period_id) references public.fin_provider_performance_periods(organization_id,id),
 foreign key(organization_id,dimension_id) references public.fin_provider_performance_dimensions(organization_id,id),
 check((operator is null)=(threshold is null))
);
create table if not exists public.fin_provider_performance_observations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, period_id uuid not null, dimension_id uuid not null,
 revision integer not null check(revision>0), supersedes_id uuid unique, value numeric check(value between 0 and 1e18),
 availability text not null check(availability in ('measured','not_available')),
 source_type text not null check(source_type in ('declared','imported','internal')),
 source_reference text not null check(length(trim(source_reference)) between 3 and 200 and source_reference !~ '[<>]'),
 provenance text not null check(length(trim(provenance)) between 10 and 2000 and provenance !~ '[<>]'),
 formula_version text not null, source_facts jsonb not null default '{}',
 coverage_numerator integer not null check(coverage_numerator>=0), coverage_denominator integer not null check(coverage_denominator>=coverage_numerator),
 observed_on date not null, recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default clock_timestamp(),
 correction_reason text, unique(organization_id,id), unique(period_id,dimension_id,revision),
 foreign key(period_id,dimension_id) references public.fin_provider_performance_targets(period_id,dimension_id),
 foreign key(organization_id,period_id) references public.fin_provider_performance_periods(organization_id,id),
 foreign key(organization_id,supersedes_id) references public.fin_provider_performance_observations(organization_id,id),
 check((availability='measured')=(value is not null)), check(availability<>'measured' or coverage_numerator>0),
 check(supersedes_id is null or (correction_reason is not null and length(trim(correction_reason)) between 10 and 2000 and correction_reason !~ '[<>]'))
);
create table if not exists public.fin_provider_performance_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, period_id uuid not null, observation_id uuid not null unique,
 status text not null check(status in ('confirmed','rejected','not_available')),
 reason text not null check(length(trim(reason)) between 10 and 2000 and reason !~ '[<>]'),
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,period_id) references public.fin_provider_performance_periods(organization_id,id),
 foreign key(organization_id,observation_id) references public.fin_provider_performance_observations(organization_id,id)
);
create index if not exists fin_performance_scope on public.fin_provider_performance_periods(organization_id,legal_entity_id,provider_id,review_due_on,id);
create index if not exists fin_performance_latest on public.fin_provider_performance_observations(period_id,dimension_id,revision desc);
do $$ declare t text; predicate text; begin
 foreach t in array array['fin_provider_performance_dimensions','fin_provider_performance_periods','fin_provider_performance_targets','fin_provider_performance_observations','fin_provider_performance_reviews'] loop
 execute format('alter table public.%I enable row level security',t); execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t); execute format('grant select on public.%I to authenticated',t); execute format('grant all on public.%I to service_role',t);
 predicate:=case when t='fin_provider_performance_dimensions' then 'public.fin_has_role(organization_id,array[''admin'',''finance_manager'',''analyst'',''viewer'']) and exists(select 1 from public.fin_organizations o where o.id=organization_id and o.kind=''BUYER'')'
 when t='fin_provider_performance_periods' then 'public.fin_entity_allows(organization_id,legal_entity_id,array[''admin'',''finance_manager'',''analyst'',''viewer'']) and exists(select 1 from public.fin_organizations o where o.id=organization_id and o.kind=''BUYER'')'
 else format('exists(select 1 from public.fin_provider_performance_periods p where p.organization_id=%I.organization_id and p.id=%I.period_id)',t,t) end;
 execute format('drop policy if exists performance_read on public.%I',t); execute format('create policy performance_read on public.%I for select to authenticated using(%s)',t,predicate);
 execute format('drop trigger if exists performance_immutable on public.%I',t);
 execute format('create trigger performance_immutable before %s on public.%I for each row execute function public.fin_immutable_row()',case when t='fin_provider_performance_periods' then 'delete' else 'update or delete' end,t);
 end loop;
end $$;
create or replace function public.fin_performance_period_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if old.status='closed' or new.version<>old.version+1 or (to_jsonb(new)-array['version','status','closed_by','closed_at','close_reason']) is distinct from (to_jsonb(old)-array['version','status','closed_by','closed_at','close_reason']) then raise exception 'performance period immutable';end if;
 return new;
end $$;
revoke all on function public.fin_performance_period_guard() from public,anon,authenticated;
drop trigger if exists performance_period_guard on public.fin_provider_performance_periods;
create trigger performance_period_guard before update on public.fin_provider_performance_periods for each row execute function public.fin_performance_period_guard();
create or replace function public.fin_performance_require(p_period uuid,p_roles text[]) returns public.fin_provider_performance_periods language plpgsql security definer set search_path='' as $$
declare p public.fin_provider_performance_periods%rowtype; begin
 select * into p from public.fin_provider_performance_periods where id=p_period for update;
 if auth.uid() is null or p.id is null or not public.fin_entity_allows(p.organization_id,p.legal_entity_id,p_roles) or not exists(select 1 from public.fin_organizations where id=p.organization_id and kind='BUYER') then raise exception 'forbidden';end if;
 if public.fin_governance_org_locked(p.organization_id) then raise exception 'organization offboarding';end if;
 if p.status<>'open' then raise exception 'performance period closed';end if; return p;
end $$;
revoke all on function public.fin_performance_require(uuid,text[]) from public,anon,authenticated;
create or replace function public.fin_performance_dimension(p_org uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_version integer; begin
 if auth.uid() is null or not public.fin_has_role(p_org,array['admin']) or not exists(select 1 from public.fin_organizations where id=p_org and kind='BUYER') then raise exception 'forbidden';end if;
 if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('dimension_key','title','metric','unit','methodology')) then raise exception 'invalid performance input';end if;
 if (p_input->>'metric' in ('response_time','issue_resolution')) <> (p_input->>'unit'='days') or (p_input->>'metric'='operational_incidents') <> (p_input->>'unit'='count') then raise exception 'invalid performance unit';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':performance:'||(p_input->>'dimension_key'),0));
 select coalesce(max(version),0)+1 into v_version from public.fin_provider_performance_dimensions where organization_id=p_org and dimension_key=p_input->>'dimension_key';
 insert into public.fin_provider_performance_dimensions(organization_id,dimension_key,version,title,metric,unit,methodology,created_by)
 values(p_org,p_input->>'dimension_key',v_version,trim(p_input->>'title'),p_input->>'metric',p_input->>'unit',trim(p_input->>'methodology'),auth.uid()) returning id into v_id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata) values(p_org,'organization',p_org,'performance_dimension_versioned',auth.uid(),jsonb_build_object('dimension_id',v_id,'version',v_version));return v_id;
end $$;
revoke all on function public.fin_performance_dimension(uuid,jsonb) from public,anon;
grant execute on function public.fin_performance_dimension(uuid,jsonb) to authenticated;
create or replace function public.fin_open_performance_period(p_contract uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype;prev public.fin_provider_performance_periods%rowtype;v_id uuid;v_task uuid;v_owner uuid;x jsonb;d public.fin_provider_performance_dimensions%rowtype;begin
 select * into c from public.fin_contracts where id=p_contract for update;
 if auth.uid() is null or c.id is null or not public.fin_entity_allows(c.organization_id,c.legal_entity_id,array['admin','finance_manager']) or not exists(select 1 from public.fin_organizations where id=c.organization_id and kind='BUYER') then raise exception 'forbidden';end if;
 if public.fin_governance_org_locked(c.organization_id) then raise exception 'organization offboarding';end if;
 if c.status not in ('active','renewing') then raise exception 'performance contract inactive';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('title','period_start','period_end','review_due_on','owner_id','dimensions','previous_period_id')) or jsonb_typeof(p_input->'dimensions') is distinct from 'array' or jsonb_array_length(p_input->'dimensions') not between 1 and 20 then raise exception 'invalid performance input';end if;
 v_owner:=coalesce(nullif(p_input->>'owner_id','')::uuid,auth.uid());if not public.fin_implementation_owner_valid(c.organization_id,c.legal_entity_id,v_owner) then raise exception 'invalid performance owner';end if;
 if nullif(p_input->>'previous_period_id','') is not null then
 select * into prev from public.fin_provider_performance_periods where id=(p_input->>'previous_period_id')::uuid for update;
 if prev.id is null or prev.contract_id<>c.id or prev.status<>'closed' or prev.period_start<>(p_input->>'period_start')::date or prev.period_end<>(p_input->>'period_end')::date then raise exception 'invalid performance predecessor';end if;
 end if;
 insert into public.fin_tasks(organization_id,title,due_on,related_type,related_id,created_by) values(c.organization_id,left('Revisar performance: '||trim(p_input->>'title'),200),(p_input->>'review_due_on')::date,'contract',c.id,auth.uid()) returning id into v_task;
 insert into public.fin_provider_performance_periods(organization_id,contract_id,legal_entity_id,provider_id,product,source_contract_version,title,period_start,period_end,review_due_on,owner_id,previous_period_id,task_id,created_by)
 values(c.organization_id,c.id,c.legal_entity_id,c.provider_id,c.product,c.current_version,trim(p_input->>'title'),(p_input->>'period_start')::date,(p_input->>'period_end')::date,(p_input->>'review_due_on')::date,v_owner,prev.id,v_task,auth.uid()) returning id into v_id;
 for x in select value from jsonb_array_elements(p_input->'dimensions') loop
 if jsonb_typeof(x)<>'object' or exists(select 1 from jsonb_object_keys(x) k where k not in ('dimension_id','operator','threshold','source_reference')) then raise exception 'invalid performance target';end if;
 select * into d from public.fin_provider_performance_dimensions where id=(x->>'dimension_id')::uuid and organization_id=c.organization_id;
 if d.id is null or d.unit='percent' and (x->>'threshold')::numeric>100 then raise exception 'invalid performance target';end if;
 insert into public.fin_provider_performance_targets(organization_id,period_id,dimension_id,operator,threshold,source_reference,created_by) values(c.organization_id,v_id,d.id,nullif(x->>'operator',''),nullif(x->>'threshold','')::numeric,trim(x->>'source_reference'),auth.uid());
 end loop;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(c.organization_id,'contract',c.id,'performance_period_opened',auth.uid(),c.legal_entity_id,jsonb_build_object('period_id',v_id,'previous_period_id',prev.id));return v_id;
end $$;
revoke all on function public.fin_open_performance_period(uuid,jsonb) from public,anon;
grant execute on function public.fin_open_performance_period(uuid,jsonb) to authenticated;

-- Internal adapters query existing SoRs. Their result is evidence, never a rating.
create or replace function public.fin_performance_source(p_period uuid,p_dimension uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare p public.fin_provider_performance_periods%rowtype;d public.fin_provider_performance_dimensions%rowtype;n integer:=0;den integer:=0;v numeric;ids jsonb:='[]';src text;formula text;begin
 select * into p from public.fin_provider_performance_periods where id=p_period;
 if p.id is null then raise exception 'forbidden';end if;
 select x.* into d from public.fin_provider_performance_dimensions x join public.fin_provider_performance_targets t on t.dimension_id=x.id where t.period_id=p.id and x.id=p_dimension;
 if d.id is null then raise exception 'invalid performance dimension';end if;
 if d.metric='implementation_timeliness' then
 src:='fin_implementation_milestones';formula:='completed-by-due / milestones-due-in-period * 100';
 select count(*),count(*) filter(where m.status='completed' and m.completed_at::date<=m.due_on),jsonb_agg(m.id order by m.id) into den,n,ids from public.fin_implementation_milestones m join public.fin_implementation_plans q on q.id=m.plan_id where q.contract_id=p.contract_id and q.status<>'cancelled' and m.due_on between p.period_start and p.period_end;
 v:=case when den>0 then n::numeric/den*100 end;n:=den;
 elsif d.metric='issue_resolution' then
 src:='fin_provider_issues';formula:='mean elapsed days of resolved issues; cohort opened in period';
 select count(*),count(*) filter(where i.status='resolved'),avg(extract(epoch from (i.resolved_at-i.opened_on::timestamp))/86400) filter(where i.status='resolved'),jsonb_agg(i.id order by i.id) into den,n,v,ids from public.fin_provider_issues i where i.contract_id=p.contract_id and i.opened_on between p.period_start and p.period_end;
 elsif d.metric='fee_accuracy' then
 src:='fin_fee_variances';formula:='verified comparable observations with zero variance / verified comparable observations * 100';
 select count(*),count(*) filter(where o.verification_status='verified' and f.comparison_status='comparable'),100.0*count(*) filter(where o.verification_status='verified' and f.comparison_status='comparable' and f.variance_amount=0)/nullif(count(*) filter(where o.verification_status='verified' and f.comparison_status='comparable'),0),jsonb_agg(f.id order by f.id) into den,n,v,ids from public.fin_fee_variances f join public.fin_fee_observations o on o.id=f.observation_id where f.contract_id=p.contract_id and f.period_start>=p.period_start and f.period_end<=p.period_end;
 elsif d.metric='obligation_responsiveness' then
 src:='fin_obligation_periods';formula:='periods with delivery evidence recorded by due date / periods due * 100; delivery timing only';
 select count(*),count(*),100.0*count(*) filter(where exists(select 1 from public.fin_obligation_evidence e where e.period_id=q.id and e.recorded_at::date<=q.due_on))/nullif(count(*),0),jsonb_agg(q.id order by q.id) into den,n,v,ids from public.fin_obligation_periods q join public.fin_obligations o on o.id=q.obligation_id where o.contract_id=p.contract_id and o.kind<>'financial_covenant' and q.due_on between p.period_start and p.period_end;
 else src:='not_available';formula:='no defensible automatic source; explicit human measurement required';end if;
 if den>5000 then raise exception 'performance source coverage limit';end if;
 return jsonb_build_object('value',v::text,'availability',case when v is null then 'not_available' else 'measured' end,'source',src,'source_ids',coalesce(ids,'[]'),'formula',formula,'formula_version','internal-v1','coverage_numerator',n,'coverage_denominator',den,'observed_at',now(),'qualification_source','fin_provider_qualifications','qualification_records',(select count(*) from public.fin_provider_qualifications q where q.organization_id=p.organization_id and q.provider_id=p.provider_id and q.legal_entity_id is not distinct from p.legal_entity_id));
end $$;
revoke all on function public.fin_performance_source(uuid,uuid) from public,anon;
grant execute on function public.fin_performance_source(uuid,uuid) to authenticated;
create or replace function public.fin_measure_performance(p_period uuid,p_dimension uuid,p_expected uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.fin_provider_performance_periods%rowtype;d public.fin_provider_performance_dimensions%rowtype;last public.fin_provider_performance_observations%rowtype;f jsonb;v_id uuid;begin
 p:=public.fin_performance_require(p_period,array['admin','finance_manager','analyst']);
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('value','availability','source_type','source_reference','provenance','coverage_numerator','coverage_denominator','observed_on','correction_reason')) then raise exception 'invalid performance input';end if;
 select x.* into d from public.fin_provider_performance_dimensions x join public.fin_provider_performance_targets t on t.dimension_id=x.id where t.period_id=p.id and x.id=p_dimension;
 if d.id is null then raise exception 'invalid performance dimension';end if;
 select * into last from public.fin_provider_performance_observations where period_id=p.id and dimension_id=d.id order by revision desc limit 1;
 if last.id is distinct from p_expected then raise exception 'performance conflict';end if;
 if p_input->>'source_type'='internal' then f:=public.fin_performance_source(p.id,d.id);
 else f:=jsonb_build_object('value',p_input->>'value','availability',p_input->>'availability','formula_version','customer-methodology-v'||d.version,'coverage_numerator',p_input->>'coverage_numerator','coverage_denominator',p_input->>'coverage_denominator');end if;
 if d.unit='count' and (f->>'value')::numeric<>trunc((f->>'value')::numeric) or d.unit='percent' and (f->>'value')::numeric>100 or (p_input->>'observed_on')::date not between p.period_start and least(p.period_end,current_date) then raise exception 'invalid performance value';end if;
 insert into public.fin_provider_performance_observations(organization_id,period_id,dimension_id,revision,supersedes_id,value,availability,source_type,source_reference,provenance,formula_version,source_facts,coverage_numerator,coverage_denominator,observed_on,recorded_by,correction_reason)
 values(p.organization_id,p.id,d.id,coalesce(last.revision,0)+1,last.id,nullif(f->>'value','')::numeric,f->>'availability',p_input->>'source_type',trim(p_input->>'source_reference'),trim(p_input->>'provenance'),f->>'formula_version',case when p_input->>'source_type'='internal' then f else jsonb_build_object('methodology',d.methodology,'dimension_version',d.version) end,(f->>'coverage_numerator')::integer,(f->>'coverage_denominator')::integer,(p_input->>'observed_on')::date,auth.uid(),trim(p_input->>'correction_reason')) returning id into v_id;
 update public.fin_provider_performance_periods set version=version+1 where id=p.id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(p.organization_id,'contract',p.contract_id,'performance_measured',auth.uid(),p.legal_entity_id,jsonb_build_object('period_id',p.id,'observation_id',v_id,'revision',coalesce(last.revision,0)+1));return v_id;
end $$;
revoke all on function public.fin_measure_performance(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.fin_measure_performance(uuid,uuid,uuid,jsonb) to authenticated;
create or replace function public.fin_review_performance(p_observation uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.fin_provider_performance_observations%rowtype;p public.fin_provider_performance_periods%rowtype;v_id uuid;begin
 select * into o from public.fin_provider_performance_observations where id=p_observation;
 p:=public.fin_performance_require(o.period_id,array['admin','finance_manager']);
 if o.recorded_by=auth.uid() then raise exception 'performance independent review required';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('status','reason')) then raise exception 'invalid performance review';end if;
 if exists(select 1 from public.fin_provider_performance_observations where period_id=p.id and dimension_id=o.dimension_id and revision>o.revision) or exists(select 1 from public.fin_provider_performance_reviews where observation_id=o.id) then raise exception 'performance conflict';end if;
 if (p_input->>'status'='not_available')<>(o.availability='not_available') and p_input->>'status'<>'rejected' then raise exception 'invalid performance review';end if;
 insert into public.fin_provider_performance_reviews(organization_id,period_id,observation_id,status,reason,reviewed_by) values(p.organization_id,p.id,o.id,p_input->>'status',trim(p_input->>'reason'),auth.uid()) returning id into v_id;
 update public.fin_provider_performance_periods set version=version+1 where id=p.id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(p.organization_id,'contract',p.contract_id,'performance_reviewed',auth.uid(),p.legal_entity_id,jsonb_build_object('period_id',p.id,'review_id',v_id,'status',p_input->>'status'));return v_id;
end $$;
revoke all on function public.fin_review_performance(uuid,jsonb) from public,anon;
grant execute on function public.fin_review_performance(uuid,jsonb) to authenticated;
create or replace function public.fin_close_performance(p_period uuid,p_expected integer,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.fin_provider_performance_periods%rowtype;begin
 p:=public.fin_performance_require(p_period,array['admin','finance_manager']);
 if p_expected is null or p.version<>p_expected then raise exception 'performance conflict';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or p_input->>'confirm' is distinct from 'true' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('confirm','reason')) or length(trim(p_input->>'reason')) not between 10 and 2000 or p_input->>'reason' is null then raise exception 'performance confirmation required';end if;
 if current_date<p.period_end or exists(select 1 from public.fin_provider_performance_targets t left join lateral(select x.* from public.fin_provider_performance_observations x where x.period_id=t.period_id and x.dimension_id=t.dimension_id order by revision desc limit 1)o on true left join public.fin_provider_performance_reviews r on r.observation_id=o.id where t.period_id=p.id and (r.status is null or r.status='rejected')) then raise exception 'performance review incomplete';end if;
 update public.fin_provider_performance_periods set status='closed',closed_by=auth.uid(),closed_at=now(),close_reason=trim(p_input->>'reason'),version=version+1 where id=p.id;
 update public.fin_tasks set status='done' where id=p.task_id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(p.organization_id,'contract',p.contract_id,'performance_period_closed',auth.uid(),p.legal_entity_id,jsonb_build_object('period_id',p.id));return p.id;
end $$;
revoke all on function public.fin_close_performance(uuid,integer,jsonb) from public,anon;
grant execute on function public.fin_close_performance(uuid,integer,jsonb) to authenticated;
create or replace view public.fin_provider_performance_monitor with(security_invoker=true) as
select p.id as period_id,p.organization_id,p.legal_entity_id,p.provider_id,p.contract_id,p.product,p.period_start,p.period_end,p.review_due_on,p.owner_id,p.status,p.version,p.title,
 d.id as dimension_id,d.title as dimension_title,d.metric,d.unit,d.methodology,d.version as dimension_version,
 t.operator,t.threshold::text as threshold,t.source_reference as target_source,
 o.id as observation_id,o.revision,o.value::text as actual,o.availability,o.source_type,o.source_reference,o.provenance,o.formula_version,o.source_facts,o.coverage_numerator,o.coverage_denominator,o.observed_on,o.recorded_at,o.recorded_by,
 r.status as verification_status,r.id as review_id,r.reviewed_by,r.reviewed_at,
 case when r.status='confirmed' and t.threshold is not null then case t.operator when 'le' then o.value<=t.threshold when 'ge' then o.value>=t.threshold when 'eq' then o.value=t.threshold end end as target_met
from public.fin_provider_performance_periods p join public.fin_provider_performance_targets t on t.period_id=p.id join public.fin_provider_performance_dimensions d on d.id=t.dimension_id
left join lateral(select x.* from public.fin_provider_performance_observations x where x.period_id=p.id and x.dimension_id=d.id order by revision desc limit 1)o on true
left join public.fin_provider_performance_reviews r on r.observation_id=o.id;
revoke all on public.fin_provider_performance_monitor from public,anon;
grant select on public.fin_provider_performance_monitor to authenticated,service_role;
create or replace function public.fin_performance_summary(p_org uuid,p_entity uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) or p_entity is not null and not public.fin_entity_visible(p_org,p_entity) then raise exception 'forbidden';end if;
 return jsonb_build_object('observed_at',now(),'source','fin_provider_performance_monitor','period','current registered periods','rows',(select coalesce(jsonb_agg(x),'[]') from(select status,count(*) as periods,count(*) filter(where review_due_on<current_date and status='open') as overdue from public.fin_provider_performance_periods where organization_id=p_org and (p_entity is null or legal_entity_id=p_entity) group by status)x),'coverage',(select jsonb_build_object('registered',count(*),'confirmed',count(*) filter(where verification_status='confirmed'),'not_available',count(*) filter(where verification_status='not_available')) from public.fin_provider_performance_monitor where organization_id=p_org and (p_entity is null or legal_entity_id=p_entity)));
end $$;
revoke all on function public.fin_performance_summary(uuid,uuid) from public,anon;
grant execute on function public.fin_performance_summary(uuid,uuid) to authenticated;
create or replace function public.fin_run_performance(p_day date default current_date) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if auth.uid() is not null then raise exception 'forbidden';end if;
 if p_day is null or abs(p_day-current_date)>31 then raise exception 'invalid performance day';end if;
 insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
 select organization_id,owner_id,'task_assigned','contract',contract_id,id,'Revisão de performance pendente','Consulte período, fontes, cobertura e revisão humana.' from public.fin_provider_performance_periods where status='open' and review_due_on<=p_day and not public.fin_governance_org_locked(organization_id) and public.fin_implementation_owner_valid(organization_id,legal_entity_id,owner_id)
 on conflict(user_id,event_type,event_id) do nothing;get diagnostics n=row_count;return n;
end $$;
revoke all on function public.fin_run_performance(date) from public,anon,authenticated;
grant execute on function public.fin_run_performance(date) to service_role;
-- Shared projections, governed export and the leased job follow below.

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
    ('performance_reviews', 'select * from public.fin_provider_performance_reviews where organization_id = $1');
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
 or (p_kind is not null and p_kind not in ('rfq','proposal','provider','contract','task','implementation','covenant','performance')) then
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
 or p_kind is not null and p_kind not in ('organization','entity','provider','relationship','rfq','proposal','decision','contract','facility','limit','guarantee','passport_snapshot','milestone','obligation','document','owner','value_realization','fee_schedule','fee_observation','fee_variance','fee_review','opportunity','implementation','covenant','performance')
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

create or replace function public.fin_run_contract_milestones(p_day date default current_date)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer; v_count integer; begin
 if auth.uid() is not null then raise exception 'forbidden'; end if;
 if p_day is null then raise exception 'invalid implementation input'; end if;
 n:=public.fin_process_contract_milestones(null,p_day);
 insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
 select p.organization_id,m.owner_id,'task_assigned','contract',p.contract_id,m.id,'Prazo de implantação','Um marco pendente atingiu o prazo. Consulte o contrato e a evidência.'
 from public.fin_implementation_milestones m join public.fin_implementation_plans p on p.id=m.plan_id
 where p.status not in ('accepted','cancelled') and m.status<>'completed' and m.due_on<=p_day
 and not public.fin_governance_org_locked(p.organization_id) and public.fin_implementation_owner_valid(p.organization_id,p.legal_entity_id,m.owner_id)
 on conflict(user_id,event_type,event_id) do nothing;
 get diagnostics v_count=row_count; return n+v_count+public.fin_run_obligations(p_day)+public.fin_run_performance(p_day);
end $$;
create or replace function public.fin_opportunity_rule_catalog()
returns table(rule_key text, required text[], optional text[], defaults jsonb, possible_action text, source_type text)
language sql immutable set search_path = '' as $$
  values
    ('contract_renewal', '{}'::text[], array['lead_days','cooldown_days'], '{"lead_days":30,"cooldown_days":30}'::jsonb, 'open_sourcing', 'contract'),
    ('repricing_window', '{}'::text[], array['cooldown_days'], '{"cooldown_days":30}'::jsonb, 'review_contract', 'contract_milestone'),
    ('facility_maturity', '{}'::text[], array['lead_days','cooldown_days'], '{"lead_days":120,"cooldown_days":30}'::jsonb, 'review_facility', 'facility'),
    ('guarantee_review', '{}'::text[], array['lead_days','cooldown_days'], '{"lead_days":60,"cooldown_days":30}'::jsonb, 'review_guarantee', 'guarantee'),
    ('passport_stale', '{}'::text[], array['lead_days','cooldown_days'], '{"lead_days":30,"cooldown_days":30}'::jsonb, 'update_passport', 'passport'),
    ('facility_data_stale', '{}'::text[], array['cooldown_days'], '{"cooldown_days":30}'::jsonb, 'review_facility', 'facility'),
    ('fee_variance_review', '{}'::text[], array['min_age_days','cooldown_days'], '{"min_age_days":0,"cooldown_days":30}'::jsonb, 'review_fee', 'fee_variance'),
    ('fee_resolution_value_review', '{}'::text[], array['cooldown_days'], '{"cooldown_days":30}'::jsonb, 'review_value', 'fee_variance'),
    ('value_realization_review', '{}'::text[], array['grace_days','cooldown_days'], '{"grace_days":30,"cooldown_days":30}'::jsonb, 'review_realization', 'value_record'),
    ('proposal_count_below', array['min_proposals'], array['cooldown_days'], '{"cooldown_days":30}'::jsonb, 'open_sourcing', 'rfq'),
    ('provider_concentration', array['max_share_pct'], array['cooldown_days'], '{"cooldown_days":30}'::jsonb, 'open_sourcing', 'provider'),
    ('facility_utilization', array['max_utilization_pct'], array['cooldown_days'], '{"cooldown_days":30}'::jsonb, 'review_facility', 'facility'),
    ('approval_exception_frequency', array['window_days','min_count'], array['cooldown_days'], '{"cooldown_days":30}'::jsonb, 'review_policy_exceptions', 'organization'),
    ('contract_without_sourcing', array['lookback_months'], array['cooldown_days'], '{"cooldown_days":30}'::jsonb, 'open_sourcing', 'contract'),
    ('implementation_overdue', '{}'::text[],array['cooldown_days'],'{"cooldown_days":30}'::jsonb,'review_contract','contract'),
    ('implementation_blocked', '{}'::text[],array['cooldown_days'],'{"cooldown_days":30}'::jsonb,'review_contract','contract'),
    ('covenant_due', '{}'::text[],array['cooldown_days','lead_days'],'{"cooldown_days":30,"lead_days":30}'::jsonb,'review_contract','contract'),
    ('covenant_awaiting_data', '{}'::text[],array['cooldown_days','lead_days'],'{"cooldown_days":30,"lead_days":30}'::jsonb,'review_contract','contract'),
    ('covenant_non_compliance', '{}'::text[],array['cooldown_days','lead_days'],'{"cooldown_days":30,"lead_days":30}'::jsonb,'review_contract','contract'),
    ('waiver_expiry', '{}'::text[],array['cooldown_days','lead_days'],'{"cooldown_days":30,"lead_days":30}'::jsonb,'review_contract','contract'),
    ('contractual_obligation_overdue', '{}'::text[],array['cooldown_days','lead_days'],'{"cooldown_days":30,"lead_days":30}'::jsonb,'review_contract','contract') ,
    ('performance_review_due', '{}'::text[],array['cooldown_days'],'{"cooldown_days":30}'::jsonb,'review_contract','contract'),
    ('performance_sla_issue', '{}'::text[],array['cooldown_days'],'{"cooldown_days":30}'::jsonb,'contact_provider','contract')
$$;
create or replace function public.fin_opportunity_candidates(p_org uuid, p_day date)
returns table(rule_id uuid, rule_key text, rule_version integer, parameters jsonb, legal_entity_id uuid, provider_id uuid, source_type text, source_id uuid,
  discriminator text, deadline date, facts jsonb, material jsonb)
language sql stable security definer set search_path = '' as $$
  with r as (
    select distinct on (x.rule_key) x.* from public.fin_opportunity_rules x
    where x.organization_id = p_org and x.effective_at <= now() order by x.rule_key, x.version desc
  ), live as (select * from r where enabled)
  -- Contract renewal: the contract's own notice window + customer lead days.
  select l.id, l.rule_key, l.version, l.parameters, c.legal_entity_id, c.provider_id, 'contract', c.id, '', (c.ends_on - c.renewal_notice_days),
    jsonb_build_object('contract_id', c.id, 'title', c.title, 'ends_on', c.ends_on, 'renewal_notice_days', c.renewal_notice_days, 'notice_date', c.ends_on - c.renewal_notice_days,
      'days_to_notice', (c.ends_on - c.renewal_notice_days) - p_day, 'days_to_end', c.ends_on - p_day, 'lead_days', (l.parameters->>'lead_days')::int, 'observed_at', p_day),
    jsonb_build_object('contract_id', c.id, 'ends_on', c.ends_on, 'renewal_notice_days', c.renewal_notice_days, 'lead_days', (l.parameters->>'lead_days')::int)
  from live l join public.fin_contracts c on c.organization_id = p_org
  where l.rule_key = 'contract_renewal' and c.status in ('active','renewing')
    and p_day between (c.ends_on - c.renewal_notice_days - (l.parameters->>'lead_days')::int) and (c.ends_on - c.renewal_notice_days)
  union all
  -- Repricing window: milestone due date and the milestone's own lead days.
  select l.id, l.rule_key, l.version, l.parameters, c.legal_entity_id, c.provider_id, 'contract_milestone', m.id, '', m.due_on,
    jsonb_build_object('milestone_id', m.id, 'contract_id', c.id, 'title', m.title, 'due_on', m.due_on, 'lead_days', m.lead_days, 'days_to_due', m.due_on - p_day, 'observed_at', p_day),
    jsonb_build_object('milestone_id', m.id, 'due_on', m.due_on, 'lead_days', m.lead_days)
  from live l join public.fin_contract_milestones m on m.organization_id = p_org join public.fin_contracts c on c.organization_id = m.organization_id and c.id = m.contract_id
  where l.rule_key = 'repricing_window' and m.kind = 'repricing' and m.status = 'scheduled' and p_day between m.due_on - m.lead_days and m.due_on
  union all
  select l.id, l.rule_key, l.version, l.parameters, f.legal_entity_id, f.provider_id, 'facility', f.id, '', f.maturity_on,
    jsonb_build_object('facility_id', f.id, 'name', f.name, 'maturity_on', f.maturity_on, 'days_to_maturity', f.maturity_on - p_day, 'lead_days', (l.parameters->>'lead_days')::int, 'observed_at', p_day),
    jsonb_build_object('facility_id', f.id, 'maturity_on', f.maturity_on, 'lead_days', (l.parameters->>'lead_days')::int)
  from live l join public.fin_facilities f on f.organization_id = p_org
  where l.rule_key = 'facility_maturity' and f.status = 'active' and f.maturity_on between p_day and p_day + (l.parameters->>'lead_days')::int
  union all
  select l.id, l.rule_key, l.version, l.parameters, g.legal_entity_id, coalesce(g.provider_id, f.provider_id), 'guarantee', g.id, '', g.ends_on,
    jsonb_build_object('guarantee_id', g.id, 'description', g.description, 'ends_on', g.ends_on, 'days_to_end', g.ends_on - p_day, 'lead_days', (l.parameters->>'lead_days')::int, 'observed_at', p_day),
    jsonb_build_object('guarantee_id', g.id, 'ends_on', g.ends_on, 'lead_days', (l.parameters->>'lead_days')::int)
  from live l join public.fin_guarantees g on g.organization_id = p_org left join public.fin_facilities f on f.organization_id = g.organization_id and f.id = g.facility_id
  where l.rule_key = 'guarantee_review' and g.status = 'active' and g.ends_on between p_day and p_day + (l.parameters->>'lead_days')::int
  union all
  -- Passport: declared validity dates, aggregated per scope (group or entity).
  select l.id, l.rule_key, l.version, l.parameters, p.legal_entity_id, null::uuid, 'passport', coalesce(p.legal_entity_id, p_org), '', min(p.valid_until),
    jsonb_build_object('fields', count(*), 'field_keys', jsonb_agg(p.field_key order by p.field_key), 'earliest_valid_until', min(p.valid_until), 'lead_days', (l.parameters->>'lead_days')::int, 'observed_at', p_day),
    jsonb_build_object('field_keys', jsonb_agg(p.field_key order by p.field_key), 'earliest_valid_until', min(p.valid_until))
  from live l join public.fin_company_profiles p on p.organization_id = p_org
  where l.rule_key = 'passport_stale' and p.valid_until is not null and p.valid_until <= p_day + (l.parameters->>'lead_days')::int
  group by l.id, l.rule_key, l.version, l.parameters, p.legal_entity_id
  union all
  -- Facility data freshness: the facility's own review_after_days.
  select l.id, l.rule_key, l.version, l.parameters, f.legal_entity_id, f.provider_id, 'facility', f.id, '', null::date,
    jsonb_build_object('facility_id', f.id, 'name', f.name, 'verified_at', f.verified_at, 'review_after_days', f.review_after_days, 'source', f.source, 'observed_at', p_day),
    jsonb_build_object('facility_id', f.id, 'verified_at', f.verified_at, 'review_after_days', f.review_after_days)
  from live l join public.fin_facilities f on f.organization_id = p_org
  where l.rule_key = 'facility_data_stale' and f.status = 'active' and (f.verified_at is null or f.verified_at::date + f.review_after_days < p_day)
  union all
  select l.id, l.rule_key, l.version, l.parameters, v.legal_entity_id, v.provider_id, 'fee_variance', v.id, '', null::date,
    jsonb_build_object('variance_id', v.id, 'contract_id', v.contract_id, 'service', v.service, 'currency', v.currency, 'comparison_status', v.comparison_status, 'direction', v.direction,
      'variance_amount', v.variance_amount, 'period_start', v.period_start, 'period_end', v.period_end, 'review_status', v.review_status, 'observed_at', p_day),
    jsonb_build_object('variance_id', v.id, 'review_status', v.review_status)
  from live l join public.fin_fee_variances v on v.organization_id = p_org
  where l.rule_key = 'fee_variance_review' and v.review_status = 'new' and v.created_at::date <= p_day - (l.parameters->>'min_age_days')::int
  union all
  -- A human-confirmed and resolved difference may deserve a value record: a
  -- prompt only; the value ledger keeps its own methodology and validation.
  select l.id, l.rule_key, l.version, l.parameters, v.legal_entity_id, v.provider_id, 'fee_variance', v.id, '', null::date,
    jsonb_build_object('variance_id', v.id, 'contract_id', v.contract_id, 'service', v.service, 'currency', v.currency, 'variance_amount', v.variance_amount, 'resolved_at', v.last_reviewed_at, 'observed_at', p_day),
    jsonb_build_object('variance_id', v.id, 'resolved_at', v.last_reviewed_at)
  from live l join public.fin_fee_variances v on v.organization_id = p_org
  where l.rule_key = 'fee_resolution_value_review' and v.review_status = 'resolved' and v.direction = 'above'
    and exists (select 1 from public.fin_fee_reviews w where w.variance_id = v.id and w.to_status = 'confirmed')
  union all
  select l.id, l.rule_key, l.version, l.parameters, x.legal_entity_id, x.provider_id, 'value_record', x.id, '', null::date,
    jsonb_build_object('value_record_id', x.id, 'contract_id', x.contract_id, 'title', x.title, 'currency', x.currency, 'period_end', x.period_end, 'grace_days', (l.parameters->>'grace_days')::int, 'observed_at', p_day),
    jsonb_build_object('value_record_id', x.id, 'period_end', x.period_end)
  from live l join public.fin_value_records x on x.organization_id = p_org
  where l.rule_key = 'value_realization_review' and x.kind = 'NEGOTIATED_SAVINGS' and x.status = 'active' and x.comparability = 'comparable'
    and x.period_end <= p_day - (l.parameters->>'grace_days')::int and not exists (select 1 from public.fin_value_records y where y.parent_id = x.id)
  union all
  select l.id, l.rule_key, l.version, l.parameters, q.legal_entity_id, null::uuid, 'rfq', q.id, '', q.response_deadline,
    jsonb_build_object('rfq_id', q.id, 'title', q.title, 'status', q.status, 'proposals', (select count(*) from public.fin_proposals p where p.rfq_id = q.id and p.status in ('submitted','revised')),
      'min_proposals', (l.parameters->>'min_proposals')::int, 'observed_at', p_day),
    jsonb_build_object('rfq_id', q.id, 'proposals', (select count(*) from public.fin_proposals p where p.rfq_id = q.id and p.status in ('submitted','revised')), 'min_proposals', (l.parameters->>'min_proposals')::int)
  from live l join public.fin_rfqs q on q.organization_id = p_org
  where l.rule_key = 'proposal_count_below' and q.status in ('collecting','comparing')
    and (select count(*) from public.fin_proposals p where p.rfq_id = q.id and p.status in ('submitted','revised')) < (l.parameters->>'min_proposals')::int
  union all
  -- Concentration per currency over approved limits of active facilities.
  select l.id, l.rule_key, l.version, l.parameters, null::uuid, s.provider_id, 'provider', s.provider_id, s.currency, null::date,
    jsonb_build_object('provider_id', s.provider_id, 'currency', s.currency, 'provider_limit', s.provider_limit, 'total_limit', s.total_limit,
      'share_pct', round(s.provider_limit * 100 / s.total_limit, 2), 'max_share_pct', (l.parameters->>'max_share_pct')::int, 'facilities', s.facilities, 'observed_at', p_day),
    jsonb_build_object('provider_id', s.provider_id, 'currency', s.currency, 'provider_limit', s.provider_limit, 'total_limit', s.total_limit, 'max_share_pct', (l.parameters->>'max_share_pct')::int)
  from live l join (
    select f.provider_id, f.currency, sum(f.approved_limit) as provider_limit, count(*) as facilities,
      sum(sum(f.approved_limit)) over (partition by f.currency) as total_limit
    from public.fin_facilities f where f.organization_id = p_org and f.status = 'active' and f.approved_limit is not null and f.approved_limit > 0
    group by f.provider_id, f.currency) s on true
  where l.rule_key = 'provider_concentration' and s.provider_limit * 100 > (l.parameters->>'max_share_pct')::numeric * s.total_limit
  union all
  select l.id, l.rule_key, l.version, l.parameters, f.legal_entity_id, f.provider_id, 'facility', f.id, '', null::date,
    jsonb_build_object('facility_id', f.id, 'name', f.name, 'currency', f.currency, 'as_of', b.as_of, 'used_limit_amount', b.used_limit_amount, 'approved_limit', f.approved_limit,
      'utilization_pct', round(b.used_limit_amount * 100 / f.approved_limit, 2), 'max_utilization_pct', (l.parameters->>'max_utilization_pct')::int, 'observed_at', p_day),
    jsonb_build_object('facility_id', f.id, 'as_of', b.as_of, 'used_limit_amount', b.used_limit_amount, 'approved_limit', f.approved_limit, 'max_utilization_pct', (l.parameters->>'max_utilization_pct')::int)
  from live l join public.fin_facilities f on f.organization_id = p_org
  join lateral (select z.as_of, z.used_limit_amount from public.fin_facility_balances z where z.organization_id = f.organization_id and z.facility_id = f.id and z.used_limit_amount is not null order by z.as_of desc, z.recorded_at desc limit 1) b on true
  where l.rule_key = 'facility_utilization' and f.status = 'active' and f.approved_limit > 0
    and b.used_limit_amount * 100 > (l.parameters->>'max_utilization_pct')::numeric * f.approved_limit
  union all
  select l.id, l.rule_key, l.version, l.parameters, null::uuid, null::uuid, 'organization', p_org, '', null::date,
    jsonb_build_object('exceptions', e.n, 'window_days', (l.parameters->>'window_days')::int, 'min_count', (l.parameters->>'min_count')::int, 'reason_codes', e.codes, 'observed_at', p_day),
    jsonb_build_object('exceptions', e.n, 'window_days', (l.parameters->>'window_days')::int, 'min_count', (l.parameters->>'min_count')::int)
  from live l join lateral (select count(*) as n, jsonb_agg(distinct x.reason_code) as codes from public.fin_policy_exceptions x
    where x.organization_id = p_org and x.status in ('requested','approved') and x.created_at >= p_day - (l.parameters->>'window_days')::int) e on true
  where l.rule_key = 'approval_exception_frequency' and e.n >= (l.parameters->>'min_count')::int
  union all
  select l.id, l.rule_key, l.version, l.parameters, c.legal_entity_id, c.provider_id, 'contract', c.id, '', null::date,
    jsonb_build_object('contract_id', c.id, 'title', c.title, 'product', c.product, 'starts_on', c.starts_on, 'origin', c.origin, 'lookback_months', (l.parameters->>'lookback_months')::int, 'observed_at', p_day),
    jsonb_build_object('contract_id', c.id, 'starts_on', c.starts_on, 'lookback_months', (l.parameters->>'lookback_months')::int)
  from live l join public.fin_contracts c on c.organization_id = p_org
  where l.rule_key = 'contract_without_sourcing' and c.status = 'active'
    and c.starts_on <= (p_day - make_interval(months => (l.parameters->>'lookback_months')::int))::date
    and not exists (select 1 from public.fin_rfqs q where q.organization_id = p_org and q.product = c.product
      and q.created_at >= p_day - make_interval(months => (l.parameters->>'lookback_months')::int))
 union all
 select l.id,l.rule_key,l.version,l.parameters,p.legal_entity_id,p.provider_id,'contract',p.contract_id,'',p.target_go_live,
 jsonb_build_object('implementation_id',p.id,'contract_id',p.contract_id,'target_go_live',p.target_go_live,'status',p.status,'observed_at',p_day),
 jsonb_build_object('implementation_id',p.id,'target_go_live',p.target_go_live,'status',p.status)
 from live l join public.fin_implementation_plans p on p.organization_id=p_org
 where p.status not in ('accepted','cancelled') and ((l.rule_key='implementation_blocked' and (p.status='blocked' or exists(select 1 from public.fin_implementation_issues i where i.plan_id=p.id and i.status='open'))) or (l.rule_key='implementation_overdue' and (p.target_go_live<p_day or exists(select 1 from public.fin_implementation_milestones m where m.plan_id=p.id and m.status<>'completed' and m.due_on<p_day))))

 union all
 select l.id,l.rule_key,l.version,l.parameters,o.legal_entity_id,o.provider_id,'contract',o.contract_id,p.id::text,p.due_on,
 jsonb_build_object('obligation_id',o.id,'period_id',p.id,'status',f.data->>'status','due_on',p.due_on,'grace_until',p.due_on+o.grace_days,'has_data',f.data->'has_data','factual_result',f.data->'factual_result','waiver_expired',w.valid_until,'observed_at',p_day),
 jsonb_build_object('period_id',p.id,'status',f.data->>'status','due_on',p.due_on,'measurement_id',f.data->'measurement_id','review_id',f.data->'review_id','waiver_expired',w.valid_until)
 from live l join public.fin_obligations o on o.organization_id=p_org and o.status='active' join public.fin_obligation_periods p on p.obligation_id=o.id
 cross join lateral(select public.fin_obligation_facts(p.id,p_day) as data)f
 left join lateral(select valid_until from public.fin_covenant_waivers where period_id=p.id and status='approved' and valid_until<p_day order by valid_until desc limit 1)w on true
 where (l.rule_key='covenant_due' and o.kind in ('financial_covenant','reporting_covenant') and p.due_on between p_day and p_day+(l.parameters->>'lead_days')::int and f.data->>'status' not in ('compliant','waived','not_applicable'))
 or (l.rule_key='covenant_awaiting_data' and o.kind in ('financial_covenant','reporting_covenant') and f.data->>'status'='awaiting_data')
 or (l.rule_key='covenant_non_compliance' and f.data->>'status'='non_compliant')
 or (l.rule_key='waiver_expiry' and w.valid_until is not null and f.data->>'status'<>'waived')
 or (l.rule_key='contractual_obligation_overdue' and p.due_on+o.grace_days<p_day and f.data->>'status' not in ('compliant','waived','not_applicable'))

 union all
 select l.id,l.rule_key,l.version,l.parameters,p.legal_entity_id,p.provider_id,'contract',p.contract_id,p.id::text,p.review_due_on,
 jsonb_build_object('period_id',p.id,'review_due_on',p.review_due_on,'status',p.status,'observed_at',p_day),jsonb_build_object('period_id',p.id,'version',p.version,'review_due_on',p.review_due_on)
 from live l join public.fin_provider_performance_periods p on p.organization_id=p_org where l.rule_key='performance_review_due' and p.status='open' and p.review_due_on<=p_day
 union all
 select l.id,l.rule_key,l.version,l.parameters,m.legal_entity_id,m.provider_id,'contract',m.contract_id,m.period_id::text||':'||m.dimension_id::text,m.review_due_on,
 jsonb_build_object('period_id',m.period_id,'dimension_id',m.dimension_id,'metric',m.metric,'actual',m.actual,'operator',m.operator,'threshold',m.threshold,'source_reference',m.source_reference,'formula_version',m.formula_version,'coverage_numerator',m.coverage_numerator,'coverage_denominator',m.coverage_denominator,'review_id',m.review_id,'observed_at',p_day),
 jsonb_build_object('period_id',m.period_id,'observation_id',m.observation_id,'review_id',m.review_id,'actual',m.actual,'threshold',m.threshold)
 from live l join public.fin_provider_performance_monitor m on m.organization_id=p_org where l.rule_key='performance_sla_issue' and m.metric in ('sla_adherence','service_availability') and m.verification_status='confirmed' and m.target_met=false and not exists(select 1 from public.fin_provider_performance_periods q where q.previous_period_id=m.period_id)
$$;
revoke all on function public.fin_opportunity_candidates(uuid,date) from public,anon,authenticated;
insert into public.fin_settings(key,value) values('schema_version', 'financial-provider-performance-1') on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

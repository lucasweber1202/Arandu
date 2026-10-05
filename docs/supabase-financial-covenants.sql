-- Structured obligations, period evidence and human-reviewed covenants.
begin;
create table if not exists public.fin_obligations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, contract_id uuid not null, source_contract_version integer not null check(source_contract_version>=0), legal_entity_id uuid, provider_id uuid not null,
 title text not null check(length(trim(title)) between 3 and 200 and title !~ '[<>]'),
 kind text not null check(kind in ('financial_covenant','reporting_covenant','information_obligation','contractual_deadline','operational_obligation','document_delivery')),
 source_clause text not null check(length(trim(source_clause)) between 3 and 2000 and source_clause !~ '[<>]'),
 source_reference text not null check(length(trim(source_reference)) between 3 and 200 and source_reference !~ '[<>]'),
 owner_id uuid not null references auth.users(id), frequency text not null check(frequency in ('once','monthly','quarterly','annually')),
 first_period_start date not null, first_period_end date not null, first_due_on date not null,
 grace_days integer not null default 0 check(grace_days between 0 and 365), due_soon_days integer not null default 30 check(due_soon_days between 0 and 90),
 status text not null default 'active' check(status in ('active','cancelled')), version integer not null default 1, cancellation_reason text,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,contract_id) references public.fin_contracts(organization_id,id),
 foreign key(organization_id,legal_entity_id) references public.fin_legal_entities(organization_id,id), foreign key(organization_id,provider_id) references public.fin_providers(organization_id,id),
 check(first_period_end>=first_period_start and first_due_on>=first_period_end)
);
create table if not exists public.fin_covenants (
 obligation_id uuid primary key, organization_id uuid not null,
 metric text not null check(length(trim(metric)) between 3 and 200 and metric !~ '[<>]'), operator text not null check(operator in ('lt','le','eq','ge','gt')),
 threshold numeric not null check(threshold between -1e18 and 1e18), unit text not null check(unit in ('ratio','percent','amount','count')),
 currency text check(currency ~ '^[A-Z]{3}$'), check((unit='amount')=(currency is not null)),
 foreign key(organization_id,obligation_id) references public.fin_obligations(organization_id,id)
);
create table if not exists public.fin_obligation_periods (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, obligation_id uuid not null,
 period_start date not null, period_end date not null, due_on date not null, task_id uuid references public.fin_tasks(id), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(obligation_id,period_start),
 foreign key(organization_id,obligation_id) references public.fin_obligations(organization_id,id), check(period_end>=period_start and due_on>=period_end)
);
create table if not exists public.fin_covenant_measurements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, period_id uuid not null,
 measured_value numeric not null check(measured_value between -1e18 and 1e18), measured_on date not null,
 source_reference text not null check(length(trim(source_reference)) between 3 and 200 and source_reference !~ '[<>]'),
 provenance text not null check(length(trim(provenance)) between 10 and 2000 and provenance !~ '[<>]'),
 document_id uuid references public.fin_private_documents(id), recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(period_id,id), foreign key(organization_id,period_id) references public.fin_obligation_periods(organization_id,id)
);
create table if not exists public.fin_obligation_evidence (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, period_id uuid not null,
 source_reference text not null check(length(trim(source_reference)) between 3 and 200 and source_reference !~ '[<>]'),
 provenance text not null check(length(trim(provenance)) between 10 and 2000 and provenance !~ '[<>]'),
 document_id uuid references public.fin_private_documents(id), recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(period_id,id), foreign key(organization_id,period_id) references public.fin_obligation_periods(organization_id,id)
);
create table if not exists public.fin_obligation_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, period_id uuid not null,
 status text not null check(status in ('under_review','compliant','non_compliant','not_applicable')),
 measurement_id uuid, evidence_id uuid, reason text not null check(length(trim(reason)) between 10 and 2000 and reason !~ '[<>]'),
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,period_id) references public.fin_obligation_periods(organization_id,id),
 foreign key(period_id,measurement_id) references public.fin_covenant_measurements(period_id,id), foreign key(period_id,evidence_id) references public.fin_obligation_evidence(period_id,id)
);
create table if not exists public.fin_covenant_waivers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, period_id uuid not null,
 valid_until date not null, reason text not null check(length(trim(reason)) between 10 and 2000 and reason !~ '[<>]'),
 controls text not null check(length(trim(controls)) between 10 and 2000 and controls !~ '[<>]'),
 requested_by uuid not null references auth.users(id), requested_at timestamptz not null default clock_timestamp(),
 status text not null default 'requested' check(status in ('requested','approved','rejected')), version integer not null default 1,
 decided_by uuid references auth.users(id), decided_at timestamptz, decision_reason text,
 foreign key(organization_id,period_id) references public.fin_obligation_periods(organization_id,id),
 check((status='requested')=(decided_by is null)), check(decided_by is null or decided_by<>requested_by),
 check((decided_by is null)=(decided_at is null)), check(status='requested' or (decision_reason is not null and length(trim(decision_reason)) between 10 and 2000 and decision_reason !~ '[<>]'))
);
create index if not exists fin_obligation_scope on public.fin_obligations(organization_id,legal_entity_id,provider_id);
create index if not exists fin_obligation_due on public.fin_obligation_periods(organization_id,due_on,id);
create index if not exists fin_obligation_reviews_latest on public.fin_obligation_reviews(period_id,reviewed_at desc,id desc);
create index if not exists fin_covenant_measurements_latest on public.fin_covenant_measurements(period_id,recorded_at desc,id desc);
create index if not exists fin_obligation_evidence_latest on public.fin_obligation_evidence(period_id,recorded_at desc,id desc);
create index if not exists fin_covenant_waivers_period on public.fin_covenant_waivers(period_id,status,valid_until);
-- Read permission comes exclusively from the source obligation, including children.
do $$ declare t text; predicate text; begin
 foreach t in array array['fin_obligations','fin_covenants','fin_obligation_periods','fin_covenant_measurements','fin_obligation_evidence','fin_obligation_reviews','fin_covenant_waivers'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);
 predicate:=case when t='fin_obligations' then 'public.fin_entity_allows(organization_id,legal_entity_id,array[''admin'',''finance_manager'',''analyst'',''viewer'']) and exists(select 1 from public.fin_organizations o where o.id=organization_id and o.kind=''BUYER'')'
 when t in ('fin_covenants','fin_obligation_periods') then format('exists(select 1 from public.fin_obligations o where o.organization_id=%I.organization_id and o.id=%I.obligation_id)',t,t)
 else format('exists(select 1 from public.fin_obligation_periods p where p.organization_id=%I.organization_id and p.id=%I.period_id)',t,t) end;
 execute format('drop policy if exists obligation_read on public.%I',t);execute format('create policy obligation_read on public.%I for select to authenticated using(%s)',t,predicate);
 execute format('drop trigger if exists obligation_immutable on public.%I',t);
 if t not in ('fin_obligations','fin_covenant_waivers') then execute format('create trigger obligation_immutable before update or delete on public.%I for each row execute function public.fin_immutable_row()',t);
 else execute format('create trigger obligation_immutable before delete on public.%I for each row execute function public.fin_immutable_row()',t);end if;
 end loop;
end $$;
create or replace function public.fin_obligation_require(p_period uuid,p_roles text[]) returns public.fin_obligations language plpgsql security definer set search_path='' as $$
declare o public.fin_obligations%rowtype;begin
 select s.* into o from public.fin_obligations s join public.fin_obligation_periods p on p.obligation_id=s.id where p.id=p_period for update of s;
 if o.id is null or auth.uid() is null or not public.fin_entity_allows(o.organization_id,o.legal_entity_id,p_roles) or not exists(select 1 from public.fin_organizations where id=o.organization_id and kind='BUYER') then raise exception 'forbidden';end if;
 if public.fin_governance_org_locked(o.organization_id) then raise exception 'organization offboarding';end if;
 if o.status<>'active' then raise exception 'obligation closed';end if;
 return o;
end $$;
revoke all on function public.fin_obligation_require(uuid,text[]) from public,anon,authenticated;
create or replace function public.fin_obligation_add_period(p_obligation uuid,p_start date,p_end date,p_due date) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.fin_obligations%rowtype; v_id uuid;v_task uuid;begin
 select * into o from public.fin_obligations where id=p_obligation for update;
 select id into v_id from public.fin_obligation_periods where obligation_id=o.id and period_start=p_start;
 if v_id is not null then return v_id;end if;
 insert into public.fin_tasks(organization_id,title,due_on,related_type,related_id,created_by) values(o.organization_id,'Obrigação: '||o.title,p_due,'contract',o.contract_id,o.created_by) returning id into v_task;
 insert into public.fin_obligation_periods(organization_id,obligation_id,period_start,period_end,due_on,task_id) values(o.organization_id,o.id,p_start,p_end,p_due,v_task) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.fin_obligation_add_period(uuid,date,date,date) from public,anon,authenticated;
create or replace function public.fin_open_obligation(p_contract uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype;v_id uuid;v_owner uuid;v_step integer;begin
 select * into c from public.fin_contracts where id=p_contract for update;
 if c.id is null or auth.uid() is null or not public.fin_entity_allows(c.organization_id,c.legal_entity_id,array['admin','finance_manager']) or not exists(select 1 from public.fin_organizations where id=c.organization_id and kind='BUYER') then raise exception 'forbidden';end if;
 if public.fin_governance_org_locked(c.organization_id) then raise exception 'organization offboarding';end if;
 if c.status not in ('active','renewing') then raise exception 'obligation contract inactive';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('title','kind','source_clause','source_reference','owner_id','frequency','first_period_start','first_period_end','first_due_on','grace_days','due_soon_days','metric','operator','threshold','unit','currency')) then raise exception 'invalid obligation input';end if;
 v_owner:=coalesce(nullif(p_input->>'owner_id','')::uuid,auth.uid());
 if not public.fin_implementation_owner_valid(c.organization_id,c.legal_entity_id,v_owner) then raise exception 'invalid obligation owner';end if;
 v_step:=case p_input->>'frequency' when 'monthly' then 1 when 'quarterly' then 3 when 'annually' then 12 else 0 end;
 if (p_input->>'first_period_start')::date < current_date-interval '5 years' or (v_step>0 and (p_input->>'first_period_end')::date<>((p_input->>'first_period_start')::date+make_interval(months=>v_step))::date-1) then raise exception 'invalid obligation period';end if;
 if p_input->>'kind'<>'financial_covenant' and exists(select 1 from jsonb_object_keys(p_input) k where k in ('metric','operator','threshold','unit','currency') and p_input->>k is not null and p_input->>k<>'') then raise exception 'invalid obligation metric';end if;
 insert into public.fin_obligations(organization_id,contract_id,source_contract_version,legal_entity_id,provider_id,title,kind,source_clause,source_reference,owner_id,frequency,first_period_start,first_period_end,first_due_on,grace_days,due_soon_days,created_by)
 values(c.organization_id,c.id,c.current_version,c.legal_entity_id,c.provider_id,trim(p_input->>'title'),p_input->>'kind',trim(p_input->>'source_clause'),trim(p_input->>'source_reference'),v_owner,p_input->>'frequency',(p_input->>'first_period_start')::date,(p_input->>'first_period_end')::date,(p_input->>'first_due_on')::date,coalesce((p_input->>'grace_days')::int,0),coalesce((p_input->>'due_soon_days')::int,30),auth.uid()) returning id into v_id;
 if p_input->>'kind'='financial_covenant' then insert into public.fin_covenants(obligation_id,organization_id,metric,operator,threshold,unit,currency) values(v_id,c.organization_id,trim(p_input->>'metric'),p_input->>'operator',(p_input->>'threshold')::numeric,p_input->>'unit',nullif(p_input->>'currency',''));end if;
 perform public.fin_obligation_add_period(v_id,(p_input->>'first_period_start')::date,(p_input->>'first_period_end')::date,(p_input->>'first_due_on')::date);
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(c.organization_id,'contract',c.id,'obligation_opened',auth.uid(),c.legal_entity_id,jsonb_build_object('obligation_id',v_id));
 return v_id;
end $$;
revoke all on function public.fin_open_obligation(uuid,jsonb) from public,anon;
grant execute on function public.fin_open_obligation(uuid,jsonb) to authenticated;
create or replace function public.fin_record_obligation_data(p_period uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.fin_obligations%rowtype;v_id uuid;v_doc uuid;begin
 o:=public.fin_obligation_require(p_period,array['admin','finance_manager','analyst']);
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('measured_value','measured_on','source_reference','provenance','document_id')) then raise exception 'invalid obligation input';end if;
 v_doc:=nullif(p_input->>'document_id','')::uuid;
 if v_doc is not null and not(public.fin_can_read_document(v_doc) and exists(select 1 from public.fin_private_documents where id=v_doc and buyer_organization_id=o.organization_id and entity_type='contract' and entity_id=o.contract_id)) then raise exception 'invalid obligation evidence';end if;
 if o.kind='financial_covenant' then
 if (p_input->>'measured_on')::date>current_date or (p_input->>'measured_on')::date<(select period_end from public.fin_obligation_periods where id=p_period) then raise exception 'invalid obligation measurement date';end if;
 insert into public.fin_covenant_measurements(organization_id,period_id,measured_value,measured_on,source_reference,provenance,document_id,recorded_by) values(o.organization_id,p_period,(p_input->>'measured_value')::numeric,(p_input->>'measured_on')::date,trim(p_input->>'source_reference'),trim(p_input->>'provenance'),v_doc,auth.uid()) returning id into v_id;
 else
 if p_input ? 'measured_value' or p_input ? 'measured_on' then raise exception 'invalid obligation metric';end if;
 insert into public.fin_obligation_evidence(organization_id,period_id,source_reference,provenance,document_id,recorded_by) values(o.organization_id,p_period,trim(p_input->>'source_reference'),trim(p_input->>'provenance'),v_doc,auth.uid()) returning id into v_id;
 end if;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(o.organization_id,'contract',o.contract_id,'obligation_data_recorded',auth.uid(),o.legal_entity_id,jsonb_build_object('period_id',p_period,'record_id',v_id));
 update public.fin_tasks set status=case when public.fin_obligation_facts(p_period,current_date)->>'status' in ('waived','not_applicable') then 'done' else 'open' end where id=(select task_id from public.fin_obligation_periods where id=p_period);
 return v_id;
end $$;
revoke all on function public.fin_record_obligation_data(uuid,jsonb) from public,anon;
grant execute on function public.fin_record_obligation_data(uuid,jsonb) to authenticated;
create or replace function public.fin_review_obligation(p_period uuid,p_expected uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.fin_obligations%rowtype;r public.fin_obligation_reviews%rowtype;m public.fin_covenant_measurements%rowtype;e public.fin_obligation_evidence%rowtype;c public.fin_covenants%rowtype;v_ok boolean;v_status text;v_id uuid;begin
 o:=public.fin_obligation_require(p_period,array['admin','finance_manager']);
 select * into r from public.fin_obligation_reviews where period_id=p_period order by reviewed_at desc,id desc limit 1;
 if r.id is distinct from p_expected then raise exception 'obligation conflict';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('status','reason','measurement_id','evidence_id')) then raise exception 'invalid obligation input';end if;
 v_status:=p_input->>'status';
 if v_status in ('compliant','non_compliant') then
 if o.kind='financial_covenant' then
 select * into m from public.fin_covenant_measurements where id=nullif(p_input->>'measurement_id','')::uuid and period_id=p_period;
 select * into c from public.fin_covenants where obligation_id=o.id;
 if m.id is null then raise exception 'obligation data missing';end if;
 if m.recorded_by=auth.uid() then raise exception 'obligation independent reviewer required';end if;
 if m.id<>(select id from public.fin_covenant_measurements where period_id=p_period order by recorded_at desc,id desc limit 1) then raise exception 'obligation stale data';end if;
 v_ok:=case c.operator when 'lt' then m.measured_value<c.threshold when 'le' then m.measured_value<=c.threshold when 'eq' then m.measured_value=c.threshold when 'ge' then m.measured_value>=c.threshold when 'gt' then m.measured_value>c.threshold end;
 if (v_status='compliant') is distinct from v_ok then raise exception 'obligation factual result mismatch';end if;
 else
 select * into e from public.fin_obligation_evidence where id=nullif(p_input->>'evidence_id','')::uuid and period_id=p_period;
 if e.id is null then raise exception 'obligation data missing';end if;
 if e.recorded_by=auth.uid() then raise exception 'obligation independent reviewer required';end if;
 if e.id<>(select id from public.fin_obligation_evidence where period_id=p_period order by recorded_at desc,id desc limit 1) then raise exception 'obligation stale data';end if;
 end if;
 end if;
 insert into public.fin_obligation_reviews(organization_id,period_id,status,measurement_id,evidence_id,reason,reviewed_by) values(o.organization_id,p_period,v_status,m.id,e.id,trim(p_input->>'reason'),auth.uid()) returning id into v_id;
 update public.fin_tasks set status=case when v_status in ('compliant','not_applicable') then 'done' else 'open' end where id=(select task_id from public.fin_obligation_periods where id=p_period);
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(o.organization_id,'contract',o.contract_id,'obligation_reviewed',auth.uid(),o.legal_entity_id,jsonb_build_object('period_id',p_period,'review_id',v_id,'status',v_status));return v_id;
end $$;
revoke all on function public.fin_review_obligation(uuid,uuid,jsonb) from public,anon;
grant execute on function public.fin_review_obligation(uuid,uuid,jsonb) to authenticated;
create or replace function public.fin_covenant_waiver(p_period uuid,p_waiver uuid,p_expected integer,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.fin_obligations%rowtype;w public.fin_covenant_waivers%rowtype;v_id uuid;begin
 o:=public.fin_obligation_require(p_period,case when p_waiver is null then array['admin','finance_manager','analyst'] else array['admin','finance_manager'] end);
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid obligation input';end if;
 if p_waiver is null then
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('valid_until','reason','controls')) then raise exception 'invalid obligation input';end if;
 if (p_input->>'valid_until')::date<current_date or (p_input->>'valid_until')::date>current_date+366 then raise exception 'invalid waiver validity';end if;
 insert into public.fin_covenant_waivers(organization_id,period_id,valid_until,reason,controls,requested_by) values(o.organization_id,p_period,(p_input->>'valid_until')::date,trim(p_input->>'reason'),trim(p_input->>'controls'),auth.uid()) returning id into v_id;
 else
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('status','decision_reason')) or p_input->>'status' not in ('approved','rejected') then raise exception 'invalid obligation input';end if;
 select * into w from public.fin_covenant_waivers where id=p_waiver and period_id=p_period for update;
 if w.id is null then raise exception 'forbidden';end if;
 if p_expected is null or w.version<>p_expected then raise exception 'obligation conflict';end if;
 if w.status<>'requested' or w.valid_until<current_date then raise exception 'waiver closed';end if;
 if w.requested_by=auth.uid() then raise exception 'waiver independent reviewer required';end if;
 update public.fin_covenant_waivers set status=p_input->>'status',decision_reason=trim(p_input->>'decision_reason'),decided_by=auth.uid(),decided_at=clock_timestamp(),version=version+1 where id=w.id;v_id:=w.id;
 end if;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(o.organization_id,'contract',o.contract_id,'obligation_waiver_changed',auth.uid(),o.legal_entity_id,jsonb_build_object('period_id',p_period,'waiver_id',v_id));return v_id;
end $$;
revoke all on function public.fin_covenant_waiver(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.fin_covenant_waiver(uuid,uuid,integer,jsonb) to authenticated;
-- Read-only facts; RLS remains active in every relation, including invoker views.
create or replace function public.fin_obligation_facts(p_period uuid,p_day date default current_date) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('status',case
 when o.status='cancelled' then 'not_applicable'
 when w.id is not null then 'waived'
 when r.status='not_applicable' then 'not_applicable'
 when r.status in ('compliant','non_compliant') and coalesce(m.recorded_at,e.recorded_at)<=r.reviewed_at then r.status
 when m.id is not null or e.id is not null then 'under_review'
 when p_day<p.due_on-o.due_soon_days then 'not_due'
 when p_day<p.due_on then 'due_soon'
 else 'awaiting_data' end,
 'period_id',p.id,'obligation_id',o.id,'contract_id',o.contract_id,'due_on',p.due_on,'grace_until',p.due_on+o.grace_days,'observed_at',p_day,
 'has_data',m.id is not null or e.id is not null,'measurement_id',m.id,'evidence_id',e.id,'review_id',r.id,'waiver_id',w.id,'waiver_until',w.valid_until,
 'measured_value',m.measured_value::text,'metric',c.metric,'operator',c.operator,'threshold',c.threshold::text,'unit',c.unit,'currency',c.currency,
 'factual_result',case when m.id is null then null else case c.operator when 'lt' then m.measured_value<c.threshold when 'le' then m.measured_value<=c.threshold when 'eq' then m.measured_value=c.threshold when 'ge' then m.measured_value>=c.threshold when 'gt' then m.measured_value>c.threshold end end,
 'formula','measured_value operator customer threshold; missing data is unknown; compliance requires independent human review',
 'reviewed_by',r.reviewed_by,'review_reason',r.reason,'source_reference',coalesce(m.source_reference,e.source_reference,o.source_reference),'provenance',coalesce(m.provenance,e.provenance))
 from public.fin_obligation_periods p join public.fin_obligations o on o.id=p.obligation_id left join public.fin_covenants c on c.obligation_id=o.id
 left join lateral(select * from public.fin_covenant_measurements where period_id=p.id order by recorded_at desc,id desc limit 1)m on true
 left join lateral(select * from public.fin_obligation_evidence where period_id=p.id order by recorded_at desc,id desc limit 1)e on true
 left join lateral(select * from public.fin_obligation_reviews where period_id=p.id order by reviewed_at desc,id desc limit 1)r on true
 left join lateral(select * from public.fin_covenant_waivers where period_id=p.id and status='approved' and valid_until>=p_day order by valid_until desc,id desc limit 1)w on true
 where p.id=p_period and p_day is not null
$$;
revoke all on function public.fin_obligation_facts(uuid,date) from public,anon;
grant execute on function public.fin_obligation_facts(uuid,date) to authenticated,service_role;
create or replace view public.fin_obligation_monitor with(security_invoker=true) as
select p.*,o.contract_id,o.legal_entity_id,o.provider_id,o.title,o.kind,o.owner_id,o.frequency,o.source_clause,o.source_reference,o.source_contract_version,o.version as obligation_version,o.cancellation_reason,
 public.fin_obligation_facts(p.id,current_date) as facts from public.fin_obligation_periods p join public.fin_obligations o on o.id=p.obligation_id;
revoke all on public.fin_obligation_monitor from public,anon;
grant select on public.fin_obligation_monitor to authenticated,service_role;
create or replace function public.fin_run_obligations(p_day date default current_date) returns integer language plpgsql security definer set search_path='' as $$
declare v_obligation public.fin_obligations%rowtype;v_step integer;v_i integer;v_start date;v_next date;v_period uuid;v_count integer:=0;v_notice integer;begin
 if auth.uid() is not null then raise exception 'forbidden';end if;
 if p_day is null or abs(p_day-current_date)>31 then raise exception 'invalid obligation day';end if;
 for v_obligation in select * from public.fin_obligations where status='active' and not public.fin_governance_org_locked(organization_id) order by id for update loop
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
 from public.fin_obligation_periods p join public.fin_obligations o on o.id=p.obligation_id where t.id=p.task_id and o.status='active' and not public.fin_governance_org_locked(o.organization_id);
 insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
 select o.organization_id,o.owner_id,'task_assigned','contract',o.contract_id,p.id,'Obrigação contratual a revisar','Consulte o período, dados, prazo e evidências. Ausência de dados não comprova conformidade.'
 from public.fin_obligation_periods p join public.fin_obligations o on o.id=p.obligation_id
 where o.status='active' and p.due_on-o.due_soon_days<=p_day and public.fin_obligation_facts(p.id,p_day)->>'status' not in ('compliant','waived','not_applicable')
 and not public.fin_governance_org_locked(o.organization_id) and public.fin_implementation_owner_valid(o.organization_id,o.legal_entity_id,o.owner_id)
 on conflict(user_id,event_type,event_id) do nothing;get diagnostics v_notice=row_count;return v_count+v_notice;
end $$;
revoke all on function public.fin_run_obligations(date) from public,anon,authenticated;
grant execute on function public.fin_run_obligations(date) to service_role;

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
    ('covenant_waivers', 'select * from public.fin_covenant_waivers where organization_id = $1');
$$;
revoke all on function public.fin_governance_export_datasets() from public, anon, authenticated;

create or replace function public.fin_search(p_org uuid,p_query text,p_kind text default null,p_limit integer default 12,p_offset integer default 0)
returns table(kind text,id uuid,title text,detail text,href text)
language plpgsql stable security definer set search_path = '' as $$
declare v_query text;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
 v_query:=lower(trim(coalesce(p_query,'')));
 if length(v_query) not between 2 and 100 or p_limit not between 1 and 30 or p_offset not between 0 and 1000
 or (p_kind is not null and p_kind not in ('rfq','proposal','provider','contract','task','implementation','covenant')) then
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
 ) x order by x.priority,x.sorted_at desc,x.id limit p_limit offset p_offset;
end $$;

revoke all on function public.fin_search(uuid,text,text,integer,integer) from public,anon;
grant execute on function public.fin_search(uuid,text,text,integer,integer) to authenticated;
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
 or p_kind is not null and p_kind not in ('organization','entity','provider','relationship','rfq','proposal','decision','contract','facility','limit','guarantee','passport_snapshot','milestone','obligation','document','owner','value_realization','fee_schedule','fee_observation','fee_variance','fee_review','opportunity','implementation','covenant')
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
 get diagnostics v_count=row_count; return n+v_count+public.fin_run_obligations(p_day);
end $$;
revoke all on function public.fin_run_contract_milestones(date) from public,anon,authenticated;
grant execute on function public.fin_run_contract_milestones(date) to service_role;
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
    ('contractual_obligation_overdue', '{}'::text[],array['cooldown_days','lead_days'],'{"cooldown_days":30,"lead_days":30}'::jsonb,'review_contract','contract')
$$;
revoke all on function public.fin_opportunity_rule_catalog() from public, anon;
grant execute on function public.fin_opportunity_rule_catalog() to authenticated;

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

$$;
revoke all on function public.fin_opportunity_candidates(uuid, date) from public, anon, authenticated;


create or replace function public.fin_cancel_obligation(p_obligation uuid,p_expected integer,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare o public.fin_obligations%rowtype;v_period uuid;begin
 select id into v_period from public.fin_obligation_periods where obligation_id=p_obligation order by period_start limit 1;
 o:=public.fin_obligation_require(v_period,array['admin','finance_manager']);
 if p_expected is null or o.version<>p_expected then raise exception 'obligation conflict';end if;
 if p_reason is null or length(trim(p_reason)) not between 10 and 1000 or p_reason ~ '[<>]' then raise exception 'invalid obligation input';end if;
 update public.fin_obligations set status='cancelled',version=version+1,cancellation_reason=trim(p_reason) where id=o.id;
 update public.fin_tasks set status='cancelled' where id in(select task_id from public.fin_obligation_periods where obligation_id=o.id) and status='open';
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(o.organization_id,'contract',o.contract_id,'obligation_cancelled',auth.uid(),o.legal_entity_id,jsonb_build_object('obligation_id',o.id));
end $$;
revoke all on function public.fin_cancel_obligation(uuid,integer,text) from public,anon;
grant execute on function public.fin_cancel_obligation(uuid,integer,text) to authenticated;
create or replace function public.fin_obligation_summary(p_org uuid,p_entity uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v jsonb;begin
 if not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) or not exists(select 1 from public.fin_organizations where id=p_org and kind='BUYER') then raise exception 'forbidden';end if;
 select coalesce(jsonb_agg(s),'[]'::jsonb) into v from(select kind,facts->>'status' as status,count(*) as periods,count(*) filter(where (facts->>'has_data')::boolean) as with_data from public.fin_obligation_monitor where organization_id=p_org and (p_entity is null or legal_entity_id=p_entity) group by kind,facts->>'status')s;
 return jsonb_build_object('rows',v,'observed_at',current_date,'scope','authorized periods only','formula','count authorized periods grouped by kind and effective state; missing data does not establish compliance');
end $$;
revoke all on function public.fin_obligation_summary(uuid,uuid) from public,anon;
grant execute on function public.fin_obligation_summary(uuid,uuid) to authenticated;

insert into public.fin_settings(key,value) values('schema_version', 'financial-covenants-1') on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

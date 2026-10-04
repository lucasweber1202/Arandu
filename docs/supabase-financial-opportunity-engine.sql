-- P1.3 Opportunity Engine: deterministic, explainable work items from Arandu
-- facts. An opportunity is fact + versioned rule + source + timestamp +
-- possible action + human reviewer. Never a recommendation, never an action.
begin;

-- P0.10 jobs: the scheduled engine runs with its own lease and fencing.
alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check(job in
  ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox','retention','data_exports','offboarding','opportunities'));
alter table public.fin_job_leases drop constraint if exists fin_job_leases_job_check;
alter table public.fin_job_leases add constraint fin_job_leases_job_check check(job in
  ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox','retention','data_exports','offboarding','opportunities'));
create or replace function public.fin_job_begin(p_job text, p_request_id text, p_started_at timestamptz, p_lease_seconds integer default 90)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '1s' as $$
declare v_id uuid; v_token uuid := gen_random_uuid(); v_expires timestamptz;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  if p_job is null or p_job not in ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox','retention','data_exports','offboarding','opportunities')
    or p_request_id is null or p_request_id !~ '^[A-Za-z0-9-]{1,80}$'
    or p_started_at is null or abs(extract(epoch from clock_timestamp()-p_started_at)) > 60 then raise exception 'invalid job'; end if;
  if not pg_try_advisory_xact_lock(hashtext('fin_job_begin:'||p_job)) then return null; end if;
  if exists (select 1 from public.fin_job_leases where job=p_job and expires_at > clock_timestamp()) then return null; end if;
  update public.fin_job_runs set status='failed',failed=greatest(failed,1),error_code='lease_expired',finished_at=clock_timestamp()
    where job=p_job and status='running' and lease_expires_at <= clock_timestamp();
  v_expires := clock_timestamp() + make_interval(secs => least(greatest(coalesce(p_lease_seconds,90),30),120));
  insert into public.fin_job_runs(job,status,request_id,started_at,finished_at,lease_token,lease_expires_at)
    values(p_job,'running',p_request_id,p_started_at,null,v_token,v_expires) returning id into v_id;
  insert into public.fin_job_leases(job,run_id,lease_token,expires_at) values(p_job,v_id,v_token,v_expires)
    on conflict(job) do update set run_id=excluded.run_id,lease_token=excluded.lease_token,expires_at=excluded.expires_at;
  return jsonb_build_object('run_id',v_id,'lease_token',v_token);
end $$;
revoke all on function public.fin_job_begin(text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.fin_job_begin(text,text,timestamptz,integer) to service_role;

-- Rule catalog: keys, required/optional parameters, possible action. Financial
-- thresholds have NO default; date windows have an editable operational
-- default that the UI pre-fills and the customer stores explicitly.
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
    ('contract_without_sourcing', array['lookback_months'], array['cooldown_days'], '{"cooldown_days":30}'::jsonb, 'open_sourcing', 'contract')
$$;
revoke all on function public.fin_opportunity_rule_catalog() from public, anon;
grant execute on function public.fin_opportunity_rule_catalog() to authenticated;

create or replace function public.fin_opportunity_parameters_valid(p_key text, p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare c record; k text; v numeric;
begin
  select * into c from public.fin_opportunity_rule_catalog() x where x.rule_key = p_key;
  if c.rule_key is null or p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) j where j <> all (c.required || c.optional)) then return false; end if;
  if exists (select 1 from unnest(c.required) r where not p ? r) then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if jsonb_typeof(p->k) <> 'number' then return false; end if;
    v := (p->>k)::numeric;
    if v <> trunc(v) then return false; end if;
    if not ((k = 'lead_days' and v between 0 and 730) or (k = 'cooldown_days' and v between 0 and 365) or (k = 'min_age_days' and v between 0 and 365)
      or (k = 'grace_days' and v between 0 and 365) or (k = 'min_proposals' and v between 1 and 20) or (k = 'max_share_pct' and v between 1 and 100)
      or (k = 'max_utilization_pct' and v between 1 and 100) or (k = 'window_days' and v between 7 and 365) or (k = 'min_count' and v between 1 and 100)
      or (k = 'lookback_months' and v between 1 and 120)) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.fin_opportunity_parameters_valid(text, jsonb) from public, anon, authenticated;

create table if not exists public.fin_opportunity_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  rule_key text not null,
  version integer not null check (version > 0),
  parameters jsonb not null check (length(parameters::text) <= 2000),
  enabled boolean not null,
  effective_at timestamptz not null default now(),
  reason text not null check (length(trim(reason)) between 3 and 1000 and reason !~ '[<>]'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, rule_key, version),
  check (public.fin_opportunity_parameters_valid(rule_key, parameters))
);

create table if not exists public.fin_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  legal_entity_id uuid,
  provider_id uuid,
  opportunity_type text not null,
  status text not null default 'open' check (status in ('open','acknowledged','under_review','acted','dismissed','expired')),
  rule_id uuid not null,
  rule_version integer not null,
  rule_snapshot jsonb not null,
  facts_snapshot jsonb not null,
  current_facts jsonb not null,
  facts_hash text not null,
  source_object_type text not null check (source_object_type in ('contract','contract_milestone','facility','guarantee','passport','fee_variance','value_record','rfq','provider','organization')),
  source_object_id uuid not null,
  discriminator text not null default '' check (discriminator ~ '^[A-Z]{0,3}$'),
  fingerprint text not null,
  possible_action text not null check (possible_action in ('open_sourcing','review_contract','review_facility','review_guarantee','update_passport','review_fee','review_value','review_realization','review_policy_exceptions','contact_provider')),
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deadline date,
  reviewer_id uuid references auth.users(id),
  cooldown_until timestamptz,
  closed_facts_hash text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  resolution text check (resolution is null or (length(trim(resolution)) between 3 and 1000 and resolution !~ '[<>]')),
  dismissal_reason text check (dismissal_reason is null or dismissal_reason in ('not_relevant','already_handled','data_incorrect','accepted_risk','duplicate','other')),
  expiry_reason text check (expiry_reason is null or expiry_reason in ('deadline_passed','condition_cleared','rule_disabled','rule_superseded')),
  reopen_count integer not null default 0 check (reopen_count >= 0),
  linked_rfq_id uuid,
  unique (organization_id, id), unique (organization_id, fingerprint),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id),
  foreign key (organization_id, rule_id) references public.fin_opportunity_rules(organization_id, id),
  check ((status = 'dismissed') = (dismissal_reason is not null) or status <> 'dismissed'),
  check (status <> 'acted' or resolution is not null),
  check (status <> 'expired' or expiry_reason is not null),
  check (status <> 'under_review' or reviewer_id is not null)
);
create index if not exists fin_opportunities_scope on public.fin_opportunities(organization_id, status, deadline, legal_entity_id, provider_id, id);

create table if not exists public.fin_opportunity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  event_type text not null check (event_type in ('opened','reopened','expired','acknowledged','review_started','acted','dismissed','rfq_draft_created')),
  from_status text,
  to_status text,
  actor_id uuid references auth.users(id),
  facts jsonb,
  note text check (note is null or (length(trim(note)) between 1 and 1000 and note !~ '[<>]')),
  created_at timestamptz not null default now(),
  foreign key (organization_id, opportunity_id) references public.fin_opportunities(organization_id, id)
);
create index if not exists fin_opportunity_events_parent on public.fin_opportunity_events(opportunity_id, created_at);

-- Resumable scan cursor: the job evaluates the least recently scanned
-- organizations first, in bounded batches.
create table if not exists public.fin_opportunity_scans (
  organization_id uuid primary key references public.fin_organizations(id),
  last_scanned_at timestamptz,
  last_day date,
  last_touched integer not null default 0
);

alter table public.fin_opportunity_rules enable row level security;
alter table public.fin_opportunity_rules force row level security;
alter table public.fin_opportunities enable row level security;
alter table public.fin_opportunities force row level security;
alter table public.fin_opportunity_events enable row level security;
alter table public.fin_opportunity_events force row level security;
alter table public.fin_opportunity_scans enable row level security;
alter table public.fin_opportunity_scans force row level security;
revoke all on public.fin_opportunity_rules, public.fin_opportunities, public.fin_opportunity_events, public.fin_opportunity_scans from public, anon, authenticated;
grant select on public.fin_opportunity_rules, public.fin_opportunities, public.fin_opportunity_events to authenticated;
grant all on public.fin_opportunity_rules, public.fin_opportunities, public.fin_opportunity_events, public.fin_opportunity_scans to service_role;
drop policy if exists fin_opportunity_rule_read on public.fin_opportunity_rules;
create policy fin_opportunity_rule_read on public.fin_opportunity_rules for select to authenticated using (
  public.fin_has_role(organization_id, array['admin','finance_manager','analyst','viewer'])
  and exists (select 1 from public.fin_organizations o where o.id = organization_id and o.kind = 'BUYER'));
drop policy if exists fin_opportunity_read on public.fin_opportunities;
create policy fin_opportunity_read on public.fin_opportunities for select to authenticated using (
  public.fin_entity_allows(organization_id, legal_entity_id, array['admin','finance_manager','analyst','viewer'])
  and exists (select 1 from public.fin_organizations o where o.id = organization_id and o.kind = 'BUYER'));
drop policy if exists fin_opportunity_event_read on public.fin_opportunity_events;
create policy fin_opportunity_event_read on public.fin_opportunity_events for select to authenticated using (
  exists (select 1 from public.fin_opportunities x where x.organization_id = fin_opportunity_events.organization_id and x.id = fin_opportunity_events.opportunity_id));

drop trigger if exists fin_opportunity_rule_immutable on public.fin_opportunity_rules;
create trigger fin_opportunity_rule_immutable before update or delete on public.fin_opportunity_rules for each row execute function public.fin_immutable_row();
drop trigger if exists fin_opportunity_event_immutable on public.fin_opportunity_events;
create trigger fin_opportunity_event_immutable before update or delete on public.fin_opportunity_events for each row execute function public.fin_immutable_row();
create or replace function public.fin_opportunity_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Identity and the reason it first fired never change.
  if (new.organization_id, new.opportunity_type, new.rule_id, new.rule_version, new.rule_snapshot, new.source_object_type, new.source_object_id, new.discriminator, new.fingerprint, new.opened_at, new.legal_entity_id, new.provider_id, new.possible_action)
     is distinct from (old.organization_id, old.opportunity_type, old.rule_id, old.rule_version, old.rule_snapshot, old.source_object_type, old.source_object_id, old.discriminator, old.fingerprint, old.opened_at, old.legal_entity_id, old.provider_id, old.possible_action) then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
revoke all on function public.fin_opportunity_guard() from public, anon, authenticated;
drop trigger if exists fin_opportunity_identity on public.fin_opportunities;
create trigger fin_opportunity_identity before update on public.fin_opportunities for each row execute function public.fin_opportunity_guard();
drop trigger if exists fin_opportunity_delete on public.fin_opportunities;
create trigger fin_opportunity_delete before delete on public.fin_opportunities for each row execute function public.fin_immutable_row();

-- Customer-owned rule versions: a change is a new version; history is kept.
create or replace function public.fin_set_opportunity_rule(p_org uuid, p_key text, p_expected integer, p_input jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_current integer;
begin
  if auth.uid() is null or not public.fin_has_role(p_org, array['admin']) or not exists (select 1 from public.fin_organizations where id = p_org and kind = 'BUYER') then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  perform pg_advisory_xact_lock(hashtext('fin_opportunity_rule:' || p_org::text || ':' || coalesce(p_key, '')));
  select max(version) into v_current from public.fin_opportunity_rules where organization_id = p_org and rule_key = p_key;
  if coalesce(v_current, 0) is distinct from coalesce(p_expected, 0) then raise exception 'opportunity rule version conflict'; end if;
  if p_input is null or jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or not public.fin_opportunity_parameters_valid(p_key, p_input->'parameters')
     or length(trim(coalesce(p_input->>'reason', ''))) not between 3 and 1000 or p_input->>'reason' ~ '[<>]' then raise exception 'invalid opportunity rule'; end if;
  insert into public.fin_opportunity_rules(organization_id, rule_key, version, parameters, enabled, reason, created_by)
    values (p_org, p_key, coalesce(v_current, 0) + 1, p_input->'parameters', (p_input->>'enabled')::boolean, trim(p_input->>'reason'), auth.uid());
  insert into public.fin_opportunity_scans(organization_id) values (p_org) on conflict (organization_id) do nothing;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'organization', p_org, 'opportunity_rule_versioned', auth.uid(), jsonb_build_object('rule_key', p_key, 'version', coalesce(v_current, 0) + 1, 'enabled', (p_input->>'enabled')::boolean));
  return coalesce(v_current, 0) + 1;
end $$;
revoke all on function public.fin_set_opportunity_rule(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.fin_set_opportunity_rule(uuid, text, integer, jsonb) to authenticated;

-- Deterministic candidates: (rule, source, facts, material facts). Each branch
-- only reads data that exists in the schema; no inferred values.
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
$$;
revoke all on function public.fin_opportunity_candidates(uuid, date) from public, anon, authenticated;

-- Evaluation for one organization: dedupe by fingerprint, last_seen_at on
-- repeat, reopen only after cooldown or a material change, expire what no
-- longer holds. Restricted to p_types when called incrementally.
create or replace function public.fin_evaluate_opportunities(p_org uuid, p_day date, p_types text[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; o public.fin_opportunities%rowtype; v_fp text; v_hash text; v_touched integer := 0; v_seen uuid[] := '{}'; v_action text; v_active text[];
begin
  if p_org is null or p_day is null then raise exception 'invalid opportunity evaluation'; end if;
  if public.fin_governance_org_locked(p_org) then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('fin_opportunity_eval:' || p_org::text));
  select array_agg(x.rule_key) into v_active from (select distinct on (r.rule_key) r.rule_key, r.enabled from public.fin_opportunity_rules r
    where r.organization_id = p_org and r.effective_at <= now() order by r.rule_key, r.version desc) x where x.enabled;
  for c in select * from public.fin_opportunity_candidates(p_org, p_day) k where p_types is null or k.rule_key = any(p_types) loop
    v_fp := md5(concat_ws('|', p_org, coalesce(c.legal_entity_id::text, 'group'), c.rule_key, c.source_type, c.source_id, c.discriminator, c.rule_version));
    v_hash := md5(c.material::text);
    select possible_action into v_action from public.fin_opportunity_rule_catalog() k where k.rule_key = c.rule_key;
    select * into o from public.fin_opportunities where organization_id = p_org and fingerprint = v_fp for update;
    if o.id is null then
      insert into public.fin_opportunities(organization_id, legal_entity_id, provider_id, opportunity_type, rule_id, rule_version, rule_snapshot, facts_snapshot, current_facts, facts_hash,
        source_object_type, source_object_id, discriminator, fingerprint, possible_action, deadline)
      values (p_org, c.legal_entity_id, c.provider_id, c.rule_key, c.rule_id, c.rule_version, jsonb_build_object('rule_key', c.rule_key, 'version', c.rule_version, 'parameters', c.parameters),
        c.facts, c.facts, v_hash, c.source_type, c.source_id, c.discriminator, v_fp, v_action, c.deadline) returning * into o;
      insert into public.fin_opportunity_events(organization_id, opportunity_id, event_type, to_status, facts) values (p_org, o.id, 'opened', 'open', c.facts);
      v_touched := v_touched + 1;
    elsif o.status in ('open','acknowledged','under_review') then
      update public.fin_opportunities set last_seen_at = clock_timestamp(), current_facts = c.facts, deadline = c.deadline where id = o.id;
    elsif (o.cooldown_until is null or o.cooldown_until <= now()) or v_hash is distinct from o.closed_facts_hash then
      update public.fin_opportunities set status = 'open', facts_snapshot = c.facts, current_facts = c.facts, facts_hash = v_hash, last_seen_at = clock_timestamp(), deadline = c.deadline,
        reopen_count = reopen_count + 1, closed_at = null, closed_by = null, resolution = null, dismissal_reason = null, expiry_reason = null, reviewer_id = null, cooldown_until = null
      where id = o.id;
      insert into public.fin_opportunity_events(organization_id, opportunity_id, event_type, from_status, to_status, facts, note)
        values (p_org, o.id, 'reopened', o.status, 'open', c.facts, case when v_hash is distinct from o.closed_facts_hash then 'material facts changed' else 'cooldown expired' end);
      v_touched := v_touched + 1;
    else
      update public.fin_opportunities set last_seen_at = clock_timestamp(), current_facts = c.facts where id = o.id;
    end if;
    v_seen := v_seen || o.id;
  end loop;
  -- Whatever is still active but no longer produced expires with its reason.
  for o in select * from public.fin_opportunities x where x.organization_id = p_org and x.status in ('open','acknowledged','under_review')
      and (p_types is null or x.opportunity_type = any(p_types)) and not (x.id = any(v_seen)) for update loop
    update public.fin_opportunities set status = 'expired', closed_at = now(), closed_by = null, closed_facts_hash = facts_hash, cooldown_until = now(),
      expiry_reason = case when not (o.opportunity_type = any(coalesce(v_active, '{}'))) then 'rule_disabled'
        when exists (select 1 from public.fin_opportunity_rules r where r.organization_id = p_org and r.rule_key = o.opportunity_type and r.version > o.rule_version) then 'rule_superseded'
        when o.deadline is not null and o.deadline < p_day then 'deadline_passed' else 'condition_cleared' end
    where id = o.id;
    insert into public.fin_opportunity_events(organization_id, opportunity_id, event_type, from_status, to_status)
      values (p_org, o.id, 'expired', o.status, 'expired');
    v_touched := v_touched + 1;
  end loop;
  return v_touched;
end $$;
revoke all on function public.fin_evaluate_opportunities(uuid, date, text[]) from public, anon, authenticated;

-- Scheduled job (service role): bounded batch of organizations, least
-- recently scanned first; a failed run is retried by the next one.
create or replace function public.fin_run_opportunity_engine(p_day date default current_date, p_org_limit integer default 50)
returns integer language plpgsql security definer set search_path = '' as $$
declare s record; v_total integer := 0; v_n integer;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  if p_day is null or p_org_limit is null or p_org_limit not between 1 and 500 then raise exception 'invalid opportunity evaluation'; end if;
  insert into public.fin_opportunity_scans(organization_id) select distinct r.organization_id from public.fin_opportunity_rules r on conflict (organization_id) do nothing;
  for s in select x.organization_id from public.fin_opportunity_scans x join public.fin_organizations o on o.id = x.organization_id and o.kind = 'BUYER'
      order by x.last_scanned_at nulls first, x.organization_id limit p_org_limit for update of x skip locked loop
    v_n := public.fin_evaluate_opportunities(s.organization_id, p_day, null);
    update public.fin_opportunity_scans set last_scanned_at = now(), last_day = p_day, last_touched = v_n where organization_id = s.organization_id;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end $$;
revoke all on function public.fin_run_opportunity_engine(date, integer) from public, anon, authenticated;
grant execute on function public.fin_run_opportunity_engine(date, integer) to service_role;

-- Event-driven: a new or re-reviewed fee variance updates its opportunities
-- immediately, without a full scan.
create or replace function public.fin_opportunity_fee_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.fin_opportunity_rules r where r.organization_id = new.organization_id and r.rule_key in ('fee_variance_review','fee_resolution_value_review')) then
    perform public.fin_evaluate_opportunities(new.organization_id, current_date, array['fee_variance_review','fee_resolution_value_review']);
  end if;
  return null;
end $$;
revoke all on function public.fin_opportunity_fee_event() from public, anon, authenticated;
drop trigger if exists fin_opportunity_fee_event on public.fin_fee_variances;
create trigger fin_opportunity_fee_event after insert or update of review_status on public.fin_fee_variances for each row execute function public.fin_opportunity_fee_event();

-- Human state machine. The engine only opens, reopens and expires.
create or replace function public.fin_transition_opportunity(p_id uuid, p_expected text, p_input jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare o public.fin_opportunities%rowtype; v_to text := p_input->>'to_status'; v_reviewer uuid; v_cooldown integer;
begin
  select * into o from public.fin_opportunities where id = p_id for update;
  if o.id is null or auth.uid() is null or not public.fin_entity_allows(o.organization_id, o.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(o.organization_id) then raise exception 'organization offboarding'; end if;
  if p_expected is distinct from o.status then raise exception 'opportunity state conflict'; end if;
  if not ((o.status = 'open' and v_to in ('acknowledged','under_review','dismissed'))
       or (o.status = 'acknowledged' and v_to in ('under_review','acted','dismissed'))
       or (o.status = 'under_review' and v_to in ('acted','dismissed'))) then raise exception 'invalid opportunity transition'; end if;
  -- Under review, only the assigned reviewer or an admin closes it.
  if o.status = 'under_review' and auth.uid() is distinct from o.reviewer_id and not public.fin_has_role(o.organization_id, array['admin']) then raise exception 'invalid opportunity reviewer'; end if;
  if v_to = 'under_review' then
    v_reviewer := coalesce(nullif(p_input->>'reviewer_id', '')::uuid, auth.uid());
    -- The reviewer must be able to act on the opportunity's entity scope.
    if not exists (select 1 from public.fin_members m where m.organization_id = o.organization_id and m.user_id = v_reviewer and m.role in ('admin','finance_manager')
         and (m.entity_scope = 'group' or (o.legal_entity_id is not null and exists (select 1 from public.fin_legal_entities e
           join public.fin_member_entity_grants g on g.organization_id = e.organization_id and g.user_id = m.user_id and (g.entity_id = e.id or g.entity_id = e.parent_id)
           where e.organization_id = o.organization_id and e.id = o.legal_entity_id)))) then raise exception 'invalid opportunity reviewer'; end if;
  end if;
  if (v_to = 'dismissed' and (p_input->>'dismissal_reason' is null or p_input->>'dismissal_reason' not in ('not_relevant','already_handled','data_incorrect','accepted_risk','duplicate','other')))
     or (v_to = 'acted' and length(trim(coalesce(p_input->>'resolution', ''))) not between 3 and 1000)
     or (p_input ? 'note' and (length(trim(coalesce(p_input->>'note', ''))) not between 1 and 1000 or p_input->>'note' ~ '[<>]')) then raise exception 'invalid opportunity transition'; end if;
  v_cooldown := coalesce((o.rule_snapshot->'parameters'->>'cooldown_days')::int, 0);
  begin
    update public.fin_opportunities set status = v_to,
      reviewer_id = case when v_to = 'under_review' then v_reviewer else reviewer_id end,
      resolution = case when v_to = 'acted' then trim(p_input->>'resolution') else resolution end,
      dismissal_reason = case when v_to = 'dismissed' then p_input->>'dismissal_reason' else dismissal_reason end,
      closed_at = case when v_to in ('acted','dismissed') then now() end, closed_by = case when v_to in ('acted','dismissed') then auth.uid() end,
      closed_facts_hash = case when v_to in ('acted','dismissed') then facts_hash end,
      cooldown_until = case when v_to in ('acted','dismissed') then now() + make_interval(days => v_cooldown) end
    where id = o.id;
  exception when check_violation then raise exception 'invalid opportunity transition';
  end;
  insert into public.fin_opportunity_events(organization_id, opportunity_id, event_type, from_status, to_status, actor_id, note)
    values (o.organization_id, o.id, case v_to when 'acknowledged' then 'acknowledged' when 'under_review' then 'review_started' when 'acted' then 'acted' else 'dismissed' end,
      o.status, v_to, auth.uid(), nullif(trim(coalesce(p_input->>'note', p_input->>'resolution', '')), ''));
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (o.organization_id, 'opportunity', o.id, 'opportunity_' || v_to, auth.uid(), jsonb_build_object('type', o.opportunity_type, 'from', o.status, 'rule_version', o.rule_version));
  return v_to;
end $$;
revoke all on function public.fin_transition_opportunity(uuid, text, jsonb) from public, anon;
grant execute on function public.fin_transition_opportunity(uuid, text, jsonb) to authenticated;

-- Opportunity → RFQ draft, only after an explicit human confirmation and only
-- for contract-sourced opportunities. Nothing is sent to providers.
create or replace function public.fin_opportunity_start_rfq(p_id uuid, p_confirmed boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.fin_opportunities%rowtype; v_contract uuid; v_rfq uuid;
begin
  select * into o from public.fin_opportunities where id = p_id for update;
  if o.id is null or auth.uid() is null or not public.fin_entity_allows(o.organization_id, o.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(o.organization_id) then raise exception 'organization offboarding'; end if;
  if p_confirmed is not true then raise exception 'opportunity rfq requires confirmation'; end if;
  if o.status not in ('open','acknowledged','under_review') or o.linked_rfq_id is not null then raise exception 'opportunity rfq unavailable'; end if;
  v_contract := case when o.source_object_type = 'contract' then o.source_object_id
    when o.source_object_type = 'contract_milestone' then (select m.contract_id from public.fin_contract_milestones m where m.id = o.source_object_id) end;
  if v_contract is null then raise exception 'opportunity rfq unavailable'; end if;
  v_rfq := public.fin_start_contract_rfq(v_contract);
  update public.fin_opportunities set linked_rfq_id = v_rfq where id = o.id;
  insert into public.fin_opportunity_events(organization_id, opportunity_id, event_type, from_status, to_status, actor_id, note)
    values (o.organization_id, o.id, 'rfq_draft_created', o.status, o.status, auth.uid(), 'RFQ draft ' || v_rfq::text);
  return v_rfq;
end $$;
revoke all on function public.fin_opportunity_start_rfq(uuid, boolean) from public, anon;
grant execute on function public.fin_opportunity_start_rfq(uuid, boolean) to authenticated;

create or replace function public.fin_list_opportunities(p_org uuid, p_entity uuid default null, p_type text default null, p_provider uuid default null,
  p_status text default null, p_due_before date default null, p_source text default null, p_after uuid default null, p_limit integer default 25)
returns setof public.fin_opportunities language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_org is null or auth.uid() is null or not public.fin_has_role(p_org, array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid opportunity filters'; end if;
  return query select x.* from public.fin_opportunities x where x.organization_id = p_org
    and (p_entity is null or x.legal_entity_id = p_entity) and (p_type is null or x.opportunity_type = p_type) and (p_provider is null or x.provider_id = p_provider)
    and (p_status is null or x.status = p_status) and (p_due_before is null or x.deadline <= p_due_before) and (p_source is null or x.source_object_type = p_source)
    and (p_after is null or x.id > p_after) order by x.id limit p_limit + 1;
end $$;
revoke all on function public.fin_list_opportunities(uuid, uuid, text, uuid, text, date, text, uuid, integer) from public, anon;
grant execute on function public.fin_list_opportunities(uuid, uuid, text, uuid, text, date, text, uuid, integer) to authenticated;

create or replace function public.fin_opportunity_summary(p_org uuid, p_entity uuid default null, p_provider uuid default null, p_day date default current_date)
returns table(status text, opportunities bigint, due_30 bigint, overdue bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_org is null or auth.uid() is null or not public.fin_has_role(p_org, array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
  return query select x.status, count(*), count(*) filter (where x.deadline between p_day and p_day + 30), count(*) filter (where x.deadline < p_day)
    from public.fin_opportunities x where x.organization_id = p_org and (p_entity is null or x.legal_entity_id = p_entity) and (p_provider is null or x.provider_id = p_provider)
    group by x.status order by x.status;
end $$;
revoke all on function public.fin_opportunity_summary(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.fin_opportunity_summary(uuid, uuid, uuid, date) to authenticated;

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
    ('opportunity_events', 'select * from public.fin_opportunity_events where organization_id = $1');
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
 or p_kind is not null and p_kind not in ('organization','entity','provider','relationship','rfq','proposal','decision','contract','facility','limit','guarantee','passport_snapshot','milestone','obligation','document','owner','value_realization','fee_schedule','fee_observation','fee_variance','fee_review','opportunity')
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

insert into public.fin_settings(key,value) values ('schema_version', 'financial-opportunity-engine-1') on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

-- P1.2 Bank Fee Intelligence: contracted fee reference vs observed charge.
-- Factual comparison only: no automatic accusation, no savings, no payment,
-- no integration ingestion. Every comparison is persisted as a snapshot.
begin;

create table if not exists public.fin_fee_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  contract_id uuid not null,
  legal_entity_id uuid,
  provider_id uuid not null,
  service text not null check (length(trim(service)) between 2 and 120 and service !~ '[<>]'),
  service_key text generated always as (lower(btrim(service))) stored,
  category text not null check (category in ('account_maintenance','payments','collections','transfers','cards','acquiring','credit','fx','cash_management','guarantee','other')),
  charging_unit text not null check (charging_unit in ('per_month','per_year','one_off','per_transaction','per_item','percent_of_volume','percent_of_amount')),
  owner_id uuid not null references auth.users(id),
  current_version integer not null default 0 check (current_version >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, id, contract_id),
  unique (contract_id, service_key, charging_unit),
  foreign key (organization_id, contract_id) references public.fin_contracts(organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id)
);
create index if not exists fin_fee_schedules_scope on public.fin_fee_schedules(organization_id, provider_id, legal_entity_id, category);

-- Versions are immutable. A contract change creates a new version with its own
-- effective date; history is never overwritten.
create table if not exists public.fin_fee_schedule_versions (
  schedule_id uuid not null,
  organization_id uuid not null,
  contract_id uuid not null,
  version integer not null check (version > 0),
  contract_version integer not null,
  effective_from date not null,
  pricing_model text not null check (pricing_model in ('fixed_amount','per_unit','percentage','basis_points','tiered_per_unit')),
  currency text not null check (currency in ('BRL','USD','EUR','GBP','CHF','JPY','CAD','AUD','CNY','MXN','ARS','CLP','COP','PEN')),
  rate numeric(24,6) check (rate is null or rate between 0 and 1000000000000),
  tiers jsonb,
  minimum_amount numeric(20,2) check (minimum_amount is null or minimum_amount between 0 and 1000000000000),
  maximum_amount numeric(20,2) check (maximum_amount is null or maximum_amount between 0 and 1000000000000),
  source text not null check (source in ('contract_terms','contract_document','amendment','declared')),
  source_reference text not null check (length(trim(source_reference)) between 3 and 200 and source_reference !~ '[<>]'),
  reason text check (reason is null or (length(trim(reason)) between 3 and 1000 and reason !~ '[<>]')),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  primary key (schedule_id, version),
  foreign key (organization_id, schedule_id, contract_id) references public.fin_fee_schedules(organization_id, id, contract_id),
  foreign key (contract_id, contract_version) references public.fin_contract_versions(contract_id, version),
  check ((pricing_model = 'tiered_per_unit') = (tiers is not null)),
  check ((pricing_model = 'tiered_per_unit') = (rate is null)),
  check (minimum_amount is null or maximum_amount is null or minimum_amount <= maximum_amount),
  check (version = 1 or reason is not null)
);

-- Observed charge. Human-entered from a declared origin; there is no automatic
-- ingestion channel yet (ingestion_channel documents that explicitly).
create table if not exists public.fin_fee_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  contract_id uuid not null,
  legal_entity_id uuid,
  provider_id uuid not null,
  service text not null check (length(trim(service)) between 2 and 120 and service !~ '[<>]'),
  service_key text generated always as (lower(btrim(service))) stored,
  charging_unit text not null check (charging_unit in ('per_month','per_year','one_off','per_transaction','per_item','percent_of_volume','percent_of_amount')),
  currency text not null check (currency in ('BRL','USD','EUR','GBP','CHF','JPY','CAD','AUD','CNY','MXN','ARS','CLP','COP','PEN')),
  period_start date not null,
  period_end date not null,
  volume numeric(24,6) check (volume is null or volume between 0 and 1000000000000),
  base_amount numeric(20,2) check (base_amount is null or base_amount between 0 and 1000000000000),
  observed_amount numeric(20,2) not null check (observed_amount between 0 and 1000000000000),
  source_type text not null check (source_type in ('manual','bank_statement','erp','tms','bank_file','api','confirmed_document_extraction','other_import')),
  ingestion_channel text not null default 'manual_entry' check (ingestion_channel in ('manual_entry')),
  source_reference text not null check (length(trim(source_reference)) between 3 and 200 and source_reference !~ '[<>]'),
  source_object_id text check (source_object_id is null or (length(trim(source_object_id)) between 1 and 200 and source_object_id !~ '[<>]')),
  evidence_reference text not null check (length(trim(evidence_reference)) between 3 and 200 and evidence_reference !~ '[<>]'),
  owner_id uuid not null references auth.users(id),
  ingested_at timestamptz not null default now(),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified','rejected')),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  verification_reason text check (verification_reason is null or (length(trim(verification_reason)) between 3 and 1000 and verification_reason !~ '[<>]')),
  dedupe_key text not null,
  unique (organization_id, id), unique (organization_id, dedupe_key),
  foreign key (organization_id, contract_id) references public.fin_contracts(organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id),
  check (period_end >= period_start and period_end - period_start <= 366),
  check ((verification_status = 'unverified') = (verified_by is null and verified_at is null and verification_reason is null))
);
create index if not exists fin_fee_observations_scope on public.fin_fee_observations(organization_id, period_start, provider_id, legal_entity_id);

-- Comparison snapshot: reproducible without recalculating against mutable data.
create table if not exists public.fin_fee_variances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  observation_id uuid not null unique,
  schedule_id uuid,
  schedule_version integer,
  contract_id uuid not null,
  contract_version integer,
  legal_entity_id uuid,
  provider_id uuid not null,
  category text,
  service text not null,
  currency text not null,
  period_start date not null,
  period_end date not null,
  comparison_status text not null check (comparison_status in ('comparable','not_comparable','missing_reference')),
  reasons text[] not null default '{}',
  contracted_amount numeric(20,2),
  observed_amount numeric(20,2) not null,
  variance_amount numeric(20,2),
  direction text check (direction in ('above','below','equal')),
  methodology jsonb not null,
  reference_snapshot jsonb,
  review_status text not null check (review_status in ('not_required','new','under_review','confirmed','explained','dismissed','resolved')),
  reviewer_id uuid references auth.users(id),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, observation_id) references public.fin_fee_observations(organization_id, id),
  foreign key (organization_id, schedule_id) references public.fin_fee_schedules(organization_id, id),
  foreign key (schedule_id, schedule_version) references public.fin_fee_schedule_versions(schedule_id, version),
  foreign key (organization_id, contract_id) references public.fin_contracts(organization_id, id),
  check ((comparison_status = 'comparable') = (contracted_amount is not null)),
  check ((comparison_status = 'comparable') = (variance_amount is not null)),
  check ((comparison_status = 'comparable') = (direction is not null)),
  check (comparison_status <> 'missing_reference' or schedule_id is null),
  check (comparison_status = 'comparable' or cardinality(reasons) > 0),
  check ((review_status = 'not_required') = (direction is not distinct from 'equal'))
);
create index if not exists fin_fee_variances_scope on public.fin_fee_variances(organization_id, period_start, provider_id, legal_entity_id, review_status, id);

create table if not exists public.fin_fee_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  variance_id uuid not null,
  from_status text not null,
  to_status text not null check (to_status in ('under_review','confirmed','explained','dismissed','resolved')),
  reason_code text not null check (reason_code in ('review_started','contract_terms_confirmed','pricing_exception_agreed','volume_or_base_corrected','timing_difference','reference_outdated','data_entry_error','duplicate_or_superseded','provider_contacted','credit_received','other')),
  notes text not null check (length(trim(notes)) between 3 and 2000 and notes !~ '[<>]'),
  evidence_reference text check (evidence_reference is null or (length(trim(evidence_reference)) between 3 and 200 and evidence_reference !~ '[<>]')),
  resolution text check (resolution is null or (length(trim(resolution)) between 3 and 1000 and resolution !~ '[<>]')),
  reviewer_id uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  foreign key (organization_id, variance_id) references public.fin_fee_variances(organization_id, id),
  check (to_status <> 'resolved' or resolution is not null),
  check (to_status not in ('confirmed','explained','resolved') or evidence_reference is not null)
);
create index if not exists fin_fee_reviews_variance on public.fin_fee_reviews(variance_id, reviewed_at);

alter table public.fin_fee_schedules enable row level security;
alter table public.fin_fee_schedules force row level security;
alter table public.fin_fee_schedule_versions enable row level security;
alter table public.fin_fee_schedule_versions force row level security;
alter table public.fin_fee_observations enable row level security;
alter table public.fin_fee_observations force row level security;
alter table public.fin_fee_variances enable row level security;
alter table public.fin_fee_variances force row level security;
alter table public.fin_fee_reviews enable row level security;
alter table public.fin_fee_reviews force row level security;
revoke all on public.fin_fee_schedules, public.fin_fee_schedule_versions, public.fin_fee_observations, public.fin_fee_variances, public.fin_fee_reviews from public, anon, authenticated;
grant select on public.fin_fee_schedules, public.fin_fee_schedule_versions, public.fin_fee_observations, public.fin_fee_variances, public.fin_fee_reviews to authenticated;
grant all on public.fin_fee_schedules, public.fin_fee_schedule_versions, public.fin_fee_observations, public.fin_fee_variances, public.fin_fee_reviews to service_role;

-- Reading requires the entity scope AND the contract to be readable now, so a
-- contract moved to an inaccessible entity hides its fee facts too.
drop policy if exists fin_fee_schedule_read on public.fin_fee_schedules;
create policy fin_fee_schedule_read on public.fin_fee_schedules for select to authenticated using (
  public.fin_entity_allows(organization_id, legal_entity_id, array['admin','finance_manager','analyst','viewer'])
  and exists (select 1 from public.fin_contracts c where c.organization_id = fin_fee_schedules.organization_id and c.id = fin_fee_schedules.contract_id)
  and exists (select 1 from public.fin_organizations o where o.id = organization_id and o.kind = 'BUYER'));
drop policy if exists fin_fee_version_read on public.fin_fee_schedule_versions;
create policy fin_fee_version_read on public.fin_fee_schedule_versions for select to authenticated using (
  exists (select 1 from public.fin_fee_schedules s where s.organization_id = fin_fee_schedule_versions.organization_id and s.id = fin_fee_schedule_versions.schedule_id));
drop policy if exists fin_fee_observation_read on public.fin_fee_observations;
create policy fin_fee_observation_read on public.fin_fee_observations for select to authenticated using (
  public.fin_entity_allows(organization_id, legal_entity_id, array['admin','finance_manager','analyst','viewer'])
  and exists (select 1 from public.fin_contracts c where c.organization_id = fin_fee_observations.organization_id and c.id = fin_fee_observations.contract_id)
  and exists (select 1 from public.fin_organizations o where o.id = organization_id and o.kind = 'BUYER'));
drop policy if exists fin_fee_variance_read on public.fin_fee_variances;
create policy fin_fee_variance_read on public.fin_fee_variances for select to authenticated using (
  exists (select 1 from public.fin_fee_observations x where x.organization_id = fin_fee_variances.organization_id and x.id = fin_fee_variances.observation_id));
drop policy if exists fin_fee_review_read on public.fin_fee_reviews;
create policy fin_fee_review_read on public.fin_fee_reviews for select to authenticated using (
  exists (select 1 from public.fin_fee_variances v where v.organization_id = fin_fee_reviews.organization_id and v.id = fin_fee_reviews.variance_id));

-- Immutability: versions and reviews never change; observations only receive
-- their single human verification; variances only move their review state.
create or replace function public.fin_fee_schedule_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- service_key is a stored generated column: not yet computed in NEW here.
  if (to_jsonb(new) - array['current_version','service_key']) is distinct from (to_jsonb(old) - array['current_version','service_key']) or new.current_version <> old.current_version + 1 then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
create or replace function public.fin_fee_observation_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['verification_status','verified_by','verified_at','verification_reason','service_key'])
      is distinct from (to_jsonb(old) - array['verification_status','verified_by','verified_at','verification_reason','service_key'])
     or old.verification_status <> 'unverified' or new.verification_status = 'unverified' then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
create or replace function public.fin_fee_variance_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['review_status','reviewer_id','last_reviewed_at'])
      is distinct from (to_jsonb(old) - array['review_status','reviewer_id','last_reviewed_at']) then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
revoke all on function public.fin_fee_schedule_guard(), public.fin_fee_observation_guard(), public.fin_fee_variance_guard() from public, anon, authenticated;
drop trigger if exists fin_fee_schedule_immutable on public.fin_fee_schedules;
create trigger fin_fee_schedule_immutable before update on public.fin_fee_schedules for each row execute function public.fin_fee_schedule_guard();
drop trigger if exists fin_fee_schedule_delete on public.fin_fee_schedules;
create trigger fin_fee_schedule_delete before delete on public.fin_fee_schedules for each row execute function public.fin_immutable_row();
drop trigger if exists fin_fee_version_immutable on public.fin_fee_schedule_versions;
create trigger fin_fee_version_immutable before update or delete on public.fin_fee_schedule_versions for each row execute function public.fin_immutable_row();
drop trigger if exists fin_fee_observation_immutable on public.fin_fee_observations;
create trigger fin_fee_observation_immutable before update on public.fin_fee_observations for each row execute function public.fin_fee_observation_guard();
drop trigger if exists fin_fee_observation_delete on public.fin_fee_observations;
create trigger fin_fee_observation_delete before delete on public.fin_fee_observations for each row execute function public.fin_immutable_row();
drop trigger if exists fin_fee_variance_immutable on public.fin_fee_variances;
create trigger fin_fee_variance_immutable before update on public.fin_fee_variances for each row execute function public.fin_fee_variance_guard();
drop trigger if exists fin_fee_variance_delete on public.fin_fee_variances;
create trigger fin_fee_variance_delete before delete on public.fin_fee_variances for each row execute function public.fin_immutable_row();
drop trigger if exists fin_fee_review_immutable on public.fin_fee_reviews;
create trigger fin_fee_review_immutable before update or delete on public.fin_fee_reviews for each row execute function public.fin_immutable_row();

-- Shared shape checks for a contracted fee version (create and new version).
create or replace function public.fin_fee_version_valid(p_unit text, p_input jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_model text := p_input->>'pricing_model'; v_tiers jsonb := p_input->'tiers'; t jsonb; v_prev numeric := 0; v_count integer := 0; v_open boolean := false; v_rate numeric;
begin
  if v_model is null or v_model not in ('fixed_amount','per_unit','percentage','basis_points','tiered_per_unit') then return false; end if;
  if (v_model = 'fixed_amount' and p_unit not in ('per_month','per_year','one_off'))
     or (v_model in ('per_unit','tiered_per_unit') and p_unit not in ('per_transaction','per_item'))
     or (v_model in ('percentage','basis_points') and p_unit not in ('percent_of_volume','percent_of_amount')) then return false; end if;
  if exists (select 1 from jsonb_object_keys(p_input) k where k not in ('pricing_model','currency','rate','tiers','minimum_amount','maximum_amount','effective_from','contract_version','source','source_reference','reason','service','category','charging_unit')) then return false; end if;
  if p_input ? 'contract_version' and jsonb_typeof(p_input->'contract_version') <> 'number' then return false; end if;
  if p_input ? 'contract_version' then perform (p_input->>'contract_version')::integer; end if;
  if p_input ? 'effective_from' then perform (p_input->>'effective_from')::date; end if;
  if p_input ? 'minimum_amount' and jsonb_typeof(p_input->'minimum_amount') not in ('number','null') then return false; end if;
  if p_input ? 'maximum_amount' and jsonb_typeof(p_input->'maximum_amount') not in ('number','null') then return false; end if;
  if (p_input->>'minimum_amount')::numeric <> round((p_input->>'minimum_amount')::numeric, 2) or (p_input->>'maximum_amount')::numeric <> round((p_input->>'maximum_amount')::numeric, 2) then return false; end if;
  if v_model = 'tiered_per_unit' then
    if p_input ? 'rate' and p_input->'rate' <> 'null'::jsonb then return false; end if;
    if jsonb_typeof(v_tiers) is distinct from 'array' or jsonb_array_length(v_tiers) not between 2 and 10 then return false; end if;
    for t in select value from jsonb_array_elements(v_tiers) loop
      v_count := v_count + 1;
      if jsonb_typeof(t) <> 'object' or exists (select 1 from jsonb_object_keys(t) k where k not in ('up_to','rate')) or jsonb_typeof(t->'rate') <> 'number' then return false; end if;
      v_rate := (t->>'rate')::numeric;
      if v_rate < 0 or v_rate > 1000000000000 or v_rate <> round(v_rate, 6) or v_open then return false; end if;
      if t->'up_to' is null or t->'up_to' = 'null'::jsonb then
        if v_count <> jsonb_array_length(v_tiers) then return false; end if;
        v_open := true;
      elsif jsonb_typeof(t->'up_to') <> 'number' or (t->>'up_to')::numeric <= v_prev or (t->>'up_to')::numeric <> trunc((t->>'up_to')::numeric) then return false;
      else v_prev := (t->>'up_to')::numeric;
      end if;
    end loop;
    return v_open;
  end if;
  if p_input ? 'tiers' and p_input->'tiers' <> 'null'::jsonb then return false; end if;
  if jsonb_typeof(p_input->'rate') is distinct from 'number' then return false; end if;
  v_rate := (p_input->>'rate')::numeric;
  return v_rate >= 0 and v_rate <= 1000000000000 and v_rate = round(v_rate, 6)
    and (v_model <> 'percentage' or v_rate <= 100) and (v_model <> 'basis_points' or v_rate <= 10000);
exception when others then return false;
end $$;
revoke all on function public.fin_fee_version_valid(text, jsonb) from public, anon, authenticated;

create or replace function public.fin_insert_fee_version(s public.fin_fee_schedules, p_input jsonb, p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare cv public.fin_contract_versions%rowtype; v_effective date; v_last date;
begin
  if not public.fin_fee_version_valid(s.charging_unit, p_input) then raise exception 'invalid fee schedule'; end if;
  if p_input->>'currency' is null or p_input->>'currency' not in ('BRL','USD','EUR','GBP','CHF','JPY','CAD','AUD','CNY','MXN','ARS','CLP','COP','PEN') then raise exception 'invalid fee schedule'; end if;
  if p_input->>'source' is null or p_input->>'source' not in ('contract_terms','contract_document','amendment','declared')
     or length(trim(coalesce(p_input->>'source_reference', ''))) not between 3 and 200 or p_input->>'source_reference' ~ '[<>]' then raise exception 'invalid fee schedule'; end if;
  select * into cv from public.fin_contract_versions where contract_id = s.contract_id and organization_id = s.organization_id
    and version = coalesce((p_input->>'contract_version')::integer, (select current_version from public.fin_contracts where id = s.contract_id));
  if cv.contract_id is null then raise exception 'fee contract version unavailable'; end if;
  v_effective := coalesce((p_input->>'effective_from')::date, cv.effective_from);
  select max(effective_from) into v_last from public.fin_fee_schedule_versions where schedule_id = s.id;
  if v_last is not null and v_effective < v_last then raise exception 'fee schedule effective date regression'; end if;
  if p_version > 1 and length(trim(coalesce(p_input->>'reason', ''))) not between 3 and 1000 then raise exception 'fee schedule reason required'; end if;
  insert into public.fin_fee_schedule_versions(schedule_id, organization_id, contract_id, version, contract_version, effective_from, pricing_model, currency, rate, tiers, minimum_amount, maximum_amount, source, source_reference, reason, recorded_by)
  values (s.id, s.organization_id, s.contract_id, p_version, cv.version, v_effective, p_input->>'pricing_model', p_input->>'currency',
    case when p_input->>'pricing_model' <> 'tiered_per_unit' then (p_input->>'rate')::numeric end,
    case when p_input->>'pricing_model' = 'tiered_per_unit' then p_input->'tiers' end,
    (p_input->>'minimum_amount')::numeric, (p_input->>'maximum_amount')::numeric,
    p_input->>'source', trim(p_input->>'source_reference'), nullif(trim(coalesce(p_input->>'reason', '')), ''), auth.uid());
  update public.fin_fee_schedules set current_version = p_version where id = s.id;
end $$;
revoke all on function public.fin_insert_fee_version(public.fin_fee_schedules, jsonb, integer) from public, anon, authenticated;

create or replace function public.fin_create_fee_schedule(p_org uuid, p_contract uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.fin_contracts%rowtype; s public.fin_fee_schedules%rowtype;
begin
  select * into c from public.fin_contracts where organization_id = p_org and id = p_contract for share;
  if c.id is null or auth.uid() is null or not public.fin_entity_allows(p_org, c.legal_entity_id, array['admin','finance_manager'])
     or not exists (select 1 from public.fin_organizations where id = p_org and kind = 'BUYER') then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or length(p_input::text) > 6000 then raise exception 'invalid fee schedule'; end if;
  if exists (select 1 from public.fin_fee_schedules where contract_id = c.id and service_key = lower(btrim(coalesce(p_input->>'service', ''))) and charging_unit = p_input->>'charging_unit') then
    raise exception 'fee schedule already exists';
  end if;
  begin
    insert into public.fin_fee_schedules(organization_id, contract_id, legal_entity_id, provider_id, service, category, charging_unit, owner_id)
    values (p_org, c.id, c.legal_entity_id, c.provider_id, trim(p_input->>'service'), p_input->>'category', p_input->>'charging_unit', auth.uid())
    returning * into s;
  exception when check_violation or not_null_violation then raise exception 'invalid fee schedule';
  end;
  perform public.fin_insert_fee_version(s, p_input, 1);
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'contract', c.id, 'fee_schedule_created', auth.uid(), jsonb_build_object('schedule_id', s.id, 'version', 1, 'category', s.category));
  return s.id;
end $$;
revoke all on function public.fin_create_fee_schedule(uuid, uuid, jsonb) from public, anon;
grant execute on function public.fin_create_fee_schedule(uuid, uuid, jsonb) to authenticated;

create or replace function public.fin_version_fee_schedule(p_schedule uuid, p_expected integer, p_input jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.fin_fee_schedules%rowtype;
begin
  select * into s from public.fin_fee_schedules where id = p_schedule for update;
  if s.id is null or auth.uid() is null or not public.fin_entity_allows(s.organization_id, s.legal_entity_id, array['admin','finance_manager'])
     or not exists (select 1 from public.fin_contracts c where c.organization_id = s.organization_id and c.id = s.contract_id and public.fin_entity_allows(c.organization_id, c.legal_entity_id, array['admin','finance_manager'])) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(s.organization_id) then raise exception 'organization offboarding'; end if;
  if p_expected is distinct from s.current_version then raise exception 'fee schedule version conflict'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or length(p_input::text) > 6000 then raise exception 'invalid fee schedule'; end if;
  perform public.fin_insert_fee_version(s, p_input, s.current_version + 1);
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (s.organization_id, 'contract', s.contract_id, 'fee_schedule_versioned', auth.uid(), jsonb_build_object('schedule_id', s.id, 'version', s.current_version + 1));
  return s.current_version + 1;
end $$;
revoke all on function public.fin_version_fee_schedule(uuid, integer, jsonb) from public, anon;
grant execute on function public.fin_version_fee_schedule(uuid, integer, jsonb) to authenticated;

-- Deterministic comparison of one observation against the version valid for
-- its whole period. Never forces a number: anything not methodologically
-- comparable keeps contracted/variance null with explicit reasons.
create or replace function public.fin_compare_fee(x public.fin_fee_observations)
returns public.fin_fee_variances language plpgsql set search_path = '' as $$
declare r public.fin_fee_variances; s public.fin_fee_schedules%rowtype; v public.fin_fee_schedule_versions%rowtype;
  v_reasons text[] := '{}'; v_expected numeric; v_months integer; v_formula text; v_left numeric; v_prev numeric := 0; t jsonb; v_band numeric;
begin
  r.id := gen_random_uuid(); r.organization_id := x.organization_id; r.observation_id := x.id; r.contract_id := x.contract_id;
  r.legal_entity_id := x.legal_entity_id; r.provider_id := x.provider_id; r.service := x.service; r.currency := x.currency;
  r.period_start := x.period_start; r.period_end := x.period_end; r.observed_amount := x.observed_amount; r.created_at := now(); r.reasons := '{}';
  select * into s from public.fin_fee_schedules where contract_id = x.contract_id and service_key = x.service_key and charging_unit = x.charging_unit;
  if s.id is null then
    select * into s from public.fin_fee_schedules where contract_id = x.contract_id and service_key = x.service_key order by created_at, id limit 1;
    if s.id is null then
      r.comparison_status := 'missing_reference'; r.reasons := array['missing_contracted_reference']; r.review_status := 'new';
      r.methodology := jsonb_build_object('version', 1, 'formula', null, 'note', 'No contracted fee reference for this contract and service');
      return r;
    end if;
    v_reasons := v_reasons || 'charging_unit_mismatch'::text;
  end if;
  r.schedule_id := s.id; r.category := s.category;
  select * into v from public.fin_fee_schedule_versions where schedule_id = s.id and effective_from <= x.period_start order by effective_from desc, version desc limit 1;
  if v.schedule_id is null then
    v_reasons := v_reasons || 'no_reference_for_period'::text;
  else
    r.schedule_version := v.version; r.contract_version := v.contract_version;
    r.reference_snapshot := jsonb_build_object('schedule_id', s.id, 'version', v.version, 'contract_version', v.contract_version, 'effective_from', v.effective_from,
      'pricing_model', v.pricing_model, 'charging_unit', s.charging_unit, 'currency', v.currency, 'rate', v.rate, 'tiers', v.tiers,
      'minimum_amount', v.minimum_amount, 'maximum_amount', v.maximum_amount, 'source', v.source, 'source_reference', v.source_reference);
    if exists (select 1 from public.fin_fee_schedule_versions w where w.schedule_id = s.id and w.effective_from > x.period_start and w.effective_from <= x.period_end) then
      v_reasons := v_reasons || 'reference_changed_in_period'::text;
    end if;
    if v.currency <> x.currency then v_reasons := v_reasons || 'currency_mismatch'::text; end if;
    if v.pricing_model in ('per_unit','tiered_per_unit') and x.volume is null then v_reasons := v_reasons || 'missing_volume'::text; end if;
    if v.pricing_model in ('percentage','basis_points') and x.base_amount is null then v_reasons := v_reasons || 'missing_base_amount'::text; end if;
    -- Calendar-month normalization only: no pro-rata by days is assumed.
    v_months := case when x.period_start = date_trunc('month', x.period_start)::date
                      and x.period_end = (date_trunc('month', x.period_end) + interval '1 month - 1 day')::date
                     then (extract(year from x.period_end)::integer * 12 + extract(month from x.period_end)::integer)
                        - (extract(year from x.period_start)::integer * 12 + extract(month from x.period_start)::integer) + 1 end;
    if v.pricing_model = 'fixed_amount' and ((s.charging_unit = 'per_month' and v_months is null) or (s.charging_unit = 'per_year' and (v_months is null or v_months % 12 <> 0))) then
      v_reasons := v_reasons || 'period_not_normalizable'::text;
    end if;
    if (v.minimum_amount is not null or v.maximum_amount is not null) and v_months is distinct from 1 then
      v_reasons := v_reasons || 'minimum_maximum_requires_single_month'::text;
    end if;
  end if;
  if cardinality(v_reasons) > 0 then
    r.comparison_status := 'not_comparable'; r.reasons := v_reasons; r.review_status := 'new';
    r.methodology := jsonb_build_object('version', 1, 'formula', null, 'note', 'Not economically comparable; no variance is computed');
    return r;
  end if;
  if v.pricing_model = 'fixed_amount' then
    v_expected := case s.charging_unit when 'one_off' then v.rate when 'per_month' then v.rate * v_months else v.rate * v_months / 12 end;
    v_formula := case s.charging_unit when 'one_off' then 'rate' when 'per_month' then 'rate * calendar_months' else 'rate * calendar_months / 12' end;
  elsif v.pricing_model = 'per_unit' then
    v_expected := v.rate * x.volume; v_formula := 'rate * volume';
  elsif v.pricing_model = 'percentage' then
    v_expected := v.rate / 100 * x.base_amount; v_formula := 'rate_percent / 100 * base_amount';
  elsif v.pricing_model = 'basis_points' then
    v_expected := v.rate / 10000 * x.base_amount; v_formula := 'rate_bps / 10000 * base_amount';
  else
    v_expected := 0; v_left := x.volume;
    for t in select value from jsonb_array_elements(v.tiers) loop
      v_band := case when t->'up_to' = 'null'::jsonb then v_left else least(v_left, (t->>'up_to')::numeric - v_prev) end;
      v_expected := v_expected + greatest(v_band, 0) * (t->>'rate')::numeric;
      v_left := v_left - greatest(v_band, 0);
      exit when t->'up_to' = 'null'::jsonb or v_left <= 0;
      v_prev := (t->>'up_to')::numeric;
    end loop;
    v_formula := 'sum(units_in_tier * tier_rate), graduated tiers';
  end if;
  if v.minimum_amount is not null then v_expected := greatest(v_expected, v.minimum_amount); v_formula := v_formula || ', floored at monthly minimum'; end if;
  if v.maximum_amount is not null then v_expected := least(v_expected, v.maximum_amount); v_formula := v_formula || ', capped at monthly maximum'; end if;
  r.comparison_status := 'comparable';
  r.contracted_amount := round(v_expected, 2);
  r.variance_amount := round(x.observed_amount - round(v_expected, 2), 2);
  r.direction := case when r.variance_amount > 0 then 'above' when r.variance_amount < 0 then 'below' else 'equal' end;
  r.review_status := case when r.direction = 'equal' then 'not_required' else 'new' end;
  r.methodology := jsonb_build_object('version', 1, 'formula', 'observed_amount - contracted_reference', 'reference_formula', v_formula,
    'rounding', '2 decimal places', 'inputs', jsonb_build_object('volume', x.volume, 'base_amount', x.base_amount, 'calendar_months', v_months, 'observed_amount', x.observed_amount),
    'note', 'Difference against the contracted reference; interpretation requires human review');
  return r;
end $$;
revoke all on function public.fin_compare_fee(public.fin_fee_observations) from public, anon, authenticated;

create or replace function public.fin_record_fee_observation(p_org uuid, p_contract uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.fin_contracts%rowtype; x public.fin_fee_observations%rowtype; e public.fin_fee_observations%rowtype; r public.fin_fee_variances%rowtype; v_key text;
begin
  select * into c from public.fin_contracts where organization_id = p_org and id = p_contract for share;
  if c.id is null or auth.uid() is null or not public.fin_entity_allows(p_org, c.legal_entity_id, array['admin','finance_manager'])
     or not exists (select 1 from public.fin_organizations where id = p_org and kind = 'BUYER') then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  -- No automatic ingestion exists: API and document extraction are not accepted origins yet.
  if p_input->>'source_type' is null or p_input->>'source_type' not in ('manual','bank_statement','erp','tms','bank_file','other_import') then raise exception 'invalid fee observation source'; end if;
  begin
    if p_input is null or jsonb_typeof(p_input) <> 'object' or length(p_input::text) > 4000
       or exists (select 1 from jsonb_object_keys(p_input) k where k not in ('service','charging_unit','currency','period_start','period_end','volume','base_amount','observed_amount','source_type','source_reference','source_object_id','evidence_reference'))
       or jsonb_typeof(p_input->'observed_amount') is distinct from 'number'
       or (p_input ? 'volume' and jsonb_typeof(p_input->'volume') not in ('number','null'))
       or (p_input ? 'base_amount' and jsonb_typeof(p_input->'base_amount') not in ('number','null')) then raise exception 'invalid fee observation'; end if;
    if (p_input->>'observed_amount')::numeric <> round((p_input->>'observed_amount')::numeric, 2)
       or (p_input->>'base_amount')::numeric <> round((p_input->>'base_amount')::numeric, 2)
       or (p_input->>'period_start')::date is null or (p_input->>'period_end')::date is null
       or (p_input->>'period_end')::date >= current_date + 1 then raise exception 'invalid fee observation'; end if;
  exception when others then raise exception 'invalid fee observation';
  end;
  v_key := md5(concat_ws('|', p_input->>'source_type', lower(btrim(p_input->>'source_reference')), c.id::text, lower(btrim(p_input->>'service')), p_input->>'charging_unit', p_input->>'period_start', p_input->>'period_end'));
  select * into e from public.fin_fee_observations where organization_id = p_org and dedupe_key = v_key;
  if e.id is not null then
    -- Replay of the same fact is idempotent; a different fact under the same key is a conflict.
    if e.observed_amount = (p_input->>'observed_amount')::numeric and e.currency = p_input->>'currency'
       and e.volume is not distinct from (p_input->>'volume')::numeric and e.base_amount is not distinct from (p_input->>'base_amount')::numeric then return e.id; end if;
    raise exception 'fee observation conflict';
  end if;
  begin
    insert into public.fin_fee_observations(organization_id, contract_id, legal_entity_id, provider_id, service, charging_unit, currency, period_start, period_end,
      volume, base_amount, observed_amount, source_type, source_reference, source_object_id, evidence_reference, owner_id, dedupe_key)
    values (p_org, c.id, c.legal_entity_id, c.provider_id, trim(p_input->>'service'), p_input->>'charging_unit', p_input->>'currency',
      (p_input->>'period_start')::date, (p_input->>'period_end')::date, (p_input->>'volume')::numeric, (p_input->>'base_amount')::numeric,
      (p_input->>'observed_amount')::numeric, p_input->>'source_type', trim(p_input->>'source_reference'), nullif(trim(coalesce(p_input->>'source_object_id', '')), ''),
      trim(p_input->>'evidence_reference'), auth.uid(), v_key)
    returning * into x;
  exception when check_violation or not_null_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'invalid fee observation';
  end;
  r := public.fin_compare_fee(x);
  insert into public.fin_fee_variances select r.*;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'contract', c.id, 'fee_observation_recorded', auth.uid(), jsonb_build_object('observation_id', x.id, 'source_type', x.source_type, 'comparison_status', r.comparison_status));
  if r.comparison_status = 'comparable' and r.direction <> 'equal' then
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (p_org, 'contract', c.id, 'fee_variance_detected', auth.uid(), jsonb_build_object('variance_id', r.id, 'direction', r.direction, 'schedule_version', r.schedule_version));
  end if;
  return x.id;
end $$;
revoke all on function public.fin_record_fee_observation(uuid, uuid, jsonb) from public, anon;
grant execute on function public.fin_record_fee_observation(uuid, uuid, jsonb) to authenticated;

create or replace function public.fin_verify_fee_observation(p_observation uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare x public.fin_fee_observations%rowtype;
begin
  select * into x from public.fin_fee_observations where id = p_observation for update;
  if x.id is null or auth.uid() is null or not public.fin_entity_allows(x.organization_id, x.legal_entity_id, array['admin','finance_manager'])
     or not exists (select 1 from public.fin_contracts c where c.organization_id = x.organization_id and c.id = x.contract_id and public.fin_entity_allows(c.organization_id, c.legal_entity_id, array['admin','finance_manager'])) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(x.organization_id) then raise exception 'organization offboarding'; end if;
  if x.verification_status <> 'unverified' then raise exception 'fee observation already verified'; end if;
  if p_input->>'status' is null or p_input->>'status' not in ('verified','rejected') or length(trim(coalesce(p_input->>'reason', ''))) not between 3 and 1000 or p_input->>'reason' ~ '[<>]' then raise exception 'invalid fee verification'; end if;
  update public.fin_fee_observations set verification_status = p_input->>'status', verified_by = auth.uid(), verified_at = now(), verification_reason = trim(p_input->>'reason') where id = x.id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (x.organization_id, 'contract', x.contract_id, 'fee_observation_verified', auth.uid(), jsonb_build_object('observation_id', x.id, 'status', p_input->>'status'));
  return x.id;
end $$;
revoke all on function public.fin_verify_fee_observation(uuid, jsonb) from public, anon;
grant execute on function public.fin_verify_fee_observation(uuid, jsonb) to authenticated;

-- Review state machine. Interpretation is human: "confirmed" only records that
-- a person confirmed the difference against the contracted reference.
create or replace function public.fin_review_fee_variance(p_variance uuid, p_expected text, p_input jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.fin_fee_variances%rowtype; v_to text := p_input->>'to_status';
begin
  select * into v from public.fin_fee_variances where id = p_variance for update;
  if v.id is null or auth.uid() is null or not public.fin_entity_allows(v.organization_id, v.legal_entity_id, array['admin','finance_manager'])
     or not exists (select 1 from public.fin_contracts c where c.organization_id = v.organization_id and c.id = v.contract_id and public.fin_entity_allows(c.organization_id, c.legal_entity_id, array['admin','finance_manager'])) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(v.organization_id) then raise exception 'organization offboarding'; end if;
  if p_expected is distinct from v.review_status then raise exception 'fee review conflict'; end if;
  if not ((v.review_status = 'new' and v_to in ('under_review','dismissed'))
       or (v.review_status = 'under_review' and v_to in ('confirmed','explained','dismissed'))
       or (v.review_status in ('confirmed','explained') and v_to = 'resolved')) then raise exception 'invalid fee review transition'; end if;
  if v_to = 'confirmed' and v.comparison_status <> 'comparable' then raise exception 'invalid fee review transition'; end if;
  begin
    insert into public.fin_fee_reviews(organization_id, variance_id, from_status, to_status, reason_code, notes, evidence_reference, resolution, reviewer_id)
    values (v.organization_id, v.id, v.review_status, v_to, p_input->>'reason_code', trim(p_input->>'notes'),
      nullif(trim(coalesce(p_input->>'evidence_reference', '')), ''), nullif(trim(coalesce(p_input->>'resolution', '')), ''), auth.uid());
  exception when check_violation or not_null_violation then raise exception 'invalid fee review';
  end;
  update public.fin_fee_variances set review_status = v_to, reviewer_id = auth.uid(), last_reviewed_at = now() where id = v.id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v.organization_id, 'contract', v.contract_id, case when v_to = 'resolved' then 'fee_variance_resolved' else 'fee_variance_reviewed' end, auth.uid(),
      jsonb_build_object('variance_id', v.id, 'from', v.review_status, 'to', v_to, 'reason_code', p_input->>'reason_code'));
  return v_to;
end $$;
revoke all on function public.fin_review_fee_variance(uuid, text, jsonb) from public, anon;
grant execute on function public.fin_review_fee_variance(uuid, text, jsonb) to authenticated;

-- List and summary share the same authorized, bounded filters (invoker + RLS).
create or replace function public.fin_list_fee_variances(p_org uuid, p_start date, p_end date, p_entity uuid default null, p_provider uuid default null,
  p_category text default null, p_contract uuid default null, p_currency text default null, p_review text default null, p_comparison text default null,
  p_after uuid default null, p_limit integer default 25)
returns setof public.fin_fee_variances language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_org is null or auth.uid() is null or not public.fin_has_role(p_org, array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 * 5 or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid fee filters'; end if;
  return query select v.* from public.fin_fee_variances v where v.organization_id = p_org and v.period_start >= p_start and v.period_end <= p_end
    and (p_entity is null or v.legal_entity_id = p_entity) and (p_provider is null or v.provider_id = p_provider)
    and (p_category is null or v.category = p_category) and (p_contract is null or v.contract_id = p_contract)
    and (p_currency is null or v.currency = p_currency) and (p_review is null or v.review_status = p_review)
    and (p_comparison is null or v.comparison_status = p_comparison) and (p_after is null or v.id > p_after)
    order by v.id limit p_limit + 1;
end $$;
revoke all on function public.fin_list_fee_variances(uuid, date, date, uuid, uuid, text, uuid, text, text, text, uuid, integer) from public, anon;
grant execute on function public.fin_list_fee_variances(uuid, date, date, uuid, uuid, text, uuid, text, text, text, uuid, integer) to authenticated;

-- Totals are per currency only; above and below are never netted together.
create or replace function public.fin_fee_summary(p_org uuid, p_start date, p_end date, p_entity uuid default null, p_provider uuid default null,
  p_category text default null, p_contract uuid default null, p_currency text default null)
returns table(currency text, observations bigint, verified bigint, comparable bigint, not_comparable bigint, missing_reference bigint,
  above bigint, below bigint, equal bigint, contracted_total numeric, observed_total numeric, above_total numeric, below_total numeric,
  open_review bigint, under_review bigint, closed_review bigint, schedules bigint, schedules_observed bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_org is null or auth.uid() is null or not public.fin_has_role(p_org, array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 * 5 then raise exception 'invalid fee filters'; end if;
  return query
  with v as (
    select f.*, o.verification_status from public.fin_fee_variances f join public.fin_fee_observations o on o.organization_id = f.organization_id and o.id = f.observation_id
    where f.organization_id = p_org and f.period_start >= p_start and f.period_end <= p_end
      and (p_entity is null or f.legal_entity_id = p_entity) and (p_provider is null or f.provider_id = p_provider)
      and (p_category is null or f.category = p_category) and (p_contract is null or f.contract_id = p_contract) and (p_currency is null or f.currency = p_currency)
  ), s as (
    select x.id, (select w.currency from public.fin_fee_schedule_versions w where w.schedule_id = x.id order by w.version desc limit 1) as currency
    from public.fin_fee_schedules x
    where x.organization_id = p_org and (p_entity is null or x.legal_entity_id = p_entity) and (p_provider is null or x.provider_id = p_provider)
      and (p_category is null or x.category = p_category) and (p_contract is null or x.contract_id = p_contract)
  ), cur as (select v.currency from v union select s.currency from s)
  select cur.currency,
    (select count(*) from v where v.currency = cur.currency),
    (select count(*) from v where v.currency = cur.currency and v.verification_status = 'verified'),
    (select count(*) from v where v.currency = cur.currency and v.comparison_status = 'comparable'),
    (select count(*) from v where v.currency = cur.currency and v.comparison_status = 'not_comparable'),
    (select count(*) from v where v.currency = cur.currency and v.comparison_status = 'missing_reference'),
    (select count(*) from v where v.currency = cur.currency and v.direction = 'above'),
    (select count(*) from v where v.currency = cur.currency and v.direction = 'below'),
    (select count(*) from v where v.currency = cur.currency and v.direction = 'equal'),
    (select sum(v.contracted_amount) from v where v.currency = cur.currency and v.comparison_status = 'comparable'),
    (select sum(v.observed_amount) from v where v.currency = cur.currency and v.comparison_status = 'comparable'),
    (select sum(v.variance_amount) from v where v.currency = cur.currency and v.direction = 'above'),
    (select sum(v.variance_amount) from v where v.currency = cur.currency and v.direction = 'below'),
    (select count(*) from v where v.currency = cur.currency and v.review_status = 'new'),
    (select count(*) from v where v.currency = cur.currency and v.review_status = 'under_review'),
    (select count(*) from v where v.currency = cur.currency and v.review_status in ('resolved','dismissed')),
    (select count(*) from s where s.currency = cur.currency),
    (select count(*) from s where s.currency = cur.currency and exists (select 1 from v where v.schedule_id = s.id and v.comparison_status = 'comparable'))
  from cur where cur.currency is not null order by cur.currency;
end $$;
revoke all on function public.fin_fee_summary(uuid, date, date, uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.fin_fee_summary(uuid, date, date, uuid, uuid, text, uuid, text) to authenticated;

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
    ('fee_reviews', 'select * from public.fin_fee_reviews where organization_id = $1');
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
 or p_kind is not null and p_kind not in ('organization','entity','provider','relationship','rfq','proposal','decision','contract','facility','limit','guarantee','passport_snapshot','milestone','obligation','document','owner','value_realization','fee_schedule','fee_observation','fee_variance','fee_review')
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

insert into public.fin_settings(key,value) values ('schema_version', 'financial-fee-intelligence-1') on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

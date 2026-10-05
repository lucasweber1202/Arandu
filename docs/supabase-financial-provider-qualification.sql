-- Provider Qualification & Due Diligence (Guideline v3 §11). Exigências
-- definidas pelo cliente, evidências com origem e validade, exceções com
-- segregação de funções e decisão humana auditada. O Arandu não é provedor de
-- KYC/KYB/sanções: verificação especializada entra como evidência de serviço
-- externo. Consultar a qualificação informa; nunca escolhe vencedor.
begin;

create table if not exists public.fin_qualification_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  requirement_key uuid not null default gen_random_uuid(),
  version integer not null default 1 check (version between 1 and 1000),
  area text not null check (area in ('registration','legal','financial','security','privacy','compliance','continuity','documentation','insurance','category_specific')),
  title text not null check (length(trim(title)) between 3 and 200 and title !~ '[<>]'),
  description text check (description is null or (length(trim(description)) between 3 and 2000 and description !~ '[<>]')),
  category text not null default 'all' check (category in ('all','credit','acquiring','cash_management','payments','fx','guarantee','insurance','other')),
  legal_entity_id uuid,
  validity_days integer check (validity_days is null or validity_days between 1 and 3650),
  critical boolean not null default false,
  status text not null default 'active' check (status in ('active','retired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, requirement_key, version),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  check ((status = 'retired') = (retired_at is not null))
);
create unique index if not exists fin_qualification_requirement_active on public.fin_qualification_requirements(organization_id, requirement_key) where status = 'active';

create table if not exists public.fin_provider_qualifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  provider_id uuid not null,
  legal_entity_id uuid,
  category text not null check (category in ('all','credit','acquiring','cash_management','payments','fx','guarantee','insurance','other')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','pending_provider','pending_internal_review','qualified','qualified_with_conditions','expired','rejected','suspended')),
  owner_id uuid not null references auth.users(id),
  review_due_on date,
  valid_until date,
  conditions text check (conditions is null or (length(trim(conditions)) between 10 and 2000 and conditions !~ '[<>]')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or (length(trim(decision_reason)) between 10 and 2000 and decision_reason !~ '[<>]')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  check (status <> 'qualified_with_conditions' or conditions is not null),
  check (status not in ('qualified','qualified_with_conditions','rejected','suspended') or (decided_by is not null and decided_at is not null and decision_reason is not null))
);
create unique index if not exists fin_provider_qualification_scope on public.fin_provider_qualifications(organization_id, provider_id, coalesce(legal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid), category);

create table if not exists public.fin_qualification_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qualification_id uuid not null,
  requirement_id uuid not null,
  source text not null check (source in ('provider','internal','external_service')),
  external_service text check (external_service is null or (length(trim(external_service)) between 2 and 80 and external_service !~ '[<>]')),
  evidence_reference text not null check (length(trim(evidence_reference)) between 3 and 200 and evidence_reference !~ '[<>]'),
  document_id uuid references public.fin_private_documents(id),
  valid_until date,
  status text not null default 'submitted' check (status in ('submitted','accepted','rejected','expired')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or (length(trim(review_reason)) between 3 and 1000 and review_reason !~ '[<>]')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, qualification_id) references public.fin_provider_qualifications(organization_id, id),
  foreign key (organization_id, requirement_id) references public.fin_qualification_requirements(organization_id, id),
  check ((source = 'external_service') = (external_service is not null)),
  check ((status = 'submitted') = (reviewed_by is null and reviewed_at is null)),
  check (status <> 'rejected' or review_reason is not null)
);
create index if not exists fin_qualification_evidence_q on public.fin_qualification_evidence(qualification_id, requirement_id, status);

create table if not exists public.fin_qualification_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qualification_id uuid not null,
  requirement_id uuid not null,
  reason text not null check (length(trim(reason)) between 10 and 2000 and reason !~ '[<>]'),
  compensating_controls text check (compensating_controls is null or (length(trim(compensating_controls)) between 3 and 2000 and compensating_controls !~ '[<>]')),
  expires_on date not null,
  status text not null default 'requested' check (status in ('requested','approved','rejected','expired')),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or (length(trim(decision_reason)) between 3 and 1000 and decision_reason !~ '[<>]')),
  unique (organization_id, id),
  foreign key (organization_id, qualification_id) references public.fin_provider_qualifications(organization_id, id),
  foreign key (organization_id, requirement_id) references public.fin_qualification_requirements(organization_id, id),
  check ((status = 'requested') = (decided_by is null and decided_at is null and decision_reason is null)),
  -- Segregação de funções: quem pede não aprova a própria exceção.
  check (decided_by is null or decided_by <> requested_by)
);

create table if not exists public.fin_qualification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qualification_id uuid not null,
  event_type text not null check (event_type in ('opened','transition','evidence_recorded','evidence_reviewed','exception_requested','exception_decided','expired')),
  from_status text,
  to_status text,
  reason text check (reason is null or length(reason) <= 2000),
  object_id uuid,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, qualification_id) references public.fin_provider_qualifications(organization_id, id)
);
create index if not exists fin_qualification_events_q on public.fin_qualification_events(qualification_id, created_at);

alter table public.fin_qualification_requirements enable row level security;
alter table public.fin_qualification_requirements force row level security;
alter table public.fin_provider_qualifications enable row level security;
alter table public.fin_provider_qualifications force row level security;
alter table public.fin_qualification_evidence enable row level security;
alter table public.fin_qualification_evidence force row level security;
alter table public.fin_qualification_exceptions enable row level security;
alter table public.fin_qualification_exceptions force row level security;
alter table public.fin_qualification_events enable row level security;
alter table public.fin_qualification_events force row level security;
revoke all on public.fin_qualification_requirements, public.fin_provider_qualifications, public.fin_qualification_evidence, public.fin_qualification_exceptions, public.fin_qualification_events from public, anon, authenticated;
grant select on public.fin_qualification_requirements, public.fin_provider_qualifications, public.fin_qualification_evidence, public.fin_qualification_exceptions, public.fin_qualification_events to authenticated;
grant all on public.fin_qualification_requirements, public.fin_provider_qualifications, public.fin_qualification_evidence, public.fin_qualification_exceptions, public.fin_qualification_events to service_role;

-- Leitura: compradora com papel interno no escopo da entidade (nula = grupo).
drop policy if exists fin_qualification_requirement_read on public.fin_qualification_requirements;
create policy fin_qualification_requirement_read on public.fin_qualification_requirements for select to authenticated using (
  public.fin_has_role(organization_id, array['admin','finance_manager','analyst','viewer'])
  and (legal_entity_id is null or public.fin_entity_visible(organization_id, legal_entity_id))
  and exists (select 1 from public.fin_organizations o where o.id = organization_id and o.kind = 'BUYER'));
drop policy if exists fin_provider_qualification_read on public.fin_provider_qualifications;
create policy fin_provider_qualification_read on public.fin_provider_qualifications for select to authenticated using (
  public.fin_entity_allows(organization_id, legal_entity_id, array['admin','finance_manager','analyst','viewer'])
  and exists (select 1 from public.fin_organizations o where o.id = organization_id and o.kind = 'BUYER'));
drop policy if exists fin_qualification_evidence_read on public.fin_qualification_evidence;
create policy fin_qualification_evidence_read on public.fin_qualification_evidence for select to authenticated using (
  exists (select 1 from public.fin_provider_qualifications q where q.organization_id = fin_qualification_evidence.organization_id and q.id = fin_qualification_evidence.qualification_id));
drop policy if exists fin_qualification_exception_read on public.fin_qualification_exceptions;
create policy fin_qualification_exception_read on public.fin_qualification_exceptions for select to authenticated using (
  exists (select 1 from public.fin_provider_qualifications q where q.organization_id = fin_qualification_exceptions.organization_id and q.id = fin_qualification_exceptions.qualification_id));
drop policy if exists fin_qualification_event_read on public.fin_qualification_events;
create policy fin_qualification_event_read on public.fin_qualification_events for select to authenticated using (
  exists (select 1 from public.fin_provider_qualifications q where q.organization_id = fin_qualification_events.organization_id and q.id = fin_qualification_events.qualification_id));

-- Imutabilidade: exigência só se aposenta; evidência e exceção só recebem a
-- sua decisão (uma vez, ou vencimento); eventos nunca mudam. A qualificação
-- muda só por RPC (estado, decisão, validade, condições, prazo de revisão).
create or replace function public.fin_qualification_requirement_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','retired_at']) is distinct from (to_jsonb(old) - array['status','retired_at']) or old.status <> 'active' or new.status <> 'retired' then raise exception 'immutable record'; end if;
  return new;
end $$;
create or replace function public.fin_qualification_evidence_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','reviewed_by','reviewed_at','review_reason']) is distinct from (to_jsonb(old) - array['status','reviewed_by','reviewed_at','review_reason'])
     or not ((old.status = 'submitted' and new.status in ('accepted','rejected')) or (old.status = 'accepted' and new.status = 'expired')) then raise exception 'immutable record'; end if;
  return new;
end $$;
create or replace function public.fin_qualification_exception_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','decided_by','decided_at','decision_reason']) is distinct from (to_jsonb(old) - array['status','decided_by','decided_at','decision_reason'])
     or not ((old.status = 'requested' and new.status in ('approved','rejected')) or (old.status = 'approved' and new.status = 'expired')) then raise exception 'immutable record'; end if;
  return new;
end $$;
create or replace function public.fin_provider_qualification_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','owner_id','review_due_on','valid_until','conditions','decided_by','decided_at','decision_reason','updated_at']) is distinct from
     (to_jsonb(old) - array['status','owner_id','review_due_on','valid_until','conditions','decided_by','decided_at','decision_reason','updated_at']) then raise exception 'immutable record'; end if;
  return new;
end $$;
revoke all on function public.fin_qualification_requirement_guard(), public.fin_qualification_evidence_guard(), public.fin_qualification_exception_guard(), public.fin_provider_qualification_guard() from public, anon, authenticated;
drop trigger if exists fin_qualification_requirement_immutable on public.fin_qualification_requirements;
create trigger fin_qualification_requirement_immutable before update on public.fin_qualification_requirements for each row execute function public.fin_qualification_requirement_guard();
drop trigger if exists fin_qualification_requirement_delete on public.fin_qualification_requirements;
create trigger fin_qualification_requirement_delete before delete on public.fin_qualification_requirements for each row execute function public.fin_immutable_row();
drop trigger if exists fin_provider_qualification_immutable on public.fin_provider_qualifications;
create trigger fin_provider_qualification_immutable before update on public.fin_provider_qualifications for each row execute function public.fin_provider_qualification_guard();
drop trigger if exists fin_provider_qualification_delete on public.fin_provider_qualifications;
create trigger fin_provider_qualification_delete before delete on public.fin_provider_qualifications for each row execute function public.fin_immutable_row();
drop trigger if exists fin_qualification_evidence_immutable on public.fin_qualification_evidence;
create trigger fin_qualification_evidence_immutable before update on public.fin_qualification_evidence for each row execute function public.fin_qualification_evidence_guard();
drop trigger if exists fin_qualification_evidence_delete on public.fin_qualification_evidence;
create trigger fin_qualification_evidence_delete before delete on public.fin_qualification_evidence for each row execute function public.fin_immutable_row();
drop trigger if exists fin_qualification_exception_immutable on public.fin_qualification_exceptions;
create trigger fin_qualification_exception_immutable before update on public.fin_qualification_exceptions for each row execute function public.fin_qualification_exception_guard();
drop trigger if exists fin_qualification_exception_delete on public.fin_qualification_exceptions;
create trigger fin_qualification_exception_delete before delete on public.fin_qualification_exceptions for each row execute function public.fin_immutable_row();
drop trigger if exists fin_qualification_event_immutable on public.fin_qualification_events;
create trigger fin_qualification_event_immutable before update or delete on public.fin_qualification_events for each row execute function public.fin_immutable_row();

-- Exigências que se aplicam a uma qualificação: ativas, da categoria (ou
-- todas) e do grupo ou da mesma entidade.
create or replace function public.fin_qualification_applicable(q public.fin_provider_qualifications)
returns setof public.fin_qualification_requirements language sql stable security definer set search_path = '' as $$
  select r.* from public.fin_qualification_requirements r
   where r.organization_id = q.organization_id and r.status = 'active'
     and (r.category = 'all' or r.category = q.category)
     and (r.legal_entity_id is null or r.legal_entity_id is not distinct from q.legal_entity_id)
$$;
revoke all on function public.fin_qualification_applicable(public.fin_provider_qualifications) from public, anon, authenticated;

create or replace function public.fin_set_qualification_requirement(p_org uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_prev public.fin_qualification_requirements%rowtype; v_id uuid; v_key uuid; v_version integer := 1; v_entity uuid;
begin
  if auth.uid() is null or not public.fin_has_role(p_org, array['admin']) or not exists (select 1 from public.fin_organizations where id = p_org and kind = 'BUYER') then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or exists (select 1 from jsonb_object_keys(p_input) k where k not in ('requirement_key','area','title','description','category','legal_entity_id','validity_days','critical')) then raise exception 'invalid qualification requirement'; end if;
  v_entity := nullif(p_input->>'legal_entity_id', '')::uuid;
  if v_entity is not null and not exists (select 1 from public.fin_legal_entities where organization_id = p_org and id = v_entity) then raise exception 'invalid qualification requirement'; end if;
  if p_input ? 'requirement_key' and nullif(p_input->>'requirement_key', '') is not null then
    select * into v_prev from public.fin_qualification_requirements where organization_id = p_org and requirement_key = (p_input->>'requirement_key')::uuid and status = 'active' for update;
    if v_prev.id is null then raise exception 'invalid qualification requirement'; end if;
    v_key := v_prev.requirement_key; v_version := v_prev.version + 1;
    update public.fin_qualification_requirements set status = 'retired', retired_at = now() where id = v_prev.id;
  end if;
  begin
    insert into public.fin_qualification_requirements(organization_id, requirement_key, version, area, title, description, category, legal_entity_id, validity_days, critical, created_by)
    values (p_org, coalesce(v_key, gen_random_uuid()), v_version, p_input->>'area', trim(p_input->>'title'), nullif(trim(coalesce(p_input->>'description', '')), ''),
      coalesce(nullif(p_input->>'category', ''), 'all'), v_entity, nullif(p_input->>'validity_days', '')::integer, coalesce((p_input->>'critical')::boolean, false), auth.uid())
    returning id into v_id;
  exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid qualification requirement';
  end;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (p_org, 'qualification_requirement', v_id, 'qualification_requirement_set', auth.uid(), jsonb_build_object('version', v_version));
  return v_id;
end $$;
revoke all on function public.fin_set_qualification_requirement(uuid, jsonb) from public, anon;
grant execute on function public.fin_set_qualification_requirement(uuid, jsonb) to authenticated;

create or replace function public.fin_retire_qualification_requirement(p_requirement uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.fin_qualification_requirements%rowtype;
begin
  select * into r from public.fin_qualification_requirements where id = p_requirement for update;
  if r.id is null or auth.uid() is null or not public.fin_has_role(r.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if r.status <> 'active' then raise exception 'invalid qualification requirement'; end if;
  update public.fin_qualification_requirements set status = 'retired', retired_at = now() where id = r.id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (r.organization_id, 'qualification_requirement', r.id, 'qualification_requirement_retired', auth.uid(), '{}'::jsonb);
end $$;
revoke all on function public.fin_retire_qualification_requirement(uuid) from public, anon;
grant execute on function public.fin_retire_qualification_requirement(uuid) to authenticated;

create or replace function public.fin_open_provider_qualification(p_org uuid, p_provider uuid, p_entity uuid, p_category text, p_owner uuid, p_review_due date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.fin_entity_allows(p_org, p_entity, array['admin','finance_manager']) or not exists (select 1 from public.fin_organizations where id = p_org and kind = 'BUYER') then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  if not exists (select 1 from public.fin_providers where organization_id = p_org and id = p_provider) then raise exception 'invalid qualification'; end if;
  if p_category is null or p_category not in ('all','credit','acquiring','cash_management','payments','fx','guarantee','insurance','other') or (p_review_due is not null and p_review_due < current_date) then raise exception 'invalid qualification'; end if;
  if not public.fin_entity_allows(p_org, p_entity, array['admin','finance_manager','analyst']) or not exists (select 1 from public.fin_members m where m.organization_id = p_org and m.user_id = coalesce(p_owner, auth.uid()) and m.role in ('admin','finance_manager','analyst')) then raise exception 'invalid qualification owner'; end if;
  if exists (select 1 from public.fin_provider_qualifications where organization_id = p_org and provider_id = p_provider and legal_entity_id is not distinct from p_entity and category = p_category) then raise exception 'qualification already exists'; end if;
  insert into public.fin_provider_qualifications(organization_id, provider_id, legal_entity_id, category, owner_id, review_due_on, created_by)
  values (p_org, p_provider, p_entity, p_category, coalesce(p_owner, auth.uid()), p_review_due, auth.uid()) returning id into v_id;
  insert into public.fin_qualification_events(organization_id, qualification_id, event_type, to_status, actor_id) values (p_org, v_id, 'opened', 'not_started', auth.uid());
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (p_org, 'provider', p_provider, 'provider_qualification_opened', auth.uid(), jsonb_build_object('qualification_id', v_id, 'category', p_category));
  return v_id;
end $$;
revoke all on function public.fin_open_provider_qualification(uuid, uuid, uuid, text, uuid, date) from public, anon;
grant execute on function public.fin_open_provider_qualification(uuid, uuid, uuid, text, uuid, date) to authenticated;

create or replace function public.fin_record_qualification_evidence(p_qualification uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare q public.fin_provider_qualifications%rowtype; r public.fin_qualification_requirements%rowtype; v_id uuid; v_doc uuid;
begin
  select * into q from public.fin_provider_qualifications where id = p_qualification for update;
  if q.id is null or auth.uid() is null or not public.fin_entity_allows(q.organization_id, q.legal_entity_id, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(q.organization_id) then raise exception 'organization offboarding'; end if;
  if q.status not in ('not_started','in_progress','pending_provider','pending_internal_review','qualified','qualified_with_conditions') then raise exception 'qualification closed'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or exists (select 1 from jsonb_object_keys(p_input) k where k not in ('requirement_id','source','external_service','evidence_reference','document_id','valid_until')) then raise exception 'invalid qualification evidence'; end if;
  select * into r from public.fin_qualification_applicable(q) a where a.id = (p_input->>'requirement_id')::uuid;
  if r.id is null then raise exception 'invalid qualification evidence'; end if;
  v_doc := nullif(p_input->>'document_id', '')::uuid;
  if v_doc is not null and not (public.fin_can_read_document(v_doc) and exists (select 1 from public.fin_private_documents d where d.id = v_doc and d.buyer_organization_id = q.organization_id)) then raise exception 'invalid qualification evidence'; end if;
  if nullif(p_input->>'valid_until', '')::date < current_date then raise exception 'invalid qualification evidence'; end if;
  begin
    insert into public.fin_qualification_evidence(organization_id, qualification_id, requirement_id, source, external_service, evidence_reference, document_id, valid_until, created_by)
    values (q.organization_id, q.id, r.id, p_input->>'source', nullif(trim(coalesce(p_input->>'external_service', '')), ''), trim(p_input->>'evidence_reference'), v_doc,
      coalesce(nullif(p_input->>'valid_until', '')::date, case when r.validity_days is not null then current_date + r.validity_days end), auth.uid())
    returning id into v_id;
  exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid qualification evidence';
  end;
  insert into public.fin_qualification_events(organization_id, qualification_id, event_type, object_id, actor_id) values (q.organization_id, q.id, 'evidence_recorded', v_id, auth.uid());
  return v_id;
end $$;
revoke all on function public.fin_record_qualification_evidence(uuid, jsonb) from public, anon;
grant execute on function public.fin_record_qualification_evidence(uuid, jsonb) to authenticated;

create or replace function public.fin_review_qualification_evidence(p_evidence uuid, p_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.fin_qualification_evidence%rowtype; q public.fin_provider_qualifications%rowtype; v_status text := p_input->>'status'; v_reason text := nullif(trim(coalesce(p_input->>'reason', '')), '');
begin
  select * into e from public.fin_qualification_evidence where id = p_evidence for update;
  select * into q from public.fin_provider_qualifications where id = e.qualification_id;
  if e.id is null or auth.uid() is null or not public.fin_entity_allows(q.organization_id, q.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if e.status <> 'submitted' then raise exception 'qualification evidence conflict'; end if;
  -- Quem registrou a evidência não a aceita sozinho.
  if v_status = 'accepted' and e.created_by = auth.uid() then raise exception 'segregation of duties'; end if;
  if v_status is null or v_status not in ('accepted','rejected') or (v_status = 'rejected' and (v_reason is null or length(v_reason) not between 3 and 1000 or v_reason ~ '[<>]')) then raise exception 'invalid qualification evidence review'; end if;
  update public.fin_qualification_evidence set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_reason = v_reason where id = e.id;
  insert into public.fin_qualification_events(organization_id, qualification_id, event_type, to_status, reason, object_id, actor_id) values (q.organization_id, q.id, 'evidence_reviewed', v_status, v_reason, e.id, auth.uid());
end $$;
revoke all on function public.fin_review_qualification_evidence(uuid, jsonb) from public, anon;
grant execute on function public.fin_review_qualification_evidence(uuid, jsonb) to authenticated;

create or replace function public.fin_request_qualification_exception(p_qualification uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare q public.fin_provider_qualifications%rowtype; r public.fin_qualification_requirements%rowtype; v_id uuid;
begin
  select * into q from public.fin_provider_qualifications where id = p_qualification for update;
  if q.id is null or auth.uid() is null or not public.fin_entity_allows(q.organization_id, q.legal_entity_id, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then raise exception 'invalid qualification exception'; end if;
  select * into r from public.fin_qualification_applicable(q) a where a.id = (p_input->>'requirement_id')::uuid;
  if r.id is null or (p_input->>'expires_on')::date is null or (p_input->>'expires_on')::date <= current_date or (p_input->>'expires_on')::date > current_date + 366 then raise exception 'invalid qualification exception'; end if;
  if exists (select 1 from public.fin_qualification_exceptions x where x.qualification_id = q.id and x.requirement_id = r.id and x.status in ('requested','approved') and x.expires_on >= current_date) then raise exception 'qualification exception already open'; end if;
  begin
    insert into public.fin_qualification_exceptions(organization_id, qualification_id, requirement_id, reason, compensating_controls, expires_on, requested_by)
    values (q.organization_id, q.id, r.id, trim(p_input->>'reason'), nullif(trim(coalesce(p_input->>'compensating_controls', '')), ''), (p_input->>'expires_on')::date, auth.uid())
    returning id into v_id;
  exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid qualification exception';
  end;
  insert into public.fin_qualification_events(organization_id, qualification_id, event_type, object_id, actor_id) values (q.organization_id, q.id, 'exception_requested', v_id, auth.uid());
  return v_id;
end $$;
revoke all on function public.fin_request_qualification_exception(uuid, jsonb) from public, anon;
grant execute on function public.fin_request_qualification_exception(uuid, jsonb) to authenticated;

create or replace function public.fin_decide_qualification_exception(p_exception uuid, p_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.fin_qualification_exceptions%rowtype; q public.fin_provider_qualifications%rowtype; v_status text := p_input->>'status'; v_reason text := nullif(trim(coalesce(p_input->>'reason', '')), '');
begin
  select * into x from public.fin_qualification_exceptions where id = p_exception for update;
  select * into q from public.fin_provider_qualifications where id = x.qualification_id;
  if x.id is null or auth.uid() is null or not public.fin_entity_allows(q.organization_id, q.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if x.status <> 'requested' then raise exception 'qualification exception closed'; end if;
  if x.requested_by = auth.uid() then raise exception 'segregation of duties'; end if;
  if v_status is null or v_status not in ('approved','rejected') or v_reason is null or length(v_reason) not between 3 and 1000 or v_reason ~ '[<>]' then raise exception 'invalid qualification exception'; end if;
  update public.fin_qualification_exceptions set status = v_status, decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason where id = x.id;
  insert into public.fin_qualification_events(organization_id, qualification_id, event_type, to_status, reason, object_id, actor_id) values (q.organization_id, q.id, 'exception_decided', v_status, v_reason, x.id, auth.uid());
end $$;
revoke all on function public.fin_decide_qualification_exception(uuid, jsonb) from public, anon;
grant execute on function public.fin_decide_qualification_exception(uuid, jsonb) to authenticated;

-- Prontidão factual (mesma regra de lib/finance/qualification.mjs#readiness).
create or replace function public.fin_qualification_readiness(p_qualification uuid)
returns table(missing integer, excepted integer, met integer, valid_until date)
language sql stable security definer set search_path = '' as $$
  with q as (select * from public.fin_provider_qualifications where id = p_qualification),
  items as (
    select r.id,
      exists (select 1 from public.fin_qualification_evidence e where e.qualification_id = (select id from q) and e.requirement_id = r.id and e.status = 'accepted' and (e.valid_until is null or e.valid_until >= current_date)) as has_ev,
      exists (select 1 from public.fin_qualification_exceptions x where x.qualification_id = (select id from q) and x.requirement_id = r.id and x.status = 'approved' and x.expires_on >= current_date) as has_ex,
      least((select min(e.valid_until) from public.fin_qualification_evidence e where e.qualification_id = (select id from q) and e.requirement_id = r.id and e.status = 'accepted' and (e.valid_until is null or e.valid_until >= current_date)),
            (select min(x.expires_on) from public.fin_qualification_exceptions x where x.qualification_id = (select id from q) and x.requirement_id = r.id and x.status = 'approved' and x.expires_on >= current_date)) as until
      from q, public.fin_qualification_applicable(q.*) r)
  select count(*) filter (where not has_ev and not has_ex)::integer, count(*) filter (where not has_ev and has_ex)::integer, count(*) filter (where has_ev)::integer, min(until) from items
$$;
revoke all on function public.fin_qualification_readiness(uuid) from public, anon;
grant execute on function public.fin_qualification_readiness(uuid) to authenticated;

create or replace function public.fin_transition_provider_qualification(p_qualification uuid, p_expected text, p_input jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare q public.fin_provider_qualifications%rowtype; v_to text := p_input->>'to_status'; v_reason text := nullif(trim(coalesce(p_input->>'reason', '')), ''); v_cond text := nullif(trim(coalesce(p_input->>'conditions', '')), '');
        v_ready record; v_until date;
begin
  select * into q from public.fin_provider_qualifications where id = p_qualification for update;
  if q.id is null or auth.uid() is null or not public.fin_entity_allows(q.organization_id, q.legal_entity_id, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  if v_to in ('qualified','qualified_with_conditions','rejected','suspended') and not public.fin_entity_allows(q.organization_id, q.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(q.organization_id) then raise exception 'organization offboarding'; end if;
  if p_expected is distinct from q.status then raise exception 'qualification state conflict'; end if;
  if not (v_to = any (case q.status
      when 'not_started' then array['in_progress'] when 'in_progress' then array['pending_provider','pending_internal_review']
      when 'pending_provider' then array['in_progress','pending_internal_review'] when 'pending_internal_review' then array['qualified','qualified_with_conditions','rejected','in_progress']
      when 'qualified' then array['suspended','expired','in_progress'] when 'qualified_with_conditions' then array['suspended','expired','in_progress']
      when 'suspended' then array['in_progress','rejected'] when 'rejected' then array['in_progress'] when 'expired' then array['in_progress'] else array[]::text[] end)) then raise exception 'invalid qualification transition'; end if;
  if (v_to in ('qualified','qualified_with_conditions','rejected','suspended') or (v_to = 'in_progress' and q.status in ('rejected','suspended','expired'))) and (v_reason is null or length(v_reason) not between 10 and 2000 or v_reason ~ '[<>]') then raise exception 'invalid qualification transition'; end if;
  if v_to = 'qualified_with_conditions' and (v_cond is null or length(v_cond) not between 10 and 2000 or v_cond ~ '[<>]') then raise exception 'invalid qualification transition'; end if;
  if v_to in ('qualified','qualified_with_conditions') then
    select * into v_ready from public.fin_qualification_readiness(q.id);
    if v_ready.missing > 0 then raise exception 'qualification requirements missing'; end if;
    if v_to = 'qualified' and v_ready.excepted > 0 then raise exception 'qualification has exceptions'; end if;
    v_until := least(v_ready.valid_until, nullif(p_input->>'valid_until', '')::date);
    if v_until is not null and v_until < current_date then raise exception 'invalid qualification transition'; end if;
  end if;
  update public.fin_provider_qualifications set status = v_to, updated_at = now(),
    conditions = case when v_to = 'qualified_with_conditions' then v_cond else null end,
    valid_until = case when v_to in ('qualified','qualified_with_conditions') then v_until when v_to in ('in_progress','rejected') then null else valid_until end,
    decided_by = case when v_to in ('qualified','qualified_with_conditions','rejected','suspended') then auth.uid() else decided_by end,
    decided_at = case when v_to in ('qualified','qualified_with_conditions','rejected','suspended') then now() else decided_at end,
    decision_reason = case when v_to in ('qualified','qualified_with_conditions','rejected','suspended') then v_reason else decision_reason end
  where id = q.id;
  insert into public.fin_qualification_events(organization_id, qualification_id, event_type, from_status, to_status, reason, actor_id) values (q.organization_id, q.id, 'transition', q.status, v_to, v_reason, auth.uid());
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (q.organization_id, 'provider', q.provider_id, 'provider_qualification_' || v_to, auth.uid(), jsonb_build_object('qualification_id', q.id, 'from', q.status));
  return v_to;
end $$;
revoke all on function public.fin_transition_provider_qualification(uuid, text, jsonb) from public, anon;
grant execute on function public.fin_transition_provider_qualification(uuid, text, jsonb) to authenticated;

-- Consulta para RFQ/policy: informa o estado (qualified, conditional,
-- expired, rejected, suspended, in_progress, unknown). Nunca decide.
create or replace function public.fin_provider_qualification_status(p_org uuid, p_provider uuid, p_entity uuid default null, p_category text default 'all')
returns text language plpgsql stable security definer set search_path = '' as $$
declare q public.fin_provider_qualifications%rowtype;
begin
  if not public.fin_entity_allows(p_org, p_entity, array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
  select * into q from public.fin_provider_qualifications x
   where x.organization_id = p_org and x.provider_id = p_provider and (x.category = coalesce(p_category, 'all') or x.category = 'all')
     and (x.legal_entity_id is not distinct from p_entity or x.legal_entity_id is null)
   order by (x.legal_entity_id is not distinct from p_entity) desc, (x.category = coalesce(p_category, 'all')) desc limit 1;
  if q.id is null then return 'unknown'; end if;
  if q.status in ('qualified','qualified_with_conditions') and q.valid_until is not null and q.valid_until < current_date then return 'expired'; end if;
  return case q.status when 'qualified' then 'qualified' when 'qualified_with_conditions' then 'conditional' when 'expired' then 'expired' when 'rejected' then 'rejected' when 'suspended' then 'suspended' else 'in_progress' end;
end $$;
revoke all on function public.fin_provider_qualification_status(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.fin_provider_qualification_status(uuid, uuid, uuid, text) to authenticated;

-- Vencimento (service role/job): qualificação e evidência vencidas mudam de
-- estado com evento; tarefa de revalidação 30 dias antes, idempotente.
create or replace function public.fin_run_qualification_expiry(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q record; v_expired integer := 0; v_ev integer := 0; v_tasks integer := 0; v_title text;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  update public.fin_qualification_evidence set status = 'expired' where status = 'accepted' and valid_until < p_today;
  get diagnostics v_ev = row_count;
  update public.fin_qualification_exceptions set status = 'expired' where status = 'approved' and expires_on < p_today;
  for q in select * from public.fin_provider_qualifications where status in ('qualified','qualified_with_conditions') and valid_until < p_today for update loop
    update public.fin_provider_qualifications set status = 'expired', updated_at = now() where id = q.id;
    insert into public.fin_qualification_events(organization_id, qualification_id, event_type, from_status, to_status, reason) values (q.organization_id, q.id, 'expired', q.status, 'expired', 'validade encerrada em ' || q.valid_until);
    v_expired := v_expired + 1;
  end loop;
  for q in select x.*, p.name as provider_name from public.fin_provider_qualifications x join public.fin_providers p on p.organization_id = x.organization_id and p.id = x.provider_id
            where x.status in ('qualified','qualified_with_conditions') and x.valid_until between p_today and p_today + 30 loop
    v_title := left('Revalidar qualificação: ' || q.provider_name || ' (' || q.category || ')', 200);
    if not exists (select 1 from public.fin_tasks where organization_id = q.organization_id and title = v_title and status = 'open') then
      insert into public.fin_tasks(organization_id, title, due_on, status, created_by) values (q.organization_id, v_title, q.valid_until, 'open', q.owner_id);
      v_tasks := v_tasks + 1;
    end if;
  end loop;
  return jsonb_build_object('qualifications_expired', v_expired, 'evidence_expired', v_ev, 'tasks_created', v_tasks);
end $$;
revoke all on function public.fin_run_qualification_expiry(date) from public, anon, authenticated;
grant execute on function public.fin_run_qualification_expiry(date) to service_role;

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
    ('qualification_events', 'select * from public.fin_qualification_events where organization_id = $1');
$$;
revoke all on function public.fin_governance_export_datasets() from public, anon, authenticated;

insert into public.fin_settings(key, value) values ('schema_version', 'financial-provider-qualification-1') on conflict(key) do update set value = excluded.value, updated_at = now();
commit;

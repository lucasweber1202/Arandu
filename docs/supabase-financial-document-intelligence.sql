-- P1.4 Proposal & Document Intelligence: fatos extraídos de documentos
-- privados, com proveniência por campo e confirmação humana. Um fato é DADO
-- (documento, versão, página/posição, método, versão do parser, confiança,
-- estado), nunca autoridade: campo crítico só vale confirmado por pessoa.
-- O texto do documento é conteúdo não confiável — o banco só aceita fatos de
-- campos conhecidos do schema; nada no documento muda tenant, papel ou policy.
begin;

create table if not exists public.fin_document_extractions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  document_id uuid not null references public.fin_private_documents(id),
  document_version integer not null,
  schema_key text not null check (schema_key in ('credit_proposal','acquiring_proposal','fee_schedule','contract_terms')),
  provider text not null check (provider in ('manual','deterministic_v1','model_external')),
  provider_version text not null check (length(provider_version) between 1 and 60 and provider_version ~ '^[A-Za-z0-9._-]+$'),
  status text not null default 'processing' check (status in ('processing','completed','failed','cancelled')),
  document_sha256 text check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  document_mime text not null,
  pages integer check (pages is null or pages between 1 and 2000),
  error_code text check (error_code is null or error_code in ('unsupported_format','provider_not_configured','unreadable','encrypted','hash_mismatch','too_large','parse_error')),
  warnings text[] not null default '{}',
  flags text[] not null default '{}',
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, id),
  foreign key (document_id, document_version) references public.fin_document_versions(document_id, version),
  check ((status = 'failed') = (error_code is not null)),
  check ((status in ('completed','failed','cancelled')) = (completed_at is not null)),
  check (coalesce(array_length(warnings, 1), 0) <= 20),
  check (coalesce(array_length(flags, 1), 0) <= 20)
);
create index if not exists fin_document_extractions_doc on public.fin_document_extractions(organization_id, document_id, document_version, created_at desc);

create table if not exists public.fin_extraction_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  extraction_id uuid not null,
  document_id uuid not null,
  document_version integer not null,
  schema_key text not null,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  page integer check (page is null or page between 1 and 2000),
  locator text check (locator is null or (length(locator) <= 120 and locator !~ '[<>]')),
  raw_value text check (raw_value is null or length(raw_value) <= 2000),
  normalized_value jsonb,
  value_state text not null check (value_state in ('present','not_provided','not_applicable','unreadable','ambiguous','needs_confirmation')),
  unit text check (unit is null or unit in ('percent','percent_per_year','percent_per_month','days','months')),
  currency text check (currency is null or currency in ('BRL','USD','EUR')),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  method text not null check (method in ('deterministic_parser','manual_entry','model','fixture')),
  parser_version text not null check (length(parser_version) between 1 and 60 and parser_version ~ '^[A-Za-z0-9._-]+$'),
  criticality text not null check (criticality in ('critical','standard')),
  status text not null check (status in ('extracted','needs_review','confirmed','rejected','superseded')),
  flags text[] not null default '{}',
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  rejection_reason text check (rejection_reason is null or (length(trim(rejection_reason)) between 3 and 1000 and rejection_reason !~ '[<>]')),
  supersedes uuid references public.fin_extraction_facts(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, extraction_id) references public.fin_document_extractions(organization_id, id),
  check ((value_state = 'present') = (normalized_value is not null)),
  check ((status = 'confirmed') = (confirmed_by is not null and confirmed_at is not null)),
  check ((status = 'rejected') = (rejection_reason is not null)),
  check (coalesce(array_length(flags, 1), 0) <= 10),
  -- Campo crítico nunca nasce aceito: só a confirmação humana o libera.
  check (not (criticality = 'critical' and status = 'extracted'))
);
create index if not exists fin_extraction_facts_extraction on public.fin_extraction_facts(extraction_id, field_key);
create index if not exists fin_extraction_facts_review on public.fin_extraction_facts(organization_id, status) where status = 'needs_review';

create table if not exists public.fin_extraction_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  fact_id uuid not null,
  from_status text not null,
  to_status text not null check (to_status in ('confirmed','rejected','superseded')),
  action text not null check (action in ('confirm','reject','correct')),
  reason text check (reason is null or (length(trim(reason)) between 3 and 1000 and reason !~ '[<>]')),
  replacement_fact_id uuid,
  actor_id uuid not null references auth.users(id),
  acted_at timestamptz not null default now(),
  foreign key (organization_id, fact_id) references public.fin_extraction_facts(organization_id, id),
  check (action = 'confirm' or reason is not null),
  check ((action = 'correct') = (replacement_fact_id is not null))
);
create index if not exists fin_extraction_reviews_fact on public.fin_extraction_reviews(fact_id, acted_at);

alter table public.fin_document_extractions enable row level security;
alter table public.fin_document_extractions force row level security;
alter table public.fin_extraction_facts enable row level security;
alter table public.fin_extraction_facts force row level security;
alter table public.fin_extraction_reviews enable row level security;
alter table public.fin_extraction_reviews force row level security;
revoke all on public.fin_document_extractions, public.fin_extraction_facts, public.fin_extraction_reviews from public, anon, authenticated;
grant select on public.fin_document_extractions, public.fin_extraction_facts, public.fin_extraction_reviews to authenticated;
grant all on public.fin_document_extractions, public.fin_extraction_facts, public.fin_extraction_reviews to service_role;

-- Leitura: o comprador dono da extração, com papel interno, E o documento
-- legível agora (fin_can_read_document já aplica escopo de entidade). Um
-- provedor nunca lê a extração do comprador, nem do próprio documento.
drop policy if exists fin_document_extraction_read on public.fin_document_extractions;
create policy fin_document_extraction_read on public.fin_document_extractions for select to authenticated using (
  public.fin_has_role(organization_id, array['admin','finance_manager','analyst','viewer'])
  and exists (select 1 from public.fin_organizations o where o.id = organization_id and o.kind = 'BUYER')
  and public.fin_can_read_document(document_id));
drop policy if exists fin_extraction_fact_read on public.fin_extraction_facts;
create policy fin_extraction_fact_read on public.fin_extraction_facts for select to authenticated using (
  exists (select 1 from public.fin_document_extractions x where x.organization_id = fin_extraction_facts.organization_id and x.id = fin_extraction_facts.extraction_id));
drop policy if exists fin_extraction_review_read on public.fin_extraction_reviews;
create policy fin_extraction_review_read on public.fin_extraction_reviews for select to authenticated using (
  exists (select 1 from public.fin_extraction_facts f where f.organization_id = fin_extraction_reviews.organization_id and f.id = fin_extraction_reviews.fact_id));

-- Imutabilidade: extração só fecha uma vez; fato só muda o estado de revisão
-- (uma vez); revisões nunca mudam.
create or replace function public.fin_document_extraction_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','pages','error_code','warnings','flags','completed_at']) is distinct from (to_jsonb(old) - array['status','pages','error_code','warnings','flags','completed_at'])
     or old.status <> 'processing' or new.status = 'processing' then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
create or replace function public.fin_extraction_fact_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','confirmed_by','confirmed_at','rejection_reason']) is distinct from (to_jsonb(old) - array['status','confirmed_by','confirmed_at','rejection_reason'])
     or old.status not in ('extracted','needs_review') or new.status not in ('confirmed','rejected','superseded') then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
revoke all on function public.fin_document_extraction_guard(), public.fin_extraction_fact_guard() from public, anon, authenticated;
drop trigger if exists fin_document_extraction_immutable on public.fin_document_extractions;
create trigger fin_document_extraction_immutable before update on public.fin_document_extractions for each row execute function public.fin_document_extraction_guard();
drop trigger if exists fin_document_extraction_delete on public.fin_document_extractions;
create trigger fin_document_extraction_delete before delete on public.fin_document_extractions for each row execute function public.fin_immutable_row();
drop trigger if exists fin_extraction_fact_immutable on public.fin_extraction_facts;
create trigger fin_extraction_fact_immutable before update on public.fin_extraction_facts for each row execute function public.fin_extraction_fact_guard();
drop trigger if exists fin_extraction_fact_delete on public.fin_extraction_facts;
create trigger fin_extraction_fact_delete before delete on public.fin_extraction_facts for each row execute function public.fin_immutable_row();
drop trigger if exists fin_extraction_review_immutable on public.fin_extraction_reviews;
create trigger fin_extraction_review_immutable before update or delete on public.fin_extraction_reviews for each row execute function public.fin_immutable_row();

-- Campos aceitos por schema (espelha lib/finance/document-intelligence.mjs;
-- scripts/test-document-intelligence.mjs garante que não divergem).
create or replace function public.fin_extraction_schema_field(p_schema text, p_field text)
returns text language sql immutable set search_path = '' as $$
  select case p_schema
    when 'credit_proposal' then case when p_field in ('amount','currency','tenor_months','indexer','spread_pct_year','validity_date') then 'critical'
      when p_field in ('all_in_rate_pct_year','upfront_fee_pct','amortization','grace_months','collateral','covenants') then 'standard' end
    when 'acquiring_proposal' then case when p_field in ('mdr_debit_pct','mdr_credit_pct','mdr_installment_pct','anticipation_pct_month','validity_date') then 'critical'
      when p_field in ('pix_fee_pct','settlement_days','minimum_volume','terminal_fee') then 'standard' end
    when 'fee_schedule' then case when p_field in ('service','charging_unit','rate','currency','effective_from') then 'critical'
      when p_field in ('minimum_amount') then 'standard' end
    when 'contract_terms' then case when p_field in ('start_date','end_date','notice_days','amount_limit','currency') then 'critical'
      when p_field in ('indexer','spread_pct_year','renewal','termination') then 'standard' end
  end
$$;
revoke all on function public.fin_extraction_schema_field(text, text) from public, anon, authenticated;

-- Início: autoriza com o JWT de quem pede e devolve a chave do objeto para o
-- servidor baixar (service role só DEPOIS desta autorização, como no download).
create or replace function public.fin_document_extraction_begin(p_org uuid, p_document uuid, p_version integer, p_schema text, p_provider text, p_provider_version text)
returns table(extraction_id uuid, bucket text, path text, mime_type text, sha256 text, size_bytes bigint)
language plpgsql security definer set search_path = '' as $$
declare d public.fin_private_documents%rowtype; v public.fin_document_versions%rowtype; x uuid;
begin
  if auth.uid() is null or not public.fin_has_role(p_org, array['admin','finance_manager','analyst'])
     or not exists (select 1 from public.fin_organizations where id = p_org and kind = 'BUYER') then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  select * into d from public.fin_private_documents where id = p_document;
  if d.id is null or d.buyer_organization_id <> p_org or d.removed_at is not null or not public.fin_can_read_document(p_document) then raise exception 'forbidden'; end if;
  if p_schema is null or p_schema not in ('credit_proposal','acquiring_proposal','fee_schedule','contract_terms')
     or p_provider is null or p_provider not in ('manual','deterministic_v1','model_external')
     or p_provider_version is null or p_provider_version !~ '^[A-Za-z0-9._-]{1,60}$' then raise exception 'invalid extraction'; end if;
  select * into v from public.fin_document_versions where document_id = p_document and version = coalesce(p_version, d.current_version) and status = 'available';
  if v.document_id is null then raise exception 'document not available'; end if;
  insert into public.fin_document_extractions(organization_id, document_id, document_version, schema_key, provider, provider_version, document_sha256, document_mime, requested_by)
  values (p_org, d.id, v.version, p_schema, p_provider, p_provider_version, v.sha256, v.mime_type, auth.uid()) returning id into x;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (p_org, d.entity_type, d.entity_id, 'document_extraction_started', auth.uid(), jsonb_build_object('extraction_id', x, 'document_id', d.id, 'version', v.version, 'schema', p_schema, 'provider', p_provider));
  return query select x, v.storage_bucket, case when p_provider = 'manual' then null else v.storage_path end, v.mime_type, v.sha256, v.size_bytes;
end $$;
revoke all on function public.fin_document_extraction_begin(uuid, uuid, integer, text, text, text) from public, anon;
grant execute on function public.fin_document_extraction_begin(uuid, uuid, integer, text, text, text) to authenticated;

-- Registro dos fatos. O estado inicial é decidido AQUI (não pelo cliente):
-- crítico, ausente, ambíguo ou de baixa confiança → revisão. Gera uma tarefa
-- idempotente de revisão no objeto de origem do documento.
create or replace function public.fin_document_extraction_record(p_extraction uuid, p_result jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare x public.fin_document_extractions%rowtype; d public.fin_private_documents%rowtype; f jsonb; v_crit text; v_status text; v_conf numeric; v_count integer := 0; v_review integer := 0; v_title text;
begin
  select * into x from public.fin_document_extractions where id = p_extraction for update;
  if x.id is null or auth.uid() is null or x.requested_by <> auth.uid() or not public.fin_can_read_document(x.document_id)
     or not public.fin_has_role(x.organization_id, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  if x.status <> 'processing' then raise exception 'extraction closed'; end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(p_result->'facts') is distinct from 'array' or jsonb_array_length(p_result->'facts') > 200
     or length(p_result::text) > 400000 then raise exception 'invalid extraction'; end if;
  for f in select value from jsonb_array_elements(p_result->'facts') loop
    if jsonb_typeof(f) <> 'object' then raise exception 'invalid extraction fact'; end if;
    v_crit := public.fin_extraction_schema_field(x.schema_key, f->>'field_key');
    if v_crit is null then raise exception 'invalid extraction fact'; end if;
    if exists (select 1 from jsonb_object_keys(f) k where k not in ('field_key','page','locator','raw_value','normalized_value','value_state','unit','currency','confidence','method','parser_version','criticality','status','flags')) then raise exception 'invalid extraction fact'; end if;
    if (f->>'method') is distinct from (case x.provider when 'manual' then 'manual_entry' when 'deterministic_v1' then 'deterministic_parser' else 'model' end) then raise exception 'invalid extraction fact'; end if;
    if f ? 'confidence' and jsonb_typeof(f->'confidence') not in ('number','null') then raise exception 'invalid extraction fact'; end if;
    v_conf := (f->>'confidence')::numeric;
    v_status := case when v_crit = 'standard' and f->>'value_state' = 'present' and coalesce(v_conf, 0) >= 0.85 then 'extracted' else 'needs_review' end;
    begin
      insert into public.fin_extraction_facts(organization_id, extraction_id, document_id, document_version, schema_key, field_key, page, locator, raw_value, normalized_value, value_state, unit, currency, confidence, method, parser_version, criticality, status, flags, created_by)
      values (x.organization_id, x.id, x.document_id, x.document_version, x.schema_key, f->>'field_key', (f->>'page')::integer, nullif(f->>'locator', ''),
        nullif(left(regexp_replace(coalesce(f->>'raw_value', ''), '[[:cntrl:]]', ' ', 'g'), 2000), ''),
        case when f->>'value_state' = 'present' then f->'normalized_value' end, f->>'value_state', nullif(f->>'unit', ''), nullif(f->>'currency', ''), v_conf, f->>'method',
        coalesce(f->>'parser_version', x.provider_version), v_crit, v_status,
        coalesce((select array_agg(e) from jsonb_array_elements_text(case when jsonb_typeof(f->'flags') = 'array' then f->'flags' else '[]'::jsonb end) e where e ~ '^[a-z_]{3,40}$'), '{}'), auth.uid());
    exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'invalid extraction fact';
    end;
    v_count := v_count + 1;
    if v_status = 'needs_review' then v_review := v_review + 1; end if;
  end loop;
  update public.fin_document_extractions set status = 'completed', completed_at = now(),
    pages = case when jsonb_typeof(p_result->'pages') = 'number' then least(greatest((p_result->>'pages')::integer, 1), 2000) end,
    warnings = coalesce((select array_agg(e) from (select e from jsonb_array_elements_text(case when jsonb_typeof(p_result->'warnings') = 'array' then p_result->'warnings' else '[]'::jsonb end) e where e ~ '^[a-z_]{3,40}$' limit 20) w), '{}'),
    flags = coalesce((select array_agg(e) from (select e from jsonb_array_elements_text(case when jsonb_typeof(p_result->'flags') = 'array' then p_result->'flags' else '[]'::jsonb end) e where e ~ '^[a-z_]{3,40}$' limit 20) w), '{}')
  where id = x.id;
  select * into d from public.fin_private_documents where id = x.document_id;
  if v_review > 0 and d.entity_type in ('rfq','proposal','contract') then
    v_title := left('Revisar fatos extraídos: ' || d.title, 200);
    if not exists (select 1 from public.fin_tasks where organization_id = x.organization_id and related_type = d.entity_type and related_id = d.entity_id and title = v_title and status = 'open') then
      insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (x.organization_id, v_title, current_date + 3, 'open', d.entity_type, d.entity_id, auth.uid());
    end if;
  end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (x.organization_id, d.entity_type, d.entity_id, 'document_extraction_completed', auth.uid(), jsonb_build_object('extraction_id', x.id, 'facts', v_count, 'needs_review', v_review));
  return v_count;
end $$;
revoke all on function public.fin_document_extraction_record(uuid, jsonb) from public, anon;
grant execute on function public.fin_document_extraction_record(uuid, jsonb) to authenticated;

create or replace function public.fin_document_extraction_fail(p_extraction uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.fin_document_extractions%rowtype; d public.fin_private_documents%rowtype;
begin
  select * into x from public.fin_document_extractions where id = p_extraction for update;
  if x.id is null or auth.uid() is null or x.requested_by <> auth.uid() then raise exception 'forbidden'; end if;
  if x.status <> 'processing' then raise exception 'extraction closed'; end if;
  if p_code is null or p_code not in ('unsupported_format','provider_not_configured','unreadable','encrypted','hash_mismatch','too_large','parse_error') then raise exception 'invalid extraction'; end if;
  update public.fin_document_extractions set status = 'failed', error_code = p_code, completed_at = now() where id = x.id;
  select * into d from public.fin_private_documents where id = x.document_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (x.organization_id, d.entity_type, d.entity_id, 'document_extraction_failed', auth.uid(), jsonb_build_object('extraction_id', x.id, 'document_id', d.id, 'code', p_code));
end $$;
revoke all on function public.fin_document_extraction_fail(uuid, text) from public, anon;
grant execute on function public.fin_document_extraction_fail(uuid, text) to authenticated;

-- Revisão humana: confirmar, rejeitar (com motivo) ou corrigir (novo fato
-- `manual_entry` já confirmado, que substitui o anterior). Campo crítico só
-- é confirmado/corrigido por admin ou gestão financeira.
create or replace function public.fin_review_extraction_fact(p_fact uuid, p_expected text, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.fin_extraction_facts%rowtype; d public.fin_private_documents%rowtype; v_action text := p_input->>'action'; v_reason text := nullif(trim(coalesce(p_input->>'reason', '')), ''); v_new uuid; v_to text;
begin
  select * into f from public.fin_extraction_facts where id = p_fact for update;
  if f.id is null or auth.uid() is null or not public.fin_has_role(f.organization_id, array['admin','finance_manager','analyst'])
     or not exists (select 1 from public.fin_document_extractions x where x.id = f.extraction_id and public.fin_can_read_document(x.document_id)) then raise exception 'forbidden'; end if;
  if f.criticality = 'critical' and v_action in ('confirm','correct') and not public.fin_has_role(f.organization_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(f.organization_id) then raise exception 'organization offboarding'; end if;
  if p_expected is distinct from f.status or f.status not in ('extracted','needs_review') then raise exception 'extraction review conflict'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or v_action is null or v_action not in ('confirm','reject','correct')
     or (v_action <> 'confirm' and (v_reason is null or length(v_reason) not between 3 and 1000 or v_reason ~ '[<>]'))
     or (v_action = 'confirm' and f.value_state <> 'present') then raise exception 'invalid extraction review'; end if;
  if v_action = 'correct' then
    if p_input->>'value_state' is null or (p_input->>'value_state' = 'present' and jsonb_typeof(p_input->'normalized_value') is null) then raise exception 'invalid extraction review'; end if;
    begin
      insert into public.fin_extraction_facts(organization_id, extraction_id, document_id, document_version, schema_key, field_key, page, locator, raw_value, normalized_value, value_state, unit, currency, confidence, method, parser_version, criticality, status, confirmed_by, confirmed_at, supersedes, created_by)
      values (f.organization_id, f.extraction_id, f.document_id, f.document_version, f.schema_key, f.field_key, f.page, f.locator,
        left(coalesce(p_input->>'raw_value', f.raw_value), 2000), case when p_input->>'value_state' = 'present' then p_input->'normalized_value' end, p_input->>'value_state',
        nullif(p_input->>'unit', ''), nullif(p_input->>'currency', ''), 1, 'manual_entry', 'human-correction-1', f.criticality, 'confirmed', auth.uid(), now(), f.id, auth.uid())
      returning id into v_new;
    exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid extraction review';
    end;
    v_to := 'superseded';
    update public.fin_extraction_facts set status = 'superseded' where id = f.id;
  elsif v_action = 'confirm' then
    v_to := 'confirmed';
    update public.fin_extraction_facts set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = f.id;
  else
    v_to := 'rejected';
    update public.fin_extraction_facts set status = 'rejected', rejection_reason = v_reason where id = f.id;
  end if;
  insert into public.fin_extraction_reviews(organization_id, fact_id, from_status, to_status, action, reason, replacement_fact_id, actor_id)
  values (f.organization_id, f.id, f.status, v_to, v_action, v_reason, v_new, auth.uid());
  select * into d from public.fin_private_documents where id = f.document_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (f.organization_id, d.entity_type, d.entity_id, 'extraction_fact_' || v_to, auth.uid(), jsonb_build_object('fact_id', f.id, 'document_id', d.id, 'field', f.field_key, 'replacement', v_new));
  return coalesce(v_new, f.id);
end $$;
revoke all on function public.fin_review_extraction_fact(uuid, text, jsonb) from public, anon;
grant execute on function public.fin_review_extraction_fact(uuid, text, jsonb) to authenticated;

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
    ('extraction_reviews', 'select * from public.fin_extraction_reviews where organization_id = $1');
$$;
revoke all on function public.fin_governance_export_datasets() from public, anon, authenticated;

insert into public.fin_settings(key, value) values ('schema_version', 'financial-document-intelligence-1') on conflict(key) do update set value = excluded.value, updated_at = now();
commit;

-- Financial Relationship & Portfolio (guideline §12, §13, §25; addendum v2.1
-- H.1 itens 6 e 7). Aditivo e idempotente.
-- Rollback: docs/rollback/supabase-financial-relationships-portfolio.rollback.sql
--
-- Provider/Bank Relationship Management:
--   * contatos por provedor (opcionalmente por entidade), relação provedor ×
--     entidade com owner e categorias, issues/follow-ups com resolução;
--   * scorecards DEFINIDOS PELO CLIENTE, versionados (template imutável) e
--     avaliações imutáveis. O resultado ponderado usa só critérios e pesos da
--     empresa e é rotulado como dela. Não existe score default do Arandu.
--
-- Debt / Facilities / Limits / Guarantees (visão de procurement, NÃO ledger):
--   * facility com limite, principal, indexador, spread, vencimento, contrato
--     fonte, owner e proveniência (origem, referência, verificado em, revisar
--     depois de); alterações relevantes ficam em histórico append-only;
--   * saldo/uso de limite são fotografias datadas (point-in-time, append-only),
--     declaradas ou importadas — o Arandu não calcula juros nem saldo;
--   * cronograma de amortização declarado (resumo) e garantias comprometidas.
--
-- Isolamento: tudo que pertence a uma entidade segue fin_entity_visible; o
-- que é de nível de grupo (contato geral do provedor, template de scorecard)
-- é legível por qualquer membro da compradora. Provedor nunca lê nada daqui.

-- ------------------------------------------------- 1. relacionamento
create table if not exists public.fin_provider_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider_id uuid not null,
  legal_entity_id uuid,
  name text not null check (length(trim(name)) between 2 and 120 and name !~ '[<>@]'),
  title text check (title is null or (length(trim(title)) between 2 and 120 and title !~ '[<>]')),
  email text check (email is null or email ~* '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$'),
  phone text check (phone is null or phone ~ '^[0-9+() .-]{6,40}$'),
  is_primary boolean not null default false,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id)
);
create index if not exists fin_provider_contacts_provider on public.fin_provider_contacts(organization_id, provider_id);

create table if not exists public.fin_provider_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider_id uuid not null,
  legal_entity_id uuid not null,
  status text not null default 'active' check (status in ('prospect','active','inactive')),
  owner_id uuid references auth.users(id),
  categories text[] not null default '{}' check (cardinality(categories) <= 10),
  since_on date,
  notes text check (notes is null or (length(notes) <= 2000 and notes !~ '[<>]')),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_id, legal_entity_id),
  unique (organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id)
);

create table if not exists public.fin_provider_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider_id uuid not null,
  legal_entity_id uuid,
  contract_id uuid,
  title text not null check (length(trim(title)) between 3 and 200 and title !~ '[<>]'),
  description text check (description is null or (length(description) <= 4000 and description !~ '[<>]')),
  category text not null default 'service' check (category in ('service','billing','implementation','compliance','documentation','other')),
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','cancelled')),
  opened_on date not null default current_date,
  due_on date,
  resolved_at timestamptz,
  resolution text check (resolution is null or (length(resolution) <= 2000 and resolution !~ '[<>]')),
  owner_id uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  foreign key (organization_id, contract_id) references public.fin_contracts(organization_id, id),
  check ((status in ('resolved','cancelled')) = (resolved_at is not null))
);
create index if not exists fin_provider_issues_provider on public.fin_provider_issues(organization_id, provider_id, status);

-- Scorecard do cliente: template versionado. Cada versão é imutável; mudar
-- critério ou peso cria versão nova e avaliações antigas mantêm a delas.
create table if not exists public.fin_scorecard_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  version integer not null check (version > 0),
  name text not null check (length(trim(name)) between 2 and 120 and name !~ '[<>]'),
  criteria jsonb not null,
  status text not null default 'active' check (status in ('active','retired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, template_key, version),
  unique (organization_id, id)
);

create table if not exists public.fin_provider_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider_id uuid not null,
  template_id uuid not null,
  legal_entity_id uuid,
  period_start date not null,
  period_end date not null,
  scores jsonb not null check (jsonb_typeof(scores) = 'object'),
  weighted_result numeric(7,3),
  answered_weight numeric(7,3) not null,
  comment text check (comment is null or (length(comment) <= 2000 and comment !~ '[<>]')),
  reviewer_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id),
  foreign key (organization_id, template_id) references public.fin_scorecard_templates(organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  check (period_end >= period_start)
);
create index if not exists fin_provider_reviews_provider on public.fin_provider_reviews(organization_id, provider_id, period_end desc);

-- ------------------------------------------------- 2. facilities e garantias
create table if not exists public.fin_facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  legal_entity_id uuid,
  provider_id uuid not null,
  contract_id uuid,
  kind text not null check (kind in ('term_loan','revolving_credit','overdraft','guarantee_line','trade_finance','leasing','debenture','receivables_line','other')),
  name text not null check (length(trim(name)) between 2 and 200 and name !~ '[<>]'),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  approved_limit numeric(18,2) check (approved_limit is null or approved_limit >= 0),
  principal_amount numeric(18,2) check (principal_amount is null or principal_amount >= 0),
  indexer text check (indexer is null or indexer in ('pre','cdi','ipca','selic','tr','tjlp','sofr','usd','other')),
  spread_pct_year numeric(9,4) check (spread_pct_year is null or spread_pct_year between -100 and 100),
  rate_pct_year numeric(9,4) check (rate_pct_year is null or rate_pct_year between 0 and 1000),
  amortization text check (amortization is null or amortization in ('price','sac','bullet','customizada')),
  starts_on date,
  maturity_on date,
  status text not null default 'active' check (status in ('prospective','active','matured','cancelled')),
  owner_id uuid references auth.users(id),
  source text not null default 'declared' check (source in ('declared','contract','import','integration')),
  source_reference text check (source_reference is null or (length(source_reference) <= 300 and source_reference !~ '[<>]')),
  verified_at timestamptz,
  review_after_days integer not null default 90 check (review_after_days between 7 and 1825),
  notes text check (notes is null or (length(notes) <= 2000 and notes !~ '[<>]')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  foreign key (organization_id, contract_id) references public.fin_contracts(organization_id, id),
  check (maturity_on is null or starts_on is null or maturity_on >= starts_on),
  check (approved_limit is not null or principal_amount is not null)
);
create index if not exists fin_facilities_org on public.fin_facilities(organization_id, legal_entity_id, status, maturity_on);
create index if not exists fin_facilities_provider on public.fin_facilities(organization_id, provider_id);

-- Histórico de alterações materiais (append-only, por gatilho).
create table if not exists public.fin_facility_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  previous jsonb not null,
  current jsonb not null,
  foreign key (organization_id, facility_id) references public.fin_facilities(organization_id, id)
);
create index if not exists fin_facility_history_facility on public.fin_facility_history(organization_id, facility_id, changed_at desc);

-- Saldo e uso de limite: fotografias datadas, nunca sobrescritas.
create table if not exists public.fin_facility_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  as_of date not null,
  outstanding_amount numeric(18,2) check (outstanding_amount is null or outstanding_amount >= 0),
  used_limit_amount numeric(18,2) check (used_limit_amount is null or used_limit_amount >= 0),
  source text not null check (source in ('declared','statement','import','integration')),
  source_reference text check (source_reference is null or (length(source_reference) <= 300 and source_reference !~ '[<>]')),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key (organization_id, facility_id) references public.fin_facilities(organization_id, id),
  check (outstanding_amount is not null or used_limit_amount is not null)
);
create index if not exists fin_facility_balances_latest on public.fin_facility_balances(organization_id, facility_id, as_of desc, recorded_at desc);

-- Cronograma declarado (resumo de amortização). Substituir o cronograma cria
-- um conjunto novo (schedule_version); o anterior continua para auditoria.
create table if not exists public.fin_facility_repayments (
  organization_id uuid not null,
  facility_id uuid not null,
  schedule_version integer not null check (schedule_version > 0),
  due_on date not null,
  principal_amount numeric(18,2) not null check (principal_amount >= 0),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  primary key (facility_id, schedule_version, due_on),
  foreign key (organization_id, facility_id) references public.fin_facilities(organization_id, id)
);
alter table public.fin_facilities add column if not exists schedule_version integer not null default 0;

create table if not exists public.fin_guarantees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  legal_entity_id uuid,
  facility_id uuid,
  contract_id uuid,
  provider_id uuid,
  kind text not null check (kind in ('receivables','real_estate','equipment','cash_collateral','investment_pledge','bank_guarantee','surety','aval','fiduciary_assignment','other')),
  description text not null check (length(trim(description)) between 3 and 500 and description !~ '[<>]'),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  committed_amount numeric(18,2) check (committed_amount is null or committed_amount >= 0),
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active','released','expired')),
  source text not null default 'declared' check (source in ('declared','contract','import','integration')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.fin_legal_entities(organization_id, id),
  foreign key (organization_id, facility_id) references public.fin_facilities(organization_id, id),
  foreign key (organization_id, contract_id) references public.fin_contracts(organization_id, id),
  foreign key (organization_id, provider_id) references public.fin_providers(organization_id, id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists fin_guarantees_org on public.fin_guarantees(organization_id, legal_entity_id, status);

-- ------------------------------------------------- 3. imutabilidade e trilha
drop trigger if exists fin_scorecard_templates_immutable on public.fin_scorecard_templates;
create trigger fin_scorecard_templates_immutable before delete on public.fin_scorecard_templates
  for each row execute function public.fin_immutable_row();
create or replace function public.fin_scorecard_template_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Só o estado muda (aposentar); critérios, pesos, nome e versão não.
  if new.criteria is distinct from old.criteria or new.name is distinct from old.name or new.version is distinct from old.version
     or new.template_key is distinct from old.template_key or new.organization_id is distinct from old.organization_id then
    raise exception 'immutable record';
  end if;
  return new;
end $$;
drop trigger if exists fin_scorecard_templates_guard on public.fin_scorecard_templates;
create trigger fin_scorecard_templates_guard before update on public.fin_scorecard_templates
  for each row execute function public.fin_scorecard_template_guard();
drop trigger if exists fin_provider_reviews_immutable on public.fin_provider_reviews;
create trigger fin_provider_reviews_immutable before update or delete on public.fin_provider_reviews
  for each row execute function public.fin_immutable_row();
drop trigger if exists fin_facility_balances_immutable on public.fin_facility_balances;
create trigger fin_facility_balances_immutable before update or delete on public.fin_facility_balances
  for each row execute function public.fin_immutable_row();
drop trigger if exists fin_facility_history_immutable on public.fin_facility_history;
create trigger fin_facility_history_immutable before update or delete on public.fin_facility_history
  for each row execute function public.fin_immutable_row();
drop trigger if exists fin_facility_repayments_immutable on public.fin_facility_repayments;
create trigger fin_facility_repayments_immutable before update or delete on public.fin_facility_repayments
  for each row execute function public.fin_immutable_row();

create or replace function public.fin_facility_history_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb;
begin
  v_old := to_jsonb(old) - array['updated_at','created_at','created_by','notes'];
  v_new := to_jsonb(new) - array['updated_at','created_at','created_by','notes'];
  if v_old is distinct from v_new then
    insert into public.fin_facility_history(organization_id, facility_id, changed_by, previous, current)
      values (new.organization_id, new.id, auth.uid(),
        (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v_old) where v_new -> key is distinct from value),
        (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v_new) where v_old -> key is distinct from value));
  end if;
  return new;
end $$;
drop trigger if exists fin_facilities_history on public.fin_facilities;
create trigger fin_facilities_history after update on public.fin_facilities
  for each row execute function public.fin_facility_history_trigger();

-- Entidade da facility para os objetos ligados a ela (trilha e policies).
create or replace function public.fin_facility_visible(p_facility uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fin_facilities f where f.id = p_facility and public.fin_entity_visible(f.organization_id, f.legal_entity_id));
$$;

-- ------------------------------------------------- 4. RLS
do $$
declare t text;
begin
  foreach t in array array['fin_provider_contacts','fin_provider_relationships','fin_provider_issues','fin_scorecard_templates',
                           'fin_provider_reviews','fin_facilities','fin_facility_history','fin_facility_balances','fin_facility_repayments','fin_guarantees'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Objeto de nível de grupo (sem entidade) é legível por todo membro da
-- compradora; com entidade, só por quem a alcança.
create or replace function public.fin_group_or_entity_visible(p_org uuid, p_entity uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fin_has_role(p_org) and (p_entity is null or public.fin_entity_visible(p_org, p_entity))
     and exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER');
$$;

drop policy if exists fin_provider_contact_read on public.fin_provider_contacts;
create policy fin_provider_contact_read on public.fin_provider_contacts for select to authenticated
  using (public.fin_group_or_entity_visible(organization_id, legal_entity_id));
drop policy if exists fin_provider_relationship_read on public.fin_provider_relationships;
create policy fin_provider_relationship_read on public.fin_provider_relationships for select to authenticated
  using (public.fin_entity_visible(organization_id, legal_entity_id));
drop policy if exists fin_provider_issue_read on public.fin_provider_issues;
create policy fin_provider_issue_read on public.fin_provider_issues for select to authenticated
  using (public.fin_group_or_entity_visible(organization_id, legal_entity_id)
         and (contract_id is null or public.fin_contract_visible(contract_id)));
drop policy if exists fin_scorecard_template_read on public.fin_scorecard_templates;
create policy fin_scorecard_template_read on public.fin_scorecard_templates for select to authenticated
  using (public.fin_group_or_entity_visible(organization_id, null));
drop policy if exists fin_provider_review_read on public.fin_provider_reviews;
create policy fin_provider_review_read on public.fin_provider_reviews for select to authenticated
  using (public.fin_group_or_entity_visible(organization_id, legal_entity_id));
drop policy if exists fin_facility_read on public.fin_facilities;
create policy fin_facility_read on public.fin_facilities for select to authenticated
  using (public.fin_entity_visible(organization_id, legal_entity_id));
drop policy if exists fin_facility_history_read on public.fin_facility_history;
create policy fin_facility_history_read on public.fin_facility_history for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_facility_visible(facility_id));
drop policy if exists fin_facility_balance_read on public.fin_facility_balances;
create policy fin_facility_balance_read on public.fin_facility_balances for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_facility_visible(facility_id));
drop policy if exists fin_facility_repayment_read on public.fin_facility_repayments;
create policy fin_facility_repayment_read on public.fin_facility_repayments for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_facility_visible(facility_id));
drop policy if exists fin_guarantee_read on public.fin_guarantees;
create policy fin_guarantee_read on public.fin_guarantees for select to authenticated
  using (public.fin_entity_visible(organization_id, legal_entity_id)
         and (facility_id is null or public.fin_facility_visible(facility_id))
         and (contract_id is null or public.fin_contract_visible(contract_id)));

-- ------------------------------------------------- 5. RPCs
-- Escrita de portfólio: admin/gestão financeira/analista que alcança a entidade.
create or replace function public.fin_assert_portfolio_write(p_org uuid, p_entity uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if not public.fin_entity_allows(p_org, p_entity, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  if p_entity is not null and not exists (select 1 from public.fin_legal_entities e where e.organization_id = p_org and e.id = p_entity and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
end $$;

create or replace function public.fin_add_provider_contact(
  p_org uuid, p_provider uuid, p_name text, p_title text default null, p_email text default null, p_phone text default null,
  p_entity uuid default null, p_primary boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  -- Contato de nível de grupo pode ser criado por qualquer membro de escrita;
  -- contato de entidade, só por quem alcança a entidade.
  if p_entity is null then
    if not public.fin_has_role(p_org, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  else
    perform public.fin_assert_portfolio_write(p_org, p_entity);
  end if;
  if not exists (select 1 from public.fin_providers p where p.organization_id = p_org and p.id = p_provider) then raise exception 'provider not found'; end if;
  if p_primary then
    update public.fin_provider_contacts set is_primary = false
     where organization_id = p_org and provider_id = p_provider and legal_entity_id is not distinct from p_entity and archived_at is null;
  end if;
  insert into public.fin_provider_contacts(organization_id, provider_id, legal_entity_id, name, title, email, phone, is_primary, created_by)
    values (p_org, p_provider, p_entity, trim(p_name), nullif(trim(coalesce(p_title,'')),''), nullif(lower(trim(coalesce(p_email,''))),''),
      nullif(trim(coalesce(p_phone,'')),''), coalesce(p_primary, false), auth.uid())
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (p_org, 'provider', p_provider, 'provider_contact_added', auth.uid(), jsonb_build_object('contact_id', v_id), p_entity);
  return v_id;
exception when check_violation then raise exception 'invalid contact';
end $$;

create or replace function public.fin_archive_provider_contact(p_contact uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.fin_provider_contacts%rowtype;
begin
  select * into v from public.fin_provider_contacts where id = p_contact for update;
  if not found or not public.fin_entity_allows(v.organization_id, v.legal_entity_id, array['admin','finance_manager','analyst'])
     and not (v.legal_entity_id is null and public.fin_has_role(v.organization_id, array['admin','finance_manager','analyst'])) then
    raise exception 'contact not found';
  end if;
  update public.fin_provider_contacts set archived_at = coalesce(archived_at, now()), is_primary = false where id = p_contact;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (v.organization_id, 'provider', v.provider_id, 'provider_contact_archived', auth.uid(), jsonb_build_object('contact_id', v.id), v.legal_entity_id);
end $$;

create or replace function public.fin_set_provider_relationship(
  p_org uuid, p_provider uuid, p_entity uuid, p_status text, p_owner uuid default null,
  p_categories text[] default '{}', p_since date default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_entity is null then raise exception 'invalid legal entity'; end if;
  perform public.fin_assert_portfolio_write(p_org, p_entity);
  if not exists (select 1 from public.fin_providers p where p.organization_id = p_org and p.id = p_provider) then raise exception 'provider not found'; end if;
  if p_owner is not null and not exists (select 1 from public.fin_members m where m.organization_id = p_org and m.user_id = p_owner) then raise exception 'invalid owner'; end if;
  if exists (select 1 from unnest(coalesce(p_categories,'{}')) c where c not in ('credit','acquiring','cash_management','guarantee','fx','insurance','investment','other')) then
    raise exception 'invalid relationship';
  end if;
  insert into public.fin_provider_relationships(organization_id, provider_id, legal_entity_id, status, owner_id, categories, since_on, notes, updated_by)
    values (p_org, p_provider, p_entity, p_status, p_owner, coalesce(p_categories,'{}'), p_since, nullif(trim(coalesce(p_notes,'')),''), auth.uid())
    on conflict (organization_id, provider_id, legal_entity_id) do update set
      status = excluded.status, owner_id = excluded.owner_id, categories = excluded.categories, since_on = excluded.since_on,
      notes = excluded.notes, updated_by = auth.uid(), updated_at = now()
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (p_org, 'provider', p_provider, 'provider_relationship_set', auth.uid(), jsonb_build_object('status', p_status, 'categories', cardinality(coalesce(p_categories,'{}'))), p_entity);
  return v_id;
exception when check_violation then raise exception 'invalid relationship';
end $$;

create or replace function public.fin_open_provider_issue(
  p_org uuid, p_provider uuid, p_title text, p_category text default 'service', p_severity text default 'medium',
  p_description text default null, p_entity uuid default null, p_contract uuid default null, p_due date default null, p_owner uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_entity uuid := p_entity;
begin
  if p_contract is not null then
    select legal_entity_id into v_entity from public.fin_contracts where id = p_contract and organization_id = p_org and provider_id = p_provider;
    if not found then raise exception 'contract not found'; end if;
    if p_entity is not null and p_entity is distinct from v_entity then raise exception 'invalid legal entity'; end if;
  end if;
  perform public.fin_assert_portfolio_write(p_org, v_entity);
  if not exists (select 1 from public.fin_providers p where p.organization_id = p_org and p.id = p_provider) then raise exception 'provider not found'; end if;
  if p_owner is not null and not exists (select 1 from public.fin_members m where m.organization_id = p_org and m.user_id = p_owner) then raise exception 'invalid owner'; end if;
  insert into public.fin_provider_issues(organization_id, provider_id, legal_entity_id, contract_id, title, description, category, severity, due_on, owner_id, created_by)
    values (p_org, p_provider, v_entity, p_contract, trim(p_title), nullif(trim(coalesce(p_description,'')),''), coalesce(p_category,'service'),
      coalesce(p_severity,'medium'), p_due, coalesce(p_owner, auth.uid()), auth.uid())
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (p_org, 'provider', p_provider, 'provider_issue_opened', auth.uid(), jsonb_build_object('issue_id', v_id, 'severity', p_severity, 'category', p_category), v_entity);
  return v_id;
exception when check_violation then raise exception 'invalid issue';
end $$;

create or replace function public.fin_update_provider_issue(p_issue uuid, p_status text, p_resolution text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.fin_provider_issues%rowtype;
begin
  select * into v from public.fin_provider_issues where id = p_issue for update;
  if not found then raise exception 'issue not found'; end if;
  perform public.fin_assert_portfolio_write(v.organization_id, v.legal_entity_id);
  if v.status in ('resolved','cancelled') then raise exception 'issue closed'; end if;
  if p_status not in ('in_progress','resolved','cancelled') then raise exception 'invalid issue'; end if;
  if p_status = 'resolved' and length(trim(coalesce(p_resolution,''))) < 3 then raise exception 'resolution required'; end if;
  update public.fin_provider_issues set status = p_status, updated_at = now(),
      resolved_at = case when p_status in ('resolved','cancelled') then now() else null end,
      resolution = coalesce(nullif(trim(coalesce(p_resolution,'')),''), resolution)
   where id = p_issue;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (v.organization_id, 'provider', v.provider_id, 'provider_issue_' || p_status, auth.uid(), jsonb_build_object('issue_id', v.id), v.legal_entity_id);
exception when check_violation then raise exception 'invalid issue';
end $$;

-- Template de scorecard: critérios [{key,label,weight,scale_max}], pesos > 0.
-- Nova versão do mesmo template aposenta a anterior.
create or replace function public.fin_create_scorecard_template(p_org uuid, p_key text, p_name text, p_criteria jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_version integer; c jsonb; v_keys text[] := '{}';
begin
  if not public.fin_has_role(p_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if jsonb_typeof(p_criteria) <> 'array' or jsonb_array_length(p_criteria) not between 1 and 20 or p_criteria::text ~ '[<>]' then raise exception 'invalid scorecard'; end if;
  for c in select * from jsonb_array_elements(p_criteria) loop
    if coalesce(c->>'key','') !~ '^[a-z][a-z0-9_]{1,40}$' or length(coalesce(c->>'label','')) not between 2 and 120
       or jsonb_typeof(c->'weight') <> 'number' or (c->>'weight')::numeric <= 0 or (c->>'weight')::numeric > 100
       or jsonb_typeof(c->'scale_max') <> 'number' or (c->>'scale_max')::numeric not in (5, 10, 100)
       or (c->>'key') = any(v_keys) then
      raise exception 'invalid scorecard';
    end if;
    v_keys := v_keys || (c->>'key');
  end loop;
  select coalesce(max(version), 0) + 1 into v_version from public.fin_scorecard_templates where organization_id = p_org and template_key = p_key;
  update public.fin_scorecard_templates set status = 'retired' where organization_id = p_org and template_key = p_key and status = 'active';
  insert into public.fin_scorecard_templates(organization_id, template_key, version, name, criteria, created_by)
    values (p_org, p_key, v_version, trim(p_name), p_criteria, auth.uid()) returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'organization', p_org, 'scorecard_template_created', auth.uid(), jsonb_build_object('template_id', v_id, 'version', v_version, 'criteria', jsonb_array_length(p_criteria)));
  return v_id;
exception when check_violation then raise exception 'invalid scorecard';
end $$;

-- Avaliação: notas por critério do template ATIVO; resultado = média ponderada
-- normalizada (0–100) só sobre os critérios respondidos, com o peso
-- respondido explícito (mesma regra de cobertura da comparação).
create or replace function public.fin_record_provider_review(
  p_org uuid, p_provider uuid, p_template uuid, p_period_start date, p_period_end date, p_scores jsonb,
  p_entity uuid default null, p_comment text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.fin_scorecard_templates%rowtype; c jsonb; v_total numeric := 0; v_answered numeric := 0; v_sum numeric := 0; v_score numeric; v_id uuid;
begin
  perform public.fin_assert_portfolio_write(p_org, p_entity);
  select * into t from public.fin_scorecard_templates where id = p_template and organization_id = p_org;
  if not found or t.status <> 'active' then raise exception 'invalid scorecard'; end if;
  if not exists (select 1 from public.fin_providers p where p.organization_id = p_org and p.id = p_provider) then raise exception 'provider not found'; end if;
  if jsonb_typeof(p_scores) <> 'object' or exists (select 1 from jsonb_object_keys(p_scores) k
       where not exists (select 1 from jsonb_array_elements(t.criteria) x where x->>'key' = k)) then
    raise exception 'invalid review';
  end if;
  for c in select * from jsonb_array_elements(t.criteria) loop
    v_total := v_total + (c->>'weight')::numeric;
    if p_scores ? (c->>'key') then
      if jsonb_typeof(p_scores->(c->>'key')) <> 'number' then raise exception 'invalid review'; end if;
      v_score := (p_scores->>(c->>'key'))::numeric;
      if v_score < 0 or v_score > (c->>'scale_max')::numeric then raise exception 'invalid review'; end if;
      v_answered := v_answered + (c->>'weight')::numeric;
      v_sum := v_sum + (c->>'weight')::numeric * v_score / (c->>'scale_max')::numeric * 100;
    end if;
  end loop;
  if v_answered = 0 then raise exception 'invalid review'; end if;
  insert into public.fin_provider_reviews(organization_id, provider_id, template_id, legal_entity_id, period_start, period_end, scores,
      weighted_result, answered_weight, comment, reviewer_id)
    values (p_org, p_provider, p_template, p_entity, p_period_start, p_period_end, p_scores,
      round(v_sum / v_answered, 3), round(v_answered / v_total * 100, 3), nullif(trim(coalesce(p_comment,'')),''), auth.uid())
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (p_org, 'provider', p_provider, 'provider_review_recorded', auth.uid(), jsonb_build_object('review_id', v_id, 'template_id', p_template), p_entity);
  return v_id;
exception when check_violation then raise exception 'invalid review';
end $$;

create or replace function public.fin_save_facility(
  p_org uuid, p_facility uuid, p_entity uuid, p_provider uuid, p_kind text, p_name text, p_currency text,
  p_approved_limit numeric default null, p_principal numeric default null, p_indexer text default null,
  p_spread numeric default null, p_rate numeric default null, p_amortization text default null,
  p_starts date default null, p_maturity date default null, p_status text default 'active', p_contract uuid default null,
  p_source text default 'declared', p_source_reference text default null, p_review_days integer default 90, p_notes text default null,
  p_owner uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_facility; v public.fin_facilities%rowtype;
begin
  perform public.fin_assert_portfolio_write(p_org, p_entity);
  if not exists (select 1 from public.fin_providers p where p.organization_id = p_org and p.id = p_provider) then raise exception 'provider not found'; end if;
  if p_contract is not null and not exists (select 1 from public.fin_contracts c where c.organization_id = p_org and c.id = p_contract
       and c.legal_entity_id is not distinct from p_entity and public.fin_entity_visible(p_org, c.legal_entity_id)) then
    raise exception 'contract not found';
  end if;
  if p_owner is not null and not exists (select 1 from public.fin_members m where m.organization_id = p_org and m.user_id = p_owner) then raise exception 'invalid owner'; end if;
  if p_facility is null then
    insert into public.fin_facilities(organization_id, legal_entity_id, provider_id, contract_id, kind, name, currency, approved_limit, principal_amount,
        indexer, spread_pct_year, rate_pct_year, amortization, starts_on, maturity_on, status, owner_id, source, source_reference,
        verified_at, review_after_days, notes, created_by)
      values (p_org, p_entity, p_provider, p_contract, p_kind, trim(p_name), upper(coalesce(p_currency,'BRL')), p_approved_limit, p_principal,
        p_indexer, p_spread, p_rate, p_amortization, p_starts, p_maturity, coalesce(p_status,'active'), coalesce(p_owner, auth.uid()), coalesce(p_source,'declared'),
        nullif(trim(coalesce(p_source_reference,'')),''), now(), coalesce(p_review_days, 90), nullif(trim(coalesce(p_notes,'')),''), auth.uid())
      returning id into v_id;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
      values (p_org, 'facility', v_id, 'facility_created', auth.uid(), jsonb_build_object('kind', p_kind, 'source', p_source), p_entity);
  else
    select * into v from public.fin_facilities where id = p_facility and organization_id = p_org for update;
    if not found or not public.fin_entity_allows(p_org, v.legal_entity_id, array['admin','finance_manager','analyst']) then raise exception 'facility not found'; end if;
    update public.fin_facilities set legal_entity_id = p_entity, provider_id = p_provider, contract_id = p_contract, kind = p_kind, name = trim(p_name),
        currency = upper(coalesce(p_currency, currency)), approved_limit = p_approved_limit, principal_amount = p_principal, indexer = p_indexer,
        spread_pct_year = p_spread, rate_pct_year = p_rate, amortization = p_amortization, starts_on = p_starts, maturity_on = p_maturity,
        status = coalesce(p_status, status), owner_id = coalesce(p_owner, owner_id), source = coalesce(p_source, source),
        source_reference = nullif(trim(coalesce(p_source_reference,'')),''), verified_at = now(), review_after_days = coalesce(p_review_days, review_after_days),
        notes = nullif(trim(coalesce(p_notes,'')),''), updated_at = now()
     where id = p_facility;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
      values (p_org, 'facility', p_facility, 'facility_updated', auth.uid(), jsonb_build_object('source', p_source), p_entity);
  end if;
  return v_id;
exception when check_violation then raise exception 'invalid facility';
end $$;

-- Confirmar que os dados da facility continuam atuais, sem mudar valores.
create or replace function public.fin_confirm_facility(p_facility uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v public.fin_facilities%rowtype; v_now timestamptz := now();
begin
  select * into v from public.fin_facilities where id = p_facility for update;
  if not found or not public.fin_entity_allows(v.organization_id, v.legal_entity_id, array['admin','finance_manager','analyst']) then raise exception 'facility not found'; end if;
  update public.fin_facilities set verified_at = v_now, updated_at = v_now where id = p_facility;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (v.organization_id, 'facility', v.id, 'facility_confirmed', auth.uid(), '{}'::jsonb, v.legal_entity_id);
  return v_now;
end $$;

create or replace function public.fin_record_facility_balance(
  p_facility uuid, p_as_of date, p_outstanding numeric default null, p_used_limit numeric default null,
  p_source text default 'declared', p_source_reference text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.fin_facilities%rowtype; v_id uuid;
begin
  select * into v from public.fin_facilities where id = p_facility;
  if not found or not public.fin_entity_allows(v.organization_id, v.legal_entity_id, array['admin','finance_manager','analyst']) then raise exception 'facility not found'; end if;
  if p_as_of is null or p_as_of > current_date then raise exception 'invalid date'; end if;
  if p_used_limit is not null and v.approved_limit is not null and p_used_limit > v.approved_limit then raise exception 'used limit exceeds approved'; end if;
  insert into public.fin_facility_balances(organization_id, facility_id, as_of, outstanding_amount, used_limit_amount, source, source_reference, recorded_by)
    values (v.organization_id, v.id, p_as_of, p_outstanding, p_used_limit, coalesce(p_source,'declared'), nullif(trim(coalesce(p_source_reference,'')),''), auth.uid())
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (v.organization_id, 'facility', v.id, 'facility_balance_recorded', auth.uid(), jsonb_build_object('as_of', p_as_of, 'source', p_source), v.legal_entity_id);
  return v_id;
exception when check_violation then raise exception 'invalid balance';
end $$;

-- Cronograma declarado: substitui como conjunto novo; o anterior fica.
create or replace function public.fin_record_facility_schedule(p_facility uuid, p_items jsonb, p_expected integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v public.fin_facilities%rowtype; v_version integer; item jsonb;
begin
  select * into v from public.fin_facilities where id = p_facility for update;
  if not found or not public.fin_entity_allows(v.organization_id, v.legal_entity_id, array['admin','finance_manager','analyst']) then raise exception 'facility not found'; end if;
  if p_expected is distinct from v.schedule_version then raise exception 'schedule version conflict'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 600 then raise exception 'invalid schedule'; end if;
  v_version := v.schedule_version + 1;
  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce(item->>'due_on','') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(item->'principal_amount') <> 'number' then raise exception 'invalid schedule'; end if;
    insert into public.fin_facility_repayments(organization_id, facility_id, schedule_version, due_on, principal_amount, recorded_by)
      values (v.organization_id, v.id, v_version, (item->>'due_on')::date, (item->>'principal_amount')::numeric, auth.uid());
  end loop;
  update public.fin_facilities set schedule_version = v_version, updated_at = now() where id = v.id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (v.organization_id, 'facility', v.id, 'facility_schedule_recorded', auth.uid(), jsonb_build_object('version', v_version, 'items', jsonb_array_length(p_items)), v.legal_entity_id);
  return v_version;
exception when unique_violation then raise exception 'invalid schedule';
  when check_violation then raise exception 'invalid schedule';
end $$;

create or replace function public.fin_save_guarantee(
  p_org uuid, p_guarantee uuid, p_entity uuid, p_kind text, p_description text, p_currency text, p_committed numeric default null,
  p_facility uuid default null, p_contract uuid default null, p_provider uuid default null,
  p_starts date default null, p_ends date default null, p_status text default 'active', p_source text default 'declared'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_guarantee; v public.fin_guarantees%rowtype;
begin
  perform public.fin_assert_portfolio_write(p_org, p_entity);
  if p_facility is not null and not exists (select 1 from public.fin_facilities f where f.organization_id = p_org and f.id = p_facility and f.legal_entity_id is not distinct from p_entity) then
    raise exception 'facility not found';
  end if;
  if p_contract is not null and not exists (select 1 from public.fin_contracts c where c.organization_id = p_org and c.id = p_contract and c.legal_entity_id is not distinct from p_entity) then
    raise exception 'contract not found';
  end if;
  if p_provider is not null and not exists (select 1 from public.fin_providers p where p.organization_id = p_org and p.id = p_provider) then raise exception 'provider not found'; end if;
  if p_guarantee is null then
    insert into public.fin_guarantees(organization_id, legal_entity_id, facility_id, contract_id, provider_id, kind, description, currency,
        committed_amount, starts_on, ends_on, status, source, created_by)
      values (p_org, p_entity, p_facility, p_contract, p_provider, p_kind, trim(p_description), upper(coalesce(p_currency,'BRL')),
        p_committed, p_starts, p_ends, coalesce(p_status,'active'), coalesce(p_source,'declared'), auth.uid())
      returning id into v_id;
  else
    select * into v from public.fin_guarantees where id = p_guarantee and organization_id = p_org for update;
    if not found or not public.fin_entity_allows(p_org, v.legal_entity_id, array['admin','finance_manager','analyst']) then raise exception 'guarantee not found'; end if;
    update public.fin_guarantees set legal_entity_id = p_entity, facility_id = p_facility, contract_id = p_contract, provider_id = p_provider, kind = p_kind,
        description = trim(p_description), currency = upper(coalesce(p_currency, currency)), committed_amount = p_committed, starts_on = p_starts, ends_on = p_ends,
        status = coalesce(p_status, status), source = coalesce(p_source, source), updated_at = now()
     where id = p_guarantee;
  end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata, legal_entity_id)
    values (p_org, 'guarantee', v_id, case when p_guarantee is null then 'guarantee_created' else 'guarantee_updated' end, auth.uid(),
      jsonb_build_object('kind', p_kind, 'status', p_status), p_entity);
  return v_id;
exception when check_violation then raise exception 'invalid guarantee';
end $$;

-- Trilha: objetos novos também carregam a entidade (visibilidade da trilha).
create or replace function public.fin_object_legal_entity(p_type text, p_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'rfq' then (select r.legal_entity_id from public.fin_rfqs r where r.id = p_id)
    when 'proposal' then (select r.legal_entity_id from public.fin_proposals p join public.fin_rfqs r on r.id = p.rfq_id where p.id = p_id)
    when 'decision' then (select r.legal_entity_id from public.fin_decisions d join public.fin_rfqs r on r.id = d.rfq_id where d.id = p_id)
    when 'approval' then (select r.legal_entity_id from public.fin_approval_requests a join public.fin_rfqs r on r.id = a.rfq_id where a.id = p_id)
    when 'contract' then (select c.legal_entity_id from public.fin_contracts c where c.id = p_id)
    when 'task' then (select t.legal_entity_id from public.fin_tasks t where t.id = p_id)
    when 'legal_entity' then p_id
    when 'facility' then (select f.legal_entity_id from public.fin_facilities f where f.id = p_id)
    when 'guarantee' then (select g.legal_entity_id from public.fin_guarantees g where g.id = p_id)
    else null end;
$$;

-- ------------------------------------------------- 6. grants
revoke all on function public.fin_scorecard_template_guard() from public, anon, authenticated;
revoke all on function public.fin_facility_history_trigger() from public, anon, authenticated;
revoke all on function public.fin_assert_portfolio_write(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fin_object_legal_entity(text, uuid) from public, anon, authenticated;
revoke all on function public.fin_facility_visible(uuid), public.fin_group_or_entity_visible(uuid, uuid) from public, anon;
grant execute on function public.fin_facility_visible(uuid), public.fin_group_or_entity_visible(uuid, uuid) to authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'public.fin_add_provider_contact(uuid,uuid,text,text,text,text,uuid,boolean)',
    'public.fin_archive_provider_contact(uuid)',
    'public.fin_set_provider_relationship(uuid,uuid,uuid,text,uuid,text[],date,text)',
    'public.fin_open_provider_issue(uuid,uuid,text,text,text,text,uuid,uuid,date,uuid)',
    'public.fin_update_provider_issue(uuid,text,text)',
    'public.fin_create_scorecard_template(uuid,text,text,jsonb)',
    'public.fin_record_provider_review(uuid,uuid,uuid,date,date,jsonb,uuid,text)',
    'public.fin_save_facility(uuid,uuid,uuid,uuid,text,text,text,numeric,numeric,text,numeric,numeric,text,date,date,text,uuid,text,text,integer,text,uuid)',
    'public.fin_confirm_facility(uuid)',
    'public.fin_record_facility_balance(uuid,date,numeric,numeric,text,text)',
    'public.fin_record_facility_schedule(uuid,jsonb,integer)',
    'public.fin_save_guarantee(uuid,uuid,uuid,text,text,text,numeric,uuid,uuid,uuid,date,date,text,text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-relationships-portfolio-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

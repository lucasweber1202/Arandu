-- Contract & Renewal Center v2 (guideline §14, addendum v2.1 H.1 item 5).
-- Aditivo e idempotente. Rollback: docs/rollback/supabase-financial-contracts-v2.rollback.sql
--
-- O contrato vira objeto operacional:
--   * termos estruturados versionados (fin_contract_versions, append-only):
--     a versão nova nunca apaga a anterior; correção exige justificativa e
--     aditivo tem registro próprio (fin_contract_amendments, imutável);
--   * contrato pai/filho e contrato registrado fora de uma RFQ (`imported`:
--     carteira existente da empresa), sempre com entidade, provedor e owner;
--   * marcos próprios e obrigações recorrentes (fin_contract_milestones) que
--     geram tarefa idempotente por ocorrência (fin_contract_milestone_runs);
--   * tudo por RPC, com papel + escopo de entidade conferidos no banco e
--     evento na trilha (sem valores financeiros no metadata).
--
-- Fora daqui, de propósito: assinatura eletrônica, cálculo de juros/saldo,
-- conversão de moeda e qualquer julgamento sobre o contrato.

-- ------------------------------------------------------------ 1. contrato
alter table public.fin_contracts add column if not exists origin text not null default 'sourcing';
alter table public.fin_contracts add column if not exists parent_contract_id uuid;
alter table public.fin_contracts add column if not exists title text;
alter table public.fin_contracts add column if not exists currency text not null default 'BRL';
alter table public.fin_contracts add column if not exists current_version integer not null default 0;
alter table public.fin_contracts add column if not exists terms_updated_at timestamptz;

alter table public.fin_contracts drop constraint if exists fin_contracts_origin_check;
alter table public.fin_contracts add constraint fin_contracts_origin_check check (origin in ('sourcing','imported'));
alter table public.fin_contracts drop constraint if exists fin_contracts_currency_check;
alter table public.fin_contracts add constraint fin_contracts_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.fin_contracts drop constraint if exists fin_contracts_title_check;
alter table public.fin_contracts add constraint fin_contracts_title_check check (title is null or (length(trim(title)) between 2 and 200 and title !~ '[<>]'));
alter table public.fin_contracts drop constraint if exists fin_contracts_version_check;
alter table public.fin_contracts add constraint fin_contracts_version_check check (current_version >= 0);

-- Expand: contrato importado não tem decisão/proposta de origem. A FK composta
-- continua valendo para contrato de sourcing (MATCH SIMPLE ignora nulos).
alter table public.fin_contracts alter column decision_id drop not null;
alter table public.fin_contracts alter column proposal_id drop not null;
alter table public.fin_contracts drop constraint if exists fin_contracts_sourcing_origin;
alter table public.fin_contracts add constraint fin_contracts_sourcing_origin
  check (origin = 'imported' or (decision_id is not null and proposal_id is not null));

-- Categorias além de crédito/adquirência só para contrato importado (o
-- sourcing continua limitado aos packs com catálogo em lib/finance/products.mjs).
alter table public.fin_contracts drop constraint if exists fin_contracts_product_check;
alter table public.fin_contracts add constraint fin_contracts_product_check
  check (product in ('credit','acquiring') or (origin = 'imported' and product in ('cash_management','guarantee','fx','insurance','other')));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_contracts_parent_fk') then
    alter table public.fin_contracts add constraint fin_contracts_parent_fk
      foreign key (organization_id, parent_contract_id) references public.fin_contracts(organization_id, id);
  end if;
end $$;
alter table public.fin_contracts drop constraint if exists fin_contracts_not_own_parent;
alter table public.fin_contracts add constraint fin_contracts_not_own_parent check (parent_contract_id is null or parent_contract_id <> id);
create index if not exists fin_contracts_parent_idx on public.fin_contracts(organization_id, parent_contract_id) where parent_contract_id is not null;

-- ------------------------------------------------- 2. termos versionados
-- Forma mínima validada no banco; o catálogo completo vive em
-- lib/finance/contract-terms.mjs e a API recusa chave fora dele.
create or replace function public.fin_valid_contract_terms(p_terms jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_terms) = 'object'
     and length(p_terms::text) <= 32000
     and p_terms::text !~ '[<>]'
     and (not p_terms ? 'fees' or (jsonb_typeof(p_terms->'fees') = 'array' and jsonb_array_length(p_terms->'fees') <= 50))
     and (not p_terms ? 'currency' or (p_terms->>'currency') ~ '^[A-Z]{3}$');
$$;

create table if not exists public.fin_contract_versions (
  contract_id uuid not null,
  organization_id uuid not null,
  version integer not null check (version > 0),
  effective_from date not null,
  source text not null check (source in ('registration','correction','amendment','import')),
  amendment_id uuid,
  reason text check (reason is null or (length(trim(reason)) between 3 and 1000 and reason !~ '[<>]')),
  terms jsonb not null check (public.fin_valid_contract_terms(terms)),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  primary key (contract_id, version),
  foreign key (organization_id, contract_id) references public.fin_contracts(organization_id, id),
  check (source <> 'correction' or reason is not null)
);
create index if not exists fin_contract_versions_org on public.fin_contract_versions(organization_id, contract_id, version desc);

create table if not exists public.fin_contract_amendments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null,
  number integer not null check (number > 0),
  title text not null check (length(trim(title)) between 2 and 200 and title !~ '[<>]'),
  signed_on date,
  effective_from date not null,
  summary text check (summary is null or (length(summary) <= 4000 and summary !~ '[<>]')),
  previous_ends_on date,
  new_ends_on date,
  previous_notice_days integer,
  new_notice_days integer,
  document_id uuid references public.fin_private_documents(id),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique (contract_id, number),
  unique (organization_id, id),
  foreign key (organization_id, contract_id) references public.fin_contracts(organization_id, id)
);
create index if not exists fin_contract_amendments_org on public.fin_contract_amendments(organization_id, contract_id, number desc);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_contract_versions_amendment_fk') then
    alter table public.fin_contract_versions add constraint fin_contract_versions_amendment_fk
      foreign key (organization_id, amendment_id) references public.fin_contract_amendments(organization_id, id);
  end if;
end $$;

drop trigger if exists fin_contract_versions_immutable on public.fin_contract_versions;
create trigger fin_contract_versions_immutable before update or delete on public.fin_contract_versions
  for each row execute function public.fin_immutable_row();
drop trigger if exists fin_contract_amendments_immutable on public.fin_contract_amendments;
create trigger fin_contract_amendments_immutable before update or delete on public.fin_contract_amendments
  for each row execute function public.fin_immutable_row();

-- ------------------------------------------------- 3. marcos e obrigações
create table if not exists public.fin_contract_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null,
  kind text not null check (kind in ('notice','repricing','renewal_decision','termination_window','obligation','custom')),
  title text not null check (length(trim(title)) between 2 and 200 and title !~ '[<>]'),
  due_on date not null,
  lead_days integer not null default 30 check (lead_days between 0 and 365),
  recurrence text not null default 'none' check (recurrence in ('none','monthly','quarterly','semiannual','annual')),
  ends_after date,
  owner_id uuid references auth.users(id),
  status text not null default 'scheduled' check (status in ('scheduled','done','cancelled')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, contract_id) references public.fin_contracts(organization_id, id),
  check ((status = 'scheduled') = (completed_at is null))
);
create index if not exists fin_contract_milestones_due on public.fin_contract_milestones(status, due_on) where status = 'scheduled';
create index if not exists fin_contract_milestones_org on public.fin_contract_milestones(organization_id, contract_id);

-- Uma tarefa por ocorrência: repetir o processamento não duplica.
create table if not exists public.fin_contract_milestone_runs (
  milestone_id uuid not null references public.fin_contract_milestones(id),
  organization_id uuid not null,
  occurrence_due_on date not null,
  task_id uuid not null references public.fin_tasks(id),
  triggered_at timestamptz not null default now(),
  primary key (milestone_id, occurrence_due_on)
);
create index if not exists fin_contract_milestone_runs_org on public.fin_contract_milestone_runs(organization_id);

-- ------------------------------------------------------------ 4. RLS
alter table public.fin_contract_versions enable row level security;
alter table public.fin_contract_versions force row level security;
alter table public.fin_contract_amendments enable row level security;
alter table public.fin_contract_amendments force row level security;
alter table public.fin_contract_milestones enable row level security;
alter table public.fin_contract_milestones force row level security;
alter table public.fin_contract_milestone_runs enable row level security;
alter table public.fin_contract_milestone_runs force row level security;
revoke all on public.fin_contract_versions, public.fin_contract_amendments, public.fin_contract_milestones, public.fin_contract_milestone_runs from anon, authenticated;
grant select on public.fin_contract_versions, public.fin_contract_amendments, public.fin_contract_milestones, public.fin_contract_milestone_runs to authenticated;
drop policy if exists fin_contract_version_read on public.fin_contract_versions;
create policy fin_contract_version_read on public.fin_contract_versions for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_contract_visible(contract_id));
drop policy if exists fin_contract_amendment_read on public.fin_contract_amendments;
create policy fin_contract_amendment_read on public.fin_contract_amendments for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_contract_visible(contract_id));
drop policy if exists fin_contract_milestone_read on public.fin_contract_milestones;
create policy fin_contract_milestone_read on public.fin_contract_milestones for select to authenticated
  using (public.fin_has_role(organization_id) and public.fin_contract_visible(contract_id));
drop policy if exists fin_contract_milestone_run_read on public.fin_contract_milestone_runs;
create policy fin_contract_milestone_run_read on public.fin_contract_milestone_runs for select to authenticated
  using (public.fin_has_role(organization_id) and exists (select 1 from public.fin_contract_milestones m
         where m.id = milestone_id and public.fin_contract_visible(m.contract_id)));

-- ------------------------------------------------------------ 5. RPCs
-- Quem escreve no contrato: admin/gestão financeira que alcança a entidade.
create or replace function public.fin_contract_for_write(p_contract uuid)
returns public.fin_contracts language plpgsql security definer set search_path = '' as $$
declare v public.fin_contracts%rowtype;
begin
  select * into v from public.fin_contracts where id = p_contract for update;
  if not found then raise exception 'contract not found'; end if;
  if not public.fin_entity_allows(v.organization_id, v.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  return v;
end $$;

-- Contrato existente da carteira (fora de RFQ): nasce com termos versão 1.
create or replace function public.fin_import_contract(
  p_org uuid, p_entity uuid, p_provider uuid, p_product text, p_title text,
  p_starts date, p_ends date, p_notice integer default 60, p_auto_renew boolean default false,
  p_currency text default null, p_terms jsonb default '{}'::jsonb, p_parent uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_currency text;
begin
  if not public.fin_entity_allows(p_org, p_entity, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if p_entity is not null and not exists (select 1 from public.fin_legal_entities e where e.organization_id = p_org and e.id = p_entity and e.status = 'active') then
    raise exception 'invalid legal entity';
  end if;
  if not exists (select 1 from public.fin_providers p where p.organization_id = p_org and p.id = p_provider) then raise exception 'provider not found'; end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then raise exception 'invalid period'; end if;
  if p_terms is null or not public.fin_valid_contract_terms(p_terms) then raise exception 'invalid contract terms'; end if;
  if p_parent is not null and not exists (select 1 from public.fin_contracts c where c.organization_id = p_org and c.id = p_parent
       and public.fin_entity_visible(p_org, c.legal_entity_id)) then
    raise exception 'contract not found';
  end if;
  v_currency := coalesce(upper(p_currency), p_terms->>'currency',
    (select e.currency from public.fin_legal_entities e where e.id = p_entity),
    (select o.base_currency from public.fin_organizations o where o.id = p_org));
  insert into public.fin_contracts(organization_id, provider_id, product, starts_on, ends_on, renewal_notice_days, auto_renew,
      owner_id, origin, title, currency, parent_contract_id, legal_entity_id, current_version, terms_updated_at)
    values (p_org, p_provider, p_product, p_starts, p_ends, coalesce(p_notice, 60), coalesce(p_auto_renew, false),
      auth.uid(), 'imported', trim(p_title), v_currency, p_parent, p_entity, 1, now())
    returning id into v_id;
  insert into public.fin_contract_versions(contract_id, organization_id, version, effective_from, source, terms, recorded_by)
    values (v_id, p_org, 1, p_starts, 'import', p_terms, auth.uid());
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'contract', v_id, 'contract_imported', auth.uid(),
      jsonb_build_object('product', p_product, 'terms_fields', (select count(*) from jsonb_object_keys(p_terms)), 'has_parent', p_parent is not null));
  return v_id;
exception when check_violation then raise exception 'invalid contract';
end $$;

-- Grava uma versão de termos. A primeira estruturação (versão 1) não pede
-- justificativa; qualquer versão seguinte fora de aditivo é correção e pede.
-- p_expected protege contra duas abas gravando versões concorrentes.
create or replace function public.fin_record_contract_terms(
  p_contract uuid, p_terms jsonb, p_expected integer, p_reason text default null, p_effective_from date default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare v public.fin_contracts%rowtype; v_version integer; v_source text;
begin
  v := public.fin_contract_for_write(p_contract);
  if p_expected is distinct from v.current_version then raise exception 'contract version conflict'; end if;
  if p_terms is null or not public.fin_valid_contract_terms(p_terms) then raise exception 'invalid contract terms'; end if;
  v_source := case when v.current_version = 0 then 'registration' else 'correction' end;
  if v_source = 'correction' and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'correction reason required'; end if;
  v_version := v.current_version + 1;
  insert into public.fin_contract_versions(contract_id, organization_id, version, effective_from, source, reason, terms, recorded_by)
    values (v.id, v.organization_id, v_version, coalesce(p_effective_from, v.starts_on), v_source,
      nullif(trim(coalesce(p_reason, '')), ''), p_terms, auth.uid());
  update public.fin_contracts set current_version = v_version, terms_updated_at = now(), updated_at = now(),
    currency = coalesce(p_terms->>'currency', currency)
   where id = v.id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v.organization_id, 'contract', v.id, 'contract_terms_' || v_source, auth.uid(), jsonb_build_object('version', v_version));
  return v_version;
end $$;

-- Aditivo: registro imutável + nova versão de termos (quando há mudança de
-- termos) + datas operacionais do contrato atualizadas, com o valor anterior
-- preservado no próprio aditivo.
create or replace function public.fin_record_contract_amendment(
  p_contract uuid, p_title text, p_effective_from date, p_signed_on date default null, p_summary text default null,
  p_terms jsonb default null, p_new_ends_on date default null, p_new_notice_days integer default null,
  p_document uuid default null, p_expected integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.fin_contracts%rowtype; v_id uuid; v_number integer; v_version integer;
begin
  v := public.fin_contract_for_write(p_contract);
  if v.status not in ('active','renewing') then raise exception 'invalid state'; end if;
  if p_effective_from is null or p_effective_from < v.starts_on then raise exception 'invalid period'; end if;
  if p_new_ends_on is not null and p_new_ends_on < v.starts_on then raise exception 'invalid period'; end if;
  if p_new_notice_days is not null and p_new_notice_days not between 0 and 3650 then raise exception 'invalid period'; end if;
  if p_terms is not null and p_expected is distinct from v.current_version then raise exception 'contract version conflict'; end if;
  if p_terms is not null and not public.fin_valid_contract_terms(p_terms) then raise exception 'invalid contract terms'; end if;
  if p_terms is null and p_new_ends_on is null and p_new_notice_days is null and length(trim(coalesce(p_summary,''))) < 3 then
    raise exception 'empty amendment';
  end if;
  if p_document is not null and not exists (select 1 from public.fin_private_documents d where d.id = p_document
       and d.organization_id = v.organization_id and d.entity_type = 'contract' and d.entity_id = v.id and d.removed_at is null) then
    raise exception 'invalid document';
  end if;
  select coalesce(max(number), 0) + 1 into v_number from public.fin_contract_amendments where contract_id = v.id;
  insert into public.fin_contract_amendments(organization_id, contract_id, number, title, signed_on, effective_from, summary,
      previous_ends_on, new_ends_on, previous_notice_days, new_notice_days, document_id, recorded_by)
    values (v.organization_id, v.id, v_number, trim(p_title), p_signed_on, p_effective_from, nullif(trim(coalesce(p_summary,'')),''),
      v.ends_on, p_new_ends_on, v.renewal_notice_days, p_new_notice_days, p_document, auth.uid())
    returning id into v_id;
  if p_terms is not null then
    v_version := v.current_version + 1;
    insert into public.fin_contract_versions(contract_id, organization_id, version, effective_from, source, amendment_id, terms, recorded_by)
      values (v.id, v.organization_id, v_version, p_effective_from, 'amendment', v_id, p_terms, auth.uid());
  end if;
  update public.fin_contracts set
      ends_on = coalesce(p_new_ends_on, ends_on),
      renewal_notice_days = coalesce(p_new_notice_days, renewal_notice_days),
      current_version = coalesce(v_version, current_version),
      terms_updated_at = case when v_version is null then terms_updated_at else now() end,
      currency = coalesce(p_terms->>'currency', currency),
      updated_at = now()
    where id = v.id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v.organization_id, 'contract', v.id, 'contract_amended', auth.uid(),
      jsonb_build_object('amendment', v_number, 'terms_version', v_version, 'dates_changed', p_new_ends_on is not null or p_new_notice_days is not null));
  return v_id;
exception when check_violation then raise exception 'invalid amendment';
end $$;

create or replace function public.fin_create_contract_milestone(
  p_contract uuid, p_kind text, p_title text, p_due_on date, p_lead_days integer default 30,
  p_recurrence text default 'none', p_ends_after date default null, p_owner uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.fin_contracts%rowtype; v_id uuid;
begin
  v := public.fin_contract_for_write(p_contract);
  if p_owner is not null and not exists (select 1 from public.fin_members m where m.organization_id = v.organization_id and m.user_id = p_owner) then
    raise exception 'invalid owner';
  end if;
  if p_due_on is null or (p_ends_after is not null and p_ends_after < p_due_on) then raise exception 'invalid period'; end if;
  insert into public.fin_contract_milestones(organization_id, contract_id, kind, title, due_on, lead_days, recurrence, ends_after, owner_id, created_by)
    values (v.organization_id, v.id, p_kind, trim(p_title), p_due_on, coalesce(p_lead_days, 30), coalesce(p_recurrence, 'none'), p_ends_after,
      coalesce(p_owner, v.owner_id), auth.uid())
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v.organization_id, 'contract', v.id, 'contract_milestone_created', auth.uid(), jsonb_build_object('milestone_id', v_id, 'kind', p_kind, 'recurrence', p_recurrence));
  return v_id;
exception when check_violation then raise exception 'invalid milestone';
end $$;

-- Concluir: marco único fecha; recorrente avança para a próxima ocorrência
-- (ou fecha depois de ends_after). Cancelar fecha sem avançar.
create or replace function public.fin_settle_contract_milestone(p_milestone uuid, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare m public.fin_contract_milestones%rowtype; v_next date; v_months integer; v_status text;
begin
  select * into m from public.fin_contract_milestones where id = p_milestone for update;
  if not found then raise exception 'milestone not found'; end if;
  perform public.fin_contract_for_write(m.contract_id);
  if m.status <> 'scheduled' then raise exception 'milestone closed'; end if;
  if p_action not in ('done','cancelled') then raise exception 'invalid milestone'; end if;
  v_months := case m.recurrence when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 when 'annual' then 12 else null end;
  if p_action = 'done' and v_months is not null then
    v_next := (m.due_on + make_interval(months => v_months))::date;
  end if;
  if v_next is not null and (m.ends_after is null or v_next <= m.ends_after) then
    update public.fin_contract_milestones set due_on = v_next, updated_at = now() where id = m.id;
    v_status := 'scheduled';
  else
    update public.fin_contract_milestones set status = p_action, completed_at = now(), completed_by = auth.uid(), updated_at = now() where id = m.id;
    v_status := p_action;
  end if;
  -- A tarefa da ocorrência concluída fecha junto.
  update public.fin_tasks t set status = case when p_action = 'done' then 'done' else 'cancelled' end
   where t.id in (select r.task_id from public.fin_contract_milestone_runs r where r.milestone_id = m.id and r.occurrence_due_on = m.due_on)
     and t.status = 'open';
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (m.organization_id, 'contract', m.contract_id, 'contract_milestone_' || p_action, auth.uid(),
      jsonb_build_object('milestone_id', m.id, 'occurrence', m.due_on, 'next', v_next));
  return v_status;
end $$;

-- Gera tarefa para cada ocorrência dentro da antecedência. Idempotente.
-- Com sessão: só contratos que a pessoa alcança. Sem sessão (job): todos.
create or replace function public.fin_process_contract_milestones(p_org uuid default null, p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare m record; v_task uuid; v_count integer := 0; v_inserted integer;
begin
  if p_day is null or abs(p_day - current_date) > 1 then raise exception 'invalid date'; end if;
  -- Sem sessão só chega aqui o job (service role): a RPC não é concedida a
  -- anon e toda chamada autenticada carrega `sub`.
  if auth.uid() is not null and (p_org is null or not public.fin_has_role(p_org, array['admin','finance_manager'])) then
    raise exception 'forbidden';
  end if;
  for m in select ms.*, c.legal_entity_id, c.owner_id contract_owner
             from public.fin_contract_milestones ms
             join public.fin_contracts c on c.id = ms.contract_id
            where ms.status = 'scheduled' and ms.due_on - ms.lead_days <= p_day
              and c.status in ('active','renewing')
              and (p_org is null or ms.organization_id = p_org)
              and (auth.uid() is null or public.fin_entity_visible(ms.organization_id, c.legal_entity_id))
            order by ms.due_on, ms.id
  loop
    if exists (select 1 from public.fin_contract_milestone_runs r where r.milestone_id = m.id and r.occurrence_due_on = m.due_on) then continue; end if;
    insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (m.organization_id, left(m.title, 200), m.due_on, 'open', 'contract', m.contract_id, coalesce(auth.uid(), m.created_by))
      returning id into v_task;
    insert into public.fin_contract_milestone_runs(milestone_id, organization_id, occurrence_due_on, task_id)
      values (m.id, m.organization_id, m.due_on, v_task) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then delete from public.fin_tasks where id = v_task; continue; end if;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (m.organization_id, 'contract', m.contract_id, 'contract_milestone_due', auth.uid(),
        jsonb_build_object('milestone_id', m.id, 'kind', m.kind, 'occurrence', m.due_on, 'task_id', v_task));
    if coalesce(m.owner_id, m.contract_owner) is distinct from auth.uid() then
      insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
        values (m.organization_id, coalesce(m.owner_id, m.contract_owner), 'renewal_due', 'contract', m.contract_id, v_task,
          'Marco de contrato', 'Há um marco de contrato para acompanhar.')
        on conflict (user_id, event_type, event_id) do nothing;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Novo processo a partir do contrato: além da renovação já existente, vale
-- também para contrato importado (sem RFQ de origem): nasce rascunho vazio
-- da mesma categoria de sourcing, na mesma entidade.
create or replace function public.fin_start_contract_rfq(p_contract uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record; v_id uuid; v_title text;
begin
  select ct.organization_id, ct.product, ct.id, ct.legal_entity_id, ct.origin, ct.title ct_title, r.title, r.description, r.demand into c
    from public.fin_contracts ct
    left join public.fin_decisions d on d.id = ct.decision_id
    left join public.fin_rfqs r on r.id = d.rfq_id and r.organization_id = ct.organization_id
   where ct.id = p_contract for update of ct;
  if not found then raise exception 'contract not found'; end if;
  if not public.fin_entity_allows(c.organization_id, c.legal_entity_id, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if c.product not in ('credit','acquiring') then raise exception 'invalid product'; end if;
  v_title := left('Renovação: ' || coalesce(c.title, c.ct_title, 'contrato existente'), 200);
  insert into public.fin_rfqs(organization_id, product, title, description, demand, owner_id, status, legal_entity_id)
    values (c.organization_id, c.product, v_title, c.description, coalesce(c.demand, '{}'::jsonb), auth.uid(), 'draft', c.legal_entity_id)
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'contract', c.id, 'renewal_rfq_started', auth.uid(), jsonb_build_object('rfq_id', v_id));
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'rfq', v_id, 'rfq_created_from_contract', auth.uid(), jsonb_build_object('contract_id', c.id));
  return v_id;
end $$;

-- Job agendado (service role): processa marcos de todas as organizações.
create or replace function public.fin_run_contract_milestones(p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  return public.fin_process_contract_milestones(null, p_day);
end $$;

-- O console operacional registra a execução do job de marcos como a de renovação.
alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check (job in ('renewals','contract_milestones'));

-- ------------------------------------------------------------ 6. grants
revoke all on function public.fin_valid_contract_terms(jsonb) from public, anon, authenticated;
revoke all on function public.fin_contract_for_write(uuid) from public, anon, authenticated;
revoke all on function public.fin_run_contract_milestones(date) from public, anon, authenticated;
grant execute on function public.fin_run_contract_milestones(date) to service_role;
revoke all on function public.fin_import_contract(uuid, uuid, uuid, text, text, date, date, integer, boolean, text, jsonb, uuid) from public, anon;
revoke all on function public.fin_record_contract_terms(uuid, jsonb, integer, text, date) from public, anon;
revoke all on function public.fin_record_contract_amendment(uuid, text, date, date, text, jsonb, date, integer, uuid, integer) from public, anon;
revoke all on function public.fin_create_contract_milestone(uuid, text, text, date, integer, text, date, uuid) from public, anon;
revoke all on function public.fin_settle_contract_milestone(uuid, text) from public, anon;
revoke all on function public.fin_process_contract_milestones(uuid, date) from public, anon;
revoke all on function public.fin_start_contract_rfq(uuid) from public, anon;
grant execute on function
  public.fin_import_contract(uuid, uuid, uuid, text, text, date, date, integer, boolean, text, jsonb, uuid),
  public.fin_record_contract_terms(uuid, jsonb, integer, text, date),
  public.fin_record_contract_amendment(uuid, text, date, date, text, jsonb, date, integer, uuid, integer),
  public.fin_create_contract_milestone(uuid, text, text, date, integer, text, date, uuid),
  public.fin_settle_contract_milestone(uuid, text),
  public.fin_process_contract_milestones(uuid, date),
  public.fin_start_contract_rfq(uuid)
  to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-contracts-v2-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

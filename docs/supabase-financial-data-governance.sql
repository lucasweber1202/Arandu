-- P0.11 Data Governance foundation (docs/FINANCIAL_DATA_GOVERNANCE.md).
--
-- Retenção versionada (sem prazo jurídico inventado), legal hold, export
-- portável assíncrono, offboarding controlado com revogação idempotente e
-- trilha de governança. Nada aqui apaga registro de negócio, financeiro ou de
-- auditoria: a retenção automática só alcança classes técnicas listadas no
-- catálogo, e o offboarding NUNCA é "delete organization cascade".
--
-- Nenhuma alteração de banco hospedado é autorizada por este arquivo.
-- Rollback: docs/rollback/supabase-financial-data-governance.rollback.sql.
begin;

-- ------------------------------------------------------------- 0. jobs P0.10
alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check(job in
  ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox','retention','data_exports','offboarding'));
alter table public.fin_job_leases drop constraint if exists fin_job_leases_job_check;
alter table public.fin_job_leases add constraint fin_job_leases_job_check check(job in
  ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox','retention','data_exports','offboarding'));
create or replace function public.fin_job_begin(p_job text, p_request_id text, p_started_at timestamptz, p_lease_seconds integer default 90)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '1s' as $$
declare v_id uuid; v_token uuid := gen_random_uuid(); v_expires timestamptz;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  if p_job is null or p_job not in ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox','retention','data_exports','offboarding')
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

-- Webhook desativado pelo offboarding tem motivo próprio na trilha.
alter table public.fin_webhook_endpoints drop constraint if exists fin_webhook_endpoints_disabled_reason_check;
alter table public.fin_webhook_endpoints add constraint fin_webhook_endpoints_disabled_reason_check check (disabled_reason is null
  or disabled_reason in ('manual','consecutive_failures','service_account_revoked','tenant_offboarding'));

-- ------------------------------------------------------ 1. catálogo de classes
-- Classes que o executor de retenção pode alcançar. Os limites são PISOS E
-- TETOS TÉCNICOS do produto (proteger investigação e evitar configuração
-- insegura), não prazos jurídicos: nenhuma classe tem prazo padrão, e toda
-- política nasce de decisão humana registrada (LEGAL_REVIEW_REQUIRED).
-- Registros de negócio, financeiros, de auditoria e documentos NÃO estão aqui.
create or replace function public.fin_retention_class_catalog()
returns table(retention_class text, scope text, min_days integer, max_days integer, action text)
language sql immutable set search_path = '' as $$
  values ('TEMPORARY_OPERATIONAL','tenant',30,3650,'delete'),
         ('WEBHOOK_DELIVERY','tenant',30,3650,'delete'),
         ('SECURITY_EVENT','tenant',365,3650,'delete'),
         ('CONTACT_PII','tenant',30,3650,'anonymize'),
         ('PLATFORM_TELEMETRY','platform',30,3650,'delete'),
         ('PLATFORM_SECURITY_TRAIL','platform',365,3650,'delete');
$$;
revoke all on function public.fin_retention_class_catalog() from public, anon;
grant execute on function public.fin_retention_class_catalog() to authenticated, service_role;

-- --------------------------------------------------------------- 2. tabelas
create table if not exists public.fin_retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.fin_organizations(id),
  retention_class text not null check (retention_class ~ '^[A-Z_]{3,40}$'),
  version integer not null check (version >= 1),
  retention_days integer not null check (retention_days between 1 and 3650),
  status text not null default 'draft' check (status in ('draft','active','superseded','retired')),
  reason text not null check (length(trim(reason)) between 10 and 500 and reason !~ '[<>]'),
  decision_reference text check (decision_reference is null or decision_reference ~ '^[A-Za-z0-9._:/#-]{3,120}$'),
  effective_from timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  activated_by uuid references auth.users(id),
  activated_at timestamptz,
  ended_at timestamptz,
  check ((status = 'draft') = (activated_at is null)),
  check ((status in ('active','superseded','retired')) = (effective_from is not null))
);
create unique index if not exists fin_retention_policies_version_uniq
  on public.fin_retention_policies (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), retention_class, version);
create unique index if not exists fin_retention_policies_active_uniq
  on public.fin_retention_policies (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), retention_class) where status = 'active';

create table if not exists public.fin_legal_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  scope_type text not null check (scope_type in ('organization','legal_entity','rfq','contract','provider','retention_class')),
  scope_id uuid,
  scope_class text,
  reason text not null check (length(trim(reason)) between 10 and 1000 and reason !~ '[<>]'),
  reference text check (reference is null or reference ~ '^[A-Za-z0-9._:/#-]{3,120}$'),
  status text not null default 'active' check (status in ('active','released')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  released_by uuid references auth.users(id),
  released_at timestamptz,
  release_reason text check (release_reason is null or (length(trim(release_reason)) between 10 and 1000 and release_reason !~ '[<>]')),
  check ((status = 'released') = (released_at is not null)),
  check ((released_at is null) = (released_by is null)),
  check ((scope_type = 'organization' and scope_id is null and scope_class is null)
      or (scope_type = 'retention_class' and scope_id is null and scope_class is not null)
      or (scope_type in ('legal_entity','rfq','contract','provider') and scope_id is not null and scope_class is null))
);
create index if not exists fin_legal_holds_active on public.fin_legal_holds (organization_id) where status = 'active';

create table if not exists public.fin_data_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  purpose text not null check (purpose in ('portability','offboarding')),
  status text not null default 'requested' check (status in ('requested','ready','failed','expired','cancelled')),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  schema_version text,
  manifest jsonb check (manifest is null or jsonb_typeof(manifest) = 'object'),
  dataset_count integer check (dataset_count is null or dataset_count >= 0),
  row_count bigint check (row_count is null or row_count >= 0),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,60}$'),
  download_count integer not null default 0 check (download_count >= 0),
  last_downloaded_at timestamptz,
  check ((status = 'ready') = (manifest is not null and expires_at is not null)),
  check (status <> 'failed' or error_code is not null)
);
create unique index if not exists fin_data_exports_open_uniq on public.fin_data_exports (organization_id) where status = 'requested';
create index if not exists fin_data_exports_org on public.fin_data_exports (organization_id, requested_at desc);

-- Conteúdo do export: nenhum papel de cliente lê esta tabela; o download passa
-- pelas RPCs com checagem de papel, estado e validade.
create table if not exists public.fin_data_export_parts (
  export_id uuid not null references public.fin_data_exports(id),
  organization_id uuid not null references public.fin_organizations(id),
  dataset text not null check (dataset ~ '^[a-z_]{2,40}$'),
  row_count integer not null check (row_count >= 0),
  byte_size integer not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  content text not null,
  primary key (export_id, dataset)
);

create table if not exists public.fin_offboarding_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  status text not null default 'requested' check (status in
    ('requested','export_pending','export_ready','access_revocation','retention_window','scheduled_for_deletion','closed','cancelled')),
  reason text not null check (length(trim(reason)) between 10 and 1000 and reason !~ '[<>]'),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  export_id uuid references public.fin_data_exports(id),
  export_waived boolean not null default false,
  retention_days integer check (retention_days is null or retention_days between 0 and 3650),
  retention_until date,
  decision_reference text check (decision_reference is null or decision_reference ~ '^[A-Za-z0-9._:/#-]{3,120}$'),
  revocation jsonb not null default '{}'::jsonb check (jsonb_typeof(revocation) = 'object'),
  revoked_at timestamptz,
  closure_evidence text check (closure_evidence is null or closure_evidence ~ '^[A-Za-z0-9._:/#-]{3,120}$'),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  cancelled_at timestamptz,
  check ((status = 'closed') = (closed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check (status not in ('retention_window','scheduled_for_deletion','closed') or (revoked_at is not null and retention_until is not null))
);
create unique index if not exists fin_offboarding_open_uniq on public.fin_offboarding_requests (organization_id) where status not in ('closed','cancelled');

-- Vínculos removidos no offboarding: metadado mínimo para auditoria e para o
-- runbook de restauração manual (sem e-mail, sem nome).
create table if not exists public.fin_offboarding_member_archive (
  request_id uuid not null references public.fin_offboarding_requests(id),
  organization_id uuid not null references public.fin_organizations(id),
  user_id uuid not null,
  role text not null,
  entity_scope text not null,
  entity_ids uuid[] not null default '{}',
  member_since timestamptz not null,
  revoked_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- Evidência de execução da retenção: contagem, classe, política, quem/quando.
-- Nunca guarda o dado apagado.
create table if not exists public.fin_governance_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.fin_organizations(id),
  action text not null check (action in ('retention_preview','retention_purged','retention_held','export_expired')),
  retention_class text,
  policy_id uuid references public.fin_retention_policies(id),
  policy_version integer,
  object_count integer not null check (object_count >= 0),
  actor_id uuid references auth.users(id),
  job_request_id text check (job_request_id is null or job_request_id ~ '^[A-Za-z0-9-]{1,80}$'),
  happened_at timestamptz not null default now()
);
create index if not exists fin_governance_log_recent on public.fin_governance_log (organization_id, happened_at desc);

-- ------------------------------------------------------------------ 3. RLS
alter table public.fin_retention_policies enable row level security;
alter table public.fin_retention_policies force row level security;
alter table public.fin_legal_holds enable row level security;
alter table public.fin_legal_holds force row level security;
alter table public.fin_data_exports enable row level security;
alter table public.fin_data_exports force row level security;
alter table public.fin_data_export_parts enable row level security;
alter table public.fin_data_export_parts force row level security;
alter table public.fin_offboarding_requests enable row level security;
alter table public.fin_offboarding_requests force row level security;
alter table public.fin_offboarding_member_archive enable row level security;
alter table public.fin_offboarding_member_archive force row level security;
alter table public.fin_governance_log enable row level security;
alter table public.fin_governance_log force row level security;
revoke all on public.fin_retention_policies, public.fin_legal_holds, public.fin_data_exports, public.fin_data_export_parts,
  public.fin_offboarding_requests, public.fin_offboarding_member_archive, public.fin_governance_log from public, anon, authenticated;
grant select on public.fin_retention_policies, public.fin_legal_holds, public.fin_offboarding_requests, public.fin_governance_log to authenticated;
-- Leitura de exports sem o manifesto (que é servido pela RPC de download).
grant select (id, organization_id, purpose, status, requested_by, requested_at, completed_at, expires_at, schema_version,
  dataset_count, row_count, byte_size, error_code, download_count, last_downloaded_at) on public.fin_data_exports to authenticated;
grant all on public.fin_retention_policies, public.fin_legal_holds, public.fin_data_exports, public.fin_data_export_parts,
  public.fin_offboarding_requests, public.fin_offboarding_member_archive, public.fin_governance_log to service_role;

drop policy if exists fin_retention_policy_read on public.fin_retention_policies;
create policy fin_retention_policy_read on public.fin_retention_policies for select to authenticated
  using (organization_id is not null and public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_legal_hold_read on public.fin_legal_holds;
create policy fin_legal_hold_read on public.fin_legal_holds for select to authenticated
  using (public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_data_export_read on public.fin_data_exports;
create policy fin_data_export_read on public.fin_data_exports for select to authenticated
  using (public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_offboarding_read on public.fin_offboarding_requests;
create policy fin_offboarding_read on public.fin_offboarding_requests for select to authenticated
  using (public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_governance_log_read on public.fin_governance_log;
create policy fin_governance_log_read on public.fin_governance_log for select to authenticated
  using (organization_id is not null and public.fin_has_role(organization_id, array['admin']));

-- -------------------------------------------------------------- 4. helpers
create or replace function public.fin_governance_require_admin(p_org uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_org is null or not public.fin_has_role(p_org, array['admin'])
     or not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then
    raise exception 'forbidden';
  end if;
end $$;

-- Organização em offboarding depois da revogação: nada de novo vínculo nem aviso.
create or replace function public.fin_governance_org_locked(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fin_offboarding_requests r where r.organization_id = p_org
                  and r.status in ('access_revocation','retention_window','scheduled_for_deletion','closed'));
$$;

-- Conservador: qualquer hold ativo na organização suspende a retenção
-- configurável dela; hold de classe suspende só a classe. Sem classe
-- (exclusão do tenant), qualquer hold ativo bloqueia.
create or replace function public.fin_governance_hold_blocks(p_org uuid, p_class text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fin_legal_holds h where h.organization_id = p_org and h.status = 'active'
                  and (p_class is null or h.scope_type <> 'retention_class' or h.scope_class = p_class));
$$;

create or replace function public.fin_governance_member_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.fin_governance_org_locked(new.organization_id) then raise exception 'organization offboarding'; end if;
  return new;
end $$;
drop trigger if exists fin_governance_member_guard on public.fin_members;
create trigger fin_governance_member_guard before insert on public.fin_members for each row execute function public.fin_governance_member_guard();

create or replace function public.fin_governance_notification_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.fin_governance_org_locked(new.organization_id) then return null; end if;
  return new;
end $$;
drop trigger if exists fin_governance_notification_guard on public.fin_notifications;
create trigger fin_governance_notification_guard before insert on public.fin_notifications for each row execute function public.fin_governance_notification_guard();

-- ------------------------------------------------------ 5. políticas de retenção
-- Cria rascunho (nova versão). Organização: admin da compradora. Plataforma
-- (p_org nulo): operador finance_ops com MFA.
create or replace function public.fin_governance_save_retention_policy(p_org uuid, p_class text, p_days integer, p_reason text, p_decision_reference text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record; v_id uuid; v_version integer;
begin
  if p_org is null then perform public.fin_require_operator(); else perform public.fin_governance_require_admin(p_org); end if;
  select * into c from public.fin_retention_class_catalog() k where k.retention_class = p_class;
  if not found or (p_org is null) <> (c.scope = 'platform') then raise exception 'retention class not configurable'; end if;
  if p_days is null or p_days < c.min_days or p_days > c.max_days then raise exception 'invalid retention period'; end if;
  if p_org is not null and public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  perform pg_advisory_xact_lock(hashtext('fin_retention_policy:' || coalesce(p_org::text, 'platform') || ':' || p_class));
  select coalesce(max(version), 0) + 1 into v_version from public.fin_retention_policies
   where organization_id is not distinct from p_org and retention_class = p_class;
  insert into public.fin_retention_policies(organization_id, retention_class, version, retention_days, reason, decision_reference, created_by)
    values (p_org, p_class, v_version, p_days, trim(p_reason), nullif(trim(coalesce(p_decision_reference, '')), ''), auth.uid()) returning id into v_id;
  if p_org is not null then
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (p_org, 'retention_policy', v_id, 'retention_policy_created', auth.uid(),
        jsonb_build_object('retention_class', p_class, 'version', v_version, 'retention_days', p_days));
  end if;
  return v_id;
exception when check_violation then raise exception 'invalid retention policy';
end $$;

create or replace function public.fin_governance_activate_retention_policy(p_policy uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.fin_retention_policies%rowtype;
begin
  select * into p from public.fin_retention_policies where id = p_policy for update;
  if not found then raise exception 'forbidden'; end if;
  if p.organization_id is null then perform public.fin_require_operator(); else perform public.fin_governance_require_admin(p.organization_id); end if;
  if p.status = 'active' then return; end if;
  if p.status <> 'draft' then raise exception 'retention policy not draft'; end if;
  update public.fin_retention_policies set status = 'superseded', ended_at = now()
   where organization_id is not distinct from p.organization_id and retention_class = p.retention_class and status = 'active';
  update public.fin_retention_policies set status = 'active', activated_by = auth.uid(), activated_at = now(), effective_from = now() where id = p_policy;
  if p.organization_id is not null then
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (p.organization_id, 'retention_policy', p.id, 'retention_policy_activated', auth.uid(),
        jsonb_build_object('retention_class', p.retention_class, 'version', p.version, 'retention_days', p.retention_days));
  end if;
end $$;

create or replace function public.fin_governance_retire_retention_policy(p_policy uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.fin_retention_policies%rowtype;
begin
  select * into p from public.fin_retention_policies where id = p_policy for update;
  if not found then raise exception 'forbidden'; end if;
  if p.organization_id is null then perform public.fin_require_operator(); else perform public.fin_governance_require_admin(p.organization_id); end if;
  if p.status = 'retired' then return; end if;
  if p.status = 'draft' then
    delete from public.fin_retention_policies where id = p_policy;
  elsif p.status = 'active' then
    update public.fin_retention_policies set status = 'retired', ended_at = now() where id = p_policy;
  else
    raise exception 'retention policy not active';
  end if;
  if p.organization_id is not null then
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (p.organization_id, 'retention_policy', p.id, 'retention_policy_retired', auth.uid(),
        jsonb_build_object('retention_class', p.retention_class, 'version', p.version, 'was', p.status));
  end if;
end $$;

-- ------------------------------------------------------------ 6. legal hold
create or replace function public.fin_governance_create_legal_hold(p_org uuid, p_scope_type text, p_scope_id uuid, p_scope_class text, p_reason text, p_reference text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ok boolean;
begin
  perform public.fin_governance_require_admin(p_org);
  v_ok := case p_scope_type
    when 'organization' then p_scope_id is null and p_scope_class is null
    when 'retention_class' then p_scope_id is null and exists (select 1 from public.fin_retention_class_catalog() k where k.retention_class = p_scope_class and k.scope = 'tenant')
    when 'legal_entity' then exists (select 1 from public.fin_legal_entities e where e.id = p_scope_id and e.organization_id = p_org)
    when 'rfq' then exists (select 1 from public.fin_rfqs r where r.id = p_scope_id and r.organization_id = p_org)
    when 'contract' then exists (select 1 from public.fin_contracts c where c.id = p_scope_id and c.organization_id = p_org)
    when 'provider' then exists (select 1 from public.fin_providers p where p.id = p_scope_id and p.organization_id = p_org)
    else false end;
  if not coalesce(v_ok, false) or p_scope_type not in ('retention_class') and p_scope_class is not null then raise exception 'invalid legal hold'; end if;
  insert into public.fin_legal_holds(organization_id, scope_type, scope_id, scope_class, reason, reference, created_by)
    values (p_org, p_scope_type, p_scope_id, p_scope_class, trim(p_reason), nullif(trim(coalesce(p_reference, '')), ''), auth.uid()) returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'legal_hold', v_id, 'legal_hold_created', auth.uid(), jsonb_build_object('scope_type', p_scope_type, 'scope_class', p_scope_class));
  return v_id;
exception when check_violation then raise exception 'invalid legal hold';
end $$;

-- Liberação dupla é segura: devolve false sem alterar nada.
create or replace function public.fin_governance_release_legal_hold(p_hold uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare h public.fin_legal_holds%rowtype;
begin
  select * into h from public.fin_legal_holds where id = p_hold for update;
  if not found then raise exception 'forbidden'; end if;
  perform public.fin_governance_require_admin(h.organization_id);
  if h.status = 'released' then return false; end if;
  if p_reason is null or length(trim(p_reason)) not between 10 and 1000 or p_reason ~ '[<>]' then raise exception 'invalid legal hold'; end if;
  update public.fin_legal_holds set status = 'released', released_by = auth.uid(), released_at = now(), release_reason = trim(p_reason) where id = p_hold;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (h.organization_id, 'legal_hold', h.id, 'legal_hold_released', auth.uid(), jsonb_build_object('scope_type', h.scope_type));
  return true;
end $$;

-- ------------------------------------------------------------ 7. retenção
-- Executor limitado por lote e por classe. Com sessão (admin) só faz preview
-- da própria organização; apagar é exclusivo do job (service role). Rerun é
-- seguro: o critério é por data de corte e o que já saiu não volta a contar.
create or replace function public.fin_governance_retention_run(p_dry_run boolean default true, p_limit integer default 500, p_org uuid default null, p_request_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p record; v_cutoff timestamptz; v_eligible integer; v_done integer; v_part integer; v_items jsonb := '[]'::jsonb; v_limit integer;
  v_total integer := 0; v_held integer := 0; v_expired integer := 0; e record;
begin
  if auth.uid() is not null then
    perform public.fin_governance_require_admin(p_org);
    if not coalesce(p_dry_run, true) then raise exception 'forbidden'; end if;
  end if;
  v_limit := least(greatest(coalesce(p_limit, 500), 1), 1000);
  if not coalesce(p_dry_run, true) and not pg_try_advisory_xact_lock(hashtext('fin_governance_retention_run')) then
    raise exception using errcode = '55P03', message = 'job busy';
  end if;

  -- Cópias de export vencidas: classe de sistema, sempre ativa (o registro
  -- original continua no lugar; só a cópia expira).
  if auth.uid() is null and not coalesce(p_dry_run, true) then
    for e in select x.id, x.organization_id from public.fin_data_exports x
              where x.status = 'ready' and x.expires_at <= now() and (p_org is null or x.organization_id = p_org)
              order by x.expires_at, x.id limit v_limit for update skip locked
    loop
      delete from public.fin_data_export_parts where export_id = e.id;
      update public.fin_data_exports set status = 'expired', manifest = null, expires_at = null where id = e.id;
      insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
        values (e.organization_id, 'data_export', e.id, 'export_expired', null, '{}'::jsonb);
      insert into public.fin_governance_log(organization_id, action, retention_class, object_count, job_request_id)
        values (e.organization_id, 'export_expired', 'EXPORT_FILE', 1, p_request_id);
      v_expired := v_expired + 1;
    end loop;
  end if;

  for p in select rp.*, k.scope, k.action from public.fin_retention_policies rp
             join public.fin_retention_class_catalog() k on k.retention_class = rp.retention_class
            where rp.status = 'active' and rp.effective_from <= now()
              and (p_org is null and (auth.uid() is null) or rp.organization_id = p_org)
            order by rp.organization_id nulls first, rp.retention_class
  loop
    v_cutoff := now() - make_interval(days => p.retention_days);
    if p.organization_id is not null and public.fin_governance_hold_blocks(p.organization_id, p.retention_class) then
      v_items := v_items || jsonb_build_object('retention_class', p.retention_class, 'scope', p.scope, 'organization_id', p.organization_id,
        'policy_id', p.id, 'policy_version', p.version, 'eligible', 0, 'processed', 0, 'held', true);
      v_held := v_held + 1;
      if not coalesce(p_dry_run, true) then
        insert into public.fin_governance_log(organization_id, action, retention_class, policy_id, policy_version, object_count, job_request_id)
          values (p.organization_id, 'retention_held', p.retention_class, p.id, p.version, 0, p_request_id);
      end if;
      continue;
    end if;
    v_eligible := 0; v_done := 0;
    if p.retention_class = 'TEMPORARY_OPERATIONAL' then
      select count(*) into v_eligible from public.fin_notifications n where n.organization_id = p.organization_id and n.created_at < v_cutoff;
      if not coalesce(p_dry_run, true) then
        delete from public.fin_notifications where id in (select n.id from public.fin_notifications n
          where n.organization_id = p.organization_id and n.created_at < v_cutoff order by n.created_at limit v_limit for update skip locked);
        get diagnostics v_done = row_count;
      end if;
    elsif p.retention_class = 'WEBHOOK_DELIVERY' then
      select count(*) into v_eligible from public.fin_webhook_deliveries d where d.organization_id = p.organization_id
        and d.status in ('succeeded','dead','cancelled') and d.created_at < v_cutoff;
      if not coalesce(p_dry_run, true) then
        -- Folhas primeiro: uma entrega que originou replay sai num lote seguinte.
        delete from public.fin_webhook_deliveries where id in (select d.id from public.fin_webhook_deliveries d
          where d.organization_id = p.organization_id and d.status in ('succeeded','dead','cancelled') and d.created_at < v_cutoff
            and not exists (select 1 from public.fin_webhook_deliveries r where r.replay_of = d.id)
          order by d.created_at limit v_limit for update skip locked);
        get diagnostics v_done = row_count;
      end if;
    elsif p.retention_class = 'SECURITY_EVENT' then
      select count(*) into v_eligible from public.fin_sso_events s where s.organization_id = p.organization_id and s.happened_at < v_cutoff;
      if not coalesce(p_dry_run, true) then
        delete from public.fin_sso_events where id in (select s.id from public.fin_sso_events s
          where s.organization_id = p.organization_id and s.happened_at < v_cutoff order by s.happened_at limit v_limit for update skip locked);
        get diagnostics v_done = row_count;
      end if;
    elsif p.retention_class = 'CONTACT_PII' then
      -- Anonimiza e-mail de convite já encerrado; o vínculo e a trilha ficam.
      select (select count(*) from public.fin_member_invitations i where i.organization_id = p.organization_id and i.created_at < v_cutoff
                and (i.accepted_at is not null or i.expires_at < now()) and i.email not like 'redacted+%@invalid.invalid')
           + (select count(*) from public.fin_rfq_invites i where i.buyer_organization_id = p.organization_id and i.created_at < v_cutoff
                and i.status <> 'invited' and i.recipient_email is not null and i.recipient_email not like 'redacted+%@invalid.invalid')
        into v_eligible;
      if not coalesce(p_dry_run, true) then
        update public.fin_member_invitations set email = 'redacted+' || id || '@invalid.invalid' where id in (select i.id from public.fin_member_invitations i
          where i.organization_id = p.organization_id and i.created_at < v_cutoff and (i.accepted_at is not null or i.expires_at < now())
            and i.email not like 'redacted+%@invalid.invalid' order by i.created_at limit v_limit for update skip locked);
        get diagnostics v_done = row_count;
        update public.fin_rfq_invites set recipient_email = 'redacted+' || id || '@invalid.invalid' where id in (select i.id from public.fin_rfq_invites i
          where i.buyer_organization_id = p.organization_id and i.created_at < v_cutoff and i.status <> 'invited'
            and i.recipient_email is not null and i.recipient_email not like 'redacted+%@invalid.invalid'
          order by i.created_at limit greatest(v_limit - v_done, 0) for update skip locked);
        get diagnostics v_part = row_count;
        v_done := v_done + v_part;
      end if;
    elsif p.retention_class = 'PLATFORM_TELEMETRY' then
      select count(*) into v_eligible from public.fin_job_runs j where j.status <> 'running' and j.finished_at < v_cutoff
        and not exists (select 1 from public.fin_job_leases l where l.run_id = j.id);
      if not coalesce(p_dry_run, true) then
        delete from public.fin_job_runs where id in (select j.id from public.fin_job_runs j where j.status <> 'running' and j.finished_at < v_cutoff
          and not exists (select 1 from public.fin_job_leases l where l.run_id = j.id) order by j.finished_at limit v_limit for update skip locked);
        get diagnostics v_done = row_count;
      end if;
    elsif p.retention_class = 'PLATFORM_SECURITY_TRAIL' then
      select (select count(*) from public.fin_ops_access_log a where a.happened_at < v_cutoff)
           + (select count(*) from public.fin_invite_acceptance_denials d where d.happened_at < v_cutoff) into v_eligible;
      if not coalesce(p_dry_run, true) then
        delete from public.fin_ops_access_log where id in (select a.id from public.fin_ops_access_log a where a.happened_at < v_cutoff
          order by a.happened_at limit v_limit for update skip locked);
        get diagnostics v_done = row_count;
        delete from public.fin_invite_acceptance_denials where id in (select d.id from public.fin_invite_acceptance_denials d where d.happened_at < v_cutoff
          order by d.happened_at limit greatest(v_limit - v_done, 0) for update skip locked);
        get diagnostics v_part = row_count;
        v_done := v_done + v_part;
      end if;
    end if;
    v_total := v_total + v_done;
    v_items := v_items || jsonb_build_object('retention_class', p.retention_class, 'scope', p.scope, 'organization_id', p.organization_id,
      'policy_id', p.id, 'policy_version', p.version, 'eligible', v_eligible, 'processed', v_done, 'held', false);
    if not coalesce(p_dry_run, true) and v_done > 0 then
      insert into public.fin_governance_log(organization_id, action, retention_class, policy_id, policy_version, object_count, job_request_id)
        values (p.organization_id, 'retention_purged', p.retention_class, p.id, p.version, v_done, p_request_id);
      if p.organization_id is not null then
        insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
          values (p.organization_id, 'retention_policy', p.id, 'retention_purged', null,
            jsonb_build_object('retention_class', p.retention_class, 'version', p.version, 'count', v_done, 'action', p.action));
      end if;
    end if;
  end loop;
  if coalesce(p_dry_run, true) and auth.uid() is not null then
    insert into public.fin_governance_log(organization_id, action, object_count, actor_id)
      values (p_org, 'retention_preview', coalesce((select sum((i->>'eligible')::integer) from jsonb_array_elements(v_items) i), 0), auth.uid());
  end if;
  return jsonb_build_object('dry_run', coalesce(p_dry_run, true), 'batch_limit', v_limit, 'items', v_items,
    'processed', v_total, 'held', v_held, 'exports_expired', v_expired);
end $$;

-- --------------------------------------------------------------- 8. export
create or replace function public.fin_governance_request_export(p_org uuid, p_purpose text default 'portability')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.fin_governance_require_admin(p_org);
  if p_purpose not in ('portability','offboarding') then raise exception 'invalid export'; end if;
  if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  perform pg_advisory_xact_lock(hashtext('fin_governance_export:' || p_org));
  -- Idempotente: um pedido aberto por organização.
  select id into v_id from public.fin_data_exports where organization_id = p_org and status = 'requested';
  if found then return v_id; end if;
  insert into public.fin_data_exports(organization_id, purpose, requested_by) values (p_org, p_purpose, auth.uid()) returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'data_export', v_id, 'export_requested', auth.uid(), jsonb_build_object('purpose', p_purpose));
  return v_id;
end $$;

-- Conjuntos exportados. Colunas de segredo/infra nunca entram: o `- array[...]`
-- final remove hash de token, cifrado de segredo, caminho de storage, lease.
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
    ('legal_holds', 'select * from public.fin_legal_holds where organization_id = $1');
$$;
revoke all on function public.fin_governance_export_datasets() from public, anon, authenticated;

-- Job: monta um export pendente por chamada. Tudo numa subtransação: falha
-- nunca deixa `ready` nem parte órfã; o pedido fica `failed` com código.
create or replace function public.fin_governance_build_export(p_max_dataset_bytes integer default 4000000)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x public.fin_data_exports%rowtype; d record; v_rows jsonb; v_text text; v_count integer; v_bytes integer;
  v_manifest jsonb := '[]'::jsonb; v_total_rows bigint := 0; v_total_bytes bigint := 0; v_sets integer := 0; v_error text;
  v_secret_keys text[] := array['token_hash','secret_ciphertext','verification_token_hash','lease_token','lease_expires_at','storage_path','storage_bucket','request_fingerprint','subject_hash'];
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  select * into x from public.fin_data_exports where status = 'requested' order by requested_at, id limit 1 for update skip locked;
  if not found then return jsonb_build_object('processed', 0); end if;
  begin
    if public.fin_governance_org_locked(x.organization_id) and x.purpose <> 'offboarding' then raise exception 'organization offboarding'; end if;
    for d in select * from public.fin_governance_export_datasets() loop
      execute format('select coalesce(jsonb_agg(to_jsonb(t) - $2 order by to_jsonb(t)::text), ''[]''::jsonb) from (%s) t', d.query)
        into v_rows using x.organization_id, v_secret_keys;
      v_text := v_rows::text;
      v_count := jsonb_array_length(v_rows);
      v_bytes := octet_length(v_text);
      if v_bytes > least(greatest(coalesce(p_max_dataset_bytes, 4000000), 1), 4000000) then raise exception 'export too large'; end if;
      insert into public.fin_data_export_parts(export_id, organization_id, dataset, row_count, byte_size, sha256, content)
        values (x.id, x.organization_id, d.dataset, v_count, v_bytes, encode(sha256(convert_to(v_text, 'UTF8')), 'hex'), v_text);
      v_manifest := v_manifest || jsonb_build_object('dataset', d.dataset, 'file', 'data/' || d.dataset || '.json', 'rows', v_count, 'bytes', v_bytes,
        'sha256', encode(sha256(convert_to(v_text, 'UTF8')), 'hex'));
      v_total_rows := v_total_rows + v_count; v_total_bytes := v_total_bytes + v_bytes; v_sets := v_sets + 1;
    end loop;
    update public.fin_data_exports set status = 'ready', completed_at = now(), expires_at = now() + interval '7 days',
      schema_version = public.fin_setting('schema_version', 'unknown'), dataset_count = v_sets, row_count = v_total_rows, byte_size = v_total_bytes,
      manifest = jsonb_build_object('format', 'arandu-export', 'format_version', 1, 'export_id', x.id, 'organization_id', x.organization_id,
        'purpose', x.purpose, 'schema_version', public.fin_setting('schema_version', 'unknown'), 'generated_at', now(),
        'checksum_algorithm', 'sha256 over the UTF-8 bytes of each data/<dataset>.json part', 'datasets', v_manifest,
        'excluded', jsonb_build_array('password hashes and auth secrets (not stored by Arandu)', 'API token hashes', 'webhook signing secrets',
          'SSO domain verification hashes', 'internal storage paths', 'job leases', 'notifications and drafts (ephemeral)', 'document binaries (metadata only)'))
     where id = x.id;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (x.organization_id, 'data_export', x.id, 'export_completed', null, jsonb_build_object('datasets', v_sets, 'rows', v_total_rows, 'bytes', v_total_bytes));
    return jsonb_build_object('processed', 1, 'export_id', x.id, 'status', 'ready');
  exception when others then
    v_error := case when sqlerrm = 'export too large' then 'export_too_large' when sqlerrm = 'organization offboarding' then 'organization_offboarding' else 'export_build_failed' end;
  end;
  update public.fin_data_exports set status = 'failed', completed_at = now(), error_code = v_error where id = x.id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (x.organization_id, 'data_export', x.id, 'export_failed', null, jsonb_build_object('error_code', v_error));
  return jsonb_build_object('processed', 1, 'export_id', x.id, 'status', 'failed', 'error_code', v_error);
end $$;

-- Download controlado: admin atual da organização, export pronto e não vencido.
create or replace function public.fin_governance_export_manifest(p_export uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare x public.fin_data_exports%rowtype;
begin
  select * into x from public.fin_data_exports where id = p_export for update;
  if not found then raise exception 'forbidden'; end if;
  perform public.fin_governance_require_admin(x.organization_id);
  if x.status <> 'ready' or x.expires_at <= now() then raise exception 'export not available'; end if;
  update public.fin_data_exports set download_count = download_count + 1, last_downloaded_at = now() where id = p_export;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (x.organization_id, 'data_export', x.id, 'export_downloaded', auth.uid(), '{}'::jsonb);
  return x.manifest;
end $$;

create or replace function public.fin_governance_export_part(p_export uuid, p_dataset text)
returns text language plpgsql security definer set search_path = '' as $$
declare x public.fin_data_exports%rowtype; v_content text;
begin
  select * into x from public.fin_data_exports where id = p_export;
  if not found then raise exception 'forbidden'; end if;
  perform public.fin_governance_require_admin(x.organization_id);
  if x.status <> 'ready' or x.expires_at <= now() then raise exception 'export not available'; end if;
  select content into v_content from public.fin_data_export_parts where export_id = p_export and dataset = p_dataset;
  if not found then raise exception 'export not available'; end if;
  return v_content;
end $$;

-- Todas as partes de uma vez (pacote único do download), mesmas checagens.
create or replace function public.fin_governance_export_parts(p_export uuid)
returns table(dataset text, sha256 text, content text) language plpgsql security definer set search_path = '' as $$
declare x public.fin_data_exports%rowtype;
begin
  select * into x from public.fin_data_exports e where e.id = p_export;
  if not found then raise exception 'forbidden'; end if;
  perform public.fin_governance_require_admin(x.organization_id);
  if x.status <> 'ready' or x.expires_at <= now() then raise exception 'export not available'; end if;
  return query select p.dataset, p.sha256, p.content from public.fin_data_export_parts p where p.export_id = p_export order by p.dataset;
end $$;

-- ------------------------------------------------------------ 9. offboarding
create or replace function public.fin_governance_request_offboarding(p_org uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.fin_governance_require_admin(p_org);
  if p_reason is null or length(trim(p_reason)) not between 10 and 1000 or p_reason ~ '[<>]' then raise exception 'invalid offboarding'; end if;
  perform pg_advisory_xact_lock(hashtext('fin_governance_offboarding:' || p_org));
  select id into v_id from public.fin_offboarding_requests where organization_id = p_org and status not in ('closed','cancelled');
  if found then return v_id; end if;
  insert into public.fin_offboarding_requests(organization_id, reason, requested_by) values (p_org, trim(p_reason), auth.uid()) returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'offboarding', v_id, 'offboarding_requested', auth.uid(), '{}'::jsonb);
  return v_id;
end $$;

create or replace function public.fin_governance_offboarding_set(p_request uuid, p_from text, p_to text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  update public.fin_offboarding_requests set status = p_to, updated_at = now(),
    closed_at = case when p_to = 'closed' then now() else closed_at end,
    cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end
   where id = p_request and status = p_from returning organization_id into v_org;
  if v_org is null then raise exception 'invalid offboarding transition'; end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_org, 'offboarding', p_request, case p_to when 'scheduled_for_deletion' then 'deletion_scheduled' when 'cancelled' then 'offboarding_cancelled'
      when 'closed' then 'offboarding_closed' else 'offboarding_transition' end, p_actor, jsonb_build_object('from', p_from, 'to', p_to));
end $$;

-- Revogação coordenada e idempotente: contas de serviço e credenciais,
-- webhooks e entregas, conexões SSO e sessões, convites e vínculos. Contagens
-- acumulam; uma segunda execução encontra zero e não desfaz nada.
create or replace function public.fin_governance_revoke_org_access(p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.fin_offboarding_requests%rowtype; v jsonb; n integer; v_actor uuid;
begin
  select * into r from public.fin_offboarding_requests where id = p_request for update;
  if not found or r.status not in ('access_revocation','retention_window','scheduled_for_deletion') then raise exception 'invalid offboarding transition'; end if;
  v_actor := r.requested_by;
  v := jsonb_build_object('service_accounts', 0, 'api_credentials', 0, 'webhooks', 0, 'webhook_deliveries', 0, 'sso_connections', 0,
    'member_invitations', 0, 'rfq_invites', 0, 'members', 0);
  update public.fin_api_credentials set revoked_at = now(), revoked_by = v_actor where organization_id = r.organization_id and revoked_at is null;
  get diagnostics n = row_count; v := jsonb_set(v, '{api_credentials}', to_jsonb(n));
  update public.fin_service_accounts set status = 'revoked', revoked_at = now(), revoked_by = v_actor, updated_at = now()
   where organization_id = r.organization_id and status <> 'revoked';
  get diagnostics n = row_count; v := jsonb_set(v, '{service_accounts}', to_jsonb(n));
  update public.fin_webhook_endpoints set status = 'disabled', disabled_at = coalesce(disabled_at, now()), disabled_reason = 'tenant_offboarding', updated_at = now()
   where organization_id = r.organization_id and status = 'active';
  get diagnostics n = row_count; v := jsonb_set(v, '{webhooks}', to_jsonb(n));
  update public.fin_webhook_deliveries set status = 'cancelled', lease_token = null, lease_expires_at = null
   where organization_id = r.organization_id and status in ('pending','failed','delivering');
  get diagnostics n = row_count; v := jsonb_set(v, '{webhook_deliveries}', to_jsonb(n));
  update public.fin_sso_connections set status = 'disabled', enforce_sso = false, sessions_valid_after = now(), updated_at = now()
   where organization_id = r.organization_id and status <> 'disabled';
  get diagnostics n = row_count; v := jsonb_set(v, '{sso_connections}', to_jsonb(n));
  update public.fin_member_invitations set expires_at = now() where organization_id = r.organization_id and accepted_at is null and expires_at > now();
  get diagnostics n = row_count; v := jsonb_set(v, '{member_invitations}', to_jsonb(n));
  update public.fin_rfq_invites set status = 'revoked' where buyer_organization_id = r.organization_id and status = 'invited';
  get diagnostics n = row_count; v := jsonb_set(v, '{rfq_invites}', to_jsonb(n));
  insert into public.fin_offboarding_member_archive(request_id, organization_id, user_id, role, entity_scope, entity_ids, member_since)
    select p_request, m.organization_id, m.user_id, m.role, m.entity_scope,
           coalesce((select array_agg(g.entity_id order by g.entity_id) from public.fin_member_entity_grants g where g.organization_id = m.organization_id and g.user_id = m.user_id), '{}'),
           m.created_at
      from public.fin_members m where m.organization_id = r.organization_id
    on conflict (request_id, user_id) do nothing;
  delete from public.fin_members where organization_id = r.organization_id;
  get diagnostics n = row_count; v := jsonb_set(v, '{members}', to_jsonb(n));
  update public.fin_offboarding_requests set revoked_at = coalesce(revoked_at, now()), updated_at = now(),
    revocation = (select jsonb_object_agg(k, coalesce((r.revocation->>k)::integer, 0) + (v->>k)::integer) from jsonb_object_keys(v) k)
   where id = p_request;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (r.organization_id, 'offboarding', p_request, 'access_revoked', auth.uid(), v);
  return v;
end $$;

-- Ações do admin da compradora (máquina de estados determinística).
create or replace function public.fin_governance_offboarding_action(p_request uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.fin_offboarding_requests%rowtype; v_export uuid; v_export_status text; v_days integer; v_ref text;
begin
  select * into r from public.fin_offboarding_requests where id = p_request for update;
  if not found then raise exception 'forbidden'; end if;
  perform public.fin_governance_require_admin(r.organization_id);
  if p_action = 'request_export' then
    if r.export_id is not null then select status into v_export_status from public.fin_data_exports where id = r.export_id; end if;
    if not (r.status = 'requested' or r.status = 'export_pending' and v_export_status in ('failed','expired','cancelled')) then raise exception 'invalid offboarding transition'; end if;
    v_export := public.fin_governance_request_export(r.organization_id, 'offboarding');
    update public.fin_offboarding_requests set export_id = v_export, export_waived = false, updated_at = now() where id = p_request;
    if r.status = 'requested' then perform public.fin_governance_offboarding_set(p_request, 'requested', 'export_pending', auth.uid()); end if;
    return 'export_pending';
  elsif p_action = 'confirm_revocation' then
    if not (r.status = 'export_ready' or r.status = 'requested' and coalesce((p_payload->>'export_waived')::boolean, false)) then raise exception 'invalid offboarding transition'; end if;
    v_days := case when coalesce(p_payload->>'retention_days', '') ~ '^[0-9]{1,4}$' then (p_payload->>'retention_days')::integer end;
    v_ref := nullif(trim(coalesce(p_payload->>'decision_reference', '')), '');
    if v_days is null or v_days > 3650 or v_ref is null or v_ref !~ '^[A-Za-z0-9._:/#-]{3,120}$' then raise exception 'invalid offboarding'; end if;
    update public.fin_offboarding_requests set retention_days = v_days, decision_reference = v_ref,
      export_waived = r.status = 'requested', updated_at = now() where id = p_request;
    perform public.fin_governance_offboarding_set(p_request, r.status, 'access_revocation', auth.uid());
    perform public.fin_governance_revoke_org_access(p_request);
    update public.fin_offboarding_requests set retention_until = current_date + v_days where id = p_request;
    perform public.fin_governance_offboarding_set(p_request, 'access_revocation', 'retention_window', auth.uid());
    return 'retention_window';
  elsif p_action = 'cancel' then
    if r.status not in ('requested','export_pending','export_ready') then raise exception 'invalid offboarding transition'; end if;
    if r.export_id is not null then update public.fin_data_exports set status = 'cancelled' where id = r.export_id and status = 'requested'; end if;
    perform public.fin_governance_offboarding_set(p_request, r.status, 'cancelled', auth.uid());
    return 'cancelled';
  end if;
  raise exception 'invalid offboarding transition';
end $$;

-- Job: avança o que depende de tempo ou de outro job. Nunca fecha: fechar
-- exige operador e banco sem dado remanescente do tenant.
create or replace function public.fin_governance_offboarding_advance(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_ready integer := 0; v_scheduled integer := 0; v_held integer := 0; v_status text;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  for r in select * from public.fin_offboarding_requests where status in ('export_pending','retention_window')
            order by updated_at, id limit least(greatest(coalesce(p_limit, 50), 1), 200) for update skip locked
  loop
    if r.status = 'export_pending' then
      select status into v_status from public.fin_data_exports where id = r.export_id;
      if v_status = 'ready' then perform public.fin_governance_offboarding_set(r.id, 'export_pending', 'export_ready', null); v_ready := v_ready + 1; end if;
    elsif r.retention_until <= current_date then
      if public.fin_governance_hold_blocks(r.organization_id, null) then v_held := v_held + 1; continue; end if;
      perform public.fin_governance_offboarding_set(r.id, 'retention_window', 'scheduled_for_deletion', null);
      v_scheduled := v_scheduled + 1;
    end if;
  end loop;
  return jsonb_build_object('export_ready', v_ready, 'scheduled_for_deletion', v_scheduled, 'held', v_held);
end $$;

-- Prévia da exclusão física (contagens por tabela, sem conteúdo).
create or replace function public.fin_governance_deletion_preview(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; v_count bigint; v jsonb := '{}'::jsonb; v_total bigint := 0;
begin
  if auth.uid() is not null then perform public.fin_require_operator(); end if;
  for d in select * from public.fin_governance_export_datasets() where dataset not in ('organization','retention_policies','legal_holds') loop
    execute format('select count(*) from (%s) t', d.query) into v_count using p_org;
    v := v || jsonb_build_object(d.dataset, v_count);
    v_total := v_total + v_count;
  end loop;
  return jsonb_build_object('organization_id', p_org, 'tables', v, 'remaining_rows', v_total);
end $$;

create or replace function public.fin_governance_offboarding_close(p_request uuid, p_evidence text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.fin_offboarding_requests%rowtype;
begin
  perform public.fin_require_operator();
  select * into r from public.fin_offboarding_requests where id = p_request for update;
  if not found or r.status <> 'scheduled_for_deletion' then raise exception 'invalid offboarding transition'; end if;
  if public.fin_governance_hold_blocks(r.organization_id, null) then raise exception 'legal hold active'; end if;
  if p_evidence is null or p_evidence !~ '^[A-Za-z0-9._:/#-]{3,120}$' then raise exception 'invalid offboarding'; end if;
  if (public.fin_governance_deletion_preview(r.organization_id)->>'remaining_rows')::bigint > 0 then raise exception 'tenant data remains'; end if;
  update public.fin_offboarding_requests set closure_evidence = p_evidence where id = p_request;
  perform public.fin_governance_offboarding_set(p_request, 'scheduled_for_deletion', 'closed', auth.uid());
end $$;

create or replace function public.fin_governance_offboarding_operator_cancel(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.fin_offboarding_requests%rowtype;
begin
  perform public.fin_require_operator();
  select * into r from public.fin_offboarding_requests where id = p_request for update;
  if not found or r.status not in ('retention_window','scheduled_for_deletion') then raise exception 'invalid offboarding transition'; end if;
  perform public.fin_governance_offboarding_set(p_request, r.status, 'cancelled', auth.uid());
end $$;

-- ----------------------------------------------------- 10. resumo para o painel
create or replace function public.fin_governance_summary(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fin_governance_require_admin(p_org);
  return jsonb_build_object(
    'retention_classes', (select jsonb_agg(jsonb_build_object('retention_class', k.retention_class, 'min_days', k.min_days, 'max_days', k.max_days, 'action', k.action)
        order by k.retention_class) from public.fin_retention_class_catalog() k where k.scope = 'tenant'),
    'active_holds', (select count(*) from public.fin_legal_holds h where h.organization_id = p_org and h.status = 'active'),
    'offboarding', (select jsonb_build_object('id', r.id, 'status', r.status, 'retention_until', r.retention_until, 'revocation', r.revocation)
        from public.fin_offboarding_requests r where r.organization_id = p_org and r.status not in ('closed','cancelled')),
    'last_retention', (select max(happened_at) from public.fin_governance_log g where g.organization_id = p_org and g.action in ('retention_purged','retention_held')));
end $$;

-- ------------------------------------------------------ 11. console operacional
create or replace function public.fin_ops_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.fin_require_operator();
  insert into public.fin_ops_access_log (user_id, action) values (auth.uid(), 'overview');
  select jsonb_build_object(
    'schema_version', public.fin_setting('schema_version', 'financial-pilot-grade-1'),
    'generated_at', now(),
    'email_enabled', public.fin_setting('email_enabled', 'false') = 'true',
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', j.job, 'status', j.status, 'processed', j.processed, 'request_id', j.request_id,
        'failed', j.failed, 'duration_ms', floor(extract(epoch from coalesce(j.finished_at,now()) - j.started_at)*1000), 'error_code', j.error_code, 'started_at', j.started_at, 'finished_at', j.finished_at) order by j.finished_at desc)
      from (select * from public.fin_job_runs order by started_at desc limit 20) j), '[]'::jsonb),
    'webhooks', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status,total) from (select status,count(*) total from public.fin_webhook_deliveries group by status) x),'{}'::jsonb),
      'oldest_pending_minutes', (select floor(extract(epoch from now()-min(created_at))/60) from public.fin_webhook_deliveries where status in ('pending','failed')),
      'recent_failures', coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'attempts',attempts,'error_code',last_error_code,'created_at',created_at)) from
        (select id,status,attempts,last_error_code,created_at from public.fin_webhook_deliveries where status in ('failed','dead') order by created_at desc limit 20) w),'[]'::jsonb)),
    'sso', jsonb_build_object('connections_by_status',coalesce((select jsonb_object_agg(status,total) from (select status,count(*) total from public.fin_sso_connections group by status) s),'{}'::jsonb),
      'failures_24h',(select count(*) from public.fin_sso_events where happened_at > now()-interval '24 hours' and outcome <> 'success')),
    'governance', jsonb_build_object(
      'exports_by_status', coalesce((select jsonb_object_agg(status,total) from (select status,count(*) total from public.fin_data_exports group by status) x),'{}'::jsonb),
      'offboarding_by_status', coalesce((select jsonb_object_agg(status,total) from (select status,count(*) total from public.fin_offboarding_requests group by status) x),'{}'::jsonb),
      'active_legal_holds', (select count(*) from public.fin_legal_holds where status = 'active'),
      'last_retention_run', (select max(finished_at) from public.fin_job_runs where job = 'retention' and status = 'succeeded'),
      'retention_purged_24h', coalesce((select sum(object_count) from public.fin_governance_log where action = 'retention_purged' and happened_at > now() - interval '24 hours'), 0)),
    'expired_job_leases', (select count(*) from public.fin_job_runs where status='running' and lease_expires_at <= now()),
    'last_renewal_success', (select max(finished_at) from public.fin_job_runs where job = 'renewals' and status = 'succeeded'),
    'renewal_milestones_24h', (select count(*) from public.fin_renewal_milestones where triggered_at > now() - interval '24 hours'),
    'outbox', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status, total) from (select status, count(*) total from public.transactional_email_outbox
          where template = 'finance_notification' group by status) s), '{}'::jsonb),
      'oldest_pending_minutes', (select floor(extract(epoch from now() - min(created_at)) / 60) from public.transactional_email_outbox
          where template = 'finance_notification' and status in ('pending','retry')),
      'recent_failures', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'attempts', o.attempts,
          'error_code', o.last_error_code, 'created_at', o.created_at) order by o.created_at desc)
        from (select * from public.transactional_email_outbox where template = 'finance_notification' and status in ('retry','dead')
              order by created_at desc limit 10) o), '[]'::jsonb)),
    'documents', jsonb_build_object(
      'pending_over_1h', (select count(*) from public.fin_document_versions where status = 'pending' and created_at < now() - interval '1 hour'),
      'failed_24h', (select count(*) from public.fin_document_versions where status = 'failed' and completed_at > now() - interval '24 hours'),
      'available_total', (select count(*) from public.fin_document_versions where status = 'available')),
    'notifications_24h', (select count(*) from public.fin_notifications where created_at > now() - interval '24 hours'),
    'invite_denials_24h', coalesce((select jsonb_object_agg(reason, total) from (select reason, count(*) total
      from public.fin_invite_acceptance_denials where happened_at > now() - interval '24 hours' group by reason) d), '{}'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ------------------------------------------------------------- 12. superfície
revoke all on function
  public.fin_governance_require_admin(uuid), public.fin_governance_org_locked(uuid), public.fin_governance_hold_blocks(uuid,text),
  public.fin_governance_member_guard(), public.fin_governance_notification_guard(),
  public.fin_governance_save_retention_policy(uuid,text,integer,text,text), public.fin_governance_activate_retention_policy(uuid),
  public.fin_governance_retire_retention_policy(uuid), public.fin_governance_create_legal_hold(uuid,text,uuid,text,text,text),
  public.fin_governance_release_legal_hold(uuid,text), public.fin_governance_retention_run(boolean,integer,uuid,text),
  public.fin_governance_request_export(uuid,text), public.fin_governance_build_export(integer), public.fin_governance_export_manifest(uuid),
  public.fin_governance_export_part(uuid,text), public.fin_governance_export_parts(uuid), public.fin_governance_request_offboarding(uuid,text),
  public.fin_governance_offboarding_set(uuid,text,text,uuid), public.fin_governance_revoke_org_access(uuid),
  public.fin_governance_offboarding_action(uuid,text,jsonb), public.fin_governance_offboarding_advance(integer),
  public.fin_governance_deletion_preview(uuid), public.fin_governance_offboarding_close(uuid,text),
  public.fin_governance_offboarding_operator_cancel(uuid), public.fin_governance_summary(uuid), public.fin_ops_overview()
from public, anon, authenticated;
grant execute on function
  public.fin_governance_save_retention_policy(uuid,text,integer,text,text), public.fin_governance_activate_retention_policy(uuid),
  public.fin_governance_retire_retention_policy(uuid), public.fin_governance_create_legal_hold(uuid,text,uuid,text,text,text),
  public.fin_governance_release_legal_hold(uuid,text), public.fin_governance_retention_run(boolean,integer,uuid,text),
  public.fin_governance_request_export(uuid,text), public.fin_governance_export_manifest(uuid), public.fin_governance_export_part(uuid,text),
  public.fin_governance_export_parts(uuid), public.fin_governance_request_offboarding(uuid,text), public.fin_governance_offboarding_action(uuid,text,jsonb),
  public.fin_governance_deletion_preview(uuid), public.fin_governance_offboarding_close(uuid,text),
  public.fin_governance_offboarding_operator_cancel(uuid), public.fin_governance_summary(uuid), public.fin_ops_overview()
to authenticated;
grant execute on function
  public.fin_governance_retention_run(boolean,integer,uuid,text), public.fin_governance_build_export(integer),
  public.fin_governance_offboarding_advance(integer), public.fin_governance_deletion_preview(uuid),
  public.fin_governance_revoke_org_access(uuid)
to service_role;

insert into public.fin_settings(key,value) values('schema_version', 'financial-data-governance-1') on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst, 'reload schema';
commit;

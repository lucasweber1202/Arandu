-- Arandu — controles de retenção e legal hold
-- Esta migration NÃO define prazos jurídicos/fiscais. Ela impede automação de retenção
-- sem decisão humana versionada e oferece legal hold auditável por entidade.

create table if not exists public.data_retention_policies (
  data_class text primary key,
  retention_days integer,
  disposition text not null default 'review' check (disposition in ('review','anonymize','delete')),
  enabled boolean not null default false,
  decision_reference text,
  approved_by_ref text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    enabled = false
    or (
      retention_days is not null
      and retention_days > 0
      and length(trim(coalesce(decision_reference, ''))) >= 8
      and length(trim(coalesce(approved_by_ref, ''))) >= 3
      and approved_at is not null
      and approved_at <= now()
    )
  )
);

create table if not exists public.data_legal_holds (
  id uuid primary key default gen_random_uuid(),
  data_class text not null,
  entity_id text not null,
  reason_reference text not null,
  created_by_ref text not null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  release_reference text,
  released_by_ref text,
  check (length(trim(reason_reference)) >= 8),
  check (length(trim(created_by_ref)) >= 3),
  check (
    released_at is null
    or (
      released_at >= created_at
      and length(trim(coalesce(release_reference, ''))) >= 8
      and length(trim(coalesce(released_by_ref, ''))) >= 3
    )
  )
);

create unique index if not exists uq_data_legal_hold_active
  on public.data_legal_holds(data_class, entity_id)
  where released_at is null;

create index if not exists idx_data_legal_holds_lookup
  on public.data_legal_holds(data_class, entity_id, released_at);

alter table public.data_retention_policies enable row level security;
alter table public.data_legal_holds enable row level security;
revoke all on public.data_retention_policies from public, anon, authenticated;
revoke all on public.data_legal_holds from public, anon, authenticated;
grant select, insert, update, delete on public.data_retention_policies to service_role;
grant select, insert, update, delete on public.data_legal_holds to service_role;

create or replace function public.is_under_legal_hold(
  p_data_class text,
  p_entity_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.data_legal_holds
    where data_class = trim(p_data_class)
      and entity_id = trim(p_entity_id)
      and released_at is null
  );
$$;

create or replace function public.create_legal_hold(
  p_data_class text,
  p_entity_id text,
  p_reason_reference text,
  p_actor_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.data_legal_holds%rowtype;
begin
  if coalesce(length(trim(p_data_class)), 0) < 2
    or coalesce(length(trim(p_entity_id)), 0) < 1
    or coalesce(length(trim(p_reason_reference)), 0) < 8
    or coalesce(length(trim(p_actor_ref)), 0) < 3 then
    raise exception using message = 'Legal hold inválido.', errcode = '22023';
  end if;

  insert into public.data_legal_holds(data_class, entity_id, reason_reference, created_by_ref)
  values (
    left(trim(p_data_class), 80),
    left(trim(p_entity_id), 180),
    left(trim(p_reason_reference), 240),
    left(trim(p_actor_ref), 120)
  )
  on conflict (data_class, entity_id) where released_at is null
  do update set reason_reference = excluded.reason_reference
  returning * into v_row;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'active', v_row.released_at is null);
end;
$$;

create or replace function public.release_legal_hold(
  p_data_class text,
  p_entity_id text,
  p_release_reference text,
  p_actor_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.data_legal_holds%rowtype;
begin
  if coalesce(length(trim(p_release_reference)), 0) < 8
    or coalesce(length(trim(p_actor_ref)), 0) < 3 then
    raise exception using message = 'Liberação de legal hold inválida.', errcode = '22023';
  end if;

  update public.data_legal_holds
  set
    released_at = now(),
    release_reference = left(trim(p_release_reference), 240),
    released_by_ref = left(trim(p_actor_ref), 120)
  where data_class = trim(p_data_class)
    and entity_id = trim(p_entity_id)
    and released_at is null
  returning * into v_row;

  if not found then
    raise exception using message = 'Legal hold ativo não encontrado.', errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'active', false);
end;
$$;

revoke all on function public.is_under_legal_hold(text,text) from public, anon, authenticated;
revoke all on function public.create_legal_hold(text,text,text,text) from public, anon, authenticated;
revoke all on function public.release_legal_hold(text,text,text,text) from public, anon, authenticated;
grant execute on function public.is_under_legal_hold(text,text) to service_role;
grant execute on function public.create_legal_hold(text,text,text,text) to service_role;
grant execute on function public.release_legal_hold(text,text,text,text) to service_role;

comment on table public.data_retention_policies is 'Prazos só podem ser habilitados após decisão humana/fiscal-jurídica referenciada.';
comment on table public.data_legal_holds is 'Bloqueios de retenção por entidade sem armazenar PII no motivo ou ator.';

create or replace function public.execute_data_retention(
  p_data_class text,
  p_dry_run boolean,
  p_actor_ref text,
  p_decision_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.data_retention_policies%rowtype;
  v_cutoff timestamptz;
  v_candidates bigint := 0;
  v_affected bigint := 0;
begin
  if p_data_class not in ('conversion_events','idempotency_keys','transactional_email_outbox') then
    raise exception using message = 'Classe não suportada pelo executor de retenção.', errcode = '22023';
  end if;
  if coalesce(length(trim(p_actor_ref)),0) < 3 or coalesce(length(trim(p_decision_reference)),0) < 8 then
    raise exception using message = 'Ator e referência de decisão são obrigatórios.', errcode = '22023';
  end if;
  select * into v_policy from public.data_retention_policies where data_class=p_data_class for update;
  if not found or not v_policy.enabled or v_policy.retention_days is null
    or v_policy.disposition='review' or v_policy.decision_reference <> trim(p_decision_reference) then
    raise exception using message = 'Política de retenção não aprovada para execução.', errcode = 'P0001';
  end if;
  v_cutoff := now() - make_interval(days => v_policy.retention_days);

  if p_data_class='conversion_events' then
    select count(*) into v_candidates from public.conversion_events e
      where e.created_at < v_cutoff and not public.is_under_legal_hold(p_data_class,e.id::text);
    if not p_dry_run then
      if v_policy.disposition='delete' then delete from public.conversion_events e where e.created_at < v_cutoff and not public.is_under_legal_hold(p_data_class,e.id::text);
      else update public.conversion_events e set user_id=null,payload='{}'::jsonb where e.created_at < v_cutoff and not public.is_under_legal_hold(p_data_class,e.id::text); end if;
      get diagnostics v_affected = row_count;
    end if;
  elsif p_data_class='idempotency_keys' then
    select count(*) into v_candidates from public.idempotency_keys k where k.expires_at < v_cutoff;
    if not p_dry_run then delete from public.idempotency_keys k where k.expires_at < v_cutoff; get diagnostics v_affected = row_count; end if;
  else
    select count(*) into v_candidates from public.transactional_email_outbox o
      where o.created_at < v_cutoff and o.status in ('delivered','dead') and not public.is_under_legal_hold(p_data_class,o.id::text);
    if not p_dry_run then
      if v_policy.disposition='delete' then delete from public.transactional_email_outbox o where o.created_at < v_cutoff and o.status in ('delivered','dead') and not public.is_under_legal_hold(p_data_class,o.id::text);
      else update public.transactional_email_outbox o set recipient_address=null,payload='{}'::jsonb where o.created_at < v_cutoff and o.status in ('delivered','dead') and not public.is_under_legal_hold(p_data_class,o.id::text); end if;
      get diagnostics v_affected = row_count;
    end if;
  end if;

  insert into public.audit_logs(actor_type,actor_ref,action,entity_type,entity_id,metadata)
  values ('system',left(trim(p_actor_ref),160),case when p_dry_run then 'retention.preview' else 'retention.execute' end,
    'data_retention_policy',p_data_class,jsonb_build_object('decisionReference',trim(p_decision_reference),'disposition',v_policy.disposition,'cutoff',v_cutoff,'candidates',v_candidates,'affected',v_affected));
  return jsonb_build_object('ok',true,'dryRun',p_dry_run,'dataClass',p_data_class,'disposition',v_policy.disposition,'cutoff',v_cutoff,'candidates',v_candidates,'affected',v_affected);
end;
$$;

revoke all on function public.execute_data_retention(text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.execute_data_retention(text,boolean,text,text) to service_role;

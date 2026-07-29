-- Arandu — transações, idempotência, RLS, RBAC e auditoria
-- Aplicar depois de docs/supabase-commercial.sql e docs/supabase-sprint6-12-platform.sql.
-- Migration aditiva e forward-only. O rollback operacional está em
-- docs/rollback/supabase-transactions-rbac-audit.rollback.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Snapshots comerciais e identidade da operação
-- ---------------------------------------------------------------------------

alter table public.reservations
  add column if not exists price_snapshot numeric,
  add column if not exists currency text,
  add column if not exists policy_version text,
  add column if not exists visitor_ref text,
  add column if not exists request_id text,
  add column if not exists origin text,
  add column if not exists expired_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists converted_at timestamptz;

alter table public.proposals
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists currency text,
  add column if not exists policy_version text,
  add column if not exists subtotal numeric,
  add column if not exists platform_fee_rate numeric,
  add column if not exists platform_fee numeric,
  add column if not exists artist_amount numeric,
  add column if not exists request_id text;

alter table public.proposal_items
  add column if not exists currency text,
  add column if not exists platform_fee numeric,
  add column if not exists artist_amount numeric;

alter table public.commercial_records
  add column if not exists currency text,
  add column if not exists policy_version text,
  add column if not exists request_id text;

alter table public.commercial_items
  add column if not exists currency text;

create index if not exists idx_proposals_user_created
  on public.proposals(user_id, created_at desc);

create unique index if not exists uq_proposal_items_artwork
  on public.proposal_items(proposal_id, artwork_id)
  where artwork_id is not null;

do $$
begin
  if exists (
    select 1
    from public.reservations
    where status in ('requested', 'confirmed')
    group by artwork_id
    having count(*) > 1
  ) then
    raise exception using
      message = 'Existem reservas ativas duplicadas. Resolva-as antes de aplicar a constraint uq_reservations_one_active_artwork.',
      errcode = '23505';
  end if;
end;
$$;

create unique index if not exists uq_reservations_one_active_artwork
  on public.reservations(artwork_id)
  where status in ('requested', 'confirmed');

-- ---------------------------------------------------------------------------
-- 2. Idempotência atômica e vinculada à identidade
-- ---------------------------------------------------------------------------

alter table public.idempotency_keys
  add column if not exists identity_hash text,
  add column if not exists status text,
  add column if not exists locked_until timestamptz,
  add column if not exists error_code text,
  add column if not exists failed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.idempotency_keys
set
  identity_hash = coalesce(identity_hash, 'legacy'),
  status = coalesce(status, case when response_status is not null then 'completed' else 'processing' end),
  locked_until = coalesce(locked_until, created_at + interval '5 minutes')
where identity_hash is null or status is null or locked_until is null;

alter table public.idempotency_keys
  alter column identity_hash set not null,
  alter column status set not null,
  alter column locked_until set default (now() + interval '2 minutes');

alter table public.idempotency_keys
  drop constraint if exists idempotency_keys_status_check;

alter table public.idempotency_keys
  add constraint idempotency_keys_status_check
  check (status in ('processing', 'completed', 'failed'));

create index if not exists idx_idempotency_expiry
  on public.idempotency_keys(expires_at);

create or replace function public.acquire_idempotency(
  p_scope text,
  p_key_hash text,
  p_identity_hash text,
  p_request_hash text,
  p_lock_seconds integer default 120,
  p_ttl_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.idempotency_keys%rowtype;
  v_inserted integer;
begin
  if coalesce(length(p_scope), 0) < 3
    or coalesce(length(p_key_hash), 0) <> 64
    or coalesce(length(p_identity_hash), 0) <> 64
    or coalesce(length(p_request_hash), 0) <> 64 then
    raise exception using message = 'Parâmetros de idempotência inválidos.', errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key_hash, 0));

  insert into public.idempotency_keys (
    scope, key_hash, identity_hash, request_hash, status, locked_until, expires_at
  )
  values (
    p_scope,
    p_key_hash,
    p_identity_hash,
    p_request_hash,
    'processing',
    now() + make_interval(secs => greatest(30, least(p_lock_seconds, 900))),
    now() + make_interval(secs => greatest(300, least(p_ttl_seconds, 604800)))
  )
  on conflict (scope, key_hash) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_row
  from public.idempotency_keys
  where scope = p_scope and key_hash = p_key_hash
  for update;

  if v_inserted = 1 then
    return jsonb_build_object('outcome', 'acquired');
  end if;
  if v_row.identity_hash <> p_identity_hash then
    return jsonb_build_object('outcome', 'identity_conflict');
  end if;
  if v_row.request_hash <> p_request_hash then
    return jsonb_build_object('outcome', 'payload_conflict');
  end if;
  if v_row.status = 'completed' and v_row.expires_at > now() then
    return jsonb_build_object(
      'outcome', 'replay',
      'response_status', v_row.response_status,
      'response_body', v_row.response_body
    );
  end if;
  if v_row.status = 'processing' and v_row.locked_until > now() and v_row.expires_at > now() then
    return jsonb_build_object('outcome', 'in_progress');
  end if;

  update public.idempotency_keys
  set
    status = 'processing',
    locked_until = now() + make_interval(secs => greatest(30, least(p_lock_seconds, 900))),
    expires_at = now() + make_interval(secs => greatest(300, least(p_ttl_seconds, 604800))),
    response_status = null,
    response_body = null,
    error_code = null,
    failed_at = null,
    updated_at = now()
  where scope = p_scope and key_hash = p_key_hash;
  return jsonb_build_object('outcome', 'acquired');
end;
$$;

create or replace function public.complete_idempotency(
  p_scope text,
  p_key_hash text,
  p_identity_hash text,
  p_request_hash text,
  p_response_status integer,
  p_response_body jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.idempotency_keys
  set
    status = 'completed',
    response_status = p_response_status,
    response_body = coalesce(p_response_body, '{}'::jsonb),
    locked_until = null,
    error_code = null,
    failed_at = null,
    updated_at = now()
  where scope = p_scope
    and key_hash = p_key_hash
    and identity_hash = p_identity_hash
    and request_hash = p_request_hash
    and status = 'processing';
  return found;
end;
$$;

create or replace function public.fail_idempotency(
  p_scope text,
  p_key_hash text,
  p_identity_hash text,
  p_request_hash text,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.idempotency_keys
  set
    status = 'failed',
    error_code = left(coalesce(p_error_code, 'operation_failed'), 120),
    failed_at = now(),
    locked_until = null,
    updated_at = now()
  where scope = p_scope
    and key_hash = p_key_hash
    and identity_hash = p_identity_hash
    and request_hash = p_request_hash
    and status = 'processing';
  return found;
end;
$$;

create or replace function public.cleanup_idempotency(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.idempotency_keys
  where expires_at <= now();
  if not p_dry_run then
    delete from public.idempotency_keys where expires_at <= now();
  end if;
  return jsonb_build_object('dry_run', p_dry_run, 'matched', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Auditoria transacional sem replicar PII
-- ---------------------------------------------------------------------------

create or replace function public.arandu_safe_audit_state(p_row jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(p_row, '{}'::jsonb)
    - array[
      'payload', 'email', 'issued_email', 'name', 'client', 'issued_to',
      'whatsapp', 'phone', 'message', 'notes', 'note', 'address',
      'full_name', 'legal_name', 'portfolio_url', 'instagram', 'briefing',
      'items', 'details'
    ]::text[];
$$;

create or replace function public.audit_privileged_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_before jsonb;
  v_after jsonb;
  v_actor_type text;
  v_actor_ref text;
  v_role text;
  v_request_id text;
  v_entity_id text;
begin
  if current_setting('arandu.audit.skip', true) = 'true' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_before := case when tg_op in ('UPDATE', 'DELETE') then public.arandu_safe_audit_state(to_jsonb(old)) else null end;
  v_after := case when tg_op in ('INSERT', 'UPDATE') then public.arandu_safe_audit_state(to_jsonb(new)) else null end;
  v_actor_type := lower(coalesce(v_headers->>'arandu-actor-type', 'system'));
  if v_actor_type not in ('user', 'admin', 'system') then v_actor_type := 'system'; end if;
  v_actor_ref := nullif(left(coalesce(v_headers->>'arandu-actor-id', ''), 160), '');
  v_role := nullif(left(coalesce(v_headers->>'arandu-actor-role', ''), 40), '');
  v_request_id := nullif(left(coalesce(v_headers->>'arandu-request-id', ''), 80), '');
  v_entity_id := coalesce(v_after->>'id', v_before->>'id');

  insert into public.audit_logs (
    actor_type, actor_ref, action, entity_type, entity_id, metadata
  )
  values (
    v_actor_type,
    v_actor_ref,
    lower(tg_op) || '.' || tg_table_name,
    tg_table_name,
    v_entity_id,
    jsonb_strip_nulls(jsonb_build_object(
      'role', v_role,
      'requestId', v_request_id,
      'justification', nullif(left(coalesce(v_headers->>'arandu-justification', ''), 500), ''),
      'before', v_before,
      'after', v_after
    ))
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'artists', 'artworks', 'certificates', 'leads', 'artist_submissions',
    'company_briefs', 'saved_selections', 'reservations', 'proposals',
    'proposal_items', 'crm_notes', 'tasks', 'media_assets',
    'commercial_records', 'commercial_items', 'privacy_requests'
  ]
  loop
    execute format('drop trigger if exists trg_arandu_audit on public.%I', v_table);
    execute format(
      'create trigger trg_arandu_audit after insert or update or delete on public.%I for each row execute function public.audit_privileged_mutation()',
      v_table
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reservas atômicas e expiração idempotente
-- ---------------------------------------------------------------------------

create or replace function public.create_reservation_atomic(
  p_artwork_id text,
  p_user_id uuid,
  p_visitor_ref text,
  p_name text,
  p_whatsapp text,
  p_deadline text,
  p_notes text,
  p_expires_at timestamptz,
  p_currency text,
  p_policy_version text,
  p_origin text,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key_hash text,
  p_identity_hash text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artwork public.artworks%rowtype;
  v_reservation public.reservations%rowtype;
  v_response jsonb;
begin
  if p_actor_type = 'user'
    and (p_user_id is null or p_actor_ref is distinct from p_user_id::text) then
    raise exception using message = 'Identidade da reserva inválida.', errcode = '42501';
  end if;
  if p_actor_type <> 'user'
    and p_user_id is null
    and coalesce(length(trim(p_visitor_ref)), 0) < 8 then
    raise exception using message = 'Origem visitante da reserva inválida.', errcode = '22023';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception using message = 'Prazo de reserva inválido.', errcode = '22023';
  end if;
  if p_currency !~ '^[A-Z]{3}$' or coalesce(length(trim(p_policy_version)), 0) < 1 then
    raise exception using message = 'Moeda ou versão da política inválida.', errcode = '22023';
  end if;

  select * into v_artwork
  from public.artworks
  where id = p_artwork_id
  for update;

  if not found then
    raise exception using message = 'Obra não encontrada.', errcode = 'P0002';
  end if;
  if v_artwork.published is not true or v_artwork.status <> 'available' or coalesce(v_artwork.price, 0) <= 0 then
    raise exception using message = 'Obra indisponível para reserva.', errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.reservations
    where artwork_id = p_artwork_id and status in ('requested', 'confirmed')
  ) then
    raise exception using message = 'A obra já possui reserva ativa.', errcode = '23505';
  end if;

  perform set_config('arandu.audit.skip', 'true', true);
  insert into public.reservations (
    user_id, artwork_id, name, whatsapp, deadline, notes, status, expires_at,
    price_snapshot, currency, policy_version, visitor_ref, request_id, origin, payload
  )
  values (
    p_user_id, p_artwork_id, left(p_name, 160), left(p_whatsapp, 15),
    left(p_deadline, 160), left(p_notes, 3000), 'requested', p_expires_at,
    v_artwork.price, p_currency, p_policy_version, left(p_visitor_ref, 160),
    left(p_request_id, 80), left(p_origin, 120), '{}'::jsonb
  )
  returning * into v_reservation;

  update public.artworks
  set status = 'reserved', updated_at = now()
  where id = p_artwork_id;

  insert into public.audit_logs (
    actor_type, actor_ref, action, entity_type, entity_id, metadata
  )
  values (
    case when p_actor_type in ('user', 'admin', 'system') then p_actor_type else 'system' end,
    left(p_actor_ref, 160),
    'reservation.create',
    'reservations',
    v_reservation.id::text,
    jsonb_build_object(
      'role', case when p_actor_type = 'admin' then 'operator' else null end,
      'requestId', left(p_request_id, 80),
      'artworkId', p_artwork_id,
      'fromStatus', v_artwork.status,
      'toStatus', 'reserved',
      'priceSnapshot', v_artwork.price,
      'currency', p_currency,
      'policyVersion', p_policy_version,
      'expiresAt', p_expires_at
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'mode', 'stored',
    'stored', true,
    'reservation', jsonb_build_object(
      'id', v_reservation.id,
      'artwork_id', v_reservation.artwork_id,
      'status', v_reservation.status,
      'deadline', v_reservation.deadline,
      'expires_at', v_reservation.expires_at,
      'created_at', v_reservation.created_at,
      'updated_at', v_reservation.updated_at
    )
  );

  if not public.complete_idempotency(
    p_idempotency_scope, p_idempotency_key_hash, p_identity_hash,
    p_request_hash, 201, v_response
  ) then
    raise exception using message = 'A chave de idempotência não está adquirida.', errcode = 'P0001';
  end if;
  return v_response;
end;
$$;

create or replace function public.expire_reservations(
  p_dry_run boolean default true,
  p_actor_ref text default 'system',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reservations%rowtype;
  v_count integer := 0;
begin
  if p_dry_run then
    select count(*) into v_count
    from public.reservations
    where status in ('requested', 'confirmed') and expires_at <= now();
    return jsonb_build_object('dry_run', true, 'matched', v_count, 'expired', 0);
  end if;

  perform set_config('arandu.audit.skip', 'true', true);
  for v_row in
    select * from public.reservations
    where status in ('requested', 'confirmed') and expires_at <= now()
    order by expires_at
    for update skip locked
  loop
    update public.reservations
    set status = 'expired', expired_at = now(), updated_at = now()
    where id = v_row.id;
    update public.artworks
    set status = 'available', updated_at = now()
    where id = v_row.artwork_id
      and status = 'reserved'
      and not exists (
        select 1 from public.reservations other
        where other.artwork_id = v_row.artwork_id
          and other.id <> v_row.id
          and other.status in ('requested', 'confirmed')
      );
    insert into public.audit_logs (
      actor_type, actor_ref, action, entity_type, entity_id, metadata
    )
    values (
      'system', left(p_actor_ref, 160), 'reservation.expire', 'reservations',
      v_row.id::text,
      jsonb_build_object(
        'requestId', left(p_request_id, 80),
        'artworkId', v_row.artwork_id,
        'fromStatus', v_row.status,
        'toStatus', 'expired'
      )
    );
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('dry_run', false, 'matched', v_count, 'expired', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Propostas e registros comerciais transacionais
-- ---------------------------------------------------------------------------

create or replace function public.create_proposal_atomic(
  p_artwork_ids text[],
  p_user_id uuid,
  p_lead_id uuid,
  p_company_brief_id uuid,
  p_client text,
  p_space text,
  p_goal text,
  p_budget text,
  p_deadline text,
  p_notes text,
  p_currency text,
  p_platform_fee_rate numeric,
  p_policy_version text,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key_hash text,
  p_identity_hash text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
  v_artwork record;
  v_expected integer;
  v_available integer;
  v_subtotal numeric;
  v_fee numeric;
  v_artist_amount numeric;
  v_response jsonb;
begin
  if p_actor_type = 'user'
    and (p_user_id is null or p_actor_ref is distinct from p_user_id::text) then
    raise exception using message = 'Identidade da proposta inválida.', errcode = '42501';
  end if;
  if p_lead_id is not null and not exists (
    select 1 from public.leads
    where id = p_lead_id
      and (p_actor_type = 'admin' or user_id = p_user_id)
  ) then
    raise exception using message = 'Lead da proposta inválido.', errcode = '42501';
  end if;
  if p_company_brief_id is not null and not exists (
    select 1 from public.company_briefs
    where id = p_company_brief_id
      and (p_actor_type = 'admin' or user_id = p_user_id)
  ) then
    raise exception using message = 'Briefing da proposta inválido.', errcode = '42501';
  end if;
  v_expected := coalesce(array_length(p_artwork_ids, 1), 0);
  if v_expected < 1 or v_expected > 40 then
    raise exception using message = 'A proposta precisa conter entre 1 e 40 obras.', errcode = '22023';
  end if;
  if (select count(distinct item) from unnest(p_artwork_ids) item) <> v_expected then
    raise exception using message = 'A proposta contém obras duplicadas.', errcode = '22023';
  end if;
  if p_currency !~ '^[A-Z]{3}$'
    or p_platform_fee_rate < 0
    or p_platform_fee_rate >= 1
    or coalesce(length(trim(p_policy_version)), 0) < 1 then
    raise exception using message = 'Política comercial inválida.', errcode = '22023';
  end if;

  perform 1
  from public.artworks
  where id = any(p_artwork_ids)
  order by id
  for update;

  select count(*), coalesce(sum(price), 0)
  into v_available, v_subtotal
  from public.artworks
  where id = any(p_artwork_ids)
    and published = true
    and status in ('available', 'in_conversation')
    and coalesce(price, 0) > 0;

  if v_available <> v_expected then
    raise exception using message = 'Uma ou mais obras não existem ou estão indisponíveis.', errcode = 'P0001';
  end if;

  v_fee := round(v_subtotal * p_platform_fee_rate, 2);
  v_artist_amount := v_subtotal - v_fee;
  perform set_config('arandu.audit.skip', 'true', true);

  insert into public.proposals (
    user_id, lead_id, company_brief_id, client, space, goal, budget, deadline,
    notes, total, status, payload, currency, policy_version, subtotal,
    platform_fee_rate, platform_fee, artist_amount, request_id
  )
  values (
    p_user_id, p_lead_id, p_company_brief_id, left(p_client, 240),
    left(p_space, 500), left(p_goal, 1000), left(p_budget, 160),
    left(p_deadline, 160), left(p_notes, 3000), v_subtotal, 'draft',
    '{}'::jsonb, p_currency, p_policy_version, v_subtotal,
    p_platform_fee_rate, v_fee, v_artist_amount, left(p_request_id, 80)
  )
  returning * into v_proposal;

  for v_artwork in
    select id, price
    from public.artworks
    where id = any(p_artwork_ids)
    order by array_position(p_artwork_ids, id)
  loop
    insert into public.proposal_items (
      proposal_id, artwork_id, position, price, note, currency,
      platform_fee, artist_amount
    )
    values (
      v_proposal.id,
      v_artwork.id,
      array_position(p_artwork_ids, v_artwork.id),
      v_artwork.price,
      null,
      p_currency,
      round(v_artwork.price * p_platform_fee_rate, 2),
      v_artwork.price - round(v_artwork.price * p_platform_fee_rate, 2)
    );
  end loop;

  insert into public.audit_logs (
    actor_type, actor_ref, action, entity_type, entity_id, metadata
  )
  values (
    case when p_actor_type in ('user', 'admin', 'system') then p_actor_type else 'system' end,
    left(p_actor_ref, 160),
    'proposal.create',
    'proposals',
    v_proposal.id::text,
    jsonb_build_object(
      'requestId', left(p_request_id, 80),
      'artworkIds', p_artwork_ids,
      'subtotal', v_subtotal,
      'platformFee', v_fee,
      'artistAmount', v_artist_amount,
      'currency', p_currency,
      'policyVersion', p_policy_version
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'mode', 'stored',
    'stored', true,
    'proposal', jsonb_build_object(
      'id', v_proposal.id,
      'proposal_number', v_proposal.proposal_number,
      'status', v_proposal.status,
      'total', v_proposal.total,
      'currency', v_proposal.currency,
      'created_at', v_proposal.created_at
    )
  );

  if not public.complete_idempotency(
    p_idempotency_scope, p_idempotency_key_hash, p_identity_hash,
    p_request_hash, 201, v_response
  ) then
    raise exception using message = 'A chave de idempotência não está adquirida.', errcode = 'P0001';
  end if;
  return v_response;
end;
$$;

create or replace function public.create_commercial_record_atomic(
  p_artwork_ids text[],
  p_proposal_id uuid,
  p_reservation_id uuid,
  p_lead_id uuid,
  p_client text,
  p_email text,
  p_whatsapp text,
  p_currency text,
  p_platform_fee_rate numeric,
  p_policy_version text,
  p_notes text,
  p_actor_ref text,
  p_actor_role text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key_hash text,
  p_identity_hash text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.commercial_records%rowtype;
  v_artwork record;
  v_expected integer;
  v_found integer;
  v_total numeric;
  v_fee numeric;
  v_response jsonb;
begin
  if p_actor_role not in ('admin', 'operator') then
    raise exception using message = 'Papel sem permissão comercial.', errcode = '42501';
  end if;
  v_expected := coalesce(array_length(p_artwork_ids, 1), 0);
  if v_expected < 1 or v_expected > 40
    or (select count(distinct item) from unnest(p_artwork_ids) item) <> v_expected then
    raise exception using message = 'Itens comerciais inválidos.', errcode = '22023';
  end if;
  if p_currency !~ '^[A-Z]{3}$'
    or p_platform_fee_rate < 0
    or p_platform_fee_rate >= 1
    or coalesce(length(trim(p_policy_version)), 0) < 1 then
    raise exception using message = 'Política comercial inválida.', errcode = '22023';
  end if;

  perform 1 from public.artworks where id = any(p_artwork_ids) order by id for update;
  select count(*), coalesce(sum(price), 0)
  into v_found, v_total
  from public.artworks
  where id = any(p_artwork_ids) and coalesce(price, 0) > 0;
  if v_found <> v_expected then
    raise exception using message = 'Uma ou mais obras comerciais são inválidas.', errcode = 'P0001';
  end if;

  v_fee := round(v_total * p_platform_fee_rate, 2);
  perform set_config('arandu.audit.skip', 'true', true);
  insert into public.commercial_records (
    proposal_id, reservation_id, lead_id, client, email, whatsapp, total,
    platform_fee_rate, platform_fee, artist_amount, status, logistics_status,
    notes, payload, currency, policy_version, request_id
  )
  values (
    p_proposal_id, p_reservation_id, p_lead_id, left(p_client, 240),
    left(p_email, 254), left(p_whatsapp, 15), v_total,
    p_platform_fee_rate, v_fee, v_total - v_fee, 'draft', 'pending',
    left(p_notes, 3000), '{}'::jsonb, p_currency, p_policy_version,
    left(p_request_id, 80)
  )
  returning * into v_record;

  for v_artwork in
    select id, artist_id, price
    from public.artworks
    where id = any(p_artwork_ids)
    order by array_position(p_artwork_ids, id)
  loop
    insert into public.commercial_items (
      commercial_record_id, artwork_id, artist_id, position, price,
      platform_fee, artist_amount, note, currency
    )
    values (
      v_record.id, v_artwork.id, v_artwork.artist_id,
      array_position(p_artwork_ids, v_artwork.id), v_artwork.price,
      round(v_artwork.price * p_platform_fee_rate, 2),
      v_artwork.price - round(v_artwork.price * p_platform_fee_rate, 2),
      null, p_currency
    );
  end loop;

  insert into public.audit_logs (
    actor_type, actor_ref, action, entity_type, entity_id, metadata
  )
  values (
    'admin', left(p_actor_ref, 160), 'commercial.create', 'commercial_records',
    v_record.id::text,
    jsonb_build_object(
      'role', p_actor_role,
      'requestId', left(p_request_id, 80),
      'artworkIds', p_artwork_ids,
      'total', v_total,
      'platformFee', v_fee,
      'artistAmount', v_total - v_fee,
      'currency', p_currency,
      'policyVersion', p_policy_version
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'mode', 'stored',
    'stored', true,
    'record', jsonb_build_object(
      'id', v_record.id,
      'commercial_number', v_record.commercial_number,
      'status', v_record.status,
      'total', v_record.total,
      'currency', v_record.currency,
      'created_at', v_record.created_at
    )
  );
  if not public.complete_idempotency(
    p_idempotency_scope, p_idempotency_key_hash, p_identity_hash,
    p_request_hash, 201, v_response
  ) then
    raise exception using message = 'A chave de idempotência não está adquirida.', errcode = 'P0001';
  end if;
  return v_response;
end;
$$;

create or replace function public.apply_catalog_review_atomic(
  p_entity_type text,
  p_entity_id text,
  p_next_status text,
  p_checklist jsonb,
  p_note text,
  p_actor_ref text,
  p_actor_role text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_status text;
  v_allowed boolean := false;
  v_reviewed_at timestamptz := now();
begin
  if p_actor_role not in ('admin', 'curator') then
    raise exception using message = 'Papel sem permissão editorial.', errcode = '42501';
  end if;
  if p_entity_type not in ('artist', 'artwork')
    or coalesce(length(trim(p_entity_id)), 0) < 1
    or p_next_status not in (
      'draft', 'documentation_pending', 'curatorial_review', 'approved',
      'published', 'rejected', 'archived'
    ) then
    raise exception using message = 'Revisão editorial inválida.', errcode = '22023';
  end if;

  if p_entity_type = 'artist' then
    select editorial_status into v_previous_status
    from public.artists
    where id = p_entity_id
    for update;
  else
    select editorial_status into v_previous_status
    from public.artworks
    where id = p_entity_id
    for update;
  end if;
  if not found then
    raise exception using message = 'Entidade editorial não encontrada.', errcode = 'P0002';
  end if;
  v_previous_status := coalesce(v_previous_status, 'draft');

  v_allowed := case v_previous_status
    when 'draft' then p_next_status = any(array['documentation_pending', 'curatorial_review', 'archived'])
    when 'documentation_pending' then p_next_status = any(array['draft', 'curatorial_review', 'rejected', 'archived'])
    when 'curatorial_review' then p_next_status = any(array['documentation_pending', 'approved', 'rejected', 'archived'])
    when 'approved' then p_next_status = any(array['curatorial_review', 'published', 'archived'])
    when 'published' then p_next_status = any(array['approved', 'archived'])
    when 'rejected' then p_next_status = any(array['draft', 'documentation_pending', 'archived'])
    when 'archived' then p_next_status = 'draft'
    else false
  end;
  if not v_allowed then
    raise exception using
      message = format('Transição editorial inválida: %s → %s.', v_previous_status, p_next_status),
      errcode = 'P0001';
  end if;
  if p_next_status in ('approved', 'published') and (
    (p_entity_type = 'artist' and not coalesce(p_checklist, '{}'::jsonb) @> jsonb_build_object(
      'identity', true,
      'origin', true,
      'publicationConsent', true,
      'portfolio', true,
      'profile', true
    ))
    or
    (p_entity_type = 'artwork' and not coalesce(p_checklist, '{}'::jsonb) @> jsonb_build_object(
      'artistApproved', true,
      'imageAuthorization', true,
      'provenance', true,
      'price', true,
      'availability', true,
      'technicalSheet', true
    ))
  ) then
    raise exception using message = 'Checklist editorial incompleto.', errcode = 'P0001';
  end if;

  perform set_config('arandu.audit.skip', 'true', true);
  if p_entity_type = 'artist' then
    update public.artists
    set
      editorial_status = p_next_status,
      editorial_checklist = coalesce(p_checklist, '{}'::jsonb),
      reviewed_by = left(p_actor_ref, 160),
      reviewed_at = v_reviewed_at,
      updated_at = v_reviewed_at
    where id = p_entity_id;
  else
    update public.artworks
    set
      editorial_status = p_next_status,
      editorial_checklist = coalesce(p_checklist, '{}'::jsonb),
      reviewed_by = left(p_actor_ref, 160),
      reviewed_at = v_reviewed_at,
      updated_at = v_reviewed_at
    where id = p_entity_id;
  end if;

  insert into public.catalog_review_history (
    entity_type, entity_id, from_status, to_status, checklist, note, actor_ref
  )
  values (
    p_entity_type, p_entity_id, v_previous_status, p_next_status,
    coalesce(p_checklist, '{}'::jsonb), left(p_note, 1000), left(p_actor_ref, 160)
  );

  insert into public.audit_logs (
    actor_type, actor_ref, action, entity_type, entity_id, metadata
  )
  values (
    'admin', left(p_actor_ref, 160), 'catalog.review', p_entity_type,
    p_entity_id,
    jsonb_strip_nulls(jsonb_build_object(
      'role', p_actor_role,
      'requestId', left(p_request_id, 80),
      'justification', nullif(left(coalesce(p_note, ''), 500), ''),
      'before', jsonb_build_object('editorial_status', v_previous_status),
      'after', jsonb_build_object(
        'editorial_status', p_next_status,
        'editorial_checklist', coalesce(p_checklist, '{}'::jsonb),
        'reviewed_by', left(p_actor_ref, 160),
        'reviewed_at', v_reviewed_at
      )
    ))
  );

  return jsonb_build_object(
    'ok', true,
    'record', jsonb_build_object(
      'id', p_entity_id,
      'entity_type', p_entity_type,
      'editorial_status', p_next_status,
      'editorial_checklist', coalesce(p_checklist, '{}'::jsonb),
      'reviewed_by', left(p_actor_ref, 160),
      'reviewed_at', v_reviewed_at
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS e fechamento de escritas diretas
-- ---------------------------------------------------------------------------

alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.commercial_records enable row level security;
alter table public.commercial_items enable row level security;
alter table public.consignments enable row level security;
alter table public.logistics_records enable row level security;

drop policy if exists leads_public_insert on public.leads;
drop policy if exists artist_submissions_public_insert on public.artist_submissions;
drop policy if exists company_briefs_public_insert on public.company_briefs;
drop policy if exists selections_public_insert on public.saved_selections;
drop policy if exists reservations_public_insert on public.reservations;
drop policy if exists newsletter_public_insert on public.newsletter_subscriptions;

drop policy if exists proposals_select_own on public.proposals;
create policy proposals_select_own on public.proposals
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists proposal_items_select_own on public.proposal_items;
create policy proposal_items_select_own on public.proposal_items
  for select to authenticated
  using (
    exists (
      select 1 from public.proposals proposal
      where proposal.id = proposal_items.proposal_id
        and proposal.user_id = auth.uid()
    )
  );

drop policy if exists privacy_requests_select_own on public.privacy_requests;
create policy privacy_requests_select_own on public.privacy_requests
  for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.leads from anon, authenticated;
revoke insert, update, delete on public.artist_submissions from anon, authenticated;
revoke insert, update, delete on public.company_briefs from anon, authenticated;
revoke insert, update, delete on public.saved_selections from anon, authenticated;
revoke insert, update, delete on public.reservations from anon, authenticated;
revoke insert, update, delete on public.newsletter_subscriptions from anon, authenticated;
revoke insert, update, delete on public.proposals from anon, authenticated;
revoke insert, update, delete on public.proposal_items from anon, authenticated;
revoke all on public.commercial_records from anon, authenticated;
revoke all on public.commercial_items from anon, authenticated;
revoke all on public.consignments from anon, authenticated;
revoke all on public.logistics_records from anon, authenticated;
revoke all on public.media_assets from anon, authenticated;
revoke all on public.crm_notes from anon, authenticated;
revoke all on public.tasks from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.leads to authenticated;
grant select on public.company_briefs to authenticated;
grant select on public.saved_selections to authenticated;
grant select on public.reservations to authenticated;
grant select on public.proposals to authenticated;
grant select on public.proposal_items to authenticated;
grant select on public.privacy_requests to authenticated;

revoke all on function public.acquire_idempotency(text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_idempotency(text, text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fail_idempotency(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cleanup_idempotency(boolean) from public, anon, authenticated;
revoke all on function public.create_reservation_atomic(text, uuid, text, text, text, text, text, timestamptz, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.expire_reservations(boolean, text, text) from public, anon, authenticated;
revoke all on function public.create_proposal_atomic(text[], uuid, uuid, uuid, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_commercial_record_atomic(text[], uuid, uuid, uuid, text, text, text, text, numeric, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_catalog_review_atomic(text, text, text, jsonb, text, text, text, text) from public, anon, authenticated;

grant execute on function public.acquire_idempotency(text, text, text, text, integer, integer) to service_role;
grant execute on function public.complete_idempotency(text, text, text, text, integer, jsonb) to service_role;
grant execute on function public.fail_idempotency(text, text, text, text, text) to service_role;
grant execute on function public.cleanup_idempotency(boolean) to service_role;
grant execute on function public.create_reservation_atomic(text, uuid, text, text, text, text, text, timestamptz, text, text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.expire_reservations(boolean, text, text) to service_role;
grant execute on function public.create_proposal_atomic(text[], uuid, uuid, uuid, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.create_commercial_record_atomic(text[], uuid, uuid, uuid, text, text, text, text, numeric, text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.apply_catalog_review_atomic(text, text, text, jsonb, text, text, text, text) to service_role;

comment on index public.uq_reservations_one_active_artwork is
  'Impede mais de uma reserva requested/confirmed por obra, inclusive sob concorrência.';
comment on function public.acquire_idempotency(text, text, text, text, integer, integer) is
  'Adquire chave atomicamente e a vincula a identidade e payload canônico.';
comment on function public.create_reservation_atomic(text, uuid, text, text, text, text, text, timestamptz, text, text, text, text, text, text, text, text, text, text) is
  'Reserva obra, altera disponibilidade, audita e conclui idempotência em uma transação.';
comment on function public.create_proposal_atomic(text[], uuid, uuid, uuid, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text, text, text) is
  'Calcula preços no banco e cria proposta e itens em uma única transação.';
comment on function public.apply_catalog_review_atomic(text, text, text, jsonb, text, text, text, text) is
  'Atualiza entidade, histórico editorial e auditoria na mesma transação.';

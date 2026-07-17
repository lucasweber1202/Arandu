-- Arandu — Sprints 6 a 12: hardening, workflow editorial, LGPD e conversão.
-- Aplicar depois de docs/supabase-sprint5-pilot.sql.

create table if not exists public.api_rate_limits (
  scope text not null,
  fingerprint text not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (scope, fingerprint, window_start)
);

create or replace function public.consume_rate_limit(p_scope text, p_fingerprint text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare bucket timestamptz; current_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then return false; end if;
  bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limits (scope, fingerprint, window_start, request_count, expires_at)
  values (left(p_scope, 80), left(p_fingerprint, 128), bucket, 1, bucket + make_interval(secs => p_window_seconds))
  on conflict (scope, fingerprint, window_start) do update set request_count = public.api_rate_limits.request_count + 1
  returning request_count into current_count;
  delete from public.api_rate_limits where expires_at < now() - interval '1 hour';
  return current_count <= p_limit;
end;
$$;

revoke all on public.api_rate_limits from anon, authenticated;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

alter table public.artists add column if not exists editorial_status text default 'draft'
  check (editorial_status in ('draft','documentation_pending','curatorial_review','approved','published','rejected','archived'));
alter table public.artists add column if not exists editorial_checklist jsonb default '{}'::jsonb;
alter table public.artists add column if not exists reviewed_by text;
alter table public.artists add column if not exists reviewed_at timestamptz;
alter table public.artworks add column if not exists editorial_status text default 'draft'
  check (editorial_status in ('draft','documentation_pending','curatorial_review','approved','published','rejected','archived'));
alter table public.artworks add column if not exists editorial_checklist jsonb default '{}'::jsonb;
alter table public.artworks add column if not exists reviewed_by text;
alter table public.artworks add column if not exists reviewed_at timestamptz;

create table if not exists public.catalog_review_history (
  id uuid primary key default gen_random_uuid(), entity_type text not null check (entity_type in ('artist','artwork')),
  entity_id text not null, from_status text, to_status text not null, checklist jsonb not null default '{}'::jsonb,
  note text, actor_ref text not null, created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_type text not null check (actor_type in ('user','admin','system')),
  actor_ref text, action text not null, entity_type text, entity_id text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('access','correction','deletion','portability')),
  status text not null default 'received' check (status in ('received','identity_verified','processing','completed','rejected','cancelled')),
  details jsonb not null default '{}'::jsonb, due_at timestamptz not null default (now() + interval '15 days'),
  completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.idempotency_keys (
  scope text not null, key_hash text not null, request_hash text not null, response_status integer, response_body jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'), created_at timestamptz not null default now(),
  primary key (scope, key_hash)
);
create table if not exists public.conversion_events (
  id uuid primary key default gen_random_uuid(), anonymous_id uuid, user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('search','catalog_view','artwork_view','selection_add','contact_start','reservation_start','reservation_complete')),
  path text not null, payload jsonb not null default '{}'::jsonb, consent_version text not null, created_at timestamptz not null default now()
);

alter table public.catalog_review_history enable row level security;
alter table public.audit_logs enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.conversion_events enable row level security;
revoke all on public.catalog_review_history from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;
revoke all on public.privacy_requests from anon, authenticated;
revoke all on public.idempotency_keys from anon, authenticated;
revoke all on public.conversion_events from anon, authenticated;

create index if not exists idx_catalog_review_entity on public.catalog_review_history(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_entity on public.audit_logs(entity_type, entity_id, created_at desc);
create index if not exists idx_privacy_user_status on public.privacy_requests(user_id, status, created_at desc);
create index if not exists idx_conversion_type_created on public.conversion_events(event_type, created_at desc);

create or replace view public.v_catalog_editorial_readiness as
select
  (select count(*) from public.artists) as artists_total,
  (select count(*) from public.artists where editorial_status in ('approved','published')) as artists_approved,
  (select count(*) from public.artists where editorial_status = 'documentation_pending') as artists_documentation_pending,
  (select count(*) from public.artworks) as artworks_total,
  (select count(*) from public.artworks where editorial_status in ('approved','published')) as artworks_approved,
  (select count(*) from public.artworks where editorial_status = 'documentation_pending') as artworks_documentation_pending;
revoke all on public.v_catalog_editorial_readiness from anon, authenticated;
grant select on public.v_catalog_editorial_readiness to service_role;

comment on function public.consume_rate_limit is 'Rate limit atômico compartilhado entre instâncias serverless.';
comment on table public.catalog_review_history is 'Trilha imutável das decisões editoriais de artistas e obras.';
comment on table public.privacy_requests is 'Solicitações LGPD autenticadas e acompanháveis.';

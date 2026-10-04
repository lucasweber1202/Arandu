-- Public API v1 & Webhooks foundation (guideline §31.1; addendum v2.1 F.1 e
-- H.1 item 9; IMPLEMENTATION_MATRIX P0.8).
-- Aditivo e idempotente. Rollback: docs/rollback/supabase-financial-public-api.rollback.sql
--
-- Modelo de autorização (docs/FINANCIAL_PUBLIC_API.md):
--   credencial (hash do token) AND organização AND entidade AND escopo AND
--   autorização do objeto — tudo conferido AQUI, dentro de cada função
--   fin_api_*. O servidor da API (service role, nunca o navegador) só repassa
--   o hash do token que recebeu; sem o token certo, nenhuma função devolve dado.
--   Ninguém além do service role executa fin_api_*; nenhuma tabela nova é
--   legível por `anon`, e as de credencial nem por `authenticated`.
--
--   * Token: gerado pelo servidor (256 bits), mostrado UMA vez; o banco guarda
--     só sha256 (hex) e um prefixo para identificação. Expira (≤ 365 dias) e é
--     revogável; último uso registrado (no máximo uma escrita por minuto).
--   * Escopo funcional (rfqs:read, ...) nunca substitui tenant/entidade.
--   * Idempotência: chave + impressão do pedido por conta de serviço; repetição
--     igual devolve o mesmo resultado, payload diferente falha.
--   * Webhooks: eventos mínimos (ids, tipo, estado, horário — nenhum termo
--     financeiro) gerados de fin_events; entregas com lease, retry exponencial,
--     dead-letter, replay manual e desativação automática por falhas seguidas.
--     O segredo HMAC é cifrado pela aplicação (AES-256-GCM) antes de chegar
--     aqui; o banco nunca vê o segredo em claro.

-- ------------------------------------------------- 1. contas de serviço
create or replace function public.fin_api_scope_catalog()
returns text[] language sql immutable set search_path = '' as $$
  select array['rfqs:read','rfqs:write','contracts:read','providers:read','portfolio:read','approvals:read','webhooks:manage']::text[];
$$;

create table if not exists public.fin_service_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  name text not null check (length(trim(name)) between 2 and 120 and name !~ '[<>]'),
  description text check (description is null or (length(description) <= 500 and description !~ '[<>]')),
  scopes text[] not null check (cardinality(scopes) between 1 and 7 and scopes <@ public.fin_api_scope_catalog()),
  entity_scope text not null default 'group' check (entity_scope in ('group','entities')),
  status text not null default 'active' check (status in ('active','disabled','revoked')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  last_used_at timestamptz,
  unique (organization_id, id),
  check ((status = 'revoked') = (revoked_at is not null))
);
create index if not exists fin_service_accounts_org on public.fin_service_accounts(organization_id, status);

create table if not exists public.fin_service_account_entities (
  organization_id uuid not null,
  service_account_id uuid not null,
  entity_id uuid not null,
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (service_account_id, entity_id),
  foreign key (organization_id, service_account_id) references public.fin_service_accounts(organization_id, id) on delete cascade,
  foreign key (organization_id, entity_id) references public.fin_legal_entities(organization_id, id)
);

create table if not exists public.fin_api_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_account_id uuid not null,
  token_prefix text not null check (token_prefix ~ '^arnd_[a-z]{2,10}_[A-Za-z0-9]{6}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  last_used_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, service_account_id) references public.fin_service_accounts(organization_id, id),
  check (expires_at > created_at and expires_at <= created_at + interval '366 days'),
  check ((revoked_at is null) = (revoked_by is null))
);
create index if not exists fin_api_credentials_account on public.fin_api_credentials(service_account_id, revoked_at);

create table if not exists public.fin_api_idempotency (
  service_account_id uuid not null references public.fin_service_accounts(id),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{8,200}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  operation text not null check (operation ~ '^[a-z_.:]{3,60}$'),
  status text not null default 'completed' check (status in ('completed')),
  response_status integer not null check (response_status between 200 and 599),
  response_body jsonb not null check (jsonb_typeof(response_body) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (service_account_id, idempotency_key)
);
create index if not exists fin_api_idempotency_expiry on public.fin_api_idempotency(expires_at);

-- ------------------------------------------------- 2. webhooks
create or replace function public.fin_webhook_event_catalog()
returns text[] language sql immutable set search_path = '' as $$
  select array['rfq.created','rfq.status_changed','proposal.submitted','decision.recorded','approval.required','approval.completed',
               'contract.created','contract.renewal_due']::text[];
$$;

create table if not exists public.fin_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  url text not null check (length(url) between 12 and 500 and url ~ '^https://[^/@:?#\s]+(:443)?(/[^\s]*)?$'),
  description text check (description is null or (length(description) <= 300 and description !~ '[<>]')),
  events text[] not null check (cardinality(events) between 1 and 8 and events <@ public.fin_webhook_event_catalog()),
  entity_ids uuid[],
  status text not null default 'active' check (status in ('active','disabled','disabled_failing')),
  secret_ciphertext text not null check (secret_ciphertext ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_by_user uuid references auth.users(id),
  created_by_service_account uuid references public.fin_service_accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text check (disabled_reason is null or disabled_reason in ('manual','consecutive_failures','service_account_revoked')),
  unique (organization_id, id),
  check ((created_by_user is null) <> (created_by_service_account is null)),
  check ((status = 'active') = (disabled_at is null))
);
create index if not exists fin_webhook_endpoints_active on public.fin_webhook_endpoints(organization_id) where status = 'active';

create table if not exists public.fin_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  legal_entity_id uuid,
  event_type text not null check (event_type = any(public.fin_webhook_event_catalog())),
  source_event_id uuid not null unique,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and length(payload::text) <= 4000),
  occurred_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index if not exists fin_webhook_events_org on public.fin_webhook_events(organization_id, occurred_at desc);

create table if not exists public.fin_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  endpoint_id uuid not null,
  event_id uuid not null,
  status text not null default 'pending' check (status in ('pending','delivering','succeeded','failed','dead','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 50),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_status_code integer check (last_status_code is null or last_status_code between 100 and 599),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,60}$'),
  delivered_at timestamptz,
  replay_of uuid references public.fin_webhook_deliveries(id),
  requested_by_user uuid references auth.users(id),
  requested_by_service_account uuid references public.fin_service_accounts(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, endpoint_id) references public.fin_webhook_endpoints(organization_id, id),
  foreign key (organization_id, event_id) references public.fin_webhook_events(organization_id, id),
  check ((status = 'delivering') = (lease_token is not null))
);
create unique index if not exists fin_webhook_deliveries_once on public.fin_webhook_deliveries(endpoint_id, event_id) where replay_of is null;
create index if not exists fin_webhook_deliveries_due on public.fin_webhook_deliveries(next_attempt_at) where status in ('pending','failed');
create index if not exists fin_webhook_deliveries_endpoint on public.fin_webhook_deliveries(endpoint_id, created_at desc);

-- ------------------------------------------------- 3. RLS e superfície
alter table public.fin_service_accounts enable row level security;
alter table public.fin_service_accounts force row level security;
alter table public.fin_service_account_entities enable row level security;
alter table public.fin_service_account_entities force row level security;
alter table public.fin_api_credentials enable row level security;
alter table public.fin_api_credentials force row level security;
alter table public.fin_api_idempotency enable row level security;
alter table public.fin_api_idempotency force row level security;
alter table public.fin_webhook_endpoints enable row level security;
alter table public.fin_webhook_endpoints force row level security;
alter table public.fin_webhook_events enable row level security;
alter table public.fin_webhook_events force row level security;
alter table public.fin_webhook_deliveries enable row level security;
alter table public.fin_webhook_deliveries force row level security;
revoke all on public.fin_service_accounts, public.fin_service_account_entities, public.fin_api_credentials, public.fin_api_idempotency,
  public.fin_webhook_endpoints, public.fin_webhook_events, public.fin_webhook_deliveries from anon, authenticated;
-- Admin da compradora lê contas, concessões, metadados de credencial (nunca o
-- hash), endpoints (nunca o segredo cifrado) e entregas. Idempotência e
-- eventos brutos ficam só com o service role.
grant select on public.fin_service_accounts, public.fin_service_account_entities, public.fin_webhook_deliveries to authenticated;
grant select (id, organization_id, service_account_id, token_prefix, created_by, created_at, expires_at, revoked_at, revoked_by, last_used_at)
  on public.fin_api_credentials to authenticated;
grant select (id, organization_id, url, description, events, entity_ids, status, consecutive_failures, created_by_user, created_by_service_account,
  created_at, updated_at, disabled_at, disabled_reason) on public.fin_webhook_endpoints to authenticated;
drop policy if exists fin_service_account_read on public.fin_service_accounts;
create policy fin_service_account_read on public.fin_service_accounts for select to authenticated
  using (public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_service_account_entity_read on public.fin_service_account_entities;
create policy fin_service_account_entity_read on public.fin_service_account_entities for select to authenticated
  using (public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_api_credential_read on public.fin_api_credentials;
create policy fin_api_credential_read on public.fin_api_credentials for select to authenticated
  using (public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_webhook_endpoint_read on public.fin_webhook_endpoints;
create policy fin_webhook_endpoint_read on public.fin_webhook_endpoints for select to authenticated
  using (public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_webhook_delivery_read on public.fin_webhook_deliveries;
create policy fin_webhook_delivery_read on public.fin_webhook_deliveries for select to authenticated
  using (public.fin_has_role(organization_id, array['admin']));

-- ------------------------------------------------- 4. administração (sessão humana, admin)
create or replace function public.fin_api_valid_entities(p_org uuid, p_scope text, p_entities uuid[])
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_scope = 'group' then coalesce(cardinality(p_entities), 0) = 0
              when p_scope = 'entities' then coalesce(cardinality(p_entities), 0) between 1 and 50
                and not exists (select 1 from unnest(p_entities) x where not exists (
                      select 1 from public.fin_legal_entities e where e.organization_id = p_org and e.id = x and e.status = 'active'))
              else false end;
$$;

create or replace function public.fin_create_service_account(p_org uuid, p_name text, p_description text, p_scopes text[], p_entity_scope text, p_entities uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; x uuid;
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if p_scopes is null or not (p_scopes <@ public.fin_api_scope_catalog()) or cardinality(p_scopes) = 0
     or not public.fin_api_valid_entities(p_org, coalesce(p_entity_scope, ''), p_entities) then
    raise exception 'invalid service account';
  end if;
  insert into public.fin_service_accounts(organization_id, name, description, scopes, entity_scope, created_by)
    values (p_org, trim(p_name), nullif(trim(coalesce(p_description,'')),''), (select array_agg(distinct s order by s) from unnest(p_scopes) s), p_entity_scope, auth.uid())
    returning id into v_id;
  foreach x in array coalesce(p_entities, '{}'::uuid[]) loop
    insert into public.fin_service_account_entities(organization_id, service_account_id, entity_id, granted_by) values (p_org, v_id, x, auth.uid());
  end loop;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'service_account', v_id, 'service_account_created', auth.uid(), jsonb_build_object('scopes', p_scopes, 'entity_scope', p_entity_scope,
            'entities', coalesce(cardinality(p_entities), 0)));
  return v_id;
exception when check_violation then raise exception 'invalid service account';
end $$;

-- Escopos e entidades de uma conta mudam com trilha; tokens existentes passam
-- a valer com o novo alcance na próxima chamada.
create or replace function public.fin_update_service_account(p_account uuid, p_scopes text[], p_entity_scope text, p_entities uuid[], p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.fin_service_accounts%rowtype; x uuid;
begin
  select * into a from public.fin_service_accounts where id = p_account for update;
  if not found or not public.fin_has_role(a.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if a.status = 'revoked' then raise exception 'service account revoked'; end if;
  if p_scopes is null or cardinality(p_scopes) = 0 or not (p_scopes <@ public.fin_api_scope_catalog())
     or not public.fin_api_valid_entities(a.organization_id, coalesce(p_entity_scope, ''), p_entities) or coalesce(p_status, '') not in ('active','disabled') then
    raise exception 'invalid service account';
  end if;
  update public.fin_service_accounts set scopes = (select array_agg(distinct s order by s) from unnest(p_scopes) s), entity_scope = p_entity_scope,
         status = p_status, updated_at = now() where id = p_account;
  delete from public.fin_service_account_entities where service_account_id = p_account;
  foreach x in array coalesce(p_entities, '{}'::uuid[]) loop
    insert into public.fin_service_account_entities(organization_id, service_account_id, entity_id, granted_by) values (a.organization_id, p_account, x, auth.uid());
  end loop;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (a.organization_id, 'service_account', p_account, 'service_account_updated', auth.uid(),
            jsonb_build_object('scopes', p_scopes, 'entity_scope', p_entity_scope, 'status', p_status, 'entities', coalesce(cardinality(p_entities), 0)));
end $$;

-- Revogar a conta revoga todas as credenciais e desativa os webhooks que ela criou.
create or replace function public.fin_revoke_service_account(p_account uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.fin_service_accounts%rowtype;
begin
  select * into a from public.fin_service_accounts where id = p_account for update;
  if not found or not public.fin_has_role(a.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if a.status = 'revoked' then return; end if;
  update public.fin_service_accounts set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), updated_at = now() where id = p_account;
  update public.fin_api_credentials set revoked_at = now(), revoked_by = auth.uid() where service_account_id = p_account and revoked_at is null;
  update public.fin_webhook_endpoints set status = 'disabled', disabled_at = now(), disabled_reason = 'service_account_revoked', updated_at = now()
   where created_by_service_account = p_account and status = 'active';
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (a.organization_id, 'service_account', p_account, 'service_account_revoked', auth.uid(), '{}'::jsonb);
end $$;

-- O servidor gera o token e envia só o hash e o prefixo.
create or replace function public.fin_issue_api_credential(p_account uuid, p_token_hash text, p_token_prefix text, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.fin_service_accounts%rowtype; v_id uuid;
begin
  select * into a from public.fin_service_accounts where id = p_account for update;
  if not found or not public.fin_has_role(a.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if a.status <> 'active' then raise exception 'service account revoked'; end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '365 days' then raise exception 'invalid credential'; end if;
  if (select count(*) from public.fin_api_credentials where service_account_id = p_account and revoked_at is null and expires_at > now()) >= 2 then
    raise exception 'too many active credentials';
  end if;
  insert into public.fin_api_credentials(organization_id, service_account_id, token_prefix, token_hash, created_by, expires_at)
    values (a.organization_id, p_account, p_token_prefix, p_token_hash, auth.uid(), p_expires_at) returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (a.organization_id, 'service_account', p_account, 'api_credential_issued', auth.uid(), jsonb_build_object('credential_id', v_id, 'prefix', p_token_prefix, 'expires_at', p_expires_at));
  return v_id;
exception
  when check_violation then raise exception 'invalid credential';
  when unique_violation then raise exception 'invalid credential';
end $$;

create or replace function public.fin_revoke_api_credential(p_credential uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.fin_api_credentials%rowtype;
begin
  select * into c from public.fin_api_credentials where id = p_credential for update;
  if not found or not public.fin_has_role(c.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if c.revoked_at is not null then return; end if;
  update public.fin_api_credentials set revoked_at = now(), revoked_by = auth.uid() where id = p_credential;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'service_account', c.service_account_id, 'api_credential_revoked', auth.uid(), jsonb_build_object('credential_id', c.id, 'prefix', c.token_prefix));
end $$;

-- Endpoint de webhook criado por admin humano (interface).
create or replace function public.fin_valid_webhook_url(p_url text)
returns boolean language sql immutable set search_path = '' as $$
  -- Só https público: sem credencial, sem porta diferente de 443, sem IP literal
  -- privado/loopback e sem localhost. A resolução DNS é reconferida na entrega.
  select p_url ~ '^https://[^/@:?#\s]+(:443)?(/[^\s]*)?$'
     and length(p_url) between 12 and 500
     and lower(split_part(split_part(substr(p_url, 9), '/', 1), ':', 1)) !~ '^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.[0-9.]+|10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+|169\.254\.[0-9.]+|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9.]+|\[.*\]|[0-9]+)$';
$$;

create or replace function public.fin_create_webhook_endpoint(p_org uuid, p_url text, p_events text[], p_secret_ciphertext text, p_description text, p_entities uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if not public.fin_valid_webhook_url(coalesce(p_url, '')) or (p_entities is not null and not public.fin_api_valid_entities(p_org, 'entities', p_entities)) then
    raise exception 'invalid webhook';
  end if;
  if (select count(*) from public.fin_webhook_endpoints where organization_id = p_org and status <> 'disabled') >= 10 then raise exception 'too many webhooks'; end if;
  insert into public.fin_webhook_endpoints(organization_id, url, description, events, entity_ids, secret_ciphertext, created_by_user)
    values (p_org, p_url, nullif(trim(coalesce(p_description,'')),''), (select array_agg(distinct e order by e) from unnest(p_events) e), p_entities, p_secret_ciphertext, auth.uid())
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'webhook_endpoint', v_id, 'webhook_endpoint_created', auth.uid(), jsonb_build_object('events', p_events));
  return v_id;
exception when check_violation or not_null_violation then raise exception 'invalid webhook';
end $$;

create or replace function public.fin_set_webhook_status(p_endpoint uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.fin_webhook_endpoints%rowtype;
begin
  select * into e from public.fin_webhook_endpoints where id = p_endpoint for update;
  if not found or not public.fin_has_role(e.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if p_active then
    update public.fin_webhook_endpoints set status = 'active', disabled_at = null, disabled_reason = null, consecutive_failures = 0, updated_at = now() where id = p_endpoint;
  else
    update public.fin_webhook_endpoints set status = 'disabled', disabled_at = coalesce(disabled_at, now()), disabled_reason = 'manual', updated_at = now() where id = p_endpoint;
    update public.fin_webhook_deliveries set status = 'cancelled', lease_token = null, lease_expires_at = null where endpoint_id = p_endpoint and status in ('pending','failed');
  end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (e.organization_id, 'webhook_endpoint', p_endpoint, case when p_active then 'webhook_endpoint_enabled' else 'webhook_endpoint_disabled' end, auth.uid(), '{}'::jsonb);
end $$;

-- Replay manual: nova entrega ligada à original (que continua no histórico).
create or replace function public.fin_replay_webhook_delivery(p_delivery uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.fin_webhook_deliveries%rowtype; v_id uuid;
begin
  select * into d from public.fin_webhook_deliveries where id = p_delivery;
  if not found or not public.fin_has_role(d.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if d.status not in ('succeeded','failed','dead','cancelled') then raise exception 'delivery not replayable'; end if;
  if not exists (select 1 from public.fin_webhook_endpoints e where e.id = d.endpoint_id and e.status = 'active') then raise exception 'webhook disabled'; end if;
  insert into public.fin_webhook_deliveries(organization_id, endpoint_id, event_id, replay_of, requested_by_user)
    values (d.organization_id, d.endpoint_id, d.event_id, d.id, auth.uid()) returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (d.organization_id, 'webhook_endpoint', d.endpoint_id, 'webhook_delivery_replayed', auth.uid(), jsonb_build_object('delivery_id', v_id, 'replay_of', d.id));
  return v_id;
end $$;

-- ------------------------------------------------- 5. autenticação de máquina
-- Contexto de uma credencial válida com o escopo exigido. Toda função
-- fin_api_* começa aqui; sem token válido, nada sai.
create or replace function public.fin_api_context(p_key_hash text, p_scope text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.fin_api_credentials%rowtype; a public.fin_service_accounts%rowtype;
begin
  if coalesce(p_key_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'api unauthorized'; end if;
  select * into c from public.fin_api_credentials where token_hash = p_key_hash;
  if not found or c.revoked_at is not null or c.expires_at <= now() then raise exception 'api unauthorized'; end if;
  select * into a from public.fin_service_accounts where id = c.service_account_id;
  if a.status <> 'active' or not exists (select 1 from public.fin_organizations o where o.id = a.organization_id and o.kind = 'BUYER') then
    raise exception 'api unauthorized';
  end if;
  if p_scope is not null and not (p_scope = any(a.scopes)) then raise exception 'api scope denied'; end if;
  -- Último uso: no máximo uma escrita por minuto por credencial.
  if c.last_used_at is null or c.last_used_at < now() - interval '1 minute' then
    update public.fin_api_credentials set last_used_at = now() where id = c.id;
    update public.fin_service_accounts set last_used_at = now() where id = a.id;
  end if;
  return jsonb_build_object('service_account_id', a.id, 'credential_id', c.id, 'organization_id', a.organization_id, 'scopes', to_jsonb(a.scopes),
    'entity_scope', a.entity_scope,
    'entities', coalesce((select jsonb_agg(g.entity_id) from public.fin_service_account_entities g where g.service_account_id = a.id), '[]'::jsonb));
end $$;

-- Entidade ao alcance da conta: escopo de grupo alcança tudo, inclusive objeto
-- de nível de grupo; escopo restrito alcança só entidade concedida (ou unidade abaixo).
create or replace function public.fin_api_entity_allowed(p_ctx jsonb, p_entity uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_ctx->>'entity_scope' = 'group' or (p_entity is not null and exists (
    select 1 from public.fin_legal_entities e
     where e.organization_id = (p_ctx->>'organization_id')::uuid and e.id = p_entity
       and ((p_ctx->'entities') ? e.id::text or (e.parent_id is not null and (p_ctx->'entities') ? e.parent_id::text))));
$$;

-- Contexto básico para a borda da API (sem dado de negócio): confirma o token.
create or replace function public.fin_api_whoami(p_key_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  v := public.fin_api_context(p_key_hash, null);
  return jsonb_build_object('service_account_id', v->'service_account_id', 'organization_id', v->'organization_id', 'scopes', v->'scopes',
    'entity_scope', v->'entity_scope', 'entities', v->'entities');
end $$;

-- ------------------------------------------------- 6. leitura (keyset, ordem determinística)
create or replace function public.fin_api_list_rfqs(p_key_hash text, p_limit integer default 25, p_after_created timestamptz default null,
  p_after_id uuid default null, p_status text default null, p_entity uuid default null, p_updated_since timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  v := public.fin_api_context(p_key_hash, 'rfqs:read');
  if (p_after_created is null) <> (p_after_id is null) then raise exception 'invalid api query'; end if;
  return coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc, x.id desc) from (
    select r.id, r.product, r.title, r.status, r.revision, r.legal_entity_id, r.response_deadline, r.created_at, r.updated_at,
           (select count(*) from public.fin_proposals p where p.rfq_id = r.id and p.current_version > 0 and p.status in ('submitted','revised')) proposals_count
      from public.fin_rfqs r
     where r.organization_id = (v->>'organization_id')::uuid and public.fin_api_entity_allowed(v, r.legal_entity_id)
       and (p_status is null or r.status = p_status) and (p_entity is null or r.legal_entity_id = p_entity)
       and (p_updated_since is null or r.updated_at >= p_updated_since)
       and (p_after_created is null or (r.created_at, r.id) < (p_after_created, p_after_id))
     order by r.created_at desc, r.id desc limit v_limit + 1) x), '[]'::jsonb);
end $$;

create or replace function public.fin_api_get_rfq(p_key_hash text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; r public.fin_rfqs%rowtype;
begin
  v := public.fin_api_context(p_key_hash, 'rfqs:read');
  select * into r from public.fin_rfqs where id = p_id and organization_id = (v->>'organization_id')::uuid;
  if not found or not public.fin_api_entity_allowed(v, r.legal_entity_id) then raise exception 'api not found'; end if;
  return jsonb_build_object('id', r.id, 'product', r.product, 'title', r.title, 'description', r.description, 'status', r.status, 'revision', r.revision,
    'legal_entity_id', r.legal_entity_id, 'demand', r.demand, 'response_deadline', r.response_deadline, 'owner_id', r.owner_id,
    'created_at', r.created_at, 'updated_at', r.updated_at,
    'proposals', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'provider_id', p.provider_id, 'status', p.status, 'version', p.current_version,
       'submitted_at', pv.submitted_at) order by p.created_at, p.id)
       from public.fin_proposals p left join public.fin_proposal_versions pv on pv.proposal_id = p.id and pv.version = p.current_version
      where p.rfq_id = r.id and p.current_version > 0), '[]'::jsonb),
    'decision', (select jsonb_build_object('id', d.id, 'proposal_id', d.proposal_id, 'decided_at', d.decided_at) from public.fin_decisions d where d.rfq_id = r.id));
end $$;

create or replace function public.fin_api_list_contracts(p_key_hash text, p_limit integer default 25, p_after_created timestamptz default null,
  p_after_id uuid default null, p_status text default null, p_entity uuid default null, p_ends_before date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  v := public.fin_api_context(p_key_hash, 'contracts:read');
  if (p_after_created is null) <> (p_after_id is null) then raise exception 'invalid api query'; end if;
  return coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc, x.id desc) from (
    select c.id, c.provider_id, c.product, c.title, c.currency, c.status, c.legal_entity_id, c.starts_on, c.ends_on, c.renewal_notice_days, c.decision_id, c.created_at, c.updated_at
      from public.fin_contracts c
     where c.organization_id = (v->>'organization_id')::uuid and public.fin_api_entity_allowed(v, c.legal_entity_id)
       and (p_status is null or c.status = p_status) and (p_entity is null or c.legal_entity_id = p_entity)
       and (p_ends_before is null or c.ends_on < p_ends_before)
       and (p_after_created is null or (c.created_at, c.id) < (p_after_created, p_after_id))
     order by c.created_at desc, c.id desc limit v_limit + 1) x), '[]'::jsonb);
end $$;

create or replace function public.fin_api_get_contract(p_key_hash text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; c public.fin_contracts%rowtype;
begin
  v := public.fin_api_context(p_key_hash, 'contracts:read');
  select * into c from public.fin_contracts where id = p_id and organization_id = (v->>'organization_id')::uuid;
  if not found or not public.fin_api_entity_allowed(v, c.legal_entity_id) then raise exception 'api not found'; end if;
  return jsonb_build_object('id', c.id, 'provider_id', c.provider_id, 'product', c.product, 'status', c.status, 'legal_entity_id', c.legal_entity_id,
    'starts_on', c.starts_on, 'ends_on', c.ends_on, 'renewal_notice_days', c.renewal_notice_days, 'decision_id', c.decision_id,
    'created_at', c.created_at, 'updated_at', c.updated_at);
end $$;

-- Provedores são diretório de nível de grupo (como na interface).
create or replace function public.fin_api_list_providers(p_key_hash text, p_limit integer default 25, p_after_name text default null, p_after_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  v := public.fin_api_context(p_key_hash, 'providers:read');
  if (p_after_name is null) <> (p_after_id is null) then raise exception 'invalid api query'; end if;
  return coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.name, x.id) from (
    select p.id, p.name, p.kind, p.status, p.verification_state, p.created_at, p.updated_at
      from public.fin_providers p
     where p.organization_id = (v->>'organization_id')::uuid
       and (p_after_name is null or (p.name, p.id) > (p_after_name, p_after_id))
     order by p.name, p.id limit v_limit + 1) x), '[]'::jsonb);
end $$;

create or replace function public.fin_api_list_facilities(p_key_hash text, p_limit integer default 25, p_after_created timestamptz default null,
  p_after_id uuid default null, p_entity uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  v := public.fin_api_context(p_key_hash, 'portfolio:read');
  if (p_after_created is null) <> (p_after_id is null) then raise exception 'invalid api query'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc) from (
    select f.id, f.provider_id, f.legal_entity_id, f.kind, f.status, f.currency, f.approved_limit, f.maturity_on, f.created_at, f.updated_at
      from public.fin_facilities f
     where f.organization_id = (v->>'organization_id')::uuid and public.fin_api_entity_allowed(v, f.legal_entity_id)
       and (p_entity is null or f.legal_entity_id = p_entity)
       and (p_after_created is null or (f.created_at, f.id) < (p_after_created, p_after_id))
     order by f.created_at desc, f.id desc limit v_limit + 1) x), '[]'::jsonb);
end $$;

create or replace function public.fin_api_list_approvals(p_key_hash text, p_limit integer default 25, p_after_requested timestamptz default null,
  p_after_id uuid default null, p_status text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  v := public.fin_api_context(p_key_hash, 'approvals:read');
  if (p_after_requested is null) <> (p_after_id is null) then raise exception 'invalid api query'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at desc, x.id desc) from (
    select a.id, a.rfq_id, a.proposal_id, a.proposal_version, a.status, a.requested_at, a.resolved_at, a.expires_at,
           (a.policy_snapshot is not null) policy_driven, a.policy_version_ids,
           (select count(*) from public.fin_approval_stages s where s.request_id = a.id) stages_total,
           (select count(*) from public.fin_approval_stages s where s.request_id = a.id and s.status in ('approved','waived')) stages_done
      from public.fin_approval_requests a join public.fin_rfqs r on r.id = a.rfq_id
     where a.organization_id = (v->>'organization_id')::uuid and public.fin_api_entity_allowed(v, r.legal_entity_id)
       and (p_status is null or a.status = p_status)
       and (p_after_requested is null or (a.requested_at, a.id) < (p_after_requested, p_after_id))
     order by a.requested_at desc, a.id desc limit v_limit + 1) x), '[]'::jsonb);
end $$;

-- ------------------------------------------------- 7. escrita idempotente
-- Rascunho de RFQ vindo de ERP/intake: demanda já validada pela allowlist da
-- API; dono é uma pessoa da compradora com papel de gestão e acesso à entidade.
create or replace function public.fin_api_create_rfq(p_key_hash text, p_idempotency_key text, p_fingerprint text, p_payload jsonb, p_correlation text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; s record; v_id uuid; v_org uuid; v_entity uuid; v_owner uuid; v_response jsonb;
begin
  v := public.fin_api_context(p_key_hash, 'rfqs:write');
  if coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9._:-]{8,200}$' or coalesce(p_fingerprint, '') !~ '^[0-9a-f]{64}$' then raise exception 'idempotency key required'; end if;
  -- Serializa a mesma chave (pedidos concorrentes esperam o primeiro).
  perform pg_advisory_xact_lock(hashtextextended((v->>'service_account_id') || ':' || p_idempotency_key, 0));
  select * into s from public.fin_api_idempotency where service_account_id = (v->>'service_account_id')::uuid and idempotency_key = p_idempotency_key and expires_at > now();
  if found then
    if s.request_fingerprint <> p_fingerprint or s.operation <> 'rfqs.create' then raise exception 'idempotency key reuse'; end if;
    return s.response_body || jsonb_build_object('idempotent_replay', true);
  end if;
  delete from public.fin_api_idempotency where service_account_id = (v->>'service_account_id')::uuid and idempotency_key = p_idempotency_key;
  v_org := (v->>'organization_id')::uuid;
  v_entity := nullif(p_payload->>'legal_entity_id', '')::uuid;
  v_owner := nullif(p_payload->>'owner_id', '')::uuid;
  if jsonb_typeof(p_payload) <> 'object' or coalesce(p_payload->>'product', '') not in ('credit','acquiring') or jsonb_typeof(p_payload->'demand') <> 'object'
     or length(trim(coalesce(p_payload->>'title', ''))) not between 3 and 160 or (p_payload->>'title') ~ '[<>]'
     or (p_payload ? 'description' and (length(coalesce(p_payload->>'description', '')) > 4000 or (p_payload->>'description') ~ '[<>]')) then
    raise exception 'invalid api payload';
  end if;
  if not public.fin_api_entity_allowed(v, v_entity) then raise exception 'api entity denied'; end if;
  if v_entity is not null and not exists (select 1 from public.fin_legal_entities e where e.organization_id = v_org and e.id = v_entity and e.status = 'active') then
    raise exception 'api entity denied';
  end if;
  if v_owner is null or not public.fin_approval_member_eligible(v_org, v_entity, v_owner, array['admin','finance_manager'], 'any') then
    raise exception 'invalid api owner';
  end if;
  insert into public.fin_rfqs(organization_id, product, title, description, demand, response_deadline, owner_id, legal_entity_id)
    values (v_org, p_payload->>'product', trim(p_payload->>'title'), nullif(trim(coalesce(p_payload->>'description', '')), ''), p_payload->'demand',
            nullif(p_payload->>'response_deadline', '')::date, v_owner, v_entity)
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_org, 'rfq', v_id, 'rfq_created', null, jsonb_build_object('product', p_payload->>'product', 'source', 'api_v1',
            'service_account_id', v->>'service_account_id', 'correlation_id', left(coalesce(p_correlation, ''), 80)));
  v_response := jsonb_build_object('id', v_id, 'status', 'draft', 'legal_entity_id', v_entity, 'owner_id', v_owner);
  insert into public.fin_api_idempotency(service_account_id, idempotency_key, request_fingerprint, operation, response_status, response_body)
    values ((v->>'service_account_id')::uuid, p_idempotency_key, p_fingerprint, 'rfqs.create', 201, v_response);
  return v_response;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'invalid api payload';
end $$;

-- ------------------------------------------------- 8. webhooks pela API (webhooks:manage)
create or replace function public.fin_api_list_webhooks(p_key_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  v := public.fin_api_context(p_key_hash, 'webhooks:manage');
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'url', e.url, 'description', e.description, 'events', e.events, 'entity_ids', e.entity_ids,
     'status', e.status, 'consecutive_failures', e.consecutive_failures, 'created_at', e.created_at, 'disabled_reason', e.disabled_reason) order by e.created_at, e.id)
     from public.fin_webhook_endpoints e where e.organization_id = (v->>'organization_id')::uuid), '[]'::jsonb);
end $$;

-- Conta de serviço com escopo restrito só cria webhook filtrado às entidades dela.
create or replace function public.fin_api_create_webhook(p_key_hash text, p_url text, p_events text[], p_secret_ciphertext text, p_description text, p_entities uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_id uuid; v_org uuid; x uuid;
begin
  v := public.fin_api_context(p_key_hash, 'webhooks:manage');
  v_org := (v->>'organization_id')::uuid;
  if v->>'entity_scope' = 'entities' then
    if p_entities is null or cardinality(p_entities) = 0 then raise exception 'api entity denied'; end if;
    foreach x in array p_entities loop
      if not public.fin_api_entity_allowed(v, x) then raise exception 'api entity denied'; end if;
    end loop;
  end if;
  if not public.fin_valid_webhook_url(coalesce(p_url, '')) or (p_entities is not null and not public.fin_api_valid_entities(v_org, 'entities', p_entities)) then
    raise exception 'invalid webhook';
  end if;
  if (select count(*) from public.fin_webhook_endpoints where organization_id = v_org and status <> 'disabled') >= 10 then raise exception 'too many webhooks'; end if;
  insert into public.fin_webhook_endpoints(organization_id, url, description, events, entity_ids, secret_ciphertext, created_by_service_account)
    values (v_org, p_url, nullif(trim(coalesce(p_description,'')),''), (select array_agg(distinct e order by e) from unnest(p_events) e), p_entities,
            p_secret_ciphertext, (v->>'service_account_id')::uuid)
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_org, 'webhook_endpoint', v_id, 'webhook_endpoint_created', null, jsonb_build_object('events', p_events, 'service_account_id', v->>'service_account_id'));
  return v_id;
exception when check_violation or not_null_violation then raise exception 'invalid webhook';
end $$;

create or replace function public.fin_api_disable_webhook(p_key_hash text, p_endpoint uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v jsonb; e public.fin_webhook_endpoints%rowtype;
begin
  v := public.fin_api_context(p_key_hash, 'webhooks:manage');
  select * into e from public.fin_webhook_endpoints where id = p_endpoint and organization_id = (v->>'organization_id')::uuid for update;
  if not found then raise exception 'api not found'; end if;
  update public.fin_webhook_endpoints set status = 'disabled', disabled_at = coalesce(disabled_at, now()), disabled_reason = 'manual', updated_at = now() where id = p_endpoint;
  update public.fin_webhook_deliveries set status = 'cancelled', lease_token = null, lease_expires_at = null where endpoint_id = p_endpoint and status in ('pending','failed');
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (e.organization_id, 'webhook_endpoint', p_endpoint, 'webhook_endpoint_disabled', null, jsonb_build_object('service_account_id', v->>'service_account_id'));
end $$;

create or replace function public.fin_api_list_deliveries(p_key_hash text, p_endpoint uuid, p_limit integer default 25, p_after_created timestamptz default null, p_after_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  v := public.fin_api_context(p_key_hash, 'webhooks:manage');
  if not exists (select 1 from public.fin_webhook_endpoints e where e.id = p_endpoint and e.organization_id = (v->>'organization_id')::uuid) then raise exception 'api not found'; end if;
  if (p_after_created is null) <> (p_after_id is null) then raise exception 'invalid api query'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc) from (
    select d.id, d.event_id, w.event_type, d.status, d.attempts, d.next_attempt_at, d.last_attempt_at, d.last_status_code, d.last_error_code, d.delivered_at, d.replay_of, d.created_at
      from public.fin_webhook_deliveries d join public.fin_webhook_events w on w.id = d.event_id
     where d.endpoint_id = p_endpoint and (p_after_created is null or (d.created_at, d.id) < (p_after_created, p_after_id))
     order by d.created_at desc, d.id desc limit v_limit + 1) x), '[]'::jsonb);
end $$;

create or replace function public.fin_api_replay_delivery(p_key_hash text, p_delivery uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v jsonb; d public.fin_webhook_deliveries%rowtype; v_id uuid;
begin
  v := public.fin_api_context(p_key_hash, 'webhooks:manage');
  select * into d from public.fin_webhook_deliveries where id = p_delivery and organization_id = (v->>'organization_id')::uuid;
  if not found then raise exception 'api not found'; end if;
  if d.status not in ('succeeded','failed','dead','cancelled') then raise exception 'delivery not replayable'; end if;
  if not exists (select 1 from public.fin_webhook_endpoints e where e.id = d.endpoint_id and e.status = 'active') then raise exception 'webhook disabled'; end if;
  insert into public.fin_webhook_deliveries(organization_id, endpoint_id, event_id, replay_of, requested_by_service_account)
    values (d.organization_id, d.endpoint_id, d.event_id, d.id, (v->>'service_account_id')::uuid) returning id into v_id;
  return v_id;
end $$;

-- ------------------------------------------------- 9. outbox: fin_events -> webhook
-- Payload mínimo: tipo, objeto, id, estado e horário. Nenhum termo financeiro,
-- nome de pessoa ou texto livre. O consumidor busca detalhe pela API com escopo.
create or replace function public.fin_webhook_capture()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type text; v_object text; v_data jsonb; v_event uuid; v_status text; v_entity uuid;
begin
  if not exists (select 1 from public.fin_webhook_endpoints e where e.organization_id = new.organization_id and e.status = 'active') then return new; end if;
  v_type := case
    when new.event_type in ('rfq_created','rfq_created_from_contract') then 'rfq.created'
    when new.entity_type = 'rfq' and new.event_type ~ '^rfq_(draft|open|collecting|comparing|decided|contracted|cancelled|closed)$' then 'rfq.status_changed'
    when new.event_type in ('proposal_submitted','proposal_revised') then 'proposal.submitted'
    when new.event_type = 'decision_recorded' then 'decision.recorded'
    when new.event_type = 'approval_requested' then 'approval.required'
    when new.event_type in ('approval_completed','approval_rejected','approval_changes_requested','approval_expired') then 'approval.completed'
    when new.event_type = 'approval_approved' and exists (select 1 from public.fin_approval_requests a where a.id = (new.metadata->>'request_id')::uuid
         and a.status = 'approved' and a.policy_snapshot is null) then 'approval.completed'
    when new.event_type in ('contract_registered','contract_imported') then 'contract.created'
    when new.event_type in ('renewal_milestone_reached','renewal_task_created') then 'contract.renewal_due'
    else null end;
  if v_type is null then return new; end if;
  v_object := case when v_type like 'rfq.%' or v_type = 'decision.recorded' then 'rfq' when v_type like 'proposal.%' then 'proposal'
                   when v_type like 'approval.%' then 'approval' else 'contract' end;
  v_entity := new.legal_entity_id;
  v_data := case v_object
    when 'rfq' then jsonb_build_object('rfq_id', new.entity_id, 'status', (select r.status from public.fin_rfqs r where r.id = new.entity_id))
    when 'proposal' then (select jsonb_build_object('proposal_id', p.id, 'rfq_id', p.rfq_id, 'version', p.current_version, 'revision', new.event_type = 'proposal_revised')
                            from public.fin_proposals p where p.id = new.entity_id)
    when 'approval' then (select jsonb_build_object('approval_id', a.id, 'rfq_id', a.rfq_id, 'status', a.status, 'policy_driven', a.policy_snapshot is not null)
                            from public.fin_approval_requests a where a.id = (new.metadata->>'request_id')::uuid)
    else (select jsonb_build_object('contract_id', c.id, 'status', c.status, 'ends_on', c.ends_on) from public.fin_contracts c where c.id = new.entity_id) end;
  if v_data is null then return new; end if;
  insert into public.fin_webhook_events(organization_id, legal_entity_id, event_type, source_event_id, payload, occurred_at)
    values (new.organization_id, v_entity, v_type, new.id, jsonb_build_object('object', v_object, 'data', v_data), new.happened_at)
    on conflict (source_event_id) do nothing
    returning id into v_event;
  if v_event is null then return new; end if;
  insert into public.fin_webhook_deliveries(organization_id, endpoint_id, event_id)
    select new.organization_id, e.id, v_event from public.fin_webhook_endpoints e
     where e.organization_id = new.organization_id and e.status = 'active' and v_type = any(e.events)
       and (e.entity_ids is null or (v_entity is not null and (v_entity = any(e.entity_ids)
            or exists (select 1 from public.fin_legal_entities le where le.id = v_entity and le.parent_id = any(e.entity_ids)))))
  on conflict do nothing;
  return new;
exception when others then
  -- Modo degradado: integração nunca derruba a ação de negócio que gerou o
  -- evento. O aviso fica no log do banco; o evento de origem continua em
  -- fin_events e pode ser reprocessado (docs/FINANCIAL_PUBLIC_API.md).
  raise warning 'fin_webhook_capture skipped event %: %', new.id, sqlstate;
  return new;
end $$;
drop trigger if exists fin_webhook_capture on public.fin_events;
create trigger fin_webhook_capture after insert on public.fin_events for each row execute function public.fin_webhook_capture();

-- ------------------------------------------------- 10. worker de entrega (service role)
-- Reivindica entregas vencidas com lease (fencing por token): só quem tem o
-- token atual conclui. Lease expirado volta para a fila.
create or replace function public.fin_webhook_claim(p_limit integer default 20, p_lease_seconds integer default 60, p_org uuid default null)
returns table(delivery_id uuid, lease_token uuid, endpoint_id uuid, url text, secret_ciphertext text, event_id uuid, event_type text,
              organization_id uuid, legal_entity_id uuid, occurred_at timestamptz, payload jsonb, attempt integer)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  update public.fin_webhook_deliveries set status = 'failed', lease_token = null, lease_expires_at = null, last_error_code = 'lease_expired'
   where status = 'delivering' and lease_expires_at < now();
  return query
  with due as (
    select d.id from public.fin_webhook_deliveries d join public.fin_webhook_endpoints e on e.id = d.endpoint_id and e.status = 'active'
     where d.status in ('pending','failed') and d.next_attempt_at <= now() and (p_org is null or d.organization_id = p_org)
     order by d.next_attempt_at, d.id limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update of d skip locked
  ), claimed as (
    update public.fin_webhook_deliveries d set status = 'delivering', lease_token = gen_random_uuid(),
           lease_expires_at = now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 60), 10), 300)), attempts = d.attempts + 1, last_attempt_at = now()
      from due where d.id = due.id
    returning d.id, d.lease_token, d.endpoint_id, d.event_id, d.attempts
  )
  select c.id, c.lease_token, c.endpoint_id, e.url, e.secret_ciphertext, c.event_id, w.event_type, w.organization_id, w.legal_entity_id, w.occurred_at, w.payload, c.attempts
    from claimed c join public.fin_webhook_endpoints e on e.id = c.endpoint_id join public.fin_webhook_events w on w.id = c.event_id;
end $$;

-- Backoff: 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h; após a 8ª falha, dead-letter.
-- 20 falhas seguidas desativam o endpoint (disabled_failing) e cancelam a fila.
create or replace function public.fin_webhook_complete(p_delivery uuid, p_lease uuid, p_success boolean, p_status_code integer, p_error_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare d public.fin_webhook_deliveries%rowtype; v_status text; v_delays integer[] := array[60, 300, 1800, 7200, 21600, 43200, 86400];
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  select * into d from public.fin_webhook_deliveries where id = p_delivery for update;
  if not found or d.status <> 'delivering' or d.lease_token is distinct from p_lease then raise exception 'stale lease'; end if;
  if p_success then
    update public.fin_webhook_deliveries set status = 'succeeded', lease_token = null, lease_expires_at = null, last_status_code = p_status_code,
           last_error_code = null, delivered_at = now() where id = p_delivery;
    update public.fin_webhook_endpoints set consecutive_failures = 0 where id = d.endpoint_id and consecutive_failures <> 0;
    return 'succeeded';
  end if;
  v_status := case when d.attempts >= 8 then 'dead' else 'failed' end;
  update public.fin_webhook_deliveries set status = v_status, lease_token = null, lease_expires_at = null,
         last_status_code = case when p_status_code between 100 and 599 then p_status_code end,
         last_error_code = case when coalesce(p_error_code, '') ~ '^[a-z0-9_]{1,60}$' then p_error_code else 'delivery_failed' end,
         next_attempt_at = now() + make_interval(secs => v_delays[least(d.attempts, 7)])
   where id = p_delivery;
  update public.fin_webhook_endpoints set consecutive_failures = consecutive_failures + 1, updated_at = now() where id = d.endpoint_id;
  if (select consecutive_failures from public.fin_webhook_endpoints where id = d.endpoint_id) >= 20 then
    update public.fin_webhook_endpoints set status = 'disabled_failing', disabled_at = now(), disabled_reason = 'consecutive_failures', updated_at = now()
     where id = d.endpoint_id and status = 'active';
    update public.fin_webhook_deliveries set status = 'cancelled' where endpoint_id = d.endpoint_id and status in ('pending','failed');
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (d.organization_id, 'webhook_endpoint', d.endpoint_id, 'webhook_endpoint_auto_disabled', null, '{}'::jsonb);
  end if;
  return v_status;
end $$;

-- Limpeza de idempotência vencida (chamada pelo job).
create or replace function public.fin_api_purge_idempotency()
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  delete from public.fin_api_idempotency where expires_at < now();
  get diagnostics v = row_count;
  return v;
end $$;

alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check (job in ('renewals','contract_milestones','approval_deadlines','webhooks'));

-- ------------------------------------------------- 11. grants
revoke all on function public.fin_api_scope_catalog(), public.fin_webhook_event_catalog(), public.fin_api_valid_entities(uuid, text, uuid[]),
  public.fin_valid_webhook_url(text), public.fin_api_context(text, text), public.fin_api_entity_allowed(jsonb, uuid), public.fin_webhook_capture()
  from public, anon, authenticated;
-- Superfície de máquina: só o service role (servidor da API), sempre com o hash do token.
revoke all on function public.fin_api_whoami(text), public.fin_api_list_rfqs(text, integer, timestamptz, uuid, text, uuid, timestamptz),
  public.fin_api_get_rfq(text, uuid), public.fin_api_list_contracts(text, integer, timestamptz, uuid, text, uuid, date), public.fin_api_get_contract(text, uuid),
  public.fin_api_list_providers(text, integer, text, uuid), public.fin_api_list_facilities(text, integer, timestamptz, uuid, uuid),
  public.fin_api_list_approvals(text, integer, timestamptz, uuid, text), public.fin_api_create_rfq(text, text, text, jsonb, text),
  public.fin_api_list_webhooks(text), public.fin_api_create_webhook(text, text, text[], text, text, uuid[]), public.fin_api_disable_webhook(text, uuid),
  public.fin_api_list_deliveries(text, uuid, integer, timestamptz, uuid), public.fin_api_replay_delivery(text, uuid),
  public.fin_webhook_claim(integer, integer, uuid), public.fin_webhook_complete(uuid, uuid, boolean, integer, text), public.fin_api_purge_idempotency()
  from public, anon, authenticated;
grant execute on function public.fin_api_whoami(text), public.fin_api_list_rfqs(text, integer, timestamptz, uuid, text, uuid, timestamptz),
  public.fin_api_get_rfq(text, uuid), public.fin_api_list_contracts(text, integer, timestamptz, uuid, text, uuid, date), public.fin_api_get_contract(text, uuid),
  public.fin_api_list_providers(text, integer, text, uuid), public.fin_api_list_facilities(text, integer, timestamptz, uuid, uuid),
  public.fin_api_list_approvals(text, integer, timestamptz, uuid, text), public.fin_api_create_rfq(text, text, text, jsonb, text),
  public.fin_api_list_webhooks(text), public.fin_api_create_webhook(text, text, text[], text, text, uuid[]), public.fin_api_disable_webhook(text, uuid),
  public.fin_api_list_deliveries(text, uuid, integer, timestamptz, uuid), public.fin_api_replay_delivery(text, uuid),
  public.fin_webhook_claim(integer, integer, uuid), public.fin_webhook_complete(uuid, uuid, boolean, integer, text), public.fin_api_purge_idempotency()
  to service_role;
-- Administração humana (interface): admin da compradora.
revoke all on function public.fin_create_service_account(uuid, text, text, text[], text, uuid[]), public.fin_update_service_account(uuid, text[], text, uuid[], text),
  public.fin_revoke_service_account(uuid), public.fin_issue_api_credential(uuid, text, text, timestamptz), public.fin_revoke_api_credential(uuid),
  public.fin_create_webhook_endpoint(uuid, text, text[], text, text, uuid[]), public.fin_set_webhook_status(uuid, boolean), public.fin_replay_webhook_delivery(uuid)
  from public, anon;
grant execute on function public.fin_create_service_account(uuid, text, text, text[], text, uuid[]), public.fin_update_service_account(uuid, text[], text, uuid[], text),
  public.fin_revoke_service_account(uuid), public.fin_issue_api_credential(uuid, text, text, timestamptz), public.fin_revoke_api_credential(uuid),
  public.fin_create_webhook_endpoint(uuid, text, text[], text, text, uuid[]), public.fin_set_webhook_status(uuid, boolean), public.fin_replay_webhook_delivery(uuid)
  to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-public-api-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

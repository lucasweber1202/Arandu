-- Enterprise IAM / SSO foundation (guideline §33; addendum v2.1 F.1 e H.1 item 10;
-- IMPLEMENTATION_MATRIX P0.9). Aditivo e idempotente.
-- Rollback: docs/rollback/supabase-financial-sso.rollback.sql
--
-- Arquitetura (docs/FINANCIAL_SSO.md):
--   * O broker de identidade é o Supabase Auth (SAML 2.0 via Supabase SSO;
--     PKCE). Ele valida a asserção do IdP e emite a sessão que o RLS usa.
--   * Este schema é a camada de política do Arandu POR CIMA do broker:
--     conexões por organização, domínios com verificação DNS, descoberta por
--     domínio, mapeamento para membro existente (sem JIT nesta fase), sessão
--     máxima e revogação, exigência de SSO para o domínio e trilha de tentativas.
--   * Tudo falha fechado: conexão inativa, domínio não verificado ou de outra
--     organização, membro inexistente/bloqueado ou sessão anterior à revogação
--     recusam o acesso com um código de motivo estável.
--   * Nenhum SSO é declarado operacional sem IdP real conectado; o broker
--     `mock` existe só para testes e nunca passa do estado `testing`.

create table if not exists public.fin_sso_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  protocol text not null check (protocol in ('saml','oidc')),
  broker text not null default 'supabase' check (broker in ('supabase','mock')),
  display_name text not null check (length(trim(display_name)) between 2 and 120 and display_name !~ '[<>]'),
  provider_ref text check (provider_ref is null or provider_ref ~ '^[A-Za-z0-9:._-]{3,120}$'),
  issuer text check (issuer is null or (length(issuer) between 8 and 300 and issuer ~ '^https://[^\s<>]+$')),
  audience text check (audience is null or (length(audience) between 3 and 200 and audience !~ '[<>\s]')),
  metadata_url text check (metadata_url is null or (length(metadata_url) between 12 and 500 and metadata_url ~ '^https://[^\s<>]+$')),
  attribute_mapping jsonb not null default '{"email":"email"}'::jsonb check (jsonb_typeof(attribute_mapping) = 'object' and length(attribute_mapping::text) <= 1000),
  status text not null default 'draft' check (status in ('draft','testing','active','disabled')),
  enforce_sso boolean not null default false,
  mfa_policy text not null default 'arandu_totp' check (mfa_policy in ('arandu_totp')),
  max_session_hours integer not null default 12 check (max_session_hours between 1 and 168),
  sessions_valid_after timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_by uuid references auth.users(id),
  activated_at timestamptz,
  unique (organization_id, id),
  check (broker <> 'mock' or status in ('draft','testing','disabled')),
  check (not enforce_sso or status = 'active')
);
create index if not exists fin_sso_connections_org on public.fin_sso_connections(organization_id, status);

create table if not exists public.fin_sso_domains (
  domain text primary key check (domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' and length(domain) <= 253),
  organization_id uuid not null references public.fin_organizations(id),
  connection_id uuid,
  status text not null default 'pending' check (status in ('pending','verified','revoked')),
  verification_token_hash text not null check (verification_token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  foreign key (organization_id, connection_id) references public.fin_sso_connections(organization_id, id),
  check ((status = 'verified') = (verified_at is not null))
);
create index if not exists fin_sso_domains_org on public.fin_sso_domains(organization_id);

-- Trilha de tentativas: sem e-mail em claro (só domínio e hash do sujeito).
create table if not exists public.fin_sso_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.fin_organizations(id),
  connection_id uuid references public.fin_sso_connections(id),
  outcome text not null check (outcome in ('success','denied')),
  reason_code text not null check (reason_code ~ '^[a-z_]{2,60}$'),
  email_domain text check (email_domain is null or length(email_domain) <= 253),
  subject_hash text check (subject_hash is null or subject_hash ~ '^[0-9a-f]{64}$'),
  correlation_id text check (correlation_id is null or correlation_id ~ '^[A-Za-z0-9._:-]{8,80}$'),
  happened_at timestamptz not null default now()
);
create index if not exists fin_sso_events_org on public.fin_sso_events(organization_id, happened_at desc);
create index if not exists fin_sso_events_connection on public.fin_sso_events(connection_id, outcome, happened_at desc);

alter table public.fin_sso_connections enable row level security;
alter table public.fin_sso_connections force row level security;
alter table public.fin_sso_domains enable row level security;
alter table public.fin_sso_domains force row level security;
alter table public.fin_sso_events enable row level security;
alter table public.fin_sso_events force row level security;
revoke all on public.fin_sso_connections, public.fin_sso_domains, public.fin_sso_events from anon, authenticated;
grant select on public.fin_sso_connections, public.fin_sso_events to authenticated;
grant select (domain, organization_id, connection_id, status, created_by, created_at, verified_at) on public.fin_sso_domains to authenticated;
drop policy if exists fin_sso_connection_read on public.fin_sso_connections;
create policy fin_sso_connection_read on public.fin_sso_connections for select to authenticated using (public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_sso_domain_read on public.fin_sso_domains;
create policy fin_sso_domain_read on public.fin_sso_domains for select to authenticated using (public.fin_has_role(organization_id, array['admin']));
drop policy if exists fin_sso_event_read on public.fin_sso_events;
create policy fin_sso_event_read on public.fin_sso_events for select to authenticated
  using (organization_id is not null and public.fin_has_role(organization_id, array['admin']));

-- ------------------------------------------------- administração (admin da compradora)
create or replace function public.fin_sso_save_connection(
  p_org uuid, p_connection uuid, p_protocol text, p_broker text, p_display_name text, p_provider_ref text, p_issuer text,
  p_audience text, p_metadata_url text, p_mapping jsonb, p_max_session_hours integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; c public.fin_sso_connections%rowtype;
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  if p_mapping is not null and (jsonb_typeof(p_mapping) <> 'object' or not (p_mapping ? 'email')
     or exists (select 1 from jsonb_object_keys(p_mapping) k where k not in ('email','name','groups'))
     or exists (select 1 from jsonb_each(p_mapping) e where jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') not between 1 and 120)) then
    raise exception 'invalid sso connection';
  end if;
  if p_connection is null then
    insert into public.fin_sso_connections(organization_id, protocol, broker, display_name, provider_ref, issuer, audience, metadata_url, attribute_mapping, max_session_hours, created_by)
      values (p_org, p_protocol, coalesce(p_broker, 'supabase'), trim(p_display_name), nullif(trim(coalesce(p_provider_ref,'')),''), nullif(trim(coalesce(p_issuer,'')),''),
              nullif(trim(coalesce(p_audience,'')),''), nullif(trim(coalesce(p_metadata_url,'')),''), coalesce(p_mapping, '{"email":"email"}'::jsonb), coalesce(p_max_session_hours, 12), auth.uid())
      returning id into v_id;
  else
    select * into c from public.fin_sso_connections where id = p_connection and organization_id = p_org for update;
    if not found then raise exception 'forbidden'; end if;
    -- Conexão ativa não muda em produção: desative, ajuste, teste e reative.
    if c.status = 'active' then raise exception 'sso connection active'; end if;
    update public.fin_sso_connections set protocol = p_protocol, broker = coalesce(p_broker, broker), display_name = trim(p_display_name),
           provider_ref = nullif(trim(coalesce(p_provider_ref,'')),''), issuer = nullif(trim(coalesce(p_issuer,'')),''), audience = nullif(trim(coalesce(p_audience,'')),''),
           metadata_url = nullif(trim(coalesce(p_metadata_url,'')),''), attribute_mapping = coalesce(p_mapping, attribute_mapping),
           max_session_hours = coalesce(p_max_session_hours, max_session_hours), status = case when status = 'testing' then 'draft' else status end, updated_at = now()
     where id = p_connection returning id into v_id;
  end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'sso_connection', v_id, 'sso_connection_saved', auth.uid(), jsonb_build_object('protocol', p_protocol, 'broker', coalesce(p_broker, 'supabase')));
  return v_id;
exception when check_violation or not_null_violation then raise exception 'invalid sso connection';
end $$;

-- O servidor gera o token de verificação; o banco guarda só o hash.
create or replace function public.fin_sso_claim_domain(p_org uuid, p_domain text, p_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.fin_sso_domains%rowtype; v_domain text := lower(trim(coalesce(p_domain, '')));
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  -- Domínios de e-mail pessoal nunca viram SSO de empresa.
  if v_domain in ('gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.com.br','icloud.com','me.com','proton.me','protonmail.com','uol.com.br','bol.com.br','terra.com.br') then
    raise exception 'invalid sso domain';
  end if;
  select * into d from public.fin_sso_domains where domain = v_domain for update;
  if found and d.organization_id <> p_org then raise exception 'sso domain unavailable'; end if;
  if found and d.status = 'verified' then raise exception 'sso domain already verified'; end if;
  insert into public.fin_sso_domains(domain, organization_id, verification_token_hash, created_by)
    values (v_domain, p_org, p_token_hash, auth.uid())
  on conflict (domain) do update set verification_token_hash = excluded.verification_token_hash, status = 'pending', verified_at = null, created_by = auth.uid(), created_at = now();
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'organization', p_org, 'sso_domain_claimed', auth.uid(), jsonb_build_object('domain', v_domain));
exception when check_violation then raise exception 'invalid sso domain';
end $$;

-- Chamado pelo servidor (service role) depois de ler o TXT no DNS e conferir o hash.
create or replace function public.fin_sso_mark_domain_verified(p_domain text, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.fin_sso_domains%rowtype;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  select * into d from public.fin_sso_domains where domain = lower(trim(coalesce(p_domain, ''))) for update;
  if not found or d.status <> 'pending' or d.verification_token_hash <> coalesce(p_token_hash, '') then raise exception 'sso domain not verified'; end if;
  update public.fin_sso_domains set status = 'verified', verified_at = now() where domain = d.domain;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (d.organization_id, 'organization', d.organization_id, 'sso_domain_verified', null, jsonb_build_object('domain', d.domain));
  return d.organization_id;
end $$;

create or replace function public.fin_sso_link_domain(p_domain text, p_connection uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.fin_sso_domains%rowtype;
begin
  select * into d from public.fin_sso_domains where domain = lower(trim(coalesce(p_domain, ''))) for update;
  if not found or not public.fin_has_role(d.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if p_connection is not null and not exists (select 1 from public.fin_sso_connections c where c.id = p_connection and c.organization_id = d.organization_id) then
    raise exception 'forbidden';
  end if;
  update public.fin_sso_domains set connection_id = p_connection where domain = d.domain;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (d.organization_id, 'organization', d.organization_id, 'sso_domain_linked', auth.uid(), jsonb_build_object('domain', d.domain, 'connection_id', p_connection));
end $$;

-- Estados: draft -> testing (login SSO permitido, sem exigência) -> active
-- (pode exigir SSO) -> disabled. Ativar exige configuração completa, domínio
-- verificado e ao menos um login SSO bem-sucedido em teste (evita trancar a
-- organização com IdP mal configurado).
create or replace function public.fin_sso_set_status(p_connection uuid, p_status text, p_enforce boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.fin_sso_connections%rowtype;
begin
  select * into c from public.fin_sso_connections where id = p_connection for update;
  if not found or not public.fin_has_role(c.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  if p_status not in ('draft','testing','active','disabled') then raise exception 'invalid sso connection'; end if;
  if p_status in ('testing','active') then
    if c.provider_ref is null or c.metadata_url is null or (c.protocol = 'oidc' and (c.issuer is null or c.audience is null)) then raise exception 'sso connection incomplete'; end if;
    if not exists (select 1 from public.fin_sso_domains d where d.connection_id = c.id and d.status = 'verified') then raise exception 'sso domain not verified'; end if;
  end if;
  if p_status = 'active' then
    if c.broker = 'mock' then raise exception 'sso mock broker'; end if;
    if not exists (select 1 from public.fin_sso_events e where e.connection_id = c.id and e.outcome = 'success') then raise exception 'sso test login required'; end if;
  end if;
  if coalesce(p_enforce, false) and p_status <> 'active' then raise exception 'invalid sso connection'; end if;
  update public.fin_sso_connections set status = p_status, enforce_sso = coalesce(p_enforce, false) and p_status = 'active', updated_at = now(),
         activated_by = case when p_status = 'active' then auth.uid() else activated_by end, activated_at = case when p_status = 'active' then now() else activated_at end
   where id = p_connection;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'sso_connection', c.id, 'sso_connection_status', auth.uid(), jsonb_build_object('status', p_status, 'enforce', coalesce(p_enforce, false)));
end $$;

-- Revoga toda sessão SSO emitida antes de agora para esta conexão.
create or replace function public.fin_sso_revoke_sessions(p_connection uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.fin_sso_connections%rowtype;
begin
  select * into c from public.fin_sso_connections where id = p_connection for update;
  if not found or not public.fin_has_role(c.organization_id, array['admin']) then raise exception 'forbidden'; end if;
  update public.fin_sso_connections set sessions_valid_after = now(), updated_at = now() where id = p_connection;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'sso_connection', c.id, 'sso_sessions_revoked', auth.uid(), '{}'::jsonb);
end $$;

-- ------------------------------------------------- borda de login (service role)
-- Descoberta por domínio: só domínio verificado ligado a conexão em teste/ativa.
create or replace function public.fin_sso_discover(p_domain text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  select c.id, c.protocol, c.broker, c.provider_ref, c.status, c.enforce_sso into r
    from public.fin_sso_domains d join public.fin_sso_connections c on c.id = d.connection_id
   where d.domain = lower(trim(coalesce(p_domain, ''))) and d.status = 'verified' and c.status in ('testing','active');
  if not found then return null; end if;
  return jsonb_build_object('connection_id', r.id, 'protocol', r.protocol, 'broker', r.broker, 'provider_ref', r.provider_ref, 'status', r.status, 'enforce', r.enforce_sso);
end $$;

-- Login por senha permitido? Falso quando o domínio exige SSO.
create or replace function public.fin_sso_password_allowed(p_domain text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.fin_sso_domains d join public.fin_sso_connections c on c.id = d.connection_id
                      where d.domain = lower(trim(coalesce(p_domain, ''))) and d.status = 'verified' and c.status = 'active' and c.enforce_sso);
$$;

-- Autorização pós-login: a identidade validada pelo broker vira acesso só se
-- conexão, domínio, organização, membro e sessão passarem. Motivos estáveis.
create or replace function public.fin_sso_authorize(p_connection uuid, p_user uuid, p_email text, p_provider_ref text, p_issued_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.fin_sso_connections%rowtype; v_domain text; d public.fin_sso_domains%rowtype; m record;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  select * into c from public.fin_sso_connections where id = p_connection;
  if not found or c.status not in ('testing','active') then raise exception 'sso connection inactive'; end if;
  if c.provider_ref is distinct from p_provider_ref then raise exception 'sso provider mismatch'; end if;
  v_domain := lower(split_part(coalesce(p_email, ''), '@', 2));
  select * into d from public.fin_sso_domains where domain = v_domain;
  if not found or d.status <> 'verified' or d.connection_id is distinct from c.id then raise exception 'sso domain mismatch'; end if;
  if d.organization_id <> c.organization_id then raise exception 'sso org mismatch'; end if;
  if p_issued_at is null or p_issued_at < now() - make_interval(hours => c.max_session_hours) then raise exception 'sso session expired'; end if;
  if c.sessions_valid_after is not null and p_issued_at < c.sessions_valid_after then raise exception 'sso session revoked'; end if;
  if exists (select 1 from auth.users u where u.id = p_user and u.banned_until is not null and u.banned_until > now()) then raise exception 'sso member disabled'; end if;
  select role, entity_scope into m from public.fin_members where organization_id = c.organization_id and user_id = p_user;
  if not found then raise exception 'sso member not found'; end if;
  return jsonb_build_object('organization_id', c.organization_id, 'role', m.role, 'entity_scope', m.entity_scope, 'mfa_policy', c.mfa_policy,
    'max_session_hours', c.max_session_hours, 'status', c.status);
end $$;

-- Sessão SSO ainda válida? Consultado no refresh do token: revogação e
-- desativação passam a valer no próximo refresh (≤ validade do JWT).
create or replace function public.fin_sso_session_valid(p_connection uuid, p_user uuid, p_issued_at timestamptz)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare c public.fin_sso_connections%rowtype;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  select * into c from public.fin_sso_connections where id = p_connection;
  return found and c.status in ('testing','active') and p_issued_at is not null
     and p_issued_at >= now() - make_interval(hours => c.max_session_hours)
     and (c.sessions_valid_after is null or p_issued_at >= c.sessions_valid_after)
     and exists (select 1 from public.fin_members m where m.organization_id = c.organization_id and m.user_id = p_user)
     and not exists (select 1 from auth.users u where u.id = p_user and u.banned_until is not null and u.banned_until > now());
end $$;

create or replace function public.fin_record_sso_event(p_connection uuid, p_outcome text, p_reason text, p_email_domain text, p_subject_hash text, p_correlation text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  insert into public.fin_sso_events(organization_id, connection_id, outcome, reason_code, email_domain, subject_hash, correlation_id)
    values ((select organization_id from public.fin_sso_connections where id = p_connection), p_connection, p_outcome, p_reason,
            nullif(lower(left(coalesce(p_email_domain, ''), 253)), ''), p_subject_hash, p_correlation);
end $$;

revoke all on function public.fin_sso_discover(text), public.fin_sso_password_allowed(text), public.fin_sso_authorize(uuid, uuid, text, text, timestamptz),
  public.fin_sso_session_valid(uuid, uuid, timestamptz), public.fin_record_sso_event(uuid, text, text, text, text, text), public.fin_sso_mark_domain_verified(text, text)
  from public, anon, authenticated;
grant execute on function public.fin_sso_discover(text), public.fin_sso_password_allowed(text), public.fin_sso_authorize(uuid, uuid, text, text, timestamptz),
  public.fin_sso_session_valid(uuid, uuid, timestamptz), public.fin_record_sso_event(uuid, text, text, text, text, text), public.fin_sso_mark_domain_verified(text, text)
  to service_role;
revoke all on function public.fin_sso_save_connection(uuid, uuid, text, text, text, text, text, text, text, jsonb, integer), public.fin_sso_claim_domain(uuid, text, text),
  public.fin_sso_link_domain(text, uuid), public.fin_sso_set_status(uuid, text, boolean), public.fin_sso_revoke_sessions(uuid) from public, anon;
grant execute on function public.fin_sso_save_connection(uuid, uuid, text, text, text, text, text, text, text, jsonb, integer), public.fin_sso_claim_domain(uuid, text, text),
  public.fin_sso_link_domain(text, uuid), public.fin_sso_set_status(uuid, text, boolean), public.fin_sso_revoke_sessions(uuid) to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-sso-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

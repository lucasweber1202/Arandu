-- DW-01: workspaces isolados por visitante da Demo canônica
-- (docs/demo/VISITOR_ISOLATION.md).
--
-- Cada workspace é uma Vitta Foods completa, montada pelo seed real
-- (scripts/demo/seed.mjs com ARANDU_DEMO_WORKSPACE) e com contas sintéticas
-- próprias. O visitante reivindica um workspace pronto; nada é clonado por SQL.
--
-- Fronteiras:
--   * Tabela sem policies e sem grant para anon/authenticated: só a service role
--     do backend da Demo lê e escreve. Nenhum dado pessoal: e-mails .example das
--     personas sintéticas, hash do token de reivindicação e datas.
--   * Funções de ciclo de vida são SECURITY INVOKER, executáveis só por
--     service_role, e recusam rodar fora de um banco marcado como demonstração
--     (fin_settings.deployment_environment = 'demo').
--   * O gatilho de quota é SECURITY DEFINER porque roda na escrita do usuário
--     autenticado e precisa ler esta tabela privada; só lê, recebe apenas NEW e
--     fixa search_path. Em banco sem workspace (Production) é um índice vazio.
-- Aditiva e idempotente.
begin;

create table if not exists public.fin_demo_workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-f0-9]{10}$'),
  baseline_version text not null check (length(baseline_version) between 1 and 40),
  status text not null default 'provisioning'
    check (status in ('provisioning', 'ready', 'claimed', 'expired', 'cleaning', 'failed')),
  buyer_organization_id uuid,
  provider_organization_ids uuid[] not null default '{}',
  user_ids uuid[] not null default '{}',
  personas jsonb not null default '{}'::jsonb check (jsonb_typeof(personas) = 'object' and length(personas::text) <= 4000),
  claim_token_hash text check (claim_token_hash is null or claim_token_hash ~ '^[a-f0-9]{64}$'),
  quotas jsonb not null default '{"rfqs": 40, "documents": 40, "invites": 80, "organizations": 1}'::jsonb
    check (jsonb_typeof(quotas) = 'object'),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  claimed_at timestamptz,
  last_used_at timestamptz,
  idle_expires_at timestamptz,
  expires_at timestamptz,
  cleanup_attempts integer not null default 0 check (cleanup_attempts between 0 and 100),
  last_error text check (last_error is null or length(last_error) <= 500),
  check (status <> 'claimed' or (claim_token_hash is not null and expires_at is not null and idle_expires_at is not null))
);
create index if not exists fin_demo_workspaces_ready on public.fin_demo_workspaces (ready_at) where status = 'ready';
create index if not exists fin_demo_workspaces_claimed on public.fin_demo_workspaces (expires_at) where status = 'claimed';
create index if not exists fin_demo_workspaces_buyer on public.fin_demo_workspaces (buyer_organization_id);
create index if not exists fin_demo_workspaces_users on public.fin_demo_workspaces using gin (user_ids);

alter table public.fin_demo_workspaces enable row level security;
revoke all on table public.fin_demo_workspaces from public, anon, authenticated;
grant select, insert, update, delete on table public.fin_demo_workspaces to service_role;

-- Trava de ambiente: nada de ciclo de vida de workspace fora da demonstração.
create or replace function public.fin_demo_require_environment()
returns void language plpgsql stable set search_path = '' as $$
begin
  if coalesce((select value from public.fin_settings where key = 'deployment_environment'), '') <> 'demo' then
    raise exception 'demo workspaces unavailable outside demo';
  end if;
end $$;

-- Reivindica um workspace pronto de forma atômica. Antes, vence os que
-- passaram da validade (ociosa ou absoluta) para que não contem no teto.
create or replace function public.fin_demo_workspace_claim(p_token_hash text, p_idle_minutes integer, p_lifetime_minutes integer, p_max_active integer)
returns setof public.fin_demo_workspaces language plpgsql set search_path = '' as $$
declare v_id uuid; v_active integer;
begin
  perform public.fin_demo_require_environment();
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
     or p_idle_minutes is null or p_idle_minutes not between 5 and 1440
     or p_lifetime_minutes is null or p_lifetime_minutes not between p_idle_minutes and 2880
     or p_max_active is null or p_max_active not between 1 and 500 then
    raise exception 'invalid demo workspace claim';
  end if;
  -- Serializa reivindicações concorrentes só no teto de ativos.
  perform pg_advisory_xact_lock(hashtext('fin_demo_workspace_claim'));
  update public.fin_demo_workspaces set status = 'expired'
    where status = 'claimed' and (expires_at <= now() or idle_expires_at <= now());
  select count(*) into v_active from public.fin_demo_workspaces where status = 'claimed';
  if v_active >= p_max_active then return; end if;
  select id into v_id from public.fin_demo_workspaces where status = 'ready'
    order by ready_at, id limit 1 for update skip locked;
  if v_id is null then return; end if;
  return query update public.fin_demo_workspaces set status = 'claimed', claim_token_hash = p_token_hash,
      claimed_at = now(), last_used_at = now(),
      expires_at = now() + make_interval(mins => p_lifetime_minutes),
      idle_expires_at = least(now() + make_interval(mins => p_idle_minutes), now() + make_interval(mins => p_lifetime_minutes))
    where id = v_id returning *;
end $$;

-- Retoma o workspace do visitante: só com o token certo, ativo e dentro da validade.
create or replace function public.fin_demo_workspace_resume(p_id uuid, p_token_hash text, p_idle_minutes integer)
returns setof public.fin_demo_workspaces language plpgsql set search_path = '' as $$
begin
  perform public.fin_demo_require_environment();
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_idle_minutes is null or p_idle_minutes not between 5 and 1440 then
    raise exception 'invalid demo workspace resume';
  end if;
  return query update public.fin_demo_workspaces set last_used_at = now(),
      idle_expires_at = least(now() + make_interval(mins => p_idle_minutes), expires_at)
    where id = p_id and status = 'claimed' and claim_token_hash = p_token_hash
      and expires_at > now() and idle_expires_at > now()
    returning *;
end $$;

-- A conta autenticada pertence a um workspace que pode operar? Reivindicado e
-- dentro da validade, ou em montagem pelo seed (contas com senha derivada no
-- servidor, que nenhum visitante recebe). Pronto, vencido, em limpeza, falho ou
-- inexistente: false — a sessão cai mesmo com JWT válido.
create or replace function public.fin_demo_workspace_active(p_slug text)
returns boolean language plpgsql stable set search_path = '' as $$
begin
  perform public.fin_demo_require_environment();
  return exists (select 1 from public.fin_demo_workspaces where slug = p_slug and (status = 'provisioning'
    or (status = 'claimed' and expires_at > now() and idle_expires_at > now())));
end $$;

revoke all on function public.fin_demo_require_environment() from public, anon, authenticated;
revoke all on function public.fin_demo_workspace_claim(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.fin_demo_workspace_resume(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.fin_demo_workspace_active(text) from public, anon, authenticated;
grant execute on function public.fin_demo_require_environment() to service_role;
grant execute on function public.fin_demo_workspace_claim(text, integer, integer, integer) to service_role;
grant execute on function public.fin_demo_workspace_resume(uuid, text, integer) to service_role;
grant execute on function public.fin_demo_workspace_active(text) to service_role;

-- Quotas por workspace reivindicado, aplicadas no banco (não na interface).
create or replace function public.fin_demo_quota_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare w public.fin_demo_workspaces%rowtype; v_used integer; v_limit integer;
begin
  if tg_table_name = 'fin_organizations' then
    select * into w from public.fin_demo_workspaces where status = 'claimed' and new.created_by = any(user_ids) limit 1;
    if w.id is null then return new; end if;
    select count(*) into v_used from public.fin_organizations o where o.created_by = any(w.user_ids);
    v_limit := 1 + coalesce(array_length(w.provider_organization_ids, 1), 0) + coalesce((w.quotas->>'organizations')::integer, 0);
  else
    -- Cada tabela lê só a própria coluna: NEW de fin_rfqs não tem buyer_organization_id.
    if tg_table_name = 'fin_rfq_invites' then
      select * into w from public.fin_demo_workspaces where status = 'claimed' and buyer_organization_id = new.buyer_organization_id limit 1;
    else
      select * into w from public.fin_demo_workspaces where status = 'claimed' and buyer_organization_id = new.organization_id limit 1;
    end if;
    if w.id is null then return new; end if;
    if tg_table_name = 'fin_rfqs' then
      select count(*) into v_used from public.fin_rfqs where organization_id = w.buyer_organization_id;
      v_limit := coalesce((w.quotas->>'rfqs')::integer, 0);
    elsif tg_table_name = 'fin_private_documents' then
      select count(*) into v_used from public.fin_private_documents where organization_id = w.buyer_organization_id;
      v_limit := coalesce((w.quotas->>'documents')::integer, 0);
    else
      select count(*) into v_used from public.fin_rfq_invites where buyer_organization_id = w.buyer_organization_id;
      v_limit := coalesce((w.quotas->>'invites')::integer, 0);
    end if;
  end if;
  if v_used >= v_limit then raise exception 'demo workspace quota exceeded'; end if;
  return new;
end $$;
revoke all on function public.fin_demo_quota_guard() from public, anon, authenticated;

drop trigger if exists fin_demo_quota_rfqs on public.fin_rfqs;
create trigger fin_demo_quota_rfqs before insert on public.fin_rfqs for each row execute function public.fin_demo_quota_guard();
drop trigger if exists fin_demo_quota_documents on public.fin_private_documents;
create trigger fin_demo_quota_documents before insert on public.fin_private_documents for each row execute function public.fin_demo_quota_guard();
drop trigger if exists fin_demo_quota_invites on public.fin_rfq_invites;
create trigger fin_demo_quota_invites before insert on public.fin_rfq_invites for each row execute function public.fin_demo_quota_guard();
drop trigger if exists fin_demo_quota_organizations on public.fin_organizations;
create trigger fin_demo_quota_organizations before insert on public.fin_organizations for each row execute function public.fin_demo_quota_guard();

insert into public.fin_settings(key, value) values ('schema_version', 'financial-demo-workspaces-1')
  on conflict (key) do update set value = excluded.value, updated_at = now();
commit;

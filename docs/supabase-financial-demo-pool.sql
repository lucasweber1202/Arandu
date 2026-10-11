-- DW-02: quota atômica por workspace e lease do controlador do pool da Demo.
--
-- 1. fin_demo_quota_guard contava antes de inserir sem serializar: três
--    transações concorrentes com quota 1 gravaram 3 RFQs (reproduzido em
--    Postgres 16, 11/10/2026). Agora trava a linha do workspace antes de
--    contar; só escritas do mesmo workspace reivindicado esperam umas pelas
--    outras. Fora de workspace (Production) nada muda.
-- 2. fin_demo_pool_lease/release: um único controlador do pool por vez
--    (scripts/demo/workspaces.mjs maintain), com validade para não travar o
--    pool se um executor morrer. Só service_role, só em banco demo.
-- Aditiva e idempotente.
begin;

create or replace function public.fin_demo_quota_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare w public.fin_demo_workspaces%rowtype; v_used integer; v_limit integer;
begin
  if tg_table_name = 'fin_organizations' then
    select * into w from public.fin_demo_workspaces where status = 'claimed' and new.created_by = any(user_ids) limit 1;
    if w.id is null then return new; end if;
    -- Serializa as escritas do MESMO workspace: sem isto, transações concorrentes
    -- contam o mesmo total e ultrapassam a quota (reproduzido em 11/10/2026: quota 1, 3 RFQs).
    perform 1 from public.fin_demo_workspaces where id = w.id for update;
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
    -- Serializa as escritas do MESMO workspace: sem isto, transações concorrentes
    -- contam o mesmo total e ultrapassam a quota (reproduzido em 11/10/2026: quota 1, 3 RFQs).
    perform 1 from public.fin_demo_workspaces where id = w.id for update;
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

create table if not exists public.fin_demo_pool_leases (
  name text primary key check (name = 'pool'),
  holder text not null check (holder ~ '^[a-z0-9-]{8,64}$'),
  expires_at timestamptz not null,
  acquired_at timestamptz not null default now()
);
alter table public.fin_demo_pool_leases enable row level security;
revoke all on table public.fin_demo_pool_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.fin_demo_pool_leases to service_role;

-- Adquire (ou renova, se for o mesmo dono) o lease do controlador. Devolve false
-- se outro executor detém um lease válido.
create or replace function public.fin_demo_pool_lease(p_holder text, p_seconds integer)
returns boolean language plpgsql set search_path = '' as $$
declare v_ok boolean;
begin
  perform public.fin_demo_require_environment();
  if p_holder is null or p_holder !~ '^[a-z0-9-]{8,64}$' or p_seconds is null or p_seconds not between 60 and 7200 then
    raise exception 'invalid demo pool lease';
  end if;
  insert into public.fin_demo_pool_leases(name, holder, expires_at) values ('pool', p_holder, now() + make_interval(secs => p_seconds))
  on conflict (name) do update set holder = excluded.holder, expires_at = excluded.expires_at, acquired_at = now()
    where public.fin_demo_pool_leases.holder = excluded.holder or public.fin_demo_pool_leases.expires_at <= now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

create or replace function public.fin_demo_pool_release(p_holder text)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.fin_demo_require_environment();
  delete from public.fin_demo_pool_leases where name = 'pool' and holder = p_holder;
end $$;

revoke all on function public.fin_demo_pool_lease(text, integer) from public, anon, authenticated;
revoke all on function public.fin_demo_pool_release(text) from public, anon, authenticated;
grant execute on function public.fin_demo_pool_lease(text, integer) to service_role;
grant execute on function public.fin_demo_pool_release(text) to service_role;

insert into public.fin_settings(key, value) values ('schema_version', 'financial-demo-pool-1')
  on conflict (key) do update set value = excluded.value, updated_at = now();
commit;
